/**
 * Pickleball Multi-Club Platform — Platform Admin Audit Log
 *
 * Dedicated administrative audit trail for authorized platform owners:
 * - Immutable, chronological log of platform-level administrative actions
 * - Inspect actor, action type, affected record, timestamp, outcome, and reason
 * - Filter by action category (Application Approvals, Rejections, Facility Suspensions, Reactivations)
 * - Search by affected facility/applicant name, actor email, reason, or reference ID
 * - Detailed event inspection modal showing structured non-sensitive metadata
 * - Light neutral theme (#F8FAF9) with pickleball-green accents (#18794E)
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
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  History,
  Lock,
  Mail,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  User,
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

type ActionFilter =
  | 'all'
  | 'club_application.approved'
  | 'club_application.rejected'
  | 'club.suspended'
  | 'club.reactivated';

export default function PlatformAuditLogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [logs, setLogs] = useState<PlatformAuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [actionCounts, setActionCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<ActionFilter>('all');
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
          action: filter !== 'all' ? filter : undefined,
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

  // Compute breakdown KPI numbers
  const appApprovedCount = actionCounts['club_application.approved'] || 0;
  const appRejectedCount = actionCounts['club_application.rejected'] || 0;
  const clubSuspendedCount = actionCounts['club.suspended'] || 0;
  const clubReactivatedCount = actionCounts['club.reactivated'] || 0;
  const totalRecorded = Object.values(actionCounts).reduce((a, b) => a + b, 0) || total;

  const getActionBadgeVariant = (action: string): 'success' | 'error' | 'warning' | 'default' => {
    switch (action) {
      case 'club_application.approved':
        return 'success';
      case 'club.reactivated':
        return 'success';
      case 'club.suspended':
        return 'error';
      case 'club_application.rejected':
        return 'default';
      default:
        return 'default';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'club_application.approved':
        return <CheckCircle2 size={15} color="#18794E" />;
      case 'club.reactivated':
        return <CheckCircle2 size={15} color="#18794E" />;
      case 'club.suspended':
        return <AlertTriangle size={15} color="#DC2626" />;
      case 'club_application.rejected':
        return <XCircle size={15} color="#64748B" />;
      default:
        return <History size={15} color="#18794E" />;
    }
  };

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
          <AppText variant="caption" color="secondary">Total Logged Actions</AppText>
          <AppText variant="heading2" color="primary" style={styles.kpiValue}>
            {totalRecorded}
          </AppText>
        </View>

        <View style={styles.kpiCard}>
          <AppText variant="caption" color="secondary">Applications Approved</AppText>
          <AppText variant="heading2" color="brand" style={styles.kpiValue}>
            {appApprovedCount}
          </AppText>
        </View>

        <View style={styles.kpiCard}>
          <AppText variant="caption" color="secondary">Applications Rejected</AppText>
          <AppText variant="heading2" color="secondary" style={styles.kpiValue}>
            {appRejectedCount}
          </AppText>
        </View>

        <View style={styles.kpiCard}>
          <AppText variant="caption" color="secondary">Facility Status Changes</AppText>
          <AppText variant="heading2" color="primary" style={styles.kpiValue}>
            {clubSuspendedCount + clubReactivatedCount}
          </AppText>
        </View>
      </View>

      {/* Filter Tabs and Search Bar */}
      <View style={styles.controlsCard}>
        {/* Action Category Filter Pills */}
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
              All Events
            </AppText>
            <View style={[styles.countPill, filter === 'all' ? styles.countPillActive : styles.countPillInactive]}>
              <AppText style={[styles.countPillText, filter === 'all' ? styles.countPillTextActive : styles.countPillTextInactive]}>
                {totalRecorded}
              </AppText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filter === 'club_application.approved' && styles.filterTabActive]}
            onPress={() => {
              setFilter('club_application.approved');
              setPage(1);
            }}
            activeOpacity={0.7}
          >
            <AppText style={[styles.filterTabText, filter === 'club_application.approved' && styles.filterTabTextActive]}>
              Approvals
            </AppText>
            <View style={[styles.countPill, filter === 'club_application.approved' ? styles.countPillActive : styles.countPillInactive]}>
              <AppText style={[styles.countPillText, filter === 'club_application.approved' ? styles.countPillTextActive : styles.countPillTextInactive]}>
                {appApprovedCount}
              </AppText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filter === 'club_application.rejected' && styles.filterTabActive]}
            onPress={() => {
              setFilter('club_application.rejected');
              setPage(1);
            }}
            activeOpacity={0.7}
          >
            <AppText style={[styles.filterTabText, filter === 'club_application.rejected' && styles.filterTabTextActive]}>
              Rejections
            </AppText>
            <View style={[styles.countPill, filter === 'club_application.rejected' ? styles.countPillActive : styles.countPillInactive]}>
              <AppText style={[styles.countPillText, filter === 'club_application.rejected' ? styles.countPillTextActive : styles.countPillTextInactive]}>
                {appRejectedCount}
              </AppText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filter === 'club.suspended' && styles.filterTabActive]}
            onPress={() => {
              setFilter('club.suspended');
              setPage(1);
            }}
            activeOpacity={0.7}
          >
            <AppText style={[styles.filterTabText, filter === 'club.suspended' && styles.filterTabTextActive]}>
              Suspensions
            </AppText>
            <View style={[styles.countPill, filter === 'club.suspended' ? styles.countPillActive : styles.countPillInactive]}>
              <AppText style={[styles.countPillText, filter === 'club.suspended' ? styles.countPillTextActive : styles.countPillTextInactive]}>
                {clubSuspendedCount}
              </AppText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filter === 'club.reactivated' && styles.filterTabActive]}
            onPress={() => {
              setFilter('club.reactivated');
              setPage(1);
            }}
            activeOpacity={0.7}
          >
            <AppText style={[styles.filterTabText, filter === 'club.reactivated' && styles.filterTabTextActive]}>
              Reactivations
            </AppText>
            <View style={[styles.countPill, filter === 'club.reactivated' ? styles.countPillActive : styles.countPillInactive]}>
              <AppText style={[styles.countPillText, filter === 'club.reactivated' ? styles.countPillTextActive : styles.countPillTextInactive]}>
                {clubReactivatedCount}
              </AppText>
            </View>
          </TouchableOpacity>
        </ScrollView>

        {/* Search Input */}
        <View style={styles.searchWrapper}>
          <Search size={16} color="#667776" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by facility name, admin email, reason, or entity ID"
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
                    ? `No administrative actions match the query "${debouncedSearch}".`
                    : filter !== 'all'
                    ? 'No events match the selected action filter.'
                    : 'No administrative actions have been recorded yet.'
                }
              />
            </Card>
          }
          renderItem={({ item }) => (
            <Card style={styles.logCard}>
              {/* Header: Action badge & Timestamp */}
              <View style={styles.logHeader}>
                <View style={styles.actionBadgeGroup}>
                  {getActionIcon(item.action)}
                  <Badge
                    label={item.action_label.toUpperCase()}
                    variant={getActionBadgeVariant(item.action)}
                    size="sm"
                  />
                  <View style={styles.entityTypePill}>
                    <AppText style={styles.entityTypeText}>
                      {item.entity_type === 'club_application' ? 'APPLICATION' : 'FACILITY'}
                    </AppText>
                  </View>
                </View>

                <View style={styles.timestampRow}>
                  <Clock size={13} color="#667776" />
                  <AppText variant="caption" color="secondary">
                    {new Date(item.created_at).toLocaleString()}
                  </AppText>
                </View>
              </View>

              {/* Target Entity Title */}
              <View style={styles.entityRow}>
                {item.entity_type === 'club_application' ? (
                  <FileText size={16} color="#18794E" style={styles.entityIcon} />
                ) : (
                  <Building2 size={16} color="#18794E" style={styles.entityIcon} />
                )}
                <AppText variant="title" color="primary" numberOfLines={1} style={styles.entityName}>
                  {item.entity_name || `Entity ID: ${item.entity_id}`}
                </AppText>
              </View>

              {/* Actor & Reason Row */}
              <View style={styles.detailsRow}>
                <View style={styles.actorCol}>
                  <View style={styles.inlineItem}>
                    <ShieldCheck size={13} color="#18794E" />
                    <AppText variant="caption" color="secondary" numberOfLines={1}>
                      Actor: {item.actor_name || 'Platform Admin'} ({item.actor_email})
                    </AppText>
                  </View>
                  {item.ip_address && (
                    <View style={styles.inlineItem}>
                      <AppText variant="caption" color="tertiary">
                        IP: {item.ip_address}
                      </AppText>
                    </View>
                  )}
                </View>

                {item.reason && (
                  <View style={styles.reasonCard}>
                    <AppText variant="caption" color="secondary" numberOfLines={2} style={styles.reasonText}>
                      &quot;{item.reason}&quot;
                    </AppText>
                  </View>
                )}
              </View>

              {/* Action Button: Inspect Record */}
              <View style={styles.cardActionsRow}>
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
          )}
          ListFooterComponent={
            total > pageSize ? (
              <View style={styles.paginationCard}>
                <Button
                  label="Previous"
                  variant="outline"
                  size="sm"
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  leftIcon={<ChevronLeft size={16} color={page <= 1 ? '#A0B2AC' : '#18794E'} />}
                />
                <AppText variant="caption" color="secondary" style={styles.paginationText}>
                  Page {page} of {totalPages} ({total} events)
                </AppText>
                <Button
                  label="Next"
                  variant="outline"
                  size="sm"
                  onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  rightIcon={<ChevronRight size={16} color={page >= totalPages ? '#A0B2AC' : '#18794E'} />}
                />
              </View>
            ) : null
          }
        />
      )}

      {/* Audit Detail Modal */}
      <Modal
        visible={!!selectedLog}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedLog(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleGroup}>
                <View style={styles.modalTitleRow}>
                  {selectedLog && getActionIcon(selectedLog.action)}
                  <AppText variant="heading3" color="primary">
                    {selectedLog?.action_label}
                  </AppText>
                </View>
                <AppText variant="caption" color="secondary">
                  Event ID: {selectedLog?.id}
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
              {selectedLog && (
                <View style={styles.modalBody}>
                  {/* Status Banner */}
                  <View style={styles.statusBannerRow}>
                    <AppText variant="label" color="secondary">
                      Outcome:
                    </AppText>
                    <Badge
                      label={selectedLog.outcome.toUpperCase()}
                      variant={selectedLog.outcome === 'success' ? 'success' : 'error'}
                      size="md"
                    />
                    <AppText variant="caption" color="secondary" style={{ marginLeft: 8 }}>
                      Recorded {new Date(selectedLog.created_at).toLocaleString()}
                    </AppText>
                  </View>

                  {/* Administrative Reason */}
                  {selectedLog.reason && (
                    <View style={styles.modalSection}>
                      <AppText variant="label" color="brand" style={styles.sectionHeaderLabel}>
                        Administrative Reason
                      </AppText>
                      <View style={styles.reasonCallout}>
                        <AppText variant="body" color="primary">
                          {selectedLog.reason}
                        </AppText>
                      </View>
                    </View>
                  )}

                  {/* Affected Entity Details */}
                  <View style={styles.modalSection}>
                    <AppText variant="label" color="brand" style={styles.sectionHeaderLabel}>
                      Affected Record
                    </AppText>
                    <View style={styles.detailGrid}>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>Entity Name:</AppText>
                        <AppText variant="body" color="primary" style={styles.gridVal}>
                          {selectedLog.entity_name || 'N/A'}
                        </AppText>
                      </View>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>Entity Type:</AppText>
                        <AppText variant="body" color="primary" style={styles.gridVal}>
                          {selectedLog.entity_type}
                        </AppText>
                      </View>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>Entity ID:</AppText>
                        <AppText variant="caption" color="secondary" style={[styles.gridVal, styles.monoText]}>
                          {selectedLog.entity_id}
                        </AppText>
                      </View>
                    </View>
                  </View>

                  {/* Administrative Actor Details */}
                  <View style={styles.modalSection}>
                    <AppText variant="label" color="brand" style={styles.sectionHeaderLabel}>
                      Authorized Actor
                    </AppText>
                    <View style={styles.detailGrid}>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>Administrator:</AppText>
                        <AppText variant="body" color="primary" style={styles.gridVal}>
                          {selectedLog.actor_name || 'Platform Admin'}
                        </AppText>
                      </View>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>Admin Email:</AppText>
                        <AppText variant="body" color="primary" style={styles.gridVal}>
                          {selectedLog.actor_email || 'N/A'}
                        </AppText>
                      </View>
                      {selectedLog.actor_id && (
                        <View style={styles.gridRow}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Actor ID:</AppText>
                          <AppText variant="caption" color="secondary" style={[styles.gridVal, styles.monoText]}>
                            {selectedLog.actor_id}
                          </AppText>
                        </View>
                      )}
                      {selectedLog.ip_address && (
                        <View style={styles.gridRow}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>IP Address:</AppText>
                          <AppText variant="body" color="primary" style={styles.gridVal}>
                            {selectedLog.ip_address}
                          </AppText>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Structured Event Metadata */}
                  {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                    <View style={styles.modalSection}>
                      <AppText variant="label" color="brand" style={styles.sectionHeaderLabel}>
                        Event Execution Metadata
                      </AppText>
                      <View style={styles.detailGrid}>
                        {Object.entries(selectedLog.details).map(([key, val]) => (
                          <View key={key} style={styles.gridRow}>
                            <AppText variant="caption" color="secondary" style={styles.gridKey}>
                              {key.replace(/_/g, ' ')}:
                            </AppText>
                            <AppText variant="body" color="primary" style={styles.gridVal}>
                              {typeof val === 'boolean' ? (val ? 'true' : 'false') : String(val)}
                            </AppText>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Immutability & Security Notice */}
                  <View style={styles.boundaryCard}>
                    <Lock size={15} color="#18794E" />
                    <AppText variant="caption" color="secondary" style={styles.boundaryText}>
                      Platform audit records are append-only and cryptographically immutable. Entries cannot be edited, modified, or deleted by any administrative role.
                    </AppText>
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalBottomActions}>
              <Button
                label="Close"
                variant="outline"
                onPress={() => setSelectedLog(null)}
                style={styles.modalCloseButton}
              />
            </View>
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
    marginBottom: Spacing.md,
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
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 8,
  },
  actionBadgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    gap: 5,
  },
  entityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  entityIcon: {
    marginTop: 1,
  },
  entityName: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: '#F0F5F2',
    gap: 12,
    flexWrap: 'wrap',
  },
  actorCol: {
    flex: 1,
    minWidth: 220,
    gap: 4,
  },
  inlineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reasonCard: {
    flex: 1.2,
    minWidth: 220,
    backgroundColor: '#FAFDFB',
    borderWidth: 1,
    borderColor: '#E2EBE6',
    borderRadius: Radius.sm,
    padding: 8,
  },
  reasonText: {
    fontStyle: 'italic',
    lineHeight: 16,
  },
  cardActionsRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: '#F0F5F2',
    flexDirection: 'row',
    justifyContent: 'flex-end',
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
    textTransform: 'capitalize',
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
    minWidth: 100,
  },
});
