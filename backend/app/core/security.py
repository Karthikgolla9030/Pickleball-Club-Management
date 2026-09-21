"""
Aught2 Pickleball — Security Utilities
Password hashing and JWT token creation/verification.
Passwords are NEVER stored in plaintext.
Tokens are NEVER trusted from the frontend for authorization.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings

# ─── Password Hashing ────────────────────────────────────────────────────────────


def hash_password(plain_password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    password_bytes = plain_password.encode("utf-8")
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a stored bcrypt hash."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False


# ─── JWT Tokens ──────────────────────────────────────────────────────────────

def _create_token(
    subject: str,
    token_type: str,
    expires_delta: timedelta,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expire = now + expires_delta

    payload: dict[str, Any] = {
        "sub": subject,       # user id (string)
        "type": token_type,   # "access" or "refresh"
        "iat": now,
        "exp": expire,
    }
    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def create_access_token(user_id: str) -> str:
    """Create a short-lived access token."""
    settings = get_settings()
    return _create_token(
        subject=user_id,
        token_type="access",
        expires_delta=timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(user_id: str) -> str:
    """Create a long-lived refresh token."""
    settings = get_settings()
    return _create_token(
        subject=user_id,
        token_type="refresh",
        expires_delta=timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
    )


def decode_token(token: str) -> dict[str, Any]:
    """
    Decode and validate a JWT token.
    Raises JWTError if the token is invalid, expired, or tampered.
    """
    settings = get_settings()
    return jwt.decode(
        token,
        settings.JWT_SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],
    )


def decode_access_token(token: str) -> str:
    """
    Decode an access token and return the user_id (subject).
    Raises JWTError if invalid or if token type is not 'access'.
    """
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise JWTError("Invalid token type: expected access token")
    sub = payload.get("sub")
    if not sub:
        raise JWTError("Token missing subject claim")
    return sub


def decode_refresh_token(token: str) -> str:
    """
    Decode a refresh token and return the user_id (subject).
    Raises JWTError if invalid or if token type is not 'refresh'.
    """
    payload = decode_token(token)
    if payload.get("type") != "refresh":
        raise JWTError("Invalid token type: expected refresh token")
    sub = payload.get("sub")
    if not sub:
        raise JWTError("Token missing subject claim")
    return sub
