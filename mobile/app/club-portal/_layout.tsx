/**
 * Club Portal Layout — Stack + Drawer + Bottom Navigation
 *
 * Canonical URL namespace: /club-portal/...
 * Enforces authentication, staff membership, granular permissions,
 * and Android hardware back navigation cleanly.
 */

import React, { useEffect } from 'react';
import { BackHandler, Platform, StyleSheet, View } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';

import { AppDrawer, AppBottomNav, DrawerOverlay, LoadingState } from '@/components';
import { useDrawerStore } from '@/navigation';
import { useAuthStore } from '@/store';
import { usePermission } from '@/hooks';
import { Colors } from '@/theme';
import {
  getClubRedirectTarget,
  getCurrentRelativeUrl,
  resolveRoleContext,
} from '@/utils';

export default function ClubLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const memberships = useAuthStore((s) => s.memberships);
  const activeMembership = useAuthStore((s) => s.activeMembership);
  const activePortal = useAuthStore((s) => s.activePortal);
  const permissions = usePermission();

  const roleCtx = resolveRoleContext({
    isAuthenticated,
    user,
    memberships,
    activeMembership,
    activePortal,
  });
  const isRegisterClubPath = pathname === '/club-portal/register-club' || pathname.startsWith('/club-portal/register-club');
  const isAuthorizedClub =
    !isLoading &&
    isAuthenticated &&
    ((!roleCtx.isPlatformAdmin && roleCtx.hasClubStaff) || isRegisterClubPath);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      const currentUrl = getCurrentRelativeUrl(pathname);
      router.replace({
        pathname: '/(auth)/login' as any,
        params: currentUrl && currentUrl !== '/' ? { portal: 'club', redirect: currentUrl } : { portal: 'club' },
      });
      return;
    }

    if (roleCtx.isPlatformAdmin && memberships.length === 0) {
      router.replace('/platform' as any);
      return;
    }

    if (isRegisterClubPath) {
      return;
    }

    if (memberships.length === 0) {
      router.replace('/player' as any);
      return;
    }

    // Club Owner has full access to all club routes
    if (permissions.isOwner) {
      return;
    }

    // Tournament Director: Competitions only
    if (permissions.isTournamentDirector) {
      const tdRestricted = [
        '/club-portal/members',
        '/club-portal/membership-requests',
        '/club-portal/courts',
        '/club-portal/bookings',
        '/club-portal/memberships',
        '/club-portal/payments',
        '/club-portal/analytics',
        '/club-portal/lessons',
        '/club-portal/club-details',
      ];
      if (tdRestricted.some((r) => pathname.startsWith(r))) {
        router.replace('/club-portal/tournaments' as any);
        return;
      }
      if (pathname === '/club-portal' || pathname === '/club-portal/' || pathname === '/club-portal/index') {
        router.replace('/club-portal/tournaments' as any);
        return;
      }
      return;
    }

    // Permission-driven route enforcement for managers, custom roles, and staff
    const fallbackRoute = permissions.canManageTournaments ? '/club-portal/tournaments' : '/club-portal';

    if (pathname.startsWith('/club-portal/payments') && !permissions.canManagePayments) {
      router.replace(fallbackRoute as any);
      return;
    }
    if (pathname.startsWith('/club-portal/members') && !(permissions.canManageMembers || permissions.canManageRoles)) {
      router.replace(fallbackRoute as any);
      return;
    }
    if (pathname.startsWith('/club-portal/courts') && !permissions.canManageCourts) {
      router.replace(fallbackRoute as any);
      return;
    }
    if (pathname.startsWith('/club-portal/bookings') && !permissions.canManageBookings) {
      router.replace(fallbackRoute as any);
      return;
    }
    if (
      (pathname.startsWith('/club-portal/memberships') || pathname.startsWith('/club-portal/membership-requests')) &&
      !permissions.canManageMemberships
    ) {
      router.replace(fallbackRoute as any);
      return;
    }
    if (pathname.startsWith('/club-portal/events') && !permissions.canManageEvents) {
      router.replace(fallbackRoute as any);
      return;
    }
    if (pathname.startsWith('/club-portal/lessons') && !permissions.canManageLessons) {
      router.replace(fallbackRoute as any);
      return;
    }
    if (
      (pathname.startsWith('/club-portal/tournaments') ||
        pathname.startsWith('/club-portal/tournament-details') ||
        pathname.startsWith('/club-portal/bracket') ||
        pathname.startsWith('/club-portal/pool-play') ||
        pathname.startsWith('/club-portal/round-robin') ||
        pathname.startsWith('/club-portal/scramble')) &&
      !permissions.canManageTournaments
    ) {
      router.replace('/club-portal' as any);
      return;
    }
    if (
      (pathname.startsWith('/club-portal/leagues') || pathname.startsWith('/club-portal/league-details')) &&
      !(permissions.canManageLeagues || permissions.canManageTournaments)
    ) {
      router.replace('/club-portal' as any);
      return;
    }
    if (pathname.startsWith('/club-portal/analytics') && !permissions.canManageReports) {
      router.replace(fallbackRoute as any);
      return;
    }
    if (pathname.startsWith('/club-portal/club-details') && !permissions.canManageClub) {
      router.replace(fallbackRoute as any);
      return;
    }
  }, [
    isAuthenticated,
    isLoading,
    roleCtx.isPlatformAdmin,
    isRegisterClubPath,
    memberships,
    activeMembership,
    pathname,
    router,
    permissions,
  ]);

  // Android hardware back: close drawer if open; otherwise pop stack or return to club home when deep-linked
  useEffect(() => {
    if (Platform.OS === 'web' || !isAuthorizedClub) return;
    const clubHome = getClubRedirectTarget(activeMembership || memberships[0]);
    const onBackPress = () => {
      const { isOpen, closeDrawer } = useDrawerStore.getState();
      if (isOpen) {
        closeDrawer();
        return true;
      }
      if (router.canGoBack()) {
        return false;
      }
      const cleanPath = pathname.replace(/\/+$/, '') || '/club-portal';
      if (cleanPath !== clubHome && cleanPath !== '/club-portal/index') {
        router.replace(clubHome as any);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [isAuthorizedClub, pathname, router, activeMembership, memberships]);

  return (
    <View style={styles.container}>
      <View style={styles.stackWrapper}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background.primary },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="members" />
          <Stack.Screen name="membership-requests" />
          <Stack.Screen name="register-club" />
          <Stack.Screen name="tournaments" />
          <Stack.Screen name="tournament-details" />
          <Stack.Screen name="pool-play" />
          <Stack.Screen name="round-robin" />
          <Stack.Screen name="bracket" />
          <Stack.Screen name="scramble" />
          <Stack.Screen name="leagues" />
          <Stack.Screen name="league-details" />
          <Stack.Screen name="courts" />
          <Stack.Screen name="bookings" />
          <Stack.Screen name="memberships" />
          <Stack.Screen name="payments" />
          <Stack.Screen name="analytics" />
          <Stack.Screen name="events" />
          <Stack.Screen name="event-details" />
          <Stack.Screen name="events/[id]" />
          <Stack.Screen name="lessons" />
          <Stack.Screen name="lesson-details" />
          <Stack.Screen name="lessons/[id]" />
          <Stack.Screen name="competition-schedule" />
          <Stack.Screen name="competition-setup" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="club-details" />
          <Stack.Screen name="help-support" />
        </Stack>
      </View>

      {/* Global Bottom Navigation */}
      <AppBottomNav mode="club" />

      {/* Drawer system — renders above the Stack & Bottom Nav */}
      <DrawerOverlay />
      <AppDrawer mode="club" />

      {!isAuthorizedClub && (
        <View style={styles.guardOverlay} pointerEvents="auto">
          <LoadingState message="Verifying access..." />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  stackWrapper: {
    flex: 1,
  },
  guardOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.background.primary,
    zIndex: 999,
  },
});
