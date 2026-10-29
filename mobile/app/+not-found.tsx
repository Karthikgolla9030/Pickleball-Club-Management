import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { AppText, Button, Card, Screen } from '@/components';
import { Spacing } from '@/theme';
import { useAuthStore } from '@/store';
import { isPlatformAdminEmail } from '@/constants';

export default function NotFoundScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const activePortal = useAuthStore((s) => s.activePortal);
  const memberships = useAuthStore((s) => s.memberships);
  const activeMembership = useAuthStore((s) => s.activeMembership);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const handleGoHome = () => {
    if (!isAuthenticated) {
      router.replace('/(auth)/login' as any);
      return;
    }

    const isPlatformAdmin = Boolean(
      user?.is_platform_admin || isPlatformAdminEmail(user?.email) || activePortal === 'platform'
    );

    if (isPlatformAdmin) {
      router.replace('/platform' as any);
      return;
    }

    if (activePortal === 'club' || (memberships.length > 0 && activeMembership)) {
      router.replace('/(club)' as any);
      return;
    }

    router.replace('/(player)' as any);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Oops!', headerShown: false }} />
      <Screen>
        <View style={styles.container}>
          <Card style={styles.card}>
            <AppText variant="heading2" center>
              Page Not Found
            </AppText>
            <AppText variant="body" color="secondary" center>
              This screen doesn't exist or has moved.
            </AppText>
            <Button
              label="Go to Home"
              variant="primary"
              onPress={handleGoHome}
            />
          </Card>
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing[4],
  },
  card: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing[4],
    paddingVertical: Spacing[6],
  },
});
