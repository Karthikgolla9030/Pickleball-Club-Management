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
 * - Standardized to match Club Side tournament management design system.
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
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Sliders,
  Sparkles,
  Users,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import {
  PostRegistrationChoiceChips,
  PostRegistrationHeader,
  PostRegistrationMetrics,
  PostRegistrationNotice,
  PostRegistrationStepper,
} from '@/components/post-registration';
import { competitionApi } from '@/services/api/competition';
import { Radius, Spacing } from '@/theme';
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
          <AppText style={styles.loadingText}>
            Calculating participant roster and rotation feasibility...
          </AppText>
        </View>
      </Card>
    );
  }

  const isGenerated = setupData?.is_generated ?? false;
  const isFeasible = setupData?.is_schedule_feasible ?? true;
  const playerCount = setupData?.confirmed_player_count ?? tournament?.participant_count ?? 0;
  const stage = setupData?.configuration_stage ?? 'awaiting_format_configuration';
  const isReadyToStart = isGenerated && stage === 'ready_to_start';
  const feasiblePairs = setupData?.feasible_doubles_pairs ?? Math.floor(playerCount / 2);
  const feasibleMatches = setupData?.feasible_matches_per_round ?? Math.floor(playerCount / 4);

  return (
    <Card style={styles.card}>
      {/* ─── 1. Standardized Responsive Header ───────────────────────────────── */}
      <PostRegistrationHeader
        icon={<Sliders size={18} color="#0F766E" />}
        title="Post-Registration Rotation Setup"
        subtitle={
          isReadyToStart
            ? 'Rotation schedule generated • Verified and ready to start'
            : isGenerated
            ? 'Schedule generated • Partner matrix active'
            : 'Registration closed • Configure rounds and finalize partner matrix'
        }
        badgeLabel={
          isReadyToStart
            ? 'Ready to Start'
            : isGenerated
            ? 'Schedule Generated'
            : 'Awaiting Configuration'
        }
        badgeVariant={isReadyToStart ? 'success' : isGenerated ? 'info' : 'warning'}
      />

      <View style={styles.divider} />

      {/* ─── 2. Confirmed Participants & Balanced Metrics ────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Users size={15} color="#0F766E" />
          <AppText style={styles.sectionTitle}>Confirmed Participants & Match Capacity</AppText>
        </View>

        <PostRegistrationMetrics
          metrics={[
            {
              label: 'CONFIRMED PLAYERS',
              value: playerCount,
            },
            {
              label: 'DOUBLES PAIRS / RD',
              value: feasiblePairs,
            },
            {
              label: 'MATCHES / ROUND',
              value: feasibleMatches,
            },
          ]}
        />

        {/* Feasibility / Constraint Status Notice */}
        <PostRegistrationNotice
          variant={isFeasible ? 'success' : 'warning'}
          title={isFeasible ? 'Roster Feasibility Confirmed' : 'Participant Count Constraint'}
          message={
            setupData?.odd_player_handling_message ||
            `${playerCount} players confirmed. Doubles rotation schedule is feasible.`
          }
        />
      </View>

      <View style={styles.divider} />

      {/* ─── 3. Rotation Rounds Stepper & Recommendations ────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Sparkles size={15} color="#0F766E" />
          <AppText style={styles.sectionTitle}>Planned Rotation Rounds</AppText>
        </View>

        {setupData?.recommendation_reason ? (
          <PostRegistrationNotice
            variant="info"
            title="Recommendation"
            message={setupData.recommendation_reason}
          />
        ) : null}

        <PostRegistrationStepper
          label="Planned Rotation Rounds"
          helperText={`Recommended: ${setupData?.recommended_rounds ?? 5} rounds based on courts and roster`}
          value={rounds}
          unit="rounds"
          min={1}
          max={20}
          disabled={isGenerated}
          onChange={handleRoundsChange}
        />
      </View>

      <View style={styles.divider} />

      {/* ─── 4. Partner Rotation Rule Choice Chips ───────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Sliders size={15} color="#0F766E" />
          <AppText style={styles.sectionTitle}>Partner Rotation Rule</AppText>
        </View>

        <PostRegistrationChoiceChips
          options={
            setupData?.available_rotation_rules || [
              'Full Rotation (no repeating partners)',
              'Balanced Pairings (fair partner distribution)',
            ]
          }
          selectedValue={rotationRule}
          disabled={isGenerated}
          onSelect={handleRuleChange}
        />
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
              <Calendar size={15} color="#0F766E" />
              <AppText style={styles.sectionTitle}>
                Partner Rotation Preview ({setupData.preview_rounds.length} Rounds)
              </AppText>
            </View>
            {showPreview ? (
              <ChevronUp size={18} color="#64748B" />
            ) : (
              <ChevronDown size={18} color="#64748B" />
            )}
          </TouchableOpacity>

          {showPreview && (
            <View style={styles.previewContainer}>
              {setupData.preview_rounds.map((r: any) => (
                <View key={r.round_number} style={styles.previewRoundBox}>
                  <AppText style={styles.previewRoundTitle}>Round {r.round_number}</AppText>
                  {r.note ? <AppText style={styles.previewNote}>{r.note}</AppText> : null}
                  {r.matches &&
                    r.matches.map((m: any, mIdx: number) => (
                      <View key={mIdx} style={styles.previewMatchRow}>
                        <AppText style={styles.previewMatchNum}>Court {m.match_number}:</AppText>
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
        </>
      )}

      <View style={styles.divider} />

      {/* ─── 6. Primary Action Controls ──────────────────────────────────────── */}
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
              Rotation schedule active across {rounds} rounds.
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
    marginBottom: Spacing[4], // Clear visual separation before Tournament Progress
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
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: Spacing[3],
  },
  section: {
    gap: Spacing[2.5],
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B',
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
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: Spacing[2.5],
    gap: Spacing[1],
  },
  previewRoundTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F766E',
  },
  previewNote: {
    fontSize: 11.5,
    color: '#64748B',
    fontStyle: 'italic',
  },
  previewMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1.5],
    paddingVertical: 2,
    flexWrap: 'wrap',
  },
  previewMatchNum: {
    fontSize: 11,
    color: '#94A3B8',
    width: 48,
  },
  previewPair: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
    flexShrink: 1,
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
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  completeText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F766E',
    flex: 1,
  },
});
