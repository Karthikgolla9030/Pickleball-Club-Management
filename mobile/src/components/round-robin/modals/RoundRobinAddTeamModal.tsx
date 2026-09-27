/**
 * Aught2 Pickleball — RoundRobinAddTeamModal
 *
 * Modal to create a new fixed-partner team for a Round Robin tournament:
 * - Team name
 * - Optional Seed
 * - Player 1 & Player 2 selection from registered club players
 * - Submits CreateTeamPayload to backend
 */

import React, { useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { User } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { ModalSheet } from '@/components/ModalSheet';
import { Colors, Radius, Spacing } from '@/theme';
import type { CreateTeamPayload, TournamentRegistrationItem } from '@/types';

interface RoundRobinAddTeamModalProps {
  visible: boolean;
  onClose: () => void;
  nextTeamIndex: number;
  registrations: TournamentRegistrationItem[];
  usedPlayerMembershipIds: Set<string>;
  onCreateTeam: (payload: CreateTeamPayload) => Promise<void>;
  isCreating?: boolean;
  teamSize?: number;
}

export function RoundRobinAddTeamModal({
  visible,
  onClose,
  nextTeamIndex,
  registrations,
  usedPlayerMembershipIds,
  onCreateTeam,
  isCreating = false,
  teamSize = 2,
}: RoundRobinAddTeamModalProps) {
  const [teamName, setTeamName] = useState(
    teamSize === 1 ? `Player ${nextTeamIndex}` : `Team ${nextTeamIndex}`
  );
  const [seed, setSeed] = useState<string>('');
  const [player1Id, setPlayer1Id] = useState<string | null>(null);
  const [player2Id, setPlayer2Id] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Available confirmed players not yet assigned to a team
  const availablePlayers = registrations.filter(
    (r) => r.status === 'confirmed' && !usedPlayerMembershipIds.has(r.player_membership_id)
  );

  const handleSelectPlayer = (membershipId: string) => {
    setError(null);
    if (teamSize === 1) {
      if (player1Id === membershipId) {
        setPlayer1Id(null);
      } else {
        setPlayer1Id(membershipId);
        const player = registrations.find((r) => r.player_membership_id === membershipId);
        const name = player?.display_name ?? player?.user_full_name;
        if (name && (teamName.startsWith('Player ') || teamName.startsWith('Team '))) {
          setTeamName(name);
        }
      }
      return;
    }

    if (player1Id === membershipId) {
      setPlayer1Id(null);
    } else if (player2Id === membershipId) {
      setPlayer2Id(null);
    } else if (!player1Id) {
      setPlayer1Id(membershipId);
    } else if (!player2Id) {
      setPlayer2Id(membershipId);
    } else {
      // Both selected, replace player 2
      setPlayer2Id(membershipId);
    }
  };

  const handleSubmit = async () => {
    if (!teamName.trim()) {
      setError(teamSize === 1 ? 'Player or entry name is required' : 'Team name is required');
      return;
    }

    if (teamSize === 1) {
      if (!player1Id) {
        setError('Please select 1 player for this entry');
        return;
      }
    } else {
      if (!player1Id || !player2Id) {
        setError('Please select exactly 2 players for this team');
        return;
      }

      if (player1Id === player2Id) {
        setError('Player 1 and Player 2 must be different players');
        return;
      }
    }

    const payload: CreateTeamPayload = {
      name: teamName.trim(),
      seed: seed ? parseInt(seed, 10) : undefined,
      player_membership_ids: teamSize === 1 ? [player1Id] : [player1Id, player2Id!],
    };

    try {
      await onCreateTeam(payload);
      onClose();
      // Reset form
      setTeamName(teamSize === 1 ? `Player ${nextTeamIndex + 1}` : `Team ${nextTeamIndex + 1}`);
      setSeed('');
      setPlayer1Id(null);
      setPlayer2Id(null);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
    }
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={teamSize === 1 ? 'Add Singles Player' : 'Add Round Robin Team'}
      subtitle={
        teamSize === 1
          ? 'Assign 1 registered player to form a singles entry.'
          : 'Assign 2 registered players to form a fixed-partner team.'
      }
    >
      <View style={styles.container}>
        {error && (
          <View style={styles.errorBox}>
            <AppText variant="caption" style={{ color: Colors.status.error }}>
              {error}
            </AppText>
          </View>
        )}

        <View style={styles.inputsRow}>
          <View style={{ flex: 2 }}>
            <Input
              label={teamSize === 1 ? 'Player / Entry Name *' : 'Team Name *'}
              value={teamName}
              onChangeText={setTeamName}
              placeholder={teamSize === 1 ? 'e.g. John Doe' : 'e.g. Thunder Smashers'}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="Seed (Optional)"
              value={seed}
              onChangeText={setSeed}
              placeholder="e.g. 1"
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* Selected Players Summary */}
        <View style={styles.selectedSection}>
          <AppText variant="label" color="secondary">
            Selected Players ({[player1Id, teamSize === 1 ? null : player2Id].filter(Boolean).length} / {teamSize}):
          </AppText>
          <View style={styles.selectedRow}>
            <View style={[styles.slotCard, player1Id && styles.slotCardFilled]}>
              <AppText variant="caption" color="secondary">
                {teamSize === 1 ? 'Player' : 'Partner 1'}
              </AppText>
              <AppText variant="bodySmall" numberOfLines={1} style={styles.slotName}>
                {registrations.find((r) => r.player_membership_id === player1Id)?.display_name ??
                  registrations.find((r) => r.player_membership_id === player1Id)?.user_full_name ??
                  'Not Selected'}
              </AppText>
            </View>

            {teamSize > 1 && (
              <View style={[styles.slotCard, player2Id && styles.slotCardFilled]}>
                <AppText variant="caption" color="secondary">
                  Partner 2
                </AppText>
                <AppText variant="bodySmall" numberOfLines={1} style={styles.slotName}>
                  {registrations.find((r) => r.player_membership_id === player2Id)?.display_name ??
                    registrations.find((r) => r.player_membership_id === player2Id)?.user_full_name ??
                    'Not Selected'}
                </AppText>
              </View>
            )}
          </View>
        </View>

        {/* Available Registered Players List */}
        <View style={styles.playersListSection}>
          <AppText variant="label" color="secondary" style={{ marginBottom: Spacing[2] }}>
            Available Confirmed Registrations ({availablePlayers.length}):
          </AppText>

          {availablePlayers.length === 0 ? (
            <View style={styles.noPlayersBox}>
              <AppText variant="caption" color="secondary" style={{ textAlign: 'center' }}>
                No available confirmed registrations found. Players must register and be confirmed before being assigned to a team.
              </AppText>
            </View>
          ) : (
            <ScrollView style={styles.playersScroll} nestedScrollEnabled>
              {availablePlayers.map((player) => {
                const isP1 = player1Id === player.player_membership_id;
                const isP2 = player2Id === player.player_membership_id;
                const isSelected = isP1 || isP2;

                return (
                  <TouchableOpacity
                    key={player.id}
                    onPress={() => handleSelectPlayer(player.player_membership_id)}
                    style={[styles.playerItem, isSelected && styles.playerItemSelected]}
                  >
                    <View style={styles.playerItemLeft}>
                      <View style={[styles.avatarCircle, isSelected && styles.avatarCircleSelected]}>
                        <User size={14} color={isSelected ? Colors.white : Colors.text.secondary} />
                      </View>
                      <View>
                        <AppText variant="bodySmall" style={styles.playerNameText}>
                          {player.display_name ?? player.user_full_name ?? player.user_email}
                        </AppText>
                        <AppText variant="caption" color="secondary">
                          {player.membership_number ? `Member #${player.membership_number}` : player.user_email}
                        </AppText>
                      </View>
                    </View>

                    {isSelected ? (
                      <Badge
                        label={teamSize === 1 ? 'Selected' : isP1 ? 'Partner 1' : 'Partner 2'}
                        variant="success"
                      />
                    ) : (
                      <AppText variant="caption" style={{ color: Colors.brand.primary }}>
                        + Select
                      </AppText>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          <Button
            label="Cancel"
            variant="outline"
            size="md"
            onPress={onClose}
            style={{ flex: 1 }}
          />
          <Button
            label={isCreating ? 'Creating...' : 'Create Team'}
            variant="primary"
            size="md"
            disabled={!player1Id || !player2Id || !teamName.trim() || isCreating}
            loading={isCreating}
            onPress={handleSubmit}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing[4],
    gap: Spacing[3],
    maxHeight: 560,
  },
  header: {
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing[1],
  },
  errorBox: {
    padding: Spacing[2],
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  inputsRow: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  selectedSection: {
    gap: Spacing[1],
  },
  selectedRow: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  slotCard: {
    flex: 1,
    padding: Spacing[2],
    borderRadius: Radius.md,
    backgroundColor: Colors.background.tertiary,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  slotCardFilled: {
    borderColor: Colors.brand.primary,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  slotName: {
    color: Colors.text.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  playersListSection: {
    flex: 1,
  },
  playersScroll: {
    maxHeight: 180,
  },
  noPlayersBox: {
    padding: Spacing[4],
    backgroundColor: Colors.background.secondary,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  playerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: Colors.background.secondary,
    marginBottom: Spacing[1],
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  playerItemSelected: {
    borderColor: Colors.status.success,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  playerItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    flex: 1,
  },
  avatarCircle: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: Colors.background.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircleSelected: {
    backgroundColor: Colors.status.success,
  },
  playerNameText: {
    color: Colors.text.primary,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing[3],
    marginTop: Spacing[2],
  },
});
