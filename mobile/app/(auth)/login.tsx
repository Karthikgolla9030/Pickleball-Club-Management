/**
 * Login Screen — Phase 1 Foundation
 *
 * IMPORTANT AUTH RULES:
 *   - Email + Password ONLY
 *   - NO role selector, NO role field
 *   - Backend determines role from ClubMembership
 *   - Tokens stored in SecureStore after successful login
 *
 * Phase 1: Functional login with design system. 
 * Advanced UX (biometrics, SSO) belongs to later phases.
 */

import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, AppText, Input, Button, Card } from '@/components';
import { useAuth } from '@/hooks';
import { Colors, Spacing } from '@/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { login, isLoading, error, clearError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  function validate(): boolean {
    let valid = true;
    setEmailError('');
    setPasswordError('');

    if (!email.trim()) {
      setEmailError('Email is required');
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
  }

  async function handleLogin() {
    if (!validate()) return;
    clearError();

    try {
      await login(email.trim().toLowerCase(), password);
      // Navigation is handled by root index after state update
    } catch {
      // Error is already in store — no need to handle here
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo / Brand */}
          <View style={styles.header}>
            <View style={styles.logoMark}>
              <AppText variant="heading2" style={styles.logoText}>A2</AppText>
            </View>
            <AppText variant="heading1" style={styles.brandName}>
              Aught2
            </AppText>
            <AppText variant="title" color="secondary" center>
              Pickleball Management
            </AppText>
          </View>

          {/* Login Form */}
          <Card style={styles.card}>
            <AppText variant="heading3" style={styles.cardTitle}>
              Sign In
            </AppText>
            <AppText variant="bodySmall" color="secondary" style={styles.cardSubtitle}>
              Enter your credentials to continue
            </AppText>

            <View style={styles.form}>
              <Input
                testID="login-email"
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                error={emailError}
              />

              <Input
                testID="login-password"
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
                autoComplete="password"
                textContentType="password"
                error={passwordError}
              />

              {error && (
                <View style={styles.errorBanner}>
                  <AppText variant="bodySmall" color="error" center>
                    {error}
                  </AppText>
                </View>
              )}

              <Button
                testID="login-submit"
                label={isLoading ? 'Signing In...' : 'Sign In'}
                onPress={handleLogin}
                loading={isLoading}
                disabled={isLoading}
              />

              <Button
                testID="login-forgot-password"
                label="Forgot Password?"
                onPress={() => router.push('/(auth)/forgot-password')}
                variant="ghost"
              />
            </View>
          </Card>

          <AppText variant="caption" color="tertiary" center style={styles.footer}>
            Aught2 Pickleball © 2024
          </AppText>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: Spacing[8],
    gap: Spacing[6],
  },
  header: {
    alignItems: 'center',
    gap: Spacing[2],
  },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[2],
  },
  logoText: {
    color: Colors.text.inverse,
    fontWeight: '800',
  },
  brandName: {
    color: Colors.text.primary,
    letterSpacing: -1,
  },
  card: {
    gap: Spacing[4],
  },
  cardTitle: {
    marginBottom: Spacing[1],
  },
  cardSubtitle: {
    marginBottom: Spacing[2],
  },
  form: {
    gap: Spacing[3],
  },
  errorBanner: {
    backgroundColor: Colors.status.errorBg,
    borderRadius: 8,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.status.error,
  },
  footer: {
    marginTop: Spacing[4],
  },
});
