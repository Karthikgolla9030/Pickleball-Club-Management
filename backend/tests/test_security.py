"""
Test: Security Utilities
Password hashing and JWT token behavior.
"""
from __future__ import annotations

import time

import pytest
from jose import JWTError

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)


def test_password_hashing_does_not_store_plaintext():
    """Password hash must not contain the plaintext password."""
    hashed = hash_password("mysecretpassword")
    assert "mysecretpassword" not in hashed
    assert hashed.startswith("$2b$") or hashed.startswith("$2a$")


def test_password_verification_correct():
    """Correct password verifies successfully."""
    plain = "correct_password_123"
    hashed = hash_password(plain)
    assert verify_password(plain, hashed) is True


def test_password_verification_incorrect():
    """Wrong password fails verification."""
    hashed = hash_password("correct_password")
    assert verify_password("wrong_password", hashed) is False


def test_access_token_creation_and_decoding():
    """Access token can be decoded to recover the user ID."""
    user_id = "123e4567-e89b-12d3-a456-426614174000"
    token = create_access_token(user_id)
    decoded_id = decode_access_token(token)
    assert decoded_id == user_id


def test_refresh_token_is_different_from_access_token():
    """Refresh tokens have a different type than access tokens."""
    user_id = "test-user-id"
    access = create_access_token(user_id)
    refresh = create_refresh_token(user_id)
    assert access != refresh


def test_access_token_rejected_as_refresh():
    """An access token cannot be used where a refresh token is expected."""
    user_id = "test-user-id"
    access_token = create_access_token(user_id)
    with pytest.raises(JWTError):
        decode_refresh_token(access_token)


def test_refresh_token_rejected_as_access():
    """A refresh token cannot be used where an access token is expected."""
    user_id = "test-user-id"
    refresh_token = create_refresh_token(user_id)
    with pytest.raises(JWTError):
        decode_access_token(refresh_token)


def test_tampered_token_rejected():
    """A modified token is rejected."""
    token = create_access_token("user-id")
    tampered = token[:-5] + "XXXXX"
    with pytest.raises(JWTError):
        decode_access_token(tampered)
