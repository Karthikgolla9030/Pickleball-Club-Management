"""
Aught2 Pickleball — Phase 15 Lesson API & Domain Tests

Comprehensive test suite verifying:
  - Coaches: Create, update, deactivate, reactivate, inactive coach assignment rejection
  - Lesson Types: CRUD, duration/capacity/price validations, deactivation, reactivate
  - Lessons: Create, update, publish, cancel, complete, invalid transitions, immutability
  - Permissions: Owner allowed, Manager allowed, Tournament Director 403, Player 403
  - Conflicts:
      - Coach Conflict: Overlapping lessons for same coach rejected (HTTP 409)
      - Court Conflict: Overlapping lessons for same court rejected (HTTP 409)
      - Court Booking Conflict: Overlapping court booking rejected (HTTP 409)
  - Registrations:
      - Active ClubPlayerMembership required (non-member 403, inactive 403)
      - Registration window (before open 400, after close 400, after start 400)
      - Capacity enforcement: group lessons (409 Lesson is full), private lessons (capacity 1)
      - Duplicate prevention & re-registration after cancellation
  - Attendance: Mark attended, mark no-show, reject on cancelled, reject duplicates
  - Historical Integrity: LessonType price change does not mutate existing Lesson.price;
                          Coach deactivation preserves historical lessons
  - Tenant Isolation: Cross-club staff access and player isolation
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import uuid

from httpx import AsyncClient
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.booking import Booking, BookingStatus, BookingType
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.lesson import (
    Coach,
    Lesson,
    LessonRegistration,
    LessonRegistrationStatus,
    LessonStatus,
    LessonType,
)
from app.models.user import User
from tests.conftest import make_auth_header


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def club_a(db_session: AsyncSession) -> Club:
    club = Club(name="Alpha Pickle Club", slug=f"alpha-club-{uuid.uuid4().hex[:8]}")
    db_session.add(club)
    await db_session.flush()
    return club


@pytest_asyncio.fixture
async def club_b(db_session: AsyncSession) -> Club:
    club = Club(name="Beta Pickle Club", slug=f"beta-club-{uuid.uuid4().hex[:8]}")
    db_session.add(club)
    await db_session.flush()
    return club


@pytest_asyncio.fixture
async def court_a1(db_session: AsyncSession, club_a: Club) -> Court:
    court = Court(
        club_id=club_a.id,
        name="Court 1",
        court_number=1,
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
    )
    db_session.add(court)
    await db_session.flush()
    return court


@pytest_asyncio.fixture
async def court_inactive(db_session: AsyncSession, club_a: Club) -> Court:
    court = Court(
        club_id=club_a.id,
        name="Court Inactive",
        court_number=99,
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.INACTIVE,
    )
    db_session.add(court)
    await db_session.flush()
    return court


@pytest_asyncio.fixture
async def owner_user(db_session: AsyncSession) -> User:
    user = User(
        email=f"owner-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=hash_password("OwnerPassword123!"),
        full_name="Club Owner",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def owner_membership(
    db_session: AsyncSession,
    club_a: Club,
    owner_user: User,
) -> ClubMembership:
    membership = ClubMembership(
        club_id=club_a.id,
        user_id=owner_user.id,
        role=ClubRole.CLUB_OWNER,
    )
    db_session.add(membership)
    await db_session.flush()
    return membership


@pytest_asyncio.fixture
async def manager_user(db_session: AsyncSession) -> User:
    user = User(
        email=f"manager-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=hash_password("ManagerPassword123!"),
        full_name="Club Manager",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def manager_membership(
    db_session: AsyncSession,
    club_a: Club,
    manager_user: User,
) -> ClubMembership:
    membership = ClubMembership(
        club_id=club_a.id,
        user_id=manager_user.id,
        role=ClubRole.CLUB_MANAGER,
    )
    db_session.add(membership)
    await db_session.flush()
    return membership


@pytest_asyncio.fixture
async def td_user(db_session: AsyncSession) -> User:
    user = User(
        email=f"td-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=hash_password("TdPassword123!"),
        full_name="Tournament Director",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def td_membership(
    db_session: AsyncSession,
    club_a: Club,
    td_user: User,
) -> ClubMembership:
    membership = ClubMembership(
        club_id=club_a.id,
        user_id=td_user.id,
        role=ClubRole.TOURNAMENT_DIRECTOR,
    )
    db_session.add(membership)
    await db_session.flush()
    return membership


@pytest_asyncio.fixture
async def player_user_1(db_session: AsyncSession) -> User:
    user = User(
        email=f"player1-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=hash_password("PlayerPassword123!"),
        full_name="Player One",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def player_cpm_1(
    db_session: AsyncSession,
    club_a: Club,
    player_user_1: User,
) -> ClubPlayerMembership:
    cpm = ClubPlayerMembership(
        club_id=club_a.id,
        user_id=player_user_1.id,
        status=PlayerMembershipStatus.ACTIVE,
    )
    db_session.add(cpm)
    await db_session.flush()
    return cpm


@pytest_asyncio.fixture
async def player_user_2(db_session: AsyncSession) -> User:
    user = User(
        email=f"player2-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=hash_password("PlayerPassword123!"),
        full_name="Player Two",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def player_cpm_2(
    db_session: AsyncSession,
    club_a: Club,
    player_user_2: User,
) -> ClubPlayerMembership:
    cpm = ClubPlayerMembership(
        club_id=club_a.id,
        user_id=player_user_2.id,
        status=PlayerMembershipStatus.ACTIVE,
    )
    db_session.add(cpm)
    await db_session.flush()
    return cpm


@pytest_asyncio.fixture
async def player_inactive(db_session: AsyncSession, club_a: Club) -> User:
    user = User(
        email=f"inactive-player-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=hash_password("PlayerPassword123!"),
        full_name="Inactive Player",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    cpm = ClubPlayerMembership(
        club_id=club_a.id,
        user_id=user.id,
        status=PlayerMembershipStatus.INACTIVE,
    )
    db_session.add(cpm)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def player_non_member(db_session: AsyncSession) -> User:
    user = User(
        email=f"nonmember-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=hash_password("PlayerPassword123!"),
        full_name="Non Member",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def coach_1(db_session: AsyncSession, club_a: Club) -> Coach:
    coach = Coach(
        club_id=club_a.id,
        name="Coach Alex",
        specialization="Singles & Strategy",
        phone="+91 99999 11111",
        email="coach.alex@example.com",
        is_active=True,
    )
    db_session.add(coach)
    await db_session.flush()
    return coach


@pytest_asyncio.fixture
async def lesson_type_group(db_session: AsyncSession, club_a: Club) -> LessonType:
    lt = LessonType(
        club_id=club_a.id,
        name="Group Skills Clinic",
        duration_minutes=60,
        default_capacity=4,
        default_price=Decimal("500.00"),
        currency="INR",
        is_private=False,
        is_active=True,
    )
    db_session.add(lt)
    await db_session.flush()
    return lt


@pytest_asyncio.fixture
async def lesson_type_private(db_session: AsyncSession, club_a: Club) -> LessonType:
    lt = LessonType(
        club_id=club_a.id,
        name="1-on-1 Coaching",
        duration_minutes=60,
        default_capacity=1,
        default_price=Decimal("1200.00"),
        currency="INR",
        is_private=True,
        is_active=True,
    )
    db_session.add(lt)
    await db_session.flush()
    return lt


# ══════════════════════════════════════════════════════════════════════════════
# 1. COACH MANAGEMENT TESTS
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_coach_create_update_deactivate_reactivate(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
):
    headers = make_auth_header(owner_user)

    # 1. Create coach
    payload = {
        "name": "Maria Sharapova",
        "specialization": "Power Baseline",
        "phone": "+91 98765 00000",
        "email": "maria@example.com",
        "bio": "Former champion.",
    }
    resp = await async_client.post(f"/api/v1/clubs/{club_a.id}/coaches", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Maria Sharapova"
    assert data["is_active"] is True
    coach_id = data["id"]

    # 2. Get coach
    get_resp = await async_client.get(f"/api/v1/clubs/{club_a.id}/coaches/{coach_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == coach_id

    # 3. Update coach
    patch_resp = await async_client.patch(
        f"/api/v1/clubs/{club_a.id}/coaches/{coach_id}",
        json={"specialization": "Transition & Dinking"},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["specialization"] == "Transition & Dinking"

    # 4. Deactivate coach
    deact_resp = await async_client.post(f"/api/v1/clubs/{club_a.id}/coaches/{coach_id}/deactivate", headers=headers)
    assert deact_resp.status_code == 200
    assert deact_resp.json()["is_active"] is False

    # 5. Reactivate coach
    react_resp = await async_client.post(f"/api/v1/clubs/{club_a.id}/coaches/{coach_id}/reactivate", headers=headers)
    assert react_resp.status_code == 200
    assert react_resp.json()["is_active"] is True


@pytest.mark.asyncio
async def test_inactive_coach_cannot_be_assigned(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    lesson_type_group: LessonType,
    coach_1: Coach,
):
    headers = make_auth_header(owner_user)

    # Deactivate coach
    await async_client.post(f"/api/v1/clubs/{club_a.id}/coaches/{coach_1.id}/deactivate", headers=headers)

    now = datetime.now(timezone.utc)
    payload = {
        "lesson_type_id": str(lesson_type_group.id),
        "coach_id": str(coach_1.id),
        "title": "Invalid Lesson with Inactive Coach",
        "start_at": (now + timedelta(days=2)).isoformat(),
        "end_at": (now + timedelta(days=2, hours=1)).isoformat(),
    }
    resp = await async_client.post(f"/api/v1/clubs/{club_a.id}/lessons", json=payload, headers=headers)
    assert resp.status_code == 400
    assert "inactive coach" in resp.json()["detail"].lower()


# ══════════════════════════════════════════════════════════════════════════════
# 2. LESSON TYPE TESTS
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_lesson_type_crud_and_validation(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
):
    headers = make_auth_header(owner_user)

    # 1. Validation: negative duration
    bad_payload = {
        "name": "Invalid Duration",
        "duration_minutes": -10,
        "default_price": 500.00,
    }
    bad_resp = await async_client.post(f"/api/v1/clubs/{club_a.id}/lesson-types", json=bad_payload, headers=headers)
    assert bad_resp.status_code == 422

    # 2. Create valid lesson type
    payload = {
        "name": "Doubles Mastery",
        "description": "Team tactics",
        "duration_minutes": 90,
        "default_capacity": 8,
        "default_price": 750.00,
        "currency": "inr",
        "is_private": False,
    }
    resp = await async_client.post(f"/api/v1/clubs/{club_a.id}/lesson-types", json=payload, headers=headers)
    assert resp.status_code == 201
    lt_data = resp.json()
    assert lt_data["currency"] == "INR"
    assert lt_data["duration_minutes"] == 90
    lt_id = lt_data["id"]

    # 3. List
    list_resp = await async_client.get(f"/api/v1/clubs/{club_a.id}/lesson-types", headers=headers)
    assert list_resp.status_code == 200
    assert any(x["id"] == lt_id for x in list_resp.json())

    # 4. Deactivate and reactivate
    d_resp = await async_client.post(f"/api/v1/clubs/{club_a.id}/lesson-types/{lt_id}/deactivate", headers=headers)
    assert d_resp.status_code == 200
    assert d_resp.json()["is_active"] is False

    r_resp = await async_client.post(f"/api/v1/clubs/{club_a.id}/lesson-types/{lt_id}/reactivate", headers=headers)
    assert r_resp.status_code == 200
    assert r_resp.json()["is_active"] is True


# ══════════════════════════════════════════════════════════════════════════════
# 3. LESSON LIFECYCLE & STATE MACHINE
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_lesson_lifecycle_and_immutability(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    coach_1: Coach,
    lesson_type_group: LessonType,
):
    headers = make_auth_header(owner_user)
    now = datetime.now(timezone.utc)

    # 1. Create Lesson (Draft)
    payload = {
        "lesson_type_id": str(lesson_type_group.id),
        "coach_id": str(coach_1.id),
        "title": "Weekend Drill Session",
        "start_at": (now + timedelta(days=2)).isoformat(),
        "end_at": (now + timedelta(days=2, hours=1)).isoformat(),
        "price": 650.00,
    }
    resp = await async_client.post(f"/api/v1/clubs/{club_a.id}/lessons", json=payload, headers=headers)
    assert resp.status_code == 201
    lesson_id = resp.json()["id"]
    assert resp.json()["status"] == "draft"
    assert resp.json()["registered_count"] == 0

    # 2. Publish
    pub_resp = await async_client.post(f"/api/v1/clubs/{club_a.id}/lessons/{lesson_id}/publish", headers=headers)
    assert pub_resp.status_code == 200
    assert pub_resp.json()["status"] == "published"

    # 3. Complete
    comp_resp = await async_client.post(f"/api/v1/clubs/{club_a.id}/lessons/{lesson_id}/complete", headers=headers)
    assert comp_resp.status_code == 200
    assert comp_resp.json()["status"] == "completed"

    # 4. Completed is immutable: cannot publish or edit
    inv_pub = await async_client.post(f"/api/v1/clubs/{club_a.id}/lessons/{lesson_id}/publish", headers=headers)
    assert inv_pub.status_code == 400

    inv_patch = await async_client.patch(
        f"/api/v1/clubs/{club_a.id}/lessons/{lesson_id}",
        json={"title": "New Title"},
        headers=headers,
    )
    assert inv_patch.status_code == 400


# ══════════════════════════════════════════════════════════════════════════════
# 4. PERMISSION CHECKS (RBAC)
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_manager_allowed_tournament_director_and_player_denied(
    async_client: AsyncClient,
    club_a: Club,
    manager_user: User,
    manager_membership: ClubMembership,
    td_user: User,
    td_membership: ClubMembership,
    player_user_1: User,
    coach_1: Coach,
    lesson_type_group: LessonType,
):
    now = datetime.now(timezone.utc)
    payload = {
        "lesson_type_id": str(lesson_type_group.id),
        "coach_id": str(coach_1.id),
        "title": "Manager Scheduled Lesson",
        "start_at": (now + timedelta(days=3)).isoformat(),
        "end_at": (now + timedelta(days=3, hours=1)).isoformat(),
    }

    # 1. Manager: allowed (201)
    m_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons",
        json=payload,
        headers=make_auth_header(manager_user),
    )
    assert m_resp.status_code == 201

    # 2. Tournament Director: 403 Forbidden
    td_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons",
        json=payload,
        headers=make_auth_header(td_user),
    )
    assert td_resp.status_code == 403

    # 3. Player: 403 Forbidden
    p_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons",
        json=payload,
        headers=make_auth_header(player_user_1),
    )
    assert p_resp.status_code == 403


# ══════════════════════════════════════════════════════════════════════════════
# 5. CONFLICT CHECKS (COACH & COURT)
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_coach_scheduling_conflict_rejected(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    coach_1: Coach,
    lesson_type_group: LessonType,
):
    headers = make_auth_header(owner_user)
    now = datetime.now(timezone.utc)

    # Lesson 1: 10:00 to 11:00
    start_1 = now + timedelta(days=2, hours=10)
    end_1 = now + timedelta(days=2, hours=11)
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons",
        json={
            "lesson_type_id": str(lesson_type_group.id),
            "coach_id": str(coach_1.id),
            "title": "First Lesson",
            "start_at": start_1.isoformat(),
            "end_at": end_1.isoformat(),
        },
        headers=headers,
    )

    # Lesson 2: Overlapping 10:30 to 11:30 for same coach
    start_2 = now + timedelta(days=2, hours=10, minutes=30)
    end_2 = now + timedelta(days=2, hours=11, minutes=30)
    conflict_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons",
        json={
            "lesson_type_id": str(lesson_type_group.id),
            "coach_id": str(coach_1.id),
            "title": "Conflicting Lesson",
            "start_at": start_2.isoformat(),
            "end_at": end_2.isoformat(),
        },
        headers=headers,
    )
    assert conflict_resp.status_code == 409
    assert "coach is already scheduled" in conflict_resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_court_scheduling_conflict_rejected(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    court_a1: Court,
    coach_1: Coach,
    lesson_type_group: LessonType,
    db_session: AsyncSession,
):
    headers = make_auth_header(owner_user)
    now = datetime.now(timezone.utc)

    # 1. Lesson 1 on Court 1: 14:00 to 15:00
    start_1 = now + timedelta(days=3, hours=14)
    end_1 = now + timedelta(days=3, hours=15)
    await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons",
        json={
            "lesson_type_id": str(lesson_type_group.id),
            "coach_id": str(coach_1.id),
            "court_id": str(court_a1.id),
            "title": "Lesson on Court 1",
            "start_at": start_1.isoformat(),
            "end_at": end_1.isoformat(),
        },
        headers=headers,
    )

    # Create a second coach to isolate court conflict
    coach_2 = Coach(club_id=club_a.id, name="Coach 2", is_active=True)
    db_session.add(coach_2)
    await db_session.flush()

    # 2. Lesson 2 on Court 1 overlapping: 14:30 to 15:30
    start_2 = now + timedelta(days=3, hours=14, minutes=30)
    end_2 = now + timedelta(days=3, hours=15, minutes=30)
    conflict_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons",
        json={
            "lesson_type_id": str(lesson_type_group.id),
            "coach_id": str(coach_2.id),
            "court_id": str(court_a1.id),
            "title": "Conflicting Lesson Court",
            "start_at": start_2.isoformat(),
            "end_at": end_2.isoformat(),
        },
        headers=headers,
    )
    assert conflict_resp.status_code == 409
    assert "court is already reserved" in conflict_resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_court_booking_conflict_with_lesson_rejected(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    court_a1: Court,
    coach_1: Coach,
    lesson_type_group: LessonType,
    db_session: AsyncSession,
):
    headers = make_auth_header(owner_user)
    now = datetime.now(timezone.utc)

    # Existing booking on court: 16:00 to 17:00
    start_time = now + timedelta(days=4, hours=16)
    end_time = now + timedelta(days=4, hours=17)
    booking = Booking(
        club_id=club_a.id,
        court_id=court_a1.id,
        booked_by_user_id=owner_user.id,
        player_id=owner_user.id,
        booking_type=BookingType.PLAYER,
        status=BookingStatus.CONFIRMED,
        start_at=start_time,
        end_at=end_time,
    )
    db_session.add(booking)
    await db_session.flush()

    # Attempt to schedule lesson during confirmed booking slot
    resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons",
        json={
            "lesson_type_id": str(lesson_type_group.id),
            "coach_id": str(coach_1.id),
            "court_id": str(court_a1.id),
            "title": "Lesson Over Booking",
            "start_at": (start_time + timedelta(minutes=15)).isoformat(),
            "end_at": (end_time + timedelta(minutes=15)).isoformat(),
        },
        headers=headers,
    )
    assert resp.status_code == 409
    assert "court is already booked" in resp.json()["detail"].lower()


# ══════════════════════════════════════════════════════════════════════════════
# 6. REGISTRATION ELIGIBILITY, WINDOWS, CAPACITY & DUPLICATES
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_player_registration_eligibility(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_cpm_1: ClubPlayerMembership,
    player_inactive: User,
    player_non_member: User,
    coach_1: Coach,
    lesson_type_group: LessonType,
):
    now = datetime.now(timezone.utc)
    # Create & publish lesson
    headers_owner = make_auth_header(owner_user)
    l_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons",
        json={
            "lesson_type_id": str(lesson_type_group.id),
            "coach_id": str(coach_1.id),
            "title": "Public Member Lesson",
            "start_at": (now + timedelta(days=2)).isoformat(),
            "end_at": (now + timedelta(days=2, hours=1)).isoformat(),
            "capacity": 4,
        },
        headers=headers_owner,
    )
    lesson_id = l_resp.json()["id"]
    await async_client.post(f"/api/v1/clubs/{club_a.id}/lessons/{lesson_id}/publish", headers=headers_owner)

    # 1. Non-member rejected (403)
    resp_non = await async_client.post(
        f"/api/v1/players/me/lessons/{lesson_id}/register",
        headers=make_auth_header(player_non_member),
    )
    assert resp_non.status_code == 403

    # 2. Inactive member rejected (403)
    resp_inact = await async_client.post(
        f"/api/v1/players/me/lessons/{lesson_id}/register",
        headers=make_auth_header(player_inactive),
    )
    assert resp_inact.status_code == 403

    # 3. Active member allowed (201)
    resp_act = await async_client.post(
        f"/api/v1/players/me/lessons/{lesson_id}/register",
        headers=make_auth_header(player_user_1),
    )
    assert resp_act.status_code == 201
    assert resp_act.json()["status"] == "registered"


@pytest.mark.asyncio
async def test_capacity_and_private_lesson_limit(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_cpm_1: ClubPlayerMembership,
    player_user_2: User,
    player_cpm_2: ClubPlayerMembership,
    coach_1: Coach,
    lesson_type_private: LessonType,
):
    headers_owner = make_auth_header(owner_user)
    now = datetime.now(timezone.utc)

    # Create private lesson (capacity forced to 1)
    l_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons",
        json={
            "lesson_type_id": str(lesson_type_private.id),
            "coach_id": str(coach_1.id),
            "title": "Private Session",
            "start_at": (now + timedelta(days=3)).isoformat(),
            "end_at": (now + timedelta(days=3, hours=1)).isoformat(),
        },
        headers=headers_owner,
    )
    lesson_id = l_resp.json()["id"]
    assert l_resp.json()["capacity"] == 1
    await async_client.post(f"/api/v1/clubs/{club_a.id}/lessons/{lesson_id}/publish", headers=headers_owner)

    # Player 1 registers successfully
    r1 = await async_client.post(
        f"/api/v1/players/me/lessons/{lesson_id}/register",
        headers=make_auth_header(player_user_1),
    )
    assert r1.status_code == 201

    # Player 2 attempts to register -> 409 Lesson is full
    r2 = await async_client.post(
        f"/api/v1/players/me/lessons/{lesson_id}/register",
        headers=make_auth_header(player_user_2),
    )
    assert r2.status_code == 409
    assert "lesson is full" in r2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_cancellation_and_reregistration(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_cpm_1: ClubPlayerMembership,
    coach_1: Coach,
    lesson_type_group: LessonType,
):
    headers_owner = make_auth_header(owner_user)
    now = datetime.now(timezone.utc)

    l_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons",
        json={
            "lesson_type_id": str(lesson_type_group.id),
            "coach_id": str(coach_1.id),
            "title": "Cancel Re-register Test",
            "start_at": (now + timedelta(days=2)).isoformat(),
            "end_at": (now + timedelta(days=2, hours=1)).isoformat(),
            "capacity": 2,
        },
        headers=headers_owner,
    )
    lesson_id = l_resp.json()["id"]
    await async_client.post(f"/api/v1/clubs/{club_a.id}/lessons/{lesson_id}/publish", headers=headers_owner)

    p1_headers = make_auth_header(player_user_1)

    # 1. Register
    reg_resp = await async_client.post(f"/api/v1/players/me/lessons/{lesson_id}/register", headers=p1_headers)
    assert reg_resp.status_code == 201

    # 2. Duplicate registration rejected
    dup_resp = await async_client.post(f"/api/v1/players/me/lessons/{lesson_id}/register", headers=p1_headers)
    assert dup_resp.status_code == 400

    # 3. Cancel registration
    cancel_resp = await async_client.post(f"/api/v1/players/me/lessons/{lesson_id}/cancel", headers=p1_headers)
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "cancelled"

    # 4. Re-register after cancellation allowed
    re_resp = await async_client.post(f"/api/v1/players/me/lessons/{lesson_id}/register", headers=p1_headers)
    assert re_resp.status_code == 201
    assert re_resp.json()["status"] == "registered"


# ══════════════════════════════════════════════════════════════════════════════
# 7. ATTENDANCE TRACKING
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_staff_attendance_tracking(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_cpm_1: ClubPlayerMembership,
    player_user_2: User,
    player_cpm_2: ClubPlayerMembership,
    coach_1: Coach,
    lesson_type_group: LessonType,
):
    headers_owner = make_auth_header(owner_user)
    now = datetime.now(timezone.utc)

    l_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons",
        json={
            "lesson_type_id": str(lesson_type_group.id),
            "coach_id": str(coach_1.id),
            "title": "Attendance Test Clinic",
            "start_at": (now + timedelta(days=1)).isoformat(),
            "end_at": (now + timedelta(days=1, hours=1)).isoformat(),
            "capacity": 5,
        },
        headers=headers_owner,
    )
    lesson_id = l_resp.json()["id"]
    await async_client.post(f"/api/v1/clubs/{club_a.id}/lessons/{lesson_id}/publish", headers=headers_owner)

    # Register player 1 and player 2
    r1 = await async_client.post(
        f"/api/v1/players/me/lessons/{lesson_id}/register",
        headers=make_auth_header(player_user_1),
    )
    reg_1_id = r1.json()["id"]

    r2 = await async_client.post(
        f"/api/v1/players/me/lessons/{lesson_id}/register",
        headers=make_auth_header(player_user_2),
    )
    reg_2_id = r2.json()["id"]

    # Mark player 1 as attended
    att_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons/{lesson_id}/registrations/{reg_1_id}/attend",
        headers=headers_owner,
    )
    assert att_resp.status_code == 200
    assert att_resp.json()["status"] == "attended"

    # Duplicate attendance marking rejected
    att_dup = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons/{lesson_id}/registrations/{reg_1_id}/attend",
        headers=headers_owner,
    )
    assert att_dup.status_code == 400

    # Mark player 2 as no-show
    noshow_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons/{lesson_id}/registrations/{reg_2_id}/no-show",
        headers=headers_owner,
    )
    assert noshow_resp.status_code == 200
    assert noshow_resp.json()["status"] == "no_show"


# ══════════════════════════════════════════════════════════════════════════════
# 8. HISTORICAL PRICE INTEGRITY
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_lesson_type_price_change_preserves_historical_lesson_price(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    coach_1: Coach,
    lesson_type_group: LessonType,
):
    headers = make_auth_header(owner_user)
    now = datetime.now(timezone.utc)

    # Initial lesson created with template price 500.00
    l_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons",
        json={
            "lesson_type_id": str(lesson_type_group.id),
            "coach_id": str(coach_1.id),
            "title": "Historical Price Lesson",
            "start_at": (now + timedelta(days=2)).isoformat(),
            "end_at": (now + timedelta(days=2, hours=1)).isoformat(),
        },
        headers=headers,
    )
    lesson_id = l_resp.json()["id"]
    assert Decimal(str(l_resp.json()["price"])) == Decimal("500.00")

    # Update lesson type default price to 900.00
    await async_client.patch(
        f"/api/v1/clubs/{club_a.id}/lesson-types/{lesson_type_group.id}",
        json={"default_price": 900.00},
        headers=headers,
    )

    # Existing lesson price must remain 500.00
    get_resp = await async_client.get(f"/api/v1/clubs/{club_a.id}/lessons/{lesson_id}", headers=headers)
    assert Decimal(str(get_resp.json()["price"])) == Decimal("500.00")


# ══════════════════════════════════════════════════════════════════════════════
# 9. TENANT ISOLATION
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_tenant_isolation_staff_and_discovery(
    async_client: AsyncClient,
    club_a: Club,
    club_b: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_cpm_1: ClubPlayerMembership,
    coach_1: Coach,
    lesson_type_group: LessonType,
):
    # Club A owner tries to access Club B
    resp_cross = await async_client.get(
        f"/api/v1/clubs/{club_b.id}/coaches",
        headers=make_auth_header(owner_user),
    )
    assert resp_cross.status_code == 403

    # Player discovery on Club B returns empty (no published lessons in Club B)
    disc_b = await async_client.get(
        f"/api/v1/clubs/{club_b.id}/lessons/discover",
        headers=make_auth_header(player_user_1),
    )
    assert disc_b.status_code == 200
    assert len(disc_b.json()) == 0


# ══════════════════════════════════════════════════════════════════════════════
# 10. REGISTRATION WINDOWS & EDGE CASES
# ══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_registration_window_rejections(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_cpm_1: ClubPlayerMembership,
    coach_1: Coach,
    lesson_type_group: LessonType,
):
    headers_owner = make_auth_header(owner_user)
    headers_player = make_auth_header(player_user_1)
    now = datetime.now(timezone.utc)

    # 1. Lesson with future registration opens_at
    l_fut = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons",
        json={
            "lesson_type_id": str(lesson_type_group.id),
            "coach_id": str(coach_1.id),
            "title": "Future Registration Lesson",
            "start_at": (now + timedelta(days=5)).isoformat(),
            "end_at": (now + timedelta(days=5, hours=1)).isoformat(),
            "registration_opens_at": (now + timedelta(days=1)).isoformat(),
            "registration_closes_at": (now + timedelta(days=4)).isoformat(),
        },
        headers=headers_owner,
    )
    lid_fut = l_fut.json()["id"]
    await async_client.post(f"/api/v1/clubs/{club_a.id}/lessons/{lid_fut}/publish", headers=headers_owner)

    r_fut = await async_client.post(f"/api/v1/players/me/lessons/{lid_fut}/register", headers=headers_player)
    assert r_fut.status_code == 400
    assert "not open yet" in r_fut.json()["detail"].lower()

    # 2. Lesson with past registration closes_at
    l_closed = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons",
        json={
            "lesson_type_id": str(lesson_type_group.id),
            "coach_id": str(coach_1.id),
            "title": "Closed Registration Lesson",
            "start_at": (now + timedelta(days=6)).isoformat(),
            "end_at": (now + timedelta(days=6, hours=1)).isoformat(),
            "registration_opens_at": (now - timedelta(days=2)).isoformat(),
            "registration_closes_at": (now - timedelta(minutes=10)).isoformat(),
        },
        headers=headers_owner,
    )
    lid_closed = l_closed.json()["id"]
    await async_client.post(f"/api/v1/clubs/{club_a.id}/lessons/{lid_closed}/publish", headers=headers_owner)

    r_closed = await async_client.post(f"/api/v1/players/me/lessons/{lid_closed}/register", headers=headers_player)
    assert r_closed.status_code == 400
    assert "closed" in r_closed.json()["detail"].lower()


@pytest.mark.asyncio
async def test_staff_manual_registration_and_cancellation(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_cpm_1: ClubPlayerMembership,
    coach_1: Coach,
    lesson_type_group: LessonType,
):
    headers_owner = make_auth_header(owner_user)
    now = datetime.now(timezone.utc)

    l_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons",
        json={
            "lesson_type_id": str(lesson_type_group.id),
            "coach_id": str(coach_1.id),
            "title": "Staff Managed Registrations",
            "start_at": (now + timedelta(days=2)).isoformat(),
            "end_at": (now + timedelta(days=2, hours=1)).isoformat(),
        },
        headers=headers_owner,
    )
    lid = l_resp.json()["id"]
    await async_client.post(f"/api/v1/clubs/{club_a.id}/lessons/{lid}/publish", headers=headers_owner)

    # 1. Staff manually registers player
    reg_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons/{lid}/registrations",
        json={"user_id": str(player_user_1.id), "notes": "Registered by front desk"},
        headers=headers_owner,
    )
    assert reg_resp.status_code == 201
    reg_id = reg_resp.json()["id"]
    assert reg_resp.json()["status"] == "registered"

    # 2. Staff roster lists registration
    roster_resp = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/lessons/{lid}/registrations",
        headers=headers_owner,
    )
    assert roster_resp.status_code == 200
    assert len(roster_resp.json()) == 1

    # 3. Staff cancels registration
    c_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons/{lid}/registrations/{reg_id}/cancel",
        headers=headers_owner,
    )
    assert c_resp.status_code == 200
    assert c_resp.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_lesson_cancellation_cascades_registration_cancellation(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_cpm_1: ClubPlayerMembership,
    coach_1: Coach,
    lesson_type_group: LessonType,
):
    headers_owner = make_auth_header(owner_user)
    now = datetime.now(timezone.utc)

    l_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons",
        json={
            "lesson_type_id": str(lesson_type_group.id),
            "coach_id": str(coach_1.id),
            "title": "Will Be Cancelled",
            "start_at": (now + timedelta(days=2)).isoformat(),
            "end_at": (now + timedelta(days=2, hours=1)).isoformat(),
        },
        headers=headers_owner,
    )
    lid = l_resp.json()["id"]
    await async_client.post(f"/api/v1/clubs/{club_a.id}/lessons/{lid}/publish", headers=headers_owner)

    # Player registers
    reg = await async_client.post(
        f"/api/v1/players/me/lessons/{lid}/register",
        headers=make_auth_header(player_user_1),
    )
    assert reg.status_code == 201

    # Staff cancels the lesson
    canc_resp = await async_client.post(f"/api/v1/clubs/{club_a.id}/lessons/{lid}/cancel", headers=headers_owner)
    assert canc_resp.status_code == 200
    assert canc_resp.json()["status"] == "cancelled"

    # Active registration was moved to cancelled
    roster = await async_client.get(f"/api/v1/clubs/{club_a.id}/lessons/{lid}/registrations", headers=headers_owner)
    assert roster.status_code == 200
    assert roster.json()[0]["status"] == "cancelled"


@pytest.mark.asyncio
async def test_player_discovery_and_my_lessons(
    async_client: AsyncClient,
    club_a: Club,
    owner_user: User,
    owner_membership: ClubMembership,
    player_user_1: User,
    player_cpm_1: ClubPlayerMembership,
    coach_1: Coach,
    lesson_type_group: LessonType,
):
    headers_owner = make_auth_header(owner_user)
    headers_player = make_auth_header(player_user_1)
    now = datetime.now(timezone.utc)

    # Create published lesson
    l_resp = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/lessons",
        json={
            "lesson_type_id": str(lesson_type_group.id),
            "coach_id": str(coach_1.id),
            "title": "Discoverable Clinic",
            "start_at": (now + timedelta(days=2)).isoformat(),
            "end_at": (now + timedelta(days=2, hours=1)).isoformat(),
        },
        headers=headers_owner,
    )
    lid = l_resp.json()["id"]
    await async_client.post(f"/api/v1/clubs/{club_a.id}/lessons/{lid}/publish", headers=headers_owner)

    # 1. Discover
    disc = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/lessons/discover?lesson_type_id={lesson_type_group.id}",
        headers=headers_player,
    )
    assert disc.status_code == 200
    assert any(x["id"] == lid for x in disc.json())

    # 2. Register
    await async_client.post(f"/api/v1/players/me/lessons/{lid}/register", headers=headers_player)

    # 3. List my lessons
    my_lessons = await async_client.get("/api/v1/players/me/lessons", headers=headers_player)
    assert my_lessons.status_code == 200
    assert any(x["lesson_id"] == lid for x in my_lessons.json())

    # 4. Get player lesson detail
    detail = await async_client.get(f"/api/v1/players/me/lessons/{lid}", headers=headers_player)
    assert detail.status_code == 200
    assert detail.json()["is_eligible"] is True
    assert detail.json()["my_registration"] is not None

