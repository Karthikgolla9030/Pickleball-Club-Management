/**
 * Input — Styled text input following the design system.
 *
 * Light theme:
 * - White background, #E5E7EB border (1px)
 * - Focus state: forest green border #1B6B45
 * - 14px padding, 12px radius
 * - Label in near-black, hint/error in appropriate muted colors
 */

import React, { useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { Colors, Dimensions, Radius, Spacing, Typography } from '@/theme';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  testID?: string;
}

export function Input({ label, error, hint, style, testID, multiline, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        testID={testID}
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          focused && styles.inputFocused,
          !!error && styles.inputError,
          style,
        ]}
        placeholderTextColor={Colors.text.tertiary}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCapitalize="none"
        autoCorrect={false}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        {...props}
      />
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hintText}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing[1.5] },
  label: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
    color: Colors.text.primary, // near-black label
  },
  input: {
    height: Dimensions.inputHeight,
    backgroundColor: Colors.surface.default, // white
    borderRadius: Radius.lg,                 // 12px
    borderWidth: 1,
    borderColor: Colors.surface.border,      // #E5E7EB
    paddingHorizontal: Spacing[4],           // 16px horizontal
    paddingVertical: Platform.OS === 'web' ? 0 : Spacing[2.5],
    fontSize: Typography.size.base,
    color: Colors.text.primary,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', boxSizing: 'border-box' } as any)
      : {}),
  },
  inputMultiline: {
    height: undefined,
    minHeight: Dimensions.inputHeight * 2,
    paddingTop: Spacing[3],
    paddingVertical: Spacing[3],
  },
  inputFocused: {
    borderColor: Colors.brand.primary,       // #1B6B45 on focus
    borderWidth: 1.5,
  },
  inputError: {
    borderColor: Colors.status.error,
    borderWidth: 1.5,
  },
  errorText: {
    fontSize: Typography.size.xs,
    color: Colors.status.error,
    lineHeight: 16,
  },
  hintText: {
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
    lineHeight: 16,
  },
});
