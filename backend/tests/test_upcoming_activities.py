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
async def test_upcoming_activities_aggregation_and_filtering(async_client, db_session):
    # 0. Create player user
    user = User(
        email="player_activities_test@example.com",
        hashed_password=hash_password("Pass123!"),
        full_name="Player Test",
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)

    # 1. Create a club
    club_id = uuid.uuid4()
    club = Club(
        id=club_id,
        name="Sunset Pickleball Club",
        slug=f"sunset-pickleball-{uuid.uuid4().hex[:6]}",
        description="Premier club",
        address_line1="123 Ocean Dr",
        city="Miami",
        state="FL",
        postal_code="33139",
        country="USA",
        is_active=True,
    )
    db_session.add(club)
    await db_session.flush()

    now = datetime.now(timezone.utc)

    # 2. Add an upcoming Tournament
    t1_id = uuid.uuid4()
    t1 = Tournament(
        id=t1_id,
        club_id=club_id,
        name="Sunset Open Championship",
        format=TournamentFormat.BRACKET,
        status=TournamentStatus.REGISTRATION_OPEN,
        start_date=now + timedelta(days=5),
        end_date=now + timedelta(days=7),
        registration_open_at=now - timedelta(days=2),
        registration_close_at=now + timedelta(days=4),
        max_participants=32,
    )
    db_session.add(t1)

    # Add a completed/cancelled tournament (should be excluded)
    t2 = Tournament(
        id=uuid.uuid4(),
        club_id=club_id,
        name="Old Tournament",
        format=TournamentFormat.BRACKET,
        status=TournamentStatus.COMPLETED,
        start_date=now - timedelta(days=10),
        end_date=now - timedelta(days=8),
        registration_open_at=now - timedelta(days=15),
        registration_close_at=now - timedelta(days=11),
        max_participants=16,
    )
    db_session.add(t2)

    # 3. Add an upcoming League
    l1_id = uuid.uuid4()
    l1 = League(
        id=l1_id,
        club_id=club_id,
        name="Winter Mixed League",
        status=LeagueStatus.REGISTRATION_OPEN,
        start_date=now + timedelta(days=3),
        end_date=now + timedelta(days=30),
        number_of_weeks=6,
        team_size=2,
        max_teams=20,
    )
    db_session.add(l1)

    # 4. Add an upcoming Event
    e1_id = uuid.uuid4()
    e1 = Event(
        id=e1_id,
        club_id=club_id,
        title="Friday Night Social Mixer",
        event_type=EventType.SOCIAL,
        status=EventStatus.PUBLISHED,
        visibility=EventVisibility.PUBLIC,
        start_at=now + timedelta(days=2),
        end_at=now + timedelta(days=2, hours=3),
        capacity=24,
        registration_fee=0.0,
    )
    db_session.add(e1)

    # 5. Add an upcoming Lesson
    coach = Coach(
        club_id=club_id,
        name="Coach Alex",
        is_active=True,
    )
    db_session.add(coach)
    await db_session.flush()

    lt = LessonType(
        club_id=club_id,
        name="Skills Clinic",
        duration_minutes=60,
        default_capacity=8,
        default_price=50.0,
    )
    db_session.add(lt)
    await db_session.flush()

    les1_id = uuid.uuid4()
    les1 = Lesson(
        id=les1_id,
        club_id=club_id,
        lesson_type_id=lt.id,
        coach_id=coach.id,
        title="Mastering the Third Shot Drop",
        status=LessonStatus.PUBLISHED,
        start_at=now + timedelta(days=1),
        end_at=now + timedelta(days=1, hours=2),
        capacity=8,
    )
    db_session.add(les1)

    await db_session.commit()

    headers = make_auth_header(user.id)

    # Query all upcoming activities
    resp = await async_client.get("/api/v1/player/upcoming-activities?activity_type=all", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total"] == 4
    items = data["items"]
    assert len(items) == 4

    # Verify chronological sorting (Lesson +1d -> Event +2d -> League +3d -> Tournament +5d)
    assert items[0]["activity_type"] == "lesson"
    assert items[0]["id"] == str(les1_id)
    assert items[0]["club_name"] == "Sunset Pickleball Club"

    assert items[1]["activity_type"] == "event"
    assert items[1]["id"] == str(e1_id)

    assert items[2]["activity_type"] == "league"
    assert items[2]["id"] == str(l1_id)

    assert items[3]["activity_type"] == "tournament"
    assert items[3]["id"] == str(t1_id)

    # Test filtering by activity_type=tournament
    resp_t = await async_client.get("/api/v1/player/upcoming-activities?activity_type=tournament", headers=headers)
    assert resp_t.status_code == 200
    data_t = resp_t.json()
    assert data_t["total"] == 1
    assert data_t["items"][0]["id"] == str(t1_id)

    # Test filtering by activity_type=league
    resp_l = await async_client.get("/api/v1/player/upcoming-activities?activity_type=league", headers=headers)
    assert resp_l.status_code == 200
    data_l = resp_l.json()
    assert data_l["total"] == 1
    assert data_l["items"][0]["id"] == str(l1_id)

    # Test filtering by activity_type=event
    resp_e = await async_client.get("/api/v1/player/upcoming-activities?activity_type=event", headers=headers)
    assert resp_e.status_code == 200
    data_e = resp_e.json()
    assert data_e["total"] == 1
    assert data_e["items"][0]["id"] == str(e1_id)

    # Test filtering by activity_type=lesson
    resp_les = await async_client.get("/api/v1/player/upcoming-activities?activity_type=lesson", headers=headers)
    assert resp_les.status_code == 200
    data_les = resp_les.json()
    assert data_les["total"] == 1
    assert data_les["items"][0]["id"] == str(les1_id)
