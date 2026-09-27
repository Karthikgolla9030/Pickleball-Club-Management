"""
Aught2 Pickleball — Tournament Service

Business logic for tournaments and tournament registrations.
Enforces club tenant isolation, lifecycle state transitions,
configuration locking rules, and player eligibility.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.club_player_membership import PlayerMembershipStatus
from app.models.tournament import (
    Tournament,
    TournamentFormat,
    TournamentStatus,
    TournamentVisibility,
)
from app.models.tournament_registration import (
    RegistrationStatus,
    TournamentRegistration,
)
from app.repositories.club_membership_repository import ClubMembershipRepository
from app.repositories.club_player_membership_repository import (
    ClubPlayerMembershipRepository,
)
from app.repositories.club_repository import ClubRepository
from app.repositories.competition_repository import CompetitionRepository
from app.repositories.tournament_registration_repository import (
    TournamentRegistrationRepository,
)
from app.repositories.tournament_repository import TournamentRepository
from app.schemas.tournament import (
    VALID_COMPETITION_CATEGORIES,
    VALID_SCRAMBLE_DIVISIONS,
    TournamentCreate,
    TournamentDiscoveryResponse,
    TournamentResponse,
    TournamentUpdate,
)
from app.schemas.tournament_registration import (
    EligiblePartnerResponse,
    PlayerSelfRegistrationRequest,
    PlayerSelfRegistrationResponse,
    PlayerTournamentRegistrationStatusResponse,
    TournamentRegistrationResponse,
    UpdateRegistrationRequest,
)
from app.core.events import EventType, dispatch_event
from app.services.notification_service import NotificationService


def _build_tournament_response(
    t: Tournament,
    participant_count: int | None = None,
    is_registered: bool = False,
    my_registration_id: UUID | None = None,
    my_registration_status: str | None = None,
) -> TournamentResponse:
    if participant_count is not None:
        count = participant_count
    else:
        try:
            from sqlalchemy.orm import attributes
            state = attributes.instance_state(t)
            if "registrations" in state.dict and state.dict["registrations"]:
                confirmed = [r for r in state.dict["registrations"] if r.status == RegistrationStatus.CONFIRMED]
                team_size = (t.format_configuration or {}).get("team_size", 1)
                is_scramble = t.format == TournamentFormat.SCRAMBLE
                if team_size == 2 and not is_scramble:
                    count = len(confirmed) // 2
                else:
                    count = len(confirmed)
            else:
                count = 0
        except Exception:
            count = 0
    return TournamentResponse(
        id=t.id,
        club_id=t.club_id,
        created_by_user_id=t.created_by_user_id,
        name=t.name,
        description=t.description,
        status=t.status,
        status_label=t.status.display_label,
        format=t.format,
        format_label=t.format.display_label,
        visibility=t.visibility,
        visibility_label=t.visibility.display_label,
        start_date=t.start_date,
        end_date=t.end_date,
        registration_open_at=t.registration_open_at,
        registration_close_at=t.registration_close_at,
        location_name=t.location_name,
        min_participants=t.min_participants,
        max_participants=t.max_participants,
        scoring_rules=t.scoring_rules,
        tiebreaker_rules=t.tiebreaker_rules,
        format_configuration=t.format_configuration,
        participant_count=count,
        created_at=t.created_at,
        updated_at=t.updated_at,
        is_registered=is_registered,
        my_registration_id=my_registration_id,
        my_registration_status=my_registration_status,
    )


def _build_registration_response(
    r: TournamentRegistration,
) -> TournamentRegistrationResponse:
    user = r.player_membership.user if r.player_membership else None
    profile = user.player_profile if user else None
    return TournamentRegistrationResponse(
        id=r.id,
        tournament_id=r.tournament_id,
        player_membership_id=r.player_membership_id,
        user_id=r.player_membership.user_id if r.player_membership else user.id,  # type: ignore
        user_email=user.email if user else "",
        user_full_name=user.full_name if user else None,
        display_name=profile.display_name if profile else (user.full_name if user else None),
        membership_number=r.player_membership.membership_number if r.player_membership else None,
        status=r.status,
        status_label=r.status.display_label,
        seed=r.seed,
        skill_rating=(
            float(profile.skill_rating)
            if profile and profile.skill_rating is not None
            else 3.5
        ),
        notes=r.notes,
        registered_at=r.registered_at,
        cancelled_at=r.cancelled_at,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


class TournamentService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.tournament_repo = TournamentRepository(db)
        self.registration_repo = TournamentRegistrationRepository(db)
        self.club_repo = ClubRepository(db)
        self.club_membership_repo = ClubMembershipRepository(db)
        self.player_membership_repo = ClubPlayerMembershipRepository(db)
        self.competition_repo = CompetitionRepository(db)

    async def _auto_close_registration_if_deadline_passed(
        self, tournament: Tournament
    ) -> Tournament:
        """If tournament is in registration_open and registration_close_at has passed, close registration."""
        if tournament.status == TournamentStatus.REGISTRATION_OPEN:
            now = datetime.now(timezone.utc)
            reg_close = (
                tournament.registration_close_at.replace(tzinfo=timezone.utc)
                if tournament.registration_close_at.tzinfo is None
                else tournament.registration_close_at
            )
            if reg_close <= now:
                try:
                    await self.close_registration(tournament.club_id, tournament.id)
                    refreshed = await self.tournament_repo.get_by_id(tournament.id, tournament.club_id)
                    if refreshed:
                        return refreshed
                except Exception:
                    pass
        return tournament

    # ─── Club-Scoped Tournament Management ─────────────────────────────────────

    async def list_club_tournaments(
        self, club_id: UUID, status_filter: TournamentStatus | None = None
    ) -> list[TournamentResponse]:
        """List all tournaments for a club."""
        tournaments = await self.tournament_repo.list_by_club(
            club_id=club_id, status=status_filter
        )
        updated_tournaments = []
        for t in tournaments:
            updated_t = await self._auto_close_registration_if_deadline_passed(t)
            updated_tournaments.append(updated_t)
        return [_build_tournament_response(t) for t in updated_tournaments]

    async def get_club_tournament(
        self, club_id: UUID, tournament_id: UUID
    ) -> TournamentResponse:
        """Get single tournament details enforcing club tenant isolation."""
        tournament = await self.tournament_repo.get_by_id(
            tournament_id=tournament_id, club_id=club_id
        )
        if not tournament:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found in this club",
            )
        tournament = await self._auto_close_registration_if_deadline_passed(tournament)
        return _build_tournament_response(tournament)

    async def get_tournament_by_id(
        self, tournament_id: UUID, current_user_id: UUID | None = None
    ) -> TournamentResponse:
        """Get single tournament by ID with visibility checks."""
        tournament = await self.tournament_repo.get_by_id(tournament_id=tournament_id)
        if not tournament:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found",
            )
        tournament = await self._auto_close_registration_if_deadline_passed(tournament)
        if tournament.visibility == TournamentVisibility.PRIVATE and current_user_id:
            player_mem = await self.player_membership_repo.get_by_user_and_club(
                user_id=current_user_id, club_id=tournament.club_id
            )
            staff_mem = await self.club_membership_repo.get_by_user_and_club(
                user_id=current_user_id, club_id=tournament.club_id
            )
            if not player_mem and not staff_mem:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Tournament not found",
                )
        is_reg = False
        reg_id = None
        reg_status = None
        if current_user_id:
            player_mem = await self.player_membership_repo.get_by_user_and_club(
                user_id=current_user_id, club_id=tournament.club_id
            )
            if player_mem:
                existing = await self.registration_repo.get_by_tournament_and_player(
                    tournament_id=tournament.id, player_membership_id=player_mem.id
                )
                if existing and existing.status in (
                    RegistrationStatus.CONFIRMED,
                    RegistrationStatus.PENDING,
                    RegistrationStatus.WAITLISTED,
                ):
                    is_reg = True
                    reg_id = existing.id
                    reg_status = existing.status.value

        return _build_tournament_response(
            tournament,
            is_registered=is_reg,
            my_registration_id=reg_id,
            my_registration_status=reg_status,
        )

    async def create_tournament(
        self,
        club_id: UUID,
        created_by_user_id: UUID | None,
        payload: TournamentCreate,
    ) -> TournamentResponse:
        """Create a new tournament in the club."""
        club = await self.club_repo.get_by_id(club_id)
        if not club:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Club not found",
            )

        format_config = dict(payload.format_configuration or {})
        if payload.format == TournamentFormat.SCRAMBLE:
            format_config["registration_type"] = "individual"
            format_config["team_size"] = 1
            cat = format_config.get("category")
            if not cat or cat not in VALID_SCRAMBLE_DIVISIONS:
                cat = "Open Scramble"
                format_config["category"] = cat
            if cat == "Men's Scramble":
                format_config["gender_eligibility"] = "Male"
            elif cat == "Women's Scramble":
                format_config["gender_eligibility"] = "Female"
            elif cat in ("Open Scramble", "Mixed Scramble"):
                format_config["gender_eligibility"] = "Any"
            raw_rounds = format_config.get("planned_rounds") or format_config.get("rounds")
            try:
                p_rounds = int(raw_rounds) if raw_rounds is not None else 5
            except (ValueError, TypeError):
                p_rounds = 5
            format_config["planned_rounds"] = max(1, min(20, p_rounds))
            format_config["rounds"] = format_config["planned_rounds"]
        elif format_config.get("category") == "Singles":
            format_config.setdefault("registration_type", "individual")
            format_config.setdefault("team_size", 1)
        elif format_config.get("category"):
            format_config.setdefault("registration_type", "team")
            format_config.setdefault("team_size", 2)

        tournament = await self.tournament_repo.create(
            club_id=club_id,
            created_by_user_id=created_by_user_id,
            name=payload.name,
            description=payload.description,
            format=payload.format,
            visibility=payload.visibility,
            start_date=payload.start_date,
            end_date=payload.end_date,
            registration_open_at=payload.registration_open_at,
            registration_close_at=payload.registration_close_at,
            location_name=payload.location_name,
            min_participants=payload.min_participants,
            max_participants=payload.max_participants,
            scoring_rules=payload.scoring_rules.model_dump() if payload.scoring_rules else None,
            tiebreaker_rules=payload.tiebreaker_rules,
            format_configuration=format_config if format_config else None,
        )
        await self.db.commit()
        resp = _build_tournament_response(tournament)
        try:
            await dispatch_event(
                event_type=EventType.TOURNAMENT_PUBLISHED,
                data={"tournament_id": str(tournament.id), "name": tournament.name, "status": tournament.status.value},
                club_id=club_id,
            )
        except Exception:
            pass
        return resp

    async def update_tournament(
        self,
        club_id: UUID,
        tournament_id: UUID,
        payload: TournamentUpdate,
    ) -> TournamentResponse:
        """Update tournament configuration respecting lifecycle locking rules."""
        tournament = await self.tournament_repo.get_by_id(
            tournament_id=tournament_id, club_id=club_id
        )
        if not tournament:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found in this club",
            )

        current_status = tournament.status

        # 1. State-based edit restrictions
        if current_status in (TournamentStatus.COMPLETED, TournamentStatus.CANCELLED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot update tournament in {current_status.value} state",
            )

        if current_status == TournamentStatus.IN_PROGRESS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot modify tournament configuration while competition is in progress",
            )

        if current_status == TournamentStatus.REGISTRATION_CLOSED:
            if (
                payload.format is not None
                or payload.scoring_rules is not None
                or payload.tiebreaker_rules is not None
                or (
                    payload.max_participants is not None
                    and payload.max_participants != tournament.max_participants
                )
                or (
                    payload.min_participants is not None
                    and payload.min_participants != tournament.min_participants
                )
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot modify tournament format, scoring, tiebreakers, or capacity after registration has closed",
                )

        if current_status == TournamentStatus.REGISTRATION_OPEN:
            if payload.format is not None and payload.format != tournament.format:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot change tournament format while registration is open",
                )
            if (
                payload.max_participants is not None
                and payload.max_participants != tournament.max_participants
            ) or (
                payload.min_participants is not None
                and payload.min_participants != tournament.min_participants
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Tournament capacity cannot be changed while registration is open",
                )

        # 2. Date consistency validation for partial updates
        new_reg_open = payload.registration_open_at or tournament.registration_open_at
        new_reg_close = payload.registration_close_at or tournament.registration_close_at
        new_start = payload.start_date or tournament.start_date
        new_end = payload.end_date or tournament.end_date

        if new_reg_open > new_reg_close:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="registration_open_at must be before or equal to registration_close_at",
            )
        if new_reg_close > new_start:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="registration_close_at must be before or equal to start_date",
            )
        if new_start > new_end:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="start_date must be before or equal to end_date",
            )

        update_data = payload.model_dump(exclude_unset=True)
        if "scoring_rules" in update_data and update_data["scoring_rules"] is not None:
            update_data["scoring_rules"] = payload.scoring_rules.model_dump()  # type: ignore

        if "format_configuration" in update_data and update_data["format_configuration"] is not None:
            fmt = update_data.get("format", tournament.format)
            fc = dict(update_data["format_configuration"])
            if fmt == TournamentFormat.SCRAMBLE:
                fc["registration_type"] = "individual"
                fc["team_size"] = 1
                cat = fc.get("category")
                if not cat or cat not in VALID_SCRAMBLE_DIVISIONS:
                    cat = "Open Scramble"
                    fc["category"] = cat
                if cat == "Men's Scramble":
                    fc["gender_eligibility"] = "Male"
                elif cat == "Women's Scramble":
                    fc["gender_eligibility"] = "Female"
                elif cat in ("Open Scramble", "Mixed Scramble"):
                    fc["gender_eligibility"] = "Any"
                raw_rounds = fc.get("planned_rounds") or fc.get("rounds")
                if raw_rounds is not None:
                    try:
                        p_rounds = int(raw_rounds)
                    except (ValueError, TypeError):
                        p_rounds = 5
                    fc["planned_rounds"] = max(1, min(20, p_rounds))
                    fc["rounds"] = fc["planned_rounds"]
            elif fc.get("category") == "Singles":
                fc.setdefault("registration_type", "individual")
                fc.setdefault("team_size", 1)
            elif fc.get("category"):
                fc.setdefault("registration_type", "team")
                fc.setdefault("team_size", 2)
            update_data["format_configuration"] = fc

        updated = await self.tournament_repo.update(tournament, **update_data)
        await self.db.commit()
        resp = _build_tournament_response(updated)
        try:
            await dispatch_event(
                event_type=EventType.TOURNAMENT_UPDATED,
                data={"tournament_id": str(updated.id), "name": updated.name, "status": updated.status.value},
                club_id=club_id,
            )
        except Exception:
            pass
        return resp

    # ─── Tournament Lifecycle State Transitions ────────────────────────────────

    async def open_registration(
        self, club_id: UUID, tournament_id: UUID
    ) -> TournamentResponse:
        """Transition tournament status from draft to registration_open."""
        tournament = await self.tournament_repo.get_by_id(
            tournament_id=tournament_id, club_id=club_id
        )
        if not tournament:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found in this club",
            )

        if tournament.status not in (TournamentStatus.DRAFT, TournamentStatus.REGISTRATION_CLOSED):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot open registration: tournament is currently '{tournament.status.value}', must be 'draft' or 'registration_closed'",
            )

        if tournament.status == TournamentStatus.REGISTRATION_CLOSED:
            matches_count = await self.competition_repo.count_all_matches(tournament_id)
            if matches_count > 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot reopen registration: matches have already been generated",
                )

        updated = await self.tournament_repo.update(
            tournament, status=TournamentStatus.REGISTRATION_OPEN
        )
        await self.db.commit()
        resp = _build_tournament_response(updated)
        try:
            await dispatch_event(
                event_type=EventType.TOURNAMENT_PUBLISHED,
                data={"tournament_id": str(updated.id), "name": updated.name, "status": updated.status.value},
                club_id=club_id,
            )
        except Exception:
            pass
        return resp

    async def close_registration(
        self, club_id: UUID, tournament_id: UUID
    ) -> TournamentResponse:
        """Transition tournament status from registration_open to registration_closed."""
        tournament = await self.tournament_repo.get_by_id(
            tournament_id=tournament_id, club_id=club_id
        )
        if not tournament:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found in this club",
            )

        if tournament.status != TournamentStatus.REGISTRATION_OPEN:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot close registration: tournament is currently '{tournament.status.value}', must be 'registration_open'",
            )

        updated = await self.tournament_repo.update(
            tournament, status=TournamentStatus.REGISTRATION_CLOSED
        )

        # For bracket tournaments (or team-based), finalize teams and seed by skill rating
        if tournament.format in (
            TournamentFormat.BRACKET,
            TournamentFormat.ROUND_ROBIN,
            TournamentFormat.POOL_PLAY,
        ):
            from app.services.competition_service import CompetitionService
            comp_svc = CompetitionService(self.db)
            await comp_svc.finalize_registrations_and_seed(updated)
        elif tournament.format == TournamentFormat.SCRAMBLE:
            from app.services.competition_service import CompetitionService
            comp_svc = CompetitionService(self.db)
            await comp_svc.finalize_scramble_registrations_and_seed(updated)

        await self.db.commit()
        await self.db.refresh(updated)
        resp = _build_tournament_response(updated)
        try:
            await dispatch_event(
                event_type=EventType.TOURNAMENT_UPDATED,
                data={"tournament_id": str(updated.id), "name": updated.name, "status": updated.status.value},
                club_id=club_id,
            )
        except Exception:
            pass
        return resp

    async def cancel_tournament(
        self, club_id: UUID, tournament_id: UUID
    ) -> TournamentResponse:
        """Cancel a tournament from draft, registration_open, or registration_closed."""
        tournament = await self.tournament_repo.get_by_id(
            tournament_id=tournament_id, club_id=club_id
        )
        if not tournament:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found in this club",
            )

        if tournament.status == TournamentStatus.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot cancel a completed tournament",
            )

        if tournament.status == TournamentStatus.CANCELLED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tournament is already cancelled",
            )

        updated = await self.tournament_repo.update(
            tournament, status=TournamentStatus.CANCELLED
        )
        await self.db.commit()
        resp = _build_tournament_response(updated)
        try:
            await dispatch_event(
                event_type=EventType.TOURNAMENT_CANCELLED,
                data={"tournament_id": str(updated.id), "name": updated.name},
                club_id=club_id,
            )
            registrations = await self.registration_repo.list_by_tournament(tournament_id)
            notif_service = NotificationService(self.db)
            for reg in registrations:
                if reg.status in (RegistrationStatus.CONFIRMED, RegistrationStatus.WAITLISTED):
                    user = reg.player_membership.user if reg.player_membership else None
                    if user:
                        await notif_service.create_notification(
                            user_id=user.id,
                            club_id=club_id,
                            category="tournament",
                            title="Tournament Cancelled",
                            message=f"Tournament '{tournament.name}' has been cancelled by the club.",
                            data={"tournament_id": str(tournament.id)},
                        )
            await self.db.commit()
        except Exception:
            pass
        return resp

    # ─── Participant Administration (Staff) ────────────────────────────────────

    async def list_tournament_registrations(
        self, club_id: UUID, tournament_id: UUID
    ) -> list[TournamentRegistrationResponse]:
        """List all participant registrations for a tournament."""
        tournament = await self.tournament_repo.get_by_id(
            tournament_id=tournament_id, club_id=club_id
        )
        if not tournament:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found in this club",
            )

        registrations = await self.registration_repo.list_by_tournament(tournament_id)
        return [_build_registration_response(r) for r in registrations]

    async def list_tournament_registrations_public(
        self, tournament_id: UUID
    ) -> list[TournamentRegistrationResponse]:
        """List confirmed participant registrations for a public tournament."""
        tournament = await self.tournament_repo.get_by_id(tournament_id=tournament_id)
        if not tournament:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found",
            )
        registrations = await self.registration_repo.list_by_tournament(tournament_id)
        return [
            _build_registration_response(r)
            for r in registrations
            if r.status == RegistrationStatus.CONFIRMED
        ]

    async def update_tournament_registration(
        self,
        club_id: UUID,
        tournament_id: UUID,
        registration_id: UUID,
        payload: UpdateRegistrationRequest,
    ) -> TournamentRegistrationResponse:
        """Update a participant's registration status, seed, or notes."""
        tournament = await self.tournament_repo.get_by_id(
            tournament_id=tournament_id, club_id=club_id
        )
        if not tournament:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found in this club",
            )

        registration = await self.registration_repo.get_by_id(registration_id)
        if not registration or registration.tournament_id != tournament_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Registration not found in this tournament",
            )

        update_data = payload.model_dump(exclude_unset=True)
        if payload.status == RegistrationStatus.CANCELLED and registration.status != RegistrationStatus.CANCELLED:
            update_data["cancelled_at"] = datetime.now(timezone.utc)
        elif payload.status in (RegistrationStatus.CONFIRMED, RegistrationStatus.PENDING, RegistrationStatus.WAITLISTED):
            update_data["cancelled_at"] = None

        updated = await self.registration_repo.update(registration, **update_data)
        await self.db.commit()
        return _build_registration_response(updated)

    # ─── Player Discovery & Self-Registration ─────────────────────────────────

    async def list_public_tournaments(
        self, user_id: UUID | None = None
    ) -> list[TournamentDiscoveryResponse]:
        """List all discoverable public tournaments with caller's registration status."""
        tournaments = await self.tournament_repo.list_public_discoverable()
        user_membership_ids: set[UUID] = set()
        if user_id:
            user_memberships = await self.player_membership_repo.get_user_player_memberships(user_id)
            user_membership_ids = {m.id for m in user_memberships}

        responses: list[TournamentDiscoveryResponse] = []
        for t in tournaments:
            t = await self._auto_close_registration_if_deadline_passed(t)
            confirmed = [r for r in t.registrations if r.status == RegistrationStatus.CONFIRMED]
            team_size = (t.format_configuration or {}).get("team_size", 1)
            is_scramble = t.format == TournamentFormat.SCRAMBLE
            if team_size == 2 and not is_scramble:
                confirmed_count = len(confirmed) // 2
            else:
                confirmed_count = len(confirmed)
            now = datetime.now(timezone.utc)
            reg_open = t.registration_open_at.replace(tzinfo=timezone.utc) if t.registration_open_at.tzinfo is None else t.registration_open_at
            reg_close = t.registration_close_at.replace(tzinfo=timezone.utc) if t.registration_close_at.tzinfo is None else t.registration_close_at
            is_open = (
                t.status == TournamentStatus.REGISTRATION_OPEN
                and reg_open <= now <= reg_close
            )

            my_reg = None
            if user_membership_ids:
                my_reg = next(
                    (
                        r for r in t.registrations
                        if r.player_membership_id in user_membership_ids
                        and r.status in (
                            RegistrationStatus.CONFIRMED,
                            RegistrationStatus.PENDING,
                            RegistrationStatus.WAITLISTED,
                        )
                    ),
                    None,
                )

            responses.append(
                TournamentDiscoveryResponse(
                    id=t.id,
                    club_id=t.club_id,
                    club_name=t.club.name,
                    club_slug=t.club.slug,
                    name=t.name,
                    description=t.description,
                    format=t.format,
                    format_label=t.format.display_label,
                    status=t.status,
                    status_label=t.status.display_label,
                    start_date=t.start_date,
                    end_date=t.end_date,
                    registration_open_at=t.registration_open_at,
                    registration_close_at=t.registration_close_at,
                    location_name=t.location_name,
                    participant_count=confirmed_count,
                    max_participants=t.max_participants,
                    format_configuration=t.format_configuration,
                    scoring_rules=t.scoring_rules,
                    is_registration_open=is_open,
                    is_registered=my_reg is not None,
                    my_registration_id=my_reg.id if my_reg else None,
                    my_registration_status=my_reg.status.value if my_reg else None,
                )
            )
        return responses

    async def get_player_registration_status(
        self,
        tournament_id: UUID,
        user_id: UUID,
    ) -> PlayerTournamentRegistrationStatusResponse:
        """Get the current user's registration and status in a tournament."""
        tournament = await self.tournament_repo.get_by_id(tournament_id)
        if not tournament:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found",
            )

        player_membership = await self.player_membership_repo.get_by_user_and_club(
            user_id=user_id, club_id=tournament.club_id
        )
        if not player_membership:
            return PlayerTournamentRegistrationStatusResponse(
                is_registered=False,
                status=None,
                status_label=None,
                registration=None,
            )

        existing = await self.registration_repo.get_by_tournament_and_player(
            tournament_id=tournament.id,
            player_membership_id=player_membership.id,
        )

        if not existing:
            return PlayerTournamentRegistrationStatusResponse(
                is_registered=False,
                status=None,
                status_label=None,
                registration=None,
            )

        format_config = tournament.format_configuration or {}
        category = format_config.get("category", "")
        skill_level = format_config.get("skill_level", "3.5")
        division = category or (f"{skill_level} Division")
        is_scramble = tournament.format == TournamentFormat.SCRAMBLE
        is_singles = category == "Singles" or "singles" in category.lower()

        # Retrieve player's team and partner if doubles/team
        team = await self.competition_repo.get_player_team_in_tournament(
            tournament_id=tournament.id,
            player_membership_id=player_membership.id,
        )
        partner_membership_id = None
        partner_name = None
        partner_email = None
        team_name = team.name if team else None
        team_id = team.id if team else None

        if team and hasattr(team, "members"):
            for m in team.members:
                if m.player_membership_id != player_membership.id:
                    partner_membership_id = m.player_membership_id
                    pm = m.player_membership
                    if pm and hasattr(pm, "user") and pm.user:
                        partner_name = pm.user.full_name
                        partner_email = pm.user.email
                    break

        # Calculate configured fee
        fee_raw = format_config.get("entry_fee")
        if fee_raw is not None and str(fee_raw).strip():
            try:
                calc_fee = float(fee_raw)
            except (ValueError, TypeError):
                calc_fee = 35.0 if is_scramble else (30.0 if is_singles else 50.0)
        else:
            desc = tournament.description or ""
            calc_fee = 35.0 if is_scramble else (30.0 if is_singles else 50.0)
            if "fee:" in desc.lower():
                import re
                match = re.search(r'fee:\s*\$?(\d+(?:\.\d+)?)', desc, re.IGNORECASE)
                if match:
                    try:
                        calc_fee = float(match.group(1))
                    except ValueError:
                        pass

        ref_no = f"REG-{existing.registered_at.year if existing.registered_at else datetime.now().year}-{existing.id.hex[:6].upper()}"

        user = player_membership.user if hasattr(player_membership, "user") else None
        player_name = user.full_name if user else "Player"
        player_email = user.email if user else None

        payment_status = (
            "completed" if existing.status == RegistrationStatus.CONFIRMED
            else "pending" if existing.status == RegistrationStatus.PENDING
            else "waitlisted" if existing.status == RegistrationStatus.WAITLISTED
            else "cancelled"
        )

        payment_method = "Card"
        if existing.notes and "payment" in existing.notes.lower():
            if "upi" in existing.notes.lower():
                payment_method = "UPI"
            elif "card" in existing.notes.lower():
                payment_method = "Card"

        reg_response = PlayerSelfRegistrationResponse(
            id=existing.id,
            tournament_id=tournament.id,
            status=existing.status,
            status_label=existing.status.display_label,
            registered_at=existing.registered_at,
            cancelled_at=existing.cancelled_at,
            message=f"Registration status: {existing.status.display_label}",
            reference_number=ref_no,
            registration_type="individual" if (is_scramble or is_singles) else "team",
            team_id=team_id,
            team_name=team_name,
            partner_membership_id=partner_membership_id,
            partner_name=partner_name,
            partner_email=partner_email,
            fee_amount=calc_fee,
            payment_status=payment_status,
            payment_method=payment_method,
            notes=existing.notes,
            tournament_name=tournament.name,
            tournament_format=tournament.format.value,
            tournament_format_label=tournament.format.display_label,
            division=division,
            location_name=tournament.location_name or (tournament.club.name if hasattr(tournament, "club") and tournament.club else "Main Courts"),
            start_date=tournament.start_date,
            end_date=tournament.end_date,
            player_name=player_name,
            player_email=player_email,
            skill_level=skill_level,
        )

        is_active_reg = existing.status in (
            RegistrationStatus.CONFIRMED,
            RegistrationStatus.PENDING,
            RegistrationStatus.WAITLISTED,
        )

        return PlayerTournamentRegistrationStatusResponse(
            is_registered=is_active_reg,
            status=existing.status,
            status_label=existing.status.display_label,
            registration=reg_response,
        )

    async def get_eligible_partners(
        self,
        tournament_id: UUID,
        user_id: UUID,
        search_query: str | None = None,
    ) -> list[EligiblePartnerResponse]:
        """List active club members eligible to be selected as doubles partner."""
        tournament = await self.tournament_repo.get_by_id(tournament_id)
        if not tournament:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found",
            )

        caller_membership = await self.player_membership_repo.get_by_user_and_club(
            user_id=user_id, club_id=tournament.club_id
        )
        if not caller_membership or caller_membership.status != PlayerMembershipStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You must have an active player membership in this club",
            )

        registrations = await self.registration_repo.list_by_tournament(tournament_id)
        active_registered_ids = {
            r.player_membership_id
            for r in registrations
            if r.status in (RegistrationStatus.CONFIRMED, RegistrationStatus.PENDING, RegistrationStatus.WAITLISTED)
        }

        members = await self.player_membership_repo.get_club_player_memberships(tournament.club_id)
        q = (search_query or "").strip().lower()

        format_config = tournament.format_configuration or {}
        category = format_config.get("category", "")
        caller_user = caller_membership.user
        caller_profile = getattr(caller_user, "player_profile", None) if caller_user else None
        caller_gender = (getattr(caller_profile, "gender", None) or "").strip().capitalize()

        results: list[EligiblePartnerResponse] = []
        for m in members:
            if m.status != PlayerMembershipStatus.ACTIVE:
                continue
            if m.user_id == user_id or m.id == caller_membership.id:
                continue
            if m.id in active_registered_ids:
                continue

            user = m.user
            profile = getattr(user, "player_profile", None) if user else None
            full_name = (user.full_name if user and user.full_name else (profile.display_name if profile else "Member")).strip()
            email = (user.email if user else "").strip()
            mem_num = m.membership_number or ""
            gender = getattr(profile, "gender", None)
            norm_g = gender.strip().capitalize() if gender else None
            profile_img = getattr(profile, "profile_image_url", None)

            # Strict gender validation for partner candidate when gender is configured
            if category == "Men's Doubles" and norm_g and norm_g != "Male":
                continue
            if category == "Women's Doubles" and norm_g and norm_g != "Female":
                continue
            if category == "Mixed Doubles" and caller_gender and norm_g:
                if caller_gender == "Male" and norm_g != "Female":
                    continue
                if caller_gender == "Female" and norm_g != "Male":
                    continue

            if q:
                if q not in full_name.lower() and q not in email.lower() and q not in mem_num.lower():
                    continue

            partner_skill_rating = float(profile.skill_rating) if profile and profile.skill_rating is not None else 3.5

            results.append(
                EligiblePartnerResponse(
                    membership_id=m.id,
                    user_id=m.user_id,
                    full_name=full_name,
                    email=email,
                    membership_number=m.membership_number,
                    gender=gender,
                    profile_image_url=profile_img,
                    skill_rating=partner_skill_rating,
                )
            )
        return results

    async def register_player(
        self,
        tournament_id: UUID,
        user_id: UUID,
        payload: PlayerSelfRegistrationRequest | None = None,
    ) -> PlayerSelfRegistrationResponse:
        """Register the authenticated user (and optional partner for doubles) in a tournament."""
        tournament = await self.tournament_repo.get_by_id_for_update(tournament_id)
        if not tournament:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found",
            )

        if tournament.status != TournamentStatus.REGISTRATION_OPEN:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tournament registration is not open (status: {tournament.status.value})",
            )

        now = datetime.now(timezone.utc)
        reg_close = tournament.registration_close_at
        if reg_close and reg_close.tzinfo is None:
            reg_close = reg_close.replace(tzinfo=timezone.utc)
        reg_open = tournament.registration_open_at
        if reg_open and reg_open.tzinfo is None:
            reg_open = reg_open.replace(tzinfo=timezone.utc)

        if reg_close and reg_close < now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tournament registration deadline has passed",
            )
        if reg_open and reg_open > now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tournament registration has not started yet",
            )

        # Verify active ClubPlayerMembership in tournament's club
        player_membership = await self.player_membership_repo.get_by_user_and_club(
            user_id=user_id, club_id=tournament.club_id
        )
        if not player_membership:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You must have a player membership in this club to register for its tournaments",
            )

        if player_membership.status != PlayerMembershipStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Your player membership in this club is {player_membership.status.value}",
            )

        # Check format, category, and eligibility
        format_config = tournament.format_configuration or {}
        category = format_config.get("category", "")
        gender_eligibility = format_config.get("gender_eligibility", "Any")
        is_scramble = tournament.format == TournamentFormat.SCRAMBLE
        is_singles = category == "Singles" or "singles" in category.lower()

        user = player_membership.user if hasattr(player_membership, "user") else None
        profile = user.player_profile if user and hasattr(user, "player_profile") else None

        # For Scramble, gender is strictly read from verified profile.
        # Self-declared payload.gender cannot override profile gender.
        if is_scramble:
            player_gender = getattr(profile, "gender", None)
        else:
            player_gender = (payload.gender if payload and payload.gender else getattr(profile, "gender", None))
        norm_gender = player_gender.strip().capitalize() if player_gender else None

        # 1. Scramble specific rules
        if is_scramble:
            if payload and payload.partner_membership_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Scramble format is individual registration only. Partners rotate automatically each round.",
                )
            if category == "Men's Scramble":
                if not norm_gender:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Men's Scramble requires a verified player profile with gender set to Male. Please update your profile.",
                    )
                if norm_gender != "Male":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="This tournament division is restricted to male players.",
                    )
            elif category == "Women's Scramble":
                if not norm_gender:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Women's Scramble requires a verified player profile with gender set to Female. Please update your profile.",
                    )
                if norm_gender != "Female":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="This tournament division is restricted to female players.",
                    )
            elif category == "Mixed Scramble":
                if not norm_gender or norm_gender not in ("Male", "Female"):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Mixed Scramble requires a verified player profile with gender set to Male or Female. Please update your profile.",
                    )
            elif category == "Open Scramble":
                pass

        # 2. Singles rules
        elif is_singles:
            if payload and payload.partner_membership_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Singles format is individual registration only.",
                )
            if gender_eligibility == "Male" and norm_gender and norm_gender != "Male":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This tournament division is restricted to male players",
                )
            elif gender_eligibility == "Female" and norm_gender and norm_gender != "Female":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This tournament division is restricted to female players",
                )

        # 3. Doubles partner validation
        partner_membership = None
        partner_user = None
        if not is_scramble and not is_singles and payload and payload.partner_membership_id:
            if payload.partner_membership_id == player_membership.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="You cannot select yourself as a partner",
                )
            partner_membership = await self.player_membership_repo.get_by_id(payload.partner_membership_id)
            if not partner_membership or partner_membership.club_id != tournament.club_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Selected partner does not belong to this club",
                )
            if partner_membership.status != PlayerMembershipStatus.ACTIVE:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Selected partner must be an active club member",
                )
            partner_user = partner_membership.user
            partner_profile = partner_user.player_profile if partner_user and hasattr(partner_user, "player_profile") else None
            partner_gender = getattr(partner_profile, "gender", None)
            norm_partner_gender = partner_gender.strip().capitalize() if partner_gender else None

            # Category-based gender validation for doubles
            if category == "Men's Doubles":
                if norm_gender and norm_gender != "Male":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Men's Doubles requires both players to be male",
                    )
                if norm_partner_gender and norm_partner_gender != "Male":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Selected partner must be male for Men's Doubles",
                    )
            elif category == "Women's Doubles":
                if norm_gender and norm_gender != "Female":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Women's Doubles requires both players to be female",
                    )
                if norm_partner_gender and norm_partner_gender != "Female":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Selected partner must be female for Women's Doubles",
                    )
            elif category == "Mixed Doubles":
                if norm_gender and norm_partner_gender:
                    if (
                        (norm_gender == "Male" and norm_partner_gender != "Female")
                        or (norm_gender == "Female" and norm_partner_gender != "Male")
                        or (norm_gender == norm_partner_gender and norm_gender in ("Male", "Female"))
                    ):
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Mixed Doubles requires one male and one female player",
                        )

            # Check partner registration status
            partner_existing = await self.registration_repo.get_by_tournament_and_player(
                tournament_id=tournament.id,
                player_membership_id=partner_membership.id,
            )
            if partner_existing and partner_existing.status in (
                RegistrationStatus.CONFIRMED,
                RegistrationStatus.PENDING,
                RegistrationStatus.WAITLISTED,
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Selected partner is already registered for this tournament",
                )

        # 4. Skill Level Eligibility Validation
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
            try:
                min_skill_val = float(min_skill_raw)
                max_skill_val = float(max_skill_raw)
            except (ValueError, TypeError):
                min_skill_val = None
                max_skill_val = None

            if min_skill_val is not None and max_skill_val is not None:
                # Resolve caller rating
                caller_rating = 3.5
                if payload and payload.skill_level:
                    try:
                        caller_rating = float(payload.skill_level)
                    except (ValueError, TypeError):
                        pass
                elif profile and profile.skill_rating is not None:
                    caller_rating = float(profile.skill_rating)

                if is_scramble or is_singles or not partner_membership:
                    if skill_mode == "single":
                        if caller_rating != min_skill_val:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Tournament requires skill level {min_skill_val:.1f}. Your rating ({caller_rating:.1f}) does not meet the eligibility requirement.",
                            )
                    else:
                        if caller_rating < min_skill_val or caller_rating > max_skill_val:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Tournament requires skill level between {min_skill_val:.1f} and {max_skill_val:.1f}. Your rating ({caller_rating:.1f}) does not meet the eligibility requirement.",
                            )
                else:
                    # Doubles: resolve partner rating and calculate team average
                    partner_rating = 3.5
                    if payload and payload.partner_skill_level:
                        try:
                            partner_rating = float(payload.partner_skill_level)
                        except (ValueError, TypeError):
                            pass
                    elif partner_profile and partner_profile.skill_rating is not None:
                        partner_rating = float(partner_profile.skill_rating)

                    team_rating = round((caller_rating + partner_rating) / 2.0, 2)

                    if skill_mode == "single":
                        if caller_rating != min_skill_val:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Tournament requires skill level {min_skill_val:.1f}. Your rating ({caller_rating:.1f}) does not meet the eligibility requirement.",
                            )
                        if partner_rating != min_skill_val:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Tournament requires skill level {min_skill_val:.1f}. Your partner's rating ({partner_rating:.1f}) does not meet the eligibility requirement.",
                            )
                        if team_rating != min_skill_val:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Tournament requires skill level {min_skill_val:.1f}. Your team's average rating ({team_rating:.2f}) does not meet the eligibility requirement.",
                            )
                    else:
                        if caller_rating < min_skill_val or caller_rating > max_skill_val:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Tournament requires skill level between {min_skill_val:.1f} and {max_skill_val:.1f}. Your rating ({caller_rating:.1f}) is outside this range.",
                            )
                        if partner_rating < min_skill_val or partner_rating > max_skill_val:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Tournament requires skill level between {min_skill_val:.1f} and {max_skill_val:.1f}. Your partner's rating ({partner_rating:.1f}) is outside this range.",
                            )
                        if team_rating < min_skill_val or team_rating > max_skill_val:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Tournament requires skill level between {min_skill_val:.1f} and {max_skill_val:.1f}. Your team's average rating ({team_rating:.2f}) does not meet the eligibility requirement.",
                            )

        # Check existing registration for caller
        existing = await self.registration_repo.get_by_tournament_and_player(
            tournament_id=tournament.id,
            player_membership_id=player_membership.id,
        )

        active_count = await self.registration_repo.count_active_participants(tournament.id)
        # For doubles with partner, 2 participants will be added
        increment = 2 if partner_membership else 1
        team_size = (tournament.format_configuration or {}).get("team_size", 1)
        is_scramble = tournament.format == TournamentFormat.SCRAMBLE
        max_p = tournament.max_participants
        max_individual = (max_p * team_size) if (max_p is not None and team_size == 2 and not is_scramble) else max_p

        is_full = (
            max_individual is not None
            and (active_count + increment - 1) >= max_individual
        )
        target_status = RegistrationStatus.WAITLISTED if is_full else RegistrationStatus.CONFIRMED

        if existing:
            if existing.status in (
                RegistrationStatus.CONFIRMED,
                RegistrationStatus.PENDING,
                RegistrationStatus.WAITLISTED,
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Player is already registered for this tournament",
                )

            # Reactivate cancelled registration
            reg = await self.registration_repo.update(
                existing,
                status=target_status,
                registered_at=datetime.now(timezone.utc),
                cancelled_at=None,
                notes=payload.notes if payload else None,
            )
            await self.db.commit()
        else:
            # Create new registration
            reg = await self.registration_repo.create(
                tournament_id=tournament.id,
                player_membership_id=player_membership.id,
                status=target_status,
            )
            if payload and payload.notes:
                reg.notes = payload.notes
            await self.db.commit()

        # If partner provided, register partner and create Team
        created_team = None
        if partner_membership:
            partner_existing = await self.registration_repo.get_by_tournament_and_player(
                tournament_id=tournament.id,
                player_membership_id=partner_membership.id,
            )
            if partner_existing:
                await self.registration_repo.update(
                    partner_existing,
                    status=target_status,
                    registered_at=datetime.now(timezone.utc),
                    cancelled_at=None,
                )
            else:
                await self.registration_repo.create(
                    tournament_id=tournament.id,
                    player_membership_id=partner_membership.id,
                    status=target_status,
                )

            caller_name = (user.full_name if user and user.full_name else "Player 1").strip()
            partner_name = (partner_user.full_name if partner_user and partner_user.full_name else "Player 2").strip()
            team_name = (payload.team_name if payload and payload.team_name else f"{caller_name} & {partner_name}").strip()

            try:
                created_team = await self.competition_repo.create_team(
                    tournament_id=tournament.id,
                    name=team_name,
                )
                await self.competition_repo.create_team_member(
                    team_id=created_team.id,
                    player_membership_id=player_membership.id,
                )
                await self.competition_repo.create_team_member(
                    team_id=created_team.id,
                    player_membership_id=partner_membership.id,
                )
                await self.db.commit()
            except Exception:
                # If team creation fails or already exists, rollback gracefully
                await self.db.rollback()

        elif is_singles and target_status == RegistrationStatus.CONFIRMED:
            caller_name = (
                profile.display_name
                if profile and profile.display_name
                else (user.full_name if user and user.full_name else "Player")
            ).strip()
            team_name = (payload.team_name if payload and payload.team_name else caller_name).strip()
            try:
                created_team = await self.competition_repo.create_team(
                    tournament_id=tournament.id,
                    name=team_name,
                )
                await self.competition_repo.create_team_member(
                    team_id=created_team.id,
                    player_membership_id=player_membership.id,
                )
                await self.db.commit()
            except Exception:
                await self.db.rollback()

        # Calculate configured fee
        fee_raw = format_config.get("entry_fee")
        if fee_raw is not None and str(fee_raw).strip():
            try:
                calc_fee = float(fee_raw)
            except (ValueError, TypeError):
                calc_fee = 35.0 if is_scramble else (30.0 if is_singles else 50.0)
        else:
            # Parse from description e.g. "Fee: $35/player"
            desc = tournament.description or ""
            calc_fee = 35.0 if is_scramble else (30.0 if is_singles else 50.0)
            if "fee:" in desc.lower():
                import re
                match = re.search(r'fee:\s*\$?(\d+(?:\.\d+)?)', desc, re.IGNORECASE)
                if match:
                    try:
                        calc_fee = float(match.group(1))
                    except ValueError:
                        pass

        # Reference number
        ref_no = f"REG-{now.year}-{reg.id.hex[:6].upper()}"

        msg = (
            "Registration waitlisted (capacity reached)"
            if target_status == RegistrationStatus.WAITLISTED
            else "Successfully registered for tournament"
        )
        resp_obj = PlayerSelfRegistrationResponse(
            id=reg.id,
            tournament_id=tournament.id,
            status=reg.status,
            status_label=reg.status.display_label,
            registered_at=reg.registered_at,
            message=msg,
            reference_number=ref_no,
            registration_type="individual" if (is_scramble or is_singles) else "team",
            team_id=created_team.id if created_team else None,
            team_name=created_team.name if created_team else None,
            partner_membership_id=partner_membership.id if partner_membership else None,
            partner_name=partner_user.full_name if partner_user else None,
            fee_amount=calc_fee,
            payment_status="completed" if target_status == RegistrationStatus.CONFIRMED else "pending",
            payment_method=payload.payment_method if payload and payload.payment_method else "online",
            notes=payload.notes if payload else None,
            tournament_name=tournament.name,
            tournament_format=tournament.format.value,
            tournament_format_label=tournament.format.display_label,
            division=category or "3.5 Division",
            location_name=tournament.location_name or (tournament.club.name if hasattr(tournament, "club") and tournament.club else "Main Courts"),
            start_date=tournament.start_date,
            end_date=tournament.end_date,
            player_name=user.full_name if user else "Player",
            player_email=user.email if user else None,
            skill_level=payload.skill_level if payload and payload.skill_level else "3.5",
        )
        try:
            active_count = await self.registration_repo.count_active_participants(tournament.id)
            event_payload = {
                "tournament_id": str(tournament.id),
                "tournament_name": tournament.name,
                "registration_id": str(reg.id),
                "user_id": str(user_id),
                "status": reg.status.value,
                "participant_count": active_count,
                "reference_number": ref_no,
            }
            await dispatch_event(
                event_type=EventType.TOURNAMENT_REGISTRATION_CREATED,
                data=event_payload,
                club_id=tournament.club_id,
                user_id=user_id,
            )
            title = "Tournament Registration Confirmed" if target_status == RegistrationStatus.CONFIRMED else "Tournament Registration Waitlisted"
            body = f"You are registered for '{tournament.name}'. Ref: {ref_no}" if target_status == RegistrationStatus.CONFIRMED else f"You are waitlisted for '{tournament.name}'."
            notif_svc = NotificationService(self.db)
            await notif_svc.create_notification(
                user_id=user_id,
                club_id=tournament.club_id,
                category="tournament",
                title=title,
                message=body,
                data={"tournament_id": str(tournament.id), "reference_number": ref_no},
            )
            if partner_membership and partner_membership.user_id:
                await notif_svc.create_notification(
                    user_id=partner_membership.user_id,
                    club_id=tournament.club_id,
                    category="tournament",
                    title="Tournament Team Registration",
                    message=f"{user.full_name or 'Your partner'} registered your team for '{tournament.name}'. Ref: {ref_no}",
                    data={"tournament_id": str(tournament.id), "reference_number": ref_no},
                )
            await notif_svc.notify_club_staff(
                club_id=tournament.club_id,
                category="tournament",
                title="Tournament Registration",
                message=f"New registration received for '{tournament.name}'. Ref: {ref_no}",
                data={"tournament_id": str(tournament.id), "player_id": str(user_id)},
            )
            await self.db.commit()
        except Exception:
            pass

        return resp_obj

    async def cancel_player_registration(
        self, tournament_id: UUID, user_id: UUID
    ) -> PlayerSelfRegistrationResponse:
        """Allow a player to cancel their own registration."""
        tournament = await self.tournament_repo.get_by_id(tournament_id)
        if not tournament:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found",
            )

        if tournament.status in (
            TournamentStatus.IN_PROGRESS,
            TournamentStatus.COMPLETED,
            TournamentStatus.CANCELLED,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot cancel registration for tournament in '{tournament.status.value}' state",
            )

        player_membership = await self.player_membership_repo.get_by_user_and_club(
            user_id=user_id, club_id=tournament.club_id
        )
        if not player_membership:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No player registration found for this user in this tournament",
            )

        registration = await self.registration_repo.get_by_tournament_and_player(
            tournament_id=tournament.id,
            player_membership_id=player_membership.id,
        )
        if not registration or registration.status == RegistrationStatus.CANCELLED:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Active registration not found",
            )

        updated = await self.registration_repo.update(
            registration,
            status=RegistrationStatus.CANCELLED,
            cancelled_at=datetime.now(timezone.utc),
        )
        await self.db.commit()

        cancel_resp = PlayerSelfRegistrationResponse(
            id=updated.id,
            tournament_id=tournament.id,
            status=updated.status,
            status_label=updated.status.display_label,
            registered_at=updated.registered_at,
            message="Registration successfully cancelled",
        )

        try:
            active_count = await self.registration_repo.count_active_participants(tournament.id)
            event_payload = {
                "tournament_id": str(tournament.id),
                "tournament_name": tournament.name,
                "registration_id": str(updated.id),
                "user_id": str(user_id),
                "status": updated.status.value,
                "participant_count": active_count,
            }
            await dispatch_event(
                event_type=EventType.TOURNAMENT_REGISTRATION_CANCELLED,
                data=event_payload,
                club_id=tournament.club_id,
                user_id=user_id,
            )
            await NotificationService(self.db).create_notification(
                user_id=user_id,
                club_id=tournament.club_id,
                category="tournament",
                title="Tournament Registration Cancelled",
                message=f"Your registration for '{tournament.name}' was cancelled.",
                data={"tournament_id": str(tournament.id)},
            )
            await self.db.commit()
        except Exception:
            pass

        return cancel_resp
