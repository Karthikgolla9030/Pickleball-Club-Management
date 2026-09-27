/**
 * Aught2 Pickleball — PoolPlayHeader
 *
 * Sticky top header for Pool Play Tournament Mode:
 * - POOL PLAY title with TOURNAMENT MODE badge
 * - Meta stats summary (Tournament Name, Pools, Teams, Players, Tolerance)
 * - Quick action buttons: Setup & Courts, Auto-Play Simulation, Create Matchups
 * - 4 sub-tab selector pills
 */

import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Colors, Radius, Spacing } from '@/theme';
import type { PoolPlayConfig, PoolPlaySubTab, PoolStat } from '@/types/poolPlay';

interface PoolPlayHeaderProps {
  tournamentName: string;
  pools: PoolStat[];
  totalTeams: number;
  totalPlayers: number;
  config: PoolPlayConfig;
  activeTab: PoolPlaySubTab;
  onTabChange: (tab: PoolPlaySubTab) => void;
  onOpenSetup: () => void;
  onCreateMatchups: () => void;
  matchCount: number;
}

const TABS: { key: PoolPlaySubTab; label: string }[] = [
  { key: 'teams_pools', label: 'Teams & Pools' },
  { key: 'matchups', label: 'Matchups' },
  { key: 'standings', label: 'Standings' },
  { key: 'championship', label: 'Championship Bracket' },
];

export function PoolPlayHeader({
  tournamentName,
  pools,
  totalTeams,
  totalPlayers,
  config,
  activeTab,
  onTabChange,
  onOpenSetup,
  onCreateMatchups,
  matchCount,
}: PoolPlayHeaderProps) {
  return (
    <View style={styles.container}>
      {/* Title & Badge */}
      <View style={styles.titleRow}>
        <View style={styles.titleLeft}>
          <AppText variant="heading1" style={styles.title}>
            POOL PLAY
          </AppText>
          <Badge label="TOURNAMENT MODE" variant="info" />
        </View>
      </View>

      {/* Meta Info */}
      <AppText variant="caption" color="secondary" numberOfLines={1} style={styles.metaText}>
        {tournamentName} • {pools.length} Pools • {totalTeams} Teams • {totalPlayers} Players • Tol: ±{config.balanceTolerance.toFixed(2)}
      </AppText>

      {/* Quick Action Pills */}
      <View style={styles.actionPillsRow}>
        <TouchableOpacity onPress={onOpenSetup} style={styles.actionPill}>
          <AppText variant="caption" style={styles.actionPillText}>
            ⚙ Setup & Courts
          </AppText>
        </TouchableOpacity>

        <TouchableOpacity onPress={onCreateMatchups} style={[styles.actionPill, styles.actionPillAccent]}>
          <AppText variant="caption" style={styles.actionPillAccentText}>
            {matchCount > 0 ? '↻ Reset Matchups' : 'Create Matchups ➔'}
          </AppText>
        </TouchableOpacity>
      </View>

      {/* 4 Tab Selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsScroll}
        style={styles.tabsWrapper}
      >
        {TABS.map((t) => {
          const isActive = activeTab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => onTabChange(t.key)}
              style={[styles.tabChip, isActive && styles.tabChipActive]}
            >
              <AppText
                variant="caption"
                bold
                style={[styles.tabChipText, isActive && styles.tabChipTextActive]}
              >
                {t.label}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface.default,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[3],
    paddingBottom: Spacing[2],
    gap: Spacing[2],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  title: {
    color: Colors.text.primary,
    fontWeight: '800',
    fontSize: 22,
    letterSpacing: 0.5,
  },
  metaText: {
    fontSize: 12,
  },
  actionPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    flexWrap: 'wrap',
  },
  actionPill: {
    paddingVertical: Spacing[1],
    paddingHorizontal: Spacing[2],
    borderRadius: Radius.full,
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  actionPillText: {
    fontSize: 11,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  actionPillAccent: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: '#22C55E',
  },
  actionPillAccentText: {
    fontSize: 11,
    color: '#22C55E',
    fontWeight: '700',
  },
  tabsWrapper: {
    marginTop: Spacing[1],
  },
  tabsScroll: {
    gap: Spacing[2],
    paddingVertical: Spacing[1],
  },
  tabChip: {
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  tabChipActive: {
    borderColor: '#2563EB',
    backgroundColor: '#2563EB',
  },
  tabChipText: {
    color: Colors.text.secondary,
    fontSize: 12,
  },
  tabChipTextActive: {
    color: '#FFFFFF',
  },
});
