import React, { useState, useMemo } from 'react';
import { StyleSheet, View, TouchableOpacity, useWindowDimensions } from 'react-native';
import { AppText } from './AppText';
import { Colors, Radius, Spacing, Typography } from '@/theme';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';

interface DateCalendarProps {
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  minDate?: string; // YYYY-MM-DD
  maxDate?: string; // YYYY-MM-DD
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function DateCalendar({
  selectedDate,
  onSelectDate,
  minDate,
  maxDate,
}: DateCalendarProps) {
  const { width } = useWindowDimensions();
  // We want to ensure no horizontal overflow. Max width constraints can help.
  const containerMaxWidth = Math.min(width - Spacing[4] * 2, 400); 

  // Initialize current month view to the selected date's month, or today if invalid
  const initialDate = selectedDate ? new Date(selectedDate) : new Date();
  const [currentMonth, setCurrentMonth] = useState(
    new Date(initialDate.getFullYear(), initialDate.getMonth(), 1)
  );

  const todayStr = new Date().toISOString().split('T')[0];

  const goPrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();

  const days = useMemo(() => {
    const dates = [];
    // Pad previous month days
    for (let i = 0; i < firstDayOfWeek; i++) {
      dates.push(null);
    }
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i);
      // Adjust timezone offset to get correct YYYY-MM-DD locally
      const offset = d.getTimezoneOffset() * 60000;
      const localISOTime = new Date(d.getTime() - offset).toISOString().split('T')[0];
      dates.push(localISOTime);
    }
    // Pad next month days to complete rows (7 cols)
    const remaining = (7 - (dates.length % 7)) % 7;
    for (let i = 0; i < remaining; i++) {
      dates.push(null);
    }
    return dates;
  }, [currentMonth, daysInMonth, firstDayOfWeek]);

  const monthYearStr = currentMonth.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <View style={[styles.container, { maxWidth: containerMaxWidth }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goPrevMonth} hitSlop={12} style={styles.navButton}>
          <ChevronLeft size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <AppText variant="heading3" style={styles.monthYear}>
          {monthYearStr}
        </AppText>
        <TouchableOpacity onPress={goNextMonth} hitSlop={12} style={styles.navButton}>
          <ChevronRight size={24} color={Colors.text.primary} />
        </TouchableOpacity>
      </View>

      {/* Weekdays */}
      <View style={styles.weekdaysRow}>
        {WEEKDAYS.map((day, idx) => (
          <View key={idx} style={styles.dayCell}>
            <AppText variant="caption" style={styles.weekdayText}>
              {day}
            </AppText>
          </View>
        ))}
      </View>

      {/* Dates Grid */}
      <View style={styles.datesGrid}>
        {days.map((dateStr, idx) => {
          if (!dateStr) {
            return <View key={`empty-${idx}`} style={styles.dayCell} />;
          }

          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === todayStr;

          let isDisabled = false;
          if (minDate && dateStr < minDate) isDisabled = true;
          if (maxDate && dateStr > maxDate) isDisabled = true;

          return (
            <TouchableOpacity
              key={dateStr}
              style={styles.dayCell}
              onPress={() => {
                if (!isDisabled) onSelectDate(dateStr);
              }}
              disabled={isDisabled}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled: isDisabled }}
            >
              <View style={[
                styles.dateCircle,
                isSelected && styles.dateCircleSelected,
              ]}>
                <AppText
                  style={[
                    styles.dateText,
                    isSelected && styles.dateTextSelected,
                    isToday && !isSelected && styles.dateTextToday,
                    isDisabled && styles.dateTextDisabled,
                  ]}
                >
                  {parseInt(dateStr.split('-')[2], 10)}
                </AppText>
              </View>
              {isToday && !isSelected && <View style={styles.todayIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignSelf: 'center',
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[4],
  },
  monthYear: {
    color: Colors.text.primary,
  },
  navButton: {
    padding: Spacing[1],
  },
  weekdaysRow: {
    flexDirection: 'row',
    marginBottom: Spacing[2],
  },
  weekdayText: {
    color: Colors.text.tertiary,
    textAlign: 'center',
    fontSize: 13,
  },
  datesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%', // 100% / 7
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCircleSelected: {
    backgroundColor: Colors.brand.primary,
  },
  dateText: {
    fontSize: Typography.size.sm,
    color: Colors.text.primary,
  },
  dateTextSelected: {
    color: Colors.background.primary,
    fontWeight: Typography.weight.bold,
  },
  dateTextToday: {
    color: Colors.brand.primary,
    fontWeight: Typography.weight.bold,
  },
  dateTextDisabled: {
    color: Colors.text.tertiary,
    opacity: 0.5,
  },
  todayIndicator: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.brand.primary,
  },
});
