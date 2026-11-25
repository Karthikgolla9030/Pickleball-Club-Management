/**
 * Aught2 Pickleball — ScrambleSetupRoundsTab
 *
 * Dedicated, consolidated configuration workspace for Scramble Tournaments:
 * - The SINGLE source of editable configuration for Scramble.
 * - Section A: Participant & Match Capacity (confirmed players, feasible pairs, matches/round)
 * - Section B: Planned Rotation Rounds & Recommendations (system recommendation vs organizer selection)
 * - Section C: Partner Rotation Rules (Full Rotation, Balanced Pairings, Skill-Tiered Rotation)
 * - Section D: Court Allocation & Available Courts (concurrent capacity, active club courts)
 * - Section E: Partner Rotation Preview (collapsible simulated schedule across rounds)
 * - Validation & Generation action with regeneration safeguards.
 * - Visual design standardized with Pool Play Setup & Courts workspace.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  LayoutGrid,
  RotateCcw,
  Sliders,
  SlidersHorizontal,
  Sparkles,
  Users,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import {
  PostRegistrationChoiceChips,
  PostRegistrationStepper,
} from '@/components/post-registration';
import { competitionApi } from '@/services/api/competition';
import { Radius, Spacing } from '@/theme';
import type { Court, Tournament } from '@/types';
import type { ScrambleState } from '@/types/scramble';

const SCRAMBLE_RULE_OPTIONS = [
  {
    key: 'Full Rotation (no repeating partners)',
    label: 'Full Rotation (no repeating partners)',
    desc: 'Maximizes new partner matchups in every round with minimal repeat partners.',
  },
  {
    key: 'Balanced Pairings (fair partner distribution)',
    label: 'Balanced Pairings (fair partner distribution)',
    desc: 'Distributes partners and opponents fairly across all participating players.',
  },
  {
    key: 'Skill-Tiered Rotation (similar rating partners)',
    label: 'Skill-Tiered Rotation (similar rating partners)',
    desc: 'Pairs players within compatible skill rating tiers for balanced gameplay.',
  },
];

interface ScrambleSetupRoundsTabProps {
  clubId?: string;
  tournamentId?: string;
  tournament?: Tournament | null;
  state?: ScrambleState | null;
  canManage?: boolean;
  registeredCount?: number;
  clubCourts?: Court[];
  onGenerated?: () => void | Promise<void>;
  matchesCount?: number;
  onSetPlannedRounds?: (rounds: number) => Promise<any>;
}

export function ScrambleSetupRoundsTab({
  clubId,
  tournamentId,
  tournament,
  state,
  canManage = true,
  registeredCount = 0,
  clubCourts = [],
  onGenerated,
  matchesCount = 0,
  onSetPlannedRounds,
}: ScrambleSetupRoundsTabProps) {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [setupData, setSetupData] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Editable configuration state
  const [rounds, setRounds] = useState<number>(state?.planned_rounds ?? 5);
  const [rotationRule, setRotationRule] = useState<string>(
    'Full Rotation (no repeating partners)'
  );

  const fetchSetup = async (customRounds?: number, customRule?: string) => {
    if (!clubId || !tournamentId) return;
    try {
      setLoading(true);
      const res = await competitionApi.getScramblePostRegistrationSetup(clubId, tournamentId, {
        rounds: customRounds ?? rounds,
        rotation_rule: customRule ?? rotationRule,
      });
      setSetupData(res);
      if (res.selected_rounds && !customRounds) {
        setRounds(res.selected_rounds);
      }
      if (res.selected_rotation_rule && !customRule) {
        setRotationRule(res.selected_rotation_rule);
      }
    } catch (err) {
      console.warn('Failed to fetch scramble setup data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clubId && tournamentId) {
      void fetchSetup();
    }
  }, [clubId, tournamentId]);

  const playerCount = setupData?.confirmed_player_count ?? registeredCount;
  const hasMinPlayers = playerCount >= 4;
  const isGenerated = (setupData?.is_generated ?? false) || matchesCount > 0;
  const isFeasible = setupData?.is_schedule_feasible ?? hasMinPlayers;
  const feasiblePairs = setupData?.feasible_doubles_pairs ?? Math.floor(playerCount / 2);
  const feasibleMatches = setupData?.feasible_matches_per_round ?? Math.floor(playerCount / 4);
  const recommendedRounds = setupData?.recommended_rounds ?? 5;

  const activeCourtsList = (clubCourts || []).filter((c) => c.is_active);
  const courtsAvailable = activeCourtsList.length > 0 ? activeCourtsList.length : 4;
  const courtsNeeded = Math.max(1, feasibleMatches);

  const handleRoundsChange = (nextRounds: number) => {
    const clamped = Math.max(1, Math.min(20, nextRounds));
    setRounds(clamped);
    void fetchSetup(clamped, rotationRule);
  };

  const handleRuleChange = (rule: string) => {
    setRotationRule(rule);
    void fetchSetup(rounds, rule);
  };

  const handleConfirmAndGenerate = async () => {
    if (!clubId || !tournamentId || !canManage) return;
    try {
      setGenerating(true);
      await competitionApi.confirmAndGenerateScramble(clubId, tournamentId, {
        rounds,
        rotation_rule: rotationRule,
      });
      Alert.alert(
        'Schedule Generated',
        `Successfully generated rotation schedule for ${rounds} rounds! The tournament is now Ready to Start.`
      );
      if (onSetPlannedRounds) {
        try {
          await onSetPlannedRounds(rounds);
        } catch {}
      }
      await fetchSetup();
      if (onGenerated) {
        await onGenerated();
      }
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to generate schedule.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* ─── Header Card ───────────────────────────────────────────────────── */}
      <Card style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={styles.headerIconCircle}>
            <SlidersHorizontal size={20} color="#0F766E" />
          </View>
          <View style={styles.headerTextCol}>
            <AppText style={styles.headerTitle}>Scramble Setup & Rounds</AppText>
            <AppText style={styles.headerSubtitle}>
              The single configuration workspace for rotation rounds, partner rules, and court schedules.
            </AppText>
          </View>
        </View>
      </Card>

      {/* ─── A. Participant & Match Capacity ───────────────────────────────── */}
      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Users size={16} color="#0F766E" />
          <AppText style={styles.sectionTitle}>A. Participant & Match Capacity</AppText>
        </View>

        {/* 3 Metric Cards */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <AppText style={styles.metricLabel}>CONFIRMED PLAYERS</AppText>
            <AppText style={styles.metricValue}>{playerCount}</AppText>
          </View>
          <View style={styles.metricCard}>
            <AppText style={styles.metricLabel}>PAIRS / ROUND</AppText>
            <AppText style={styles.metricValue}>
              {hasMinPlayers ? feasiblePairs : '—'}
            </AppText>
          </View>
          <View style={styles.metricCard}>
            <AppText style={styles.metricLabel}>MATCHES / ROUND</AppText>
            <AppText style={styles.metricValue}>
              {hasMinPlayers ? feasibleMatches : '—'}
            </AppText>
          </View>
        </View>

        {/* Feasibility Notice */}
        {!hasMinPlayers ? (
          <View style={styles.warningBox}>
            <AlertTriangle size={16} color="#D97706" style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <AppText style={styles.warningTitle}>Waiting for confirmed players</AppText>
              <AppText style={styles.warningDesc}>
                At least 4 confirmed players are required to configure Scramble rotation (currently {playerCount} confirmed). Matches require 4 players per court.
              </AppText>
            </View>
          </View>
        ) : !isFeasible ? (
          <View style={styles.warningBox}>
            <AlertTriangle size={16} color="#D97706" style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <AppText style={styles.warningTitle}>Participant Count Constraint</AppText>
              <AppText style={styles.warningDesc}>
                {setupData?.odd_player_handling_message ||
                  'Current confirmed count requires adjustment for standard 4-player doubles courts.'}
              </AppText>
            </View>
          </View>
        ) : (
          <View style={styles.successBox}>
            <CheckCircle2 size={16} color="#0F766E" style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <AppText style={styles.successTitle}>Roster Feasibility Confirmed</AppText>
              <AppText style={styles.successDesc}>
                {playerCount} confirmed players allow {feasibleMatches} concurrent doubles match{feasibleMatches > 1 ? 'es' : ''} per round across {courtsNeeded} court{courtsNeeded > 1 ? 's' : ''}.
              </AppText>
            </View>
          </View>
        )}
      </Card>

      {/* ─── B. Planned Rotation Rounds ─────────────────────────────────────── */}
      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Sparkles size={16} color="#0F766E" />
          <AppText style={styles.sectionTitle}>B. Planned Rotation Rounds</AppText>
        </View>
        <AppText style={styles.sectionDesc}>
          Number of rounds each player rotates through with distinct partners.
        </AppText>

        {/* Recommendation Notice */}
        {hasMinPlayers && (
          <View style={styles.recommendationBox}>
            <Info size={15} color="#0F766E" style={{ marginTop: 2 }} />
            <AppText style={styles.recommendationText}>
              <AppText style={{ fontWeight: '700', color: '#0F766E' }}>Recommendation: </AppText>
              {setupData?.recommendation_reason ||
                `${recommendedRounds} rounds recommended based on ${playerCount} confirmed players and active courts.`}
            </AppText>
          </View>
        )}

        <View style={styles.stepperWrap}>
          <PostRegistrationStepper
            label="Planned Rotation Rounds"
            helperText={
              isGenerated
                ? `Active schedule finalized at ${rounds} rounds.`
                : `System recommends ${recommendedRounds} rounds; adjust as needed.`
            }
            value={rounds}
            unit="rounds"
            min={1}
            max={20}
            disabled={!hasMinPlayers || isGenerated}
            onChange={handleRoundsChange}
          />
        </View>
      </Card>

      {/* ─── C. Partner Rotation Rules ──────────────────────────────────────── */}
      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Sliders size={16} color="#0F766E" />
          <AppText style={styles.sectionTitle}>C. Partner Rotation Rules</AppText>
        </View>
        <AppText style={styles.sectionDesc}>
          Select the pairing rule used to assign partners and opponents across rounds.
        </AppText>

        <View style={styles.rulesList}>
          {SCRAMBLE_RULE_OPTIONS.map((opt) => {
            const isSelected = rotationRule === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.ruleCard, isSelected && styles.ruleCardSelected]}
                onPress={() => !isGenerated && handleRuleChange(opt.key)}
                activeOpacity={0.75}
                disabled={!hasMinPlayers || isGenerated}
              >
                <View style={styles.ruleCardHeader}>
                  <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                  <AppText style={[styles.ruleTitle, isSelected && styles.ruleTitleSelected]}>
                    {opt.label}
                  </AppText>
                </View>
                <AppText style={styles.ruleDesc}>{opt.desc}</AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      {/* ─── D. Court Assignment & Allocation ────────────────────────────────── */}
      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <LayoutGrid size={16} color="#0F766E" />
          <AppText style={styles.sectionTitle}>D. Court Allocation & Capacity</AppText>
        </View>
        <AppText style={styles.sectionDesc}>
          Courts utilized concurrently for rotating Scramble doubles games.
        </AppText>

        <View style={styles.courtsSummaryRow}>
          <View style={styles.courtBadgeItem}>
            <AppText style={styles.courtBadgeVal}>{courtsNeeded}</AppText>
            <AppText style={styles.courtBadgeLbl}>Courts Needed / Round</AppText>
          </View>
          <View style={styles.courtBadgeItem}>
            <AppText style={styles.courtBadgeVal}>{courtsAvailable}</AppText>
            <AppText style={styles.courtBadgeLbl}>Active Club Courts</AppText>
          </View>
        </View>

        {activeCourtsList.length > 0 && (
          <View style={styles.courtsChipsList}>
            {activeCourtsList.slice(0, 6).map((c) => (
              <View key={c.id} style={styles.courtChip}>
                <AppText style={styles.courtChipText}>
                  {c.name} {c.indoor_outdoor ? `(${c.indoor_outdoor})` : ''}
                </AppText>
              </View>
            ))}
          </View>
        )}
      </Card>

      {/* ─── E. Partner Rotation Preview Accordion ───────────────────────────── */}
      {setupData?.preview_rounds && setupData.preview_rounds.length > 0 && (
        <Card style={styles.sectionCard}>
          <TouchableOpacity
            style={styles.previewHeaderRow}
            onPress={() => setShowPreview(!showPreview)}
            activeOpacity={0.7}
          >
            <View style={styles.sectionHeader}>
              <Calendar size={16} color="#0F766E" />
              <AppText style={styles.sectionTitle}>
                E. Partner Rotation Preview ({setupData.preview_rounds.length} Rounds)
              </AppText>
            </View>
            {showPreview ? (
              <ChevronUp size={18} color="#64748B" />
            ) : (
              <ChevronDown size={18} color="#64748B" />
            )}
          </TouchableOpacity>

          {showPreview && (
            <View style={styles.previewBody}>
              {setupData.preview_rounds.map((r: any) => (
                <View key={r.round_number} style={styles.previewRoundCard}>
                  <View style={styles.previewRoundHeader}>
                    <AppText style={styles.previewRoundTitle}>Round {r.round_number}</AppText>
                    {r.note ? <AppText style={styles.previewNote}>{r.note}</AppText> : null}
                  </View>
                  {r.matches &&
                    r.matches.map((m: any, mIdx: number) => (
                      <View key={mIdx} style={styles.previewMatchRow}>
                        <View style={styles.courtPill}>
                          <AppText style={styles.courtPillText}>Court {m.match_number}</AppText>
                        </View>
                        <AppText style={styles.previewPair} numberOfLines={1}>
                          {m.side_a?.join(' & ')}
                        </AppText>
                        <AppText style={styles.previewVs}>vs</AppText>
                        <AppText style={styles.previewPair} numberOfLines={1}>
                          {m.side_b?.join(' & ')}
                        </AppText>
                      </View>
                    ))}
                </View>
              ))}
            </View>
          )}
        </Card>
      )}

      {/* ─── F. Confirm & Generate Schedule Action ───────────────────────────── */}
      <Card style={styles.actionCard}>
        {isGenerated ? (
          <View style={styles.generatedStatusBox}>
            <View style={styles.generatedStatusTop}>
              <CheckCircle2 size={20} color="#0F766E" />
              <AppText style={styles.generatedTitle}>Rotation Schedule Generated</AppText>
            </View>
            <AppText style={styles.generatedDesc}>
              Schedule is active across {rounds} rounds for {playerCount} confirmed players. View and score matches in the Rounds tab.
            </AppText>
            {canManage && (
              <TouchableOpacity
                style={styles.regenerateBtn}
                onPress={handleConfirmAndGenerate}
                disabled={generating || !hasMinPlayers}
                activeOpacity={0.8}
              >
                <RotateCcw size={14} color="#0F766E" />
                <AppText style={styles.regenerateBtnText}>
                  {generating ? 'Regenerating...' : 'Regenerate Schedule'}
                </AppText>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.generateActionBox}>
            <Button
              label={
                generating
                  ? 'Generating Schedule...'
                  : 'Confirm & Generate Rotation Schedule'
              }
              onPress={handleConfirmAndGenerate}
              disabled={!hasMinPlayers || !isFeasible || generating || !canManage}
              loading={generating}
              variant="primary"
              style={styles.generateBtn}
            />
            {!hasMinPlayers && (
              <AppText style={styles.actionConstraintText}>
                Requires at least 4 confirmed players before schedule generation is enabled.
              </AppText>
            )}
          </View>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[3],
    paddingBottom: Spacing[8],
    gap: Spacing[3],
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#DCE8E3',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  headerIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E6F4F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextCol: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F2823',
    lineHeight: 22,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#DCE8E3',
    gap: Spacing[3],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F2823',
    letterSpacing: 0.2,
  },
  sectionDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginTop: -4,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#F8FAF9',
    borderRadius: Radius.md,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[2],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8F0EC',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 4,
    textAlign: 'center',
  },
  metricValue: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F766E',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    backgroundColor: '#FFFBEB',
    borderRadius: Radius.md,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  warningTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 2,
  },
  warningDesc: {
    fontSize: 12.5,
    color: '#B45309',
    lineHeight: 17,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    backgroundColor: '#F0FDF4',
    borderRadius: Radius.md,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  successTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 2,
  },
  successDesc: {
    fontSize: 12.5,
    color: '#15803D',
    lineHeight: 17,
  },
  recommendationBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    backgroundColor: '#F0FDF9',
    borderRadius: Radius.md,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  recommendationText: {
    fontSize: 13,
    color: '#0F766E',
    lineHeight: 18,
    flex: 1,
  },
  stepperWrap: {
    backgroundColor: '#F8FAF9',
    borderRadius: Radius.md,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: '#E8F0EC',
  },
  rulesList: {
    gap: Spacing[2],
  },
  ruleCard: {
    backgroundColor: '#F8FAF9',
    borderRadius: Radius.md,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: '#E8F0EC',
    gap: 4,
  },
  ruleCardSelected: {
    backgroundColor: '#F0FDF9',
    borderColor: '#0F766E',
    borderWidth: 1.5,
  },
  ruleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: '#0F766E',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0F766E',
  },
  ruleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  ruleTitleSelected: {
    color: '#0F766E',
  },
  ruleDesc: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 17,
    paddingLeft: 26,
  },
  courtsSummaryRow: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  courtBadgeItem: {
    flex: 1,
    backgroundColor: '#F8FAF9',
    borderRadius: Radius.md,
    padding: Spacing[3],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8F0EC',
  },
  courtBadgeVal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F766E',
  },
  courtBadgeLbl: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  courtsChipsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  courtChip: {
    backgroundColor: '#E6F4F1',
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  courtChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#0F766E',
  },
  previewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewBody: {
    gap: Spacing[3],
    marginTop: Spacing[2],
  },
  previewRoundCard: {
    backgroundColor: '#F8FAF9',
    borderRadius: Radius.md,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: '#E8F0EC',
    gap: 6,
  },
  previewRoundHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  previewRoundTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F766E',
  },
  previewNote: {
    fontSize: 11,
    color: '#B45309',
    fontWeight: '600',
  },
  previewMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#E8F0EC',
  },
  courtPill: {
    backgroundColor: '#E6F4F1',
    borderRadius: 100,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  courtPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0F766E',
  },
  previewPair: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
  },
  previewVs: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  actionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#DCE8E3',
  },
  generateActionBox: {
    gap: Spacing[2],
  },
  generateBtn: {
    width: '100%',
  },
  actionConstraintText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 2,
  },
  generatedStatusBox: {
    gap: Spacing[2],
    alignItems: 'center',
    paddingVertical: Spacing[2],
  },
  generatedStatusTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  generatedTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F766E',
  },
  generatedDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  regenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: '#CCFBF1',
    backgroundColor: '#F0FDF9',
    marginTop: 6,
  },
  regenerateBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F766E',
  },
});
