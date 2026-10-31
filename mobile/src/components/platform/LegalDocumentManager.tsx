/**
 * Aught2 Pickleball — Standardized Platform Admin Legal Document Manager
 *
 * Dedicated administrative interface for managing:
 * - Player Terms of Service (player_terms)
 * - Club Terms of Service (club_terms)
 * - Privacy Policy (privacy_policy)
 * - Club Agreement (club_agreement)
 *
 * Uses the shared Platform Admin legal design system:
 * - Standard LegalPageHeader with compact typography and back navigation
 * - Standard Active Published Version Card with preview & draft update actions
 * - Standard Draft Version Card (if draft exists) with edit & publish actions
 * - Standard Version History Card with immutable audit records
 * - Standard LegalDocumentEditorModal with markdown authoring & preview
 * - Standard LegalPublishConfirmModal and LegalPreviewModal
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  AlertCircle,
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
  Plus,
  RefreshCw,
  Send,
  Shield,
  X,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import {
  LegalDocumentDetailResponse,
  LegalDocumentVersionItem,
  platformLegalApi,
} from '@/services/api';

import {
  LegalAudienceBadge,
  LegalEmptyState,
  LegalPageHeader,
  LegalPreviewModal,
  LegalPublishConfirmModal,
  LegalStatusBadge,
} from './legal/LegalSharedComponents';
import {
  LegalDocumentEditorModal,
  LegalEditorFormData,
} from './legal/LegalDocumentEditorModal';
import { LegalVersionHistoryCard } from './legal/LegalVersionHistoryCard';

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
    title: 'Player Terms of Service',
    subtitle: 'Manage player terms, draft updates, version history, and acceptance requirements.',
    icon: FileText,
    defaultTitle: 'Player Terms of Service',
  },
  club_terms: {
    title: 'Club Terms of Service',
    subtitle: 'Manage club operating terms, version updates, and facility compliance.',
    icon: FileText,
    defaultTitle: 'Club & Facility Terms of Service',
  },
  privacy_policy: {
    title: 'Privacy Policy',
    subtitle: 'Manage platform privacy policy disclosures, updates, and user version tracking.',
    icon: Shield,
    defaultTitle: 'Platform Privacy Policy',
  },
  club_agreement: {
    title: 'Club Agreement',
    subtitle: 'Manage club registration agreements, acceptance requirements and agreement version history.',
    icon: FileCheck,
    defaultTitle: 'Club/Facility Operating Agreement',
  },
};

export function LegalDocumentManager({ documentType, onBack }: LegalDocumentManagerProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isNarrow = width < 480;

  const config = DOC_CONFIGS[documentType] || DOC_CONFIGS.player_terms;
  const IconComponent = config.icon;

  // Data states
  const [docDetail, setDocDetail] = useState<LegalDocumentDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Content reading toggle
  const [isContentExpanded, setIsContentExpanded] = useState(false);

  // Modals
  const [editorModalOpen, setEditorModalOpen] = useState(false);
  const [editorInitialData, setEditorInitialData] = useState<LegalEditorFormData>({
    version: '',
    title: '',
    content: '',
    requires_renewed_acceptance: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Publish Confirm Modal
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [versionToPublish, setVersionToPublish] = useState<LegalDocumentVersionItem | null>(null);

  // Preview Modal
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
        setError(`No document record found for "${config.title}".`);
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load document details');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [documentType, config.title]);

  useEffect(() => {
    loadDocument();
  }, [loadDocument]);

  // Derived versions
  const publishedVersion = docDetail?.current_version || null;
  const draftVersions = (docDetail?.versions || []).filter((v) => v.status === 'draft');
  const activeDraft = draftVersions.length > 0 ? draftVersions[0] : null;
  const allVersions = docDetail?.versions || [];

  // Open Draft Editor for New Version
  const handleOpenNewDraft = (baseVersion?: LegalDocumentVersionItem | null) => {
    clearAlerts();
    const nextVer = baseVersion
      ? `${(parseFloat(baseVersion.version) + 0.1).toFixed(1)}`
      : '1.0';

    setEditorInitialData({
      version: nextVer,
      title: baseVersion?.title || docDetail?.title || config.defaultTitle,
      content: baseVersion?.content || '',
      change_summary: '',
      requires_renewed_acceptance: false,
      effective_date: new Date().toISOString().split('T')[0],
    });
    setEditorModalOpen(true);
  };

  // Open Draft Editor for Existing Draft
  const handleEditDraft = (draft: LegalDocumentVersionItem) => {
    clearAlerts();
    setEditorInitialData({
      versionId: draft.id,
      version: draft.version,
      title: draft.title,
      content: draft.content,
      change_summary: draft.change_summary || '',
      requires_renewed_acceptance: Boolean(draft.requires_renewed_acceptance),
      effective_date: draft.effective_date ? draft.effective_date.split('T')[0] : '',
    });
    setEditorModalOpen(true);
  };

  // Save Draft Handler
  const handleSaveDraft = async (formData: LegalEditorFormData) => {
    if (!docDetail) return;
    setIsSubmitting(true);
    clearAlerts();
    try {
      if (formData.versionId) {
        // Update existing draft
        await platformLegalApi.updateVersion(formData.versionId, {
          title: formData.title.trim() || config.defaultTitle,
          content: formData.content.trim(),
          change_summary: formData.change_summary?.trim(),
          requires_renewed_acceptance: formData.requires_renewed_acceptance,
          effective_date: formData.effective_date
            ? new Date(formData.effective_date).toISOString()
            : undefined,
        });
        setSuccessMsg(`Draft version ${formData.version} updated successfully.`);
      } else {
        // Create new draft
        await platformLegalApi.createVersion(docDetail.id, {
          version: formData.version.trim(),
          title: formData.title.trim() || config.defaultTitle,
          content: formData.content.trim(),
          change_summary: formData.change_summary?.trim(),
          requires_renewed_acceptance: formData.requires_renewed_acceptance,
          effective_date: formData.effective_date
            ? new Date(formData.effective_date).toISOString()
            : undefined,
        });
        setSuccessMsg(`New draft version ${formData.version} created.`);
      }
      setEditorModalOpen(false);
      await loadDocument(true);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to save draft version');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Publish from Editor Handler
  const handlePublishFromEditor = async (formData: LegalEditorFormData) => {
    if (!docDetail) return;
    setIsSubmitting(true);
    clearAlerts();
    try {
      let versionId = formData.versionId;
      if (!versionId) {
        const created = await platformLegalApi.createVersion(docDetail.id, {
          version: formData.version.trim(),
          title: formData.title.trim() || config.defaultTitle,
          content: formData.content.trim(),
          change_summary: formData.change_summary?.trim(),
          requires_renewed_acceptance: formData.requires_renewed_acceptance,
        });
        versionId = created.id;
      }

      await platformLegalApi.publishVersion(versionId, {
        effective_date: new Date().toISOString(),
        requires_renewed_acceptance: formData.requires_renewed_acceptance,
        change_summary: formData.change_summary || undefined,
      });

      setSuccessMsg(`Version ${formData.version} published live successfully.`);
      setEditorModalOpen(false);
      await loadDocument(true);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to publish version');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirm Publish Handler
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
      {/* ─── Standard Shared Page Header ───────────────────────────────── */}
      <LegalPageHeader
        title={config.title}
        subtitle={config.subtitle}
        icon={IconComponent}
        onBack={handleBack}
        primaryAction={{
          label: 'Create New Version',
          icon: Plus,
          onPress: () => handleOpenNewDraft(publishedVersion),
        }}
        secondaryAction={{
          label: 'Refresh',
          icon: RefreshCw,
          onPress: () => loadDocument(true),
          disabled: isRefreshing,
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

      {/* ─── Main Content ──────────────────────────────────────────────── */}
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#15803D" />
          <AppText style={styles.loadingText}>Loading document information...</AppText>
        </View>
      ) : (
        <View style={styles.cardsStack}>
          {/* ─── 1. ACTIVE PUBLISHED VERSION CARD ──────────────────────────── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <LegalStatusBadge status="published" size="md" />
                {publishedVersion && (
                  <View style={styles.versionBadge}>
                    <AppText style={styles.versionBadgeText}>
                      Version {publishedVersion.version}
                    </AppText>
                  </View>
                )}
                {docDetail?.target_audience && (
                  <LegalAudienceBadge audience={docDetail.target_audience} />
                )}
              </View>

              {publishedVersion && (
                <View style={styles.cardHeaderActions}>
                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={() => setPreviewVersion(publishedVersion)}
                    activeOpacity={0.7}
                  >
                    <Eye size={13} color="#0F172A" />
                    <AppText style={styles.btnSecondaryText}>Preview</AppText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={() => handleOpenNewDraft(publishedVersion)}
                    activeOpacity={0.7}
                  >
                    <Copy size={13} color="#0F172A" />
                    <AppText style={styles.btnSecondaryText}>Draft Revision</AppText>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {publishedVersion ? (
              <>
                <AppText style={styles.docTitleText}>{publishedVersion.title}</AppText>

                {/* Metadata Details Row */}
                <View style={styles.metaDetailsGrid}>
                  <View style={styles.metaCell}>
                    <AppText style={styles.metaCellLabel}>Effective Date</AppText>
                    <AppText style={styles.metaCellValue}>
                      {publishedVersion.effective_date
                        ? new Date(publishedVersion.effective_date).toLocaleDateString()
                        : 'Immediate'}
                    </AppText>
                  </View>

                  <View style={styles.metaCell}>
                    <AppText style={styles.metaCellLabel}>Published On</AppText>
                    <AppText style={styles.metaCellValue}>
                      {publishedVersion.published_at
                        ? new Date(publishedVersion.published_at).toLocaleDateString()
                        : 'N/A'}
                    </AppText>
                  </View>

                  <View style={styles.metaCell}>
                    <AppText style={styles.metaCellLabel}>Renewed Acceptance</AppText>
                    <AppText style={styles.metaCellValue}>
                      {publishedVersion.requires_renewed_acceptance ? 'Enforced' : 'Standard'}
                    </AppText>
                  </View>
                </View>

                {/* Summary of Changes */}
                {publishedVersion.change_summary ? (
                  <View style={styles.summaryBox}>
                    <AppText style={styles.summaryBoxLabel}>Summary of Changes</AppText>
                    <AppText style={styles.summaryBoxText}>{publishedVersion.change_summary}</AppText>
                  </View>
                ) : null}

                {/* Content Preview with Expand Toggle */}
                <View style={styles.contentPreviewSection}>
                  <TouchableOpacity
                    style={styles.previewToggleRow}
                    onPress={() => setIsContentExpanded((p) => !p)}
                    activeOpacity={0.7}
                  >
                    <AppText style={styles.previewToggleTitle}>Document Content</AppText>
                    <View style={styles.previewToggleRight}>
                      <AppText style={styles.previewToggleActionText}>
                        {isContentExpanded ? 'Collapse' : 'Expand full text'}
                      </AppText>
                      {isContentExpanded ? (
                        <ChevronUp size={15} color="#64748B" />
                      ) : (
                        <ChevronDown size={15} color="#64748B" />
                      )}
                    </View>
                  </TouchableOpacity>

                  <View style={styles.contentTextBox}>
                    <AppText
                      style={styles.contentText}
                      numberOfLines={isContentExpanded ? undefined : 4}
                    >
                      {publishedVersion.content}
                    </AppText>
                  </View>
                </View>
              </>
            ) : (
              <LegalEmptyState
                icon={FileText}
                title="No Published Version"
                description="There is currently no active published version for this document. Create and publish a draft version to activate it."
                actionLabel="Create Initial Version"
                onAction={() => handleOpenNewDraft(null)}
              />
            )}
          </View>

          {/* ─── 2. PENDING DRAFT VERSION CARD (IF AVAILABLE) ──────────────── */}
          {activeDraft && (
            <View style={[styles.card, styles.draftCard]}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <LegalStatusBadge status="draft" size="md" />
                  <View style={styles.versionBadge}>
                    <AppText style={styles.versionBadgeText}>Version {activeDraft.version}</AppText>
                  </View>
                </View>

                <View style={styles.cardHeaderActions}>
                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={() => setPreviewVersion(activeDraft)}
                    activeOpacity={0.7}
                  >
                    <Eye size={13} color="#0F172A" />
                    <AppText style={styles.btnSecondaryText}>Preview Draft</AppText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={() => handleEditDraft(activeDraft)}
                    activeOpacity={0.7}
                  >
                    <Edit2 size={13} color="#0F172A" />
                    <AppText style={styles.btnSecondaryText}>Edit Draft</AppText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.btnPublishPrimary}
                    onPress={() => {
                      setVersionToPublish(activeDraft);
                      setPublishModalOpen(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <Send size={12} color="#FFFFFF" />
                    <AppText style={styles.btnPublishPrimaryText}>Publish</AppText>
                  </TouchableOpacity>
                </View>
              </View>

              <AppText style={styles.docTitleText}>{activeDraft.title}</AppText>

              <View style={styles.metaDetailsGrid}>
                <View style={styles.metaCell}>
                  <AppText style={styles.metaCellLabel}>Created Date</AppText>
                  <AppText style={styles.metaCellValue}>
                    {new Date(activeDraft.created_at).toLocaleDateString()}
                  </AppText>
                </View>

                <View style={styles.metaCell}>
                  <AppText style={styles.metaCellLabel}>Planned Effective Date</AppText>
                  <AppText style={styles.metaCellValue}>
                    {activeDraft.effective_date
                      ? new Date(activeDraft.effective_date).toLocaleDateString()
                      : 'Immediate'}
                  </AppText>
                </View>

                <View style={styles.metaCell}>
                  <AppText style={styles.metaCellLabel}>Renewed Acceptance</AppText>
                  <AppText style={styles.metaCellValue}>
                    {activeDraft.requires_renewed_acceptance ? 'Yes (Mandatory)' : 'No'}
                  </AppText>
                </View>
              </View>

              {activeDraft.change_summary ? (
                <View style={styles.summaryBox}>
                  <AppText style={styles.summaryBoxLabel}>Planned Changes</AppText>
                  <AppText style={styles.summaryBoxText}>{activeDraft.change_summary}</AppText>
                </View>
              ) : null}
            </View>
          )}

          {/* ─── 3. STANDARDIZED VERSION HISTORY ───────────────────────────── */}
          <LegalVersionHistoryCard
            versions={allVersions}
            onPreviewVersion={(ver) => setPreviewVersion(ver)}
            onEditDraft={(ver) => handleEditDraft(ver)}
            onPublishDraft={(ver) => {
              setVersionToPublish(ver);
              setPublishModalOpen(true);
            }}
          />
        </View>
      )}

      {/* ─── STANDARDIZED DRAFT EDITOR MODAL ─────────────────────────────── */}
      <LegalDocumentEditorModal
        visible={editorModalOpen}
        documentTypeLabel={config.title}
        initialData={editorInitialData}
        isSubmitting={isSubmitting}
        onClose={() => setEditorModalOpen(false)}
        onSaveDraft={handleSaveDraft}
        onPublishNow={handlePublishFromEditor}
      />

      {/* ─── STANDARDIZED PUBLISH CONFIRM MODAL ──────────────────────────── */}
      <LegalPublishConfirmModal
        visible={publishModalOpen}
        documentTitle={config.title}
        versionString={versionToPublish?.version || '1.0'}
        requiresRenewedAcceptance={Boolean(versionToPublish?.requires_renewed_acceptance)}
        isSubmitting={isSubmitting}
        onConfirm={handleConfirmPublish}
        onCancel={() => {
          setPublishModalOpen(false);
          setVersionToPublish(null);
        }}
      />

      {/* ─── STANDARDIZED PREVIEW MODAL ──────────────────────────────────── */}
      <LegalPreviewModal
        visible={Boolean(previewVersion)}
        title={`${previewVersion?.title || config.title} (v${previewVersion?.version || ''})`}
        subtitle={`Status: ${(previewVersion?.status || '').toUpperCase()} • Effective: ${
          previewVersion?.effective_date
            ? new Date(previewVersion.effective_date).toLocaleDateString()
            : 'Immediate'
        }`}
        content={previewVersion?.content}
        onClose={() => setPreviewVersion(null)}
      />
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
    paddingTop: 14,
    paddingBottom: 90,
    maxWidth: 960,
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

  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12.5,
    color: '#64748B',
  },

  // ─── Card Stack ───────────────────────────────────────────────────────────
  cardsStack: {
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    ...Platform.select({
      web: { boxShadow: '0 1px 2px rgba(0,0,0,0.03)' },
      default: { elevation: 1 },
    }),
  },
  draftCard: {
    borderColor: '#FCD34D',
    backgroundColor: '#FFFDF5',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  versionBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 5,
  },
  versionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  cardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 9,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  btnSecondaryText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  btnPublishPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#15803D',
  },
  btnPublishPrimaryText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  docTitleText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },

  // ─── Metadata Grid ────────────────────────────────────────────────────────
  metaDetailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  metaCell: {
    flex: 1,
    minWidth: 110,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 7,
    padding: 8,
  },
  metaCellLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
  },
  metaCellValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },

  summaryBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 7,
    padding: 9,
    marginBottom: 8,
  },
  summaryBoxLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 2,
  },
  summaryBoxText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 16,
  },

  // ─── Preview Section ──────────────────────────────────────────────────────
  contentPreviewSection: {
    marginTop: 4,
  },
  previewToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  previewToggleTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  previewToggleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  previewToggleActionText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#15803D',
  },
  contentTextBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 7,
    padding: 10,
    marginTop: 6,
  },
  contentText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 17,
  },
});
