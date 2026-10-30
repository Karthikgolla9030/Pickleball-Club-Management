/**
 * Aught2 Pickleball — PlayerTournamentResultsTab
 *
 * Standardized Results page for completed tournaments:
 * - Champion Celebration Card (podium with trophy, winner, runner-up)
 * - Tournament Statistics Card (total matches completed, points scored)
 * - Completed Match Results list with final scores and winner highlights
 */

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Check, Clock, Medal, Trophy } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { getCourtDisplayLabel } from '@/utils';
import type { Match, StandingRow, Tournament } from '@/types';

export interface PlayerTournamentResultsTabProps {
  tournament: Tournament;
  matches: Match[];
  standings?: StandingRow[] | any[];
}

export function PlayerTournamentResultsTab({
  tournament,
  matches,
  standings = [],
}: PlayerTournamentResultsTabProps) {
  // Completed matches only
  const completedMatches = useMemo(() => {
    return matches.filter((m) => m.status === 'completed');
  }, [matches]);

  // Overall stats
  const stats = useMemo(() => {
    let totalPoints = 0;
    completedMatches.forEach((m) => {
      totalPoints += (m.score_a ?? (m as any).score_team_a ?? 0) + (m.score_b ?? (m as any).score_team_b ?? 0);
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

  // Champion & Runner-up
  const champion = standings.length > 0 ? standings[0] : null;
  const runnerUp = standings.length > 1 ? standings[1] : null;
  const championName = champion?.team_name || champion?.player_name || champion?.name || 'Tournament Winner';
  const runnerUpName = runnerUp?.team_name || runnerUp?.player_name || runnerUp?.name || 'Runner-Up';

  return (
    <View style={styles.container}>
      {/* ─── 1. Champion Celebration Card ─── */}
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

        {runnerUp && (
          <View style={styles.runnerUpRow}>
            <Medal size={16} color="#64748B" />
            <AppText variant="caption" style={styles.runnerUpText}>
              Runner-Up: <AppText variant="caption" bold style={{ color: '#334155' }}>{runnerUpName}</AppText>
            </AppText>
          </View>
        )}
      </Card>

      {/* ─── 2. Tournament Overview Metrics ─── */}
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

      {/* ─── 3. Match Results List ─── */}
      <View style={styles.sectionHeader}>
        <AppText variant="heading2" bold style={styles.sectionTitle}>
          Recorded Match Results ({completedMatches.length})
        </AppText>
      </View>

      {completedMatches.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Clock size={28} color="#94A3B8" />
          <AppText variant="body" bold style={styles.emptyTitle}>
            No completed matches yet
          </AppText>
          <AppText variant="caption" style={styles.emptySubtitle}>
            Final match results will appear here once games finish.
          </AppText>
        </Card>
      ) : (
        <View style={styles.matchesList}>
          {completedMatches.map((match, idx) => {
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

            const teamAName = match.team_a?.name || (match as any).team_a_name || 'Team A';
            const teamBName = match.team_b?.name || (match as any).team_b_name || 'Team B';

            return (
              <Card key={match.id || `result-${idx}`} style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <AppText variant="caption" bold style={styles.matchNum}>
                    {match.round_number
                      ? `Round ${match.round_number}`
                      : `Match #${match.match_number ?? idx + 1}`}
                  </AppText>

                  {courtLabel && courtLabel !== 'Court not assigned' && (
                    <AppText variant="caption" style={styles.courtText}>
                      {courtLabel}
                    </AppText>
                  )}
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
    padding: 32,
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
  },
});
