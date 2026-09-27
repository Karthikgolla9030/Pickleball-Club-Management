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

import React, { useEffect, useState } from 'react';
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
import { useTournamentDetails } from '@/hooks';

export default function PlayerTournamentDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tournamentId = id ?? null;

  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // Check registration opening window for upcoming preview
  const now = new Date();
  const regOpenAt = tournament?.registration_open_at ? new Date(tournament.registration_open_at) : null;
  const isNotYetOpen = status === 'draft' || (regOpenAt ? regOpenAt > now : false);

  // If tournament is in registration phase (open or closed), the redundant registration
  // pages are removed; redirect back to tournaments discovery list.
  useEffect(() => {
    if (!isLoadingTournament && tournament && !isLive && !isCompleted && !isNotYetOpen) {
      router.replace('/(player)/tournaments' as any);
    }
  }, [isLoadingTournament, tournament, isLive, isCompleted, isNotYetOpen, router]);

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

  // 5. Dedicated Upcoming Tournament Preview view (before registration opens)
  if (isNotYetOpen) {
    return (
      <UpcomingTournamentPreviewView
        tournament={tournament}
        onBack={handleBack}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />
    );
  }

  // 6. Dedicated Live Tournament view
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

  // Fallback while redirecting non-live/completed tournaments
  return <LoadingState message="Redirecting to tournaments..." />;
}
