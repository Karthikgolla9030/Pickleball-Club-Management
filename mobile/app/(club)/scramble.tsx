/**
 * Aught2 Pickleball — Scramble Workspace Screen
 *
 * Route: /(club)/scramble?tournamentId=...
 *
 * Dedicated workspace screen for Scramble tournaments:
 * - Real-time synchronization with FastAPI authoritative scramble engine
 * - 4 Sub-tabs: Overview, Players, Rounds, Standings
 * - Availability management with 4/5-player court partition validation
 * - Matchups generation, round start/finish, next round, tournament conclusion
 * - Score recording modal with single-game pickleball validation
 * - Pull-to-refresh and multi-tenant club isolation
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  DraftTournamentBanner,
  ErrorState,
  LoadingState,
  RegistrationOpenBanner,
  Screen,
  TournamentManagementHeader,
  TournamentSettingsTab,
} from '@/components';
import {
  ScrambleEndTournamentModal,
  ScrambleOverviewTab,
  ScramblePlayersTab,
  ScrambleResultsTab,
  ScrambleRoundsTab,
  ScrambleScoreModal,
  ScrambleStandingsTab,
} from '@/components/scramble';

import {
  useActiveClub,
  usePermission,
  useScramble,
  useTournamentDetails,
  useTournamentRegistrations,
} from '@/hooks';
import { getTournamentNavigationTabs, type TournamentTabKey } from '@/navigation';

import { Colors } from '@/theme';
import type { Match } from '@/types';

export default function ScrambleWorkspaceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tournamentId?: string }>();
  const tournamentId = params.tournamentId ?? null;

  const { clubId } = useActiveClub();
  const { isOwner, isManager, isTournamentDirector, canManageTournaments } = usePermission();
  const canManage = isOwner || isManager || isTournamentDirector || canManageTournaments;

  // Active Sub-Tab State
  const [activeTab, setActiveTab] = useState<TournamentTabKey>('overview');

  // Modals State
  const [scoreModalVisible, setScoreModalVisible] = useState(false);
  const [activeMatchForScore, setActiveMatchForScore] = useState<Match | null>(null);
  const [endTournamentModalVisible, setEndTournamentModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ─── Data Queries ────────────────────────────────────────────────────────
  const {
    tournament,
    isLoading: isLoadingTournament,
    error: tournamentError,
    refetch: refetchTournament,
    openRegistration,
    isOpenRegistrationPending,
    closeRegistration,
    isCloseRegistrationPending,
    startTournament,
    isStartingTournament,
  } = useTournamentDetails(clubId, tournamentId);

  const {
    registrations,
    isLoading: isLoadingRegs,
    refetch: refetchRegs,
  } = useTournamentRegistrations(clubId, tournamentId);

  const {
    state,
    isLoadingState,
    stateError,
    refetchState,
    matches,
    matchesError,
    refetchMatches,
    standings,
    isLoadingStandings,
    standingsError,
    refetchStandings,
    setAvailability,
    isSettingAvailability,
    createMatchups,
    isCreatingMatchups,
    startRound,
    isStartingRound,
    finishRound,
    isFinishingRound,
    startNextRound,
    isStartingNextRound,
    setPlannedRounds,
    isSettingPlannedRounds,
    endTournament,
    isEndingTournament,
    recordResult,
    correctResult,
    isRecordingResult,
    isCorrectingResult,
  } = useScramble(clubId, tournamentId);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchTournament(),
      refetchRegs(),
      refetchState(),
      refetchMatches(),
      refetchStandings(),
    ]);
    setRefreshing(false);
  };

  const handleCloseRegistration = async (): Promise<void> => {
    return new Promise<void>((resolve) => {
      Alert.alert(
        'Close Registration?',
        `Closing registration for "${tournament?.name ?? 'this tournament'}" will:\n\n• Prevent any new player registrations or withdrawals\n• Finalize participant rosters and assign seeds by skill rating\n• Enable Scramble round generation and scheduling`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
          {
            text: 'Close Registration',
            style: 'destructive',
            onPress: async () => {
              try {
                await closeRegistration();
                Alert.alert(
                  'Registration Closed',
                  'Registration is now closed. Player seeds have been assigned by skill rating and Round 1 is ready for setup.'
                );
                void handleRefresh();
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'Failed to close registration';
                Alert.alert('Error', msg);
              } finally {
                resolve();
              }
            },
          },
        ]
      );
    });
  };

  const handleStartTournament = () => {
    Alert.alert(
      'Start Tournament',
      'Mark this Scramble tournament as live (In Progress)? Players will see live round updates.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Now',
          style: 'default',
          onPress: async () => {
            try {
              await startTournament();
              void handleRefresh();
              Alert.alert('Tournament Started!', 'The tournament is now live. You can now manage rounds.');
            } catch (err: unknown) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to start tournament');
            }
          },
        },
      ]
    );
  };

  const handleOpenOptionsMenu = () => {
    const isDraft = tournament?.status === 'draft';
    const isRegOpen = tournament?.status === 'registration_open';
    const isRegClosed = tournament?.status === 'registration_closed';
    const isInProgress = tournament?.status === 'in_progress';
    const buttons: { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[] = [];

    if (isDraft && canManage) {
      buttons.push({
        text: 'Publish & Open Registration',
        onPress: handlePublishTournament,
      });
    }

    if (isRegOpen && canManage) {
      buttons.push({
        text: 'Close Registration',
        onPress: handleCloseRegistration,
      });
    }

    if (isRegClosed && (!matches || matches.length === 0) && canManage) {
      buttons.push({
        text: 'Reopen Registration',
        onPress: handlePublishTournament,
      });
    }

    if (isRegClosed && canManage) {
      buttons.push({
        text: 'Start Tournament (Go Live)',
        onPress: handleStartTournament,
      });
    }

    if (isInProgress && canManage) {
      buttons.push({
        text: 'End Tournament & Finalize',
        style: 'destructive',
        onPress: () => setEndTournamentModalVisible(true),
      });
    }

    buttons.push(
      {
        text: 'Refresh Data',
        onPress: handleRefresh,
      },
      {
        text: 'Tournament Settings',
        onPress: () => setActiveTab('settings'),
      },
      {
        text: 'Back to Tournaments',
        onPress: () => {
          if (router.canGoBack()) router.back();
          else router.replace('/(club)/tournaments');
        },
      },
      { text: 'Cancel', style: 'cancel' }
    );

    Alert.alert(
      tournament?.name ?? 'Scramble Tournament',
      `Status: ${tournament?.status_label ?? tournament?.status ?? ''}`,
      buttons
    );
  };

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleSaveAvailability = async (playerIds: string[]) => {
    try {
      await setAvailability({ player_membership_ids: playerIds });
      Alert.alert('Success', 'Player availability updated for this round.');
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update player availability.');
    }
  };

  const handleCreateMatchups = async () => {
    try {
      await createMatchups();
      setActiveTab('rounds');
      Alert.alert('Success', `Matchups created for Round ${state?.current_round ?? 1}.`);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create matchups.');
    }
  };

  const handleStartRound = async () => {
    try {
      await startRound();
      Alert.alert('Round Started', `Round ${state?.current_round ?? 1} is now in progress.`);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to start round.');
    }
  };

  const handleFinishRound = async () => {
    try {
      await finishRound();
      Alert.alert('Round Completed', `Round ${state?.current_round ?? 1} has finished.`);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to finish round.');
    }
  };

  const handleStartNextRound = async () => {
    try {
      await startNextRound();
      Alert.alert(
        'Next Round Ready',
        `Advanced to Round ${(state?.current_round ?? 1) + 1} of ${state?.planned_rounds ?? 5}. Player availability has been carried forward automatically.`,
      );
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to start next round.');
    }
  };

  const handleEndTournament = async () => {
    try {
      await endTournament();
      setEndTournamentModalVisible(false);
      setActiveTab('standings');
      Alert.alert('Tournament Ended', 'The Scramble tournament has officially concluded!');
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to end tournament.');
    }
  };

  const handleSaveScore = async (scoreA: number, scoreB: number) => {
    if (!activeMatchForScore) return;
    if (activeMatchForScore.status === 'completed') {
      await correctResult({
        matchId: activeMatchForScore.id,
        payload: { score_a: scoreA, score_b: scoreB },
      });
    } else {
      await recordResult({
        matchId: activeMatchForScore.id,
        payload: { score_a: scoreA, score_b: scoreB },
      });
    }
    setScoreModalVisible(false);
    setActiveMatchForScore(null);
  };

  const handleOpenScoreModal = (match: Match) => {
    setActiveMatchForScore(match);
    setScoreModalVisible(true);
  };

  const handlePublishTournament = async () => {
    try {
      await openRegistration();
      void refetchTournament();
      Alert.alert(
        'Tournament Published!',
        `"${tournament?.name ?? 'Tournament'}" is now live and open for registration! Players can discover and register for it.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to publish tournament';
      Alert.alert('Error', msg);
    }
  };

  const validMatches = useMemo(() => {
    const planned = state?.planned_rounds ?? 3;
    return matches.filter((m) => {
      const r = m.round_number ?? m.round;
      return !r || r <= planned;
    });
  }, [matches, state?.planned_rounds]);

  const navTabs = useMemo(() => {
    return getTournamentNavigationTabs(tournament, {
      participantsCount: state?.registered_players_count ?? registrations.length,
      roundsCount: state?.planned_rounds ?? state?.current_round,
      matchesCount: validMatches.length,
    });
  }, [tournament, state?.registered_players_count, registrations.length, state?.planned_rounds, state?.current_round, validMatches.length]);

  const primaryAction = useMemo(() => {
    if (!canManage) return null;
    if (tournament?.status === 'completed' || state?.tournament_status === 'completed') {
      return {
        label: 'View Results',
        onPress: () => setActiveTab('results'),
      };
    }
    if (tournament?.status === 'draft') {
      return {
        label: 'Publish Tournament',
        onPress: handlePublishTournament,
        isLoading: isOpenRegistrationPending,
      };
    }
    if (tournament?.status === 'registration_open') {
      return {
        label: 'Close Registration',
        onPress: handleCloseRegistration,
        isLoading: isCloseRegistrationPending,
        variant: 'secondary' as const,
      };
    }
    if (tournament?.status === 'registration_closed' && (!validMatches.length || state?.round_status === 'setup')) {
      return {
        label: 'Start Tournament',
        onPress: handleStartTournament,
        isLoading: isStartingTournament,
      };
    }

    const currentRound = state?.current_round ?? 1;
    const plannedRounds = state?.planned_rounds ?? 3;
    const isFinalRound = currentRound >= plannedRounds;

    const currentRoundMatches = validMatches.filter(
      (m) => ((m.round_number ?? m.round) ?? 1) === currentRound
    );
    const roundHasMatches = currentRoundMatches.length > 0;
    const roundAllCompleted = roundHasMatches && currentRoundMatches.every((m) => m.status === 'completed');

    const totalGames = state?.expected_total_games ?? (validMatches.length || 1);
    const playedGames = validMatches.filter((m) => m.status === 'completed').length;
    const allMatchesCompleted = validMatches.length > 0 && validMatches.every((m) => m.status === 'completed');

    const isTournamentFullyPlayed =
      (isFinalRound && roundAllCompleted) ||
      (allMatchesCompleted && playedGames >= totalGames);

    if (isTournamentFullyPlayed) {
      return {
        label: 'End Tournament & View Results',
        onPress: () => {
          setActiveTab('results');
          setEndTournamentModalVisible(true);
        },
        isLoading: isEndingTournament,
      };
    }

    if (!roundHasMatches) {
      if ((state?.available_players_count ?? 0) >= 4) {
        return {
          label: currentRound > 1 ? `Create Round ${currentRound} Matchups` : 'Create Round Matchups',
          onPress: handleCreateMatchups,
          isLoading: isCreatingMatchups,
        };
      }
    } else {
      if (roundAllCompleted) {
        if (!isFinalRound) {
          return {
            label: `Start Round ${currentRound + 1}`,
            onPress: handleStartNextRound,
            isLoading: isStartingNextRound,
          };
        } else {
          return {
            label: 'End Tournament & View Results',
            onPress: () => {
              setActiveTab('results');
              setEndTournamentModalVisible(true);
            },
            isLoading: isEndingTournament,
          };
        }
      }

      const anyMatchStarted = currentRoundMatches.some(
        (m) => m.status === 'in_progress' || m.status === 'completed'
      );
      if (state?.round_status === 'matchups_created' && !anyMatchStarted) {
        return {
          label: `Start Round ${currentRound}`,
          onPress: handleStartRound,
          isLoading: isStartingRound,
        };
      }

      return {
        label: 'Enter Scores',
        onPress: () => setActiveTab('rounds'),
      };
    }

    return null;
  }, [
    canManage,
    tournament?.status,
    state?.tournament_status,
    state?.round_status,
    state?.available_players_count,
    state?.current_round,
    state?.planned_rounds,
    state?.expected_total_games,
    validMatches,
    isOpenRegistrationPending,
    isCloseRegistrationPending,
    isStartingTournament,
    isCreatingMatchups,
    isStartingRound,
    isStartingNextRound,
    isEndingTournament,
    handlePublishTournament,
    handleCloseRegistration,
    handleStartTournament,
    handleCreateMatchups,
    handleStartRound,
    handleStartNextRound,
  ]);

  // ─── Loading & Error States ──────────────────────────────────────────────

  const isInitialLoading =
    isLoadingTournament || isLoadingState || (isLoadingRegs && !registrations.length);

  if (isInitialLoading && !refreshing) {
    return (
      <Screen>
        <LoadingState message="Loading Scramble workspace..." />
      </Screen>
    );
  }

  const generalError = tournamentError || stateError || matchesError || standingsError;
  if (generalError && !state && !tournament) {
    return (
      <Screen>
        <ErrorState
          title="Could not load Scramble workspace"
          message={generalError.message}
          onRetry={handleRefresh}
        />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      {/* Standardized Header */}
      <TournamentManagementHeader
        tournament={tournament ?? null}
        tabs={navTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        canManage={canManage}
        onBack={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/(club)/tournaments');
          }
        }}
        onOptionsPress={handleOpenOptionsMenu}
        primaryAction={primaryAction}
      />

      {/* Draft Mode Notice Banner */}
      {tournament?.status === 'draft' && (
        <DraftTournamentBanner
          tournamentName={tournament?.name}
          onPublish={handlePublishTournament}
          isPublishing={isOpenRegistrationPending}
        />
      )}

      {/* Registration Open Action Banner */}
      {tournament?.status === 'registration_open' && (
        <RegistrationOpenBanner
          tournamentName={tournament?.name}
          participantCount={registrations.length}
          maxParticipants={tournament?.max_participants}
          onCloseRegistration={handleCloseRegistration}
          isClosing={isCloseRegistrationPending}
        />
      )}

      {/* Tab Content with Pull to Refresh */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.brand.primary}
          />
        }
      >
        {activeTab === 'overview' && (
          <ScrambleOverviewTab
            state={state}
            tournament={tournament}
            canManage={canManage}
            onNavigateTab={(tab) => setActiveTab(tab as any)}
            onStartRound={handleStartRound}
            onFinishRound={handleFinishRound}
            onStartNextRound={handleStartNextRound}
            onSetPlannedRounds={setPlannedRounds}
            onEndTournament={() => setEndTournamentModalVisible(true)}
            onCloseRegistration={handleCloseRegistration}
            isClosingRegistration={isCloseRegistrationPending}
            isStartingRound={isStartingRound}
            isFinishingRound={isFinishingRound}
            isStartingNextRound={isStartingNextRound}
            isSettingPlannedRounds={isSettingPlannedRounds}
            isEndingTournament={isEndingTournament}
          />
        )}

        {(activeTab === 'participants' || (activeTab as string) === 'players') && (
          <ScramblePlayersTab
            state={state}
            registrations={registrations}
            tournament={tournament}
            canManage={canManage}
            onSaveAvailability={handleSaveAvailability}
            onCreateMatchups={handleCreateMatchups}
            onCloseRegistration={handleCloseRegistration}
            isClosingRegistration={isCloseRegistrationPending}
            isSavingAvailability={isSettingAvailability}
            isCreatingMatchups={isCreatingMatchups}
          />
        )}

        {activeTab === 'rounds' && (
          <ScrambleRoundsTab
            state={state}
            matches={validMatches}
            canManage={canManage}
            onOpenScoreModal={handleOpenScoreModal}
            onStartRound={handleStartRound}
            onFinishRound={handleFinishRound}
            onStartNextRound={handleStartNextRound}
            onCreateMatchups={handleCreateMatchups}
            onEndTournament={() => setEndTournamentModalVisible(true)}
            isStartingRound={isStartingRound}
            isFinishingRound={isFinishingRound}
            isStartingNextRound={isStartingNextRound}
            isCreatingMatchups={isCreatingMatchups}
          />
        )}

        {activeTab === 'standings' && (
          <ScrambleStandingsTab
            state={state}
            standings={standings}
            isLoading={isLoadingStandings}
          />
        )}

        {activeTab === 'results' && (
          <ScrambleResultsTab
            state={state}
            matches={validMatches}
            standings={standings || []}
            canManage={canManage}
            onOpenScoreModal={handleOpenScoreModal}
            onNavigateTab={(tab) => setActiveTab(tab as any)}
            onEndTournament={() => setEndTournamentModalVisible(true)}
            isEndingTournament={isEndingTournament}
          />
        )}

        {activeTab === 'settings' && (
          <TournamentSettingsTab
            tournament={tournament ?? null}
          />
        )}
      </ScrollView>

      {/* Score Modal */}
      <ScrambleScoreModal
        visible={scoreModalVisible}
        onClose={() => {
          setScoreModalVisible(false);
          setActiveMatchForScore(null);
        }}
        match={activeMatchForScore}
        onSave={handleSaveScore}
        isSaving={isRecordingResult || isCorrectingResult}
        targetPoints={
          (tournament?.format_configuration as any)?.scoring_rules?.target_score ??
          tournament?.scoring_rules?.target_score ??
          (tournament?.format_configuration as any)?.points_to_win ??
          11
        }
        winBy={
          (tournament?.format_configuration as any)?.scoring_rules?.win_by ??
          tournament?.scoring_rules?.win_by ??
          (tournament?.format_configuration as any)?.win_by ??
          2
        }
      />

      {/* End Tournament Modal */}
      <ScrambleEndTournamentModal
        visible={endTournamentModalVisible}
        onClose={() => setEndTournamentModalVisible(false)}
        state={state}
        onConfirm={handleEndTournament}
        isEnding={isEndingTournament}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F3FAF5',
  },
  scrollContent: {
    flexGrow: 1,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
});
