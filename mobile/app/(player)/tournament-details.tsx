/**
 * Aught2 Pickleball — Player Tournament Details Screen
 *
 * Unified player-facing tournament details screen for all four tournament formats:
 *   1. Round Robin
 *   2. Bracket
 *   3. Pool Play
 *   4. Scramble
 *
 * Implements the standardized common pages, layout, and tab structure:
 *   - Overview & Rules
 *   - Players
 *   - Bracket / Pools & Standings / Championship Bracket (where format-specific)
 *   - Matches
 *   - Standings
 *   - Results
 */

import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  ErrorState,
  LoadingState,
  PlayerTournamentDetailsView,
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

  return (
    <>
      <PlayerTournamentDetailsView
        tournament={tournament}
        onBack={handleBack}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        onRegister={() => setShowRegisterModal(true)}
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
