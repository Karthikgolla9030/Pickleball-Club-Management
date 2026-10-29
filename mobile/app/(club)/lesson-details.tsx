/**
 * Aught2 Pickleball — Club Lesson Details Screen
 *
 * Dedicated owner/manager lesson details screen providing:
 *   - Direct URL and browser refresh support via lesson ID parameter
 *   - Seamless Back navigation preserving club context
 *   - Hero image with club branding fallback & status badge overlay
 *   - Comprehensive metadata: schedule, coach, court, fee, capacity, status
 *   - Prominent "View Roster" button opening the full participant roster
 *   - Management lifecycle actions: Publish, Complete, Cancel
 *   - Proper Loading, 404 Not Found, and Error retry states
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
  Clock,
  DollarSign,
  GraduationCap,
  MapPin,
  MoreVertical,
  PlayCircle,
  Tag,
  User,
  Users,
  XCircle,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LessonRosterModal,
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
} from '@/hooks';
import { Colors, Spacing } from '@/theme';
import { formatCurrency } from '@/utils';
import { resolveLessonImage } from '@/utils/imageResolution';
import {
  LESSON_STATUS_LABELS,
  type ClubLesson,
} from '@/types';

function formatLessonDateTime(startIso: string, endIso: string) {
  try {
    const dStart = new Date(startIso);
    const dEnd = new Date(endIso);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = dStart.getDate();
    const month = months[dStart.getMonth()];
    const year = dStart.getFullYear();
    const dateStr = `${day} ${month} ${year}`;

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
    return { date: '30 Oct 2026', time: '09:00 AM – 10:00 AM' };
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

  const [showRosterModal, setShowRosterModal] = useState(false);

  // Fetch lesson details
  const {
    data: lesson,
    isLoading,
    isError,
    error,
    refetch,
  } = useClubLesson(clubId, lessonId);

  // Fetch registrations for live attendance & capacity stats
  const { data: registrations = [], refetch: refetchRegistrations } = useLessonRegistrations(
    clubId,
    lessonId,
  );

  const publishMutation = usePublishClubLesson(clubId);
  const cancelMutation = useCancelClubLesson(clubId);
  const completeMutation = useCompleteClubLesson(clubId);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(club)/lessons' as never);
    }
  };

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
    Alert.alert('Cancel Lesson', `Are you sure you want to cancel "${lesson.title}"?`, [
      { text: 'Back', style: 'cancel' },
      {
        text: 'Cancel Lesson',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelMutation.mutateAsync(lesson.id);
            refetch();
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

    const options: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: 'View Roster', onPress: () => setShowRosterModal(true) },
    ];

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

  if (!canManageLessons) {
    return (
      <Screen style={styles.container}>
        <AppHeader title="Lesson Details" showBack={true} />
        <EmptyState
          title="Access Restricted"
          description="Only club owners and managers have permission to manage club lessons."
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

  const capacityText =
    lesson.capacity !== null && lesson.capacity !== undefined
      ? `${counts.activeSpots} / ${lesson.capacity} spots filled`
      : `${counts.activeSpots} participants (unlimited capacity)`;

  return (
    <Screen style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F8F5" />

      {/* Header with Back, Title, and Action Menu */}
      <AppHeader
        title={lesson.title}
        subtitle="Lesson Details & Coaching"
        showBack={true}
        borderless
        rightElement={
          <TouchableOpacity
            style={styles.headerMoreBtn}
            onPress={handleOpenActionMenu}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MoreVertical size={20} color="#102B2A" />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => {
              refetch();
              refetchRegistrations();
            }}
          />
        }
      >
        {/* Hero Cover Card */}
        <View style={styles.heroCard}>
          <Image source={cardImg} style={styles.heroImage} resizeMode="cover" />

          {/* Status Badge Overlay */}
          <View style={[styles.statusOverlayBadge, { backgroundColor: statusStyle.bg }]}>
            <AppText style={[styles.statusOverlayText, { color: statusStyle.text }]}>
              {LESSON_STATUS_LABELS[lesson.status]?.toUpperCase() || lesson.status.toUpperCase()}
            </AppText>
          </View>
        </View>

        {/* Title & Badges Section */}
        <View style={styles.sectionCard}>
          <AppText style={styles.lessonTitle}>{lesson.title}</AppText>

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
          </View>

          {/* Primary View Roster Action Banner */}
          <TouchableOpacity
            style={styles.rosterCtaBox}
            onPress={() => setShowRosterModal(true)}
            activeOpacity={0.8}
          >
            <View style={styles.rosterCtaIconCircle}>
              <Users size={18} color="#176B57" />
            </View>
            <View style={styles.rosterCtaTextCol}>
              <AppText style={styles.rosterCtaTitle}>Participant Roster</AppText>
              <AppText style={styles.rosterCtaSubtitle}>{capacityText}</AppText>
            </View>
            <View style={styles.rosterCtaBtn}>
              <AppText style={styles.rosterCtaBtnText}>View Roster →</AppText>
            </View>
          </TouchableOpacity>
        </View>

        {/* Schedule & Coach Information */}
        <View style={styles.sectionCard}>
          <AppText style={styles.sectionHeading}>Schedule & Assignment</AppText>

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

          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
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
        </View>

        {/* Description Section */}
        {lesson.description ? (
          <View style={styles.sectionCard}>
            <AppText style={styles.sectionHeading}>About This Lesson</AppText>
            <AppText style={styles.descriptionText}>{lesson.description}</AppText>
          </View>
        ) : null}

        {/* Enrollment Breakdown Metrics */}
        <View style={styles.sectionCard}>
          <AppText style={styles.sectionHeading}>Enrollment Overview</AppText>
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <AppText style={styles.metricNumber}>{counts.activeSpots}</AppText>
              <AppText style={styles.metricLabel}>Enrolled</AppText>
            </View>
            <View style={styles.metricItem}>
              <AppText style={[styles.metricNumber, { color: '#0F766E' }]}>
                {counts.att}
              </AppText>
              <AppText style={styles.metricLabel}>Attended</AppText>
            </View>
            <View style={styles.metricItem}>
              <AppText style={[styles.metricNumber, { color: '#D97706' }]}>
                {counts.noShow}
              </AppText>
              <AppText style={styles.metricLabel}>No Show</AppText>
            </View>
            <View style={styles.metricItem}>
              <AppText style={[styles.metricNumber, { color: '#137333' }]}>
                {counts.availableSpots !== null ? counts.availableSpots : '∞'}
              </AppText>
              <AppText style={styles.metricLabel}>Available</AppText>
            </View>
          </View>
        </View>

        {/* Management Quick Actions */}
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

      {/* Roster Modal */}
      <LessonRosterModal
        visible={showRosterModal}
        lesson={lesson}
        clubId={clubId}
        onClose={() => {
          setShowRosterModal(false);
          refetch();
          refetchRegistrations();
        }}
      />
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
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    padding: 16,
  },
  lessonTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#102B2A',
    lineHeight: 26,
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  formatBadge: {
    backgroundColor: '#E5F5EC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  formatBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#18794E',
  },
  typeBadge: {
    backgroundColor: '#EFF3F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  typeBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#475569',
  },
  rosterCtaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDF7F2',
    borderWidth: 1,
    borderColor: '#D5EAE0',
    borderRadius: 12,
    padding: 12,
  },
  rosterCtaIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#D9EFE4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rosterCtaTextCol: {
    flex: 1,
  },
  rosterCtaTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102B2A',
  },
  rosterCtaSubtitle: {
    fontSize: 11.5,
    color: '#4A605A',
    marginTop: 1,
  },
  rosterCtaBtn: {
    backgroundColor: '#176B57',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  rosterCtaBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '600',
  },
  sectionHeading: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#102B2A',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 12,
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
    color: '#657776',
    marginBottom: 1,
  },
  infoValue: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#102B2A',
  },
  descriptionText: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 19,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricItem: {
    flex: 1,
    backgroundColor: '#F8FAF9',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2EAE6',
  },
  metricNumber: {
    fontSize: 17,
    fontWeight: '700',
    color: '#102B2A',
  },
  metricLabel: {
    fontSize: 10,
    color: '#657776',
    fontWeight: '500',
    marginTop: 2,
  },
  managementSection: {
    marginHorizontal: 16,
    marginTop: 16,
    gap: 10,
  },
  managementBtn: {
    width: '100%',
  },
});

