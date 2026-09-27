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

  // ENFORCE AUGHT2 PICKLEBALL SINGLE-CLUB CONTEXT
  // If the user has an Aught2 Pickleball staff membership, lock onto it.
  const pickleballMembership = memberships.find((m) =>
    m.club_name.toLowerCase().includes('pickleball')
  );
  
  // Use the enforced membership if available, otherwise fallback to the active one in store
  const effectiveMembership = pickleballMembership || activeMembership;

  // Fallback to player's enrolled clubs if user is not staff
  const { clubs: playerClubs } = usePlayerClubs();
  const playerPickleball =
    playerClubs.find((c) => c.club_name.toLowerCase().includes('pickleball')) ||
    playerClubs[0];

  const resolvedClubId = effectiveMembership?.club_id ?? playerPickleball?.club_id ?? null;
  const resolvedClubName = effectiveMembership?.club_name ?? playerPickleball?.club_name ?? null;
  const resolvedClubSlug = effectiveMembership?.club_slug ?? playerPickleball?.club_slug ?? null;

  const switchClub = useCallback(
    (membership: MembershipInfo) => {
      setActiveMembership(membership);
      // Invalidate club-scoped queries so fresh data is loaded for the new active club
      queryClient.invalidateQueries({ queryKey: ['clubs', membership.club_id] });
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
    isActive: effectiveMembership?.is_active ?? (playerPickleball?.status === 'active'),
    allMemberships: memberships,
    // Hide the ability to switch clubs since this is a single-club application product
    canSwitchClub: false,
    hasClubContext: Boolean(effectiveMembership || playerPickleball),
    switchClub,
    setActiveMembership,
  };
}
