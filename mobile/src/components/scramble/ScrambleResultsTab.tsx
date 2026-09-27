/**
 * Aught2 Pickleball — ScrambleResultsTab
 *
 * Tab 5 for Scramble Tournament Workspace:
 * Screen 5 exact match:
 * - 3-column top summary card: PLAYED GAMES | REMAINING | STATUS (e.g. 0% DONE)
 * - Heading: "Match History ({count})" & "All Rounds ∨" dropdown pill
 * - Empty state card: CheckCircle icon, "No completed games yet", description
 * - Bottom info panel: "Results are updated in real time after scores are entered in the Rounds tab."
 * - Populated state: Chronological completed match cards with scores & winners
 */

import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CheckCircle2,
  ChevronDown,
  Info,
  ShieldCheck,
  Trophy,
} from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Radius, Spacing } from '@/theme';
import type { Match } from '@/types';
import type { ScrambleState, ScrambleSubTab } from '@/types/scramble';
import { formatPartnerNames } from '@/utils/scrambleLogic';

interface ScrambleResultsTabProps {
  state: ScrambleState | null;
  matches: Match[];
  canManage: boolean;
  onOpenScoreModal?: (match: Match) => void;
  onNavigateTab?: (tab: ScrambleSubTab) => void;
}

export function ScrambleResultsTab({
  state,
  matches,
  canManage,
  onOpenScoreModal,
  onNavigateTab,
}: ScrambleResultsTabProps) {
  const [selectedRoundFilter, setSelectedRoundFilter] = useState<number | 'all'>('all');
  const [isFilterPickerOpen, setIsFilterPickerOpen] = useState(false);

  const isCompleted = state?.tournament_status === 'completed';

  // Completed matches only
  const completedMatches = useMemo(() => {
    return matches.filter((m) => m.status === 'completed');
  }, [matches]);

  // Available rounds
  const availableRounds = useMemo(() => {
    const rounds = new Set<number>();
    matches.forEach((m) => {
      const r = m.round_number ?? m.round;
      if (r) rounds.add(r);
    });
    return Array.from(rounds).sort((a, b) => a - b);
  }, [matches]);

  // Filtered completed matches
  const filteredCompletedMatches = useMemo(() => {
    if (selectedRoundFilter === 'all') {
      return completedMatches;
    }
    return completedMatches.filter(
      (m) => ((m.round_number ?? m.round) ?? 1) === selectedRoundFilter,
    );
  }, [completedMatches, selectedRoundFilter]);

  // Accurate tournament progress metrics
  const plannedRounds = state?.planned_rounds ?? 5;
  const currentRound = state?.current_round ?? 1;

  const playedCount = state?.tournament_games_completed ?? (state?.games_completed ?? completedMatches.length);
  const totalCount = state?.expected_total_games ?? (state?.total_games ?? (playedCount + (state?.games_remaining ?? 0)));
  const remainingCount = Math.max(0, totalCount - playedCount);
  const percentDone = totalCount > 0 ? Math.min(100, Math.round((playedCount / totalCount) * 100)) : 0;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Champion Banner if Tournament is Truly Completed */}
      {isCompleted && state?.champion_player_name && (
        <View style={styles.championBanner}>
          <View style={styles.trophyIconWrap}>
            <Trophy size={28} color="#D97706" />
          </View>
          <View style={{ flex: 1 }}>
            <AppText style={styles.championPreTitle}>TOURNAMENT CHAMPION</AppText>
            <AppText style={styles.championName}>{state.champion_player_name}</AppText>
            <AppText style={styles.championSub}>
              Official tournament winner. Congratulations!
            </AppText>
          </View>
        </View>
      )}

      {/* Notice Card if Tournament is NOT Completed */}
      {!isCompleted && (
        <View style={styles.notCompletedCard}>
          <View style={styles.notCompletedIconCircle}>
            <Trophy size={32} color="#71817E" />
          </View>
          <AppText style={styles.notCompletedTitle}>Final Results Not Yet Available</AppText>
          <AppText style={styles.notCompletedText}>
            The tournament is currently in progress. Final individual rankings, champion crowning, and official podium positions will be available after all games are completed and the tournament is ended.
          </AppText>
          {onNavigateTab && (
            <TouchableOpacity
              style={styles.viewStandingsBtn}
              onPress={() => onNavigateTab('standings')}
              activeOpacity={0.8}
            >
              <AppText style={styles.viewStandingsBtnText}>View Current Live Standings</AppText>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── 1. Top 3-Column Summary Card ── */}
      <View style={styles.summaryCard}>
        {/* Played Games */}
        <View style={styles.summaryCol}>
          <AppText style={styles.summaryColHeader}>PLAYED GAMES</AppText>
          <AppText style={styles.summaryColValue}>{playedCount}</AppText>
        </View>

        <View style={styles.colDivider} />

        {/* Remaining */}
        <View style={styles.summaryCol}>
          <AppText style={styles.summaryColHeader}>REMAINING</AppText>
          <AppText style={styles.summaryColValue}>{remainingCount}</AppText>
        </View>

        <View style={styles.colDivider} />

        {/* Status */}
        <View style={styles.summaryCol}>
          <AppText style={styles.summaryColHeader}>STATUS</AppText>
          <View style={styles.statusPill}>
            <AppText style={styles.statusPillText}>
              {isCompleted ? 'CONCLUDED' : `${percentDone}% DONE`}
            </AppText>
          </View>
        </View>
      </View>

      {/* Coverage Summary Card */}
      {state?.coverage_summary && (
        <View style={styles.coverageCard}>
          <View style={styles.coverageHeaderRow}>
            <ShieldCheck size={18} color="#08785E" />
            <AppText style={styles.coverageTitle}>Partner Coverage & Rotation</AppText>
            <View
              style={[
                styles.coverageBadge,
                {
                  backgroundColor: state.coverage_summary.all_partners_covered
                    ? '#E5F4EC'
                    : '#FEF3C7',
                },
              ]}
            >
              <AppText
                style={[
                  styles.coverageBadgeText,
                  {
                    color: state.coverage_summary.all_partners_covered
                      ? '#08785E'
                      : '#B45309',
                  },
                ]}
              >
                {state.coverage_summary.quality_claim}
              </AppText>
            </View>
          </View>

          <View style={styles.coverageStatsRow}>
            <View style={styles.coverageStatItem}>
              <AppText style={styles.coverageStatVal}>
                {state.coverage_summary.avg_unique_partners} / {state.coverage_summary.total_possible_partners_per_player}
              </AppText>
              <AppText style={styles.coverageStatLbl}>Unique Partners / Player</AppText>
            </View>

            <View style={styles.coverageStatItem}>
              <AppText style={[styles.coverageStatVal, state.coverage_summary.total_repeat_partner_pairs > 0 && { color: '#B45309' }]}>
                {state.coverage_summary.total_repeat_partner_pairs}
              </AppText>
              <AppText style={styles.coverageStatLbl}>Repeat Partner Pairs</AppText>
            </View>

            <View style={styles.coverageStatItem}>
              <AppText style={styles.coverageStatVal}>
                {state.coverage_summary.avg_unique_opponents}
              </AppText>
              <AppText style={styles.coverageStatLbl}>Unique Opponents / Player</AppText>
            </View>
          </View>
        </View>
      )}

      {/* ── 2. Match History Header & Filter ── */}
      <View style={styles.historyHeaderRow}>
        <AppText style={styles.historyTitle}>
          Match History ({filteredCompletedMatches.length})
        </AppText>

        {/* Filter Dropdown Pill */}
        <TouchableOpacity
          style={styles.filterDropdownPill}
          onPress={() => {
            if (availableRounds.length > 0) {
              setIsFilterPickerOpen(true);
            }
          }}
          activeOpacity={availableRounds.length > 0 ? 0.7 : 1}
        >
          <AppText style={styles.filterDropdownText}>
            {selectedRoundFilter === 'all' ? 'All Rounds' : `Round ${selectedRoundFilter}`}
          </AppText>
          <ChevronDown size={16} color="#102E2A" style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      </View>

      {/* Round Filter Modal */}
      <Modal
        visible={isFilterPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsFilterPickerOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsFilterPickerOpen(false)}
        >
          <View style={styles.modalCard}>
            <AppText style={styles.modalTitle}>Filter by Round</AppText>
            <TouchableOpacity
              style={[
                styles.modalOption,
                selectedRoundFilter === 'all' && styles.modalOptionSelected,
              ]}
              onPress={() => {
                setSelectedRoundFilter('all');
                setIsFilterPickerOpen(false);
              }}
            >
              <AppText
                style={[
                  styles.modalOptionText,
                  selectedRoundFilter === 'all' && styles.modalOptionTextSelected,
                ]}
              >
                All Rounds
              </AppText>
            </TouchableOpacity>

            {availableRounds.map((r) => (
              <TouchableOpacity
                key={r}
                style={[
                  styles.modalOption,
                  selectedRoundFilter === r && styles.modalOptionSelected,
                ]}
                onPress={() => {
                  setSelectedRoundFilter(r);
                  setIsFilterPickerOpen(false);
                }}
              >
                <AppText
                  style={[
                    styles.modalOptionText,
                    selectedRoundFilter === r && styles.modalOptionTextSelected,
                  ]}
                >
                  Round {r}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── 3. Match History Content or Empty State ── */}
      {filteredCompletedMatches.length === 0 ? (
        // Empty State matching Screen 5
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <CheckCircle2 size={32} color="#71817E" />
          </View>

          <AppText style={styles.emptyTitle}>No completed games yet</AppText>
          <AppText style={styles.emptyDescription}>
            Recorded match results will appear here chronologically once played.
          </AppText>
        </View>
      ) : (
        // Populated Completed Match Cards
        <View style={styles.resultsList}>
          {filteredCompletedMatches.map((match) => {
            const scoreA = match.score_a ?? 0;
            const scoreB = match.score_b ?? 0;
            const roundNum = match.round_number ?? match.round ?? 1;
            const courtNum = match.match_number ?? 1;
            const sideANames = formatPartnerNames(match.side_a_participants);
            const sideBNames = formatPartnerNames(match.side_b_participants);
            const teamAWon = scoreA > scoreB;
            const teamBWon = scoreB > scoreA;

            return (
              <View key={match.id} style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <AppText style={styles.resultHeaderMeta}>
                    Round {roundNum} • Court {courtNum}
                  </AppText>
                  <View style={styles.finalBadge}>
                    <CheckCircle2 size={12} color="#08785E" />
                    <AppText style={styles.finalBadgeText}>FINAL</AppText>
                  </View>
                </View>

                {/* Team Rows */}
                <View style={styles.teamScoresContainer}>
                  {/* Side A */}
                  <View style={[styles.teamRow, teamAWon && styles.winningTeamRow]}>
                    <View style={styles.teamNameWrapper}>
                      {teamAWon && <Trophy size={14} color="#08785E" style={{ marginRight: 6 }} />}
                      <AppText
                        style={[styles.teamNameText, teamAWon && styles.winningTeamNameText]}
                      >
                        {sideANames}
                      </AppText>
                    </View>
                    <AppText style={[styles.teamScoreText, teamAWon && styles.winningScoreText]}>
                      {scoreA}
                    </AppText>
                  </View>

                  <View style={styles.scoreRowDivider} />

                  {/* Side B */}
                  <View style={[styles.teamRow, teamBWon && styles.winningTeamRow]}>
                    <View style={styles.teamNameWrapper}>
                      {teamBWon && <Trophy size={14} color="#08785E" style={{ marginRight: 6 }} />}
                      <AppText
                        style={[styles.teamNameText, teamBWon && styles.winningTeamNameText]}
                      >
                        {sideBNames}
                      </AppText>
                    </View>
                    <AppText style={[styles.teamScoreText, teamBWon && styles.winningScoreText]}>
                      {scoreB}
                    </AppText>
                  </View>
                </View>

                {/* Edit Score Trigger for staff */}
                {canManage && !isCompleted && onOpenScoreModal && (
                  <TouchableOpacity
                    style={styles.editScoreLink}
                    onPress={() => onOpenScoreModal(match)}
                    activeOpacity={0.7}
                  >
                    <AppText style={styles.editScoreLinkText}>Edit Score</AppText>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* ── 4. Bottom Information Panel ── */}
      <View style={styles.infoPanel}>
        <Info size={20} color="#08785E" />
        <AppText style={styles.infoPanelText}>
          Results are updated in real time after scores are entered in the Rounds tab.
        </AppText>
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
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg ?? 16,
    borderWidth: 1,
    borderColor: '#DCE8E3',
    paddingVertical: Spacing[4],
    paddingHorizontal: Spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#E5EDE9',
  },
  summaryColHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: '#71817E',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  summaryColValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#102E2A',
  },
  statusPill: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284C7',
    letterSpacing: 0.5,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing[1],
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#102E2A',
  },
  filterDropdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DCE8E3',
    paddingHorizontal: Spacing[3] + 2,
    paddingVertical: 7,
  },
  filterDropdownText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102E2A',
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
  },
  infoPanel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F3FAF5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCE8E3',
    padding: Spacing[3],
    gap: Spacing[2],
  },
  infoPanelText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#334155',
    flex: 1,
  },
  resultsList: {
    gap: Spacing[3],
  },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg ?? 16,
    borderWidth: 1,
    borderColor: '#DCE8E3',
    padding: Spacing[4],
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[2],
  },
  resultHeaderMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: '#71817E',
  },
  finalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E5F4EC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  finalBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#08785E',
  },
  teamScoresContainer: {
    backgroundColor: '#F8FAF9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5EDE9',
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  winningTeamRow: {},
  teamNameWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  teamNameText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#102E2A',
  },
  winningTeamNameText: {
    color: '#08785E',
    fontWeight: '800',
  },
  teamScoreText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#71817E',
    marginLeft: Spacing[2],
  },
  winningScoreText: {
    color: '#08785E',
    fontWeight: '800',
  },
  scoreRowDivider: {
    height: 1,
    backgroundColor: '#E5EDE9',
    marginVertical: 2,
  },
  editScoreLink: {
    alignSelf: 'flex-end',
    marginTop: Spacing[2],
  },
  editScoreLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#08785E',
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
  championBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: Radius.lg ?? 16,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    padding: Spacing[4],
    gap: Spacing[3],
    marginBottom: Spacing[3],
  },
  trophyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  championPreTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: 1,
    marginBottom: 2,
  },
  championName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#102E2A',
  },
  championSub: {
    fontSize: 12,
    color: '#71817E',
    marginTop: 2,
  },
  notCompletedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg ?? 16,
    borderWidth: 1,
    borderColor: '#DCE8E3',
    padding: Spacing[5],
    alignItems: 'center',
    marginBottom: Spacing[3],
  },
  notCompletedIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F3FAF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[3],
  },
  notCompletedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102E2A',
    marginBottom: Spacing[2],
    textAlign: 'center',
  },
  notCompletedText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#71817E',
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: Spacing[3],
  },
  viewStandingsBtn: {
    backgroundColor: '#08785E',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  viewStandingsBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  coverageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg ?? 16,
    borderWidth: 1,
    borderColor: '#DCE8E3',
    padding: Spacing[4],
    marginBottom: Spacing[3],
    gap: Spacing[2],
  },
  coverageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  coverageTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102E2A',
    flex: 1,
  },
  coverageBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  coverageBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  coverageStatsRow: {
    flexDirection: 'row',
    gap: Spacing[2],
    marginTop: 4,
  },
  coverageStatItem: {
    flex: 1,
    backgroundColor: '#F8FAF9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5EDE9',
    padding: Spacing[2],
    alignItems: 'center',
  },
  coverageStatVal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#102E2A',
  },
  coverageStatLbl: {
    fontSize: 10,
    color: '#71817E',
    marginTop: 2,
    textAlign: 'center',
  },
});
