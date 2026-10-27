/**
 * Aught2 Pickleball — ScrambleOverviewTab
 *
 * Standardized Tab 1 (Overview) for Scramble Tournament Mode:
 * Matches established tournament management layout and visual standards:
 * - Tournament Progress card:
 *   - "X of Y games completed" & percentage progress bar
 *   - 4-metric grid: PLAYERS, ROUNDS, COMPLETED, REMAINING
 *   - Info strip: "Rotating partner scramble: individual scoring with rotating partners and opponents"
 *   - Quick action: "View Round Schedule & Enter Scores →"
 * - Format & Structure card:
 *   - Competition Format, Participant Structure, Rotation Engine, Planned Rounds (with inline Adjuster)
 * - Official Scoring & Rules card:
 *   - Target Score, Win Margin, Scoring System, Tiebreaker Order
 * - Partner Coverage & Rotation Quality card (when coverage data is present)
 * - Official Champion Podium card (when tournament is completed)
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  BarChart2,
  Calendar,
  CheckCircle2,
  Clock,
  Edit2,
  Info,
  Layers,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Radius, Spacing } from '@/theme';
import type { Tournament } from '@/types';
import type { ScrambleState } from '@/types/scramble';

export interface ScrambleOverviewTabProps {
  state: ScrambleState | null;
  tournament?: Tournament | null;
  canManage: boolean;
  onNavigateTab: (tab: any) => void;
  onCloseRegistration?: () => Promise<void>;
  onStartRound?: () => Promise<void>;
  onFinishRound?: () => Promise<void>;
  onStartNextRound?: () => Promise<void>;
  onSetPlannedRounds?: (plannedRounds: number) => Promise<any>;
  onEndTournament?: () => void;
  isClosingRegistration?: boolean;
  isStartingRound?: boolean;
  isFinishingRound?: boolean;
  isStartingNextRound?: boolean;
  isSettingPlannedRounds?: boolean;
  isEndingTournament?: boolean;
}

export function ScrambleOverviewTab({
  state,
  tournament,
  canManage,
  onNavigateTab,
  onSetPlannedRounds,
  isSettingPlannedRounds = false,
}: ScrambleOverviewTabProps) {
  // Planned rounds inline editing state
  const [isEditingRounds, setIsEditingRounds] = useState(false);
  const [editingRoundsValue, setEditingRoundsValue] = useState<number>(state?.planned_rounds ?? 3);

  if (!state) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#0F766E" />
        <AppText style={styles.loadingText}>Loading Scramble Overview...</AppText>
      </View>
    );
  }

  const isCompleted = state.tournament_status === 'completed' || tournament?.status === 'completed';
  const isRegistrationOpen = tournament?.status === 'registration_open' || state.tournament_status === 'registration_open';
  const currentRound = state.current_round ?? 1;
  const plannedRounds = state.planned_rounds ?? 3;
  const registeredPlayersCount = state.registered_players_count ?? tournament?.participant_count ?? 0;

  // Games and progress calculations (truthful zero handling)
  const tournamentGamesCompleted = state.tournament_games_completed ?? (state.games_completed ?? 0);

  // If players < 4, no games can exist or be generated yet
  const hasMinPlayers = registeredPlayersCount >= 4;
  const expectedTotalGames = hasMinPlayers
    ? (state.expected_total_games ?? (state.total_games ?? 0))
    : 0;

  const remainingGames = expectedTotalGames > 0
    ? Math.max(0, expectedTotalGames - tournamentGamesCompleted)
    : 0;

  const progressPercent = expectedTotalGames > 0
    ? Math.min(100, Math.round((tournamentGamesCompleted / expectedTotalGames) * 100))
    : 0;

  // Scoring rules
  const scoringRules = (tournament?.scoring_rules as Record<string, any>) || {};
  const targetScore: number = typeof scoringRules.target_score === 'number' ? scoringRules.target_score : 11;
  const winBy: number = typeof scoringRules.win_by === 'number' ? scoringRules.win_by : 2;

  // Division / Category
  const formatConfig = (tournament?.format_configuration as Record<string, any>) || {};
  const category = tournament?.competition_category || formatConfig.category || 'Open Scramble';

  const handleSaveRounds = async () => {
    if (!onSetPlannedRounds) return;
    try {
      await onSetPlannedRounds(editingRoundsValue);
      setIsEditingRounds(false);
      Alert.alert('Rounds Confirmed', `Planned rotation rounds updated to ${editingRoundsValue}.`);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update planned rounds.');
    }
  };

  const getRoundStatusLabel = () => {
    if (isCompleted) return 'Completed';
    if (isRegistrationOpen) return 'Registration Open';
    switch (state.round_status) {
      case 'setup':
        return 'Setup & Availability';
      case 'matchups_created':
        return 'Matchups Ready';
      case 'in_progress':
        return 'In Progress';
      case 'completed':
        return 'Round Concluded';
      default:
        return 'Setup';
    }
  };

  return (
    <View style={styles.container}>
      {/* ─── Champion Banner (Only shown if Tournament is Officially Completed) ─── */}
      {isCompleted && state.champion_player_name && (
        <Card style={styles.championCard}>
          <View style={styles.championHeader}>
            <View style={styles.trophyIconWrap}>
              <Trophy size={26} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={styles.championPreTitle}>TOURNAMENT CHAMPION</AppText>
              <AppText style={styles.championName}>{state.champion_player_name}</AppText>
              <AppText style={styles.championSub}>
                All {plannedRounds} planned rounds completed! Official standings are finalized.
              </AppText>
            </View>
          </View>
        </Card>
      )}

      {/* ─── 1. Tournament Progress Card (Standardized layout matching Round Robin) ─── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <BarChart2 size={18} color="#0F766E" />
          <AppText style={styles.cardHeaderTitle}>Tournament Progress</AppText>
        </View>

        {/* Progress Bar & Summary */}
        <View style={styles.progressContainer}>
          <View style={styles.progressTopRow}>
            <AppText style={styles.progressSubText}>
              {expectedTotalGames > 0
                ? `${tournamentGamesCompleted} of ${expectedTotalGames} games completed`
                : '0 of 0 games completed'}
            </AppText>
            <AppText style={styles.percentText}>{progressPercent}%</AppText>
          </View>
          <View style={styles.progressBarBackground}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${progressPercent}%` },
              ]}
            />
          </View>
        </View>

        {/* 4-Stat Metric Tiles */}
        <View style={styles.statsGrid}>
          <View style={styles.statTile}>
            <AppText style={styles.statTileLabel}>PLAYERS</AppText>
            <Users size={15} color="#64748B" style={styles.statTileIcon} />
            <AppText style={styles.statTileNum}>{registeredPlayersCount}</AppText>
          </View>

          <View style={styles.statTile}>
            <AppText style={styles.statTileLabel}>ROUNDS</AppText>
            <Calendar size={15} color="#64748B" style={styles.statTileIcon} />
            <AppText style={styles.statTileNum}>{plannedRounds}</AppText>
          </View>

          <View style={styles.statTile}>
            <AppText style={styles.statTileLabel}>COMPLETED</AppText>
            <CheckCircle2 size={15} color="#0F766E" style={styles.statTileIcon} />
            <AppText style={styles.statTileNum}>{tournamentGamesCompleted}</AppText>
          </View>

          <View style={styles.statTile}>
            <AppText style={styles.statTileLabel}>REMAINING</AppText>
            <Clock size={15} color="#64748B" style={styles.statTileIcon} />
            <AppText style={styles.statTileNum}>{remainingGames}</AppText>
          </View>
        </View>

        {/* Informational Strip */}
        <View style={styles.infoStrip}>
          <Info size={14} color="#0284C7" />
          <AppText style={styles.infoStripText}>
            {registeredPlayersCount < 4
              ? 'Minimum 4 players required to form official Scramble courts.'
              : isRegistrationOpen
              ? `${registeredPlayersCount} players registered. Close registration to seed players and configure Round 1.`
              : 'Rotating doubles scramble: individual scoring with rotating partners and opponents across courts.'}
          </AppText>
        </View>

        {/* Quick Action Button */}
        <TouchableOpacity
          style={styles.viewMatchupsBtn}
          onPress={() => {
            if (isCompleted) {
              onNavigateTab('results');
            } else if (registeredPlayersCount < 4 || isRegistrationOpen) {
              onNavigateTab('participants');
            } else {
              onNavigateTab('rounds');
            }
          }}
          activeOpacity={0.8}
        >
          <AppText style={styles.viewMatchupsBtnText}>
            {isCompleted
              ? 'View Standings & Final Results →'
              : registeredPlayersCount < 4 || isRegistrationOpen
              ? 'Manage Players & Availability →'
              : 'View Round Schedule & Enter Scores →'}
          </AppText>
        </TouchableOpacity>
      </Card>

      {/* ─── 2. Format & Structure Card ─── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Layers size={18} color="#0F766E" />
          <AppText style={styles.cardHeaderTitle}>Format & Structure</AppText>
        </View>

        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Competition Format</AppText>
            <AppText style={styles.infoVal}>Scramble</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Participant Structure</AppText>
            <AppText style={styles.infoVal}>Individual Players (Rotating Doubles)</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Division & Category</AppText>
            <AppText style={styles.infoVal}>{category}</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Rotation Engine</AppText>
            <AppText style={styles.infoVal}>Authoritative Scramble Engine (4 & 5 Courts)</AppText>
          </View>

          <View style={styles.divider} />

          {/* Planned Rounds Row with clean inline adjuster */}
          <View style={styles.infoRowPlannedRounds}>
            <View style={{ flex: 1 }}>
              <View style={styles.plannedRoundsHeader}>
                <AppText style={styles.infoLabel}>Planned Rounds</AppText>
                {canManage && !isCompleted && tournamentGamesCompleted === 0 && !isEditingRounds && (
                  <TouchableOpacity
                    onPress={() => {
                      setEditingRoundsValue(plannedRounds);
                      setIsEditingRounds(true);
                    }}
                    style={styles.adjustLink}
                    hitSlop={8}
                  >
                    <Edit2 size={12} color="#0F766E" />
                    <AppText style={styles.adjustLinkText}>Adjust</AppText>
                  </TouchableOpacity>
                )}
              </View>
              {state.recommendation_reason && !isEditingRounds && (
                <AppText style={styles.recommendationHint}>
                  {state.recommendation_reason}
                </AppText>
              )}
            </View>

            {!isEditingRounds && (
              <AppText style={styles.infoVal}>{plannedRounds} Rounds</AppText>
            )}
          </View>

          {/* Inline rounds stepper when editing */}
          {isEditingRounds && (
            <View style={styles.editStepperBox}>
              <View style={styles.stepperControlRow}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setEditingRoundsValue((v) => Math.max(1, v - 1))}
                  disabled={editingRoundsValue <= 1}
                >
                  <Minus size={16} color="#1E293B" />
                </TouchableOpacity>

                <View style={styles.stepperValueContainer}>
                  <AppText style={styles.stepperValueText}>{editingRoundsValue} Rounds</AppText>
                </View>

                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setEditingRoundsValue((v) => Math.min(15, v + 1))}
                  disabled={editingRoundsValue >= 15}
                >
                  <Plus size={16} color="#1E293B" />
                </TouchableOpacity>
              </View>

              <View style={styles.stepperActionsRow}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setIsEditingRounds(false)}
                >
                  <AppText style={styles.cancelBtnText}>Cancel</AppText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={handleSaveRounds}
                  disabled={isSettingPlannedRounds}
                >
                  {isSettingPlannedRounds ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <AppText style={styles.confirmBtnText}>Save Rounds</AppText>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Current Phase</AppText>
            <View style={styles.phaseBadge}>
              <AppText style={styles.phaseBadgeText}>
                {isCompleted
                  ? 'Completed'
                  : `Round ${currentRound} of ${plannedRounds} • ${getRoundStatusLabel()}`}
              </AppText>
            </View>
          </View>
        </View>
      </Card>

      {/* ─── 3. Official Scoring & Rules Card ─── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <ShieldCheck size={18} color="#0F766E" />
          <AppText style={styles.cardHeaderTitle}>Official Scoring & Rules</AppText>
        </View>

        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Target Score</AppText>
            <AppText style={styles.infoVal}>First to {targetScore} Points</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Win Margin</AppText>
            <AppText style={styles.infoVal}>Win by {winBy} (no ties allowed)</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Scoring Format</AppText>
            <AppText style={styles.infoVal}>Individual cumulative points</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Standings Tiebreakers</AppText>
            <AppText style={styles.infoVal}>1. Wins → 2. Point Diff → 3. Points Scored</AppText>
          </View>
        </View>
      </Card>

      {/* ─── 4. Partner Coverage & Rotation Quality Card (When available) ─── */}
      {state.coverage_summary && (
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Sparkles size={18} color="#0F766E" />
            <AppText style={styles.cardHeaderTitle}>Partner Coverage & Rotation</AppText>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statTile}>
              <AppText style={styles.statTileLabel}>AVG PARTNERS</AppText>
              <AppText style={styles.statTileNum}>
                {state.coverage_summary.avg_unique_partners} / {state.coverage_summary.total_possible_partners_per_player}
              </AppText>
              <AppText style={styles.statTileSub}>per player</AppText>
            </View>

            <View style={styles.statTile}>
              <AppText style={styles.statTileLabel}>REPEAT PARTNERS</AppText>
              <AppText style={[styles.statTileNum, state.coverage_summary.total_repeat_partner_pairs > 0 && { color: '#B45309' }]}>
                {state.coverage_summary.total_repeat_partner_pairs}
              </AppText>
              <AppText style={styles.statTileSub}>repeat pairs</AppText>
            </View>

            <View style={styles.statTile}>
              <AppText style={styles.statTileLabel}>AVG OPPONENTS</AppText>
              <AppText style={styles.statTileNum}>{state.coverage_summary.avg_unique_opponents}</AppText>
              <AppText style={styles.statTileSub}>per player</AppText>
            </View>

            <View style={styles.statTile}>
              <AppText style={styles.statTileLabel}>REPEAT OPPONENTS</AppText>
              <AppText style={styles.statTileNum}>{state.coverage_summary.total_repeat_opponent_pairs}</AppText>
              <AppText style={styles.statTileSub}>repeat pairs</AppText>
            </View>
          </View>

          {state.coverage_summary.quality_claim && (
            <View style={styles.coverageNote}>
              <Info size={13} color="#0F766E" />
              <AppText style={styles.coverageNoteText}>
                {state.coverage_summary.quality_claim}
              </AppText>
            </View>
          )}
        </Card>
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
  loadingContainer: {
    padding: Spacing[6],
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
  },
  championCard: {
    backgroundColor: '#FEF9C3',
    borderColor: '#FDE047',
    borderWidth: 1,
    padding: Spacing[4],
  },
  championHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  trophyIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  championPreTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.8,
  },
  championName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#78350F',
    marginVertical: 1,
  },
  championSub: {
    fontSize: 12,
    color: '#92400E',
    lineHeight: 16,
  },
  card: {
    gap: Spacing[3],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  progressContainer: {
    gap: 6,
  },
  progressTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressSubText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  percentText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F766E',
    flexShrink: 0,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#0F766E',
    borderRadius: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statTile: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 120,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  statTileLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  statTileIcon: {
    marginVertical: 2,
  },
  statTileNum: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  statTileSub: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '500',
  },
  infoStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  infoStripText: {
    fontSize: 12,
    color: '#0369A1',
    flex: 1,
    lineHeight: 16,
    fontWeight: '500',
  },
  viewMatchupsBtn: {
    backgroundColor: '#0F766E',
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  viewMatchupsBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  infoList: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 12,
  },
  infoRowPlannedRounds: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 4,
    gap: 12,
  },
  plannedRoundsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adjustLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E6F4F1',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  adjustLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
  },
  recommendationHint: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 14,
  },
  infoLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
    flexShrink: 0,
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
    flexShrink: 1,
    textAlign: 'right',
    lineHeight: 18,
  },
  phaseBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  phaseBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  editStepperBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: Spacing[3],
    gap: Spacing[2],
    marginVertical: 4,
  },
  stepperControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[3],
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValueContainer: {
    minWidth: 100,
    alignItems: 'center',
  },
  stepperValueText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  stepperActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing[2],
    marginTop: 2,
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  confirmBtn: {
    backgroundColor: '#0F766E',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  confirmBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  coverageNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  coverageNoteText: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
});
