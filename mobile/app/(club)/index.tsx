/**
 * Club Dashboard — Phase 1 Placeholder
 * Shows active club, role, and user info.
 * Full dashboard with stats and widgets in Phase 2.
 */

import { StyleSheet, View } from 'react-native';
import { Screen, AppText, Button, Card, Badge } from '@/components';
import { useAuth, useActiveClub } from '@/hooks';
import { Colors, Spacing } from '@/theme';

export default function ClubDashboardScreen() {
  const { user, logout } = useAuth();
  const { clubName, role, roleLabel } = useActiveClub();

  return (
    <Screen>
      <View style={styles.container}>
        {/* Club Header */}
        <View style={styles.header}>
          <AppText variant="overline" color="secondary">
            CLUB MANAGEMENT
          </AppText>
          <AppText variant="heading2">{clubName ?? 'Your Club'}</AppText>
          {role && (
            <Badge
              label={roleLabel ?? role}
              role={role}
            />
          )}
        </View>

        {/* User Info Card */}
        <Card>
          <AppText variant="label" color="secondary">
            Signed in as
          </AppText>
          <AppText variant="title">{user?.full_name ?? user?.email}</AppText>
          <AppText variant="bodySmall" color="tertiary">
            {user?.email}
          </AppText>
        </Card>

        {/* Phase 1 Note */}
        <Card variant="bordered">
          <AppText variant="label" color="brand">
            Phase 1 — Foundation Complete ✓
          </AppText>
          <AppText variant="bodySmall" color="secondary" style={styles.note}>
            Routing, authentication, role model, and permission system are operational.{'\n'}
            Full club management UI arrives in Phase 2.
          </AppText>
        </Card>

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
  header: {
    gap: Spacing[2],
  },
  note: {
    marginTop: Spacing[2],
    lineHeight: 20,
  },
});
