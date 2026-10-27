/**
 * DateRangePickerInput — Reusable Start Date and End Date range selector.
 *
 * Provides:
 * - Two coordinated DatePickerInput fields (Start Date and End Date)
 * - Automatic constraint: End Date cannot be earlier than Start Date
 * - Range validation message if invalid
 * - Mobile responsive row (stacks on narrow viewports)
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, View, ViewStyle, useWindowDimensions } from 'react-native';

import { Spacing, Typography, Colors } from '@/theme';
import { DatePickerInput } from './DatePickerInput';

interface DateRangePickerInputProps {
  label?: string;
  startDate?: string | null; // YYYY-MM-DD
  endDate?: string | null;   // YYYY-MM-DD
  onChangeRange?: (startDate: string, endDate: string) => void;
  onStartDateChange?: (startDate: string) => void;
  onEndDateChange?: (endDate: string) => void;
  minDate?: string;
  maxDate?: string;
  startLabel?: string;
  endLabel?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  allowClear?: boolean;
  containerStyle?: ViewStyle;
}

export function DateRangePickerInput({
  label,
  startDate = '',
  endDate = '',
  onChangeRange,
  onStartDateChange,
  onEndDateChange,
  minDate,
  maxDate,
  startLabel = 'Start Date',
  endLabel = 'End Date',
  error,
  hint,
  required,
  disabled = false,
  allowClear = true,
  containerStyle,
}: DateRangePickerInputProps) {
  const { width } = useWindowDimensions();
  const isNarrow = width < 480;

  const handleStartChange = (newStart: string) => {
    // If newStart > endDate, bump or reset endDate
    let newEnd = endDate || '';
    if (newStart && newEnd && newStart > newEnd) {
      newEnd = newStart;
      onEndDateChange?.(newStart);
    }
    onStartDateChange?.(newStart);
    onChangeRange?.(newStart, newEnd);
  };

  const handleEndChange = (newEnd: string) => {
    onEndDateChange?.(newEnd);
    onChangeRange?.(startDate || '', newEnd);
  };

  const rangeError = useMemo(() => {
    if (error) return error;
    if (startDate && endDate && startDate > endDate) {
      return 'End date must be on or after start date.';
    }
    return undefined;
  }, [error, startDate, endDate]);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text style={styles.sectionLabel}>
          {required ? `${label} *` : label}
        </Text>
      )}

      <View style={[styles.inputsRow, isNarrow && styles.inputsCol]}>
        <View style={styles.fieldCol}>
          <DatePickerInput
            label={startLabel}
            value={startDate}
            onChangeDate={handleStartChange}
            minDate={minDate}
            maxDate={endDate || maxDate}
            required={required}
            disabled={disabled}
            allowClear={allowClear}
            placeholder="Select start"
          />
        </View>

        <View style={styles.fieldCol}>
          <DatePickerInput
            label={endLabel}
            value={endDate}
            onChangeDate={handleEndChange}
            minDate={startDate || minDate}
            maxDate={maxDate}
            required={required}
            disabled={disabled}
            allowClear={allowClear}
            placeholder="Select end"
          />
        </View>
      </View>

      {rangeError ? (
        <Text style={styles.errorText}>{rangeError}</Text>
      ) : hint ? (
        <Text style={styles.hintText}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[1.5],
  },
  sectionLabel: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
    color: Colors.text.primary,
  },
  inputsRow: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  inputsCol: {
    flexDirection: 'column',
    gap: Spacing[2],
  },
  fieldCol: {
    flex: 1,
  },
  errorText: {
    fontSize: Typography.size.xs,
    color: Colors.status.error,
  },
  hintText: {
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
  },
});
