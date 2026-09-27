/**
 * Aught2 Pickleball — SetupCourtsModal
 *
 * Full-screen responsive configuration modal for Pool Play tournaments:
 * - Full-height responsive layout matching Create Tournament / League pattern
 * - Number of Pools stepper with dynamic bounds and preset chips
 * - Rating balance tolerance controls
 * - Championship qualifiers setting
 * - Championship bracket format selection
 * - Single vertical scroll container, keyboard-aware, accessible sticky footer
 */

import React, { useState, useEffect } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertCircle,
  Check,
  GitFork,
  Info,
  LayoutGrid,
  Minus,
  Plus,
  Scale,
  SlidersHorizontal,
  X,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Colors, Layout, Radius, Spacing, Typography } from '@/theme';
import type { BracketType, PoolPlayConfig } from '@/types/poolPlay';
import { TOLERANCE_OPTIONS } from '@/utils/poolPlayLogic';

const TOLERANCE_DESCRIPTIONS: Record<number, string> = {
  0.3: 'Tightest skill parity between pools (±0.30 max diff)',
  0.5: 'Balanced distribution with standard tolerance (±0.50 max diff)',
  0.75: 'Accommodates wider DUPR rating variance (±0.75 max diff)',
  1.0: 'Unrestricted pairing across skill ratings (±1.00 max diff)',
};

interface SetupCourtsModalProps {
  visible: boolean;
  onClose: () => void;
  config: PoolPlayConfig;
  onSaveConfig: (updated: Partial<PoolPlayConfig>) => void;
  registeredCount?: number;
  maxParticipants?: number | null;
}

export function SetupCourtsModal({
  visible,
  onClose,
  config,
  onSaveConfig,
  registeredCount = 0,
  maxParticipants = 16,
}: SetupCourtsModalProps) {
  const [numPools, setNumPools] = useState(config.numPools || 2);
  const [tolerance, setTolerance] = useState(config.balanceTolerance);
  const [qualifiers, setQualifiers] = useState(config.qualifierCount);
  const [bracketType, setBracketType] = useState<BracketType>(config.bracketType);

  // Sync state whenever opened or config changes
  useEffect(() => {
    if (visible) {
      setNumPools(config.numPools || 2);
      setTolerance(config.balanceTolerance);
      setQualifiers(config.qualifierCount);
      setBracketType(config.bracketType);
    }
  }, [visible, config]);

  // Compute dynamic pool bounds based on registrations & capacity
  const minPools = 2;
  const effectiveCapacity = registeredCount >= 4 ? registeredCount : (maxParticipants || 16);
  const maxPools = Math.max(minPools, Math.min(12, Math.floor(effectiveCapacity / 2)));

  const handleDecrement = () => {
    if (numPools <= minPools) return;
    setNumPools((prev) => Math.max(minPools, prev - 1));
  };

  const handleIncrement = () => {
    if (numPools >= maxPools) return;
    setNumPools((prev) => Math.min(maxPools, prev + 1));
  };

  // Team ratio validation
  const teamsPerPool = registeredCount > 0
    ? (registeredCount / numPools).toFixed(1)
    : (effectiveCapacity / numPools).toFixed(1);
  const hasInvalidTeamRatio = registeredCount > 0 && registeredCount < numPools * 2;

  const handleSave = () => {
    if (numPools < minPools) {
      Alert.alert('Invalid Configuration', `Pool Play requires at least ${minPools} pools.`);
      return;
    }
    if (hasInvalidTeamRatio) {
      Alert.alert(
        'Insufficient Teams',
        `Backend rules require at least 2 teams per pool. You have ${registeredCount} registered teams, which supports at most ${Math.floor(registeredCount / 2)} pools.`
      );
      return;
    }

    onSaveConfig({
      numPools,
      balanceTolerance: tolerance,
      qualifierCount: qualifiers,
      bracketType,
    });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={styles.headerIconContainer}>
                <SlidersHorizontal size={20} color="#0F766E" />
              </View>
              <View style={styles.headerTextContainer}>
                <AppText variant="heading3" style={styles.headerTitle}>
                  Setup & Configuration
                </AppText>
                <AppText variant="caption" color="secondary" style={styles.headerSubtitle}>
                  Pool stages, rating balance, and championship qualification
                </AppText>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.closeButton}
                accessibilityLabel="Close setup modal"
                accessibilityRole="button"
              >
                <X size={18} color={Colors.text.secondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Scrollable Form Body */}
          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ─── 1. Number of Pools Stepper ──────────────────────────────── */}
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <LayoutGrid size={18} color="#0F766E" />
                <AppText style={styles.sectionTitle}>Number of Pools</AppText>
              </View>
              <AppText style={styles.sectionDesc}>
                Participants are distributed evenly across pools via snake seeding. Minimum is 2 pools (at least 2 teams per pool).
              </AppText>

              {/* Stepper Control */}
              <View style={styles.stepperContainer}>
                <TouchableOpacity
                  onPress={handleDecrement}
                  disabled={numPools <= minPools}
                  style={[
                    styles.stepperButton,
                    numPools <= minPools && styles.stepperButtonDisabled,
                  ]}
                  accessibilityLabel="Decrease number of pools"
                  accessibilityRole="button"
                >
                  <Minus size={18} color={numPools <= minPools ? '#9CA3AF' : '#0F766E'} />
                </TouchableOpacity>

                <View style={styles.stepperValueContainer}>
                  <AppText style={styles.stepperNumber}>{numPools}</AppText>
                  <AppText style={styles.stepperLabel}>
                    {numPools === 1 ? 'Pool' : 'Pools'}
                  </AppText>
                </View>

                <TouchableOpacity
                  onPress={handleIncrement}
                  disabled={numPools >= maxPools}
                  style={[
                    styles.stepperButton,
                    numPools >= maxPools && styles.stepperButtonDisabled,
                  ]}
                  accessibilityLabel="Increase number of pools"
                  accessibilityRole="button"
                >
                  <Plus size={18} color={numPools >= maxPools ? '#9CA3AF' : '#0F766E'} />
                </TouchableOpacity>
              </View>

              {/* Preset Quick Chips */}
              <View style={styles.presetRow}>
                {[2, 3, 4, 6].filter((n) => n <= maxPools).map((n) => (
                  <TouchableOpacity
                    key={n}
                    onPress={() => setNumPools(n)}
                    style={[styles.presetChip, numPools === n && styles.presetChipActive]}
                    accessibilityRole="button"
                  >
                    <AppText
                      style={[
                        styles.presetChipText,
                        numPools === n && styles.presetChipTextActive,
                      ]}
                    >
                      {n} Pools
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Live Guidance / Validation Banner */}
              {hasInvalidTeamRatio ? (
                <View style={styles.validationWarning}>
                  <AlertCircle size={16} color="#DC2626" />
                  <AppText style={styles.validationWarningText}>
                    {registeredCount} registered teams cannot be split into {numPools} pools (need ≥ 2 teams/pool). Maximum supported is {Math.floor(registeredCount / 2)} pools.
                  </AppText>
                </View>
              ) : (
                <View style={styles.infoBanner}>
                  <Info size={15} color="#0D9488" />
                  <AppText style={styles.infoBannerText}>
                    Snake seeding into {numPools} pools (~{teamsPerPool} teams/pool). Capacity: up to {numPools * 8} teams.
                  </AppText>
                </View>
              )}
            </View>

            {/* ─── 2. Rating Balance Tolerance ──────────────────────────────── */}
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Scale size={18} color="#0F766E" />
                <AppText style={styles.sectionTitle}>Pool Balance Tolerance</AppText>
              </View>
              <AppText style={styles.sectionDesc}>
                Maximum allowable difference in average DUPR/rating between pools.
              </AppText>

              <View style={styles.optionsList}>
                {TOLERANCE_OPTIONS.map((opt) => {
                  const isSelected = tolerance === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setTolerance(opt.value)}
                      style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                    >
                      <View style={styles.optionContent}>
                        <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                          {isSelected && <View style={styles.radioInner} />}
                        </View>
                        <View style={styles.optionTextContainer}>
                          <AppText style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                            {opt.label}
                          </AppText>
                          <AppText style={styles.optionSubtitle}>
                            {TOLERANCE_DESCRIPTIONS[opt.value] || 'Rating tolerance threshold'}
                          </AppText>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ─── 3. Championship Qualifiers ───────────────────────────────── */}
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <GitFork size={18} color="#0F766E" />
                <AppText style={styles.sectionTitle}>Championship Qualifiers</AppText>
              </View>
              <AppText style={styles.sectionDesc}>
                Number of advancing teams from pool play into the medal bracket.
              </AppText>

              <View style={styles.chipGrid}>
                {[
                  { count: 4, label: 'Top 4', desc: `${Math.ceil(4 / numPools)}/pool` },
                  { count: 6, label: 'Top 6', desc: `6 teams (BYEs)` },
                  { count: 8, label: 'Top 8', desc: `${Math.ceil(8 / numPools)}/pool` },
                  { count: 12, label: 'Top 12', desc: `12 teams (BYEs)` },
                ].map((q) => {
                  const isSelected = qualifiers === q.count;
                  return (
                    <TouchableOpacity
                      key={q.count}
                      onPress={() => setQualifiers(q.count)}
                      style={[styles.qualifierChip, isSelected && styles.qualifierChipSelected]}
                      accessibilityRole="button"
                    >
                      <AppText
                        style={[
                          styles.qualifierChipText,
                          isSelected && styles.qualifierChipTextSelected,
                        ]}
                      >
                        {q.label}
                      </AppText>
                      <AppText
                        style={[
                          styles.qualifierChipDesc,
                          isSelected && styles.qualifierChipDescSelected,
                        ]}
                      >
                        {q.desc}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ─── 4. Championship Bracket Format ───────────────────────────── */}
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <GitFork size={18} color="#0F766E" />
                <AppText style={styles.sectionTitle}>Championship Bracket Format</AppText>
              </View>
              <AppText style={styles.sectionDesc}>
                Tournament progression format for qualifying pool winners.
              </AppText>

              <View style={styles.optionsList}>
                {(
                  [
                    'Single Elimination',
                    'Single Elimination + Consolation',
                    'Double Elimination',
                  ] as BracketType[]
                ).map((b) => {
                  const isSelected = bracketType === b;
                  return (
                    <TouchableOpacity
                      key={b}
                      onPress={() => setBracketType(b)}
                      style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                    >
                      <View style={styles.optionContent}>
                        <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                          {isSelected && <View style={styles.radioInner} />}
                        </View>
                        <AppText style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                          {b}
                        </AppText>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ScrollView>

          {/* Sticky Footer */}
          <View style={styles.footer}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={onClose}
              style={styles.footerButton}
            />
            <Button
              label="Save Configuration"
              variant="primary"
              onPress={handleSave}
              style={styles.footerButton}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: Layout.screenHorizontal,
    paddingTop: Spacing[3],
    paddingBottom: Spacing[3],
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  headerIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 18,
  },
  headerSubtitle: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 1,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyScroll: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  bodyContent: {
    paddingHorizontal: Layout.screenHorizontal,
    paddingVertical: Spacing[4],
    gap: Spacing[3],
    paddingBottom: Spacing[8],
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: Spacing[3],
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    marginBottom: Spacing[3],
    gap: Spacing[4],
  },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  stepperButtonDisabled: {
    borderColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
  },
  stepperValueContainer: {
    alignItems: 'center',
    minWidth: 90,
  },
  stepperNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 32,
  },
  stepperLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F766E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  presetRow: {
    flexDirection: 'row',
    gap: Spacing[2],
    marginBottom: Spacing[3],
  },
  presetChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipActive: {
    backgroundColor: '#0F766E',
    borderColor: '#0F766E',
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  presetChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    padding: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#0F766E',
    lineHeight: 17,
  },
  validationWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    padding: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  validationWarningText: {
    flex: 1,
    fontSize: 12,
    color: '#DC2626',
    lineHeight: 17,
    fontWeight: '500',
  },
  optionsList: {
    gap: Spacing[2],
  },
  optionCard: {
    padding: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FAFAFA',
  },
  optionCardSelected: {
    borderColor: '#0F766E',
    backgroundColor: '#F0FDFA',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: '#0F766E',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0F766E',
  },
  optionTextContainer: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  optionLabelSelected: {
    color: '#0F766E',
    fontWeight: '700',
  },
  optionSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  qualifierChip: {
    width: '48%',
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FAFAFA',
    alignItems: 'center',
  },
  qualifierChipSelected: {
    borderColor: '#0F766E',
    backgroundColor: '#F0FDFA',
  },
  qualifierChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  qualifierChipTextSelected: {
    color: '#0F766E',
  },
  qualifierChipDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  qualifierChipDescSelected: {
    color: '#0D9488',
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: Layout.screenHorizontal,
    paddingVertical: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    gap: Spacing[3],
  },
  footerButton: {
    flex: 1,
  },
});
