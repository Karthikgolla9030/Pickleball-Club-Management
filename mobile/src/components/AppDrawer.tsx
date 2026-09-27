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
  Dimensions,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
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
  CreditCard,
  Crown,
  FileText,
  GraduationCap,
  HelpCircle,
  Home,
  LayoutGrid,
  LogOut,
  Medal,
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

const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.84, 340);

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
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: isOpen ? 0 : -DRAWER_WIDTH,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isOpen, translateX]);

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
    { key: 'player_bookings', label: 'My Bookings', icon: CalendarDays, route: '/(player)/bookings' },
    { key: 'player_courts', label: 'Book a Court', icon: LayoutGrid, route: '/(player)/courts' },
    { key: 'player_tournaments', label: 'Tournaments', icon: Trophy, route: '/(player)/tournaments' },
    { key: 'player_leagues', label: 'Leagues', icon: Medal, route: '/(player)/leagues' },
    { key: 'player_events', label: 'Events', icon: CalendarHeart, route: '/(player)/events' },
    { key: 'player_lessons', label: 'Lessons & Coaching', icon: GraduationCap, route: '/(player)/lessons' },
    { key: 'player_membership', label: 'Membership', icon: Crown, route: '/(player)/membership' },
  ];

  const playerAccount: NavItemConfig[] = [
    { key: 'player_notifications', label: 'Notifications', icon: Bell, route: '/(player)/notifications' },
    { key: 'player_settings', label: 'Settings', icon: Settings, route: '/(player)/profile' },
    { key: 'player_help', label: 'Help & Support', icon: HelpCircle, route: '/(player)/profile' },
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
        { key: 'club_details', label: 'Club Details', icon: Building2, route: '/(club)/settings' },
        { key: 'staff', label: 'Staff & Permissions', icon: UserCheck, route: '/(club)/members' },
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
        { key: 'schedules', label: 'Competition Schedule', icon: CalendarDays, route: '/(club)/competition-schedule' },
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
            size={19}
            color={isActive ? '#176F5B' : '#2A4540'}
            strokeWidth={isActive ? 2.3 : 1.9}
          />
          <AppText
            style={[
              styles.navRowLabel,
              isActive && styles.navRowLabelActive,
            ]}
          >
            {item.label}
          </AppText>
        </View>

        <ChevronRight
          size={15}
          color={isActive ? '#176F5B' : '#B0BCB7'}
          strokeWidth={2}
        />
      </Pressable>
    );
  };

  return (
    <Animated.View
      style={[
        styles.drawer,
        {
          width: DRAWER_WIDTH,
          paddingTop: insets.top + 6,
          paddingBottom: Math.max(insets.bottom, 14),
          transform: [{ translateX }],
        },
      ]}
      pointerEvents={isOpen ? 'auto' : 'none'}
    >
      {/* 1. Header with Logo & Close Button */}
      <View style={styles.headerRow}>
        <Image
          source={require('../../assets/aught2_brand_logo_transparent.png')}
          style={styles.logoImage}
          resizeMode="contain"
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

      {/* 2. User Profile Identity Section */}
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

      {/* 3. Scrollable Navigation List */}
      <ScrollView
        style={styles.scrollList}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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
          <LogOut size={17} color="#DC2626" strokeWidth={2.3} />
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

  // 1. Header Row
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  logoImage: {
    width: 96,
    height: 42,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F6F5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 2. Profile Section
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 14,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#D7EFE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: '700',
    color: '#18794E',
  },
  profileDetails: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102F2B',
  },
  profileEmail: {
    fontSize: 12,
    color: '#667773',
  },
  roleBadgePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E4F4EC',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 12,
    marginTop: 4,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#176F5B',
  },

  // 3. Navigation List
  scrollList: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  itemGroup: {
    gap: 2,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  navRowActive: {
    backgroundColor: '#EAF6F0',
  },
  navRowPressed: {
    backgroundColor: '#F3F8F5',
  },
  navRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  navRowLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2A4540',
  },
  navRowLabelActive: {
    color: '#176F5B',
    fontWeight: '700',
  },

  divider: {
    height: 1,
    backgroundColor: '#EEF2F0',
    marginVertical: 10,
    marginHorizontal: 8,
  },

  // 4. Sign Out Button
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEE8E8',
    borderColor: '#FECDCA',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    marginTop: 18,
    marginBottom: 16,
  },
  signOutText: {
    fontSize: 14,
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
    paddingBottom: 10,
  },
  footerBrandCol: {
    gap: 2,
  },
  footerBrandTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8F9F9A',
    letterSpacing: 0.8,
  },
  footerBrandMotto: {
    fontSize: 9.5,
    color: '#A0B0AB',
  },
  footerVersion: {
    fontSize: 10,
    color: '#A0B0AB',
    fontWeight: '500',
  },
});
