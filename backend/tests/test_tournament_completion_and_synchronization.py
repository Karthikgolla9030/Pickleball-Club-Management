"""
Aught2 Pickleball — Tournament Completion and Synchronization Tests

Validates end-to-end for all tournament formats:
1. Standardized close-registration endpoint (POST /api/v1/tournaments/{id}/close-registration)
2. Automatic completion upon final match result recording:
   - Status transition to 'completed'
   - Winner persisted into format_configuration["winner"]
   - Podium persisted into format_configuration["podium"]
3. Format-specific lifecycle completion:
   - Round Robin (all matches completed -> auto-completes with standings winner)
   - Bracket (championship final scored -> auto-completes with champion & runner-up)
   - Pool Play (pool & championship matches completed -> auto-completes)
   - Scramble (end-tournament crowns champion and auto-completes)
4. Full synchronization across Club and Player viewpoints:
   - GET /api/v1/clubs/{club_id}/tournaments/{id} shows status 'completed' with winner & podium
   - GET /api/v1/clubs/{club_id}/tournaments listing shows status 'completed'
   - GET /api/v1/tournaments/{id} shows status 'completed' with winner & podium
   - GET /api/v1/tournaments listing shows status 'completed'
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.player_profile import PlayerProfile
from app.models.tournament import (
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.models.user import User
from tests.conftest import make_auth_header


async def create_test_env(db_session: AsyncSession, num_players: int = 4):
    """Creates a club, tournament director, and N active club players."""
    club = Club(
        name=f"Sync Club {uuid.uuid4().hex[:6]}",
        slug=f"sync-club-{uuid.uuid4().hex[:6]}",
        is_active=True,
    )
    db_session.add(club)
    await db_session.flush()

    td = User(
        email=f"td_{uuid.uuid4().hex[:6]}@test.local",
        hashed_password=hash_password("Pass123!"),
        full_name="Tournament Director",
        is_active=True,
        is_verified=True,
    )
    db_session.add(td)
    await db_session.flush()

    td_m = ClubMembership(
        user_id=td.id,
        club_id=club.id,
        role=ClubRole.TOURNAMENT_DIRECTOR,
        is_active=True,
    )
    db_session.add(td_m)
    await db_session.flush()

    players = []
    player_memberships = []
    for i in range(num_players):
        u = User(
            email=f"player_{i}_{uuid.uuid4().hex[:6]}@test.local",
            hashed_password=hash_password("Pass123!"),
            full_name=f"Player {chr(65 + i)}",
            is_active=True,
            is_verified=True,
        )
        db_session.add(u)
        await db_session.flush()
        db_session.add(PlayerProfile(user_id=u.id, display_name=f"Player {chr(65 + i)}"))
        players.append(u)

        pm = ClubPlayerMembership(
            user_id=u.id,
            club_id=club.id,
            status=PlayerMembershipStatus.ACTIVE,
            membership_number=f"M-{i+1:03d}",
        )
        db_session.add(pm)
        await db_session.flush()
        player_memberships.append(pm)

    await db_session.commit()

    return {
        "club": club,
        "td": td,
        "td_header": make_auth_header(td.id),
        "players": players,
        "player_memberships": player_memberships,
    }


# ==============================================================================
# 1. Round Robin: Lifecycle, Close Registration & Automatic Completion
# ==============================================================================

@pytest.mark.asyncio
async def test_round_robin_lifecycle_and_automatic_completion(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Verify Round Robin full flow from registration to final match completion and status sync."""
    env = await create_test_env(db_session, num_players=4)
    club = env["club"]
    td_header = env["td_header"]
    now = datetime.now(timezone.utc)

    # 1. Create Tournament (Singles Round Robin)
    create_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments",
        headers=td_header,
        json={
            "name": "Spring Round Robin Championship",
            "format": "round_robin",
            "category": "singles",
            "format_configuration": {"category": "Singles"},
            "start_date": (now + timedelta(days=2)).isoformat(),
            "end_date": (now + timedelta(days=3)).isoformat(),
            "registration_open_at": (now - timedelta(days=1)).isoformat(),
            "registration_close_at": (now + timedelta(days=1)).isoformat(),
            "min_participants": 4,
            "max_participants": 8,
            "visibility": "public",
        },
    )
    assert create_res.status_code == 201, create_res.text
    tid = create_res.json()["id"]
    assert create_res.json()["status"] == "draft"

    # 2. Open Registration
    open_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/open-registration",
        headers=td_header,
    )
    assert open_res.status_code == 200
    assert open_res.json()["status"] == "registration_open"

    # 3. Register 4 players
    for p in env["players"]:
        p_hdr = make_auth_header(p.id)
        r = await async_client.post(f"/api/v1/tournaments/{tid}/register", headers=p_hdr)
        assert r.status_code == 201
        assert r.json()["status"] == "confirmed"

    # 4. Standardized Close Registration endpoint
    close_res = await async_client.post(
        f"/api/v1/tournaments/{tid}/close-registration",
        headers=td_header,
    )
    assert close_res.status_code == 200, close_res.text
    assert close_res.json()["status"] == "registration_closed"

    # 5. Verify close-registration automatically created and seeded teams
    teams_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/teams",
        headers=td_header,
    )
    assert teams_res.status_code == 200
    assert len(teams_res.json()) == 4

    # 6. Generate Round Robin matches
    gen_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/generate-round-robin",
        headers=td_header,
    )
    assert gen_res.status_code == 201
    assert gen_res.json()["matches_generated"] == 6

    # 7. Check status is now in_progress for both club and player
    club_t = await async_client.get(f"/api/v1/clubs/{club.id}/tournaments/{tid}", headers=td_header)
    assert club_t.json()["status"] == "in_progress"

    player_hdr = make_auth_header(env["players"][0].id)
    player_t = await async_client.get(f"/api/v1/tournaments/{tid}", headers=player_hdr)
    assert player_t.json()["status"] == "in_progress"

    # 8. Record scores for matches 1 through 5 (tournament remains in_progress)
    matches_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/matches",
        headers=td_header,
    )
    matches = matches_res.json()
    assert len(matches) == 6

    for m in matches[:5]:
        score_res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{tid}/matches/{m['id']}/result",
            headers=td_header,
            json={"score_a": 11, "score_b": 7},
        )
        assert score_res.status_code == 200

    # Tournament must still be in_progress after 5/6 matches
    mid_check = await async_client.get(f"/api/v1/clubs/{club.id}/tournaments/{tid}", headers=td_header)
    assert mid_check.json()["status"] == "in_progress"

    # 9. Record score for final 6th match -> Triggers automatic completion!
    final_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/matches/{matches[5]['id']}/result",
        headers=td_header,
        json={"score_a": 11, "score_b": 5},
    )
    assert final_res.status_code == 200

    # 10. Verify Club-side Details has transitioned to 'completed' with winner & podium
    club_final = await async_client.get(f"/api/v1/clubs/{club.id}/tournaments/{tid}", headers=td_header)
    assert club_final.status_code == 200
    cf_data = club_final.json()
    assert cf_data["status"] == "completed"
    cfg = cf_data["format_configuration"]
    assert cfg is not None
    assert "winner" in cfg
    assert cfg["winner"]["name"] is not None
    assert "podium" in cfg
    assert len(cfg["podium"]) >= 3

    # 11. Verify Club-side Tournament List has status 'completed'
    club_list = await async_client.get(f"/api/v1/clubs/{club.id}/tournaments", headers=td_header)
    assert club_list.status_code == 200
    t_item = next(t for t in club_list.json() if t["id"] == tid)
    assert t_item["status"] == "completed"

    # 12. Verify Player-side Details has status 'completed' with winner & podium
    player_final = await async_client.get(f"/api/v1/tournaments/{tid}", headers=player_hdr)
    assert player_final.status_code == 200
    pf_data = player_final.json()
    assert pf_data["status"] == "completed"
    assert pf_data["format_configuration"]["winner"]["name"] is not None

    # 13. Verify Player-side Tournament Discovery List shows status 'completed'
    player_list = await async_client.get("/api/v1/player/tournaments", headers=player_hdr)
    assert player_list.status_code == 200
    pt_item = next(t for t in player_list.json() if t["id"] == tid)
    assert pt_item["status"] == "completed"


# ==============================================================================
# 2. Bracket: Lifecycle, Close Registration & Championship Completion
# ==============================================================================

@pytest.mark.asyncio
async def test_bracket_lifecycle_and_championship_completion(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Verify Bracket format tournament completes and crowns champion upon final match."""
    env = await create_test_env(db_session, num_players=4)
    club = env["club"]
    td_header = env["td_header"]
    pms = env["player_memberships"]
    now = datetime.now(timezone.utc)

    # 1. Create Tournament (Bracket)
    create_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments",
        headers=td_header,
        json={
            "name": "Summer Bracket Knockout",
            "format": "bracket",
            "category": "doubles",
            "start_date": (now + timedelta(days=2)).isoformat(),
            "end_date": (now + timedelta(days=3)).isoformat(),
            "registration_open_at": (now - timedelta(days=1)).isoformat(),
            "registration_close_at": (now + timedelta(days=1)).isoformat(),
            "min_participants": 4,
            "max_participants": 8,
            "visibility": "public",
        },
    )
    assert create_res.status_code == 201
    tid = create_res.json()["id"]

    # 2. Open registration and register players
    await async_client.post(f"/api/v1/clubs/{club.id}/tournaments/{tid}/open-registration", headers=td_header)
    for p in env["players"]:
        await async_client.post(f"/api/v1/tournaments/{tid}/register", headers=make_auth_header(p.id))

    # 3. Create 2 doubles teams
    t1_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/teams",
        headers=td_header,
        json={"name": "Thunderbolts", "seed": 1, "player_membership_ids": [str(pms[0].id), str(pms[1].id)]},
    )
    assert t1_res.status_code == 201
    t1_id = t1_res.json()["id"]

    t2_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/teams",
        headers=td_header,
        json={"name": "Lightnings", "seed": 2, "player_membership_ids": [str(pms[2].id), str(pms[3].id)]},
    )
    assert t2_res.status_code == 201

    # 4. Standardized Close Registration
    close_res = await async_client.post(f"/api/v1/tournaments/{tid}/close-registration", headers=td_header)
    assert close_res.status_code == 200
    assert close_res.json()["status"] == "registration_closed"

    # 5. Generate Bracket -> transitions to in_progress
    gen_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/generate-bracket",
        headers=td_header,
    )
    assert gen_res.status_code == 201

    # 6. Fetch championship match
    bracket_matches = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/bracket/matches",
        headers=td_header,
    )
    assert bracket_matches.status_code == 200
    b_matches = bracket_matches.json()
    assert len(b_matches) == 1
    champ_match = b_matches[0]

    # 7. Record score for the championship match
    score_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/matches/{champ_match['id']}/result",
        headers=td_header,
        json={"score_a": 11, "score_b": 6},
    )
    assert score_res.status_code == 200

    # 8. Verify tournament has automatically completed and crowned champion
    club_final = await async_client.get(f"/api/v1/clubs/{club.id}/tournaments/{tid}", headers=td_header)
    assert club_final.status_code == 200
    data = club_final.json()
    assert data["status"] == "completed"
    cfg = data["format_configuration"]
    assert cfg["winner"]["team_id"] == t1_id
    assert cfg["winner"]["name"] == "Thunderbolts"
    assert len(cfg["podium"]) == 2
    assert cfg["podium"][0]["team_id"] == t1_id
    assert "Champion" in cfg["podium"][0]["finish"]

    # 9. Verify player view is completed
    player_res = await async_client.get(f"/api/v1/tournaments/{tid}", headers=make_auth_header(env["players"][0].id))
    assert player_res.status_code == 200
    assert player_res.json()["status"] == "completed"
    assert player_res.json()["format_configuration"]["winner"]["name"] == "Thunderbolts"


# ==============================================================================
# 3. Scramble: Lifecycle, Close Registration & End Tournament Completion
# ==============================================================================

@pytest.mark.asyncio
async def test_scramble_lifecycle_and_end_tournament_completion(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Verify Scramble format tournament completes upon ending tournament."""
    env = await create_test_env(db_session, num_players=4)
    club = env["club"]
    td_header = env["td_header"]
    now = datetime.now(timezone.utc)

    # 1. Create Scramble Tournament
    create_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments",
        headers=td_header,
        json={
            "name": "Social Scramble Saturday",
            "format": "scramble",
            "format_configuration": {"rounds": 2, "category": "Open Scramble"},
            "start_date": (now + timedelta(days=2)).isoformat(),
            "end_date": (now + timedelta(days=3)).isoformat(),
            "registration_open_at": (now - timedelta(days=1)).isoformat(),
            "registration_close_at": (now + timedelta(days=1)).isoformat(),
            "min_participants": 4,
            "max_participants": 16,
            "visibility": "public",
        },
    )
    assert create_res.status_code == 201
    tid = create_res.json()["id"]

    # 2. Open registration and register 4 players
    await async_client.post(f"/api/v1/clubs/{club.id}/tournaments/{tid}/open-registration", headers=td_header)
    for p in env["players"]:
        await async_client.post(f"/api/v1/tournaments/{tid}/register", headers=make_auth_header(p.id))

    # 3. Standardized Close Registration
    close_res = await async_client.post(f"/api/v1/tournaments/{tid}/close-registration", headers=td_header)
    assert close_res.status_code == 200
    assert close_res.json()["status"] == "registration_closed"

    # 4. Generate Scramble matchups for round 1
    m_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/scramble/matchups",
        headers=td_header,
        json={},
    )
    assert m_res.status_code == 200

    # 5. Start Round 1
    start_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/scramble/start-round",
        headers=td_header,
    )
    assert start_res.status_code == 200

    # 6. Fetch matches and record scores
    matches_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/matches",
        headers=td_header,
    )
    matches = matches_res.json()
    assert len(matches) == 3

    for m in matches:
        rec_res = await async_client.post(
            f"/api/v1/clubs/{club.id}/tournaments/{tid}/matches/{m['id']}/result",
            headers=td_header,
            json={"score_a": 11, "score_b": 5},
        )
        assert rec_res.status_code == 200

    # 7. Finish Round 1
    finish_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/scramble/finish-round",
        headers=td_header,
    )
    assert finish_res.status_code == 200

    # 8. End Scramble Tournament -> Crowns Champion & Transitions to completed
    end_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/scramble/end-tournament",
        headers=td_header,
    )
    assert end_res.status_code == 200

    # 9. Verify Club Details has completed status and winner / podium
    club_final = await async_client.get(f"/api/v1/clubs/{club.id}/tournaments/{tid}", headers=td_header)
    assert club_final.status_code == 200
    cf_data = club_final.json()
    assert cf_data["status"] == "completed"
    assert "winner" in cf_data["format_configuration"]
    assert "podium" in cf_data["format_configuration"]

    # 10. Verify Player side has completed status and winner
    player_res = await async_client.get(f"/api/v1/tournaments/{tid}", headers=make_auth_header(env["players"][0].id))
    assert player_res.status_code == 200
    assert player_res.json()["status"] == "completed"


# ==============================================================================
# 4. Pool Play: Lifecycle, Close Registration & Completion
# ==============================================================================

@pytest.mark.asyncio
async def test_pool_play_lifecycle_and_completion(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Verify Pool Play format tournament completes and sets winner upon final match score."""
    env = await create_test_env(db_session, num_players=4)
    club = env["club"]
    td_header = env["td_header"]
    now = datetime.now(timezone.utc)

    # 1. Create Pool Play Tournament
    create_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments",
        headers=td_header,
        json={
            "name": "Midsummer Pool Play Open",
            "format": "pool_play",
            "category": "singles",
            "format_configuration": {"category": "Singles"},
            "start_date": (now + timedelta(days=2)).isoformat(),
            "end_date": (now + timedelta(days=3)).isoformat(),
            "registration_open_at": (now - timedelta(days=1)).isoformat(),
            "registration_close_at": (now + timedelta(days=1)).isoformat(),
            "min_participants": 4,
            "max_participants": 8,
            "visibility": "public",
        },
    )
    assert create_res.status_code == 201
    tid = create_res.json()["id"]

    # 2. Open registration and register 4 players
    await async_client.post(f"/api/v1/clubs/{club.id}/tournaments/{tid}/open-registration", headers=td_header)
    for p in env["players"]:
        await async_client.post(f"/api/v1/tournaments/{tid}/register", headers=make_auth_header(p.id))

    # 3. Standardized Close Registration
    close_res = await async_client.post(f"/api/v1/tournaments/{tid}/close-registration", headers=td_header)
    assert close_res.status_code == 200
    assert close_res.json()["status"] == "registration_closed"

    # 4. Configure 2 pools
    cfg_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/pools/configure",
        headers=td_header,
        json={"number_of_pools": 2, "qualifiers_per_pool": 1},
    )
    assert cfg_res.status_code == 200

    # 5. Generate pool play matches
    gen_res = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/generate-pool-play",
        headers=td_header,
    )
    assert gen_res.status_code == 201
    assert gen_res.json()["matches_generated"] == 2

    # 6. Check status in_progress
    club_t = await async_client.get(f"/api/v1/clubs/{club.id}/tournaments/{tid}", headers=td_header)
    assert club_t.json()["status"] == "in_progress"

    # 7. List matches and score match 1
    matches_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/matches",
        headers=td_header,
    )
    matches = matches_res.json()
    assert len(matches) == 2

    r1 = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/matches/{matches[0]['id']}/result",
        headers=td_header,
        json={"score_a": 11, "score_b": 5},
    )
    assert r1.status_code == 200

    # Still in_progress after 1/2 matches
    mid = await async_client.get(f"/api/v1/clubs/{club.id}/tournaments/{tid}", headers=td_header)
    assert mid.json()["status"] == "in_progress"

    # 8. Score pool match 2 -> Pool stage completed, tournament remains in_progress for championship
    r2 = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/matches/{matches[1]['id']}/result",
        headers=td_header,
        json={"score_a": 11, "score_b": 7},
    )
    assert r2.status_code == 200

    mid2 = await async_client.get(f"/api/v1/clubs/{club.id}/tournaments/{tid}", headers=td_header)
    assert mid2.json()["status"] == "in_progress"

    # Standings show qualified teams now that pool stage is complete
    standings_res = await async_client.get(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/pools/standings",
        headers=td_header,
    )
    assert standings_res.status_code == 200
    p1_standings = standings_res.json()["pools"][0]["standings"]
    assert any(s["qualified"] is True for s in p1_standings)

    # 9. Generate Championship Bracket for qualifying teams
    champ_gen = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/generate-championship",
        headers=td_header,
    )
    assert champ_gen.status_code == 201
    champ_matches = (
        await async_client.get(
            f"/api/v1/clubs/{club.id}/tournaments/{tid}/championship/matches",
            headers=td_header,
        )
    ).json()
    assert len(champ_matches) >= 1

    # 10. Complete championship final match -> Marks tournament completed!
    final_m = champ_matches[-1]
    res_final = await async_client.post(
        f"/api/v1/clubs/{club.id}/tournaments/{tid}/matches/{final_m['id']}/result",
        headers=td_header,
        json={"score_a": 11, "score_b": 8},
    )
    assert res_final.status_code == 200

    # 11. Verify Club Details has completed status and winner / podium
    club_final = await async_client.get(f"/api/v1/clubs/{club.id}/tournaments/{tid}", headers=td_header)
    assert club_final.status_code == 200
    cf_data = club_final.json()
    assert cf_data["status"] == "completed"
    assert "winner" in cf_data["format_configuration"]
    assert "podium" in cf_data["format_configuration"]
    assert len(cf_data["format_configuration"]["podium"]) >= 2

    # 12. Verify Player View has completed status
    player_res = await async_client.get(f"/api/v1/tournaments/{tid}", headers=make_auth_header(env["players"][0].id))
    assert player_res.status_code == 200
    assert player_res.json()["status"] == "completed"
    assert player_res.json()["format_configuration"]["winner"]["name"] is not None

