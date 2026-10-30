/**
 * Aught2 Pickleball — PlayerTournamentBracketTab
 *
 * Bracket visualization tab:
 * - Sub-pills: Main Bracket vs Consolation
 * - ChampionshipBracketView integration with horizontal scroll
 * - Empty state if no bracket matches are generated yet
 */

import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { GitBranch, Trophy, Users } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { ChampionshipBracketView } from '../ChampionshipBracketView';
import type { Match, Tournament } from '@/types';

export interface PlayerTournamentBracketTabProps {
  tournament: Tournament;
  matches: Match[];
}

export function PlayerTournamentBracketTab({
  tournament,
  matches,
}: PlayerTournamentBracketTabProps) {
  const [subTab, setSubTab] = useState<'main' | 'consolation'>('main');

  // Filter main vs consolation if available, or show all
  const filteredMatches = matches.filter((m) => {
    if (subTab === 'consolation') {
      return (m as any).is_consolation || (m as any).bracket_type === 'consolation';
    }
    return !(m as any).is_consolation && (m as any).bracket_type !== 'consolation';
  });

  const displayMatches = filteredMatches.length > 0 ? filteredMatches : matches;

  return (
    <View style={styles.container}>
      {/* ─── Sub-nav: Main Bracket vs Consolation ─── */}
      <View style={styles.subPillsRow}>
        <TouchableOpacity
          style={[styles.subPill, subTab === 'main' && styles.subPillActive]}
          onPress={() => setSubTab('main')}
          activeOpacity={0.8}
        >
          <AppText
            variant="caption"
            bold
            style={[styles.subPillText, subTab === 'main' && styles.subPillTextActive]}
          >
            Main Bracket
          </AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.subPill, subTab === 'consolation' && styles.subPillActive]}
          onPress={() => setSubTab('consolation')}
          activeOpacity={0.8}
        >
          <AppText
            variant="caption"
            bold
            style={[styles.subPillText, subTab === 'consolation' && styles.subPillTextActive]}
          >
            Consolation
          </AppText>
        </TouchableOpacity>
      </View>

      {/* ─── Bracket Visualization Card ─── */}
      {displayMatches.length === 0 ? (
        <Card style={styles.emptyCard}>
          <GitBranch size={32} color="#94A3B8" />
          <AppText variant="body" bold style={styles.emptyTitle}>
            No Bracket Matches Available
          </AppText>
          <AppText variant="caption" style={styles.emptySubtitle}>
            Bracket match progression will appear once tournament matches are scheduled.
          </AppText>
        </Card>
      ) : (
        <Card style={styles.bracketCard}>
          <ChampionshipBracketView matches={displayMatches} isReadOnly={true} />
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
  },
  subPillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  subPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  subPillActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  subPillText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  subPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  bracketCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  emptyCard: {
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 15,
    color: '#475569',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },
});

