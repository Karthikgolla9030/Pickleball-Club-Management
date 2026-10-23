/**
 * Aught2 Pickleball — PlatformBottomNav
 *
 * Fixed bottom navigation bar for the mobile platform administration experience:
 *   - 5 actions: Overview | Applications | Clubs | Support | More (Drawer)
 *   - Live pending counts and open ticket badges
 *   - Safe-area bottom inset aware
 *   - Hidden on desktop (>= 800px) where full horizontal header is used
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Building2,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  Menu,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { useDrawerStore } from '@/navigation';
import { Colors, Radius } from '@/theme';

interface PlatformBottomNavProps {
  pendingApplicationsCount?: number;
  openTicketsCount?: number;
}

export function PlatformBottomNav({
  pendingApplicationsCount = 0,
  openTicketsCount = 0,
}: PlatformBottomNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const openDrawer = useDrawerStore((s) => s.openDrawer);

  // Hidden on desktop / wide tablet viewports
  if (width >= 800) {
    return null;
  }

  const normalizedPath = pathname.replace(/\/$/, '') || '/platform';

  const isOverviewActive =
    normalizedPath === '/platform' || normalizedPath === '/platform/index';
  const isApplicationsActive = normalizedPath.startsWith('/platform/applications');
  const isClubsActive = normalizedPath.startsWith('/platform/clubs');
  const isSupportActive = normalizedPath.startsWith('/platform/support');
  const isMoreActive =
    normalizedPath.startsWith('/platform/users') ||
    normalizedPath.startsWith('/platform/audit') ||
    normalizedPath.startsWith('/platform/settings');

  const handleNavigate = (route: string) => {
    router.replace(route as any);
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, 10),
          height: 60 + Math.max(insets.bottom, 10),
        },
      ]}
    >
      <View style={styles.navRow}>
        {/* 1. Overview */}
        <Pressable
          onPress={() => handleNavigate('/platform')}
          style={styles.navItem}
          hitSlop={8}
          accessibilityLabel="Overview"
          accessibilityRole="tab"
        >
          <View style={[styles.iconContainer, isOverviewActive && styles.iconContainerActive]}>
            <LayoutDashboard
              size={20}
              color={isOverviewActive ? '#18794E' : '#7A8C87'}
              strokeWidth={isOverviewActive ? 2.3 : 1.8}
            />
          </View>
          <AppText
            style={[styles.navLabel, isOverviewActive && styles.navLabelActive]}
            numberOfLines={1}
          >
            Overview
          </AppText>
        </Pressable>

        {/* 2. Applications */}
        <Pressable
          onPress={() => handleNavigate('/platform/applications')}
          style={styles.navItem}
          hitSlop={8}
          accessibilityLabel="Applications"
          accessibilityRole="tab"
        >
          <View style={[styles.iconContainer, isApplicationsActive && styles.iconContainerActive]}>
            <FileText
              size={20}
              color={isApplicationsActive ? '#18794E' : '#7A8C87'}
              strokeWidth={isApplicationsActive ? 2.3 : 1.8}
            />
            {pendingApplicationsCount > 0 && (
              <View style={styles.badgePillWarning}>
                <AppText style={styles.badgePillText}>
                  {pendingApplicationsCount > 99 ? '99+' : pendingApplicationsCount}
                </AppText>
              </View>
            )}
          </View>
          <AppText
            style={[styles.navLabel, isApplicationsActive && styles.navLabelActive]}
            numberOfLines={1}
          >
            Applications
          </AppText>
        </Pressable>

        {/* 3. Clubs */}
        <Pressable
          onPress={() => handleNavigate('/platform/clubs')}
          style={styles.navItem}
          hitSlop={8}
          accessibilityLabel="Clubs"
          accessibilityRole="tab"
        >
          <View style={[styles.iconContainer, isClubsActive && styles.iconContainerActive]}>
            <Building2
              size={20}
              color={isClubsActive ? '#18794E' : '#7A8C87'}
              strokeWidth={isClubsActive ? 2.3 : 1.8}
            />
          </View>
          <AppText
            style={[styles.navLabel, isClubsActive && styles.navLabelActive]}
            numberOfLines={1}
          >
            Clubs
          </AppText>
        </Pressable>

        {/* 4. Support */}
        <Pressable
          onPress={() => handleNavigate('/platform/support')}
          style={styles.navItem}
          hitSlop={8}
          accessibilityLabel="Support"
          accessibilityRole="tab"
        >
          <View style={[styles.iconContainer, isSupportActive && styles.iconContainerActive]}>
            <LifeBuoy
              size={20}
              color={isSupportActive ? '#18794E' : '#7A8C87'}
              strokeWidth={isSupportActive ? 2.3 : 1.8}
            />
            {openTicketsCount > 0 && (
              <View style={styles.badgePillInfo}>
                <AppText style={styles.badgePillText}>
                  {openTicketsCount > 99 ? '99+' : openTicketsCount}
                </AppText>
              </View>
            )}
          </View>
          <AppText
            style={[styles.navLabel, isSupportActive && styles.navLabelActive]}
            numberOfLines={1}
          >
            Support
          </AppText>
        </Pressable>

        {/* 5. More / Menu Drawer */}
        <TouchableOpacity
          onPress={openDrawer}
          style={styles.navItem}
          hitSlop={8}
          accessibilityLabel="More options"
          accessibilityRole="button"
        >
          <View style={[styles.iconContainer, isMoreActive && styles.iconContainerActive]}>
            <Menu
              size={20}
              color={isMoreActive ? '#18794E' : '#7A8C87'}
              strokeWidth={isMoreActive ? 2.3 : 1.8}
            />
          </View>
          <AppText
            style={[styles.navLabel, isMoreActive && styles.navLabelActive]}
            numberOfLines={1}
          >
            More
          </AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E6EFEA',
    zIndex: 90,
    shadowColor: '#102B2A',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 10,
  },
  navRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  iconContainer: {
    position: 'relative',
    height: 30,
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRadius: Radius.sm,
  },
  iconContainerActive: {
    backgroundColor: '#E8F5EE',
  },
  badgePillWarning: {
    position: 'absolute',
    top: -3,
    right: -4,
    backgroundColor: '#D97706',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgePillInfo: {
    position: 'absolute',
    top: -3,
    right: -4,
    backgroundColor: '#2563EB',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgePillText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
  },
  navLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#7A8C87',
    letterSpacing: 0.1,
  },
  navLabelActive: {
    color: '#18794E',
    fontWeight: '700',
  },
});
