/**
 * Input — Styled text input following the design system.
 */

import React, { useState } from 'react';
import {
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

export function Input({ label, error, hint, style, testID, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        testID={testID}
        style={[
          styles.input,
          focused && styles.inputFocused,
          !!error && styles.inputError,
          style,
        ]}
        placeholderTextColor={Colors.text.tertiary}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCapitalize="none"
        autoCorrect={false}
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
  container: { gap: Spacing[1] },
  label: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
    color: Colors.text.secondary,
    marginBottom: Spacing[1],
  },
  input: {
    height: Dimensions.inputHeight,
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.surface.border,
    paddingHorizontal: Spacing[4],
    fontSize: Typography.size.base,
    color: Colors.text.primary,
  },
  inputFocused: {
    borderColor: Colors.brand.primary,
    backgroundColor: Colors.surface.elevated,
  },
  inputError: {
    borderColor: Colors.status.error,
  },
  errorText: {
    fontSize: Typography.size.xs,
    color: Colors.status.error,
    marginTop: Spacing[0.5],
  },
  hintText: {
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
    marginTop: Spacing[0.5],
  },
});
