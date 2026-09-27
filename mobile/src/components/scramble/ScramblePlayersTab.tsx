/**
 * Aught2 Pickleball — ScramblePlayersTab
 *
 * Tab 2 for Scramble Tournament Workspace:
 * Screen 2 exact match:
 * - Header: Round {N} Availability, "X of Y players selected", "Select All", "Clear"
 * - Search bar with magnifying glass "Search players..."
 * - Empty state: Pale circular Users icon, "No confirmed player registrations found", description
 * - Info panel: 4/5-player court partition explanation & validation
 * - Bottom action area: Save Availability & Create Matchups buttons with footnote
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Info,
  Search,
  Sparkles,
  Users,
} from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Radius, Spacing } from '@/theme';
import type { ScrambleState } from '@/types/scramble';
import type { Tournament, TournamentRegistrationItem } from '@/types';
import { validateCourtPartition } from '@/utils/scrambleLogic';

interface ScramblePlayersTabProps {
  state: ScrambleState | null;
  tournament?: Tournament | null;
  registrations: TournamentRegistrationItem[];
  canManage: boolean;
  onSaveAvailability: (playerIds: string[]) => Promise<void>;
  onCreateMatchups: () => Promise<void>;
  onCloseRegistration?: () => Promise<void>;
  isSavingAvailability?: boolean;
  isCreatingMatchups?: boolean;
  isClosingRegistration?: boolean;
}

export function ScramblePlayersTab({
  state,
  tournament,
  registrations,
  canManage,
  onSaveAvailability,
  onCreateMatchups,
  onCloseRegistration,
  isSavingAvailability = false,
  isCreatingMatchups = false,
  isClosingRegistration = false,
}: ScramblePlayersTabProps) {
  // Sort confirmed registrations descending by skill_rating:
  // Primary: skill_rating DESC
  // Secondary: seed ASC (if already seeded)
  // Tertiary: registered_at ASC
  // Quaternary: player_membership_id
  const confirmedPlayers = useMemo(() => {
    const list = registrations.filter(
      (r) => r.status === 'confirmed' && r.player_membership_id,
    );
    return list.slice().sort((a, b) => {
      const ratingA = a.skill_rating != null ? Number(a.skill_rating) : 3.5;
      const ratingB = b.skill_rating != null ? Number(b.skill_rating) : 3.5;
      if (ratingB !== ratingA) {
        return ratingB - ratingA;
      }
      if (a.seed != null && b.seed != null && a.seed !== b.seed) {
        return a.seed - b.seed;
      }
      const timeA = new Date(a.registered_at || 0).getTime();
      const timeB = new Date(b.registered_at || 0).getTime();
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      return a.player_membership_id.localeCompare(b.player_membership_id);
    });
  }, [registrations]);

  const currentRound = state?.current_round ?? 1;
  const isRegistrationOpen = tournament?.status === 'registration_open' || state?.tournament_status === 'registration_open';
  const categoryName = (tournament?.format_configuration as any)?.category || (tournament as any)?.category || 'Doubles';

  // Initialize selected IDs from state or default to all confirmed
  const initialSelected = useMemo(() => {
    if (state?.available_player_ids && state.available_player_ids.length > 0) {
      return state.available_player_ids;
    }
    return confirmedPlayers.map((r) => r.player_membership_id);
  }, [state?.available_player_ids, confirmedPlayers]);

  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelected);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    if (state?.available_player_ids) {
      setSelectedIds(state.available_player_ids);
      setHasUnsavedChanges(false);
    }
  }, [state?.available_player_ids]);

  const togglePlayer = (id: string) => {
    if (!canManage) return;
    setHasUnsavedChanges(true);
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const handleSelectAll = () => {
    if (!canManage) return;
    setHasUnsavedChanges(true);
    setSelectedIds(confirmedPlayers.map((r) => r.player_membership_id));
  };

  const handleClearAll = () => {
    if (!canManage) return;
    setHasUnsavedChanges(true);
    setSelectedIds([]);
  };

  // Filter confirmed players by search
  const filteredPlayers = useMemo(() => {
    if (!searchQuery.trim()) return confirmedPlayers;
    const q = searchQuery.toLowerCase().trim();
    return confirmedPlayers.filter((p) => {
      const name = p.display_name || p.user_full_name || '';
      return name.toLowerCase().includes(q);
    });
  }, [confirmedPlayers, searchQuery]);

  const isMixed = categoryName === 'Mixed Scramble';
  const partition = validateCourtPartition(selectedIds.length, isMixed);
  const canCreateMatchups =
    canManage &&
    partition.isValid &&
    !isRegistrationOpen &&
    (state?.round_status === 'setup' || state?.round_status === 'matchups_created');

  const handleSave = async () => {
    if (!canManage) return;
    await onSaveAvailability(selectedIds);
    setHasUnsavedChanges(false);
  };

  const handleGenerate = async () => {
    if (!canCreateMatchups) return;
    if (hasUnsavedChanges) {
      await onSaveAvailability(selectedIds);
      setHasUnsavedChanges(false);
    }
    await onCreateMatchups();
  };

  return (
    <View style={styles.container}>
      {/* ── 0. Registration Open Notice Banner ── */}
      {isRegistrationOpen && (
        <View style={styles.regOpenBanner}>
          <Info size={18} color="#08785E" />
          <View style={{ flex: 1 }}>
            <AppText style={styles.regOpenTitle}>Registration Still Open</AppText>
            <AppText style={styles.regOpenText}>
              Registration is open. Players are sorted below by skill rating. Close registration to lock the roster and finalize seed rankings.
            </AppText>
            {canManage && onCloseRegistration && (
              <TouchableOpacity
                style={styles.closeRegSmallBtn}
                onPress={onCloseRegistration}
                disabled={isClosingRegistration}
                activeOpacity={0.8}
              >
                {isClosingRegistration ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <AppText style={styles.closeRegSmallBtnText}>Close Registration Now</AppText>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* ── 1. Header: Round Availability & Quick Select ── */}
      <View style={styles.headerRow}>
        <View>
          <AppText style={styles.headingTitle}>
            Round {currentRound}{state?.planned_rounds ? ` of ${state.planned_rounds}` : ''} Availability & Check-in
          </AppText>
          <AppText style={styles.headingSubtitle}>
            {selectedIds.length} of {confirmedPlayers.length} players available • Carried forward automatically
          </AppText>
        </View>

        {canManage && confirmedPlayers.length > 0 && (
          <View style={styles.quickLinksRow}>
            <TouchableOpacity onPress={handleSelectAll} activeOpacity={0.7}>
              <AppText style={styles.quickLinkText}>Select All</AppText>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleClearAll} activeOpacity={0.7}>
              <AppText style={styles.quickLinkText}>Clear</AppText>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── 2. Search Input ── */}
      <View style={styles.searchBar}>
        <Search size={18} color="#A3ADB8" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search players..."
          placeholderTextColor="#71817E"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* ── 3. Player List or Empty State ── */}
      {confirmedPlayers.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <Users size={32} color="#71817E" />
          </View>
          <AppText style={styles.emptyTitle}>
            No confirmed player registrations found
          </AppText>
          <AppText style={styles.emptyDescription}>
            Players will appear here once they register for this tournament. Then you can select
            which players are available for Round {currentRound}.
          </AppText>
        </View>
      ) : filteredPlayers.length === 0 ? (
        <View style={styles.emptyCard}>
          <AppText style={styles.emptyTitle}>No matching players</AppText>
          <AppText style={styles.emptyDescription}>
            No confirmed players matched "{searchQuery}".
          </AppText>
        </View>
      ) : (
        <View style={styles.listContent}>
          {filteredPlayers.map((item, index) => {
            const isSelected = selectedIds.includes(item.player_membership_id);
            const playerName =
              item.display_name || item.user_full_name || 'Confirmed Player';
            const ratingValue = (item.skill_rating != null ? Number(item.skill_rating) : 3.5).toFixed(1);
            const seedNumber = item.seed ?? (index + 1);

            return (
              <TouchableOpacity
                key={item.player_membership_id}
                style={[styles.playerRow, isSelected && styles.playerRowSelected]}
                onPress={() => togglePlayer(item.player_membership_id)}
                activeOpacity={0.7}
                disabled={!canManage}
              >
                {/* Checkbox */}
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                </View>

                {/* Player Details */}
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <View style={styles.seedBadge}>
                      <AppText style={styles.seedBadgeText}>#{seedNumber}</AppText>
                    </View>
                    <AppText style={styles.playerName} numberOfLines={1}>{playerName}</AppText>
                  </View>

                  <View style={styles.playerMetaRow}>
                    <View style={styles.ratingBadge}>
                      <AppText style={styles.ratingBadgeText}>★ {ratingValue}</AppText>
                    </View>
                    {item.membership_number && (
                      <AppText style={styles.playerMeta}>
                        Member #{item.membership_number}
                      </AppText>
                    )}
                    <View style={styles.categoryBadge}>
                      <AppText style={styles.categoryBadgeText}>{categoryName}</AppText>
                    </View>
                  </View>
                </View>

                {/* Status indicator */}
                <View style={[styles.availableBadge, !isSelected && styles.unavailableBadge]}>
                  <AppText style={[styles.availableBadgeText, !isSelected && styles.unavailableBadgeText]}>
                    {isSelected ? 'AVAILABLE' : 'BENCH'}
                  </AppText>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── 4. Court Partition Information Panel ── */}
      {selectedIds.length > 0 && !partition.isValid ? (
        // Soft red warning panel for invalid counts
        <View style={styles.invalidPanel}>
          <AlertCircle size={20} color="#DC2626" />
          <View style={{ flex: 1 }}>
            <AppText style={styles.invalidPanelTitle}>Invalid Player Count</AppText>
            <AppText style={styles.invalidPanelDescription}>
              {partition.description}. (Counts like 6, 7, 11 cannot be divided into 4 and 5 player courts.)
            </AppText>
          </View>
        </View>
      ) : selectedIds.length > 0 && partition.isValid ? (
        // Positive partition summary panel
        <View style={styles.validPanel}>
          <CheckCircle2 size={20} color="#08785E" />
          <View style={{ flex: 1 }}>
            <AppText style={styles.validPanelTitle}>Valid Court Partition</AppText>
            <AppText style={styles.validPanelDescription}>
              {partition.c4 > 0 ? `${partition.c4} Court${partition.c4 > 1 ? 's' : ''} of 4` : ''}
              {partition.c4 > 0 && partition.c5 > 0 ? ' + ' : ''}
              {partition.c5 > 0 ? `${partition.c5} Court${partition.c5 > 1 ? 's' : ''} of 5` : ''}
              {` (${selectedIds.length} Players)`}
            </AppText>
          </View>
        </View>
      ) : (
        // Default information panel matching Screen 2
        <View style={styles.infoPanel}>
          <Info size={20} color="#08785E" />
          <AppText style={styles.infoPanelText}>
            You need at least 4 players and a valid 4 or 5-player court partition to generate
            matchups. Valid counts: 4, 5, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20...
            (Counts like 6, 7, 11 are not valid.)
          </AppText>
        </View>
      )}

      {/* ── 5. Bottom Action Area ── */}
      {canManage && (
        <View style={styles.bottomActionsArea}>
          {/* Save Availability Button */}
          <TouchableOpacity
            style={[
              styles.actionPillButton,
              hasUnsavedChanges ? styles.activeSecondaryButton : styles.inactiveButton,
            ]}
            onPress={handleSave}
            disabled={isSavingAvailability || !hasUnsavedChanges}
            activeOpacity={0.8}
          >
            {isSavingAvailability ? (
              <ActivityIndicator size="small" color="#08785E" />
            ) : (
              <CheckCircle2
                size={18}
                color={hasUnsavedChanges ? '#08785E' : '#71817E'}
              />
            )}
            <AppText
              style={[
                styles.actionPillText,
                hasUnsavedChanges ? styles.activeSecondaryText : styles.inactiveButtonText,
              ]}
            >
              {isSavingAvailability ? 'Saving...' : 'Save Availability'}
            </AppText>
          </TouchableOpacity>

          {/* Create Matchups Button */}
          <TouchableOpacity
            style={[
              styles.actionPillButton,
              canCreateMatchups ? styles.activePrimaryButton : styles.inactiveButton,
            ]}
            onPress={handleGenerate}
            disabled={isCreatingMatchups || !canCreateMatchups}
            activeOpacity={0.8}
          >
            {isCreatingMatchups ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Sparkles
                size={18}
                color={canCreateMatchups ? '#FFFFFF' : '#71817E'}
              />
            )}
            <AppText
              style={[
                styles.actionPillText,
                canCreateMatchups ? styles.activePrimaryText : styles.inactiveButtonText,
              ]}
            >
              {isCreatingMatchups ? 'Creating Matchups...' : `Create Round ${currentRound} Matchups`}
            </AppText>
          </TouchableOpacity>

          {/* Footnote Caption */}
          {!canCreateMatchups && (
            <AppText style={styles.bottomFootnote}>
              {isMixed
                ? 'Select players in multiples of 4 (balanced 2 men + 2 women) to create mixed court matchups.'
                : 'Select at least 4 players and a valid 4/5-player court partition before creating matchups.'}
            </AppText>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[3],
    paddingBottom: Spacing[8],
    gap: Spacing[3],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#102E2A',
  },
  headingSubtitle: {
    fontSize: 13,
    color: '#71817E',
    marginTop: 2,
  },
  quickLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    marginTop: 2,
  },
  quickLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#08785E',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCE8E3',
    paddingHorizontal: Spacing[3],
    height: 44,
  },
  searchIcon: {
    marginRight: Spacing[2],
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#102E2A',
    paddingVertical: 0,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg ?? 16,
    borderWidth: 1,
    borderColor: '#DCE8E3',
    paddingVertical: Spacing[8],
    paddingHorizontal: Spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F3FAF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[3],
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102E2A',
    textAlign: 'center',
    marginBottom: Spacing[2],
  },
  emptyDescription: {
    fontSize: 13,
    lineHeight: 19,
    color: '#71817E',
    textAlign: 'center',
    maxWidth: 280,
  },
  listContent: {
    gap: Spacing[2],
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCE8E3',
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[3],
    gap: Spacing[3],
  },
  playerRowSelected: {
    borderColor: '#08785E',
    backgroundColor: '#F7FCF9',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#A3ADB8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxSelected: {
    borderColor: '#08785E',
    backgroundColor: '#08785E',
  },
  playerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102E2A',
    flexShrink: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  seedBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  seedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  playerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
    flexWrap: 'wrap',
  },
  ratingBadge: {
    backgroundColor: '#E0F2FE',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  ratingBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0369A1',
  },
  categoryBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  playerMeta: {
    fontSize: 11,
    color: '#71817E',
  },
  availableBadge: {
    backgroundColor: '#E5F4EC',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  availableBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#08785E',
    letterSpacing: 0.5,
  },
  unavailableBadge: {
    backgroundColor: '#F1F5F9',
  },
  unavailableBadgeText: {
    color: '#94A3B8',
  },
  regOpenBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E5F4EC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: Spacing[3],
    gap: Spacing[2],
  },
  regOpenTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#08785E',
    marginBottom: 2,
  },
  regOpenText: {
    fontSize: 12,
    lineHeight: 17,
    color: '#065F46',
  },
  closeRegSmallBtn: {
    marginTop: 8,
    backgroundColor: '#08785E',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  closeRegSmallBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  infoPanel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F3FAF5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCE8E3',
    padding: Spacing[3],
    gap: Spacing[2],
  },
  infoPanelText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#334155',
    flex: 1,
  },
  invalidPanel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: Spacing[3],
    gap: Spacing[2],
  },
  invalidPanelTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
    marginBottom: 2,
  },
  invalidPanelDescription: {
    fontSize: 12,
    lineHeight: 17,
    color: '#991B1B',
  },
  validPanel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E5F4EC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: Spacing[3],
    gap: Spacing[2],
  },
  validPanelTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#08785E',
    marginBottom: 2,
  },
  validPanelDescription: {
    fontSize: 12,
    lineHeight: 17,
    color: '#065F46',
  },
  bottomActionsArea: {
    gap: Spacing[2],
    marginTop: Spacing[2],
  },
  actionPillButton: {
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: Spacing[2],
  },
  activePrimaryButton: {
    backgroundColor: '#08785E',
  },
  activePrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  activeSecondaryButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#08785E',
  },
  activeSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#08785E',
  },
  inactiveButton: {
    backgroundColor: '#E5EDE9',
  },
  inactiveButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#71817E',
  },
  actionPillText: {
    fontSize: 14,
    fontWeight: '700',
  },
  bottomFootnote: {
    fontSize: 11,
    color: '#71817E',
    textAlign: 'center',
    marginTop: 2,
  },
});
