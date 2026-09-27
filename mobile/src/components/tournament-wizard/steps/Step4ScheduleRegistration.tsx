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
import { Input } from '@/components/Input';
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
            <Input
              label="Start Date *"
              placeholder="YYYY-MM-DD"
              value={state.startDate}
              onChangeText={(startDate) => onChange({ startDate })}
              error={errors?.startDate}
              hint="Format: YYYY-MM-DD"
            />
          </View>
          <View style={styles.col}>
            <Input
              label="End Date *"
              placeholder="YYYY-MM-DD"
              value={state.endDate}
              onChangeText={(endDate) => onChange({ endDate })}
              error={errors?.endDate}
              hint="Format: YYYY-MM-DD"
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
            <Input
              label="Start Time"
              placeholder="08:00"
              value={state.startTime}
              onChangeText={(startTime) => onChange({ startTime })}
              error={errors?.startTime}
              hint="24h time: HH:mm"
            />
          </View>
          <View style={styles.col}>
            <Input
              label="End Time"
              placeholder="18:00"
              value={state.endTime}
              onChangeText={(endTime) => onChange({ endTime })}
              error={errors?.endTime}
              hint="24h time: HH:mm"
            />
          </View>
        </View>

        <View style={styles.singleField}>
          <Input
            label="Check-in Time"
            placeholder="07:30"
            value={state.checkInTime}
            onChangeText={(checkInTime) => onChange({ checkInTime })}
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
            <Input
              label="Registration Opens *"
              placeholder="YYYY-MM-DD"
              value={state.regOpenDate}
              onChangeText={(regOpenDate) => onChange({ regOpenDate })}
              error={errors?.regOpenDate}
              hint="When signups begin"
            />
          </View>
          <View style={styles.col}>
            <Input
              label="Registration Deadline *"
              placeholder="YYYY-MM-DD"
              value={state.regCloseDate}
              onChangeText={(regCloseDate) => onChange({ regCloseDate })}
              error={errors?.regCloseDate}
              hint="Cutoff date"
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
