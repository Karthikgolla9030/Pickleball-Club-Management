"""
Aught2 Pickleball — Club Assets, Media & Branding API Endpoints

Implements:
- GET /clubs/{club_id}/branding: Public/Player view of club branding (logo & cover)
- PUT /clubs/{club_id}/branding: Club Owner updates branding
- POST /clubs/{club_id}/media/upload: Secure image upload with Pillow validation & EXIF stripping
- GET /clubs/{club_id}/carousel-slides: Retrieve carousel slides (active only for players, all for staff)
- POST /clubs/{club_id}/carousel-slides: Add carousel slide (Owner only)
- PUT /clubs/{club_id}/carousel-slides/{slide_id}: Update carousel slide (Owner only)
- DELETE /clubs/{club_id}/carousel-slides/{slide_id}: Delete carousel slide (Owner only)
- POST /clubs/{club_id}/carousel-slides/reorder: Reorder carousel slides (Owner only)

Entity Image Customization:
- PUT /clubs/{club_id}/tournaments/{tournament_id}/image
- PUT /clubs/{club_id}/leagues/{league_id}/image
- PUT /clubs/{club_id}/events/{event_id}/image
- PUT /clubs/{club_id}/courts/{court_id}/image
- PUT /clubs/{club_id}/lessons/{lesson_id}/image
- PUT /clubs/{club_id}/lesson-types/{lesson_type_id}/image
"""
from __future__ import annotations

from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_club_membership,
    get_current_active_user,
    get_current_user,
    require_permission,
)
from app.core.database import get_db
from app.models.club_membership import ClubMembership
from app.models.user import User
from app.permissions import Permission, has_permission
from app.schemas.club_asset import (
    ClubBrandingResponse,
    ClubBrandingUpdateRequest,
    ClubCarouselSlideCreateRequest,
    ClubCarouselSlideResponse,
    ClubCarouselSlideUpdateRequest,
    EntityImageUpdateRequest,
    MediaUploadResponse,
    ReorderSlidesRequest,
)
from app.schemas.court import CourtResponse
from app.schemas.event import EventResponse
from app.schemas.league import LeagueResponse
from app.schemas.lesson import LessonResponse, LessonTypeResponse
from app.schemas.tournament import TournamentResponse
from app.services.club_asset_service import ClubAssetService

router = APIRouter(prefix="/clubs/{club_id}", tags=["Club Visual Assets & Branding"])


# ─── Club Branding ────────────────────────────────────────────────────────────

@router.get(
    "/branding",
    response_model=ClubBrandingResponse,
    summary="Get club branding",
    description="Returns public branding assets (logo, cover image) for the specified club.",
)
async def get_club_branding(
    club_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> ClubBrandingResponse:
    """Read club branding assets. Accessible to all users."""
    return await ClubAssetService(db).get_branding(club_id=club_id)


@router.put(
    "/branding",
    response_model=ClubBrandingResponse,
    summary="Update club branding",
    description="Update club logo and/or cover image. Requires MANAGE_CLUB permission (Club Owner only).",
)
async def update_club_branding(
    club_id: UUID,
    payload: ClubBrandingUpdateRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_CLUB)),
    db: AsyncSession = Depends(get_db),
) -> ClubBrandingResponse:
    """Update club branding assets."""
    return await ClubAssetService(db).update_branding(club_id=club_id, payload=payload)


# ─── Media Upload ─────────────────────────────────────────────────────────────

@router.post(
    "/media/upload",
    response_model=MediaUploadResponse,
    summary="Upload image asset",
    description="Secure upload for club branding, hero slides, and entity images with Pillow validation.",
)
async def upload_club_media(
    club_id: UUID,
    file: UploadFile = File(...),
    asset_type: str = Form(..., description="club_logo, club_cover, owner_banner, default_tournament_round_robin, default_tournament_scramble, default_tournament_pool_play, default_tournament_bracket, default_league_banner, default_event_banner, default_lesson_banner, carousel_slide, tournament_banner, league_banner, event_cover, court_photo, lesson_image"),
    entity_type: str | None = Form(None),
    entity_id: str | None = Form(None),
    current_user: User = Depends(get_current_active_user),
    membership: ClubMembership = Depends(get_club_membership),
    db: AsyncSession = Depends(get_db),
) -> MediaUploadResponse:
    """
    Validate permissions based on asset type, then store and register image.
    """
    # Parse entity_id safely from multipart form-data (handling empty string or 'null')
    parsed_entity_id: UUID | None = None
    if entity_id is not None:
        clean_eid = entity_id.strip()
        if clean_eid and clean_eid.lower() not in ("null", "undefined", "none", ""):
            try:
                parsed_entity_id = UUID(clean_eid)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid entity_id format: '{entity_id}' is not a valid UUID",
                )

    # Enforce role-appropriate permissions for each asset type
    clean_asset_type = asset_type.lower().strip()
    required_permission = Permission.MANAGE_CLUB
    if clean_asset_type in ("tournament_banner", "tournament"):
        required_permission = Permission.MANAGE_TOURNAMENTS
    elif clean_asset_type in ("league_banner", "league"):
        required_permission = Permission.MANAGE_LEAGUES
    elif clean_asset_type in ("event_cover", "event"):
        required_permission = Permission.MANAGE_EVENTS
    elif clean_asset_type in ("court_photo", "court", "court_image"):
        required_permission = Permission.MANAGE_COURTS
    elif clean_asset_type in ("lesson_image", "lesson_type_image", "lesson", "lesson_type"):
        required_permission = Permission.MANAGE_LESSONS
    elif clean_asset_type in ("club_logo", "logo", "club_cover", "cover", "carousel_slide", "slide", "general"):
        required_permission = Permission.MANAGE_CLUB
    else:
        required_permission = Permission.MANAGE_CLUB

    if not has_permission(membership.role, required_permission):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission denied: {required_permission.value} required to upload {asset_type}",
        )

    return await ClubAssetService(db).upload_file(
        club_id=club_id,
        uploaded_by_user_id=current_user.id,
        file=file,
        asset_type=clean_asset_type,
        entity_type=entity_type,
        entity_id=parsed_entity_id,
    )


# ─── Hero Carousel Slides ─────────────────────────────────────────────────────

@router.get(
    "/carousel-slides",
    response_model=list[ClubCarouselSlideResponse],
    summary="List club carousel slides",
    description="Returns hero promotional carousel slides for this club ordered by display order.",
)
async def list_carousel_slides(
    club_id: UUID,
    active_only: bool = Query(True, description="Filter for active slides only (defaults True for players)"),
    db: AsyncSession = Depends(get_db),
) -> list[ClubCarouselSlideResponse]:
    """Retrieve carousel slides for current club."""
    return await ClubAssetService(db).get_carousel_slides(club_id=club_id, active_only=active_only)


@router.post(
    "/carousel-slides",
    response_model=ClubCarouselSlideResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create carousel slide",
    description="Add a new slide to the club's hero carousel. Requires MANAGE_CLUB (Club Owner only).",
)
async def create_carousel_slide(
    club_id: UUID,
    payload: ClubCarouselSlideCreateRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_CLUB)),
    db: AsyncSession = Depends(get_db),
) -> ClubCarouselSlideResponse:
    """Create a new promotional carousel slide."""
    return await ClubAssetService(db).create_carousel_slide(club_id=club_id, payload=payload)


@router.put(
    "/carousel-slides/{slide_id}",
    response_model=ClubCarouselSlideResponse,
    summary="Update carousel slide",
    description="Modify a slide's image, title, text, CTA, or status. Requires MANAGE_CLUB.",
)
async def update_carousel_slide(
    club_id: UUID,
    slide_id: UUID,
    payload: ClubCarouselSlideUpdateRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_CLUB)),
    db: AsyncSession = Depends(get_db),
) -> ClubCarouselSlideResponse:
    """Update an existing carousel slide."""
    return await ClubAssetService(db).update_carousel_slide(club_id=club_id, slide_id=slide_id, payload=payload)


@router.delete(
    "/carousel-slides/{slide_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete carousel slide",
    description="Remove a promotional slide from the club's carousel. Requires MANAGE_CLUB.",
)
async def delete_carousel_slide(
    club_id: UUID,
    slide_id: UUID,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_CLUB)),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a carousel slide."""
    await ClubAssetService(db).delete_carousel_slide(club_id=club_id, slide_id=slide_id)


@router.post(
    "/carousel-slides/reorder",
    response_model=list[ClubCarouselSlideResponse],
    summary="Reorder carousel slides",
    description="Update slide presentation order. Requires MANAGE_CLUB.",
)
async def reorder_carousel_slides(
    club_id: UUID,
    payload: ReorderSlidesRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_CLUB)),
    db: AsyncSession = Depends(get_db),
) -> list[ClubCarouselSlideResponse]:
    """Persist new order of carousel slides."""
    return await ClubAssetService(db).reorder_carousel_slides(club_id=club_id, slide_ids=payload.slide_ids)


# ─── Entity Image Endpoints ───────────────────────────────────────────────────

@router.put(
    "/tournaments/{tournament_id}/image",
    response_model=TournamentResponse,
    summary="Update tournament banner",
    description="Update or clear tournament banner image. Requires MANAGE_TOURNAMENTS.",
)
async def update_tournament_image(
    club_id: UUID,
    tournament_id: UUID,
    payload: EntityImageUpdateRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_TOURNAMENTS)),
    db: AsyncSession = Depends(get_db),
) -> TournamentResponse:
    """Update tournament banner."""
    t = await ClubAssetService(db).update_tournament_image(
        club_id=club_id,
        tournament_id=tournament_id,
        image_url=payload.image_url,
    )
    from app.services.tournament_service import build_tournament_response
    return build_tournament_response(t)


@router.put(
    "/leagues/{league_id}/image",
    response_model=LeagueResponse,
    summary="Update league banner",
    description="Update or clear league banner image. Requires MANAGE_LEAGUES.",
)
async def update_league_image(
    club_id: UUID,
    league_id: UUID,
    payload: EntityImageUpdateRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_LEAGUES)),
    db: AsyncSession = Depends(get_db),
) -> LeagueResponse:
    """Update league banner."""
    l = await ClubAssetService(db).update_league_image(
        club_id=club_id,
        league_id=league_id,
        image_url=payload.image_url,
    )
    return LeagueResponse.model_validate(l)


@router.put(
    "/events/{event_id}/image",
    response_model=EventResponse,
    summary="Update event cover",
    description="Update or clear event cover image. Requires MANAGE_EVENTS.",
)
async def update_event_image(
    club_id: UUID,
    event_id: UUID,
    payload: EntityImageUpdateRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_EVENTS)),
    db: AsyncSession = Depends(get_db),
) -> EventResponse:
    """Update event cover image."""
    e = await ClubAssetService(db).update_event_image(
        club_id=club_id,
        event_id=event_id,
        image_url=payload.image_url,
    )
    return EventResponse.model_validate(e)


@router.put(
    "/courts/{court_id}/image",
    response_model=CourtResponse,
    summary="Update court photo",
    description="Update or clear court photo. Requires MANAGE_COURTS.",
)
async def update_court_image(
    club_id: UUID,
    court_id: UUID,
    payload: EntityImageUpdateRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_COURTS)),
    db: AsyncSession = Depends(get_db),
) -> CourtResponse:
    """Update court photo."""
    c = await ClubAssetService(db).update_court_image(
        club_id=club_id,
        court_id=court_id,
        image_url=payload.image_url,
    )
    return CourtResponse.model_validate(c)


@router.put(
    "/lessons/{lesson_id}/image",
    response_model=LessonResponse,
    summary="Update lesson image",
    description="Update or clear lesson image. Requires MANAGE_LESSONS.",
)
async def update_lesson_image(
    club_id: UUID,
    lesson_id: UUID,
    payload: EntityImageUpdateRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> LessonResponse:
    """Update lesson session image."""
    les = await ClubAssetService(db).update_lesson_image(
        club_id=club_id,
        lesson_id=lesson_id,
        image_url=payload.image_url,
    )
    return LessonResponse.model_validate(les)


@router.put(
    "/lesson-types/{lesson_type_id}/image",
    response_model=LessonTypeResponse,
    summary="Update lesson type image",
    description="Update or clear lesson type template image. Requires MANAGE_LESSONS.",
)
async def update_lesson_type_image(
    club_id: UUID,
    lesson_type_id: UUID,
    payload: EntityImageUpdateRequest,
    _: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> LessonTypeResponse:
    """Update lesson type template image."""
    lt = await ClubAssetService(db).update_lesson_type_image(
        club_id=club_id,
        lesson_type_id=lesson_type_id,
        image_url=payload.image_url,
    )
    return LessonTypeResponse.model_validate(lt)
