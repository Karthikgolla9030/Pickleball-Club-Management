/**
 * Aught2 Pickleball — SwapPlayersModal
 *
 * Modal to swap a player partner with another team's player.
 */

import React, { useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { ModalSheet } from '@/components/ModalSheet';
import { Colors, Radius, Spacing } from '@/theme';
import type { Player, Team } from '@/types/poolPlay';

interface SwapPlayersModalProps {
  visible: boolean;
  onClose: () => void;
  sourceTeam: Team | null;
  sourceSlot: 'p1' | 'p2' | null;
  teams: Team[];
  onSwap: (
    sourceTeamId: string,
    sourceSlot: 'p1' | 'p2',
    targetTeamId: string,
    targetSlot: 'p1' | 'p2'
  ) => void;
}

export function SwapPlayersModal({
  visible,
  onClose,
  sourceTeam,
  sourceSlot,
  teams,
  onSwap,
}: SwapPlayersModalProps) {
  const [selectedTarget, setSelectedTarget] = useState<{
    teamId: string;
    slot: 'p1' | 'p2';
  } | null>(null);

  if (!sourceTeam || !sourceSlot) return null;

  const sourcePlayer: Player = sourceSlot === 'p1' ? sourceTeam.p1 : sourceTeam.p2;
  const eligibleTeams = teams.filter((t) => t.id !== sourceTeam.id);

  const handleConfirm = () => {
    if (!selectedTarget) return;
    onSwap(sourceTeam.id, sourceSlot, selectedTarget.teamId, selectedTarget.slot);
    onClose();
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Swap Partner"
      subtitle={`Swapping ${sourcePlayer.name} (${sourceTeam.name})`}
      actions={[
        { label: 'Cancel', variant: 'secondary', onPress: onClose },
        {
          label: 'Confirm Swap',
          variant: 'primary',
          onPress: handleConfirm,
          disabled: !selectedTarget,
        },
      ]}
    >
      <View style={styles.container}>
        <View style={styles.sourceBanner}>
          <AppText variant="caption" color="secondary">
            SELECTED PLAYER TO SWAP:
          </AppText>
          <View style={styles.sourceRow}>
            <AppText variant="body" bold style={styles.sourceName}>
              {sourcePlayer.name}
            </AppText>
            <Badge label={`Rating ${sourcePlayer.rating.toFixed(2)}`} variant="info" />
          </View>
        </View>

        <AppText variant="caption" color="secondary" style={styles.listHeader}>
          SELECT TARGET PLAYER TO SWAP WITH:
        </AppText>

        <ScrollView style={styles.scrollList} showsVerticalScrollIndicator={false}>
          {eligibleTeams.map((t) => {
            const isP1Selected =
              selectedTarget?.teamId === t.id && selectedTarget?.slot === 'p1';
            const isP2Selected =
              selectedTarget?.teamId === t.id && selectedTarget?.slot === 'p2';

            return (
              <View key={t.id} style={styles.targetTeamCard}>
                <View style={styles.targetHeader}>
                  <AppText variant="caption" bold style={styles.targetTeamTitle}>
                    {t.name} (Pool {t.pool})
                  </AppText>
                  <AppText variant="caption" color="tertiary">
                    Avg {t.avgRating.toFixed(2)}
                  </AppText>
                </View>

                {/* Player 1 Option */}
                <TouchableOpacity
                  onPress={() => setSelectedTarget({ teamId: t.id, slot: 'p1' })}
                  style={[styles.playerOption, isP1Selected && styles.playerOptionSelected]}
                >
                  <AppText
                    variant="bodySmall"
                    style={[styles.optionText, isP1Selected && styles.optionTextSelected]}
                  >
                    {t.p1.name}
                  </AppText>
                  <Badge
                    label={`${t.p1.rating.toFixed(2)}`}
                    variant={isP1Selected ? 'info' : 'default'}
                  />
                </TouchableOpacity>

                {/* Player 2 Option */}
                <TouchableOpacity
                  onPress={() => setSelectedTarget({ teamId: t.id, slot: 'p2' })}
                  style={[styles.playerOption, isP2Selected && styles.playerOptionSelected]}
                >
                  <AppText
                    variant="bodySmall"
                    style={[styles.optionText, isP2Selected && styles.optionTextSelected]}
                  >
                    {t.p2.name}
                  </AppText>
                  <Badge
                    label={`${t.p2.rating.toFixed(2)}`}
                    variant={isP2Selected ? 'info' : 'default'}
                  />
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[3],
    maxHeight: 480,
    paddingBottom: Spacing[4],
  },
  sourceBanner: {
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: '#2563EB',
    borderRadius: Radius.md,
    padding: Spacing[3],
    gap: Spacing[1],
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sourceName: {
    color: Colors.text.primary,
    fontSize: 16,
  },
  listHeader: {
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  scrollList: {
    maxHeight: 320,
  },
  targetTeamCard: {
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: Radius.md,
    padding: Spacing[2],
    marginBottom: Spacing[2],
    gap: Spacing[1],
  },
  targetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[1],
    marginBottom: Spacing[1],
  },
  targetTeamTitle: {
    color: Colors.text.primary,
  },
  playerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: Radius.sm,
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    marginVertical: 2,
  },
  playerOptionSelected: {
    borderColor: '#2563EB',
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
  },
  optionText: {
    color: Colors.text.secondary,
  },
  optionTextSelected: {
    color: '#60A5FA',
    fontWeight: '700',
  },
});
