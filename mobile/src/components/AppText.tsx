/**
 * Text — Typed text component using design system typography.
 */

import React from 'react';
import { Text as RNText, TextProps as RNTextProps } from 'react-native';
import { Colors, Typography } from '@/theme';

type TextVariant =
  | 'display'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'title'
  | 'body'
  | 'bodySmall'
  | 'caption'
  | 'label'
  | 'overline';

type TextColor = 'primary' | 'secondary' | 'tertiary' | 'brand' | 'error' | 'success' | 'inverse';

interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: TextColor;
  bold?: boolean;
  center?: boolean;
  uppercase?: boolean;
}

const variantStyles: Record<TextVariant, object> = {
  display: { fontSize: Typography.size['5xl'], fontWeight: Typography.weight.extrabold, lineHeight: 48 },
  heading1: { fontSize: Typography.size['4xl'], fontWeight: Typography.weight.bold, lineHeight: 40 },
  heading2: { fontSize: Typography.size['3xl'], fontWeight: Typography.weight.bold, lineHeight: 34 },
  heading3: { fontSize: Typography.size['2xl'], fontWeight: Typography.weight.semibold, lineHeight: 30 },
  title: { fontSize: Typography.size.xl, fontWeight: Typography.weight.semibold, lineHeight: 26 },
  body: { fontSize: Typography.size.base, fontWeight: Typography.weight.regular, lineHeight: 22 },
  bodySmall: { fontSize: Typography.size.sm, fontWeight: Typography.weight.regular, lineHeight: 20 },
  caption: { fontSize: Typography.size.xs, fontWeight: Typography.weight.regular, lineHeight: 16 },
  label: { fontSize: Typography.size.sm, fontWeight: Typography.weight.medium, lineHeight: 18 },
  overline: { fontSize: Typography.size.xs, fontWeight: Typography.weight.semibold, letterSpacing: 1.5, lineHeight: 16 },
};

const colorMap: Record<TextColor, string> = {
  primary: Colors.text.primary,
  secondary: Colors.text.secondary,
  tertiary: Colors.text.tertiary,
  brand: Colors.brand.primary,
  error: Colors.status.error,
  success: Colors.status.success,
  inverse: Colors.text.inverse,
};

export function AppText({
  variant = 'body',
  color = 'primary',
  bold,
  center,
  uppercase,
  style,
  ...props
}: TextProps) {
  return (
    <RNText
      style={[
        variantStyles[variant],
        { color: colorMap[color] },
        bold && { fontWeight: Typography.weight.bold },
        center && { textAlign: 'center' },
        uppercase && { textTransform: 'uppercase' },
        style,
      ]}
      {...props}
    />
  );
}
