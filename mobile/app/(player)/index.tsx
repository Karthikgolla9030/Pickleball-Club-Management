/**
 * Player Home — Phase 1 Placeholder
 * Full implementation in Phase 2.
 */

import { StyleSheet, View } from 'react-native';
import { Screen, AppText, Button } from '@/components';
import { useAuth } from '@/hooks';
import { Spacing } from '@/theme';

export default function PlayerHomeScreen() {
  const { user, logout } = useAuth();

  return (
    <Screen>
      <View style={styles.container}>
        <AppText variant="heading2">Player Home</AppText>
        <AppText variant="body" color="secondary">
          Welcome, {user?.full_name ?? user?.email}
        </AppText>
        <AppText variant="bodySmall" color="tertiary" style={styles.note}>
          Phase 1 — Routing foundation verified ✓{'\n'}
          Full player experience coming in Phase 2.
        </AppText>
        <Button label="Sign Out" onPress={logout} variant="secondary" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing[4],
  },
  note: {
    lineHeight: 20,
  },
});
