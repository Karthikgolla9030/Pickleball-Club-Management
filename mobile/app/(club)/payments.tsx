/**
 * Aught2 Pickleball — Club Owner Payments Screen
 *
 * Pixel-accurate implementation matching reference specification:
 *   - Compact header: [☰ Menu] Payments (Track revenue and transactions) [🔔] [Avatar A]
 *   - 4 Summary metric cards: Total Collected, Total Payments, Successful, Pending
 *   - Horizontal status filter pills: All | Succeeded | Pending | Failed | Cancelled
 *   - Vertically scrolling transaction cards with exact hierarchy:
 *       * Player name + Status badge
 *       * Reference ID (e.g. A2P-2026-000004)
 *       * Amount + Method badge (e.g. ONLINE, BANK TRANSFER)
 *       * Purpose & Plan details
 *       * Thin divider
 *       * Creation date (e.g. Created: 27 Sept 2026)
 *       * Note / Failure reason (italic)
 *   - Detailed transaction inspection modal sheet for full history & admin reconciliation
 *   - Automatic player-side payment synchronization via 15s polling, focus refetch, & pull-to-refresh
 *   - Manual "+ Record" button & creation modal completely removed
 *   - Fixed Club Owner bottom navigation preserved
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  FileText,
  Menu,
  ShieldAlert,
  X,
} from 'lucide-react-native';

import {
  AppText,
  Button,
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
  useSucceedPayment,
  useUnreadNotificationCount,
} from '@/hooks';
import { useDrawerStore } from '@/navigation';
import { useAuthStore } from '@/store';
import { Colors, Radius, Shadows, Spacing } from '@/theme';
import { formatCurrency } from '@/utils';
import type { Payment, PaymentMethod, PaymentStatus } from '@/types';

type FilterTab = 'all' | 'succeeded' | 'pending' | 'failed' | 'cancelled';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'succeeded', label: 'Succeeded' },
  { key: 'pending', label: 'Pending' },
  { key: 'failed', label: 'Failed' },
  { key: 'cancelled', label: 'Cancelled' },
];

function formatTransactionDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sept',
      'Oct',
      'Nov',
      'Dec',
    ];
    const day = d.getDate();
    const month = months[d.getMonth()] || '';
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return dateStr;
  }
}

function formatMethodLabel(method: PaymentMethod | string): string {
  if (!method) return 'ONLINE';
  const clean = String(method).toLowerCase().replace(/[_-]/g, ' ');
  return clean.toUpperCase();
}

function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export default function ClubPaymentsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const openDrawer = useDrawerStore((s) => s.openDrawer);
  const user = useAuthStore((s) => s.user);

  const { clubId: activeClubId } = useActiveClub();
  const { canManagePayments } = usePermission();
  const clubId = activeClubId ?? '';

  const [statusFilter, setStatusFilter] = useState<FilterTab>('all');
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [copiedId, setCopiedId] = useState(false);

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

  // Unread notifications for header badge
  const { data: unreadCount = 0 } = useUnreadNotificationCount();

  // Mutations for staff reconciliation
  const succeedPaymentMutation = useSucceedPayment(clubId);
  const cancelPaymentMutation = useCancelPayment(clubId);

  // Filtered payments list
  const filteredPayments = useMemo(() => {
    if (statusFilter === 'all') return allPayments;
    if (statusFilter === 'pending') {
      return allPayments.filter(
        (p) => p.status === 'pending' || p.status === 'processing'
      );
    }
    return allPayments.filter((p) => p.status === statusFilter);
  }, [allPayments, statusFilter]);

  // Metric values calculated from actual payment records
  const { totalCollectedAmount, totalPaymentsCount, successfulCount, pendingCount } =
    useMemo(() => {
      const succeededList = allPayments.filter((p) => p.status === 'succeeded');
      const pendingList = allPayments.filter(
        (p) => p.status === 'pending' || p.status === 'processing'
      );

      const calculatedCollected = succeededList.reduce(
        (acc, p) => acc + Number(p.amount || 0),
        0
      );

      const totalCollected =
        summary?.total_amount_collected != null
          ? Number(summary.total_amount_collected)
          : calculatedCollected;

      const totalPayments = summary?.total_count ?? allPayments.length;
      const successful = summary?.succeeded_count ?? succeededList.length;
      const pending = summary?.pending_count ?? pendingList.length;

      return {
        totalCollectedAmount: totalCollected,
        totalPaymentsCount: totalPayments,
        successfulCount: successful,
        pendingCount: pending,
      };
    }, [allPayments, summary]);

  const onRefresh = () => {
    refetchSummary();
    refetchPayments();
  };

  const avatarInitial = useMemo(() => {
    if (user?.full_name?.trim()) return user.full_name.trim().charAt(0).toUpperCase();
    if (user?.email?.trim()) return user.email.trim().charAt(0).toUpperCase();
    return 'A';
  }, [user]);

  // Handle Mark as Succeeded
  const handleMarkPaid = (payment: Payment) => {
    Alert.alert(
      'Confirm Payment Received',
      `Mark transaction ${payment.reference} (${payment.currency} ${payment.amount}) as successfully received?`,
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
          description="You do not have permission to manage payments for this club."
        />
      </Screen>
    );
  }

  // ─── Header Component inside FlatList ───────────────────────────────────────
  const renderHeader = () => (
    <View style={styles.listHeaderWrapper}>
      {/* ─── 1. Summary Metrics Strip ─────────────────────────────────────── */}
      <View style={styles.metricsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.metricsScrollContent}
        >
          {/* Card 1: TOTAL COLLECTED */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconBox, { backgroundColor: '#E8F5EE' }]}>
              <CreditCard size={15} color="#15803D" strokeWidth={2.2} />
            </View>
            <AppText style={styles.metricLabel}>TOTAL COLLECTED</AppText>
            <AppText style={[styles.metricValue, { color: '#15803D' }]} numberOfLines={1}>
              {formatCurrency(totalCollectedAmount)}
            </AppText>
          </View>

          {/* Card 2: TOTAL PAYMENTS */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconBox, { backgroundColor: '#EFF6FF' }]}>
              <FileText size={15} color="#2563EB" strokeWidth={2.2} />
            </View>
            <AppText style={styles.metricLabel}>TOTAL PAYMENTS</AppText>
            <AppText style={styles.metricValue} numberOfLines={1}>
              {totalPaymentsCount}
            </AppText>
          </View>

          {/* Card 3: SUCCESSFUL */}
          <View style={styles.metricCard}>
            <View style={[styles.metricIconBox, { backgroundColor: '#E8F5EE' }]}>
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
        </ScrollView>
      </View>

      {/* ─── 2. Status Filter Pills ───────────────────────────────────────── */}
      <View style={styles.filterWrapper}>
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

  // ─── Transaction Card Component ─────────────────────────────────────────────
  const renderPaymentCard = ({ item }: { item: Payment }) => {
    const playerName =
      item.player?.full_name || item.player?.email || 'Unknown Member';
    const planOrItemName =
      item.subscription?.plan_name ||
      (item as any).plan_name ||
      (item as any).booking_title ||
      null;

    const displayNote = item.failure_reason || item.notes || null;
    const isFailed = item.status === 'failed';
    const isPending = item.status === 'pending' || item.status === 'processing';
    const isSucceeded = item.status === 'succeeded';
    const isCancelled = item.status === 'cancelled';

    return (
      <TouchableOpacity
        style={styles.paymentCard}
        onPress={() => setSelectedPayment(item)}
        activeOpacity={0.85}
      >
        {/* Row 1: Player Name & Status Badge */}
        <View style={styles.cardHeaderRow}>
          <AppText style={styles.playerName} numberOfLines={2}>
            {playerName}
          </AppText>

          <View
            style={[
              styles.statusBadge,
              isFailed && styles.statusBadgeFailed,
              isPending && styles.statusBadgePending,
              isSucceeded && styles.statusBadgeSucceeded,
              isCancelled && styles.statusBadgeCancelled,
            ]}
          >
            <AppText
              style={[
                styles.statusBadgeText,
                isFailed && styles.statusBadgeTextFailed,
                isPending && styles.statusBadgeTextPending,
                isSucceeded && styles.statusBadgeTextSucceeded,
                isCancelled && styles.statusBadgeTextCancelled,
              ]}
            >
              {item.status.toUpperCase()}
            </AppText>
          </View>
        </View>

        {/* Row 2: Reference ID */}
        <AppText style={styles.referenceText}>{item.reference}</AppText>

        {/* Row 3: Amount & Payment Method Pill */}
        <View style={styles.amountMethodRow}>
          <AppText style={styles.amountText}>
            {formatCurrency(item.amount, item.currency)}
          </AppText>

          <View style={styles.methodBadge}>
            <AppText style={styles.methodBadgeText}>
              {formatMethodLabel(item.payment_method)}
            </AppText>
          </View>
        </View>

        {/* Row 4: Purpose & Associated Plan */}
        <View style={styles.purposePlanRow}>
          <AppText style={styles.purposeText} numberOfLines={1}>
            <AppText style={styles.metaLabelText}>Purpose: </AppText>
            {item.purpose_label || capitalize(item.purpose)}
          </AppText>

          {planOrItemName && (
            <AppText style={styles.planText} numberOfLines={1}>
              <AppText style={styles.metaLabelText}>Plan: </AppText>
              {planOrItemName}
            </AppText>
          )}
        </View>

        {/* Thin Divider */}
        <View style={styles.cardDivider} />

        {/* Row 5: Creation Date */}
        <AppText style={styles.createdDateText}>
          Created: {formatTransactionDate(item.created_at)}
        </AppText>

        {/* Row 6: Note or Failure Reason (Italic) */}
        {displayNote ? (
          <AppText style={styles.noteText} numberOfLines={3}>
            Note: {displayNote}
          </AppText>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <Screen style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ─── Compact Header matching Reference Screenshot ─────────────────── */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + 6 }]}>
        <View style={styles.headerInner}>
          {/* Hamburger Menu on the Left */}
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

          {/* Payments Title & Subtitle beside it */}
          <View style={styles.headerTitleBlock}>
            <AppText style={styles.headerTitle}>Payments</AppText>
            <AppText style={styles.headerSubtitle}>Track revenue and transactions</AppText>
          </View>

          {/* Notification Icon & Profile Avatar on the Right */}
          <View style={styles.headerRightActions}>
            <TouchableOpacity
              style={styles.headerBellBtn}
              onPress={() => router.push('/(club)/notifications' as any)}
              hitSlop={8}
              activeOpacity={0.75}
              accessibilityLabel="View notifications"
              accessibilityRole="button"
            >
              <Bell size={20} color="#1E293B" strokeWidth={2} />
              {(unreadCount ?? 0) > 0 && <View style={styles.notificationDot} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerAvatarBtn}
              onPress={() => router.push('/(club)/profile' as any)}
              activeOpacity={0.8}
              accessibilityLabel="View profile"
              accessibilityRole="button"
            >
              <AppText style={styles.headerAvatarText}>{avatarInitial}</AppText>
            </TouchableOpacity>
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
              paddingBottom: insets.bottom + 95,
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
            {selectedPayment && (
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
                        {formatCurrency(selectedPayment.amount, selectedPayment.currency)}
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
                        ]}
                      >
                        <AppText
                          style={[
                            styles.statusBadgeText,
                            selectedPayment.status === 'succeeded' &&
                              styles.statusBadgeTextSucceeded,
                            selectedPayment.status === 'failed' && styles.statusBadgeTextFailed,
                            (selectedPayment.status === 'pending' ||
                              selectedPayment.status === 'processing') &&
                              styles.statusBadgeTextPending,
                            selectedPayment.status === 'cancelled' &&
                              styles.statusBadgeTextCancelled,
                          ]}
                        >
                          {selectedPayment.status.toUpperCase()}
                        </AppText>
                      </View>
                    </View>

                    <View style={styles.modalGridRow}>
                      <AppText style={styles.modalGridKey}>Payment Method</AppText>
                      <AppText style={styles.modalGridVal}>
                        {formatMethodLabel(selectedPayment.payment_method)}
                      </AppText>
                    </View>

                    <View style={styles.modalGridRow}>
                      <AppText style={styles.modalGridKey}>Purpose</AppText>
                      <AppText style={styles.modalGridVal}>
                        {selectedPayment.purpose_label || capitalize(selectedPayment.purpose)}
                      </AppText>
                    </View>

                    {selectedPayment.subscription?.plan_name && (
                      <View style={styles.modalGridRow}>
                        <AppText style={styles.modalGridKey}>Membership Plan</AppText>
                        <AppText style={styles.modalGridVal}>
                          {selectedPayment.subscription.plan_name}
                        </AppText>
                      </View>
                    )}

                    <View style={styles.modalGridRow}>
                      <AppText style={styles.modalGridKey}>Initiated At</AppText>
                      <AppText style={styles.modalGridVal}>
                        {new Date(selectedPayment.created_at).toLocaleString()}
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

                    {(selectedPayment.failure_reason || selectedPayment.notes) && (
                      <View style={styles.modalNoteSection}>
                        <AppText style={styles.modalNoteLabel}>
                          {selectedPayment.failure_reason ? 'Failure Explanation' : 'Note'}
                        </AppText>
                        <AppText style={styles.modalNoteContent}>
                          {selectedPayment.failure_reason || selectedPayment.notes}
                        </AppText>
                      </View>
                    )}
                  </View>
                </ScrollView>

                {/* Modal Footer Actions: Staff reconciliation when pending */}
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
            )}
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
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerBellBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2ECE7',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  notificationDot: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EF4444',
  },
  headerAvatarBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#065F46',
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

  // ─── 4 Summary Metric Cards ────────────────────────────────────────────────
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
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  metricIconBox: {
    width: 30,
    height: 30,
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
    marginTop: 8,
  },
  metricValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },

  // ─── Status Filter Pills ───────────────────────────────────────────────────
  filterWrapper: {
    width: '100%',
  },
  filterScrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 16,
  },
  filterPill: {
    height: 34,
    paddingHorizontal: 16,
    borderRadius: 17,
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
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // ─── Transaction Cards ─────────────────────────────────────────────────────
  paymentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5ECE8',
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  playerName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 20,
  },
  referenceText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8A9894',
    marginTop: 2,
  },

  // Amount & Method Row
  amountMethodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  amountText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  methodBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  methodBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.2,
  },

  // Purpose & Plan Row
  purposePlanRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    flexWrap: 'wrap',
    gap: 6,
  },
  purposeText: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '500',
  },
  planText: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '500',
  },
  metaLabelText: {
    color: '#64748B',
    fontWeight: '400',
  },

  // Divider
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },

  // Date & Note
  createdDateText: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  noteText: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
    lineHeight: 16,
    marginTop: 3,
  },

  // ─── Status Badges ─────────────────────────────────────────────────────────
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
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

  // ─── Modal Sheet ───────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    maxHeight: '85%',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5ECE8',
    backgroundColor: '#FAFDFB',
  },
  modalHeaderTitleGroup: {
    gap: 2,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalRefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalRefText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#64748B',
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
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  modalDetailsGrid: {
    gap: 10,
    paddingBottom: 8,
  },
  modalGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  modalGridKey: {
    fontSize: 13,
    color: '#64748B',
  },
  modalGridVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  modalAmountVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#15803D',
  },
  modalNoteSection: {
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#E2ECE7',
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    gap: 4,
  },
  modalNoteLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  modalNoteContent: {
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 17,
  },
  modalFooter: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E5ECE8',
    backgroundColor: '#FAFDFB',
  },
  modalPendingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalCancelPaymentBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2ECE7',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  modalCancelPaymentBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#64748B',
  },
  modalConfirmPaidBtn: {
    flex: 1.6,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#176B57',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modalConfirmPaidBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
