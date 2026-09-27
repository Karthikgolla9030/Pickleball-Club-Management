/**
 * Aught2 Pickleball — SetupCourtsModal
 *
 * Modal to configure tournament courts, pool count, balance tolerance, and qualifiers.
 */

import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { ModalSheet } from '@/components/ModalSheet';
import { Colors, Radius, Spacing } from '@/theme';
import type { BracketType, PoolPlayConfig } from '@/types/poolPlay';
import { TOLERANCE_OPTIONS } from '@/utils/poolPlayLogic';

interface SetupCourtsModalProps {
  visible: boolean;
  onClose: () => void;
  config: PoolPlayConfig;
  onSaveConfig: (updated: Partial<PoolPlayConfig>) => void;
}

export function SetupCourtsModal({
  visible,
  onClose,
  config,
  onSaveConfig,
}: SetupCourtsModalProps) {
  const [numPools, setNumPools] = useState(config.numPools);
  const [tolerance, setTolerance] = useState(config.balanceTolerance);
  const [qualifiers, setQualifiers] = useState(config.qualifierCount);
  const [bracketType, setBracketType] = useState<BracketType>(config.bracketType);

  const handleSave = () => {
    onSaveConfig({
      numPools,
      balanceTolerance: tolerance,
      qualifierCount: qualifiers,
      bracketType,
    });
    onClose();
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Setup & Configuration"
      subtitle="Courts, pools, balance tolerance & bracket"
      actions={[
        { label: 'Cancel', variant: 'secondary', onPress: onClose },
        { label: 'Save Configuration', variant: 'primary', onPress: handleSave },
      ]}
    >
      <View style={styles.container}>
        {/* Number of Pools */}
        <View style={styles.section}>
          <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
            NUMBER OF POOLS
          </AppText>
          <View style={styles.chipRow}>
            {[2, 3, 4].map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => setNumPools(n)}
                style={[styles.chip, numPools === n && styles.chipActive]}
              >
                <AppText
                  variant="caption"
                  style={[styles.chipText, numPools === n && styles.chipTextActive]}
                >
                  {n} Pools
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Balance Tolerance */}
        <View style={styles.section}>
          <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
            RATING BALANCE TOLERANCE
          </AppText>
          <View style={styles.toleranceColumn}>
            {TOLERANCE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setTolerance(opt.value)}
                style={[styles.toleranceOption, tolerance === opt.value && styles.toleranceActive]}
              >
                <AppText
                  variant="bodySmall"
                  style={[
                    styles.toleranceText,
                    tolerance === opt.value && styles.toleranceTextActive,
                  ]}
                >
                  {opt.label}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Qualifiers to Championship */}
        <View style={styles.section}>
          <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
            CHAMPIONSHIP QUALIFIERS
          </AppText>
          <View style={styles.chipRow}>
            {[
              { count: 4, label: 'Top 2 (4 Teams)' },
              { count: 6, label: 'Top 3 (6 with BYEs)' },
              { count: 8, label: 'Top 4 (8 Teams)' },
            ].map((q) => (
              <TouchableOpacity
                key={q.count}
                onPress={() => setQualifiers(q.count)}
                style={[styles.chip, qualifiers === q.count && styles.chipActive]}
              >
                <AppText
                  variant="caption"
                  style={[styles.chipText, qualifiers === q.count && styles.chipTextActive]}
                >
                  {q.label}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Championship Bracket Type */}
        <View style={styles.section}>
          <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
            BRACKET FORMAT
          </AppText>
          <View style={styles.toleranceColumn}>
            {(
              [
                'Single Elimination',
                'Single Elimination + Consolation',
                'Double Elimination',
              ] as BracketType[]
            ).map((b) => (
              <TouchableOpacity
                key={b}
                onPress={() => setBracketType(b)}
                style={[styles.toleranceOption, bracketType === b && styles.toleranceActive]}
              >
                <AppText
                  variant="bodySmall"
                  style={[
                    styles.toleranceText,
                    bracketType === b && styles.toleranceTextActive,
                  ]}
                >
                  {b}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[4],
    paddingBottom: Spacing[4],
  },
  section: {
    gap: Spacing[1],
  },
  sectionLabel: {
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  chip: {
    flex: 1,
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[2],
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: '#2563EB',
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
  },
  chipText: {
    color: Colors.text.secondary,
    fontSize: 12,
  },
  chipTextActive: {
    color: '#60A5FA',
    fontWeight: '700',
  },
  toleranceColumn: {
    gap: Spacing[2],
  },
  toleranceOption: {
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  toleranceActive: {
    borderColor: '#2563EB',
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
  },
  toleranceText: {
    color: Colors.text.secondary,
    fontSize: 13,
  },
  toleranceTextActive: {
    color: '#60A5FA',
    fontWeight: '700',
  },
});
