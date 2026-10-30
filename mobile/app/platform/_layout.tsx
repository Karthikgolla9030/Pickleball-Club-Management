/**
 * Aught2 Pickleball — Platform Administration Layout
 *
 * Dedicated Stack layout for the Platform Administration portal.
 * Statically mounts the platform stack without conditional navigator branching
 * to prevent maximum update depth and blank screen errors.
 */

import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useAuthStore } from '@/store';
import { isPlatformAdminEmail } from '@/constants';

export default function PlatformLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const memberships = useAuthStore((s) => s.memberships);

  useEffect(() => {
    if (isLoading) return;
    if (pathname === '/platform/login') return;

    if (!isAuthenticated) {
      router.replace('/platform/login' as any);
      return;
    }

    const isPlatformAdmin = Boolean(user?.is_platform_admin || isPlatformAdminEmail(user?.email));
    if (!isPlatformAdmin) {
      // Non-platform-administrators cannot access platform portal
      if (memberships.length > 0) {
        router.replace('/(club)');
      } else {
        router.replace('/(player)');
      }
    }
  }, [isAuthenticated, isLoading, user, memberships, pathname, router]);

  return (
    <View style={styles.container}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#F8FAF9' },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="login" />
        <Stack.Screen name="index" />
        <Stack.Screen name="applications" />
        <Stack.Screen name="clubs" />
        <Stack.Screen name="users" />
        <Stack.Screen name="audit" />
        <Stack.Screen name="support" />
        <Stack.Screen name="banners" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="legal" />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
});
