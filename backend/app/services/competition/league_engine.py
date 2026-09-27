"""
Aught2 Pickleball — League Competition Engine (Phase 9)

Pure computation engine — NO database I/O.
Encapsulates:
  - League configuration validation
  - Deterministic weekly round-robin schedule generation (Circle/Polygon rotation)
  - BYE handling for odd team counts (no fake matches stored)
  - Cumulative standings calculation with strict tiebreaker hierarchy:
      1. Wins (descending)
      2. Points Differential (descending)
      3. Total Points Scored (descending)
      4. Team Name (ascending, case-insensitive)
      5. Team ID (ascending, deterministic final fallback)
  - Playoff qualification & deterministic seeding from final regular-season standings
  - Playoff bracket generation via BracketEngine reuse
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

from app.services.competition.bracket_engine import BracketEngine, BracketMatchSlot


class LeagueError(Exception):
    """Base exception for League engine operations."""


class LeagueConfigurationError(LeagueError):
    """Raised when league configuration violates domain rules."""


@dataclass
class LeagueMatchSlot:
    """A scheduled regular season match between two league teams."""
    team_a_id: uuid.UUID
    team_b_id: uuid.UUID
    week_number: int
    match_number: int


@dataclass
class LeagueStandingRow:
    """
    One team's standing entry derived from completed regular-season match results.

    Tiebreaker order (strict — never modify):
      1. Wins (descending)
      2. Points Differential (descending)
      3. Total Points Scored (descending)
      4. Team Name (ascending, case-insensitive)
      5. Team ID (ascending string, deterministic fallback)
    """
    team_id: uuid.UUID
    team_name: str
    team_seed: int | None = None
    wins: int = 0
    losses: int = 0
    matches_played: int = 0
    points_scored: int = 0
    points_allowed: int = 0
    points_differential: int = 0
    rank: int = 0

    @property
    def sort_key(self) -> tuple:
        """Lower value sorts first (better rank)."""
        return (
            -self.wins,
            -self.points_differential,
            -self.points_scored,
            self.team_name.lower(),
            str(self.team_id),
        )


class LeagueEngine:
    """
    Stateless, deterministic competition engine for Leagues.
    Zero database dependencies.
    """

    def __init__(self) -> None:
        self.bracket_engine = BracketEngine()

    # ─── Configuration Validation ─────────────────────────────────────────────

    @staticmethod
    def validate_league_config(
        number_of_weeks: int,
        playoff_team_count: int,
        num_teams: int,
    ) -> None:
        """
        Validate league duration, team count, and playoff configuration.

        Business rules:
          - number_of_weeks >= 2 (Weeks 1..N-1 Regular Season, Week N Playoffs)
          - num_teams >= 2
          - 2 <= playoff_team_count <= num_teams
        """
        if number_of_weeks < 2:
            raise LeagueConfigurationError(
                f"League duration must be at least 2 weeks (got {number_of_weeks}). "
                "Weeks 1 through N-1 are regular season, Week N is playoffs."
            )

        if num_teams < 2:
            raise LeagueConfigurationError(
                f"A league requires at least 2 teams (got {num_teams})."
            )

        if playoff_team_count < 2:
            raise LeagueConfigurationError(
                f"Playoff team count must be at least 2 (got {playoff_team_count})."
            )

        if playoff_team_count > num_teams:
            raise LeagueConfigurationError(
                f"Playoff team count ({playoff_team_count}) cannot exceed "
                f"the number of registered league teams ({num_teams})."
            )

    @staticmethod
    def sort_teams_deterministically(teams: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """
        Sort teams deterministically:
          1. Seed (ascending, unseeded None last)
          2. Name (ascending, case-insensitive)
          3. ID (ascending string)
        """
        return sorted(
            teams,
            key=lambda t: (
                t.get("seed") is None,
                t.get("seed") or 0,
                t.get("name", "").lower(),
                str(t.get("id", "")),
            ),
        )

    # ─── Regular Season Scheduling ────────────────────────────────────────────

    def generate_regular_season_schedule(
        self,
        teams: list[dict[str, Any]],
        num_regular_weeks: int,
    ) -> list[LeagueMatchSlot]:
        """
        Generate deterministic weekly pairings for regular season weeks.

        Uses the standard Circle/Polygon rotation method:
          - If N is odd: adds a virtual BYE slot (None).
          - A team paired with BYE in a given week gets a BYE.
            No fake match record is created (matches against NULL are excluded).
          - For M slots (even):
              1 complete round-robin cycle = M - 1 rounds.
              Each round has M // 2 simultaneous pairings.
          - If num_regular_weeks > M - 1:
              Rounds cycle deterministically: round_index = (week - 1) % (M - 1).
          - Each week, every team plays at most once.
          - No duplicate matchups within a single cycle.

        Args:
            teams: List of team dicts (must contain 'id').
            num_regular_weeks: Number of regular season weeks (N_weeks - 1).

        Returns:
            list[LeagueMatchSlot] sorted by (week_number, match_number).
        """
        if len(teams) < 2:
            raise LeagueConfigurationError("At least 2 teams required to schedule regular season.")
        if num_regular_weeks < 1:
            raise LeagueConfigurationError("Must have at least 1 regular season week.")

        sorted_teams = self.sort_teams_deterministically(teams)
        team_ids: list[uuid.UUID | None] = [t["id"] for t in sorted_teams]

        # If odd number of teams, add virtual BYE slot
        if len(team_ids) % 2 != 0:
            team_ids.append(None)

        m = len(team_ids)
        rounds_in_cycle = m - 1
        matches_per_round = m // 2

        # Fixed pivot: team_ids[0]
        # Rotating list: team_ids[1:]
        pivot = team_ids[0]
        rotating = list(team_ids[1:])
        k = len(rotating)  # m - 1

        slots: list[LeagueMatchSlot] = []
        global_match_number = 1

        for week_num in range(1, num_regular_weeks + 1):
            cycle_round = (week_num - 1) % rounds_in_cycle

            # Rotate elements: shift by cycle_round
            current_rotating = rotating[cycle_round:] + rotating[:cycle_round]
            current_round_teams = [pivot] + current_rotating

            for i in range(matches_per_round):
                t_a = current_round_teams[i]
                t_b = current_round_teams[m - 1 - i]

                # If either team is None (BYE slot), do NOT create a match record
                if t_a is None or t_b is None:
                    continue

                # Ensure deterministic team_a / team_b ordering:
                # Place lower UUID string first for consistency
                if str(t_a) > str(t_b):
                    t_a, t_b = t_b, t_a

                slots.append(
                    LeagueMatchSlot(
                        team_a_id=t_a,
                        team_b_id=t_b,
                        week_number=week_num,
                        match_number=global_match_number,
                    )
                )
                global_match_number += 1

        return slots

    # ─── Cumulative Standings ─────────────────────────────────────────────────

    def calculate_standings(
        self,
        teams: list[dict[str, Any]],
        completed_matches: list[dict[str, Any]],
    ) -> list[LeagueStandingRow]:
        """
        Calculate cumulative standings from regular season match results.

        Derived exclusively from match records.
        Only completed matches with score_a and score_b count towards standings.

        Tiebreaker hierarchy:
          1. Wins (descending)
          2. Points Differential (descending)
          3. Points Scored (descending)
          4. Team Name (ascending, case-insensitive)
          5. Team ID (ascending string)
        """
        rows: dict[uuid.UUID, LeagueStandingRow] = {
            t["id"]: LeagueStandingRow(
                team_id=t["id"],
                team_name=t.get("name", "Unknown Team"),
                team_seed=t.get("seed"),
            )
            for t in teams
        }

        for m in completed_matches:
            status = m.get("status")
            if status != "completed":
                continue

            s_a = m.get("score_a")
            s_b = m.get("score_b")
            t_a_id = m.get("team_a_id")
            t_b_id = m.get("team_b_id")

            # Must be a real scored match
            if s_a is None or s_b is None or not t_a_id or not t_b_id:
                continue

            row_a = rows.get(t_a_id)
            row_b = rows.get(t_b_id)

            if row_a:
                row_a.matches_played += 1
                row_a.points_scored += s_a
                row_a.points_allowed += s_b
                row_a.points_differential += (s_a - s_b)
                if s_a > s_b:
                    row_a.wins += 1
                elif s_b > s_a:
                    row_a.losses += 1

            if row_b:
                row_b.matches_played += 1
                row_b.points_scored += s_b
                row_b.points_allowed += s_a
                row_b.points_differential += (s_b - s_a)
                if s_b > s_a:
                    row_b.wins += 1
                elif s_a > s_b:
                    row_b.losses += 1

        # Sort all rows by tiebreaker key
        sorted_rows = sorted(rows.values(), key=lambda r: r.sort_key)

        # Assign 1-based ranks
        for idx, row in enumerate(sorted_rows, start=1):
            row.rank = idx

        return sorted_rows

    # ─── Playoff Qualification & Bracket ──────────────────────────────────────

    def prepare_playoff_teams(
        self,
        standings: list[LeagueStandingRow],
        playoff_team_count: int,
    ) -> list[dict[str, Any]]:
        """
        Deterministically qualify and seed top K teams from final regular-season standings.

        Rank 1 = Seed 1, Rank 2 = Seed 2, etc.
        """
        if playoff_team_count > len(standings):
            raise LeagueConfigurationError(
                f"Playoff team count ({playoff_team_count}) cannot exceed "
                f"teams in standings ({len(standings)})."
            )

        qualified = standings[:playoff_team_count]
        return [
            {
                "id": s.team_id,
                "name": s.team_name,
                "seed": s.rank,  # Deterministic seed from regular season rank
            }
            for s in qualified
        ]

    def generate_playoff_bracket(
        self,
        league_id: uuid.UUID,
        qualified_teams: list[dict[str, Any]],
    ) -> list[BracketMatchSlot]:
        """
        Generate championship single-elimination playoff bracket reusing BracketEngine.

        Reuses:
          - Deterministic bracket pairings
          - BYE handling & auto-advancement for non-power-of-2 team counts
          - winner advancement wiring (next_match_id / next_match_slot)
        """
        return self.bracket_engine.generate_bracket(league_id, qualified_teams)
