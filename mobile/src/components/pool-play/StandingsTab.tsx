/**
 * Aught2 Pickleball — StandingsTab (Tab 3)
 *
 * Live per-pool standings tables with tiebreaker ranking (Wins -> Diff -> Pts For),
 * qualification indicators, and celebratory completion banner.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BarChart2 } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Colors, Radius, Spacing } from '@/theme';
import type { Match, PoolStandingRow, PoolStat } from '@/types/poolPlay';

interface StandingsTabProps {
  pools: PoolStat[];
  standingsByPool: Record<string, PoolStandingRow[]>;
  isPoolPlayComplete: boolean;
  onAdvanceToBracket: () => void;
  hasMatchups?: boolean;
  matches?: Match[];
  qualifierCountPerPool?: number;
  onGoToMatchups?: () => void;
  hasChampionshipBracket?: boolean;
  isTournamentCompleted?: boolean;
  onNavigateToBracket?: () => void;
}

export function StandingsTab({
  pools,
  standingsByPool,
  isPoolPlayComplete,
  onAdvanceToBracket,
  hasMatchups = false,
  matches,
  qualifierCountPerPool = 2,
  onGoToMatchups,
  hasChampionshipBracket = false,
  isTournamentCompleted = false,
  onNavigateToBracket,
}: StandingsTabProps) {
  // ─── Section 2 Empty State: Before Matchups Are Generated ────────────────
  if (!hasMatchups) {
    return (
      <View style={styles.container}>
        <Card style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <BarChart2 size={32} color="#064E3B" />
          </View>
          <AppText variant="heading2" style={styles.emptyTitle}>
            Standings not available yet
          </AppText>
          <AppText variant="bodySmall" color="secondary" style={styles.emptySubtitle}>
            Generate pool matchups and record match results to see the live standings.
          </AppText>
          {onGoToMatchups && (
            <Button
              label="Go to Matchups ➔"
              variant="primary"
              size="sm"
              onPress={onGoToMatchups}
              style={styles.emptyBtn}
            />
          )}
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ─── Celebratory Completion Card ───────────────────────────── */}
      {isPoolPlayComplete && !isTournamentCompleted && (
        <Card style={styles.completeBanner}>
          <View style={styles.completeContent}>
            <AppText variant="heading2" style={styles.completeTitle}>
              🎉 POOL PLAY COMPLETE!
            </AppText>
            <AppText variant="bodySmall" style={styles.completeDesc}>
              {hasChampionshipBracket
                ? 'All pool matches have finished and the Championship Bracket is underway.'
                : 'All pool matches have finished! The top qualified teams are ready to advance to the Championship Bracket.'}
            </AppText>
            {hasChampionshipBracket ? (
              <Button
                label="View Championship Bracket ➔"
                variant="primary"
                size="sm"
                onPress={onNavigateToBracket || onAdvanceToBracket}
                style={styles.bracketAdvanceBtn}
              />
            ) : (
              <Button
                label="Start Championship Bracket ➔"
                variant="primary"
                size="sm"
                onPress={onAdvanceToBracket}
                style={styles.bracketAdvanceBtn}
              />
            )}
          </View>
        </Card>
      )}

      {isTournamentCompleted && (
        <Card style={styles.completeBanner}>
          <View style={styles.completeContent}>
            <AppText variant="heading2" style={styles.completeTitle}>
              🏆 TOURNAMENT COMPLETED
            </AppText>
            <AppText variant="bodySmall" style={styles.completeDesc}>
              All pool and championship playoff matches have concluded. Here are the final pool stage standings.
            </AppText>
            {onNavigateToBracket && (
              <Button
                label="View Championship Results ➔"
                variant="secondary"
                size="sm"
                onPress={onNavigateToBracket}
                style={styles.bracketAdvanceBtn}
              />
            )}
          </View>
        </Card>
      )}

      {/* ─── Pool Standings Tables ─────────────────────────────────── */}
      {pools.map((pool) => {
        const rows = standingsByPool[pool.key] || [];
        const poolMatches = matches ? matches.filter((m) => m.pool === pool.key) : [];
        const completedMatches = poolMatches.filter((m) => m.status === 'completed');
        const isPoolComplete =
          poolMatches.length > 0 && completedMatches.length === poolMatches.length;
        const hasStarted = completedMatches.length > 0;
        const qCount = qualifierCountPerPool;

        return (
          <View key={pool.key} style={styles.poolSection}>
            {/* Pool Header */}
            <View style={styles.poolHeader}>
              <View style={styles.poolHeaderLeft}>
                <AppText variant="heading3" style={styles.poolTitle}>
                  POOL {pool.key} STANDINGS
                </AppText>
                <Badge label={`Avg ${pool.avgTeamRating.toFixed(2)}`} variant="info" size="sm" />
                {isPoolComplete ? (
                  <Badge label="Final" variant="success" size="sm" />
                ) : hasStarted ? (
                  <Badge label="In Progress" variant="warning" size="sm" />
                ) : null}
              </View>
              <AppText variant="caption" color="secondary">
                {isPoolComplete ? `Top ${qCount} Qualified` : `Top ${qCount} Qualify`}
              </AppText>
            </View>

            {/* Standings Table Card */}
            <Card style={styles.tableCard}>
              {rows.length === 0 ? (
                <View style={styles.emptyStandingsBox}>
                  <AppText variant="caption" color="secondary" style={styles.emptyStandingsText}>
                    No match results recorded yet. Standings will update automatically as matches complete.
                  </AppText>
                </View>
              ) : (
                <>
                  {/* Header Row */}
                  <View style={styles.tableHeaderRow}>
                    <AppText variant="caption" bold style={styles.colRank}>
                      #
                    </AppText>
                    <AppText variant="caption" bold style={styles.colTeam}>
                      TEAM
                    </AppText>
                    <AppText variant="caption" bold style={styles.colStat}>
                      P
                    </AppText>
                    <AppText variant="caption" bold style={styles.colStat}>
                      W
                    </AppText>
                    <AppText variant="caption" bold style={styles.colStat}>
                      L
                    </AppText>
                    <AppText variant="caption" bold style={styles.colStat}>
                      DIFF
                    </AppText>
                    <AppText variant="caption" bold style={styles.colBadge}>
                      STATUS
                    </AppText>
                  </View>

                  {/* Data Rows */}
                  {rows.map((row) => (
                    <View
                      key={row.team.id}
                      style={[
                        styles.tableDataRow,
                        row.qualifies && styles.tableDataRowQualified,
                      ]}
                    >
                      <AppText variant="caption" bold style={styles.colRank}>
                        #{row.rank}
                      </AppText>

                      <View style={styles.colTeam}>
                        <AppText variant="bodySmall" bold style={styles.teamNameText} numberOfLines={1}>
                          {row.team.name}
                        </AppText>
                        <AppText variant="caption" color="tertiary" numberOfLines={1}>
                          {row.team.p1.name.split(' ')[0]} / {row.team.p2.name.split(' ')[0]}
                        </AppText>
                      </View>

                      <AppText variant="caption" style={styles.colStat}>
                        {row.played}
                      </AppText>
                      <AppText variant="caption" bold style={[styles.colStat, styles.wonText]}>
                        {row.won}
                      </AppText>
                      <AppText variant="caption" style={styles.colStat}>
                        {row.lost}
                      </AppText>
                      <AppText
                        variant="caption"
                        bold
                        style={[
                          styles.colStat,
                          row.differential > 0
                            ? styles.diffPositive
                            : row.differential < 0
                            ? styles.diffNegative
                            : styles.diffZero,
                        ]}
                      >
                        {row.differential > 0 ? `+${row.differential}` : row.differential}
                      </AppText>

                      <View style={styles.colBadge}>
                        {row.qualifies ? (
                          <Badge label="QUALIFIED" variant="success" size="sm" />
                        ) : (
                          <AppText variant="caption" color="tertiary">
                            —
                          </AppText>
                        )}
                      </View>
                    </View>
                  ))}
                </>
              )}
            </Card>
          </View>
        );
      })}

      {/* Tiebreaker Rules Legend */}
      <View style={styles.legendCard}>
        <AppText variant="caption" color="tertiary" style={styles.legendTitle}>
          TIEBREAKER ORDER (DETERMINISTIC)
        </AppText>
        <AppText variant="caption" color="secondary" style={styles.legendText}>
          1. Most Wins (W) → 2. Highest Point Differential (DIFF) → 3. Total Points Scored (PF) → 4. Team Name Fallback.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[4],
    paddingBottom: Spacing[6],
  },
  completeBanner: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: '#22C55E',
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  completeContent: {
    gap: Spacing[2],
    alignItems: 'center',
  },
  completeTitle: {
    color: '#22C55E',
    fontWeight: '800',
    fontSize: 20,
  },
  completeDesc: {
    color: Colors.text.primary,
    textAlign: 'center',
    lineHeight: 18,
  },
  bracketAdvanceBtn: {
    backgroundColor: '#22C55E',
    borderColor: '#22C55E',
    marginTop: Spacing[1],
  },
  emptyCard: {
    padding: Spacing[6],
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.elevated,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[4],
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: Spacing[2],
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
    marginBottom: Spacing[4],
  },
  emptyBtn: {
    marginTop: Spacing[1],
  },
  poolSection: {
    gap: Spacing[2],
  },
  poolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[1],
  },
  poolHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  poolTitle: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  tableCard: {
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    overflow: 'hidden',
    padding: 0,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface.default,
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
  },
  tableDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.surface.borderLight,
  },
  tableDataRowQualified: {
    backgroundColor: 'rgba(34, 197, 94, 0.04)',
  },
  colRank: {
    width: 24,
    color: Colors.text.tertiary,
  },
  colTeam: {
    flex: 1,
    paddingRight: Spacing[1],
  },
  teamNameText: {
    color: Colors.text.primary,
  },
  colStat: {
    width: 32,
    textAlign: 'center',
    color: Colors.text.secondary,
  },
  wonText: {
    color: Colors.text.primary,
  },
  diffPositive: {
    color: '#22C55E',
  },
  diffNegative: {
    color: '#EF4444',
  },
  diffZero: {
    color: Colors.text.tertiary,
  },
  colBadge: {
    width: 76,
    alignItems: 'flex-end',
  },
  legendCard: {
    padding: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.elevated,
    gap: Spacing[1],
  },
  legendTitle: {
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.8,
  },
  legendText: {
    fontSize: 11,
    lineHeight: 15,
  },
  emptyStandingsBox: {
    padding: Spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStandingsText: {
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
  },
});
