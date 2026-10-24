/**
 * Pickleball Multi-Club Platform — Platform Admin Audit Log
 *
 * Premium, responsive, mobile-first administrative audit trail:
 * - Moderate, refined heading (26px) with compact line height
 * - 4 Summary KPI cards in a responsive 2-column grid with natural text wrapping
 *   (Zero ellipses or truncated labels/descriptions)
 * - Compact, horizontally scrollable filter chips (All Activity, Applications, Club Status, Settings, Support)
 * - Balanced search and filter row with placeholder "Search by club, admin, reason, or action"
 * - Compact, readable audit event cards with restrained padding, moderate titles (17px),
 *   narrative box with green left border accent, and reason/note box
 * - Full page scrolling with fixed bottom navigation (no sticky/fixed content containers)
 * - Detailed event inspection modal with before/after state diffs, actor info, and network context
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  FileCheck,
  FileText,
  LifeBuoy,
  Lock,
  MoreVertical,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  User,
  Users,
  X,
  XCircle,
} from 'lucide-react-native';

import {
  AppText,
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
import { Radius, Spacing } from '@/theme';

type EntityFilter =
  | 'all'
  | 'club_application'
  | 'club'
  | 'platform_settings'
  | 'support_ticket';

type OutcomeFilter = 'all' | 'success' | 'failure';

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
 * Format ISO timestamp into formatted local date & time plus relative time
 * e.g., "Oct 23, 2026, 2:36 PM · Yesterday"
 */
function formatAuditDate(isoString: string): { full: string; relative: string; combined: string } {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { full: isoString, relative: '', combined: isoString };

    const datePart = d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const timePart = d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    const full = `${datePart}, ${timePart}`;

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
    else if (diffDays < 30) relative = `${diffDays} days ago`;
    else relative = `${Math.floor(diffDays / 30)} mo ago`;

    const combined = relative ? `${full} · ${relative}` : full;

    return { full, relative, combined };
  } catch {
    return { full: isoString, relative: '', combined: isoString };
  }
}

/**
 * Translate raw technical audit record into clear, human-understandable presentation
 */
interface EventPresentation {
  actionTitle: string;
  badgeLabel: string;
  badgeTextColor: string;
  badgeBgColor: string;
  categoryLabel: string;
  targetName: string;
  narrative: string;
  icon: React.ReactNode;
  iconBg: string;
}

function getEventPresentation(item: PlatformAuditLogItem): EventPresentation {
  const action = (item.action || '').toLowerCase();
  const entityType = (item.entity_type || '').toLowerCase();
  const entityName = item.entity_name || 'Record';
  const details = item.details || {};

  switch (action) {
    case 'platform_settings.updated': {
      const changedKeys = Array.isArray(details.changed_keys) ? details.changed_keys : [];
      const friendlyKeys = changedKeys.map((k: string) => SETTING_FIELD_LABELS[k] || k.replace(/_/g, ' '));
      const keySummary = friendlyKeys.length > 0 ? friendlyKeys.join(', ') : 'Platform Name';

      return {
        actionTitle: 'Global Platform Settings',
        badgeLabel: 'SETTINGS CHANGED',
        badgeTextColor: '#B45309',
        badgeBgColor: '#FEF3C7',
        categoryLabel: 'PLATFORM SETTINGS',
        targetName: 'Global Platform Settings',
        narrative: `Modified global platform settings (${keySummary}).`,
        icon: <SlidersHorizontal size={14} color="#D97706" />,
        iconBg: '#FEF3C7',
      };
    }

    case 'user.created':
    case 'user_management.created':
    case 'user.registered': {
      const email = details.email || item.actor_email || 'user';
      return {
        actionTitle: 'New User Account Created',
        badgeLabel: 'USER CREATED',
        badgeTextColor: '#0284C7',
        badgeBgColor: '#E0F2FE',
        categoryLabel: 'USER MANAGEMENT',
        targetName: 'New User Account Created',
        narrative: `Created new user account for ${email}.`,
        icon: <Users size={14} color="#0284C7" />,
        iconBg: '#E0F2FE',
      };
    }

    case 'club_application.approved':
      return {
        actionTitle: entityName || 'Club Application Approved',
        badgeLabel: 'APPROVED',
        badgeTextColor: '#15803D',
        badgeBgColor: '#E6F4EA',
        categoryLabel: 'CLUB APPLICATION',
        targetName: entityName,
        narrative: `Approved onboarding application for "${entityName}" and provisioned the new club facility.`,
        icon: <FileCheck size={14} color="#15803D" />,
        iconBg: '#E6F4EA',
      };

    case 'club_application.rejected':
      return {
        actionTitle: entityName || 'Club Application Rejected',
        badgeLabel: 'REJECTED',
        badgeTextColor: '#64748B',
        badgeBgColor: '#F1F5F9',
        categoryLabel: 'CLUB APPLICATION',
        targetName: entityName,
        narrative: `Rejected onboarding application for "${entityName}".`,
        icon: <XCircle size={14} color="#64748B" />,
        iconBg: '#F1F5F9',
      };

    case 'club.suspended':
      return {
        actionTitle: entityName || 'Club Facility Suspended',
        badgeLabel: 'SUSPENDED',
        badgeTextColor: '#DC2626',
        badgeBgColor: '#FEE2E2',
        categoryLabel: 'CLUB FACILITY',
        targetName: entityName,
        narrative: `Suspended operational access for "${entityName}". Public bookings and member activities paused.`,
        icon: <AlertTriangle size={14} color="#DC2626" />,
        iconBg: '#FEE2E2',
      };

    case 'club.reactivated':
      return {
        actionTitle: entityName || 'Club Facility Reactivated',
        badgeLabel: 'REACTIVATED',
        badgeTextColor: '#15803D',
        badgeBgColor: '#E6F4EA',
        categoryLabel: 'CLUB FACILITY',
        targetName: entityName,
        narrative: `Restored active operational access for "${entityName}". Facility bookings and member access resumed.`,
        icon: <CheckCircle2 size={14} color="#15803D" />,
        iconBg: '#E6F4EA',
      };

    case 'support_ticket.status_updated':
    case 'support_ticket.replied':
    case 'support_ticket.assigned':
      return {
        actionTitle: entityName || 'Support Ticket Updated',
        badgeLabel: 'TICKET UPDATED',
        badgeTextColor: '#7C3AED',
        badgeBgColor: '#F3E8FF',
        categoryLabel: 'SUPPORT TICKET',
        targetName: entityName,
        narrative: details.changes && Array.isArray(details.changes)
          ? `Updated ticket: ${details.changes.join('; ')}`
          : `Processed administrative update for ticket "${entityName}".`,
        icon: <LifeBuoy size={14} color="#7C3AED" />,
        iconBg: '#F3E8FF',
      };

    default: {
      const cleanAction = action.replace(/\./g, ' ').replace(/_/g, ' ');
      const cleanTitle = cleanAction.charAt(0).toUpperCase() + cleanAction.slice(1);
      let cat = 'SYSTEM RECORD';
      let iconColor = '#15803D';
      let iconBg = '#E6F4EA';
      let iconNode = <Clock size={14} color={iconColor} />;

      if (entityType === 'club') {
        cat = 'CLUB FACILITY';
        iconColor = '#D97706';
        iconBg = '#FEF3C7';
        iconNode = <Building2 size={14} color={iconColor} />;
      } else if (entityType === 'club_application') {
        cat = 'CLUB APPLICATION';
        iconColor = '#0284C7';
        iconBg = '#E0F2FE';
        iconNode = <FileText size={14} color={iconColor} />;
      } else if (entityType === 'platform_settings') {
        cat = 'PLATFORM SETTINGS';
        iconColor = '#D97706';
        iconBg = '#FEF3C7';
        iconNode = <SlidersHorizontal size={14} color={iconColor} />;
      } else if (entityType === 'support_ticket') {
        cat = 'SUPPORT TICKET';
        iconColor = '#7C3AED';
        iconBg = '#F3E8FF';
        iconNode = <LifeBuoy size={14} color={iconColor} />;
      }

      return {
        actionTitle: item.entity_name || cleanTitle,
        badgeLabel: cleanTitle.toUpperCase(),
        badgeTextColor: '#334155',
        badgeBgColor: '#F1F5F9',
        categoryLabel: cat,
        targetName: item.entity_name || 'System Record',
        narrative: `Administrative action executed on ${cat.toLowerCase()} "${entityName}".`,
        icon: iconNode,
        iconBg,
      };
    }
  }
}

/**
 * Format decision or reason note into clean language
 */
function cleanReasonText(reason: string | null | undefined): string | null {
  if (!reason || !reason.trim()) return null;
  const raw = reason.trim();

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
  const { width } = useWindowDimensions();

  const [logs, setLogs] = useState<PlatformAuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [actionCounts, setActionCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<EntityFilter>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detail inspection modal
  const [selectedLog, setSelectedLog] = useState<PlatformAuditLogItem | null>(null);

  // 3-dots action menu modal
  const [menuLog, setMenuLog] = useState<PlatformAuditLogItem | null>(null);
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);

  // Advanced filter bottom sheet
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

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

  // Client-side filtering by outcome if selected
  const displayedLogs = useMemo(() => {
    if (outcomeFilter === 'all') return logs;
    return logs.filter((item) => item.outcome === outcomeFilter);
  }, [logs, outcomeFilter]);

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

  const copyToClipboard = (text: string, label: string) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    setCopiedNotice(`Copied ${label}`);
    setTimeout(() => setCopiedNotice(null), 2500);
  };

  const hasActiveAdvancedFilters = outcomeFilter !== 'all';

  return (
    <PlatformShell
      activeTab="audit"
      onRefresh={() => fetchLogs(true, 1)}
      isRefreshing={isRefreshing}
      scrollable={false}
    >
      <FlatList
        data={displayedLogs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchLogs(true, 1)}
            tintColor="#15803D"
          />
        }
        ListHeaderComponent={
          <View style={styles.headerContainer}>
            {/* 1. Page Heading — Moderate Size, Balanced & Refined */}
            <View style={styles.headerSection}>
              <AppText style={styles.screenTitle}>Audit Log</AppText>
              <AppText style={styles.screenSubtitle}>
                Review administrative actions and platform changes
              </AppText>
            </View>

            {/* 2. Four Audit Summary Cards (Responsive 2-column grid, Supporting text on one line below icon) */}
            <View style={styles.summaryGrid}>
              {/* Card 1: Total Recorded Events */}
              <View style={styles.summaryCard}>
                <View style={styles.summaryTopRow}>
                  <View style={[styles.summaryIconBox, { backgroundColor: '#E6F4EA' }]}>
                    <FileText size={18} color="#16A34A" strokeWidth={2.2} />
                  </View>
                  <View style={styles.summaryHeaderTextBox}>
                    <AppText style={styles.summaryLabel}>
                      Total Recorded Events
                    </AppText>
                    <AppText style={styles.summaryValue}>{totalRecorded}</AppText>
                  </View>
                </View>
                <AppText style={styles.summarySub}>
                  Logged audit entries
                </AppText>
              </View>

              {/* Card 2: Applications Decided */}
              <View style={styles.summaryCard}>
                <View style={styles.summaryTopRow}>
                  <View style={[styles.summaryIconBox, { backgroundColor: '#E0F2FE' }]}>
                    <FileCheck size={18} color="#0284C7" strokeWidth={2.2} />
                  </View>
                  <View style={styles.summaryHeaderTextBox}>
                    <AppText style={styles.summaryLabel}>
                      Applications Decided
                    </AppText>
                    <AppText style={styles.summaryValue}>
                      {appApprovedCount + appRejectedCount}
                    </AppText>
                  </View>
                </View>
                <AppText style={styles.summarySub}>
                  {appApprovedCount} approved · {appRejectedCount} rejected
                </AppText>
              </View>

              {/* Card 3: Club Status Changes */}
              <View style={styles.summaryCard}>
                <View style={styles.summaryTopRow}>
                  <View style={[styles.summaryIconBox, { backgroundColor: '#FEF3C7' }]}>
                    <Users size={18} color="#D97706" strokeWidth={2.2} />
                  </View>
                  <View style={styles.summaryHeaderTextBox}>
                    <AppText style={styles.summaryLabel}>
                      Club Status Changes
                    </AppText>
                    <AppText style={styles.summaryValue}>
                      {clubSuspendedCount + clubReactivatedCount}
                    </AppText>
                  </View>
                </View>
                <AppText style={styles.summarySub}>
                  {clubSuspendedCount} suspended · {clubReactivatedCount} reactivated
                </AppText>
              </View>

              {/* Card 4: Settings & Support */}
              <View style={styles.summaryCard}>
                <View style={styles.summaryTopRow}>
                  <View style={[styles.summaryIconBox, { backgroundColor: '#F3E8FF' }]}>
                    <Settings size={18} color="#9333EA" strokeWidth={2.2} />
                  </View>
                  <View style={styles.summaryHeaderTextBox}>
                    <AppText style={styles.summaryLabel}>
                      Settings & Support
                    </AppText>
                    <AppText style={styles.summaryValue}>
                      {settingsCount + supportCount}
                    </AppText>
                  </View>
                </View>
                <AppText style={styles.summarySub}>
                  {settingsCount} settings · {supportCount} support actions
                </AppText>
              </View>
            </View>

            {/* 3. Audit Summary Explanation Note */}
            <View style={styles.explanationNoteCard}>
              <ShieldCheck size={16} color="#16A34A" style={styles.explanationIcon} />
              <AppText style={styles.explanationNoteText}>
                Summary reflects administrative actions recorded in the platform audit trail.
              </AppText>
            </View>

            {/* 4. Compact Category Filter Chips (Horizontally Scrollable) */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
              contentContainerStyle={styles.chipsRow}
            >
              {/* All Activity */}
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  filter === 'all' ? styles.filterChipActive : styles.filterChipInactive,
                ]}
                onPress={() => {
                  setFilter('all');
                  setPage(1);
                }}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected: filter === 'all' }}
              >
                <AppText
                  style={[
                    styles.filterChipText,
                    filter === 'all'
                      ? styles.filterChipTextActive
                      : styles.filterChipTextInactive,
                  ]}
                >
                  All Activity
                </AppText>
                <View
                  style={[
                    styles.filterChipBadge,
                    filter === 'all'
                      ? styles.filterChipBadgeActive
                      : styles.filterChipBadgeInactive,
                  ]}
                >
                  <AppText
                    style={[
                      styles.filterChipBadgeText,
                      filter === 'all'
                        ? styles.filterChipBadgeTextActive
                        : styles.filterChipBadgeTextInactive,
                    ]}
                  >
                    {totalRecorded}
                  </AppText>
                </View>
              </TouchableOpacity>

              {/* Applications */}
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  filter === 'club_application'
                    ? styles.filterChipActive
                    : styles.filterChipInactive,
                ]}
                onPress={() => {
                  setFilter('club_application');
                  setPage(1);
                }}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected: filter === 'club_application' }}
              >
                <AppText
                  style={[
                    styles.filterChipText,
                    filter === 'club_application'
                      ? styles.filterChipTextActive
                      : styles.filterChipTextInactive,
                  ]}
                >
                  Applications
                </AppText>
                <View
                  style={[
                    styles.filterChipBadge,
                    filter === 'club_application'
                      ? styles.filterChipBadgeActive
                      : styles.filterChipBadgeInactive,
                  ]}
                >
                  <AppText
                    style={[
                      styles.filterChipBadgeText,
                      filter === 'club_application'
                        ? styles.filterChipBadgeTextActive
                        : styles.filterChipBadgeTextInactive,
                    ]}
                  >
                    {appApprovedCount + appRejectedCount}
                  </AppText>
                </View>
              </TouchableOpacity>

              {/* Club Status */}
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  filter === 'club' ? styles.filterChipActive : styles.filterChipInactive,
                ]}
                onPress={() => {
                  setFilter('club');
                  setPage(1);
                }}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected: filter === 'club' }}
              >
                <AppText
                  style={[
                    styles.filterChipText,
                    filter === 'club'
                      ? styles.filterChipTextActive
                      : styles.filterChipTextInactive,
                  ]}
                >
                  Club Status
                </AppText>
                <View
                  style={[
                    styles.filterChipBadge,
                    filter === 'club'
                      ? styles.filterChipBadgeActive
                      : styles.filterChipBadgeInactive,
                  ]}
                >
                  <AppText
                    style={[
                      styles.filterChipBadgeText,
                      filter === 'club'
                        ? styles.filterChipBadgeTextActive
                        : styles.filterChipBadgeTextInactive,
                    ]}
                  >
                    {clubSuspendedCount + clubReactivatedCount}
                  </AppText>
                </View>
              </TouchableOpacity>

              {/* Settings */}
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  filter === 'platform_settings'
                    ? styles.filterChipActive
                    : styles.filterChipInactive,
                ]}
                onPress={() => {
                  setFilter('platform_settings');
                  setPage(1);
                }}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected: filter === 'platform_settings' }}
              >
                <AppText
                  style={[
                    styles.filterChipText,
                    filter === 'platform_settings'
                      ? styles.filterChipTextActive
                      : styles.filterChipTextInactive,
                  ]}
                >
                  Settings
                </AppText>
                <View
                  style={[
                    styles.filterChipBadge,
                    filter === 'platform_settings'
                      ? styles.filterChipBadgeActive
                      : styles.filterChipBadgeInactive,
                  ]}
                >
                  <AppText
                    style={[
                      styles.filterChipBadgeText,
                      filter === 'platform_settings'
                        ? styles.filterChipBadgeTextActive
                        : styles.filterChipBadgeTextInactive,
                    ]}
                  >
                    {settingsCount}
                  </AppText>
                </View>
              </TouchableOpacity>

              {/* Support */}
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  filter === 'support_ticket'
                    ? styles.filterChipActive
                    : styles.filterChipInactive,
                ]}
                onPress={() => {
                  setFilter('support_ticket');
                  setPage(1);
                }}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected: filter === 'support_ticket' }}
              >
                <AppText
                  style={[
                    styles.filterChipText,
                    filter === 'support_ticket'
                      ? styles.filterChipTextActive
                      : styles.filterChipTextInactive,
                  ]}
                >
                  Support
                </AppText>
                <View
                  style={[
                    styles.filterChipBadge,
                    filter === 'support_ticket'
                      ? styles.filterChipBadgeActive
                      : styles.filterChipBadgeInactive,
                  ]}
                >
                  <AppText
                    style={[
                      styles.filterChipBadgeText,
                      filter === 'support_ticket'
                        ? styles.filterChipBadgeTextActive
                        : styles.filterChipBadgeTextInactive,
                    ]}
                  >
                    {supportCount}
                  </AppText>
                </View>
              </TouchableOpacity>
            </ScrollView>

            {/* 5. Search Field & Filter Button — Balanced Dimensions */}
            <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                <Search size={16} color="#94A3B8" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by club, admin, reason, or action"
                  placeholderTextColor="#94A3B8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearchQuery('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Clear search input"
                  >
                    <X size={15} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[
                  styles.filterIconButton,
                  hasActiveAdvancedFilters && styles.filterIconButtonHighlighted,
                ]}
                onPress={() => setIsFilterModalOpen(true)}
                activeOpacity={0.7}
                accessibilityLabel="Filter audit records by outcome"
              >
                <SlidersHorizontal
                  size={16}
                  color={hasActiveAdvancedFilters ? '#15803D' : '#475569'}
                />
                {hasActiveAdvancedFilters && <View style={styles.filterActiveDot} />}
              </TouchableOpacity>
            </View>

            {/* Active filters notice */}
            {hasActiveAdvancedFilters && (
              <View style={styles.activeFilterNotice}>
                <AppText style={styles.activeFilterNoticeText}>
                  Filter active: Outcome ({outcomeFilter})
                </AppText>
                <TouchableOpacity
                  onPress={() => setOutcomeFilter('all')}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <AppText style={styles.clearFilterText}>Reset</AppText>
                </TouchableOpacity>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <LoadingState message="Loading platform audit log..." />
          ) : error ? (
            <ErrorState message={error} onRetry={() => fetchLogs(true, 1)} />
          ) : (
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
          )
        }
        renderItem={({ item }) => {
          const pres = getEventPresentation(item);
          const dateInfo = formatAuditDate(item.created_at);
          const cleanReason = cleanReasonText(item.reason);

          return (
            <Card style={styles.logCard}>
              {/* Top Row: Category Icon + Action Badge + Category Badge + 3-dots Menu */}
              <View style={styles.cardTopRow}>
                <View style={styles.cardHeaderLeftGroup}>
                  {/* Category icon box */}
                  <View style={[styles.cardIconBox, { backgroundColor: pres.iconBg }]}>
                    {pres.icon}
                  </View>

                  {/* Semantic action badge */}
                  <View style={[styles.actionBadge, { backgroundColor: pres.badgeBgColor }]}>
                    <AppText style={[styles.actionBadgeText, { color: pres.badgeTextColor }]}>
                      {pres.badgeLabel}
                    </AppText>
                  </View>

                  {/* Category badge */}
                  <View style={styles.categoryBadge}>
                    <AppText style={styles.categoryBadgeText}>
                      {pres.categoryLabel}
                    </AppText>
                  </View>
                </View>

                {/* 3-dots action menu */}
                <TouchableOpacity
                  style={styles.moreButton}
                  onPress={() => setMenuLog(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={`Audit record actions for ${pres.actionTitle}`}
                >
                  <MoreVertical size={17} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* Timestamp Row with Clock icon */}
              <View style={styles.timestampRow}>
                <Clock size={12.5} color="#64748B" style={styles.clockIcon} />
                <AppText style={styles.timestampText}>
                  {dateInfo.combined}
                </AppText>
              </View>

              {/* Event Title — Moderate size (17px semibold), wraps naturally */}
              <AppText style={styles.eventTitle}>
                {pres.actionTitle}
              </AppText>

              {/* Narrative Description Callout Box with green left border accent */}
              <View style={styles.narrativeBox}>
                <AppText style={styles.narrativeText}>
                  {pres.narrative}
                </AppText>
              </View>

              {/* Reason / Note Box */}
              <View style={styles.reasonBox}>
                <AppText style={styles.reasonLabel}>
                  Reason / Note:
                </AppText>
                <AppText
                  style={[
                    styles.reasonText,
                    !cleanReason && styles.reasonTextMuted,
                  ]}
                >
                  {cleanReason || '-'}
                </AppText>
              </View>
            </Card>
          );
        }}
      />

      {/* ─── 3-Dots Quick Actions Bottom Sheet ──────────────────────────────── */}
      <Modal
        visible={!!menuLog}
        animationType="fade"
        transparent
        onRequestClose={() => setMenuLog(null)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setMenuLog(null)}
        >
          <View style={styles.sheetContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderTitleGroup}>
                <AppText style={styles.sheetTitle} numberOfLines={1}>
                  {menuLog ? getEventPresentation(menuLog).actionTitle : 'Audit Record'}
                </AppText>
                <AppText style={styles.sheetSubtitle} numberOfLines={1}>
                  Record ID: {menuLog?.id}
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => setMenuLog(null)}
                style={styles.sheetCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.sheetBody}>
              {/* Option 1: Inspect Full Audit Event */}
              <TouchableOpacity
                style={styles.sheetActionItem}
                onPress={() => {
                  const target = menuLog;
                  setMenuLog(null);
                  if (target) setSelectedLog(target);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.sheetActionIcon, { backgroundColor: '#E6F4EA' }]}>
                  <Eye size={18} color="#15803D" />
                </View>
                <View style={styles.sheetActionTextCol}>
                  <AppText style={styles.sheetActionLabel}>Inspect Full Audit Event</AppText>
                  <AppText style={styles.sheetActionDesc}>
                    View before/after state diffs, actor identity, and network context
                  </AppText>
                </View>
              </TouchableOpacity>

              {/* Option 2: Copy Event UUID */}
              <TouchableOpacity
                style={styles.sheetActionItem}
                onPress={() => {
                  if (menuLog) {
                    copyToClipboard(menuLog.id, 'Event UUID');
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.sheetActionIcon, { backgroundColor: '#E0F2FE' }]}>
                  <Copy size={18} color="#0284C7" />
                </View>
                <View style={styles.sheetActionTextCol}>
                  <AppText style={styles.sheetActionLabel}>Copy Event UUID</AppText>
                  <AppText style={styles.sheetActionDesc}>{menuLog?.id}</AppText>
                </View>
              </TouchableOpacity>

              {/* Option 3: Copy Admin Email */}
              {menuLog?.actor_email && (
                <TouchableOpacity
                  style={styles.sheetActionItem}
                  onPress={() => {
                    if (menuLog?.actor_email) {
                      copyToClipboard(menuLog.actor_email, 'Admin email');
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.sheetActionIcon, { backgroundColor: '#F1F5F9' }]}>
                    <User size={18} color="#475569" />
                  </View>
                  <View style={styles.sheetActionTextCol}>
                    <AppText style={styles.sheetActionLabel}>Copy Admin Email</AppText>
                    <AppText style={styles.sheetActionDesc}>{menuLog.actor_email}</AppText>
                  </View>
                </TouchableOpacity>
              )}

              {copiedNotice && (
                <View style={styles.copiedToast}>
                  <Check size={14} color="#15803D" />
                  <AppText style={styles.copiedToastText}>{copiedNotice}</AppText>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.sheetCancelBtn}
              onPress={() => setMenuLog(null)}
              activeOpacity={0.7}
            >
              <AppText style={styles.sheetCancelBtnText}>Cancel</AppText>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ─── Advanced Filter Modal ─────────────────────────────────────────── */}
      <Modal
        visible={isFilterModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsFilterModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setIsFilterModalOpen(false)}
        >
          <View style={styles.sheetContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderTitleGroup}>
                <AppText style={styles.sheetTitle}>Filter Audit Log</AppText>
                <AppText style={styles.sheetSubtitle}>
                  Refine recorded events by execution outcome
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => setIsFilterModalOpen(false)}
                style={styles.sheetCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.sheetBody}>
              <AppText style={styles.filterSectionTitle}>EXECUTION OUTCOME</AppText>
              <View style={styles.filterOptionsGrid}>
                {(['all', 'success', 'failure'] as OutcomeFilter[]).map((val) => {
                  const isSelected = outcomeFilter === val;
                  const label =
                    val === 'all'
                      ? 'All Outcomes'
                      : val === 'success'
                      ? 'Success Only'
                      : 'Failure / Errors';
                  return (
                    <TouchableOpacity
                      key={val}
                      style={[
                        styles.filterOptionPill,
                        isSelected && styles.filterOptionPillSelected,
                      ]}
                      onPress={() => setOutcomeFilter(val)}
                      activeOpacity={0.7}
                    >
                      <AppText
                        style={[
                          styles.filterOptionText,
                          isSelected && styles.filterOptionTextSelected,
                        ]}
                      >
                        {label}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.filterModalFooter}>
              <TouchableOpacity
                style={styles.filterResetBtn}
                onPress={() => {
                  setOutcomeFilter('all');
                  setIsFilterModalOpen(false);
                }}
              >
                <AppText style={styles.filterResetBtnText}>Reset All</AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.filterApplyBtn}
                onPress={() => setIsFilterModalOpen(false)}
              >
                <AppText style={styles.filterApplyBtnText}>Apply Filters</AppText>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ─── Detailed Inspection Modal ─────────────────────────────────────── */}
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
                        <View style={[styles.cardIconBox, { backgroundColor: pres.iconBg }]}>
                          {pres.icon}
                        </View>
                        <AppText style={styles.modalHeaderTitle}>
                          {pres.actionTitle}
                        </AppText>
                      </View>
                      <AppText style={styles.modalEventId}>
                        Record: {pres.categoryLabel} · {dateInfo.full}
                      </AppText>
                    </View>
                    <TouchableOpacity
                      onPress={() => setSelectedLog(null)}
                      style={styles.modalCloseBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <X size={18} color="#64748B" />
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                    <View style={styles.modalBody}>
                      {/* Action Summary Banner */}
                      <View style={styles.summaryBanner}>
                        <AppText style={styles.summaryBannerLabel}>
                          Action Summary
                        </AppText>
                        <AppText style={styles.summaryBannerText}>
                          {pres.narrative}
                        </AppText>
                      </View>

                      {/* Execution Outcome Badge */}
                      <View style={styles.statusBannerRow}>
                        <AppText style={styles.statusBannerLabel}>
                          Execution Outcome:
                        </AppText>
                        <View
                          style={[
                            styles.outcomeBadge,
                            {
                              backgroundColor:
                                selectedLog.outcome === 'success' ? '#E6F4EA' : '#FEE2E2',
                            },
                          ]}
                        >
                          <AppText
                            style={[
                              styles.outcomeBadgeText,
                              {
                                color:
                                  selectedLog.outcome === 'success' ? '#15803D' : '#DC2626',
                              },
                            ]}
                          >
                            {selectedLog.outcome.toUpperCase()}
                          </AppText>
                        </View>
                      </View>

                      {/* Reason / Notes */}
                      <View style={styles.modalSection}>
                        <AppText style={styles.sectionHeaderLabel}>
                          Administrative Reason / Decision Notes
                        </AppText>
                        {cleanReason ? (
                          <View style={styles.reasonCallout}>
                            <AppText style={styles.reasonCalloutText}>
                              {cleanReason}
                            </AppText>
                          </View>
                        ) : (
                          <AppText style={styles.notRecordedText}>
                            Not recorded
                          </AppText>
                        )}
                      </View>

                      {/* State Changes Diff (Before & After) */}
                      <View style={styles.modalSection}>
                        <AppText style={styles.sectionHeaderLabel}>
                          Recorded State Changes
                        </AppText>
                        {selectedLog.action === 'platform_settings.updated' &&
                        details.before &&
                        details.after ? (
                          <View style={styles.diffTable}>
                            {Object.keys(details.after).map((key) => {
                              const label =
                                SETTING_FIELD_LABELS[key] || key.replace(/_/g, ' ');
                              const beforeVal =
                                typeof details.before[key] === 'boolean'
                                  ? details.before[key]
                                    ? 'Enabled'
                                    : 'Disabled'
                                  : String(details.before[key] ?? 'None');
                              const afterVal =
                                typeof details.after[key] === 'boolean'
                                  ? details.after[key]
                                    ? 'Enabled'
                                    : 'Disabled'
                                  : String(details.after[key] ?? 'None');

                              return (
                                <View key={key} style={styles.diffRow}>
                                  <AppText style={styles.diffKey}>{label}:</AppText>
                                  <View style={styles.diffValuesCol}>
                                    <View style={styles.diffValRow}>
                                      <AppText style={styles.diffValLabel}>Before:</AppText>
                                      <AppText style={styles.diffValText}>{beforeVal}</AppText>
                                    </View>
                                    <View style={styles.diffValRow}>
                                      <AppText style={styles.diffValLabelAfter}>After:</AppText>
                                      <AppText style={styles.diffValTextAfter}>{afterVal}</AppText>
                                    </View>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        ) : Object.keys(details).length > 0 ? (
                          <View style={styles.detailGrid}>
                            {Object.entries(details).map(([k, v]) => (
                              <View key={k} style={styles.gridRow}>
                                <AppText style={styles.gridKey}>{k.replace(/_/g, ' ')}:</AppText>
                                <AppText style={styles.gridVal}>
                                  {typeof v === 'boolean' ? (v ? 'True' : 'False') : String(v)}
                                </AppText>
                              </View>
                            ))}
                          </View>
                        ) : (
                          <AppText style={styles.notRecordedText}>
                            No additional state change details recorded.
                          </AppText>
                        )}
                      </View>

                      {/* Affected Record */}
                      <View style={styles.modalSection}>
                        <AppText style={styles.sectionHeaderLabel}>
                          Affected Record
                        </AppText>
                        <View style={styles.detailGrid}>
                          <View style={styles.gridRow}>
                            <AppText style={styles.gridKey}>Item Name:</AppText>
                            <AppText style={styles.gridVal}>
                              {selectedLog.entity_name || 'Not recorded'}
                            </AppText>
                          </View>
                          <View style={styles.gridRow}>
                            <AppText style={styles.gridKey}>Category:</AppText>
                            <AppText style={styles.gridVal}>{pres.categoryLabel}</AppText>
                          </View>
                          <View style={styles.gridRow}>
                            <AppText style={styles.gridKey}>Record ID:</AppText>
                            <AppText style={[styles.gridVal, styles.monoText]}>
                              {selectedLog.entity_id}
                            </AppText>
                          </View>
                        </View>
                      </View>

                      {/* Authorized Administrator */}
                      <View style={styles.modalSection}>
                        <AppText style={styles.sectionHeaderLabel}>
                          Authorized Administrator
                        </AppText>
                        <View style={styles.detailGrid}>
                          <View style={styles.gridRow}>
                            <AppText style={styles.gridKey}>Admin Name:</AppText>
                            <AppText style={styles.gridVal}>
                              {selectedLog.actor_name || 'Platform Administrator'}
                            </AppText>
                          </View>
                          <View style={styles.gridRow}>
                            <AppText style={styles.gridKey}>Admin Email:</AppText>
                            <AppText style={styles.gridVal}>
                              {selectedLog.actor_email || 'Not recorded'}
                            </AppText>
                          </View>
                        </View>
                      </View>

                      {/* Network & Security Context */}
                      <View style={styles.modalSection}>
                        <AppText style={styles.sectionHeaderLabel}>
                          Network & Audit Context
                        </AppText>
                        <View style={styles.detailGrid}>
                          <View style={styles.gridRow}>
                            <AppText style={styles.gridKey}>Client IP:</AppText>
                            <AppText style={styles.gridVal}>
                              {selectedLog.ip_address || 'Not recorded'}
                            </AppText>
                          </View>
                          <View style={styles.gridRow}>
                            <AppText style={styles.gridKey}>Audit Log UUID:</AppText>
                            <AppText style={[styles.gridVal, styles.monoText]}>
                              {selectedLog.id}
                            </AppText>
                          </View>
                        </View>
                      </View>

                      {/* Immutability Notice */}
                      <View style={styles.boundaryCard}>
                        <Lock size={15} color="#15803D" />
                        <AppText style={styles.boundaryText}>
                          Platform audit records are append-only and cryptographically immutable. Entries cannot be edited, modified, or deleted.
                        </AppText>
                      </View>
                    </View>
                  </ScrollView>

                  <View style={styles.modalBottomActions}>
                    <TouchableOpacity
                      style={styles.modalCloseButton}
                      onPress={() => setSelectedLog(null)}
                      activeOpacity={0.8}
                    >
                      <AppText style={styles.modalCloseButtonText}>Close</AppText>
                    </TouchableOpacity>
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
  listContent: {
    paddingBottom: 28,
  },

  // ─── Header Section — Moderate Size & Compact Line Height ──────────────────
  headerContainer: {
    width: '100%',
  },
  headerSection: {
    paddingTop: 2,
    paddingBottom: 12,
  },
  screenTitle: {
    fontSize: 27,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.5,
    lineHeight: 32,
    ...Platform.select({
      web: {
        fontSize: 'clamp(25px, 6vw, 29px)' as any,
      },
    }),
  },
  screenSubtitle: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    marginTop: 4,
    flexWrap: 'wrap',
    ...Platform.select({
      web: {
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
      },
    }),
  },

  // ─── 4 Summary Cards (Responsive 2-column grid, Supporting Text Below Icon) ──
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
    width: '100%',
  },
  summaryCard: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 135,
    flexDirection: 'column',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    paddingHorizontal: 11,
    paddingTop: 11,
    paddingBottom: 11,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    gap: 9,
  },
  summaryIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  summaryHeaderTextBox: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
    lineHeight: 17,
    textAlign: 'left',
    width: '100%',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 28,
    marginTop: 2,
    textAlign: 'left',
    width: '100%',
  },
  summarySub: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
    marginTop: 8,
    textAlign: 'left',
    width: '100%',
    letterSpacing: -0.1,
    ...Platform.select({
      web: {
        display: 'block',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'clip',
      } as any,
    }),
  },

  // ─── Summary Explanation Note ──────────────────────────────────────────────
  explanationNoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
    marginBottom: 12,
    width: '100%',
  },
  explanationIcon: {
    flexShrink: 0,
  },
  explanationNoteText: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
    flexWrap: 'wrap',
    ...Platform.select({
      web: {
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
      },
    }),
  },

  // ─── Compact Filter Chips (Horizontally Scrollable) ────────────────────────
  chipsScroll: {
    marginBottom: 12,
    width: '100%',
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
  },
  filterChipActive: {
    backgroundColor: '#15803D',
  },
  filterChipInactive: {
    backgroundColor: '#F1F5F9',
  },
  filterChipText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  filterChipTextInactive: {
    color: '#334155',
  },
  filterChipBadge: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipBadgeActive: {
    backgroundColor: '#166534',
  },
  filterChipBadgeInactive: {
    backgroundColor: '#E2E8F0',
  },
  filterChipBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  filterChipBadgeTextActive: {
    color: '#FFFFFF',
  },
  filterChipBadgeTextInactive: {
    color: '#475569',
  },

  // ─── Search Field & Filter Button — Balanced Dimensions ────────────────────
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    width: '100%',
  },
  searchBar: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    height: 42,
    paddingHorizontal: 11,
  },
  searchIcon: {
    marginRight: 7,
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
    height: '100%',
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        outlineWidth: 0,
        boxShadow: 'none',
      } as any,
    }),
  },
  filterIconButton: {
    width: 42,
    height: 42,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    flexShrink: 0,
  },
  filterIconButtonHighlighted: {
    borderColor: '#15803D',
    backgroundColor: '#E6F4EA',
  },
  filterActiveDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#15803D',
  },
  activeFilterNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 10,
    width: '100%',
  },
  activeFilterNoticeText: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '600',
  },
  clearFilterText: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },

  // ─── Audit Event Cards — Compact & Readable ────────────────────────────────
  logCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 10,
    width: '100%',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
  },
  cardHeaderLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
    minWidth: 0,
    marginRight: 6,
  },
  cardIconBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  categoryBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.5,
  },
  moreButton: {
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: -2,
    marginRight: -3,
  },

  // Timestamp Row
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  clockIcon: {
    flexShrink: 0,
  },
  timestampText: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 17,
  },

  // Event Title — Moderate size (17px semibold), naturally wraps
  eventTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0F172A',
    lineHeight: 22,
    marginTop: 6,
    flexWrap: 'wrap',
    ...Platform.select({
      web: {
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
      },
    }),
  },

  // Narrative Description Box (green left border)
  narrativeBox: {
    backgroundColor: '#F8FAFC',
    borderLeftWidth: 3,
    borderLeftColor: '#15803D',
    borderRadius: 6,
    padding: 10,
    marginTop: 8,
    width: '100%',
  },
  narrativeText: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
    flexWrap: 'wrap',
    ...Platform.select({
      web: {
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
      },
    }),
  },

  // Reason / Note Box
  reasonBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 6,
    padding: 9,
    marginTop: 8,
    width: '100%',
  },
  reasonLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  reasonText: {
    fontSize: 13,
    color: '#334155',
    marginTop: 2,
    lineHeight: 18,
    flexWrap: 'wrap',
    ...Platform.select({
      web: {
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
      },
    }),
  },
  reasonTextMuted: {
    color: '#64748B',
    fontStyle: 'italic',
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EBE6',
    padding: Spacing.lg,
    width: '100%',
  },

  // ─── 3-Dots Quick Actions Bottom Sheet ────────────────────────────────────
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
    ...Platform.select({
      web: {
        alignItems: 'center',
      },
    }),
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    width: '100%',
    maxWidth: 500,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sheetHeaderTitleGroup: {
    flex: 1,
    marginRight: 10,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  sheetSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  sheetCloseBtn: {
    padding: 4,
  },
  sheetBody: {
    paddingVertical: 12,
    gap: 8,
  },
  sheetActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  sheetActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sheetActionTextCol: {
    flex: 1,
  },
  sheetActionLabel: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  sheetActionDesc: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  copiedToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'center',
    marginTop: 4,
  },
  copiedToastText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803D',
  },
  sheetCancelBtn: {
    marginTop: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },

  // ─── Filter Modal ──────────────────────────────────────────────────────────
  filterSectionTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
    marginTop: 6,
    marginBottom: 8,
  },
  filterOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  filterOptionPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterOptionPillSelected: {
    backgroundColor: '#E6F4EA',
    borderColor: '#15803D',
  },
  filterOptionText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  filterOptionTextSelected: {
    color: '#15803D',
    fontWeight: '700',
  },
  filterModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  filterResetBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterResetBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#475569',
  },
  filterApplyBtn: {
    flex: 1,
    backgroundColor: '#15803D',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterApplyBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ─── Detail Inspection Modal ───────────────────────────────────────────────
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
    ...Platform.select({
      web: {
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
      },
      default: {
        elevation: 8,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  modalHeaderTitleGroup: {
    flex: 1,
    marginRight: 10,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },
  modalEventId: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: Radius.full,
    backgroundColor: '#F1F5F9',
  },
  modalScroll: {
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  modalBody: {
    gap: 14,
    paddingBottom: 16,
  },
  summaryBanner: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  summaryBannerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryBannerText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#1E293B',
    fontWeight: '500',
  },
  statusBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBannerLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  outcomeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  outcomeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalSection: {
    gap: 6,
  },
  sectionHeaderLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#15803D',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 4,
    marginBottom: 4,
  },
  reasonCallout: {
    backgroundColor: '#F8FAFC',
    borderLeftWidth: 3,
    borderLeftColor: '#15803D',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    borderRadius: Radius.sm,
  },
  reasonCalloutText: {
    fontSize: 13,
    color: '#334155',
  },
  notRecordedText: {
    fontSize: 12.5,
    fontStyle: 'italic',
    color: '#94A3B8',
  },
  diffTable: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  diffRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 6,
  },
  diffKey: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
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
    color: '#94A3B8',
    fontWeight: '600',
  },
  diffValText: {
    fontSize: 12,
    color: '#64748B',
  },
  diffValLabelAfter: {
    fontSize: 11,
    color: '#15803D',
    fontWeight: '600',
  },
  diffValTextAfter: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  detailGrid: {
    gap: 6,
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
    color: '#64748B',
    minWidth: 110,
  },
  gridVal: {
    flex: 1,
    textAlign: 'right',
    fontSize: 12.5,
    color: '#0F172A',
  },
  monoText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
  },
  boundaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginTop: 4,
  },
  boundaryText: {
    flex: 1,
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 16,
  },
  modalBottomActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFDFB',
  },
  modalCloseButton: {
    backgroundColor: '#15803D',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  modalCloseButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
