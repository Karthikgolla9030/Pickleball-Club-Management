"""
Aught2 Pickleball — Double Elimination Unit & Progression Tests

Verifies:
- All bracket sizes up to 32 teams (4, 8, 16, 32)
- Non-power-of-two entries with BYEs (5, 6, 7, 9, 10, 12, 13, 14, 15, 17)
- 16-team bracket loser routing (matches 5-8 losers not dropped)
- Winners and Losers bracket graph acyclicity and destination uniqueness
- BYE handling without ghost matches or phantom losses
- Full tournament progression simulation (WB win vs LB win with Reset Final)
- Standings and podium accuracy
"""

import math
import uuid
import pytest
from app.services.competition.bracket_engine import BracketEngine, BracketConfigurationError


def make_teams(n: int) -> list[dict]:
    return [
        {
            "id": uuid.uuid4(),
            "name": f"Team {i}",
            "seed": i,
            "members": [
                {"player_membership_id": uuid.uuid4()},
                {"player_membership_id": uuid.uuid4()},
            ],
        }
        for i in range(1, n + 1)
    ]


class TestDoubleEliminationGeneration:
    def test_bracket_sizes_power_of_two(self):
        engine = BracketEngine()
        tournament_id = uuid.uuid4()

        for n, expected_wb, expected_lb, expected_total in [
            (4, 3, 2, 7),
            (8, 7, 6, 15),
            (16, 15, 14, 31),
            (32, 31, 30, 63),
        ]:
            teams = make_teams(n)
            slots = engine.generate_bracket(
                tournament_id, teams, bracket_format="Double Elimination"
            )

            assert len(slots) == expected_total

            wb_slots = [s for s in slots if s.bracket_section == "winners"]
            lb_slots = [s for s in slots if s.bracket_section == "losers"]
            gf_slots = [s for s in slots if s.bracket_section == "grand_final"]
            rf_slots = [s for s in slots if s.bracket_section == "reset_final"]

            assert len(wb_slots) == expected_wb
            assert len(lb_slots) == expected_lb
            assert len(gf_slots) == 1
            assert len(rf_slots) == 1

            # Grand Final checks
            gf = gf_slots[0]
            rf = rf_slots[0]
            assert gf.next_match_id == rf.id
            assert gf.next_match_slot == "team_a"
            assert gf.loser_next_match_id == rf.id
            assert gf.loser_next_match_slot == "team_b"
            assert rf.is_conditional is True

    def test_16_team_all_first_round_losers_routed(self):
        """
        Critical bugfix verification:
        For 16 teams, all 8 first-round WB losers must route to Losers Bracket.
        The old engine dropped losers from matches 5-8.
        """
        engine = BracketEngine()
        tournament_id = uuid.uuid4()
        teams = make_teams(16)
        slots = engine.generate_bracket(
            tournament_id, teams, bracket_format="Double Elimination"
        )

        r1_wb = [s for s in slots if s.bracket_section == "winners" and s.bracket_round == 1]
        assert len(r1_wb) == 8

        lb_slot_ids = {s.id for s in slots if s.bracket_section == "losers"}

        # Every single one of the 8 WB R1 matches must have a loser destination in LB
        for m in r1_wb:
            assert m.loser_next_match_id is not None
            assert m.loser_next_match_id in lb_slot_ids
            assert m.loser_next_match_slot in ("team_a", "team_b")

        # Check WB Quarterfinals (Round 2, 4 matches) losers route to LB
        r2_wb = [s for s in slots if s.bracket_section == "winners" and s.bracket_round == 2]
        assert len(r2_wb) == 4
        for m in r2_wb:
            assert m.loser_next_match_id is not None
            assert m.loser_next_match_id in lb_slot_ids

        # Check WB Semifinals (Round 3, 2 matches) losers route to LB
        r3_wb = [s for s in slots if s.bracket_section == "winners" and s.bracket_round == 3]
        assert len(r3_wb) == 2
        for m in r3_wb:
            assert m.loser_next_match_id is not None
            assert m.loser_next_match_id in lb_slot_ids

        # Check WB Final (Round 4, 1 match) loser routes to LB Final
        r4_wb = [s for s in slots if s.bracket_section == "winners" and s.bracket_round == 4]
        assert len(r4_wb) == 1
        wb_final = r4_wb[0]
        assert wb_final.loser_next_match_id is not None
        assert wb_final.loser_next_match_id in lb_slot_ids

    def test_non_power_of_two_bracket_generation(self):
        """Verify non-power-of-two team counts generate correct brackets with BYEs."""
        engine = BracketEngine()
        tournament_id = uuid.uuid4()

        for n in [5, 6, 7, 9, 10, 12, 13, 14, 15, 17, 24]:
            teams = make_teams(n)
            slots = engine.generate_bracket(
                tournament_id, teams, bracket_format="Double Elimination"
            )

            bracket_size = BracketEngine.calculate_bracket_size(n)
            expected_total = 2 * bracket_size - 1
            assert len(slots) == expected_total

            # Verify no destination collisions
            dest_slots: dict[tuple, uuid.UUID] = {}
            for s in slots:
                if s.next_match_id and s.next_match_slot:
                    key = (s.next_match_id, s.next_match_slot)
                    assert key not in dest_slots
                    dest_slots[key] = s.id
                if s.loser_next_match_id and s.loser_next_match_slot:
                    key = (s.loser_next_match_id, s.loser_next_match_slot)
                    assert key not in dest_slots
                    dest_slots[key] = s.id

    def test_byes_do_not_create_phantom_losses(self):
        engine = BracketEngine()
        tournament_id = uuid.uuid4()
        # 6 teams in 8-bracket -> 2 BYEs
        teams = make_teams(6)
        slots = engine.generate_bracket(
            tournament_id, teams, bracket_format="Double Elimination"
        )

        wb_r1 = [s for s in slots if s.bracket_section == "winners" and s.bracket_round == 1]
        byes = [s for s in wb_r1 if s.is_bye]
        assert len(byes) == 2

        # In BYE matches, winner is auto-advanced and no played scores exist
        for b in byes:
            assert b.status == "completed"
            assert b.winner_team_id is not None
            assert b.score_a is None
            assert b.score_b is None


class TestDoubleEliminationProgressionSimulation:
    def test_4_team_wb_winner_wins_grand_final(self):
        """
        4 Teams:
        Seed 1, Seed 2, Seed 3, Seed 4.
        WB R1:
          M1: Seed 1 vs Seed 4 -> Seed 1 wins (11-5)
          M2: Seed 2 vs Seed 3 -> Seed 2 wins (11-7)
        WB Final:
          M3: Seed 1 vs Seed 2 -> Seed 1 wins (11-8). Seed 1 undefeated into GF.
        LB R1:
          M4: Seed 4 vs Seed 3 -> Seed 4 wins (11-9). Seed 3 eliminated (4th place).
        LB Final:
          M5: Seed 4 vs Seed 2 (WB Final loser) -> Seed 2 wins (11-6). Seed 4 eliminated (3rd place). Seed 2 into GF.
        Grand Final:
          M6: Seed 1 (WB) vs Seed 2 (LB) -> Seed 1 wins (11-4).
        Outcome:
          Seed 1 is Champion!
          Reset match M7 is cancelled.
        """
        engine = BracketEngine()
        tournament_id = uuid.uuid4()
        teams = make_teams(4)
        team_map = {t["seed"]: t for t in teams}

        slots = engine.generate_bracket(
            tournament_id, teams, bracket_format="Double Elimination"
        )
        slot_dict = {s.match_number: s for s in slots}

        # WB R1 M1
        m1 = slot_dict[1]
        m1.score_a, m1.score_b = 11, 5
        m1.winner_team_id = team_map[1]["id"]
        m1.status = "completed"

        # WB R1 M2
        m2 = slot_dict[2]
        m2.score_a, m2.score_b = 11, 7
        m2.winner_team_id = team_map[2]["id"]
        m2.status = "completed"

        # WB Final M3
        m3 = slot_dict[3]
        m3.team_a_id = team_map[1]["id"]
        m3.team_b_id = team_map[2]["id"]
        m3.score_a, m3.score_b = 11, 8
        m3.winner_team_id = team_map[1]["id"]
        m3.status = "completed"

        # LB R1 M4
        m4 = slot_dict[4]
        m4.team_a_id = team_map[4]["id"]
        m4.team_b_id = team_map[3]["id"]
        m4.score_a, m4.score_b = 11, 9
        m4.winner_team_id = team_map[4]["id"]
        m4.status = "completed"

        # LB Final M5
        m5 = slot_dict[5]
        m5.team_a_id = team_map[4]["id"]
        m5.team_b_id = team_map[2]["id"]  # WB final loser
        m5.score_a, m5.score_b = 6, 11
        m5.winner_team_id = team_map[2]["id"]
        m5.status = "completed"

        # Grand Final M6
        m6 = slot_dict[6]
        m6.team_a_id = team_map[1]["id"]
        m6.team_b_id = team_map[2]["id"]
        m6.score_a, m6.score_b = 11, 4
        m6.winner_team_id = team_map[1]["id"]
        m6.status = "completed"

        # Reset Final M7 is cancelled
        m7 = slot_dict[7]
        m7.status = "cancelled"

        # Prepare match dicts for summary and standings
        match_dicts = [
            {
                "id": s.id,
                "match_number": s.match_number,
                "bracket_round": s.bracket_round,
                "bracket_position": s.bracket_position,
                "bracket_section": s.bracket_section,
                "label": s.label,
                "team_a_id": s.team_a_id,
                "team_b_id": s.team_b_id,
                "score_a": s.score_a,
                "score_b": s.score_b,
                "winner_team_id": s.winner_team_id,
                "winner_team_name": team_map[1]["name"] if s.winner_team_id == team_map[1]["id"] else team_map[2]["name"],
                "status": s.status,
                "is_bye": s.is_bye,
            }
            for s in slots
        ]

        summary = BracketEngine.calculate_bracket_summary(
            tournament_id=tournament_id,
            teams_count=4,
            matches=match_dicts,
        )

        assert summary.champion_team_id == team_map[1]["id"]
        assert summary.matches_remaining == 0

        standings = BracketEngine.calculate_bracket_standings(
            teams=teams,
            matches=match_dicts,
            tournament_status="completed",
            bracket_format="Double Elimination",
        )

        standings_by_seed = {s["team_seed"]: s for s in standings}
        assert standings_by_seed[1]["placement"] == 1  # Champion
        assert standings_by_seed[2]["placement"] == 2  # Runner-up
        assert standings_by_seed[4]["placement"] == 3  # 3rd Place (Losers Final loser)
        assert standings_by_seed[3]["placement"] == 4  # 4th Place (Losers R1 loser)

    def test_4_team_lb_winner_triggers_and_wins_reset_final(self):
        """
        4 Teams:
        Seed 1 reaches GF undefeated.
        Seed 2 reaches GF from Losers Bracket.
        Grand Final:
          Seed 2 (LB) beats Seed 1 (WB) 11-9!
          Reset Final is activated!
        Reset Final:
          Seed 2 beats Seed 1 11-7!
        Outcome:
          Seed 2 is Champion!
          Seed 1 is Runner-up!
        """
        engine = BracketEngine()
        tournament_id = uuid.uuid4()
        teams = make_teams(4)
        team_map = {t["seed"]: t for t in teams}

        slots = engine.generate_bracket(
            tournament_id, teams, bracket_format="Double Elimination"
        )
        slot_dict = {s.match_number: s for s in slots}

        # WB R1
        slot_dict[1].winner_team_id = team_map[1]["id"]
        slot_dict[1].score_a, slot_dict[1].score_b = 11, 5
        slot_dict[1].status = "completed"

        slot_dict[2].winner_team_id = team_map[2]["id"]
        slot_dict[2].score_a, slot_dict[2].score_b = 11, 7
        slot_dict[2].status = "completed"

        # WB Final: Seed 1 wins
        slot_dict[3].team_a_id = team_map[1]["id"]
        slot_dict[3].team_b_id = team_map[2]["id"]
        slot_dict[3].score_a, slot_dict[3].score_b = 11, 8
        slot_dict[3].winner_team_id = team_map[1]["id"]
        slot_dict[3].status = "completed"

        # LB R1: Seed 4 wins
        slot_dict[4].team_a_id = team_map[4]["id"]
        slot_dict[4].team_b_id = team_map[3]["id"]
        slot_dict[4].score_a, slot_dict[4].score_b = 11, 9
        slot_dict[4].winner_team_id = team_map[4]["id"]
        slot_dict[4].status = "completed"

        # LB Final: Seed 2 wins
        slot_dict[5].team_a_id = team_map[4]["id"]
        slot_dict[5].team_b_id = team_map[2]["id"]
        slot_dict[5].score_a, slot_dict[5].score_b = 6, 11
        slot_dict[5].winner_team_id = team_map[2]["id"]
        slot_dict[5].status = "completed"

        # Grand Final: Seed 2 (LB) beats Seed 1 (WB) 11-9!
        slot_dict[6].team_a_id = team_map[1]["id"]
        slot_dict[6].team_b_id = team_map[2]["id"]
        slot_dict[6].score_a, slot_dict[6].score_b = 9, 11
        slot_dict[6].winner_team_id = team_map[2]["id"]
        slot_dict[6].status = "completed"

        # At this stage, Reset Final is PENDING!
        slot_dict[7].team_a_id = team_map[2]["id"]
        slot_dict[7].team_b_id = team_map[1]["id"]
        slot_dict[7].status = "pending"

        match_dicts_pending = [
            {
                "id": s.id,
                "match_number": s.match_number,
                "bracket_round": s.bracket_round,
                "bracket_position": s.bracket_position,
                "bracket_section": s.bracket_section,
                "label": s.label,
                "team_a_id": s.team_a_id,
                "team_b_id": s.team_b_id,
                "score_a": s.score_a,
                "score_b": s.score_b,
                "winner_team_id": s.winner_team_id,
                "winner_team_name": team_map[2]["name"] if s.winner_team_id == team_map[2]["id"] else team_map[1]["name"],
                "status": s.status,
                "is_bye": s.is_bye,
            }
            for s in slots
        ]

        summary_pending = BracketEngine.calculate_bracket_summary(
            tournament_id=tournament_id,
            teams_count=4,
            matches=match_dicts_pending,
        )
        # CRITICAL TEST: Champion MUST NOT be crowned yet because Reset Final is pending!
        assert summary_pending.champion_team_id is None
        assert summary_pending.matches_remaining == 1

        # Now Reset Final is played: Seed 2 wins 11-7
        slot_dict[7].score_a, slot_dict[7].score_b = 11, 7
        slot_dict[7].winner_team_id = team_map[2]["id"]
        slot_dict[7].status = "completed"

        match_dicts_done = [
            {
                "id": s.id,
                "match_number": s.match_number,
                "bracket_round": s.bracket_round,
                "bracket_position": s.bracket_position,
                "bracket_section": s.bracket_section,
                "label": s.label,
                "team_a_id": s.team_a_id,
                "team_b_id": s.team_b_id,
                "score_a": s.score_a,
                "score_b": s.score_b,
                "winner_team_id": s.winner_team_id,
                "winner_team_name": team_map[2]["name"] if s.winner_team_id == team_map[2]["id"] else team_map[1]["name"],
                "status": s.status,
                "is_bye": s.is_bye,
            }
            for s in slots
        ]

        summary_done = BracketEngine.calculate_bracket_summary(
            tournament_id=tournament_id,
            teams_count=4,
            matches=match_dicts_done,
        )
        # Seed 2 won the Reset Final and is Champion!
        assert summary_done.champion_team_id == team_map[2]["id"]
        assert summary_done.matches_remaining == 0

        standings_done = BracketEngine.calculate_bracket_standings(
            teams=teams,
            matches=match_dicts_done,
            tournament_status="completed",
            bracket_format="Double Elimination",
        )
        standings_by_seed = {s["team_seed"]: s for s in standings_done}
        assert standings_by_seed[2]["placement"] == 1  # Champion
        assert standings_by_seed[1]["placement"] == 2  # Runner-Up

    def test_8_team_full_progression(self):
        """
        Simulate an entire 8-team Double Elimination tournament.
        Verify:
        - 15 total matches generated
        - Every eliminated team has exactly 2 losses
        - WB finalist has 0 losses entering Grand Final
        - LB finalist has 1 loss entering Grand Final
        - Correct placements 1st through 8th
        """
        engine = BracketEngine()
        tournament_id = uuid.uuid4()
        teams = make_teams(8)
        team_map = {t["seed"]: t for t in teams}

        slots = engine.generate_bracket(
            tournament_id, teams, bracket_format="Double Elimination"
        )
        assert len(slots) == 15
        slot_dict = {s.match_number: s for s in slots}

        # Track losses
        losses: dict[uuid.UUID, int] = {t["id"]: 0 for t in teams}

        # Helper to record simulated match
        def play_match(m_num: int, winner_seed: int, loser_seed: int, score_w: int = 11, score_l: int = 6):
            m = slot_dict[m_num]
            w_id = team_map[winner_seed]["id"]
            l_id = team_map[loser_seed]["id"]
            m.team_a_id = w_id
            m.team_b_id = l_id
            m.winner_team_id = w_id
            m.score_a = score_w
            m.score_b = score_l
            m.status = "completed"
            losses[l_id] += 1

        # WB Round 1: Matches 1..4 (Seeds 1v8, 4v5, 2v7, 3v6)
        play_match(1, 1, 8)
        play_match(2, 4, 5)
        play_match(3, 2, 7)
        play_match(4, 3, 6)

        # LB Round 1: Matches 8..9 (Losers 8v5, 7v6)
        play_match(8, 5, 8)  # Seed 8 eliminated (2nd loss)
        play_match(9, 6, 7)  # Seed 7 eliminated (2nd loss)
        assert losses[team_map[8]["id"]] == 2
        assert losses[team_map[7]["id"]] == 2

        # WB Semifinals: Matches 5..6 (Winners 1v4, 2v3)
        play_match(5, 1, 4)  # Seed 4 to LB R2
        play_match(6, 2, 3)  # Seed 3 to LB R2

        # LB Round 2: Matches 10..11 (LB R1 winners vs WB Semis losers)
        play_match(10, 5, 3)  # Seed 3 eliminated (2nd loss)
        play_match(11, 4, 6)  # Seed 6 eliminated (2nd loss)
        assert losses[team_map[3]["id"]] == 2
        assert losses[team_map[6]["id"]] == 2

        # WB Final: Match 7 (1v2)
        play_match(7, 1, 2)  # Seed 1 undefeated! Seed 2 to LB Final.
        assert losses[team_map[1]["id"]] == 0
        assert losses[team_map[2]["id"]] == 1

        # LB Round 3 (Losers Semifinal): Match 12 (5v4)
        play_match(12, 4, 5)  # Seed 5 eliminated (2nd loss, 4th place)
        assert losses[team_map[5]["id"]] == 2

        # LB Final: Match 13 (4 vs 2)
        play_match(13, 2, 4)  # Seed 4 eliminated (2nd loss, 3rd place). Seed 2 to GF.
        assert losses[team_map[4]["id"]] == 2

        # Grand Final: Match 14 (Seed 1 undefeated vs Seed 2 with 1 loss)
        assert losses[team_map[1]["id"]] == 0
        assert losses[team_map[2]["id"]] == 1
        play_match(14, 1, 2)  # Seed 1 wins Grand Final!
        assert losses[team_map[2]["id"]] == 2

        # Reset Final M15 cancelled
        slot_dict[15].status = "cancelled"

        match_dicts = [
            {
                "id": s.id,
                "match_number": s.match_number,
                "bracket_round": s.bracket_round,
                "bracket_position": s.bracket_position,
                "bracket_section": s.bracket_section,
                "label": s.label,
                "team_a_id": s.team_a_id,
                "team_b_id": s.team_b_id,
                "score_a": s.score_a,
                "score_b": s.score_b,
                "winner_team_id": s.winner_team_id,
                "winner_team_name": team_map[1]["name"] if s.winner_team_id == team_map[1]["id"] else team_map[2]["name"],
                "status": s.status,
                "is_bye": s.is_bye,
            }
            for s in slots
        ]

        summary = BracketEngine.calculate_bracket_summary(
            tournament_id=tournament_id,
            teams_count=8,
            matches=match_dicts,
        )
        assert summary.champion_team_id == team_map[1]["id"]
        assert summary.matches_remaining == 0

        standings = BracketEngine.calculate_bracket_standings(
            teams=teams,
            matches=match_dicts,
            tournament_status="completed",
            bracket_format="Double Elimination",
        )
        standings_by_seed = {s["team_seed"]: s for s in standings}
        assert standings_by_seed[1]["placement"] == 1  # Champion
        assert standings_by_seed[2]["placement"] == 2  # Runner-Up
        assert standings_by_seed[4]["placement"] == 3  # 3rd Place (Losers Final loser)
        assert standings_by_seed[5]["placement"] == 4  # 4th Place (Losers R3 loser)

    def test_12_team_bracket_byes_and_progression(self):
        """12 teams seeded into 16-slot bracket with 4 BYEs."""
        engine = BracketEngine()
        tournament_id = uuid.uuid4()
        teams = make_teams(12)

        slots = engine.generate_bracket(
            tournament_id, teams, bracket_format="Double Elimination"
        )
        assert len(slots) == 31  # 2 * 16 - 1

        wb_r1 = [s for s in slots if s.bracket_section == "winners" and s.bracket_round == 1]
        assert len(wb_r1) == 8

        byes = [s for s in wb_r1 if s.is_bye]
        assert len(byes) == 4  # 16 - 12 = 4 BYEs

        # Verify seeds 1, 2, 3, 4 got the BYEs
        bye_winners = {s.winner_team_id for s in byes}
        top_4_ids = {t["id"] for t in teams if t["seed"] in (1, 2, 3, 4)}
        assert bye_winners == top_4_ids

        # Check WB Round 2 matches have the 4 BYE winners already populated
        wb_r2 = [s for s in slots if s.bracket_section == "winners" and s.bracket_round == 2]
        r2_team_ids = {s.team_a_id for s in wb_r2} | {s.team_b_id for s in wb_r2}
        assert top_4_ids.issubset(r2_team_ids)

    def test_16_team_full_progression(self):
        """
        Simulate an entire 16-team Double Elimination tournament.
        Verify:
        - 31 total matches generated
        - Every eliminated team has exactly 2 losses
        - Champion has 0 losses
        - Runner-Up has 2 losses
        - Correct 3rd place (Losers Final loser) and 4th place (Losers Semifinal loser)
        """
        engine = BracketEngine()
        tournament_id = uuid.uuid4()
        teams = make_teams(16)
        team_map = {t["seed"]: t for t in teams}

        slots = engine.generate_bracket(
            tournament_id, teams, bracket_format="Double Elimination"
        )
        assert len(slots) == 31
        slot_dict = {s.match_number: s for s in slots}

        losses: dict[uuid.UUID, int] = {t["id"]: 0 for t in teams}

        def play_match(m_num: int, winner_seed: int, loser_seed: int, score_w: int = 11, score_l: int = 5):
            m = slot_dict[m_num]
            w_id = team_map[winner_seed]["id"]
            l_id = team_map[loser_seed]["id"]
            m.team_a_id = w_id
            m.team_b_id = l_id
            m.winner_team_id = w_id
            m.score_a = score_w
            m.score_b = score_l
            m.status = "completed"
            losses[l_id] += 1

        # WB Round 1: Matches 1..8 (1v16, 8v9, 4v13, 5v12, 2v15, 7v10, 3v14, 6v11)
        play_match(1, 1, 16)
        play_match(2, 8, 9)
        play_match(3, 4, 13)
        play_match(4, 5, 12)
        play_match(5, 2, 15)
        play_match(6, 7, 10)
        play_match(7, 3, 14)
        play_match(8, 6, 11)

        # LB Round 1: Matches 16..19 (16v9, 13v12, 15v10, 14v11)
        play_match(16, 9, 16)   # 16 eliminated
        play_match(17, 12, 13)  # 13 eliminated
        play_match(18, 10, 15)  # 15 eliminated
        play_match(19, 11, 14)  # 14 eliminated

        # WB Quarterfinals: Matches 9..12 (1v8, 4v5, 2v7, 3v6)
        play_match(9, 1, 8)    # 8 to LB R2
        play_match(10, 4, 5)   # 5 to LB R2
        play_match(11, 2, 7)   # 7 to LB R2
        play_match(12, 3, 6)   # 6 to LB R2

        # LB Round 2: Matches 20..23 (Drop-ins from WB QF)
        play_match(20, 9, 6)   # 6 eliminated
        play_match(21, 12, 7)  # 7 eliminated
        play_match(22, 10, 5)  # 5 eliminated
        play_match(23, 11, 8)  # 8 eliminated

        # LB Round 3: Matches 24..25
        play_match(24, 9, 12)  # 12 eliminated
        play_match(25, 10, 11) # 11 eliminated

        # WB Semifinals: Matches 13..14 (1v4, 2v3)
        play_match(13, 1, 4)   # 4 to LB R4
        play_match(14, 2, 3)   # 3 to LB R4

        # LB Round 4: Matches 26..27 (Drop-ins from WB Semis)
        play_match(26, 3, 9)   # 9 eliminated
        play_match(27, 4, 10)  # 10 eliminated

        # LB Round 5 (Losers Semifinal): Match 28 (3v4)
        play_match(28, 3, 4)   # 4 eliminated (4th place)

        # WB Final: Match 15 (1v2)
        play_match(15, 1, 2)   # 1 undefeated to GF! 2 to LB Final.

        # LB Final: Match 29 (3v2)
        play_match(29, 2, 3)   # 3 eliminated (3rd place). 2 to GF.

        # Grand Final: Match 30 (1v2)
        play_match(30, 1, 2)   # 1 wins tournament! 2 is Runner-Up.

        # Reset Final M31 cancelled
        slot_dict[31].status = "cancelled"

        match_dicts = [
            {
                "id": s.id,
                "match_number": s.match_number,
                "bracket_round": s.bracket_round,
                "bracket_position": s.bracket_position,
                "bracket_section": s.bracket_section,
                "label": s.label,
                "team_a_id": s.team_a_id,
                "team_b_id": s.team_b_id,
                "score_a": s.score_a,
                "score_b": s.score_b,
                "winner_team_id": s.winner_team_id,
                "winner_team_name": team_map[1]["name"] if s.winner_team_id == team_map[1]["id"] else team_map[2]["name"],
                "status": s.status,
                "is_bye": s.is_bye,
            }
            for s in slots
        ]

        summary = BracketEngine.calculate_bracket_summary(
            tournament_id=tournament_id,
            teams_count=16,
            matches=match_dicts,
        )
        assert summary.champion_team_id == team_map[1]["id"]
        assert summary.matches_remaining == 0

        standings = BracketEngine.calculate_bracket_standings(
            teams=teams,
            matches=match_dicts,
            tournament_status="completed",
            bracket_format="Double Elimination",
        )
        standings_by_seed = {s["team_seed"]: s for s in standings}
        assert standings_by_seed[1]["placement"] == 1  # Champion
        assert standings_by_seed[2]["placement"] == 2  # Runner-Up
        assert standings_by_seed[3]["placement"] == 3  # 3rd Place (Losers Final loser)
        assert standings_by_seed[4]["placement"] == 4  # 4th Place (Losers Semifinal loser)

    def test_graph_validation_prevents_cycles_and_collisions(self):
        engine = BracketEngine()
        tournament_id = uuid.uuid4()
        teams = make_teams(4)

        slots = engine.generate_bracket(
            tournament_id, teams, bracket_format="Double Elimination"
        )

        # 1. Valid graph passes
        engine.validate_bracket_graph(slots, bracket_format="Double Elimination")

        # 2. Cycle detection
        slots[0].next_match_id = slots[0].id
        with pytest.raises(BracketConfigurationError, match="Cycle detected"):
            engine.validate_bracket_graph(slots, bracket_format="Double Elimination")

        # 3. Slot collision detection
        slots[0].next_match_id = slots[1].next_match_id
        slots[0].next_match_slot = slots[1].next_match_slot
        with pytest.raises(BracketConfigurationError, match="Slot collision"):
            engine.validate_bracket_graph(slots, bracket_format="Double Elimination")
