/**
 * Aught2 Pickleball — Club Competition Scheduling & Court Assignment Screen (Phase 17)
 *
 * Staff screen for managing competition match schedules:
 *   - Date navigation (Today, Tomorrow, +2d, +3d, etc.)
 *   - Court timeline view: active courts with chronological scheduled matches
 *   - Unscheduled matches drawer/modal
 *   - Match scheduling modal with court selector, start time, and duration
 *   - Reschedule modal
 *   - Unschedule confirmation
 *   - Conflict error handling (court collision, team conflict, booking conflict)
 *
 * RBAC:
 *   - Requires manage_schedules permission (Club Owner, Club Manager, Tournament Director)
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  FilterChips,
  LoadingState,
  ModalSheet,
  Screen,
  ScreenHeader,
  AppHeader,
  DateCalendar,
} from '@/components';
import {
  useActiveClub,
  useClubCourts,
  useClubDailySchedule,
  useClubTournaments,
  usePermission,
  useRescheduleLeagueMatch,
  useRescheduleTournamentMatch,
  useScheduleLeagueMatch,
  useScheduleTournamentMatch,
  useTournamentUnscheduled,
  useUnscheduleLeagueMatch,
  useUnscheduleTournamentMatch,
} from '@/hooks';
import { Colors, Layout, Radius, Spacing } from '@/theme';
import type { ScheduledMatch } from '@/types';

function formatDateIso(d: Date): string {
  // Use local timezone to get YYYY-MM-DD
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
}

function formatTime(isoString?: string | null): string {
  if (!isoString) return '--:--';
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const DURATION_OPTIONS = [30, 45, 60, 90, 120];
const HOUR_OPTIONS = Array.from({ length: 15 }, (_, i) => i + 7); // 7 AM to 9 PM (21:00)
const MINUTE_OPTIONS = [0, 15, 30, 45];

export default function CompetitionScheduleScreen() {
  const { clubId, clubName } = useActiveClub();
  const { canManageSchedules } = usePermission();

  // Date selection state
  const minDateStr = formatDateIso(new Date());
  const maxDateStr = formatDateIso(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
  const [selectedDateStr, setSelectedDateStr] = useState<string>(minDateStr);

  // Queries
  const {
    data: dailySchedule,
    isLoading: isScheduleLoading,
    isRefetching,
    refetch,
  } = useClubDailySchedule(clubId ?? '', selectedDateStr);

  const { data: courts } = useClubCourts(clubId ?? '');
  const { data: tournaments } = useClubTournaments(clubId ?? '');

  // Active tournament for unscheduled matches drawer
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null);
  const { data: tournamentUnscheduled, isLoading: isUnscheduledLoading } =
    useTournamentUnscheduled(clubId ?? '', activeTournamentId ?? '');

  // Modal States
  const [isUnscheduledModalVisible, setIsUnscheduledModalVisible] = useState(false);
  const [schedulingMatch, setSchedulingMatch] = useState<ScheduledMatch | null>(null);
  const [isRescheduling, setIsRescheduling] = useState(false);

  // Form States for Schedule/Reschedule Modal
  const [selectedCourtId, setSelectedCourtId] = useState<string>('');
  const [selectedHour, setSelectedHour] = useState<number>(10);
  const [selectedMinute, setSelectedMinute] = useState<number>(0);
  const [selectedDuration, setSelectedDuration] = useState<number>(60);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Mutations
  const scheduleTournament = useScheduleTournamentMatch(
    clubId ?? '',
    schedulingMatch?.tournament_id ?? ''
  );
  const rescheduleTournament = useRescheduleTournamentMatch(
    clubId ?? '',
    schedulingMatch?.tournament_id ?? ''
  );
  const unscheduleTournament = useUnscheduleTournamentMatch(
    clubId ?? '',
    schedulingMatch?.tournament_id ?? ''
  );

  const scheduleLeague = useScheduleLeagueMatch(
    clubId ?? '',
    schedulingMatch?.league_id ?? ''
  );
  const rescheduleLeague = useRescheduleLeagueMatch(
    clubId ?? '',
    schedulingMatch?.league_id ?? ''
  );
  const unscheduleLeague = useUnscheduleLeagueMatch(
    clubId ?? '',
    schedulingMatch?.league_id ?? ''
  );

  // RBAC guard
  if (!canManageSchedules) {
    return (
      <Screen style={styles.container}>
        <EmptyState
          title="Access Restricted"
          description="You need manage_schedules permission (Club Owner, Manager, or Tournament Director) to view and assign court schedules."
        />
      </Screen>
    );
  }

  // Helper to open schedule modal
  const handleOpenScheduleModal = (match: ScheduledMatch, reschedule: boolean = false) => {
    setSchedulingMatch(match);
    setIsRescheduling(reschedule);
    setSelectedCourtId(match.court_id || (courts && courts.length > 0 ? courts[0].id : ''));
    setSelectedDuration(match.duration_minutes || 60);

    if (match.scheduled_start_at) {
      const d = new Date(match.scheduled_start_at);
      setSelectedHour(d.getUTCHours());
      setSelectedMinute(d.getUTCMinutes());
    } else {
      setSelectedHour(10);
      setSelectedMinute(0);
    }
    setErrorMessage(null);
  };

  // Submit Schedule / Reschedule
  const handleSubmitSchedule = async () => {
    if (!schedulingMatch || !selectedCourtId) {
      setErrorMessage('Please select a court');
      return;
    }

    setErrorMessage(null);
    const startAt = new Date(selectedDateStr);
    startAt.setUTCHours(selectedHour, selectedMinute, 0, 0);

    try {
      if (schedulingMatch.tournament_id) {
        if (isRescheduling) {
          await rescheduleTournament.mutateAsync({
            matchId: schedulingMatch.match_id,
            payload: {
              court_id: selectedCourtId,
              start_at: startAt.toISOString(),
              duration_minutes: selectedDuration,
            },
          });
        } else {
          await scheduleTournament.mutateAsync({
            matchId: schedulingMatch.match_id,
            payload: {
              court_id: selectedCourtId,
              start_at: startAt.toISOString(),
              duration_minutes: selectedDuration,
            },
          });
        }
      } else if (schedulingMatch.league_id) {
        if (isRescheduling) {
          await rescheduleLeague.mutateAsync({
            matchId: schedulingMatch.match_id,
            payload: {
              court_id: selectedCourtId,
              start_at: startAt.toISOString(),
              duration_minutes: selectedDuration,
            },
          });
        } else {
          await scheduleLeague.mutateAsync({
            matchId: schedulingMatch.match_id,
            payload: {
              court_id: selectedCourtId,
              start_at: startAt.toISOString(),
              duration_minutes: selectedDuration,
            },
          });
        }
      }

      setSchedulingMatch(null);
      setIsUnscheduledModalVisible(false);
      refetch();
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { detail?: string } }; message?: string };
      const detail = errObj?.response?.data?.detail || errObj?.message || 'Scheduling conflict occurred';
      setErrorMessage(detail);
    }
  };

  // Handle Unschedule Match
  const handleUnschedule = (match: ScheduledMatch) => {
    Alert.alert(
      'Unschedule Match',
      'Are you sure you want to remove this match from the court schedule? It will be moved back to the unscheduled pool.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unschedule',
          style: 'destructive',
          onPress: async () => {
            try {
              if (match.tournament_id) {
                await unscheduleTournament.mutateAsync(match.match_id);
              } else if (match.league_id) {
                await unscheduleLeague.mutateAsync(match.match_id);
              }
              refetch();
            } catch (err: unknown) {
              const errObj = err as { response?: { data?: { detail?: string } }; message?: string };
              Alert.alert('Error', errObj?.response?.data?.detail || 'Failed to unschedule match');
            }
          },
        },
      ]
    );
  };

  const isSubmitting =
    scheduleTournament.isPending ||
    rescheduleTournament.isPending ||
    scheduleLeague.isPending ||
    rescheduleLeague.isPending;

  return (
    <Screen style={styles.container}>
      <AppHeader title="Competition Schedule" />
      {/* Subtitle + Action row — AppHeader already shows 'Court Schedules' */}
      <ScreenHeader
        title=""
        subtitle={`${clubName ?? 'Club'} • Match Timeline & Assignments`}
        rightElement={
          <Button
            label="Unscheduled"
            size="sm"
            variant="secondary"
            fullWidth={false}
            onPress={() => {
              if (tournaments && tournaments.length > 0 && !activeTournamentId) {
                setActiveTournamentId(tournaments[0].id);
              }
              setIsUnscheduledModalVisible(true);
            }}
          />
        }
      />

      {/* Date Selector Calendar */}
      <View style={{ paddingHorizontal: Spacing[4], marginBottom: Spacing[2] }}>
        <DateCalendar
          selectedDate={selectedDateStr}
          onSelectDate={setSelectedDateStr}
          minDate={minDateStr}
          maxDate={maxDateStr}
        />
      </View>

      {/* Main Schedule Content */}
      {isScheduleLoading ? (
        <LoadingState message="Loading court timeline..." />
      ) : (
        <ScrollView
          style={styles.timelineScroll}
          contentContainerStyle={{ paddingBottom: Layout.bottomScrollPadding }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.brand.primary}
            />
          }
        >
          {dailySchedule && dailySchedule.length > 0 ? (
            dailySchedule.map((courtSched) => (
              <Card key={courtSched.court_id} style={styles.courtCard}>
                <View style={styles.courtHeader}>
                  <View style={styles.courtBadgeRow}>
                    <Badge
                      label={`Court ${courtSched.court_number}`}
                      variant="info"
                    />
                    <AppText variant="body" style={styles.courtName}>
                      {courtSched.court_name}
                    </AppText>
                  </View>
                  <AppText variant="caption" style={styles.matchCount}>
                    {courtSched.scheduled_matches.length}{' '}
                    {courtSched.scheduled_matches.length === 1 ? 'match' : 'matches'}
                  </AppText>
                </View>

                {courtSched.scheduled_matches.length === 0 ? (
                  <View style={styles.emptyCourtRow}>
                    <AppText variant="caption" style={styles.emptyCourtText}>
                      No competition matches scheduled on this court today
                    </AppText>
                  </View>
                ) : (
                  courtSched.scheduled_matches.map((m) => {
                    const isCompleted = m.status === 'completed';
                    const compBadge = m.competition_type === 'tournament' ? 'Tournament' : 'League';

                    return (
                      <View key={m.match_id} style={styles.matchItem}>
                        <View style={styles.matchTimeRow}>
                          <View style={styles.timeBadge}>
                            <AppText variant="caption" style={styles.timeText}>
                              {formatTime(m.scheduled_start_at)} – {formatTime(m.scheduled_end_at)}
                            </AppText>
                            <AppText variant="caption" style={styles.durationText}>
                              ({m.duration_minutes ?? 60}m)
                            </AppText>
                          </View>
                          <Badge
                            label={compBadge}
                            variant={m.competition_type === 'tournament' ? 'default' : 'info'}
                          />
                        </View>

                        <View style={styles.matchDetails}>
                          <AppText variant="caption" style={styles.competitionName}>
                            {m.competition_name || 'Competition'}
                          </AppText>

                          <AppText variant="body" style={styles.competitorsText}>
                            {m.team_a_name || 'Side A'} vs {m.team_b_name || 'Side B'}
                          </AppText>

                          {m.round_number && (
                            <AppText variant="caption" style={styles.roundInfo}>
                              Round {m.round_number}
                              {m.match_number ? ` • Match #${m.match_number}` : ''}
                            </AppText>
                          )}
                        </View>

                        {/* Match Actions */}
                        <View style={styles.matchActionRow}>
                          {isCompleted ? (
                            <Badge label="Completed" variant="success" />
                          ) : (
                            <>
                              <TouchableOpacity
                                style={styles.actionBtnOutline}
                                onPress={() => handleOpenScheduleModal(m, true)}
                              >
                                <AppText variant="caption" style={styles.actionBtnOutlineText}>
                                  Reschedule
                                </AppText>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.actionBtnDestructive}
                                onPress={() => handleUnschedule(m)}
                              >
                                <AppText variant="caption" style={styles.actionBtnDestructiveText}>
                                  Unschedule
                                </AppText>
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </Card>
            ))
          ) : (
            <EmptyState
              title="No Schedule Found"
              description={`There is no court schedule for ${selectedDateStr}.`}
            />
          )}
        </ScrollView>
      )}

      {/* ─── Unscheduled Matches Modal ───────────────────────────────────────── */}
      <ModalSheet
        visible={isUnscheduledModalVisible}
        onClose={() => setIsUnscheduledModalVisible(false)}
        title="Unscheduled Matches"
        subtitle={
          tournaments && tournaments.length > 0 && activeTournamentId
            ? (tournaments.find((t) => t.id === activeTournamentId)?.name ?? undefined)
            : undefined
        }
      >
        <View style={{ gap: Spacing[3], paddingBottom: Spacing[4] }}>
          {/* Tournament Selector FilterChips */}
          {tournaments && tournaments.length > 0 && (
            <FilterChips
              chips={tournaments.map((t) => ({ key: t.id, label: t.name }))}
              activeChip={activeTournamentId ?? tournaments[0].id}
              onChipPress={(key) => setActiveTournamentId(key)}
            />
          )}

          {/* Unscheduled List */}
          {isUnscheduledLoading ? (
            <ActivityIndicator color={Colors.brand.primary} style={{ margin: Spacing[6] }} />
          ) : !tournamentUnscheduled || tournamentUnscheduled.length === 0 ? (
            <View style={styles.emptyUnscheduledContainer}>
              <AppText variant="body" style={styles.emptyUnscheduledText}>
                All matches in this tournament are scheduled! 🎉
              </AppText>
            </View>
          ) : (
            tournamentUnscheduled.map((item) => (
              <View key={item.match_id} style={styles.unscheduledItem}>
                <View style={styles.unscheduledItemInfo}>
                  <AppText variant="body" style={styles.unscheduledTeams}>
                    {item.team_a_name || 'Side A'} vs {item.team_b_name || 'Side B'}
                  </AppText>
                  <AppText variant="caption" style={styles.unscheduledMeta}>
                    Round {item.round_number ?? 1} • Match #{item.match_number ?? 1}
                  </AppText>
                </View>
                <Button
                  label="Assign Court"
                  size="sm"
                  variant="primary"
                  onPress={() => handleOpenScheduleModal(item, false)}
                />
              </View>
            ))
          )}
        </View>
      </ModalSheet>

      {/* ─── Schedule / Reschedule Modal ────────────────────────────────────── */}
      <ModalSheet
        visible={!!schedulingMatch}
        onClose={() => setSchedulingMatch(null)}
        title={isRescheduling ? 'Reschedule Match' : 'Schedule Match'}
        subtitle={
          schedulingMatch
            ? `${schedulingMatch.team_a_name || 'Side A'} vs ${schedulingMatch.team_b_name || 'Side B'}`
            : undefined
        }
        actions={[
          {
            label: 'Cancel',
            variant: 'secondary',
            onPress: () => setSchedulingMatch(null),
          },
          {
            label: isRescheduling ? 'Confirm Reschedule' : 'Confirm Schedule',
            variant: 'primary',
            onPress: handleSubmitSchedule,
            loading: isSubmitting,
          },
        ]}
      >
        <View style={{ gap: Spacing[3], paddingBottom: Spacing[4] }}>
          {schedulingMatch && (
            <View style={styles.matchSummary}>
              <AppText variant="bodySmall" style={styles.matchSummaryComp}>
                {schedulingMatch.competition_name || 'Competition'}
              </AppText>
              <AppText variant="body" style={styles.matchSummaryTeams}>
                {schedulingMatch.team_a_name || 'Side A'} vs {schedulingMatch.team_b_name || 'Side B'}
              </AppText>
            </View>
          )}

          {/* Conflict / Error Banner */}
          {errorMessage && (
            <View style={styles.errorBanner}>
              <AppText variant="caption" style={styles.errorText}>
                ⚠️ {errorMessage}
              </AppText>
            </View>
          )}

          {/* Court Selector */}
          <AppText variant="bodySmall" style={styles.fieldLabel}>
            Assign Court
          </AppText>
          <FilterChips
            chips={(courts ?? []).map((c) => ({ key: c.id, label: c.name }))}
            activeChip={selectedCourtId}
            onChipPress={(id) => setSelectedCourtId(id)}
          />

          {/* Start Time Picker */}
          <AppText variant="bodySmall" style={styles.fieldLabel}>
            Start Time ({selectedDateStr})
          </AppText>
          <View style={styles.timePickerRow}>
            {/* Hour Scroll */}
            <FilterChips
              chips={HOUR_OPTIONS.map((h) => ({
                key: String(h),
                label: `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`,
              }))}
              activeChip={String(selectedHour)}
              onChipPress={(k) => setSelectedHour(Number(k))}
            />

            {/* Minute Selector */}
            <View style={styles.minuteRow}>
              {MINUTE_OPTIONS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[
                    styles.minuteChip,
                    selectedMinute === m && styles.minuteChipSelected,
                  ]}
                  onPress={() => setSelectedMinute(m)}
                >
                  <AppText
                    variant="caption"
                    style={[
                      styles.minuteChipText,
                      selectedMinute === m && styles.minuteChipTextSelected,
                    ]}
                  >
                    :{String(m).padStart(2, '0')}
                  </AppText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Duration Selector */}
          <AppText variant="bodySmall" style={styles.fieldLabel}>
            Duration
          </AppText>
          <FilterChips
            chips={DURATION_OPTIONS.map((d) => ({ key: String(d), label: `${d} min` }))}
            activeChip={String(selectedDuration)}
            onChipPress={(k) => setSelectedDuration(Number(k))}
          />
        </View>
      </ModalSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  header: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[2],
    paddingBottom: Spacing[1],
  },
  timelineScroll: {
    flex: 1,
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[3],
  },
  courtCard: {
    marginBottom: Spacing[3],
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.lg,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  courtHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[2],
    paddingBottom: Spacing[1],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
  },
  courtBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  courtName: {
    color: Colors.text.primary,
    fontWeight: '600',
  },
  matchCount: {
    color: Colors.text.secondary,
  },
  emptyCourtRow: {
    paddingVertical: Spacing[3],
    alignItems: 'center',
  },
  emptyCourtText: {
    color: Colors.text.tertiary,
    fontStyle: 'italic',
  },
  matchItem: {
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.md,
    padding: Spacing[3],
    marginTop: Spacing[2],
    borderLeftWidth: 3,
    borderLeftColor: Colors.brand.primary,
  },
  matchTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[1],
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
  },
  timeText: {
    color: Colors.brand.primary,
    fontWeight: '700',
  },
  durationText: {
    color: Colors.text.secondary,
  },
  matchDetails: {
    marginBottom: Spacing[2],
  },
  competitionName: {
    color: Colors.text.secondary,
    marginBottom: 2,
  },
  competitorsText: {
    color: Colors.text.primary,
    fontWeight: '700',
  },
  roundInfo: {
    color: Colors.text.tertiary,
    marginTop: 2,
  },
  matchActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: Colors.surface.border,
    paddingTop: Spacing[1],
  },
  actionBtnOutline: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  actionBtnOutlineText: {
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  actionBtnDestructive: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.status.error,
  },
  actionBtnDestructiveText: {
    color: Colors.status.error,
    fontWeight: '600',
  },
  unscheduledItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing[3],
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.md,
    marginBottom: Spacing[2],
  },
  unscheduledItemInfo: {
    flex: 1,
    marginRight: Spacing[3],
  },
  unscheduledTeams: {
    color: Colors.text.primary,
    fontWeight: '600',
  },
  unscheduledMeta: {
    color: Colors.text.secondary,
    marginTop: 2,
  },
  emptyUnscheduledContainer: {
    padding: Spacing[6],
    alignItems: 'center',
  },
  emptyUnscheduledText: {
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  matchSummary: {
    backgroundColor: Colors.surface.elevated,
    padding: Spacing[2],
    borderRadius: Radius.sm,
    marginBottom: Spacing[3],
  },
  matchSummaryComp: {
    color: Colors.text.secondary,
  },
  matchSummaryTeams: {
    color: Colors.text.primary,
    fontWeight: '700',
    marginTop: 2,
  },
  errorBanner: {
    backgroundColor: Colors.status.errorBg,
    borderColor: Colors.status.error,
    borderWidth: 1,
    padding: Spacing[2],
    borderRadius: Radius.sm,
    marginBottom: Spacing[3],
  },
  errorText: {
    color: Colors.status.error,
    fontWeight: '600',
  },
  fieldLabel: {
    color: Colors.text.secondary,
    fontWeight: '600',
    marginBottom: Spacing[1],
    marginTop: Spacing[2],
  },
  courtPicker: {
    marginBottom: Spacing[2],
  },
  courtChoice: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1],
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface.elevated,
    marginRight: Spacing[2],
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  courtChoiceSelected: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  courtChoiceText: {
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  courtChoiceTextSelected: {
    color: Colors.white,
    fontWeight: '700',
  },
  timePickerRow: {
    marginBottom: Spacing[1],
  },
  timeHourScroll: {
    flexDirection: 'row',
  },
  timeChip: {
    paddingHorizontal: Spacing[2],
    paddingVertical: Spacing[1],
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface.elevated,
    marginRight: Spacing[1],
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  timeChipSelected: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  timeChipText: {
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  timeChipTextSelected: {
    color: Colors.white,
    fontWeight: '700',
  },
  minuteRow: {
    flexDirection: 'row',
    gap: Spacing[1],
    marginBottom: Spacing[2],
  },
  minuteChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing[1],
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  minuteChipSelected: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  minuteChipText: {
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  minuteChipTextSelected: {
    color: Colors.white,
    fontWeight: '700',
  },
  durationRow: {
    flexDirection: 'row',
    gap: Spacing[1],
    marginBottom: Spacing[4],
  },
  durationChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing[1],
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  durationChipSelected: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  durationChipText: {
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  durationChipTextSelected: {
    color: Colors.white,
    fontWeight: '700',
  },
  dialogActions: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  dialogBtn: {
    flex: 1,
  },
});
