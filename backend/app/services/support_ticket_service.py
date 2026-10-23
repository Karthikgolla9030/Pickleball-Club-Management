"""
Aught2 Pickleball — Support Ticket Service

Encapsulates ticket creation, listing, replies, and status transitions
for both authenticated requesters and platform administrators.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.club import Club
from app.models.support_ticket import (
    SupportTicket,
    SupportTicketMessage,
    TicketCategory,
    TicketPriority,
    TicketStatus,
)
from app.models.user import User
from app.schemas.support_ticket import (
    SupportTicketCreateRequest,
    SupportTicketDetailResponse,
    SupportTicketItem,
    SupportTicketMessageCreateRequest,
    SupportTicketMessageItem,
    SupportTicketUpdateRequest,
    SupportTicketsListResponse,
)
from app.services.platform_audit_service import record_platform_audit_event


def _format_ticket_item(ticket: SupportTicket, messages_count: int | None = None) -> SupportTicketItem:
    cat_label = ticket.category.replace("_", " ").title()
    try:
        cat_label = TicketCategory(ticket.category).display_label
    except ValueError:
        pass

    pri_label = ticket.priority.title()
    try:
        pri_label = TicketPriority(ticket.priority).display_label
    except ValueError:
        pass

    stat_label = ticket.status.replace("_", " ").title()
    try:
        stat_label = TicketStatus(ticket.status).display_label
    except ValueError:
        pass

    return SupportTicketItem(
        id=ticket.id,
        reference_number=ticket.reference_number,
        subject=ticket.subject,
        description=ticket.description,
        category=ticket.category,
        category_label=cat_label,
        priority=ticket.priority,
        priority_label=pri_label,
        status=ticket.status,
        status_label=stat_label,
        requester_id=ticket.requester_id,
        requester_email=ticket.requester_email,
        requester_name=ticket.requester_name,
        club_id=ticket.club_id,
        club_name=ticket.club.name if ticket.club else None,
        club_slug=ticket.club.slug if ticket.club else None,
        assigned_admin_id=ticket.assigned_admin_id,
        assigned_admin_email=ticket.assigned_admin_email,
        assigned_admin_name=ticket.assigned_admin_name,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
        resolved_at=ticket.resolved_at,
        messages_count=messages_count if messages_count is not None else len(ticket.messages or []),
    )


def _format_ticket_detail(
    ticket: SupportTicket,
    messages: list[SupportTicketMessage] | None = None,
) -> SupportTicketDetailResponse:
    raw_msgs = messages if messages is not None else (ticket.messages or [])
    item = _format_ticket_item(ticket, messages_count=len(raw_msgs))
    msgs = [
        SupportTicketMessageItem(
            id=m.id,
            ticket_id=m.ticket_id,
            sender_id=m.sender_id,
            sender_email=m.sender_email,
            sender_name=m.sender_name,
            sender_role=m.sender_role,
            message=m.message,
            created_at=m.created_at,
        )
        for m in raw_msgs
    ]
    return SupportTicketDetailResponse(
        **item.model_dump(),
        messages=msgs,
    )


class SupportTicketService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _fetch_ticket_and_messages(
        self,
        ticket_id: UUID,
        requester_id: UUID | None = None,
    ) -> SupportTicketDetailResponse:
        query = (
            select(SupportTicket)
            .options(selectinload(SupportTicket.club))
            .where(SupportTicket.id == ticket_id)
        )
        if requester_id is not None:
            query = query.where(SupportTicket.requester_id == requester_id)
        res = await self.db.execute(query)
        ticket = res.scalar_one_or_none()
        if not ticket:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ticket not found.",
            )
        msg_query = (
            select(SupportTicketMessage)
            .where(SupportTicketMessage.ticket_id == ticket_id)
            .order_by(SupportTicketMessage.created_at.asc())
        )
        msg_res = await self.db.execute(msg_query)
        messages = list(msg_res.scalars().all())
        return _format_ticket_detail(ticket, messages=messages)

    # ─── Requester Methods ──────────────────────────────────────────────────

    async def create_ticket(
        self,
        requester: User,
        payload: SupportTicketCreateRequest,
    ) -> SupportTicketDetailResponse:
        """Create a new support ticket submitted by an authenticated user."""
        # Optional related club validation
        if payload.club_id:
            club = await self.db.get(Club, payload.club_id)
            if not club:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Specified club facility not found.",
                )

        ref_number = f"SUP-{uuid.uuid4().hex[:8].upper()}"

        clean_category = payload.category.strip().lower()
        valid_categories = {c.value for c in TicketCategory}
        if clean_category not in valid_categories:
            clean_category = TicketCategory.GENERAL.value

        clean_priority = payload.priority.strip().lower()
        valid_priorities = {p.value for p in TicketPriority}
        if clean_priority not in valid_priorities:
            clean_priority = TicketPriority.MEDIUM.value

        ticket = SupportTicket(
            id=uuid.uuid4(),
            reference_number=ref_number,
            subject=payload.subject.strip(),
            description=payload.description.strip(),
            category=clean_category,
            priority=clean_priority,
            status=TicketStatus.OPEN.value,
            requester_id=requester.id,
            requester_email=requester.email,
            requester_name=requester.full_name,
            club_id=payload.club_id,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        self.db.add(ticket)
        await self.db.flush()

        # Initial message in thread
        init_message = SupportTicketMessage(
            id=uuid.uuid4(),
            ticket_id=ticket.id,
            sender_id=requester.id,
            sender_email=requester.email,
            sender_name=requester.full_name,
            sender_role="requester",
            message=payload.description.strip(),
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(init_message)

        await self.db.commit()

        return await self._fetch_ticket_and_messages(ticket.id)

    async def list_requester_tickets(
        self,
        requester_id: UUID,
        status_filter: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> SupportTicketsListResponse:
        """List tickets created by the authenticated user with status filtering."""
        base_query = (
            select(SupportTicket)
            .options(selectinload(SupportTicket.club), selectinload(SupportTicket.messages))
            .where(SupportTicket.requester_id == requester_id)
        )

        if status_filter and status_filter.strip().lower() != "all":
            base_query = base_query.where(SupportTicket.status == status_filter.strip().lower())

        count_query = select(func.count()).select_from(base_query.subquery())
        total = (await self.db.execute(count_query)).scalar_one()

        paginated = (
            base_query
            .order_by(SupportTicket.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await self.db.execute(paginated)
        tickets = result.scalars().all()

        # Breakdown counts for requester tabs
        counts_res = await self.db.execute(
            select(SupportTicket.status, func.count(SupportTicket.id))
            .where(SupportTicket.requester_id == requester_id)
            .group_by(SupportTicket.status)
        )
        status_counts = dict(counts_res.all())

        items = [_format_ticket_item(t) for t in tickets]
        return SupportTicketsListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            status_counts=status_counts,
        )

    async def get_requester_ticket(
        self,
        ticket_id: UUID,
        requester_id: UUID,
    ) -> SupportTicketDetailResponse:
        """Retrieve single ticket detail owned by the requester."""
        return await self._fetch_ticket_and_messages(ticket_id, requester_id=requester_id)

    async def requester_reply(
        self,
        ticket_id: UUID,
        requester: User,
        payload: SupportTicketMessageCreateRequest,
    ) -> SupportTicketDetailResponse:
        """Requester posts a reply to their open ticket."""
        query = select(SupportTicket).where(
            SupportTicket.id == ticket_id,
            SupportTicket.requester_id == requester.id,
        )
        res = await self.db.execute(query)
        ticket = res.scalar_one_or_none()
        if not ticket:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ticket not found.",
            )

        if ticket.status == TicketStatus.CLOSED.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot reply to a closed ticket. Please open a new ticket.",
            )

        msg = SupportTicketMessage(
            id=uuid.uuid4(),
            ticket_id=ticket.id,
            sender_id=requester.id,
            sender_email=requester.email,
            sender_name=requester.full_name,
            sender_role="requester",
            message=payload.message.strip(),
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(msg)

        # Transition status to in_progress if it was waiting on requester
        if ticket.status in (TicketStatus.WAITING_FOR_REQUESTER.value, TicketStatus.RESOLVED.value):
            ticket.status = TicketStatus.IN_PROGRESS.value
            ticket.updated_at = datetime.now(timezone.utc)
            self.db.add(ticket)

        await self.db.commit()

        return await self._fetch_ticket_and_messages(ticket_id, requester_id=requester.id)

    # ─── Platform Admin Methods ─────────────────────────────────────────────

    async def platform_list_tickets(
        self,
        page: int = 1,
        page_size: int = 50,
        status_filter: str | None = None,
        category_filter: str | None = None,
        priority_filter: str | None = None,
        club_id: UUID | None = None,
        search: str | None = None,
    ) -> SupportTicketsListResponse:
        """Platform-owner queue listing with search, category, priority, and status filters."""
        base_query = (
            select(SupportTicket)
            .options(selectinload(SupportTicket.club), selectinload(SupportTicket.messages))
        )

        if status_filter and status_filter.strip().lower() != "all":
            base_query = base_query.where(SupportTicket.status == status_filter.strip().lower())

        if category_filter and category_filter.strip().lower() != "all":
            base_query = base_query.where(SupportTicket.category == category_filter.strip().lower())

        if priority_filter and priority_filter.strip().lower() != "all":
            base_query = base_query.where(SupportTicket.priority == priority_filter.strip().lower())

        if club_id is not None:
            base_query = base_query.where(SupportTicket.club_id == club_id)

        if search and search.strip():
            term = search.strip()
            base_query = base_query.where(
                or_(
                    SupportTicket.reference_number.ilike(f"%{term}%"),
                    SupportTicket.subject.ilike(f"%{term}%"),
                    SupportTicket.description.ilike(f"%{term}%"),
                    SupportTicket.requester_email.ilike(f"%{term}%"),
                    SupportTicket.requester_name.ilike(f"%{term}%"),
                )
            )

        count_query = select(func.count()).select_from(base_query.subquery())
        total = (await self.db.execute(count_query)).scalar_one()

        paginated = (
            base_query
            .order_by(SupportTicket.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await self.db.execute(paginated)
        tickets = result.scalars().all()

        # Database-wide metrics for queue tabs
        status_counts_res = await self.db.execute(
            select(SupportTicket.status, func.count(SupportTicket.id)).group_by(SupportTicket.status)
        )
        status_counts = dict(status_counts_res.all())

        priority_counts_res = await self.db.execute(
            select(SupportTicket.priority, func.count(SupportTicket.id)).group_by(SupportTicket.priority)
        )
        priority_counts = dict(priority_counts_res.all())

        items = [_format_ticket_item(t) for t in tickets]
        return SupportTicketsListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            status_counts=status_counts,
            priority_counts=priority_counts,
        )

    async def platform_get_ticket(self, ticket_id: UUID) -> SupportTicketDetailResponse:
        """Retrieve complete ticket thread for platform owner review."""
        return await self._fetch_ticket_and_messages(ticket_id)

    async def platform_update_ticket(
        self,
        ticket_id: UUID,
        admin_actor: User,
        payload: SupportTicketUpdateRequest,
    ) -> SupportTicketDetailResponse:
        """Update ticket status, priority, or assignment, and record audit trail atomically."""
        query = select(SupportTicket).where(SupportTicket.id == ticket_id)
        res = await self.db.execute(query)
        ticket = res.scalar_one_or_none()
        if not ticket:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ticket not found.",
            )

        changes: list[str] = []

        if payload.status:
            clean_status = payload.status.strip().lower()
            valid_statuses = {s.value for s in TicketStatus}
            if clean_status not in valid_statuses:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid status '{payload.status}'. Must be one of: {', '.join(valid_statuses)}",
                )
            if ticket.status != clean_status:
                old_status = ticket.status
                ticket.status = clean_status
                changes.append(f"status: {old_status} -> {clean_status}")
                if clean_status in (TicketStatus.RESOLVED.value, TicketStatus.CLOSED.value):
                    ticket.resolved_at = datetime.now(timezone.utc)

        if payload.priority:
            clean_priority = payload.priority.strip().lower()
            valid_priorities = {p.value for p in TicketPriority}
            if clean_priority not in valid_priorities:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid priority '{payload.priority}'. Must be one of: {', '.join(valid_priorities)}",
                )
            if ticket.priority != clean_priority:
                old_pri = ticket.priority
                ticket.priority = clean_priority
                changes.append(f"priority: {old_pri} -> {clean_priority}")

        if payload.assigned_admin_id is not None:
            admin_user = await self.db.get(User, payload.assigned_admin_id)
            if not admin_user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Assigned admin user not found.",
                )
            ticket.assigned_admin_id = admin_user.id
            ticket.assigned_admin_email = admin_user.email
            ticket.assigned_admin_name = admin_user.full_name
            changes.append(f"assigned to: {admin_user.email}")

        ticket.updated_at = datetime.now(timezone.utc)
        self.db.add(ticket)

        # Record Platform Audit Log entry atomically
        if changes:
            audit_reason = payload.reason or f"Ticket updated: {'; '.join(changes)}"
            await record_platform_audit_event(
                self.db,
                actor=admin_actor,
                action="support_ticket.status_updated",
                entity_type="support_ticket",
                entity_id=ticket.id,
                entity_name=f"{ticket.reference_number}: {ticket.subject}",
                outcome="success",
                reason=audit_reason,
                details={
                    "reference_number": ticket.reference_number,
                    "changes": changes,
                    "current_status": ticket.status,
                    "current_priority": ticket.priority,
                },
            )

        await self.db.commit()

        return await self._fetch_ticket_and_messages(ticket_id)

    async def platform_reply(
        self,
        ticket_id: UUID,
        admin_actor: User,
        payload: SupportTicketMessageCreateRequest,
    ) -> SupportTicketDetailResponse:
        """Platform administrator replies to a support ticket thread."""
        query = select(SupportTicket).where(SupportTicket.id == ticket_id)
        res = await self.db.execute(query)
        ticket = res.scalar_one_or_none()
        if not ticket:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ticket not found.",
            )

        msg = SupportTicketMessage(
            id=uuid.uuid4(),
            ticket_id=ticket.id,
            sender_id=admin_actor.id,
            sender_email=admin_actor.email,
            sender_name=admin_actor.full_name,
            sender_role="platform_admin",
            message=payload.message.strip(),
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(msg)

        # Transition ticket status to waiting_for_requester
        if ticket.status in (TicketStatus.OPEN.value, TicketStatus.IN_PROGRESS.value):
            ticket.status = TicketStatus.WAITING_FOR_REQUESTER.value

        ticket.updated_at = datetime.now(timezone.utc)
        self.db.add(ticket)

        # Record audit log entry atomically
        await record_platform_audit_event(
            self.db,
            actor=admin_actor,
            action="support_ticket.replied",
            entity_type="support_ticket",
            entity_id=ticket.id,
            entity_name=f"{ticket.reference_number}: {ticket.subject}",
            outcome="success",
            reason="Platform administrator posted reply to support ticket thread",
            details={
                "reference_number": ticket.reference_number,
                "message_snippet": payload.message[:100],
                "new_status": ticket.status,
            },
        )

        await self.db.commit()

        return await self._fetch_ticket_and_messages(ticket_id)
