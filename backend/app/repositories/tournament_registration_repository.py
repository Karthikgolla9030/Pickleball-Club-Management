"""
Aught2 Pickleball — Tournament Registration Repository

Database queries for TournamentRegistration entity.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.club_player_membership import ClubPlayerMembership
from app.models.tournament_registration import (
    RegistrationStatus,
    TournamentRegistration,
)
from app.models.user import User


class TournamentRegistrationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, registration_id: UUID) -> TournamentRegistration | None:
        """Fetch registration by ID with player membership and user details."""
        query = (
            select(TournamentRegistration)
            .where(TournamentRegistration.id == registration_id)
            .options(
                selectinload(TournamentRegistration.tournament),
                selectinload(TournamentRegistration.player_membership).selectinload(
                    ClubPlayerMembership.user
                ).selectinload(User.player_profile),
            )
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_tournament_and_player(
        self, tournament_id: UUID, player_membership_id: UUID
    ) -> TournamentRegistration | None:
        """Fetch registration by tournament ID and player membership ID."""
        query = (
            select(TournamentRegistration)
            .where(
                TournamentRegistration.tournament_id == tournament_id,
                TournamentRegistration.player_membership_id == player_membership_id,
            )
            .options(
                selectinload(TournamentRegistration.tournament),
                selectinload(TournamentRegistration.player_membership).selectinload(
                    ClubPlayerMembership.user
                ).selectinload(User.player_profile),
            )
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_by_tournament(
        self, tournament_id: UUID
    ) -> list[TournamentRegistration]:
        """List all registrations for a tournament."""
        query = (
            select(TournamentRegistration)
            .where(TournamentRegistration.tournament_id == tournament_id)
            .options(
                selectinload(TournamentRegistration.player_membership).selectinload(
                    ClubPlayerMembership.user
                ).selectinload(User.player_profile),
            )
            .order_by(TournamentRegistration.registered_at.asc())
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def count_active_participants(self, tournament_id: UUID) -> int:
        """Count confirmed registrations for a tournament."""
        query = (
            select(func.count(TournamentRegistration.id))
            .where(
                TournamentRegistration.tournament_id == tournament_id,
                TournamentRegistration.status == RegistrationStatus.CONFIRMED,
            )
        )
        result = await self.db.execute(query)
        return result.scalar_one() or 0

    async def create(
        self,
        tournament_id: UUID,
        player_membership_id: UUID,
        status: RegistrationStatus = RegistrationStatus.CONFIRMED,
        seed: int | None = None,
        notes: str | None = None,
    ) -> TournamentRegistration:
        """Create a new tournament registration."""
        reg = TournamentRegistration(
            tournament_id=tournament_id,
            player_membership_id=player_membership_id,
            status=status,
            seed=seed,
            notes=notes,
            registered_at=datetime.now(timezone.utc),
        )
        self.db.add(reg)
        await self.db.flush()
        return await self.get_by_id(reg.id)  # type: ignore

    async def update(
        self, registration: TournamentRegistration, **fields
    ) -> TournamentRegistration:
        """Update fields on a registration."""
        for field, value in fields.items():
            setattr(registration, field, value)

        await self.db.flush()
        return registration
