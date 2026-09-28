/**
 * Aught2 Pickleball — PoolPlaySetupCourtsTab
 *
 * Dedicated tab for Setup & Courts in Pool Play tournaments:
 * - Persistent configuration page that does NOT disappear on category switch or refresh
 * - Number of Pools selection (2, 3, 4 pools)
 * - Rating balance tolerance controls (Strict, Standard, Relaxed, Open)
 * - Championship qualifiers setting (Top 2, 3, 4 per pool)
 * - Championship elimination format selection (Single Elimination, Double Elimination, Consolation)
 * - Court configuration & assignment
 * - Save button with state updates and visual confirmation
 */

import React, { useState } from 'react';
import {
  Alert,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
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
  Trophy,
} from 'lucide-react-native';


import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Spacing } from '@/theme';
import type { Court } from '@/types';
import type { BracketType, CourtConfig, PoolPlayConfig } from '@/types/poolPlay';
import { TOLERANCE_OPTIONS } from '@/utils/poolPlayLogic';

const BRACKET_OPTIONS: { type: BracketType; label: string; desc: string }[] = [
  {
    type: 'Single Elimination',
    label: 'Single Elimination',
    desc: 'Standard knockout bracket — winner advances, loser is eliminated.',
  },
  {
    type: 'Single Elimination + Consolation',
    label: 'Single Elimination + Consolation',
    desc: 'Main bracket plus 3rd place consolation playoff match.',
  },
  {
    type: 'Double Elimination',
    label: 'Double Elimination',
    desc: 'Winners and losers bracket — requires 2 losses for elimination.',
  },
];

interface PoolPlaySetupCourtsTabProps {
  config: PoolPlayConfig;
  onSaveConfig: (updated: Partial<PoolPlayConfig>) => void;
  canManage?: boolean;
  registeredCount?: number;
  maxParticipants?: number | null;
  clubCourts?: Court[];
  clubName?: string;
}

export function PoolPlaySetupCourtsTab({
  config,
  onSaveConfig,
  canManage = true,
  registeredCount = 0,
  maxParticipants = 16,
  clubCourts,
  clubName,
}: PoolPlaySetupCourtsTabProps) {
  const [numPools, setNumPools] = useState<number>(config.numPools || 2);
  const [tolerance, setTolerance] = useState<number>(config.balanceTolerance);
  const [qualifiers, setQualifiers] = useState<number>(config.qualifierCount);
  const [bracketType, setBracketType] = useState<BracketType>(config.bracketType);
  const [numCourts, setNumCourts] = useState<number>(config.numCourts || 4);
  const [hasSaved, setHasSaved] = useState(false);

  // Sync if config.numPools updates externally
  React.useEffect(() => {
    if (config.numPools && config.numPools !== numPools) {
      setNumPools(config.numPools);
    }
  }, [config.numPools]);

  // Compute domain bounds:
  // Minimum pools is always 2 (Pool Play invariant)
  const minPools = 2;
  // Maximum pools: each pool requires at least 2 teams by backend engine rules.
  // If registered teams >= 4, limit max pools to floor(registered / 2).
  // Otherwise use tournament max_participants / 2 (default max 8 pools).
  const effectiveCapacity = registeredCount >= 4 ? registeredCount : (maxParticipants || 16);
  const maxPools = Math.max(minPools, Math.min(12, Math.floor(effectiveCapacity / 2)));

  const handleDecrementPools = () => {
    if (!canManage || numPools <= minPools) return;
    setNumPools((prev) => Math.max(minPools, prev - 1));
  };

  const handleIncrementPools = () => {
    if (!canManage || numPools >= maxPools) return;
    setNumPools((prev) => Math.min(maxPools, prev + 1));
  };

  // Validation feedback
  const teamsPerPool = registeredCount > 0 ? (registeredCount / numPools).toFixed(1) : (effectiveCapacity / numPools).toFixed(1);
  const hasInvalidTeamRatio = registeredCount > 0 && registeredCount < numPools * 2;
  const qualifiersPerPool = Math.max(1, Math.floor(qualifiers / numPools));
  const hasExcessQualifiers = registeredCount > 0 && qualifiersPerPool > Math.floor(registeredCount / numPools);

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
      numCourts,
    });
    setHasSaved(true);
    Alert.alert(
      'Setup Saved',
      `Pool Play configuration saved: ${numPools} pools, ${qualifiers} championship qualifiers, and ${numCourts} court capacity.`
    );
    setTimeout(() => setHasSaved(false), 3000);
  };

  return (
    <View style={styles.container}>
      {/* ─── Header Info Card ────────────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <SlidersHorizontal size={18} color="#0F766E" />
          <AppText style={styles.cardTitle}>Setup & Court Configuration</AppText>
        </View>
        <AppText style={styles.cardSubtitle}>
          Configure pool stages, balance tolerances, assigned courts, and championship qualification rules.
        </AppText>
      </Card>

      {/* ─── 1. Number of Pools ───────────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <LayoutGrid size={17} color="#0F766E" />
          <AppText style={styles.sectionTitle}>Number of Pools</AppText>
        </View>
        <AppText style={styles.sectionDesc}>
          Configure the desired pool partition count. Participants are distributed evenly across pools via snake seeding.
        </AppText>

        {/* Responsive Numeric Stepper */}
        <View style={styles.stepperContainer}>
          <TouchableOpacity
            style={[styles.stepperBtn, (!canManage || numPools <= minPools) && styles.stepperBtnDisabled]}
            onPress={handleDecrementPools}
            disabled={!canManage || numPools <= minPools}
            activeOpacity={0.7}
            accessibilityLabel="Decrease number of pools"
          >
            <Minus size={18} color={numPools <= minPools ? '#94A3B8' : '#0F766E'} strokeWidth={2.4} />
          </TouchableOpacity>

          <View style={styles.stepperValueBox}>
            <AppText style={styles.stepperValueNum}>{numPools}</AppText>
            <AppText style={styles.stepperValueLabel}>Pools</AppText>
          </View>

          <TouchableOpacity
            style={[styles.stepperBtn, (!canManage || numPools >= maxPools) && styles.stepperBtnDisabled]}
            onPress={handleIncrementPools}
            disabled={!canManage || numPools >= maxPools}
            activeOpacity={0.7}
            accessibilityLabel="Increase number of pools"
          >
            <Plus size={18} color={numPools >= maxPools ? '#94A3B8' : '#0F766E'} strokeWidth={2.4} />
          </TouchableOpacity>
        </View>

        {/* Quick Selection Presets */}
        <View style={styles.presetRow}>
          {Array.from({ length: maxPools - minPools + 1 }, (_, i) => minPools + i).map((n) => {
            const isSelected = numPools === n;
            return (
              <TouchableOpacity
                key={n}
                onPress={() => canManage && setNumPools(n)}
                style={[styles.choiceChip, isSelected && styles.choiceChipActive]}
                activeOpacity={0.8}
              >
                <AppText
                  style={[styles.choiceChipText, isSelected && styles.choiceChipTextActive]}
                >
                  {n} Pools
                </AppText>
                {isSelected && <Check size={13} color="#0F766E" strokeWidth={2.5} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Real-time Guidance & Invariant Validation */}
        {hasInvalidTeamRatio ? (
          <View style={styles.warningBox}>
            <AlertCircle size={15} color="#DC2626" />
            <AppText style={styles.warningText}>
              Backend rules require at least 2 teams per pool. You have {registeredCount} teams registered, which supports at most {Math.floor(registeredCount / 2)} pools.
            </AppText>
          </View>
        ) : (
          <View style={styles.infoStrip}>
            <Info size={14} color="#0284C7" />
            <AppText style={styles.infoStripText}>
              {registeredCount > 0 ? `${registeredCount} teams registered` : `Capacity: up to ${effectiveCapacity} entries`} • ~{teamsPerPool} teams per pool • Top {qualifiersPerPool} advance ({numPools * qualifiersPerPool} bracket qualifiers)
            </AppText>
          </View>
        )}
      </Card>

      {/* ─── 2. Rating Balance Tolerance ──────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Scale size={17} color="#0F766E" />
          <AppText style={styles.sectionTitle}>Pool Balance Tolerance</AppText>
        </View>
        <AppText style={styles.sectionDesc}>
          Maximum allowed difference in average DUPR/rating between pools.
        </AppText>

        <View style={styles.optionsList}>
          {TOLERANCE_OPTIONS.map((opt) => {
            const isSelected = tolerance === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => canManage && setTolerance(opt.value)}
                style={[styles.optionRow, isSelected && styles.optionRowActive]}
                activeOpacity={0.8}
              >
                <View style={styles.radioOuter}>
                  {isSelected && <View style={styles.radioInner} />}
                </View>
                <View style={styles.optionTextContainer}>
                  <AppText style={[styles.optionTitle, isSelected && styles.optionTitleActive]}>
                    {opt.label}
                  </AppText>
                  <AppText style={styles.optionSubtitle}>
                    {opt.value === 0.3
                      ? 'Tightest skill parity between pools (±0.30 max diff)'
                      : opt.value === 0.5
                      ? 'Balanced division parity recommended for club tournaments'
                      : opt.value === 0.75
                      ? 'Accommodates wider team rating variance'
                      : 'Permits any rating gap between pools'}
                  </AppText>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      {/* ─── 3. Championship Qualifiers ───────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Trophy size={17} color="#0F766E" />
          <AppText style={styles.sectionTitle}>Championship Qualifiers</AppText>
        </View>
        <AppText style={styles.sectionDesc}>
          Number of top finishers advancing from pool play to the elimination bracket.
        </AppText>

        <View style={styles.chipRow}>
          {[2, 4, 6, 8].map((q) => {
            const isSelected = qualifiers === q;
            return (
              <TouchableOpacity
                key={q}
                onPress={() => canManage && setQualifiers(q)}
                style={[styles.choiceChip, isSelected && styles.choiceChipActive]}
                activeOpacity={0.8}
              >
                <AppText
                  style={[styles.choiceChipText, isSelected && styles.choiceChipTextActive]}
                >
                  Top {q} Teams
                </AppText>
                {isSelected && <Check size={14} color="#0F766E" strokeWidth={2.5} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      {/* ─── 4. Championship Bracket Format ────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <GitFork size={17} color="#0F766E" />
          <AppText style={styles.sectionTitle}>Championship Elimination Type</AppText>
        </View>

        <View style={styles.optionsList}>
          {BRACKET_OPTIONS.map((opt) => {
            const isSelected = bracketType === opt.type;
            return (
              <TouchableOpacity
                key={opt.type}
                onPress={() => canManage && setBracketType(opt.type)}
                style={[styles.optionRow, isSelected && styles.optionRowActive]}
                activeOpacity={0.8}
              >
                <View style={styles.radioOuter}>
                  {isSelected && <View style={styles.radioInner} />}
                </View>
                <View style={styles.optionTextContainer}>
                  <AppText style={[styles.optionTitle, isSelected && styles.optionTitleActive]}>
                    {opt.label}
                  </AppText>
                  <AppText style={styles.optionSubtitle}>{opt.desc}</AppText>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      {/* ─── 5. Court Availability & Club Facilities ────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <LayoutGrid size={17} color="#0F766E" />
          <AppText style={styles.sectionTitle}>
            Courts Available for this Tournament: {numCourts}
          </AppText>
        </View>
        <AppText style={styles.sectionDesc}>
          This is the configured concurrent court capacity for tournament scheduling, not an assignment to named physical courts. Matches will rotate across available courts.
        </AppText>

        {canManage && (
          <View style={styles.courtCapacityBox}>
            <View style={styles.counterInfo}>
              <AppText style={styles.counterLabel}>Concurrent Court Capacity</AppText>
              <AppText style={styles.counterDesc}>
                Number of matches that can run simultaneously
              </AppText>
            </View>
            <View style={styles.stepperContainerInline}>
              <TouchableOpacity
                onPress={() => numCourts > 1 && setNumCourts((prev) => prev - 1)}
                disabled={numCourts <= 1}
                style={[styles.smallStepBtn, numCourts <= 1 && styles.smallStepBtnDisabled]}
                accessibilityLabel="Decrease courts"
              >
                <Minus size={15} color={numCourts <= 1 ? '#94A3B8' : '#0F172A'} />
              </TouchableOpacity>
              <AppText style={styles.counterValueInline}>{numCourts}</AppText>
              <TouchableOpacity
                onPress={() => numCourts < 16 && setNumCourts((prev) => prev + 1)}
                disabled={numCourts >= 16}
                style={[styles.smallStepBtn, numCourts >= 16 && styles.smallStepBtnDisabled]}
                accessibilityLabel="Increase courts"
              >
                <Plus size={15} color={numCourts >= 16 ? '#94A3B8' : '#0F172A'} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.clubCourtsSection}>
          <AppText style={styles.clubCourtsTitle}>
            Active Club Courts at {clubName || 'Club'} ({clubCourts?.length || 0})
          </AppText>
          <AppText style={styles.clubCourtsSub}>
            Physical courts registered and active in the database for this club facility:
          </AppText>

          {(!clubCourts || clubCourts.length === 0) ? (
            <View style={styles.emptyCourtsBox}>
              <AppText style={styles.emptyCourtsText}>
                No active courts found for this club.
              </AppText>
            </View>
          ) : (
            <View style={styles.courtsGrid}>
              {clubCourts.map((court) => {
                const courtName = court.display_name || court.name;
                const surface = court.surface_type ? ` • ${court.surface_type}` : '';
                return (
                  <View key={court.id} style={styles.clubCourtPill}>
                    <View style={styles.clubCourtPillDot} />
                    <AppText style={styles.clubCourtPillText}>
                      {courtName}{surface}
                    </AppText>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </Card>

      {/* ─── Save Action ──────────────────────────────────────────────────── */}
      {canManage && (
        <View style={styles.actionContainer}>
          <Button
            label={hasSaved ? 'Configuration Saved!' : 'Save Pool Play Setup'}
            onPress={handleSave}
            variant="primary"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[8],
    gap: Spacing[4],
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    gap: Spacing[3],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionDesc: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 17,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  choiceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  choiceChipActive: {
    backgroundColor: '#F0FDFA',
    borderColor: '#0F766E',
  },
  choiceChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  choiceChipTextActive: {
    color: '#0F766E',
    fontWeight: '700',
  },
  optionsList: {
    gap: 8,
    marginTop: 4,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  optionRowActive: {
    backgroundColor: '#F0FDFA',
    borderColor: '#0F766E',
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0F766E',
  },
  optionTextContainer: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  optionTitleActive: {
    color: '#0F766E',
    fontWeight: '700',
  },
  optionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  courtsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  courtBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minWidth: 110,
    gap: 8,
  },
  courtBoxActive: {
    backgroundColor: '#F0FDFA',
    borderColor: '#0F766E',
  },
  courtName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  courtNameActive: {
    color: '#0F766E',
    fontWeight: '700',
  },
  courtIndicator: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  courtCapacityBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  counterInfo: {
    flex: 1,
    gap: 2,
  },
  counterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  counterDesc: {
    fontSize: 12,
    color: '#64748B',
  },
  stepperContainerInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  smallStepBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallStepBtnDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
    opacity: 0.5,
  },
  counterValueInline: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F766E',
    minWidth: 24,
    textAlign: 'center',
  },
  clubCourtsSection: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
  },
  clubCourtsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  clubCourtsSub: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 8,
  },
  emptyCourtsBox: {
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
  },
  emptyCourtsText: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
  },
  clubCourtPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 20,
  },
  clubCourtPillDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#0F766E',
  },
  clubCourtPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F766E',
  },
  actionContainer: {
    marginTop: Spacing[2],
  },
  // Stepper Styles
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 8,
  },
  stepperBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  stepperBtnDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
    opacity: 0.5,
  },
  stepperValueBox: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
  },
  stepperValueNum: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F766E',
    lineHeight: 30,
  },
  stepperValueLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  infoStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
  },
  infoStripText: {
    fontSize: 12,
    color: '#0369A1',
    flex: 1,
    lineHeight: 16,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
  },
  warningText: {
    fontSize: 12,
    color: '#B91C1C',
    flex: 1,
    lineHeight: 16,
  },
});

