/**
 * Button — Premium interactive button using design system tokens.
 * Supports multiple variants, loading states, icons, and disabled states.
 *
 * Light theme updates:
 * - 'primary': deep forest green, pill-shaped (full radius)
 * - 'secondary': white bg, 1px border, dark text
 * - 'danger': soft red — tinted bg (#FEE2E2) + red text (NOT solid red block)
 * - 'ghost': transparent + forest green border/text
 * - 'outline': white bg + border (same as secondary, alias kept for compat)
 * - Minimum tap height 44pt enforced on md/lg
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Colors, Dimensions, Radius, Shadows, Spacing, Typography } from '@/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  onPress: () => void;
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  testID?: string;
  /** Icon element rendered before the label */
  leftIcon?: React.ReactNode;
  /** Icon element rendered after the label */
  rightIcon?: React.ReactNode;
  /** Optional badge count number rendered after label (e.g. active filter count) */
  badgeCount?: number;
}

export function Button({
  onPress,
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth,
  style,
  labelStyle,
  testID,
  leftIcon,
  rightIcon,
  badgeCount,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const hasFlex = style && typeof style === 'object' && ('flex' in style || 'flexGrow' in style);
  const isFullWidth = fullWidth !== undefined ? fullWidth : (!hasFlex && size !== 'sm');

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        styles[`size_${size}`],
        isFullWidth && styles.fullWidth,
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
          color={
            variant === 'primary'
              ? Colors.text.inverse
              : variant === 'danger'
              ? Colors.status.error
              : Colors.brand.primary
          }
          size="small"
        />
      ) : (
        <View style={styles.content}>
          {leftIcon && <View style={styles.iconLeft}>{leftIcon}</View>}
          <Text
            style={[
              styles.label,
              styles[`label_${variant}`],
              styles[`labelSize_${size}`],
              labelStyle,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit={false}
          >
            {label}
          </Text>
          {badgeCount !== undefined && badgeCount > 0 && (
            <View
              style={[
                styles.badgePill,
                variant === 'primary' ? styles.badgePillInverse : styles.badgePillBrand,
              ]}
            >
              <Text
                style={[
                  styles.badgePillText,
                  variant === 'primary' ? styles.badgePillTextInverse : styles.badgePillTextBrand,
                ]}
              >
                {badgeCount}
              </Text>
            </View>
          )}
          {rightIcon && <View style={styles.iconRight}>{rightIcon}</View>}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.lg, // 12px rounded rect
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  fullWidth: { width: '100%' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.4 },

  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLeft: {
    marginRight: Spacing[1.5],
  },
  iconRight: {
    marginLeft: Spacing[1.5],
  },

  badgePill: {
    marginLeft: Spacing[1.5],
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgePillBrand: {
    backgroundColor: Colors.brand.primaryLight,
    borderWidth: 1,
    borderColor: Colors.brand.primary,
  },
  badgePillInverse: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  badgePillText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
  },
  badgePillTextBrand: {
    color: Colors.brand.primary,
  },
  badgePillTextInverse: {
    color: Colors.text.inverse,
  },

  // ─── Variants ─────────────────────────────────────────────────────────────
  primary: {
    backgroundColor: Colors.brand.primary,
    ...Shadows.brand,
  },
  secondary: {
    backgroundColor: Colors.surface.default,  // white
    borderWidth: 1,
    borderColor: Colors.surface.border,
    ...Shadows.sm,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.brand.primary,
  },
  outline: {
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  // Soft danger: tinted bg + red text (no solid red block)
  danger: {
    backgroundColor: Colors.status.errorBg,
    borderWidth: 1,
    borderColor: Colors.status.error,
  },

  // ─── Sizes ────────────────────────────────────────────────────────────────
  size_sm: { height: Dimensions.buttonHeight.sm, paddingHorizontal: Spacing[3] },
  size_md: { height: Dimensions.buttonHeight.md, paddingHorizontal: Spacing[4] },
  size_lg: { height: Dimensions.buttonHeight.lg, paddingHorizontal: Spacing[5] },

  // ─── Label Colors ─────────────────────────────────────────────────────────
  label: { fontWeight: Typography.weight.semibold },
  label_primary: { color: Colors.text.inverse },
  label_secondary: { color: Colors.text.primary },
  label_ghost: { color: Colors.brand.primary },
  label_outline: { color: Colors.text.primary },
  label_danger: { color: Colors.status.error },
  labelSize_sm: { fontSize: Typography.size.sm },
  labelSize_md: { fontSize: Typography.size.sm + 1 }, // 14px
  labelSize_lg: { fontSize: Typography.size.base },
});
