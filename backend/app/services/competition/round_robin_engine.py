"""
Aught2 Pickleball — Round Robin Engine (Phase 5)

Pure computation engine — NO database I/O.
Encapsulates Round Robin specific logic.

Algorithm: Circle / Polygon Rotation (standard round-robin scheduling)
  - For N teams (even), produces N-1 rounds of N/2 simultaneous matches.
  - For N teams (odd), adds a virtual "bye" slot; N rounds, each team gets
    one bye over the tournament. Matches against the bye slot are excluded
    from storage (no fake matches).
  - Deterministic: same team list (same order) always produces same schedule.

Standings tiebreaker order (exact — never change this order):
  1. wins               (descending)
  2. points_differential (descending)
  3. points_scored      (descending)
  4. team_name          (ascending, case-insensitive — deterministic fallback)
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field


@dataclass
class MatchSlot:
    """A scheduled matchup between two teams."""
    team_a_id: uuid.UUID
    team_b_id: uuid.UUID
    round_number: int
    match_number: int


@dataclass
class StandingRow:
    """
    One team's standing entry derived from completed match results.

    Tiebreaker key (primary → secondary → tertiary → fallback):
      1. wins (desc)
      2. points_differential (desc)
      3. points_scored (desc)
      4. team_name lower() (asc) — deterministic final fallback
    """
    team_id: uuid.UUID
    team_name: str
    team_seed: int | None
    wins: int = 0
    losses: int = 0
    matches_played: int = 0
    points_scored: int = 0
    points_allowed: int = 0
    points_differential: int = 0
    rank: int = 0

    @property
    def sort_key(self) -> tuple:
        """
        Returns a sort key for ranking. Lower is better rank.
        Negate numeric fields that should be descending.
        """
        return (
            -self.wins,
            -self.points_differential,
            -self.points_scored,
            self.team_name.lower(),   # ascending, deterministic
        )


class RoundRobinEngine:
    """
    Deterministic Round Robin match generator and standings calculator.

    Usage:
        engine = RoundRobinEngine()
        slots = engine.generate_schedule(team_ids)
        standings = engine.calculate_standings(team_rows, completed_matches)
    """

    def generate_schedule(
        self,
        team_ids: list[uuid.UUID],
    ) -> list[MatchSlot]:
        """
        Generate all Round Robin matchups using the circle/polygon rotation method.

        For N teams:
          - Even N: N-1 rounds, N/2 simultaneous matches per round.
          - Odd N: N rounds, (N-1)/2 simultaneous matches per round
            (one team gets a bye each round — bye slot not stored as a Match).

        Total matches = N * (N-1) / 2.

        Args:
            team_ids: Ordered list of team UUIDs. Order is deterministic input.

        Returns:
            list[MatchSlot] sorted by (round_number, match_number).
        """
        n = len(team_ids)
        if n < 2:
            raise ValueError("Round Robin requires at least 2 teams")

        # Work with indices; re-map to UUIDs at the end.
        teams = list(team_ids)

        # If odd, add a sentinel "bye" at the end
        bye_id = uuid.UUID(int=0)  # sentinel, not a real team
        if n % 2 == 1:
            teams = teams + [bye_id]

        n_padded = len(teams)
        rounds_count = n_padded - 1
        matches_per_round = n_padded // 2

        # Fix the last element; rotate the rest (standard circle algorithm)
        fixed = teams[-1]
        rotating = teams[:-1]

        slots: list[MatchSlot] = []
        match_counter = 1

        for round_idx in range(rounds_count):
            # Build pairings for this round
            current_round_teams = rotating + [fixed]
            round_matches: list[MatchSlot] = []
            round_match_num = 1

            for i in range(matches_per_round):
                a = current_round_teams[i]
                b = current_round_teams[n_padded - 1 - i]

                # Skip bye matches
                if a == bye_id or b == bye_id:
                    continue

                # Canonical ordering: smaller UUID index is always team_a
                if teams.index(a) > teams.index(b):
                    a, b = b, a

                slot = MatchSlot(
                    team_a_id=a,
                    team_b_id=b,
                    round_number=round_idx + 1,
                    match_number=match_counter,
                )
                round_matches.append(slot)
                match_counter += 1
                round_match_num += 1

            slots.extend(round_matches)

            # Rotate: move first element of rotating to the end
            rotating = rotating[1:] + [rotating[0]]

        return slots

    def calculate_standings(
        self,
        teams: list[dict],
        completed_matches: list[dict],
    ) -> list[StandingRow]:
        """
        Derive standings from completed match results.

        Match results are the source of truth — standings are never stored.

        Args:
            teams: list of dicts with keys: id (UUID), name (str), seed (int|None)
            completed_matches: list of dicts with keys:
                team_a_id, team_b_id, score_a, score_b, winner_team_id, status

        Returns:
            list[StandingRow] sorted by tiebreaker order (rank assigned).
        """
        rows: dict[uuid.UUID, StandingRow] = {}

        for t in teams:
            rows[t["id"]] = StandingRow(
                team_id=t["id"],
                team_name=t["name"],
                team_seed=t.get("seed"),
            )

        for match in completed_matches:
            if match.get("status") != "completed":
                continue

            a_id = match["team_a_id"]
            b_id = match["team_b_id"]
            score_a = match.get("score_a") or 0
            score_b = match.get("score_b") or 0
            winner_id = match.get("winner_team_id")

            if a_id not in rows or b_id not in rows:
                continue

            rows[a_id].matches_played += 1
            rows[b_id].matches_played += 1
            rows[a_id].points_scored += score_a
            rows[a_id].points_allowed += score_b
            rows[b_id].points_scored += score_b
            rows[b_id].points_allowed += score_a

            if winner_id == a_id:
                rows[a_id].wins += 1
                rows[b_id].losses += 1
            elif winner_id == b_id:
                rows[b_id].wins += 1
                rows[a_id].losses += 1

        for row in rows.values():
            row.points_differential = row.points_scored - row.points_allowed

        # Sort by tiebreaker key
        sorted_rows = sorted(rows.values(), key=lambda r: r.sort_key)

        # Assign ranks
        for i, row in enumerate(sorted_rows):
            row.rank = i + 1

        return sorted_rows
