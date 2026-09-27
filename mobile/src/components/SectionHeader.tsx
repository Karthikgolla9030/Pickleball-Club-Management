/**
 * SectionHeader — Standardized section label with optional count and action.
 *
 * Replaces raw `AppText variant="overline"` patterns.
 * Used to separate content sections within a screen.
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View, ViewProps } from 'react-native';
import { AppText } from './AppText';
import { Colors, Spacing } from '@/theme';

interface SectionHeaderProps extends ViewProps {
  title: string;
  count?: number;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({
  title,
  count,
  actionLabel,
  onAction,
  style,
  ...props
}: SectionHeaderProps) {
  return (
    <View style={[styles.container, style]} {...props}>
      <View style={styles.left}>
        <AppText variant="overline" color="secondary" uppercase>
          {title}
        </AppText>
        {count !== undefined && (
          <View style={styles.countBubble}>
            <AppText variant="caption" style={styles.countText}>
              {count}
            </AppText>
          </View>
        )}
      </View>
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <AppText variant="label" color="brand">
            {actionLabel}
          </AppText>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing[2],
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  countBubble: {
    backgroundColor: Colors.surface.elevated,
    borderRadius: 10,
    paddingHorizontal: Spacing[1.5],
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  countText: {
    color: Colors.text.secondary,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
});
