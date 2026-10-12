/**
 * useActiveClub — Access and manage the currently active club context.
 *
 * NOTE: The active club is purely a client-side selection/context.
 * It is NOT an authorization mechanism. The backend always verifies
 * user ID, club ID, active membership, and role permissions on every request.
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '@/store';
import { usePlayerClubs } from './usePlayerClubs';
import type { MembershipInfo } from '@/types';

export function useActiveClub() {
  const queryClient = useQueryClient();
  const activeMembership = useAuthStore((s) => s.activeMembership);
  const memberships = useAuthStore((s) => s.memberships);
  const setActiveMembership = useAuthStore((s) => s.setActiveMembership);

  // Multi-club context:
  // If activeMembership is valid and belongs to the user's memberships, use it.
  // Otherwise, default cleanly to the first available membership without hardcoding club names.
  const effectiveMembership =
    activeMembership && memberships.some((m) => m.membership_id === activeMembership.membership_id)
      ? activeMembership
      : memberships[0] ?? null;

  // Fallback to player's enrolled clubs if user has no staff memberships
  const { clubs: playerClubs } = usePlayerClubs();
  const playerPrimaryClub = playerClubs[0] ?? null;

  const resolvedClubId = effectiveMembership?.club_id ?? playerPrimaryClub?.club_id ?? null;
  const resolvedClubName = effectiveMembership?.club_name ?? playerPrimaryClub?.club_name ?? null;
  const resolvedClubSlug = effectiveMembership?.club_slug ?? playerPrimaryClub?.club_slug ?? null;

  const switchClub = useCallback(
    (membership: MembershipInfo) => {
      setActiveMembership(membership);
      // Invalidate all queries so fresh data is loaded for the new active club without leaking previous club data
      queryClient.invalidateQueries();
    },
    [setActiveMembership, queryClient],
  );

  return {
    activeMembership: effectiveMembership,
    clubId: resolvedClubId,
    clubName: resolvedClubName,
    clubSlug: resolvedClubSlug,
    role: effectiveMembership?.role ?? null,
    roleLabel: effectiveMembership?.role_label ?? null,
    isActive: effectiveMembership?.is_active ?? (playerPrimaryClub?.status === 'active'),
    allMemberships: memberships,
    // Enable switching whenever the user belongs to multiple clubs
    canSwitchClub: memberships.length > 1,
    hasClubContext: Boolean(effectiveMembership || playerPrimaryClub),
    switchClub,
    setActiveMembership,
  };
}
