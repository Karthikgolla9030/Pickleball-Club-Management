/**
 * FormRow — Responsive multi-column layout for form fields.
 *
 * Ensures form fields (like email, phone, website, address) never get compressed
 * or cut off on mobile screens. Automatically stacks vertically on narrow viewports
 * (< 520px) and displays side-by-side on wider screens.
 *
 * For compact pairs that should always remain side-by-side (e.g. Opening/Closing time),
 * pass `stackOnMobile={false}`.
 */

import React from 'react';
import {
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { Spacing } from '@/theme';

export interface FormRowProps {
  children: React.ReactNode;
  /** Gap between columns/rows (default: 12px) */
  gap?: number;
  /** Screen width threshold below which fields stack vertically (default: 520px) */
  breakpoint?: number;
  /** Whether to stack fields into a single column on mobile (default: true) */
  stackOnMobile?: boolean;
  /** Custom container style */
  style?: StyleProp<ViewStyle>;
  /** Custom column container style */
  colStyle?: StyleProp<ViewStyle>;
}

export function FormRow({
  children,
  gap = Spacing[3],
  breakpoint = 520,
  stackOnMobile = true,
  style,
  colStyle,
}: FormRowProps) {
  const { width } = useWindowDimensions();
  const shouldStack = stackOnMobile && width < breakpoint;

  return (
    <View
      style={[
        styles.row,
        { gap },
        shouldStack ? styles.colLayout : styles.rowLayout,
        style,
      ]}
    >
      {React.Children.map(children, (child) => {
        if (!child) return null;
        return (
          <View
            style={[
              styles.col,
              shouldStack ? styles.fullWidthCol : styles.flexCol,
              colStyle,
            ]}
          >
            {child}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
  },
  rowLayout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  colLayout: {
    flexDirection: 'column',
    width: '100%',
  },
  col: {
    minWidth: 0,
  },
  flexCol: {
    flex: 1,
  },
  fullWidthCol: {
    width: '100%',
  },
});

