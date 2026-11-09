/**
 * Pickleball Multi-Club Platform — Platform Admin Left-Side Navigation Drawer
 *
 * Pixel-matched to the official platform reference design:
 * - Opens strictly from the left side of the screen
 * - Width approximately 78vw (max-width: 380px), never extending to the right edge
 * - Leaves a visible strip of the underlying page beneath a semi-transparent dark overlay
 * - Clean white header with official Pickleball logo, "Platform Admin" label, and circular close button
 * - Subtle pale-green Platform Owner account panel with Shield icon, badge, and non-truncated wrapping email
 * - "PLATFORM ADMINISTRATION" section header
 * - 7 compact navigation rows with green icon tiles, title, subtitle, and right chevron
 * - Prominent active route indicator with pale-green card background, green border, and left accent bar
 * - Pale-red rounded "Sign Out of Platform" button at the bottom
 * - Smooth animated slide-in, dismiss on backdrop tap, close button, Android back, or Escape key
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Building2,
  ChevronRight,
  FileText,
  History,
  ImagePlus,
  LayoutGrid,
  LifeBuoy,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { useDrawerStore } from '@/navigation';
import { PlatformOwnerProfile } from '@/services/api/clubApplications';
import { useAuthStore } from '@/store';
import { Radius } from '@/theme';

interface PlatformDrawerProps {
  adminUser: PlatformOwnerProfile | null;
  counts?: {
    pendingApplications?: number;
    openTickets?: number;
  };
}

export function PlatformDrawer({ adminUser, counts }: PlatformDrawerProps) {
  const isOpen = useDrawerStore((s) => s.isOpen);
  const closeDrawer = useDrawerStore((s) => s.closeDrawer);

  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const logout = useAuthStore((s) => s.logout);

  // Responsive drawer width: ~84vw (82–86% per spec), min 260px (for 320px screens) & max 340px
  const drawerWidth = Math.min(Math.max(Math.round(windowWidth * 0.84), 260), 340);

  // Android hardware back button handler
  useEffect(() => {
    if (!isOpen || Platform.OS === 'web') return;
    const onBackPress = () => {
      closeDrawer();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [isOpen, closeDrawer]);

  // Web Escape key listener
  useEffect(() => {
    if (!isOpen || Platform.OS !== 'web') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDrawer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeDrawer]);

  // Smooth slide animation from LEFT
  const translateX = useRef(new Animated.Value(-380)).current;

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: isOpen ? 0 : -drawerWidth - 25,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [isOpen, drawerWidth, translateX]);

  const normalizedPath = pathname.replace(/\/$/, '') || '/platform';

  const handleNavigate = (route: string) => {
    closeDrawer();
    router.replace(route as any);
  };

  const handleSignOut = async () => {
    closeDrawer();
    try {
      await logout();
    } finally {
      router.replace('/platform/login' as any);
    }
  };

  const navItems = [
    {
      key: 'overview',
      label: 'Overview',
      subtitle: 'System metrics & stats',
      route: '/platform',
      icon: LayoutGrid,
    },
    {
      key: 'applications',
      label: 'Club Applications',
      subtitle: 'Review & approve clubs',
      route: '/platform/applications',
      icon: FileText,
      badgeCount: counts?.pendingApplications,
    },
    {
      key: 'clubs',
      label: 'Clubs Directory',
      subtitle: 'Facilities & status',
      route: '/platform/clubs',
      icon: Building2,
    },
    {
      key: 'users',
      label: 'Platform Users',
      subtitle: 'Cross-club directory',
      route: '/platform/users',
      icon: Users,
    },
    {
      key: 'audit',
      label: 'Audit Log',
      subtitle: 'Administrative trail',
      route: '/platform/audit',
      icon: History,
    },
    {
      key: 'support',
      label: 'Support Tickets',
      subtitle: 'Inquiries & triage',
      route: '/platform/support',
      icon: LifeBuoy,
      badgeCount: counts?.openTickets,
    },
    {
      key: 'banners',
      label: 'Home Page Banners',
      subtitle: 'Owner & Player global heroes',
      route: '/platform/banners',
      icon: ImagePlus,
    },
    {
      key: 'settings',
      label: 'Platform Settings',
      subtitle: 'Global parameters & config',
      route: '/platform/settings',
      icon: Settings,
    },
  ];

  return (
    <Animated.View
      style={[
        styles.drawer,
        {
          width: drawerWidth,
          transform: [{ translateX }],
          paddingTop: Math.max(insets.top, 8) + 4,
          paddingBottom: Math.max(insets.bottom, 10),
        },
      ]}
      pointerEvents={isOpen ? 'auto' : 'none'}
      accessibilityRole="menu"
      accessibilityLabel="Platform Administration Menu"
    >
      {/* 1. Header & Branding */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Image
            source={require('@/../assets/pickleball_logo_primary.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <AppText style={styles.brandSubtitle}>Platform Admin</AppText>
        </View>

        <TouchableOpacity
          onPress={closeDrawer}
          style={styles.closeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Close navigation drawer"
          accessibilityRole="button"
          activeOpacity={0.7}
        >
          <X size={15} color="#475569" strokeWidth={2.4} />
        </TouchableOpacity>
      </View>

      {/* 2. Platform Owner Account Panel */}
      <View style={styles.accountPanel}>
        <View style={styles.shieldIconWrap}>
          <ShieldCheck size={18} color="#16A34A" strokeWidth={2.2} />
        </View>

        <View style={styles.accountTextCol}>
          <View style={styles.roleBadge}>
            <AppText style={styles.roleBadgeText}>PLATFORM OWNER</AppText>
          </View>
          <AppText style={styles.accountEmail}>
            {adminUser?.email || 'platform.owner@pickleball.com'}
          </AppText>
        </View>
      </View>

      {/* 3. Section Heading */}
      <View style={styles.sectionHeaderWrap}>
        <AppText style={styles.sectionHeadingText}>
          PLATFORM ADMINISTRATION
        </AppText>
      </View>

      {/* 4. Navigation List */}
      <ScrollView
        style={styles.navList}
        contentContainerStyle={styles.navContent}
        showsVerticalScrollIndicator={false}
      >
        {navItems.map((item) => {
          const isActive =
            item.route === '/platform'
              ? normalizedPath === '/platform' || normalizedPath === '/platform/index'
              : normalizedPath.startsWith(item.route);

          const IconComp = item.icon;

          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.navItem, isActive && styles.navItemActive]}
              onPress={() => handleNavigate(item.route)}
              activeOpacity={0.7}
              accessibilityRole="menuitem"
              accessibilityLabel={`${item.label}, ${item.subtitle}`}
            >
              {/* Left active vertical accent bar */}
              {isActive && <View style={styles.activeAccentBar} />}

              <View style={[styles.navIconTile, isActive && styles.navIconTileActive]}>
                <IconComp
                  size={18}
                  color={isActive ? '#FFFFFF' : '#16A34A'}
                  strokeWidth={2}
                />
              </View>

              <View style={styles.navTextCol}>
                <AppText style={[styles.navItemTitle, isActive && styles.navItemTitleActive]}>
                  {item.label}
                </AppText>
                <AppText style={styles.navItemSubtitle}>
                  {item.subtitle}
                </AppText>
              </View>

              {!!item.badgeCount && item.badgeCount > 0 ? (
                <View style={styles.badgePill}>
                  <AppText style={styles.badgePillText}>{item.badgeCount}</AppText>
                </View>
              ) : (
                <ChevronRight
                  size={15}
                  color={isActive ? '#16A34A' : '#94A3B8'}
                  strokeWidth={2}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 5. Drawer Footer — Sign Out */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          activeOpacity={0.75}
          accessibilityLabel="Sign out of platform"
          accessibilityRole="button"
        >
          <LogOut size={16} color="#DC2626" strokeWidth={2} />
          <AppText style={styles.signOutText}>Sign Out of Platform</AppText>
          <ChevronRight size={15} color="#DC2626" strokeWidth={2} />
        </TouchableOpacity>
      </View>
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
    zIndex: 1000,
    ...(Platform.OS === 'web'
      ? ({
          position: 'fixed' as any,
          height: '100dvh' as any,
          boxShadow: '6px 0 20px rgba(15, 23, 42, 0.14)' as any,
        } as any)
      : {
          shadowColor: '#0F172A',
          shadowOffset: { width: 6, height: 0 },
          shadowOpacity: 0.14,
          shadowRadius: 20,
          elevation: 25,
        }),
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 6,
    paddingTop: 2,
  },
  brandRow: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  logoImage: {
    width: 90,
    height: 26,
  },
  brandSubtitle: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 0,
    marginLeft: 22,
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountPanel: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 10,
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shieldIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  accountTextCol: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3,
  },
  roleBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#15803D',
    letterSpacing: 0.5,
  },
  accountEmail: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 16,
    letterSpacing: -0.2,
    ...(Platform.OS === 'web'
      ? ({
          wordBreak: 'break-all' as any,
          overflowWrap: 'anywhere' as any,
        } as any)
      : {}),
  },
  sectionHeaderWrap: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
    marginHorizontal: 12,
    marginBottom: 4,
  },
  sectionHeadingText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  navList: {
    flex: 1,
    minHeight: 0,
  },
  navContent: {
    paddingHorizontal: 10,
    paddingTop: 2,
    paddingBottom: 8,
    gap: 3,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 10,
    gap: 9,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },
  navItemActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  activeAccentBar: {
    position: 'absolute',
    left: 0,
    top: 4,
    bottom: 4,
    width: 3.5,
    borderRadius: 2,
    backgroundColor: '#16A34A',
  },
  navIconTile: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  navIconTileActive: {
    backgroundColor: '#16A34A',
  },
  navTextCol: {
    flex: 1,
    gap: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  navItemTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 17,
  },
  navItemTitleActive: {
    color: '#0F2922',
  },
  navItemSubtitle: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 14,
  },
  badgePill: {
    backgroundColor: '#DC2626',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgePillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 2,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    gap: 8,
    minHeight: 40,
  },
  signOutText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '700',
    color: '#DC2626',
    marginLeft: 6,
  },
});
