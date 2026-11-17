/**
 * Aught2 Pickleball — Step 3: Category & Eligibility
 *
 * Configures category, skill level, age restrictions, gender eligibility,
 * and participant capacity according to the format selected in Step 2.
 *
 * Format-Dependent Behavior:
 * - Scramble: ALWAYS individual player registration ("Minimum Players" & "Maximum Players", min 4).
 *   Does not require fixed teams regardless of whether Singles or Doubles category is chosen.
 * - Singles: Individual player registration ("Min Players" & "Number of Players").
 * - Doubles (Bracket/Pool/RoundRobin): Fixed team registration ("Min Teams" & "Number of Teams").
 */

import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { ChevronDown, Info, UserCheck, Users } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Input } from '@/components/Input';
import { Colors, Radius, Spacing } from '@/theme';
import type { TournamentVisibility } from '@/types';
import {
  calculateCapacity,
  formatAgeRestriction,
  getRegistrationType,
} from '@/utils/tournamentCapacity';
import {
  CATEGORY_OPTIONS,
  GENDER_CATEGORY_OPTIONS,
  SCRAMBLE_DIVISION_DESCRIPTIONS,
  SCRAMBLE_DIVISION_OPTIONS,
  SKILL_LEVEL_OPTIONS,
  type ScrambleDivision,
  type TournamentWizardState,
} from '../types';

interface Step3CategoryEligibilityProps {
  state: TournamentWizardState;
  onChange: (patch: Partial<TournamentWizardState>) => void;
  errors?: Record<string, string>;
}

export function Step3CategoryEligibility({
  state,
  onChange,
  errors,
}: Step3CategoryEligibilityProps) {
  const { width: screenWidth } = useWindowDimensions();
  const isNarrowScreen = screenWidth < 360;

  const isScramble = state.format === 'scramble';
  const cap = calculateCapacity(state.category, state.maxParticipants, state.format);
  const regType = getRegistrationType(state.format, state.category);
  const ageDisplay = formatAgeRestriction(state.minAge, state.maxAge);

  const [isMinPickerOpen, setIsMinPickerOpen] = useState(false);
  const [isMaxPickerOpen, setIsMaxPickerOpen] = useState(false);

  const handleCategoryChange = (cat: string) => {
    const patch: Partial<TournamentWizardState> = { category: cat };
    if (cat === "Men's Doubles") {
      patch.genderCategory = 'Male';
    } else if (cat === "Women's Doubles") {
      patch.genderCategory = 'Female';
    } else if (cat === 'Mixed Doubles') {
      patch.genderCategory = 'Mixed';
    } else if (cat === 'Singles') {
      if (state.genderCategory !== 'Male' && state.genderCategory !== 'Female') {
        patch.genderCategory = 'Male';
      }
    }
    onChange(patch);
  };

  useEffect(() => {
    if (state.category === "Men's Doubles" && state.genderCategory !== 'Male') {
      onChange({ genderCategory: 'Male' });
    } else if (state.category === "Women's Doubles" && state.genderCategory !== 'Female') {
      onChange({ genderCategory: 'Female' });
    } else if (state.category === 'Mixed Doubles' && state.genderCategory !== 'Mixed') {
      onChange({ genderCategory: 'Mixed' });
    } else if (state.category === 'Singles' && state.genderCategory !== 'Male' && state.genderCategory !== 'Female') {
      onChange({ genderCategory: 'Male' });
    }
  }, [state.category, state.genderCategory, onChange]);

  const handleDivisionChange = (div: ScrambleDivision) => {
    const patch: Partial<TournamentWizardState> = { category: div };
    if (div === "Men's Scramble") {
      patch.genderCategory = 'Male';
    } else if (div === "Women's Scramble") {
      patch.genderCategory = 'Female';
    } else {
      patch.genderCategory = 'Any';
    }
    onChange(patch);
  };

  const handleModeChange = (mode: 'single' | 'range') => {
    if (mode === 'single') {
      const selectedSkill = state.skillLevel || state.minSkillLevel || '3.5';
      onChange({
        skillLevelMode: 'single',
        skillLevel: selectedSkill,
        minSkillLevel: selectedSkill,
        maxSkillLevel: selectedSkill,
      });
    } else {
      const min = state.minSkillLevel || state.skillLevel || '3.5';
      let max = state.maxSkillLevel || '4.5';
      if (parseFloat(max) < parseFloat(min)) {
        max = min === '5.0' ? '5.0' : (parseFloat(min) + 0.5 <= 5.0 ? (parseFloat(min) + 0.5).toFixed(1) : min);
      }
      onChange({
        skillLevelMode: 'range',
        minSkillLevel: min,
        maxSkillLevel: max,
        skillLevel: `${min}-${max}`,
      });
    }
  };

  const handleMinSkillChange = (newMin: string) => {
    let currentMax = state.maxSkillLevel || '4.5';
    if (parseFloat(newMin) > parseFloat(currentMax)) {
      currentMax = newMin;
    }
    onChange({
      minSkillLevel: newMin,
      maxSkillLevel: currentMax,
      skillLevel: `${newMin}-${currentMax}`,
    });
  };

  const handleMaxSkillChange = (newMax: string) => {
    let currentMin = state.minSkillLevel || '3.5';
    if (parseFloat(newMax) < parseFloat(currentMin)) {
      currentMin = newMax;
    }
    onChange({
      minSkillLevel: currentMin,
      maxSkillLevel: newMax,
      skillLevel: `${currentMin}-${newMax}`,
    });
  };

  return (
    <View style={styles.container}>
      {/* ── Compact Registration Notice ── */}
      <View style={styles.compactRegNotice}>
        <Users size={16} color="#08785E" />
        <View style={styles.regNoticeTextCol}>
          <AppText variant="caption" bold style={styles.regNoticeTitle}>
            {isScramble
              ? 'Singles Scramble'
              : cap.isSingles
              ? 'Singles'
              : 'Doubles'}
          </AppText>
          <AppText variant="caption" style={styles.regNoticeDesc}>
            {isScramble
              ? 'Players register individually. Partners rotate automatically.'
              : cap.isSingles
              ? 'Players register individually.'
              : 'Players register as teams.'}
          </AppText>
        </View>
      </View>

      {/* ── Competition Division (Scramble) or Competition Category (Other Formats) ── */}
      <View style={styles.fieldSection}>
        <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
          {isScramble ? 'COMPETITION DIVISION *' : 'COMPETITION CATEGORY *'}
        </AppText>
        {isScramble ? (
          <View style={styles.divisionsList}>
            {SCRAMBLE_DIVISION_OPTIONS.map((div) => {
              const isSelected = state.category === div;
              return (
                <TouchableOpacity
                  key={div}
                  onPress={() => handleDivisionChange(div)}
                  style={[
                    styles.divisionCard,
                    isSelected && styles.divisionCardActive,
                  ]}
                  activeOpacity={0.7}
                >
                  <View style={styles.divisionCardHeader}>
                    <AppText
                      variant="bodySmall"
                      bold
                      style={[
                        styles.divisionCardTitle,
                        isSelected && styles.divisionCardTitleActive,
                      ]}
                    >
                      {div}
                    </AppText>
                    {isSelected && <View style={styles.selectedDot} />}
                  </View>
                  <AppText
                    variant="caption"
                    style={[
                      styles.divisionDesc,
                      isSelected && styles.divisionDescActive,
                    ]}
                  >
                    {SCRAMBLE_DIVISION_DESCRIPTIONS[div]}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.chipsWrap}>
            {CATEGORY_OPTIONS.map((cat) => {
              const isSelected = state.category === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => handleCategoryChange(cat)}
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
        )}
      </View>

      {/* ── Skill Level Eligibility ── */}
      <View style={styles.fieldSection}>
        <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
          SKILL LEVEL ELIGIBILITY *
        </AppText>
        <AppText variant="caption" color="tertiary" style={styles.sectionDescription}>
          Choose the skill level or rating range eligible to participate in this tournament.
        </AppText>

        {/* Mode Selector: Single Level vs Skill Range */}
        <View style={styles.modeTabsRow}>
          <TouchableOpacity
            style={[
              styles.modeTab,
              state.skillLevelMode !== 'range' && styles.modeTabActive,
            ]}
            onPress={() => handleModeChange('single')}
            activeOpacity={0.7}
          >
            <AppText
              variant="bodySmall"
              bold
              style={[
                styles.modeTabText,
                state.skillLevelMode !== 'range' && styles.modeTabTextActive,
              ]}
            >
              Single Level
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.modeTab,
              state.skillLevelMode === 'range' && styles.modeTabActive,
            ]}
            onPress={() => handleModeChange('range')}
            activeOpacity={0.7}
          >
            <AppText
              variant="bodySmall"
              bold
              style={[
                styles.modeTabText,
                state.skillLevelMode === 'range' && styles.modeTabTextActive,
              ]}
            >
              Skill Range
            </AppText>
          </TouchableOpacity>
        </View>

        {state.skillLevelMode !== 'range' ? (
          /* Single Level Selection: Rating chips */
          <View style={styles.singleLevelContainer}>
            <View style={styles.chipsWrap}>
              {SKILL_LEVEL_OPTIONS.map((lvl) => {
                const isSelected = (state.skillLevel || '3.5') === lvl;
                return (
                  <TouchableOpacity
                    key={lvl}
                    onPress={() =>
                      onChange({
                        skillLevel: lvl,
                        minSkillLevel: lvl,
                        maxSkillLevel: lvl,
                      })
                    }
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
            {errors?.skillLevel && (
              <AppText variant="caption" style={styles.fieldErrorText}>
                {errors.skillLevel}
              </AppText>
            )}
            <AppText variant="caption" color="tertiary" style={styles.helperText}>
              Tournament eligibility is restricted to exactly rating {state.skillLevel || '3.5'}.
            </AppText>
          </View>
        ) : (
          /* Skill Range Selection: Two dropdowns side-by-side */
          <View style={styles.rangeContainer}>
            <View style={styles.inputsRow}>
              <View style={styles.inputCol}>
                <AppText variant="caption" color="secondary" style={styles.dropdownLabel}>
                  Minimum Skill Level
                </AppText>
                <TouchableOpacity
                  style={[
                    styles.dropdownButton,
                    errors?.minSkillLevel ? styles.dropdownButtonError : null,
                  ]}
                  onPress={() => setIsMinPickerOpen(true)}
                  activeOpacity={0.7}
                >
                  <AppText variant="bodySmall" bold style={styles.dropdownButtonText}>
                    {state.minSkillLevel || '3.5'}
                  </AppText>
                  <ChevronDown size={16} color={Colors.text.secondary} />
                </TouchableOpacity>
                {errors?.minSkillLevel && (
                  <AppText variant="caption" style={styles.fieldErrorText}>
                    {errors.minSkillLevel}
                  </AppText>
                )}
              </View>

              <View style={styles.inputCol}>
                <AppText variant="caption" color="secondary" style={styles.dropdownLabel}>
                  Maximum Skill Level
                </AppText>
                <TouchableOpacity
                  style={[
                    styles.dropdownButton,
                    errors?.maxSkillLevel ? styles.dropdownButtonError : null,
                  ]}
                  onPress={() => setIsMaxPickerOpen(true)}
                  activeOpacity={0.7}
                >
                  <AppText variant="bodySmall" bold style={styles.dropdownButtonText}>
                    {state.maxSkillLevel || '4.5'}
                  </AppText>
                  <ChevronDown size={16} color={Colors.text.secondary} />
                </TouchableOpacity>
                {errors?.maxSkillLevel && (
                  <AppText variant="caption" style={styles.fieldErrorText}>
                    {errors.maxSkillLevel}
                  </AppText>
                )}
              </View>
            </View>

            <AppText variant="caption" color="tertiary" style={styles.helperText}>
              Eligible rating range: {state.minSkillLevel || '3.5'} through {state.maxSkillLevel || '4.5'} (inclusive).
            </AppText>
          </View>
        )}
      </View>

      {/* ── Age Restriction ── */}
      <View style={styles.fieldSection}>
        <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
          AGE RESTRICTION
        </AppText>
        <View style={[styles.inputsRow, isNarrowScreen && styles.inputsRowStacked]}>
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

      {/* ── Gender Eligibility / Player Eligibility ── */}
      <View style={styles.fieldSection}>
        {state.category === 'Singles' ? (
          <>
            <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
              PLAYER ELIGIBILITY *
            </AppText>
            <View style={styles.chipsWrap}>
              {(['Male', 'Female'] as const).map((gen) => {
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
            <AppText variant="caption" color="tertiary" style={styles.helperText}>
              Select whether this singles tournament is for male or female players.
            </AppText>
          </>
        ) : (
          <View style={styles.compactGenderCard}>
            <UserCheck size={16} color="#08785E" />
            <AppText variant="caption" style={styles.genderCardText}>
              Gender eligibility:{' '}
              <AppText variant="caption" bold style={styles.genderCardValue}>
                {state.category === "Men's Doubles" || state.category === "Men's Scramble"
                  ? 'Male'
                  : state.category === "Women's Doubles" || state.category === "Women's Scramble"
                  ? 'Female'
                  : state.category === 'Mixed Doubles'
                  ? 'Mixed'
                  : 'Any'}
              </AppText>
            </AppText>
          </View>
        )}
      </View>

      {/* ── Participant Capacity (Format-Dependent!) ── */}
      <View style={styles.fieldSection}>
        <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
          {isScramble || cap.isSingles ? 'PLAYER CAPACITY' : 'TEAM CAPACITY'}
        </AppText>
        <View style={[styles.inputsRow, isNarrowScreen && styles.inputsRowStacked]}>
          <View style={styles.inputCol}>
            <Input
              label={isScramble || cap.isSingles ? 'Minimum Players *' : 'Minimum Teams *'}
              value={state.minParticipants}
              onChangeText={(minParticipants) =>
                onChange({ minParticipants: minParticipants.replace(/[^0-9]/g, '') })
              }
              keyboardType="number-pad"
              error={errors?.minParticipants}
              hint={isScramble ? 'Min required (>= 4)' : 'Min required (>= 2)'}
            />
          </View>
          <View style={styles.inputCol}>
            <Input
              label={isScramble || cap.isSingles ? 'Maximum Players *' : 'Maximum Teams *'}
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

        <AppText variant="caption" color="secondary" style={styles.capacitySummaryText}>
          Total capacity: <AppText variant="caption" bold style={{ color: Colors.brand.primary }}>{cap.helperText}</AppText>
        </AppText>
      </View>

      {/* ── Tournament Visibility ── */}
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

      {/* Min Skill Level Picker Modal */}
      <Modal
        visible={isMinPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsMinPickerOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setIsMinPickerOpen(false)}
        >
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <AppText variant="bodySmall" bold>
                Select Minimum Skill Level
              </AppText>
            </View>
            {SKILL_LEVEL_OPTIONS.map((lvl) => {
              const isSelected = (state.minSkillLevel || '3.5') === lvl;
              return (
                <TouchableOpacity
                  key={lvl}
                  style={[
                    styles.pickerItem,
                    isSelected && styles.pickerItemActive,
                  ]}
                  onPress={() => {
                    handleMinSkillChange(lvl);
                    setIsMinPickerOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <AppText
                    variant="bodySmall"
                    bold={isSelected}
                    style={isSelected ? styles.pickerItemTextActive : styles.pickerItemText}
                  >
                    {lvl}
                  </AppText>
                  {isSelected && <View style={styles.selectedDot} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Max Skill Level Picker Modal */}
      <Modal
        visible={isMaxPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsMaxPickerOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setIsMaxPickerOpen(false)}
        >
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <AppText variant="bodySmall" bold>
                Select Maximum Skill Level
              </AppText>
            </View>
            {SKILL_LEVEL_OPTIONS.map((lvl) => {
              const isSelected = (state.maxSkillLevel || '4.5') === lvl;
              return (
                <TouchableOpacity
                  key={lvl}
                  style={[
                    styles.pickerItem,
                    isSelected && styles.pickerItemActive,
                  ]}
                  onPress={() => {
                    handleMaxSkillChange(lvl);
                    setIsMaxPickerOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <AppText
                    variant="bodySmall"
                    bold={isSelected}
                    style={isSelected ? styles.pickerItemTextActive : styles.pickerItemText}
                  >
                    {lvl}
                  </AppText>
                  {isSelected && <View style={styles.selectedDot} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[4],
  },
  scrambleFormatNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E5F4EC',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: Spacing[3],
    gap: Spacing[3],
    marginBottom: Spacing[1],
  },
  scrambleNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#08785E',
    marginBottom: 2,
  },
  scrambleNoticeDescription: {
    fontSize: 12,
    lineHeight: 17,
    color: '#065F46',
  },
  fieldSection: {
    gap: Spacing[2],
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  chip: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.default,
  },
  chipActive: {
    borderColor: Colors.brand.primary,
    backgroundColor: 'rgba(8, 120, 94, 0.08)',
  },
  chipText: {
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  chipTextActive: {
    color: Colors.brand.primary,
    fontWeight: '700',
  },
  categoryScrambleHint: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  compactRegNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing[3],
    marginBottom: Spacing[1],
  },
  regNoticeTextCol: {
    flex: 1,
    gap: 1,
  },
  regNoticeTitle: {
    color: '#065F46',
    fontSize: 12,
  },
  regNoticeDesc: {
    color: '#047857',
    fontSize: 11,
    lineHeight: 15,
  },
  inputsRow: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  inputsRowStacked: {
    flexDirection: 'column',
    gap: Spacing[2],
  },
  inputCol: {
    flex: 1,
  },
  helperText: {
    fontSize: 11,
    marginTop: 2,
  },
  capacitySummaryText: {
    fontSize: 12,
    marginTop: 4,
  },
  visibilityHint: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  divisionsList: {
    gap: Spacing[2],
  },
  divisionCard: {
    paddingVertical: 10,
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.default,
    gap: 2,
  },
  divisionCardActive: {
    borderColor: '#08785E',
    backgroundColor: '#F0FDF4',
  },
  divisionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  divisionCardTitle: {
    fontSize: 13,
    color: Colors.text.primary,
  },
  divisionCardTitleActive: {
    color: '#065F46',
  },
  selectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#08785E',
  },
  divisionDesc: {
    fontSize: 11,
    lineHeight: 15,
    color: Colors.text.tertiary,
  },
  divisionDescActive: {
    color: '#065F46',
  },
  divisionNotice: {
    backgroundColor: 'rgba(8, 120, 94, 0.08)',
    borderRadius: Radius.md,
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
  },
  sectionDescription: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: -2,
    marginBottom: Spacing[1],
  },
  modeTabsRow: {
    flexDirection: 'row',
    gap: Spacing[2],
    marginBottom: Spacing[1],
  },
  modeTab: {
    flex: 1,
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTabActive: {
    borderColor: '#08785E',
    backgroundColor: 'rgba(8, 120, 94, 0.08)',
  },
  modeTabText: {
    color: Colors.text.secondary,
    fontWeight: '600',
    fontSize: 13,
  },
  modeTabTextActive: {
    color: '#08785E',
    fontWeight: '700',
  },
  singleLevelContainer: {
    gap: Spacing[1],
  },
  rangeContainer: {
    gap: Spacing[1],
  },
  dropdownLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.default,
  },
  dropdownButtonError: {
    borderColor: Colors.status.error,
  },
  dropdownButtonText: {
    color: Colors.text.primary,
    fontSize: 14,
  },
  fieldErrorText: {
    color: Colors.status.error,
    fontSize: 11,
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[4],
  },
  pickerModalContent: {
    width: '100%',
    maxWidth: 280,
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    padding: Spacing[3],
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  pickerModalHeader: {
    paddingBottom: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
    marginBottom: Spacing[1],
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.sm,
  },
  pickerItemActive: {
    backgroundColor: 'rgba(8, 120, 94, 0.08)',
  },
  pickerItemText: {
    color: Colors.text.primary,
    fontSize: 14,
  },
  pickerItemTextActive: {
    color: '#08785E',
    fontWeight: '700',
    fontSize: 14,
  },
  compactGenderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing[3],
  },
  genderCardText: {
    color: Colors.text.secondary,
    fontSize: 12,
  },
  genderCardValue: {
    color: '#065F46',
    fontWeight: '700',
  },
});
