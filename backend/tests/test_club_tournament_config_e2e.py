"""
Aught2 Pickleball — Club-Level Tournament Configuration E2E Tests

Verifies:
  1. New clubs start with no saved format configurations (empty `{}`).
  2. Each format (`round_robin`, `pool_play`, `bracket`, `scramble`) persists independently
     without overwriting or creating sibling formats.
  3. Saved configurations survive fresh `GET /clubs/{id}` fetches (simulating page reload,
     re-login, or multi-device inspection).
  4. Updating a saved format (`Save Changes`) merges cleanly and does NOT affect sibling formats,
     other clubs, or existing/completed individual tournaments.
  5. Newly created tournaments inherit the club's saved format defaults when created.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.court import Court, CourtEnvironment, CourtStatus
from app.models.tournament import Tournament, TournamentFormat, TournamentStatus
from app.models.user import User
from tests.conftest import make_auth_header


@pytest.mark.asyncio
async def test_e2e_club_tournament_config_independent_formats_and_persistence(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    now = datetime.now(timezone.utc)
    owner_a = User(
        email=f"cfg_owner_a_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("Pass123!"),
        full_name="Owner Alpha",
        is_active=True,
        is_verified=True,
    )
    owner_b = User(
        email=f"cfg_owner_b_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=hash_password("Pass123!"),
        full_name="Owner Beta",
        is_active=True,
        is_verified=True,
    )
    db_session.add_all([owner_a, owner_b])
    await db_session.flush()

    club_a = Club(
        id=uuid.uuid4(),
        name="Club Config Alpha",
        slug=f"cfg-alpha-{uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    club_b = Club(
        id=uuid.uuid4(),
        name="Club Config Beta",
        slug=f"cfg-beta-{uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    db_session.add_all([club_a, club_b])
    await db_session.flush()

    db_session.add_all([
        ClubMembership(club_id=club_a.id, user_id=owner_a.id, role=ClubRole.CLUB_OWNER, is_active=True),
        ClubMembership(club_id=club_b.id, user_id=owner_b.id, role=ClubRole.CLUB_OWNER, is_active=True),
    ])

    court_a = Court(
        club_id=club_a.id,
        name="Alpha Court 1",
        indoor_outdoor=CourtEnvironment.INDOOR,
        status=CourtStatus.ACTIVE,
        is_active=True,
    )
    db_session.add(court_a)

    # Pre-existing completed tournament with its own snapshot scoring_rules
    existing_t = Tournament(
        id=uuid.uuid4(),
        club_id=club_a.id,
        created_by_user_id=owner_a.id,
        name="Legacy Completed RR",
        format=TournamentFormat.ROUND_ROBIN,
        status=TournamentStatus.COMPLETED,
        start_date=now - timedelta(days=10),
        end_date=now - timedelta(days=9),
        registration_open_at=now - timedelta(days=20),
        registration_close_at=now - timedelta(days=11),
        scoring_rules={"game_format": "single_game", "target_score": 11, "win_by": 2},
        format_configuration={"court_allocation_preference": "all_available"},
    )
    db_session.add(existing_t)
    await db_session.commit()

    headers_a = make_auth_header(owner_a.id)
    headers_b = make_auth_header(owner_b.id)

    # 1. Initial GET: no format configurations saved yet
    init_get = await async_client.get(f"/api/v1/clubs/{club_a.id}", headers=headers_a)
    assert init_get.status_code == 200
    assert (init_get.json().get("tournament_configuration") or {}) == {}

    # 2. Save ONLY round_robin -> bracket, pool_play, scramble must remain unset!
    rr_payload = {
        "target_score": 15,
        "win_by": 2,
        "game_format": "single_game",
        "court_allocation_preference": "sequential",
        "tiebreaker_rules": ["wins", "points_differential", "total_points_scored", "team_name_deterministic"],
        "match_scoring": {"game_format": "single_game", "target_score": 15, "win_by": 2},
    }
    p_rr = await async_client.patch(
        f"/api/v1/clubs/{club_a.id}",
        headers=headers_a,
        json={"tournament_configuration": {"round_robin": rr_payload}},
    )
    assert p_rr.status_code == 200
    tc_after_rr = p_rr.json()["tournament_configuration"]
    assert tc_after_rr["round_robin"]["target_score"] == 15
    assert tc_after_rr["round_robin"]["court_allocation_preference"] == "sequential"
    assert "pool_play" not in tc_after_rr
    assert "bracket" not in tc_after_rr
    assert "scramble" not in tc_after_rr

    # 3. Independently save bracket, pool_play, scramble without overwriting sibling formats
    br_payload = {
        "bracket_type": "Double Elimination",
        "seeding_method": "Random Draw",
        "bye_rule": "Automatic BYEs awarded to top seeds",
        "target_score": 21,
        "win_by": 2,
        "court_allocation_preference": "all_available",
        "match_scoring": {"game_format": "single_game", "target_score": 21, "win_by": 2},
    }
    p_br = await async_client.patch(
        f"/api/v1/clubs/{club_a.id}",
        headers=headers_a,
        json={"tournament_configuration": {"bracket": br_payload}},
    )
    assert p_br.status_code == 200
    tc_after_br = p_br.json()["tournament_configuration"]
    assert tc_after_br["round_robin"]["target_score"] == 15  # preserved!
    assert tc_after_br["bracket"]["bracket_type"] == "Double Elimination"
    assert tc_after_br["bracket"]["target_score"] == 21
    assert "pool_play" not in tc_after_br
    assert "scramble" not in tc_after_br

    pp_payload = {
        "pool_count": 4,
        "teams_per_pool": 4,
        "qualifiers_per_pool": 2,
        "pool_bracket_type": "Single Elimination",
        "target_score": 11,
        "win_by": 2,
        "court_allocation_preference": "sequential",
        "match_scoring": {"game_format": "single_game", "target_score": 11, "win_by": 2},
    }
    p_pp = await async_client.patch(
        f"/api/v1/clubs/{club_a.id}",
        headers=headers_a,
        json={"tournament_configuration": {"pool_play": pp_payload}},
    )
    assert p_pp.status_code == 200

    sc_payload = {
        "planned_rounds": 6,
        "rotation_rule": "Full Rotation (no repeating partners)",
        "leaderboard_metric": "Total Points Scored",
        "target_score": 15,
        "win_by": 1,
        "court_allocation_preference": "all_available",
        "match_scoring": {"game_format": "single_game", "target_score": 15, "win_by": 1},
    }
    p_sc = await async_client.patch(
        f"/api/v1/clubs/{club_a.id}",
        headers=headers_a,
        json={"tournament_configuration": {"scramble": sc_payload}},
    )
    assert p_sc.status_code == 200

    # 4. Simulate reload/re-login: fresh GET returns all 4 independently saved formats
    reload_get = await async_client.get(f"/api/v1/clubs/{club_a.id}", headers=headers_a)
    assert reload_get.status_code == 200
    tc_reloaded = reload_get.json()["tournament_configuration"]
    assert tc_reloaded["round_robin"]["target_score"] == 15
    assert tc_reloaded["bracket"]["target_score"] == 21
    assert tc_reloaded["pool_play"]["court_allocation_preference"] == "sequential"
    assert tc_reloaded["scramble"]["target_score"] == 15
    assert tc_reloaded["scramble"]["win_by"] == 1

    # 5. Update round_robin ("Save Changes") -> updates RR, leaves Bracket/PP/Scramble untouched
    updated_rr = {**rr_payload, "target_score": 21, "match_scoring": {"game_format": "single_game", "target_score": 21, "win_by": 2}}
    p_upd = await async_client.patch(
        f"/api/v1/clubs/{club_a.id}",
        headers=headers_a,
        json={"tournament_configuration": {"round_robin": updated_rr}},
    )
    assert p_upd.status_code == 200
    tc_updated = p_upd.json()["tournament_configuration"]
    assert tc_updated["round_robin"]["target_score"] == 21
    assert tc_updated["bracket"]["bracket_type"] == "Double Elimination"
    assert tc_updated["scramble"]["win_by"] == 1

    # 6. Club B isolation check
    get_b = await async_client.get(f"/api/v1/clubs/{club_b.id}", headers=headers_b)
    assert get_b.status_code == 200
    assert (get_b.json().get("tournament_configuration") or {}) == {}

    # 7. Existing/completed tournament in Club A was NOT overwritten, while new tournament inherits defaults
    refreshed_existing = (
        await db_session.execute(select(Tournament).where(Tournament.id == existing_t.id))
    ).scalar_one()
    assert refreshed_existing.scoring_rules["target_score"] == 11  # unchanged!

    new_t_res = await async_client.post(
        f"/api/v1/clubs/{club_a.id}/tournaments",
        headers=headers_a,
        json={
            "name": "Autumn RR Using Defaults",
            "format": "round_robin",
            "visibility": "public",
            "start_date": (now + timedelta(days=5)).isoformat(),
            "end_date": (now + timedelta(days=6)).isoformat(),
            "registration_open_at": now.isoformat(),
            "registration_close_at": (now + timedelta(days=4)).isoformat(),
            "format_configuration": {"category": "Singles", "team_size": 1},
        },
    )
    assert new_t_res.status_code == 201, new_t_res.text
    created_t = new_t_res.json()
    assert created_t["scoring_rules"]["target_score"] == 21
    assert created_t["format_configuration"]["court_allocation_preference"] == "sequential"
