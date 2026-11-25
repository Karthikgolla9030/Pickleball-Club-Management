/**
 * Aught2 Pickleball — PoolPlaySetupCourtsTab
 *
 * Dedicated, consolidated configuration workspace for Pool Play tournaments:
 * - The SINGLE source of editable configuration for Pool Play.
 * - Section A: Pool Distribution (confirmed team count, recommendations, pools stepper, simple preview)
 * - Section B: Pool Balance (rating tolerance options: Strict, Fair, Relaxed, Wide)
 * - Section C: Championship Qualification (qualifiers per pool, bracket type, explanation)
 * - Section D: Court Assignment (concurrent capacity, active club courts)
 * - Confirm & Generate action with validation and regeneration safeguards.
 * - Clean empty/insufficient state when confirmed teams < 4: "Waiting for confirmed teams".
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
  Check,
  CheckCircle2,
  GitFork,
  Info,
  Layers,
  LayoutGrid,
  Scale,
  SlidersHorizontal,
  Sparkles,
  Trophy,
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
import type { Court, Tournament } from '@/types';
import type { BracketType, PoolPlayConfig } from '@/types/poolPlay';
import { TOLERANCE_OPTIONS } from '@/utils/poolPlayLogic';

interface PoolPlaySetupCourtsTabProps {
  clubId?: string;
  tournamentId?: string;
  tournament?: Tournament | null;
  config: PoolPlayConfig;
  onSaveConfig: (updated: Partial<PoolPlayConfig>) => void;
  canManage?: boolean;
  registeredCount?: number;
  maxParticipants?: number | null;
  clubCourts?: Court[];
  clubName?: string;
  onGenerated?: () => void | Promise<void>;
  matchesCount?: number;
}

export function PoolPlaySetupCourtsTab({
  clubId,
  tournamentId,
  tournament,
  config,
  onSaveConfig,
  canManage = true,
  registeredCount = 0,
  maxParticipants = 16,
  clubCourts,
  clubName,
  onGenerated,
  matchesCount = 0,
}: PoolPlaySetupCourtsTabProps) {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [setupData, setSetupData] = useState<any>(null);

  // Editable configuration state
  const [numPools, setNumPools] = useState<number>(config.numPools || 2);
  const [tolerance, setTolerance] = useState<number>(config.balanceTolerance ?? 0.5);
  const [qualifiersPerPool, setQualifiersPerPool] = useState<number>(
    Math.max(1, Math.floor((config.qualifierCount || 4) / (config.numPools || 2)))
  );
  const [bracketType, setBracketType] = useState<BracketType>(
    (config.bracketType as BracketType) || 'Single Elimination'
  );
  const [numCourts, setNumCourts] = useState<number>(config.numCourts || 4);
  const [hasSaved, setHasSaved] = useState(false);

  // Fetch server recommendation & status if IDs are present
  const fetchSetup = async (p?: number, q?: number, b?: string) => {
    if (!clubId || !tournamentId) return;
    try {
      setLoading(true);
      const res = await competitionApi.getPoolPlayPostRegistrationSetup(clubId, tournamentId, {
        number_of_pools: p ?? numPools,
        qualifiers_per_pool: q ?? qualifiersPerPool,
        bracket_type: b ?? bracketType,
      });
      setSetupData(res);
      if (res.selected_pools && !p) {
        setNumPools(res.selected_pools);
      }
      if (res.selected_qualifiers_per_pool && !q) {
        setQualifiersPerPool(res.selected_qualifiers_per_pool);
      }
      if (res.selected_bracket_type && !b) {
        setBracketType(res.selected_bracket_type as BracketType);
      }
    } catch (err) {
      console.warn('Failed to fetch pool play setup data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clubId && tournamentId) {
      void fetchSetup();
    }
  }, [clubId, tournamentId]);

  // Determine confirmed team count from API setupData or prop
  const confirmedTeams = setupData?.confirmed_teams_count ?? registeredCount;
  const hasMinTeams = confirmedTeams >= 4;
  const isGenerated = (setupData?.is_generated ?? false) || matchesCount > 0;

  // Maximum pools possible based on minimum 2 teams per pool
  const maxPools = hasMinTeams ? Math.max(2, Math.floor(confirmedTeams / 2)) : 2;
  const maxQualifiers = hasMinTeams ? Math.max(1, Math.floor(confirmedTeams / Math.max(1, numPools))) : 2;

  const handlePoolsChange = (nextPools: number) => {
    setNumPools(nextPools);
    // Auto-adjust qualifiers if it exceeds pool size
    const adjustedQualifiers = Math.min(qualifiersPerPool, Math.max(1, Math.floor(confirmedTeams / nextPools)));
    if (adjustedQualifiers !== qualifiersPerPool) {
      setQualifiersPerPool(adjustedQualifiers);
    }
    void fetchSetup(nextPools, adjustedQualifiers, bracketType);
  };

  const handleQualifiersChange = (nextQualifiers: number) => {
    setQualifiersPerPool(nextQualifiers);
    void fetchSetup(numPools, nextQualifiers, bracketType);
  };

  const handleBracketTypeChange = (nextType: string) => {
    setBracketType(nextType as BracketType);
    void fetchSetup(numPools, qualifiersPerPool, nextType);
  };

  // Save draft configuration
  const handleSave = () => {
    onSaveConfig({
      numPools,
      balanceTolerance: tolerance,
      qualifierCount: numPools * qualifiersPerPool,
      bracketType,
      numCourts,
    });
    setHasSaved(true);
    Alert.alert(
      'Configuration Saved',
      `Pool Play settings saved: ${numPools} pools, ${qualifiersPerPool} qualifiers per pool, and ${numCourts} courts.`
    );
    setTimeout(() => setHasSaved(false), 2500);
  };

  // Confirm and Generate Pools & Matches
  const handleConfirmAndGenerate = async () => {
    if (!canManage) return;

    if (!hasMinTeams) {
      Alert.alert(
        'Insufficient Confirmed Teams',
        `Pool Play requires at least 4 confirmed teams (currently ${confirmedTeams} confirmed). Please wait for teams to confirm registration before generating.`
      );
      return;
    }

    const executeGeneration = async () => {
      try {
        setGenerating(true);
        if (clubId && tournamentId) {
          await competitionApi.confirmAndGeneratePoolPlay(clubId, tournamentId, {
            number_of_pools: numPools,
            qualifiers_per_pool: qualifiersPerPool,
            bracket_type: bracketType,
          });
        }
        onSaveConfig({
          numPools,
          balanceTolerance: tolerance,
          qualifierCount: numPools * qualifiersPerPool,
          bracketType,
          numCourts,
        });
        Alert.alert(
          'Pools & Matches Generated',
          `Successfully configured ${numPools} pools and generated matches! The tournament is now Ready to Start.`
        );
        if (onGenerated) {
          await onGenerated();
        }
        await fetchSetup();
      } catch (err: unknown) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to generate pools & matches.');
      } finally {
        setGenerating(false);
      }
    };

    if (isGenerated) {
      Alert.alert(
        'Regenerate Pools & Matches?',
        'Matches have already been scheduled. Regenerating will rebuild the pool stage and championship bracket. Existing unplayed matchups will be recreated. Are you sure you want to proceed?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Regenerate', style: 'destructive', onPress: executeGeneration },
        ]
      );
    } else {
      await executeGeneration();
    }
  };

  const feasibleConfigs = setupData?.feasible_pool_configurations || [];

  return (
    <View style={styles.container}>
      {/* ─── Header Card ─────────────────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconCircle}>
            <SlidersHorizontal size={18} color="#0F766E" />
          </View>
          <View style={styles.headerTextWrap}>
            <AppText style={styles.cardTitle}>Pool Play Setup & Courts</AppText>
            <AppText style={styles.cardSubtitle}>
              The single configuration workspace for pools, rating balance, qualifiers, and courts.
            </AppText>
          </View>
        </View>
      </Card>

      {/* ─── A. Pool Distribution ────────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.sectionHeaderRow}>
          <LayoutGrid size={16} color="#0F766E" />
          <AppText style={styles.sectionTitle}>A. Pool Distribution</AppText>
        </View>

        {/* Confirmed Team Metric & Status */}
        <PostRegistrationMetrics
          metrics={[
            {
              label: 'CONFIRMED TEAMS',
              value: confirmedTeams,
            },
            {
              label: 'SELECTED POOLS',
              value: hasMinTeams ? numPools : '—',
            },
            {
              label: 'TEAMS / POOL',
              value: hasMinTeams ? Math.ceil(confirmedTeams / numPools) : '—',
            },
          ]}
        />

        {!hasMinTeams ? (
          <PostRegistrationNotice
            variant="warning"
            title="Waiting for confirmed teams"
            message={`At least 4 confirmed teams are required to configure Pool Play (currently ${confirmedTeams} confirmed). Registration must have at least 4 confirmed teams to partition into 2 or more balanced pools.`}
          />
        ) : (
          <>
            {setupData?.recommendation_reason ? (
              <PostRegistrationNotice
                variant="info"
                title="Recommendation"
                message={setupData.recommendation_reason}
              />
            ) : null}

            {feasibleConfigs.length > 0 ? (
              <PostRegistrationChoiceChips
                label="Balanced Pool Presets:"
                options={feasibleConfigs.map((cfg: any) => ({
                  label: `${cfg.number_of_pools} Pools`,
                  value: String(cfg.number_of_pools),
                  subLabel: `${cfg.teams_per_pool_label} teams/pool`,
                }))}
                selectedValue={String(numPools)}
                onSelect={(val) => handlePoolsChange(parseInt(val, 10))}
              />
            ) : null}

            <PostRegistrationStepper
              label="Number of Pools"
              helperText={`Minimum 2 teams per pool (Max ${maxPools} pools)`}
              value={numPools}
              unit="pools"
              min={2}
              max={maxPools}
              onChange={handlePoolsChange}
            />

            {/* Simple Pool Distribution Preview */}
            <View style={styles.previewBox}>
              <AppText style={styles.previewTitle}>Pool Distribution Preview:</AppText>
              <View style={styles.previewGrid}>
                {Array.from({ length: numPools }, (_, i) => {
                  const poolLetter = String.fromCharCode(65 + i);
                  const baseSize = Math.floor(confirmedTeams / numPools);
                  const remainder = confirmedTeams % numPools;
                  const poolSize = baseSize + (i < remainder ? 1 : 0);
                  return (
                    <View key={poolLetter} style={styles.previewPoolPill}>
                      <AppText style={styles.previewPoolLetter}>Pool {poolLetter}</AppText>
                      <AppText style={styles.previewPoolCount}>{poolSize} teams</AppText>
                    </View>
                  );
                })}
              </View>
            </View>
          </>
        )}
      </Card>

      {/* ─── B. Pool Balance ─────────────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.sectionHeaderRow}>
          <Scale size={16} color="#0F766E" />
          <AppText style={styles.sectionTitle}>B. Pool Balance Tolerance</AppText>
        </View>
        <AppText style={styles.sectionSubtitle}>
          Maximum allowed difference in average DUPR/rating between pools.
        </AppText>

        <View style={styles.optionsList}>
          {TOLERANCE_OPTIONS.map((opt) => {
            const isSelected = tolerance === opt.value;
            const subtitleText =
              opt.value === 0.3
                ? 'Strict parity (±0.30 max diff between pools)'
                : opt.value === 0.5
                ? 'Fair division parity (recommended for club play)'
                : opt.value === 0.75
                ? 'Relaxed parity (accommodates wider rating variance)'
                : 'Wide tolerance (permits any rating difference)';

            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => canManage && setTolerance(opt.value)}
                style={[styles.toleranceOptionRow, isSelected && styles.toleranceOptionActive]}
                activeOpacity={0.8}
              >
                <View style={styles.radioOuter}>
                  {isSelected && <View style={styles.radioInner} />}
                </View>
                <View style={styles.toleranceTextCol}>
                  <View style={styles.toleranceTitleRow}>
                    <AppText style={[styles.toleranceTitle, isSelected && styles.toleranceTitleActive]}>
                      {opt.label}
                    </AppText>
                    {opt.value === 0.5 ? (
                      <View style={styles.recommendedBadge}>
                        <AppText style={styles.recommendedBadgeText}>DEFAULT</AppText>
                      </View>
                    ) : null}
                  </View>
                  <AppText style={styles.toleranceSubtitle}>{subtitleText}</AppText>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      {/* ─── C. Championship Qualification ───────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.sectionHeaderRow}>
          <Trophy size={16} color="#0F766E" />
          <AppText style={styles.sectionTitle}>C. Championship Qualification</AppText>
        </View>

        <PostRegistrationStepper
          label="Qualifiers Per Pool"
          helperText={`Top teams advancing from each pool (${numPools * qualifiersPerPool} total qualifiers)`}
          value={qualifiersPerPool}
          unit="per pool"
          min={1}
          max={maxQualifiers}
          disabled={!hasMinTeams}
          onChange={handleQualifiersChange}
        />

        <View style={styles.bracketTypeWrap}>
          <PostRegistrationChoiceChips
            label="Playoff Bracket Type:"
            options={['Single Elimination', 'Double Elimination']}
            selectedValue={bracketType}
            onSelect={handleBracketTypeChange}
          />
        </View>

        <View style={styles.qualificationSummaryBox}>
          <Info size={14} color="#0F766E" />
          <AppText style={styles.qualificationSummaryText}>
            Top {qualifiersPerPool} team(s) from each of the {numPools} pools ({numPools * qualifiersPerPool} total) advance to the {bracketType} Championship Bracket.
          </AppText>
        </View>
      </Card>

      {/* ─── D. Court Assignment ─────────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.sectionHeaderRow}>
          <LayoutGrid size={16} color="#0F766E" />
          <AppText style={styles.sectionTitle}>D. Court Assignment</AppText>
        </View>
        <AppText style={styles.sectionSubtitle}>
          Concurrent court capacity for pool matches. Matches rotate across available courts.
        </AppText>

        <PostRegistrationStepper
          label="Concurrent Court Capacity"
          helperText="Simultaneous matches supported during pool stages"
          value={numCourts}
          unit="courts"
          min={1}
          max={16}
          onChange={setNumCourts}
        />

        <View style={styles.clubCourtsSection}>
          <AppText style={styles.clubCourtsTitle}>
            Active Club Courts at {clubName || 'Club'} ({clubCourts?.length || 0})
          </AppText>
          {(!clubCourts || clubCourts.length === 0) ? (
            <View style={styles.emptyCourtsBox}>
              <AppText style={styles.emptyCourtsText}>No physical courts configured for this facility.</AppText>
            </View>
          ) : (
            <View style={styles.courtsGrid}>
              {clubCourts.map((court) => {
                const courtName = court.display_name || court.name;
                const surface = court.surface_type ? ` • ${court.surface_type}` : '';
                return (
                  <View key={court.id} style={styles.clubCourtPill}>
                    <View style={styles.clubCourtPillDot} />
                    <AppText style={styles.clubCourtPillText} numberOfLines={1}>
                      {courtName}{surface}
                    </AppText>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </Card>

      {/* ─── Primary Action: Confirm & Generate Pools & Matches ─────────── */}
      {canManage && (
        <View style={styles.bottomActionsWrap}>
          <Button
            label={
              generating
                ? 'Generating Pools & Matches...'
                : isGenerated
                ? 'Regenerate Pools & Matches'
                : 'Confirm & Generate Pools & Matches'
            }
            onPress={handleConfirmAndGenerate}
            disabled={!hasMinTeams || generating}
            loading={generating}
            variant="primary"
            style={styles.primaryActionBtn}
          />

          <TouchableOpacity style={styles.secondarySaveBtn} onPress={handleSave} activeOpacity={0.7}>
            <AppText style={styles.secondarySaveText}>
              {hasSaved ? '✓ Configuration Saved' : 'Save Configuration Draft'}
            </AppText>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[8],
    gap: Spacing[3.5],
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: Spacing[3],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#DEF2E6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
    marginTop: 2,
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
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
    marginTop: -Spacing[1],
  },
  previewBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.md,
    padding: Spacing[2.5],
    gap: Spacing[2],
  },
  previewTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  previewPoolPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: Radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    minWidth: 72,
  },
  previewPoolLetter: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
  },
  previewPoolCount: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  optionsList: {
    gap: Spacing[2],
  },
  toleranceOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.md,
    paddingVertical: Spacing[2.5],
    paddingHorizontal: Spacing[3],
    gap: Spacing[2.5],
  },
  toleranceOptionActive: {
    backgroundColor: '#F0FDFA',
    borderColor: '#0F766E',
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#0F766E',
  },
  toleranceTextCol: {
    flex: 1,
    minWidth: 0,
  },
  toleranceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  toleranceTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  toleranceTitleActive: {
    color: '#0F766E',
    fontWeight: '700',
  },
  recommendedBadge: {
    backgroundColor: '#DEF2E6',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  recommendedBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0F766E',
  },
  toleranceSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
    lineHeight: 15,
  },
  bracketTypeWrap: {
    marginTop: Spacing[1],
  },
  qualificationSummaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    borderRadius: Radius.md,
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
  },
  qualificationSummaryText: {
    fontSize: 11.5,
    color: '#0F766E',
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },
  clubCourtsSection: {
    marginTop: Spacing[1],
    gap: Spacing[1.5],
  },
  clubCourtsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  emptyCourtsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: Spacing[2.5],
  },
  emptyCourtsText: {
    fontSize: 11.5,
    color: '#64748B',
  },
  courtsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[1.5],
  },
  clubCourtPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  clubCourtPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  clubCourtPillText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '500',
  },
  bottomActionsWrap: {
    gap: Spacing[2],
    marginTop: Spacing[1],
  },
  primaryActionBtn: {
    width: '100%',
  },
  secondarySaveBtn: {
    alignItems: 'center',
    paddingVertical: Spacing[2],
  },
  secondarySaveText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
});
