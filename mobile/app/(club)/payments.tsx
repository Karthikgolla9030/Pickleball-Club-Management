/**
 * Aught2 Pickleball — Club Payments Screen
 *
 * SaaS-grade operational payments dashboard for club owners & managers:
 *   - Compact Header: [☰ Menu] Payments · Revenue and transactions
 *   - 3 Essential Summary Metrics: Net Collected, Total Payments, Successful
 *   - Single Unified Filter Section: full-width search + side-by-side Service & Status dropdowns
 *   - Clean Transaction Cards: Player name, status badge, prominent dollar amount,
 *     clear service name & description, compact footer with transaction ID & date
 *   - Zero Visual Repetition: eliminates duplicate service tags and bulky nested boxes
 *   - Comprehensive Transaction Details Modal Sheet with reconciliation and refund actions
 *   - Strict multi-tenant isolation, real-time auto-polling, and pull-to-refresh
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  CreditCard,
  Crown,
  FileText,
  Filter,
  LayoutGrid,
  Menu,
  RotateCcw,
  Search,
  ShieldAlert,
  Trophy,
  UserCheck,
  Users,
  X,
} from 'lucide-react-native';

import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  ModalSheet,
  PlatformButton,
  Screen,
} from '@/components';
import {
  useActiveClub,
  useCancelPayment,
  useClubPayments,
  usePaymentSummary,
  usePermission,
  useRefundPayment,
  useSucceedPayment,
} from '@/hooks';
import { useDrawerStore } from '@/navigation';
import { Colors, Radius, Shadows, Spacing } from '@/theme';
import { formatCurrency, parsePaymentDetails } from '@/utils';
import type { Payment, PaymentPurpose } from '@/types';

type FilterTab = 'all' | 'succeeded' | 'pending' | 'failed' | 'refunded';
type CategoryTab = 'all' | 'membership' | 'court_booking' | 'tournament' | 'league' | 'event' | 'lesson';

const STATUS_OPTIONS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All Statuses' },
  { id: 'succeeded', label: 'Succeeded' },
  { id: 'pending', label: 'Pending' },
  { id: 'failed', label: 'Failed' },
  { id: 'refunded', label: 'Refunded' },
];

const SERVICE_OPTIONS: { id: CategoryTab; label: string }[] = [
  { id: 'all', label: 'All Services' },
  { id: 'membership', label: 'Memberships' },
  { id: 'court_booking', label: 'Court Bookings' },
  { id: 'tournament', label: 'Tournaments' },
  { id: 'league', label: 'Leagues' },
  { id: 'event', label: 'Events' },
  { id: 'lesson', label: 'Lessons & Coaching' },
];

function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export default function ClubPaymentsScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const openDrawer = useDrawerStore((s) => s.openDrawer);

  const { clubId: activeClubId } = useActiveClub();
  const { canManagePayments } = usePermission();
  const clubId = activeClubId ?? '';

  const [statusFilter, setStatusFilter] = useState<FilterTab>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  // Dropdown modal sheets
  const [isServiceModalVisible, setIsServiceModalVisible] = useState(false);
  const [isStatusModalVisible, setIsStatusModalVisible] = useState(false);

  // Refund dialog state
  const [refundDialogVisible, setRefundDialogVisible] = useState(false);
  const [paymentToRefund, setPaymentToRefund] = useState<Payment | null>(null);
  const [refundReasonInput, setRefundReasonInput] = useState('');

  // Queries
  const {
    data: summary,
    isLoading: isSummaryLoading,
    refetch: refetchSummary,
  } = usePaymentSummary(clubId);

  const {
    data: allPayments = [],
    isLoading: isPaymentsLoading,
    isError: isPaymentsError,
    error: paymentsError,
    isRefetching,
    refetch: refetchPayments,
  } = useClubPayments(clubId);

  useFocusEffect(
    useCallback(() => {
      refetchSummary();
      refetchPayments();
    }, [refetchSummary, refetchPayments])
  );

  // Staff mutations
  const succeedPaymentMutation = useSucceedPayment(clubId);
  const cancelPaymentMutation = useCancelPayment(clubId);
  const refundPaymentMutation = useRefundPayment(clubId);

  // Filtered payments list
  const filteredPayments = useMemo(() => {
    return allPayments.filter((p) => {
      // 1. Status Filter
      if (statusFilter === 'pending') {
        if (p.status !== 'pending' && p.status !== 'processing') return false;
      } else if (statusFilter === 'refunded') {
        if (p.status !== 'refunded' && p.status !== 'partially_refunded') return false;
      } else if (statusFilter !== 'all') {
        if (p.status !== statusFilter) return false;
      }

      // 2. Service Category Filter
      if (categoryFilter !== 'all') {
        if (p.purpose !== categoryFilter) return false;
      }

      // 3. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const details = parsePaymentDetails(p);
        const refMatch = p.reference?.toLowerCase().includes(q);
        const nameMatch = p.player?.full_name?.toLowerCase().includes(q);
        const emailMatch = p.player?.email?.toLowerCase().includes(q);
        const serviceMatch = details.serviceType.toLowerCase().includes(q);
        const activityMatch = details.activityTitle?.toLowerCase().includes(q);
        const noteMatch = details.cleanNote?.toLowerCase().includes(q);
        const idMatch = p.id?.toLowerCase().includes(q);
        const providerIdMatch = p.provider_payment_id?.toLowerCase().includes(q);

        if (
          !refMatch &&
          !nameMatch &&
          !emailMatch &&
          !serviceMatch &&
          !activityMatch &&
          !noteMatch &&
          !idMatch &&
          !providerIdMatch
        ) {
          return false;
        }
      }

      return true;
    });
  }, [allPayments, statusFilter, categoryFilter, searchQuery]);

  // Supported summary metrics (Net Collected, Total, Successful, Pending, Failed, Refunded)
  const metricsData = useMemo(() => {
    const succeededList = allPayments.filter((p) => p.status === 'succeeded');
    const pendingList = allPayments.filter(
      (p) => p.status === 'pending' || p.status === 'processing'
    );
    const failedList = allPayments.filter((p) => p.status === 'failed');
    const refundedList = allPayments.filter(
      (p) => p.status === 'refunded' || p.status === 'partially_refunded'
    );

    const grossCollected = succeededList.reduce(
      (acc, p) => acc + Number(p.amount || 0),
      0
    );
    const refundedSum = refundedList.reduce(
      (acc, p) => acc + Number(p.refunded_amount || p.amount || 0),
      0
    );
    const pendingSum = pendingList.reduce(
      (acc, p) => acc + Number(p.amount || 0),
      0
    );
    const failedSum = failedList.reduce(
      (acc, p) => acc + Number(p.amount || 0),
      0
    );

    const netCollected =
      summary?.net_collected != null
        ? Number(summary.net_collected)
        : Math.max(0, grossCollected - refundedSum);

    const totalRefunded =
      summary?.total_refunded_amount != null
        ? Number(summary.total_refunded_amount)
        : refundedSum;

    const totalPayments = summary?.total_count ?? allPayments.length;
    const successful = summary?.succeeded_count ?? succeededList.length;
    const pending = summary?.pending_count ?? pendingList.length;
    const failed = summary?.failed_count ?? failedList.length;
    const refunded = summary?.refunded_count ?? refundedList.length;

    return {
      netCollectedAmount: Math.max(0, netCollected),
      totalPaymentsCount: totalPayments,
      successfulCount: successful,
      successfulAmount: grossCollected,
      pendingCount: pending,
      pendingAmount: pendingSum,
      failedCount: failed,
      failedAmount: failedSum,
      refundedCount: refunded,
      refundedAmount: totalRefunded,
    };
  }, [allPayments, summary]);

  // Responsive 2-column or multi-column grid widths
  const contentWidth = Math.min(windowWidth - 32, 1200);
  const cardWidth = useMemo(() => {
    if (windowWidth >= 1024) {
      return (contentWidth - 50) / 6;
    }
    if (windowWidth >= 640) {
      return (contentWidth - 20) / 3;
    }
    return (contentWidth - 10) / 2;
  }, [windowWidth, contentWidth]);

  // All 6 supported payment summary cards
  const metricCards = useMemo(
    () => [
      {
        id: 'net_collected',
        label: 'Net Collected',
        value: formatCurrency(metricsData.netCollectedAmount, 'USD'),
        subtext: 'After refunds',
        Icon: CreditCard,
        bgColor: '#ECFDF5',
        iconColor: '#059669',
        valColor: '#047857',
      },
      {
        id: 'total_payments',
        label: 'Total Payments',
        value: String(metricsData.totalPaymentsCount),
        subtext: 'All transactions',
        Icon: FileText,
        bgColor: '#F1F5F9',
        iconColor: '#475569',
        valColor: '#0F172A',
      },
      {
        id: 'successful',
        label: 'Successful',
        value: String(metricsData.successfulCount),
        subtext: `${formatCurrency(metricsData.successfulAmount, 'USD')} collected`,
        Icon: CheckCircle2,
        bgColor: '#DEF2E6',
        iconColor: '#15803D',
        valColor: '#15803D',
      },
      {
        id: 'pending',
        label: 'Pending',
        value: String(metricsData.pendingCount),
        subtext:
          metricsData.pendingAmount > 0
            ? `${formatCurrency(metricsData.pendingAmount, 'USD')} awaiting`
            : 'Awaiting payment',
        Icon: Clock,
        bgColor: '#FEF3C7',
        iconColor: '#D97706',
        valColor: '#B45309',
      },
      {
        id: 'failed',
        label: 'Failed',
        value: String(metricsData.failedCount),
        subtext:
          metricsData.failedAmount > 0
            ? `${formatCurrency(metricsData.failedAmount, 'USD')} failed`
            : 'Declined / aborted',
        Icon: ShieldAlert,
        bgColor: '#FEE2E2',
        iconColor: '#EF4444',
        valColor: '#DC2626',
      },
      {
        id: 'refunded',
        label: 'Refunded',
        value: String(metricsData.refundedCount),
        subtext:
          metricsData.refundedAmount > 0
            ? `${formatCurrency(metricsData.refundedAmount, 'USD')} refunded`
            : 'No refunds',
        Icon: RotateCcw,
        bgColor: '#EDE9FE',
        iconColor: '#7C3AED',
        valColor: '#6D28D9',
      },
    ],
    [metricsData]
  );

  const onRefresh = () => {
    refetchSummary();
    refetchPayments();
  };

  const hasActiveFilters = searchQuery.trim() !== '' || categoryFilter !== 'all' || statusFilter !== 'all';

  const resetAllFilters = () => {
    setSearchQuery('');
    setCategoryFilter('all');
    setStatusFilter('all');
  };

  const selectedServiceLabel = useMemo(() => {
    const found = SERVICE_OPTIONS.find((o) => o.id === categoryFilter);
    return found ? found.label : 'All Services';
  }, [categoryFilter]);

  const selectedStatusLabel = useMemo(() => {
    const found = STATUS_OPTIONS.find((o) => o.id === statusFilter);
    return found ? found.label : 'All Statuses';
  }, [statusFilter]);

  // Handle Mark as Succeeded
  const handleMarkPaid = (payment: Payment) => {
    const details = parsePaymentDetails(payment);
    Alert.alert(
      'Confirm Payment Received',
      `Mark transaction ${payment.reference} (${details.formattedAmount}) as successfully received?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Received',
          onPress: async () => {
            try {
              await succeedPaymentMutation.mutateAsync(payment.id);
              setSelectedPayment(null);
              refetchSummary();
              refetchPayments();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to mark payment as paid';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
  };

  // Handle Cancel Payment
  const handleCancelPayment = (payment: Payment) => {
    Alert.alert(
      'Cancel Payment',
      `Are you sure you want to cancel payment ${payment.reference}? This action cannot be undone.`,
      [
        { text: 'Keep Payment', style: 'cancel' },
        {
          text: 'Cancel Payment',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelPaymentMutation.mutateAsync({
                paymentId: payment.id,
                cancellationReason: 'Cancelled by club owner',
              });
              setSelectedPayment(null);
              refetchSummary();
              refetchPayments();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to cancel payment';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
  };

  if (!canManagePayments) {
    return (
      <Screen style={styles.container}>
        <View style={[styles.headerContainer, { paddingTop: insets.top + 8 }]}>
          <View style={styles.headerInner}>
            <TouchableOpacity style={styles.headerMenuBtn} onPress={openDrawer}>
              <Menu size={20} color="#1E293B" strokeWidth={2.2} />
            </TouchableOpacity>
            <View style={styles.headerTitleBlock}>
              <AppText style={styles.headerTitle}>Payments</AppText>
              <AppText style={styles.headerSubtitle}>Revenue and transactions</AppText>
            </View>
          </View>
        </View>
        <EmptyState
          title="Access Restricted"
          description="Only club owners and managers have permission to view club payments and revenue."
        />
      </Screen>
    );
  }

  // ─── Header: 6 Summary Metrics (2-Column Grid) + Unified Filter Section ────
  const renderListHeader = () => (
    <View style={styles.listHeaderWrapper}>
      {/* ─── 1. Supported Summary Metrics (2-Column Responsive Grid) ─── */}
      <View style={styles.summaryGrid}>
        {metricCards.map((card) => (
          <View
            key={card.id}
            style={[styles.summaryCard, { width: cardWidth }]}
          >
            <View style={styles.summaryTopRow}>
              <View style={[styles.summaryIconBox, { backgroundColor: card.bgColor }]}>
                <card.Icon size={13} color={card.iconColor} strokeWidth={2.2} />
              </View>
              <AppText style={styles.summaryLabel}>
                {card.label}
              </AppText>
            </View>

            <View style={styles.summaryValueBlock}>
              <AppText style={[styles.summaryValue, { color: card.valColor }]}>
                {card.value}
              </AppText>
              {card.subtext ? (
                <AppText style={styles.summarySubtext}>
                  {card.subtext}
                </AppText>
              ) : null}
            </View>
          </View>
        ))}
      </View>

      {/* ─── 2. Unified Filter Section (Search + 2 Compact Dropdowns) ─── */}
      <View style={styles.filterCard}>
        {/* Full-width Search Input */}
        <View style={styles.searchInputWrap}>
          <Search size={15} color="#64748B" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by player, ref, or service..."
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <X size={14} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Two Compact Dropdown Selectors */}
        <View style={styles.dropdownsRow}>
          {/* Service Dropdown */}
          <TouchableOpacity
            style={[
              styles.dropdownTrigger,
              categoryFilter !== 'all' && styles.dropdownTriggerActive,
            ]}
            onPress={() => setIsServiceModalVisible(true)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`Filter by service: ${selectedServiceLabel}`}
          >
            <View style={styles.dropdownTriggerContent}>
              <AppText style={styles.dropdownLabelPrefix}>Service:</AppText>
              <AppText
                style={[
                  styles.dropdownValueText,
                  categoryFilter !== 'all' && styles.dropdownValueTextActive,
                ]}
                numberOfLines={1}
              >
                {selectedServiceLabel}
              </AppText>
            </View>
            <ChevronDown
              size={13}
              color={categoryFilter !== 'all' ? Colors.brand.primary : '#64748B'}
              strokeWidth={2}
            />
          </TouchableOpacity>

          {/* Status Dropdown */}
          <TouchableOpacity
            style={[
              styles.dropdownTrigger,
              statusFilter !== 'all' && styles.dropdownTriggerActive,
            ]}
            onPress={() => setIsStatusModalVisible(true)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`Filter by status: ${selectedStatusLabel}`}
          >
            <View style={styles.dropdownTriggerContent}>
              <AppText style={styles.dropdownLabelPrefix}>Status:</AppText>
              <AppText
                style={[
                  styles.dropdownValueText,
                  statusFilter !== 'all' && styles.dropdownValueTextActive,
                ]}
                numberOfLines={1}
              >
                {selectedStatusLabel}
              </AppText>
            </View>
            <ChevronDown
              size={13}
              color={statusFilter !== 'all' ? Colors.brand.primary : '#64748B'}
              strokeWidth={2}
            />
          </TouchableOpacity>
        </View>

        {/* Active Filter Indicator & Reset */}
        {hasActiveFilters && (
          <View style={styles.activeFiltersRow}>
            <AppText style={styles.resultsCountText}>
              Showing {filteredPayments.length} of {allPayments.length} transactions
            </AppText>
            <TouchableOpacity
              style={styles.resetFiltersBtn}
              onPress={resetAllFilters}
              activeOpacity={0.7}
            >
              <X size={11} color={Colors.brand.primary} />
              <AppText style={styles.resetFiltersBtnText}>Reset</AppText>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );

  // ─── 3. Redesigned Clean Payment Transaction Card ──────────────────────────
  const renderPaymentCard = ({ item }: { item: Payment }) => {
    const details = parsePaymentDetails(item);
    const playerName = item.player?.full_name || item.player?.email || 'Unknown Player';

    const isSucceeded = item.status === 'succeeded';
    const isPending = item.status === 'pending' || item.status === 'processing';
    const isFailed = item.status === 'failed';
    const isCancelled = item.status === 'cancelled';
    const isRefunded = item.status === 'refunded' || item.status === 'partially_refunded';

    // Status label and color variant
    let statusText = 'PENDING';
    if (isSucceeded) statusText = 'SUCCEEDED';
    else if (isFailed) statusText = 'FAILED';
    else if (isCancelled) statusText = 'CANCELLED';
    else if (isRefunded) statusText = 'REFUNDED';

    // Meaningful secondary item detail (only if distinct from serviceType)
    const itemDetail =
      details.activityTitle &&
      details.activityTitle.toLowerCase() !== details.serviceType.toLowerCase()
        ? details.activityTitle
        : details.activitySubtitle;

    return (
      <TouchableOpacity
        style={styles.paymentCard}
        onPress={() => setSelectedPayment(item)}
        activeOpacity={0.8}
      >
        {/* Top Section: Player Name + Subtle Status Badge */}
        <View style={styles.cardHeaderRow}>
          <AppText style={styles.playerName}>
            {playerName}
          </AppText>

          <View
            style={[
              styles.statusBadge,
              isSucceeded && styles.statusBadgeSucceeded,
              isPending && styles.statusBadgePending,
              isFailed && styles.statusBadgeFailed,
              isCancelled && styles.statusBadgeCancelled,
              isRefunded && styles.statusBadgeRefunded,
            ]}
          >
            <AppText
              style={[
                styles.statusBadgeText,
                isSucceeded && styles.statusBadgeTextSucceeded,
                isPending && styles.statusBadgeTextPending,
                isFailed && styles.statusBadgeTextFailed,
                isCancelled && styles.statusBadgeTextCancelled,
                isRefunded && styles.statusBadgeTextRefunded,
              ]}
            >
              {statusText}
            </AppText>
          </View>
        </View>

        {/* Main Section: Prominent Amount + Service Type + Item Description */}
        <View style={styles.cardMainSection}>
          <AppText style={styles.amountText}>
            {details.formattedAmount}
          </AppText>

          <View style={styles.serviceInfoGroup}>
            <AppText style={styles.serviceNameHeading}>
              {details.serviceType}
            </AppText>
            {itemDetail ? (
              <AppText style={styles.serviceItemDetailText}>
                {itemDetail}
              </AppText>
            ) : null}
          </View>
        </View>

        {/* Optional Failure or Refund notice */}
        {details.failureReason ? (
          <View style={styles.failureNoticeStrip}>
            <ShieldAlert size={12} color="#DC2626" />
            <AppText style={styles.failureNoticeText}>
              {details.failureReason}
            </AppText>
          </View>
        ) : isRefunded ? (
          <View style={styles.refundNoticeStrip}>
            <RotateCcw size={12} color="#6D28D9" />
            <AppText style={styles.refundNoticeText}>
              Refunded: {formatCurrency(item.refunded_amount || item.amount, 'USD')}
            </AppText>
          </View>
        ) : null}

        {/* Subtle Divider */}
        <View style={styles.cardDivider} />

        {/* Bottom Section: Transaction ID, Payment Method, Date & Time */}
        <View style={styles.cardFooter}>
          <View style={styles.cardFooterTopRow}>
            <View style={styles.txReferenceGroup}>
              <AppText style={styles.txReferencePrefix}>Ref:</AppText>
              <AppText style={styles.txReferenceValue}>
                {item.reference}
              </AppText>
            </View>

            <View style={styles.methodBadge}>
              <AppText style={styles.methodBadgeText}>
                {details.methodLabel}
              </AppText>
            </View>
          </View>

          <View style={styles.cardFooterBottomRow}>
            <Clock size={11} color="#94A3B8" />
            <AppText style={styles.createdDateText}>
              {details.formattedDate}
            </AppText>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Screen style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ─── Compact Header ─────────────────────────────────────────────────── */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerInner}>
          <TouchableOpacity
            style={styles.headerMenuBtn}
            onPress={openDrawer}
            hitSlop={8}
            activeOpacity={0.75}
            accessibilityLabel="Open navigation menu"
            accessibilityRole="button"
          >
            <Menu size={20} color="#1E293B" strokeWidth={2.2} />
          </TouchableOpacity>

          <View style={styles.headerTitleBlock}>
            <AppText style={styles.headerTitle}>Payments</AppText>
            <AppText style={styles.headerSubtitle}>Revenue and transactions</AppText>
          </View>
        </View>
      </View>

      {/* ─── Main Content List ──────────────────────────────────────────────── */}
      {isPaymentsLoading && !isRefetching && allPayments.length === 0 ? (
        <View style={styles.centerContainer}>
          <LoadingState message="Loading payment transactions..." />
        </View>
      ) : isPaymentsError && allPayments.length === 0 ? (
        <View style={styles.centerContainer}>
          <ErrorState
            title="Unable to Load Payments"
            message={
              paymentsError instanceof Error
                ? paymentsError.message
                : 'Failed to load payments. Please check your network and try again.'
            }
            onRetry={onRefresh}
          />
        </View>
      ) : (
        <FlatList
          data={filteredPayments}
          keyExtractor={(item) => item.id}
          renderItem={renderPaymentCard}
          ListHeaderComponent={renderListHeader}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 96 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={Colors.brand.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <EmptyState
                title="No Payments Found"
                description={
                  hasActiveFilters
                    ? 'No transactions match the selected filters. Try clearing the filters.'
                    : 'No transaction records found for this club.'
                }
              />
            </View>
          }
        />
      )}

      {/* ─── Service Filter Modal Sheet ────────────────────────────────────── */}
      <ModalSheet
        visible={isServiceModalVisible}
        onClose={() => setIsServiceModalVisible(false)}
        title="Filter by Service"
      >
        <View style={styles.pickerModalContent}>
          <AppText style={styles.pickerModalDesc}>
            Filter transactions by club service category:
          </AppText>

          <View style={styles.pickerOptionsList}>
            {SERVICE_OPTIONS.map((opt) => {
              const isSelected = categoryFilter === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.pickerOptionCard, isSelected && styles.pickerOptionCardSelected]}
                  onPress={() => {
                    setCategoryFilter(opt.id);
                    setIsServiceModalVisible(false);
                  }}
                  activeOpacity={0.75}
                >
                  <AppText
                    style={[
                      styles.pickerOptionLabel,
                      isSelected && styles.pickerOptionLabelSelected,
                    ]}
                  >
                    {opt.label}
                  </AppText>
                  {isSelected && (
                    <CheckCircle2 size={16} color={Colors.brand.primary} strokeWidth={2.2} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ModalSheet>

      {/* ─── Status Filter Modal Sheet ─────────────────────────────────────── */}
      <ModalSheet
        visible={isStatusModalVisible}
        onClose={() => setIsStatusModalVisible(false)}
        title="Filter by Status"
      >
        <View style={styles.pickerModalContent}>
          <AppText style={styles.pickerModalDesc}>
            Filter transactions by current payment status:
          </AppText>

          <View style={styles.pickerOptionsList}>
            {STATUS_OPTIONS.map((opt) => {
              const isSelected = statusFilter === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.pickerOptionCard, isSelected && styles.pickerOptionCardSelected]}
                  onPress={() => {
                    setStatusFilter(opt.id);
                    setIsStatusModalVisible(false);
                  }}
                  activeOpacity={0.75}
                >
                  <AppText
                    style={[
                      styles.pickerOptionLabel,
                      isSelected && styles.pickerOptionLabelSelected,
                    ]}
                  >
                    {opt.label}
                  </AppText>
                  {isSelected && (
                    <CheckCircle2 size={16} color={Colors.brand.primary} strokeWidth={2.2} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ModalSheet>

      {/* ─── Transaction Detail & Reconciliation Modal Sheet ───────────────── */}
      <Modal
        visible={selectedPayment !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedPayment(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {selectedPayment && (() => {
              const modalDetails = parsePaymentDetails(selectedPayment);
              return (
                <>
                  <View style={styles.modalHeader}>
                    <View style={styles.modalHeaderTitleGroup}>
                      <AppText style={styles.modalTitle}>Transaction Details</AppText>
                      <TouchableOpacity
                        style={styles.modalRefRow}
                        onPress={() => {
                          setCopiedId(true);
                          setTimeout(() => setCopiedId(false), 2000);
                        }}
                        hitSlop={8}
                      >
                        <AppText style={styles.modalRefText}>
                          {selectedPayment.reference}
                        </AppText>
                        {copiedId ? (
                          <Check size={14} color="#15803D" />
                        ) : (
                          <Copy size={13} color="#64748B" />
                        )}
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      onPress={() => setSelectedPayment(null)}
                      style={styles.modalCloseBtn}
                      hitSlop={8}
                    >
                      <X size={18} color="#64748B" />
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                    <View style={styles.modalDetailsGrid}>
                      <View style={styles.modalGridRow}>
                        <AppText style={styles.modalGridKey}>Player / Customer</AppText>
                        <AppText style={styles.modalGridVal}>
                          {selectedPayment.player?.full_name || 'Member'}
                        </AppText>
                      </View>

                      {selectedPayment.player?.email && (
                        <View style={styles.modalGridRow}>
                          <AppText style={styles.modalGridKey}>Email Address</AppText>
                          <AppText style={styles.modalGridVal}>
                            {selectedPayment.player.email}
                          </AppText>
                        </View>
                      )}

                      <View style={styles.modalGridRow}>
                        <AppText style={styles.modalGridKey}>Amount</AppText>
                        <AppText style={[styles.modalGridVal, styles.modalAmountVal]}>
                          {modalDetails.formattedAmount}
                        </AppText>
                      </View>

                      <View style={styles.modalGridRow}>
                        <AppText style={styles.modalGridKey}>Status</AppText>
                        <View
                          style={[
                            styles.statusBadge,
                            selectedPayment.status === 'succeeded' && styles.statusBadgeSucceeded,
                            selectedPayment.status === 'failed' && styles.statusBadgeFailed,
                            (selectedPayment.status === 'pending' ||
                              selectedPayment.status === 'processing') &&
                              styles.statusBadgePending,
                            selectedPayment.status === 'cancelled' && styles.statusBadgeCancelled,
                            (selectedPayment.status === 'refunded' ||
                              selectedPayment.status === 'partially_refunded') &&
                              styles.statusBadgeRefunded,
                          ]}
                        >
                          <AppText
                            style={[
                              styles.statusBadgeText,
                              selectedPayment.status === 'succeeded' && styles.statusBadgeTextSucceeded,
                              selectedPayment.status === 'failed' && styles.statusBadgeTextFailed,
                              (selectedPayment.status === 'pending' ||
                                selectedPayment.status === 'processing') &&
                                styles.statusBadgeTextPending,
                              selectedPayment.status === 'cancelled' && styles.statusBadgeTextCancelled,
                              (selectedPayment.status === 'refunded' ||
                                selectedPayment.status === 'partially_refunded') &&
                                styles.statusBadgeTextRefunded,
                            ]}
                          >
                            {selectedPayment.status.toUpperCase()}
                          </AppText>
                        </View>
                      </View>

                      <View style={styles.modalGridRow}>
                        <AppText style={styles.modalGridKey}>Service Category</AppText>
                        <AppText style={styles.modalGridVal}>
                          {modalDetails.serviceType}
                        </AppText>
                      </View>

                      {modalDetails.activityTitle && (
                        <View style={styles.modalGridRow}>
                          <AppText style={styles.modalGridKey}>Activity / Item</AppText>
                          <AppText style={styles.modalGridVal}>
                            {modalDetails.activityTitle}
                          </AppText>
                        </View>
                      )}

                      {modalDetails.activitySubtitle && (
                        <View style={styles.modalGridRow}>
                          <AppText style={styles.modalGridKey}>Service Details</AppText>
                          <AppText style={styles.modalGridVal}>
                            {modalDetails.activitySubtitle}
                          </AppText>
                        </View>
                      )}

                      <View style={styles.modalGridRow}>
                        <AppText style={styles.modalGridKey}>Payment Method</AppText>
                        <AppText style={styles.modalGridVal}>
                          {modalDetails.methodLabel}
                        </AppText>
                      </View>

                      {selectedPayment.provider_payment_id && (
                        <View style={styles.modalGridRow}>
                          <AppText style={styles.modalGridKey}>Gateway Reference</AppText>
                          <AppText style={styles.modalGridVal}>
                            {selectedPayment.provider_payment_id}
                          </AppText>
                        </View>
                      )}

                      <View style={styles.modalGridRow}>
                        <AppText style={styles.modalGridKey}>Initiated At</AppText>
                        <AppText style={styles.modalGridVal}>
                          {modalDetails.formattedDate}
                        </AppText>
                      </View>

                      {selectedPayment.paid_at && (
                        <View style={styles.modalGridRow}>
                          <AppText style={styles.modalGridKey}>Paid At</AppText>
                          <AppText style={styles.modalGridVal}>
                            {new Date(selectedPayment.paid_at).toLocaleString()}
                          </AppText>
                        </View>
                      )}

                      {selectedPayment.refunded_at && (
                        <View style={styles.modalGridRow}>
                          <AppText style={styles.modalGridKey}>Refunded At</AppText>
                          <AppText style={styles.modalGridVal}>
                            {new Date(selectedPayment.refunded_at).toLocaleString()}
                          </AppText>
                        </View>
                      )}

                      {selectedPayment.refunded_amount != null && (
                        <View style={styles.modalGridRow}>
                          <AppText style={styles.modalGridKey}>Refunded Amount</AppText>
                          <AppText style={[styles.modalGridVal, { color: '#6D28D9', fontWeight: '700' }]}>
                            {formatCurrency(selectedPayment.refunded_amount, 'USD')}
                          </AppText>
                        </View>
                      )}

                      {selectedPayment.refund_reason && (
                        <View style={styles.modalNoteSection}>
                          <AppText style={styles.modalNoteLabel}>Refund Reason</AppText>
                          <AppText style={styles.modalNoteContent}>
                            {selectedPayment.refund_reason}
                          </AppText>
                        </View>
                      )}

                      {modalDetails.failureReason && (
                        <View style={styles.modalNoteSection}>
                          <AppText style={[styles.modalNoteLabel, { color: '#DC2626' }]}>
                            Failure Explanation
                          </AppText>
                          <AppText style={[styles.modalNoteContent, { color: '#B91C1C' }]}>
                            {modalDetails.failureReason}
                          </AppText>
                        </View>
                      )}

                      {modalDetails.cleanNote && (
                        <View style={styles.modalNoteSection}>
                          <AppText style={styles.modalNoteLabel}>Customer Note</AppText>
                          <AppText style={styles.modalNoteContent}>
                            {modalDetails.cleanNote}
                          </AppText>
                        </View>
                      )}
                    </View>
                  </ScrollView>

                  {/* Modal Footer Actions */}
                  <View style={styles.modalFooter}>
                    {selectedPayment.status === 'pending' ||
                    selectedPayment.status === 'processing' ? (
                      <View style={styles.modalPendingActions}>
                        <TouchableOpacity
                          style={styles.modalCancelPaymentBtn}
                          onPress={() => handleCancelPayment(selectedPayment)}
                          disabled={cancelPaymentMutation.isPending}
                        >
                          <AppText style={styles.modalCancelPaymentBtnText}>Cancel</AppText>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.modalConfirmPaidBtn}
                          onPress={() => handleMarkPaid(selectedPayment)}
                          disabled={succeedPaymentMutation.isPending}
                        >
                          <CheckCircle2 size={16} color="#FFFFFF" />
                          <AppText style={styles.modalConfirmPaidBtnText}>
                            {succeedPaymentMutation.isPending ? 'Processing...' : 'Mark as Paid'}
                          </AppText>
                        </TouchableOpacity>
                      </View>
                    ) : selectedPayment.status === 'succeeded' ? (
                      <View style={styles.modalPendingActions}>
                        <TouchableOpacity
                          style={[styles.modalCancelPaymentBtn, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}
                          onPress={() => {
                            setPaymentToRefund(selectedPayment);
                            setRefundReasonInput('');
                            setRefundDialogVisible(true);
                          }}
                        >
                          <RotateCcw size={14} color="#6D28D9" />
                          <AppText style={[styles.modalCancelPaymentBtnText, { color: '#6D28D9' }]}>
                            Issue Refund
                          </AppText>
                        </TouchableOpacity>

                        <PlatformButton
                          size="md"
                          variant="outline"
                          label="Close"
                          onPress={() => setSelectedPayment(null)}
                        />
                      </View>
                    ) : (
                      <PlatformButton
                        size="md"
                        variant="outline"
                        label="Close"
                        onPress={() => setSelectedPayment(null)}
                        fullWidth
                      />
                    )}
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ─── Refund Confirmation Dialog ───────────────────────────────────── */}
      <Modal
        visible={refundDialogVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRefundDialogVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 440 }]}>
            <View style={styles.modalHeader}>
              <View>
                <AppText style={styles.modalTitle}>Issue Refund</AppText>
                <AppText style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  {paymentToRefund?.reference} • {formatCurrency(paymentToRefund?.amount, 'USD')}
                </AppText>
              </View>
              <TouchableOpacity onPress={() => setRefundDialogVisible(false)} hitSlop={8}>
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16, gap: 12 }}>
              <AppText style={{ fontSize: 13, color: '#334155', lineHeight: 18 }}>
                Are you sure you want to refund this payment? The transaction will be marked as REFUNDED and deducted from net club revenue.
              </AppText>

              <View>
                <AppText style={{ fontSize: 12, fontWeight: '600', color: '#1E293B', marginBottom: 6 }}>
                  Refund Reason (Optional)
                </AppText>
                <TextInput
                  value={refundReasonInput}
                  onChangeText={setRefundReasonInput}
                  placeholder="e.g. Customer cancelled booking / service dispute"
                  placeholderTextColor="#94A3B8"
                  style={styles.refundInput}
                  multiline
                  numberOfLines={2}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <TouchableOpacity
                  style={[styles.refundDialogBtn, { backgroundColor: '#F1F5F9' }]}
                  onPress={() => setRefundDialogVisible(false)}
                  disabled={refundPaymentMutation.isPending}
                >
                  <AppText style={{ color: '#475569', fontWeight: '600', fontSize: 13 }}>Cancel</AppText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.refundDialogBtn, { backgroundColor: '#DC2626' }]}
                  onPress={async () => {
                    if (!paymentToRefund) return;
                    try {
                      await refundPaymentMutation.mutateAsync({
                        paymentId: paymentToRefund.id,
                        refundReason: refundReasonInput.trim() || 'Club staff refund',
                      });
                      setRefundDialogVisible(false);
                      setSelectedPayment(null);
                      refetchSummary();
                      refetchPayments();
                      Alert.alert('Refund Issued', `Payment ${paymentToRefund.reference} was successfully refunded.`);
                    } catch (err: any) {
                      const msg = err?.response?.data?.detail || err?.message || 'Failed to refund payment';
                      Alert.alert('Refund Error', msg);
                    }
                  }}
                  disabled={refundPaymentMutation.isPending}
                >
                  <AppText style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
                    {refundPaymentMutation.isPending ? 'Refunding...' : 'Confirm Refund'}
                  </AppText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  emptyContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },

  // 1. Compact Header
  headerContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.borderLight,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerMenuBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.background.primary,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleBlock: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text.primary,
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: Colors.text.secondary,
    marginTop: 1,
  },

  // 2. Summary Metrics (Responsive 2-Column Grid on Mobile)
  listHeaderWrapper: {
    gap: 12,
    marginBottom: 4,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    paddingVertical: 11,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    justifyContent: 'space-between',
    minHeight: 84,
    ...Shadows.sm,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  summaryIconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
    flex: 1,
    flexShrink: 1,
  },
  summaryValueBlock: {
    gap: 1,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text.primary,
    letterSpacing: -0.3,
  },
  summarySubtext: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '500',
  },

  // 3. Unified Filter Card
  filterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    gap: 8,
    ...Shadows.sm,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.primary,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingHorizontal: 10,
    height: 38,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: Colors.text.primary,
    paddingVertical: 0,
  },
  dropdownsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dropdownTrigger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background.primary,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingHorizontal: 10,
    height: 34,
  },
  dropdownTriggerActive: {
    backgroundColor: Colors.brand.primaryLight,
    borderColor: '#C3E7D2',
  },
  dropdownTriggerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    marginRight: 4,
  },
  dropdownLabelPrefix: {
    fontSize: 11,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  dropdownValueText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: Colors.text.primary,
    flex: 1,
  },
  dropdownValueTextActive: {
    color: Colors.brand.primary,
    fontWeight: '700',
  },
  activeFiltersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.surface.borderLight,
  },
  resultsCountText: {
    fontSize: 10.5,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  resetFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.brand.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  resetFiltersBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: Colors.brand.primary,
  },

  // 4. Redesigned Payment Transaction Cards
  paymentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    gap: 8,
    ...Shadows.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  playerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  statusBadgeSucceeded: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusBadgePending: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  statusBadgeFailed: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  statusBadgeCancelled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  statusBadgeRefunded: {
    backgroundColor: '#EDE9FE',
    borderColor: '#DDD6FE',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  statusBadgeTextSucceeded: {
    color: '#065F46',
  },
  statusBadgeTextPending: {
    color: '#92400E',
  },
  statusBadgeTextFailed: {
    color: '#991B1B',
  },
  statusBadgeTextCancelled: {
    color: '#475569',
  },
  statusBadgeTextRefunded: {
    color: '#6D28D9',
  },

  // Main section: prominent amount + service type + item description
  cardMainSection: {
    gap: 3,
    marginTop: 2,
  },
  amountText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  serviceInfoGroup: {
    gap: 1,
  },
  serviceNameHeading: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  serviceItemDetailText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '400',
  },

  // Failure & Refund notices
  failureNoticeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  failureNoticeText: {
    fontSize: 11,
    color: '#B91C1C',
    fontWeight: '500',
    flex: 1,
  },
  refundNoticeStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F5F3FF',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#EDE9FE',
  },
  refundNoticeText: {
    fontSize: 11,
    color: '#6D28D9',
    fontWeight: '600',
    flex: 1,
  },

  // Divider
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 4,
  },

  // Bottom section: reference + method on top row, timestamp below
  cardFooter: {
    gap: 5,
  },
  cardFooterTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  txReferenceGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  txReferencePrefix: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  txReferenceValue: {
    fontSize: 12,
    color: '#1E293B',
    fontWeight: '600',
  },
  cardFooterBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  createdDateText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '400',
  },
  methodBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  methodBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },

  // Picker Modal Sheet Styles
  pickerModalContent: {
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  pickerModalDesc: {
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 16,
  },
  pickerOptionsList: {
    gap: 6,
    marginTop: 4,
  },
  pickerOptionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.background.primary,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.surface.borderLight,
  },
  pickerOptionCardSelected: {
    backgroundColor: Colors.brand.primaryLight,
    borderColor: '#C3E7D2',
  },
  pickerOptionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.text.primary,
  },
  pickerOptionLabelSelected: {
    fontWeight: '700',
    color: Colors.brand.primary,
  },

  // Transaction Details Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
    overflow: 'hidden',
    ...Shadows.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.borderLight,
  },
  modalHeaderTitleGroup: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalRefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  modalRefText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalScroll: {
    padding: 16,
  },
  modalDetailsGrid: {
    gap: 10,
  },
  modalGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  modalGridKey: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '500',
  },
  modalGridVal: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  modalAmountVal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#047857',
  },
  modalNoteSection: {
    backgroundColor: Colors.background.primary,
    borderRadius: Radius.md,
    padding: 10,
    gap: 4,
    marginTop: 4,
  },
  modalNoteLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  modalNoteContent: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 16,
  },
  modalFooter: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.surface.borderLight,
    backgroundColor: '#FAFAF9',
  },
  modalPendingActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelPaymentBtn: {
    flex: 1,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  modalCancelPaymentBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  modalConfirmPaidBtn: {
    flex: 1,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  modalConfirmPaidBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  refundInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: Radius.md,
    padding: 10,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  refundDialogBtn: {
    flex: 1,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
