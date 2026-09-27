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
import { Colors } from '@/theme';

export default function ClubLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const memberships = useAuthStore((s) => s.memberships);
  const activeMembership = useAuthStore((s) => s.activeMembership);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
      return;
    }
    if (memberships.length === 0 || !activeMembership) {
      // Unauthorized: player accounts cannot access club management
      router.replace('/(player)');
      return;
    }

    // Role-specific route enforcement
    if (activeMembership.role === 'tournament_director') {
      const tdRestricted = [
        '/(club)/members',
        '/(club)/courts',
        '/(club)/bookings',
        '/(club)/memberships',
        '/(club)/payments',
        '/(club)/lessons',
      ];
      if (tdRestricted.some((r) => pathname.startsWith(r))) {
        router.replace('/(club)/tournaments');
      }
    }
  }, [isAuthenticated, isLoading, memberships, activeMembership, pathname, router]);

  return (
    <View style={styles.container}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background.primary },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="members" />
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
        <Stack.Screen name="events" />
        <Stack.Screen name="lessons" />
        <Stack.Screen name="competition-schedule" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="profile" />
      </Stack>

      {/* Global Fixed Bottom Navigation */}
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
});
