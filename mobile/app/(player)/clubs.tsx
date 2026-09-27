/**
 * Aught2 Pickleball — Player Enrolled Clubs Screen
 * Displays all clubs where the authenticated user is enrolled as a player.
 */

import React from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import {
  AppText,
  AppHeader,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
  ScreenHeader,
} from '@/components';
import { usePlayerClubs } from '@/hooks';
import { Colors, Spacing } from '@/theme';
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

export default function PlayerClubsScreen() {
  const { clubs, isLoading, isRefetching, error, refetch } = usePlayerClubs();

  if (isLoading) {
    return (
      <Screen safeArea={false}>
        <AppHeader title="My Clubs" />
        <LoadingState message="Loading your clubs..." />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen safeArea={false}>
        <AppHeader title="My Club" />
        <ErrorState
          title="Unable to Load Club"
          message={error.message || 'A network error occurred.'}
          onRetry={() => refetch()}
        />
      </Screen>
    );
  }

  const myClub = clubs.find(c => c.club_name.toLowerCase().includes('pickleball')) || clubs[0];

  const renderClubItem = (item: PlayerClub) => {
    const joinedFormatted = item.joined_at
      ? new Date(item.joined_at).toLocaleDateString()
      : 'N/A';
    const expiresFormatted = item.expires_at
      ? new Date(item.expires_at).toLocaleDateString()
      : 'None (Lifetime / Ongoing)';

    return (
      <Card style={styles.clubCard}>
        <View style={styles.cardHeader}>
          <View style={styles.headerInfo}>
            <AppText variant="heading3" numberOfLines={1}>
              {item.club_name}
            </AppText>
            {item.membership_number ? (
              <AppText variant="caption" color="secondary">
                Member #{item.membership_number}
              </AppText>
            ) : null}
          </View>
          <Badge
            label={item.status.toUpperCase()}
            variant={getStatusBadgeVariant(item.status)}
          />
        </View>

        <View style={styles.detailsRow}>
          <View style={styles.detailCol}>
            <AppText variant="caption" color="tertiary">
              Joined
            </AppText>
            <AppText variant="bodySmall" color="secondary">
              {joinedFormatted}
            </AppText>
          </View>
          <View style={styles.detailCol}>
            <AppText variant="caption" color="tertiary">
              Expires
            </AppText>
            <AppText variant="bodySmall" color="secondary">
              {expiresFormatted}
            </AppText>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <Screen>
      <AppHeader title="My Club" />
      <ScreenHeader
        title="My Club"
        subtitle="Your active club membership."
      />
      <View style={styles.container}>
        {!myClub ? (
          <EmptyState
            title="No Club Found"
            description="You are not enrolled in the club yet. Ask your club administrator to enroll your email address."
          />
        ) : (
          <View>
            {renderClubItem(myClub)}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[8],
    gap: Spacing[3],
  },
  clubCard: {
    gap: Spacing[3],
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing[3],
  },
  headerInfo: {
    flex: 1,
    flexShrink: 1,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: Colors.surface.border,
    paddingTop: Spacing[2],
  },
  detailCol: {
    flex: 1,
  },
});
