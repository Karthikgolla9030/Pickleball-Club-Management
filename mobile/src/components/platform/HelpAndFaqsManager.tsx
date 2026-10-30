/**
 * Aught2 Pickleball — Help & FAQs Management Screen Component
 *
 * Dedicated administrative interface for managing:
 * - FAQs (Create, Edit, Delete, Publish/Unpublish toggle, Audience filter)
 * - Help Articles (Create, Edit, Delete, Preview modal, Markdown content)
 * - Help Categories (Audience classification, display ordering, topic management)
 *
 * Clean, compact, professional Platform Admin design without oversized buttons or clutter.
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
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit2,
  Eye,
  FileText,
  Filter,
  Folder,
  HelpCircle,
  Plus,
  RefreshCw,
  Search,
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
import { Colors, Radius, Spacing, Typography } from '@/theme';

type HelpSubTab = 'faqs' | 'articles' | 'categories';
type AudienceFilter = 'all' | 'player' | 'club';

export function HelpAndFaqsManager() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [activeTab, setActiveTab] = useState<HelpSubTab>('faqs');
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Data states
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [categories, setCategories] = useState<HelpCategoryItem[]>([]);
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [articles, setArticles] = useState<HelpArticleItem[]>([]);

  // Expanded FAQ IDs for accordion reading
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
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        faq.question.toLowerCase().includes(q) ||
        faq.answer.toLowerCase().includes(q) ||
        (faq.category_name && faq.category_name.toLowerCase().includes(q));
      return matchesAudience && matchesSearch;
    });
  }, [faqs, audienceFilter, searchQuery]);

  // Filtered Articles
  const filteredArticles = useMemo(() => {
    return articles.filter((art) => {
      const matchesAudience =
        audienceFilter === 'all' ||
        art.target_audience === audienceFilter ||
        art.target_audience === 'all';
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        art.title.toLowerCase().includes(q) ||
        art.content.toLowerCase().includes(q) ||
        (art.category_name && art.category_name.toLowerCase().includes(q));
      return matchesAudience && matchesSearch;
    });
  }, [articles, audienceFilter, searchQuery]);

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
      setSuccessMsg(`FAQ "${faq.question.slice(0, 30)}..." ${updated.is_published ? 'published' : 'hidden'}.`);
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
      setSuccessMsg(`Article "${art.title.slice(0, 30)}..." ${updated.is_published ? 'published' : 'hidden'}.`);
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* ─── Top Navigation & Standard Page Header ──────────────────────── */}
      <View style={styles.headerBlock}>
        <TouchableOpacity
          style={styles.backLinkRow}
          onPress={() => router.push('/platform/settings' as any)}
          activeOpacity={0.7}
        >
          <ArrowLeft size={16} color="#0F172A" strokeWidth={2.4} />
          <AppText style={styles.backLinkText}>Back to Settings</AppText>
        </TouchableOpacity>

        <View style={styles.headingRow}>
          <View style={styles.headingTextCol}>
            <AppText style={styles.screenTitle}>Help & FAQs Management</AppText>
            <AppText style={styles.screenSubtitle}>
              Create and manage customer help articles, FAQs, and support topics across player and club portals.
            </AppText>
          </View>

          {/* Primary Action Button */}
          <TouchableOpacity
            style={styles.primaryActionBtn}
            onPress={() => {
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
            }}
            activeOpacity={0.8}
          >
            <Plus size={16} color="#FFFFFF" strokeWidth={2.5} />
            <AppText style={styles.primaryActionBtnText}>
              {activeTab === 'faqs' ? 'Add FAQ' : activeTab === 'articles' ? 'Add Article' : 'Add Category'}
            </AppText>
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── Alerts ──────────────────────────────────────────────────────── */}
      {error && (
        <View style={styles.alertError}>
          <AlertCircle size={16} color="#DC2626" />
          <AppText style={styles.alertErrorText}>{error}</AppText>
          <TouchableOpacity onPress={clearAlerts}>
            <X size={14} color="#DC2626" />
          </TouchableOpacity>
        </View>
      )}

      {successMsg && (
        <View style={styles.alertSuccess}>
          <CheckCircle2 size={16} color="#15803D" />
          <AppText style={styles.alertSuccessText}>{successMsg}</AppText>
          <TouchableOpacity onPress={clearAlerts}>
            <X size={14} color="#15803D" />
          </TouchableOpacity>
        </View>
      )}

      {/* ─── Compact Internal Sub-Tabs ───────────────────────────────────── */}
      <View style={styles.subTabsContainer}>
        <View style={styles.subTabsSegment}>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'faqs' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('faqs')}
            activeOpacity={0.8}
          >
            <HelpCircle size={15} color={activeTab === 'faqs' ? '#0F172A' : '#64748B'} />
            <AppText style={[styles.segmentBtnText, activeTab === 'faqs' && styles.segmentBtnTextActive]}>
              FAQs ({faqs.length})
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'articles' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('articles')}
            activeOpacity={0.8}
          >
            <FileText size={15} color={activeTab === 'articles' ? '#0F172A' : '#64748B'} />
            <AppText style={[styles.segmentBtnText, activeTab === 'articles' && styles.segmentBtnTextActive]}>
              Articles ({articles.length})
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'categories' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('categories')}
            activeOpacity={0.8}
          >
            <Folder size={15} color={activeTab === 'categories' ? '#0F172A' : '#64748B'} />
            <AppText style={[styles.segmentBtnText, activeTab === 'categories' && styles.segmentBtnTextActive]}>
              Categories ({categories.length})
            </AppText>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => loadData(true)}
          disabled={isRefreshing}
          activeOpacity={0.7}
        >
          <RefreshCw size={14} color="#475569" />
          {!isMobile && <AppText style={styles.refreshBtnText}>Refresh</AppText>}
        </TouchableOpacity>
      </View>

      {/* ─── Filter & Search Bar ─────────────────────────────────────────── */}
      <View style={styles.filterBar}>
        <View style={styles.searchWrapper}>
          <Search size={15} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder={`Search ${activeTab}...`}
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={14} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.audienceChipsGroup}>
          {(['all', 'player', 'club'] as AudienceFilter[]).map((aud) => {
            const isSel = audienceFilter === aud;
            return (
              <TouchableOpacity
                key={aud}
                style={[styles.audienceChip, isSel && styles.audienceChipActive]}
                onPress={() => setAudienceFilter(aud)}
                activeOpacity={0.7}
              >
                <AppText style={[styles.audienceChipText, isSel && styles.audienceChipTextActive]}>
                  {aud === 'all' ? 'All' : aud === 'player' ? 'Players' : 'Clubs'}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ─── Main Content Views ──────────────────────────────────────────── */}
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#15803D" />
          <AppText style={styles.loadingText}>Loading Help & FAQ records...</AppText>
        </View>
      ) : activeTab === 'faqs' ? (
        /* ──── FAQs List ──── */
        <View style={styles.listSection}>
          {filteredFaqs.length === 0 ? (
            <View style={styles.emptyCard}>
              <HelpCircle size={32} color="#94A3B8" />
              <AppText style={styles.emptyTitle}>No FAQs found</AppText>
              <AppText style={styles.emptyDesc}>
                {searchQuery || audienceFilter !== 'all'
                  ? 'No questions match your current filters.'
                  : 'Start building your knowledge base by creating your first FAQ.'}
              </AppText>
              <TouchableOpacity
                style={styles.emptyActionBtn}
                onPress={() => {
                  setEditingFaq({
                    question: '',
                    answer: '',
                    target_audience: 'all',
                    is_published: true,
                    display_order: faqs.length,
                  });
                  setFaqModalOpen(true);
                }}
              >
                <Plus size={14} color="#15803D" />
                <AppText style={styles.emptyActionText}>Add New FAQ</AppText>
              </TouchableOpacity>
            </View>
          ) : (
            filteredFaqs.map((faq) => {
              const isExpanded = Boolean(expandedFaqIds[faq.id]);
              return (
                <View key={faq.id} style={styles.recordCard}>
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.badgeRow}>
                      <View
                        style={[
                          styles.statusBadge,
                          faq.is_published ? styles.statusBadgeGreen : styles.statusBadgeAmber,
                        ]}
                      >
                        <AppText
                          style={[
                            styles.statusBadgeText,
                            faq.is_published ? styles.statusBadgeTextGreen : styles.statusBadgeTextAmber,
                          ]}
                        >
                          {faq.is_published ? 'Published' : 'Hidden'}
                        </AppText>
                      </View>

                      {faq.category_name && (
                        <View style={styles.categoryChip}>
                          <AppText style={styles.categoryChipText}>{faq.category_name}</AppText>
                        </View>
                      )}

                      <View style={styles.audienceTag}>
                        <AppText style={styles.audienceTagText}>
                          {faq.target_audience === 'player'
                            ? 'Player Only'
                            : faq.target_audience === 'club'
                            ? 'Club Only'
                            : 'All Audiences'}
                        </AppText>
                      </View>
                    </View>

                    {/* Card Actions */}
                    <View style={styles.cardActionsRow}>
                      <TouchableOpacity
                        style={styles.iconActionBtn}
                        onPress={() => toggleFaqPublish(faq)}
                        accessibilityLabel={faq.is_published ? 'Unpublish' : 'Publish'}
                      >
                        <Eye size={15} color={faq.is_published ? '#15803D' : '#94A3B8'} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.iconActionBtn}
                        onPress={() => {
                          setEditingFaq({ ...faq });
                          setFaqModalOpen(true);
                        }}
                      >
                        <Edit2 size={15} color="#0F172A" />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.iconActionBtn}
                        onPress={() => handleDeleteFaq(faq.id, faq.question)}
                      >
                        <Trash2 size={15} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.faqQuestionRow}
                    onPress={() =>
                      setExpandedFaqIds((prev) => ({ ...prev, [faq.id]: !prev[faq.id] }))
                    }
                    activeOpacity={0.7}
                  >
                    <AppText style={styles.faqQuestionText}>{faq.question}</AppText>
                    {isExpanded ? (
                      <ChevronUp size={16} color="#64748B" />
                    ) : (
                      <ChevronDown size={16} color="#64748B" />
                    )}
                  </TouchableOpacity>

                  {isExpanded ? (
                    <View style={styles.faqAnswerExpanded}>
                      <AppText style={styles.faqAnswerText}>{faq.answer}</AppText>
                    </View>
                  ) : (
                    <AppText style={styles.faqAnswerExcerpt} numberOfLines={2}>
                      {faq.answer}
                    </AppText>
                  )}
                </View>
              );
            })
          )}
        </View>
      ) : activeTab === 'articles' ? (
        /* ──── Articles List ──── */
        <View style={styles.listSection}>
          {filteredArticles.length === 0 ? (
            <View style={styles.emptyCard}>
              <FileText size={32} color="#94A3B8" />
              <AppText style={styles.emptyTitle}>No Help Articles</AppText>
              <AppText style={styles.emptyDesc}>
                {searchQuery || audienceFilter !== 'all'
                  ? 'No articles match your search or filter criteria.'
                  : 'Write comprehensive support guides and documentation articles for users.'}
              </AppText>
              <TouchableOpacity
                style={styles.emptyActionBtn}
                onPress={() => {
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
                }}
              >
                <Plus size={14} color="#15803D" />
                <AppText style={styles.emptyActionText}>Add New Article</AppText>
              </TouchableOpacity>
            </View>
          ) : (
            filteredArticles.map((art) => (
              <View key={art.id} style={styles.recordCard}>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.badgeRow}>
                    <View
                      style={[
                        styles.statusBadge,
                        art.is_published ? styles.statusBadgeGreen : styles.statusBadgeAmber,
                      ]}
                    >
                      <AppText
                        style={[
                          styles.statusBadgeText,
                          art.is_published ? styles.statusBadgeTextGreen : styles.statusBadgeTextAmber,
                        ]}
                      >
                        {art.is_published ? 'Published' : 'Hidden'}
                      </AppText>
                    </View>

                    {art.category_name && (
                      <View style={styles.categoryChip}>
                        <AppText style={styles.categoryChipText}>{art.category_name}</AppText>
                      </View>
                    )}

                    <View style={styles.audienceTag}>
                      <AppText style={styles.audienceTagText}>
                        {art.target_audience === 'player'
                          ? 'Player Only'
                          : art.target_audience === 'club'
                          ? 'Club Only'
                          : 'All Audiences'}
                      </AppText>
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={styles.cardActionsRow}>
                    <TouchableOpacity
                      style={styles.iconActionBtn}
                      onPress={() => setPreviewArticle(art)}
                      accessibilityLabel="Preview Article"
                    >
                      <Eye size={15} color="#2563EB" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.iconActionBtn}
                      onPress={() => {
                        setEditingArticle({ ...art });
                        setArticleEditorTab('write');
                        setArticleModalOpen(true);
                      }}
                    >
                      <Edit2 size={15} color="#0F172A" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.iconActionBtn}
                      onPress={() => handleDeleteArticle(art.id, art.title)}
                    >
                      <Trash2 size={15} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                </View>

                <AppText style={styles.articleTitleText}>{art.title}</AppText>
                {art.slug ? <AppText style={styles.slugText}>/help/articles/{art.slug}</AppText> : null}

                <AppText style={styles.articleExcerptText} numberOfLines={2}>
                  {art.content.replace(/[#*`_]/g, '')}
                </AppText>
              </View>
            ))
          )}
        </View>
      ) : (
        /* ──── Categories List ──── */
        <View style={styles.listSection}>
          {filteredCategories.length === 0 ? (
            <View style={styles.emptyCard}>
              <Folder size={32} color="#94A3B8" />
              <AppText style={styles.emptyTitle}>No Categories</AppText>
              <AppText style={styles.emptyDesc}>
                Create categories to organize FAQs and Articles into logical support sections.
              </AppText>
              <TouchableOpacity
                style={styles.emptyActionBtn}
                onPress={() => {
                  setEditingCategory({
                    name: '',
                    slug: '',
                    description: '',
                    target_audience: 'all',
                    is_published: true,
                    display_order: categories.length,
                  });
                  setCategoryModalOpen(true);
                }}
              >
                <Plus size={14} color="#15803D" />
                <AppText style={styles.emptyActionText}>Add Category</AppText>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.categoriesGrid}>
              {filteredCategories.map((cat) => {
                const faqsCount = faqs.filter((f) => f.category_id === cat.id).length;
                const articlesCount = articles.filter((a) => a.category_id === cat.id).length;
                return (
                  <View key={cat.id} style={styles.categoryCard}>
                    <View style={styles.cardHeaderRow}>
                      <View style={styles.categoryIconWrap}>
                        <Folder size={18} color="#15803D" />
                      </View>
                      <View style={styles.cardActionsRow}>
                        <TouchableOpacity
                          style={styles.iconActionBtn}
                          onPress={() => {
                            setEditingCategory({ ...cat });
                            setCategoryModalOpen(true);
                          }}
                        >
                          <Edit2 size={14} color="#0F172A" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.iconActionBtn}
                          onPress={() => handleDeleteCategory(cat.id, cat.name)}
                        >
                          <Trash2 size={14} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <AppText style={styles.catNameText}>{cat.name}</AppText>
                    {cat.description ? (
                      <AppText style={styles.catDescText} numberOfLines={2}>
                        {cat.description}
                      </AppText>
                    ) : null}

                    <View style={styles.catFooterRow}>
                      <View style={styles.catStatsRow}>
                        <AppText style={styles.catStatText}>{faqsCount} FAQs</AppText>
                        <AppText style={styles.catStatDot}>•</AppText>
                        <AppText style={styles.catStatText}>{articlesCount} Articles</AppText>
                      </View>
                      <View style={styles.audienceTag}>
                        <AppText style={styles.audienceTagText}>
                          {cat.target_audience === 'player'
                            ? 'Players'
                            : cat.target_audience === 'club'
                            ? 'Clubs'
                            : 'All'}
                        </AppText>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
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
                <AppText style={styles.fieldLabel}>Category & Audience</AppText>
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

              {/* Editor Write / Preview Tabs */}
              <View style={styles.editorTabsRow}>
                <View style={styles.editorTabButtons}>
                  <TouchableOpacity
                    style={[styles.editorTabBtn, articleEditorTab === 'write' && styles.editorTabBtnActive]}
                    onPress={() => setArticleEditorTab('write')}
                  >
                    <AppText style={[styles.editorTabText, articleEditorTab === 'write' && styles.editorTabTextActive]}>
                      Write
                    </AppText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.editorTabBtn, articleEditorTab === 'preview' && styles.editorTabBtnActive]}
                    onPress={() => setArticleEditorTab('preview')}
                  >
                    <AppText style={[styles.editorTabText, articleEditorTab === 'preview' && styles.editorTabTextActive]}>
                      Preview
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
                  <AppText style={styles.previewTitle}>{editingArticle?.title || 'Untitled Article'}</AppText>
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

      {/* ─── MODAL: ARTICLE PREVIEW VIEWER ────────────────────────────────── */}
      <Modal visible={Boolean(previewArticle)} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.modalCardLarge]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleCol}>
                <AppText style={styles.modalTitle}>{previewArticle?.title}</AppText>
                <AppText style={styles.modalSubtitle}>
                  {previewArticle?.category_name ? `${previewArticle.category_name} • ` : ''}
                  Audience: {previewArticle?.target_audience ?? 'all'}
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => setPreviewArticle(null)}
                style={styles.modalCloseBtn}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollBody} showsVerticalScrollIndicator={false}>
              <View style={styles.articlePreviewBox}>
                <AppText style={styles.previewContent}>{previewArticle?.content}</AppText>
              </View>
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={() => setPreviewArticle(null)}
              >
                <AppText style={styles.modalSubmitText}>Close Preview</AppText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 90,
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
  },

  // ─── Header Block ─────────────────────────────────────────────────────────
  headerBlock: {
    marginBottom: 16,
  },
  backLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  backLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  headingTextCol: {
    flex: 1,
    minWidth: 260,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  screenSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 18,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#15803D',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  primaryActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
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
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  alertErrorText: {
    flex: 1,
    fontSize: 12.5,
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
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  alertSuccessText: {
    flex: 1,
    fontSize: 12.5,
    color: '#15803D',
    fontWeight: '600',
  },

  // ─── Sub Tabs ─────────────────────────────────────────────────────────────
  subTabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  subTabsSegment: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    padding: 3,
    borderRadius: 9,
    gap: 3,
  },
  segmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      web: { boxShadow: '0 1px 2px rgba(0,0,0,0.06)' },
      default: { elevation: 1 },
    }),
  },
  segmentBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  segmentBtnTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
  },
  refreshBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },

  // ─── Filter Bar ───────────────────────────────────────────────────────────
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  searchWrapper: {
    flex: 1,
    minWidth: 200,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 38,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    height: '100%',
  },
  audienceChipsGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  audienceChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 7,
  },
  audienceChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  audienceChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  audienceChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // ─── Records List ─────────────────────────────────────────────────────────
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  listSection: {
    gap: 10,
  },
  recordCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    ...Platform.select({
      web: { boxShadow: '0 1px 2px rgba(0,0,0,0.03)' },
    }),
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  statusBadgeGreen: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeAmber: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadgeTextGreen: {
    color: '#15803D',
  },
  statusBadgeTextAmber: {
    color: '#D97706',
  },
  categoryChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  categoryChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  audienceTag: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  audienceTagText: {
    fontSize: 11,
    color: '#2563EB',
    fontWeight: '600',
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconActionBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faqQuestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
  },
  faqQuestionText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    lineHeight: 20,
  },
  faqAnswerExcerpt: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 6,
    lineHeight: 18,
  },
  faqAnswerExpanded: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  faqAnswerText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 20,
  },
  articleTitleText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 20,
  },
  slugText: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 2,
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
  },
  articleExcerptText: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 6,
    lineHeight: 18,
  },

  // ─── Categories Grid ──────────────────────────────────────────────────────
  categoriesGrid: {
    gap: 10,
  },
  categoryCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
  },
  categoryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 7,
    backgroundColor: '#EAF8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  catNameText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 8,
  },
  catDescText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 17,
  },
  catFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  catStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  catStatText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  catStatDot: {
    fontSize: 11.5,
    color: '#CBD5E1',
  },

  // ─── Empty State ──────────────────────────────────────────────────────────
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 4,
  },
  emptyDesc: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 18,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: '#EAF8F0',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
  },
  emptyActionText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#15803D',
  },

  // ─── Modal Styles ─────────────────────────────────────────────────────────
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
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    fontSize: 13,
    color: '#0F172A',
  },
  textArea: {
    height: 90,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  textAreaLarge: {
    height: 200,
    paddingTop: 10,
    textAlignVertical: 'top',
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
    fontSize: 12.5,
  },
  chipsScroll: {
    flexDirection: 'row',
  },
  rowChoices: {
    flexDirection: 'row',
    gap: 8,
  },
  choiceChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
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
    paddingVertical: 8,
    marginBottom: 8,
  },
  switchTextCol: {
    flex: 1,
    paddingRight: 12,
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  switchDesc: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  editorTabsRow: {
    marginBottom: 8,
  },
  editorTabButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  editorTabBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    backgroundColor: '#F1F5F9',
  },
  editorTabBtnActive: {
    backgroundColor: '#0F172A',
  },
  editorTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  editorTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  articlePreviewBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 14,
    minHeight: 120,
    marginBottom: 12,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  previewContent: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 20,
  },
  modalActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  modalCancelText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
  modalSubmitBtn: {
    backgroundColor: '#15803D',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 7,
    minWidth: 90,
    alignItems: 'center',
  },
  modalSubmitText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

