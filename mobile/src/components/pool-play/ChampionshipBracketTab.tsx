/**
 * Aught2 Pickleball — ChampionshipBracketTab (Tab 4)
 *
 * Championship Knockout Bracket Engine:
 * - Qualifier selection & cross-pool seeding
 * - Seed adjustment with Up/Down reordering
 * - Automatic BYE allocation for non-power-of-two qualifiers
 * - Visual bracket rounds (Quarterfinals, Semifinals, Finals, 3rd Place)
 * - Live scoring and automatic winner advancement
 * - Champion crowning celebration card
 */

import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Colors, Radius, Spacing } from '@/theme';
import type {
  BracketType,
  ChampionshipMatch,
  CourtConfig,
  PoolStandingRow,
  Team,
} from '@/types/poolPlay';
import { ScoreEntryModal } from './modals/ScoreEntryModal';

interface ChampionshipBracketTabProps {
  standingsByPool?: Record<string, PoolStandingRow[]>;
  championshipMatches: ChampionshipMatch[];
  courts: CourtConfig[];
  bracketType: BracketType;
  qualifierCount: number;
  isPoolPlayComplete?: boolean;
  isTournamentCompleted?: boolean;
  onGenerateBracket: () => void;
  onRecordBracketScore: (matchId: string, score1: number, score2: number) => void;
}

export function ChampionshipBracketTab({
  standingsByPool: _standingsByPool,
  championshipMatches,
  isPoolPlayComplete,
  isTournamentCompleted = false,
  onGenerateBracket,
  onRecordBracketScore,
}: ChampionshipBracketTabProps) {
  const [activeMatchForScore, setActiveMatchForScore] =
    useState<ChampionshipMatch | null>(null);

  // Check if finals are complete to determine champion
  const finalsMatch =
    championshipMatches.find(
      (m) => (m.roundName === 'Finals' || m.roundName === 'Final') && m.id !== 'CB-3RD'
    ) ||
    (championshipMatches.length > 0
      ? championshipMatches
          .filter((m) => m.id !== 'CB-3RD' && m.roundName !== '3rd Place' && !m.roundName?.toLowerCase().includes('3rd'))
          .find((m) => (m.roundIndex ?? 0) === Math.max(...championshipMatches.map((x) => x.roundIndex ?? 0)))
      : null);

  const championTeam: Team | null =
    finalsMatch && finalsMatch.status === 'completed' && finalsMatch.winner
      ? finalsMatch.winner
      : null;

  const isBracketComplete = finalsMatch
    ? finalsMatch.status === 'completed' && Boolean(championTeam)
    : isTournamentCompleted;

  // Group matches by round
  const roundsMap: Record<string, ChampionshipMatch[]> = {};
  for (const m of championshipMatches) {
    if (!roundsMap[m.roundName]) {
      roundsMap[m.roundName] = [];
    }
    roundsMap[m.roundName].push(m);
  }
  const roundNames = Object.keys(roundsMap);

  if (championshipMatches.length === 0) {
    return (
      <View style={styles.container}>
        <Card style={styles.setupCard}>
          <AppText variant="heading2" style={styles.setupTitle}>
            CHAMPIONSHIP BRACKET
          </AppText>
          <AppText variant="bodySmall" color="secondary" style={styles.setupDesc}>
            Seed the top qualifying teams from Pool Play into a single-elimination knockout bracket with deterministic cross-pool matchmaking.
          </AppText>

          <View style={styles.rulesSummary}>
            <AppText variant="caption" color="tertiary" style={styles.rulesTitle}>
              SEEDING SPECIFICATION:
            </AppText>
            <AppText variant="caption" color="secondary">
              • Seed #1: Best #1 team (Pool A or B)
            </AppText>
            <AppText variant="caption" color="secondary">
              • Seed #2: Opposite pool's #1 team
            </AppText>
            <AppText variant="caption" color="secondary">
              • Seed #3: Best #2 team
            </AppText>
            <AppText variant="caption" color="secondary">
              • Seed #4: Opposite pool's #2 team
            </AppText>
            <AppText variant="caption" color="secondary">
              • Automatic BYEs awarded to top seeds if qualifiers &lt; bracket size
            </AppText>
          </View>

          <Button
            label="Generate Championship Bracket ➔"
            variant="primary"
            size="md"
            onPress={onGenerateBracket}
            disabled={isPoolPlayComplete === false}
            style={styles.genBtn}
          />
          {isPoolPlayComplete === false && (
            <AppText variant="caption" color="secondary" style={styles.incompleteHint}>
              All pool stage matches must be completed before generating the championship bracket.
            </AppText>
          )}
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ─── Champion Celebration Card ─────────────────────────────── */}
      {championTeam && (
        <Card style={styles.championCard}>
          <View style={styles.championContent}>
            <AppText style={styles.trophyIcon}>🏆</AppText>
            <AppText variant="caption" style={styles.championSub}>
              TOURNAMENT CHAMPIONS
            </AppText>
            <AppText variant="heading1" style={styles.championName}>
              {championTeam.name}
            </AppText>
            <AppText variant="body" bold style={styles.championPlayers}>
              {championTeam.p1.name} & {championTeam.p2.name}
            </AppText>
            <Badge label={`Rating Avg: ${championTeam.avgRating.toFixed(2)}`} variant="success" />
          </View>
        </Card>
      )}

      {/* ─── Bracket Rounds View ───────────────────────────────────── */}
      <View style={styles.bracketContainer}>
        {roundNames.map((roundName) => {
          const roundMatches = roundsMap[roundName] || [];

          return (
            <View key={roundName} style={styles.roundSection}>
              <View style={styles.roundHeader}>
                <AppText variant="heading3" style={styles.roundTitle}>
                  {roundName.toUpperCase()}
                </AppText>
                <Badge
                  label={`${roundMatches.length} Match${roundMatches.length === 1 ? '' : 'es'}`}
                  variant="info"
                />
              </View>

              <View style={styles.roundMatchesList}>
                {roundMatches.map((m) => {
                  const isCompleted = m.status === 'completed';
                  const isT1Winner = isCompleted && m.winner?.id === m.t1?.id;
                  const isT2Winner = isCompleted && m.winner?.id === m.t2?.id;

                  return (
                    <Card key={m.id} style={styles.bracketMatchCard}>
                      <View style={styles.matchTopRow}>
                        <AppText variant="caption" color="tertiary" bold>
                          {m.id} • 📍 {m.court}
                        </AppText>
                        <Badge
                          label={isCompleted ? 'Final' : 'Scheduled'}
                          variant={isCompleted ? 'success' : 'default'}
                        />
                      </View>

                      {/* Team 1 Slot */}
                      <View
                        style={[
                          styles.slotRow,
                          isT1Winner && styles.slotRowWinner,
                          m.isT1Bye && styles.slotRowBye,
                        ]}
                      >
                        <View style={styles.slotLeft}>
                          <AppText variant="caption" color="tertiary" style={styles.seedNum}>
                            #{m.t1Seed ?? '—'}
                          </AppText>
                          <AppText
                            variant="bodySmall"
                            bold={isT1Winner}
                            style={[styles.slotTeamName, isT1Winner && styles.winnerColor]}
                            numberOfLines={1}
                          >
                            {m.t1 ? m.t1.name : m.isT1Bye ? 'BYE (Automatic Win)' : 'TBD'}
                          </AppText>
                        </View>
                        {isCompleted && m.score1 !== null && (
                          <AppText variant="body" bold style={styles.slotScore}>
                            {m.score1}
                          </AppText>
                        )}
                      </View>

                      {/* Team 2 Slot */}
                      <View
                        style={[
                          styles.slotRow,
                          isT2Winner && styles.slotRowWinner,
                          m.isT2Bye && styles.slotRowBye,
                        ]}
                      >
                        <View style={styles.slotLeft}>
                          <AppText variant="caption" color="tertiary" style={styles.seedNum}>
                            #{m.t2Seed ?? '—'}
                          </AppText>
                          <AppText
                            variant="bodySmall"
                            bold={isT2Winner}
                            style={[styles.slotTeamName, isT2Winner && styles.winnerColor]}
                            numberOfLines={1}
                          >
                            {m.t2 ? m.t2.name : m.isT2Bye ? 'BYE (Automatic Win)' : 'TBD'}
                          </AppText>
                        </View>
                        {isCompleted && m.score2 !== null && (
                          <AppText variant="body" bold style={styles.slotScore}>
                            {m.score2}
                          </AppText>
                        )}
                      </View>

                      {/* Match Action Button */}
                      {m.t1 && m.t2 && !m.isT1Bye && !m.isT2Bye && (!isBracketComplete || !isCompleted) && (
                        <TouchableOpacity
                          onPress={() => setActiveMatchForScore(m)}
                          style={styles.bracketScoreBtn}
                        >
                          <AppText style={styles.bracketScoreBtnText}>
                            {isCompleted ? 'Edit Score' : 'Enter Score'}
                          </AppText>
                        </TouchableOpacity>
                      )}
                    </Card>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>

      {/* ─── Score Entry Modal ─────────────────────────────────────── */}
      <ScoreEntryModal
        visible={Boolean(activeMatchForScore)}
        onClose={() => setActiveMatchForScore(null)}
        match={activeMatchForScore}
        onSave={(s1, s2) => {
          if (activeMatchForScore) {
            onRecordBracketScore(activeMatchForScore.id, s1, s2);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[8],
    gap: Spacing[3],
  },
  setupCard: {
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.surface.border,
    gap: Spacing[3],
  },
  setupTitle: {
    color: Colors.text.primary,
    fontWeight: '800',
    fontSize: 20,
  },
  setupDesc: {
    lineHeight: 18,
  },
  rulesSummary: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.md,
    padding: Spacing[3],
    gap: Spacing[1],
  },
  rulesTitle: {
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  genBtn: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  incompleteHint: {
    textAlign: 'center',
    marginTop: Spacing[2],
    lineHeight: 18,
  },
  championCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 2,
    borderColor: '#F5A623',
    borderRadius: Radius.xl,
    padding: Spacing[4],
    alignItems: 'center',
  },
  championContent: {
    alignItems: 'center',
    gap: Spacing[1],
  },
  trophyIcon: {
    fontSize: 36,
  },
  championSub: {
    color: '#F5A623',
    fontWeight: '700',
    letterSpacing: 1,
  },
  championName: {
    color: Colors.text.primary,
    fontWeight: '800',
    fontSize: 24,
  },
  championPlayers: {
    color: Colors.text.secondary,
    fontSize: 14,
  },
  bracketContainer: {
    gap: Spacing[4],
  },
  roundSection: {
    gap: Spacing[2],
  },
  roundHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[1],
  },
  roundTitle: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  roundMatchesList: {
    gap: Spacing[2],
  },
  bracketMatchCard: {
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    padding: Spacing[3],
    gap: Spacing[2],
  },
  matchTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.md,
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  slotRowWinner: {
    borderColor: '#22C55E',
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  slotRowBye: {
    opacity: 0.6,
  },
  slotLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    flex: 1,
  },
  seedNum: {
    width: 20,
    fontWeight: '700',
  },
  slotTeamName: {
    color: Colors.text.primary,
  },
  winnerColor: {
    color: '#22C55E',
    fontWeight: '700',
  },
  slotScore: {
    color: Colors.text.primary,
    fontSize: 16,
  },
  bracketScoreBtn: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
    borderWidth: 1,
    borderColor: '#2563EB',
    borderRadius: Radius.sm,
    paddingVertical: 4,
    paddingHorizontal: Spacing[3],
  },
  bracketScoreBtnText: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '600',
  },
});
