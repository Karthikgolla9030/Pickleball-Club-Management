"""
Aught2 Pickleball — Scramble Competition Engine (Phase 7)

Pure, deterministic matchmaking and individual standings calculation for Scramble tournaments.

Scramble Characteristics:
- Participants are individual players (not fixed teams).
- Doubles matches: each match has 4 players (2 on Side A, 2 on Side B).
- Partners and opponents rotate across rounds.
- Minimizes repeated partnerships and repeated opponents.
- Deterministic optimization: NO random.shuffle() or randomness.
- Same input players and configuration produce identical schedules.
- Individual player standings based on Wins -> Points Diff -> Total Points -> Player Name.
"""
from __future__ import annotations

import itertools
import uuid
from dataclasses import dataclass
from typing import Any


class ScrambleError(Exception):
    """Base exception for Scramble engine operations."""


class ScrambleConfigurationError(ScrambleError):
    """Raised when tournament configuration or participant count is invalid for Scramble."""


@dataclass
class ScrambleStanding:
    """Individual player standing in a Scramble tournament."""
    rank: int
    player_membership_id: uuid.UUID
    user_id: uuid.UUID
    display_name: str
    wins: int
    losses: int
    matches_played: int
    points_scored: int
    points_allowed: int
    points_differential: int
    skill_rating: float | None = None


class ScrambleEngine:
    """
    Pure algorithmic engine for Scramble tournaments.
    Zero database I/O. All methods operate on plain Python objects / dicts.
    """

    def validate_scramble_configuration(
        self,
        player_count: int,
        num_rounds: int,
        matches_per_player: int | None = None,
    ) -> None:
        """
        Validate participant count and round configuration for Scramble.

        Rules:
        - Minimum 4 confirmed players.
        - Player count must be divisible by 4 (e.g. 4, 8, 12, 16, 20...) to guarantee
          completely equal match participation without uneven bye cycles.
        - Number of rounds >= 1.
        - If matches_per_player is provided, it must match num_rounds.
        """
        if player_count < 4:
            raise ScrambleConfigurationError(
                f"Scramble requires at least 4 confirmed players (received {player_count})."
            )
        if player_count % 4 != 0:
            raise ScrambleConfigurationError(
                f"Scramble requires the number of confirmed players to be a multiple of 4 "
                f"(e.g. 4, 8, 12, 16, 20). Received {player_count} players."
            )
        if num_rounds < 1:
            raise ScrambleConfigurationError("Number of rounds must be at least 1.")
        if matches_per_player is not None and matches_per_player != num_rounds:
            raise ScrambleConfigurationError(
                f"In Scramble tournaments, matches_per_player ({matches_per_player}) "
                f"must equal the number of rounds ({num_rounds})."
            )

    @staticmethod
    def calculate_recommended_rounds(
        player_count: int,
        division: str = "Open Scramble",
        courts_count: int | None = None,
    ) -> tuple[int, str, dict[str, Any]]:
        """
        Calculate recommended planned rounds based on category, roster size, and rotation rules.

        Returns: (recommended_rounds, recommendation_reason, details_dict)
        """
        if player_count < 4:
            return 1, "Minimum 4 players required.", {
                "recommended_rounds": 1,
                "possible_partners_per_player": 0,
                "partner_slots_per_round": 0,
                "expected_games_per_player": 0,
                "partner_coverage_goal": "Full rotation",
            }

        is_mixed = division == "Mixed Scramble"
        if is_mixed:
            # In Mixed Scramble, each player partners with players of the opposite gender.
            # Roster has equal M and F (N/2 each).
            opp_gender_count = player_count // 2
            possible_partners = max(1, opp_gender_count)
            # Balanced 4-player court generates 2 games = 2 mixed partner slots per player per round
            partner_slots_per_round = 2
            recommended = max(1, min(20, (possible_partners + partner_slots_per_round - 1) // partner_slots_per_round))
            reason = (
                f"For {player_count} players ({opp_gender_count} men, {opp_gender_count} women), each player has "
                f"{possible_partners} possible mixed-gender partners. With 2 games per round per court, {recommended} rounds "
                f"provide {recommended * 2} partner slots to aim for full partner coverage."
            )
        else:
            # In Open, Men's, or Women's, each player can partner with all other N-1 players.
            possible_partners = max(1, player_count - 1)
            # 4-player court provides 3 games = 3 partner slots per round
            partner_slots_per_round = 3
            recommended = max(1, min(20, (possible_partners + partner_slots_per_round - 1) // partner_slots_per_round))
            reason = (
                f"For {player_count} players, each player has {possible_partners} possible partners. With 3 games per "
                f"4-player court round, {recommended} rounds provide {recommended * 3} partner slots to aim for full "
                f"partner rotation."
            )

        expected_games_per_player = recommended * partner_slots_per_round
        c_est = courts_count if (courts_count and courts_count > 0) else (player_count // 4)
        games_per_round = c_est * (2 if is_mixed else 3)
        expected_total_games = recommended * games_per_round

        return recommended, reason, {
            "recommended_rounds": recommended,
            "possible_partners_per_player": possible_partners,
            "partner_slots_per_round": partner_slots_per_round,
            "expected_games_per_player": expected_games_per_player,
            "expected_total_games": expected_total_games,
            "partner_coverage_goal": f"Cover all {possible_partners} unique partners",
        }

    @staticmethod
    def calculate_overall_coverage(
        players: list[dict[str, Any]],
        matches: list[dict[str, Any]],
        division: str = "Open Scramble",
    ) -> dict[str, Any]:
        """
        Measure actual schedule partner and opponent coverage from persisted/generated matches.
        Never promises full coverage unless every player's actual assigned partners verify that claim.
        """
        is_mixed = division == "Mixed Scramble"
        p_ids = [str(p.get("id") or p.get("player_membership_id")) for p in players]
        p_map = {str(p.get("id") or p.get("player_membership_id")): p for p in players}

        partners_by_player: dict[str, list[str]] = {pid: [] for pid in p_ids}
        opponents_by_player: dict[str, list[str]] = {pid: [] for pid in p_ids}
        games_by_player: dict[str, int] = {pid: 0 for pid in p_ids}

        for m in matches:
            if m.get("status") == "cancelled":
                continue
            sa = [str(p.get("id") or p.get("player_membership_id")) for p in (m.get("side_a") or m.get("side_a_participants") or [])]
            sb = [str(p.get("id") or p.get("player_membership_id")) for p in (m.get("side_b") or m.get("side_b_participants") or [])]

            if len(sa) == 2:
                p1, p2 = sa
                if p1 in partners_by_player:
                    partners_by_player[p1].append(p2)
                    games_by_player[p1] += 1
                if p2 in partners_by_player:
                    partners_by_player[p2].append(p1)
                    games_by_player[p2] += 1

            if len(sb) == 2:
                p1, p2 = sb
                if p1 in partners_by_player:
                    partners_by_player[p1].append(p2)
                    games_by_player[p1] += 1
                if p2 in partners_by_player:
                    partners_by_player[p2].append(p1)
                    games_by_player[p2] += 1

            for a in sa:
                for b in sb:
                    if a in opponents_by_player:
                        opponents_by_player[a].append(b)
                    if b in opponents_by_player:
                        opponents_by_player[b].append(a)

        # Per player statistics
        males = {pid for pid, p in p_map.items() if (p.get("gender") or "").strip().capitalize() == "Male"}
        females = {pid for pid, p in p_map.items() if (p.get("gender") or "").strip().capitalize() == "Female"}

        player_stats = []
        all_possible_partner_counts = []
        coverage_percentages = []

        total_partner_repeats = 0
        total_opponent_repeats = 0

        for pid in p_ids:
            p_obj = p_map[pid]
            dname = p_obj.get("display_name") or p_obj.get("name") or "Player"
            partner_list = partners_by_player[pid]
            unique_partners = set(partner_list)
            opp_list = opponents_by_player[pid]
            unique_opps = set(opp_list)

            if is_mixed:
                possible_partners_set = females if pid in males else males
            else:
                possible_partners_set = {other_id for other_id in p_ids if other_id != pid}

            possible_partners_count = len(possible_partners_set)
            possible_opponents_count = len(p_ids) - 1

            missing_partners = [
                p_map[mid].get("display_name") or p_map[mid].get("name") or "Player"
                for mid in (possible_partners_set - unique_partners)
                if mid in p_map
            ]

            p_repeats = max(0, len(partner_list) - len(unique_partners))
            o_repeats = max(0, len(opp_list) - len(unique_opps))
            total_partner_repeats += p_repeats
            total_opponent_repeats += o_repeats

            cov_pct = (len(unique_partners) / possible_partners_count * 100.0) if possible_partners_count > 0 else 100.0
            coverage_percentages.append(cov_pct)
            all_possible_partner_counts.append(possible_partners_count)

            player_stats.append({
                "player_membership_id": pid,
                "display_name": dname,
                "games_played": games_by_player[pid],
                "unique_partners_count": len(unique_partners),
                "possible_partners_count": possible_partners_count,
                "partner_coverage_pct": round(cov_pct, 1),
                "repeat_partners_count": p_repeats,
                "missing_partners_count": len(missing_partners),
                "unique_opponents_count": len(unique_opps),
                "possible_opponents_count": possible_opponents_count,
                "repeat_opponents_count": o_repeats,
            })

        min_cov = min(coverage_percentages) if coverage_percentages else 100.0
        max_cov = max(coverage_percentages) if coverage_percentages else 100.0
        avg_cov = sum(coverage_percentages) / len(coverage_percentages) if coverage_percentages else 100.0
        all_covered = len(player_stats) > 0 and all(p["unique_partners_count"] >= p["possible_partners_count"] for p in player_stats)

        if all_covered:
            quality_claim = "Full unique-partner coverage verified (every player partners with every possible partner)"
        elif min_cov == max_cov:
            quality_claim = f"Partner rotation active: {round(avg_cov)}% unique partner coverage across all players"
        else:
            quality_claim = f"Partner rotation active: {round(min_cov)}%–{round(max_cov)}% unique partner coverage achieved"

        return {
            "all_partners_covered": all_covered,
            "min_partner_coverage_pct": round(min_cov, 1),
            "avg_partner_coverage_pct": round(avg_cov, 1),
            "max_partner_coverage_pct": round(max_cov, 1),
            "total_partner_repeats": total_partner_repeats // 2,
            "total_opponent_repeats": total_opponent_repeats // 2,
            "quality_claim": quality_claim,
            "players_coverage": player_stats,
        }

    def sort_players_deterministically(
        self, players: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """
        Sort player participants deterministically.
        Ordering priority:
          1. Seed (ascending, unseeded placed last)
          2. Skill Rating (descending)
          3. Registered at (ascending)
          4. Player membership ID (lexicographical string fallback)
        """
        def sort_key(p: dict[str, Any]) -> tuple[int, float, Any, str]:
            seed_val = p.get("seed")
            seed_rank = seed_val if (seed_val is not None and seed_val > 0) else 999999
            rating = float(p.get("skill_rating") or p.get("rating") or 0.0)
            reg_at = p.get("registered_at") or ""
            p_id = str(p.get("id") or p.get("player_membership_id") or "")
            return (seed_rank, -rating, reg_at, p_id)

        return sorted(players, key=sort_key)

    def generate_matchups(
        self,
        players: list[dict[str, Any]],
        num_rounds: int,
        matches_per_player: int | None = None,
        division: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Generate deterministic Scramble doubles matchups across rounds.

        Each match has:
          - round_number: 1-indexed
          - match_number: 1-indexed (sequential across tournament)
          - side_a: list of 2 player dicts (slot 1, slot 2)
          - side_b: list of 2 player dicts (slot 1, slot 2)

        Guarantee:
          - Every player plays exactly once per round.
          - No player appears twice in the same match.
          - Partner repeats are strictly minimized across rounds.
          - Opponent repeats are minimized as second priority.
          - If seeds are present, matches are balanced by seed sum.
          - Strict determinism: NO randomness or random.shuffle.
        """
        self.validate_scramble_configuration(
            len(players), num_rounds, matches_per_player
        )
        if division == "Mixed Scramble":
            for p in players:
                g = (p.get("gender") or "").strip().capitalize()
                if g not in ("Male", "Female"):
                    name = p.get("display_name") or p.get("name") or "Player"
                    raise ScrambleConfigurationError(
                        f"Player '{name}' has no verified gender in their profile. "
                        f"Mixed Scramble requires verified profile gender (Male or Female) to form mixed-gender doubles teams."
                    )
            males = [p for p in players if (p.get("gender") or "").strip().capitalize() == "Male"]
            females = [p for p in players if (p.get("gender") or "").strip().capitalize() == "Female"]
            if len(males) != len(females) or len(players) % 4 != 0:
                raise ScrambleConfigurationError(
                    f"Mixed Scramble requires an equal number of male and female players in multiples of 4. "
                    f"Available roster has {len(males)} men and {len(females)} women ({len(players)} total players)."
                )

        ordered_players = self.sort_players_deterministically(players)
        p_ids = [str(p["id"]) for p in ordered_players]
        p_map = {str(p["id"]): p for p in ordered_players}

        partner_counts = {p: {q: 0 for q in p_ids} for p in p_ids}
        opponent_counts = {p: {q: 0 for q in p_ids} for p in p_ids}

        all_matches: list[dict[str, Any]] = []
        global_match_number = 1

        for r in range(1, num_rounds + 1):
            unassigned = list(p_ids)
            round_matches: list[dict[str, Any]] = []

            while len(unassigned) >= 4:
                p1 = unassigned[0]
                best_match = None
                best_cost = float("inf")

                # Deterministically check every combination of 3 other players
                for p2, p3, p4 in itertools.combinations(unassigned[1:], 3):
                    pairings = [
                        ((p1, p2), (p3, p4)),
                        ((p1, p3), (p2, p4)),
                        ((p1, p4), (p2, p3)),
                    ]
                    for (side_a, side_b) in pairings:
                        a1, a2 = side_a
                        b1, b2 = side_b

                        # In Mixed Scramble, both sides must be strictly mixed (1 male, 1 female)
                        if division == "Mixed Scramble":
                            g_a1 = (p_map[a1].get("gender") or "").strip().capitalize()
                            g_a2 = (p_map[a2].get("gender") or "").strip().capitalize()
                            g_b1 = (p_map[b1].get("gender") or "").strip().capitalize()
                            g_b2 = (p_map[b2].get("gender") or "").strip().capitalize()
                            if g_a1 == g_a2 or g_b1 == g_b2:
                                continue

                        # Partner repeat penalty (heaviest weight)
                        partner_cost = (
                            (partner_counts[a1][a2] ** 2) * 1_000_000 +
                            (partner_counts[b1][b2] ** 2) * 1_000_000
                        )

                        # Seed balance penalty (medium weight)
                        seed_a1 = p_map[a1].get("seed") or 50
                        seed_a2 = p_map[a2].get("seed") or 50
                        seed_b1 = p_map[b1].get("seed") or 50
                        seed_b2 = p_map[b2].get("seed") or 50
                        seed_diff = abs((seed_a1 + seed_a2) - (seed_b1 + seed_b2))
                        seed_cost = seed_diff * 100

                        # Opponent repeat penalty (light weight)
                        opp_cost = (
                            opponent_counts[a1][b1] +
                            opponent_counts[a1][b2] +
                            opponent_counts[a2][b1] +
                            opponent_counts[a2][b2]
                        )

                        total_cost = partner_cost + seed_cost + opp_cost
                        if total_cost < best_cost:
                            best_cost = total_cost
                            best_match = (side_a, side_b)

                assert best_match is not None, "Combinations exhausted without finding match"
                side_a, side_b = best_match
                a1, a2 = side_a
                b1, b2 = side_b

                round_matches.append({
                    "round_number": r,
                    "match_number": global_match_number,
                    "side_a": [p_map[a1], p_map[a2]],
                    "side_b": [p_map[b1], p_map[b2]],
                })
                global_match_number += 1

                unassigned.remove(a1)
                unassigned.remove(a2)
                unassigned.remove(b1)
                unassigned.remove(b2)

                partner_counts[a1][a2] += 1
                partner_counts[a2][a1] += 1
                partner_counts[b1][b2] += 1
                partner_counts[b2][b1] += 1

                for a in (a1, a2):
                    for b in (b1, b2):
                        opponent_counts[a][b] += 1
                        opponent_counts[b][a] += 1

            all_matches.extend(round_matches)

        return all_matches

    def calculate_scramble_standings(
        self,
        players: list[dict[str, Any]],
        matches: list[dict[str, Any]],
    ) -> list[ScrambleStanding]:
        """
        Calculate individual player standings from Scramble match results.

        Ranked strictly by:
          1. Wins (descending)
          2. Points Differential (descending)
          3. Total Points Scored (descending)
          4. Player Display Name (ascending, case-insensitive, deterministic fallback)
          5. Player Membership ID (ascending UUID string fallback)
        """
        stats: dict[str, dict[str, Any]] = {}
        for p in players:
            p_id = str(p.get("id") or p.get("player_membership_id"))
            u_id = p.get("user_id") or p.get("id")
            name = p.get("display_name") or p.get("name") or "Player"
            rating = p.get("skill_rating") or p.get("rating")
            stats[p_id] = {
                "player_membership_id": uuid.UUID(p_id) if isinstance(p_id, str) else p_id,
                "user_id": uuid.UUID(str(u_id)) if isinstance(u_id, (str, uuid.UUID)) else uuid.uuid4(),
                "display_name": name,
                "skill_rating": float(rating) if rating is not None else None,
                "wins": 0,
                "losses": 0,
                "matches_played": 0,
                "points_scored": 0,
                "points_allowed": 0,
                "points_differential": 0,
            }

        for m in matches:
            if m.get("status") != "completed":
                continue
            score_a = m.get("score_a")
            score_b = m.get("score_b")
            if score_a is None or score_b is None:
                continue

            side_a = m.get("side_a") or []
            side_b = m.get("side_b") or []

            side_a_won = score_a > score_b

            # Update Side A players
            for p in side_a:
                pid = str(p.get("id") or p.get("player_membership_id"))
                if pid in stats:
                    stats[pid]["matches_played"] += 1
                    if side_a_won:
                        stats[pid]["wins"] += 1
                    else:
                        stats[pid]["losses"] += 1
                    stats[pid]["points_scored"] += score_a
                    stats[pid]["points_allowed"] += score_b
                    stats[pid]["points_differential"] += (score_a - score_b)

            # Update Side B players
            for p in side_b:
                pid = str(p.get("id") or p.get("player_membership_id"))
                if pid in stats:
                    stats[pid]["matches_played"] += 1
                    if not side_a_won:
                        stats[pid]["wins"] += 1
                    else:
                        stats[pid]["losses"] += 1
                    stats[pid]["points_scored"] += score_b
                    stats[pid]["points_allowed"] += score_a
                    stats[pid]["points_differential"] += (score_b - score_a)

        # Sort by tiebreaker rules
        def sort_key(row: dict[str, Any]) -> tuple[int, int, int, str, str]:
            return (
                -row["wins"],
                -row["points_differential"],
                -row["points_scored"],
                row["display_name"].lower(),
                str(row["player_membership_id"]),
            )

        sorted_rows = sorted(stats.values(), key=sort_key)
        standings: list[ScrambleStanding] = []
        for rank, row in enumerate(sorted_rows, start=1):
            standings.append(
                ScrambleStanding(
                    rank=rank,
                    player_membership_id=row["player_membership_id"],
                    user_id=row["user_id"],
                    display_name=row["display_name"],
                    wins=row["wins"],
                    losses=row["losses"],
                    matches_played=row["matches_played"],
                    points_scored=row["points_scored"],
                    points_allowed=row["points_allowed"],
                    points_differential=row["points_differential"],
                    skill_rating=row["skill_rating"],
                )
            )

        return standings

    @staticmethod
    def partition_players_into_courts(player_count: int) -> tuple[int, int] | None:
        """
        Divide player_count into courts containing 4 or 5 players.

        Formula: player_count = 4 * c_4 + 5 * c_5 (c_4, c_5 >= 0)
        Returns (num_4_player_courts, num_5_player_courts) or None if no valid partition exists.

        Prefers 4-player courts (minimizes c_5) to reduce sit-outs.

        Examples:
          4  -> (1, 0) : 4
          5  -> (0, 1) : 5
          8  -> (2, 0) : 4 + 4
          9  -> (1, 1) : 4 + 5
          10 -> (0, 2) : 5 + 5
          12 -> (3, 0) : 4 + 4 + 4
          13 -> (2, 1) : 4 + 4 + 5
          14 -> (1, 2) : 4 + 5 + 5
          15 -> (0, 3) : 5 + 5 + 5
          16 -> (4, 0) : 4 + 4 + 4 + 4
          17 -> (3, 1) : 4 + 4 + 4 + 5
          18 -> (2, 2) : 4 + 4 + 5 + 5
          Invalid: < 4, 6, 7, 11
        """
        if player_count < 4:
            return None
        for c_5 in range(0, (player_count // 5) + 1):
            rem = player_count - (5 * c_5)
            if rem >= 0 and rem % 4 == 0:
                c_4 = rem // 4
                return (c_4, c_5)
        return None

    def generate_round_matchups(
        self,
        players: list[dict[str, Any]],
        round_number: int = 1,
        start_match_number: int = 1,
        partner_history: dict[str, dict[str, int]] | None = None,
        opponent_history: dict[str, dict[str, int]] | None = None,
        courts_info: list[dict[str, Any]] | None = None,
        division: str | None = None,
    ) -> dict[str, Any]:
        """
        Generate round-specific Scramble matchups for 4 or 5 player courts.

        Each 4-player court produces 3 games (each player plays 3 games, 0 sit-outs).
        Each 5-player court produces 5 games (each player plays 4 games, sits out exactly once).
        Minimizes repeat partners first, then repeat opponents across rounds using history.
        When division == 'Mixed Scramble', allocates balanced male/female participants to each court
        and prioritizes mixed pairings while strictly adhering to complete partner rotation.
        """
        is_mixed = division == "Mixed Scramble"

        if is_mixed:
            # Mixed Scramble strictly requires:
            # 1. Every player must have verified gender (Male or Female)
            # 2. Equal number of male and female players
            # 3. Total player count must be a multiple of 4
            # 4. Strictly 4-player courts (2 males + 2 females per court) - NO 5-player courts
            for p in players:
                g = (p.get("gender") or "").strip().capitalize()
                if g not in ("Male", "Female"):
                    name = p.get("display_name") or p.get("name") or "Player"
                    raise ScrambleConfigurationError(
                        f"Player '{name}' has no verified gender in their profile. "
                        f"Mixed Scramble requires verified profile gender (Male or Female) to form mixed-gender doubles teams."
                    )

            males_list = [p for p in players if (p.get("gender") or "").strip().capitalize() == "Male"]
            females_list = [p for p in players if (p.get("gender") or "").strip().capitalize() == "Female"]

            if len(males_list) != len(females_list) or len(players) % 4 != 0:
                raise ScrambleConfigurationError(
                    f"Mixed Scramble requires an equal number of male and female players in multiples of 4 "
                    f"(e.g. 2 men & 2 women, 4 men & 4 women). Available roster has {len(males_list)} men and {len(females_list)} women ({len(players)} total players)."
                )

            total_courts = len(players) // 4
            c_4 = total_courts
            c_5 = 0
            court_capacities: list[int] = [4] * total_courts
        else:
            partition = self.partition_players_into_courts(len(players))
            if partition is None:
                raise ScrambleConfigurationError(
                    f"Selected {len(players)} players cannot be divided into valid courts of 4 or 5 players. "
                    f"Please adjust player availability (valid counts include: 4, 5, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18...)."
                )
            c_4, c_5 = partition
            total_courts = c_4 + c_5
            court_capacities = [4] * c_4 + [5] * c_5

        ordered_players = self.sort_players_deterministically(players)
        p_ids = [str(p["id"]) for p in ordered_players]
        p_map = {str(p["id"]): p for p in ordered_players}

        # Setup history trackers
        p_history: dict[str, dict[str, int]] = {p: {q: 0 for q in p_ids} for p in p_ids}
        o_history: dict[str, dict[str, int]] = {p: {q: 0 for q in p_ids} for p in p_ids}
        if partner_history:
            for p in p_ids:
                for q in p_ids:
                    p_history[p][q] = partner_history.get(p, {}).get(q, 0)
        if opponent_history:
            for p in p_ids:
                for q in p_ids:
                    o_history[p][q] = opponent_history.get(p, {}).get(q, 0)

        # Initial distribution of players into courts
        courts_assigned: list[list[str]] = [[] for _ in range(total_courts)]
        if is_mixed:
            # Deterministically sort males and females separately
            sorted_males = self.sort_players_deterministically(
                [p for p in ordered_players if (p.get("gender") or "").strip().capitalize() == "Male"]
            )
            sorted_females = self.sort_players_deterministically(
                [p for p in ordered_players if (p.get("gender") or "").strip().capitalize() == "Female"]
            )

            # Snake draft 2 males per court
            m_pids = [str(p["id"]) for p in sorted_males]
            c_idx = 0
            direction = 1
            for pid in m_pids:
                courts_assigned[c_idx].append(pid)
                c_idx += direction
                if c_idx >= total_courts:
                    c_idx = total_courts - 1
                    direction = -1
                elif c_idx < 0:
                    c_idx = 0
                    direction = 1

            # Snake draft 2 females per court (in reverse order for skill balance)
            f_pids = [str(p["id"]) for p in sorted_females]
            c_idx = total_courts - 1
            direction = -1
            for pid in f_pids:
                courts_assigned[c_idx].append(pid)
                c_idx += direction
                if c_idx < 0:
                    c_idx = 0
                    direction = 1
                elif c_idx >= total_courts:
                    c_idx = total_courts - 1
                    direction = -1
        else:
            current_court = 0
            direction = 1
            for pid in p_ids:
                attempts = 0
                while len(courts_assigned[current_court]) >= court_capacities[current_court] and attempts < total_courts * 2:
                    current_court += direction
                    if current_court >= total_courts:
                        current_court = total_courts - 1
                        direction = -1
                    elif current_court < 0:
                        current_court = 0
                        direction = 1
                    attempts += 1
                courts_assigned[current_court].append(pid)
                current_court += direction
                if current_court >= total_courts:
                    current_court = total_courts - 1
                    direction = -1
                elif current_court < 0:
                    current_court = 0
                    direction = 1

        def calculate_court_cost(court_members: list[str]) -> int:
            cost = 0
            n = len(court_members)
            for i in range(n):
                for j in range(i + 1, n):
                    p1, p2 = court_members[i], court_members[j]
                    cost += (p_history[p1][p2] ** 2) * 1_000_000
                    cost += o_history[p1][p2] * 100
            return cost

        # Deterministic swap refinement across courts if rounds > 1
        if round_number > 1 and total_courts > 1:
            improved = True
            iterations = 0
            while improved and iterations < 40:
                improved = False
                iterations += 1
                for c1_idx in range(total_courts):
                    for c2_idx in range(c1_idx + 1, total_courts):
                        c1 = courts_assigned[c1_idx]
                        c2 = courts_assigned[c2_idx]
                        current_pair_cost = calculate_court_cost(c1) + calculate_court_cost(c2)

                        best_swap = None
                        best_diff = 0

                        for p1_pos, p1 in enumerate(c1):
                            for p2_pos, p2 in enumerate(c2):
                                # In Mixed Scramble, preserve gender balance: male swaps with male, female with female
                                if is_mixed:
                                    g1 = (p_map[p1].get("gender") or "").strip().capitalize()
                                    g2 = (p_map[p2].get("gender") or "").strip().capitalize()
                                    if g1 != g2:
                                        continue

                                # Test swap
                                trial_c1 = list(c1)
                                trial_c2 = list(c2)
                                trial_c1[p1_pos] = p2
                                trial_c2[p2_pos] = p1
                                trial_cost = calculate_court_cost(trial_c1) + calculate_court_cost(trial_c2)
                                diff = current_pair_cost - trial_cost
                                if diff > best_diff:
                                    best_diff = diff
                                    best_swap = (p1_pos, p2_pos)

                        if best_swap and best_diff > 0:
                            p1_pos, p2_pos = best_swap
                            p1 = c1[p1_pos]
                            p2 = c2[p2_pos]
                            c1[p1_pos] = p2
                            c2[p2_pos] = p1
                            improved = True

        # Generate games per court
        all_matches: list[dict[str, Any]] = []
        courts_payload: list[dict[str, Any]] = []
        current_match_num = start_match_number

        for c_idx, court_pids in enumerate(courts_assigned, start=1):
            court_p_objs = [p_map[pid] for pid in court_pids]
            court_p_objs = self.sort_players_deterministically(court_p_objs)
            c_info = courts_info[c_idx - 1] if (courts_info and len(courts_info) >= c_idx) else {}
            court_id = c_info.get("id") or c_info.get("court_id")
            court_name = c_info.get("name") or c_info.get("display_name") or f"Court {c_idx}"

            court_matches: list[dict[str, Any]] = []
            if len(court_p_objs) == 4:
                if is_mixed:
                    court_m = self.sort_players_deterministically(
                        [p for p in court_p_objs if (p.get("gender") or "").strip().capitalize() == "Male"]
                    )
                    court_f = self.sort_players_deterministically(
                        [p for p in court_p_objs if (p.get("gender") or "").strip().capitalize() == "Female"]
                    )
                    assert len(court_m) == 2 and len(court_f) == 2, "Mixed Scramble court must have 2 males and 2 females"
                    M1, M2 = court_m[0], court_m[1]
                    F1, F2 = court_f[0], court_f[1]

                    # Mixed Doubles pairings:
                    # Every team on both sides MUST contain 1 male and 1 female
                    # Game 1: [M1, F1] vs [M2, F2]
                    # Game 2: [M1, F2] vs [M2, F1]
                    game_templates = [
                        ([M1, F1], [M2, F2], None),
                        ([M1, F2], [M2, F1], None),
                    ]
                else:
                    A, B, C, D = court_p_objs
                    game_templates = [
                        ([A, B], [C, D], None),
                        ([A, C], [B, D], None),
                        ([A, D], [B, C], None),
                    ]
            else:
                A, B, C, D, E = court_p_objs
                game_templates = [
                    ([A, B], [C, D], E),  # E sits out
                    ([A, E], [B, C], D),  # D sits out
                    ([A, D], [B, E], C),  # C sits out
                    ([A, C], [D, E], B),  # B sits out
                    ([B, D], [C, E], A),  # A sits out
                ]

            for side_a, side_b, sit_out in game_templates:
                match_dict = {
                    "round_number": round_number,
                    "match_number": current_match_num,
                    "court_number": c_idx,
                    "court_id": court_id,
                    "court_name": court_name,
                    "side_a": side_a,
                    "side_b": side_b,
                    "sit_out_player": sit_out,
                }
                court_matches.append(match_dict)
                all_matches.append(match_dict)
                current_match_num += 1

            courts_payload.append({
                "court_number": c_idx,
                "court_id": str(court_id) if court_id else None,
                "court_name": court_name,
                "player_count": len(court_p_objs),
                "players": court_p_objs,
                "matches": court_matches,
            })

        # Calculate schedule quality and repeat counts against prior completed history
        repeat_partners_count = 0
        repeat_opponents_count = 0
        partner_warnings = []

        for m in all_matches:
            sa = [str(p["id"]) for p in m["side_a"]]
            sb = [str(p["id"]) for p in m["side_b"]]
            if p_history[sa[0]][sa[1]] > 0:
                repeat_partners_count += 1
                n1 = p_map[sa[0]].get("display_name") or p_map[sa[0]].get("name") or "Player"
                n2 = p_map[sa[1]].get("display_name") or p_map[sa[1]].get("name") or "Player"
                partner_warnings.append(f"{n1} & {n2} (Court {m['court_number']}, Game #{m['match_number']})")
            if p_history[sb[0]][sb[1]] > 0:
                repeat_partners_count += 1
                n1 = p_map[sb[0]].get("display_name") or p_map[sb[0]].get("name") or "Player"
                n2 = p_map[sb[1]].get("display_name") or p_map[sb[1]].get("name") or "Player"
                partner_warnings.append(f"{n1} & {n2} (Court {m['court_number']}, Game #{m['match_number']})")
            for a in sa:
                for b in sb:
                    if o_history[a][b] > 0:
                        repeat_opponents_count += 1

        if repeat_partners_count == 0:
            quality_msg = "Optimal schedule: No repeated partners in this round."
        else:
            quality_msg = f"{repeat_partners_count} repeat partner pairing(s) in this round due to player roster size."

        return {
            "round_number": round_number,
            "total_players": len(players),
            "c4_courts": c_4,
            "c5_courts": c_5,
            "courts": courts_payload,
            "matches": all_matches,
            "quality_summary": {
                "repeat_partners_count": repeat_partners_count,
                "repeat_opponents_count": repeat_opponents_count,
                "quality_message": quality_msg,
                "partner_warnings": partner_warnings,
            },
        }

    def calculate_recommended_rounds(
        self,
        player_count: int,
        division: str | None = None,
        courts_count: int | None = None,
    ) -> tuple[int, str, dict[str, Any]]:
        """Instance method returning (recommended_rounds, reason, details_dict)."""
        rec = calculate_recommended_rounds(player_count, division, courts_count)
        return rec["recommended_rounds"], rec["reason"], rec

    def calculate_overall_coverage(
        self,
        players: list[dict[str, Any]],
        matches: list[dict[str, Any]],
        division: str | None = None,
    ) -> dict[str, Any]:
        """Instance method calculating overall tournament partner and opponent coverage."""
        return calculate_overall_coverage(players, matches, division)


def calculate_recommended_rounds(
    player_count: int,
    division: str | None = None,
    courts_count: int | None = None,
) -> dict[str, Any]:
    """
    Calculate transparent recommended rotation rounds based on category and roster size.

    Open / Men's / Women's Scramble:
    - 4-player court provides 3 partner slots per round.
    - Total possible partners = N - 1.
    - Theoretical round requirement = ceil((N - 1) / 3).

    Mixed Scramble:
    - 4-player court (2 men + 2 women) provides 2 mixed partner slots per round.
    - Total possible partners of other gender = N / 2 (assuming balanced roster).
    - Theoretical round requirement = ceil((N / 2) / 2) = ceil(N / 4).
    """
    import math

    is_mixed = division == "Mixed Scramble"

    if player_count < 4:
        return {
            "recommended_rounds": 3,
            "partner_slots_per_round": 2 if is_mixed else 3,
            "possible_partners_per_player": max(1, player_count - 1),
            "expected_total_games": 3,
            "reason": "Minimum 4 players required to form official Scramble courts.",
        }

    if is_mixed:
        opposite_gender_partners = max(1, player_count // 2)
        partner_slots = 2
        raw_rounds = math.ceil(opposite_gender_partners / partner_slots)
        recommended = max(2, min(raw_rounds, 8))
        courts = courts_count or (player_count // 4)
        expected_games = courts * 2 * recommended
        reason = (
            f"Based on {player_count} players in Mixed Scramble (2M + 2F courts): "
            f"Each player has {opposite_gender_partners} possible partners of the opposite gender. "
            f"With 2 partner slots per round, {recommended} rounds provide {recommended * 2} partner slots "
            f"to optimize partner rotation across the roster."
        )
        return {
            "recommended_rounds": recommended,
            "partner_slots_per_round": partner_slots,
            "possible_partners_per_player": opposite_gender_partners,
            "expected_total_games": expected_games,
            "reason": reason,
        }
    else:
        possible_partners = max(1, player_count - 1)
        partner_slots = 3
        raw_rounds = math.ceil(possible_partners / partner_slots)
        recommended = max(3, min(raw_rounds, 8))
        c4 = player_count // 4
        expected_games = c4 * 3 * recommended
        reason = (
            f"Based on {player_count} players in {division or 'Open Scramble'}: "
            f"Each player has {possible_partners} possible partners. "
            f"With 3 partner slots per round, {recommended} rounds provide {recommended * 3} partner slots "
            f"to optimize partner rotation across the field."
        )
        return {
            "recommended_rounds": recommended,
            "partner_slots_per_round": partner_slots,
            "possible_partners_per_player": possible_partners,
            "expected_total_games": expected_games,
            "reason": reason,
        }


def calculate_overall_coverage(
    players: list[dict[str, Any]],
    matches: list[dict[str, Any]],
    division: str | None = None,
) -> dict[str, Any]:
    """
    Measure actual partner and opponent coverage across all generated/played matches.
    Never claims everyone played with or faced everyone unless verified from actual matchups.
    """
    import math

    if not players:
        return {
            "avg_unique_partners": 0.0,
            "total_repeat_partner_pairs": 0,
            "avg_unique_opponents": 0.0,
            "total_repeat_opponent_pairs": 0,
            "all_partners_covered": False,
            "quality_claim": "No players registered",
            "total_possible_partners_per_player": 0,
        }

    is_mixed = division == "Mixed Scramble"
    player_ids = [str(p.get("id") or p.get("player_membership_id")) for p in players]

    # Map player to gender if mixed
    gender_map = {
        str(p.get("id") or p.get("player_membership_id")): (p.get("gender") or "Any").lower()
        for p in players
    }

    # Tracking actual partner pairings and opponent encounters
    partner_pair_counts: dict[tuple[str, str], int] = {}
    opponent_pair_counts: dict[tuple[str, str], int] = {}
    player_partner_sets: dict[str, set[str]] = {pid: set() for pid in player_ids}
    player_opponent_sets: dict[str, set[str]] = {pid: set() for pid in player_ids}

    for m in matches:
        sa_raw = m.get("side_a") or m.get("side_a_player_ids") or []
        sb_raw = m.get("side_b") or m.get("side_b_player_ids") or []

        sa_ids = [str(p["id"]) if isinstance(p, dict) and "id" in p else str(p) for p in sa_raw]
        sb_ids = [str(p["id"]) if isinstance(p, dict) and "id" in p else str(p) for p in sb_raw]

        # Partner on Side A
        if len(sa_ids) == 2:
            p1, p2 = sa_ids[0], sa_ids[1]
            if p1 in player_partner_sets and p2 in player_partner_sets:
                pair = tuple(sorted([p1, p2]))
                partner_pair_counts[pair] = partner_pair_counts.get(pair, 0) + 1
                player_partner_sets[p1].add(p2)
                player_partner_sets[p2].add(p1)

        # Partner on Side B
        if len(sb_ids) == 2:
            p1, p2 = sb_ids[0], sb_ids[1]
            if p1 in player_partner_sets and p2 in player_partner_sets:
                pair = tuple(sorted([p1, p2]))
                partner_pair_counts[pair] = partner_pair_counts.get(pair, 0) + 1
                player_partner_sets[p1].add(p2)
                player_partner_sets[p2].add(p1)

        # Opponents across Side A and Side B
        for a in sa_ids:
            for b in sb_ids:
                if a in player_opponent_sets and b in player_opponent_sets:
                    opair = tuple(sorted([a, b]))
                    opponent_pair_counts[opair] = opponent_pair_counts.get(opair, 0) + 1
                    player_opponent_sets[a].add(b)
                    player_opponent_sets[b].add(a)

    repeat_partner_pairs = sum(1 for count in partner_pair_counts.values() if count > 1)
    repeat_opponent_pairs = sum(1 for count in opponent_pair_counts.values() if count > 1)

    unique_partner_counts = [len(partners) for partners in player_partner_sets.values()]
    unique_opponent_counts = [len(opps) for opps in player_opponent_sets.values()]

    avg_partners = round(sum(unique_partner_counts) / len(player_ids), 1) if player_ids else 0.0
    avg_opponents = round(sum(unique_opponent_counts) / len(player_ids), 1) if player_ids else 0.0

    # Possible partners definition
    if is_mixed:
        total_possible = max(1, len(player_ids) // 2)
    else:
        total_possible = max(1, len(player_ids) - 1)

    all_covered = len(matches) > 0 and all(len(s) >= total_possible for s in player_partner_sets.values())

    if len(matches) == 0:
        quality_claim = "Matchups not yet generated"
    elif all_covered and repeat_partner_pairs == 0:
        quality_claim = "Full unique-partner coverage verified (0 repeats)"
    elif all_covered:
        quality_claim = f"Full unique-partner coverage achieved ({repeat_partner_pairs} repeat partner pair(s))"
    elif repeat_partner_pairs == 0:
        quality_claim = "Partner rotation active (0 partner repeats so far)"
    else:
        quality_claim = f"Partner rotation active ({repeat_partner_pairs} repeat partner pair(s))"

    return {
        "avg_unique_partners": avg_partners,
        "total_possible_partners_per_player": total_possible,
        "total_repeat_partner_pairs": repeat_partner_pairs,
        "avg_unique_opponents": avg_opponents,
        "total_repeat_opponent_pairs": repeat_opponent_pairs,
        "all_partners_covered": all_covered,
        "quality_claim": quality_claim,
    }

