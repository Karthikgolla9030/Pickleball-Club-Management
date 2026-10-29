/**
 * Aught2 Pickleball — Unified Club Lesson Details Screen
 *
 * Owner & Manager single-page lesson details with direct inline registration overview:
 *   - Direct URL and browser refresh support via lesson ID parameter
 *   - Seamless Back navigation preserving club context and list filter
 *   - Lesson Hero image with club branding fallback & status badge
 *   - Lesson Overview with format (private/group), type, fee, and full description
 *   - Dedicated "Schedule & Assignments" section (coach, court, capacity)
 *   - Redesigned "Registration Overview" section:
 *       * Concise top summary (X registered participants · capacity & available spots)
 *       * Responsive 2-column metric cards on mobile (wider on tablet/desktop) with readable labels
 *       * Completely removed duplicate status-filter buttons row
 *       * Direct inline participant list with real names, emails, dates, notes, and attendance
 *       * Compact empty state when no participants exist (strictly without Add Player / View Roster buttons)
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
  useWindowDimensions,
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
import { formatCurrency } from '@/utils';
import { resolveLessonPicture } from '@/utils/imageResolution';
import {
  LESSON_REGISTRATION_STATUS_LABELS,
  LESSON_STATUS_LABELS,
  type ClubLesson,
  type LessonRegistration,
  type LessonRegistrationStatus,
} from '@/types';

function formatLessonSchedule(startIso: string, endIso: string) {
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
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 640;

  const params = useLocalSearchParams<{ id?: string; lessonId?: string; clubId?: string }>();
  const lessonId = params.id || params.lessonId || '';

  const { clubId: activeClubId } = useActiveClub();
  const clubId = params.clubId || activeClubId || '';

  const { canManageEvents } = usePermission();
  const { data: clubBranding } = useClubBranding(clubId);

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

  // Sort registrations: active first, cancelled last, then newest
  const sortedRegistrations = useMemo(() => {
    return [...registrations].sort((a, b) => {
      if (a.status === 'cancelled' && b.status !== 'cancelled') return 1;
      if (a.status !== 'cancelled' && b.status === 'cancelled') return -1;
      return new Date(b.registered_at || 0).getTime() - new Date(a.registered_at || 0).getTime();
    });
  }, [registrations]);

  // Expandable subset
  const displayedRegistrations = useMemo(() => {
    if (isExpanded || sortedRegistrations.length <= 8) {
      return sortedRegistrations;
    }
    return sortedRegistrations.slice(0, 8);
  }, [sortedRegistrations, isExpanded]);

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

    Alert.alert(lesson.title, 'Lesson Management Actions', options);
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
      Alert.alert('Attendance Error', msg);
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

  // Permission check
  if (!canManageEvents) {
    return (
      <Screen style={styles.container}>
        <AppHeader title="Lesson Details" showBack={true} />
        <EmptyState
          title="Access Restricted"
          description="Only club owners and managers have permission to view and manage coaching lessons."
          actionLabel="Back to Lessons"
          onAction={handleBack}
        />
      </Screen>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <Screen style={styles.container}>
        <AppHeader title="Lesson Details" showBack={true} />
        <LoadingState message="Loading lesson details..." />
      </Screen>
    );
  }

  // Error / Not Found states
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

  const schedule = formatLessonSchedule(lesson.start_at, lesson.end_at);
  const cardImg = resolveLessonPicture(lesson, clubBranding);

  const feeDisplay =
    Number(lesson.price) > 0 ? formatCurrency(Number(lesson.price)) : 'Free';

  const isDraft = lesson.status === 'draft';
  const isPublished = lesson.status === 'published';
  const isCompleted = lesson.status === 'completed';
  const isCancelled = lesson.status === 'cancelled';

  const getStatusBadgeStyle = () => {
    switch (lesson.status) {
      case 'completed':
      case 'published':
        return { bg: '#E5F5EC', text: '#18794E' };
      case 'draft':
        return { bg: '#FFF5D9', text: '#9A6B00' };
      case 'cancelled':
      default:
        return { bg: '#FDECEC', text: '#B42318' };
    }
  };

  const statusStyle = getStatusBadgeStyle();

  // Concise capacity summary header
  const capacitySummaryText =
    lesson.capacity !== null && lesson.capacity !== undefined
      ? `${counts.activeSpots} registered participant${counts.activeSpots === 1 ? '' : 's'} · ${lesson.capacity} capacity (${counts.availableSpots} spots available)`
      : `${counts.activeSpots} registered participant${counts.activeSpots === 1 ? '' : 's'} · Unlimited capacity`;

  // Spacious 2-column metrics definition
  const metricCards = [
    {
      key: 'registered',
      label: 'Registered',
      count: counts.reg,
      Icon: Users,
      color: '#0F766E',
      bg: '#F0FDF4',
      border: '#DCFCE7',
    },
    {
      key: 'attended',
      label: 'Attended',
      count: counts.att,
      Icon: CheckCircle2,
      color: '#15803D',
      bg: '#ECFDF5',
      border: '#D1FAE5',
    },
    {
      key: 'no_show',
      label: 'No Show',
      count: counts.noShow,
      Icon: UserX,
      color: '#B91C1C',
      bg: '#FEF2F2',
      border: '#FEE2E2',
    },
    {
      key: 'cancelled',
      label: 'Cancelled',
      count: counts.canc,
      Icon: XCircle,
      color: '#64748B',
      bg: '#F8FAFC',
      border: '#E2E8F0',
    },
  ];

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
                {lesson.is_private ? 'PRIVATE' : 'GROUP'}
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

        {/* 5. REDESIGNED REGISTRATION OVERVIEW & INLINE PARTICIPANT LIST */}
        <View style={styles.sectionCard}>
          <View style={styles.rosterSectionHeader}>
            <AppText style={styles.sectionHeading}>Registration Overview</AppText>
            <AppText style={styles.rosterCapacitySubtitle}>{capacitySummaryText}</AppText>
          </View>

          {/* Clean Responsive 2-Column Metrics Grid */}
          <View style={styles.metricsGrid}>
            {metricCards.map((m) => (
              <View
                key={m.key}
                style={[
                  styles.metricCard,
                  {
                    width: isWide ? '23.5%' : '48.4%',
                    backgroundColor: m.bg,
                    borderColor: m.border,
                  },
                ]}
              >
                <View style={styles.metricCardHeader}>
                  <m.Icon size={16} color={m.color} />
                  <AppText style={[styles.metricNumber, { color: m.color }]}>
                    {m.count}
                  </AppText>
                </View>
                <AppText style={styles.metricLabel}>{m.label}</AppText>
              </View>
            ))}
          </View>

          {/* Participant Rows List (Directly Below Summary without Duplicate Filter Buttons) */}
          <View style={styles.participantListContainer}>
            {sortedRegistrations.length === 0 ? (
              <View style={styles.emptyParticipantState}>
                <Users size={24} color="#94A3B8" style={{ marginBottom: 6 }} />
                <AppText style={styles.emptyParticipantTitle}>No participants yet</AppText>
                <AppText style={styles.emptyParticipantSubtitle}>
                  Registrations will appear here when players join.
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
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            accessibilityLabel={`Cancel registration for ${playerName}`}
                          >
                            <XCircle size={16} color="#94A3B8" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* Show More / Show Less Toggle when participants > 8 */}
                {sortedRegistrations.length > 8 && (
                  <TouchableOpacity
                    style={styles.expandToggleBtn}
                    onPress={() => setIsExpanded(!isExpanded)}
                    activeOpacity={0.7}
                  >
                    <AppText style={styles.expandToggleText}>
                      {isExpanded
                        ? 'Show fewer participants'
                        : `Show all ${sortedRegistrations.length} participants`}
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

        {/* 6. PRIMARY MANAGEMENT ACTIONS */}
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
              variant="outline"
              leftIcon={<XCircle size={16} color="#B42318" />}
              onPress={handleCancelLesson}
              loading={cancelMutation.isPending}
              style={[styles.managementBtn, { borderColor: '#FECDCA' }]}
              labelStyle={{ color: '#B42318' }}
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
  headerMoreBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F2EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 96,
  },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 18,
    overflow: 'hidden',
    height: 180,
    backgroundColor: '#102B2A',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
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
    marginBottom: 8,
  },
  rosterCapacitySubtitle: {
    fontSize: 12.5,
    color: '#0F766E',
    fontWeight: '600',
    marginTop: 3,
  },

  // 2-Column Responsive Metrics Grid
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
    marginBottom: 12,
  },
  metricCard: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    minHeight: 66,
    justifyContent: 'space-between',
  },
  metricCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricNumber: {
    fontSize: 18,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginTop: 4,
  },

  // Participant List
  participantListContainer: {
    marginTop: 4,
  },
  emptyParticipantState: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  emptyParticipantTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#102B2A',
  },
  emptyParticipantSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
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
    backgroundColor: '#F8FAFC',
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
