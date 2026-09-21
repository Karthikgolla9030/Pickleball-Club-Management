/**
 * Player Group Layout — Phase 1 Foundation
 *
 * The player experience is separate from club management.
 * A user without club memberships enters here.
 * Phase 1: Placeholder tabs. Phase 2+ adds actual screens.
 */

import { Tabs } from 'expo-router';
import { Colors, Typography } from '@/theme';

export default function PlayerLayout() {
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
        options={{ title: 'Home', tabBarLabel: 'Home' }}
      />
      <Tabs.Screen
        name="events"
        options={{ title: 'Events', tabBarLabel: 'Events' }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarLabel: 'Profile' }}
      />
    </Tabs>
  );
}
