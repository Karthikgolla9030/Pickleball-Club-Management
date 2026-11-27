import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';

import { AppText, Button, Card, LoadingState, Screen } from '@/components';
import { Spacing } from '@/theme';
import { useAuthStore } from '@/store';
import {
  getDefaultHomeForRole,
  resolveLegacyPortalPath,
  resolveRoleContext,
} from '@/utils';

export default function NotFoundScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const activePortal = useAuthStore((s) => s.activePortal);
  const memberships = useAuthStore((s) => s.memberships);
  const activeMembership = useAuthStore((s) => s.activeMembership);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [checkedLegacy, setCheckedLegacy] = useState(false);

  const roleCtx = resolveRoleContext({
    isAuthenticated,
    user,
    memberships,
    activeMembership,
    activePortal,
  });

  useEffect(() => {
    if (isLoading) return;
    const rawSearch = typeof window !== 'undefined' ? window.location.search : '';
    const resolved = resolveLegacyPortalPath(pathname, rawSearch, roleCtx);
    if (resolved) {
      router.replace(resolved as any);
      return;
    }
    setCheckedLegacy(true);
  }, [isLoading, isAuthenticated, pathname, roleCtx.isPlatformAdmin, roleCtx.hasClubStaff, router]);

  const handleGoHome = () => {
    if (!isAuthenticated) {
      router.replace('/(auth)/login' as any);
      return;
    }
    router.replace(getDefaultHomeForRole(roleCtx) as any);
  };

  if (isLoading || !checkedLegacy) {
    return (
      <>
        <Stack.Screen options={{ title: 'Loading...', headerShown: false }} />
        <Screen>
          <LoadingState message="Loading..." />
        </Screen>
      </>
    );
  }

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
