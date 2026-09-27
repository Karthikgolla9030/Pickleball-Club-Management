/**
 * Aught2 Pickleball — BracketStandingsTab
 *
 * Standings tab for Bracket Tournament Mode:
 * - Live elimination bracket standings (Rank, Seed, Team, MP, W, L, PF, PA, Diff, Status)
 * - Distinct badges for Champion, Runner-Up, 3rd Place, Active, Eliminated
 * - Podium / Top finishers summary card
 */

import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Award, Trophy, Users } from 'lucide-react-native';

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

export function BracketStandingsTab({
  standings,
  isLoading = false,
  onRefresh,
  isRefreshing = false,
}: BracketStandingsTabProps) {
  if (isLoading && standings.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#064E3B" />
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

  const champion = standings.find((s) => s.status === 'Champion' || s.rank === 1 && s.status !== 'Active');
  const runnerUp = standings.find((s) => s.status === 'Runner-Up');
  const thirdPlace = standings.find((s) => s.status === '3rd Place');

  const getStatusBadgeVariant = (statusStr?: string | null) => {
    switch (statusStr) {
      case 'Champion':
        return 'success';
      case 'Runner-Up':
        return 'warning';
      case '3rd Place':
      case '4th Place':
      case 'Semifinalist':
        return 'info';
      case 'Active':
        return 'default';
      default:
        return 'default';
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void onRefresh()}
            colors={['#064E3B']}
          />
        ) : undefined
      }
    >
      {/* ─── Champion / Podium Card (if resolved) ─────────────────────────── */}
      {champion && (
        <Card style={styles.podiumCard}>
          <View style={styles.podiumHeader}>
            <Award size={24} color="#D97706" />
            <AppText style={styles.podiumTitle}>Tournament Placements</AppText>
          </View>

          <View style={styles.podiumRows}>
            <View style={styles.podiumRow}>
              <View style={[styles.placePill, { backgroundColor: '#FEF3C7' }]}>
                <AppText style={[styles.placePillText, { color: '#B45309' }]}>🥇 1st</AppText>
              </View>
              <AppText style={styles.podiumTeamName} numberOfLines={1}>
                {champion.team_name}
              </AppText>
              <Badge label="Champion" variant="success" />
            </View>

            {runnerUp && (
              <View style={styles.podiumRow}>
                <View style={[styles.placePill, { backgroundColor: '#F1F5F9' }]}>
                  <AppText style={[styles.placePillText, { color: '#475569' }]}>🥈 2nd</AppText>
                </View>
                <AppText style={styles.podiumTeamName} numberOfLines={1}>
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
                <AppText style={styles.podiumTeamName} numberOfLines={1}>
                  {thirdPlace.team_name}
                </AppText>
                <Badge label="3rd Place" variant="info" />
              </View>
            )}
          </View>
        </Card>
      )}

      {/* ─── Standings Table ──────────────────────────────────────────────── */}
      <Card style={styles.tableCard}>
        <View style={styles.tableHeaderRow}>
          <AppText style={[styles.colRank, styles.headerCell]}>#</AppText>
          <AppText style={[styles.colTeam, styles.headerCell]}>TEAM / PLAYER</AppText>
          <AppText style={[styles.colStat, styles.headerCell]}>MP</AppText>
          <AppText style={[styles.colStat, styles.headerCell]}>W</AppText>
          <AppText style={[styles.colStat, styles.headerCell]}>L</AppText>
          <AppText style={[styles.colDiff, styles.headerCell]}>DIFF</AppText>
          <AppText style={[styles.colStatus, styles.headerCell]}>STATUS</AppText>
        </View>

        {standings.map((row, index) => {
          const isEven = index % 2 === 0;
          return (
            <View
              key={row.team_id || `standing-${index}`}
              style={[styles.tableRow, isEven ? styles.rowEven : styles.rowOdd]}
            >
              <View style={styles.colRank}>
                <AppText style={styles.rankText}>{row.rank}</AppText>
              </View>

              <View style={styles.colTeam}>
                <View style={styles.teamNameRow}>
                  {row.team_seed !== null && row.team_seed !== undefined && (
                    <View style={styles.seedBadge}>
                      <AppText style={styles.seedText}>#{row.team_seed}</AppText>
                    </View>
                  )}
                  <AppText numberOfLines={1} style={styles.teamName}>
                    {row.team_name}
                  </AppText>
                </View>
              </View>

              <AppText style={[styles.colStat, styles.cellText]}>{row.matches_played}</AppText>
              <AppText style={[styles.colStat, styles.cellText, { fontWeight: '700', color: '#064E3B' }]}>
                {row.wins}
              </AppText>
              <AppText style={[styles.colStat, styles.cellText]}>{row.losses}</AppText>
              <AppText
                style={[
                  styles.colDiff,
                  styles.cellText,
                  {
                    color:
                      row.points_differential > 0
                        ? '#059669'
                        : row.points_differential < 0
                        ? '#DC2626'
                        : '#475569',
                    fontWeight: '700',
                  },
                ]}
              >
                {row.points_differential > 0 ? `+${row.points_differential}` : row.points_differential}
              </AppText>

              <View style={styles.colStatus}>
                <Badge
                  label={row.status || (row.losses > 0 ? 'Eliminated' : 'Active')}
                  variant={getStatusBadgeVariant(row.status)}
                />
              </View>
            </View>
          );
        })}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing[4],
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
    padding: Spacing[8],
    alignItems: 'center',
    textAlign: 'center',
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[4],
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#102F2B',
    marginBottom: Spacing[2],
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  podiumCard: {
    backgroundColor: '#FFFFFF',
    padding: Spacing[4],
    borderRadius: Radius.lg,
    gap: Spacing[3],
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  podiumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  podiumTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#102F2B',
  },
  podiumRows: {
    gap: Spacing[2],
  },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  placePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  placePillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  podiumTeamName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#102F2B',
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 0,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerCell: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  rowEven: {
    backgroundColor: '#FFFFFF',
  },
  rowOdd: {
    backgroundColor: '#FAFBFB',
  },
  colRank: {
    width: 28,
  },
  rankText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  colTeam: {
    flex: 1,
    paddingRight: Spacing[2],
  },
  teamNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  seedBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: Radius.sm,
  },
  seedText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#064E3B',
  },
  teamName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 1,
  },
  colStat: {
    width: 32,
    textAlign: 'center',
  },
  colDiff: {
    width: 44,
    textAlign: 'center',
  },
  colStatus: {
    width: 88,
    alignItems: 'flex-end',
  },
  cellText: {
    fontSize: 12,
    color: '#334155',
  },
});
