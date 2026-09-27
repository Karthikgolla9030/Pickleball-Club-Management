/**
 * Aught2 Pickleball — Player Bookings Screen
 *
 * Implements the exact Player Side "Bookings" UI matching the reference design:
 *   - Top header with hamburger menu button and bold "Bookings" title
 *   - 3 filter pills: Upcoming | Past | Cancelled
 *   - Upcoming Bookings section with count and date-box cards
 *   - Past Bookings section with count and court-thumbnail cards
 *   - Cancelled Bookings section with count and status badges
 *   - Fixed display logic: "No bookings yet" only appears when upcoming bookings is genuinely 0
 *   - Tapping any card opens BookingDetailsModal for full details and cancellation
 *   - Auto-refreshes when screen gains focus
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import {
  Calendar,
  Clock,
  MapPin,
  Menu,
  ChevronRight,
} from 'lucide-react-native';

import { AppText, BookingDetailsModal } from '@/components';
import { useActiveClub, usePlayerBookings } from '@/hooks';
import { useDrawerStore } from '@/navigation';
import { Colors } from '@/theme';
import type { Booking } from '@/types';

type FilterTab = 'upcoming' | 'past' | 'cancelled';

const COURT_IMAGES = [
  require('../../assets/courts/court_1.jpg'),
  require('../../assets/courts/court_2.jpg'),
  require('../../assets/courts/court_3.jpg'),
  require('../../assets/courts/court_4.jpg'),
  require('../../assets/courts/court_5.jpg'),
];

export default function PlayerBookingsScreen() {
  const insets = useSafeAreaInsets();
  const openDrawer = useDrawerStore((s) => s.openDrawer);
  const { clubId: selectedClubId } = useActiveClub();

  const [activeTab, setActiveTab] = useState<FilterTab>('upcoming');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);

  // Fetch all player bookings across this club (or all clubs if not specified)
  const {
    bookings,
    isLoading,
    isRefetching,
    isError,
    error,
    refetch: refetchBookings,
  } = usePlayerBookings({
    clubId: selectedClubId ?? undefined,
  });

  // Re-fetch bookings whenever player navigates to this screen
  useFocusEffect(
    useCallback(() => {
      refetchBookings();
    }, [refetchBookings])
  );

  // Current timestamp for accurate time comparison
  const now = Date.now();

  // ─── Filter & Categorize Bookings ──────────────────────────────────────────
  const upcomingBookings = useMemo(() => {
    return (bookings || [])
      .filter((b) => {
        const isCancelled = b.status?.toLowerCase() === 'cancelled';
        const isFuture = new Date(b.start_at).getTime() > now;
        return !isCancelled && isFuture;
      })
      .sort(
        (a, b) =>
          new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
      );
  }, [bookings, now]);

  const pastBookings = useMemo(() => {
    return (bookings || [])
      .filter((b) => {
        const isCancelled = b.status?.toLowerCase() === 'cancelled';
        const isPassed = new Date(b.start_at).getTime() <= now;
        return !isCancelled && isPassed;
      })
      .sort(
        (a, b) =>
          new Date(b.start_at).getTime() - new Date(a.start_at).getTime()
      );
  }, [bookings, now]);

  const cancelledBookings = useMemo(() => {
    return (bookings || [])
      .filter((b) => b.status?.toLowerCase() === 'cancelled')
      .sort(
        (a, b) =>
          new Date(b.start_at).getTime() - new Date(a.start_at).getTime()
      );
  }, [bookings]);

  // ─── Date & Time Formatting Helpers ────────────────────────────────────────
  const parseDateBox = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const weekday = d
        .toLocaleDateString('en-US', { weekday: 'short' })
        .toUpperCase();
      const day = d.getDate().toString();
      const month = d
        .toLocaleDateString('en-US', { month: 'short' })
        .toUpperCase();
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

  const formatTimeRange = (startIso: string, endIso: string) => {
    try {
      const s = new Date(startIso);
      const e = new Date(endIso);
      const startStr = s.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
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

  const getCourtImage = (booking: Booking, index: number) => {
    const courtName = booking.court?.display_name || booking.court?.name || '';
    if (courtName.includes('2')) return COURT_IMAGES[1];
    if (courtName.includes('3')) return COURT_IMAGES[2];
    if (courtName.includes('4')) return COURT_IMAGES[3];
    if (courtName.includes('5')) return COURT_IMAGES[4];
    return COURT_IMAGES[index % COURT_IMAGES.length];
  };

  const handleCardPress = (booking: Booking) => {
    setSelectedBooking(booking);
    setDetailsModalVisible(true);
  };

  // ─── Render Cards ──────────────────────────────────────────────────────────
  const renderUpcomingCard = (booking: Booking) => {
    const { weekday, day, monthYear } = parseDateBox(booking.start_at);
    const timeRange = formatTimeRange(booking.start_at, booking.end_at);
    const courtName =
      booking.court?.display_name || booking.court?.name || 'Court';
    const clubName = booking.club_name || 'Aught2 Pickleball';
    const venueText = `${courtName} • ${clubName}`;

    return (
      <TouchableOpacity
        key={booking.id}
        style={styles.upcomingCard}
        onPress={() => handleCardPress(booking)}
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
          <AppText style={styles.cardTitle}>Court Booking</AppText>

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

          <View style={styles.confirmedBadge}>
            <AppText style={styles.confirmedBadgeText}>Confirmed</AppText>
          </View>
        </View>

        {/* Chevron */}
        <View style={styles.chevronWrapper}>
          <ChevronRight size={18} color="#94A3B8" strokeWidth={2} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderPastCard = (booking: Booking, index: number) => {
    const dateFormatted = formatPastDate(booking.start_at);
    const timeRange = formatTimeRange(booking.start_at, booking.end_at);
    const courtName =
      booking.court?.display_name || booking.court?.name || 'Court';
    const clubName = booking.club_name || 'Aught2 Pickleball';
    const venueText = `${courtName} • ${clubName}`;
    const courtImage = getCourtImage(booking, index);

    return (
      <TouchableOpacity
        key={booking.id}
        style={styles.pastCard}
        onPress={() => handleCardPress(booking)}
        activeOpacity={0.88}
      >
        {/* Left Image Thumbnail */}
        <Image source={courtImage} style={styles.courtThumbnail} />

        {/* Details */}
        <View style={styles.pastCardDetails}>
          <View style={styles.pastTitleRow}>
            <AppText style={styles.cardTitle}>Court Booking</AppText>
            <View style={styles.completedBadge}>
              <AppText style={styles.completedBadgeText}>Completed</AppText>
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

        {/* Chevron */}
        <View style={styles.chevronWrapper}>
          <ChevronRight size={18} color="#94A3B8" strokeWidth={2} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderCancelledCard = (booking: Booking, index: number) => {
    const dateFormatted = formatPastDate(booking.start_at);
    const timeRange = formatTimeRange(booking.start_at, booking.end_at);
    const courtName =
      booking.court?.display_name || booking.court?.name || 'Court';
    const clubName = booking.club_name || 'Aught2 Pickleball';
    const venueText = `${courtName} • ${clubName}`;
    const courtImage = getCourtImage(booking, index);

    return (
      <TouchableOpacity
        key={booking.id}
        style={styles.pastCard}
        onPress={() => handleCardPress(booking)}
        activeOpacity={0.88}
      >
        <Image source={courtImage} style={styles.courtThumbnail} />

        <View style={styles.pastCardDetails}>
          <View style={styles.pastTitleRow}>
            <AppText style={styles.cardTitle}>Court Booking</AppText>
            <View style={styles.cancelledBadge}>
              <AppText style={styles.cancelledBadgeText}>Cancelled</AppText>
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
      <View
        style={[
          styles.headerRow,
          { paddingTop: Math.max(insets.top, 12) + 8 },
        ]}
      >
        <Pressable
          onPress={openDrawer}
          style={styles.menuButton}
          hitSlop={8}
          accessibilityLabel="Open menu"
          accessibilityRole="button"
        >
          <Menu size={24} color="#0F2922" strokeWidth={2.2} />
        </Pressable>
        <AppText style={styles.headerTitle}>Bookings</AppText>
      </View>

      {/* ─── 3 Filter Tabs / Pills ─── */}
      <View style={styles.filterTabsRow}>
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
              style={[
                styles.filterTabPill,
                isActive && styles.filterTabPillActive,
              ]}
              activeOpacity={0.8}
            >
              <AppText
                style={[
                  styles.filterTabText,
                  isActive && styles.filterTabTextActive,
                ]}
              >
                {label}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ─── Bookings Content ─── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetchBookings}
            colors={['#114D3F']}
            tintColor="#114D3F"
          />
        }
      >
        {/* Loading State */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#114D3F" />
            <AppText style={styles.loadingText}>Loading bookings...</AppText>
          </View>
        ) : isError ? (
          /* Error State */
          <View style={styles.errorContainer}>
            <AppText style={styles.errorText}>
              {error?.message ||
                'Unable to load bookings. Please check your connection and try again.'}
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
                {/* Section Header */}
                <View style={styles.sectionHeaderRow}>
                  <AppText style={styles.sectionTitle}>
                    Upcoming Bookings
                  </AppText>
                  {upcomingBookings.length > 0 && (
                    <AppText style={styles.sectionCount}>
                      {upcomingBookings.length}{' '}
                      {upcomingBookings.length === 1 ? 'Booking' : 'Bookings'}
                    </AppText>
                  )}
                </View>

                {/* Upcoming List or Empty State */}
                {upcomingBookings.length > 0 ? (
                  upcomingBookings.map((b) => renderUpcomingCard(b))
                ) : (
                  /* "No bookings yet" appears ONLY when upcoming bookings is 0 */
                  <View style={styles.emptyCard}>
                    <View style={styles.emptyIconContainer}>
                      <Calendar size={22} color="#176B57" strokeWidth={2.2} />
                    </View>
                    <View style={styles.emptyTextContainer}>
                      <AppText style={styles.emptyTitle}>
                        No bookings yet
                      </AppText>
                      <AppText style={styles.emptySubtitle}>
                        Your court bookings will appear here.
                      </AppText>
                    </View>
                  </View>
                )}

                {/* Past Bookings Section (displayed if player has past bookings) */}
                {pastBookings.length > 0 && (
                  <>
                    <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
                      <AppText style={styles.sectionTitle}>
                        Past Bookings
                      </AppText>
                      <AppText style={styles.sectionCount}>
                        {pastBookings.length}{' '}
                        {pastBookings.length === 1 ? 'Booking' : 'Bookings'}
                      </AppText>
                    </View>
                    {pastBookings.map((b, idx) => renderPastCard(b, idx))}
                  </>
                )}
              </>
            )}

            {/* ════════════ TAB: PAST ════════════ */}
            {activeTab === 'past' && (
              <>
                <View style={styles.sectionHeaderRow}>
                  <AppText style={styles.sectionTitle}>Past Bookings</AppText>
                  {pastBookings.length > 0 && (
                    <AppText style={styles.sectionCount}>
                      {pastBookings.length}{' '}
                      {pastBookings.length === 1 ? 'Booking' : 'Bookings'}
                    </AppText>
                  )}
                </View>

                {pastBookings.length > 0 ? (
                  pastBookings.map((b, idx) => renderPastCard(b, idx))
                ) : (
                  <View style={styles.emptyCard}>
                    <View style={styles.emptyIconContainer}>
                      <Calendar size={22} color="#176B57" strokeWidth={2.2} />
                    </View>
                    <View style={styles.emptyTextContainer}>
                      <AppText style={styles.emptyTitle}>
                        No past bookings
                      </AppText>
                      <AppText style={styles.emptySubtitle}>
                        Your completed court bookings will appear here.
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
                  <AppText style={styles.sectionTitle}>
                    Cancelled Bookings
                  </AppText>
                  {cancelledBookings.length > 0 && (
                    <AppText style={styles.sectionCount}>
                      {cancelledBookings.length}{' '}
                      {cancelledBookings.length === 1 ? 'Booking' : 'Bookings'}
                    </AppText>
                  )}
                </View>

                {cancelledBookings.length > 0 ? (
                  cancelledBookings.map((b, idx) => renderCancelledCard(b, idx))
                ) : (
                  <View style={styles.emptyCard}>
                    <View style={styles.emptyIconContainer}>
                      <Calendar size={22} color="#176B57" strokeWidth={2.2} />
                    </View>
                    <View style={styles.emptyTextContainer}>
                      <AppText style={styles.emptyTitle}>
                        No cancelled bookings
                      </AppText>
                      <AppText style={styles.emptySubtitle}>
                        You have no cancelled court reservations.
                      </AppText>
                    </View>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* ─── Booking Details Modal ─── */}
      <BookingDetailsModal
        visible={detailsModalVisible}
        onClose={() => {
          setDetailsModalVisible(false);
          refetchBookings();
        }}
        booking={selectedBooking}
        mode="player"
        clubId={selectedClubId || selectedBooking?.club_id || ''}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#F8FAF9',
  },
  menuButton: {
    padding: 4,
    marginRight: 14,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F2922',
    letterSpacing: -0.3,
  },
  // ─── Filter Tabs / Pills ───
  filterTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    gap: 10,
    marginBottom: 16,
  },
  filterTabPill: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDEA',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  filterTabPillActive: {
    backgroundColor: '#114D3F',
    borderColor: '#114D3F',
    shadowColor: '#114D3F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  filterTabText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#5E6E66',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  // ─── Content ───
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 100,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F2922',
    letterSpacing: -0.2,
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#135C48',
  },
  // ─── Upcoming Card ───
  upcomingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EEF3F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  dateBox: {
    width: 74,
    height: 84,
    borderRadius: 12,
    backgroundColor: '#EDF7F2',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  dateBoxWeekday: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#5C7A6F',
    letterSpacing: 0.5,
  },
  dateBoxDay: {
    fontSize: 25,
    fontWeight: '800',
    color: '#0F2922',
    lineHeight: 29,
    marginVertical: 1,
  },
  dateBoxMonthYear: {
    fontSize: 10,
    fontWeight: '600',
    color: '#5C7A6F',
    letterSpacing: 0.5,
  },
  cardDetails: {
    flex: 1,
    paddingLeft: 14,
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F2922',
    marginBottom: 5,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardMetaText: {
    fontSize: 12.5,
    color: '#5E6E66',
    marginLeft: 6,
    flexShrink: 1,
  },
  confirmedBadge: {
    backgroundColor: '#E5F5EC',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  confirmedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#176B57',
  },
  chevronWrapper: {
    paddingLeft: 6,
    paddingRight: 4,
  },
  // ─── Past Card ───
  pastCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EEF3F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  courtThumbnail: {
    width: 86,
    height: 76,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  pastCardDetails: {
    flex: 1,
    paddingLeft: 12,
    justifyContent: 'center',
  },
  pastTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  completedBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 12,
  },
  completedBadgeText: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#64748B',
  },
  cancelledBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 12,
  },
  cancelledBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#DC2626',
  },
  // ─── Empty State ───
  emptyCard: {
    backgroundColor: '#EDF7F2',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 4,
    marginBottom: 12,
  },
  emptyIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#D7EFE3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTextContainer: {
    flex: 1,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F2922',
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: '#5E7A6E',
    marginTop: 2,
  },
  // ─── Loading & Error ───
  loadingContainer: {
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#5E6E66',
  },
  errorContainer: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: Colors.status.error || '#DC2626',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#114D3F',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
});
