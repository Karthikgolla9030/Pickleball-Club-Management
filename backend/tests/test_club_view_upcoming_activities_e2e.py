import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.competition import Team
from app.models.event import (
    Event,
    EventRegistration,
    EventRegistrationStatus,
    EventStatus,
    EventType,
    EventVisibility,
)
from app.models.league import League, LeagueStatus
from app.models.lesson import (
    Coach,
    Lesson,
    LessonRegistration,
    LessonRegistrationStatus,
    LessonStatus,
    LessonType,
)
from app.models.tournament import Tournament, TournamentFormat, TournamentStatus
from app.models.user import User
from tests.conftest import make_auth_header


@pytest.mark.asyncio
async def test_club_view_upcoming_activities_isolation_spots_and_lifecycle(async_client, db_session):
    now = datetime.now(timezone.utc)

    player = User(
        email=f"clubview_player_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("Pass123!"),
        full_name="Club View Player",
        is_active=True,
        is_verified=True,
    )
    other_player = User(
        email=f"clubview_other_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("Pass123!"),
        full_name="Other Registered Player",
        is_active=True,
        is_verified=True,
    )
    db_session.add_all([player, other_player])
    await db_session.flush()

    club_a = Club(
        id=uuid.uuid4(),
        name="Emerald Courts Club",
        slug=f"emerald-{uuid.uuid4().hex[:6]}",
        address_line1="100 Court Way",
        city="Austin",
        state="TX",
        postal_code="78701",
        is_active=True,
    )
    club_b = Club(
        id=uuid.uuid4(),
        name="Pacific Dink Center",
        slug=f"pacific-{uuid.uuid4().hex[:6]}",
        address_line1="200 Ocean Blvd",
        city="San Diego",
        state="CA",
        postal_code="92101",
        is_active=True,
    )
    club_c = Club(
        id=uuid.uuid4(),
        name="Quiet Pines Club",
        slug=f"quiet-{uuid.uuid4().hex[:6]}",
        address_line1="300 Pine St",
        city="Denver",
        state="CO",
        postal_code="80202",
        is_active=True,
    )
    db_session.add_all([club_a, club_b, club_c])
    await db_session.flush()

    # Enroll player in all 3 clubs (My Clubs scenario)
    db_session.add_all([
        ClubPlayerMembership(user_id=player.id, club_id=club_a.id, status=PlayerMembershipStatus.ACTIVE),
        ClubPlayerMembership(user_id=player.id, club_id=club_b.id, status=PlayerMembershipStatus.ACTIVE),
        ClubPlayerMembership(user_id=player.id, club_id=club_c.id, status=PlayerMembershipStatus.ACTIVE),
    ])

    # ─── CLUB A: 2 Tournaments, 1 Event (with 2 registrations), 1 Lesson (with 1 registration) ───
    t_a1 = Tournament(
        id=uuid.uuid4(),
        club_id=club_a.id,
        name="Emerald Spring Classic",
        format=TournamentFormat.ROUND_ROBIN,
        status=TournamentStatus.REGISTRATION_OPEN,
        start_date=now + timedelta(days=4),
        end_date=now + timedelta(days=5),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=3),
        max_participants=16,
    )
    t_a2 = Tournament(
        id=uuid.uuid4(),
        club_id=club_a.id,
        name="Emerald Bracket Challenge",
        format=TournamentFormat.BRACKET,
        status=TournamentStatus.REGISTRATION_CLOSED,
        start_date=now + timedelta(days=10),
        end_date=now + timedelta(days=11),
        registration_open_at=now - timedelta(days=5),
        registration_close_at=now - timedelta(days=1),
        max_participants=32,
    )
    t_a_draft = Tournament(
        id=uuid.uuid4(),
        club_id=club_a.id,
        name="Emerald Unpublished Draft",
        format=TournamentFormat.SCRAMBLE,
        status=TournamentStatus.DRAFT,
        start_date=now + timedelta(days=6),
        end_date=now + timedelta(days=7),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=5),
    )
    t_a_cancelled = Tournament(
        id=uuid.uuid4(),
        club_id=club_a.id,
        name="Emerald Cancelled Cup",
        format=TournamentFormat.POOL_PLAY,
        status=TournamentStatus.CANCELLED,
        start_date=now + timedelta(days=8),
        end_date=now + timedelta(days=9),
        registration_open_at=now - timedelta(days=1),
        registration_close_at=now + timedelta(days=7),
    )

    ev_a = Event(
        id=uuid.uuid4(),
        club_id=club_a.id,
        title="Emerald Glow Social",
        event_type=EventType.SOCIAL,
        status=EventStatus.PUBLISHED,
        visibility=EventVisibility.PUBLIC,
        start_at=now + timedelta(days=2),
        end_at=now + timedelta(days=2, hours=2),
        capacity=12,
        registration_fee=15.0,
    )
    ev_a_reg1 = EventRegistration(
        event_id=ev_a.id,
        user_id=other_player.id,
        status=EventRegistrationStatus.REGISTERED,
    )
    ev_a_reg_cancelled = EventRegistration(
        event_id=ev_a.id,
        user_id=player.id,
        status=EventRegistrationStatus.CANCELLED,
    )

    coach_a = Coach(club_id=club_a.id, name="Coach Alex", is_active=True)
    db_session.add(coach_a)
    await db_session.flush()

    lt_a = LessonType(
        club_id=club_a.id,
        name="Third Shot Drop Lab",
        duration_minutes=60,
        default_capacity=6,
        default_price=35.0,
    )
    db_session.add(lt_a)
    await db_session.flush()

    les_a = Lesson(
        id=uuid.uuid4(),
        club_id=club_a.id,
        lesson_type_id=lt_a.id,
        coach_id=coach_a.id,
        title="Emerald Clinic: Soft Game",
        status=LessonStatus.PUBLISHED,
        start_at=now + timedelta(days=1),
        end_at=now + timedelta(days=1, hours=1),
        capacity=6,
        price=35.0,
    )
    les_a_reg1 = LessonRegistration(
        lesson_id=les_a.id,
        user_id=other_player.id,
        status=LessonRegistrationStatus.REGISTERED,
    )

    # ─── CLUB B: 1 League (naive past check skipped, future kept, 1 registered team), 2 Events ───
    lg_b = League(
        id=uuid.uuid4(),
        club_id=club_b.id,
        name="Pacific Summer Ladder",
        status=LeagueStatus.REGISTRATION_OPEN,
        start_date=now + timedelta(days=3),
        end_date=(now + timedelta(days=28)).replace(tzinfo=None),  # Naive timestamp safety check
        number_of_weeks=4,
        team_size=2,
        max_teams=8,
        registration_fee=50.0,
    )
    db_session.add(lg_b)
    await db_session.flush()

    lg_b_team1 = Team(
        id=uuid.uuid4(),
        league_id=lg_b.id,
        name="Pacific Aces",
    )

    ev_b1 = Event(
        id=uuid.uuid4(),
        club_id=club_b.id,
        title="Pacific Welcome Mixer",
        event_type=EventType.COMMUNITY,
        status=EventStatus.PUBLISHED,
        visibility=EventVisibility.PUBLIC,
        start_at=now + timedelta(days=2),
        end_at=now + timedelta(days=2, hours=2),
        capacity=20,
        registration_fee=0.0,
    )
    ev_b2 = Event(
        id=uuid.uuid4(),
        club_id=club_b.id,
        title="Pacific Pro Exhibition",
        event_type=EventType.CLINIC,
        status=EventStatus.PUBLISHED,
        visibility=EventVisibility.PUBLIC,
        start_at=now + timedelta(days=5),
        end_at=now + timedelta(days=5, hours=2),
        capacity=40,
        registration_fee=25.0,
    )

    db_session.add_all([
        t_a1, t_a2, t_a_draft, t_a_cancelled,
        ev_a, ev_a_reg1, ev_a_reg_cancelled,
        les_a, les_a_reg1,
        lg_b_team1, ev_b1, ev_b2,
    ])
    await db_session.commit()

    headers = make_auth_header(player.id)

    # 1. Club A query returns ONLY Club A active published items (4 items)
    resp_a = await async_client.get(
        f"/api/v1/player/upcoming-activities?club_id={club_a.id}&limit=50",
        headers=headers,
    )
    assert resp_a.status_code == 200
    data_a = resp_a.json()
    assert data_a["total"] == 4
    assert len(data_a["items"]) == 4
    assert all(item["club_id"] == str(club_a.id) for item in data_a["items"])

    ids_a = {item["id"] for item in data_a["items"]}
    assert ids_a == {str(t_a1.id), str(t_a2.id), str(ev_a.id), str(les_a.id)}
    assert str(t_a_draft.id) not in ids_a
    assert str(t_a_cancelled.id) not in ids_a
    assert str(lg_b.id) not in ids_a
    assert str(ev_b1.id) not in ids_a
    assert str(ev_b2.id) not in ids_a

    # Verify accurate remaining available_spots (cancelled reg does NOT consume spot)
    by_id_a = {item["id"]: item for item in data_a["items"]}
    assert by_id_a[str(ev_a.id)]["available_spots"] == 11
    assert by_id_a[str(les_a.id)]["available_spots"] == 5

    # Verify chronological order: les_a (+1d) -> ev_a (+2d) -> t_a1 (+4d) -> t_a2 (+10d)
    assert [item["id"] for item in data_a["items"]] == [
        str(les_a.id),
        str(ev_a.id),
        str(t_a1.id),
        str(t_a2.id),
    ]

    # 2. Switch to Club B -> returns ONLY Club B items (3 items)
    resp_b = await async_client.get(
        f"/api/v1/player/upcoming-activities?club_id={club_b.id}&limit=50",
        headers=headers,
    )
    assert resp_b.status_code == 200
    data_b = resp_b.json()
    assert data_b["total"] == 3
    assert all(item["club_id"] == str(club_b.id) for item in data_b["items"])
    by_id_b = {item["id"]: item for item in data_b["items"]}
    assert set(by_id_b.keys()) == {str(lg_b.id), str(ev_b1.id), str(ev_b2.id)}
    # League remaining participant spots: (8 max_teams - 1 registered) * 2 = 14
    assert by_id_b[str(lg_b.id)]["available_spots"] == 14

    # 3. Switch to Club C (empty club) -> clean empty list
    resp_c = await async_client.get(
        f"/api/v1/player/upcoming-activities?club_id={club_c.id}&limit=50",
        headers=headers,
    )
    assert resp_c.status_code == 200
    data_c = resp_c.json()
    assert data_c["total"] == 0
    assert data_c["items"] == []

    # 4. Dynamic updates: publish draft tournament in Club A, cancel an event in Club A
    t_a_draft.status = TournamentStatus.REGISTRATION_OPEN
    ev_a.status = EventStatus.CANCELLED
    await db_session.commit()

    resp_a_updated = await async_client.get(
        f"/api/v1/player/upcoming-activities?club_id={club_a.id}&limit=50",
        headers=headers,
    )
    assert resp_a_updated.status_code == 200
    updated_ids_a = {item["id"] for item in resp_a_updated.json()["items"]}
    assert str(t_a_draft.id) in updated_ids_a
    assert str(ev_a.id) not in updated_ids_a
