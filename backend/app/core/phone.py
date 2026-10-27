"""
Aught2 Pickleball — Phone Number Normalization and Validation Utilities
"""
from __future__ import annotations

import phonenumbers


def normalize_phone_number(v: str | None, default_region: str = "US", raise_on_invalid: bool = False) -> str | None:
    """
    Normalizes a phone number to standard E.164 format (e.g. +14155550132, +919876543210).
    - If empty, returns None.
    - If international or valid national number, returns E.164 string.
    - If parsing cannot resolve, raises ValueError if raise_on_invalid=True, else preserves the stripped string safely.
    """
    if v is None:
        return None
    cleaned = v.strip()
    if not cleaned:
        return None
    try:
        region = None if cleaned.startswith("+") else default_region
        parsed = phonenumbers.parse(cleaned, region)
        if phonenumbers.is_possible_number(parsed):
            return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except Exception as exc:
        if raise_on_invalid:
            raise ValueError(f"Invalid phone number: {cleaned}") from exc
    if raise_on_invalid:
        raise ValueError(f"Invalid phone number: {cleaned}")
    return cleaned[:50]


def is_valid_phone_number(v: str | None, default_region: str = "US") -> bool:
    """Returns True if the given string is a valid phone number."""
    if not v or not v.strip():
        return False
    try:
        cleaned = v.strip()
        region = None if cleaned.startswith("+") else default_region
        parsed = phonenumbers.parse(cleaned, region)
        return phonenumbers.is_valid_number(parsed)
    except Exception:
        return False
