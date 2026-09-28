/**
 * Aught2 Pickleball — Tournament Details & Round Robin Competition Screen
 *
 * Provides club staff (Owner, Manager, Tournament Director) with:
 *   - Overview: Tournament metadata, status lifecycle transitions, registrations
 *   - Teams: Fixed-partner team formation (exactly 2 players), seed assignment, CRUD
 *   - Matches: Round Robin schedule generation, round-by-round view, score entry & correction
 *   - Standings: Live calculated standings table with tiebreaker rules
 *
 * Strictly scoped to the active club with server-side authorization enforcement.
 */

import React, { useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import {
  AppText,
  Badge,
  Button,
  Card,
  ChampionshipBracketView,
  EmptyState,
  ErrorState,
  FilterChips,
  Input,
  LoadingState,
  ModalSheet,
  PoolConfigureModal,
  PoolManualAssignModal,
  PoolStandingsTable,
  ScrambleStandingsTable,
  Screen,
  ScreenHeader,
  AppHeader,
  DraftTournamentBanner,
} from '@/components';
import {
  useActiveClub,
  useChampionship,
  useMatches,
  usePoolMatches,
  usePoolStandings,
  usePools,
  useScramble,
  useStandings,
  useTeams,
  useTournamentDetails,
  useTournamentRegistrations,
} from '@/hooks';
import { Colors, Radius, Spacing, Typography } from '@/theme';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';
import type {
  Match,
  MatchResultPayload,
  PoolConfigureRequest,
  StandingRow,
  Team,
} from '@/types';

type ActiveTab = 'overview' | 'teams' | 'matches' | 'standings' | 'pools' | 'championship' | 'participants';


export default function TournamentDetailsScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const { clubId } = useActiveClub();

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [selectedRound, setSelectedRound] = useState<number | 'all'>('all');
  const [selectedPoolId, setSelectedPoolId] = useState<string>('all');
  const [showConfigureModal, setShowConfigureModal] = useState(false);
  const [showManualAssignModal, setShowManualAssignModal] = useState(false);

  // Modal States
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamName, setTeamName] = useState('');
  const [teamSeed, setTeamSeed] = useState('');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [teamError, setTeamError] = useState<string | null>(null);

  const [showScoreModal, setShowScoreModal] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [scoreA, setScoreA] = useState('');
  const [scoreB, setScoreB] = useState('');
  const [scoreError, setScoreError] = useState<string | null>(null);

  // Queries
  const {
    tournament,
    isLoading: isLoadingTournament,
    error: tournamentError,
    refetch: refetchTournament,
    openRegistration,
    closeRegistration,
    cancelTournament,
    startTournament,
    isStartingTournament,
  } = useTournamentDetails(clubId, tournamentId ?? null);

  const {
    registrations,
    refetch: refetchRegs,
  } = useTournamentRegistrations(clubId, tournamentId ?? null);

  const {
    teams,
    isLoading: isLoadingTeams,
    refetch: refetchTeams,
    createTeam,
    updateTeam,
    deleteTeam,
    isCreatingTeam,
    isUpdatingTeam,
  } = useTeams(clubId, tournamentId ?? null);

  const {
    matches,
    isLoading: isLoadingMatches,
    refetch: refetchMatches,
    generateRoundRobin,
    isGenerating,
    regenerateRoundRobin,
    isRegenerating,
    recordResult,
    isRecordingResult,
    correctResult,
    isCorrectingResult,
  } = useMatches(clubId, tournamentId ?? null);

  const {
    standings,
    isLoading: isLoadingStandings,
    refetch: refetchStandings,
  } = useStandings(clubId, tournamentId ?? null);

  const isRoundRobin = tournament?.format === 'round_robin';
  const isPoolPlay = tournament?.format === 'pool_play';
  const isScramble = tournament?.format === 'scramble';
  const isBracket = tournament?.format === 'bracket';

  React.useEffect(() => {
    if (!tournament) return;
    if (tournament.format === 'scramble') {
      router.replace({ pathname: '/(club)/scramble' as never, params: { tournamentId: tournament.id } });
    } else if (tournament.format === 'bracket') {
      router.replace({ pathname: '/(club)/bracket' as never, params: { tournamentId: tournament.id } });
    } else if (tournament.format === 'pool_play') {
      router.replace({ pathname: '/(club)/pool-play' as never, params: { tournamentId: tournament.id } });
    } else if (tournament.format === 'round_robin') {
      router.replace({ pathname: '/(club)/round-robin' as never, params: { tournamentId: tournament.id } });
    }
  }, [tournament]);

  const tournamentConfig = parseTournamentConfig(tournament);
  const teamSize = tournamentConfig.teamSize;

  // Scramble Queries
  const {
    matches: scrambleMatches,
    isLoadingMatches: isLoadingScrambleMatches,
    refetchMatches: refetchScrambleMatches,
    standings: scrambleStandings,
    isLoadingStandings: isLoadingScrambleStandings,
    refetchStandings: refetchScrambleStandings,
    generateScramble,
    isGenerating: isGeneratingScramble,
    regenerateScramble,
    isRegenerating: isRegeneratingScramble,
    recordResult: recordScrambleResult,
    isRecordingResult: isRecordingScrambleResult,
    correctResult: correctScrambleResult,
    isCorrectingResult: isCorrectingScrambleResult,
  } = useScramble(clubId, isScramble ? (tournamentId ?? null) : null);

  // Pool Play Queries
  const {
    pools,
    isLoading: isLoadingPools,
    refetch: refetchPools,
    configurePools,
    assignSerpentine,
    isAssigningSerpentine,
    assignManual,
    generatePoolPlay,
    isGeneratingPoolPlay,
    regeneratePoolPlay,
    isRegeneratingPoolPlay,
  } = usePools(clubId, isPoolPlay ? (tournamentId ?? null) : null);

  const {
    matches: poolMatches,
    isLoading: isLoadingPoolMatches,
    refetch: refetchPoolMatches,
    recordResult: recordPoolMatchResult,
    isRecordingResult: isRecordingPoolResult,
    correctResult: correctPoolMatchResult,
    isCorrectingResult: isCorrectingPoolResult,
  } = usePoolMatches(
    clubId,
    isPoolPlay ? (tournamentId ?? null) : null,
    selectedPoolId === 'all' ? undefined : selectedPoolId
  );

  const {
    poolsStandings,
    isLoading: isLoadingPoolStandings,
    refetch: refetchPoolStandings,
  } = usePoolStandings(clubId, isPoolPlay ? (tournamentId ?? null) : null);

  const {
    matches: championshipMatches,
    isLoading: isLoadingChampionship,
    refetch: refetchChampionship,
    generateChampionship,
    isGeneratingChampionship,
    recordResult: recordChampionshipResult,
    isRecordingResult: isRecordingChampionshipResult,
    correctResult: correctChampionshipResult,
    isCorrectingResult: isCorrectingChampionshipResult,
  } = useChampionship(clubId, isPoolPlay ? (tournamentId ?? null) : null);

  const isRefreshing =
    isLoadingTournament ||
    isLoadingTeams ||
    isLoadingMatches ||
    isLoadingStandings ||
    isLoadingPools ||
    isLoadingPoolMatches ||
    isLoadingPoolStandings ||
    isLoadingChampionship ||
    isLoadingScrambleMatches ||
    isLoadingScrambleStandings;

  const handleRefreshAll = () => {
    void refetchTournament();
    void refetchRegs();
    if (isPoolPlay) {
      void refetchTeams();
      void refetchPools();
      void refetchPoolMatches();
      void refetchPoolStandings();
      void refetchChampionship();
    } else if (isScramble) {
      void refetchScrambleMatches();
      void refetchScrambleStandings();
    } else {
      void refetchTeams();
      void refetchMatches();
      void refetchStandings();
    }
  };

  // Helper getters
  const confirmedRegistrations = registrations.filter((r) => r.status === 'confirmed');
  const completedMatchesCount = matches.filter((m) => m.status === 'completed').length;
  const completedPoolMatchesCount = poolMatches.filter((m) => m.status === 'completed').length;
  const completedScrambleMatchesCount = scrambleMatches.filter((m) => m.status === 'completed').length;
  const canModifyTeams =
    tournament?.status === 'registration_closed' &&
    (isPoolPlay ? poolMatches.length === 0 : matches.length === 0);
  const canGenerateMatches =
    tournament?.status === 'registration_closed' &&
    matches.length === 0 &&
    teams.length >= 2;
  const canRegenerateMatches =
    matches.length > 0 && completedMatchesCount === 0;

  const canGenerateScramble =
    isScramble &&
    tournament?.status === 'registration_closed' &&
    scrambleMatches.length === 0 &&
    confirmedRegistrations.length >= 4 &&
    confirmedRegistrations.length % 4 === 0;
  const canRegenerateScramble =
    isScramble && scrambleMatches.length > 0 && completedScrambleMatchesCount === 0;

  const canConfigurePools =
    isPoolPlay &&
    tournament?.status !== 'completed' &&
    tournament?.status !== 'cancelled' &&
    poolMatches.length === 0;
  const canAssignPools =
    isPoolPlay &&
    tournament?.status === 'registration_closed' &&
    poolMatches.length === 0 &&
    pools.length >= 2 &&
    teams.length >= 2;
  const canGeneratePoolPlay =
    isPoolPlay &&
    tournament?.status === 'registration_closed' &&
    poolMatches.length === 0 &&
    pools.length >= 2 &&
    teams.length >= 2;
  const canRegeneratePoolPlay =
    isPoolPlay && poolMatches.length > 0 && completedPoolMatchesCount === 0;
  const allPoolMatchesCompleted =
    isPoolPlay && poolMatches.length > 0 && poolMatches.every((m) => m.status === 'completed');
  const canGenerateChampionship =
    isPoolPlay && allPoolMatchesCompleted && championshipMatches.length === 0;

  // Rounds present in matches
  const rounds = Array.from(
    new Set(matches.map((m) => m.round_number).filter((r): r is number => r !== null))
  ).sort((a, b) => a - b);

  // Filtered matches
  const filteredMatches =
    selectedRound === 'all'
      ? matches
      : matches.filter((m) => m.round_number === selectedRound);

  // Scramble rounds present in matches
  const scrambleRounds = Array.from(
    new Set(scrambleMatches.map((m) => m.round_number).filter((r): r is number => r !== null))
  ).sort((a, b) => a - b);

  // Filtered scramble matches
  const filteredScrambleMatches =
    selectedRound === 'all'
      ? scrambleMatches
      : scrambleMatches.filter((m) => m.round_number === selectedRound);

  // ─── Lifecycle Handlers ───────────────────────────────────────────────────
  const handleOpenRegistration = async () => {
    try {
      await openRegistration();
      if (isPoolPlay) {
        Alert.alert(
          'Registration Opened',
          'Registration is now open! Navigating to Pool Play Tournament Mode Workspace...',
          [
            {
              text: 'Open Workspace',
              onPress: () => {
                router.push({
                  pathname: '/(club)/pool-play' as never,
                  params: { tournamentId: tournament?.id },
                });
              },
            },
          ]
        );
      } else if (isBracket) {
        Alert.alert(
          'Registration Opened',
          'Registration is now open! Navigating to Bracket Tournament Mode Workspace...',
          [
            {
              text: 'Open Workspace',
              onPress: () => {
                router.push({
                  pathname: '/(club)/bracket' as never,
                  params: { tournamentId: tournament?.id },
                });
              },
            },
          ]
        );
      } else if (isRoundRobin) {
        Alert.alert(
          'Registration Opened',
          'Registration is now open! Navigating to Round Robin Tournament Mode Workspace...',
          [
            {
              text: 'Open Workspace',
              onPress: () => {
                router.push({
                  pathname: '/(club)/round-robin' as never,
                  params: { tournamentId: tournament?.id },
                });
              },
            },
          ]
        );
      } else {
        Alert.alert('Success', 'Registration opened.');
      }
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Action failed');
    }
  };

  const handleCloseRegistration = async () => {
    try {
      await closeRegistration();
      Alert.alert('Success', 'Registration closed. You may now form teams.');
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Action failed');
    }
  };

  const handleStartTournament = () => {
    Alert.alert(
      'Start Tournament',
      'Are you sure you want to start the tournament? This will mark it as live (In Progress) and players will see live match updates.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Now',
          style: 'default',
          onPress: async () => {
            try {
              await startTournament();
              Alert.alert('Tournament Started!', 'The tournament is now live. Matches can be started and scored.');
            } catch (err: unknown) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to start tournament');
            }
          },
        },
      ]
    );
  };

  const handleCancelTournament = () => {
    Alert.alert(
      'Cancel Tournament',
      'Are you sure you want to cancel this tournament? This action cannot be undone.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelTournament();
              Alert.alert('Cancelled', 'Tournament cancelled.');
            } catch (err: unknown) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Action failed');
            }
          },
        },
      ]
    );
  };

  // ─── Team Handlers ────────────────────────────────────────────────────────
  const openCreateTeamModal = () => {
    setEditingTeam(null);
    setTeamName('');
    setTeamSeed('');
    setSelectedPlayerIds([]);
    setTeamError(null);
    setShowTeamModal(true);
  };

  const openEditTeamModal = (team: Team) => {
    setEditingTeam(team);
    setTeamName(team.name);
    setTeamSeed(team.seed ? String(team.seed) : '');
    setSelectedPlayerIds(team.members.map((m) => m.player_membership_id));
    setTeamError(null);
    setShowTeamModal(true);
  };

  const togglePlayerSelection = (playerMembershipId: string) => {
    setSelectedPlayerIds((prev) => {
      if (prev.includes(playerMembershipId)) {
        return prev.filter((id) => id !== playerMembershipId);
      }
      if (teamSize === 1) {
        return [playerMembershipId];
      }
      if (prev.length >= 2) {
        return [prev[1], playerMembershipId];
      }
      return [...prev, playerMembershipId];
    });
  };

  const handleSaveTeam = async () => {
    if (!teamName.trim()) {
      setTeamError(teamSize === 1 ? 'Player or entry name is required' : 'Team name is required');
      return;
    }
    if (selectedPlayerIds.length !== teamSize) {
      setTeamError(
        teamSize === 1
          ? 'Singles entry requires exactly 1 player'
          : 'Teams require exactly 2 players'
      );
      return;
    }
    const seedVal = teamSeed.trim() ? parseInt(teamSeed, 10) : null;
    if (seedVal !== null && (isNaN(seedVal) || seedVal < 1)) {
      setTeamError('Seed must be a positive integer');
      return;
    }

    try {
      if (editingTeam) {
        await updateTeam({
          teamId: editingTeam.id,
          payload: {
            name: teamName.trim(),
            seed: seedVal,
            player_membership_ids: [selectedPlayerIds[0], selectedPlayerIds[1]],
          },
        });
      } else {
        await createTeam({
          name: teamName.trim(),
          seed: seedVal,
          player_membership_ids: [selectedPlayerIds[0], selectedPlayerIds[1]],
        });
      }
      setShowTeamModal(false);
    } catch (err: unknown) {
      setTeamError(err instanceof Error ? err.message : 'Failed to save team');
    }
  };

  const handleDeleteTeam = (team: Team) => {
    Alert.alert(
      'Delete Team',
      `Delete team "${team.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTeam(team.id);
            } catch (err: unknown) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete team');
            }
          },
        },
      ]
    );
  };

  // ─── Match Generation Handlers ────────────────────────────────────────────
  const handleGenerateMatches = async () => {
    try {
      const res = await generateRoundRobin();
      Alert.alert(
        'Schedule Generated',
        `Successfully generated ${res.matches_generated} matches across ${res.rounds_count} rounds!`
      );
      void refetchTournament();
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to generate schedule');
    }
  };

  const handleRegenerateMatches = () => {
    Alert.alert(
      'Regenerate Schedule',
      'Are you sure you want to regenerate all matches? Any previous pending schedule will be replaced.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await regenerateRoundRobin();
              Alert.alert('Schedule Regenerated', res.message);
            } catch (err: unknown) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Regeneration failed');
            }
          },
        },
      ]
    );
  };

  const handleConfigurePools = async (payload: PoolConfigureRequest) => {
    await configurePools(payload);
    setShowConfigureModal(false);
    Alert.alert('Success', 'Pools configured successfully.');
    void refetchTournament();
    void refetchPools();
  };

  const handleAssignManual = async (assignments: { team_id: string; pool_id: string }[]) => {
    await assignManual({ assignments });
    setShowManualAssignModal(false);
    Alert.alert('Success', 'Teams manually assigned to pools.');
    void refetchPools();
  };

  const handleAssignSerpentine = async () => {
    try {
      await assignSerpentine();
      Alert.alert('Success', 'Teams assigned to pools using serpentine snake seeding.');
      void refetchPools();
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Assignment failed');
    }
  };

  const handleGeneratePoolPlay = async () => {
    try {
      const res = await generatePoolPlay();
      Alert.alert('Success', res.message);
      void refetchTournament();
      void refetchPoolMatches();
      void refetchPoolStandings();
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Pool play generation failed');
    }
  };

  const handleRegeneratePoolPlay = () => {
    Alert.alert(
      'Regenerate Pool Play',
      'Are you sure you want to regenerate pool play matches? Any existing pending schedule will be replaced.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await regeneratePoolPlay();
              Alert.alert('Success', res.message);
              void refetchPoolMatches();
              void refetchPoolStandings();
            } catch (err: unknown) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Regeneration failed');
            }
          },
        },
      ]
    );
  };

  const handleGenerateChampionship = async () => {
    try {
      const res = await generateChampionship();
      Alert.alert('Success', res.message);
      void refetchTournament();
      void refetchChampionship();
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Championship generation failed');
    }
  };

  const handleGenerateScramble = async () => {
    try {
      const res = await generateScramble();
      Alert.alert(
        'Schedule Generated',
        `Successfully generated ${res.matches_generated} matches across ${res.rounds_count} rounds!`
      );
      void refetchTournament();
      void refetchScrambleMatches();
      void refetchScrambleStandings();
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to generate scramble schedule');
    }
  };

  const handleRegenerateScramble = () => {
    Alert.alert(
      'Regenerate Schedule',
      'Are you sure you want to regenerate all scramble matches? Any previous pending schedule will be replaced.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await regenerateScramble();
              Alert.alert('Schedule Regenerated', res.message);
              void refetchScrambleMatches();
              void refetchScrambleStandings();
            } catch (err: unknown) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Regeneration failed');
            }
          },
        },
      ]
    );
  };

  // ─── Score Handlers ───────────────────────────────────────────────────────
  const openScoreModal = (match: Match) => {
    setSelectedMatch(match);
    setScoreA(match.score_a !== null ? String(match.score_a) : '');
    setScoreB(match.score_b !== null ? String(match.score_b) : '');
    setScoreError(null);
    setShowScoreModal(true);
  };

  const handleSaveScore = async () => {
    if (!selectedMatch) return;
    const numA = parseInt(scoreA, 10);
    const numB = parseInt(scoreB, 10);

    if (isNaN(numA) || isNaN(numB) || numA < 0 || numB < 0) {
      setScoreError('Scores must be non-negative numbers');
      return;
    }
    if (numA === numB) {
      setScoreError('Scores cannot be tied in pickleball');
      return;
    }
    const maxScore = Math.max(numA, numB);
    const minScore = Math.min(numA, numB);
    if (maxScore < 11) {
      setScoreError('Winning score must be at least 11');
      return;
    }
    if (maxScore - minScore < 2) {
      setScoreError('Winner must win by at least 2 points');
      return;
    }

    try {
      const payload: MatchResultPayload = { score_a: numA, score_b: numB };
      if (isScramble) {
        if (selectedMatch.status === 'completed') {
          await correctScrambleResult({ matchId: selectedMatch.id, payload });
        } else {
          await recordScrambleResult({ matchId: selectedMatch.id, payload });
        }
        void refetchScrambleMatches();
        void refetchScrambleStandings();
      } else if (selectedMatch.stage === 'championship') {
        if (selectedMatch.status === 'completed') {
          await correctChampionshipResult({ matchId: selectedMatch.id, payload });
        } else {
          await recordChampionshipResult({ matchId: selectedMatch.id, payload });
        }
        void refetchChampionship();
      } else if (selectedMatch.stage === 'pool') {
        if (selectedMatch.status === 'completed') {
          await correctPoolMatchResult({ matchId: selectedMatch.id, payload });
        } else {
          await recordPoolMatchResult({ matchId: selectedMatch.id, payload });
        }
        void refetchPoolMatches();
        void refetchPoolStandings();
      } else {
        if (selectedMatch.status === 'completed') {
          await correctResult({ matchId: selectedMatch.id, payload });
        } else {
          await recordResult({ matchId: selectedMatch.id, payload });
        }
        void refetchMatches();
        void refetchStandings();
      }
      setShowScoreModal(false);
      void refetchTournament();
    } catch (err: unknown) {
      setScoreError(err instanceof Error ? err.message : 'Failed to save score');
    }
  };

  // ─── Render Checks ────────────────────────────────────────────────────────
  if (isLoadingTournament && !tournament) {
    return (
      <Screen safeArea={false}>
        <AppHeader title="Tournament Details" showBack />
        <LoadingState message="Loading tournament details..." />
      </Screen>
    );
  }

  if (tournamentError || !tournament) {
    return (
      <Screen safeArea={false}>
        <AppHeader title="Tournament Details" showBack />
        <ErrorState
          message={tournamentError?.message ?? 'Tournament not found'}
          onRetry={handleRefreshAll}
        />
      </Screen>
    );
  }

  // Gracefully handle unsupported formats
  if (
    tournament.format !== 'round_robin' &&
    tournament.format !== 'pool_play' &&
    tournament.format !== 'scramble' &&
    tournament.format !== 'bracket'
  ) {
    return (
      <Screen safeArea={false}>
        <AppHeader title="Tournament Details" showBack />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <AppText variant="caption" color="primary">‹ Back</AppText>
          </TouchableOpacity>
          <AppText variant="heading2">{tournament.name}</AppText>
        </View>
        <Card style={styles.unsupportedCard}>
          <AppText variant="heading3">Format: {tournament.format_label}</AppText>
          <AppText variant="body" color="secondary" style={styles.unsupportedDesc}>
            Interactive competition engine for {tournament.format_label} is coming in a future phase.
            Round Robin, Pool Play, and Scramble are currently the active competition formats.
          </AppText>
          <Button label="Back to Tournaments" variant="secondary" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title={tournament.name} showBack />
      {/* Location + badges — AppHeader already shows tournament name */}
      <ScreenHeader
        title=""
        subtitle={tournament.location_name ? `📍 ${tournament.location_name}` : undefined}
        rightElement={
          <View style={styles.badgeRow}>
            <Badge
              label={isPoolPlay ? 'Pool Play' : isScramble ? 'Scramble' : 'Round Robin'}
              variant="info"
            />
            <Badge label={tournament.status_label} variant="info" />
          </View>
        }
      />

      {/* Draft Mode Notice Banner */}
      {tournament.status === 'draft' && (
        <DraftTournamentBanner
          tournamentName={tournament.name}
          onPublish={handleOpenRegistration}
          isPublishing={false}
        />
      )}

      {/* Tabs */}
      <FilterChips
        chips={
          isScramble
            ? [
                { key: 'overview', label: 'Overview' },
                {
                  key: 'participants',
                  label: `Participants (${confirmedRegistrations.length})`,
                },
                {
                  key: 'matches',
                  label: `Matches (${scrambleMatches.length})`,
                },
                { key: 'standings', label: 'Standings' },
              ]
            : isPoolPlay
            ? [
                { key: 'overview', label: 'Overview' },
                { key: 'teams', label: `Teams (${teams.length})` },
                { key: 'pools', label: `Pools (${pools.length})` },
                {
                  key: 'championship',
                  label: `Championship (${championshipMatches.length})`,
                },
              ]
            : [
                { key: 'overview', label: 'Overview' },
                { key: 'teams', label: `Teams (${teams.length})` },
                { key: 'matches', label: `Matches (${matches.length})` },
                { key: 'standings', label: 'Standings' },
              ]
        }
        activeChip={activeTab}
        onChipPress={(chip) => setActiveTab(chip as ActiveTab)}
      />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefreshAll} />
        }
      >
        {/* ─── TAB 1: OVERVIEW ─── */}
        {activeTab === 'overview' && (
          <View style={styles.tabContent}>
            {/* Status & Lifecycle Actions */}
            <Card style={styles.overviewCard}>
              <AppText variant="heading3">Tournament Lifecycle</AppText>
              <AppText variant="bodySmall" color="secondary" style={styles.overviewDesc}>
                Current Status: <AppText variant="bodySmall" color="primary">{tournament.status_label}</AppText>
              </AppText>

              <View style={styles.lifecycleButtons}>
                {tournament.status === 'draft' && (
                  <Button
                    label="Open Registration"
                    variant="primary"
                    size="sm"
                    onPress={handleOpenRegistration}
                  />
                )}
                {tournament.status === 'registration_open' && (
                  <Button
                    label="Close Registration"
                    variant="secondary"
                    size="sm"
                    onPress={handleCloseRegistration}
                  />
                )}
                {tournament.status === 'registration_closed' && (
                  <Button
                    label="Setup Competition"
                    variant="primary"
                    size="sm"
                    onPress={() => router.push({
                      pathname: '/(club)/competition-setup' as never,
                      params: { tournamentId: tournament.id },
                    })}
                  />
                )}
                {tournament.status === 'registration_closed' && (
                  <Button
                    label="Start Tournament"
                    variant="primary"
                    size="sm"
                    loading={isStartingTournament}
                    onPress={handleStartTournament}
                  />
                )}
                {tournament.status !== 'completed' && tournament.status !== 'cancelled' && (
                  <Button
                    label="Cancel Tournament"
                    variant="ghost"
                    size="sm"
                    onPress={handleCancelTournament}
                  />
                )}
              </View>
            </Card>

            {/* Tournament Structure & Eligibility Card */}
            <Card style={styles.overviewCard}>
              <View style={styles.cardHeaderRow}>
                <AppText variant="heading3">Tournament Structure & Eligibility</AppText>
                <Badge
                  label={tournament.format === 'scramble' ? 'Rotating Partners' : tournamentConfig.isSingles ? 'Singles' : 'Doubles'}
                  variant={tournament.format === 'scramble' ? 'default' : tournamentConfig.isSingles ? 'warning' : 'info'}
                />
              </View>

              <View style={styles.structureGrid}>
                <View style={styles.structureItem}>
                  <AppText variant="caption" color="tertiary">CATEGORY</AppText>
                  <AppText variant="bodySmall" style={{ fontWeight: '600' }}>
                    {tournamentConfig.category}
                  </AppText>
                </View>
                <View style={styles.structureItem}>
                  <AppText variant="caption" color="tertiary">
                    {tournamentConfig.skillLevelMode === 'range' ? 'ELIGIBLE RATING RANGE' : 'SKILL LEVEL'}
                  </AppText>
                  <AppText variant="bodySmall" style={{ fontWeight: '600' }}>
                    {tournamentConfig.skillLevelDisplay}
                  </AppText>
                </View>
                <View style={styles.structureItem}>
                  <AppText variant="caption" color="tertiary">GENDER</AppText>
                  <AppText variant="bodySmall" style={{ fontWeight: '600' }}>
                    {tournamentConfig.genderEligibility}
                  </AppText>
                </View>
                <View style={styles.structureItem}>
                  <AppText variant="caption" color="tertiary">AGE RESTRICTION</AppText>
                  <AppText variant="bodySmall" style={{ fontWeight: '600' }}>
                    {tournamentConfig.ageRestrictionText}
                  </AppText>
                </View>
              </View>

              <View style={styles.capacityBanner}>
                <AppText variant="caption" style={styles.capacityBannerText}>
                  {tournament.format === 'scramble'
                    ? `Scramble • ${tournament.max_participants ?? 16} Individual Players • Rotating Partners`
                    : tournamentConfig.isSingles
                    ? `Singles • ${tournament.max_participants ?? 8} Players • ${tournament.max_participants ?? 8} Entries • 1 Player / Team`
                    : `${tournamentConfig.category} • ${tournament.max_participants ?? 8} Teams • ${(tournament.max_participants ?? 8) * 2} Players • 2 Players / Team`}
                </AppText>
              </View>
            </Card>

            {/* Bracket Mode Card (Bracket Only) */}
            {isBracket && (
              <Card style={styles.overviewCard}>
                <View style={styles.cardHeaderRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing[2] }}>
                      <AppText variant="heading3">Bracket Tournament Mode</AppText>
                      <Badge label="TOURNAMENT MODE" variant="info" />
                    </View>
                    <AppText variant="bodySmall" color="secondary">
                      "Single-elimination knockout tournament with deterministic power-of-two seeding and BYE propagation."
                    </AppText>
                  </View>
                </View>
                <Button
                  label="Open Bracket Workspace ➔"
                  variant="primary"
                  size="sm"
                  onPress={() => {
                    router.push({
                      pathname: '/(club)/bracket' as never,
                      params: { tournamentId: tournament.id },
                    });
                  }}
                  style={{ marginTop: Spacing[3], backgroundColor: Colors.brand.primary, borderColor: Colors.brand.primary }}
                />
              </Card>
            )}

            {/* Round Robin Mode Card (Round Robin Only) */}
            {isRoundRobin && (
              <Card style={styles.overviewCard}>
                <View style={styles.cardHeaderRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing[2] }}>
                      <AppText variant="heading3">Round Robin Tournament Mode</AppText>
                      <Badge label="TOURNAMENT MODE" variant="info" />
                    </View>
                    <AppText variant="bodySmall" color="secondary">
                      "Every team plays every other team once using fixed partner teams."
                    </AppText>
                  </View>
                </View>
                <Button
                  label="Open Round Robin Workspace ➔"
                  variant="primary"
                  size="sm"
                  onPress={() => {
                    router.push({
                      pathname: '/(club)/round-robin' as never,
                      params: { tournamentId: tournament.id },
                    });
                  }}
                  style={{ marginTop: Spacing[3], backgroundColor: Colors.brand.primary, borderColor: Colors.brand.primary }}
                />
              </Card>
            )}

            {/* Pool Play Mode Card (Pool Play Only) */}
            {isPoolPlay && (
              <Card style={styles.overviewCard}>
                <View style={styles.cardHeaderRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <AppText variant="heading3">Pool Play Tournament Mode</AppText>
                    <AppText variant="bodySmall" color="secondary">
                      Full workspace: team rating balancing, snake draft, intra-pool round robin matchups, live court execution, standings, and championship bracket.
                    </AppText>
                  </View>
                </View>
                <Button
                  label="Open Pool Play Workspace ➔"
                  variant="primary"
                  size="sm"
                  onPress={() => {
                    router.push({
                      pathname: '/(club)/pool-play' as never,
                      params: { tournamentId: tournament.id },
                    });
                  }}
                  style={{ marginTop: Spacing[3], backgroundColor: Colors.brand.primary, borderColor: Colors.brand.primary }}
                />
              </Card>
            )}

            {/* Scramble Mode Card (Scramble Only) */}
            {isScramble && (
              <Card style={styles.overviewCard}>
                <View style={styles.cardHeaderRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing[2] }}>
                      <AppText variant="heading3">Scramble Tournament Mode</AppText>
                      <Badge label="TOURNAMENT MODE" variant="info" />
                    </View>
                    <AppText variant="bodySmall" color="secondary">
                      Individual rotate-partner format with 4- and 5-player courts, live availability, rotating doubles, and individual standings.
                    </AppText>
                  </View>
                </View>
                <Button
                  label="Open Scramble Workspace ➔"
                  variant="primary"
                  size="sm"
                  onPress={() => {
                    router.push({
                      pathname: '/(club)/scramble' as never,
                      params: { tournamentId: tournament.id },
                    });
                  }}
                  style={{ marginTop: Spacing[3], backgroundColor: Colors.brand.primary, borderColor: Colors.brand.primary }}
                />
              </Card>
            )}

            {/* Scramble Configuration & Matchmaking Card (Scramble Only) */}
            {isScramble && (
              <Card style={styles.overviewCard}>
                <View style={styles.cardHeaderRow}>
                  <AppText variant="heading3">Scramble Competition</AppText>
                  {canGenerateScramble && (
                    <Button
                      label="Generate Schedule"
                      variant="primary"
                      size="sm"
                      loading={isGeneratingScramble}
                      onPress={handleGenerateScramble}
                    />
                  )}
                  {canRegenerateScramble && (
                    <Button
                      label="Regenerate"
                      variant="secondary"
                      size="sm"
                      loading={isRegeneratingScramble}
                      onPress={handleRegenerateScramble}
                    />
                  )}
                </View>

                <View style={styles.poolConfigGrid}>
                  <View style={styles.poolConfigItem}>
                    <AppText variant="caption" color="tertiary">CONFIRMED PLAYERS</AppText>
                    <AppText variant="heading3">{confirmedRegistrations.length}</AppText>
                  </View>
                  <View style={styles.poolConfigItem}>
                    <AppText variant="caption" color="tertiary">ROUNDS</AppText>
                    <AppText variant="heading3">
                      {scrambleMatches.length > 0 ? scrambleRounds.length : ((tournament.format_configuration?.rounds_count as number) ?? 3)}
                    </AppText>
                  </View>
                  <View style={styles.poolConfigItem}>
                    <AppText variant="caption" color="tertiary">STAGE STATUS</AppText>
                    <AppText variant="bodySmall" color="secondary">
                      {tournament.status === 'completed'
                        ? 'Completed'
                        : scrambleMatches.length > 0
                        ? 'In Progress'
                        : 'Setup'}
                    </AppText>
                  </View>
                </View>

                {confirmedRegistrations.length > 0 && confirmedRegistrations.length % 4 !== 0 && (
                  <Card style={styles.infoBanner}>
                    <AppText variant="caption" style={styles.errorText}>
                      ⚠️ Scramble requires player count divisible by 4 (e.g. 4, 8, 12, 16) to ensure 100% equal court time without BYEs. Currently {confirmedRegistrations.length} confirmed.
                    </AppText>
                  </Card>
                )}
              </Card>
            )}

            {/* Pool Play Configuration & Stage Tracker (Pool Play Only) */}
            {isPoolPlay && (
              <>
                {/* Stage Progress Tracker */}
                <Card style={styles.overviewCard}>
                  <AppText variant="heading3">Competition Stages</AppText>
                  <View style={styles.stageTrackerRow}>
                    <View style={styles.stageStep}>
                      <View
                        style={[
                          styles.stageStepCircle,
                          tournament.status !== 'draft' && styles.stageStepCircleDone,
                        ]}
                      >
                        <AppText
                          variant="caption"
                          style={tournament.status !== 'draft' ? styles.stageStepTextDone : undefined}
                        >
                          1
                        </AppText>
                      </View>
                      <AppText variant="caption" color={tournament.status !== 'draft' ? 'primary' : 'tertiary'}>
                        Registration
                      </AppText>
                    </View>

                    <View
                      style={[
                        styles.stageConnector,
                        poolMatches.length > 0 && styles.stageConnectorActive,
                      ]}
                    />

                    <View style={styles.stageStep}>
                      <View
                        style={[
                          styles.stageStepCircle,
                          allPoolMatchesCompleted
                            ? styles.stageStepCircleDone
                            : poolMatches.length > 0
                            ? styles.stageStepCircleActive
                            : undefined,
                        ]}
                      >
                        <AppText
                          variant="caption"
                          style={allPoolMatchesCompleted ? styles.stageStepTextDone : undefined}
                        >
                          2
                        </AppText>
                      </View>
                      <AppText
                        variant="caption"
                        color={poolMatches.length > 0 ? 'primary' : 'tertiary'}
                      >
                        Pool Play
                      </AppText>
                    </View>

                    <View
                      style={[
                        styles.stageConnector,
                        championshipMatches.length > 0 && styles.stageConnectorActive,
                      ]}
                    />

                    <View style={styles.stageStep}>
                      <View
                        style={[
                          styles.stageStepCircle,
                          tournament.status === 'completed'
                            ? styles.stageStepCircleDone
                            : championshipMatches.length > 0
                            ? styles.stageStepCircleActive
                            : undefined,
                        ]}
                      >
                        <AppText
                          variant="caption"
                          style={tournament.status === 'completed' ? styles.stageStepTextDone : undefined}
                        >
                          3
                        </AppText>
                      </View>
                      <AppText
                        variant="caption"
                        color={championshipMatches.length > 0 ? 'primary' : 'tertiary'}
                      >
                        Championship
                      </AppText>
                    </View>
                  </View>
                </Card>

                {/* Pool Configuration Summary */}
                <Card style={styles.overviewCard}>
                  <View style={styles.cardHeaderRow}>
                    <AppText variant="heading3">Pool Configuration</AppText>
                    {canConfigurePools && (
                      <Button
                        label="Configure Pools"
                        variant="secondary"
                        size="sm"
                        onPress={() => setShowConfigureModal(true)}
                      />
                    )}
                  </View>

                  <View style={styles.poolConfigGrid}>
                    <View style={styles.poolConfigItem}>
                      <AppText variant="caption" color="tertiary">POOLS</AppText>
                      <AppText variant="heading3">{pools.length}</AppText>
                    </View>
                    <View style={styles.poolConfigItem}>
                      <AppText variant="caption" color="tertiary">QUALIFIERS / POOL</AppText>
                      <AppText variant="heading3">
                        {tournament.format_configuration?.qualifiers_per_pool ?? 1}
                      </AppText>
                    </View>
                    <View style={styles.poolConfigItem}>
                      <AppText variant="caption" color="tertiary">STAGE STATUS</AppText>
                      <AppText variant="bodySmall" color="secondary">
                        {championshipMatches.length > 0
                          ? 'Championship'
                          : poolMatches.length > 0
                          ? 'Pool Play'
                          : 'Setup'}
                      </AppText>
                    </View>
                  </View>
                </Card>
              </>
            )}

            {/* Registrations List */}
            <Card style={styles.overviewCard}>
              <View style={styles.cardHeaderRow}>
                <AppText variant="heading3">Confirmed Registrations</AppText>
                <Badge label={`${confirmedRegistrations.length} Players`} variant="info" />
              </View>
              {confirmedRegistrations.length === 0 ? (
                <EmptyState
                  title="No Confirmed Registrations"
                  description="Players can register once registration is open."
                />
              ) : (
                confirmedRegistrations.map((reg) => (
                  <View key={reg.id} style={styles.playerRow}>
                    <View style={styles.playerInfo}>
                      <AppText variant="bodySmall" style={styles.playerName}>
                        {reg.display_name ?? reg.user_full_name ?? reg.user_email}
                      </AppText>
                      {reg.membership_number && (
                        <AppText variant="caption" color="tertiary">
                          #{reg.membership_number}
                        </AppText>
                      )}
                    </View>
                    <Badge label={reg.status} variant="success" />
                  </View>
                ))
              )}
            </Card>
          </View>
        )}

        {/* ─── TAB: PARTICIPANTS (SCRAMBLE ONLY) ─── */}
        {activeTab === 'participants' && isScramble && (
          <View style={styles.tabContent}>
            <Card style={styles.infoBanner}>
              <AppText variant="caption" color="secondary">
                ℹ️ In Scramble format, players register individually and rotate partners each round. Matches are generated automatically with deterministic partner pairing.
              </AppText>
            </Card>

            {canGenerateScramble && (
              <Button
                label="Generate Scramble Schedule"
                variant="primary"
                onPress={handleGenerateScramble}
                loading={isGeneratingScramble}
                style={styles.actionBtn}
              />
            )}

            {canRegenerateScramble && (
              <Button
                label="Regenerate Scramble Schedule"
                variant="secondary"
                onPress={handleRegenerateScramble}
                loading={isRegeneratingScramble}
                style={styles.actionBtn}
              />
            )}

            {confirmedRegistrations.length === 0 ? (
              <EmptyState
                title="No Confirmed Participants"
                description="Players who register and are confirmed for this tournament will appear here."
              />
            ) : (
              confirmedRegistrations.map((reg, idx) => (
                <Card key={reg.id} style={styles.teamCard}>
                  <View style={styles.cardHeaderRow}>
                    <View>
                      <AppText variant="heading3">
                        {reg.display_name ?? reg.user_full_name ?? reg.user_email}
                      </AppText>
                      <View style={styles.teamBadgeRow}>
                        <Badge label={`Seed #${idx + 1}`} variant="info" size="sm" />
                        {reg.membership_number && (
                          <AppText variant="caption" color="secondary">
                            #{reg.membership_number}
                          </AppText>
                        )}
                      </View>
                    </View>
                    <Badge label="Confirmed" variant="success" size="sm" />
                  </View>
                </Card>
              ))
            )}
          </View>
        )}

        {/* ─── TAB 2: TEAMS ─── */}
        {activeTab === 'teams' && (
          <View style={styles.tabContent}>
            {canModifyTeams && (
              <Button
                label={teamSize === 1 ? '+ Add Singles Entry (1 Player)' : '+ Create Team (2 Players)'}
                variant="primary"
                onPress={openCreateTeamModal}
                style={styles.actionBtn}
              />
            )}

            {/* Pool Assignment Actions (Pool Play Only) */}
            {isPoolPlay && canAssignPools && (
              <Card style={styles.poolActionCard}>
                <View style={styles.cardHeaderRow}>
                  <View>
                    <AppText variant="heading3">Pool Team Assignment</AppText>
                    <AppText variant="caption" color="secondary">
                      Assign {teams.length} teams across {pools.length} pools.
                    </AppText>
                  </View>
                </View>
                <View style={styles.poolActionRow}>
                  <Button
                    label="Auto-Assign (Serpentine)"
                    variant="primary"
                    size="sm"
                    loading={isAssigningSerpentine}
                    onPress={handleAssignSerpentine}
                    style={styles.poolActionBtn}
                  />
                  <Button
                    label="Manual Assign"
                    variant="secondary"
                    size="sm"
                    onPress={() => setShowManualAssignModal(true)}
                    style={styles.poolActionBtn}
                  />
                </View>
              </Card>
            )}

            {(isPoolPlay ? poolMatches.length > 0 : matches.length > 0) && (
              <Card style={styles.infoBanner}>
                <AppText variant="caption" color="secondary">
                  🔒 Matches have been generated. Teams cannot be modified or deleted.
                </AppText>
              </Card>
            )}

            {teams.length === 0 ? (
              <EmptyState
                title={teamSize === 1 ? 'No Singles Players Added' : 'No Teams Created'}
                description={
                  tournament.status === 'registration_closed'
                    ? teamSize === 1
                      ? 'Add confirmed players as singles entries to prepare for match generation.'
                      : 'Create fixed-partner teams of 2 players to prepare for match generation.'
                    : 'Registration must be closed before forming teams.'
                }
              />
            ) : (
              teams.map((team) => {
                const assignedPool = isPoolPlay
                  ? pools.find((p) => p.pool_teams?.some((pt) => pt.team_id === team.id))
                  : null;

                return (
                  <Card key={team.id} style={styles.teamCard}>
                    <View style={styles.cardHeaderRow}>
                      <View>
                        <AppText variant="heading3">{team.name}</AppText>
                        <View style={styles.teamBadgeRow}>
                          {team.seed !== null && (
                            <AppText variant="caption" color="secondary">
                              Seed #{team.seed}
                            </AppText>
                          )}
                          {isPoolPlay && (
                            <Badge
                              label={assignedPool ? assignedPool.name : 'Unassigned'}
                              variant={assignedPool ? 'info' : 'default'}
                              size="sm"
                            />
                          )}
                        </View>
                      </View>
                      {canModifyTeams && (
                        <View style={styles.teamActions}>
                          <TouchableOpacity
                            onPress={() => openEditTeamModal(team)}
                            style={styles.iconBtn}
                          >
                            <AppText variant="caption" color="primary">Edit</AppText>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDeleteTeam(team)}
                            style={styles.iconBtn}
                          >
                            <AppText variant="caption" style={styles.deleteText}>Delete</AppText>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    <View style={styles.membersList}>
                      {team.members.map((m) => (
                        <View key={m.id} style={styles.memberTag}>
                          <AppText variant="bodySmall">
                            👤 {m.display_name ?? m.user_email ?? (teamSize === 1 ? 'Player' : 'Partner')}
                          </AppText>
                        </View>
                      ))}
                    </View>
                  </Card>
                );
              })
            )}
          </View>
        )}

        {/* ─── TAB 3: MATCHES ─── */}
        {activeTab === 'matches' && (
          <View style={styles.tabContent}>
            {isScramble ? (
              <>
                {canGenerateScramble && (
                  <Button
                    label="Generate Scramble Schedule"
                    variant="primary"
                    onPress={handleGenerateScramble}
                    loading={isGeneratingScramble}
                    style={styles.actionBtn}
                  />
                )}

                {canRegenerateScramble && (
                  <Button
                    label="Regenerate Scramble Schedule"
                    variant="secondary"
                    onPress={handleRegenerateScramble}
                    loading={isRegeneratingScramble}
                    style={styles.actionBtn}
                  />
                )}

                {scrambleMatches.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.roundScroll}
                  >
                    <TouchableOpacity
                      style={[
                        styles.roundChip,
                        selectedRound === 'all' && styles.roundChipActive,
                      ]}
                      onPress={() => setSelectedRound('all')}
                    >
                      <AppText
                        variant="caption"
                        style={[
                          styles.roundChipText,
                          selectedRound === 'all' && styles.roundChipTextActive,
                        ]}
                      >
                        All Rounds ({scrambleMatches.length})
                      </AppText>
                    </TouchableOpacity>
                    {scrambleRounds.map((r) => (
                      <TouchableOpacity
                        key={r}
                        style={[
                          styles.roundChip,
                          selectedRound === r && styles.roundChipActive,
                        ]}
                        onPress={() => setSelectedRound(r)}
                      >
                        <AppText
                          variant="caption"
                          style={[
                            styles.roundChipText,
                            selectedRound === r && styles.roundChipTextActive,
                          ]}
                        >
                          Round {r}
                        </AppText>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                {scrambleMatches.length === 0 ? (
                  <EmptyState
                    title="No Matches Generated"
                    description={
                      confirmedRegistrations.length < 4 || confirmedRegistrations.length % 4 !== 0
                        ? `Scramble requires at least 4 confirmed players divisible by 4 (currently ${confirmedRegistrations.length}).`
                        : tournament.status === 'registration_closed'
                        ? 'Click Generate Scramble Schedule above to create deterministic rotating partner matchups.'
                        : 'Close registration to generate the scramble schedule.'
                    }
                  />
                ) : (
                  filteredScrambleMatches.map((m) => {
                    const isCompleted = m.status === 'completed';
                    const sideAWon = isCompleted && m.winner_side === 'side_a';
                    const sideBWon = isCompleted && m.winner_side === 'side_b';
                    const sideANames =
                      m.side_a_participants && m.side_a_participants.length > 0
                        ? m.side_a_participants
                            .map((p) => p.display_name || 'Player')
                            .join(' & ')
                        : 'Side A';
                    const sideBNames =
                      m.side_b_participants && m.side_b_participants.length > 0
                        ? m.side_b_participants
                            .map((p) => p.display_name || 'Player')
                            .join(' & ')
                        : 'Side B';

                    return (
                      <Card key={m.id} style={styles.matchCard}>
                        <View style={styles.matchMetaRow}>
                          <AppText variant="caption" color="tertiary">
                            Round {m.round_number ?? '-'} • Match #{m.match_number ?? '-'}
                          </AppText>
                          <Badge
                            label={m.status_label}
                            variant={isCompleted ? 'success' : 'default'}
                          />
                        </View>

                        <View style={styles.matchTeamsContainer}>
                          <View style={[styles.matchTeamRow, sideAWon && styles.winnerHighlight]}>
                            <AppText
                              variant="body"
                              style={[styles.teamNameText, sideAWon && styles.winnerText]}
                            >
                              {sideANames}
                            </AppText>
                            <AppText
                              variant="heading3"
                              style={[styles.scoreText, sideAWon && styles.winnerText]}
                            >
                              {m.score_a !== null ? m.score_a : '-'}
                            </AppText>
                          </View>

                          <View style={[styles.matchTeamRow, sideBWon && styles.winnerHighlight]}>
                            <AppText
                              variant="body"
                              style={[styles.teamNameText, sideBWon && styles.winnerText]}
                            >
                              {sideBNames}
                            </AppText>
                            <AppText
                              variant="heading3"
                              style={[styles.scoreText, sideBWon && styles.winnerText]}
                            >
                              {m.score_b !== null ? m.score_b : '-'}
                            </AppText>
                          </View>
                        </View>

                        <Button
                          label={isCompleted ? 'Edit Score' : 'Enter Score'}
                          variant={isCompleted ? 'secondary' : 'primary'}
                          size="sm"
                          onPress={() => openScoreModal(m)}
                          style={styles.scoreBtn}
                        />
                      </Card>
                    );
                  })
                )}
              </>
            ) : (
              <>
                {canGenerateMatches && (
                  <Button
                    label="Generate Round Robin Schedule"
                    variant="primary"
                    onPress={handleGenerateMatches}
                    loading={isGenerating}
                    style={styles.actionBtn}
                  />
                )}

                {canRegenerateMatches && (
                  <Button
                    label="Regenerate Schedule"
                    variant="secondary"
                    onPress={handleRegenerateMatches}
                    loading={isRegenerating}
                    style={styles.actionBtn}
                  />
                )}

                {matches.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.roundScroll}
                  >
                    <TouchableOpacity
                      style={[
                        styles.roundChip,
                        selectedRound === 'all' && styles.roundChipActive,
                      ]}
                      onPress={() => setSelectedRound('all')}
                    >
                      <AppText
                        variant="caption"
                        style={[
                          styles.roundChipText,
                          selectedRound === 'all' && styles.roundChipTextActive,
                        ]}
                      >
                        All Rounds ({matches.length})
                      </AppText>
                    </TouchableOpacity>
                    {rounds.map((r) => (
                      <TouchableOpacity
                        key={r}
                        style={[
                          styles.roundChip,
                          selectedRound === r && styles.roundChipActive,
                        ]}
                        onPress={() => setSelectedRound(r)}
                      >
                        <AppText
                          variant="caption"
                          style={[
                            styles.roundChipText,
                            selectedRound === r && styles.roundChipTextActive,
                          ]}
                        >
                          Round {r}
                        </AppText>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                {matches.length === 0 ? (
                  <EmptyState
                    title="No Matches Generated"
                    description={
                      teams.length < 2
                        ? 'Form at least 2 teams to generate the Round Robin schedule.'
                        : 'Click Generate Round Robin Schedule above to create deterministic rounds.'
                    }
                  />
                ) : (
                  filteredMatches.map((m) => {
                    const isCompleted = m.status === 'completed';
                    const teamAWon = isCompleted && m.winner_team_id === m.team_a_id;
                    const teamBWon = isCompleted && m.winner_team_id === m.team_b_id;

                    return (
                      <Card key={m.id} style={styles.matchCard}>
                        <View style={styles.matchMetaRow}>
                          <AppText variant="caption" color="tertiary">
                            Round {m.round_number ?? '-'} • Match #{m.match_number ?? '-'}
                          </AppText>
                          <Badge
                            label={m.status_label}
                            variant={isCompleted ? 'success' : 'default'}
                          />
                        </View>

                        <View style={styles.matchTeamsContainer}>
                          {/* Team A */}
                          <View style={[styles.matchTeamRow, teamAWon && styles.winnerHighlight]}>
                            <AppText
                              variant="body"
                              style={[styles.teamNameText, teamAWon && styles.winnerText]}
                            >
                              {m.team_a?.name ?? 'Team A'}
                            </AppText>
                            <AppText
                              variant="heading3"
                              style={[styles.scoreText, teamAWon && styles.winnerText]}
                            >
                              {m.score_a !== null ? m.score_a : '-'}
                            </AppText>
                          </View>

                          {/* Team B */}
                          <View style={[styles.matchTeamRow, teamBWon && styles.winnerHighlight]}>
                            <AppText
                              variant="body"
                              style={[styles.teamNameText, teamBWon && styles.winnerText]}
                            >
                              {m.team_b?.name ?? 'Team B'}
                            </AppText>
                            <AppText
                              variant="heading3"
                              style={[styles.scoreText, teamBWon && styles.winnerText]}
                            >
                              {m.score_b !== null ? m.score_b : '-'}
                            </AppText>
                          </View>
                        </View>

                        <Button
                          label={isCompleted ? 'Edit Score' : 'Enter Score'}
                          variant={isCompleted ? 'secondary' : 'primary'}
                          size="sm"
                          onPress={() => openScoreModal(m)}
                          style={styles.scoreBtn}
                        />
                      </Card>
                    );
                  })
                )}
              </>
            )}
          </View>
        )}

        {/* ─── TAB 4: STANDINGS ─── */}
        {activeTab === 'standings' && (
          <View style={styles.tabContent}>
            {isScramble ? (
              scrambleStandings.length === 0 ? (
                <EmptyState
                  title="No Standings Data"
                  description="Individual scramble standings will update automatically as match scores are recorded."
                />
              ) : (
                <ScrambleStandingsTable standings={scrambleStandings} />
              )
            ) : standings.length === 0 ? (
              <EmptyState
                title="No Standings Data"
                description="Standings will update automatically as match scores are recorded."
              />
            ) : (
              <>
                <Card style={styles.standingsCard}>
                  {/* Standings Table Header */}
                  <View style={styles.standingsHeader}>
                    <AppText variant="caption" color="tertiary" style={styles.colRank}>#</AppText>
                    <AppText variant="caption" color="tertiary" style={styles.colTeam}>Team</AppText>
                    <AppText variant="caption" color="tertiary" style={styles.colStat}>W</AppText>
                    <AppText variant="caption" color="tertiary" style={styles.colStat}>L</AppText>
                    <AppText variant="caption" color="tertiary" style={styles.colStat}>Diff</AppText>
                    <AppText variant="caption" color="tertiary" style={styles.colStat}>PF</AppText>
                  </View>

                  {/* Rows */}
                  {standings.map((row: StandingRow) => (
                    <View key={row.team_id} style={styles.standingsRow}>
                      <AppText variant="bodySmall" style={styles.colRank}>{row.rank}</AppText>
                      <View style={styles.colTeam}>
                        <AppText variant="bodySmall" numberOfLines={1}>{row.team_name}</AppText>
                        {row.team_seed && (
                          <AppText variant="caption" color="tertiary">Seed #{row.team_seed}</AppText>
                        )}
                      </View>
                      <AppText variant="bodySmall" style={styles.colStat}>{row.wins}</AppText>
                      <AppText variant="bodySmall" style={styles.colStat}>{row.losses}</AppText>
                      <AppText
                        variant="bodySmall"
                        style={[
                          styles.colStat,
                          row.points_differential > 0 ? styles.positiveDiff : undefined,
                        ]}
                      >
                        {row.points_differential > 0 ? `+${row.points_differential}` : row.points_differential}
                      </AppText>
                      <AppText variant="bodySmall" style={styles.colStat}>{row.points_scored}</AppText>
                    </View>
                  ))}
                </Card>

                {/* Tiebreaker explanation */}
                <Card style={styles.infoBanner}>
                  <AppText variant="caption" color="tertiary">
                    Tiebreaker rules in order:
                    {'\n'}1. Wins (desc)
                    {'\n'}2. Points Differential (desc)
                    {'\n'}3. Points Scored (desc)
                    {'\n'}4. Team Name (lexicographic)
                  </AppText>
                </Card>
              </>
            )}
          </View>
        )}

        {/* ─── TAB 5: POOLS (POOL PLAY ONLY) ─── */}
        {activeTab === 'pools' && isPoolPlay && (
          <View style={styles.tabContent}>
            {canGeneratePoolPlay && (
              <Button
                label="Generate Pool Play Schedule"
                variant="primary"
                onPress={handleGeneratePoolPlay}
                loading={isGeneratingPoolPlay}
                style={styles.actionBtn}
              />
            )}

            {canRegeneratePoolPlay && (
              <Button
                label="Regenerate Pool Schedule"
                variant="secondary"
                onPress={handleRegeneratePoolPlay}
                loading={isRegeneratingPoolPlay}
                style={styles.actionBtn}
              />
            )}

            {/* Pool Selector Chips */}
            {pools.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.roundScroll}
              >
                <TouchableOpacity
                  style={[
                    styles.roundChip,
                    selectedPoolId === 'all' && styles.roundChipActive,
                  ]}
                  onPress={() => setSelectedPoolId('all')}
                >
                  <AppText
                    variant="caption"
                    style={[
                      styles.roundChipText,
                      selectedPoolId === 'all' && styles.roundChipTextActive,
                    ]}
                  >
                    All Pools ({pools.length})
                  </AppText>
                </TouchableOpacity>
                {pools.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.roundChip,
                      selectedPoolId === p.id && styles.roundChipActive,
                    ]}
                    onPress={() => setSelectedPoolId(p.id)}
                  >
                    <AppText
                      variant="caption"
                      style={[
                        styles.roundChipText,
                        selectedPoolId === p.id && styles.roundChipTextActive,
                      ]}
                    >
                      {p.name} ({p.pool_teams?.length ?? 0} teams)
                    </AppText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Standings Section */}
            {poolsStandings.length > 0 && (
              <View style={styles.sectionBlock}>
                <AppText variant="heading3" style={styles.sectionHeading}>
                  Pool Standings
                </AppText>
                {poolsStandings
                  .filter((ps) => selectedPoolId === 'all' || ps.pool_id === selectedPoolId)
                  .map((ps) => (
                    <PoolStandingsTable
                      key={ps.pool_id}
                      poolName={ps.pool_name}
                      standings={ps.standings}
                    />
                  ))}
              </View>
            )}

            {/* Matches Section */}
            <View style={styles.sectionBlock}>
              <AppText variant="heading3" style={styles.sectionHeading}>
                Pool Matches
              </AppText>

              {poolMatches.length === 0 ? (
                <EmptyState
                  title="No Pool Matches"
                  description={
                    pools.length < 2
                      ? 'Configure at least 2 pools and assign teams first.'
                      : 'Generate the pool play schedule above to create matches.'
                  }
                />
              ) : (
                poolMatches
                  .filter((m) => selectedPoolId === 'all' || m.pool_id === selectedPoolId)
                  .map((m) => {
                    const isCompleted = m.status === 'completed';
                    const teamAWon = isCompleted && m.winner_team_id === m.team_a_id;
                    const teamBWon = isCompleted && m.winner_team_id === m.team_b_id;
                    const poolObj = pools.find((p) => p.id === m.pool_id);

                    return (
                      <Card key={m.id} style={styles.matchCard}>
                        <View style={styles.matchMetaRow}>
                          <View style={styles.metaLeft}>
                            {poolObj && <Badge label={poolObj.name} variant="info" size="sm" />}
                            <AppText variant="caption" color="tertiary">
                              Round {m.round_number ?? '-'} • Match #{m.match_number ?? '-'}
                            </AppText>
                          </View>
                          <Badge
                            label={m.status_label}
                            variant={isCompleted ? 'success' : 'default'}
                          />
                        </View>

                        <View style={styles.matchTeamsContainer}>
                          <View style={[styles.matchTeamRow, teamAWon && styles.winnerHighlight]}>
                            <AppText
                              variant="body"
                              style={[styles.teamNameText, teamAWon && styles.winnerText]}
                            >
                              {m.team_a?.name ?? 'Team A'}
                            </AppText>
                            <AppText
                              variant="heading3"
                              style={[styles.scoreText, teamAWon && styles.winnerText]}
                            >
                              {m.score_a !== null ? m.score_a : '-'}
                            </AppText>
                          </View>

                          <View style={[styles.matchTeamRow, teamBWon && styles.winnerHighlight]}>
                            <AppText
                              variant="body"
                              style={[styles.teamNameText, teamBWon && styles.winnerText]}
                            >
                              {m.team_b?.name ?? 'Team B'}
                            </AppText>
                            <AppText
                              variant="heading3"
                              style={[styles.scoreText, teamBWon && styles.winnerText]}
                            >
                              {m.score_b !== null ? m.score_b : '-'}
                            </AppText>
                          </View>
                        </View>

                        <Button
                          label={isCompleted ? 'Edit Score' : 'Enter Score'}
                          variant={isCompleted ? 'secondary' : 'primary'}
                          size="sm"
                          onPress={() => openScoreModal(m)}
                          style={styles.scoreBtn}
                        />
                      </Card>
                    );
                  })
              )}
            </View>
          </View>
        )}

        {/* ─── TAB 6: CHAMPIONSHIP (POOL PLAY ONLY) ─── */}
        {activeTab === 'championship' && isPoolPlay && (
          <View style={styles.tabContent}>
            {canGenerateChampionship && (
              <Button
                label="Generate Championship Bracket"
                variant="primary"
                onPress={handleGenerateChampionship}
                loading={isGeneratingChampionship}
                style={styles.actionBtn}
              />
            )}

            {championshipMatches.length === 0 && !canGenerateChampionship && (
              <Card style={styles.infoBanner}>
                <AppText variant="caption" color="secondary">
                  🔒 Complete all pool play matches before generating the championship single-elimination bracket.
                </AppText>
              </Card>
            )}

            <ChampionshipBracketView
              matches={championshipMatches}
              onScoreMatch={openScoreModal}
            />
          </View>
        )}
      </ScrollView>

      {/* ─── CREATE / EDIT TEAM MODAL ─── */}
      <ModalSheet
        visible={showTeamModal}
        onClose={() => setShowTeamModal(false)}
        title={
          editingTeam
            ? teamSize === 1
              ? 'Edit Singles Entry'
              : 'Edit Team'
            : teamSize === 1
            ? 'Add Singles Player / Entry'
            : 'Create Fixed Partner Team'
        }
        subtitle={
          teamSize === 1
            ? 'Select exactly 1 confirmed player for this singles entry.'
            : 'Select exactly 2 confirmed players for this team.'
        }
        actions={[
          {
            label: 'Cancel',
            variant: 'secondary',
            onPress: () => setShowTeamModal(false),
          },
          {
            label: editingTeam
              ? teamSize === 1
                ? 'Save Entry'
                : 'Save Team'
              : teamSize === 1
              ? 'Add Entry'
              : 'Create Team',
            variant: 'primary',
            onPress: handleSaveTeam,
            loading: isCreatingTeam || isUpdatingTeam,
          },
        ]}
      >
        <View style={{ gap: Spacing[3], paddingBottom: Spacing[4] }}>
          {teamError && (
            <Card style={styles.errorCard}>
              <AppText variant="caption" style={styles.errorText}>
                {teamError}
              </AppText>
            </Card>
          )}

          <Input
            label={teamSize === 1 ? 'Player / Entry Name' : 'Team Name'}
            placeholder={teamSize === 1 ? 'e.g. John Doe' : 'e.g. The Dinking Duo'}
            value={teamName}
            onChangeText={setTeamName}
          />

          <Input
            label="Seed (Optional)"
            placeholder="e.g. 1"
            value={teamSeed}
            onChangeText={setTeamSeed}
            keyboardType="number-pad"
          />

          <AppText variant="caption" color="secondary" style={styles.pickerTitle}>
            Select {teamSize} {teamSize === 1 ? 'Player' : 'Players'} ({selectedPlayerIds.length}/{teamSize} selected):
          </AppText>

          <View style={styles.playerPickerList}>
            {confirmedRegistrations.map((reg) => {
              const isSelected = selectedPlayerIds.includes(reg.player_membership_id);
              return (
                <TouchableOpacity
                  key={reg.id}
                  style={[styles.pickerItem, isSelected && styles.pickerItemSelected]}
                  onPress={() => togglePlayerSelection(reg.player_membership_id)}
                >
                  <View>
                    <AppText variant="bodySmall">
                      {reg.display_name ?? reg.user_full_name ?? reg.user_email}
                    </AppText>
                    {reg.membership_number && (
                      <AppText variant="caption" color="tertiary">
                        #{reg.membership_number}
                      </AppText>
                    )}
                  </View>
                  <Badge
                    label={isSelected ? 'Selected' : 'Tap to Add'}
                    variant={isSelected ? 'success' : 'default'}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ModalSheet>

      {/* ─── ENTER / EDIT SCORE MODAL ─── */}
      <ModalSheet
        visible={showScoreModal}
        onClose={() => setShowScoreModal(false)}
        title={selectedMatch?.status === 'completed' ? 'Correct Score' : 'Record Score'}
        subtitle="Standard pickleball rules: First to 11 points, win by at least 2."
        actions={[
          {
            label: 'Cancel',
            variant: 'secondary',
            onPress: () => setShowScoreModal(false),
          },
          {
            label: 'Save Score',
            variant: 'primary',
            onPress: handleSaveScore,
            loading:
              isRecordingResult ||
              isCorrectingResult ||
              isRecordingPoolResult ||
              isCorrectingPoolResult ||
              isRecordingChampionshipResult ||
              isCorrectingChampionshipResult ||
              isRecordingScrambleResult ||
              isCorrectingScrambleResult,
          },
        ]}
      >
        <View style={{ gap: Spacing[3], paddingBottom: Spacing[4] }}>
          {scoreError && (
            <Card style={styles.errorCard}>
              <AppText variant="caption" style={styles.errorText}>
                {scoreError}
              </AppText>
            </Card>
          )}

          <View style={styles.scoreInputRow}>
            <View style={styles.scoreInputCol}>
              <AppText variant="bodySmall" numberOfLines={1}>
                {isScramble
                  ? selectedMatch?.side_a_participants &&
                    selectedMatch.side_a_participants.length > 0
                    ? selectedMatch.side_a_participants
                        .map((p) => p.display_name || 'Player')
                        .join(' & ')
                    : 'Side A'
                  : selectedMatch?.team_a?.name ?? 'Team A'}
              </AppText>
              <Input
                label="Score"
                placeholder="11"
                value={scoreA}
                onChangeText={setScoreA}
                keyboardType="number-pad"
              />
            </View>

            <AppText variant="heading3" style={styles.scoreVs}>
              VS
            </AppText>

            <View style={styles.scoreInputCol}>
              <AppText variant="bodySmall" numberOfLines={1}>
                {isScramble
                  ? selectedMatch?.side_b_participants &&
                    selectedMatch.side_b_participants.length > 0
                    ? selectedMatch.side_b_participants
                        .map((p) => p.display_name || 'Player')
                        .join(' & ')
                    : 'Side B'
                  : selectedMatch?.team_b?.name ?? 'Team B'}
              </AppText>
              <Input
                label="Score"
                placeholder="7"
                value={scoreB}
                onChangeText={setScoreB}
                keyboardType="number-pad"
              />
            </View>
          </View>
        </View>
      </ModalSheet>

      {/* ─── POOL CONFIGURE MODAL ─── */}
      <PoolConfigureModal
        visible={showConfigureModal}
        onClose={() => setShowConfigureModal(false)}
        onSave={handleConfigurePools}
        teamsCount={teams.length}
        initialNumPools={pools.length > 0 ? pools.length : 2}
        initialQualifiers={tournament.format_configuration?.qualifiers_per_pool ?? 1}
      />

      {/* ─── POOL MANUAL ASSIGN MODAL ─── */}
      <PoolManualAssignModal
        visible={showManualAssignModal}
        onClose={() => setShowManualAssignModal(false)}
        onSave={handleAssignManual}
        teams={teams}
        pools={pools}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[2],
    paddingBottom: Spacing[2],
  },
  backBtn: {
    paddingVertical: Spacing[1],
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
    flexWrap: 'wrap',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing[4],
    paddingBottom: Spacing[8],
    gap: Spacing[4],
  },
  tabContent: {
    gap: Spacing[4],
  },
  overviewCard: {
    gap: Spacing[2],
  },
  overviewDesc: {
    marginTop: Spacing[1],
  },
  lifecycleButtons: {
    flexDirection: 'row',
    gap: Spacing[2],
    marginTop: Spacing[1],
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing[1],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontWeight: Typography.weight.medium,
  },
  actionBtn: {
    marginBottom: Spacing[1],
  },
  infoBanner: {
    backgroundColor: Colors.background.secondary,
    padding: Spacing[2],
  },
  teamCard: {
    gap: Spacing[2],
  },
  teamActions: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  iconBtn: {
    padding: Spacing[1],
  },
  deleteText: {
    color: Colors.status.error,
  },
  membersList: {
    flexDirection: 'row',
    gap: Spacing[2],
    flexWrap: 'wrap',
  },
  memberTag: {
    backgroundColor: Colors.surface.border,
    paddingHorizontal: Spacing[2],
    paddingVertical: Spacing[1],
    borderRadius: Radius.full,
  },
  roundScroll: {
    marginBottom: Spacing[1],
  },
  roundChip: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[1],
    borderRadius: Radius.full,
    backgroundColor: Colors.background.secondary,
    marginRight: Spacing[1],
  },
  roundChipActive: {
    backgroundColor: Colors.brand.primary,
  },
  roundChipText: {
    color: Colors.text.secondary,
  },
  roundChipTextActive: {
    color: Colors.text.inverse,
    fontWeight: Typography.weight.bold,
  },
  matchCard: {
    gap: Spacing[2],
  },
  matchMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  matchTeamsContainer: {
    gap: Spacing[1],
    backgroundColor: Colors.background.secondary,
    padding: Spacing[2],
    borderRadius: Radius.md,
  },
  matchTeamRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing[1],
  },
  winnerHighlight: {
    backgroundColor: Colors.surface.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing[1],
  },
  teamNameText: {
    flex: 1,
  },
  scoreText: {
    fontWeight: Typography.weight.bold,
  },
  winnerText: {
    color: Colors.brand.primary,
    fontWeight: Typography.weight.bold,
  },
  scoreBtn: {
    marginTop: Spacing[1],
  },
  standingsCard: {
    padding: Spacing[2],
  },
  standingsHeader: {
    flexDirection: 'row',
    paddingVertical: Spacing[1],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
  },
  standingsRow: {
    flexDirection: 'row',
    paddingVertical: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
    alignItems: 'center',
  },
  colRank: {
    width: 28,
    textAlign: 'center',
  },
  colTeam: {
    flex: 1,
    paddingHorizontal: Spacing[1],
  },
  colStat: {
    width: 36,
    textAlign: 'center',
  },
  positiveDiff: {
    color: Colors.status.success,
    fontWeight: Typography.weight.bold,
  },
  pickerTitle: {
    marginTop: Spacing[1],
  },
  playerPickerList: {
    maxHeight: 180,
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
    borderRadius: Radius.sm,
  },
  pickerItemSelected: {
    backgroundColor: Colors.background.secondary,
  },
  scoreInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[4],
  },
  scoreInputCol: {
    flex: 1,
    gap: Spacing[1],
  },
  scoreVs: {
    alignSelf: 'center',
    color: Colors.text.tertiary,
  },
  errorCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: Colors.status.error,
    padding: Spacing[2],
  },
  errorText: {
    color: Colors.status.error,
  },
  unsupportedCard: {
    margin: Spacing[4],
    gap: Spacing[4],
  },
  unsupportedDesc: {
    lineHeight: 20,
  },
  // Pool Play additions
  poolActionCard: {
    gap: Spacing[2],
    backgroundColor: Colors.background.secondary,
  },
  poolActionRow: {
    flexDirection: 'row',
    gap: Spacing[2],
    marginTop: Spacing[1],
  },
  poolActionBtn: {
    flex: 1,
  },
  teamBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginTop: Spacing[1],
  },
  stageTrackerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing[2],
  },
  stageStep: {
    alignItems: 'center',
    gap: Spacing[1],
  },
  stageStepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageStepCircleDone: {
    backgroundColor: Colors.brand.primary,
  },
  stageStepCircleActive: {
    backgroundColor: Colors.brand.accent,
  },
  stageStepTextDone: {
    color: Colors.text.inverse,
    fontWeight: Typography.weight.bold,
  },
  stageConnector: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.surface.border,
    marginHorizontal: Spacing[2],
    marginBottom: Spacing[4],
  },
  stageConnectorActive: {
    backgroundColor: Colors.brand.primary,
  },
  poolConfigGrid: {
    flexDirection: 'row',
    gap: Spacing[4],
    marginTop: Spacing[2],
  },
  poolConfigItem: {
    flex: 1,
    gap: Spacing[1],
  },
  sectionBlock: {
    gap: Spacing[2],
  },
  sectionHeading: {
    marginBottom: Spacing[1],
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  structureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[3],
    marginTop: Spacing[1],
  },
  structureItem: {
    minWidth: '45%',
    flex: 1,
    gap: 2,
  },
  capacityBanner: {
    backgroundColor: Colors.background.secondary,
    padding: Spacing[2],
    borderRadius: Radius.sm,
    marginTop: Spacing[1],
  },
  capacityBannerText: {
    color: Colors.brand.primary,
    fontWeight: '600',
  },
});
