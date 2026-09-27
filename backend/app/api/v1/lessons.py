"""
Aught2 Pickleball — Lesson API Endpoints (Phase 15)

Staff Endpoints (/api/v1/clubs/{club_id}):
  Coaches:
    - GET    /coaches
    - POST   /coaches
    - GET    /coaches/{coach_id}
    - PATCH  /coaches/{coach_id}
    - POST   /coaches/{coach_id}/deactivate
    - POST   /coaches/{coach_id}/reactivate
  Lesson Types:
    - GET    /lesson-types
    - POST   /lesson-types
    - GET    /lesson-types/{lesson_type_id}
    - PATCH  /lesson-types/{lesson_type_id}
    - POST   /lesson-types/{lesson_type_id}/deactivate
    - POST   /lesson-types/{lesson_type_id}/reactivate
  Lessons:
    - GET    /lessons
    - POST   /lessons
    - GET    /lessons/{lesson_id}
    - PATCH  /lessons/{lesson_id}
    - POST   /lessons/{lesson_id}/publish
    - POST   /lessons/{lesson_id}/cancel
    - POST   /lessons/{lesson_id}/complete
  Registrations:
    - GET    /lessons/{lesson_id}/registrations
    - POST   /lessons/{lesson_id}/registrations
    - POST   /lessons/{lesson_id}/registrations/{registration_id}/cancel
    - POST   /lessons/{lesson_id}/registrations/{registration_id}/attend
    - POST   /lessons/{lesson_id}/registrations/{registration_id}/no-show

Player Endpoints:
  - GET    /clubs/{club_id}/lessons/discover
  - GET    /players/me/lessons
  - GET    /players/me/lessons/{lesson_id}
  - POST   /players/me/lessons/{lesson_id}/register
  - POST   /players/me/lessons/{lesson_id}/cancel
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_user,
    require_permission,
)
from app.core.database import get_db
from app.models.club_membership import ClubMembership
from app.models.lesson import (
    LessonRegistrationStatus,
    LessonStatus,
)
from app.models.user import User
from app.permissions import Permission
from app.schemas.lesson import (
    CoachCreateRequest,
    CoachResponse,
    CoachUpdateRequest,
    LessonCreateRequest,
    LessonDetailResponse,
    LessonRegistrationResponse,
    LessonResponse,
    LessonTypeCreateRequest,
    LessonTypeResponse,
    LessonTypeUpdateRequest,
    LessonUpdateRequest,
    PlayerLessonDetailResponse,
    PlayerRegisterRequest,
    StaffRegisterPlayerRequest,
)
from app.services.lesson_service import LessonService

club_lessons_router = APIRouter(prefix="/clubs/{club_id}", tags=["Staff Lessons"])
player_lessons_router = APIRouter(tags=["Player Lessons"])


# ══════════════════════════════════════════════════════════════════════════════
# STAFF COACH ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@club_lessons_router.post(
    "/coaches",
    response_model=CoachResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create coach profile",
)
async def create_coach(
    club_id: UUID,
    payload: CoachCreateRequest,
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> CoachResponse:
    service = LessonService(db)
    return await service.create_coach(club_id=club_id, payload=payload)


@club_lessons_router.get(
    "/coaches",
    response_model=list[CoachResponse],
    summary="List club coaches",
)
async def list_coaches(
    club_id: UUID,
    is_active: bool | None = Query(default=None),
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> list[CoachResponse]:
    service = LessonService(db)
    return await service.list_coaches(club_id=club_id, is_active=is_active)


@club_lessons_router.get(
    "/coaches/{coach_id}",
    response_model=CoachResponse,
    summary="Get coach details",
)
async def get_coach(
    club_id: UUID,
    coach_id: UUID,
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> CoachResponse:
    service = LessonService(db)
    return await service.get_coach(coach_id=coach_id, club_id=club_id)


@club_lessons_router.patch(
    "/coaches/{coach_id}",
    response_model=CoachResponse,
    summary="Update coach profile",
)
async def update_coach(
    club_id: UUID,
    coach_id: UUID,
    payload: CoachUpdateRequest,
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> CoachResponse:
    service = LessonService(db)
    return await service.update_coach(coach_id=coach_id, club_id=club_id, payload=payload)


@club_lessons_router.post(
    "/coaches/{coach_id}/deactivate",
    response_model=CoachResponse,
    summary="Deactivate coach",
)
async def deactivate_coach(
    club_id: UUID,
    coach_id: UUID,
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> CoachResponse:
    service = LessonService(db)
    return await service.deactivate_coach(coach_id=coach_id, club_id=club_id)


@club_lessons_router.post(
    "/coaches/{coach_id}/reactivate",
    response_model=CoachResponse,
    summary="Reactivate coach",
)
async def reactivate_coach(
    club_id: UUID,
    coach_id: UUID,
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> CoachResponse:
    service = LessonService(db)
    return await service.reactivate_coach(coach_id=coach_id, club_id=club_id)


# ══════════════════════════════════════════════════════════════════════════════
# STAFF LESSON TYPE ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@club_lessons_router.post(
    "/lesson-types",
    response_model=LessonTypeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create lesson type template",
)
async def create_lesson_type(
    club_id: UUID,
    payload: LessonTypeCreateRequest,
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> LessonTypeResponse:
    service = LessonService(db)
    return await service.create_lesson_type(club_id=club_id, payload=payload)


@club_lessons_router.get(
    "/lesson-types",
    response_model=list[LessonTypeResponse],
    summary="List club lesson types",
)
async def list_lesson_types(
    club_id: UUID,
    is_active: bool | None = Query(default=None),
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> list[LessonTypeResponse]:
    service = LessonService(db)
    return await service.list_lesson_types(club_id=club_id, is_active=is_active)


@club_lessons_router.get(
    "/lesson-types/{lesson_type_id}",
    response_model=LessonTypeResponse,
    summary="Get lesson type details",
)
async def get_lesson_type(
    club_id: UUID,
    lesson_type_id: UUID,
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> LessonTypeResponse:
    service = LessonService(db)
    return await service.get_lesson_type(lesson_type_id=lesson_type_id, club_id=club_id)


@club_lessons_router.patch(
    "/lesson-types/{lesson_type_id}",
    response_model=LessonTypeResponse,
    summary="Update lesson type",
)
async def update_lesson_type(
    club_id: UUID,
    lesson_type_id: UUID,
    payload: LessonTypeUpdateRequest,
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> LessonTypeResponse:
    service = LessonService(db)
    return await service.update_lesson_type(lesson_type_id=lesson_type_id, club_id=club_id, payload=payload)


@club_lessons_router.post(
    "/lesson-types/{lesson_type_id}/deactivate",
    response_model=LessonTypeResponse,
    summary="Deactivate lesson type",
)
async def deactivate_lesson_type(
    club_id: UUID,
    lesson_type_id: UUID,
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> LessonTypeResponse:
    service = LessonService(db)
    return await service.deactivate_lesson_type(lesson_type_id=lesson_type_id, club_id=club_id)


@club_lessons_router.post(
    "/lesson-types/{lesson_type_id}/reactivate",
    response_model=LessonTypeResponse,
    summary="Reactivate lesson type",
)
async def reactivate_lesson_type(
    club_id: UUID,
    lesson_type_id: UUID,
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> LessonTypeResponse:
    service = LessonService(db)
    return await service.reactivate_lesson_type(lesson_type_id=lesson_type_id, club_id=club_id)


# ══════════════════════════════════════════════════════════════════════════════
# STAFF LESSON ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@club_lessons_router.post(
    "/lessons",
    response_model=LessonDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Schedule a coaching lesson",
)
async def create_lesson(
    club_id: UUID,
    payload: LessonCreateRequest,
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LessonDetailResponse:
    service = LessonService(db)
    return await service.create_lesson(
        club_id=club_id,
        payload=payload,
        created_by_user_id=current_user.id,
    )


@club_lessons_router.get(
    "/lessons",
    response_model=list[LessonResponse],
    summary="List club lessons with filters",
)
async def list_lessons(
    club_id: UUID,
    status: LessonStatus | None = Query(default=None),
    coach_id: UUID | None = Query(default=None),
    lesson_type_id: UUID | None = Query(default=None),
    court_id: UUID | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> list[LessonResponse]:
    service = LessonService(db)
    return await service.list_lessons(
        club_id=club_id,
        status_filter=status,
        coach_id=coach_id,
        lesson_type_id=lesson_type_id,
        court_id=court_id,
        date_from=date_from,
        date_to=date_to,
        offset=offset,
        limit=limit,
    )


@club_lessons_router.get(
    "/lessons/{lesson_id}",
    response_model=LessonDetailResponse,
    summary="Get lesson details",
)
async def get_lesson(
    club_id: UUID,
    lesson_id: UUID,
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> LessonDetailResponse:
    service = LessonService(db)
    return await service.get_lesson(lesson_id=lesson_id, club_id=club_id)


@club_lessons_router.patch(
    "/lessons/{lesson_id}",
    response_model=LessonDetailResponse,
    summary="Update scheduled lesson",
)
async def update_lesson(
    club_id: UUID,
    lesson_id: UUID,
    payload: LessonUpdateRequest,
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> LessonDetailResponse:
    service = LessonService(db)
    return await service.update_lesson(lesson_id=lesson_id, club_id=club_id, payload=payload)


@club_lessons_router.post(
    "/lessons/{lesson_id}/publish",
    response_model=LessonDetailResponse,
    summary="Publish draft lesson",
)
async def publish_lesson(
    club_id: UUID,
    lesson_id: UUID,
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> LessonDetailResponse:
    service = LessonService(db)
    return await service.transition_status(lesson_id=lesson_id, club_id=club_id, target_status=LessonStatus.PUBLISHED)


@club_lessons_router.post(
    "/lessons/{lesson_id}/cancel",
    response_model=LessonDetailResponse,
    summary="Cancel scheduled lesson",
)
async def cancel_lesson(
    club_id: UUID,
    lesson_id: UUID,
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> LessonDetailResponse:
    service = LessonService(db)
    return await service.transition_status(lesson_id=lesson_id, club_id=club_id, target_status=LessonStatus.CANCELLED)


@club_lessons_router.post(
    "/lessons/{lesson_id}/complete",
    response_model=LessonDetailResponse,
    summary="Mark lesson completed",
)
async def complete_lesson(
    club_id: UUID,
    lesson_id: UUID,
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> LessonDetailResponse:
    service = LessonService(db)
    return await service.transition_status(lesson_id=lesson_id, club_id=club_id, target_status=LessonStatus.COMPLETED)


# ══════════════════════════════════════════════════════════════════════════════
# STAFF LESSON REGISTRATION ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@club_lessons_router.get(
    "/lessons/{lesson_id}/registrations",
    response_model=list[LessonRegistrationResponse],
    summary="Get registrations roster for lesson",
)
async def list_registrations(
    club_id: UUID,
    lesson_id: UUID,
    status: LessonRegistrationStatus | None = Query(default=None),
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> list[LessonRegistrationResponse]:
    service = LessonService(db)
    return await service.list_registrations(lesson_id=lesson_id, club_id=club_id, status_filter=status)


@club_lessons_router.post(
    "/lessons/{lesson_id}/registrations",
    response_model=LessonRegistrationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Staff register eligible player for lesson",
)
async def staff_register_player(
    club_id: UUID,
    lesson_id: UUID,
    payload: StaffRegisterPlayerRequest,
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> LessonRegistrationResponse:
    service = LessonService(db)
    return await service.register_player(
        lesson_id=lesson_id,
        user_id=payload.user_id,
        notes=payload.notes,
        is_staff=True,
    )


@club_lessons_router.post(
    "/lessons/{lesson_id}/registrations/{registration_id}/cancel",
    response_model=LessonRegistrationResponse,
    summary="Staff cancel player registration",
)
async def staff_cancel_registration(
    club_id: UUID,
    lesson_id: UUID,
    registration_id: UUID,
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> LessonRegistrationResponse:
    service = LessonService(db)
    return await service.cancel_registration(
        lesson_id=lesson_id,
        registration_id=registration_id,
        is_staff=True,
    )


@club_lessons_router.post(
    "/lessons/{lesson_id}/registrations/{registration_id}/attend",
    response_model=LessonRegistrationResponse,
    summary="Mark participant attended",
)
async def mark_attended(
    club_id: UUID,
    lesson_id: UUID,
    registration_id: UUID,
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> LessonRegistrationResponse:
    service = LessonService(db)
    return await service.mark_attendance(
        lesson_id=lesson_id,
        registration_id=registration_id,
        club_id=club_id,
        target_status=LessonRegistrationStatus.ATTENDED,
    )


@club_lessons_router.post(
    "/lessons/{lesson_id}/registrations/{registration_id}/no-show",
    response_model=LessonRegistrationResponse,
    summary="Mark participant as no-show",
)
async def mark_no_show(
    club_id: UUID,
    lesson_id: UUID,
    registration_id: UUID,
    membership: ClubMembership = Depends(require_permission(Permission.MANAGE_LESSONS)),
    db: AsyncSession = Depends(get_db),
) -> LessonRegistrationResponse:
    service = LessonService(db)
    return await service.mark_attendance(
        lesson_id=lesson_id,
        registration_id=registration_id,
        club_id=club_id,
        target_status=LessonRegistrationStatus.NO_SHOW,
    )


# ══════════════════════════════════════════════════════════════════════════════
# PLAYER LESSON ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@player_lessons_router.get(
    "/clubs/{club_id}/lessons/discover",
    response_model=list[LessonResponse],
    summary="Discover available club lessons",
)
async def discover_lessons(
    club_id: UUID,
    lesson_type_id: UUID | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    upcoming_only: bool = Query(default=True),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[LessonResponse]:
    service = LessonService(db)
    return await service.discover_lessons(
        club_id=club_id,
        user_id=current_user.id,
        lesson_type_id=lesson_type_id,
        date_from=date_from,
        date_to=date_to,
        upcoming_only=upcoming_only,
        offset=offset,
        limit=limit,
    )


@player_lessons_router.get(
    "/players/me/lessons",
    response_model=list[LessonRegistrationResponse],
    summary="List current player's registered lessons",
)
async def list_my_lessons(
    status: LessonRegistrationStatus | None = Query(default=None),
    upcoming_only: bool = Query(default=False),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[LessonRegistrationResponse]:
    service = LessonService(db)
    return await service.list_my_registrations(
        user_id=current_user.id,
        status_filter=status,
        upcoming_only=upcoming_only,
        offset=offset,
        limit=limit,
    )


@player_lessons_router.get(
    "/players/me/lessons/{lesson_id}",
    response_model=PlayerLessonDetailResponse,
    summary="Get lesson detail with player registration status",
)
async def get_player_lesson_detail(
    lesson_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PlayerLessonDetailResponse:
    service = LessonService(db)
    return await service.get_player_lesson_detail(
        lesson_id=lesson_id,
        user_id=current_user.id,
    )


@player_lessons_router.post(
    "/players/me/lessons/{lesson_id}/register",
    response_model=LessonRegistrationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Player register for lesson",
)
async def player_register(
    lesson_id: UUID,
    payload: PlayerRegisterRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LessonRegistrationResponse:
    service = LessonService(db)
    notes = payload.notes if payload else None
    return await service.register_player(
        lesson_id=lesson_id,
        user_id=current_user.id,
        notes=notes,
        is_staff=False,
    )


@player_lessons_router.post(
    "/players/me/lessons/{lesson_id}/cancel",
    response_model=LessonRegistrationResponse,
    summary="Player cancel own registration",
)
async def player_cancel_registration(
    lesson_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LessonRegistrationResponse:
    service = LessonService(db)
    active_reg = await service.registration_repo.get_active_registration_for_user(lesson_id, current_user.id)
    if not active_reg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active registration found for this lesson",
        )
    return await service.cancel_registration(
        lesson_id=lesson_id,
        registration_id=active_reg.id,
        user_id=current_user.id,
        is_staff=False,
    )
