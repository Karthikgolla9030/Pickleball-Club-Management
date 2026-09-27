/**
 * Aught2 Pickleball — Pool Configuration Modal Component
 * Allows club staff to configure pool count and qualifiers per pool.
 */

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../AppText';
import { Button } from '../Button';
import { Card } from '../Card';
import { Input } from '../Input';
import { Colors, Radius, Spacing } from '@/theme';
import type { PoolConfigureRequest } from '@/types';

interface PoolConfigureModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (payload: PoolConfigureRequest) => Promise<void>;
  teamsCount: number;
  initialNumPools?: number;
  initialQualifiers?: number;
}

export function PoolConfigureModal({
  visible,
  onClose,
  onSave,
  teamsCount,
  initialNumPools = 2,
  initialQualifiers = 1,
}: PoolConfigureModalProps) {
  const [numPools, setNumPools] = useState(String(initialNumPools));
  const [qualifiers, setQualifiers] = useState(String(initialQualifiers));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setNumPools(String(initialNumPools || 2));
      setQualifiers(String(initialQualifiers || 1));
      setError(null);
    }
  }, [visible, initialNumPools, initialQualifiers]);

  const pCount = parseInt(numPools, 10);
  const qCount = parseInt(qualifiers, 10);

  // Derived calculations
  let previewText = '';
  if (!isNaN(pCount) && pCount >= 2) {
    if (teamsCount > 0) {
      const minPoolSize = Math.floor(teamsCount / pCount);
      const maxPoolSize = Math.ceil(teamsCount / pCount);
      const poolDiff = maxPoolSize - minPoolSize;
      const totalQualifiers = pCount * (isNaN(qCount) ? 1 : qCount);

      if (minPoolSize < 2) {
        previewText = `⚠️ At least 2 teams per pool required. With ${teamsCount} teams, max pools is ${Math.floor(teamsCount / 2)}.`;
      } else if (poolDiff > 1) {
        previewText = `⚠️ Unbalanced pools: pool sizes differ by ${poolDiff} (max allowed is 1).`;
      } else if (!isNaN(qCount) && qCount > minPoolSize) {
        previewText = `⚠️ Qualifiers per pool (${qCount}) cannot exceed min pool size (${minPoolSize}).`;
      } else {
        previewText = `✓ ${pCount} pools (${minPoolSize === maxPoolSize ? `${minPoolSize} teams each` : `${minPoolSize}–${maxPoolSize} teams`}). Top ${qCount} qualify → ${totalQualifiers} teams in Championship bracket.`;
      }
    } else {
      previewText = `Configure ${pCount} pools with top ${qCount || 1} qualifying per pool.`;
    }
  }

  const handleSave = async () => {
    setError(null);
    if (isNaN(pCount) || pCount < 2) {
      setError('Number of pools must be at least 2.');
      return;
    }
    if (isNaN(qCount) || qCount < 1) {
      setError('Qualifiers per pool must be at least 1.');
      return;
    }
    if (teamsCount > 0) {
      const minPoolSize = Math.floor(teamsCount / pCount);
      if (minPoolSize < 2) {
        setError(`Cannot configure ${pCount} pools for ${teamsCount} teams. Each pool requires at least 2 teams.`);
        return;
      }
      if (qCount > minPoolSize) {
        setError(`Qualifiers per pool (${qCount}) cannot exceed min pool size (${minPoolSize}).`);
        return;
      }
    }

    try {
      setIsSaving(true);
      await onSave({
        number_of_pools: pCount,
        qualifiers_per_pool: qCount,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to configure pools');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.flexOne}>
              <AppText variant="heading2">Configure Pool Play</AppText>
              <AppText variant="caption" color="secondary">
                {teamsCount} {teamsCount === 1 ? 'team' : 'teams'} registered
              </AppText>
            </View>
            <Pressable onPress={onClose}>
              <AppText variant="body" color="tertiary">✕</AppText>
            </Pressable>
          </View>

          {error && (
            <Card style={styles.errorCard}>
              <AppText variant="caption" style={styles.errorText}>{error}</AppText>
            </Card>
          )}

          <Input
            label="Number of Pools"
            placeholder="e.g. 2, 4"
            value={numPools}
            onChangeText={setNumPools}
            keyboardType="number-pad"
            hint="Minimum 2 pools. Each pool must have at least 2 teams."
          />

          <Input
            label="Qualifiers per Pool"
            placeholder="e.g. 1, 2"
            value={qualifiers}
            onChangeText={setQualifiers}
            keyboardType="number-pad"
            hint="Number of top teams from each pool advancing to Championship."
          />

          {previewText ? (
            <View style={styles.previewBox}>
              <AppText variant="caption" color="secondary">
                {previewText}
              </AppText>
            </View>
          ) : null}

          <View style={styles.btnRow}>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={onClose}
              style={styles.flexOne}
            />
            <Button
              label="Save Configuration"
              variant="primary"
              loading={isSaving}
              onPress={handleSave}
              style={styles.flexOne}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background.primary,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: Spacing[6],
    gap: Spacing[4],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  flexOne: {
    flex: 1,
  },
  errorCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: Colors.status.error,
    padding: Spacing[2],
  },
  errorText: {
    color: Colors.status.error,
  },
  previewBox: {
    padding: Spacing[2.5],
    backgroundColor: Colors.background.secondary,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  btnRow: {
    flexDirection: 'row',
    gap: Spacing[4],
    marginTop: Spacing[2],
  },
});
