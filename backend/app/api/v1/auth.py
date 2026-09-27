"""Authentication API routes — Phase 1 foundation."""
from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    ClubLoginRequest,
    LoginRequest,
    PlayerLoginRequest,
    PlayerRegisterRequest,
    TokenRefreshRequest,
    TokenRefreshResponse,
)
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/club/login", response_model=AuthResponse)
async def club_login(
    request: ClubLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """
    Authenticate a club staff user by email and password.
    Determines role from backend ClubMembership.
    Rejects non-staff users or disabled accounts with 403.
    """
    service = AuthService(db)
    return await service.login_club(email=request.email, password=request.password)


@router.post("/player/login", response_model=AuthResponse)
async def player_login(
    request: PlayerLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """
    Authenticate a player account by email and password.
    Routes to the Player experience only.
    """
    service = AuthService(db)
    return await service.login_player(email=request.email, password=request.password)


@router.post(
    "/player/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
)
async def player_register(
    request: PlayerRegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """
    Self-register a player account.
    Creates User and PlayerProfile. Grants no club staff permissions.
    """
    service = AuthService(db)
    return await service.register_player(
        email=request.email,
        password=request.password,
        full_name=request.full_name,
    )


@router.post("/login", response_model=AuthResponse)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """
    Authenticate with email and password (backward-compatible).
    Returns access token, refresh token, user info, and club memberships.
    The client never provides a role — backend determines it from ClubMembership.
    """
    service = AuthService(db)
    return await service.login(email=request.email, password=request.password)


@router.post("/refresh", response_model=TokenRefreshResponse)
async def refresh_token(
    request: TokenRefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenRefreshResponse:
    """Exchange a valid refresh token for a new short-lived access token."""
    service = AuthService(db)
    return await service.refresh_access_token(request.refresh_token)


@router.get("/me", response_model=AuthResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    """
    Return current authenticated user's profile and club memberships.
    Used to restore session state after app launch.
    """
    service = AuthService(db)
    return await service.get_current_user_profile(str(current_user.id))
