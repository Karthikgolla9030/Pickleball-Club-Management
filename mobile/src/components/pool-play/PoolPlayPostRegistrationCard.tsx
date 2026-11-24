/**
 * Aught2 Pickleball — PoolPlayPostRegistrationCard
 *
 * Post-Registration Configuration & Preview card for Pool Play Tournaments:
 * - Rendered after registration closes and before tournament begins.
 * - Displays confirmed team count, preliminary pools, and playoff qualifiers.
 * - Allows Tournament Director to configure pool count, qualifiers per pool, and playoff bracket type.
 * - Displays live pool allocation preview (serpentine distribution of actual confirmed teams).
 * - Displays qualification structure preview (total bracket size, advancing slots).
 * - Validates pool balance and team assignment before generation.
 * - Confirms configuration and generates pools, matches, and championship bracket.
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
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Layers,
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
import type { Tournament } from '@/types';

interface PoolPlayPostRegistrationCardProps {
  clubId: string;
  tournamentId: string;
  tournament: Tournament;
  canManage: boolean;
  onGenerated: () => void | Promise<void>;
  onStartTournament?: () => void | Promise<void>;
  isStartingTournament?: boolean;
}

export function PoolPlayPostRegistrationCard({
  clubId,
  tournamentId,
  tournament,
  canManage,
  onGenerated,
  onStartTournament,
  isStartingTournament = false,
}: PoolPlayPostRegistrationCardProps) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [setupData, setSetupData] = useState<any>(null);
  const [numPools, setNumPools] = useState<number>(2);
  const [qualifiers, setQualifiers] = useState<number>(2);
  const [bracketType, setBracketType] = useState<string>('Single Elimination');
  const [showPreview, setShowPreview] = useState(false);

  const fetchSetup = async (p?: number, q?: number, b?: string) => {
    try {
      setLoading(true);
      const res = await competitionApi.getPoolPlayPostRegistrationSetup(clubId, tournamentId, {
        number_of_pools: p ?? numPools,
        qualifiers_per_pool: q ?? qualifiers,
        bracket_type: b ?? bracketType,
      });
      setSetupData(res);
      if (res.selected_pools && !p) {
        setNumPools(res.selected_pools);
      }
      if (res.selected_qualifiers_per_pool && !q) {
        setQualifiers(res.selected_qualifiers_per_pool);
      }
      if (res.selected_bracket_type && !b) {
        setBracketType(res.selected_bracket_type);
      }
    } catch (err) {
      console.warn('Failed to fetch pool play post-registration setup:', err);
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

  const handlePoolsChange = (p: number) => {
    setNumPools(p);
    void fetchSetup(p, qualifiers, bracketType);
  };

  const handleQualifiersChange = (q: number) => {
    setQualifiers(q);
    void fetchSetup(numPools, q, bracketType);
  };

  const handleBracketTypeChange = (b: string) => {
    setBracketType(b);
    void fetchSetup(numPools, qualifiers, b);
  };

  const handleConfirmAndGenerate = async () => {
    if (!canManage) return;
    try {
      setGenerating(true);
      await competitionApi.confirmAndGeneratePoolPlay(clubId, tournamentId, {
        number_of_pools: numPools,
        qualifiers_per_pool: qualifiers,
        bracket_type: bracketType,
      });
      Alert.alert(
        'Pools & Matches Generated',
        `Successfully configured ${numPools} pools and generated matches! The tournament is now Ready to Start.`
      );
      await fetchSetup();
      await onGenerated();
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to generate pools & matches.');
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
            Calculating registered teams and optimal pool recommendations...
          </AppText>
        </View>
      </Card>
    );
  }

  const isGenerated = setupData?.is_generated ?? false;
  const isValid = setupData?.is_configuration_valid ?? true;
  const teamsCount = setupData?.confirmed_teams_count ?? 0;
  const stage = setupData?.configuration_stage ?? 'awaiting_format_configuration';
  const isReadyToStart = isGenerated && stage === 'ready_to_start';
  const feasiblePoolConfigs = setupData?.feasible_pool_configurations || [];

  const maxPoolsPossible = Math.max(2, Math.floor(teamsCount / 2));
  const maxQualifiersPossible = Math.max(1, Math.floor(teamsCount / Math.max(1, numPools)));

  return (
    <Card style={styles.card}>
      {/* ─── 1. Standardized Responsive Header ───────────────────────────────── */}
      <PostRegistrationHeader
        icon={<Layers size={18} color="#0F766E" />}
        title="Post-Registration Pool Play Setup"
        subtitle={
          isReadyToStart
            ? 'Pools & matches generated • Verified and ready to start'
            : isGenerated
            ? 'Schedule generated • Pool distribution active'
            : 'Registration closed • Configure pools, qualifiers, and championship bracket'
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

      {/* ─── 2. Confirmed Teams & Balanced Metrics ───────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Users size={15} color="#0F766E" />
          <AppText style={styles.sectionTitle}>Confirmed Registered Teams</AppText>
        </View>

        <PostRegistrationMetrics
          metrics={[
            {
              label: 'CONFIRMED TEAMS',
              value: teamsCount,
            },
            {
              label: 'PRELIMINARY POOLS',
              value: numPools,
            },
            {
              label: 'PLAYOFF QUALIFIERS',
              value: numPools * qualifiers,
            },
          ]}
        />

        {/* Validation / Feasibility Status Notice */}
        <PostRegistrationNotice
          variant={isValid ? 'success' : 'warning'}
          title={isValid ? 'Pool Play Structure Verified' : 'Pool Balance & Feasibility Constraint'}
          message={
            setupData?.validation_error ||
            `All ${teamsCount} confirmed teams assigned across ${numPools} balanced pools.`
          }
        />
      </View>

      <View style={styles.divider} />

      {/* ─── 3. Pool Recommendation & Number of Pools Stepper ─────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Sparkles size={15} color="#0F766E" />
          <AppText style={styles.sectionTitle}>Pool Count & Distribution</AppText>
        </View>

        {setupData?.recommendation_reason ? (
          <PostRegistrationNotice
            variant="info"
            title="Recommendation"
            message={setupData.recommendation_reason}
          />
        ) : null}

        {feasiblePoolConfigs.length > 0 ? (
          <View style={styles.presetOptionsBox}>
            <PostRegistrationChoiceChips
              label="Select Balanced Pool Preset:"
              options={feasiblePoolConfigs.map((cfg: any) => ({
                label: `${cfg.number_of_pools} Pools`,
                value: String(cfg.number_of_pools),
                subLabel: `${cfg.teams_per_pool_label} teams/pool`,
              }))}
              selectedValue={String(numPools)}
              disabled={isGenerated}
              onSelect={(val) => handlePoolsChange(parseInt(val, 10))}
            />
          </View>
        ) : null}

        <PostRegistrationStepper
          label="Number of Pools"
          helperText={`Minimum 2 teams per pool (Max ${maxPoolsPossible} pools)`}
          value={numPools}
          unit="pools"
          min={2}
          max={maxPoolsPossible}
          disabled={isGenerated}
          onChange={handlePoolsChange}
        />
      </View>

      <View style={styles.divider} />

      {/* ─── 4. Qualifiers Per Pool & Championship Bracket ───────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Trophy size={15} color="#0F766E" />
          <AppText style={styles.sectionTitle}>Advancement & Championship Bracket</AppText>
        </View>

        <PostRegistrationStepper
          label="Qualifiers Per Pool"
          helperText={`Top teams advancing to playoff bracket (${numPools * qualifiers} total qualifiers)`}
          value={qualifiers}
          unit="per pool"
          min={1}
          max={maxQualifiersPossible}
          disabled={isGenerated}
          onChange={handleQualifiersChange}
        />

        <View style={styles.bracketChoiceWrap}>
          <PostRegistrationChoiceChips
            label="Playoff Bracket Type:"
            options={['Single Elimination', 'Double Elimination']}
            selectedValue={bracketType}
            disabled={isGenerated}
            onSelect={handleBracketTypeChange}
          />
        </View>
      </View>

      {/* ─── 5. Pool Allocation Preview Accordion ───────────────────────────── */}
      {setupData?.preview_pools && setupData.preview_pools.length > 0 && (
        <>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.previewToggle}
            onPress={() => setShowPreview(!showPreview)}
            activeOpacity={0.7}
          >
            <View style={styles.sectionHeaderRow}>
              <Layers size={15} color="#0F766E" />
              <AppText style={styles.sectionTitle}>
                Pool Allocation Preview ({setupData.preview_pools.length} Pools)
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
              {setupData.preview_qualification_summary ? (
                <AppText style={styles.previewSummaryText}>
                  {setupData.preview_qualification_summary}
                </AppText>
              ) : null}
              <View style={styles.poolsGrid}>
                {setupData.preview_pools.map((p: any) => (
                  <View key={p.pool_name} style={styles.previewPoolBox}>
                    <View style={styles.previewPoolHeader}>
                      <AppText style={styles.previewPoolTitle}>{p.pool_name}</AppText>
                      <AppText style={styles.previewPoolCount}>{p.teams_count} teams</AppText>
                    </View>
                    {p.teams.map((t: any, idx: number) => (
                      <View key={t.id || idx} style={styles.previewTeamRow}>
                        <AppText style={styles.previewTeamSeed}>#{t.seed ?? idx + 1}</AppText>
                        <AppText style={styles.previewTeamName} numberOfLines={1}>
                          {t.name}
                        </AppText>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          )}
        </>
      )}

      <View style={styles.divider} />

      {/* ─── 6. Primary Action Controls ──────────────────────────────────────── */}
      <View style={styles.actionsRow}>
        {!isGenerated ? (
          <Button
            label={generating ? 'Generating Pools & Matches...' : 'Confirm & Generate Pools & Matches'}
            onPress={handleConfirmAndGenerate}
            disabled={!isValid || generating || !canManage}
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
              Pool Play configured: {numPools} pools • {numPools * qualifiers} qualifiers advancing.
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
  presetOptionsBox: {
    marginBottom: Spacing[1],
  },
  bracketChoiceWrap: {
    marginTop: Spacing[1],
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
  previewSummaryText: {
    fontSize: 12,
    color: '#0F766E',
    fontWeight: '600',
    lineHeight: 16,
  },
  poolsGrid: {
    gap: Spacing[2],
  },
  previewPoolBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: Spacing[2.5],
    gap: Spacing[1],
  },
  previewPoolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  previewPoolTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F766E',
  },
  previewPoolCount: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  previewTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingVertical: 2,
  },
  previewTeamSeed: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    width: 26,
  },
  previewTeamName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1E293B',
    flex: 1,
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
