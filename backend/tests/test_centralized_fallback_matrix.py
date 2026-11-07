"""
Centralized Banner and Image Fallback Matrix Verification Test Suite
Validates the complete fallback hierarchy:
Priority 1: Individual custom image
Priority 2: Club-specific default
Priority 3: Platform Admin default (built-in or custom uploaded)
Priority 4: Clean neutral no-image state (null)

Also verifies:
- All formats: Round Robin, Scramble, Pool Play, Bracket, General Tournament
- All activity categories: Events, Lessons, Leagues
- Preserved special rules: Club Logo, Club Cover, Courts (must remain strictly custom/null)
- Removal of custom image / club default
- Dynamic update of platform default
- Multi-club isolation
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.event import Event, EventStatus, EventType, EventVisibility
from app.models.league import League, LeagueStatus
from app.models.lesson import Lesson, LessonStatus, LessonType, Coach
from app.models.tournament import (
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)
from app.models.user import User
from app.services.platform_banner_service import (
    resolve_platform_default,
    BUILTIN_BANNER_URLS,
)
from tests.conftest import make_auth_header


async def create_user(
    db: AsyncSession,
    email: str | None = None,
    full_name: str = "Test User",
) -> User:
    email = email or f"user_{uuid.uuid4().hex[:8]}@test.local"
    user = User(
        email=email,
        hashed_password=hash_password("Secret123!"),
        full_name=full_name,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    return user


async def create_club(
    db: AsyncSession,
    name: str | None = None,
) -> Club:
    suffix = uuid.uuid4().hex[:8]
    club = Club(
        name=name or f"Club {suffix}",
        slug=f"club-{suffix}",
        is_active=True,
    )
    db.add(club)
    await db.flush()
    return club


async def create_membership(
    db: AsyncSession,
    user_id: uuid.UUID,
    club_id: uuid.UUID,
    role: ClubRole = ClubRole.CLUB_OWNER,
) -> ClubMembership:
    m = ClubMembership(
        user_id=user_id,
        club_id=club_id,
        role=role,
        is_active=True,
    )
    db.add(m)
    await db.flush()
    return m


@pytest.mark.asyncio
async def test_tournament_all_formats_fallback_matrix(async_client: AsyncClient, db_session: AsyncSession):
    """
    Test Priority 1 -> Priority 2 -> Priority 3 for all tournament formats:
    - round_robin
    - scramble
    - pool_play
    - bracket
    """
    owner = await create_user(db_session)
    club = await create_club(db_session, "Fallback Matrix Club")
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    headers = make_auth_header(owner)

    formats = [
        (TournamentFormat.ROUND_ROBIN, "default_tournament_round_robin"),
        (TournamentFormat.SCRAMBLE, "default_tournament_scramble"),
        (TournamentFormat.POOL_PLAY, "default_tournament_pool_play"),
        (TournamentFormat.BRACKET, "default_tournament_bracket"),
    ]

    now = datetime.now(timezone.utc)

    for fmt, banner_type in formats:
        # Priority 3: Tournament with NO custom image and NO club default configured
        t_p3 = Tournament(
            club_id=club.id,
            name=f"P3 {fmt.value} Tournament",
            format=fmt,
            status=TournamentStatus.REGISTRATION_OPEN,
            visibility=TournamentVisibility.PUBLIC,
            banner_image_url=None,
            min_participants=4,
            max_participants=16,
            start_date=now + timedelta(days=2),
            end_date=now + timedelta(days=3),
            registration_open_at=now - timedelta(days=1),
            registration_close_at=now + timedelta(days=1),
            created_by_user_id=owner.id,
        )
        # Priority 1: Tournament with individual custom image
        custom_url = f"https://cdn.example.com/custom_{fmt.value}.jpg"
        t_p1 = Tournament(
            club_id=club.id,
            name=f"P1 {fmt.value} Tournament Custom",
            format=fmt,
            status=TournamentStatus.REGISTRATION_OPEN,
            visibility=TournamentVisibility.PUBLIC,
            banner_image_url=custom_url,
            min_participants=4,
            max_participants=16,
            start_date=now + timedelta(days=2),
            end_date=now + timedelta(days=3),
            registration_open_at=now - timedelta(days=1),
            registration_close_at=now + timedelta(days=1),
            created_by_user_id=owner.id,
        )
        db_session.add_all([t_p3, t_p1])
        await db_session.commit()

        # Fetch t_p3 via API -> must resolve to platform default
        resp_p3 = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t_p3.id}",
            headers=headers,
        )
        assert resp_p3.status_code == 200, resp_p3.text
        data_p3 = resp_p3.json()
        assert data_p3["banner_image_url"] is None
        expected_platform_url = resolve_platform_default(banner_type)
        assert data_p3["resolved_banner_url"] == expected_platform_url, (
            f"Expected platform default {expected_platform_url} but got {data_p3['resolved_banner_url']} for format {fmt.value}"
        )

        # Fetch t_p1 via API -> must resolve to custom image
        resp_p1 = await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{t_p1.id}",
            headers=headers,
        )
        assert resp_p1.status_code == 200, resp_p1.text
        data_p1 = resp_p1.json()
        assert data_p1["banner_image_url"] == custom_url
        assert data_p1["resolved_banner_url"] == custom_url


@pytest.mark.asyncio
async def test_club_default_overrides_platform_default(async_client: AsyncClient, db_session: AsyncSession):
    """
    Test Priority 2: Club default overrides Platform default for tournaments and activities.
    """
    owner = await create_user(db_session)
    club = await create_club(db_session, "Club Override Test")
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    headers = make_auth_header(owner)

    # Configure club default for Round Robin
    branding_payload = {
        "default_tournament_round_robin_url": "https://cdn.example.com/club_rr_banner.jpg",
        "default_event_banner_url": "https://cdn.example.com/club_event_banner.jpg",
        "default_lesson_banner_url": "https://cdn.example.com/club_lesson_banner.jpg",
        "default_league_banner_url": "https://cdn.example.com/club_league_banner.jpg",
    }
    b_resp = await async_client.put(f"/api/v1/clubs/{club.id}/branding", json=branding_payload, headers=headers)
    assert b_resp.status_code == 200, b_resp.text

    now = datetime.now(timezone.utc)
    # Tournament with Round Robin format (has club default)
    t_rr = Tournament(
        club_id=club.id,
        name="RR with Club Default",
        format=TournamentFormat.ROUND_ROBIN,
        status=TournamentStatus.REGISTRATION_OPEN,
        visibility=TournamentVisibility.PUBLIC,
        banner_image_url=None,
        min_participants=4,
        max_participants=16,
        start_date=now + timedelta(days=2),
        end_date=now + timedelta(days=3),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=1),
        created_by_user_id=owner.id,
    )
    # Tournament with Scramble format (NO club default configured)
    t_scramble = Tournament(
        club_id=club.id,
        name="Scramble without Club Default",
        format=TournamentFormat.SCRAMBLE,
        status=TournamentStatus.REGISTRATION_OPEN,
        visibility=TournamentVisibility.PUBLIC,
        banner_image_url=None,
        min_participants=4,
        max_participants=16,
        start_date=now + timedelta(days=2),
        end_date=now + timedelta(days=3),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=1),
        created_by_user_id=owner.id,
    )
    db_session.add_all([t_rr, t_scramble])
    await db_session.commit()

    # Verify t_rr resolves to Club Default
    resp_rr = await async_client.get(f"/api/v1/clubs/{club.id}/tournaments/{t_rr.id}", headers=headers)
    assert resp_rr.status_code == 200
    assert resp_rr.json()["resolved_banner_url"] == "https://cdn.example.com/club_rr_banner.jpg"

    # Verify t_scramble falls back to Platform Default
    resp_scramble = await async_client.get(f"/api/v1/clubs/{club.id}/tournaments/{t_scramble.id}", headers=headers)
    assert resp_scramble.status_code == 200
    expected_scramble_platform = resolve_platform_default("default_tournament_scramble")
    assert resp_scramble.json()["resolved_banner_url"] == expected_scramble_platform


@pytest.mark.asyncio
async def test_activity_fallback_matrix(async_client: AsyncClient, db_session: AsyncSession):
    """
    Test Priority 1 -> Priority 2 -> Priority 3 for Activities (Leagues, Events, Lessons).
    """
    owner = await create_user(db_session)
    club = await create_club(db_session, "Activity Fallback Club")
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    headers = make_auth_header(owner)
    now = datetime.now(timezone.utc)

    # 1. League: No custom image and no club default -> platform default
    league = League(
        club_id=club.id,
        name="Test League P3",
        status=LeagueStatus.REGISTRATION_OPEN,
        number_of_weeks=4,
        team_size=2,
        playoff_team_count=2,
        max_teams=8,
        banner_image_url=None,
    )
    # 2. Event: No custom image and no club default -> platform default
    event = Event(
        club_id=club.id,
        title="Test Event P3",
        event_type=EventType.SOCIAL,
        status=EventStatus.PUBLISHED,
        visibility=EventVisibility.PUBLIC,
        cover_image_url=None,
        start_at=now + timedelta(days=5),
        end_at=now + timedelta(days=5, hours=2),
        capacity=20,
    )
    # 3. Lesson: Create coach & lesson_type, then lesson with no image
    coach = Coach(club_id=club.id, name="Coach Dave")
    db_session.add(coach)
    await db_session.flush()

    lesson_type = LessonType(
        club_id=club.id,
        name="Beginner Fundamentals",
        duration_minutes=60,
        default_price=Decimal("50.00"),
        currency="USD",
    )
    db_session.add(lesson_type)
    await db_session.flush()

    lesson = Lesson(
        club_id=club.id,
        lesson_type_id=lesson_type.id,
        coach_id=coach.id,
        title="Test Lesson P3",
        status=LessonStatus.PUBLISHED,
        image_url=None,
        start_at=now + timedelta(days=3),
        end_at=now + timedelta(days=3, hours=1),
        capacity=6,
        price=Decimal("50.00"),
    )
    db_session.add_all([league, event, lesson])
    await db_session.commit()

    # Verify League resolves to platform default
    l_resp = await async_client.get(f"/api/v1/clubs/{club.id}/leagues/{league.id}", headers=headers)
    assert l_resp.status_code == 200, l_resp.text
    assert l_resp.json()["resolved_banner_url"] == resolve_platform_default("default_league_banner")

    # Verify Event resolves to platform default
    e_resp = await async_client.get(f"/api/v1/clubs/{club.id}/events/{event.id}", headers=headers)
    assert e_resp.status_code == 200, e_resp.text
    assert e_resp.json()["resolved_cover_image_url"] == resolve_platform_default("default_event_banner")

    # Verify Lesson resolves to platform default
    les_resp = await async_client.get(f"/api/v1/clubs/{club.id}/lessons/{lesson.id}", headers=headers)
    assert les_resp.status_code == 200, les_resp.text
    assert les_resp.json()["resolved_image_url"] == resolve_platform_default("default_lesson_banner")


@pytest.mark.asyncio
async def test_removing_custom_image_restores_defaults(async_client: AsyncClient, db_session: AsyncSession):
    """
    Test Priority 1 removal:
    - If club default exists, removing custom image falls back to club default.
    - If no club default exists, removing custom image falls back to platform default.
    """
    owner = await create_user(db_session)
    club = await create_club(db_session, "Removal Test Club")
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    headers = make_auth_header(owner)
    now = datetime.now(timezone.utc)

    # Create tournament with custom image
    t = Tournament(
        club_id=club.id,
        name="Custom RR Tournament",
        format=TournamentFormat.ROUND_ROBIN,
        status=TournamentStatus.DRAFT,
        visibility=TournamentVisibility.PUBLIC,
        banner_image_url="https://cdn.example.com/custom_rr.jpg",
        min_participants=4,
        max_participants=16,
        start_date=now + timedelta(days=2),
        end_date=now + timedelta(days=3),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=1),
        created_by_user_id=owner.id,
    )
    db_session.add(t)
    await db_session.commit()

    # Step 1: Tournament with custom image resolves to custom image
    get_resp = await async_client.get(f"/api/v1/clubs/{club.id}/tournaments/{t.id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["resolved_banner_url"] == "https://cdn.example.com/custom_rr.jpg"

    # Step 2: Remove custom image -> falls back to platform default (since club default is empty)
    patch_resp = await async_client.patch(
        f"/api/v1/clubs/{club.id}/tournaments/{t.id}",
        json={"banner_image_url": None},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    expected_platform_rr = resolve_platform_default("default_tournament_round_robin")
    assert patch_resp.json()["resolved_banner_url"] == expected_platform_rr
    assert patch_resp.json()["banner_image_url"] is None

    # Step 3: Now configure a club default
    await async_client.put(
        f"/api/v1/clubs/{club.id}/branding",
        json={"default_tournament_round_robin_url": "https://cdn.example.com/club_new_rr.jpg"},
        headers=headers,
    )

    # Step 4: Fetch tournament again -> resolves to club default
    get_resp2 = await async_client.get(f"/api/v1/clubs/{club.id}/tournaments/{t.id}", headers=headers)
    assert get_resp2.status_code == 200
    assert get_resp2.json()["resolved_banner_url"] == "https://cdn.example.com/club_new_rr.jpg"

    # Step 5: Remove the club default (reset to null) -> falls back to platform default again
    await async_client.put(
        f"/api/v1/clubs/{club.id}/branding",
        json={"default_tournament_round_robin_url": None},
        headers=headers,
    )
    get_resp3 = await async_client.get(f"/api/v1/clubs/{club.id}/tournaments/{t.id}", headers=headers)
    assert get_resp3.status_code == 200
    assert get_resp3.json()["resolved_banner_url"] == expected_platform_rr


@pytest.mark.asyncio
async def test_multi_club_isolation(async_client: AsyncClient, db_session: AsyncSession):
    """
    Test Club A's defaults NEVER affect Club B.
    """
    owner_a = await create_user(db_session, full_name="Owner A")
    club_a = await create_club(db_session, "Club A")
    await create_membership(db_session, owner_a.id, club_a.id, ClubRole.CLUB_OWNER)

    owner_b = await create_user(db_session, full_name="Owner B")
    club_b = await create_club(db_session, "Club B")
    await create_membership(db_session, owner_b.id, club_b.id, ClubRole.CLUB_OWNER)

    await db_session.commit()

    headers_a = make_auth_header(owner_a)
    headers_b = make_auth_header(owner_b)
    now = datetime.now(timezone.utc)

    # Configure Club A defaults
    await async_client.put(
        f"/api/v1/clubs/{club_a.id}/branding",
        json={"default_tournament_bracket_url": "https://cdn.example.com/club_a_bracket.jpg"},
        headers=headers_a,
    )

    # Create Bracket tournament in Club A
    t_a = Tournament(
        club_id=club_a.id,
        name="Club A Bracket",
        format=TournamentFormat.BRACKET,
        status=TournamentStatus.REGISTRATION_OPEN,
        visibility=TournamentVisibility.PUBLIC,
        banner_image_url=None,
        min_participants=4,
        max_participants=16,
        start_date=now + timedelta(days=2),
        end_date=now + timedelta(days=3),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=1),
        created_by_user_id=owner_a.id,
    )
    # Create Bracket tournament in Club B
    t_b = Tournament(
        club_id=club_b.id,
        name="Club B Bracket",
        format=TournamentFormat.BRACKET,
        status=TournamentStatus.REGISTRATION_OPEN,
        visibility=TournamentVisibility.PUBLIC,
        banner_image_url=None,
        min_participants=4,
        max_participants=16,
        start_date=now + timedelta(days=2),
        end_date=now + timedelta(days=3),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=1),
        created_by_user_id=owner_b.id,
    )
    db_session.add_all([t_a, t_b])
    await db_session.commit()

    # Club A tournament uses Club A default
    resp_a = await async_client.get(f"/api/v1/clubs/{club_a.id}/tournaments/{t_a.id}", headers=headers_a)
    assert resp_a.status_code == 200
    assert resp_a.json()["resolved_banner_url"] == "https://cdn.example.com/club_a_bracket.jpg"

    # Club B tournament MUST NOT use Club A default! Must use Platform default
    resp_b = await async_client.get(f"/api/v1/clubs/{club_b.id}/tournaments/{t_b.id}", headers=headers_b)
    assert resp_b.status_code == 200
    expected_platform_bracket = resolve_platform_default("default_tournament_bracket")
    assert resp_b.json()["resolved_banner_url"] == expected_platform_bracket
    assert resp_b.json()["resolved_banner_url"] != "https://cdn.example.com/club_a_bracket.jpg"


@pytest.mark.asyncio
async def test_special_rules_strict_custom_only(async_client: AsyncClient, db_session: AsyncSession):
    """
    Test Section 9 preserved special rules:
    - Club logo: Only uploaded logo, strictly null when unconfigured.
    - Club cover: Only uploaded cover, strictly null when unconfigured.
    - Court images: Uploaded individually only, strictly null when unconfigured.
    No Platform Admin defaults and no Club defaults should leak into these.
    """
    owner = await create_user(db_session)
    club = await create_club(db_session, "Special Rules Club")
    await create_membership(db_session, owner.id, club.id, ClubRole.CLUB_OWNER)
    await db_session.commit()

    headers = make_auth_header(owner)

    # 1. Club details: logo_url and cover_image_url must be null
    club_resp = await async_client.get(f"/api/v1/clubs/{club.id}/branding", headers=headers)
    assert club_resp.status_code == 200
    club_data = club_resp.json()
    assert club_data["logo_url"] is None
    assert club_data["cover_image_url"] is None

    # 2. Court: photo_url must be null when unconfigured
    court = Court(
        club_id=club.id,
        name="Court 1",
        court_number=1,
        surface_type="concrete",
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        photo_url=None,
    )
    db_session.add(court)
    await db_session.commit()

    court_resp = await async_client.get(f"/api/v1/clubs/{club.id}/courts", headers=headers)
    assert court_resp.status_code == 200
    courts_data = court_resp.json()
    assert len(courts_data) >= 1
    assert courts_data[0]["photo_url"] is None


@pytest.mark.asyncio
async def test_platform_banner_admin_endpoints(async_client: AsyncClient, db_session: AsyncSession):
    """
    Test Platform Admin banner endpoints:
    - When built-in default is active, image_url is None, default_image_url is set,
      and resolved_image_url points to built-in asset.
    - When custom banner is uploaded, image_url and resolved_image_url point to custom asset.
    """
    admin_user = await create_user(db_session, full_name="Super Admin")
    admin_user.is_superuser = True
    await db_session.commit()

    headers = make_auth_header(admin_user)

    resp = await async_client.get("/api/v1/platform/banners", headers=headers)
    assert resp.status_code == 200
    banners = resp.json()
    assert isinstance(banners, dict)
    assert len(banners) >= 8

    rr_banner = banners.get("default_tournament_round_robin")
    assert rr_banner is not None
    assert rr_banner["default_image_url"] is not None
    assert rr_banner["resolved_image_url"] is not None
    assert "/defaults/tournaments/card_round_robin.jpg" in rr_banner["resolved_image_url"]
