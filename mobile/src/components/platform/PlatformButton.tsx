/**
 * PlatformButton — Standardized Button Component for Platform Admin Portal
 *
 * Implements the single unified green-button design system across all Platform Admin screens:
 * - Background: #15803D (Tailwind green-700 / Colors.platform.primary)
 * - Hover / Pressed: #166534 (Colors.platform.primaryHover)
 * - Text & Icon: #FFFFFF
 * - Border Radius: Radius.md (8px crisp rounded rect)
 * - Typography: Font weight '600' (Semibold)
 * - Sizes:
 *   - 'sm': 36px height (card actions: "Inspect Facility Profile", "Inspect & Reply", "Approve Club")
 *   - 'md': 44px height (forms & modals: "Save Settings", "Approve & Activate Club", "Send Admin Reply", "Sign In")
 *   - 'lg': 48px height
 * - Touch Targets & Accessibility: Compliant with WCAG guidelines
 */

import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '@/theme';

export type PlatformButtonVariant = 'primary' | 'outline' | 'secondary' | 'danger';
export type PlatformButtonSize = 'sm' | 'md' | 'lg';

export interface PlatformButtonProps {
  onPress: () => void;
  label: string;
  variant?: PlatformButtonVariant;
  size?: PlatformButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

export function PlatformButton({
  onPress,
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  style,
  labelStyle,
  testID,
  accessibilityLabel,
}: PlatformButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        styles[`size_${size}`],
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && (variant === 'primary' ? styles.primaryPressed : styles.pressed),
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? Colors.platform.text : Colors.platform.primary}
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
          >
            {label}
          </Text>
          {rightIcon && <View style={styles.iconRight}>{rightIcon}</View>}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md, // 8px crisp rounded rect
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'background-color 0.15s ease, transform 0.1s ease',
      },
    }),
  },
  fullWidth: {
    width: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLeft: {
    marginRight: 6,
  },
  iconRight: {
    marginLeft: 6,
  },

  // ─── Variants ─────────────────────────────────────────────────────────────
  primary: {
    backgroundColor: Colors.platform.primary, // #15803D
    borderWidth: 1,
    borderColor: Colors.platform.primary,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(21, 128, 61, 0.2)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  outline: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  secondary: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  danger: {
    backgroundColor: '#DC2626',
    borderWidth: 1,
    borderColor: '#DC2626',
  },

  // ─── Interaction States ────────────────────────────────────────────────────
  primaryPressed: {
    backgroundColor: Colors.platform.primaryHover, // #166534
    borderColor: Colors.platform.primaryHover,
    opacity: 0.94,
    transform: [{ scale: 0.98 }],
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.5,
  },

  // ─── Sizes ────────────────────────────────────────────────────────────────
  size_sm: {
    height: 36,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  size_md: {
    height: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  size_lg: {
    height: 48,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },

  // ─── Label Typography ─────────────────────────────────────────────────────
  label: {
    fontWeight: Typography.weight.semibold, // 600
  },
  label_primary: {
    color: Colors.platform.text, // #FFFFFF
  },
  label_outline: {
    color: '#374151',
  },
  label_secondary: {
    color: '#374151',
  },
  label_danger: {
    color: '#FFFFFF',
  },
  labelSize_sm: {
    fontSize: 13,
    letterSpacing: -0.1,
  },
  labelSize_md: {
    fontSize: 14,
    letterSpacing: -0.1,
  },
  labelSize_lg: {
    fontSize: 15,
  },
});
