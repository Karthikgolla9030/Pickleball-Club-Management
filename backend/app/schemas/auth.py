"""
Authentication schemas.

The login request contains only email + password.
NEVER includes role — the backend determines role from ClubMembership.

The auth response includes:
  - access_token (short-lived)
  - refresh_token (long-lived)
  - user info
  - club memberships (so the client knows which club management experiences to show)
"""
from __future__ import annotations

import re
from pydantic import BaseModel, field_validator

from app.schemas.club_membership import MembershipInfo
from app.schemas.user import UserResponse

_EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class LoginRequest(BaseModel):
    """
    Login request — email and password only.
    The client NEVER specifies a role. Backend is authoritative.
    """
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_REGEX.match(v):
            raise ValueError("Invalid email address format")
        return v


class ClubLoginRequest(LoginRequest):
    """Club management login — email and password only."""
    pass


class PlayerLoginRequest(LoginRequest):
    """Player portal login — email and password only."""
    pass


class PlayerRegisterRequest(BaseModel):
    """Player self-registration request."""
    email: str
    password: str
    full_name: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL_REGEX.match(v):
            raise ValueError("Invalid email address format")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Full name cannot be empty")
        return v


class TokenRefreshRequest(BaseModel):
    refresh_token: str


class AuthResponse(BaseModel):
    """
    Authentication response returned on login and token refresh.

    access_token: Short-lived JWT (15 min default). Used for API calls.
    refresh_token: Long-lived JWT (30 days default). Used to get new access tokens.
    token_type: Always "bearer".
    user: User identity information.
    memberships: Club memberships with role — backend authoritative.
    """
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse
    memberships: list[MembershipInfo]


class TokenRefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
