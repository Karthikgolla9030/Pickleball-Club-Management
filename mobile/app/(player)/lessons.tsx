/**
 * Aught2 Pickleball — Player Lessons & Coaching Screen
 *
 * Reproduces the visual design, layout, spacing, colors, typography, cards, icons,
 * and navigation shown in the reference image (right screen):
 *   - Pale mint background (#F8FAF9)
 *   - Mobile header with hamburger menu icon and "Lessons" title
 *   - Subtitle: "Explore coaching sessions and improve your game"
 *   - Segmented Control tabs: "Discover Lessons" and "My Registrations"
 *     (white rounded pill container, dark green active tab, smooth toggle)
 *   - Discover Lessons cards:
 *     - Compact thumbnail on left (card1, card2, card3)
 *     - Title and price on top right
 *     - Category ("Group Clinic") and Skill level ("Beginner Fundamentals", etc.) badges
 *     - Date & duration with Calendar icon ("Sat, 26 Sep 2026 · 60 min")
 *     - Court / venue with MapPin icon ("Court 1")
 *     - Available spots with Users icon ("6 spots open")
 *     - Chevron right icon
 *     - Full-width dark green "Register for Lesson →" button
 *   - My Registrations tab:
 *     - Same card visual design and layout
 *     - Shows registration status, lesson details, cancellation action
 *     - Clean empty state when no registrations exist
 *   - Interactive registration confirmation modal with live server validation
 */

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowRight,
  Award,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  HelpCircle,
  Info,
  MapPin,
  Menu,
  ShieldAlert,
  Sparkles,
  Users,
  X,
} from 'lucide-react-native';

import { AppText, ModalSheet } from '@/components';
import {
  useActiveClub,
  useDiscoverLessons,
  useMyLessons,
  usePlayerCancelLessonRegistration,
  usePlayerRegisterLesson,
} from '@/hooks';
import { useDrawerStore } from '@/navigation';
import { Colors } from '@/theme';
import type {
  LessonRegistration,
  LessonRegistrationStatus,
  PlayerLessonDetail,
} from '@/types';

// ─── Thumbnail Assets ────────────────────────────────────────────────────────

const LESSON_CARDS = [
  require('../../assets/lessons/card1.jpg'),
  require('../../assets/lessons/card2.jpg'),
  require('../../assets/lessons/card3.jpg'),
];

function getLessonThumbnail(title: string, index: number) {
  const t = (title || '').toLowerCase();
  if (t.includes('beginner') || t.includes('clinic')) return LESSON_CARDS[0];
  if (t.includes('third-shot') || t.includes('mastery') || t.includes('intermediate'))
    return LESSON_CARDS[1];
  if (t.includes('dinking') || t.includes('advanced') || t.includes('tactical'))
    return LESSON_CARDS[2];
  return LESSON_CARDS[index % LESSON_CARDS.length];
}

// ─── Date Formatter ──────────────────────────────────────────────────────────

function formatLessonSchedule(startIso: string, durationMinutes: number = 60): string {
  try {
    const d = new Date(startIso);
    if (isNaN(d.getTime())) return `${startIso} · ${durationMinutes} min`;
    const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' });
    const day = d.getDate();
    const month = d.toLocaleDateString('en-GB', { month: 'short' });
    const year = d.getFullYear();
    return `${weekday}, ${day} ${month} ${year} · ${durationMinutes} min`;
  } catch {
    return `${startIso} · ${durationMinutes} min`;
  }
}

function formatSimpleDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

type TabKey = 'discover' | 'my_registrations';

// ─── Main Component ──────────────────────────────────────────────────────────

export default function PlayerLessonsScreen() {
  const insets = useSafeAreaInsets();
  const openDrawer = useDrawerStore((s) => s.openDrawer);
  const { clubId, clubName } = useActiveClub();

  const [activeTab, setActiveTab] = useState<TabKey>('discover');

  // Queries
  const {
    data: discoverLessons = [],
    isLoading: isLoadingDiscover,
    isRefetching: isRefetchingDiscover,
    refetch: refetchDiscover,
  } = useDiscoverLessons(clubId || '');

  const {
    data: myRegistrations = [],
    isLoading: isLoadingMyLessons,
    isRefetching: isRefetchingMyLessons,
    refetch: refetchMyLessons,
  } = useMyLessons();

  // Selected lesson for detail / registration modal
  const [selectedLesson, setSelectedLesson] = useState<PlayerLessonDetail | null>(null);
  const [registeringLesson, setRegisteringLesson] = useState<PlayerLessonDetail | null>(null);
  const [registrationNotes, setRegistrationNotes] = useState('');

  // Register mutation
  const registerMutation = usePlayerRegisterLesson(
    registeringLesson?.id || '',
    clubId || undefined
  );

  // Cancel mutation
  const [cancellingLessonId, setCancellingLessonId] = useState<string | null>(null);
  const cancelMutation = usePlayerCancelLessonRegistration(
    cancellingLessonId || '',
    clubId || undefined
  );

  const handleOpenRegister = (lesson: PlayerLessonDetail) => {
    setRegisteringLesson(lesson);
    setRegistrationNotes('');
  };

  const handleConfirmRegister = async () => {
    if (!registeringLesson) return;
    try {
      await registerMutation.mutateAsync({
        notes: registrationNotes.trim() || undefined,
      });
      const registeredTitle = registeringLesson.title;
      setRegisteringLesson(null);
      setRegistrationNotes('');
      refetchDiscover();
      refetchMyLessons();
      Alert.alert(
        'Registration Confirmed!',
        `You have successfully registered for "${registeredTitle}". See you on the court!`
      );
    } catch (err: any) {
      Alert.alert(
        'Registration Failed',
        err.message || 'Unable to complete lesson registration. Please try again.'
      );
    }
  };

  const handleCancelRegistration = (lessonId: string, title: string) => {
    Alert.alert(
      'Cancel Registration',
      `Are you sure you want to cancel your registration for "${title}"?`,
      [
        { text: 'Keep Registration', style: 'cancel' },
        {
          text: 'Confirm Cancel',
          style: 'destructive',
          onPress: async () => {
            setCancellingLessonId(lessonId);
            try {
              await cancelMutation.mutateAsync();
              refetchDiscover();
              refetchMyLessons();
              Alert.alert('Registration Cancelled', `Your registration for "${title}" has been cancelled.`);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to cancel registration.');
            } finally {
              setCancellingLessonId(null);
            }
          },
        },
      ]
    );
  };

  // Find if player is registered for a lesson
  const getPlayerRegistration = (lessonId: string): LessonRegistration | undefined => {
    return myRegistrations.find(
      (r) => r.lesson_id === lessonId && r.status === 'registered'
    );
  };

  // Sort upcoming lessons
  const sortedLessons = useMemo(() => {
    return [...discoverLessons].sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );
  }, [discoverLessons]);

  // Sort registrations
  const sortedRegistrations = useMemo(() => {
    return [...myRegistrations].sort(
      (a, b) =>
        new Date(b.registered_at).getTime() - new Date(a.registered_at).getTime()
    );
  }, [myRegistrations]);

  return (
    <View style={styles.container}>
      {/* ─── Top Header ─── */}
      <View style={[styles.headerRow, { paddingTop: Math.max(insets.top, 14) + 6 }]}>
        <Pressable
          onPress={openDrawer}
          style={styles.menuButton}
          hitSlop={8}
          accessibilityLabel="Open menu"
          accessibilityRole="button"
        >
          <Menu size={24} color="#0F2922" strokeWidth={2.2} />
        </Pressable>
        <AppText style={styles.headerTitle}>Lessons</AppText>
      </View>

      <AppText style={styles.headerSubtitle}>
        Explore coaching sessions and improve your game
      </AppText>

      {/* ─── Segmented Control (Tabs) ─── */}
      <View style={styles.segmentedContainer}>
        <TouchableOpacity
          style={[
            styles.segmentButton,
            activeTab === 'discover' && styles.segmentButtonActive,
          ]}
          onPress={() => setActiveTab('discover')}
          activeOpacity={0.8}
        >
          <AppText
            style={[
              styles.segmentText,
              activeTab === 'discover' && styles.segmentTextActive,
            ]}
          >
            Discover Lessons
          </AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.segmentButton,
            activeTab === 'my_registrations' && styles.segmentButtonActive,
          ]}
          onPress={() => setActiveTab('my_registrations')}
          activeOpacity={0.8}
        >
          <AppText
            style={[
              styles.segmentText,
              activeTab === 'my_registrations' && styles.segmentTextActive,
            ]}
          >
            My Registrations
          </AppText>
        </TouchableOpacity>
      </View>

      {/* ─── TAB 1: Discover Lessons ─── */}
      {activeTab === 'discover' && (
        <FlatList
          data={sortedLessons}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetchingDiscover}
              onRefresh={refetchDiscover}
              colors={['#114D3F']}
              tintColor="#114D3F"
            />
          }
          ListEmptyComponent={
            isLoadingDiscover && !isRefetchingDiscover ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#114D3F" />
                <AppText style={styles.loadingText}>Loading coaching sessions...</AppText>
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconCircle}>
                  <Users size={32} color="#114D3F" strokeWidth={1.8} />
                </View>
                <AppText style={styles.emptyTitle}>No Lessons Available</AppText>
                <AppText style={styles.emptyDescription}>
                  There are no published coaching clinics scheduled right now at{' '}
                  {clubName || 'this club'}. Check back soon or pull to refresh.
                </AppText>
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => refetchDiscover()}
                  activeOpacity={0.85}
                >
                  <AppText style={styles.emptyButtonText}>Refresh</AppText>
                </TouchableOpacity>
              </View>
            )
          }
          renderItem={({ item, index }) => {
            const thumbnail = getLessonThumbnail(item.title, index);
            const myReg = getPlayerRegistration(item.id);
            const isRegistered = !!myReg;
            const availableSpots = item.available_spots ?? 0;
            const isFull = availableSpots <= 0 && !isRegistered;
            const scheduleText = formatLessonSchedule(
              item.start_at,
              item.duration_minutes
            );
            const courtName = item.court_name || `Court ${index + 1}`;
            const priceNum = Number(item.price);
            const priceText = isNaN(priceNum) || priceNum === 0 ? 'Free' : `₹${Math.round(priceNum)}`;

            return (
              <View style={styles.lessonCard}>
                {/* Main Card Section (clickable for details) */}
                <TouchableOpacity
                  style={styles.cardHeaderArea}
                  onPress={() => setSelectedLesson(item)}
                  activeOpacity={0.85}
                >
                  {/* Left: Thumbnail Image */}
                  <Image source={thumbnail} style={styles.thumbnail} />

                  {/* Right: Info */}
                  <View style={styles.cardRightCol}>
                    {/* Title & Price Row */}
                    <View style={styles.titlePriceRow}>
                      <AppText style={styles.cardTitle} numberOfLines={1}>
                        {item.title}
                      </AppText>
                      <AppText style={styles.cardPrice}>{priceText}</AppText>
                    </View>

                    {/* Badges Row */}
                    <View style={styles.badgesRow}>
                      <View style={styles.badgePill}>
                        <AppText style={styles.badgePillText}>
                          {item.is_private ? 'Private 1:1' : 'Group Clinic'}
                        </AppText>
                      </View>
                      {item.lesson_type_name ? (
                        <View style={styles.badgePill}>
                          <AppText style={styles.badgePillText}>
                            {item.lesson_type_name}
                          </AppText>
                        </View>
                      ) : null}
                    </View>

                    {/* Meta Rows (Date, Court, Spots) & Chevron */}
                    <View style={styles.metaWithChevronRow}>
                      <View style={styles.metaRowsContainer}>
                        {/* Date & Duration */}
                        <View style={styles.metaRow}>
                          <Calendar size={13} color="#647570" strokeWidth={1.8} />
                          <AppText style={styles.metaText} numberOfLines={1}>
                            {scheduleText}
                          </AppText>
                        </View>

                        {/* Court / Venue */}
                        <View style={styles.metaRow}>
                          <MapPin size={13} color="#647570" strokeWidth={1.8} />
                          <AppText style={styles.metaText}>{courtName}</AppText>
                        </View>

                        {/* Available Spots */}
                        <View style={styles.metaRow}>
                          <Users size={13} color="#647570" strokeWidth={1.8} />
                          <AppText
                            style={[
                              styles.metaText,
                              isFull && { color: '#DC2626', fontWeight: '700' },
                            ]}
                          >
                            {isFull
                              ? 'Session full'
                              : `${availableSpots} spot${availableSpots === 1 ? '' : 's'} open`}
                          </AppText>
                        </View>
                      </View>

                      {/* Right Chevron */}
                      <ChevronRight size={18} color="#718279" strokeWidth={1.8} />
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Bottom Full-Width Action Button */}
                {isRegistered ? (
                  <TouchableOpacity
                    style={styles.registeredButton}
                    onPress={() => handleCancelRegistration(item.id, item.title)}
                    activeOpacity={0.8}
                  >
                    <Check size={16} color="#166534" strokeWidth={2.2} />
                    <AppText style={styles.registeredButtonText}>
                      Registered (Cancel)
                    </AppText>
                  </TouchableOpacity>
                ) : isFull ? (
                  <View style={styles.disabledButton}>
                    <AppText style={styles.disabledButtonText}>Session Full</AppText>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.registerButton}
                    onPress={() => handleOpenRegister(item)}
                    activeOpacity={0.85}
                  >
                    <AppText style={styles.registerButtonText}>
                      Register for Lesson
                    </AppText>
                    <ArrowRight size={16} color="#FFFFFF" strokeWidth={2.2} />
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      )}

      {/* ─── TAB 2: My Registrations ─── */}
      {activeTab === 'my_registrations' && (
        <FlatList
          data={sortedRegistrations}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetchingMyLessons}
              onRefresh={refetchMyLessons}
              colors={['#114D3F']}
              tintColor="#114D3F"
            />
          }
          ListEmptyComponent={
            isLoadingMyLessons && !isRefetchingMyLessons ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#114D3F" />
                <AppText style={styles.loadingText}>Loading registrations...</AppText>
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconCircle}>
                  <Calendar size={32} color="#114D3F" strokeWidth={1.8} />
                </View>
                <AppText style={styles.emptyTitle}>No Lesson Registrations</AppText>
                <AppText style={styles.emptyDescription}>
                  You haven't enrolled in any coaching clinics yet. Discover available
                  lessons to improve your skills with certified club coaches!
                </AppText>
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => setActiveTab('discover')}
                  activeOpacity={0.85}
                >
                  <AppText style={styles.emptyButtonText}>Discover Lessons</AppText>
                </TouchableOpacity>
              </View>
            )
          }
          renderItem={({ item, index }) => {
            const thumbnail = getLessonThumbnail(item.lesson_title || '', index);
            const isRegistered = item.status === 'registered';
            const isAttended = item.status === 'attended';
            const isCancelled = item.status === 'cancelled';

            const statusLabel =
              item.status === 'registered'
                ? 'Registered'
                : item.status === 'attended'
                ? 'Attended'
                : item.status === 'cancelled'
                ? 'Cancelled'
                : item.status;

            const statusColors = isRegistered
              ? { bg: '#E8F5E9', text: '#166534', dot: '#16A34A' }
              : isAttended
              ? { bg: '#EFF6FF', text: '#1D4ED8', dot: '#2563EB' }
              : { bg: '#FEE2E2', text: '#DC2626', dot: '#DC2626' };

            const scheduleText = item.lesson_start_at
              ? formatLessonSchedule(item.lesson_start_at)
              : 'Upcoming Clinic';

            return (
              <View style={styles.lessonCard}>
                <View style={styles.cardHeaderArea}>
                  {/* Left: Thumbnail Image */}
                  <Image source={thumbnail} style={styles.thumbnail} />

                  {/* Right: Info */}
                  <View style={styles.cardRightCol}>
                    {/* Title & Status Row */}
                    <View style={styles.titlePriceRow}>
                      <AppText style={styles.cardTitle} numberOfLines={1}>
                        {item.lesson_title || 'Pickleball Lesson'}
                      </AppText>
                      <View
                        style={[
                          styles.statusBadgeCapsule,
                          { backgroundColor: statusColors.bg },
                        ]}
                      >
                        <View
                          style={[
                            styles.statusDotSmall,
                            { backgroundColor: statusColors.dot },
                          ]}
                        />
                        <AppText
                          style={[
                            styles.statusBadgeCapsuleText,
                            { color: statusColors.text },
                          ]}
                        >
                          {statusLabel}
                        </AppText>
                      </View>
                    </View>

                    {/* Meta Rows */}
                    <View style={styles.metaRowsContainer}>
                      {/* Session schedule */}
                      <View style={styles.metaRow}>
                        <Calendar size={13} color="#647570" strokeWidth={1.8} />
                        <AppText style={styles.metaText} numberOfLines={1}>
                          {scheduleText}
                        </AppText>
                      </View>

                      {/* Registered Date */}
                      <View style={styles.metaRow}>
                        <Clock size={13} color="#647570" strokeWidth={1.8} />
                        <AppText style={styles.metaText}>
                          Booked on {formatSimpleDate(item.registered_at)}
                        </AppText>
                      </View>

                      {item.notes ? (
                        <View style={styles.metaRow}>
                          <Info size={13} color="#647570" strokeWidth={1.8} />
                          <AppText style={styles.metaText} numberOfLines={1}>
                            "{item.notes}"
                          </AppText>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>

                {/* Cancel Action if active */}
                {isRegistered && (
                  <TouchableOpacity
                    style={styles.cancelRegButton}
                    onPress={() =>
                      handleCancelRegistration(
                        item.lesson_id,
                        item.lesson_title || 'Lesson'
                      )
                    }
                    activeOpacity={0.8}
                  >
                    <X size={15} color="#DC2626" strokeWidth={2} />
                    <AppText style={styles.cancelRegButtonText}>
                      Cancel Registration
                    </AppText>
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      )}

      {/* ─── Registration Modal Sheet ─── */}
      <ModalSheet
        visible={!!registeringLesson}
        onClose={() => setRegisteringLesson(null)}
        title="Register for Lesson"
        subtitle={registeringLesson?.title}
      >
        {registeringLesson && (
          <View style={styles.modalBody}>
            <View style={styles.modalInfoRow}>
              <AppText style={styles.modalInfoLabel}>Lesson</AppText>
              <AppText style={styles.modalInfoValue}>
                {registeringLesson.title}
              </AppText>
            </View>

            <View style={styles.modalInfoRow}>
              <AppText style={styles.modalInfoLabel}>Fee</AppText>
              <AppText style={[styles.modalInfoValue, { color: '#114D3F', fontWeight: '800' }]}>
                {Number(registeringLesson.price) === 0
                  ? 'Free'
                  : `₹${parseFloat(String(registeringLesson.price)).toFixed(2)}`}
              </AppText>
            </View>

            <View style={styles.modalInfoRow}>
              <AppText style={styles.modalInfoLabel}>Coach</AppText>
              <AppText style={styles.modalInfoValue}>
                {registeringLesson.coach_name || 'Club Certified Pro'}
              </AppText>
            </View>

            <View style={styles.modalInfoRow}>
              <AppText style={styles.modalInfoLabel}>Schedule</AppText>
              <AppText style={styles.modalInfoValue}>
                {formatLessonSchedule(
                  registeringLesson.start_at,
                  registeringLesson.duration_minutes
                )}
              </AppText>
            </View>

            <View style={styles.modalInfoRow}>
              <AppText style={styles.modalInfoLabel}>Court / Venue</AppText>
              <AppText style={styles.modalInfoValue}>
                {registeringLesson.court_name || 'Club Courts'}
              </AppText>
            </View>

            {/* Notes input */}
            <View style={styles.notesContainer}>
              <AppText style={styles.notesLabel}>Notes for Coach (Optional)</AppText>
              <TextInput
                style={styles.notesInput}
                placeholder="e.g. Focus on third shot drop, rating 3.5, backhand reset..."
                placeholderTextColor="#9CA3AF"
                value={registrationNotes}
                onChangeText={setRegistrationNotes}
                multiline
                numberOfLines={2}
              />
            </View>

            {/* Action buttons */}
            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setRegisteringLesson(null)}
                disabled={registerMutation.isPending}
                activeOpacity={0.8}
              >
                <AppText style={styles.modalCancelBtnText}>Cancel</AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleConfirmRegister}
                disabled={registerMutation.isPending}
                activeOpacity={0.85}
              >
                {registerMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <AppText style={styles.modalConfirmBtnText}>Confirm Registration</AppText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ModalSheet>

      {/* ─── Lesson Details Modal Sheet ─── */}
      <ModalSheet
        visible={!!selectedLesson}
        onClose={() => setSelectedLesson(null)}
        title={selectedLesson?.title || 'Lesson Details'}
        subtitle={
          selectedLesson
            ? formatLessonSchedule(
                selectedLesson.start_at,
                selectedLesson.duration_minutes
              )
            : undefined
        }
      >
        {selectedLesson && (
          <View style={styles.modalBody}>
            <View style={styles.modalInfoRow}>
              <AppText style={styles.modalInfoLabel}>Format</AppText>
              <AppText style={styles.modalInfoValue}>
                {selectedLesson.is_private ? 'Private 1-on-1' : 'Group Clinic'}
              </AppText>
            </View>

            <View style={styles.modalInfoRow}>
              <AppText style={styles.modalInfoLabel}>Skill Level</AppText>
              <AppText style={styles.modalInfoValue}>
                {selectedLesson.lesson_type_name || 'All Levels'}
              </AppText>
            </View>

            <View style={styles.modalInfoRow}>
              <AppText style={styles.modalInfoLabel}>Coach</AppText>
              <AppText style={styles.modalInfoValue}>
                {selectedLesson.coach_name || 'Club Certified Coach'}
              </AppText>
            </View>

            <View style={styles.modalInfoRow}>
              <AppText style={styles.modalInfoLabel}>Court</AppText>
              <AppText style={styles.modalInfoValue}>
                {selectedLesson.court_name || 'Court 1'}
              </AppText>
            </View>

            <View style={styles.modalInfoRow}>
              <AppText style={styles.modalInfoLabel}>Price</AppText>
              <AppText style={[styles.modalInfoValue, { color: '#114D3F', fontWeight: '800' }]}>
                {Number(selectedLesson.price) === 0
                  ? 'Free'
                  : `₹${parseFloat(String(selectedLesson.price)).toFixed(2)}`}
              </AppText>
            </View>

            <View style={styles.modalInfoRow}>
              <AppText style={styles.modalInfoLabel}>Available Spots</AppText>
              <AppText style={styles.modalInfoValue}>
                {selectedLesson.available_spots != null
                  ? `${selectedLesson.available_spots} remaining`
                  : 'Available'}
              </AppText>
            </View>

            {selectedLesson.description ? (
              <View style={styles.detailDescBox}>
                <AppText style={styles.detailDescTitle}>About Session</AppText>
                <AppText style={styles.detailDescText}>
                  {selectedLesson.description}
                </AppText>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => {
                const lessonToRegister = selectedLesson;
                setSelectedLesson(null);
                handleOpenRegister(lessonToRegister);
              }}
              activeOpacity={0.85}
            >
              <AppText style={styles.modalCloseButtonText}>
                Register for Lesson →
              </AppText>
            </TouchableOpacity>
          </View>
        )}
      </ModalSheet>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  menuButton: {
    padding: 6,
    marginRight: 6,
    marginLeft: -6,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F2922',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#647570',
    paddingHorizontal: 16,
    marginTop: 2,
    marginBottom: 14,
    lineHeight: 19,
  },

  // ─── Segmented Tabs ────────────────────────────────────────────────────────
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E8EDEA',
    padding: 4,
    marginHorizontal: 16,
    marginBottom: 14,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    backgroundColor: 'transparent',
  },
  segmentButtonActive: {
    backgroundColor: '#114D3F',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0F2922',
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // ─── List Content ──────────────────────────────────────────────────────────
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 110, // Generous padding to clear AppBottomNav
  },

  // ─── Lesson Card ───────────────────────────────────────────────────────────
  lessonCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8EDEA',
    padding: 14,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderArea: {
    flexDirection: 'row',
  },
  thumbnail: {
    width: 96,
    height: 96,
    borderRadius: 12,
    resizeMode: 'cover',
  },
  cardRightCol: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'space-between',
  },
  titlePriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F2922',
    flex: 1,
    marginRight: 6,
    lineHeight: 20,
  },
  cardPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#114D3F',
    letterSpacing: -0.3,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  badgePill: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgePillText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '600',
  },
  metaWithChevronRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  metaRowsContainer: {
    gap: 3,
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 12,
    color: '#647570',
    lineHeight: 16,
  },

  // ─── Action Buttons ────────────────────────────────────────────────────────
  registerButton: {
    backgroundColor: '#114D3F',
    borderRadius: 12,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 6,
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  registeredButton: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#C6F6D5',
  },
  registeredButtonText: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '700',
  },
  disabledButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  disabledButtonText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelRegButton: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 6,
  },
  cancelRegButtonText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
  },

  // ─── Status Capsules in Registrations ──────────────────────────────────────
  statusBadgeCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    gap: 4,
  },
  statusDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeCapsuleText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ─── Empty & Loading States ────────────────────────────────────────────────
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#647570',
    fontWeight: '500',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8EDEA',
    padding: 24,
    alignItems: 'center',
    marginTop: 12,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F2922',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 14,
    color: '#718279',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyButton: {
    backgroundColor: '#114D3F',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },

  // ─── Modal Styles ──────────────────────────────────────────────────────────
  modalBody: {
    gap: 12,
    paddingBottom: 16,
  },
  modalInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  modalInfoLabel: {
    fontSize: 14,
    color: '#718279',
  },
  modalInfoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F2922',
    textAlign: 'right',
  },
  notesContainer: {
    marginTop: 6,
    gap: 6,
  },
  notesLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F2922',
  },
  notesInput: {
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#E8EDEA',
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    color: '#0F2922',
    minHeight: 64,
    textAlignVertical: 'top',
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F0F4F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#647570',
  },
  modalConfirmBtn: {
    flex: 2,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#114D3F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  detailDescBox: {
    backgroundColor: '#F8FAF9',
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    gap: 4,
  },
  detailDescTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F2922',
  },
  detailDescText: {
    fontSize: 13,
    color: '#647570',
    lineHeight: 18,
  },
  modalCloseButton: {
    backgroundColor: '#114D3F',
    borderRadius: 12,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  modalCloseButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
