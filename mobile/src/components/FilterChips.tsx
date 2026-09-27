/**
 * FilterChips — Horizontally scrollable chip row for status/category filters.
 *
 * Light theme: inactive chips = white bg + #E5E7EB border + gray text
 *              active chips = solid forest green + white text
 * 32px height for comfortable tap targets.
 */

import React from 'react';
import {
  ScrollView,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { AppText } from './AppText';
import { Colors, Radius, Spacing } from '@/theme';

interface Chip<T extends string> {
  key: T;
  label: string;
}

interface FilterChipsProps<T extends string> {
  chips: Chip<T>[];
  activeChip: T;
  onChipPress: (chip: T) => void;
  /** If true, each chip expands to fill equal width (max 4 chips) */
  equalWidth?: boolean;
  /** Outer container style */
  style?: StyleProp<ViewStyle>;
  /** Inner content container style */
  contentContainerStyle?: StyleProp<ViewStyle>;
}

export function FilterChips<T extends string>({
  chips,
  activeChip,
  onChipPress,
  equalWidth = false,
  style,
  contentContainerStyle,
}: FilterChipsProps<T>) {
  const renderChip = (chip: Chip<T>, isEqual: boolean) => {
    const isActive = chip.key === activeChip;
    return (
      <TouchableOpacity
        key={chip.key}
        style={[
          styles.chip,
          isActive && styles.chipActive,
          isEqual && styles.chipEqual,
        ]}
        onPress={() => onChipPress(chip.key)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={chip.label}
        accessibilityState={{ selected: isActive }}
      >
        <AppText
          variant="caption"
          bold={isActive}
          style={[
            styles.chipLabel,
            isActive ? styles.chipLabelActive : styles.chipLabelInactive,
          ]}
          numberOfLines={1}
        >
          {chip.label}
        </AppText>
      </TouchableOpacity>
    );
  };

  // Equal-width inline row for ≤4 chips
  if (equalWidth && chips.length <= 4) {
    return (
      <View style={[styles.inlineRow, style]}>
        {chips.map((chip) => renderChip(chip, true))}
      </View>
    );
  }

  // Horizontal scroll for many chips
  return (
    <View style={style}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      >
        {chips.map((chip) => renderChip(chip, false))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[1],
    gap: Spacing[2],
    alignItems: 'center',
  },
  inlineRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[1],
    gap: Spacing[2],
  },
  chip: {
    paddingHorizontal: Spacing[3],
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface.default, // white
    borderWidth: 1,
    borderColor: Colors.surface.border,      // #E5E7EB
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: Colors.brand.primary,   // #1B6B45
    borderColor: Colors.brand.primary,
  },
  chipEqual: {
    flex: 1,
  },
  chipLabel: {
    fontSize: 13,
    letterSpacing: 0.1,
  },
  chipLabelActive: {
    color: Colors.text.inverse,  // white
    fontWeight: '600',
  },
  chipLabelInactive: {
    color: Colors.text.secondary, // #6B7280
  },
});
