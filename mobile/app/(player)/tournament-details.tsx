/**
 * Aught2 Pickleball — Player Tournament Details Screen
 *
 * Dedicated live and completed tournament viewer supporting:
 *   1. Round Robin (Completed / Live)
 *   2. Pool Play (Completed / Live)
 *   3. Scramble (Completed / Live)
 *   4. Bracket (Completed / Live)
 *   5. Upcoming Preview (Pre-registration)
 *
 * NOTE: Registration and registration details are handled directly via modals
 * from the Player Tournaments discovery list. Redundant registration-open
 * and "You are Registered!" pages have been completely removed from this screen.
 */

import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  CompletedBracketView,
  CompletedPoolPlayView,
  CompletedRoundRobinView,
  CompletedScrambleView,
  ErrorState,
  LiveTournamentView,
  LoadingState,
  UpcomingTournamentPreviewView,
} from '@/components';
import { TournamentRegistrationModal } from '@/components/tournament-registration';
import { useTournamentDetails } from '@/hooks';

export default function PlayerTournamentDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tournamentId = id ?? null;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  // Primary Tournament Query (public/player scoped)
  const {
    tournament,
    isLoading: isLoadingTournament,
    error: tournamentError,
    refetch: refetchTournament,
  } = useTournamentDetails(null, tournamentId);

  const format = tournament?.format ?? 'round_robin';
  const status = tournament?.status ?? 'draft';
  const isPoolPlay = format === 'pool_play';
  const isScramble = format === 'scramble';
  const isBracket = format === 'bracket';
  const isRoundRobin = !isPoolPlay && !isScramble && !isBracket;

  const isLive = status === 'in_progress';
  const isCompleted = status === 'completed';

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(player)/tournaments' as any);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetchTournament();
    setIsRefreshing(false);
  };

  const handleClubPress = (clubId: string) => {
    router.push({
      pathname: '/(player)/club-details' as any,
      params: { id: clubId },
    });
  };

  if (isLoadingTournament) {
    return <LoadingState message="Loading tournament details..." />;
  }

  if (tournamentError || !tournament) {
    return (
      <ErrorState
        message={tournamentError?.message || 'Tournament not found'}
        onRetry={() => void refetchTournament()}
      />
    );
  }

  // 1. Dedicated Finished Pool Play view
  if (isPoolPlay && isCompleted) {
    return (
      <CompletedPoolPlayView
        tournament={tournament}
        onBack={handleBack}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />
    );
  }

  // 2. Dedicated Finished Round Robin view
  if (isRoundRobin && isCompleted) {
    return (
      <CompletedRoundRobinView
        tournament={tournament}
        onBack={handleBack}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />
    );
  }

  // 3. Dedicated Finished Bracket view
  if (isBracket && isCompleted) {
    return (
      <CompletedBracketView
        tournament={tournament}
        onBack={handleBack}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />
    );
  }

  // 4. Dedicated Finished Scramble view
  if (isScramble && isCompleted) {
    return (
      <CompletedScrambleView
        tournament={tournament}
        onBack={handleBack}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />
    );
  }

  // 5. Dedicated Live Tournament view
  if (isLive) {
    return (
      <LiveTournamentView
        tournament={tournament}
        onBack={handleBack}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />
    );
  }

  // 6. Pre-Live / Registration / Upcoming Tournament view
  return (
    <>
      <UpcomingTournamentPreviewView
        tournament={tournament}
        onBack={handleBack}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        onRegister={() => setShowRegisterModal(true)}
        onClubPress={handleClubPress}
      />
      {showRegisterModal && (
        <TournamentRegistrationModal
          visible={showRegisterModal}
          tournament={tournament}
          onClose={() => setShowRegisterModal(false)}
          onSuccess={() => {
            setShowRegisterModal(false);
            void refetchTournament();
          }}
        />
      )}
    </>
  );
}
