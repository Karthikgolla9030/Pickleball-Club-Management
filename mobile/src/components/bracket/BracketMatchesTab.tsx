/**
 * Aught2 Pickleball — BracketMatchesTab
 *
 * Tab 4 for Bracket Tournament Mode:
 * - Vertical list of bracket matches
 * - Segmented / filter chips: All, Ready, Waiting, Completed
 * - Round labels, team matchup details, scorelines, court indicators
 * - Quick score entry trigger for staff on playable matches
 */

import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Calendar, Zap } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { FilterChips } from '@/components/FilterChips';
import { Colors, Radius, Spacing } from '@/theme';
import type { Court, Match } from '@/types';
import {
  getBracketRoundName,
  getFeederPlaceholder,
  getAdvancementRoute,
  getResetFinalStatus,
  isMatchBye,
  isMatchReady,
  isMatchWaiting,
} from '@/utils/bracketLogic';

interface BracketMatchesTabProps {
  matches: Match[];
  courts: Court[];
  canManage: boolean;
  onOpenScoreModal: (match: Match) => void;
  onStartMatch?: (matchId: string) => Promise<void>;
  isStartingMatch?: boolean;
  isTournamentCompleted?: boolean;
}

type MatchStatusFilter = 'all' | 'ready' | 'waiting' | 'completed';
type SectionFilter = 'all' | 'winners' | 'losers' | 'finals';

export function BracketMatchesTab({
  matches,
  courts,
  canManage,
  onOpenScoreModal,
  onStartMatch,
  isStartingMatch = false,
  isTournamentCompleted = false,
}: BracketMatchesTabProps) {
  const [statusFilter, setStatusFilter] = useState<MatchStatusFilter>('all');
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('all');

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

  const totalRounds = useMemo(() => {
    if (matches.length === 0) return 1;
    return Math.max(...matches.map((m) => m.bracket_round ?? m.round_number ?? 1), 1);
  }, [matches]);

  const readyMatches = useMemo(
    () =>
      matches.filter(
        (m) =>
          isMatchReady(m) &&
          m.status !== 'completed' &&
          m.status !== 'cancelled' &&
          !isMatchBye(m)
      ),
    [matches]
  );

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      // Section filter
      if (isDoubleElimination && sectionFilter !== 'all') {
        const sec = (m.bracket_section || '').toLowerCase();
        if (sectionFilter === 'winners' && sec !== 'winners' && sec !== '') return false;
        if (sectionFilter === 'losers' && sec !== 'losers') return false;
        if (sectionFilter === 'finals' && sec !== 'grand_final' && sec !== 'reset_final') return false;
      }

      // Status filter
      if (statusFilter === 'all') return true;
      if (statusFilter === 'completed') return m.status === 'completed';
      if (statusFilter === 'ready') return isMatchReady(m);
      if (statusFilter === 'waiting') return isMatchWaiting(m);
      return true;
    });
  }, [matches, isDoubleElimination, sectionFilter, statusFilter]);

  const getCourtName = (courtId?: string | null) => {
    if (!courtId) return null;
    const found = courts.find((c) => c.id === courtId);
    return found ? found.display_name || found.name : 'Court';
  };

  const statusChips: { key: MatchStatusFilter; label: string }[] = [
    { key: 'all', label: `All (${matches.length})` },
    { key: 'ready', label: `Ready (${matches.filter(isMatchReady).length})` },
    { key: 'waiting', label: `Waiting (${matches.filter(isMatchWaiting).length})` },
    { key: 'completed', label: `Completed (${matches.filter((m) => m.status === 'completed').length})` },
  ];

  const sectionChips: { key: SectionFilter; label: string }[] = [
    { key: 'all', label: 'All Stages' },
    {
      key: 'winners',
      label: `Winners (${matches.filter((m) => !m.bracket_section || m.bracket_section === 'winners').length})`,
    },
    {
      key: 'losers',
      label: `Losers (${matches.filter((m) => m.bracket_section === 'losers').length})`,
    },
    {
      key: 'finals',
      label: `Finals (${matches.filter((m) => m.bracket_section === 'grand_final' || m.bracket_section === 'reset_final').length})`,
    },
  ];

  return (
    <View style={styles.container}>
      {/* Page Heading */}
      <View style={styles.headingRow}>
        <AppText style={styles.headerTitle}>Matches</AppText>
      </View>

      {matches.length === 0 ? (
        <Card style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <Calendar size={32} color="#102F2B" />
          </View>
          <AppText style={styles.emptyTitle}>
            No matches scheduled
          </AppText>
          <AppText style={styles.emptySubtitle}>
            The match schedule will appear here after the bracket is generated.
          </AppText>
        </Card>
      ) : (
        <>
          {/* Section Filter Chips for Double Elimination */}
          {isDoubleElimination && (
            <FilterChips<SectionFilter>
              chips={sectionChips}
              activeChip={sectionFilter}
              onChipPress={(key) => setSectionFilter(key)}
            />
          )}

          {/* Status Filter Chips */}
          <FilterChips<MatchStatusFilter>
            chips={statusChips}
            activeChip={statusFilter}
            onChipPress={(key) => setStatusFilter(key)}
          />

          {/* Ready to Play Now Queue (Fast Organizer Action) */}
          {(statusFilter === 'all' || statusFilter === 'ready') && readyMatches.length > 0 && (
            <Card style={styles.readyQueueCard}>
              <View style={styles.readyQueueHeader}>
                <View style={styles.readyQueueTitleRow}>
                  <Zap size={15} color="#D97706" fill="#D97706" />
                  <AppText style={styles.readyQueueTitle}>
                    Ready to Play Now ({readyMatches.length})
                  </AppText>
                </View>
                <AppText style={styles.readyQueueSubtitle}>
                  Both teams determined • Ready for court assignment & score entry
                </AppText>
              </View>

              <View style={styles.readyQueueList}>
                {readyMatches.map((rm) => (
                  <View key={`queue-item-${rm.id}`} style={styles.readyQueueItem}>
                    <View style={styles.readyQueueItemLeft}>
                      <Badge
                        label={`#${rm.match_number ?? rm.bracket_position}`}
                        variant="warning"
                      />
                      <View style={{ flex: 1 }}>
                        <AppText variant="bodySmall" numberOfLines={1} style={styles.readyQueueMatchup}>
                          {rm.team_a?.name ?? 'Team A'} vs {rm.team_b?.name ?? 'Team B'}
                        </AppText>
                        <AppText variant="caption" color="secondary">
                          {rm.label || (rm.bracket_section === 'losers' ? 'Losers Bracket' : 'Winners Bracket')}
                        </AppText>
                      </View>
                    </View>

                    <View style={styles.readyQueueActions}>
                      {canManage && rm.status === 'pending' && onStartMatch && (
                        <Button
                          label="Start"
                          variant="outline"
                          size="sm"
                          onPress={() => void onStartMatch(rm.id)}
                          disabled={isStartingMatch}
                        />
                      )}
                      {canManage && (
                        <Button
                          label="Score"
                          variant="primary"
                          size="sm"
                          onPress={() => onOpenScoreModal(rm)}
                        />
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          )}

          {/* Matches List */}
          <View style={styles.matchesList}>
            {filteredMatches.map((match) => {
              const isBye = isMatchBye(match);
              const isReady = isMatchReady(match);
              const isCompleted = match.status === 'completed';
              const isCancelled = match.status === 'cancelled';
              const isWaiting = isMatchWaiting(match);
              const resetInfo = getResetFinalStatus(match);
              const isGrandFinal = match.bracket_section === 'grand_final';
              const advancement = getAdvancementRoute(match);

              const roundNum = match.bracket_round ?? match.round_number ?? 1;
              const roundName =
                match.label ||
                (match.bracket_section === 'losers'
                  ? `Losers Round ${roundNum}`
                  : match.bracket_section === 'grand_final'
                  ? 'Grand Final'
                  : match.bracket_section === 'reset_final'
                  ? 'Reset Final'
                  : getBracketRoundName(roundNum, totalRounds));

              const placeholderA = getFeederPlaceholder(match, 'team_a', matches);
              const placeholderB = getFeederPlaceholder(match, 'team_b', matches);

              const teamAName = match.team_a?.name ?? (isCompleted ? 'Team A' : placeholderA);
              const teamBName = isBye
                ? 'BYE'
                : (match.team_b?.name ?? (isCompleted ? 'Team B' : placeholderB));

              const winnerIsA = isCompleted && match.winner_team_id === match.team_a_id;
              const winnerIsB = isCompleted && match.winner_team_id === match.team_b_id;

              const courtLabel = getCourtName(match.court_id);

              const canEnterScore =
                isReady &&
                !isCompleted &&
                !isBye &&
                !isCancelled &&
                Boolean(match.team_a_id && match.team_b_id) &&
                !isTournamentCompleted;

              const canEditScore =
                isCompleted && !isBye && !isCancelled && !isTournamentCompleted;

              return (
                <Card
                  key={match.id}
                  style={[
                    styles.matchCard,
                    isCancelled && { opacity: 0.65, backgroundColor: '#F8FAFC' },
                  ]}
                >
                  {/* Top Row: Round, Match #, Court, Status */}
                  <View style={styles.matchTopRow}>
                    <View style={styles.matchHeaderLeft}>
                      <Badge label={roundName} variant="default" />
                      <AppText variant="caption" color="secondary" style={{ fontWeight: '700' }}>
                        MATCH #{match.match_number ?? match.bracket_position}
                      </AppText>
                      {courtLabel && (
                        <View style={styles.courtPill}>
                          <AppText variant="caption" style={styles.courtPillText}>
                            {courtLabel}
                          </AppText>
                        </View>
                      )}
                    </View>

                    {resetInfo.isResetFinal ? (
                      <Badge label={resetInfo.badgeLabel} variant={resetInfo.badgeVariant} />
                    ) : isBye ? (
                      <Badge label="BYE" variant="default" />
                    ) : isCancelled ? (
                      <Badge label="Not Required" variant="default" />
                    ) : isCompleted ? (
                      <Badge label="Completed" variant="success" />
                    ) : isReady ? (
                      <Badge label="Ready to Play" variant="warning" />
                    ) : (
                      <Badge label="Waiting" variant="default" />
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

                  {/* Grand Final Banner */}
                  {isGrandFinal && (
                    <View style={styles.grandFinalBanner}>
                      <AppText variant="caption" style={styles.grandFinalBannerText}>
                        🏆 Grand Championship Final (WB Undefeated vs LB Finalist)
                      </AppText>
                    </View>
                  )}

                  {/* Waiting Feeder Details Notice */}
                  {isWaiting && !isCancelled && !isBye && (
                    <View style={styles.waitingBanner}>
                      <AppText variant="caption" style={styles.waitingBannerText}>
                        ⏳ Waiting: {placeholderA} vs {placeholderB}
                      </AppText>
                    </View>
                  )}

                  {/* Scoreboard Box */}
                  <View style={styles.scoreboardBox}>
                    {/* Team A */}
                    <View style={[styles.teamRow, winnerIsA && styles.teamRowWinner]}>
                      <View style={styles.teamInfoCol}>
                        <View style={styles.teamTitleRow}>
                          {match.team_a?.seed !== null && match.team_a?.seed !== undefined ? (
                            <View style={styles.smallSeedBadge}>
                              <AppText variant="caption" style={styles.seedNumText}>
                                #{match.team_a.seed}
                              </AppText>
                            </View>
                          ) : null}
                          <View style={{ flex: 1 }}>
                            <AppText
                              variant="bodySmall"
                              numberOfLines={1}
                              style={[
                                styles.teamName,
                                winnerIsA && styles.winnerTeamName,
                                !match.team_a_id && styles.placeholderTeamName,
                              ]}
                            >
                              {teamAName}
                            </AppText>
                            {isGrandFinal && match.wb_champion_slot === 'team_a' && (
                              <AppText variant="caption" style={styles.slotSubtitle}>
                                Undefeated WB Champion
                              </AppText>
                            )}
                            {isGrandFinal && match.wb_champion_slot === 'team_b' && (
                              <AppText variant="caption" style={styles.slotSubtitle}>
                                Losers Final Champion
                              </AppText>
                            )}
                          </View>
                        </View>
                      </View>

                      {isCompleted && !isBye && !isCancelled && (
                        <AppText
                          variant="heading3"
                          style={[styles.scoreNum, winnerIsA && styles.winningScoreNum]}
                        >
                          {match.score_a ?? '—'}
                        </AppText>
                      )}

                      {isBye && winnerIsA && (
                        <Badge label="✓ Advances" variant="success" />
                      )}
                    </View>

                    <View style={styles.divider} />

                    {/* Team B */}
                    <View style={[styles.teamRow, winnerIsB && styles.teamRowWinner]}>
                      <View style={styles.teamInfoCol}>
                        <View style={styles.teamTitleRow}>
                          {match.team_b?.seed !== null && match.team_b?.seed !== undefined ? (
                            <View style={styles.smallSeedBadge}>
                              <AppText variant="caption" style={styles.seedNumText}>
                                #{match.team_b.seed}
                              </AppText>
                            </View>
                          ) : null}
                          <View style={{ flex: 1 }}>
                            <AppText
                              variant="bodySmall"
                              numberOfLines={1}
                              style={[
                                styles.teamName,
                                winnerIsB && styles.winnerTeamName,
                                (!match.team_b_id && !isBye) && styles.placeholderTeamName,
                                isBye && styles.byeLabel,
                              ]}
                            >
                              {teamBName}
                            </AppText>
                            {isGrandFinal && match.wb_champion_slot === 'team_a' && (
                              <AppText variant="caption" style={styles.slotSubtitle}>
                                Losers Final Champion
                              </AppText>
                            )}
                            {isGrandFinal && match.wb_champion_slot === 'team_b' && (
                              <AppText variant="caption" style={styles.slotSubtitle}>
                                Undefeated WB Champion
                              </AppText>
                            )}
                          </View>
                        </View>
                      </View>

                      {isCompleted && !isBye && !isCancelled && (
                        <AppText
                          variant="heading3"
                          style={[styles.scoreNum, winnerIsB && styles.winningScoreNum]}
                        >
                          {match.score_b ?? '—'}
                        </AppText>
                      )}

                      {isBye && winnerIsB && (
                        <Badge label="✓ Advances" variant="success" />
                      )}
                    </View>
                  </View>

                  {/* Advancement Routes (Where winner & loser advance) */}
                  {(advancement.winnerBadge || advancement.loserBadge) && (
                    <View style={styles.advancementRow}>
                      {advancement.winnerBadge && (
                        <View style={styles.advancementPill}>
                          <AppText variant="caption" style={styles.advancementWinner}>
                            {advancement.winnerBadge}
                          </AppText>
                        </View>
                      )}
                      {advancement.loserBadge && (
                        <View style={styles.advancementPill}>
                          <AppText variant="caption" style={styles.advancementLoser}>
                            {advancement.loserBadge}
                          </AppText>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Actions Footer */}
                  {canManage && (
                    <View style={styles.cardFooter}>
                      {isReady && match.status === 'pending' && onStartMatch && (
                        <Button
                          label="Start Match"
                          variant="outline"
                          size="sm"
                          onPress={() => void onStartMatch(match.id)}
                          disabled={isStartingMatch}
                          style={{ flex: 1 }}
                        />
                      )}

                      {canEnterScore && (
                        <Button
                          label="Enter Score"
                          variant="primary"
                          size="sm"
                          onPress={() => onOpenScoreModal(match)}
                          style={{ flex: 1 }}
                        />
                      )}

                      {canEditScore && (
                        <Button
                          label="Edit Score"
                          variant="outline"
                          size="sm"
                          onPress={() => onOpenScoreModal(match)}
                          style={{ flex: 1 }}
                        />
                      )}

                      {isCancelled && (
                        <AppText variant="caption" color="tertiary" style={styles.mutedNote}>
                          Match not required
                        </AppText>
                      )}
                    </View>
                  )}
                </Card>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[4],
    gap: Spacing[3],
  },
  headingRow: {
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#102F2B',
  },
  emptyCard: {
    padding: Spacing[6],
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#DDE8E2',
    borderWidth: 1,
    borderRadius: 16,
    gap: 8,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EBF4F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#102F2B',
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    color: '#71817E',
    maxWidth: 290,
  },
  readyQueueCard: {
    padding: Spacing[3.5],
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: Radius.lg,
    gap: Spacing[2.5],
  },
  readyQueueHeader: {
    gap: 2,
  },
  readyQueueTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  readyQueueTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
  },
  readyQueueSubtitle: {
    fontSize: 11,
    color: '#B45309',
  },
  readyQueueList: {
    gap: Spacing[2],
  },
  readyQueueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: Spacing[2.5],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#FEF3C7',
    gap: Spacing[2],
  },
  readyQueueItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    flex: 1,
  },
  readyQueueMatchup: {
    fontWeight: '700',
    color: Colors.text.primary,
  },
  readyQueueActions: {
    flexDirection: 'row',
    gap: Spacing[1.5],
  },
  matchesList: {
    gap: Spacing[3],
  },
  matchCard: {
    padding: Spacing[3],
    backgroundColor: Colors.background.secondary,
    borderColor: Colors.surface.border,
    gap: Spacing[2],
  },
  matchTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  courtPill: {
    paddingHorizontal: Spacing[1.5],
    paddingVertical: 1,
    borderRadius: Radius.sm,
    backgroundColor: Colors.background.tertiary,
  },
  courtPillText: {
    color: Colors.text.secondary,
    fontSize: 10,
    fontWeight: '600',
  },
  scoreboardBox: {
    backgroundColor: Colors.background.tertiary,
    borderRadius: Radius.md,
    padding: Spacing[2],
    gap: Spacing[1.5],
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: Radius.sm,
  },
  teamRowWinner: {
    backgroundColor: '#E7F5EC',
  },
  teamInfoCol: {
    flex: 1,
  },
  teamTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1.5],
  },
  smallSeedBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface.elevated,
    minWidth: 16,
    alignItems: 'center',
  },
  seedNumText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.brand.primary,
  },
  teamName: {
    color: Colors.text.secondary,
    flex: 1,
  },
  winnerTeamName: {
    color: Colors.text.primary,
    fontWeight: '700',
  },
  placeholderTeamName: {
    color: Colors.text.tertiary,
    fontStyle: 'italic',
  },
  byeLabel: {
    color: Colors.text.tertiary,
    fontWeight: '700',
  },
  scoreNum: {
    color: Colors.text.secondary,
    minWidth: 28,
    textAlign: 'right',
  },
  winningScoreNum: {
    color: Colors.status.success,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surface.border,
  },
  waitingBanner: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
    marginTop: 2,
  },
  waitingBannerText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600',
  },
  advancementRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[1.5],
    paddingTop: 2,
  },
  advancementPill: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.background.tertiary,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  advancementWinner: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#047857',
  },
  advancementLoser: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#B45309',
  },
  cardFooter: {
    flexDirection: 'row',
    marginTop: 2,
  },
  resetBanner: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    marginTop: 2,
  },
  resetBannerReady: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  resetBannerText: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 14,
  },
  resetBannerTextReady: {
    color: '#92400E',
    fontWeight: '700',
  },
  grandFinalBanner: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    marginTop: 2,
  },
  grandFinalBannerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  slotSubtitle: {
    fontSize: 10,
    color: '#047857',
    fontWeight: '600',
    marginTop: 1,
  },
  mutedNote: {
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    flex: 1,
    paddingVertical: 4,
  },
});
