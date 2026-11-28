"""
Aught2 Pickleball — Authoritative Tournament Workflow & Validation Service

Single source of truth across all four tournament formats (Round Robin, Bracket,
Pool Play, Scramble) for:
1. Format-specific minimum registration rules
2. Registration closure validation (pending checks, incomplete doubles pairs,
   minimum count, strict even-count requirement)
3. Authoritative lifecycle workflow state
4. Active club court resolution and concurrent court capacity validation
5. Consistent format configuration persistence metadata
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Sequence
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.competition import Match, Team, TeamMember
from app.models.court import Court
from app.models.tournament import Tournament, TournamentFormat, TournamentStatus
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration
from app.repositories.court_repository import CourtRepository
from app.services.tournament_counting import (
    TournamentCounts,
    compute_tournament_counts,
    compute_tournaments_counts,
    resolve_tournament_registration_model,
)


WORKFLOW_STATE_LABELS: dict[str, str] = {
    "draft": "Draft",
    "registration_open": "Registration Open (Ready to Close)",
    "registration_closure_blocked": "Registration Open (Closure Blocked)",
    "configuration_required": "Registration Closed — Setup Required",
    "configuration_saved": "Configuration Saved — Ready to Generate",
    "structure_generated": "Schedule Generated — Ready to Start",
    "in_progress": "In Progress",
    "completed": "Completed",
    "cancelled": "Cancelled",
}


@dataclass(frozen=True)
class ClosureEligibility:
    can_close: bool
    confirmed_count: int
    minimum_required: int
    unit_label: str
    unit_label_plural: str
    is_even: bool
    pending_count: int
    incomplete_teams_count: int
    blocking_reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "can_close": self.can_close,
            "confirmed_count": self.confirmed_count,
            "minimum_required": self.minimum_required,
            "unit_label": self.unit_label,
            "unit_label_plural": self.unit_label_plural,
            "is_even": self.is_even,
            "pending_count": self.pending_count,
            "incomplete_teams_count": self.incomplete_teams_count,
            "blocking_reason": self.blocking_reason,
        }


@dataclass(frozen=True)
class TournamentWorkflowSnapshot:
    workflow_state: str
    workflow_state_label: str
    configuration_saved: bool
    configuration_saved_at: str | None
    structure_generated: bool
    matches_count: int
    closure_eligibility: ClosureEligibility


def get_format_minimum_participants(tournament: Tournament) -> int:
    """
    Derive the authoritative minimum confirmed participant/team count required to close
    registration and run a valid tournament for each format.
    """
    configured_min = tournament.min_participants or 0
    if tournament.format in (TournamentFormat.POOL_PLAY, TournamentFormat.SCRAMBLE):
        return max(4, configured_min)
    return max(2, configured_min)


async def compute_tournaments_closure_eligibility(
    db: AsyncSession,
    tournaments: Sequence[Tournament],
    counts_map: dict[UUID, TournamentCounts] | None = None,
) -> dict[UUID, ClosureEligibility]:
    """Compute closure eligibility diagnostics in batch for multiple tournaments."""
    if not tournaments:
        return {}

    if counts_map is None:
        counts_map = await compute_tournaments_counts(db, tournaments)

    t_ids = [t.id for t in tournaments]
    t_by_id = {t.id: t for t in tournaments}

    # Pending registrations backed by active club memberships
    pending_stmt = (
        select(
            TournamentRegistration.tournament_id,
            func.count(TournamentRegistration.id),
        )
        .join(
            ClubPlayerMembership,
            ClubPlayerMembership.id == TournamentRegistration.player_membership_id,
        )
        .where(
            TournamentRegistration.tournament_id.in_(t_ids),
            TournamentRegistration.status == RegistrationStatus.PENDING,
            ClubPlayerMembership.status == PlayerMembershipStatus.ACTIVE,
        )
        .group_by(TournamentRegistration.tournament_id)
    )
    pending_res = await db.execute(pending_stmt)
    pending_by_tid: dict[UUID, int] = {tid: int(cnt) for tid, cnt in pending_res.all()}

    # Incomplete team detection for doubles tournaments
    doubles_tids = [t.id for t in tournaments if resolve_tournament_registration_model(t)[0]]
    incomplete_teams_by_tid: dict[UUID, int] = {tid: 0 for tid in t_ids}
    if doubles_tids:
        team_stmt = (
            select(
                Team.tournament_id,
                Team.id,
                func.count(TeamMember.id),
            )
            .outerjoin(TeamMember, TeamMember.team_id == Team.id)
            .where(Team.tournament_id.in_(doubles_tids))
            .group_by(Team.tournament_id, Team.id)
        )
        team_res = await db.execute(team_stmt)
        for tid, _team_id, member_count in team_res.all():
            _, team_size = resolve_tournament_registration_model(t_by_id[tid])
            if int(member_count) != team_size:
                incomplete_teams_by_tid[tid] = incomplete_teams_by_tid.get(tid, 0) + 1

    results: dict[UUID, ClosureEligibility] = {}
    for t in tournaments:
        counts = counts_map[t.id]
        is_doubles = counts.is_doubles
        confirmed_count = counts.participant_count
        min_required = get_format_minimum_participants(t)
        unit_label = "team" if is_doubles else "player"
        unit_plural = "teams" if is_doubles else "players"
        pending_count = pending_by_tid.get(t.id, 0)

        incomplete_count = incomplete_teams_by_tid.get(t.id, 0)
        if is_doubles and counts.confirmed_players_count > confirmed_count * counts.team_size:
            unpaired_players = counts.confirmed_players_count - (confirmed_count * counts.team_size)
            incomplete_count = max(incomplete_count, unpaired_players)

        is_even = confirmed_count % 2 == 0
        blocking_reason: str | None = None

        if pending_count > 0:
            blocking_reason = (
                f"{pending_count} pending registration{'s' if pending_count != 1 else ''} "
                "must be confirmed or resolved before closing registration."
            )
        elif incomplete_count > 0:
            blocking_reason = (
                f"{incomplete_count} incomplete doubles registration{'s' if incomplete_count != 1 else ''} "
                "must be paired or removed before closing registration."
            )
        elif confirmed_count < min_required:
            unit_text = unit_label if confirmed_count == 1 else unit_plural
            blocking_reason = (
                f"Only {confirmed_count} confirmed {unit_text}. "
                f"At least {min_required} {unit_plural} are required to close registration."
            )
        elif not is_even:
            blocking_reason = (
                f"{confirmed_count} confirmed {unit_plural}. "
                "An even number is required. Add or remove a registration before closing."
            )

        results[t.id] = ClosureEligibility(
            can_close=blocking_reason is None,
            confirmed_count=confirmed_count,
            minimum_required=min_required,
            unit_label=unit_label,
            unit_label_plural=unit_plural,
            is_even=is_even,
            pending_count=pending_count,
            incomplete_teams_count=incomplete_count,
            blocking_reason=blocking_reason,
        )

    return results


async def compute_tournaments_workflow_meta(
    db: AsyncSession,
    tournaments: Sequence[Tournament],
    counts_map: dict[UUID, TournamentCounts] | None = None,
) -> dict[UUID, TournamentWorkflowSnapshot]:
    """Compute authoritative workflow state, saved-config flags, and closure eligibility in batch."""
    if not tournaments:
        return {}

    t_ids = [t.id for t in tournaments]
    eligibility_map = await compute_tournaments_closure_eligibility(db, tournaments, counts_map)

    match_stmt = (
        select(Match.tournament_id, func.count(Match.id))
        .where(Match.tournament_id.in_(t_ids))
        .group_by(Match.tournament_id)
    )
    match_res = await db.execute(match_stmt)
    matches_by_tid: dict[UUID, int] = {tid: int(cnt) for tid, cnt in match_res.all()}

    snapshots: dict[UUID, TournamentWorkflowSnapshot] = {}
    for t in tournaments:
        cfg = t.format_configuration if isinstance(t.format_configuration, dict) else {}
        pps = cfg.get("pool_play_state") if isinstance(cfg.get("pool_play_state"), dict) else {}
        config_saved = bool(cfg.get("configuration_saved", False))
        config_saved_at = cfg.get("configuration_saved_at")
        matches_count = matches_by_tid.get(t.id, 0)
        pps_matches_count = (
            len(pps.get("matches", []))
            if isinstance(pps.get("matches"), list)
            else 0
        )
        structure_generated = (
            matches_count > 0
            or pps_matches_count > 0
            or bool(
                cfg.get("is_format_configured", False)
                and cfg.get("configuration_stage") in ("ready_to_start", "schedule_generated", "in_progress")
            )
        )
        is_effectively_completed = (
            t.status == TournamentStatus.COMPLETED
            or bool(cfg.get("winner"))
            or bool(pps.get("completed"))
            or bool(pps.get("is_completed"))
            or bool(pps.get("winner"))
        )
        effective_config_saved = (
            config_saved
            or structure_generated
            or is_effectively_completed
            or t.status == TournamentStatus.IN_PROGRESS
        )
        eligibility = eligibility_map[t.id]

        if t.status == TournamentStatus.DRAFT:
            state = "draft"
        elif t.status == TournamentStatus.CANCELLED:
            state = "cancelled"
        elif is_effectively_completed:
            state = "completed"
        elif t.status == TournamentStatus.IN_PROGRESS:
            state = "in_progress"
        elif t.status == TournamentStatus.REGISTRATION_OPEN:
            state = "registration_open" if eligibility.can_close else "registration_closure_blocked"
        elif structure_generated:
            state = "structure_generated"
        elif effective_config_saved:
            state = "configuration_saved"
        else:
            state = "configuration_required"

        snapshots[t.id] = TournamentWorkflowSnapshot(
            workflow_state=state,
            workflow_state_label=WORKFLOW_STATE_LABELS.get(state, state),
            configuration_saved=effective_config_saved,
            configuration_saved_at=config_saved_at if isinstance(config_saved_at, str) else None,
            structure_generated=structure_generated,
            matches_count=matches_count,
            closure_eligibility=eligibility,
        )

    return snapshots


async def compute_tournament_workflow_meta(
    db: AsyncSession,
    tournament: Tournament,
    counts: TournamentCounts | None = None,
) -> TournamentWorkflowSnapshot:
    counts_map = {tournament.id: counts} if counts is not None else await compute_tournaments_counts(db, [tournament])
    meta_map = await compute_tournaments_workflow_meta(db, [tournament], counts_map)
    return meta_map[tournament.id]


def serialize_court_summary(court: Court) -> dict[str, Any]:
    return {
        "id": str(court.id),
        "name": court.display_name or court.name,
        "court_number": court.court_number,
        "surface_type": court.surface_type,
        "indoor_outdoor": (
            court.indoor_outdoor.value
            if hasattr(court.indoor_outdoor, "value")
            else str(court.indoor_outdoor)
        ),
        "is_active": bool(court.is_active),
    }


async def resolve_and_validate_courts(
    court_repo: CourtRepository,
    club_id: UUID,
    tournament: Tournament,
    requested_court_ids: list[str] | None = None,
    requested_courts_count: int | None = None,
    require_at_least_one_when_courts_exist: bool = False,
) -> tuple[list[Court], list[Court], int]:
    """
    Resolve active club courts and validate requested `selected_court_ids` + `courts_count`.

    Returns `(all_active_courts, selected_active_courts, effective_courts_count)`.
    """
    active_courts = await court_repo.list_by_club(club_id, is_active=True)
    active_by_id = {str(c.id): c for c in active_courts}

    cfg = tournament.format_configuration if isinstance(tournament.format_configuration, dict) else {}
    raw_selected_ids = cfg.get("selected_court_ids")
    raw_assigned_ids = cfg.get("assigned_courts")
    saved_ids = raw_selected_ids if isinstance(raw_selected_ids, list) and raw_selected_ids else raw_assigned_ids
    has_saved_config = bool(cfg.get("configuration_saved", False))

    selected_courts: list[Court] = []
    if requested_court_ids is not None:
        seen: set[str] = set()
        for raw_id in requested_court_ids:
            sid = str(raw_id).strip()
            if not sid or sid in seen:
                continue
            court = active_by_id.get(sid)
            if not court:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="One or more selected courts are inactive or do not belong to this club.",
                )
            seen.add(sid)
            selected_courts.append(court)
        if not selected_courts:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Select at least 1 active club court.",
            )
    elif isinstance(saved_ids, list) and saved_ids:
        seen = set()
        for raw_id in saved_ids:
            sid = str(raw_id).strip()
            if sid in active_by_id and sid not in seen:
                seen.add(sid)
                selected_courts.append(active_by_id[sid])
        if not selected_courts and active_courts:
            selected_courts = list(active_courts)
    else:
        selected_courts = list(active_courts)

    if require_at_least_one_when_courts_exist and not selected_courts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active club courts are selected or available. Activate or select at least 1 court.",
        )

    if requested_courts_count is not None:
        if requested_courts_count < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Concurrent court capacity must be at least 1.",
            )
        if selected_courts and requested_courts_count > len(selected_courts):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Concurrent court capacity ({requested_courts_count}) cannot exceed "
                    f"selected active courts ({len(selected_courts)})."
                ),
            )
        if not selected_courts and active_courts:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Select at least 1 active club court before setting concurrent court capacity.",
            )
        effective_count = requested_courts_count
    else:
        saved_count = cfg.get("courts_count")
        has_explicit_court_selection = isinstance(raw_selected_ids, list) and len(raw_selected_ids) > 0
        if (has_saved_config or has_explicit_court_selection) and isinstance(saved_count, int) and saved_count >= 1:
            effective_count = min(saved_count, len(selected_courts)) if selected_courts else saved_count
        else:
            effective_count = len(selected_courts)

    return active_courts, selected_courts, effective_count
