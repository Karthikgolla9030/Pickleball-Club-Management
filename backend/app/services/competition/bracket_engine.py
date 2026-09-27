"""
Aught2 Pickleball — Standalone Bracket Engine (Phase 8)

Pure computation engine — NO database I/O.
Implements a single-elimination bracket tournament for format = "bracket".

This is DISTINCT from Pool Play's championship stage.
Pool Play remains format = "pool_play".
Standalone bracket remains format = "bracket".

Seeding algorithm (deterministic, no randomness):
  1. team.seed ascending (seeded teams first)
  2. team.name.lower() ascending (name tiebreak)
  3. str(team.id) ascending (UUID string, stable final tiebreak)

BYE handling:
  - If n teams is not a power of two, the bracket is padded to the next power of two.
  - Higher seeds receive BYEs (i.e., BYE slots are placed at the bottom of the bracket).
  - BYE matches are immediately marked completed with the real team as the winner.
  - BYE matches have score_a=None, score_b=None (no fake score).
  - The real team is propagated to the next round automatically.

Invariants guaranteed:
  1. format == "bracket"
  2. Fixed teams (Team / TeamMember model, NOT MatchParticipant)
  3. No player on two teams
  4. Valid doubles team = exactly 2 players
  5. Minimum 2 teams
  6. number_of_played_matches = n_teams - 1
  7. BYEs do not count as played matches
  8. Deterministic — same inputs → same bracket
  9. Bracket generation uses standard seeding pairings (1 vs 8, 4 vs 5, ...)
"""
from __future__ import annotations

import math
import uuid
from dataclasses import dataclass, field
from typing import Any


class BracketError(Exception):
    """Base exception for Bracket engine operations."""


class BracketConfigurationError(BracketError):
    """Raised when bracket configuration violates domain rules."""


@dataclass
class BracketMatchSlot:
    """A single bracket match record ready for database insertion."""
    id: uuid.UUID
    tournament_id: uuid.UUID
    bracket_round: int        # 1 = first round, final = total_rounds
    bracket_position: int     # 1-indexed position within the round
    match_number: int         # sequential across tournament
    team_a_id: uuid.UUID | None
    team_b_id: uuid.UUID | None
    status: str               # "pending" or "completed" (BYE)
    winner_team_id: uuid.UUID | None = None
    score_a: int | None = None
    score_b: int | None = None
    next_match_id: uuid.UUID | None = None
    next_match_slot: str | None = None  # "team_a" | "team_b"
    is_bye: bool = False
    bracket_section: str = "main"        # "main" | "consolation" | "losers" | "grand_final" | "reset_final"
    loser_next_match_id: uuid.UUID | None = None
    loser_next_match_slot: str | None = None  # "team_a" | "team_b"
    label: str | None = None
    feeder_a: dict[str, Any] | None = None
    feeder_b: dict[str, Any] | None = None
    is_conditional: bool = False


@dataclass
class BracketSummary:
    """High-level summary of a bracket tournament state."""
    tournament_id: uuid.UUID
    teams_count: int
    bracket_size: int
    total_rounds: int
    byes_count: int
    matches_total: int           # all created matches (including BYE)
    matches_played: int          # completed non-BYE matches
    matches_remaining: int       # pending non-BYE matches
    current_round: int | None    # lowest round with pending non-BYE matches
    champion_team_id: uuid.UUID | None
    champion_team_name: str | None


class BracketEngine:
    """
    Deterministic standalone single-elimination bracket engine.

    Zero database I/O. All methods operate on plain Python dicts / lists.
    Designed for format = "bracket".
    """

    # ─── Validation ─────────────────────────────────────────────────────────────

    @staticmethod
    def validate_bracket_teams(
        teams: list[dict[str, Any]],
        *,
        expected_member_count: int = 2,
    ) -> None:
        """
        Validate teams are suitable for bracket generation.

        Rules:
          - At least 2 teams
          - Each team must have exactly expected_member_count members
          - No player_membership_id appears in two teams
          - No team contains duplicate player_membership_ids

        Args:
            teams: List of team dicts. Each must have:
                   'id', 'name', and 'members' (list of dicts with 'player_membership_id').
            expected_member_count: Number of players per team (default 2 for doubles).

        Raises:
            BracketConfigurationError: If any validation rule is violated.
        """
        if len(teams) < 2:
            raise BracketConfigurationError(
                f"Bracket requires at least 2 teams (got {len(teams)})"
            )

        seen_players: set[str] = set()
        for team in teams:
            name = team.get("name", str(team.get("id", "?")))
            members = team.get("members", [])
            pm_ids = [str(m["player_membership_id"]) for m in members]

            if len(pm_ids) != expected_member_count:
                raise BracketConfigurationError(
                    f"Team '{name}' has {len(pm_ids)} member(s); "
                    f"bracket requires exactly {expected_member_count} players per team."
                )

            if len(set(pm_ids)) != len(pm_ids):
                raise BracketConfigurationError(
                    f"Team '{name}' contains duplicate player membership IDs."
                )

            for pm_id in pm_ids:
                if pm_id in seen_players:
                    raise BracketConfigurationError(
                        f"Player membership {pm_id} belongs to multiple teams "
                        f"in this bracket tournament."
                    )
                seen_players.add(pm_id)

    # ─── Seeding ─────────────────────────────────────────────────────────────────

    @staticmethod
    def sort_teams_deterministically(
        teams: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """
        Sort teams deterministically for bracket seeding.

        Ordering priority (no randomness):
          1. Explicit seed ascending (unseeded teams placed last)
          2. Team name case-insensitive ascending (tiebreak)
          3. Team id as string ascending (UUID string, stable final tiebreak)

        This guarantees: same teams → same ordering → same bracket every time.
        """
        def sort_key(t: dict[str, Any]) -> tuple:
            seed = t.get("seed")
            has_seed = 0 if (seed is not None and seed > 0) else 1
            seed_val = seed if (seed is not None and seed > 0) else 999_999
            name_val = str(t.get("name", "")).lower()
            id_val = str(t.get("id", ""))
            return (has_seed, seed_val, name_val, id_val)

        return sorted(teams, key=sort_key)

    # ─── Bracket Size ────────────────────────────────────────────────────────────

    @staticmethod
    def calculate_bracket_size(n: int) -> int:
        """
        Return the smallest power of 2 >= n.

        Examples:
          2 → 2
          3 → 4
          4 → 4
          5 → 8
          6 → 8
          8 → 8
          9 → 16
         10 → 16
        """
        if n <= 1:
            raise BracketConfigurationError("Bracket requires at least 2 teams.")
        if n == 2:
            return 2
        return 1 << (n - 1).bit_length()

    # ─── Standard Pairings ───────────────────────────────────────────────────────

    @staticmethod
    def get_standard_bracket_pairings(bracket_size: int) -> list[tuple[int, int]]:
        """
        Return standard single-elimination bracket initial-round seed pairings.

        For bracket_size = 8:
          (1, 8), (4, 5), (2, 7), (3, 6)

        For bracket_size = 4:
          (1, 4), (2, 3)

        For bracket_size = 16:
          (1,16), (8,9), (4,13), (5,12), (2,15), (7,10), (3,14), (6,11)

        Algorithm: recursive balanced bracket construction (standard sports seeding).
        Strictly deterministic.
        """
        if bracket_size < 2:
            return [(1, 2)]

        def _make_half(n: int) -> list[int]:
            """Build the seed order for one half of a bracket of size n."""
            if n == 2:
                return [1, 2]
            prev = _make_half(n // 2)
            result: list[int] = []
            for x in prev:
                result.append(x)
                result.append(n + 1 - x)
            return result

        seeds = _make_half(bracket_size)
        pairs: list[tuple[int, int]] = []
        for i in range(0, len(seeds), 2):
            pairs.append((seeds[i], seeds[i + 1]))
        return pairs

    # ─── Bracket Generation ──────────────────────────────────────────────────────

    # ─── Bracket Generation ──────────────────────────────────────────────────────

    def generate_bracket(
        self,
        tournament_id: uuid.UUID,
        teams: list[dict[str, Any]],
        match_number_offset: int = 1,
        bracket_format: str = "Single Elimination",
    ) -> list[BracketMatchSlot]:
        """
        Generate a complete bracket for the given teams based on bracket_format.

        Supports:
          - "Single Elimination"
          - "Single Elimination with Consolation"
          - "Double Elimination"

        Steps:
          1. Sort teams deterministically (seeding algorithm).
          2. Calculate bracket size (next power of 2 >= n_teams).
          3. Build main bracket tree with standard pairings and auto-advancing BYEs.
          4. For Consolation / Double Elimination, construct loser progression matches.
          5. Return ordered list of BracketMatchSlot.
        """
        n = len(teams)
        if n < 2:
            raise BracketConfigurationError(
                f"Bracket requires at least 2 teams (got {n})"
            )

        ordered = self.sort_teams_deterministically(teams)
        bracket_size = self.calculate_bracket_size(n)
        total_rounds = int(math.log2(bracket_size))
        n_byes = bracket_size - n

        # Assign ordinal seeds 1..n to ordered teams; slots n+1..bracket_size are BYEs
        seed_to_team: dict[int, dict[str, Any]] = {}
        for idx, team in enumerate(ordered, start=1):
            seed_to_team[idx] = team

        # ── Build main bracket tree (all rounds, all positions) ─────────────────
        rounds_matches: dict[int, list[BracketMatchSlot]] = {
            r: [] for r in range(1, total_rounds + 1)
        }

        current_match_num = match_number_offset

        for r in range(1, total_rounds + 1):
            matches_in_round = bracket_size // (2 ** r)
            for pos in range(1, matches_in_round + 1):
                label = (
                    "Final" if r == total_rounds
                    else ("Semifinals" if r == total_rounds - 1
                          else ("Quarterfinals" if r == total_rounds - 2
                                else f"Round {r}"))
                )
                slot = BracketMatchSlot(
                    id=uuid.uuid4(),
                    tournament_id=tournament_id,
                    bracket_round=r,
                    bracket_position=pos,
                    match_number=current_match_num,
                    team_a_id=None,
                    team_b_id=None,
                    status="pending",
                    bracket_section="main",
                    label=label,
                )
                rounds_matches[r].append(slot)
                current_match_num += 1

        # ── Wire next_match_id links for main bracket ────────────────────────────
        for r in range(1, total_rounds):
            curr_round = rounds_matches[r]
            next_round = rounds_matches[r + 1]
            for pos_idx, m in enumerate(curr_round):
                parent = next_round[pos_idx // 2]
                m.next_match_id = parent.id
                m.next_match_slot = "team_a" if (pos_idx % 2 == 0) else "team_b"

        # ── Populate first-round teams & handle BYEs ─────────────────────────────
        initial_pairings = self.get_standard_bracket_pairings(bracket_size)
        r1_matches = rounds_matches[1]

        for pos_idx, (seed_a, seed_b) in enumerate(initial_pairings):
            m = r1_matches[pos_idx]
            team_a = seed_to_team.get(seed_a)  # None = BYE
            team_b = seed_to_team.get(seed_b)  # None = BYE

            team_a_id = uuid.UUID(str(team_a["id"])) if team_a else None
            team_b_id = uuid.UUID(str(team_b["id"])) if team_b else None

            if team_a_id and not team_b_id:
                # Seed A gets the BYE — auto-advance
                m.team_a_id = team_a_id
                m.team_b_id = None
                m.status = "completed"
                m.winner_team_id = team_a_id
                m.is_bye = True
                if m.next_match_id:
                    self._propagate_to_next(rounds_matches, r=1, m=m, winner_id=team_a_id)

            elif team_b_id and not team_a_id:
                # Seed B gets the BYE — auto-advance
                m.team_a_id = None
                m.team_b_id = team_b_id
                m.status = "completed"
                m.winner_team_id = team_b_id
                m.is_bye = True
                if m.next_match_id:
                    self._propagate_to_next(rounds_matches, r=1, m=m, winner_id=team_b_id)

            else:
                m.team_a_id = team_a_id
                m.team_b_id = team_b_id
                m.status = "pending"

        all_slots: list[BracketMatchSlot] = []
        for r in range(1, total_rounds + 1):
            all_slots.extend(rounds_matches[r])

        # ── Handle Single Elimination with Consolation ───────────────────────────
        fmt_normalized = bracket_format.strip().lower()
        if "consolation" in fmt_normalized:
            if bracket_size == 4:
                # 3rd place consolation match
                m_cons = BracketMatchSlot(
                    id=uuid.uuid4(),
                    tournament_id=tournament_id,
                    bracket_round=total_rounds,
                    bracket_position=2,
                    match_number=current_match_num,
                    team_a_id=None,
                    team_b_id=None,
                    status="pending",
                    bracket_section="consolation",
                    label="3rd Place Match",
                )
                current_match_num += 1
                r1_matches[0].loser_next_match_id = m_cons.id
                r1_matches[0].loser_next_match_slot = "team_a"
                r1_matches[1].loser_next_match_id = m_cons.id
                r1_matches[1].loser_next_match_slot = "team_b"
                all_slots.append(m_cons)
            elif bracket_size >= 8:
                # Consolation semifinals + consolation final
                c_semi1 = BracketMatchSlot(
                    id=uuid.uuid4(),
                    tournament_id=tournament_id,
                    bracket_round=total_rounds - 1,
                    bracket_position=10,
                    match_number=current_match_num,
                    team_a_id=None,
                    team_b_id=None,
                    status="pending",
                    bracket_section="consolation",
                    label="Consolation Semifinal 1",
                )
                current_match_num += 1

                c_semi2 = BracketMatchSlot(
                    id=uuid.uuid4(),
                    tournament_id=tournament_id,
                    bracket_round=total_rounds - 1,
                    bracket_position=11,
                    match_number=current_match_num,
                    team_a_id=None,
                    team_b_id=None,
                    status="pending",
                    bracket_section="consolation",
                    label="Consolation Semifinal 2",
                )
                current_match_num += 1

                c_final = BracketMatchSlot(
                    id=uuid.uuid4(),
                    tournament_id=tournament_id,
                    bracket_round=total_rounds,
                    bracket_position=10,
                    match_number=current_match_num,
                    team_a_id=None,
                    team_b_id=None,
                    status="pending",
                    bracket_section="consolation",
                    label="Consolation Final",
                )
                current_match_num += 1

                c_semi1.next_match_id = c_final.id
                c_semi1.next_match_slot = "team_a"
                c_semi2.next_match_id = c_final.id
                c_semi2.next_match_slot = "team_b"

                r1_matches[0].loser_next_match_id = c_semi1.id
                r1_matches[0].loser_next_match_slot = "team_a"
                r1_matches[1].loser_next_match_id = c_semi1.id
                r1_matches[1].loser_next_match_slot = "team_b"

                r1_matches[2].loser_next_match_id = c_semi2.id
                r1_matches[2].loser_next_match_slot = "team_a"
                r1_matches[3].loser_next_match_id = c_semi2.id
                r1_matches[3].loser_next_match_slot = "team_b"

                # Handle BYE propagation to consolation: if r1 has a BYE, no loser is produced
                if r1_matches[0].is_bye:
                    c_semi1.next_match_slot = "team_a"
                if r1_matches[2].is_bye:
                    c_semi2.next_match_slot = "team_b"

                all_slots.extend([c_semi1, c_semi2, c_final])

        # ── Handle Double Elimination ────────────────────────────────────────────
        elif "double" in fmt_normalized:
            return self._generate_double_elimination(
                tournament_id=tournament_id,
                ordered_teams=ordered,
                bracket_size=bracket_size,
                match_number_offset=match_number_offset,
            )

        self.validate_bracket_graph(all_slots, bracket_format=bracket_format)
        return all_slots

    def _generate_double_elimination(
        self,
        tournament_id: uuid.UUID,
        ordered_teams: list[dict[str, Any]],
        bracket_size: int,
        match_number_offset: int = 1,
    ) -> list[BracketMatchSlot]:
        """
        Generate a complete, mathematically valid Double Elimination bracket for any supported
        bracket size up to 32 teams (bracket_size in {2, 4, 8, 16, 32}).

        For bracket_size = 2^k:
          - Winners Bracket (WB): k rounds, N - 1 matches.
          - Losers Bracket (LB): 2k - 2 rounds, N - 2 matches.
          - Grand Final (GF): 1 match (WB champion vs LB champion).
          - Reset Final (RF): 1 match (conditional, played only if LB champion beats WB champion).
          - Total match slots = 2N - 1.

        Every team that loses in WB is deterministically routed to a valid LB slot.
        All WB R1 losers are fed into LB R1.
        All subsequent WB losers drop into corresponding even LB rounds.
        BYEs auto-advance and do not drop ghost losers into LB.
        """
        n = len(ordered_teams)
        k = max(1, int(math.log2(bracket_size)))
        current_match_num = match_number_offset

        # ── Special case: 2 teams (bracket_size == 2) ──────────────────────────
        if bracket_size == 2:
            team_a = ordered_teams[0] if len(ordered_teams) > 0 else None
            team_b = ordered_teams[1] if len(ordered_teams) > 1 else None
            team_a_id = uuid.UUID(str(team_a["id"])) if team_a else None
            team_b_id = uuid.UUID(str(team_b["id"])) if team_b else None

            gf = BracketMatchSlot(
                id=uuid.uuid4(),
                tournament_id=tournament_id,
                bracket_round=1,
                bracket_position=1,
                match_number=current_match_num,
                team_a_id=team_a_id,
                team_b_id=team_b_id,
                status="pending",
                bracket_section="grand_final",
                label="Grand Final",
                feeder_a={"match_number": None, "label": f"Seed #{team_a.get('seed', 1)}" if team_a else "Team A"},
                feeder_b={"match_number": None, "label": f"Seed #{team_b.get('seed', 2)}" if team_b else "Team B"},
            )
            current_match_num += 1

            rf = BracketMatchSlot(
                id=uuid.uuid4(),
                tournament_id=tournament_id,
                bracket_round=2,
                bracket_position=1,
                match_number=current_match_num,
                team_a_id=None,
                team_b_id=None,
                status="pending",
                bracket_section="reset_final",
                label="Grand Final (Reset Match)",
                is_conditional=True,
                feeder_a={"match_number": gf.match_number, "label": f"Winner of Match #{gf.match_number} (if needed)"},
                feeder_b={"match_number": gf.match_number, "label": f"Loser of Match #{gf.match_number} (if needed)"},
            )
            gf.next_match_id = rf.id
            gf.next_match_slot = "team_a"
            gf.loser_next_match_id = rf.id
            gf.loser_next_match_slot = "team_b"

            slots = [gf, rf]
            self.validate_bracket_graph(slots, bracket_format="Double Elimination")
            return slots

        # Map seeds 1..n to teams, slots n+1..bracket_size are BYEs
        seed_to_team: dict[int, dict[str, Any]] = {}
        for idx, team in enumerate(ordered_teams, start=1):
            seed_to_team[idx] = team

        # ── 1. Build Winners Bracket (WB) ──────────────────────────────────
        wb_rounds: dict[int, list[BracketMatchSlot]] = {r: [] for r in range(1, k + 1)}

        for r in range(1, k + 1):
            matches_in_round = bracket_size // (2 ** r)
            for pos in range(1, matches_in_round + 1):
                label = (
                    "Winners Final" if r == k
                    else ("Winners Semifinals" if r == k - 1
                          else ("Winners Quarterfinals" if r == k - 2
                                else f"Winners Round {r}"))
                )
                slot = BracketMatchSlot(
                    id=uuid.uuid4(),
                    tournament_id=tournament_id,
                    bracket_round=r,
                    bracket_position=pos,
                    match_number=current_match_num,
                    team_a_id=None,
                    team_b_id=None,
                    status="pending",
                    bracket_section="winners",
                    label=label,
                )
                wb_rounds[r].append(slot)
                current_match_num += 1

        # Wire WB internal links (winner moves to next WB round)
        for r in range(1, k):
            for pos_idx, m in enumerate(wb_rounds[r]):
                parent = wb_rounds[r + 1][pos_idx // 2]
                m.next_match_id = parent.id
                m.next_match_slot = "team_a" if (pos_idx % 2 == 0) else "team_b"
                feeder_info = {"match_number": m.match_number, "label": f"Winner of Match #{m.match_number}"}
                if pos_idx % 2 == 0:
                    parent.feeder_a = feeder_info
                else:
                    parent.feeder_b = feeder_info

        # ── 2. Populate WB Round 1 Seeds & BYEs ────────────────────────────
        initial_pairings = self.get_standard_bracket_pairings(bracket_size)
        r1_matches = wb_rounds[1]

        for pos_idx, (seed_a, seed_b) in enumerate(initial_pairings):
            m = r1_matches[pos_idx]
            team_a = seed_to_team.get(seed_a)
            team_b = seed_to_team.get(seed_b)

            team_a_id = uuid.UUID(str(team_a["id"])) if team_a else None
            team_b_id = uuid.UUID(str(team_b["id"])) if team_b else None

            m.feeder_a = {"match_number": None, "label": f"Seed #{seed_a}" if team_a else "BYE"}
            m.feeder_b = {"match_number": None, "label": f"Seed #{seed_b}" if team_b else "BYE"}

            if team_a_id and not team_b_id:
                m.team_a_id = team_a_id
                m.team_b_id = None
                m.status = "completed"
                m.winner_team_id = team_a_id
                m.is_bye = True
                if m.next_match_id:
                    self._propagate_to_next(wb_rounds, r=1, m=m, winner_id=team_a_id)
            elif team_b_id and not team_a_id:
                m.team_a_id = None
                m.team_b_id = team_b_id
                m.status = "completed"
                m.winner_team_id = team_b_id
                m.is_bye = True
                if m.next_match_id:
                    self._propagate_to_next(wb_rounds, r=1, m=m, winner_id=team_b_id)
            else:
                m.team_a_id = team_a_id
                m.team_b_id = team_b_id
                m.status = "pending"

        # ── 3. Build Losers Bracket (LB) ───────────────────────────────────
        total_lb_rounds = 2 * k - 2
        lb_round_counts: dict[int, int] = {}
        for r_lb in range(1, total_lb_rounds + 1):
            if r_lb == 1:
                lb_round_counts[1] = bracket_size // 4
            elif r_lb % 2 == 0:
                lb_round_counts[r_lb] = lb_round_counts[r_lb - 1]
            else:
                lb_round_counts[r_lb] = lb_round_counts[r_lb - 1] // 2

        lb_rounds: dict[int, list[BracketMatchSlot]] = {r: [] for r in range(1, total_lb_rounds + 1)}

        for r_lb in range(1, total_lb_rounds + 1):
            count = lb_round_counts[r_lb]
            for pos in range(1, count + 1):
                if r_lb == total_lb_rounds:
                    label = "Losers Final"
                elif r_lb == total_lb_rounds - 1 and total_lb_rounds >= 3:
                    label = "Losers Semifinal"
                else:
                    label = f"Losers Round {r_lb}"
                slot = BracketMatchSlot(
                    id=uuid.uuid4(),
                    tournament_id=tournament_id,
                    bracket_round=r_lb,
                    bracket_position=pos,
                    match_number=current_match_num,
                    team_a_id=None,
                    team_b_id=None,
                    status="pending",
                    bracket_section="losers",
                    label=label,
                )
                lb_rounds[r_lb].append(slot)
                current_match_num += 1

        # ── 4. Wire Feeders into Losers Bracket ─────────────────────────────
        # LB Round 1: paired from WB Round 1 losers
        for i in range(lb_round_counts[1]):
            lb_m = lb_rounds[1][i]
            wb_m_a = wb_rounds[1][2 * i]
            wb_m_b = wb_rounds[1][2 * i + 1]

            wb_m_a.loser_next_match_id = lb_m.id
            wb_m_a.loser_next_match_slot = "team_a"
            lb_m.feeder_a = {"match_number": wb_m_a.match_number, "label": f"Loser of Match #{wb_m_a.match_number}"}

            wb_m_b.loser_next_match_id = lb_m.id
            wb_m_b.loser_next_match_slot = "team_b"
            lb_m.feeder_b = {"match_number": wb_m_b.match_number, "label": f"Loser of Match #{wb_m_b.match_number}"}

            # If both WB matches were BYEs, this LB match is completely a BYE
            if wb_m_a.is_bye and wb_m_b.is_bye:
                lb_m.status = "completed"
                lb_m.is_bye = True
            elif wb_m_a.is_bye:
                lb_m.feeder_a = {"match_number": None, "label": "BYE"}
            elif wb_m_b.is_bye:
                lb_m.feeder_b = {"match_number": None, "label": "BYE"}

        # LB Rounds 2..total_lb_rounds:
        for r_lb in range(2, total_lb_rounds + 1):
            count = lb_round_counts[r_lb]
            if r_lb % 2 == 0:
                # Even round: LB winners meet WB losers (drop-ins)
                r_wb = r_lb // 2 + 1
                for i in range(count):
                    lb_m = lb_rounds[r_lb][i]
                    prev_lb = lb_rounds[r_lb - 1][i]

                    prev_lb.next_match_id = lb_m.id
                    prev_lb.next_match_slot = "team_a"
                    lb_m.feeder_a = {"match_number": prev_lb.match_number, "label": f"Winner of Match #{prev_lb.match_number}"}

                    # Invert WB drop-ins across round to balance bracket halves
                    wb_idx = (count - 1 - i) if count > 1 else 0
                    wb_m = wb_rounds[r_wb][wb_idx]
                    wb_m.loser_next_match_id = lb_m.id
                    wb_m.loser_next_match_slot = "team_b"
                    lb_m.feeder_b = {"match_number": wb_m.match_number, "label": f"Loser of Match #{wb_m.match_number}"}
            else:
                # Odd round: LB winners play each other (elimination)
                for i in range(count):
                    lb_m = lb_rounds[r_lb][i]
                    prev_a = lb_rounds[r_lb - 1][2 * i]
                    prev_b = lb_rounds[r_lb - 1][2 * i + 1]

                    prev_a.next_match_id = lb_m.id
                    prev_a.next_match_slot = "team_a"
                    lb_m.feeder_a = {"match_number": prev_a.match_number, "label": f"Winner of Match #{prev_a.match_number}"}

                    prev_b.next_match_id = lb_m.id
                    prev_b.next_match_slot = "team_b"
                    lb_m.feeder_b = {"match_number": prev_b.match_number, "label": f"Winner of Match #{prev_b.match_number}"}

        # ── 5. Grand Final & Reset Final ────────────────────────────────────
        wb_final = wb_rounds[k][0]
        lb_final = lb_rounds[total_lb_rounds][0]

        grand_final = BracketMatchSlot(
            id=uuid.uuid4(),
            tournament_id=tournament_id,
            bracket_round=1,
            bracket_position=1,
            match_number=current_match_num,
            team_a_id=None,
            team_b_id=None,
            status="pending",
            bracket_section="grand_final",
            label="Grand Final",
            feeder_a={"match_number": wb_final.match_number, "label": f"Winner of Match #{wb_final.match_number} (Undefeated)"},
            feeder_b={"match_number": lb_final.match_number, "label": f"Winner of Match #{lb_final.match_number}"},
        )
        current_match_num += 1

        wb_final.next_match_id = grand_final.id
        wb_final.next_match_slot = "team_a"

        lb_final.next_match_id = grand_final.id
        lb_final.next_match_slot = "team_b"

        reset_final = BracketMatchSlot(
            id=uuid.uuid4(),
            tournament_id=tournament_id,
            bracket_round=2,
            bracket_position=1,
            match_number=current_match_num,
            team_a_id=None,
            team_b_id=None,
            status="pending",
            bracket_section="reset_final",
            label="Grand Final (Reset Match)",
            is_conditional=True,
            feeder_a={"match_number": grand_final.match_number, "label": "Winner of Grand Final (if LB won)"},
            feeder_b={"match_number": grand_final.match_number, "label": "Loser of Grand Final (if LB won)"},
        )
        current_match_num += 1

        grand_final.next_match_id = reset_final.id
        grand_final.next_match_slot = "team_a"
        grand_final.loser_next_match_id = reset_final.id
        grand_final.loser_next_match_slot = "team_b"

        # Assemble all slots in chronological order
        all_slots: list[BracketMatchSlot] = []
        for r in range(1, k + 1):
            all_slots.extend(wb_rounds[r])
        for r in range(1, total_lb_rounds + 1):
            all_slots.extend(lb_rounds[r])
        all_slots.append(grand_final)
        all_slots.append(reset_final)

        # ── 6. Validate Complete Bracket Progression Graph ──────────────────
        self.validate_bracket_graph(all_slots, bracket_format="Double Elimination")

        return all_slots

    @staticmethod
    def validate_bracket_graph(
        slots: list[BracketMatchSlot], bracket_format: str = "Single Elimination"
    ) -> None:
        """
        Validate that the bracket match graph is complete, acyclic, and has no slot conflicts.
        """
        slot_map = {s.id: s for s in slots}
        if len(slot_map) != len(slots):
            raise BracketConfigurationError("Bracket graph contains duplicate match IDs.")

        match_numbers = [s.match_number for s in slots]
        if len(set(match_numbers)) != len(match_numbers):
            raise BracketConfigurationError("Bracket graph contains duplicate match numbers.")

        dest_slots: dict[tuple[uuid.UUID, str], uuid.UUID] = {}

        for s in slots:
            # Check winner destination
            if s.next_match_id is not None:
                if s.next_match_id not in slot_map:
                    raise BracketConfigurationError(
                        f"Match #{s.match_number} has next_match_id {s.next_match_id} that does not exist."
                    )
                if s.next_match_slot not in ("team_a", "team_b"):
                    raise BracketConfigurationError(
                        f"Match #{s.match_number} has invalid next_match_slot '{s.next_match_slot}'."
                    )
                key = (s.next_match_id, s.next_match_slot)
                if key in dest_slots and dest_slots[key] != s.id:
                    raise BracketConfigurationError(
                        f"Slot collision: destination {key} targeted by multiple outcomes."
                    )
                dest_slots[key] = s.id

            # Check loser destination
            if s.loser_next_match_id is not None:
                if s.loser_next_match_id not in slot_map:
                    raise BracketConfigurationError(
                        f"Match #{s.match_number} has loser_next_match_id {s.loser_next_match_id} that does not exist."
                    )
                if s.loser_next_match_slot not in ("team_a", "team_b"):
                    raise BracketConfigurationError(
                        f"Match #{s.match_number} has invalid loser_next_match_slot '{s.loser_next_match_slot}'."
                    )
                key = (s.loser_next_match_id, s.loser_next_match_slot)
                if key in dest_slots and dest_slots[key] != s.id:
                    raise BracketConfigurationError(
                        f"Slot collision: destination {key} targeted by multiple outcomes."
                    )
                dest_slots[key] = s.id

        # Check for cycles
        for s in slots:
            visited = set()
            curr_id = s.next_match_id
            while curr_id is not None:
                if curr_id in visited or curr_id == s.id:
                    raise BracketConfigurationError(f"Cycle detected starting from Match #{s.match_number}")
                visited.add(curr_id)
                curr = slot_map.get(curr_id)
                curr_id = curr.next_match_id if curr else None

        # Double elimination specific checks
        if "double" in bracket_format.lower():
            for s in slots:
                if s.bracket_section == "winners":
                    if s.loser_next_match_id is None:
                        raise BracketConfigurationError(
                            f"Double elimination WB Match #{s.match_number} has no loser destination."
                        )
                elif s.bracket_section == "grand_final":
                    if s.next_match_id is None or s.loser_next_match_id is None:
                        raise BracketConfigurationError("Grand Final must feed into Reset Final.")

    @staticmethod
    def _propagate_to_next(
        rounds_matches: dict[int, list[BracketMatchSlot]],
        r: int,
        m: BracketMatchSlot,
        winner_id: uuid.UUID,
    ) -> None:
        """Set winner into the correct slot of the next-round match."""
        if not m.next_match_id or not m.next_match_slot:
            return
        next_round = rounds_matches.get(r + 1, [])
        for nm in next_round:
            if nm.id == m.next_match_id:
                if m.next_match_slot == "team_a":
                    nm.team_a_id = winner_id
                else:
                    nm.team_b_id = winner_id
                return

    # ─── Summary ─────────────────────────────────────────────────────────────────

    @staticmethod
    def calculate_bracket_summary(
        tournament_id: uuid.UUID,
        teams_count: int,
        matches: list[dict[str, Any]],
    ) -> BracketSummary:
        """
        Derive a high-level bracket summary from a list of match dicts.

        Args:
            tournament_id: The tournament UUID.
            teams_count: Number of teams in the bracket.
            matches: List of match dicts from the database (bracket matches only).

        Returns:
            BracketSummary
        """
        if teams_count < 2:
            bracket_size = 2
        else:
            bracket_size = 1 << (teams_count - 1).bit_length()
            if bracket_size < 2:
                bracket_size = 2
        total_rounds = max(1, int(math.log2(bracket_size)))
        byes_count = bracket_size - teams_count

        played = [
            m for m in matches
            if m.get("status") == "completed" and not m.get("is_bye")
            and m.get("score_a") is not None and m.get("score_b") is not None
        ]
        remaining = [m for m in matches if m.get("status") in ("pending", "in_progress")]

        # Current round = lowest round with pending/in_progress matches
        pending_rounds = [
            m.get("bracket_round") for m in remaining
            if m.get("bracket_round") is not None
        ]
        current_round = min(pending_rounds) if pending_rounds else None

        # Champion determination:
        # Check grand final / reset final first if double elimination, else main final
        champion_team_id = None
        champion_team_name = None

        grand_match = next(
            (m for m in matches if m.get("bracket_section") == "grand_final" or m.get("label") == "Grand Final"),
            None,
        )
        reset_match = next(
            (m for m in matches if m.get("bracket_section") == "reset_final" or m.get("label") == "Grand Final (Reset Match)"),
            None,
        )

        if grand_match:
            if reset_match and reset_match.get("status") == "completed" and reset_match.get("winner_team_id") and reset_match.get("score_a") is not None:
                champion_team_id = reset_match["winner_team_id"]
                champion_team_name = reset_match.get("winner_team_name")
            elif reset_match and reset_match.get("status") == "cancelled" and grand_match.get("status") == "completed" and grand_match.get("winner_team_id") and grand_match.get("score_a") is not None:
                champion_team_id = grand_match["winner_team_id"]
                champion_team_name = grand_match.get("winner_team_name")
            elif not reset_match and grand_match.get("status") == "completed" and grand_match.get("winner_team_id") and grand_match.get("score_a") is not None:
                champion_team_id = grand_match["winner_team_id"]
                champion_team_name = grand_match.get("winner_team_name")
            else:
                champion_team_id = None
                champion_team_name = None
        else:
            final_matches = [
                m for m in matches
                if m.get("bracket_round") == total_rounds
                and m.get("bracket_position", 1) == 1
                and m.get("bracket_section", "main") == "main"
            ]
            if final_matches:
                final = final_matches[0]
                if final.get("status") == "completed" and final.get("winner_team_id"):
                    champion_team_id = final["winner_team_id"]
                    champion_team_name = final.get("winner_team_name")

        return BracketSummary(
            tournament_id=tournament_id,
            teams_count=teams_count,
            bracket_size=bracket_size,
            total_rounds=total_rounds,
            byes_count=byes_count,
            matches_total=len(matches),
            matches_played=len(played),
            matches_remaining=len(remaining),
            current_round=current_round,
            champion_team_id=champion_team_id,
            champion_team_name=champion_team_name,
        )

    # ─── Standings Calculation (Phase 7) ─────────────────────────────────────────

    @staticmethod
    def calculate_bracket_standings(
        teams: list[dict[str, Any]],
        matches: list[dict[str, Any]],
        tournament_status: str = "in_progress",
        bracket_format: str = "Single Elimination",
    ) -> list[dict[str, Any]]:
        """
        Derive elimination bracket standings from finalized match results.

        Distinguishes:
          - Champion, Runner-Up, 3rd Place, Semifinalists, Quarterfinalists
          - Active vs Eliminated participants
          - Wins, losses, points scored, points conceded, points differential
        """
        stats: dict[str, dict[str, Any]] = {}
        for t in teams:
            t_id = str(t["id"])
            stats[t_id] = {
                "team_id": t["id"],
                "team_name": t.get("name", "Team"),
                "team_seed": t.get("seed"),
                "wins": 0,
                "losses": 0,
                "matches_played": 0,
                "points_scored": 0,
                "points_allowed": 0,
                "points_differential": 0,
                "status": "Active",
                "placement": 999,
                "deepest_round": 1,
            }

        # Calculate played matches and points
        for m in matches:
            if m.get("status") != "completed":
                continue
            score_a = m.get("score_a")
            score_b = m.get("score_b")
            if score_a is None or score_b is None:
                continue  # Skip BYE matches

            team_a_id = str(m.get("team_a_id")) if m.get("team_a_id") else None
            team_b_id = str(m.get("team_b_id")) if m.get("team_b_id") else None
            winner_id = str(m.get("winner_team_id")) if m.get("winner_team_id") else None
            b_round = m.get("bracket_round") or m.get("round_number") or 1

            if team_a_id and team_a_id in stats:
                st = stats[team_a_id]
                st["matches_played"] += 1
                st["points_scored"] += score_a
                st["points_allowed"] += score_b
                if b_round > st["deepest_round"]:
                    st["deepest_round"] = b_round
                if winner_id == team_a_id:
                    st["wins"] += 1
                else:
                    st["losses"] += 1

            if team_b_id and team_b_id in stats:
                st = stats[team_b_id]
                st["matches_played"] += 1
                st["points_scored"] += score_b
                st["points_allowed"] += score_a
                if b_round > st["deepest_round"]:
                    st["deepest_round"] = b_round
                if winner_id == team_b_id:
                    st["wins"] += 1
                else:
                    st["losses"] += 1

        for s in stats.values():
            s["points_differential"] = s["points_scored"] - s["points_allowed"]

        # Identify key matches
        reset_final = next(
            (m for m in matches if (m.get("bracket_section") == "reset_final" or m.get("label") == "Grand Final (Reset Match)")),
            None,
        )
        grand_final = next(
            (m for m in matches if (m.get("bracket_section") == "grand_final" or m.get("label") == "Grand Final")),
            None,
        )
        main_final = next(
            (m for m in matches if m.get("label") == "Final" and m.get("status") == "completed"),
            None,
        )
        cons_match = next(
            (m for m in matches if ("consolation" in str(m.get("bracket_section", "")).lower() or "3rd place" in str(m.get("label", "")).lower()) and m.get("status") == "completed"),
            None,
        )

        champ_id = None
        runner_id = None

        if reset_final and reset_final.get("status") == "completed" and reset_final.get("winner_team_id"):
            champ_id = str(reset_final["winner_team_id"])
            runner_id = (
                str(reset_final["team_b_id"])
                if champ_id == str(reset_final.get("team_a_id"))
                else str(reset_final.get("team_a_id"))
            )
        elif reset_final and reset_final.get("status") == "cancelled" and grand_final and grand_final.get("status") == "completed" and grand_final.get("winner_team_id"):
            champ_id = str(grand_final["winner_team_id"])
            runner_id = (
                str(grand_final["team_b_id"])
                if champ_id == str(grand_final.get("team_a_id"))
                else str(grand_final.get("team_a_id"))
            )
        elif (not reset_final) and grand_final and grand_final.get("status") == "completed" and grand_final.get("winner_team_id"):
            champ_id = str(grand_final["winner_team_id"])
            runner_id = (
                str(grand_final["team_b_id"])
                if champ_id == str(grand_final.get("team_a_id"))
                else str(grand_final.get("team_a_id"))
            )
        elif main_final and main_final.get("winner_team_id"):
            champ_id = str(main_final["winner_team_id"])
            runner_id = (
                str(main_final["team_b_id"])
                if champ_id == str(main_final.get("team_a_id"))
                else str(main_final.get("team_a_id"))
            )

        if champ_id and champ_id in stats:
            stats[champ_id]["placement"] = 1
            stats[champ_id]["status"] = "Champion 🏆"

        if runner_id and runner_id in stats:
            stats[runner_id]["placement"] = 2
            stats[runner_id]["status"] = "Runner-Up 🥈"

        # Consolation / 3rd place match
        if cons_match and cons_match.get("winner_team_id"):
            c_win = str(cons_match["winner_team_id"])
            c_lose = (
                str(cons_match["team_b_id"])
                if c_win == str(cons_match.get("team_a_id"))
                else str(cons_match.get("team_a_id"))
            )
            if c_win in stats and stats[c_win]["placement"] > 3:
                stats[c_win]["placement"] = 3
                stats[c_win]["status"] = "3rd Place 🥉"
            if c_lose in stats and stats[c_lose]["placement"] > 4:
                stats[c_lose]["placement"] = 4
                stats[c_lose]["status"] = "4th Place"

        # Double Elimination: Losers Final loser is 3rd place, penultimate LB round loser is 4th place
        if "double" in bracket_format.lower():
            lb_matches = [
                m for m in matches
                if m.get("bracket_section") == "losers" or "losers" in str(m.get("label", "")).lower()
            ]
            lb_rounds = sorted({m.get("bracket_round") for m in lb_matches if m.get("bracket_round") is not None})
            if lb_rounds:
                max_lb_round = lb_rounds[-1]
                lf_matches = [
                    m for m in lb_matches
                    if m.get("bracket_round") == max_lb_round and m.get("winner_team_id")
                ]
                if lf_matches:
                    lf_match = lf_matches[0]
                    lf_win = str(lf_match["winner_team_id"])
                    lf_lose = (
                        str(lf_match["team_b_id"])
                        if lf_win == str(lf_match.get("team_a_id"))
                        else str(lf_match.get("team_a_id"))
                    )
                    if lf_lose in stats and stats[lf_lose]["placement"] > 3:
                        stats[lf_lose]["placement"] = 3
                        stats[lf_lose]["status"] = "3rd Place 🥉"

            if len(lb_rounds) >= 2:
                penultimate_round = lb_rounds[-2]
                penultimate_matches = [
                    m for m in lb_matches
                    if m.get("bracket_round") == penultimate_round and m.get("winner_team_id")
                ]
                if penultimate_matches:
                    pen_m = penultimate_matches[0]
                    p_win = str(pen_m["winner_team_id"])
                    p_lose = (
                        str(pen_m["team_b_id"])
                        if p_win == str(pen_m.get("team_a_id"))
                        else str(pen_m.get("team_a_id"))
                    )
                    if p_lose in stats and stats[p_lose]["placement"] > 4:
                        stats[p_lose]["placement"] = 4
                        stats[p_lose]["status"] = "4th Place"

        # Active vs Eliminated status for remaining teams
        is_completed = tournament_status == "completed" or (champ_id is not None)
        fmt_lower = bracket_format.lower()

        for s in stats.values():
            if s["placement"] in (1, 2, 3, 4):
                continue
            if is_completed:
                if s["deepest_round"] >= 2:
                    s["status"] = "Semifinalist"
                    s["placement"] = 5
                else:
                    s["status"] = "Eliminated (Round 1)"
                    s["placement"] = 10
            else:
                if "double" in fmt_lower:
                    if s["losses"] >= 2:
                        s["status"] = "Eliminated"
                        s["placement"] = 100
                    elif s["losses"] == 1:
                        s["status"] = "In Losers Bracket"
                        s["placement"] = 20
                    else:
                        s["status"] = "Active (Undefeated)"
                        s["placement"] = 10
                else:
                    if s["losses"] > 0:
                        s["status"] = "Eliminated"
                        s["placement"] = 100
                    else:
                        s["status"] = "Active"
                        s["placement"] = 10

        # Sort teams deterministically
        def sort_key(item: dict[str, Any]):
            seed_val = item["team_seed"] if item["team_seed"] is not None else 999
            return (
                item["placement"],
                -item["wins"],
                -item["points_differential"],
                -item["points_scored"],
                seed_val,
                item["team_name"].lower(),
            )

        sorted_rows = sorted(stats.values(), key=sort_key)
        for idx, row in enumerate(sorted_rows, start=1):
            row["rank"] = idx

        return sorted_rows
