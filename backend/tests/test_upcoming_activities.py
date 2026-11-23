import pytest
import uuid
from datetime import datetime, timezone, timedelta
from app.core.security import hash_password
from app.models.user import User
from app.models.club import Club
from app.models.tournament import Tournament, TournamentStatus, TournamentFormat
from app.models.league import League, LeagueStatus
from app.models.event import Event, EventStatus, EventType, EventVisibility
from app.models.lesson import Lesson, LessonStatus, LessonType, Coach
from tests.conftest import make_auth_header

@pytest.mark.asyncio
async def test_upcoming_activities_multi_club_and_filters(async_client, db_session):
    now = datetime.now(timezone.utc)

    # 0. Create player user
    user = User(
        email="multi_club_player@example.com",
        hashed_password=hash_password("Pass123!"),
        full_name="Multi Club Player",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)

    # 1. Create Club A
    club_a_id = uuid.uuid4()
    club_a = Club(
        id=club_a_id,
        name="Sunset Pickleball Club",
        slug=f"sunset-{uuid.uuid4().hex[:6]}",
        address_line1="123 Ocean Dr",
        city="Miami",
        state="FL",
        postal_code="33139",
        is_active=True,
    )
    db_session.add(club_a)

    # 2. Create Club B
    club_b_id = uuid.uuid4()
    club_b = Club(
        id=club_b_id,
        name="Metro Racquet Club",
        slug=f"metro-{uuid.uuid4().hex[:6]}",
        address_line1="456 Grand Ave",
        city="Chicago",
        state="IL",
        postal_code="60601",
        is_active=True,
    )
    db_session.add(club_b)
    await db_session.flush()

    # ─── CLUB A ACTIVITIES ──────────────────────────────────────────────────────
    # A1. Tournament in 5 days
    t_a = Tournament(
        id=uuid.uuid4(),
        club_id=club_a_id,
        name="Sunset Open Championship",
        format=TournamentFormat.BRACKET,
        status=TournamentStatus.REGISTRATION_OPEN,
        start_date=now + timedelta(days=5),
        end_date=now + timedelta(days=7),
        registration_open_at=now - timedelta(days=2),
        registration_close_at=now + timedelta(days=4),
        max_participants=32,
    )
    db_session.add(t_a)

    # A2. Event in 2 days
    e_a = Event(
        id=uuid.uuid4(),
        club_id=club_a_id,
        title="Friday Night Social Mixer",
        event_type=EventType.SOCIAL,
        status=EventStatus.PUBLISHED,
        visibility=EventVisibility.PUBLIC,
        start_at=now + timedelta(days=2),
        end_at=now + timedelta(days=2, hours=3),
        capacity=24,
        registration_fee=0.0,
    )
    db_session.add(e_a)

    # ─── CLUB B ACTIVITIES ──────────────────────────────────────────────────────
    # B1. League in 3 days
    l_b = League(
        id=uuid.uuid4(),
        club_id=club_b_id,
        name="Metro Winter League",
        status=LeagueStatus.REGISTRATION_OPEN,
        start_date=now + timedelta(days=3),
        end_date=now + timedelta(days=30),
        number_of_weeks=6,
        team_size=2,
        max_teams=20,
    )
    db_session.add(l_b)

    # B2. Lesson in 1 day
    coach_b = Coach(club_id=club_b_id, name="Coach Beta", is_active=True)
    db_session.add(coach_b)
    await db_session.flush()

    lt_b = LessonType(
        club_id=club_b_id,
        name="Advanced Dinking Clinic",
        duration_minutes=60,
        default_capacity=8,
        default_price=45.0,
    )
    db_session.add(lt_b)
    await db_session.flush()

    les_b = Lesson(
        id=uuid.uuid4(),
        club_id=club_b_id,
        lesson_type_id=lt_b.id,
        coach_id=coach_b.id,
        title="Mastering the Kitchen Line",
        status=LessonStatus.PUBLISHED,
        start_at=now + timedelta(days=1),
        end_at=now + timedelta(days=1, hours=2),
        capacity=8,
    )
    db_session.add(les_b)

    # ─── INELIGIBLE / EXCLUDED ACTIVITIES ────────────────────────────────────────
    # Excluded 1: Cancelled Tournament in Club B
    t_cancelled = Tournament(
        id=uuid.uuid4(),
        club_id=club_b_id,
        name="Cancelled Tournament",
        format=TournamentFormat.BRACKET,
        status=TournamentStatus.CANCELLED,
        start_date=now + timedelta(days=10),
        end_date=now + timedelta(days=12),
        registration_open_at=now - timedelta(days=2),
        registration_close_at=now + timedelta(days=4),
    )
    db_session.add(t_cancelled)

    # Excluded 2: Completed / Past Event in Club A
    e_past = Event(
        id=uuid.uuid4(),
        club_id=club_a_id,
        title="Past Social",
        event_type=EventType.SOCIAL,
        status=EventStatus.COMPLETED,
        visibility=EventVisibility.PUBLIC,
        start_at=now - timedelta(days=5),
        end_at=now - timedelta(days=5, hours=2),
        capacity=20,
        registration_fee=0.0,
    )
    db_session.add(e_past)

    # Excluded 3: Private Event in Club B (player is not a member)
    e_private = Event(
        id=uuid.uuid4(),
        club_id=club_b_id,
        title="Members Only VIP Mixer",
        event_type=EventType.SOCIAL,
        status=EventStatus.PUBLISHED,
        visibility=EventVisibility.PRIVATE,
        start_at=now + timedelta(days=4),
        end_at=now + timedelta(days=4, hours=2),
        capacity=10,
        registration_fee=0.0,
    )
    db_session.add(e_private)

    await db_session.commit()

    headers = make_auth_header(user.id)

    # ─── 1. TEST HOME PAGE PREVIEW (limit=3) ───────────────────────────────────
    resp_home = await async_client.get("/api/v1/player/upcoming-activities?limit=3", headers=headers)
    assert resp_home.status_code == 200
    data_home = resp_home.json()
    assert data_home["total"] == 4, f"Expected 4 eligible total activities, got {data_home['total']}"
    assert len(data_home["items"]) == 3, f"Home page preview should have exactly 3 items, got {len(data_home['items'])}"

    # Check that nearest upcoming items are returned in order across BOTH clubs
    # Item 0: Lesson (Club B, +1d)
    assert data_home["items"][0]["activity_type"] == "lesson"
    assert data_home["items"][0]["club_name"] == "Metro Racquet Club"
    assert data_home["items"][0]["id"] == str(les_b.id)

    # Item 1: Event (Club A, +2d)
    assert data_home["items"][1]["activity_type"] == "event"
    assert data_home["items"][1]["club_name"] == "Sunset Pickleball Club"
    assert data_home["items"][1]["id"] == str(e_a.id)

    # Item 2: League (Club B, +3d)
    assert data_home["items"][2]["activity_type"] == "league"
    assert data_home["items"][2]["club_name"] == "Metro Racquet Club"
    assert data_home["items"][2]["id"] == str(l_b.id)

    # ─── 2. TEST VIEW ALL / DEDICATED FEED (limit=25) ──────────────────────────
    resp_all = await async_client.get("/api/v1/player/upcoming-activities?limit=25", headers=headers)
    assert resp_all.status_code == 200
    data_all = resp_all.json()
    assert data_all["total"] == 4
    assert len(data_all["items"]) == 4

    # 4th item is the Tournament from Club A (+5d)
    assert data_all["items"][3]["activity_type"] == "tournament"
    assert data_all["items"][3]["club_name"] == "Sunset Pickleball Club"
    assert data_all["items"][3]["id"] == str(t_a.id)

    # Verify excluded records do not appear anywhere in the results
    retrieved_ids = {item["id"] for item in data_all["items"]}
    assert str(t_cancelled.id) not in retrieved_ids
    assert str(e_past.id) not in retrieved_ids
    assert str(e_private.id) not in retrieved_ids

    # ─── 3. TEST FILTERS ───────────────────────────────────────────────────────
    # Tournaments filter
    resp_t = await async_client.get("/api/v1/player/upcoming-activities?activity_type=tournament", headers=headers)
    assert resp_t.status_code == 200
    assert resp_t.json()["total"] == 1
    assert resp_t.json()["items"][0]["id"] == str(t_a.id)

    # Leagues filter
    resp_l = await async_client.get("/api/v1/player/upcoming-activities?activity_type=league", headers=headers)
    assert resp_l.status_code == 200
    assert resp_l.json()["total"] == 1
    assert resp_l.json()["items"][0]["id"] == str(l_b.id)

    # Events filter
    resp_e = await async_client.get("/api/v1/player/upcoming-activities?activity_type=event", headers=headers)
    assert resp_e.status_code == 200
    assert resp_e.json()["total"] == 1
    assert resp_e.json()["items"][0]["id"] == str(e_a.id)

    # Lessons filter
    resp_les = await async_client.get("/api/v1/player/upcoming-activities?activity_type=lesson", headers=headers)
    assert resp_les.status_code == 200
    assert resp_les.json()["total"] == 1
    assert resp_les.json()["items"][0]["id"] == str(les_b.id)

    # ─── 4. TEST EMPTY STATE (non-matching filter) ────────────────────────────
    # Club filter that has no events
    empty_club_id = uuid.uuid4()
    resp_empty = await async_client.get(f"/api/v1/player/upcoming-activities?club_id={empty_club_id}", headers=headers)
    assert resp_empty.status_code == 200
    assert resp_empty.json()["total"] == 0
    assert len(resp_empty.json()["items"]) == 0
