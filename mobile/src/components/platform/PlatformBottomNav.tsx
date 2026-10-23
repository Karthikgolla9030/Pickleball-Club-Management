/**
 * Pickleball — PlatformBottomNav
 *
 * Fixed bottom navigation bar matched directly to reference:
 * - 5 actions: Overview | Applications | Clubs | Users | More
 * - Active tab features green pill icon container & bold green label (#16A34A / #EBF5ED)
 * - Safe-area inset aware
 * - Hidden on desktop (>= 800px)
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
  Home,
  MoreHorizontal,
  Users,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { useDrawerStore } from '@/navigation';
import { Radius } from '@/theme';

interface PlatformBottomNavProps {
  pendingApplicationsCount?: number;
  openTicketsCount?: number;
}

export function PlatformBottomNav({
  pendingApplicationsCount = 0,
}: PlatformBottomNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const openDrawer = useDrawerStore((s) => s.openDrawer);

  // Hidden on desktop
  if (width >= 800) {
    return null;
  }

  const normalizedPath = pathname.replace(/\/$/, '') || '/platform';

  const isOverviewActive =
    normalizedPath === '/platform' || normalizedPath === '/platform/index';
  const isApplicationsActive = normalizedPath.startsWith('/platform/applications');
  const isClubsActive = normalizedPath.startsWith('/platform/clubs');
  const isUsersActive = normalizedPath.startsWith('/platform/users');
  const isMoreActive =
    normalizedPath.startsWith('/platform/audit') ||
    normalizedPath.startsWith('/platform/support') ||
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
          hitSlop={6}
          accessibilityLabel="Overview"
          accessibilityRole="tab"
        >
          <View style={[styles.iconContainer, isOverviewActive && styles.iconContainerActive]}>
            <Home
              size={20}
              color={isOverviewActive ? '#15803D' : '#6B7280'}
              strokeWidth={isOverviewActive ? 2.4 : 1.8}
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
          hitSlop={6}
          accessibilityLabel="Applications"
          accessibilityRole="tab"
        >
          <View style={[styles.iconContainer, isApplicationsActive && styles.iconContainerActive]}>
            <FileText
              size={20}
              color={isApplicationsActive ? '#15803D' : '#6B7280'}
              strokeWidth={isApplicationsActive ? 2.4 : 1.8}
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
          hitSlop={6}
          accessibilityLabel="Clubs"
          accessibilityRole="tab"
        >
          <View style={[styles.iconContainer, isClubsActive && styles.iconContainerActive]}>
            <Building2
              size={20}
              color={isClubsActive ? '#15803D' : '#6B7280'}
              strokeWidth={isClubsActive ? 2.4 : 1.8}
            />
          </View>
          <AppText
            style={[styles.navLabel, isClubsActive && styles.navLabelActive]}
            numberOfLines={1}
          >
            Clubs
          </AppText>
        </Pressable>

        {/* 4. Users */}
        <Pressable
          onPress={() => handleNavigate('/platform/users')}
          style={styles.navItem}
          hitSlop={6}
          accessibilityLabel="Users"
          accessibilityRole="tab"
        >
          <View style={[styles.iconContainer, isUsersActive && styles.iconContainerActive]}>
            <Users
              size={20}
              color={isUsersActive ? '#15803D' : '#6B7280'}
              strokeWidth={isUsersActive ? 2.4 : 1.8}
            />
          </View>
          <AppText
            style={[styles.navLabel, isUsersActive && styles.navLabelActive]}
            numberOfLines={1}
          >
            Users
          </AppText>
        </Pressable>

        {/* 5. More / Menu Drawer */}
        <TouchableOpacity
          onPress={openDrawer}
          style={styles.navItem}
          hitSlop={6}
          accessibilityLabel="More options"
          accessibilityRole="button"
        >
          <View style={[styles.iconContainer, isMoreActive && styles.iconContainerActive]}>
            <MoreHorizontal
              size={20}
              color={isMoreActive ? '#15803D' : '#6B7280'}
              strokeWidth={isMoreActive ? 2.4 : 1.8}
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
    borderTopColor: '#F3F4F6',
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  navRow: {
    flexDirection: 'row',
    height: 56,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 4,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  iconContainer: {
    width: 44,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderRadius: Radius.full,
  },
  iconContainerActive: {
    backgroundColor: '#EBF5ED',
    width: 48,
    height: 28,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 2,
  },
  navLabelActive: {
    color: '#15803D',
    fontWeight: '700',
  },
  badgePillWarning: {
    position: 'absolute',
    top: -2,
    right: 4,
    backgroundColor: '#D97706',
    borderRadius: Radius.full,
    minWidth: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgePillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
