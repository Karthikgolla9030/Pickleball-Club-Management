/**
 * Aught2 Pickleball — My Clubs Screen (Player Experience)
 *
 * - Compact AppHeader with hamburger menu and "My Clubs" title
 * - Section header "Enrolled Clubs (N)" with single "Explore More Clubs >" action
 * - Enrolled club cards with:
 *     * Actual club logo (authoritative from backend)
 *     * Club name and location
 *     * PAID / FREE status badge
 *     * Light-mint information panel: "Member Since" and "Membership Type"
 *     * "View Club" action and "Get Membership" action when applicable
 * - Single "Explore Clubs" CTA in empty state when player has no enrolled clubs
 * - Preserves pending applications without breaking existing workflows
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Building2,
  ChevronRight,
  Clock,
  Compass,
  MapPin,
  XCircle,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
} from '@/components';
import { usePlayerClubs, usePlayerMembershipRequests, usePlayerMemberships } from '@/hooks';
import { resolveMediaUrl } from '@/utils';
import type { PlayerClub } from '@/types';

function formatMemberDate(dateStr?: string | null): string {
  if (!dateStr) return 'Active';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Active';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return 'Active';
  }
}

function ClubLogoView({ url, name, size = 56 }: { url?: string | null; name: string; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const fullUrl = resolveMediaUrl(url);

  if (!fullUrl || imgError) {
    return (
      <View style={[styles.placeholderLogo, { width: size, height: size }]}>
        <Building2 size={Math.round(size * 0.44)} color="#176B57" />
      </View>
    );
  }

  return (
    <View style={[styles.logoContainer, { width: size, height: size }]}>
      <Image
        source={{ uri: fullUrl }}
        style={styles.logoImage}
        resizeMode="cover"
        onError={() => setImgError(true)}
      />
    </View>
  );
}

export default function MyClubsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isCompactWidth = width < 360;

  const {
    clubs,
    isLoading: isLoadingClubs,
    isRefetching: isRefetchingClubs,
    error: clubsError,
    refetch: refetchClubs,
  } = usePlayerClubs();

  const {
    requests,
    isLoading: isLoadingRequests,
    isRefetching: isRefetchingRequests,
    refetch: refetchRequests,
    withdrawRequest,
    isWithdrawing,
  } = usePlayerMembershipRequests();

  const { data: playerMemberships = [] } = usePlayerMemberships();

  const pendingRequests = useMemo(() => {
    return requests.filter((r) => r.status === 'pending');
  }, [requests]);

  // Filter only active memberships and deduplicate by club_id
  const activeEnrolledClubs = useMemo(() => {
    const seen = new Set<string>();
    return clubs.filter((c) => {
      if (c.status !== 'active') return false;
      if (seen.has(c.club_id)) return false;
      seen.add(c.club_id);
      return true;
    });
  }, [clubs]);

  const handleWithdraw = (requestId: string, clubName: string) => {
    Alert.alert(
      'Withdraw Application',
      `Are you sure you want to withdraw your membership application for ${clubName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              await withdrawRequest(requestId);
              await refetchRequests();
            } catch (err: any) {
              const msg =
                err?.response?.data?.detail || err?.message || 'Failed to withdraw application';
              Alert.alert('Error', msg);
            }
          },
        },
      ],
    );
  };

  const handleOpenClub = (clubId: string) => {
    router.push({
      pathname: '/player/club-details' as any,
      params: { id: clubId },
    });
  };

  const handleExploreClubs = () => {
    router.push('/player/explore-clubs' as any);
  };

  const renderClubItem = ({ item }: { item: PlayerClub }) => {
    const locationStr = [item.city, item.state].filter(Boolean).join(', ') || 'Location not specified';
    const memberSinceStr = formatMemberDate(item.joined_at);

    const paidSub = playerMemberships.find(
      (m) => m.club_id === item.club_id && (m.status === 'active' || m.effective_status === 'active')
    );

    return (
      <View style={styles.enrolledClubCard}>
        {/* Top Section: Logo + Name & Location + Status Badge */}
        <View style={styles.cardTopRow}>
          <ClubLogoView url={item.logo_url} name={item.club_name} size={56} />

          <View style={styles.cardCenterCol}>
            <AppText style={styles.clubName} numberOfLines={2}>
              {item.club_name}
            </AppText>
            <View style={styles.locationRow}>
              <MapPin size={12.5} color="#667776" style={styles.metaIcon} />
              <AppText style={styles.locationText} numberOfLines={1}>
                {locationStr}
              </AppText>
            </View>
          </View>

          <View style={paidSub ? styles.paidBadge : styles.freeBadge}>
            <AppText style={paidSub ? styles.paidBadgeText : styles.freeBadgeText}>
              {paidSub ? 'PAID' : 'FREE'}
            </AppText>
          </View>
        </View>

        {/* Middle Section: Light-Mint Information Panel */}
        <View style={styles.infoPanel}>
          <View style={styles.infoCol}>
            <AppText style={styles.infoLabel}>Member Since</AppText>
            <AppText style={styles.infoValue}>{memberSinceStr}</AppText>
          </View>

          <View style={styles.infoCol}>
            <AppText style={styles.infoLabel}>Membership Type</AppText>
            <AppText style={styles.infoValue}>
              {paidSub ? (paidSub.plan_name || 'Active Paid') : 'Free Member'}
            </AppText>
          </View>
        </View>

        {/* Bottom Section: Actions */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <TouchableOpacity
            activeOpacity={0.82}
            onPress={() => handleOpenClub(item.club_id)}
            style={[styles.viewProfileBtn, { flex: 1, marginTop: 0 }]}
            accessibilityRole="button"
            accessibilityLabel={`View club profile for ${item.club_name}`}
          >
            <AppText style={styles.viewProfileBtnText}>View Club</AppText>
            <ChevronRight size={14} color="#176B57" strokeWidth={2.2} />
          </TouchableOpacity>

          {!paidSub && (
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={() => handleOpenClub(item.club_id)}
              style={styles.getMembershipBtn}
            >
              <AppText style={styles.getMembershipBtnText}>Get Membership</AppText>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderHeader = () => (
    <View style={styles.listHeaderContainer}>
      {/* Pending Applications Section (preserved from existing app) */}
      {pendingRequests.length > 0 ? (
        <View style={styles.pendingSection}>
          <View style={styles.pendingHeaderRow}>
            <Clock size={15} color="#B45309" />
            <AppText style={styles.pendingHeaderTitle}>
              Pending Applications ({pendingRequests.length})
            </AppText>
          </View>

          {pendingRequests.map((req) => (
            <View key={req.id} style={styles.pendingCard}>
              <View style={styles.pendingTop}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <AppText style={styles.pendingClubName}>{req.club_name}</AppText>
                  <AppText style={styles.pendingAppliedDate}>
                    Applied on {formatMemberDate(req.created_at)}
                  </AppText>
                </View>
                <Badge label="PENDING REVIEW" variant="warning" size="sm" />
              </View>

              {req.message ? (
                <AppText style={styles.pendingMessage}>"{req.message}"</AppText>
              ) : null}

              <View style={styles.pendingActions}>
                <TouchableOpacity
                  onPress={() => handleWithdraw(req.id, req.club_name)}
                  disabled={isWithdrawing}
                  style={styles.withdrawBtn}
                >
                  <XCircle size={14} color="#C53030" />
                  <AppText style={styles.withdrawText}>Withdraw Application</AppText>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleOpenClub(req.club_id)}
                  style={styles.viewPendingClubBtn}
                >
                  <AppText style={styles.viewPendingClubText}>View Club</AppText>
                  <ChevronRight size={13} color="#176B57" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Enrolled Clubs Heading + Single Explore More Clubs Pill (hidden in empty state so EmptyState stays single CTA) */}
      {activeEnrolledClubs.length > 0 ? (
        <View style={styles.sectionHeaderRow}>
          <AppText
            style={[styles.sectionTitle, isCompactWidth && { fontSize: 15 }]}
            numberOfLines={1}
          >
            Enrolled Clubs ({activeEnrolledClubs.length})
          </AppText>

          <TouchableOpacity
            onPress={handleExploreClubs}
            style={[styles.exploreMorePill, isCompactWidth && { paddingHorizontal: 8 }]}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Explore More Clubs"
          >
            <Compass size={13} color="#176B57" strokeWidth={2} />
            <AppText style={[styles.exploreMoreText, isCompactWidth && { fontSize: 11 }]}>
              Explore More Clubs
            </AppText>
            <ChevronRight size={13} color="#176B57" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  const isInitialLoading = (isLoadingClubs || isLoadingRequests) && clubs.length === 0;

  if (isInitialLoading) {
    return (
      <Screen style={styles.screen}>
        <AppHeader title="My Clubs" minimalIcon borderless />
        <LoadingState message="Loading your club memberships..." />
      </Screen>
    );
  }

  if (clubsError && clubs.length === 0) {
    return (
      <Screen style={styles.screen}>
        <AppHeader title="My Clubs" minimalIcon borderless />
        <ErrorState
          title="Unable to Load Clubs"
          message={clubsError.message || 'Network error occurred while fetching memberships.'}
          onRetry={() => {
            refetchClubs();
            refetchRequests();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <AppHeader title="My Clubs" minimalIcon borderless />

      <FlatList
        data={activeEnrolledClubs}
        keyExtractor={(item) => item.membership_id || item.club_id}
        renderItem={renderClubItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <View style={styles.emptyStateContainer}>
            <EmptyState
              title="You're not part of a club yet"
              description="Explore clubs to find your pickleball community."
              actionLabel="Explore Clubs"
              onAction={handleExploreClubs}
            />
          </View>
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 90 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetchingClubs || isRefetchingRequests}
            onRefresh={() => {
              refetchClubs();
              refetchRequests();
            }}
            tintColor="#176B57"
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F4F8F6',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  listHeaderContainer: {
    marginBottom: 4,
  },
  emptyStateContainer: {
    paddingTop: 12,
  },

  // ─── Section Header Row ────────────────────────────────────────────────────
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 6,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16.5,
    fontWeight: '700',
    color: '#102B2A',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  exploreMorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    backgroundColor: '#E6F4EA',
    borderRadius: 16,
    paddingHorizontal: 9,
    paddingVertical: 5,
    gap: 3,
  },
  exploreMoreText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#176B57',
  },

  // ─── Enrolled Club Card ────────────────────────────────────────────────────
  enrolledClubCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  logoContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#E2EAE6',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  placeholderLogo: {
    borderRadius: 14,
    backgroundColor: '#EBF6F0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2EAE6',
  },
  cardCenterCol: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  clubName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102B2A',
    lineHeight: 21,
    marginBottom: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  metaIcon: {
    flexShrink: 0,
  },
  locationText: {
    fontSize: 12.5,
    color: '#667776',
    fontWeight: '500',
    flexShrink: 1,
  },
  activeBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    alignSelf: 'flex-start',
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#166534',
    letterSpacing: 0.5,
  },
  paidBadge: {
    backgroundColor: '#D1FAE5',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    alignSelf: 'flex-start',
  },
  paidBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.5,
  },
  freeBadge: {
    backgroundColor: '#E0F2FE',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    alignSelf: 'flex-start',
  },
  freeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0369A1',
    letterSpacing: 0.5,
  },
  getMembershipBtn: {
    backgroundColor: '#18794E',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  getMembershipBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },

  // ─── Information Panel ─────────────────────────────────────────────────────
  infoPanel: {
    backgroundColor: '#F3F9F6',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoCol: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: '#667776',
    fontWeight: '500',
    marginBottom: 3,
  },
  infoValue: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#102B2A',
  },

  // ─── Outlined Button ───────────────────────────────────────────────────────
  viewProfileBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D2E3DB',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  viewProfileBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#176B57',
  },

  // ─── Pending Applications Section ──────────────────────────────────────────
  pendingSection: {
    backgroundColor: '#FEF3C7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  pendingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  pendingHeaderTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#92400E',
  },
  pendingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  pendingTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  pendingClubName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#102B2A',
  },
  pendingAppliedDate: {
    fontSize: 11.5,
    color: '#667776',
    marginTop: 2,
  },
  pendingMessage: {
    fontSize: 12,
    color: '#475569',
    fontStyle: 'italic',
    marginTop: 6,
  },
  pendingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  withdrawText: {
    fontSize: 12,
    color: '#C53030',
    fontWeight: '600',
  },
  viewPendingClubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewPendingClubText: {
    fontSize: 12,
    color: '#176B57',
    fontWeight: '600',
  },
});
