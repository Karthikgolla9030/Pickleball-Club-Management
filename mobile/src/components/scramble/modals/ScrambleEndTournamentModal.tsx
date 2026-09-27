/**
 * Aught2 Pickleball — ScrambleEndTournamentModal
 *
 * Confirmation modal before finalizing a Scramble tournament:
 * - Summarizes completed rounds and games
 * - Identifies the winning champion
 * - Explicit finalization trigger
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertCircle, Trophy } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ModalSheet } from '@/components/ModalSheet';
import { Colors, Radius, Spacing } from '@/theme';
import type { ScrambleState } from '@/types/scramble';

interface ScrambleEndTournamentModalProps {
  visible: boolean;
  onClose: () => void;
  state: ScrambleState | null;
  onConfirm: () => Promise<void>;
  isEnding?: boolean;
}

export function ScrambleEndTournamentModal({
  visible,
  onClose,
  state,
  onConfirm,
  isEnding = false,
}: ScrambleEndTournamentModalProps) {
  const leaderName = state?.current_leader || 'TBD';

  return (
    <ModalSheet visible={visible} onClose={onClose} title="End Tournament">
      <View style={styles.content}>
        <View style={styles.warningBox}>
          <AlertCircle size={20} color={Colors.status.error} />
          <View style={{ flex: 1 }}>
            <AppText variant="body" style={styles.warningTitle}>
              Conclude Scramble Competition?
            </AppText>
            <AppText variant="bodySmall" style={styles.warningText}>
              This will officially close the tournament and finalize individual standings. No further rounds can be started.
            </AppText>
          </View>
        </View>

        {/* Champion Preview */}
        <View style={styles.championBox}>
          <Trophy size={24} color={Colors.brand.accent} />
          <View style={{ flex: 1 }}>
            <AppText variant="caption" style={styles.championLabel}>
              PROJECTED TOURNAMENT CHAMPION
            </AppText>
            <AppText variant="heading2" style={styles.championName}>
              {leaderName}
            </AppText>
          </View>
        </View>

        {/* Stats Summary */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <AppText variant="caption" style={styles.summaryLabel}>
              ROUNDS PLAYED
            </AppText>
            <AppText variant="body" style={styles.summaryValue}>
              {state?.current_round ?? 1}
            </AppText>
          </View>

          <View style={styles.summaryItem}>
            <AppText variant="caption" style={styles.summaryLabel}>
              GAMES COMPLETED
            </AppText>
            <AppText variant="body" style={styles.summaryValue}>
              {state?.games_completed ?? 0} of {state?.total_games ?? 0}
            </AppText>
          </View>
        </View>

        <View style={styles.actions}>
          <Button
            label="Cancel"
            variant="outline"
            onPress={onClose}
            disabled={isEnding}
            style={styles.actionBtn}
          />
          <Button
            label={isEnding ? 'Ending...' : 'End Tournament'}
            variant="danger"
            onPress={onConfirm}
            loading={isEnding}
            disabled={isEnding}
            style={styles.actionBtn}
          />
        </View>
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing[4],
    paddingTop: Spacing[1],
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    padding: Spacing[2],
    borderRadius: Radius.md,
    backgroundColor: Colors.status.errorBg,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  warningTitle: {
    color: Colors.status.error,
    fontWeight: '700',
    marginBottom: 2,
  },
  warningText: {
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  championBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    padding: Spacing[4],
    borderRadius: Radius.md,
    backgroundColor: 'rgba(245, 166, 35, 0.12)',
    borderWidth: 1,
    borderColor: Colors.brand.accent,
  },
  championLabel: {
    color: Colors.brand.accent,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  championName: {
    color: Colors.text.primary,
    fontWeight: '800',
    marginTop: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  summaryItem: {
    flex: 1,
    padding: Spacing[2],
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    alignItems: 'center',
  },
  summaryLabel: {
    color: Colors.text.tertiary,
    fontWeight: '600',
  },
  summaryValue: {
    color: Colors.text.primary,
    fontWeight: '700',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing[2],
    marginTop: Spacing[1],
  },
  actionBtn: {
    flex: 1,
  },
});
