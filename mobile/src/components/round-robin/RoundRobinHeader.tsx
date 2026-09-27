/**
 * Aught2 Pickleball — RoundRobinHeader
 *
 * Shared tournament header for Round Robin Tournament Mode matching exact UI:
 * - ROUND ROBIN title with TOURNAMENT MODE blue pill badge
 * - Single-line meta stats: {name} · {players} players · {matches} matches · {rounds} rounds · {courts} courts
 * - Compact "Live standings" button directly underneath with bar chart icon
 * - Horizontally scrollable 5 tabs: Players | Matchups | Standings | Results | Settings
 * - Active tab: Solid dark green pill (#064E3B) with bold white text
 */

import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { BarChart2 } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Colors, Radius, Spacing } from '@/theme';
import type { RoundRobinSubTab } from '@/types/roundRobin';

interface RoundRobinHeaderProps {
  tournamentName: string;
  totalTeams: number;
  totalPlayers?: number;
  totalMatches: number;
  totalRounds: number;
  totalCourts: number;
  activeTab: RoundRobinSubTab;
  onTabChange: (tab: RoundRobinSubTab) => void;
  canGenerate?: boolean;
  canRegenerate?: boolean;
  isGenerating?: boolean;
  isRegenerating?: boolean;
  onGenerate?: () => void;
  onRegenerate?: () => void;
  teamSize?: number;
}

export function RoundRobinHeader({
  tournamentName,
  totalTeams,
  totalPlayers,
  totalMatches,
  totalRounds,
  totalCourts,
  activeTab,
  onTabChange,
  teamSize = 1,
}: RoundRobinHeaderProps) {
  const tabs: { key: RoundRobinSubTab; label: string }[] = [
    { key: 'players', label: teamSize > 1 ? 'Teams' : 'Players' },
    { key: 'matchups', label: 'Matchups' },
    { key: 'standings', label: 'Standings' },
    { key: 'results', label: 'Results' },
    { key: 'settings', label: 'Settings' },
  ];

  const isTabActive = (tabKey: RoundRobinSubTab) => {
    if (tabKey === 'players') {
      return activeTab === 'players' || activeTab === 'teams';
    }
    return activeTab === tabKey;
  };

  return (
    <View style={styles.container}>
      {/* Title & Badge */}
      <View style={styles.titleRow}>
        <AppText style={styles.title}>ROUND ROBIN</AppText>
        <View style={styles.modeBadge}>
          <AppText style={styles.modeBadgeText}>TOURNAMENT MODE</AppText>
        </View>
      </View>

      {/* Meta Info */}
      <AppText variant="caption" style={styles.metaText} numberOfLines={1}>
        {tournamentName} ·{' '}
        {teamSize > 1
          ? `${totalTeams} teams (${totalPlayers ?? totalTeams * 2} players)`
          : `${totalTeams} players`}{' '}
        · {totalMatches} matches · {totalRounds} rounds · {totalCourts} courts
      </AppText>

      {/* Live Standings Compact Button */}
      <View style={styles.liveStandingsRow}>
        <TouchableOpacity
          onPress={() => onTabChange('standings')}
          style={[
            styles.liveStandingsBtn,
            isTabActive('standings') && styles.liveStandingsBtnActive,
          ]}
          activeOpacity={0.7}
        >
          <BarChart2 size={13} color="#087A60" />
          <AppText style={styles.liveStandingsBtnText}>Live standings</AppText>
        </TouchableOpacity>
      </View>

      {/* 5 Tab Selector — Horizontally scrollable */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsScroll}
        style={styles.tabsWrapper}
      >
        {tabs.map((t) => {
          const active = isTabActive(t.key);
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => onTabChange(t.key)}
              style={[styles.tabPill, active && styles.tabPillActive]}
              activeOpacity={0.7}
            >
              <AppText
                style={[styles.tabPillText, active && styles.tabPillTextActive]}
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
    backgroundColor: '#F1F8F3',
    borderBottomWidth: 1,
    borderBottomColor: '#DDE8E2',
    paddingTop: Spacing[1],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
    gap: Spacing[2],
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#102F2B',
    letterSpacing: 0.5,
  },
  modeBadge: {
    backgroundColor: '#EAF2FC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  modeBadgeText: {
    color: '#2563EB',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  metaText: {
    color: '#71817E',
    fontSize: 12,
    paddingHorizontal: Spacing[4],
    marginBottom: Spacing[2],
  },
  liveStandingsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing[4],
    marginBottom: Spacing[3],
  },
  liveStandingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: '#EAF6EF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
  },
  liveStandingsBtnActive: {
    borderColor: '#087A60',
    backgroundColor: '#E1F3E8',
  },
  liveStandingsBtnText: {
    color: '#087A60',
    fontSize: 12,
    fontWeight: '600',
  },
  tabsWrapper: {
    borderTopWidth: 1,
    borderTopColor: '#DDE8E2',
  },
  tabsScroll: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    gap: Spacing[1],
  },
  tabPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: 'transparent',
  },
  tabPillActive: {
    backgroundColor: '#064E3B',
  },
  tabPillText: {
    color: '#71817E',
    fontSize: 13,
    fontWeight: '600',
  },
  tabPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
