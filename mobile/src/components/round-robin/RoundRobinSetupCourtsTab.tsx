/**
 * Aught2 Pickleball — RoundRobinSetupCourtsTab
 *
 * Dedicated Setup & Courts tab for Round Robin tournaments following the standardized
 * Stage 4 -> Stage 5 -> Stage 6 workflow:
 * 1. Locked confirmed participant & schedule metrics
 * 2. Active club court selection + bounded concurrent court capacity
 * 3. Server-verified Save Configuration -> Saved / Edit Configuration toggle
 * 4. Gated Match Generation
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Layers, SlidersHorizontal } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import {
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
import { Spacing, Radius } from '@/theme';
import type { Tournament, TournamentSetupResponse } from '@/types';

export interface RoundRobinSetupCourtsTabProps {
  clubId: string;
  tournamentId: string;
  tournament?: Tournament | null;
  canManage: boolean;
  matchesCount: number;
  onRefresh: () => Promise<void> | void;
  onGenerated?: () => Promise<void> | void;
}

export function RoundRobinSetupCourtsTab({
  clubId,
  tournamentId,
  tournament,
  canManage,
  matchesCount,
  onRefresh,
  onGenerated,
}: RoundRobinSetupCourtsTabProps) {
  const queryClient = useQueryClient();
  const [setupData, setSetupData] = useState<TournamentSetupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>([]);
  const [courtsCount, setCourtsCount] = useState<number>(1);
  const [savedSnapshot, setSavedSnapshot] = useState<{
    courtIdsKey: string;
    courtsCount: number;
  } | null>(null);

  const loadSetup = async () => {
    if (!clubId || !tournamentId) return;
    try {
      setLoading(true);
      const res = await competitionApi.getTournamentSetup(clubId, tournamentId);
      setSetupData(res);
      const nextCourtIds = res.selected_court_ids ?? [];
      const nextCourtsCount =
        nextCourtIds.length > 0
          ? Math.max(1, Math.min(res.courts_count || nextCourtIds.length, nextCourtIds.length))
          : 0;
      setSelectedCourtIds(nextCourtIds);
      setCourtsCount(nextCourtsCount);
      if (res.configuration_saved || res.is_completed || res.is_generated) {
        setSavedSnapshot({
          courtIdsKey: [...nextCourtIds].sort().join(','),
          courtsCount: nextCourtsCount,
        });
        setIsEditing(false);
      } else {
        setSavedSnapshot(null);
      }
    } catch (err) {
      console.warn('Failed to fetch Round Robin setup:', err);
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
    ? savedSnapshot.courtIdsKey !== currentKey || savedSnapshot.courtsCount !== courtsCount
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
        selected_court_ids: selectedCourtIds,
        courts_count: courtsCount,
      });
      setSetupData(saved);
      const nextIds = saved.selected_court_ids ?? selectedCourtIds;
      const nextCount = saved.courts_count ?? courtsCount;
      setSelectedCourtIds(nextIds);
      setCourtsCount(nextCount);
      setSavedSnapshot({
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
      const msg = err?.data?.detail || err?.message || 'Unable to save Round Robin configuration.';
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
          await competitionApi.regenerateRoundRobin(clubId, tournamentId);
        } else {
          await competitionApi.generateRoundRobin(clubId, tournamentId, true);
        }
        syncTournamentCountInCaches(queryClient, tournamentId, {
          status: 'in_progress',
          workflow_state: 'in_progress',
          configuration_saved: true,
          structure_generated: true,
        });
        invalidateAllTournamentQueries(queryClient, tournamentId, clubId);
        await loadSetup();
        await (onGenerated ? onGenerated() : onRefresh());
      } catch (err: any) {
        const msg = err?.data?.detail || err?.message || 'Failed to generate Round Robin matchups.';
        Alert.alert('Generation Failed', msg);
      } finally {
        setGenerating(false);
      }
    };

    if (isGenerated) {
      Alert.alert(
        'Regenerate Matchups?',
        'This replaces existing unplayed matchups using the saved court configuration.',
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
        <AppText style={styles.loadingText}>Loading Round Robin setup...</AppText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <PostRegistrationHeader
          icon={<SlidersHorizontal size={18} color="#0F766E" />}
          title="Round Robin Setup & Courts"
          subtitle={
            isCompleted
              ? 'Archived final schedule summary and court assignment.'
              : 'Review schedule summary, assign active club courts, save settings, and generate matchups.'
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
              'Close registration once the roster is ready to unlock setup and match generation.'
            }
          />
        )}

        <PostRegistrationMetrics
          metrics={[
            { label: setupData?.is_doubles ? 'Confirmed Teams' : 'Confirmed Players', value: confirmedCount },
            { label: 'Rounds', value: setupData?.rounds_count ?? '—' },
            { label: 'Total Matches', value: setupData?.estimated_matches ?? '—' },
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
            generateLabel="Generate Round Robin Matchups"
            regenerateLabel="Regenerate Matchups"
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
