/**
 * useAuth — Primary auth hook.
 * Provides current user, session state, and auth actions.
 */

import { useAuthStore } from '@/store';

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const memberships = useAuthStore((s) => s.memberships);
  const activeMembership = useAuthStore((s) => s.activeMembership);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const setActiveMembership = useAuthStore((s) => s.setActiveMembership);
  const clearError = useAuthStore((s) => s.clearError);

  return {
    user,
    memberships,
    activeMembership,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    setActiveMembership,
    clearError,

    // Convenience
    hasClubMembership: memberships.length > 0,
    isMultiClub: memberships.length > 1,
    activeRole: activeMembership?.role ?? null,
    activeClubName: activeMembership?.club_name ?? null,
  };
}
