/**
 * Aught2 Pickleball — Club Lessons & Coaching Screen
 *
 * Owner & Staff management for coaching, lesson types, lessons, and participant rosters:
 *   - Segmented navigation: Lessons | Coaches | Lesson Types
 *   - Statistics metric cards: Total, Published, Draft, Completed
 *   - Status filtering: All, Draft, Published, Completed, Cancelled
 *   - Clean lesson cards with clear hierarchy, compact metadata, and View Roster primary action
 *   - Modern, responsive Lesson Roster Dialog:
 *       * Pinned header with capacity ratio and close button
 *       * Pinned summary metrics bar (Enrolled, Attended, No Show, Available Spots)
 *       * Pinned status filter chips (All, Enrolled, Attended, No Show, Cancelled)
 *       * Dedicated scrollable participant list with real player full names & avatars
 *       * Real-time attendance tracking (Mark Attended, Mark No Show, Reset Attendance)
 *       * User-friendly Player Registration Workflow (search active club members by name/email,
 *         view booking summary & fee, one-click registration without manual UUID copying)
 *   - Coach management: List, Add, Edit, Deactivate, Reactivate
 *   - Lesson Type configuration: List, Add, Edit, Deactivate, Reactivate
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Mail,
  MapPin,
  Menu,
  MoreVertical,
  Phone,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  User,
  UserCheck,
  Users,
  UserX,
  X,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  FilterChips,
  Input,
  DateTimePickerInput,
  InternationalPhoneInput,
  LoadingState,
  MetricGrid,
  ModalSheet,
  Screen,
  SegmentedTabs,
} from '@/components';
import {
  useActiveClub,
  useClubBranding,
  useCancelClubLesson,
  useClubCoaches,
  useClubCourts,
  useClubLessons,
  useClubLessonTypes,
  useClubPlayerMembers,
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
  useStaffResetLessonAttendance,
  useUpdateCoach,
  useUpdateLessonType,
} from '@/hooks';
import { useDrawerStore } from '@/navigation';
import { Colors, Radius, Spacing } from '@/theme';
import {
  LESSON_REGISTRATION_STATUS_LABELS,
  LESSON_STATUS_LABELS,
  type ClubLesson,
  type ClubPlayerMember,
  type Coach,
  type CreateCoachPayload,
  type CreateLessonPayload,
  type CreateLessonTypePayload,
  type LessonRegistration,
  type LessonRegistrationStatus,
  type LessonStatus,
  type LessonType,
} from '@/types';
import { formatCurrency, resolveMediaUrl } from '@/utils';

type StaffTab = 'lessons' | 'coaches' | 'lesson_types';

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

function getLessonCardImage(item: ClubLesson, clubCoverUrl?: string | null) {
  if (item.image_url) {
    return { uri: resolveMediaUrl(item.image_url) };
  }
  if (clubCoverUrl) {
    return { uri: resolveMediaUrl(clubCoverUrl) };
  }
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
  const { data: clubBranding } = useClubBranding(activeClubId ?? '');
  const toggleDrawer = useDrawerStore((s) => s.toggleDrawer);

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

  // Metrics (calculated from persisted lessons)
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

  const handlePublish = (lesson: ClubLesson) => {
    Alert.alert(
      'Publish Lesson',
      `Publish "${lesson.title}"? Once published, eligible club members can register.`,
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
      `Cancel "${lesson.title}"? All active registrations will be cancelled.`,
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
          <Plus size={15} color="#FFFFFF" />
          <AppText style={styles.scheduleHeaderBtnText}>Schedule</AppText>
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
          <Plus size={15} color="#FFFFFF" />
          <AppText style={styles.scheduleHeaderBtnText}>Coach</AppText>
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
        <Plus size={15} color="#FFFFFF" />
        <AppText style={styles.scheduleHeaderBtnText}>Type</AppText>
      </TouchableOpacity>
    );
  }, [activeTab]);

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
          source={
            clubBranding?.cover_image_url
              ? { uri: resolveMediaUrl(clubBranding.cover_image_url) }
              : require('../../assets/lessons/hero_decor.jpg')
          }
          style={styles.promoBannerDecor}
          resizeMode="cover"
        />
        <View style={styles.promoTextContainer}>
          <AppText style={styles.promoHeading}>
            Better Players{'\n'}Stronger Community
          </AppText>
          <AppText style={styles.promoSubtitle}>
            Manage lessons, coaching programs and help your members grow.
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
    const cardImg = getLessonCardImage(item, clubBranding?.cover_image_url);
    const rosterLabel = item.status === 'completed' ? 'View Attendance →' : 'View Roster →';
    const tagLabel = item.lesson_type_name?.toUpperCase() || (item.is_private ? 'PRIVATE' : 'GROUP LESSON');

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
                  {Number(item.price) === 0 ? 'Free' : formatCurrency(Number(item.price))}
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

            <AppText style={styles.lessonTitle} numberOfLines={1}>
              {item.title}
            </AppText>

            <AppText style={styles.lessonDescription} numberOfLines={2}>
              {descriptionText}
            </AppText>
          </View>
        </View>

        {/* 4-Column Metadata Row */}
        <View style={styles.metaRow}>
          {item.coach_name ? (
            <View style={styles.metaCol}>
              <User size={12} color="#176B57" style={styles.metaIcon} />
              <View style={styles.metaColText}>
                <AppText style={styles.metaLabel}>Coach</AppText>
                <AppText style={styles.metaVal} numberOfLines={1}>
                  {item.coach_name}
                </AppText>
              </View>
            </View>
          ) : null}

          {item.court_name ? (
            <View style={styles.metaCol}>
              <MapPin size={12} color="#667776" style={styles.metaIcon} />
              <View style={styles.metaColText}>
                <AppText style={styles.metaLabel}>Court</AppText>
                <AppText style={styles.metaVal} numberOfLines={1}>
                  {item.court_name}
                </AppText>
              </View>
            </View>
          ) : null}

          <View style={[styles.metaCol, { flex: 1.25 }]}>
            <Calendar size={12} color="#667776" style={styles.metaIcon} />
            <View style={styles.metaColText}>
              <AppText style={styles.metaLabel}>Schedule</AppText>
              <AppText style={styles.metaVal} numberOfLines={1}>
                {formatLessonSchedule(item.start_at)}
              </AppText>
            </View>
          </View>

          <View style={styles.metaCol}>
            <Users size={12} color="#667776" style={styles.metaIcon} />
            <View style={styles.metaColText}>
              <AppText style={styles.metaLabel}>Capacity</AppText>
              <AppText style={styles.metaVal}>
                {item.registered_count ?? 0} / {item.capacity ?? '∞'}
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
            activeOpacity={0.8}
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
                onAction={() => {
                  resetLessonForm();
                  setCreateLessonVisible(true);
                }}
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
              tintColor="#176B57"
            />
          }
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={styles.coachAvatarCircle}>
                    <AppText style={styles.coachAvatarInitials}>
                      {item.name.slice(0, 2).toUpperCase()}
                    </AppText>
                  </View>
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
                    <Mail size={13} color="#667776" />
                    <AppText variant="bodySmall" style={styles.detailValue}>
                      {item.email}
                    </AppText>
                  </View>
                ) : null}
                {item.phone ? (
                  <View style={styles.detailRow}>
                    <Phone size={13} color="#667776" />
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
      )}

      {/* ─── TAB 3: LESSON TYPES ─────────────────────────────────────────── */}
      {activeTab === 'lesson_types' && (
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
              tintColor="#176B57"
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
                <AppText style={styles.typePriceBadge}>
                  {Number(item.default_price) === 0 ? 'Free' : formatCurrency(Number(item.default_price))}
                </AppText>
              </View>

              {item.description ? (
                <AppText variant="bodySmall" style={styles.bioText} numberOfLines={2}>
                  {item.description}
                </AppText>
              ) : null}

              <View style={styles.detailsGrid}>
                <View style={styles.detailRow}>
                  <Clock size={13} color="#667776" />
                  <AppText variant="bodySmall" style={styles.detailValue}>
                    {item.duration_minutes} minutes
                  </AppText>
                </View>
                <View style={styles.detailRow}>
                  <Users size={13} color="#667776" />
                  <AppText variant="bodySmall" style={styles.detailValue}>
                    {item.default_capacity ? `Default Capacity: ${item.default_capacity}` : 'Variable capacity'}
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
                    setTypePrice(item.default_price ? String(item.default_price) : '0.00');
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
                      Alert.alert('Deactivate Lesson Type', `Deactivate ${item.name}?`, [
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
        <View style={{ gap: Spacing[3], paddingBottom: Spacing[4] }}>
          <Input
            label="Lesson Title *"
            placeholder="e.g. Saturday Dinking Clinic"
            value={lessonTitle}
            onChangeText={setLessonTitle}
          />

          <Input
            label="Description"
            placeholder="What will players learn in this session?"
            value={lessonDesc}
            onChangeText={setLessonDesc}
            multiline
            numberOfLines={2}
          />

          {/* Select Lesson Type */}
          <AppText variant="caption" style={styles.inputLabel}>
            Lesson Type *
          </AppText>
          <View style={styles.selectorGrid}>
            {lessonTypes?.filter((lt) => lt.is_active).map((lt) => (
              <TouchableOpacity
                key={lt.id}
                style={[styles.selectorItem, lessonTypeId === lt.id && styles.selectorItemActive]}
                onPress={() => {
                  setLessonTypeId(lt.id);
                  if (lt.default_capacity) setLessonCapacity(String(lt.default_capacity));
                  if (lt.default_price) setLessonPrice(String(lt.default_price));
                }}
              >
                <AppText
                  variant="bodySmall"
                  style={[
                    styles.selectorItemText,
                    lessonTypeId === lt.id && styles.selectorItemTextActive,
                  ]}
                >
                  {lt.name}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>

          {/* Select Coach */}
          <AppText variant="caption" style={styles.inputLabel}>
            Coach Assignment *
          </AppText>
          <View style={styles.selectorGrid}>
            {coaches?.filter((c) => c.is_active).map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.selectorItem, coachId === c.id && styles.selectorItemActive]}
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

          <DateTimePickerInput
            label="Start Date & Time *"
            placeholder="Select lesson start"
            value={lessonStartAt}
            onChangeDateTime={setLessonStartAt}
            required
          />

          <DateTimePickerInput
            label="End Date & Time *"
            placeholder="Select lesson end"
            value={lessonEndAt}
            onChangeDateTime={setLessonEndAt}
            required
          />

          <Input
            label="Capacity (Leave blank for default, 1 for private)"
            placeholder="e.g. 4"
            value={lessonCapacity}
            onChangeText={setLessonCapacity}
            keyboardType="numeric"
          />

          <Input
            label="Price (USD)"
            placeholder="e.g. 50.00"
            value={lessonPrice}
            onChangeText={setLessonPrice}
            keyboardType="decimal-pad"
          />
        </View>
      </ModalSheet>

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

          <InternationalPhoneInput
            label="Phone"
            value={coachPhone}
            onChangeText={setCoachPhone}
            hint="Format: e.g. +1 (555) 000-0000"
          />

          <Input
            label="Email"
            placeholder="e.g. coach@pickleball.com"
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
            label="Default Price (USD)"
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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isDesktop = windowWidth >= 768;

  const { data: registrations = [], isLoading, refetch } = useLessonRegistrations(
    clubId,
    lesson.id,
  );
  const markAttendanceMutation = useStaffMarkLessonAttendance(clubId, lesson.id);
  const resetAttendanceMutation = useStaffResetLessonAttendance(clubId, lesson.id);
  const cancelRegMutation = useStaffCancelLessonRegistration(clubId, lesson.id);
  const registerPlayerMutation = useStaffRegisterLessonPlayer(clubId, lesson.id);

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

    // Active spots used = registered + attended + no_show
    const activeSpots = reg + att + noShow;
    const availableSpots =
      lesson.capacity !== null && lesson.capacity !== undefined
        ? Math.max(0, lesson.capacity - activeSpots)
        : null;

    return { reg, att, noShow, canc, activeSpots, availableSpots, total: registrations.length };
  }, [registrations, lesson.capacity]);

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

    // Capacity verification
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

  const capacityInfo =
    lesson.capacity !== null && lesson.capacity !== undefined
      ? `${counts.activeSpots} / ${lesson.capacity} spots filled`
      : `${counts.activeSpots} participants (unlimited capacity)`;

  const isLessonClosed = lesson.status === 'completed' || lesson.status === 'cancelled';
  const isLessonFull =
    lesson.capacity !== null && lesson.capacity !== undefined && counts.activeSpots >= lesson.capacity;

  return (
    <Modal
      visible
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
              <ScrollView
                style={styles.rosterScrollList}
                contentContainerStyle={styles.rosterScrollContent}
              >
                {isLoading ? (
                  <LoadingState message="Loading lesson roster..." />
                ) : filteredRegistrations.length === 0 ? (
                  <View style={styles.rosterEmptyContainer}>
                    <Users size={32} color="#889998" />
                    <AppText style={styles.rosterEmptyTitle}>
                      {filterStatus === 'all'
                        ? 'No Registered Participants'
                        : `No ${LESSON_REGISTRATION_STATUS_LABELS[filterStatus]} Participants`}
                    </AppText>
                    <AppText style={styles.rosterEmptySub}>
                      {filterStatus === 'all'
                        ? 'Use "+ Add Participant" above to enroll eligible players.'
                        : 'Filter is empty for this session.'}
                    </AppText>
                  </View>
                ) : (
                  filteredRegistrations.map((reg) => {
                    const displayName =
                      reg.user_full_name || reg.user_name || reg.user_email || 'Participant';
                    const initials = displayName.slice(0, 2).toUpperCase();

                    return (
                      <View key={reg.id} style={styles.rosterParticipantCard}>
                        {/* Top: Avatar, Name, Status Badge */}
                        <View style={styles.participantTopRow}>
                          <View style={styles.participantAvatar}>
                            <AppText style={styles.participantAvatarText}>
                              {initials}
                            </AppText>
                          </View>

                          <View style={styles.participantInfoCol}>
                            <AppText style={styles.participantNameText} numberOfLines={1}>
                              {displayName}
                            </AppText>
                            {reg.user_email && reg.user_email !== displayName ? (
                              <AppText style={styles.participantEmailText} numberOfLines={1}>
                                {reg.user_email}
                              </AppText>
                            ) : null}
                          </View>

                          <View
                            style={[
                              styles.regBadge,
                              reg.status === 'registered' && styles.regBadge_registered,
                              reg.status === 'attended' && styles.regBadge_attended,
                              reg.status === 'no_show' && styles.regBadge_noshow,
                              reg.status === 'cancelled' && styles.regBadge_cancelled,
                            ]}
                          >
                            <AppText
                              style={[
                                styles.regBadgeText,
                                reg.status === 'registered' && styles.regBadgeText_registered,
                                reg.status === 'attended' && styles.regBadgeText_attended,
                                reg.status === 'no_show' && styles.regBadgeText_noshow,
                                reg.status === 'cancelled' && styles.regBadgeText_cancelled,
                              ]}
                            >
                              {LESSON_REGISTRATION_STATUS_LABELS[reg.status].toUpperCase()}
                            </AppText>
                          </View>
                        </View>

                        {/* Notes if available */}
                        {reg.notes ? (
                          <View style={styles.notesBox}>
                            <AppText style={styles.notesText}>
                              Note: {reg.notes}
                            </AppText>
                          </View>
                        ) : null}

                        {/* Status-Specific Actions */}
                        {reg.status === 'registered' && (
                          <View style={styles.participantActionsRow}>
                            <TouchableOpacity
                              style={styles.markAttendedBtn}
                              onPress={() => handleMarkAttendance(reg.id, true)}
                              activeOpacity={0.8}
                            >
                              <Check size={13} color="#FFFFFF" />
                              <AppText style={styles.markAttendedBtnText}>Mark Attended</AppText>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.markNoShowBtn}
                              onPress={() => handleMarkAttendance(reg.id, false)}
                              activeOpacity={0.8}
                            >
                              <X size={13} color="#78350F" />
                              <AppText style={styles.markNoShowBtnText}>Mark No Show</AppText>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.cancelRegBtn}
                              onPress={() => handleCancelRegistration(reg)}
                              activeOpacity={0.8}
                            >
                              <AppText style={styles.cancelRegBtnText}>Cancel</AppText>
                            </TouchableOpacity>
                          </View>
                        )}

                        {reg.status === 'attended' && (
                          <View style={styles.attendanceStateRow}>
                            <View style={styles.confirmedAttendanceTag}>
                              <CheckCircle2 size={13} color="#0F766E" />
                              <AppText style={styles.confirmedAttendanceText}>
                                Attendance Confirmed
                              </AppText>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <TouchableOpacity
                                style={styles.resetAttendanceBtn}
                                onPress={() => handleResetAttendance(reg.id)}
                                activeOpacity={0.8}
                              >
                                <RotateCcw size={12} color="#102B2A" />
                                <AppText style={styles.resetAttendanceBtnText}>Reset</AppText>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.switchAttendanceBtn}
                                onPress={() => handleMarkAttendance(reg.id, false)}
                                activeOpacity={0.8}
                              >
                                <AppText style={styles.switchAttendanceBtnText}>No Show</AppText>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}

                        {reg.status === 'no_show' && (
                          <View style={styles.attendanceStateRow}>
                            <View style={styles.confirmedNoShowTag}>
                              <X size={13} color="#B45309" />
                              <AppText style={styles.confirmedNoShowText}>
                                Did Not Attend
                              </AppText>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <TouchableOpacity
                                style={styles.resetAttendanceBtn}
                                onPress={() => handleResetAttendance(reg.id)}
                                activeOpacity={0.8}
                              >
                                <RotateCcw size={12} color="#102B2A" />
                                <AppText style={styles.resetAttendanceBtnText}>Reset</AppText>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.switchAttendanceBtnAttended}
                                onPress={() => handleMarkAttendance(reg.id, true)}
                                activeOpacity={0.8}
                              >
                                <AppText style={styles.switchAttendanceBtnTextAttended}>Attended</AppText>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}

                        {reg.status === 'cancelled' && (
                          <View style={styles.cancelledNoticeBox}>
                            <AppText style={styles.cancelledNoticeText}>
                              Registration cancelled • Excluded from active lesson capacity
                            </AppText>
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F8F5',
  },
  hamburgerBtn: {
    padding: 6,
    borderRadius: 8,
    marginRight: 6,
  },
  scheduleHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0F392D',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#194A3C',
  },
  scheduleHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // Promo Banner
  promoBannerContainer: {
    marginHorizontal: 16,
    marginBottom: 14,
    marginTop: 4,
    borderRadius: 16,
    overflow: 'hidden',
    height: 110,
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
    width: '50%',
    height: '100%',
    opacity: 0.35,
  },
  promoTextContainer: {
    paddingLeft: 18,
    paddingRight: 100,
    zIndex: 2,
    justifyContent: 'center',
  },
  promoHeading: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 21,
    letterSpacing: -0.3,
  },
  promoSubtitle: {
    color: '#9FE1C3',
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 4,
    lineHeight: 15,
  },
  promoScriptContainer: {
    position: 'absolute',
    right: 14,
    top: 14,
    zIndex: 2,
  },
  promoScriptText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'right',
    lineHeight: 15,
    fontWeight: '600',
  },

  // Tab & Filters
  tabContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  metricsGrid: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  settingsBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6ECE8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  listContent: {
    paddingBottom: 40,
  },

  // Lesson Card
  lessonCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E6ECE8',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cardThumbnail: {
    width: 82,
    height: 82,
    borderRadius: 12,
    backgroundColor: '#E6ECE8',
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'space-between',
  },
  cardTopMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  statusBadge_published: {
    backgroundColor: '#E6F4EA',
  },
  statusBadgeText_published: {
    color: '#137333',
  },
  statusBadge_draft: {
    backgroundColor: '#FEF7E0',
  },
  statusBadgeText_draft: {
    color: '#B06000',
  },
  statusBadge_completed: {
    backgroundColor: '#E8F0FE',
  },
  statusBadgeText_completed: {
    color: '#1A73E8',
  },
  statusBadge_cancelled: {
    backgroundColor: '#FCE8E6',
  },
  statusBadgeText_cancelled: {
    color: '#C5221F',
  },
  categoryBadge: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  categoryBadgeText: {
    color: '#15803D',
    fontSize: 9.5,
    fontWeight: '700',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  priceText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#102B2A',
  },
  moreBtn: {
    padding: 2,
  },
  lessonTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102B2A',
    marginBottom: 2,
  },
  lessonDescription: {
    fontSize: 11.5,
    color: '#667776',
    lineHeight: 16,
  },

  // Metadata Row
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAF9',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
    marginBottom: 10,
    gap: 8,
  },
  metaCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minWidth: 0,
  },
  metaIcon: {
    flexShrink: 0,
  },
  metaColText: {
    minWidth: 0,
    flex: 1,
  },
  metaLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#889998',
    textTransform: 'uppercase',
  },
  metaVal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#102B2A',
  },

  // Bottom Row
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  bottomTag: {
    backgroundColor: '#EEF6F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  bottomTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F392D',
  },
  rosterActionBtn: {
    backgroundColor: '#0F392D',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rosterActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // Coaches & Types Cards
  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E6ECE8',
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  coachAvatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0F392D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachAvatarInitials: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  coachSpec: {
    color: '#15803D',
    fontWeight: '600',
    fontSize: 11.5,
    marginTop: 1,
  },
  bioText: {
    color: '#667776',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2',
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailValue: {
    color: '#102B2A',
    fontWeight: '600',
    fontSize: 12,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    alignItems: 'center',
  },
  cardTitleCol: {
    flex: 1,
    gap: 4,
  },
  typePriceBadge: {
    fontSize: 14,
    fontWeight: '800',
    color: '#102B2A',
  },

  // Form selectors
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#102B2A',
    marginBottom: 4,
  },
  selectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  selectorItem: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F0F4F2',
    borderWidth: 1,
    borderColor: '#E6ECE8',
  },
  selectorItemActive: {
    backgroundColor: '#0F392D',
    borderColor: '#0F392D',
  },
  selectorItemText: {
    color: '#102B2A',
    fontWeight: '600',
  },
  selectorItemTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E6ECE8',
    marginTop: 4,
  },
  switchLabelCol: {
    flex: 1,
    marginRight: 12,
  },
  switchTitle: {
    fontWeight: '600',
    color: '#102B2A',
  },
  switchSubtitle: {
    color: '#667776',
    marginTop: 2,
  },

  // ─── ROSTER MODAL STYLES ──────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalSheetContainer: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    overflow: 'hidden',
  },
  modalDialogDesktop: {
    maxWidth: 680,
    maxHeight: '90%',
    borderRadius: 24,
    marginBottom: 'auto',
    marginTop: 'auto',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalSheetMobile: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 16,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  rosterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  rosterHeaderText: {
    flex: 1,
    paddingRight: 12,
  },
  rosterTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#102B2A',
    letterSpacing: -0.3,
  },
  rosterSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F766E',
    marginTop: 2,
  },
  rosterCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F4F2',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Roster Metrics Bar
  rosterMetricsBar: {
    flexDirection: 'row',
    backgroundColor: '#F8FAF9',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E6ECE8',
    gap: 8,
  },
  rosterMetricCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6ECE8',
  },
  rosterMetricVal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#102B2A',
  },
  rosterMetricLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#667776',
    textTransform: 'uppercase',
    marginTop: 1,
  },

  // Roster Actions Bar
  rosterActionsBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
    backgroundColor: '#FFFFFF',
  },
  addParticipantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0F392D',
    paddingVertical: 9,
    borderRadius: 12,
  },
  addParticipantBtnDisabled: {
    backgroundColor: '#94A3B8',
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
    gap: 6,
    backgroundColor: '#F0F4F2',
    paddingVertical: 8,
    borderRadius: 12,
  },
  cancelAddParticipantText: {
    color: '#102B2A',
    fontSize: 13,
    fontWeight: '700',
  },

  // Roster Chips
  rosterChipsContainer: {
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  rosterChipsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  rosterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F0F4F2',
    borderWidth: 1,
    borderColor: '#E6ECE8',
  },
  rosterChipActive: {
    backgroundColor: '#102B2A',
    borderColor: '#102B2A',
  },
  rosterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#667776',
  },
  rosterChipTextActive: {
    color: '#FFFFFF',
  },

  // Roster List
  rosterScrollList: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  rosterScrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 10,
  },
  rosterEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  rosterEmptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102B2A',
    marginTop: 10,
  },
  rosterEmptySub: {
    fontSize: 12,
    color: '#667776',
    textAlign: 'center',
    marginTop: 4,
  },

  // Participant Card
  rosterParticipantCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6ECE8',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  participantTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  participantAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E6F4EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantAvatarText: {
    color: '#137333',
    fontWeight: '800',
    fontSize: 13,
  },
  participantInfoCol: {
    flex: 1,
    minWidth: 0,
  },
  participantNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102B2A',
  },
  participantEmailText: {
    fontSize: 11.5,
    color: '#667776',
    marginTop: 1,
  },

  // Registration Status Badges
  regBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  regBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  regBadge_registered: {
    backgroundColor: '#E6F4EA',
  },
  regBadgeText_registered: {
    color: '#137333',
  },
  regBadge_attended: {
    backgroundColor: '#CCFBF1',
  },
  regBadgeText_attended: {
    color: '#0F766E',
  },
  regBadge_noshow: {
    backgroundColor: '#FEF3C7',
  },
  regBadgeText_noshow: {
    color: '#B45309',
  },
  regBadge_cancelled: {
    backgroundColor: '#F1F5F9',
  },
  regBadgeText_cancelled: {
    color: '#64748B',
  },

  notesBox: {
    backgroundColor: '#F8FAF9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  notesText: {
    fontSize: 11,
    color: '#475569',
    fontStyle: 'italic',
  },

  participantActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2',
  },
  markAttendedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#137333',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  markAttendedBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  markNoShowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    borderRadius: 8,
  },
  markNoShowBtnText: {
    color: '#92400E',
    fontSize: 11.5,
    fontWeight: '700',
  },
  cancelRegBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 'auto',
  },
  cancelRegBtnText: {
    color: '#DC2626',
    fontSize: 11.5,
    fontWeight: '700',
  },

  attendanceStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2',
  },
  confirmedAttendanceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  confirmedAttendanceText: {
    color: '#0F766E',
    fontSize: 12,
    fontWeight: '700',
  },
  confirmedNoShowTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  confirmedNoShowText: {
    color: '#B45309',
    fontSize: 12,
    fontWeight: '700',
  },
  resetAttendanceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0F4F2',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  resetAttendanceBtnText: {
    color: '#102B2A',
    fontSize: 11,
    fontWeight: '700',
  },
  switchAttendanceBtn: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  switchAttendanceBtnText: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '700',
  },
  switchAttendanceBtnAttended: {
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  switchAttendanceBtnTextAttended: {
    color: '#0F766E',
    fontSize: 11,
    fontWeight: '700',
  },
  cancelledNoticeBox: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2',
  },
  cancelledNoticeText: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
  },

  // ─── REGISTRATION WORKFLOW STYLES ───
  registrationContextCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6ECE8',
    padding: 12,
  },
  contextHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  contextLessonTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#102B2A',
  },
  contextLessonMeta: {
    fontSize: 11.5,
    color: '#667776',
    marginTop: 2,
  },
  contextPricePill: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  contextPriceText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803D',
  },
  contextSpotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2',
  },
  contextSpotsText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#137333',
  },

  stepTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#102B2A',
    marginBottom: 2,
  },
  stepSubtitle: {
    fontSize: 11.5,
    color: '#667776',
    marginBottom: 8,
  },
  playerSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  playerSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#102B2A',
    padding: 0,
  },
  noPlayersFoundBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E6ECE8',
  },
  noPlayersFoundText: {
    fontSize: 12,
    color: '#667776',
    textAlign: 'center',
  },
  playerCandidateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E6ECE8',
    padding: 10,
  },
  playerCandidateDisabled: {
    opacity: 0.6,
    backgroundColor: '#F8FAF9',
  },
  playerAvatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0F392D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerAvatarInitials: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  playerCandidateName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102B2A',
  },
  playerCandidateEmail: {
    fontSize: 11,
    color: '#667776',
  },
  selectPlayerBadge: {
    backgroundColor: '#0F392D',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  selectPlayerText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  alreadyEnrolledBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  alreadyEnrolledText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
  },
  inactiveMemberBadge: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  inactiveMemberText: {
    color: '#EF4444',
    fontSize: 10,
    fontWeight: '700',
  },

  // Selected Player Summary
  selectedPlayerSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    padding: 12,
  },
  playerAvatarCircleSelected: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#15803D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerAvatarInitialsSelected: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  selectedPlayerName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#14532D',
  },
  selectedPlayerEmail: {
    fontSize: 11.5,
    color: '#166534',
  },
  selectedPlayerMemberNum: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#15803D',
    marginTop: 1,
  },
  changePlayerBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#DCFCE7',
  },
  changePlayerBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#14532D',
  },
  notesInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    color: '#102B2A',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  confirmRegActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
});
