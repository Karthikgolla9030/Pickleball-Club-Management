/**
 * Root Layout — Expo Router entry point.
 *
 * Responsibilities:
 *   1. Initialize auth state from SecureStore on app launch
 *   2. Provide QueryClient (TanStack Query) to all screens
 *   3. Provide SafeAreaProvider to all screens
 *   4. Route to correct experience based on auth state
 *
 * Routing logic:
 *   Not authenticated → (auth) group
 *   Authenticated + club membership → (club) group
 *   Authenticated + no club membership → (player) group
 */

import '@/utils/alertPolyfill';
import '@/utils/webA11yPolyfill';
import {
  blurActiveElement,
  getCurrentRelativeUrl,
  getDefaultHomeForRole,
  isRedirectAllowedForRole,
  resolveRoleContext,
} from '@/utils';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, usePathname, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/services/queryClient';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore, registerLogoutHandler } from '@/store';
import { LoadingState } from '@/components';
import { Colors } from '@/theme';
import { WebSocketProvider } from '@/context/WebSocketContext';
import { PendingAcceptancesModal } from '@/components/legal/PendingAcceptancesModal';
import { usePlatformBanners } from '@/hooks/usePlatformBanners';
import { usePlatformBranding } from '@/hooks/usePlatformBranding';
import { initPlatformBrandingStorage } from '@/services/platformBrandingStorage';

function RootLayoutContent() {
  // Prefetch and hydrate global platform branding & banners across all portals
  usePlatformBranding();
  usePlatformBanners();

  const initialize = useAuthStore((s) => s.initialize);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const memberships = useAuthStore((s) => s.memberships);
  const activeMembership = useAuthStore((s) => s.activeMembership);
  const activePortal = useAuthStore((s) => s.activePortal);
  const segments = useSegments();
  const pathname = usePathname();
  const rootNavigationState = useRootNavigationState();
  const router = useRouter();

  useEffect(() => {
    initPlatformBrandingStorage();
    initialize();
  }, [initialize]);

  // Clear lingering DOM focus when changing routes to eliminate aria-hidden violations
  useEffect(() => {
    blurActiveElement();
  }, [segments]);

  const rootSegment = segments[0] as string | undefined;
  const isPublicClubRoute = rootSegment === 'club';
  const isPublicLegalRoute = rootSegment === 'legal';
  const isPublicRoute = isPublicClubRoute || isPublicLegalRoute;

  // Centralized Route Guard: enforces authentication, role boundaries, and portal isolation
  useEffect(() => {
    if (isLoading || !rootNavigationState?.key) return;

    const inAuthGroup = rootSegment === '(auth)';

    const segmentList = segments as string[];

    // Let +not-found handle legacy bookmark resolution before enforcing guards
    if (rootSegment === '+not-found') return;

    // 1. Unauthenticated route protection with intended destination preservation
    if (!isAuthenticated) {
      if (!inAuthGroup && !isPublicRoute) {
        const currentUrl = getCurrentRelativeUrl(pathname);
        if (rootSegment === 'platform') {
          if (segmentList[1] !== 'login') {
            router.replace({
              pathname: '/platform/login' as any,
              params: currentUrl && currentUrl !== '/' ? { redirect: currentUrl } : undefined,
            });
          }
        } else {
          const targetPortal = rootSegment === 'club-portal' ? 'club' : 'player';
          const params: Record<string, string> = { portal: targetPortal };
          if (currentUrl && currentUrl !== '/' && currentUrl !== '/login') {
            params.redirect = currentUrl;
          }
          router.replace({
            pathname: '/(auth)/login' as any,
            params,
          });
        }
      }
      return;
    }

    // 2. Strict portal & role boundaries for authenticated users (source of truth: backend)
    const roleCtx = resolveRoleContext({
      isAuthenticated: true,
      user,
      memberships,
      activeMembership,
      activePortal,
    });
    const portalHome = getDefaultHomeForRole(roleCtx);

    // A. Already-authenticated users must NEVER remain on login screens
    if (inAuthGroup || (rootSegment === 'platform' && segmentList[1] === 'login')) {
      const searchRedirect =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('redirect')
          : null;
      if (searchRedirect && isRedirectAllowedForRole(searchRedirect, roleCtx)) {
        router.replace(searchRedirect as any);
      } else {
        router.replace(portalHome as any);
      }
      return;
    }

    // B. Platform portal is strictly reserved for authorized platform administrators
    if (rootSegment === 'platform' && segmentList[1] !== 'login' && !roleCtx.isPlatformAdmin) {
      router.replace(portalHome as any);
      return;
    }

    // C. Platform Admin must NEVER be placed in Player or Club portals
    if (roleCtx.isPlatformAdmin && (rootSegment === 'player' || rootSegment === 'club-portal')) {
      router.replace('/platform' as any);
      return;
    }

    // D. Club Staff & Club Owners must NEVER be placed into Player portal
    if (roleCtx.hasClubStaff && rootSegment === 'player') {
      router.replace(portalHome as any);
      return;
    }

    // E. Non-staff players cannot enter club management screens (except club registration)
    if (
      rootSegment === 'club-portal' &&
      !roleCtx.hasClubStaff &&
      !roleCtx.isPlatformAdmin &&
      segmentList[1] !== 'register-club'
    ) {
      router.replace('/player' as any);
      return;
    }
  }, [
    isLoading,
    isAuthenticated,
    rootNavigationState?.key,
    user,
    memberships,
    activeMembership,
    activePortal,
    rootSegment,
    segments,
    pathname,
    isPublicRoute,
    router,
  ]);

  const showAuthLoadingOverlay = isLoading && !isPublicRoute;

  return (
    <View style={styles.rootContainer}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="player" />
        <Stack.Screen name="club-portal" />
        <Stack.Screen name="platform" />
        <Stack.Screen name="club" />
        <Stack.Screen name="legal" />
      </Stack>
      {showAuthLoadingOverlay && (
        <View style={styles.loadingOverlay} pointerEvents="auto">
          <LoadingState message="Restoring your session..." />
        </View>
      )}
      <PendingAcceptancesModal />
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.background.primary,
    zIndex: 9999,
  },
});

export default function RootLayout() {
  // Register queryClient cache clearing on logout
  useEffect(() => {
    return registerLogoutHandler(() => {
      queryClient.clear();
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <WebSocketProvider>
          <RootLayoutContent />
        </WebSocketProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
