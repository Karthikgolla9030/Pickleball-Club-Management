/**
 * DateTimePickerInput — Reusable combined Date and Time picker.
 *
 * Provides:
 * - Native touchable input with Calendar & Clock styling
 * - Formatted date & time display (e.g. "Oct 1, 2026 • 10:00 AM")
 * - 2-step modal: Select Date -> Select Time
 * - Outputs ISO 8601 string (e.g. "2026-10-01T10:00:00Z")
 * - Matches theme and styling of FormField & Input
 */

import React, { useState, useMemo } from 'react';
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
import { DatePickerInput } from './DatePickerInput';
import { TimePickerInput } from './TimePickerInput';

interface DateTimePickerInputProps {
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
  testID,
  containerStyle,
}: DateTimePickerInputProps) {
  const [modalVisible, setModalVisible] = useState(false);

  // Parse existing ISO value into date (YYYY-MM-DD) and time (HH:MM:SS)
  const { initialDate, initialTime } = useMemo(() => {
    if (!value || !value.trim()) {
      const today = new Date().toISOString().split('T')[0];
      return { initialDate: today, initialTime: '10:00:00' };
    }
    try {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        const offset = d.getTimezoneOffset() * 60000;
        const localIso = new Date(d.getTime() - offset).toISOString();
        const datePart = localIso.split('T')[0];
        const timePart = localIso.split('T')[1].slice(0, 8);
        return { initialDate: datePart, initialTime: timePart };
      }
    } catch {
      // Fallback
    }
    return { initialDate: '', initialTime: '10:00:00' };
  }, [value]);

  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [selectedTime, setSelectedTime] = useState<string>(initialTime);

  const displayText = useMemo(() => {
    if (!value || !value.trim()) return '';
    try {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
    } catch {
      // Fallback
    }
    return value;
  }, [value]);

  const displayLabel = label ? (required ? `${label} *` : label) : undefined;

  const handleOpen = () => {
    if (disabled) return;
    setSelectedDate(initialDate);
    setSelectedTime(initialTime);
    setModalVisible(true);
  };

  const handleConfirm = () => {
    if (!selectedDate) {
      setModalVisible(false);
      return;
    }
    const timePart = selectedTime || '09:00:00';
    const combined = `${selectedDate}T${timePart}Z`;
    const triggerChange = (val: string) => {
      onChange?.(val);
      onChangeDateTime?.(val);
    };
    triggerChange(combined);
    setModalVisible(false);
  };

  const handleClear = () => {
    onChange?.('');
    onChangeDateTime?.('');
    setModalVisible(false);
  };

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
                    {selectedDate ? (
                      <Text style={styles.modalSubtitle}>
                        {selectedDate} at {selectedTime.slice(0, 5)}
                      </Text>
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
                    onChangeDate={(d) => setSelectedDate(d)}
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
                    onChangeTime={(t) => setSelectedTime(t)}
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
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
    color: Colors.text.primary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: Dimensions.inputHeight,
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingHorizontal: Spacing[4],
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
    fontSize: Typography.size.base,
    color: Colors.text.primary,
  },
  placeholderText: {
    color: Colors.text.tertiary,
  },
  clearBtn: {
    padding: Spacing[1],
  },
  errorText: {
    fontSize: Typography.size.xs,
    color: Colors.status.error,
  },
  hintText: {
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
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
