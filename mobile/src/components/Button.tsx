/**
 * Button — Premium interactive button using design system tokens.
 * Supports multiple variants, loading states, and disabled states.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';
import { Colors, Dimensions, Radius, Shadows, Spacing, Typography } from '@/theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  onPress: () => void;
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  testID?: string;
}

export function Button({
  onPress,
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
  testID,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        styles[`size_${size}`],
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? Colors.text.inverse : Colors.brand.primary}
          size="small"
        />
      ) : (
        <Text style={[styles.label, styles[`label_${variant}`], styles[`labelSize_${size}`]]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  fullWidth: { width: '100%' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.4 },

  // Variants
  primary: {
    backgroundColor: Colors.brand.primary,
    ...Shadows.brand,
  },
  secondary: {
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.brand.primary,
  },
  danger: {
    backgroundColor: Colors.status.error,
  },

  // Sizes
  size_sm: { height: Dimensions.buttonHeight.sm, paddingHorizontal: Spacing[3] },
  size_md: { height: Dimensions.buttonHeight.md, paddingHorizontal: Spacing[5] },
  size_lg: { height: Dimensions.buttonHeight.lg, paddingHorizontal: Spacing[6] },

  // Labels
  label: { fontWeight: Typography.weight.semibold },
  label_primary: { color: Colors.text.inverse },
  label_secondary: { color: Colors.text.primary },
  label_ghost: { color: Colors.brand.primary },
  label_danger: { color: Colors.white },
  labelSize_sm: { fontSize: Typography.size.sm },
  labelSize_md: { fontSize: Typography.size.base },
  labelSize_lg: { fontSize: Typography.size.md },
});
