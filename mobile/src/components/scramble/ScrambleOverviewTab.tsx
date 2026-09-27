/**
 * Aught2 Pickleball — ScrambleOverviewTab
 *
 * Tab 1 for Scramble Tournament Workspace:
 * - Event & Round Progress card with overall tournament progress bar and 2-row metric grid:
 *   Row 1: REGISTERED (Total players), AVAILABLE (This round), COURTS (Active courts), PLANNED (Rounds)
 *   Row 2: THIS ROUND DONE, EVENT DONE
 * - Planned Rotation Plan card (with smart recommendation logic & confirmation)
 * - Round {N} of {Total} Lifecycle Action card with clear round completion vs final tournament completion
 * - Full-Field Rotation & Partner Coverage card with honest, verified metrics
 * - Scramble Rules & Rotation card
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowRight,
  Award,
  BarChart2,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Edit2,
  FileText,
  Flag,
  Info,
  LayoutGrid,
  Minus,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Radius, Spacing } from '@/theme';
import type { Tournament } from '@/types';
import type { ScrambleState, ScrambleSubTab } from '@/types/scramble';

interface ScrambleOverviewTabProps {
  state: ScrambleState | null;
  tournament?: Tournament | null;
  canManage: boolean;
  onNavigateTab: (tab: ScrambleSubTab) => void;
  onCloseRegistration?: () => Promise<void>;
  onStartRound: () => Promise<void>;
  onFinishRound: () => Promise<void>;
  onStartNextRound: () => Promise<void>;
  onSetPlannedRounds?: (plannedRounds: number) => Promise<any>;
  onEndTournament: () => void;
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
  onCloseRegistration,
  onStartRound,
  onFinishRound,
  onStartNextRound,
  onSetPlannedRounds,
  onEndTournament,
  isClosingRegistration = false,
  isStartingRound = false,
  isFinishingRound = false,
  isStartingNextRound = false,
  isSettingPlannedRounds = false,
  isEndingTournament = false,
}: ScrambleOverviewTabProps) {
  // Configuration editing state
  const [isEditingRounds, setIsEditingRounds] = useState(false);
  const [editingRoundsValue, setEditingRoundsValue] = useState<number>(state?.planned_rounds ?? 5);

  if (!state) {
    return (
      <View style={styles.loadingContainer}>
        <AppText style={styles.loadingText}>Loading Scramble Overview...</AppText>
      </View>
    );
  }

  const isCompleted = state.tournament_status === 'completed';
  const isRegistrationOpen = tournament?.status === 'registration_open' || state.tournament_status === 'registration_open';
  const currentRound = state.current_round ?? 1;
  const plannedRounds = state.planned_rounds ?? 5;
  const isFinalRound = state.is_final_round ?? (currentRound >= plannedRounds);
  const roundCompleted = state.round_status === 'completed';

  // Finite round progress metrics
  const roundGamesCompleted = state.round_games_completed ?? (state.games_completed ?? 0);
  const roundGamesRemaining = state.round_games_remaining ?? (state.games_remaining ?? 0);
  const roundGamesTotal = state.round_games_total ?? (roundGamesCompleted + roundGamesRemaining);

  const tournamentGamesCompleted = state.tournament_games_completed ?? (state.games_completed ?? 0);
  const expectedTotalGames = state.expected_total_games ?? (plannedRounds * roundGamesTotal || (state.total_games ?? 0));
  const tournamentPercent = expectedTotalGames > 0 ? Math.min(100, Math.round((tournamentGamesCompleted / expectedTotalGames) * 100)) : 0;

  // Tournament configuration metadata
  const targetScore = tournament?.scoring_rules?.target_score ?? 11;
  const winBy = tournament?.scoring_rules?.win_by ?? 2;
  const category = (tournament?.format_configuration as any)?.category || (tournament as any)?.category || 'Doubles';
  const maxCapacity = tournament?.max_participants ?? 16;
  const fee = (tournament as any)?.entry_fee ?? (tournament as any)?.cost ?? 0;

  const formatDate = (dStr?: string | null) => {
    if (!dStr) return null;
    try {
      return new Date(dStr).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dStr;
    }
  };

  const startDateFormatted = formatDate(tournament?.start_date);
  const deadlineFormatted = formatDate((tournament as any)?.registration_deadline ?? tournament?.registration_close_at);

  const getRoundStatusBadge = () => {
    if (isCompleted) {
      return { label: 'COMPLETED', bg: '#E5F4EC', text: '#08785E' };
    }
    if (isRegistrationOpen) {
      return { label: 'OPEN', bg: '#DCFCE7', text: '#15803D' };
    }
    switch (state.round_status) {
      case 'setup':
        return { label: 'SETUP', bg: '#FEF3C7', text: '#D97706' };
      case 'matchups_created':
        return { label: 'READY', bg: '#E0F2FE', text: '#0284C7' };
      case 'in_progress':
        return { label: 'IN PROGRESS', bg: '#DCFCE7', text: '#15803D' };
      case 'completed':
        return { label: isFinalRound ? 'FINAL ROUND COMPLETED' : 'ROUND COMPLETED', bg: '#E5F4EC', text: '#08785E' };
      default:
        return { label: 'SETUP', bg: '#FEF3C7', text: '#D97706' };
    }
  };

  const statusBadge = getRoundStatusBadge();

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

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Champion Banner ONLY if Tournament is Truly Completed */}
      {isCompleted && state.champion_player_name && (
        <View style={styles.championBanner}>
          <View style={styles.championIconWrap}>
            <Trophy size={28} color="#D97706" />
          </View>
          <View style={{ flex: 1 }}>
            <AppText style={styles.championPreTitle}>TOURNAMENT CHAMPION</AppText>
            <AppText style={styles.championName}>{state.champion_player_name}</AppText>
            <AppText style={styles.championSub}>
              All planned rounds have concluded! Official tournament winner crowned.
            </AppText>
          </View>
        </View>
      )}

      {/* ── CARD 1: Event & Round Progress ── */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.headerTitleWithIcon}>
            <BarChart2 size={20} color="#08785E" />
            <AppText style={styles.cardTitle}>Event & Round Progress</AppText>
          </View>
          <View style={styles.roundProgressBadge}>
            <AppText style={styles.roundProgressBadgeText}>
              Round {currentRound} of {plannedRounds}
            </AppText>
          </View>
        </View>

        {/* Overall Tournament Progress Bar */}
        <View style={styles.progressSubRow}>
          <AppText style={styles.progressGamesText}>
            Overall Tournament: {tournamentGamesCompleted} of {expectedTotalGames} total games
          </AppText>
          <AppText style={styles.progressPercentText}>{tournamentPercent}% Done</AppText>
        </View>

        <View style={styles.progressBarTrack}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${Math.min(100, Math.max(tournamentPercent, 0))}%` },
            ]}
          />
        </View>

        {/* Current Round Callout */}
        <View style={styles.roundCallout}>
          <Clock size={16} color="#08785E" />
          <AppText style={styles.roundCalloutText}>
            <AppText style={{ fontWeight: '700', color: '#102E2A' }}>Round {currentRound}: </AppText>
            {roundGamesCompleted} of {roundGamesTotal} games completed
            {roundGamesRemaining > 0 ? ` (${roundGamesRemaining} remaining)` : ' (All round games done)'}
          </AppText>
        </View>

        {/* 2-Row Metric Grid */}
        <View style={styles.metricsContainer}>
          {/* Row 1: Registered, Available, Courts, Planned Rounds */}
          <View style={styles.metricRow}>
            {/* Registered */}
            <View style={styles.metricCard}>
              <AppText style={styles.metricHeader}>REGISTERED</AppText>
              <View style={styles.metricIconWrap}>
                <Users size={15} color="#08785E" />
              </View>
              <AppText style={styles.metricValue}>{state.registered_players_count}</AppText>
              <AppText style={styles.metricCaption}>Total players</AppText>
            </View>

            {/* Available */}
            <View style={styles.metricCard}>
              <AppText style={styles.metricHeader}>AVAILABLE</AppText>
              <View style={styles.metricIconWrap}>
                <UserCheck size={15} color="#08785E" />
              </View>
              <AppText style={styles.metricValue}>{state.available_players_count}</AppText>
              <AppText style={styles.metricCaption}>This round</AppText>
            </View>

            {/* Courts */}
            <View style={styles.metricCard}>
              <AppText style={styles.metricHeader}>COURTS</AppText>
              <View style={styles.metricIconWrap}>
                <LayoutGrid size={15} color="#08785E" />
              </View>
              <AppText style={styles.metricValue}>{state.courts_count}</AppText>
              <AppText style={styles.metricCaption}>Active courts</AppText>
            </View>

            {/* Planned Rounds */}
            <View style={styles.metricCard}>
              <AppText style={styles.metricHeader}>PLANNED</AppText>
              <View style={styles.metricIconWrap}>
                <Award size={15} color="#08785E" />
              </View>
              <AppText style={styles.metricValue}>{plannedRounds}</AppText>
              <AppText style={styles.metricCaption}>Total rounds</AppText>
            </View>
          </View>

          {/* Row 2: Round Done, Event Done */}
          <View style={styles.metricRow}>
            <View style={[styles.metricCard, { flex: 1 }]}>
              <AppText style={styles.metricHeader}>THIS ROUND GAMES</AppText>
              <View style={styles.metricIconWrap}>
                <CheckCircle2 size={15} color="#08785E" />
              </View>
              <AppText style={styles.metricValue}>
                {roundGamesCompleted} / {roundGamesTotal}
              </AppText>
              <AppText style={styles.metricCaption}>Round {currentRound} progress</AppText>
            </View>

            <View style={[styles.metricCard, { flex: 1 }]}>
              <AppText style={styles.metricHeader}>TOURNAMENT GAMES</AppText>
              <View style={styles.metricIconWrap}>
                <Trophy size={15} color="#08785E" />
              </View>
              <AppText style={styles.metricValue}>
                {tournamentGamesCompleted} / {expectedTotalGames}
              </AppText>
              <AppText style={styles.metricCaption}>Across all {plannedRounds} rounds</AppText>
            </View>
          </View>
        </View>
      </View>

      {/* ── CARD 2: Planned Rotation Rounds & Recommendation Card ── */}
      {canManage && (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.headerTitleWithIcon}>
              <Sparkles size={18} color="#D97706" />
              <AppText style={styles.cardTitle}>Event Plan & Rotation Rounds</AppText>
            </View>
            {!isEditingRounds && !isCompleted && tournamentGamesCompleted === 0 && (
              <TouchableOpacity
                onPress={() => {
                  setEditingRoundsValue(plannedRounds);
                  setIsEditingRounds(true);
                }}
                style={styles.editRoundsBtn}
              >
                <Edit2 size={13} color="#08785E" />
                <AppText style={styles.editRoundsBtnText}>Adjust</AppText>
              </TouchableOpacity>
            )}
          </View>

          {isEditingRounds ? (
            <View style={styles.editRoundsBox}>
              <AppText style={styles.editRoundsTitle}>Set Authoritative Planned Rounds</AppText>
              <AppText style={styles.editRoundsDesc}>
                The tournament will strictly end after this number of rounds.
              </AppText>

              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setEditingRoundsValue((v) => Math.max(1, v - 1))}
                  disabled={editingRoundsValue <= 1}
                >
                  <Minus size={16} color="#102E2A" />
                </TouchableOpacity>

                <View style={styles.stepperValueBox}>
                  <AppText style={styles.stepperValueText}>{editingRoundsValue} Rounds</AppText>
                </View>

                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setEditingRoundsValue((v) => Math.min(15, v + 1))}
                  disabled={editingRoundsValue >= 15}
                >
                  <Plus size={16} color="#102E2A" />
                </TouchableOpacity>
              </View>

              <View style={styles.editRoundsActionRow}>
                <TouchableOpacity
                  style={styles.cancelEditBtn}
                  onPress={() => setIsEditingRounds(false)}
                >
                  <AppText style={styles.cancelEditBtnText}>Cancel</AppText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.confirmEditBtn}
                  onPress={handleSaveRounds}
                  disabled={isSettingPlannedRounds}
                >
                  {isSettingPlannedRounds ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <AppText style={styles.confirmEditBtnText}>Confirm Rounds</AppText>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.planDetailsBox}>
              <View style={styles.planSummaryRow}>
                <View style={styles.planChip}>
                  <AppText style={styles.planChipLabel}>CONFIGURED</AppText>
                  <AppText style={styles.planChipValue}>{plannedRounds} Rounds</AppText>
                </View>
                {state.recommended_rounds != null && (
                  <View style={[styles.planChip, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                    <AppText style={[styles.planChipLabel, { color: '#B45309' }]}>RECOMMENDED</AppText>
                    <AppText style={[styles.planChipValue, { color: '#92400E' }]}>
                      {state.recommended_rounds} Rounds
                    </AppText>
                  </View>
                )}
              </View>

              {state.recommendation_reason && (
                <View style={styles.recommendationNote}>
                  <Info size={14} color="#71817E" />
                  <AppText style={styles.recommendationNoteText}>
                    {state.recommendation_reason}
                  </AppText>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* ── CARD 3: Current Lifecycle Action Card ── */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.headerTitleWithIcon}>
            <Award size={20} color="#08785E" />
            <AppText style={styles.cardTitle}>
              {isCompleted
                ? 'Tournament Concluded'
                : isRegistrationOpen
                ? 'Registration Open'
                : roundCompleted && isFinalRound
                ? 'All Planned Rounds Completed'
                : roundCompleted
                ? `Round ${currentRound} Completed`
                : `Round ${currentRound} of ${plannedRounds}`}
            </AppText>
          </View>
          <View style={[styles.badge, { backgroundColor: statusBadge.bg }]}>
            <AppText style={[styles.badgeText, { color: statusBadge.text }]}>
              {statusBadge.label}
            </AppText>
          </View>
        </View>

        <AppText style={styles.roundCardDescription}>
          {isCompleted
            ? 'All configured rounds have concluded. You can review official final standings, champion podium, and full match records.'
            : isRegistrationOpen
            ? `${state.registered_players_count} of ${maxCapacity} players registered. Close registration to seed players by skill rating and prepare Round 1.`
            : roundCompleted && isFinalRound
            ? `All ${plannedRounds} planned rounds have finished! Official match records and individual standings are confirmed. End the tournament to publish results to the players.`
            : roundCompleted
            ? `All games in Round ${currentRound} are completed. Player availability will carry forward automatically to Round ${currentRound + 1} of ${plannedRounds}.`
            : state.round_status === 'setup'
            ? `Confirm player availability for Round ${currentRound} of ${plannedRounds} before generating rotating matchups.`
            : state.round_status === 'matchups_created'
            ? `Matchups for Round ${currentRound} of ${plannedRounds} are ready across ${state.courts_count} court${state.courts_count === 1 ? '' : 's'}. Review the schedule or start the round.`
            : state.round_status === 'in_progress'
            ? `Round ${currentRound} of ${plannedRounds} is currently active. Record match scores as courts finish.`
            : `All games in Round ${currentRound} are completed.`}
        </AppText>

        {/* Dynamic Action Buttons */}
        {canManage && (
          <View style={styles.actionButtonContainer}>
            {isRegistrationOpen && onCloseRegistration && (
              <TouchableOpacity
                style={styles.primaryActionButton}
                onPress={onCloseRegistration}
                disabled={isClosingRegistration}
                activeOpacity={0.8}
              >
                {isClosingRegistration ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <ShieldCheck size={18} color="#FFFFFF" />
                    <AppText style={styles.primaryActionText}>
                      Close Registration & Begin Setup
                    </AppText>
                    <ArrowRight size={16} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>
            )}

            {!isRegistrationOpen && state.round_status === 'setup' && (
              <TouchableOpacity
                style={styles.primaryActionButton}
                onPress={() => onNavigateTab('players')}
                activeOpacity={0.8}
              >
                <Users size={18} color="#FFFFFF" />
                <AppText style={styles.primaryActionText}>
                  Review Round {currentRound} Availability
                </AppText>
                <ArrowRight size={16} color="#FFFFFF" />
              </TouchableOpacity>
            )}

            {!isRegistrationOpen && state.round_status === 'matchups_created' && (
              <TouchableOpacity
                style={styles.primaryActionButton}
                onPress={onStartRound}
                disabled={isStartingRound}
                activeOpacity={0.8}
              >
                <Play size={18} color="#FFFFFF" />
                <AppText style={styles.primaryActionText}>
                  {isStartingRound ? 'Starting...' : `Start Round ${currentRound} of ${plannedRounds}`}
                </AppText>
                <ArrowRight size={16} color="#FFFFFF" />
              </TouchableOpacity>
            )}

            {!isRegistrationOpen && state.round_status === 'in_progress' && (
              <View style={{ gap: Spacing[2], width: '100%' }}>
                <TouchableOpacity
                  style={styles.primaryActionButton}
                  onPress={() => onNavigateTab('rounds')}
                  activeOpacity={0.8}
                >
                  <Clock size={18} color="#FFFFFF" />
                  <AppText style={styles.primaryActionText}>
                    View Courts & Record Scores
                  </AppText>
                  <ArrowRight size={16} color="#FFFFFF" />
                </TouchableOpacity>

                {state.valid_actions.includes('finish_round') && (
                  <TouchableOpacity
                    style={[styles.primaryActionButton, { backgroundColor: '#15803D' }]}
                    onPress={onFinishRound}
                    disabled={isFinishingRound}
                    activeOpacity={0.8}
                  >
                    <CheckCircle2 size={18} color="#FFFFFF" />
                    <AppText style={styles.primaryActionText}>
                      {isFinishingRound ? 'Finishing...' : `Finish Round ${currentRound} of ${plannedRounds}`}
                    </AppText>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Round Completed States: Non-Final vs Final Round */}
            {!isRegistrationOpen && roundCompleted && !isCompleted && (
              <View style={{ gap: Spacing[2], width: '100%' }}>
                {!isFinalRound ? (
                  <>
                    <TouchableOpacity
                      style={styles.primaryActionButton}
                      onPress={onStartNextRound}
                      disabled={isStartingNextRound}
                      activeOpacity={0.8}
                    >
                      <RotateCcw size={18} color="#FFFFFF" />
                      <AppText style={styles.primaryActionText}>
                        {isStartingNextRound
                          ? 'Preparing...'
                          : `Prepare Round ${currentRound + 1} of ${plannedRounds}`}
                      </AppText>
                      <ArrowRight size={16} color="#FFFFFF" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.secondaryActionButton}
                      onPress={() => onNavigateTab('players')}
                      activeOpacity={0.8}
                    >
                      <Users size={16} color="#08785E" />
                      <AppText style={styles.secondaryActionText}>
                        Edit Availability for Round {currentRound + 1}
                      </AppText>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    {/* Final Round Completed -> Direct to End Tournament */}
                    <TouchableOpacity
                      style={[styles.primaryActionButton, { backgroundColor: '#B45309' }]}
                      onPress={onEndTournament}
                      disabled={isEndingTournament}
                      activeOpacity={0.8}
                    >
                      <Trophy size={18} color="#FFFFFF" />
                      <AppText style={styles.primaryActionText}>
                        {isEndingTournament ? 'Ending...' : 'End Tournament & Publish Results'}
                      </AppText>
                      <ArrowRight size={16} color="#FFFFFF" />
                    </TouchableOpacity>

                    <View style={styles.finalRoundNote}>
                      <Info size={14} color="#71817E" />
                      <AppText style={styles.finalRoundNoteText}>
                        All {plannedRounds} configured rounds completed. No further rounds can be generated.
                      </AppText>
                    </View>
                  </>
                )}

                {!isFinalRound && (
                  <TouchableOpacity
                    style={styles.endTournamentButton}
                    onPress={onEndTournament}
                    disabled={isEndingTournament}
                    activeOpacity={0.8}
                  >
                    <Flag size={15} color="#DC2626" />
                    <AppText style={styles.endTournamentText}>
                      End Tournament Early
                    </AppText>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {isCompleted && (
              <TouchableOpacity
                style={styles.primaryActionButton}
                onPress={() => onNavigateTab('results')}
                activeOpacity={0.8}
              >
                <Trophy size={18} color="#FFFFFF" />
                <AppText style={styles.primaryActionText}>View Final Results & Podium</AppText>
                <ArrowRight size={16} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* ── CARD 4: Full-Field Rotation & Partner Coverage Card ── */}
      {state.coverage_summary && (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.headerTitleWithIcon}>
              <ShieldCheck size={18} color="#08785E" />
              <AppText style={styles.cardTitle}>Full-Field Partner Coverage</AppText>
            </View>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: state.coverage_summary.all_partners_covered
                    ? '#E5F4EC'
                    : '#FEF3C7',
                },
              ]}
            >
              <AppText
                style={[
                  styles.badgeText,
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

          <View style={styles.coverageGrid}>
            <View style={styles.coverageMetric}>
              <AppText style={styles.coverageValue}>
                {state.coverage_summary.avg_unique_partners} / {state.coverage_summary.total_possible_partners_per_player}
              </AppText>
              <AppText style={styles.coverageLabel}>Avg Partners / Player</AppText>
            </View>

            <View style={styles.coverageMetric}>
              <AppText style={[styles.coverageValue, state.coverage_summary.total_repeat_partner_pairs > 0 && { color: '#B45309' }]}>
                {state.coverage_summary.total_repeat_partner_pairs}
              </AppText>
              <AppText style={styles.coverageLabel}>Repeat Partner Pairs</AppText>
            </View>

            <View style={styles.coverageMetric}>
              <AppText style={styles.coverageValue}>
                {state.coverage_summary.avg_unique_opponents}
              </AppText>
              <AppText style={styles.coverageLabel}>Avg Opponents / Player</AppText>
            </View>

            <View style={styles.coverageMetric}>
              <AppText style={styles.coverageValue}>
                {state.coverage_summary.total_repeat_opponent_pairs}
              </AppText>
              <AppText style={styles.coverageLabel}>Repeat Opponent Pairs</AppText>
            </View>
          </View>
        </View>
      )}

      {/* ── CARD 5: Configured Tournament Rules & Scramble Rotation ── */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.headerTitleWithIcon}>
            <FileText size={20} color="#08785E" />
            <AppText style={styles.cardTitle}>Configured Rules & Rotation</AppText>
          </View>
        </View>

        <View style={styles.rulesList}>
          {startDateFormatted && (
            <View style={styles.ruleItem}>
              <View style={styles.ruleDot} />
              <AppText style={styles.ruleText}>
                <AppText style={styles.ruleBold}>Date:</AppText> {startDateFormatted}
              </AppText>
            </View>
          )}

          <View style={styles.ruleItem}>
            <View style={styles.ruleDot} />
            <AppText style={styles.ruleText}>
              <AppText style={styles.ruleBold}>Format & Category:</AppText> Scramble ({category})
            </AppText>
          </View>

          <View style={styles.ruleItem}>
            <View style={styles.ruleDot} />
            <AppText style={styles.ruleText}>
              <AppText style={styles.ruleBold}>Capacity:</AppText> {maxCapacity} players maximum ({state.registered_players_count} registered)
            </AppText>
          </View>

          <View style={styles.ruleItem}>
            <View style={styles.ruleDot} />
            <AppText style={styles.ruleText}>
              <AppText style={styles.ruleBold}>Planned Rounds:</AppText> {plannedRounds} confirmed rounds
            </AppText>
          </View>

          {deadlineFormatted && (
            <View style={styles.ruleItem}>
              <View style={styles.ruleDot} />
              <AppText style={styles.ruleText}>
                <AppText style={styles.ruleBold}>Registration Deadline:</AppText> {deadlineFormatted}
              </AppText>
            </View>
          )}

          <View style={styles.ruleItem}>
            <View style={styles.ruleDot} />
            <AppText style={styles.ruleText}>
              <AppText style={styles.ruleBold}>Entry Fee:</AppText> {fee > 0 ? `$${fee}` : 'Free'}
            </AppText>
          </View>

          <View style={styles.ruleItem}>
            <View style={styles.ruleDot} />
            <AppText style={styles.ruleText}>
              <AppText style={styles.ruleBold}>Scoring Rules:</AppText> First to {targetScore}, win by {winBy} (no ties)
            </AppText>
          </View>

          <View style={styles.ruleItem}>
            <View style={styles.ruleDot} />
            <AppText style={styles.ruleText}>
              <AppText style={styles.ruleBold}>Scramble Rotation:</AppText> {category === 'Mixed Scramble'
                ? 'Balanced 4-player courts (2 men, 2 women) with 2 games per court block. 100% mixed-gender teams.'
                : 'Rotating partners every game. 4-player court plays 3 games (0 sit-outs); 5-player court plays 5 games (each sits out 1 game).'}
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
  loadingContainer: {
    padding: Spacing[8],
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#71817E',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg ?? 16,
    borderWidth: 1,
    borderColor: '#DCE8E3',
    padding: Spacing[4],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[2],
  },
  headerTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102E2A',
  },
  roundProgressBadge: {
    backgroundColor: '#E5F4EC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roundProgressBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#08785E',
  },
  progressSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: Spacing[2],
  },
  progressGamesText: {
    fontSize: 13,
    color: '#71817E',
  },
  progressPercentText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#08785E',
  },
  progressBarTrack: {
    height: 7,
    backgroundColor: '#E5F4EC',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing[3],
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#08785E',
    borderRadius: 4,
  },
  roundCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#E5EDE9',
    borderRadius: 8,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    gap: 8,
    marginBottom: Spacing[3],
  },
  roundCalloutText: {
    fontSize: 12,
    color: '#4B5563',
    flex: 1,
  },
  metricsContainer: {
    gap: Spacing[2],
  },
  metricRow: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#F8FAF9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5EDE9',
    paddingVertical: Spacing[2] + 2,
    paddingHorizontal: Spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricHeader: {
    fontSize: 9,
    fontWeight: '700',
    color: '#71817E',
    letterSpacing: 0.5,
    marginBottom: 4,
    textAlign: 'center',
  },
  metricIconWrap: {
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#102E2A',
    marginBottom: 2,
  },
  metricCaption: {
    fontSize: 10,
    color: '#71817E',
    textAlign: 'center',
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
  editRoundsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#E5F4EC',
  },
  editRoundsBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#08785E',
  },
  editRoundsBox: {
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#E5EDE9',
    borderRadius: 10,
    padding: Spacing[3],
    gap: Spacing[2],
  },
  editRoundsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102E2A',
  },
  editRoundsDesc: {
    fontSize: 12,
    color: '#71817E',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[3],
    marginVertical: Spacing[1],
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE8E3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValueBox: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#08785E',
  },
  stepperValueText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#08785E',
  },
  editRoundsActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing[2],
  },
  cancelEditBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  cancelEditBtnText: {
    fontSize: 13,
    color: '#71817E',
  },
  confirmEditBtn: {
    backgroundColor: '#08785E',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  confirmEditBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  planDetailsBox: {
    gap: Spacing[2],
  },
  planSummaryRow: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  planChip: {
    flex: 1,
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#E5EDE9',
    borderRadius: 8,
    padding: Spacing[2],
    alignItems: 'center',
  },
  planChipLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#71817E',
    letterSpacing: 0.5,
  },
  planChipValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#102E2A',
    marginTop: 2,
  },
  recommendationNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 4,
  },
  recommendationNoteText: {
    fontSize: 12,
    color: '#71817E',
    lineHeight: 16,
    flex: 1,
  },
  roundCardDescription: {
    fontSize: 13,
    lineHeight: 19,
    color: '#71817E',
    marginBottom: Spacing[3],
  },
  actionButtonContainer: {
    width: '100%',
  },
  primaryActionButton: {
    backgroundColor: '#08785E',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing[4],
    gap: Spacing[2],
  },
  primaryActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryActionButton: {
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#DCE8E3',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: Spacing[2],
    marginTop: 4,
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#08785E',
  },
  finalRoundNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    marginTop: 4,
  },
  finalRoundNoteText: {
    fontSize: 12,
    color: '#71817E',
  },
  endTournamentButton: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: Spacing[2],
    marginTop: 4,
  },
  endTournamentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  coverageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
    marginTop: Spacing[1],
  },
  coverageMetric: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#E5EDE9',
    borderRadius: 8,
    padding: Spacing[2],
    alignItems: 'center',
  },
  coverageValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#102E2A',
  },
  coverageLabel: {
    fontSize: 10,
    color: '#71817E',
    marginTop: 2,
    textAlign: 'center',
  },
  rulesList: {
    gap: 8,
    marginTop: Spacing[1],
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  ruleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#08785E',
    marginTop: 6,
  },
  ruleText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#2D3748',
    flex: 1,
  },
  ruleBold: {
    fontWeight: '700',
    color: '#102E2A',
  },
  championBanner: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
    borderWidth: 1.5,
    borderRadius: Radius.lg ?? 16,
    padding: Spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  championIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
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
    color: '#102E2A',
  },
  championSub: {
    fontSize: 12,
    color: '#71817E',
    marginTop: 2,
  },
});
