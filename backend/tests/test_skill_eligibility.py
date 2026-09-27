"""
Aught2 Pickleball — Skill Level Eligibility Test Script
Tests Tournament creation schema validation & Player registration eligibility logic.
"""
from datetime import datetime, timezone, timedelta
import unittest
from uuid import uuid4

from pydantic import ValidationError
from app.schemas.tournament import (
    TournamentBase,
    validate_skill_level_config,
)


def check_eligibility(format_config, caller_rating, partner_rating=None, is_doubles=False):
    skill_mode = format_config.get("skill_level_mode")
    min_skill_raw = format_config.get("min_skill_level")
    max_skill_raw = format_config.get("max_skill_level")
    skill_raw = format_config.get("skill_level")

    if not skill_mode:
        if min_skill_raw is not None and max_skill_raw is not None and str(min_skill_raw) != str(max_skill_raw):
            skill_mode = "range"
        elif skill_raw and ("-" in str(skill_raw) or "–" in str(skill_raw)):
            skill_mode = "range"
        elif skill_raw or min_skill_raw:
            skill_mode = "single"

    if skill_mode:
        if min_skill_raw is None or max_skill_raw is None:
            if skill_raw and ("-" in str(skill_raw) or "–" in str(skill_raw)):
                parts = str(skill_raw).replace("–", "-").split("-")
                min_skill_raw = min_skill_raw or parts[0].strip()
                max_skill_raw = max_skill_raw or parts[1].strip()
            elif skill_raw:
                min_skill_raw = min_skill_raw or skill_raw
                max_skill_raw = max_skill_raw or skill_raw

    if skill_mode and min_skill_raw is not None and max_skill_raw is not None:
        min_skill_val = float(min_skill_raw)
        max_skill_val = float(max_skill_raw)

        if not is_doubles:
            if skill_mode == "single":
                if caller_rating != min_skill_val:
                    return False, f"Tournament requires skill level {min_skill_val:.1f}. Your rating ({caller_rating:.1f}) does not meet the eligibility requirement."
            else:
                if caller_rating < min_skill_val or caller_rating > max_skill_val:
                    return False, f"Tournament requires skill level between {min_skill_val:.1f} and {max_skill_val:.1f}. Your rating ({caller_rating:.1f}) does not meet the eligibility requirement."
        else:
            team_rating = round((caller_rating + (partner_rating or 3.5)) / 2.0, 2)
            if skill_mode == "single":
                if caller_rating != min_skill_val or (partner_rating and partner_rating != min_skill_val) or team_rating != min_skill_val:
                    return False, f"Tournament requires skill level {min_skill_val:.1f}."
            else:
                if caller_rating < min_skill_val or caller_rating > max_skill_val:
                    return False, "Caller out of range"
                if partner_rating and (partner_rating < min_skill_val or partner_rating > max_skill_val):
                    return False, "Partner out of range"
                if team_rating < min_skill_val or team_rating > max_skill_val:
                    return False, "Team average out of range"

    return True, "Eligible"


class TestSkillEligibility(unittest.TestCase):

    def test_single_level_config_validation(self):
        cfg = {"category": "Singles", "skill_level_mode": "single", "skill_level": "3.5"}
        res = validate_skill_level_config(cfg)
        self.assertEqual(res["skill_level_mode"], "single")
        self.assertEqual(res["min_skill_level"], "3.5")
        self.assertEqual(res["max_skill_level"], "3.5")
        self.assertEqual(res["skill_level"], "3.5")

    def test_range_level_config_validation(self):
        cfg = {
            "category": "Singles",
            "skill_level_mode": "range",
            "min_skill_level": "3.5",
            "max_skill_level": "4.5",
        }
        res = validate_skill_level_config(cfg)
        self.assertEqual(res["skill_level_mode"], "range")
        self.assertEqual(res["min_skill_level"], "3.5")
        self.assertEqual(res["max_skill_level"], "4.5")
        self.assertEqual(res["skill_level"], "3.5-4.5")

    def test_backward_compatibility_hyphenated_skill_level(self):
        cfg = {"category": "Singles", "skill_level": "3.0-4.0"}
        res = validate_skill_level_config(cfg)
        self.assertEqual(res["skill_level_mode"], "range")
        self.assertEqual(res["min_skill_level"], "3.0")
        self.assertEqual(res["max_skill_level"], "4.0")
        self.assertEqual(res["skill_level"], "3.0-4.0")

    def test_backward_compatibility_single_skill_level(self):
        cfg = {"category": "Singles", "skill_level": "4.0"}
        res = validate_skill_level_config(cfg)
        self.assertEqual(res["skill_level_mode"], "single")
        self.assertEqual(res["min_skill_level"], "4.0")
        self.assertEqual(res["max_skill_level"], "4.0")
        self.assertEqual(res["skill_level"], "4.0")

    def test_range_validation_min_greater_than_max(self):
        cfg = {
            "category": "Singles",
            "skill_level_mode": "range",
            "min_skill_level": "4.5",
            "max_skill_level": "3.5",
        }
        with self.assertRaises(ValueError) as ctx:
            validate_skill_level_config(cfg)
        self.assertIn("less than or equal to maximum", str(ctx.exception))

    def test_range_validation_invalid_skill_level(self):
        cfg = {
            "category": "Singles",
            "skill_level_mode": "range",
            "min_skill_level": "1.0",
            "max_skill_level": "4.5",
        }
        with self.assertRaises(ValueError) as ctx:
            validate_skill_level_config(cfg)
        self.assertIn("Minimum skill level must be one of", str(ctx.exception))

    def test_range_validation_missing_bounds(self):
        cfg = {
            "category": "Singles",
            "skill_level_mode": "range",
        }
        with self.assertRaises(ValueError) as ctx:
            validate_skill_level_config(cfg)
        self.assertIn("Both min_skill_level and max_skill_level are required", str(ctx.exception))

    def test_tournament_base_schema_with_skill_range(self):
        now = datetime.now(timezone.utc)
        payload = {
            "name": "Summer Open Range Championship",
            "format": "round_robin",
            "start_date": now + timedelta(days=10),
            "end_date": now + timedelta(days=11),
            "registration_open_at": now,
            "registration_close_at": now + timedelta(days=7),
            "format_configuration": {
                "category": "Singles",
                "skill_level_mode": "range",
                "min_skill_level": "3.5",
                "max_skill_level": "4.5",
                "registration_type": "individual",
            }
        }
        t = TournamentBase(**payload)
        self.assertEqual(t.format_configuration["skill_level_mode"], "range")
        self.assertEqual(t.format_configuration["min_skill_level"], "3.5")
        self.assertEqual(t.format_configuration["max_skill_level"], "4.5")
        self.assertEqual(t.format_configuration["skill_level"], "3.5-4.5")

    def test_tournament_base_schema_rejects_invalid_range(self):
        now = datetime.now(timezone.utc)
        payload = {
            "name": "Invalid Range Tournament",
            "format": "round_robin",
            "start_date": now + timedelta(days=10),
            "end_date": now + timedelta(days=11),
            "registration_open_at": now,
            "registration_close_at": now + timedelta(days=7),
            "format_configuration": {
                "category": "Singles",
                "skill_level_mode": "range",
                "min_skill_level": "5.0",
                "max_skill_level": "3.0",
                "registration_type": "individual",
            }
        }
        with self.assertRaises(ValidationError) as ctx:
            TournamentBase(**payload)
        self.assertIn("less than or equal to maximum", str(ctx.exception))

    def test_registration_eligibility_singles_single_level(self):
        cfg = {"skill_level_mode": "single", "skill_level": "3.5", "min_skill_level": "3.5", "max_skill_level": "3.5"}
        # Caller 3.5 -> eligible
        ok, msg = check_eligibility(cfg, caller_rating=3.5)
        self.assertTrue(ok)

        # Caller 4.0 -> not eligible
        ok, msg = check_eligibility(cfg, caller_rating=4.0)
        self.assertFalse(ok)
        self.assertIn("does not meet the eligibility requirement", msg)

    def test_registration_eligibility_singles_range(self):
        cfg = {"skill_level_mode": "range", "min_skill_level": "3.5", "max_skill_level": "4.5", "skill_level": "3.5-4.5"}
        # Out of bounds below
        ok, msg = check_eligibility(cfg, caller_rating=3.0)
        self.assertFalse(ok)
        # Endpoints & in-range
        self.assertTrue(check_eligibility(cfg, caller_rating=3.5)[0])
        self.assertTrue(check_eligibility(cfg, caller_rating=4.0)[0])
        self.assertTrue(check_eligibility(cfg, caller_rating=4.5)[0])
        # Out of bounds above
        ok, msg = check_eligibility(cfg, caller_rating=5.0)
        self.assertFalse(ok)

    def test_registration_eligibility_doubles_range(self):
        cfg = {"skill_level_mode": "range", "min_skill_level": "3.5", "max_skill_level": "4.5", "skill_level": "3.5-4.5"}
        # Both in range (3.5 and 4.5 -> avg 4.0)
        self.assertTrue(check_eligibility(cfg, caller_rating=3.5, partner_rating=4.5, is_doubles=True)[0])
        # Partner out of range (caller 3.5, partner 3.0 -> avg 3.25)
        self.assertFalse(check_eligibility(cfg, caller_rating=3.5, partner_rating=3.0, is_doubles=True)[0])


if __name__ == "__main__":
    unittest.main()
