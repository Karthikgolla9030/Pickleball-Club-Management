/**
 * Aught2 Pickleball — ScrambleRoundsTab
 *
 * Tab 3 for Scramble Tournament Workspace:
 * Screen 3 exact match:
 * - Round selector pill dropdown "Round 1 ∨" + amber SETUP badge
 * - Subheading "Round 1" & "X games across Y courts"
 * - Empty state card: Calendar icon, "No Matchups Generated Yet", "▷ Generate Round Matchups" button, footnote
 * - Bottom card: "How Scramble Matchups Work" with numbered steps 1–4
 * - Populated state: Court cards with rotating doubles games, sit-out badges, score recording, and lifecycle actions
 */

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Award,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Edit2,
  Lightbulb,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  UserX,
  Users,
} from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Radius, Spacing } from '@/theme';
import type { Match } from '@/types';
import type { ScrambleState } from '@/types/scramble';
import {
  formatPartnerNames,
  getSitOutParticipant,
  groupMatchesByCourt,
  validateCourtPartition,
} from '@/utils/scrambleLogic';

interface ScrambleRoundsTabProps {
  state: ScrambleState | null;
  matches: Match[];
  canManage: boolean;
  onOpenScoreModal: (match: Match) => void;
  onStartRound: () => Promise<void>;
  onFinishRound: () => Promise<void>;
  onStartNextRound: () => Promise<void>;
  onCreateMatchups: () => Promise<void>;
  onEndTournament?: () => void;
  isStartingRound?: boolean;
  isFinishingRound?: boolean;
  isStartingNextRound?: boolean;
  isCreatingMatchups?: boolean;
}

export function ScrambleRoundsTab({
  state,
  matches,
  canManage,
  onOpenScoreModal,
  onStartRound,
  onFinishRound,
  onStartNextRound,
  onCreateMatchups,
  onEndTournament,
  isStartingRound = false,
  isFinishingRound = false,
  isStartingNextRound = false,
  isCreatingMatchups = false,
}: ScrambleRoundsTabProps) {
  const currentRound = state?.current_round ?? 1;
  const plannedRounds = Math.max(1, state?.planned_rounds ?? 3);
  const isFinalRound = state?.is_final_round ?? (currentRound >= plannedRounds);
  const isTournamentCompleted = state?.tournament_status === 'completed';
  const [selectedRound, setSelectedRound] = useState<number>(() => Math.min(currentRound, plannedRounds));
  const [isRoundPickerOpen, setIsRoundPickerOpen] = useState(false);

  // Keep selectedRound clamped within valid planned rounds
  React.useEffect(() => {
    setSelectedRound((prev) => Math.min(Math.max(1, prev), plannedRounds));
  }, [plannedRounds]);

  // Authoritative planned rounds: strictly 1..plannedRounds
  const roundNumbers = useMemo(() => {
    return Array.from({ length: plannedRounds }, (_, i) => i + 1);
  }, [plannedRounds]);

  const roundMatches = useMemo(() => {
    return matches.filter((m) => ((m.round_number ?? m.round) ?? 1) === selectedRound);
  }, [matches, selectedRound]);

  const courtGroups = useMemo(() => {
    const roundDataCourts = state?.rounds_data?.[String(selectedRound)]?.courts;
    const courtsList = roundDataCourts && roundDataCourts.length > 0
      ? roundDataCourts
      : (selectedRound === currentRound ? (state?.courts || []) : []);
    return groupMatchesByCourt(roundMatches, courtsList);
  }, [roundMatches, state?.rounds_data, state?.courts, selectedRound, currentRound]);

  const isCurrentRound = selectedRound === currentRound;

  // Round status badge helper
  const getRoundStatusInfo = (r: number) => {
    if (r < currentRound) {
      return { label: 'COMPLETED', bg: '#E5F4EC', text: '#08785E' };
    }
    if (r === currentRound) {
      switch (state?.round_status) {
        case 'setup':
          return { label: 'SETUP', bg: '#FEF3C7', text: '#D97706' };
        case 'matchups_created':
          return { label: 'READY', bg: '#E0F2FE', text: '#0284C7' };
        case 'in_progress':
          return { label: 'IN PROGRESS', bg: '#DCFCE7', text: '#15803D' };
        case 'completed':
          return { label: 'COMPLETED', bg: '#E5F4EC', text: '#08785E' };
        default:
          return { label: 'SETUP', bg: '#FEF3C7', text: '#D97706' };
      }
    }
    return { label: 'UPCOMING', bg: '#F1F5F9', text: '#64748B' };
  };

  const statusBadge = getRoundStatusInfo(selectedRound);

  // Partition validation for button enabling
  const partition = validateCourtPartition(state?.available_players_count ?? 0);
  const canGenerate =
    canManage &&
    partition.isValid &&
    (state?.round_status === 'setup' || state?.round_status === 'matchups_created');

  const allRoundGamesCompleted =
    roundMatches.length > 0 && roundMatches.every((m) => m.status === 'completed');

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* ── 1. Top Round Selector Row: Pill "Round 1 of 3 ∨" + Status Badge ── */}
      <View style={styles.topSelectorRow}>
        <TouchableOpacity
          style={styles.roundDropdownPill}
          onPress={() => {
            if (roundNumbers.length > 1) {
              setIsRoundPickerOpen(true);
            }
          }}
          activeOpacity={roundNumbers.length > 1 ? 0.7 : 1}
        >
          <AppText style={styles.roundDropdownText}>Round {selectedRound} of {plannedRounds}</AppText>
          {roundNumbers.length > 1 && (
            <ChevronDown size={16} color="#102E2A" style={{ marginLeft: 6 }} />
          )}
        </TouchableOpacity>

        <View style={[styles.badge, { backgroundColor: statusBadge.bg }]}>
          <AppText style={[styles.badgeText, { color: statusBadge.text }]}>
            {statusBadge.label}
          </AppText>
        </View>
      </View>

      {/* Round Selection Modal if multiple rounds exist */}
      <Modal
        visible={isRoundPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsRoundPickerOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsRoundPickerOpen(false)}
        >
          <View style={styles.modalCard}>
            <AppText style={styles.modalTitle}>Select Round</AppText>
            {roundNumbers.map((r) => {
              const rStatus = getRoundStatusInfo(r);
              const isSelected = r === selectedRound;
              return (
                <TouchableOpacity
                  key={r}
                  style={[styles.modalOption, isSelected && styles.modalOptionSelected]}
                  onPress={() => {
                    setSelectedRound(r);
                    setIsRoundPickerOpen(false);
                  }}
                >
                  <View style={styles.modalRoundRow}>
                    <AppText
                      style={[
                        styles.modalOptionText,
                        isSelected && styles.modalOptionTextSelected,
                      ]}
                    >
                      Round {r} of {plannedRounds} {r === currentRound ? '(Current)' : ''}
                    </AppText>
                    <View style={[styles.modalRoundBadge, { backgroundColor: rStatus.bg }]}>
                      <AppText style={[styles.modalRoundBadgeText, { color: rStatus.text }]}>
                        {rStatus.label}
                      </AppText>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── 2. Round Subheading ── */}
      <View style={styles.subheadingRow}>
        <AppText style={styles.subheadingTitle}>Round {selectedRound} of {plannedRounds}</AppText>
        <AppText style={styles.subheadingSubtitle}>
          {roundMatches.length} games across {courtGroups.length} courts
        </AppText>
      </View>

      {/* ── 3. Content: Empty State vs Court Cards ── */}
      {roundMatches.length === 0 ? (
        selectedRound > currentRound ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Clock size={32} color="#71817E" />
            </View>
            <AppText style={styles.emptyTitle}>Round {selectedRound} (Upcoming)</AppText>
            <AppText style={styles.emptyDescription}>
              Matchups for Round {selectedRound} will become available once Round {selectedRound - 1} is completed.
            </AppText>
          </View>
        ) : selectedRound < currentRound ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Calendar size={32} color="#71817E" />
            </View>
            <AppText style={styles.emptyTitle}>No Games Found</AppText>
            <AppText style={styles.emptyDescription}>
              No matches are recorded for Round {selectedRound}.
            </AppText>
          </View>
        ) : (
          // Empty State matching Screen 3 for current round
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Calendar size={32} color="#71817E" />
            </View>

            <AppText style={styles.emptyTitle}>No Matchups Generated Yet</AppText>
            <AppText style={styles.emptyDescription}>
              Select player availability in the Players tab, then generate round matchups.
            </AppText>

            {canManage && (
              <TouchableOpacity
                style={[
                  styles.generateMatchupsButton,
                  canGenerate ? styles.generateButtonActive : styles.generateButtonDisabled,
                ]}
                onPress={onCreateMatchups}
                disabled={isCreatingMatchups || !canGenerate}
                activeOpacity={0.8}
              >
                {isCreatingMatchups ? (
                  <ActivityIndicator size="small" color={canGenerate ? '#FFFFFF' : '#71817E'} />
                ) : (
                  <Play
                    size={16}
                    color={canGenerate ? '#FFFFFF' : '#71817E'}
                    fill={canGenerate ? '#FFFFFF' : '#71817E'}
                  />
                )}
                <AppText
                  style={[
                    styles.generateButtonText,
                    canGenerate ? styles.generateButtonTextActive : styles.generateButtonTextDisabled,
                  ]}
                >
                  {isCreatingMatchups ? 'Generating...' : 'Generate Round Matchups'}
                </AppText>
              </TouchableOpacity>
            )}

            <AppText style={styles.emptyFootnote}>
              You need at least 4 players and a valid 4/5-player court partition to generate matchups.
            </AppText>
          </View>
        )
      ) : (
        // Populated Court Cards
        <View style={styles.courtsList}>
          {courtGroups.map((courtGroup, cIdx) => {
            const courtInfo = courtGroup.court;
            const courtNum = courtInfo?.court_number ?? cIdx + 1;
            const playerCount = courtInfo?.player_count ?? 4;

            return (
              <View key={courtInfo?.court_id ?? `court-${cIdx}`} style={styles.courtCard}>
                <View style={styles.courtHeader}>
                  <View style={styles.courtBadge}>
                    <AppText style={styles.courtBadgeText}>COURT {courtNum}</AppText>
                  </View>
                  <AppText style={styles.courtMetaText}>
                    {playerCount}-Player Court • {courtGroup.matches.length} Games
                  </AppText>
                </View>

                {/* Court Matches */}
                <View style={styles.matchesList}>
                  {courtGroup.matches.length === 0 ? (
                    <View style={styles.noMatchesCourtCard}>
                      <Clock size={16} color="#71817E" />
                      <AppText style={styles.noMatchesCourtText}>
                        No matches assigned to this court in Round {selectedRound}
                      </AppText>
                    </View>
                  ) : (
                    courtGroup.matches.map((match, idx) => {
                    const isCompleted = match.status === 'completed';
                    const scoreA = match.score_a ?? 0;
                    const scoreB = match.score_b ?? 0;
                    const sitOut = getSitOutParticipant(match);
                    const sideANames = formatPartnerNames(match.side_a_participants);
                    const sideBNames = formatPartnerNames(match.side_b_participants);

                    return (
                      <View key={match.id} style={styles.matchItem}>
                        <View style={styles.matchTopRow}>
                          <AppText style={styles.gameNumberText}>Game {idx + 1}</AppText>
                          {isCompleted ? (
                            <View style={styles.completedTag}>
                              <CheckCircle2 size={12} color="#08785E" />
                              <AppText style={styles.completedTagText}>Final</AppText>
                            </View>
                          ) : (
                            <View style={styles.scheduledTag}>
                              <Clock size={12} color="#71817E" />
                              <AppText style={styles.scheduledTagText}>Scheduled</AppText>
                            </View>
                          )}
                        </View>

                        {/* Teams & Score */}
                        <View style={styles.gameRow}>
                          <View style={{ flex: 1 }}>
                            <AppText
                              style={[
                                styles.teamNames,
                                isCompleted && scoreA > scoreB && styles.winningTeam,
                              ]}
                            >
                              {sideANames}
                            </AppText>
                            <AppText style={styles.vsText}>vs</AppText>
                            <AppText
                              style={[
                                styles.teamNames,
                                isCompleted && scoreB > scoreA && styles.winningTeam,
                              ]}
                            >
                              {sideBNames}
                            </AppText>
                          </View>

                          {/* Score or Action */}
                          <View style={styles.scoreContainer}>
                            {isCompleted ? (
                              <TouchableOpacity
                                style={styles.scoreDisplayBadge}
                                onPress={() => canManage && !isTournamentCompleted && onOpenScoreModal(match)}
                                disabled={!canManage || isTournamentCompleted}
                              >
                                <AppText style={styles.finalScoreText}>
                                  {scoreA} - {scoreB}
                                </AppText>
                                {canManage && !isTournamentCompleted && <Edit2 size={12} color="#71817E" />}
                              </TouchableOpacity>
                            ) : (
                              canManage && !isTournamentCompleted && (
                                <TouchableOpacity
                                  style={styles.recordScoreButton}
                                  onPress={() => onOpenScoreModal(match)}
                                >
                                  <AppText style={styles.recordScoreText}>Enter Score</AppText>
                                </TouchableOpacity>
                              )
                            )}
                          </View>
                        </View>

                        {/* Sit-out Player for 5-player court */}
                        {sitOut && (
                          <View style={styles.sitOutBanner}>
                            <UserX size={12} color="#71817E" />
                            <AppText style={styles.sitOutText}>
                              Sit-out: {sitOut.display_name || 'Player'}
                            </AppText>
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
                </View>
              </View>
            );
          })}

          {/* Lifecycle Actions Banner when matches exist */}
          {canManage && isCurrentRound && (
            <View style={styles.lifecycleBanner}>
              {state?.round_status === 'matchups_created' && (
                <TouchableOpacity
                  style={styles.primaryPillButton}
                  onPress={onStartRound}
                  disabled={isStartingRound}
                >
                  <Play size={16} color="#FFFFFF" fill="#FFFFFF" />
                  <AppText style={styles.primaryPillText}>
                    {isStartingRound ? 'Starting...' : `Start Round ${currentRound}`}
                  </AppText>
                </TouchableOpacity>
              )}

              {state?.round_status === 'in_progress' && (
                <TouchableOpacity
                  style={[
                    styles.primaryPillButton,
                    allRoundGamesCompleted ? styles.finishRoundActive : styles.finishRoundDisabled,
                  ]}
                  onPress={onFinishRound}
                  disabled={isFinishingRound || !allRoundGamesCompleted}
                >
                  <CheckCircle2 size={16} color="#FFFFFF" />
                  <AppText style={styles.primaryPillText}>
                    {isFinishingRound
                      ? 'Finishing...'
                      : allRoundGamesCompleted
                      ? `Finish Round ${currentRound}`
                      : `Finish Round (${roundMatches.filter((m) => m.status === 'completed').length}/${roundMatches.length} games)`}
                  </AppText>
                </TouchableOpacity>
              )}

              {state?.round_status === 'completed' && state.tournament_status !== 'completed' && (
                isFinalRound ? (
                  <TouchableOpacity
                    style={[styles.primaryPillButton, { backgroundColor: '#B45309' }]}
                    onPress={onEndTournament}
                  >
                    <Trophy size={16} color="#FFFFFF" />
                    <AppText style={styles.primaryPillText}>
                      All {plannedRounds} Planned Rounds Completed — Finalize Results
                    </AppText>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.primaryPillButton}
                    onPress={onStartNextRound}
                    disabled={isStartingNextRound}
                  >
                    <RotateCcw size={16} color="#FFFFFF" />
                    <AppText style={styles.primaryPillText}>
                      {isStartingNextRound
                        ? 'Preparing...'
                        : `Advance to Round ${currentRound + 1} of ${plannedRounds}`}
                    </AppText>
                  </TouchableOpacity>
                )
              )}
            </View>
          )}
        </View>
      )}

      {/* ── 4. Bottom Card: How Scramble Matchups Work ── */}
      <View style={styles.infoCard}>
        <View style={styles.infoCardHeader}>
          <Lightbulb size={20} color="#D97706" />
          <AppText style={styles.infoCardTitle}>How Scramble Matchups Work</AppText>
        </View>

        <View style={styles.stepsList}>
          <View style={styles.stepItem}>
            <View style={styles.stepNumberCircle}>
              <AppText style={styles.stepNumberText}>1</AppText>
            </View>
            <AppText style={styles.stepDescription}>
              Players are divided into courts of 4 or 5.
            </AppText>
          </View>

          <View style={styles.stepItem}>
            <View style={styles.stepNumberCircle}>
              <AppText style={styles.stepNumberText}>2</AppText>
            </View>
            <AppText style={styles.stepDescription}>
              Each court plays all its scheduled games with rotating partners.
            </AppText>
          </View>

          <View style={styles.stepItem}>
            <View style={styles.stepNumberCircle}>
              <AppText style={styles.stepNumberText}>3</AppText>
            </View>
            <AppText style={styles.stepDescription}>
              4-player court: 3 games (0 sit-outs).
            </AppText>
          </View>

          <View style={styles.stepItem}>
            <View style={styles.stepNumberCircle}>
              <AppText style={styles.stepNumberText}>4</AppText>
            </View>
            <AppText style={styles.stepDescription}>
              5-player court: 5 games (each player sits out once).
            </AppText>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[3],
    paddingBottom: Spacing[8],
    gap: Spacing[3],
  },
  topSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roundDropdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DCE8E3',
    paddingHorizontal: Spacing[3] + 2,
    paddingVertical: 8,
  },
  roundDropdownText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102E2A',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subheadingRow: {
    marginTop: Spacing[1],
  },
  subheadingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#102E2A',
  },
  subheadingSubtitle: {
    fontSize: 13,
    color: '#71817E',
    marginTop: 2,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg ?? 16,
    borderWidth: 1,
    borderColor: '#DCE8E3',
    paddingVertical: Spacing[8],
    paddingHorizontal: Spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F3FAF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[3],
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102E2A',
    textAlign: 'center',
    marginBottom: Spacing[2],
  },
  emptyDescription: {
    fontSize: 13,
    lineHeight: 19,
    color: '#71817E',
    textAlign: 'center',
    maxWidth: 280,
    marginBottom: Spacing[4],
  },
  generateMatchupsButton: {
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing[5],
    gap: Spacing[2],
    marginBottom: Spacing[3],
  },
  generateButtonActive: {
    backgroundColor: '#08785E',
  },
  generateButtonDisabled: {
    backgroundColor: '#E5EDE9',
  },
  generateButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  generateButtonTextActive: {
    color: '#FFFFFF',
  },
  generateButtonTextDisabled: {
    color: '#71817E',
  },
  emptyFootnote: {
    fontSize: 11,
    color: '#71817E',
    textAlign: 'center',
    maxWidth: 290,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg ?? 16,
    borderWidth: 1,
    borderColor: '#DCE8E3',
    padding: Spacing[4],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  infoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginBottom: Spacing[3],
  },
  infoCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102E2A',
  },
  stepsList: {
    gap: Spacing[3],
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  stepNumberCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F3FAF5',
    borderWidth: 1,
    borderColor: '#DCE8E3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#102E2A',
  },
  stepDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: '#334155',
    flex: 1,
  },
  courtsList: {
    gap: Spacing[3],
  },
  courtCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg ?? 16,
    borderWidth: 1,
    borderColor: '#DCE8E3',
    padding: Spacing[4],
  },
  courtHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[3],
    paddingBottom: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  courtBadge: {
    backgroundColor: '#E5F4EC',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  courtBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#08785E',
  },
  courtMetaText: {
    fontSize: 12,
    color: '#71817E',
  },
  matchesList: {
    gap: Spacing[3],
  },
  matchItem: {
    backgroundColor: '#F8FAF9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5EDE9',
    padding: Spacing[3],
  },
  matchTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[2],
  },
  gameNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#102E2A',
  },
  completedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E5F4EC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  completedTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#08785E',
  },
  scheduledTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  scheduledTagText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#71817E',
  },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  teamNames: {
    fontSize: 13,
    fontWeight: '600',
    color: '#102E2A',
  },
  winningTeam: {
    color: '#08785E',
    fontWeight: '800',
  },
  vsText: {
    fontSize: 11,
    color: '#A3ADB8',
    marginVertical: 2,
  },
  scoreContainer: {
    alignItems: 'flex-end',
  },
  scoreDisplayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE8E3',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6,
  },
  finalScoreText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#102E2A',
  },
  recordScoreButton: {
    backgroundColor: '#08785E',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  recordScoreText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sitOutBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing[2],
    paddingTop: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  sitOutText: {
    fontSize: 11,
    color: '#71817E',
    fontStyle: 'italic',
  },
  lifecycleBanner: {
    marginTop: Spacing[2],
  },
  primaryPillButton: {
    backgroundColor: '#08785E',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: Spacing[2],
  },
  finishRoundActive: {
    backgroundColor: '#15803D',
  },
  finishRoundDisabled: {
    backgroundColor: '#A3ADB8',
  },
  primaryPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing[4],
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: Spacing[4],
    width: '80%',
    maxWidth: 320,
    gap: Spacing[2],
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102E2A',
    marginBottom: Spacing[2],
  },
  modalOption: {
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[3],
    borderRadius: 8,
  },
  modalOptionSelected: {
    backgroundColor: '#E5F4EC',
  },
  modalOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#102E2A',
  },
  modalOptionTextSelected: {
    color: '#08785E',
    fontWeight: '700',
  },
  modalRoundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalRoundBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  modalRoundBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  noMatchesCourtCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Spacing[4],
    paddingHorizontal: Spacing[3],
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  noMatchesCourtText: {
    fontSize: 13,
    color: '#71817E',
    fontWeight: '500',
  },
});
