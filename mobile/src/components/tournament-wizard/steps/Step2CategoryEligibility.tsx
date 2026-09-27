/**
 * Aught2 Pickleball — Step 2: Category & Eligibility
 *
 * Collects:
 * - Category (Singles, Men's Doubles, Women's Doubles, Mixed Doubles)
 * - Skill Level (2.5, 3.0, 3.5, 4.0, 4.5, 5.0)
 * - Age Restriction (Manual inputs for Minimum Age & Maximum Age)
 * - Gender Eligibility (Any, Male, Female)
 * - Dynamic Participant Limits (Singles = Players, Doubles = Teams & Players)
 * - Visibility (Public vs Private)
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Input } from '@/components/Input';
import { Colors, Radius, Spacing } from '@/theme';
import type { TournamentVisibility } from '@/types';
import {
  calculateCapacity,
  formatAgeRestriction,
} from '@/utils/tournamentCapacity';
import {
  CATEGORY_OPTIONS,
  GENDER_CATEGORY_OPTIONS,
  SKILL_LEVEL_OPTIONS,
  type TournamentWizardState,
} from '../types';

interface Step2CategoryEligibilityProps {
  state: TournamentWizardState;
  onChange: (patch: Partial<TournamentWizardState>) => void;
  errors?: Record<string, string>;
}

export function Step2CategoryEligibility({
  state,
  onChange,
  errors,
}: Step2CategoryEligibilityProps) {
  const cap = calculateCapacity(state.category, state.maxParticipants);
  const ageDisplay = formatAgeRestriction(state.minAge, state.maxAge);

  return (
    <View style={styles.container}>
      {/* Category */}
      <View style={styles.fieldSection}>
        <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
          COMPETITION CATEGORY
        </AppText>
        <View style={styles.chipsWrap}>
          {CATEGORY_OPTIONS.map((cat) => {
            const isSelected = state.category === cat;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => onChange({ category: cat })}
                style={[styles.chip, isSelected && styles.chipActive]}
                activeOpacity={0.7}
              >
                <AppText
                  variant="caption"
                  style={[styles.chipText, isSelected && styles.chipTextActive]}
                >
                  {cat}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Skill Level */}
      <View style={styles.fieldSection}>
        <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
          SKILL LEVEL
        </AppText>
        <View style={styles.chipsWrap}>
          {SKILL_LEVEL_OPTIONS.map((lvl) => {
            const isSelected = state.skillLevel === lvl;
            return (
              <TouchableOpacity
                key={lvl}
                onPress={() => onChange({ skillLevel: lvl })}
                style={[styles.chip, isSelected && styles.chipActive]}
                activeOpacity={0.7}
              >
                <AppText
                  variant="caption"
                  style={[styles.chipText, isSelected && styles.chipTextActive]}
                >
                  {lvl}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Manual Age Restriction */}
      <View style={styles.fieldSection}>
        <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
          AGE RESTRICTION
        </AppText>
        <View style={styles.inputsRow}>
          <View style={styles.inputCol}>
            <Input
              label="Minimum Age"
              value={state.minAge}
              onChangeText={(minAge) =>
                onChange({ minAge: minAge.replace(/[^0-9]/g, '') })
              }
              keyboardType="number-pad"
              placeholder="e.g. 18"
              error={errors?.minAge}
              hint="Optional min"
            />
          </View>
          <View style={styles.inputCol}>
            <Input
              label="Maximum Age"
              value={state.maxAge}
              onChangeText={(maxAge) =>
                onChange({ maxAge: maxAge.replace(/[^0-9]/g, '') })
              }
              keyboardType="number-pad"
              placeholder="e.g. 50"
              error={errors?.maxAge}
              hint="Optional max"
            />
          </View>
        </View>
        <AppText variant="caption" color="tertiary" style={styles.helperText}>
          {ageDisplay === 'None'
            ? 'No age restrictions (empty means all ages welcome).'
            : `Restricted to players aged: ${ageDisplay}`}
        </AppText>
      </View>

      {/* Gender Eligibility */}
      <View style={styles.fieldSection}>
        <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
          GENDER ELIGIBILITY
        </AppText>
        <View style={styles.chipsWrap}>
          {GENDER_CATEGORY_OPTIONS.map((gen) => {
            const isSelected = state.genderCategory === gen;
            return (
              <TouchableOpacity
                key={gen}
                onPress={() => onChange({ genderCategory: gen })}
                style={[styles.chip, isSelected && styles.chipActive]}
                activeOpacity={0.7}
              >
                <AppText
                  variant="caption"
                  style={[styles.chipText, isSelected && styles.chipTextActive]}
                >
                  {gen}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Dynamic Participant / Team Limits */}
      <View style={styles.fieldSection}>
        <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
          {cap.isSingles ? 'PLAYER CAPACITY' : 'TEAM CAPACITY'}
        </AppText>
        <View style={styles.inputsRow}>
          <View style={styles.inputCol}>
            <Input
              label={cap.minInputLabel}
              value={state.minParticipants}
              onChangeText={(minParticipants) =>
                onChange({ minParticipants: minParticipants.replace(/[^0-9]/g, '') })
              }
              keyboardType="number-pad"
              error={errors?.minParticipants}
              hint="Min required (>= 2)"
            />
          </View>
          <View style={styles.inputCol}>
            <Input
              label={cap.inputLabel}
              value={state.maxParticipants}
              onChangeText={(maxParticipants) =>
                onChange({ maxParticipants: maxParticipants.replace(/[^0-9]/g, '') })
              }
              keyboardType="number-pad"
              error={errors?.maxParticipants}
              hint="Capacity cap"
            />
          </View>
        </View>

        {/* Dynamic Capacity Preview Banner */}
        <View style={styles.capacityBanner}>
          <AppText variant="caption" color="secondary">
            Configured:{' '}
            <AppText variant="caption" style={styles.highlightText}>
              {cap.helperText}
            </AppText>{' '}
            • <AppText variant="caption" color="tertiary">{cap.structureLabel}</AppText>
          </AppText>
        </View>
      </View>

      {/* Tournament Visibility */}
      <View style={styles.fieldSection}>
        <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
          DISCOVERABILITY & VISIBILITY
        </AppText>
        <View style={styles.chipsWrap}>
          {(['public', 'private'] as TournamentVisibility[]).map((v) => {
            const isSelected = state.visibility === v;
            return (
              <TouchableOpacity
                key={v}
                onPress={() => onChange({ visibility: v })}
                style={[styles.chip, isSelected && styles.chipActive]}
                activeOpacity={0.7}
              >
                <AppText
                  variant="caption"
                  style={[styles.chipText, isSelected && styles.chipTextActive]}
                >
                  {v === 'public' ? 'Public (All Players)' : 'Private (Members Only)'}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
        <AppText variant="caption" color="tertiary" style={styles.visibilityHint}>
          {state.visibility === 'public'
            ? 'Listed publicly for all club players to view and register.'
            : 'Restricted to invited participants and active members.'}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[4],
  },
  fieldSection: {
    gap: Spacing[1],
  },
  sectionLabel: {
    fontWeight: '600',
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: Spacing[1],
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    borderColor: '#2563EB',
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
  },
  chipText: {
    color: Colors.text.secondary,
    fontSize: 13,
  },
  chipTextActive: {
    color: '#60A5FA',
    fontWeight: '600',
  },
  inputsRow: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  inputCol: {
    flex: 1,
  },
  helperText: {
    marginTop: Spacing[1],
    fontSize: 12,
  },
  capacityBanner: {
    marginTop: Spacing[1],
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  highlightText: {
    color: '#60A5FA',
    fontWeight: '600',
  },
  visibilityHint: {
    marginTop: Spacing[1],
    fontSize: 12,
  },
});
