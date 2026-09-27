/**
 * Aught2 Pickleball — Scramble Standings Table Component
 * Displays live individual player standings for a Scramble tournament.
 * Ranked by: Wins -> Differential -> Points Scored -> Name.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { Badge } from '../Badge';
import { Card } from '../Card';
import { Colors, Spacing, Typography } from '@/theme';
import type { ScrambleStandingRow } from '@/types';

interface ScrambleStandingsTableProps {
  standings: ScrambleStandingRow[];
  title?: string;
}

export function ScrambleStandingsTable({
  standings,
  title = 'Individual Standings',
}: ScrambleStandingsTableProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <AppText variant="heading3">{title}</AppText>
        <AppText variant="caption" color="tertiary">
          {standings.length} {standings.length === 1 ? 'Player' : 'Players'}
        </AppText>
      </View>

      {/* Table Header */}
      <View style={styles.tableHeader}>
        <AppText variant="caption" color="tertiary" style={styles.colRank}>#</AppText>
        <AppText variant="caption" color="tertiary" style={styles.colPlayer}>PLAYER</AppText>
        <AppText variant="caption" color="tertiary" style={styles.colStat}>W</AppText>
        <AppText variant="caption" color="tertiary" style={styles.colStat}>L</AppText>
        <AppText variant="caption" color="tertiary" style={styles.colStat}>DIFF</AppText>
        <AppText variant="caption" color="tertiary" style={styles.colStat}>PTS</AppText>
      </View>

      {standings.length === 0 ? (
        <View style={styles.emptyRow}>
          <AppText variant="caption" color="tertiary">No standings data available</AppText>
        </View>
      ) : (
        standings.map((row) => {
          const isTop3 = row.rank <= 3;
          return (
            <View
              key={row.player_membership_id}
              style={[styles.tableRow, isTop3 && styles.podiumRow]}
            >
              <View style={styles.colRank}>
                {row.rank === 1 ? (
                  <Badge label="1" variant="warning" size="sm" />
                ) : row.rank === 2 ? (
                  <Badge label="2" variant="info" size="sm" />
                ) : row.rank === 3 ? (
                  <Badge label="3" variant="default" size="sm" />
                ) : (
                  <AppText variant="bodySmall" color="secondary" style={styles.rankText}>
                    {row.rank}
                  </AppText>
                )}
              </View>

              <View style={styles.colPlayer}>
                <AppText variant="bodySmall" numberOfLines={1} style={styles.playerName}>
                  {row.display_name}
                </AppText>
                <AppText variant="caption" color="tertiary">
                  {row.matches_played} {row.matches_played === 1 ? 'match' : 'matches'} played
                </AppText>
              </View>

              <AppText variant="bodySmall" style={styles.colStat}>
                {row.wins}
              </AppText>
              <AppText variant="bodySmall" color="secondary" style={styles.colStat}>
                {row.losses}
              </AppText>
              <AppText
                variant="bodySmall"
                style={[
                  styles.colStat,
                  row.points_differential > 0 && styles.positiveDiff,
                  row.points_differential < 0 && styles.negativeDiff,
                ]}
              >
                {row.points_differential > 0 ? `+${row.points_differential}` : row.points_differential}
              </AppText>
              <AppText variant="bodySmall" style={styles.colStat}>
                {row.points_scored}
              </AppText>
            </View>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing[3],
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[3],
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surface.border,
    marginBottom: Spacing[1],
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surface.elevated,
  },
  podiumRow: {
    backgroundColor: Colors.surface.elevated,
    borderRadius: Spacing[1],
    paddingHorizontal: Spacing[1],
  },
  emptyRow: {
    paddingVertical: Spacing[4],
    alignItems: 'center',
  },
  colRank: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontWeight: Typography.weight.bold,
  },
  colPlayer: {
    flex: 1,
    paddingHorizontal: Spacing[2],
  },
  playerName: {
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
  },
  colStat: {
    width: 36,
    textAlign: 'center',
    fontWeight: Typography.weight.medium,
  },
  positiveDiff: {
    color: Colors.status.success,
  },
  negativeDiff: {
    color: Colors.status.error,
  },
});
