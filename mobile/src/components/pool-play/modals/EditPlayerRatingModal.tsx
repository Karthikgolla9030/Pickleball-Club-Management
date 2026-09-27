/**
 * Aught2 Pickleball — EditPlayerRatingModal
 *
 * Modal to adjust a player's individual skill rating and trigger live recalculation.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Input } from '@/components/Input';
import { ModalSheet } from '@/components/ModalSheet';
import { Colors, Radius, Spacing } from '@/theme';
import type { Player } from '@/types/poolPlay';

interface EditPlayerRatingModalProps {
  visible: boolean;
  onClose: () => void;
  player: Player | null;
  teamName?: string;
  onSave: (newRating: number) => void;
}

export function EditPlayerRatingModal({
  visible,
  onClose,
  player,
  teamName,
  onSave,
}: EditPlayerRatingModalProps) {
  const [ratingStr, setRatingStr] = useState('4.00');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && player) {
      setRatingStr(player.rating.toFixed(2));
      setError(null);
    }
  }, [visible, player]);

  if (!player) return null;

  const handleSave = () => {
    const val = parseFloat(ratingStr);
    if (isNaN(val) || val < 1.0 || val > 6.5) {
      setError('Rating must be between 1.00 and 6.50');
      return;
    }
    onSave(Number(val.toFixed(2)));
    onClose();
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Edit Player Rating"
      subtitle={`${player.name} • ${teamName || ''}`}
      actions={[
        { label: 'Cancel', variant: 'secondary', onPress: onClose },
        { label: 'Update Rating', variant: 'primary', onPress: handleSave },
      ]}
    >
      <View style={styles.container}>
        {error && (
          <View style={styles.errorBanner}>
            <AppText variant="caption" style={styles.errorText}>
              {error}
            </AppText>
          </View>
        )}

        <View style={styles.infoCard}>
          <AppText variant="caption" color="secondary">
            Current Skill Level
          </AppText>
          <AppText variant="heading2" style={styles.currentRating}>
            {player.rating.toFixed(2)}
          </AppText>
          <AppText variant="caption" color="tertiary">
            Pickleball ratings typically range from 2.00 (Beginner) to 5.50+ (Pro).
          </AppText>
        </View>

        <Input
          label="New Skill Rating (1.00 - 6.50) *"
          value={ratingStr}
          onChangeText={setRatingStr}
          keyboardType="decimal-pad"
          placeholder="e.g. 4.79"
          hint="Changing rating updates team avg and pool balance instantly."
        />
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[3],
    paddingBottom: Spacing[4],
  },
  errorBanner: {
    backgroundColor: Colors.status.errorBg,
    borderColor: Colors.status.error,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing[2],
  },
  errorText: {
    color: Colors.status.error,
    fontSize: 12,
  },
  infoCard: {
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: Radius.lg,
    padding: Spacing[3],
    alignItems: 'center',
    gap: Spacing[1],
  },
  currentRating: {
    color: '#3B82F6',
    fontWeight: '800',
    fontSize: 28,
  },
});
