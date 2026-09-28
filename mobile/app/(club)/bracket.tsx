/**
 * Aught2 Pickleball — Bracket Workspace Screen
 *
 * Route: /(club)/bracket?tournamentId=...
 *
 * Comprehensive tournament mode workspace for single-elimination Bracket tournaments:
 * - Real-time synchronization with FastAPI backend (the authoritative source of truth)
 * - 5 Sub-tabs: Overview, Teams, Bracket, Matches, Results
 * - Interactive score recording & score correction with pickleball validation
 * - Fixed partner team registration and roster locks
 * - Deterministic power-of-two pairings and BYE propagation
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
  BracketOverviewTab,
  BracketTeamsTab,
  BracketViewTab,
  BracketMatchesTab,
  BracketStandingsTab,
  BracketResultsTab,
  BracketScoreModal,
  BracketAddTeamModal,
} from '@/components/bracket';

import {
  useActiveClub,
  useBracket,
  useClubCourts,
  usePermission,
  useStandings,
  useTeams,
  useTournamentDetails,
  useTournamentRegistrations,
} from '@/hooks';
import { getTournamentNavigationTabs, type TournamentTabKey } from '@/navigation';

import type { CreateTeamPayload, Match } from '@/types';
import { calculateBracketProgress } from '@/utils/bracketLogic';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';

export default function BracketWorkspaceScreen() {
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
    startTournament,
    isStartingTournament,
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
    isLoadingMatches,
    summary,
    isLoadingSummary,
    generateBracket,
    isGenerating,
    regenerateBracket,
    startMatch,
    isStartingMatch,
    recordResult,
    isRecordingResult,
    correctResult,
    isCorrectingResult,
    refetchMatches,
    refetchSummary,
  } = useBracket(clubId, tournamentId);

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
  const progress = useMemo(
    () => calculateBracketProgress(matches, summary),
    [matches, summary]
  );

  const isTournamentCompleted =
    tournament?.status === 'completed' || progress.isFinished;

  const canModifyTeams =
    matches.length === 0 &&
    tournament?.status !== 'in_progress' &&
    tournament?.status !== 'completed';

  const canGenerate =
    tournament?.status === 'registration_closed' &&
    matches.length === 0 &&
    teams.length >= 2;

  // Can regenerate if matches exist and no real non-bye matches have been played
  const realCompletedCount = useMemo(
    () =>
      matches.filter(
        (m) =>
          m.status === 'completed' &&
          m.score_a !== null &&
          m.score_b !== null
      ).length,
    [matches]
  );
  const canRegenerate = matches.length > 0 && realCompletedCount === 0;

  // Track players currently assigned to any team
  const usedPlayerMembershipIds = useMemo(() => {
    const ids = new Set<string>();
    for (const team of teams) {
      for (const member of team.members) {
        if (member.player_membership_id) {
          ids.add(member.player_membership_id);
        }
      }
    }
    return ids;
  }, [teams]);

  // ─── Refresh All ─────────────────────────────────────────────────────────
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchTournament(),
        refetchRegs(),
        refetchTeams(),
        refetchMatches(),
        refetchSummary(),
        refetchStandings(),
        refetchCourts(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  // ─── Handlers ────────────────────────────────────────────────────────────
  const handleGenerateBracket = async () => {
    try {
      const res = await generateBracket();
      Alert.alert(
        'Bracket Generated!',
        `Created ${res.matches_generated} match slots across ${res.rounds_count} rounds (${res.byes_count} BYEs).`
      );
      setActiveTab('bracket');
      await handleRefreshAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate bracket';
      Alert.alert('Generation Error', msg);
    }
  };

  const handleRegenerateBracket = () => {
    Alert.alert(
      'Regenerate Bracket',
      'Are you sure you want to regenerate the bracket from scratch? Current match pairings will be recreated.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await regenerateBracket();
              Alert.alert('Bracket Regenerated', res.message);
              await handleRefreshAll();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to regenerate bracket';
              Alert.alert('Regeneration Error', msg);
            }
          },
        },
      ]
    );
  };

  const handleCloseRegistration = () => {
    Alert.alert(
      'Close Registration?',
      `Closing registration for "${tournament?.name ?? 'this tournament'}" will:\n\n• Prevent any new player registrations or withdrawals\n• Finalize participant rosters and assign seeds by skill rating\n• Enable Bracket generation and court assignment`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close Registration',
          style: 'destructive',
          onPress: async () => {
            try {
              await closeRegistration();
              await handleRefreshAll();
              Alert.alert(
                'Registration Closed',
                'Participants finalized and seeded by skill rating! You can now generate the bracket.'
              );
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to close registration';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
  };

  const handleReopenRegistration = () => {
    Alert.alert(
      'Reopen Registration',
      'Are you sure you want to reopen registration for players to join?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reopen',
          style: 'default',
          onPress: async () => {
            try {
              await openRegistration();
              await handleRefreshAll();
              Alert.alert('Registration Reopened', 'Players can now register.');
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to reopen registration';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
  };

  const handleStartTournament = () => {
    Alert.alert(
      'Start Tournament',
      'Mark this tournament as live (In Progress)? Players will see live match updates.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Now',
          style: 'default',
          onPress: async () => {
            try {
              await startTournament();
              await handleRefreshAll();
              Alert.alert('Tournament Started!', 'The tournament is now live.');
            } catch (err: unknown) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to start tournament');
            }
          },
        },
      ]
    );
  };

  const handleStartMatch = async (matchId: string) => {
    try {
      await startMatch(matchId);
      await refetchMatches();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start match';
      Alert.alert('Error', msg);
    }
  };

  const handleCreateTeam = async (payload: CreateTeamPayload) => {
    await createTeam(payload);
    await refetchTeams();
    Alert.alert('Team Created', `Added "${payload.name}" to tournament.`);
  };

  const handleDeleteTeam = async (teamId: string) => {
    try {
      await deleteTeam(teamId);
      await refetchTeams();
      Alert.alert('Team Removed', 'The team has been deleted.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete team';
      Alert.alert('Error', msg);
    }
  };

  const handleOpenScoreModal = (match: Match) => {
    setActiveMatchForScore(match);
    setScoreModalVisible(true);
  };

  const handleSaveScore = async (scoreA: number, scoreB: number) => {
    if (!activeMatchForScore) return;
    const isEditing = activeMatchForScore.status === 'completed';

    if (isEditing) {
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

    await Promise.all([refetchMatches(), refetchSummary(), refetchStandings(), refetchTournament()]);
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

  const handleOpenOptionsMenu = () => {
    const isDraft = tournament?.status === 'draft';
    const isRegOpen = tournament?.status === 'registration_open';
    const isRegClosed = tournament?.status === 'registration_closed';
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

    if (isRegClosed && matches.length === 0 && canManage) {
      buttons.push({
        text: 'Reopen Registration',
        onPress: handleReopenRegistration,
      });
    }

    if (isRegClosed && matches.length > 0 && canManage) {
      buttons.push({
        text: 'Start Tournament (Go Live)',
        onPress: handleStartTournament,
      });
    }

    if (canRegenerate && canManage) {
      buttons.push({
        text: 'Regenerate Bracket',
        onPress: handleRegenerateBracket,
        style: 'destructive',
      });
    }

    buttons.push(
      {
        text: 'Refresh Data',
        onPress: handleRefreshAll,
      },
      {
        text: 'Tournament Settings',
        onPress: () => setActiveTab('settings'),
      },
      {
        text: 'Back to Tournaments',
        onPress: () => router.back(),
      },
      { text: 'Cancel', style: 'cancel' }
    );

    Alert.alert(
      tournament?.name ?? 'Bracket Tournament',
      `Status: ${tournament?.status_label ?? tournament?.status ?? ''}`,
      buttons
    );
  };

  const tournamentConfig = parseTournamentConfig(tournament);
  const teamSize = tournamentConfig.teamSize;
  const isSingles = teamSize === 1;

  const navTabs = useMemo(() => {
    return getTournamentNavigationTabs(tournament, {
      participantsCount: isSingles ? tournament?.participant_count ?? teams.length : teams.length,
      teamsCount: teams.length,
      matchesCount: matches.length,
    });
  }, [tournament, isSingles, teams.length, matches.length]);

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
    if (canGenerate) {
      return {
        label: 'Generate Bracket',
        onPress: handleGenerateBracket,
        isLoading: isGenerating,
      };
    }
    if (tournament?.status === 'registration_closed' && matches.length > 0 && progress.remainingMatches > 0) {
      return {
        label: 'Start Tournament',
        onPress: handleStartTournament,
        isLoading: isStartingTournament,
      };
    }
    if (matches.length > 0 && progress.remainingMatches > 0) {
      return {
        label: 'Enter Scores',
        onPress: () => setActiveTab('matches'),
      };
    }
    if (matches.length > 0 && progress.remainingMatches === 0) {
      return {
        label: 'View Results',
        onPress: () => setActiveTab('results'),
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
    isStartingTournament,
    matches.length,
    progress.remainingMatches,
    handlePublishTournament,
    handleCloseRegistration,
    handleGenerateBracket,
    handleStartTournament,
  ]);

  // ─── Loading & Error Views ───────────────────────────────────────────────
  const isLoading =
    isLoadingTournament ||
    isLoadingRegs ||
    isLoadingTeams ||
    isLoadingMatches ||
    isLoadingSummary ||
    isLoadingCourts;

  if (isLoading && !tournament) {
    return (
      <Screen scrollable={false}>
        <LoadingState message="Loading Bracket tournament..." />
      </Screen>
    );
  }

  if (tournamentError || !tournament) {
    return (
      <Screen scrollable={false}>
        <ErrorState
          message={tournamentError?.message ?? 'Tournament not found'}
          onRetry={handleRefreshAll}
        />
      </Screen>
    );
  }

  return (
    <Screen scrollable={false} style={styles.screen}>
      {/* Standardized Header */}
      <TournamentManagementHeader
        tournament={tournament}
        tabs={navTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onBack={() => router.back()}
        onOptionsPress={handleOpenOptionsMenu}
        canManage={canManage}
        primaryAction={primaryAction}
      />

      {/* Draft Mode Notice Banner */}
      {tournament.status === 'draft' && (
        <DraftTournamentBanner
          tournamentName={tournament.name}
          onPublish={handlePublishTournament}
          isPublishing={isOpenRegistrationPending}
        />
      )}

      {/* Registration Open Action Banner */}
      {tournament.status === 'registration_open' && (
        <RegistrationOpenBanner
          tournamentName={tournament.name}
          participantCount={tournament.participant_count ?? (teamSize > 1 ? teams.length * teamSize : teams.length)}
          maxParticipants={tournament.max_participants}
          onCloseRegistration={handleCloseRegistration}
          isClosing={isCloseRegistrationPending}
        />
      )}

      {/* Main Tab Content */}
      <ScrollView
        style={styles.tabContent}
        contentContainerStyle={styles.tabContentContainer}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefreshAll} />
        }
      >
        {activeTab === 'overview' && (
          <BracketOverviewTab
            tournament={tournament}
            summary={summary}
            matches={matches}
            progress={progress}
            onNavigateTab={(tab) => setActiveTab(tab as any)}
          />
        )}

        {(activeTab === 'participants' || (activeTab as string) === 'players' || (activeTab as string) === 'teams') && (
          <BracketTeamsTab
            teams={teams}
            canManage={canManage}
            canModifyTeams={canModifyTeams}
            onOpenAddTeam={() => setAddTeamModalVisible(true)}
            onDeleteTeam={handleDeleteTeam}
            isDeletingTeam={isDeletingTeam}
            teamSize={teamSize}
            matchesCount={matches.length}
            status={tournament.status}
          />
        )}

        {activeTab === 'bracket' && (
          <BracketViewTab
            matches={matches}
            courts={courts}
            canManage={canManage}
            canGenerate={canGenerate}
            isGenerating={isGenerating}
            status={tournament.status}
            teamsCount={teams.length}
            onGenerateBracket={handleGenerateBracket}
            onCloseRegistration={handleCloseRegistration}
            isCloseRegistrationPending={isCloseRegistrationPending}
            onPublishTournament={handlePublishTournament}
            isPublishPending={isOpenRegistrationPending}
            onOpenScoreModal={handleOpenScoreModal}
            onStartMatch={handleStartMatch}
            isStartingMatch={isStartingMatch}
            isTournamentCompleted={isTournamentCompleted}
          />
        )}

        {activeTab === 'matches' && (
          <BracketMatchesTab
            matches={matches}
            courts={courts}
            canManage={canManage}
            onOpenScoreModal={handleOpenScoreModal}
            onStartMatch={handleStartMatch}
            isStartingMatch={isStartingMatch}
            isTournamentCompleted={isTournamentCompleted}
          />
        )}

        {activeTab === 'standings' && (
          <BracketStandingsTab
            standings={standings}
            isLoading={isLoadingStandings}
            onRefresh={handleRefreshAll}
            isRefreshing={isRefreshing}
          />
        )}

        {activeTab === 'results' && (
          <BracketResultsTab
            matches={matches}
            teams={teams}
            courts={courts}
            progress={progress}
            canManage={canManage}
            onEditScore={handleOpenScoreModal}
            isTournamentCompleted={isTournamentCompleted}
          />
        )}

        {activeTab === 'settings' && (
          <TournamentSettingsTab
            tournament={tournament}
          />
        )}
      </ScrollView>

      {/* Score Modal */}
      <BracketScoreModal
        visible={scoreModalVisible}
        onClose={() => {
          setScoreModalVisible(false);
          setActiveMatchForScore(null);
        }}
        match={activeMatchForScore}
        onSave={handleSaveScore}
        isSaving={isRecordingResult || isCorrectingResult}
      />

      {/* Add Team Modal */}
      <BracketAddTeamModal
        visible={addTeamModalVisible}
        onClose={() => setAddTeamModalVisible(false)}
        nextTeamIndex={teams.length + 1}
        registrations={registrations}
        usedPlayerMembershipIds={usedPlayerMembershipIds}
        onCreateTeam={handleCreateTeam}
        isCreating={isCreatingTeam}
        teamSize={teamSize}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F1F8F3',
  },
  tabContent: {
    flex: 1,
    backgroundColor: '#F1F8F3',
  },
  tabContentContainer: {
    paddingBottom: 40,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
});
