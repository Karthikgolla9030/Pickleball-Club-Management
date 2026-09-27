"""
Aught2 Pickleball — Pickleball Score Validator (Phase 5)

Validates pickleball match scores according to the tournament's scoring_rules.

Default rules:
  game_format : "single_game"
  target_score: 11
  win_by      : 2

Validity conditions (pickleball single-game):
  1. Both scores must be non-negative integers.
  2. Scores cannot be equal.
  3. The winning score must be >= target_score.
  4. The winner must lead by >= win_by points.
  5. Exactly one winner is derived — the client never provides winner_team_id.

Examples (target=11, win_by=2):
  11-0  → valid
  12-10 → valid
  15-13 → valid
  11-10 → INVALID (margin only 1)
  11-9  → INVALID (margin only 2... wait, 11-9 = 2, IS valid)
  10-8  → INVALID (winning score < 11)
  0-0   → INVALID (equal)
  -1-5  → INVALID (negative)
"""
from __future__ import annotations


class ScoreValidationError(ValueError):
    """Raised when a match score fails validation."""


def validate_score(
    score_a: int,
    score_b: int,
    *,
    target_score: int = 11,
    win_by: int = 2,
) -> str:
    """
    Validate a pickleball match score pair.

    Args:
        score_a: Score for team A (non-negative integer).
        score_b: Score for team B (non-negative integer).
        target_score: Minimum winning score (default 11).
        win_by: Minimum winning margin (default 2).

    Returns:
        "a" if team A wins, "b" if team B wins.

    Raises:
        ScoreValidationError: If the score pair is invalid.
    """
    if score_a < 0 or score_b < 0:
        raise ScoreValidationError(
            "Scores must be non-negative integers"
        )

    if score_a == score_b:
        raise ScoreValidationError(
            "Scores cannot be equal — there must be exactly one winner"
        )

    high = max(score_a, score_b)
    low = min(score_a, score_b)
    margin = high - low

    if high < target_score:
        raise ScoreValidationError(
            f"Winning score must be at least {target_score} "
            f"(got {high}-{low})"
        )

    if margin < win_by:
        raise ScoreValidationError(
            f"Winner must lead by at least {win_by} points "
            f"(got {high}-{low}, margin={margin})"
        )

    return "a" if score_a > score_b else "b"


def derive_winner_side(
    score_a: int,
    score_b: int,
    scoring_rules: dict,
) -> str:
    """
    Validate scores using tournament scoring_rules and return winner side.

    Args:
        score_a: Team A score.
        score_b: Team B score.
        scoring_rules: dict with keys target_score and win_by.

    Returns:
        "a" if team A wins, "b" if team B wins.

    Raises:
        ScoreValidationError: If invalid.
    """
    target = scoring_rules.get("target_score", 11)
    win_by = scoring_rules.get("win_by", 2)
    return validate_score(score_a, score_b, target_score=target, win_by=win_by)
