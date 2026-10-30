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
    return standings;
  }, [format, scrambleStandings, standings]);

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
    <View style={styles.screenWrapper}>
      {/* ─── 1. Fixed Header ─── */}
      <PlayerTournamentHeader tournament={tournament} onBack={onBack} />

      {/* ─── 2. Scrollable Body ─── */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(insets.top, 10) + 52 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void handleInternalRefresh()}
            colors={['#064E3B']}
          />
        }
      >
        {/* ─── Shared Hero Banner ─── */}
        <PlayerTournamentBanner
          tournament={tournament}
          registeredCount={teams.length > 0 ? teams.length : registrations.length}
        />

        {/* ─── Standardized Horizontal Navigation Tabs ─── */}
        <PlayerTournamentTabs
          tabs={tabs}
          activeTab={currentTab}
          onTabChange={setActiveTab}
        />

        {/* ─── Tab Content Rendering ─── */}
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
    backgroundColor: '#F8FAFC',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
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
