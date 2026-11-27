/**
 * Player Portal Layout — Stack + Drawer + Bottom Navigation
 *
 * Canonical URL namespace: /player/...
 * Ensures auth & role boundaries resolve BEFORE showing Player UI,
 * and handles Android hardware back cleanly when deep-linked.
 */

import React, { useEffect } from 'react';
import { BackHandler, Platform, StyleSheet, View } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';

import { AppDrawer, AppBottomNav, DrawerOverlay, LoadingState } from '@/components';
import { useDrawerStore } from '@/navigation';
import { useAuthStore } from '@/store';
import { Colors } from '@/theme';
import {
  getCurrentRelativeUrl,
  getDefaultHomeForRole,
  resolveRoleContext,
} from '@/utils';

export default function PlayerLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const activePortal = useAuthStore((s) => s.activePortal);
  const memberships = useAuthStore((s) => s.memberships);
  const activeMembership = useAuthStore((s) => s.activeMembership);

  const roleCtx = resolveRoleContext({
    isAuthenticated,
    user,
    memberships,
    activeMembership,
    activePortal,
  });
  const isAuthorizedPlayer =
    !isLoading && isAuthenticated && !roleCtx.isPlatformAdmin && !roleCtx.hasClubStaff;

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      const currentUrl = getCurrentRelativeUrl(pathname);
      router.replace({
        pathname: '/(auth)/login' as any,
        params: currentUrl && currentUrl !== '/' ? { portal: 'player', redirect: currentUrl } : { portal: 'player' },
      });
      return;
    }

    if (roleCtx.isPlatformAdmin || roleCtx.hasClubStaff) {
      router.replace(getDefaultHomeForRole(roleCtx) as any);
    }
  }, [isAuthenticated, isLoading, roleCtx.isPlatformAdmin, roleCtx.hasClubStaff, pathname, router]);

  // Android hardware back: close drawer if open; otherwise pop stack or return to Player Home when deep-linked
  useEffect(() => {
    if (Platform.OS === 'web' || !isAuthorizedPlayer) return;
    const onBackPress = () => {
      const { isOpen, closeDrawer } = useDrawerStore.getState();
      if (isOpen) {
        closeDrawer();
        return true;
      }
      if (router.canGoBack()) {
        return false; // Let Stack pop naturally
      }
      const cleanPath = pathname.replace(/\/+$/, '') || '/player';
      if (cleanPath !== '/player' && cleanPath !== '/player/index') {
        router.replace('/player' as any);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [isAuthorizedPlayer, pathname, router]);

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
          <Stack.Screen name="profile" />
          <Stack.Screen name="explore-clubs" />
          <Stack.Screen name="club-details" />
          <Stack.Screen name="clubs" />
          <Stack.Screen name="book-court-club" />
          <Stack.Screen name="courts" />
          <Stack.Screen name="bookings" />
          <Stack.Screen name="membership" />
          <Stack.Screen name="payments" />
          <Stack.Screen name="tournaments" />
          <Stack.Screen name="tournament-details" />
          <Stack.Screen name="leagues" />
          <Stack.Screen name="league-details" />
          <Stack.Screen name="competition-schedule" />
          <Stack.Screen name="events" />
          <Stack.Screen name="upcoming-activities" />
          <Stack.Screen name="lessons" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="help-support" />
        </Stack>
      </View>

      {/* Global Bottom Navigation for Player */}
      <AppBottomNav mode="player" />

      {/* Drawer system — renders above the Stack & Bottom Nav */}
      <DrawerOverlay />
      <AppDrawer mode="player" />

      {!isAuthorizedPlayer && (
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
