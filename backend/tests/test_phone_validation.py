"""
Unit tests for backend phone number validation and normalization (E.164).
"""
import pytest
from app.core.phone import normalize_phone_number, is_valid_phone_number
from app.schemas.player_profile import PlayerProfileUpdate
from app.schemas.club import ClubUpdateRequest
from app.schemas.lesson import CoachCreateRequest

def test_normalize_valid_us_numbers():
    assert normalize_phone_number("(415) 555-0132", default_region="US") == "+14155550132"
    assert normalize_phone_number("+1 415 555 0132", default_region="US") == "+14155550132"
    assert normalize_phone_number("+14155550132", default_region="US") == "+14155550132"
    assert normalize_phone_number("415-555-0132", default_region="US") == "+14155550132"

def test_normalize_international_numbers():
    # India (+91)
    assert normalize_phone_number("+91 98765 43210") == "+919876543210"
    assert normalize_phone_number("9876543210", default_region="IN") == "+919876543210"

    # UK (+44)
    assert normalize_phone_number("+44 7911 123456") == "+447911123456"

    # Australia (+61)
    assert normalize_phone_number("+61 412 345 678") == "+61412345678"

def test_normalize_empty_and_null():
    assert normalize_phone_number(None) is None
    assert normalize_phone_number("") is None
    assert normalize_phone_number("   ") is None

def test_invalid_phone_raises_value_error():
    with pytest.raises(ValueError):
        normalize_phone_number("not-a-number", raise_on_invalid=True)

    with pytest.raises(ValueError):
        normalize_phone_number("123", raise_on_invalid=True)

def test_is_valid_phone_number():
    assert is_valid_phone_number("+14155550132") is True
    assert is_valid_phone_number("+919876543210") is True
    assert is_valid_phone_number("invalid") is False
    assert is_valid_phone_number(None) is False

def test_schemas_normalize_phone():
    # Player profile schema
    profile_req = PlayerProfileUpdate(phone="(415) 555-0132")
    assert profile_req.phone == "+14155550132"

    profile_intl = PlayerProfileUpdate(phone="+44 7911 123456")
    assert profile_intl.phone == "+447911123456"

    # Club update schema
    club_req = ClubUpdateRequest(contact_phone="+91 98765 43210")
    assert club_req.contact_phone == "+919876543210"

    # Coach create schema
    coach_req = CoachCreateRequest(name="Coach Jane", phone="+1 202 555 0199")
    assert coach_req.phone == "+12025550199"
