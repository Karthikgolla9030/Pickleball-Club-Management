"""
Aught2 Pickleball — Player & Player Memberships API Endpoints

Implements:
  - GET /player/profile
  - POST /player/profile
  - PATCH /player/profile
  - GET /player/clubs
  - GET /player/clubs/{club_id}

Security & Architecture:
  - Pure user-scoped player identity endpoints.
  - Zero coupling with staff roles (ClubMembership).
  - Backend database is authoritative.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.club_player_membership import (
    PlayerClubMembershipDetailResponse,
    PlayerClubResponse,
)
from app.schemas.membership import PlayerMembershipView
from app.schemas.player_profile import (
    PlayerProfileCreate,
    PlayerProfileResponse,
    PlayerProfileUpdate,
)
from app.schemas.player_activity import PlayerActivityItem
from app.schemas.tournament import TournamentDiscoveryResponse
from app.services.member_subscription_service import MemberSubscriptionService
from app.services.player_service import PlayerService
from app.services.tournament_service import TournamentService

router = APIRouter(prefix="/player", tags=["Player & Player Memberships"])


@router.get(
    "/profile",
    response_model=PlayerProfileResponse,
    summary="Get current user's player profile",
    description="Returns the authenticated user's player profile. Returns 404 if no profile has been created yet.",
    responses={
        401: {"description": "Not authenticated"},
        404: {"description": "Player profile not found"},
    },
)
async def get_player_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlayerProfileResponse:
    """Retrieve caller's player profile."""
    return await PlayerService(db).get_profile(user_id=current_user.id)


@router.post(
    "/profile",
    response_model=PlayerProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create player profile for current user",
    description="Initializes player profile for the authenticated user. Fails with 400 if a profile already exists.",
    responses={
        400: {"description": "Player profile already exists"},
        401: {"description": "Not authenticated"},
        422: {"description": "Validation error"},
    },
)
async def create_player_profile(
    payload: PlayerProfileCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlayerProfileResponse:
    """Create player profile for authenticated user."""
    return await PlayerService(db).create_profile(
        user_id=current_user.id,
        payload=payload,
    )


@router.patch(
    "/profile",
    response_model=PlayerProfileResponse,
    summary="Update current user's player profile",
    description="Updates non-auth profile fields (display name, phone, birth date, bio, etc.). Fails with 404 if profile does not exist.",
    responses={
        401: {"description": "Not authenticated"},
        404: {"description": "Player profile not found"},
        422: {"description": "Validation error"},
    },
)
async def update_player_profile(
    payload: PlayerProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlayerProfileResponse:
    """Update caller's player profile."""
    return await PlayerService(db).update_profile(
        user_id=current_user.id,
        payload=payload,
    )


class ProfilePhotoUploadRequest(BaseModel):
    image_data: str
    content_type: str | None = None


@router.post(
    "/profile/photo",
    response_model=PlayerProfileResponse,
    summary="Upload or update player profile photo",
    description="Uploads a base64 encoded photo or image url, saves it, and updates player profile.",
    responses={
        400: {"description": "Invalid image data"},
        401: {"description": "Not authenticated"},
        413: {"description": "File too large"},
    },
)
async def upload_profile_photo(
    payload: ProfilePhotoUploadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlayerProfileResponse:
    import base64
    import os
    import time
    from fastapi import HTTPException

    data_str = payload.image_data.strip()
    if not data_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image data is required",
        )

    # If it's already an existing URL or path
    if (
        data_str.startswith("http://")
        or data_str.startswith("https://")
        or data_str.startswith("/uploads/")
    ):
        return await PlayerService(db).update_profile(
            user_id=current_user.id,
            payload=PlayerProfileUpdate(profile_image_url=data_str),
        )

    # Handle base64 / data URL
    ext = "jpg"
    raw_b64 = data_str
    if data_str.startswith("data:image/"):
        header, _, b64_part = data_str.partition(";base64,")
        if b64_part:
            raw_b64 = b64_part
            mime = header.split(":")[-1]
            if "png" in mime:
                ext = "png"
            elif "webp" in mime:
                ext = "webp"
            elif "jpeg" in mime or "jpg" in mime:
                ext = "jpg"

    try:
        image_bytes = base64.b64decode(raw_b64)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid base64 image data",
        )

    # 5MB size limit
    if len(image_bytes) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image exceeds 5MB limit",
        )

    backend_dir = os.path.dirname(
        os.path.dirname(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        )
    )
    uploads_dir = os.path.join(backend_dir, "uploads", "avatars")
    os.makedirs(uploads_dir, exist_ok=True)

    filename = f"{current_user.id}_{int(time.time())}.{ext}"
    filepath = os.path.join(uploads_dir, filename)
    with open(filepath, "wb") as f:
        f.write(image_bytes)

    relative_url = f"/uploads/avatars/{filename}"
    return await PlayerService(db).update_profile(
        user_id=current_user.id,
        payload=PlayerProfileUpdate(profile_image_url=relative_url),
    )


@router.delete(
    "/profile/photo",
    response_model=PlayerProfileResponse,
    summary="Remove player profile photo",
    description="Clears player profile photo, reverting to default avatar.",
    responses={
        401: {"description": "Not authenticated"},
        404: {"description": "Player profile not found"},
    },
)
async def delete_profile_photo(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlayerProfileResponse:
    return await PlayerService(db).update_profile(
        user_id=current_user.id,
        payload=PlayerProfileUpdate(profile_image_url=""),
    )


@router.get(
    "/clubs",
    response_model=list[PlayerClubResponse],
    summary="List clubs where user is enrolled as a player",
    description="Returns all clubs the authenticated user belongs to as a player member, along with status and membership number.",
    responses={
        401: {"description": "Not authenticated"},
    },
)
async def list_player_clubs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PlayerClubResponse]:
    """Retrieve player memberships for current user."""
    return await PlayerService(db).list_player_clubs(user_id=current_user.id)


@router.get(
    "/clubs/{club_id}",
    response_model=PlayerClubMembershipDetailResponse,
    summary="Get user's player membership detail for a club",
    description="Returns caller's specific player membership record for the given club. Returns 404 if caller is not enrolled in the club.",
    responses={
        401: {"description": "Not authenticated"},
        404: {"description": "Player membership not found in this club"},
    },
)
async def get_player_club_detail(
    club_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlayerClubMembershipDetailResponse:
    """Retrieve caller's player membership in a specific club."""
    return await PlayerService(db).get_player_club_membership(
        user_id=current_user.id,
        club_id=club_id,
    )


@router.get(
    "/tournaments",
    response_model=list[TournamentDiscoveryResponse],
    summary="Discover public tournaments",
    description="Returns all discoverable public tournaments across active clubs. Private tournaments are excluded.",
    responses={
        401: {"description": "Not authenticated"},
    },
)
async def discover_tournaments(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TournamentDiscoveryResponse]:
    """Retrieve discoverable public tournaments with caller's registration status."""
    return await TournamentService(db).list_public_tournaments(user_id=current_user.id)


@router.get(
    "/membership",
    response_model=PlayerMembershipView,
    summary="Get player's active membership subscription",
    description=(
        "Returns the authenticated player's active membership subscription for a specific club. "
        "Players can VIEW their subscription but NEVER modify it. "
        "Returns 404 if no active subscription exists."
    ),
    responses={
        401: {"description": "Not authenticated"},
        404: {"description": "No active membership for this club"},
    },
)
async def get_player_membership(
    club_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlayerMembershipView:
    """Retrieve player's active membership subscription for a club."""
    return await MemberSubscriptionService(db).get_player_membership_view(
        user_id=current_user.id,
        club_id=club_id,
    )


@router.get(
    "/activity",
    response_model=list[PlayerActivityItem],
    summary="Get player's recent activity",
    description="Returns recent chronological activities (bookings, tournament registrations, event registrations) for the authenticated player.",
    responses={
        401: {"description": "Not authenticated"},
    },
)
async def get_player_activity(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PlayerActivityItem]:
    """Retrieve caller's recent activity."""
    return await PlayerService(db).get_recent_activity(user_id=current_user.id)


@router.get(
    "/tournaments/favorites",
    response_model=list[UUID],
    summary="Get user's favorite tournament IDs",
    description="Returns a list of tournament IDs that the authenticated player has favorited.",
)
async def get_favorite_tournaments(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[UUID]:
    from sqlalchemy import select
    from app.models.tournament import TournamentFavorite

    stmt = select(TournamentFavorite.tournament_id).where(
        TournamentFavorite.user_id == current_user.id
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post(
    "/tournaments/{tournament_id}/favorite",
    summary="Add tournament to favorites",
    description="Adds a tournament to the authenticated user's favorites list (duplicate-safe).",
)
async def add_favorite_tournament(
    tournament_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select
    from app.models.tournament import TournamentFavorite

    existing = (
        await db.execute(
            select(TournamentFavorite).where(
                TournamentFavorite.user_id == current_user.id,
                TournamentFavorite.tournament_id == tournament_id,
            )
        )
    ).scalars().first()

    if not existing:
        fav = TournamentFavorite(
            user_id=current_user.id,
            tournament_id=tournament_id,
        )
        db.add(fav)
        await db.commit()

    return {"favorited": True, "tournament_id": tournament_id}


@router.delete(
    "/tournaments/{tournament_id}/favorite",
    summary="Remove tournament from favorites",
    description="Removes a tournament from the authenticated user's favorites list.",
)
async def remove_favorite_tournament(
    tournament_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import delete
    from app.models.tournament import TournamentFavorite

    stmt = delete(TournamentFavorite).where(
        TournamentFavorite.user_id == current_user.id,
        TournamentFavorite.tournament_id == tournament_id,
    )
    await db.execute(stmt)
    await db.commit()

    return {"favorited": False, "tournament_id": tournament_id}

