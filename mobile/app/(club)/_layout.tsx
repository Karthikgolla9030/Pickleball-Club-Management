/**
 * Club Group Layout — Stack + Drawer Navigation
 *
 * Replaces the overcrowded 14-tab bottom nav with:
 *   - Stack navigator (no visible headers — screens render AppHeader)
 *   - Slide-out AppDrawer + DrawerOverlay rendered as siblings
 *   - Permission-based nav item filtering is handled inside AppDrawer
 *
 * IMPORTANT: Tab-level permission gating has moved into
 * src/navigation/navigationConfig.ts + AppDrawer. The Stack
 * registers all screens — AppDrawer controls which are visible.
 *
 * Direct URL access to hidden screens is UX only.
 * Backend always enforces authorization server-side.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack, useRouter, usePathname } from 'expo-router';

import { AppDrawer, AppBottomNav, DrawerOverlay } from '@/components';
import { useAuthStore } from '@/store';
import { usePermission } from '@/hooks';
import { isPlatformAdminEmail } from '@/constants';
import { Colors } from '@/theme';

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

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/(auth)/login?portal=club');
      return;
    }

    // Platform Admin users without club staff memberships must stay in the Platform portal
    const isPlatformAdmin = Boolean(
      user?.is_platform_admin || isPlatformAdminEmail(user?.email) || activePortal === 'platform'
    );
    if (isPlatformAdmin && memberships.length === 0) {
      router.replace('/platform' as any);
      return;
    }

    // Allow club registration for authenticated users
    if (pathname === '/(club)/register-club' || pathname.startsWith('/(club)/register-club')) {
      return;
    }

    if (memberships.length === 0 || !activeMembership) {
      // Unauthorized: player accounts cannot access club management
      router.replace('/(player)');
      return;
    }

    // Role-specific route enforcement and access guards
    // Club Owner has full access to all club routes
    if (permissions.isOwner) {
      return;
    }

    // Tournament Director: Competitions only
    if (permissions.isTournamentDirector) {
      const tdRestricted = [
        '/(club)/members',
        '/(club)/membership-requests',
        '/(club)/courts',
        '/(club)/bookings',
        '/(club)/memberships',
        '/(club)/payments',
        '/(club)/analytics',
        '/(club)/lessons',
        '/(club)/club-details',
      ];
      if (tdRestricted.some((r) => pathname.startsWith(r))) {
        router.replace('/(club)/tournaments');
        return;
      }
      if (pathname === '/(club)' || pathname === '/(club)/' || pathname === '/(club)/index') {
        router.replace('/(club)/tournaments');
        return;
      }
      return;
    }

    // Permission-driven route enforcement for managers, custom roles, and staff
    const fallbackCompetitionRoute = permissions.canManageTournaments ? '/(club)/tournaments' : '/(club)';

    // Payments guard
    if (pathname.startsWith('/(club)/payments') && !permissions.canManagePayments) {
      router.replace(fallbackCompetitionRoute as any);
      return;
    }

    // Members guard
    if (pathname.startsWith('/(club)/members') && !(permissions.canManageMembers || permissions.canManageRoles)) {
      router.replace(fallbackCompetitionRoute as any);
      return;
    }

    // Courts guard
    if (pathname.startsWith('/(club)/courts') && !permissions.canManageCourts) {
      router.replace(fallbackCompetitionRoute as any);
      return;
    }

    // Bookings guard
    if (pathname.startsWith('/(club)/bookings') && !permissions.canManageBookings) {
      router.replace(fallbackCompetitionRoute as any);
      return;
    }

    // Memberships guard
    if (
      (pathname.startsWith('/(club)/memberships') || pathname.startsWith('/(club)/membership-requests')) &&
      !permissions.canManageMemberships
    ) {
      router.replace(fallbackCompetitionRoute as any);
      return;
    }

    // Events guard
    if (pathname.startsWith('/(club)/events') && !permissions.canManageEvents) {
      router.replace(fallbackCompetitionRoute as any);
      return;
    }

    // Lessons guard
    if (pathname.startsWith('/(club)/lessons') && !permissions.canManageLessons) {
      router.replace(fallbackCompetitionRoute as any);
      return;
    }

    // Tournaments guard
    if (
      (pathname.startsWith('/(club)/tournaments') ||
        pathname.startsWith('/(club)/tournament-details') ||
        pathname.startsWith('/(club)/bracket') ||
        pathname.startsWith('/(club)/pool-play') ||
        pathname.startsWith('/(club)/round-robin') ||
        pathname.startsWith('/(club)/scramble')) &&
      !permissions.canManageTournaments
    ) {
      router.replace('/(club)' as any);
      return;
    }

    // Leagues guard
    if (
      (pathname.startsWith('/(club)/leagues') || pathname.startsWith('/(club)/league-details')) &&
      !(permissions.canManageLeagues || permissions.canManageTournaments)
    ) {
      router.replace('/(club)' as any);
      return;
    }

    // Analytics / Reports guard
    if (pathname.startsWith('/(club)/analytics') && !permissions.canManageReports) {
      router.replace(fallbackCompetitionRoute as any);
      return;
    }

    // Club Details guard
    if (pathname.startsWith('/(club)/club-details') && !permissions.canManageClub) {
      router.replace(fallbackCompetitionRoute as any);
      return;
    }
  }, [
    isAuthenticated,
    isLoading,
    memberships,
    activeMembership,
    pathname,
    router,
    permissions,
  ]);

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
});
