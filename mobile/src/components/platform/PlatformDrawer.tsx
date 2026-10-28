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

export function PlatformDrawer({ adminUser }: PlatformDrawerProps) {
  const isOpen = useDrawerStore((s) => s.isOpen);
  const closeDrawer = useDrawerStore((s) => s.closeDrawer);

  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const logout = useAuthStore((s) => s.logout);

  // Responsive drawer width: ~78vw, capped at 380px, suitable for all mobile viewports
  const drawerWidth = Math.min(Math.round(windowWidth * 0.78), 380);

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
  const translateX = useRef(new Animated.Value(-400)).current;

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: isOpen ? 0 : -drawerWidth - 30,
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
          paddingTop: insets.top + 10,
          paddingBottom: Math.max(insets.bottom, 12),
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
          <X size={18} color="#475569" strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      {/* 2. Platform Owner Account Panel */}
      <View style={styles.accountPanel}>
        <View style={styles.shieldIconWrap}>
          <ShieldCheck size={24} color="#16A34A" strokeWidth={2} />
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
                  size={20}
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

              <ChevronRight
                size={18}
                color={isActive ? '#16A34A' : '#94A3B8'}
                strokeWidth={2}
              />
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
          <LogOut size={18} color="#DC2626" strokeWidth={2} />
          <AppText style={styles.signOutText}>Sign Out of Platform</AppText>
          <ChevronRight size={18} color="#DC2626" strokeWidth={2} />
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
          boxShadow: '8px 0 24px rgba(15, 23, 42, 0.12)' as any,
        } as any)
      : {
          shadowColor: '#0F172A',
          shadowOffset: { width: 8, height: 0 },
          shadowOpacity: 0.12,
          shadowRadius: 24,
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
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  brandRow: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  logoImage: {
    width: 106,
    height: 34,
  },
  brandSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
    marginLeft: 26,
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountPanel: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  shieldIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountTextCol: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 4,
  },
  roleBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#15803D',
    letterSpacing: 0.6,
  },
  accountEmail: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 18,
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
    paddingTop: 12,
    marginHorizontal: 16,
    marginBottom: 6,
  },
  sectionHeadingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.7,
  },
  navList: {
    flex: 1,
    minHeight: 0,
  },
  navContent: {
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 10,
    gap: 6,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 14,
    gap: 12,
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
    top: 6,
    bottom: 6,
    width: 4,
    borderRadius: 2,
    backgroundColor: '#16A34A',
  },
  navIconTile: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIconTileActive: {
    backgroundColor: '#16A34A',
  },
  navTextCol: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  navItemTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  navItemTitleActive: {
    color: '#0F2922',
  },
  navItemSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    gap: 10,
  },
  signOutText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
    marginLeft: 8,
  },
});
