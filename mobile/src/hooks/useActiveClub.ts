/**
 * useActiveClub — Access the currently active club context.
 */

import { useAuthStore } from '@/store';

export function useActiveClub() {
  const activeMembership = useAuthStore((s) => s.activeMembership);
  const memberships = useAuthStore((s) => s.memberships);
  const setActiveMembership = useAuthStore((s) => s.setActiveMembership);

  return {
    activeMembership,
    clubId: activeMembership?.club_id ?? null,
    clubName: activeMembership?.club_name ?? null,
    clubSlug: activeMembership?.club_slug ?? null,
    role: activeMembership?.role ?? null,
    roleLabel: activeMembership?.role_label ?? null,
    allMemberships: memberships,
    canSwitchClub: memberships.length > 1,
    setActiveMembership,
  };
}
