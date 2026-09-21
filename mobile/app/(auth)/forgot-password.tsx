/**
 * Forgot Password Screen — Phase 1 Placeholder
 * Full implementation in Phase 2 (requires backend email flow).
 */

import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, AppText, Button, Input } from '@/components';
import { Spacing } from '@/theme';
import { useState } from 'react';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');

  return (
    <Screen>
      <View style={styles.container}>
        <AppText variant="heading2">Reset Password</AppText>
        <AppText variant="body" color="secondary" style={styles.subtitle}>
          Enter your email and we'll send you a reset link.
        </AppText>

        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoComplete="email"
        />

        <Button label="Send Reset Link" onPress={() => {}} />
        <Button
          label="Back to Sign In"
          onPress={() => router.back()}
          variant="ghost"
        />
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
  subtitle: {
    marginBottom: Spacing[2],
  },
});
