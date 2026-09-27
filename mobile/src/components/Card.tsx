/**
 * Card — Surface container following the design system.
 *
 * Light theme: white bg with soft shadow for default cards.
 * No overflow:hidden — shadows clip on Android.
 */

import React from 'react';
import { Pressable, StyleSheet, View, ViewProps } from 'react-native';
import { Colors, Radius, Shadows, Spacing } from '@/theme';

type CardVariant = 'default' | 'elevated' | 'bordered' | 'highlight';

interface CardProps extends ViewProps {
  variant?: CardVariant;
  padding?: keyof typeof Spacing;
  /** If provided, wraps content in Pressable for tappable cards */
  onPress?: () => void;
  /** Pressed scale effect */
  pressScale?: boolean;
}

export function Card({
  variant = 'default',
  padding = 5,
  onPress,
  pressScale = true,
  children,
  style,
  ...props
}: CardProps) {
  const containerStyle = [
    styles.base,
    styles[variant],
    { padding: Spacing[padding] },
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [
          ...containerStyle,
          pressed && pressScale && styles.pressed,
        ]}
        onPress={onPress}
        accessibilityRole="button"
        {...props}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View style={containerStyle} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.lg, // 12px rounded rect
  },
  default: {
    backgroundColor: Colors.surface.default, // #FFFFFF
    borderWidth: 1,
    borderColor: Colors.surface.border,
    ...Shadows.sm, // Exact shadow defined in spacing.ts
  },
  elevated: {
    backgroundColor: Colors.surface.elevated, // #F7F8FA
    borderWidth: 1,
    borderColor: Colors.surface.border,
    ...Shadows.md,
  },
  bordered: {
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  highlight: {
    backgroundColor: Colors.brand.primaryLight, // #E7F5EC tint
    borderWidth: 1.5,
    borderColor: Colors.brand.primary,
    ...Shadows.brand,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
});
