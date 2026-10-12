"""
Aught2 Pickleball — Club Membership Request Service

Encapsulates application workflow for player membership requests:
- Submission & duplicate validation
- Status transitions (pending -> approved | rejected | withdrawn)
- Atomic ClubPlayerMembership activation on approval
- Multi-tenant staff permissions and self-approval prevention
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.club import Club
from app.models.club_membership_request import (
    ClubMembershipRequest,
    MembershipRequestStatus,
)
from app.models.club_player_membership import (
    ClubPlayerMembership,
    PlayerMembershipStatus,
)
from app.models.player_profile import PlayerProfile
from app.models.user import User
from app.schemas.club_membership_request import MembershipRequestResponse


class ClubMembershipRequestService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _build_response(self, req: ClubMembershipRequest) -> MembershipRequestResponse:
        # Load user and club if not loaded
        club = req.club
        if not club:
            club = (await self.db.execute(select(Club).where(Club.id == req.club_id))).scalar_one()

        user = req.user
        if not user:
            user = (await self.db.execute(select(User).where(User.id == req.user_id))).scalar_one()

        # Load player profile if available
        prof_stmt = select(PlayerProfile).where(PlayerProfile.user_id == req.user_id)
        prof_res = await self.db.execute(prof_stmt)
        prof = prof_res.scalars().first()

        return MembershipRequestResponse(
            id=req.id,
            club_id=req.club_id,
            club_name=club.name,
            club_slug=club.slug,
            club_logo_url=club.logo_url,
            user_id=req.user_id,
            user_email=user.email,
            user_full_name=user.full_name,
            player_display_name=prof.display_name if prof else user.full_name,
            player_skill_rating=prof.skill_rating if prof else None,
            player_photo_url=prof.profile_image_url if prof else None,
            status=req.status.value,
            status_label=req.status.display_label,
            message=req.message,
            rejection_reason=req.rejection_reason,
            reviewed_by_id=req.reviewed_by_id,
            reviewed_at=req.reviewed_at,
            created_at=req.created_at,
            updated_at=req.updated_at,
        )

    async def create_request(
        self,
        club_id: UUID,
        user_id: UUID,
        message: str | None = None,
    ) -> MembershipRequestResponse:
        """
        Player submits a membership request for a club.
        """
        # 1. Verify club exists and is active
        club_stmt = select(Club).where(Club.id == club_id, Club.is_active.is_(True))
        club = (await self.db.execute(club_stmt)).scalars().first()
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found or inactive",
            )

        # 2. Check if user already has an active player membership in this club
        mem_stmt = select(ClubPlayerMembership).where(
            ClubPlayerMembership.club_id == club_id,
            ClubPlayerMembership.user_id == user_id,
            ClubPlayerMembership.status == PlayerMembershipStatus.ACTIVE,
        )
        if (await self.db.execute(mem_stmt)).scalars().first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You are already an active player member of this club",
            )

        # 3. Check for existing pending request
        pending_stmt = select(ClubMembershipRequest).where(
            ClubMembershipRequest.club_id == club_id,
            ClubMembershipRequest.user_id == user_id,
            ClubMembershipRequest.status == MembershipRequestStatus.PENDING,
        )
        if (await self.db.execute(pending_stmt)).scalars().first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You already have a pending membership request for this club",
            )

        # 4. Create new request
        req = ClubMembershipRequest(
            club_id=club_id,
            user_id=user_id,
            status=MembershipRequestStatus.PENDING,
            message=message.strip() if message else None,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        self.db.add(req)
        await self.db.commit()
        await self.db.refresh(req)

        try:
            from app.services.notification_service import NotificationService
            req_user = (await self.db.execute(select(User).where(User.id == user_id))).scalars().first()
            user_label = req_user.full_name or "A player" if req_user else "A player"
            await NotificationService(self.db).notify_club_staff(
                club_id=club_id,
                category="membership",
                title="New Membership Request",
                message=f"{user_label} submitted a membership request to join {club.name}.",
                data={
                    "resource_type": "membership_request",
                    "resource_id": str(req.id),
                    "idempotency_key": f"mem_req_created_{req.id}",
                    "action_url": "/(club)/memberships",
                },
            )
            await self.db.commit()
        except Exception:
            pass

        return await self._build_response(req)

    async def list_user_requests(self, user_id: UUID) -> list[MembershipRequestResponse]:
        """
        List all requests submitted by the current player.
        """
        stmt = (
            select(ClubMembershipRequest)
            .where(ClubMembershipRequest.user_id == user_id)
            .order_by(ClubMembershipRequest.created_at.desc())
        )
        result = await self.db.execute(stmt)
        requests = result.scalars().all()
        return [await self._build_response(r) for r in requests]

    async def get_user_request_for_club(
        self, club_id: UUID, user_id: UUID
    ) -> MembershipRequestResponse | None:
        """
        Get the latest request for a specific club and user.
        """
        stmt = (
            select(ClubMembershipRequest)
            .where(
                ClubMembershipRequest.club_id == club_id,
                ClubMembershipRequest.user_id == user_id,
            )
            .order_by(ClubMembershipRequest.created_at.desc())
        )
        result = await self.db.execute(stmt)
        req = result.scalars().first()
        if not req:
            return None
        return await self._build_response(req)

    async def withdraw_request(
        self, request_id: UUID, user_id: UUID
    ) -> MembershipRequestResponse:
        """
        Player withdraws their own pending membership request.
        """
        stmt = select(ClubMembershipRequest).where(ClubMembershipRequest.id == request_id)
        req = (await self.db.execute(stmt)).scalars().first()
        if not req:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Membership request not found",
            )

        if req.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only withdraw your own membership request",
            )

        if req.status != MembershipRequestStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only pending requests can be withdrawn",
            )

        req.status = MembershipRequestStatus.WITHDRAWN
        req.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(req)

        return await self._build_response(req)

    async def list_club_requests(
        self, club_id: UUID, status_filter: str | None = None
    ) -> list[MembershipRequestResponse]:
        """
        Authorized club staff view membership requests for their club.
        """
        stmt = select(ClubMembershipRequest).where(ClubMembershipRequest.club_id == club_id)

        if status_filter:
            try:
                enum_val = MembershipRequestStatus(status_filter.lower())
                stmt = stmt.where(ClubMembershipRequest.status == enum_val)
            except ValueError:
                pass

        stmt = stmt.order_by(ClubMembershipRequest.created_at.desc())
        result = await self.db.execute(stmt)
        requests = result.scalars().all()
        return [await self._build_response(r) for r in requests]

    async def approve_request(
        self,
        club_id: UUID,
        request_id: UUID,
        reviewer_user_id: UUID,
    ) -> MembershipRequestResponse:
        """
        Approve request and transactionally create/activate ClubPlayerMembership.
        """
        stmt = select(ClubMembershipRequest).where(
            ClubMembershipRequest.id == request_id,
            ClubMembershipRequest.club_id == club_id,
        )
        req = (await self.db.execute(stmt)).scalars().first()
        if not req:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Membership request not found in this club",
            )

        if req.status != MembershipRequestStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot approve request: status is '{req.status.value}', must be 'pending'",
            )

        if reviewer_user_id == req.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Staff members cannot approve their own membership requests",
            )

        now = datetime.now(timezone.utc)
        req.status = MembershipRequestStatus.APPROVED
        req.reviewed_by_id = reviewer_user_id
        req.reviewed_at = now
        req.updated_at = now

        # Create or activate player membership
        mem_stmt = select(ClubPlayerMembership).where(
            ClubPlayerMembership.club_id == club_id,
            ClubPlayerMembership.user_id == req.user_id,
        )
        membership = (await self.db.execute(mem_stmt)).scalars().first()
        if membership:
            membership.status = PlayerMembershipStatus.ACTIVE
            membership.joined_at = now
            membership.updated_at = now
        else:
            membership = ClubPlayerMembership(
                user_id=req.user_id,
                club_id=club_id,
                status=PlayerMembershipStatus.ACTIVE,
                joined_at=now,
                created_at=now,
                updated_at=now,
            )
            self.db.add(membership)

        await self.db.commit()
        await self.db.refresh(req)

        try:
            from app.services.notification_service import NotificationService
            club_stmt = select(Club).where(Club.id == club_id)
            club_obj = (await self.db.execute(club_stmt)).scalars().first()
            club_name = club_obj.name if club_obj else "the club"
            await NotificationService(self.db).create_notification(
                user_id=req.user_id,
                club_id=club_id,
                category="membership",
                title="Membership Request Approved",
                message=f"Your membership request for {club_name} has been approved! Welcome to the club.",
                data={
                    "resource_type": "membership_request",
                    "resource_id": str(req.id),
                    "status": "approved",
                    "idempotency_key": f"mem_req_approved_{req.id}",
                    "action_url": "/(player)/membership",
                },
                mandatory=True,
            )
            await self.db.commit()
        except Exception:
            pass

        return await self._build_response(req)

    async def reject_request(
        self,
        club_id: UUID,
        request_id: UUID,
        reviewer_user_id: UUID,
        reason: str | None = None,
    ) -> MembershipRequestResponse:
        """
        Reject a pending membership request with optional reason.
        """
        stmt = select(ClubMembershipRequest).where(
            ClubMembershipRequest.id == request_id,
            ClubMembershipRequest.club_id == club_id,
        )
        req = (await self.db.execute(stmt)).scalars().first()
        if not req:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Membership request not found in this club",
            )

        if req.status != MembershipRequestStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot reject request: status is '{req.status.value}', must be 'pending'",
            )

        now = datetime.now(timezone.utc)
        req.status = MembershipRequestStatus.REJECTED
        req.rejection_reason = reason.strip() if reason else None
        req.reviewed_by_id = reviewer_user_id
        req.reviewed_at = now
        req.updated_at = now

        await self.db.commit()
        await self.db.refresh(req)

        try:
            from app.services.notification_service import NotificationService
            club_stmt = select(Club).where(Club.id == club_id)
            club_obj = (await self.db.execute(club_stmt)).scalars().first()
            club_name = club_obj.name if club_obj else "the club"
            reason_part = f" Reason: {reason.strip()}" if reason and reason.strip() else ""
            await NotificationService(self.db).create_notification(
                user_id=req.user_id,
                club_id=club_id,
                category="membership",
                title="Membership Request Declined",
                message=f"Your membership request for {club_name} was declined.{reason_part}",
                data={
                    "resource_type": "membership_request",
                    "resource_id": str(req.id),
                    "status": "rejected",
                    "idempotency_key": f"mem_req_rejected_{req.id}",
                    "action_url": "/(player)/membership",
                },
                mandatory=True,
            )
            await self.db.commit()
        except Exception:
            pass

        return await self._build_response(req)
