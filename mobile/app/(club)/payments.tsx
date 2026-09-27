/**
 * Aught2 Pickleball — Club Payments Management Screen (Phase 13)
 *
 * Staff screen for managing club payments:
 *   - Overview metric cards: Total collected, Total payments, Succeeded, Pending, Failed
 *   - Filterable list by status chips
 *   - Payment card with player info, reference, amount, method, date, status
 *   - Direct "Mark as Paid" action for pending payments with confirmation
 *   - "Record Payment" modal: player selection, subscription selection, amount, method, notes
 *
 * Authorization:
 *   - Requires manage_payments permission (owner & manager)
 *   - Tournament directors are blocked with a clear message
 *   - Backend enforces all permissions
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  FilterChips,
  Input,
  LoadingState,
  ModalSheet,
  Screen,
  ScreenHeader,
  AppHeader,
} from '@/components';
import {
  useActiveClub,
  useClubPayments,
  useClubPlayerMembers,
  useClubSubscriptions,
  useCreatePayment,
  usePaymentSummary,
  usePermission,
  useSucceedPayment,
} from '@/hooks';
import { Colors, Layout, Radius, Spacing, Typography } from '@/theme';
import type {
  Payment,
  PaymentMethod,
  PaymentStatus,
} from '@/types';

// ─── Status Badge Helper ──────────────────────────────────────────────────────

function getStatusBadgeVariant(status: PaymentStatus): 'success' | 'warning' | 'error' | 'info' | 'default' {
  switch (status) {
    case 'succeeded':
      return 'success';
    case 'pending':
      return 'warning';
    case 'processing':
      return 'info';
    case 'failed':
      return 'error';
    case 'cancelled':
    default:
      return 'default';
  }
}

// ─── Payment Card ─────────────────────────────────────────────────────────────

function PaymentCard({
  payment,
  onMarkPaid,
  isMarkingPaid,
}: {
  payment: Payment;
  onMarkPaid: (payment: Payment) => void;
  isMarkingPaid: boolean;
}) {
  const isPending = payment.status === 'pending';

  return (
    <Card style={styles.paymentCard}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleGroup}>
          <AppText style={styles.playerName}>
            {payment.player?.full_name || payment.player?.email || 'Unknown Player'}
          </AppText>
          <AppText style={styles.referenceText}>{payment.reference}</AppText>
        </View>
        <Badge
          label={payment.status_label || payment.status}
          variant={getStatusBadgeVariant(payment.status)}
        />
      </View>

      <View style={styles.amountRow}>
        <AppText style={styles.amountText}>
          {payment.currency === 'INR' ? '₹' : payment.currency + ' '}
          {Number(payment.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </AppText>
        <Badge
          label={payment.payment_method_label || payment.payment_method}
          variant="default"
          size="sm"
        />
      </View>

      <View style={styles.metaRow}>
        <AppText style={styles.metaText}>
          Purpose: {payment.purpose_label || payment.purpose}
        </AppText>
        {payment.subscription?.plan_name && (
          <AppText style={styles.metaText}>
            Plan: {payment.subscription.plan_name}
          </AppText>
        )}
      </View>

      <View style={styles.dateRow}>
        <AppText style={styles.dateText}>
          Created: {new Date(payment.created_at).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </AppText>
        {payment.paid_at && (
          <AppText style={styles.paidDateText}>
            Paid: {new Date(payment.paid_at).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </AppText>
        )}
      </View>

      {payment.notes && (
        <AppText style={styles.notesText} numberOfLines={2}>
          Note: {payment.notes}
        </AppText>
      )}

      {isPending && (
        <View style={styles.cardActions}>
          <Button
            label="Mark as Paid"
            variant="secondary"
            size="sm"
            fullWidth={false}
            loading={isMarkingPaid}
            onPress={() => onMarkPaid(payment)}
          />
        </View>
      )}
    </Card>
  );
}

// ─── Main Payments Screen ────────────────────────────────────────────────────

export default function ClubPaymentsScreen() {
  const { clubId: activeClubId } = useActiveClub();
  const { canManagePayments } = usePermission();
  const clubId = activeClubId ?? '';

  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'all'>('all');
  const [modalVisible, setModalVisible] = useState(false);

  // Form state
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [selectedSubId, setSelectedSubId] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Queries
  const {
    data: summary,
    refetch: refetchSummary,
  } = usePaymentSummary(clubId);

  const {
    data: payments = [],
    isLoading: isPaymentsLoading,
    isRefetching,
    refetch: refetchPayments,
  } = useClubPayments(
    clubId,
    statusFilter !== 'all' ? { status: statusFilter } : undefined
  );

  const { data: playerMembers = [] } = useClubPlayerMembers(clubId);
  const { data: allSubscriptions = [] } = useClubSubscriptions(clubId);

  // Mutations
  const createPaymentMutation = useCreatePayment(clubId);
  const succeedPaymentMutation = useSucceedPayment(clubId);

  // Filtered subscriptions for chosen player
  const playerSubscriptions = useMemo(() => {
    if (!selectedPlayerId) return [];
    return allSubscriptions.filter(
      (sub) => sub.player?.user_id === selectedPlayerId
    );
  }, [allSubscriptions, selectedPlayerId]);

  // Handle Mark Paid
  const handleMarkPaid = (payment: Payment) => {
    Alert.alert(
      'Mark as Paid',
      `Mark payment ${payment.reference} (${payment.currency} ${payment.amount}) as paid?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await succeedPaymentMutation.mutateAsync(payment.id);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to mark payment as paid';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
  };

  // Open modal
  const handleOpenModal = () => {
    setSelectedPlayerId(playerMembers[0]?.user_id ?? '');
    setSelectedSubId('');
    setAmountStr('');
    setPaymentMethod('cash');
    setNotes('');
    setFormError(null);
    setModalVisible(true);
  };

  // Submit payment creation
  const handleCreatePayment = async () => {
    setFormError(null);
    if (!selectedPlayerId) {
      setFormError('Please select a player');
      return;
    }
    if (!selectedSubId) {
      setFormError('Please select a subscription');
      return;
    }
    const num = parseFloat(amountStr);
    if (isNaN(num) || num <= 0) {
      setFormError('Please enter a valid amount greater than 0');
      return;
    }

    try {
      await createPaymentMutation.mutateAsync({
        player_id: selectedPlayerId,
        subscription_id: selectedSubId,
        amount: num,
        currency: 'INR',
        payment_method: paymentMethod,
        purpose: 'membership',
        notes: notes.trim() || null,
      });
      setModalVisible(false);
      refetchSummary();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record payment';
      setFormError(msg);
    }
  };

  const onRefresh = () => {
    refetchSummary();
    refetchPayments();
  };

  // Guard: require manage_payments
  if (!canManagePayments) {
    return (
      <Screen style={styles.container}>
        <AppHeader title="Payments" subtitle="Track revenue and transactions" />
        <EmptyState
          title="Access Restricted"
          description="You do not have permission to manage payments for this club."
        />
      </Screen>
    );
  }

  return (
    <Screen style={styles.container}>
      <AppHeader
        title="Payments"
        subtitle="Track revenue and transactions"
        borderless
        rightElement={
          <Button
            label="+ Record"
            size="sm"
            fullWidth={false}
            onPress={handleOpenModal}
          />
        }
      />

      {/* ─── Metric Summary Cards ───────────────────────────── */}
      <View style={styles.metricsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricsScroll}>
          <Card style={styles.metricCard}>
            <AppText style={styles.metricLabel}>Total Collected</AppText>
            <AppText style={[styles.metricValue, { color: Colors.status.success }]}>
              ₹{Number(summary?.total_amount_collected ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </AppText>
          </Card>

          <Card style={styles.metricCard}>
            <AppText style={styles.metricLabel}>Total Payments</AppText>
            <AppText style={styles.metricValue}>{summary?.total_count ?? 0}</AppText>
          </Card>

          <Card style={styles.metricCard}>
            <AppText style={styles.metricLabel}>Successful</AppText>
            <AppText style={[styles.metricValue, { color: Colors.status.success }]}>
              {summary?.succeeded_count ?? 0}
            </AppText>
          </Card>

          <Card style={styles.metricCard}>
            <AppText style={styles.metricLabel}>Pending</AppText>
            <AppText style={[styles.metricValue, { color: Colors.status.warning }]}>
              {summary?.pending_count ?? 0}
            </AppText>
          </Card>

          <Card style={styles.metricCard}>
            <AppText style={styles.metricLabel}>Failed</AppText>
            <AppText style={[styles.metricValue, { color: Colors.status.error }]}>
              {summary?.failed_count ?? 0}
            </AppText>
          </Card>
        </ScrollView>
      </View>

      {/* ─── Status Filter Chips ────────────────────────────── */}
      <FilterChips<PaymentStatus | 'all'>
        chips={[
          { key: 'all', label: 'All' },
          { key: 'succeeded', label: 'Succeeded' },
          { key: 'pending', label: 'Pending' },
          { key: 'failed', label: 'Failed' },
          { key: 'cancelled', label: 'Cancelled' },
        ]}
        activeChip={statusFilter}
        onChipPress={setStatusFilter}
      />

      {/* ─── Payments List ──────────────────────────────────── */}
      {isPaymentsLoading ? (
        <LoadingState message="Loading payments..." />
      ) : payments.length === 0 ? (
        <EmptyState
          title="No Payments Found"
          description={
            statusFilter === 'all'
              ? 'No payment records found for this club.'
              : `No payments with status "${statusFilter}".`
          }
        />
      ) : (
        <FlatList
          data={payments}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PaymentCard
              payment={item}
              onMarkPaid={handleMarkPaid}
              isMarkingPaid={succeedPaymentMutation.isPending}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />
          }
        />
      )}

      {/* ─── Record Payment Modal ────────────────────────────── */}
      <ModalSheet
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Record Payment"
        subtitle="Create a manual payment record for a member subscription."
        actions={[
          {
            label: 'Cancel',
            variant: 'secondary',
            onPress: () => setModalVisible(false),
          },
          {
            label: 'Create Payment',
            variant: 'primary',
            onPress: handleCreatePayment,
            loading: createPaymentMutation.isPending,
          },
        ]}
      >
        <View style={styles.modalBody}>
          {formError && (
            <View style={styles.errorBanner}>
              <AppText style={styles.errorBannerText}>{formError}</AppText>
            </View>
          )}

          {/* Player Selector */}
          <AppText style={styles.fieldLabel}>Select Player</AppText>
          <FilterChips
            chips={playerMembers.map((pm) => ({
              key: pm.user_id,
              label: pm.user_full_name || pm.user_email,
            }))}
            activeChip={selectedPlayerId}
            onChipPress={(id) => {
              setSelectedPlayerId(id);
              setSelectedSubId('');
            }}
          />

          {/* Subscription Selector */}
          <AppText style={styles.fieldLabel}>Select Subscription</AppText>
          {playerSubscriptions.length === 0 ? (
            <AppText style={styles.emptyFieldText}>
              {selectedPlayerId
                ? 'No subscriptions found for this player'
                : 'Select a player first'}
            </AppText>
          ) : (
            <View style={styles.subList}>
              {playerSubscriptions.map((sub) => {
                const isSelected = selectedSubId === sub.id;
                return (
                  <TouchableOpacity
                    key={sub.id}
                    style={[styles.subOption, isSelected && styles.subOptionActive]}
                    onPress={() => {
                      setSelectedSubId(sub.id);
                      if (sub.plan_price && !amountStr) {
                        setAmountStr(String(sub.plan_price));
                      }
                    }}
                  >
                    <AppText style={[styles.subOptionName, isSelected && styles.subOptionNameActive]}>
                      {sub.plan_name} ({sub.status_label})
                    </AppText>
                    <AppText style={styles.subOptionDates}>
                      {sub.start_date} → {sub.end_date}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Amount */}
          <Input
            label="Amount (₹)"
            placeholder="e.g. 999"
            keyboardType="numeric"
            value={amountStr}
            onChangeText={setAmountStr}
          />

          {/* Payment Method */}
          <AppText style={styles.fieldLabel}>Payment Method</AppText>
          <View style={styles.methodRow}>
            {(['cash', 'bank_transfer', 'online', 'other'] as const).map((method) => {
              const isSelected = paymentMethod === method;
              return (
                <TouchableOpacity
                  key={method}
                  style={[styles.methodButton, isSelected && styles.methodButtonActive]}
                  onPress={() => setPaymentMethod(method)}
                >
                  <AppText style={[styles.methodButtonText, isSelected && styles.methodButtonTextActive]}>
                    {method === 'bank_transfer' ? 'Bank' : method.charAt(0).toUpperCase() + method.slice(1)}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Notes */}
          <Input
            label="Notes (Optional)"
            placeholder="e.g. Cash received at reception"
            value={notes}
            onChangeText={setNotes}
          />
        </View>
      </ModalSheet>
    </Screen>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  metricsContainer: {
    paddingVertical: Spacing[2],
  },
  metricsScroll: {
    paddingHorizontal: Spacing[4],
    gap: Spacing[3],
  },
  metricCard: {
    padding: Spacing[3],
    minWidth: 120,
    backgroundColor: Colors.surface.default,
  },
  metricLabel: {
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing[1],
  },
  metricValue: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  filterChipsContent: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
  },
  listContent: {
    paddingHorizontal: Layout.screenHorizontal,
    paddingBottom: Layout.bottomScrollPadding,
    gap: Layout.cardGap,
  },
  paymentCard: {
    padding: Spacing[4],
    backgroundColor: Colors.surface.default,
    gap: Spacing[2],
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitleGroup: {
    flex: 1,
    flexShrink: 1,
    gap: Spacing[0.5],
  },
  playerName: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
    lineHeight: 22,
  },
  referenceText: {
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
    fontFamily: 'monospace',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing[1],
  },
  amountText: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaText: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: Colors.surface.border,
    paddingTop: Spacing[2],
  },
  dateText: {
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
  },
  paidDateText: {
    fontSize: Typography.size.xs,
    color: Colors.status.success,
    fontWeight: Typography.weight.medium,
  },
  notesText: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
    fontStyle: 'italic',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: Spacing[2],
  },
  modalBody: {
    gap: Spacing[3],
    paddingBottom: Spacing[4],
  },
  errorBanner: {
    backgroundColor: Colors.status.errorBg,
    padding: Spacing[3],
    borderRadius: Radius.md,
    marginBottom: Spacing[1],
  },
  errorBannerText: {
    color: Colors.status.error,
    fontSize: 13,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Spacing[2],
    marginBottom: Spacing[1],
  },
  emptyFieldText: {
    fontSize: 13,
    color: Colors.text.tertiary,
    fontStyle: 'italic',
  },
  selectorScroll: {
    flexDirection: 'row',
    marginBottom: Spacing[1],
  },
  selectorChip: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.elevated,
    marginRight: Spacing[2],
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  selectorChipActive: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  selectorChipText: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  selectorChipTextActive: {
    color: Colors.white,
    fontWeight: '600',
  },
  subList: {
    gap: Spacing[2],
    marginBottom: Spacing[1],
  },
  subOption: {
    padding: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  subOptionActive: {
    borderColor: Colors.brand.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  subOptionName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  subOptionNameActive: {
    color: Colors.brand.primary,
  },
  subOptionDates: {
    fontSize: 12,
    color: Colors.text.tertiary,
    marginTop: Spacing[0.5],
  },
  methodRow: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  methodButton: {
    flex: 1,
    paddingVertical: Spacing[2],
    alignItems: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  methodButtonActive: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  methodButtonText: {
    fontSize: 12,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  methodButtonTextActive: {
    color: Colors.white,
    fontWeight: '600',
  },
});
