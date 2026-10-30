/**
 * Aught2 Pickleball — PlayerTournamentStandingsTab
 *
 * Standardized Standings presentation across all 4 formats:
 * - Tournament Placements podium card (Champion, Runner-Up, 3rd Place)
 * - Section heading with count
 * - Standardized table layout with horizontal scrolling:
 *     # | Player / Team | P | W | L | Diff | PF | PA | Status
 * - Tie-Breaker Priority explanation card
 */

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Award, Info, Medal, Trophy } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import type { StandingRow, Tournament } from '@/types';

export interface StandingsTableEntry {
  rank: number;
  name: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  statusLabel?: string;
  isChampion?: boolean;
  isRunnerUp?: boolean;
  isThirdPlace?: boolean;
}

export interface PlayerTournamentStandingsTabProps {
  tournament: Tournament;
  standings: StandingRow[] | any[];
  customEntries?: StandingsTableEntry[];
}

export function PlayerTournamentStandingsTab({
  tournament,
  standings,
  customEntries,
}: PlayerTournamentStandingsTabProps) {
  // Normalize standings entries into uniform table rows
  const entries: StandingsTableEntry[] = useMemo(() => {
    if (customEntries && customEntries.length > 0) {
      return customEntries;
    }

    if (standings && standings.length > 0) {
      return standings.map((s: any, idx: number) => {
        const rank = s.rank ?? idx + 1;
        const name = s.team_name || s.player_name || s.name || `Entry ${rank}`;
        const played = s.matches_played ?? (s.wins ?? 0) + (s.losses ?? 0);
        const wins = s.wins ?? 0;
        const losses = s.losses ?? 0;
        const pointsFor = s.points_scored ?? s.points_for ?? 0;
        const pointsAgainst = s.points_allowed ?? s.points_against ?? 0;
        const diff = s.points_differential ?? pointsFor - pointsAgainst;

        let statusLabel = s.status_label;
        if (!statusLabel) {
          if (rank === 1) statusLabel = 'Champion 🏆';
          else if (rank === 2) statusLabel = 'Runner-Up 🥈';
          else if (rank === 3) statusLabel = 'Semifinalist';
        }

        return {
          rank,
          name,
          played,
          wins,
          losses,
          pointsFor,
          pointsAgainst,
          diff,
          statusLabel,
          isChampion: rank === 1,
          isRunnerUp: rank === 2,
          isThirdPlace: rank === 3,
        };
      });
    }

    return [];
  }, [standings, customEntries]);

  const champion = entries.find((e) => e.isChampion) || (entries.length > 0 ? entries[0] : null);
  const runnerUp = entries.find((e) => e.isRunnerUp) || (entries.length > 1 ? entries[1] : null);
  const thirdPlace = entries.find((e) => e.isThirdPlace) || (entries.length > 2 ? entries[2] : null);

  const showPodium = Boolean(champion && (tournament.status === 'completed' || champion.wins > 0));

  return (
    <View style={styles.container}>
      {/* ─── 1. Tournament Placements Podium Card ─── */}
      {showPodium && (
        <Card style={styles.placementsCard}>
          <View style={styles.placementsHeader}>
            <Award size={20} color="#D97706" />
            <AppText variant="heading3" bold style={styles.placementsTitle}>
              Tournament Placements
            </AppText>
          </View>

          <View style={styles.podiumList}>
            {champion && (
              <View style={styles.podiumRow}>
                <View style={[styles.rankMedalPill, { backgroundColor: '#FEF9C3' }]}>
                  <AppText variant="caption" bold style={{ color: '#854D0E' }}>
                    🥇 1st
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.podiumName} numberOfLines={1}>
                  {champion.name}
                </AppText>
                <View style={[styles.finishBadge, { backgroundColor: '#DCFCE7' }]}>
                  <AppText variant="caption" bold style={{ color: '#15803D' }}>
                    CHAMPION
                  </AppText>
                </View>
              </View>
            )}

            {runnerUp && (
              <View style={styles.podiumRow}>
                <View style={[styles.rankMedalPill, { backgroundColor: '#F1F5F9' }]}>
                  <AppText variant="caption" bold style={{ color: '#475569' }}>
                    🥈 2nd
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.podiumName} numberOfLines={1}>
                  {runnerUp.name}
                </AppText>
                <View style={[styles.finishBadge, { backgroundColor: '#FEF3C7' }]}>
                  <AppText variant="caption" bold style={{ color: '#B45309' }}>
                    RUNNER-UP
                  </AppText>
                </View>
              </View>
            )}

            {thirdPlace && (
              <View style={styles.podiumRow}>
                <View style={[styles.rankMedalPill, { backgroundColor: '#FFEDD5' }]}>
                  <AppText variant="caption" bold style={{ color: '#9A3412' }}>
                    🥉 3rd
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.podiumName} numberOfLines={1}>
                  {thirdPlace.name}
                </AppText>
                <View style={[styles.finishBadge, { backgroundColor: '#EFF6FF' }]}>
                  <AppText variant="caption" bold style={{ color: '#1D4ED8' }}>
                    3RD PLACE
                  </AppText>
                </View>
              </View>
            )}
          </View>
        </Card>
      )}

      {/* ─── 2. Section Heading ─── */}
      <View style={styles.headingSection}>
        <AppText variant="heading2" bold style={styles.headingTitle}>
          Tournament Standings ({entries.length})
        </AppText>
        <AppText variant="caption" style={styles.headingSubtitle}>
          Standings updated after each completed match
        </AppText>
      </View>

      {/* ─── 3. Standardized Standings Table ─── */}
      {entries.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Trophy size={28} color="#94A3B8" />
          <AppText variant="body" bold style={styles.emptyTitle}>
            No Standings Recorded
          </AppText>
          <AppText variant="caption" style={styles.emptySubtitle}>
            Standings will automatically calculate as matches are played.
          </AppText>
        </Card>
      ) : (
        <Card style={styles.tableCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.table}>
              {/* Table Header */}
              <View style={styles.tableHeaderRow}>
                <View style={[styles.thCell, styles.cellRank]}>
                  <AppText variant="caption" bold style={styles.thText}>
                    #
                  </AppText>
                </View>
                <View style={[styles.thCell, styles.cellName]}>
                  <AppText variant="caption" bold style={styles.thText}>
                    Player / Team
                  </AppText>
                </View>
                <View style={[styles.thCell, styles.cellStat]}>
                  <AppText variant="caption" bold style={styles.thText}>
                    P
                  </AppText>
                </View>
                <View style={[styles.thCell, styles.cellStat]}>
                  <AppText variant="caption" bold style={styles.thText}>
                    W
                  </AppText>
                </View>
                <View style={[styles.thCell, styles.cellStat]}>
                  <AppText variant="caption" bold style={styles.thText}>
                    L
                  </AppText>
                </View>
                <View style={[styles.thCell, styles.cellStat]}>
                  <AppText variant="caption" bold style={styles.thText}>
                    DIFF
                  </AppText>
                </View>
                <View style={[styles.thCell, styles.cellStat]}>
                  <AppText variant="caption" bold style={styles.thText}>
                    PF
                  </AppText>
                </View>
                <View style={[styles.thCell, styles.cellStat]}>
                  <AppText variant="caption" bold style={styles.thText}>
                    PA
                  </AppText>
                </View>
                <View style={[styles.thCell, styles.cellStatus]}>
                  <AppText variant="caption" bold style={styles.thText}>
                    Status
                  </AppText>
                </View>
              </View>

              {/* Table Rows */}
              {entries.map((item, idx) => {
                const isChampion = item.rank === 1;
                return (
                  <View
                    key={`${item.name}-${idx}`}
                    style={[
                      styles.tableDataRow,
                      isChampion && styles.championRowHighlight,
                    ]}
                  >
                    <View style={[styles.tdCell, styles.cellRank]}>
                      <View
                        style={[
                          styles.rankCircle,
                          isChampion && styles.championRankCircle,
                        ]}
                      >
                        <AppText
                          variant="caption"
                          bold
                          style={[
                            styles.rankNumber,
                            isChampion && styles.championRankNumber,
                          ]}
                        >
                          {item.rank}
                        </AppText>
                      </View>
                    </View>

                    <View style={[styles.tdCell, styles.cellName]}>
                      <AppText
                        variant="bodySmall"
                        bold={isChampion}
                        style={[
                          styles.tdNameText,
                          isChampion && styles.championNameText,
                        ]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </AppText>
                    </View>

                    <View style={[styles.tdCell, styles.cellStat]}>
                      <AppText variant="bodySmall" style={styles.tdStatText}>
                        {item.played}
                      </AppText>
                    </View>

                    <View style={[styles.tdCell, styles.cellStat]}>
                      <AppText variant="bodySmall" bold style={styles.tdWinsText}>
                        {item.wins}
                      </AppText>
                    </View>

                    <View style={[styles.tdCell, styles.cellStat]}>
                      <AppText variant="bodySmall" style={styles.tdStatText}>
                        {item.losses}
                      </AppText>
                    </View>

                    <View style={[styles.tdCell, styles.cellStat]}>
                      <AppText
                        variant="bodySmall"
                        bold
                        style={[
                          styles.tdDiffText,
                          item.diff > 0
                            ? styles.diffPositive
                            : item.diff < 0
                            ? styles.diffNegative
                            : styles.diffZero,
                        ]}
                      >
                        {item.diff > 0 ? `+${item.diff}` : item.diff}
                      </AppText>
                    </View>

                    <View style={[styles.tdCell, styles.cellStat]}>
                      <AppText variant="bodySmall" style={styles.tdStatText}>
                        {item.pointsFor}
                      </AppText>
                    </View>

                    <View style={[styles.tdCell, styles.cellStat]}>
                      <AppText variant="bodySmall" style={styles.tdStatText}>
                        {item.pointsAgainst}
                      </AppText>
                    </View>

                    <View style={[styles.tdCell, styles.cellStatus]}>
                      {item.statusLabel ? (
                        <View
                          style={[
                            styles.statusPill,
                            isChampion
                              ? styles.championStatusPill
                              : styles.defaultStatusPill,
                          ]}
                        >
                          <AppText
                            variant="caption"
                            bold
                            style={[
                              styles.statusPillText,
                              isChampion && styles.championStatusPillText,
                            ]}
                          >
                            {item.statusLabel}
                          </AppText>
                        </View>
                      ) : (
                        <AppText variant="caption" style={styles.tdDash}>
                          —
                        </AppText>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </Card>
      )}

      {/* ─── 4. Tiebreaker Priority Card ─── */}
      <Card style={styles.tiebreakerCard}>
        <View style={styles.tiebreakerHeader}>
          <Info size={16} color="#0F766E" />
          <AppText variant="bodySmall" bold style={styles.tiebreakerTitle}>
            How Standings Are Calculated
          </AppText>
        </View>

        <View style={styles.tiebreakerRulesList}>
          <AppText variant="caption" style={styles.tiebreakerRuleText}>
            • <AppText variant="caption" bold>1st Priority:</AppText> Match Win-Loss Record (W)
          </AppText>
          <AppText variant="caption" style={styles.tiebreakerRuleText}>
            • <AppText variant="caption" bold>2nd Priority:</AppText> Head-to-Head matchup result
          </AppText>
          <AppText variant="caption" style={styles.tiebreakerRuleText}>
            • <AppText variant="caption" bold>3rd Priority:</AppText> Point Differential (DIFF = PF - PA)
          </AppText>
          <AppText variant="caption" style={styles.tiebreakerRuleText}>
            • <AppText variant="caption" bold>4th Priority:</AppText> Total Points Scored (PF)
          </AppText>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
  },
  placementsCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  placementsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  placementsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  podiumList: {
    gap: 10,
  },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rankMedalPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  podiumName: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  finishBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  headingSection: {
    gap: 2,
    marginTop: 4,
  },
  headingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  headingSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  tableCard: {
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    padding: 0,
  },
  table: {
    minWidth: 540,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 10,
  },
  thCell: {
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  thText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
  },
  tableDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingVertical: 10,
  },
  championRowHighlight: {
    backgroundColor: '#F0FDF4',
  },
  tdCell: {
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  cellRank: {
    width: 44,
    alignItems: 'center',
  },
  rankCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  championRankCircle: {
    backgroundColor: '#DCFCE7',
  },
  rankNumber: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '700',
  },
  championRankNumber: {
    color: '#15803D',
  },
  cellName: {
    width: 140,
  },
  tdNameText: {
    fontSize: 13,
    color: '#0F172A',
  },
  championNameText: {
    color: '#064E3B',
    fontWeight: '700',
  },
  cellStat: {
    width: 44,
    alignItems: 'center',
  },
  tdStatText: {
    fontSize: 12,
    color: '#475569',
  },
  tdWinsText: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '700',
  },
  tdDiffText: {
    fontSize: 12,
    fontWeight: '700',
  },
  diffPositive: {
    color: '#059669',
  },
  diffNegative: {
    color: '#DC2626',
  },
  diffZero: {
    color: '#64748B',
  },
  cellStatus: {
    width: 110,
    alignItems: 'flex-start',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  defaultStatusPill: {
    backgroundColor: '#F1F5F9',
  },
  championStatusPill: {
    backgroundColor: '#DCFCE7',
  },
  statusPillText: {
    fontSize: 10,
    color: '#475569',
  },
  championStatusPillText: {
    color: '#15803D',
  },
  tdDash: {
    fontSize: 12,
    color: '#94A3B8',
  },
  tiebreakerCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    gap: 8,
  },
  tiebreakerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tiebreakerTitle: {
    fontSize: 13,
    color: '#0F766E',
    fontWeight: '700',
  },
  tiebreakerRulesList: {
    gap: 4,
    paddingLeft: 4,
  },
  tiebreakerRuleText: {
    fontSize: 12,
    color: '#115E59',
    lineHeight: 18,
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

