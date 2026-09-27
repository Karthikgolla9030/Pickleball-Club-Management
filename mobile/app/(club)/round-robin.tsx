/**
 * Aught2 Pickleball — Round Robin Tournament Workspace Screen
 *
 * Dedicated Round Robin Workspace matching exact 5-screen reference:
 * - Header: TOURNAMENT MODE badge, counts, Live Standings pill, 5-tab selector
 * - Tab 1: Players (Singles / Doubles format info, registered player entries, Add Player flow)
 * - Tab 2: Matchups (3-column summary, empty state with disabled/enabled Generate button, grouped matches, score modal)
 * - Tab 3: Live Standings (Live completion progress, empty trophy state, calculated rankings, official 4-level tiebreaker order)
 * - Tab 4: Results (Completed matches grouped by round, winner highlight, score lines)
 * - Tab 5: Settings (Format & Structure, Official Scoring Rules, Standings Tiebreakers)
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  AppHeader,
  RoundRobinAddTeamModal,
  RoundRobinMatchupsTab,
  RoundRobinOverviewTab,
  RoundRobinResultsTab,
  RoundRobinScoreModal,
  RoundRobinStandingsTab,
  RoundRobinTeamsTab,
  TournamentManagementHeader,
  TournamentSettingsTab,
  Screen,
  LoadingState,
  ErrorState,
  DraftTournamentBanner,
  RegistrationOpenBanner,
} from '@/components';
import {
  useActiveClub,
  useClubCourts,
  useMatches,
  usePermission,
  useStandings,
  useTeams,
  useTournamentDetails,
  useTournamentRegistrations,
} from '@/hooks';
import { getTournamentNavigationTabs, type TournamentTabKey } from '@/navigation';
import { Spacing } from '@/theme';
import type { CreateTeamPayload, Match } from '@/types';
import {
  calculateExpectedRoundRobinSchedule,
  calculateRoundRobinProgress,
} from '@/utils/roundRobinLogic';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';

export default function RoundRobinWorkspaceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tournamentId?: string }>();
  const tournamentId = params.tournamentId ?? null;

  const { clubId } = useActiveClub();
  const { isOwner, isManager, isTournamentDirector, canManageTournaments } = usePermission();
  const canManage = isOwner || isManager || isTournamentDirector || canManageTournaments;

  // Active Sub-Tab State — defaults to 'overview'
  const [activeTab, setActiveTab] = useState<TournamentTabKey>('overview');

  // Modals State
  const [scoreModalVisible, setScoreModalVisible] = useState(false);
  const [activeMatchForScore, setActiveMatchForScore] = useState<Match | null>(null);
  const [addTeamModalVisible, setAddTeamModalVisible] = useState(false);

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
  } = useTournamentDetails(clubId, tournamentId);

  const {
    registrations,
    isLoading: isLoadingRegs,
    refetch: refetchRegs,
  } = useTournamentRegistrations(clubId, tournamentId);

  const {
    teams,
    isLoading: isLoadingTeams,
    createTeam,
    isCreatingTeam,
    deleteTeam,
    isDeletingTeam,
    refetch: refetchTeams,
  } = useTeams(clubId, tournamentId);

  const {
    matches,
    isLoading: isLoadingMatches,
    generateRoundRobin,
    isGenerating,
    regenerateRoundRobin,
    isRegenerating,
    startMatch,
    isStartingMatch,
    recordResult,
    isRecordingResult,
    correctResult,
    isCorrectingResult,
    refetch: refetchMatches,
  } = useMatches(clubId, tournamentId);

  const {
    standings,
    isLoading: isLoadingStandings,
    refetch: refetchStandings,
  } = useStandings(clubId, tournamentId);

  const {
    courts,
    isLoading: isLoadingCourts,
    refetch: refetchCourts,
  } = useClubCourts(clubId);

  // ─── Derived Calculations ────────────────────────────────────────────────
  const schedulePreview = useMemo(
    () => calculateExpectedRoundRobinSchedule(teams.length),
    [teams.length]
  );

  const progress = useMemo(
    () => calculateRoundRobinProgress(matches, standings),
    [matches, standings]
  );

  const totalRounds = useMemo(() => {
    if (matches.length > 0) {
      const maxRound = Math.max(...matches.map((m) => m.round_number ?? 1), 1);
      return maxRound;
    }
    return schedulePreview.totalRounds;
  }, [matches, schedulePreview.totalRounds]);

  const canModifyTeams =
    tournament?.status === 'registration_closed' && matches.length === 0;

  const canGenerate =
    canManage &&
    tournament?.status === 'registration_closed' &&
    matches.length === 0 &&
    teams.length >= 2;

  const canRegenerate =
    canManage &&
    matches.length > 0 &&
    progress.completedMatches === 0 &&
    tournament?.status !== 'completed' &&
    tournament?.status !== 'cancelled';

  // Set of player membership IDs already in teams
  const usedPlayerMembershipIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of teams) {
      for (const m of t.members) {
        ids.add(m.player_membership_id);
      }
    }
    return ids;
  }, [teams]);

  // Refresh All Handler
  const handleRefreshAll = () => {
    void refetchTournament();
    void refetchRegs();
    void refetchTeams();
    void refetchMatches();
    void refetchStandings();
    void refetchCourts();
  };

  const isRefreshing =
    isLoadingTournament ||
    isLoadingRegs ||
    isLoadingTeams ||
    isLoadingMatches ||
    isLoadingStandings ||
    isLoadingCourts;

  // ─── Action Handlers ─────────────────────────────────────────────────────

  const handleGenerateMatchups = async () => {
    try {
      await generateRoundRobin();
      setActiveTab('matchups');
      Alert.alert(
        'Matchups Generated!',
        `Generated ${schedulePreview.totalMatches} matches across ${schedulePreview.totalRounds} rounds.`
      );
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Generation failed');
    }
  };

  const handleRegenerateMatchups = () => {
    Alert.alert(
      'Regenerate Matchups',
      'Are you sure you want to rebuild the entire Round Robin schedule? Existing unplayed matchups will be recreated.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: async () => {
            try {
              await regenerateRoundRobin();
              Alert.alert('Success', 'Matchups regenerated deterministically.');
            } catch (err: unknown) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Regeneration failed');
            }
          },
        },
      ]
    );
  };

  const handleOpenScoreModal = (match: Match) => {
    setActiveMatchForScore(match);
    setScoreModalVisible(true);
  };

  const handleSaveScore = async (scoreA: number, scoreB: number) => {
    if (!activeMatchForScore) return;

    try {
      if (activeMatchForScore.status === 'completed') {
        await correctResult({
          matchId: activeMatchForScore.id,
          payload: { score_a: scoreA, score_b: scoreB },
        });
        Alert.alert('Score Updated', 'Match result corrected successfully.');
      } else {
        await recordResult({
          matchId: activeMatchForScore.id,
          payload: { score_a: scoreA, score_b: scoreB },
        });
        Alert.alert('Score Recorded', 'Match result saved and standings updated.');
      }
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to record score');
      throw err;
    }
  };

  const handleCreateTeam = async (payload: CreateTeamPayload) => {
    await createTeam(payload);
    Alert.alert('Player Added', `Entry "${payload.name}" has been successfully added.`);
  };

  const handleDeleteTeam = async (teamId: string, teamName: string) => {
    try {
      await deleteTeam(teamId);
      Alert.alert('Entry Removed', `"${teamName}" removed.`);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete entry');
    }
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

  const handleCloseRegistration = async (): Promise<void> => {
    return new Promise<void>((resolve) => {
      Alert.alert(
        'Close Registration?',
        `Closing registration for "${tournament?.name ?? 'this tournament'}" will:\n\n• Prevent any new player registrations or withdrawals\n• Finalize participant rosters and assign seeds\n• Enable Round Robin matchup generation`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
          {
            text: 'Close Registration',
            style: 'destructive',
            onPress: async () => {
              try {
                await closeRegistration();
                void refetchTournament();
                void refetchMatches();
                void refetchTeams();
                Alert.alert(
                  'Registration Closed',
                  'Registration has been closed. You can now generate the Round Robin matchups.'
                );
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

  const handleStartMatch = async (matchId: string) => {
    try {
      await startMatch(matchId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start match';
      Alert.alert('Error', msg);
    }
  };

  const handleOpenOptionsMenu = () => {
    const isDraft = tournament?.status === 'draft';
    const isRegOpen = tournament?.status === 'registration_open';
    const isRegClosed = tournament?.status === 'registration_closed';
    const buttons: { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[] = [];

    if (isDraft) {
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

    if (isRegClosed && matches.length === 0 && canManage) {
      buttons.push({
        text: 'Reopen Registration',
        onPress: handlePublishTournament,
      });
    }

    if (canRegenerate) {
      buttons.push({
        text: 'Regenerate Matchups',
        onPress: handleGenerateMatchups,
      });
    }

    buttons.push(
      {
        text: 'Refresh Data',
        onPress: handleRefreshAll,
      },
      {
        text: 'View Settings',
        onPress: () => setActiveTab('settings'),
      },
      {
        text: 'Back to Tournaments',
        onPress: () => router.back(),
      },
      { text: 'Cancel', style: 'cancel' }
    );

    Alert.alert(
      tournament?.name ?? 'Round Robin Tournament',
      `Status: ${tournament?.status_label ?? tournament?.status ?? ''}`,
      buttons
    );
  };

  const tournamentConfig = parseTournamentConfig(tournament);
  const teamSize = tournamentConfig.teamSize;
  const isSingles = teamSize === 1;
  const totalRegisteredPlayers =
    tournament?.participant_count ?? (teamSize > 1 ? teams.length * teamSize : teams.length);

  const navTabs = useMemo(() => {
    return getTournamentNavigationTabs(tournament, {
      participantsCount: isSingles ? totalRegisteredPlayers : teams.length,
      teamsCount: teams.length,
      matchesCount: matches.length,
      roundsCount: totalRounds,
    });
  }, [tournament, isSingles, totalRegisteredPlayers, teams.length, matches.length, totalRounds]);

  const primaryAction = useMemo(() => {
    if (!canManage) return null;
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
    if (tournament?.status === 'completed') {
      return {
        label: 'View Results',
        onPress: () => setActiveTab('results'),
      };
    }
    const remaining = Math.max(0, progress.totalMatches - progress.completedMatches);
    if (canGenerate) {
      return {
        label: 'Generate Matchups',
        onPress: handleGenerateMatchups,
        isLoading: isGenerating,
      };
    }
    if (matches.length > 0 && remaining > 0) {
      return {
        label: 'Enter Scores',
        onPress: () => setActiveTab('matchups'),
      };
    }
    return null;
  }, [
    canManage,
    tournament?.status,
    isOpenRegistrationPending,
    isCloseRegistrationPending,
    canGenerate,
    isGenerating,
    matches.length,
    progress.totalMatches,
    progress.completedMatches,
    handleCloseRegistration,
    handleGenerateMatchups,
    handlePublishTournament,
  ]);

  // ─── Loading / Error States ──────────────────────────────────────────────
  if (isLoadingTournament && !tournament) {
    return (
      <Screen safeArea={false}>
        <AppHeader title="Round Robin Tournament" showBack />
        <LoadingState message="Loading tournament workspace..." />
      </Screen>
    );
  }

  if (tournamentError && !tournament) {
    return (
      <Screen safeArea={false}>
        <AppHeader title="Round Robin Tournament" showBack />
        <ErrorState
          title="Failed to load tournament"
          message={tournamentError.message}
          onRetry={handleRefreshAll}
        />
      </Screen>
    );
  }

  return (
    <Screen safeArea={false} style={styles.screen}>
      <View style={styles.responsiveContainer}>
        {/* Standardized Format & Category-Aware Header */}
        <TournamentManagementHeader
          tournament={tournament ?? null}
          tabs={navTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onBack={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(club)/tournaments');
            }
          }}
          onOptionsPress={handleOpenOptionsMenu}
          canManage={canManage}
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
            participantCount={totalRegisteredPlayers}
            maxParticipants={tournament?.max_participants}
            onCloseRegistration={handleCloseRegistration}
            isClosing={isCloseRegistrationPending}
          />
        )}

        {/* Tab Content ScrollView */}
        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.contentContainer}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefreshAll}
              tintColor="#087A60"
            />
          }
        >
          {activeTab === 'overview' && (
            <RoundRobinOverviewTab
              tournament={tournament!}
              matches={matches}
              progress={progress}
              onNavigateTab={(tab) => setActiveTab(tab as TournamentTabKey)}
              teamSize={teamSize}
              participantsCount={isSingles ? totalRegisteredPlayers : teams.length}
            />
          )}

          {(activeTab === 'participants' || (activeTab as string) === 'players' || (activeTab as string) === 'teams') && (
            <RoundRobinTeamsTab
              tournament={tournament}
              teams={teams}
              matchesExist={matches.length > 0}
              canModifyTeams={canModifyTeams}
              onAddTeamPress={() => setAddTeamModalVisible(true)}
              onDeleteTeam={handleDeleteTeam}
              isDeletingTeam={isDeletingTeam}
              teamSize={teamSize}
            />
          )}

          {activeTab === 'matchups' && (
            <RoundRobinMatchupsTab
              tournament={tournament}
              matches={matches}
              teams={teams}
              courts={courts}
              canManage={canManage}
              canGenerate={canGenerate}
              isGenerating={isGenerating}
              onGenerate={handleGenerateMatchups}
              onOpenScoreModal={handleOpenScoreModal}
              onRegenerate={handleRegenerateMatchups}
              isRegenerating={isRegenerating}
              onCloseRegistration={handleCloseRegistration}
              isClosingRegistration={isCloseRegistrationPending}
              onStartMatch={handleStartMatch}
              isStartingMatch={isStartingMatch}
              teamSize={teamSize}
            />
          )}

          {activeTab === 'standings' && (
            <RoundRobinStandingsTab
              standings={standings}
              progress={progress}
              teams={teams}
              teamSize={teamSize}
            />
          )}

          {activeTab === 'results' && (
            <RoundRobinResultsTab
              tournament={tournament}
              standings={standings}
              teams={teams}
              matches={matches}
              courts={courts}
              canManage={canManage}
              onEditScore={handleOpenScoreModal}
            />
          )}

          {activeTab === 'settings' && (
            <TournamentSettingsTab
              tournament={tournament ?? null}
            />
          )}
        </ScrollView>

        {/* Modals */}
        <RoundRobinScoreModal
          visible={scoreModalVisible}
          onClose={() => {
            setScoreModalVisible(false);
            setActiveMatchForScore(null);
          }}
          match={activeMatchForScore}
          onSave={handleSaveScore}
          isSaving={isRecordingResult || isCorrectingResult}
        />

        <RoundRobinAddTeamModal
          visible={addTeamModalVisible}
          onClose={() => setAddTeamModalVisible(false)}
          nextTeamIndex={teams.length + 1}
          registrations={registrations}
          usedPlayerMembershipIds={usedPlayerMembershipIds}
          onCreateTeam={handleCreateTeam}
          isCreating={isCreatingTeam}
          teamSize={teamSize}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F1F8F3',
  },
  responsiveContainer: {
    flex: 1,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: '#F1F8F3',
  },
  appHeader: {
    backgroundColor: '#F1F8F3',
    borderBottomWidth: 0,
  },
  optionsBtn: {
    padding: 6,
  },
  contentScroll: {
    flex: 1,
    backgroundColor: '#F1F8F3',
  },
  contentContainer: {
    paddingBottom: Spacing[10],
  },
});
