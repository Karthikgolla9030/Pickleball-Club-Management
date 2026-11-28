/**
 * Aught2 Pickleball — BracketSetupCourtsTab
 *
 * Dedicated Setup & Courts tab for Bracket Play following the standardized
 * Stage 4 -> Stage 5 -> Stage 6 workflow:
 * 1. Bracket size, bye count, and elimination format selection
 * 2. Active club court selection + bounded concurrent court capacity
 * 3. Server-verified Save Configuration -> Saved / Edit Configuration toggle
 * 4. Gated Bracket Generation
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { GitFork, Layers, SlidersHorizontal } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import {
  PostRegistrationChoiceChips,
  PostRegistrationCourtSelector,
  PostRegistrationHeader,
  PostRegistrationMetrics,
  PostRegistrationNotice,
  PostRegistrationSaveActionBar,
} from '@/components/post-registration';
import {
  cancelTournamentDetailAndListQueries,
  invalidateAllTournamentQueries,
  syncTournamentCountInCaches,
} from '@/hooks/useTournaments';
import { competitionApi } from '@/services/api/competition';
import { Radius, Spacing } from '@/theme';
import type { Tournament, TournamentSetupResponse } from '@/types';

export interface BracketSetupCourtsTabProps {
  clubId: string;
  tournamentId: string;
  tournament?: Tournament | null;
  canManage: boolean;
  matchesCount: number;
  onRefresh: () => Promise<void> | void;
  onGenerated?: () => Promise<void> | void;
}

const BRACKET_TYPES = ['Single Elimination', 'Double Elimination'] as const;

export function BracketSetupCourtsTab({
  clubId,
  tournamentId,
  tournament,
  canManage,
  matchesCount,
  onRefresh,
  onGenerated,
}: BracketSetupCourtsTabProps) {
  const queryClient = useQueryClient();
  const [setupData, setSetupData] = useState<TournamentSetupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [bracketType, setBracketType] = useState<string>('Single Elimination');
  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>([]);
  const [courtsCount, setCourtsCount] = useState<number>(1);
  const [savedSnapshot, setSavedSnapshot] = useState<{
    bracketType: string;
    courtIdsKey: string;
    courtsCount: number;
  } | null>(null);

  const loadSetup = async () => {
    if (!clubId || !tournamentId) return;
    try {
      setLoading(true);
      const res = await competitionApi.getTournamentSetup(clubId, tournamentId);
      setSetupData(res);
      const nextType = res.bracket_type || 'Single Elimination';
      const nextCourtIds = res.selected_court_ids ?? [];
      const nextCourtsCount =
        nextCourtIds.length > 0
          ? Math.max(1, Math.min(res.courts_count || nextCourtIds.length, nextCourtIds.length))
          : 0;
      setBracketType(nextType);
      setSelectedCourtIds(nextCourtIds);
      setCourtsCount(nextCourtsCount);
      if (res.configuration_saved || res.is_completed || res.is_generated) {
        setSavedSnapshot({
          bracketType: nextType,
          courtIdsKey: [...nextCourtIds].sort().join(','),
          courtsCount: nextCourtsCount,
        });
        setIsEditing(false);
      } else {
        setSavedSnapshot(null);
      }
    } catch (err) {
      console.warn('Failed to fetch Bracket setup:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSetup();
  }, [clubId, tournamentId, tournament?.status, tournament?.participant_count]);

  const statusLower = String(tournament?.status || setupData?.tournament_status || '').toLowerCase();
  const isRegistrationOpen = statusLower === 'registration_open';
  const isDraft = statusLower === 'draft';
  const isClosed = statusLower === 'registration_closed';
  const isCompleted =
    Boolean(setupData?.is_completed) ||
    statusLower === 'completed' ||
    String(tournament?.workflow_state || '').toLowerCase() === 'completed';
  const isCancelled = statusLower === 'cancelled';
  const isInProgress = !isCompleted && !isCancelled && statusLower === 'in_progress';
  const isGenerated = (setupData?.is_generated ?? false) || matchesCount > 0;
  const isLocked = Boolean(setupData?.is_locked) || isCompleted || isCancelled || (isInProgress && isGenerated);
  const configurationSaved = Boolean(setupData?.configuration_saved) || isCompleted || isGenerated;
  const disabledControls = isLocked || !canManage || (configurationSaved && !isEditing);

  const currentKey = [...selectedCourtIds].sort().join(',');
  const isDirty = isLocked
    ? false
    : savedSnapshot
    ? savedSnapshot.bracketType !== bracketType ||
      savedSnapshot.courtIdsKey !== currentKey ||
      savedSnapshot.courtsCount !== courtsCount
    : true;

  const activeCourtsCount = setupData?.available_courts?.filter((c) => c.is_active).length ?? 0;
  const confirmedCount = setupData?.confirmed_count ?? tournament?.participant_count ?? 0;
  const isValid =
    confirmedCount >= 2 &&
    activeCourtsCount > 0 &&
    selectedCourtIds.length > 0 &&
    courtsCount >= 1 &&
    courtsCount <= selectedCourtIds.length;

  const handleToggleCourt = (courtId: string) => {
    setSelectedCourtIds((prev) => {
      const exists = prev.includes(courtId);
      const next = exists ? prev.filter((id) => id !== courtId) : [...prev, courtId];
      setCourtsCount((curr) => {
        if (next.length === 0) return 0;
        if (!exists && (curr === 0 || curr === prev.length)) {
          return next.length;
        }
        return Math.max(1, Math.min(curr || next.length, next.length));
      });
      return next;
    });
  };

  const handleSave = async () => {
    if (!canManage || !isValid || isLocked) return;
    try {
      setSaving(true);
      await cancelTournamentDetailAndListQueries(queryClient, tournamentId, clubId);
      const saved = await competitionApi.saveTournamentConfiguration(clubId, tournamentId, {
        bracket_type: bracketType,
        selected_court_ids: selectedCourtIds,
        courts_count: courtsCount,
      });
      setSetupData(saved);
      const nextType = saved.bracket_type || bracketType;
      const nextIds = saved.selected_court_ids ?? selectedCourtIds;
      const nextCount = saved.courts_count ?? courtsCount;
      setBracketType(nextType);
      setSelectedCourtIds(nextIds);
      setCourtsCount(nextCount);
      setSavedSnapshot({
        bracketType: nextType,
        courtIdsKey: [...nextIds].sort().join(','),
        courtsCount: nextCount,
      });
      setIsEditing(false);
      syncTournamentCountInCaches(queryClient, tournamentId, {
        status: saved.tournament_status,
        workflow_state: saved.workflow_state,
        configuration_saved: saved.configuration_saved,
        configuration_saved_at: saved.configuration_saved_at,
        structure_generated: saved.is_generated,
      });
      invalidateAllTournamentQueries(queryClient, tournamentId, clubId);
      await onRefresh();
    } catch (err: any) {
      const msg = err?.data?.detail || err?.message || 'Unable to save Bracket configuration.';
      Alert.alert('Save Failed', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!canManage || !configurationSaved || isDirty || !isValid || isLocked) return;
    const execute = async () => {
      try {
        setGenerating(true);
        await cancelTournamentDetailAndListQueries(queryClient, tournamentId, clubId);
        if (isGenerated) {
          await competitionApi.regenerateBracket(clubId, tournamentId);
        } else {
          await competitionApi.generateBracket(clubId, tournamentId, true);
        }
        syncTournamentCountInCaches(queryClient, tournamentId, {
          status:
            tournament?.status === 'in_progress' ? 'in_progress' : 'registration_closed',
          workflow_state:
            tournament?.status === 'in_progress' ? 'in_progress' : 'structure_generated',
          configuration_saved: true,
          structure_generated: true,
        });
        invalidateAllTournamentQueries(queryClient, tournamentId, clubId);
        await loadSetup();
        await (onGenerated ? onGenerated() : onRefresh());
      } catch (err: any) {
        const msg = err?.data?.detail || err?.message || 'Failed to generate bracket.';
        Alert.alert('Generation Failed', msg);
      } finally {
        setGenerating(false);
      }
    };

    if (isGenerated) {
      Alert.alert(
        'Regenerate Bracket?',
        'This replaces existing unplayed bracket matches using the saved settings.',
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
        <AppText style={styles.loadingText}>Loading Bracket setup...</AppText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <PostRegistrationHeader
          icon={<SlidersHorizontal size={18} color="#0F766E" />}
          title="Bracket Setup & Courts"
          subtitle={
            isCompleted
              ? 'Archived final elimination bracket format and court assignment.'
              : 'Select elimination structure, assign active club courts, save settings, and generate bracket.'
          }
          badgeLabel={
            isCompleted
              ? 'Completed'
              : isCancelled
              ? 'Cancelled'
              : isInProgress
              ? 'In Progress'
              : isGenerated
              ? 'Generated'
              : configurationSaved && !isDirty
              ? 'Saved'
              : isClosed
              ? 'Closed'
              : 'Open'
          }
          badgeVariant={
            isCompleted || isGenerated || (configurationSaved && !isDirty)
              ? 'success'
              : isCancelled
              ? 'default'
              : 'warning'
          }
        />

        {(isDraft || isRegistrationOpen) && (
          <PostRegistrationNotice
            variant="info"
            title="Registration must be closed before saving setup"
            message={
              setupData?.closure_eligibility?.blocking_reason ||
              'Close registration once the roster is ready to unlock bracket setup and generation.'
            }
          />
        )}

        <PostRegistrationMetrics
          metrics={[
            { label: setupData?.is_doubles ? 'Confirmed Teams' : 'Confirmed Players', value: confirmedCount },
            { label: 'Bracket Size', value: setupData?.bracket_size ?? '—' },
            { label: 'Byes', value: setupData?.byes_count ?? 0 },
          ]}
        />

        {setupData?.recommended_summary ? (
          <PostRegistrationNotice
            variant="info"
            message={setupData.recommended_summary}
          />
        ) : null}
      </View>

      {!isDraft && !isRegistrationOpen && (
        <>
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <GitFork size={15} color="#0F766E" />
              <AppText style={styles.sectionTitle}>Elimination Structure</AppText>
            </View>
            <PostRegistrationChoiceChips
              label="Bracket format"
              options={BRACKET_TYPES.map((label) => ({
                value: label,
                label,
              }))}
              selectedValue={bracketType}
              disabled={disabledControls}
              onSelect={setBracketType}
            />
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Layers size={15} color="#0F766E" />
              <AppText style={styles.sectionTitle}>Court Assignment</AppText>
            </View>
            <PostRegistrationCourtSelector
              availableCourts={setupData?.available_courts ?? []}
              selectedCourtIds={selectedCourtIds}
              courtsCount={courtsCount}
              disabled={disabledControls}
              onToggleCourt={handleToggleCourt}
              onCourtsCountChange={setCourtsCount}
            />
          </View>

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
            isLocked={isLocked}
            isCompleted={isCompleted}
            generateLabel="Generate Bracket"
            regenerateLabel="Regenerate Bracket"
            validationError={setupData?.validation_error}
            onSave={handleSave}
            onStartEditing={() => setIsEditing(true)}
            onGenerate={handleGenerate}
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
});
