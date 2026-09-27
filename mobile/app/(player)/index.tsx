/**
 * Aught2 Pickleball — Player Home Dashboard
 *
 * Implements the Player Home Dashboard redesign matching the reference design:
 *   1. Header: Aught2 Pickleball logo on left, Hamburger Menu + Notification bell with unread badge on right (naturally scrolling).
 *   2. Welcome Hero Banner: Soft mint card with pickleball court image, "WELCOME BACK", "Hello, [Player Name]", "Find a Court ->".
 *   3. Your Next Booking: Conditional (only if valid upcoming booking exists), date panel, court & club details, confirmed badge.
 *   4. Upcoming Events: Conditional (only if real upcoming events/tournaments exist), thumbnail, venue, skill level & status badges.
 *   5. Recent Activity: Conditional (only if real recent activity exists), chronological activity list with colored icon pills.
 *   6. Discover More: Always visible, "Improve Your Game" with lessons/coaching link.
 *   7. Fixed Bottom Navigation: Home, Bookings, Central Book (+), Events, Profile.
 */

import React, { useMemo } from 'react';
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowRight,
  Bell,
  Calendar,
  CalendarCheck,
  CalendarX,
  ChevronRight,
  Clock,
  Lightbulb,
  MapPin,
  Menu,
  Sparkles,
  Trophy,
} from 'lucide-react-native';

import { AppText } from '@/components';
import {
  useActiveClub,
  useAuth,
  useDiscoverClubEvents,
  usePlayerActivity,
  usePlayerBookings,
  usePlayerProfile,
  usePlayerTournaments,
  useUnreadNotificationCount,
} from '@/hooks';
import { useDrawerStore } from '@/navigation';
import { Colors } from '@/theme';
import type { Booking, PlayerActivityItem, TournamentDiscoveryItem } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(dateString: string): string {
  try {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'Just now';
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    const diffWeeks = Math.floor(diffDays / 7);
    return `${diffWeeks}w ago`;
  } catch {
    return 'Recent';
  }
}

function formatBookingDate(dateString: string) {
  try {
    const d = new Date(dateString);
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return {
      dayOfWeek: days[d.getDay()],
      dayOfMonth: String(d.getDate()),
      monthYear: `${months[d.getMonth()]} ${d.getFullYear()}`,
    };
  } catch {
    return { dayOfWeek: 'DAY', dayOfMonth: '--', monthYear: '' };
  }
}

function formatTimeRange(startStr: string, endStr: string): string {
  try {
    const s = new Date(startStr);
    const e = new Date(endStr);
    const formatTime = (d: Date) => {
      let hours = d.getHours();
      const minutes = d.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const minStr = minutes < 10 ? `0${minutes}` : String(minutes);
      return `${hours}:${minStr} ${ampm}`;
    };
    return `${formatTime(s)} – ${formatTime(e)}`;
  } catch {
    return '';
  }
}

function formatEventDate(dateString: string): string {
  try {
    const d = new Date(dateString);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return dateString;
  }
}

// ─── Main Screen Component ───────────────────────────────────────────────────

export default function PlayerHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const openDrawer = useDrawerStore((s) => s.openDrawer);

  const { user } = useAuth();
  const { profile } = usePlayerProfile();
  const { clubId, clubName } = useActiveClub();

  // 1. Next Booking (real authenticated player bookings)
  const {
    bookings,
    isLoading: isBookingsLoading,
    refetch: refetchBookings,
  } = usePlayerBookings({ upcomingOnly: true });

  // 2. Upcoming Events & Tournaments
  const {
    data: clubEvents,
    refetch: refetchEvents,
  } = useDiscoverClubEvents(clubId || '');
  const {
    tournaments,
    refetch: refetchTournaments,
  } = usePlayerTournaments();

  // 3. Recent Activity
  const {
    activities,
    hasActivity,
    refetch: refetchActivity,
  } = usePlayerActivity();

  // 4. Real-time Unread Notifications
  const { data: unreadNotifsCount } = useUnreadNotificationCount();

  const displayName = profile?.display_name || user?.full_name || 'Player';

  // ─── Compute Next Upcoming Booking ─────────────────────────────────────────
  const nextBooking: Booking | null = useMemo(() => {
    if (!bookings || bookings.length === 0) return null;
    const now = Date.now();
    const valid = bookings.filter((b) => {
      if (b.status === 'cancelled') return false;
      const endTime = new Date(b.end_at).getTime();
      return endTime > now;
    });
    if (valid.length === 0) return null;
    valid.sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );
    return valid[0] || null;
  }, [bookings]);

  // ─── Compute Upcoming Events / Tournaments ──────────────────────────────────
  const upcomingEvent = useMemo(() => {
    const now = Date.now();
    const candidates: Array<{
      id: string;
      title: string;
      startDate: string;
      venue: string;
      typeBadge: string;
      skillBadge?: string;
      statusBadge: string;
      isTournament: boolean;
    }> = [];

    // Tournaments
    (tournaments || []).forEach((t: TournamentDiscoveryItem) => {
      const startTime = new Date(t.start_date).getTime();
      if (t.status !== 'cancelled' && startTime > now) {
        candidates.push({
          id: t.id,
          title: t.name,
          startDate: t.start_date,
          venue: t.club_name || clubName || 'Club Court',
          typeBadge: 'Tournament',
          skillBadge: t.format_label || 'All Levels',
          statusBadge: t.is_registration_open ? 'Registration Open' : 'Upcoming',
          isTournament: true,
        });
      }
    });

    // Club Events
    (clubEvents || []).forEach((e) => {
      const startTime = new Date(e.start_at).getTime();
      if (e.status !== 'cancelled' && startTime > now) {
        candidates.push({
          id: e.id,
          title: e.title,
          startDate: e.start_at,
          venue: e.location || clubName || 'Pickleball Club',
          typeBadge: e.event_type.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          skillBadge: undefined,
          statusBadge: 'Registration Open',
          isTournament: false,
        });
      }
    });

    candidates.sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
    return candidates[0] || null;
  }, [tournaments, clubEvents, clubName]);

  const handleRefresh = async () => {
    await Promise.all([
      refetchBookings(),
      clubId ? refetchEvents() : Promise.resolve(),
      refetchTournaments(),
      refetchActivity(),
    ]);
  };

  return (
    <View style={styles.screen}>
      {/* ─── 1. FIXED TOP BAR / HEADER (Does not scroll) ───────────────────── */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 12) + 4,
          },
        ]}
      >
        {/* Logo on Left */}
        <Image
          source={require('../../assets/aught2_brand_logo_transparent.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />

        {/* Action Icons on Right */}
        <View style={styles.headerActions}>
          <Pressable
            onPress={openDrawer}
            style={styles.headerIconButton}
            hitSlop={8}
            accessibilityLabel="Open menu"
            accessibilityRole="button"
          >
            <Menu size={24} color="#102B2A" strokeWidth={2} />
          </Pressable>

          <Pressable
            onPress={() => router.push('/(player)/notifications' as any)}
            style={styles.headerIconButton}
            hitSlop={8}
            accessibilityLabel="Notifications"
            accessibilityRole="button"
          >
            <Bell size={24} color="#102B2A" strokeWidth={2} />
            {/* Real-Time Notification Unread Dot */}
            {(unreadNotifsCount ?? 0) > 0 && <View style={styles.notificationBadgeDot} />}
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContainer,
          {
            paddingTop: 8,
            paddingBottom: insets.bottom + 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isBookingsLoading}
            onRefresh={handleRefresh}
            tintColor={Colors.brand.primary}
          />
        }
      >
        {/* ─── 2. WELCOME HERO SECTION ───────────────────────────────────────── */}
        <View style={styles.heroSection}>
          <View style={styles.heroCard}>
            {/* Background Court Photo on Right */}
            <Image
              source={require('../../assets/events/pickleball_hero.jpg')}
              style={styles.heroImage}
              resizeMode="cover"
            />
            {/* Soft overlay ensuring high contrast readability */}
            <View style={styles.heroGradientOverlay} />

            {/* Content on Left */}
            <View style={styles.heroContent}>
              <AppText style={styles.heroTagline}>WELCOME BACK</AppText>
              <AppText style={styles.heroGreeting}>
                Hello,{'\n'}{displayName}
              </AppText>
              <AppText style={styles.heroDescription}>
                Ready to play, compete and make the most of your game?
              </AppText>

              <Pressable
                style={({ pressed }) => [
                  styles.findCourtButton,
                  pressed && styles.findCourtButtonPressed,
                ]}
                onPress={() => router.push('/(player)/courts' as any)}
                accessibilityRole="button"
                accessibilityLabel="Find a Court"
              >
                <AppText style={styles.findCourtButtonText}>Find a Court</AppText>
                <ArrowRight size={16} color="#FFFFFF" strokeWidth={2.4} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* ─── 3. YOUR NEXT BOOKING (Conditional) ────────────────────────────── */}
        {nextBooking && (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <AppText style={styles.sectionTitle}>Your Next Booking</AppText>
              <Pressable
                onPress={() => router.push('/(player)/bookings' as any)}
                hitSlop={8}
                style={styles.viewAllRow}
              >
                <AppText style={styles.viewAllText}>View All</AppText>
                <ChevronRight size={15} color="#176F5B" strokeWidth={2.2} />
              </Pressable>
            </View>

            {(() => {
              const dateInfo = formatBookingDate(nextBooking.start_at);
              const timeRange = formatTimeRange(
                nextBooking.start_at,
                nextBooking.end_at
              );
              const courtTitle =
                nextBooking.court?.name ||
                nextBooking.court?.display_name ||
                'Court';
              const clubTitle =
                nextBooking.club_name || clubName || 'Pickleball Club';
              const venueText = `${courtTitle} • ${clubTitle}`;

              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.bookingCard,
                    pressed && styles.cardPressed,
                  ]}
                  onPress={() => router.push('/(player)/bookings' as any)}
                  accessibilityRole="button"
                >
                  {/* Left Date Panel */}
                  <View style={styles.datePanel}>
                    <AppText style={styles.dateDayOfWeek}>
                      {dateInfo.dayOfWeek}
                    </AppText>
                    <AppText style={styles.dateDayNumber}>
                      {dateInfo.dayOfMonth}
                    </AppText>
                    <AppText style={styles.dateMonthYear}>
                      {dateInfo.monthYear}
                    </AppText>
                  </View>

                  {/* Vertical Divider */}
                  <View style={styles.dateDivider} />

                  {/* Right Details */}
                  <View style={styles.bookingDetailsCol}>
                    <AppText style={styles.bookingTypeTitle}>
                      {nextBooking.booking_type === 'staff'
                        ? 'Staff Booking'
                        : 'Court Booking'}
                    </AppText>

                    <View style={styles.metaRow}>
                      <Clock size={13} color="#718580" strokeWidth={1.9} />
                      <AppText style={styles.metaText} numberOfLines={1}>
                        {timeRange}
                      </AppText>
                    </View>

                    <View style={styles.metaRow}>
                      <MapPin size={13} color="#718580" strokeWidth={1.9} />
                      <AppText style={styles.metaText} numberOfLines={1}>
                        {venueText}
                      </AppText>
                    </View>

                    <View style={styles.bookingBadgeRow}>
                      <View style={styles.confirmedPill}>
                        <AppText style={styles.confirmedPillText}>
                          Confirmed
                        </AppText>
                      </View>
                      <View style={styles.pricePill}>
                        <AppText style={styles.pricePillText}>
                          {nextBooking.total_price != null
                            ? `₹${Number(nextBooking.total_price).toLocaleString('en-IN')}`
                            : nextBooking.court?.price_per_hour != null
                              ? `₹${Number(nextBooking.court.price_per_hour).toLocaleString('en-IN')}`
                              : 'Free'}
                        </AppText>
                      </View>
                    </View>
                  </View>

                  {/* Right Chevron */}
                  <View style={styles.chevronSlot}>
                    <ChevronRight size={19} color="#94A3B8" strokeWidth={2} />
                  </View>
                </Pressable>
              );
            })()}
          </View>
        )}

        {/* ─── 4. UPCOMING EVENTS (Conditional) ──────────────────────────────── */}
        {upcomingEvent && (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <AppText style={styles.sectionTitle}>Upcoming Events</AppText>
              <Pressable
                onPress={() => router.push('/(player)/events' as any)}
                hitSlop={8}
                style={styles.viewAllRow}
              >
                <AppText style={styles.viewAllText}>View All</AppText>
                <ChevronRight size={15} color="#176F5B" strokeWidth={2.2} />
              </Pressable>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.eventCard,
                pressed && styles.cardPressed,
              ]}
              onPress={() => router.push('/(player)/events' as any)}
              accessibilityRole="button"
            >
              {/* Event Thumbnail */}
              <Image
                source={require('../../assets/events/card1.jpg')}
                style={styles.eventThumbnail}
                resizeMode="cover"
              />

              {/* Event Content */}
              <View style={styles.eventContentCol}>
                <AppText style={styles.eventTitle} numberOfLines={1}>
                  {upcomingEvent.title}
                </AppText>

                <View style={styles.metaRow}>
                  <Calendar size={13} color="#718580" strokeWidth={1.9} />
                  <AppText style={styles.metaText} numberOfLines={1}>
                    {formatEventDate(upcomingEvent.startDate)}
                  </AppText>
                </View>

                <View style={styles.metaRow}>
                  <MapPin size={13} color="#718580" strokeWidth={1.9} />
                  <AppText style={styles.metaText} numberOfLines={1}>
                    {upcomingEvent.venue}
                  </AppText>
                </View>

                {/* Badges */}
                <View style={styles.eventBadgesRow}>
                  <View style={styles.eventBadgeBlue}>
                    <AppText style={styles.eventBadgeBlueText}>
                      {upcomingEvent.typeBadge}
                    </AppText>
                  </View>

                  {upcomingEvent.skillBadge ? (
                    <View style={styles.eventBadgeGreen}>
                      <AppText style={styles.eventBadgeGreenText}>
                        {upcomingEvent.skillBadge}
                      </AppText>
                    </View>
                  ) : null}

                  <View style={styles.eventBadgeLightBlue}>
                    <AppText style={styles.eventBadgeLightBlueText}>
                      {upcomingEvent.statusBadge}
                    </AppText>
                  </View>
                </View>
              </View>

              {/* Right Chevron */}
              <View style={styles.chevronSlot}>
                <ChevronRight size={19} color="#94A3B8" strokeWidth={2} />
              </View>
            </Pressable>
          </View>
        )}

        {/* ─── 5. RECENT ACTIVITY (Conditional) ──────────────────────────────── */}
        {hasActivity && activities.length > 0 && (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <AppText style={styles.sectionTitle}>Recent Activity</AppText>
              <Pressable
                onPress={() => router.push('/(player)/bookings' as any)}
                hitSlop={8}
                style={styles.viewAllRow}
              >
                <AppText style={styles.viewAllText}>View All</AppText>
                <ChevronRight size={15} color="#176F5B" strokeWidth={2.2} />
              </Pressable>
            </View>

            <View style={styles.activityCard}>
              {activities.slice(0, 5).map((act: PlayerActivityItem, index: number) => {
                const isLast = index === Math.min(activities.length, 5) - 1;
                const isBooking = act.activity_type.startsWith('booking');
                const isCancelled = act.activity_type.includes('cancelled');
                const isTournament = act.activity_type.includes('tournament');

                return (
                  <Pressable
                    key={act.id}
                    style={({ pressed }) => [
                      styles.activityRow,
                      !isLast && styles.activityRowBorder,
                      pressed && styles.activityRowPressed,
                    ]}
                    onPress={() => {
                      if (isTournament) {
                        router.push('/(player)/tournaments' as any);
                      } else if (isBooking) {
                        router.push('/(player)/bookings' as any);
                      } else {
                        router.push('/(player)/events' as any);
                      }
                    }}
                  >
                    {/* Icon Pill */}
                    <View
                      style={[
                        styles.activityIconPill,
                        isCancelled
                          ? styles.activityPillRed
                          : isTournament
                          ? styles.activityPillPurple
                          : isBooking
                          ? styles.activityPillGreen
                          : styles.activityPillBlue,
                      ]}
                    >
                      {isCancelled ? (
                        <CalendarX size={19} color="#DC2626" strokeWidth={2} />
                      ) : isTournament ? (
                        <Trophy size={18} color="#7E22CE" strokeWidth={2} />
                      ) : isBooking ? (
                        <CalendarCheck size={19} color="#167B48" strokeWidth={2} />
                      ) : (
                        <Sparkles size={18} color="#0284C7" strokeWidth={2} />
                      )}
                    </View>

                    {/* Middle Text Details */}
                    <View style={styles.activityTextCol}>
                      <AppText style={styles.activityTitle} numberOfLines={1}>
                        {act.title}
                      </AppText>
                      <AppText style={styles.activityDesc} numberOfLines={1}>
                        {act.description}
                      </AppText>
                    </View>

                    {/* Timestamp & Chevron */}
                    <View style={styles.activityMetaCol}>
                      <AppText style={styles.activityTimeText}>
                        {formatRelativeTime(act.timestamp)}
                      </AppText>
                      <ChevronRight size={15} color="#94A3B8" strokeWidth={2} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* ─── 6. DISCOVER MORE (Always Visible) ─────────────────────────────── */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderRow}>
            <AppText style={styles.sectionTitle}>Discover More</AppText>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.discoverCard,
              pressed && styles.cardPressed,
            ]}
            onPress={() => router.push('/(player)/lessons' as any)}
            accessibilityRole="button"
            accessibilityLabel="Improve Your Game"
          >
            {/* Lightbulb in pale green circle */}
            <View style={styles.discoverIconPill}>
              <Lightbulb size={23} color="#176F5B" strokeWidth={2.2} />
            </View>

            {/* Description */}
            <View style={styles.discoverTextCol}>
              <AppText style={styles.discoverTitle}>Improve Your Game</AppText>
              <AppText style={styles.discoverDescription}>
                Find lessons, practice sessions and tournaments at your club.
              </AppText>
            </View>

            {/* Right Chevron */}
            <View style={styles.chevronSlot}>
              <ChevronRight size={20} color="#728782" strokeWidth={2.2} />
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F4F9F6',
  },
  scrollContainer: {
    paddingHorizontal: 16,
    gap: 18,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#F4F9F6',
    zIndex: 10,
  },
  logoImage: {
    width: 106,
    height: 46,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notificationBadgeDot: {
    position: 'absolute',
    top: 6,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#F4F9F6',
  },

  // Hero Banner
  heroSection: {
    marginTop: 2,
  },
  heroCard: {
    borderRadius: 22,
    backgroundColor: '#DCEFE7',
    overflow: 'hidden',
    minHeight: 185,
    position: 'relative',
    justifyContent: 'center',
  },
  heroImage: {
    position: 'absolute',
    right: -25,
    top: 0,
    bottom: 0,
    width: '62%',
    height: '100%',
  },
  heroGradientOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '65%',
    backgroundColor: '#DCEFE7',
    opacity: 0.95,
  },
  heroContent: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    width: '74%',
    gap: 4,
  },
  heroTagline: {
    fontSize: 11,
    fontWeight: '700',
    color: '#176B57',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  heroGreeting: {
    fontSize: 25,
    fontWeight: '800',
    color: '#102B2A',
    lineHeight: 29,
  },
  heroDescription: {
    fontSize: 13,
    color: '#4B625E',
    lineHeight: 17,
    marginTop: 4,
    marginBottom: 8,
  },
  findCourtButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#114D3F',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    gap: 8,
    shadowColor: '#114D3F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  findCourtButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  findCourtButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // Section Headers
  sectionContainer: {
    gap: 11,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#102B2A',
    letterSpacing: -0.2,
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#176F5B',
  },

  // Cards Generic
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },

  // Your Next Booking Card
  bookingCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2ECE6',
    shadowColor: '#102B2A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    gap: 14,
  },
  datePanel: {
    width: 80,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#EDF7F2',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  dateDayOfWeek: {
    fontSize: 11,
    fontWeight: '700',
    color: '#718580',
    letterSpacing: 0.5,
  },
  dateDayNumber: {
    fontSize: 27,
    fontWeight: '800',
    color: '#102B2A',
    lineHeight: 31,
  },
  dateMonthYear: {
    fontSize: 10,
    fontWeight: '700',
    color: '#718580',
    letterSpacing: 0.5,
  },
  dateDivider: {
    width: 1,
    height: '80%',
    backgroundColor: '#EDF2EF',
  },
  bookingDetailsCol: {
    flex: 1,
    gap: 4,
  },
  bookingTypeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102B2A',
    marginBottom: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12.5,
    color: '#556965',
    flex: 1,
  },
  bookingBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  confirmedPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#E6F5EC',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
  },
  confirmedPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#167B48',
  },
  pricePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  pricePillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#15803D',
  },
  chevronSlot: {
    paddingLeft: 4,
  },

  // Upcoming Event Card
  eventCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2ECE6',
    shadowColor: '#102B2A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    gap: 12,
  },
  eventThumbnail: {
    width: 98,
    height: 80,
    borderRadius: 12,
  },
  eventContentCol: {
    flex: 1,
    gap: 4,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102B2A',
  },
  eventBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  eventBadgeBlue: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  eventBadgeBlueText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
  },
  eventBadgeGreen: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  eventBadgeGreenText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  eventBadgeLightBlue: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  eventBadgeLightBlueText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },

  // Recent Activity Card
  activityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2ECE6',
    shadowColor: '#102B2A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  activityRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F5F2',
  },
  activityRowPressed: {
    backgroundColor: '#F8FAF9',
  },
  activityIconPill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  activityPillGreen: {
    backgroundColor: '#E6F7ED',
  },
  activityPillRed: {
    backgroundColor: '#FEE2E2',
  },
  activityPillPurple: {
    backgroundColor: '#F3E8FF',
  },
  activityPillBlue: {
    backgroundColor: '#E0F2FE',
  },
  activityTextCol: {
    flex: 1,
    gap: 2,
  },
  activityTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#102B2A',
  },
  activityDesc: {
    fontSize: 12,
    color: '#64748B',
  },
  activityMetaCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activityTimeText: {
    fontSize: 11,
    color: '#8A9996',
    fontWeight: '500',
  },

  // Discover More Card
  discoverCard: {
    flexDirection: 'row',
    backgroundColor: '#EBF6F1',
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D7ECE1',
    gap: 14,
  },
  discoverIconPill: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#D6EFE3',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  discoverTextCol: {
    flex: 1,
    gap: 3,
  },
  discoverTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102B2A',
  },
  discoverDescription: {
    fontSize: 12,
    color: '#526662',
    lineHeight: 16.5,
  },
});
