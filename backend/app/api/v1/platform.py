"""
Aught2 Pickleball — Platform Owner Management API Endpoints

Privileged platform owner review workflows:
- List pending, approved, and rejected club registration applications
- Inspect complete application details
- Transactionally approve application (creates Club & initial club_owner membership)
- Transactionally reject application (records reason, no club created)

Security:
- All endpoints strictly require platform owner authorization via get_current_platform_owner.
- Club staff roles (club_owner, club_manager, tournament_director) cannot access platform endpoints.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_platform_owner
from app.core.database import get_db
from app.models.club_application import ClubApplicationStatus
from app.models.platform_audit_log import PlatformAuditLog
from app.models.user import User
from app.schemas.club_application import (
    ClubApplicationRejectRequest,
    ClubApplicationResponse,
)
from app.schemas.platform import (
    PlatformAuditLogItem,
    PlatformAuditLogsListResponse,
    PlatformClubStatusUpdateRequest,
    PlatformClubStatusUpdateResponse,
    PlatformOverviewApplications,
    PlatformOverviewClubs,
    PlatformOverviewResponse,
    PlatformOverviewTickets,
    PlatformOverviewUsers,
    PlatformPlayerProfile,
    PlatformUserItem,
    PlatformUserPlayerMembership,
    PlatformUsersListResponse,
    PlatformUserStaffMembership,
)
from app.services.club_application_service import ClubApplicationService
from app.services.platform_audit_service import (
    get_action_label,
    record_platform_audit_event,
)
from app.schemas.support_ticket import (
    SupportTicketDetailResponse,
    SupportTicketItem,
    SupportTicketMessageCreateRequest,
    SupportTicketUpdateRequest,
    SupportTicketsListResponse,
)
from app.schemas.platform_setting import (
    PlatformSettingsResponse,
    PlatformSettingsUpdateRequest,
)
from app.services.platform_settings_service import PlatformSettingsService
from app.services.support_ticket_service import SupportTicketService

router = APIRouter(prefix="/platform", tags=["Platform Administration"])


@router.get(
    "/club-applications",
    response_model=dict,
    summary="List club applications for platform review",
    description="Returns paginated club registration applications. Filter by status: pending, approved, rejected.",
    responses={
        403: {"description": "Platform owner authorization required"},
    },
)
async def list_club_applications(
    status_filter: ClubApplicationStatus | None = Query(default=None, alias="status", description="Filter by application status"),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=50, ge=1, le=100, description="Items per page"),
    current_platform_owner: User = Depends(get_current_platform_owner),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List club applications for platform owner review."""
    items, total = await ClubApplicationService(db).platform_list_applications(
        status_filter=status_filter,
        page=page,
        page_size=page_size,
    )

    from sqlalchemy import func, select
    from app.models.club_application import ClubApplication

    counts_result = await db.execute(
        select(ClubApplication.status, func.count(ClubApplication.id))
        .group_by(ClubApplication.status)
    )
    counts_map = dict(counts_result.all())
    pending_count = counts_map.get(ClubApplicationStatus.PENDING, counts_map.get("pending", 0))
    approved_count = counts_map.get(ClubApplicationStatus.APPROVED, counts_map.get("approved", 0))
    rejected_count = counts_map.get(ClubApplicationStatus.REJECTED, counts_map.get("rejected", 0))
    all_count = sum(counts_map.values())

    return {
        "items": [item.model_dump() for item in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "counts": {
            "pending": pending_count,
            "approved": approved_count,
            "rejected": rejected_count,
            "all": all_count,
        },
    }


@router.get(
    "/club-applications/{application_id}",
    response_model=ClubApplicationResponse,
    summary="Get club application details",
    description="Retrieve full details of a specific club registration application.",
    responses={
        403: {"description": "Platform owner authorization required"},
        404: {"description": "Application not found"},
    },
)
async def get_club_application(
    application_id: UUID,
    current_platform_owner: User = Depends(get_current_platform_owner),
    db: AsyncSession = Depends(get_db),
) -> ClubApplicationResponse:
    """Retrieve application details for platform review."""
    return await ClubApplicationService(db).platform_get_application(application_id)


@router.post(
    "/club-applications/{application_id}/approve",
    response_model=ClubApplicationResponse,
    status_code=status.HTTP_200_OK,
    summary="Approve club application",
    description="Atomically creates the Club facility, grants initial club_owner membership to applicant, and marks application approved.",
    responses={
        400: {"description": "Application is not in pending state or duplicate slug"},
        403: {"description": "Platform owner authorization required"},
        404: {"description": "Application not found"},
    },
)
async def approve_club_application(
    application_id: UUID,
    current_platform_owner: User = Depends(get_current_platform_owner),
    db: AsyncSession = Depends(get_db),
) -> ClubApplicationResponse:
    """Approve a pending club application."""
    return await ClubApplicationService(db).platform_approve_application(
        application_id=application_id,
        platform_owner_id=current_platform_owner.id,
    )


@router.post(
    "/club-applications/{application_id}/reject",
    response_model=ClubApplicationResponse,
    status_code=status.HTTP_200_OK,
    summary="Reject club application",
    description="Atomically rejects a pending club application with an optional reason. Never creates a club or owner membership.",
    responses={
        400: {"description": "Application is not in pending state"},
        403: {"description": "Platform owner authorization required"},
        404: {"description": "Application not found"},
    },
)
async def reject_club_application(
    application_id: UUID,
    payload: ClubApplicationRejectRequest = ClubApplicationRejectRequest(),
    current_platform_owner: User = Depends(get_current_platform_owner),
    db: AsyncSession = Depends(get_db),
) -> ClubApplicationResponse:
    """Reject a pending club application."""
    return await ClubApplicationService(db).platform_reject_application(
        application_id=application_id,
        platform_owner_id=current_platform_owner.id,
        rejection_reason=payload.rejection_reason,
    )


@router.get(
    "/me",
    summary="Get current platform owner profile",
    responses={
        403: {"description": "Platform owner authorization required"},
    },
)
async def get_platform_me(
    current_platform_owner: User = Depends(get_current_platform_owner),
) -> dict:
    """Verify that current session is an authorized platform owner."""
    return {
        "id": str(current_platform_owner.id),
        "email": current_platform_owner.email,
        "full_name": current_platform_owner.full_name,
        "is_platform_owner": True,
    }


@router.get(
    "/overview",
    response_model=PlatformOverviewResponse,
    summary="Consolidated platform overview metrics",
    description="Returns real-time aggregate counts for applications, clubs, users, and support tickets.",
    responses={
        403: {"description": "Platform owner authorization required"},
    },
)
async def get_platform_overview(
    current_platform_owner: User = Depends(get_current_platform_owner),
    db: AsyncSession = Depends(get_db),
) -> PlatformOverviewResponse:
    from sqlalchemy import func, select
    from app.models.club import Club
    from app.models.club_application import ClubApplication
    from app.models.support_ticket import SupportTicket, TicketStatus
    from app.models.user import User

    # Applications
    app_res = await db.execute(
        select(ClubApplication.status, func.count(ClubApplication.id)).group_by(ClubApplication.status)
    )
    app_counts = dict(app_res.all())
    pending_apps = app_counts.get(ClubApplicationStatus.PENDING, app_counts.get("pending", 0))
    approved_apps = app_counts.get(ClubApplicationStatus.APPROVED, app_counts.get("approved", 0))
    rejected_apps = app_counts.get(ClubApplicationStatus.REJECTED, app_counts.get("rejected", 0))
    total_apps = sum(app_counts.values())

    # Clubs
    club_res = await db.execute(
        select(Club.is_active, func.count(Club.id)).group_by(Club.is_active)
    )
    club_counts = dict(club_res.all())
    active_clubs = club_counts.get(True, 0)
    suspended_clubs = club_counts.get(False, 0)
    total_clubs = active_clubs + suspended_clubs

    # Users
    user_res = await db.execute(
        select(User.is_active, func.count(User.id)).group_by(User.is_active)
    )
    user_counts = dict(user_res.all())
    active_users = user_counts.get(True, 0)
    total_users = sum(user_counts.values())

    # Tickets
    ticket_res = await db.execute(
        select(SupportTicket.status, func.count(SupportTicket.id)).group_by(SupportTicket.status)
    )
    ticket_counts = dict(ticket_res.all())
    t_open = ticket_counts.get(TicketStatus.OPEN.value, 0)
    t_in_prog = ticket_counts.get(TicketStatus.IN_PROGRESS.value, 0)
    t_wait = ticket_counts.get(TicketStatus.WAITING_FOR_REQUESTER.value, 0)
    t_res = ticket_counts.get(TicketStatus.RESOLVED.value, 0)
    t_closed = ticket_counts.get(TicketStatus.CLOSED.value, 0)
    total_tickets = sum(ticket_counts.values())

    from app.services.platform_settings_service import PlatformSettingsService
    runtime_settings = await PlatformSettingsService(db).get_or_create_settings()
    system_status = "maintenance" if runtime_settings.maintenance_mode else "operational"

    return PlatformOverviewResponse(
        applications=PlatformOverviewApplications(
            pending=pending_apps,
            approved=approved_apps,
            rejected=rejected_apps,
            total=total_apps,
        ),
        clubs=PlatformOverviewClubs(
            total=total_clubs,
            active=active_clubs,
            suspended=suspended_clubs,
        ),
        users=PlatformOverviewUsers(
            total=total_users,
            active=active_users,
        ),
        tickets=PlatformOverviewTickets(
            open=t_open,
            in_progress=t_in_prog,
            waiting_for_requester=t_wait,
            resolved=t_res,
            closed=t_closed,
            total=total_tickets,
        ),
        system_status=system_status,
    )


@router.get(
    "/clubs",
    summary="List all registered clubs on the platform",
    description="Returns platform-wide club directory with approval and status information for platform administration.",
    responses={
        403: {"description": "Platform owner authorization required"},
    },
)
async def list_platform_clubs(
    current_platform_owner: User = Depends(get_current_platform_owner),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """List all registered clubs on the platform."""
    from sqlalchemy import func, select
    from app.models.club import Club
    from app.models.club_membership import ClubMembership

    result = await db.execute(select(Club).order_by(Club.created_at.desc()))
    clubs = result.scalars().all()

    counts_result = await db.execute(
        select(ClubMembership.club_id, func.count(ClubMembership.id))
        .where(ClubMembership.is_active == True)  # noqa: E712
        .group_by(ClubMembership.club_id)
    )
    counts_map = dict(counts_result.all())

    items = []
    for c in clubs:
        items.append({
            "id": str(c.id),
            "name": c.name,
            "slug": c.slug,
            "logo_url": c.logo_url,
            "cover_image_url": c.cover_image_url,
            "is_active": c.is_active,
            "short_description": c.short_description,
            "description": c.description,
            "city": c.city,
            "state": c.state,
            "country": c.country or "United States",
            "address_line1": c.address_line1,
            "address_line2": c.address_line2,
            "postal_code": c.postal_code,
            "contact_email": c.contact_email,
            "contact_phone": c.contact_phone,
            "website": c.website,
            "established_year": c.established_year,
            "operating_days": c.operating_days,
            "opening_time": str(c.opening_time) if c.opening_time else None,
            "closing_time": str(c.closing_time) if c.closing_time else None,
            "timezone": c.timezone,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "active_members_count": counts_map.get(c.id, 0),
        })

    return {
        "items": items,
        "total": len(items),
    }


def _map_user_to_platform_item(u: User) -> PlatformUserItem:
    staff_list = []
    for m in (u.club_memberships or []):
        if m.club:
            staff_list.append(PlatformUserStaffMembership(
                id=m.id,
                club_id=m.club_id,
                club_name=m.club.name,
                club_slug=m.club.slug,
                role=m.role.value if hasattr(m.role, "value") else str(m.role),
                role_label=m.role.display_label if hasattr(m.role, "display_label") else str(m.role).replace("_", " ").title(),
                is_active=m.is_active,
                created_at=m.created_at,
            ))

    player_list = []
    for pm in (u.club_player_memberships or []):
        if pm.club:
            player_list.append(PlatformUserPlayerMembership(
                id=pm.id,
                club_id=pm.club_id,
                club_name=pm.club.name,
                club_slug=pm.club.slug,
                status=pm.status.value if hasattr(pm.status, "value") else str(pm.status),
                status_label=pm.status.display_label if hasattr(pm.status, "display_label") else str(pm.status).title(),
                membership_number=pm.membership_number,
                joined_at=pm.joined_at,
            ))

    pp = None
    if u.player_profile:
        pp = PlatformPlayerProfile(
            display_name=u.player_profile.display_name,
            skill_rating=float(u.player_profile.skill_rating) if u.player_profile.skill_rating is not None else None,
        )

    return PlatformUserItem(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        is_active=u.is_active,
        is_verified=u.is_verified,
        created_at=u.created_at,
        player_profile=pp,
        club_memberships=staff_list,
        club_player_memberships=player_list,
        total_memberships_count=len(staff_list) + len(player_list),
    )


@router.get(
    "/users",
    response_model=PlatformUsersListResponse,
    summary="List platform users with cross-club roles",
    description="Returns paginated platform users with search, role, and club filters. Strictly excludes password hashes and credentials.",
    responses={
        403: {"description": "Platform owner authorization required"},
    },
)
async def list_platform_users(
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=50, ge=1, le=100, description="Items per page"),
    search: str | None = Query(default=None, description="Search by name, email, or exact user ID"),
    is_active: bool | None = Query(default=None, description="Filter by active status"),
    club_id: UUID | None = Query(default=None, description="Filter users with memberships in club"),
    role: str | None = Query(default=None, description="Filter by staff role or 'player'"),
    current_platform_owner: User = Depends(get_current_platform_owner),
    db: AsyncSession = Depends(get_db),
) -> PlatformUsersListResponse:
    """Retrieve platform-wide user directory with memberships."""
    from sqlalchemy import func, or_, select
    from sqlalchemy.orm import selectinload
    from app.models.club_membership import ClubMembership
    from app.models.club_player_membership import ClubPlayerMembership

    base_query = select(User)

    if club_id is not None:
        base_query = base_query.where(
            or_(
                User.id.in_(
                    select(ClubMembership.user_id).where(ClubMembership.club_id == club_id)
                ),
                User.id.in_(
                    select(ClubPlayerMembership.user_id).where(ClubPlayerMembership.club_id == club_id)
                ),
            )
        )

    if role is not None:
        clean_role = role.strip().lower()
        if clean_role == "player":
            base_query = base_query.where(
                User.id.in_(
                    select(ClubPlayerMembership.user_id)
                )
            )
        else:
            base_query = base_query.where(
                User.id.in_(
                    select(ClubMembership.user_id).where(ClubMembership.role == clean_role)
                )
            )

    if is_active is not None:
        base_query = base_query.where(User.is_active == is_active)

    if search and search.strip():
        term = search.strip()
        search_filter = or_(
            User.email.ilike(f"%{term}%"),
            User.full_name.ilike(f"%{term}%"),
        )
        try:
            val_uuid = UUID(term)
            search_filter = or_(search_filter, User.id == val_uuid)
        except (ValueError, TypeError):
            pass
        base_query = base_query.where(search_filter)

    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    paginated_query = (
        base_query
        .options(
            selectinload(User.club_memberships).selectinload(ClubMembership.club),
            selectinload(User.club_player_memberships).selectinload(ClubPlayerMembership.club),
            selectinload(User.player_profile),
        )
        .order_by(User.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    users_result = await db.execute(paginated_query)
    users = users_result.scalars().all()

    return PlatformUsersListResponse(
        items=[_map_user_to_platform_item(u) for u in users],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/users/{user_id}",
    response_model=PlatformUserItem,
    summary="Get user account and cross-club membership details",
    description="Returns detailed platform user profile including all club staff roles and player memberships.",
    responses={
        403: {"description": "Platform owner authorization required"},
        404: {"description": "User not found"},
    },
)
async def get_platform_user_detail(
    user_id: UUID,
    current_platform_owner: User = Depends(get_current_platform_owner),
    db: AsyncSession = Depends(get_db),
) -> PlatformUserItem:
    """Retrieve detailed user account and membership profile."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.club_membership import ClubMembership
    from app.models.club_player_membership import ClubPlayerMembership

    query = (
        select(User)
        .where(User.id == user_id)
        .options(
            selectinload(User.club_memberships).selectinload(ClubMembership.club),
            selectinload(User.club_player_memberships).selectinload(ClubPlayerMembership.club),
            selectinload(User.player_profile),
        )
    )
    result = await db.execute(query)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )
    return _map_user_to_platform_item(user)


@router.patch(
    "/clubs/{club_id}/status",
    response_model=PlatformClubStatusUpdateResponse,
    summary="Administratively suspend or reactivate a club facility",
    description="Updates club is_active status. Requires platform owner authorization and mandatory administrative reason.",
    responses={
        400: {"description": "Invalid transition (club already has requested status)"},
        403: {"description": "Platform owner authorization required"},
        404: {"description": "Club not found"},
        422: {"description": "Validation error (reason too short)"},
    },
)
async def update_platform_club_status(
    club_id: UUID,
    payload: PlatformClubStatusUpdateRequest,
    current_platform_owner: User = Depends(get_current_platform_owner),
    db: AsyncSession = Depends(get_db),
) -> PlatformClubStatusUpdateResponse:
    """Update active/suspended status of a club facility with mandatory reason."""
    import logging
    from datetime import datetime, timezone
    from app.models.club import Club

    club = await db.get(Club, club_id)
    if not club:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Club not found.",
        )

    if club.is_active == payload.is_active:
        current_state = "active" if club.is_active else "suspended"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Club '{club.name}' is already {current_state}.",
        )

    club.is_active = payload.is_active
    db.add(club)

    # Record audit event atomically within the same transaction
    action_type = "club.reactivated" if payload.is_active else "club.suspended"
    await record_platform_audit_event(
        db,
        actor=current_platform_owner,
        action=action_type,
        entity_type="club",
        entity_id=club.id,
        entity_name=club.name,
        outcome="success",
        reason=payload.reason,
        details={
            "slug": club.slug,
            "is_active_before": not payload.is_active,
            "is_active_after": payload.is_active,
        },
    )

    await db.commit()
    await db.refresh(club)

    action_label = "reactivated" if payload.is_active else "suspended"
    logging.getLogger(__name__).info(
        "Platform owner %s %s club '%s' (ID: %s). Reason: %s",
        current_platform_owner.email,
        action_label,
        club.name,
        club.id,
        payload.reason,
    )

    return PlatformClubStatusUpdateResponse(
        id=str(club.id),
        name=club.name,
        slug=club.slug,
        is_active=club.is_active,
        reason=payload.reason,
        updated_at=club.updated_at.isoformat() if club.updated_at else datetime.now(timezone.utc).isoformat(),
    )


@router.get(
    "/audit-logs",
    response_model=PlatformAuditLogsListResponse,
    status_code=status.HTTP_200_OK,
    summary="List platform audit logs",
    description="Platform-owner-only append-only audit trail with filtering and pagination.",
    responses={
        403: {"description": "Platform owner authorization required"},
    },
)
async def list_platform_audit_logs(
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=50, ge=1, le=100, description="Items per page"),
    action: str | None = Query(default=None, description="Filter by exact action type"),
    entity_type: str | None = Query(default=None, description="Filter by entity type (club, club_application)"),
    entity_id: str | None = Query(default=None, description="Filter by affected entity ID"),
    search: str | None = Query(default=None, description="Search by entity name, actor email, or reason"),
    from_date: datetime | None = Query(default=None, description="Filter from timestamp (ISO8601)"),
    to_date: datetime | None = Query(default=None, description="Filter to timestamp (ISO8601)"),
    current_platform_owner: User = Depends(get_current_platform_owner),
    db: AsyncSession = Depends(get_db),
) -> PlatformAuditLogsListResponse:
    """Retrieve platform-wide audit logs with server-side filtering."""
    from sqlalchemy import func, or_, select

    base_query = select(PlatformAuditLog)

    if action:
        base_query = base_query.where(PlatformAuditLog.action == action.strip().lower())
    if entity_type:
        base_query = base_query.where(PlatformAuditLog.entity_type == entity_type.strip().lower())
    if entity_id:
        base_query = base_query.where(PlatformAuditLog.entity_id == entity_id.strip())
    if from_date:
        base_query = base_query.where(PlatformAuditLog.created_at >= from_date)
    if to_date:
        base_query = base_query.where(PlatformAuditLog.created_at <= to_date)
    if search and search.strip():
        term = search.strip()
        base_query = base_query.where(
            or_(
                PlatformAuditLog.entity_name.ilike(f"%{term}%"),
                PlatformAuditLog.actor_email.ilike(f"%{term}%"),
                PlatformAuditLog.actor_name.ilike(f"%{term}%"),
                PlatformAuditLog.reason.ilike(f"%{term}%"),
                PlatformAuditLog.action.ilike(f"%{term}%"),
                PlatformAuditLog.entity_id.ilike(f"%{term}%"),
            )
        )

    # Total count for filtered query
    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Paginated logs
    paginated_query = (
        base_query
        .order_by(PlatformAuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(paginated_query)
    logs = result.scalars().all()

    # Global breakdown counts for filter pills
    counts_query = (
        select(PlatformAuditLog.action, func.count(PlatformAuditLog.id))
        .group_by(PlatformAuditLog.action)
    )
    counts_result = await db.execute(counts_query)
    action_counts = dict(counts_result.all())

    items = [
        PlatformAuditLogItem(
            id=entry.id,
            created_at=entry.created_at,
            actor_id=entry.actor_id,
            actor_email=entry.actor_email,
            actor_name=entry.actor_name,
            action=entry.action,
            action_label=get_action_label(entry.action),
            entity_type=entry.entity_type,
            entity_id=entry.entity_id,
            entity_name=entry.entity_name,
            outcome=entry.outcome,
            reason=entry.reason,
            details=entry.details,
            ip_address=entry.ip_address,
        )
        for entry in logs
    ]

    return PlatformAuditLogsListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        action_counts=action_counts,
    )


@router.get(
    "/audit-logs/{log_id}",
    response_model=PlatformAuditLogItem,
    status_code=status.HTTP_200_OK,
    summary="Retrieve single audit log entry",
    description="Retrieve details of a single audit log event.",
    responses={
        403: {"description": "Platform owner authorization required"},
        404: {"description": "Audit log entry not found"},
    },
)
async def get_platform_audit_log(
    log_id: UUID,
    current_platform_owner: User = Depends(get_current_platform_owner),
    db: AsyncSession = Depends(get_db),
) -> PlatformAuditLogItem:
    """Retrieve detailed audit log entry."""
    entry = await db.get(PlatformAuditLog, log_id)
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit log entry not found.",
        )

    return PlatformAuditLogItem(
        id=entry.id,
        created_at=entry.created_at,
        actor_id=entry.actor_id,
        actor_email=entry.actor_email,
        actor_name=entry.actor_name,
        action=entry.action,
        action_label=get_action_label(entry.action),
        entity_type=entry.entity_type,
        entity_id=entry.entity_id,
        entity_name=entry.entity_name,
        outcome=entry.outcome,
        reason=entry.reason,
        details=entry.details,
        ip_address=entry.ip_address,
    )


# ─── Platform Support Ticket Management ─────────────────────────────────────

@router.get(
    "/support/tickets",
    response_model=SupportTicketsListResponse,
    status_code=status.HTTP_200_OK,
    summary="List platform support tickets",
    description="Platform-owner queue for managing support tickets with search, status, category, and priority filters.",
    responses={
        403: {"description": "Platform owner authorization required"},
    },
)
@router.get(
    "/tickets",
    response_model=SupportTicketsListResponse,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
async def platform_list_support_tickets(
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=50, ge=1, le=100, description="Items per page"),
    status: str | None = Query(default=None, description="Filter by status (open, in_progress, waiting_for_requester, resolved, closed)"),
    category: str | None = Query(default=None, description="Filter by category"),
    priority: str | None = Query(default=None, description="Filter by priority"),
    club_id: UUID | None = Query(default=None, description="Filter by club"),
    search: str | None = Query(default=None, description="Search across ticket subject, description, or requester email"),
    current_platform_owner: User = Depends(get_current_platform_owner),
    db: AsyncSession = Depends(get_db),
) -> SupportTicketsListResponse:
    """Retrieve platform-wide support tickets."""
    return await SupportTicketService(db).platform_list_tickets(
        page=page,
        page_size=page_size,
        status_filter=status,
        category_filter=category,
        priority_filter=priority,
        club_id=club_id,
        search=search,
    )


@router.get(
    "/support/tickets/{ticket_id}",
    response_model=SupportTicketDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get support ticket details and conversation thread",
    description="Platform-owner view of ticket and all replies.",
    responses={
        403: {"description": "Platform owner authorization required"},
        404: {"description": "Ticket not found"},
    },
)
@router.get(
    "/tickets/{ticket_id}",
    response_model=SupportTicketDetailResponse,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
async def platform_get_support_ticket(
    ticket_id: UUID,
    current_platform_owner: User = Depends(get_current_platform_owner),
    db: AsyncSession = Depends(get_db),
) -> SupportTicketDetailResponse:
    """Get complete support ticket thread."""
    return await SupportTicketService(db).platform_get_ticket(ticket_id)


@router.patch(
    "/support/tickets/{ticket_id}",
    response_model=SupportTicketDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Update support ticket status, priority, or assignment",
    description="Updates ticket metadata and records action in platform audit log.",
    responses={
        400: {"description": "Invalid status or priority transition"},
        403: {"description": "Platform owner authorization required"},
        404: {"description": "Ticket not found"},
    },
)
@router.patch(
    "/tickets/{ticket_id}",
    response_model=SupportTicketDetailResponse,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
async def platform_update_support_ticket(
    ticket_id: UUID,
    payload: SupportTicketUpdateRequest,
    current_platform_owner: User = Depends(get_current_platform_owner),
    db: AsyncSession = Depends(get_db),
) -> SupportTicketDetailResponse:
    """Update support ticket status, priority, or assignment."""
    return await SupportTicketService(db).platform_update_ticket(
        ticket_id=ticket_id,
        admin_actor=current_platform_owner,
        payload=payload,
    )


@router.post(
    "/support/tickets/{ticket_id}/replies",
    response_model=SupportTicketDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Post platform admin reply to support ticket thread",
    description="Appends admin reply, sets status to waiting_for_requester, and logs audit trail.",
    responses={
        403: {"description": "Platform owner authorization required"},
        404: {"description": "Ticket not found"},
    },
)
@router.post(
    "/tickets/{ticket_id}/replies",
    response_model=SupportTicketDetailResponse,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
async def platform_reply_to_support_ticket(
    ticket_id: UUID,
    payload: SupportTicketMessageCreateRequest,
    current_platform_owner: User = Depends(get_current_platform_owner),
    db: AsyncSession = Depends(get_db),
) -> SupportTicketDetailResponse:
    """Post platform admin reply to ticket."""
    return await SupportTicketService(db).platform_reply(
        ticket_id=ticket_id,
        admin_actor=current_platform_owner,
        payload=payload,
    )


# ─── Global Platform Settings Management ────────────────────────────────────

@router.get(
    "/settings",
    response_model=PlatformSettingsResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve global platform settings and system configuration",
    description="Returns runtime-editable settings and sanitized read-only environment parameters. Prohibits secrets.",
    responses={
        403: {"description": "Platform owner authorization required"},
    },
)
async def get_platform_settings(
    current_platform_owner: User = Depends(get_current_platform_owner),
    db: AsyncSession = Depends(get_db),
) -> PlatformSettingsResponse:
    """Retrieve global platform configuration."""
    return await PlatformSettingsService(db).get_platform_settings()


@router.patch(
    "/settings",
    response_model=PlatformSettingsResponse,
    status_code=status.HTTP_200_OK,
    summary="Update global platform settings",
    description="Updates validated runtime platform settings with concurrency row lock and Platform Audit Log recording.",
    responses={
        400: {"description": "Invalid settings payload"},
        403: {"description": "Platform owner authorization required"},
        422: {"description": "Validation error or forbidden key"},
    },
)
async def update_platform_settings(
    payload: PlatformSettingsUpdateRequest,
    current_platform_owner: User = Depends(get_current_platform_owner),
    db: AsyncSession = Depends(get_db),
) -> PlatformSettingsResponse:
    """Update global platform settings."""
    return await PlatformSettingsService(db).update_platform_settings(
        admin_actor=current_platform_owner,
        payload=payload,
    )





