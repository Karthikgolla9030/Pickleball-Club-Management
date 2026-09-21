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

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store';

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

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(player)" />
        <Stack.Screen name="(club)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <RootLayoutContent />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
