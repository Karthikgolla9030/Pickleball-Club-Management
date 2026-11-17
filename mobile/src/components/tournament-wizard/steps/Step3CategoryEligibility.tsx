/**
 * Aught2 Pickleball — Step 3: Category & Eligibility
 *
 * Clean, compact configuration for:
 * A. Competition Category (or Division for Scramble)
 * B. Skill Level (Single Level vs Skill Range)
 * C. Age Restrictions (Minimum Age & Maximum Age)
 * D. Gender Eligibility (Automatic inline display, or Male/Female for Singles)
 * E. Player / Team Capacity (Format-dependent labels & validation)
 */

import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Input } from '@/components/Input';
import { Colors, Radius, Spacing } from '@/theme';
import { calculateCapacity } from '@/utils/tournamentCapacity';
import {
  CATEGORY_OPTIONS,
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
    } else if (state.category === "Men's Scramble" && state.genderCategory !== 'Male') {
      onChange({ genderCategory: 'Male' });
    } else if (state.category === "Women's Scramble" && state.genderCategory !== 'Female') {
      onChange({ genderCategory: 'Female' });
    } else if (state.category === "Mixed Scramble" && state.genderCategory !== 'Mixed') {
      onChange({ genderCategory: 'Mixed' });
    } else if (state.category === "Open Scramble" && state.genderCategory !== 'Any') {
      onChange({ genderCategory: 'Any' });
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
    } else if (div === 'Mixed Scramble') {
      patch.genderCategory = 'Mixed';
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

  const getResolvedGender = (): string => {
    if (state.category === "Men's Doubles" || state.category === "Men's Scramble") {
      return 'Male';
    }
    if (state.category === "Women's Doubles" || state.category === "Women's Scramble") {
      return 'Female';
    }
    if (state.category === 'Mixed Doubles' || state.category === 'Mixed Scramble') {
      return 'Mixed';
    }
    if (state.category === 'Open Scramble') {
      return 'Any';
    }
    if (state.category === 'Singles') {
      return state.genderCategory || 'Male';
    }
    return state.genderCategory || 'Any';
  };

  const resolvedGender = getResolvedGender();

  return (
    <View style={styles.container}>
      {/* ── A. Competition Category (or Scramble Division) ── */}
      <View style={styles.fieldSection}>
        <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
          {isScramble ? 'COMPETITION DIVISION *' : 'COMPETITION CATEGORY *'}
        </AppText>
        <View style={styles.categoryButtonsRow}>
          {isScramble
            ? SCRAMBLE_DIVISION_OPTIONS.map((div) => {
                const isSelected = state.category === div;
                return (
                  <TouchableOpacity
                    key={div}
                    onPress={() => handleDivisionChange(div)}
                    style={[
                      styles.categoryButton,
                      isSelected && styles.categoryButtonActive,
                      isNarrowScreen && styles.categoryButtonNarrow,
                    ]}
                    activeOpacity={0.7}
                  >
                    <AppText
                      variant="bodySmall"
                      bold={isSelected}
                      style={[
                        styles.categoryButtonText,
                        isSelected && styles.categoryButtonTextActive,
                      ]}
                    >
                      {div}
                    </AppText>
                  </TouchableOpacity>
                );
              })
            : CATEGORY_OPTIONS.map((cat) => {
                const isSelected = state.category === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => handleCategoryChange(cat)}
                    style={[
                      styles.categoryButton,
                      isSelected && styles.categoryButtonActive,
                      isNarrowScreen && styles.categoryButtonNarrow,
                    ]}
                    activeOpacity={0.7}
                  >
                    <AppText
                      variant="bodySmall"
                      bold={isSelected}
                      style={[
                        styles.categoryButtonText,
                        isSelected && styles.categoryButtonTextActive,
                      ]}
                    >
                      {cat}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
        </View>
        {errors?.category && (
          <AppText variant="caption" style={styles.fieldErrorText}>
            {errors.category}
          </AppText>
        )}
      </View>

      {/* ── B. Skill Level ── */}
      <View style={styles.fieldSection}>
        <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
          SKILL LEVEL *
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
          /* Single Level: Compact Rating Choice Pills */
          <View style={styles.singleLevelContainer}>
            <View style={styles.ratingsWrap}>
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
                    style={[styles.ratingPill, isSelected && styles.ratingPillActive]}
                    activeOpacity={0.7}
                  >
                    <AppText
                      variant="bodySmall"
                      bold={isSelected}
                      style={[
                        styles.ratingPillText,
                        isSelected && styles.ratingPillTextActive,
                      ]}
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
          </View>
        ) : (
          /* Skill Range: Two Compact Dropdowns */
          <View style={styles.rangeContainer}>
            <View style={[styles.inputsRow, isNarrowScreen && styles.inputsRowStacked]}>
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
          </View>
        )}
      </View>

      {/* ── C. Age Restrictions ── */}
      <View style={styles.fieldSection}>
        <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
          AGE RESTRICTIONS
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
            />
          </View>
        </View>
      </View>

      {/* ── D. Gender Eligibility ── */}
      <View style={styles.fieldSection}>
        {state.category === 'Singles' ? (
          <>
            <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
              GENDER ELIGIBILITY *
            </AppText>
            <View style={styles.genderButtonsRow}>
              {(['Male', 'Female'] as const).map((gen) => {
                const isSelected = state.genderCategory === gen;
                return (
                  <TouchableOpacity
                    key={gen}
                    onPress={() => onChange({ genderCategory: gen })}
                    style={[
                      styles.genderButton,
                      isSelected && styles.genderButtonActive,
                    ]}
                    activeOpacity={0.7}
                  >
                    <AppText
                      variant="bodySmall"
                      bold={isSelected}
                      style={[
                        styles.genderButtonText,
                        isSelected && styles.genderButtonTextActive,
                      ]}
                    >
                      {gen}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </View>
            {errors?.genderCategory && (
              <AppText variant="caption" style={styles.fieldErrorText}>
                {errors.genderCategory}
              </AppText>
            )}
          </>
        ) : (
          <View style={styles.inlineGenderRow}>
            <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
              GENDER ELIGIBILITY:
            </AppText>
            <View style={styles.inlineBadge}>
              <AppText variant="caption" bold style={styles.inlineBadgeText}>
                {resolvedGender}
              </AppText>
            </View>
          </View>
        )}
      </View>

      {/* ── E. Player / Team Capacity ── */}
      <View style={styles.fieldSection}>
        <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
          {isScramble || cap.isSingles ? 'PLAYER CAPACITY *' : 'TEAM CAPACITY *'}
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
              placeholder={isScramble ? '4' : '2'}
              error={errors?.minParticipants}
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
              placeholder={isScramble ? '16' : '8'}
              error={errors?.maxParticipants}
            />
          </View>
        </View>
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
  fieldSection: {
    gap: Spacing[2],
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  categoryButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  categoryButton: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryButtonActive: {
    borderColor: '#08785E',
    backgroundColor: 'rgba(8, 120, 94, 0.08)',
  },
  categoryButtonNarrow: {
    flexBasis: '100%',
  },
  categoryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
    textAlign: 'center',
  },
  categoryButtonTextActive: {
    color: '#08785E',
    fontWeight: '700',
  },
  modeTabsRow: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  modeTab: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 8,
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
  ratingsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  ratingPill: {
    flexBasis: '14%',
    flexGrow: 1,
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingPillActive: {
    borderColor: '#08785E',
    backgroundColor: 'rgba(8, 120, 94, 0.08)',
  },
  ratingPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  ratingPillTextActive: {
    color: '#08785E',
    fontWeight: '700',
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
  genderButtonsRow: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  genderButton: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderButtonActive: {
    borderColor: '#08785E',
    backgroundColor: 'rgba(8, 120, 94, 0.08)',
  },
  genderButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  genderButtonTextActive: {
    color: '#08785E',
    fontWeight: '700',
  },
  inlineGenderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  inlineBadge: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(8, 120, 94, 0.08)',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  inlineBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#08785E',
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
  selectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#08785E',
  },
});
