/**
 * Aught2 Pickleball — PoolPlayPostRegistrationCard
 *
 * Post-Registration Configuration & Preview card for Pool Play Tournaments:
 * - Rendered after registration closes and before tournament begins.
 * - Displays confirmed team count and pool recommendations.
 * - Allows Tournament Director to configure pool count, qualifiers per pool, and playoff bracket type.
 * - Displays live pool allocation preview (serpentine distribution of actual confirmed teams).
 * - Displays qualification structure preview (total bracket size, advancing slots).
 * - Validates pool balance and team assignment before generation.
 * - Confirms configuration and generates pools, matches, and championship bracket.
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
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  Layers,
  Minus,
  Plus,
  Sliders,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { competitionApi } from '@/services/api/competition';
import { Colors, Radius, Spacing } from '@/theme';
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
          <AppText style={styles.loadingText}>Calculating registered teams and optimal pool recommendations...</AppText>
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

  return (
    <Card style={styles.card}>
      {/* ─── 1. Header ──────────────────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <View style={styles.iconCircle}>
            <Layers size={18} color="#0F766E" />
          </View>
          <View>
            <AppText style={styles.cardTitle}>Post-Registration Pool Play Setup</AppText>
            <AppText style={styles.cardSubtitle}>
              {isReadyToStart
                ? 'Pools & matches generated • Verified and ready to start'
                : 'Registration closed • Configure pools, qualifiers, and championship bracket'}
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

      {/* ─── 2. Confirmed Teams & Validation ─────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Users size={16} color="#0F766E" />
          <AppText style={styles.sectionTitle}>Confirmed Registered Teams</AppText>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricCard}>
            <AppText style={styles.metricNum}>{teamsCount}</AppText>
            <AppText style={styles.metricLabel}>Confirmed Teams</AppText>
          </View>
          <View style={styles.metricCard}>
            <AppText style={styles.metricNum}>{numPools}</AppText>
            <AppText style={styles.metricLabel}>Preliminary Pools</AppText>
          </View>
          <View style={styles.metricCard}>
            <AppText style={styles.metricNum}>{numPools * qualifiers}</AppText>
            <AppText style={styles.metricLabel}>Playoff Qualifiers</AppText>
          </View>
        </View>

        {/* Validation / Status Notice */}
        <View
          style={[
            styles.noticeBox,
            !isValid ? styles.noticeBoxWarning : styles.noticeBoxSuccess,
          ]}
        >
          {!isValid ? (
            <AlertTriangle size={18} color="#D97706" style={{ marginTop: 2 }} />
          ) : (
            <CheckCircle2 size={18} color="#0F766E" style={{ marginTop: 2 }} />
          )}
          <View style={{ flex: 1 }}>
            <AppText style={styles.noticeTitle}>
              {!isValid ? 'Pool Balance & Feasibility Constraint' : 'Pool Play Structure Verified'}
            </AppText>
            <AppText style={styles.noticeText}>
              {setupData?.validation_error ||
                `All ${teamsCount} confirmed teams assigned across ${numPools} balanced pools.`}
            </AppText>
          </View>
        </View>
      </View>

      <View style={styles.divider} />

      {/* ─── 3. Pool Recommendation & Pool Count Selection ─────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Sparkles size={16} color="#0F766E" />
          <AppText style={styles.sectionTitle}>Pool Count & Distribution</AppText>
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

        {feasiblePoolConfigs.length > 0 ? (
          <View style={styles.poolsOptionsGrid}>
            <AppText style={styles.adjusterLabel}>Choose Number of Pools:</AppText>
            <View style={styles.chipsRow}>
              {feasiblePoolConfigs.map((cfg: any) => {
                const isSelected = numPools === cfg.number_of_pools;
                return (
                  <TouchableOpacity
                    key={cfg.number_of_pools}
                    style={[styles.poolChoiceChip, isSelected && styles.poolChoiceChipActive]}
                    onPress={() => !isGenerated && handlePoolsChange(cfg.number_of_pools)}
                    disabled={isGenerated}
                  >
                    <AppText style={[styles.poolChoiceTitle, isSelected && styles.poolChoiceTitleActive]}>
                      {cfg.number_of_pools} Pools
                    </AppText>
                    <AppText style={[styles.poolChoiceSub, isSelected && styles.poolChoiceSubActive]}>
                      {cfg.teams_per_pool_label} teams/pool
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={styles.adjusterRow}>
            <AppText style={styles.adjusterLabel}>Number of Pools:</AppText>
            <View style={styles.counterWrap}>
              <TouchableOpacity
                style={[styles.counterBtn, (numPools <= 2 || isGenerated) && styles.counterBtnDisabled]}
                onPress={() => handlePoolsChange(numPools - 1)}
                disabled={numPools <= 2 || isGenerated}
              >
                <Minus size={16} color={numPools <= 2 || isGenerated ? '#94A3B8' : '#0F766E'} />
              </TouchableOpacity>
              <View style={styles.counterValueBox}>
                <AppText style={styles.counterValue}>{numPools}</AppText>
                <AppText style={styles.counterSub}>pools</AppText>
              </View>
              <TouchableOpacity
                style={[styles.counterBtn, (numPools >= Math.max(2, Math.floor(teamsCount / 2)) || isGenerated) && styles.counterBtnDisabled]}
                onPress={() => handlePoolsChange(numPools + 1)}
                disabled={numPools >= Math.max(2, Math.floor(teamsCount / 2)) || isGenerated}
              >
                <Plus size={16} color={numPools >= Math.max(2, Math.floor(teamsCount / 2)) || isGenerated ? '#94A3B8' : '#0F766E'} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <View style={styles.divider} />

      {/* ─── 4. Qualifiers & Championship Bracket Selection ───────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Trophy size={16} color="#0F766E" />
          <AppText style={styles.sectionTitle}>Advancement & Championship Bracket</AppText>
        </View>

        <View style={styles.adjusterRow}>
          <AppText style={styles.adjusterLabel}>Qualifiers Per Pool:</AppText>
          <View style={styles.counterWrap}>
            <TouchableOpacity
              style={[styles.counterBtn, (qualifiers <= 1 || isGenerated) && styles.counterBtnDisabled]}
              onPress={() => handleQualifiersChange(qualifiers - 1)}
              disabled={qualifiers <= 1 || isGenerated}
            >
              <Minus size={16} color={qualifiers <= 1 || isGenerated ? '#94A3B8' : '#0F766E'} />
            </TouchableOpacity>
            <View style={styles.counterValueBox}>
              <AppText style={styles.counterValue}>{qualifiers}</AppText>
              <AppText style={styles.counterSub}>per pool</AppText>
            </View>
            <TouchableOpacity
              style={[styles.counterBtn, (qualifiers >= Math.floor(teamsCount / numPools) || isGenerated) && styles.counterBtnDisabled]}
              onPress={() => handleQualifiersChange(qualifiers + 1)}
              disabled={qualifiers >= Math.floor(teamsCount / numPools) || isGenerated}
            >
              <Plus size={16} color={qualifiers >= Math.floor(teamsCount / numPools) || isGenerated ? '#94A3B8' : '#0F766E'} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ marginTop: Spacing[2] }}>
          <AppText style={styles.adjusterLabel}>Playoff Bracket Type:</AppText>
          <View style={styles.chipsRow}>
            {['Single Elimination', 'Double Elimination'].map((bType) => {
              const isSelected = bracketType === bType;
              return (
                <TouchableOpacity
                  key={bType}
                  style={[styles.chip, isSelected && styles.chipActive]}
                  onPress={() => !isGenerated && handleBracketTypeChange(bType)}
                  disabled={isGenerated}
                >
                  <AppText style={[styles.chipText, isSelected && styles.chipTextActive]}>
                    {bType}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {/* ─── 5. Pool Allocation Preview Accordion ───────────────────────────────── */}
      {setupData?.preview_pools && setupData.preview_pools.length > 0 && (
        <>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.previewToggle}
            onPress={() => setShowPreview(!showPreview)}
            activeOpacity={0.7}
          >
            <View style={styles.sectionHeaderRow}>
              <Layers size={16} color="#0F766E" />
              <AppText style={styles.sectionTitle}>
                Pool Allocation Preview ({setupData.preview_pools.length} Pools)
              </AppText>
            </View>
            {showPreview ? <ChevronUp size={18} color="#64748B" /> : <ChevronDown size={18} color="#64748B" />}
          </TouchableOpacity>

          {showPreview && (
            <View style={styles.previewContainer}>
              <AppText style={styles.previewSummaryText}>
                {setupData.preview_qualification_summary}
              </AppText>
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
                        <AppText style={styles.previewTeamName}>{t.name}</AppText>
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

      {/* ─── 6. Action Controls ──────────────────────────────────────────────── */}
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
              Pool Play is configured across {numPools} pools and {numPools * qualifiers} qualifiers.
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
  poolsOptionsGrid: {
    gap: Spacing[2],
    marginTop: Spacing[1],
  },
  adjusterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing[1],
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
  poolChoiceChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  poolChoiceChipActive: {
    backgroundColor: '#DEF2E6',
    borderColor: '#0F766E',
  },
  poolChoiceTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  poolChoiceTitleActive: {
    color: '#0F766E',
    fontWeight: '800',
  },
  poolChoiceSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  poolChoiceSubActive: {
    color: '#134E4A',
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
  previewSummaryText: {
    fontSize: 12,
    color: '#0F766E',
    fontWeight: '600',
  },
  poolsGrid: {
    gap: Spacing[2],
  },
  previewPoolBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: Spacing[2],
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
    width: 24,
  },
  previewTeamName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1E293B',
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
