/**
 * Aught2 Pickleball — BracketStandingsTab
 *
 * Responsive standings tab for Bracket Tournament Mode:
 * - Live elimination bracket standings (Rank, Seed, Team, MP, W, L, Diff, Status)
 * - Modern mobile card-row architecture: eliminates text truncation (no 'A..', 'B..')
 * - Properly sized and unwrapped status badges (no 'ELIMINATED (RO' clipping)
 * - Highlights top 3 finishers (Champion, Runner-Up, 3rd Place)
 * - Works seamlessly across 320px, 360px, 390px, 412px, 430px viewports
 */

import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native';
import { Award, Trophy } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Colors, Radius, Spacing } from '@/theme';
import type { StandingRow } from '@/types';

interface BracketStandingsTabProps {
  standings: StandingRow[];
  isLoading?: boolean;
  onRefresh?: () => Promise<void>;
  isRefreshing?: boolean;
}

function formatCleanStatus(statusStr?: string | null, losses = 0): { label: string; variant: 'success' | 'warning' | 'info' | 'default' } {
  if (!statusStr) {
    return losses > 0
      ? { label: 'Eliminated', variant: 'default' }
      : { label: 'Active', variant: 'info' };
  }

  const s = statusStr.toLowerCase();
  if (s.includes('champion') || s === '1st') {
    return { label: 'Champion 🏆', variant: 'success' };
  }
  if (s.includes('runner') || s === '2nd') {
    return { label: 'Runner-Up 🥈', variant: 'warning' };
  }
  if (s.includes('3rd') || s.includes('third')) {
    return { label: '3rd Place 🥉', variant: 'info' };
  }
  if (s.includes('semi')) {
    return { label: 'Semifinalist', variant: 'info' };
  }
  if (s.includes('quarter')) {
    return { label: 'Quarterfinalist', variant: 'default' };
  }
  if (s.includes('eliminated')) {
    return { label: 'Eliminated', variant: 'default' };
  }
  if (s.includes('active')) {
    return { label: 'Active', variant: 'info' };
  }
  return { label: statusStr, variant: 'default' };
}

export function BracketStandingsTab({
  standings,
  isLoading = false,
}: BracketStandingsTabProps) {
  if (isLoading && standings.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0F766E" />
        <AppText style={styles.loadingText}>Loading standings...</AppText>
      </View>
    );
  }

  if (standings.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Card style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <Trophy size={32} color="#102F2B" />
          </View>
          <AppText style={styles.emptyTitle}>No Standings Yet</AppText>
          <AppText style={styles.emptySubtitle}>
            Standings and tournament placements will be calculated as bracket matches are completed.
          </AppText>
        </Card>
      </View>
    );
  }

  const champion = standings.find(
    (s) => s.status?.toLowerCase().includes('champion') || (s.rank === 1 && s.status !== 'Active')
  );
  const runnerUp = standings.find((s) => s.status?.toLowerCase().includes('runner'));
  const thirdPlace = standings.find((s) => s.status?.toLowerCase().includes('3rd') || s.rank === 3);

  return (
    <View style={styles.container}>
      {/* ─── Champion / Podium Card (if resolved) ─────────────────────────── */}
      {champion && (
        <Card style={styles.podiumCard}>
          <View style={styles.podiumHeader}>
            <Award size={22} color="#D97706" />
            <AppText style={styles.podiumTitle}>Tournament Placements</AppText>
          </View>

          <View style={styles.podiumRows}>
            <View style={styles.podiumRow}>
              <View style={[styles.placePill, { backgroundColor: '#FEF3C7' }]}>
                <AppText style={[styles.placePillText, { color: '#B45309' }]}>🥇 1st</AppText>
              </View>
              <AppText style={styles.podiumTeamName}>
                {champion.team_name}
              </AppText>
              <Badge label="Champion" variant="success" />
            </View>

            {runnerUp && (
              <View style={styles.podiumRow}>
                <View style={[styles.placePill, { backgroundColor: '#F1F5F9' }]}>
                  <AppText style={[styles.placePillText, { color: '#475569' }]}>🥈 2nd</AppText>
                </View>
                <AppText style={styles.podiumTeamName}>
                  {runnerUp.team_name}
                </AppText>
                <Badge label="Runner-Up" variant="warning" />
              </View>
            )}

            {thirdPlace && (
              <View style={styles.podiumRow}>
                <View style={[styles.placePill, { backgroundColor: '#FFEDD5' }]}>
                  <AppText style={[styles.placePillText, { color: '#C2410C' }]}>🥉 3rd</AppText>
                </View>
                <AppText style={styles.podiumTeamName}>
                  {thirdPlace.team_name}
                </AppText>
                <Badge label="3rd Place" variant="info" />
              </View>
            )}
          </View>
        </Card>
      )}

      {/* ─── Mobile-Responsive Standings Cards ─────────────────────────────── */}
      <View style={styles.standingsListSection}>
        <View style={styles.sectionHeader}>
          <AppText style={styles.sectionTitle}>
            Tournament Standings ({standings.length})
          </AppText>
        </View>

        <View style={styles.cardsContainer}>
          {standings.map((row, index) => {
            const isTop1 = row.rank === 1;
            const isTop2 = row.rank === 2;
            const isTop3 = row.rank === 3;
            const statusConfig = formatCleanStatus(row.status, row.losses);
            const isDiffPositive = row.points_differential > 0;
            const isDiffNegative = row.points_differential < 0;

            return (
              <View
                key={row.team_id || `standing-${index}`}
                style={[
                  styles.standingCard,
                  isTop1 && styles.standingCardFirst,
                ]}
              >
                {/* Upper Line: Rank, Seed, Team Name, Status Badge */}
                <View style={styles.cardUpperRow}>
                  <View style={styles.rankAndTeamGroup}>
                    {/* Rank Badge */}
                    <View
                      style={[
                        styles.rankBadge,
                        isTop1 && styles.rankBadgeGold,
                        isTop2 && styles.rankBadgeSilver,
                        isTop3 && styles.rankBadgeBronze,
                      ]}
                    >
                      <AppText
                        style={[
                          styles.rankText,
                          (isTop1 || isTop2 || isTop3) && styles.rankTextTop3,
                        ]}
                      >
                        {row.rank}
                      </AppText>
                    </View>

                    {/* Seed Badge */}
                    {row.team_seed !== null && row.team_seed !== undefined && (
                      <View style={styles.seedBadge}>
                        <AppText style={styles.seedText}>#{row.team_seed}</AppText>
                      </View>
                    )}

                    {/* Team Name: multi-line wrapping, never truncated */}
                    <AppText style={styles.teamNameText}>
                      {row.team_name}
                    </AppText>
                  </View>

                  {/* Status Badge */}
                  <View style={styles.statusBadgeWrap}>
                    <Badge
                      label={statusConfig.label}
                      variant={statusConfig.variant}
                    />
                  </View>
                </View>

                {/* Lower Line: Grouped Statistics (MP, W, L, DIFF) */}
                <View style={styles.cardStatsRow}>
                  <View style={styles.statChip}>
                    <AppText style={styles.statLabel}>PLAYED</AppText>
                    <AppText style={styles.statValue}>{row.matches_played}</AppText>
                  </View>

                  <View style={styles.statChip}>
                    <AppText style={styles.statLabel}>W - L</AppText>
                    <AppText style={[styles.statValue, { color: '#0F766E' }]}>
                      {row.wins} - {row.losses}
                    </AppText>
                  </View>

                  <View style={styles.statChip}>
                    <AppText style={styles.statLabel}>DIFF</AppText>
                    <AppText
                      style={[
                        styles.statValue,
                        isDiffPositive && styles.diffPositive,
                        isDiffNegative && styles.diffNegative,
                      ]}
                    >
                      {isDiffPositive ? `+${row.points_differential}` : row.points_differential}
                    </AppText>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[6],
    gap: Spacing[4],
  },
  loadingContainer: {
    padding: Spacing[8],
    alignItems: 'center',
    gap: Spacing[3],
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
  },
  emptyContainer: {
    padding: Spacing[4],
  },
  emptyCard: {
    padding: Spacing[6],
    alignItems: 'center',
    gap: Spacing[2],
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[2],
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  podiumCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: Spacing[4],
    gap: Spacing[3],
  },
  podiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  podiumTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  podiumRows: {
    gap: Spacing[2],
  },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2.5],
    flexWrap: 'wrap',
  },
  placePill: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: Radius.full,
  },
  placePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  podiumTeamName: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    minWidth: 120,
  },
  standingsListSection: {
    gap: Spacing[2.5],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  cardsContainer: {
    gap: Spacing[2.5],
  },
  standingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: Spacing[3],
    gap: Spacing[2.5],
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  standingCardFirst: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFFFA',
  },
  cardUpperRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  rankAndTeamGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    flexWrap: 'wrap',
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeGold: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  rankBadgeSilver: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rankBadgeBronze: {
    backgroundColor: '#FFEDD5',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  rankText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  rankTextTop3: {
    color: '#92400E',
  },
  seedBadge: {
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: Radius.sm,
  },
  seedText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F766E',
  },
  teamNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 19,
    flexShrink: 1,
  },
  statusBadgeWrap: {
    flexShrink: 0,
  },
  cardStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    paddingVertical: 6,
    paddingHorizontal: Spacing[2.5],
    justifyContent: 'space-between',
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  statValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  diffPositive: {
    color: '#0F766E',
    fontWeight: '800',
  },
  diffNegative: {
    color: '#DC2626',
    fontWeight: '800',
  },
});
