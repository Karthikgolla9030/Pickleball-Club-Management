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

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Calendar,
  Clock,
  MapPin,
  ChevronRight,
  LayoutGrid,
  Trophy,
  Award,
  GraduationCap,
  Sparkles,
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
  const { clubId: selectedClubId } = useActiveClub();
  const { data: clubBranding } = useClubBranding(selectedClubId ?? '');

  const [activeTab, setActiveTab] = useState<FilterTab>('upcoming');
  const [selectedActivity, setSelectedActivity] = useState<ActivityCategory>('all');
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
  const handleItemPress = (item: PlayerBookingItem) => {
    if (item.activity_type === 'court') {
      // Build compatible Booking object for Modal
      const compatibleBooking: Booking = {
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
      };
      setSelectedBooking(compatibleBooking);
      setDetailsModalVisible(true);
    } else if (item.activity_type === 'tournament' && item.activity_id) {
      setSelectedTournamentId(item.activity_id);
    } else if (item.activity_type === 'league' && item.activity_id) {
      setSelectedLeagueId(item.activity_id);
    } else if (item.activity_type === 'event') {
      (router.push as any)('/(player)/events');
    } else if (item.activity_type === 'lesson') {
      (router.push as any)('/(player)/lessons');
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
            <View style={{ flex: 1, marginRight: 8 }}>
              {renderActivityBadge(item.activity_type)}
              <AppText style={[styles.cardTitle, { marginTop: 4 }]} numberOfLines={1}>
                {item.title}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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
            <View style={{ flex: 1, marginRight: 8 }}>
              {renderActivityBadge(item.activity_type)}
              <AppText style={[styles.cardTitle, { marginTop: 4 }]} numberOfLines={1}>
                {item.title}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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

  return (
    <View style={styles.container}>
      {/* ─── Top Header ─── */}
      <AppHeader title="My Bookings" showMenu borderless />

      {/* ─── Status Segmented Control ─── */}
      <View style={styles.segmentedWrapper}>
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
                onPress={() => setActiveTab(tab)}
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
      </View>

      {/* ─── Activity Category Filter Chips ─── */}
      <View style={styles.categoryContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          {ACTIVITY_CATEGORIES.map((cat) => {
            const isCatActive = selectedActivity === cat.key;
            return (
              <TouchableOpacity
                key={cat.key}
                onPress={() => setSelectedActivity(cat.key)}
                style={[
                  styles.categoryPill,
                  isCatActive && styles.categoryPillActive,
                ]}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={cat.label}
                accessibilityState={{ selected: isCatActive }}
              >
                <AppText
                  numberOfLines={1}
                  style={[
                    styles.categoryPillText,
                    isCatActive && styles.categoryPillTextActive,
                  ]}
                >
                  {cat.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ─── Bookings Content ─── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
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
      </ScrollView>

      {/* ─── Booking Details Modal (for court reservations) ─── */}
      <BookingDetailsModal
        visible={detailsModalVisible}
        onClose={() => {
          setDetailsModalVisible(false);
          setSelectedBooking(null);
        }}
        booking={selectedBooking}
        mode="player"
        clubId={selectedBooking?.club_id || selectedClubId || ''}
      />

      {/* ─── Tournament Registration Details Modal ─── */}
      <RegistrationDetailsModal
        visible={!!selectedTournamentId}
        tournamentId={selectedTournamentId}
        onClose={() => setSelectedTournamentId(null)}
        onCancelled={() => {
          setSelectedTournamentId(null);
          refetchBookings();
        }}
      />

      {/* ─── League Registration Details Modal ─── */}
      <LeagueRegistrationDetailsModal
        visible={!!selectedLeagueId}
        leagueId={selectedLeagueId}
        onClose={() => setSelectedLeagueId(null)}
        onCancelled={() => {
          setSelectedLeagueId(null);
          refetchBookings();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9F8',
  },
  segmentedWrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#F7F9F8',
  },
  segmentedTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: '#EAEFEA',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#DCE5E0',
    padding: 4,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
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
  },
  categoryContainer: {
    backgroundColor: '#F7F9F8',
    paddingBottom: 8,
    width: '100%',
  },
  categoryScroll: {
    width: '100%',
  },
  categoryScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryPill: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE5E0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  categoryPillActive: {
    backgroundColor: '#114D3F',
    borderColor: '#114D3F',
  },
  categoryPillText: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '600',
    color: '#4B6358',
    includeFontPadding: false,
  },
  categoryPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  loadingContainer: {
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
    paddingVertical: 40,
    alignItems: 'center',
    paddingHorizontal: 20,
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
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#132A21',
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#718279',
  },
  upcomingCard: {
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
    marginLeft: 12,
  },
  pastTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E8ECE9',
    gap: 14,
    marginTop: 4,
  },
  emptyIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#EBF4F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTextContainer: {
    flex: 1,
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
