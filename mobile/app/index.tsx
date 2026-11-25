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
import { isPlatformAdminEmail } from '@/constants';
import { LoadingState } from '@/components';
import { Screen } from '@/components';

export default function IndexScreen() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const memberships = useAuthStore((s) => s.memberships);
  const activePortal = useAuthStore((s) => s.activePortal);

  useEffect(() => {
    if (isLoading) return;
    if (!rootNavigationState?.key) return; // Wait for layout to mount

    if (!isAuthenticated) {
      router.replace('/(auth)/login');
      return;
    }

    const isPlatformAdmin = Boolean(
      user?.is_platform_admin || isPlatformAdminEmail(user?.email) || activePortal === 'platform'
    );
    const hasClubStaff = Boolean(memberships && memberships.length > 0);

    // Route based on authenticated portal and backend-verified credentials
    if (isPlatformAdmin) {
      router.replace('/platform' as any);
      return;
    }

    if (hasClubStaff) {
      router.replace('/(club)');
      return;
    }

    router.replace('/(player)');
  }, [isLoading, isAuthenticated, user, memberships, activePortal, router, rootNavigationState?.key]);

  return (
    <Screen>
      <LoadingState message="Starting Pickleball..." />
    </Screen>
  );
}
