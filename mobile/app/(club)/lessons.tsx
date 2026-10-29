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
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  GraduationCap,
  Image as ImageIcon,
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
  Input,
  DateTimePickerInput,
  InternationalPhoneInput,
  LoadingState,
  MetricGrid,
  ModalSheet,
  Screen,
  SelectPickerInput,
  LessonRosterModal,
  type SelectPickerOption,
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
  useSeedDefaultLessonTypes,
  useStaffCancelLessonRegistration,
  useStaffMarkLessonAttendance,
  useStaffRegisterLessonPlayer,
  useStaffResetLessonAttendance,
  useUpdateCoach,
  useUpdateClubLesson,
  useUpdateLessonType,
} from '@/hooks';
import { useDrawerStore } from '@/navigation';
import { clubAssetsApi } from '@/services/api/clubAssets';
import { Colors, Radius, Spacing } from '@/theme';
import {
  LESSON_REGISTRATION_STATUS_LABELS,
  LESSON_STATUS_LABELS,
  type ClubBranding,
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
  type UpdateLessonPayload,
} from '@/types';
import { formatCurrency, resolveMediaUrl } from '@/utils';
import { resolveLessonImage } from '@/utils/imageResolution';

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

function getLessonCardImage(item: ClubLesson, clubBranding?: ClubBranding | null) {
  return resolveLessonImage(item, clubBranding);
}

export default function ClubLessonsScreen() {
  const router = useRouter();
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
    data: allLessons = [],
    isLoading: isLoadingLessons,
    isRefetching: isRefetchingLessons,
    refetch: refetchLessons,
  } = useClubLessons(activeClubId ?? '');

  const {
    data: coaches,
    isLoading: isLoadingCoaches,
    isRefetching: isRefetchingCoaches,
    error: errorCoaches,
    refetch: refetchCoaches,
  } = useClubCoaches(activeClubId ?? '');

  const {
    data: lessonTypes,
    isLoading: isLoadingLessonTypes,
    isRefetching: isRefetchingLessonTypes,
    error: errorLessonTypes,
    refetch: refetchLessonTypes,
  } = useClubLessonTypes(activeClubId ?? '');

  const { data: courts } = useClubCourts(activeClubId ?? '', 'active');

  // Mutations
  const createLessonMutation = useCreateClubLesson(activeClubId ?? '');
  const updateLessonMutation = useUpdateClubLesson(activeClubId ?? '');
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
  const seedDefaultLessonTypesMutation = useSeedDefaultLessonTypes(activeClubId ?? '');

  // Form states - Create / Edit Lesson
  const [editingLesson, setEditingLesson] = useState<ClubLesson | null>(null);
  const [lessonTypeId, setLessonTypeId] = useState('');
  const [coachId, setCoachId] = useState('');
  const [courtId, setCourtId] = useState('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonDesc, setLessonDesc] = useState('');
  const [lessonImageUrl, setLessonImageUrl] = useState<string | null>(null);
  const [isUploadingLessonImage, setIsUploadingLessonImage] = useState(false);
  const [lessonStartAt, setLessonStartAt] = useState('');
  const [lessonEndAt, setLessonEndAt] = useState('');
  const [lessonCapacity, setLessonCapacity] = useState('');
  const [lessonPrice, setLessonPrice] = useState('');

  // Lesson Type & Coach options for SelectPickerInput
  const activeLessonTypes = useMemo(() => {
    return lessonTypes?.filter((lt) => lt.is_active) ?? [];
  }, [lessonTypes]);

  const lessonTypeOptions = useMemo<SelectPickerOption[]>(() => {
    return activeLessonTypes.map((lt) => {
      const parts: string[] = [];
      if (lt.duration_minutes) parts.push(`${lt.duration_minutes} min`);
      if (lt.is_private) {
        parts.push('1-on-1 Private');
      } else if (lt.default_capacity) {
        parts.push(`Max ${lt.default_capacity} players`);
      }
      if (lt.default_price !== undefined && lt.default_price !== null) {
        parts.push(formatCurrency(lt.default_price, lt.currency || 'USD'));
      }
      return {
        value: lt.id,
        label: lt.name,
        subtitle: parts.join(' • '),
        badge: lt.is_private ? 'Private' : 'Group',
      };
    });
  }, [activeLessonTypes]);

  const activeCoaches = useMemo(() => {
    return coaches?.filter((c) => c.is_active) ?? [];
  }, [coaches]);

  const coachOptions = useMemo<SelectPickerOption[]>(() => {
    return activeCoaches.map((c) => {
      const secondary = c.specialization || c.email || c.phone || 'Club Coach';
      return {
        value: c.id,
        label: c.name,
        subtitle: secondary,
      };
    });
  }, [activeCoaches]);

  const handleSelectLessonType = (selectedId: string) => {
    setLessonTypeId(selectedId);
    const selected = lessonTypes?.find((lt) => lt.id === selectedId);
    if (selected) {
      if (selected.default_capacity) {
        setLessonCapacity(String(selected.default_capacity));
      }
      if (selected.default_price !== undefined && selected.default_price !== null) {
        setLessonPrice(String(selected.default_price));
      }
      if (!lessonTitle && !editingLesson) {
        setLessonTitle(selected.name);
      }
    }
  };

  const handleInitDefaultLessonTypes = async () => {
    try {
      await seedDefaultLessonTypesMutation.mutateAsync();
      Alert.alert('Success', 'Standard lesson types initialized (Beginner, Intermediate, Private, Doubles).');
    } catch (err: any) {
      Alert.alert('Initialization Failed', err.message || 'Failed to initialize default lesson types.');
    }
  };

  const handleOpenAddLessonType = () => {
    setCreateLessonVisible(false);
    resetLessonForm();
    resetLessonTypeForm();
    setActiveTab('lesson_types');
    setCreateLessonTypeVisible(true);
  };

  const handleOpenAddCoach = () => {
    setCreateLessonVisible(false);
    resetLessonForm();
    resetCoachForm();
    setActiveTab('coaches');
    setCreateCoachVisible(true);
  };

  const handlePickLessonImage = async () => {
    if (!activeClubId) return;
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Needed', 'Please allow gallery access to upload a lesson image.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.85,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const mime = asset.mimeType || (asset.uri?.endsWith('.png') ? 'image/png' : 'image/jpeg');
        const ext = mime.includes('png') ? 'png' : 'jpg';
        const fileName = asset.fileName || `lesson_${Date.now()}.${ext}`;

        setIsUploadingLessonImage(true);
        try {
          const uploadRes = await clubAssetsApi.uploadClubMedia(
            activeClubId,
            { uri: asset.uri, name: fileName, type: mime },
            'lesson_image',
            'lesson'
          );
          setLessonImageUrl(uploadRes.public_url);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Upload failed.';
          Alert.alert('Upload Failed', msg);
        } finally {
          setIsUploadingLessonImage(false);
        }
      }
    } catch {
      Alert.alert('Error', 'Unable to pick image.');
    }
  };

  const handleResetLessonImage = () => {
    setLessonImageUrl(null);
  };

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
    let published = 0;
    let draft = 0;
    let completed = 0;
    let cancelled = 0;

    for (const l of allLessons) {
      if (l.status === 'published') published++;
      else if (l.status === 'draft') draft++;
      else if (l.status === 'completed') completed++;
      else if (l.status === 'cancelled') cancelled++;
    }

    return {
      total: allLessons.length,
      published,
      draft,
      completed,
      cancelled,
    };
  }, [allLessons]);

  const filteredLessons = useMemo(() => {
    if (statusFilter === 'all') return allLessons;
    return allLessons.filter((l) => l.status === statusFilter);
  }, [allLessons, statusFilter]);

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
      if (editingLesson) {
        const payload: UpdateLessonPayload = {
          title: lessonTitle.trim(),
          description: lessonDesc.trim() || null,
          image_url: lessonImageUrl || null,
          lesson_type_id: lessonTypeId,
          coach_id: coachId,
          court_id: courtId || null,
          start_at: lessonStartAt.trim(),
          end_at: lessonEndAt.trim(),
          capacity: lessonCapacity ? parseInt(lessonCapacity, 10) : undefined,
          price: lessonPrice ? parseFloat(lessonPrice) : undefined,
        };

        await updateLessonMutation.mutateAsync({ lessonId: editingLesson.id, payload });
        Alert.alert('Success', 'Lesson updated successfully.');
      } else {
        const payload: CreateLessonPayload = {
          title: lessonTitle.trim(),
          description: lessonDesc.trim() || null,
          image_url: lessonImageUrl || null,
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
      }
      setCreateLessonVisible(false);
      resetLessonForm();
    } catch (err: any) {
      Alert.alert('Error Saving Lesson', err.message || 'Failed to save lesson.');
    }
  };

  const resetLessonForm = () => {
    setEditingLesson(null);
    setLessonTitle('');
    setLessonDesc('');
    setLessonImageUrl(null);
    setLessonTypeId('');
    setCoachId('');
    setCourtId('');
    setLessonStartAt('');
    setLessonEndAt('');
    setLessonCapacity('');
    setLessonPrice('');
  };

  const handleOpenEditLesson = (lesson: ClubLesson) => {
    setEditingLesson(lesson);
    setLessonTitle(lesson.title || '');
    setLessonDesc(lesson.description || '');
    setLessonImageUrl(lesson.image_url || null);
    setLessonTypeId(lesson.lesson_type_id || '');
    setCoachId(lesson.coach_id || '');
    setCourtId(lesson.court_id || '');
    setLessonStartAt(lesson.start_at || '');
    setLessonEndAt(lesson.end_at || '');
    setLessonCapacity(lesson.capacity ? String(lesson.capacity) : '');
    setLessonPrice(lesson.price ? String(lesson.price) : '');
    setCreateLessonVisible(true);
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

  const handleNavigateToDetails = (lesson: ClubLesson) => {
    router.push({
      pathname: '/(club)/lesson-details' as any,
      params: { id: lesson.id, lessonId: lesson.id, clubId: activeClubId },
    });
  };

  const handleLessonMenu = (lesson: ClubLesson) => {
    const buttons: any[] = [];
    buttons.push({
      text: 'View Details',
      onPress: () => handleNavigateToDetails(lesson),
    });
    buttons.push({
      text: 'View Roster',
      onPress: () => setRosterLesson(lesson),
    });
    buttons.push({
      text: 'Edit Lesson & Picture',
      onPress: () => handleOpenEditLesson(lesson),
    });
    if (lesson.status === 'draft') {
      buttons.push({ text: 'Publish Lesson', onPress: () => handlePublish(lesson) });
    }
    if (lesson.status === 'published') {
      buttons.push({ text: 'Complete Lesson', onPress: () => handleCompleteLesson(lesson) });
      buttons.push({ text: 'Cancel Lesson', style: 'destructive', onPress: () => handleCancelLesson(lesson) });
    }
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
          <Plus size={14} color="#FFFFFF" strokeWidth={2.5} />
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
          <Plus size={14} color="#FFFFFF" strokeWidth={2.5} />
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
        <Plus size={14} color="#FFFFFF" strokeWidth={2.5} />
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
            clubBranding?.default_lesson_banner_url
              ? { uri: resolveMediaUrl(clubBranding.default_lesson_banner_url) }
              : require('../../assets/lessons/hero_decor.jpg')
          }
          style={styles.promoBannerDecor}
          resizeMode="cover"
        />
        <View style={styles.promoTextContainer}>
          <AppText style={styles.promoHeading}>
            Better Players,{'\n'}Stronger Community
          </AppText>
          <AppText style={styles.promoSubtitle}>
            Manage lessons and coaching{'\n'}programs for your members.
          </AppText>
          <View style={styles.promoAccentBar} />
        </View>
      </View>

      {/* 4. MAIN TAB NAVIGATION */}
      <View style={styles.tabContainer}>
        <View style={styles.segmentedControl}>
          {(
            [
              { key: 'lessons', label: 'Lessons' },
              { key: 'coaches', label: 'Coaches' },
              { key: 'lesson_types', label: 'Lesson Types' },
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.segmentBtn, isActive && styles.segmentBtnActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.8}
              >
                <AppText style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                  {tab.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ─── TAB 1: LESSONS HEADER ──────────────────────────────────────── */}
      {activeTab === 'lessons' && (
        <>
          {/* 5. STATISTICS CARDS */}
          <MetricGrid
            columns={4}
            valueFirst={true}
            style={styles.metricsGrid}
            metrics={[
              {
                label: 'Total',
                value: metrics.total,
                icon: <Calendar size={14} color="#475569" />,
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
                icon: <FileText size={14} color="#B45309" />,
              },
              {
                label: 'Completed',
                value: metrics.completed,
                variant: 'info',
                icon: <CheckCircle2 size={14} color="#2563EB" />,
              },
            ]}
          />

          {/* 6. FILTER SECTION */}
          <View style={styles.filterSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterScrollContent}
            >
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'draft', label: 'Draft' },
                  { key: 'published', label: 'Published' },
                  { key: 'completed', label: 'Completed' },
                  { key: 'cancelled', label: 'Cancelled' },
                ] as const
              ).map((chip) => {
                const isSelected = statusFilter === chip.key;
                return (
                  <TouchableOpacity
                    key={chip.key}
                    style={[styles.filterChip, isSelected && styles.filterChipSelected]}
                    onPress={() => setStatusFilter(chip.key)}
                    activeOpacity={0.8}
                  >
                    <AppText style={[styles.filterChipText, isSelected && styles.filterChipTextSelected]}>
                      {chip.label}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.filterSettingsBtn} activeOpacity={0.8}>
              <SlidersHorizontal size={16} color="#102B2A" />
            </TouchableOpacity>
          </View>
        </>
      )}
    </>
  );

  const renderLessonCard = ({ item }: { item: ClubLesson }) => {
    const cardImg = getLessonCardImage(item, clubBranding);
    const schedule = formatLessonDateTime(item.start_at, item.end_at);
    const tagLabel = (item.lesson_type_name || (item.is_private ? 'PRIVATE LESSON' : 'GROUP LESSON')).toUpperCase();

    const descriptionText =
      item.description ||
      (item.title.toLowerCase().includes('doubles')
        ? 'Improve your doubles play with proven strategies and drills.'
        : item.title.toLowerCase().includes('beginner')
        ? 'Learn the basics, rules and essential skills in a fun group setting.'
        : item.is_private || item.title.toLowerCase().includes('one-on-one')
        ? 'Personalized coaching to take your game to the next level.'
        : 'Improve your game with proven strategies and drills.');

    return (
      <TouchableOpacity
        style={styles.lessonCard}
        onPress={() => handleNavigateToDetails(item)}
        activeOpacity={0.9}
      >
        {/* Top Section */}
        <View style={styles.cardTopRow}>
          <Image source={cardImg} style={styles.cardThumbnail} resizeMode="cover" />

          <View style={styles.cardMain}>
            <View style={styles.cardTopMeta}>
              <View style={styles.badgeGroup}>
                <View style={[styles.statusBadge, (styles as any)[`statusBadge_${item.status}`] || styles.statusBadge_draft]}>
                  <AppText style={[styles.statusBadgeText, (styles as any)[`statusBadgeText_${item.status}`] || styles.statusBadgeText_draft]}>
                    {(LESSON_STATUS_LABELS[item.status] || item.status).toUpperCase()}
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
                  onPress={(e) => {
                    e.stopPropagation?.();
                    handleLessonMenu(item);
                  }}
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

        {/* Divider */}
        <View style={styles.cardDivider} />

        {/* 2-Row Metadata Section */}
        <View style={styles.metaSection}>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Calendar size={13} color="#657776" style={styles.metaIcon} />
              <AppText style={styles.metaText}>{schedule.date}</AppText>
            </View>
            <View style={styles.metaItem}>
              <Clock size={13} color="#657776" style={styles.metaIcon} />
              <AppText style={styles.metaText}>{schedule.time}</AppText>
            </View>
          </View>

          <View style={[styles.metaRow, { marginTop: 6 }]}>
            <View style={styles.metaItem}>
              <User size={13} color="#657776" style={styles.metaIcon} />
              <AppText style={styles.metaText}>Coach: {item.coach_name || 'Unassigned'}</AppText>
            </View>
            <View style={styles.metaItem}>
              <MapPin size={13} color="#657776" style={styles.metaIcon} />
              <AppText style={styles.metaText}>{item.court_name || 'No Court'}</AppText>
            </View>
            <View style={styles.metaItem}>
              <Users size={13} color="#657776" style={styles.metaIcon} />
              <AppText style={styles.metaText}>
                Capacity: {item.registered_count ?? 0} / {item.capacity ?? '∞'}
              </AppText>
            </View>
          </View>
        </View>

        {/* Bottom Tag & View Details CTA */}
        <View style={styles.cardBottomRow}>
          <View style={styles.bottomTag}>
            <AppText style={styles.bottomTagText}>{tagLabel}</AppText>
          </View>

          <TouchableOpacity
            style={styles.viewDetailsBtn}
            onPress={() => handleNavigateToDetails(item)}
            activeOpacity={0.85}
          >
            <AppText style={styles.viewDetailsText}>View Details →</AppText>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
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
          data={filteredLessons}
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

      {/* ─── MODAL: CREATE / EDIT LESSON ──────────────────────────────────── */}
      <ModalSheet
        visible={createLessonVisible}
        onClose={() => {
          setCreateLessonVisible(false);
          resetLessonForm();
        }}
        title={editingLesson ? 'Edit Lesson' : 'Schedule New Lesson'}
        subtitle={
          editingLesson
            ? 'Update coaching details, picture, and schedule.'
            : 'Set up a clinic, private coaching, or group lesson.'
        }
        actions={[
          {
            label: 'Cancel',
            variant: 'secondary',
            onPress: () => {
              setCreateLessonVisible(false);
              resetLessonForm();
            },
          },
          {
            label: editingLesson
              ? updateLessonMutation.isPending
                ? 'Saving...'
                : 'Save Changes'
              : createLessonMutation.isPending
              ? 'Scheduling...'
              : 'Schedule Lesson',
            variant: 'primary',
            onPress: handleCreateLesson,
            loading: createLessonMutation.isPending || updateLessonMutation.isPending,
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

          {/* Optional Lesson Picture Card */}
          <Card style={styles.formAssetCard}>
            <View style={styles.formAssetHeader}>
              <View style={styles.formAssetHeaderTitleRow}>
                <ImageIcon size={16} color={Colors.brand.primary} />
                <AppText variant="caption" color="secondary" style={styles.formAssetHeaderLabel}>
                  LESSON PICTURE (OPTIONAL)
                </AppText>
              </View>
              <Badge
                label={lessonImageUrl ? 'Custom Picture' : 'Inheriting Club Default'}
                variant={lessonImageUrl ? 'success' : 'default'}
              />
            </View>

            <AppText variant="caption" color="tertiary" style={styles.formAssetDescription}>
              {lessonImageUrl
                ? 'This custom picture will be displayed specifically for this lesson session.'
                : "No custom picture selected. This lesson will automatically use your club's default coaching picture."}
            </AppText>

            <View style={styles.formAssetPreviewContainer}>
              <Image
                source={
                  lessonImageUrl
                    ? { uri: resolveMediaUrl(lessonImageUrl) }
                    : resolveLessonImage(null, clubBranding)
                }
                style={styles.formAssetPreviewImage}
                resizeMode="cover"
              />
              {isUploadingLessonImage && (
                <View style={styles.formAssetUploadingOverlay}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <AppText variant="caption" style={styles.formAssetUploadingText}>
                    Uploading picture...
                  </AppText>
                </View>
              )}
            </View>

            <View style={styles.formAssetActionsRow}>
              <TouchableOpacity
                style={styles.formAssetActionBtn}
                onPress={handlePickLessonImage}
                disabled={isUploadingLessonImage}
                activeOpacity={0.8}
              >
                <Camera size={14} color={Colors.text.primary} />
                <AppText variant="bodySmall" style={styles.formAssetActionBtnText}>
                  {lessonImageUrl ? 'Replace Custom Picture' : 'Upload Custom Picture'}
                </AppText>
              </TouchableOpacity>

              {lessonImageUrl && (
                <TouchableOpacity
                  style={styles.formAssetResetBtn}
                  onPress={handleResetLessonImage}
                  disabled={isUploadingLessonImage}
                  activeOpacity={0.8}
                >
                  <RotateCcw size={14} color={Colors.text.secondary} />
                  <AppText variant="bodySmall" style={styles.formAssetResetBtnText}>
                    Reset to Club Default
                  </AppText>
                </TouchableOpacity>
              )}
            </View>
          </Card>

          {/* Select Lesson Type */}
          <SelectPickerInput
            testID="lesson-type-picker"
            label="Lesson Type"
            required
            value={lessonTypeId}
            options={lessonTypeOptions}
            onChange={handleSelectLessonType}
            placeholder="Select lesson type"
            modalTitle="Select Lesson Type"
            leadingIcon={<GraduationCap size={18} color={lessonTypeId ? Colors.brand.primary : Colors.text.tertiary} />}
            isLoading={isLoadingLessonTypes}
            loadingMessage="Loading lesson types..."
            error={errorLessonTypes ? (errorLessonTypes instanceof Error ? errorLessonTypes.message : 'Failed to load lesson types') : null}
            onRetry={refetchLessonTypes}
            emptyTitle="No Lesson Types Configured"
            emptyMessage="Your club does not have any active lesson types. Initialize standard templates (Beginner, Intermediate, Private, Doubles) or create a custom lesson type."
            emptyActionLabel={seedDefaultLessonTypesMutation.isPending ? 'Initializing...' : '+ Initialize Standard Types'}
            onEmptyAction={handleInitDefaultLessonTypes}
          />

          {/* Select Coach */}
          <SelectPickerInput
            testID="coach-assignment-picker"
            label="Coach Assignment"
            required
            value={coachId}
            options={coachOptions}
            onChange={setCoachId}
            placeholder="Select coach"
            modalTitle="Assign Coach"
            leadingIcon={<User size={18} color={coachId ? Colors.brand.primary : Colors.text.tertiary} />}
            isLoading={isLoadingCoaches}
            loadingMessage="Loading coaches..."
            error={errorCoaches ? (errorCoaches instanceof Error ? errorCoaches.message : 'Failed to load coaches') : null}
            onRetry={refetchCoaches}
            emptyTitle="No Eligible Coaches Found"
            emptyMessage="No coaches have been registered for this club yet. A coach must be added before this lesson can be scheduled."
            emptyActionLabel="+ Add a Coach"
            onEmptyAction={handleOpenAddCoach}
          />

          {/* Select Court (Optional) */}
          <View style={{ gap: Spacing[1.5] }}>
            <AppText variant="caption" style={styles.inputLabel}>
              Court Assignment (Optional)
            </AppText>
            <View style={styles.selectorGrid}>
              <TouchableOpacity
                style={[styles.selectorItem, courtId === '' && styles.selectorItemActive]}
                onPress={() => setCourtId('')}
                activeOpacity={0.8}
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
                  activeOpacity={0.8}
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
          </View>

          <DateTimePickerInput
            label="Start Date & Time"
            placeholder="Select lesson start"
            value={lessonStartAt}
            onChangeDateTime={setLessonStartAt}
            required
          />

          <DateTimePickerInput
            label="End Date & Time"
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
        <LessonRosterModal
          clubId={activeClubId ?? ''}
          lesson={rosterLesson}
          onClose={() => setRosterLesson(null)}
        />
      )}
    </Screen>
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
    backgroundColor: '#176B57',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  scheduleHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // Promo Hero Banner
  promoBannerContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    marginTop: 4,
    borderRadius: 16,
    overflow: 'hidden',
    height: 116,
    backgroundColor: '#0F382E',
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
    width: '48%',
    height: '100%',
  },
  promoTextContainer: {
    paddingLeft: 18,
    paddingRight: 8,
    width: '66%',
    zIndex: 2,
    justifyContent: 'center',
    height: '100%',
  },
  promoHeading: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  promoSubtitle: {
    color: '#A7F3D0',
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 15,
    marginTop: 4,
  },
  promoAccentBar: {
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#10B981',
    marginTop: 8,
  },

  // Segmented Tabs
  tabContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#176B57',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#102B2A',
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Metrics Grid
  metricsGrid: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },

  // Filters
  filterSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  filterScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAE6',
    borderRadius: 18,
    height: 34,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipSelected: {
    backgroundColor: '#176B57',
    borderColor: '#176B57',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3D544F',
  },
  filterChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  filterSettingsBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAE6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Lesson Card
  lessonCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
  },
  cardThumbnail: {
    width: 88,
    height: 88,
    borderRadius: 12,
    backgroundColor: '#E5F5EC',
  },
  cardMain: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  cardTopMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 5,
  },
  statusBadgeText: {
    fontSize: 9.5,
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
    backgroundColor: '#FEF3C7',
  },
  statusBadgeText_draft: {
    color: '#D97706',
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
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 5,
  },
  categoryBadgeText: {
    color: '#137333',
    fontSize: 9.5,
    fontWeight: '800',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  priceText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#102B2A',
  },
  moreBtn: {
    padding: 2,
  },
  lessonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102B2A',
    marginTop: 3,
  },
  lessonDescription: {
    fontSize: 12,
    color: '#657776',
    lineHeight: 16,
    marginTop: 2,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F0F4F2',
    marginVertical: 12,
  },
  metaSection: {
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaIcon: {
    flexShrink: 0,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#102B2A',
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  bottomTag: {
    backgroundColor: '#E5F5EC',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  bottomTagText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#176B57',
    letterSpacing: 0.3,
  },
  viewDetailsBtn: {
    backgroundColor: '#0F392D',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewDetailsText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 100,
  },

  // Coaches & Types Cards// Coaches & Types Cards
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

  formAssetCard: {
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: Radius.md,
    padding: Spacing[3],
    gap: Spacing[2],
  },
  formAssetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  formAssetHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  formAssetHeaderLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  formAssetDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  formAssetPreviewContainer: {
    height: 120,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.surface.default,
    position: 'relative',
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  formAssetPreviewImage: {
    width: '100%',
    height: '100%',
  },
  formAssetUploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing[1],
  },
  formAssetUploadingText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  formAssetActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginTop: Spacing[1],
  },
  formAssetActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingHorizontal: Spacing[3],
    paddingVertical: 7,
    borderRadius: Radius.sm,
  },
  formAssetActionBtnText: {
    color: Colors.text.primary,
    fontWeight: '600',
  },
  formAssetResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingHorizontal: Spacing[3],
    paddingVertical: 7,
    borderRadius: Radius.sm,
  },
  formAssetResetBtnText: {
    color: Colors.text.secondary,
    fontWeight: '500',
  },
});
