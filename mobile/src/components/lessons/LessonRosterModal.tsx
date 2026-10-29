/**
 * Aught2 Pickleball — Lesson Roster & Attendance Modal
 *
 * Full-featured roster dialog for club owners and managers:
 *   - Live enrollment, attendance, no-show, and remaining capacity metrics
 *   - Status filtering (All, Registered, Attended, No Show, Cancelled)
 *   - Attendance actions (Mark Attended, Mark No Show, Reset Attendance, Cancel Registration)
 *   - Seamless member registration (Search active club players, verify capacity, add with notes)
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Check,
  Plus,
  RotateCcw,
  Search,
  UserCheck,
  Users,
  UserX,
  X,
} from 'lucide-react-native';

import { AppText, Badge, Button, EmptyState, LoadingState } from '@/components';
import {
  useClubPlayerMembers,
  useLessonRegistrations,
  useStaffCancelLessonRegistration,
  useStaffMarkLessonAttendance,
  useStaffRegisterLessonPlayer,
  useStaffResetLessonAttendance,
} from '@/hooks';
import {
  LESSON_REGISTRATION_STATUS_LABELS,
  type ClubLesson,
  type ClubPlayerMember,
  type LessonRegistration,
  type LessonRegistrationStatus,
} from '@/types';
import { formatCurrency } from '@/utils';

function formatLessonSchedule(iso: string): string {
  try {
    const d = new Date(iso);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${year}, ${hours}:${minutes}`;
  } catch {
    return iso;
  }
}

export interface LessonRosterModalProps {
  clubId: string;
  lesson: ClubLesson | null;
  visible?: boolean;
  onClose: () => void;
}

export function LessonRosterModal({
  clubId,
  lesson,
  visible = true,
  onClose,
}: LessonRosterModalProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isDesktop = windowWidth >= 768;

  const lessonId = lesson?.id || '';

  const { data: registrations = [], isLoading, refetch } = useLessonRegistrations(
    clubId,
    lessonId,
  );
  const markAttendanceMutation = useStaffMarkLessonAttendance(clubId, lessonId);
  const resetAttendanceMutation = useStaffResetLessonAttendance(clubId, lessonId);
  const cancelRegMutation = useStaffCancelLessonRegistration(clubId, lessonId);
  const registerPlayerMutation = useStaffRegisterLessonPlayer(clubId, lessonId);

  // Club player members query for search & registration
  const { playerMembers, isLoading: isLoadingPlayers } = useClubPlayerMembers(clubId);

  // State
  const [filterStatus, setFilterStatus] = useState<LessonRegistrationStatus | 'all'>('all');
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<ClubPlayerMember | null>(null);
  const [staffNotes, setStaffNotes] = useState('');

  // Persisted metrics calculation
  const counts = useMemo(() => {
    let reg = 0;
    let att = 0;
    let noShow = 0;
    let canc = 0;

    for (const r of registrations) {
      if (r.status === 'registered') reg++;
      else if (r.status === 'attended') att++;
      else if (r.status === 'no_show') noShow++;
      else if (r.status === 'cancelled') canc++;
    }

    const activeSpots = reg + att + noShow;
    const availableSpots =
      lesson?.capacity !== null && lesson?.capacity !== undefined
        ? Math.max(0, lesson.capacity - activeSpots)
        : null;

    return { reg, att, noShow, canc, activeSpots, availableSpots, total: registrations.length };
  }, [registrations, lesson?.capacity]);

  // Filtered view
  const filteredRegistrations = useMemo(() => {
    if (filterStatus === 'all') return registrations;
    return registrations.filter((r) => r.status === filterStatus);
  }, [registrations, filterStatus]);

  // Already registered user IDs
  const activeUserIds = useMemo(() => {
    return new Set(
      registrations
        .filter((r) => r.status !== 'cancelled')
        .map((r) => r.user_id),
    );
  }, [registrations]);

  // Filtered eligible players for search
  const filteredClubPlayers = useMemo(() => {
    const q = playerSearchQuery.trim().toLowerCase();
    return playerMembers.filter((pm) => {
      if (!q) return true;
      const name = (pm.user_full_name || '').toLowerCase();
      const email = (pm.user_email || '').toLowerCase();
      const num = (pm.membership_number || '').toLowerCase();
      return name.includes(q) || email.includes(q) || num.includes(q);
    });
  }, [playerMembers, playerSearchQuery]);

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

  const handleCancelRegistration = (reg: LessonRegistration) => {
    const playerName = reg.user_full_name || reg.user_name || reg.user_email || 'this participant';
    Alert.alert(
      'Cancel Registration',
      `Cancel registration for ${playerName}? This participant will be excluded from the active capacity count.`,
      [
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
      ],
    );
  };

  const handleConfirmRegistration = async () => {
    if (!selectedPlayer) {
      Alert.alert('Selection Error', 'Please select a player to register.');
      return;
    }

    if (!lesson) return;

    if (lesson.capacity !== null && lesson.capacity !== undefined) {
      if (counts.activeSpots >= lesson.capacity) {
        Alert.alert(
          'Lesson Full',
          `This lesson is currently at maximum capacity (${counts.activeSpots}/${lesson.capacity} enrolled).`,
        );
        return;
      }
    }

    try {
      await registerPlayerMutation.mutateAsync({
        user_id: selectedPlayer.user_id,
        notes: staffNotes.trim() || undefined,
      });
      setSelectedPlayer(null);
      setStaffNotes('');
      setPlayerSearchQuery('');
      setShowAddParticipant(false);
      refetch();
      Alert.alert(
        'Player Registered',
        `${selectedPlayer.user_full_name || selectedPlayer.user_email} has been registered for "${lesson.title}".`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to register player';
      Alert.alert('Registration Failed', msg);
    }
  };

  if (!lesson || !visible) return null;

  const capacityInfo =
    lesson.capacity !== null && lesson.capacity !== undefined
      ? `${counts.activeSpots} / ${lesson.capacity} spots filled`
      : `${counts.activeSpots} participants (unlimited capacity)`;

  const isLessonClosed = lesson.status === 'completed' || lesson.status === 'cancelled';
  const isLessonFull =
    lesson.capacity !== null && lesson.capacity !== undefined && counts.activeSpots >= lesson.capacity;

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
          {/* Mobile Handle */}
          {!isDesktop && <View style={styles.sheetHandle} />}

          {/* 1. PINNED HEADER */}
          <View style={styles.rosterHeader}>
            <View style={styles.rosterHeaderText}>
              <AppText style={styles.rosterTitle} numberOfLines={1}>
                Lesson Roster
              </AppText>
              <AppText style={styles.rosterSubtitle} numberOfLines={1}>
                {lesson.title} • {capacityInfo}
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

          {/* 2. PINNED SUMMARY METRICS BAR */}
          <View style={styles.rosterMetricsBar}>
            <View style={styles.rosterMetricCard}>
              <AppText style={styles.rosterMetricVal}>{counts.activeSpots}</AppText>
              <AppText style={styles.rosterMetricLabel}>Enrolled</AppText>
            </View>
            <View style={styles.rosterMetricCard}>
              <AppText style={[styles.rosterMetricVal, { color: '#0F766E' }]}>{counts.att}</AppText>
              <AppText style={styles.rosterMetricLabel}>Attended</AppText>
            </View>
            <View style={styles.rosterMetricCard}>
              <AppText style={[styles.rosterMetricVal, { color: '#D97706' }]}>{counts.noShow}</AppText>
              <AppText style={styles.rosterMetricLabel}>No Show</AppText>
            </View>
            <View style={styles.rosterMetricCard}>
              <AppText style={[styles.rosterMetricVal, { color: '#137333' }]}>
                {counts.availableSpots !== null ? counts.availableSpots : '∞'}
              </AppText>
              <AppText style={styles.rosterMetricLabel}>Available</AppText>
            </View>
          </View>

          {/* 3. PINNED ACTION & FILTER BAR */}
          <View style={styles.rosterActionsBar}>
            {!showAddParticipant ? (
              <TouchableOpacity
                style={[
                  styles.addParticipantBtn,
                  (isLessonClosed || isLessonFull) && styles.addParticipantBtnDisabled,
                ]}
                onPress={() => {
                  if (isLessonClosed) {
                    Alert.alert('Registration Closed', `Cannot register players for a ${lesson.status} lesson.`);
                    return;
                  }
                  if (isLessonFull) {
                    Alert.alert('Lesson Full', `Maximum capacity of ${lesson.capacity} spots reached.`);
                    return;
                  }
                  setSelectedPlayer(null);
                  setPlayerSearchQuery('');
                  setShowAddParticipant(true);
                }}
                activeOpacity={0.8}
              >
                <Plus size={15} color="#FFFFFF" />
                <AppText style={styles.addParticipantBtnText}>
                  {isLessonClosed ? 'Registration Closed' : isLessonFull ? 'Lesson Full' : 'Add Participant'}
                </AppText>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.cancelAddParticipantBtn}
                onPress={() => {
                  setShowAddParticipant(false);
                  setSelectedPlayer(null);
                }}
                activeOpacity={0.8}
              >
                <X size={14} color="#102B2A" />
                <AppText style={styles.cancelAddParticipantText}>Back to Roster</AppText>
              </TouchableOpacity>
            )}
          </View>

          {/* 4. CONTENT AREA: EITHER PLAYER REGISTRATION FLOW OR PARTICIPANT LIST */}
          {showAddParticipant ? (
            /* ─── WORKFLOW: REGISTER PLAYER ─── */
            <ScrollView
              style={styles.rosterScrollList}
              contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Lesson Context Banner */}
              <View style={styles.registrationContextCard}>
                <View style={styles.contextHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <AppText style={styles.contextLessonTitle} numberOfLines={1}>
                      {lesson.title}
                    </AppText>
                    <AppText style={styles.contextLessonMeta}>
                      {formatLessonSchedule(lesson.start_at)}
                      {lesson.court_name ? ` • ${lesson.court_name}` : ''}
                      {lesson.coach_name ? ` • Coach ${lesson.coach_name}` : ''}
                    </AppText>
                  </View>
                  <View style={styles.contextPricePill}>
                    <AppText style={styles.contextPriceText}>
                      {Number(lesson.price) === 0 ? 'Free' : formatCurrency(Number(lesson.price))}
                    </AppText>
                  </View>
                </View>
                <View style={styles.contextSpotsRow}>
                  <Users size={13} color="#137333" />
                  <AppText style={styles.contextSpotsText}>
                    {counts.availableSpots !== null
                      ? `${counts.availableSpots} of ${lesson.capacity} spots remaining`
                      : 'Unlimited capacity'}
                  </AppText>
                </View>
              </View>

              {!selectedPlayer ? (
                /* STEP 1: SEARCH & SELECT PLAYER */
                <View style={{ marginTop: 12 }}>
                  <AppText style={styles.stepTitle}>Select Player</AppText>
                  <AppText style={styles.stepSubtitle}>
                    Search registered club members by player name or email address.
                  </AppText>

                  {/* Search Input */}
                  <View style={styles.playerSearchBox}>
                    <Search size={16} color="#667776" />
                    <TextInput
                      style={styles.playerSearchInput}
                      placeholder="Search club players..."
                      placeholderTextColor="#889998"
                      value={playerSearchQuery}
                      onChangeText={setPlayerSearchQuery}
                      autoCapitalize="none"
                    />
                    {playerSearchQuery ? (
                      <TouchableOpacity onPress={() => setPlayerSearchQuery('')}>
                        <X size={15} color="#889998" />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {/* Player Candidates */}
                  {isLoadingPlayers ? (
                    <LoadingState message="Loading club players..." />
                  ) : filteredClubPlayers.length === 0 ? (
                    <View style={styles.noPlayersFoundBox}>
                      <AppText style={styles.noPlayersFoundText}>
                        No club members found matching "{playerSearchQuery}".
                      </AppText>
                    </View>
                  ) : (
                    <View style={{ gap: 8, marginTop: 8 }}>
                      {filteredClubPlayers.slice(0, 15).map((pm) => {
                        const isEnrolled = activeUserIds.has(pm.user_id);
                        const isInactive = pm.status !== 'active';
                        const disabled = isEnrolled || isInactive;

                        return (
                          <TouchableOpacity
                            key={pm.id}
                            style={[
                              styles.playerCandidateCard,
                              disabled && styles.playerCandidateDisabled,
                            ]}
                            onPress={() => {
                              if (!disabled) {
                                setSelectedPlayer(pm);
                              }
                            }}
                            activeOpacity={disabled ? 1 : 0.7}
                          >
                            <View style={styles.playerAvatarCircle}>
                              <AppText style={styles.playerAvatarInitials}>
                                {(pm.user_full_name || pm.user_email || 'PL').slice(0, 2).toUpperCase()}
                              </AppText>
                            </View>

                            <View style={{ flex: 1, minWidth: 0 }}>
                              <AppText style={styles.playerCandidateName} numberOfLines={1}>
                                {pm.user_full_name || pm.user_email}
                              </AppText>
                              <AppText style={styles.playerCandidateEmail} numberOfLines={1}>
                                {pm.user_email}
                                {pm.membership_number ? ` • #${pm.membership_number}` : ''}
                              </AppText>
                            </View>

                            {isEnrolled ? (
                              <View style={styles.alreadyEnrolledBadge}>
                                <AppText style={styles.alreadyEnrolledText}>Already Enrolled</AppText>
                              </View>
                            ) : isInactive ? (
                              <View style={styles.inactiveMemberBadge}>
                                <AppText style={styles.inactiveMemberText}>Inactive</AppText>
                              </View>
                            ) : (
                              <View style={styles.selectPlayerBadge}>
                                <AppText style={styles.selectPlayerText}>Select</AppText>
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              ) : (
                /* STEP 2: CONFIRM REGISTRATION & NOTES */
                <View style={{ marginTop: 12 }}>
                  <AppText style={styles.stepTitle}>Confirm Registration</AppText>
                  <AppText style={styles.stepSubtitle}>
                    Review player and enrollment details before confirming.
                  </AppText>

                  {/* Selected Player Card */}
                  <View style={styles.selectedPlayerSummaryCard}>
                    <View style={styles.playerAvatarCircleSelected}>
                      <AppText style={styles.playerAvatarInitialsSelected}>
                        {(selectedPlayer.user_full_name || selectedPlayer.user_email || 'PL').slice(0, 2).toUpperCase()}
                      </AppText>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText style={styles.selectedPlayerName}>
                        {selectedPlayer.user_full_name || selectedPlayer.user_email}
                      </AppText>
                      <AppText style={styles.selectedPlayerEmail}>
                        {selectedPlayer.user_email}
                      </AppText>
                      {selectedPlayer.membership_number ? (
                        <AppText style={styles.selectedPlayerMemberNum}>
                          Member #{selectedPlayer.membership_number} • Active
                        </AppText>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      style={styles.changePlayerBtn}
                      onPress={() => setSelectedPlayer(null)}
                    >
                      <AppText style={styles.changePlayerBtnText}>Change</AppText>
                    </TouchableOpacity>
                  </View>

                  {/* Staff Notes */}
                  <View style={{ marginTop: 16 }}>
                    <AppText style={styles.inputLabel}>
                      Staff Notes (Optional)
                    </AppText>
                    <TextInput
                      style={styles.notesInput}
                      placeholder="Special instructions, skill notes, or payment reference..."
                      placeholderTextColor="#889998"
                      value={staffNotes}
                      onChangeText={setStaffNotes}
                      multiline
                      numberOfLines={3}
                    />
                  </View>

                  {/* Actions */}
                  <View style={styles.confirmRegActionsRow}>
                    <Button
                      label="Back"
                      variant="secondary"
                      size="md"
                      onPress={() => setSelectedPlayer(null)}
                      style={{ flex: 1 }}
                    />
                    <Button
                      label={registerPlayerMutation.isPending ? 'Registering...' : 'Confirm Registration'}
                      variant="primary"
                      size="md"
                      loading={registerPlayerMutation.isPending}
                      onPress={handleConfirmRegistration}
                      style={{ flex: 2 }}
                    />
                  </View>
                </View>
              )}
            </ScrollView>
          ) : (
            /* ─── PARTICIPANT ROSTER LIST ─── */
            <>
              {/* Horizontal Status Filter Chips */}
              <View style={styles.rosterChipsContainer}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rosterChipsContent}
                >
                  <TouchableOpacity
                    style={[
                      styles.rosterChip,
                      filterStatus === 'all' && styles.rosterChipActive,
                    ]}
                    onPress={() => setFilterStatus('all')}
                  >
                    <AppText
                      style={[
                        styles.rosterChipText,
                        filterStatus === 'all' && styles.rosterChipTextActive,
                      ]}
                    >
                      All ({counts.total})
                    </AppText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.rosterChip,
                      filterStatus === 'registered' && styles.rosterChipActive,
                    ]}
                    onPress={() => setFilterStatus('registered')}
                  >
                    <AppText
                      style={[
                        styles.rosterChipText,
                        filterStatus === 'registered' && styles.rosterChipTextActive,
                      ]}
                    >
                      Registered ({counts.reg})
                    </AppText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.rosterChip,
                      filterStatus === 'attended' && styles.rosterChipActive,
                    ]}
                    onPress={() => setFilterStatus('attended')}
                  >
                    <AppText
                      style={[
                        styles.rosterChipText,
                        filterStatus === 'attended' && styles.rosterChipTextActive,
                      ]}
                    >
                      Attended ({counts.att})
                    </AppText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.rosterChip,
                      filterStatus === 'no_show' && styles.rosterChipActive,
                    ]}
                    onPress={() => setFilterStatus('no_show')}
                  >
                    <AppText
                      style={[
                        styles.rosterChipText,
                        filterStatus === 'no_show' && styles.rosterChipTextActive,
                      ]}
                    >
                      No Show ({counts.noShow})
                    </AppText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.rosterChip,
                      filterStatus === 'cancelled' && styles.rosterChipActive,
                    ]}
                    onPress={() => setFilterStatus('cancelled')}
                  >
                    <AppText
                      style={[
                        styles.rosterChipText,
                        filterStatus === 'cancelled' && styles.rosterChipTextActive,
                      ]}
                    >
                      Cancelled ({counts.canc})
                    </AppText>
                  </TouchableOpacity>
                </ScrollView>
              </View>

              {/* Scrollable Participant List */}
              <View style={styles.rosterListWrap}>
                {isLoading ? (
                  <LoadingState message="Loading participants..." />
                ) : filteredRegistrations.length === 0 ? (
                  <EmptyState
                    title="No Participants Found"
                    description={
                      filterStatus === 'all'
                        ? 'No players are currently enrolled in this lesson.'
                        : `No participants found with status "${filterStatus}".`
                    }
                  />
                ) : (
                  <FlatList
                    data={filteredRegistrations}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20 }}
                    renderItem={({ item }) => (
                      <View style={styles.participantCard}>
                        {/* Header: Avatar, Name, Email, Status */}
                        <View style={styles.participantTopRow}>
                          <View style={styles.participantAvatar}>
                            <AppText style={styles.participantInitials}>
                              {(item.user_full_name || item.user_name || item.user_email || 'PL')
                                .slice(0, 2)
                                .toUpperCase()}
                            </AppText>
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <AppText style={styles.participantName} numberOfLines={1}>
                              {item.user_full_name || item.user_name || item.user_email}
                            </AppText>
                            <AppText style={styles.participantEmail} numberOfLines={1}>
                              {item.user_email || 'Club Member'}
                            </AppText>
                          </View>
                          <Badge
                            label={LESSON_REGISTRATION_STATUS_LABELS[item.status] || item.status}
                            variant={
                              item.status === 'attended' || item.status === 'registered'
                                ? 'success'
                                : item.status === 'no_show'
                                ? 'error'
                                : 'default'
                            }
                          />
                        </View>

                        {/* Notes if present */}
                        {item.notes ? (
                          <View style={styles.participantNotesCard}>
                            <AppText style={styles.participantNotesText}>
                              Note: {item.notes}
                            </AppText>
                          </View>
                        ) : null}

                        {/* Status Actions */}
                        <View style={styles.participantActionsRow}>
                          {item.status === 'registered' && (
                            <View style={styles.actionPillsGroup}>
                              <TouchableOpacity
                                style={styles.markAttendedBtn}
                                onPress={() => handleMarkAttendance(item.id, true)}
                                activeOpacity={0.8}
                              >
                                <Check size={13} color="#FFFFFF" />
                                <AppText style={styles.markAttendedText}>Mark Attended</AppText>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.markNoShowBtn}
                                onPress={() => handleMarkAttendance(item.id, false)}
                                activeOpacity={0.8}
                              >
                                <UserX size={13} color="#B42318" />
                                <AppText style={styles.markNoShowText}>No Show</AppText>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={styles.cancelRegBtn}
                                onPress={() => handleCancelRegistration(item)}
                                activeOpacity={0.8}
                              >
                                <AppText style={styles.cancelRegText}>Cancel Spot</AppText>
                              </TouchableOpacity>
                            </View>
                          )}

                          {item.status === 'attended' && (
                            <View style={styles.stateIndicatorRow}>
                              <View style={styles.attendedStateBadge}>
                                <UserCheck size={13} color="#18794E" />
                                <AppText style={styles.attendedStateText}>Attended</AppText>
                              </View>
                              <View style={{ flexDirection: 'row', gap: 6 }}>
                                <TouchableOpacity
                                  style={styles.resetBtn}
                                  onPress={() => handleResetAttendance(item.id)}
                                  activeOpacity={0.8}
                                >
                                  <RotateCcw size={12} color="#475569" />
                                  <AppText style={styles.resetBtnText}>Reset</AppText>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={styles.markNoShowBtn}
                                  onPress={() => handleMarkAttendance(item.id, false)}
                                  activeOpacity={0.8}
                                >
                                  <UserX size={12} color="#B42318" />
                                  <AppText style={styles.markNoShowText}>No Show</AppText>
                                </TouchableOpacity>
                              </View>
                            </View>
                          )}

                          {item.status === 'no_show' && (
                            <View style={styles.stateIndicatorRow}>
                              <View style={styles.noShowStateBadge}>
                                <UserX size={13} color="#B42318" />
                                <AppText style={styles.noShowStateText}>Marked No Show</AppText>
                              </View>
                              <View style={{ flexDirection: 'row', gap: 6 }}>
                                <TouchableOpacity
                                  style={styles.resetBtn}
                                  onPress={() => handleResetAttendance(item.id)}
                                  activeOpacity={0.8}
                                >
                                  <RotateCcw size={12} color="#475569" />
                                  <AppText style={styles.resetBtnText}>Reset</AppText>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={styles.markAttendedBtn}
                                  onPress={() => handleMarkAttendance(item.id, true)}
                                  activeOpacity={0.8}
                                >
                                  <Check size={12} color="#FFFFFF" />
                                  <AppText style={styles.markAttendedText}>Attended</AppText>
                                </TouchableOpacity>
                              </View>
                            </View>
                          )}

                          {item.status === 'cancelled' && (
                            <AppText style={styles.cancelledStateText}>
                              Registration cancelled • Spot released
                            </AppText>
                          )}
                        </View>
                      </View>
                    )}
                  />
                )}
              </View>
            </>
          )}
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
    minHeight: '80%',
    paddingBottom: 24,
  },
  modalDialogDesktop: {
    maxWidth: 640,
    maxHeight: '88%',
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
  rosterMetricsBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
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
  rosterMetricVal: {
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
  rosterActionsBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  addParticipantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#176B57',
    borderRadius: 12,
    paddingVertical: 9,
    gap: 6,
  },
  addParticipantBtnDisabled: {
    backgroundColor: '#9CA3AF',
  },
  addParticipantBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  cancelAddParticipantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 8,
    gap: 6,
  },
  cancelAddParticipantText: {
    color: '#102B2A',
    fontSize: 12.5,
    fontWeight: '600',
  },
  rosterScrollList: {
    flex: 1,
  },
  registrationContextCard: {
    backgroundColor: '#EDF7F2',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#D5EAE0',
    marginBottom: 8,
  },
  contextHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  contextLessonTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102B2A',
  },
  contextLessonMeta: {
    fontSize: 11,
    color: '#4A605A',
    marginTop: 2,
  },
  contextPricePill: {
    backgroundColor: '#D9EFE4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  contextPriceText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#176B57',
  },
  contextSpotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#DEEFE7',
  },
  contextSpotsText: {
    fontSize: 11.5,
    color: '#137333',
    fontWeight: '600',
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102B2A',
  },
  stepSubtitle: {
    fontSize: 11.5,
    color: '#657776',
    marginTop: 2,
    marginBottom: 10,
  },
  playerSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAF9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    paddingHorizontal: 10,
    height: 40,
    gap: 8,
    marginBottom: 8,
  },
  playerSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#102B2A',
  },
  noPlayersFoundBox: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPlayersFoundText: {
    fontSize: 12.5,
    color: '#657776',
  },
  playerCandidateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 10,
    gap: 10,
  },
  playerCandidateDisabled: {
    opacity: 0.6,
    backgroundColor: '#F9FAFB',
  },
  playerAvatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E5F5EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerAvatarInitials: {
    fontSize: 12,
    fontWeight: '700',
    color: '#176B57',
  },
  playerCandidateName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102B2A',
  },
  playerCandidateEmail: {
    fontSize: 11,
    color: '#657776',
    marginTop: 1,
  },
  alreadyEnrolledBadge: {
    backgroundColor: '#EAF2FB',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  alreadyEnrolledText: {
    fontSize: 10.5,
    color: '#2563A8',
    fontWeight: '600',
  },
  inactiveMemberBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  inactiveMemberText: {
    fontSize: 10.5,
    color: '#6B7280',
    fontWeight: '500',
  },
  selectPlayerBadge: {
    backgroundColor: '#176B57',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  selectPlayerText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  selectedPlayerSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9F5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BEE3D2',
    padding: 12,
    gap: 10,
  },
  playerAvatarCircleSelected: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#176B57',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerAvatarInitialsSelected: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  selectedPlayerName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#102B2A',
  },
  selectedPlayerEmail: {
    fontSize: 11,
    color: '#657776',
    marginTop: 1,
  },
  selectedPlayerMemberNum: {
    fontSize: 10.5,
    color: '#18794E',
    fontWeight: '600',
    marginTop: 2,
  },
  changePlayerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  changePlayerBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#102B2A',
    marginBottom: 4,
  },
  notesInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 10,
    fontSize: 12.5,
    color: '#102B2A',
    minHeight: 70,
    textAlignVertical: 'top',
  },
  confirmRegActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  rosterChipsContainer: {
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  rosterChipsContent: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 6,
  },
  rosterChip: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rosterChipActive: {
    backgroundColor: '#176B57',
  },
  rosterChipText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#4B5563',
  },
  rosterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  rosterListWrap: {
    flex: 1,
    minHeight: 220,
  },
  participantCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
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
  participantTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  participantAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E5F5EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantInitials: {
    fontSize: 12,
    fontWeight: '700',
    color: '#176B57',
  },
  participantName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#102B2A',
  },
  participantEmail: {
    fontSize: 11,
    color: '#657776',
  },
  participantNotesCard: {
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
  actionPillsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  markAttendedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18794E',
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 10,
    gap: 4,
  },
  markAttendedText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  markNoShowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDECEC',
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 10,
    gap: 4,
  },
  markNoShowText: {
    color: '#B42318',
    fontSize: 11,
    fontWeight: '600',
  },
  cancelRegBtn: {
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  cancelRegText: {
    color: '#4B5563',
    fontSize: 11,
    fontWeight: '500',
  },
  stateIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  attendedStateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  attendedStateText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#18794E',
  },
  noShowStateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  noShowStateText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B42318',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 3,
  },
  resetBtnText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '500',
  },
  cancelledStateText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
});

