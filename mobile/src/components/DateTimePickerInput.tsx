/**
 * DateTimePickerInput — Reusable combined Date and Time picker.
 *
 * Provides:
 * - Native touchable input with Calendar & Clock styling
 * - Real-time state updates on selection: updates parent state immediately
 * - Formatted date & time display (e.g. "Nov 4, 2026 • 10:00 AM") without timezone drift
 * - 2-step modal: Select Date -> Select Time
 * - Full synchronization between form state, modal state, and API payload
 * - Clean validation and error display
 * - Matches theme and styling of FormField & Input
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from 'react-native';
import { Calendar, ChevronDown, Clock, X } from 'lucide-react-native';

import { Colors, Dimensions, Radius, Spacing, Typography } from '@/theme';
import {
  buildIsoFromLocalParts,
  formatDateTimeDisplay,
  parseIsoToLocalParts,
} from '@/utils/timeUtils';
import { DatePickerInput } from './DatePickerInput';
import { TimePickerInput } from './TimePickerInput';

export interface DateTimePickerInputProps {
  label?: string;
  value?: string | null; // ISO string e.g. "2026-10-01T10:00:00Z"
  onChange?: (isoString: string) => void;
  onChangeDateTime?: (isoString: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  allowClear?: boolean;
  minDate?: string; // YYYY-MM-DD
  maxDate?: string; // YYYY-MM-DD
  defaultTime?: string; // e.g. "09:00:00"
  testID?: string;
  containerStyle?: ViewStyle;
}

export function DateTimePickerInput({
  label,
  value,
  onChange,
  onChangeDateTime,
  placeholder = 'Select date and time',
  error,
  hint,
  required,
  disabled = false,
  allowClear = true,
  minDate,
  maxDate,
  defaultTime = '09:00:00',
  testID,
  containerStyle,
}: DateTimePickerInputProps) {
  const [modalVisible, setModalVisible] = useState(false);

  // Synchronize internal working state with external value
  const parsed = useMemo(
    () => parseIsoToLocalParts(value, defaultTime),
    [value, defaultTime]
  );

  const [selectedDate, setSelectedDate] = useState<string>(parsed.datePart);
  const [selectedTime, setSelectedTime] = useState<string>(parsed.timePart);

  // Keep internal modal state fully in sync with external value prop
  useEffect(() => {
    setSelectedDate(parsed.datePart);
    setSelectedTime(parsed.timePart);
  }, [parsed]);

  // Formatted display text on the main input row (e.g. "Nov 4, 2026 • 10:00 AM")
  const displayText = useMemo(() => {
    return formatDateTimeDisplay(value);
  }, [value]);

  const displayLabel = label ? (required ? `${label} *` : label) : undefined;

  const triggerChange = (val: string) => {
    onChange?.(val);
    onChangeDateTime?.(val);
  };

  const handleOpen = () => {
    if (disabled) return;
    const current = parseIsoToLocalParts(value, defaultTime);
    setSelectedDate(current.datePart);
    setSelectedTime(current.timePart);
    setModalVisible(true);
  };

  // Immediate update when user selects a date
  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    if (newDate) {
      const updatedIso = buildIsoFromLocalParts(newDate, selectedTime || defaultTime);
      if (updatedIso) {
        triggerChange(updatedIso);
      }
    }
  };

  // Immediate update when user selects a time
  const handleTimeChange = (newTime: string) => {
    const canonicalTime = newTime.length === 5 ? `${newTime}:00` : newTime;
    setSelectedTime(canonicalTime);
    if (selectedDate) {
      const updatedIso = buildIsoFromLocalParts(selectedDate, canonicalTime);
      if (updatedIso) {
        triggerChange(updatedIso);
      }
    }
  };

  const handleConfirm = () => {
    if (selectedDate) {
      const finalIso = buildIsoFromLocalParts(selectedDate, selectedTime || defaultTime);
      if (finalIso) {
        triggerChange(finalIso);
      }
    }
    setModalVisible(false);
  };

  const handleClear = () => {
    triggerChange('');
    const fresh = parseIsoToLocalParts('', defaultTime);
    setSelectedDate(fresh.datePart);
    setSelectedTime(fresh.timePart);
    setModalVisible(false);
  };

  // Live preview inside the modal header
  const modalSubtitleText = useMemo(() => {
    if (!selectedDate) return '';
    try {
      const [y, m, d] = selectedDate.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const dateStr = dateObj.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const parts = (selectedTime || defaultTime).split(':').map(Number);
      let hours = parts[0] || 0;
      const minutes = String(parts[1] || 0).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      if (hours === 0) hours = 12;
      const hStr = String(hours).padStart(2, '0');
      return `${dateStr} at ${hStr}:${minutes} ${ampm}`;
    } catch {
      return `${selectedDate} at ${selectedTime.slice(0, 5)}`;
    }
  }, [selectedDate, selectedTime, defaultTime]);

  return (
    <View style={[styles.container, containerStyle]}>
      {displayLabel && <Text style={styles.label}>{displayLabel}</Text>}

      <TouchableOpacity
        testID={testID}
        style={[
          styles.inputRow,
          modalVisible && styles.inputFocused,
          !!error && styles.inputError,
          disabled && styles.inputDisabled,
        ]}
        onPress={handleOpen}
        activeOpacity={0.7}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label || 'Select Date and Time'}
      >
        <Calendar size={18} color={value ? Colors.brand.primary : Colors.text.tertiary} style={styles.leadingIcon} />

        <Text style={[styles.valueText, !value && styles.placeholderText]}>
          {displayText || placeholder}
        </Text>

        {value && allowClear && !disabled ? (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={handleClear}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={16} color={Colors.text.tertiary} />
          </TouchableOpacity>
        ) : (
          <ChevronDown size={16} color={Colors.text.tertiary} />
        )}
      </TouchableOpacity>

      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hintText}>{hint}</Text>
      ) : null}

      {/* Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                {/* Header */}
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>{label || 'Select Date & Time'}</Text>
                    {modalSubtitleText ? (
                      <Text style={styles.modalSubtitle}>{modalSubtitleText}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    style={styles.closeBtn}
                    onPress={() => setModalVisible(false)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <X size={20} color={Colors.text.primary} />
                  </TouchableOpacity>
                </View>

                {/* Date Input inside Modal */}
                <View style={styles.fieldSection}>
                  <DatePickerInput
                    label="Date"
                    value={selectedDate}
                    onChangeDate={handleDateChange}
                    onChange={handleDateChange}
                    minDate={minDate}
                    maxDate={maxDate}
                    required
                  />
                </View>

                {/* Time Input inside Modal */}
                <View style={styles.fieldSection}>
                  <TimePickerInput
                    label="Time"
                    value={selectedTime}
                    onChangeTime={handleTimeChange}
                    onChange={handleTimeChange}
                    includeSeconds
                    required
                  />
                </View>

                {/* Actions */}
                <View style={styles.modalActions}>
                  {allowClear && (
                    <TouchableOpacity
                      style={styles.actionBtnSecondary}
                      onPress={handleClear}
                    >
                      <Text style={styles.actionBtnSecondaryText}>Clear</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.actionBtnPrimary}
                    onPress={handleConfirm}
                  >
                    <Text style={styles.actionBtnPrimaryText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[1.5],
  },
  label: {
    fontSize: 13.5,
    fontWeight: '600',
    color: Colors.text.primary,
    letterSpacing: 0.1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: Dimensions.inputHeight,
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingHorizontal: Spacing[3.5],
    overflow: 'hidden',
  },
  inputFocused: {
    borderColor: Colors.brand.primary,
    borderWidth: 1.5,
  },
  inputError: {
    borderColor: Colors.status.error,
    borderWidth: 1.5,
  },
  inputDisabled: {
    backgroundColor: Colors.surface.elevated,
    opacity: 0.6,
  },
  leadingIcon: {
    marginRight: Spacing[2.5],
  },
  valueText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text.primary,
    fontWeight: Typography.weight.medium,
  },
  placeholderText: {
    fontSize: 14,
    color: Colors.text.tertiary,
  },
  clearBtn: {
    padding: Spacing[1],
  },
  errorText: {
    fontSize: 12,
    color: Colors.status.error,
    lineHeight: 16,
    marginTop: 2,
  },
  hintText: {
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 16,
    marginTop: 2,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[4],
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.xl,
    padding: Spacing[4],
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing[4],
  },
  modalTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  modalSubtitle: {
    fontSize: Typography.size.xs,
    color: Colors.brand.primary,
    fontWeight: Typography.weight.semibold,
    marginTop: 2,
  },
  closeBtn: {
    padding: Spacing[1],
  },
  fieldSection: {
    marginBottom: Spacing[3],
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing[2],
    marginTop: Spacing[2],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: Colors.surface.border,
  },
  actionBtnSecondary: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
  },
  actionBtnSecondaryText: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    fontWeight: Typography.weight.medium,
  },
  actionBtnPrimary: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2.5],
    borderRadius: Radius.md,
    backgroundColor: Colors.brand.primary,
  },
  actionBtnPrimaryText: {
    fontSize: Typography.size.sm,
    color: '#FFFFFF',
    fontWeight: Typography.weight.bold,
  },
});
