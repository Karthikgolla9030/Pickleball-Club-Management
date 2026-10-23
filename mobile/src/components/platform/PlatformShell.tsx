/**
 * Pickleball — Platform Admin Shell
 *
 * Mobile-first administrative shell for authorized platform owners:
 * - App-like layout with top header, fixed thumb-reachable bottom nav, and slide-out drawer
 * - Active session verification & unauthorized redirect
 * - Live badge counts for pending applications and open support tickets
 * - Smooth drawer animation and dark dismiss overlay
 * - Responsive support for mobile, tablet, and desktop viewports
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, DrawerOverlay, Screen } from '@/components';
import {
  platformApplicationsApi,
  PlatformOwnerProfile,
} from '@/services/api/clubApplications';
import { useAuthStore } from '@/store';
import { Colors, Spacing } from '@/theme';

import { PlatformBottomNav } from './PlatformBottomNav';
import { PlatformDrawer } from './PlatformDrawer';
import { PlatformHeader, PlatformTabKey } from './PlatformHeader';

export type { PlatformTabKey };

interface PlatformShellProps {
  activeTab: PlatformTabKey;
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  children: React.ReactNode;
  scrollable?: boolean;
}

export function PlatformShell({
  activeTab,
  title,
  subtitle,
  headerRight,
  onRefresh,
  isRefreshing = false,
  children,
  scrollable = false,
}: PlatformShellProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const logout = useAuthStore((s) => s.logout);

  const [adminUser, setAdminUser] = useState<PlatformOwnerProfile | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const [badgeCounts, setBadgeCounts] = useState<{
    pendingApplications?: number;
    openTickets?: number;
  }>({});

  const isDesktop = width >= 800;

  useEffect(() => {
    let isMounted = true;
    async function verifyAuthAndFetchBadges() {
      try {
        const profile = await platformApplicationsApi.getPlatformMe();
        if (!isMounted) return;
        setAdminUser(profile);
        setIsVerifying(false);

        // Fetch counts for badges non-blockingly
        try {
          const [appsRes, ticketsRes] = await Promise.all([
            platformApplicationsApi.listApplications('pending', 1, 1).catch(() => null),
            platformApplicationsApi.listSupportTickets({ status: 'open', pageSize: 1 }).catch(() => null),
          ]);
          if (isMounted) {
            setBadgeCounts({
              pendingApplications: appsRes?.counts?.pending ?? appsRes?.total ?? 0,
              openTickets: ticketsRes?.status_counts?.open ?? ticketsRes?.total ?? 0,
            });
          }
        } catch {
          // Non-critical badge count error
        }
      } catch (err: any) {
        if (isMounted) {
          setIsVerifying(false);
          await logout();
          router.replace('/platform/login' as any);
        }
      }
    }
    verifyAuthAndFetchBadges();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await logout();
    } finally {
      router.replace('/platform/login' as any);
    }
  };

  if (isVerifying) {
    return (
      <Screen style={styles.screen}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#18794E" />
          <AppText variant="bodySmall" color="secondary" style={styles.loadingText}>
            Verifying platform administrative authorization...
          </AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      {/* Slide-out Menu Drawer */}
      <PlatformDrawer adminUser={adminUser} counts={badgeCounts} />
      <DrawerOverlay />

      {/* Top Header */}
      <PlatformHeader
        activeTab={activeTab}
        title={title}
        subtitle={subtitle}
        adminUser={adminUser}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
        rightElement={headerRight}
        onSignOut={handleSignOut}
      />

      {/* Main Content Area */}
      {(() => {
        const mobileBottomNavHeight = 56 + Math.max(insets.bottom, 12);
        if (scrollable) {
          return (
            <ScrollView
              style={styles.contentScrollView}
              contentContainerStyle={[
                styles.scrollContentContainer,
                {
                  paddingBottom: isDesktop
                    ? Math.max(insets.bottom, 24) + 32
                    : mobileBottomNavHeight + 36,
                },
              ]}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.contentInnerMaxWidth}>{children}</View>
            </ScrollView>
          );
        }
        return (
          <View
            style={[
              styles.staticContentContainer,
              {
                paddingBottom: isDesktop
                  ? Math.max(insets.bottom, 24) + 16
                  : mobileBottomNavHeight + 12,
              },
            ]}
          >
            <View style={styles.contentInnerMaxWidthFlex}>{children}</View>
          </View>
        );
      })()}

      {/* Bottom Navigation Bar on Mobile / Tablet */}
      <PlatformBottomNav
        pendingApplicationsCount={badgeCounts.pendingApplications}
        openTicketsCount={badgeCounts.openTickets}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
  },
  contentScrollView: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  staticContentContainer: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  contentInnerMaxWidth: {
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
  },
  contentInnerMaxWidthFlex: {
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
    flex: 1,
  },
});
