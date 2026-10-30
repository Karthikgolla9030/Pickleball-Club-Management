/**
 * Aught2 Pickleball — PlayerTournamentResultsTab
 *
 * Standardized Results page across all tournament formats (Round Robin, Bracket, Pool Play, Scramble):
 * - Official Tournament Winner Celebration Card (when final match is completed or tournament is completed)
 * - In-Progress status banner when matches are underway but championship is not concluded
 * - Tournament Statistics Overview (matches played, total points, avg pts/match)
 * - Filter chips (All Results, Main Bracket, Consolation if consolation bracket exists)
 * - Chronologically & progression-ordered completed match cards with round names (Finals, Semifinals, etc.)
 * - Clean empty state when no matches have completed
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Award, Check, Clock, Flame, Info, Medal, Trophy } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { getCourtDisplayLabel } from '@/utils';
import { getBracketRoundName } from '@/utils/bracketLogic';
import type { Match, StandingRow, Tournament } from '@/types';

export interface PlayerTournamentResultsTabProps {
  tournament: Tournament;
  matches: Match[];
  standings?: StandingRow[] | any[];
}

type BracketFilter = 'all' | 'main' | 'consolation';

export function PlayerTournamentResultsTab({
  tournament,
  matches,
  standings = [],
}: PlayerTournamentResultsTabProps) {
  const isBracket = tournament.format === 'bracket';
  const isTournamentCompleted = tournament.status === 'completed';
  const [bracketFilter, setBracketFilter] = useState<BracketFilter>('all');

  // Filter only completed matches
  const completedMatches = useMemo(() => {
    return matches.filter((m) => m.status === 'completed');
  }, [matches]);

  // Overall statistics
  const stats = useMemo(() => {
    let totalPoints = 0;
    completedMatches.forEach((m) => {
      totalPoints +=
        (m.score_a ?? (m as any).score_team_a ?? 0) +
        (m.score_b ?? (m as any).score_team_b ?? 0);
    });

    return {
      completedCount: completedMatches.length,
      totalPoints,
      avgPointsPerMatch:
        completedMatches.length > 0
          ? (totalPoints / completedMatches.length).toFixed(1)
          : '0',
    };
  }, [completedMatches]);

  // Total rounds for bracket main tree
  const totalMainRounds = useMemo(() => {
    if (!isBracket) return 1;
    const mainMatches = matches.filter(
      (m) => m.bracket_section !== 'consolation' && !(m as any).is_consolation
    );
    if (mainMatches.length === 0) return 1;
    return Math.max(1, ...mainMatches.map((m) => m.bracket_round ?? 1));
  }, [isBracket, matches]);

  // Final match for bracket
  const finalMatch = useMemo(() => {
    if (!isBracket) return null;
    const mainMatches = matches.filter(
      (m) => m.bracket_section !== 'consolation' && !(m as any).is_consolation
    );
    return (
      mainMatches.find((m) => (m.bracket_round ?? 1) === totalMainRounds) || null
    );
  }, [isBracket, matches, totalMainRounds]);

  const isFinalCompleted = finalMatch?.status === 'completed';

  // Champion & Runner-up resolution
  const { championName, runnerUpName, showCelebration } = useMemo(() => {
    if (isBracket) {
      if (isFinalCompleted && finalMatch) {
        const isWinnerA =
          finalMatch.winner_team_id === finalMatch.team_a_id ||
          finalMatch.winner_side === 'side_a' ||
          (finalMatch as any).winner_id === finalMatch.team_a_id;
        const winner = isWinnerA
          ? finalMatch.team_a?.name || (finalMatch as any).team_a_name
          : finalMatch.team_b?.name || (finalMatch as any).team_b_name;
        const runner = isWinnerA
          ? finalMatch.team_b?.name || (finalMatch as any).team_b_name
          : finalMatch.team_a?.name || (finalMatch as any).team_a_name;
        return {
          championName: winner || 'Champion',
          runnerUpName: runner || null,
          showCelebration: true,
        };
      }

      if (isTournamentCompleted && standings.length > 0) {
        return {
          championName: standings[0]?.team_name || standings[0]?.name || 'Champion',
          runnerUpName: standings[1]?.team_name || standings[1]?.name || null,
          showCelebration: true,
        };
      }

      return { championName: null, runnerUpName: null, showCelebration: false };
    }

    // Round Robin, Scramble, Pool Play
    if (isTournamentCompleted && standings.length > 0) {
      const topEntry = standings[0];
      const runnerEntry = standings.length > 1 ? standings[1] : null;
      return {
        championName: topEntry?.team_name || topEntry?.player_name || topEntry?.name || 'Winner',
        runnerUpName: runnerEntry?.team_name || runnerEntry?.player_name || runnerEntry?.name || null,
        showCelebration: true,
      };
    }

    return { championName: null, runnerUpName: null, showCelebration: false };
  }, [isBracket, isFinalCompleted, finalMatch, isTournamentCompleted, standings]);

  // Check if consolation matches exist
  const hasConsolation = useMemo(() => {
    return matches.some(
      (m) => m.bracket_section === 'consolation' || (m as any).is_consolation
    );
  }, [matches]);

  // Progression-sorted matches
  const sortedMatches = useMemo(() => {
    if (isBracket) {
      // Split main and consolation
      const main = completedMatches.filter(
        (m) => m.bracket_section !== 'consolation' && !(m as any).is_consolation
      );
      const consolation = completedMatches.filter(
        (m) => m.bracket_section === 'consolation' || (m as any).is_consolation
      );

      // Sort by progression: early rounds (bracket_round: 1) -> quarterfinals -> semifinals -> finals
      main.sort((a, b) => {
        const roundA = a.bracket_round ?? 1;
        const roundB = b.bracket_round ?? 1;
        if (roundA !== roundB) return roundA - roundB;
        return (a.match_number ?? 0) - (b.match_number ?? 0);
      });

      consolation.sort((a, b) => {
        const roundA = a.bracket_round ?? 1;
        const roundB = b.bracket_round ?? 1;
        if (roundA !== roundB) return roundA - roundB;
        return (a.match_number ?? 0) - (b.match_number ?? 0);
      });

      if (bracketFilter === 'main') return main;
      if (bracketFilter === 'consolation') return consolation;
      return [...main, ...consolation];
    }

    // Default chronological / round order
    return [...completedMatches].sort((a, b) => {
      if (a.round_number != null && b.round_number != null && a.round_number !== b.round_number) {
        return a.round_number - b.round_number;
      }
      return (a.match_number ?? 0) - (b.match_number ?? 0);
    });
  }, [completedMatches, isBracket, bracketFilter]);

  // Round label resolver
  const getMatchRoundLabel = (match: Match, idx: number) => {
    if (isBracket) {
      if (match.label) return match.label;
      const isConsolation =
        match.bracket_section === 'consolation' || (match as any).is_consolation;
      if (isConsolation) {
        return `Consolation Round ${match.bracket_round ?? 1}`;
      }
      return getBracketRoundName(match.bracket_round ?? 1, totalMainRounds);
    }

    if (match.stage === 'pool' && match.pool_id) {
      return `Pool ${match.pool_id.replace('pool_', '').toUpperCase()}`;
    }

    return match.round_number
      ? `Round ${match.round_number}`
      : `Match #${match.match_number ?? idx + 1}`;
  };

  return (
    <View style={styles.container}>
      {/* ─── 1. Champion Celebration Card (when decided) ─── */}
      {showCelebration && championName && (
        <Card style={styles.championCard}>
          <View style={styles.championTrophyWrap}>
            <Trophy size={32} color="#D97706" />
          </View>

          <AppText variant="caption" bold style={styles.congratsText}>
            OFFICIAL TOURNAMENT WINNER
          </AppText>
          <AppText variant="heading1" bold style={styles.championName}>
            {championName}
          </AppText>

          {runnerUpName && (
            <View style={styles.runnerUpRow}>
              <Medal size={16} color="#64748B" />
              <AppText variant="caption" style={styles.runnerUpText}>
                Runner-Up: <AppText variant="caption" bold style={{ color: '#334155' }}>{runnerUpName}</AppText>
              </AppText>
            </View>
          )}
        </Card>
      )}

      {/* ─── In-Progress Tournament Notice (if not yet completed) ─── */}
      {!showCelebration && completedMatches.length > 0 && (
        <View style={styles.inProgressNotice}>
          <Clock size={16} color="#0F766E" style={{ marginTop: 2, marginRight: 8 }} />
          <View style={{ flex: 1 }}>
            <AppText variant="caption" bold style={styles.inProgressTitle}>
              Tournament In Progress
            </AppText>
            <AppText variant="caption" style={styles.inProgressDesc}>
              {completedMatches.length} of {matches.length} matches completed so far. Final tournament placements and champion will be announced once all games conclude.
            </AppText>
          </View>
        </View>
      )}

      {/* ─── 2. Tournament Overview Metrics (if matches completed) ─── */}
      {completedMatches.length > 0 && (
        <Card style={styles.metricsCard}>
          <View style={styles.metricItem}>
            <AppText variant="caption" style={styles.metricLabel}>
              Matches Played
            </AppText>
            <AppText variant="heading2" bold style={styles.metricValue}>
              {stats.completedCount}
            </AppText>
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.metricItem}>
            <AppText variant="caption" style={styles.metricLabel}>
              Total Points
            </AppText>
            <AppText variant="heading2" bold style={styles.metricValue}>
              {stats.totalPoints}
            </AppText>
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.metricItem}>
            <AppText variant="caption" style={styles.metricLabel}>
              Avg Pts / Match
            </AppText>
            <AppText variant="heading2" bold style={styles.metricValue}>
              {stats.avgPointsPerMatch}
            </AppText>
          </View>
        </Card>
      )}

      {/* ─── 3. Consolation / Main Filter Chips for Bracket ─── */}
      {isBracket && hasConsolation && completedMatches.length > 0 && (
        <View style={styles.bracketFilterRow}>
          {[
            { key: 'all', label: `All Results (${completedMatches.length})` },
            { key: 'main', label: 'Main Bracket' },
            { key: 'consolation', label: 'Consolation' },
          ].map((item) => {
            const isActive = bracketFilter === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setBracketFilter(item.key as BracketFilter)}
                activeOpacity={0.8}
              >
                <AppText
                  variant="caption"
                  bold
                  style={[styles.filterChipText, isActive && styles.filterChipTextActive]}
                >
                  {item.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ─── 4. Match Results Section ─── */}
      <View style={styles.sectionHeader}>
        <AppText variant="heading2" bold style={styles.sectionTitle}>
          Recorded Match Results ({sortedMatches.length})
        </AppText>
      </View>

      {completedMatches.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Clock size={32} color="#94A3B8" />
          <AppText variant="body" bold style={styles.emptyTitle}>
            No Results Yet
          </AppText>
          <AppText variant="caption" style={styles.emptySubtitle}>
            {isBracket
              ? 'Bracket tournament results will appear here as matches are completed.'
              : 'Tournament results will appear here as matches are completed.'}
          </AppText>
        </Card>
      ) : (
        <View style={styles.matchesList}>
          {sortedMatches.map((match, idx) => {
            const scoreA = match.score_a ?? (match as any).score_team_a ?? 0;
            const scoreB = match.score_b ?? (match as any).score_team_b ?? 0;
            const isWinnerA =
              match.winner_team_id === match.team_a_id ||
              match.winner_side === 'side_a' ||
              (match as any).winner_id === match.team_a_id;
            const isWinnerB =
              match.winner_team_id === match.team_b_id ||
              match.winner_side === 'side_b' ||
              (match as any).winner_id === match.team_b_id;
            const courtLabel = getCourtDisplayLabel(match);
            const roundLabel = getMatchRoundLabel(match, idx);

            const teamAName = match.team_a?.name || (match as any).team_a_name || 'Team A';
            const teamBName = match.team_b?.name || (match as any).team_b_name || 'Team B';

            return (
              <Card key={match.id || `result-${idx}`} style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <View style={styles.roundBadge}>
                    <AppText variant="caption" bold style={styles.roundBadgeText}>
                      {roundLabel}
                    </AppText>
                  </View>

                  <View style={styles.resultHeaderRight}>
                    {courtLabel && courtLabel !== 'Court not assigned' && (
                      <AppText variant="caption" style={styles.courtText}>
                        {courtLabel}
                      </AppText>
                    )}
                    <AppText variant="caption" style={styles.matchNum}>
                      Match #{match.match_number ?? idx + 1}
                    </AppText>
                  </View>
                </View>

                {/* Team A */}
                <View
                  style={[
                    styles.teamLine,
                    isWinnerA && styles.winnerLineHighlight,
                  ]}
                >
                  <AppText
                    variant="bodySmall"
                    bold={isWinnerA}
                    style={[styles.teamName, isWinnerA && styles.winnerText]}
                    numberOfLines={1}
                  >
                    {teamAName}
                  </AppText>
                  <View style={styles.scoreRow}>
                    <View style={[styles.scoreBox, isWinnerA && styles.winnerScoreBox]}>
                      <AppText
                        variant="bodySmall"
                        bold
                        style={[styles.scoreText, isWinnerA && styles.winnerScoreText]}
                      >
                        {scoreA}
                      </AppText>
                    </View>
                    {isWinnerA && (
                      <View style={styles.checkCircle}>
                        <Check size={11} color="#047857" />
                      </View>
                    )}
                  </View>
                </View>

                {/* Team B */}
                <View
                  style={[
                    styles.teamLine,
                    isWinnerB && styles.winnerLineHighlight,
                  ]}
                >
                  <AppText
                    variant="bodySmall"
                    bold={isWinnerB}
                    style={[styles.teamName, isWinnerB && styles.winnerText]}
                    numberOfLines={1}
                  >
                    {teamBName}
                  </AppText>
                  <View style={styles.scoreRow}>
                    <View style={[styles.scoreBox, isWinnerB && styles.winnerScoreBox]}>
                      <AppText
                        variant="bodySmall"
                        bold
                        style={[styles.scoreText, isWinnerB && styles.winnerScoreText]}
                      >
                        {scoreB}
                      </AppText>
                    </View>
                    {isWinnerB && (
                      <View style={styles.checkCircle}>
                        <Check size={11} color="#047857" />
                      </View>
                    )}
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
  },
  championCard: {
    padding: 24,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
    gap: 8,
  },
  championTrophyWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  congratsText: {
    fontSize: 11,
    color: '#D97706',
    letterSpacing: 1,
  },
  championName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  runnerUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  runnerUpText: {
    fontSize: 13,
    color: '#64748B',
  },
  inProgressNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    borderRadius: 12,
    padding: 12,
  },
  inProgressTitle: {
    fontSize: 13,
    color: '#0F766E',
    fontWeight: '700',
    marginBottom: 2,
  },
  inProgressDesc: {
    fontSize: 12,
    color: '#115E59',
    lineHeight: 17,
  },
  metricsCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  metricItem: {
    alignItems: 'center',
    gap: 4,
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  metricDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E2E8F0',
  },
  bracketFilterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  filterChipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  sectionHeader: {
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  matchesList: {
    gap: 10,
  },
  resultCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  roundBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roundBadgeText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '700',
  },
  resultHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  matchNum: {
    fontSize: 11,
    color: '#64748B',
  },
  courtText: {
    fontSize: 11,
    color: '#0F766E',
    fontWeight: '600',
  },
  teamLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  winnerLineHighlight: {
    backgroundColor: '#F0FDF4',
  },
  teamName: {
    flex: 1,
    fontSize: 13,
    color: '#334155',
  },
  winnerText: {
    color: '#064E3B',
    fontWeight: '800',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scoreBox: {
    minWidth: 26,
    height: 26,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  winnerScoreBox: {
    backgroundColor: '#047857',
  },
  scoreText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  winnerScoreText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  checkCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 15,
    color: '#475569',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },
});
