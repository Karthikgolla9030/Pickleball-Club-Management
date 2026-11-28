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
  AlertTriangle,
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
  Medal,
  Menu,
  Plus,
  ShieldCheck,
  Star,
  Trophy,
  User,
  Users,
} from 'lucide-react-native';

import { AppText, ClubHeroCarousel } from '@/components';
import {
  useActiveClub,
  useClubCourts,
  useClubDashboard,
  useClubLeagues,
  useClubTournaments,
  usePermission,
  usePlatformBranding,
  useUnreadNotificationCount,
} from '@/hooks';
import { useDrawerStore } from '@/navigation';
import { formatCurrency, resolveMediaUrl } from '@/utils';
import { getTournamentRegistrationMetrics } from '@/utils/tournamentCapacity';

export default function ClubHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const openDrawer = useDrawerStore((s) => s.openDrawer);

  const { clubId, clubName } = useActiveClub();
  const { platformName, maintenanceMode } = usePlatformBranding();
  const permissions = usePermission();
  const { canManagePayments } = permissions;
  const isTournamentDirector =
    permissions.isTournamentDirector ||
    (!permissions.canManageBookings &&
      !permissions.canManageMembers &&
      !permissions.canManageClub &&
      (permissions.canManageTournaments || permissions.canManageLeagues));
  const { data: unreadNotifsCount } = useUnreadNotificationCount();

  // Real server-aggregated dashboard query
  const { dashboard, refetch: refetchDashboard } = useClubDashboard(clubId);
  const { tournaments: tdTournaments = [], refetch: refetchTdTournaments } = useClubTournaments(
    isTournamentDirector ? clubId : null
  );
  const { data: tdLeagues = [], refetch: refetchTdLeagues } = useClubLeagues(
    isTournamentDirector ? clubId : null
  );
  const { data: tdActiveCourts = [], refetch: refetchTdCourts } = useClubCourts(
    isTournamentDirector ? clubId : null,
    'active'
  );

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    const tasks: Promise<unknown>[] = [refetchDashboard()];
    if (isTournamentDirector) {
      tasks.push(refetchTdTournaments(), refetchTdLeagues(), refetchTdCourts());
    }
    await Promise.all(tasks);
    setRefreshing(false);
  };

  // TD-specific featured competition & metrics
  const featuredCompetition = useMemo(() => {
    if (!isTournamentDirector) return null;
    const priorityStatuses = ['in_progress', 'registration_open', 'registration_closed', 'draft'];
    const sorted = [...tdTournaments].sort((a, b) => {
      const aRank = priorityStatuses.indexOf(a.status);
      const bRank = priorityStatuses.indexOf(b.status);
      return (aRank === -1 ? 99 : aRank) - (bRank === -1 ? 99 : bRank);
    });
    const first = sorted[0];
    if (!first) return null;

    let route = '/club-portal/tournaments';
    if (first.format === 'scramble') route = `/club-portal/scramble?tournamentId=${first.id}`;
    else if (first.format === 'bracket') route = `/club-portal/bracket?tournamentId=${first.id}`;
    else if (first.format === 'pool_play') route = `/club-portal/pool-play?tournamentId=${first.id}`;
    else if (first.format === 'round_robin') route = `/club-portal/round-robin?tournamentId=${first.id}`;
    else route = `/club-portal/tournament-details?tournamentId=${first.id}`;

    const statusLabel =
      first.status === 'in_progress'
        ? 'In Progress'
        : first.status === 'registration_open'
          ? 'Registration Open'
          : first.status === 'registration_closed'
            ? 'Registration Closed'
            : first.status === 'completed'
              ? 'Completed'
              : 'Draft';

    const regMetrics = getTournamentRegistrationMetrics(first);
    const participantsLabel = regMetrics.maxCount != null
      ? `${regMetrics.registeredCount} / ${regMetrics.maxCount} ${regMetrics.registeredLabel}`
      : `${regMetrics.registeredCount} ${regMetrics.registeredLabel}`;

    return {
      title: first.name,
      statusLabel,
      formatLabel: first.format_label || first.format.replace(/_/g, ' '),
      dateLabel: first.start_date
        ? new Date(first.start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : 'TBD',
      participantsLabel,
      playersBreakdownLabel: regMetrics.playersBreakdownText,
      route,
    };
  }, [isTournamentDirector, tdTournaments]);

  const tdLiveTournamentsCount = tdTournaments.filter((t) => t.status === 'in_progress').length;
  const tdOpenRegCount =
    tdTournaments.filter((t) => t.status === 'registration_open').length +
    tdLeagues.filter((l) => l.status === 'registration_open').length;
  const tdLiveLeaguesCount = tdLeagues.filter(
    (l) => l.status === 'in_progress' || l.status === 'playoffs'
  ).length;

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
      imageUrl: ((raw as any)?.cover_image_url || (raw as any)?.image_url || null) as string | null,
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
            source={require('../../assets/pickleball_logo_transparent.png')}
            style={styles.headerLogoImage}
            resizeMode="contain"
            accessibilityLabel={platformName || 'Platform'}
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
            onPress={() => router.push('/club-portal/notifications' as any)}
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
            tintColor="#176B57"
          />
        }
      >
        {/* 0. PLATFORM MAINTENANCE NOTICE */}
        {maintenanceMode && (
          <View style={styles.maintenanceBanner}>
            <AlertTriangle size={18} color="#B45309" strokeWidth={2.2} />
            <View style={styles.maintenanceBannerTextCol}>
              <AppText style={styles.maintenanceBannerTitle}>Platform Maintenance in Progress</AppText>
              <AppText style={styles.maintenanceBannerSub}>
                Scheduled infrastructure operations are underway. Some services may experience temporary delays.
              </AppText>
            </View>
          </View>
        )}

        {/* 2. WELCOME SECTION + LOCATION PILL */}
        <View style={styles.welcomeRow}>
          <View style={styles.welcomeTextCol}>
            <AppText style={styles.welcomeSub}>Welcome back,</AppText>
            <AppText style={styles.welcomeMain}>
              Let's make today amazing
            </AppText>
          </View>

          {/* Right Location Tag Pill */}
          <View style={styles.locationPill}>
            <MapPin size={13} color="#18794E" strokeWidth={2.4} />
            <View style={styles.locationTextStack}>
              <AppText style={styles.locationTitle}>
                {isTournamentDirector ? clubName || 'Competition' : 'Good People'}
              </AppText>
              <AppText style={styles.locationSubtitle}>
                {isTournamentDirector ? 'Tournament Director' : 'Great Games'}
              </AppText>
            </View>
          </View>
        </View>

        {/* 3. HERO BANNER CAROUSEL (3 Banners, Touch Swiping, Interactive Dots) */}
        <ClubHeroCarousel />

        {isTournamentDirector ? (
          <>
            {/* TD 4. QUICK ACTIONS SECTION */}
            <View style={styles.sectionHeaderRow}>
              <AppText style={styles.sectionTitle}>Quick Actions</AppText>
              <TouchableOpacity
                onPress={() => router.push('/club-portal/tournaments' as any)}
                hitSlop={8}
              >
                <AppText style={styles.viewAllLink}>View All →</AppText>
              </TouchableOpacity>
            </View>

            <View style={styles.quickGrid}>
              <TouchableOpacity
                style={styles.quickCard}
                onPress={() => router.push('/club-portal/tournaments' as any)}
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

              <TouchableOpacity
                style={styles.quickCard}
                onPress={() => router.push('/club-portal/leagues' as any)}
                activeOpacity={0.8}
                accessibilityLabel="Leagues"
              >
                <View style={[styles.quickIconBox, { backgroundColor: '#FEF3EB' }]}>
                  <Medal size={18} color="#D97706" strokeWidth={2.2} />
                </View>
                <View style={styles.quickLabelRow}>
                  <AppText style={styles.quickLabel}>Leagues</AppText>
                  <ChevronRight size={13} color="#9CAAA5" strokeWidth={2} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickCard}
                onPress={() => router.push('/club-portal/tournaments?create=true' as any)}
                activeOpacity={0.8}
                accessibilityLabel="New Tournament"
              >
                <View style={[styles.quickIconBox, { backgroundColor: '#E8F5EE' }]}>
                  <Plus size={18} color="#18794E" strokeWidth={2.2} />
                </View>
                <View style={styles.quickLabelRow}>
                  <AppText style={styles.quickLabel}>New Tourney</AppText>
                  <ChevronRight size={13} color="#9CAAA5" strokeWidth={2} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickCard}
                onPress={() => router.push('/club-portal/leagues?create=true' as any)}
                activeOpacity={0.8}
                accessibilityLabel="New League"
              >
                <View style={[styles.quickIconBox, { backgroundColor: '#F3EFFB' }]}>
                  <LayoutGrid size={18} color="#7C3AED" strokeWidth={2.2} />
                </View>
                <View style={styles.quickLabelRow}>
                  <AppText style={styles.quickLabel}>New League</AppText>
                  <ChevronRight size={13} color="#9CAAA5" strokeWidth={2} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickCard}
                onPress={() => router.push('/club-portal/profile' as any)}
                activeOpacity={0.8}
                accessibilityLabel="Profile"
              >
                <View style={[styles.quickIconBox, { backgroundColor: '#FCE7F3' }]}>
                  <User size={18} color="#DB2777" strokeWidth={2.2} />
                </View>
                <View style={styles.quickLabelRow}>
                  <AppText style={styles.quickLabel}>Profile</AppText>
                  <ChevronRight size={13} color="#9CAAA5" strokeWidth={2} />
                </View>
              </TouchableOpacity>
            </View>

            {/* TD 5. FEATURED / NEXT COMPETITION */}
            <View style={styles.sectionHeaderRow}>
              <AppText style={styles.sectionTitle}>Active Competition</AppText>
              <TouchableOpacity
                onPress={() => router.push('/club-portal/tournaments' as any)}
                hitSlop={8}
              >
                <AppText style={styles.viewAllLink}>View All →</AppText>
              </TouchableOpacity>
            </View>

            {featuredCompetition ? (
              <TouchableOpacity
                style={styles.scheduleCard}
                onPress={() => router.push(featuredCompetition.route as any)}
                activeOpacity={0.85}
                accessibilityLabel={`Competition: ${featuredCompetition.title}`}
              >
                <View style={styles.scheduleThumbFallback}>
                  <Trophy size={22} color="#18794E" strokeWidth={1.8} />
                </View>
                <View style={styles.scheduleContent}>
                  <AppText style={styles.scheduleTitle} numberOfLines={2}>
                    {featuredCompetition.title}
                  </AppText>
                  <View style={styles.scheduleBadgePill}>
                    <View style={styles.scheduleBadgeDot} />
                    <AppText style={styles.scheduleBadgeText}>{featuredCompetition.statusLabel}</AppText>
                  </View>
                  <View style={[styles.scheduleMetaRow, { flexWrap: 'wrap' }]}>
                    <View style={styles.scheduleMetaItem}>
                      <Clock size={11} color="#667773" />
                      <AppText style={styles.scheduleMetaText}>{featuredCompetition.dateLabel}</AppText>
                    </View>
                    <View style={styles.scheduleMetaItem}>
                      <Trophy size={11} color="#667773" />
                      <AppText style={styles.scheduleMetaText}>{featuredCompetition.formatLabel}</AppText>
                    </View>
                    <View style={styles.scheduleMetaItem}>
                      <Users size={11} color="#667773" />
                      <AppText style={styles.scheduleMetaText}>
                        {featuredCompetition.participantsLabel}
                        {featuredCompetition.playersBreakdownLabel
                          ? ` • ${featuredCompetition.playersBreakdownLabel}`
                          : ''}
                      </AppText>
                    </View>
                  </View>
                </View>
                <ChevronRight size={16} color="#9CAAA5" strokeWidth={2} />
              </TouchableOpacity>
            ) : (
              <View style={styles.emptyScheduleCard}>
                <View style={styles.emptyScheduleIconBox}>
                  <Trophy size={18} color="#667773" />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText style={styles.emptyScheduleTitle}>No upcoming tournaments yet</AppText>
                  <AppText style={styles.emptyScheduleSubtitle}>
                    Launch a Round Robin, Bracket, Pool Play, or Scramble event
                  </AppText>
                </View>
                <TouchableOpacity
                  style={styles.emptyScheduleBtn}
                  onPress={() => router.push('/club-portal/tournaments?create=true' as any)}
                  activeOpacity={0.8}
                >
                  <AppText style={styles.emptyScheduleBtnText}>Create +</AppText>
                </TouchableOpacity>
              </View>
            )}

            {/* TD 6. COMPETITION OVERVIEW */}
            <View style={styles.sectionHeaderRow}>
              <AppText style={styles.sectionTitle}>Competition Overview</AppText>
              <View style={styles.monthSelectorPill}>
                <AppText style={styles.monthSelectorText}>Real-Time Metrics</AppText>
              </View>
            </View>

            <View style={styles.statsRow}>
              <TouchableOpacity
                style={styles.statCard}
                onPress={() => router.push('/club-portal/tournaments' as any)}
                activeOpacity={0.8}
                accessibilityLabel="Club Tournaments"
              >
                <View style={[styles.statIconSlot, { backgroundColor: '#E6F7F5' }]}>
                  <Trophy size={15} color="#0D9488" strokeWidth={2.2} />
                </View>
                <AppText style={styles.statNumber}>{upcomingTournaments}</AppText>
                <AppText style={styles.statLabel} numberOfLines={2}>
                  {tdLiveTournamentsCount > 0 ? `${tdLiveTournamentsCount} Live Now` : `${tdTournaments.length} Total`}
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.statCard}
                onPress={() => router.push('/club-portal/leagues' as any)}
                activeOpacity={0.8}
                accessibilityLabel="Club Leagues"
              >
                <View style={[styles.statIconSlot, { backgroundColor: '#FEF3EB' }]}>
                  <Medal size={15} color="#D97706" strokeWidth={2.2} />
                </View>
                <AppText style={styles.statNumber}>{upcomingLeagues}</AppText>
                <AppText style={styles.statLabel} numberOfLines={2}>
                  {tdLiveLeaguesCount > 0 ? `${tdLiveLeaguesCount} Live Leagues` : `${tdLeagues.length} Total`}
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.statCard}
                onPress={() => router.push('/club-portal/tournaments' as any)}
                activeOpacity={0.8}
                accessibilityLabel="Open Registrations"
              >
                <View style={[styles.statIconSlot, { backgroundColor: '#E8F5EE' }]}>
                  <Users size={15} color="#18794E" strokeWidth={2.2} />
                </View>
                <AppText style={styles.statNumber}>{tdOpenRegCount}</AppText>
                <AppText style={styles.statLabel} numberOfLines={2}>
                  Open Registrations
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.statCard}
                onPress={() => router.push('/club-portal/tournaments' as any)}
                activeOpacity={0.8}
                accessibilityLabel="Available Courts"
              >
                <View style={[styles.statIconSlot, { backgroundColor: '#E7F0FB' }]}>
                  <LayoutGrid size={15} color="#1E40AF" strokeWidth={2.2} />
                </View>
                <AppText style={styles.statNumber}>{tdActiveCourts.length}</AppText>
                <AppText style={styles.statLabel} numberOfLines={2}>
                  Active Courts
                </AppText>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
        {/* 4. QUICK ACTIONS SECTION (2 Rows × 3 Columns) */}
        <View style={styles.sectionHeaderRow}>
          <AppText style={styles.sectionTitle}>Quick Actions</AppText>
          <TouchableOpacity
            onPress={() => router.push('/club-portal/courts' as any)}
            hitSlop={8}
          >
            <AppText style={styles.viewAllLink}>View All →</AppText>
          </TouchableOpacity>
        </View>

        <View style={styles.quickGrid}>
          {/* 1. Members */}
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push('/club-portal/members' as any)}
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
            onPress={() => router.push('/club-portal/courts' as any)}
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
            onPress={() => router.push('/club-portal/bookings' as any)}
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
            onPress={() => router.push('/club-portal/memberships' as any)}
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
            onPress={() => router.push('/club-portal/events' as any)}
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
            onPress={() => router.push('/club-portal/tournaments' as any)}
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
            onPress={() => router.push('/club-portal/events' as any)}
            hitSlop={8}
          >
            <AppText style={styles.viewAllLink}>View All →</AppText>
          </TouchableOpacity>
        </View>

        {todayItem ? (
          <TouchableOpacity
            style={styles.scheduleCard}
            onPress={() => router.push('/club-portal/events' as any)}
            activeOpacity={0.85}
            accessibilityLabel={`Event: ${todayItem.title}`}
          >
            {/* Event thumbnail photo */}
            {todayItem?.imageUrl ? (
              <Image
                source={{ uri: resolveMediaUrl(todayItem.imageUrl) }}
                style={styles.scheduleThumb}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.scheduleThumbFallback}>
                <Calendar size={22} color="#18794E" strokeWidth={1.8} />
              </View>
            )}

            <View style={styles.scheduleContent}>
              <AppText style={styles.scheduleTitle} numberOfLines={2}>
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
              onPress={() => router.push('/club-portal/events' as any)}
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
            onPress={() => router.push('/club-portal/members' as any)}
            activeOpacity={0.8}
            accessibilityLabel="Club Members"
          >
            <View style={[styles.statIconSlot, { backgroundColor: '#E8F5EE' }]}>
              <Users size={15} color="#18794E" strokeWidth={2.2} />
            </View>
            <AppText style={styles.statNumber}>{totalPlayers}</AppText>
            <AppText style={styles.statLabel} numberOfLines={2}>
              {activePlayers} Active Players
            </AppText>
          </TouchableOpacity>

          {/* Bookings */}
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/club-portal/bookings' as any)}
            activeOpacity={0.8}
            accessibilityLabel="Court Bookings"
          >
            <View style={[styles.statIconSlot, { backgroundColor: '#E7F0FB' }]}>
              <Calendar size={15} color="#1E40AF" strokeWidth={2.2} />
            </View>
            <AppText style={styles.statNumber}>{todayBookings}</AppText>
            <AppText style={styles.statLabel} numberOfLines={2}>
              {upcomingBookings} Upcoming
            </AppText>
          </TouchableOpacity>

          {/* Competitions */}
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/club-portal/tournaments' as any)}
            activeOpacity={0.8}
            accessibilityLabel="Competitions"
          >
            <View style={[styles.statIconSlot, { backgroundColor: '#FEF3EB' }]}>
              <Trophy size={15} color="#D97706" strokeWidth={2.2} />
            </View>
            <AppText style={styles.statNumber}>{upcomingTournaments}</AppText>
            <AppText style={styles.statLabel} numberOfLines={2}>
              {upcomingLeagues} Leagues
            </AppText>
          </TouchableOpacity>

          {/* Staff Members */}
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/club-portal/members' as any)}
            activeOpacity={0.8}
            accessibilityLabel="Staff Members"
          >
            <View style={[styles.statIconSlot, { backgroundColor: '#F3EFFB' }]}>
              <ShieldCheck size={15} color="#7C3AED" strokeWidth={2.2} />
            </View>
            <AppText style={styles.statNumber}>{activeStaff}</AppText>
            <AppText style={styles.statLabel} numberOfLines={2}>
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
              onPress={() => router.push('/club-portal/payments' as any)}
              activeOpacity={0.8}
              accessibilityLabel="Payments"
            >
              <View style={[styles.statIconSlot, { backgroundColor: '#FEF2F2' }]}>
                <CreditCard size={15} color="#DC2626" strokeWidth={2.2} />
              </View>
              <AppText style={styles.statNumber}>
                {dashboard.payments.pending_count > 0
                  ? formatCurrency(dashboard.payments.pending_amount)
                  : formatCurrency(dashboard.payments.total_revenue)}
              </AppText>
              <AppText style={styles.statLabel} numberOfLines={2}>
                {dashboard.payments.pending_count > 0
                  ? `${dashboard.payments.pending_count} Pending Payments`
                  : `${dashboard.payments.succeeded_count} Succeeded Payments`}
              </AppText>
            </TouchableOpacity>

            {/* Events & Lessons */}
            <TouchableOpacity
              style={[styles.statCard, { flex: 2 }]}
              onPress={() => router.push('/club-portal/events' as any)}
              activeOpacity={0.8}
              accessibilityLabel="Events & Lessons"
            >
              <View style={[styles.statIconSlot, { backgroundColor: '#FCE7F3' }]}>
                <Star size={15} color="#DB2777" strokeWidth={2.2} />
              </View>
              <AppText style={styles.statNumber}>{upcomingEvents}</AppText>
              <AppText style={styles.statLabel} numberOfLines={2}>
                Events ({upcomingLessons} Lessons)
              </AppText>
            </TouchableOpacity>
          </View>
        )}
          </>
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
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
    marginBottom: 6,
  },
  welcomeTextCol: {
    flex: 1,
    minWidth: 200,
    gap: 2,
  },
  welcomeSub: {
    fontSize: 14,
    color: '#5E736E',
    fontWeight: '500',
    lineHeight: 18,
  },
  welcomeMain: {
    fontSize: 24,
    fontWeight: '800',
    color: '#102F2B',
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E6F5EE',
    borderColor: '#D0EADB',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexShrink: 0,
    alignSelf: 'flex-start',
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
    color: '#176B57',
  },

  // Quick Actions Grid (2 rows × 3 cols)
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickCard: {
    flexBasis: '30%',
    flexGrow: 1,
    minWidth: 96,
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
    gap: 2,
  },
  quickLabel: {
    flex: 1,
    fontSize: 12,
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
    width: 68,
    height: 68,
    borderRadius: 12,
  },
  scheduleThumbFallback: {
    width: 68,
    height: 68,
    borderRadius: 12,
    backgroundColor: '#E5F5EC',
    alignItems: 'center',
    justifyContent: 'center',
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
    color: '#176B57',
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
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: '#FFFFFF',
    borderColor: '#E5EFE9',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#102F2B',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1.5,
  },
  statIconSlot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: '#102F2B',
  },
  statLabel: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#667773',
    textAlign: 'center',
    lineHeight: 15,
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
  maintenanceBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  maintenanceBannerTextCol: {
    flex: 1,
  },
  maintenanceBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 2,
  },
  maintenanceBannerSub: {
    fontSize: 11.5,
    color: '#B45309',
    lineHeight: 16,
  },
});
