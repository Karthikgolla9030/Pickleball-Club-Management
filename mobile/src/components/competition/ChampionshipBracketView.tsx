/**
 * Aught2 Pickleball — Championship Bracket View Component
 * Displays the single-elimination tournament bracket rounds with scores and advancement.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { AppText } from '../AppText';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { Card } from '../Card';
import { Colors, Radius, Spacing, Typography } from '@/theme';
import type { Match } from '@/types';
import type { BracketRoundGroup } from '@/types/bracket';
import {
  groupBracketMatchesBySection,
  groupBracketMatchesByRound,
  getFeederPlaceholder,
  getResetFinalStatus,
  getBracketRoundName,
} from '@/utils/bracketLogic';

interface ChampionshipBracketViewProps {
  matches: Match[];
  onScoreMatch?: (match: Match) => void;
  isReadOnly?: boolean;
}

export function ChampionshipBracketView({
  matches,
  onScoreMatch,
  isReadOnly = false,
}: ChampionshipBracketViewProps) {
  // Detect double elimination
  const isDoubleElimination = useMemo(
    () =>
      matches.some(
        (m) =>
          m.bracket_section === 'losers' ||
          m.bracket_section === 'grand_final' ||
          m.bracket_section === 'reset_final'
      ),
    [matches]
  );

  const [activeSection, setActiveSection] = useState<'winners' | 'losers' | 'finals' | 'all'>('winners');

  const sectionGroups = useMemo(
    () => groupBracketMatchesBySection(matches),
    [matches]
  );

  const counts = useMemo(() => {
    return {
      winners: matches.filter((m) => !m.bracket_section || m.bracket_section === 'winners').length,
      losers: matches.filter((m) => m.bracket_section === 'losers').length,
      finals: matches.filter((m) => m.bracket_section === 'grand_final' || m.bracket_section === 'reset_final').length,
      all: matches.length,
    };
  }, [matches]);

  const displayedGroups: BracketRoundGroup[] = useMemo(() => {
    if (!isDoubleElimination) {
      return groupBracketMatchesByRound(matches);
    }
    if (activeSection === 'all') {
      const flattened: BracketRoundGroup[] = [];
      if (sectionGroups.winners.length > 0) flattened.push(...sectionGroups.winners);
      if (sectionGroups.losers.length > 0) flattened.push(...sectionGroups.losers);
      if (sectionGroups.finals.length > 0) flattened.push(...sectionGroups.finals);
      return flattened;
    }
    return sectionGroups[activeSection] || [];
  }, [isDoubleElimination, activeSection, sectionGroups, matches]);

  // Determine champion legitimately
  const champion = useMemo(() => {
    if (isDoubleElimination) {
      const resetMatch = matches.find((m) => m.bracket_section === 'reset_final');
      if (resetMatch && resetMatch.status === 'completed' && resetMatch.winner_team) {
        return resetMatch.winner_team;
      }
      const grandMatch = matches.find((m) => m.bracket_section === 'grand_final');
      if (
        grandMatch &&
        grandMatch.status === 'completed' &&
        grandMatch.winner_team &&
        resetMatch &&
        resetMatch.status === 'cancelled'
      ) {
        return grandMatch.winner_team;
      }
      return null;
    } else {
      // Single elimination: final round match
      const finalMatch = matches.find((m) => m.next_match_id === null && m.bracket_round !== null);
      if (finalMatch && finalMatch.status === 'completed' && finalMatch.winner_team) {
        return finalMatch.winner_team;
      }
      return null;
    }
  }, [matches, isDoubleElimination]);

  if (matches.length === 0) {
    return (
      <Card style={styles.emptyCard}>
        <AppText variant="body" color="secondary" style={styles.centerText}>
          Championship bracket matches will appear here once the bracket is generated.
        </AppText>
      </Card>
    );
  }

  return (
    <View style={styles.container}>
      {/* ─── Champion Trophy Banner ────────────────────────────────────────── */}
      {champion ? (
        <Card style={styles.championCard}>
          <AppText variant="heading2" style={styles.trophyIcon}>🏆</AppText>
          <AppText variant="caption" color="tertiary" style={styles.championTag}>
            TOURNAMENT CHAMPION
          </AppText>
          <AppText variant="heading1" style={styles.championName}>
            {champion.name}
          </AppText>
          {champion.seed ? (
            <Badge label={`#${champion.seed} Seed`} variant="warning" size="sm" />
          ) : null}
        </Card>
      ) : null}

      {/* ─── Section Nav Tabs for Double Elimination ──────────────────────── */}
      {isDoubleElimination && (
        <View style={styles.sectionTabsRow}>
          <TouchableOpacity
            style={[styles.sectionTabBtn, activeSection === 'winners' && styles.sectionTabBtnActive]}
            onPress={() => setActiveSection('winners')}
            activeOpacity={0.7}
          >
            <AppText
              style={[
                styles.sectionTabBtnText,
                activeSection === 'winners' && styles.sectionTabBtnTextActive,
              ]}
            >
              Winners ({counts.winners})
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sectionTabBtn, activeSection === 'losers' && styles.sectionTabBtnActive]}
            onPress={() => setActiveSection('losers')}
            activeOpacity={0.7}
          >
            <AppText
              style={[
                styles.sectionTabBtnText,
                activeSection === 'losers' && styles.sectionTabBtnTextActive,
              ]}
            >
              Losers ({counts.losers})
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sectionTabBtn, activeSection === 'finals' && styles.sectionTabBtnActive]}
            onPress={() => setActiveSection('finals')}
            activeOpacity={0.7}
          >
            <AppText
              style={[
                styles.sectionTabBtnText,
                activeSection === 'finals' && styles.sectionTabBtnTextActive,
              ]}
            >
              Finals ({counts.finals})
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.sectionTabBtn, activeSection === 'all' && styles.sectionTabBtnActive]}
            onPress={() => setActiveSection('all')}
            activeOpacity={0.7}
          >
            <AppText
              style={[
                styles.sectionTabBtnText,
                activeSection === 'all' && styles.sectionTabBtnTextActive,
              ]}
            >
              All ({counts.all})
            </AppText>
          </TouchableOpacity>
        </View>
      )}

      {/* ─── Rounds & Matches ───────────────────────────────────────────────── */}
      {displayedGroups.map((group) => {
        return (
          <View key={`round-${group.section ?? 'round'}-${group.roundNumber}`} style={styles.roundSection}>
            <View style={styles.roundHeaderRow}>
              <View style={styles.roundBadge}>
                <AppText variant="caption" style={styles.roundBadgeText}>
                  {group.roundName}
                </AppText>
              </View>
              <AppText variant="caption" color="tertiary">
                {group.completedCount}/{group.totalCount} Done
              </AppText>
            </View>

            {group.matches.map((m) => {
              const hasTeamA = Boolean(m.team_a);
              const hasTeamB = Boolean(m.team_b);
              const isCompleted = m.status === 'completed';
              const isCancelled = m.status === 'cancelled';
              const teamAWon = isCompleted && m.winner_team_id === m.team_a_id;
              const teamBWon = isCompleted && m.winner_team_id === m.team_b_id;
              const canEnterScore = !isReadOnly && hasTeamA && hasTeamB && !isCompleted && !isCancelled;
              const canEditScore = !isReadOnly && isCompleted && hasTeamA && hasTeamB && !isCancelled;
              const resetInfo = getResetFinalStatus(m);
              const placeholderA = getFeederPlaceholder(m, 'team_a');
              const placeholderB = getFeederPlaceholder(m, 'team_b');

              return (
                <Card
                  key={m.id}
                  style={[
                    styles.matchCard,
                    isCancelled && { opacity: 0.65, backgroundColor: '#F8FAFC' },
                  ]}
                >
                  <View style={styles.matchMetaRow}>
                    <AppText variant="caption" color="tertiary">
                      Match #{m.match_number ?? m.bracket_position}
                    </AppText>

                    {resetInfo.isResetFinal ? (
                      <Badge label={resetInfo.badgeLabel} variant={resetInfo.badgeVariant} size="sm" />
                    ) : isCancelled ? (
                      <Badge label="Cancelled" variant="default" size="sm" />
                    ) : (
                      <Badge
                        label={m.status_label || (isCompleted ? 'Completed' : 'Pending')}
                        variant={isCompleted ? 'success' : 'default'}
                        size="sm"
                      />
                    )}
                  </View>

                  {/* Reset Final Banner */}
                  {resetInfo.isResetFinal && (
                    <View
                      style={[
                        styles.resetBanner,
                        resetInfo.status === 'ready' && styles.resetBannerReady,
                      ]}
                    >
                      <AppText
                        variant="caption"
                        style={[
                          styles.resetBannerText,
                          resetInfo.status === 'ready' && styles.resetBannerTextReady,
                        ]}
                      >
                        {resetInfo.description}
                      </AppText>
                    </View>
                  )}

                  {/* Team A Slot */}
                  <View style={[styles.teamSlot, teamAWon && styles.winningSlot]}>
                    <View style={styles.teamNameCol}>
                      {m.team_a ? (
                        <>
                          <AppText
                            variant="bodySmall"
                            style={[styles.teamNameText, teamAWon && styles.boldText]}
                            numberOfLines={1}
                          >
                            {m.team_a.name}
                          </AppText>
                          {m.team_a.seed ? (
                            <AppText variant="caption" color="tertiary">
                              Seed #{m.team_a.seed}
                            </AppText>
                          ) : null}
                        </>
                      ) : (
                        <AppText variant="bodySmall" color="tertiary" style={{ fontStyle: 'italic' }}>
                          {isCompleted ? 'BYE' : placeholderA}
                        </AppText>
                      )}
                    </View>
                    {isCompleted && m.score_a !== null ? (
                      <AppText
                        variant="heading3"
                        style={[styles.scoreText, teamAWon && styles.winningScoreText]}
                      >
                        {m.score_a}
                      </AppText>
                    ) : null}
                  </View>

                  {/* Team B Slot */}
                  <View style={[styles.teamSlot, teamBWon && styles.winningSlot]}>
                    <View style={styles.teamNameCol}>
                      {m.team_b ? (
                        <>
                          <AppText
                            variant="bodySmall"
                            style={[styles.teamNameText, teamBWon && styles.boldText]}
                            numberOfLines={1}
                          >
                            {m.team_b.name}
                          </AppText>
                          {m.team_b.seed ? (
                            <AppText variant="caption" color="tertiary">
                              Seed #{m.team_b.seed}
                            </AppText>
                          ) : null}
                        </>
                      ) : (
                        <AppText variant="bodySmall" color="tertiary" style={{ fontStyle: 'italic' }}>
                          {isCompleted ? 'BYE' : placeholderB}
                        </AppText>
                      )}
                    </View>
                    {isCompleted && m.score_b !== null ? (
                      <AppText
                        variant="heading3"
                        style={[styles.scoreText, teamBWon && styles.winningScoreText]}
                      >
                        {m.score_b}
                      </AppText>
                    ) : null}
                  </View>

                  {/* Action Buttons */}
                  {(canEnterScore || canEditScore) && onScoreMatch ? (
                    <View style={styles.actionRow}>
                      <Button
                        label={canEnterScore ? 'Enter Score' : 'Edit Score'}
                        variant={canEnterScore ? 'primary' : 'ghost'}
                        size="sm"
                        onPress={() => onScoreMatch(m)}
                        style={styles.scoreBtn}
                      />
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[4],
  },
  emptyCard: {
    padding: Spacing[4],
    alignItems: 'center',
  },
  centerText: {
    textAlign: 'center',
  },
  championCard: {
    alignItems: 'center',
    paddingVertical: Spacing[4],
    backgroundColor: 'rgba(234, 179, 8, 0.08)',
    borderColor: 'rgba(234, 179, 8, 0.4)',
    borderWidth: 1,
    gap: Spacing[1],
    marginBottom: Spacing[2],
  },
  trophyIcon: {
    fontSize: 36,
  },
  championTag: {
    letterSpacing: 1.5,
    fontWeight: Typography.weight.bold,
    color: Colors.status.warning,
  },
  championName: {
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  roundSection: {
    gap: Spacing[2],
  },
  roundHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[1],
  },
  roundBadge: {
    backgroundColor: Colors.surface.elevated,
    paddingHorizontal: Spacing[2],
    paddingVertical: Spacing[1],
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  roundBadgeText: {
    fontWeight: Typography.weight.bold,
    color: Colors.brand.primary,
  },
  matchCard: {
    padding: Spacing[3],
    gap: Spacing[2],
  },
  matchMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamSlot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing[1.5],
    paddingHorizontal: Spacing[2],
    backgroundColor: Colors.background.secondary,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  winningSlot: {
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  teamNameCol: {
    flex: 1,
  },
  teamNameText: {
    color: Colors.text.primary,
  },
  boldText: {
    fontWeight: Typography.weight.bold,
  },
  scoreText: {
    fontWeight: Typography.weight.bold,
    color: Colors.text.secondary,
    marginLeft: Spacing[2],
  },
  winningScoreText: {
    color: Colors.status.success,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: Spacing[1],
  },
  scoreBtn: {
    minWidth: 100,
  },
  sectionTabsRow: {
    flexDirection: 'row',
    gap: Spacing[2],
    flexWrap: 'wrap',
    marginBottom: Spacing[2],
  },
  sectionTabBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    backgroundColor: Colors.background.secondary,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  sectionTabBtnActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  sectionTabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  sectionTabBtnTextActive: {
    color: '#FFFFFF',
  },
  resetBanner: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    marginTop: 4,
  },
  resetBannerReady: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  resetBannerText: {
    fontSize: 11,
    color: '#64748B',
  },
  resetBannerTextReady: {
    color: '#92400E',
    fontWeight: '700',
  },
});
