/**
 * Aught2 Pickleball — Player Payment History Screen (Phase 13)
 *
 * Player-facing read-only payment history screen:
 *   - Status filter tabs: All, Successful, Pending, Failed
 *   - Cards with Reference, Amount, Currency, Purpose, Status, Date, Payment Method
 *   - Detail modal for full read-only payment receipt view
 *   - Strictly displays only caller's own payments
 */

import React, { useState } from 'react';
import {
  FlatList,
  Modal,
  RefreshControl,
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
  LoadingState,
  Screen,
  ScreenHeader,
  AppHeader,
} from '@/components';
import { usePlayerPayments } from '@/hooks';
import { Colors, Radius, Spacing } from '@/theme';
import type { PaymentStatus, PlayerPayment } from '@/types';

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

// ─── Player Payment Card ──────────────────────────────────────────────────────

function PlayerPaymentCard({
  payment,
  onPress,
}: {
  payment: PlayerPayment;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress}>
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <AppText style={styles.referenceText}>{payment.reference}</AppText>
            {payment.club_name && (
              <AppText style={styles.clubName}>{payment.club_name}</AppText>
            )}
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

        <View style={styles.footerRow}>
          <AppText style={styles.purposeText}>
            Purpose: {payment.purpose_label || payment.purpose}
          </AppText>
          <AppText style={styles.dateText}>
            {new Date(payment.paid_at || payment.created_at).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </AppText>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

// ─── Main Player Payments Screen ─────────────────────────────────────────────

export default function PlayerPaymentsScreen() {
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'all'>('all');
  const [selectedPayment, setSelectedPayment] = useState<PlayerPayment | null>(null);

  const {
    data: payments = [],
    isLoading,
    isRefetching,
    refetch,
  } = usePlayerPayments(
    statusFilter !== 'all' ? { status: statusFilter } : undefined
  );

  return (
    <Screen style={styles.container}>
      <AppHeader title="Payments" />
      {/* ─── Header ────────────────────────────────────────── */}
      <ScreenHeader
        title="My Payments"
        subtitle="View your payment history and transaction receipts."
      />

      {/* ─── Status Filter Chips ─────────────────────────────── */}
      <View style={{ marginBottom: Spacing[2] }}>
        <FilterChips
          chips={[
            { key: 'all', label: 'All' },
            { key: 'succeeded', label: 'Succeeded' },
            { key: 'pending', label: 'Pending' },
            { key: 'failed', label: 'Failed' },
          ]}
          activeChip={statusFilter}
          onChipPress={(st) => setStatusFilter(st as any)}
        />
      </View>

      {/* ─── Payment List ───────────────────────────────────── */}
      {isLoading ? (
        <LoadingState message="Loading your payments..." />
      ) : payments.length === 0 ? (
        <EmptyState
          title="No Payments"
          description={
            statusFilter === 'all'
              ? 'You have no payment records yet.'
              : `No payments with status "${statusFilter}".`
          }
        />
      ) : (
        <FlatList
          data={payments}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PlayerPaymentCard
              payment={item}
              onPress={() => setSelectedPayment(item)}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
        />
      )}

      {/* ─── Read-Only Payment Receipt Modal ─────────────────── */}
      <Modal visible={!!selectedPayment} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <AppText variant="heading3" style={styles.modalTitle}>Payment Receipt</AppText>

            {selectedPayment && (
              <View style={styles.receiptBody}>
                <View style={styles.receiptRow}>
                  <AppText style={styles.receiptLabel}>Reference</AppText>
                  <AppText style={styles.receiptValueMono}>{selectedPayment.reference}</AppText>
                </View>

                {selectedPayment.club_name && (
                  <View style={styles.receiptRow}>
                    <AppText style={styles.receiptLabel}>Club</AppText>
                    <AppText style={styles.receiptValue}>{selectedPayment.club_name}</AppText>
                  </View>
                )}

                <View style={styles.receiptRow}>
                  <AppText style={styles.receiptLabel}>Amount</AppText>
                  <AppText style={[styles.receiptValue, styles.amountHighlight]}>
                    {selectedPayment.currency === 'INR' ? '₹' : selectedPayment.currency + ' '}
                    {Number(selectedPayment.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </AppText>
                </View>

                <View style={styles.receiptRow}>
                  <AppText style={styles.receiptLabel}>Status</AppText>
                  <Badge
                    label={selectedPayment.status_label || selectedPayment.status}
                    variant={getStatusBadgeVariant(selectedPayment.status)}
                  />
                </View>

                <View style={styles.receiptRow}>
                  <AppText style={styles.receiptLabel}>Purpose</AppText>
                  <AppText style={styles.receiptValue}>
                    {selectedPayment.purpose_label || selectedPayment.purpose}
                  </AppText>
                </View>

                <View style={styles.receiptRow}>
                  <AppText style={styles.receiptLabel}>Payment Method</AppText>
                  <AppText style={styles.receiptValue}>
                    {selectedPayment.payment_method_label || selectedPayment.payment_method}
                  </AppText>
                </View>

                <View style={styles.receiptRow}>
                  <AppText style={styles.receiptLabel}>Date</AppText>
                  <AppText style={styles.receiptValue}>
                    {new Date(selectedPayment.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </AppText>
                </View>

                {selectedPayment.paid_at && (
                  <View style={styles.receiptRow}>
                    <AppText style={styles.receiptLabel}>Paid Date</AppText>
                    <AppText style={[styles.receiptValue, { color: Colors.status.success }]}>
                      {new Date(selectedPayment.paid_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </AppText>
                  </View>
                )}
              </View>
            )}

            <Button
              label="Close"
              variant="secondary"
              onPress={() => setSelectedPayment(null)}
              style={styles.closeBtn}
            />
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
    backgroundColor: Colors.background.primary,
  },
  header: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[2],
  },
  screenTitle: {
    color: Colors.text.primary,
  },
  screenSubtitle: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginTop: Spacing[0.5],
  },
  filterRow: {
    paddingVertical: Spacing[2],
  },
  filterScroll: {
    paddingHorizontal: Spacing[4],
    gap: Spacing[2],
  },
  filterTab: {
    paddingHorizontal: Spacing[3.5],
    paddingVertical: Spacing[1.5],
    borderRadius: Radius.full,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  filterTabActive: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  filterTabText: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  filterTabTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[8],
    gap: Spacing[3],
  },
  card: {
    padding: Spacing[4],
    backgroundColor: Colors.surface.default,
    gap: Spacing[2],
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  referenceText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
    fontFamily: 'monospace',
  },
  clubName: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: Spacing[0.5],
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing[1],
  },
  amountText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.surface.border,
    paddingTop: Spacing[2],
  },
  purposeText: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  dateText: {
    fontSize: 11,
    color: Colors.text.tertiary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[4],
  },
  modalCard: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.lg,
    padding: Spacing[5],
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    color: Colors.text.primary,
    marginBottom: Spacing[4],
    textAlign: 'center',
  },
  receiptBody: {
    gap: Spacing[3],
    marginBottom: Spacing[5],
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptLabel: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  receiptValue: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text.primary,
  },
  receiptValueMono: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: Colors.text.primary,
  },
  amountHighlight: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.brand.primary,
  },
  closeBtn: {
    marginTop: Spacing[2],
  },
});
