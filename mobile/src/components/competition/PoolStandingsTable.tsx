/**
 * Aught2 Pickleball — Pool Standings Table Component
 * Displays live standings for a single pool with qualified badges.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { Badge } from '../Badge';
import { Card } from '../Card';
import { Colors, Spacing, Typography } from '@/theme';
import type { PoolStandingRow } from '@/types';

interface PoolStandingsTableProps {
  poolName: string;
  standings: PoolStandingRow[];
}

export function PoolStandingsTable({ poolName, standings }: PoolStandingsTableProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <AppText variant="heading3">{poolName}</AppText>
        <AppText variant="caption" color="tertiary">
          {standings.length} {standings.length === 1 ? 'Team' : 'Teams'}
        </AppText>
      </View>

      {/* Standings Table Header */}
      <View style={styles.tableHeader}>
        <AppText variant="caption" color="tertiary" style={styles.colRank}>#</AppText>
        <AppText variant="caption" color="tertiary" style={styles.colTeam}>TEAM</AppText>
        <AppText variant="caption" color="tertiary" style={styles.colStat}>W</AppText>
        <AppText variant="caption" color="tertiary" style={styles.colStat}>L</AppText>
        <AppText variant="caption" color="tertiary" style={styles.colStat}>DIFF</AppText>
        <AppText variant="caption" color="tertiary" style={styles.colStat}>PTS</AppText>
        <AppText variant="caption" color="tertiary" style={styles.colQual}>STATUS</AppText>
      </View>

      {standings.length === 0 ? (
        <View style={styles.emptyRow}>
          <AppText variant="caption" color="tertiary">No teams assigned yet</AppText>
        </View>
      ) : (
        standings.map((row) => (
          <View
            key={row.team_id}
            style={[styles.tableRow, row.qualified && styles.qualifiedRow]}
          >
            <AppText variant="bodySmall" style={styles.colRank}>
              {row.rank}
            </AppText>
            <View style={styles.colTeam}>
              <AppText variant="bodySmall" numberOfLines={1} style={styles.teamName}>
                {row.team_name}
              </AppText>
              {row.team_seed ? (
                <AppText variant="caption" color="tertiary">
                  Seed #{row.team_seed}
                </AppText>
              ) : null}
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
            <View style={styles.colQual}>
              {row.qualified ? (
                <Badge label="QUALIFIED" variant="success" size="sm" />
              ) : (
                <AppText variant="caption" color="tertiary">—</AppText>
              )}
            </View>
          </View>
        ))
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
    marginBottom: Spacing[2],
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: Spacing[1],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
    alignItems: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
    alignItems: 'center',
  },
  qualifiedRow: {
    backgroundColor: 'rgba(34, 197, 94, 0.05)',
  },
  emptyRow: {
    paddingVertical: Spacing[3],
    alignItems: 'center',
  },
  colRank: {
    width: 24,
    textAlign: 'center',
    fontWeight: Typography.weight.bold,
  },
  colTeam: {
    flex: 1,
    paddingHorizontal: Spacing[1],
  },
  teamName: {
    fontWeight: Typography.weight.medium,
  },
  colStat: {
    width: 32,
    textAlign: 'center',
  },
  colQual: {
    width: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  positiveDiff: {
    color: Colors.status.success,
    fontWeight: Typography.weight.bold,
  },
  negativeDiff: {
    color: Colors.status.error,
  },
});
