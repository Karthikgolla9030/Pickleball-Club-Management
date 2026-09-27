/**
 * Aught2 Pickleball — Player Membership Screen
 *
 * Reproduces the visual design, layout, spacing, colors, typography, cards, icons,
 * and navigation shown in the reference image (left screen):
 *   - Pale mint background (#F8FAF9)
 *   - Compact mobile header with hamburger menu icon and "My Membership" title
 *   - Subtitle: "View your active subscription and benefits"
 *   - Active Membership Card:
 *     - "● Active" green status badge
 *     - "Manage Plan >" top-right action
 *     - Plan Name (e.g. "Basic Monthly")
 *     - Billing description ("Monthly plan")
 *     - Large price (e.g. "₹999.00 / month")
 *     - Start Date and Expires Date columns with calendar icons & vertical divider
 *   - Your Benefits Card:
 *     - Pale mint circular icon backgrounds with green line icons
 *     - Benefit title, supporting description, and right chevron
 *     - Light divider between rows
 *   - Booking Privileges Card:
 *     - Two side-by-side metrics (Max active bookings, Advance booking)
 *     - Pale mint circular icon backgrounds, dark green numbers, vertical divider
 *   - Live connection to authenticated player's real subscription data
 */

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Award,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Crown,
  HelpCircle,
  Info,
  Menu,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react-native';

import { AppText, ModalSheet } from '@/components';
import { useActiveClub, usePlayerMembership } from '@/hooks';
import { useDrawerStore } from '@/navigation';
import { Colors } from '@/theme';
import type { PlayerMembershipView, SubscriptionStatus } from '@/types';

// ─── Status Palette ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  SubscriptionStatus,
  { label: string; dotColor: string; textColor: string; bgColor: string }
> = {
  active: {
    label: 'Active',
    dotColor: '#16A34A',
    textColor: '#15803D',
    bgColor: '#E8F5E9',
  },
  scheduled: {
    label: 'Scheduled',
    dotColor: '#2563EB',
    textColor: '#1D4ED8',
    bgColor: '#EFF6FF',
  },
  expired: {
    label: 'Expired',
    dotColor: '#D97706',
    textColor: '#B45309',
    bgColor: '#FEF3C7',
  },
  cancelled: {
    label: 'Cancelled',
    dotColor: '#DC2626',
    textColor: '#B91C1C',
    bgColor: '#FEE2E2',
  },
};

// ─── Benefit Metadata Map ────────────────────────────────────────────────────

const BENEFIT_MAP: Record<string, { subtitle: string; icon: any }> = {
  'court booking access': {
    subtitle: 'Book courts at your convenience',
    icon: Calendar,
  },
  'member-only events': {
    subtitle: 'Access exclusive events and tournaments',
    icon: Users,
  },
  'priority access': {
    subtitle: 'Get early access to new programs',
    icon: Crown,
  },
  'advance booking': {
    subtitle: 'Book courts up to 14 days in advance',
    icon: Clock,
  },
  'discounted guest fees': {
    subtitle: 'Bring friends at member-exclusive rates',
    icon: Sparkles,
  },
};

function getBenefitInfo(benefitStr: string, index: number) {
  const lower = benefitStr.toLowerCase().trim();
  for (const [key, val] of Object.entries(BENEFIT_MAP)) {
    if (lower.includes(key)) {
      return {
        title: benefitStr,
        subtitle: val.subtitle,
        icon: val.icon,
      };
    }
  }

  // Fallback defaults
  const icons = [Calendar, Users, Crown, Award, CheckCircle2];
  return {
    title: benefitStr,
    subtitle: 'Included with your club membership plan',
    icon: icons[index % icons.length],
  };
}

function formatMembershipDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function PlayerMembershipScreen() {
  const insets = useSafeAreaInsets();
  const openDrawer = useDrawerStore((s) => s.openDrawer);
  const { clubId, clubName } = useActiveClub();

  const [manageModalVisible, setManageModalVisible] = useState(false);
  const [selectedBenefit, setSelectedBenefit] = useState<{
    title: string;
    subtitle: string;
  } | null>(null);

  const {
    data: membership,
    isLoading,
    isRefetching,
    isError,
    error,
    refetch,
  } = usePlayerMembership(clubId || '');

  const isNoMembership = isError && (error as any)?.status === 404;

  const statusConfig = useMemo(() => {
    if (!membership) return STATUS_CONFIG.active;
    const effective = membership.effective_status || membership.status;
    return STATUS_CONFIG[effective] || STATUS_CONFIG.active;
  }, [membership]);

  const startDateFormatted = useMemo(() => {
    return formatMembershipDate(membership?.start_date);
  }, [membership?.start_date]);

  const endDateFormatted = useMemo(() => {
    return formatMembershipDate(membership?.end_date);
  }, [membership?.end_date]);

  const benefitsList = useMemo(() => {
    if (!membership?.benefits || membership.benefits.length === 0) {
      return [
        'Court booking access',
        'Member-only events',
        'Priority access',
      ];
    }
    return membership.benefits;
  }, [membership?.benefits]);

  return (
    <View style={styles.container}>
      {/* ─── Top Header ─── */}
      <View style={[styles.headerRow, { paddingTop: Math.max(insets.top, 14) + 6 }]}>
        <Pressable
          onPress={openDrawer}
          style={styles.menuButton}
          hitSlop={8}
          accessibilityLabel="Open menu"
          accessibilityRole="button"
        >
          <Menu size={24} color="#0F2922" strokeWidth={2.2} />
        </Pressable>
        <AppText style={styles.headerTitle}>My Membership</AppText>
      </View>

      <AppText style={styles.headerSubtitle}>
        View your active subscription and benefits
      </AppText>

      {/* ─── Scroll Content ─── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            colors={['#114D3F']}
            tintColor="#114D3F"
          />
        }
      >
        {isLoading && !isRefetching ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#114D3F" />
            <AppText style={styles.loadingText}>Loading membership details...</AppText>
          </View>
        ) : isNoMembership || !membership ? (
          /* Empty State */
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <ShieldCheck size={32} color="#114D3F" strokeWidth={1.8} />
            </View>
            <AppText style={styles.emptyTitle}>No Active Membership</AppText>
            <AppText style={styles.emptyDescription}>
              You do not currently have an active membership subscription at{' '}
              {clubName || 'this club'}. Contact club staff to enroll in a plan and unlock
              exclusive court privileges.
            </AppText>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => refetch()}
              activeOpacity={0.85}
            >
              <AppText style={styles.emptyButtonText}>Refresh Status</AppText>
            </TouchableOpacity>
          </View>
        ) : isError ? (
          /* Error State */
          <View style={styles.emptyCard}>
            <View style={[styles.emptyIconCircle, { backgroundColor: '#FEE2E2' }]}>
              <HelpCircle size={32} color="#DC2626" strokeWidth={1.8} />
            </View>
            <AppText style={styles.emptyTitle}>Unable to Load Membership</AppText>
            <AppText style={styles.emptyDescription}>
              We encountered an issue fetching your membership details. Please pull down to
              refresh or try again later.
            </AppText>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => refetch()}
              activeOpacity={0.85}
            >
              <AppText style={styles.emptyButtonText}>Try Again</AppText>
            </TouchableOpacity>
          </View>
        ) : (
          /* ─── Real Membership Content ─── */
          <>
            {/* Card 1: Active Membership Card */}
            <View style={styles.membershipCard}>
              {/* Top Row: Status Badge & Manage Plan */}
              <View style={styles.cardTopRow}>
                <View
                  style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}
                >
                  <View
                    style={[styles.statusDot, { backgroundColor: statusConfig.dotColor }]}
                  />
                  <AppText
                    style={[styles.statusBadgeText, { color: statusConfig.textColor }]}
                  >
                    {statusConfig.label}
                  </AppText>
                </View>

                <TouchableOpacity
                  style={styles.managePlanButton}
                  onPress={() => setManageModalVisible(true)}
                  activeOpacity={0.7}
                  accessibilityLabel="Manage Plan"
                >
                  <AppText style={styles.managePlanText}>Manage Plan</AppText>
                  <ChevronRight size={15} color="#0F2922" strokeWidth={2.2} />
                </TouchableOpacity>
              </View>

              {/* Plan Name */}
              <AppText style={styles.planName}>{membership.plan_name}</AppText>

              {/* Billing Description */}
              <AppText style={styles.planDescription}>
                {membership.plan_description ||
                  `${membership.duration_label || 'Monthly'} plan`}
              </AppText>

              {/* Price */}
              <View style={styles.priceRow}>
                <AppText style={styles.priceAmount}>
                  ₹{parseFloat(membership.price).toFixed(2)}
                </AppText>
                <AppText style={styles.priceInterval}>
                  {' '}
                  / {(membership.duration_label || 'month').toLowerCase()}
                </AppText>
              </View>

              {/* Subtle Horizontal Divider */}
              <View style={styles.horizontalDivider} />

              {/* Dates: Start Date and Expiry Date */}
              <View style={styles.datesRow}>
                {/* Left: Start Date */}
                <View style={styles.dateCol}>
                  <View style={styles.dateLabelRow}>
                    <Calendar size={15} color="#718279" strokeWidth={1.8} />
                    <AppText style={styles.dateLabel}>Start Date</AppText>
                  </View>
                  <AppText style={styles.dateValue}>{startDateFormatted}</AppText>
                </View>

                {/* Vertical Divider */}
                <View style={styles.dateVerticalDivider} />

                {/* Right: Expiry Date */}
                <View style={[styles.dateCol, styles.dateColRight]}>
                  <View style={styles.dateLabelRow}>
                    <Calendar size={15} color="#718279" strokeWidth={1.8} />
                    <AppText style={styles.dateLabel}>
                      {membership.effective_status === 'expired' ? 'Expired' : 'Expires'}
                    </AppText>
                  </View>
                  <AppText style={styles.dateValue}>{endDateFormatted}</AppText>
                </View>
              </View>
            </View>

            {/* Card 2: Your Benefits */}
            <View style={styles.sectionCard}>
              <AppText style={styles.sectionCardTitle}>Your Benefits</AppText>

              {benefitsList.map((benefit, idx) => {
                const info = getBenefitInfo(benefit, idx);
                const BenefitIcon = info.icon;
                const isLast = idx === benefitsList.length - 1;

                return (
                  <View key={`benefit-${idx}`}>
                    <TouchableOpacity
                      style={styles.benefitRow}
                      activeOpacity={0.7}
                      onPress={() => setSelectedBenefit(info)}
                    >
                      <View style={styles.iconCircle}>
                        <BenefitIcon size={20} color="#114D3F" strokeWidth={1.8} />
                      </View>

                      <View style={styles.benefitTextCol}>
                        <AppText style={styles.benefitTitle}>{info.title}</AppText>
                        <AppText style={styles.benefitSubtitle}>
                          {info.subtitle}
                        </AppText>
                      </View>

                      <ChevronRight size={18} color="#718279" strokeWidth={1.8} />
                    </TouchableOpacity>

                    {!isLast && <View style={styles.rowDivider} />}
                  </View>
                );
              })}
            </View>

            {/* Card 3: Booking Privileges */}
            <View style={styles.sectionCard}>
              <AppText style={styles.sectionCardTitle}>Booking Privileges</AppText>

              <View style={styles.privilegesRow}>
                {/* Metric 1: Max Active Bookings */}
                <View style={styles.privilegeCol}>
                  <View style={styles.iconCircle}>
                    <Calendar size={20} color="#114D3F" strokeWidth={1.8} />
                  </View>
                  <View style={styles.privilegeTextCol}>
                    <AppText style={styles.privilegeValue}>
                      {membership.booking_limit ?? '∞'}
                    </AppText>
                    <AppText style={styles.privilegeLabel}>
                      Max active bookings
                    </AppText>
                  </View>
                </View>

                {/* Vertical Divider */}
                <View style={styles.privilegeVerticalDivider} />

                {/* Metric 2: Advance Booking */}
                <View style={[styles.privilegeCol, styles.privilegeColRight]}>
                  <View style={styles.iconCircle}>
                    <Clock size={20} color="#114D3F" strokeWidth={1.8} />
                  </View>
                  <View style={styles.privilegeTextCol}>
                    <AppText style={styles.privilegeValue}>
                      {membership.advance_booking_days
                        ? `${membership.advance_booking_days} days`
                        : 'Unlimited'}
                    </AppText>
                    <AppText style={styles.privilegeLabel}>Advance booking</AppText>
                  </View>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* ─── Manage Plan Modal Sheet ─── */}
      <ModalSheet
        visible={manageModalVisible}
        onClose={() => setManageModalVisible(false)}
        title="Manage Subscription"
        subtitle={membership?.plan_name || 'Membership Plan'}
      >
        <View style={styles.modalBody}>
          <View style={styles.modalInfoRow}>
            <AppText style={styles.modalInfoLabel}>Current Plan</AppText>
            <AppText style={styles.modalInfoValue}>
              {membership?.plan_name || 'Basic Monthly'}
            </AppText>
          </View>

          <View style={styles.modalInfoRow}>
            <AppText style={styles.modalInfoLabel}>Status</AppText>
            <AppText
              style={[
                styles.modalInfoValue,
                { color: statusConfig.textColor, fontWeight: '700' },
              ]}
            >
              {statusConfig.label}
            </AppText>
          </View>

          <View style={styles.modalInfoRow}>
            <AppText style={styles.modalInfoLabel}>Billing Rate</AppText>
            <AppText style={styles.modalInfoValue}>
              ₹{membership ? parseFloat(membership.price).toFixed(2) : '999.00'} /{' '}
              {(membership?.duration_label || 'Month').toLowerCase()}
            </AppText>
          </View>

          <View style={styles.modalInfoRow}>
            <AppText style={styles.modalInfoLabel}>Active Window</AppText>
            <AppText style={styles.modalInfoValue}>
              {startDateFormatted} – {endDateFormatted}
            </AppText>
          </View>

          <View style={styles.modalInfoRow}>
            <AppText style={styles.modalInfoLabel}>Auto-Renewal</AppText>
            <AppText style={styles.modalInfoValue}>
              {membership?.auto_renew ? 'Enabled' : 'Manual renewal'}
            </AppText>
          </View>

          <View style={styles.modalNoticeBox}>
            <Info size={16} color="#114D3F" strokeWidth={2} />
            <AppText style={styles.modalNoticeText}>
              To upgrade, downgrade, or update payment preferences for your membership,
              please contact the club front desk or administrator.
            </AppText>
          </View>

          <TouchableOpacity
            style={styles.modalCloseButton}
            onPress={() => setManageModalVisible(false)}
            activeOpacity={0.85}
          >
            <AppText style={styles.modalCloseButtonText}>Done</AppText>
          </TouchableOpacity>
        </View>
      </ModalSheet>

      {/* ─── Benefit Detail Modal ─── */}
      <ModalSheet
        visible={!!selectedBenefit}
        onClose={() => setSelectedBenefit(null)}
        title="Membership Benefit"
        subtitle={selectedBenefit?.title}
      >
        <View style={styles.modalBody}>
          <View style={styles.benefitModalIconContainer}>
            <View style={styles.benefitModalIconCircle}>
              <Sparkles size={28} color="#114D3F" strokeWidth={1.8} />
            </View>
            <AppText style={styles.benefitModalTitle}>{selectedBenefit?.title}</AppText>
            <AppText style={styles.benefitModalSubtitle}>
              {selectedBenefit?.subtitle}
            </AppText>
          </View>

          <View style={styles.modalNoticeBox}>
            <ShieldCheck size={16} color="#114D3F" strokeWidth={2} />
            <AppText style={styles.modalNoticeText}>
              This privilege is active and applied automatically to your account bookings,
              events, and club reservations.
            </AppText>
          </View>

          <TouchableOpacity
            style={styles.modalCloseButton}
            onPress={() => setSelectedBenefit(null)}
            activeOpacity={0.85}
          >
            <AppText style={styles.modalCloseButtonText}>Close</AppText>
          </TouchableOpacity>
        </View>
      </ModalSheet>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  menuButton: {
    padding: 6,
    marginRight: 6,
    marginLeft: -6,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F2922',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#647570',
    paddingHorizontal: 16,
    marginTop: 2,
    marginBottom: 16,
    lineHeight: 19,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 110, // Avoid bottom nav overlap
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#647570',
    fontWeight: '500',
  },

  // ─── Card 1: Active Membership Card ────────────────────────────────────────
  membershipCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8EDEA',
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  managePlanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  managePlanText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F2922',
  },
  planName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F2922',
    letterSpacing: -0.4,
    marginTop: 14,
  },
  planDescription: {
    fontSize: 13,
    color: '#718279',
    marginTop: 3,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 10,
  },
  priceAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F2922',
    letterSpacing: -0.5,
  },
  priceInterval: {
    fontSize: 14,
    color: '#718279',
    fontWeight: '500',
  },
  horizontalDivider: {
    height: 1,
    backgroundColor: '#E8EDEA',
    marginVertical: 16,
  },
  datesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateCol: {
    flex: 1,
  },
  dateColRight: {
    paddingLeft: 18,
  },
  dateLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateLabel: {
    fontSize: 12,
    color: '#718279',
    fontWeight: '500',
  },
  dateValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F2922',
    marginTop: 5,
  },
  dateVerticalDivider: {
    width: 1,
    height: 38,
    backgroundColor: '#E8EDEA',
  },

  // ─── Cards 2 & 3: Section Cards ────────────────────────────────────────────
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8EDEA',
    padding: 18,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F2922',
    marginBottom: 14,
  },

  // Benefits rows
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  benefitTextCol: {
    flex: 1,
    paddingRight: 8,
  },
  benefitTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F2922',
  },
  benefitSubtitle: {
    fontSize: 13,
    color: '#718279',
    marginTop: 2,
    lineHeight: 18,
  },
  rowDivider: {
    height: 1,
    backgroundColor: '#F0F4F2',
    marginVertical: 12,
  },

  // Booking Privileges
  privilegesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  privilegeCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  privilegeColRight: {
    paddingLeft: 10,
  },
  privilegeTextCol: {
    flex: 1,
  },
  privilegeValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F2922',
    letterSpacing: -0.3,
  },
  privilegeLabel: {
    fontSize: 12,
    color: '#718279',
    marginTop: 2,
    lineHeight: 16,
  },
  privilegeVerticalDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E8EDEA',
    marginHorizontal: 8,
  },

  // ─── Empty & Error States ──────────────────────────────────────────────────
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8EDEA',
    padding: 24,
    alignItems: 'center',
    marginTop: 12,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F2922',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 14,
    color: '#718279',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyButton: {
    backgroundColor: '#114D3F',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },

  // ─── Modal Styles ──────────────────────────────────────────────────────────
  modalBody: {
    gap: 12,
    paddingBottom: 16,
  },
  modalInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  modalInfoLabel: {
    fontSize: 14,
    color: '#718279',
  },
  modalInfoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F2922',
  },
  modalNoticeBox: {
    flexDirection: 'row',
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    alignItems: 'flex-start',
    marginTop: 6,
  },
  modalNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#114D3F',
    lineHeight: 17,
  },
  modalCloseButton: {
    backgroundColor: '#114D3F',
    borderRadius: 12,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  modalCloseButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  benefitModalIconContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  benefitModalIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  benefitModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F2922',
    textAlign: 'center',
  },
  benefitModalSubtitle: {
    fontSize: 14,
    color: '#718279',
    textAlign: 'center',
    marginTop: 4,
  },
});
