/**
 * Aught2 Pickleball — ScrambleHeader
 *
 * Sticky top header for individual rotate-partner Scramble Tournament workspace:
 * - Back button & Tournament Title
 * - SCRAMBLE mode badge & tournament lifecycle badge
 * - Meta stats (Current Round • Registered count • Available count)
 * - 4 Horizontal scrollable tabs: Overview, Players, Rounds, Standings
 */

import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, MoreVertical, Trophy, Users } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Radius, Spacing } from '@/theme';
import type { TournamentStatus } from '@/types';
import type { ScrambleSubTab, ScrambleRoundStatus } from '@/types/scramble';

interface ScrambleHeaderProps {
  tournamentName: string;
  status?: TournamentStatus | string;
  currentRound: number;
  plannedRounds?: number;
  roundStatus?: ScrambleRoundStatus;
  registeredCount: number;
  availableCount: number;
  activeTab: ScrambleSubTab;
  onTabChange: (tab: ScrambleSubTab) => void;
  canManage: boolean;
  onBack: () => void;
  onOptionsPress?: () => void;
  onEndTournament?: () => void;
  canEndTournament?: boolean;
}

const TABS: Array<{ key: ScrambleSubTab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'players', label: 'Players' },
  { key: 'rounds', label: 'Rounds' },
  { key: 'standings', label: 'Standings' },
  { key: 'results', label: 'Results' },
];

export function ScrambleHeader({
  tournamentName,
  status = 'registration_closed',
  currentRound,
  plannedRounds,
  roundStatus = 'setup',
  registeredCount,
  availableCount,
  activeTab,
  onTabChange,
  onBack,
  onOptionsPress,
}: ScrambleHeaderProps) {
  const getStatusLabel = () => {
    switch (status) {
      case 'in_progress':
        return 'IN PROGRESS';
      case 'completed':
        return 'COMPLETED';
      case 'cancelled':
        return 'CANCELLED';
      case 'registration_open':
        return 'REG OPEN';
      case 'registration_closed':
        return 'REG CLOSED';
      default:
        return 'DRAFT';
    }
  };

  const getRoundStatusLabel = () => {
    switch (roundStatus) {
      case 'setup':
        return 'Setup';
      case 'matchups_created':
        return 'Ready';
      case 'in_progress':
        return 'In Progress';
      case 'completed':
        return 'Completed';
      default:
        return 'Setup';
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Bar: Back, SCRAMBLE Badge, DRAFT Status Badge, Options Menu */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ArrowLeft size={18} color="#102E2A" />
        </TouchableOpacity>

        <View style={styles.badgeRow}>
          <View style={styles.scrambleBadge}>
            <AppText style={styles.scrambleBadgeText}>SCRAMBLE</AppText>
          </View>
          <View style={styles.statusBadge}>
            <AppText style={styles.statusBadgeText}>{getStatusLabel()}</AppText>
          </View>
          {onOptionsPress && (
            <TouchableOpacity
              onPress={onOptionsPress}
              style={styles.moreButton}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Tournament options"
            >
              <MoreVertical size={18} color="#102E2A" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tournament Title & Subtitle Info Row */}
      <View style={styles.titleSection}>
        <AppText numberOfLines={1} style={styles.titleText}>
          {tournamentName}
        </AppText>

        <View style={styles.metaRow}>
          <View style={styles.metaChip}>
            <Trophy size={14} color="#08785E" />
            <AppText style={styles.metaText}>
              Round {currentRound}{plannedRounds ? ` of ${plannedRounds}` : ''}
            </AppText>
          </View>

          <AppText style={styles.metaDot}>•</AppText>

          <View style={styles.metaChip}>
            <Users size={14} color="#08785E" />
            <AppText style={styles.metaText}>
              {availableCount} / {registeredCount} Available
            </AppText>
          </View>

          <AppText style={styles.metaDot}>•</AppText>

          <View style={styles.lifecyclePill}>
            <AppText style={styles.lifecyclePillText}>
              {getRoundStatusLabel()}
            </AppText>
          </View>
        </View>
      </View>

      {/* 5 Horizontally Arranged Pill Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsScroll}
        style={styles.tabsWrapper}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
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
    backgroundColor: '#F3FAF5',
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
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE8E3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scrambleBadge: {
    backgroundColor: '#E5F4EC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  scrambleBadgeText: {
    color: '#08785E',
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
  moreButton: {
    padding: Spacing[1.5],
    borderRadius: Radius.full,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing[1],
  },
  titleSection: {
    paddingHorizontal: Spacing[4],
    marginBottom: Spacing[3],
    gap: 4,
  },
  titleText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#102E2A',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#71817E',
    fontWeight: '500',
  },
  metaDot: {
    fontSize: 12,
    color: '#71817E',
  },
  lifecyclePill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  lifecyclePillText: {
    color: '#D97706',
    fontSize: 11,
    fontWeight: '700',
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
    backgroundColor: '#08785E',
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
