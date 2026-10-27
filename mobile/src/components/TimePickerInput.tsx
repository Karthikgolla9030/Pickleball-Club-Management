/**
 * TimePickerInput — Reusable time picker component.
 *
 * Provides:
 * - Native touchable input with Clock icon
 * - Formatted 12h/24h readable time display
 * - Interactive modal with hours, minutes, and AM/PM selection
 * - Returns standardized 24h format (e.g. "18:00:00" or "18:00")
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
import { Clock, ChevronDown, X } from 'lucide-react-native';

import { Colors, Dimensions, Radius, Spacing, Typography } from '@/theme';

interface TimePickerInputProps {
  label?: string;
  value?: string | null; // "HH:MM:SS" or "HH:MM" in 24hr format
  onChange?: (timeStr: string) => void;
  onChangeTime?: (timeStr: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  allowClear?: boolean;
  includeSeconds?: boolean; // If true outputs HH:MM:00, else HH:MM
  testID?: string;
  containerStyle?: ViewStyle;
}

const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES_INTERVALS = ['00', '15', '30', '45'];
const ALL_MINUTES = [
  '00', '05', '10', '15', '20', '25',
  '30', '35', '40', '45', '50', '55',
];

export function TimePickerInput({
  label,
  value,
  onChange,
  onChangeTime,
  placeholder = 'Select time',
  error,
  hint,
  required,
  disabled = false,
  allowClear = true,
  includeSeconds = true,
  testID,
  containerStyle,
}: TimePickerInputProps) {
  const [modalVisible, setModalVisible] = useState(false);

  // Parse existing value into 12h hour, minute, and period
  const parsedTime = useMemo(() => {
    if (!value || !value.trim()) {
      return { hour12: 9, minute: '00', period: 'AM' as 'AM' | 'PM' };
    }
    const parts = value.trim().split(':');
    let h24 = parseInt(parts[0], 10) || 0;
    const m = (parts[1] || '00').padStart(2, '0');
    const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
    let hour12 = h24 % 12;
    if (hour12 === 0) hour12 = 12;
    return { hour12, minute: m, period };
  }, [value]);

  const [selectedHour, setSelectedHour] = useState<number>(parsedTime.hour12);
  const [selectedMinute, setSelectedMinute] = useState<string>(parsedTime.minute);
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>(parsedTime.period);

  // Sync internal state when opening modal
  const handleOpen = () => {
    if (disabled) return;
    setSelectedHour(parsedTime.hour12);
    setSelectedMinute(parsedTime.minute);
    setSelectedPeriod(parsedTime.period);
    setModalVisible(true);
  };

  // Format readable display
  const displayText = useMemo(() => {
    if (!value || !value.trim()) return '';
    const { hour12, minute, period } = parsedTime;
    const hStr = String(hour12).padStart(2, '0');
    return `${hStr}:${minute} ${period}`;
  }, [value, parsedTime]);

  const displayLabel = label ? (required ? `${label} *` : label) : undefined;

  const triggerChange = (val: string) => {
    onChange?.(val);
    onChangeTime?.(val);
  };

  const handleConfirm = () => {
    let h24 = selectedHour % 12;
    if (selectedPeriod === 'PM') h24 += 12;
    const hStr = String(h24).padStart(2, '0');
    const mStr = String(selectedMinute).padStart(2, '0');
    const result = includeSeconds ? `${hStr}:${mStr}:00` : `${hStr}:${mStr}`;
    triggerChange(result);
    setModalVisible(false);
  };

  const handleClear = () => {
    triggerChange('');
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
        accessibilityLabel={label || 'Select Time'}
      >
        <Clock size={18} color={value ? Colors.brand.primary : Colors.text.tertiary} style={styles.leadingIcon} />

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

      {/* Time Picker Modal */}
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
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>{label || 'Select Time'}</Text>
                    <Text style={styles.timePreview}>
                      {String(selectedHour).padStart(2, '0')}:{selectedMinute} {selectedPeriod}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.closeBtn}
                    onPress={() => setModalVisible(false)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <X size={20} color={Colors.text.primary} />
                  </TouchableOpacity>
                </View>

                {/* AM / PM Toggle */}
                <View style={styles.periodToggleRow}>
                  <TouchableOpacity
                    style={[styles.periodBtn, selectedPeriod === 'AM' && styles.periodBtnActive]}
                    onPress={() => setSelectedPeriod('AM')}
                  >
                    <Text style={[styles.periodBtnText, selectedPeriod === 'AM' && styles.periodBtnTextActive]}>
                      AM (Morning)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.periodBtn, selectedPeriod === 'PM' && styles.periodBtnActive]}
                    onPress={() => setSelectedPeriod('PM')}
                  >
                    <Text style={[styles.periodBtnText, selectedPeriod === 'PM' && styles.periodBtnTextActive]}>
                      PM (Afternoon / Evening)
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Hours Grid */}
                <Text style={styles.sectionLabel}>HOUR</Text>
                <View style={styles.grid}>
                  {HOURS_12.map((hr) => {
                    const isSelected = hr === selectedHour;
                    return (
                      <TouchableOpacity
                        key={hr}
                        style={[styles.gridCell, isSelected && styles.gridCellSelected]}
                        onPress={() => setSelectedHour(hr)}
                      >
                        <Text style={[styles.gridCellText, isSelected && styles.gridCellTextSelected]}>
                          {hr}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Minutes Grid */}
                <Text style={styles.sectionLabel}>MINUTE</Text>
                <View style={styles.grid}>
                  {ALL_MINUTES.map((min) => {
                    const isSelected = min === selectedMinute;
                    return (
                      <TouchableOpacity
                        key={min}
                        style={[styles.gridCell, isSelected && styles.gridCellSelected]}
                        onPress={() => setSelectedMinute(min)}
                      >
                        <Text style={[styles.gridCellText, isSelected && styles.gridCellTextSelected]}>
                          :{min}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Modal Actions */}
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
                    <Text style={styles.actionBtnPrimaryText}>Confirm Time</Text>
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
    maxWidth: 380,
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
    marginBottom: Spacing[3],
  },
  modalTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  timePreview: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: Colors.brand.primary,
    marginTop: 2,
  },
  closeBtn: {
    padding: Spacing[1],
  },
  periodToggleRow: {
    flexDirection: 'row',
    gap: Spacing[2],
    marginBottom: Spacing[3],
  },
  periodBtn: {
    flex: 1,
    paddingVertical: Spacing[2.5],
    alignItems: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  periodBtnActive: {
    backgroundColor: Colors.brand.primaryLight || '#E8F5EE',
    borderColor: Colors.brand.primary,
  },
  periodBtnText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
    color: Colors.text.secondary,
  },
  periodBtnTextActive: {
    color: Colors.brand.primary,
    fontWeight: Typography.weight.bold,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: Typography.weight.bold,
    color: Colors.text.tertiary,
    marginBottom: Spacing[1.5],
    marginTop: Spacing[1],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing[3],
  },
  gridCell: {
    width: '15.2%',
    paddingVertical: Spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.elevated,
  },
  gridCellSelected: {
    backgroundColor: Colors.brand.primary,
  },
  gridCellText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
  },
  gridCellTextSelected: {
    color: '#FFFFFF',
    fontWeight: Typography.weight.bold,
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
