/**
 * Aught2 Pickleball — TournamentFormField
 *
 * Provides a consistent form field wrapper for the wizard:
 * - Label with optional required asterisk
 * - Optional hint / helper text
 * - Optional error state
 * - Supports custom children or text input
 */

import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { AppText } from '@/components/AppText';
import { Colors, Spacing, Typography } from '@/theme';

interface TournamentFormFieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  style?: ViewStyle;
  children: React.ReactNode;
}

export function TournamentFormField({
  label,
  required,
  hint,
  error,
  style,
  children,
}: TournamentFormFieldProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.labelRow}>
        <AppText variant="caption" color="secondary" style={styles.label}>
          {label}
          {required && <AppText style={styles.requiredStar}> *</AppText>}
        </AppText>
      </View>

      {children}

      {hint && !error && (
        <AppText variant="caption" color="tertiary" style={styles.hintText}>
          {hint}
        </AppText>
      )}

      {error && (
        <AppText variant="caption" style={styles.errorText}>
          {error}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing[3],
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing[1],
  },
  label: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    textTransform: 'none',
    color: Colors.text.primary,
  },
  requiredStar: {
    color: Colors.status.error,
    fontWeight: '700',
  },
  hintText: {
    marginTop: Spacing[1],
    fontSize: 12,
    color: Colors.text.tertiary,
  },
  errorText: {
    marginTop: Spacing[1],
    fontSize: 12,
    color: Colors.status.error,
  },
});
