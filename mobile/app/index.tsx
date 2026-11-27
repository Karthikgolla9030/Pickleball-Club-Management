/**
 * Root Index — Session check and routing decision.
 *
 * This screen is shown momentarily while auth state loads.
 * Once loaded, redirects to the appropriate experience:
 *   - Not authenticated → /auth/login
 *   - Has club membership → /club-portal
 *   - No club membership → /player
 *
 * The routing decision is based on backend-provided membership info.
 * The frontend never decides roles — only experience routing.
 */

import { useEffect } from 'react';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useAuthStore } from '@/store';
import { getDefaultHomeForRole, resolveRoleContext } from '@/utils';
import { LoadingState, Screen } from '@/components';

export default function IndexScreen() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const memberships = useAuthStore((s) => s.memberships);
  const activeMembership = useAuthStore((s) => s.activeMembership);
  const activePortal = useAuthStore((s) => s.activePortal);

  useEffect(() => {
    if (isLoading) return;
    if (!rootNavigationState?.key) return; // Wait for layout to mount

    if (!isAuthenticated) {
      router.replace('/(auth)/login');
      return;
    }

    const roleCtx = resolveRoleContext({
      isAuthenticated: true,
      user,
      memberships,
      activeMembership,
      activePortal,
    });
    router.replace(getDefaultHomeForRole(roleCtx) as any);
  }, [isLoading, isAuthenticated, user, memberships, activeMembership, activePortal, router, rootNavigationState?.key]);

  return (
    <Screen>
      <LoadingState message="Restoring your session..." />
    </Screen>
  );
}
