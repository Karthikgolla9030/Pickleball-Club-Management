/**
 * Aught2 Pickleball — Platform Admin Drawer
 *
 * Slide-out navigation drawer designed specifically for mobile:
 * - Displays Platform Owner identity, shield badge, and system status
 * - Vertical list of all 6 platform administration sections with icons and badges
 * - Smooth slide-in animation from left using useDrawerStore
 * - Android back button handling and touch-dismiss backdrop
 * - Fixed Sign Out button anchored at bottom
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Platform,
  Pressable,
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
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { useDrawerStore } from '@/navigation';
import { PlatformOwnerProfile } from '@/services/api/clubApplications';
import { useAuthStore } from '@/store';
import { Colors, Radius, Spacing } from '@/theme';

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

  // Responsive drawer width: fits narrow mobile screens (320px) while leaving tap-to-dismiss margin
  const drawerWidth = Math.min(Math.max(windowWidth * 0.82, 280), 340);

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
      icon: LayoutDashboard,
    },
    {
      key: 'applications',
      label: 'Club Applications',
      subtitle: 'Review & approve clubs',
      route: '/platform/applications',
      icon: FileText,
      badge: counts?.pendingApplications && counts.pendingApplications > 0 ? `${counts.pendingApplications}` : undefined,
      badgeVariant: 'warning' as const,
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
      badge: counts?.openTickets && counts.openTickets > 0 ? `${counts.openTickets}` : undefined,
      badgeVariant: 'info' as const,
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
          paddingTop: insets.top + 12,
          paddingBottom: Math.max(insets.bottom, 16) + 8,
        },
      ]}
      pointerEvents={isOpen ? 'auto' : 'none'}
    >
      {/* Drawer Header */}
      <View style={styles.header}>
        <View style={styles.adminInfoRow}>
          <View style={styles.avatarWrap}>
            <ShieldCheck size={22} color="#18794E" />
          </View>
          <View style={styles.headerTextGroup}>
            <View style={styles.badgeRow}>
              <View style={styles.roleBadge}>
                <AppText style={styles.roleBadgeText}>PLATFORM OWNER</AppText>
              </View>
            </View>
            <AppText variant="title" numberOfLines={1} style={styles.adminEmail}>
              {adminUser?.email || 'Administrator'}
            </AppText>
          </View>
        </View>

        <TouchableOpacity
          onPress={closeDrawer}
          style={styles.closeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Close navigation drawer"
          accessibilityRole="button"
        >
          <X size={20} color="#5C746E" />
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      {/* Navigation List */}
      <ScrollView
        style={styles.navList}
        contentContainerStyle={styles.navContent}
        showsVerticalScrollIndicator={false}
      >
        <AppText variant="caption" color="secondary" style={styles.navSectionLabel}>
          PLATFORM ADMINISTRATION
        </AppText>

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
            >
              <View style={[styles.navIconWrap, isActive && styles.navIconWrapActive]}>
                <IconComp
                  size={18}
                  color={isActive ? '#FFFFFF' : '#18794E'}
                  strokeWidth={2}
                />
              </View>

              <View style={styles.navTextCol}>
                <AppText style={[styles.navItemLabel, isActive && styles.navItemLabelActive]}>
                  {item.label}
                </AppText>
                <AppText variant="caption" color="secondary" style={styles.navItemSub}>
                  {item.subtitle}
                </AppText>
              </View>

              {item.badge ? (
                <Badge label={item.badge} variant={item.badgeVariant} size="sm" />
              ) : (
                <ChevronRight
                  size={16}
                  color={isActive ? '#18794E' : '#94A3B8'}
                  strokeWidth={2}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Drawer Footer — Sign Out */}
      <View style={styles.footer}>
        <View style={styles.divider} />
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          activeOpacity={0.75}
        >
          <View style={styles.signOutIconWrap}>
            <LogOut size={16} color="#DC2626" />
          </View>
          <AppText style={styles.signOutText}>Sign Out of Platform</AppText>
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
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  adminInfoRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginRight: 8,
  },
  avatarWrap: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    backgroundColor: '#EAF6F0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C3E5D4',
  },
  headerTextGroup: {
    flex: 1,
    gap: 2,
  },
  badgeRow: {
    flexDirection: 'row',
  },
  roleBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#18794E',
    letterSpacing: 0.5,
  },
  adminEmail: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  closeBtn: {
    padding: 6,
    borderRadius: Radius.full,
    backgroundColor: '#F1F5F9',
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 16,
    marginVertical: 8,
  },
  navList: {
    flex: 1,
  },
  navContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 6,
  },
  navSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    gap: 12,
    backgroundColor: 'transparent',
  },
  navItemActive: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  navIconWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIconWrapActive: {
    backgroundColor: '#18794E',
  },
  navTextCol: {
    flex: 1,
  },
  navItemLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  navItemLabelActive: {
    color: '#18794E',
    fontWeight: '700',
  },
  navItemSub: {
    fontSize: 11,
    marginTop: 1,
  },
  footer: {
    paddingHorizontal: 12,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 10,
  },
  signOutIconWrap: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
});
