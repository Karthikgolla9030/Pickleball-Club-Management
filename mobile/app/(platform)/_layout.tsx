/**
 * Aught2 Pickleball — Platform Administration Group Layout
 *
 * Provides dedicated routing and server-enforced platform authorization guard:
 * - Direct entry point for authorized platform owners
 * - Completely separate from Club Staff and Player experiences
 * - Verifies caller has platform-owner authorization via backend /api/v1/platform/me
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { ShieldAlert } from 'lucide-react-native';

import { AppText, Button, Card, LoadingState, Screen } from '@/components';
import { platformApplicationsApi } from '@/services/api/clubApplications';
import { useAuthStore } from '@/store';
import { Colors, Radius, Spacing } from '@/theme';

export default function PlatformLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [isVerifying, setIsVerifying] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isLoginPage = pathname === '/(platform)/login' || pathname.endsWith('/platform/login');

  useEffect(() => {
    if (isLoading) return;

    if (isLoginPage) {
      setIsVerifying(false);
      return;
    }

    if (!isAuthenticated) {
      router.replace('/(platform)/login' as any);
      return;
    }

    let isMounted = true;
    setIsVerifying(true);
    setErrorMsg(null);

    platformApplicationsApi
      .getPlatformMe()
      .then(() => {
        if (isMounted) {
          setIsAuthorized(true);
          setIsVerifying(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setIsAuthorized(false);
          setIsVerifying(false);
          if (err?.status === 403 || err?.response?.status === 403) {
            setErrorMsg('Platform owner authorization required. This account is not listed in PLATFORM_OWNER_EMAILS.');
          } else {
            setErrorMsg(err?.message || 'Failed to verify platform owner authorization.');
          }
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isLoading, isAuthenticated, isLoginPage, router]);

  if (isLoginPage) {
    return (
      <View style={styles.container}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" />
        </Stack>
      </View>
    );
  }

  if (isVerifying || isLoading) {
    return (
      <Screen style={styles.container}>
        <LoadingState message="Verifying platform owner authorization..." />
      </Screen>
    );
  }

  if (!isAuthorized) {
    return (
      <Screen style={styles.container}>
        <View style={styles.centerBox}>
          <Card style={styles.forbiddenCard}>
            <View style={styles.forbiddenIconCircle}>
              <ShieldAlert size={40} color="#DC2626" />
            </View>
            <AppText variant="heading2" color="primary" style={styles.forbiddenTitle}>
              Platform Access Restricted
            </AppText>
            <AppText variant="body" color="secondary" style={styles.forbiddenBody}>
              {errorMsg || 'You do not have administrative authorization to access the Aught2 Platform Portal.'}
            </AppText>
            <AppText variant="caption" color="secondary" style={styles.forbiddenEmail}>
              Signed in as: {user?.email || 'Unknown'}
            </AppText>
            <View style={styles.actionRow}>
              <Button
                label="Sign In as Platform Owner"
                variant="primary"
                onPress={() => router.replace('/(platform)/login' as any)}
                style={styles.actionBtn}
              />
              <Button
                label="Return to Main Portal"
                variant="outline"
                onPress={async () => {
                  await logout();
                  router.replace('/(auth)/login');
                }}
                style={styles.actionBtn}
              />
            </View>
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <View style={styles.container}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background.primary },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="applications" />
        <Stack.Screen name="clubs" />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  forbiddenCard: {
    padding: 28,
    alignItems: 'center',
    borderRadius: Radius.xl,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FECACA',
    maxWidth: 440,
    width: '100%',
  },
  forbiddenIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  forbiddenTitle: {
    textAlign: 'center',
    marginBottom: 10,
  },
  forbiddenBody: {
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 20,
  },
  forbiddenEmail: {
    fontWeight: '600',
    color: '#1A2E2B',
    marginBottom: 24,
  },
  actionRow: {
    width: '100%',
    gap: 12,
  },
  actionBtn: {
    width: '100%',
  },
});
