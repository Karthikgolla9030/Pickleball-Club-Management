/**
 * Reset Password Screen — Phase 1 Placeholder
 */

import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, AppText, Button, Input } from '@/components';
import { Spacing } from '@/theme';
import { useState } from 'react';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  return (
    <Screen>
      <View style={styles.container}>
        <AppText variant="heading2">New Password</AppText>
        <AppText variant="body" color="secondary" style={styles.subtitle}>
          Enter your new password below.
        </AppText>

        <Input
          label="New Password"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
        />
        <Input
          label="Confirm Password"
          value={confirm}
          onChangeText={setConfirm}
          placeholder="••••••••"
          secureTextEntry
        />

        <Button label="Set New Password" onPress={() => {}} />
        <Button
          label="Back to Sign In"
          onPress={() => router.replace('/(auth)/login')}
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
