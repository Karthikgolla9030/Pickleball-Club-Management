/**
 * Club Group Layout — Phase 1 Foundation
 *
 * Shared club management navigation for all three roles:
 *   - Club Owner
 *   - Club Manager
 *   - Tournament Director
 *
 * Navigation items are permission-aware — each role sees different items.
 * Tab visibility is controlled by the active membership role (from backend).
 *
 * IMPORTANT: Navigation hiding is UX only.
 * All API calls enforce permissions server-side.
 *
 * Phase 1: Placeholder tabs with role-aware foundation.
 * Phase 2+: Full permission-aware navigation with actual screens.
 */

import { Tabs } from 'expo-router';
import { useActiveClub } from '@/hooks';
import { Colors, Typography } from '@/theme';

export default function ClubLayout() {
  const { role } = useActiveClub();

  // Permission-aware tab visibility (UX only — backend enforces actual permissions)
  const canManageTournaments =
    role === 'club_owner' ||
    role === 'club_manager' ||
    role === 'tournament_director';

  const canManageMembers =
    role === 'club_owner' || role === 'club_manager';

  const canManageSettings = role === 'club_owner';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.background.secondary,
          borderTopColor: Colors.surface.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: Colors.brand.primary,
        tabBarInactiveTintColor: Colors.text.tertiary,
        tabBarLabelStyle: {
          fontSize: Typography.size.xs,
          fontWeight: Typography.weight.medium,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Dashboard', tabBarLabel: 'Dashboard' }}
      />

      {canManageTournaments && (
        <Tabs.Screen
          name="tournaments"
          options={{ title: 'Tournaments', tabBarLabel: 'Tournaments' }}
        />
      )}

      {canManageMembers && (
        <Tabs.Screen
          name="members"
          options={{ title: 'Members', tabBarLabel: 'Members' }}
        />
      )}

      {canManageSettings && (
        <Tabs.Screen
          name="settings"
          options={{ title: 'Settings', tabBarLabel: 'Settings' }}
        />
      )}
    </Tabs>
  );
}
