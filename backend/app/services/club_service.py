"""
Club service — business logic for club operations and membership management.
Enforces owner safety rules, tenant isolation, and membership constraints.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club_membership import ClubMembership, ClubRole
from app.repositories.club_membership_repository import ClubMembershipRepository
from app.repositories.club_repository import ClubRepository
from app.repositories.user_repository import UserRepository
from app.schemas.club import ClubResponse, UserClubResponse
from app.schemas.club_membership import (
    ClubMembershipDetailResponse,
    MemberResponse,
)


def _build_member_response(m: ClubMembership) -> MemberResponse:
    return MemberResponse(
        id=m.id,
        user_id=m.user_id,
        club_id=m.club_id,
        role=m.role,
        role_label=m.role.display_label,
        is_active=m.is_active,
        user_email=m.user.email if m.user else "",
        user_full_name=m.user.full_name if m.user else None,
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


class ClubService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.club_repo = ClubRepository(db)
        self.membership_repo = ClubMembershipRepository(db)
        self.user_repo = UserRepository(db)

    async def list_user_clubs(self, user_id: UUID) -> list[UserClubResponse]:
        """
        Return clubs the authenticated user belongs to.
        Includes membership ID, role, display label, and active status.
        Never returns clubs the user does not belong to.
        """
        memberships = await self.membership_repo.get_user_memberships(
            user_id, include_inactive=True
        )
        return [
            UserClubResponse(
                id=m.club.id,
                name=m.club.name,
                slug=m.club.slug,
                description=m.club.description,
                is_active=m.club.is_active,
                membership_id=m.id,
                role=m.role.value,
                role_label=m.role.display_label,
                membership_is_active=m.is_active,
                created_at=m.club.created_at,
                updated_at=m.club.updated_at,
            )
            for m in memberships
        ]

    async def get_club(self, user_id: UUID, club_id: UUID) -> ClubResponse:
        """
        Return the authenticated user's accessible club.
        Enforces:
        - Club must exist (404 if not found).
        - User must belong to the club (404/403: do not expose another user's club).
        - Membership must be active (403 if inactive).
        """
        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )

        membership = await self.membership_repo.get_by_user_and_club(
            user_id=user_id,
            club_id=club_id,
            include_inactive=True,
        )
        if not membership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of this club",
            )

        if not membership.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your membership in this club is inactive",
            )

        return ClubResponse.model_validate(club)

    async def get_membership(
        self, user_id: UUID, club_id: UUID
    ) -> ClubMembershipDetailResponse:
        """
        Return the authenticated user's membership for a club.
        Ensures a user can only retrieve their own membership.
        """
        membership = await self.membership_repo.get_by_user_and_club(
            user_id=user_id,
            club_id=club_id,
            include_inactive=True,
        )
        if not membership:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Membership not found for this club",
            )

        if not membership.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Membership is inactive",
            )

        return ClubMembershipDetailResponse(
            id=membership.id,
            user_id=membership.user_id,
            club_id=membership.club_id,
            role=membership.role,
            role_label=membership.role.display_label,
            is_active=membership.is_active,
            created_at=membership.created_at,
            updated_at=membership.updated_at,
        )

    async def list_members(self, club_id: UUID) -> list[MemberResponse]:
        """Return all members of the specified club."""
        memberships = await self.membership_repo.get_club_members(
            club_id=club_id, include_inactive=True
        )
        return [_build_member_response(m) for m in memberships]

    async def add_member(
        self,
        club_id: UUID,
        email: str,
        role: ClubRole,
        full_name: str | None = None,
        temporary_password: str | None = None,
    ) -> MemberResponse:
        """
        Add or invite a staff member to the club with a designated role.
        Validates:
        - If user does not exist: creates User with full_name, email, and hashed password.
        - If user exists: updates full_name/password if provided.
        - If previously deactivated in club: reactivates with new role.
        - User is not already an active member of this club.
        """
        user = await self.user_repo.get_by_email(email)
        if not user:
            import secrets
            pwd = (
                temporary_password
                if temporary_password and temporary_password.strip()
                else f"Staff@{secrets.token_hex(4)}!"
            )
            hashed = hash_password(pwd)
            user = await self.user_repo.create(
                email=email,
                hashed_password=hashed,
                full_name=full_name or email.split("@")[0].capitalize(),
            )
        else:
            if full_name and not user.full_name:
                user.full_name = full_name
            if temporary_password and temporary_password.strip():
                user.hashed_password = hash_password(temporary_password)
            user.is_active = True

        existing = await self.membership_repo.get_by_user_and_club(
            user_id=user.id,
            club_id=club_id,
            include_inactive=True,
        )
        if existing and existing.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is already an active member of this club",
            )

        if existing and not existing.is_active:
            # Reactivate membership and update role
            updated = await self.membership_repo.update(
                existing, role=role, is_active=True
            )
            await self.db.commit()
            return _build_member_response(updated)

        new_membership = await self.membership_repo.create(
            user_id=user.id,
            club_id=club_id,
            role=role,
            is_active=True,
        )
        await self.db.commit()
        return _build_member_response(new_membership)

    async def update_member(
        self,
        club_id: UUID,
        membership_id: UUID,
        role: ClubRole | None = None,
        is_active: bool | None = None,
    ) -> MemberResponse:
        """
        Update member role and/or is_active status.
        Enforces Owner Safety Rules:
        - A club must always have at least one active owner.
        - Cannot demote the final active owner.
        - Cannot deactivate the final active owner.
        """
        target = await self.membership_repo.get_by_id(membership_id)
        if not target or target.club_id != club_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Member not found in this club",
            )

        # Owner Safety Check
        if target.role == ClubRole.CLUB_OWNER and target.is_active:
            is_changing_role = role is not None and role != ClubRole.CLUB_OWNER
            is_deactivating = is_active is not None and is_active is False
            if is_changing_role or is_deactivating:
                active_owners = await self.membership_repo.count_active_owners(club_id)
                if active_owners <= 1:
                    detail = (
                        "Cannot change role: club must have at least one active owner"
                        if is_changing_role
                        else "Cannot deactivate the final active owner of the club"
                    )
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=detail,
                    )

        updated = await self.membership_repo.update(
            target, role=role, is_active=is_active
        )
        await self.db.commit()
        return _build_member_response(updated)

    async def deactivate_member(
        self, club_id: UUID, membership_id: UUID
    ) -> MemberResponse:
        """
        Soft-deactivate a member (is_active = False).
        Preserves historical relationships without hard deletion.
        Enforces Owner Safety Rules:
        - Cannot deactivate the final active owner.
        """
        target = await self.membership_repo.get_by_id(membership_id)
        if not target or target.club_id != club_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Member not found in this club",
            )

        if target.role == ClubRole.CLUB_OWNER and target.is_active:
            active_owners = await self.membership_repo.count_active_owners(club_id)
            if active_owners <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot deactivate the final active owner of the club",
                )

        deactivated = await self.membership_repo.deactivate(target)
        await self.db.commit()
        return _build_member_response(deactivated)
