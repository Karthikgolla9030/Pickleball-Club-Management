"""
Aught2 Pickleball — Pool Play Engine (Phase 6)

Pure computation engine — NO database I/O.
Encapsulates all Pool Play specific competition algorithms:
  1. Pool configuration validation
  2. Deterministic serpentine / snake team distribution
  3. Pool-stage Round Robin match generation
  4. Independent pool standings calculation (reusing Phase 5 tiebreakers)
  5. Pool-position qualification and deterministic championship seeding
  6. Single-elimination championship bracket tree generation with automatic winner progression
"""
from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from typing import Any

from app.services.competition.round_robin_engine import (
    MatchSlot,
    RoundRobinEngine,
    StandingRow,
)


class PoolConfigurationError(ValueError):
    """Raised when a pool configuration violates domain rules."""
    pass


class ChampionshipError(ValueError):
    """Raised when championship bracket generation preconditions are not met."""
    pass


class PoolMatchSlot(dict):
    """Dict-like match slot supporting both dict keys s['team_a_id'] and attributes s.team_a_id."""
    def __getattr__(self, name: str) -> Any:
        try:
            return self[name]
        except KeyError:
            raise AttributeError(f"'PoolMatchSlot' object has no attribute {name!r}")


@dataclass
class ChampionshipBracketSlot:
    """A scheduled championship knockout match."""
    id: uuid.UUID
    tournament_id: uuid.UUID
    bracket_round: int
    bracket_position: int
    match_number: int
    team_a_id: uuid.UUID | None
    team_b_id: uuid.UUID | None
    stage: str = "championship"
    next_match_id: uuid.UUID | None = None
    next_match_slot: str | None = None  # "team_a" | "team_b"


class PoolPlayEngine:
    """
    Deterministic Pool Play tournament engine.
    """

    def __init__(self) -> None:
        self._rr_engine = RoundRobinEngine()

    # ─── 1. Pool Configuration Validation ──────────────────────────────────────

    @staticmethod
    def validate_pool_configuration(
        teams_count: int,
        number_of_pools: int,
        qualification_count_per_pool: int,
    ) -> None:
        """
        Validate pool configuration parameters.

        Rules:
          - teams_count >= 2
          - number_of_pools >= 2
          - number_of_pools <= teams_count
          - qualification_count_per_pool > 0
          - difference between largest and smallest pool <= 1 (balanced)
          - qualification_count_per_pool <= smallest pool size
          - smallest pool size >= 2
        """
        if teams_count < 2:
            raise PoolConfigurationError(
                f"Pool Play requires at least 2 teams (got {teams_count})"
            )

        if number_of_pools < 2:
            raise PoolConfigurationError(
                f"Pool Play requires at least 2 pools (got {number_of_pools})"
            )

        if number_of_pools > teams_count:
            raise PoolConfigurationError(
                f"Number of pools ({number_of_pools}) cannot exceed team count ({teams_count})"
            )

        if qualification_count_per_pool <= 0:
            raise PoolConfigurationError(
                f"Qualifiers per pool must be at least 1 (got {qualification_count_per_pool})"
            )

        base_pool_size = teams_count // number_of_pools
        remainder = teams_count % number_of_pools
        min_pool_size = base_pool_size
        max_pool_size = base_pool_size + (1 if remainder > 0 else 0)

        if min_pool_size < 2:
            raise PoolConfigurationError(
                f"Each pool must have at least 2 teams (minimum pool size is {min_pool_size})"
            )

        # Check balance (difference between max and min pool <= 1)
        if max_pool_size - min_pool_size > 1:
            raise PoolConfigurationError(
                f"Unbalanced pools: largest pool has {max_pool_size} teams, "
                f"smallest has {min_pool_size} teams (difference must be <= 1)"
            )

        if qualification_count_per_pool > min_pool_size:
            raise PoolConfigurationError(
                f"Qualifiers per pool ({qualification_count_per_pool}) exceeds minimum pool size ({min_pool_size})"
            )

    # ─── 2. Serpentine Team Distribution ───────────────────────────────────────

    @staticmethod
    def distribute_teams_serpentine(
        teams: list[dict[str, Any]],
        pools_spec: int | list[Any],
    ) -> dict[Any, list[dict[str, Any]]]:
        """
        Deterministically distribute teams into pools using the snake/serpentine algorithm.

        Algorithm:
          - Teams are sorted:
              1. Non-null seed ascending (e.g. 1, 2, 3...)
              2. Null seed ordered by team name (case-insensitive), then team id
          - Distribute in alternating directions:
              Round 0: Pool 0 -> Pool P-1
              Round 1: Pool P-1 -> Pool 0
              Round 2: Pool 0 -> Pool P-1
              ...
          - Deterministic: strictly NO random.shuffle().
          - Difference between largest and smallest pool is at most 1.

        Args:
            teams: List of team dicts (must contain 'id', 'name', optional 'seed').
            pools_spec: Number of pools (int) OR list of pool identifiers/names.

        Returns:
            Dict mapping pool identifier (0..P-1 or name) to list of teams in that pool.
        """
        if isinstance(pools_spec, int):
            number_of_pools = pools_spec
            pool_keys = list(range(number_of_pools))
        else:
            number_of_pools = len(pools_spec)
            pool_keys = list(pools_spec)

        if number_of_pools < 2:
            raise PoolConfigurationError("Number of pools must be at least 2")

        # Sort teams deterministically
        def team_sort_key(t: dict[str, Any]) -> tuple:
            has_seed = 0 if t.get("seed") is not None else 1
            seed_val = t.get("seed") if t.get("seed") is not None else 999999
            name_val = str(t.get("name", "")).lower()
            id_val = str(t.get("id", ""))
            return (has_seed, seed_val, name_val, id_val)

        sorted_teams = sorted(teams, key=team_sort_key)

        pool_buckets: dict[Any, list[dict[str, Any]]] = {
            k: [] for k in pool_keys
        }

        for idx, team in enumerate(sorted_teams):
            cycle = idx // number_of_pools
            rem = idx % number_of_pools
            if cycle % 2 == 0:
                pos = rem
            else:
                pos = number_of_pools - 1 - rem
            key = pool_keys[pos]
            pool_buckets[key].append(team)

        return pool_buckets

    # ─── 3. Pool-Stage Match Generation ────────────────────────────────────────

    def generate_pool_matches(
        self,
        pool_id_or_map: uuid.UUID | dict[uuid.UUID, list[Any]],
        teams: list[dict[str, Any]] | None = None,
        match_number_offset: int = 1,
    ) -> list[PoolMatchSlot]:
        """
        Generate Round Robin match slots within a pool or for all pools in a tournament.
        Reuses the circle/polygon rotation scheduling method.
        """
        if isinstance(pool_id_or_map, dict):
            all_slots: list[PoolMatchSlot] = []
            curr_match_num = match_number_offset
            for p_id, p_teams in pool_id_or_map.items():
                p_teams_dicts = [
                    {"id": t} if isinstance(t, uuid.UUID) else t
                    for t in p_teams
                ]
                p_slots = self.generate_pool_matches(
                    pool_id_or_map=p_id,
                    teams=p_teams_dicts,
                    match_number_offset=curr_match_num,
                )
                all_slots.extend(p_slots)
                curr_match_num += len(p_slots)
            return all_slots

        # Single pool
        pool_id = pool_id_or_map
        if not teams or len(teams) < 2:
            return []

        team_ids = [t["id"] if isinstance(t, dict) else t for t in teams]
        rr_slots: list[MatchSlot] = self._rr_engine.generate_schedule(team_ids)

        pool_match_slots: list[PoolMatchSlot] = []
        for idx, slot in enumerate(rr_slots):
            pool_match_slots.append(
                PoolMatchSlot({
                    "pool_id": pool_id,
                    "stage": "pool",
                    "round_number": slot.round_number,
                    "match_number": match_number_offset + idx,
                    "team_a_id": slot.team_a_id,
                    "team_b_id": slot.team_b_id,
                    "status": "pending",
                })
            )

        return pool_match_slots

    # ─── 4. Pool Standings ─────────────────────────────────────────────────────

    def calculate_pool_standings(
        self,
        teams: list[dict[str, Any]],
        completed_matches: list[dict[str, Any]],
    ) -> list[StandingRow]:
        """
        Calculate standings for a single pool using completed pool-stage matches.
        Reuses exact Phase 5 tiebreaker logic:
          1. Wins (descending)
          2. Points differential (descending)
          3. Total points scored (descending)
          4. Team name (case-insensitive lexicographic, ascending)
        """
        return self._rr_engine.calculate_standings(teams, completed_matches)

    # ─── 5. Qualification & Seeding ────────────────────────────────────────────

    @staticmethod
    def determine_qualifiers(
        pool_standings_by_pool: dict[uuid.UUID, list[StandingRow]],
        ordered_pools_or_count: list[dict[str, Any]] | int | None = None,
        qualification_count_per_pool: int | None = None,
        *,
        ordered_pools: list[dict[str, Any]] | None = None,
        qualifiers_per_pool: int | None = None,
    ) -> list[dict[str, Any]]:
        """
        Determine championship qualifiers and assign deterministic championship seeds.
        """
        q_count = (
            qualifiers_per_pool
            or qualification_count_per_pool
            or (ordered_pools_or_count if isinstance(ordered_pools_or_count, int) else None)
            or 1
        )
        pools = (
            ordered_pools
            or (ordered_pools_or_count if isinstance(ordered_pools_or_count, list) else None)
            or [{"id": pid, "name": str(pid)} for pid in pool_standings_by_pool.keys()]
        )

        qualifiers: list[dict[str, Any]] = []
        current_champ_seed = 1

        for rank_idx in range(q_count):
            for pool in pools:
                p_id = pool["id"]
                standings = pool_standings_by_pool.get(p_id, [])
                if rank_idx < len(standings):
                    row = standings[rank_idx]
                    qualifiers.append({
                        "team_id": row.team_id,
                        "team_name": row.team_name,
                        "seed": current_champ_seed,
                        "pool_id": p_id,
                        "pool_name": pool.get("name", ""),
                        "pool_rank": rank_idx + 1,
                    })
                    current_champ_seed += 1

        return qualifiers

    # ─── 6. Championship Knockout Bracket Generation ───────────────────────────

    @staticmethod
    def get_standard_bracket_pairings(bracket_size: int) -> list[tuple[int, int]]:
        """
        Return standard tournament bracket initial round seed pairings.
        """
        if bracket_size < 2:
            return [(1, 2)]

        def make_bracket(n: int) -> list[int]:
            if n == 2:
                return [1, 2]
            prev = make_bracket(n // 2)
            res = []
            for x in prev:
                res.append(x)
                res.append(n + 1 - x)
            return res

        seeds = make_bracket(bracket_size)
        pairs = []
        for i in range(0, len(seeds), 2):
            pairs.append((seeds[i], seeds[i + 1]))
        return pairs

    def generate_championship_bracket(
        self,
        tournament_id: uuid.UUID,
        qualifiers: list[dict[str, Any]],
        match_number_offset: int = 1,
    ) -> list[dict[str, Any]]:
        """
        Generate a complete single-elimination championship bracket tree.
        """
        k = len(qualifiers)
        if k < 2:
            raise ChampionshipError(
                f"Championship bracket requires at least 2 qualified teams (got {k})"
            )

        bracket_size = 1 << (k - 1).bit_length()
        if bracket_size < 2:
            bracket_size = 2
        total_rounds = int(math.log2(bracket_size))

        seed_to_qualifier: dict[int, dict[str, Any]] = {
            q["seed"]: q for q in qualifiers
        }

        rounds_matches: dict[int, list[dict[str, Any]]] = {
            r: [] for r in range(1, total_rounds + 1)
        }

        current_match_num = match_number_offset

        for r in range(1, total_rounds + 1):
            matches_in_round = bracket_size // (2 ** r)
            for pos in range(matches_in_round):
                match_id = uuid.uuid4()
                rounds_matches[r].append({
                    "id": match_id,
                    "tournament_id": tournament_id,
                    "stage": "championship",
                    "pool_id": None,
                    "round_number": r,
                    "bracket_round": r,
                    "bracket_position": pos + 1,
                    "match_number": current_match_num,
                    "team_a_id": None,
                    "team_b_id": None,
                    "status": "pending",
                    "next_match_id": None,
                    "next_match_slot": None,
                })
                current_match_num += 1

        for r in range(1, total_rounds):
            curr_matches = rounds_matches[r]
            next_matches = rounds_matches[r + 1]
            for pos, m in enumerate(curr_matches):
                next_match = next_matches[pos // 2]
                m["next_match_id"] = next_match["id"]
                m["next_match_slot"] = "team_a" if (pos % 2 == 0) else "team_b"

        initial_pairings = self.get_standard_bracket_pairings(bracket_size)
        r1_matches = rounds_matches[1]

        for pos, (seed_a, seed_b) in enumerate(initial_pairings):
            m = r1_matches[pos]
            q_a = seed_to_qualifier.get(seed_a)
            q_b = seed_to_qualifier.get(seed_b)

            team_a_id = q_a["team_id"] if q_a else None
            team_b_id = q_b["team_id"] if q_b else None

            if team_a_id and not team_b_id:
                m["team_a_id"] = team_a_id
                m["team_b_id"] = None
                m["status"] = "completed"
                m["winner_team_id"] = team_a_id
                if m["next_match_id"]:
                    next_round_matches = rounds_matches[2]
                    next_m = next_round_matches[pos // 2]
                    if m["next_match_slot"] == "team_a":
                        next_m["team_a_id"] = team_a_id
                    else:
                        next_m["team_b_id"] = team_a_id
            elif team_b_id and not team_a_id:
                m["team_a_id"] = None
                m["team_b_id"] = team_b_id
                m["status"] = "completed"
                m["winner_team_id"] = team_b_id
                if m["next_match_id"]:
                    next_round_matches = rounds_matches[2]
                    next_m = next_round_matches[pos // 2]
                    if m["next_match_slot"] == "team_a":
                        next_m["team_a_id"] = team_b_id
                    else:
                        next_m["team_b_id"] = team_b_id
            else:
                m["team_a_id"] = team_a_id
                m["team_b_id"] = team_b_id
                m["status"] = "pending"

        all_bracket_matches: list[dict[str, Any]] = []
        for r in range(1, total_rounds + 1):
            all_bracket_matches.extend(rounds_matches[r])

        return all_bracket_matches
