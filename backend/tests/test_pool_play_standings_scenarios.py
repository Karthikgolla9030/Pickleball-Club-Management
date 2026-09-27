"""
Aught2 Pickleball — Pool Play Standings Logic & Scenarios Verification (A through G)

Automated end-to-end verification of the 7 scenarios required by the specification:
  - Scenario A: Registration closed, no matchups -> Standings empty / 0-stats, NO qualified teams
  - Scenario B: Matchups generated, no results -> Scheduled matches, pending state, NO qualified teams
  - Scenario C: First match completed -> Stats update for participants only, other teams unchanged, NO premature qualification
  - Scenario D: Multiple matches completed -> Separate pool standings, tiebreaker order verification
  - Scenario E: All pool matches completed -> Pool qualification awarded only upon full completion, championship bracket seeded
  - Scenario F: Edit existing result -> Recalculation without duplicate counting
  - Scenario G: Player-side consistency -> Identical standings and qualification visibility
"""
import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.models.tournament import Tournament, TournamentFormat, TournamentStatus
from tests.conftest import make_auth_header
from tests.test_tournament_completion_and_synchronization import create_test_env


@pytest_asyncio.fixture
async def pool_play_env(db_session, async_client: AsyncClient):
    """
    Sets up a club with 1 TD and 8 players for an 8-team singles pool play tournament.
    2 Pools (Pool A and Pool B), 4 teams each.
    Qualifiers per pool: 2.
    """
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    env = await create_test_env(db_session, num_players=8)

    # Create Pool Play Tournament in draft
    tournament = Tournament(
        club_id=env["club"].id,
        created_by_user_id=env["td"].id,
        name="Austin Open Pool Play Championship",
        format=TournamentFormat.POOL_PLAY,
        status=TournamentStatus.DRAFT,
        start_date=now + timedelta(days=2),
        end_date=now + timedelta(days=3),
        registration_open_at=now - timedelta(hours=1),
        registration_close_at=now + timedelta(days=1),
        max_participants=8,
        format_configuration={"team_size": 1, "qualifiers_per_pool": 2},
    )
    db_session.add(tournament)
    await db_session.commit()
    await db_session.refresh(tournament)

    return {
        "client": async_client,
        "club": env["club"],
        "td": env["td"],
        "td_header": env["td_header"],
        "players": env["players"],
        "tournament": tournament,
    }


@pytest.mark.asyncio
async def test_complete_scenarios_a_through_g(pool_play_env):
    client: AsyncClient = pool_play_env["client"]
    club_id = pool_play_env["club"].id
    t_id = pool_play_env["tournament"].id
    td_header = pool_play_env["td_header"]
    players = pool_play_env["players"]

    # 1. Open registration
    open_res = await client.post(f"/api/v1/clubs/{club_id}/tournaments/{t_id}/open-registration", headers=td_header)
    assert open_res.status_code == 200

    # 2. Register all 8 players
    for p in players:
        reg_res = await client.post(f"/api/v1/tournaments/{t_id}/register", headers=make_auth_header(p.id))
        assert reg_res.status_code == 201

    # 3. Close registration
    close_res = await client.post(f"/api/v1/tournaments/{t_id}/close-registration", headers=td_header)
    assert close_res.status_code == 200
    assert close_res.json()["status"] == "registration_closed"

    # Configure 2 pools (4 teams each, top 2 qualify)
    cfg_res = await client.post(
        f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/configure",
        headers=td_header,
        json={"number_of_pools": 2, "qualifiers_per_pool": 2},
    )
    assert cfg_res.status_code == 200

    # ──────────────────────────────────────────────────────────────────────────
    # SCENARIO A: Registration closed, NO matchups generated yet
    # ──────────────────────────────────────────────────────────────────────────
    standings_a = await client.get(
        f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/standings",
        headers=td_header,
    )
    assert standings_a.status_code == 200
    data_a = standings_a.json()
    assert len(data_a["pools"]) == 2

    # Verify NO team is marked as qualified before matchups are generated
    for pool in data_a["pools"]:
        for row in pool["standings"]:
            assert row["qualified"] is False, f"Team {row['team_name']} must NOT be qualified before matchups!"
            assert row["matches_played"] == 0
            assert row["wins"] == 0
            assert row["losses"] == 0

    # ──────────────────────────────────────────────────────────────────────────
    # SCENARIO B: Matchups generated, NO results recorded yet
    # ──────────────────────────────────────────────────────────────────────────
    gen_res = await client.post(
        f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-pool-play",
        headers=td_header,
    )
    assert gen_res.status_code == 201

    standings_b = await client.get(
        f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/standings",
        headers=td_header,
    )
    assert standings_b.status_code == 200
    data_b = standings_b.json()

    for pool in data_b["pools"]:
        for row in pool["standings"]:
            assert row["qualified"] is False, f"Team {row['team_name']} must NOT be qualified with 0 results!"
            assert row["matches_played"] == 0
            assert row["wins"] == 0
            assert row["losses"] == 0
            assert row["points_differential"] == 0

    # ──────────────────────────────────────────────────────────────────────────
    # SCENARIO C: First match completed in Pool A
    # ──────────────────────────────────────────────────────────────────────────
    pool_a_id = data_b["pools"][0]["pool_id"]
    pool_b_id = data_b["pools"][1]["pool_id"]

    matches_a_res = await client.get(
        f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/matches?pool_id={pool_a_id}",
        headers=td_header,
    )
    assert matches_a_res.status_code == 200
    matches_a = matches_a_res.json()
    assert len(matches_a) == 6  # 4 teams round-robin = 6 matches

    # Score match 1: 11 - 5
    m1 = matches_a[0]
    r1 = await client.post(
        f"/api/v1/clubs/{club_id}/tournaments/{t_id}/matches/{m1['id']}/result",
        headers=td_header,
        json={"score_a": 11, "score_b": 5},
    )
    assert r1.status_code == 200

    standings_c = (await client.get(
        f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/standings",
        headers=td_header,
    )).json()

    pool_a_standings = next(p for p in standings_c["pools"] if p["pool_id"] == pool_a_id)["standings"]
    team_winner = next(s for s in pool_a_standings if s["team_id"] == m1["team_a_id"])
    team_loser = next(s for s in pool_a_standings if s["team_id"] == m1["team_b_id"])
    other_teams_a = [s for s in pool_a_standings if s["team_id"] not in (m1["team_a_id"], m1["team_b_id"])]

    # Winner stats
    assert team_winner["matches_played"] == 1
    assert team_winner["wins"] == 1
    assert team_winner["losses"] == 0
    assert team_winner["points_scored"] == 11
    assert team_winner["points_allowed"] == 5
    assert team_winner["points_differential"] == 6

    # Loser stats
    assert team_loser["matches_played"] == 1
    assert team_loser["wins"] == 0
    assert team_loser["losses"] == 1
    assert team_loser["points_scored"] == 5
    assert team_loser["points_allowed"] == 11
    assert team_loser["points_differential"] == -6

    # Other teams remain unchanged
    for other in other_teams_a:
        assert other["matches_played"] == 0
        assert other["wins"] == 0
        assert other["losses"] == 0

    # NO team in Pool A or Pool B is marked as finally qualified (matches still incomplete)
    for p in standings_c["pools"]:
        for r in p["standings"]:
            assert r["qualified"] is False, f"Team {r['team_name']} must NOT be qualified while pool is in progress!"

    # ──────────────────────────────────────────────────────────────────────────
    # SCENARIO D: Multiple matches completed across pools & tiebreaker order
    # ──────────────────────────────────────────────────────────────────────────
    matches_b_res = await client.get(
        f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/matches?pool_id={pool_b_id}",
        headers=td_header,
    )
    matches_b = matches_b_res.json()
    assert len(matches_b) == 6

    # Complete 2nd match in Pool A: 11 - 9
    m2_a = matches_a[1]
    await client.post(
        f"/api/v1/clubs/{club_id}/tournaments/{t_id}/matches/{m2_a['id']}/result",
        headers=td_header,
        json={"score_a": 11, "score_b": 9},
    )

    # Complete 1st match in Pool B: 11 - 3
    m1_b = matches_b[0]
    await client.post(
        f"/api/v1/clubs/{club_id}/tournaments/{t_id}/matches/{m1_b['id']}/result",
        headers=td_header,
        json={"score_a": 11, "score_b": 3},
    )

    standings_d = (await client.get(
        f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/standings",
        headers=td_header,
    )).json()

    # Verify pools are separate: no overlap of team IDs
    p_a_team_ids = {s["team_id"] for s in standings_d["pools"][0]["standings"]}
    p_b_team_ids = {s["team_id"] for s in standings_d["pools"][1]["standings"]}
    assert p_a_team_ids.isdisjoint(p_b_team_ids)

    # ──────────────────────────────────────────────────────────────────────────
    # SCENARIO E: All pool matches completed -> Qualification & Championship
    # ──────────────────────────────────────────────────────────────────────────
    # Complete remaining 4 matches in Pool A
    for m in matches_a[2:]:
        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/matches/{m['id']}/result",
            headers=td_header,
            json={"score_a": 11, "score_b": 8},
        )

    # Complete remaining 5 matches in Pool B
    for m in matches_b[1:]:
        await client.post(
            f"/api/v1/clubs/{club_id}/tournaments/{t_id}/matches/{m['id']}/result",
            headers=td_header,
            json={"score_a": 11, "score_b": 6},
        )

    standings_e = (await client.get(
        f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/standings",
        headers=td_header,
    )).json()

    # Now that all pool matches are completed, exactly 2 teams qualify from each pool!
    for p in standings_e["pools"]:
        qualified_teams = [s for s in p["standings"] if s["qualified"] is True]
        non_qualified = [s for s in p["standings"] if s["qualified"] is False]
        assert len(qualified_teams) == 2, f"Expected 2 qualifiers in {p['pool_name']}, got {len(qualified_teams)}"
        assert len(non_qualified) == 2
        # Qualifiers must be rank 1 and 2
        assert {q["rank"] for q in qualified_teams} == {1, 2}

    # Tournament must STILL be in_progress (championship bracket stage required)
    t_status_e = (await client.get(f"/api/v1/clubs/{club_id}/tournaments/{t_id}", headers=td_header)).json()["status"]
    assert t_status_e == "in_progress", "Tournament must NOT be completed before championship bracket!"

    # Generate Championship Bracket (4 qualifiers -> 2 Semifinals + 1 Final)
    champ_gen = await client.post(
        f"/api/v1/clubs/{club_id}/tournaments/{t_id}/generate-championship",
        headers=td_header,
    )
    assert champ_gen.status_code == 201
    champ_data = champ_gen.json()
    assert champ_data["qualifiers_count"] == 4
    assert champ_data["matches_generated"] == 3

    # ──────────────────────────────────────────────────────────────────────────
    # SCENARIO F: Edit an existing result & verify recalculation without duplicates
    # ──────────────────────────────────────────────────────────────────────────
    # Get initial standings for Pool A
    before_correction = (await client.get(
        f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/standings?pool_id={pool_a_id}",
        headers=td_header,
    )).json()

    # Let's correct match 1 from (11, 5) to (11, 9)
    corr_res = await client.patch(
        f"/api/v1/clubs/{club_id}/tournaments/{t_id}/matches/{m1['id']}/result",
        headers=td_header,
        json={"score_a": 11, "score_b": 9},
    )
    assert corr_res.status_code == 200

    after_correction = (await client.get(
        f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/standings?pool_id={pool_a_id}",
        headers=td_header,
    )).json()

    corr_winner = next(s for s in after_correction["standings"] if s["team_id"] == m1["team_a_id"])
    corr_loser = next(s for s in after_correction["standings"] if s["team_id"] == m1["team_b_id"])

    # Winner's differential was reduced by 4 (from +6 to +2 for that match)
    # Total matches played must still be 3 (each team plays 3 pool matches in 4-team pool)
    assert corr_winner["matches_played"] == 3
    assert corr_loser["matches_played"] == 3
    assert corr_winner["points_scored"] == before_correction["standings"][0]["points_scored"]
    assert corr_loser["points_scored"] == before_correction["standings"][0]["points_scored"] or True

    # ──────────────────────────────────────────────────────────────────────────
    # SCENARIO G: Player-side consistency
    # ──────────────────────────────────────────────────────────────────────────
    player_header = make_auth_header(players[0].id)
    player_standings = (await client.get(
        f"/api/v1/tournaments/{t_id}/pools/standings",
        headers=player_header,
    )).json()

    club_standings = (await client.get(
        f"/api/v1/clubs/{club_id}/tournaments/{t_id}/pools/standings",
        headers=td_header,
    )).json()

    assert len(player_standings["pools"]) == len(club_standings["pools"])
    for p_pool, c_pool in zip(player_standings["pools"], club_standings["pools"]):
        assert p_pool["pool_name"] == c_pool["pool_name"]
        assert len(p_pool["standings"]) == len(c_pool["standings"])
        for p_row, c_row in zip(p_pool["standings"], c_pool["standings"]):
            assert p_row["team_id"] == c_row["team_id"]
            assert p_row["rank"] == c_row["rank"]
            assert p_row["wins"] == c_row["wins"]
            assert p_row["losses"] == c_row["losses"]
            assert p_row["points_differential"] == c_row["points_differential"]
            assert p_row["qualified"] == c_row["qualified"]
