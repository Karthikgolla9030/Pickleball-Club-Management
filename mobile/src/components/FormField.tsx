/**
 * FormField — Consistent label + input + error/hint wrapper.
 *
 * Enforces standard spacing between form fields.
 * Use instead of wrapping Input manually in every screen.
 */

import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { AppText } from './AppText';
import { Input } from './Input';
import { Spacing } from '@/theme';
import type { TextInputProps } from 'react-native';

interface FormFieldProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  testID?: string;
  containerStyle?: ViewProps['style'];
}

export function FormField({
  label,
  error,
  hint,
  required,
  containerStyle,
  testID,
  ...inputProps
}: FormFieldProps) {
  const displayLabel = label
    ? required
      ? `${label} *`
      : label
    : undefined;

  return (
    <View style={[styles.container, containerStyle]}>
      <Input
        label={displayLabel}
        error={error}
        hint={hint}
        testID={testID}
        {...inputProps}
      />
    </View>
  );
}

// ─── InfoRow — Compact label/value display row ────────────────────────────────

interface InfoRowProps {
  label: string;
  value: string | React.ReactNode;
}

export function InfoRow({ label, value }: InfoRowProps) {
  return (
    <View style={styles.infoRow}>
      <AppText variant="caption" color="tertiary" style={styles.infoLabel}>
        {label}
      </AppText>
      {typeof value === 'string' ? (
        <AppText variant="body" bold style={styles.infoValue}>
          {value}
        </AppText>
      ) : (
        value
      )}
    </View>
  );
}

// ─── InfoGrid — Horizontal grid of InfoRows ───────────────────────────────────

interface InfoGridProps {
  rows: InfoRowProps[];
}

export function InfoGrid({ rows }: InfoGridProps) {
  return (
    <View style={styles.infoGrid}>
      {rows.map((row, i) => (
        <View key={i} style={styles.infoGridCell}>
          <AppText variant="caption" color="tertiary">
            {row.label}
          </AppText>
          {typeof row.value === 'string' ? (
            <AppText variant="body" bold numberOfLines={2} style={styles.infoGridValue}>
              {row.value}
            </AppText>
          ) : (
            row.value
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // FormField uses gap provided by parent's gap setting
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing[3],
    paddingVertical: Spacing[1.5],
  },
  infoLabel: {
    flexShrink: 0,
    minWidth: 72,
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    flexShrink: 1,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[3],
  },
  infoGridCell: {
    flex: 1,
    minWidth: 100,
    gap: Spacing[0.5],
  },
  infoGridValue: {
    marginTop: 2,
  },
});
