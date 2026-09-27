/**
 * Reset Password Screen
 *
 * Fixed:
 * - Added KeyboardAvoidingView + ScrollView
 * - Consistent card layout matching forgot-password
 * - Proper padding and back navigation
 */

import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, AppText, Button, Card, Input } from '@/components';
import { Spacing } from '@/theme';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const handleReset = () => {
    setError('');
    if (!password) {
      setError('Password is required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    // Placeholder — actual implementation requires backend token flow
  };

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
          <View style={styles.contentContainer}>
            <View style={styles.header}>
              <AppText variant="heading2">New Password</AppText>
              <AppText variant="body" color="secondary" center style={styles.subtitle}>
                Enter your new password below.
              </AppText>
            </View>

            <Card style={styles.card}>
              <Input
                label="New Password"
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                secureTextEntry
                textContentType="newPassword"
              />
              <Input
                label="Confirm Password"
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Repeat your password"
                secureTextEntry
                error={error}
              />
              <Button label="Set New Password" onPress={handleReset} />
              <Button
                label="Back to Sign In"
                onPress={() => router.replace('/(auth)/login')}
                variant="ghost"
              />
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[6],
    justifyContent: 'center',
  },
  contentContainer: {
    gap: Spacing[5],
  },
  header: {
    alignItems: 'center',
    gap: Spacing[1],
  },
  subtitle: {
    maxWidth: 280,
    marginTop: Spacing[1],
  },
  card: {
    gap: Spacing[3],
  },
});
