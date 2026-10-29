/**
 * Aught2 Pickleball — Club Owner Payments Screen
 *
 * Redesigned Payments Screen:
 *   - Compact header: [☰ Menu] Payments (Track revenue and transactions)
 *   - Summary metric cards with standard US Dollar currency formatting:
 *       * Net Collected ($)
 *       * Total Payments
 *       * Successful
 *       * Pending
 *       * Refunded
 *   - Multi-facet filters: Search, Service Category Pills, and Status Filter Pills
 *   - Clean, professional transaction cards without raw metadata:
 *       * Row 1: Player Name + Status Badge (Succeeded, Pending, Failed, Cancelled, Refunded)
 *       * Row 2: Transaction Reference + Category Badge + Payment Method Pill
 *       * Row 3: Prominent US Dollar Amount ($36.75)
 *       * Row 4: Structured Service Details (Service Name & Activity Details)
 *       * Row 5: Creation Date + Optional Provider Reference
 *       * Friendly Failure Reason (e.g. 'Payment was not completed by the user')
 *       * Clean User Note (strictly without [META] or raw JSON)
 *   - Comprehensive transaction inspection modal for reconciliation and refunds
 *   - Real-time 15s auto-polling, focus refetch, & pull-to-refresh
 *   - Bottom padding avoiding fixed bottom navigation overlay
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
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import {
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Crown,
  FileText,
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
  EmptyState,
  ErrorState,
  LoadingState,
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
import { formatCurrency, parsePaymentDetails } from '@/utils';
import type { Payment, PaymentMethod, PaymentPurpose, PaymentStatus } from '@/types';

type FilterTab = 'all' | 'succeeded' | 'pending' | 'failed' | 'cancelled' | 'refunded';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All Status' },
  { key: 'succeeded', label: 'Succeeded' },
  { key: 'pending', label: 'Pending' },
  { key: 'failed', label: 'Failed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'refunded', label: 'Refunded' },
];

type CategoryTab = 'all' | 'membership' | 'court_booking' | 'tournament' | 'league' | 'event' | 'lesson';

const CATEGORY_TABS: { key: CategoryTab; label: string }[] = [
  { key: 'all', label: 'All Services' },
  { key: 'membership', label: 'Memberships' },
  { key: 'court_booking', label: 'Court Bookings' },
  { key: 'tournament', label: 'Tournaments' },
  { key: 'league', label: 'Leagues' },
  { key: 'event', label: 'Events' },
  { key: 'lesson', label: 'Lessons' },
];

function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export default function ClubPaymentsScreen() {
  const insets = useSafeAreaInsets();
  const openDrawer = useDrawerStore((s) => s.openDrawer);

  const { clubId: activeClubId } = useActiveClub();
  const { canManagePayments } = usePermission();
  const clubId = activeClubId ?? '';

  const [statusFilter, setStatusFilter] = useState<FilterTab>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  // Refund dialog state
  const [refundDialogVisible, setRefundDialogVisible] = useState(false);
  const [paymentToRefund, setPaymentToRefund] = useState<Payment | null>(null);
  const [refundReasonInput, setRefundReasonInput] = useState('');

  // Queries: Auto-sync player transactions with 15-second background polling
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

  // Auto-refresh when Club Owner returns to / focuses the screen
  useFocusEffect(
    useCallback(() => {
      refetchSummary();
      refetchPayments();
    }, [refetchSummary, refetchPayments])
  );

  // Mutations for staff reconciliation
  const succeedPaymentMutation = useSucceedPayment(clubId);
  const cancelPaymentMutation = useCancelPayment(clubId);
  const refundPaymentMutation = useRefundPayment(clubId);

  // Filtered payments list using clean parsed details (not raw metadata)
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

      // 2. Category Filter
      if (categoryFilter !== 'all') {
        if (p.purpose !== categoryFilter) return false;
      }

      // 3. Search Query Filter (searches clean display values only)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const details = parsePaymentDetails(p);
        const refMatch = p.reference?.toLowerCase().includes(q);
        const nameMatch = p.player?.full_name?.toLowerCase().includes(q);
        const emailMatch = p.player?.email?.toLowerCase().includes(q);
        const serviceMatch = details.serviceType.toLowerCase().includes(q);
        const activityMatch = details.activityTitle?.toLowerCase().includes(q);
        const noteMatch = details.cleanNote?.toLowerCase().includes(q);

        if (!refMatch && !nameMatch && !emailMatch && !serviceMatch && !activityMatch && !noteMatch) {
          return false;
        }
      }

      return true;
    });
  }, [allPayments, statusFilter, categoryFilter, searchQuery]);

  // Metric values calculated from actual payment records in US Dollars
  const {
    totalCollectedAmount,
    totalPaymentsCount,
    successfulCount,
    pendingCount,
    failedCount,
    refundedCount,
    totalRefundedAmount,
  } = useMemo(() => {
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
    const netCollected = grossCollected - refundedSum;

    const totalCollected =
      summary?.net_collected != null
        ? Number(summary.net_collected)
        : netCollected;

    const totalPayments = summary?.total_count ?? allPayments.length;
    const successful = summary?.succeeded_count ?? succeededList.length;
    const pending = summary?.pending_count ?? pendingList.length;
    const failed = summary?.failed_count ?? failedList.length;
    const refunded = summary?.refunded_count ?? refundedList.length;
    const totalRefundedAmt =
      summary?.total_refunded_amount != null
        ? Number(summary.total_refunded_amount)
        : refundedSum;

    return {
      totalCollectedAmount: Math.max(0, totalCollected),
      totalPaymentsCount: totalPayments,
      successfulCount: successful,
      pendingCount: pending,
      failedCount: failed,
      refundedCount: refunded,
      totalRefundedAmount: totalRefundedAmt,
    };
  }, [allPayments, summary]);

  const onRefresh = () => {
    refetchSummary();
    refetchPayments();
  };

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

  // Guard: require manage_payments permission
  if (!canManagePayments) {
    return (
      <Screen style={styles.container}>
        <View style={[styles.headerContainer, { paddingTop: insets.top + 6 }]}>
          <View style={styles.headerInner}>
            <TouchableOpacity style={styles.headerMenuBtn} onPress={openDrawer}>
              <Menu size={20} color="#1E293B" strokeWidth={2.2} />
            </TouchableOpacity>
            <View style={styles.headerTitleBlock}>
              <AppText style={styles.headerTitle}>Payments</AppText>
              <AppText style={styles.headerSubtitle}>Track revenue and transactions</AppText>
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

  // Category Icon & Badge Config
  const getCategoryDetails = (purpose: PaymentPurpose | string) => {
    switch (purpose) {
      case 'court_booking':
        return { label: 'Court Booking', color: '#0369A1', bg: '#E0F2FE', Icon: LayoutGrid };
      case 'tournament':
        return { label: 'Tournament', color: '#7C3AED', bg: '#EDE9FE', Icon: Trophy };
      case 'league':
        return { label: 'League', color: '#0D9488', bg: '#CCFBF1', Icon: Users };
      case 'event':
        return { label: 'Event', color: '#BE185D', bg: '#FCE7F3', Icon: Calendar };
      case 'lesson':
        return { label: 'Lesson', color: '#D97706', bg: '#FEF3C7', Icon: UserCheck };
      case 'membership':
      default:
        return { label: 'Membership', color: '#B45309', bg: '#FEF3C7', Icon: Crown };
    }
  };

  // ─── Render Page Header, Metrics & Filters ─────────────────────────────────
  const renderHeader = () => (
    <View style={styles.listHeaderWrapper}>
      {/* ─── 1. Summary Metrics Cards (Consistent USD Formatting) ──────────── */}
      <View style={styles.metricsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.metricsScrollContent}
        >
          {/* Card 1: NET COLLECTED */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconBox, { backgroundColor: '#ECFDF5' }]}>
              <CreditCard size={15} color="#059669" strokeWidth={2.2} />
            </View>
            <AppText style={styles.metricLabel}>NET COLLECTED</AppText>
            <AppText style={[styles.metricValue, { color: '#047857' }]} numberOfLines={1}>
              {formatCurrency(totalCollectedAmount, 'USD')}
            </AppText>
          </View>

          {/* Card 2: TOTAL PAYMENTS */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconBox, { backgroundColor: '#F1F5F9' }]}>
              <FileText size={15} color="#475569" strokeWidth={2.2} />
            </View>
            <AppText style={styles.metricLabel}>TOTAL PAYMENTS</AppText>
            <AppText style={styles.metricValue} numberOfLines={1}>
              {totalPaymentsCount}
            </AppText>
          </View>

          {/* Card 3: SUCCESSFUL */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconBox, { backgroundColor: '#DEF2E6' }]}>
              <CheckCircle2 size={15} color="#15803D" strokeWidth={2.2} />
            </View>
            <AppText style={styles.metricLabel}>SUCCESSFUL</AppText>
            <AppText style={[styles.metricValue, { color: '#15803D' }]} numberOfLines={1}>
              {successfulCount}
            </AppText>
          </View>

          {/* Card 4: PENDING */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconBox, { backgroundColor: '#FEF3C7' }]}>
              <Clock size={15} color="#D97706" strokeWidth={2.2} />
            </View>
            <AppText style={styles.metricLabel}>PENDING</AppText>
            <AppText style={[styles.metricValue, { color: '#B45309' }]} numberOfLines={1}>
              {pendingCount}
            </AppText>
          </View>

          {/* Card 5: REFUNDED */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconBox, { backgroundColor: '#EDE9FE' }]}>
              <RotateCcw size={15} color="#6D28D9" strokeWidth={2.2} />
            </View>
            <AppText style={styles.metricLabel}>REFUNDED ({refundedCount})</AppText>
            <AppText style={[styles.metricValue, { color: '#6D28D9' }]} numberOfLines={1}>
              {formatCurrency(totalRefundedAmount, 'USD')}
            </AppText>
          </View>
        </ScrollView>
      </View>

      {/* ─── 2. Search Bar ─────────────────────────────────────────────────── */}
      <View style={styles.searchBarContainer}>
        <Search size={16} color="#64748B" style={{ marginLeft: 12 }} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by player, reference, or service..."
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8} style={{ marginRight: 10 }}>
            <X size={15} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* ─── 3. Category Filter Pills ──────────────────────────────────────── */}
      <View style={styles.filterWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {CATEGORY_TABS.map((tab) => {
            const isActive = categoryFilter === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.filterPill, isActive && styles.filterPillActive]}
                onPress={() => setCategoryFilter(tab.key)}
                activeOpacity={0.8}
              >
                <AppText style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                  {tab.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ─── 4. Status Filter Pills ───────────────────────────────────────── */}
      <View style={[styles.filterWrapper, { marginTop: 4 }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {FILTER_TABS.map((tab) => {
            const isActive = statusFilter === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.filterPill, isActive && styles.filterPillActive]}
                onPress={() => setStatusFilter(tab.key)}
                activeOpacity={0.8}
              >
                <AppText style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                  {tab.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );

  // ─── Redesigned Clean Transaction Card ─────────────────────────────────────
  const renderPaymentCard = ({ item }: { item: Payment }) => {
    const details = parsePaymentDetails(item);
    const playerName = item.player?.full_name || item.player?.email || 'Unknown Member';

    const isFailed = item.status === 'failed';
    const isPending = item.status === 'pending' || item.status === 'processing';
    const isSucceeded = item.status === 'succeeded';
    const isCancelled = item.status === 'cancelled';
    const isRefunded = item.status === 'refunded' || item.status === 'partially_refunded';

    const cat = getCategoryDetails(item.purpose);
    const CategoryIcon = cat.Icon;

    return (
      <TouchableOpacity
        style={styles.paymentCard}
        onPress={() => setSelectedPayment(item)}
        activeOpacity={0.85}
      >
        {/* Row 1: Player Name & Status Badge */}
        <View style={styles.cardHeaderRow}>
          <AppText style={styles.playerName} numberOfLines={1}>
            {playerName}
          </AppText>

          <View
            style={[
              styles.statusBadge,
              isFailed && styles.statusBadgeFailed,
              isPending && styles.statusBadgePending,
              isSucceeded && styles.statusBadgeSucceeded,
              isCancelled && styles.statusBadgeCancelled,
              isRefunded && styles.statusBadgeRefunded,
            ]}
          >
            <AppText
              style={[
                styles.statusBadgeText,
                isFailed && styles.statusBadgeTextFailed,
                isPending && styles.statusBadgeTextPending,
                isSucceeded && styles.statusBadgeTextSucceeded,
                isCancelled && styles.statusBadgeTextCancelled,
                isRefunded && styles.statusBadgeTextRefunded,
              ]}
            >
              {item.status.toUpperCase()}
            </AppText>
          </View>
        </View>

        {/* Row 2: Reference ID & Badges Group */}
        <View style={styles.transactionDetailsRow}>
          <AppText style={styles.referenceText}>{item.reference}</AppText>
          <View style={styles.badgeGroupRow}>
            <View style={[styles.categoryBadge, { backgroundColor: cat.bg }]}>
              <CategoryIcon size={11} color={cat.color} />
              <AppText style={[styles.categoryBadgeText, { color: cat.color }]}>
                {details.serviceType}
              </AppText>
            </View>
            <View style={styles.methodBadge}>
              <AppText style={styles.methodBadgeText}>
                {details.methodLabel}
              </AppText>
            </View>
          </View>
        </View>

        {/* Row 3: Prominent Amount in US Dollars */}
        <View style={styles.amountRow}>
          <AppText style={styles.amountText}>{details.formattedAmount}</AppText>
        </View>

        {/* Row 4: Meaningful Service Details (Never Raw JSON or Metadata) */}
        <View style={styles.serviceDetailsBox}>
          <AppText style={styles.serviceNameHeading}>
            {details.serviceType}
          </AppText>
          {details.activityTitle ? (
            <AppText style={styles.activityDetailText}>
              {details.activityTitle}
              {details.activitySubtitle ? ` · ${details.activitySubtitle}` : ''}
            </AppText>
          ) : details.activitySubtitle ? (
            <AppText style={styles.activityDetailText}>{details.activitySubtitle}</AppText>
          ) : null}
        </View>

        {/* Refund Strip if Refunded */}
        {isRefunded && (
          <View style={styles.refundCardStrip}>
            <RotateCcw size={13} color="#6D28D9" />
            <AppText style={styles.refundCardStripText} numberOfLines={1}>
              Refunded: {formatCurrency(item.refunded_amount || item.amount, 'USD')}
              {item.refund_reason ? ` • ${item.refund_reason}` : ''}
            </AppText>
          </View>
        )}

        {/* Thin Divider */}
        <View style={styles.cardDivider} />

        {/* Row 5: Creation Date and Provider Ref */}
        <View style={styles.cardBottomRow}>
          <AppText style={styles.createdDateText}>
            Created: {details.formattedDate}
          </AppText>
          {item.provider_payment_id ? (
            <AppText style={styles.providerRefText} numberOfLines={1}>
              Ref: {item.provider_payment_id}
            </AppText>
          ) : null}
        </View>

        {/* Failure Explanation (Human-readable, no technical jargon) */}
        {details.failureReason ? (
          <View style={styles.failureReasonRow}>
            <ShieldAlert size={13} color="#DC2626" />
            <AppText style={styles.failureReasonText}>
              {details.failureReason}
            </AppText>
          </View>
        ) : null}

        {/* User Note (Clean, no raw metadata) */}
        {details.cleanNote && !isRefunded ? (
          <AppText style={styles.noteText} numberOfLines={2}>
            Note: {details.cleanNote}
          </AppText>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <Screen style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ─── Compact Header ─────────────────────────────────────────────────── */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + 6 }]}>
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
            <AppText style={styles.headerSubtitle}>Track revenue and transactions</AppText>
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
          ListHeaderComponent={renderHeader}
          contentContainerStyle={[
            styles.listContent,
            {
              paddingBottom: insets.bottom + 96,
            },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor="#176B57"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <EmptyState
                title="No Payments Found"
                description={
                  statusFilter === 'all'
                    ? 'No transaction records found for this club.'
                    : `No payments currently match the "${capitalize(statusFilter)}" filter.`
                }
              />
            </View>
          }
        />
      )}

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
                        <AppText style={styles.modalGridKey}>Customer / Player</AppText>
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

                  {/* Modal Footer Actions: Staff reconciliation and refunds */}
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

// ─── Styles ──────────────────────────────────────────────────────────────────

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

  // ─── Header ────────────────────────────────────────────────────────────────
  headerContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EBEFEA',
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerMenuBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2ECE7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  headerTitleBlock: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 26,
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 16,
    marginTop: 2,
    fontWeight: '400',
  },

  // ─── List Layout & Wrapper ─────────────────────────────────────────────────
  listHeaderWrapper: {
    gap: 12,
    paddingTop: 12,
    marginBottom: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  emptyContainer: {
    paddingTop: 30,
    paddingHorizontal: 16,
  },

  // ─── Summary Metric Cards ──────────────────────────────────────────────────
  metricsWrapper: {
    width: '100%',
  },
  metricsScrollContent: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: 16,
  },
  metricCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5ECE8',
    padding: 12,
    minWidth: 110,
    minHeight: 74,
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  metricIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 6,
  },
  metricValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },

  // ─── Search Bar ────────────────────────────────────────────────────────────
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5ECE8',
    height: 42,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#0F172A',
    height: '100%',
  },

  // ─── Status & Category Filter Pills ────────────────────────────────────────
  filterWrapper: {
    width: '100%',
  },
  filterScrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 16,
  },
  filterPill: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5ECE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillActive: {
    backgroundColor: '#176B57',
    borderColor: '#176B57',
  },
  filterPillText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // ─── Redesigned Transaction Cards ──────────────────────────────────────────
  paymentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5ECE8',
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  playerName: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 20,
  },

  // Transaction Details Row
  transactionDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    flexWrap: 'wrap',
    gap: 6,
  },
  referenceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    fontVariant: ['tabular-nums'],
  },
  badgeGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  methodBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  methodBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.2,
  },

  // Amount Row
  amountRow: {
    marginTop: 8,
  },
  amountText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },

  // Meaningful Service Details Box
  serviceDetailsBox: {
    backgroundColor: '#F8FAF9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#EDF2EE',
  },
  serviceNameHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102B2A',
  },
  activityDetailText: {
    fontSize: 12.5,
    color: '#475569',
    marginTop: 2,
    fontWeight: '500',
  },

  // Refund Strip
  refundCardStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F5F3FF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  refundCardStripText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#6D28D9',
  },

  // Divider
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },

  // Date & Provider Bottom Row
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  createdDateText: {
    fontSize: 11.5,
    color: '#64748B',
  },
  providerRefText: {
    fontSize: 11,
    color: '#94A3B8',
  },

  // Failure Reason
  failureReasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 6,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  failureReasonText: {
    fontSize: 11.5,
    color: '#B91C1C',
    fontWeight: '500',
    flex: 1,
    lineHeight: 15,
  },

  // Note
  noteText: {
    fontSize: 11.5,
    color: '#64748B',
    fontStyle: 'italic',
    lineHeight: 15,
    marginTop: 4,
  },

  // ─── Status Badges ─────────────────────────────────────────────────────────
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statusBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  statusBadgeSucceeded: {
    backgroundColor: '#DEF2E6',
  },
  statusBadgeTextSucceeded: {
    color: '#15803D',
  },
  statusBadgePending: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeTextPending: {
    color: '#B45309',
  },
  statusBadgeFailed: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeTextFailed: {
    color: '#DC2626',
  },
  statusBadgeCancelled: {
    backgroundColor: '#F1F5F9',
  },
  statusBadgeTextCancelled: {
    color: '#64748B',
  },
  statusBadgeRefunded: {
    backgroundColor: '#EDE9FE',
  },
  statusBadgeTextRefunded: {
    color: '#6D28D9',
  },

  // ─── Modal Sheet ───────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxWidth: 520,
    maxHeight: '85%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderTitleGroup: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  modalRefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  modalRefText: {
    fontSize: 12,
    color: '#64748B',
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  modalDetailsGrid: {
    gap: 12,
  },
  modalGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAF9',
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
    textAlign: 'right',
    maxWidth: '60%',
  },
  modalAmountVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalNoteSection: {
    backgroundColor: '#F8FAF9',
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
  },
  modalNoteLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  modalNoteContent: {
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 17,
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  modalPendingActions: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  modalCancelPaymentBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  modalCancelPaymentBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  modalConfirmPaidBtn: {
    flex: 2,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#15803D',
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
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  refundDialogBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
