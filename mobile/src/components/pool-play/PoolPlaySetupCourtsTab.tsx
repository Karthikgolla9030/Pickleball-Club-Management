/**
 * Aught2 Pickleball — PoolPlaySetupCourtsTab
 *
 * Clean, mobile-first Pool Play setup following the standardized lifecycle:
 * - Stage 1-3: Registration closure notice & confirmed count readiness
 * - Stage 4: Pool distribution presets + stepper, balance tolerance, qualifiers
 *   (strict singular/plural grammar + balanced arbitrary N pools), active court
 *   multi-select + bounded concurrent court capacity (`<= selectedCourtIds.length`)
 * - Stage 5: Real backend-verified Save Configuration -> Saved / Edit Configuration
 * - Stage 6: Generate Pools & Matches gated on backend-saved valid configuration
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { Layers, Scale, SlidersHorizontal, Trophy } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import {
  PostRegistrationChoiceChips,
  PostRegistrationCourtSelector,
  PostRegistrationHeader,
  PostRegistrationMetrics,
  PostRegistrationNotice,
  PostRegistrationSaveActionBar,
  PostRegistrationStepper,
} from '@/components/post-registration';
import { competitionApi } from '@/services/api/competition';
import { Radius, Spacing } from '@/theme';
import type { Court, SetupCourtItem, Tournament } from '@/types';
import type { BracketType, PoolPlayConfig } from '@/types/poolPlay';

export interface PoolPlaySetupCourtsTabProps {
  clubId?: string | null;
  tournamentId?: string | null;
  tournament?: Tournament | null;
  config: PoolPlayConfig;
  onSaveConfig: (next: Partial<PoolPlayConfig>) => Promise<void> | void;
  canManage: boolean;
  registeredCount: number;
  maxParticipants?: number | null;
  clubCourts?: Court[];
  clubName?: string;
  onGenerated?: () => Promise<void> | void;
  matchesCount?: number;
}

const TOLERANCE_OPTIONS = [
  { value: '0.3', label: '±0.30', subtitle: 'Strict parity' },
  { value: '0.5', label: '±0.50 Fair', subtitle: 'Default' },
  { value: '0.75', label: '±0.75', subtitle: 'Relaxed' },
  { value: '1', label: '±1.00', subtitle: 'Wide' },
];

const BRACKET_TYPES: BracketType[] = ['Single Elimination', 'Double Elimination'];

export function PoolPlaySetupCourtsTab({
  clubId,
  tournamentId,
  tournament,
  config,
  onSaveConfig,
  canManage,
  registeredCount,
  clubCourts = [],
  clubName,
  onGenerated,
  matchesCount = 0,
}: PoolPlaySetupCourtsTabProps) {
  const [setupData, setSetupData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [numPools, setNumPools] = useState<number>(config.numPools || 2);
  const [qualifiersPerPool, setQualifiersPerPool] = useState<number>(
    Math.max(1, Math.floor((config.qualifierCount || 2) / Math.max(1, config.numPools || 2)))
  );
  const [bracketType, setBracketType] = useState<BracketType>(
    config.bracketType || 'Single Elimination'
  );
  const [tolerance, setTolerance] = useState<number>(config.balanceTolerance ?? 0.5);
  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>([]);
  const [numCourts, setNumCourts] = useState<number>(0);

  const [savedSnapshot, setSavedSnapshot] = useState<{
    numPools: number;
    qualifiersPerPool: number;
    bracketType: string;
    tolerance: number;
    courtIdsKey: string;
    numCourts: number;
  } | null>(null);

  const fetchSetup = async (p?: number, q?: number, b?: string) => {
    if (!clubId || !tournamentId) return;
    try {
      setLoading(true);
      const res = await competitionApi.getPoolPlayPostRegistrationSetup(clubId, tournamentId, {
        number_of_pools: p,
        qualifiers_per_pool: q,
        bracket_type: b,
      });
      setSetupData(res);
      if (!p) {
        const nextPools = res.selected_pools || config.numPools || 2;
        const nextQuals = res.selected_qualifiers_per_pool || 1;
        const nextBracket = (res.selected_bracket_type || 'Single Elimination') as BracketType;
        const nextTol =
          typeof res.balance_tolerance === 'number' ? res.balance_tolerance : 0.5;
        const nextCourtIds: string[] = Array.isArray(res.selected_court_ids)
          ? res.selected_court_ids
          : clubCourts.filter((c) => c.is_active).map((c) => c.id);
        const nextCourtsCount =
          nextCourtIds.length > 0
            ? Math.max(1, Math.min(res.courts_count || nextCourtIds.length, nextCourtIds.length))
            : 0;

        setNumPools(nextPools);
        setQualifiersPerPool(nextQuals);
        setBracketType(nextBracket);
        setTolerance(nextTol);
        setSelectedCourtIds(nextCourtIds);
        setNumCourts(nextCourtsCount);

        if (res.configuration_saved) {
          setSavedSnapshot({
            numPools: nextPools,
            qualifiersPerPool: nextQuals,
            bracketType: nextBracket,
            tolerance: nextTol,
            courtIdsKey: [...nextCourtIds].sort().join(','),
            numCourts: nextCourtsCount,
          });
          setIsEditing(false);
        } else {
          setSavedSnapshot(null);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch pool play setup:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clubId && tournamentId) {
      void fetchSetup();
    }
  }, [clubId, tournamentId, tournament?.status, tournament?.participant_count]);

  const confirmedTeams: number = setupData?.confirmed_teams_count ?? registeredCount;
  const hasMinTeams = confirmedTeams >= 4;
  const isDraft = tournament?.status === 'draft';
  const isRegistrationOpen = tournament?.status === 'registration_open';
  const isGenerated = (setupData?.is_generated ?? false) || matchesCount > 0;
  const configurationSaved = Boolean(setupData?.configuration_saved);

  const availableCourts: SetupCourtItem[] =
    setupData?.available_courts && setupData.available_courts.length > 0
      ? setupData.available_courts
      : clubCourts
          .filter((c) => c.is_active)
          .map((c) => ({
            id: c.id,
            name: c.display_name || c.name,
            court_number: c.court_number,
            surface_type: c.surface_type,
            indoor_outdoor: c.indoor_outdoor,
            is_active: c.is_active,
          }));
  const activeCourtsCount = availableCourts.filter((c) => c.is_active).length;

  const maxPools = hasMinTeams ? Math.max(2, Math.floor(confirmedTeams / 2)) : 2;
  const safeNumPools = Math.max(2, Math.min(numPools, maxPools));
  const minPoolSize = hasMinTeams ? Math.floor(confirmedTeams / safeNumPools) : 2;
  const maxQualifiers = hasMinTeams ? Math.max(1, minPoolSize) : 2;
  const safeQualifiers = Math.max(1, Math.min(qualifiersPerPool, maxQualifiers));
  const totalQualifiers = safeNumPools * safeQualifiers;

  const currentCourtKey = [...selectedCourtIds].sort().join(',');
  const isDirty = savedSnapshot
    ? savedSnapshot.numPools !== safeNumPools ||
      savedSnapshot.qualifiersPerPool !== safeQualifiers ||
      savedSnapshot.bracketType !== bracketType ||
      savedSnapshot.tolerance !== tolerance ||
      savedSnapshot.courtIdsKey !== currentCourtKey ||
      savedSnapshot.numCourts !== numCourts
    : true;

  const configValid = Boolean(setupData?.is_configuration_valid ?? hasMinTeams);
  const courtsValid =
    activeCourtsCount > 0 &&
    selectedCourtIds.length > 0 &&
    numCourts >= 1 &&
    numCourts <= selectedCourtIds.length;
  const isValid = hasMinTeams && configValid && courtsValid;

  const disabledControls = !canManage || (configurationSaved && !isEditing);

  const handlePoolsChange = (nextPools: number) => {
    setNumPools(nextPools);
    const nextMinSize = Math.max(1, Math.floor(confirmedTeams / Math.max(1, nextPools)));
    const adjustedQual = Math.min(qualifiersPerPool, nextMinSize);
    if (adjustedQual !== qualifiersPerPool) {
      setQualifiersPerPool(adjustedQual);
    }
    void fetchSetup(nextPools, adjustedQual, bracketType);
  };

  const handleQualifiersChange = (nextQual: number) => {
    setQualifiersPerPool(nextQual);
    void fetchSetup(safeNumPools, nextQual, bracketType);
  };

  const handleBracketTypeChange = (nextType: string) => {
    setBracketType(nextType as BracketType);
    void fetchSetup(safeNumPools, safeQualifiers, nextType);
  };

  const handleToggleCourt = (courtId: string) => {
    setSelectedCourtIds((prev) => {
      const exists = prev.includes(courtId);
      const next = exists ? prev.filter((id) => id !== courtId) : [...prev, courtId];
      if (next.length > 0) {
        setNumCourts((curr) => Math.max(1, Math.min(curr || next.length, next.length)));
      } else {
        setNumCourts(0);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!canManage || !clubId || !tournamentId || !isValid) return;
    try {
      setSaving(true);
      const res = await competitionApi.saveTournamentConfiguration(clubId, tournamentId, {
        number_of_pools: safeNumPools,
        qualifiers_per_pool: safeQualifiers,
        balance_tolerance: tolerance,
        bracket_type: bracketType,
        selected_court_ids: selectedCourtIds,
        courts_count: numCourts,
      });
      if (res.pool_play_setup) {
        setSetupData(res.pool_play_setup);
      }
      await onSaveConfig({
        numPools: safeNumPools,
        balanceTolerance: tolerance,
        qualifierCount: totalQualifiers,
        bracketType,
      });
      setSavedSnapshot({
        numPools: safeNumPools,
        qualifiersPerPool: safeQualifiers,
        bracketType,
        tolerance,
        courtIdsKey: [...selectedCourtIds].sort().join(','),
        numCourts,
      });
      setIsEditing(false);
    } catch (err: any) {
      const msg = err?.data?.detail || err?.message || 'Unable to save Pool Play configuration.';
      Alert.alert('Save Failed', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmAndGenerate = async () => {
    if (!canManage || !clubId || !tournamentId || !configurationSaved || isDirty || !isValid) {
      return;
    }

    const executeGeneration = async () => {
      try {
        setGenerating(true);
        if (isGenerated) {
          await competitionApi.regeneratePoolPlay(clubId, tournamentId);
        } else {
          await competitionApi.confirmAndGeneratePoolPlay(clubId, tournamentId, {
            number_of_pools: safeNumPools,
            qualifiers_per_pool: safeQualifiers,
            bracket_type: bracketType,
            balance_tolerance: tolerance,
            selected_court_ids: selectedCourtIds,
            courts_count: numCourts,
            require_saved_config: true,
          });
        }
        await fetchSetup();
        if (onGenerated) await onGenerated();
      } catch (err: any) {
        const msg = err?.data?.detail || err?.message || 'Failed to generate pools and matches.';
        Alert.alert('Generation Failed', msg);
      } finally {
        setGenerating(false);
      }
    };

    if (isGenerated) {
      Alert.alert(
        'Regenerate Pools & Matches?',
        'This replaces unplayed pool matches using the saved configuration and selected courts.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Regenerate', style: 'destructive', onPress: () => void executeGeneration() },
        ]
      );
      return;
    }

    await executeGeneration();
  };

  if (loading && !setupData) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#0F766E" />
        <AppText style={styles.loadingText}>Loading Pool Play setup...</AppText>
      </View>
    );
  }

  const feasibleConfigs: any[] = setupData?.feasible_pool_configurations ?? [];
  const previewPools: any[] = setupData?.preview_pools ?? [];
  const teamsPerPoolDisplay =
    confirmedTeams > 0
      ? confirmedTeams % safeNumPools === 0
        ? `${confirmedTeams / safeNumPools}`
        : `${minPoolSize}–${minPoolSize + 1}`
      : '—';

  const recPools = setupData?.recommended_pools;
  const recTpp = setupData?.recommended_teams_per_pool;
  const recQual = setupData?.recommended_qualifiers_per_pool;
  const conciseRec =
    recPools && recTpp
      ? `Recommended: ${recPools} pools × ${recTpp} teams (top ${recQual ?? 1}/pool qualify)`
      : null;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <PostRegistrationHeader
          icon={<SlidersHorizontal size={18} color="#0F766E" />}
          title="Pool Play Setup & Courts"
          subtitle="Configure pools, qualifiers, and active courts. Save before generating matches."
          badgeLabel={
            isGenerated
              ? 'Generated'
              : configurationSaved && !isDirty
              ? 'Saved'
              : isRegistrationOpen || isDraft
              ? 'Open'
              : 'Draft'
          }
          badgeVariant={isGenerated || (configurationSaved && !isDirty) ? 'success' : 'warning'}
        />

        {(isDraft || isRegistrationOpen) && (
          <PostRegistrationNotice
            variant="info"
            title="Close registration to configure Pool Play"
            message={
              setupData?.closure_eligibility?.blocking_reason ||
              'Pool setup unlocks once registration is closed with at least 4 even confirmed teams.'
            }
          />
        )}

        <PostRegistrationMetrics
          metrics={[
            { label: 'Confirmed Teams', value: confirmedTeams },
            { label: 'Pools', value: safeNumPools },
            { label: 'Teams / Pool', value: teamsPerPoolDisplay },
          ]}
        />

        {conciseRec ? <PostRegistrationNotice variant="info" message={conciseRec} /> : null}
      </View>

      {!isDraft && !isRegistrationOpen && (
        <>
          {/* Section A: Pool Distribution */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Layers size={15} color="#0F766E" />
              <AppText style={styles.sectionTitle}>A. Pool Distribution</AppText>
            </View>

            {feasibleConfigs.length > 0 && (
              <PostRegistrationChoiceChips
                label="Balanced pool presets"
                options={feasibleConfigs.map((cfg) => ({
                  value: String(cfg.number_of_pools),
                  label: `${cfg.number_of_pools} Pools`,
                  subtitle: `${cfg.teams_per_pool_label} / pool`,
                }))}
                selectedValue={String(safeNumPools)}
                disabled={disabledControls}
                onSelect={(val) => handlePoolsChange(Number(val))}
              />
            )}

            <PostRegistrationStepper
              label="Number of pools"
              helperText={`Min 2 teams/pool (Max ${maxPools} pools)`}
              value={safeNumPools}
              unit={safeNumPools === 1 ? 'pool' : 'pools'}
              min={2}
              max={maxPools}
              disabled={disabledControls}
              onChange={handlePoolsChange}
            />

            {previewPools.length > 0 && (
              <View style={styles.previewWrap}>
                <AppText style={styles.previewHeading}>Pool distribution preview</AppText>
                <View style={styles.previewGrid}>
                  {previewPools.map((p) => (
                    <View key={p.pool_name} style={styles.previewChip}>
                      <AppText style={styles.previewPoolTitle}>{p.pool_name}</AppText>
                      <AppText style={styles.previewPoolCount}>
                        {p.teams_count} {p.teams_count === 1 ? 'team' : 'teams'}
                      </AppText>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Section B: Pool Balance Tolerance */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Scale size={15} color="#0F766E" />
              <AppText style={styles.sectionTitle}>B. Pool Balance Tolerance</AppText>
            </View>
            <PostRegistrationChoiceChips
              options={TOLERANCE_OPTIONS}
              selectedValue={String(tolerance)}
              disabled={disabledControls}
              onSelect={(val) => setTolerance(Number(val))}
            />
          </View>

          {/* Section C: Championship Qualification */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Trophy size={15} color="#0F766E" />
              <AppText style={styles.sectionTitle}>C. Championship Qualification</AppText>
            </View>

            <PostRegistrationStepper
              label="Qualifiers per pool"
              helperText={`${totalQualifiers} total advancing team${totalQualifiers === 1 ? '' : 's'}`}
              value={safeQualifiers}
              unit="per pool"
              min={1}
              max={maxQualifiers}
              disabled={disabledControls}
              onChange={handleQualifiersChange}
            />

            <PostRegistrationChoiceChips
              label="Playoff bracket type"
              options={BRACKET_TYPES.map((bt) => ({ value: bt, label: bt }))}
              selectedValue={bracketType}
              disabled={disabledControls}
              onSelect={(val) => handleBracketTypeChange(String(val))}
            />

            <AppText style={styles.qualSummary}>
              {safeQualifiers} {safeQualifiers === 1 ? 'team' : 'teams'} per pool · {totalQualifiers}{' '}
              total qualifier{totalQualifiers === 1 ? '' : 's'}
            </AppText>
          </View>

          {/* Section D: Court Assignment */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <SlidersHorizontal size={15} color="#0F766E" />
              <AppText style={styles.sectionTitle}>
                D. Court Assignment{clubName ? ` · ${clubName}` : ''}
              </AppText>
            </View>

            <PostRegistrationCourtSelector
              availableCourts={availableCourts}
              selectedCourtIds={selectedCourtIds}
              courtsCount={numCourts}
              disabled={disabledControls}
              onToggleCourt={handleToggleCourt}
              onCourtsCountChange={setNumCourts}
            />
          </View>

          {/* Stage 5 & 6 Action Bar */}
          <PostRegistrationSaveActionBar
            configurationSaved={configurationSaved}
            savedAt={setupData?.configuration_saved_at}
            isDirty={isDirty}
            isEditing={isEditing}
            isSaving={saving}
            isGenerating={generating}
            isGenerated={isGenerated}
            isValid={isValid}
            canManage={canManage}
            generateLabel="Confirm & Generate Pools & Matches"
            regenerateLabel="Regenerate Pools & Matches"
            validationError={setupData?.validation_error}
            onSave={handleSave}
            onStartEditing={() => setIsEditing(true)}
            onGenerate={handleConfirmAndGenerate}
          />
        </>
      )}
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
  loadingWrap: {
    padding: Spacing[8],
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2.5],
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: Spacing[4],
    gap: Spacing[3],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  previewWrap: {
    gap: Spacing[2],
    paddingTop: Spacing[1],
  },
  previewHeading: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  previewChip: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    minWidth: 88,
  },
  previewPoolTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F766E',
  },
  previewPoolCount: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  qualSummary: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F766E',
  },
});
