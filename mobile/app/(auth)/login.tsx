/**
 * Login Screen — Two-Sided Authentication System
 *
 * IMPORTANT AUTH RULES:
 *   - Completely separate entry points for CLUB STAFF and PLAYERS
 *   - Email + Password ONLY — NO role selector dropdown on login
 *   - Backend determines role from ClubMembership
 *   - Club accounts created by Club Owner (no public staff registration)
 *   - Player accounts self-register and enter Player portal
 *   - Tokens stored securely in SecureStore
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Screen, AppText, Input, Button, Card } from '@/components';
import { useAuth } from '@/hooks';
import { Colors, Spacing } from '@/theme';

type AuthPortal = 'club' | 'player';

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ portal?: string }>();
  const { loginClub, loginPlayer, isLoading, error, clearError } = useAuth();

  const [portal, setPortal] = useState<AuthPortal>(
    params.portal === 'player' ? 'player' : 'club'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  React.useEffect(() => {
    if (params.portal === 'player') {
      setPortal('player');
    } else if (params.portal === 'club') {
      setPortal('club');
    }
  }, [params.portal]);

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
      const normalizedEmail = email.trim().toLowerCase();
      if (portal === 'club') {
        await loginClub(normalizedEmail, password);
        router.replace('/(club)');
      } else {
        await loginPlayer(normalizedEmail, password);
        router.replace('/(player)');
      }
    } catch {
      // Error is stored in Zustand state and rendered in errorBanner
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
            <Image
              source={require('../../assets/aught2_pickleball_logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
              accessibilityLabel="Aught2 Pickleball"
            />
            <AppText variant="title" color="secondary" center style={styles.portalSubtitle}>
              {portal === 'club' ? 'Club Management' : 'Player Portal'}
            </AppText>
          </View>

          {/* Portal Switcher */}
          <View style={styles.portalToggleContainer}>
            <TouchableOpacity
              style={[
                styles.portalTab,
                portal === 'club' && styles.portalTabActive,
              ]}
              onPress={() => {
                setPortal('club');
                clearError();
              }}
              activeOpacity={0.8}
            >
              <AppText
                variant="bodySmall"
                style={[
                  styles.portalTabText,
                  portal === 'club' && styles.portalTabTextActive,
                ]}
              >
                Club Staff
              </AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.portalTab,
                portal === 'player' && styles.portalTabActive,
              ]}
              onPress={() => {
                setPortal('player');
                clearError();
              }}
              activeOpacity={0.8}
            >
              <AppText
                variant="bodySmall"
                style={[
                  styles.portalTabText,
                  portal === 'player' && styles.portalTabTextActive,
                ]}
              >
                Player
              </AppText>
            </TouchableOpacity>
          </View>

          {/* Login Form */}
          <Card style={styles.card}>
            <AppText variant="heading3" style={styles.cardTitle}>
              Sign In
            </AppText>
            <AppText variant="bodySmall" color="secondary" style={styles.cardSubtitle}>
              {portal === 'club'
                ? 'Enter your staff credentials to continue'
                : 'Enter your player credentials to continue'}
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

              {/* Demo Account Quick-Fill Chips */}
              <View style={styles.demoSection}>
                <AppText variant="caption" color="secondary" style={styles.demoSectionTitle}>
                  Quick Fill Demo Account:
                </AppText>
                <View style={styles.demoChipsRow}>
                  {portal === 'player' ? (
                    <TouchableOpacity
                      style={styles.demoChip}
                      onPress={() => {
                        setEmail('player@demo.local');
                        setPassword('DemoPlayer2024!');
                        clearError();
                      }}
                      activeOpacity={0.7}
                    >
                      <AppText variant="caption" style={styles.demoChipText}>
                        🎾 Player (Pete)
                      </AppText>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={styles.demoChip}
                        onPress={() => {
                          setEmail('owner@demo.local');
                          setPassword('DemoOwner2024!');
                          clearError();
                        }}
                        activeOpacity={0.7}
                      >
                        <AppText variant="caption" style={styles.demoChipText}>
                          👑 Owner
                        </AppText>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.demoChip}
                        onPress={() => {
                          setEmail('manager@demo.local');
                          setPassword('DemoManager2024!');
                          clearError();
                        }}
                        activeOpacity={0.7}
                      >
                        <AppText variant="caption" style={styles.demoChipText}>
                          🛡️ Manager
                        </AppText>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.demoChip}
                        onPress={() => {
                          setEmail('director@demo.local');
                          setPassword('DemoDirector2024!');
                          clearError();
                        }}
                        activeOpacity={0.7}
                      >
                        <AppText variant="caption" style={styles.demoChipText}>
                          🏆 Director
                        </AppText>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>

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

              {portal === 'player' && (
                <TouchableOpacity
                  onPress={() => router.push('/(auth)/register' as any)}
                  style={styles.registerLink}
                >
                  <AppText variant="bodySmall" color="secondary" center>
                    Don't have an account?{' '}
                    <AppText variant="bodySmall" style={styles.registerHighlight}>
                      Sign Up
                    </AppText>
                  </AppText>
                </TouchableOpacity>
              )}
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
    gap: Spacing[5],
  },
  header: {
    alignItems: 'center',
    gap: Spacing[1],
    marginBottom: Spacing[1],
  },
  logoImage: {
    width: 210,
    height: 92,
  },
  portalSubtitle: {
    fontSize: 15,
    marginTop: 2,
  },
  portalToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#E7F0EB',
    borderRadius: 12,
    padding: 4,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 380,
  },
  portalTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  portalTabActive: {
    backgroundColor: Colors.brand.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  portalTabText: {
    fontWeight: '600',
    color: '#4B6B63',
  },
  portalTabTextActive: {
    color: '#FFFFFF',
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
  demoSection: {
    backgroundColor: '#F3F8F5',
    borderRadius: 10,
    padding: Spacing[2],
    borderWidth: 1,
    borderColor: '#D7EBE1',
    gap: 6,
  },
  demoSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B6B63',
  },
  demoChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  demoChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#C2E0D1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  demoChipText: {
    color: '#135847',
    fontWeight: '600',
    fontSize: 12,
  },
  registerLink: {
    paddingVertical: Spacing[2],
    alignItems: 'center',
  },
  registerHighlight: {
    color: Colors.brand.primary,
    fontWeight: '600',
  },
  footer: {
    marginTop: Spacing[4],
  },
});
