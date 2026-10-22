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

from datetime import date, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.membership import SubscriptionStatus
from app.models.payment import PaymentMethod, PaymentPurpose, PaymentStatus
from app.models.tournament import TournamentFormat, TournamentStatus
from app.models.user import User
from app.schemas.club_player_membership import (
    PlayerClubMembershipDetailResponse,
    PlayerClubResponse,
)
from app.schemas.membership import (
    MemberSubscriptionResponse,
    PlayerMembershipView,
    PlayerSubscribeRequest,
)
from app.schemas.payment import PlayerPaymentResponse
from app.schemas.player_profile import (
    PlayerProfileCreate,
    PlayerProfileResponse,
    PlayerProfileUpdate,
)
from app.schemas.club_membership_request import (
    MembershipRequestCreate,
    MembershipRequestResponse,
)
from app.schemas.player_activity import PlayerActivityItem
from app.schemas.tournament import TournamentDiscoveryResponse
from app.services.club_membership_request_service import ClubMembershipRequestService
from app.services.member_subscription_service import MemberSubscriptionService
from app.services.payment_service import PaymentService
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
    from fastapi import HTTPException
    from app.services.media_storage_service import MediaStorageService

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

    # Check existing profile photo for clean replacement
    player_service = PlayerService(db)
    current_profile = await player_service.get_profile(current_user.id)
    old_photo_url = current_profile.profile_image_url if current_profile else None

    storage = MediaStorageService(db)
    public_url, _ = await storage.store_image(
        raw_bytes=image_bytes,
        category="avatars",
        club_id=None,
        uploaded_by_user_id=current_user.id,
        asset_type="avatar",
        original_filename=f"{current_user.id}.{ext}",
    )

    updated_profile = await player_service.update_profile(
        user_id=current_user.id,
        payload=PlayerProfileUpdate(profile_image_url=public_url),
    )

    # Clean up previous avatar file if replaced
    if old_photo_url and old_photo_url != public_url:
        try:
            await storage.delete_file_by_url(old_photo_url)
        except Exception:
            pass

    return updated_profile


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
    player_service = PlayerService(db)
    current_profile = await player_service.get_profile(current_user.id)
    old_photo_url = current_profile.profile_image_url if current_profile else None

    if old_photo_url:
        try:
            from app.services.media_storage_service import MediaStorageService
            await MediaStorageService(db).delete_file_by_url(old_photo_url)
        except Exception:
            pass

    return await player_service.update_profile(
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


@router.post(
    "/clubs/{club_id}/join",
    response_model=PlayerClubResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Join a club",
    description="Player joins a club. Automatically activates player club membership without manual approval.",
    responses={
        401: {"description": "Not authenticated"},
        404: {"description": "Club not found or inactive"},
    },
)
async def join_club(
    club_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlayerClubResponse:
    """Player directly joins a club."""
    return await PlayerService(db).join_club(
        user_id=current_user.id,
        club_id=club_id,
    )


@router.get(
    "/tournaments",
    response_model=list[TournamentDiscoveryResponse],
    summary="Discover public tournaments",
    description="Returns all discoverable public tournaments across active clubs. Private tournaments are excluded. Supports search, format, status, date range, and pagination.",
    responses={
        401: {"description": "Not authenticated"},
    },
)
async def discover_tournaments(
    club_id: UUID | None = Query(None, description="Optional club filter"),
    search: str | None = Query(None, description="Search term for tournament name, host club, location, or description"),
    format: TournamentFormat | None = Query(None, description="Filter by tournament format"),
    status: TournamentStatus | None = Query(None, description="Filter by status"),
    start_date_from: datetime | None = Query(None, description="Filter tournaments starting on or after"),
    start_date_to: datetime | None = Query(None, description="Filter tournaments starting on or before"),
    limit: int | None = Query(None, ge=1, le=100, description="Maximum tournaments to return"),
    offset: int | None = Query(None, ge=0, description="Offset for pagination"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TournamentDiscoveryResponse]:
    """Retrieve discoverable public tournaments with caller's registration status."""
    return await TournamentService(db).list_public_tournaments(
        user_id=current_user.id,
        club_id=club_id,
        search=search,
        format=format,
        status=status,
        start_date_from=start_date_from,
        start_date_to=start_date_to,
        limit=limit,
        offset=offset,
    )


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
    "/memberships",
    response_model=list[PlayerMembershipView],
    summary="List caller's subscriptions across all clubs",
    description="Returns all subscriptions for the authenticated player across clubs, with club name and payment status.",
    responses={
        401: {"description": "Not authenticated"},
    },
)
async def list_player_memberships(
    status: SubscriptionStatus | None = Query(default=None, description="Optional status filter"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PlayerMembershipView]:
    """Retrieve player's subscriptions across all clubs."""
    return await MemberSubscriptionService(db).list_player_memberships(
        user_id=current_user.id,
        status_filter=status,
    )


@router.post(
    "/clubs/{club_id}/subscribe",
    response_model=MemberSubscriptionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Subscribe to a club membership plan",
    description="Player subscribes to an active membership plan in a club where they have an active player membership.",
    responses={
        400: {"description": "Validation error or inactive player membership"},
        401: {"description": "Not authenticated"},
        404: {"description": "Club or plan not found"},
        409: {"description": "Conflicting active or scheduled subscription exists"},
    },
)
async def player_subscribe(
    club_id: UUID,
    payload: PlayerSubscribeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MemberSubscriptionResponse:
    """Enroll caller in a club membership plan."""
    from fastapi import HTTPException
    if not payload.membership_plan_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="membership_plan_id is required",
        )
    return await MemberSubscriptionService(db).player_subscribe(
        club_id=club_id,
        plan_id=payload.membership_plan_id,
        user_id=current_user.id,
        payload=payload,
    )


@router.post(
    "/memberships/{subscription_id}/renew",
    response_model=MemberSubscriptionResponse,
    summary="Renew an existing subscription",
    description="Player renews an active or expired subscription, creating a new subscription record while preserving audit history.",
    responses={
        400: {"description": "Cannot renew or inactive plan"},
        401: {"description": "Not authenticated"},
        403: {"description": "Cannot renew another player's subscription"},
        404: {"description": "Subscription not found"},
        409: {"description": "Active subscription already exists"},
    },
)
async def player_renew_subscription(
    subscription_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MemberSubscriptionResponse:
    """Renew player's subscription."""
    return await MemberSubscriptionService(db).player_renew_subscription(
        subscription_id=subscription_id,
        user_id=current_user.id,
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


# ─── Player Membership Requests Workflow ──────────────────────────────────────


@router.post(
    "/clubs/{club_id}/membership-requests",
    response_model=MembershipRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a club membership request",
    description="Player submits an application/request to join a club. Validates that player is not already an active member and has no pending request.",
    responses={
        400: {"description": "Already an active member or pending request exists"},
        401: {"description": "Not authenticated"},
        404: {"description": "Club not found or inactive"},
    },
)
async def submit_club_membership_request(
    club_id: UUID,
    payload: MembershipRequestCreate | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MembershipRequestResponse:
    """Submit a membership application for a club."""
    return await ClubMembershipRequestService(db).create_request(
        club_id=club_id,
        user_id=current_user.id,
        message=payload.message if payload else None,
    )


@router.get(
    "/membership-requests",
    response_model=list[MembershipRequestResponse],
    summary="List caller's membership requests",
    description="Returns all club membership requests submitted by the authenticated player.",
    responses={
        401: {"description": "Not authenticated"},
    },
)
async def list_my_membership_requests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MembershipRequestResponse]:
    """List caller's membership requests."""
    return await ClubMembershipRequestService(db).list_user_requests(
        user_id=current_user.id,
    )


@router.get(
    "/clubs/{club_id}/membership-request",
    response_model=MembershipRequestResponse | None,
    summary="Get caller's request status for a club",
    description="Returns caller's latest membership request status for the specified club, or null if no request exists.",
    responses={
        401: {"description": "Not authenticated"},
    },
)
async def get_my_club_membership_request(
    club_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MembershipRequestResponse | None:
    """Get caller's membership request status for a specific club."""
    return await ClubMembershipRequestService(db).get_user_request_for_club(
        club_id=club_id,
        user_id=current_user.id,
    )


@router.post(
    "/membership-requests/{request_id}/withdraw",
    response_model=MembershipRequestResponse,
    summary="Withdraw a pending membership request",
    description="Player withdraws their own pending membership request. Only pending requests can be withdrawn.",
    responses={
        400: {"description": "Request is not pending"},
        401: {"description": "Not authenticated"},
        403: {"description": "Cannot withdraw another user's request"},
        404: {"description": "Request not found"},
    },
)
async def withdraw_my_membership_request(
    request_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MembershipRequestResponse:
    """Withdraw player's pending membership request."""
    return await ClubMembershipRequestService(db).withdraw_request(
        request_id=request_id,
        user_id=current_user.id,
    )


@router.get(
    "/payments",
    response_model=list[PlayerPaymentResponse],
    summary="List caller's payment history across clubs",
    description="Returns caller's payment records across all clubs with optional filtering.",
)
async def list_my_payments(
    status: PaymentStatus | None = Query(None),
    purpose: PaymentPurpose | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PlayerPaymentResponse]:
    """List caller's own payment records across all clubs."""
    return await PaymentService(db).list_player_payments(
        user_id=current_user.id,
        status=status,
        purpose=purpose,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )

