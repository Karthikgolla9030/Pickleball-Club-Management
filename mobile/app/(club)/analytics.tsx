/**
 * Aught2 Pickleball — Club Analytics & Operational Reports Screen
 *
 * Premium business analytics dashboard for club owners and managers:
 *   - Preserves Club Side design language: forest green accents, light surfaces, crisp typography.
 *   - Simplified Top Summary Card: compact, balanced, club branding, manual refresh & CSV export.
 *   - Compact Reporting Period Selector with clean dropdown sheet and subtle date/timezone context.
 *   - Responsive Court Capacity & Utilization Card: no heading/badge collisions, accurate small percentage handling.
 *   - Accurate Daily Booking Distribution & Revenue charts with sensible non-duplicated axis scales.
 *   - Clean empty states when zero bookings/revenue exist without misleading tall ghost bars.
 *   - Standardized KPI metric cards across all 5 sections (Overview, Bookings, Members, Competitions, Finance).
 *   - Strict multi-tenant isolation, real-time WebSocket invalidation, and sanitized CSV exports.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  DimensionValue,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Activity,
  AlertCircle,
  BarChart2,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  GraduationCap,
  Layers,
  LayoutDashboard,
  RotateCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Badge,
  Button,
  Card,
  DateRangePickerInput,
  ErrorState,
  LoadingState,
  ModalSheet,
  Screen,
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
import { Colors, Radius, Shadows, Spacing } from '@/theme';
import { formatCurrency, formatDuration } from '@/utils';
import type {
  AnalyticsQueryFilters,
  CourtUtilizationItem,
  DailyBookingTrend,
  DailyRevenueTrend,
  PaymentMethodBreakdown,
  PlanEnrollmentItem,
} from '@/types';

type PresetType = '7d' | '30d' | '90d' | 'custom';
type TabType = 'overview' | 'bookings' | 'memberships' | 'competitions' | 'payments';

interface TabItem {
  key: TabType;
  label: string;
  icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
}

const PRESET_OPTIONS: { id: PresetType; label: string; desc: string }[] = [
  { id: '7d', label: 'Last 7 days', desc: 'Past 7 days activity window' },
  { id: '30d', label: 'Last 30 days', desc: 'Standard monthly reporting cycle' },
  { id: '90d', label: 'Last 90 days', desc: 'Quarterly operational overview' },
  { id: 'custom', label: 'Custom date range', desc: 'Specify exact start and end dates' },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: STANDARDIZED KPI METRIC CARD
// ─────────────────────────────────────────────────────────────────────────────

interface AnalyticsKpiCardProps {
  label: string;
  value: string | number;
  badgeLabel?: string;
  badgeVariant?: 'success' | 'warning' | 'error' | 'info' | 'default';
  subText?: string;
  icon: React.ReactNode;
  iconBgColor: string;
  cardWidth?: DimensionValue;
}

function AnalyticsKpiCard({
  label,
  value,
  badgeLabel,
  badgeVariant = 'default',
  subText,
  icon,
  iconBgColor,
  cardWidth,
}: AnalyticsKpiCardProps) {
  return (
    <View style={[styles.kpiCard, cardWidth ? { width: cardWidth } : styles.kpiCardHalf]}>
      {/* Top Header: Small Icon Box + Restrained Badge */}
      <View style={styles.kpiTopRow}>
        <View style={[styles.kpiIconBox, { backgroundColor: iconBgColor }]}>
          {icon}
        </View>
        {badgeLabel ? (
          <Badge label={badgeLabel} variant={badgeVariant} size="sm" />
        ) : null}
      </View>

      {/* Middle: Prominent Value & Naturally Wrapping Label */}
      <View style={styles.kpiBody}>
        <AppText style={styles.kpiValueText} numberOfLines={1}>
          {value}
        </AppText>
        <AppText style={styles.kpiLabelText}>
          {label}
        </AppText>
      </View>

      {/* Bottom: Subtle Divider + Supporting Information */}
      {subText ? (
        <View style={styles.kpiFooter}>
          <AppText style={styles.kpiSubText}>
            {subText}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: DAILY BOOKINGS BAR CHART (Sensible Scale & Clean Zero State)
// ─────────────────────────────────────────────────────────────────────────────

interface DailyBookingsChartProps {
  dailyData: DailyBookingTrend[];
  title?: string;
  subtitle?: string;
}

function DailyBookingsChart({
  dailyData,
  title = 'Daily Booking Distribution',
  subtitle = 'Court reservation volume across all active courts',
}: DailyBookingsChartProps) {
  const chartItems = useMemo(() => {
    return dailyData.slice(-7);
  }, [dailyData]);

  const { maxCount, totalCount, avgCount, peakItem, isAllZero } = useMemo(() => {
    if (!chartItems.length) {
      return { maxCount: 0, totalCount: 0, avgCount: '0.0', peakItem: null, isAllZero: true };
    }
    const counts = chartItems.map((d) => d.count);
    const sum = counts.reduce((acc, curr) => acc + curr, 0);
    const max = Math.max(...counts, 0);
    const avg = (sum / chartItems.length).toFixed(1);
    const peak = sum > 0 ? chartItems.reduce((prev, curr) => (curr.count > prev.count ? curr : prev), chartItems[0]) : null;
    return { maxCount: max, totalCount: sum, avgCount: avg, peakItem: peak, isAllZero: sum === 0 };
  }, [chartItems]);

  // Sensible Y-axis scale with distinct grid levels (NO DUPLICATE 1-1-0 LABELS!)
  const yAxisTicks = useMemo(() => {
    if (isAllZero || maxCount <= 0) {
      return [0];
    }
    if (maxCount === 1) {
      return [1, 0];
    }
    if (maxCount === 2) {
      return [2, 1, 0];
    }
    const mid = Math.ceil(maxCount / 2);
    return [maxCount, mid, 0];
  }, [maxCount, isAllZero]);

  return (
    <Card style={styles.chartCard}>
      {/* Header */}
      <View style={styles.chartHeader}>
        <View style={styles.chartTitleCol}>
          <View style={styles.chartTitleRow}>
            <View style={styles.chartIconWrap}>
              <BarChart2 size={15} color={Colors.brand.primary} />
            </View>
            <AppText style={styles.chartHeading}>{title}</AppText>
          </View>
          <AppText style={styles.chartSubheading}>{subtitle}</AppText>
        </View>

        {peakItem && peakItem.count > 0 && (
          <View style={styles.peakBadge}>
            <TrendingUp size={11} color={Colors.brand.primary} />
            <AppText style={styles.peakBadgeText}>Peak: {peakItem.day_name}</AppText>
          </View>
        )}
      </View>

      {/* Quick Summary Metrics Ribbon */}
      <View style={styles.chartMetricRibbon}>
        <View style={styles.ribbonItem}>
          <AppText style={styles.ribbonLabel}>Total in Period</AppText>
          <AppText style={styles.ribbonValue}>
            {totalCount} {totalCount === 1 ? 'booking' : 'bookings'}
          </AppText>
        </View>
        <View style={styles.ribbonDivider} />
        <View style={styles.ribbonItem}>
          <AppText style={styles.ribbonLabel}>Daily Average</AppText>
          <AppText style={styles.ribbonValue}>{avgCount} / day</AppText>
        </View>
        <View style={styles.ribbonDivider} />
        <View style={styles.ribbonItem}>
          <AppText style={styles.ribbonLabel}>Highest Day</AppText>
          <AppText style={styles.ribbonValue}>
            {peakItem && peakItem.count > 0 ? `${peakItem.count} bookings` : '0 bookings'}
          </AppText>
        </View>
      </View>

      {/* Zero Activity Notice Banner & Clean Empty State */}
      {isAllZero ? (
        <View style={styles.chartZeroStateWrap}>
          <View style={styles.chartZeroBanner}>
            <CalendarCheck size={14} color={Colors.text.secondary} />
            <AppText style={styles.chartZeroBannerText}>
              No bookings recorded during this period
            </AppText>
          </View>
          {chartItems.length > 0 ? (
            <View style={styles.chartZeroDaysGrid}>
              {chartItems.map((item) => (
                <View key={item.date} style={styles.zeroDayCol}>
                  <AppText style={styles.zeroDayCount}>0</AppText>
                  <View style={styles.zeroDayTrack} />
                  <AppText style={styles.barDayLabel}>{item.day_name.slice(0, 3)}</AppText>
                  <AppText style={styles.barDateLabel}>
                    {item.date.length >= 10 ? item.date.slice(5) : item.date}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.chartViewport}>
          {/* Dynamic grid lines matching yAxisTicks without duplicates */}
          <View style={styles.chartGridLines}>
            {yAxisTicks.map((tick, idx) => (
              <View key={idx} style={styles.chartGridLine}>
                <AppText style={styles.gridLineLabel}>{tick}</AppText>
                <View style={tick === 0 ? styles.gridLineSolid : styles.gridLineDotted} />
              </View>
            ))}
          </View>

          {/* Vertical Bar Columns */}
          <View style={styles.barsContainer}>
            {chartItems.map((item) => {
              const heightPercent = item.count > 0 && maxCount > 0
                ? Math.max(10, Math.round((item.count / maxCount) * 100))
                : 0;
              const isPeak = item.count === maxCount && item.count > 0;
              const shortDate = item.date.length >= 10 ? item.date.slice(5) : item.date;

              return (
                <View key={item.date} style={styles.barCol}>
                  {/* Floating count tag */}
                  <AppText style={[styles.barCountTag, isPeak && styles.barCountTagPeak]}>
                    {item.count}
                  </AppText>

                  {/* Bar Track & Fill */}
                  <View style={styles.barTrack}>
                    {heightPercent > 0 ? (
                      <View
                        style={[
                          styles.barFill,
                          { height: `${heightPercent}%` },
                          isPeak && styles.barFillPeak,
                        ]}
                      />
                    ) : null}
                  </View>

                  {/* Day and Date Labels */}
                  <AppText style={[styles.barDayLabel, isPeak && styles.barDayLabelPeak]}>
                    {item.day_name.slice(0, 3)}
                  </AppText>
                  <AppText style={styles.barDateLabel}>{shortDate}</AppText>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: DAILY REVENUE BAR CHART (Sensible Scale & Clean Zero State)
// ─────────────────────────────────────────────────────────────────────────────

interface DailyRevenueChartProps {
  dailyRevenue: DailyRevenueTrend[];
}

function DailyRevenueChart({ dailyRevenue }: DailyRevenueChartProps) {
  const chartItems = useMemo(() => dailyRevenue.slice(-7), [dailyRevenue]);

  const { maxAmount, totalRev, peakDay, isAllZero } = useMemo(() => {
    if (!chartItems.length) {
      return { maxAmount: 0, totalRev: 0, peakDay: null, isAllZero: true };
    }
    const amounts = chartItems.map((d) => parseFloat(d.amount) || 0);
    const sum = amounts.reduce((acc, curr) => acc + curr, 0);
    const max = Math.max(...amounts, 0);
    const peak = sum > 0
      ? chartItems.reduce(
          (prev, curr) => ((parseFloat(curr.amount) || 0) > (parseFloat(prev.amount) || 0) ? curr : prev),
          chartItems[0]
        )
      : null;
    return { maxAmount: max, totalRev: sum, peakDay: peak, isAllZero: sum === 0 };
  }, [chartItems]);

  const yAxisTicks = useMemo(() => {
    if (isAllZero || maxAmount <= 0) {
      return [0];
    }
    const mid = Math.round(maxAmount / 2);
    return [maxAmount, mid, 0];
  }, [maxAmount, isAllZero]);

  return (
    <Card style={styles.chartCard}>
      <View style={styles.chartHeader}>
        <View style={styles.chartTitleCol}>
          <View style={styles.chartTitleRow}>
            <View style={[styles.chartIconWrap, { backgroundColor: Colors.brand.primaryLight }]}>
              <DollarSign size={15} color={Colors.brand.primary} />
            </View>
            <AppText style={styles.chartHeading}>Daily Revenue Trend</AppText>
          </View>
          <AppText style={styles.chartSubheading}>Daily collected payments volume</AppText>
        </View>
        <View style={styles.peakBadge}>
          <AppText style={styles.peakBadgeText}>Total: {formatCurrency(totalRev)}</AppText>
        </View>
      </View>

      {/* Zero Activity Notice Banner & Clean Empty State */}
      {isAllZero ? (
        <View style={styles.chartZeroStateWrap}>
          <View style={styles.chartZeroBanner}>
            <CreditCard size={14} color={Colors.text.secondary} />
            <AppText style={styles.chartZeroBannerText}>
              No revenue recorded during this period
            </AppText>
          </View>
          {chartItems.length > 0 ? (
            <View style={styles.chartZeroDaysGrid}>
              {chartItems.map((item) => (
                <View key={item.date} style={styles.zeroDayCol}>
                  <AppText style={styles.zeroDayCount}>$0</AppText>
                  <View style={styles.zeroDayTrack} />
                  <AppText style={styles.barDayLabel}>
                    {item.date.length >= 10 ? item.date.slice(5) : item.date}
                  </AppText>
                  <AppText style={styles.barDateLabel}>0 txns</AppText>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.chartViewport}>
          <View style={styles.chartGridLines}>
            {yAxisTicks.map((tick, idx) => (
              <View key={idx} style={styles.chartGridLine}>
                <AppText style={styles.gridLineLabel}>
                  {tick > 0 ? formatCurrency(tick).replace('.00', '') : '$0'}
                </AppText>
                <View style={tick === 0 ? styles.gridLineSolid : styles.gridLineDotted} />
              </View>
            ))}
          </View>

          <View style={styles.barsContainer}>
            {chartItems.map((item) => {
              const amountNum = parseFloat(item.amount) || 0;
              const heightPercent = amountNum > 0 && maxAmount > 0
                ? Math.max(10, Math.round((amountNum / maxAmount) * 100))
                : 0;
              const isPeak = item === peakDay && amountNum > 0;
              const shortDate = item.date.length >= 10 ? item.date.slice(5) : item.date;

              return (
                <View key={item.date} style={styles.barCol}>
                  <AppText style={[styles.barCountTag, isPeak && styles.barCountTagPeak]}>
                    {amountNum > 0 ? `$${Math.round(amountNum)}` : '$0'}
                  </AppText>
                  <View style={styles.barTrack}>
                    {heightPercent > 0 ? (
                      <View
                        style={[
                          styles.barFill,
                          { height: `${heightPercent}%`, backgroundColor: isPeak ? Colors.brand.primary : '#2E8069' },
                        ]}
                      />
                    ) : null}
                  </View>
                  <AppText style={styles.barDayLabel}>{shortDate}</AppText>
                  <AppText style={styles.barDateLabel}>{item.succeeded_count} txns</AppText>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const { clubId, clubName } = useActiveClub();
  const { canManageReports, canManagePayments } = usePermission();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isDesktop = windowWidth >= 768;
  const isSmallPhone = windowWidth <= 340;

  const [preset, setPreset] = useState<PresetType>('30d');
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [isExportModalVisible, setIsExportModalVisible] = useState(false);
  const [isCustomDateModalVisible, setIsCustomDateModalVisible] = useState(false);
  const [isPeriodPickerVisible, setIsPeriodPickerVisible] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Tab horizontal scroll ref & layout measurements for automatic centering
  const tabsScrollRef = useRef<ScrollView>(null);
  const tabLayoutsRef = useRef<Record<string, { x: number; width: number }>>({});

  const filters = useMemo<AnalyticsQueryFilters>(() => {
    if (preset === 'custom' && customStart && customEnd) {
      return { preset: 'custom', start_date: customStart, end_date: customEnd };
    }
    return { preset };
  }, [preset, customStart, customEnd]);

  // TanStack Query Hooks with automatic refetch on filter or active club change
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

  // Track data update timestamps
  useEffect(() => {
    if (
      summaryQuery.dataUpdatedAt ||
      bookingsQuery.dataUpdatedAt ||
      membershipsQuery.dataUpdatedAt ||
      competitionsQuery.dataUpdatedAt ||
      paymentsQuery.dataUpdatedAt
    ) {
      setLastUpdated(new Date());
    }
  }, [
    summaryQuery.dataUpdatedAt,
    bookingsQuery.dataUpdatedAt,
    membershipsQuery.dataUpdatedAt,
    competitionsQuery.dataUpdatedAt,
    paymentsQuery.dataUpdatedAt,
  ]);

  const handleRefresh = async () => {
    try {
      if (activeTab === 'bookings') await bookingsQuery.refetch();
      else if (activeTab === 'memberships') await membershipsQuery.refetch();
      else if (activeTab === 'competitions') await competitionsQuery.refetch();
      else if (activeTab === 'payments') await paymentsQuery.refetch();
      await summaryQuery.refetch();
      setLastUpdated(new Date());
    } catch {
      // Ignored: Query error state will display error card
    }
  };

  const handleExport = async (type: 'bookings' | 'memberships' | 'payments') => {
    if (!clubId) return;
    setExportLoading(true);
    try {
      const csvData = await analyticsApi.exportCsv(clubId, type, filters);

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${type}_export_${filters.preset || 'report'}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        Alert.alert('Export Ready', `Generated ${type} CSV (${csvData.length} bytes).`);
      }
      setIsExportModalVisible(false);
    } catch {
      Alert.alert('Export Failed', 'Unable to generate CSV report. Please try again.');
    } finally {
      setExportLoading(false);
    }
  };

  // Tab definitions: Overview, Bookings, Members, Competitions, Finance
  const tabs = useMemo<TabItem[]>(() => {
    const list: TabItem[] = [
      { key: 'overview', label: 'Overview', icon: LayoutDashboard },
      { key: 'bookings', label: 'Bookings', icon: CalendarCheck },
      { key: 'memberships', label: 'Members', icon: Users },
      { key: 'competitions', label: 'Competitions', icon: Trophy },
    ];
    if (canManagePayments) {
      list.push({ key: 'payments', label: 'Finance', icon: DollarSign });
    }
    return list;
  }, [canManagePayments]);

  const handleTabSelect = (tabKey: TabType) => {
    setActiveTab(tabKey);
    const layout = tabLayoutsRef.current[tabKey];
    if (layout && tabsScrollRef.current) {
      const containerWidth = windowWidth - Spacing.md * 2;
      const targetX = Math.max(0, layout.x - containerWidth / 2 + layout.width / 2);
      tabsScrollRef.current.scrollTo({ x: targetX, animated: true });
    }
  };

  // Center the active tab on mount or when window size changes
  useEffect(() => {
    const layout = tabLayoutsRef.current[activeTab];
    if (layout && tabsScrollRef.current) {
      const containerWidth = windowWidth - Spacing.md * 2;
      const targetX = Math.max(0, layout.x - containerWidth / 2 + layout.width / 2);
      tabsScrollRef.current.scrollTo({ x: targetX, animated: true });
    } else if (activeTab === 'overview' && tabsScrollRef.current) {
      tabsScrollRef.current.scrollTo({ x: 0, animated: false });
    }
  }, [activeTab, windowWidth]);

  // Clean trigger label for the compact reporting period selector
  const presetDisplayLabel = useMemo(() => {
    switch (preset) {
      case '7d':
        return 'Last 7 days';
      case '30d':
        return 'Last 30 days';
      case '90d':
        return 'Last 90 days';
      case 'custom':
        return customStart && customEnd ? `${customStart} – ${customEnd}` : 'Custom range';
    }
  }, [preset, customStart, customEnd]);

  // Subtle secondary date range string
  const formattedDateRangeText = useMemo(() => {
    if (summaryQuery.data?.period) {
      const p = summaryQuery.data.period;
      const tz = p.timezone || 'UTC';
      return `${p.start_date} → ${p.end_date} · ${tz}`;
    }
    return '';
  }, [summaryQuery.data?.period]);

  const lastUpdatedText = useMemo(() => {
    try {
      const timeStr = lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `Updated at ${timeStr}`;
    } catch {
      return 'Updated just now';
    }
  }, [lastUpdated]);

  // Balanced 2-column mobile KPI width
  const kpiCardWidth = useMemo<DimensionValue>(() => {
    if (isDesktop) return '23.5%';
    if (isSmallPhone) return '100%';
    const availableWidth = windowWidth - Spacing.md * 2 - Spacing.sm;
    return Math.floor(availableWidth / 2);
  }, [isDesktop, isSmallPhone, windowWidth]);

  const summary = summaryQuery.data;

  if (!canManageReports) {
    return (
      <Screen testID="analytics-screen" style={styles.container}>
        <AppHeader title="Analytics & Reports" />
        <View style={styles.restrictedContainer}>
          <ShieldCheck size={48} color={Colors.text.tertiary} />
          <AppText style={styles.restrictedTitle}>Access Restricted</AppText>
          <AppText style={styles.restrictedDesc}>
            You do not have permission to view club analytics and reports.
          </AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen testID="analytics-screen" style={styles.container}>
      <AppHeader title="Analytics & Reports" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom + 68, 96) },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[Colors.brand.primary]}
            tintColor={Colors.brand.primary}
          />
        }
      >
        {/* ─── 1. SIMPLIFIED TOP SUMMARY CARD ─── */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryContentRow}>
            <View style={styles.summaryIdentityGroup}>
              <View style={styles.clubIconSquircle}>
                <Building2 size={19} color={Colors.brand.primary} strokeWidth={2.2} />
              </View>
              <View style={styles.summaryTextCol}>
                <AppText style={styles.summaryClubName} numberOfLines={1}>
                  {clubName || 'Pickleball Club'}
                </AppText>
                <AppText style={styles.summarySubtitle}>Operational Intelligence & Reports</AppText>
              </View>
            </View>

            <View style={styles.summaryActionsRow}>
              <TouchableOpacity
                style={styles.refreshIconButton}
                onPress={handleRefresh}
                disabled={isRefreshing}
                activeOpacity={0.7}
                accessibilityLabel="Refresh operational analytics"
                accessibilityRole="button"
              >
                <RotateCw
                  size={14}
                  color={Colors.brand.primary}
                  strokeWidth={2.2}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.exportButton}
                onPress={() => setIsExportModalVisible(true)}
                activeOpacity={0.75}
                accessibilityLabel="Export report data as CSV"
                accessibilityRole="button"
              >
                <Download size={13} color={Colors.brand.primary} strokeWidth={2.2} />
                <AppText style={styles.exportButtonText}>Export CSV</AppText>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ─── 2. COMPACT REPORTING PERIOD SELECTOR ─── */}
        <View style={styles.periodFilterCard}>
          <View style={styles.periodFilterHeaderRow}>
            <View style={styles.periodLabelCol}>
              <AppText style={styles.periodSectionTitle}>Reporting Period</AppText>
              <AppText style={styles.periodSubDateRange} numberOfLines={1}>
                {formattedDateRangeText || presetDisplayLabel}
              </AppText>
            </View>

            <TouchableOpacity
              style={styles.periodDropdownTrigger}
              onPress={() => setIsPeriodPickerVisible(true)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`Selected period: ${presetDisplayLabel}. Tap to change.`}
            >
              <Calendar size={13} color={Colors.brand.primary} strokeWidth={2.2} />
              <AppText style={styles.periodDropdownTriggerText}>
                {presetDisplayLabel}
              </AppText>
              <ChevronDown size={14} color={Colors.text.secondary} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          <View style={styles.periodMetaFooter}>
            <View style={styles.periodLiveIndicator}>
              <View style={styles.periodLiveDot} />
              <AppText style={styles.periodLiveText}>Live Data</AppText>
            </View>
            <AppText style={styles.periodLastUpdatedText}>{lastUpdatedText}</AppText>
          </View>
        </View>

        {/* ─── 3. ANALYTICS NAVIGATION TABS ─── */}
        <View style={styles.navTabsOuter}>
          <ScrollView
            ref={tabsScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.navTabsContent}
            bounces={false}
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              const IconComp = tab.icon;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.navTabPill, isActive && styles.navTabPillActive]}
                  onPress={() => handleTabSelect(tab.key)}
                  onLayout={(e) => {
                    const { x, width } = e.nativeEvent.layout;
                    tabLayoutsRef.current[tab.key] = { x, width };
                  }}
                  activeOpacity={0.75}
                  accessibilityRole="tab"
                  accessibilityLabel={tab.label}
                  accessibilityState={{ selected: isActive }}
                >
                  <IconComp
                    size={14}
                    color={isActive ? Colors.white : Colors.text.secondary}
                    strokeWidth={isActive ? 2.2 : 1.8}
                  />
                  <AppText
                    style={[styles.navTabLabel, isActive && styles.navTabLabelActive]}
                  >
                    {tab.label}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ─── 4. MAIN ANALYTICS CONTENT AREA ─── */}
        {summaryQuery.isLoading && !summary ? (
          <View style={styles.loadingContainer}>
            <LoadingState message="Aggregating club operational analytics..." />
          </View>
        ) : summaryQuery.isError ? (
          <ErrorState
            message="Failed to load analytics data"
            onRetry={() => summaryQuery.refetch()}
          />
        ) : (
          <>
            {/* ══════════════════════════════════════════════════════════════════
                TAB 1: OVERVIEW
               ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'overview' && summary && (
              <View style={styles.tabContent}>
                {/* Balanced 2x2 Overview KPI Grid */}
                <View style={styles.kpiGrid}>
                  {/* KPI 1: Court Bookings */}
                  <AnalyticsKpiCard
                    cardWidth={kpiCardWidth}
                    icon={<Clock size={17} color={Colors.status.info} strokeWidth={2} />}
                    iconBgColor={Colors.status.infoBg}
                    badgeLabel={`${summary.bookings.court_utilization_rate}% Util`}
                    badgeVariant="info"
                    value={summary.bookings.total_bookings}
                    label="Total Court Bookings"
                    subText={`${summary.bookings.confirmed_count} Active • ${summary.bookings.cancellation_rate}% Cancelled`}
                  />

                  {/* KPI 2: Active Players */}
                  <AnalyticsKpiCard
                    cardWidth={kpiCardWidth}
                    icon={<Users size={17} color={Colors.status.success} strokeWidth={2} />}
                    iconBgColor={Colors.status.successBg}
                    badgeLabel={`+${summary.memberships.new_members_in_period} New`}
                    badgeVariant="success"
                    value={summary.memberships.active_count}
                    label="Active Club Players"
                    subText={`${summary.memberships.pending_requests_count} Pending Applications`}
                  />

                  {/* KPI 3: Competitions */}
                  <AnalyticsKpiCard
                    cardWidth={kpiCardWidth}
                    icon={<Trophy size={17} color={Colors.status.warning} strokeWidth={2} />}
                    iconBgColor={Colors.status.warningBg}
                    badgeLabel={`${summary.competitions.active_leagues} Leagues`}
                    badgeVariant="warning"
                    value={summary.competitions.total_tournaments + summary.competitions.total_leagues}
                    label="Competitions Run"
                    subText={`${summary.competitions.total_tournament_registrations} Players Registered`}
                  />

                  {/* KPI 4: Financial Revenue (Or Community Events fallback) */}
                  {canManagePayments && summary.payments ? (
                    <AnalyticsKpiCard
                      cardWidth={kpiCardWidth}
                      icon={<DollarSign size={17} color={Colors.brand.primary} strokeWidth={2} />}
                      iconBgColor={Colors.brand.primaryLight}
                      badgeLabel="Collected"
                      badgeVariant="success"
                      value={formatCurrency(summary.payments.total_collected_amount)}
                      label="Revenue Collected"
                      subText={`${summary.payments.succeeded_count} Paid • ${formatCurrency(summary.payments.pending_amount)} Pending`}
                    />
                  ) : (
                    <AnalyticsKpiCard
                      cardWidth={kpiCardWidth}
                      icon={<Sparkles size={17} color={Colors.brand.primary} strokeWidth={2} />}
                      iconBgColor={Colors.brand.primaryLight}
                      badgeLabel={`${summary.community.total_event_registrations + summary.community.total_lesson_registrations} Enrolled`}
                      badgeVariant="default"
                      value={summary.community.total_events + summary.community.total_lessons}
                      label="Community Programs"
                      subText={`${summary.community.total_events} Events • ${summary.community.total_lessons} Lessons`}
                    />
                  )}
                </View>

                {/* Daily Bookings Trend Chart */}
                <DailyBookingsChart dailyData={summary.daily_bookings} />

                {/* Court Utilization & Capacity Overview Card (Fixed collisions & wrapping) */}
                <Card style={styles.sectionCard}>
                  <View style={styles.utilizationHeaderRow}>
                    <View style={styles.sectionIconTitle}>
                      <Activity size={16} color={Colors.brand.primary} strokeWidth={2.2} />
                      <AppText style={styles.cardTitle}>Court Capacity & Utilization</AppText>
                    </View>
                    <View style={styles.utilizationBadgeContainer}>
                      <View
                        style={[
                          styles.utilizationBadge,
                          summary.bookings.court_utilization_rate > 50
                            ? styles.utilizationBadgeSuccess
                            : styles.utilizationBadgeDefault,
                        ]}
                      >
                        <AppText
                          style={[
                            styles.utilizationBadgeText,
                            summary.bookings.court_utilization_rate > 50
                              ? styles.utilizationBadgeTextSuccess
                              : styles.utilizationBadgeTextDefault,
                          ]}
                          numberOfLines={1}
                        >
                          {summary.bookings.court_utilization_rate.toFixed(1)}% UTILIZATION
                        </AppText>
                      </View>
                    </View>
                  </View>

                  <AppText style={styles.sectionSubtitle}>
                    Active facility runtime across {summary.bookings.active_courts_count} operational courts
                  </AppText>

                  {/* Utilization Progress Bar */}
                  <View style={styles.utilizationProgressSection}>
                    <View style={styles.progressContainer}>
                      {summary.bookings.court_utilization_rate > 0 ? (
                        <View
                          style={[
                            styles.progressBarFill,
                            {
                              width: `${Math.min(100, Math.max(0, summary.bookings.court_utilization_rate))}%`,
                              minWidth: 4, // Clean visible sliver even for 0.2%
                              backgroundColor:
                                summary.bookings.court_utilization_rate > 50
                                  ? Colors.status.success
                                  : Colors.brand.primary,
                            },
                          ]}
                        />
                      ) : null}
                    </View>

                    <View style={styles.utilizationDetailRow}>
                      <AppText style={styles.utilizationDetailText}>
                        {summary.bookings.court_utilization_rate > 0
                          ? `${summary.bookings.court_utilization_rate.toFixed(1)}% of operational court-hours utilized`
                          : '0.0% court runtime utilized in period'}
                      </AppText>
                      <AppText style={styles.utilizationCapacityText}>
                        {((summary.bookings.total_operating_minutes || 0) / 60).toFixed(0)} hrs capacity
                      </AppText>
                    </View>
                  </View>

                  {/* Supporting metrics strip */}
                  <View style={styles.metricStatsStrip}>
                    <View style={styles.metricStatBox}>
                      <AppText style={styles.metricStatValue}>
                        {summary.bookings.active_courts_count}
                      </AppText>
                      <AppText style={styles.metricStatLabel}>Active Courts</AppText>
                    </View>
                    <View style={styles.metricStatDivider} />
                    <View style={styles.metricStatBox}>
                      <AppText style={styles.metricStatValue}>
                        {(summary.bookings.total_booked_minutes / 60).toFixed(1)} hrs
                      </AppText>
                      <AppText style={styles.metricStatLabel}>Booked Time</AppText>
                    </View>
                    <View style={styles.metricStatDivider} />
                    <View style={styles.metricStatBox}>
                      <AppText
                        style={[
                          styles.metricStatValue,
                          {
                            color:
                              summary.bookings.cancellation_rate > 20
                                ? Colors.status.error
                                : Colors.text.primary,
                          },
                        ]}
                      >
                        {summary.bookings.cancellation_rate}%
                      </AppText>
                      <AppText style={styles.metricStatLabel}>Cancellation</AppText>
                    </View>
                  </View>
                </Card>

                {/* Community & Coaching Reach */}
                <Card style={styles.sectionCard}>
                  <View style={styles.sectionCardHeader}>
                    <View style={styles.sectionIconTitle}>
                      <GraduationCap size={16} color={Colors.brand.primary} strokeWidth={2} />
                      <AppText style={styles.cardTitle}>Community & Coaching Reach</AppText>
                    </View>
                  </View>
                  <AppText style={styles.sectionSubtitle}>
                    Social events, clinics, and professional coaching sessions
                  </AppText>

                  <View style={styles.metricStatsStrip}>
                    <View style={styles.metricStatBox}>
                      <AppText style={styles.metricStatValue}>
                        {summary.community.total_events}
                      </AppText>
                      <AppText style={styles.metricStatLabel}>Events</AppText>
                    </View>
                    <View style={styles.metricStatDivider} />
                    <View style={styles.metricStatBox}>
                      <AppText style={styles.metricStatValue}>
                        {summary.community.total_event_registrations}
                      </AppText>
                      <AppText style={styles.metricStatLabel}>Event Players</AppText>
                    </View>
                    <View style={styles.metricStatDivider} />
                    <View style={styles.metricStatBox}>
                      <AppText style={styles.metricStatValue}>
                        {summary.community.total_lessons}
                      </AppText>
                      <AppText style={styles.metricStatLabel}>Lessons</AppText>
                    </View>
                    <View style={styles.metricStatDivider} />
                    <View style={styles.metricStatBox}>
                      <AppText style={styles.metricStatValue}>
                        {summary.community.total_lesson_registrations}
                      </AppText>
                      <AppText style={styles.metricStatLabel}>Students</AppText>
                    </View>
                  </View>
                </Card>
              </View>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                TAB 2: BOOKINGS & UTILIZATION
               ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'bookings' && (
              <View style={styles.tabContent}>
                {bookingsQuery.isLoading ? (
                  <LoadingState message="Loading court booking reports..." />
                ) : bookingsQuery.isError ? (
                  <ErrorState
                    message="Failed to load bookings report"
                    onRetry={() => bookingsQuery.refetch()}
                  />
                ) : bookingsQuery.data ? (
                  <>
                    {/* Operational Status Breakdown */}
                    <View style={styles.kpiGrid}>
                      <AnalyticsKpiCard
                        cardWidth={kpiCardWidth}
                        icon={<CalendarDays size={17} color={Colors.brand.primary} strokeWidth={2} />}
                        iconBgColor={Colors.brand.primaryLight}
                        value={bookingsQuery.data.summary.total_bookings}
                        label="Total Bookings"
                        subText="All reservations in period"
                      />
                      <AnalyticsKpiCard
                        cardWidth={kpiCardWidth}
                        icon={<CheckCircle2 size={17} color={Colors.status.success} strokeWidth={2} />}
                        iconBgColor={Colors.status.successBg}
                        value={bookingsQuery.data.summary.confirmed_count}
                        label="Confirmed"
                        badgeLabel="Active"
                        badgeVariant="success"
                        subText="Scheduled reservations"
                      />
                      <AnalyticsKpiCard
                        cardWidth={kpiCardWidth}
                        icon={<Clock size={17} color={Colors.status.info} strokeWidth={2} />}
                        iconBgColor={Colors.status.infoBg}
                        value={bookingsQuery.data.summary.completed_count}
                        label="Completed"
                        subText="Successfully played"
                      />
                      <AnalyticsKpiCard
                        cardWidth={kpiCardWidth}
                        icon={<XCircle size={17} color={Colors.status.error} strokeWidth={2} />}
                        iconBgColor={Colors.status.errorBg}
                        value={bookingsQuery.data.summary.cancelled_count}
                        label="Cancelled"
                        badgeLabel={`${bookingsQuery.data.summary.cancellation_rate}%`}
                        badgeVariant="error"
                        subText="Cancelled reservations"
                      />
                    </View>

                    {/* Court-by-Court Utilization Breakdown */}
                    <Card style={styles.sectionCard}>
                      <View style={styles.sectionCardHeader}>
                        <View style={styles.sectionIconTitle}>
                          <Layers size={16} color={Colors.brand.primary} strokeWidth={2} />
                          <AppText style={styles.cardTitle}>Court-by-Court Utilization</AppText>
                        </View>
                        <Badge
                          label={`${bookingsQuery.data.summary.active_courts_count} Courts`}
                          variant="default"
                        />
                      </View>
                      <AppText style={styles.sectionSubtitle}>
                        Capacity utilization across individual club courts
                      </AppText>

                      {bookingsQuery.data.by_court.length === 0 ? (
                        <AppText style={styles.emptyInlineText}>
                          No active courts configured for this club.
                        </AppText>
                      ) : (
                        bookingsQuery.data.by_court.map((c: CourtUtilizationItem) => {
                          const isHighUtil = c.utilization_rate >= 60;
                          const isMedUtil = c.utilization_rate >= 30;
                          const utilRate = Math.min(100, Math.max(0, c.utilization_rate));

                          return (
                            <View key={c.court_id} style={styles.courtItemCard}>
                              <View style={styles.courtMetaRow}>
                                <View style={styles.courtIdentityGroup}>
                                  <AppText style={styles.courtNameText}>{c.court_name}</AppText>
                                  <AppText style={styles.courtSubtitleText}>
                                    {c.booking_count} {c.booking_count === 1 ? 'booking' : 'bookings'} •{' '}
                                    {c.booked_minutes > 0 ? formatDuration(c.booked_minutes) : '0 min'}
                                  </AppText>
                                </View>
                                <Badge
                                  label={`${utilRate}%`}
                                  variant={isHighUtil ? 'success' : isMedUtil ? 'info' : 'default'}
                                  size="sm"
                                />
                              </View>

                              {/* Utilization Progress Bar (0% when rate is 0) */}
                              <View style={styles.courtBarTrack}>
                                {utilRate > 0 ? (
                                  <View
                                    style={[
                                      styles.courtBarFill,
                                      {
                                        width: `${utilRate}%`,
                                        backgroundColor: isHighUtil
                                          ? Colors.status.success
                                          : isMedUtil
                                          ? Colors.brand.primary
                                          : '#9CA3AF',
                                      },
                                    ]}
                                  />
                                ) : null}
                              </View>
                            </View>
                          );
                        })
                      )}
                    </Card>

                    {/* Daily Bookings Trend Chart for Bookings Tab */}
                    {bookingsQuery.data.daily_trend && (
                      <DailyBookingsChart
                        dailyData={bookingsQuery.data.daily_trend}
                        title="Daily Booking Distribution"
                        subtitle="Detailed daily reservations breakdown"
                      />
                    )}
                  </>
                ) : null}
              </View>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                TAB 3: MEMBERSHIPS
               ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'memberships' && (
              <View style={styles.tabContent}>
                {membershipsQuery.isLoading ? (
                  <LoadingState message="Loading membership roster reports..." />
                ) : membershipsQuery.isError ? (
                  <ErrorState
                    message="Failed to load membership report"
                    onRetry={() => membershipsQuery.refetch()}
                  />
                ) : membershipsQuery.data ? (
                  <>
                    {/* Member Status Grid */}
                    <View style={styles.kpiGrid}>
                      <AnalyticsKpiCard
                        cardWidth={kpiCardWidth}
                        icon={<Users size={17} color={Colors.brand.primary} strokeWidth={2} />}
                        iconBgColor={Colors.brand.primaryLight}
                        value={membershipsQuery.data.summary.total_player_memberships}
                        label="Total Roster"
                        subText="All registered club members"
                      />
                      <AnalyticsKpiCard
                        cardWidth={kpiCardWidth}
                        icon={<CheckCircle2 size={17} color={Colors.status.success} strokeWidth={2} />}
                        iconBgColor={Colors.status.successBg}
                        value={membershipsQuery.data.summary.active_count}
                        label="Active Players"
                        badgeLabel="Active"
                        badgeVariant="success"
                        subText="In good standing"
                      />
                      <AnalyticsKpiCard
                        cardWidth={kpiCardWidth}
                        icon={<AlertCircle size={17} color={Colors.status.warning} strokeWidth={2} />}
                        iconBgColor={Colors.status.warningBg}
                        value={membershipsQuery.data.summary.suspended_count}
                        label="Suspended"
                        badgeLabel="Review"
                        badgeVariant="warning"
                        subText="Temporarily inactive"
                      />
                      <AnalyticsKpiCard
                        cardWidth={kpiCardWidth}
                        icon={<Clock size={17} color={Colors.text.tertiary} strokeWidth={2} />}
                        iconBgColor={Colors.background.tertiary}
                        value={membershipsQuery.data.summary.expired_count}
                        label="Expired"
                        subText="Requires plan renewal"
                      />
                    </View>

                    {/* Member Acquisition & Pipeline Health */}
                    <Card style={styles.sectionCard}>
                      <View style={styles.sectionCardHeader}>
                        <View style={styles.sectionIconTitle}>
                          <Sparkles size={16} color={Colors.brand.primary} strokeWidth={2} />
                          <AppText style={styles.cardTitle}>Membership Growth & Pipeline</AppText>
                        </View>
                      </View>
                      <AppText style={styles.sectionSubtitle}>
                        Member acquisition, renewal pipeline, and pending applications
                      </AppText>

                      <View style={styles.metricStatsStrip}>
                        <View style={styles.metricStatBox}>
                          <AppText style={[styles.metricStatValue, { color: Colors.status.success }]}>
                            +{membershipsQuery.data.summary.new_members_in_period}
                          </AppText>
                          <AppText style={styles.metricStatLabel}>New in Period</AppText>
                        </View>
                        <View style={styles.metricStatDivider} />
                        <View style={styles.metricStatBox}>
                          <AppText style={[styles.metricStatValue, { color: Colors.status.warning }]}>
                            {membershipsQuery.data.summary.pending_requests_count}
                          </AppText>
                          <AppText style={styles.metricStatLabel}>Pending Review</AppText>
                        </View>
                        <View style={styles.metricStatDivider} />
                        <View style={styles.metricStatBox}>
                          <AppText style={styles.metricStatValue}>
                            {membershipsQuery.data.summary.active_subscriptions_count}
                          </AppText>
                          <AppText style={styles.metricStatLabel}>Paid Subscriptions</AppText>
                        </View>
                      </View>
                    </Card>

                    {/* Membership Plan Subscriptions */}
                    <Card style={styles.sectionCard}>
                      <View style={styles.sectionCardHeader}>
                        <View style={styles.sectionIconTitle}>
                          <Wallet size={16} color={Colors.brand.primary} strokeWidth={2} />
                          <AppText style={styles.cardTitle}>Membership Plans</AppText>
                        </View>
                      </View>
                      <AppText style={styles.sectionSubtitle}>
                        Active member subscriptions categorized by membership plan
                      </AppText>

                      {membershipsQuery.data.plan_enrollments.length === 0 ? (
                        <AppText style={styles.emptyInlineText}>
                          No membership plans created yet for this club.
                        </AppText>
                      ) : (
                        membershipsQuery.data.plan_enrollments.map((plan: PlanEnrollmentItem) => (
                          <View key={plan.plan_id} style={styles.planCard}>
                            <View style={styles.planCardHeader}>
                              <View style={styles.planInfoCol}>
                                <AppText style={styles.planNameText}>{plan.plan_name}</AppText>
                                <AppText style={styles.planPriceText}>
                                  {formatCurrency(plan.price, plan.currency || 'USD')} / period
                                </AppText>
                              </View>
                              <Badge
                                label={`${plan.active_subscribers} ${plan.active_subscribers === 1 ? 'Subscriber' : 'Subscribers'}`}
                                variant="success"
                                size="sm"
                              />
                            </View>
                          </View>
                        ))
                      )}
                    </Card>
                  </>
                ) : null}
              </View>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                TAB 4: COMPETITIONS & COMMUNITY
               ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'competitions' && (
              <View style={styles.tabContent}>
                {competitionsQuery.isLoading ? (
                  <LoadingState message="Loading tournament and league reports..." />
                ) : competitionsQuery.isError ? (
                  <ErrorState
                    message="Failed to load competitions report"
                    onRetry={() => competitionsQuery.refetch()}
                  />
                ) : competitionsQuery.data ? (
                  <>
                    {/* Section 1: Tournaments & Leagues */}
                    <View style={styles.sectionHeaderBlock}>
                      <View style={styles.sectionIconTitle}>
                        <Trophy size={16} color={Colors.brand.primary} strokeWidth={2} />
                        <AppText style={styles.sectionHeading}>Tournaments & Leagues</AppText>
                      </View>
                      <AppText style={styles.sectionSubtitle}>
                        Competitive events, brackets, and team participation
                      </AppText>
                    </View>

                    <View style={styles.kpiGrid}>
                      <AnalyticsKpiCard
                        cardWidth={kpiCardWidth}
                        icon={<Trophy size={17} color={Colors.brand.primary} strokeWidth={2} />}
                        iconBgColor={Colors.brand.primaryLight}
                        value={competitionsQuery.data.competitions.total_tournaments}
                        label="Total Tournaments"
                        subText={`${competitionsQuery.data.competitions.upcoming_tournaments} Upcoming • ${competitionsQuery.data.competitions.completed_tournaments} Completed`}
                      />
                      <AnalyticsKpiCard
                        cardWidth={kpiCardWidth}
                        icon={<Users size={17} color={Colors.status.success} strokeWidth={2} />}
                        iconBgColor={Colors.status.successBg}
                        value={competitionsQuery.data.competitions.total_tournament_registrations}
                        label="Tournament Players"
                        badgeLabel="Enrolled"
                        badgeVariant="success"
                        subText="Registered tournament participants"
                      />
                      <AnalyticsKpiCard
                        cardWidth={kpiCardWidth}
                        icon={<ShieldCheck size={17} color={Colors.status.warning} strokeWidth={2} />}
                        iconBgColor={Colors.status.warningBg}
                        value={competitionsQuery.data.competitions.total_leagues}
                        label="Club Leagues"
                        badgeLabel={`${competitionsQuery.data.competitions.active_leagues} Active`}
                        badgeVariant="warning"
                        subText="Organized league divisions"
                      />
                      <AnalyticsKpiCard
                        cardWidth={kpiCardWidth}
                        icon={<Layers size={17} color={Colors.status.info} strokeWidth={2} />}
                        iconBgColor={Colors.status.infoBg}
                        value={competitionsQuery.data.competitions.total_league_teams}
                        label="League Teams"
                        subText="Active competing teams"
                      />
                    </View>

                    {/* Section 2: Community Events & Coaching */}
                    <View style={[styles.sectionHeaderBlock, { marginTop: Spacing.sm }]}>
                      <View style={styles.sectionIconTitle}>
                        <GraduationCap size={16} color={Colors.brand.primary} strokeWidth={2} />
                        <AppText style={styles.sectionHeading}>Community Events & Coaching</AppText>
                      </View>
                      <AppText style={styles.sectionSubtitle}>
                        Social clinics, beginner workshops, and private coaching
                      </AppText>
                    </View>

                    <View style={styles.kpiGrid}>
                      <AnalyticsKpiCard
                        cardWidth={kpiCardWidth}
                        icon={<CalendarDays size={17} color={Colors.status.info} strokeWidth={2} />}
                        iconBgColor={Colors.status.infoBg}
                        value={competitionsQuery.data.community.total_events}
                        label="Social Events"
                        subText={`${competitionsQuery.data.community.upcoming_events} Upcoming events`}
                      />
                      <AnalyticsKpiCard
                        cardWidth={kpiCardWidth}
                        icon={<Users size={17} color={Colors.status.success} strokeWidth={2} />}
                        iconBgColor={Colors.status.successBg}
                        value={competitionsQuery.data.community.total_event_registrations}
                        label="Event Players"
                        badgeLabel="Social"
                        badgeVariant="info"
                        subText="Social event registrations"
                      />
                      <AnalyticsKpiCard
                        cardWidth={kpiCardWidth}
                        icon={<GraduationCap size={17} color={Colors.brand.primary} strokeWidth={2} />}
                        iconBgColor={Colors.brand.primaryLight}
                        value={competitionsQuery.data.community.total_lessons}
                        label="Coaching Lessons"
                        subText={`${competitionsQuery.data.community.upcoming_lessons} Upcoming sessions`}
                      />
                      <AnalyticsKpiCard
                        cardWidth={kpiCardWidth}
                        icon={<Sparkles size={17} color={Colors.status.success} strokeWidth={2} />}
                        iconBgColor={Colors.status.successBg}
                        value={competitionsQuery.data.community.total_lesson_registrations}
                        label="Lesson Students"
                        subText="Coaching enrollments"
                      />
                    </View>
                  </>
                ) : null}
              </View>
            )}

            {/* ══════════════════════════════════════════════════════════════════
                TAB 5: FINANCIAL TRANSACTIONS & REVENUE
               ══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'payments' && canManagePayments && (
              <View style={styles.tabContent}>
                {paymentsQuery.isLoading ? (
                  <LoadingState message="Loading financial transaction reports..." />
                ) : paymentsQuery.isError ? (
                  <ErrorState
                    message="Failed to load payments report"
                    onRetry={() => paymentsQuery.refetch()}
                  />
                ) : paymentsQuery.data ? (
                  <>
                    {/* Balanced Executive Revenue Card */}
                    <Card style={styles.sectionCard}>
                      <View style={styles.sectionCardHeader}>
                        <View style={styles.sectionIconTitle}>
                          <DollarSign size={16} color={Colors.brand.primary} strokeWidth={2} />
                          <AppText style={styles.cardTitle}>Total Revenue Collected</AppText>
                        </View>
                        <Badge
                          label={`${Math.round(
                            (paymentsQuery.data.summary.succeeded_count /
                              (paymentsQuery.data.summary.total_recorded_count || 1)) *
                              100
                          )}% Success`}
                          variant="success"
                          size="sm"
                        />
                      </View>
                      <AppText style={styles.financialHeroValue}>
                        {formatCurrency(Number(paymentsQuery.data.summary.total_collected_amount))}
                      </AppText>
                      <AppText style={styles.financialHeroSub}>
                        {paymentsQuery.data.summary.succeeded_count} successful transactions of{' '}
                        {paymentsQuery.data.summary.total_recorded_count} recorded in period
                      </AppText>
                    </Card>

                    {/* Transaction Status 4-Card Grid */}
                    <View style={styles.kpiGrid}>
                      <AnalyticsKpiCard
                        cardWidth={kpiCardWidth}
                        icon={<CreditCard size={17} color={Colors.brand.primary} strokeWidth={2} />}
                        iconBgColor={Colors.brand.primaryLight}
                        value={formatCurrency(paymentsQuery.data.summary.total_recorded_amount)}
                        label="Total Recorded"
                        subText={`${paymentsQuery.data.summary.total_recorded_count} transactions`}
                      />
                      <AnalyticsKpiCard
                        cardWidth={kpiCardWidth}
                        icon={<CheckCircle2 size={17} color={Colors.status.success} strokeWidth={2} />}
                        iconBgColor={Colors.status.successBg}
                        value={formatCurrency(paymentsQuery.data.summary.total_collected_amount)}
                        label="Succeeded"
                        badgeLabel="Paid"
                        badgeVariant="success"
                        subText={`${paymentsQuery.data.summary.succeeded_count} settled`}
                      />
                      <AnalyticsKpiCard
                        cardWidth={kpiCardWidth}
                        icon={<Clock size={17} color={Colors.status.warning} strokeWidth={2} />}
                        iconBgColor={Colors.status.warningBg}
                        value={formatCurrency(paymentsQuery.data.summary.pending_amount)}
                        label="Awaiting"
                        badgeLabel="Pending"
                        badgeVariant="warning"
                        subText={`${paymentsQuery.data.summary.pending_count} pending`}
                      />
                      <AnalyticsKpiCard
                        cardWidth={kpiCardWidth}
                        icon={<XCircle size={17} color={Colors.status.error} strokeWidth={2} />}
                        iconBgColor={Colors.status.errorBg}
                        value={formatCurrency(
                          Number(paymentsQuery.data.summary.failed_amount) +
                            Number(paymentsQuery.data.summary.cancelled_amount)
                        )}
                        label="Failed / Cancelled"
                        badgeLabel="Failed"
                        badgeVariant="error"
                        subText={`${
                          paymentsQuery.data.summary.failed_count +
                          paymentsQuery.data.summary.cancelled_count
                        } failed`}
                      />
                    </View>

                    {/* Daily Revenue Trend Chart */}
                    {paymentsQuery.data.daily_trend && (
                      <DailyRevenueChart dailyRevenue={paymentsQuery.data.daily_trend} />
                    )}

                    {/* Payment Method Breakdown */}
                    <Card style={styles.sectionCard}>
                      <View style={styles.sectionCardHeader}>
                        <View style={styles.sectionIconTitle}>
                          <Wallet size={16} color={Colors.brand.primary} strokeWidth={2} />
                          <AppText style={styles.cardTitle}>Payment Method Breakdown</AppText>
                        </View>
                        <Badge
                          label={`${paymentsQuery.data.summary.by_method.length} Methods`}
                          variant="default"
                        />
                      </View>
                      <AppText style={styles.sectionSubtitle}>
                        Distribution of collected revenue by payment method
                      </AppText>

                      {paymentsQuery.data.summary.by_method.length === 0 ? (
                        <AppText style={styles.emptyInlineText}>
                          No transactions recorded for this period.
                        </AppText>
                      ) : (
                        paymentsQuery.data.summary.by_method.map((meth: PaymentMethodBreakdown) => {
                          const totalCollected =
                            Number(paymentsQuery.data.summary.total_collected_amount) || 1;
                          const methodAmount = Number(meth.amount) || 0;
                          const percent = Math.min(
                            100,
                            Math.round((methodAmount / totalCollected) * 100)
                          );

                          return (
                            <View key={meth.method} style={styles.methodCard}>
                              <View style={styles.methodTopRow}>
                                <View style={styles.methodIdentityRow}>
                                  <View style={styles.methodIconSquircle}>
                                    <CreditCard size={15} color={Colors.brand.primary} />
                                  </View>
                                  <View>
                                    <AppText style={styles.methodNameText}>
                                      {meth.method_label}
                                    </AppText>
                                    <AppText style={styles.methodCountText}>
                                      {meth.count} {meth.count === 1 ? 'transaction' : 'transactions'} ({percent}%)
                                    </AppText>
                                  </View>
                                </View>
                                <AppText style={styles.methodAmountText}>
                                  {formatCurrency(methodAmount)}
                                </AppText>
                              </View>

                              {/* Share percentage bar (0% when percent is 0) */}
                              <View style={styles.methodBarTrack}>
                                {percent > 0 ? (
                                  <View
                                    style={[
                                      styles.methodBarFill,
                                      { width: `${percent}%` },
                                    ]}
                                  />
                                ) : null}
                              </View>
                            </View>
                          );
                        })
                      )}
                    </Card>
                  </>
                ) : null}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ─── COMPACT REPORTING PERIOD SELECTION MODAL SHEET ─── */}
      <ModalSheet
        visible={isPeriodPickerVisible}
        onClose={() => setIsPeriodPickerVisible(false)}
        title="Reporting Period"
      >
        <View style={styles.periodModalContent}>
          <AppText style={styles.periodModalDesc}>
            Select the operational time window to filter bookings, player rosters, and revenue records.
          </AppText>

          <View style={styles.presetOptionsList}>
            {PRESET_OPTIONS.map((opt) => {
              const isSelected = preset === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.presetOptionCard, isSelected && styles.presetOptionCardSelected]}
                  onPress={() => {
                    if (opt.id === 'custom') {
                      setIsPeriodPickerVisible(false);
                      setIsCustomDateModalVisible(true);
                    } else {
                      setPreset(opt.id);
                      setIsPeriodPickerVisible(false);
                    }
                  }}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${opt.label}`}
                >
                  <View style={styles.presetOptionLeft}>
                    <View
                      style={[
                        styles.presetRadioCircle,
                        isSelected && styles.presetRadioCircleSelected,
                      ]}
                    >
                      {isSelected && <Check size={12} color={Colors.white} strokeWidth={3} />}
                    </View>
                    <View style={styles.presetOptionTextGroup}>
                      <AppText
                        style={[
                          styles.presetOptionLabel,
                          isSelected && styles.presetOptionLabelSelected,
                        ]}
                      >
                        {opt.label}
                      </AppText>
                      <AppText style={styles.presetOptionDesc}>{opt.desc}</AppText>
                    </View>
                  </View>

                  {isSelected && (
                    <Badge label="Active" variant="success" size="sm" />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ModalSheet>

      {/* ─── EXPORT OPTIONS MODAL SHEET ─── */}
      <ModalSheet
        visible={isExportModalVisible}
        onClose={() => setIsExportModalVisible(false)}
        title="Export Operational Data"
      >
        <View style={styles.exportModalContent}>
          <AppText style={styles.exportModalDesc}>
            Export sanitized CSV data for the selected period ({presetDisplayLabel}). Data is formatted
            in the club's timezone and shielded against spreadsheet formula injection.
          </AppText>

          <Button
            label="Export Bookings (CSV)"
            variant="outline"
            style={styles.exportActionBtn}
            loading={exportLoading}
            onPress={() => handleExport('bookings')}
          />
          <Button
            label="Export Memberships (CSV)"
            variant="outline"
            style={styles.exportActionBtn}
            loading={exportLoading}
            onPress={() => handleExport('memberships')}
          />
          {canManagePayments && (
            <Button
              label="Export Financial Payments (CSV)"
              variant="outline"
              style={styles.exportActionBtn}
              loading={exportLoading}
              onPress={() => handleExport('payments')}
            />
          )}
        </View>
      </ModalSheet>

      {/* ─── CUSTOM DATE RANGE PICKER MODAL SHEET ─── */}
      <ModalSheet
        visible={isCustomDateModalVisible}
        onClose={() => setIsCustomDateModalVisible(false)}
        title="Custom Reporting Period"
      >
        <View style={styles.customDateModalContent}>
          <AppText style={styles.customDateModalDesc}>
            Specify an exact custom date range to filter booking schedules, roster analytics,
            and financial transactions.
          </AppText>

          <View style={styles.datePickerInputGroup}>
            <DateRangePickerInput
              startDate={customStart}
              endDate={customEnd}
              onStartDateChange={setCustomStart}
              onEndDateChange={setCustomEnd}
            />
          </View>

          <View style={styles.customDateActions}>
            <Button
              label="Cancel"
              variant="outline"
              style={styles.customModalBtn}
              onPress={() => setIsCustomDateModalVisible(false)}
            />
            <Button
              label="Apply Range"
              variant="primary"
              style={styles.customModalBtn}
              disabled={!customStart || !customEnd}
              onPress={() => {
                setPreset('custom');
                setIsCustomDateModalVisible(false);
              }}
            />
          </View>
        </View>
      </ModalSheet>
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLESHEET
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.md,
  },
  loadingContainer: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  restrictedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  restrictedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  restrictedDesc: {
    fontSize: 13,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 18,
  },

  // 1. Simplified Top Summary Card
  summaryCard: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    ...Shadows.sm,
  },
  summaryContentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  summaryIdentityGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  clubIconSquircle: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    backgroundColor: Colors.brand.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  summaryTextCol: {
    flex: 1,
  },
  summaryClubName: {
    fontSize: 15.5,
    fontWeight: '700',
    color: Colors.text.primary,
    letterSpacing: -0.2,
  },
  summarySubtitle: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 1,
  },
  summaryActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refreshIconButton: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    backgroundColor: Colors.background.primary,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.brand.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#C3E7D2',
    gap: 5,
  },
  exportButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.brand.primary,
  },

  // 2. Compact Reporting Period Selector
  periodFilterCard: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    padding: 12,
    gap: 8,
    ...Shadows.sm,
  },
  periodFilterHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  periodLabelCol: {
    flex: 1,
  },
  periodSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  periodSubDateRange: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 2,
    fontWeight: '500',
  },
  periodDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    gap: 6,
  },
  periodDropdownTriggerText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.brand.primary,
  },
  periodMetaFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.surface.borderLight,
  },
  periodLiveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  periodLiveDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: '#10B981',
  },
  periodLiveText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  periodLastUpdatedText: {
    fontSize: 10.5,
    color: Colors.text.tertiary,
    fontWeight: '500',
  },

  // 3. Navigation Tabs
  navTabsOuter: {
    marginHorizontal: -Spacing.md,
  },
  navTabsContent: {
    paddingHorizontal: Spacing.md,
    gap: 8,
    alignItems: 'center',
  },
  navTabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    paddingHorizontal: 15,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    gap: 6,
  },
  navTabPillActive: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
    ...Shadows.sm,
  },
  navTabLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  navTabLabelActive: {
    color: Colors.white,
    fontWeight: '700',
  },

  // Content Area
  tabContent: {
    gap: Spacing.md,
  },

  // Section Headers for Tab Blocks
  sectionHeaderBlock: {
    marginBottom: 2,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
  },

  // 4. KPI Cards & Grid
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  kpiCard: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    padding: 13,
    minHeight: 138,
    justifyContent: 'space-between',
    ...Shadows.sm,
  },
  kpiCardHalf: {
    width: '48.5%',
  },
  kpiTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kpiIconBox: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiBody: {
    marginVertical: 4,
    flex: 1,
    justifyContent: 'center',
  },
  kpiValueText: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text.primary,
    letterSpacing: -0.3,
  },
  kpiLabelText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginTop: 2,
    lineHeight: 16,
  },
  kpiFooter: {
    marginTop: 4,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: Colors.surface.borderLight,
  },
  kpiSubText: {
    fontSize: 10.5,
    fontWeight: '500',
    color: Colors.text.tertiary,
    lineHeight: 14,
  },

  // 5. Section Cards
  sectionCard: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    padding: 14,
    ...Shadows.sm,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },

  // Utilization Card Responsive Layout (No collisions)
  utilizationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  sectionIconTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    minWidth: 200,
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginBottom: Spacing.sm,
  },
  utilizationBadgeContainer: {
    alignSelf: 'flex-start',
  },
  utilizationBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  utilizationBadgeDefault: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  utilizationBadgeSuccess: {
    backgroundColor: Colors.brand.primaryLight,
    borderColor: '#C3E7D2',
  },
  utilizationBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  utilizationBadgeTextDefault: {
    color: Colors.text.primary,
  },
  utilizationBadgeTextSuccess: {
    color: Colors.brand.primary,
  },
  utilizationProgressSection: {
    marginVertical: Spacing.xs,
  },
  utilizationDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  utilizationDetailText: {
    fontSize: 11,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  utilizationCapacityText: {
    fontSize: 10.5,
    color: Colors.text.tertiary,
    fontWeight: '500',
  },

  // 6. Chart Card Styles
  chartCard: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    padding: 14,
    ...Shadows.sm,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  chartTitleCol: {
    flex: 1,
  },
  chartTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chartIconWrap: {
    width: 26,
    height: 26,
    borderRadius: Radius.sm,
    backgroundColor: Colors.brand.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartHeading: {
    fontSize: 14.5,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  chartSubheading: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 1,
  },
  peakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.brand.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
    gap: 4,
  },
  peakBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.brand.primary,
  },
  chartMetricRibbon: {
    flexDirection: 'row',
    backgroundColor: Colors.background.primary,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  ribbonItem: {
    alignItems: 'center',
  },
  ribbonLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  ribbonValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 2,
  },
  ribbonDivider: {
    width: 1,
    height: 20,
    backgroundColor: Colors.surface.border,
  },
  chartZeroStateWrap: {
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
  },
  chartZeroBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.background.primary,
    paddingVertical: 8,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surface.borderLight,
  },
  chartZeroBannerText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: Colors.text.secondary,
  },
  chartZeroDaysGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingVertical: Spacing.xs,
  },
  zeroDayCol: {
    alignItems: 'center',
    width: 38,
  },
  zeroDayCount: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.text.tertiary,
    marginBottom: 4,
  },
  zeroDayTrack: {
    width: 16,
    height: 4,
    backgroundColor: Colors.surface.border,
    borderRadius: Radius.full,
    marginVertical: 4,
  },
  chartViewport: {
    height: 155,
    position: 'relative',
    marginTop: Spacing.xs,
  },
  chartGridLines: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 15,
    bottom: 35,
    justifyContent: 'space-between',
  },
  chartGridLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gridLineLabel: {
    fontSize: 9,
    color: Colors.text.tertiary,
    width: 28,
    textAlign: 'right',
  },
  gridLineDotted: {
    flex: 1,
    height: 1,
    borderTopWidth: 1,
    borderTopColor: Colors.surface.borderLight,
    borderStyle: 'dashed',
  },
  gridLineSolid: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.surface.border,
  },
  barsContainer: {
    position: 'absolute',
    left: 36,
    right: 8,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
  },
  barCol: {
    alignItems: 'center',
    width: 32,
    height: '100%',
    justifyContent: 'flex-end',
  },
  barCountTag: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginBottom: 4,
  },
  barCountTagPeak: {
    color: Colors.brand.primary,
    fontWeight: '700',
  },
  barTrack: {
    width: 18,
    height: 85,
    backgroundColor: Colors.background.primary,
    borderRadius: Radius.sm,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surface.borderLight,
  },
  barFill: {
    width: '100%',
    backgroundColor: '#2E8069',
    borderTopLeftRadius: Radius.sm,
    borderTopRightRadius: Radius.sm,
  },
  barFillPeak: {
    backgroundColor: Colors.brand.primary,
  },
  barDayLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 6,
  },
  barDayLabelPeak: {
    color: Colors.brand.primary,
  },
  barDateLabel: {
    fontSize: 8.5,
    color: Colors.text.tertiary,
    marginTop: 1,
  },

  // Progress bars & Strips
  progressContainer: {
    height: 8,
    backgroundColor: Colors.background.primary,
    borderRadius: Radius.full,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surface.borderLight,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  metricStatsStrip: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: Colors.background.primary,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginTop: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  metricStatBox: {
    alignItems: 'center',
    flex: 1,
  },
  metricStatValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  metricStatLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: Colors.text.secondary,
    marginTop: 2,
    textAlign: 'center',
  },
  metricStatDivider: {
    width: 1,
    height: 22,
    backgroundColor: Colors.surface.border,
  },

  // Court Item Cards
  courtItemCard: {
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.borderLight,
    gap: 6,
  },
  courtMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  courtIdentityGroup: {
    flex: 1,
    marginRight: Spacing.xs,
  },
  courtNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  courtSubtitleText: {
    fontSize: 10.5,
    color: Colors.text.secondary,
    marginTop: 1,
  },
  courtBarTrack: {
    height: 6,
    backgroundColor: Colors.background.primary,
    borderRadius: Radius.full,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surface.borderLight,
  },
  courtBarFill: {
    height: '100%',
    borderRadius: Radius.full,
  },

  // Plan Cards
  planCard: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.borderLight,
  },
  planCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planInfoCol: {
    flex: 1,
    marginRight: Spacing.xs,
  },
  planNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  planPriceText: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 1,
  },

  // Financial Hero Card
  financialHeroValue: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text.primary,
    marginVertical: 4,
    letterSpacing: -0.4,
  },
  financialHeroSub: {
    fontSize: 11,
    color: Colors.text.secondary,
  },

  // Payment Method Breakdown
  methodCard: {
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.borderLight,
    gap: 6,
  },
  methodTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  methodIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  methodIconSquircle: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    backgroundColor: Colors.brand.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodNameText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  methodCountText: {
    fontSize: 10.5,
    color: Colors.text.secondary,
  },
  methodAmountText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  methodBarTrack: {
    height: 5,
    backgroundColor: Colors.background.primary,
    borderRadius: Radius.full,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surface.borderLight,
  },
  methodBarFill: {
    height: '100%',
    backgroundColor: Colors.brand.primary,
    borderRadius: Radius.full,
  },

  // Empty and Modals
  emptyInlineText: {
    fontSize: 12,
    color: Colors.text.secondary,
    fontStyle: 'italic',
    paddingVertical: Spacing.xs,
  },
  periodModalContent: {
    gap: Spacing.md,
    paddingTop: Spacing.xs,
  },
  periodModalDesc: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  presetOptionsList: {
    gap: Spacing.sm,
  },
  presetOptionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 13,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  presetOptionCardSelected: {
    borderColor: Colors.brand.primary,
    backgroundColor: Colors.brand.primaryLight,
  },
  presetOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  presetRadioCircle: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.surface.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface.default,
  },
  presetRadioCircleSelected: {
    borderColor: Colors.brand.primary,
    backgroundColor: Colors.brand.primary,
  },
  presetOptionTextGroup: {
    flex: 1,
  },
  presetOptionLabel: {
    fontSize: 13.5,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  presetOptionLabelSelected: {
    fontWeight: '700',
    color: Colors.brand.primary,
  },
  presetOptionDesc: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 1,
  },
  exportModalContent: {
    gap: Spacing.md,
    paddingTop: Spacing.xs,
  },
  exportModalDesc: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  exportActionBtn: {
    marginTop: Spacing.xs,
  },
  customDateModalContent: {
    gap: Spacing.md,
    paddingTop: Spacing.xs,
  },
  customDateModalDesc: {
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  datePickerInputGroup: {
    marginVertical: Spacing.xs,
  },
  customDateActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  customModalBtn: {
    flex: 1,
  },
});
