/**
 * Aught2 Pickleball — Pool Manual Assignment Modal Component
 * Allows club staff to manually assign teams into configured pools.
 */

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { AppText } from '../AppText';
import { Button } from '../Button';
import { Card } from '../Card';
import { Colors, Radius, Spacing, Typography } from '@/theme';
import type { Pool, Team } from '@/types';

interface PoolManualAssignModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (assignments: { team_id: string; pool_id: string }[]) => Promise<void>;
  teams: Team[];
  pools: Pool[];
}

export function PoolManualAssignModal({
  visible,
  onClose,
  onSave,
  teams,
  pools,
}: PoolManualAssignModalProps) {
  // Mapping of teamId -> poolId
  const [selectedPools, setSelectedPools] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      // Prepopulate from existing pool_teams if present
      const initial: Record<string, string> = {};
      for (const p of pools) {
        for (const pt of p.pool_teams ?? []) {
          initial[pt.team_id] = p.id;
        }
      }
      setSelectedPools(initial);
      setError(null);
    }
  }, [visible, pools]);

  // Count teams per pool
  const poolCounts: Record<string, number> = {};
  for (const p of pools) poolCounts[p.id] = 0;
  for (const poolId of Object.values(selectedPools)) {
    if (poolCounts[poolId] !== undefined) poolCounts[poolId] += 1;
  }

  const assignedCount = Object.keys(selectedPools).length;

  const handleSelectPool = (teamId: string, poolId: string) => {
    setSelectedPools((prev) => ({
      ...prev,
      [teamId]: poolId,
    }));
  };

  const handleSave = async () => {
    setError(null);
    if (assignedCount < teams.length) {
      setError(`All ${teams.length} teams must be assigned to a pool (currently ${assignedCount} assigned).`);
      return;
    }

    const counts = Object.values(poolCounts);
    const minCount = Math.min(...counts);
    const maxCount = Math.max(...counts);
    if (maxCount - minCount > 1) {
      setError(`Unbalanced pools: sizes differ by ${maxCount - minCount}. Pools must differ by at most 1 team.`);
      return;
    }

    const payload = Object.entries(selectedPools).map(([team_id, pool_id]) => ({
      team_id,
      pool_id,
    }));

    try {
      setIsSaving(true);
      await onSave(payload);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to assign teams');
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
              <AppText variant="heading2">Assign Teams to Pools</AppText>
              <AppText variant="caption" color="secondary">
                {assignedCount} of {teams.length} teams assigned
              </AppText>
            </View>
            <Pressable onPress={onClose}>
              <AppText variant="body" color="tertiary">✕</AppText>
            </Pressable>
          </View>

          {/* Pool Distribution Bar */}
          <View style={styles.poolSummaryRow}>
            {pools.map((p) => (
              <View key={p.id} style={styles.poolSummaryChip}>
                <AppText variant="caption" style={styles.poolSummaryName}>{p.name}:</AppText>
                <AppText variant="caption" style={styles.poolSummaryCount}>
                  {poolCounts[p.id] ?? 0}
                </AppText>
              </View>
            ))}
          </View>

          {error && (
            <Card style={styles.errorCard}>
              <AppText variant="caption" style={styles.errorText}>{error}</AppText>
            </Card>
          )}

          <ScrollView style={styles.scrollList}>
            {teams.map((t) => {
              const currentPoolId = selectedPools[t.id];
              return (
                <View key={t.id} style={styles.teamRow}>
                  <View style={styles.teamInfoCol}>
                    <AppText variant="bodySmall" style={styles.teamName} numberOfLines={1}>
                      {t.name}
                    </AppText>
                    {t.seed ? (
                      <AppText variant="caption" color="tertiary">Seed #{t.seed}</AppText>
                    ) : null}
                  </View>

                  <View style={styles.poolSelectorRow}>
                    {pools.map((p) => {
                      const isSelected = currentPoolId === p.id;
                      return (
                        <TouchableOpacity
                          key={p.id}
                          style={[styles.poolChip, isSelected && styles.poolChipSelected]}
                          onPress={() => handleSelectPool(t.id, p.id)}
                        >
                          <AppText
                            variant="caption"
                            style={[styles.poolChipText, isSelected && styles.poolChipTextSelected]}
                          >
                            {p.name}
                          </AppText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.btnRow}>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={onClose}
              style={styles.flexOne}
            />
            <Button
              label="Save Assignments"
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
    maxHeight: '85%',
    gap: Spacing[3],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  flexOne: {
    flex: 1,
  },
  poolSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
    paddingVertical: Spacing[1],
  },
  poolSummaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.secondary,
    paddingHorizontal: Spacing[2],
    paddingVertical: Spacing[1],
    borderRadius: Radius.sm,
    gap: Spacing[1],
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  poolSummaryName: {
    fontWeight: Typography.weight.medium,
  },
  poolSummaryCount: {
    fontWeight: Typography.weight.bold,
    color: Colors.brand.primary,
  },
  errorCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: Colors.status.error,
    padding: Spacing[2],
  },
  errorText: {
    color: Colors.status.error,
  },
  scrollList: {
    maxHeight: 320,
  },
  teamRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
  },
  teamInfoCol: {
    flex: 1,
    paddingRight: Spacing[2],
  },
  teamName: {
    fontWeight: Typography.weight.medium,
  },
  poolSelectorRow: {
    flexDirection: 'row',
    gap: Spacing[1.5],
  },
  poolChip: {
    paddingHorizontal: Spacing[2.5],
    paddingVertical: Spacing[1.5],
    borderRadius: Radius.sm,
    backgroundColor: Colors.background.secondary,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  poolChipSelected: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  poolChipText: {
    color: Colors.text.secondary,
  },
  poolChipTextSelected: {
    color: Colors.text.inverse,
    fontWeight: Typography.weight.bold,
  },
  btnRow: {
    flexDirection: 'row',
    gap: Spacing[4],
    marginTop: Spacing[2],
  },
});
