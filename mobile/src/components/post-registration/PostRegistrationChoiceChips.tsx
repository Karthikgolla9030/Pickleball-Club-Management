/**
 * Aught2 Pickleball — PostRegistrationChoiceChips
 *
 * Standardized selectable chips for post-registration options:
 * - Playoff Bracket Type (Single Elimination / Double Elimination)
 * - Partner Rotation Rule (Full Rotation / Balanced Pairings)
 * - Pool configuration presets
 *
 * Uses established brand colors (#DEF2E6, #0F766E) and responsive flex wrapping.
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Radius, Spacing } from '@/theme';

export interface ChoiceOption {
  label: string;
  value: string;
  subLabel?: string;
}

export interface PostRegistrationChoiceChipsProps {
  label?: string;
  options: (ChoiceOption | string)[];
  selectedValue: string;
  disabled?: boolean;
  onSelect: (value: string) => void;
}

export function PostRegistrationChoiceChips({
  label,
  options,
  selectedValue,
  disabled = false,
  onSelect,
}: PostRegistrationChoiceChipsProps) {
  return (
    <View style={styles.container}>
      {label ? <AppText style={styles.label}>{label}</AppText> : null}
      <View style={styles.chipsRow}>
        {options.map((option) => {
          const item: ChoiceOption =
            typeof option === 'string'
              ? { label: option, value: option }
              : option;

          const isSelected = selectedValue === item.value;

          return (
            <TouchableOpacity
              key={item.value}
              style={[
                styles.chip,
                isSelected && styles.chipActive,
                disabled && styles.chipDisabled,
              ]}
              onPress={() => !disabled && onSelect(item.value)}
              disabled={disabled}
              activeOpacity={0.7}
            >
              <AppText
                style={[
                  styles.chipLabel,
                  isSelected && styles.chipLabelActive,
                  disabled && styles.chipLabelDisabled,
                ]}
              >
                {item.label}
              </AppText>
              {item.subLabel ? (
                <AppText
                  style={[
                    styles.chipSubLabel,
                    isSelected && styles.chipSubLabelActive,
                  ]}
                >
                  {item.subLabel}
                </AppText>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[1.5],
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 18,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: Radius.md,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: '#DEF2E6',
    borderColor: '#0F766E',
  },
  chipDisabled: {
    opacity: 0.6,
  },
  chipLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
  chipLabelActive: {
    color: '#0F766E',
    fontWeight: '700',
  },
  chipLabelDisabled: {
    color: '#94A3B8',
  },
  chipSubLabel: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
  },
  chipSubLabelActive: {
    color: '#134E4A',
    fontWeight: '600',
  },
});
