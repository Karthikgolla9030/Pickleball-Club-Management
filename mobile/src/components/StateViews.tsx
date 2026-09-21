/**
 * LoadingState, EmptyState, ErrorState — feedback primitives.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Colors, Spacing } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';

// ─── LoadingState ─────────────────────────────────────────────────────────────

interface LoadingStateProps {
  message?: string;
  size?: 'small' | 'large';
}

export function LoadingState({ message = 'Loading...', size = 'large' }: LoadingStateProps) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size={size} color={Colors.brand.primary} />
      {message && (
        <AppText variant="bodySmall" color="secondary" style={styles.message}>
          {message}
        </AppText>
      )}
    </View>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.center}>
      <AppText variant="heading3" center>
        {title}
      </AppText>
      {description && (
        <AppText variant="body" color="secondary" center style={styles.message}>
          {description}
        </AppText>
      )}
      {actionLabel && onAction && (
        <Button
          label={actionLabel}
          onPress={onAction}
          variant="secondary"
          fullWidth={false}
          style={styles.button}
        />
      )}
    </View>
  );
}

// ─── ErrorState ───────────────────────────────────────────────────────────────

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <View style={styles.center}>
      <AppText variant="heading3" center>
        {title}
      </AppText>
      {message && (
        <AppText variant="body" color="secondary" center style={styles.message}>
          {message}
        </AppText>
      )}
      {onRetry && (
        <Button
          label="Try Again"
          onPress={onRetry}
          variant="secondary"
          fullWidth={false}
          style={styles.button}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing[6],
    gap: Spacing[3],
  },
  message: {
    marginTop: Spacing[2],
  },
  button: {
    marginTop: Spacing[4],
    paddingHorizontal: Spacing[6],
  },
});
