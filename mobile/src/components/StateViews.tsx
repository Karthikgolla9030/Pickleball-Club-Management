/**
 * LoadingState, EmptyState, ErrorState — feedback primitives.
 *
 * Fixes:
 * - EmptyState: added emoji icons for visual identity, replaced generic heading
 * - All: changed flex:1 center to minHeight:240 so they work inside
 *   FlatList.ListEmptyComponent without requiring a flex parent
 * - ErrorState: improved visual hierarchy
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
  /** If true, does not apply flex:1 — use inside FlatList.ListEmptyComponent */
  inline?: boolean;
}

export function LoadingState({
  message = 'Loading...',
  size = 'large',
  inline = false,
}: LoadingStateProps) {
  return (
    <View style={[styles.center, inline && styles.inlineCenter]}>
      <ActivityIndicator size={size} color={Colors.brand.primary} />
      {message && (
        <AppText variant="bodySmall" color="secondary" center style={styles.message}>
          {message}
        </AppText>
      )}
    </View>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** If true, does not apply flex:1 — use inside FlatList.ListEmptyComponent */
  inline?: boolean;
}

export function EmptyState({
  icon = '🎾',
  title,
  description,
  actionLabel,
  onAction,
  inline = false,
}: EmptyStateProps) {
  return (
    <View style={[styles.center, inline && styles.inlineCenter]}>
      <AppText style={styles.icon}>{icon}</AppText>
      <AppText variant="heading3" center style={styles.emptyTitle}>
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
  inline?: boolean;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  inline = false,
}: ErrorStateProps) {
  return (
    <View style={[styles.center, inline && styles.inlineCenter]}>
      <AppText style={styles.errorIcon}>⚠️</AppText>
      <AppText variant="heading3" center style={styles.emptyTitle}>
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
  inlineCenter: {
    flex: 0,
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing[6],
    gap: Spacing[3],
  },
  icon: {
    fontSize: 48,
    lineHeight: 56,
    textAlign: 'center',
  },
  errorIcon: {
    fontSize: 48,
    lineHeight: 56,
    textAlign: 'center',
  },
  emptyTitle: {
    marginTop: Spacing[1],
  },
  message: {
    maxWidth: 280,
  },
  button: {
    marginTop: Spacing[2],
    paddingHorizontal: Spacing[6],
  },
});
