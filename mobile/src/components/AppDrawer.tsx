/**
 * Aught2 Pickleball — AppDrawer
 *
 * Slide-out navigation drawer with strict separation between:
 *   1. PLAYER EXPERIENCE (mode="player")
 *   2. CLUB MANAGEMENT EXPERIENCE (mode="club")
 *
 * Players NEVER see Club Management items or "Club Owner" badge.
 * Club staff see only features permitted for their backend role.
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  Building2,
  CalendarDays,
  CalendarHeart,
  ChevronRight,
  Compass,
  CreditCard,
  Crown,
  FileText,
  GraduationCap,
  HelpCircle,
  Home,
  LayoutGrid,
  LogOut,
  Medal,
  PlusCircle,
  Settings,
  ShieldCheck,
  Trophy,
  User,
  UserCheck,
  Users,
  X,
} from 'lucide-react-native';

import { AppText } from './AppText';
import { useDrawerStore } from '@/navigation';
import { useAuth, useActiveClub } from '@/hooks';

interface NavItemConfig {
  key: string;
  label: string;
  icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
  route?: string;
  action?: 'logout';
}

export function AppDrawer({ mode = 'club' }: { mode?: 'player' | 'club' }) {
  const isOpen = useDrawerStore((s) => s.isOpen);
  const closeDrawer = useDrawerStore((s) => s.closeDrawer);

  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  // Responsive drawer width: comfortably fits narrow screens (320px) while leaving tap-to-dismiss margin
  const drawerWidth = Math.min(Math.max(windowWidth * 0.82, 280), 340);

  const { user, memberships, logout } = useAuth();
  const { role, activeMembership } = useActiveClub();

  // Strict check: if mode is player OR user has no active club membership -> Player experience
  const isPlayer = mode === 'player' || memberships.length === 0 || !activeMembership;

  // Android back button handler
  useEffect(() => {
    if (!isOpen || Platform.OS === 'web') return;
    const onBackPress = () => {
      closeDrawer();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [isOpen, closeDrawer]);

  // Slide animation from LEFT
  const translateX = useRef(new Animated.Value(-340)).current;

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: isOpen ? 0 : -drawerWidth,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [isOpen, drawerWidth, translateX]);

  // Normalized path matching
  const normalizedPath = pathname.replace(/\/$/, '') || '/';

  const handleNavigate = (route?: string) => {
    closeDrawer();
    if (route) {
      router.replace(route as any);
    }
  };

  const handleSignOut = async () => {
    closeDrawer();
    try {
      const wasPlayer = isPlayer;
      await logout();
      if (wasPlayer) {
        router.replace('/(auth)/login?portal=player' as any);
      } else {
        router.replace('/(auth)/login?portal=club' as any);
      }
    } catch {
      // Handled gracefully
    }
  };

  const displayName = user?.full_name || (user as any)?.display_name || (isPlayer ? 'Player' : 'Staff Member');
  const email = user?.email || '';
  const initial = displayName.charAt(0).toUpperCase() || (isPlayer ? 'P' : 'S');

  // Role Badge configuration
  let roleLabel = 'Player';
  let RoleIcon = User;
  let roleBadgeBg = '#E4F4EC';
  let roleBadgeColor = '#176F5B';

  if (!isPlayer) {
    if (role === 'club_owner') {
      roleLabel = 'Club Owner';
      RoleIcon = Crown;
      roleBadgeBg = '#E4F4EC';
      roleBadgeColor = '#176F5B';
    } else if (role === 'club_manager') {
      roleLabel = 'Club Manager';
      RoleIcon = ShieldCheck;
      roleBadgeBg = '#E0F2FE';
      roleBadgeColor = '#0E7490';
    } else if (role === 'tournament_director') {
      roleLabel = 'Tournament Director';
      RoleIcon = Trophy;
      roleBadgeBg = '#FEF3C7';
      roleBadgeColor = '#B45309';
    }
  }

  // ─── 1. PLAYER NAVIGATION ─────────────────────────────────────────────────
  const playerActivities: NavItemConfig[] = [
    { key: 'player_home', label: 'Home', icon: Home, route: '/(player)/' },
    { key: 'player_explore', label: 'Explore Clubs', icon: Compass, route: '/(player)/explore-clubs' },
    { key: 'player_clubs', label: 'My Clubs', icon: Building2, route: '/(player)/clubs' },
    { key: 'player_bookings', label: 'My Bookings', icon: CalendarDays, route: '/(player)/bookings' },
    { key: 'player_courts', label: 'Book a Court', icon: LayoutGrid, route: '/(player)/book-court-club' },
    { key: 'player_membership', label: 'My Memberships', icon: Crown, route: '/(player)/membership' },
    { key: 'player_payments', label: 'My Payments', icon: CreditCard, route: '/(player)/payments' },
    { key: 'player_tournaments', label: 'Tournaments', icon: Trophy, route: '/(player)/tournaments' },
    { key: 'player_leagues', label: 'Leagues', icon: Medal, route: '/(player)/leagues' },
    { key: 'player_events', label: 'Events', icon: CalendarHeart, route: '/(player)/events' },
    { key: 'player_lessons', label: 'Lessons & Coaching', icon: GraduationCap, route: '/(player)/lessons' },
  ];

  const playerAccount: NavItemConfig[] = [
    { key: 'player_profile', label: 'Profile', icon: User, route: '/(player)/profile' },
    { key: 'player_notifications', label: 'Notifications', icon: Bell, route: '/(player)/notifications' },
    { key: 'player_help', label: 'Help & Support', icon: HelpCircle, route: '/(player)/help-support' },
  ];

  // ─── 2. CLUB NAVIGATION (Role-Specific) ───────────────────────────────────
  let clubSection1: NavItemConfig[] = [];
  let clubSection2: NavItemConfig[] = [];
  let clubSection3: NavItemConfig[] = [];

  if (!isPlayer) {
    if (role === 'club_owner') {
      // Club Owner: Full management
      clubSection1 = [
        { key: 'home', label: 'Home', icon: Home, route: '/(club)/' },
        { key: 'members', label: 'Members', icon: Users, route: '/(club)/members' },
        { key: 'courts', label: 'Courts', icon: LayoutGrid, route: '/(club)/courts' },
        { key: 'bookings', label: 'Bookings', icon: CalendarDays, route: '/(club)/bookings' },
        { key: 'memberships', label: 'Memberships', icon: Crown, route: '/(club)/memberships' },
        { key: 'events', label: 'Events', icon: CalendarHeart, route: '/(club)/events' },
        { key: 'tournaments', label: 'Tournaments', icon: Trophy, route: '/(club)/tournaments' },
        { key: 'leagues', label: 'Leagues', icon: Medal, route: '/(club)/leagues' },
        { key: 'lessons', label: 'Lessons & Coaching', icon: GraduationCap, route: '/(club)/lessons' },
      ];
      clubSection2 = [
        { key: 'club_details', label: 'Club Details', icon: Building2, route: '/(club)/club-details' },
        { key: 'staff', label: 'Staff & Permissions', icon: ShieldCheck, route: '/(club)/members' },
        { key: 'billing', label: 'Subscription & Billing', icon: CreditCard, route: '/(club)/payments' },
      ];
      clubSection3 = [
        { key: 'settings', label: 'Settings', icon: Settings, route: '/(club)/settings' },
        { key: 'help', label: 'Help & Support', icon: HelpCircle, route: '/(club)/settings' },
        { key: 'privacy', label: 'Privacy Policy', icon: ShieldCheck, route: '/(club)/settings' },
        { key: 'terms', label: 'Terms of Service', icon: FileText, route: '/(club)/settings' },
      ];
    } else if (role === 'club_manager') {
      // Club Manager: Operations only
      clubSection1 = [
        { key: 'home', label: 'Home', icon: Home, route: '/(club)/' },
        { key: 'members', label: 'Members', icon: Users, route: '/(club)/members' },
        { key: 'courts', label: 'Courts', icon: LayoutGrid, route: '/(club)/courts' },
        { key: 'bookings', label: 'Bookings', icon: CalendarDays, route: '/(club)/bookings' },
        { key: 'memberships', label: 'Memberships', icon: Crown, route: '/(club)/memberships' },
        { key: 'events', label: 'Events', icon: CalendarHeart, route: '/(club)/events' },
        { key: 'tournaments', label: 'Tournaments', icon: Trophy, route: '/(club)/tournaments' },
        { key: 'leagues', label: 'Leagues', icon: Medal, route: '/(club)/leagues' },
        { key: 'lessons', label: 'Lessons & Coaching', icon: GraduationCap, route: '/(club)/lessons' },
      ];
      clubSection2 = [
        { key: 'club_details', label: 'Club Details', icon: Building2, route: '/(club)/club-details' },
        { key: 'profile', label: 'Profile', icon: User, route: '/(club)/profile' },
        { key: 'settings', label: 'Settings', icon: Settings, route: '/(club)/settings' },
        { key: 'help', label: 'Help & Support', icon: HelpCircle, route: '/(club)/settings' },
      ];
    } else {
      // Tournament Director: Competitions only
      clubSection1 = [
        { key: 'home', label: 'Home', icon: Home, route: '/(club)/' },
        { key: 'tournaments', label: 'Tournaments', icon: Trophy, route: '/(club)/tournaments' },
        { key: 'leagues', label: 'Leagues', icon: Medal, route: '/(club)/leagues' },
      ];
      clubSection2 = [
        { key: 'profile', label: 'Profile', icon: User, route: '/(club)/profile' },
        { key: 'settings', label: 'Settings', icon: Settings, route: '/(club)/settings' },
        { key: 'help', label: 'Help & Support', icon: HelpCircle, route: '/(club)/settings' },
      ];
    }
  }

  const renderNavRow = (item: NavItemConfig) => {
    const isItemHome = item.key === 'home' || item.key === 'player_home';
    const isActive = isItemHome
      ? (isPlayer ? normalizedPath === '/(player)' || normalizedPath === '/(player)/index' : normalizedPath === '/(club)' || normalizedPath === '/(club)/index')
      : normalizedPath === item.route;
    const Icon = item.icon;

    return (
      <Pressable
        key={item.key}
        onPress={() => handleNavigate(item.route)}
        style={({ pressed }) => [
          styles.navRow,
          isActive && styles.navRowActive,
          pressed && styles.navRowPressed,
        ]}
        accessibilityLabel={item.label}
        accessibilityRole="button"
      >
        <View style={styles.navRowLeft}>
          <Icon
            size={18}
            color={isActive ? '#176F5B' : '#2A4540'}
            strokeWidth={isActive ? 2.2 : 2.0}
          />
          <AppText
            style={[
              styles.navRowLabel,
              isActive && styles.navRowLabelActive,
            ]}
            numberOfLines={1}
          >
            {item.label}
          </AppText>
        </View>

        <ChevronRight
          size={14}
          color={isActive ? '#176F5B' : '#A0B0AB'}
          strokeWidth={2}
          style={styles.chevronIcon}
        />
      </Pressable>
    );
  };

  return (
    <Animated.View
      style={[
        styles.drawer,
        {
          width: drawerWidth,
          paddingTop: insets.top + 6,
          transform: [{ translateX }],
        },
      ]}
      pointerEvents={isOpen ? 'auto' : 'none'}
    >
      {/* 1. Header with Logo & Close Button (Fixed at Top) */}
      <View style={styles.headerRow}>
        <Image
          source={require('../../assets/pickleball_logo_transparent.png')}
          style={styles.logoImage}
          resizeMode="contain"
          accessibilityLabel="Pickleball"
        />

        <TouchableOpacity
          onPress={closeDrawer}
          style={styles.closeBtn}
          activeOpacity={0.7}
          hitSlop={8}
          accessibilityLabel="Close navigation drawer"
          accessibilityRole="button"
        >
          <X size={18} color="#2A4540" strokeWidth={2.4} />
        </TouchableOpacity>
      </View>

      {/* 2. Scrollable Navigation List with Profile at Top */}
      <ScrollView
        style={styles.scrollList}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom + 28, 40) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* User Profile Identity Section */}
        <View style={styles.profileSection}>
          <View style={styles.avatarCircle}>
            <AppText style={styles.avatarInitial}>{initial}</AppText>
          </View>

          <View style={styles.profileDetails}>
            <AppText style={styles.profileName} numberOfLines={1}>
              {displayName}
            </AppText>
            <AppText style={styles.profileEmail} numberOfLines={1}>
              {email}
            </AppText>

            {/* Role Pill Badge */}
            <View style={[styles.roleBadgePill, { backgroundColor: roleBadgeBg }]}>
              <RoleIcon size={11} color={roleBadgeColor} strokeWidth={2.4} />
              <AppText style={[styles.roleBadgeText, { color: roleBadgeColor }]}>
                {roleLabel}
              </AppText>
            </View>
          </View>
        </View>

        <View style={styles.profileDivider} />

        {isPlayer ? (
          <>
            {/* Player Main Activities */}
            <View style={styles.itemGroup}>
              {playerActivities.map(renderNavRow)}
            </View>

            <View style={styles.divider} />

            {/* Player Account & Settings */}
            <View style={styles.itemGroup}>
              {playerAccount.map(renderNavRow)}
            </View>
          </>
        ) : (
          <>
            {/* Club Section 1 */}
            <View style={styles.itemGroup}>
              {clubSection1.map(renderNavRow)}
            </View>

            {clubSection2.length > 0 && (
              <>
                <View style={styles.divider} />
                <View style={styles.itemGroup}>
                  {clubSection2.map(renderNavRow)}
                </View>
              </>
            )}

            {clubSection3.length > 0 && (
              <>
                <View style={styles.divider} />
                <View style={styles.itemGroup}>
                  {clubSection3.map(renderNavRow)}
                </View>
              </>
            )}
          </>
        )}

        {/* Sign Out CTA Button */}
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          activeOpacity={0.8}
          accessibilityLabel="Sign Out"
          accessibilityRole="button"
        >
          <LogOut size={16} color="#DC2626" strokeWidth={2.2} />
          <AppText style={styles.signOutText}>Sign Out</AppText>
        </TouchableOpacity>

        {/* Footer Branding */}
        <View style={styles.footerRow}>
          <View style={styles.footerBrandCol}>
            <AppText style={styles.footerBrandTitle}>AUGHT2 PICKLEBALL</AppText>
            <AppText style={styles.footerBrandMotto}>Play  •  Connect  •  Grow</AppText>
          </View>
          <AppText style={styles.footerVersion}>v1.0.0</AppText>
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#FFFFFF',
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
    zIndex: 999,
    shadowColor: '#102F2B',
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 20,
  },

  // 1. Header Row (Fixed at Top)
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  logoImage: {
    width: 96,
    height: 40,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F3F6F5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 2. Profile Section (Inside ScrollView)
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 12,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#D7EFE7',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: '700',
    color: '#18794E',
  },
  profileDetails: {
    flex: 1,
    minWidth: 0,
    gap: 1.5,
  },
  profileName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#102F2B',
    lineHeight: 18,
  },
  profileEmail: {
    fontSize: 11.5,
    color: '#667773',
    lineHeight: 15,
  },
  roleBadgePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E4F4EC',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 3,
  },
  roleBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#176F5B',
  },
  profileDivider: {
    height: 1,
    backgroundColor: '#EEF2F0',
    marginHorizontal: 16,
    marginBottom: 8,
  },

  // 3. Navigation List
  scrollList: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  itemGroup: {
    gap: 1.5,
  },
  navRow: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  navRowActive: {
    backgroundColor: '#EAF6F0',
  },
  navRowPressed: {
    backgroundColor: '#F3F8F5',
  },
  navRowLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  navRowLabel: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#2A4540',
    flexShrink: 1,
  },
  navRowLabelActive: {
    color: '#176F5B',
    fontWeight: '700',
  },
  chevronIcon: {
    flexShrink: 0,
    marginLeft: 6,
  },

  divider: {
    height: 1,
    backgroundColor: '#EEF2F0',
    marginVertical: 8,
    marginHorizontal: 8,
  },

  // 4. Sign Out Button
  signOutButton: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEE8E8',
    borderColor: '#FECDCA',
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 16,
    marginBottom: 14,
    marginHorizontal: 4,
  },
  signOutText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#DC2626',
  },

  // 5. Footer Branding
  footerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 8,
  },
  footerBrandCol: {
    gap: 2,
  },
  footerBrandTitle: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#8F9F9A',
    letterSpacing: 0.8,
  },
  footerBrandMotto: {
    fontSize: 9,
    color: '#A0B0AB',
  },
  footerVersion: {
    fontSize: 9.5,
    color: '#A0B0AB',
    fontWeight: '500',
  },
});
