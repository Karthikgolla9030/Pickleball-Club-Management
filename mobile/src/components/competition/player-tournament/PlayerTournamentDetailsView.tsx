/**
 * Aught2 Pickleball — PlayerTournamentDetailsView
 *
 * Central standardized view for Player Side Tournament Details across all 4 formats:
 *   1. Round Robin:   Overview & Rules | Players | Matches | Standings | Results
 *   2. Bracket:       Overview & Rules | Players | Bracket | Matches | Standings
 *   3. Pool Play:     Overview & Rules | Players | Pools & Standings | Championship Bracket | Matches | Standings | Results
 *   4. Scramble:      Overview & Rules | Players | Matches | Standings | Results
 *
 * Sourced entirely from actual backend hooks:
 *   - usePlayerTeams, usePlayerTournamentRegistrations, usePlayerMatches, usePlayerStandings
 *   - usePlayerBracket (for Bracket)
 *   - usePlayerPools, usePlayerPoolStandings, usePlayerChampionshipMatches (for Pool Play)
 *   - usePlayerScramble (for Scramble)
 */

import React, { useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import {
  usePlayerBracket,
  usePlayerChampionshipMatches,
  usePlayerMatches,
  usePlayerPoolStandings,
  usePlayerScramble,
  usePlayerStandings,
  usePlayerTeams,
  usePlayerTournamentRegistrations,
  useAuth,
} from '@/hooks';
import type { Tournament } from '@/types';
import { isConsolationMatch } from '@/utils/bracketLogic';

import { PlayerTournamentHeader } from './PlayerTournamentHeader';
import { PlayerTournamentBanner } from './PlayerTournamentBanner';
import { PlayerTournamentTabs, type TabItem } from './PlayerTournamentTabs';
import { PlayerTournamentOverviewTab } from './PlayerTournamentOverviewTab';
import { PlayerTournamentPlayersTab } from './PlayerTournamentPlayersTab';
import { PlayerTournamentMatchesTab } from './PlayerTournamentMatchesTab';
import { PlayerTournamentStandingsTab } from './PlayerTournamentStandingsTab';
import { PlayerTournamentResultsTab } from './PlayerTournamentResultsTab';
import { PlayerTournamentBracketTab } from './PlayerTournamentBracketTab';
import { PlayerTournamentPoolsTab } from './PlayerTournamentPoolsTab';

export interface PlayerTournamentDetailsViewProps {
  tournament: Tournament;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  isRefreshing?: boolean;
  onRegister?: () => void;
  initialTab?: string;
}

export function PlayerTournamentDetailsView({
  tournament,
  onBack,
  onRefresh,
  isRefreshing = false,
  onRegister,
  initialTab = 'overview',
}: PlayerTournamentDetailsViewProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const tournamentId = tournament.id;
  const format = tournament.format || 'round_robin';
  const status = (tournament.status || 'draft') as string;

  // ─── 1. Backend Data Hooks ───
  const { teams = [], refetch: refetchTeams } = usePlayerTeams(tournamentId);
  const { registrations = [], refetch: refetchRegistrations } =
    usePlayerTournamentRegistrations(tournamentId);
  const { matches = [], refetch: refetchMatches } = usePlayerMatches(tournamentId);
  const { standings = [], refetch: refetchStandings } = usePlayerStandings(tournamentId);

  // Format-specific hooks
  const {
    matches: bracketMatches = [],
    refetchMatches: refetchBracketMatches,
    refetchSummary: refetchBracketSummary,
  } = usePlayerBracket(format === 'bracket' ? tournamentId : null);

  const {
    poolsStandings = [],
    refetch: refetchPoolStandings,
  } = usePlayerPoolStandings(format === 'pool_play' ? tournamentId : null, 'all');

  const poolAStandings = useMemo(() => {
    const poolA = poolsStandings.find(
      (p) => p.pool_name?.toLowerCase().includes('a') || p.pool_id === 'pool_a'
    );
    return poolA?.standings ?? [];
  }, [poolsStandings]);

  const poolBStandings = useMemo(() => {
    const poolB = poolsStandings.find(
      (p) => p.pool_name?.toLowerCase().includes('b') || p.pool_id === 'pool_b'
    );
    return poolB?.standings ?? [];
  }, [poolsStandings]);

  const {
    matches: championshipMatches = [],
    refetch: refetchChampionship,
  } = usePlayerChampionshipMatches(format === 'pool_play' ? tournamentId : null);

  const {
    standings: scrambleStandings = [],
    matches: scrambleMatches = [],
    refetchState: refetchScrambleState,
    refetchStandings: refetchScrambleStandings,
    refetchMatches: refetchScrambleMatches,
  } = usePlayerScramble(format === 'scramble' ? tournamentId : null);

  // Combined matches: for scramble, bracket, or pool play, combine if standard list is empty
  const activeMatches = useMemo(() => {
    if (format === 'bracket' && bracketMatches.length > 0) return bracketMatches;
    if (format === 'scramble' && scrambleMatches.length > 0) return scrambleMatches;
    if (format === 'pool_play' && championshipMatches.length > 0) return championshipMatches;
    return matches;
  }, [format, bracketMatches, scrambleMatches, championshipMatches, matches]);

  // Combined standings
  const activeStandings = useMemo(() => {
    if (format === 'scramble' && scrambleStandings.length > 0) {
      return scrambleStandings.map((s: any, idx: number) => ({
        rank: s.rank ?? idx + 1,
        team_name: s.player_name || s.name || `Player ${idx + 1}`,
        matches_played: s.matches_played ?? 0,
        wins: s.wins ?? 0,
        losses: s.losses ?? 0,
        points_scored: s.points_scored ?? 0,
        points_allowed: s.points_allowed ?? 0,
        points_differential: s.points_differential ?? 0,
        status_label: s.status_label || (idx === 0 ? 'Leader 🏆' : undefined),
      }));
    }

    if (format === 'bracket' && standings.length === 0 && activeMatches.length > 0) {
      const statsMap = new Map<
        string,
        {
          id: string;
          name: string;
          wins: number;
          losses: number;
          pointsFor: number;
          pointsAgainst: number;
          highestRound: number;
          isChampion: boolean;
          isRunnerUp: boolean;
        }
      >();

      const winnersMatches = activeMatches.filter(
        (m) => !isConsolationMatch(m)
      );
      const sortedWinners = [...(winnersMatches.length > 0 ? winnersMatches : activeMatches)].sort(
        (a, b) => (b.bracket_round ?? 1) - (a.bracket_round ?? 1)
      );
      const finalMatch = sortedWinners.find((m) => m.status === 'completed') || sortedWinners[0];

      activeMatches.forEach((m) => {
        const teamAId = m.team_a_id || 'team_a';
        const teamBId = m.team_b_id || 'team_b';
        const teamAName = m.team_a?.name || (m as any).team_a_name || 'Team A';
        const teamBName = m.team_b?.name || (m as any).team_b_name || 'Team B';

        if (!statsMap.has(teamAId)) {
          statsMap.set(teamAId, {
            id: teamAId,
            name: teamAName,
            wins: 0,
            losses: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            highestRound: m.bracket_round ?? 1,
            isChampion: false,
            isRunnerUp: false,
          });
        }
        if (!statsMap.has(teamBId)) {
          statsMap.set(teamBId, {
            id: teamBId,
            name: teamBName,
            wins: 0,
            losses: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            highestRound: m.bracket_round ?? 1,
            isChampion: false,
            isRunnerUp: false,
          });
        }

        const statsA = statsMap.get(teamAId)!;
        const statsB = statsMap.get(teamBId)!;

        statsA.highestRound = Math.max(statsA.highestRound, m.bracket_round ?? 1);
        statsB.highestRound = Math.max(statsB.highestRound, m.bracket_round ?? 1);

        if (m.status === 'completed') {
          const scoreA = m.score_a ?? (m as any).score_team_a ?? 0;
          const scoreB = m.score_b ?? (m as any).score_team_b ?? 0;
          statsA.pointsFor += scoreA;
          statsA.pointsAgainst += scoreB;
          statsB.pointsFor += scoreB;
          statsB.pointsAgainst += scoreA;

          const isWinnerA =
            m.winner_team_id === m.team_a_id ||
            m.winner_side === 'side_a' ||
            (m as any).winner_id === m.team_a_id;
          const isWinnerB =
            m.winner_team_id === m.team_b_id ||
            m.winner_side === 'side_b' ||
            (m as any).winner_id === m.team_b_id;

          if (isWinnerA) {
            statsA.wins += 1;
            statsB.losses += 1;
          } else if (isWinnerB) {
            statsB.wins += 1;
            statsA.losses += 1;
          }
        }
      });

      if (finalMatch && finalMatch.status === 'completed') {
        const isWinnerA =
          finalMatch.winner_team_id === finalMatch.team_a_id ||
          finalMatch.winner_side === 'side_a' ||
          (finalMatch as any).winner_id === finalMatch.team_a_id;
        const champId = isWinnerA ? finalMatch.team_a_id : finalMatch.team_b_id;
        const runnerId = isWinnerA ? finalMatch.team_b_id : finalMatch.team_a_id;

        if (champId && statsMap.has(champId)) {
          statsMap.get(champId)!.isChampion = true;
        }
        if (runnerId && statsMap.has(runnerId)) {
          statsMap.get(runnerId)!.isRunnerUp = true;
        }
      }

      // Check completed consolation final for 3rd place
      const consMatches = activeMatches.filter(isConsolationMatch);
      const completedConsFinal = consMatches.find(
        (m) => m.status === 'completed' && !m.next_match_id
      );
      if (completedConsFinal) {
        const isWinnerA =
          completedConsFinal.winner_team_id === completedConsFinal.team_a_id ||
          completedConsFinal.winner_side === 'side_a' ||
          (completedConsFinal as any).winner_id === completedConsFinal.team_a_id;
        const thirdPlaceId = isWinnerA ? completedConsFinal.team_a_id : completedConsFinal.team_b_id;
        if (thirdPlaceId && statsMap.has(thirdPlaceId)) {
          (statsMap.get(thirdPlaceId)! as any).isThirdPlace = true;
        }
      }

      const list = Array.from(statsMap.values()).sort((a, b) => {
        if (a.isChampion) return -1;
        if (b.isChampion) return 1;
        if (a.isRunnerUp) return -1;
        if (b.isRunnerUp) return 1;
        if ((a as any).isThirdPlace) return -1;
        if ((b as any).isThirdPlace) return 1;
        if (a.highestRound !== b.highestRound) return b.highestRound - a.highestRound;
        if (a.wins !== b.wins) return b.wins - a.wins;
        const diffA = a.pointsFor - a.pointsAgainst;
        const diffB = b.pointsFor - b.pointsAgainst;
        return diffB - diffA;
      });

      return list.map((item, idx) => {
        let statusLabel: string | undefined;
        if (item.isChampion) statusLabel = 'Champion 🏆';
        else if (item.isRunnerUp) statusLabel = 'Runner-Up 🥈';
        else if ((item as any).isThirdPlace) statusLabel = '3rd Place 🥉';
        else if (item.highestRound >= 2) statusLabel = 'Semifinalist';
        else if (item.losses > 0) statusLabel = 'Eliminated';

        return {
          rank: idx + 1,
          team_name: item.name,
          matches_played: item.wins + item.losses,
          wins: item.wins,
          losses: item.losses,
          points_scored: item.pointsFor,
          points_allowed: item.pointsAgainst,
          points_differential: item.pointsFor - item.pointsAgainst,
          status_label: statusLabel,
        };
      });
    }

    return standings;
  }, [format, scrambleStandings, standings, activeMatches]);

  // Global refresh
  const handleInternalRefresh = async () => {
    await Promise.all([
      onRefresh(),
      refetchTeams(),
      refetchRegistrations(),
      refetchMatches(),
      refetchStandings(),
      format === 'bracket' && refetchBracketMatches(),
      format === 'bracket' && refetchBracketSummary(),
      format === 'pool_play' && refetchPoolStandings(),
      format === 'pool_play' && refetchChampionship(),
      format === 'scramble' && refetchScrambleState(),
      format === 'scramble' && refetchScrambleStandings(),
      format === 'scramble' && refetchScrambleMatches(),
    ]);
  };

  // ─── 2. Define Format-Specific Tabs ───
  const tabs: TabItem[] = useMemo(() => {
    const entrantCount = teams.length > 0 ? teams.length : registrations.length;
    const matchCount = activeMatches.length;

    switch (format) {
      case 'bracket':
        return [
          { key: 'overview', label: 'Overview & Rules' },
          { key: 'players', label: 'Players', count: entrantCount },
          { key: 'bracket', label: 'Bracket' },
          { key: 'matches', label: 'Matches', count: matchCount },
          { key: 'standings', label: 'Standings' },
          { key: 'results', label: 'Results' },
        ];

      case 'pool_play':
        return [
          { key: 'overview', label: 'Overview & Rules' },
          { key: 'players', label: 'Players', count: entrantCount },
          { key: 'pools', label: 'Pools & Standings' },
          { key: 'championship', label: 'Championship Bracket' },
          { key: 'matches', label: 'Matches', count: matchCount },
          { key: 'standings', label: 'Standings' },
          { key: 'results', label: 'Results' },
        ];

      case 'scramble':
        return [
          { key: 'overview', label: 'Overview & Rules' },
          { key: 'players', label: 'Players', count: entrantCount },
          { key: 'matches', label: 'Matches', count: matchCount },
          { key: 'standings', label: 'Standings' },
          { key: 'results', label: 'Results' },
        ];

      case 'round_robin':
      default:
        return [
          { key: 'overview', label: 'Overview & Rules' },
          { key: 'players', label: 'Players', count: entrantCount },
          { key: 'matches', label: 'Matches', count: matchCount },
          { key: 'standings', label: 'Standings' },
          { key: 'results', label: 'Results' },
        ];
    }
  }, [format, teams.length, registrations.length, activeMatches.length]);

  const [activeTab, setActiveTab] = useState<string>(initialTab);

  // Ensure activeTab is valid for current format
  const currentTab = useMemo(() => {
    const exists = tabs.some((t) => t.key === activeTab);
    return exists ? activeTab : 'overview';
  }, [tabs, activeTab]);

  // Check if player is already registered
  const isUserRegistered = useMemo(() => {
    if (!user) return false;
    const inReg = registrations.some((r) => r.user_id === user.id);
    const inTeam = teams.some((t) => t.members?.some((m) => m.user_id === user.id));
    return inReg || inTeam;
  }, [user, registrations, teams]);

  const canRegister =
    (status === 'registration_open' || status === 'published' || status === 'upcoming') &&
    !isUserRegistered &&
    Boolean(onRegister);

  return (
    <View style={[styles.screenWrapper, { paddingTop: insets.top, backgroundColor: '#FFFFFF' }]}>
      {/* ─── Scrollable Body: Header scrolls naturally, Tab Bar remains sticky ─── */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void handleInternalRefresh()}
            colors={['#064E3B']}
          />
        }
      >
        {/* ─── Child 0: Natural-Scrolling Tournament Header & Hero Banner ─── */}
        <View style={styles.scrollHeaderWrapper}>
          <PlayerTournamentHeader tournament={tournament} onBack={onBack} />
          <PlayerTournamentBanner
            tournament={tournament}
            registeredCount={teams.length > 0 ? teams.length : registrations.length}
          />
        </View>

        {/* ─── Child 1: Sticky Horizontal Navigation Tabs Bar ─── */}
        <View style={styles.stickyTabsContainer}>
          <PlayerTournamentTabs
            tabs={tabs}
            activeTab={currentTab}
            onTabChange={setActiveTab}
          />
        </View>

        {/* ─── Child 2: Tab Body Content ─── */}
        <View style={styles.tabBodyWrapper}>
          {currentTab === 'overview' && (
            <PlayerTournamentOverviewTab tournament={tournament} />
          )}

          {currentTab === 'players' && (
            <PlayerTournamentPlayersTab
              tournament={tournament}
              teams={teams}
              registrations={registrations}
              isBracketLocked={status === 'in_progress' || status === 'completed'}
            />
          )}

          {currentTab === 'bracket' && (
            <PlayerTournamentBracketTab
              tournament={tournament}
              matches={activeMatches}
            />
          )}

          {currentTab === 'pools' && (
            <PlayerTournamentPoolsTab
              tournament={tournament}
              poolAStandings={poolAStandings}
              poolBStandings={poolBStandings}
              matches={activeMatches}
            />
          )}

          {currentTab === 'championship' && (
            <PlayerTournamentBracketTab
              tournament={tournament}
              matches={
                championshipMatches.length > 0 ? championshipMatches : activeMatches
              }
            />
          )}

          {currentTab === 'matches' && (
            <PlayerTournamentMatchesTab
              tournament={tournament}
              matches={activeMatches}
              teams={teams}
            />
          )}

          {currentTab === 'standings' && (
            <PlayerTournamentStandingsTab
              tournament={tournament}
              standings={activeStandings}
            />
          )}

          {currentTab === 'results' && (
            <PlayerTournamentResultsTab
              tournament={tournament}
              matches={activeMatches}
              standings={activeStandings}
            />
          )}

          {/* Bottom padding */}
          <View style={{ height: canRegister ? 90 : 40 }} />
        </View>
      </ScrollView>

      {/* ─── Floating Registration CTA if open and not registered ─── */}
      {canRegister && (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity
            style={styles.registerBtn}
            onPress={onRegister}
            activeOpacity={0.85}
          >
            <AppText variant="body" bold style={styles.registerBtnText}>
              Register for Tournament
            </AppText>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  scrollHeaderWrapper: {
    backgroundColor: '#FFFFFF',
  },
  stickyTabsContainer: {
    backgroundColor: '#FFFFFF',
    zIndex: 10,
    elevation: 4,
  },
  tabBodyWrapper: {
    flex: 1,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 12,
    zIndex: 20,
    elevation: 5,
  },
  registerBtn: {
    backgroundColor: '#064E3B',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  registerBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
