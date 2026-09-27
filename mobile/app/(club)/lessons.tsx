/**
 * Aught2 Pickleball — Club Lessons & Coaching Screen (Phase 15)
 *
 * Staff management for coaching, lesson types, lessons, and player registrations:
 *   - Segmented navigation: Lessons | Coaches | Lesson Types
 *   - Overview metric cards: Total Lessons, Published, Completed, Draft
 *   - Status filtering: All, Draft, Published, Completed, Cancelled
 *   - Lesson scheduling with conflict detection, capacity, court & coach assignment
 *   - Lesson lifecycle: Publish, Cancel, Complete
 *   - Roster Management Modal:
 *       * View registered players & status
 *       * Mark attendance (attended / no-show)
 *       * Manual staff player registration
 *       * Staff registration cancellation
 *   - Coach management: List, Add, Edit, Deactivate, Reactivate
 *   - Lesson Type configuration: List, Add, Edit, Deactivate, Reactivate
 *
 * Authorization:
 *   - Requires manage_lessons permission (club_owner & club_manager)
 *   - Blocked for tournament directors with clear message
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
  ImageBackground,
  Image,
  StatusBar,
} from 'react-native';
import { Calendar, CheckCircle, FileText, SlidersHorizontal, MapPin, User, Users, MoreVertical, CalendarPlus, CheckCircle2 } from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  FilterChips,
  Input,
  LoadingState,
  MetricGrid,
  ModalSheet,
  Screen,
  ScreenHeader,
  SegmentedTabs,
} from '@/components';
import {
  useActiveClub,
  useCancelClubLesson,
  useClubCoaches,
  useClubCourts,
  useClubLessons,
  useClubLessonTypes,
  useCompleteClubLesson,
  useCreateClubLesson,
  useCreateCoach,
  useCreateLessonType,
  useDeactivateCoach,
  useDeactivateLessonType,
  useLessonRegistrations,
  usePermission,
  usePublishClubLesson,
  useReactivateCoach,
  useReactivateLessonType,
  useStaffCancelLessonRegistration,
  useStaffMarkLessonAttendance,
  useStaffRegisterLessonPlayer,
  useUpdateCoach,
  useUpdateLessonType,
} from '@/hooks';
import { Colors, Layout, Radius, Spacing } from '@/theme';
import {
  LESSON_REGISTRATION_STATUS_LABELS,
  LESSON_STATUS_LABELS,
  type ClubLesson,
  type Coach,
  type CreateCoachPayload,
  type CreateLessonPayload,
  type CreateLessonTypePayload,
  type LessonRegistration,
  type LessonRegistrationStatus,
  type LessonStatus,
  type LessonType,
} from '@/types';

type StaffTab = 'lessons' | 'coaches' | 'lesson_types';

function getLessonStatusBadgeVariant(
  status: LessonStatus,
): 'success' | 'warning' | 'error' | 'info' | 'default' {
  switch (status) {
    case 'published':
      return 'success';
    case 'draft':
      return 'warning';
    case 'completed':
      return 'info';
    case 'cancelled':
    default:
      return 'error';
  }
}

function getRegStatusBadgeVariant(
  status: LessonRegistrationStatus,
): 'success' | 'warning' | 'error' | 'info' | 'default' {
  switch (status) {
    case 'attended':
    case 'registered':
      return 'success';
    case 'no_show':
    case 'cancelled':
    default:
      return 'error';
  }
}

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

function getLessonCardImage(item: ClubLesson) {
  const t = (item.title || '').toLowerCase();
  if (t.includes('doubles') || t.includes('strategy') || t.includes('workshop') || t.includes('past')) {
    return require('../../assets/lessons/card1.jpg');
  }
  if (t.includes('beginner') || t.includes('clinic') || t.includes('class') || t.includes('saturday')) {
    return require('../../assets/lessons/card2.jpg');
  }
  if (item.is_private || t.includes('one-on-one') || t.includes('private')) {
    return require('../../assets/lessons/card3.jpg');
  }
  return require('../../assets/lessons/card1.jpg');
}

export default function ClubLessonsScreen() {
  const { clubId: activeClubId, clubName } = useActiveClub();
  const { canManageLessons } = usePermission();

  const [activeTab, setActiveTab] = useState<StaffTab>('lessons');
  const [statusFilter, setStatusFilter] = useState<LessonStatus | 'all'>('all');

  // Modals
  const [createLessonVisible, setCreateLessonVisible] = useState(false);
  const [rosterLesson, setRosterLesson] = useState<ClubLesson | null>(null);
  const [createCoachVisible, setCreateCoachVisible] = useState(false);
  const [editCoach, setEditCoach] = useState<Coach | null>(null);
  const [createLessonTypeVisible, setCreateLessonTypeVisible] = useState(false);
  const [editLessonType, setEditLessonType] = useState<LessonType | null>(null);

  // Queries
  const {
    data: lessons,
    isLoading: isLoadingLessons,
    isRefetching: isRefetchingLessons,
    refetch: refetchLessons,
  } = useClubLessons(
    activeClubId ?? '',
    statusFilter === 'all' ? undefined : { status: statusFilter },
  );

  const {
    data: coaches,
    isLoading: isLoadingCoaches,
    isRefetching: isRefetchingCoaches,
    refetch: refetchCoaches,
  } = useClubCoaches(activeClubId ?? '');

  const {
    data: lessonTypes,
    isLoading: isLoadingLessonTypes,
    isRefetching: isRefetchingLessonTypes,
    refetch: refetchLessonTypes,
  } = useClubLessonTypes(activeClubId ?? '');

  const { data: courts } = useClubCourts(activeClubId ?? '', 'active');

  // Mutations
  const createLessonMutation = useCreateClubLesson(activeClubId ?? '');
  const publishLessonMutation = usePublishClubLesson(activeClubId ?? '');
  const cancelLessonMutation = useCancelClubLesson(activeClubId ?? '');
  const completeLessonMutation = useCompleteClubLesson(activeClubId ?? '');

  const createCoachMutation = useCreateCoach(activeClubId ?? '');
  const updateCoachMutation = useUpdateCoach(activeClubId ?? '');
  const deactivateCoachMutation = useDeactivateCoach(activeClubId ?? '');
  const reactivateCoachMutation = useReactivateCoach(activeClubId ?? '');

  const createLessonTypeMutation = useCreateLessonType(activeClubId ?? '');
  const updateLessonTypeMutation = useUpdateLessonType(activeClubId ?? '');
  const deactivateLessonTypeMutation = useDeactivateLessonType(activeClubId ?? '');
  const reactivateLessonTypeMutation = useReactivateLessonType(activeClubId ?? '');

  // Form states - Create Lesson
  const [lessonTypeId, setLessonTypeId] = useState('');
  const [coachId, setCoachId] = useState('');
  const [courtId, setCourtId] = useState('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonDesc, setLessonDesc] = useState('');
  const [lessonStartAt, setLessonStartAt] = useState('');
  const [lessonEndAt, setLessonEndAt] = useState('');
  const [lessonCapacity, setLessonCapacity] = useState('');
  const [lessonPrice, setLessonPrice] = useState('');

  // Form states - Coach
  const [coachName, setCoachName] = useState('');
  const [coachBio, setCoachBio] = useState('');
  const [coachSpecialization, setCoachSpecialization] = useState('');
  const [coachPhone, setCoachPhone] = useState('');
  const [coachEmail, setCoachEmail] = useState('');

  // Form states - Lesson Type
  const [typeName, setTypeName] = useState('');
  const [typeDesc, setTypeDesc] = useState('');
  const [typeDuration, setTypeDuration] = useState('60');
  const [typeCapacity, setTypeCapacity] = useState('');
  const [typePrice, setTypePrice] = useState('0.00');
  const [typeIsPrivate, setTypeIsPrivate] = useState(false);

  // Metrics
  const metrics = useMemo(() => {
    if (!lessons) return { total: 0, published: 0, completed: 0, draft: 0 };
    return {
      total: lessons.length,
      published: lessons.filter((l) => l.status === 'published').length,
      completed: lessons.filter((l) => l.status === 'completed').length,
      draft: lessons.filter((l) => l.status === 'draft').length,
    };
  }, [lessons]);

  // Handle Create Lesson
  const handleCreateLesson = async () => {
    if (!lessonTitle.trim()) {
      Alert.alert('Validation Error', 'Lesson title is required.');
      return;
    }
    if (!lessonTypeId) {
      Alert.alert('Validation Error', 'Please select a lesson type.');
      return;
    }
    if (!coachId) {
      Alert.alert('Validation Error', 'Please select a coach.');
      return;
    }
    if (!lessonStartAt.trim() || !lessonEndAt.trim()) {
      Alert.alert('Validation Error', 'Start and end datetimes are required in ISO format (YYYY-MM-DDTHH:MM:SSZ).');
      return;
    }

    try {
      const payload: CreateLessonPayload = {
        title: lessonTitle.trim(),
        description: lessonDesc.trim() || null,
        lesson_type_id: lessonTypeId,
        coach_id: coachId,
        court_id: courtId || null,
        start_at: lessonStartAt.trim(),
        end_at: lessonEndAt.trim(),
        capacity: lessonCapacity ? parseInt(lessonCapacity, 10) : undefined,
        price: lessonPrice ? parseFloat(lessonPrice) : undefined,
      };

      await createLessonMutation.mutateAsync(payload);
      Alert.alert('Success', 'Lesson created in draft status.');
      setCreateLessonVisible(false);
      resetLessonForm();
    } catch (err: any) {
      Alert.alert('Error Creating Lesson', err.message || 'Failed to create lesson.');
    }
  };

  const resetLessonForm = () => {
    setLessonTitle('');
    setLessonDesc('');
    setLessonTypeId('');
    setCoachId('');
    setCourtId('');
    setLessonStartAt('');
    setLessonEndAt('');
    setLessonCapacity('');
    setLessonPrice('');
  };

  // Handle Create/Update Coach
  const handleSaveCoach = async () => {
    if (!coachName.trim()) {
      Alert.alert('Validation Error', 'Coach name is required.');
      return;
    }

    try {
      if (editCoach) {
        await updateCoachMutation.mutateAsync({
          coachId: editCoach.id,
          payload: {
            name: coachName.trim(),
            bio: coachBio.trim() || null,
            specialization: coachSpecialization.trim() || null,
            phone: coachPhone.trim() || null,
            email: coachEmail.trim() || null,
          },
        });
        Alert.alert('Success', 'Coach updated successfully.');
        setEditCoach(null);
      } else {
        const payload: CreateCoachPayload = {
          name: coachName.trim(),
          bio: coachBio.trim() || null,
          specialization: coachSpecialization.trim() || null,
          phone: coachPhone.trim() || null,
          email: coachEmail.trim() || null,
        };
        await createCoachMutation.mutateAsync(payload);
        Alert.alert('Success', 'Coach created successfully.');
        setCreateCoachVisible(false);
      }
      resetCoachForm();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save coach.');
    }
  };

  const resetCoachForm = () => {
    setCoachName('');
    setCoachBio('');
    setCoachSpecialization('');
    setCoachPhone('');
    setCoachEmail('');
  };

  // Handle Create/Update Lesson Type
  const handleSaveLessonType = async () => {
    if (!typeName.trim()) {
      Alert.alert('Validation Error', 'Lesson type name is required.');
      return;
    }
    const duration = parseInt(typeDuration, 10);
    if (isNaN(duration) || duration <= 0) {
      Alert.alert('Validation Error', 'Duration must be a positive integer in minutes.');
      return;
    }

    try {
      if (editLessonType) {
        await updateLessonTypeMutation.mutateAsync({
          lessonTypeId: editLessonType.id,
          payload: {
            name: typeName.trim(),
            description: typeDesc.trim() || null,
            duration_minutes: duration,
            default_capacity: typeCapacity ? parseInt(typeCapacity, 10) : undefined,
            default_price: parseFloat(typePrice || '0'),
            is_private: typeIsPrivate,
          },
        });
        Alert.alert('Success', 'Lesson type updated successfully.');
        setEditLessonType(null);
      } else {
        const payload: CreateLessonTypePayload = {
          name: typeName.trim(),
          description: typeDesc.trim() || null,
          duration_minutes: duration,
          default_capacity: typeCapacity ? parseInt(typeCapacity, 10) : undefined,
          default_price: parseFloat(typePrice || '0'),
          is_private: typeIsPrivate,
        };
        await createLessonTypeMutation.mutateAsync(payload);
        Alert.alert('Success', 'Lesson type created successfully.');
        setCreateLessonTypeVisible(false);
      }
      resetLessonTypeForm();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save lesson type.');
    }
  };

  const resetLessonTypeForm = () => {
    setTypeName('');
    setTypeDesc('');
    setTypeDuration('60');
    setTypeCapacity('');
    setTypePrice('0.00');
    setTypeIsPrivate(false);
  };

  // Quick action alerts
  const handlePublish = (lesson: ClubLesson) => {
    Alert.alert(
      'Publish Lesson',
      `Are you sure you want to publish "${lesson.title}"? Once published, players can register.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Publish',
          onPress: async () => {
            try {
              await publishLessonMutation.mutateAsync(lesson.id);
              Alert.alert('Success', 'Lesson published.');
            } catch (err: any) {
              Alert.alert('Error Publishing', err.message || 'Failed to publish lesson.');
            }
          },
        },
      ],
    );
  };

  const handleCancelLesson = (lesson: ClubLesson) => {
    Alert.alert(
      'Cancel Lesson',
      `Are you sure you want to cancel "${lesson.title}"? All active registrations will be cancelled.`,
      [
        { text: 'Back', style: 'cancel' },
        {
          text: 'Confirm Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelLessonMutation.mutateAsync(lesson.id);
              Alert.alert('Success', 'Lesson cancelled.');
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to cancel lesson.');
            }
          },
        },
      ],
    );
  };

  const handleCompleteLesson = (lesson: ClubLesson) => {
    Alert.alert(
      'Complete Lesson',
      `Mark "${lesson.title}" as completed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            try {
              await completeLessonMutation.mutateAsync(lesson.id);
              Alert.alert('Success', 'Lesson marked as completed.');
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to complete lesson.');
            }
          },
        },
      ],
    );
  };

  const handleLessonMenu = (lesson: ClubLesson) => {
    const buttons: any[] = [];
    if (lesson.status === 'draft') {
      buttons.push({ text: 'Publish Lesson', onPress: () => handlePublish(lesson) });
    }
    if (lesson.status === 'published') {
      buttons.push({ text: 'Complete Lesson', onPress: () => handleCompleteLesson(lesson) });
      buttons.push({ text: 'Cancel Lesson', style: 'destructive', onPress: () => handleCancelLesson(lesson) });
    }
    buttons.push({ text: 'View Roster', onPress: () => setRosterLesson(lesson) });
    buttons.push({ text: 'Close', style: 'cancel' });

    Alert.alert(lesson.title, 'Lesson Actions', buttons);
  };

  const headerAction = useMemo(() => {
    if (activeTab === 'lessons') {
      return (
        <TouchableOpacity
          style={styles.scheduleHeaderBtn}
          onPress={() => {
            resetLessonForm();
            setCreateLessonVisible(true);
          }}
          activeOpacity={0.8}
        >
          <AppText style={styles.scheduleHeaderBtnText}>+ Schedule</AppText>
        </TouchableOpacity>
      );
    }
    if (activeTab === 'coaches') {
      return (
        <TouchableOpacity
          style={styles.scheduleHeaderBtn}
          onPress={() => {
            resetCoachForm();
            setCreateCoachVisible(true);
          }}
          activeOpacity={0.8}
        >
          <AppText style={styles.scheduleHeaderBtnText}>+ Coach</AppText>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity
        style={styles.scheduleHeaderBtn}
        onPress={() => {
          resetLessonTypeForm();
          setCreateLessonTypeVisible(true);
        }}
        activeOpacity={0.8}
      >
        <AppText style={styles.scheduleHeaderBtnText}>+ Type</AppText>
      </TouchableOpacity>
    );
  }, [activeTab]);

  // Auth gate
  if (!canManageLessons) {
    return (
      <Screen style={styles.container}>
        <EmptyState
          title="Access Restricted"
          description={`You do not have permission to manage lessons or coaching for ${clubName ?? 'this club'}. Only Club Owners and Managers can access this module.`}
        />
      </Screen>
    );
  }

  const renderHeader = () => (
    <>
      {/* 2. HERO / BANNER SECTION */}
      <View style={styles.promoBannerContainer}>
        <Image
          source={require('../../assets/lessons/hero_decor.jpg')}
          style={styles.promoBannerDecor}
          resizeMode="cover"
        />
        <View style={styles.promoTextContainer}>
          <AppText style={styles.promoHeading}>
            Better Players{'\n'}Stronger Community
          </AppText>
          <AppText style={styles.promoSubtitle}>
            Manage lessons, coaching programs{'\n'}and help your members grow.
          </AppText>
        </View>
        <View style={styles.promoScriptContainer}>
          <AppText style={styles.promoScriptText}>
            Learn{'\n'}Play{'\n'}Improve
          </AppText>
        </View>
      </View>

      {/* 4. MAIN TAB NAVIGATION */}
      <View style={styles.tabContainer}>
        <SegmentedTabs<StaffTab>
          tabs={[
            { key: 'lessons', label: 'Lessons' },
            { key: 'coaches', label: 'Coaches' },
            { key: 'lesson_types', label: 'Lesson Types' },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </View>

      {/* ─── TAB 1: LESSONS HEADER ──────────────────────────────────────── */}
      {activeTab === 'lessons' && (
        <>
          {/* 5. STATISTICS CARDS */}
          <MetricGrid
            columns={4}
            style={styles.metricsGrid}
            metrics={[
              {
                label: 'Total',
                value: metrics.total,
                icon: <Calendar size={14} color="#667776" />,
              },
              {
                label: 'Published',
                value: metrics.published,
                variant: 'success',
                icon: <CheckCircle2 size={14} color="#18794E" />,
              },
              {
                label: 'Draft',
                value: metrics.draft,
                variant: 'warning',
                icon: <FileText size={14} color="#9A6B00" />,
              },
              {
                label: 'Completed',
                value: metrics.completed,
                variant: 'info',
                icon: <CheckCircle2 size={14} color="#2563A8" />,
              },
            ]}
          />

          {/* 6. FILTER SECTION */}
          <View style={styles.filterRow}>
            <View style={{ flex: 1 }}>
              <FilterChips<LessonStatus | 'all'>
                chips={[
                  { key: 'all', label: 'All' },
                  { key: 'draft', label: 'Draft' },
                  { key: 'published', label: 'Published' },
                  { key: 'completed', label: 'Completed' },
                  { key: 'cancelled', label: 'Cancelled' },
                ]}
                activeChip={statusFilter}
                onChipPress={setStatusFilter}
                style={{ paddingHorizontal: 0 }}
                contentContainerStyle={{ paddingHorizontal: 0 }}
              />
            </View>
            <TouchableOpacity style={styles.settingsBtn} activeOpacity={0.75}>
              <SlidersHorizontal size={16} color="#102B2A" />
            </TouchableOpacity>
          </View>
        </>
      )}
    </>
  );

  const renderLessonCard = ({ item }: { item: ClubLesson }) => {
    const cardImg = getLessonCardImage(item);
    const rosterLabel = item.status === 'completed' ? 'Roster →' : 'View Roster →';
    const tagLabel = item.lesson_type_name?.toUpperCase() || (item.is_private ? 'PRIVATE' : 'DOUBLES STRATEGY');

    const descriptionText = item.description || (
      item.title.toLowerCase().includes('doubles')
        ? 'Improve your doubles play with proven strategies and drills.'
        : item.title.toLowerCase().includes('beginner')
        ? 'Learn the basics, rules and essential skills in a fun group setting.'
        : item.is_private || item.title.toLowerCase().includes('one-on-one')
        ? 'Personalized coaching to take your game to the next level.'
        : 'Improve your game with proven strategies and drills in this session.'
    );

    return (
      <View style={styles.lessonCard}>
        {/* Top Section */}
        <View style={styles.cardTopRow}>
          <Image source={cardImg} style={styles.cardThumbnail} resizeMode="cover" />

          <View style={styles.cardMain}>
            <View style={styles.cardTopMeta}>
              <View style={styles.badgeGroup}>
                <View style={[styles.statusBadge, styles[`statusBadge_${item.status}`] || styles.statusBadge_draft]}>
                  <AppText style={[styles.statusBadgeText, styles[`statusBadgeText_${item.status}`] || styles.statusBadgeText_draft]}>
                    {LESSON_STATUS_LABELS[item.status].toUpperCase()}
                  </AppText>
                </View>
                <View style={styles.categoryBadge}>
                  <AppText style={styles.categoryBadgeText}>
                    {item.is_private ? 'PRIVATE' : 'GROUP'}
                  </AppText>
                </View>
              </View>

              <View style={styles.priceContainer}>
                <AppText style={styles.priceText}>
                  {Number(item.price) === 0 ? 'Free' : `₹${Number(item.price)}`}
                </AppText>
                <TouchableOpacity
                  onPress={() => handleLessonMenu(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.moreBtn}
                >
                  <MoreVertical size={16} color="#102B2A" />
                </TouchableOpacity>
              </View>
            </View>

            <AppText style={styles.lessonTitle}>
              {item.title}
            </AppText>

            <AppText style={styles.lessonDescription}>
              {descriptionText}
            </AppText>
          </View>
        </View>

        {/* 4-Column Metadata Row */}
        <View style={styles.metaRow}>
          {/* Coach */}
          <View style={styles.metaCol}>
            <User size={13} color="#176B57" style={styles.metaIcon} />
            <View style={styles.metaColText}>
              <AppText style={styles.metaLabel}>Coach</AppText>
              <AppText style={styles.metaVal}>
                {item.coach_name ?? 'Daniel Lee'}
              </AppText>
            </View>
          </View>

          {/* Court */}
          <View style={styles.metaCol}>
            <MapPin size={13} color="#667776" style={styles.metaIcon} />
            <View style={styles.metaColText}>
              <AppText style={styles.metaLabel}>Court</AppText>
              <AppText style={styles.metaVal}>
                {item.court_name ?? 'Court 1'}
              </AppText>
            </View>
          </View>

          {/* Schedule */}
          <View style={[styles.metaCol, { flex: 1.25 }]}>
            <Calendar size={13} color="#667776" style={styles.metaIcon} />
            <View style={styles.metaColText}>
              <AppText style={styles.metaLabel}>Schedule</AppText>
              <AppText style={styles.metaVal}>
                {formatLessonSchedule(item.start_at)}
              </AppText>
            </View>
          </View>

          {/* Capacity */}
          <View style={styles.metaCol}>
            <Users size={13} color="#667776" style={styles.metaIcon} />
            <View style={styles.metaColText}>
              <AppText style={styles.metaLabel}>Capacity</AppText>
              <AppText style={styles.metaVal}>
                {item.registered_count ?? 0} / {item.capacity ?? 8}
              </AppText>
            </View>
          </View>
        </View>

        {/* Bottom Tag & Action Row */}
        <View style={styles.cardBottomRow}>
          <View style={styles.bottomTag}>
            <AppText style={styles.bottomTagText}>{tagLabel}</AppText>
          </View>

          <TouchableOpacity
            style={styles.rosterActionBtn}
            onPress={() => setRosterLesson(item)}
            activeOpacity={0.7}
          >
            <AppText style={styles.rosterActionText}>{rosterLabel}</AppText>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Screen style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F8F5" />
      <AppHeader
        title="Lessons & Coaching"
        subtitle="Book and manage coaching sessions"
        borderless
        rightElement={headerAction}
      />

      {/* ─── TAB 1: LESSONS ──────────────────────────────────────────────── */}
      {activeTab === 'lessons' && (
        <FlatList
          data={lessons}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            isLoadingLessons ? (
              <LoadingState message="Loading lessons..." />
            ) : (
              <EmptyState
                title="No Lessons Scheduled"
                description="Schedule your first coaching lesson or training clinic."
                actionLabel="+ Schedule Lesson"
                onAction={() => setCreateLessonVisible(true)}
              />
            )
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefetchingLessons}
              onRefresh={refetchLessons}
              tintColor="#176B57"
            />
          }
          contentContainerStyle={styles.listContent}
          renderItem={renderLessonCard}
        />
      )}

      {/* ─── TAB 2: COACHES ──────────────────────────────────────────────── */}
      {activeTab === 'coaches' && (
        <>
            <FlatList
              data={coaches}
              keyExtractor={(item) => item.id}
              ListHeaderComponent={renderHeader}
              ListEmptyComponent={
                isLoadingCoaches ? (
                  <LoadingState message="Loading coaches..." />
                ) : (
                  <EmptyState
                    title="No Coaches Found"
                    description="Add coaching personnel to your club."
                    actionLabel="+ Add Coach"
                    onAction={() => {
                      resetCoachForm();
                      setCreateCoachVisible(true);
                    }}
                  />
                )
              }
              refreshControl={
                <RefreshControl
                  refreshing={isRefetchingCoaches}
                  onRefresh={refetchCoaches}
                  tintColor={Colors.brand.primary}
                />
              }
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <Card style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View>
                      <AppText variant="heading3" style={styles.lessonTitle}>
                        {item.name}
                      </AppText>
                      {item.specialization ? (
                        <AppText variant="bodySmall" style={styles.coachSpec}>
                          {item.specialization}
                        </AppText>
                      ) : null}
                    </View>
                    <Badge
                      label={item.is_active ? 'Active' : 'Inactive'}
                      variant={item.is_active ? 'success' : 'default'}
                    />
                  </View>

                  {item.bio ? (
                    <AppText variant="bodySmall" style={styles.bioText} numberOfLines={2}>
                      {item.bio}
                    </AppText>
                  ) : null}

                  <View style={styles.detailsGrid}>
                    {item.email ? (
                      <View style={styles.detailRow}>
                        <AppText variant="caption" style={styles.detailLabel}>
                          Email:
                        </AppText>
                        <AppText variant="bodySmall" style={styles.detailValue}>
                          {item.email}
                        </AppText>
                      </View>
                    ) : null}
                    {item.phone ? (
                      <View style={styles.detailRow}>
                        <AppText variant="caption" style={styles.detailLabel}>
                          Phone:
                        </AppText>
                        <AppText variant="bodySmall" style={styles.detailValue}>
                          {item.phone}
                        </AppText>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.actionRow}>
                    <Button
                      label="Edit"
                      variant="secondary"
                      size="sm"
                      fullWidth={false}
                      onPress={() => {
                        setCoachName(item.name);
                        setCoachBio(item.bio ?? '');
                        setCoachSpecialization(item.specialization ?? '');
                        setCoachPhone(item.phone ?? '');
                        setCoachEmail(item.email ?? '');
                        setEditCoach(item);
                      }}
                    />
                    {item.is_active ? (
                      <Button
                        label="Deactivate"
                        variant="ghost"
                        size="sm"
                        fullWidth={false}
                        onPress={() => {
                          Alert.alert('Deactivate Coach', `Deactivate ${item.name}?`, [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Deactivate',
                              style: 'destructive',
                              onPress: () => deactivateCoachMutation.mutate(item.id),
                            },
                          ]);
                        }}
                      />
                    ) : (
                      <Button
                        label="Reactivate"
                        variant="primary"
                        size="sm"
                        fullWidth={false}
                        onPress={() => reactivateCoachMutation.mutate(item.id)}
                      />
                    )}
                  </View>
                </Card>
              )}
            />
          </>
        )}

      {/* ─── TAB 3: LESSON TYPES ─────────────────────────────────────────── */}
      {activeTab === 'lesson_types' && (
        <>
            <FlatList
              data={lessonTypes}
              keyExtractor={(item) => item.id}
              ListHeaderComponent={renderHeader}
              ListEmptyComponent={
                isLoadingLessonTypes ? (
                  <LoadingState message="Loading lesson types..." />
                ) : (
                  <EmptyState
                    title="No Lesson Types"
                    description="Create lesson types (e.g. Beginner Clinic, 1-on-1, Advanced Dinking)."
                    actionLabel="+ Add Lesson Type"
                    onAction={() => {
                      resetLessonTypeForm();
                      setCreateLessonTypeVisible(true);
                    }}
                  />
                )
              }
              refreshControl={
                <RefreshControl
                  refreshing={isRefetchingLessonTypes}
                  onRefresh={refetchLessonTypes}
                  tintColor={Colors.brand.primary}
                />
              }
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <Card style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardTitleCol}>
                      <AppText variant="heading3" style={styles.lessonTitle}>
                        {item.name}
                      </AppText>
                      <View style={styles.badgeGroup}>
                        <Badge
                          label={item.is_private ? 'Private (1:1)' : 'Group'}
                          variant={item.is_private ? 'info' : 'default'}
                        />
                        <Badge
                          label={item.is_active ? 'Active' : 'Inactive'}
                          variant={item.is_active ? 'success' : 'default'}
                        />
                      </View>
                    </View>
                    <AppText variant="heading3" style={styles.priceText}>
                      {Number(item.default_price) === 0 ? 'Free' : `₹${item.default_price}`}
                    </AppText>
                  </View>

                  {item.description ? (
                    <AppText variant="bodySmall" style={styles.bioText} numberOfLines={2}>
                      {item.description}
                    </AppText>
                  ) : null}

                  <View style={styles.detailsGrid}>
                    <View style={styles.detailRow}>
                      <AppText variant="caption" style={styles.detailLabel}>
                        Duration:
                      </AppText>
                      <AppText variant="bodySmall" style={styles.detailValue}>
                        {item.duration_minutes} mins
                      </AppText>
                    </View>
                    <View style={styles.detailRow}>
                      <AppText variant="caption" style={styles.detailLabel}>
                        Default Cap:
                      </AppText>
                      <AppText variant="bodySmall" style={styles.detailValue}>
                        {item.is_private ? '1 (Enforced)' : item.default_capacity ?? 'Unset'}
                      </AppText>
                    </View>
                  </View>

                  <View style={styles.actionRow}>
                    <Button
                      label="Edit"
                      variant="secondary"
                      size="sm"
                      fullWidth={false}
                      onPress={() => {
                        setTypeName(item.name);
                        setTypeDesc(item.description ?? '');
                        setTypeDuration(String(item.duration_minutes));
                        setTypeCapacity(item.default_capacity ? String(item.default_capacity) : '');
                        setTypePrice(String(item.default_price));
                        setTypeIsPrivate(item.is_private);
                        setEditLessonType(item);
                      }}
                    />
                    {item.is_active ? (
                      <Button
                        label="Deactivate"
                        variant="ghost"
                        size="sm"
                        fullWidth={false}
                        onPress={() => {
                          Alert.alert('Deactivate', `Deactivate ${item.name}?`, [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Deactivate',
                              style: 'destructive',
                              onPress: () => deactivateLessonTypeMutation.mutate(item.id),
                            },
                          ]);
                        }}
                      />
                    ) : (
                      <Button
                        label="Reactivate"
                        variant="primary"
                        size="sm"
                        fullWidth={false}
                        onPress={() => reactivateLessonTypeMutation.mutate(item.id)}
                      />
                    )}
                  </View>
                </Card>
              )}
            />
          </>
        )}

      {/* ─── 9. FLOATING ACTION BUTTON ─────────────────────────────────── */}
      {activeTab === 'lessons' && (
        <TouchableOpacity
          style={styles.fab}
          activeOpacity={0.85}
          onPress={() => {
            resetLessonForm();
            setCreateLessonVisible(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Schedule new lesson"
        >
          <CalendarPlus size={24} color="#FFFFFF" strokeWidth={2.2} />
        </TouchableOpacity>
      )}

      {/* ─── MODAL: CREATE LESSON ─────────────────────────────────────────── */}
      <ModalSheet
        visible={createLessonVisible}
        onClose={() => setCreateLessonVisible(false)}
        title="Schedule New Lesson"
        subtitle="Set up a clinic, private coaching, or group lesson."
        actions={[
          {
            label: 'Cancel',
            variant: 'secondary',
            onPress: () => setCreateLessonVisible(false),
          },
          {
            label: createLessonMutation.isPending ? 'Scheduling...' : 'Schedule Lesson',
            variant: 'primary',
            onPress: handleCreateLesson,
            loading: createLessonMutation.isPending,
          },
        ]}
      >
        <View style={{ gap: Spacing[4], paddingBottom: Spacing[6], paddingTop: Spacing[2] }}>
          <Input
            label="Lesson Title *"
            placeholder="e.g. Master the Third Shot Drop"
            value={lessonTitle}
            onChangeText={setLessonTitle}
          />

          <Input
            label="Description"
            placeholder="What players will learn in this session"
            value={lessonDesc}
            onChangeText={setLessonDesc}
            multiline
            numberOfLines={3}
          />

          {/* Select Lesson Type */}
          <AppText variant="caption" style={styles.inputLabel}>
            Lesson Type *
          </AppText>
          <View style={styles.selectorGrid}>
            {lessonTypes
              ?.filter((t) => t.is_active)
              .map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[
                    styles.selectorItem,
                    lessonTypeId === t.id && styles.selectorItemActive,
                  ]}
                  onPress={() => {
                    setLessonTypeId(t.id);
                    if (t.default_price && !lessonPrice) setLessonPrice(String(t.default_price));
                    if (t.default_capacity && !lessonCapacity) setLessonCapacity(String(t.default_capacity));
                  }}
                >
                  <AppText
                    variant="bodySmall"
                    style={[
                      styles.selectorItemText,
                      lessonTypeId === t.id && styles.selectorItemTextActive,
                    ]}
                  >
                    {t.name} ({t.duration_minutes}m)
                  </AppText>
                </TouchableOpacity>
              ))}
          </View>

          {/* Select Coach */}
          <AppText variant="caption" style={styles.inputLabel}>
            Coach *
          </AppText>
          <View style={styles.selectorGrid}>
            {coaches
              ?.filter((c) => c.is_active)
              .map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.selectorItem,
                    coachId === c.id && styles.selectorItemActive,
                  ]}
                  onPress={() => setCoachId(c.id)}
                >
                  <AppText
                    variant="bodySmall"
                    style={[
                      styles.selectorItemText,
                      coachId === c.id && styles.selectorItemTextActive,
                    ]}
                  >
                    {c.name}
                  </AppText>
                </TouchableOpacity>
              ))}
          </View>

          {/* Select Court (Optional) */}
          <AppText variant="caption" style={styles.inputLabel}>
            Court Assignment (Optional)
          </AppText>
          <View style={styles.selectorGrid}>
            <TouchableOpacity
              style={[styles.selectorItem, courtId === '' && styles.selectorItemActive]}
              onPress={() => setCourtId('')}
            >
              <AppText
                variant="bodySmall"
                style={[
                  styles.selectorItemText,
                  courtId === '' && styles.selectorItemTextActive,
                ]}
              >
                None
              </AppText>
            </TouchableOpacity>
            {courts?.map((ct) => (
              <TouchableOpacity
                key={ct.id}
                style={[styles.selectorItem, courtId === ct.id && styles.selectorItemActive]}
                onPress={() => setCourtId(ct.id)}
              >
                <AppText
                  variant="bodySmall"
                  style={[
                    styles.selectorItemText,
                    courtId === ct.id && styles.selectorItemTextActive,
                  ]}
                >
                  {ct.name}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>

          <Input
            label="Start Datetime (ISO) *"
            placeholder="e.g. 2026-10-01T10:00:00Z"
            value={lessonStartAt}
            onChangeText={setLessonStartAt}
          />

          <Input
            label="End Datetime (ISO) *"
            placeholder="e.g. 2026-10-01T11:00:00Z"
            value={lessonEndAt}
            onChangeText={setLessonEndAt}
          />

          <Input
            label="Capacity (Leave blank for default, 1 for private)"
            placeholder="e.g. 4"
            value={lessonCapacity}
            onChangeText={setLessonCapacity}
            keyboardType="numeric"
          />

          <Input
            label="Price (₹)"
            placeholder="e.g. 500.00"
            value={lessonPrice}
            onChangeText={setLessonPrice}
            keyboardType="decimal-pad"
          />
        </View>
      </ModalSheet>

      {/* ─── MODAL: CREATE / EDIT COACH ──────────────────────────────────── */}
      {/* ─── MODAL: CREATE / EDIT COACH ──────────────────────────────────── */}
      <ModalSheet
        visible={createCoachVisible || !!editCoach}
        onClose={() => {
          setCreateCoachVisible(false);
          setEditCoach(null);
        }}
        title={editCoach ? 'Edit Coach' : 'Add Coach'}
        subtitle="Manage coach profile and contact info."
        actions={[
          {
            label: 'Cancel',
            variant: 'secondary',
            onPress: () => {
              setCreateCoachVisible(false);
              setEditCoach(null);
            },
          },
          {
            label: 'Save Coach',
            variant: 'primary',
            onPress: handleSaveCoach,
            loading: createCoachMutation.isPending || updateCoachMutation.isPending,
          },
        ]}
      >
        <View style={{ gap: Spacing[3], paddingBottom: Spacing[4] }}>
          <Input
            label="Coach Name *"
            placeholder="e.g. Alex Morgan"
            value={coachName}
            onChangeText={setCoachName}
          />

          <Input
            label="Specialization"
            placeholder="e.g. Dinking & Strategy, IPTPA Certified"
            value={coachSpecialization}
            onChangeText={setCoachSpecialization}
          />

          <Input
            label="Phone"
            placeholder="e.g. +91 98765 43210"
            value={coachPhone}
            onChangeText={setCoachPhone}
            keyboardType="phone-pad"
          />

          <Input
            label="Email"
            placeholder="e.g. coach@aught2.com"
            value={coachEmail}
            onChangeText={setCoachEmail}
            keyboardType="email-address"
          />

          <Input
            label="Bio / Background"
            placeholder="Coaching experience, tournament highlights, etc."
            value={coachBio}
            onChangeText={setCoachBio}
            multiline
            numberOfLines={3}
          />
        </View>
      </ModalSheet>

      {/* ─── MODAL: CREATE / EDIT LESSON TYPE ─────────────────────────────── */}
      <ModalSheet
        visible={createLessonTypeVisible || !!editLessonType}
        onClose={() => {
          setCreateLessonTypeVisible(false);
          setEditLessonType(null);
        }}
        title={editLessonType ? 'Edit Lesson Type' : 'Add Lesson Type'}
        subtitle="Configure lesson curriculum, capacity, and pricing defaults."
        actions={[
          {
            label: 'Cancel',
            variant: 'secondary',
            onPress: () => {
              setCreateLessonTypeVisible(false);
              setEditLessonType(null);
            },
          },
          {
            label: 'Save Lesson Type',
            variant: 'primary',
            onPress: handleSaveLessonType,
            loading: createLessonTypeMutation.isPending || updateLessonTypeMutation.isPending,
          },
        ]}
      >
        <View style={{ gap: Spacing[3], paddingBottom: Spacing[4] }}>
          <Input
            label="Type Name *"
            placeholder="e.g. Beginner Clinic, 1-on-1 Coaching"
            value={typeName}
            onChangeText={setTypeName}
          />

          <Input
            label="Description"
            placeholder="Curriculum summary, target skill level, etc."
            value={typeDesc}
            onChangeText={setTypeDesc}
            multiline
            numberOfLines={3}
          />

          <Input
            label="Duration (minutes) *"
            placeholder="60"
            value={typeDuration}
            onChangeText={setTypeDuration}
            keyboardType="numeric"
          />

          <Input
            label="Default Capacity"
            placeholder="e.g. 4 (Leave blank if variable)"
            value={typeCapacity}
            onChangeText={setTypeCapacity}
            keyboardType="numeric"
            editable={!typeIsPrivate}
          />

          <Input
            label="Default Price (₹)"
            placeholder="0.00"
            value={typePrice}
            onChangeText={setTypePrice}
            keyboardType="decimal-pad"
          />

          <View style={styles.switchRow}>
            <View style={styles.switchLabelCol}>
              <AppText variant="body" style={styles.switchTitle}>
                Private Lesson (1-on-1)
              </AppText>
              <AppText variant="caption" style={styles.switchSubtitle}>
                Capacity will be strictly locked to 1.
              </AppText>
            </View>
            <Switch
              value={typeIsPrivate}
              onValueChange={(val) => {
                setTypeIsPrivate(val);
                if (val) setTypeCapacity('1');
              }}
              trackColor={{ false: Colors.surface.border, true: Colors.brand.primary }}
            />
          </View>
        </View>
      </ModalSheet>

      {/* ─── MODAL: ROSTER & ATTENDANCE ──────────────────────────────────── */}
      {rosterLesson && (
        <RosterModal
          clubId={activeClubId ?? ''}
          lesson={rosterLesson}
          onClose={() => setRosterLesson(null)}
        />
      )}
    </Screen>
  );
}

// ─── ROSTER MODAL COMPONENT ──────────────────────────────────────────────────

function RosterModal({
  clubId,
  lesson,
  onClose,
}: {
  clubId: string;
  lesson: ClubLesson;
  onClose: () => void;
}) {
  const { data: registrations, isLoading, refetch } = useLessonRegistrations(
    clubId,
    lesson.id,
  );
  const markAttendanceMutation = useStaffMarkLessonAttendance(clubId, lesson.id);
  const cancelRegMutation = useStaffCancelLessonRegistration(clubId, lesson.id);
  const registerPlayerMutation = useStaffRegisterLessonPlayer(clubId, lesson.id);

  const [manualUserId, setManualUserId] = useState('');
  const [manualNotes, setManualNotes] = useState('');

  const handleManualRegister = async () => {
    if (!manualUserId.trim()) {
      Alert.alert('Validation Error', 'Player User UUID is required.');
      return;
    }
    try {
      await registerPlayerMutation.mutateAsync({
        user_id: manualUserId.trim(),
        notes: manualNotes.trim() || null,
      });
      Alert.alert('Success', 'Player registered for lesson.');
      setManualUserId('');
      setManualNotes('');
      refetch();
    } catch (err: any) {
      Alert.alert('Registration Error', err.message || 'Failed to register player.');
    }
  };

  const handleMarkAttendance = async (reg: LessonRegistration, attended: boolean) => {
    try {
      await markAttendanceMutation.mutateAsync({
        registrationId: reg.id,
        attended,
      });
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update attendance.');
    }
  };

  const handleCancelReg = (reg: LessonRegistration) => {
    Alert.alert(
      'Cancel Registration',
      `Cancel registration for ${reg.user_name ?? reg.user_email ?? 'this participant'}?`,
      [
        { text: 'Back', style: 'cancel' },
        {
          text: 'Confirm Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelRegMutation.mutateAsync(reg.id);
              refetch();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to cancel registration.');
            }
          },
        },
      ],
    );
  };

  return (
    <ModalSheet
      visible
      onClose={onClose}
      title="Lesson Roster"
      subtitle={`${lesson.title} (${lesson.registered_count ?? 0}${lesson.capacity ? ` / ${lesson.capacity}` : ''})`}
      actions={[
        {
          label: 'Close',
          variant: 'secondary',
          onPress: onClose,
        },
      ]}
    >
      <View style={{ gap: Spacing[3], paddingBottom: Spacing[4] }}>
        {/* Manual Register Section */}
        <Card style={styles.manualCard}>
          <AppText variant="heading3" style={styles.manualTitle}>
            Register Participant (Staff)
          </AppText>
          <Input
            label="Player User ID (UUID) *"
            placeholder="e.g. 11111111-1111-1111-1111-111111111111"
            value={manualUserId}
            onChangeText={setManualUserId}
          />
          <Input
            label="Staff Notes"
            placeholder="Special instructions or skill notes"
            value={manualNotes}
            onChangeText={setManualNotes}
          />
          <Button
            label={registerPlayerMutation.isPending ? 'Registering...' : 'Register Player'}
            variant="secondary"
            size="sm"
            fullWidth={false}
            onPress={handleManualRegister}
            disabled={registerPlayerMutation.isPending}
          />
        </Card>

        {/* Participant List */}
        <AppText variant="heading3" style={styles.sectionHeading}>
          Registered Participants ({registrations?.length ?? 0})
        </AppText>

        {isLoading ? (
          <LoadingState message="Loading roster..." />
        ) : !registrations || registrations.length === 0 ? (
          <AppText variant="bodySmall" style={styles.emptyRosterText}>
            No players registered for this session yet.
          </AppText>
        ) : (
          registrations.map((reg) => (
            <Card key={reg.id} style={styles.rosterCard}>
              <View style={styles.cardHeader}>
                <View>
                  <AppText variant="body" style={styles.participantName}>
                    {reg.user_name ?? reg.user_email ?? 'Unknown Player'}
                  </AppText>
                  {reg.user_email ? (
                    <AppText variant="caption" style={styles.participantEmail}>
                      {reg.user_email}
                    </AppText>
                  ) : null}
                </View>
                <Badge
                  label={LESSON_REGISTRATION_STATUS_LABELS[reg.status]}
                  variant={getRegStatusBadgeVariant(reg.status)}
                />
              </View>

              {reg.notes ? (
                <AppText variant="caption" style={styles.participantNotes}>
                  Notes: {reg.notes}
                </AppText>
              ) : null}

              {/* Attendance Actions */}
              {reg.status === 'registered' && (
                <View style={styles.rosterActions}>
                  <Button
                    label="Attended"
                    variant="primary"
                    size="sm"
                    fullWidth={false}
                    onPress={() => handleMarkAttendance(reg, true)}
                  />
                  <Button
                    label="No Show"
                    variant="secondary"
                    size="sm"
                    fullWidth={false}
                    onPress={() => handleMarkAttendance(reg, false)}
                  />
                  <Button
                    label="Cancel"
                    variant="ghost"
                    size="sm"
                    fullWidth={false}
                    onPress={() => handleCancelReg(reg)}
                  />
                </View>
              )}
            </Card>
          ))
        )}
      </View>
    </ModalSheet>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F8F5',
  },
  clubCardWrapper: {
    paddingHorizontal: 16,
    marginBottom: 12,
    marginTop: 4,
  },
  promoBannerContainer: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 16,
    overflow: 'hidden',
    height: 125,
    backgroundColor: '#0F392D',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#194A3C',
    justifyContent: 'center',
  },
  promoBannerDecor: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '46%',
    height: '100%',
  },
  promoTextContainer: {
    paddingLeft: 18,
    paddingRight: 8,
    width: '66%',
    zIndex: 2,
  },
  promoHeading: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  promoSubtitle: {
    fontSize: 11,
    color: '#D1FAE5',
    lineHeight: 14.5,
    marginTop: 5,
  },
  promoScriptContainer: {
    position: 'absolute',
    right: 14,
    top: 14,
    zIndex: 3,
  },
  promoScriptText: {
    color: '#D1FAE5',
    fontSize: 13.5,
    lineHeight: 16,
    fontStyle: 'italic',
    textAlign: 'right',
    opacity: 0.9,
  },
  tabContainer: {
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  metricsGrid: {
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 14,
    gap: 8,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAE6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  scheduleHeaderBtn: {
    backgroundColor: '#176B57',
    paddingHorizontal: 16,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 90,
    paddingTop: 4,
  },
  lessonCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 13,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cardThumbnail: {
    width: 74,
    height: 74,
    borderRadius: 10,
    backgroundColor: '#E5F6EC',
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
  },
  cardTopMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadge_completed: {
    backgroundColor: '#E7F0FB',
  },
  statusBadgeText_completed: {
    color: '#2563A8',
  },
  statusBadge_published: {
    backgroundColor: '#E5F6EC',
  },
  statusBadgeText_published: {
    color: '#18794E',
  },
  statusBadge_draft: {
    backgroundColor: '#FFF5D8',
  },
  statusBadgeText_draft: {
    color: '#9A6B00',
  },
  statusBadge_cancelled: {
    backgroundColor: '#FDE8E8',
  },
  statusBadgeText_cancelled: {
    color: '#B42318',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  categoryBadge: {
    backgroundColor: '#F0F4F8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryBadgeText: {
    color: '#475467',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  priceText: {
    color: '#102B2A',
    fontSize: 17,
    fontWeight: '700',
  },
  moreBtn: {
    padding: 2,
  },
  lessonTitle: {
    color: '#102B2A',
    fontSize: 14.5,
    fontWeight: '700',
    marginTop: 4,
    lineHeight: 18,
  },
  lessonDescription: {
    color: '#657776',
    fontSize: 11,
    lineHeight: 14.5,
    marginTop: 3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F8',
  },
  metaCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    minWidth: 0,
  },
  metaIcon: {
    marginTop: 2,
    flexShrink: 0,
  },
  metaColText: {
    flex: 1,
    minWidth: 0,
  },
  metaLabel: {
    fontSize: 9.5,
    color: '#657776',
    fontWeight: '500',
  },
  metaVal: {
    fontSize: 10.5,
    color: '#102B2A',
    fontWeight: '700',
    marginTop: 1,
    lineHeight: 13.5,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  bottomTag: {
    backgroundColor: '#F0F4F8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  bottomTagText: {
    color: '#475467',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  rosterActionBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAE6',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  rosterActionText: {
    color: '#102B2A',
    fontSize: 12,
    fontWeight: '600',
  },
  // Card styles for coaches/types
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  cardTitleCol: {
    flex: 1,
    minWidth: 0,
  },
  detailsGrid: {
    marginTop: 8,
    gap: 4,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 6,
  },
  detailLabel: {
    color: Colors.text.tertiary,
  },
  detailValue: {
    color: Colors.text.secondary,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing[1],
    marginTop: Spacing[2],
    paddingTop: Spacing[1],
    borderTopWidth: 1,
    borderTopColor: Colors.surface.border,
  },
  coachSpec: {
    color: Colors.brand.primary,
    marginTop: 2,
  },
  bioText: {
    color: Colors.text.secondary,
    marginTop: Spacing[1],
  },
  blockedTitle: {
    color: Colors.status.warning,
    marginBottom: Spacing[1],
  },
  blockedText: {
    color: Colors.text.secondary,
  },
  inputLabel: {
    color: Colors.text.secondary,
    marginBottom: 4,
    marginTop: Spacing[1],
  },
  selectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[1],
    marginBottom: Spacing[2],
  },
  selectorItem: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: Colors.background.secondary,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  selectorItemActive: {
    borderColor: Colors.brand.primary,
    backgroundColor: Colors.surface.elevated,
  },
  selectorItemText: {
    color: Colors.text.secondary,
  },
  selectorItemTextActive: {
    color: Colors.brand.primary,
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: Spacing[4],
  },
  switchLabelCol: {
    flex: 1,
    marginRight: Spacing[4],
  },
  switchTitle: {
    color: Colors.text.primary,
    fontWeight: '600',
  },
  switchSubtitle: {
    color: Colors.text.tertiary,
    marginTop: 2,
  },
  manualCard: {
    padding: Spacing[4],
    marginBottom: Spacing[4],
  },
  manualTitle: {
    color: Colors.text.primary,
    marginBottom: Spacing[1],
  },
  sectionHeading: {
    color: Colors.text.primary,
    marginBottom: Spacing[2],
  },
  emptyRosterText: {
    color: Colors.text.tertiary,
    fontStyle: 'italic',
  },
  rosterCard: {
    padding: Spacing[2] + 2,
    marginBottom: Spacing[1],
  },
  participantName: {
    color: Colors.text.primary,
    fontWeight: '600',
  },
  participantEmail: {
    color: Colors.text.tertiary,
  },
  participantNotes: {
    color: Colors.text.secondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  rosterActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing[1],
    marginTop: Spacing[1],
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.surface.border,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#176B57', // dark forest green
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 999,
  },
});
