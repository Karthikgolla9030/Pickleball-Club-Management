/**
 * DatePickerInput — Reusable calendar date picker component.
 *
 * Provides:
 * - Native touchable input with Calendar icon
 * - Formatted date display (localized readable date or YYYY-MM-DD)
 * - Modal calendar with month/year navigation, quick year selection (essential for DOB), and min/max constraints
 * - Consistent styling matching FormField & Input design system
 * - Supports clearing optional dates
 */

import React, { useState, useMemo } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from 'react-native';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react-native';

import { Colors, Dimensions, Radius, Spacing, Typography } from '@/theme';

interface DatePickerInputProps {
  label?: string;
  value?: string | null; // YYYY-MM-DD
  onChange?: (date: string) => void;
  onChangeDate?: (date: string) => void;
  minDate?: string; // YYYY-MM-DD
  maxDate?: string; // YYYY-MM-DD
  placeholder?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  allowClear?: boolean;
  testID?: string;
  containerStyle?: ViewStyle;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function DatePickerInput({
  label,
  value,
  onChange,
  onChangeDate,
  minDate,
  maxDate,
  placeholder = 'Select date',
  error,
  hint,
  required,
  disabled = false,
  allowClear = true,
  testID,
  containerStyle,
}: DatePickerInputProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [viewMode, setViewMode] = useState<'calendar' | 'year'>('calendar');

  // Initialize view month based on value or today
  const [viewDate, setViewDate] = useState(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date();
  });

  const todayStr = useMemo(() => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  }, []);

  // Formatted display text
  const displayText = useMemo(() => {
    if (!value) return '';
    try {
      const [y, m, d] = value.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      return dateObj.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return value;
    }
  }, [value]);

  const displayLabel = label ? (required ? `${label} *` : label) : undefined;

  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();

  const goPrevMonth = () => {
    setViewDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const goNextMonth = () => {
    setViewDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();

  const calendarDays = useMemo(() => {
    const days: (string | null)[] = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const mStr = String(currentMonth + 1).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      days.push(`${currentYear}-${mStr}-${dStr}`);
    }
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 0; i < remaining; i++) {
      days.push(null);
    }
    return days;
  }, [currentYear, currentMonth, daysInMonth, firstDayOfWeek]);

  // Year choices for Year jumper
  const yearChoices = useMemo(() => {
    const minY = minDate ? parseInt(minDate.split('-')[0], 10) : 1920;
    const maxY = maxDate ? parseInt(maxDate.split('-')[0], 10) : new Date().getFullYear() + 10;
    const years: number[] = [];
    for (let y = maxY; y >= minY; y--) {
      years.push(y);
    }
    return years;
  }, [minDate, maxDate]);

  const triggerChange = (val: string) => {
    onChange?.(val);
    onChangeDate?.(val);
  };

  const handleSelectDate = (dateStr: string) => {
    triggerChange(dateStr);
    setModalVisible(false);
  };

  const handleClear = () => {
    triggerChange('');
    setModalVisible(false);
  };

  const handleSelectToday = () => {
    if ((minDate && todayStr < minDate) || (maxDate && todayStr > maxDate)) {
      return;
    }
    triggerChange(todayStr);
    setViewDate(new Date());
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
        onPress={() => {
          if (!disabled) {
            setViewMode('calendar');
            if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
              const [y, m, d] = value.split('-').map(Number);
              setViewDate(new Date(y, m - 1, d));
            }
            setModalVisible(true);
          }
        }}
        activeOpacity={0.7}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label || 'Select Date'}
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

      {/* Date Picker Modal */}
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
                    <Text style={styles.modalTitle}>{label || 'Select Date'}</Text>
                    {value ? (
                      <Text style={styles.modalSubtitle}>{displayText}</Text>
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

                {/* Calendar View vs Year Selector */}
                {viewMode === 'calendar' ? (
                  <>
                    {/* Month / Year Navigator */}
                    <View style={styles.navRow}>
                      <TouchableOpacity
                        onPress={goPrevMonth}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={styles.navArrow}
                      >
                        <ChevronLeft size={22} color={Colors.text.primary} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.monthYearBtn}
                        onPress={() => setViewMode('year')}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.monthYearText}>
                          {viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                        </Text>
                        <ChevronDown size={14} color={Colors.brand.primary} style={{ marginLeft: 4 }} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={goNextMonth}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={styles.navArrow}
                      >
                        <ChevronRight size={22} color={Colors.text.primary} />
                      </TouchableOpacity>
                    </View>

                    {/* Weekday Names */}
                    <View style={styles.weekdaysRow}>
                      {WEEKDAYS.map((day) => (
                        <View key={day} style={styles.dayCol}>
                          <Text style={styles.weekdayText}>{day}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Days Grid */}
                    <View style={styles.daysGrid}>
                      {calendarDays.map((dateStr, idx) => {
                        if (!dateStr) {
                          return <View key={`empty-${idx}`} style={styles.dayCol} />;
                        }

                        const isSelected = dateStr === value;
                        const isToday = dateStr === todayStr;
                        let isDisabled = false;
                        if (minDate && dateStr < minDate) isDisabled = true;
                        if (maxDate && dateStr > maxDate) isDisabled = true;

                        const dayNum = parseInt(dateStr.split('-')[2], 10);

                        return (
                          <TouchableOpacity
                            key={dateStr}
                            style={styles.dayCol}
                            onPress={() => !isDisabled && handleSelectDate(dateStr)}
                            disabled={isDisabled}
                            activeOpacity={0.7}
                          >
                            <View
                              style={[
                                styles.dayCircle,
                                isSelected && styles.dayCircleSelected,
                                isToday && !isSelected && styles.dayCircleToday,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.dayText,
                                  isSelected && styles.dayTextSelected,
                                  isToday && !isSelected && styles.dayTextToday,
                                  isDisabled && styles.dayTextDisabled,
                                ]}
                              >
                                {dayNum}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                ) : (
                  /* Year Picker Grid */
                  <View style={styles.yearPickerContainer}>
                    <View style={styles.yearHeader}>
                      <Text style={styles.yearHeaderTitle}>Select Year</Text>
                      <TouchableOpacity
                        onPress={() => setViewMode('calendar')}
                        style={styles.backToCalBtn}
                      >
                        <Text style={styles.backToCalText}>Back to Calendar</Text>
                      </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.yearList} showsVerticalScrollIndicator>
                      <View style={styles.yearGrid}>
                        {yearChoices.map((yr) => {
                          const isCurrent = yr === currentYear;
                          return (
                            <TouchableOpacity
                              key={yr}
                              style={[styles.yearCell, isCurrent && styles.yearCellSelected]}
                              onPress={() => {
                                setViewDate(new Date(yr, currentMonth, 1));
                                setViewMode('calendar');
                              }}
                            >
                              <Text style={[styles.yearText, isCurrent && styles.yearTextSelected]}>
                                {yr}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                )}

                {/* Modal Action Buttons */}
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
                    style={styles.actionBtnSecondary}
                    onPress={handleSelectToday}
                  >
                    <Text style={styles.actionBtnSecondaryText}>Today</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtnPrimary}
                    onPress={() => setModalVisible(false)}
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
  modalSubtitle: {
    fontSize: Typography.size.xs,
    color: Colors.brand.primary,
    fontWeight: Typography.weight.semibold,
    marginTop: 2,
  },
  closeBtn: {
    padding: Spacing[1],
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing[2],
    marginBottom: Spacing[2],
  },
  navArrow: {
    padding: Spacing[2],
  },
  monthYearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1.5],
    borderRadius: Radius.full,
    backgroundColor: Colors.surface.elevated,
  },
  monthYearText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  weekdaysRow: {
    flexDirection: 'row',
    marginBottom: Spacing[1],
  },
  dayCol: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: Typography.weight.medium,
    color: Colors.text.tertiary,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleSelected: {
    backgroundColor: Colors.brand.primary,
  },
  dayCircleToday: {
    borderWidth: 1.5,
    borderColor: Colors.brand.primary,
  },
  dayText: {
    fontSize: Typography.size.sm,
    color: Colors.text.primary,
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: Typography.weight.bold,
  },
  dayTextToday: {
    color: Colors.brand.primary,
    fontWeight: Typography.weight.bold,
  },
  dayTextDisabled: {
    color: Colors.text.tertiary,
    opacity: 0.35,
  },

  // Year Picker
  yearPickerContainer: {
    height: 260,
  },
  yearHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[2],
  },
  yearHeaderTitle: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: Colors.text.secondary,
  },
  backToCalBtn: {
    padding: Spacing[1],
  },
  backToCalText: {
    fontSize: Typography.size.xs,
    color: Colors.brand.primary,
    fontWeight: Typography.weight.semibold,
  },
  yearList: {
    flex: 1,
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  yearCell: {
    width: '22%',
    paddingVertical: Spacing[2],
    alignItems: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.elevated,
  },
  yearCellSelected: {
    backgroundColor: Colors.brand.primary,
  },
  yearText: {
    fontSize: Typography.size.sm,
    color: Colors.text.primary,
  },
  yearTextSelected: {
    color: '#FFFFFF',
    fontWeight: Typography.weight.bold,
  },

  // Modal Actions
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing[2],
    marginTop: Spacing[4],
    paddingTop: Spacing[2],
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
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    backgroundColor: Colors.brand.primary,
  },
  actionBtnPrimaryText: {
    fontSize: Typography.size.sm,
    color: '#FFFFFF',
    fontWeight: Typography.weight.bold,
  },
});
