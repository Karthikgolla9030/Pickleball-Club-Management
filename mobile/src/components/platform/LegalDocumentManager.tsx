/**
 * Aught2 Pickleball — Legal Document Management Component
 *
 * Dedicated administrative interface for managing a single legal document:
 * - Player Terms of Service (player_terms)
 * - Club Terms of Service (club_terms)
 * - Privacy Policy (privacy_policy)
 * - Club Agreement (club_agreement)
 *
 * Provides:
 * 1. Current published version with status, effective date, and change summary
 * 2. Pending draft version management (Edit, Preview, Publish)
 * 3. New version draft authoring with markdown editor & preview tabs
 * 4. Comprehensive immutable version history with archived versions
 * 5. Clean, professional Platform Admin layout without oversized pills or empty gaps
 */

import React, { useCallback, useEffect, useState } from 'react';
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
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Edit2,
  Eye,
  FileCheck,
  FileText,
  History,
  Lock,
  Plus,
  RefreshCw,
  Send,
  Shield,
  Upload,
  UserCheck,
  X,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import {
  LegalDocumentDetailResponse,
  LegalDocumentVersionItem,
  platformLegalApi,
} from '@/services/api';
import { Colors, Radius, Spacing, Typography } from '@/theme';

export type LegalDocType = 'player_terms' | 'club_terms' | 'privacy_policy' | 'club_agreement';

interface LegalDocumentManagerProps {
  documentType: LegalDocType;
  onBack?: () => void;
}

interface DocMetaConfig {
  title: string;
  subtitle: string;
  icon: any;
  defaultTitle: string;
}

const DOC_CONFIGS: Record<LegalDocType, DocMetaConfig> = {
  player_terms: {
    title: 'Player Terms of Service Management',
    subtitle: 'Manage player terms, draft updates, version history, and acceptance requirements.',
    icon: FileText,
    defaultTitle: 'Player Terms of Service',
  },
  club_terms: {
    title: 'Club Terms of Service Management',
    subtitle: 'Manage club operating terms, version updates, and facility compliance requirements.',
    icon: FileText,
    defaultTitle: 'Club & Facility Terms of Service',
  },
  privacy_policy: {
    title: 'Privacy Policy Management',
    subtitle: 'Manage platform privacy policy disclosures, updates, and user version tracking.',
    icon: Shield,
    defaultTitle: 'Platform Privacy Policy',
  },
  club_agreement: {
    title: 'Club Agreement Management',
    subtitle: 'Manage club registration agreements, acceptance requirements and agreement version history.',
    icon: FileCheck,
    defaultTitle: 'Club/Facility Operating Agreement',
  },
};

export function LegalDocumentManager({ documentType, onBack }: LegalDocumentManagerProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const config = DOC_CONFIGS[documentType] || DOC_CONFIGS.player_terms;
  const IconComponent = config.icon;

  // Data states
  const [docDetail, setDocDetail] = useState<LegalDocumentDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Content reading expand
  const [isContentExpanded, setIsContentExpanded] = useState(false);

  // Draft Editor Modal
  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<'write' | 'preview'>('write');
  const [editingVersion, setEditingVersion] = useState<{
    versionId?: string;
    version: string;
    title: string;
    content: string;
    change_summary?: string;
    requires_renewed_acceptance: boolean;
    effective_date?: string;
  }>({
    version: '',
    title: '',
    content: '',
    requires_renewed_acceptance: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Publish Confirmation Modal
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [versionToPublish, setVersionToPublish] = useState<LegalDocumentVersionItem | null>(null);

  // Full Preview Modal
  const [previewVersion, setPreviewVersion] = useState<LegalDocumentVersionItem | null>(null);

  const clearAlerts = () => {
    setError(null);
    setSuccessMsg(null);
  };

  const loadDocument = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);
    clearAlerts();

    try {
      // First attempt fast by-type lookup
      try {
        const detail = await platformLegalApi.getDocumentByType(documentType);
        if (detail && detail.id) {
          setDocDetail(detail);
          setIsLoading(false);
          setIsRefreshing(false);
          return;
        }
      } catch {
        // Fallback to list search
      }

      // Fallback: list all documents and find matching document_type
      const docs = await platformLegalApi.listDocuments();
      const match = docs.find((d) => d.document_type === documentType);
      if (match) {
        const detail = await platformLegalApi.getDocument(match.id);
        setDocDetail(detail);
      } else {
        setError(`No document found for type "${documentType}".`);
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load document details');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [documentType]);

  useEffect(() => {
    loadDocument();
  }, [loadDocument]);

  // Derived versions
  const publishedVersion = docDetail?.current_version || null;
  const draftVersions = (docDetail?.versions || []).filter((v) => v.status === 'draft');
  const activeDraft = draftVersions.length > 0 ? draftVersions[0] : null;
  const allVersions = docDetail?.versions || [];

  // Open Draft Editor
  const handleOpenNewDraft = (baseVersion?: LegalDocumentVersionItem | null) => {
    clearAlerts();
    const nextVer = baseVersion
      ? `${(parseFloat(baseVersion.version) + 0.1).toFixed(1)}`
      : '1.0';

    setEditingVersion({
      version: nextVer,
      title: baseVersion?.title || docDetail?.title || config.defaultTitle,
      content: baseVersion?.content || '',
      change_summary: '',
      requires_renewed_acceptance: false,
      effective_date: new Date().toISOString().split('T')[0],
    });
    setEditorTab('write');
    setDraftModalOpen(true);
  };

  const handleEditDraft = (draft: LegalDocumentVersionItem) => {
    clearAlerts();
    setEditingVersion({
      versionId: draft.id,
      version: draft.version,
      title: draft.title,
      content: draft.content,
      change_summary: draft.change_summary || '',
      requires_renewed_acceptance: Boolean(draft.requires_renewed_acceptance),
      effective_date: draft.effective_date ? draft.effective_date.split('T')[0] : '',
    });
    setEditorTab('write');
    setDraftModalOpen(true);
  };

  // Save Draft
  const handleSaveDraft = async () => {
    if (!editingVersion.version.trim()) {
      setError('Please provide a version identifier (e.g. 1.1).');
      return;
    }
    if (!editingVersion.content.trim()) {
      setError('Please provide document content.');
      return;
    }
    if (!docDetail) {
      setError('Document reference is missing.');
      return;
    }

    setIsSubmitting(true);
    clearAlerts();
    try {
      if (editingVersion.versionId) {
        // Update existing draft
        await platformLegalApi.updateVersion(editingVersion.versionId, {
          title: editingVersion.title.trim() || config.defaultTitle,
          content: editingVersion.content.trim(),
          change_summary: editingVersion.change_summary?.trim(),
          requires_renewed_acceptance: editingVersion.requires_renewed_acceptance,
          effective_date: editingVersion.effective_date
            ? new Date(editingVersion.effective_date).toISOString()
            : undefined,
        });
        setSuccessMsg(`Draft version ${editingVersion.version} updated successfully.`);
      } else {
        // Create new draft
        await platformLegalApi.createVersion(docDetail.id, {
          version: editingVersion.version.trim(),
          title: editingVersion.title.trim() || config.defaultTitle,
          content: editingVersion.content.trim(),
          change_summary: editingVersion.change_summary?.trim(),
          requires_renewed_acceptance: editingVersion.requires_renewed_acceptance,
          effective_date: editingVersion.effective_date
            ? new Date(editingVersion.effective_date).toISOString()
            : undefined,
        });
        setSuccessMsg(`New draft version ${editingVersion.version} created.`);
      }
      setDraftModalOpen(false);
      await loadDocument(true);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to save draft version');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Publish Version
  const handleConfirmPublish = async () => {
    if (!versionToPublish) return;
    setIsSubmitting(true);
    clearAlerts();
    try {
      await platformLegalApi.publishVersion(versionToPublish.id, {
        effective_date: new Date().toISOString(),
        requires_renewed_acceptance: versionToPublish.requires_renewed_acceptance,
        change_summary: versionToPublish.change_summary || undefined,
      });
      setSuccessMsg(
        `Version ${versionToPublish.version} has been published and is now the active official version.`
      );
      setPublishModalOpen(false);
      setVersionToPublish(null);
      await loadDocument(true);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to publish version');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.push('/platform/settings' as any);
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
          onPress={handleBack}
          activeOpacity={0.7}
        >
          <ArrowLeft size={16} color="#0F172A" strokeWidth={2.4} />
          <AppText style={styles.backLinkText}>Back to Settings</AppText>
        </TouchableOpacity>

        <View style={styles.headingRow}>
          <View style={styles.headingTextCol}>
            <View style={styles.titleWithIconRow}>
              <View style={styles.headerIconWrap}>
                <IconComponent size={20} color="#15803D" strokeWidth={2} />
              </View>
              <AppText style={styles.screenTitle}>{config.title}</AppText>
            </View>
            <AppText style={styles.screenSubtitle}>{config.subtitle}</AppText>
          </View>

          {/* Primary Action */}
          <View style={styles.topActionsRow}>
            <TouchableOpacity
              style={styles.refreshIconBtn}
              onPress={() => loadDocument(true)}
              disabled={isRefreshing}
            >
              <RefreshCw size={14} color="#475569" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.primaryActionBtn}
              onPress={() => handleOpenNewDraft(publishedVersion)}
              activeOpacity={0.8}
            >
              <Plus size={16} color="#FFFFFF" strokeWidth={2.5} />
              <AppText style={styles.primaryActionBtnText}>New Version Draft</AppText>
            </TouchableOpacity>
          </View>
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

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#15803D" />
          <AppText style={styles.loadingText}>Loading document information...</AppText>
        </View>
      ) : (
        <View style={styles.cardsStack}>
          {/* ─── 1. ACTIVE PUBLISHED VERSION CARD ──────────────────────────── */}
          <View style={styles.mainCard}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderLeft}>
                <View style={styles.statusBadgeGreen}>
                  <CheckCircle2 size={13} color="#15803D" strokeWidth={2.5} />
                  <AppText style={styles.statusBadgeTextGreen}>Active & Published</AppText>
                </View>
                {publishedVersion ? (
                  <View style={styles.versionBadge}>
                    <AppText style={styles.versionBadgeText}>Version {publishedVersion.version}</AppText>
                  </View>
                ) : null}
              </View>

              {publishedVersion && (
                <View style={styles.cardHeaderActions}>
                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={() => setPreviewVersion(publishedVersion)}
                  >
                    <Eye size={14} color="#0F172A" />
                    <AppText style={styles.btnSecondaryText}>Preview</AppText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={() => handleOpenNewDraft(publishedVersion)}
                  >
                    <Copy size={14} color="#0F172A" />
                    <AppText style={styles.btnSecondaryText}>Draft Update</AppText>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {publishedVersion ? (
              <View style={styles.docMetaGrid}>
                <View style={styles.metaItem}>
                  <AppText style={styles.metaLabel}>Document Title</AppText>
                  <AppText style={styles.metaValue}>{publishedVersion.title}</AppText>
                </View>

                <View style={styles.metaItem}>
                  <AppText style={styles.metaLabel}>Effective Date</AppText>
                  <AppText style={styles.metaValue}>
                    {publishedVersion.effective_date
                      ? new Date(publishedVersion.effective_date).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      : 'Immediate'}
                  </AppText>
                </View>

                <View style={styles.metaItem}>
                  <AppText style={styles.metaLabel}>Published On</AppText>
                  <AppText style={styles.metaValue}>
                    {publishedVersion.published_at
                      ? new Date(publishedVersion.published_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      : 'N/A'}
                  </AppText>
                </View>

                <View style={styles.metaItem}>
                  <AppText style={styles.metaLabel}>Renewed Acceptance</AppText>
                  <AppText style={styles.metaValue}>
                    {publishedVersion.requires_renewed_acceptance ? 'Enforced' : 'Standard'}
                  </AppText>
                </View>

                {publishedVersion.change_summary ? (
                  <View style={[styles.metaItem, styles.metaItemFull]}>
                    <AppText style={styles.metaLabel}>Summary of Changes</AppText>
                    <AppText style={styles.metaValueDesc}>{publishedVersion.change_summary}</AppText>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={styles.emptyCardInner}>
                <AppText style={styles.emptyTitle}>No Published Version</AppText>
                <AppText style={styles.emptyDesc}>
                  There is currently no published version for this document. Create and publish a draft version to activate it.
                </AppText>
                <TouchableOpacity
                  style={styles.emptyActionBtn}
                  onPress={() => handleOpenNewDraft(null)}
                >
                  <Plus size={14} color="#15803D" />
                  <AppText style={styles.emptyActionText}>Create Initial Version</AppText>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ─── 2. PENDING DRAFT VERSION CARD (IF EXISTS) ────────────────── */}
          {activeDraft && (
            <View style={[styles.mainCard, styles.draftCardBorder]}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardHeaderLeft}>
                  <View style={styles.statusBadgeAmber}>
                    <Clock size={13} color="#D97706" strokeWidth={2.5} />
                    <AppText style={styles.statusBadgeTextAmber}>Draft (Unpublished)</AppText>
                  </View>
                  <View style={styles.versionBadge}>
                    <AppText style={styles.versionBadgeText}>Version {activeDraft.version}</AppText>
                  </View>
                </View>

                <View style={styles.cardHeaderActions}>
                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={() => setPreviewVersion(activeDraft)}
                  >
                    <Eye size={14} color="#0F172A" />
                    <AppText style={styles.btnSecondaryText}>Preview Draft</AppText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={() => handleEditDraft(activeDraft)}
                  >
                    <Edit2 size={14} color="#0F172A" />
                    <AppText style={styles.btnSecondaryText}>Edit</AppText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.publishBtnSmall}
                    onPress={() => {
                      setVersionToPublish(activeDraft);
                      setPublishModalOpen(true);
                    }}
                  >
                    <Send size={13} color="#FFFFFF" />
                    <AppText style={styles.publishBtnSmallText}>Publish</AppText>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.docMetaGrid}>
                <View style={styles.metaItem}>
                  <AppText style={styles.metaLabel}>Draft Title</AppText>
                  <AppText style={styles.metaValue}>{activeDraft.title}</AppText>
                </View>

                <View style={styles.metaItem}>
                  <AppText style={styles.metaLabel}>Created Date</AppText>
                  <AppText style={styles.metaValue}>
                    {new Date(activeDraft.created_at).toLocaleDateString()}
                  </AppText>
                </View>

                <View style={styles.metaItem}>
                  <AppText style={styles.metaLabel}>Renewed Acceptance</AppText>
                  <AppText style={styles.metaValue}>
                    {activeDraft.requires_renewed_acceptance ? 'Yes (Mandatory)' : 'No'}
                  </AppText>
                </View>

                {activeDraft.change_summary ? (
                  <View style={[styles.metaItem, styles.metaItemFull]}>
                    <AppText style={styles.metaLabel}>Planned Change Summary</AppText>
                    <AppText style={styles.metaValueDesc}>{activeDraft.change_summary}</AppText>
                  </View>
                ) : null}
              </View>
            </View>
          )}

          {/* ─── 3. LIVE DOCUMENT READING VIEW ────────────────────────────── */}
          {publishedVersion && (
            <View style={styles.mainCard}>
              <TouchableOpacity
                style={styles.readingHeaderRow}
                onPress={() => setIsContentExpanded((prev) => !prev)}
                activeOpacity={0.7}
              >
                <View style={styles.readingHeaderLeft}>
                  <FileText size={16} color="#15803D" />
                  <AppText style={styles.readingHeaderTitle}>
                    Current Document Content ({publishedVersion.version})
                  </AppText>
                </View>
                <View style={styles.readingHeaderRight}>
                  <AppText style={styles.readingHeaderToggleText}>
                    {isContentExpanded ? 'Collapse' : 'Expand full text'}
                  </AppText>
                  {isContentExpanded ? (
                    <ChevronUp size={16} color="#64748B" />
                  ) : (
                    <ChevronDown size={16} color="#64748B" />
                  )}
                </View>
              </TouchableOpacity>

              <View style={styles.readerContentWrap}>
                <AppText
                  style={styles.readerText}
                  numberOfLines={isContentExpanded ? undefined : 6}
                >
                  {publishedVersion.content}
                </AppText>
              </View>
            </View>
          )}

          {/* ─── 4. IMMUTABLE VERSION HISTORY ─────────────────────────────── */}
          <View style={styles.mainCard}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderLeft}>
                <History size={16} color="#0F172A" />
                <AppText style={styles.sectionTitle}>Version History</AppText>
                <View style={styles.countBadge}>
                  <AppText style={styles.countBadgeText}>{allVersions.length}</AppText>
                </View>
              </View>
            </View>

            {allVersions.length === 0 ? (
              <AppText style={styles.emptyNote}>No historical versions on record.</AppText>
            ) : (
              <View style={styles.versionList}>
                {allVersions.map((ver, idx) => {
                  const isPublished = ver.status === 'published';
                  const isDraft = ver.status === 'draft';
                  return (
                    <View
                      key={ver.id}
                      style={[
                        styles.versionRow,
                        idx === allVersions.length - 1 && styles.versionRowLast,
                      ]}
                    >
                      <View style={styles.versionRowLeft}>
                        <View style={styles.versionPillBadge}>
                          <AppText style={styles.versionPillText}>v{ver.version}</AppText>
                        </View>

                        <View
                          style={[
                            styles.statusBadgeSmall,
                            isPublished
                              ? styles.statusBadgeGreen
                              : isDraft
                              ? styles.statusBadgeAmber
                              : styles.statusBadgeNeutral,
                          ]}
                        >
                          <AppText
                            style={[
                              styles.statusBadgeSmallText,
                              isPublished
                                ? styles.statusBadgeTextGreen
                                : isDraft
                                ? styles.statusBadgeTextAmber
                                : styles.statusBadgeTextNeutral,
                            ]}
                          >
                            {ver.status ? ver.status.toUpperCase() : 'UNKNOWN'}
                          </AppText>
                        </View>

                        <View style={styles.versionMetaCol}>
                          <AppText style={styles.versionTitleText}>{ver.title}</AppText>
                          <View style={styles.versionDatesRow}>
                            <AppText style={styles.versionDateText}>
                              {ver.effective_date
                                ? `Effective: ${new Date(ver.effective_date).toLocaleDateString()}`
                                : `Created: ${new Date(ver.created_at).toLocaleDateString()}`}
                            </AppText>
                            {ver.requires_renewed_acceptance && (
                              <AppText style={styles.versionRenewalText}>• Re-acceptance</AppText>
                            )}
                          </View>
                          {ver.change_summary ? (
                            <AppText style={styles.versionSummaryText}>
                              {ver.change_summary}
                            </AppText>
                          ) : null}
                        </View>
                      </View>

                      {/* Row Actions */}
                      <View style={styles.versionRowActions}>
                        <TouchableOpacity
                          style={styles.iconActionBtn}
                          onPress={() => setPreviewVersion(ver)}
                          accessibilityLabel="Preview this version"
                        >
                          <Eye size={14} color="#0F172A" />
                        </TouchableOpacity>

                        {isDraft && (
                          <>
                            <TouchableOpacity
                              style={styles.iconActionBtn}
                              onPress={() => handleEditDraft(ver)}
                              accessibilityLabel="Edit draft"
                            >
                              <Edit2 size={14} color="#0F172A" />
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.publishBtnTiny}
                              onPress={() => {
                                setVersionToPublish(ver);
                                setPublishModalOpen(true);
                              }}
                              accessibilityLabel="Publish version"
                            >
                              <Send size={12} color="#FFFFFF" />
                              <AppText style={styles.publishBtnTinyText}>Publish</AppText>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      )}

      {/* ─── MODAL: DRAFT EDITOR ──────────────────────────────────────────── */}
      <Modal visible={draftModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.modalCardLarge]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleCol}>
                <AppText style={styles.modalTitle}>
                  {editingVersion.versionId ? `Edit Draft (${editingVersion.version})` : 'New Version Draft'}
                </AppText>
                <AppText style={styles.modalSubtitle}>
                  Draft new terms or revisions without affecting current active users.
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => setDraftModalOpen(false)}
                style={styles.modalCloseBtn}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollBody} showsVerticalScrollIndicator={false}>
              <View style={styles.formRowTwoCol}>
                <View style={[styles.formField, { flex: 1 }]}>
                  <AppText style={styles.fieldLabel}>Version Identifier *</AppText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. 1.1 or 2.0"
                    placeholderTextColor="#94A3B8"
                    value={editingVersion.version}
                    onChangeText={(t) => setEditingVersion((prev) => ({ ...prev, version: t }))}
                  />
                </View>

                <View style={[styles.formField, { flex: 2 }]}>
                  <AppText style={styles.fieldLabel}>Document Title *</AppText>
                  <TextInput
                    style={styles.textInput}
                    placeholder={config.defaultTitle}
                    placeholderTextColor="#94A3B8"
                    value={editingVersion.title}
                    onChangeText={(t) => setEditingVersion((prev) => ({ ...prev, title: t }))}
                  />
                </View>
              </View>

              <View style={styles.formField}>
                <AppText style={styles.fieldLabel}>Summary of Changes</AppText>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Updated dispute resolution policy and court refund windows"
                  placeholderTextColor="#94A3B8"
                  value={editingVersion.change_summary ?? ''}
                  onChangeText={(t) => setEditingVersion((prev) => ({ ...prev, change_summary: t }))}
                />
              </View>

              {/* Renewed Acceptance Switch */}
              <View style={styles.switchRow}>
                <View style={styles.switchTextCol}>
                  <AppText style={styles.switchTitle}>Require Renewed User Acceptance</AppText>
                  <AppText style={styles.switchDesc}>
                    When published, users will be required to review and accept this version before accessing the platform.
                  </AppText>
                </View>
                <Switch
                  value={editingVersion.requires_renewed_acceptance}
                  onValueChange={(v) =>
                    setEditingVersion((prev) => ({ ...prev, requires_renewed_acceptance: v }))
                  }
                  trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                  thumbColor={editingVersion.requires_renewed_acceptance ? '#15803D' : '#F1F5F9'}
                />
              </View>

              {/* Editor Tabs: Write / Preview */}
              <View style={styles.editorTabsRow}>
                <View style={styles.editorTabButtons}>
                  <TouchableOpacity
                    style={[styles.editorTabBtn, editorTab === 'write' && styles.editorTabBtnActive]}
                    onPress={() => setEditorTab('write')}
                  >
                    <AppText
                      style={[styles.editorTabText, editorTab === 'write' && styles.editorTabTextActive]}
                    >
                      Write Content
                    </AppText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.editorTabBtn, editorTab === 'preview' && styles.editorTabBtnActive]}
                    onPress={() => setEditorTab('preview')}
                  >
                    <AppText
                      style={[styles.editorTabText, editorTab === 'preview' && styles.editorTabTextActive]}
                    >
                      Formatted Preview
                    </AppText>
                  </TouchableOpacity>
                </View>
              </View>

              {editorTab === 'write' ? (
                <View style={styles.formField}>
                  <TextInput
                    style={[styles.textInput, styles.textAreaLarge]}
                    placeholder="Enter full legal document text..."
                    placeholderTextColor="#94A3B8"
                    value={editingVersion.content}
                    onChangeText={(t) => setEditingVersion((prev) => ({ ...prev, content: t }))}
                    multiline
                  />
                </View>
              ) : (
                <View style={styles.articlePreviewBox}>
                  <AppText style={styles.previewTitle}>{editingVersion.title || config.defaultTitle}</AppText>
                  <AppText style={styles.previewContent}>
                    {editingVersion.content || 'No content entered yet.'}
                  </AppText>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setDraftModalOpen(false)}
              >
                <AppText style={styles.modalCancelText}>Cancel</AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleSaveDraft}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <AppText style={styles.modalSubmitText}>Save Draft</AppText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL: CONFIRM PUBLISH ───────────────────────────────────────── */}
      <Modal visible={publishModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleCol}>
                <AppText style={styles.modalTitle}>Publish Version {versionToPublish?.version}</AppText>
                <AppText style={styles.modalSubtitle}>
                  This will make this version immediately active platform-wide.
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setPublishModalOpen(false);
                  setVersionToPublish(null);
                }}
                style={styles.modalCloseBtn}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.publishModalBody}>
              <View style={styles.warningNotice}>
                <AlertTriangle size={18} color="#D97706" />
                <AppText style={styles.warningNoticeText}>
                  Publishing Version {versionToPublish?.version} will automatically archive the current active version.
                  {versionToPublish?.requires_renewed_acceptance
                    ? ' Users will be prompted to re-accept these terms next time they use the application.'
                    : ' This update does not require mandatory re-acceptance.'}
                </AppText>
              </View>

              <View style={styles.confirmDetailsBlock}>
                <AppText style={styles.confirmDetailLabel}>Document:</AppText>
                <AppText style={styles.confirmDetailValue}>{config.title}</AppText>
              </View>

              <View style={styles.confirmDetailsBlock}>
                <AppText style={styles.confirmDetailLabel}>Version:</AppText>
                <AppText style={styles.confirmDetailValue}>v{versionToPublish?.version}</AppText>
              </View>

              <View style={styles.confirmDetailsBlock}>
                <AppText style={styles.confirmDetailLabel}>Effective Date:</AppText>
                <AppText style={styles.confirmDetailValue}>Immediate (Today)</AppText>
              </View>
            </View>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setPublishModalOpen(false);
                  setVersionToPublish(null);
                }}
              >
                <AppText style={styles.modalCancelText}>Cancel</AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSubmitBtn, styles.modalPublishBtn]}
                onPress={handleConfirmPublish}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <AppText style={styles.modalSubmitText}>Confirm & Publish Live</AppText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── MODAL: DOCUMENT PREVIEW VIEWER ───────────────────────────────── */}
      <Modal visible={Boolean(previewVersion)} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.modalCardLarge]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleCol}>
                <AppText style={styles.modalTitle}>
                  {previewVersion?.title} (v{previewVersion?.version})
                </AppText>
                <AppText style={styles.modalSubtitle}>
                  Status: {previewVersion?.status ? previewVersion.status.toUpperCase() : 'UNKNOWN'} • Effective: {previewVersion?.effective_date ? new Date(previewVersion.effective_date).toLocaleDateString() : 'N/A'}
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => setPreviewVersion(null)}
                style={styles.modalCloseBtn}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollBody} showsVerticalScrollIndicator={false}>
              <View style={styles.articlePreviewBox}>
                <AppText style={styles.previewContent}>{previewVersion?.content}</AppText>
              </View>
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={() => setPreviewVersion(null)}
              >
                <AppText style={styles.modalSubmitText}>Close Preview</AppText>
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

  // ─── Header ───────────────────────────────────────────────────────────────
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
  titleWithIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 7,
    backgroundColor: '#EAF8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  screenSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 18,
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refreshIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
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

  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },

  // ─── Cards ────────────────────────────────────────────────────────────────
  cardsStack: {
    gap: 14,
  },
  mainCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(0,0,0,0.03)' },
    }),
  },
  draftCardBorder: {
    borderColor: '#FCD34D',
    backgroundColor: '#FFFDF5',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusBadgeGreen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeTextGreen: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#15803D',
  },
  statusBadgeAmber: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeTextAmber: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#D97706',
  },
  statusBadgeNeutral: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  statusBadgeTextNeutral: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  versionBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  versionBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
  },
  btnSecondaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  publishBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#15803D',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 7,
  },
  publishBtnSmallText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ─── Metadata Grid ────────────────────────────────────────────────────────
  docMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaItem: {
    minWidth: 140,
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 8,
    padding: 10,
  },
  metaItemFull: {
    minWidth: '100%',
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  metaValueDesc: {
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 18,
    marginTop: 2,
  },

  // ─── Reading View ─────────────────────────────────────────────────────────
  readingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  readingHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  readingHeaderTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  readingHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  readingHeaderToggleText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  readerContentWrap: {
    marginTop: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 12,
  },
  readerText: {
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 19,
  },

  // ─── Version History Section ──────────────────────────────────────────────
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  countBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 10,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  emptyNote: {
    fontSize: 12.5,
    color: '#94A3B8',
    paddingVertical: 10,
  },
  versionList: {
    gap: 0,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 10,
  },
  versionRowLast: {
    borderBottomWidth: 0,
  },
  versionRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  versionPillBadge: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  versionPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statusBadgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeSmallText: {
    fontSize: 10,
    fontWeight: '700',
  },
  versionMetaCol: {
    flex: 1,
  },
  versionTitleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  versionDatesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  versionDateText: {
    fontSize: 11,
    color: '#64748B',
  },
  versionRenewalText: {
    fontSize: 11,
    color: '#D97706',
    fontWeight: '600',
  },
  versionSummaryText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  versionRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishBtnTiny: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#15803D',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  publishBtnTinyText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ─── Empty Card Inner ─────────────────────────────────────────────────────
  emptyCardInner: {
    padding: 24,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptyDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 17,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: '#EAF8F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  emptyActionText: {
    fontSize: 12,
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
    maxWidth: 760,
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
  formRowTwoCol: {
    flexDirection: 'row',
    gap: 12,
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
  textAreaLarge: {
    height: 240,
    paddingTop: 10,
    textAlignVertical: 'top',
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
    fontSize: 12.5,
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
    lineHeight: 16,
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
    minHeight: 140,
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
  modalPublishBtn: {
    backgroundColor: '#15803D',
  },
  modalSubmitText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ─── Publish Modal Body ───────────────────────────────────────────────────
  publishModalBody: {
    padding: 16,
    gap: 10,
  },
  warningNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    padding: 12,
    borderRadius: 8,
    marginBottom: 6,
  },
  warningNoticeText: {
    flex: 1,
    fontSize: 12.5,
    color: '#92400E',
    lineHeight: 18,
  },
  confirmDetailsBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  confirmDetailLabel: {
    fontSize: 12.5,
    color: '#64748B',
  },
  confirmDetailValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
});

