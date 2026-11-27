/**
 * Aught2 Pickleball — ScrambleSetupRoundsTab
 *
 * Dedicated Setup & Rounds workspace for Rotating Partner Scramble following the
 * standardized Stage 4 -> Stage 5 -> Stage 6 workflow:
 * 1. Confirmed player readiness & court partitioning metrics
 * 2. Planned rotation rounds & rotation rule configuration
 * 3. Active club court multi-select & bounded concurrent court capacity
 * 4. Server-verified Save Configuration -> Saved / Edit Configuration toggle
 * 5. Gated Generate Rotation Schedule
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
  ChevronDown,
  ChevronUp,
  Layers,
  Repeat,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react-native';

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
import type { Court, ScrambleState, SetupCourtItem, Tournament } from '@/types';

export interface ScrambleSetupRoundsTabProps {
  clubId: string;
  tournamentId: string;
  tournament?: Tournament | null;
  state: ScrambleState | null | undefined;
  canManage?: boolean;
  registeredCount?: number;
  clubCourts?: Court[];
  onGenerated?: () => void | Promise<void>;
  matchesCount?: number;
  onSetPlannedRounds?: (rounds: number) => Promise<any>;
}

const ROTATION_RULES = [
  {
    value: 'Full Rotation (no repeating partners)',
    label: 'Full Rotation',
    subtitle: 'No repeat partners',
  },
  {
    value: 'Balanced Pairings (fair partner distribution)',
    label: 'Balanced Pairings',
    subtitle: 'Fair distribution',
  },
  {
    value: 'Skill-Tiered Rotation (similar rating partners)',
    label: 'Skill-Tiered',
    subtitle: 'Similar skill',
  },
];

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
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [setupData, setSetupData] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [rounds, setRounds] = useState<number>(state?.planned_rounds ?? 5);
  const [rotationRule, setRotationRule] = useState<string>(
    'Full Rotation (no repeating partners)'
  );
  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>([]);
  const [courtsCount, setCourtsCount] = useState<number>(0);

  const [savedSnapshot, setSavedSnapshot] = useState<{
    rounds: number;
    rotationRule: string;
    courtIdsKey: string;
    courtsCount: number;
  } | null>(null);

  const fetchSetup = async (customRounds?: number, customRule?: string) => {
    if (!clubId || !tournamentId) return;
    try {
      setLoading(true);
      const res = await competitionApi.getScramblePostRegistrationSetup(clubId, tournamentId, {
        rounds: customRounds ?? rounds,
        rotation_rule: customRule ?? rotationRule,
      });
      setSetupData(res);
      if (!customRounds && !customRule) {
        const nextRounds = res.selected_rounds || state?.planned_rounds || 5;
        const nextRule = res.selected_rotation_rule || 'Full Rotation (no repeating partners)';
        const nextCourtIds: string[] = Array.isArray(res.selected_court_ids)
          ? res.selected_court_ids
          : clubCourts.filter((c) => c.is_active).map((c) => c.id);
        const nextCourtsCount =
          nextCourtIds.length > 0
            ? Math.max(1, Math.min(res.courts_count || nextCourtIds.length, nextCourtIds.length))
            : 0;

        setRounds(nextRounds);
        setRotationRule(nextRule);
        setSelectedCourtIds(nextCourtIds);
        setCourtsCount(nextCourtsCount);

        if (res.configuration_saved) {
          setSavedSnapshot({
            rounds: nextRounds,
            rotationRule: nextRule,
            courtIdsKey: [...nextCourtIds].sort().join(','),
            courtsCount: nextCourtsCount,
          });
          setIsEditing(false);
        } else {
          setSavedSnapshot(null);
        }
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
  }, [clubId, tournamentId, tournament?.status, tournament?.participant_count]);

  const playerCount = setupData?.confirmed_player_count ?? registeredCount;
  const hasMinPlayers = playerCount >= 4;
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

  const isScheduleFeasible = setupData?.is_schedule_feasible ?? (hasMinPlayers && playerCount % 4 === 0);
  const courtsValid =
    activeCourtsCount > 0 &&
    selectedCourtIds.length > 0 &&
    courtsCount >= 1 &&
    courtsCount <= selectedCourtIds.length;
  const isValid = hasMinPlayers && isScheduleFeasible && courtsValid;

  const currentCourtKey = [...selectedCourtIds].sort().join(',');
  const isDirty = savedSnapshot
    ? savedSnapshot.rounds !== rounds ||
      savedSnapshot.rotationRule !== rotationRule ||
      savedSnapshot.courtIdsKey !== currentCourtKey ||
      savedSnapshot.courtsCount !== courtsCount
    : true;

  const disabledControls = !canManage || (configurationSaved && !isEditing);

  const handleRoundsChange = (nextRounds: number) => {
    const clamped = Math.max(1, Math.min(20, nextRounds));
    setRounds(clamped);
    void fetchSetup(clamped, rotationRule);
  };

  const handleRuleChange = (nextRule: string) => {
    setRotationRule(nextRule);
    void fetchSetup(rounds, nextRule);
  };

  const handleToggleCourt = (courtId: string) => {
    setSelectedCourtIds((prev) => {
      const exists = prev.includes(courtId);
      const next = exists ? prev.filter((id) => id !== courtId) : [...prev, courtId];
      if (next.length > 0) {
        setCourtsCount((curr) => Math.max(1, Math.min(curr || next.length, next.length)));
      } else {
        setCourtsCount(0);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!clubId || !tournamentId || !canManage || !isValid) return;
    try {
      setSaving(true);
      const saved = await competitionApi.saveTournamentConfiguration(clubId, tournamentId, {
        rounds,
        rotation_rule: rotationRule,
        selected_court_ids: selectedCourtIds,
        courts_count: courtsCount,
      });
      if (saved.scramble_setup) {
        setSetupData(saved.scramble_setup);
      }
      if (onSetPlannedRounds) {
        try {
          await onSetPlannedRounds(rounds);
        } catch {}
      }
      setSavedSnapshot({
        rounds,
        rotationRule,
        courtIdsKey: [...selectedCourtIds].sort().join(','),
        courtsCount,
      });
      setIsEditing(false);
    } catch (err: any) {
      const msg = err?.data?.detail || err?.message || 'Unable to save Scramble configuration.';
      Alert.alert('Save Failed', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmAndGenerate = async () => {
    if (!clubId || !tournamentId || !canManage || !configurationSaved || isDirty || !isValid) {
      return;
    }

    const execute = async () => {
      try {
        setGenerating(true);
        if (isGenerated) {
          await competitionApi.regenerateScramble(clubId, tournamentId);
        } else {
          await competitionApi.confirmAndGenerateScramble(clubId, tournamentId, {
            rounds,
            rotation_rule: rotationRule,
            selected_court_ids: selectedCourtIds,
            courts_count: courtsCount,
            require_saved_config: true,
          });
        }
        await fetchSetup();
        if (onGenerated) await onGenerated();
      } catch (err: any) {
        const msg = err?.data?.detail || err?.message || 'Failed to generate rotation schedule.';
        Alert.alert('Generation Failed', msg);
      } finally {
        setGenerating(false);
      }
    };

    if (isGenerated) {
      Alert.alert(
        'Regenerate Rotation Schedule?',
        'This replaces existing unplayed rounds using your saved configuration and courts.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Regenerate', style: 'destructive', onPress: () => void execute() },
        ]
      );
      return;
    }
    await execute();
  };

  if (loading && !setupData) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#0F766E" />
        <AppText style={styles.loadingText}>Loading Scramble setup...</AppText>
      </View>
    );
  }

  const feasiblePairs = setupData?.feasible_doubles_pairs ?? Math.floor(playerCount / 2);
  const feasibleMatches = setupData?.feasible_matches_per_round ?? Math.floor(playerCount / 4);
  const recommendedRounds = setupData?.recommended_rounds ?? 5;
  const previewRounds: any[] = setupData?.preview_rounds ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <PostRegistrationHeader
          icon={<SlidersHorizontal size={18} color="#0F766E" />}
          title="Scramble Setup & Rounds"
          subtitle="Configure rotation rounds, partner rules, and active courts. Save before generating."
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
            title="Close registration to configure Scramble"
            message={
              setupData?.closure_eligibility?.blocking_reason ||
              'Scramble setup unlocks once registration closes with at least 4 confirmed players.'
            }
          />
        )}

        <PostRegistrationMetrics
          metrics={[
            { label: 'Confirmed Players', value: playerCount },
            { label: 'Pairs / Round', value: feasiblePairs },
            { label: 'Matches / Round', value: feasibleMatches },
          ]}
        />

        {hasMinPlayers ? (
          <PostRegistrationNotice
            variant="info"
            message={`Recommended: ${recommendedRounds} rounds · ${feasibleMatches} court(s) per round`}
          />
        ) : null}
      </View>

      {!isDraft && !isRegistrationOpen && (
        <>
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Repeat size={15} color="#0F766E" />
              <AppText style={styles.sectionTitle}>A. Rotation Rounds & Rules</AppText>
            </View>

            <PostRegistrationStepper
              label="Planned rounds"
              helperText={`Recommended: ${recommendedRounds} rounds`}
              value={rounds}
              unit={rounds === 1 ? 'round' : 'rounds'}
              min={1}
              max={20}
              disabled={disabledControls}
              onChange={handleRoundsChange}
            />

            <PostRegistrationChoiceChips
              label="Partner rotation rule"
              options={ROTATION_RULES}
              selectedValue={rotationRule}
              disabled={disabledControls}
              onSelect={(val) => handleRuleChange(String(val))}
            />
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Layers size={15} color="#0F766E" />
              <AppText style={styles.sectionTitle}>B. Court Assignment</AppText>
            </View>
            <PostRegistrationCourtSelector
              availableCourts={availableCourts}
              selectedCourtIds={selectedCourtIds}
              courtsCount={courtsCount}
              disabled={disabledControls}
              onToggleCourt={handleToggleCourt}
              onCourtsCountChange={setCourtsCount}
            />
          </View>

          {previewRounds.length > 0 && (
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.previewToggle}
                onPress={() => setShowPreview((p) => !p)}
                activeOpacity={0.75}
              >
                <View style={styles.sectionHeader}>
                  <Sparkles size={15} color="#0F766E" />
                  <AppText style={styles.sectionTitle}>
                    Rotation Preview ({previewRounds.length} rounds)
                  </AppText>
                </View>
                {showPreview ? (
                  <ChevronUp size={16} color="#64748B" />
                ) : (
                  <ChevronDown size={16} color="#64748B" />
                )}
              </TouchableOpacity>
              {showPreview && (
                <View style={styles.previewBody}>
                  {previewRounds.slice(0, 4).map((rnd) => (
                    <View key={rnd.round_number} style={styles.previewRoundBox}>
                      <AppText style={styles.previewRoundTitle}>Round {rnd.round_number}</AppText>
                      {(rnd.matches || []).map((m: any) => (
                        <AppText key={m.match_number} style={styles.previewMatchText}>
                          Match {m.match_number}: {(m.side_a || []).join(' & ')} vs{' '}
                          {(m.side_b || []).join(' & ')}
                        </AppText>
                      ))}
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

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
            generateLabel="Confirm & Generate Rotation Schedule"
            regenerateLabel="Regenerate Schedule"
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
  previewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewBody: {
    gap: Spacing[2],
  },
  previewRoundBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    padding: Spacing[2.5],
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 3,
  },
  previewRoundTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F766E',
  },
  previewMatchText: {
    fontSize: 11.5,
    color: '#475569',
  },
});
