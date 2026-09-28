/**
 * Aught2 Pickleball — TeamsPoolsTab (Tab 1)
 *
 * Provides full rating balancing, team distribution, player editing,
 * partner swapping, and snake-draft seeding for Pool Play Mode.
 */

import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Users } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Colors, Radius, Spacing } from '@/theme';
import type { Player, PoolPlayConfig, PoolStat, Team } from '@/types/poolPlay';
import { TOLERANCE_OPTIONS } from '@/utils/poolPlayLogic';
import { AddTeamModal } from './modals/AddTeamModal';
import { EditPlayerRatingModal } from './modals/EditPlayerRatingModal';
import { SwapPlayersModal } from './modals/SwapPlayersModal';

interface TeamsPoolsTabProps {
  teams: Team[];
  pools: PoolStat[];
  poolDiff: number;
  isWithinTolerance: boolean;
  config: PoolPlayConfig;
  isSingles?: boolean;
  onBalancePools: () => void;
  onAddTeam: (team: Team) => void;
  onDeleteTeam: (teamId: string) => void;
  onMoveTeamPool: (teamId: string, targetPool: string) => void;
  onUpdatePlayerRating: (
    teamId: string,
    slot: 'p1' | 'p2',
    newRating: number
  ) => void;
  onSwapPlayers: (
    sourceTeamId: string,
    sourceSlot: 'p1' | 'p2',
    targetTeamId: string,
    targetSlot: 'p1' | 'p2'
  ) => void;
  onToleranceChange: (tolerance: number) => void;
  onCreateMatchups: () => void;
}

export function TeamsPoolsTab({
  teams,
  pools,
  poolDiff,
  isWithinTolerance,
  config,
  isSingles = false,
  onBalancePools,
  onAddTeam,
  onDeleteTeam,
  onMoveTeamPool,
  onUpdatePlayerRating,
  onSwapPlayers,
  onToleranceChange,
  onCreateMatchups,
}: TeamsPoolsTabProps) {
  const [selectedPoolKey, setSelectedPoolKey] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<{
    player: Player;
    teamId: string;
    teamName: string;
    slot: 'p1' | 'p2';
  } | null>(null);
  const [swappingSource, setSwappingSource] = useState<{
    team: Team;
    slot: 'p1' | 'p2';
  } | null>(null);

  const displayedPools =
    selectedPoolKey === 'all'
      ? pools
      : pools.filter((p) => p.key === selectedPoolKey);

  const poolA = pools.find((p) => p.key === 'A');
  const poolB = pools.find((p) => p.key === 'B');

  const handleDeletePrompt = (team: Team) => {
    Alert.alert(
      'Remove Team',
      `Are you sure you want to remove ${team.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => onDeleteTeam(team.id),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* ─── Action Bar ────────────────────────────────────────────── */}
      <View style={styles.actionBar}>
        <View style={styles.actionBtnRow}>
          <Button
            label="↻ Balance Pools"
            variant="primary"
            size="sm"
            onPress={onBalancePools}
            style={styles.primaryBtn}
          />
          <Button
            label={isSingles ? '+ Add Player' : '+ Add Team'}
            variant="secondary"
            size="sm"
            onPress={() => setShowAddModal(true)}
            style={styles.outlineBtn}
          />
        </View>

        <View style={styles.actionBtnRow}>
          {/* Tolerance selector chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tolScroll}>
            {TOLERANCE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => onToleranceChange(opt.value)}
                style={[
                  styles.tolChip,
                  config.balanceTolerance === opt.value && styles.tolChipActive,
                ]}
              >
                <AppText
                  variant="caption"
                  style={[
                    styles.tolChipText,
                    config.balanceTolerance === opt.value && styles.tolChipTextActive,
                  ]}
                >
                  ±{opt.value.toFixed(2)}
                </AppText>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Button
            label="Create Matchups ➔"
            variant="primary"
            size="sm"
            onPress={onCreateMatchups}
            style={styles.matchupBtn}
          />
        </View>
      </View>

      {teams.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Card style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Users size={32} color="#087A60" />
            </View>
            <AppText style={styles.emptyHeading}>
              No players have registered yet.
            </AppText>
            <AppText variant="caption" color="secondary" style={styles.emptySubtitle}>
              When players or teams register for this tournament, they will appear here to be seeded and distributed into pools.
            </AppText>
            <TouchableOpacity
              style={styles.emptyAddBtn}
              onPress={() => setShowAddModal(true)}
              activeOpacity={0.8}
            >
              <AppText style={styles.emptyAddBtnText}>+ Add Team Manually</AppText>
            </TouchableOpacity>
          </Card>
        </View>
      ) : (
        <>
          {/* ─── Balance Tolerance Banner ──────────────────────────────── */}
          <View
            style={[
              styles.toleranceBanner,
              isWithinTolerance ? styles.bannerWithin : styles.bannerExceeded,
            ]}
          >
            <View style={styles.bannerHeader}>
              <AppText
                variant="bodySmall"
                bold
                style={isWithinTolerance ? styles.bannerTextWithin : styles.bannerTextExceeded}
              >
                {isWithinTolerance ? '✓ WITHIN TOLERANCE' : '⚠️ EXCEEDS TOLERANCE'}
              </AppText>
              <Badge
                label={`DIFF: ${poolDiff.toFixed(2)}`}
                variant={isWithinTolerance ? 'success' : 'warning'}
              />
            </View>

            <AppText variant="caption" style={styles.bannerDetail}>
              {poolA ? `Pool A Avg: ${poolA.avgTeamRating.toFixed(2)}` : ''}
              {poolB ? ` • Pool B Avg: ${poolB.avgTeamRating.toFixed(2)}` : ''}
              {` • Limit: ±${config.balanceTolerance.toFixed(2)}`}
            </AppText>

            <AppText variant="caption" color="tertiary" style={styles.bannerTip}>
              Tip: Tap "Balance Pools" to auto-balance via Snake Draft, or swap player partners.
            </AppText>
          </View>

          {/* ─── Pool Filter Chips ─────────────────────────────────────── */}
          <View style={styles.poolFilterRow}>
            <TouchableOpacity
              onPress={() => setSelectedPoolKey('all')}
              style={[styles.filterChip, selectedPoolKey === 'all' && styles.filterChipActive]}
            >
              <AppText
                variant="caption"
                style={[styles.filterChipText, selectedPoolKey === 'all' && styles.filterChipTextActive]}
              >
                All Pools ({pools.length})
              </AppText>
            </TouchableOpacity>

            {pools.map((p) => (
              <TouchableOpacity
                key={p.key}
                onPress={() => setSelectedPoolKey(p.key)}
                style={[styles.filterChip, selectedPoolKey === p.key && styles.filterChipActive]}
              >
                <AppText
                  variant="caption"
                  style={[styles.filterChipText, selectedPoolKey === p.key && styles.filterChipTextActive]}
                >
                  Pool {p.key} ({p.teamsCount})
                </AppText>
              </TouchableOpacity>
            ))}
          </View>

      {/* ─── Pools & Teams Layout ──────────────────────────────────── */}
      {displayedPools.map((pool) => (
        <View key={pool.key} style={styles.poolSection}>
          {/* Pool Header */}
          <View style={styles.poolHeader}>
            <View style={styles.poolTitleLeft}>
              <AppText variant="heading2" style={styles.poolTitle}>
                POOL {pool.key}
              </AppText>
              <Badge label={`Avg ${pool.avgTeamRating.toFixed(2)}`} variant="info" />
            </View>
            <AppText variant="caption" color="secondary">
              {pool.teamsCount} Teams • {pool.playerCount} Players
            </AppText>
          </View>

          {/* Teams List */}
          <View style={styles.teamCardsContainer}>
            {pool.teams.map((team) => (
              <Card key={team.id} style={styles.teamCard}>
                {/* Team Card Header */}
                <View style={styles.teamCardHeader}>
                  <View style={styles.teamCardTitleCol}>
                    <AppText style={styles.gripIcon}>⠿</AppText>
                    <AppText variant="body" bold style={styles.teamName}>
                      {team.name}
                    </AppText>
                  </View>
                  <View style={styles.teamBadges}>
                    <Badge label={`Avg ${team.avgRating.toFixed(2)}`} variant="info" />
                    <Badge label={`Spread ${team.spread.toFixed(2)}`} variant="default" />
                    <TouchableOpacity
                      onPress={() => handleDeletePrompt(team)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.trashBtn}
                    >
                      <AppText style={styles.trashIcon}>🗑</AppText>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Player 1 Row */}
                <View style={styles.playerRow}>
                  <View style={[styles.playerAvatar, { backgroundColor: team.p1.color }]}>
                    <AppText style={styles.avatarText}>{team.p1.avatar}</AppText>
                  </View>
                  <AppText variant="bodySmall" style={styles.playerName} numberOfLines={1}>
                    {team.p1.name}
                  </AppText>
                  <TouchableOpacity
                    onPress={() =>
                      setEditingPlayer({
                        player: team.p1,
                        teamId: team.id,
                        teamName: team.name,
                        slot: 'p1',
                      })
                    }
                    style={styles.ratingEditBadge}
                  >
                    <AppText style={styles.ratingBadgeText}>
                      {team.p1.rating.toFixed(2)} ✎
                    </AppText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setSwappingSource({ team, slot: 'p1' })}
                    style={styles.swapBtn}
                  >
                    <AppText style={styles.swapBtnText}>Swap</AppText>
                  </TouchableOpacity>
                </View>

                {/* Player 2 Row */}
                <View style={styles.playerRow}>
                  <View style={[styles.playerAvatar, { backgroundColor: team.p2.color }]}>
                    <AppText style={styles.avatarText}>{team.p2.avatar}</AppText>
                  </View>
                  <AppText variant="bodySmall" style={styles.playerName} numberOfLines={1}>
                    {team.p2.name}
                  </AppText>
                  <TouchableOpacity
                    onPress={() =>
                      setEditingPlayer({
                        player: team.p2,
                        teamId: team.id,
                        teamName: team.name,
                        slot: 'p2',
                      })
                    }
                    style={styles.ratingEditBadge}
                  >
                    <AppText style={styles.ratingBadgeText}>
                      {team.p2.rating.toFixed(2)} ✎
                    </AppText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setSwappingSource({ team, slot: 'p2' })}
                    style={styles.swapBtn}
                  >
                    <AppText style={styles.swapBtnText}>Swap</AppText>
                  </TouchableOpacity>
                </View>

                {/* Team Card Footer: Move Pool */}
                <View style={styles.teamCardFooter}>
                  <AppText variant="caption" color="tertiary">
                    Move to:
                  </AppText>
                  <View style={styles.movePoolButtons}>
                    {pools
                      .filter((p) => p.key !== team.pool)
                      .map((targetP) => (
                        <TouchableOpacity
                          key={targetP.key}
                          onPress={() => onMoveTeamPool(team.id, targetP.key)}
                          style={styles.movePill}
                        >
                          <AppText style={styles.movePillText}>
                            Pool {targetP.key}
                          </AppText>
                        </TouchableOpacity>
                      ))}
                  </View>
                </View>
              </Card>
            ))}
          </View>
        </View>
      ))}
        </>
      )}

      {/* ─── Modals ─────────────────────────────────────────────────── */}
      <AddTeamModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        nextTeamNum={teams.length + 1}
        onAdd={onAddTeam}
      />

      <EditPlayerRatingModal
        visible={Boolean(editingPlayer)}
        onClose={() => setEditingPlayer(null)}
        player={editingPlayer?.player ?? null}
        teamName={editingPlayer?.teamName}
        onSave={(newRating) => {
          if (editingPlayer) {
            onUpdatePlayerRating(editingPlayer.teamId, editingPlayer.slot, newRating);
          }
        }}
      />

      <SwapPlayersModal
        visible={Boolean(swappingSource)}
        onClose={() => setSwappingSource(null)}
        sourceTeam={swappingSource?.team ?? null}
        sourceSlot={swappingSource?.slot ?? null}
        teams={teams}
        onSwap={onSwapPlayers}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[8],
    gap: Spacing[3],
  },
  actionBar: {
    gap: Spacing[2],
  },
  actionBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#0F766E',
    borderColor: '#0F766E',
  },
  outlineBtn: {
    flex: 1,
    borderColor: '#0F766E',
  },
  matchupBtn: {
    backgroundColor: '#087A60',
    borderColor: '#087A60',
    paddingHorizontal: Spacing[3],
  },
  tolScroll: {
    flex: 1,
  },
  tolChip: {
    paddingVertical: Spacing[1],
    paddingHorizontal: Spacing[2],
    borderRadius: Radius.full,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: Spacing[1],
  },
  tolChipActive: {
    borderColor: '#0F766E',
    backgroundColor: '#F0FDFA',
  },
  tolChipText: {
    fontSize: 11,
    color: '#64748B',
  },
  tolChipTextActive: {
    color: '#0F766E',
    fontWeight: '700',
  },
  toleranceBanner: {
    borderRadius: Radius.lg,
    padding: Spacing[3],
    borderWidth: 1,
    gap: Spacing[1],
  },
  bannerWithin: {
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderColor: '#22C55E',
  },
  bannerExceeded: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: '#F59E0B',
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerTextWithin: {
    color: '#22C55E',
  },
  bannerTextExceeded: {
    color: '#F59E0B',
  },
  bannerDetail: {
    color: Colors.text.secondary,
    fontSize: 12,
  },
  bannerTip: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
  },
  poolFilterRow: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  filterChip: {
    paddingVertical: Spacing[1],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.full,
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  filterChipActive: {
    borderColor: '#2563EB',
    backgroundColor: 'rgba(37, 99, 235, 0.2)',
  },
  filterChipText: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  filterChipTextActive: {
    color: '#60A5FA',
    fontWeight: '700',
  },
  poolSection: {
    gap: Spacing[2],
  },
  poolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.md,
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  poolTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  poolTitle: {
    fontSize: 18,
    color: Colors.text.primary,
    fontWeight: '800',
  },
  teamCardsContainer: {
    gap: Spacing[2],
  },
  teamCard: {
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.lg,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.surface.border,
    gap: Spacing[2],
  },
  teamCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamCardTitleCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  gripIcon: {
    color: Colors.text.tertiary,
    fontSize: 16,
  },
  teamName: {
    color: Colors.text.primary,
    fontSize: 15,
  },
  teamBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
  },
  trashBtn: {
    padding: 4,
  },
  trashIcon: {
    fontSize: 14,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.md,
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[2],
  },
  playerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  playerName: {
    flex: 1,
    color: Colors.text.primary,
  },
  ratingEditBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderRadius: Radius.sm,
    paddingVertical: 2,
    paddingHorizontal: Spacing[2],
  },
  ratingBadgeText: {
    fontSize: 12,
    color: '#60A5FA',
    fontWeight: '600',
  },
  swapBtn: {
    paddingVertical: 2,
    paddingHorizontal: Spacing[2],
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  swapBtnText: {
    fontSize: 11,
    color: Colors.text.tertiary,
  },
  teamCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing[1],
    borderTopWidth: 0.5,
    borderTopColor: Colors.surface.borderLight,
  },
  movePoolButtons: {
    flexDirection: 'row',
    gap: Spacing[1],
  },
  movePill: {
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: Radius.full,
    paddingVertical: 2,
    paddingHorizontal: Spacing[2],
  },
  movePillText: {
    fontSize: 11,
    color: Colors.text.secondary,
    fontWeight: '600',
  },

  // Empty State
  emptyContainer: {
    paddingVertical: Spacing[4],
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.lg,
    padding: Spacing[6],
    alignItems: 'center',
    gap: Spacing[2.5],
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E2F1E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[1],
  },
  emptyHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 320,
  },
  emptyAddBtn: {
    marginTop: Spacing[2],
    backgroundColor: '#087A60',
    paddingVertical: Spacing[2.5],
    paddingHorizontal: Spacing[4],
    borderRadius: Radius.md,
  },
  emptyAddBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  emptyPoolBox: {
    padding: Spacing[4],
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    borderStyle: 'dashed',
  },
  emptyPoolText: {
    fontSize: 12,
    color: '#94A3B8',
  },
});
