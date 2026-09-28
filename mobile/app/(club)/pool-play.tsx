/**
 * Aught2 Pickleball — Pool Play Tournament Mode Screen
 *
 * Full Pool Play Tournament Mode Workspace providing:
 * - Tab 1: Teams & Pools (Snake-draft auto-balance, rating tolerance checks, partner swap, player edit)
 * - Tab 2: Matchups (Intra-pool round-robin, court rotation, live playing now, pickleball score entry)
 * - Tab 3: Standings (Wins -> Diff -> Pts For tiebreakers, qualifiers, completion celebration)
 * - Tab 4: Championship Bracket (Seeding, automatic BYEs, live winner progression)
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
  ChampionshipBracketTab,
  MatchupsTab,
  PoolPlayOverviewTab,
  PoolPlayResultsTab,
  PoolPlaySetupCourtsTab,
  Screen,
  SetupCourtsModal,
  StandingsTab,
  TeamsPoolsTab,
  TournamentManagementHeader,
  TournamentSettingsTab,
  DraftTournamentBanner,
  RegistrationOpenBanner,
  LoadingState,
  ErrorState,
} from '@/components';
import {
  useActiveClub,
  useClubCourts,
  usePermission,
  useTeams,
  useTournamentDetails,
  useTournamentRegistrations,
} from '@/hooks';
import { competitionApi } from '@/services/api/competition';
import { tournamentApi } from '@/services/api/tournaments';
import { getTournamentNavigationTabs, type TournamentTabKey } from '@/navigation';
import { Colors, Spacing } from '@/theme';
import type {
  BracketType,
  ChampionshipMatch,
  Match,
  PoolPlayConfig,
  Team,
} from '@/types/poolPlay';
import {
  advanceBracketWinner,
  balancePools,
  calculatePoolStandings,
  createMatchups,
  DEFAULT_COURTS,
  generateChampionshipBracket,
  recalculateStats,
} from '@/utils/poolPlayLogic';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';

export default function PoolPlayManagementScreen() {
  const router = useRouter();
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const { clubId, clubName } = useActiveClub();
  const { courts: clubCourts } = useClubCourts(clubId);
  const activeClubCourts = useMemo(() => (clubCourts || []).filter(c => c.is_active), [clubCourts]);
  const { isOwner, isManager, isTournamentDirector, canManageTournaments } = usePermission();
  const canManage = isOwner || isManager || isTournamentDirector || canManageTournaments;

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
  } = useTournamentDetails(clubId, tournamentId ?? null);

  const {
    registrations,
    refetch: refetchRegs,
  } = useTournamentRegistrations(clubId, tournamentId ?? null);

  const {
    teams: apiTeams,
    refetch: refetchTeams,
  } = useTeams(clubId, tournamentId ?? null);

  // Active Tab: defaults to 'overview'
  const [activeTab, setActiveTab] = useState<TournamentTabKey>('overview');

  // Config
  const [config, setConfig] = useState<PoolPlayConfig>({
    numPools: 2,
    numCourts: 3,
    courts: DEFAULT_COURTS,
    balanceTolerance: 0.5,
    qualifierCount: 4,
    bracketType: 'Single Elimination',
    poolPlayCompleted: false,
  });

  // State: Teams, Matches, Championship Bracket (Initialized empty - NO hardcoded demo data)
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [championshipMatches, setChampionshipMatches] = useState<ChampionshipMatch[]>([]);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const tournamentConfig = useMemo(() => parseTournamentConfig(tournament), [tournament]);

  // Synchronize persisted format configuration from backend
  React.useEffect(() => {
    if (tournament?.format_configuration) {
      const fc = tournament.format_configuration as Record<string, any>;
      setConfig((prev) => ({
        ...prev,
        numPools: typeof fc.pool_count === 'number' && fc.pool_count >= 2 ? fc.pool_count : prev.numPools,
        numCourts: typeof fc.courts_count === 'number' && fc.courts_count >= 1 ? fc.courts_count : prev.numCourts,
        qualifierCount: typeof fc.qualifier_count === 'number' && fc.qualifier_count >= 2 ? fc.qualifier_count : prev.qualifierCount,
        bracketType: (fc.bracket_type as BracketType) || prev.bracketType,
        balanceTolerance: typeof fc.balance_tolerance === 'number' ? fc.balance_tolerance : prev.balanceTolerance,
      }));
    }
  }, [tournament?.format_configuration]);

  const handleSavePoolConfig = async (updated: Partial<PoolPlayConfig>) => {
    setConfig((prev) => ({ ...prev, ...updated }));
    if (clubId && tournamentId) {
      try {
        const nextPoolCount = updated.numPools ?? config.numPools;
        const nextCourts = updated.courts ?? config.courts;
        const nextQualifierCount = updated.qualifierCount ?? config.qualifierCount;
        const nextBracketType = updated.bracketType ?? config.bracketType;
        const nextTolerance = updated.balanceTolerance ?? config.balanceTolerance;

        await tournamentApi.updateTournament(clubId, tournamentId, {
          format_configuration: {
            ...(tournament?.format_configuration || {}),
            pool_count: nextPoolCount,
            courts_count: nextCourts?.length || config.numCourts,
            qualifier_count: nextQualifierCount,
            bracket_type: nextBracketType,
            balance_tolerance: nextTolerance,
          },
        });

        try {
          await competitionApi.configurePools(clubId, tournamentId, {
            number_of_pools: nextPoolCount,
            qualifiers_per_pool: Math.max(1, Math.floor(nextQualifierCount / nextPoolCount)),
          });
        } catch {
          // non-critical if pool stage hasn't reached configuration
        }
        void refetchTournament();
      } catch (err) {
        console.warn('Failed to persist pool configuration:', err);
      }
    }
  };

  // Synchronize actual teams and registrations into Pool Play state
  React.useEffect(() => {
    if (apiTeams && apiTeams.length > 0) {
      const mapped: Team[] = apiTeams.map((t, idx) => {
        const p1Mem = t.members?.[0];
        const p2Mem = t.members?.[1];
        const p1Name = p1Mem?.display_name || p1Mem?.user_email || `Player 1`;
        const p2Name = p2Mem?.display_name || p2Mem?.user_email || `Player 2`;
        const p1Avatar = p1Name.slice(0, 2).toUpperCase();
        const p2Avatar = p2Name.slice(0, 2).toUpperCase();
        const pool = idx % config.numPools === 0 ? 'A' : 'B';
        return {
          id: t.id,
          teamNum: idx + 1,
          name: t.name || `Team ${idx + 1}`,
          p1: {
            id: p1Mem?.player_membership_id || `p-${idx}-1`,
            name: p1Name,
            rating: 4.0,
            avatar: p1Avatar,
            color: '#1E3A8A',
          },
          p2: {
            id: p2Mem?.player_membership_id || `p-${idx}-2`,
            name: p2Name,
            rating: 4.0,
            avatar: p2Avatar,
            color: '#047857',
          },
          pool,
          avgRating: 4.0,
          spread: 0.0,
        };
      });
      setTeams(mapped);
    } else if (registrations && registrations.length > 0) {
      const confirmedRegs = registrations.filter((r) => r.status === 'confirmed');
      const isDoubles = tournamentConfig.teamSize === 2;
      const mapped: Team[] = [];
      if (isDoubles) {
        for (let i = 0; i < confirmedRegs.length; i += 2) {
          const r1 = confirmedRegs[i];
          const r2 = confirmedRegs[i + 1];
          if (!r1) break;
          const p1Name = r1.display_name || r1.user_full_name || r1.user_email || `Player ${i + 1}`;
          const p2Name = r2
            ? r2.display_name || r2.user_full_name || r2.user_email || `Player ${i + 2}`
            : 'TBD Partner';
          const teamIdx = Math.floor(i / 2);
          mapped.push({
            id: `team-reg-${teamIdx}`,
            teamNum: teamIdx + 1,
            name: `Team ${teamIdx + 1}`,
            p1: {
              id: r1.player_membership_id,
              name: p1Name,
              rating: 4.0,
              avatar: p1Name.slice(0, 2).toUpperCase(),
              color: '#1E3A8A',
            },
            p2: {
              id: r2 ? r2.player_membership_id : `tbd-${teamIdx}`,
              name: p2Name,
              rating: 4.0,
              avatar: p2Name.slice(0, 2).toUpperCase(),
              color: '#047857',
            },
            pool: teamIdx % config.numPools === 0 ? 'A' : 'B',
            avgRating: 4.0,
            spread: 0.0,
          });
        }
      } else {
        confirmedRegs.forEach((r, idx) => {
          const pName = r.display_name || r.user_full_name || r.user_email || `Player ${idx + 1}`;
          mapped.push({
            id: `team-reg-${idx}`,
            teamNum: idx + 1,
            name: pName,
            p1: {
              id: r.player_membership_id,
              name: pName,
              rating: 4.0,
              avatar: pName.slice(0, 2).toUpperCase(),
              color: '#1E3A8A',
            },
            p2: {
              id: r.player_membership_id,
              name: pName,
              rating: 4.0,
              avatar: pName.slice(0, 2).toUpperCase(),
              color: '#1E3A8A',
            },
            pool: idx % config.numPools === 0 ? 'A' : 'B',
            avgRating: 4.0,
            spread: 0.0,
          });
        });
      }
      setTeams(mapped);
    } else {
      setTeams([]);
    }
  }, [apiTeams, registrations, config.numPools, tournamentConfig.teamSize]);

  // Calculated Stats
  const { updatedTeams, pools, poolDiff, isWithinTolerance } = useMemo(() => {
    return recalculateStats(teams, config);
  }, [teams, config]);

  // Standings
  const standingsByPool = useMemo(() => {
    const qualPerPool = Math.max(1, Math.floor(config.qualifierCount / config.numPools));
    return calculatePoolStandings(pools, matches, qualPerPool);
  }, [pools, matches, config.qualifierCount, config.numPools]);

  const isPoolPlayComplete = useMemo(() => {
    if (matches.length === 0) return false;
    return matches.every((m) => m.status === 'completed');
  }, [matches]);

  const isChampionshipComplete = useMemo(() => {
    if (championshipMatches.length === 0) return false;
    const finals = championshipMatches.find(
      (m) => m.roundName === 'Finals' || m.roundName?.toLowerCase().includes('final')
    );
    if (finals) {
      return finals.status === 'completed';
    }
    return championshipMatches.every((m) => m.status === 'completed');
  }, [championshipMatches]);

  const isTournamentCompleted = useMemo(() => {
    if (tournament?.status === 'completed') return true;
    if (championshipMatches.length > 0) {
      return isChampionshipComplete;
    }
    if (config.qualifierCount === 0 && matches.length > 0) {
      return matches.every((m) => m.status === 'completed');
    }
    return false;
  }, [tournament?.status, championshipMatches.length, isChampionshipComplete, config.qualifierCount, matches]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const handleBalancePools = () => {
    if (teams.length < 2) {
      Alert.alert('Cannot Balance Pools', 'At least 2 registered teams are required to balance pools.');
      return;
    }
    const balanced = balancePools(teams, config.numPools);
    setTeams(balanced);

    // Compute preview
    const { pools: newPools, poolDiff: newDiff } = recalculateStats(balanced, config);
    const pA = newPools.find((p) => p.key === 'A');
    const pB = newPools.find((p) => p.key === 'B');

    Alert.alert(
      'Pools Balanced!',
      `Auto-balanced via Snake Draft Seeding.\n` +
        `Pool A Avg: ${pA?.avgTeamRating.toFixed(2) ?? '—'}\n` +
        `Pool B Avg: ${pB?.avgTeamRating.toFixed(2) ?? '—'}\n` +
        `Diff: ${newDiff.toFixed(2)} (${newDiff <= config.balanceTolerance ? 'Within' : 'Exceeds'} ±${config.balanceTolerance.toFixed(2)})`
    );
  };

  const handleAddTeam = (newTeam: Team) => {
    setTeams((prev) => [...prev, newTeam]);
    Alert.alert('Team Added', `${newTeam.name} has been added to Pool ${newTeam.pool}.`);
  };

  const handleDeleteTeam = (teamId: string) => {
    setTeams((prev) => prev.filter((t) => t.id !== teamId));
  };

  const handleMoveTeamPool = (teamId: string, targetPool: string) => {
    setTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, pool: targetPool } : t))
    );
  };

  const handleUpdatePlayerRating = (
    teamId: string,
    slot: 'p1' | 'p2',
    newRating: number
  ) => {
    setTeams((prev) =>
      prev.map((t) => {
        if (t.id !== teamId) return t;
        const updatedPlayer = {
          ...(slot === 'p1' ? t.p1 : t.p2),
          rating: newRating,
        };
        return {
          ...t,
          [slot]: updatedPlayer,
        };
      })
    );
  };

  const handleSwapPlayers = (
    sourceTeamId: string,
    sourceSlot: 'p1' | 'p2',
    targetTeamId: string,
    targetSlot: 'p1' | 'p2'
  ) => {
    setTeams((prev) => {
      const sourceTeam = prev.find((t) => t.id === sourceTeamId);
      const targetTeam = prev.find((t) => t.id === targetTeamId);
      if (!sourceTeam || !targetTeam) return prev;

      const sourcePlayer = sourceSlot === 'p1' ? sourceTeam.p1 : sourceTeam.p2;
      const targetPlayer = targetSlot === 'p1' ? targetTeam.p1 : targetTeam.p2;

      return prev.map((t) => {
        if (t.id === sourceTeamId) {
          return {
            ...t,
            [sourceSlot]: targetPlayer,
          };
        }
        if (t.id === targetTeamId) {
          return {
            ...t,
            [targetSlot]: sourcePlayer,
          };
        }
        return t;
      });
    });

    Alert.alert('Partner Swapped', 'Players have been swapped and stats recalculated.');
  };

  const handleCreateMatchups = () => {
    if (teams.length < 2) {
      Alert.alert('Cannot Create Matchups', 'At least 2 registered teams are required to generate pool matchups.');
      return;
    }
    const generated = createMatchups(pools, config.courts);
    setMatches(generated);
    setActiveTab('matchups');
    Alert.alert(
      'Matchups Created',
      `Generated ${generated.length} intra-pool round robin matches across ${config.courts.length} courts.`
    );
  };

  const handleStartRound = () => {
    // Move first available upcoming matches into 'playing' on open courts
    const maxPlaying = config.courts.length;
    let count = 0;

    setMatches((prev) =>
      prev.map((m) => {
        if (m.status === 'upcoming' && count < maxPlaying) {
          count++;
          return { ...m, status: 'playing' };
        }
        return m;
      })
    );

    Alert.alert('Round Started', `Courts are active! Showing live matches.`);
  };

  const handleRecordPoolScore = async (matchId: string, score1: number, score2: number) => {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id !== matchId) return m;
        const winner = score1 > score2 ? m.t1 : m.t2;
        return {
          ...m,
          score1,
          score2,
          status: 'completed',
          winner,
        };
      })
    );
    if (clubId && tournamentId && /^[0-9a-fA-F-]{36}$/.test(matchId)) {
      try {
        await competitionApi.recordMatchResult(clubId, tournamentId, matchId, {
          score_a: score1,
          score_b: score2,
        });
      } catch {
        try {
          await competitionApi.correctMatchResult(clubId, tournamentId, matchId, {
            score_a: score1,
            score_b: score2,
          });
        } catch {
          // Keep local state update
        }
      }
    }
  };

  const handleGenerateChampionshipBracket = () => {
    if (!isPoolPlayComplete) {
      Alert.alert(
        'Pool Play Incomplete',
        'All pool matches must be completed before generating the championship bracket.'
      );
      return;
    }
    const generated = generateChampionshipBracket(
      standingsByPool,
      config.qualifierCount,
      config.bracketType,
      config.courts
    );
    setChampionshipMatches(generated);
    Alert.alert(
      'Bracket Generated',
      `Championship bracket generated with ${generated.length} matches and deterministic cross-pool seeding.`
    );
  };

  const handleRecordBracketScore = async (
    matchId: string,
    score1: number,
    score2: number
  ) => {
    setChampionshipMatches((prev) => advanceBracketWinner(prev, matchId, score1, score2));
    if (clubId && tournamentId && /^[0-9a-fA-F-]{36}$/.test(matchId)) {
      try {
        await competitionApi.recordMatchResult(clubId, tournamentId, matchId, {
          score_a: score1,
          score_b: score2,
        });
      } catch {
        try {
          await competitionApi.correctMatchResult(clubId, tournamentId, matchId, {
            score_a: score1,
            score_b: score2,
          });
        } catch {
          // Keep local state update
        }
      }
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

  const handleCloseRegistration = () => {
    Alert.alert(
      'Close Registration?',
      `Closing registration for "${tournament?.name ?? 'this tournament'}" will:\n\n• Prevent any new player registrations or withdrawals\n• Finalize participant rosters and assign seeds\n• Enable Pool configuration and matchup generation`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close Registration',
          style: 'destructive',
          onPress: async () => {
            try {
              await closeRegistration();
              void refetchTournament();
              void refetchRegs();
              void refetchTeams();
              Alert.alert(
                'Registration Closed',
                'Registration is now closed. Rosters are locked and you can now configure pools and generate matchups.'
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
              void refetchTournament();
              Alert.alert('Tournament Started!', 'The tournament is now live.');
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
    const buttons: { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[] = [];

    if (isDraft) {
      buttons.push({
        text: 'Publish & Open Registration',
        onPress: handlePublishTournament,
      });
    }

    if (isRegOpen) {
      buttons.push({
        text: 'Close Registration',
        onPress: handleCloseRegistration,
      });
    }

    if (isRegClosed && matches.length === 0) {
      buttons.push({
        text: 'Reopen Registration',
        onPress: handlePublishTournament,
      });
    }

    if (isRegClosed && matches.length > 0) {
      buttons.push({
        text: 'Start Tournament (Go Live)',
        onPress: handleStartTournament,
      });
    }

    buttons.push(
      {
        text: 'Setup & Courts',
        onPress: () => setActiveTab('setup_courts'),
      },
      {
        text: 'Refresh Data',
        onPress: () => {
          void refetchTournament();
          void refetchRegs();
          void refetchTeams();
        },
      },
      {
        text: 'Back to Tournaments',
        onPress: () => router.back(),
      },
      { text: 'Cancel', style: 'cancel' }
    );

    Alert.alert(
      tournament?.name ?? 'Pool Play Tournament',
      `Status: ${tournament?.status_label ?? tournament?.status ?? ''}`,
      buttons
    );
  };

  const isSingles = tournamentConfig.teamSize === 1;

  const navTabs = useMemo(() => {
    return getTournamentNavigationTabs(tournament, {
      participantsCount: updatedTeams.length,
      teamsCount: updatedTeams.length,
      matchesCount: matches.length,
      poolsCount: pools.length || config.numPools,
    });
  }, [tournament, updatedTeams.length, matches.length, pools.length, config.numPools]);

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
    if (tournament?.status === 'registration_closed' && matches.length > 0 && !isPoolPlayComplete) {
      return {
        label: 'Start Tournament',
        onPress: handleStartTournament,
        isLoading: isStartingTournament,
      };
    }
    if (matches.length > 0 && !isPoolPlayComplete) {
      return {
        label: 'Enter Scores',
        onPress: () => setActiveTab('matchups'),
      };
    }
    if (isPoolPlayComplete && championshipMatches.length === 0) {
      return {
        label: 'Generate Bracket',
        onPress: () => {
          handleGenerateChampionshipBracket();
          setActiveTab('championship');
        },
      };
    }
    return null;
  }, [
    tournament?.status,
    isOpenRegistrationPending,
    isCloseRegistrationPending,
    isStartingTournament,
    teams.length,
    matches.length,
    isPoolPlayComplete,
    championshipMatches.length,
    canManage,
    handleCloseRegistration,
    handleCreateMatchups,
    handleGenerateChampionshipBracket,
    handlePublishTournament,
    handleStartTournament,
  ]);

  // ─── Loading & Error Guards (matches Bracket, Round Robin, Scramble pattern) ─
  if (isLoadingTournament && !tournament) {
    return (
      <Screen safeArea={false}>
        <LoadingState message="Loading Pool Play workspace..." />
      </Screen>
    );
  }

  if (tournamentError && !tournament) {
    return (
      <Screen safeArea={false}>
        <ErrorState
          title="Failed to load tournament"
          message={tournamentError.message}
          onRetry={() => { void refetchTournament(); }}
        />
      </Screen>
    );
  }

  return (
    <Screen safeArea={false}>
      {/* ─── Top Standardized Management Header ─────────────────────────────── */}
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
          participantCount={registrations.length}
          maxParticipants={tournament?.max_participants}
          onCloseRegistration={handleCloseRegistration}
          isClosing={isCloseRegistrationPending}
        />
      )}

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingTournament}
            onRefresh={() => void refetchTournament()}
          />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Tab 1: Overview ───────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <PoolPlayOverviewTab
            tournament={tournament!}
            teams={updatedTeams}
            matches={matches}
            championshipMatches={championshipMatches}
            pools={pools}
            config={config}
            isPoolPlayComplete={isPoolPlayComplete}
            isChampionshipComplete={isChampionshipComplete}
            isSingles={isSingles}
            onNavigateTab={(tab) => setActiveTab(tab as TournamentTabKey)}
          />
        )}

        {/* ─── Tab 2: Players & Pools / Teams & Pools ─────────────────── */}
        {(activeTab === 'participants' || (activeTab as string) === 'teams_pools') && (
          <TeamsPoolsTab
            teams={updatedTeams}
            pools={pools}
            poolDiff={poolDiff}
            isWithinTolerance={isWithinTolerance}
            config={config}
            isSingles={isSingles}
            onBalancePools={handleBalancePools}
            onAddTeam={handleAddTeam}
            onDeleteTeam={handleDeleteTeam}
            onMoveTeamPool={handleMoveTeamPool}
            onUpdatePlayerRating={handleUpdatePlayerRating}
            onSwapPlayers={handleSwapPlayers}
            onToleranceChange={(tol) =>
              setConfig((prev) => ({ ...prev, balanceTolerance: tol }))
            }
            onCreateMatchups={handleCreateMatchups}
          />
        )}

        {/* ─── Tab 3: Matchups ───────────────────────────────────────── */}
        {activeTab === 'matchups' && (
          <MatchupsTab
            matches={matches}
            pools={pools}
            onStartRound={handleStartRound}
            onRecordScore={handleRecordPoolScore}
            onCreateMatchups={handleCreateMatchups}
            isTournamentCompleted={isTournamentCompleted}
          />
        )}

        {/* ─── Tab 4: Standings ──────────────────────────────────────── */}
        {activeTab === 'standings' && (
          <StandingsTab
            pools={pools}
            standingsByPool={standingsByPool}
            isPoolPlayComplete={isPoolPlayComplete}
            hasMatchups={matches.length > 0}
            matches={matches}
            qualifierCountPerPool={Math.max(1, Math.floor(config.qualifierCount / config.numPools))}
            onGoToMatchups={() => setActiveTab('matchups')}
            hasChampionshipBracket={championshipMatches.length > 0}
            isTournamentCompleted={isTournamentCompleted}
            onNavigateToBracket={() => setActiveTab('championship')}
            onAdvanceToBracket={() => {
              handleGenerateChampionshipBracket();
              setActiveTab('championship');
            }}
          />
        )}

        {/* ─── Tab 5: Championship Bracket ───────────────────────────── */}
        {activeTab === 'championship' && (
          <ChampionshipBracketTab
            standingsByPool={standingsByPool}
            championshipMatches={championshipMatches}
            courts={config.courts}
            bracketType={config.bracketType}
            qualifierCount={config.qualifierCount}
            isPoolPlayComplete={isPoolPlayComplete}
            isTournamentCompleted={isTournamentCompleted}
            onGenerateBracket={handleGenerateChampionshipBracket}
            onRecordBracketScore={handleRecordBracketScore}
          />
        )}

        {/* ─── Tab 6: Setup & Courts (Dedicated Tab) ─────────────────── */}
        {activeTab === 'setup_courts' && (
          <PoolPlaySetupCourtsTab
            config={config}
            onSaveConfig={handleSavePoolConfig}
            canManage={canManage}
            registeredCount={updatedTeams.length}
            maxParticipants={tournament?.max_participants}
            clubCourts={activeClubCourts}
            clubName={clubName ?? undefined}
          />
        )}

        {/* ─── Tab 7: Results ────────────────────────────────────────── */}
        {activeTab === 'results' && (
          <PoolPlayResultsTab
            tournament={tournament}
            teams={updatedTeams}
            matches={matches}
            championshipMatches={championshipMatches}
            standingsByPool={standingsByPool}
            isSingles={isSingles}
          />
        )}

        {/* ─── Tab 8: Settings ───────────────────────────────────────── */}
        {activeTab === 'settings' && (
          <TournamentSettingsTab
            tournament={tournament ?? null}
          />
        )}
      </ScrollView>

      {/* ─── Setup & Courts Modal ──────────────────────────────────── */}
      <SetupCourtsModal
        visible={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        config={config}
        onSaveConfig={handleSavePoolConfig}
        registeredCount={updatedTeams.length}
        maxParticipants={tournament?.max_participants}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  contentContainer: {
    padding: Spacing[4],
  },
  optionsBtn: {
    padding: 6,
    borderRadius: 8,
  },
});
