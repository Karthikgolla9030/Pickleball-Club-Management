/**
 * Aught2 Pickleball — CompetitionFilterSheet
 *
 * Clean, mobile-first bottom sheet for filtering Tournaments and Leagues.
 * - Replaces permanent horizontal chip scrolling on main screens
 * - Provides vertical radio/chip selection for Status and Format
 * - Preserves state on open, applies on confirmation
 * - Integrated Safe Area handling and responsive scrolling via ModalSheet
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { ModalSheet } from '@/components/ModalSheet';
import { Colors, Radius, Spacing, Typography } from '@/theme';

export interface FilterOption<T> {
  value: T;
  label: string;
}

interface CompetitionFilterSheetProps<TStatus extends string = string, TFormat extends string = string> {
  visible: boolean;
  onClose: () => void;
  title?: string;
  statusOptions: FilterOption<TStatus | undefined>[];
  selectedStatus: TStatus | undefined;
  formatOptions?: FilterOption<TFormat | undefined>[];
  selectedFormat?: TFormat | undefined;
  onApply: (status: TStatus | undefined, format: TFormat | undefined) => void;
  onReset: () => void;
}

export function CompetitionFilterSheet<
  TStatus extends string = string,
  TFormat extends string = string
>({
  visible,
  onClose,
  title = 'Filters',
  statusOptions,
  selectedStatus,
  formatOptions,
  selectedFormat,
  onApply,
  onReset,
}: CompetitionFilterSheetProps<TStatus, TFormat>) {
  const [draftStatus, setDraftStatus] = useState<TStatus | undefined>(selectedStatus);
  const [draftFormat, setDraftFormat] = useState<TFormat | undefined>(selectedFormat);

  // Sync draft state whenever sheet opens
  useEffect(() => {
    if (visible) {
      setDraftStatus(selectedStatus);
      setDraftFormat(selectedFormat);
    }
  }, [visible, selectedStatus, selectedFormat]);

  const handleApply = () => {
    onApply(draftStatus, draftFormat);
    onClose();
  };

  const handleReset = () => {
    setDraftStatus(undefined);
    setDraftFormat(undefined);
    onReset();
    onClose();
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle="Select criteria to narrow down competitions"
      actions={[
        {
          label: 'Reset',
          variant: 'secondary',
          onPress: handleReset,
        },
        {
          label: 'Apply Filters',
          variant: 'primary',
          onPress: handleApply,
        },
      ]}
    >
      <View style={styles.container}>
        {/* Status Filter Section */}
        <View style={styles.section}>
          <AppText variant="label" style={styles.sectionTitle}>
            Status
          </AppText>
          <View style={styles.optionsGrid}>
            {statusOptions.map((opt) => {
              const isSelected = draftStatus === opt.value;
              return (
                <TouchableOpacity
                  key={opt.label}
                  style={[
                    styles.optionCard,
                    isSelected && styles.optionCardSelected,
                  ]}
                  onPress={() => setDraftStatus(opt.value)}
                  activeOpacity={0.7}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View
                    style={[
                      styles.radioCircle,
                      isSelected && styles.radioCircleSelected,
                    ]}
                  >
                    {isSelected && <View style={styles.radioDot} />}
                  </View>
                  <AppText
                    variant="bodySmall"
                    color={isSelected ? 'primary' : 'secondary'}
                    style={[
                      styles.optionLabel,
                      isSelected && styles.optionLabelSelected,
                    ]}
                  >
                    {opt.label}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Optional Format Filter Section */}
        {formatOptions && formatOptions.length > 0 && (
          <View style={styles.section}>
            <AppText variant="label" style={styles.sectionTitle}>
              Format
            </AppText>
            <View style={styles.optionsGrid}>
              {formatOptions.map((opt) => {
                const isSelected = draftFormat === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    style={[
                      styles.optionCard,
                      isSelected && styles.optionCardSelected,
                    ]}
                    onPress={() => setDraftFormat(opt.value)}
                    activeOpacity={0.7}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View
                      style={[
                        styles.radioCircle,
                        isSelected && styles.radioCircleSelected,
                      ]}
                    >
                      {isSelected && <View style={styles.radioDot} />}
                    </View>
                    <AppText
                      variant="bodySmall"
                      color={isSelected ? 'primary' : 'secondary'}
                      style={[
                        styles.optionLabel,
                        isSelected && styles.optionLabelSelected,
                      ]}
                    >
                      {opt.label}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[5],
  },
  section: {
    gap: Spacing[2.5],
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    minWidth: '47%',
    flexGrow: 1,
    gap: Spacing[2],
  },
  optionCardSelected: {
    borderColor: Colors.brand.primary,
    backgroundColor: '#E7F5EC',
  },
  radioCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.text.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: Colors.brand.primary,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.brand.primary,
  },
  optionLabel: {
    fontSize: Typography.size.sm,
    flexShrink: 1,
  },
  optionLabelSelected: {
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
  },
});
