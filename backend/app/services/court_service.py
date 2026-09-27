"""
Aught2 Pickleball — Court Service (Phase 10)

Business logic layer for Court operations. Enforces tenant isolation, permissions,
uniqueness constraints, deterministic ordering, and lifecycle transitions.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.court import Court, CourtStatus
from app.repositories.club_repository import ClubRepository
from app.repositories.court_repository import CourtRepository
from app.schemas.court import (
    CourtCreateRequest,
    CourtReorderRequest,
    CourtUpdateRequest,
)


class CourtService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.court_repo = CourtRepository(db)
        self.club_repo = ClubRepository(db)

    async def _require_club(self, club_id: UUID) -> None:
        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )
        if not club.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Club is inactive",
            )

    async def create_court(self, club_id: UUID, payload: CourtCreateRequest) -> Court:
        """
        Create a new court for the specified club.
        Validates duplicate names, court numbers within the club, and price rules.
        """
        await self._require_club(club_id)

        # Check court_number uniqueness within the club
        if payload.court_number is not None:
            existing = await self.court_repo.get_by_court_number(club_id, payload.court_number)
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Court number {payload.court_number} already exists in this club",
                )

        # Check name uniqueness within the club
        existing_name = await self.court_repo.get_by_name(club_id, payload.name)
        if existing_name:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A court named '{payload.name.strip()}' already exists in this club",
            )

        # Validate price_per_hour if provided
        validated_price = None
        if payload.price_per_hour is not None:
            if payload.price_per_hour < 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Court price cannot be negative",
                )
            # Max 2 decimal places
            validated_price = Decimal(str(payload.price_per_hour)).quantize(Decimal("0.01"))

        # Calculate display_order if not provided
        if payload.display_order is None:
            max_order = await self.court_repo.get_max_display_order(club_id)
            display_order = max_order + 1
        else:
            display_order = payload.display_order

        # Synchronize status and is_active
        if payload.status == CourtStatus.INACTIVE or not payload.is_active:
            final_status = CourtStatus.INACTIVE
            final_is_active = False
        else:
            final_status = CourtStatus.ACTIVE
            final_is_active = True

        return await self.court_repo.create(
            club_id=club_id,
            name=payload.name,
            display_name=payload.display_name,
            description=payload.description,
            court_number=payload.court_number,
            surface_type=payload.surface_type,
            indoor_outdoor=payload.indoor_outdoor,
            status=final_status,
            is_active=final_is_active,
            display_order=display_order,
            price_per_hour=validated_price,
        )

    async def get_court(self, club_id: UUID, court_id: UUID) -> Court:
        """
        Retrieve court details with strict tenant isolation.
        Raises 404 if court not found or belongs to another club.
        """
        await self._require_club(club_id)
        court = await self.court_repo.get_by_id(court_id, club_id=club_id)
        if not court:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Court not found in this club",
            )
        return court

    async def list_courts(self, club_id: UUID, status_filter: str | None = "all") -> list[Court]:
        """
        Staff court listing with optional active/inactive filtering.
        """
        await self._require_club(club_id)

        is_active: bool | None = None
        if status_filter == "active":
            is_active = True
        elif status_filter == "inactive":
            is_active = False
        elif status_filter == "all" or status_filter is None:
            is_active = None
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid status filter. Must be 'active', 'inactive', or 'all'.",
            )

        return await self.court_repo.list_by_club(club_id, is_active=is_active)

    async def list_active_courts(self, club_id: UUID) -> list[Court]:
        """
        Player-facing court listing: strictly active courts only.
        """
        await self._require_club(club_id)
        return await self.court_repo.list_by_club(club_id, is_active=True)

    async def update_court(self, club_id: UUID, court_id: UUID, payload: CourtUpdateRequest) -> Court:
        """
        Update court information. Prevents club_id mutation and validates duplicates.
        """
        court = await self.get_court(club_id, court_id)

        update_data = payload.model_dump(exclude_unset=True)
        # Forbid changing club_id
        update_data.pop("club_id", None)

        # Validate court_number uniqueness if being changed
        new_number = update_data.get("court_number")
        if new_number is not None and new_number != court.court_number:
            existing = await self.court_repo.get_by_court_number(club_id, new_number)
            if existing and existing.id != court.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Court number {new_number} already exists in this club",
                )

        # Validate name uniqueness if being changed
        new_name = update_data.get("name")
        if new_name is not None and new_name.strip().lower() != court.name.lower():
            existing = await self.court_repo.get_by_name(club_id, new_name)
            if existing and existing.id != court.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"A court named '{new_name.strip()}' already exists in this club",
                )

        # Validate price_per_hour if being changed
        if "price_per_hour" in update_data:
            val = update_data["price_per_hour"]
            if val is not None:
                if val < 0:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Court price cannot be negative",
                    )
                update_data["price_per_hour"] = Decimal(str(val)).quantize(Decimal("0.01"))

        # Synchronize status and is_active if either is modified
        if "status" in update_data or "is_active" in update_data:
            if "status" in update_data:
                status_val = update_data["status"]
                update_data["is_active"] = (status_val == CourtStatus.ACTIVE)
            else:
                active_val = update_data["is_active"]
                update_data["status"] = CourtStatus.ACTIVE if active_val else CourtStatus.INACTIVE

        return await self.court_repo.update(court, **update_data)

    async def deactivate_court(self, club_id: UUID, court_id: UUID) -> Court:
        """
        Soft-deactivate court. Never hard-deletes so future booking records remain intact.
        """
        court = await self.get_court(club_id, court_id)
        return await self.court_repo.update(court, is_active=False, status=CourtStatus.INACTIVE)

    async def reactivate_court(self, club_id: UUID, court_id: UUID) -> Court:
        """
        Reactivate an inactive court, restoring its player visibility.
        """
        court = await self.get_court(club_id, court_id)
        return await self.court_repo.update(court, is_active=True, status=CourtStatus.ACTIVE)

    async def reorder_courts(self, club_id: UUID, payload: CourtReorderRequest) -> list[Court]:
        """
        Reorder all courts in the club in a single transaction.
        Validates that all court IDs belong to the club with no duplicates or missing courts.
        """
        await self._require_club(club_id)
        court_ids = payload.court_ids

        # Check duplicate IDs in payload
        if len(court_ids) != len(set(court_ids)):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Duplicate court IDs provided in reorder list",
            )

        existing_courts = await self.court_repo.list_by_club(club_id)
        existing_ids = {c.id for c in existing_courts}
        payload_ids_set = set(court_ids)

        # Check for foreign IDs
        foreign_ids = payload_ids_set - existing_ids
        if foreign_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="One or more court IDs do not belong to this club",
            )

        # Check for missing courts (all club courts must be present in reorder)
        if len(payload_ids_set) != len(existing_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Reorder list must contain all {len(existing_ids)} courts for this club (got {len(court_ids)})",
            )

        return await self.court_repo.reorder(club_id, court_ids)
