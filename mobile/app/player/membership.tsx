/**
 * Aught2 Pickleball — Player My Membership Screen
 *
 * Compact, multi-club membership dashboard:
 *   - Compact AppHeader with hamburger menu, "My Membership" title,
 *     and subtitle "Manage your club memberships and benefits."
 *   - Compact Membership Overview summarizing the player's actual club-specific
 *     memberships (free-only overview vs active/mixed overview)
 *   - "Your Joined Clubs" section with one compact, structured card per club
 *     supporting Free Member, Active Member, Expired, and Pending states
 *   - Clear single action per membership state preserving Manage & CheckoutModal flows
 *   - Clean empty state ("No Club Memberships Yet") with single "Explore Clubs" CTA
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  HelpCircle,
  Info,
  MapPin,
  ShieldCheck,
} from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';

import { AppHeader, AppText, CheckoutModal, ModalSheet } from '@/components';
import {
  useActiveClub,
  usePlayerClubs,
  usePlayerMembershipRequests,
  usePlayerMemberships,
  useRenewPlayerSubscription,
} from '@/hooks';
import { Shadows } from '@/theme';
import { formatCurrency } from '@/utils';
import type { PlayerClub, PlayerMembershipView } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

type ClubMembershipState = 'active_paid' | 'pending' | 'expired' | 'free';

interface JoinedClubMembershipItem {
  clubId: string;
  clubName: string;
  location: string | null;
  state: ClubMembershipState;
  statusLabel: string;
  statusColors: { bg: string; text: string; dot: string };
  planName: string | null;
  priceLabel: string | null;
  memberSince: string | null;
  expiryLabel: 'Renews' | 'Expires' | 'Expired' | null;
  expiryDate: string | null;
  benefits: string[];
  subscription: PlayerMembershipView | null;
  pendingReason: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMembershipDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
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
    return `${day} ${months[d.getMonth()] || ''} ${d.getFullYear()}`;
  } catch {
    return String(dateStr);
  }
}

function isPendingSubscription(sub: PlayerMembershipView): boolean {
  const effective = String(sub.effective_status || sub.status || '').toLowerCase();
  const payment = String(sub.payment_status || '').toLowerCase().trim();
  if (effective === 'scheduled') return true;
  return payment === 'pending' || payment === 'processing' || payment === 'not_collected';
}

function isExpiredSubscription(sub: PlayerMembershipView): boolean {
  const effective = String(sub.effective_status || sub.status || '').toLowerCase();
  return effective === 'expired';
}

function isActiveSubscription(sub: PlayerMembershipView): boolean {
  const effective = String(sub.effective_status || sub.status || '').toLowerCase();
  return effective === 'active' && !isPendingSubscription(sub);
}

function pickPrimarySubscription(subs: PlayerMembershipView[]): PlayerMembershipView | null {
  if (subs.length === 0) return null;
  const active = subs.find((s) => isActiveSubscription(s));
  if (active) return active;
  const pending = subs.find((s) => isPendingSubscription(s));
  if (pending) return pending;
  const expired = subs.find((s) => isExpiredSubscription(s));
  if (expired) return expired;
  return null;
}

const BADGE_PALETTE: Record<ClubMembershipState, { bg: string; text: string; dot: string }> = {
  active_paid: { bg: '#E6F4EC', text: '#146C43', dot: '#16A34A' },
  pending: { bg: '#FEF3C7', text: '#B45309', dot: '#D97706' },
  expired: { bg: '#FEE2E2', text: '#B91C1C', dot: '#DC2626' },
  free: { bg: '#EAF2F8', text: '#1D5B79', dot: '#0284C7' },
};

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function PlayerMembershipScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const { clubName: fallbackClubName } = useActiveClub();

  const {
    data: memberships = [],
    isLoading: isLoadingMemberships,
    isRefetching: isRefetchingMemberships,
    isError: isMembershipsError,
    refetch: refetchMemberships,
  } = usePlayerMemberships();

  const {
    clubs: enrolledClubs = [],
    isLoading: isLoadingClubs,
    isRefetching: isRefetchingClubs,
    error: clubsError,
    refetch: refetchClubs,
  } = usePlayerClubs();

  const {
    requests: membershipRequests = [],
    isLoading: isLoadingRequests,
    isRefetching: isRefetchingRequests,
    refetch: refetchRequests,
  } = usePlayerMembershipRequests();

  const { isPending: isRenewing } = useRenewPlayerSubscription();

  const { clubId: detailClubIdParam } = useLocalSearchParams<{ clubId?: string }>();
  const [managedSub, setManagedSub] = useState<PlayerMembershipView | null>(null);
  const [checkoutMembership, setCheckoutMembership] = useState<PlayerMembershipView | null>(null);

  const isLoading = isLoadingMemberships || isLoadingClubs || isLoadingRequests;
  const isRefetching = isRefetchingMemberships || isRefetchingClubs || isRefetchingRequests;
  const isError = isMembershipsError && Boolean(clubsError);

  const handleRefresh = () => {
    void refetchMemberships();
    void refetchClubs();
    void refetchRequests();
  };

  // Build per-club membership items independently (multi-club safe)
  const joinedClubItems = useMemo<JoinedClubMembershipItem[]>(() => {
    const activeClubsById = new Map<string, PlayerClub>();
    for (const c of enrolledClubs) {
      if (c.status === 'active') {
        activeClubsById.set(c.club_id, c);
      }
    }

    const subsByClub = new Map<string, PlayerMembershipView[]>();
    for (const sub of memberships) {
      if (!sub.club_id) continue;
      const list = subsByClub.get(sub.club_id) || [];
      list.push(sub);
      subsByClub.set(sub.club_id, list);
    }

    const pendingReqByClub = new Map<string, (typeof membershipRequests)[number]>();
    for (const req of membershipRequests) {
      if (req.status === 'pending' && req.club_id) {
        pendingReqByClub.set(req.club_id, req);
      }
    }

    const allClubIds = new Set<string>([
      ...activeClubsById.keys(),
      ...subsByClub.keys(),
      ...pendingReqByClub.keys(),
    ]);

    const items: JoinedClubMembershipItem[] = [];

    for (const cid of allClubIds) {
      const club = activeClubsById.get(cid);
      const sub = pickPrimarySubscription(subsByClub.get(cid) || []);
      const pendingReq = pendingReqByClub.get(cid);

      // Ignore cancelled-only subscription if player is not an active club member or pending
      if (!club && !sub && !pendingReq) continue;
      if (!club && sub && String(sub.effective_status || sub.status).toLowerCase() === 'cancelled') {
        if (!pendingReq) continue;
      }

      const resolvedName =
        club?.club_name || sub?.club_name || pendingReq?.club_name || fallbackClubName || 'Pickleball Club';
      const resolvedLocation = club
        ? [club.city, club.state].filter(Boolean).join(', ') || null
        : null;

      if (sub && isActiveSubscription(sub)) {
        const subBenefits = Array.isArray(sub.benefits) ? sub.benefits.filter(Boolean) : [];
        const benefitsWithLimit =
          sub.booking_limit != null &&
            !subBenefits.some((b) => b.toLowerCase().includes('upcoming'))
            ? [...subBenefits, `${sub.booking_limit} upcoming bookings`]
            : subBenefits;

        items.push({
          clubId: cid,
          clubName: resolvedName,
          location: resolvedLocation,
          state: 'active_paid',
          statusLabel: 'Active Member',
          statusColors: BADGE_PALETTE.active_paid,
          planName: sub.plan_name || 'Membership Plan',
          priceLabel:
            Number(sub.price) > 0
              ? `${formatCurrency(sub.price, sub.currency || 'USD')} / ${(sub.duration_label || 'monthly').toLowerCase()}`
              : 'Complimentary',
          memberSince: formatMembershipDate(club?.joined_at || sub.start_date),
          expiryLabel: sub.end_date ? (sub.auto_renew ? 'Renews' : 'Expires') : null,
          expiryDate: formatMembershipDate(sub.end_date),
          benefits: benefitsWithLimit,
          subscription: sub,
          pendingReason: null,
        });
        continue;
      }

      if (sub && isPendingSubscription(sub)) {
        const isScheduled = String(sub.effective_status || sub.status).toLowerCase() === 'scheduled';
        items.push({
          clubId: cid,
          clubName: resolvedName,
          location: resolvedLocation,
          state: 'pending',
          statusLabel: isScheduled ? 'Scheduled' : 'Pending',
          statusColors: BADGE_PALETTE.pending,
          planName: sub.plan_name || null,
          priceLabel:
            Number(sub.price) > 0
              ? `${formatCurrency(sub.price, sub.currency || 'USD')} / ${(sub.duration_label || 'monthly').toLowerCase()}`
              : null,
          memberSince: formatMembershipDate(club?.joined_at || sub.start_date),
          expiryLabel: sub.end_date ? 'Expires' : null,
          expiryDate: formatMembershipDate(sub.end_date),
          benefits: Array.isArray(sub.benefits) ? sub.benefits.filter(Boolean) : [],
          subscription: sub,
          pendingReason: isScheduled
            ? 'Membership scheduled to activate'
            : 'Payment pending confirmation',
        });
        continue;
      }

      if (sub && isExpiredSubscription(sub)) {
        items.push({
          clubId: cid,
          clubName: resolvedName,
          location: resolvedLocation,
          state: 'expired',
          statusLabel: 'Expired',
          statusColors: BADGE_PALETTE.expired,
          planName: sub.plan_name || null,
          priceLabel:
            Number(sub.price) > 0
              ? `${formatCurrency(sub.price, sub.currency || 'USD')} / ${(sub.duration_label || 'monthly').toLowerCase()}`
              : null,
          memberSince: formatMembershipDate(club?.joined_at || sub.start_date),
          expiryLabel: sub.end_date ? 'Expired' : null,
          expiryDate: formatMembershipDate(sub.end_date),
          benefits: [],
          subscription: sub,
          pendingReason: null,
        });
        continue;
      }

      if (pendingReq && !club) {
        items.push({
          clubId: cid,
          clubName: resolvedName,
          location: resolvedLocation,
          state: 'pending',
          statusLabel: 'Pending',
          statusColors: BADGE_PALETTE.pending,
          planName: null,
          priceLabel: null,
          memberSince: formatMembershipDate(pendingReq.created_at),
          expiryLabel: null,
          expiryDate: null,
          benefits: [],
          subscription: null,
          pendingReason: 'Awaiting club approval',
        });
        continue;
      }

      if (club) {
        items.push({
          clubId: cid,
          clubName: resolvedName,
          location: resolvedLocation,
          state: 'free',
          statusLabel: 'Free Member',
          statusColors: BADGE_PALETTE.free,
          planName: null,
          priceLabel: null,
          memberSince: formatMembershipDate(club.joined_at),
          expiryLabel: null,
          expiryDate: null,
          benefits: [],
          subscription: null,
          pendingReason: null,
        });
      }
    }

    const order: Record<ClubMembershipState, number> = {
      active_paid: 0,
      pending: 1,
      expired: 2,
      free: 3,
    };
    return items.sort((a, b) => order[a.state] - order[b.state]);
  }, [enrolledClubs, memberships, membershipRequests, fallbackClubName]);

  // Restore Membership Details modal after reload when ?clubId= is set in URL
  useEffect(() => {
    if (!detailClubIdParam || joinedClubItems.length === 0) return;
    const targetId = Array.isArray(detailClubIdParam) ? detailClubIdParam[0] : detailClubIdParam;
    const match = joinedClubItems.find(
      (item) => item.clubId === targetId && item.state === 'active_paid' && item.subscription
    );
    if (match?.subscription) {
      setManagedSub(match.subscription);
    }
  }, [detailClubIdParam, joinedClubItems]);

  const overviewStats = useMemo(() => {
    let activePaid = 0;
    let free = 0;
    let expired = 0;
    let pending = 0;
    for (const item of joinedClubItems) {
      if (item.state === 'active_paid') activePaid += 1;
      else if (item.state === 'free') free += 1;
      else if (item.state === 'expired') expired += 1;
      else if (item.state === 'pending') pending += 1;
    }
    return {
      total: joinedClubItems.length,
      activePaid,
      free,
      expired,
      pending,
      onlyFree: joinedClubItems.length > 0 && activePaid === 0 && expired === 0 && pending === 0,
    };
  }, [joinedClubItems]);

  const handleRenew = (sub: PlayerMembershipView) => {
    setCheckoutMembership(sub);
  };

  const renderOverviewCard = () => {
    if (joinedClubItems.length === 0) return null;

    if (overviewStats.onlyFree) {
      return (
        <View style={styles.overviewCard}>
          <View style={styles.overviewTopRow}>
            <View style={styles.overviewTitleGroup}>
              <View style={styles.overviewIconBadge}>
                <ShieldCheck size={15} color="#146C43" strokeWidth={2.2} />
              </View>
              <AppText style={[styles.overviewTitle, isCompact && { fontSize: 13.5 }]}>
                Free Membership
              </AppText>
            </View>
            <View style={[styles.statusPill, { backgroundColor: BADGE_PALETTE.free.bg }]}>
              <View style={[styles.statusDot, { backgroundColor: BADGE_PALETTE.free.dot }]} />
              <AppText style={[styles.statusPillText, { color: BADGE_PALETTE.free.text }]}>
                Free
              </AppText>
            </View>
          </View>
          <View style={styles.overviewBodyStack}>
            <AppText style={styles.overviewMetricText}>
              {overviewStats.free} {overviewStats.free === 1 ? 'club' : 'clubs'} joined as Free Member
            </AppText>
            <AppText style={styles.overviewSubtext}>
              Upgrade to a club membership to unlock additional benefits.
            </AppText>
          </View>
        </View>
      );
    }

    const summaryChips: { label: string; bg: string; text: string }[] = [];
    if (overviewStats.activePaid > 0) {
      summaryChips.push({
        label: `${overviewStats.activePaid} Active Paid`,
        bg: '#E6F4EC',
        text: '#146C43',
      });
    }
    if (overviewStats.free > 0) {
      summaryChips.push({
        label: `${overviewStats.free} Free`,
        bg: '#EAF2F8',
        text: '#1D5B79',
      });
    }
    if (overviewStats.pending > 0) {
      summaryChips.push({
        label: `${overviewStats.pending} Pending`,
        bg: '#FEF3C7',
        text: '#B45309',
      });
    }
    if (overviewStats.expired > 0) {
      summaryChips.push({
        label: `${overviewStats.expired} Expired`,
        bg: '#FEE2E2',
        text: '#B91C1C',
      });
    }

    return (
      <View style={styles.overviewCard}>
        <View style={styles.overviewTopRow}>
          <View style={styles.overviewTitleGroup}>
            <View style={styles.overviewIconBadge}>
              <ShieldCheck size={15} color="#146C43" strokeWidth={2.2} />
            </View>
            <AppText style={[styles.overviewTitle, isCompact && { fontSize: 13.5 }]}>
              Membership Overview
            </AppText>
          </View>
          <View
            style={[
              styles.statusPill,
              {
                backgroundColor:
                  overviewStats.activePaid > 0 ? BADGE_PALETTE.active_paid.bg : BADGE_PALETTE.pending.bg,
              },
            ]}
          >
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor:
                    overviewStats.activePaid > 0
                      ? BADGE_PALETTE.active_paid.dot
                      : BADGE_PALETTE.pending.dot,
                },
              ]}
            />
            <AppText
              style={[
                styles.statusPillText,
                {
                  color:
                    overviewStats.activePaid > 0
                      ? BADGE_PALETTE.active_paid.text
                      : BADGE_PALETTE.pending.text,
                },
              ]}
            >
              {overviewStats.activePaid > 0 ? 'Active' : 'Action Needed'}
            </AppText>
          </View>
        </View>

        <View style={styles.overviewBodyStack}>
          <AppText style={styles.overviewMetricText}>
            {overviewStats.total} {overviewStats.total === 1 ? 'club' : 'clubs'} in your account
          </AppText>
          <View style={styles.overviewChipsRow}>
            {summaryChips.map((chip) => (
              <View key={chip.label} style={[styles.overviewChip, { backgroundColor: chip.bg }]}>
                <AppText style={[styles.overviewChipText, { color: chip.text }]}>{chip.label}</AppText>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  };

  const renderClubCard = (item: JoinedClubMembershipItem) => {
    const showDatesRow = Boolean(item.memberSince || item.expiryDate);

    return (
      <View key={item.clubId} style={styles.clubCard}>
        {/* Top Row: Club name, location & club-specific status pill */}
        <View style={styles.clubCardTop}>
          <View style={styles.clubIdentityCol}>
            <View style={styles.clubNameRow}>
              <Building2 size={15} color="#146C43" strokeWidth={2} />
              <AppText style={styles.clubCardName}>{item.clubName}</AppText>
            </View>
            {item.location ? (
              <View style={styles.locationRow}>
                <MapPin size={12} color="#64748B" strokeWidth={1.8} />
                <AppText style={styles.clubLocationText}>{item.location}</AppText>
              </View>
            ) : null}
          </View>

          <View style={[styles.statusPill, { backgroundColor: item.statusColors.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: item.statusColors.dot }]} />
            <AppText style={[styles.statusPillText, { color: item.statusColors.text }]}>
              {item.statusLabel}
            </AppText>
          </View>
        </View>

        {/* Plan Row (when applicable) */}
        {item.planName ? (
          <View style={[styles.planBannerRow, isCompact && { flexDirection: 'column', alignItems: 'flex-start', gap: 2 }]}>
            <View style={{ flex: 1 }}>
              <AppText style={styles.planLabel}>Plan</AppText>
              <AppText style={styles.planTitleText}>{item.planName}</AppText>
            </View>
            {item.priceLabel ? (
              <AppText style={styles.planPriceText}>{item.priceLabel}</AppText>
            ) : null}
          </View>
        ) : null}

        {/* Dates Grid (Member Since + Expiry/Renewal when applicable) */}
        {showDatesRow ? (
          <View style={styles.metaGrid}>
            {item.memberSince ? (
              <View style={styles.metaCell}>
                <AppText style={styles.metaLabel}>Member Since</AppText>
                <AppText style={styles.metaValue}>{item.memberSince}</AppText>
              </View>
            ) : null}

            {item.expiryLabel && item.expiryDate ? (
              <View style={styles.metaCell}>
                <AppText style={styles.metaLabel}>{item.expiryLabel}</AppText>
                <AppText
                  style={[
                    styles.metaValue,
                    item.state === 'expired' && { color: '#B91C1C' },
                  ]}
                >
                  {item.expiryDate}
                </AppText>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Benefits (when available for active/scheduled club subscription) */}
        {item.benefits.length > 0 ? (
          <View style={styles.benefitsBox}>
            <AppText style={styles.benefitsLabel}>Included Benefits</AppText>
            <View style={styles.benefitsListWrap}>
              {item.benefits.slice(0, 3).map((benefit, idx) => (
                <View key={`${item.clubId}-b-${idx}`} style={styles.benefitItemRow}>
                  <CheckCircle2 size={13} color="#146C43" strokeWidth={2.2} />
                  <AppText style={styles.benefitItemText}>{benefit}</AppText>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Card Footer: Single state-driven action */}
        <View style={styles.cardFooter}>
          {item.state === 'free' ? (
            <TouchableOpacity
              style={styles.outlineActionBtn}
              onPress={() =>
                router.push({
                  pathname: '/player/club-details',
                  params: { id: item.clubId },
                } as any)
              }
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={`Explore Memberships for ${item.clubName}`}
            >
              <AppText style={styles.outlineActionText}>Explore Memberships</AppText>
              <ChevronRight size={14} color="#114D3F" strokeWidth={2.2} />
            </TouchableOpacity>
          ) : item.state === 'active_paid' && item.subscription ? (
            <TouchableOpacity
              style={styles.outlineActionBtn}
              onPress={() => {
                setManagedSub(item.subscription);
                router.setParams({ clubId: item.clubId } as any);
              }}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={`View Membership for ${item.clubName}`}
            >
              <AppText style={styles.outlineActionText}>View Membership</AppText>
              <ChevronRight size={14} color="#114D3F" strokeWidth={2.2} />
            </TouchableOpacity>
          ) : item.state === 'expired' && item.subscription ? (
            <TouchableOpacity
              style={styles.primaryActionBtn}
              onPress={() => handleRenew(item.subscription!)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Renew Membership for ${item.clubName}`}
            >
              <AppText style={styles.primaryActionText}>Renew Membership</AppText>
              <ChevronRight size={14} color="#FFFFFF" strokeWidth={2.2} />
            </TouchableOpacity>
          ) : (
            <View style={styles.pendingFooterNote}>
              <Clock size={13} color="#B45309" strokeWidth={2} />
              <AppText style={styles.pendingFooterText}>
                {item.pendingReason || 'Pending verification'}
              </AppText>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <AppHeader
        title="My Membership"
        subtitle="Manage your club memberships and benefits."
        showMenu
        borderless
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 76 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
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
        ) : isError && joinedClubItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={[styles.emptyIconCircle, { backgroundColor: '#FEE2E2' }]}>
              <HelpCircle size={28} color="#DC2626" strokeWidth={1.8} />
            </View>
            <AppText style={styles.emptyTitle}>Unable to Load Memberships</AppText>
            <AppText style={styles.emptyDescription}>
              We could not retrieve your club memberships. Pull down or try again.
            </AppText>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={handleRefresh}
              activeOpacity={0.85}
            >
              <AppText style={styles.emptyButtonText}>Try Again</AppText>
            </TouchableOpacity>
          </View>
        ) : joinedClubItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <ShieldCheck size={28} color="#114D3F" strokeWidth={1.8} />
            </View>
            <AppText style={styles.emptyTitle}>No Club Memberships Yet</AppText>
            <AppText style={styles.emptyDescription}>
              Explore clubs and join a community to get started.
            </AppText>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => router.push('/player/explore-clubs' as any)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Explore Clubs"
            >
              <AppText style={styles.emptyButtonText}>Explore Clubs</AppText>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.contentColumn}>
            {renderOverviewCard()}

            <View style={styles.sectionHeaderRow}>
              <AppText style={styles.sectionHeading}>Your Joined Clubs</AppText>
              <View style={styles.countPill}>
                <AppText style={styles.countPillText}>{joinedClubItems.length}</AppText>
              </View>
            </View>

            <View style={styles.cardsStack}>{joinedClubItems.map(renderClubCard)}</View>
          </View>
        )}
      </ScrollView>

      {/* ─── View / Manage Active Subscription Sheet ─── */}
      <ModalSheet
        visible={Boolean(managedSub)}
        onClose={() => {
          setManagedSub(null);
          router.setParams({ clubId: undefined } as any);
        }}
        title="Membership Details"
        subtitle={managedSub?.plan_name || 'Club Membership'}
        actions={
          managedSub
            ? [
              {
                label: 'Done',
                variant: 'secondary',
                onPress: () => {
                  setManagedSub(null);
                  router.setParams({ clubId: undefined } as any);
                },
              },
              {
                label: isRenewing ? 'Processing...' : 'Renew Plan',
                variant: 'primary',
                loading: isRenewing,
                onPress: () => {
                  const sub = managedSub;
                  setManagedSub(null);
                  router.setParams({ clubId: undefined } as any);
                  handleRenew(sub);
                },
              },
            ]
            : undefined
        }
      >
        {managedSub ? (
          <View style={styles.modalBody}>
            <View style={styles.modalInfoRow}>
              <AppText style={styles.modalInfoLabel}>Club Facility</AppText>
              <AppText style={styles.modalInfoValue}>
                {managedSub.club_name || fallbackClubName || 'Club'}
              </AppText>
            </View>

            <View style={styles.modalInfoRow}>
              <AppText style={styles.modalInfoLabel}>Plan</AppText>
              <AppText style={styles.modalInfoValue}>{managedSub.plan_name}</AppText>
            </View>

            <View style={styles.modalInfoRow}>
              <AppText style={styles.modalInfoLabel}>Status</AppText>
              <AppText style={[styles.modalInfoValue, { color: '#146C43' }]}>
                {managedSub.status_label || 'Active'}
              </AppText>
            </View>

            <View style={styles.modalInfoRow}>
              <AppText style={styles.modalInfoLabel}>Rate</AppText>
              <AppText style={styles.modalInfoValue}>
                {Number(managedSub.price) > 0
                  ? `${formatCurrency(managedSub.price, managedSub.currency || 'USD')} / ${(managedSub.duration_label || 'monthly').toLowerCase()}`
                  : 'Complimentary'}
              </AppText>
            </View>

            <View style={styles.modalInfoRow}>
              <AppText style={styles.modalInfoLabel}>Period</AppText>
              <AppText style={styles.modalInfoValue}>
                {formatMembershipDate(managedSub.start_date) || '—'} –{' '}
                {formatMembershipDate(managedSub.end_date) || '—'}
              </AppText>
            </View>

            <View style={styles.modalInfoRow}>
              <AppText style={styles.modalInfoLabel}>Auto-Renewal</AppText>
              <AppText style={styles.modalInfoValue}>
                {managedSub.auto_renew ? 'Enabled' : 'Manual renewal'}
              </AppText>
            </View>

            {Array.isArray(managedSub.benefits) && managedSub.benefits.length > 0 ? (
              <View style={styles.modalNoticeBox}>
                <Info size={15} color="#176B57" strokeWidth={2} />
                <AppText style={styles.modalNoticeText}>
                  Benefits apply exclusively at {managedSub.club_name || 'this club'}:{' '}
                  {managedSub.benefits.join(', ')}.
                </AppText>
              </View>
            ) : null}
          </View>
        ) : null}
      </ModalSheet>

      {/* ─── Shared CheckoutModal for Membership Renewal ─── */}
      {checkoutMembership ? (
        <CheckoutModal
          visible={Boolean(checkoutMembership)}
          onClose={() => setCheckoutMembership(null)}
          showBackButton
          onBack={() => setCheckoutMembership(null)}
          clubId={checkoutMembership.club_id}
          clubName={checkoutMembership.club_name || fallbackClubName || undefined}
          purpose="membership"
          activityId={
            checkoutMembership.plan_id || checkoutMembership.subscription_id || checkoutMembership.id || ''
          }
          activityTitle={checkoutMembership.plan_name}
          activitySubtitle={`Membership Renewal · ${checkoutMembership.club_name || fallbackClubName || 'Club'}`}
          summaryDetails={[
            {
              key: 'club',
              label: 'Club',
              value: checkoutMembership.club_name || fallbackClubName || 'Club',
              icon: 'map',
            },
            {
              key: 'plan',
              label: 'Plan',
              value: checkoutMembership.plan_name,
              icon: 'award',
            },
            {
              key: 'type',
              label: 'Transaction',
              value: 'Membership Renewal',
              icon: 'tag',
            },
          ]}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['player', 'memberships'] });
            queryClient.invalidateQueries({ queryKey: ['player', 'membership'] });
            queryClient.invalidateQueries({ queryKey: ['my-membership'] });
            queryClient.invalidateQueries({ queryKey: ['memberships'] });
            if (checkoutMembership?.club_id) {
              queryClient.invalidateQueries({
                queryKey: ['clubs', checkoutMembership.club_id, 'subscriptions'],
              });
              queryClient.invalidateQueries({
                queryKey: ['clubs', checkoutMembership.club_id, 'members'],
              });
              queryClient.invalidateQueries({
                queryKey: ['clubs', checkoutMembership.club_id, 'analytics'],
              });
            }
            handleRefresh();
          }}
        />
      ) : null}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F8F6',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  contentColumn: {
    gap: 14,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 56,
    gap: 10,
  },
  loadingText: {
    fontSize: 13.5,
    color: '#64748B',
    fontWeight: '500',
  },

  // ─── Compact Membership Overview ───────────────────────────────────────────
  overviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCE8E2',
    padding: 14,
    gap: 8,
    ...Shadows.sm,
  },
  overviewTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  overviewTitleGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  overviewIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#E6F4EC',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  overviewTitle: {
    flexShrink: 1,
    fontSize: 14.5,
    fontWeight: '700',
    color: '#102B2A',
  },
  overviewBodyStack: {
    gap: 4,
  },
  overviewMetricText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#146C43',
  },
  overviewSubtext: {
    fontSize: 12.5,
    lineHeight: 17.5,
    color: '#5F716B',
  },
  overviewChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  overviewChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  overviewChipText: {
    fontSize: 11.5,
    fontWeight: '700',
  },

  // ─── Status Pill ───────────────────────────────────────────────────────────
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8.5,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 5,
    flexShrink: 0,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ─── Joined Clubs Section ──────────────────────────────────────────────────
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102B2A',
    letterSpacing: -0.2,
  },
  countPill: {
    backgroundColor: '#E6F4EC',
    paddingHorizontal: 9,
    paddingVertical: 2.5,
    borderRadius: 999,
  },
  countPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#146C43',
  },
  cardsStack: {
    gap: 12,
  },

  // ─── Club Card ─────────────────────────────────────────────────────────────
  clubCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCE8E2',
    padding: 14,
    gap: 10,
    ...Shadows.sm,
  },
  clubCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  clubIdentityCol: {
    flex: 1,
    gap: 3,
  },
  clubNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  clubCardName: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '700',
    color: '#102B2A',
    lineHeight: 20,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 21,
  },
  clubLocationText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },

  // ─── Plan Summary Row ──────────────────────────────────────────────────────
  planBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F4F9F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
  },
  planLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  planTitleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102B2A',
    marginTop: 1,
  },
  planPriceText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#114D3F',
  },

  // ─── Meta Grid ─────────────────────────────────────────────────────────────
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 2,
  },
  metaCell: {
    minWidth: 110,
    flex: 1,
  },
  metaLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102B2A',
    marginTop: 2,
  },

  // ─── Benefits Inside Card ──────────────────────────────────────────────────
  benefitsBox: {
    borderTopWidth: 1,
    borderTopColor: '#EFF5F2',
    paddingTop: 9,
    gap: 6,
  },
  benefitsLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  benefitsListWrap: {
    gap: 4,
  },
  benefitItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  benefitItemText: {
    flex: 1,
    fontSize: 12.5,
    color: '#1E293B',
    fontWeight: '500',
  },

  // ─── Card Footer / Action ──────────────────────────────────────────────────
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: '#EFF5F2',
    paddingTop: 10,
  },
  outlineActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: '#C8DDD3',
    backgroundColor: '#F8FCFA',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  outlineActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#114D3F',
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#114D3F',
    borderRadius: 10,
    paddingVertical: 9.5,
    paddingHorizontal: 14,
  },
  primaryActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pendingFooterNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFBEB',
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  pendingFooterText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#B45309',
  },

  // ─── Compact Empty / Error Card ────────────────────────────────────────────
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCE8E2',
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 8,
    ...Shadows.sm,
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#E6F4EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#102B2A',
    textAlign: 'center',
    marginBottom: 6,
  },
  emptyDescription: {
    fontSize: 13.5,
    color: '#5F716B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  emptyButton: {
    backgroundColor: '#114D3F',
    borderRadius: 10,
    paddingHorizontal: 22,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13.5,
  },

  // ─── Modal Sheet Styles ────────────────────────────────────────────────────
  modalBody: {
    gap: 8,
    paddingBottom: 4,
  },
  modalInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  modalInfoLabel: {
    fontSize: 13.5,
    color: '#64748B',
  },
  modalInfoValue: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#102B2A',
  },
  modalNoticeBox: {
    flexDirection: 'row',
    backgroundColor: '#E8F5EE',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    alignItems: 'flex-start',
    marginTop: 4,
  },
  modalNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#176B57',
    lineHeight: 17,
  },
});
