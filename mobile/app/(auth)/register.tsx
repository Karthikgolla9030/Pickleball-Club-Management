/**
 * Player Registration Screen
 *
 * Players self-register to access the player experience.
 * Player accounts never receive club management permissions.
 */

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, AppText, Input, Button, Card } from '@/components';
import { useAuth } from '@/hooks';
import { Colors, Spacing } from '@/theme';

export default function RegisterScreen() {
  const router = useRouter();
  const { registerPlayer, isLoading, error, clearError } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');

  function validate(): boolean {
    let valid = true;
    setNameError('');
    setEmailError('');
    setPasswordError('');
    setConfirmPasswordError('');

    if (!fullName.trim()) {
      setNameError('Full name is required');
      valid = false;
    }

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
    } else if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      valid = false;
    }

    if (password !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match');
      valid = false;
    }

    return valid;
  }

  async function handleRegister() {
    if (!validate()) return;
    clearError();

    try {
      await registerPlayer(fullName.trim(), email.trim().toLowerCase(), password);
      router.replace('/(player)');
    } catch {
      // Error handled by store
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
              <AppText variant="heading2" style={styles.logoText}>
                A2
              </AppText>
            </View>
            <AppText variant="heading1" style={styles.brandName}>
              Aught2
            </AppText>
            <AppText variant="title" color="secondary" center>
              Player Portal
            </AppText>
          </View>

          {/* Registration Form */}
          <Card style={styles.card}>
            <AppText variant="heading3" style={styles.cardTitle}>
              Create Account
            </AppText>
            <AppText variant="bodySmall" color="secondary" style={styles.cardSubtitle}>
              Sign up to book courts, join leagues, and compete
            </AppText>

            <View style={styles.form}>
              <Input
                testID="register-name"
                label="Full Name"
                value={fullName}
                onChangeText={setFullName}
                placeholder="Alex Morgan"
                autoComplete="name"
                textContentType="name"
                error={nameError}
              />

              <Input
                testID="register-email"
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
                testID="register-password"
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                error={passwordError}
              />

              <Input
                testID="register-confirm-password"
                label="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="••••••••"
                secureTextEntry
                textContentType="newPassword"
                error={confirmPasswordError}
              />

              {error && (
                <View style={styles.errorBanner}>
                  <AppText variant="bodySmall" color="error" center>
                    {error}
                  </AppText>
                </View>
              )}

              <Button
                testID="register-submit"
                label={isLoading ? 'Creating Account...' : 'Sign Up as Player'}
                onPress={handleRegister}
                loading={isLoading}
                disabled={isLoading}
              />

              <TouchableOpacity
                onPress={() => router.push('/(auth)/login' as any)}
                style={styles.signInLink}
              >
                <AppText variant="bodySmall" color="secondary" center>
                  Already have an account?{' '}
                  <AppText variant="bodySmall" style={styles.signInHighlight}>
                    Sign In
                  </AppText>
                </AppText>
              </TouchableOpacity>
            </View>
          </Card>

          <AppText variant="caption" color="tertiary" center style={styles.footer}>
            Aught2 Pickleball © 2026
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
    paddingHorizontal: Spacing[4],
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
  signInLink: {
    paddingVertical: Spacing[2],
    alignItems: 'center',
  },
  signInHighlight: {
    color: Colors.brand.primary,
    fontWeight: '600',
  },
  footer: {
    marginTop: Spacing[4],
  },
});
