/**
 * Aught2 Pickleball — Dedicated Platform Owner Login Screen
 *
 * Distinct administrative entry point:
 * - Strictly for authorized platform owners
 * - Authenticates via POST /api/v1/auth/platform/login
 * - Rejects any non-platform owner account with HTTP 403
 * - No public quick-fill demo buttons
 * - No role dropdown
 */

import React, { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Lock, Mail, ShieldAlert, ShieldCheck } from 'lucide-react-native';

import { AppText, Button, Card, Input, Screen } from '@/components';
import { useAuth } from '@/hooks';
import { Colors, Radius, Spacing } from '@/theme';

export default function PlatformLoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { loginPlatform, isLoading, error, clearError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const validate = (): boolean => {
    let valid = true;
    setEmailError('');
    setPasswordError('');

    if (!email.trim()) {
      setEmailError('Platform email is required');
      valid = false;
    } else if (!email.includes('@')) {
      setEmailError('Enter a valid email address');
      valid = false;
    }

    if (!password) {
      setPasswordError('Password is required');
      valid = false;
    }

    return valid;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    try {
      await loginPlatform(email.trim(), password);
      router.replace('/(platform)/applications' as any);
    } catch {
      // error is handled by store and displayed below
    }
  };

  return (
    <Screen style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + 24,
              paddingBottom: Math.max(insets.bottom, 24) + 20,
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header & Brand */}
          <View style={styles.header}>
            <Image
              source={require('../../assets/aught2_brand_logo_transparent.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <View style={styles.badgeRow}>
              <View style={styles.adminBadge}>
                <ShieldCheck size={14} color="#18794E" />
                <AppText style={styles.adminBadgeText}>PLATFORM PORTAL</AppText>
              </View>
            </View>
            <AppText variant="heading2" color="primary" center style={styles.title}>
              Platform Administration
            </AppText>
            <AppText variant="bodySmall" color="secondary" center style={styles.subtitle}>
              Dedicated access for authorized Aught2 Pickleball platform administrators.
            </AppText>
          </View>

          {/* Login Card */}
          <Card style={styles.card}>
            <AppText variant="heading3" style={styles.cardTitle}>
              Administrative Sign In
            </AppText>
            <AppText variant="caption" color="secondary" style={styles.cardSubtitle}>
              Sign in with your configured platform owner credentials to review club registrations and manage facilities.
            </AppText>

            <View style={styles.form}>
              <Input
                label="Admin Email"
                value={email}
                onChangeText={(val) => {
                  setEmail(val);
                  if (emailError) setEmailError('');
                  clearError();
                }}
                placeholder="platform.owner@aught2.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                error={emailError}
              />

              <Input
                label="Password"
                value={password}
                onChangeText={(val) => {
                  setPassword(val);
                  if (passwordError) setPasswordError('');
                  clearError();
                }}
                placeholder="••••••••••••"
                secureTextEntry
                error={passwordError}
              />

              {error && (
                <View style={styles.errorBox}>
                  <ShieldAlert size={16} color="#DC2626" style={styles.errorIcon} />
                  <AppText variant="bodySmall" color="error" style={styles.errorText}>
                    {error}
                  </AppText>
                </View>
              )}

              <Button
                label={isLoading ? 'Verifying Authorization...' : 'Sign In as Platform Owner'}
                variant="primary"
                onPress={handleLogin}
                loading={isLoading}
                disabled={isLoading}
                style={styles.submitBtn}
              />
            </View>
          </Card>

          {/* Return Navigation */}
          <TouchableOpacity
            onPress={() => router.replace('/(auth)/login')}
            style={styles.returnLink}
            activeOpacity={0.7}
          >
            <ArrowLeft size={16} color="#18794E" />
            <AppText variant="bodySmall" style={styles.returnText}>
              Back to Club Management & Player Sign In
            </AppText>
          </TouchableOpacity>

          <AppText variant="caption" color="tertiary" center style={styles.footerNote}>
            Access to this portal is restricted to authorized identities in PLATFORM_OWNER_EMAILS.
          </AppText>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7FAF8',
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
    width: '100%',
    maxWidth: 420,
  },
  logo: {
    width: 170,
    height: 52,
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: '#EAF6F0',
    borderWidth: 1,
    borderColor: '#C3E5D4',
  },
  adminBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#18794E',
    letterSpacing: 0.6,
  },
  title: {
    marginBottom: 4,
  },
  subtitle: {
    maxWidth: 340,
    lineHeight: 18,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTitle: {
    marginBottom: 4,
  },
  cardSubtitle: {
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
  form: {
    gap: Spacing.md,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  errorIcon: {
    marginRight: Spacing.xs,
  },
  errorText: {
    flex: 1,
    lineHeight: 18,
  },
  submitBtn: {
    marginTop: Spacing.xs,
  },
  returnLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.lg,
    paddingVertical: 8,
  },
  returnText: {
    color: '#18794E',
    fontWeight: '600',
  },
  footerNote: {
    marginTop: Spacing.md,
    fontSize: 11,
    color: '#8FA39E',
  },
});
