/**
 * ScreenHeader — Responsive screen title, subtitle, and action header.
 *
 * Prevents header/action collisions across all screen widths (320px – 414px+):
 * - Long titles wrap naturally without truncation
 * - Subtitle provides secondary context
 * - Action buttons wrap cleanly or sit in a dedicated action row
 * - Avoids rigid horizontal rows where Title + Button collide
 */

import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { AppText } from './AppText';
import { Spacing } from '@/theme';

interface ScreenHeaderProps extends ViewProps {
  title: string;
  subtitle?: string;
  /** Right-aligned small element (e.g. a Badge or small icon) */
  rightElement?: React.ReactNode;
  /** Dedicated action element (e.g. a Button). Rendered cleanly below title/subtitle */
  action?: React.ReactNode;
}

export function ScreenHeader({
  title,
  subtitle,
  rightElement,
  action,
  style,
  ...props
}: ScreenHeaderProps) {
  return (
    <View style={[styles.container, style]} {...props}>
      <View style={styles.topRow}>
        <View style={styles.textCol}>
          {title ? (
            <AppText variant="heading3" style={styles.title}>
              {title}
            </AppText>
          ) : null}
          {subtitle ? (
            <AppText variant="caption" color="secondary" style={styles.subtitle}>
              {subtitle}
            </AppText>
          ) : null}
        </View>

        {rightElement && (
          <View style={styles.rightSlot}>{rightElement}</View>
        )}
      </View>

      {action && (
        <View style={styles.actionRow}>{action}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    gap: Spacing[1.5],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  textCol: {
    flex: 1,
    minWidth: 160,
    gap: 2,
  },
  title: {
    flexShrink: 1,
  },
  subtitle: {
    flexShrink: 1,
  },
  rightSlot: {
    flexShrink: 0,
    alignSelf: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: Spacing[0.5],
  },
});
