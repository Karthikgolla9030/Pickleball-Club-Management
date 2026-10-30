"""
Aught2 Pickleball — Legal Documents and Help & Support Pydantic Schemas
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ─── Help Category Schemas ───────────────────────────────────────────────────

class HelpCategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    description: str | None = None
    target_audience: str  # "player" | "club" | "all"
    display_order: int
    is_published: bool
    created_at: datetime
    updated_at: datetime


class HelpCategoryCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=2, max_length=100)
    slug: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    target_audience: str = Field(default="all", description="player, club, or all")
    display_order: int = Field(default=0)
    is_published: bool = Field(default=True)


class HelpCategoryUpdateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=2, max_length=100)
    slug: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    target_audience: str | None = None
    display_order: int | None = None
    is_published: bool | None = None


# ─── FAQ Schemas ─────────────────────────────────────────────────────────────

class FAQResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    category_id: UUID | None = None
    category_name: str | None = None
    question: str
    answer: str
    target_audience: str  # "player" | "club" | "all"
    is_published: bool
    display_order: int
    created_at: datetime
    updated_at: datetime


class FAQCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    category_id: UUID | None = None
    question: str = Field(..., min_length=5, max_length=500)
    answer: str = Field(..., min_length=5, max_length=10000)
    target_audience: str = Field(default="all", description="player, club, or all")
    is_published: bool = Field(default=True)
    display_order: int = Field(default=0)


class FAQUpdateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    category_id: UUID | None = None
    question: str | None = Field(default=None, min_length=5, max_length=500)
    answer: str | None = Field(default=None, min_length=5, max_length=10000)
    target_audience: str | None = None
    is_published: bool | None = None
    display_order: int | None = None


class FAQsListResponse(BaseModel):
    items: list[FAQResponse]
    total: int


# ─── Help Article Schemas ────────────────────────────────────────────────────

class HelpArticleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    category_id: UUID | None = None
    category_name: str | None = None
    title: str
    slug: str
    content: str
    target_audience: str  # "player" | "club" | "all"
    is_published: bool
    display_order: int
    created_at: datetime
    updated_at: datetime


class HelpArticleCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    category_id: UUID | None = None
    title: str = Field(..., min_length=3, max_length=255)
    slug: str | None = Field(default=None, max_length=280)
    content: str = Field(..., min_length=10)
    target_audience: str = Field(default="all")
    is_published: bool = Field(default=True)
    display_order: int = Field(default=0)


class HelpArticleUpdateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    category_id: UUID | None = None
    title: str | None = Field(default=None, min_length=3, max_length=255)
    slug: str | None = Field(default=None, max_length=280)
    content: str | None = Field(default=None, min_length=10)
    target_audience: str | None = None
    is_published: bool | None = None
    display_order: int | None = None


class HelpArticlesListResponse(BaseModel):
    items: list[HelpArticleResponse]
    total: int


# ─── Legal Document Schemas ──────────────────────────────────────────────────

class LegalDocumentVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_id: UUID
    version: str
    title: str
    content: str
    status: str  # "draft" | "published" | "archived"
    effective_date: datetime | None = None
    requires_renewed_acceptance: bool = False
    change_summary: str | None = None
    published_at: datetime | None = None
    created_by_user_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


class LegalDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_type: str
    title: str
    target_audience: str
    current_version: LegalDocumentVersionResponse | None = None
    created_at: datetime
    updated_at: datetime


class LegalDocumentDetailResponse(LegalDocumentResponse):
    versions: list[LegalDocumentVersionResponse] = Field(default_factory=list)


class LegalDocumentVersionCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    version: str = Field(..., min_length=1, max_length=20, description="e.g. 1.1 or 2.0")
    title: str = Field(..., min_length=3, max_length=255)
    content: str = Field(..., min_length=10)
    requires_renewed_acceptance: bool = Field(default=False)
    change_summary: str | None = Field(default=None, max_length=2000)
    effective_date: datetime | None = None


class LegalDocumentVersionUpdateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str | None = Field(default=None, min_length=3, max_length=255)
    content: str | None = Field(default=None, min_length=10)
    requires_renewed_acceptance: bool | None = None
    change_summary: str | None = Field(default=None, max_length=2000)
    effective_date: datetime | None = None


class LegalDocumentPublishRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    effective_date: datetime | None = None
    requires_renewed_acceptance: bool = Field(default=False)
    change_summary: str | None = Field(default=None, max_length=2000)


# ─── Acceptance Schemas ──────────────────────────────────────────────────────

class LegalAcceptanceCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    document_type: str = Field(..., description="player_terms, club_terms, privacy_policy, club_agreement")
    version_id: UUID | None = Field(default=None, description="Optional specific version ID; defaults to current published version")
    club_id: UUID | None = Field(default=None, description="Optional related club ID")
    source: str = Field(default="user_prompt", description="player_registration, club_registration, profile_modal, renewed_prompt, web")


class LegalAcceptanceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    document_id: UUID
    version_id: UUID
    document_type: str
    document_version: str
    document_title: str | None = None
    club_id: UUID | None = None
    club_name: str | None = None
    source: str
    accepted_at: datetime


class PendingAcceptanceItem(BaseModel):
    document_type: str
    document_title: str
    document_id: UUID
    version_id: UUID
    version: str
    effective_date: datetime | None = None
    requires_renewed_acceptance: bool = False
    content_summary: str | None = None


class PendingAcceptancesResponse(BaseModel):
    pending_documents: list[PendingAcceptanceItem]
    has_pending: bool

