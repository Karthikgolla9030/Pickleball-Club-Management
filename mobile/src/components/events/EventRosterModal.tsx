/**
 * Aught2 Pickleball — Modern Event Roster Modal
 *
 * Implements the Club Owner / Manager Participant Roster interface matching
 * design specifications:
 *   - Pinned header with event title, subtitle & close control
 *   - Real-time participant summary metric cards (Active Spots, Waitlist, Attended, No Show, Cancelled)
 *   - Horizontally scrollable status filter tabs with counts
 *   - Participant cards with real full names, email, timestamp, status badge
 *   - Specific actions for each status:
 *       * Registered: Mark Attended, Mark No Show, Cancel Spot
 *       * Attended: Attendance Confirmed, Reset Attendance, Mark No Show
 *       * No Show: No Show indicator, Reset Attendance, Mark Attended
 *       * Waitlisted: Promote to Registered (with capacity verification), Cancel Waitlist
 *       * Cancelled: Cancelled indicator, excluded from active capacity
 *   - NO "Add Player" button or manual registration form (per strict design requirement)
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Check,
  RotateCcw,
  UserCheck,
  UserX,
  X,
} from 'lucide-react-native';

import { AppText, Badge, EmptyState, LoadingState } from '@/components';
import {
  useEventRegistrations,
  useStaffCancelRegistration,
  useStaffMarkAttendance,
  useStaffPromoteWaitlisted,
  useStaffResetAttendance,
} from '@/hooks';
import { Colors, Radius, Spacing } from '@/theme';
import {
  EVENT_REGISTRATION_STATUS_LABELS,
  type ClubEvent,
  type EventRegistration,
  type EventRegistrationStatus,
} from '@/types';

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function getPlayerInitials(name: string): string {
  if (!name) return 'P';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export interface EventRosterModalProps {
  visible: boolean;
  event: ClubEvent | null;
  clubId: string;
  onClose: () => void;
}

export function EventRosterModal({
  visible,
  event,
  clubId,
  onClose,
}: EventRosterModalProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && windowWidth >= 768;

  const [filterStatus, setFilterStatus] = useState<EventRegistrationStatus | 'all'>('all');

  const eventId = event?.id || '';

  // Fetch full registrations list for this event
  const {
    data: registrations = [],
    isLoading,
    refetch,
  } = useEventRegistrations(clubId, eventId);

  const markAttendanceMutation = useStaffMarkAttendance(clubId, eventId);
  const resetAttendanceMutation = useStaffResetAttendance(clubId, eventId);
  const cancelRegMutation = useStaffCancelRegistration(clubId, eventId);
  const promoteMutation = useStaffPromoteWaitlisted(clubId, eventId);

  // Accurate real-time counts calculated directly from registration data
  const counts = useMemo(() => {
    let reg = 0;
    let wait = 0;
    let att = 0;
    let noShow = 0;
    let canc = 0;

    for (const r of registrations) {
      if (r.status === 'registered') reg++;
      else if (r.status === 'waitlisted') wait++;
      else if (r.status === 'attended') att++;
      else if (r.status === 'no_show') noShow++;
      else if (r.status === 'cancelled') canc++;
    }

    // Active capacity spots used = registered + attended + no_show
    const activeSpots = reg + att + noShow;
    return { reg, wait, att, noShow, canc, activeSpots, total: registrations.length };
  }, [registrations]);

  // Filtered view
  const filteredRegistrations = useMemo(() => {
    if (filterStatus === 'all') return registrations;
    return registrations.filter((r) => r.status === filterStatus);
  }, [registrations, filterStatus]);

  // Attendance actions
  const handleMarkAttendance = async (registrationId: string, attended: boolean) => {
    try {
      await markAttendanceMutation.mutateAsync({ registrationId, attended });
      refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update attendance';
      Alert.alert('Attendance Error', msg);
    }
  };

  const handleResetAttendance = async (registrationId: string) => {
    try {
      await resetAttendanceMutation.mutateAsync(registrationId);
      refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset attendance';
      Alert.alert('Reset Error', msg);
    }
  };

  const handlePromote = async (reg: EventRegistration) => {
    // Check if capacity is reached
    if (event?.capacity !== null && event?.capacity !== undefined) {
      if (counts.activeSpots >= event.capacity) {
        Alert.alert(
          'Capacity Full',
          `This event is at maximum capacity (${counts.activeSpots}/${event.capacity} active spots). Cannot promote player until a spot opens up.`,
        );
        return;
      }
    }

    try {
      await promoteMutation.mutateAsync(reg.id);
      refetch();
      Alert.alert('Player Promoted', `${reg.user_full_name || reg.user_name || 'Player'} has been promoted to Registered.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Promotion failed';
      Alert.alert('Promotion Failed', msg);
    }
  };

  const handleCancelRegistration = (reg: EventRegistration) => {
    const isWaitlisted = reg.status === 'waitlisted';
    const title = isWaitlisted ? 'Cancel Waitlist' : 'Cancel Registration';
    const message = isWaitlisted
      ? `Remove ${reg.user_full_name || reg.user_name || reg.user_email || 'this player'} from the waitlist?`
      : `Cancel registration for ${reg.user_full_name || reg.user_name || reg.user_email || 'this player'}? If an eligible waitlisted player exists, they will be auto-promoted.`;

    Alert.alert(title, message, [
      { text: 'Keep Spot', style: 'cancel' },
      {
        text: 'Confirm Cancel',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelRegMutation.mutateAsync(reg.id);
            refetch();
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Cancellation failed';
            Alert.alert('Error', msg);
          }
        },
      },
    ]);
  };

  if (!event || !visible) return null;

  const capacityInfo =
    event.capacity !== null && event.capacity !== undefined
      ? `${counts.activeSpots} / ${event.capacity} spots filled`
      : `${counts.activeSpots} participants (unlimited capacity)`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalBackdrop}>
        <View
          style={[
            styles.modalSheetContainer,
            isDesktop
              ? styles.modalDialogDesktop
              : [
                  styles.modalSheetMobile,
                  { maxHeight: windowHeight - insets.top - 20 },
                ],
          ]}
        >
          {/* Mobile Drag Indicator */}
          {!isDesktop && <View style={styles.sheetHandle} />}

          {/* 1. Pinned Header */}
          <View style={styles.rosterHeader}>
            <View style={styles.rosterHeaderText}>
              <AppText style={styles.rosterTitle} numberOfLines={2}>
                {event.title}
              </AppText>
              <AppText style={styles.rosterSubtitle}>
                Participant Roster • {capacityInfo}
              </AppText>
            </View>
            <TouchableOpacity
              style={styles.rosterCloseBtn}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={18} color="#102B2A" />
            </TouchableOpacity>
          </View>

          {/* 2. Pinned Metrics Bar */}
          <View style={styles.rosterMetricsContainer}>
            <View style={styles.rosterMetricCard}>
              <AppText style={styles.rosterMetricNumber}>{counts.activeSpots}</AppText>
              <AppText style={styles.rosterMetricLabel}>Active Spots</AppText>
            </View>
            <View style={styles.rosterMetricCard}>
              <AppText style={[styles.rosterMetricNumber, { color: '#9A6B00' }]}>
                {counts.wait}
              </AppText>
              <AppText style={styles.rosterMetricLabel}>Waitlist</AppText>
            </View>
            <View style={styles.rosterMetricCard}>
              <AppText style={[styles.rosterMetricNumber, { color: '#18794E' }]}>
                {counts.att}
              </AppText>
              <AppText style={styles.rosterMetricLabel}>Attended</AppText>
            </View>
            <View style={styles.rosterMetricCard}>
              <AppText style={[styles.rosterMetricNumber, { color: '#B42318' }]}>
                {counts.noShow}
              </AppText>
              <AppText style={styles.rosterMetricLabel}>No Show</AppText>
            </View>
            <View style={styles.rosterMetricCard}>
              <AppText style={[styles.rosterMetricNumber, { color: '#64748B' }]}>
                {counts.canc}
              </AppText>
              <AppText style={styles.rosterMetricLabel}>Cancelled</AppText>
            </View>
          </View>

          {/* 3. Pinned Status Filter Tabs */}
          <View style={styles.rosterTabsSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rosterTabsContent}
            >
              {[
                { key: 'all' as const, label: `All (${counts.total})` },
                { key: 'registered' as const, label: `Registered (${counts.reg})` },
                { key: 'waitlisted' as const, label: `Waitlisted (${counts.wait})` },
                { key: 'attended' as const, label: `Attended (${counts.att})` },
                { key: 'no_show' as const, label: `No Show (${counts.noShow})` },
                { key: 'cancelled' as const, label: `Cancelled (${counts.canc})` },
              ].map((tab) => {
                const isSelected = filterStatus === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    style={[
                      styles.rosterTabChip,
                      isSelected && styles.rosterTabChipSelected,
                    ]}
                    onPress={() => setFilterStatus(tab.key)}
                    activeOpacity={0.7}
                  >
                    <AppText
                      style={[
                        styles.rosterTabChipText,
                        isSelected && styles.rosterTabChipTextSelected,
                      ]}
                    >
                      {tab.label}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* 4. Participant Count Summary — Explicitly NO Add Player button */}
          <View style={styles.rosterControlRow}>
            <AppText style={styles.rosterCountText}>
              Showing {filteredRegistrations.length} of {counts.total} participant{counts.total === 1 ? '' : 's'}
            </AppText>
          </View>

          {/* 5. Scrollable Participant List */}
          <View style={styles.rosterListContainer}>
            {isLoading ? (
              <LoadingState message="Loading roster participants..." />
            ) : filteredRegistrations.length === 0 ? (
              <EmptyState
                title="No Participants"
                description={`No players found with status "${filterStatus}".`}
              />
            ) : (
              <FlatList
                data={filteredRegistrations}
                keyExtractor={(item) => item.id}
                contentContainerStyle={[
                  styles.rosterScrollContent,
                  { paddingBottom: insets.bottom + 40 },
                ]}
                renderItem={({ item }) => {
                  const displayName =
                    item.user_full_name || item.user_name || (item.user_email ? item.user_email.split('@')[0] : 'Participant');
                  const initials = getPlayerInitials(displayName);

                  return (
                    <View style={styles.participantCard}>
                      {/* Card Top: Avatar, Name, Email, Status Badge */}
                      <View style={styles.participantHeaderRow}>
                        <View style={styles.avatarCircle}>
                          <AppText style={styles.avatarInitials}>{initials}</AppText>
                        </View>
                        <View style={styles.participantInfoCol}>
                          <AppText style={styles.participantName} numberOfLines={1}>
                            {displayName}
                          </AppText>
                          {item.user_email ? (
                            <AppText style={styles.participantEmail} numberOfLines={1}>
                              {item.user_email}
                            </AppText>
                          ) : null}
                          <AppText style={styles.participantTimestamp}>
                            Registered {formatDate(item.registered_at)}
                          </AppText>
                        </View>
                        <View style={styles.participantBadgeCol}>
                          <Badge
                            label={EVENT_REGISTRATION_STATUS_LABELS[item.status] || item.status}
                            variant={
                              item.status === 'attended' || item.status === 'registered'
                                ? 'success'
                                : item.status === 'waitlisted'
                                ? 'warning'
                                : 'error'
                            }
                          />
                        </View>
                      </View>

                      {/* Optional Notes */}
                      {item.notes ? (
                        <View style={styles.participantNotesBox}>
                          <AppText style={styles.participantNotesText}>
                            Note: {item.notes}
                          </AppText>
                        </View>
                      ) : null}

                      {/* Status-Specific Actions */}
                      <View style={styles.participantActionsRow}>
                        {/* CASE A: REGISTERED */}
                        {item.status === 'registered' && (
                          <View style={styles.actionButtonGroup}>
                            <TouchableOpacity
                              style={styles.actionBtnAttended}
                              onPress={() => handleMarkAttendance(item.id, true)}
                              activeOpacity={0.8}
                            >
                              <Check size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                              <AppText style={styles.actionBtnAttendedText}>Mark Attended</AppText>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.actionBtnNoShow}
                              onPress={() => handleMarkAttendance(item.id, false)}
                              activeOpacity={0.8}
                            >
                              <UserX size={13} color="#B42318" style={{ marginRight: 4 }} />
                              <AppText style={styles.actionBtnNoShowText}>Mark No Show</AppText>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.actionBtnCancel}
                              onPress={() => handleCancelRegistration(item)}
                              activeOpacity={0.7}
                            >
                              <AppText style={styles.actionBtnCancelText}>Cancel Spot</AppText>
                            </TouchableOpacity>
                          </View>
                        )}

                        {/* CASE B: ATTENDED */}
                        {item.status === 'attended' && (
                          <View style={styles.statusStateRow}>
                            <View style={styles.statusStateTagSuccess}>
                              <UserCheck size={13} color="#18794E" style={{ marginRight: 4 }} />
                              <AppText style={styles.statusStateTagSuccessText}>
                                Attendance Confirmed
                              </AppText>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                              <TouchableOpacity
                                style={styles.actionBtnOutline}
                                onPress={() => handleResetAttendance(item.id)}
                                activeOpacity={0.8}
                              >
                                <RotateCcw size={12} color="#475569" style={{ marginRight: 3 }} />
                                <AppText style={styles.actionBtnOutlineText}>Reset</AppText>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.actionBtnNoShow}
                                onPress={() => handleMarkAttendance(item.id, false)}
                                activeOpacity={0.8}
                              >
                                <UserX size={12} color="#B42318" style={{ marginRight: 3 }} />
                                <AppText style={styles.actionBtnNoShowText}>Mark No Show</AppText>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}

                        {/* CASE C: NO SHOW */}
                        {item.status === 'no_show' && (
                          <View style={styles.statusStateRow}>
                            <View style={styles.statusStateTagError}>
                              <UserX size={13} color="#B42318" style={{ marginRight: 4 }} />
                              <AppText style={styles.statusStateTagErrorText}>
                                No-Show Recorded
                              </AppText>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                              <TouchableOpacity
                                style={styles.actionBtnOutline}
                                onPress={() => handleResetAttendance(item.id)}
                                activeOpacity={0.8}
                              >
                                <RotateCcw size={12} color="#475569" style={{ marginRight: 3 }} />
                                <AppText style={styles.actionBtnOutlineText}>Reset</AppText>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.actionBtnAttended}
                                onPress={() => handleMarkAttendance(item.id, true)}
                                activeOpacity={0.8}
                              >
                                <Check size={12} color="#FFFFFF" style={{ marginRight: 3 }} />
                                <AppText style={styles.actionBtnAttendedText}>Mark Attended</AppText>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}

                        {/* CASE D: WAITLISTED */}
                        {item.status === 'waitlisted' && (
                          <View style={styles.actionButtonGroup}>
                            <TouchableOpacity
                              style={styles.actionBtnPromote}
                              onPress={() => handlePromote(item)}
                              activeOpacity={0.8}
                            >
                              <AppText style={styles.actionBtnPromoteText}>
                                Promote to Registered
                              </AppText>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.actionBtnCancel}
                              onPress={() => handleCancelRegistration(item)}
                              activeOpacity={0.7}
                            >
                              <AppText style={styles.actionBtnCancelText}>Cancel Waitlist</AppText>
                            </TouchableOpacity>
                          </View>
                        )}

                        {/* CASE E: CANCELLED */}
                        {item.status === 'cancelled' && (
                          <View style={styles.statusStateRow}>
                            <AppText style={styles.cancelledText}>
                              Cancelled • Spot released to waitlist
                            </AppText>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                }}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalSheetContainer: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  modalSheetMobile: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: '75%',
    paddingBottom: 24,
  },
  modalDialogDesktop: {
    maxWidth: 640,
    maxHeight: '85%',
    borderRadius: 20,
    marginBottom: 'auto',
    marginTop: 'auto',
    borderWidth: 1,
    borderColor: '#E2EAE6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  sheetHandle: {
    width: 38,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  rosterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  rosterHeaderText: {
    flex: 1,
    paddingRight: 10,
  },
  rosterTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#102B2A',
    lineHeight: 21,
  },
  rosterSubtitle: {
    fontSize: 12,
    color: '#657776',
    marginTop: 2,
  },
  rosterCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rosterMetricsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
    backgroundColor: '#FAFCFB',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  rosterMetricCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2EAE6',
  },
  rosterMetricNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102B2A',
    lineHeight: 18,
  },
  rosterMetricLabel: {
    fontSize: 9.5,
    color: '#657776',
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },
  rosterTabsSection: {
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  rosterTabsContent: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rosterTabChip: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rosterTabChipSelected: {
    backgroundColor: '#176B57',
  },
  rosterTabChipText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#4B5563',
  },
  rosterTabChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  rosterControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  rosterCountText: {
    fontSize: 12,
    color: '#657776',
    fontWeight: '500',
  },
  rosterListContainer: {
    flex: 1,
    minHeight: 220,
    backgroundColor: '#FFFFFF',
  },
  rosterScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  participantCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  participantHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E5F5EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarInitials: {
    fontSize: 13,
    fontWeight: '700',
    color: '#176B57',
  },
  participantInfoCol: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  participantName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102B2A',
    lineHeight: 18,
  },
  participantEmail: {
    fontSize: 11.5,
    color: '#657776',
    lineHeight: 15,
  },
  participantTimestamp: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 1,
  },
  participantBadgeCol: {
    flexShrink: 0,
  },
  participantNotesBox: {
    marginTop: 8,
    backgroundColor: '#F8FAF9',
    borderRadius: 6,
    padding: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#176B57',
  },
  participantNotesText: {
    fontSize: 11,
    color: '#4B5563',
    fontStyle: 'italic',
  },
  participantActionsRow: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  actionButtonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  actionBtnAttended: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18794E',
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  actionBtnAttendedText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  actionBtnNoShow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDECEC',
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  actionBtnNoShowText: {
    color: '#B42318',
    fontSize: 11,
    fontWeight: '600',
  },
  actionBtnCancel: {
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  actionBtnCancelText: {
    color: '#4B5563',
    fontSize: 11,
    fontWeight: '500',
  },
  actionBtnPromote: {
    backgroundColor: '#176B57',
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  actionBtnPromoteText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  statusStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  statusStateTagSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusStateTagSuccessText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#18794E',
  },
  statusStateTagError: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusStateTagErrorText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B42318',
  },
  actionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  actionBtnOutlineText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '500',
  },
  cancelledText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
});

