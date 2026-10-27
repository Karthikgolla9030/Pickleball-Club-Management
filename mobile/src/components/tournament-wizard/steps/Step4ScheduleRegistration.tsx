/**
 * Aught2 Pickleball — Step 4: Schedule & Registration
 *
 * Collects:
 * - Tournament Dates (Start Date to End Date)
 * - Start Time & End Time
 * - Check-in Time
 * - Entry Fee ($)
 * - Registration Opens & Registration Deadline dates
 * - Registration Method (Both / Player App / Staff)
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { DatePickerInput } from '@/components/DatePickerInput';
import { Input } from '@/components/Input';
import { TimePickerInput } from '@/components/TimePickerInput';
import { Colors, Radius, Spacing } from '@/theme';
import {
  REGISTRATION_METHOD_OPTIONS,
  type TournamentWizardState,
} from '../types';

interface Step4ScheduleRegistrationProps {
  state: TournamentWizardState;
  onChange: (patch: Partial<TournamentWizardState>) => void;
  errors?: Record<string, string>;
}

export function Step4ScheduleRegistration({
  state,
  onChange,
  errors,
}: Step4ScheduleRegistrationProps) {
  return (
    <View style={styles.container}>
      {/* Tournament Dates */}
      <View style={styles.section}>
        <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
          TOURNAMENT DATES *
        </AppText>
        <View style={styles.row}>
          <View style={styles.col}>
            <DatePickerInput
              label="Start Date"
              required
              placeholder="Select start date"
              value={state.startDate}
              onChangeDate={(startDate) => onChange({ startDate })}
              maxDate={state.endDate || undefined}
              error={errors?.startDate}
            />
          </View>
          <View style={styles.col}>
            <DatePickerInput
              label="End Date"
              required
              placeholder="Select end date"
              value={state.endDate}
              onChangeDate={(endDate) => onChange({ endDate })}
              minDate={state.startDate || undefined}
              error={errors?.endDate}
            />
          </View>
        </View>
      </View>

      {/* Daily Times */}
      <View style={styles.section}>
        <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
          MATCH SCHEDULE & CHECK-IN TIMES
        </AppText>
        <View style={styles.row}>
          <View style={styles.col}>
            <TimePickerInput
              label="Start Time"
              value={state.startTime}
              onChangeTime={(startTime) => onChange({ startTime })}
              includeSeconds={false}
              error={errors?.startTime}
              placeholder="08:00"
            />
          </View>
          <View style={styles.col}>
            <TimePickerInput
              label="End Time"
              value={state.endTime}
              onChangeTime={(endTime) => onChange({ endTime })}
              includeSeconds={false}
              error={errors?.endTime}
              placeholder="18:00"
            />
          </View>
        </View>

        <View style={styles.singleField}>
          <TimePickerInput
            label="Check-in Time"
            value={state.checkInTime}
            onChangeTime={(checkInTime) => onChange({ checkInTime })}
            includeSeconds={false}
            placeholder="07:30"
            hint="Players must report by this time"
          />
        </View>
      </View>

      {/* Entry Fee */}
      <View style={styles.section}>
        <Input
          label="Entry Fee ($ per player)"
          placeholder="e.g. 65 (leave 0 for free event)"
          value={state.entryFee}
          onChangeText={(entryFee) => onChange({ entryFee })}
          keyboardType="numeric"
          error={errors?.entryFee}
          hint="Entry fee per registered participant"
        />
      </View>

      {/* Registration Window */}
      <View style={styles.section}>
        <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
          REGISTRATION WINDOW *
        </AppText>
        <View style={styles.row}>
          <View style={styles.col}>
            <DatePickerInput
              label="Registration Opens"
              required
              placeholder="Select open date"
              value={state.regOpenDate}
              onChangeDate={(regOpenDate) => onChange({ regOpenDate })}
              maxDate={state.regCloseDate || state.startDate || undefined}
              error={errors?.regOpenDate}
            />
          </View>
          <View style={styles.col}>
            <DatePickerInput
              label="Registration Deadline"
              required
              placeholder="Select deadline"
              value={state.regCloseDate}
              onChangeDate={(regCloseDate) => onChange({ regCloseDate })}
              minDate={state.regOpenDate || undefined}
              maxDate={state.startDate || undefined}
              error={errors?.regCloseDate}
            />
          </View>
        </View>
      </View>

      {/* Registration Method */}
      <View style={styles.section}>
        <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
          REGISTRATION METHOD
        </AppText>
        <View style={styles.chipsWrap}>
          {REGISTRATION_METHOD_OPTIONS.map((method) => (
            <TouchableOpacity
              key={method}
              onPress={() => onChange({ regMethod: method })}
              style={[
                styles.chip,
                state.regMethod === method && styles.chipActive,
              ]}
            >
              <AppText
                variant="caption"
                style={[
                  styles.chipText,
                  state.regMethod === method && styles.chipTextActive,
                ]}
              >
                {method}
              </AppText>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[3],
  },
  section: {
    gap: Spacing[2],
  },
  sectionLabel: {
    fontWeight: '600',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  row: {
    gap: Spacing[3],
  },
  col: {
    width: '100%',
  },
  singleField: {
    marginTop: Spacing[2],
  },
  chipsWrap: {
    flexDirection: 'column',
    gap: Spacing[2],
  },
  chip: {
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.elevated,
  },
  chipActive: {
    borderColor: Colors.brand.primary,
    backgroundColor: '#E7F5EC',
  },
  chipText: {
    color: Colors.text.secondary,
    fontSize: 13,
  },
  chipTextActive: {
    color: Colors.brand.primary,
    fontWeight: '600',
  },
});
