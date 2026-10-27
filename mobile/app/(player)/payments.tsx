/**
 * Aught2 Pickleball — Player Payment History Screen (Phase 13 & Comprehensive Multi-Service)
 *
 * Player-facing multi-service payment history screen:
 *   - Category filter pills: All Services, Memberships, Court Bookings, Tournaments, Leagues, Events, Lessons
 *   - Status filter pills: All Status, Succeeded, Pending, Failed, Refunded
 *   - Cards with Reference, Service Category Icon & Badge, Service Name, Amount, Status, Date, Payment Method
 *   - Clear display of refund details (refunded amount, refund date, reason)
 *   - Detailed modal for full read-only payment receipt view
 *   - Strictly displays only caller's own payments across all enrolled clubs
 */

import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Crown,
  FileText,
  LayoutGrid,
  RotateCcw,
  Trophy,
  UserCheck,
  Users,
  X,
  XCircle,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  Screen,
  ScreenHeader,
} from '@/components';
import { usePlayerPayments } from '@/hooks';
import { Colors, Radius, Shadows, Spacing } from '@/theme';
import { formatCurrency } from '@/utils';
import type { PaymentPurpose, PaymentStatus, PlayerPayment } from '@/types';

// ─── Filter Types & Constants ────────────────────────────────────────────────

type StatusFilterTab = 'all' | 'succeeded' | 'pending' | 'failed' | 'refunded';

const STATUS_TABS: { key: StatusFilterTab; label: string }[] = [
  { key: 'all', label: 'All Status' },
  { key: 'succeeded', label: 'Succeeded' },
  { key: 'pending', label: 'Pending' },
  { key: 'failed', label: 'Failed' },
  { key: 'refunded', label: 'Refunded' },
];

type CategoryFilterTab = 'all' | 'membership' | 'court_booking' | 'tournament' | 'league' | 'event' | 'lesson';

const CATEGORY_TABS: { key: CategoryFilterTab; label: string }[] = [
  { key: 'all', label: 'All Services' },
  { key: 'membership', label: 'Memberships' },
  { key: 'court_booking', label: 'Court Bookings' },
  { key: 'tournament', label: 'Tournaments' },
  { key: 'league', label: 'Leagues' },
  { key: 'event', label: 'Events' },
  { key: 'lesson', label: 'Lessons' },
];

// ─── Category Visual Details Helper ──────────────────────────────────────────

function getCategoryConfig(purpose: PaymentPurpose | string) {
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
}

// ─── Status Badge Variant Helper ─────────────────────────────────────────────

function getStatusBadgeConfig(status: PaymentStatus) {
  switch (status) {
    case 'succeeded':
      return { label: 'SUCCEEDED', color: '#15803D', bg: '#E8F5EE', Icon: CheckCircle2 };
    case 'pending':
    case 'processing':
      return { label: 'PENDING', color: '#B45309', bg: '#FEF3C7', Icon: Clock };
    case 'refunded':
    case 'partially_refunded':
      return { label: 'REFUNDED', color: '#6D28D9', bg: '#EDE9FE', Icon: RotateCcw };
    case 'failed':
      return { label: 'FAILED', color: '#B91C1C', bg: '#FEE2E2', Icon: XCircle };
    case 'cancelled':
    default:
      return { label: 'CANCELLED', color: '#64748B', bg: '#F1F5F9', Icon: XCircle };
  }
}

// ─── Player Payment Card Component ───────────────────────────────────────────

function PlayerPaymentCard({
  payment,
  onPress,
}: {
  payment: PlayerPayment;
  onPress: () => void;
}) {
  const cat = getCategoryConfig(payment.purpose);
  const CategoryIcon = cat.Icon;
  const statusCfg = getStatusBadgeConfig(payment.status);

  const isRefunded = payment.status === 'refunded' || payment.status === 'partially_refunded';
  const hasRefundAmount = payment.refunded_amount != null && Number(payment.refunded_amount) > 0;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <Card style={styles.card}>
        {/* Top Row: Service Category & Status Badge */}
        <View style={styles.cardHeader}>
          <View style={[styles.categoryBadge, { backgroundColor: cat.bg }]}>
            <CategoryIcon size={13} color={cat.color} strokeWidth={2.2} />
            <AppText style={[styles.categoryBadgeText, { color: cat.color }]}>
              {cat.label}
            </AppText>
          </View>

          <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
            <AppText style={[styles.statusBadgeText, { color: statusCfg.color }]}>
              {statusCfg.label}
            </AppText>
          </View>
        </View>

        {/* Service Title / Club */}
        <View style={styles.serviceTitleRow}>
          <AppText style={styles.serviceNameText} numberOfLines={1}>
            {payment.service_name || payment.purpose_label || cat.label}
          </AppText>
          {payment.club_name ? (
            <AppText style={styles.clubNameText} numberOfLines={1}>
              {payment.club_name}
            </AppText>
          ) : null}
        </View>

        {/* Amount & Payment Method */}
        <View style={styles.amountRow}>
          <View>
            <AppText style={styles.amountText}>
              {formatCurrency(payment.amount, payment.currency)}
            </AppText>
            {isRefunded && hasRefundAmount && (
              <View style={styles.refundedAmountRow}>
                <RotateCcw size={11} color="#6D28D9" />
                <AppText style={styles.refundedAmountText}>
                  Refunded: {formatCurrency(Number(payment.refunded_amount), payment.currency)}
                </AppText>
              </View>
            )}
          </View>
          <View style={styles.methodBadge}>
            <CreditCard size={11} color={Colors.text.secondary} />
            <AppText style={styles.methodBadgeText}>
              {payment.payment_method_label || payment.payment_method.toUpperCase()}
            </AppText>
          </View>
        </View>

        {/* Footer: Reference & Date */}
        <View style={styles.footerRow}>
          <AppText style={styles.referenceText}>{payment.reference}</AppText>
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
  const [statusFilter, setStatusFilter] = useState<StatusFilterTab>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterTab>('all');
  const [selectedPayment, setSelectedPayment] = useState<PlayerPayment | null>(null);

  // Fetch all player payments
  const {
    data: allPayments = [],
    isLoading,
    isRefetching,
    refetch,
  } = usePlayerPayments();

  // Filter payments by Status and Category
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

      return true;
    });
  }, [allPayments, statusFilter, categoryFilter]);

  return (
    <Screen style={styles.container}>
      <AppHeader title="Payments" />

      {/* Screen Title & Subtitle */}
      <ScreenHeader
        title="My Payments"
        subtitle="View your financial transactions across memberships, bookings, tournaments, and events."
      />

      {/* ─── Category Filter Horizontal Scroll ──────────────── */}
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {CATEGORY_TABS.map((tab) => {
            const isActive = categoryFilter === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setCategoryFilter(tab.key)}
                style={[styles.pill, isActive && styles.pillActive]}
                activeOpacity={0.7}
              >
                <AppText style={[styles.pillText, isActive && styles.pillTextActive]}>
                  {tab.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ─── Status Filter Horizontal Scroll ────────────────── */}
      <View style={[styles.filterSection, { paddingBottom: Spacing[2] }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {STATUS_TABS.map((tab) => {
            const isActive = statusFilter === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setStatusFilter(tab.key)}
                style={[styles.statusPill, isActive && styles.statusPillActive]}
                activeOpacity={0.7}
              >
                <AppText style={[styles.statusPillText, isActive && styles.statusPillTextActive]}>
                  {tab.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ─── Payment List ───────────────────────────────────── */}
      {isLoading ? (
        <LoadingState message="Loading your payments..." />
      ) : filteredPayments.length === 0 ? (
        <EmptyState
          title="No Payments Found"
          description={
            allPayments.length === 0
              ? 'You have not made any payments yet. Book a court, join a tournament, or subscribe to a membership to get started.'
              : 'No payment records match the selected category and status filters.'
          }
        />
      ) : (
        <FlatList
          data={filteredPayments}
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
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleBlock}>
                <FileText size={18} color={Colors.brand.primary} />
                <AppText variant="heading3" style={styles.modalTitle}>Payment Receipt</AppText>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedPayment(null)}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={18} color={Colors.text.secondary} />
              </TouchableOpacity>
            </View>

            {selectedPayment && (
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                {/* Highlight Amount Block */}
                <View style={styles.amountBanner}>
                  <AppText style={styles.amountBannerLabel}>AMOUNT CHARGED</AppText>
                  <AppText style={styles.amountBannerValue}>
                    {formatCurrency(selectedPayment.amount, selectedPayment.currency)}
                  </AppText>
                  {selectedPayment.status === 'refunded' && selectedPayment.refunded_amount != null && (
                    <View style={styles.refundBannerTag}>
                      <RotateCcw size={13} color="#6D28D9" />
                      <AppText style={styles.refundBannerText}>
                        Refunded: {formatCurrency(Number(selectedPayment.refunded_amount), selectedPayment.currency)}
                      </AppText>
                    </View>
                  )}
                </View>

                <View style={styles.receiptBody}>
                  {/* Reference */}
                  <View style={styles.receiptRow}>
                    <AppText style={styles.receiptLabel}>Reference ID</AppText>
                    <AppText style={styles.receiptValueMono}>{selectedPayment.reference}</AppText>
                  </View>

                  {/* Club Name */}
                  {selectedPayment.club_name && (
                    <View style={styles.receiptRow}>
                      <AppText style={styles.receiptLabel}>Club</AppText>
                      <AppText style={styles.receiptValue}>{selectedPayment.club_name}</AppText>
                    </View>
                  )}

                  {/* Status */}
                  <View style={styles.receiptRow}>
                    <AppText style={styles.receiptLabel}>Status</AppText>
                    {(() => {
                      const cfg = getStatusBadgeConfig(selectedPayment.status);
                      return (
                        <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                          <AppText style={[styles.statusBadgeText, { color: cfg.color }]}>
                            {cfg.label}
                          </AppText>
                        </View>
                      );
                    })()}
                  </View>

                  {/* Purpose / Category */}
                  <View style={styles.receiptRow}>
                    <AppText style={styles.receiptLabel}>Service Category</AppText>
                    {(() => {
                      const cat = getCategoryConfig(selectedPayment.purpose);
                      const CatIcon = cat.Icon;
                      return (
                        <View style={[styles.categoryBadge, { backgroundColor: cat.bg }]}>
                          <CatIcon size={12} color={cat.color} />
                          <AppText style={[styles.categoryBadgeText, { color: cat.color }]}>
                            {cat.label}
                          </AppText>
                        </View>
                      );
                    })()}
                  </View>

                  {/* Service Name */}
                  {selectedPayment.service_name && (
                    <View style={styles.receiptRow}>
                      <AppText style={styles.receiptLabel}>Service / Item</AppText>
                      <AppText style={styles.receiptValue}>{selectedPayment.service_name}</AppText>
                    </View>
                  )}

                  {/* Payment Method */}
                  <View style={styles.receiptRow}>
                    <AppText style={styles.receiptLabel}>Payment Method</AppText>
                    <AppText style={styles.receiptValue}>
                      {selectedPayment.payment_method_label || selectedPayment.payment_method.toUpperCase()}
                    </AppText>
                  </View>

                  {/* Date Created */}
                  <View style={styles.receiptRow}>
                    <AppText style={styles.receiptLabel}>Transaction Date</AppText>
                    <AppText style={styles.receiptValue}>
                      {new Date(selectedPayment.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </AppText>
                  </View>

                  {/* Paid Date */}
                  {selectedPayment.paid_at && (
                    <View style={styles.receiptRow}>
                      <AppText style={styles.receiptLabel}>Payment Settled</AppText>
                      <AppText style={[styles.receiptValue, { color: '#15803D' }]}>
                        {new Date(selectedPayment.paid_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </AppText>
                    </View>
                  )}

                  {/* Refund Information */}
                  {(selectedPayment.status === 'refunded' || selectedPayment.status === 'partially_refunded') && (
                    <View style={styles.refundInfoSection}>
                      <AppText style={styles.refundSectionTitle}>Refund Information</AppText>
                      {selectedPayment.refunded_amount != null && (
                        <View style={styles.receiptRow}>
                          <AppText style={styles.receiptLabel}>Refunded Amount</AppText>
                          <AppText style={[styles.receiptValue, { color: '#6D28D9', fontWeight: '700' }]}>
                            {formatCurrency(Number(selectedPayment.refunded_amount), selectedPayment.currency)}
                          </AppText>
                        </View>
                      )}
                      {selectedPayment.refunded_at && (
                        <View style={styles.receiptRow}>
                          <AppText style={styles.receiptLabel}>Refund Date</AppText>
                          <AppText style={styles.receiptValue}>
                            {new Date(selectedPayment.refunded_at).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </AppText>
                        </View>
                      )}
                      {selectedPayment.refund_reason && (
                        <View style={styles.receiptRow}>
                          <AppText style={styles.receiptLabel}>Refund Reason</AppText>
                          <AppText style={styles.receiptValue}>{selectedPayment.refund_reason}</AppText>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Failure Reason */}
                  {selectedPayment.failure_reason && (
                    <View style={styles.receiptRow}>
                      <AppText style={styles.receiptLabel}>Failure Reason</AppText>
                      <AppText style={[styles.receiptValue, { color: '#B91C1C' }]}>
                        {selectedPayment.failure_reason}
                      </AppText>
                    </View>
                  )}
                </View>
              </ScrollView>
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
  filterSection: {
    paddingVertical: Spacing[1],
  },
  filterScroll: {
    paddingHorizontal: Spacing[4],
    gap: Spacing[2],
  },
  pill: {
    paddingHorizontal: Spacing[3.5],
    paddingVertical: Spacing[1.5],
    borderRadius: Radius.full,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  pillActive: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.text.secondary,
  },
  pillTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  statusPill: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1],
    borderRadius: Radius.full,
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  statusPillActive: {
    backgroundColor: '#1E293B',
    borderColor: '#1E293B',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.text.tertiary,
  },
  statusPillTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[8],
    gap: Spacing[3],
  },
  card: {
    padding: Spacing[4],
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    gap: Spacing[2],
    ...Shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  serviceTitleRow: {
    marginTop: 2,
  },
  serviceNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  clubNameText: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingVertical: Spacing[1],
  },
  amountText: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  refundedAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  refundedAmountText: {
    fontSize: 11,
    color: '#6D28D9',
    fontWeight: '600',
  },
  methodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface.elevated,
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  methodBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.surface.border,
    paddingTop: Spacing[2],
    marginTop: 2,
  },
  referenceText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: Colors.text.tertiary,
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
    maxWidth: 420,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[3],
  },
  modalHeaderTitleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  modalTitle: {
    color: Colors.text.primary,
  },
  modalCloseBtn: {
    padding: Spacing[1],
  },
  modalScroll: {
    marginVertical: Spacing[1],
  },
  amountBanner: {
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.md,
    padding: Spacing[3.5],
    alignItems: 'center',
    marginBottom: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  amountBannerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.text.tertiary,
    letterSpacing: 0.8,
  },
  amountBannerValue: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.brand.primary,
    marginTop: 4,
  },
  refundBannerTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EDE9FE',
    paddingHorizontal: Spacing[2.5],
    paddingVertical: 3,
    borderRadius: Radius.full,
    marginTop: 6,
  },
  refundBannerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6D28D9',
  },
  receiptBody: {
    gap: Spacing[2.5],
    marginBottom: Spacing[3],
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  receiptLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  receiptValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
    maxWidth: '60%',
    textAlign: 'right',
  },
  receiptValueMono: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: Colors.text.primary,
  },
  refundInfoSection: {
    backgroundColor: '#FAF5FF',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#E9D5FF',
    padding: Spacing[3],
    marginTop: Spacing[2],
    gap: Spacing[2],
  },
  refundSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6D28D9',
    marginBottom: 2,
  },
  closeBtn: {
    marginTop: Spacing[2],
  },
});
