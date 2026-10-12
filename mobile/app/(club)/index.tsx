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
  AlertCircle,
  ArrowRight,
  Bell,
  Calendar,
  CalendarDays,
  CalendarHeart,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  Crown,
  LayoutGrid,
  MapPin,
  Menu,
  ShieldCheck,
  Star,
  Trophy,
  Users,
} from 'lucide-react-native';

import { AppText, ClubHeroCarousel } from '@/components';
import {
  useActiveClub,
  useClubDashboard,
  usePermission,
  useUnreadNotificationCount,
} from '@/hooks';
import { useDrawerStore } from '@/navigation';

export default function ClubHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const openDrawer = useDrawerStore((s) => s.openDrawer);

  const { clubId, clubName } = useActiveClub();
  const { canManagePayments } = usePermission();
  const { data: unreadNotifsCount } = useUnreadNotificationCount();

  // Real server-aggregated dashboard query
  const { dashboard, refetch: refetchDashboard } = useClubDashboard(clubId);

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetchDashboard();
    setRefreshing(false);
  };

  // Compute counts directly from server-aggregated dashboard data
  const totalPlayers = dashboard?.memberships?.total_players ?? 0;
  const activePlayers = dashboard?.memberships?.active_players ?? 0;
  const pendingRequests = dashboard?.memberships?.pending_requests ?? 0;
  const todayBookings = dashboard?.bookings?.today_count ?? 0;
  const upcomingBookings = dashboard?.bookings?.upcoming_count ?? 0;
  const upcomingTournaments = dashboard?.competitions?.upcoming_tournaments ?? 0;
  const upcomingLeagues = dashboard?.competitions?.upcoming_leagues ?? 0;
  const upcomingEvents = dashboard?.events_and_lessons?.upcoming_events ?? 0;
  const upcomingLessons = dashboard?.events_and_lessons?.upcoming_lessons ?? 0;
  const activeStaff = dashboard?.staff?.active_staff ?? 0;

  // Today's schedule item from real event/lesson data
  const todayItem = useMemo(() => {
    const raw = dashboard?.events_and_lessons?.today_item;
    if (!raw) return null;
    let timeStr = 'All Day';
    try {
      const s = new Date(raw.start_at);
      const e = new Date(raw.end_at);
      timeStr = `${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      timeStr = raw.start_at;
    }

    return {
      title: raw.title,
      status: raw.status_label || (raw.status === 'published' ? 'Happening Now' : 'Upcoming'),
      time: timeStr,
      courts: raw.location || 'Club Courts',
      capacity: raw.capacity
        ? `${raw.registered_count ?? 0} / ${raw.capacity}`
        : `${raw.registered_count ?? 0} registered`,
    };
  }, [dashboard]);

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
              Let's make today amazing at {clubName || 'your club'}.
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
            <AppText style={styles.monthSelectorText}>Real-Time Metrics</AppText>
          </View>
        </View>

        {/* Primary Operational Stat Cards */}
        <View style={styles.statsRow}>
          {/* Members */}
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/(club)/members' as any)}
            activeOpacity={0.8}
            accessibilityLabel="Club Members"
          >
            <View style={[styles.statIconSlot, { backgroundColor: '#E8F5EE' }]}>
              <Users size={15} color="#18794E" strokeWidth={2.2} />
            </View>
            <AppText style={styles.statNumber}>{totalPlayers}</AppText>
            <AppText style={styles.statLabel} numberOfLines={1}>
              {activePlayers} Active Players
            </AppText>
          </TouchableOpacity>

          {/* Bookings */}
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/(club)/bookings' as any)}
            activeOpacity={0.8}
            accessibilityLabel="Court Bookings"
          >
            <View style={[styles.statIconSlot, { backgroundColor: '#E7F0FB' }]}>
              <Calendar size={15} color="#1E40AF" strokeWidth={2.2} />
            </View>
            <AppText style={styles.statNumber}>{todayBookings}</AppText>
            <AppText style={styles.statLabel} numberOfLines={1}>
              {upcomingBookings} Upcoming
            </AppText>
          </TouchableOpacity>

          {/* Competitions */}
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/(club)/tournaments' as any)}
            activeOpacity={0.8}
            accessibilityLabel="Competitions"
          >
            <View style={[styles.statIconSlot, { backgroundColor: '#FEF3EB' }]}>
              <Trophy size={15} color="#D97706" strokeWidth={2.2} />
            </View>
            <AppText style={styles.statNumber}>{upcomingTournaments}</AppText>
            <AppText style={styles.statLabel} numberOfLines={1}>
              {upcomingLeagues} Leagues
            </AppText>
          </TouchableOpacity>

          {/* Staff Members */}
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/(club)/members' as any)}
            activeOpacity={0.8}
            accessibilityLabel="Staff Members"
          >
            <View style={[styles.statIconSlot, { backgroundColor: '#F3EFFB' }]}>
              <ShieldCheck size={15} color="#7C3AED" strokeWidth={2.2} />
            </View>
            <AppText style={styles.statNumber}>{activeStaff}</AppText>
            <AppText style={styles.statLabel} numberOfLines={1}>
              Staff Active
            </AppText>
          </TouchableOpacity>
        </View>

        {/* Secondary Row for Payments & Community (if caller has payment permissions) */}
        {canManagePayments && dashboard?.payments && (
          <View style={[styles.statsRow, { marginTop: 10 }]}>
            {/* Payments */}
            <TouchableOpacity
              style={[styles.statCard, { flex: 2 }]}
              onPress={() => router.push('/(club)/payments' as any)}
              activeOpacity={0.8}
              accessibilityLabel="Payments"
            >
              <View style={[styles.statIconSlot, { backgroundColor: '#FEF2F2' }]}>
                <CreditCard size={15} color="#DC2626" strokeWidth={2.2} />
              </View>
              <AppText style={styles.statNumber}>
                {dashboard.payments.pending_count > 0
                  ? `₹${dashboard.payments.pending_amount}`
                  : `₹${dashboard.payments.total_revenue}`}
              </AppText>
              <AppText style={styles.statLabel} numberOfLines={1}>
                {dashboard.payments.pending_count > 0
                  ? `${dashboard.payments.pending_count} Pending Payments`
                  : `${dashboard.payments.succeeded_count} Succeeded Payments`}
              </AppText>
            </TouchableOpacity>

            {/* Events & Lessons */}
            <TouchableOpacity
              style={[styles.statCard, { flex: 2 }]}
              onPress={() => router.push('/(club)/events' as any)}
              activeOpacity={0.8}
              accessibilityLabel="Events & Lessons"
            >
              <View style={[styles.statIconSlot, { backgroundColor: '#FCE7F3' }]}>
                <Star size={15} color="#DB2777" strokeWidth={2.2} />
              </View>
              <AppText style={styles.statNumber}>{upcomingEvents}</AppText>
              <AppText style={styles.statLabel} numberOfLines={1}>
                Events ({upcomingLessons} Lessons)
              </AppText>
            </TouchableOpacity>
          </View>
        )}
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
  pendingAlertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 10,
    marginTop: 4,
    marginBottom: 4,
  },
  pendingAlertIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingAlertTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  pendingAlertSubtitle: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 1,
  },
});
