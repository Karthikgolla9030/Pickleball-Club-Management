/**
 * Aught2 Pickleball — Player Leagues Screen (Screen 1)
 *
 * Dedicated player discovery list matching Screen 1 of reference mockup:
 *   - Top header with hamburger menu control and title "Leagues"
 *   - Introductory subtitle: "Track weekly standings, upcoming matches, and playoff brackets."
 *   - Strictly NO category filter chips (Doubles, Singles, Mixed, My Leagues)
 *   - Roomy cards with 104x104 court thumbnails, authoritative lifecycle status badges,
 *     natural wrapping titles, summary details, and contextual primary actions:
 *     - Open registration + unregistered -> Register
 *     - Player registered -> View Registration Details
 *     - Closed registration + unregistered -> Registration Closed
 *     - Live / in progress -> View Live League
 *     - Completed -> View Results
 *   - Full integration with dedicated registration modal and saved registration details modal
 */

import React, { useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import {
  AppHeader,
  AppText,
  EmptyState,
  ErrorState,
  LeagueCard,
  LoadingState,
} from '@/components';
import {
  LeagueRegistrationDetailsModal,
  LeagueRegistrationModal,
} from '@/components/league-registration';
import { usePlayerLeagues } from '@/hooks';
import { Colors, Radius, Spacing } from '@/theme';
import type { LeagueSummary } from '@/types';

export default function PlayerLeaguesScreen() {
  const router = useRouter();

  // Selected league for modals
  const [registerLeague, setRegisterLeague] = useState<LeagueSummary | null>(null);
  const [detailsLeague, setDetailsLeague] = useState<LeagueSummary | null>(null);

  // Authoritative leagues query from backend
  const {
    data: leagues,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = usePlayerLeagues();

  const handleOpenLeague = (league: LeagueSummary) => {
    router.push({
      pathname: '/(player)/league-details',
      params: { id: league.id },
    } as any);
  };

  const handleRegisterPress = (league: LeagueSummary) => {
    setRegisterLeague(league);
  };

  const handleViewRegistrationPress = (league: LeagueSummary) => {
    setDetailsLeague(league);
  };

  const handleRegistrationSuccess = () => {
    setRegisterLeague(null);
    void refetch();
  };

  const handleRegistrationCancelled = () => {
    setDetailsLeague(null);
    void refetch();
  };

  return (
    <View style={styles.container}>
      {/* Top Header with Hamburger Menu */}
      <AppHeader
        title="Leagues"
        showMenu={true}
        borderless={true}
        style={styles.header}
      />

      {/* Subtitle / Intro Description directly below header */}
      <View style={styles.introContainer}>
        <AppText style={styles.introText}>
          Track weekly standings, upcoming matches, and playoff brackets.
        </AppText>
      </View>

      {/* Main Content */}
      {isLoading && !isRefetching ? (
        <LoadingState message="Loading available leagues..." />
      ) : isError ? (
        <ErrorState
          message={error?.message || 'Failed to load leagues. Please try again.'}
          onRetry={() => void refetch()}
        />
      ) : (
        <FlatList
          data={leagues || []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={Colors.brand.primary}
              colors={[Colors.brand.primary]}
            />
          }
          renderItem={({ item, index }) => (
            <LeagueCard
              league={item}
              imageIndex={index}
              onPress={() => handleOpenLeague(item)}
              onRegisterPress={() => handleRegisterPress(item)}
              onViewRegistrationPress={() => handleViewRegistrationPress(item)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title="No Leagues Available"
              description="There are currently no active or upcoming leagues scheduled at your clubs. Check back soon for new seasons!"
            />
          }
        />
      )}

      {/* Dedicated Multi-Step Registration Modal */}
      <LeagueRegistrationModal
        visible={Boolean(registerLeague)}
        league={registerLeague}
        onClose={() => setRegisterLeague(null)}
        onSuccess={handleRegistrationSuccess}
      />

      {/* Saved Registration Details Modal */}
      <LeagueRegistrationDetailsModal
        visible={Boolean(detailsLeague)}
        league={detailsLeague}
        onClose={() => setDetailsLeague(null)}
        onCancelled={handleRegistrationCancelled}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F8F5',
  },
  header: {
    backgroundColor: '#F3F8F5',
    paddingBottom: 2,
  },
  introContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 2,
    paddingBottom: Spacing.md,
    backgroundColor: '#F3F8F5',
  },
  introText: {
    fontSize: 13.5,
    color: '#4B6358',
    lineHeight: 19,
    fontWeight: '400',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: 24,
  },
});
