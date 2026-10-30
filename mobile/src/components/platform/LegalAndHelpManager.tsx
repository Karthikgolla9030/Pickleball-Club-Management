/**
 * Aught2 Pickleball — Platform Admin Legal & Help Content Management
 *
 * Comprehensive management interface for:
 * 1. Help Categories, FAQs, and Articles (Audience: Player, Club, Both; Publish/Unpublish; CRUD)
 * 2. Player Terms of Service, Club Terms of Service, Privacy Policy, Club/Facility Agreement
 * 3. Draft creation, Editing, Previews, Version History, Effective Dates, and Renewed Acceptance enforcement
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Edit2,
  Eye,
  FileCheck,
  FileText,
  HelpCircle,
  Layers,
  Plus,
  Shield,
  Trash2,
  Upload,
  X,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import {
  FAQItem,
  HelpArticleItem,
  HelpCategoryItem,
  LegalDocumentDetailResponse,
  LegalDocumentItem,
  LegalDocumentVersionItem,
  platformLegalApi,
} from '@/services/api';
import { Colors, Radius, Spacing, Typography } from '@/theme';

type MainSection = 'help' | 'player_terms' | 'club_terms' | 'privacy_policy' | 'club_agreement';
type HelpSubSection = 'faqs' | 'articles' | 'categories';

export interface LegalAndHelpManagerProps {
  initialSection?: MainSection;
  onBack?: () => void;
}

export function LegalAndHelpManager({
  initialSection = 'help',
  onBack,
}: LegalAndHelpManagerProps = {}) {
  const [section, setSection] = useState<MainSection>(initialSection);
  const [helpSubSection, setHelpSubSection] = useState<HelpSubSection>('faqs');

  // Loading and alerts
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Help Data
  const [categories, setCategories] = useState<HelpCategoryItem[]>([]);
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [articles, setArticles] = useState<HelpArticleItem[]>([]);

  // Legal Data
  const [documents, setDocuments] = useState<LegalDocumentItem[]>([]);
  const [selectedDocDetail, setSelectedDocDetail] = useState<LegalDocumentDetailResponse | null>(null);

  // Modals
  const [faqModalVisible, setFaqModalVisible] = useState(false);
  const [editingFaq, setEditingFaq] = useState<Partial<FAQItem> | null>(null);

  const [articleModalVisible, setArticleModalVisible] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Partial<HelpArticleItem> | null>(null);

  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Partial<HelpCategoryItem> | null>(null);

  // Version Draft / Edit Modal
  const [versionModalVisible, setVersionModalVisible] = useState(false);
  const [editingVersion, setEditingVersion] = useState<{
    documentId: string;
    versionId?: string;
    version: string;
    title: string;
    content: string;
    requires_renewed_acceptance: boolean;
    change_summary: string;
    effective_date: string;
  } | null>(null);

  // Preview Modal
  const [previewVersion, setPreviewVersion] = useState<LegalDocumentVersionItem | null>(null);

  const clearAlerts = () => {
    setError(null);
    setSuccessMsg(null);
  };

  // Load help content
  const loadHelpData = useCallback(async () => {
    setIsLoading(true);
    clearAlerts();
    try {
      const [catsRes, faqsRes, artsRes] = await Promise.all([
        platformLegalApi.listCategories(),
        platformLegalApi.listFaqs(),
        platformLegalApi.listArticles(),
      ]);
      setCategories(catsRes);
      setFaqs(faqsRes.items);
      setArticles(artsRes.items);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load help data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load documents
  const loadDocuments = useCallback(async () => {
    setIsLoading(true);
    clearAlerts();
    try {
      const docs = await platformLegalApi.listDocuments();
      setDocuments(docs);
      if (section !== 'help') {
        const found = docs.find((d) => d.document_type === section);
        if (found) {
          const detail = await platformLegalApi.getDocument(found.id);
          setSelectedDocDetail(detail);
        }
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  }, [section]);

  useEffect(() => {
    if (section === 'help') {
      loadHelpData();
    } else {
      loadDocuments();
    }
  }, [section, loadHelpData, loadDocuments]);

  useEffect(() => {
    if (section !== 'help' && documents.length > 0) {
      const found = documents.find((d) => d.document_type === section);
      if (found) {
        platformLegalApi.getDocument(found.id).then(setSelectedDocDetail).catch(() => {});
      } else {
        setSelectedDocDetail(null);
      }
    }
  }, [section, documents]);

  // ─── FAQ Handlers ──────────────────────────────────────────────────────────
  const handleSaveFaq = async () => {
    if (!editingFaq?.question?.trim() || !editingFaq?.answer?.trim()) {
      setError('Question and answer are required.');
      return;
    }
    clearAlerts();
    try {
      if (editingFaq.id) {
        await platformLegalApi.updateFaq(editingFaq.id, {
          question: editingFaq.question.trim(),
          answer: editingFaq.answer.trim(),
          category_id: editingFaq.category_id || null,
          target_audience: editingFaq.target_audience || 'all',
          is_published: editingFaq.is_published ?? true,
          display_order: Number(editingFaq.display_order || 0),
        });
        setSuccessMsg('FAQ updated successfully.');
      } else {
        await platformLegalApi.createFaq({
          question: editingFaq.question.trim(),
          answer: editingFaq.answer.trim(),
          category_id: editingFaq.category_id || null,
          target_audience: editingFaq.target_audience || 'all',
          is_published: editingFaq.is_published ?? true,
          display_order: Number(editingFaq.display_order || 0),
        });
        setSuccessMsg('New FAQ created.');
      }
      setFaqModalVisible(false);
      setEditingFaq(null);
      loadHelpData();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to save FAQ');
    }
  };

  const handleDeleteFaq = async (id: string) => {
    if (Platform.OS === 'web') {
      if (!confirm('Are you sure you want to delete this FAQ?')) return;
    }
    try {
      await platformLegalApi.deleteFaq(id);
      setSuccessMsg('FAQ deleted.');
      loadHelpData();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to delete FAQ');
    }
  };

  // ─── Article Handlers ──────────────────────────────────────────────────────
  const handleSaveArticle = async () => {
    if (!editingArticle?.title?.trim() || !editingArticle?.content?.trim()) {
      setError('Title and content are required.');
      return;
    }
    clearAlerts();
    try {
      if (editingArticle.id) {
        await platformLegalApi.updateArticle(editingArticle.id, {
          title: editingArticle.title.trim(),
          content: editingArticle.content.trim(),
          category_id: editingArticle.category_id || null,
          target_audience: editingArticle.target_audience || 'all',
          is_published: editingArticle.is_published ?? true,
          display_order: Number(editingArticle.display_order || 0),
        });
        setSuccessMsg('Help article updated successfully.');
      } else {
        await platformLegalApi.createArticle({
          title: editingArticle.title.trim(),
          content: editingArticle.content.trim(),
          category_id: editingArticle.category_id || null,
          target_audience: editingArticle.target_audience || 'all',
          is_published: editingArticle.is_published ?? true,
          display_order: Number(editingArticle.display_order || 0),
        });
        setSuccessMsg('Help article created successfully.');
      }
      setArticleModalVisible(false);
      setEditingArticle(null);
      loadHelpData();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to save article');
    }
  };

  const handleDeleteArticle = async (id: string) => {
    if (Platform.OS === 'web') {
      if (!confirm('Are you sure you want to delete this help article?')) return;
    }
    try {
      await platformLegalApi.deleteArticle(id);
      setSuccessMsg('Article deleted.');
      loadHelpData();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to delete article');
    }
  };

  // ─── Category Handlers ─────────────────────────────────────────────────────
  const handleSaveCategory = async () => {
    if (!editingCategory?.name?.trim()) {
      setError('Category name is required.');
      return;
    }
    clearAlerts();
    try {
      if (editingCategory.id) {
        await platformLegalApi.updateCategory(editingCategory.id, {
          name: editingCategory.name.trim(),
          description: editingCategory.description?.trim(),
          target_audience: editingCategory.target_audience || 'all',
          is_published: editingCategory.is_published ?? true,
          display_order: Number(editingCategory.display_order || 0),
        });
        setSuccessMsg('Category updated successfully.');
      } else {
        await platformLegalApi.createCategory({
          name: editingCategory.name.trim(),
          description: editingCategory.description?.trim(),
          target_audience: editingCategory.target_audience || 'all',
          is_published: editingCategory.is_published ?? true,
          display_order: Number(editingCategory.display_order || 0),
        });
        setSuccessMsg('Category created.');
      }
      setCategoryModalVisible(false);
      setEditingCategory(null);
      loadHelpData();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to save category');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (Platform.OS === 'web') {
      if (!confirm('Are you sure you want to delete this category? Associated FAQs may become uncategorized.')) return;
    }
    try {
      await platformLegalApi.deleteCategory(id);
      setSuccessMsg('Category deleted.');
      loadHelpData();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to delete category');
    }
  };

  // ─── Legal Version Handlers ────────────────────────────────────────────────
  const handleOpenNewVersionDraft = () => {
    if (!selectedDocDetail) return;
    const cur = selectedDocDetail.current_version;
    const nextVer = cur ? `v${(parseFloat(cur.version.replace('v', '')) + 0.1).toFixed(1)}` : 'v1.0';
    setEditingVersion({
      documentId: selectedDocDetail.id,
      version: nextVer,
      title: cur?.title || selectedDocDetail.title,
      content: cur?.content || '',
      requires_renewed_acceptance: false,
      change_summary: '',
      effective_date: new Date().toISOString().split('T')[0],
    });
    setVersionModalVisible(true);
  };

  const handleEditDraftVersion = (ver: LegalDocumentVersionItem) => {
    if (!selectedDocDetail) return;
    setEditingVersion({
      documentId: selectedDocDetail.id,
      versionId: ver.id,
      version: ver.version,
      title: ver.title,
      content: ver.content,
      requires_renewed_acceptance: ver.requires_renewed_acceptance,
      change_summary: ver.change_summary || '',
      effective_date: ver.effective_date ? ver.effective_date.split('T')[0] : '',
    });
    setVersionModalVisible(true);
  };

  const handleSaveVersionDraft = async () => {
    if (!editingVersion || !selectedDocDetail) return;
    if (!editingVersion.title.trim() || !editingVersion.content.trim() || !editingVersion.version.trim()) {
      setError('Version, title, and content are required.');
      return;
    }
    clearAlerts();
    try {
      if (editingVersion.versionId) {
        await platformLegalApi.updateVersion(editingVersion.versionId, {
          title: editingVersion.title.trim(),
          content: editingVersion.content.trim(),
          requires_renewed_acceptance: editingVersion.requires_renewed_acceptance,
          change_summary: editingVersion.change_summary.trim(),
          effective_date: editingVersion.effective_date || undefined,
        });
        setSuccessMsg(`Draft ${editingVersion.version} updated.`);
      } else {
        await platformLegalApi.createVersion(selectedDocDetail.id, {
          version: editingVersion.version.trim(),
          title: editingVersion.title.trim(),
          content: editingVersion.content.trim(),
          requires_renewed_acceptance: editingVersion.requires_renewed_acceptance,
          change_summary: editingVersion.change_summary.trim(),
          effective_date: editingVersion.effective_date || undefined,
        });
        setSuccessMsg(`New draft version ${editingVersion.version} created.`);
      }
      setVersionModalVisible(false);
      setEditingVersion(null);
      const updatedDoc = await platformLegalApi.getDocument(selectedDocDetail.id);
      setSelectedDocDetail(updatedDoc);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to save version draft');
    }
  };

  const handlePublishVersion = async (versionId: string, verString: string) => {
    if (Platform.OS === 'web') {
      if (!confirm(`Are you sure you want to publish ${verString}? This will make it the active official version for all users immediately.`)) return;
    }
    clearAlerts();
    try {
      await platformLegalApi.publishVersion(versionId, {
        effective_date: new Date().toISOString(),
      });
      setSuccessMsg(`Version ${verString} is now published and active.`);
      if (selectedDocDetail) {
        const updatedDoc = await platformLegalApi.getDocument(selectedDocDetail.id);
        setSelectedDocDetail(updatedDoc);
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to publish version');
    }
  };

  return (
    <View style={styles.container}>
      {onBack && (
        <TouchableOpacity
          style={styles.backButtonRow}
          onPress={onBack}
          activeOpacity={0.7}
        >
          <ArrowLeft size={18} color="#0F172A" strokeWidth={2.2} />
          <AppText style={styles.backButtonText}>Back to Settings</AppText>
        </TouchableOpacity>
      )}

      {/* Top Section Nav Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topTabs}>
        {[
          { key: 'help', label: 'Help & FAQs', icon: HelpCircle },
          { key: 'player_terms', label: 'Player Terms', icon: FileText },
          { key: 'club_terms', label: 'Club Terms', icon: FileText },
          { key: 'privacy_policy', label: 'Privacy Policy', icon: Shield },
          { key: 'club_agreement', label: 'Club Agreement', icon: FileCheck },
        ].map((tab) => {
          const isActive = section === tab.key;
          const IconComp = tab.icon;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.topTabBtn, isActive && styles.topTabBtnActive]}
              onPress={() => {
                setSection(tab.key as MainSection);
                clearAlerts();
              }}
              activeOpacity={0.7}
            >
              <IconComp size={16} color={isActive ? '#FFFFFF' : '#475569'} />
              <AppText style={[styles.topTabBtnText, isActive && styles.topTabBtnTextActive]}>
                {tab.label}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Status Messages */}
      {error && (
        <View style={styles.alertError}>
          <AlertCircle size={18} color="#B91C1C" />
          <AppText style={styles.alertErrorText}>{error}</AppText>
        </View>
      )}
      {successMsg && (
        <View style={styles.alertSuccess}>
          <CheckCircle2 size={18} color="#15803D" />
          <AppText style={styles.alertSuccessText}>{successMsg}</AppText>
        </View>
      )}

      {/* ─── SECTION 1: HELP & FAQS ────────────────────────────────────────── */}
      {section === 'help' && (
        <View style={styles.contentWrap}>
          {/* Sub Navigation */}
          <View style={styles.subTabsRow}>
            <View style={styles.subTabsGroup}>
              {(['faqs', 'articles', 'categories'] as HelpSubSection[]).map((st) => (
                <TouchableOpacity
                  key={st}
                  style={[styles.subTabBtn, helpSubSection === st && styles.subTabBtnActive]}
                  onPress={() => setHelpSubSection(st)}
                >
                  <AppText style={[styles.subTabBtnText, helpSubSection === st && styles.subTabBtnTextActive]}>
                    {st === 'faqs' ? `FAQs (${faqs.length})` : st === 'articles' ? `Articles (${articles.length})` : `Categories (${categories.length})`}
                  </AppText>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => {
                clearAlerts();
                if (helpSubSection === 'faqs') {
                  setEditingFaq({ target_audience: 'all', is_published: true, display_order: 0 });
                  setFaqModalVisible(true);
                } else if (helpSubSection === 'articles') {
                  setEditingArticle({ target_audience: 'all', is_published: true, display_order: 0 });
                  setArticleModalVisible(true);
                } else {
                  setEditingCategory({ target_audience: 'all', is_published: true, display_order: 0 });
                  setCategoryModalVisible(true);
                }
              }}
            >
              <Plus size={16} color="#FFFFFF" />
              <AppText style={styles.actionBtnText}>
                {helpSubSection === 'faqs' ? 'Add FAQ' : helpSubSection === 'articles' ? 'Add Article' : 'Add Category'}
              </AppText>
            </TouchableOpacity>
          </View>

          {/* Sub Section Content */}
          <ScrollView style={styles.sectionScroll} showsVerticalScrollIndicator={false}>
            {helpSubSection === 'faqs' && (
              <View style={styles.itemsList}>
                {faqs.map((faq) => (
                  <Card key={faq.id} style={styles.itemCard}>
                    <View style={styles.itemHeader}>
                      <View style={styles.itemHeaderLeft}>
                        <Badge
                          label={faq.is_published ? 'Published' : 'Draft'}
                          variant={faq.is_published ? 'success' : 'default'}
                          size="sm"
                        />
                        <Badge
                          label={faq.target_audience.toUpperCase()}
                          variant="info"
                          size="sm"
                        />
                        {faq.category_name && (
                          <Badge
                            label={faq.category_name}
                            variant="default"
                            size="sm"
                          />
                        )}
                      </View>
                      <View style={styles.itemActions}>
                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={() => {
                            setEditingFaq(faq);
                            setFaqModalVisible(true);
                          }}
                        >
                          <Edit2 size={16} color="#0284C7" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.iconBtn} onPress={() => handleDeleteFaq(faq.id)}>
                          <Trash2 size={16} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <AppText style={styles.itemTitle}>{faq.question}</AppText>
                    <AppText style={styles.itemBody} numberOfLines={3}>
                      {faq.answer}
                    </AppText>
                  </Card>
                ))}
              </View>
            )}

            {helpSubSection === 'articles' && (
              <View style={styles.itemsList}>
                {articles.map((art) => (
                  <Card key={art.id} style={styles.itemCard}>
                    <View style={styles.itemHeader}>
                      <View style={styles.itemHeaderLeft}>
                        <Badge
                          label={art.is_published ? 'Published' : 'Draft'}
                          variant={art.is_published ? 'success' : 'default'}
                          size="sm"
                        />
                        <Badge
                          label={art.target_audience.toUpperCase()}
                          variant="info"
                          size="sm"
                        />
                        {art.category_name && (
                          <Badge
                            label={art.category_name}
                            variant="default"
                            size="sm"
                          />
                        )}
                      </View>
                      <View style={styles.itemActions}>
                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={() => {
                            setEditingArticle(art);
                            setArticleModalVisible(true);
                          }}
                        >
                          <Edit2 size={16} color="#0284C7" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.iconBtn} onPress={() => handleDeleteArticle(art.id)}>
                          <Trash2 size={16} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <AppText style={styles.itemTitle}>{art.title}</AppText>
                    <AppText style={styles.itemBody} numberOfLines={3}>
                      {art.content.replace(/#|\*|_|`/g, '')}
                    </AppText>
                  </Card>
                ))}
              </View>
            )}

            {helpSubSection === 'categories' && (
              <View style={styles.itemsList}>
                {categories.map((cat) => (
                  <Card key={cat.id} style={styles.itemCard}>
                    <View style={styles.itemHeader}>
                      <View style={styles.itemHeaderLeft}>
                        <Badge
                          label={cat.target_audience.toUpperCase()}
                          variant="success"
                          size="sm"
                        />
                        <AppText style={styles.slugText}>/{cat.slug}</AppText>
                      </View>
                      <View style={styles.itemActions}>
                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={() => {
                            setEditingCategory(cat);
                            setCategoryModalVisible(true);
                          }}
                        >
                          <Edit2 size={16} color="#0284C7" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.iconBtn} onPress={() => handleDeleteCategory(cat.id)}>
                          <Trash2 size={16} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <AppText style={styles.itemTitle}>{cat.name}</AppText>
                    {cat.description && <AppText style={styles.itemBody}>{cat.description}</AppText>}
                  </Card>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {/* ─── SECTION 2: LEGAL DOCUMENT EDITING ───────────────────────────────── */}
      {section !== 'help' && (
        <ScrollView style={styles.sectionScroll} showsVerticalScrollIndicator={false}>
          {selectedDocDetail ? (
            <View style={styles.legalDocContainer}>
              {/* Document Overview Header */}
              <Card style={styles.docOverviewCard}>
                <View style={styles.docOverviewHeader}>
                  <View>
                    <AppText style={styles.docTitle}>{selectedDocDetail.title}</AppText>
                    <AppText style={styles.docSub}>
                      Target Audience: <AppText style={{ fontWeight: '700' }}>{selectedDocDetail.target_audience.toUpperCase()}</AppText>
                    </AppText>
                  </View>
                  <TouchableOpacity style={styles.actionBtn} onPress={handleOpenNewVersionDraft}>
                    <Plus size={16} color="#FFFFFF" />
                    <AppText style={styles.actionBtnText}>Draft New Version</AppText>
                  </TouchableOpacity>
                </View>

                {/* Current Published Version */}
                <View style={styles.activeVerBanner}>
                  <View style={styles.activeVerLeft}>
                    <View style={styles.activeVerBadge}>
                      <AppText style={styles.activeVerBadgeText}>
                        {selectedDocDetail.current_version?.version || 'None'}
                      </AppText>
                    </View>
                    <View>
                      <AppText style={styles.activeVerTitle}>Current Official Version</AppText>
                      <AppText style={styles.activeVerDate}>
                        Published: {selectedDocDetail.current_version?.published_at ? new Date(selectedDocDetail.current_version.published_at).toLocaleDateString() : 'N/A'}
                      </AppText>
                    </View>
                  </View>
                  {selectedDocDetail.current_version && (
                    <TouchableOpacity
                      style={styles.previewBtn}
                      onPress={() => setPreviewVersion(selectedDocDetail.current_version!)}
                    >
                      <Eye size={15} color={Colors.brand.primary} />
                      <AppText style={styles.previewBtnText}>Read Published</AppText>
                    </TouchableOpacity>
                  )}
                </View>
              </Card>

              {/* Version History List */}
              <View style={styles.versionHistoryHeader}>
                <Layers size={18} color="#0F172A" />
                <AppText style={styles.versionHistoryTitle}>Version History</AppText>
              </View>

              <View style={styles.versionsList}>
                {selectedDocDetail.versions.map((ver) => {
                  const isCurrent = selectedDocDetail.current_version?.id === ver.id;
                  const isDraft = ver.status === 'draft';
                  return (
                    <Card key={ver.id} style={[styles.verCard, isCurrent && styles.verCardActive]}>
                      <View style={styles.verCardHeader}>
                        <View style={styles.verCardLeft}>
                          <Badge
                            label={`${ver.version} • ${ver.status.toUpperCase()}`}
                            variant={isCurrent ? 'success' : isDraft ? 'warning' : 'default'}
                            size="sm"
                          />
                          {ver.requires_renewed_acceptance && (
                            <Badge
                              label="Requires Renewed Acceptance"
                              variant="error"
                              size="sm"
                            />
                          )}
                        </View>

                        <View style={styles.verActions}>
                          <TouchableOpacity
                            style={styles.verActionBtn}
                            onPress={() => setPreviewVersion(ver)}
                          >
                            <Eye size={14} color="#0F172A" />
                            <AppText style={styles.verActionText}>Preview</AppText>
                          </TouchableOpacity>

                          {isDraft && (
                            <>
                              <TouchableOpacity
                                style={styles.verActionBtn}
                                onPress={() => handleEditDraftVersion(ver)}
                              >
                                <Edit2 size={14} color="#0284C7" />
                                <AppText style={[styles.verActionText, { color: '#0284C7' }]}>
                                  Edit Draft
                                </AppText>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.verActionBtn, styles.publishBtn]}
                                onPress={() => handlePublishVersion(ver.id, ver.version)}
                              >
                                <Upload size={14} color="#FFFFFF" />
                                <AppText style={styles.publishBtnText}>Publish</AppText>
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      </View>

                      <AppText style={styles.verTitle}>{ver.title}</AppText>
                      {ver.change_summary && (
                        <AppText style={styles.verChangeSummary}>
                          <AppText style={{ fontWeight: '700' }}>Changes: </AppText>
                          {ver.change_summary}
                        </AppText>
                      )}
                      <View style={styles.verMetaRow}>
                        <Clock size={12} color="#64748B" />
                        <AppText style={styles.verMetaText}>
                          Created: {new Date(ver.created_at).toLocaleDateString()}
                          {ver.effective_date && ` • Effective: ${new Date(ver.effective_date).toLocaleDateString()}`}
                        </AppText>
                      </View>
                    </Card>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={Colors.brand.primary} />
              <AppText style={styles.loadingText}>Loading document details...</AppText>
            </View>
          )}
        </ScrollView>
      )}

      {/* ─── MODALS ──────────────────────────────────────────────────────────── */}

      {/* FAQ Modal */}
      <Modal visible={faqModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <AppText style={styles.modalTitle}>{editingFaq?.id ? 'Edit FAQ' : 'New FAQ'}</AppText>
              <TouchableOpacity onPress={() => setFaqModalVisible(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <AppText style={styles.inputLabel}>Question</AppText>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. How do I refund a booking?"
                value={editingFaq?.question || ''}
                onChangeText={(t) => setEditingFaq((p) => ({ ...p, question: t }))}
              />

              <AppText style={styles.inputLabel}>Answer</AppText>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Detailed guidance..."
                multiline
                numberOfLines={4}
                value={editingFaq?.answer || ''}
                onChangeText={(t) => setEditingFaq((p) => ({ ...p, answer: t }))}
              />

              <AppText style={styles.inputLabel}>Target Audience</AppText>
              <View style={styles.audienceRow}>
                {['all', 'player', 'club'].map((aud) => (
                  <TouchableOpacity
                    key={aud}
                    style={[styles.audienceBtn, editingFaq?.target_audience === aud && styles.audienceBtnActive]}
                    onPress={() => setEditingFaq((p) => ({ ...p, target_audience: aud }))}
                  >
                    <AppText style={[styles.audienceBtnText, editingFaq?.target_audience === aud && styles.audienceBtnTextActive]}>
                      {aud.toUpperCase()}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>

              <AppText style={styles.inputLabel}>Category</AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryPicker}>
                <TouchableOpacity
                  style={[styles.catPickBtn, !editingFaq?.category_id && styles.catPickBtnActive]}
                  onPress={() => setEditingFaq((p) => ({ ...p, category_id: null }))}
                >
                  <AppText style={[styles.catPickBtnText, !editingFaq?.category_id && styles.catPickBtnTextActive]}>
                    None (General)
                  </AppText>
                </TouchableOpacity>
                {categories.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.catPickBtn, editingFaq?.category_id === c.id && styles.catPickBtnActive]}
                    onPress={() => setEditingFaq((p) => ({ ...p, category_id: c.id }))}
                  >
                    <AppText style={[styles.catPickBtnText, editingFaq?.category_id === c.id && styles.catPickBtnTextActive]}>
                      {c.name}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.switchRow}>
                <AppText style={styles.switchLabel}>Published Immediately</AppText>
                <Switch
                  value={editingFaq?.is_published ?? true}
                  onValueChange={(val) => setEditingFaq((p) => ({ ...p, is_published: val }))}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setFaqModalVisible(false)}>
                <AppText style={styles.cancelBtnText}>Cancel</AppText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveFaq}>
                <AppText style={styles.saveBtnText}>Save FAQ</AppText>
              </TouchableOpacity>
            </View>
          </Card>
        </View>
      </Modal>

      {/* Article Modal */}
      <Modal visible={articleModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Card style={[styles.modalCard, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <AppText style={styles.modalTitle}>{editingArticle?.id ? 'Edit Help Article' : 'New Help Article'}</AppText>
              <TouchableOpacity onPress={() => setArticleModalVisible(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <AppText style={styles.inputLabel}>Article Title</AppText>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Setting Up Custom Staff Permissions"
                value={editingArticle?.title || ''}
                onChangeText={(t) => setEditingArticle((p) => ({ ...p, title: t }))}
              />

              <AppText style={styles.inputLabel}>Target Audience</AppText>
              <View style={styles.audienceRow}>
                {['all', 'player', 'club'].map((aud) => (
                  <TouchableOpacity
                    key={aud}
                    style={[styles.audienceBtn, editingArticle?.target_audience === aud && styles.audienceBtnActive]}
                    onPress={() => setEditingArticle((p) => ({ ...p, target_audience: aud }))}
                  >
                    <AppText style={[styles.audienceBtnText, editingArticle?.target_audience === aud && styles.audienceBtnTextActive]}>
                      {aud.toUpperCase()}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>

              <AppText style={styles.inputLabel}>Category</AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryPicker}>
                <TouchableOpacity
                  style={[styles.catPickBtn, !editingArticle?.category_id && styles.catPickBtnActive]}
                  onPress={() => setEditingArticle((p) => ({ ...p, category_id: null }))}
                >
                  <AppText style={[styles.catPickBtnText, !editingArticle?.category_id && styles.catPickBtnTextActive]}>
                    General
                  </AppText>
                </TouchableOpacity>
                {categories.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.catPickBtn, editingArticle?.category_id === c.id && styles.catPickBtnActive]}
                    onPress={() => setEditingArticle((p) => ({ ...p, category_id: c.id }))}
                  >
                    <AppText style={[styles.catPickBtnText, editingArticle?.category_id === c.id && styles.catPickBtnTextActive]}>
                      {c.name}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <AppText style={styles.inputLabel}>Content (Markdown Supported)</AppText>
              <TextInput
                style={[styles.textInput, styles.textArea, { minHeight: 180 }]}
                placeholder="# Guide Overview..."
                multiline
                numberOfLines={8}
                value={editingArticle?.content || ''}
                onChangeText={(t) => setEditingArticle((p) => ({ ...p, content: t }))}
              />

              <View style={styles.switchRow}>
                <AppText style={styles.switchLabel}>Published Immediately</AppText>
                <Switch
                  value={editingArticle?.is_published ?? true}
                  onValueChange={(val) => setEditingArticle((p) => ({ ...p, is_published: val }))}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setArticleModalVisible(false)}>
                <AppText style={styles.cancelBtnText}>Cancel</AppText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveArticle}>
                <AppText style={styles.saveBtnText}>Save Article</AppText>
              </TouchableOpacity>
            </View>
          </Card>
        </View>
      </Modal>

      {/* Category Modal */}
      <Modal visible={categoryModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <AppText style={styles.modalTitle}>{editingCategory?.id ? 'Edit Category' : 'New Category'}</AppText>
              <TouchableOpacity onPress={() => setCategoryModalVisible(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <AppText style={styles.inputLabel}>Category Name</AppText>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Tournaments & Events"
                value={editingCategory?.name || ''}
                onChangeText={(t) => setEditingCategory((p) => ({ ...p, name: t }))}
              />

              <AppText style={styles.inputLabel}>Description</AppText>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Brief summary..."
                multiline
                numberOfLines={3}
                value={editingCategory?.description || ''}
                onChangeText={(t) => setEditingCategory((p) => ({ ...p, description: t }))}
              />

              <AppText style={styles.inputLabel}>Target Audience</AppText>
              <View style={styles.audienceRow}>
                {['all', 'player', 'club'].map((aud) => (
                  <TouchableOpacity
                    key={aud}
                    style={[styles.audienceBtn, editingCategory?.target_audience === aud && styles.audienceBtnActive]}
                    onPress={() => setEditingCategory((p) => ({ ...p, target_audience: aud }))}
                  >
                    <AppText style={[styles.audienceBtnText, editingCategory?.target_audience === aud && styles.audienceBtnTextActive]}>
                      {aud.toUpperCase()}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setCategoryModalVisible(false)}>
                <AppText style={styles.cancelBtnText}>Cancel</AppText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveCategory}>
                <AppText style={styles.saveBtnText}>Save Category</AppText>
              </TouchableOpacity>
            </View>
          </Card>
        </View>
      </Modal>

      {/* Draft / Edit Version Modal */}
      <Modal visible={versionModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <Card style={[styles.modalCard, { maxHeight: '92%' }]}>
            <View style={styles.modalHeader}>
              <AppText style={styles.modalTitle}>
                {editingVersion?.versionId ? `Edit Draft Version` : `Draft New Document Version`}
              </AppText>
              <TouchableOpacity onPress={() => setVersionModalVisible(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <AppText style={styles.inputLabel}>Version Identifier</AppText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. v1.1"
                    value={editingVersion?.version || ''}
                    onChangeText={(t) => setEditingVersion((p) => p && { ...p, version: t })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText style={styles.inputLabel}>Effective Date</AppText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="YYYY-MM-DD"
                    value={editingVersion?.effective_date || ''}
                    onChangeText={(t) => setEditingVersion((p) => p && { ...p, effective_date: t })}
                  />
                </View>
              </View>

              <AppText style={styles.inputLabel}>Official Document Title</AppText>
              <TextInput
                style={styles.textInput}
                value={editingVersion?.title || ''}
                onChangeText={(t) => setEditingVersion((p) => p && { ...p, title: t })}
              />

              <AppText style={styles.inputLabel}>Summary of Changes</AppText>
              <TextInput
                style={[styles.textInput, { height: 44 }]}
                placeholder="e.g. Updated Section 4 regarding payment processing and refunds..."
                value={editingVersion?.change_summary || ''}
                onChangeText={(t) => setEditingVersion((p) => p && { ...p, change_summary: t })}
              />

              <View style={[styles.switchRow, { marginVertical: 12 }]}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <AppText style={styles.switchLabel}>Require Renewed Acceptance</AppText>
                  <AppText style={styles.switchSub}>
                    Users must re-accept this document upon their next sign-in or portal visit before continuing.
                  </AppText>
                </View>
                <Switch
                  value={editingVersion?.requires_renewed_acceptance ?? false}
                  onValueChange={(val) =>
                    setEditingVersion((p) => p && { ...p, requires_renewed_acceptance: val })
                  }
                />
              </View>

              <AppText style={styles.inputLabel}>Legal Document Text (Markdown)</AppText>
              <TextInput
                style={[styles.textInput, styles.textArea, { minHeight: 220 }]}
                multiline
                numberOfLines={12}
                value={editingVersion?.content || ''}
                onChangeText={(t) => setEditingVersion((p) => p && { ...p, content: t })}
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setVersionModalVisible(false)}>
                <AppText style={styles.cancelBtnText}>Cancel</AppText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveVersionDraft}>
                <AppText style={styles.saveBtnText}>Save Draft Version</AppText>
              </TouchableOpacity>
            </View>
          </Card>
        </View>
      </Modal>

      {/* Preview Modal */}
      <Modal visible={!!previewVersion} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <Card style={[styles.modalCard, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <AppText style={styles.modalTitle}>{previewVersion?.title}</AppText>
                <AppText style={styles.previewMeta}>
                  Version {previewVersion?.version} • Status: {previewVersion?.status?.toUpperCase()}
                </AppText>
              </View>
              <TouchableOpacity onPress={() => setPreviewVersion(null)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <AppText style={styles.previewContent}>{previewVersion?.content}</AppText>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.saveBtn} onPress={() => setPreviewVersion(null)}>
                <AppText style={styles.saveBtnText}>Close Preview</AppText>
              </TouchableOpacity>
            </View>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing[3],
    paddingVertical: 6,
  },
  backButtonText: {
    fontSize: Typography.size.sm,
    fontWeight: '700',
    color: '#0F172A',
  },
  topTabs: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: Spacing[2],
    marginBottom: Spacing[2],
  },
  topTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  topTabBtnActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  topTabBtnText: {
    fontSize: Typography.size.xs,
    fontWeight: '600',
    color: '#475569',
  },
  topTabBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  alertError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing[2],
    marginBottom: Spacing[2],
  },
  alertErrorText: {
    fontSize: Typography.size.xs,
    color: '#991B1B',
    flex: 1,
  },
  alertSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing[2],
    marginBottom: Spacing[2],
  },
  alertSuccessText: {
    fontSize: Typography.size.xs,
    color: '#166534',
    flex: 1,
  },
  contentWrap: {
    flex: 1,
  },
  subTabsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[2],
  },
  subTabsGroup: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: Radius.md,
    padding: 3,
    gap: 4,
  },
  subTabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  subTabBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  subTabBtnText: {
    fontSize: Typography.size.xs,
    fontWeight: '600',
    color: '#64748B',
  },
  subTabBtnTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.brand.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.md,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: Typography.size.xs,
    fontWeight: '700',
  },
  sectionScroll: {
    flex: 1,
  },
  itemsList: {
    gap: Spacing[2],
  },
  itemCard: {
    padding: Spacing[4],
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[2],
  },
  itemHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  slugText: {
    fontSize: Typography.size.xs,
    color: '#64748B',
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    padding: 4,
  },
  itemTitle: {
    fontSize: Typography.size.sm,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  itemBody: {
    fontSize: Typography.size.xs,
    color: '#475569',
    lineHeight: 18,
  },
  legalDocContainer: {
    gap: Spacing[4],
  },
  docOverviewCard: {
    padding: Spacing[4],
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  docOverviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[4],
  },
  docTitle: {
    fontSize: Typography.size.base,
    fontWeight: '800',
    color: '#0F172A',
  },
  docSub: {
    fontSize: Typography.size.xs,
    color: '#64748B',
    marginTop: 2,
  },
  activeVerBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: Radius.md,
    padding: Spacing[2],
  },
  activeVerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  activeVerBadge: {
    backgroundColor: Colors.brand.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  activeVerBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: Typography.size.xs,
  },
  activeVerTitle: {
    fontSize: Typography.size.xs,
    fontWeight: '700',
    color: '#065F46',
  },
  activeVerDate: {
    fontSize: 10,
    color: '#047857',
  },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  previewBtnText: {
    fontSize: Typography.size.xs,
    fontWeight: '700',
    color: Colors.brand.primary,
  },
  versionHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 4,
  },
  versionHistoryTitle: {
    fontSize: Typography.size.sm,
    fontWeight: '700',
    color: '#0F172A',
  },
  versionsList: {
    gap: Spacing[2],
  },
  verCard: {
    padding: Spacing[4],
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  verCardActive: {
    borderColor: Colors.brand.primary,
  },
  verCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[2],
  },
  verCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  verActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  verActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    backgroundColor: '#F1F5F9',
  },
  verActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0F172A',
  },
  publishBtn: {
    backgroundColor: Colors.brand.primary,
  },
  publishBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  verTitle: {
    fontSize: Typography.size.sm,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  verChangeSummary: {
    fontSize: Typography.size.xs,
    color: '#475569',
    marginBottom: 6,
  },
  verMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  verMetaText: {
    fontSize: 11,
    color: '#64748B',
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: Typography.size.xs,
    color: '#64748B',
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[4],
  },
  modalCard: {
    width: '100%',
    maxWidth: 600,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[3],
    paddingBottom: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: Typography.size.base,
    fontWeight: '800',
    color: '#0F172A',
  },
  previewMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  modalBody: {
    maxHeight: 460,
  },
  inputLabel: {
    fontSize: Typography.size.xs,
    fontWeight: '700',
    color: '#334155',
    marginTop: Spacing[3],
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    height: 40,
    fontSize: Typography.size.xs,
    color: '#0F172A',
  },
  textArea: {
    height: 90,
    textAlignVertical: 'top',
    paddingVertical: Spacing[2],
  },
  formRow: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  audienceRow: {
    flexDirection: 'row',
    gap: 6,
  },
  audienceBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  audienceBtnActive: {
    backgroundColor: '#0F172A',
  },
  audienceBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  audienceBtnTextActive: {
    color: '#FFFFFF',
  },
  categoryPicker: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  catPickBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: '#F1F5F9',
  },
  catPickBtnActive: {
    backgroundColor: Colors.brand.primary,
  },
  catPickBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  catPickBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing[3],
    paddingVertical: 4,
  },
  switchLabel: {
    fontSize: Typography.size.xs,
    fontWeight: '700',
    color: '#1E293B',
  },
  switchSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing[3],
    marginTop: Spacing[4],
    paddingTop: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: '#F1F5F9',
  },
  cancelBtnText: {
    fontSize: Typography.size.xs,
    fontWeight: '600',
    color: '#475569',
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.brand.primary,
  },
  saveBtnText: {
    fontSize: Typography.size.xs,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  previewContent: {
    fontSize: Typography.size.sm,
    color: '#1E293B',
    lineHeight: 22,
    fontFamily: Platform.select({ ios: 'System', default: 'sans-serif' }),
  },
});
