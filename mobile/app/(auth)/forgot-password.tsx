/**
 * Forgot Password Screen
 *
 * Fixed:
 * - Added KeyboardAvoidingView + ScrollView for keyboard handling
 * - Added proper back navigation header
 * - Content properly centered with safe minimum padding
 */

import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, AppText, Button, Card, Input } from '@/components';
import { Colors, Spacing } from '@/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

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
          {/* Back navigation */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <AppText variant="body" color="brand">← Back to Sign In</AppText>
          </TouchableOpacity>

          <View style={styles.contentContainer}>
            <View style={styles.header}>
              <View style={styles.logoMark}>
                <AppText variant="heading3" style={styles.logoText}>🔑</AppText>
              </View>
              <AppText variant="heading2">Reset Password</AppText>
              <AppText variant="body" color="secondary" center style={styles.subtitle}>
                Enter your email and we'll send you a reset link.
              </AppText>
            </View>

            {sent ? (
              <Card style={styles.successCard}>
                <AppText variant="heading3" center>📬 Check Your Email</AppText>
                <AppText variant="body" color="secondary" center style={styles.sentText}>
                  If an account exists for {email}, a reset link has been sent. Check your inbox and spam folder.
                </AppText>
                <Button
                  label="Back to Sign In"
                  onPress={() => router.replace('/(auth)/login')}
                  variant="primary"
                />
              </Card>
            ) : (
              <Card style={styles.card}>
                <Input
                  label="Email Address"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="emailAddress"
                />
                <Button
                  label="Send Reset Link"
                  onPress={() => {
                    if (email.trim()) setSent(true);
                  }}
                  disabled={!email.trim()}
                />
                <Button
                  label="Cancel"
                  onPress={() => router.back()}
                  variant="ghost"
                />
              </Card>
            )}
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
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing[2],
    marginBottom: Spacing[4],
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing[5],
  },
  header: {
    alignItems: 'center',
    gap: Spacing[2],
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[2],
  },
  logoText: {
    fontSize: 28,
  },
  subtitle: {
    maxWidth: 280,
    marginTop: Spacing[1],
  },
  card: {
    gap: Spacing[3],
  },
  successCard: {
    gap: Spacing[4],
    alignItems: 'center',
  },
  sentText: {
    maxWidth: 280,
    textAlign: 'center',
  },
});
