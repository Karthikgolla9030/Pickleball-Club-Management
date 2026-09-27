/**
 * Aught2 Pickleball — StandardMatchScoreModal
 *
 * Unified, standardized match score entry and editing modal across ALL tournament formats:
 * - Round Robin
 * - Pool Play (Intra-pool & Championship Bracket)
 * - Single Elimination
 * - Single Elimination with Consolation
 * - Double Elimination
 * - Scramble
 *
 * Design features:
 * - Compact, clean, professional sports styling
 * - Balanced side-by-side team/player score panels
 * - Conditional team/player name display:
 *     1. If a team name exists: Display only the team name.
 *     2. If no team name exists: Display the individual player names instead.
 *     3. Never display both the team name and member names together.
 * - Unobtrusive increment/decrement controls and direct numeric score input
 * - Subtle winner highlight with Trophy pill (no oversized banners)
 * - Informational rules summary (Game Format, Target Score, Win By, No ties)
 * - Concise inline validation messages
 * - No quick common scores presets
 * - Mobile-first responsive layout with keyboard handling
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AlertCircle, Info, Trophy, UserX } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { ModalSheet } from '@/components/ModalSheet';
import { Colors, Radius, Spacing } from '@/theme';

export interface StandardMatchScoreModalProps {
  visible: boolean;
  onClose: () => void;
  match: any;
  onSave: (scoreA: number, scoreB: number) => Promise<void> | void;
  isSaving?: boolean;
  scoringRules?: {
    game_format?: string;
    target_score?: number;
    win_by?: number;
  } | null;
}

interface ExtractedSide {
  name: string;
  isBye?: boolean;
}

/**
 * Conditional display logic for Side A:
 * 1. If a team name exists: Display ONLY the team name.
 * 2. If no team name exists: Display individual player names instead.
 * 3. Never display both the team name and member names together.
 */
function extractSideA(match: any): ExtractedSide {
  if (!match) return { name: 'Side A' };

  // 1. Scramble participants (scramble has rotating doubles, no static team name)
  if (match.side_a_participants && match.side_a_participants.length > 0) {
    const names = match.side_a_participants
      .map((p: any) => p.display_name || p.name || 'Player')
      .join(' & ');
    return { name: names };
  }
  if (match.participants && Array.isArray(match.participants)) {
    const sideA = match.participants.filter((p: any) => p.side === 'side_a');
    if (sideA.length > 0) {
      const names = sideA
        .map((p: any) => p.display_name || p.name || 'Player')
        .join(' & ');
      return { name: names };
    }
  }

  // 2. Pool play t1
  if (match.t1) {
    const t = match.t1;
    const teamName = t.name && typeof t.name === 'string' && t.name.trim() !== '' ? t.name.trim() : null;
    if (teamName) {
      return { name: teamName, isBye: match.isT1Bye };
    }
    const playerNames = [t.p1?.name, t.p2?.name].filter(Boolean).join(' & ');
    return { name: playerNames || 'Side A', isBye: match.isT1Bye };
  }

  // 3. Standard team_a
  if (match.team_a) {
    const t = match.team_a;
    const teamName = t.name && typeof t.name === 'string' && t.name.trim() !== '' ? t.name.trim() : null;
    if (teamName) {
      return { name: teamName };
    }
    if (t.players && t.players.length > 0) {
      const names = t.players
        .map((p: any) => p.name || p.display_name)
        .filter(Boolean)
        .join(' & ');
      if (names) return { name: names };
    }
    if (t.members && t.members.length > 0) {
      const names = t.members
        .map((m: any) => {
          return (
            m.display_name ||
            m.user_full_name ||
            m.name ||
            m.player_membership?.user?.player_profile?.display_name ||
            m.player_membership?.user?.full_name
          );
        })
        .filter(Boolean)
        .join(' & ');
      if (names) return { name: names };
    }
    return { name: 'Side A' };
  }

  if (match.team_a_name && typeof match.team_a_name === 'string' && match.team_a_name.trim() !== '') {
    return { name: match.team_a_name.trim() };
  }

  return { name: 'Side A' };
}

/**
 * Conditional display logic for Side B:
 * 1. If a team name exists: Display ONLY the team name.
 * 2. If no team name exists: Display individual player names instead.
 * 3. Never display both the team name and member names together.
 */
function extractSideB(match: any): ExtractedSide {
  if (!match) return { name: 'Side B' };

  // 1. Scramble participants
  if (match.side_b_participants && match.side_b_participants.length > 0) {
    const names = match.side_b_participants
      .map((p: any) => p.display_name || p.name || 'Player')
      .join(' & ');
    return { name: names };
  }
  if (match.participants && Array.isArray(match.participants)) {
    const sideB = match.participants.filter((p: any) => p.side === 'side_b');
    if (sideB.length > 0) {
      const names = sideB
        .map((p: any) => p.display_name || p.name || 'Player')
        .join(' & ');
      return { name: names };
    }
  }

  // 2. Pool play t2
  if (match.t2) {
    const t = match.t2;
    const teamName = t.name && typeof t.name === 'string' && t.name.trim() !== '' ? t.name.trim() : null;
    if (teamName) {
      return { name: teamName, isBye: match.isT2Bye };
    }
    const playerNames = [t.p1?.name, t.p2?.name].filter(Boolean).join(' & ');
    return { name: playerNames || 'Side B', isBye: match.isT2Bye };
  }

  // 3. Standard team_b
  if (match.team_b) {
    const t = match.team_b;
    const teamName = t.name && typeof t.name === 'string' && t.name.trim() !== '' ? t.name.trim() : null;
    if (teamName) {
      return { name: teamName };
    }
    if (t.players && t.players.length > 0) {
      const names = t.players
        .map((p: any) => p.name || p.display_name)
        .filter(Boolean)
        .join(' & ');
      if (names) return { name: names };
    }
    if (t.members && t.members.length > 0) {
      const names = t.members
        .map((m: any) => {
          return (
            m.display_name ||
            m.user_full_name ||
            m.name ||
            m.player_membership?.user?.player_profile?.display_name ||
            m.player_membership?.user?.full_name
          );
        })
        .filter(Boolean)
        .join(' & ');
      if (names) return { name: names };
    }
    return { name: 'Side B' };
  }

  if (match.team_b_name && typeof match.team_b_name === 'string' && match.team_b_name.trim() !== '') {
    return { name: match.team_b_name.trim() };
  }

  return { name: 'Side B' };
}

function extractMatchSubtitle(match: any): string {
  if (!match) return '';
  const parts: string[] = [];

  // Round / Pool Info
  if (match.roundName) {
    parts.push(match.roundName);
  } else if (match.pool) {
    parts.push(`Pool ${match.pool}`);
    if (match.round) parts.push(`Round ${match.round}`);
  } else if (match.round_number) {
    parts.push(`Round ${match.round_number}`);
  } else if (match.bracket_round) {
    parts.push(`Round ${match.bracket_round}`);
  }

  // Match Number / Position
  if (match.match_number) {
    parts.push(`Match #${match.match_number}`);
  } else if (match.bracket_position) {
    parts.push(`Match #${match.bracket_position}`);
  } else if (match.id && typeof match.id === 'string' && match.id.length < 10) {
    parts.push(`Match ${match.id}`);
  }

  // Court Info
  if (match.court) {
    parts.push(match.court);
  } else if (match.court_name) {
    parts.push(match.court_name);
  } else if (match.court_id) {
    parts.push(`Court ${match.court_id}`);
  }

  return parts.join(' • ');
}

function extractSitOut(match: any): any {
  if (!match) return null;
  if (match.sit_out_participant) return match.sit_out_participant;
  const allParticipants = [
    ...(match.side_a_participants || []),
    ...(match.side_b_participants || []),
    ...(match.participants || []),
  ];
  return allParticipants.find((p: any) => p.side === 'sit_out' || p.is_sit_out) || null;
}

export function validateMatchScore(
  scoreA: number,
  scoreB: number,
  targetScore: number = 11,
  winBy: number = 2
): {
  isValid: boolean;
  errorMessage: string | null;
  winnerSide: 'a' | 'b' | null;
  margin: number;
} {
  if (isNaN(scoreA) || isNaN(scoreB)) {
    return {
      isValid: false,
      errorMessage: 'Both scores are required and must be valid numbers.',
      winnerSide: null,
      margin: 0,
    };
  }

  if (scoreA < 0 || scoreB < 0) {
    return {
      isValid: false,
      errorMessage: 'Scores cannot be negative.',
      winnerSide: null,
      margin: 0,
    };
  }

  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
    return {
      isValid: false,
      errorMessage: 'Scores must be whole numbers.',
      winnerSide: null,
      margin: 0,
    };
  }

  if (scoreA === scoreB) {
    return {
      isValid: false,
      errorMessage: 'A tie is not allowed — there must be a winner.',
      winnerSide: null,
      margin: 0,
    };
  }

  const high = Math.max(scoreA, scoreB);
  const low = Math.min(scoreA, scoreB);
  const margin = high - low;

  if (high < targetScore) {
    return {
      isValid: false,
      errorMessage: `The winning score must meet the target (at least ${targetScore} points).`,
      winnerSide: null,
      margin,
    };
  }

  if (margin < winBy) {
    return {
      isValid: false,
      errorMessage: `Winner must win by at least ${winBy} points (current margin is ${margin}).`,
      winnerSide: null,
      margin,
    };
  }

  return {
    isValid: true,
    errorMessage: null,
    winnerSide: scoreA > scoreB ? 'a' : 'b',
    margin,
  };
}

export function StandardMatchScoreModal({
  visible,
  onClose,
  match,
  onSave,
  isSaving = false,
  scoringRules,
}: StandardMatchScoreModalProps) {
  const [scoreA, setScoreA] = useState<number>(0);
  const [scoreB, setScoreB] = useState<number>(0);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const targetScore = scoringRules?.target_score ?? match?.tournament?.scoring_rules?.target_score ?? 11;
  const winBy = scoringRules?.win_by ?? match?.tournament?.scoring_rules?.win_by ?? 2;
  const gameFormat = scoringRules?.game_format ?? match?.tournament?.scoring_rules?.game_format ?? 'Single game';

  const isCompleted = Boolean(
    match?.status === 'completed' ||
    (match?.score_a != null && match?.score_b != null) ||
    (match?.score1 != null && match?.score2 != null)
  );

  // Initialize or prefill scores
  useEffect(() => {
    if (visible && match) {
      const sA = match.score_a ?? match.score1 ?? 0;
      const sB = match.score_b ?? match.score2 ?? 0;
      setScoreA(sA);
      setScoreB(sB);
      setHasInteracted(Boolean(isCompleted));
      setServerError(null);
      setSubmitting(false);
    }
  }, [visible, match, isCompleted]);

  const sideA = useMemo(() => extractSideA(match), [match]);
  const sideB = useMemo(() => extractSideB(match), [match]);
  const subtitle = useMemo(() => extractMatchSubtitle(match), [match]);
  const sitOut = useMemo(() => extractSitOut(match), [match]);

  const validation = useMemo(
    () => validateMatchScore(scoreA, scoreB, targetScore, winBy),
    [scoreA, scoreB, targetScore, winBy]
  );

  const handleStepA = (delta: number) => {
    setHasInteracted(true);
    setServerError(null);
    setScoreA((prev) => Math.max(0, prev + delta));
  };

  const handleStepB = (delta: number) => {
    setHasInteracted(true);
    setServerError(null);
    setScoreB((prev) => Math.max(0, prev + delta));
  };

  const handleTextChangeA = (text: string) => {
    setHasInteracted(true);
    setServerError(null);
    const cleaned = text.replace(/[^0-9]/g, '');
    const val = cleaned === '' ? 0 : parseInt(cleaned, 10);
    setScoreA(isNaN(val) ? 0 : val);
  };

  const handleTextChangeB = (text: string) => {
    setHasInteracted(true);
    setServerError(null);
    const cleaned = text.replace(/[^0-9]/g, '');
    const val = cleaned === '' ? 0 : parseInt(cleaned, 10);
    setScoreB(isNaN(val) ? 0 : val);
  };

  const isBusy = isSaving || submitting;

  const handleSubmit = async () => {
    if (!validation.isValid || isBusy) return;
    try {
      setSubmitting(true);
      setServerError(null);
      await onSave(scoreA, scoreB);
      onClose();
    } catch (err: any) {
      const msg: string = err?.message || err?.detail || '';
      // If the backend indicates the score was already recorded or completed, treat as success
      if (
        msg.toLowerCase().includes('already recorded') ||
        msg.toLowerCase().includes('already completed')
      ) {
        onClose();
        return;
      }

      // Detect timeout / network errors and show specific guidance
      const isNetworkError =
        err?.type === 'NETWORK_ERROR' ||
        msg.toLowerCase().includes('network') ||
        msg.toLowerCase().includes('timed out') ||
        msg.toLowerCase().includes('cancelled') ||
        msg.toLowerCase().includes('confirm');

      if (isNetworkError) {
        setServerError(
          "Couldn't confirm that the score was saved. Please check the match result before trying again."
        );
      } else {
        setServerError(msg || 'Failed to save match result. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={isCompleted ? 'Edit Match Score' : 'Enter Match Score'}
      subtitle={subtitle}
      actions={[
        {
          label: 'Cancel',
          variant: 'secondary',
          onPress: onClose,
          disabled: isBusy,
        },
        {
          label: isBusy ? 'Saving...' : 'Save Result',
          variant: 'primary',
          onPress: handleSubmit,
          disabled: !validation.isValid || isBusy,
          loading: isBusy,
        },
      ]}
    >
      <View style={styles.container}>
        {/* Sit-out Player Alert for 5-player court games */}
        {sitOut ? (
          <View style={styles.sitOutBanner}>
            <UserX size={14} color="#D97706" />
            <AppText variant="caption" style={styles.sitOutText}>
              Sit-out:{' '}
              <AppText variant="caption" bold style={{ color: '#92400E' }}>
                {sitOut.display_name || sitOut.name || 'Player'}
              </AppText>{' '}
              (takes a bye this game)
            </AppText>
          </View>
        ) : null}

        {/* Score Panels Row */}
        <View style={styles.scoreRow}>
          {/* Side A Panel */}
          <View
            style={[
              styles.teamScoreBox,
              validation.isValid && validation.winnerSide === 'a' && styles.winningTeamBox,
            ]}
          >
            {/* Top Tag */}
            <View style={styles.sideBadge}>
              <AppText variant="caption" style={styles.sideBadgeText}>
                SIDE A
              </AppText>
            </View>

            {/* Team or Player Name (Never both) */}
            <View style={styles.teamHeaderWrap}>
              <AppText variant="body" bold numberOfLines={2} style={styles.teamTitle}>
                {sideA.name}
              </AppText>
            </View>

            {/* Stepper & Input */}
            <View style={styles.stepperContainer}>
              <TouchableOpacity
                onPress={() => handleStepA(-1)}
                style={styles.stepBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel="Decrease Side A score"
                accessibilityRole="button"
              >
                <AppText style={styles.stepBtnText}>−</AppText>
              </TouchableOpacity>

              <TextInput
                value={String(scoreA)}
                onChangeText={handleTextChangeA}
                keyboardType="number-pad"
                style={[
                  styles.scoreInput,
                  validation.isValid && validation.winnerSide === 'a' && styles.scoreInputWinner,
                ]}
                selectTextOnFocus
                maxLength={3}
                accessibilityLabel="Side A score input"
              />

              <TouchableOpacity
                onPress={() => handleStepA(1)}
                style={styles.stepBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel="Increase Side A score"
                accessibilityRole="button"
              >
                <AppText style={styles.stepBtnText}>+</AppText>
              </TouchableOpacity>
            </View>

            {/* Winner Badge Area */}
            <View style={styles.winnerSlot}>
              {validation.isValid && validation.winnerSide === 'a' ? (
                <View style={styles.winnerPill}>
                  <Trophy size={13} color="#065F46" />
                  <AppText variant="caption" bold style={styles.winnerPillText}>
                    WINNER
                  </AppText>
                </View>
              ) : null}
            </View>
          </View>

          {/* VS Divider */}
          <View style={styles.vsBadge}>
            <AppText variant="caption" bold style={styles.vsText}>
              VS
            </AppText>
          </View>

          {/* Side B Panel */}
          <View
            style={[
              styles.teamScoreBox,
              validation.isValid && validation.winnerSide === 'b' && styles.winningTeamBox,
            ]}
          >
            {/* Top Tag */}
            <View style={styles.sideBadge}>
              <AppText variant="caption" style={styles.sideBadgeText}>
                SIDE B
              </AppText>
            </View>

            {/* Team or Player Name (Never both) */}
            <View style={styles.teamHeaderWrap}>
              <AppText variant="body" bold numberOfLines={2} style={styles.teamTitle}>
                {sideB.name}
              </AppText>
            </View>

            {/* Stepper & Input */}
            <View style={styles.stepperContainer}>
              <TouchableOpacity
                onPress={() => handleStepB(-1)}
                style={styles.stepBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel="Decrease Side B score"
                accessibilityRole="button"
              >
                <AppText style={styles.stepBtnText}>−</AppText>
              </TouchableOpacity>

              <TextInput
                value={String(scoreB)}
                onChangeText={handleTextChangeB}
                keyboardType="number-pad"
                style={[
                  styles.scoreInput,
                  validation.isValid && validation.winnerSide === 'b' && styles.scoreInputWinner,
                ]}
                selectTextOnFocus
                maxLength={3}
                accessibilityLabel="Side B score input"
              />

              <TouchableOpacity
                onPress={() => handleStepB(1)}
                style={styles.stepBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel="Increase Side B score"
                accessibilityRole="button"
              >
                <AppText style={styles.stepBtnText}>+</AppText>
              </TouchableOpacity>
            </View>

            {/* Winner Badge Area */}
            <View style={styles.winnerSlot}>
              {validation.isValid && validation.winnerSide === 'b' ? (
                <View style={styles.winnerPill}>
                  <Trophy size={13} color="#065F46" />
                  <AppText variant="caption" bold style={styles.winnerPillText}>
                    WINNER
                  </AppText>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* Informational Rules Section (3 columns + subtitle) */}
        <View style={styles.rulesCard}>
          <View style={styles.rulesHeader}>
            <Info size={14} color="#059669" />
            <AppText variant="caption" bold style={styles.rulesHeading}>
              MATCH RULES
            </AppText>
          </View>

          <View style={styles.rulesTable}>
            <View style={styles.ruleColumn}>
              <AppText variant="caption" color="tertiary" style={styles.ruleLabel}>
                Game Format
              </AppText>
              <AppText variant="bodySmall" bold style={styles.ruleValue}>
                {gameFormat === 'single_game' ? 'Single game' : gameFormat}
              </AppText>
            </View>

            <View style={styles.ruleDivider} />

            <View style={styles.ruleColumn}>
              <AppText variant="caption" color="tertiary" style={styles.ruleLabel}>
                Target Score
              </AppText>
              <AppText variant="bodySmall" bold style={styles.ruleValue}>
                {targetScore} points
              </AppText>
            </View>

            <View style={styles.ruleDivider} />

            <View style={styles.ruleColumn}>
              <AppText variant="caption" color="tertiary" style={styles.ruleLabel}>
                Win By
              </AppText>
              <AppText variant="bodySmall" bold style={styles.ruleValue}>
                {winBy} points
              </AppText>
            </View>
          </View>

          <AppText variant="caption" color="secondary" style={styles.ruleFootnote}>
            No ties allowed. Winning score must be at least {winBy} points ahead.
          </AppText>
        </View>

        {/* Validation Feedback (Only shown when error exists) */}
        {!validation.isValid && hasInteracted && validation.errorMessage ? (
          <View style={styles.errorBox}>
            <AlertCircle size={15} color="#DC2626" style={{ marginTop: 1 }} />
            <AppText variant="caption" style={styles.errorText}>
              {validation.errorMessage}
            </AppText>
          </View>
        ) : null}

        {/* Server Error Alert */}
        {serverError ? (
          <View style={styles.errorBox}>
            <AlertCircle size={15} color="#DC2626" style={{ marginTop: 1 }} />
            <AppText variant="caption" style={styles.errorText}>
              {serverError}
            </AppText>
          </View>
        ) : null}
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[2.5],
  },
  sitOutBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing[1.5],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  sitOutText: {
    color: '#92400E',
    fontSize: 12,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  teamScoreBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[1.5],
    alignItems: 'center',
    minHeight: 144,
    justifyContent: 'space-between',
  },
  winningTeamBox: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
  },
  sideBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: '#F1F5F9',
    marginBottom: 2,
  },
  sideBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  teamHeaderWrap: {
    alignItems: 'center',
    width: '100%',
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  teamTitle: {
    textAlign: 'center',
    color: Colors.text.primary,
    fontSize: 14,
    lineHeight: 18,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
    marginVertical: 2,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#334155',
    lineHeight: 20,
    textAlign: 'center',
  },
  scoreInput: {
    width: 50,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    padding: 0,
  },
  scoreInputWinner: {
    borderColor: '#10B981',
    color: '#064E3B',
  },
  winnerSlot: {
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  winnerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  winnerPillText: {
    color: '#065F46',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  vsBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  vsText: {
    fontSize: 10,
    color: '#64748B',
  },
  rulesCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    gap: 4,
  },
  rulesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rulesHeading: {
    fontSize: 11,
    letterSpacing: 0.5,
    color: '#047857',
  },
  rulesTable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  ruleColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  ruleDivider: {
    width: 1,
    height: 26,
    backgroundColor: '#E2E8F0',
  },
  ruleLabel: {
    fontSize: 10,
    color: '#64748B',
  },
  ruleValue: {
    fontSize: 13,
    color: Colors.text.primary,
  },
  ruleFootnote: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 4,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: Radius.md,
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
  },
  errorText: {
    color: '#DC2626',
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
});
