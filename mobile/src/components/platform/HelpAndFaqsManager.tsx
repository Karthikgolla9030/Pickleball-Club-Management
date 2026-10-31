/**
 * Aught2 Pickleball — Help & FAQs Management Screen Component
 *
 * Dedicated administrative interface for managing:
 * - FAQs (Create, Edit, Delete, Toggle Publish/Unpublish, Audience filter)
 * - Help Articles (Create, Edit, Delete, Preview modal, Markdown content)
 * - Help Categories (Audience classification, display ordering, topic management)
 *
 * Redesigned using the shared Platform Admin legal design system:
 * - Standard LegalPageHeader with compact typography and back navigation
 * - Standard LegalFilterToolbar with search, audience filter, and status filter
 * - Standard LegalRecordCard with clean hierarchy and compact action buttons
 * - Zero oversized buttons, zero horizontal overflow, mobile-first responsiveness
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit2,
  Eye,
  FileText,
  Folder,
  HelpCircle,
  Plus,
  Trash2,
  X,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import {
  FAQItem,
  HelpArticleItem,
  HelpCategoryItem,
  platformLegalApi,
} from '@/services/api';

import {
  LegalAudienceBadge,
  LegalEmptyState,
  LegalFilterToolbar,
  LegalPageHeader,
  LegalPreviewModal,
  LegalRecordCard,
  LegalStatusBadge,
} from './legal/LegalSharedComponents';

type HelpSubTab = 'faqs' | 'articles' | 'categories';
type AudienceFilter = 'all' | 'player' | 'club';
type StatusFilter = 'all' | 'published' | 'draft';

export function HelpAndFaqsManager() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isNarrow = width < 480;

  const [activeTab, setActiveTab] = useState<HelpSubTab>('faqs');
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Data states
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [categories, setCategories] = useState<HelpCategoryItem[]>([]);
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [articles, setArticles] = useState<HelpArticleItem[]>([]);

  // Accordion expanded FAQs
  const [expandedFaqIds, setExpandedFaqIds] = useState<Record<string, boolean>>({});

  // Modals
  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<Partial<FAQItem> | null>(null);

  const [articleModalOpen, setArticleModalOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Partial<HelpArticleItem> | null>(null);
  const [articleEditorTab, setArticleEditorTab] = useState<'write' | 'preview'>('write');

  const [previewArticle, setPreviewArticle] = useState<HelpArticleItem | null>(null);

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Partial<HelpCategoryItem> | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearAlerts = () => {
    setError(null);
    setSuccessMsg(null);
  };

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);
    clearAlerts();
    try {
      const [catsRes, faqsRes, articlesRes] = await Promise.all([
        platformLegalApi.listCategories().catch(() => []),
        platformLegalApi.listFaqs().catch(() => ({ items: [], total: 0 })),
        platformLegalApi.listArticles().catch(() => ({ items: [], total: 0 })),
      ]);
      setCategories(Array.isArray(catsRes) ? catsRes : []);
      setFaqs(Array.isArray(faqsRes?.items) ? faqsRes.items : []);
      setArticles(Array.isArray(articlesRes?.items) ? articlesRes.items : []);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load Help & FAQ content');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered FAQs
  const filteredFaqs = useMemo(() => {
    return faqs.filter((faq) => {
      const matchesAudience =
        audienceFilter === 'all' ||
        faq.target_audience === audienceFilter ||
        faq.target_audience === 'all';
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'published' && faq.is_published) ||
        (statusFilter === 'draft' && !faq.is_published);
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        faq.question.toLowerCase().includes(q) ||
        faq.answer.toLowerCase().includes(q) ||
        (faq.category_name && faq.category_name.toLowerCase().includes(q));
      return matchesAudience && matchesStatus && matchesSearch;
    });
  }, [faqs, audienceFilter, statusFilter, searchQuery]);

  // Filtered Articles
  const filteredArticles = useMemo(() => {
    return articles.filter((art) => {
      const matchesAudience =
        audienceFilter === 'all' ||
        art.target_audience === audienceFilter ||
        art.target_audience === 'all';
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'published' && art.is_published) ||
        (statusFilter === 'draft' && !art.is_published);
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        art.title.toLowerCase().includes(q) ||
        art.content.toLowerCase().includes(q) ||
        (art.category_name && art.category_name.toLowerCase().includes(q));
      return matchesAudience && matchesStatus && matchesSearch;
    });
  }, [articles, audienceFilter, statusFilter, searchQuery]);

  // Filtered Categories
  const filteredCategories = useMemo(() => {
    return categories.filter((cat) => {
      const matchesAudience =
        audienceFilter === 'all' ||
        cat.target_audience === audienceFilter ||
        cat.target_audience === 'all';
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        cat.name.toLowerCase().includes(q) ||
        (cat.description && cat.description.toLowerCase().includes(q));
      return matchesAudience && matchesSearch;
    });
  }, [categories, audienceFilter, searchQuery]);

  // Quick Toggle Published
  const toggleFaqPublish = async (faq: FAQItem) => {
    clearAlerts();
    try {
      const updated = await platformLegalApi.updateFaq(faq.id, {
        is_published: !faq.is_published,
      });
      setFaqs((prev) => prev.map((f) => (f.id === faq.id ? updated : f)));
      setSuccessMsg(
        `FAQ "${faq.question.slice(0, 30)}..." ${updated.is_published ? 'published' : 'hidden'}.`
      );
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to update FAQ status');
    }
  };

  const toggleArticlePublish = async (art: HelpArticleItem) => {
    clearAlerts();
    try {
      const updated = await platformLegalApi.updateArticle(art.id, {
        is_published: !art.is_published,
      });
      setArticles((prev) => prev.map((a) => (a.id === art.id ? updated : a)));
      setSuccessMsg(
        `Article "${art.title.slice(0, 30)}..." ${updated.is_published ? 'published' : 'hidden'}.`
      );
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to update article status');
    }
  };

  // Delete Handlers
  const handleDeleteFaq = async (id: string, question: string) => {
    const doDelete = async () => {
      clearAlerts();
      try {
        await platformLegalApi.deleteFaq(id);
        setFaqs((prev) => prev.filter((f) => f.id !== id));
        setSuccessMsg('FAQ deleted successfully.');
      } catch (err: any) {
        setError(err?.response?.data?.detail || err?.message || 'Failed to delete FAQ');
      }
    };

    if (Platform.OS === 'web') {
      if (confirm(`Are you sure you want to delete this FAQ?\n\n"${question}"`)) {
        await doDelete();
      }
    } else {
      Alert.alert('Delete FAQ', `Delete "${question}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleDeleteArticle = async (id: string, title: string) => {
    const doDelete = async () => {
      clearAlerts();
      try {
        await platformLegalApi.deleteArticle(id);
        setArticles((prev) => prev.filter((a) => a.id !== id));
        setSuccessMsg('Article deleted successfully.');
      } catch (err: any) {
        setError(err?.response?.data?.detail || err?.message || 'Failed to delete article');
      }
    };

    if (Platform.OS === 'web') {
      if (confirm(`Are you sure you want to delete this article?\n\n"${title}"`)) {
        await doDelete();
      }
    } else {
      Alert.alert('Delete Article', `Delete "${title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    const doDelete = async () => {
      clearAlerts();
      try {
        await platformLegalApi.deleteCategory(id);
        setCategories((prev) => prev.filter((c) => c.id !== id));
        setSuccessMsg('Category deleted successfully.');
      } catch (err: any) {
        setError(err?.response?.data?.detail || err?.message || 'Failed to delete category');
      }
    };

    if (Platform.OS === 'web') {
      if (confirm(`Are you sure you want to delete category "${name}"?`)) {
        await doDelete();
      }
    } else {
      Alert.alert('Delete Category', `Delete category "${name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  // Submit FAQ
  const handleSaveFaq = async () => {
    if (!editingFaq?.question?.trim()) {
      setError('Please provide a FAQ question.');
      return;
    }
    if (!editingFaq?.answer?.trim()) {
      setError('Please provide a FAQ answer.');
      return;
    }
    setIsSubmitting(true);
    clearAlerts();
    try {
      if (editingFaq.id) {
        const updated = await platformLegalApi.updateFaq(editingFaq.id, {
          category_id: editingFaq.category_id || null,
          question: editingFaq.question.trim(),
          answer: editingFaq.answer.trim(),
          target_audience: editingFaq.target_audience || 'all',
          is_published: editingFaq.is_published ?? true,
          display_order: editingFaq.display_order ?? 0,
        });
        setFaqs((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
        setSuccessMsg('FAQ updated successfully.');
      } else {
        const created = await platformLegalApi.createFaq({
          category_id: editingFaq.category_id || null,
          question: editingFaq.question.trim(),
          answer: editingFaq.answer.trim(),
          target_audience: editingFaq.target_audience || 'all',
          is_published: editingFaq.is_published ?? true,
          display_order: editingFaq.display_order ?? 0,
        });
        setFaqs((prev) => [created, ...prev]);
        setSuccessMsg('FAQ created successfully.');
      }
      setFaqModalOpen(false);
      setEditingFaq(null);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to save FAQ');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Article
  const handleSaveArticle = async () => {
    if (!editingArticle?.title?.trim()) {
      setError('Please provide an article title.');
      return;
    }
    if (!editingArticle?.content?.trim()) {
      setError('Please provide article content.');
      return;
    }
    setIsSubmitting(true);
    clearAlerts();
    try {
      if (editingArticle.id) {
        const updated = await platformLegalApi.updateArticle(editingArticle.id, {
          category_id: editingArticle.category_id || null,
          title: editingArticle.title.trim(),
          slug: editingArticle.slug?.trim(),
          content: editingArticle.content.trim(),
          target_audience: editingArticle.target_audience || 'all',
          is_published: editingArticle.is_published ?? true,
          display_order: editingArticle.display_order ?? 0,
        });
        setArticles((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        setSuccessMsg('Article updated successfully.');
      } else {
        const created = await platformLegalApi.createArticle({
          category_id: editingArticle.category_id || null,
          title: editingArticle.title.trim(),
          slug: editingArticle.slug?.trim(),
          content: editingArticle.content.trim(),
          target_audience: editingArticle.target_audience || 'all',
          is_published: editingArticle.is_published ?? true,
          display_order: editingArticle.display_order ?? 0,
        });
        setArticles((prev) => [created, ...prev]);
        setSuccessMsg('Article created successfully.');
      }
      setArticleModalOpen(false);
      setEditingArticle(null);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to save article');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Category
  const handleSaveCategory = async () => {
    if (!editingCategory?.name?.trim()) {
      setError('Please provide a category name.');
      return;
    }
    setIsSubmitting(true);
    clearAlerts();
    try {
      if (editingCategory.id) {
        const updated = await platformLegalApi.updateCategory(editingCategory.id, {
          name: editingCategory.name.trim(),
          slug: editingCategory.slug?.trim(),
          description: editingCategory.description?.trim(),
          target_audience: editingCategory.target_audience || 'all',
          display_order: editingCategory.display_order ?? 0,
          is_published: editingCategory.is_published ?? true,
        });
        setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        setSuccessMsg('Category updated successfully.');
      } else {
        const created = await platformLegalApi.createCategory({
          name: editingCategory.name.trim(),
          slug: editingCategory.slug?.trim(),
          description: editingCategory.description?.trim(),
          target_audience: editingCategory.target_audience || 'all',
          display_order: editingCategory.display_order ?? 0,
          is_published: editingCategory.is_published ?? true,
        });
        setCategories((prev) => [...prev, created]);
        setSuccessMsg('Category created successfully.');
      }
      setCategoryModalOpen(false);
      setEditingCategory(null);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to save category');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentTabActionLabel =
    activeTab === 'faqs' ? 'Add FAQ' : activeTab === 'articles' ? 'Add Article' : 'Add Category';

  const handleOpenCreateModal = () => {
    clearAlerts();
    if (activeTab === 'faqs') {
      setEditingFaq({
        question: '',
        answer: '',
        target_audience: 'all',
        is_published: true,
        display_order: faqs.length,
      });
      setFaqModalOpen(true);
    } else if (activeTab === 'articles') {
      setEditingArticle({
        title: '',
        slug: '',
        content: '',
        target_audience: 'all',
        is_published: true,
        display_order: articles.length,
      });
      setArticleEditorTab('write');
      setArticleModalOpen(true);
    } else {
      setEditingCategory({
        name: '',
        slug: '',
        description: '',
        target_audience: 'all',
        is_published: true,
        display_order: categories.length,
      });
      setCategoryModalOpen(true);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* ─── Standard Shared Page Header ───────────────────────────────── */}
      <LegalPageHeader
        title="Help & FAQs"
        subtitle="Manage frequently asked questions and support articles across player and club portals."
        icon={HelpCircle}
        onBack={() => router.push('/platform/settings' as any)}
        primaryAction={{
          label: currentTabActionLabel,
          icon: Plus,
          onPress: handleOpenCreateModal,
        }}
      />

      {/* ─── Status Alerts ─────────────────────────────────────────────── */}
      {error && (
        <View style={styles.alertError}>
          <AlertCircle size={15} color="#DC2626" />
          <AppText style={styles.alertErrorText}>{error}</AppText>
          <TouchableOpacity onPress={clearAlerts} style={styles.alertDismissBtn}>
            <X size={14} color="#DC2626" />
          </TouchableOpacity>
        </View>
      )}

      {successMsg && (
        <View style={styles.alertSuccess}>
          <CheckCircle2 size={15} color="#15803D" />
          <AppText style={styles.alertSuccessText}>{successMsg}</AppText>
          <TouchableOpacity onPress={clearAlerts} style={styles.alertDismissBtn}>
            <X size={14} color="#15803D" />
          </TouchableOpacity>
        </View>
      )}

      {/* ─── Compact Internal Tabs ──────────────────────────────────────── */}
      <View style={styles.tabsRow}>
        <View style={styles.tabSegmentBar}>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'faqs' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('faqs')}
            activeOpacity={0.8}
          >
            <HelpCircle size={14} color={activeTab === 'faqs' ? '#0F172A' : '#64748B'} />
            <AppText
              style={[styles.segmentBtnText, activeTab === 'faqs' && styles.segmentBtnTextActive]}
            >
              FAQs ({faqs.length})
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'articles' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('articles')}
            activeOpacity={0.8}
          >
            <FileText size={14} color={activeTab === 'articles' ? '#0F172A' : '#64748B'} />
            <AppText
              style={[
                styles.segmentBtnText,
                activeTab === 'articles' && styles.segmentBtnTextActive,
              ]}
            >
              Articles ({articles.length})
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'categories' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('categories')}
            activeOpacity={0.8}
          >
            <Folder size={14} color={activeTab === 'categories' ? '#0F172A' : '#64748B'} />
            <AppText
              style={[
                styles.segmentBtnText,
                activeTab === 'categories' && styles.segmentBtnTextActive,
              ]}
            >
              Categories ({categories.length})
            </AppText>
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── Standardized Content Toolbar ───────────────────────────────── */}
      <LegalFilterToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={`Search ${activeTab}...`}
        audienceFilter={audienceFilter}
        onAudienceChange={setAudienceFilter}
        statusFilter={activeTab !== 'categories' ? statusFilter : undefined}
        onStatusChange={activeTab !== 'categories' ? setStatusFilter : undefined}
        onRefresh={() => loadData(true)}
        isRefreshing={isRefreshing}
      />

      {/* ─── Main Content Area ──────────────────────────────────────────── */}
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#15803D" />
          <AppText style={styles.loadingText}>Loading Help & FAQ records...</AppText>
        </View>
      ) : activeTab === 'faqs' ? (
        /* ──── FAQs List ──── */
        <View style={styles.cardsList}>
          {filteredFaqs.length === 0 ? (
            <LegalEmptyState
              icon={HelpCircle}
              title="No FAQs found"
              description={
                searchQuery || audienceFilter !== 'all' || statusFilter !== 'all'
                  ? 'No questions match your current search or filters.'
                  : 'Start building your knowledge base by adding your first FAQ.'
              }
              actionLabel="Add FAQ"
              onAction={handleOpenCreateModal}
            />
          ) : (
            filteredFaqs.map((faq) => {
              const isExpanded = Boolean(expandedFaqIds[faq.id]);
              return (
                <LegalRecordCard
                  key={faq.id}
                  title={faq.question}
                  status={faq.is_published ? 'published' : 'draft'}
                  categoryName={faq.category_name}
                  audience={faq.target_audience}
                  excerpt={faq.answer}
                  metaInfo={`Order: ${faq.display_order ?? 0}`}
                  isExpanded={isExpanded}
                  onPressTitle={() =>
                    setExpandedFaqIds((p) => ({ ...p, [faq.id]: !p[faq.id] }))
                  }
                  actions={[
                    {
                      label: faq.is_published ? 'Unpublish' : 'Publish',
                      icon: Eye,
                      onPress: () => toggleFaqPublish(faq),
                      variant: faq.is_published ? 'primary' : 'default',
                    },
                    {
                      label: 'Edit',
                      icon: Edit2,
                      onPress: () => {
                        setEditingFaq({ ...faq });
                        setFaqModalOpen(true);
                      },
                    },
                    {
                      label: 'Delete',
                      icon: Trash2,
                      onPress: () => handleDeleteFaq(faq.id, faq.question),
                      variant: 'danger',
                    },
                  ]}
                />
              );
            })
          )}
        </View>
      ) : activeTab === 'articles' ? (
        /* ──── Articles List ──── */
        <View style={styles.cardsList}>
          {filteredArticles.length === 0 ? (
            <LegalEmptyState
              icon={FileText}
              title="No Help Articles found"
              description={
                searchQuery || audienceFilter !== 'all' || statusFilter !== 'all'
                  ? 'No articles match your search or filter criteria.'
                  : 'Write comprehensive support guides and documentation articles for users.'
              }
              actionLabel="Add Article"
              onAction={handleOpenCreateModal}
            />
          ) : (
            filteredArticles.map((art) => (
              <LegalRecordCard
                key={art.id}
                title={art.title}
                status={art.is_published ? 'published' : 'draft'}
                categoryName={art.category_name}
                audience={art.target_audience}
                excerpt={art.content.replace(/[#*`_]/g, '')}
                metaInfo={art.slug ? `/help/articles/${art.slug}` : undefined}
                actions={[
                  {
                    label: 'Preview',
                    icon: Eye,
                    onPress: () => setPreviewArticle(art),
                    variant: 'primary',
                  },
                  {
                    label: 'Edit',
                    icon: Edit2,
                    onPress: () => {
                      setEditingArticle({ ...art });
                      setArticleEditorTab('write');
                      setArticleModalOpen(true);
                    },
                  },
                  {
                    label: 'Delete',
                    icon: Trash2,
                    onPress: () => handleDeleteArticle(art.id, art.title),
                    variant: 'danger',
                  },
                ]}
              />
            ))
          )}
        </View>
      ) : (
        /* ──── Categories List ──── */
        <View style={styles.cardsList}>
          {filteredCategories.length === 0 ? (
            <LegalEmptyState
              icon={Folder}
              title="No Categories found"
              description="Create categories to organize FAQs and articles into logical support topics."
              actionLabel="Add Category"
              onAction={handleOpenCreateModal}
            />
          ) : (
            filteredCategories.map((cat) => {
              const faqsCount = faqs.filter((f) => f.category_id === cat.id).length;
              const articlesCount = articles.filter((a) => a.category_id === cat.id).length;
              return (
                <LegalRecordCard
                  key={cat.id}
                  title={cat.name}
                  audience={cat.target_audience}
                  excerpt={cat.description || undefined}
                  metaInfo={`${faqsCount} FAQs • ${articlesCount} Articles • Order: ${cat.display_order ?? 0}`}
                  actions={[
                    {
                      label: 'Edit',
                      icon: Edit2,
                      onPress: () => {
                        setEditingCategory({ ...cat });
                        setCategoryModalOpen(true);
                      },
                    },
                    {
                      label: 'Delete',
                      icon: Trash2,
                      onPress: () => handleDeleteCategory(cat.id, cat.name),
                      variant: 'danger',
                    },
                  ]}
                />
              );
            })
          )}
        </View>
      )}

      {/* ─── MODAL: ADD / EDIT FAQ ────────────────────────────────────────── */}
      <Modal visible={faqModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleCol}>
                <AppText style={styles.modalTitle}>
                  {editingFaq?.id ? 'Edit FAQ' : 'Add New FAQ'}
                </AppText>
                <AppText style={styles.modalSubtitle}>
                  Configure question, answer, topic category, and target audience.
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setFaqModalOpen(false);
                  setEditingFaq(null);
                }}
                style={styles.modalCloseBtn}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollBody} showsVerticalScrollIndicator={false}>
              <View style={styles.formField}>
                <AppText style={styles.fieldLabel}>Question *</AppText>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. How do I reserve an indoor court?"
                  placeholderTextColor="#94A3B8"
                  value={editingFaq?.question ?? ''}
                  onChangeText={(t) => setEditingFaq((prev) => ({ ...prev, question: t }))}
                />
              </View>

              <View style={styles.formField}>
                <AppText style={styles.fieldLabel}>Category</AppText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                  <TouchableOpacity
                    style={[
                      styles.choiceChip,
                      !editingFaq?.category_id && styles.choiceChipActive,
                    ]}
                    onPress={() => setEditingFaq((prev) => ({ ...prev, category_id: null }))}
                  >
                    <AppText
                      style={[
                        styles.choiceChipText,
                        !editingFaq?.category_id && styles.choiceChipTextActive,
                      ]}
                    >
                      None
                    </AppText>
                  </TouchableOpacity>
                  {categories.map((c) => {
                    const sel = editingFaq?.category_id === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.choiceChip, sel && styles.choiceChipActive]}
                        onPress={() => setEditingFaq((prev) => ({ ...prev, category_id: c.id }))}
                      >
                        <AppText
                          style={[styles.choiceChipText, sel && styles.choiceChipTextActive]}
                        >
                          {c.name}
                        </AppText>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.formField}>
                <AppText style={styles.fieldLabel}>Target Audience</AppText>
                <View style={styles.rowChoices}>
                  {[
                    { key: 'all', label: 'All Users' },
                    { key: 'player', label: 'Players Only' },
                    { key: 'club', label: 'Clubs Only' },
                  ].map((aud) => {
                    const sel = (editingFaq?.target_audience ?? 'all') === aud.key;
                    return (
                      <TouchableOpacity
                        key={aud.key}
                        style={[styles.choiceChip, sel && styles.choiceChipActive]}
                        onPress={() =>
                          setEditingFaq((prev) => ({ ...prev, target_audience: aud.key }))
                        }
                      >
                        <AppText
                          style={[styles.choiceChipText, sel && styles.choiceChipTextActive]}
                        >
                          {aud.label}
                        </AppText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.formField}>
                <AppText style={styles.fieldLabel}>Answer *</AppText>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Provide a clear, detailed answer..."
                  placeholderTextColor="#94A3B8"
                  value={editingFaq?.answer ?? ''}
                  onChangeText={(t) => setEditingFaq((prev) => ({ ...prev, answer: t }))}
                  multiline
                  numberOfLines={4}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchTextCol}>
                  <AppText style={styles.switchTitle}>Published Immediately</AppText>
                  <AppText style={styles.switchDesc}>
                    When active, this FAQ is visible on the client portals.
                  </AppText>
                </View>
                <Switch
                  value={editingFaq?.is_published ?? true}
                  onValueChange={(v) => setEditingFaq((prev) => ({ ...prev, is_published: v }))}
                  trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                  thumbColor={editingFaq?.is_published ? '#15803D' : '#F1F5F9'}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setFaqModalOpen(false);
                  setEditingFaq(null);
                }}
              >
                <AppText style={styles.modalCancelText}>Cancel</AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleSaveFaq}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <AppText style={styles.modalSubmitText}>Save FAQ</AppText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL: ADD / EDIT ARTICLE ────────────────────────────────────── */}
      <Modal visible={articleModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.modalCardLarge]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleCol}>
                <AppText style={styles.modalTitle}>
                  {editingArticle?.id ? 'Edit Help Article' : 'Add Help Article'}
                </AppText>
                <AppText style={styles.modalSubtitle}>
                  Author rich support guides with markdown formatting.
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setArticleModalOpen(false);
                  setEditingArticle(null);
                }}
                style={styles.modalCloseBtn}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollBody} showsVerticalScrollIndicator={false}>
              <View style={styles.formField}>
                <AppText style={styles.fieldLabel}>Article Title *</AppText>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Setting Up Custom Staff Permissions"
                  placeholderTextColor="#94A3B8"
                  value={editingArticle?.title ?? ''}
                  onChangeText={(t) =>
                    setEditingArticle((prev) => ({
                      ...prev,
                      title: t,
                      slug: prev?.slug ? prev.slug : t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
                    }))
                  }
                />
              </View>

              <View style={styles.formField}>
                <AppText style={styles.fieldLabel}>Slug (URL identifier)</AppText>
                <TextInput
                  style={styles.textInput}
                  placeholder="custom-staff-permissions"
                  placeholderTextColor="#94A3B8"
                  value={editingArticle?.slug ?? ''}
                  onChangeText={(t) => setEditingArticle((prev) => ({ ...prev, slug: t }))}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formField}>
                <AppText style={styles.fieldLabel}>Category</AppText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                  {categories.map((c) => {
                    const sel = editingArticle?.category_id === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.choiceChip, sel && styles.choiceChipActive]}
                        onPress={() => setEditingArticle((prev) => ({ ...prev, category_id: c.id }))}
                      >
                        <AppText
                          style={[styles.choiceChipText, sel && styles.choiceChipTextActive]}
                        >
                          {c.name}
                        </AppText>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Editor Tabs: Write / Preview */}
              <View style={styles.editorTabsRow}>
                <View style={styles.editorTabButtons}>
                  <TouchableOpacity
                    style={[styles.editorTabBtn, articleEditorTab === 'write' && styles.editorTabBtnActive]}
                    onPress={() => setArticleEditorTab('write')}
                  >
                    <AppText
                      style={[
                        styles.editorTabText,
                        articleEditorTab === 'write' && styles.editorTabTextActive,
                      ]}
                    >
                      Write Content
                    </AppText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.editorTabBtn, articleEditorTab === 'preview' && styles.editorTabBtnActive]}
                    onPress={() => setArticleEditorTab('preview')}
                  >
                    <AppText
                      style={[
                        styles.editorTabText,
                        articleEditorTab === 'preview' && styles.editorTabTextActive,
                      ]}
                    >
                      Formatted Preview
                    </AppText>
                  </TouchableOpacity>
                </View>
              </View>

              {articleEditorTab === 'write' ? (
                <View style={styles.formField}>
                  <TextInput
                    style={[styles.textInput, styles.textAreaLarge]}
                    placeholder="Write article guide in markdown...&#10;&#10;## Section Heading&#10;Key instructions..."
                    placeholderTextColor="#94A3B8"
                    value={editingArticle?.content ?? ''}
                    onChangeText={(t) => setEditingArticle((prev) => ({ ...prev, content: t }))}
                    multiline
                  />
                </View>
              ) : (
                <View style={styles.articlePreviewBox}>
                  <AppText style={styles.previewTitle}>
                    {editingArticle?.title || 'Untitled Article'}
                  </AppText>
                  <AppText style={styles.previewContent}>
                    {editingArticle?.content || 'No content written yet.'}
                  </AppText>
                </View>
              )}

              <View style={styles.switchRow}>
                <View style={styles.switchTextCol}>
                  <AppText style={styles.switchTitle}>Published Article</AppText>
                  <AppText style={styles.switchDesc}>
                    Make visible across the respective Help & Support knowledge center.
                  </AppText>
                </View>
                <Switch
                  value={editingArticle?.is_published ?? true}
                  onValueChange={(v) => setEditingArticle((prev) => ({ ...prev, is_published: v }))}
                  trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                  thumbColor={editingArticle?.is_published ? '#15803D' : '#F1F5F9'}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setArticleModalOpen(false);
                  setEditingArticle(null);
                }}
              >
                <AppText style={styles.modalCancelText}>Cancel</AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleSaveArticle}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <AppText style={styles.modalSubmitText}>Save Article</AppText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL: ARTICLE PREVIEW VIEWER (Using Shared Preview Modal) ──── */}
      <LegalPreviewModal
        visible={Boolean(previewArticle)}
        title={previewArticle?.title}
        subtitle={
          previewArticle?.category_name
            ? `${previewArticle.category_name} • Audience: ${previewArticle.target_audience}`
            : `Audience: ${previewArticle?.target_audience ?? 'all'}`
        }
        content={previewArticle?.content}
        onClose={() => setPreviewArticle(null)}
      />

      {/* ─── MODAL: ADD / EDIT CATEGORY ───────────────────────────────────── */}
      <Modal visible={categoryModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleCol}>
                <AppText style={styles.modalTitle}>
                  {editingCategory?.id ? 'Edit Category' : 'Add Category'}
                </AppText>
                <AppText style={styles.modalSubtitle}>
                  Organize articles and questions by support topics.
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setCategoryModalOpen(false);
                  setEditingCategory(null);
                }}
                style={styles.modalCloseBtn}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollBody} showsVerticalScrollIndicator={false}>
              <View style={styles.formField}>
                <AppText style={styles.fieldLabel}>Category Name *</AppText>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Tournaments & Scoring"
                  placeholderTextColor="#94A3B8"
                  value={editingCategory?.name ?? ''}
                  onChangeText={(t) =>
                    setEditingCategory((prev) => ({
                      ...prev,
                      name: t,
                      slug: prev?.slug ? prev.slug : t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
                    }))
                  }
                />
              </View>

              <View style={styles.formField}>
                <AppText style={styles.fieldLabel}>Description</AppText>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Brief description of this support topic..."
                  placeholderTextColor="#94A3B8"
                  value={editingCategory?.description ?? ''}
                  onChangeText={(t) => setEditingCategory((prev) => ({ ...prev, description: t }))}
                  multiline
                  numberOfLines={2}
                />
              </View>

              <View style={styles.formField}>
                <AppText style={styles.fieldLabel}>Target Audience</AppText>
                <View style={styles.rowChoices}>
                  {[
                    { key: 'all', label: 'All Users' },
                    { key: 'player', label: 'Players' },
                    { key: 'club', label: 'Clubs' },
                  ].map((aud) => {
                    const sel = (editingCategory?.target_audience ?? 'all') === aud.key;
                    return (
                      <TouchableOpacity
                        key={aud.key}
                        style={[styles.choiceChip, sel && styles.choiceChipActive]}
                        onPress={() =>
                          setEditingCategory((prev) => ({ ...prev, target_audience: aud.key }))
                        }
                      >
                        <AppText
                          style={[styles.choiceChipText, sel && styles.choiceChipTextActive]}
                        >
                          {aud.label}
                        </AppText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setCategoryModalOpen(false);
                  setEditingCategory(null);
                }}
              >
                <AppText style={styles.modalCancelText}>Cancel</AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleSaveCategory}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <AppText style={styles.modalSubmitText}>Save Category</AppText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  contentContainer: {
    paddingHorizontal: 0,
    paddingTop: 4,
    paddingBottom: 80,
    maxWidth: 780,
    width: '100%',
    alignSelf: 'center',
  },

  // ─── Alerts ───────────────────────────────────────────────────────────────
  alertError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    marginBottom: 10,
  },
  alertErrorText: {
    flex: 1,
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
  },
  alertSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    marginBottom: 10,
  },
  alertSuccessText: {
    flex: 1,
    fontSize: 12,
    color: '#15803D',
    fontWeight: '600',
  },
  alertDismissBtn: {
    padding: 2,
  },

  // ─── Tabs Row ─────────────────────────────────────────────────────────────
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  tabSegmentBar: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 3,
    borderRadius: 8,
    gap: 3,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
    borderRadius: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      web: { boxShadow: '0 1px 2px rgba(0,0,0,0.05)' },
      default: { elevation: 1 },
    }),
  },
  segmentBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  segmentBtnTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },

  // ─── Cards List ───────────────────────────────────────────────────────────
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12.5,
    color: '#64748B',
  },
  cardsList: {
    gap: 10,
  },

  // ─── Modals ───────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 540,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    maxHeight: '88%',
    ...Platform.select({
      web: { boxShadow: '0 10px 25px rgba(0,0,0,0.1)' },
    }),
  },
  modalCardLarge: {
    maxWidth: 720,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitleCol: {
    flex: 1,
    paddingRight: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalScrollBody: {
    padding: 16,
  },
  formField: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 5,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 38,
    fontSize: 13,
    color: '#0F172A',
  },
  textArea: {
    height: 80,
    paddingTop: 8,
    textAlignVertical: 'top',
  },
  textAreaLarge: {
    height: 180,
    paddingTop: 8,
    textAlignVertical: 'top',
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
    fontSize: 12,
  },
  chipsScroll: {
    flexDirection: 'row',
  },
  rowChoices: {
    flexDirection: 'row',
    gap: 6,
  },
  choiceChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    marginRight: 6,
  },
  choiceChipActive: {
    backgroundColor: '#0F172A',
  },
  choiceChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  choiceChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginBottom: 6,
  },
  switchTextCol: {
    flex: 1,
    paddingRight: 12,
  },
  switchTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  switchDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  editorTabsRow: {
    marginBottom: 8,
  },
  editorTabButtons: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    padding: 2,
    borderRadius: 7,
    gap: 2,
    alignSelf: 'flex-start',
  },
  editorTabBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  editorTabBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  editorTabText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  editorTabTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  articlePreviewBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 12,
    minHeight: 120,
    marginBottom: 10,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  previewContent: {
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 18,
  },
  modalActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  modalCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  modalCancelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  modalSubmitBtn: {
    backgroundColor: '#15803D',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 7,
    minWidth: 80,
    alignItems: 'center',
  },
  modalSubmitText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
