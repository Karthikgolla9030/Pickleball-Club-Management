/**
 * Aught2 Pickleball — PlayerTournamentPoolsTab
 *
 * Dedicated Pools & Standings view for Pool Play tournaments:
 * - Pool A & Pool B Standings Tables
 * - Advancement indicator (top 2 teams advance)
 * - Pool match scores
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Award, ChevronRight, Layers, Trophy } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import type { Match, PoolStandingRow, Tournament } from '@/types';

export interface PlayerTournamentPoolsTabProps {
  tournament: Tournament;
  poolAStandings: PoolStandingRow[];
  poolBStandings: PoolStandingRow[];
  matches?: Match[];
}

export function PlayerTournamentPoolsTab({
  tournament,
  poolAStandings,
  poolBStandings,
  matches = [],
}: PlayerTournamentPoolsTabProps) {
  const renderPoolTable = (poolName: string, standings: PoolStandingRow[]) => {
    return (
      <Card key={poolName} style={styles.poolCard}>
        <View style={styles.poolCardHeader}>
          <AppText variant="heading3" bold style={styles.poolTitle}>
            {poolName}
          </AppText>
          <View style={styles.completedBadge}>
            <AppText variant="caption" bold style={styles.completedBadgeText}>
              Pool Active
            </AppText>
          </View>
        </View>

        {/* Table */}
        <View style={styles.table}>
          <View style={styles.headerRow}>
            <View style={styles.colRank}>
              <AppText variant="caption" bold style={styles.thText}>#</AppText>
            </View>
            <View style={styles.colTeam}>
              <AppText variant="caption" bold style={styles.thText}>Team</AppText>
            </View>
            <View style={styles.colStat}>
              <AppText variant="caption" bold style={styles.thText}>W</AppText>
            </View>
            <View style={styles.colStat}>
              <AppText variant="caption" bold style={styles.thText}>L</AppText>
            </View>
            <View style={styles.colStat}>
              <AppText variant="caption" bold style={styles.thText}>Pts</AppText>
            </View>
            <View style={styles.colStat}>
              <AppText variant="caption" bold style={styles.thText}>PD</AppText>
            </View>
          </View>

          {standings.length === 0 ? (
            <View style={{ paddingVertical: 16, alignItems: 'center' }}>
              <AppText variant="caption" style={{ color: '#94A3B8' }}>
                No teams assigned to {poolName} yet
              </AppText>
            </View>
          ) : (
            standings.map((row, idx) => {
              const isQualified = row.rank <= 2;
              return (
                <View
                  key={`${row.team_name}-${idx}`}
                  style={[
                    styles.dataRow,
                    isQualified && styles.qualifiedRowHighlight,
                  ]}
                >
                  <View style={styles.colRank}>
                    <View
                      style={[
                        styles.rankCircle,
                        isQualified && styles.qualifiedRankCircle,
                      ]}
                    >
                      <AppText
                        variant="caption"
                        bold
                        style={[
                          styles.rankText,
                          isQualified && styles.qualifiedRankText,
                        ]}
                      >
                        {row.rank}
                      </AppText>
                    </View>
                  </View>

                  <View style={styles.colTeam}>
                    <AppText
                      variant="bodySmall"
                      bold={isQualified}
                      style={[
                        styles.teamText,
                        isQualified && styles.qualifiedTeamText,
                      ]}
                      numberOfLines={1}
                    >
                      {row.team_name}
                    </AppText>
                  </View>

                  <View style={styles.colStat}>
                    <AppText variant="bodySmall" bold style={styles.statBold}>
                      {row.wins}
                    </AppText>
                  </View>

                  <View style={styles.colStat}>
                    <AppText variant="bodySmall" style={styles.statMuted}>
                      {row.losses}
                    </AppText>
                  </View>

                  <View style={styles.colStat}>
                    <AppText variant="bodySmall" style={styles.statMuted}>
                      {row.points_scored}
                    </AppText>
                  </View>

                  <View style={styles.colStat}>
                    <AppText
                      variant="bodySmall"
                      bold
                      style={[
                        styles.pdText,
                        row.points_differential > 0
                          ? styles.pdPositive
                          : row.points_differential < 0
                          ? styles.pdNegative
                          : styles.pdZero,
                      ]}
                    >
                      {row.points_differential > 0
                        ? `+${row.points_differential}`
                        : row.points_differential}
                    </AppText>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.advancementNote}>
          <AppText variant="caption" style={styles.advancementText}>
            ★ Top 2 teams from {poolName} advance to the Championship Bracket.
          </AppText>
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      {renderPoolTable('Pool A', poolAStandings)}
      {renderPoolTable('Pool B', poolBStandings)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
  },
  poolCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  poolCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  poolTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  completedBadge: {
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  completedBadgeText: {
    fontSize: 11,
    color: '#0F766E',
    fontWeight: '700',
  },
  table: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
  },
  thText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingVertical: 8,
  },
  qualifiedRowHighlight: {
    backgroundColor: '#F0FDF4',
  },
  colRank: {
    width: 36,
    alignItems: 'center',
  },
  rankCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualifiedRankCircle: {
    backgroundColor: '#DCFCE7',
  },
  rankText: {
    fontSize: 11,
    color: '#64748B',
  },
  qualifiedRankText: {
    color: '#15803D',
  },
  colTeam: {
    flex: 1,
    paddingHorizontal: 8,
  },
  teamText: {
    fontSize: 13,
    color: '#334155',
  },
  qualifiedTeamText: {
    color: '#064E3B',
  },
  colStat: {
    width: 36,
    alignItems: 'center',
  },
  statBold: {
    fontSize: 13,
    color: '#0F172A',
  },
  statMuted: {
    fontSize: 13,
    color: '#64748B',
  },
  pdText: {
    fontSize: 12,
  },
  pdPositive: {
    color: '#059669',
  },
  pdNegative: {
    color: '#DC2626',
  },
  pdZero: {
    color: '#64748B',
  },
  advancementNote: {
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 6,
  },
  advancementText: {
    fontSize: 11,
    color: '#475569',
  },
});

