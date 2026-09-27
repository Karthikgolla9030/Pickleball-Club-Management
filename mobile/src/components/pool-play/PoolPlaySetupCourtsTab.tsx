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
  Check,
  GitFork,
  LayoutGrid,
  Scale,
  SlidersHorizontal,
  Trophy,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Spacing } from '@/theme';
import type { BracketType, CourtConfig, PoolPlayConfig } from '@/types/poolPlay';
import { DEFAULT_COURTS, TOLERANCE_OPTIONS } from '@/utils/poolPlayLogic';

interface PoolPlaySetupCourtsTabProps {
  config: PoolPlayConfig;
  onSaveConfig: (updated: Partial<PoolPlayConfig>) => void;
  canManage?: boolean;
}

const BRACKET_OPTIONS: { type: BracketType; label: string; desc: string }[] = [
  {
    type: 'Single Elimination',
    label: 'Single Elimination',
    desc: 'Standard sudden-death knockout bracket for top qualifiers.',
  },
  {
    type: 'Single Elimination + Consolation',
    label: 'Single Elimination + 3rd Place Match',
    desc: 'Semifinal losers compete in a dedicated 3rd place bronze match.',
  },
  {
    type: 'Double Elimination',
    label: 'Double Elimination',
    desc: 'Winners and losers bracket where teams must lose twice to be eliminated.',
  },
];

export function PoolPlaySetupCourtsTab({
  config,
  onSaveConfig,
  canManage = true,
}: PoolPlaySetupCourtsTabProps) {
  const [numPools, setNumPools] = useState<number>(config.numPools);
  const [tolerance, setTolerance] = useState<number>(config.balanceTolerance);
  const [qualifiers, setQualifiers] = useState<number>(config.qualifierCount);
  const [bracketType, setBracketType] = useState<BracketType>(config.bracketType);
  const [selectedCourts, setSelectedCourts] = useState<CourtConfig[]>(config.courts || DEFAULT_COURTS);
  const [hasSaved, setHasSaved] = useState(false);

  const handleSave = () => {
    onSaveConfig({
      numPools,
      balanceTolerance: tolerance,
      qualifierCount: qualifiers,
      bracketType,
      courts: selectedCourts,
      numCourts: selectedCourts.length,
    });
    setHasSaved(true);
    Alert.alert(
      'Setup Saved',
      `Pool Play configuration saved: ${numPools} pools, ${qualifiers} championship qualifiers, and ${selectedCourts.length} active courts.`
    );
    setTimeout(() => setHasSaved(false), 3000);
  };

  const toggleCourt = (court: CourtConfig) => {
    if (!canManage) return;
    const exists = selectedCourts.some((c) => c.id === court.id);
    if (exists) {
      if (selectedCourts.length <= 1) {
        Alert.alert('Required Court', 'At least one court must remain assigned to the tournament.');
        return;
      }
      setSelectedCourts(selectedCourts.filter((c) => c.id !== court.id));
    } else {
      setSelectedCourts([...selectedCourts, court]);
    }
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
          Participants will be split evenly across these pools using snake seeding.
        </AppText>

        <View style={styles.chipRow}>
          {[2, 3, 4].map((n) => {
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
                {isSelected && <Check size={14} color="#0F766E" strokeWidth={2.5} />}
              </TouchableOpacity>
            );
          })}
        </View>
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

      {/* ─── 5. Court Allocation ───────────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <LayoutGrid size={17} color="#0F766E" />
          <AppText style={styles.sectionTitle}>Assigned Courts ({selectedCourts.length})</AppText>
        </View>
        <AppText style={styles.sectionDesc}>
          Select which club courts are reserved for concurrent intra-pool and championship matches.
        </AppText>

        <View style={styles.courtsGrid}>
          {DEFAULT_COURTS.map((court) => {
            const isAssigned = selectedCourts.some((c) => c.id === court.id);
            return (
              <TouchableOpacity
                key={court.id}
                onPress={() => toggleCourt(court)}
                style={[styles.courtBox, isAssigned && styles.courtBoxActive]}
                activeOpacity={0.8}
              >
                <AppText style={[styles.courtName, isAssigned && styles.courtNameActive]}>
                  {court.name}
                </AppText>
                <View style={[styles.courtIndicator, isAssigned && styles.courtIndicatorActive]}>
                  {isAssigned ? (
                    <Check size={12} color="#FFFFFF" strokeWidth={3} />
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
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
    gap: Spacing[4],
    paddingBottom: Spacing[8],
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
  courtIndicatorActive: {
    backgroundColor: '#0F766E',
    borderColor: '#0F766E',
  },
  actionContainer: {
    marginTop: Spacing[2],
  },
});
