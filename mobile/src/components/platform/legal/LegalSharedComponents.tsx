/**
 * Aught2 Pickleball — Platform Admin Legal & Help Shared UI Components
 *
 * Unified design system components shared across all five legal & help management pages:
 * 1. LegalPageHeader: Unobtrusive back-to-settings link, compact heading, subtitle, and primary/secondary action buttons.
 * 2. LegalStatusBadge: Standardized status pills for Published, Draft, Archived, and Active states.
 * 3. LegalAudienceBadge: Clean pills for Player, Club, and All-Audience tags.
 * 4. LegalFilterToolbar: Responsive search bar with clear button, audience filters, status filters, and refresh button.
 * 5. LegalRecordCard: Standardized list card with clear three-level hierarchy (header, preview, footer actions).
 * 6. LegalEmptyState: Consistent empty-state indicator with icon, title, description, and action button.
 * 7. LegalPreviewModal: Full reading modal for articles and legal documents.
 * 8. LegalPublishConfirmModal: Confirmation modal prior to releasing terms/policy updates live.
 */

import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Eye,
  FileText,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Send,
  X,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Colors, Radius, Spacing, Typography } from '@/theme';

// ─── 1. PAGE HEADER ──────────────────────────────────────────────────────────

export interface LegalPageHeaderProps {
  title: string;
  subtitle: string;
  icon?: any;
  onBack: () => void;
  primaryAction?: {
    label: string;
    icon?: any;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
  };
  secondaryAction?: {
    label: string;
    icon?: any;
    onPress: () => void;
    disabled?: boolean;
  };
}

export function LegalPageHeader({
  title,
  subtitle,
  icon: HeaderIcon,
  onBack,
  primaryAction,
  secondaryAction,
}: LegalPageHeaderProps) {
  return (
    <View style={styles.headerContainer}>
      {/* Back to Settings Link */}
      <TouchableOpacity
        style={styles.backButtonRow}
        onPress={onBack}
        activeOpacity={0.7}
        accessibilityLabel="Back to Settings"
      >
        <ArrowLeft size={14} color="#0F172A" strokeWidth={2.4} />
        <AppText style={styles.backButtonText}>Back to Settings</AppText>
      </TouchableOpacity>

      {/* Main Header Content */}
      <View style={styles.headerContentRow}>
        <View style={styles.headerTextGroup}>
          <View style={styles.titleRow}>
            {HeaderIcon && (
              <View style={styles.headerIconTile}>
                <HeaderIcon size={16} color="#15803D" strokeWidth={2.2} />
              </View>
            )}
            <AppText style={styles.headerTitle} numberOfLines={2}>
              {title}
            </AppText>
          </View>
          <AppText style={styles.headerSubtitle}>{subtitle}</AppText>
        </View>

        {/* Action Buttons Group */}
        {(primaryAction || secondaryAction) && (
          <View style={styles.headerActionsGroup}>
            {secondaryAction && (
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={secondaryAction.onPress}
                disabled={secondaryAction.disabled}
                activeOpacity={0.7}
                accessibilityLabel={secondaryAction.label}
              >
                {secondaryAction.icon && (
                  <secondaryAction.icon size={13} color="#0F172A" strokeWidth={2} />
                )}
                <AppText style={styles.btnSecondaryText}>{secondaryAction.label}</AppText>
              </TouchableOpacity>
            )}

            {primaryAction && (
              <TouchableOpacity
                style={[
                  styles.btnPrimary,
                  primaryAction.disabled && styles.btnDisabled,
                ]}
                onPress={primaryAction.onPress}
                disabled={primaryAction.disabled || primaryAction.loading}
                activeOpacity={0.8}
                accessibilityLabel={primaryAction.label}
              >
                {primaryAction.loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    {primaryAction.icon ? (
                      <primaryAction.icon size={14} color="#FFFFFF" strokeWidth={2.4} />
                    ) : (
                      <Plus size={14} color="#FFFFFF" strokeWidth={2.4} />
                    )}
                    <AppText style={styles.btnPrimaryText}>{primaryAction.label}</AppText>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── 2. STATUS BADGE ─────────────────────────────────────────────────────────

export interface LegalStatusBadgeProps {
  status: 'published' | 'draft' | 'archived' | 'active' | string;
  size?: 'sm' | 'md';
}

export function LegalStatusBadge({ status, size = 'sm' }: LegalStatusBadgeProps) {
  const norm = (status || '').toLowerCase().trim();
  const isPublished = norm === 'published' || norm === 'active';
  const isDraft = norm === 'draft';

  return (
    <View
      style={[
        styles.badgeBase,
        size === 'md' && styles.badgeMedium,
        isPublished
          ? styles.badgePublished
          : isDraft
          ? styles.badgeDraft
          : styles.badgeArchived,
      ]}
    >
      {isPublished ? (
        <CheckCircle2 size={size === 'md' ? 12 : 10} color="#15803D" strokeWidth={2.4} />
      ) : isDraft ? (
        <Clock size={size === 'md' ? 12 : 10} color="#D97706" strokeWidth={2.4} />
      ) : null}
      <AppText
        style={[
          styles.badgeText,
          size === 'md' && styles.badgeTextMedium,
          isPublished
            ? styles.badgeTextPublished
            : isDraft
            ? styles.badgeTextDraft
            : styles.badgeTextArchived,
        ]}
      >
        {isPublished ? 'Published' : isDraft ? 'Draft' : 'Archived'}
      </AppText>
    </View>
  );
}

// ─── 3. AUDIENCE BADGE ───────────────────────────────────────────────────────

export function LegalAudienceBadge({ audience }: { audience?: string }) {
  const norm = (audience || 'all').toLowerCase().trim();
  const label =
    norm === 'player'
      ? 'Players'
      : norm === 'club'
      ? 'Clubs'
      : 'All Users';

  return (
    <View style={styles.audienceBadge}>
      <AppText style={styles.audienceBadgeText}>{label}</AppText>
    </View>
  );
}

// ─── 4. FILTER TOOLBAR ───────────────────────────────────────────────────────

export interface LegalFilterToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchPlaceholder?: string;
  audienceFilter?: 'all' | 'player' | 'club';
  onAudienceChange?: (aud: 'all' | 'player' | 'club') => void;
  statusFilter?: 'all' | 'published' | 'draft';
  onStatusChange?: (st: 'all' | 'published' | 'draft') => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function LegalFilterToolbar({
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search records...',
  audienceFilter,
  onAudienceChange,
  statusFilter,
  onStatusChange,
  onRefresh,
  isRefreshing = false,
}: LegalFilterToolbarProps) {
  return (
    <View style={styles.toolbarContainer}>
      {/* Search Input Row with optional refresh */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Search size={14} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder={searchPlaceholder}
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={onSearchChange}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => onSearchChange('')} style={styles.searchClearBtn}>
              <X size={13} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {onRefresh && (
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={onRefresh}
            disabled={isRefreshing}
            activeOpacity={0.7}
            accessibilityLabel="Refresh records"
          >
            <RefreshCw
              size={13}
              color="#475569"
              style={isRefreshing ? styles.spinningIcon : undefined}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Pills Row */}
      {(onAudienceChange || onStatusChange) && (
        <View style={styles.filterPillsRow}>
          {/* Audience Filter Pills */}
          {onAudienceChange && (
            <View style={styles.pillsGroup}>
              {(['all', 'player', 'club'] as const).map((aud) => {
                const isSel = (audienceFilter || 'all') === aud;
                return (
                  <TouchableOpacity
                    key={aud}
                    style={[styles.pillBtn, isSel && styles.pillBtnActive]}
                    onPress={() => onAudienceChange(aud)}
                    activeOpacity={0.7}
                  >
                    <AppText style={[styles.pillBtnText, isSel && styles.pillBtnTextActive]}>
                      {aud === 'all' ? 'All' : aud === 'player' ? 'Players' : 'Clubs'}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Status Filter Pills */}
          {onStatusChange && (
            <View style={styles.pillsGroup}>
              {(['all', 'published', 'draft'] as const).map((st) => {
                const isSel = (statusFilter || 'all') === st;
                return (
                  <TouchableOpacity
                    key={st}
                    style={[styles.pillBtn, isSel && styles.pillBtnActive]}
                    onPress={() => onStatusChange(st)}
                    activeOpacity={0.7}
                  >
                    <AppText style={[styles.pillBtnText, isSel && styles.pillBtnTextActive]}>
                      {st === 'all' ? 'All Status' : st === 'published' ? 'Published' : 'Draft'}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── 5. STANDARDIZED RECORD CARD ─────────────────────────────────────────────

export interface CardActionItem {
  label: string;
  icon?: any;
  onPress: () => void;
  variant?: 'default' | 'primary' | 'danger';
}

export interface LegalRecordCardProps {
  title: string;
  status?: string;
  categoryName?: string | null;
  audience?: string;
  excerpt?: string;
  metaInfo?: string;
  actions: CardActionItem[];
  onPressTitle?: () => void;
  isExpanded?: boolean;
}

export function LegalRecordCard({
  title,
  status,
  categoryName,
  audience,
  excerpt,
  metaInfo,
  actions,
  onPressTitle,
  isExpanded,
}: LegalRecordCardProps) {
  return (
    <View style={styles.recordCard}>
      {/* 1. Header Metadata Row */}
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardBadgesGroup}>
          {status && <LegalStatusBadge status={status} size="sm" />}
          {categoryName && (
            <View style={styles.categoryChip}>
              <AppText style={styles.categoryChipText}>{categoryName}</AppText>
            </View>
          )}
          {audience && <LegalAudienceBadge audience={audience} />}
        </View>

        {metaInfo && (
          <View style={styles.cardMetaWrap}>
            <AppText style={styles.cardMetaText}>{metaInfo}</AppText>
          </View>
        )}
      </View>

      {/* 2. Title / Question */}
      {onPressTitle ? (
        <TouchableOpacity
          onPress={onPressTitle}
          activeOpacity={0.7}
          style={styles.cardTitleWrap}
        >
          <AppText style={styles.cardTitleText}>{title}</AppText>
        </TouchableOpacity>
      ) : (
        <View style={styles.cardTitleWrap}>
          <AppText style={styles.cardTitleText}>{title}</AppText>
        </View>
      )}

      {/* 3. Content Excerpt */}
      {excerpt ? (
        <AppText
          style={styles.cardExcerptText}
          numberOfLines={isExpanded ? undefined : 2}
        >
          {excerpt}
        </AppText>
      ) : null}

      {/* 4. Footer Actions Row */}
      <View style={styles.cardFooterActionsRow}>
        {onPressTitle ? (
          <TouchableOpacity
            style={styles.cardExpandToggleBtn}
            onPress={onPressTitle}
            activeOpacity={0.7}
          >
            <Eye size={12} color="#15803D" strokeWidth={2} />
            <AppText style={styles.cardExpandToggleText}>
              {isExpanded ? 'Collapse' : 'View Content'}
            </AppText>
          </TouchableOpacity>
        ) : (
          <View />
        )}

        <View style={styles.cardActionButtonsRow}>
          {actions.map((act, idx) => {
            const IconC = act.icon;
            const isDanger = act.variant === 'danger';
            const isPrimary = act.variant === 'primary';
            return (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.cardActionBtn,
                  isDanger && styles.cardActionBtnDanger,
                  isPrimary && styles.cardActionBtnPrimary,
                ]}
                onPress={act.onPress}
                activeOpacity={0.7}
                accessibilityLabel={act.label}
              >
                {IconC && (
                  <IconC
                    size={12}
                    color={isDanger ? '#DC2626' : isPrimary ? '#15803D' : '#334155'}
                    strokeWidth={2}
                  />
                )}
                <AppText
                  style={[
                    styles.cardActionBtnText,
                    isDanger && styles.cardActionBtnTextDanger,
                    isPrimary && styles.cardActionBtnTextPrimary,
                  ]}
                >
                  {act.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ─── 6. EMPTY STATE ──────────────────────────────────────────────────────────

export function LegalEmptyState({
  icon: IconComponent = FileText,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon?: any;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconCircle}>
        <IconComponent size={22} color="#94A3B8" />
      </View>
      <AppText style={styles.emptyTitle}>{title}</AppText>
      <AppText style={styles.emptyDescription}>{description}</AppText>
      {actionLabel && onAction && (
        <TouchableOpacity style={styles.emptyButton} onPress={onAction} activeOpacity={0.8}>
          <Plus size={13} color="#15803D" strokeWidth={2.4} />
          <AppText style={styles.emptyButtonText}>{actionLabel}</AppText>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── 7. PREVIEW MODAL ────────────────────────────────────────────────────────

export function LegalPreviewModal({
  visible,
  title,
  subtitle,
  content,
  onClose,
}: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  content?: string;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.previewModalCard}>
          <View style={styles.previewModalHeader}>
            <View style={styles.previewTitleGroup}>
              <AppText style={styles.previewHeaderTitle} numberOfLines={2}>
                {title || 'Document Preview'}
              </AppText>
              {subtitle && <AppText style={styles.previewHeaderSubtitle}>{subtitle}</AppText>}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn} accessibilityLabel="Close">
              <X size={16} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.previewModalBody} showsVerticalScrollIndicator={false}>
            <AppText style={styles.previewBodyText}>
              {content || 'No content available to preview.'}
            </AppText>
          </ScrollView>

          <View style={styles.previewModalFooter}>
            <TouchableOpacity style={styles.btnPrimary} onPress={onClose}>
              <AppText style={styles.btnPrimaryText}>Close Preview</AppText>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── 8. PUBLISH CONFIRM MODAL ────────────────────────────────────────────────

export function LegalPublishConfirmModal({
  visible,
  documentTitle,
  versionString,
  requiresRenewedAcceptance,
  isSubmitting,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  documentTitle: string;
  versionString: string;
  requiresRenewedAcceptance?: boolean;
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.confirmModalCard}>
          <View style={styles.confirmHeader}>
            <View style={styles.confirmIconWrap}>
              <Send size={16} color="#15803D" strokeWidth={2.4} />
            </View>
            <View style={styles.confirmTitleCol}>
              <AppText style={styles.confirmTitle}>Publish Version {versionString}</AppText>
              <AppText style={styles.confirmSubtitle}>
                Make this the active legal document platform-wide
              </AppText>
            </View>
            <TouchableOpacity onPress={onCancel} style={styles.modalCloseBtn} accessibilityLabel="Close">
              <X size={16} color="#64748B" />
            </TouchableOpacity>
          </View>

          <View style={styles.confirmBody}>
            <View style={styles.confirmWarningBox}>
              <AlertTriangle size={15} color="#D97706" />
              <AppText style={styles.confirmWarningText}>
                Publishing Version {versionString} will immediately replace the current active
                version and archive it.
                {requiresRenewedAcceptance
                  ? ' Users will be required to re-accept this document upon their next session.'
                  : ' This update does not enforce mandatory re-acceptance.'}
              </AppText>
            </View>

            <View style={styles.confirmSummaryRow}>
              <AppText style={styles.confirmSummaryLabel}>Document:</AppText>
              <AppText style={styles.confirmSummaryValue}>{documentTitle}</AppText>
            </View>

            <View style={styles.confirmSummaryRow}>
              <AppText style={styles.confirmSummaryLabel}>New Version:</AppText>
              <AppText style={styles.confirmSummaryValue}>v{versionString}</AppText>
            </View>

            <View style={styles.confirmSummaryRow}>
              <AppText style={styles.confirmSummaryLabel}>Effective Date:</AppText>
              <AppText style={styles.confirmSummaryValue}>Immediate (Today)</AppText>
            </View>
          </View>

          <View style={styles.confirmActionsRow}>
            <TouchableOpacity style={styles.btnSecondary} onPress={onCancel} disabled={isSubmitting}>
              <AppText style={styles.btnSecondaryText}>Cancel</AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnPrimary, styles.btnPublishGreen]}
              onPress={onConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <AppText style={styles.btnPrimaryText}>Confirm & Publish</AppText>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ─── Header ───────────────────────────────────────────────────────────────
  headerContainer: {
    marginBottom: 12,
  },
  backButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  headerTextGroup: {
    flex: 1,
    minWidth: 200,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  headerIconTile: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#EAF8F0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  headerActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },

  // ─── Buttons ──────────────────────────────────────────────────────────────
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 32,
    paddingHorizontal: 11,
    borderRadius: 6,
    backgroundColor: '#15803D',
  },
  btnPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 32,
    paddingHorizontal: 10,
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
  btnDisabled: {
    opacity: 0.6,
  },
  btnPublishGreen: {
    backgroundColor: '#15803D',
  },

  // ─── Badges ───────────────────────────────────────────────────────────────
  badgeBase: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeMedium: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  badgePublished: {
    backgroundColor: '#DCFCE7',
  },
  badgeDraft: {
    backgroundColor: '#FEF3C7',
  },
  badgeArchived: {
    backgroundColor: '#F1F5F9',
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  badgeTextMedium: {
    fontSize: 11,
  },
  badgeTextPublished: {
    color: '#15803D',
  },
  badgeTextDraft: {
    color: '#D97706',
  },
  badgeTextArchived: {
    color: '#64748B',
  },
  categoryChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryChipText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#475569',
  },
  audienceBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  audienceBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#2563EB',
  },

  // ─── Toolbar ──────────────────────────────────────────────────────────────
  toolbarContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 8,
    gap: 8,
    marginBottom: 10,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 8,
    height: 34,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    height: '100%',
  },
  searchClearBtn: {
    padding: 2,
  },
  filterPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  pillsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pillBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pillBtnActive: {
    backgroundColor: '#1E6F43',
    borderColor: '#1E6F43',
  },
  pillBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  pillBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  refreshBtn: {
    width: 34,
    height: 34,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinningIcon: {
    opacity: 0.5,
  },

  // ─── Record Card ──────────────────────────────────────────────────────────
  recordCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 9,
    padding: 12,
    gap: 6,
    ...Platform.select({
      web: { boxShadow: '0 1px 2px rgba(0,0,0,0.03)' },
      default: { elevation: 1 },
    }),
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  cardBadgesGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
    flex: 1,
  },
  cardMetaWrap: {
    flexShrink: 0,
  },
  cardMetaText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  cardTitleWrap: {
    marginTop: 2,
  },
  cardTitleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 19,
  },
  cardExcerptText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16.5,
  },
  cardFooterActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
    gap: 6,
  },
  cardExpandToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
  },
  cardExpandToggleText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#15803D',
  },
  cardActionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cardActionBtnPrimary: {
    backgroundColor: '#EAF8F0',
    borderColor: '#BBF7D0',
  },
  cardActionBtnDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  cardActionBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
  },
  cardActionBtnTextPrimary: {
    color: '#15803D',
  },
  cardActionBtnTextDanger: {
    color: '#DC2626',
  },

  // ─── Empty State ──────────────────────────────────────────────────────────
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  emptyDescription: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 16,
    marginBottom: 12,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EAF8F0',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  emptyButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },

  // ─── Preview Modal ────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  previewModalCard: {
    width: '100%',
    maxWidth: 680,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    maxHeight: '88%',
    overflow: 'hidden',
  },
  previewModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  previewTitleGroup: {
    flex: 1,
    paddingRight: 10,
  },
  previewHeaderTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  previewHeaderSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  previewModalBody: {
    padding: 14,
  },
  previewBodyText: {
    fontSize: 13,
    color: '#1E293B',
    lineHeight: 20,
  },
  previewModalFooter: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    alignItems: 'flex-end',
  },

  // ─── Confirm Publish Modal ────────────────────────────────────────────────
  confirmModalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  confirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  confirmIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#EAF8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmTitleCol: {
    flex: 1,
  },
  confirmTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  confirmSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  confirmBody: {
    padding: 14,
    gap: 10,
  },
  confirmWarningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    padding: 10,
  },
  confirmWarningText: {
    flex: 1,
    fontSize: 11.5,
    color: '#92400E',
    lineHeight: 16,
  },
  confirmSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  confirmSummaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  confirmSummaryValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  confirmActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
});
