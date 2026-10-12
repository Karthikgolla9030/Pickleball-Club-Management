/**
Aught2 Pickleball — Club Analytics & Operational Reports Screen (Phase 9)

Features:
  - Real persisted database analytics aggregated on the server.
  - Strict tenant boundary scoped to authorized active club.
  - Date preset selector: 7D, 30D, 90D, and Custom range.
  - Role-gated: requires manage_reports; payments require manage_payments.
  - Overview, Bookings & Utilization, Memberships, Competitions, and Financials tabs.
  - Sanitized CSV export action for spreadsheets.
  - Clean responsive layouts, loading skeleton, error states, and pull-to-refresh.
*/

import React, { useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  BarChart2,
  Calendar,
  Clock,
  DollarSign,
  Download,
  Trophy,
  Users,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  ModalSheet,
  Screen,
  SegmentedTabs,
} from '@/components';
import {
  useActiveClub,
  useBookingsReport,
  useClubAnalyticsSummary,
  useCompetitionsReport,
  useMembershipsReport,
  usePaymentsReport,
  usePermission,
} from '@/hooks';
import { analyticsApi } from '@/services/api';
import { Colors, Radius, Spacing } from '@/theme';
import { formatCurrency } from '@/utils';
import type { AnalyticsQueryFilters } from '@/types';

type PresetType = '7d' | '30d' | '90d' | 'custom';
type TabType = 'overview' | 'bookings' | 'memberships' | 'competitions' | 'payments';

export default function AnalyticsScreen() {
  const { clubId, clubName, clubSlug } = useActiveClub();
  const { canManageReports, canManagePayments } = usePermission();

  const [preset, setPreset] = useState<PresetType>('30d');
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [isExportModalVisible, setIsExportModalVisible] = useState(false);
  const [isCustomDateModalVisible, setIsCustomDateModalVisible] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const filters = useMemo<AnalyticsQueryFilters>(() => {
    if (preset === 'custom' && customStart && customEnd) {
      return { preset: 'custom', start_date: customStart, end_date: customEnd };
    }
    return { preset };
  }, [preset, customStart, customEnd]);

  // Data queries
  const summaryQuery = useClubAnalyticsSummary(clubId, filters, canManageReports);
  const bookingsQuery = useBookingsReport(
    clubId,
    filters,
    canManageReports && activeTab === 'bookings'
  );
  const membershipsQuery = useMembershipsReport(
    clubId,
    filters,
    canManageReports && activeTab === 'memberships'
  );
  const competitionsQuery = useCompetitionsReport(
    clubId,
    filters,
    canManageReports && activeTab === 'competitions'
  );
  const paymentsQuery = usePaymentsReport(
    clubId,
    filters,
    canManageReports && canManagePayments && activeTab === 'payments'
  );

  const isRefreshing =
    summaryQuery.isRefetching ||
    bookingsQuery.isRefetching ||
    membershipsQuery.isRefetching ||
    competitionsQuery.isRefetching ||
    paymentsQuery.isRefetching;

  const handleRefresh = async () => {
    if (activeTab === 'bookings') await bookingsQuery.refetch();
    else if (activeTab === 'memberships') await membershipsQuery.refetch();
    else if (activeTab === 'competitions') await competitionsQuery.refetch();
    else if (activeTab === 'payments') await paymentsQuery.refetch();
    await summaryQuery.refetch();
  };

  const handleExport = async (type: 'bookings' | 'memberships' | 'payments') => {
    if (!clubId) return;
    try {
      setExportLoading(true);
      const csvContent = await analyticsApi.exportCsv(clubId, type, filters);

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute(
          'download',
          `club_${clubSlug || 'analytics'}_${type}_${preset}.csv`
        );
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        Alert.alert(
          'Export Generated',
          `Successfully exported ${type} report (${csvContent.split('\n').length - 1} records).`
        );
      }
      setIsExportModalVisible(false);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Could not generate report export.';
      Alert.alert('Export Failed', errMsg);
    } finally {
      setExportLoading(false);
    }
  };

  const applyCustomDates = () => {
    if (!customStart || !customEnd) {
      Alert.alert('Invalid Dates', 'Please provide both start and end dates (YYYY-MM-DD).');
      return;
    }
    if (customStart > customEnd) {
      Alert.alert('Invalid Range', 'Start date cannot be after end date.');
      return;
    }
    setPreset('custom');
    setIsCustomDateModalVisible(false);
  };

  const tabs = useMemo(() => {
    const list = [
      { key: 'overview', label: 'Overview' },
      { key: 'bookings', label: 'Bookings' },
      { key: 'memberships', label: 'Members' },
      { key: 'competitions', label: 'Competitions' },
    ];
    if (canManagePayments) {
      list.push({ key: 'payments', label: 'Financials' });
    }
    return list;
  }, [canManagePayments]);

  if (!canManageReports) {
    return (
      <Screen style={styles.container}>
        <AppHeader title="Analytics & Reports" />
        <View style={styles.centerBox}>
          <EmptyState
            title="Access Restricted"
            description="Analytics and operational reports are accessible only to Club Owners and Club Managers."
          />
        </View>
      </Screen>
    );
  }

  const summary = summaryQuery.data;

  return (
    <Screen style={styles.container}>
      <AppHeader title="Analytics & Reports" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.brand.primary}
          />
        }
      >
        {/* Header Metadata */}
        <View style={styles.clubMetaCard}>
          <View style={styles.clubMetaText}>
            <AppText style={styles.clubNameText}>{clubName || 'Club Analytics'}</AppText>
            <AppText style={styles.timezoneText}>
              Timezone: {summary?.period.timezone || 'UTC'} • Range:{' '}
              {summary?.period.start_date} to {summary?.period.end_date}
            </AppText>
          </View>
          <TouchableOpacity
            style={styles.exportIconButton}
            onPress={() => setIsExportModalVisible(true)}
          >
            <Download size={16} color={Colors.brand.primary} />
            <AppText style={styles.exportBtnLabel}>Export</AppText>
          </TouchableOpacity>
        </View>

        {/* Date Filter Pills */}
        <View style={styles.presetFilterRow}>
          {(['7d', '30d', '90d'] as PresetType[]).map((p) => {
            const isSelected = preset === p;
            return (
              <TouchableOpacity
                key={p}
                style={[styles.presetChip, isSelected && styles.presetChipActive]}
                onPress={() => setPreset(p)}
              >
                <AppText style={[styles.presetChipText, isSelected && styles.presetChipTextActive]}>
                  {p.toUpperCase()}
                </AppText>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={[styles.presetChip, preset === 'custom' && styles.presetChipActive]}
            onPress={() => setIsCustomDateModalVisible(true)}
          >
            <Calendar size={13} color={preset === 'custom' ? Colors.white : Colors.text.secondary} />
            <AppText style={[styles.presetChipText, preset === 'custom' && styles.presetChipTextActive]}>
              Custom
            </AppText>
          </TouchableOpacity>
        </View>

        {/* Navigation Tabs */}
        <View style={styles.tabsWrapper}>
          <SegmentedTabs
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={(k) => setActiveTab(k as TabType)}
          />
        </View>

        {summaryQuery.isLoading && !summary ? (
          <View style={styles.loadingContainer}>
            <LoadingState message="Loading club analytics..." />
          </View>
        ) : summaryQuery.isError ? (
          <ErrorState
            message="Failed to load analytics data"
            onRetry={() => summaryQuery.refetch()}
          />
        ) : (
          <>
            {/* ─── TAB: OVERVIEW ─── */}
            {activeTab === 'overview' && summary && (
              <View style={styles.tabContent}>
                {/* KPI Grid */}
                <View style={styles.kpiGrid}>
                  {/* Utilization Card */}
                  <Card style={styles.kpiCard}>
                    <View style={styles.kpiHeader}>
                      <View style={[styles.kpiIconWrap, { backgroundColor: Colors.status.infoBg }]}>
                        <Clock size={18} color={Colors.status.info} />
                      </View>
                      <Badge
                        label={`${summary.bookings.court_utilization_rate}% Util`}
                        variant="info"
                      />
                    </View>
                    <AppText style={styles.kpiValueText}>{summary.bookings.total_bookings}</AppText>
                    <AppText style={styles.kpiLabelText}>Total Court Bookings</AppText>
                    <View style={styles.kpiSubRow}>
                      <AppText style={styles.kpiSubText}>
                        {summary.bookings.confirmed_count} Active • {summary.bookings.cancellation_rate}% Cancelled
                      </AppText>
                    </View>
                  </Card>

                  {/* Members Card */}
                  <Card style={styles.kpiCard}>
                    <View style={styles.kpiHeader}>
                      <View style={[styles.kpiIconWrap, { backgroundColor: Colors.status.successBg }]}>
                        <Users size={18} color={Colors.status.success} />
                      </View>
                      <Badge
                        label={`+${summary.memberships.new_members_in_period} New`}
                        variant="success"
                      />
                    </View>
                    <AppText style={styles.kpiValueText}>{summary.memberships.active_count}</AppText>
                    <AppText style={styles.kpiLabelText}>Active Club Players</AppText>
                    <View style={styles.kpiSubRow}>
                      <AppText style={styles.kpiSubText}>
                        {summary.memberships.pending_requests_count} Pending Applications
                      </AppText>
                    </View>
                  </Card>

                  {/* Competitions Card */}
                  <Card style={styles.kpiCard}>
                    <View style={styles.kpiHeader}>
                      <View style={[styles.kpiIconWrap, { backgroundColor: Colors.status.warningBg }]}>
                        <Trophy size={18} color={Colors.status.warning} />
                      </View>
                      <Badge
                        label={`${summary.competitions.active_leagues} Leagues`}
                        variant="warning"
                      />
                    </View>
                    <AppText style={styles.kpiValueText}>
                      {summary.competitions.total_tournaments + summary.competitions.total_leagues}
                    </AppText>
                    <AppText style={styles.kpiLabelText}>Competitions Run</AppText>
                    <View style={styles.kpiSubRow}>
                      <AppText style={styles.kpiSubText}>
                        {summary.competitions.total_tournament_registrations} Players Registered
                      </AppText>
                    </View>
                  </Card>

                  {/* Financials Card (Permission Gated) */}
                  {canManagePayments && summary.payments && (
                    <Card style={styles.kpiCard}>
                      <View style={styles.kpiHeader}>
                        <View style={[styles.kpiIconWrap, { backgroundColor: Colors.brand.primaryLight }]}>
                          <DollarSign size={18} color={Colors.brand.primary} />
                        </View>
                        <Badge label="Collected" variant="success" />
                      </View>
                      <AppText style={styles.kpiValueText}>
                        {formatCurrency(summary.payments.total_collected_amount)}
                      </AppText>
                      <AppText style={styles.kpiLabelText}>Revenue Collected</AppText>
                      <View style={styles.kpiSubRow}>
                        <AppText style={styles.kpiSubText}>
                          {summary.payments.succeeded_count} Paid • {formatCurrency(summary.payments.pending_amount)} Pending
                        </AppText>
                      </View>
                    </Card>
                  )}
                </View>

                {/* Daily Activity Trend Card */}
                <Card style={styles.sectionCard}>
                  <View style={styles.cardTitleRow}>
                    <BarChart2 size={18} color={Colors.brand.primary} />
                    <AppText style={styles.cardTitle}>Daily Bookings Trend</AppText>
                  </View>
                  <AppText style={styles.sectionSubtitle}>
                    Daily reservations across all active courts
                  </AppText>
                  <View style={styles.trendList}>
                    {summary.daily_bookings.slice(-7).map((item) => (
                      <View key={item.date} style={styles.trendRow}>
                        <View style={styles.trendDateCol}>
                          <AppText style={styles.trendDayText}>{item.day_name}</AppText>
                          <AppText style={styles.trendDateText}>{item.date.slice(5)}</AppText>
                        </View>
                        <View style={styles.trendBarContainer}>
                          <View
                            style={[
                              styles.trendBarFill,
                              {
                                width: `${Math.min(
                                  100,
                                  Math.max(
                                    5,
                                    (item.count /
                                      (Math.max(...summary.daily_bookings.map((d) => d.count)) || 1)) *
                                      100
                                  )
                                )}%`,
                              },
                            ]}
                          />
                        </View>
                        <AppText style={styles.trendCountText}>{item.count} bks</AppText>
                      </View>
                    ))}
                  </View>
                </Card>
              </View>
            )}

            {/* ─── TAB: BOOKINGS & UTILIZATION ─── */}
            {activeTab === 'bookings' && (
              <View style={styles.tabContent}>
                {bookingsQuery.isLoading ? (
                  <LoadingState message="Loading court details..." />
                ) : bookingsQuery.data ? (
                  <>
                    <Card style={styles.sectionCard}>
                      <AppText style={styles.cardTitle}>Booking Operational Breakdown</AppText>
                      <View style={styles.statsRow}>
                        <View style={styles.statBox}>
                          <AppText style={styles.statVal}>
                            {bookingsQuery.data.summary.total_bookings}
                          </AppText>
                          <AppText style={styles.statLbl}>Total</AppText>
                        </View>
                        <View style={styles.statBox}>
                          <AppText style={[styles.statVal, { color: Colors.status.success }]}>
                            {bookingsQuery.data.summary.confirmed_count}
                          </AppText>
                          <AppText style={styles.statLbl}>Confirmed</AppText>
                        </View>
                        <View style={styles.statBox}>
                          <AppText style={[styles.statVal, { color: Colors.status.info }]}>
                            {bookingsQuery.data.summary.completed_count}
                          </AppText>
                          <AppText style={styles.statLbl}>Completed</AppText>
                        </View>
                        <View style={styles.statBox}>
                          <AppText style={[styles.statVal, { color: Colors.status.error }]}>
                            {bookingsQuery.data.summary.cancelled_count}
                          </AppText>
                          <AppText style={styles.statLbl}>Cancelled</AppText>
                        </View>
                      </View>
                    </Card>

                    <Card style={styles.sectionCard}>
                      <AppText style={styles.cardTitle}>Court-by-Court Utilization</AppText>
                      <AppText style={styles.sectionSubtitle}>
                        Operating capacity: {bookingsQuery.data.summary.active_courts_count} courts
                      </AppText>
                      {bookingsQuery.data.by_court.map((c) => (
                        <View key={c.court_id} style={styles.courtItemRow}>
                          <View style={styles.courtNameCol}>
                            <AppText style={styles.courtNameText}>{c.court_name}</AppText>
                            <AppText style={styles.courtMetaText}>
                              {c.booking_count} bookings • {c.booked_minutes} mins
                            </AppText>
                          </View>
                          <View style={styles.courtBarWrapper}>
                            <View
                              style={[
                                styles.courtBarFill,
                                { width: `${Math.min(100, c.utilization_rate)}%` },
                              ]}
                            />
                          </View>
                          <Badge
                            label={`${c.utilization_rate}%`}
                            variant={c.utilization_rate > 50 ? 'success' : 'default'}
                          />
                        </View>
                      ))}
                    </Card>
                  </>
                ) : null}
              </View>
            )}

            {/* ─── TAB: MEMBERSHIPS ─── */}
            {activeTab === 'memberships' && (
              <View style={styles.tabContent}>
                {membershipsQuery.isLoading ? (
                  <LoadingState message="Loading membership report..." />
                ) : membershipsQuery.data ? (
                  <>
                    <Card style={styles.sectionCard}>
                      <AppText style={styles.cardTitle}>Player Membership Status</AppText>
                      <View style={styles.statsRow}>
                        <View style={styles.statBox}>
                          <AppText style={styles.statVal}>
                            {membershipsQuery.data.summary.total_player_memberships}
                          </AppText>
                          <AppText style={styles.statLbl}>Total</AppText>
                        </View>
                        <View style={styles.statBox}>
                          <AppText style={[styles.statVal, { color: Colors.status.success }]}>
                            {membershipsQuery.data.summary.active_count}
                          </AppText>
                          <AppText style={styles.statLbl}>Active</AppText>
                        </View>
                        <View style={styles.statBox}>
                          <AppText style={[styles.statVal, { color: Colors.status.warning }]}>
                            {membershipsQuery.data.summary.suspended_count}
                          </AppText>
                          <AppText style={styles.statLbl}>Suspended</AppText>
                        </View>
                        <View style={styles.statBox}>
                          <AppText style={[styles.statVal, { color: Colors.text.tertiary }]}>
                            {membershipsQuery.data.summary.expired_count}
                          </AppText>
                          <AppText style={styles.statLbl}>Expired</AppText>
                        </View>
                      </View>
                    </Card>

                    <Card style={styles.sectionCard}>
                      <AppText style={styles.cardTitle}>Membership Plan Subscriptions</AppText>
                      {membershipsQuery.data.plan_enrollments.length === 0 ? (
                        <AppText style={styles.emptyInlineText}>
                          No membership plans created yet.
                        </AppText>
                      ) : (
                        membershipsQuery.data.plan_enrollments.map((plan) => (
                          <View key={plan.plan_id} style={styles.planEnrollmentRow}>
                            <View>
                              <AppText style={styles.planNameText}>{plan.plan_name}</AppText>
                              <AppText style={styles.planPriceText}>
                                {formatCurrency(plan.price, plan.currency || 'USD')}
                              </AppText>
                            </View>
                            <Badge
                              label={`${plan.active_subscribers} Subscribers`}
                              variant="default"
                            />
                          </View>
                        ))
                      )}
                    </Card>
                  </>
                ) : null}
              </View>
            )}

            {/* ─── TAB: COMPETITIONS & COMMUNITY ─── */}
            {activeTab === 'competitions' && (
              <View style={styles.tabContent}>
                {competitionsQuery.isLoading ? (
                  <LoadingState message="Loading competition report..." />
                ) : competitionsQuery.data ? (
                  <>
                    <Card style={styles.sectionCard}>
                      <AppText style={styles.cardTitle}>Tournament & League Metrics</AppText>
                      <View style={styles.statsRow}>
                        <View style={styles.statBox}>
                          <AppText style={styles.statVal}>
                            {competitionsQuery.data.competitions.total_tournaments}
                          </AppText>
                          <AppText style={styles.statLbl}>Tournaments</AppText>
                        </View>
                        <View style={styles.statBox}>
                          <AppText style={[styles.statVal, { color: Colors.brand.primary }]}>
                            {competitionsQuery.data.competitions.total_tournament_registrations}
                          </AppText>
                          <AppText style={styles.statLbl}>Registrations</AppText>
                        </View>
                        <View style={styles.statBox}>
                          <AppText style={styles.statVal}>
                            {competitionsQuery.data.competitions.total_leagues}
                          </AppText>
                          <AppText style={styles.statLbl}>Leagues</AppText>
                        </View>
                        <View style={styles.statBox}>
                          <AppText style={[styles.statVal, { color: Colors.status.warning }]}>
                            {competitionsQuery.data.competitions.total_league_teams}
                          </AppText>
                          <AppText style={styles.statLbl}>Teams</AppText>
                        </View>
                      </View>
                    </Card>

                    <Card style={styles.sectionCard}>
                      <AppText style={styles.cardTitle}>Community Events & Lessons</AppText>
                      <View style={styles.statsRow}>
                        <View style={styles.statBox}>
                          <AppText style={styles.statVal}>
                            {competitionsQuery.data.community.total_events}
                          </AppText>
                          <AppText style={styles.statLbl}>Events</AppText>
                        </View>
                        <View style={styles.statBox}>
                          <AppText style={[styles.statVal, { color: Colors.status.info }]}>
                            {competitionsQuery.data.community.total_event_registrations}
                          </AppText>
                          <AppText style={styles.statLbl}>Registrations</AppText>
                        </View>
                        <View style={styles.statBox}>
                          <AppText style={styles.statVal}>
                            {competitionsQuery.data.community.total_lessons}
                          </AppText>
                          <AppText style={styles.statLbl}>Lessons</AppText>
                        </View>
                        <View style={styles.statBox}>
                          <AppText style={[styles.statVal, { color: Colors.status.success }]}>
                            {competitionsQuery.data.community.total_lesson_registrations}
                          </AppText>
                          <AppText style={styles.statLbl}>Students</AppText>
                        </View>
                      </View>
                    </Card>
                  </>
                ) : null}
              </View>
            )}

            {/* ─── TAB: FINANCIALS (Permission Gated) ─── */}
            {activeTab === 'payments' && canManagePayments && (
              <View style={styles.tabContent}>
                {paymentsQuery.isLoading ? (
                  <LoadingState message="Loading financial report..." />
                ) : paymentsQuery.data ? (
                  <>
                    <Card style={[styles.sectionCard, styles.heroFinancialCard]}>
                      <AppText style={styles.financialHeroLabel}>Total Revenue Collected</AppText>
                      <AppText style={styles.financialHeroValue}>
                        {formatCurrency(Number(paymentsQuery.data.summary.total_collected_amount))}
                      </AppText>
                      <AppText style={styles.financialHeroSub}>
                        {paymentsQuery.data.summary.succeeded_count} successful transactions in period
                      </AppText>
                    </Card>

                    <Card style={styles.sectionCard}>
                      <AppText style={styles.cardTitle}>Transaction Status Distribution</AppText>
                      <View style={styles.statsRow}>
                        <View style={styles.statBox}>
                          <AppText style={styles.statVal}>
                            {paymentsQuery.data.summary.total_recorded_count}
                          </AppText>
                          <AppText style={styles.statLbl}>Recorded</AppText>
                        </View>
                        <View style={styles.statBox}>
                          <AppText style={[styles.statVal, { color: Colors.status.success }]}>
                            {paymentsQuery.data.summary.succeeded_count}
                          </AppText>
                          <AppText style={styles.statLbl}>Succeeded</AppText>
                        </View>
                        <View style={styles.statBox}>
                          <AppText style={[styles.statVal, { color: Colors.status.warning }]}>
                            {paymentsQuery.data.summary.pending_count}
                          </AppText>
                          <AppText style={styles.statLbl}>Pending</AppText>
                        </View>
                        <View style={styles.statBox}>
                          <AppText style={[styles.statVal, { color: Colors.status.error }]}>
                            {paymentsQuery.data.summary.failed_count}
                          </AppText>
                          <AppText style={styles.statLbl}>Failed</AppText>
                        </View>
                      </View>
                    </Card>

                    <Card style={styles.sectionCard}>
                      <AppText style={styles.cardTitle}>Payment Method Breakdown</AppText>
                      {paymentsQuery.data.summary.by_method.map((meth) => (
                        <View key={meth.method} style={styles.methodRow}>
                          <View>
                            <AppText style={styles.methodNameText}>{meth.method_label}</AppText>
                            <AppText style={styles.methodCountText}>{meth.count} transactions</AppText>
                          </View>
                          <AppText style={styles.methodAmountText}>
                            {formatCurrency(Number(meth.amount))}
                          </AppText>
                        </View>
                      ))}
                    </Card>
                  </>
                ) : null}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Export Options Modal */}
      <ModalSheet
        visible={isExportModalVisible}
        onClose={() => setIsExportModalVisible(false)}
        title="Export Operational Data"
      >
        <View style={styles.exportModalContent}>
          <AppText style={styles.exportModalDesc}>
            Export sanitized CSV data for spreadsheet analysis. All fields are formatted and
            protected against formula injection.
          </AppText>

          <Button
            label="Export Bookings (CSV)"
            variant="outline"
            style={styles.exportBtn}
            loading={exportLoading}
            onPress={() => handleExport('bookings')}
          />
          <Button
            label="Export Memberships (CSV)"
            variant="outline"
            style={styles.exportBtn}
            loading={exportLoading}
            onPress={() => handleExport('memberships')}
          />
          {canManagePayments && (
            <Button
              label="Export Financial Payments (CSV)"
              variant="outline"
              style={styles.exportBtn}
              loading={exportLoading}
              onPress={() => handleExport('payments')}
            />
          )}
        </View>
      </ModalSheet>

      {/* Custom Date Range Modal */}
      <ModalSheet
        visible={isCustomDateModalVisible}
        onClose={() => setIsCustomDateModalVisible(false)}
        title="Custom Date Filter"
      >
        <View style={styles.modalFormContent}>
          <Input
            label="Start Date (YYYY-MM-DD)"
            value={customStart}
            onChangeText={setCustomStart}
            placeholder="2026-01-01"
          />
          <Input
            label="End Date (YYYY-MM-DD)"
            value={customEnd}
            onChangeText={setCustomEnd}
            placeholder="2026-01-31"
          />
          <Button
            label="Apply Range"
            variant="primary"
            onPress={applyCustomDates}
            style={styles.applyBtn}
          />
        </View>
      </ModalSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl * 2,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  clubMetaCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface.default,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    marginBottom: Spacing.sm,
  },
  clubMetaText: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  clubNameText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  timezoneText: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  exportIconButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.brand.primaryLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    gap: 4,
  },
  exportBtnLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.brand.primary,
  },
  presetFilterRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    gap: 4,
  },
  presetChipActive: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  presetChipText: {
    fontSize: 11,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  presetChipTextActive: {
    color: Colors.white,
    fontWeight: '700',
  },
  tabsWrapper: {
    marginBottom: Spacing.md,
  },
  loadingContainer: {
    paddingVertical: Spacing.xl * 2,
    alignItems: 'center',
  },
  tabContent: {
    gap: Spacing.md,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  kpiCard: {
    flex: 1,
    minWidth: '47%',
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  kpiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  kpiIconWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValueText: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  kpiLabelText: {
    fontSize: 11,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  kpiSubRow: {
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.surface.border,
  },
  kpiSubText: {
    fontSize: 10,
    color: Colors.text.secondary,
  },
  sectionCard: {
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginBottom: Spacing.md,
  },
  trendList: {
    gap: Spacing.xs,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  trendDateCol: {
    width: 60,
  },
  trendDayText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  trendDateText: {
    fontSize: 10,
    color: Colors.text.secondary,
  },
  trendBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.background.primary,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  trendBarFill: {
    height: '100%',
    backgroundColor: Colors.brand.primary,
    borderRadius: Radius.full,
  },
  trendCountText: {
    width: 48,
    fontSize: 11,
    color: Colors.text.secondary,
    textAlign: 'right',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: Spacing.sm,
  },
  statBox: {
    alignItems: 'center',
  },
  statVal: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  statLbl: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  courtItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
    gap: Spacing.sm,
  },
  courtNameCol: {
    width: 110,
  },
  courtNameText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  courtMetaText: {
    fontSize: 10,
    color: Colors.text.secondary,
  },
  courtBarWrapper: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.background.primary,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  courtBarFill: {
    height: '100%',
    backgroundColor: Colors.status.success,
    borderRadius: Radius.full,
  },
  emptyInlineText: {
    fontSize: 13,
    color: Colors.text.secondary,
    fontStyle: 'italic',
    paddingVertical: Spacing.sm,
  },
  planEnrollmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
  },
  planNameText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  planPriceText: {
    fontSize: 11,
    color: Colors.text.secondary,
  },
  heroFinancialCard: {
    backgroundColor: Colors.brand.primaryLight,
    borderColor: Colors.brand.primary,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  financialHeroLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.brand.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  financialHeroValue: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text.primary,
    marginVertical: 4,
  },
  financialHeroSub: {
    fontSize: 11,
    color: Colors.text.secondary,
  },
  methodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
  },
  methodNameText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  methodCountText: {
    fontSize: 11,
    color: Colors.text.secondary,
  },
  methodAmountText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  exportModalContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  exportModalDesc: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginBottom: Spacing.xs,
    lineHeight: 18,
  },
  exportBtn: {
    marginVertical: 2,
  },
  modalFormContent: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  applyBtn: {
    marginTop: Spacing.xs,
  },
});
