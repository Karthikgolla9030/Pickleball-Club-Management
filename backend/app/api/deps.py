"""
FastAPI dependencies for authentication and authorization.

NEVER trust the frontend for role or permission info.
All authorization decisions are made here against the database.

Usage in routes:
    @router.get("/tournaments")
    async def list_tournaments(
        current_user: User = Depends(get_current_user),
        _: None = Depends(require_permission(Permission.MANAGE_TOURNAMENTS)),
        db: AsyncSession = Depends(get_db),
    ):
        ...
"""
from __future__ import annotations

from uuid import UUID

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.club_membership import ClubMembership, ClubRole
from app.models.user import User
from app.permissions import Permission, has_permission
from app.repositories.club_membership_repository import ClubMembershipRepository
from app.repositories.club_repository import ClubRepository
from app.repositories.user_repository import UserRepository

_bearer_scheme = HTTPBearer(auto_error=False)

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)
_FORBIDDEN = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="Insufficient permissions",
)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Dependency: extract and validate the access token from the Authorization header.
    Returns the authenticated User or raises 401.
    """
    if not credentials:
        raise _UNAUTHORIZED

    try:
        user_id = decode_access_token(credentials.credentials)
    except JWTError:
        raise _UNAUTHORIZED

    user = await UserRepository(db).get_by_id(UUID(user_id))
    if not user or not user.is_active:
        raise _UNAUTHORIZED

    return user


async def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """
    Dependency: optionally extract and validate user if Authorization header is present.
    Returns None if missing or invalid, never raises 401.
    """
    if not credentials:
        return None
    try:
        user_id = decode_access_token(credentials.credentials)
    except Exception:
        return None
    try:
        user = await UserRepository(db).get_by_id(UUID(user_id))
        if not user or not user.is_active:
            return None
        return user
    except Exception:
        return None


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Dependency: require an active authenticated user."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )
    return current_user


async def get_club_membership(
    club_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ClubMembership:
    """
    Dependency: verify that the current user has an active membership in the given club.
    Returns the ClubMembership or raises 404 (club not found) or 403 (forbidden/inactive).
    """
    club = await ClubRepository(db).get_by_id(club_id)
    if not club:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Club not found",
        )

    membership = await ClubMembershipRepository(db).get_by_user_and_club(
        user_id=current_user.id,
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
    return membership



def require_permission(permission: Permission):
    """
    Factory dependency: requires the current user's club membership to have a specific permission.

    Usage:
        Depends(require_permission(Permission.MANAGE_TOURNAMENTS))

    The club_id must be passed as a query parameter or path parameter.
    """
    async def _check(
        membership: ClubMembership = Depends(get_club_membership),
    ) -> ClubMembership:
        if not has_permission(membership.role, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission.value} required",
            )
        return membership

    return _check
