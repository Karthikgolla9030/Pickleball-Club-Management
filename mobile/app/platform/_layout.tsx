/**
 * Aught2 Pickleball — Platform Administration Layout
 *
 * Dedicated Stack layout for the Platform Administration portal.
 * Statically mounts the platform stack without conditional navigator branching
 * to prevent maximum update depth and blank screen errors.
 */

import React, { useEffect } from 'react';
import { BackHandler, Platform, StyleSheet, View } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { LoadingState } from '@/components';
import { useDrawerStore } from '@/navigation';
import { useAuthStore } from '@/store';
import {
  getCurrentRelativeUrl,
  getDefaultHomeForRole,
  resolveRoleContext,
} from '@/utils';

export default function PlatformLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const memberships = useAuthStore((s) => s.memberships);
  const activeMembership = useAuthStore((s) => s.activeMembership);
  const activePortal = useAuthStore((s) => s.activePortal);

  const isLoginRoute = pathname === '/platform/login';
  const roleCtx = resolveRoleContext({
    isAuthenticated,
    user,
    memberships,
    activeMembership,
    activePortal,
  });
  const isAuthorizedPlatform =
    isLoginRoute || (!isLoading && isAuthenticated && roleCtx.isPlatformAdmin);

  useEffect(() => {
    if (isLoading || isLoginRoute) return;

    if (!isAuthenticated) {
      const currentUrl = getCurrentRelativeUrl(pathname);
      router.replace({
        pathname: '/platform/login' as any,
        params: currentUrl && currentUrl !== '/platform/login' ? { redirect: currentUrl } : undefined,
      });
      return;
    }

    if (!roleCtx.isPlatformAdmin) {
      router.replace(getDefaultHomeForRole(roleCtx) as any);
    }
  }, [isAuthenticated, isLoading, isLoginRoute, roleCtx.isPlatformAdmin, roleCtx.hasClubStaff, pathname, router]);

  useEffect(() => {
    if (Platform.OS === 'web' || isLoginRoute || !isAuthorizedPlatform) return;
    const onBackPress = () => {
      const { isOpen, closeDrawer } = useDrawerStore.getState();
      if (isOpen) {
        closeDrawer();
        return true;
      }
      if (router.canGoBack()) {
        return false;
      }
      const cleanPath = pathname.replace(/\/+$/, '') || '/platform';
      if (cleanPath !== '/platform' && cleanPath !== '/platform/index') {
        router.replace('/platform' as any);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [isAuthorizedPlatform, isLoginRoute, pathname, router]);

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

      {!isAuthorizedPlatform && (
        <View style={styles.guardOverlay} pointerEvents="auto">
          <LoadingState message="Verifying platform administrative authorization..." />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  guardOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#F8FAF9',
    zIndex: 999,
  },
});
