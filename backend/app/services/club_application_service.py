"""
Aught2 Pickleball — Club Application Service
Business logic for pre-login club registration, status tracking, and platform owner approval.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, time, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models.club import Club
from app.models.club_application import ClubApplication, ClubApplicationStatus
from app.models.club_membership import ClubMembership, ClubRole
from app.models.user import User
from app.repositories.club_application_repository import ClubApplicationRepository
from app.repositories.club_membership_repository import ClubMembershipRepository
from app.repositories.club_repository import ClubRepository
from app.repositories.user_repository import UserRepository
from app.schemas.club_application import (
    ClubApplicationResponse,
    ClubApplicationStatusLookupResponse,
    ClubApplicationSubmitRequest,
)


def _build_application_response(app: ClubApplication) -> ClubApplicationResponse:
    return ClubApplicationResponse(
        id=app.id,
        reference_number=app.reference_number,
        applicant_name=app.applicant_name,
        applicant_email=app.applicant_email,
        applicant_phone=app.applicant_phone,
        user_id=app.user_id,
        club_name=app.club_name,
        slug=app.slug,
        short_description=app.short_description,
        description=app.description,
        contact_email=app.contact_email,
        contact_phone=app.contact_phone,
        website=app.website,
        established_year=app.established_year,
        address_line1=app.address_line1,
        address_line2=app.address_line2,
        city=app.city,
        state=app.state,
        postal_code=app.postal_code,
        country=app.country,
        operating_days=app.operating_days,
        opening_time=app.opening_time.strftime("%H:%M:%S") if isinstance(app.opening_time, time) else str(app.opening_time),
        closing_time=app.closing_time.strftime("%H:%M:%S") if isinstance(app.closing_time, time) else str(app.closing_time),
        timezone=app.timezone,
        facilities_summary=app.facilities_summary,
        status=app.status,
        status_label=app.status.display_label,
        rejection_reason=app.rejection_reason,
        reviewed_by_id=app.reviewed_by_id,
        reviewed_at=app.reviewed_at,
        club_id=app.club_id,
        created_at=app.created_at,
        updated_at=app.updated_at,
    )


def _parse_time(t_val: str | time) -> time:
    if isinstance(t_val, time):
        return t_val
    try:
        parts = str(t_val).strip().split(":")
        return time(int(parts[0]), int(parts[1]), int(parts[2]) if len(parts) > 2 else 0)
    except Exception:
        return time(6, 0)


class ClubApplicationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.app_repo = ClubApplicationRepository(db)
        self.club_repo = ClubRepository(db)
        self.user_repo = UserRepository(db)
        self.membership_repo = ClubMembershipRepository(db)

    async def submit_application(
        self,
        payload: ClubApplicationSubmitRequest,
        current_user_id: UUID | None = None,
    ) -> ClubApplicationResponse:
        """
        Public applicant submission to register a club facility.
        Creates a pending application and associates applicant identity without granting club permissions.
        """
        email = payload.applicant_email.strip().lower()

        # 1. Determine unique slug
        if payload.slug and payload.slug.strip():
            slug = payload.slug.strip().lower()
        else:
            base_slug = re.sub(r"[^a-z0-9]+", "-", payload.club_name.lower()).strip("-")
            slug = base_slug if base_slug else "club"

        # 2. Duplicate validation
        existing_club = await self.club_repo.get_by_slug(slug)
        if existing_club:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A club with this name or slug already exists.",
            )

        pending_by_slug = await self.app_repo.get_pending_by_slug(slug)
        if pending_by_slug:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An application for a club with this name or slug is already pending review.",
            )

        pending_app = await self.app_repo.get_pending_by_email(email)
        if pending_app:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You already have a pending club application under review.",
            )

        # 3. Applicant user identity management
        user_id: UUID | None = None
        if current_user_id:
            user_id = current_user_id
        else:
            existing_user = await self.user_repo.get_by_email(email)
            if existing_user:
                if not verify_password(payload.applicant_password, existing_user.hashed_password):
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="An account with this email already exists. Please verify your password.",
                    )
                user_id = existing_user.id
            else:
                new_user = User(
                    email=email,
                    hashed_password=hash_password(payload.applicant_password),
                    full_name=payload.applicant_name.strip(),
                    is_active=True,
                    is_verified=False,
                )
                self.db.add(new_user)
                await self.db.flush()
                user_id = new_user.id

        # 4. Generate unique reference number
        ref_number = f"APP-{uuid.uuid4().hex[:8].upper()}"
        while await self.app_repo.get_by_reference_number(ref_number):
            ref_number = f"APP-{uuid.uuid4().hex[:8].upper()}"

        # 5. Create pending application
        application = ClubApplication(
            reference_number=ref_number,
            applicant_name=payload.applicant_name.strip(),
            applicant_email=email,
            applicant_phone=payload.applicant_phone.strip() if payload.applicant_phone else None,
            user_id=user_id,
            club_name=payload.club_name.strip(),
            slug=slug,
            short_description=payload.short_description.strip() if payload.short_description else None,
            description=payload.description.strip() if payload.description else None,
            contact_email=str(payload.contact_email).strip().lower() if payload.contact_email else email,
            contact_phone=payload.contact_phone.strip() if payload.contact_phone else payload.applicant_phone,
            website=payload.website.strip() if payload.website else None,
            established_year=payload.established_year,
            address_line1=payload.address_line1.strip() if payload.address_line1 else None,
            address_line2=payload.address_line2.strip() if payload.address_line2 else None,
            city=payload.city.strip() if payload.city else None,
            state=payload.state.strip() if payload.state else None,
            postal_code=payload.postal_code.strip() if payload.postal_code else None,
            country=payload.country.strip() if payload.country else "United States",
            operating_days=payload.operating_days.strip() if payload.operating_days else "Monday - Sunday",
            opening_time=_parse_time(payload.opening_time),
            closing_time=_parse_time(payload.closing_time),
            timezone=payload.timezone.strip() if payload.timezone else "UTC",
            facilities_summary=payload.facilities_summary.strip() if payload.facilities_summary else None,
            status=ClubApplicationStatus.PENDING,
        )

        try:
            created_app = await self.app_repo.create(application)
            await self.db.commit()
            await self.db.refresh(created_app)
            return _build_application_response(created_app)
        except Exception as exc:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to submit application: {str(exc)}",
            )

    async def get_application_status(
        self,
        reference_number: str,
        email: str,
    ) -> ClubApplicationStatusLookupResponse:
        """
        Public status check for an applicant using reference number and email.
        Protects other applicants' private data.
        """
        app = await self.app_repo.get_by_reference_number(reference_number)
        if not app or app.applicant_email.lower().strip() != email.lower().strip():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No club application found matching the provided reference number and email.",
            )

        message: str
        if app.status == ClubApplicationStatus.PENDING:
            message = (
                "Your application is awaiting review by the Aught2 Pickleball platform team. "
                "You will be able to manage your club after your application is approved."
            )
        elif app.status == ClubApplicationStatus.APPROVED:
            message = (
                "Your club registration request has been approved! "
                "You can now sign in with your credentials to access the Club Owner dashboard."
            )
        else:
            reason = f" Reason: {app.rejection_reason}" if app.rejection_reason else ""
            message = f"Your club registration application was rejected.{reason}"

        return ClubApplicationStatusLookupResponse(
            reference_number=app.reference_number,
            club_name=app.club_name,
            applicant_name=app.applicant_name,
            status=app.status,
            status_label=app.status.display_label,
            message=message,
            rejection_reason=app.rejection_reason,
            created_at=app.created_at,
            reviewed_at=app.reviewed_at,
        )

    async def list_my_applications(self, user_id: UUID) -> list[ClubApplicationResponse]:
        """List all club applications submitted by the authenticated user."""
        apps = await self.app_repo.get_by_user_id(user_id)
        return [_build_application_response(a) for a in apps]

    async def platform_list_applications(
        self,
        status_filter: ClubApplicationStatus | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[ClubApplicationResponse], int]:
        """List club applications for platform owner review."""
        items, total = await self.app_repo.list_applications(
            status=status_filter,
            page=page,
            page_size=page_size,
        )
        return [_build_application_response(a) for a in items], total

    async def platform_get_application(self, application_id: UUID) -> ClubApplicationResponse:
        """Retrieve complete application details for platform owner review."""
        app = await self.app_repo.get_by_id(application_id)
        if not app:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Application not found.",
            )
        return _build_application_response(app)

    async def platform_approve_application(
        self,
        application_id: UUID,
        platform_owner_id: UUID,
    ) -> ClubApplicationResponse:
        """
        Atomically approve a pending club application:
        1. Verifies pending state under row lock.
        2. Creates Club entity.
        3. Creates initial ClubMembership with role=club_owner for applicant.
        4. Transitions application status to approved.
        """
        # Row-level lock to prevent concurrent approval race conditions
        app = await self.app_repo.get_by_id(application_id, for_update=True)
        if not app:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Application not found.",
            )

        if app.status != ClubApplicationStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Application cannot be approved because it is already {app.status.value}.",
            )

        # Check if slug was claimed by an existing active club in the interim
        slug = app.slug
        existing_club = await self.club_repo.get_by_slug(slug)
        if existing_club:
            slug = f"{slug}-{uuid.uuid4().hex[:4]}"

        # Ensure user identity exists
        user_id = app.user_id
        if not user_id:
            user = await self.user_repo.get_by_email(app.applicant_email)
            if not user:
                user = User(
                    email=app.applicant_email,
                    hashed_password=hash_password("TemporaryPass123!"),
                    full_name=app.applicant_name,
                    is_active=True,
                    is_verified=True,
                )
                self.db.add(user)
                await self.db.flush()
            user_id = user.id

        try:
            # 1. Create Club entity
            club = Club(
                name=app.club_name,
                slug=slug,
                short_description=app.short_description,
                description=app.description,
                contact_email=app.contact_email,
                contact_phone=app.contact_phone,
                website=app.website,
                established_year=app.established_year,
                address_line1=app.address_line1,
                address_line2=app.address_line2,
                city=app.city,
                state=app.state,
                postal_code=app.postal_code,
                country=app.country or "United States",
                operating_days=app.operating_days or "Monday - Sunday",
                opening_time=app.opening_time,
                closing_time=app.closing_time,
                timezone=app.timezone or "UTC",
                facilities_summary=app.facilities_summary,
                is_active=True,
            )
            self.db.add(club)
            await self.db.flush()
            await self.db.refresh(club)

            # 2. Establish exactly one initial owner membership
            membership = await self.membership_repo.create(
                user_id=user_id,
                club_id=club.id,
                role=ClubRole.CLUB_OWNER,
                is_active=True,
            )
            await self.db.flush()

            # 3. Update application status
            app.status = ClubApplicationStatus.APPROVED
            app.reviewed_by_id = platform_owner_id
            app.reviewed_at = datetime.now(timezone.utc)
            app.club_id = club.id

            await self.db.commit()
            await self.db.refresh(app)
            return _build_application_response(app)

        except HTTPException:
            await self.db.rollback()
            raise
        except Exception as exc:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to approve application: {str(exc)}",
            )

    async def platform_reject_application(
        self,
        application_id: UUID,
        platform_owner_id: UUID,
        rejection_reason: str | None = None,
    ) -> ClubApplicationResponse:
        """
        Atomically reject a pending club application:
        1. Verifies pending state under row lock.
        2. Updates application status to rejected with optional reason.
        3. Never creates club or owner membership.
        """
        app = await self.app_repo.get_by_id(application_id, for_update=True)
        if not app:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Application not found.",
            )

        if app.status != ClubApplicationStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Application cannot be rejected because it is already {app.status.value}.",
            )

        try:
            app.status = ClubApplicationStatus.REJECTED
            app.rejection_reason = rejection_reason.strip() if rejection_reason else None
            app.reviewed_by_id = platform_owner_id
            app.reviewed_at = datetime.now(timezone.utc)

            await self.db.commit()
            await self.db.refresh(app)
            return _build_application_response(app)
        except HTTPException:
            await self.db.rollback()
            raise
        except Exception as exc:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to reject application: {str(exc)}",
            )
