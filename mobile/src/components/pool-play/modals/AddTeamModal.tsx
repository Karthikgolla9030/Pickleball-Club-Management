/**
 * Aught2 Pickleball — AddTeamModal
 *
 * Modal to add a custom team with two players and skill ratings.
 */

import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Input } from '@/components/Input';
import { ModalSheet } from '@/components/ModalSheet';
import { Colors, Radius, Spacing } from '@/theme';
import type { Player, Team } from '@/types/poolPlay';

interface AddTeamModalProps {
  visible: boolean;
  onClose: () => void;
  nextTeamNum: number;
  onAdd: (team: Team) => void;
}

export function AddTeamModal({
  visible,
  onClose,
  nextTeamNum,
  onAdd,
}: AddTeamModalProps) {
  const [teamName, setTeamName] = useState(`Team ${nextTeamNum}`);
  const [p1Name, setP1Name] = useState('');
  const [p1Rating, setP1Rating] = useState('4.00');
  const [p2Name, setP2Name] = useState('');
  const [p2Rating, setP2Rating] = useState('4.00');
  const [pool, setPool] = useState<'A' | 'B'>('A');
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    if (!teamName.trim()) {
      setError('Team name is required');
      return;
    }
    if (!p1Name.trim() || !p2Name.trim()) {
      setError('Both player names are required');
      return;
    }
    const r1 = parseFloat(p1Rating);
    const r2 = parseFloat(p2Rating);
    if (isNaN(r1) || r1 < 1.0 || r1 > 6.5 || isNaN(r2) || r2 < 1.0 || r2 > 6.5) {
      setError('Player ratings must be between 1.00 and 6.50');
      return;
    }

    const player1: Player = {
      id: `p-${Date.now()}-1`,
      name: p1Name.trim(),
      rating: Number(r1.toFixed(2)),
      avatar: p1Name.trim().slice(0, 2).toUpperCase(),
      color: '#1E3A8A',
    };

    const player2: Player = {
      id: `p-${Date.now()}-2`,
      name: p2Name.trim(),
      rating: Number(r2.toFixed(2)),
      avatar: p2Name.trim().slice(0, 2).toUpperCase(),
      color: '#047857',
    };

    const avgRating = Number(((r1 + r2) / 2).toFixed(2));
    const spread = Number(Math.abs(r1 - r2).toFixed(2));

    const newTeam: Team = {
      id: `team-${Date.now()}`,
      teamNum: nextTeamNum,
      name: teamName.trim(),
      p1: player1,
      p2: player2,
      pool,
      avgRating,
      spread,
    };

    onAdd(newTeam);
    onClose();
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Add Custom Team"
      subtitle="Register partner team with skill ratings"
      actions={[
        { label: 'Cancel', variant: 'secondary', onPress: onClose },
        { label: 'Add Team', variant: 'primary', onPress: handleSave },
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

        <Input
          label="Team Name *"
          value={teamName}
          onChangeText={setTeamName}
          placeholder="e.g. Team 9"
        />

        {/* Assigned Pool */}
        <View style={styles.fieldSection}>
          <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
            INITIAL POOL
          </AppText>
          <View style={styles.chipRow}>
            {(['A', 'B'] as const).map((p) => (
              <TouchableOpacity
                key={p}
                onPress={() => setPool(p)}
                style={[styles.chip, pool === p && styles.chipActive]}
              >
                <AppText
                  variant="caption"
                  style={[styles.chipText, pool === p && styles.chipTextActive]}
                >
                  Pool {p}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Player 1 */}
        <View style={styles.playerCard}>
          <AppText variant="caption" color="secondary" style={styles.playerTitle}>
            PLAYER 1
          </AppText>
          <Input
            label="Full Name *"
            value={p1Name}
            onChangeText={setP1Name}
            placeholder="e.g. Jordan Smith"
          />
          <Input
            label="Skill Rating (1.00 - 6.50) *"
            value={p1Rating}
            onChangeText={setP1Rating}
            keyboardType="decimal-pad"
            placeholder="4.00"
          />
        </View>

        {/* Player 2 */}
        <View style={styles.playerCard}>
          <AppText variant="caption" color="secondary" style={styles.playerTitle}>
            PLAYER 2
          </AppText>
          <Input
            label="Full Name *"
            value={p2Name}
            onChangeText={setP2Name}
            placeholder="e.g. Sam Taylor"
          />
          <Input
            label="Skill Rating (1.00 - 6.50) *"
            value={p2Rating}
            onChangeText={setP2Rating}
            keyboardType="decimal-pad"
            placeholder="4.00"
          />
        </View>
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
  fieldSection: {
    gap: Spacing[1],
  },
  sectionLabel: {
    fontWeight: '600',
    fontSize: 11,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  chip: {
    flex: 1,
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    alignItems: 'center',
  },
  chipActive: {
    borderColor: '#2563EB',
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
  },
  chipText: {
    color: Colors.text.secondary,
    fontSize: 13,
  },
  chipTextActive: {
    color: '#60A5FA',
    fontWeight: '700',
  },
  playerCard: {
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: Radius.lg,
    padding: Spacing[3],
    gap: Spacing[2],
  },
  playerTitle: {
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.5,
  },
});
