/**
 * Card — Surface container following the design system.
 */

import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { Colors, Radius, Shadows, Spacing } from '@/theme';

type CardVariant = 'default' | 'elevated' | 'bordered';

interface CardProps extends ViewProps {
  variant?: CardVariant;
  padding?: keyof typeof Spacing;
}

export function Card({ variant = 'default', padding = 4, children, style, ...props }: CardProps) {
  return (
    <View
      style={[
        styles.base,
        styles[variant],
        { padding: Spacing[padding] },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  default: {
    backgroundColor: Colors.surface.default,
    ...Shadows.sm,
  },
  elevated: {
    backgroundColor: Colors.surface.elevated,
    ...Shadows.md,
  },
  bordered: {
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
});
