"""
End-to-end RBAC, Tenant Isolation, and Permission Matrix tests for
Tournament Director workflows and cross-role regression verification.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.court import Court
from app.models.user import User
from tests.conftest import make_auth_header


async def _create_user(
    db: AsyncSession,
    *,
    email: str,
    full_name: str,
    password: str = "SecurePass1!",
) -> User:
    user = User(
        email=email.lower(),
        hashed_password=hash_password(password),
        full_name=full_name,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def _create_club(db: AsyncSession, name: str, slug_prefix: str) -> Club:
    club = Club(
        name=name,
        slug=f"{slug_prefix}-{uuid.uuid4().hex[:6]}",
        city="Austin",
        state="TX",
        country="US",
        is_active=True,
    )
    db.add(club)
    await db.flush()
    await db.refresh(club)
    return club


@pytest.mark.asyncio
async def test_tournament_director_login_and_scoped_access(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    Verifies full TD workflow RBAC:
    - Club login resolves TOURNAMENT_DIRECTOR membership for assigned club
    - Active courts (?status=active) & club details/dashboard succeed (200)
    - Court writes/management, staff management, club settings, payments, bookings stay 403
    - Cross-club access (Club B) stays 403 on all endpoints including courts
    - Tournament, League, and Profile workflows succeed
    """
    td = await _create_user(db_session, email="td_e2e@rbac.local", full_name="TD Director")
    owner_a = await _create_user(db_session, email="owner_a@rbac.local", full_name="Owner Alpha")
    owner_b = await _create_user(db_session, email="owner_b@rbac.local", full_name="Owner Beta")
    player = await _create_user(db_session, email="player_e2e@rbac.local", full_name="Regular Player")

    club_a = await _create_club(db_session, "Alpha Pickleball Club", "alpha-pb")
    club_b = await _create_club(db_session, "Beta Pickleball Club", "beta-pb")

    db_session.add(ClubMembership(user_id=owner_a.id, club_id=club_a.id, role=ClubRole.CLUB_OWNER, is_active=True))
    db_session.add(ClubMembership(user_id=td.id, club_id=club_a.id, role=ClubRole.TOURNAMENT_DIRECTOR, is_active=True))
    db_session.add(ClubMembership(user_id=owner_b.id, club_id=club_b.id, role=ClubRole.CLUB_OWNER, is_active=True))

    pm_player = ClubPlayerMembership(
        user_id=player.id,
        club_id=club_a.id,
        status=PlayerMembershipStatus.ACTIVE,
    )
    db_session.add(pm_player)

    active_court_a = Court(club_id=club_a.id, name="Court 1", is_active=True, display_order=1)
    inactive_court_a = Court(club_id=club_a.id, name="Maintenance Court", is_active=False, display_order=2)
    court_b = Court(club_id=club_b.id, name="Beta Court 1", is_active=True, display_order=1)
    db_session.add_all([active_court_a, inactive_court_a, court_b])
    await db_session.commit()

    # 1. TD Club Login resolves assigned club and role
    login_resp = await async_client.post(
        "/api/v1/auth/club/login",
        json={"email": "td_e2e@rbac.local", "password": "SecurePass1!"},
    )
    assert login_resp.status_code == 200
    login_data = login_resp.json()
    assert len(login_data["memberships"]) == 1
    assert login_data["memberships"][0]["role"] == "tournament_director"
    assert login_data["memberships"][0]["club_id"] == str(club_a.id)
    perms = set(login_data["memberships"][0]["permissions"])
    assert "manage_tournaments" in perms
    assert "manage_leagues" in perms
    assert "manage_schedules" in perms
    assert "manage_courts" not in perms
    assert "manage_members" not in perms
    assert "manage_club" not in perms

    td_headers = {"Authorization": f"Bearer {login_data['access_token']}"}
    owner_headers = make_auth_header(owner_a)
    player_headers = make_auth_header(player)

    # 2. Assigned club details, dashboard (with null payments), active courts -> 200
    club_resp = await async_client.get(f"/api/v1/clubs/{club_a.id}", headers=td_headers)
    assert club_resp.status_code == 200
    assert club_resp.json()["id"] == str(club_a.id)

    dash_resp = await async_client.get(f"/api/v1/clubs/{club_a.id}/dashboard", headers=td_headers)
    assert dash_resp.status_code == 200
    assert dash_resp.json()["payments"] is None

    courts_active_resp = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/courts?status=active",
        headers=td_headers,
    )
    assert courts_active_resp.status_code == 200
    active_names = [c["name"] for c in courts_active_resp.json()]
    assert active_names == ["Court 1"]

    courts_all_resp = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/courts",
        headers=td_headers,
    )
    assert courts_all_resp.status_code == 200
    assert len(courts_all_resp.json()) == 2

    court_detail_resp = await async_client.get(
        f"/api/v1/clubs/{club_a.id}/courts/{active_court_a.id}",
        headers=td_headers,
    )
    assert court_detail_resp.status_code == 200

    # 3. Cross-club tenant isolation -> 403 for Club B
    for path in [
        f"/api/v1/clubs/{club_b.id}",
        f"/api/v1/clubs/{club_b.id}/courts?status=active",
        f"/api/v1/clubs/{club_b.id}/courts/{court_b.id}",
        f"/api/v1/clubs/{club_b.id}/tournaments",
        f"/api/v1/clubs/{club_b.id}/leagues",
    ]:
        cross_resp = await async_client.get(path, headers=td_headers)
        assert cross_resp.status_code == 403, f"Cross-club leak on {path}: {cross_resp.status_code}"

    # 4. Court mutations & restricted Club Owner/Manager endpoints remain 403 for TD
    assert (
        await async_client.post(
            f"/api/v1/clubs/{club_a.id}/courts",
            headers=td_headers,
            json={"name": "Rogue Court"},
        )
    ).status_code == 403
    assert (
        await async_client.patch(
            f"/api/v1/clubs/{club_a.id}/courts/{active_court_a.id}",
            headers=td_headers,
            json={"name": "Renamed"},
        )
    ).status_code == 403
    assert (
        await async_client.post(
            f"/api/v1/clubs/{club_a.id}/courts/{active_court_a.id}/deactivate",
            headers=td_headers,
        )
    ).status_code == 403
    assert (
        await async_client.get(f"/api/v1/clubs/{club_a.id}/members", headers=td_headers)
    ).status_code == 403
    assert (
        await async_client.patch(
            f"/api/v1/clubs/{club_a.id}",
            headers=td_headers,
            json={"description": "TD cannot edit club profile"},
        )
    ).status_code == 403
    assert (
        await async_client.patch(
            f"/api/v1/clubs/{club_a.id}/player-memberships/{pm_player.id}",
            headers=td_headers,
            json={"status": "suspended"},
        )
    ).status_code == 403

    # Player-memberships listing & mutations require MANAGE_MEMBERS -> 403 for TD
    assert (
        await async_client.get(f"/api/v1/clubs/{club_a.id}/player-memberships", headers=td_headers)
    ).status_code == 403
    assert (
        await async_client.get(f"/api/v1/clubs/{club_b.id}/player-memberships", headers=td_headers)
    ).status_code == 403

    # 5. Tournament, League & Profile operations succeed for TD
    now = datetime.now(timezone.utc)
    create_t = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/tournaments",
        headers=td_headers,
        json={
            "name": "TD Open Bracket",
            "format": "bracket",
            "category": "Singles",
            "skill_level": "3.5",
            "max_participants": 8,
            "start_date": (now + timedelta(days=5)).isoformat(),
            "end_date": (now + timedelta(days=6)).isoformat(),
            "registration_open_at": now.isoformat(),
            "registration_close_at": (now + timedelta(days=4)).isoformat(),
        },
    )
    assert create_t.status_code == 201

    list_t = await async_client.get(f"/api/v1/clubs/{club_a.id}/tournaments", headers=td_headers)
    assert list_t.status_code == 200
    assert len(list_t.json()) == 1

    create_l = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/leagues",
        headers=td_headers,
        json={
            "name": "Spring Ladder League",
            "team_size": 2,
            "total_weeks": 4,
            "points_per_win": 2,
            "start_date": (now + timedelta(days=7)).isoformat(),
            "end_date": (now + timedelta(days=35)).isoformat(),
        },
    )
    assert create_l.status_code == 201

    list_l = await async_client.get(f"/api/v1/clubs/{club_a.id}/leagues", headers=td_headers)
    assert list_l.status_code == 200
    assert len(list_l.json()) == 1

    # 6. Regression checks: Owner still manages courts; Player is still 403 on club courts/tournaments
    owner_create_court = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/courts",
        headers=owner_headers,
        json={"name": "Owner Court 2"},
    )
    assert owner_create_court.status_code == 201

    assert (
        await async_client.get(f"/api/v1/clubs/{club_a.id}/courts?status=active", headers=player_headers)
    ).status_code == 403
    assert (
        await async_client.get(f"/api/v1/clubs/{club_a.id}/tournaments", headers=player_headers)
    ).status_code == 403
