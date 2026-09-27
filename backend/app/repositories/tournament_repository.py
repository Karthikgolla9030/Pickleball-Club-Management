"""
Aught2 Pickleball — Tournament Repository

Database queries for Tournament entity.
Enforces strict club-scoped tenant isolation.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.club import Club
from app.models.tournament import (
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)


class TournamentRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(
        self, tournament_id: UUID, club_id: UUID | None = None
    ) -> Tournament | None:
        """
        Fetch tournament by ID with all related data (club + registrations).
        If club_id is provided, strictly enforces tenant isolation.
        """
        query = (
            select(Tournament)
            .where(Tournament.id == tournament_id)
            .options(
                selectinload(Tournament.club),
                selectinload(Tournament.registrations),
            )
        )
        if club_id is not None:
            query = query.where(Tournament.club_id == club_id)

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_id_for_update(
        self, tournament_id: UUID, club_id: UUID | None = None
    ) -> Tournament | None:
        """
        Fetch tournament by ID with row lock (with_for_update) for safe concurrent writes.
        Prevents overbooking and race conditions during registration.
        """
        query = (
            select(Tournament)
            .where(Tournament.id == tournament_id)
            .with_for_update()
            .options(
                selectinload(Tournament.club),
                selectinload(Tournament.registrations),
            )
        )
        if club_id is not None:
            query = query.where(Tournament.club_id == club_id)

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_id_minimal(
        self, tournament_id: UUID, club_id: UUID | None = None
    ) -> Tournament | None:
        """
        Fetch tournament by ID loading only club relationship (not registrations).
        Use this in write operations (score saving, match generation, etc.) where
        the registration list is not needed, to avoid loading potentially large
        registration collections unnecessarily.
        """
        query = (
            select(Tournament)
            .where(Tournament.id == tournament_id)
            .options(selectinload(Tournament.club))
        )
        if club_id is not None:
            query = query.where(Tournament.club_id == club_id)

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_by_club(
        self, club_id: UUID, status: TournamentStatus | None = None
    ) -> list[Tournament]:
        """
        List all tournaments for a given club, with optional status filter.
        """
        query = (
            select(Tournament)
            .where(Tournament.club_id == club_id)
            .options(
                selectinload(Tournament.club),
                selectinload(Tournament.registrations),
            )
            .order_by(Tournament.start_date.asc())
        )
        if status is not None:
            query = query.where(Tournament.status == status)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def list_public_discoverable(self) -> list[Tournament]:
        """
        List all public tournaments belonging to active clubs.
        Excludes private and cancelled tournaments.
        """
        query = (
            select(Tournament)
            .join(Tournament.club)
            .where(
                Tournament.visibility == TournamentVisibility.PUBLIC,
                Tournament.status != TournamentStatus.DRAFT,
                Tournament.status != TournamentStatus.CANCELLED,
                Club.is_active == True,  # noqa: E712
            )
            .options(
                selectinload(Tournament.club),
                selectinload(Tournament.registrations),
            )
            .order_by(Tournament.start_date.asc())
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create(
        self,
        club_id: UUID,
        created_by_user_id: UUID | None,
        name: str,
        description: str | None,
        format: TournamentFormat,
        visibility: TournamentVisibility,
        start_date: datetime,
        end_date: datetime,
        registration_open_at: datetime,
        registration_close_at: datetime,
        location_name: str | None = None,
        min_participants: int | None = None,
        max_participants: int | None = None,
        scoring_rules: dict | None = None,
        tiebreaker_rules: list | None = None,
        format_configuration: dict | None = None,
    ) -> Tournament:
        """Create a new tournament."""
        tournament = Tournament(
            club_id=club_id,
            created_by_user_id=created_by_user_id,
            name=name,
            description=description,
            status=TournamentStatus.DRAFT,
            format=format,
            visibility=visibility,
            start_date=start_date,
            end_date=end_date,
            registration_open_at=registration_open_at,
            registration_close_at=registration_close_at,
            location_name=location_name,
            min_participants=min_participants,
            max_participants=max_participants,
            format_configuration=format_configuration or {},
        )
        if scoring_rules is not None:
            tournament.scoring_rules = scoring_rules
        if tiebreaker_rules is not None:
            tournament.tiebreaker_rules = tiebreaker_rules

        self.db.add(tournament)
        await self.db.flush()
        # Refresh relationships
        return await self.get_by_id(tournament.id, club_id=club_id)  # type: ignore

    async def update(self, tournament: Tournament, **fields) -> Tournament:
        """Update fields on an existing tournament."""
        for field, value in fields.items():
            if value is not None:
                setattr(tournament, field, value)

        await self.db.flush()
        return tournament
