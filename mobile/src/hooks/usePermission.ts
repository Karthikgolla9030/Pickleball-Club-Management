/**
 * usePermission — Frontend permission helper for UX navigation and UI controls.
 *
 * CRITICAL REMINDER:
 * Frontend permission checks are for UX ONLY (hiding/showing tabs, buttons, etc.).
 * The backend database is the authoritative source of truth for all authorization,
 * and will reject unauthorized operations with 403.
 */

import { useMemo } from 'react';
import { useActiveClub } from './useActiveClub';
import { ROLE_PERMISSIONS, type ClubPermission } from '@/types';

export function usePermission() {
  const { role } = useActiveClub();

  const permissions = useMemo(() => {
    if (!role) return new Set<ClubPermission>();
    return new Set<ClubPermission>(ROLE_PERMISSIONS[role] ?? []);
  }, [role]);

  const hasPermission = (permission: ClubPermission): boolean => {
    return permissions.has(permission);
  };

  return {
    hasPermission,
    canManageClub: hasPermission('manage_club'),
    canManageUsers: hasPermission('manage_users'),
    canManageRoles: hasPermission('manage_roles'),
    canManageSettings: hasPermission('manage_settings'),
    canManagePayments: hasPermission('manage_payments'),
    canManageEvents: hasPermission('manage_events'),
    canManageLessons: hasPermission('manage_lessons'),
    canManageMembers: hasPermission('manage_members'),
    canManageMemberships: hasPermission('manage_memberships'),
    canManageBookings: hasPermission('manage_bookings'),
    canManageCourts: hasPermission('manage_courts'),
    canManageReports: hasPermission('manage_reports'),
    canManageTournaments: hasPermission('manage_tournaments'),
    canManageLeagues: hasPermission('manage_leagues'),
    canManageSchedules: hasPermission('manage_schedules'),
    isOwner: role === 'club_owner',
    isManager: role === 'club_manager',
    isTournamentDirector: role === 'tournament_director',
  };
}
