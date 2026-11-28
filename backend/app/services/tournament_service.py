"""
Aught2 Pickleball — Tournament Service

Business logic for tournaments and tournament registrations.
Enforces club tenant isolation, lifecycle state transitions,
configuration locking rules, and player eligibility.
"""
from __future__ import annotations

import asyncio
import logging
import weakref
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

_TOURNAMENT_LOCKS: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, dict[UUID, asyncio.Lock]] = (
    weakref.WeakKeyDictionary()
)


def _get_tournament_lock(tournament_id: UUID) -> asyncio.Lock:
    loop = asyncio.get_running_loop()
    loop_locks = _TOURNAMENT_LOCKS.setdefault(loop, {})
    lock = loop_locks.get(tournament_id)
    if lock is None:
        lock = asyncio.Lock()
        loop_locks[tournament_id] = lock
    return lock

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

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
from app.repositories.player_profile_repository import PlayerProfileRepository
from app.repositories.tournament_repository import TournamentRepository
from app.schemas.tournament import (
    VALID_COMPETITION_CATEGORIES,
    VALID_SCRAMBLE_DIVISIONS,
    ClosureEligibilityResponse,
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
from app.core.events import EventType, dispatch_event, serialize_for_event
from app.core.websocket_manager import ws_manager
from app.repositories.user_repository import UserRepository
from app.services.notification_service import NotificationService
from app.services.tournament_counting import (
    TournamentCounts,
    compute_tournament_counts,
    compute_tournaments_counts,
    resolve_tournament_registration_model,
)
from app.services.tournament_workflow import (
    TournamentWorkflowSnapshot,
    compute_tournament_workflow_meta,
    compute_tournaments_workflow_meta,
)


def _build_tournament_response(
    t: Tournament,
    participant_count: int | None = None,
    is_registered: bool = False,
    my_registration_id: UUID | None = None,
    my_registration_status: str | None = None,
    teams_count: int | None = None,
    confirmed_players_count: int | None = None,
    workflow_meta: TournamentWorkflowSnapshot | None = None,
) -> TournamentResponse:
    is_doubles, team_size = resolve_tournament_registration_model(t)

    if participant_count is not None:
        count = participant_count
        conf_count = confirmed_players_count if confirmed_players_count is not None else participant_count
        t_count = teams_count if teams_count is not None else (count if is_doubles else None)
    else:
        try:
            from sqlalchemy.orm import attributes
            state = attributes.instance_state(t)
            if "registrations" in state.dict and state.dict["registrations"]:
                confirmed = [r for r in state.dict["registrations"] if r.status == RegistrationStatus.CONFIRMED]
                conf_count = len(confirmed)
                if is_doubles:
                    count = len(confirmed) // team_size
                    t_count = count
                else:
                    count = len(confirmed)
                    t_count = None
            else:
                count = 0
                conf_count = 0
                t_count = None
        except Exception:
            count = 0
            conf_count = 0
            t_count = None
    club = None
    try:
        from sqlalchemy.orm import attributes
        state = attributes.instance_state(t)
        if "club" in state.dict:
            club = state.dict["club"]
    except Exception:
        club = getattr(t, "__dict__", {}).get("club")
    club_name = club.name if club else None
    club_slug = club.slug if club else None
    custom_banner = getattr(t, "banner_image_url", None)
    resolved_banner = custom_banner.strip() if (custom_banner and custom_banner.strip()) else None
    from app.services.image_resolution_service import normalize_tournament_format
    fmt = normalize_tournament_format(getattr(t, "format", None))

    # Priority 2: Club Format Default -> Club General Default
    if not resolved_banner and club:
        if fmt == "round_robin" and club.default_tournament_round_robin_url:
            resolved_banner = club.default_tournament_round_robin_url.strip()
        elif fmt == "scramble" and club.default_tournament_scramble_url:
            resolved_banner = club.default_tournament_scramble_url.strip()
        elif fmt == "pool_play" and club.default_tournament_pool_play_url:
            resolved_banner = club.default_tournament_pool_play_url.strip()
        elif fmt == "bracket" and club.default_tournament_bracket_url:
            resolved_banner = club.default_tournament_bracket_url.strip()

        if not resolved_banner and club.default_tournament_banner_url:
            resolved_banner = club.default_tournament_banner_url.strip()

    # Priority 3: Platform Admin Global Default (Format-specific -> General Tournament Default)
    if not resolved_banner:
        from app.services.platform_banner_service import resolve_platform_default
        if fmt == "round_robin":
            resolved_banner = resolve_platform_default("default_tournament_round_robin")
        elif fmt == "scramble":
            resolved_banner = resolve_platform_default("default_tournament_scramble")
        elif fmt == "pool_play":
            resolved_banner = resolve_platform_default("default_tournament_pool_play")
        elif fmt == "bracket":
            resolved_banner = resolve_platform_default("default_tournament_bracket")

        if not resolved_banner:
            resolved_banner = resolve_platform_default("default_tournament_banner")

    status_lbl = (
        t.status.display_label
        if hasattr(t.status, "display_label")
        else str(getattr(t.status, "value", t.status)).replace("_", " ").title()
    )
    format_lbl = (
        t.format.display_label
        if hasattr(t.format, "display_label")
        else str(getattr(t.format, "value", t.format)).replace("_", " ").title()
    )
    visibility_lbl = (
        t.visibility.display_label
        if hasattr(t.visibility, "display_label")
        else str(getattr(t.visibility, "value", t.visibility)).replace("_", " ").title()
    )

    cfg_dict = t.format_configuration if isinstance(t.format_configuration, dict) else {}
    workflow_state = workflow_meta.workflow_state if workflow_meta else None
    workflow_state_label = workflow_meta.workflow_state_label if workflow_meta else None
    configuration_saved = (
        workflow_meta.configuration_saved
        if workflow_meta
        else bool(cfg_dict.get("configuration_saved", False))
    )
    configuration_saved_at = (
        workflow_meta.configuration_saved_at
        if workflow_meta
        else (
            cfg_dict.get("configuration_saved_at")
            if isinstance(cfg_dict.get("configuration_saved_at"), str)
            else None
        )
    )
    structure_generated = (
        workflow_meta.structure_generated
        if workflow_meta
        else bool(
            cfg_dict.get("is_format_configured", False)
            and cfg_dict.get("configuration_stage") in ("ready_to_start", "schedule_generated", "in_progress")
        )
    )
    closure_eligibility_resp = (
        ClosureEligibilityResponse(**workflow_meta.closure_eligibility.to_dict())
        if workflow_meta
        else None
    )

    return TournamentResponse(
        id=t.id,
        club_id=t.club_id,
        club_name=club_name,
        club_slug=club_slug,
        created_by_user_id=t.created_by_user_id,
        name=t.name,
        description=t.description,
        banner_image_url=custom_banner,
        resolved_banner_url=resolved_banner,
        status=t.status,
        status_label=status_lbl,
        workflow_state=workflow_state,
        workflow_state_label=workflow_state_label,
        configuration_saved=configuration_saved,
        configuration_saved_at=configuration_saved_at,
        structure_generated=structure_generated,
        closure_eligibility=closure_eligibility_resp,
        format=t.format,
        format_label=format_lbl,
        visibility=t.visibility,
        visibility_label=visibility_lbl,
        start_date=t.start_date,
        end_date=t.end_date,
        registration_open_at=t.registration_open_at,
        registration_close_at=t.registration_close_at,
        location_name=t.location_name,
        min_participants=t.min_participants,
        max_participants=t.max_participants,
        scoring_rules=t.scoring_rules if isinstance(t.scoring_rules, dict) else {},
        tiebreaker_rules=t.tiebreaker_rules if isinstance(t.tiebreaker_rules, list) else [],
        format_configuration=t.format_configuration,
        participant_count=count,
        teams_count=t_count,
        confirmed_players_count=conf_count,
        created_at=t.created_at,
        updated_at=t.updated_at,
        is_registered=is_registered,
        my_registration_id=my_registration_id,
        my_registration_status=my_registration_status,
    )


build_tournament_response = _build_tournament_response


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
        self.profile_repo = PlayerProfileRepository(db)
        self.user_repo = UserRepository(db)

    async def _broadcast_tournament_updated(
        self,
        tournament: Tournament,
        counts: TournamentCounts,
        *,
        club_id: UUID | None = None,
        extra_event_type: EventType | None = None,
        extra_payload: dict | None = None,
        user_id: UUID | None = None,
    ) -> None:
        """Emit authoritative tournament count and status updates over WS & event dispatcher."""
        target_club_id = club_id or tournament.club_id
        status_val = (
            tournament.status.value
            if hasattr(tournament.status, "value")
            else str(tournament.status)
        )
        workflow_meta = await compute_tournament_workflow_meta(self.db, tournament, counts)
        updated_payload = {
            "tournament_id": str(tournament.id),
            "name": tournament.name,
            "status": status_val,
            "workflow_state": workflow_meta.workflow_state,
            "workflow_state_label": workflow_meta.workflow_state_label,
            "configuration_saved": workflow_meta.configuration_saved,
            "configuration_saved_at": workflow_meta.configuration_saved_at,
            "structure_generated": workflow_meta.structure_generated,
            "participant_count": counts.participant_count,
            "teams_count": counts.teams_count,
            "confirmed_players_count": counts.confirmed_players_count,
        }
        if extra_event_type is not None and extra_payload is not None:
            await dispatch_event(
                event_type=extra_event_type,
                data=extra_payload,
                club_id=target_club_id,
                user_id=user_id,
            )
            await ws_manager.broadcast_all({
                "type": extra_event_type.value,
                "data": serialize_for_event(extra_payload),
                "club_id": str(target_club_id),
                "user_id": str(user_id) if user_id else None,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

        await dispatch_event(
            event_type=EventType.TOURNAMENT_UPDATED,
            data=updated_payload,
            club_id=target_club_id,
            user_id=user_id,
        )
        await ws_manager.broadcast_all({
            "type": EventType.TOURNAMENT_UPDATED.value,
            "data": serialize_for_event(updated_payload),
            "club_id": str(target_club_id),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    async def _auto_close_registration_if_deadline_passed(
        self, tournament: Tournament
    ) -> Tournament:
        """If tournament is in registration_open and registration_close_at has passed, close registration."""
        if tournament.status == TournamentStatus.REGISTRATION_OPEN and tournament.registration_close_at:
            now = datetime.now(timezone.utc)
            reg_close = (
                tournament.registration_close_at.replace(tzinfo=timezone.utc)
                if tournament.registration_close_at.tzinfo is None
                else tournament.registration_close_at
            )
            if reg_close <= now:
                t_id = tournament.id
                c_id = tournament.club_id
                try:
                    await self.close_registration(c_id, t_id)
                except Exception as e:
                    logger.warning(f"Auto-close registration failed for tournament {t_id}: {e}")
                    try:
                        await self.db.rollback()
                    except Exception:
                        pass
                refreshed = await self.tournament_repo.get_by_id(t_id, c_id)
                if refreshed:
                    return refreshed
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
        needs_commit = False
        for t in tournaments:
            updated_t = await self._auto_close_registration_if_deadline_passed(t)
            # Reconcile completion status from format_configuration (e.g. Pool Play / Scramble)
            if updated_t.status != TournamentStatus.COMPLETED:
                cfg = updated_t.format_configuration or {}
                pps = cfg.get("pool_play_state", {})
                if pps.get("completed") or pps.get("is_completed") or pps.get("winner") or cfg.get("winner"):
                    updated_t.status = TournamentStatus.COMPLETED
                    await self.tournament_repo.update(
                        updated_t,
                        status=TournamentStatus.COMPLETED,
                    )
                    needs_commit = True
            updated_tournaments.append(updated_t)

        if needs_commit and self.db.is_active:
            try:
                await self.db.commit()
            except Exception:
                pass

        counts_map = await compute_tournaments_counts(self.db, updated_tournaments)
        workflow_map = await compute_tournaments_workflow_meta(self.db, updated_tournaments, counts_map)
        return [
            _build_tournament_response(
                t,
                participant_count=counts_map[t.id].participant_count,
                teams_count=counts_map[t.id].teams_count,
                confirmed_players_count=counts_map[t.id].confirmed_players_count,
                workflow_meta=workflow_map[t.id],
            )
            for t in updated_tournaments
        ]

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
        if tournament.status != TournamentStatus.COMPLETED:
            cfg = tournament.format_configuration or {}
            pps = cfg.get("pool_play_state", {})
            if pps.get("completed") or pps.get("is_completed") or pps.get("winner") or cfg.get("winner"):
                tournament.status = TournamentStatus.COMPLETED
                await self.tournament_repo.update(
                    tournament,
                    status=TournamentStatus.COMPLETED,
                )
                if self.db.is_active:
                    try:
                        await self.db.commit()
                    except Exception:
                        pass

        counts = await compute_tournament_counts(self.db, tournament)
        workflow_meta = await compute_tournament_workflow_meta(self.db, tournament, counts)
        return _build_tournament_response(
            tournament,
            participant_count=counts.participant_count,
            teams_count=counts.teams_count,
            confirmed_players_count=counts.confirmed_players_count,
            workflow_meta=workflow_meta,
        )

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
        if current_user_id:
            player_mem = await self.player_membership_repo.get_by_user_and_club(
                user_id=current_user_id, club_id=tournament.club_id
            )
            staff_mem = await self.club_membership_repo.get_by_user_and_club(
                user_id=current_user_id, club_id=tournament.club_id
            )
            is_active_member = (
                (player_mem is not None and player_mem.status == PlayerMembershipStatus.ACTIVE)
                or (staff_mem is not None and staff_mem.is_active)
                or (tournament.created_by_user_id == current_user_id)
            )
            if not is_active_member:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access restricted to active club members",
                )
        elif tournament.visibility == TournamentVisibility.PRIVATE:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found",
            )
        is_reg = False
        reg_id = None
        reg_status = None
        if current_user_id:
            existing = await self.registration_repo.get_by_tournament_and_user(
                tournament_id=tournament.id, user_id=current_user_id
            )
            if existing and existing.status in (
                RegistrationStatus.CONFIRMED,
                RegistrationStatus.PENDING,
                RegistrationStatus.WAITLISTED,
            ):
                is_reg = True
                reg_id = existing.id
                reg_status = existing.status.value if hasattr(existing.status, "value") else str(existing.status)

        # Authoritative format-aware counts directly from persisted DB records
        counts = await compute_tournament_counts(self.db, tournament)
        workflow_meta = await compute_tournament_workflow_meta(self.db, tournament, counts)

        return _build_tournament_response(
            tournament,
            participant_count=counts.participant_count,
            teams_count=counts.teams_count,
            confirmed_players_count=counts.confirmed_players_count,
            is_registered=is_reg,
            my_registration_id=reg_id,
            my_registration_status=reg_status,
            workflow_meta=workflow_meta,
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

        # Inherit club-level default tournament configuration if present
        club_tourn_cfg = (club.tournament_configuration or {}).get(payload.format.value, {})
        if club_tourn_cfg:
            for k, v in club_tourn_cfg.items():
                if k not in format_config and k not in ("match_scoring", "tiebreaker_rules"):
                    format_config[k] = v

        # Resolve scoring rules and tiebreakers with club configuration precedence
        # Use club-level default when scoring_rules/tiebreaker_rules were not explicitly overridden in payload
        fields_set = getattr(payload, "model_fields_set", set())
        if "scoring_rules" not in fields_set and club_tourn_cfg.get("match_scoring"):
            resolved_scoring_rules = dict(club_tourn_cfg["match_scoring"])
        elif payload.scoring_rules:
            resolved_scoring_rules = payload.scoring_rules.model_dump()
        else:
            resolved_scoring_rules = dict(club_tourn_cfg["match_scoring"]) if club_tourn_cfg.get("match_scoring") else None

        if "tiebreaker_rules" not in fields_set and club_tourn_cfg.get("tiebreaker_rules"):
            resolved_tiebreaker_rules = list(club_tourn_cfg["tiebreaker_rules"])
        elif payload.tiebreaker_rules:
            resolved_tiebreaker_rules = list(payload.tiebreaker_rules)
        else:
            resolved_tiebreaker_rules = (
                list(club_tourn_cfg["tiebreaker_rules"])
                if club_tourn_cfg.get("tiebreaker_rules")
                else None
            )

        # Resolve venue / location from club profile if not provided
        resolved_location = payload.location_name
        if not resolved_location or not str(resolved_location).strip():
            loc_parts = [str(p).strip() for p in [club.address_line1, club.city, club.state] if p and str(p).strip()]
            resolved_location = ", ".join(loc_parts) if loc_parts else club.name

        # Validate and resolve active courts from club courts management
        from app.models.court import Court, CourtStatus
        court_stmt = (
            select(Court)
            .where(Court.club_id == club_id, Court.status == CourtStatus.ACTIVE)
            .order_by(Court.display_order)
        )
        courts_res = await self.db.execute(court_stmt)
        active_courts = courts_res.scalars().all()
        active_court_ids = [str(c.id) for c in active_courts]

        req_assigned = format_config.get("assigned_courts")
        if req_assigned and isinstance(req_assigned, list) and len(req_assigned) > 0:
            for c_id in req_assigned:
                if str(c_id) not in active_court_ids:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Assigned court {c_id} is inactive or does not belong to this club.",
                    )
            format_config["assigned_courts"] = [str(c_id) for c_id in req_assigned]
            format_config["courts_count"] = len(req_assigned)
        elif active_courts:
            format_config.setdefault("assigned_courts", active_court_ids)
            format_config.setdefault("courts_count", len(active_courts))

        # Format-specific and category-specific rules enforcement
        category = format_config.get("category")
        if payload.format == TournamentFormat.SCRAMBLE:
            format_config["registration_type"] = "individual"
            format_config["team_size"] = 1
            if not category or category not in VALID_SCRAMBLE_DIVISIONS:
                category = "Open Scramble"
                format_config["category"] = category
            if category == "Men's Scramble":
                format_config["gender_eligibility"] = "Male"
            elif category == "Women's Scramble":
                format_config["gender_eligibility"] = "Female"
            elif category in ("Open Scramble", "Mixed Scramble"):
                format_config["gender_eligibility"] = "Any"
            raw_rounds = format_config.get("planned_rounds") or format_config.get("rounds")
            try:
                p_rounds = int(raw_rounds) if raw_rounds is not None else 5
            except (ValueError, TypeError):
                p_rounds = 5
            format_config["planned_rounds"] = max(1, min(20, p_rounds))
            format_config["rounds"] = format_config["planned_rounds"]
        elif category == "Singles":
            format_config.setdefault("registration_type", "individual")
            format_config.setdefault("team_size", 1)
            # Gender eligibility for singles must be Male or Female
            if not format_config.get("gender_eligibility") or format_config.get("gender_eligibility") == "Any":
                format_config["gender_eligibility"] = "Male"
        elif category == "Men's Doubles":
            format_config["registration_type"] = "team"
            format_config["team_size"] = 2
            format_config["gender_eligibility"] = "Male"
        elif category == "Women's Doubles":
            format_config["registration_type"] = "team"
            format_config["team_size"] = 2
            format_config["gender_eligibility"] = "Female"
        elif category == "Mixed Doubles":
            format_config["registration_type"] = "team"
            format_config["team_size"] = 2
            format_config["gender_eligibility"] = "Mixed"
        elif category:
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
            location_name=resolved_location,
            min_participants=payload.min_participants,
            max_participants=payload.max_participants,
            scoring_rules=resolved_scoring_rules,
            tiebreaker_rules=resolved_tiebreaker_rules,
            format_configuration=format_config if format_config else None,
            banner_image_url=payload.banner_image_url,
        )
        await self.db.commit()
        counts = await compute_tournament_counts(self.db, tournament)
        resp = _build_tournament_response(
            tournament,
            participant_count=counts.participant_count,
            teams_count=counts.teams_count,
            confirmed_players_count=counts.confirmed_players_count,
        )
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
                    detail="Cannot modify tournament format, scoring, tiebreakers, or capacity while competition is in progress",
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
        counts = await compute_tournament_counts(self.db, updated)
        resp = _build_tournament_response(
            updated,
            participant_count=counts.participant_count,
            teams_count=counts.teams_count,
            confirmed_players_count=counts.confirmed_players_count,
        )
        try:
            await self._broadcast_tournament_updated(updated, counts, club_id=club_id)
        except Exception:
            pass
        return resp

    # ─── Tournament Lifecycle State Transitions ────────────────────────────────

    async def open_registration(
        self, club_id: UUID, tournament_id: UUID, reset_schedule: bool = False
    ) -> TournamentResponse:
        """Transition tournament status from draft or registration_closed to registration_open.

        If reopening after matches were generated, requires reset_schedule=True to invalidate
        and clear the affected schedule, ensuring incomplete/stale registration data is not retained.
        """
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
                completed_count = await self.competition_repo.count_completed_matches(tournament_id)
                if completed_count > 0:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Cannot reopen registration: match results have already been recorded.",
                    )
                if not reset_schedule:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            "Matches have already been generated for this tournament. "
                            "Reopening registration will invalidate the generated schedule. "
                            "Pass reset_schedule=true to confirm schedule reset and reopen registration."
                        ),
                    )
                await self.competition_repo.delete_pending_matches(tournament_id)
            if tournament.format == TournamentFormat.POOL_PLAY:
                await self.competition_repo.delete_pool_teams_by_tournament(tournament_id)
                await self.competition_repo.delete_pools_by_tournament(tournament_id)
            config = dict(tournament.format_configuration or {})
            config["configuration_stage"] = "awaiting_format_configuration"
            config["is_format_configured"] = False
            config["configuration_saved"] = False
            config.pop("configuration_saved_at", None)
            if "pool_play_state" in config and isinstance(config["pool_play_state"], dict):
                pps = dict(config["pool_play_state"])
                pps.pop("teams", None)
                pps.pop("pools", None)
                pps.pop("matches", None)
                config["pool_play_state"] = pps
            await self.tournament_repo.update(tournament, format_configuration=config)

        updated = await self.tournament_repo.update(
            tournament, status=TournamentStatus.REGISTRATION_OPEN
        )
        await self.db.commit()
        counts = await compute_tournament_counts(self.db, updated)
        workflow_meta = await compute_tournament_workflow_meta(self.db, updated, counts)
        resp = _build_tournament_response(
            updated,
            participant_count=counts.participant_count,
            teams_count=counts.teams_count,
            confirmed_players_count=counts.confirmed_players_count,
            workflow_meta=workflow_meta,
        )
        try:
            await dispatch_event(
                event_type=EventType.TOURNAMENT_PUBLISHED,
                data={
                    "tournament_id": str(updated.id),
                    "name": updated.name,
                    "status": updated.status.value,
                    "participant_count": counts.participant_count,
                    "teams_count": counts.teams_count,
                    "confirmed_players_count": counts.confirmed_players_count,
                },
                club_id=club_id,
            )
            await self._broadcast_tournament_updated(updated, counts, club_id=club_id)
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

        # Stage 2: Authoritative backend closure validation (minimum, even count, pending & pairs)
        pre_counts = await compute_tournament_counts(self.db, tournament)
        pre_meta = await compute_tournament_workflow_meta(self.db, tournament, pre_counts)
        if not pre_meta.closure_eligibility.can_close:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=pre_meta.closure_eligibility.blocking_reason
                or "Cannot close registration: registration requirements are not met.",
            )

        closed_config = dict(tournament.format_configuration or {})
        closed_config.setdefault("configuration_stage", "awaiting_format_configuration")
        closed_config.setdefault("configuration_saved", False)

        updated = await self.tournament_repo.update(
            tournament,
            status=TournamentStatus.REGISTRATION_CLOSED,
            format_configuration=closed_config,
        )

        # For team-based / bracket tournaments, finalize teams and seed by skill rating
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
        refreshed = await self.tournament_repo.get_by_id(
            tournament_id=updated.id, club_id=club_id
        )
        target_t = refreshed or updated
        counts = await compute_tournament_counts(self.db, target_t)
        workflow_meta = await compute_tournament_workflow_meta(self.db, target_t, counts)
        resp = _build_tournament_response(
            target_t,
            participant_count=counts.participant_count,
            teams_count=counts.teams_count,
            confirmed_players_count=counts.confirmed_players_count,
            workflow_meta=workflow_meta,
        )
        try:
            await self._broadcast_tournament_updated(target_t, counts, club_id=club_id)
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
        counts = await compute_tournament_counts(self.db, updated)
        resp = _build_tournament_response(
            updated,
            participant_count=counts.participant_count,
            teams_count=counts.teams_count,
            confirmed_players_count=counts.confirmed_players_count,
        )
        try:
            await dispatch_event(
                event_type=EventType.TOURNAMENT_CANCELLED,
                data={
                    "tournament_id": str(updated.id),
                    "name": updated.name,
                    "status": updated.status.value,
                    "participant_count": counts.participant_count,
                    "teams_count": counts.teams_count,
                    "confirmed_players_count": counts.confirmed_players_count,
                },
                club_id=club_id,
            )
            await ws_manager.broadcast_all({
                "type": EventType.TOURNAMENT_CANCELLED.value,
                "data": serialize_for_event({"tournament_id": str(updated.id), "name": updated.name}),
                "club_id": str(club_id),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
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

    async def start_tournament(
        self, club_id: UUID, tournament_id: UUID
    ) -> TournamentResponse:
        """Transition tournament from registration_closed to in_progress.

        Must be explicitly called by a club admin after registration is closed
        and the draw / schedule is ready. Validates minimum confirmed participants.
        """
        tournament = await self.tournament_repo.get_by_id(
            tournament_id=tournament_id, club_id=club_id
        )
        if not tournament:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tournament not found in this club",
            )

        if tournament.status != TournamentStatus.REGISTRATION_CLOSED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot start tournament: status is '{tournament.status.value}', "
                    "must be 'registration_closed'."
                ),
            )

        # Validate minimum confirmed participants (format-aware: teams for doubles, players for singles/scramble)
        pre_counts = await compute_tournament_counts(self.db, tournament)
        confirmed_count = pre_counts.participant_count
        min_req = tournament.min_participants or 0
        if min_req > 0 and confirmed_count < min_req:
            unit_lbl = "confirmed team(s)" if pre_counts.is_doubles else "confirmed participant(s)"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot start tournament: only {confirmed_count} {unit_lbl}, "
                    f"minimum required is {min_req}."
                ),
            )

        # Validate that configuration and generated structure prerequisites are met across ALL 4 formats
        config = dict(tournament.format_configuration or {})
        if not bool(config.get("configuration_saved") or config.get("is_format_configured")):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot start tournament: format must be configured and generated first.",
            )

        if tournament.format == TournamentFormat.ROUND_ROBIN:
            matches_count = await self.competition_repo.count_all_matches(tournament_id)
            if matches_count == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot start Round Robin tournament: match schedule must be configured and generated first.",
                )
        elif tournament.format == TournamentFormat.BRACKET:
            matches_count = await self.competition_repo.count_all_matches(tournament_id)
            if matches_count == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot start Bracket tournament: bracket and matches must be configured and generated first.",
                )
        elif tournament.format == TournamentFormat.SCRAMBLE:
            matches_count = await self.competition_repo.count_all_matches(tournament_id)
            if matches_count == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot start Scramble tournament: rotation schedule must be configured and generated first.",
                )
            if config.get("round_status") in (None, "setup", "matchups_created"):
                config["round_status"] = "in_progress"
                current_round = config.get("current_round", 1)
                rounds_store = dict(config.get("rounds_data") or {})
                if str(current_round) in rounds_store and isinstance(rounds_store[str(current_round)], dict):
                    rounds_store[str(current_round)] = {
                        **rounds_store[str(current_round)],
                        "status": "in_progress",
                    }
                    config["rounds_data"] = rounds_store
        elif tournament.format == TournamentFormat.POOL_PLAY:
            pools = await self.competition_repo.list_pools_by_tournament(tournament_id)
            matches_count = await self.competition_repo.count_all_matches(tournament_id)
            pps = (tournament.format_configuration or {}).get("pool_play_state") or {}
            pps_matches_count = (
                len(pps.get("matches", []))
                if isinstance(pps.get("matches"), list)
                else 0
            )
            if not pools or (matches_count == 0 and pps_matches_count == 0):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot start Pool Play tournament: pools and match schedule must be configured and generated first.",
                )

        config["configuration_stage"] = "in_progress"
        updated = await self.tournament_repo.update(
            tournament, status=TournamentStatus.IN_PROGRESS, format_configuration=config
        )
        await self.db.commit()
        counts = await compute_tournament_counts(self.db, updated)
        workflow_meta = await compute_tournament_workflow_meta(self.db, updated, counts)
        resp = _build_tournament_response(
            updated,
            participant_count=counts.participant_count,
            teams_count=counts.teams_count,
            confirmed_players_count=counts.confirmed_players_count,
            workflow_meta=workflow_meta,
        )
        try:
            await self._broadcast_tournament_updated(updated, counts, club_id=club_id)
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
        tournament = await self.tournament_repo.get_by_id_for_update(
            tournament_id=tournament_id
        )
        if not tournament or tournament.club_id != club_id:
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
        prev_status = registration.status
        next_status = payload.status if payload.status is not None else prev_status

        if (
            next_status == RegistrationStatus.CONFIRMED
            and prev_status != RegistrationStatus.CONFIRMED
            and tournament.max_participants is not None
        ):
            pre_counts = await compute_tournament_counts(self.db, tournament)
            max_p = tournament.max_participants
            if pre_counts.is_doubles:
                if (
                    pre_counts.participant_count >= max_p
                    and pre_counts.confirmed_players_count + 1 > max_p * pre_counts.team_size
                ):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Cannot confirm registration: tournament is already at full capacity",
                    )
            elif pre_counts.participant_count + 1 > max_p:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot confirm registration: tournament is already at full capacity",
                )

        if payload.status == RegistrationStatus.CANCELLED and prev_status != RegistrationStatus.CANCELLED:
            update_data["cancelled_at"] = datetime.now(timezone.utc)
            matches_count = await self.competition_repo.count_all_matches(tournament.id)
            if matches_count == 0:
                await self.competition_repo.remove_player_from_teams(
                    tournament.id, registration.player_membership_id
                )
        elif payload.status in (RegistrationStatus.CONFIRMED, RegistrationStatus.PENDING, RegistrationStatus.WAITLISTED):
            update_data["cancelled_at"] = None

        updated = await self.registration_repo.update(registration, **update_data)
        await self.db.commit()
        counts = await compute_tournament_counts(self.db, tournament)
        try:
            await self._broadcast_tournament_updated(tournament, counts, club_id=club_id)
        except Exception:
            pass
        return _build_registration_response(updated)

    # ─── Player Discovery & Self-Registration ─────────────────────────────────

    async def list_public_tournaments(
        self,
        user_id: UUID | None = None,
        club_id: UUID | None = None,
        search: str | None = None,
        format: TournamentFormat | None = None,
        status: TournamentStatus | None = None,
        start_date_from: datetime | None = None,
        start_date_to: datetime | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[TournamentDiscoveryResponse]:
        """List all discoverable public tournaments with caller's registration status.
        For authenticated players, only tournaments from clubs where the player holds an active membership are returned.
        """
        user_membership_ids: set[UUID] = set()
        user_active_club_ids: set[UUID] = set()
        if user_id:
            user_memberships = await self.player_membership_repo.get_user_player_memberships(user_id)
            for m in user_memberships:
                if m.status == PlayerMembershipStatus.ACTIVE:
                    user_active_club_ids.add(m.club_id)
                    user_membership_ids.add(m.id)
            staff_memberships = await self.club_membership_repo.get_user_memberships(user_id)
            for sm in staff_memberships:
                if sm.is_active:
                    user_active_club_ids.add(sm.club_id)

            if not user_active_club_ids:
                return []
            if club_id and club_id not in user_active_club_ids:
                return []

        tournaments = await self.tournament_repo.list_public_discoverable(
            club_id=club_id,
            search=search,
            format=format,
            status=status,
            start_date_from=start_date_from,
            start_date_to=start_date_to,
            limit=limit,
            offset=offset,
        )

        if user_id and not club_id:
            tournaments = [t for t in tournaments if t.club_id in user_active_club_ids]

        refreshed_tournaments = [
            await self._auto_close_registration_if_deadline_passed(t)
            for t in tournaments
        ]
        counts_map = await compute_tournaments_counts(self.db, refreshed_tournaments)

        responses: list[TournamentDiscoveryResponse] = []
        now = datetime.now(timezone.utc)
        for t in refreshed_tournaments:
            t_counts = counts_map[t.id]
            reg_open = t.registration_open_at.replace(tzinfo=timezone.utc) if t.registration_open_at.tzinfo is None else t.registration_open_at
            reg_close = t.registration_close_at.replace(tzinfo=timezone.utc) if t.registration_close_at.tzinfo is None else t.registration_close_at
            is_open = (
                t.status == TournamentStatus.REGISTRATION_OPEN
                and reg_open <= now <= reg_close
            )

            my_reg = None
            if user_id:
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
                    participant_count=t_counts.participant_count,
                    teams_count=t_counts.teams_count,
                    confirmed_players_count=t_counts.confirmed_players_count,
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

        existing = await self.registration_repo.get_by_tournament_and_user(
            tournament_id=tournament.id,
            user_id=user_id,
        )

        player_membership = None
        if existing and getattr(existing, "player_membership", None):
            player_membership = existing.player_membership
        else:
            player_membership = await self.player_membership_repo.get_by_user_and_club(
                user_id=user_id, club_id=tournament.club_id
            )
            if not existing and player_membership:
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
        team = None
        if player_membership:
            team = await self.competition_repo.get_player_team_in_tournament(
                tournament_id=tournament.id,
                player_membership_id=player_membership.id,
            )
        partner_membership_id = None
        partner_name = None
        partner_email = None
        team_name = team.name if team else None
        team_id = team.id if team else None

        if team and hasattr(team, "members") and team.members:
            for m in team.members:
                if player_membership and m.player_membership_id != player_membership.id:
                    partner_membership_id = m.player_membership_id
                    pm = getattr(m, "player_membership", None)
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

        user = None
        if player_membership and hasattr(player_membership, "user") and player_membership.user:
            user = player_membership.user
        if not user:
            user = await self.user_repo.get_by_id(user_id)
        player_name = user.full_name if user and user.full_name else "Player"
        player_email = user.email if user and user.email else None

        payment_status = "FREE" if calc_fee == 0 else "NOT_COLLECTED"
        try:
            from app.models.payment import Payment, PaymentStatus
            from sqlalchemy import select
            stmt = select(Payment).where(
                Payment.tournament_id == tournament.id,
                Payment.player_id == user_id,
                Payment.status == PaymentStatus.SUCCEEDED,
            )
            existing_p = (await self.db.execute(stmt)).scalars().first()
            if existing_p:
                payment_status = "SUCCEEDED"
        except Exception as e:
            logger.warning(f"Error checking payment in get_player_registration_status: {e}")

        payment_method = "UPI"
        if existing.notes:
            if "card" in existing.notes.lower():
                payment_method = "Card"
            elif "upi" in existing.notes.lower():
                payment_method = "UPI"

        loc_name = tournament.location_name
        if not loc_name and hasattr(tournament, "club") and tournament.club:
            loc_name = tournament.club.name
        if not loc_name:
            loc_name = "Main Courts"

        status_val = existing.status.value if hasattr(existing.status, "value") else str(existing.status)
        status_label_val = (
            existing.status.display_label
            if hasattr(existing.status, "display_label")
            else status_val.capitalize()
        )
        t_format_val = tournament.format.value if hasattr(tournament.format, "value") else str(tournament.format)
        t_format_lbl = tournament.format.display_label if hasattr(tournament.format, "display_label") else t_format_val.replace("_", " ").title()
        reg_registered_at = existing.registered_at or getattr(existing, "created_at", None) or datetime.now(timezone.utc)

        reg_response = PlayerSelfRegistrationResponse(
            id=existing.id,
            tournament_id=tournament.id,
            status=existing.status,
            status_label=status_label_val,
            registered_at=reg_registered_at,
            cancelled_at=existing.cancelled_at,
            message=f"Registration status: {status_label_val}",
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
            tournament_format=t_format_val,
            tournament_format_label=t_format_lbl,
            division=division,
            location_name=loc_name,
            start_date=tournament.start_date,
            end_date=tournament.end_date,
            player_name=player_name,
            player_email=player_email,
            skill_level=skill_level,
        )

        is_active_reg = status_val in (
            RegistrationStatus.CONFIRMED.value,
            RegistrationStatus.PENDING.value,
            RegistrationStatus.WAITLISTED.value,
            "confirmed",
            "pending",
            "waitlisted",
        )

        return PlayerTournamentRegistrationStatusResponse(
            is_registered=is_active_reg,
            status=existing.status,
            status_label=status_label_val,
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
        skip_payment_creation: bool = False,
    ) -> PlayerSelfRegistrationResponse:
        """Register the authenticated user (and optional partner for doubles) in a tournament."""
        async with _get_tournament_lock(tournament_id):
            return await self._register_player_locked(
                tournament_id, user_id, payload, skip_payment_creation=skip_payment_creation
            )

    async def _register_player_locked(
        self,
        tournament_id: UUID,
        user_id: UUID,
        payload: PlayerSelfRegistrationRequest | None = None,
        skip_payment_creation: bool = False,
    ) -> PlayerSelfRegistrationResponse:
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
        is_doubles_model, resolved_team_size = resolve_tournament_registration_model(tournament)
        is_singles = (not is_scramble) and (not is_doubles_model)

        user = None
        if player_membership:
            try:
                user = player_membership.user
            except Exception:
                user = None
        if not user:
            user = await self.user_repo.get_by_id(user_id)

        # Authoritative profile retrieval directly from repository
        profile = await self.profile_repo.get_by_user_id(user_id)
        norm_payload_gender = (
            payload.gender.strip().capitalize()
            if payload and payload.gender and isinstance(payload.gender, str) and payload.gender.strip()
            else None
        )
        if not profile:
            user_full = user.full_name if user and user.full_name else "Player"
            profile = await self.profile_repo.create(
                user_id=user_id,
                display_name=user_full,
                gender=norm_payload_gender,
            )
            self.db.add(profile)
            await self.db.flush()
        elif norm_payload_gender and (not getattr(profile, "gender", None) or not str(profile.gender).strip()):
            profile.gender = norm_payload_gender
            self.db.add(profile)
            await self.db.flush()

        # Effective player gender resolves authoritatively from profile or registration payload
        player_gender = getattr(profile, "gender", None) or norm_payload_gender
        norm_gender = player_gender.strip().capitalize() if player_gender and isinstance(player_gender, str) and player_gender.strip() else None

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
        if not is_scramble and not is_singles and payload:
            if payload.partner_membership_id:
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
            elif payload.partner_email and payload.partner_email.strip():
                target_email = payload.partner_email.strip().lower()
                if user and user.email and target_email == user.email.strip().lower():
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="You cannot select yourself as a partner",
                    )
                partner_user = await self.user_repo.get_by_email(target_email)
                if partner_user:
                    pm = await self.player_membership_repo.get_by_user_and_club(
                        partner_user.id, tournament.club_id
                    )
                    if not pm:
                        pm = await self.player_membership_repo.create(
                            user_id=partner_user.id,
                            club_id=tournament.club_id,
                            status=PlayerMembershipStatus.ACTIVE,
                        )
                        await self.db.flush()
                    partner_membership = pm
                else:
                    from app.core.security import hash_password
                    from uuid import uuid4
                    partner_name = payload.partner_name or "Partner"
                    partner_user = await self.user_repo.create(
                        email=target_email,
                        hashed_password=hash_password(str(uuid4())),
                        full_name=partner_name,
                    )
                    pm = await self.player_membership_repo.create(
                        user_id=partner_user.id,
                        club_id=tournament.club_id,
                        status=PlayerMembershipStatus.ACTIVE,
                    )
                    await self.db.flush()
                    partner_membership = pm
            partner_profile = None
            if partner_user:
                partner_profile = await self.profile_repo.get_by_user_id(partner_user.id)
                norm_payload_partner_gender = (
                    payload.partner_gender.strip().capitalize()
                    if payload and getattr(payload, "partner_gender", None) and isinstance(payload.partner_gender, str) and payload.partner_gender.strip()
                    else None
                )
                if not partner_profile:
                    partner_full = partner_user.full_name or "Partner"
                    partner_profile = await self.profile_repo.create(
                        user_id=partner_user.id,
                        display_name=partner_full,
                        gender=norm_payload_partner_gender,
                    )
                    self.db.add(partner_profile)
                    await self.db.flush()
                elif norm_payload_partner_gender and (not getattr(partner_profile, "gender", None) or not str(partner_profile.gender).strip()):
                    partner_profile.gender = norm_payload_partner_gender
                    self.db.add(partner_profile)
                    await self.db.flush()

            partner_gender = (
                getattr(partner_profile, "gender", None)
                or (payload.partner_gender if payload and getattr(payload, "partner_gender", None) else None)
            )
            norm_partner_gender = partner_gender.strip().capitalize() if partner_gender and isinstance(partner_gender, str) and partner_gender.strip() else None

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
            if partner_membership:
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

        # Authoritative format-aware capacity check under tournament FOR UPDATE lock
        pre_counts = await compute_tournament_counts(self.db, tournament)
        is_doubles_model = pre_counts.is_doubles
        team_size = pre_counts.team_size
        max_p = tournament.max_participants

        if max_p is not None:
            if is_doubles_model:
                if partner_membership:
                    is_full = (
                        pre_counts.participant_count >= max_p
                        or (pre_counts.confirmed_players_count + 2) > (max_p * team_size)
                    )
                else:
                    is_full = (
                        pre_counts.participant_count >= max_p
                        or (pre_counts.confirmed_players_count + 1) > (max_p * team_size)
                    )
            else:
                is_full = (pre_counts.participant_count + 1) > max_p
        else:
            is_full = False

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

            # Reactivate cancelled registration (stay inside atomic transaction)
            reg = await self.registration_repo.update(
                existing,
                status=target_status,
                registered_at=datetime.now(timezone.utc),
                cancelled_at=None,
                notes=payload.notes if payload else None,
            )
        else:
            # Create new registration (stay inside atomic transaction)
            reg = await self.registration_repo.create(
                tournament_id=tournament.id,
                player_membership_id=player_membership.id,
                status=target_status,
            )
            if payload and payload.notes:
                reg.notes = payload.notes
            await self.db.flush()

        # If partner provided, register partner and create Team atomically in the same transaction
        created_team = None
        if partner_membership:
            partner_existing = await self.registration_repo.get_by_tournament_and_player(
                tournament_id=tournament.id,
                player_membership_id=partner_membership.id,
            )
            if partner_existing:
                if partner_existing.status in (
                    RegistrationStatus.CONFIRMED,
                    RegistrationStatus.PENDING,
                    RegistrationStatus.WAITLISTED,
                ):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Selected partner is already registered for this tournament",
                    )
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

            if target_status == RegistrationStatus.CONFIRMED:
                caller_name = (user.full_name if user and user.full_name else "Player 1").strip()
                partner_name = (partner_user.full_name if partner_user and partner_user.full_name else "Player 2").strip()
                team_name = (payload.team_name if payload and payload.team_name else f"{caller_name} & {partner_name}").strip()

                # Clean up any stale incomplete team remnants (e.g. after prior partner cancellation)
                for pm_check in (player_membership.id, partner_membership.id):
                    prior_team = await self.competition_repo.get_player_team_in_tournament(
                        tournament.id, pm_check
                    )
                    if prior_team and len(getattr(prior_team, "members", []) or []) < team_size:
                        await self.competition_repo.remove_player_from_teams(tournament.id, pm_check)

                existing_player_team = await self.competition_repo.get_player_team_in_tournament(
                    tournament.id, player_membership.id
                )
                if existing_player_team:
                    created_team = existing_player_team
                else:
                    existing_teams = await self.competition_repo.list_teams_by_tournament(tournament.id)
                    existing_names = {t.name.lower() for t in existing_teams}
                    final_team_name = team_name
                    counter = 2
                    while final_team_name.lower() in existing_names:
                        final_team_name = f"{team_name} {counter}"
                        counter += 1

                    created_team = await self.competition_repo.create_team(
                        tournament_id=tournament.id,
                        name=final_team_name,
                    )
                    await self.competition_repo.create_team_member(
                        team_id=created_team.id,
                        player_membership_id=player_membership.id,
                    )
                    await self.competition_repo.create_team_member(
                        team_id=created_team.id,
                        player_membership_id=partner_membership.id,
                    )

        elif is_singles and target_status == RegistrationStatus.CONFIRMED:
            caller_name = (
                profile.display_name
                if profile and profile.display_name
                else (user.full_name if user and user.full_name else "Player")
            ).strip()
            team_name = (payload.team_name if payload and payload.team_name else caller_name).strip()
            existing_player_team = await self.competition_repo.get_player_team_in_tournament(
                tournament.id, player_membership.id
            )
            if existing_player_team:
                created_team = existing_player_team
            else:
                existing_teams = await self.competition_repo.list_teams_by_tournament(tournament.id)
                existing_names = {t.name.lower() for t in existing_teams}
                final_team_name = team_name
                counter = 2
                while final_team_name.lower() in existing_names:
                    final_team_name = f"{team_name} {counter}"
                    counter += 1

                created_team = await self.competition_repo.create_team(
                    tournament_id=tournament.id,
                    name=final_team_name,
                )
                await self.competition_repo.create_team_member(
                    team_id=created_team.id,
                    player_membership_id=player_membership.id,
                )

        # Calculate configured fee
        fee_raw = format_config.get("entry_fee") or format_config.get("registration_fee")
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
        pref_method = payload.payment_method if payload and payload.payment_method else ("free" if calc_fee == 0 else "upi")

        # Record preferred payment method in registration notes if provided
        reg_notes = payload.notes if payload and payload.notes else ""
        if payload and payload.payment_method and calc_fee > 0:
            pref_tag = f"[Payment Preference: {payload.payment_method.upper()}]"
            if pref_tag not in reg_notes:
                reg_notes = f"{pref_tag} {reg_notes}".strip()
        reg.notes = reg_notes if reg_notes else None

        # Record canonical payment record (including $0.00 free entry transactions)
        from decimal import Decimal
        from sqlalchemy import select
        from app.models.payment import Payment, PaymentMethod, PaymentPurpose, PaymentStatus
        from app.repositories.payment_repository import PaymentRepository

        created_payment: Payment | None = None
        if not skip_payment_creation and (target_status != RegistrationStatus.WAITLISTED or calc_fee == 0):
            existing_pmt_stmt = (
                select(Payment)
                .where(
                    Payment.tournament_id == tournament.id,
                    Payment.player_id == user_id,
                    Payment.status.in_([PaymentStatus.SUCCEEDED, PaymentStatus.PENDING]),
                )
                .order_by(Payment.created_at.desc())
            )
            created_payment = (await self.db.execute(existing_pmt_stmt)).scalars().first()
            if not created_payment:
                pay_repo = PaymentRepository(self.db)
                pay_ref = await pay_repo.generate_reference()
                pay_amount = Decimal(str(round(calc_fee, 2)))
                is_free_entry = pay_amount <= Decimal("0.00")
                is_collected = True if is_free_entry else (payload.payment_collected is not False if payload else True)
                created_payment = Payment(
                    reference=pay_ref,
                    club_id=tournament.club_id,
                    player_id=user_id,
                    tournament_id=tournament.id,
                    amount=pay_amount,
                    currency="USD",
                    status=PaymentStatus.SUCCEEDED if (is_free_entry or is_collected) else PaymentStatus.PENDING,
                    purpose=PaymentPurpose.TOURNAMENT,
                    payment_method=PaymentMethod.OTHER if (is_free_entry or not is_collected) else PaymentMethod.ONLINE,
                    paid_at=now if (is_free_entry or is_collected) else None,
                    notes=f"{'Free tournament registration' if is_free_entry else 'Tournament registration'}: {tournament.name}",
                    created_by_user_id=user_id,
                )
                await pay_repo.create(created_payment)
        elif skip_payment_creation:
            existing_pmt_stmt = (
                select(Payment)
                .where(
                    Payment.tournament_id == tournament.id,
                    Payment.player_id == user_id,
                    Payment.status.in_([PaymentStatus.SUCCEEDED, PaymentStatus.PENDING]),
                )
                .order_by(Payment.created_at.desc())
            )
            created_payment = (await self.db.execute(existing_pmt_stmt)).scalars().first()

        if target_status == RegistrationStatus.WAITLISTED and calc_fee > 0:
            calc_payment_status = "WAITLISTED"
        elif calc_fee == 0:
            calc_payment_status = "FREE"
        elif created_payment and created_payment.status == PaymentStatus.SUCCEEDED:
            calc_payment_status = "SUCCEEDED"
        elif created_payment and created_payment.status == PaymentStatus.PENDING:
            calc_payment_status = "PENDING"
        else:
            calc_payment_status = "NOT_COLLECTED"

        await self.db.commit()

        counts = await compute_tournament_counts(self.db, tournament)

        loc_name = tournament.location_name
        if not loc_name:
            try:
                loc_name = tournament.club.name if hasattr(tournament, "club") and tournament.club else "Main Courts"
            except Exception:
                loc_name = "Main Courts"

        status_label_val = (
            reg.status.display_label
            if hasattr(reg.status, "display_label")
            else str(reg.status.value if hasattr(reg.status, "value") else reg.status).capitalize()
        )
        t_format_val = tournament.format.value if hasattr(tournament.format, "value") else str(tournament.format)
        t_format_lbl = tournament.format.display_label if hasattr(tournament.format, "display_label") else t_format_val.replace("_", " ").title()

        resp_obj = PlayerSelfRegistrationResponse(
            id=reg.id,
            tournament_id=tournament.id,
            status=reg.status,
            status_label=status_label_val,
            registered_at=reg.registered_at,
            message=msg,
            reference_number=ref_no,
            registration_type="individual" if (is_scramble or is_singles) else "team",
            team_id=created_team.id if created_team else None,
            team_name=created_team.name if created_team else None,
            partner_membership_id=partner_membership.id if partner_membership else None,
            partner_name=partner_user.full_name if partner_user else None,
            fee_amount=calc_fee,
            payment_id=created_payment.id if created_payment else None,
            payment_status=calc_payment_status,
            payment_method=pref_method,
            notes=reg.notes,
            tournament_name=tournament.name,
            tournament_format=t_format_val,
            tournament_format_label=t_format_lbl,
            division=category or "3.5 Division",
            location_name=loc_name,
            start_date=tournament.start_date,
            end_date=tournament.end_date,
            player_name=user.full_name if user else "Player",
            player_email=user.email if user else None,
            skill_level=payload.skill_level if payload and payload.skill_level else "3.5",
            participant_count=counts.participant_count,
            teams_count=counts.teams_count,
            confirmed_players_count=counts.confirmed_players_count,
        )

        try:
            event_payload = {
                "tournament_id": str(tournament.id),
                "tournament_name": tournament.name,
                "registration_id": str(reg.id),
                "user_id": str(user_id),
                "status": reg.status.value,
                "participant_count": counts.participant_count,
                "teams_count": counts.teams_count,
                "confirmed_players_count": counts.confirmed_players_count,
                "reference_number": ref_no,
            }
            await self._broadcast_tournament_updated(
                tournament,
                counts,
                extra_event_type=EventType.TOURNAMENT_REGISTRATION_CREATED,
                extra_payload=event_payload,
                user_id=user_id,
            )
            if created_payment:
                await dispatch_event(
                    event_type="payment.confirmed" if created_payment.status == PaymentStatus.SUCCEEDED else "payment.created",
                    data={
                        "payment_id": str(created_payment.id),
                        "tournament_id": str(tournament.id),
                        "purpose": created_payment.purpose.value,
                        "amount": float(created_payment.amount),
                        "status": created_payment.status.value,
                        "club_id": str(tournament.club_id),
                        "player_id": str(user_id),
                        "reference": created_payment.reference,
                    },
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
        async with _get_tournament_lock(tournament_id):
            return await self._cancel_player_registration_locked(tournament_id, user_id)

    async def _cancel_player_registration_locked(
        self, tournament_id: UUID, user_id: UUID
    ) -> PlayerSelfRegistrationResponse:
        tournament = await self.tournament_repo.get_by_id_for_update(tournament_id)
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

        # If registration was closed and schedule had been generated, handle schedule invalidation cleanly
        matches_count = await self.competition_repo.count_all_matches(tournament.id)
        if tournament.status == TournamentStatus.REGISTRATION_CLOSED and matches_count > 0:
            completed = await self.competition_repo.count_completed_matches(tournament.id)
            if completed == 0:
                await self.competition_repo.delete_pending_matches(tournament.id)
                if tournament.format == TournamentFormat.POOL_PLAY:
                    await self.competition_repo.delete_pool_teams_by_tournament(tournament.id)
                    await self.competition_repo.delete_pools_by_tournament(tournament.id)
                config = dict(tournament.format_configuration or {})
                config["configuration_stage"] = "awaiting_format_configuration"
                config["is_format_configured"] = False
                config["schedule_invalidated_notice"] = "Schedule invalidated: player registration was cancelled. Review and regenerate schedule."
                await self.tournament_repo.update(tournament, format_configuration=config)
                matches_count = 0

        if matches_count == 0:
            await self.competition_repo.remove_player_from_teams(
                tournament.id, player_membership.id
            )

        # Refund paid payment or cancel free/pending payment on cancellation
        from decimal import Decimal
        from sqlalchemy import select
        from app.models.payment import Payment, PaymentStatus
        pmt_stmt = (
            select(Payment)
            .where(
                Payment.tournament_id == tournament.id,
                Payment.player_id == user_id,
                Payment.status.in_([PaymentStatus.SUCCEEDED, PaymentStatus.PENDING]),
            )
            .order_by(Payment.created_at.desc())
        )
        cancelled_pmt = (await self.db.execute(pmt_stmt)).scalars().first()
        if cancelled_pmt:
            now_dt = datetime.now(timezone.utc)
            if cancelled_pmt.status == PaymentStatus.SUCCEEDED and cancelled_pmt.amount > Decimal("0"):
                cancelled_pmt.status = PaymentStatus.REFUNDED
                cancelled_pmt.refunded_amount = cancelled_pmt.amount
                cancelled_pmt.refund_reason = "Tournament registration cancelled by player"
                cancelled_pmt.refunded_at = now_dt
            else:
                cancelled_pmt.status = PaymentStatus.CANCELLED
                cancelled_pmt.cancelled_at = now_dt
            cancelled_pmt.status_changed_by_user_id = user_id
            cancelled_pmt.updated_at = now_dt
            await self.db.flush()

        await self.db.commit()
        counts = await compute_tournament_counts(self.db, tournament)

        cancel_resp = PlayerSelfRegistrationResponse(
            id=updated.id,
            tournament_id=tournament.id,
            status=updated.status,
            status_label=updated.status.display_label if hasattr(updated.status, "display_label") else str(updated.status).capitalize(),
            registered_at=updated.registered_at,
            message="Registration successfully cancelled",
            participant_count=counts.participant_count,
            teams_count=counts.teams_count,
            confirmed_players_count=counts.confirmed_players_count,
        )

        try:
            event_payload = {
                "tournament_id": str(tournament.id),
                "tournament_name": tournament.name,
                "registration_id": str(updated.id),
                "user_id": str(user_id),
                "status": updated.status.value,
                "participant_count": counts.participant_count,
                "teams_count": counts.teams_count,
                "confirmed_players_count": counts.confirmed_players_count,
            }
            await self._broadcast_tournament_updated(
                tournament,
                counts,
                extra_event_type=EventType.TOURNAMENT_REGISTRATION_CANCELLED,
                extra_payload=event_payload,
                user_id=user_id,
            )
            if cancelled_pmt:
                await dispatch_event(
                    event_type="payment.updated",
                    data={
                        "payment_id": str(cancelled_pmt.id),
                        "tournament_id": str(tournament.id),
                        "status": cancelled_pmt.status.value,
                        "club_id": str(tournament.club_id),
                        "player_id": str(user_id),
                    },
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
