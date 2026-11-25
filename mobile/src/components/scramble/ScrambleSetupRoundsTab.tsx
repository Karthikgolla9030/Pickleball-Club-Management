/**
 * Aught2 Pickleball — ScrambleSetupRoundsTab
 *
 * Dedicated, consolidated configuration workspace for Scramble Tournaments:
 * - Single source of editable configuration for Scramble.
 * - Simple sections without redundant paragraphs:
 *   - Scramble Setup header
 *   - Participant Capacity
 *   - Rotation Rounds
 *   - Partner Rotation Rules
 *   - Court Allocation & Capacity
 *   - Rotation Preview (collapsible)
 *   - Single clear primary action at bottom
 */

import React, { useEffect, useState } from 'react';
import {
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
import { PostRegistrationStepper } from '@/components/post-registration';
import { competitionApi } from '@/services/api/competition';
import { Radius, Spacing } from '@/theme';
import type { Court, Tournament } from '@/types';
import type { ScrambleState } from '@/types/scramble';

const SCRAMBLE_RULE_OPTIONS = [
  {
    key: 'Full Rotation (no repeating partners)',
    label: 'Full Rotation',
    desc: 'No repeating partners where feasible.',
  },
  {
    key: 'Balanced Pairings (fair partner distribution)',
    label: 'Balanced Pairings',
    desc: 'Distribute partners fairly.',
  },
  {
    key: 'Skill-Tiered Rotation (similar rating partners)',
    label: 'Skill-Tiered Rotation',
    desc: 'Pair players using compatible skill levels.',
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
            <SlidersHorizontal size={18} color="#0F766E" />
          </View>
          <View style={styles.headerTextCol}>
            <AppText style={styles.headerTitle}>Scramble Setup</AppText>
            <AppText style={styles.headerSubtitle}>
              Configure rotation rounds, partner rules and courts.
            </AppText>
          </View>
        </View>
      </Card>

      {/* ─── Single Concise Validation Notice (Only shown when < 4 players) ── */}
      {!hasMinPlayers && (
        <View style={styles.validationNotice}>
          <AlertTriangle size={15} color="#D97706" />
          <AppText style={styles.validationNoticeText}>
            At least 4 confirmed players are required.
          </AppText>
        </View>
      )}

      {/* ─── Participant Capacity ─────────────────────────────────────────── */}
      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Users size={16} color="#0F766E" />
          <AppText style={styles.sectionTitle}>Participant Capacity</AppText>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <AppText style={styles.metricLabel}>CONFIRMED</AppText>
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
      </Card>

      {/* ─── Rotation Rounds ──────────────────────────────────────────────── */}
      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Sparkles size={16} color="#0F766E" />
          <AppText style={styles.sectionTitle}>Rotation Rounds</AppText>
        </View>

        <View style={styles.stepperWrap}>
          <PostRegistrationStepper
            label="Selected Rounds"
            helperText={`Recommended: ${recommendedRounds} rounds (based on confirmed players and available courts).`}
            value={rounds}
            unit="rounds"
            min={1}
            max={20}
            disabled={!hasMinPlayers || isGenerated}
            onChange={handleRoundsChange}
          />
        </View>
      </Card>

      {/* ─── Partner Rotation Rules ───────────────────────────────────────── */}
      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Sliders size={16} color="#0F766E" />
          <AppText style={styles.sectionTitle}>Partner Rotation Rules</AppText>
        </View>

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

      {/* ─── Court Allocation & Capacity ──────────────────────────────────── */}
      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <LayoutGrid size={16} color="#0F766E" />
          <AppText style={styles.sectionTitle}>Court Allocation & Capacity</AppText>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <AppText style={styles.metricLabel}>ACTIVE COURTS</AppText>
            <AppText style={styles.metricValue}>{courtsAvailable}</AppText>
          </View>
          <View style={styles.metricCard}>
            <AppText style={styles.metricLabel}>COURTS / ROUND</AppText>
            <AppText style={styles.metricValue}>{courtsNeeded}</AppText>
          </View>
          <View style={styles.metricCard}>
            <AppText style={styles.metricLabel}>PLAYERS / COURT</AppText>
            <AppText style={styles.metricValue}>4</AppText>
          </View>
        </View>

        {courtsAvailable < courtsNeeded && (
          <View style={styles.constraintNotice}>
            <AlertTriangle size={14} color="#D97706" />
            <AppText style={styles.constraintNoticeText}>
              Available courts ({courtsAvailable}) are fewer than matches needed per round ({courtsNeeded}).
            </AppText>
          </View>
        )}
      </Card>

      {/* ─── Partner Rotation Preview (Collapsible) ───────────────────────── */}
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
                Rotation Preview ({setupData.preview_rounds.length} Rounds)
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

      {/* ─── Clear Primary Generation Action ──────────────────────────────── */}
      <Card style={styles.actionCard}>
        {isGenerated ? (
          <View style={styles.generatedStatusBox}>
            <View style={styles.generatedStatusTop}>
              <CheckCircle2 size={18} color="#0F766E" />
              <AppText style={styles.generatedTitle}>Rotation Schedule Generated</AppText>
            </View>
            <AppText style={styles.generatedDesc}>
              Active across {rounds} rounds for {playerCount} confirmed players. View and score matches in the Rounds tab.
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
          <Button
            label={
              generating
                ? 'Generating Schedule...'
                : 'Confirm & Generate Rotation Schedule'
            }
            onPress={handleConfirmAndGenerate}
            disabled={!hasMinPlayers || generating || !canManage}
            loading={generating}
            variant="primary"
          />
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
    borderColor: '#DEF2E6',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  headerIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E6F4F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextCol: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F2823',
    lineHeight: 21,
  },
  headerSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 17,
    marginTop: 2,
  },
  validationNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderRadius: Radius.md,
    paddingVertical: Spacing[2.5],
    paddingHorizontal: Spacing[3],
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  validationNoticeText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#92400E',
    flex: 1,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#DEF2E6',
    gap: Spacing[3],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  sectionTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F2823',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#F8FAF9',
    borderRadius: Radius.md,
    paddingVertical: Spacing[2.5],
    paddingHorizontal: Spacing[2],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8F0EC',
  },
  metricLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.4,
    marginBottom: 3,
    textAlign: 'center',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F766E',
  },
  stepperWrap: {
    backgroundColor: '#F8FAF9',
    borderRadius: Radius.md,
    padding: Spacing[2.5],
    borderWidth: 1,
    borderColor: '#E8F0EC',
  },
  rulesList: {
    gap: Spacing[2],
  },
  ruleCard: {
    backgroundColor: '#F8FAF9',
    borderRadius: Radius.md,
    padding: Spacing[2.5],
    borderWidth: 1,
    borderColor: '#E8F0EC',
    gap: 2,
  },
  ruleCardSelected: {
    backgroundColor: '#F0FDF9',
    borderColor: '#0F766E',
    borderWidth: 1.5,
  },
  ruleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radioCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: '#0F766E',
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0F766E',
  },
  ruleTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#334155',
  },
  ruleTitleSelected: {
    color: '#0F766E',
  },
  ruleDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
    paddingLeft: 24,
  },
  constraintNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFBEB',
    borderRadius: Radius.sm,
    padding: Spacing[2],
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  constraintNoticeText: {
    fontSize: 12,
    color: '#92400E',
    flex: 1,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewBody: {
    gap: Spacing[2],
    marginTop: 4,
  },
  previewRoundCard: {
    backgroundColor: '#F8FAF9',
    borderRadius: Radius.md,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: '#E8F0EC',
    gap: Spacing[2],
  },
  previewRoundHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewRoundTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F2823',
  },
  previewNote: {
    fontSize: 11,
    color: '#64748B',
  },
  previewMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.sm,
    padding: 6,
    borderWidth: 1,
    borderColor: '#E8F0EC',
  },
  courtPill: {
    backgroundColor: '#E6F4F1',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  courtPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F766E',
  },
  previewPair: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
  },
  previewVs: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },
  actionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#DEF2E6',
  },
  generatedStatusBox: {
    gap: 8,
  },
  generatedStatusTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  generatedTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F766E',
  },
  generatedDesc: {
    fontSize: 12.5,
    color: '#475569',
    lineHeight: 17,
  },
  regenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E6F4F1',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    marginTop: 4,
  },
  regenerateBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F766E',
  },
});
