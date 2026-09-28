/**
 * Aught2 Pickleball — PoolPlayResultsTab
 *
 * Dedicated Results view for Pool Play tournaments:
 * - Tournament Champion Podium Card when finals complete
 * - Championship Bracket Stage Results (Gold/Silver/Semifinals)
 * - Pool Stage Qualifiers Breakdown by Pool
 * - Clean empty state when no matches have finished
 */

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Award, CheckCircle2, Trophy, Layers } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Radius, Spacing } from '@/theme';
import type { Tournament } from '@/types';
import type { ChampionshipMatch, Match, PoolStandingRow, Team } from '@/types/poolPlay';

interface PoolPlayResultsTabProps {
  tournament?: Tournament | null;
  teams: Team[];
  matches: Match[];
  championshipMatches: ChampionshipMatch[];
  standingsByPool: Record<string, PoolStandingRow[]>;
  isSingles?: boolean;
}

export function PoolPlayResultsTab({
  tournament,
  teams: _teams,
  matches,
  championshipMatches,
  standingsByPool,
  isSingles = false,
}: PoolPlayResultsTabProps) {
  // Find final match in championship bracket (strictly excluding semifinals and 3rd place matches)
  const finalMatch = useMemo(() => {
    if (championshipMatches.length === 0) return null;
    const titleMatches = championshipMatches.filter(
      (m) => m.id !== 'CB-3RD' && m.roundName !== '3rd Place' && !m.roundName?.toLowerCase().includes('3rd')
    );
    if (titleMatches.length === 0) return null;
    const namedFinal = titleMatches.find((m) => m.roundName === 'Finals' || m.roundName === 'Final');
    if (namedFinal) return namedFinal;
    const maxRound = Math.max(...titleMatches.map((x) => x.roundIndex ?? 0));
    return titleMatches.find((m) => (m.roundIndex ?? 0) === maxRound) ?? null;
  }, [championshipMatches]);

  const championTeam = useMemo(() => {
    if (finalMatch && finalMatch.status === 'completed' && finalMatch.winner) {
      return finalMatch.winner;
    }
    return null;
  }, [finalMatch]);

  const runnerUpTeam = useMemo(() => {
    if (finalMatch && finalMatch.status === 'completed' && finalMatch.winner) {
      return finalMatch.winner.id === finalMatch.t1?.id ? finalMatch.t2 : finalMatch.t1;
    }
    return null;
  }, [finalMatch]);

  // Fallback to persisted metadata if available
  const persistedWinner = useMemo(() => {
    const fc = (tournament?.format_configuration as Record<string, any>) || {};
    return fc.winner || fc.final_results?.winner || fc.pool_play_state?.winner || null;
  }, [tournament?.format_configuration]);

  const persistedPodium = useMemo(() => {
    const fc = (tournament?.format_configuration as Record<string, any>) || {};
    return fc.podium || fc.final_results?.podium || [];
  }, [tournament?.format_configuration]);

  const championName = championTeam?.name || persistedWinner?.name || persistedWinner?.display_name || null;
  const championMembers = championTeam
    ? `${championTeam.p1.name} & ${championTeam.p2.name}`
    : (persistedWinner?.members && persistedWinner.members.length > 0
        ? persistedWinner.members.join(' & ')
        : (persistedWinner?.p1 && persistedWinner?.p2 ? `${persistedWinner.p1} & ${persistedWinner.p2}` : ''));

  const runnerUpName = runnerUpTeam?.name || (persistedPodium.length > 1 ? persistedPodium[1]?.team_name : null);

  const completedChampMatches = useMemo(() => {
    return championshipMatches.filter((m) => m.status === 'completed');
  }, [championshipMatches]);

  const completedPoolMatches = useMemo(() => {
    return matches.filter((m) => m.status === 'completed');
  }, [matches]);

  const hasAnyResults = completedPoolMatches.length > 0 || completedChampMatches.length > 0 || Boolean(championName);

  return (
    <View style={styles.container}>
      <AppText style={styles.headingTitle}>Results</AppText>

      {/* ─── 1. Champion Podium Card or Neutral Pending Card ──────────────── */}
      {championName ? (
        <Card style={styles.championCard}>
          <View style={styles.championBadge}>
            <Trophy size={20} color="#D97706" />
            <AppText style={styles.championBadgeText}>TOURNAMENT CHAMPION</AppText>
          </View>

          <AppText style={styles.championTeamName}>{championName}</AppText>
          {!isSingles && championMembers ? (
            <AppText style={styles.championMembersText}>
              {championMembers}
            </AppText>
          ) : null}

          <View style={styles.championStatsRow}>
            <View style={styles.championStatPill}>
              <Award size={13} color="#0F766E" />
              <AppText style={styles.championStatText}>Gold Medalist</AppText>
            </View>
            {runnerUpName ? (
              <View style={styles.runnerUpStatPill}>
                <AppText style={styles.runnerUpText}>
                  Runner-Up: {runnerUpName}
                </AppText>
              </View>
            ) : null}
          </View>
        </Card>
      ) : championshipMatches.length > 0 ? (
        <Card style={styles.pendingChampionCard}>
          <View style={styles.pendingChampionBadge}>
            <Trophy size={18} color="#0F766E" />
            <AppText style={styles.pendingChampionBadgeText}>CHAMPIONSHIP PENDING</AppText>
          </View>

          <AppText style={styles.pendingChampionTitle}>Champion will be decided in the final</AppText>

          {finalMatch ? (
            <View style={styles.pendingFinalMatchRow}>
              <View style={styles.pendingFinalMatchInfo}>
                <AppText style={styles.pendingFinalMatchLabel}>Championship Final</AppText>
                <AppText style={styles.pendingFinalMatchTeams} numberOfLines={1}>
                  {finalMatch.t1 && finalMatch.t2
                    ? `${finalMatch.t1.name} vs ${finalMatch.t2.name}`
                    : finalMatch.t1
                    ? `${finalMatch.t1.name} vs Awaiting SF2 Winner`
                    : finalMatch.t2
                    ? `Awaiting SF1 Winner vs ${finalMatch.t2.name}`
                    : 'Awaiting Semifinal Winners'}
                </AppText>
              </View>
              <View style={[
                styles.finalStatusPill,
                finalMatch.status === 'playing' ? styles.statusPillPlaying : styles.statusPillScheduled,
              ]}>
                <AppText style={[
                  styles.finalStatusPillText,
                  finalMatch.status === 'playing' ? styles.statusTextPlaying : styles.statusTextScheduled,
                ]}>
                  {finalMatch.status === 'playing' ? 'In Progress' : 'Scheduled'}
                </AppText>
              </View>
            </View>
          ) : (
            <AppText style={styles.pendingFinalSubtext}>
              Championship final match will take place following semifinal elimination.
            </AppText>
          )}
        </Card>
      ) : null}

      {/* ─── 2. Championship Elimination Results ───────────────────────────── */}
      {completedChampMatches.length > 0 && (
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Trophy size={16} color="#0F766E" />
            <AppText style={styles.sectionTitle}>Championship Bracket Results</AppText>
          </View>

          <View style={styles.matchesList}>
            {completedChampMatches.map((m) => {
              const isT1Winner = m.winner?.id === m.t1?.id;
              const isT2Winner = m.winner?.id === m.t2?.id;
              const isFinal = m.id === finalMatch?.id || m.roundName === 'Finals' || m.roundName === 'Final';
              const isSemi = m.roundName === 'Semifinals' || m.roundName === 'Semifinal';

              return (
                <View key={m.id} style={styles.resultMatchRow}>
                  <View style={styles.matchMetaRow}>
                    <AppText style={styles.roundNameBadge}>{m.roundName}</AppText>
                    {m.court && <AppText style={styles.courtNameText}>{m.court}</AppText>}
                    {isFinal && m.winner && (
                      <View style={[styles.outcomeBadge, styles.outcomeChampionBadge]}>
                        <AppText style={styles.outcomeChampionText}>Champion: {m.winner.name}</AppText>
                      </View>
                    )}
                    {isSemi && m.winner && (
                      <View style={[styles.outcomeBadge, styles.outcomeFinalistBadge]}>
                        <AppText style={styles.outcomeFinalistText}>Finalist: {m.winner.name}</AppText>
                      </View>
                    )}
                  </View>

                  <View style={styles.teamsScoreRow}>
                    <View style={styles.teamScoreCol}>
                      <AppText
                        style={[
                          styles.teamNameText,
                          isT1Winner && styles.winnerTeamText,
                        ]}
                        numberOfLines={1}
                      >
                        {m.t1?.name ?? 'TBD'}
                      </AppText>
                      <AppText
                        style={[
                          styles.scoreText,
                          isT1Winner && styles.winnerScoreText,
                        ]}
                      >
                        {m.score1 ?? '—'}
                      </AppText>
                    </View>

                    <AppText style={styles.vsSeparator}>vs</AppText>

                    <View style={styles.teamScoreCol}>
                      <AppText
                        style={[
                          styles.teamNameText,
                          isT2Winner && styles.winnerTeamText,
                        ]}
                        numberOfLines={1}
                      >
                        {m.t2?.name ?? 'TBD'}
                      </AppText>
                      <AppText
                        style={[
                          styles.scoreText,
                          isT2Winner && styles.winnerScoreText,
                        ]}
                      >
                        {m.score2 ?? '—'}
                      </AppText>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </Card>
      )}

      {/* ─── 3. Pool Stage Qualifiers Summary ──────────────────────────────── */}
      {Object.keys(standingsByPool).length > 0 && (
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Layers size={16} color="#0F766E" />
            <AppText style={styles.sectionTitle}>Pool Stage Final Qualifiers</AppText>
          </View>

          <View style={styles.poolsSummaryWrap}>
            {Object.entries(standingsByPool).map(([poolKey, rows]) => {
              const qualified = rows.filter((r) => r.qualifies);
              return (
                <View key={poolKey} style={styles.poolSummaryItem}>
                  <View style={styles.poolTitleBadge}>
                    <AppText style={styles.poolTitleBadgeText}>Pool {poolKey} Qualifiers</AppText>
                  </View>

                  {qualified.map((r, idx) => (
                    <View key={r.team.id} style={styles.qualifierRow}>
                      <View style={styles.seedNumWrap}>
                        <AppText style={styles.seedNumText}>#{idx + 1}</AppText>
                      </View>
                      <View style={styles.qualifierDetails}>
                        <AppText style={styles.qualifierTeamName} numberOfLines={1}>
                          {r.team.name}
                        </AppText>
                        <AppText style={styles.qualifierRecord}>
                          {r.won}W - {r.lost}L • Diff: {r.differential > 0 ? `+${r.differential}` : r.differential}
                        </AppText>
                      </View>
                      <View style={styles.advanceBadge}>
                        <CheckCircle2 size={12} color="#0F766E" />
                        <AppText style={styles.advanceBadgeText}>Advancing</AppText>
                      </View>
                    </View>
                  ))}
                  {qualified.length === 0 && (
                    <AppText style={styles.emptyQualifiersText}>
                      No qualifiers locked yet for Pool {poolKey}.
                    </AppText>
                  )}
                </View>
              );
            })}
          </View>
        </Card>
      )}

      {/* ─── 4. Empty State when no results available ───────────────────────── */}
      {!hasAnyResults && (
        <Card style={styles.emptyCard}>
          <Trophy size={36} color="#CBD5E1" />
          <AppText style={styles.emptyTitle}>No Results Yet</AppText>
          <AppText style={styles.emptySub}>
            Results and championship podium will appear here as matches are completed in the pool and bracket stages.
          </AppText>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[8],
    gap: Spacing[3],
  },
  headingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  championCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    alignItems: 'center',
    gap: 8,
  },
  championBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  championBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: 0.5,
  },
  championTeamName: {
    fontSize: 22,
    fontWeight: '900',
    color: '#78350F',
    textAlign: 'center',
  },
  championMembersText: {
    fontSize: 13,
    color: '#92400E',
    fontWeight: '500',
  },
  championStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  championStatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  championStatText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
  },
  runnerUpStatPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  runnerUpText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  matchesList: {
    gap: 8,
  },
  resultMatchRow: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.md,
    padding: 10,
    gap: 6,
  },
  matchMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roundNameBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
  },
  courtNameText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  teamsScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  teamScoreCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  teamNameText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  winnerTeamText: {
    fontWeight: '800',
    color: '#0F172A',
  },
  scoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  winnerScoreText: {
    fontWeight: '800',
    color: '#0F766E',
  },
  vsSeparator: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    paddingHorizontal: 4,
  },
  poolsSummaryWrap: {
    gap: 12,
  },
  poolSummaryItem: {
    gap: 6,
  },
  poolTitleBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  poolTitleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  qualifierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.md,
    padding: 8,
    gap: 8,
  },
  seedNumWrap: {
    width: 24,
    alignItems: 'center',
  },
  seedNumText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F766E',
  },
  qualifierDetails: {
    flex: 1,
    gap: 1,
  },
  qualifierTeamName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  qualifierRecord: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  advanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  advanceBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0F766E',
  },
  emptyQualifiersText: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
    paddingLeft: 4,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.lg,
    padding: Spacing[8],
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 260,
  },
  pendingChampionCard: {
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[4],
    gap: 8,
  },
  pendingChampionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E6FFFA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  pendingChampionBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F766E',
    letterSpacing: 0.5,
  },
  pendingChampionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  pendingFinalMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  pendingFinalMatchInfo: {
    flex: 1,
    gap: 2,
    marginRight: 8,
  },
  pendingFinalMatchLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  pendingFinalMatchTeams: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  finalStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillPlaying: {
    backgroundColor: '#DCFCE7',
  },
  statusPillScheduled: {
    backgroundColor: '#F1F5F9',
  },
  finalStatusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusTextPlaying: {
    color: '#15803D',
  },
  statusTextScheduled: {
    color: '#64748B',
  },
  pendingFinalSubtext: {
    fontSize: 12,
    color: '#64748B',
  },
  outcomeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  outcomeChampionBadge: {
    backgroundColor: '#FEF3C7',
  },
  outcomeFinalistBadge: {
    backgroundColor: '#E0F2FE',
  },
  outcomeChampionText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D97706',
  },
  outcomeFinalistText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284C7',
  },
});
