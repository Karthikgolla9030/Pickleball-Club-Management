/**
 * Aught2 Pickleball — Player Payment History Screen
 *
 * Matches visual reference design:
 *   - Header: Payments with hamburger menu
 *   - Screen heading: "My Payments" with description
 *   - Filters: Dedicated Filters button with active count badge, "Clear All" action,
 *     and small removable chips below for active filters
 *   - Clean bottom sheet filter modal for selecting Service Type and Payment Status
 *   - Payment Summary: Single compact card with Total, Successful, and Pending counts
 *   - Transaction Cards: 3 separated rows:
 *       Row 1: Service icon container + service title + club name (left) | status badge (right)
 *       Row 2: Transaction amount (left) | payment method pill (right)
 *       Row 3: Transaction reference (left) | transaction date (right)
 *   - Read-only receipt modal with clean details without raw JSON
 *   - Fixed bottom navigation preserved with proper scroll clearance
 */

import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Crown,
  FileText,
  Filter,
  Layers,
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
  Button,
  EmptyState,
  LoadingState,
  Screen,
} from '@/components';
import { usePlayerPayments } from '@/hooks';
import { Colors, Radius, Shadows, Spacing } from '@/theme';
import { formatCurrency } from '@/utils';
import { formatPaymentFailureReason } from '@/utils/paymentFormatters';
import type { PaymentPurpose, PaymentStatus, PlayerPayment } from '@/types';

// ─── Filter Types & Constants ────────────────────────────────────────────────

type StatusFilterTab = 'all' | 'succeeded' | 'pending' | 'failed' | 'refunded';

const STATUS_OPTIONS: { key: StatusFilterTab; label: string }[] = [
  { key: 'all', label: 'All Status' },
  { key: 'succeeded', label: 'Successful' },
  { key: 'pending', label: 'Pending' },
  { key: 'failed', label: 'Failed' },
  { key: 'refunded', label: 'Refunded' },
];

type CategoryFilterTab =
  | 'all'
  | 'membership'
  | 'court_booking'
  | 'tournament'
  | 'league'
  | 'event'
  | 'lesson';

const SERVICE_OPTIONS: { key: CategoryFilterTab; label: string }[] = [
  { key: 'all', label: 'All Services' },
  { key: 'membership', label: 'Memberships' },
  { key: 'court_booking', label: 'Court Bookings' },
  { key: 'tournament', label: 'Tournament Registrations' },
  { key: 'league', label: 'League Registrations' },
  { key: 'event', label: 'Events' },
  { key: 'lesson', label: 'Lessons & Coaching' },
];

interface FilterChip {
  id: 'category' | 'status';
  label: string;
}

// ─── Category Visual Details Helper ──────────────────────────────────────────

function getCategoryConfig(purpose: PaymentPurpose | string) {
  switch (purpose) {
    case 'court_booking':
      return { label: 'Court Booking', color: '#0369A1', bg: '#E0F2FE', Icon: LayoutGrid };
    case 'tournament':
      return { label: 'Tournament Registration', color: '#7C3AED', bg: '#EDE9FE', Icon: Trophy };
    case 'league':
      return { label: 'League Registration', color: '#0D9488', bg: '#CCFBF1', Icon: Users };
    case 'event':
      return { label: 'Event Registration', color: '#BE185D', bg: '#FCE7F3', Icon: Calendar };
    case 'lesson':
      return { label: 'Lessons & Coaching', color: '#D97706', bg: '#FEF3C7', Icon: UserCheck };
    case 'membership':
    default:
      return { label: 'Membership', color: '#B45309', bg: '#FEF3C7', Icon: Crown };
  }
}

// ─── Status Badge Variant Helper ─────────────────────────────────────────────

function getStatusBadgeConfig(status: PaymentStatus | string) {
  switch (status) {
    case 'succeeded':
      return { label: 'Successful', color: '#15803D', bg: '#DCFCE7' };
    case 'pending':
    case 'processing':
      return { label: 'Pending', color: '#B45309', bg: '#FEF3C7' };
    case 'refunded':
    case 'partially_refunded':
      return { label: 'Refunded', color: '#6D28D9', bg: '#EDE9FE' };
    case 'failed':
      return { label: 'Failed', color: '#B91C1C', bg: '#FEE2E2' };
    case 'cancelled':
    default:
      return { label: 'Cancelled', color: '#64748B', bg: '#F1F5F9' };
  }
}

// ─── Date Formatter (matches e.g. "31 Oct 2026") ─────────────────────────────

function formatShortDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = d.getDate();
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const month = months[d.getMonth()] || '';
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return dateStr || '—';
  }
}

// ─── Payment Method Label Formatter ──────────────────────────────────────────

function formatMethodDisplay(method?: string | null): string {
  if (!method) return 'Online';
  const clean = method.replace(/[_-]/g, ' ').toLowerCase();
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Service Title Helper ────────────────────────────────────────────────────

function getServiceTitle(payment: PlayerPayment): string {
  // If clean activity title is available, use it
  if (
    payment.activity_title &&
    !payment.activity_title.includes('[META]') &&
    !payment.activity_title.startsWith('{')
  ) {
    return payment.activity_title;
  }
  // If clean service name is available, use it
  if (
    payment.service_name &&
    !payment.service_name.includes('[META]') &&
    !payment.service_name.startsWith('{')
  ) {
    return payment.service_name;
  }
  if (payment.purpose_label) {
    return payment.purpose_label;
  }
  return getCategoryConfig(payment.purpose).label;
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

  const serviceTitle = getServiceTitle(payment);
  const clubName = payment.club_name || 'Club';

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <View style={styles.card}>
        {/* Row 1: Service Details */}
        <View style={styles.cardRow1}>
          <View style={styles.serviceLeft}>
            <View style={[styles.serviceIconBox, { backgroundColor: cat.bg }]}>
              <CategoryIcon size={18} color={cat.color} strokeWidth={2.2} />
            </View>
            <View style={styles.serviceTextCol}>
              <AppText style={styles.serviceTitle} numberOfLines={1}>
                {serviceTitle}
              </AppText>
              <AppText style={styles.clubName} numberOfLines={1}>
                {clubName}
              </AppText>
            </View>
          </View>

          <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
            <AppText style={[styles.statusBadgeText, { color: statusCfg.color }]}>
              {statusCfg.label}
            </AppText>
          </View>
        </View>

        {/* Divider 1 */}
        <View style={styles.rowDivider} />

        {/* Row 2: Amount and Payment Method */}
        <View style={styles.cardRow2}>
          <View style={styles.amountCol}>
            <AppText style={styles.amountText}>
              {formatCurrency(payment.amount, payment.currency || 'USD')}
            </AppText>
            {isRefunded && hasRefundAmount && (
              <View style={styles.refundTag}>
                <RotateCcw size={11} color="#6D28D9" />
                <AppText style={styles.refundTagText}>
                  Refunded: {formatCurrency(Number(payment.refunded_amount), payment.currency || 'USD')}
                </AppText>
              </View>
            )}
          </View>

          <View style={styles.methodBadge}>
            <CreditCard size={13} color="#64748B" strokeWidth={1.8} />
            <AppText style={styles.methodBadgeText}>
              {formatMethodDisplay(payment.payment_method_label || payment.payment_method)}
            </AppText>
          </View>
        </View>

        {/* Divider 2 */}
        <View style={styles.rowDivider} />

        {/* Row 3: Reference & Date */}
        <View style={styles.cardRow3}>
          <AppText style={styles.referenceText} numberOfLines={1} ellipsizeMode="middle">
            {payment.reference}
          </AppText>
          <AppText style={styles.dateText}>
            {formatShortDate(payment.paid_at || payment.created_at)}
          </AppText>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Player Payments Screen ─────────────────────────────────────────────

export default function PlayerPaymentsScreen() {
  const insets = useSafeAreaInsets();

  // Initial filter state matching reference design: All Services + Pending
  const [statusFilter, setStatusFilter] = useState<StatusFilterTab>('pending');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterTab>('all');
  const [activeChips, setActiveChips] = useState<FilterChip[]>([
    { id: 'category', label: 'All Services' },
    { id: 'status', label: 'Pending' },
  ]);

  // Bottom Sheet Filter Modal State
  const [isFilterSheetVisible, setIsFilterSheetVisible] = useState(false);
  const [draftCategory, setDraftCategory] = useState<CategoryFilterTab>('all');
  const [draftStatus, setDraftStatus] = useState<StatusFilterTab>('pending');

  // Selected payment for read-only receipt view
  const [selectedPayment, setSelectedPayment] = useState<PlayerPayment | null>(null);

  // Fetch caller's real payment history across all clubs
  const {
    data: allPayments = [],
    isLoading,
    isRefetching,
    refetch,
  } = usePlayerPayments();

  // Filter payments by active category and status filters
  const filteredPayments = useMemo(() => {
    return allPayments.filter((p) => {
      // 1. Status Filter
      if (statusFilter === 'pending') {
        if (p.status !== 'pending' && p.status !== 'processing') return false;
      } else if (statusFilter === 'succeeded') {
        if (p.status !== 'succeeded') return false;
      } else if (statusFilter === 'failed') {
        if (p.status !== 'failed' && p.status !== 'cancelled') return false;
      } else if (statusFilter === 'refunded') {
        if (p.status !== 'refunded' && p.status !== 'partially_refunded') return false;
      }

      // 2. Category Filter
      if (categoryFilter !== 'all') {
        if (p.purpose !== categoryFilter) return false;
      }

      return true;
    });
  }, [allPayments, statusFilter, categoryFilter]);

  // Summary counts computed from filtered transactions
  const summaryCounts = useMemo(() => {
    let total = filteredPayments.length;
    let successful = 0;
    let pending = 0;

    for (const p of filteredPayments) {
      if (p.status === 'succeeded') {
        successful += 1;
      } else if (p.status === 'pending' || p.status === 'processing') {
        pending += 1;
      }
    }

    return { total, successful, pending };
  }, [filteredPayments]);

  const activeFilterCount = activeChips.length;

  // Filter Bottom Sheet Handlers
  const handleOpenFilters = () => {
    setDraftCategory(categoryFilter);
    setDraftStatus(statusFilter);
    setIsFilterSheetVisible(true);
  };

  const handleApplyFilters = () => {
    setCategoryFilter(draftCategory);
    setStatusFilter(draftStatus);

    const newChips: FilterChip[] = [];
    const catOpt = SERVICE_OPTIONS.find((o) => o.key === draftCategory);
    if (catOpt) {
      newChips.push({ id: 'category', label: catOpt.label });
    }
    const statOpt = STATUS_OPTIONS.find((o) => o.key === draftStatus);
    if (statOpt) {
      newChips.push({ id: 'status', label: statOpt.label });
    }

    setActiveChips(newChips);
    setIsFilterSheetVisible(false);
  };

  const handleClearAll = () => {
    setCategoryFilter('all');
    setStatusFilter('all');
    setDraftCategory('all');
    setDraftStatus('all');
    setActiveChips([]);
    setIsFilterSheetVisible(false);
  };

  const handleRemoveChip = (id: 'category' | 'status') => {
    if (id === 'category') {
      setCategoryFilter('all');
      setActiveChips((prev) => prev.filter((c) => c.id !== 'category'));
    } else if (id === 'status') {
      setStatusFilter('all');
      setActiveChips((prev) => prev.filter((c) => c.id !== 'status'));
    }
  };

  // Header Component for FlatList
  const renderListHeader = () => (
    <View style={styles.listHeader}>
      {/* 2. My Payments Heading */}
      <View style={styles.titleBlock}>
        <AppText style={styles.mainHeading}>My Payments</AppText>
        <AppText style={styles.subHeading}>
          View your financial transactions across memberships, bookings, tournaments, and events.
        </AppText>
      </View>

      {/* 3. Filters Row */}
      <View style={styles.filtersContainer}>
        <View style={styles.filtersTopRow}>
          <TouchableOpacity
            style={styles.filtersPillBtn}
            onPress={handleOpenFilters}
            activeOpacity={0.8}
            accessibilityLabel="Filter payments"
            accessibilityRole="button"
          >
            <Filter size={15} color="#0D5C46" strokeWidth={2} />
            <AppText style={styles.filtersPillText}>Filters</AppText>
            {activeFilterCount > 0 && (
              <View style={styles.filtersCountBadge}>
                <AppText style={styles.filtersCountText}>{activeFilterCount}</AppText>
              </View>
            )}
          </TouchableOpacity>

          {activeFilterCount > 0 && (
            <TouchableOpacity
              onPress={handleClearAll}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
              accessibilityLabel="Clear all filters"
              accessibilityRole="button"
            >
              <AppText style={styles.clearAllBtnText}>Clear All</AppText>
            </TouchableOpacity>
          )}
        </View>

        {/* Active Filter Chips */}
        {activeChips.length > 0 && (
          <View style={styles.activeChipsWrap}>
            {activeChips.map((chip) => (
              <TouchableOpacity
                key={chip.id}
                style={styles.activeChipPill}
                onPress={() => handleRemoveChip(chip.id)}
                activeOpacity={0.7}
                accessibilityLabel={`Remove filter ${chip.label}`}
                accessibilityRole="button"
              >
                <AppText style={styles.activeChipText}>{chip.label}</AppText>
                <X size={13} color="#065F46" strokeWidth={2.4} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* 4. Payment Summary Card */}
      <View style={styles.summaryCard}>
        {/* Total */}
        <View style={styles.summaryColumn}>
          <View style={styles.summaryLabelRow}>
            <Layers size={16} color="#15803D" strokeWidth={2} />
            <AppText style={styles.summaryLabel}>Total</AppText>
          </View>
          <AppText style={styles.summaryValue}>{summaryCounts.total}</AppText>
        </View>

        <View style={styles.summaryDivider} />

        {/* Successful */}
        <View style={styles.summaryColumn}>
          <View style={styles.summaryLabelRow}>
            <CheckCircle2 size={16} color="#15803D" strokeWidth={2} />
            <AppText style={styles.summaryLabel}>Successful</AppText>
          </View>
          <AppText style={styles.summaryValue}>{summaryCounts.successful}</AppText>
        </View>

        <View style={styles.summaryDivider} />

        {/* Pending */}
        <View style={styles.summaryColumn}>
          <View style={styles.summaryLabelRow}>
            <Clock size={16} color="#D97706" strokeWidth={2} />
            <AppText style={styles.summaryLabel}>Pending</AppText>
          </View>
          <AppText style={styles.summaryValue}>{summaryCounts.pending}</AppText>
        </View>
      </View>
    </View>
  );

  return (
    <Screen style={styles.container}>
      {/* 1. Header */}
      <AppHeader title="Payments" borderless />

      {/* Payment List with Integrated Header */}
      {isLoading ? (
        <View style={styles.centerLoading}>
          <LoadingState message="Loading your payments..." />
        </View>
      ) : (
        <FlatList
          data={filteredPayments}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderListHeader}
          renderItem={({ item }) => (
            <PlayerPaymentCard
              payment={item}
              onPress={() => setSelectedPayment(item)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <EmptyState
                title="No Payments Found"
                description={
                  allPayments.length === 0
                    ? 'You have not made any payments yet. Book a court, join a tournament, or subscribe to a membership to get started.'
                    : 'No payment records match the selected category and status filters.'
                }
              />
              {activeFilterCount > 0 && (
                <Button
                  label="Clear Filters"
                  variant="secondary"
                  onPress={handleClearAll}
                  style={styles.emptyClearBtn}
                />
              )}
            </View>
          }
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 48 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.brand.primary}
            />
          }
        />
      )}

      {/* ─── Filter Bottom Sheet Modal ──────────────────────── */}
      <Modal
        visible={isFilterSheetVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsFilterSheetVisible(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={styles.sheetBackdrop}
            onPress={() => setIsFilterSheetVisible(false)}
          />
          <View
            style={[
              styles.sheetContainer,
              { paddingBottom: Math.max(insets.bottom, 20) },
            ]}
          >
            {/* Sheet Handle */}
            <View style={styles.sheetHandle} />

            {/* Sheet Header */}
            <View style={styles.sheetHeader}>
              <AppText style={styles.sheetTitle}>Filters</AppText>
              <TouchableOpacity
                onPress={() => setIsFilterSheetVisible(false)}
                style={styles.sheetCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetScroll}>
              {/* Section: Service Type */}
              <AppText style={styles.sheetSectionTitle}>Service Type</AppText>
              <View style={styles.sheetPillGrid}>
                {SERVICE_OPTIONS.map((opt) => {
                  const isSelected = draftCategory === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.sheetFilterPill,
                        isSelected && styles.sheetFilterPillActive,
                      ]}
                      onPress={() => setDraftCategory(opt.key)}
                      activeOpacity={0.7}
                    >
                      <AppText
                        style={[
                          styles.sheetFilterPillText,
                          isSelected && styles.sheetFilterPillTextActive,
                        ]}
                      >
                        {opt.label}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Section: Payment Status */}
              <AppText style={[styles.sheetSectionTitle, { marginTop: 20 }]}>
                Payment Status
              </AppText>
              <View style={styles.sheetPillGrid}>
                {STATUS_OPTIONS.map((opt) => {
                  const isSelected = draftStatus === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.sheetFilterPill,
                        isSelected && styles.sheetFilterPillActive,
                      ]}
                      onPress={() => setDraftStatus(opt.key)}
                      activeOpacity={0.7}
                    >
                      <AppText
                        style={[
                          styles.sheetFilterPillText,
                          isSelected && styles.sheetFilterPillTextActive,
                        ]}
                      >
                        {opt.label}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Sheet Action Buttons */}
            <View style={styles.sheetActionsRow}>
              <TouchableOpacity
                style={styles.sheetClearActionBtn}
                onPress={handleClearAll}
                activeOpacity={0.7}
              >
                <AppText style={styles.sheetClearActionText}>Clear All</AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetApplyActionBtn}
                onPress={handleApplyFilters}
                activeOpacity={0.8}
              >
                <AppText style={styles.sheetApplyActionText}>Apply Filters</AppText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── 6. Read-Only Payment Receipt Modal ──────────────── */}
      <Modal visible={!!selectedPayment} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleBlock}>
                <FileText size={18} color={Colors.brand.primary} />
                <AppText variant="heading3" style={styles.modalTitle}>
                  Payment Receipt
                </AppText>
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
                    {formatCurrency(selectedPayment.amount, selectedPayment.currency || 'USD')}
                  </AppText>
                  {selectedPayment.status === 'refunded' &&
                    selectedPayment.refunded_amount != null && (
                      <View style={styles.refundBannerTag}>
                        <RotateCcw size={13} color="#6D28D9" />
                        <AppText style={styles.refundBannerText}>
                          Refunded:{' '}
                          {formatCurrency(
                            Number(selectedPayment.refunded_amount),
                            selectedPayment.currency || 'USD'
                          )}
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
                        <View style={[styles.categoryReceiptBadge, { backgroundColor: cat.bg }]}>
                          <CatIcon size={12} color={cat.color} />
                          <AppText style={[styles.categoryReceiptText, { color: cat.color }]}>
                            {cat.label}
                          </AppText>
                        </View>
                      );
                    })()}
                  </View>

                  {/* Service Name */}
                  {selectedPayment.service_name &&
                    !selectedPayment.service_name.includes('[META]') &&
                    !selectedPayment.service_name.startsWith('{') && (
                      <View style={styles.receiptRow}>
                        <AppText style={styles.receiptLabel}>Service / Item</AppText>
                        <AppText style={styles.receiptValue}>
                          {selectedPayment.service_name}
                        </AppText>
                      </View>
                    )}

                  {/* Payment Method */}
                  <View style={styles.receiptRow}>
                    <AppText style={styles.receiptLabel}>Payment Method</AppText>
                    <AppText style={styles.receiptValue}>
                      {formatMethodDisplay(
                        selectedPayment.payment_method_label || selectedPayment.payment_method
                      )}
                    </AppText>
                  </View>

                  {/* Date Created */}
                  <View style={styles.receiptRow}>
                    <AppText style={styles.receiptLabel}>Transaction Date</AppText>
                    <AppText style={styles.receiptValue}>
                      {new Date(selectedPayment.created_at).toLocaleDateString('en-US', {
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
                        {new Date(selectedPayment.paid_at).toLocaleDateString('en-US', {
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
                  {(selectedPayment.status === 'refunded' ||
                    selectedPayment.status === 'partially_refunded') && (
                    <View style={styles.refundInfoSection}>
                      <AppText style={styles.refundSectionTitle}>Refund Information</AppText>
                      {selectedPayment.refunded_amount != null && (
                        <View style={styles.receiptRow}>
                          <AppText style={styles.receiptLabel}>Refunded Amount</AppText>
                          <AppText style={[styles.receiptValue, { color: '#6D28D9', fontWeight: '700' }]}>
                            {formatCurrency(
                              Number(selectedPayment.refunded_amount),
                              selectedPayment.currency || 'USD'
                            )}
                          </AppText>
                        </View>
                      )}
                      {selectedPayment.refunded_at && (
                        <View style={styles.receiptRow}>
                          <AppText style={styles.receiptLabel}>Refund Date</AppText>
                          <AppText style={styles.receiptValue}>
                            {new Date(selectedPayment.refunded_at).toLocaleDateString('en-US', {
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
                          <AppText style={styles.receiptValue}>
                            {selectedPayment.refund_reason}
                          </AppText>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Failure Reason */}
                  {selectedPayment.failure_reason && (
                    <View style={styles.receiptRow}>
                      <AppText style={styles.receiptLabel}>Failure Reason</AppText>
                      <AppText style={[styles.receiptValue, { color: '#B91C1C' }]}>
                        {formatPaymentFailureReason(selectedPayment.failure_reason)}
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
    backgroundColor: '#F4F8F5',
  },
  listContent: {
    paddingHorizontal: 16,
  },
  listHeader: {
    paddingTop: 12,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // 2. My Payments Heading
  titleBlock: {
    marginBottom: 16,
  },
  mainHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#102B2A',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  subHeading: {
    fontSize: 13,
    lineHeight: 18,
    color: '#667776',
  },

  // 3. Filters
  filtersContainer: {
    marginBottom: 16,
  },
  filtersTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filtersPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  filtersPillText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0D5C46',
  },
  filtersCountBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#0D5C46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filtersCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  clearAllBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0D5C46',
  },
  activeChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  activeChipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 12,
    paddingVertical: 5.5,
    borderRadius: 16,
  },
  activeChipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#065F46',
  },

  // 4. Payment Summary Card
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    ...Shadows.sm,
  },
  summaryColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#64748B',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#102B2A',
  },
  summaryDivider: {
    width: 1,
    height: 34,
    backgroundColor: '#F1F5F9',
  },

  // 5. Transaction Cards
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    padding: 16,
    marginBottom: 12,
    ...Shadows.sm,
  },
  cardRow1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  serviceIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceTextCol: {
    flex: 1,
  },
  serviceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102B2A',
  },
  clubName: {
    fontSize: 12,
    color: '#667776',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  rowDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },
  cardRow2: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountCol: {
    flex: 1,
  },
  amountText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#102B2A',
  },
  refundTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  refundTagText: {
    fontSize: 11,
    color: '#6D28D9',
    fontWeight: '600',
  },
  methodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 6,
  },
  methodBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  cardRow3: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  referenceText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    flexShrink: 1,
    marginRight: 10,
  },
  dateText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },

  // Filter Bottom Sheet Styles
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(16, 43, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '85%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF4F1',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#102B2A',
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetScroll: {
    paddingVertical: 14,
  },
  sheetSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102B2A',
    marginBottom: 10,
  },
  sheetPillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sheetFilterPill: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sheetFilterPillActive: {
    backgroundColor: '#E5F6EC',
    borderColor: '#176B57',
    borderWidth: 1.5,
  },
  sheetFilterPillText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#475569',
  },
  sheetFilterPillTextActive: {
    color: '#176B57',
    fontWeight: '700',
  },
  sheetActionsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#EEF4F1',
  },
  sheetClearActionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  sheetClearActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  sheetApplyActionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#176B57',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetApplyActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Empty state container
  emptyContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyClearBtn: {
    marginTop: 16,
    minWidth: 140,
  },

  // Receipt Modal Styles
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
  categoryReceiptBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  categoryReceiptText: {
    fontSize: 11,
    fontWeight: '600',
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
