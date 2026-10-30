"""
Aught2 Pickleball — Legal Documents and Help & Support Service

Business logic for:
- Retrieving published legal documents and tracking user acceptances
- Providing dynamic, role-filtered Help Categories, FAQs, and Articles
- Administrative authoring, versioning, preview, and publishing of legal documents and help content
- Automatic initial database seeding with comprehensive content
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.legal_and_help_defaults import (
    DEFAULT_FAQS,
    DEFAULT_HELP_ARTICLES,
    DEFAULT_HELP_CATEGORIES,
    DEFAULT_LEGAL_DOCUMENTS,
)
from app.models.club import Club
from app.models.club_membership import ClubMembership, ClubRole
from app.models.legal_and_help import (
    ContentAudience,
    DocumentVersionStatus,
    FAQ,
    HelpArticle,
    HelpCategory,
    LegalAcceptance,
    LegalDocument,
    LegalDocumentType,
    LegalDocumentVersion,
)
from app.models.user import User
from app.schemas.legal_and_help import (
    FAQCreateRequest,
    FAQResponse,
    FAQsListResponse,
    FAQUpdateRequest,
    HelpArticleCreateRequest,
    HelpArticleResponse,
    HelpArticlesListResponse,
    HelpArticleUpdateRequest,
    HelpCategoryCreateRequest,
    HelpCategoryResponse,
    HelpCategoryUpdateRequest,
    LegalAcceptanceCreateRequest,
    LegalAcceptanceResponse,
    LegalDocumentDetailResponse,
    LegalDocumentPublishRequest,
    LegalDocumentResponse,
    LegalDocumentVersionCreateRequest,
    LegalDocumentVersionResponse,
    LegalDocumentVersionUpdateRequest,
    PendingAcceptanceItem,
    PendingAcceptancesResponse,
)

logger = logging.getLogger(__name__)


def _slugify(text: str) -> str:
    s = text.strip().lower()
    s = re.sub(r"[^\w\s-]", "", s)
    return re.sub(r"[-\s]+", "-", s).strip("-")


class LegalAndHelpService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def seed_defaults_if_empty(self) -> None:
        """Seed initial legal documents, help categories, and FAQs if tables are empty."""
        try:
            doc_count = await self.db.scalar(select(func.count(LegalDocument.id))) or 0
            if doc_count == 0:
                logger.info("Seeding initial default legal documents...")
                now = datetime.now(timezone.utc)
                for item in DEFAULT_LEGAL_DOCUMENTS:
                    doc = LegalDocument(
                        id=uuid.uuid4(),
                        document_type=item["document_type"],
                        title=item["title"],
                        target_audience=item["target_audience"],
                        created_at=now,
                        updated_at=now,
                    )
                    self.db.add(doc)
                    await self.db.flush()

                    ver = LegalDocumentVersion(
                        id=uuid.uuid4(),
                        document_id=doc.id,
                        version=item["version"],
                        title=item["title"],
                        content=item["content"].strip(),
                        status=DocumentVersionStatus.PUBLISHED.value,
                        effective_date=now,
                        published_at=now,
                        requires_renewed_acceptance=False,
                        change_summary=item.get("change_summary"),
                        created_at=now,
                        updated_at=now,
                    )
                    self.db.add(ver)
                await self.db.commit()

            cat_count = await self.db.scalar(select(func.count(HelpCategory.id))) or 0
            if cat_count == 0:
                logger.info("Seeding initial default help categories and FAQs...")
                now = datetime.now(timezone.utc)
                cats_by_slug = {}
                for item in DEFAULT_HELP_CATEGORIES:
                    cat = HelpCategory(
                        id=uuid.uuid4(),
                        name=item["name"],
                        slug=item["slug"],
                        description=item["description"],
                        target_audience=item["target_audience"],
                        display_order=item["display_order"],
                        is_published=True,
                        created_at=now,
                        updated_at=now,
                    )
                    self.db.add(cat)
                    cats_by_slug[item["slug"]] = cat
                await self.db.flush()

                for faq_item in DEFAULT_FAQS:
                    cat = cats_by_slug.get(faq_item.get("category_slug", ""))
                    faq = FAQ(
                        id=uuid.uuid4(),
                        category_id=cat.id if cat else None,
                        question=faq_item["question"],
                        answer=faq_item["answer"],
                        target_audience=faq_item["target_audience"],
                        display_order=faq_item["display_order"],
                        is_published=True,
                        created_at=now,
                        updated_at=now,
                    )
                    self.db.add(faq)

                for art_item in DEFAULT_HELP_ARTICLES:
                    cat = cats_by_slug.get(art_item.get("category_slug", ""))
                    art = HelpArticle(
                        id=uuid.uuid4(),
                        category_id=cat.id if cat else None,
                        title=art_item["title"],
                        slug=art_item["slug"],
                        content=art_item["content"],
                        target_audience=art_item["target_audience"],
                        display_order=art_item["display_order"],
                        is_published=True,
                        created_at=now,
                        updated_at=now,
                    )
                    self.db.add(art)
                await self.db.commit()
        except Exception as exc:
            logger.warning("Default seeding check encountered an issue: %s", exc)
            await self.db.rollback()

    # ─── Public & Portal Help Content ────────────────────────────────────────

    async def list_categories(
        self,
        target_audience: str | None = None,
    ) -> list[HelpCategoryResponse]:
        """List published help categories matching audience."""
        cat_count = await self.db.scalar(select(func.count(HelpCategory.id))) or 0
        if cat_count == 0:
            await self.seed_defaults_if_empty()

        stmt = (
            select(HelpCategory)
            .where(HelpCategory.is_published.is_(True))
            .order_by(HelpCategory.display_order.asc(), HelpCategory.name.asc())
        )
        if target_audience and target_audience != ContentAudience.ALL.value:
            stmt = stmt.where(
                HelpCategory.target_audience.in_([target_audience, ContentAudience.ALL.value])
            )
        res = await self.db.execute(stmt)
        return [HelpCategoryResponse.model_validate(c) for c in res.scalars().all()]

    async def list_faqs(
        self,
        target_audience: str | None = None,
        category_id: UUID | None = None,
        search: str | None = None,
    ) -> FAQsListResponse:
        """List published FAQs with optional category and search filtering."""
        stmt = (
            select(FAQ)
            .options(selectinload(FAQ.category))
            .where(FAQ.is_published.is_(True))
            .order_by(FAQ.display_order.asc(), FAQ.created_at.asc())
        )
        if target_audience and target_audience != ContentAudience.ALL.value:
            stmt = stmt.where(
                FAQ.target_audience.in_([target_audience, ContentAudience.ALL.value])
            )
        if category_id:
            stmt = stmt.where(FAQ.category_id == category_id)
        if search and search.strip():
            term = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    FAQ.question.ilike(term),
                    FAQ.answer.ilike(term),
                )
            )

        res = await self.db.execute(stmt)
        faqs = res.scalars().all()
        items = []
        for f in faqs:
            item = FAQResponse.model_validate(f)
            item.category_name = f.category.name if f.category else None
            items.append(item)
        return FAQsListResponse(items=items, total=len(items))

    async def list_articles(
        self,
        target_audience: str | None = None,
        category_id: UUID | None = None,
        search: str | None = None,
    ) -> HelpArticlesListResponse:
        """List published help articles with optional category and search filtering."""
        stmt = (
            select(HelpArticle)
            .options(selectinload(HelpArticle.category))
            .where(HelpArticle.is_published.is_(True))
            .order_by(HelpArticle.display_order.asc(), HelpArticle.created_at.asc())
        )
        if target_audience and target_audience != ContentAudience.ALL.value:
            stmt = stmt.where(
                HelpArticle.target_audience.in_([target_audience, ContentAudience.ALL.value])
            )
        if category_id:
            stmt = stmt.where(HelpArticle.category_id == category_id)
        if search and search.strip():
            term = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    HelpArticle.title.ilike(term),
                    HelpArticle.content.ilike(term),
                )
            )

        res = await self.db.execute(stmt)
        articles = res.scalars().all()
        items = []
        for a in articles:
            item = HelpArticleResponse.model_validate(a)
            item.category_name = a.category.name if a.category else None
            items.append(item)
        return HelpArticlesListResponse(items=items, total=len(items))

    async def get_article(self, slug_or_id: str) -> HelpArticleResponse:
        """Retrieve single published article by slug or UUID."""
        stmt = (
            select(HelpArticle)
            .options(selectinload(HelpArticle.category))
            .where(HelpArticle.is_published.is_(True))
        )
        try:
            val_uuid = UUID(slug_or_id)
            stmt = stmt.where(HelpArticle.id == val_uuid)
        except ValueError:
            stmt = stmt.where(HelpArticle.slug == slug_or_id)

        res = await self.db.execute(stmt)
        article = res.scalar_one_or_none()
        if not article:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Help article not found or unpublished.",
            )
        item = HelpArticleResponse.model_validate(article)
        item.category_name = article.category.name if article.category else None
        return item

    # ─── Public & Portal Legal Documents ─────────────────────────────────────

    async def get_published_document(
        self,
        document_type: str,
        version: str | None = None,
    ) -> LegalDocumentVersionResponse:
        """
        Retrieve current published version (or specific published version) of a legal document.
        Accessible publicly without authentication.
        """
        doc_count = await self.db.scalar(select(func.count(LegalDocument.id))) or 0
        if doc_count == 0:
            await self.seed_defaults_if_empty()

        # Resolve document
        doc_stmt = select(LegalDocument).where(LegalDocument.document_type == document_type.strip().lower())
        doc_res = await self.db.execute(doc_stmt)
        doc = doc_res.scalar_one_or_none()
        if not doc:
            # Fallback alias matching (e.g. "terms" -> "player_terms", "privacy" -> "privacy_policy")
            aliases = {
                "terms": LegalDocumentType.PLAYER_TERMS.value,
                "player_terms": LegalDocumentType.PLAYER_TERMS.value,
                "player-terms": LegalDocumentType.PLAYER_TERMS.value,
                "club_terms": LegalDocumentType.CLUB_TERMS.value,
                "club-terms": LegalDocumentType.CLUB_TERMS.value,
                "privacy": LegalDocumentType.PRIVACY_POLICY.value,
                "privacy_policy": LegalDocumentType.PRIVACY_POLICY.value,
                "privacy-policy": LegalDocumentType.PRIVACY_POLICY.value,
                "club_agreement": LegalDocumentType.CLUB_AGREEMENT.value,
                "club-agreement": LegalDocumentType.CLUB_AGREEMENT.value,
            }
            resolved_type = aliases.get(document_type.strip().lower())
            if resolved_type:
                doc_res = await self.db.execute(select(LegalDocument).where(LegalDocument.document_type == resolved_type))
                doc = doc_res.scalar_one_or_none()

        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Legal document '{document_type}' not found.",
            )

        ver_stmt = select(LegalDocumentVersion).where(
            LegalDocumentVersion.document_id == doc.id,
        )
        if version:
            ver_stmt = ver_stmt.where(
                LegalDocumentVersion.version == version,
                LegalDocumentVersion.status.in_([DocumentVersionStatus.PUBLISHED.value, DocumentVersionStatus.ARCHIVED.value]),
            )
        else:
            ver_stmt = ver_stmt.where(
                LegalDocumentVersion.status == DocumentVersionStatus.PUBLISHED.value
            ).order_by(desc(LegalDocumentVersion.published_at), desc(LegalDocumentVersion.created_at))

        ver_res = await self.db.execute(ver_stmt)
        ver = ver_res.scalars().first()
        if not ver:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No published version found for document '{doc.title}'.",
            )
        return LegalDocumentVersionResponse.model_validate(ver)

    async def list_pending_acceptances(
        self,
        user: User,
        club_id: UUID | None = None,
    ) -> PendingAcceptancesResponse:
        """
        Compute which published legal documents currently require acceptance by the user.
        Evaluates role context (Player vs Club Staff) and checks historical acceptance records.
        """
        # Determine applicable document types
        applicable_types = [LegalDocumentType.PRIVACY_POLICY.value, LegalDocumentType.PLAYER_TERMS.value]

        # Check if user is active staff of the specified or any club
        is_club_staff = False
        if club_id:
            membership = await self.db.scalar(
                select(ClubMembership).where(
                    ClubMembership.user_id == user.id,
                    ClubMembership.club_id == club_id,
                    ClubMembership.is_active.is_(True),
                )
            )
            is_club_staff = membership is not None
        else:
            staff_count = await self.db.scalar(
                select(func.count(ClubMembership.id)).where(
                    ClubMembership.user_id == user.id,
                    ClubMembership.is_active.is_(True),
                )
            ) or 0
            is_club_staff = staff_count > 0

        if is_club_staff:
            applicable_types.extend([LegalDocumentType.CLUB_TERMS.value, LegalDocumentType.CLUB_AGREEMENT.value])

        # Query current published versions for applicable types
        docs_stmt = (
            select(LegalDocument)
            .options(
                selectinload(
                    LegalDocument.versions.and_(
                        LegalDocumentVersion.status == DocumentVersionStatus.PUBLISHED.value
                    )
                )
            )
            .where(LegalDocument.document_type.in_(applicable_types))
        )
        res = await self.db.execute(docs_stmt)
        documents = res.scalars().all()

        pending_items: list[PendingAcceptanceItem] = []
        for doc in documents:
            published_vers = [v for v in doc.versions if v.status == DocumentVersionStatus.PUBLISHED.value]
            if not published_vers:
                continue
            curr_ver = published_vers[0]

            # Check if user has accepted this specific version
            accepted = await self.db.scalar(
                select(LegalAcceptance.id).where(
                    LegalAcceptance.user_id == user.id,
                    LegalAcceptance.document_id == doc.id,
                    LegalAcceptance.version_id == curr_ver.id,
                )
            )

            if not accepted:
                # If never accepted this version:
                # If it's a version requiring renewed acceptance OR user never accepted any version of this doc:
                ever_accepted = await self.db.scalar(
                    select(LegalAcceptance.id).where(
                        LegalAcceptance.user_id == user.id,
                        LegalAcceptance.document_id == doc.id,
                    )
                )
                if (not ever_accepted) or curr_ver.requires_renewed_acceptance:
                    pending_items.append(
                        PendingAcceptanceItem(
                            document_type=doc.document_type,
                            document_title=doc.title,
                            document_id=doc.id,
                            version_id=curr_ver.id,
                            version=curr_ver.version,
                            effective_date=curr_ver.effective_date,
                            requires_renewed_acceptance=curr_ver.requires_renewed_acceptance,
                            content_summary=curr_ver.change_summary or doc.title,
                        )
                    )

        return PendingAcceptancesResponse(
            pending_documents=pending_items,
            has_pending=len(pending_items) > 0,
        )

    async def record_acceptance(
        self,
        user: User,
        payload: LegalAcceptanceCreateRequest,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> LegalAcceptanceResponse:
        """
        Record user acceptance of a legal document version.
        Ensures idempotency: if already accepted for this version, returns existing record.
        """
        clean_type = payload.document_type.strip().lower()
        doc_stmt = select(LegalDocument).where(LegalDocument.document_type == clean_type)
        doc = (await self.db.execute(doc_stmt)).scalar_one_or_none()
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Legal document type '{payload.document_type}' not found.",
            )

        if payload.version_id:
            ver = await self.db.get(LegalDocumentVersion, payload.version_id)
            if not ver or ver.document_id != doc.id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Specified document version not found.",
                )
        else:
            ver_stmt = (
                select(LegalDocumentVersion)
                .where(
                    LegalDocumentVersion.document_id == doc.id,
                    LegalDocumentVersion.status == DocumentVersionStatus.PUBLISHED.value,
                )
                .order_by(desc(LegalDocumentVersion.published_at))
            )
            ver = (await self.db.execute(ver_stmt)).scalars().first()
            if not ver:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No published version available for acceptance.",
                )

        # Check existing acceptance
        existing_stmt = select(LegalAcceptance).where(
            LegalAcceptance.user_id == user.id,
            LegalAcceptance.document_id == doc.id,
            LegalAcceptance.version_id == ver.id,
        )
        existing = (await self.db.execute(existing_stmt)).scalar_one_or_none()
        if existing:
            item = LegalAcceptanceResponse.model_validate(existing)
            item.document_title = doc.title
            return item

        # Validate club if provided
        club_name = None
        if payload.club_id:
            club = await self.db.get(Club, payload.club_id)
            if club:
                club_name = club.name

        acceptance = LegalAcceptance(
            id=uuid.uuid4(),
            user_id=user.id,
            document_id=doc.id,
            version_id=ver.id,
            document_type=doc.document_type,
            document_version=ver.version,
            club_id=payload.club_id,
            source=payload.source or "user_prompt",
            ip_address=ip_address,
            user_agent=user_agent,
            accepted_at=datetime.now(timezone.utc),
        )
        self.db.add(acceptance)
        await self.db.commit()
        await self.db.refresh(acceptance)

        resp = LegalAcceptanceResponse.model_validate(acceptance)
        resp.document_title = doc.title
        resp.club_name = club_name
        return resp

    async def list_user_acceptances(self, user: User) -> list[LegalAcceptanceResponse]:
        """List chronological acceptance history for authenticated user."""
        stmt = (
            select(LegalAcceptance)
            .options(selectinload(LegalAcceptance.document), selectinload(LegalAcceptance.club))
            .where(LegalAcceptance.user_id == user.id)
            .order_by(desc(LegalAcceptance.accepted_at))
        )
        res = await self.db.execute(stmt)
        records = res.scalars().all()
        out = []
        for r in records:
            item = LegalAcceptanceResponse.model_validate(r)
            item.document_title = r.document.title if r.document else r.document_type
            item.club_name = r.club.name if r.club else None
            out.append(item)
        return out

    # ─── Platform Admin Help Management ──────────────────────────────────────

    async def admin_list_categories(self) -> list[HelpCategoryResponse]:
        stmt = select(HelpCategory).order_by(HelpCategory.display_order.asc(), HelpCategory.name.asc())
        res = await self.db.execute(stmt)
        return [HelpCategoryResponse.model_validate(c) for c in res.scalars().all()]

    async def admin_create_category(self, payload: HelpCategoryCreateRequest) -> HelpCategoryResponse:
        slug = payload.slug or _slugify(payload.name)
        existing = await self.db.scalar(select(HelpCategory.id).where(HelpCategory.slug == slug))
        if existing:
            slug = f"{slug}-{uuid.uuid4().hex[:4]}"

        cat = HelpCategory(
            id=uuid.uuid4(),
            name=payload.name.strip(),
            slug=slug,
            description=payload.description.strip() if payload.description else None,
            target_audience=payload.target_audience or ContentAudience.ALL.value,
            display_order=payload.display_order,
            is_published=payload.is_published,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        self.db.add(cat)
        await self.db.commit()
        await self.db.refresh(cat)
        return HelpCategoryResponse.model_validate(cat)

    async def admin_update_category(self, category_id: UUID, payload: HelpCategoryUpdateRequest) -> HelpCategoryResponse:
        cat = await self.db.get(HelpCategory, category_id)
        if not cat:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

        if payload.name is not None:
            cat.name = payload.name.strip()
        if payload.slug is not None:
            cat.slug = _slugify(payload.slug)
        if payload.description is not None:
            cat.description = payload.description.strip() if payload.description else None
        if payload.target_audience is not None:
            cat.target_audience = payload.target_audience
        if payload.display_order is not None:
            cat.display_order = payload.display_order
        if payload.is_published is not None:
            cat.is_published = payload.is_published

        cat.updated_at = datetime.now(timezone.utc)
        self.db.add(cat)
        await self.db.commit()
        await self.db.refresh(cat)
        return HelpCategoryResponse.model_validate(cat)

    async def admin_delete_category(self, category_id: UUID) -> dict[str, str]:
        cat = await self.db.get(HelpCategory, category_id)
        if not cat:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
        await self.db.delete(cat)
        await self.db.commit()
        return {"message": "Category deleted successfully."}

    # FAQs
    async def admin_list_faqs(self) -> FAQsListResponse:
        stmt = select(FAQ).options(selectinload(FAQ.category)).order_by(FAQ.display_order.asc(), FAQ.created_at.asc())
        res = await self.db.execute(stmt)
        faqs = res.scalars().all()
        items = []
        for f in faqs:
            item = FAQResponse.model_validate(f)
            item.category_name = f.category.name if f.category else None
            items.append(item)
        return FAQsListResponse(items=items, total=len(items))

    async def admin_create_faq(self, payload: FAQCreateRequest) -> FAQResponse:
        faq = FAQ(
            id=uuid.uuid4(),
            category_id=payload.category_id,
            question=payload.question.strip(),
            answer=payload.answer.strip(),
            target_audience=payload.target_audience or ContentAudience.ALL.value,
            is_published=payload.is_published,
            display_order=payload.display_order,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        self.db.add(faq)
        await self.db.commit()
        await self.db.refresh(faq)
        return FAQResponse.model_validate(faq)

    async def admin_update_faq(self, faq_id: UUID, payload: FAQUpdateRequest) -> FAQResponse:
        faq = await self.db.get(FAQ, faq_id)
        if not faq:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ not found")
        if payload.category_id is not None:
            faq.category_id = payload.category_id
        if payload.question is not None:
            faq.question = payload.question.strip()
        if payload.answer is not None:
            faq.answer = payload.answer.strip()
        if payload.target_audience is not None:
            faq.target_audience = payload.target_audience
        if payload.is_published is not None:
            faq.is_published = payload.is_published
        if payload.display_order is not None:
            faq.display_order = payload.display_order

        faq.updated_at = datetime.now(timezone.utc)
        self.db.add(faq)
        await self.db.commit()
        await self.db.refresh(faq)
        return FAQResponse.model_validate(faq)

    async def admin_delete_faq(self, faq_id: UUID) -> dict[str, str]:
        faq = await self.db.get(FAQ, faq_id)
        if not faq:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ not found")
        await self.db.delete(faq)
        await self.db.commit()
        return {"message": "FAQ deleted successfully."}

    # Articles
    async def admin_list_articles(self) -> HelpArticlesListResponse:
        stmt = (
            select(HelpArticle)
            .options(selectinload(HelpArticle.category))
            .order_by(HelpArticle.display_order.asc(), HelpArticle.created_at.asc())
        )
        res = await self.db.execute(stmt)
        articles = res.scalars().all()
        items = []
        for a in articles:
            item = HelpArticleResponse.model_validate(a)
            item.category_name = a.category.name if a.category else None
            items.append(item)
        return HelpArticlesListResponse(items=items, total=len(items))

    async def admin_create_article(self, payload: HelpArticleCreateRequest) -> HelpArticleResponse:
        slug = payload.slug or _slugify(payload.title)
        existing = await self.db.scalar(select(HelpArticle.id).where(HelpArticle.slug == slug))
        if existing:
            slug = f"{slug}-{uuid.uuid4().hex[:4]}"

        article = HelpArticle(
            id=uuid.uuid4(),
            category_id=payload.category_id,
            title=payload.title.strip(),
            slug=slug,
            content=payload.content.strip(),
            target_audience=payload.target_audience or ContentAudience.ALL.value,
            is_published=payload.is_published,
            display_order=payload.display_order,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        self.db.add(article)
        await self.db.commit()
        await self.db.refresh(article)
        return HelpArticleResponse.model_validate(article)

    async def admin_update_article(self, article_id: UUID, payload: HelpArticleUpdateRequest) -> HelpArticleResponse:
        article = await self.db.get(HelpArticle, article_id)
        if not article:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found")

        if payload.category_id is not None:
            article.category_id = payload.category_id
        if payload.title is not None:
            article.title = payload.title.strip()
        if payload.slug is not None:
            article.slug = _slugify(payload.slug)
        if payload.content is not None:
            article.content = payload.content.strip()
        if payload.target_audience is not None:
            article.target_audience = payload.target_audience
        if payload.is_published is not None:
            article.is_published = payload.is_published
        if payload.display_order is not None:
            article.display_order = payload.display_order

        article.updated_at = datetime.now(timezone.utc)
        self.db.add(article)
        await self.db.commit()
        await self.db.refresh(article)
        return HelpArticleResponse.model_validate(article)

    async def admin_delete_article(self, article_id: UUID) -> dict[str, str]:
        article = await self.db.get(HelpArticle, article_id)
        if not article:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found")
        await self.db.delete(article)
        await self.db.commit()
        return {"message": "Article deleted successfully."}

    # ─── Platform Admin Legal Documents Management ───────────────────────────

    async def admin_list_documents(self) -> list[LegalDocumentResponse]:
        """List all managed legal documents with their current published version."""
        stmt = (
            select(LegalDocument)
            .options(selectinload(LegalDocument.versions))
            .order_by(LegalDocument.created_at.asc())
        )
        res = await self.db.execute(stmt)
        docs = res.scalars().all()
        out = []
        for d in docs:
            resp = LegalDocumentResponse.model_validate(d)
            published_vers = [v for v in d.versions if v.status == DocumentVersionStatus.PUBLISHED.value]
            if published_vers:
                published_vers.sort(key=lambda x: x.published_at or x.created_at, reverse=True)
                resp.current_version = LegalDocumentVersionResponse.model_validate(published_vers[0])
            out.append(resp)
        return out

    async def admin_get_document(self, document_id: UUID) -> LegalDocumentDetailResponse:
        """Get legal document details with complete version history."""
        stmt = (
            select(LegalDocument)
            .options(selectinload(LegalDocument.versions))
            .where(LegalDocument.id == document_id)
        )
        res = await self.db.execute(stmt)
        doc = res.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Legal document not found.")

        resp = LegalDocumentDetailResponse.model_validate(doc)
        published_vers = [v for v in doc.versions if v.status == DocumentVersionStatus.PUBLISHED.value]
        if published_vers:
            published_vers.sort(key=lambda x: x.published_at or x.created_at, reverse=True)
            resp.current_version = LegalDocumentVersionResponse.model_validate(published_vers[0])
        resp.versions = [LegalDocumentVersionResponse.model_validate(v) for v in doc.versions]
        return resp

    async def admin_create_version(
        self,
        document_id: UUID,
        payload: LegalDocumentVersionCreateRequest,
        admin_user: User,
    ) -> LegalDocumentVersionResponse:
        """Create a new draft version for a legal document."""
        doc = await self.db.get(LegalDocument, document_id)
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Legal document not found.")

        # Check version duplicate
        dup = await self.db.scalar(
            select(LegalDocumentVersion.id).where(
                LegalDocumentVersion.document_id == document_id,
                LegalDocumentVersion.version == payload.version.strip(),
            )
        )
        if dup:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Version '{payload.version}' already exists for this document.",
            )

        ver = LegalDocumentVersion(
            id=uuid.uuid4(),
            document_id=doc.id,
            version=payload.version.strip(),
            title=payload.title.strip(),
            content=payload.content.strip(),
            status=DocumentVersionStatus.DRAFT.value,
            effective_date=payload.effective_date or datetime.now(timezone.utc),
            requires_renewed_acceptance=payload.requires_renewed_acceptance,
            change_summary=payload.change_summary.strip() if payload.change_summary else None,
            created_by_user_id=admin_user.id,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        self.db.add(ver)
        await self.db.commit()
        await self.db.refresh(ver)
        return LegalDocumentVersionResponse.model_validate(ver)

    async def admin_update_version(
        self,
        version_id: UUID,
        payload: LegalDocumentVersionUpdateRequest,
    ) -> LegalDocumentVersionResponse:
        """Update draft document version."""
        ver = await self.db.get(LegalDocumentVersion, version_id)
        if not ver:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found.")

        if ver.status == DocumentVersionStatus.ARCHIVED.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Archived versions cannot be modified.",
            )

        if payload.title is not None:
            ver.title = payload.title.strip()
        if payload.content is not None:
            ver.content = payload.content.strip()
        if payload.requires_renewed_acceptance is not None:
            ver.requires_renewed_acceptance = payload.requires_renewed_acceptance
        if payload.change_summary is not None:
            ver.change_summary = payload.change_summary.strip() if payload.change_summary else None
        if payload.effective_date is not None:
            ver.effective_date = payload.effective_date

        ver.updated_at = datetime.now(timezone.utc)
        self.db.add(ver)
        await self.db.commit()
        await self.db.refresh(ver)
        return LegalDocumentVersionResponse.model_validate(ver)

    async def admin_publish_version(
        self,
        version_id: UUID,
        payload: LegalDocumentPublishRequest,
        admin_user: User,
    ) -> LegalDocumentVersionResponse:
        """
        Publish document version atomically.
        Archives any existing published version of the same document.
        """
        ver = await self.db.get(LegalDocumentVersion, version_id)
        if not ver:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found.")

        # Archive other published versions of this document
        existing_published = (
            await self.db.execute(
                select(LegalDocumentVersion).where(
                    LegalDocumentVersion.document_id == ver.document_id,
                    LegalDocumentVersion.id != ver.id,
                    LegalDocumentVersion.status == DocumentVersionStatus.PUBLISHED.value,
                )
            )
        ).scalars().all()

        for ep in existing_published:
            ep.status = DocumentVersionStatus.ARCHIVED.value
            ep.updated_at = datetime.now(timezone.utc)
            self.db.add(ep)

        ver.status = DocumentVersionStatus.PUBLISHED.value
        ver.published_at = datetime.now(timezone.utc)
        if payload.effective_date:
            ver.effective_date = payload.effective_date
        elif not ver.effective_date:
            ver.effective_date = datetime.now(timezone.utc)

        ver.requires_renewed_acceptance = payload.requires_renewed_acceptance
        if payload.change_summary:
            ver.change_summary = payload.change_summary.strip()

        ver.updated_at = datetime.now(timezone.utc)
        self.db.add(ver)
        await self.db.commit()
        await self.db.refresh(ver)
        return LegalDocumentVersionResponse.model_validate(ver)

    async def admin_list_acceptances(
        self,
        document_id: UUID | None = None,
        version_id: UUID | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> list[LegalAcceptanceResponse]:
        """List user acceptance records for administrative compliance audits."""
        stmt = (
            select(LegalAcceptance)
            .options(selectinload(LegalAcceptance.document), selectinload(LegalAcceptance.club))
            .order_by(desc(LegalAcceptance.accepted_at))
        )
        if document_id:
            stmt = stmt.where(LegalAcceptance.document_id == document_id)
        if version_id:
            stmt = stmt.where(LegalAcceptance.version_id == version_id)

        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        res = await self.db.execute(stmt)
        records = res.scalars().all()
        out = []
        for r in records:
            item = LegalAcceptanceResponse.model_validate(r)
            item.document_title = r.document.title if r.document else r.document_type
            item.club_name = r.club.name if r.club else None
            out.append(item)
        return out
