"""
Authentication service — business logic for login and token operations.
Separates auth logic from HTTP concerns.
"""
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)
from app.models.club_membership import ClubMembership
from app.repositories.club_membership_repository import ClubMembershipRepository
from app.repositories.player_profile_repository import PlayerProfileRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import AuthResponse, TokenRefreshResponse
from app.schemas.club_membership import MembershipInfo
from app.schemas.user import UserResponse


def _build_membership_info(membership: ClubMembership) -> MembershipInfo:
    return MembershipInfo(
        membership_id=membership.id,
        club_id=membership.club_id,
        club_name=membership.club.name,
        club_slug=membership.club.slug,
        role=membership.role,
        role_label=membership.role.display_label,
        is_active=membership.is_active,
    )


class AuthService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.user_repo = UserRepository(db)
        self.membership_repo = ClubMembershipRepository(db)
        self.player_profile_repo = PlayerProfileRepository(db)

    async def login_club(self, email: str, password: str) -> AuthResponse:
        """
        Authenticate a club staff user by email and password.
        Role is strictly determined by backend ClubMembership.
        Rejects non-staff users with 403 'You don't have access to Club Management.'
        Rejects disabled accounts with 403 'Your account has been disabled. Please contact the Club Owner.'
        """
        user = await self.user_repo.get_by_email(email)
        if not user or not verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account has been disabled. Please contact the Club Owner.",
            )

        all_memberships = await self.membership_repo.get_user_memberships(
            user.id, include_inactive=True
        )
        if not all_memberships:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to Club Management.",
            )

        active_memberships = [m for m in all_memberships if m.is_active]
        if not active_memberships:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account has been disabled. Please contact the Club Owner.",
            )

        user_id_str = str(user.id)
        return AuthResponse(
            access_token=create_access_token(user_id_str),
            refresh_token=create_refresh_token(user_id_str),
            token_type="bearer",
            user=UserResponse.model_validate(user),
            memberships=[_build_membership_info(m) for m in active_memberships],
        )

    async def login_player(self, email: str, password: str) -> AuthResponse:
        """
        Authenticate a player account by email and password.
        Player accounts enter the player portal and never get club management access.
        """
        user = await self.user_repo.get_by_email(email)
        if not user or not verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account has been disabled. Please contact the Club Owner.",
            )

        user_id_str = str(user.id)
        return AuthResponse(
            access_token=create_access_token(user_id_str),
            refresh_token=create_refresh_token(user_id_str),
            token_type="bearer",
            user=UserResponse.model_validate(user),
            memberships=[],  # Players have no club staff access
        )

    async def register_player(
        self, email: str, password: str, full_name: str
    ) -> AuthResponse:
        """
        Self-register a new player account.
        Creates User + PlayerProfile. No club management permissions granted.
        """
        existing = await self.user_repo.get_by_email(email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An account with this email already exists.",
            )

        hashed = hash_password(password)
        user = await self.user_repo.create(
            email=email,
            hashed_password=hashed,
            full_name=full_name,
        )
        await self.player_profile_repo.create(
            user_id=user.id,
            display_name=full_name,
        )
        await self.db.commit()
        await self.db.refresh(user)

        user_id_str = str(user.id)
        return AuthResponse(
            access_token=create_access_token(user_id_str),
            refresh_token=create_refresh_token(user_id_str),
            token_type="bearer",
            user=UserResponse.model_validate(user),
            memberships=[],
        )

    async def login(self, email: str, password: str) -> AuthResponse:
        """
        Authenticate a user by email and password.
        Returns tokens + user info + club memberships.
        The client NEVER provides a role — backend is authoritative.
        """
        user = await self.user_repo.get_by_email(email)
        if not user or not verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is disabled",
            )

        user_id_str = str(user.id)
        memberships = await self.membership_repo.get_user_memberships(user.id)

        return AuthResponse(
            access_token=create_access_token(user_id_str),
            refresh_token=create_refresh_token(user_id_str),
            token_type="bearer",
            user=UserResponse.model_validate(user),
            memberships=[_build_membership_info(m) for m in memberships],
        )

    async def refresh_access_token(self, refresh_token: str) -> TokenRefreshResponse:
        """Exchange a valid refresh token for a new access token."""
        from jose import JWTError
        try:
            user_id = decode_refresh_token(refresh_token)
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        from uuid import UUID
        user = await self.user_repo.get_by_id(UUID(user_id))
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive",
            )

        return TokenRefreshResponse(
            access_token=create_access_token(user_id),
            token_type="bearer",
        )

    async def get_current_user_profile(self, user_id: str) -> AuthResponse:
        """Return current user's full profile with memberships."""
        from uuid import UUID
        user = await self.user_repo.get_by_id(UUID(user_id))
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )
        memberships = await self.membership_repo.get_user_memberships(user.id)
        return AuthResponse(
            access_token="",  # Not returned in profile — only on login/refresh
            refresh_token="",
            token_type="bearer",
            user=UserResponse.model_validate(user),
            memberships=[_build_membership_info(m) for m in memberships],
        )
