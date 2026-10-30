/**
 * Aught2 Pickleball — PlayerTournamentBracketTab
 *
 * Bracket visualization tab:
 * - Accurately differentiates Single Elimination, Single Elimination with Consolation,
 *   and Double Elimination.
 * - Single Elimination: Shows only Main Bracket without sub-pills.
 * - Single Elimination with Consolation: Main Bracket and Consolation sub-pills.
 *   Consolation matches are strictly isolated from Main Bracket matches.
 * - Double Elimination: Preserves native Winners, Losers, and Championship Finals sections.
 */

import React, { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { GitBranch, Trophy, Users } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { ChampionshipBracketView } from '../ChampionshipBracketView';
import type { Match, Tournament } from '@/types';
import {
  getBracketType,
  isConsolationMatch,
  isLosersMatch,
} from '@/utils/bracketLogic';

export interface PlayerTournamentBracketTabProps {
  tournament: Tournament;
  matches: Match[];
}

export function PlayerTournamentBracketTab({
  tournament,
  matches,
}: PlayerTournamentBracketTabProps) {
  const [subTab, setSubTab] = useState<'main' | 'consolation'>('main');

  // Determine bracket configuration type
  const bracketType = useMemo(
    () => getBracketType(tournament, matches),
    [tournament, matches]
  );

  // Split matches strictly
  const mainMatches = useMemo(
    () => matches.filter((m) => !isConsolationMatch(m) && !isLosersMatch(m)),
    [matches]
  );

  const consolationMatches = useMemo(
    () => matches.filter((m) => isConsolationMatch(m)),
    [matches]
  );

  // Whether consolation sub-tabs should be shown
  const showConsolationTab =
    bracketType === 'single_elimination_consolation' || consolationMatches.length > 0;

  // Double elimination handles its own native tabs (Winners, Losers, Finals, All)
  const isDoubleElimination = bracketType === 'double_elimination';

  // ─── Case 1: Double Elimination ──────────────────────────────────────────
  if (isDoubleElimination) {
    return (
      <View style={styles.container}>
        {matches.length === 0 ? (
          <Card style={styles.emptyCard}>
            <GitBranch size={32} color="#94A3B8" />
            <AppText variant="body" bold style={styles.emptyTitle}>
              No Bracket Matches Available
            </AppText>
            <AppText variant="caption" style={styles.emptySubtitle}>
              Double elimination bracket match progression will appear once tournament matches are scheduled.
            </AppText>
          </Card>
        ) : (
          <Card style={styles.bracketCard}>
            <ChampionshipBracketView matches={matches} isReadOnly={true} isConsolation={false} />
          </Card>
        )}
      </View>
    );
  }

  // ─── Case 2: Standard Single Elimination (No Consolation configured) ───────
  if (!showConsolationTab) {
    return (
      <View style={styles.container}>
        {mainMatches.length === 0 ? (
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
            <ChampionshipBracketView matches={mainMatches} isReadOnly={true} isConsolation={false} />
          </Card>
        )}
      </View>
    );
  }

  // ─── Case 3: Single Elimination with Consolation ──────────────────────────
  const isMainTab = subTab === 'main';

  return (
    <View style={styles.container}>
      {/* ─── Sub-nav: Main Bracket vs Consolation ─── */}
      <View style={styles.subPillsRow}>
        <TouchableOpacity
          style={[styles.subPill, isMainTab && styles.subPillActive]}
          onPress={() => setSubTab('main')}
          activeOpacity={0.8}
        >
          <AppText
            variant="caption"
            bold
            style={[styles.subPillText, isMainTab && styles.subPillTextActive]}
          >
            Main Bracket
          </AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.subPill, !isMainTab && styles.subPillActive]}
          onPress={() => setSubTab('consolation')}
          activeOpacity={0.8}
        >
          <AppText
            variant="caption"
            bold
            style={[styles.subPillText, !isMainTab && styles.subPillTextActive]}
          >
            Consolation
          </AppText>
        </TouchableOpacity>
      </View>

      {/* ─── Bracket Visualization Card ─── */}
      {isMainTab ? (
        mainMatches.length === 0 ? (
          <Card style={styles.emptyCard}>
            <GitBranch size={32} color="#94A3B8" />
            <AppText variant="body" bold style={styles.emptyTitle}>
              No Main Bracket Matches Available
            </AppText>
            <AppText variant="caption" style={styles.emptySubtitle}>
              Main bracket matches will appear once the tournament schedule is generated.
            </AppText>
          </Card>
        ) : (
          <Card style={styles.bracketCard}>
            <ChampionshipBracketView matches={mainMatches} isReadOnly={true} isConsolation={false} />
          </Card>
        )
      ) : consolationMatches.length === 0 ? (
        <Card style={styles.emptyCard}>
          <GitBranch size={32} color="#94A3B8" />
          <AppText variant="body" bold style={styles.emptyTitle}>
            No Consolation Matches Yet
          </AppText>
          <AppText variant="caption" style={styles.emptySubtitle}>
            Consolation matches will appear as eligible participants are eliminated from the Main Bracket.
          </AppText>
        </Card>
      ) : (
        <Card style={styles.bracketCard}>
          <ChampionshipBracketView matches={consolationMatches} isReadOnly={true} isConsolation={true} />
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

