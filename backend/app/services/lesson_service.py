"""
Aught2 Pickleball — Lesson Service (Phase 15)

Business logic layer for:
  - Coach personnel management (create, update, deactivate, reactivate)
  - LessonType configuration templates
  - Lesson scheduling, validation, and lifecycle state transitions
  - Coach and Court scheduling conflict prevention (HTTP 409)
  - Concurrency-safe player registration & capacity enforcement
  - Attendance tracking (attended, no_show)
  - Strict tenant isolation and centralized RBAC
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
import uuid
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.club import Club
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.court import Court, CourtStatus
from app.models.lesson import (
    Coach,
    Lesson,
    LessonRegistration,
    LessonRegistrationStatus,
    LessonStatus,
    LessonType,
)
from app.models.user import User
from app.repositories.booking_repository import BookingRepository
from app.repositories.club_player_membership_repository import ClubPlayerMembershipRepository
from app.repositories.lesson_repository import (
    CoachRepository,
    LessonRegistrationRepository,
    LessonRepository,
    LessonTypeRepository,
)
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
)
from app.core.events import EventType, dispatch_event
from app.services.notification_service import NotificationService


def _ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


class LessonService:
    ALLOWED_TRANSITIONS: dict[LessonStatus, set[LessonStatus]] = {
        LessonStatus.DRAFT: {LessonStatus.PUBLISHED, LessonStatus.CANCELLED},
        LessonStatus.PUBLISHED: {LessonStatus.COMPLETED, LessonStatus.CANCELLED},
        LessonStatus.COMPLETED: set(),  # terminal
        LessonStatus.CANCELLED: set(),  # terminal
    }

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.coach_repo = CoachRepository(db)
        self.lesson_type_repo = LessonTypeRepository(db)
        self.lesson_repo = LessonRepository(db)
        self.registration_repo = LessonRegistrationRepository(db)
        self.booking_repo = BookingRepository(db)
        self.cpm_repo = ClubPlayerMembershipRepository(db)

    # ─── Coach Management ─────────────────────────────────────────────────────

    async def create_coach(
        self,
        club_id: UUID,
        payload: CoachCreateRequest,
    ) -> CoachResponse:
        # Validate optional user_id belongs to a user
        if payload.user_id:
            user = await self.db.get(User, payload.user_id)
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Linked user account not found",
                )

        coach = await self.coach_repo.create(
            club_id=club_id,
            name=payload.name,
            bio=payload.bio,
            specialization=payload.specialization,
            phone=payload.phone,
            email=payload.email,
            user_id=payload.user_id,
        )
        return CoachResponse.model_validate(coach)

    async def get_coach(self, coach_id: UUID, club_id: UUID) -> CoachResponse:
        coach = await self.coach_repo.get_by_id(coach_id, club_id=club_id)
        if not coach:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Coach not found",
            )
        return CoachResponse.model_validate(coach)

    async def list_coaches(
        self,
        club_id: UUID,
        is_active: bool | None = None,
    ) -> list[CoachResponse]:
        coaches = await self.coach_repo.list_by_club(club_id=club_id, is_active=is_active)
        return [CoachResponse.model_validate(c) for c in coaches]

    async def update_coach(
        self,
        coach_id: UUID,
        club_id: UUID,
        payload: CoachUpdateRequest,
    ) -> CoachResponse:
        coach = await self.coach_repo.get_by_id(coach_id, club_id=club_id)
        if not coach:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Coach not found",
            )

        if payload.user_id is not None:
            user = await self.db.get(User, payload.user_id)
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Linked user account not found",
                )
            coach.user_id = payload.user_id

        if payload.name is not None:
            coach.name = payload.name
        if payload.bio is not None:
            coach.bio = payload.bio
        if payload.specialization is not None:
            coach.specialization = payload.specialization
        if payload.phone is not None:
            coach.phone = payload.phone
        if payload.email is not None:
            coach.email = payload.email

        coach = await self.coach_repo.update(coach)
        return CoachResponse.model_validate(coach)

    async def deactivate_coach(self, coach_id: UUID, club_id: UUID) -> CoachResponse:
        coach = await self.coach_repo.get_by_id(coach_id, club_id=club_id)
        if not coach:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Coach not found",
            )
        coach.is_active = False
        coach = await self.coach_repo.update(coach)
        return CoachResponse.model_validate(coach)

    async def reactivate_coach(self, coach_id: UUID, club_id: UUID) -> CoachResponse:
        coach = await self.coach_repo.get_by_id(coach_id, club_id=club_id)
        if not coach:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Coach not found",
            )
        coach.is_active = True
        coach = await self.coach_repo.update(coach)
        return CoachResponse.model_validate(coach)

    # ─── Lesson Type Management ───────────────────────────────────────────────

    async def create_lesson_type(
        self,
        club_id: UUID,
        payload: LessonTypeCreateRequest,
    ) -> LessonTypeResponse:
        default_capacity = payload.default_capacity
        if payload.is_private and default_capacity is None:
            default_capacity = 1

        lesson_type = await self.lesson_type_repo.create(
            club_id=club_id,
            name=payload.name,
            description=payload.description,
            duration_minutes=payload.duration_minutes,
            default_capacity=default_capacity,
            default_price=payload.default_price,
            currency=payload.currency,
            is_private=payload.is_private,
        )
        return LessonTypeResponse.model_validate(lesson_type)

    async def get_lesson_type(self, lesson_type_id: UUID, club_id: UUID) -> LessonTypeResponse:
        lt = await self.lesson_type_repo.get_by_id(lesson_type_id, club_id=club_id)
        if not lt:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lesson type not found",
            )
        return LessonTypeResponse.model_validate(lt)

    async def list_lesson_types(
        self,
        club_id: UUID,
        is_active: bool | None = None,
    ) -> list[LessonTypeResponse]:
        types = await self.lesson_type_repo.list_by_club(club_id=club_id, is_active=is_active)
        return [LessonTypeResponse.model_validate(lt) for lt in types]

    async def update_lesson_type(
        self,
        lesson_type_id: UUID,
        club_id: UUID,
        payload: LessonTypeUpdateRequest,
    ) -> LessonTypeResponse:
        lt = await self.lesson_type_repo.get_by_id(lesson_type_id, club_id=club_id)
        if not lt:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lesson type not found",
            )

        if payload.name is not None:
            lt.name = payload.name
        if payload.description is not None:
            lt.description = payload.description
        if payload.duration_minutes is not None:
            lt.duration_minutes = payload.duration_minutes
        if payload.default_capacity is not None:
            lt.default_capacity = payload.default_capacity
        if payload.default_price is not None:
            lt.default_price = payload.default_price
        if payload.currency is not None:
            lt.currency = payload.currency
        if payload.is_private is not None:
            lt.is_private = payload.is_private
            if payload.is_private and lt.default_capacity is None:
                lt.default_capacity = 1

        lt = await self.lesson_type_repo.update(lt)
        return LessonTypeResponse.model_validate(lt)

    async def deactivate_lesson_type(self, lesson_type_id: UUID, club_id: UUID) -> LessonTypeResponse:
        lt = await self.lesson_type_repo.get_by_id(lesson_type_id, club_id=club_id)
        if not lt:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lesson type not found",
            )
        lt.is_active = False
        lt = await self.lesson_type_repo.update(lt)
        return LessonTypeResponse.model_validate(lt)

    async def reactivate_lesson_type(self, lesson_type_id: UUID, club_id: UUID) -> LessonTypeResponse:
        lt = await self.lesson_type_repo.get_by_id(lesson_type_id, club_id=club_id)
        if not lt:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lesson type not found",
            )
        lt.is_active = True
        lt = await self.lesson_type_repo.update(lt)
        return LessonTypeResponse.model_validate(lt)

    # ─── Lesson Management ────────────────────────────────────────────────────

    async def create_lesson(
        self,
        club_id: UUID,
        payload: LessonCreateRequest,
        created_by_user_id: UUID | None = None,
    ) -> LessonDetailResponse:
        # 1. Validate lesson type
        lesson_type = await self.lesson_type_repo.get_by_id(payload.lesson_type_id, club_id=club_id)
        if not lesson_type:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lesson type not found",
            )
        if not lesson_type.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot create a lesson with an inactive lesson type",
            )

        # 2. Validate coach
        coach = await self.coach_repo.get_by_id(payload.coach_id, club_id=club_id)
        if not coach:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Coach not found",
            )
        if not coach.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot assign an inactive coach to a lesson",
            )

        start_at = _ensure_utc(payload.start_at)
        end_at = _ensure_utc(payload.end_at)
        assert start_at is not None and end_at is not None

        # 3. Check Coach conflict
        coach_conflicts = await self.lesson_repo.find_coach_conflicts(
            coach_id=coach.id,
            start_at=start_at,
            end_at=end_at,
        )
        if coach_conflicts:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Coach is already scheduled for another lesson during this time",
            )

        # 4. Validate court if assigned
        court = None
        if payload.court_id:
            court = await self.db.get(Court, payload.court_id)
            if not court or court.club_id != club_id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Court not found in this club",
                )
            if court.status != CourtStatus.ACTIVE:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Court is inactive and cannot receive lessons",
                )

            # Check booking conflicts on court
            booking_conflicts = await self.booking_repo.find_conflicts(
                court_id=court.id,
                start_at=start_at,
                end_at=end_at,
            )
            if booking_conflicts:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Court is already booked for this time slot",
                )

            # Check other lesson conflicts on court
            lesson_court_conflicts = await self.lesson_repo.find_court_conflicts(
                court_id=court.id,
                start_at=start_at,
                end_at=end_at,
            )
            if lesson_court_conflicts:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Court is already reserved for another lesson at this time",
                )

        # 5. Determine price and capacity
        price = payload.price if payload.price is not None else lesson_type.default_price
        if lesson_type.is_private:
            capacity = 1
        else:
            capacity = payload.capacity if payload.capacity is not None else lesson_type.default_capacity

        lesson = await self.lesson_repo.create(
            club_id=club_id,
            lesson_type_id=lesson_type.id,
            coach_id=coach.id,
            court_id=court.id if court else None,
            title=payload.title,
            description=payload.description,
            start_at=start_at,
            end_at=end_at,
            capacity=capacity,
            price=price,
            currency=payload.currency,
            registration_opens_at=_ensure_utc(payload.registration_opens_at),
            registration_closes_at=_ensure_utc(payload.registration_closes_at),
            created_by_user_id=created_by_user_id,
            status=LessonStatus.DRAFT,
        )
        return await self._to_lesson_detail_response(lesson)

    async def get_lesson(self, lesson_id: UUID, club_id: UUID) -> LessonDetailResponse:
        lesson = await self.lesson_repo.get_by_id(lesson_id, club_id=club_id)
        if not lesson:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lesson not found",
            )
        return await self._to_lesson_detail_response(lesson)

    async def list_lessons(
        self,
        club_id: UUID,
        status_filter: LessonStatus | None = None,
        coach_id: UUID | None = None,
        lesson_type_id: UUID | None = None,
        court_id: UUID | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> list[LessonResponse]:
        lessons = await self.lesson_repo.list_by_club(
            club_id=club_id,
            status=status_filter,
            coach_id=coach_id,
            lesson_type_id=lesson_type_id,
            court_id=court_id,
            date_from=date_from,
            date_to=date_to,
            offset=offset,
            limit=limit,
        )
        return [await self._to_lesson_response(l) for l in lessons]

    async def update_lesson(
        self,
        lesson_id: UUID,
        club_id: UUID,
        payload: LessonUpdateRequest,
    ) -> LessonDetailResponse:
        lesson = await self.lesson_repo.get_by_id(lesson_id, club_id=club_id)
        if not lesson:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lesson not found",
            )

        # Completed and Cancelled lessons are immutable
        if lesson.status in [LessonStatus.COMPLETED, LessonStatus.CANCELLED]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot edit a lesson in '{lesson.status.value}' status",
            )

        start_at = _ensure_utc(payload.start_at) if payload.start_at else lesson.start_at
        end_at = _ensure_utc(payload.end_at) if payload.end_at else lesson.end_at
        assert start_at is not None and end_at is not None

        # Check Coach
        coach_id = payload.coach_id or lesson.coach_id
        if payload.coach_id:
            coach = await self.coach_repo.get_by_id(payload.coach_id, club_id=club_id)
            if not coach or not coach.is_active:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Selected coach is inactive or not found",
                )

        if payload.coach_id or payload.start_at or payload.end_at:
            coach_conflicts = await self.lesson_repo.find_coach_conflicts(
                coach_id=coach_id,
                start_at=start_at,
                end_at=end_at,
                exclude_lesson_id=lesson.id,
            )
            if coach_conflicts:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Coach is already scheduled for another lesson during this time",
                )

        # Check Court
        court_id = payload.court_id if payload.court_id is not None else lesson.court_id
        if court_id:
            court = await self.db.get(Court, court_id)
            if not court or court.club_id != club_id or court.status != CourtStatus.ACTIVE:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Court is inactive or not found",
                )

            booking_conflicts = await self.booking_repo.find_conflicts(
                court_id=court_id,
                start_at=start_at,
                end_at=end_at,
            )
            if booking_conflicts:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Court is already booked for this time slot",
                )

            court_conflicts = await self.lesson_repo.find_court_conflicts(
                court_id=court_id,
                start_at=start_at,
                end_at=end_at,
                exclude_lesson_id=lesson.id,
            )
            if court_conflicts:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Court is already reserved for another lesson at this time",
                )

        # Check lesson type
        if payload.lesson_type_id:
            lt = await self.lesson_type_repo.get_by_id(payload.lesson_type_id, club_id=club_id)
            if not lt or not lt.is_active:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Lesson type is inactive or not found",
                )
            lesson.lesson_type_id = lt.id
            if lt.is_private:
                lesson.capacity = 1

        lesson.coach_id = coach_id
        lesson.court_id = court_id
        lesson.start_at = start_at
        lesson.end_at = end_at

        if payload.title is not None:
            lesson.title = payload.title
        if payload.description is not None:
            lesson.description = payload.description
        if payload.price is not None:
            lesson.price = payload.price
        if payload.currency is not None:
            lesson.currency = payload.currency
        if payload.registration_opens_at is not None:
            lesson.registration_opens_at = _ensure_utc(payload.registration_opens_at)
        if payload.registration_closes_at is not None:
            lesson.registration_closes_at = _ensure_utc(payload.registration_closes_at)

        if payload.capacity is not None and not lesson.lesson_type.is_private:
            lesson.capacity = payload.capacity

        lesson = await self.lesson_repo.update(lesson)
        resp = await self._to_lesson_detail_response(lesson)
        try:
            await dispatch_event(
                event_type=EventType.LESSON_UPDATED,
                data={"lesson_id": str(lesson.id), "title": lesson.title, "status": lesson.status.value},
                club_id=club_id,
            )
        except Exception:
            pass
        return resp

    async def transition_status(
        self,
        lesson_id: UUID,
        club_id: UUID,
        target_status: LessonStatus,
    ) -> LessonDetailResponse:
        lesson = await self.lesson_repo.get_by_id(lesson_id, club_id=club_id)
        if not lesson:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lesson not found",
            )

        allowed = self.ALLOWED_TRANSITIONS.get(lesson.status, set())
        if target_status not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot transition lesson from '{lesson.status.value}' to '{target_status.value}'",
            )

        # Extra checks on publish
        if target_status == LessonStatus.PUBLISHED:
            now = datetime.now(timezone.utc)
            start_at = _ensure_utc(lesson.start_at)
            end_at = _ensure_utc(lesson.end_at)
            assert start_at is not None and end_at is not None
            if end_at <= now:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot publish a lesson that has already ended",
                )
            if not lesson.coach.is_active:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot publish lesson with an inactive coach",
                )
            # Re-verify coach conflict
            coach_conflicts = await self.lesson_repo.find_coach_conflicts(
                coach_id=lesson.coach_id,
                start_at=start_at,
                end_at=end_at,
                exclude_lesson_id=lesson.id,
            )
            if coach_conflicts:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Coach is already scheduled for another lesson during this time",
                )
            # Re-verify court conflict if assigned
            if lesson.court_id:
                if lesson.court and lesson.court.status != CourtStatus.ACTIVE:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Court assigned to lesson is inactive",
                    )
                court_conflicts = await self.lesson_repo.find_court_conflicts(
                    court_id=lesson.court_id,
                    start_at=start_at,
                    end_at=end_at,
                    exclude_lesson_id=lesson.id,
                )
                if court_conflicts:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Court is already reserved for another lesson at this time",
                    )

        # On cancel: cancel active registrations
        active_regs = []
        if target_status == LessonStatus.CANCELLED:
            active_regs = await self.registration_repo.list_by_lesson(
                lesson_id=lesson.id,
                status=LessonRegistrationStatus.REGISTERED,
            )
            now = datetime.now(timezone.utc)
            for reg in active_regs:
                reg.status = LessonRegistrationStatus.CANCELLED
                reg.cancelled_at = now
                await self.registration_repo.update(reg)

        lesson.status = target_status
        lesson = await self.lesson_repo.update(lesson)
        resp = await self._to_lesson_detail_response(lesson)

        try:
            if target_status == LessonStatus.PUBLISHED:
                await dispatch_event(
                    event_type=EventType.LESSON_PUBLISHED,
                    data={"lesson_id": str(lesson.id), "title": lesson.title, "status": lesson.status.value},
                    club_id=club_id,
                )
            elif target_status == LessonStatus.CANCELLED:
                await dispatch_event(
                    event_type=EventType.LESSON_CANCELLED,
                    data={"lesson_id": str(lesson.id), "title": lesson.title},
                    club_id=club_id,
                )
                notif_service = NotificationService(self.db)
                for reg in active_regs:
                    await notif_service.create_notification(
                        user_id=reg.user_id,
                        club_id=club_id,
                        category="lesson",
                        title="Lesson Cancelled",
                        message=f"Lesson '{lesson.title}' has been cancelled by the club.",
                        data={"lesson_id": str(lesson.id)},
                    )
            else:
                await dispatch_event(
                    event_type=EventType.LESSON_UPDATED,
                    data={"lesson_id": str(lesson.id), "title": lesson.title, "status": lesson.status.value},
                    club_id=club_id,
                )
            await self.db.commit()
        except Exception:
            pass

        return resp

    # ─── Player Registration ──────────────────────────────────────────────────

    async def register_player(
        self,
        lesson_id: UUID,
        user_id: UUID,
        notes: str | None = None,
        is_staff: bool = False,
    ) -> LessonRegistrationResponse:
        # Use get_for_update to lock lesson row and serialize capacity check
        lesson = await self.lesson_repo.get_for_update(lesson_id)
        if not lesson:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lesson not found",
            )

        # 1. Lesson Status Check
        if lesson.status != LessonStatus.PUBLISHED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot register for a lesson in '{lesson.status.value}' status",
            )

        now = datetime.now(timezone.utc)
        opens_at = _ensure_utc(lesson.registration_opens_at)
        closes_at = _ensure_utc(lesson.registration_closes_at)
        start_at = _ensure_utc(lesson.start_at)
        assert start_at is not None

        # 2. Registration Window Check
        if not is_staff:
            if opens_at and now < opens_at:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Registration is not open yet",
                )
            cutoff = closes_at or start_at
            if now > cutoff:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Registration has closed for this lesson",
                )
            if now >= start_at:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot register for a lesson that has already started",
                )

        # 3. Eligibility Check: Active ClubPlayerMembership required
        membership = await self.cpm_repo.get_by_user_and_club(user_id, lesson.club_id)
        if not membership or membership.status != PlayerMembershipStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Active club player membership is required to register for lessons",
            )

        # 4. Duplicate Active Registration Check
        existing = await self.registration_repo.get_active_registration_for_user(lesson_id, user_id)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User already has an active registration for this lesson",
            )

        # 5. Capacity Check
        active_count = await self.registration_repo.count_active_by_lesson(lesson_id)
        if lesson.capacity is not None and active_count >= lesson.capacity:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Lesson is full",
            )

        registration = await self.registration_repo.create(
            lesson_id=lesson_id,
            user_id=user_id,
            notes=notes,
            status=LessonRegistrationStatus.REGISTERED,
        )
        resp = self._to_registration_response(registration, lesson_title=lesson.title, lesson_start_at=lesson.start_at)

        try:
            active_count = await self.registration_repo.count_active_by_lesson(lesson_id)
            await dispatch_event(
                event_type=EventType.LESSON_REGISTRATION_CREATED,
                data={
                    "lesson_id": str(lesson.id),
                    "lesson_title": lesson.title,
                    "registration_id": str(registration.id),
                    "user_id": str(user_id),
                    "status": registration.status.value,
                    "participant_count": active_count,
                },
                club_id=lesson.club_id,
                user_id=user_id,
            )
            start_str = lesson.start_at.strftime("%b %d at %I:%M %p") if lesson.start_at else ""
            notif_svc = NotificationService(self.db)
            await notif_svc.create_notification(
                user_id=user_id,
                club_id=lesson.club_id,
                category="lesson",
                title="Lesson Registration Confirmed",
                message=f"You are registered for '{lesson.title}' on {start_str}.",
                data={"lesson_id": str(lesson.id)},
            )
            await notif_svc.notify_club_staff(
                club_id=lesson.club_id,
                category="lesson",
                title="Lesson Reminder",
                message=f"Lesson '{lesson.title}' has a new enrollment for {start_str}.",
                data={"lesson_id": str(lesson.id), "user_id": str(user_id)},
            )
            await self.db.commit()
        except Exception:
            pass

        return resp

    async def cancel_registration(
        self,
        lesson_id: UUID,
        registration_id: UUID,
        user_id: UUID | None = None,
        is_staff: bool = False,
    ) -> LessonRegistrationResponse:
        lesson = await self.lesson_repo.get_by_id(lesson_id)
        if not lesson:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lesson not found",
            )

        registration = await self.registration_repo.get_by_id(registration_id, lesson_id=lesson_id)
        if not registration:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Registration not found",
            )

        if not is_staff and user_id and registration.user_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only cancel your own registration",
            )

        if registration.status == LessonRegistrationStatus.CANCELLED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Registration is already cancelled",
            )

        if lesson.status == LessonStatus.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot cancel registration for a completed lesson",
            )

        registration.status = LessonRegistrationStatus.CANCELLED
        registration.cancelled_at = datetime.now(timezone.utc)
        registration = await self.registration_repo.update(registration)
        resp = self._to_registration_response(registration, lesson_title=lesson.title, lesson_start_at=lesson.start_at)

        try:
            active_count = await self.registration_repo.count_active_by_lesson(lesson_id)
            target_user = registration.user_id
            await dispatch_event(
                event_type=EventType.LESSON_REGISTRATION_CANCELLED,
                data={
                    "lesson_id": str(lesson.id),
                    "lesson_title": lesson.title,
                    "registration_id": str(registration.id),
                    "user_id": str(target_user),
                    "status": registration.status.value,
                    "participant_count": active_count,
                },
                club_id=lesson.club_id,
                user_id=target_user,
            )
            await NotificationService(self.db).create_notification(
                user_id=target_user,
                club_id=lesson.club_id,
                category="lesson",
                title="Lesson Registration Cancelled",
                message=f"Your enrollment for '{lesson.title}' was cancelled.",
                data={"lesson_id": str(lesson.id)},
            )
            await self.db.commit()
        except Exception:
            pass

        return resp

    async def mark_attendance(
        self,
        lesson_id: UUID,
        registration_id: UUID,
        club_id: UUID,
        target_status: LessonRegistrationStatus,
    ) -> LessonRegistrationResponse:
        if target_status not in [LessonRegistrationStatus.ATTENDED, LessonRegistrationStatus.NO_SHOW]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Target status must be 'attended' or 'no_show'",
            )

        lesson = await self.lesson_repo.get_by_id(lesson_id, club_id=club_id)
        if not lesson:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lesson not found",
            )

        registration = await self.registration_repo.get_by_id(registration_id, lesson_id=lesson_id)
        if not registration:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Registration not found",
            )

        if registration.status == LessonRegistrationStatus.CANCELLED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot mark attendance for a cancelled registration",
            )

        if registration.status in [LessonRegistrationStatus.ATTENDED, LessonRegistrationStatus.NO_SHOW]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Attendance has already been recorded as '{registration.status.value}'",
            )

        registration.status = target_status
        if target_status == LessonRegistrationStatus.ATTENDED:
            registration.attended_at = datetime.now(timezone.utc)
        registration = await self.registration_repo.update(registration)
        return self._to_registration_response(registration, lesson_title=lesson.title, lesson_start_at=lesson.start_at)

    async def list_registrations(
        self,
        lesson_id: UUID,
        club_id: UUID,
        status_filter: LessonRegistrationStatus | None = None,
    ) -> list[LessonRegistrationResponse]:
        lesson = await self.lesson_repo.get_by_id(lesson_id, club_id=club_id)
        if not lesson:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lesson not found",
            )
        regs = await self.registration_repo.list_by_lesson(lesson_id=lesson_id, status=status_filter)
        return [
            self._to_registration_response(r, lesson_title=lesson.title, lesson_start_at=lesson.start_at)
            for r in regs
        ]

    # ─── Player Discovery & My Lessons ────────────────────────────────────────

    async def discover_lessons(
        self,
        club_id: UUID,
        user_id: UUID,
        lesson_type_id: UUID | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        upcoming_only: bool = True,
        offset: int = 0,
        limit: int = 50,
    ) -> list[LessonResponse]:
        # Check if player has membership to this club
        membership = await self.cpm_repo.get_by_user_and_club(user_id, club_id)
        is_member = membership is not None and membership.status == PlayerMembershipStatus.ACTIVE

        lessons = await self.lesson_repo.list_player_discover(
            club_id=club_id,
            lesson_type_id=lesson_type_id,
            date_from=date_from,
            date_to=date_to,
            upcoming_only=upcoming_only,
            offset=offset,
            limit=limit,
        )
        return [await self._to_lesson_response(l) for l in lessons]

    async def get_player_lesson_detail(
        self,
        lesson_id: UUID,
        user_id: UUID,
    ) -> PlayerLessonDetailResponse:
        lesson = await self.lesson_repo.get_by_id(lesson_id)
        if not lesson or lesson.status == LessonStatus.DRAFT:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lesson not found",
            )

        base_resp = await self._to_lesson_response(lesson)
        my_reg = await self.registration_repo.get_active_registration_for_user(lesson_id, user_id)
        my_reg_resp = (
            self._to_registration_response(my_reg, lesson_title=lesson.title, lesson_start_at=lesson.start_at)
            if my_reg else None
        )

        # Check eligibility
        membership = await self.cpm_repo.get_by_user_and_club(user_id, lesson.club_id)
        is_eligible = membership is not None and membership.status == PlayerMembershipStatus.ACTIVE
        eligibility_reason = None if is_eligible else "Requires active club player membership"

        return PlayerLessonDetailResponse(
            **base_resp.model_dump(),
            my_registration=my_reg_resp,
            is_eligible=is_eligible,
            eligibility_reason=eligibility_reason,
        )

    async def list_my_registrations(
        self,
        user_id: UUID,
        status_filter: LessonRegistrationStatus | None = None,
        upcoming_only: bool = False,
        offset: int = 0,
        limit: int = 50,
    ) -> list[LessonRegistrationResponse]:
        regs = await self.registration_repo.list_by_user(
            user_id=user_id,
            status=status_filter,
            upcoming_only=upcoming_only,
            offset=offset,
            limit=limit,
        )
        return [
            self._to_registration_response(
                r,
                lesson_title=r.lesson.title if r.lesson else None,
                lesson_start_at=r.lesson.start_at if r.lesson else None,
            )
            for r in regs
        ]

    # ─── Converters ───────────────────────────────────────────────────────────

    async def _to_lesson_response(self, lesson: Lesson) -> LessonResponse:
        counts = await self.registration_repo.get_registration_counts(lesson.id)
        registered_count = counts["active_count"]

        available_spots = None
        if lesson.capacity is not None:
            available_spots = max(0, lesson.capacity - registered_count)

        now = datetime.now(timezone.utc)
        opens_at = _ensure_utc(lesson.registration_opens_at)
        closes_at = _ensure_utc(lesson.registration_closes_at)
        start_at = _ensure_utc(lesson.start_at)

        is_open = lesson.status == LessonStatus.PUBLISHED
        if is_open and opens_at and now < opens_at:
            is_open = False
        cutoff = closes_at or start_at
        if is_open and cutoff and now > cutoff:
            is_open = False
        if is_open and start_at and now >= start_at:
            is_open = False

        coach_name = lesson.coach.name if lesson.coach else None
        lesson_type_name = lesson.lesson_type.name if lesson.lesson_type else None
        court_name = lesson.court.name if lesson.court else None
        is_private = lesson.lesson_type.is_private if lesson.lesson_type else False
        duration_minutes = lesson.lesson_type.duration_minutes if lesson.lesson_type else 60

        return LessonResponse(
            id=lesson.id,
            club_id=lesson.club_id,
            lesson_type_id=lesson.lesson_type_id,
            coach_id=lesson.coach_id,
            court_id=lesson.court_id,
            title=lesson.title,
            description=lesson.description,
            start_at=lesson.start_at,
            end_at=lesson.end_at,
            capacity=lesson.capacity,
            price=lesson.price,
            currency=lesson.currency,
            status=lesson.status,
            registration_opens_at=lesson.registration_opens_at,
            registration_closes_at=lesson.registration_closes_at,
            created_by_user_id=lesson.created_by_user_id,
            created_at=lesson.created_at,
            updated_at=lesson.updated_at,
            coach_name=coach_name,
            lesson_type_name=lesson_type_name,
            court_name=court_name,
            is_private=is_private,
            duration_minutes=duration_minutes,
            registered_count=registered_count,
            available_spots=available_spots,
            is_registration_open=is_open,
        )

    async def _to_lesson_detail_response(self, lesson: Lesson) -> LessonDetailResponse:
        base = await self._to_lesson_response(lesson)
        coach_resp = CoachResponse.model_validate(lesson.coach) if lesson.coach else None
        lt_resp = LessonTypeResponse.model_validate(lesson.lesson_type) if lesson.lesson_type else None
        return LessonDetailResponse(
            **base.model_dump(),
            coach=coach_resp,
            lesson_type=lt_resp,
        )

    def _to_registration_response(
        self,
        reg: LessonRegistration,
        lesson_title: str | None = None,
        lesson_start_at: datetime | None = None,
    ) -> LessonRegistrationResponse:
        user_name = None
        user_email = None
        if reg.user:
            user_name = getattr(reg.user, "full_name", None) or reg.user.email
            user_email = reg.user.email

        return LessonRegistrationResponse(
            id=reg.id,
            lesson_id=reg.lesson_id,
            user_id=reg.user_id,
            status=reg.status,
            registered_at=reg.registered_at,
            cancelled_at=reg.cancelled_at,
            attended_at=reg.attended_at,
            notes=reg.notes,
            created_at=reg.created_at,
            updated_at=reg.updated_at,
            user_name=user_name,
            user_email=user_email,
            lesson_title=lesson_title,
            lesson_start_at=lesson_start_at,
        )
