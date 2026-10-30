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
import { blurActiveElement } from '@/utils';
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore, registerLogoutHandler } from '@/store';
import { isPlatformAdminEmail } from '@/constants';
import { WebSocketProvider } from '@/context/WebSocketContext';
import { PendingAcceptancesModal } from '@/components/legal/PendingAcceptancesModal';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10,   // 10 minutes
    },
    mutations: {
      retry: 0,
    },
  },
});

function RootLayoutContent() {
  const initialize = useAuthStore((s) => s.initialize);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const memberships = useAuthStore((s) => s.memberships);
  const activeMembership = useAuthStore((s) => s.activeMembership);
  const activePortal = useAuthStore((s) => s.activePortal);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Clear lingering DOM focus when changing routes to eliminate aria-hidden violations
  useEffect(() => {
    blurActiveElement();
  }, [segments]);

  const rootSegment = segments[0] as string | undefined;

  // Centralized Route Guard: enforces authentication, role boundaries, and portal isolation
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = rootSegment === '(auth)';
    const isPublicClubRoute = rootSegment === 'club';
    const isPublicLegalRoute = rootSegment === 'legal';

    // 1. Unauthenticated route protection
    if (!isAuthenticated) {
      if (!inAuthGroup && !isPublicClubRoute && !isPublicLegalRoute) {
        if (rootSegment === 'platform') {
          router.replace('/platform/login' as any);
        } else {
          router.replace('/(auth)/login');
        }
      }
      return;
    }

    // 2. Strict portal & role boundaries for authenticated users:
    const isPlatformAdmin = Boolean(
      user?.is_platform_admin || isPlatformAdminEmail(user?.email) || activePortal === 'platform'
    );

    // A. Already-authenticated users must NEVER be stuck on login screens (e.g. after mobile browser Back)
    if (inAuthGroup || (rootSegment === 'platform' && segments[1] === 'login')) {
      if (isPlatformAdmin) {
        router.replace('/platform' as any);
      } else if (activePortal === 'club' || (memberships.length > 0 && activeMembership)) {
        router.replace('/(club)');
      } else {
        router.replace('/(player)');
      }
      return;
    }

    // B. Platform portal is strictly reserved for authorized platform administrators
    if (rootSegment === 'platform' && segments[1] !== 'login') {
      if (!isPlatformAdmin) {
        if (memberships.length > 0) {
          router.replace('/(club)');
        } else {
          router.replace('/(player)');
        }
        return;
      }
    }

    // B. Platform Admin must NEVER be placed in Player or Club portals
    if (isPlatformAdmin) {
      if (rootSegment === '(player)' || rootSegment === '(club)') {
        router.replace('/platform' as any);
        return;
      }
    }

    // C. Non-staff players cannot enter club management screens
    if (rootSegment === '(club)') {
      if (memberships.length === 0 || !activeMembership) {
        router.replace('/(player)');
        return;
      }
    }
  }, [isLoading, isAuthenticated, user, memberships, activeMembership, activePortal, rootSegment, segments, router]);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(player)" />
        <Stack.Screen name="(club)" />
        <Stack.Screen name="platform" />
        <Stack.Screen name="club" />
        <Stack.Screen name="legal" />
      </Stack>
      <PendingAcceptancesModal />
    </>
  );
}

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
