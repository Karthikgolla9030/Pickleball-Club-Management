/**
 * Aught2 Pickleball — Legal Documents and Help & Support API Client
 */
import { apiClient } from './client';

export interface HelpCategoryItem {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  target_audience: 'player' | 'club' | 'all' | string;
  display_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface FAQItem {
  id: string;
  category_id?: string | null;
  category_name?: string | null;
  question: string;
  answer: string;
  target_audience: 'player' | 'club' | 'all' | string;
  is_published: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface FAQsListResponse {
  items: FAQItem[];
  total: number;
}

export interface HelpArticleItem {
  id: string;
  category_id?: string | null;
  category_name?: string | null;
  title: string;
  slug: string;
  content: string;
  target_audience: 'player' | 'club' | 'all' | string;
  is_published: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface HelpArticlesListResponse {
  items: HelpArticleItem[];
  total: number;
}

export interface LegalDocumentVersionItem {
  id: string;
  document_id: string;
  version: string;
  title: string;
  content: string;
  status: 'draft' | 'published' | 'archived' | string;
  effective_date?: string | null;
  requires_renewed_acceptance: boolean;
  change_summary?: string | null;
  published_at?: string | null;
  created_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LegalDocumentItem {
  id: string;
  document_type: string;
  title: string;
  target_audience: string;
  current_version?: LegalDocumentVersionItem | null;
  created_at: string;
  updated_at: string;
}

export interface LegalDocumentDetailResponse extends LegalDocumentItem {
  versions: LegalDocumentVersionItem[];
}

export interface PendingAcceptanceItem {
  document_type: string;
  document_title: string;
  document_id: string;
  version_id: string;
  version: string;
  effective_date?: string | null;
  requires_renewed_acceptance: boolean;
  content_summary?: string | null;
}

export interface PendingAcceptancesResponse {
  pending_documents: PendingAcceptanceItem[];
  has_pending: boolean;
}

export interface LegalAcceptanceItem {
  id: string;
  user_id: string;
  document_id: string;
  version_id: string;
  document_type: string;
  document_version: string;
  document_title?: string | null;
  club_id?: string | null;
  club_name?: string | null;
  source: string;
  accepted_at: string;
}

// ─── Help API ────────────────────────────────────────────────────────────────

export const helpApi = {
  /** List published help categories */
  getCategories: (audience?: 'player' | 'club' | 'all'): Promise<HelpCategoryItem[]> => {
    const query = audience ? `?audience=${audience}` : '';
    return apiClient.get<HelpCategoryItem[]>(`/api/v1/help/categories${query}`);
  },

  /** List published FAQs with optional category and search */
  getFaqs: (params?: {
    audience?: 'player' | 'club' | 'all';
    categoryId?: string;
    search?: string;
  }): Promise<FAQsListResponse> => {
    const q = new URLSearchParams();
    if (params?.audience) q.append('audience', params.audience);
    if (params?.categoryId) q.append('category_id', params.categoryId);
    if (params?.search) q.append('search', params.search.trim());
    return apiClient.get<FAQsListResponse>(`/api/v1/help/faqs?${q.toString()}`);
  },

  /** List published help articles */
  getArticles: (params?: {
    audience?: 'player' | 'club' | 'all';
    categoryId?: string;
    search?: string;
  }): Promise<HelpArticlesListResponse> => {
    const q = new URLSearchParams();
    if (params?.audience) q.append('audience', params.audience);
    if (params?.categoryId) q.append('category_id', params.categoryId);
    if (params?.search) q.append('search', params.search.trim());
    return apiClient.get<HelpArticlesListResponse>(`/api/v1/help/articles?${q.toString()}`);
  },

  /** Get single article */
  getArticle: (slugOrId: string): Promise<HelpArticleItem> => {
    return apiClient.get<HelpArticleItem>(`/api/v1/help/articles/${slugOrId}`);
  },
};

// ─── Legal API ───────────────────────────────────────────────────────────────

export const legalApi = {
  /** Get current published legal document (public) */
  getDocument: (documentType: string, version?: string): Promise<LegalDocumentVersionItem> => {
    const q = version ? `?version=${version}` : '';
    return apiClient.get<LegalDocumentVersionItem>(`/api/v1/legal/documents/${documentType}${q}`);
  },

  /** Check unaccepted/updated documents requiring acceptance */
  getPendingAcceptances: (clubId?: string | null): Promise<PendingAcceptancesResponse> => {
    const q = clubId ? `?club_id=${clubId}` : '';
    return apiClient.get<PendingAcceptancesResponse>(`/api/v1/legal/pending-acceptances${q}`);
  },

  /** Record acceptance of a legal document version */
  acceptDocument: (payload: {
    document_type: string;
    version_id?: string;
    club_id?: string | null;
    source?: string;
  }): Promise<LegalAcceptanceItem> => {
    return apiClient.post<LegalAcceptanceItem>('/api/v1/legal/acceptances', payload);
  },

  /** Get user's acceptance history */
  getMyAcceptances: (): Promise<LegalAcceptanceItem[]> => {
    return apiClient.get<LegalAcceptanceItem[]>('/api/v1/legal/my-acceptances');
  },
};

// ─── Platform Admin Legal & Help Management API ──────────────────────────────

export const platformLegalApi = {
  // Categories
  listCategories: (): Promise<HelpCategoryItem[]> => {
    return apiClient.get<HelpCategoryItem[]>('/api/v1/platform/help/categories');
  },
  createCategory: (payload: {
    name: string;
    slug?: string;
    description?: string;
    target_audience?: string;
    display_order?: number;
    is_published?: boolean;
  }): Promise<HelpCategoryItem> => {
    return apiClient.post<HelpCategoryItem>('/api/v1/platform/help/categories', payload);
  },
  updateCategory: (
    categoryId: string,
    payload: Partial<HelpCategoryItem>
  ): Promise<HelpCategoryItem> => {
    return apiClient.patch<HelpCategoryItem>(`/api/v1/platform/help/categories/${categoryId}`, payload);
  },
  deleteCategory: (categoryId: string): Promise<{ message: string }> => {
    return apiClient.delete<{ message: string }>(`/api/v1/platform/help/categories/${categoryId}`);
  },

  // FAQs
  listFaqs: (): Promise<FAQsListResponse> => {
    return apiClient.get<FAQsListResponse>('/api/v1/platform/help/faqs');
  },
  createFaq: (payload: {
    category_id?: string | null;
    question: string;
    answer: string;
    target_audience?: string;
    is_published?: boolean;
    display_order?: number;
  }): Promise<FAQItem> => {
    return apiClient.post<FAQItem>('/api/v1/platform/help/faqs', payload);
  },
  updateFaq: (faqId: string, payload: Partial<FAQItem>): Promise<FAQItem> => {
    return apiClient.patch<FAQItem>(`/api/v1/platform/help/faqs/${faqId}`, payload);
  },
  deleteFaq: (faqId: string): Promise<{ message: string }> => {
    return apiClient.delete<{ message: string }>(`/api/v1/platform/help/faqs/${faqId}`);
  },

  // Articles
  listArticles: (): Promise<HelpArticlesListResponse> => {
    return apiClient.get<HelpArticlesListResponse>('/api/v1/platform/help/articles');
  },
  createArticle: (payload: {
    category_id?: string | null;
    title: string;
    slug?: string;
    content: string;
    target_audience?: string;
    is_published?: boolean;
    display_order?: number;
  }): Promise<HelpArticleItem> => {
    return apiClient.post<HelpArticleItem>('/api/v1/platform/help/articles', payload);
  },
  updateArticle: (articleId: string, payload: Partial<HelpArticleItem>): Promise<HelpArticleItem> => {
    return apiClient.patch<HelpArticleItem>(`/api/v1/platform/help/articles/${articleId}`, payload);
  },
  deleteArticle: (articleId: string): Promise<{ message: string }> => {
    return apiClient.delete<{ message: string }>(`/api/v1/platform/help/articles/${articleId}`);
  },

  // Legal Documents
  listDocuments: (): Promise<LegalDocumentItem[]> => {
    return apiClient.get<LegalDocumentItem[]>('/api/v1/platform/legal/documents');
  },
  getDocument: (documentId: string): Promise<LegalDocumentDetailResponse> => {
    return apiClient.get<LegalDocumentDetailResponse>(`/api/v1/platform/legal/documents/${documentId}`);
  },
  createVersion: (
    documentId: string,
    payload: {
      version: string;
      title: string;
      content: string;
      requires_renewed_acceptance?: boolean;
      change_summary?: string;
      effective_date?: string;
    }
  ): Promise<LegalDocumentVersionItem> => {
    return apiClient.post<LegalDocumentVersionItem>(
      `/api/v1/platform/legal/documents/${documentId}/versions`,
      payload
    );
  },
  updateVersion: (
    versionId: string,
    payload: {
      title?: string;
      content?: string;
      requires_renewed_acceptance?: boolean;
      change_summary?: string;
      effective_date?: string;
    }
  ): Promise<LegalDocumentVersionItem> => {
    return apiClient.patch<LegalDocumentVersionItem>(
      `/api/v1/platform/legal/versions/${versionId}`,
      payload
    );
  },
  publishVersion: (
    versionId: string,
    payload: {
      effective_date?: string;
      requires_renewed_acceptance?: boolean;
      change_summary?: string;
    }
  ): Promise<LegalDocumentVersionItem> => {
    return apiClient.post<LegalDocumentVersionItem>(
      `/api/v1/platform/legal/versions/${versionId}/publish`,
      payload
    );
  },
  listAcceptances: (params?: {
    documentId?: string;
    versionId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<LegalAcceptanceItem[]> => {
    const q = new URLSearchParams();
    if (params?.documentId) q.append('document_id', params.documentId);
    if (params?.versionId) q.append('version_id', params.versionId);
    if (params?.page) q.append('page', String(params.page));
    if (params?.pageSize) q.append('page_size', String(params.pageSize));
    return apiClient.get<LegalAcceptanceItem[]>(`/api/v1/platform/legal/acceptances?${q.toString()}`);
  },
};

