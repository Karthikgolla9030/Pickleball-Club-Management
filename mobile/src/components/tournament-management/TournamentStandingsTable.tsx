/**
 * Aught2 Pickleball — TournamentStandingsTable
 *
 * Master standardized Standings Table component across all tournament formats:
 * - Round Robin
 * - Bracket
 * - Pool Play (per pool)
 * - Scramble (individual players)
 *
 * Visual Reference: Round Robin master UI:
 * - White card with subtle border (#DDE8E2) and 16px radius
 * - Horizontal scroll for small mobile screens without layout collapse
 * - Header row with uppercase/caption column titles (#, Team/Player, P, W, L, Diff, PF, PA, Status)
 * - Row layout: Rank with top 3 medal highlights, team name with member subtitle or seed,
 *   green bold wins (#087A60), green positive diff (+X), points for/against, and optional status badge
 */

import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Spacing } from '@/theme';

export interface StandingsTableColumn {
  key: string;
  label: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
}

export interface StandingsTableRowData {
  id: string;
  rank: number;
  name: string;
  subtitle?: string | null;
  seed?: number | null;
  played: number;
  won: number;
  lost: number;
  differential: number;
  pointsFor?: number;
  pointsAgainst?: number;
  statusBadge?: {
    label: string;
    variant: 'success' | 'warning' | 'info' | 'default';
  } | null;
  highlightTop?: boolean;
}

export interface TournamentStandingsTableProps {
  entityLabel?: string; // 'Team / Players' | 'Player' | 'Team'
  rows: StandingsTableRowData[];
  showStatusColumn?: boolean;
  minTableWidth?: number;
}

export function TournamentStandingsTable({
  entityLabel = 'Team / Players',
  rows,
  showStatusColumn = false,
  minTableWidth = 460,
}: TournamentStandingsTableProps) {
  return (
    <Card style={styles.tableCard}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tableScrollContent}
      >
        <View style={[styles.tableInnerContainer, { minWidth: minTableWidth }]}>
          {/* Header Row */}
          <View style={styles.tableHeader}>
            <AppText style={[styles.colHeader, styles.colRank]}>#</AppText>
            <AppText style={[styles.colHeader, styles.colTeam]}>
              {entityLabel}
            </AppText>
            <AppText style={[styles.colHeader, styles.colStat]}>P</AppText>
            <AppText style={[styles.colHeader, styles.colStat]}>W</AppText>
            <AppText style={[styles.colHeader, styles.colStat]}>L</AppText>
            <AppText style={[styles.colHeader, styles.colStat]}>Diff</AppText>
            <AppText style={[styles.colHeader, styles.colStat]}>PF</AppText>
            <AppText style={[styles.colHeader, styles.colStat]}>PA</AppText>
            {showStatusColumn && (
              <AppText style={[styles.colHeader, styles.colStatus]}>Status</AppText>
            )}
          </View>

          {/* Rows */}
          {rows.map((row, idx) => {
            const isDiffPositive = row.differential > 0;
            const isLast = idx === rows.length - 1;

            return (
              <View
                key={row.id || `row-${idx}`}
                style={[styles.tableRow, isLast && styles.tableRowLast]}
              >
                {/* Rank Column */}
                <AppText style={[styles.cellText, styles.colRank, styles.rankNum]}>
                  {row.rank}
                </AppText>

                {/* Team / Player Column */}
                <View style={styles.colTeam}>
                  <View style={styles.nameRow}>
                    {row.seed !== null && row.seed !== undefined ? (
                      <View style={styles.seedBadge}>
                        <AppText style={styles.seedBadgeText}>#{row.seed}</AppText>
                      </View>
                    ) : null}
                    <AppText style={styles.teamNameText} numberOfLines={1}>
                      {row.name}
                    </AppText>
                  </View>
                  {row.subtitle ? (
                    <AppText style={styles.teamMembersSub} numberOfLines={1}>
                      {row.subtitle}
                    </AppText>
                  ) : null}
                </View>

                {/* Played */}
                <AppText style={[styles.cellText, styles.colStat]}>
                  {row.played}
                </AppText>

                {/* Wins */}
                <AppText style={[styles.cellText, styles.colStat, styles.boldStat]}>
                  {row.won}
                </AppText>

                {/* Losses */}
                <AppText style={[styles.cellText, styles.colStat]}>
                  {row.lost}
                </AppText>

                {/* Differential */}
                <AppText
                  style={[
                    styles.cellText,
                    styles.colStat,
                    isDiffPositive && styles.positiveDiff,
                  ]}
                >
                  {isDiffPositive ? `+${row.differential}` : row.differential}
                </AppText>

                {/* Points For */}
                <AppText style={[styles.cellText, styles.colStat]}>
                  {row.pointsFor ?? '—'}
                </AppText>

                {/* Points Against */}
                <AppText style={[styles.cellText, styles.colStat]}>
                  {row.pointsAgainst ?? '—'}
                </AppText>

                {/* Optional Status Column */}
                {showStatusColumn && (
                  <View style={styles.colStatus}>
                    {row.statusBadge ? (
                      <Badge
                        label={row.statusBadge.label}
                        variant={row.statusBadge.variant}
                        size="sm"
                      />
                    ) : (
                      <AppText style={styles.cellMuted}>—</AppText>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    borderRadius: 16,
    padding: Spacing[3],
    gap: Spacing[2],
  },
  tableScrollContent: {
    paddingHorizontal: 0,
  },
  tableInnerContainer: {
    minWidth: 460,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: '#DDE8E2',
  },
  colHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#71817E',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAF9',
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  cellText: {
    fontSize: 12,
    color: '#102F2B',
  },
  cellMuted: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },
  colRank: {
    width: 22,
    textAlign: 'center',
  },
  rankNum: {
    fontWeight: '700',
  },
  colTeam: {
    flex: 1,
    paddingHorizontal: Spacing[2],
    gap: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  seedBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
  },
  seedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  teamNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102F2B',
  },
  teamMembersSub: {
    fontSize: 10,
    color: '#64748B',
  },
  colStat: {
    width: 38,
    textAlign: 'center',
  },
  colStatus: {
    width: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boldStat: {
    fontWeight: '700',
    color: '#087A60',
  },
  positiveDiff: {
    color: '#087A60',
    fontWeight: '700',
  },
});
