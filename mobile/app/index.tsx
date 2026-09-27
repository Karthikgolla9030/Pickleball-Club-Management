/**
 * Root Index — Session check and routing decision.
 *
 * This screen is shown momentarily while auth state loads.
 * Once loaded, redirects to the appropriate experience:
 *   - Not authenticated → /auth/login
 *   - Has club membership → /(club)
 *   - No club membership → /(player)
 *
 * The routing decision is based on backend-provided membership info.
 * The frontend never decides roles — only experience routing.
 */

import { useEffect } from 'react';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useAuthStore } from '@/store';
import { LoadingState } from '@/components';
import { Screen } from '@/components';

export default function IndexScreen() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const memberships = useAuthStore((s) => s.memberships);

  useEffect(() => {
    if (isLoading) return;
    if (!rootNavigationState?.key) return; // Wait for layout to mount

    if (!isAuthenticated) {
      router.replace('/(auth)/login');
      return;
    }

    // Route based on backend-provided membership data
    if (memberships.length > 0) {
      router.replace('/(club)');
    } else {
      router.replace('/(player)');
    }
  }, [isLoading, isAuthenticated, memberships, router, rootNavigationState?.key]);

  return (
    <Screen>
      <LoadingState message="Starting Aught2 Pickleball..." />
    </Screen>
  );
}
