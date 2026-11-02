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
    fontSize: 13.5,
    fontWeight: '600',
    color: Colors.text.primary, // near-black label
    letterSpacing: 0.1,
  },
  input: {
    height: Dimensions.inputHeight,          // 48px
    backgroundColor: Colors.surface.default, // white
    borderRadius: Radius.lg,                 // 12px
    borderWidth: 1,
    borderColor: Colors.surface.border,      // #E5E7EB
    paddingHorizontal: Spacing[3.5],         // 14px horizontal
    paddingVertical: Platform.OS === 'web' ? 0 : Spacing[2.5],
    fontSize: 14,
    color: Colors.text.primary,
    minWidth: 0,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', boxSizing: 'border-box' } as any)
      : {}),
  },
  inputMultiline: {
    height: undefined,
    minHeight: 96,
    paddingTop: Spacing[2.5],
    paddingBottom: Spacing[2.5],
    paddingHorizontal: Spacing[3.5],
    lineHeight: 20,
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
    fontSize: 12,
    color: Colors.status.error,
    lineHeight: 16,
    marginTop: 2,
  },
  hintText: {
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 16,
    marginTop: 2,
  },
});
