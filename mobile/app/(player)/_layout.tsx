/**
 * Player Group Layout — Stack + Drawer Navigation
 *
 * Replaces the overcrowded 12-tab bottom nav with:
 *   - Stack navigator (no visible headers — screens render AppHeader)
 *   - Slide-out AppDrawer + DrawerOverlay rendered as siblings
 *
 * All screens still live in the (player)/ directory.
 * File-based routing is preserved — only the layout wrapper changes.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { AppDrawer, AppBottomNav, DrawerOverlay } from '@/components';
import { useAuthStore } from '@/store';
import { Colors } from '@/theme';

export default function PlayerLayout() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
    }
  }, [isAuthenticated, isLoading, router]);

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
        <Stack.Screen name="profile" />
        <Stack.Screen name="clubs" />
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
        <Stack.Screen name="lessons" />
        <Stack.Screen name="notifications" />
      </Stack>

      {/* Global Fixed Bottom Navigation for Player */}
      <AppBottomNav mode="player" />

      {/* Drawer system — renders above the Stack & Bottom Nav */}
      <DrawerOverlay />
      <AppDrawer mode="player" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
});
