/**
 * Aught2 Pickleball — BracketHeader
 *
 * Shared tournament header for Bracket Tournament Mode matching exact UI:
 * - Back button on left
 * - BRACKET badge and DRAFT / status badge on right
 * - Large bold tournament name (truncated with ellipsis if long)
 * - Compact tournament summary: "0 players • 0 matches • Single Elimination"
 * - Five horizontal pill-style tabs: Overview | Players | Bracket | Matches | Results
 * - Active tab: Dark green (#064E3B) with bold white text
 * - Inactive tabs: Pale blue-gray (#F1F5F9) with muted dark text (#475569)
 */

import React from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, MoreVertical } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Radius, Spacing } from '@/theme';
import type { TournamentStatus } from '@/types';
import type { BracketSubTab } from '@/types/bracket';

interface BracketHeaderProps {
  tournamentName: string;
  status?: TournamentStatus;
  teamsCount: number;
  matchesCount: number;
  activeTab: BracketSubTab;
  onTabChange: (tab: BracketSubTab) => void;
  onBack: () => void;
  teamSize?: number;
  bracketType?: string;
  canManage?: boolean;
  canGenerate?: boolean;
  canRegenerate?: boolean;
  isGenerating?: boolean;
  isRegenerating?: boolean;
  onGenerate?: () => void;
  onRegenerate?: () => void;
  onCloseRegistration?: () => void;
  onReopenRegistration?: () => void;
  onRefresh?: () => void;
}

export function BracketHeader({
  tournamentName,
  status = 'draft',
  teamsCount,
  matchesCount,
  activeTab,
  onTabChange,
  onBack,
  teamSize = 2,
  bracketType = 'Single Elimination',
  canManage = false,
  onCloseRegistration,
  onReopenRegistration,
  onRefresh,
}: BracketHeaderProps) {
  const tabs: Array<{ key: BracketSubTab; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'players', label: 'Players' },
    { key: 'bracket', label: 'Bracket' },
    { key: 'matches', label: 'Matches' },
    { key: 'standings', label: 'Standings' },
    { key: 'results', label: 'Results' },
  ];

  const isTabActive = (tabKey: BracketSubTab) => {
    if (tabKey === 'players') {
      return activeTab === 'players' || activeTab === 'teams';
    }
    return activeTab === tabKey;
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'in_progress':
        return 'IN PROGRESS';
      case 'completed':
        return 'COMPLETED';
      case 'cancelled':
        return 'CANCELLED';
      case 'registration_open':
        return 'OPEN';
      case 'registration_closed':
        return 'READY';
      default:
        return 'DRAFT';
    }
  };

  const getSubtitle = () => {
    const formatName = bracketType || 'Single Elimination';
    if (teamSize === 2) {
      const playerCount = teamsCount * 2;
      return `${teamsCount} teams (${playerCount} players) • ${matchesCount} matches • ${formatName}`;
    }
    return `${teamsCount} players • ${matchesCount} matches • ${formatName}`;
  };

  const handleOptionsMenu = () => {
    const options: Array<{ text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }> = [];

    if (status === 'registration_open' && onCloseRegistration) {
      options.push({
        text: 'Close Registration',
        onPress: onCloseRegistration,
      });
    }

    if (status === 'registration_closed' && matchesCount === 0 && onReopenRegistration) {
      options.push({
        text: 'Reopen Registration',
        onPress: onReopenRegistration,
      });
    }

    if (onRefresh) {
      options.push({
        text: 'Refresh Data',
        onPress: onRefresh,
      });
    }

    options.push({ text: 'Cancel', style: 'cancel' });

    Alert.alert('Tournament Actions', 'Manage registration and tournament state.', options);
  };

  return (
    <View style={styles.container}>
      {/* Top Bar: Back Button, Badges & Action Menu */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ArrowLeft size={18} color="#102F2B" />
        </TouchableOpacity>

        <View style={styles.badgeRow}>
          <View style={styles.bracketBadge}>
            <AppText style={styles.bracketBadgeText}>BRACKET</AppText>
          </View>
          <View style={styles.statusBadge}>
            <AppText style={styles.statusBadgeText}>{getStatusLabel()}</AppText>
          </View>
          {canManage && (
            <TouchableOpacity
              onPress={handleOptionsMenu}
              style={styles.moreButton}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MoreVertical size={18} color="#102F2B" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tournament Title & Subtitle */}
      <View style={styles.titleSection}>
        <AppText numberOfLines={1} style={styles.titleText}>
          {tournamentName}
        </AppText>
        <AppText numberOfLines={1} style={styles.subtitleText}>
          {getSubtitle()}
        </AppText>
      </View>

      {/* Horizontally Arranged Pill Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsScroll}
        style={styles.tabsWrapper}
      >
        {tabs.map((tab) => {
          const active = isTabActive(tab.key);
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => onTabChange(tab.key)}
              style={[styles.tabItem, active ? styles.tabItemActive : styles.tabItemInactive]}
              activeOpacity={0.7}
            >
              <AppText
                style={[styles.tabText, active ? styles.tabTextActive : styles.tabTextInactive]}
              >
                {tab.label}
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
    paddingTop: Spacing[1],
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    marginBottom: Spacing[2],
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  moreButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  bracketBadge: {
    backgroundColor: '#EAF2FC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  bracketBadgeText: {
    color: '#2563EB',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  statusBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  statusBadgeText: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  titleSection: {
    paddingHorizontal: Spacing[4],
    marginBottom: Spacing[3],
    gap: 3,
  },
  titleText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#102F2B',
  },
  subtitleText: {
    fontSize: 12,
    color: '#71817E',
  },
  tabsWrapper: {},
  tabsScroll: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    gap: 6,
  },
  tabItem: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  tabItemActive: {
    backgroundColor: '#064E3B',
  },
  tabItemInactive: {
    backgroundColor: '#F1F5F9',
  },
  tabText: {
    fontSize: 13,
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  tabTextInactive: {
    color: '#475569',
    fontWeight: '500',
  },
});
