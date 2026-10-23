/**
 * Pickleball Multi-Club Platform — Platform Admin Audit Log
 *
 * Dedicated administrative audit trail for authorized platform owners:
 * - Immutable, chronological log of platform-level administrative actions
 * - Plain-language event summaries and readable action badges
 * - Accurate KPI metrics reflecting recorded audit trail entries
 * - Entity-type filter tabs (All Activity, Applications, Club Status, Settings, Support)
 * - Server-side search across entity name, admin email/name, reason, and action
 * - Comprehensive event detail inspection modal with before/after state diffs
 * - Light neutral theme (#F8FAF9) with standardized pickleball-green accents (#18794E)
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileCheck,
  FileText,
  LifeBuoy,
  Lock,
  Mail,
  MessageSquare,
  Search,
  ShieldCheck,
  Sliders,
  User,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react-native';

import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PlatformShell,
} from '@/components';
import {
  PlatformAuditLogItem,
  platformApplicationsApi,
} from '@/services/api/clubApplications';
import { Colors, Radius, Spacing } from '@/theme';

type EntityFilter =
  | 'all'
  | 'club_application'
  | 'club'
  | 'platform_settings'
  | 'support_ticket';

/** Human-friendly mapping for runtime platform setting keys */
const SETTING_FIELD_LABELS: Record<string, string> = {
  platform_name: 'Platform Name',
  support_email: 'Support Email',
  maintenance_mode: 'Maintenance Mode',
  allow_registrations: 'User Registration',
  platform_fee_percent: 'Platform Fee %',
  max_upload_size_mb: 'Max File Upload Size',
};

/**
 * Format ISO timestamp into clean local date and relative time
 */
function formatAuditDate(isoString: string): { full: string; relative: string } {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { full: isoString, relative: '' };

    const full = d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    let relative = '';
    if (diffMins < 1) relative = 'Just now';
    else if (diffMins < 60) relative = `${diffMins}m ago`;
    else if (diffHours < 24) relative = `${diffHours}h ago`;
    else if (diffDays === 1) relative = 'Yesterday';
    else if (diffDays < 30) relative = `${diffDays}d ago`;

    return { full, relative };
  } catch {
    return { full: isoString, relative: '' };
  }
}

/**
 * Translate raw technical audit record into clear, human-understandable presentation
 */
interface EventPresentation {
  actionTitle: string;
  badgeLabel: string;
  badgeVariant: 'success' | 'error' | 'warning' | 'default' | 'info';
  entityCategory: string;
  targetName: string;
  narrative: string;
  icon: React.ReactNode;
}

function getEventPresentation(item: PlatformAuditLogItem): EventPresentation {
  const action = (item.action || '').toLowerCase();
  const entityType = (item.entity_type || '').toLowerCase();
  const entityName = item.entity_name || 'Record';
  const details = item.details || {};

  switch (action) {
    case 'club_application.approved':
      return {
        actionTitle: 'Club application approved',
        badgeLabel: 'Approved',
        badgeVariant: 'success',
        entityCategory: 'Club Application',
        targetName: entityName,
        narrative: `Approved onboarding application for "${entityName}" and provisioned the new club facility.`,
        icon: <FileCheck size={16} color="#18794E" />,
      };

    case 'club_application.rejected':
      return {
        actionTitle: 'Club application rejected',
        badgeLabel: 'Rejected',
        badgeVariant: 'default',
        entityCategory: 'Club Application',
        targetName: entityName,
        narrative: `Rejected onboarding application for "${entityName}".`,
        icon: <XCircle size={16} color="#64748B" />,
      };

    case 'club.suspended':
      return {
        actionTitle: 'Club suspended',
        badgeLabel: 'Suspended',
        badgeVariant: 'error',
        entityCategory: 'Club Facility',
        targetName: entityName,
        narrative: `Suspended operational access for "${entityName}". Public bookings and member activities paused.`,
        icon: <AlertTriangle size={16} color="#DC2626" />,
      };

    case 'club.reactivated':
      return {
        actionTitle: 'Club reactivated',
        badgeLabel: 'Reactivated',
        badgeVariant: 'success',
        entityCategory: 'Club Facility',
        targetName: entityName,
        narrative: `Restored active operational access for "${entityName}". Facility bookings and member access resumed.`,
        icon: <CheckCircle2 size={16} color="#18794E" />,
      };

    case 'platform_settings.updated': {
      const changedKeys = Array.isArray(details.changed_keys) ? details.changed_keys : [];
      const friendlyKeys = changedKeys.map((k: string) => SETTING_FIELD_LABELS[k] || k.replace(/_/g, ' '));
      const keySummary = friendlyKeys.length > 0 ? friendlyKeys.join(', ') : 'Platform Configuration';

      return {
        actionTitle: 'Platform settings changed',
        badgeLabel: 'Settings Changed',
        badgeVariant: 'warning',
        entityCategory: 'Platform Settings',
        targetName: 'Global Platform Settings',
        narrative: `Modified global platform settings (${keySummary}).`,
        icon: <Sliders size={16} color="#B45309" />,
      };
    }

    case 'support_ticket.status_updated':
      return {
        actionTitle: 'Support ticket updated',
        badgeLabel: 'Ticket Updated',
        badgeVariant: 'info',
        entityCategory: 'Support Ticket',
        targetName: entityName,
        narrative: details.changes && Array.isArray(details.changes)
          ? `Updated ticket: ${details.changes.join('; ')}`
          : `Updated status or priority for ticket "${entityName}".`,
        icon: <LifeBuoy size={16} color="#18794E" />,
      };

    case 'support_ticket.replied':
      return {
        actionTitle: 'Support reply sent',
        badgeLabel: 'Reply Sent',
        badgeVariant: 'info',
        entityCategory: 'Support Ticket',
        targetName: entityName,
        narrative: `Sent an official platform administrative reply on ticket "${entityName}".`,
        icon: <MessageSquare size={16} color="#18794E" />,
      };

    case 'support_ticket.assigned':
      return {
        actionTitle: 'Support ticket assigned',
        badgeLabel: 'Assigned',
        badgeVariant: 'info',
        entityCategory: 'Support Ticket',
        targetName: entityName,
        narrative: `Assigned support ticket "${entityName}" to an administrator.`,
        icon: <UserCheck size={16} color="#18794E" />,
      };

    default: {
      // Fallback formatting for unknown/future events
      const fallbackTitle = action.replace(/\./g, ' ').replace(/_/g, ' ');
      const cleanTitle = fallbackTitle.charAt(0).toUpperCase() + fallbackTitle.slice(1);
      let category = 'System Record';
      let iconNode = <Clock size={16} color="#18794E" />;

      if (entityType === 'club') {
        category = 'Club Facility';
        iconNode = <Building2 size={16} color="#18794E" />;
      } else if (entityType === 'club_application') {
        category = 'Club Application';
        iconNode = <FileText size={16} color="#18794E" />;
      } else if (entityType === 'platform_settings') {
        category = 'Platform Settings';
        iconNode = <Sliders size={16} color="#18794E" />;
      } else if (entityType === 'support_ticket') {
        category = 'Support Ticket';
        iconNode = <LifeBuoy size={16} color="#18794E" />;
      }

      return {
        actionTitle: cleanTitle,
        badgeLabel: cleanTitle,
        badgeVariant: 'default',
        entityCategory: category,
        targetName: entityName,
        narrative: `Administrative action executed on ${category.toLowerCase()} "${entityName}".`,
        icon: iconNode,
      };
    }
  }
}

/**
 * Format decision or reason note into plain language
 */
function cleanReasonText(reason: string | null | undefined): string | null {
  if (!reason || !reason.trim()) return null;
  const raw = reason.trim();

  // If backend generated technical settings reason like "Updated platform settings: platform_name"
  if (raw.startsWith('Updated platform settings:')) {
    const keysPart = raw.replace('Updated platform settings:', '').trim();
    const friendly = keysPart
      .split(',')
      .map((k) => SETTING_FIELD_LABELS[k.trim()] || k.trim().replace(/_/g, ' '))
      .join(', ');
    return `Changed platform settings: ${friendly}`;
  }

  return raw;
}

export default function PlatformAuditLogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [logs, setLogs] = useState<PlatformAuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [actionCounts, setActionCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<EntityFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detail inspection modal
  const [selectedLog, setSelectedLog] = useState<PlatformAuditLogItem | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchLogs = useCallback(
    async (isRefresh = false, targetPage = page) => {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const res = await platformApplicationsApi.listAuditLogs({
          page: targetPage,
          pageSize,
          entityType: filter !== 'all' ? filter : undefined,
          search: debouncedSearch || undefined,
        });

        setLogs(res.items || []);
        setTotal(res.total || 0);
        setActionCounts(res.action_counts || {});
      } catch (err: any) {
        const msg =
          err?.response?.data?.detail || err?.message || 'Failed to fetch platform audit logs';
        setError(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [page, filter, debouncedSearch]
  );

  useEffect(() => {
    fetchLogs(false, page);
  }, [fetchLogs, page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Compute breakdown KPI numbers from actual recorded audit entries
  const appApprovedCount = actionCounts['club_application.approved'] || 0;
  const appRejectedCount = actionCounts['club_application.rejected'] || 0;
  const clubSuspendedCount = actionCounts['club.suspended'] || 0;
  const clubReactivatedCount = actionCounts['club.reactivated'] || 0;
  const settingsCount = actionCounts['platform_settings.updated'] || 0;
  const supportCount =
    (actionCounts['support_ticket.status_updated'] || 0) +
    (actionCounts['support_ticket.replied'] || 0) +
    (actionCounts['support_ticket.assigned'] || 0);

  const totalRecorded = Object.values(actionCounts).reduce((a, b) => a + b, 0) || total;

  return (
    <PlatformShell
      activeTab="audit"
      title="Platform Audit Log"
      subtitle="Immutable chronological audit trail of all platform-level administrative decisions"
      onRefresh={() => fetchLogs(true, 1)}
      isRefreshing={isRefreshing}
    >
      {/* Platform Audit Summary KPIs */}
      <View style={styles.kpiContainer}>
        <View style={styles.kpiCard}>
          <AppText variant="caption" color="secondary">Total Recorded Events</AppText>
          <AppText variant="heading2" color="primary" style={styles.kpiValue}>
            {totalRecorded}
          </AppText>
          <AppText variant="caption" color="tertiary" style={styles.kpiSub}>
            Logged audit entries
          </AppText>
        </View>

        <View style={styles.kpiCard}>
          <AppText variant="caption" color="secondary">Applications Decided</AppText>
          <AppText variant="heading2" color="brand" style={styles.kpiValue}>
            {appApprovedCount + appRejectedCount}
          </AppText>
          <AppText variant="caption" color="tertiary" style={styles.kpiSub}>
            {appApprovedCount} approved · {appRejectedCount} rejected
          </AppText>
        </View>

        <View style={styles.kpiCard}>
          <AppText variant="caption" color="secondary">Club Status Changes</AppText>
          <AppText variant="heading2" color="primary" style={styles.kpiValue}>
            {clubSuspendedCount + clubReactivatedCount}
          </AppText>
          <AppText variant="caption" color="tertiary" style={styles.kpiSub}>
            {clubSuspendedCount} suspended · {clubReactivatedCount} reactivated
          </AppText>
        </View>

        <View style={styles.kpiCard}>
          <AppText variant="caption" color="secondary">Settings & Support</AppText>
          <AppText variant="heading2" color="primary" style={styles.kpiValue}>
            {settingsCount + supportCount}
          </AppText>
          <AppText variant="caption" color="tertiary" style={styles.kpiSub}>
            {settingsCount} settings · {supportCount} support actions
          </AppText>
        </View>
      </View>

      {/* KPI Ledger Notice */}
      <View style={styles.kpiNoticeRow}>
        <ShieldCheck size={14} color="#18794E" />
        <AppText variant="caption" color="secondary" style={styles.kpiNoticeText}>
          Summary reflects administrative actions recorded in the platform audit trail.
        </AppText>
      </View>

      {/* Filter Tabs and Search Bar */}
      <View style={styles.controlsCard}>
        {/* Entity Category Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContainer}
          style={styles.tabsScroll}
        >
          <TouchableOpacity
            style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
            onPress={() => {
              setFilter('all');
              setPage(1);
            }}
            activeOpacity={0.7}
          >
            <AppText style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
              All Activity
            </AppText>
            <View style={[styles.countPill, filter === 'all' ? styles.countPillActive : styles.countPillInactive]}>
              <AppText style={[styles.countPillText, filter === 'all' ? styles.countPillTextActive : styles.countPillTextInactive]}>
                {totalRecorded}
              </AppText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filter === 'club_application' && styles.filterTabActive]}
            onPress={() => {
              setFilter('club_application');
              setPage(1);
            }}
            activeOpacity={0.7}
          >
            <AppText style={[styles.filterTabText, filter === 'club_application' && styles.filterTabTextActive]}>
              Applications
            </AppText>
            <View style={[styles.countPill, filter === 'club_application' ? styles.countPillActive : styles.countPillInactive]}>
              <AppText style={[styles.countPillText, filter === 'club_application' ? styles.countPillTextActive : styles.countPillTextInactive]}>
                {appApprovedCount + appRejectedCount}
              </AppText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filter === 'club' && styles.filterTabActive]}
            onPress={() => {
              setFilter('club');
              setPage(1);
            }}
            activeOpacity={0.7}
          >
            <AppText style={[styles.filterTabText, filter === 'club' && styles.filterTabTextActive]}>
              Club Status
            </AppText>
            <View style={[styles.countPill, filter === 'club' ? styles.countPillActive : styles.countPillInactive]}>
              <AppText style={[styles.countPillText, filter === 'club' ? styles.countPillTextActive : styles.countPillTextInactive]}>
                {clubSuspendedCount + clubReactivatedCount}
              </AppText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filter === 'platform_settings' && styles.filterTabActive]}
            onPress={() => {
              setFilter('platform_settings');
              setPage(1);
            }}
            activeOpacity={0.7}
          >
            <AppText style={[styles.filterTabText, filter === 'platform_settings' && styles.filterTabTextActive]}>
              Platform Settings
            </AppText>
            <View style={[styles.countPill, filter === 'platform_settings' ? styles.countPillActive : styles.countPillInactive]}>
              <AppText style={[styles.countPillText, filter === 'platform_settings' ? styles.countPillTextActive : styles.countPillTextInactive]}>
                {settingsCount}
              </AppText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filter === 'support_ticket' && styles.filterTabActive]}
            onPress={() => {
              setFilter('support_ticket');
              setPage(1);
            }}
            activeOpacity={0.7}
          >
            <AppText style={[styles.filterTabText, filter === 'support_ticket' && styles.filterTabTextActive]}>
              Support Actions
            </AppText>
            <View style={[styles.countPill, filter === 'support_ticket' ? styles.countPillActive : styles.countPillInactive]}>
              <AppText style={[styles.countPillText, filter === 'support_ticket' ? styles.countPillTextActive : styles.countPillTextInactive]}>
                {supportCount}
              </AppText>
            </View>
          </TouchableOpacity>
        </ScrollView>

        {/* Search Input */}
        <View style={styles.searchWrapper}>
          <Search size={16} color="#667776" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by club name, admin, reason, or action..."
            placeholderTextColor="#8FA39E"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={16} color="#667776" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Main Audit List */}
      {isLoading ? (
        <LoadingState message="Loading platform audit log..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchLogs(true, page)} />
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchLogs(true, 1)}
              tintColor="#18794E"
            />
          }
          ListEmptyComponent={
            <Card style={styles.emptyCard}>
              <EmptyState
                icon="📜"
                title="No Audit Records Found"
                description={
                  debouncedSearch
                    ? `No administrative actions match the search "${debouncedSearch}".`
                    : filter !== 'all'
                    ? 'No events match the selected activity filter.'
                    : 'No administrative actions have been recorded yet.'
                }
              />
            </Card>
          }
          renderItem={({ item }) => {
            const pres = getEventPresentation(item);
            const dateInfo = formatAuditDate(item.created_at);
            const cleanReason = cleanReasonText(item.reason);

            return (
              <Card style={styles.logCard}>
                {/* Header: Semantic Badge, Entity Category, Timestamp */}
                <View style={styles.logHeader}>
                  <View style={styles.actionBadgeGroup}>
                    {pres.icon}
                    <Badge
                      label={pres.badgeLabel}
                      variant={pres.badgeVariant}
                      size="sm"
                    />
                    <View style={styles.entityTypePill}>
                      <AppText style={styles.entityTypeText}>
                        {pres.entityCategory.toUpperCase()}
                      </AppText>
                    </View>
                  </View>

                  <View style={styles.timestampRow}>
                    <Clock size={12} color="#667776" />
                    <AppText variant="caption" color="secondary">
                      {dateInfo.full}
                      {dateInfo.relative ? ` · ${dateInfo.relative}` : ''}
                    </AppText>
                  </View>
                </View>

                {/* Target Entity Title */}
                <View style={styles.entityRow}>
                  <AppText variant="title" color="primary" numberOfLines={1} style={styles.entityName}>
                    {pres.targetName}
                  </AppText>
                </View>

                {/* Plain-Language Narrative Description */}
                <View style={styles.narrativeRow}>
                  <AppText variant="body" color="primary" style={styles.narrativeText}>
                    {pres.narrative}
                  </AppText>
                </View>

                {/* Reason Note (if present) */}
                {cleanReason && (
                  <View style={styles.reasonCard}>
                    <AppText variant="caption" color="secondary" style={styles.reasonLabel}>
                      Reason / Note:
                    </AppText>
                    <AppText variant="caption" color="primary" style={styles.reasonText}>
                      &quot;{cleanReason}&quot;
                    </AppText>
                  </View>
                )}

                {/* Actor Col & Action Button Row */}
                <View style={styles.cardFooterRow}>
                  <View style={styles.actorCol}>
                    <View style={styles.inlineItem}>
                      <ShieldCheck size={13} color="#18794E" />
                      <AppText variant="caption" color="secondary" numberOfLines={1}>
                        By {item.actor_name || 'Platform Administrator'}
                      </AppText>
                    </View>
                    {item.actor_email && (
                      <AppText variant="caption" color="tertiary" numberOfLines={1} style={styles.actorEmailText}>
                        {item.actor_email}
                      </AppText>
                    )}
                  </View>

                  <Button
                    label="Inspect Event Details"
                    variant="outline"
                    size="sm"
                    onPress={() => setSelectedLog(item)}
                    leftIcon={<Eye size={14} color="#18794E" />}
                    style={styles.inspectBtn}
                  />
                </View>
              </Card>
            );
          }}
          ListFooterComponent={
            total > pageSize ? (
              <View style={styles.paginationCard}>
                <TouchableOpacity
                  style={[styles.pageButton, page <= 1 && styles.pageButtonDisabled]}
                  disabled={page <= 1}
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                  activeOpacity={0.7}
                >
                  <ChevronLeft size={16} color={page <= 1 ? '#8FA39E' : '#18794E'} />
                  <AppText style={[styles.pageButtonText, page <= 1 && styles.pageButtonTextDisabled]}>
                    Previous
                  </AppText>
                </TouchableOpacity>

                <AppText style={styles.paginationText} color="secondary">
                  Page {page} of {totalPages} ({total} events)
                </AppText>

                <TouchableOpacity
                  style={[styles.pageButton, page >= totalPages && styles.pageButtonDisabled]}
                  disabled={page >= totalPages}
                  onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                  activeOpacity={0.7}
                >
                  <AppText style={[styles.pageButtonText, page >= totalPages && styles.pageButtonTextDisabled]}>
                    Next
                  </AppText>
                  <ChevronRight size={16} color={page >= totalPages ? '#8FA39E' : '#18794E'} />
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}

      {/* Detailed Inspection Modal */}
      <Modal
        visible={selectedLog !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedLog(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {selectedLog && (() => {
              const pres = getEventPresentation(selectedLog);
              const dateInfo = formatAuditDate(selectedLog.created_at);
              const cleanReason = cleanReasonText(selectedLog.reason);
              const details = selectedLog.details || {};

              return (
                <>
                  <View style={styles.modalHeader}>
                    <View style={styles.modalHeaderTitleGroup}>
                      <View style={styles.modalTitleRow}>
                        {pres.icon}
                        <AppText variant="heading3" color="primary">
                          {pres.actionTitle}
                        </AppText>
                      </View>
                      <AppText variant="caption" color="secondary" style={styles.modalEventId}>
                        Record: {pres.entityCategory} · {dateInfo.full}
                      </AppText>
                    </View>
                    <TouchableOpacity
                      onPress={() => setSelectedLog(null)}
                      style={styles.modalCloseBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <X size={20} color="#2A4540" />
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                    <View style={styles.modalBody}>
                      {/* Executive Summary Banner */}
                      <View style={styles.summaryBanner}>
                        <AppText variant="caption" color="brand" style={styles.summaryBannerLabel}>
                          Action Summary
                        </AppText>
                        <AppText variant="body" color="primary" style={styles.summaryBannerText}>
                          {pres.narrative}
                        </AppText>
                      </View>

                      {/* Status Banner */}
                      <View style={styles.statusBannerRow}>
                        <AppText variant="label" color="secondary">
                          Execution Outcome:
                        </AppText>
                        <Badge
                          label={selectedLog.outcome === 'success' ? 'SUCCESS' : selectedLog.outcome.toUpperCase()}
                          variant={selectedLog.outcome === 'success' ? 'success' : 'error'}
                          size="md"
                        />
                        <AppText variant="caption" color="secondary" style={{ marginLeft: 8 }}>
                          {dateInfo.full} {dateInfo.relative ? `(${dateInfo.relative})` : ''}
                        </AppText>
                      </View>

                      {/* Administrative Reason / Notes */}
                      <View style={styles.modalSection}>
                        <AppText variant="label" color="brand" style={styles.sectionHeaderLabel}>
                          Administrative Reason / Decision Notes
                        </AppText>
                        {cleanReason ? (
                          <View style={styles.reasonCallout}>
                            <AppText variant="body" color="primary">
                              {cleanReason}
                            </AppText>
                          </View>
                        ) : (
                          <AppText variant="caption" color="tertiary" style={styles.notRecordedText}>
                            Not recorded
                          </AppText>
                        )}
                      </View>

                      {/* Recorded State Changes (Before & After) */}
                      <View style={styles.modalSection}>
                        <AppText variant="label" color="brand" style={styles.sectionHeaderLabel}>
                          Recorded State Changes
                        </AppText>
                        {selectedLog.action === 'platform_settings.updated' && details.before && details.after ? (
                          <View style={styles.diffTable}>
                            {Object.keys(details.after).map((key) => {
                              const label = SETTING_FIELD_LABELS[key] || key.replace(/_/g, ' ');
                              const beforeVal = typeof details.before[key] === 'boolean'
                                ? (details.before[key] ? 'Enabled' : 'Disabled')
                                : String(details.before[key] ?? 'None');
                              const afterVal = typeof details.after[key] === 'boolean'
                                ? (details.after[key] ? 'Enabled' : 'Disabled')
                                : String(details.after[key] ?? 'None');

                              return (
                                <View key={key} style={styles.diffRow}>
                                  <AppText variant="caption" color="secondary" style={styles.diffKey}>
                                    {label}:
                                  </AppText>
                                  <View style={styles.diffValuesCol}>
                                    <View style={styles.diffValRow}>
                                      <AppText variant="caption" color="tertiary" style={styles.diffValLabel}>Before:</AppText>
                                      <AppText variant="caption" color="secondary" style={styles.diffValText}>{beforeVal}</AppText>
                                    </View>
                                    <View style={styles.diffValRow}>
                                      <AppText variant="caption" color="brand" style={styles.diffValLabel}>After:</AppText>
                                      <AppText variant="body" color="primary" style={[styles.diffValText, styles.diffValTextAfter]}>{afterVal}</AppText>
                                    </View>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        ) : selectedLog.action === 'club.suspended' || selectedLog.action === 'club.reactivated' ? (
                          <View style={styles.detailGrid}>
                            <View style={styles.gridRow}>
                              <AppText variant="caption" color="secondary" style={styles.gridKey}>Status Transition:</AppText>
                              <AppText variant="body" color="primary" style={styles.gridVal}>
                                {details.is_active_before ? 'Active' : 'Suspended'} → {details.is_active_after ? 'Active' : 'Suspended'}
                              </AppText>
                            </View>
                            {details.slug && (
                              <View style={styles.gridRow}>
                                <AppText variant="caption" color="secondary" style={styles.gridKey}>Club URL Slug:</AppText>
                                <AppText variant="body" color="primary" style={styles.gridVal}>
                                  {details.slug}
                                </AppText>
                              </View>
                            )}
                          </View>
                        ) : selectedLog.action?.startsWith('club_application.') ? (
                          <View style={styles.detailGrid}>
                            <View style={styles.gridRow}>
                              <AppText variant="caption" color="secondary" style={styles.gridKey}>Application Ref:</AppText>
                              <AppText variant="body" color="primary" style={[styles.gridVal, styles.monoText]}>
                                {details.reference_number || 'Not recorded'}
                              </AppText>
                            </View>
                            <View style={styles.gridRow}>
                              <AppText variant="caption" color="secondary" style={styles.gridKey}>Applicant Email:</AppText>
                              <AppText variant="body" color="primary" style={styles.gridVal}>
                                {details.applicant_email || 'Not recorded'}
                              </AppText>
                            </View>
                            {details.club_slug && (
                              <View style={styles.gridRow}>
                                <AppText variant="caption" color="secondary" style={styles.gridKey}>Club Slug:</AppText>
                                <AppText variant="body" color="primary" style={styles.gridVal}>
                                  {details.club_slug}
                                </AppText>
                              </View>
                            )}
                          </View>
                        ) : selectedLog.action?.startsWith('support_ticket.') ? (
                          <View style={styles.detailGrid}>
                            <View style={styles.gridRow}>
                              <AppText variant="caption" color="secondary" style={styles.gridKey}>Ticket Ref:</AppText>
                              <AppText variant="body" color="primary" style={[styles.gridVal, styles.monoText]}>
                                {details.reference_number || 'Not recorded'}
                              </AppText>
                            </View>
                            {details.changes && Array.isArray(details.changes) && (
                              <View style={styles.gridRow}>
                                <AppText variant="caption" color="secondary" style={styles.gridKey}>Changes Applied:</AppText>
                                <AppText variant="body" color="primary" style={styles.gridVal}>
                                  {details.changes.join(', ')}
                                </AppText>
                              </View>
                            )}
                            {details.current_status && (
                              <View style={styles.gridRow}>
                                <AppText variant="caption" color="secondary" style={styles.gridKey}>Current Status:</AppText>
                                <AppText variant="body" color="primary" style={styles.gridVal}>
                                  {details.current_status}
                                </AppText>
                              </View>
                            )}
                          </View>
                        ) : Object.keys(details).length > 0 ? (
                          <View style={styles.detailGrid}>
                            {Object.entries(details).map(([k, v]) => (
                              <View key={k} style={styles.gridRow}>
                                <AppText variant="caption" color="secondary" style={styles.gridKey}>
                                  {k.replace(/_/g, ' ')}:
                                </AppText>
                                <AppText variant="body" color="primary" style={styles.gridVal}>
                                  {typeof v === 'boolean' ? (v ? 'True' : 'False') : String(v)}
                                </AppText>
                              </View>
                            ))}
                          </View>
                        ) : (
                          <AppText variant="caption" color="tertiary" style={styles.notRecordedText}>
                            No additional state change details recorded.
                          </AppText>
                        )}
                      </View>

                      {/* Affected Entity Details */}
                      <View style={styles.modalSection}>
                        <AppText variant="label" color="brand" style={styles.sectionHeaderLabel}>
                          Affected Record
                        </AppText>
                        <View style={styles.detailGrid}>
                          <View style={styles.gridRow}>
                            <AppText variant="caption" color="secondary" style={styles.gridKey}>Item Name:</AppText>
                            <AppText variant="body" color="primary" style={styles.gridVal}>
                              {selectedLog.entity_name || 'Not recorded'}
                            </AppText>
                          </View>
                          <View style={styles.gridRow}>
                            <AppText variant="caption" color="secondary" style={styles.gridKey}>Item Category:</AppText>
                            <AppText variant="body" color="primary" style={styles.gridVal}>
                              {pres.entityCategory}
                            </AppText>
                          </View>
                          <View style={styles.gridRow}>
                            <AppText variant="caption" color="secondary" style={styles.gridKey}>Record ID:</AppText>
                            <AppText variant="caption" color="secondary" style={[styles.gridVal, styles.monoText]}>
                              {selectedLog.entity_id}
                            </AppText>
                          </View>
                        </View>
                      </View>

                      {/* Administrative Actor Details */}
                      <View style={styles.modalSection}>
                        <AppText variant="label" color="brand" style={styles.sectionHeaderLabel}>
                          Authorized Administrator
                        </AppText>
                        <View style={styles.detailGrid}>
                          <View style={styles.gridRow}>
                            <AppText variant="caption" color="secondary" style={styles.gridKey}>Admin Name:</AppText>
                            <AppText variant="body" color="primary" style={styles.gridVal}>
                              {selectedLog.actor_name || 'Platform Administrator'}
                            </AppText>
                          </View>
                          <View style={styles.gridRow}>
                            <AppText variant="caption" color="secondary" style={styles.gridKey}>Admin Email:</AppText>
                            <AppText variant="body" color="primary" style={styles.gridVal}>
                              {selectedLog.actor_email || 'Not recorded'}
                            </AppText>
                          </View>
                          {selectedLog.actor_id && (
                            <View style={styles.gridRow}>
                              <AppText variant="caption" color="secondary" style={styles.gridKey}>Admin ID:</AppText>
                              <AppText variant="caption" color="secondary" style={[styles.gridVal, styles.monoText]}>
                                {selectedLog.actor_id}
                              </AppText>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Network & Security Context */}
                      <View style={styles.modalSection}>
                        <AppText variant="label" color="brand" style={styles.sectionHeaderLabel}>
                          Network & Audit Context
                        </AppText>
                        <View style={styles.detailGrid}>
                          <View style={styles.gridRow}>
                            <AppText variant="caption" color="secondary" style={styles.gridKey}>Client IP Address:</AppText>
                            <AppText variant="body" color="primary" style={styles.gridVal}>
                              {selectedLog.ip_address || 'Not recorded'}
                            </AppText>
                          </View>
                          <View style={styles.gridRow}>
                            <AppText variant="caption" color="secondary" style={styles.gridKey}>Event Log UUID:</AppText>
                            <AppText variant="caption" color="secondary" style={[styles.gridVal, styles.monoText]}>
                              {selectedLog.id}
                            </AppText>
                          </View>
                        </View>
                      </View>

                      {/* Immutability Notice */}
                      <View style={styles.boundaryCard}>
                        <Lock size={15} color="#18794E" />
                        <AppText variant="caption" color="secondary" style={styles.boundaryText}>
                          Platform audit records are append-only and cryptographically immutable. Entries cannot be edited, modified, or deleted by any administrative role.
                        </AppText>
                      </View>
                    </View>
                  </ScrollView>

                  <View style={styles.modalBottomActions}>
                    <Button
                      label="Close"
                      variant="primary"
                      onPress={() => setSelectedLog(null)}
                      style={styles.modalCloseButton}
                    />
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
    </PlatformShell>
  );
}

const styles = StyleSheet.create({
  kpiContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  kpiCard: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EBE6',
  },
  kpiValue: {
    marginTop: 4,
  },
  kpiSub: {
    marginTop: 2,
    fontSize: 11,
  },
  kpiNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.md,
    paddingHorizontal: 4,
  },
  kpiNoticeText: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  controlsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EBE6',
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    gap: 8,
  },
  tabsScroll: {
    flexGrow: 0,
    marginBottom: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: '#F0F5F2',
  },
  filterTabActive: {
    backgroundColor: '#18794E',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B635D',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  countPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.full,
  },
  countPillInactive: {
    backgroundColor: '#E2EBE6',
  },
  countPillActive: {
    backgroundColor: '#14603E',
  },
  countPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  countPillTextInactive: {
    color: '#4B635D',
  },
  countPillTextActive: {
    color: '#FFFFFF',
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAF9',
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#D7E5DE',
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#122521',
  },
  listContent: {
    gap: 12,
    paddingBottom: 36,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EBE6',
    padding: Spacing.lg,
  },
  logCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2EBE6',
    gap: 8,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionBadgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  entityTypePill: {
    backgroundColor: '#F0F5F2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  entityTypeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4B635D',
    letterSpacing: 0.5,
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  entityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  entityName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#122521',
  },
  narrativeRow: {
    backgroundColor: '#F8FAF9',
    padding: 10,
    borderRadius: Radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: '#18794E',
  },
  narrativeText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#2A4540',
  },
  reasonCard: {
    backgroundColor: '#FAFDFB',
    borderWidth: 1,
    borderColor: '#E2EBE6',
    borderRadius: Radius.sm,
    padding: 8,
    gap: 2,
  },
  reasonLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B635D',
  },
  reasonText: {
    fontStyle: 'italic',
    lineHeight: 16,
  },
  cardFooterRow: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: '#F0F5F2',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  actorCol: {
    flex: 1,
    minWidth: 180,
  },
  actorEmailText: {
    marginLeft: 19,
    fontSize: 11,
  },
  inlineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inspectBtn: {
    borderColor: '#C3E5D4',
  },
  paginationCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E2EBE6',
  },
  pageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: '#F0F5F2',
  },
  pageButtonDisabled: {
    backgroundColor: '#F8FAF9',
    opacity: 0.6,
  },
  pageButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#18794E',
  },
  pageButtonTextDisabled: {
    color: '#8FA39E',
  },
  paginationText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#E2EBE6',
    backgroundColor: '#FAFDFB',
  },
  modalHeaderTitleGroup: {
    flex: 1,
    marginRight: 12,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalEventId: {
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: Radius.full,
    backgroundColor: '#EEF3F0',
  },
  modalScroll: {
    padding: Spacing.lg,
  },
  modalBody: {
    gap: Spacing.md,
    paddingBottom: 20,
  },
  summaryBanner: {
    backgroundColor: '#F0F7F3',
    borderWidth: 1,
    borderColor: '#D4E8DC',
    borderRadius: Radius.md,
    padding: 12,
    gap: 4,
  },
  summaryBannerLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryBannerText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  statusBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  modalSection: {
    gap: 6,
  },
  sectionHeaderLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#18794E',
    borderBottomWidth: 1,
    borderBottomColor: '#EAF6F0',
    paddingBottom: 4,
    marginBottom: 4,
  },
  reasonCallout: {
    backgroundColor: '#FAFDFB',
    borderLeftWidth: 3,
    borderLeftColor: '#18794E',
    borderWidth: 1,
    borderColor: '#E2EBE6',
    padding: 10,
    borderRadius: Radius.sm,
  },
  notRecordedText: {
    fontStyle: 'italic',
  },
  diffTable: {
    backgroundColor: '#FAFDFB',
    borderWidth: 1,
    borderColor: '#E2EBE6',
    borderRadius: Radius.md,
    padding: 10,
    gap: 8,
  },
  diffRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F5F2',
    paddingBottom: 6,
  },
  diffKey: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 120,
  },
  diffValuesCol: {
    flex: 1,
    gap: 2,
    alignItems: 'flex-end',
  },
  diffValRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  diffValLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  diffValText: {
    fontSize: 12,
  },
  diffValTextAfter: {
    fontWeight: '600',
    color: '#18794E',
  },
  detailGrid: {
    gap: 8,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  gridKey: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 130,
  },
  gridVal: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
  },
  monoText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
  },
  boundaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0F7F3',
    borderWidth: 1,
    borderColor: '#D4E8DC',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginTop: 8,
  },
  boundaryText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  modalBottomActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#E2EBE6',
    backgroundColor: '#FAFDFB',
  },
  modalCloseButton: {
    minWidth: 110,
    backgroundColor: '#18794E',
  },
});
