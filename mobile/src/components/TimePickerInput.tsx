/**
 * TimePickerInput — Reusable canonical time picker component.
 *
 * Provides:
 * - Native touchable input with Clock icon and 12h formatted display
 * - Clear button for 1-tap reset
 * - Responsive modal selector supporting hours (1..12), minutes (:00, :15, :30, :45, etc.), and AM/PM
 * - Single-tap quick presets for common operating hours (6 AM, 7 AM, 8 AM, 5 PM, 9 PM, 10 PM)
 * - Emits canonical 24-hour "HH:mm" by default (e.g. "06:00", "22:00")
 * - Backwards-compatible with 3-part time strings ("06:00:00") and 12-hour strings ("06:00 AM")
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
import { Clock, ChevronDown, X, Check } from 'lucide-react-native';

import { Colors, Dimensions, Radius, Spacing, Typography } from '@/theme';
import { parseTimeString, toCanonicalTime, toCanonicalTimeWithSec } from '@/utils/timeUtils';

export interface TimePickerInputProps {
  label?: string;
  value?: string | null; // Canonical "HH:mm", legacy "HH:mm:ss", or "hh:mm A"
  onChange?: (timeStr: string) => void;
  onChangeTime?: (timeStr: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  allowClear?: boolean;
  includeSeconds?: boolean; // Defaults to false (outputs "HH:mm")
  testID?: string;
  containerStyle?: ViewStyle;
}

const HOURS_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const PRIMARY_MINUTES = ['00', '15', '30', '45'];
const SECONDARY_MINUTES = ['05', '10', '20', '25', '35', '40', '50', '55'];

const AM_PRESETS = [
  { label: '6:00 AM', hour: 6, min: '00', period: 'AM' as const },
  { label: '7:00 AM', hour: 7, min: '00', period: 'AM' as const },
  { label: '8:00 AM', hour: 8, min: '00', period: 'AM' as const },
  { label: '9:00 AM', hour: 9, min: '00', period: 'AM' as const },
];

const PM_PRESETS = [
  { label: '5:00 PM', hour: 5, min: '00', period: 'PM' as const },
  { label: '8:00 PM', hour: 8, min: '00', period: 'PM' as const },
  { label: '9:00 PM', hour: 9, min: '00', period: 'PM' as const },
  { label: '10:00 PM', hour: 10, min: '00', period: 'PM' as const },
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
  includeSeconds = false,
  testID,
  containerStyle,
}: TimePickerInputProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [showAllMinutes, setShowAllMinutes] = useState(false);

  // Parse existing value using robust shared time utility
  const parsedValue = useMemo(() => {
    return parseTimeString(value);
  }, [value]);

  // Modal working state
  const [selectedHour, setSelectedHour] = useState<number>(parsedValue ? parsedValue.hour12 : 6);
  const [selectedMinute, setSelectedMinute] = useState<string>(
    parsedValue ? String(parsedValue.minute).padStart(2, '0') : '00'
  );
  const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>(
    parsedValue ? parsedValue.period : 'AM'
  );

  // Keep internal state in sync whenever modal opens or value changes
  useEffect(() => {
    if (parsedValue) {
      setSelectedHour(parsedValue.hour12);
      setSelectedMinute(String(parsedValue.minute).padStart(2, '0'));
      setSelectedPeriod(parsedValue.period);
    }
  }, [parsedValue, modalVisible]);

  const handleOpen = () => {
    if (disabled) return;
    if (parsedValue) {
      setSelectedHour(parsedValue.hour12);
      setSelectedMinute(String(parsedValue.minute).padStart(2, '0'));
      setSelectedPeriod(parsedValue.period);
    } else {
      setSelectedHour(6);
      setSelectedMinute('00');
      setSelectedPeriod('AM');
    }
    setShowAllMinutes(false);
    setModalVisible(true);
  };

  // Formatted display text on the main input row (12-hour: "06:00 AM")
  const displayText = useMemo(() => {
    if (!parsedValue) return '';
    return parsedValue.str12;
  }, [parsedValue]);

  // Real-time preview inside the modal
  const previewText = useMemo(() => {
    const hStr = String(selectedHour).padStart(2, '0');
    return `${hStr}:${selectedMinute} ${selectedPeriod}`;
  }, [selectedHour, selectedMinute, selectedPeriod]);

  const displayLabel = label ? (required ? `${label} *` : label) : undefined;

  const triggerChange = (canonicalTimeStr: string) => {
    onChange?.(canonicalTimeStr);
    onChangeTime?.(canonicalTimeStr);
  };

  const handleConfirm = () => {
    let h24 = selectedHour % 12;
    if (selectedPeriod === 'PM') h24 += 12;
    const hStr = String(h24).padStart(2, '0');
    const mStr = String(selectedMinute).padStart(2, '0');
    const canonical = includeSeconds ? `${hStr}:${mStr}:00` : `${hStr}:${mStr}`;
    triggerChange(canonical);
    setModalVisible(false);
  };

  const handleClear = () => {
    triggerChange('');
    setModalVisible(false);
  };

  const handleApplyPreset = (preset: { hour: number; min: string; period: 'AM' | 'PM' }) => {
    setSelectedHour(preset.hour);
    setSelectedMinute(preset.min);
    setSelectedPeriod(preset.period);
  };

  const activePresets = selectedPeriod === 'AM' ? AM_PRESETS : PM_PRESETS;

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
        <Clock
          size={18}
          color={parsedValue ? Colors.brand.primary : Colors.text.tertiary}
          style={styles.leadingIcon}
        />

        <Text style={[styles.valueText, !parsedValue && styles.placeholderText]}>
          {displayText || placeholder}
        </Text>

        {parsedValue && allowClear && !disabled ? (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={handleClear}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Clear time"
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
                    <View style={styles.previewContainer}>
                      <Text style={styles.previewText}>{previewText}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.closeBtn}
                    onPress={() => setModalVisible(false)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="Close picker"
                  >
                    <X size={20} color={Colors.text.primary} />
                  </TouchableOpacity>
                </View>

                {/* AM / PM Segmented Control */}
                <View style={styles.periodToggleRow}>
                  <TouchableOpacity
                    style={[styles.periodBtn, selectedPeriod === 'AM' && styles.periodBtnActive]}
                    onPress={() => setSelectedPeriod('AM')}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.periodBtnText,
                        selectedPeriod === 'AM' && styles.periodBtnTextActive,
                      ]}
                    >
                      AM (Morning)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.periodBtn, selectedPeriod === 'PM' && styles.periodBtnActive]}
                    onPress={() => setSelectedPeriod('PM')}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.periodBtnText,
                        selectedPeriod === 'PM' && styles.periodBtnTextActive,
                      ]}
                    >
                      PM (Afternoon / Evening)
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Quick Presets Bar */}
                <View style={styles.presetsRow}>
                  {activePresets.map((preset) => {
                    const isPresetSelected =
                      selectedHour === preset.hour &&
                      selectedMinute === preset.min &&
                      selectedPeriod === preset.period;
                    return (
                      <TouchableOpacity
                        key={preset.label}
                        style={[
                          styles.presetChip,
                          isPresetSelected && styles.presetChipActive,
                        ]}
                        onPress={() => handleApplyPreset(preset)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.presetChipText,
                            isPresetSelected && styles.presetChipTextActive,
                          ]}
                        >
                          {preset.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Hours Grid (1 to 12 in natural order) */}
                <Text style={styles.sectionLabel}>HOUR</Text>
                <View style={styles.hourGrid}>
                  {HOURS_12.map((hr) => {
                    const isSelected = hr === selectedHour;
                    return (
                      <TouchableOpacity
                        key={hr}
                        style={[styles.hourCell, isSelected && styles.hourCellSelected]}
                        onPress={() => setSelectedHour(hr)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.hourCellText, isSelected && styles.hourCellTextSelected]}>
                          {hr}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Minutes Selector */}
                <View style={styles.minuteHeaderRow}>
                  <Text style={styles.sectionLabel}>MINUTE</Text>
                  <TouchableOpacity
                    onPress={() => setShowAllMinutes((prev) => !prev)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.toggleMinutesText}>
                      {showAllMinutes ? 'Standard (:00, :15, :30, :45)' : 'Show all 5m intervals'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Primary Minutes (:00, :15, :30, :45) */}
                <View style={styles.primaryMinuteRow}>
                  {PRIMARY_MINUTES.map((min) => {
                    const isSelected = min === selectedMinute;
                    return (
                      <TouchableOpacity
                        key={min}
                        style={[
                          styles.primaryMinuteCell,
                          isSelected && styles.primaryMinuteCellSelected,
                        ]}
                        onPress={() => setSelectedMinute(min)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.primaryMinuteText,
                            isSelected && styles.primaryMinuteTextSelected,
                          ]}
                        >
                          :{min}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Secondary Minutes Grid (if toggled) */}
                {showAllMinutes && (
                  <View style={styles.secondaryMinuteGrid}>
                    {SECONDARY_MINUTES.map((min) => {
                      const isSelected = min === selectedMinute;
                      return (
                        <TouchableOpacity
                          key={min}
                          style={[
                            styles.secondaryMinuteCell,
                            isSelected && styles.secondaryMinuteCellSelected,
                          ]}
                          onPress={() => setSelectedMinute(min)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.secondaryMinuteText,
                              isSelected && styles.secondaryMinuteTextSelected,
                            ]}
                          >
                            :{min}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* Modal Actions */}
                <View style={styles.modalActions}>
                  <View style={styles.leftActions}>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => setModalVisible(false)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    {allowClear && (
                      <TouchableOpacity
                        style={styles.clearModalBtn}
                        onPress={handleClear}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.clearModalBtnText}>Clear</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <TouchableOpacity
                    style={styles.confirmBtn}
                    onPress={handleConfirm}
                    activeOpacity={0.8}
                  >
                    <Check size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                    <Text style={styles.confirmBtnText}>Confirm Time</Text>
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
    fontWeight: Typography.weight.medium,
  },
  placeholderText: {
    color: Colors.text.tertiary,
    fontWeight: Typography.weight.regular,
  },
  clearBtn: {
    padding: Spacing[1],
  },
  errorText: {
    fontSize: Typography.size.xs,
    color: Colors.status.error,
    marginTop: 2,
  },
  hintText: {
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
    marginTop: 2,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[4],
  },
  modalContent: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: Spacing[4],
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing[3],
  },
  modalTitle: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.secondary,
  },
  previewContainer: {
    marginTop: 4,
  },
  previewText: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.brand.primary,
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: Spacing[1.5],
    borderRadius: Radius.full,
    backgroundColor: '#F3F4F6',
  },
  periodToggleRow: {
    flexDirection: 'row',
    gap: Spacing[2],
    marginBottom: Spacing[2.5],
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: Radius.lg,
    backgroundColor: '#F3F4F6',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  periodBtnActive: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  periodBtnText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
    color: Colors.text.secondary,
  },
  periodBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: Typography.weight.bold,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: Spacing[3],
  },
  presetChip: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: Radius.md,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  presetChipActive: {
    backgroundColor: '#E6F4EA',
    borderColor: Colors.brand.primary,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.secondary,
  },
  presetChipTextActive: {
    color: Colors.brand.primary,
    fontWeight: Typography.weight.bold,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: Typography.weight.bold,
    color: Colors.text.tertiary,
    letterSpacing: 0.5,
    marginBottom: Spacing[1.5],
  },
  hourGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: Spacing[3],
  },
  hourCell: {
    width: '22.8%',
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  hourCellSelected: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  hourCellText: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
  },
  hourCellTextSelected: {
    color: '#FFFFFF',
    fontWeight: Typography.weight.bold,
  },
  minuteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[1.5],
  },
  toggleMinutesText: {
    fontSize: 11,
    fontWeight: Typography.weight.medium,
    color: Colors.brand.primary,
  },
  primaryMinuteRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing[2],
  },
  primaryMinuteCell: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  primaryMinuteCellSelected: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  primaryMinuteText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
  },
  primaryMinuteTextSelected: {
    color: '#FFFFFF',
    fontWeight: Typography.weight.bold,
  },
  secondaryMinuteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing[2],
  },
  secondaryMinuteCell: {
    width: '23%',
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  secondaryMinuteCellSelected: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  secondaryMinuteText: {
    fontSize: 12,
    fontWeight: Typography.weight.medium,
    color: Colors.text.secondary,
  },
  secondaryMinuteTextSelected: {
    color: '#FFFFFF',
    fontWeight: Typography.weight.bold,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing[2],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  leftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  cancelBtn: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
  },
  cancelBtnText: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    fontWeight: Typography.weight.medium,
  },
  clearModalBtn: {
    paddingHorizontal: Spacing[2.5],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
  },
  clearModalBtnText: {
    fontSize: Typography.size.sm,
    color: Colors.status.error,
    fontWeight: Typography.weight.medium,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2.5],
    borderRadius: Radius.lg,
    backgroundColor: Colors.brand.primary,
  },
  confirmBtnText: {
    fontSize: Typography.size.sm,
    color: '#FFFFFF',
    fontWeight: Typography.weight.bold,
  },
});
