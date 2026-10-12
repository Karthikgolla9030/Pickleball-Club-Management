/**
 * Aught2 Pickleball — My Clubs Screen (Player Experience)
 *
 * Displays:
 * 1. Enrolled Player Clubs (with membership status, dates, and navigation to club details)
 * 2. Pending Membership Applications (with status and withdraw action)
 * 3. Quick navigation to Explore Clubs for discovering new facilities
 */

import React from 'react';
import {
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Building2,
  Calendar,
  ChevronRight,
  Clock,
  Compass,
  MapPin,
  Sparkles,
  XCircle,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
} from '@/components';
import { API_ENDPOINTS } from '@/constants';
import { usePlayerClubs, usePlayerMembershipRequests } from '@/hooks';
import { Colors, Radius, Spacing } from '@/theme';
import type { PlayerClub, PlayerMembershipStatus } from '@/types';

function getStatusBadgeVariant(
  status: PlayerMembershipStatus,
): 'success' | 'warning' | 'error' | 'default' {
  switch (status) {
    case 'active':
      return 'success';
    case 'suspended':
      return 'warning';
    case 'expired':
      return 'error';
    case 'inactive':
    default:
      return 'default';
  }
}

function getFullImageUrl(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null;
  const clean = url.trim();
  if (clean.startsWith('http') || clean.startsWith('data:')) return clean;
  const base = API_ENDPOINTS.BASE.replace(/\/$/, '');
  const path = clean.startsWith('/') ? clean : `/${clean}`;
  return `${base}${path}`;
}

export default function PlayerClubsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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

  const pendingRequests = requests.filter((r) => r.status === 'pending');

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
              const msg = err?.response?.data?.detail || err?.message || 'Failed to withdraw application';
              Alert.alert('Error', msg);
            }
          },
        },
      ],
    );
  };

  const isInitialLoading = (isLoadingClubs || isLoadingRequests) && clubs.length === 0;

  if (isInitialLoading) {
    return (
      <Screen style={styles.screen}>
        <AppHeader title="My Clubs" />
        <LoadingState message="Loading your club memberships..." />
      </Screen>
    );
  }

  if (clubsError && clubs.length === 0) {
    return (
      <Screen style={styles.screen}>
        <AppHeader title="My Clubs" />
        <ErrorState
          title="Unable to Load Clubs"
          message={clubsError.message || 'Network error occurred.'}
          onRetry={() => {
            refetchClubs();
            refetchRequests();
          }}
        />
      </Screen>
    );
  }

  const renderClubItem = ({ item }: { item: PlayerClub }) => {
    const logoUri = getFullImageUrl(item.logo_url);
    const locationStr = [item.city, item.state].filter(Boolean).join(', ') || 'Facility Location';
    const joinedFormatted = item.joined_at
      ? new Date(item.joined_at).toLocaleDateString()
      : 'Active Member';

    return (
      <Card style={styles.clubCard}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            router.push({
              pathname: '/(player)/club-details' as any,
              params: { id: item.club_id },
            });
          }}
          style={styles.cardTouchable}
        >
          <View style={styles.cardHeader}>
            <View style={styles.logoWrapper}>
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={styles.logo} resizeMode="cover" />
              ) : (
                <View style={styles.placeholderLogo}>
                  <Building2 size={24} color="#18794E" />
                </View>
              )}
            </View>

            <View style={styles.cardTitles}>
              <View style={styles.nameRow}>
                <AppText variant="heading3" color="primary" numberOfLines={1} style={styles.clubName}>
                  {item.club_name}
                </AppText>
                <Badge label={item.status.toUpperCase()} variant={getStatusBadgeVariant(item.status)} size="sm" />
              </View>

              <View style={styles.metaRow}>
                <MapPin size={12} color="#667776" />
                <AppText variant="caption" color="secondary" numberOfLines={1}>
                  {locationStr}
                </AppText>
              </View>
            </View>
          </View>

          <View style={styles.cardDates}>
            <View style={styles.dateCol}>
              <AppText variant="caption" color="secondary">
                Member Since
              </AppText>
              <AppText variant="bodySmall" color="primary" style={styles.dateVal}>
                {joinedFormatted}
              </AppText>
            </View>

            {item.membership_number ? (
              <View style={styles.dateCol}>
                <AppText variant="caption" color="secondary">
                  Member #
                </AppText>
                <AppText variant="bodySmall" color="primary" style={styles.dateVal}>
                  {item.membership_number}
                </AppText>
              </View>
            ) : null}
          </View>

          <View style={styles.cardFooter}>
            <AppText variant="label" color="primary" style={styles.viewText}>
              View Club Profile
            </AppText>
            <ChevronRight size={15} color="#18794E" />
          </View>
        </TouchableOpacity>
      </Card>
    );
  };

  const renderHeader = () => (
    <View style={styles.listHeader}>
      {/* Pending Applications Section */}
      {pendingRequests.length > 0 ? (
        <View style={styles.pendingSection}>
          <View style={styles.sectionTitleRow}>
            <Clock size={16} color="#B45309" />
            <AppText variant="heading3" style={{ color: '#92400E' }}>
              Pending Applications ({pendingRequests.length})
            </AppText>
          </View>

          {pendingRequests.map((req) => (
            <Card key={req.id} style={styles.pendingCard}>
              <View style={styles.pendingTop}>
                <View style={styles.pendingTitles}>
                  <AppText variant="heading3" color="primary">
                    {req.club_name}
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    Applied on {new Date(req.created_at).toLocaleDateString()}
                  </AppText>
                </View>
                <Badge label="PENDING REVIEW" variant="warning" size="sm" />
              </View>

              {req.message ? (
                <AppText variant="bodySmall" color="secondary" style={styles.pendingMessage}>
                  "{req.message}"
                </AppText>
              ) : null}

              <View style={styles.pendingActions}>
                <TouchableOpacity
                  onPress={() => handleWithdraw(req.id, req.club_name)}
                  disabled={isWithdrawing}
                  style={styles.withdrawBtn}
                >
                  <XCircle size={14} color="#C53030" />
                  <AppText variant="caption" style={styles.withdrawText}>
                    Withdraw Application
                  </AppText>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    router.push({
                      pathname: '/(player)/club-details' as any,
                      params: { id: req.club_id },
                    });
                  }}
                  style={styles.viewClubBtn}
                >
                  <AppText variant="caption" color="primary">
                    View Club
                  </AppText>
                  <ChevronRight size={13} color="#18794E" />
                </TouchableOpacity>
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      <View style={styles.enrolledTitleRow}>
        <AppText variant="heading3" color="primary">
          Enrolled Clubs ({clubs.length})
        </AppText>
        <TouchableOpacity
          onPress={() => router.push('/(player)/explore-clubs' as any)}
          style={styles.exploreLink}
        >
          <Compass size={14} color="#18794E" />
          <AppText variant="label" color="primary">
            Explore More Clubs
          </AppText>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Screen style={styles.screen}>
      <AppHeader
        title="My Clubs"
        rightElement={
          <TouchableOpacity
            onPress={() => router.push('/(player)/explore-clubs' as any)}
            style={styles.headerExploreBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Compass size={20} color="#18794E" />
          </TouchableOpacity>
        }
      />

      {clubs.length === 0 && pendingRequests.length === 0 ? (
        <EmptyState
          title="No Club Memberships"
          description="You are not enrolled in any clubs yet. Discover clubs in your area and apply to join!"
          actionLabel="Explore Clubs"
          onAction={() => router.push('/(player)/explore-clubs' as any)}
        />
      ) : (
        <FlatList
          data={clubs}
          keyExtractor={(item) => item.membership_id}
          renderItem={renderClubItem}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 90 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefetchingClubs || isRefetchingRequests}
              onRefresh={() => {
                refetchClubs();
                refetchRequests();
              }}
              tintColor="#18794E"
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5F8F7',
  },
  headerExploreBtn: {
    padding: 6,
  },
  listContent: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  listHeader: {
    gap: Spacing.md,
    marginBottom: Spacing.xs,
  },
  pendingSection: {
    gap: Spacing.sm,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  pendingCard: {
    padding: Spacing.md,
    backgroundColor: '#FFFBEB',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#FDE68A',
    gap: Spacing.xs,
  },
  pendingTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  pendingTitles: {
    flex: 1,
    gap: 2,
  },
  pendingMessage: {
    fontStyle: 'italic',
    color: '#78350F',
    marginTop: 2,
  },
  pendingActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#FEF3C7',
  },
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  withdrawText: {
    color: '#C53030',
    fontWeight: '500',
  },
  viewClubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
  },
  enrolledTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exploreLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clubCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    overflow: 'hidden',
  },
  cardTouchable: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  logoWrapper: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#E4F4EC',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  placeholderLogo: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitles: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clubName: {
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardDates: {
    flexDirection: 'row',
    gap: Spacing.lg,
    backgroundColor: '#F9FBFB',
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#EDF3F0',
  },
  dateCol: {
    gap: 2,
  },
  dateVal: {
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 2,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2',
  },
  viewText: {
    color: '#18794E',
    fontWeight: '600',
    fontSize: 13,
  },
});
