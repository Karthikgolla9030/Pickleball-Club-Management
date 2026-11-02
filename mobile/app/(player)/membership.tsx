/**
 * Aught2 Pickleball — Player Membership Screen
 *
 * Matches visual reference design:
 *   - Pale green background (#F4F8F5)
 *   - AppHeader with circular hamburger menu icon, title: "My Membership",
 *     and subtitle: "View your active subscriptions and privileges across clubs."
 *   - Membership Summary Card:
 *       Row 1 – Club information: Club icon (Building2) + Club name ("Pickleball Club")
 *       Row 2 – Status badges: Membership status (e.g. "• Scheduled", "• Active") and
 *               Payment status (e.g. "💳 Payment Pending", "Paid")
 *       Row 3 – Plan information: Plan name ("Base plan") + short description
 *       Row 4 – Price and Manage Plan: Price ("$103.95 / monthly") on left,
 *               compact outlined "Manage Plan >" button on right
 *       Row 5 – Membership dates: Two equally spaced columns ("Start Date" and "Expires")
 *               with subtle vertical divider
 *   - Your Benefits Card:
 *       Separate white card with title "Your Benefits"
 *       Rows with small green line icons inside subtle light-green circular backgrounds,
 *       benefit title, short description, and small right-facing navigation indicator
 *   - Live connection to authenticated player's real subscription data
 *   - Preserves Manage Plan modal sheet and unified CheckoutModal renewal
 */

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Award,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Crown,
  HelpCircle,
  Info,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react-native';

import { AppHeader, AppText, Badge, Button, CheckoutModal, ModalSheet } from '@/components';
import { useActiveClub, usePlayerClubs, usePlayerMemberships, useRenewPlayerSubscription } from '@/hooks';
import { Colors, Shadows } from '@/theme';
import { formatCurrency } from '@/utils';
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

// ─── Payment Status Configuration Helper ────────────────────────────────────

function getPaymentStatusConfig(paymentStatus?: string | null) {
  if (!paymentStatus) {
    return {
      label: 'Payment Pending',
      textColor: '#B45309',
      bgColor: '#FEF3C7',
      iconColor: '#B45309',
    };
  }

  const clean = paymentStatus.toLowerCase().trim();
  if (clean === 'succeeded' || clean === 'paid' || clean === 'completed') {
    return {
      label: 'Paid',
      textColor: '#15803D',
      bgColor: '#E8F5E9',
      iconColor: '#15803D',
    };
  }
  if (clean === 'failed') {
    return {
      label: 'Payment Failed',
      textColor: '#B91C1C',
      bgColor: '#FEE2E2',
      iconColor: '#B91C1C',
    };
  }
  if (clean === 'refunded' || clean === 'partially_refunded') {
    return {
      label: 'Refunded',
      textColor: '#6D28D9',
      bgColor: '#EDE9FE',
      iconColor: '#6D28D9',
    };
  }

  // Pending / processing / default
  return {
    label: 'Payment Pending',
    textColor: '#B45309',
    bgColor: '#FEF3C7',
    iconColor: '#B45309',
  };
}

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
    return dateStr;
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function PlayerMembershipScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { clubId, clubName } = useActiveClub();

  const [manageModalVisible, setManageModalVisible] = useState(false);
  const [selectedBenefit, setSelectedBenefit] = useState<{
    title: string;
    subtitle: string;
  } | null>(null);

  const {
    data: memberships = [],
    isLoading,
    isRefetching,
    isError,
    refetch,
  } = usePlayerMemberships();

  const { clubs: enrolledClubs = [] } = usePlayerClubs();

  const { isPending: isRenewing } = useRenewPlayerSubscription();

  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [checkoutMembership, setCheckoutMembership] = useState<PlayerMembershipView | null>(null);

  const activeSubscription = useMemo(() => {
    if (!memberships || memberships.length === 0) return null;
    if (selectedSubId) {
      const found = memberships.find((m) => (m.id || m.subscription_id) === selectedSubId);
      if (found) return found;
    }
    // Prefer matching the active club if present
    if (clubId) {
      const match = memberships.find((m) => m.club_id === clubId);
      if (match) return match;
    }
    return memberships[0];
  }, [memberships, selectedSubId, clubId]);

  const statusConfig = useMemo(() => {
    if (!activeSubscription) return STATUS_CONFIG.scheduled;
    const effective = activeSubscription.effective_status || activeSubscription.status;
    return STATUS_CONFIG[effective] || STATUS_CONFIG.scheduled;
  }, [activeSubscription]);

  const paymentStatusConfig = useMemo(() => {
    return getPaymentStatusConfig(activeSubscription?.payment_status);
  }, [activeSubscription?.payment_status]);

  const startDateFormatted = useMemo(() => {
    return formatMembershipDate(activeSubscription?.start_date || '2026-10-27');
  }, [activeSubscription?.start_date]);

  const endDateFormatted = useMemo(() => {
    return formatMembershipDate(activeSubscription?.end_date || '2026-11-26');
  }, [activeSubscription?.end_date]);

  const benefitsList = useMemo(() => {
    const defaultBenefits = [
      {
        title: 'Court booking access',
        subtitle: 'Book courts at your convenience',
        icon: Calendar,
        actionRoute: '/(player)/book-court-club',
      },
      {
        title: 'Member-only events',
        subtitle: 'Access exclusive events and tournaments',
        icon: Users,
        actionRoute: '/(player)/events',
      },
      {
        title: `${activeSubscription?.booking_limit ?? 3} upcoming bookings`,
        subtitle: 'Included with your club membership',
        icon: Crown,
        actionRoute: '/(player)/bookings',
      },
    ];

    if (!activeSubscription?.benefits || activeSubscription.benefits.length === 0) {
      return defaultBenefits;
    }

    const customItems = activeSubscription.benefits.map((b, idx) => {
      const info = getBenefitInfo(b, idx);
      let route: string | undefined;
      const lower = b.toLowerCase();
      if (lower.includes('court') || lower.includes('booking')) {
        route = '/(player)/book-court-club';
      } else if (lower.includes('event') || lower.includes('tournament')) {
        route = '/(player)/events';
      }
      return {
        title: info.title,
        subtitle: info.subtitle,
        icon: info.icon,
        actionRoute: route,
      };
    });

    const hasBookingPrivilege = customItems.some((i) =>
      i.title.toLowerCase().includes('upcoming')
    );
    if (!hasBookingPrivilege) {
      customItems.push({
        title: `${activeSubscription?.booking_limit ?? 3} upcoming bookings`,
        subtitle: 'Included with your club membership',
        icon: Crown,
        actionRoute: '/(player)/bookings',
      });
    }

    return customItems;
  }, [activeSubscription]);

  const handleRenew = (sub: PlayerMembershipView) => {
    setCheckoutMembership(sub);
  };

  return (
    <View style={styles.container}>
      {/* ─── 1. Top Header ─── */}
      <AppHeader
        title="My Membership"
        subtitle="View your active subscriptions and privileges across clubs."
        showMenu
        borderless
      />

      {/* Multi-Club Tabs if player belongs to multiple clubs */}
      {memberships.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.clubSelectorRow}
          contentContainerStyle={styles.clubSelectorContent}
        >
          {memberships.map((sub) => {
            const subId = sub.id || sub.subscription_id;
            const activeId = activeSubscription?.id || activeSubscription?.subscription_id;
            const isSelected = subId === activeId;
            return (
              <TouchableOpacity
                key={subId}
                style={[styles.clubTabPill, isSelected && styles.clubTabPillActive]}
                onPress={() => setSelectedSubId(subId)}
                activeOpacity={0.8}
              >
                <Building2 size={13} color={isSelected ? '#114D3F' : '#667776'} />
                <AppText
                  style={isSelected ? styles.clubTabPillTextActive : styles.clubTabPillText}
                >
                  {sub.club_name || 'Club'}
                </AppText>
                <Badge
                  label={sub.effective_status || sub.status}
                  size="sm"
                  variant={sub.effective_status === 'active' ? 'success' : 'default'}
                />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {/* ─── Scroll Content ─── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 48 },
        ]}
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
        ) : !activeSubscription ? (
          enrolledClubs.length > 0 ? (
            /* Free Member Clubs View */
            <View style={{ gap: 14 }}>
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconCircle}>
                  <ShieldCheck size={32} color="#114D3F" strokeWidth={1.8} />
                </View>
                <AppText style={styles.emptyTitle}>Free Club Membership</AppText>
                <AppText style={styles.emptyDescription}>
                  You have joined {enrolledClubs.length} club(s) as a Free Member. You can purchase an official membership plan at any time to unlock included court reservations and exclusive discounts.
                </AppText>
              </View>

              <AppText style={styles.sectionSubtitle}>
                Your Joined Clubs
              </AppText>

              {enrolledClubs.map((club) => (
                <View
                  key={club.club_id}
                  style={styles.joinedClubCard}
                >
                  <View style={styles.joinedClubHeader}>
                    <View style={styles.joinedClubInfo}>
                      <AppText style={styles.joinedClubTitle}>
                        {club.club_name}
                      </AppText>
                      {club.city && (
                        <AppText style={styles.joinedClubCity}>
                          {[club.city, club.state].filter(Boolean).join(', ')}
                        </AppText>
                      )}
                    </View>
                    <View style={styles.freeMemberBadge}>
                      <AppText style={styles.freeMemberBadgeText}>
                        FREE MEMBER
                      </AppText>
                    </View>
                  </View>

                  <View style={styles.joinedClubFooter}>
                    <AppText style={styles.joinedClubDate}>
                      Member since {formatMembershipDate(club.joined_at)}
                    </AppText>
                    <TouchableOpacity
                      style={styles.exploreBtn}
                      onPress={() =>
                        router.push({
                          pathname: '/(player)/club-details',
                          params: { id: club.club_id },
                        } as any)
                      }
                      activeOpacity={0.88}
                    >
                      <AppText style={styles.exploreBtnText}>
                        Explore Memberships
                      </AppText>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            /* Completely Empty State */
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconCircle}>
                <ShieldCheck size={32} color="#114D3F" strokeWidth={1.8} />
              </View>
              <AppText style={styles.emptyTitle}>No Active Memberships</AppText>
              <AppText style={styles.emptyDescription}>
                You do not currently belong to any clubs. Discover clubs or join for free or through a membership plan.
              </AppText>
              <View style={styles.emptyActionsRow}>
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => router.push('/(player)/explore-clubs' as any)}
                  activeOpacity={0.85}
                >
                  <AppText style={styles.emptyButtonText}>Explore Clubs</AppText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.emptyButton, styles.emptyOutlineButton]}
                  onPress={() => router.push('/(player)/clubs' as any)}
                  activeOpacity={0.85}
                >
                  <AppText style={styles.emptyOutlineButtonText}>My Clubs</AppText>
                </TouchableOpacity>
              </View>
            </View>
          )
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
            {/* ─── 2. Membership Summary Card ─── */}
            <View style={styles.membershipCard}>
              {/* First row – Club information */}
              <View style={styles.clubRow}>
                <Building2 size={16} color="#104E3E" strokeWidth={2} />
                <AppText style={styles.clubName}>
                  {activeSubscription.club_name || clubName || 'Pickleball Club'}
                </AppText>
              </View>

              {/* Second row – Membership & Payment status badges */}
              <View style={styles.statusBadgesRow}>
                {/* Membership status badge */}
                <View style={[styles.statusBadge, { backgroundColor: statusConfig.bgColor }]}>
                  <View style={[styles.statusDot, { backgroundColor: statusConfig.dotColor }]} />
                  <AppText style={[styles.statusBadgeText, { color: statusConfig.textColor }]}>
                    {statusConfig.label}
                  </AppText>
                </View>

                {/* Payment status badge */}
                {paymentStatusConfig && (
                  <View
                    style={[
                      styles.paymentBadge,
                      { backgroundColor: paymentStatusConfig.bgColor },
                    ]}
                  >
                    <CreditCard
                      size={13}
                      color={paymentStatusConfig.iconColor}
                      strokeWidth={1.8}
                    />
                    <AppText
                      style={[
                        styles.paymentBadgeText,
                        { color: paymentStatusConfig.textColor },
                      ]}
                    >
                      {paymentStatusConfig.label}
                    </AppText>
                  </View>
                )}
              </View>

              {/* Third row – Plan information */}
              <View style={styles.planInfoBlock}>
                <AppText style={styles.planName}>
                  {activeSubscription.plan_name || 'Base plan'}
                </AppText>
                <AppText style={styles.planDescription}>
                  {activeSubscription.plan_description ||
                    'Standard membership with court booking privileges.'}
                </AppText>
              </View>

              {/* Fourth row – Price and Manage Plan */}
              <View style={styles.priceAndManageRow}>
                <View style={styles.priceContainer}>
                  <AppText style={styles.priceAmount}>
                    {formatCurrency(
                      activeSubscription.price || 103.95,
                      activeSubscription.currency || 'USD'
                    )}
                  </AppText>
                  <AppText style={styles.priceInterval}>
                    {' '}/ {(activeSubscription.duration_label || 'monthly').toLowerCase()}
                  </AppText>
                </View>

                <TouchableOpacity
                  style={styles.managePlanBtn}
                  onPress={() => setManageModalVisible(true)}
                  activeOpacity={0.75}
                  accessibilityLabel="Manage Plan"
                  accessibilityRole="button"
                >
                  <AppText style={styles.managePlanBtnText}>Manage Plan</AppText>
                  <ChevronRight size={14} color="#104E3E" strokeWidth={2.4} />
                </TouchableOpacity>
              </View>

              {/* Divider between Row 4 and Row 5 */}
              <View style={styles.cardDivider} />

              {/* Fifth row – Membership dates */}
              <View style={styles.datesRow}>
                {/* Start Date */}
                <View style={styles.dateCol}>
                  <View style={styles.dateLabelRow}>
                    <Calendar size={14} color="#718279" strokeWidth={1.8} />
                    <AppText style={styles.dateLabel}>Start Date</AppText>
                  </View>
                  <AppText style={styles.dateValue}>{startDateFormatted}</AppText>
                </View>

                {/* Vertical Divider */}
                <View style={styles.dateVerticalDivider} />

                {/* Expires */}
                <View style={[styles.dateCol, styles.dateColRight]}>
                  <View style={styles.dateLabelRow}>
                    <Calendar size={14} color="#718279" strokeWidth={1.8} />
                    <AppText style={styles.dateLabel}>
                      {activeSubscription.effective_status === 'expired' ? 'Expired' : 'Expires'}
                    </AppText>
                  </View>
                  <AppText style={styles.dateValue}>{endDateFormatted}</AppText>
                </View>
              </View>
            </View>

            {/* ─── 3. Your Benefits Card ─── */}
            <View style={styles.benefitsCard}>
              <AppText style={styles.benefitsCardTitle}>Your Benefits</AppText>

              {benefitsList.map((item, idx) => {
                const BenefitIcon = item.icon;
                const isLast = idx === benefitsList.length - 1;

                return (
                  <View key={`benefit-${idx}`}>
                    <TouchableOpacity
                      style={styles.benefitRow}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (item.actionRoute) {
                          router.push(item.actionRoute as any);
                        } else {
                          setSelectedBenefit({
                            title: item.title,
                            subtitle: item.subtitle,
                          });
                        }
                      }}
                      accessibilityLabel={item.title}
                      accessibilityRole="button"
                    >
                      <View style={styles.benefitIconCircle}>
                        <BenefitIcon size={18} color="#176B57" strokeWidth={1.8} />
                      </View>

                      <View style={styles.benefitTextCol}>
                        <AppText style={styles.benefitTitle}>{item.title}</AppText>
                        <AppText style={styles.benefitSubtitle}>
                          {item.subtitle}
                        </AppText>
                      </View>

                      <ChevronRight size={18} color="#94A3B8" strokeWidth={1.8} />
                    </TouchableOpacity>

                    {!isLast && <View style={styles.benefitDivider} />}
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {/* ─── Manage Plan Modal Sheet ─── */}
      <ModalSheet
        visible={manageModalVisible}
        onClose={() => setManageModalVisible(false)}
        title="Manage Subscription"
        subtitle={activeSubscription?.plan_name || 'Membership Plan'}
      >
        <View style={styles.modalBody}>
          <View style={styles.modalInfoRow}>
            <AppText style={styles.modalInfoLabel}>Club Facility</AppText>
            <AppText style={styles.modalInfoValue}>
              {activeSubscription?.club_name || clubName || 'Pickleball Club'}
            </AppText>
          </View>

          <View style={styles.modalInfoRow}>
            <AppText style={styles.modalInfoLabel}>Current Plan</AppText>
            <AppText style={styles.modalInfoValue}>
              {activeSubscription?.plan_name || 'Base plan'}
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
              {formatCurrency(activeSubscription?.price ?? 103.95, activeSubscription?.currency || 'USD')} /{' '}
              {(activeSubscription?.duration_label || 'monthly').toLowerCase()}
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
              {activeSubscription?.auto_renew ? 'Enabled' : 'Manual renewal'}
            </AppText>
          </View>

          <View style={styles.modalNoticeBox}>
            <Info size={16} color="#176B57" strokeWidth={2} />
            <AppText style={styles.modalNoticeText}>
              To upgrade, downgrade, or update payment preferences for your membership,
              please contact the club front desk or administrator.
            </AppText>
          </View>

          <TouchableOpacity
            style={[styles.modalCloseButton, { backgroundColor: '#114D3F', marginBottom: 10 }]}
            onPress={() => {
              const sub = activeSubscription;
              setManageModalVisible(false);
              if (sub) handleRenew(sub);
            }}
            activeOpacity={0.85}
          >
            <AppText style={[styles.modalCloseButtonText, { color: '#FFFFFF' }]}>
              {isRenewing ? 'Processing Renewal...' : 'Renew / Checkout Plan'}
            </AppText>
          </TouchableOpacity>

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
              <Sparkles size={28} color="#176B57" strokeWidth={1.8} />
            </View>
            <AppText style={styles.benefitModalTitle}>{selectedBenefit?.title}</AppText>
            <AppText style={styles.benefitModalSubtitle}>
              {selectedBenefit?.subtitle}
            </AppText>
          </View>

          <View style={styles.modalNoticeBox}>
            <ShieldCheck size={16} color="#176B57" strokeWidth={2} />
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

      {checkoutMembership && (
        <CheckoutModal
          visible={!!checkoutMembership}
          onClose={() => setCheckoutMembership(null)}
          clubId={checkoutMembership.club_id || clubId || ''}
          purpose="membership"
          activityId={checkoutMembership.plan_id || checkoutMembership.subscription_id || checkoutMembership.id || ''}
          activityTitle={checkoutMembership.plan_name}
          activitySubtitle={`Membership Renewal · ${checkoutMembership.club_name || clubName || 'Club'}`}
          onSuccess={() => {
            setCheckoutMembership(null);
            refetch();
          }}
        />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F8F5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#667776',
    fontWeight: '500',
  },

  // Multi-Club Selector
  clubSelectorRow: {
    marginBottom: 8,
    maxHeight: 44,
  },
  clubSelectorContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  clubTabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAE6',
  },
  clubTabPillActive: {
    borderColor: '#114D3F',
    backgroundColor: '#E8F5EE',
  },
  clubTabPillText: {
    fontSize: 13,
    color: '#667776',
    fontWeight: '500',
  },
  clubTabPillTextActive: {
    fontSize: 13,
    color: '#114D3F',
    fontWeight: '700',
  },

  // ─── Card 1: Membership Summary Card ───────────────────────────────────────
  membershipCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    padding: 18,
    marginBottom: 16,
    ...Shadows.sm,
  },

  // Row 1: Club information
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 12,
  },
  clubName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#104E3E',
  },

  // Row 2: Status Badges
  statusBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 6,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 6,
    gap: 6,
  },
  paymentBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Row 3: Plan information
  planInfoBlock: {
    marginBottom: 14,
  },
  planName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#102B2A',
    letterSpacing: -0.3,
  },
  planDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: '#667776',
    marginTop: 4,
  },

  // Row 4: Price & Manage Plan
  priceAndManageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#102B2A',
    letterSpacing: -0.4,
  },
  priceInterval: {
    fontSize: 13.5,
    color: '#667776',
    fontWeight: '500',
  },
  managePlanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F4F8F5',
    borderWidth: 1,
    borderColor: '#E2ECE7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  managePlanBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#104E3E',
  },

  // Horizontal Card Divider
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginBottom: 14,
  },

  // Row 5: Dates
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
    color: '#102B2A',
    marginTop: 4,
  },
  dateVerticalDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#F1F5F9',
  },

  // ─── Card 2: Your Benefits Card ────────────────────────────────────────────
  benefitsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    padding: 18,
    marginBottom: 16,
    ...Shadows.sm,
  },
  benefitsCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#102B2A',
    marginBottom: 16,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  benefitIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5EE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  benefitTextCol: {
    flex: 1,
    paddingRight: 8,
  },
  benefitTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102B2A',
  },
  benefitSubtitle: {
    fontSize: 12,
    color: '#667776',
    marginTop: 2,
    lineHeight: 16,
  },
  benefitDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },

  // ─── Free Member Joined Clubs View ─────────────────────────────────────────
  sectionSubtitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102B2A',
    marginTop: 4,
  },
  joinedClubCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    padding: 16,
    gap: 12,
  },
  joinedClubHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  joinedClubInfo: {
    flex: 1,
    marginRight: 8,
  },
  joinedClubTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102B2A',
  },
  joinedClubCity: {
    fontSize: 12,
    color: '#667776',
    marginTop: 2,
  },
  freeMemberBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  freeMemberBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0369A1',
  },
  joinedClubFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F0F5F2',
    paddingTop: 10,
  },
  joinedClubDate: {
    fontSize: 11.5,
    color: '#8A9B95',
  },
  exploreBtn: {
    backgroundColor: '#18794E',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  exploreBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // ─── Empty & Error States ──────────────────────────────────────────────────
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    padding: 24,
    alignItems: 'center',
    marginTop: 12,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E8F5EE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#102B2A',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 14,
    color: '#667776',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyButton: {
    backgroundColor: '#176B57',
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  emptyActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  emptyOutlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#176B57',
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyOutlineButtonText: {
    color: '#176B57',
    fontWeight: '700',
    fontSize: 14,
  },

  // ─── Modal Sheet Styles ────────────────────────────────────────────────────
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
    color: '#667776',
  },
  modalInfoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#102B2A',
  },
  modalNoticeBox: {
    flexDirection: 'row',
    backgroundColor: '#E8F5EE',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    alignItems: 'flex-start',
    marginTop: 6,
  },
  modalNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#176B57',
    lineHeight: 17,
  },
  modalCloseButton: {
    backgroundColor: '#176B57',
    borderRadius: 10,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  modalCloseButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  benefitModalIconContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  benefitModalIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E8F5EE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  benefitModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#102B2A',
    textAlign: 'center',
  },
  benefitModalSubtitle: {
    fontSize: 14,
    color: '#667776',
    textAlign: 'center',
    marginTop: 4,
  },
});
