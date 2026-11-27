/**
 * Aught2 Pickleball — Player Bookings & Registrations Screen
 *
 * Implements the comprehensive Player Side "My Bookings" UI:
 *   - Unified experience for all 5 activity types:
 *       1. Court bookings
 *       2. Tournament registrations
 *       3. League registrations
 *       4. Event registrations
 *       5. Lesson bookings
 *   - Status filter pills: Upcoming | Past | Cancelled
 *   - Activity category pills: All | Courts | Tournaments | Leagues | Events | Lessons
 *   - Real-time synchronization and auto-refresh on focus
 *   - Tapping court booking opens BookingDetailsModal for full details & cancellation
 *   - Tapping tournament/league/event/lesson navigates directly to activity details
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Calendar,
  Clock,
  Filter,
  MapPin,
  ChevronRight,
  LayoutGrid,
  Trophy,
  Award,
  GraduationCap,
  Sparkles,
  X,
} from 'lucide-react-native';

import { AppHeader, AppText, BookingDetailsModal } from '@/components';
import { RegistrationDetailsModal } from '@/components/tournament-registration';
import { LeagueRegistrationDetailsModal } from '@/components/league-registration';
import { useActiveClub, useClubBranding, usePlayerAllBookings, usePlayerBookings } from '@/hooks';
import { Colors } from '@/theme';
import { formatCurrency, resolveMediaUrl } from '@/utils';
import type { Booking, PlayerBookingActivityType, PlayerBookingItem } from '@/types';

type FilterTab = 'upcoming' | 'past' | 'cancelled';
type ActivityCategory = 'all' | PlayerBookingActivityType;

const ACTIVITY_CATEGORIES: { key: ActivityCategory; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'court', label: 'Courts' },
  { key: 'tournament', label: 'Tournaments' },
  { key: 'league', label: 'Leagues' },
  { key: 'event', label: 'Events' },
  { key: 'lesson', label: 'Lessons' },
];

export default function PlayerBookingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    tab: paramTab,
    activity: paramActivity,
    detailId: paramDetailId,
    detailType: paramDetailType,
  } = useLocalSearchParams<{
    tab?: string;
    activity?: string;
    detailId?: string;
    detailType?: string;
  }>();
  const { clubId: selectedClubId } = useActiveClub();
  const { data: clubBranding } = useClubBranding(selectedClubId ?? '');

  const resolveValidTab = (v?: string): FilterTab =>
    v === 'past' || v === 'cancelled' || v === 'upcoming' ? v : 'upcoming';
  const resolveValidActivity = (v?: string): ActivityCategory =>
    ACTIVITY_CATEGORIES.some((c) => c.key === v) ? (v as ActivityCategory) : 'all';

  const [activeTab, setActiveTab] = useState<FilterTab>(() => resolveValidTab(paramTab));
  const [selectedActivity, setSelectedActivity] = useState<ActivityCategory>(() =>
    resolveValidActivity(paramActivity)
  );
  const [isFilterSheetVisible, setIsFilterSheetVisible] = useState(false);
  const [draftActivity, setDraftActivity] = useState<ActivityCategory>('all');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [courtImageErrors, setCourtImageErrors] = useState<Record<string, boolean>>({});

  // Unified personal records across court bookings, tournaments, leagues, events, lessons
  const {
    bookings,
    isLoading: isLoadingBookings,
    isRefetching: isRefetchingBookings,
    isError,
    error,
    refetchBookings,
  } = usePlayerAllBookings({
    clubId: selectedClubId ?? undefined,
    status: activeTab,
    activityType: selectedActivity !== 'all' ? selectedActivity : undefined,
  });

  // Keep player court bookings hook for modal cancellation handler
  const { refetch: refetchCourtBookings } = usePlayerBookings({
    clubId: selectedClubId ?? undefined,
  });

  // Re-fetch bookings whenever player navigates to this screen
  useFocusEffect(
    useCallback(() => {
      refetchBookings();
    }, [refetchBookings])
  );

  const now = Date.now();

  // ─── Filter & Categorize Bookings ──────────────────────────────────────────
  const filteredBookings = useMemo(() => {
    return (bookings || []).filter((item) => {
      if (selectedActivity !== 'all' && item.activity_type !== selectedActivity) {
        return false;
      }
      return true;
    });
  }, [bookings, selectedActivity]);

  const upcomingBookings = useMemo(() => {
    return filteredBookings
      .filter((b) => {
        const isCancelled = ['cancelled', 'canceled', 'rejected', 'withdrawn'].includes(
          b.status?.toLowerCase()
        );
        const endTime = b.end_at ? new Date(b.end_at).getTime() : new Date(b.start_at).getTime();
        return !isCancelled && endTime >= now;
      })
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [filteredBookings, now]);

  const pastBookings = useMemo(() => {
    return filteredBookings
      .filter((b) => {
        const isCancelled = ['cancelled', 'canceled', 'rejected', 'withdrawn'].includes(
          b.status?.toLowerCase()
        );
        const endTime = b.end_at ? new Date(b.end_at).getTime() : new Date(b.start_at).getTime();
        return !isCancelled && endTime < now;
      })
      .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime());
  }, [filteredBookings, now]);

  const cancelledBookings = useMemo(() => {
    return filteredBookings
      .filter((b) =>
        ['cancelled', 'canceled', 'rejected', 'withdrawn'].includes(b.status?.toLowerCase())
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [filteredBookings]);

  // ─── Date & Time Formatting Helpers ────────────────────────────────────────
  const parseDateBox = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const weekday = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
      const day = d.getDate().toString();
      const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      const year = d.getFullYear().toString();
      return { weekday, day, monthYear: `${month} ${year}` };
    } catch {
      return { weekday: 'DAY', day: '00', monthYear: 'DATE' };
    }
  };

  const formatPastDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
      const day = d.getDate();
      const month = d.toLocaleDateString('en-US', { month: 'short' });
      const year = d.getFullYear();
      return `${weekday}, ${day} ${month} ${year}`;
    } catch {
      return isoString;
    }
  };

  const formatTimeRange = (startIso: string, endIso?: string | null) => {
    try {
      const s = new Date(startIso);
      const startStr = s.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      if (!endIso) return startStr;
      const e = new Date(endIso);
      const endStr = e.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      return `${startStr} – ${endStr}`;
    } catch {
      return '';
    }
  };

  // ─── Navigation & Action Handling ──────────────────────────────────────────
  const buildCourtBooking = (item: PlayerBookingItem): Booking => ({
    id: item.record_id,
    court_id: item.activity_id || item.record_id,
    player_id: '',
    created_by_user_id: '',
    duration_minutes: 60,
    cancelled_at: null,
    cancelled_by_user_id: null,
    cancellation_reason: null,
    club_id: item.club_id,
    club_name: item.club_name,
    court: {
      id: item.activity_id || item.record_id,
      club_id: item.club_id,
      name: item.title.replace(' Reservation', ''),
      surface_type: (item.details?.court_type as any) || 'hard',
      court_type: (item.details?.court_type as any) || 'indoor',
      is_active: true,
      photo_url: item.image_url || null,
    } as any,
    start_at: item.start_at,
    end_at: item.end_at || item.start_at,
    status: (item.status as any) || 'confirmed',
    booking_type: (item.details?.booking_type as any) || 'casual',
    total_price: item.price,
    notes: item.details?.notes || null,
    created_at: item.created_at,
    updated_at: item.created_at,
  });

  // Restore detail modal after reload when detailId + detailType exist in URL
  useEffect(() => {
    if (!paramDetailId || !paramDetailType || bookings.length === 0) return;
    if (paramDetailType === 'court') {
      const match = bookings.find(
        (b) => b.activity_type === 'court' && b.record_id === paramDetailId
      );
      if (match) {
        setSelectedBooking(buildCourtBooking(match));
        setDetailsModalVisible(true);
      }
    } else if (paramDetailType === 'tournament') {
      setSelectedTournamentId(paramDetailId);
    } else if (paramDetailType === 'league') {
      setSelectedLeagueId(paramDetailId);
    }
  }, [paramDetailId, paramDetailType, bookings]);

  const handleItemPress = (item: PlayerBookingItem) => {
    if (item.activity_type === 'court') {
      setSelectedBooking(buildCourtBooking(item));
      setDetailsModalVisible(true);
      router.setParams({ detailId: item.record_id, detailType: 'court' } as any);
    } else if (item.activity_type === 'tournament' && item.activity_id) {
      setSelectedTournamentId(item.activity_id);
      router.setParams({ detailId: item.activity_id, detailType: 'tournament' } as any);
    } else if (item.activity_type === 'league' && item.activity_id) {
      setSelectedLeagueId(item.activity_id);
      router.setParams({ detailId: item.activity_id, detailType: 'league' } as any);
    } else if (item.activity_type === 'event') {
      (router.push as any)(
        item.activity_id
          ? { pathname: '/player/events', params: { id: item.activity_id, clubId: item.club_id } }
          : '/player/events'
      );
    } else if (item.activity_type === 'lesson') {
      (router.push as any)(
        item.activity_id
          ? { pathname: '/player/lessons', params: { id: item.activity_id, clubId: item.club_id } }
          : '/player/lessons'
      );
    }
  };

  // ─── Render Activity Badge ─────────────────────────────────────────────────
  const renderActivityBadge = (type: PlayerBookingActivityType) => {
    switch (type) {
      case 'court':
        return (
          <View style={[styles.typeBadge, styles.typeBadgeCourt]}>
            <LayoutGrid size={11} color="#065F46" />
            <AppText style={[styles.typeBadgeText, styles.typeBadgeTextCourt]}>Court</AppText>
          </View>
        );
      case 'tournament':
        return (
          <View style={[styles.typeBadge, styles.typeBadgeTournament]}>
            <Trophy size={11} color="#6B21A8" />
            <AppText style={[styles.typeBadgeText, styles.typeBadgeTextTournament]}>Tournament</AppText>
          </View>
        );
      case 'league':
        return (
          <View style={[styles.typeBadge, styles.typeBadgeLeague]}>
            <Award size={11} color="#1E40AF" />
            <AppText style={[styles.typeBadgeText, styles.typeBadgeTextLeague]}>League</AppText>
          </View>
        );
      case 'event':
        return (
          <View style={[styles.typeBadge, styles.typeBadgeEvent]}>
            <Sparkles size={11} color="#92400E" />
            <AppText style={[styles.typeBadgeText, styles.typeBadgeTextEvent]}>Event</AppText>
          </View>
        );
      case 'lesson':
        return (
          <View style={[styles.typeBadge, styles.typeBadgeLesson]}>
            <GraduationCap size={11} color="#166534" />
            <AppText style={[styles.typeBadgeText, styles.typeBadgeTextLesson]}>Lesson</AppText>
          </View>
        );
      default:
        return null;
    }
  };

  // ─── Render Cards ──────────────────────────────────────────────────────────
  const renderUpcomingCard = (item: PlayerBookingItem) => {
    const { weekday, day, monthYear } = parseDateBox(item.start_at);
    const timeRange = formatTimeRange(item.start_at, item.end_at);
    const venueText = item.location ? `${item.location} • ${item.club_name}` : item.club_name;

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.upcomingCard}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.88}
      >
        {/* Left Date Panel */}
        <View style={styles.dateBox}>
          <AppText style={styles.dateBoxWeekday}>{weekday}</AppText>
          <AppText style={styles.dateBoxDay}>{day}</AppText>
          <AppText style={styles.dateBoxMonthYear}>{monthYear}</AppText>
        </View>

        {/* Right Details */}
        <View style={styles.cardDetails}>
          <View style={styles.cardHeaderRow}>
            {renderActivityBadge(item.activity_type)}
            <View style={styles.confirmedBadge}>
              <AppText style={styles.confirmedBadgeText}>{item.status_label}</AppText>
            </View>
          </View>

          <AppText style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </AppText>

          <View style={styles.cardMetaRow}>
            <Clock size={13} color="#718279" strokeWidth={2} />
            <AppText style={styles.cardMetaText}>{timeRange}</AppText>
          </View>

          <View style={styles.cardMetaRow}>
            <MapPin size={13} color="#718279" strokeWidth={2} />
            <AppText style={styles.cardMetaText} numberOfLines={1}>
              {venueText}
            </AppText>
          </View>

          <View style={styles.badgeRow}>
            <View style={styles.playerPriceBadge}>
              <AppText style={styles.playerPriceBadgeText}>
                {item.price > 0 ? formatCurrency(item.price) : 'Free'}
              </AppText>
            </View>
          </View>
        </View>

        {/* Chevron */}
        <View style={styles.chevronWrapper}>
          <ChevronRight size={18} color="#94A3B8" strokeWidth={2} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderPastCard = (item: PlayerBookingItem) => {
    const dateFormatted = formatPastDate(item.start_at);
    const timeRange = formatTimeRange(item.start_at, item.end_at);
    const venueText = item.location ? `${item.location} • ${item.club_name}` : item.club_name;

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.pastCard}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.88}
      >
        {/* Left Thumbnail or Icon */}
        {item.image_url && !courtImageErrors[item.id] ? (
          <Image
            source={{ uri: resolveMediaUrl(item.image_url) }}
            style={styles.courtThumbnail}
            onError={() => {
              setCourtImageErrors((prev) => ({ ...prev, [item.id]: true }));
            }}
          />
        ) : (
          <View style={styles.courtThumbnailFallback}>
            {item.activity_type === 'tournament' ? (
              <Trophy size={22} color="#6B21A8" strokeWidth={1.8} />
            ) : item.activity_type === 'league' ? (
              <Award size={22} color="#1E40AF" strokeWidth={1.8} />
            ) : item.activity_type === 'lesson' ? (
              <GraduationCap size={22} color="#166534" strokeWidth={1.8} />
            ) : item.activity_type === 'event' ? (
              <Sparkles size={22} color="#92400E" strokeWidth={1.8} />
            ) : (
              <LayoutGrid size={22} color="#18794E" strokeWidth={1.8} />
            )}
          </View>
        )}

        {/* Details */}
        <View style={styles.pastCardDetails}>
          <View style={styles.pastTitleRow}>
            <View style={styles.pastTitleBlock}>
              {renderActivityBadge(item.activity_type)}
              <AppText style={[styles.cardTitle, { marginTop: 4 }]} numberOfLines={1}>
                {item.title}
              </AppText>
            </View>
            <View style={styles.pastBadgesGroup}>
              <View style={styles.playerPriceBadge}>
                <AppText style={styles.playerPriceBadgeText}>
                  {item.price > 0 ? formatCurrency(item.price) : 'Free'}
                </AppText>
              </View>
              <View style={styles.completedBadge}>
                <AppText style={styles.completedBadgeText}>Completed</AppText>
              </View>
            </View>
          </View>

          <View style={styles.cardMetaRow}>
            <Calendar size={13} color="#718279" strokeWidth={2} />
            <AppText style={styles.cardMetaText}>{dateFormatted}</AppText>
          </View>

          <View style={styles.cardMetaRow}>
            <Clock size={13} color="#718279" strokeWidth={2} />
            <AppText style={styles.cardMetaText}>{timeRange}</AppText>
          </View>

          <View style={styles.cardMetaRow}>
            <MapPin size={13} color="#718279" strokeWidth={2} />
            <AppText style={styles.cardMetaText} numberOfLines={1}>
              {venueText}
            </AppText>
          </View>
        </View>

        <View style={styles.chevronWrapper}>
          <ChevronRight size={18} color="#94A3B8" strokeWidth={2} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderCancelledCard = (item: PlayerBookingItem) => {
    const dateFormatted = formatPastDate(item.start_at);
    const timeRange = formatTimeRange(item.start_at, item.end_at);
    const venueText = item.location ? `${item.location} • ${item.club_name}` : item.club_name;

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.pastCard}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.88}
      >
        <View style={styles.courtThumbnailFallback}>
          {item.activity_type === 'tournament' ? (
            <Trophy size={22} color="#94A3B8" strokeWidth={1.8} />
          ) : item.activity_type === 'league' ? (
            <Award size={22} color="#94A3B8" strokeWidth={1.8} />
          ) : (
            <LayoutGrid size={22} color="#94A3B8" strokeWidth={1.8} />
          )}
        </View>

        <View style={styles.pastCardDetails}>
          <View style={styles.pastTitleRow}>
            <View style={styles.pastTitleBlock}>
              {renderActivityBadge(item.activity_type)}
              <AppText style={[styles.cardTitle, { marginTop: 4 }]} numberOfLines={1}>
                {item.title}
              </AppText>
            </View>
            <View style={styles.pastBadgesGroup}>
              <View style={styles.cancelledBadge}>
                <AppText style={styles.cancelledBadgeText}>Cancelled</AppText>
              </View>
            </View>
          </View>

          <View style={styles.cardMetaRow}>
            <Calendar size={13} color="#718279" strokeWidth={2} />
            <AppText style={styles.cardMetaText}>{dateFormatted}</AppText>
          </View>

          <View style={styles.cardMetaRow}>
            <Clock size={13} color="#718279" strokeWidth={2} />
            <AppText style={styles.cardMetaText}>{timeRange}</AppText>
          </View>

          <View style={styles.cardMetaRow}>
            <MapPin size={13} color="#718279" strokeWidth={2} />
            <AppText style={styles.cardMetaText} numberOfLines={1}>
              {venueText}
            </AppText>
          </View>
        </View>

        <View style={styles.chevronWrapper}>
          <ChevronRight size={18} color="#94A3B8" strokeWidth={2} />
        </View>
      </TouchableOpacity>
    );
  };

  const selectedCategoryLabel =
    ACTIVITY_CATEGORIES.find((cat) => cat.key === selectedActivity)?.label || 'All';
  const hasActiveCategoryFilter = selectedActivity !== 'all';

  const handleOpenFilters = () => {
    setDraftActivity(selectedActivity);
    setIsFilterSheetVisible(true);
  };

  const handleApplyFilter = () => {
    setSelectedActivity(draftActivity);
    setIsFilterSheetVisible(false);
    router.setParams({ activity: draftActivity } as any);
  };

  const handleClearFilter = () => {
    setDraftActivity('all');
    setSelectedActivity('all');
    setIsFilterSheetVisible(false);
    router.setParams({ activity: 'all' } as any);
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* ─── Top Header ─── */}
      <AppHeader title="My Bookings" showMenu borderless />

      {/* ─── Shared Page Content ScrollView ─── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetchingBookings}
            onRefresh={() => {
              setCourtImageErrors({});
              refetchBookings();
              refetchCourtBookings();
            }}
            colors={[Colors.brand.primary]}
            tintColor={Colors.brand.primary}
          />
        }
      >
        <View style={styles.pageContainer}>
          {/* ─── Status Segmented Control ─── */}
          <View style={styles.segmentedTrack} accessibilityRole="tablist">
            {(['upcoming', 'past', 'cancelled'] as const).map((tab) => {
              const isActive = activeTab === tab;
              const label =
                tab === 'upcoming'
                  ? 'Upcoming'
                  : tab === 'past'
                    ? 'Past'
                    : 'Cancelled';

              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => {
                    setActiveTab(tab);
                    router.setParams({ tab } as any);
                  }}
                  style={[styles.segmentButton, isActive && styles.segmentButtonActive]}
                  activeOpacity={0.85}
                  accessibilityRole="tab"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: isActive }}
                >
                  <AppText
                    numberOfLines={1}
                    style={[styles.segmentText, isActive && styles.segmentTextActive]}
                  >
                    {label}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ─── Category Filter Control ─── */}
          <View style={styles.filtersBar}>
            <View style={styles.filtersLeftGroup}>
              <TouchableOpacity
                style={styles.filtersPillBtn}
                onPress={handleOpenFilters}
                activeOpacity={0.8}
                accessibilityLabel="Filter bookings by category"
                accessibilityRole="button"
              >
                <Filter size={15} color="#0D5C46" strokeWidth={2} />
                <AppText style={styles.filtersPillText}>Filters</AppText>
                {hasActiveCategoryFilter && (
                  <View style={styles.filtersCountBadge}>
                    <AppText style={styles.filtersCountText}>1</AppText>
                  </View>
                )}
              </TouchableOpacity>

              <AppText style={styles.appliedFilterText} numberOfLines={1}>
                {hasActiveCategoryFilter ? `Category: ${selectedCategoryLabel}` : 'Showing: All'}
              </AppText>
            </View>

            {hasActiveCategoryFilter && (
              <TouchableOpacity
                onPress={handleClearFilter}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.7}
                accessibilityLabel="Clear category filter"
                accessibilityRole="button"
              >
                <AppText style={styles.clearFilterText}>Clear</AppText>
              </TouchableOpacity>
            )}
          </View>

          {/* Loading State */}
          {isLoadingBookings ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#114D3F" />
            <AppText style={styles.loadingText}>Loading your bookings & registrations...</AppText>
          </View>
        ) : isError ? (
          /* Error State */
          <View style={styles.errorContainer}>
            <AppText style={styles.errorText}>
              {error?.message ||
                'Unable to load your bookings. Please check your connection and try again.'}
            </AppText>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => refetchBookings()}
            >
              <AppText style={styles.retryButtonText}>Retry</AppText>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ════════════ TAB: UPCOMING ════════════ */}
            {activeTab === 'upcoming' && (
              <>
                <View style={styles.sectionHeaderRow}>
                  <AppText style={styles.sectionTitle}>Upcoming Bookings & Events</AppText>
                  {upcomingBookings.length > 0 && (
                    <AppText style={styles.sectionCount}>
                      {upcomingBookings.length}{' '}
                      {upcomingBookings.length === 1 ? 'Record' : 'Records'}
                    </AppText>
                  )}
                </View>

                {upcomingBookings.length > 0 ? (
                  upcomingBookings.map((b) => renderUpcomingCard(b))
                ) : (
                  <View style={styles.emptyCard}>
                    <View style={styles.emptyIconContainer}>
                      <Calendar size={22} color="#176B57" strokeWidth={2.2} />
                    </View>
                    <View style={styles.emptyTextContainer}>
                      <AppText style={styles.emptyTitle}>No upcoming bookings yet</AppText>
                      <AppText style={styles.emptySubtitle}>
                        Your court bookings, tournament registrations, and league entries will appear here.
                      </AppText>
                    </View>
                  </View>
                )}

                {/* Secondary: Show past records if they exist in upcoming tab */}
                {pastBookings.length > 0 && (
                  <>
                    <View style={[styles.sectionHeaderRow, { marginTop: 28 }]}>
                      <AppText style={styles.sectionTitle}>Past Records</AppText>
                      <AppText style={styles.sectionCount}>
                        {pastBookings.length} {pastBookings.length === 1 ? 'Record' : 'Records'}
                      </AppText>
                    </View>
                    {pastBookings.map((b) => renderPastCard(b))}
                  </>
                )}
              </>
            )}

            {/* ════════════ TAB: PAST ════════════ */}
            {activeTab === 'past' && (
              <>
                <View style={styles.sectionHeaderRow}>
                  <AppText style={styles.sectionTitle}>Completed Activities</AppText>
                  {pastBookings.length > 0 && (
                    <AppText style={styles.sectionCount}>
                      {pastBookings.length} {pastBookings.length === 1 ? 'Record' : 'Records'}
                    </AppText>
                  )}
                </View>

                {pastBookings.length > 0 ? (
                  pastBookings.map((b) => renderPastCard(b))
                ) : (
                  <View style={styles.emptyCard}>
                    <View style={styles.emptyIconContainer}>
                      <Calendar size={22} color="#176B57" strokeWidth={2.2} />
                    </View>
                    <View style={styles.emptyTextContainer}>
                      <AppText style={styles.emptyTitle}>No completed bookings</AppText>
                      <AppText style={styles.emptySubtitle}>
                        Past court sessions and completed competitions will appear here.
                      </AppText>
                    </View>
                  </View>
                )}
              </>
            )}

            {/* ════════════ TAB: CANCELLED ════════════ */}
            {activeTab === 'cancelled' && (
              <>
                <View style={styles.sectionHeaderRow}>
                  <AppText style={styles.sectionTitle}>Cancelled Bookings</AppText>
                  {cancelledBookings.length > 0 && (
                    <AppText style={styles.sectionCount}>
                      {cancelledBookings.length}{' '}
                      {cancelledBookings.length === 1 ? 'Record' : 'Records'}
                    </AppText>
                  )}
                </View>

                {cancelledBookings.length > 0 ? (
                  cancelledBookings.map((b) => renderCancelledCard(b))
                ) : (
                  <View style={styles.emptyCard}>
                    <View style={styles.emptyIconContainer}>
                      <Calendar size={22} color="#176B57" strokeWidth={2.2} />
                    </View>
                    <View style={styles.emptyTextContainer}>
                      <AppText style={styles.emptyTitle}>No cancelled bookings</AppText>
                      <AppText style={styles.emptySubtitle}>
                        Cancelled reservations or registrations will appear here.
                      </AppText>
                    </View>
                  </View>
                )}
              </>
            )}
          </>
        )}
        </View>
      </ScrollView>

      {/* ─── Booking Details Modal (for court reservations) ─── */}
      <BookingDetailsModal
        visible={detailsModalVisible}
        onClose={() => {
          setDetailsModalVisible(false);
          setSelectedBooking(null);
          router.setParams({ detailId: undefined, detailType: undefined } as any);
        }}
        booking={selectedBooking}
        mode="player"
        clubId={selectedBooking?.club_id || selectedClubId || ''}
      />

      {/* ─── Tournament Registration Details Modal ─── */}
      <RegistrationDetailsModal
        visible={!!selectedTournamentId}
        tournamentId={selectedTournamentId}
        onClose={() => {
          setSelectedTournamentId(null);
          router.setParams({ detailId: undefined, detailType: undefined } as any);
        }}
        onCancelled={() => {
          setSelectedTournamentId(null);
          router.setParams({ detailId: undefined, detailType: undefined } as any);
          refetchBookings();
        }}
      />

      {/* ─── League Registration Details Modal ─── */}
      <LeagueRegistrationDetailsModal
        visible={!!selectedLeagueId}
        leagueId={selectedLeagueId}
        onClose={() => {
          setSelectedLeagueId(null);
          router.setParams({ detailId: undefined, detailType: undefined } as any);
        }}
        onCancelled={() => {
          setSelectedLeagueId(null);
          router.setParams({ detailId: undefined, detailType: undefined } as any);
          refetchBookings();
        }}
      />

      {/* ─── Category Filter Bottom Sheet ─── */}
      <Modal
        visible={isFilterSheetVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsFilterSheetVisible(false)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            style={styles.sheetBackdrop}
            onPress={() => setIsFilterSheetVisible(false)}
          />
          <View
            style={[
              styles.sheetContainer,
              { paddingBottom: Math.max(insets.bottom, 20) },
            ]}
          >
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <AppText style={styles.sheetTitle}>Filters</AppText>
              <TouchableOpacity
                onPress={() => setIsFilterSheetVisible(false)}
                style={styles.sheetCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Close filters"
                accessibilityRole="button"
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.sheetBody}>
              <AppText style={styles.sheetSectionTitle}>Booking Category</AppText>
              <View style={styles.sheetPillGrid}>
                {ACTIVITY_CATEGORIES.map((cat) => {
                  const isSelected = draftActivity === cat.key;
                  return (
                    <TouchableOpacity
                      key={cat.key}
                      style={[
                        styles.sheetFilterPill,
                        isSelected && styles.sheetFilterPillActive,
                      ]}
                      onPress={() => setDraftActivity(cat.key)}
                      activeOpacity={0.75}
                      accessibilityRole="radio"
                      accessibilityLabel={cat.label}
                      accessibilityState={{ selected: isSelected }}
                    >
                      <AppText
                        style={[
                          styles.sheetFilterPillText,
                          isSelected && styles.sheetFilterPillTextActive,
                        ]}
                      >
                        {cat.label}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.sheetActionsRow}>
              <TouchableOpacity
                style={styles.sheetClearActionBtn}
                onPress={handleClearFilter}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Clear"
              >
                <AppText style={styles.sheetClearActionText}>Clear</AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetApplyActionBtn}
                onPress={handleApplyFilter}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Apply"
              >
                <AppText style={styles.sheetApplyActionText}>Apply</AppText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9F8',
  },
  pageContainer: {
    width: '100%',
    maxWidth: 648,
    alignSelf: 'center',
  },
  segmentedTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#D5DFDA',
    padding: 3,
    gap: 3,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentButton: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  segmentButtonActive: {
    backgroundColor: '#114D3F',
    shadowColor: '#114D3F',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.16,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#4B6358',
    textAlign: 'center',
    includeFontPadding: false,
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  filtersBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 10,
    marginBottom: 16,
  },
  filtersLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  filtersPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    flexShrink: 0,
  },
  filtersPillText: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '600',
    color: '#0D5C46',
    includeFontPadding: false,
  },
  filtersCountBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#0D5C46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filtersCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  appliedFilterText: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '500',
    color: '#667776',
    flex: 1,
    minWidth: 0,
  },
  clearFilterText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#0D5C46',
    flexShrink: 0,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(16, 43, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '85%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF4F1',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#102B2A',
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBody: {
    paddingVertical: 16,
  },
  sheetSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102B2A',
    marginBottom: 12,
  },
  sheetPillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sheetFilterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sheetFilterPillActive: {
    backgroundColor: '#E5F6EC',
    borderColor: '#176B57',
    borderWidth: 1.5,
  },
  sheetFilterPillText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#475569',
  },
  sheetFilterPillTextActive: {
    color: '#176B57',
    fontWeight: '700',
  },
  sheetActionsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#EEF4F1',
  },
  sheetClearActionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  sheetClearActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  sheetApplyActionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#176B57',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetApplyActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    flexGrow: 1,
  },
  loadingContainer: {
    width: '100%',
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#718279',
    fontWeight: '500',
  },
  errorContainer: {
    width: '100%',
    paddingVertical: 40,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingVertical: 9,
    paddingHorizontal: 22,
    backgroundColor: '#114D3F',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: '#132A21',
  },
  sectionCount: {
    flexShrink: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: '#718279',
    textAlign: 'right',
  },
  upcomingCard: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8ECE9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  dateBox: {
    width: 68,
    height: 76,
    backgroundColor: '#EBF4F0',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  dateBoxWeekday: {
    fontSize: 11,
    fontWeight: '700',
    color: '#176B57',
    letterSpacing: 0.5,
  },
  dateBoxDay: {
    fontSize: 22,
    fontWeight: '800',
    color: '#114D3F',
    lineHeight: 26,
  },
  dateBoxMonthYear: {
    fontSize: 9,
    fontWeight: '600',
    color: '#52796F',
    letterSpacing: 0.2,
  },
  cardDetails: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
    justifyContent: 'center',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#132A21',
    marginBottom: 4,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  cardMetaText: {
    fontSize: 12,
    color: '#5C7065',
    fontWeight: '500',
    flexShrink: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeCourt: {
    backgroundColor: '#ECFDF5',
  },
  typeBadgeTextCourt: {
    color: '#065F46',
  },
  typeBadgeTournament: {
    backgroundColor: '#FAF5FF',
  },
  typeBadgeTextTournament: {
    color: '#6B21A8',
  },
  typeBadgeLeague: {
    backgroundColor: '#EFF6FF',
  },
  typeBadgeTextLeague: {
    color: '#1E40AF',
  },
  typeBadgeEvent: {
    backgroundColor: '#FEF3C7',
  },
  typeBadgeTextEvent: {
    color: '#92400E',
  },
  typeBadgeLesson: {
    backgroundColor: '#F0FDF4',
  },
  typeBadgeTextLesson: {
    color: '#166534',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  confirmedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#E8F5E9',
  },
  confirmedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2E7D32',
  },
  playerPriceBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#F1F5F3',
  },
  playerPriceBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#114D3F',
  },
  completedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  completedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },
  cancelledBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  cancelledBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  chevronWrapper: {
    paddingLeft: 4,
  },
  pastCard: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8ECE9',
  },
  courtThumbnail: {
    width: 68,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  courtThumbnailFallback: {
    width: 68,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#EBF4F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastCardDetails: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
  },
  pastTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 3,
    gap: 8,
  },
  pastTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  pastBadgesGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  emptyCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E8ECE9',
    gap: 14,
  },
  emptyIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#EBF4F0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emptyTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#132A21',
    marginBottom: 2,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#718279',
    lineHeight: 16,
  },
});
