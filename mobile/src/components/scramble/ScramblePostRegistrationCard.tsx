/**
 * Aught2 Pickleball — ScramblePostRegistrationCard
 *
 * Post-Registration Configuration & Preview card for Scramble Tournaments:
 * - Rendered after registration closes and before tournament begins.
 * - Displays confirmed player count and feasible doubles matches.
 * - Recommends optimal rounds based on players, courts, and rotation rules.
 * - Allows Tournament Director to adjust rounds and select rotation rule.
 * - Displays live partner rotation preview across rounds.
 * - Handles odd player counts, withdrawals, and insufficient participants explicitly.
 * - Validates feasibility and generates the final rotation schedule.
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
  Minus,
  Play,
  Plus,
  RotateCcw,
  Sliders,
  Sparkles,
  Users,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { competitionApi } from '@/services/api/competition';
import { Colors, Radius, Spacing } from '@/theme';
import type { Tournament } from '@/types';

interface ScramblePostRegistrationCardProps {
  clubId: string;
  tournamentId: string;
  tournament: Tournament;
  canManage: boolean;
  onGenerated: () => void | Promise<void>;
  onStartTournament?: () => void | Promise<void>;
  isStartingTournament?: boolean;
}

export function ScramblePostRegistrationCard({
  clubId,
  tournamentId,
  tournament,
  canManage,
  onGenerated,
  onStartTournament,
  isStartingTournament = false,
}: ScramblePostRegistrationCardProps) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [setupData, setSetupData] = useState<any>(null);
  const [rounds, setRounds] = useState<number>(5);
  const [rotationRule, setRotationRule] = useState<string>('Full Rotation (no repeating partners)');
  const [showPreview, setShowPreview] = useState(false);

  const fetchSetup = async (customRounds?: number, customRule?: string) => {
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
      console.warn('Failed to fetch scramble post-registration setup:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tournament?.status === 'registration_closed') {
      void fetchSetup();
    }
  }, [clubId, tournamentId, tournament?.status]);

  if (tournament?.status !== 'registration_closed') {
    return null;
  }

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
    if (!canManage) return;
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
      await fetchSetup();
      await onGenerated();
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to generate schedule.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading && !setupData) {
    return (
      <Card style={styles.card}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#0F766E" />
          <AppText style={styles.loadingText}>Calculating participant roster and rotation feasibility...</AppText>
        </View>
      </Card>
    );
  }

  const isGenerated = setupData?.is_generated ?? false;
  const isFeasible = setupData?.is_schedule_feasible ?? true;
  const playerCount = setupData?.confirmed_player_count ?? tournament?.participant_count ?? 0;
  const stage = setupData?.configuration_stage ?? 'awaiting_format_configuration';
  const isReadyToStart = isGenerated && stage === 'ready_to_start';

  return (
    <Card style={styles.card}>
      {/* ─── 1. Header ──────────────────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <View style={styles.iconCircle}>
            <Sliders size={18} color="#0F766E" />
          </View>
          <View>
            <AppText style={styles.cardTitle}>Post-Registration Rotation Setup</AppText>
            <AppText style={styles.cardSubtitle}>
              {isReadyToStart
                ? 'Rotation schedule generated • Verified and ready to start'
                : 'Registration closed • Configure rounds and finalize partner matrix'}
            </AppText>
          </View>
        </View>

        <Badge
          label={
            isReadyToStart
              ? 'Ready to Start'
              : isGenerated
              ? 'Schedule Generated'
              : 'Awaiting Configuration'
          }
          variant={isReadyToStart ? 'success' : isGenerated ? 'info' : 'warning'}
        />
      </View>

      <View style={styles.divider} />

      {/* ─── 2. Participant Roster & Feasibility ─────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Users size={16} color="#0F766E" />
          <AppText style={styles.sectionTitle}>Confirmed Participants & Match Capacity</AppText>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricCard}>
            <AppText style={styles.metricNum}>{playerCount}</AppText>
            <AppText style={styles.metricLabel}>Confirmed Players</AppText>
          </View>
          <View style={styles.metricCard}>
            <AppText style={styles.metricNum}>{setupData?.feasible_doubles_pairs ?? Math.floor(playerCount / 2)}</AppText>
            <AppText style={styles.metricLabel}>Doubles Pairs / Rd</AppText>
          </View>
          <View style={styles.metricCard}>
            <AppText style={styles.metricNum}>{setupData?.feasible_matches_per_round ?? Math.floor(playerCount / 4)}</AppText>
            <AppText style={styles.metricLabel}>Simultaneous Matches</AppText>
          </View>
        </View>

        {/* Feasibility / Odd Player Status Notice */}
        <View
          style={[
            styles.noticeBox,
            !isFeasible ? styles.noticeBoxWarning : styles.noticeBoxSuccess,
          ]}
        >
          {!isFeasible ? (
            <AlertTriangle size={18} color="#D97706" style={{ marginTop: 2 }} />
          ) : (
            <CheckCircle2 size={18} color="#0F766E" style={{ marginTop: 2 }} />
          )}
          <View style={{ flex: 1 }}>
            <AppText style={styles.noticeTitle}>
              {!isFeasible ? 'Participant Count Constraint' : 'Roster Feasibility Confirmed'}
            </AppText>
            <AppText style={styles.noticeText}>
              {setupData?.odd_player_handling_message ||
                `${playerCount} players confirmed. Doubles rotation schedule is feasible.`}
            </AppText>
          </View>
        </View>
      </View>

      <View style={styles.divider} />

      {/* ─── 3. Rotation Rounds Recommendation & Adjuster ─────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Sparkles size={16} color="#0F766E" />
          <AppText style={styles.sectionTitle}>Planned Rotation Rounds</AppText>
        </View>

        {setupData?.recommendation_reason ? (
          <View style={styles.recommendationBox}>
            <Info size={16} color="#0F766E" style={{ marginTop: 2 }} />
            <AppText style={styles.recommendationText}>
              <AppText style={{ fontWeight: '700', color: '#0F766E' }}>Recommendation: </AppText>
              {setupData.recommendation_reason}
            </AppText>
          </View>
        ) : null}

        <View style={styles.adjusterRow}>
          <AppText style={styles.adjusterLabel}>Selected Rounds:</AppText>
          <View style={styles.counterWrap}>
            <TouchableOpacity
              style={[styles.counterBtn, (rounds <= 1 || isGenerated) && styles.counterBtnDisabled]}
              onPress={() => handleRoundsChange(rounds - 1)}
              disabled={rounds <= 1 || isGenerated}
            >
              <Minus size={16} color={rounds <= 1 || isGenerated ? '#94A3B8' : '#0F766E'} />
            </TouchableOpacity>

            <View style={styles.counterValueBox}>
              <AppText style={styles.counterValue}>{rounds}</AppText>
              <AppText style={styles.counterSub}>rounds</AppText>
            </View>

            <TouchableOpacity
              style={[styles.counterBtn, (rounds >= 20 || isGenerated) && styles.counterBtnDisabled]}
              onPress={() => handleRoundsChange(rounds + 1)}
              disabled={rounds >= 20 || isGenerated}
            >
              <Plus size={16} color={rounds >= 20 || isGenerated ? '#94A3B8' : '#0F766E'} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.divider} />

      {/* ─── 4. Rotation Rules Selection ─────────────────────────────────────── */}
      <View style={styles.section}>
        <AppText style={styles.sectionTitle}>Partner Rotation Rule</AppText>
        <View style={styles.chipsRow}>
          {(setupData?.available_rotation_rules || [
            'Full Rotation (no repeating partners)',
            'Balanced Pairings (fair partner distribution)',
          ]).map((rule: string) => {
            const isSelected = rotationRule === rule;
            return (
              <TouchableOpacity
                key={rule}
                style={[styles.chip, isSelected && styles.chipActive]}
                onPress={() => !isGenerated && handleRuleChange(rule)}
                disabled={isGenerated}
              >
                <AppText style={[styles.chipText, isSelected && styles.chipTextActive]}>
                  {rule}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ─── 5. Partner Rotation Preview Accordion ───────────────────────────── */}
      {setupData?.preview_rounds && setupData.preview_rounds.length > 0 && (
        <>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.previewToggle}
            onPress={() => setShowPreview(!showPreview)}
            activeOpacity={0.7}
          >
            <View style={styles.sectionHeaderRow}>
              <Calendar size={16} color="#0F766E" />
              <AppText style={styles.sectionTitle}>
                Partner Rotation Preview ({setupData.preview_rounds.length} Rounds)
              </AppText>
            </View>
            {showPreview ? <ChevronUp size={18} color="#64748B" /> : <ChevronDown size={18} color="#64748B" />}
          </TouchableOpacity>

          {showPreview && (
            <View style={styles.previewContainer}>
              {setupData.preview_rounds.map((r: any) => (
                <View key={r.round_number} style={styles.previewRoundBox}>
                  <AppText style={styles.previewRoundTitle}>Round {r.round_number}</AppText>
                  {r.note ? (
                    <AppText style={styles.previewNote}>{r.note}</AppText>
                  ) : null}
                  {r.matches &&
                    r.matches.map((m: any, mIdx: number) => (
                      <View key={mIdx} style={styles.previewMatchRow}>
                        <AppText style={styles.previewMatchNum}>Court {m.match_number}:</AppText>
                        <AppText style={styles.previewPair}>{m.side_a?.join(' & ')}</AppText>
                        <AppText style={styles.previewVs}>vs</AppText>
                        <AppText style={styles.previewPair}>{m.side_b?.join(' & ')}</AppText>
                      </View>
                    ))}
                </View>
              ))}
            </View>
          )}
        </>
      )}

      <View style={styles.divider} />

      {/* ─── 6. Action Controls ──────────────────────────────────────────────── */}
      <View style={styles.actionsRow}>
        {!isGenerated ? (
          <Button
            label={generating ? 'Generating Schedule...' : 'Confirm & Generate Rotation Schedule'}
            onPress={handleConfirmAndGenerate}
            disabled={!isFeasible || generating || !canManage}
            loading={generating}
            variant="primary"
            style={styles.actionBtn}
          />
        ) : isReadyToStart && onStartTournament ? (
          <Button
            label={isStartingTournament ? 'Starting Tournament...' : 'Start Tournament (Ready)'}
            onPress={onStartTournament}
            disabled={isStartingTournament || !canManage}
            loading={isStartingTournament}
            variant="primary"
            style={styles.actionBtn}
          />
        ) : (
          <View style={styles.completeBox}>
            <CheckCircle2 size={18} color="#0F766E" />
            <AppText style={styles.completeText}>
              Rotation schedule is active across {rounds} rounds.
            </AppText>
          </View>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DEF2E6',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[4],
  },
  loadingBox: {
    padding: Spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
    flexWrap: 'wrap',
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    flex: 1,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#DEF2E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102F2A',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: Spacing[3],
  },
  section: {
    gap: Spacing[2],
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  metricRow: {
    flexDirection: 'row',
    gap: Spacing[2],
    marginTop: Spacing[1],
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: Spacing[2],
    alignItems: 'center',
  },
  metricNum: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F766E',
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
  },
  noticeBox: {
    flexDirection: 'row',
    gap: Spacing[2],
    padding: Spacing[3],
    borderRadius: Radius.md,
    marginTop: Spacing[2],
  },
  noticeBoxWarning: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  noticeBoxSuccess: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  noticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  noticeText: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
    lineHeight: 16,
  },
  recommendationBox: {
    flexDirection: 'row',
    gap: Spacing[2],
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    borderRadius: Radius.md,
    padding: Spacing[2],
  },
  recommendationText: {
    fontSize: 12,
    color: '#134E4A',
    flex: 1,
    lineHeight: 16,
  },
  adjusterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing[2],
  },
  adjusterLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  counterWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  counterBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterBtnDisabled: {
    opacity: 0.4,
  },
  counterValueBox: {
    alignItems: 'center',
    minWidth: 48,
  },
  counterValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F766E',
  },
  counterSub: {
    fontSize: 10,
    color: '#64748B',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
    marginTop: Spacing[1],
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: {
    backgroundColor: '#DEF2E6',
    borderColor: '#0F766E',
  },
  chipText: {
    fontSize: 12,
    color: '#475569',
  },
  chipTextActive: {
    color: '#0F766E',
    fontWeight: '700',
  },
  previewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing[1],
  },
  previewContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: Spacing[3],
    gap: Spacing[3],
    marginTop: Spacing[2],
  },
  previewRoundBox: {
    gap: Spacing[1],
  },
  previewRoundTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F766E',
  },
  previewNote: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
  },
  previewMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingVertical: 2,
    flexWrap: 'wrap',
  },
  previewMatchNum: {
    fontSize: 11,
    color: '#94A3B8',
    width: 50,
  },
  previewPair: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  previewVs: {
    fontSize: 11,
    color: '#94A3B8',
  },
  actionsRow: {
    marginTop: Spacing[1],
  },
  actionBtn: {
    width: '100%',
  },
  completeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: '#F0FDF4',
    padding: Spacing[3],
    borderRadius: Radius.md,
  },
  completeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F766E',
  },
});
