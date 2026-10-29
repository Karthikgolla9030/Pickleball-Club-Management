/**
 * Aught2 Pickleball — Unified Club Lesson Details Screen
 *
 * Owner & Manager single-page lesson details with direct inline registration overview:
 *   - Direct URL and browser refresh support via lesson ID parameter
 *   - Seamless Back navigation preserving club context and list filter
 *   - Lesson Hero image with club coaching default fallback & status badge overlay
 *   - Lesson Overview with format, lesson type, fee, and full description
 *   - Dedicated "Schedule & Assignments" section with Coach, Court, and Capacity
 *   - Integrated "Registration Overview" section:
 *       * Live status summary cards (Enrolled, Attended, No Show, Available, Cancelled)
 *       * Real-time capacity and remaining spaces
 *       * Interactive status filter chips
 *       * Direct inline participant list with real names, emails, dates, notes, and attendance
 *       * Empty state when no participants exist (strictly without Add Player / View Roster buttons)
 *   - Lifecycle management actions: Publish, Complete, Cancel
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  MoreVertical,
  PlayCircle,
  RotateCcw,
  Tag,
  User,
  UserCheck,
  Users,
  UserX,
  XCircle,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
} from '@/components';
import {
  useActiveClub,
  useCancelClubLesson,
  useClubBranding,
  useClubLesson,
  useCompleteClubLesson,
  useLessonRegistrations,
  usePermission,
  usePublishClubLesson,
  useStaffCancelLessonRegistration,
  useStaffMarkLessonAttendance,
  useStaffResetLessonAttendance,
} from '@/hooks';
import { Colors, Radius, Spacing } from '@/theme';
import { formatCurrency } from '@/utils';
import { resolveLessonImage } from '@/utils/imageResolution';
import {
  LESSON_REGISTRATION_STATUS_LABELS,
  LESSON_STATUS_LABELS,
  type ClubLesson,
  type LessonRegistration,
  type LessonRegistrationStatus,
} from '@/types';

function formatLessonDateTime(startIso: string, endIso: string) {
  try {
    const dStart = new Date(startIso);
    const dEnd = new Date(endIso);
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const weekday = weekdays[dStart.getDay()];
    const day = dStart.getDate();
    const month = months[dStart.getMonth()];
    const year = dStart.getFullYear();
    const dateStr = `${weekday}, ${day} ${month} ${year}`;

    const formatTime12 = (d: Date) => {
      let hours = d.getHours();
      const minutes = d.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const hStr = hours < 10 ? `0${hours}` : `${hours}`;
      const mStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
      return `${hStr}:${mStr} ${ampm}`;
    };

    return {
      date: dateStr,
      time: `${formatTime12(dStart)} – ${formatTime12(dEnd)}`,
    };
  } catch {
    return { date: 'Fri, 30 Oct 2026', time: '09:00 AM – 10:00 AM' };
  }
}

function formatRegistrationDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

export default function LessonDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; lessonId?: string; clubId?: string }>();
  const lessonId = params.id || params.lessonId || '';

  const { clubId: activeClubId } = useActiveClub();
  const clubId = params.clubId || activeClubId || '';

  const { canManageLessons } = usePermission();
  const { data: clubBranding } = useClubBranding(clubId);

  const [filterStatus, setFilterStatus] = useState<LessonRegistrationStatus | 'all'>('all');
  const [isExpanded, setIsExpanded] = useState(false);

  // Fetch lesson details
  const {
    data: lesson,
    isLoading,
    isError,
    error,
    refetch,
  } = useClubLesson(clubId, lessonId);

  // Fetch registrations for live attendance, capacity and integrated participant list
  const {
    data: registrations = [],
    isLoading: isLoadingRegistrations,
    refetch: refetchRegistrations,
  } = useLessonRegistrations(clubId, lessonId);

  // Lifecycle mutations
  const publishMutation = usePublishClubLesson(clubId);
  const cancelMutation = useCancelClubLesson(clubId);
  const completeMutation = useCompleteClubLesson(clubId);

  // Attendance mutations
  const markAttendanceMutation = useStaffMarkLessonAttendance(clubId, lessonId);
  const resetAttendanceMutation = useStaffResetLessonAttendance(clubId, lessonId);
  const cancelRegMutation = useStaffCancelLessonRegistration(clubId, lessonId);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(club)/lessons' as never);
    }
  };

  // Authoritative status counts
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

    return {
      reg,
      att,
      noShow,
      canc,
      activeSpots,
      availableSpots,
      total: registrations.length,
    };
  }, [registrations, lesson?.capacity]);

  // Filtered participant list
  const filteredRegistrations = useMemo(() => {
    if (filterStatus === 'all') return registrations;
    return registrations.filter((r) => r.status === filterStatus);
  }, [registrations, filterStatus]);

  // Expandable subset
  const displayedRegistrations = useMemo(() => {
    if (isExpanded || filteredRegistrations.length <= 8) {
      return filteredRegistrations;
    }
    return filteredRegistrations.slice(0, 8);
  }, [filteredRegistrations, isExpanded]);

  const handlePublish = () => {
    if (!lesson) return;
    Alert.alert('Publish Lesson', `Publish "${lesson.title}"? Club members will be able to register.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Publish',
        onPress: async () => {
          try {
            await publishMutation.mutateAsync(lesson.id);
            refetch();
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Publish failed';
            Alert.alert('Error', msg);
          }
        },
      },
    ]);
  };

  const handleCancelLesson = () => {
    if (!lesson) return;
    Alert.alert('Cancel Lesson', `Are you sure you want to cancel "${lesson.title}"? Active registrations will be cancelled.`, [
      { text: 'Back', style: 'cancel' },
      {
        text: 'Confirm Cancel',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelMutation.mutateAsync(lesson.id);
            refetch();
            refetchRegistrations();
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Cancellation failed';
            Alert.alert('Error', msg);
          }
        },
      },
    ]);
  };

  const handleCompleteLesson = () => {
    if (!lesson) return;
    Alert.alert('Complete Lesson', `Mark "${lesson.title}" as completed?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete',
        onPress: async () => {
          try {
            await completeMutation.mutateAsync(lesson.id);
            refetch();
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Complete failed';
            Alert.alert('Error', msg);
          }
        },
      },
    ]);
  };

  const handleOpenActionMenu = () => {
    if (!lesson) return;
    const isDraft = lesson.status === 'draft';
    const isPublished = lesson.status === 'published';
    const isCompleted = lesson.status === 'completed';

    const options: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];

    if (isDraft) {
      options.push({ text: 'Publish Lesson', onPress: handlePublish });
    }
    if (isPublished) {
      options.push({ text: 'Complete Lesson', onPress: handleCompleteLesson });
    }
    if (!isCompleted && lesson.status !== 'cancelled') {
      options.push({ text: 'Cancel Lesson', style: 'destructive', onPress: handleCancelLesson });
    }
    options.push({ text: 'Close', style: 'cancel' });

    Alert.alert(lesson.title, 'Lesson Actions', options);
  };

  const handleMarkAttendance = async (registrationId: string, attended: boolean) => {
    try {
      await markAttendanceMutation.mutateAsync({ registrationId, attended });
      refetchRegistrations();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update attendance';
      Alert.alert('Attendance Error', msg);
    }
  };

  const handleResetAttendance = async (registrationId: string) => {
    try {
      await resetAttendanceMutation.mutateAsync(registrationId);
      refetchRegistrations();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset attendance';
      Alert.alert('Reset Error', msg);
    }
  };

  const handleCancelRegistration = (reg: LessonRegistration) => {
    const playerName = reg.user_full_name || reg.user_name || reg.user_email || 'this player';
    Alert.alert(
      'Cancel Registration',
      `Cancel lesson registration for ${playerName}?`,
      [
        { text: 'Keep Spot', style: 'cancel' },
        {
          text: 'Confirm Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelRegMutation.mutateAsync(reg.id);
              refetchRegistrations();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Cancellation failed';
              Alert.alert('Error', msg);
            }
          },
        },
      ],
    );
  };

  if (!canManageLessons) {
    return (
      <Screen style={styles.container}>
        <AppHeader title="Lesson Details" showBack={true} />
        <EmptyState
          title="Access Restricted"
          description="Only club owners and managers have permission to view and manage club lessons."
          actionLabel="Back to Lessons"
          onAction={handleBack}
        />
      </Screen>
    );
  }

  if (isLoading) {
    return (
      <Screen style={styles.container}>
        <AppHeader title="Lesson Details" showBack={true} />
        <LoadingState message="Loading lesson details..." />
      </Screen>
    );
  }

  if (isError || !lesson) {
    const isNotFound = !lesson || (error as any)?.status === 404;
    return (
      <Screen style={styles.container}>
        <AppHeader title="Lesson Details" showBack={true} />
        {isNotFound ? (
          <EmptyState
            title="Lesson Not Found"
            description="The requested lesson could not be found or has been removed."
            actionLabel="Back to Lessons"
            onAction={handleBack}
          />
        ) : (
          <ErrorState
            title="Unable to Load Lesson"
            message={error instanceof Error ? error.message : 'An error occurred while loading lesson details.'}
            onRetry={refetch}
          />
        )}
      </Screen>
    );
  }

  const schedule = formatLessonDateTime(lesson.start_at, lesson.end_at);
  const cardImg = resolveLessonImage(lesson, clubBranding);

  const feeDisplay =
    Number(lesson.price) > 0 ? formatCurrency(Number(lesson.price)) : 'Free';

  const isDraft = lesson.status === 'draft';
  const isPublished = lesson.status === 'published';
  const isCompleted = lesson.status === 'completed';
  const isCancelled = lesson.status === 'cancelled';

  const getStatusBadgeStyle = () => {
    switch (lesson.status) {
      case 'completed':
        return { bg: '#E3F2FD', text: '#2563A8' };
      case 'published':
        return { bg: '#E8F5E9', text: '#18794E' };
      case 'draft':
        return { bg: '#FFF8E1', text: '#9A6B00' };
      case 'cancelled':
      default:
        return { bg: '#FDECEC', text: '#B42318' };
    }
  };

  const statusStyle = getStatusBadgeStyle();

  const capacitySummaryText =
    lesson.capacity !== null && lesson.capacity !== undefined
      ? `${counts.activeSpots} / ${lesson.capacity} spots filled • ${counts.availableSpots !== null ? counts.availableSpots : '0'} spaces remaining`
      : `${counts.activeSpots} enrolled participants (unlimited capacity)`;

  return (
    <Screen style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F8F5" />

      {/* 1. COMPACT HEADER */}
      <AppHeader
        title={lesson.title}
        subtitle="Lesson Details & Management"
        showBack={true}
        borderless
        rightElement={
          <TouchableOpacity
            style={styles.headerMoreBtn}
            onPress={handleOpenActionMenu}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Lesson management actions"
          >
            <MoreVertical size={20} color="#102B2A" />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading || isLoadingRegistrations}
            onRefresh={() => {
              refetch();
              refetchRegistrations();
            }}
            tintColor="#176B57"
          />
        }
      >
        {/* 2. LESSON HERO COVER IMAGE */}
        <View style={styles.heroCard}>
          <Image source={cardImg} style={styles.heroImage} resizeMode="cover" />

          {/* Status Badge Overlay */}
          <View style={[styles.statusOverlayBadge, { backgroundColor: statusStyle.bg }]}>
            <AppText style={[styles.statusOverlayText, { color: statusStyle.text }]}>
              {LESSON_STATUS_LABELS[lesson.status]?.toUpperCase() || lesson.status.toUpperCase()}
            </AppText>
          </View>
        </View>

        {/* 3. LESSON OVERVIEW CARD */}
        <View style={styles.sectionCard}>
          <View style={styles.badgeRow}>
            <View style={styles.formatBadge}>
              <AppText style={styles.formatBadgeText}>
                {lesson.is_private ? 'PRIVATE LESSON' : 'GROUP CLINIC'}
              </AppText>
            </View>
            {lesson.lesson_type_name ? (
              <View style={styles.typeBadge}>
                <AppText style={styles.typeBadgeText}>
                  {lesson.lesson_type_name.toUpperCase()}
                </AppText>
              </View>
            ) : null}
            <View style={styles.feeBadge}>
              <AppText style={styles.feeBadgeText}>{feeDisplay}</AppText>
            </View>
          </View>

          {lesson.description ? (
            <AppText style={styles.descriptionText}>{lesson.description}</AppText>
          ) : (
            <AppText style={styles.noDescriptionText}>No detailed description provided for this lesson.</AppText>
          )}
        </View>

        {/* 4. SCHEDULE & ASSIGNMENTS SECTION */}
        <View style={styles.sectionCard}>
          <AppText style={styles.sectionHeading}>Schedule & Assignments</AppText>

          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <Calendar size={18} color="#176B57" />
            </View>
            <View style={styles.infoContentCol}>
              <AppText style={styles.infoLabel}>Date</AppText>
              <AppText style={styles.infoValue}>{schedule.date}</AppText>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <Clock size={18} color="#176B57" />
            </View>
            <View style={styles.infoContentCol}>
              <AppText style={styles.infoLabel}>Time</AppText>
              <AppText style={styles.infoValue}>{schedule.time}</AppText>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <User size={18} color="#176B57" />
            </View>
            <View style={styles.infoContentCol}>
              <AppText style={styles.infoLabel}>Assigned Coach</AppText>
              <AppText style={styles.infoValue}>
                {lesson.coach_name ? `Coach ${lesson.coach_name}` : 'No Coach Assigned'}
              </AppText>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <MapPin size={18} color="#176B57" />
            </View>
            <View style={styles.infoContentCol}>
              <AppText style={styles.infoLabel}>Court Assignment</AppText>
              <AppText style={styles.infoValue}>
                {lesson.court_name ? lesson.court_name : 'No Court Assigned'}
              </AppText>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <Tag size={18} color="#176B57" />
            </View>
            <View style={styles.infoContentCol}>
              <AppText style={styles.infoLabel}>Lesson Price</AppText>
              <AppText style={[styles.infoValue, { color: '#18794E', fontWeight: '700' }]}>
                {feeDisplay}
              </AppText>
            </View>
          </View>

          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <View style={styles.infoIconBox}>
              <Users size={18} color="#176B57" />
            </View>
            <View style={styles.infoContentCol}>
              <AppText style={styles.infoLabel}>Capacity & Enrollment</AppText>
              <AppText style={styles.infoValue}>
                {lesson.capacity !== null && lesson.capacity !== undefined
                  ? `${counts.activeSpots} / ${lesson.capacity} active spots`
                  : `${counts.activeSpots} participants (unlimited)`}
              </AppText>
            </View>
          </View>
        </View>

        {/* 5. INTEGRATED REGISTRATION OVERVIEW & PARTICIPANT LIST */}
        <View style={styles.sectionCard}>
          <View style={styles.rosterSectionHeader}>
            <View>
              <AppText style={styles.sectionHeading}>Registration Overview</AppText>
              <AppText style={styles.rosterCapacitySubtitle}>{capacitySummaryText}</AppText>
            </View>
          </View>

          {/* Status Metrics Bar */}
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <AppText style={styles.metricNumber}>{counts.activeSpots}</AppText>
              <AppText style={styles.metricLabel}>Enrolled</AppText>
            </View>
            <View style={styles.metricItem}>
              <AppText style={[styles.metricNumber, { color: '#18794E' }]}>
                {counts.att}
              </AppText>
              <AppText style={styles.metricLabel}>Attended</AppText>
            </View>
            <View style={styles.metricItem}>
              <AppText style={[styles.metricNumber, { color: '#B45309' }]}>
                {counts.noShow}
              </AppText>
              <AppText style={styles.metricLabel}>No Show</AppText>
            </View>
            <View style={styles.metricItem}>
              <AppText style={[styles.metricNumber, { color: '#0F766E' }]}>
                {counts.availableSpots !== null ? counts.availableSpots : '∞'}
              </AppText>
              <AppText style={styles.metricLabel}>Available</AppText>
            </View>
            <View style={styles.metricItem}>
              <AppText style={[styles.metricNumber, { color: '#64748B' }]}>
                {counts.canc}
              </AppText>
              <AppText style={styles.metricLabel}>Cancelled</AppText>
            </View>
          </View>

          {/* Status Filter Chips */}
          <View style={styles.rosterFilterContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rosterFilterScroll}
            >
              {(
                [
                  { key: 'all', label: `All (${counts.total})` },
                  { key: 'registered', label: `Enrolled (${counts.reg})` },
                  { key: 'attended', label: `Attended (${counts.att})` },
                  { key: 'no_show', label: `No Show (${counts.noShow})` },
                  { key: 'cancelled', label: `Cancelled (${counts.canc})` },
                ] as const
              ).map((chip) => {
                const isSelected = filterStatus === chip.key;
                return (
                  <TouchableOpacity
                    key={chip.key}
                    style={[styles.rosterChip, isSelected && styles.rosterChipActive]}
                    onPress={() => setFilterStatus(chip.key)}
                    activeOpacity={0.8}
                  >
                    <AppText style={[styles.rosterChipText, isSelected && styles.rosterChipTextActive]}>
                      {chip.label}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Participant Rows List */}
          <View style={styles.participantListContainer}>
            {filteredRegistrations.length === 0 ? (
              <View style={styles.emptyParticipantState}>
                <Users size={28} color="#94A3B8" style={{ marginBottom: 6 }} />
                <AppText style={styles.emptyParticipantTitle}>
                  {filterStatus === 'all' ? 'No registrations yet' : 'No participants found'}
                </AppText>
                <AppText style={styles.emptyParticipantSubtitle}>
                  {filterStatus === 'all'
                    ? 'No club members have enrolled in this coaching session yet.'
                    : `No registrations found with status "${filterStatus}".`}
                </AppText>
              </View>
            ) : (
              <>
                {displayedRegistrations.map((reg) => {
                  const playerName =
                    reg.user_full_name || reg.user_name || (reg.user_email ? reg.user_email.split('@')[0] : 'Participant');
                  const initials = playerName
                    .split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);

                  const isAttended = reg.status === 'attended';
                  const isNoShow = reg.status === 'no_show';
                  const isCancelledReg = reg.status === 'cancelled';
                  const regDate = formatRegistrationDate(reg.registered_at);

                  const getBadgeVariant = (st: LessonRegistrationStatus) => {
                    switch (st) {
                      case 'attended':
                        return 'success';
                      case 'registered':
                        return 'info';
                      case 'no_show':
                        return 'warning';
                      case 'cancelled':
                      default:
                        return 'default';
                    }
                  };

                  return (
                    <View key={reg.id} style={styles.participantRow}>
                      <View style={styles.participantLeftCol}>
                        <View style={[styles.participantAvatar, isAttended && { backgroundColor: '#18794E' }]}>
                          <AppText style={styles.avatarInitialsText}>{initials || 'P'}</AppText>
                        </View>
                        <View style={styles.participantTextCol}>
                          <View style={styles.participantNameLine}>
                            <AppText style={styles.participantName} numberOfLines={1}>
                              {playerName}
                            </AppText>
                            <Badge
                              label={LESSON_REGISTRATION_STATUS_LABELS[reg.status] || reg.status}
                              variant={getBadgeVariant(reg.status)}
                            />
                          </View>
                          {reg.user_email ? (
                            <AppText style={styles.participantEmail} numberOfLines={1}>
                              {reg.user_email}
                            </AppText>
                          ) : null}
                          <AppText style={styles.participantDateText}>
                            {regDate ? `Enrolled on ${regDate}` : 'Enrolled'}
                          </AppText>
                          {reg.notes ? (
                            <AppText style={styles.participantNotesText} numberOfLines={2}>
                              Note: {reg.notes}
                            </AppText>
                          ) : null}
                        </View>
                      </View>

                      {/* Staff Attendance Quick Actions */}
                      {!isCancelledReg && (
                        <View style={styles.participantActionsCol}>
                          {!isAttended && (
                            <TouchableOpacity
                              style={[styles.attActionBtn, styles.attActionAttended]}
                              onPress={() => handleMarkAttendance(reg.id, true)}
                              activeOpacity={0.8}
                              accessibilityLabel={`Mark ${playerName} attended`}
                            >
                              <UserCheck size={12} color="#18794E" />
                              <AppText style={[styles.attActionText, { color: '#18794E' }]}>
                                Attended
                              </AppText>
                            </TouchableOpacity>
                          )}

                          {!isNoShow && (
                            <TouchableOpacity
                              style={[styles.attActionBtn, styles.attActionNoShow]}
                              onPress={() => handleMarkAttendance(reg.id, false)}
                              activeOpacity={0.8}
                              accessibilityLabel={`Mark ${playerName} no-show`}
                            >
                              <UserX size={12} color="#9A6B00" />
                              <AppText style={[styles.attActionText, { color: '#9A6B00' }]}>
                                No Show
                              </AppText>
                            </TouchableOpacity>
                          )}

                          {(isAttended || isNoShow) && (
                            <TouchableOpacity
                              style={[styles.attActionBtn, styles.attActionReset]}
                              onPress={() => handleResetAttendance(reg.id)}
                              activeOpacity={0.8}
                              accessibilityLabel={`Reset attendance for ${playerName}`}
                            >
                              <RotateCcw size={12} color="#64748B" />
                              <AppText style={[styles.attActionText, { color: '#64748B' }]}>
                                Reset
                              </AppText>
                            </TouchableOpacity>
                          )}

                          <TouchableOpacity
                            style={styles.cancelSpotBtn}
                            onPress={() => handleCancelRegistration(reg)}
                            activeOpacity={0.8}
                            accessibilityLabel={`Cancel registration for ${playerName}`}
                          >
                            <XCircle size={14} color="#B42318" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}

                {filteredRegistrations.length > 8 && (
                  <TouchableOpacity
                    style={styles.expandToggleBtn}
                    onPress={() => setIsExpanded(!isExpanded)}
                    activeOpacity={0.8}
                  >
                    <AppText style={styles.expandToggleText}>
                      {isExpanded
                        ? 'Show Fewer Participants'
                        : `Show All (${filteredRegistrations.length}) Participants`}
                    </AppText>
                    {isExpanded ? (
                      <ChevronUp size={16} color="#176B57" />
                    ) : (
                      <ChevronDown size={16} color="#176B57" />
                    )}
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>

        {/* 6. MANAGEMENT ACTIONS */}
        <View style={styles.managementSection}>
          {isDraft && (
            <Button
              label="Publish Lesson"
              variant="primary"
              leftIcon={<PlayCircle size={16} color="#FFFFFF" />}
              onPress={handlePublish}
              loading={publishMutation.isPending}
              style={styles.managementBtn}
            />
          )}

          {isPublished && (
            <Button
              label="Mark Lesson as Completed"
              variant="primary"
              leftIcon={<CheckCircle2 size={16} color="#FFFFFF" />}
              onPress={handleCompleteLesson}
              loading={completeMutation.isPending}
              style={styles.managementBtn}
            />
          )}

          {!isCompleted && !isCancelled && (
            <Button
              label="Cancel Lesson"
              variant="ghost"
              leftIcon={<XCircle size={16} color="#B42318" />}
              onPress={handleCancelLesson}
              loading={cancelMutation.isPending}
              style={[styles.managementBtn, { borderColor: '#FDECEC' }]}
            />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F8F5',
  },
  scrollContent: {
    paddingBottom: 100,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  headerMoreBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAE6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
    height: 180,
    backgroundColor: '#E5F5EC',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E2EAE6',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  statusOverlayBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusOverlayText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  formatBadge: {
    backgroundColor: '#EFF3F6',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  formatBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  typeBadge: {
    backgroundColor: '#EAF2FB',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#2563A8',
  },
  feeBadge: {
    backgroundColor: '#E5F5EC',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  feeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#18794E',
  },
  descriptionText: {
    fontSize: 13,
    color: '#4A5568',
    lineHeight: 18,
  },
  noDescriptionText: {
    fontSize: 12.5,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102B2A',
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  infoIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F0F7F4',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  infoContentCol: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#718096',
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#102B2A',
    marginTop: 1,
  },

  // Roster Integrated Section
  rosterSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  rosterCapacitySubtitle: {
    fontSize: 12,
    color: '#0F766E',
    fontWeight: '600',
    marginTop: 2,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: 10,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#E6ECE8',
  },
  metricNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: '#102B2A',
  },
  metricLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    marginTop: 2,
  },

  // Roster Filters
  rosterFilterContainer: {
    marginVertical: 8,
  },
  rosterFilterScroll: {
    gap: 6,
  },
  rosterChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAE6',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rosterChipActive: {
    backgroundColor: '#176B57',
    borderColor: '#176B57',
  },
  rosterChipText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#3D544F',
  },
  rosterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Participant List
  participantListContainer: {
    marginTop: 6,
  },
  emptyParticipantState: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  emptyParticipantTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102B2A',
  },
  emptyParticipantSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
    textAlign: 'center',
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  participantLeftCol: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  participantAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0F392D',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  avatarInitialsText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  participantTextCol: {
    flex: 1,
    minWidth: 0,
  },
  participantNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  participantName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#102B2A',
  },
  participantEmail: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  participantDateText: {
    fontSize: 10.5,
    color: '#94A3B8',
    marginTop: 2,
  },
  participantNotesText: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
    fontStyle: 'italic',
  },
  participantActionsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  attActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  attActionAttended: {
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
  },
  attActionNoShow: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FEF3C7',
  },
  attActionReset: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  attActionText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  cancelSpotBtn: {
    padding: 4,
  },
  expandToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2',
    marginTop: 4,
  },
  expandToggleText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#176B57',
  },

  // Management Section
  managementSection: {
    marginHorizontal: 16,
    marginTop: 14,
    gap: 10,
  },
  managementBtn: {
    width: '100%',
  },
});
