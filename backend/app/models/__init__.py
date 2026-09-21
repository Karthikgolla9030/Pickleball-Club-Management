"""
Models package — import all models here so Alembic can discover them
for autogenerate migrations.
"""
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.user import User

__all__ = ["User", "Club", "ClubMembership", "ClubRole"]
