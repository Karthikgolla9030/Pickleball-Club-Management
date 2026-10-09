/**
 * Aught2 Pickleball — Club Management Home Screen
 *
 * Exact reference implementation (Screen 1 of reference):
 *   - Top header:
 *       * Left: AUGHT2 PICKLEBALL logo (compact, aligned, original proportions)
 *       * Right: Menu button '☰' (opens navigation drawer) & Notification bell '🔔' with indicator dot
 *       * NO "Demo Owner" / "Club Owner" at top
 *       * NO hamburger dominating or misplaced
 *   - Welcome message:
 *       * "Welcome back,"
 *       * "Let's make today amazing at Aught2." on ONE LINE whenever device width allows
 *       * Right capsule pill: MapPin + "Good People \n Great Games"
 *   - Premium Pickleball Hero Banner:
 *       * 'AUGHT2 PICKLEBALL' tag
 *       * 'Play Together \n Grow Stronger' title
 *       * 'Great courts. Active members. \n A healthier, happier community.'
 *       * 'Book a Court →' white pill CTA button
 *       * Carousel dots (● ○ ○)
 *       * Script text: 'Same Game Bigger Community'
 *   - 3 × 2 Quick Action Grid:
 *       * Members, Courts, Bookings, Memberships, Events, Tournaments
 *       * Clean white cards with squircle colored icons & chevron arrows
 *   - Today's Schedule Card:
 *       * Player thumbnail image, 'Beginner Pickleball Clinic', '● Happening Now',
 *         '◷ 10:00 – 11:30', '📍 Courts 2–3', '👥 2 / 8', 'View All →'
 *   - Club Overview with 4 compact stat cards in a single row:
 *       * 17 Total Members | 12 Bookings | 5 Events | 12 Tournaments
 *   - Bottom navigation integration with safe area insets
 */

import React, { useMemo, useState } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowRight,
  Bell,
  Calendar,
  CalendarDays,
  CalendarHeart,
  ChevronDown,
  ChevronRight,
  Clock,
  Crown,
  LayoutGrid,
  MapPin,
  Menu,
  Star,
  Trophy,
  Users,
} from 'lucide-react-native';

import { AppText, ClubHeroCarousel } from '@/components';
import {
  useActiveClub,
  useClubEvents,
  useClubPlayerMembers,
  useClubStaffBookings,
  useClubTournaments,
  useUnreadNotificationCount,
} from '@/hooks';
import { useDrawerStore } from '@/navigation';

export default function ClubHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const openDrawer = useDrawerStore((s) => s.openDrawer);

  const { clubId } = useActiveClub();
  const { data: unreadNotifsCount } = useUnreadNotificationCount();

  // Real data queries
  const { playerMembers, refetch: refetchMembers } = useClubPlayerMembers(clubId);
  const { bookings, refetch: refetchBookings } = useClubStaffBookings(clubId);
  const { data: eventsData, refetch: refetchEvents } = useClubEvents(clubId || '');
  const { tournaments, refetch: refetchTournaments } = useClubTournaments(clubId);

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchMembers(),
      refetchBookings(),
      refetchEvents(),
      refetchTournaments(),
    ]);
    setRefreshing(false);
  };

  // Compute counts directly from real API queries (no hardcoded fallback values)
  const memberCount = playerMembers?.length ?? 0;
  const bookingCount = bookings?.length ?? 0;
  const eventCount = eventsData?.length ?? 0;
  const tournamentCount = tournaments?.length ?? 0;

  // Today's schedule item from real event data (null if none exist)
  const todayItem = useMemo(() => {
    if (!eventsData || eventsData.length === 0) {
      return null;
    }
    const activeEvent = eventsData.find((e) => e.status === 'published') || eventsData[0];
    let timeStr = 'All Day';
    try {
      const s = new Date(activeEvent.start_at);
      const e = new Date(activeEvent.end_at);
      timeStr = `${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      timeStr = activeEvent.start_at;
    }

    return {
      title: activeEvent.title,
      status: activeEvent.status_label || (activeEvent.status === 'published' ? 'Happening Now' : 'Upcoming'),
      time: timeStr,
      courts: activeEvent.location || 'Club Courts',
      capacity: activeEvent.capacity
        ? `${activeEvent.registered_count ?? 0} / ${activeEvent.capacity}`
        : `${activeEvent.registered_count ?? 0} registered`,
    };
  }, [eventsData]);

  return (
    <View style={styles.screenWrapper}>
      {/* 1. FIXED TOP HEADER: LOGO ON LEFT, MENU & NOTIFICATION ON RIGHT */}
      <View
        style={[
          styles.topHeaderRow,
          {
            paddingTop: Math.max(insets.top, 16) + 10,
            paddingBottom: 14,
          },
        ]}
      >
        {/* Left: Aught2 Pickleball Logo */}
        <View style={styles.logoSlot}>
          <Image
            source={require('../../assets/aught2_pickleball_logo.png')}
            style={styles.headerLogoImage}
            resizeMode="contain"
          />
        </View>

        {/* Right: Menu & Notification Action Buttons */}
        <View style={styles.headerActionsGroup}>
          {/* Menu Drawer Button */}
          <TouchableOpacity
            style={styles.iconCircleBtn}
            onPress={openDrawer}
            activeOpacity={0.75}
            accessibilityLabel="Open Navigation Menu"
            accessibilityRole="button"
          >
            <Menu size={19} color="#2A4540" strokeWidth={2.3} />
          </TouchableOpacity>

          {/* Notification Bell Button */}
          <TouchableOpacity
            style={styles.iconCircleBtn}
            onPress={() => router.push('/(club)/notifications' as any)}
            activeOpacity={0.75}
            accessibilityLabel="View Notifications"
            accessibilityRole="button"
          >
            <Bell size={19} color="#2A4540" strokeWidth={2.3} />
            {(unreadNotifsCount ?? 0) > 0 && <View style={styles.notificationDot} />}
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. SCROLLABLE HOME CONTENT */}
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: 12,
            paddingBottom: insets.bottom + 95,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#176F5B"
          />
        }
      >

        {/* 2. WELCOME SECTION + LOCATION PILL */}
        <View style={styles.welcomeRow}>
          <View style={styles.welcomeTextCol}>
            <AppText style={styles.welcomeSub}>Welcome back,</AppText>
            <AppText
              style={styles.welcomeMain}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              Let's make today amazing at Aught2.
            </AppText>
          </View>

          {/* Right Location Tag Pill */}
          <View style={styles.locationPill}>
            <MapPin size={13} color="#18794E" strokeWidth={2.4} />
            <View style={styles.locationTextStack}>
              <AppText style={styles.locationTitle}>Good People</AppText>
              <AppText style={styles.locationSubtitle}>Great Games</AppText>
            </View>
          </View>
        </View>

        {/* 3. HERO BANNER CAROUSEL (3 Banners, Touch Swiping, Interactive Dots) */}
        <ClubHeroCarousel />

        {/* 4. QUICK ACTIONS SECTION (2 Rows × 3 Columns) */}
        <View style={styles.sectionHeaderRow}>
          <AppText style={styles.sectionTitle}>Quick Actions</AppText>
          <TouchableOpacity
            onPress={() => router.push('/(club)/courts' as any)}
            hitSlop={8}
          >
            <AppText style={styles.viewAllLink}>View All →</AppText>
          </TouchableOpacity>
        </View>

        <View style={styles.quickGrid}>
          {/* 1. Members */}
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/(club)/members' as any)}
            activeOpacity={0.8}
            accessibilityLabel="Members"
          >
            <View style={[styles.quickIconBox, { backgroundColor: '#E8F5EE' }]}>
              <Users size={18} color="#18794E" strokeWidth={2.2} />
            </View>
            <View style={styles.quickLabelRow}>
              <AppText style={styles.quickLabel}>Members</AppText>
              <ChevronRight size={13} color="#9CAAA5" strokeWidth={2} />
            </View>
          </TouchableOpacity>

          {/* 2. Courts */}
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/(club)/courts' as any)}
            activeOpacity={0.8}
            accessibilityLabel="Courts"
          >
            <View style={[styles.quickIconBox, { backgroundColor: '#E7F0FB' }]}>
              <LayoutGrid size={18} color="#1E40AF" strokeWidth={2.2} />
            </View>
            <View style={styles.quickLabelRow}>
              <AppText style={styles.quickLabel}>Courts</AppText>
              <ChevronRight size={13} color="#9CAAA5" strokeWidth={2} />
            </View>
          </TouchableOpacity>

          {/* 3. Bookings */}
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/(club)/bookings' as any)}
            activeOpacity={0.8}
            accessibilityLabel="Bookings"
          >
            <View style={[styles.quickIconBox, { backgroundColor: '#FEF3EB' }]}>
              <CalendarDays size={18} color="#D97706" strokeWidth={2.2} />
            </View>
            <View style={styles.quickLabelRow}>
              <AppText style={styles.quickLabel}>Bookings</AppText>
              <ChevronRight size={13} color="#9CAAA5" strokeWidth={2} />
            </View>
          </TouchableOpacity>

          {/* 4. Memberships */}
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/(club)/memberships' as any)}
            activeOpacity={0.8}
            accessibilityLabel="Memberships"
          >
            <View style={[styles.quickIconBox, { backgroundColor: '#F3EFFB' }]}>
              <Crown size={18} color="#7C3AED" strokeWidth={2.2} />
            </View>
            <View style={styles.quickLabelRow}>
              <AppText style={styles.quickLabel}>Memberships</AppText>
              <ChevronRight size={13} color="#9CAAA5" strokeWidth={2} />
            </View>
          </TouchableOpacity>

          {/* 5. Events */}
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/(club)/events' as any)}
            activeOpacity={0.8}
            accessibilityLabel="Events"
          >
            <View style={[styles.quickIconBox, { backgroundColor: '#FCE7F3' }]}>
              <CalendarHeart size={18} color="#DB2777" strokeWidth={2.2} />
            </View>
            <View style={styles.quickLabelRow}>
              <AppText style={styles.quickLabel}>Events</AppText>
              <ChevronRight size={13} color="#9CAAA5" strokeWidth={2} />
            </View>
          </TouchableOpacity>

          {/* 6. Tournaments */}
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/(club)/tournaments' as any)}
            activeOpacity={0.8}
            accessibilityLabel="Tournaments"
          >
            <View style={[styles.quickIconBox, { backgroundColor: '#E6F7F5' }]}>
              <Trophy size={18} color="#0D9488" strokeWidth={2.2} />
            </View>
            <View style={styles.quickLabelRow}>
              <AppText style={styles.quickLabel}>Tournaments</AppText>
              <ChevronRight size={13} color="#9CAAA5" strokeWidth={2} />
            </View>
          </TouchableOpacity>
        </View>

        {/* 5. TODAY'S SCHEDULE SECTION */}
        <View style={styles.sectionHeaderRow}>
          <AppText style={styles.sectionTitle}>Today's Schedule</AppText>
          <TouchableOpacity
            onPress={() => router.push('/(club)/events' as any)}
            hitSlop={8}
          >
            <AppText style={styles.viewAllLink}>View All →</AppText>
          </TouchableOpacity>
        </View>

        {todayItem ? (
          <TouchableOpacity
            style={styles.scheduleCard}
            onPress={() => router.push('/(club)/events' as any)}
            activeOpacity={0.85}
            accessibilityLabel={`Event: ${todayItem.title}`}
          >
            {/* Event thumbnail photo */}
            <Image
              source={require('../../assets/events/clinic_thumbnail.jpg')}
              style={styles.scheduleThumb}
              resizeMode="cover"
            />

            <View style={styles.scheduleContent}>
              <AppText style={styles.scheduleTitle} numberOfLines={1}>
                {todayItem.title}
              </AppText>

              {/* Status Pill Badge */}
              <View style={styles.scheduleBadgePill}>
                <View style={styles.scheduleBadgeDot} />
                <AppText style={styles.scheduleBadgeText}>{todayItem.status}</AppText>
              </View>

              {/* Meta Info Row */}
              <View style={styles.scheduleMetaRow}>
                <View style={styles.scheduleMetaItem}>
                  <Clock size={11} color="#667773" />
                  <AppText style={styles.scheduleMetaText}>{todayItem.time}</AppText>
                </View>

                <View style={styles.scheduleMetaItem}>
                  <MapPin size={11} color="#667773" />
                  <AppText style={styles.scheduleMetaText}>{todayItem.courts}</AppText>
                </View>

                <View style={styles.scheduleMetaItem}>
                  <Users size={11} color="#667773" />
                  <AppText style={styles.scheduleMetaText}>{todayItem.capacity}</AppText>
                </View>
              </View>
            </View>

            {/* Right Chevron */}
            <ChevronRight size={16} color="#9CAAA5" strokeWidth={2} />
          </TouchableOpacity>
        ) : (
          <View style={styles.emptyScheduleCard}>
            <View style={styles.emptyScheduleIconBox}>
              <Calendar size={18} color="#667773" />
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={styles.emptyScheduleTitle}>No events scheduled today</AppText>
              <AppText style={styles.emptyScheduleSubtitle}>Plan a clinic, tournament, or open play</AppText>
            </View>
            <TouchableOpacity
              style={styles.emptyScheduleBtn}
              onPress={() => router.push('/(club)/events' as any)}
              activeOpacity={0.8}
            >
              <AppText style={styles.emptyScheduleBtnText}>Create +</AppText>
            </TouchableOpacity>
          </View>
        )}

        {/* 6. CLUB OVERVIEW SECTION */}
        <View style={styles.sectionHeaderRow}>
          <AppText style={styles.sectionTitle}>Club Overview</AppText>
          <View style={styles.monthSelectorPill}>
            <AppText style={styles.monthSelectorText}>This Month</AppText>
            <ChevronDown size={13} color="#667773" />
          </View>
        </View>

        {/* 4 Compact Stat Cards in a Single Row */}
        <View style={styles.statsRow}>
          {/* Members */}
          <View style={styles.statCard}>
            <View style={[styles.statIconSlot, { backgroundColor: '#E8F5EE' }]}>
              <Users size={15} color="#18794E" strokeWidth={2.2} />
            </View>
            <AppText style={styles.statNumber}>{memberCount}</AppText>
            <AppText style={styles.statLabel} numberOfLines={1}>
              Total Members
            </AppText>
          </View>

          {/* Bookings */}
          <View style={styles.statCard}>
            <View style={[styles.statIconSlot, { backgroundColor: '#E7F0FB' }]}>
              <Calendar size={15} color="#1E40AF" strokeWidth={2.2} />
            </View>
            <AppText style={styles.statNumber}>{bookingCount}</AppText>
            <AppText style={styles.statLabel} numberOfLines={1}>
              Bookings
            </AppText>
          </View>

          {/* Events */}
          <View style={styles.statCard}>
            <View style={[styles.statIconSlot, { backgroundColor: '#F3EFFB' }]}>
              <Star size={15} color="#7C3AED" strokeWidth={2.2} />
            </View>
            <AppText style={styles.statNumber}>{eventCount}</AppText>
            <AppText style={styles.statLabel} numberOfLines={1}>
              Events
            </AppText>
          </View>

          {/* Tournaments */}
          <View style={styles.statCard}>
            <View style={[styles.statIconSlot, { backgroundColor: '#FEF3EB' }]}>
              <Trophy size={15} color="#D97706" strokeWidth={2.2} />
            </View>
            <AppText style={styles.statNumber}>{tournamentCount}</AppText>
            <AppText style={styles.statLabel} numberOfLines={1}>
              Tournaments
            </AppText>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: '#F4F8F6',
  },
  container: {
    paddingHorizontal: 16,
    gap: 13,
  },

  // 1. Top Header Row (Fixed/Sticky at Top)
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#F4F8F6',
    zIndex: 10,
  },
  logoSlot: {
    justifyContent: 'center',
  },
  headerLogoImage: {
    width: 96,
    height: 40,
  },
  headerActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderColor: '#E2ECE7',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#102F2B',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1.5,
  },
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EF4444',
    borderWidth: 1.2,
    borderColor: '#FFFFFF',
  },

  // 2. Welcome Section
  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 2,
    marginBottom: 2,
  },
  welcomeTextCol: {
    flex: 1,
    gap: 1,
  },
  welcomeSub: {
    fontSize: 13,
    color: '#667773',
    fontWeight: '400',
  },
  welcomeMain: {
    fontSize: 17,
    fontWeight: '700',
    color: '#102F2B',
    letterSpacing: -0.2,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E6F5EE',
    borderColor: '#D0EADB',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 9,
    paddingVertical: 5,
    flexShrink: 0,
  },
  locationTextStack: {
    gap: 0.5,
  },
  locationTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#18794E',
    lineHeight: 12,
  },
  locationSubtitle: {
    fontSize: 10,
    fontWeight: '500',
    color: '#18794E',
    lineHeight: 12,
  },


  // 4. Section Header Row
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102F2B',
  },
  viewAllLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#176F5B',
  },

  // Quick Actions Grid (2 rows × 3 cols)
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickCard: {
    width: '31%',
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderColor: '#E5EFE9',
    borderWidth: 1,
    padding: 12,
    justifyContent: 'space-between',
    minHeight: 88,
    shadowColor: '#102F2B',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1.5,
  },
  quickIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  quickLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quickLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#12231E',
  },

  // 5. Today's Schedule Card
  scheduleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderColor: '#E5EFE9',
    borderWidth: 1,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#102F2B',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1.5,
  },
  scheduleThumb: {
    width: 62,
    height: 58,
    borderRadius: 10,
  },
  scheduleContent: {
    flex: 1,
    paddingHorizontal: 10,
    gap: 4,
  },
  scheduleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102F2B',
  },
  scheduleBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E6F5EE',
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  scheduleBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  scheduleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#176F5B',
  },
  scheduleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 1,
  },
  scheduleMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
  },
  scheduleMetaText: {
    fontSize: 11,
    color: '#667773',
    fontWeight: '500',
  },

  // 6. Club Overview
  monthSelectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderColor: '#E2ECE7',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  monthSelectorText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#667773',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderColor: '#E5EFE9',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#102F2B',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1.5,
  },
  statIconSlot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  statNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: '#102F2B',
  },
  statLabel: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#667773',
    textAlign: 'center',
  },
  emptyScheduleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6ECE9',
    gap: 12,
  },
  emptyScheduleIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F0F5F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyScheduleTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#102F2B',
  },
  emptyScheduleSubtitle: {
    fontSize: 11,
    color: '#667773',
    marginTop: 2,
  },
  emptyScheduleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#E8F5EE',
    borderRadius: 8,
  },
  emptyScheduleBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#18794E',
  },
});
