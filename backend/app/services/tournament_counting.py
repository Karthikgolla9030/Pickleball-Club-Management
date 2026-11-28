"""
Aught2 Pickleball — Authoritative Tournament Registration & Capacity Counting

Single source of truth for format-aware tournament participant and team counts.
Eliminates duplicated naive counting (`len(confirmed) // 2`, raw registration length,
or stale relationship counts) across TournamentService, CompetitionService,
PlayerService, and WebSocket broadcasts.

Counting rules by tournament format and configured registration model:
- Scramble (`format == scramble`):
    Always counts distinct CONFIRMED registrations belonging to ACTIVE club
    player memberships (`teams_count = None`).
- Singles (`team_size == 1` / singles category):
    Counts distinct CONFIRMED registrations belonging to ACTIVE club player
    memberships (`teams_count = None`).
- Doubles (`team_size == 2` across Round Robin, Bracket, Pool Play):
    - `participant_count` == `teams_count` == number of confirmed teams.
    - `confirmed_players_count` == number of distinct CONFIRMED active players.
    - Pending, waitlisted, rejected, cancelled, and inactive-membership
      registrations are strictly excluded from confirmed counts.
    - Pool Play counts confirmed teams regardless of whether pools or pool
      assignments have been configured yet.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.club_player_membership import ClubPlayerMembership, PlayerMembershipStatus
from app.models.competition import Team, TeamMember
from app.models.tournament import Tournament, TournamentFormat
from app.models.tournament_registration import RegistrationStatus, TournamentRegistration


@dataclass(frozen=True)
class TournamentCounts:
    """Authoritative counts for a single tournament."""

    participant_count: int
    teams_count: int | None
    confirmed_players_count: int
    is_doubles: bool
    team_size: int


def resolve_tournament_registration_model(tournament: Tournament) -> tuple[bool, int]:
    """
    Determine `(is_doubles, team_size)` from tournament format + format_configuration.

    Scramble is always individual (`(False, 1)`).
    For Round Robin, Bracket, and Pool Play, inspects explicit `team_size`,
    `registration_type`, and category fallbacks so doubles tournaments are never
    misclassified as singles when `team_size` is omitted.
    """
    if tournament.format == TournamentFormat.SCRAMBLE:
        return (False, 1)

    cfg = tournament.format_configuration or {}
    category = str(
        cfg.get("category") or cfg.get("competition_category") or ""
    ).strip().lower()
    reg_type = str(cfg.get("registration_type") or "").strip().lower()

    if "scramble" in category:
        return (False, 1)

    if "doubles" in category and reg_type != "individual":
        raw_team_size = cfg.get("team_size")
        try:
            ts = int(raw_team_size) if raw_team_size is not None else 2
        except (TypeError, ValueError):
            ts = 2
        return (True, max(2, ts))

    raw_team_size = cfg.get("team_size")
    if raw_team_size is not None:
        try:
            ts = int(raw_team_size)
            if ts >= 2:
                return (True, ts)
            if ts == 1:
                return (False, 1)
        except (TypeError, ValueError):
            pass

    if reg_type == "team":
        return (True, 2)
    if "singles" in category or reg_type == "individual":
        return (False, 1)

    return (False, 1)


async def compute_tournaments_counts(
    db: AsyncSession,
    tournaments: Sequence[Tournament],
) -> dict[UUID, TournamentCounts]:
    """
    Compute authoritative format-aware counts in batch for a list of tournaments.

    Only counts CONFIRMED registrations backed by ACTIVE ClubPlayerMembership rows
    matching each tournament's `club_id`.
    For doubles tournaments with persisted Team records, counts confirmed complete
    teams (all `team_size` members holding CONFIRMED active registrations in the
    tournament). Falls back to `confirmed_players_count // team_size` only when
    confirmed registrations exist before any Team rows have been created.
    """
    if not tournaments:
        return {}

    t_by_id: dict[UUID, Tournament] = {t.id: t for t in tournaments}
    t_ids = list(t_by_id.keys())
    models_by_tid: dict[UUID, tuple[bool, int]] = {
        t.id: resolve_tournament_registration_model(t) for t in tournaments
    }

    reg_stmt = (
        select(
            TournamentRegistration.tournament_id,
            TournamentRegistration.player_membership_id,
        )
        .join(
            ClubPlayerMembership,
            ClubPlayerMembership.id == TournamentRegistration.player_membership_id,
        )
        .join(
            Tournament,
            Tournament.id == TournamentRegistration.tournament_id,
        )
        .where(
            TournamentRegistration.tournament_id.in_(t_ids),
            TournamentRegistration.status == RegistrationStatus.CONFIRMED,
            ClubPlayerMembership.status == PlayerMembershipStatus.ACTIVE,
            ClubPlayerMembership.club_id == Tournament.club_id,
        )
    )
    reg_res = await db.execute(reg_stmt)
    confirmed_pms_by_tid: dict[UUID, set[UUID]] = {tid: set() for tid in t_ids}
    for tid, pm_id in reg_res.all():
        if tid in confirmed_pms_by_tid and pm_id is not None:
            confirmed_pms_by_tid[tid].add(pm_id)

    doubles_tids = [tid for tid, (is_doubles, _) in models_by_tid.items() if is_doubles]
    teams_by_tid: dict[UUID, dict[UUID, list[UUID]]] = {tid: {} for tid in doubles_tids}

    if doubles_tids:
        team_stmt = (
            select(
                Team.tournament_id,
                Team.id,
                TeamMember.player_membership_id,
            )
            .outerjoin(TeamMember, TeamMember.team_id == Team.id)
            .where(Team.tournament_id.in_(doubles_tids))
        )
        team_res = await db.execute(team_stmt)
        for tid, team_id, pm_id in team_res.all():
            bucket = teams_by_tid.setdefault(tid, {})
            members = bucket.setdefault(team_id, [])
            if pm_id is not None:
                members.append(pm_id)

    results: dict[UUID, TournamentCounts] = {}
    for tid in t_ids:
        is_doubles, team_size = models_by_tid[tid]
        confirmed_pms = confirmed_pms_by_tid.get(tid, set())
        confirmed_players_count = len(confirmed_pms)

        if not is_doubles:
            results[tid] = TournamentCounts(
                participant_count=confirmed_players_count,
                teams_count=None,
                confirmed_players_count=confirmed_players_count,
                is_doubles=False,
                team_size=1,
            )
            continue

        team_map = teams_by_tid.get(tid, {})
        if team_map:
            valid_teams_count = 0
            all_teamed_pms: set[UUID] = set()
            for member_ids in team_map.values():
                unique_members = set(member_ids)
                all_teamed_pms.update(unique_members)
                if len(unique_members) == team_size and unique_members.issubset(confirmed_pms):
                    valid_teams_count += 1
            unpaired_never_teamed = len(confirmed_pms - all_teamed_pms)
            confirmed_teams = valid_teams_count + (unpaired_never_teamed // team_size)
        else:
            confirmed_teams = confirmed_players_count // team_size

        results[tid] = TournamentCounts(
            participant_count=confirmed_teams,
            teams_count=confirmed_teams,
            confirmed_players_count=confirmed_players_count,
            is_doubles=True,
            team_size=team_size,
        )

    return results


async def compute_tournament_counts(
    db: AsyncSession,
    tournament: Tournament,
) -> TournamentCounts:
    """Compute authoritative format-aware counts for a single tournament."""
    counts_map = await compute_tournaments_counts(db, [tournament])
    return counts_map[tournament.id]
