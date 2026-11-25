/**
 * Aught2 Pickleball — TeamsPoolsTab (Tab 2)
 *
 * Displays confirmed tournament teams/players and their pool assignments:
 * - Focuses strictly on team membership, DUPR ratings, and pool assignments.
 * - All tournament configuration (pool counts, tolerance, qualifiers, generation)
 *   has been consolidated into the Setup & Courts tab.
 * - Manual "+ Add Team" and "+ Add Team Manually" have been completely removed.
 * - Clean empty state when no teams have registered yet.
 */

import React, { useState } from 'react';
import {
  Alert,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Users } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { FilterChips } from '@/components/FilterChips';
import {
  TournamentSectionHeading,
  TournamentTeamCard,
} from '@/components/tournament-management';
import { Colors, Radius, Spacing } from '@/theme';
import type { Tournament } from '@/types';
import type { Player, PoolPlayConfig, PoolStat, Team } from '@/types/poolPlay';
import { EditPlayerRatingModal } from './modals/EditPlayerRatingModal';
import { SwapPlayersModal } from './modals/SwapPlayersModal';

interface TeamsPoolsTabProps {
  tournament?: Tournament | null;
  teams: Team[];
  pools: PoolStat[];
  poolDiff: number;
  isWithinTolerance: boolean;
  config: PoolPlayConfig;
  isSingles?: boolean;
  onBalancePools?: () => void;
  onDeleteTeam?: (teamId: string) => void;
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
  // Legacy optional props preserved for caller compatibility
  onAddTeam?: (team: Team) => void;
  onToleranceChange?: (tolerance: number) => void;
  onCreateMatchups?: () => void;
}

export function TeamsPoolsTab({
  tournament,
  teams,
  pools,
  poolDiff,
  isWithinTolerance,
  config,
  isSingles = false,
  onBalancePools,
  onDeleteTeam,
  onMoveTeamPool,
  onUpdatePlayerRating,
  onSwapPlayers,
}: TeamsPoolsTabProps) {
  const [selectedPoolKey, setSelectedPoolKey] = useState<string>('all');
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
    if (!onDeleteTeam) return;
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

  const totalPlayersCount = isSingles ? teams.length : teams.length * 2;

  return (
    <View style={styles.container}>
      {/* ─── 1. Section Heading: Players/Teams (N) [SINGLES/DOUBLES] ───────── */}
      <TournamentSectionHeading
        title={isSingles ? `Players (${teams.length})` : `Teams (${teams.length})`}
        subtitle={
          teams.length > 0
            ? !isSingles
              ? `· ${totalPlayersCount} Players across ${pools.length} Pools`
              : `· Across ${pools.length} Pools`
            : '· Registration roster'
        }
        badgeLabel={isSingles ? 'SINGLES' : 'DOUBLES'}
        badgeVariant="blue"
      />

      {/* ─── 2. Main Content ─────────────────────────────────────────────── */}
      {teams.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Card style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Users size={30} color="#0F766E" />
            </View>
            <AppText style={styles.emptyHeading}>
              Waiting for confirmed teams
            </AppText>
            <AppText style={styles.emptySubtitle}>
              When players or teams register and confirm for this tournament, they will appear here with their ratings and pool assignments.
            </AppText>
          </Card>
        </View>
      ) : pools.length === 0 ? (
        <View style={styles.unassignedSection}>
          <View style={styles.unassignedNotice}>
            <AppText style={styles.unassignedNoticeTitle}>
              Confirmed {isSingles ? 'Players' : 'Teams'} ({teams.length})
            </AppText>
            <AppText style={styles.unassignedNoticeText}>
              Pool assignments and balance will be generated in Setup & Courts. Player ratings can be adjusted below.
            </AppText>
          </View>
          <View style={styles.teamCardsContainer}>
            {teams.map((team, idx) => (
              <TournamentTeamCard
                key={team.id}
                name={team.name}
                seed={team.teamNum}
                displayIndex={idx + 1}
                avgRating={team.avgRating}
                statusLabel="Confirmed"
                statusBadgeVariant="success"
                teamSize={isSingles ? 1 : 2}
                members={
                  isSingles
                    ? [
                        {
                          id: team.p1.id,
                          display_name: team.p1.name,
                          skill_rating: team.p1.rating,
                        },
                      ]
                    : [
                        {
                          id: team.p1.id,
                          display_name: team.p1.name,
                          skill_rating: team.p1.rating,
                        },
                        {
                          id: team.p2.id,
                          display_name: team.p2.name,
                          skill_rating: team.p2.rating,
                        },
                      ]
                }
                canDelete={Boolean(onDeleteTeam)}
                onDelete={() => handleDeletePrompt(team)}
                onEditMemberRating={(memberIndex) => {
                  const slot: 'p1' | 'p2' = memberIndex === 0 ? 'p1' : 'p2';
                  const p = slot === 'p1' ? team.p1 : team.p2;
                  setEditingPlayer({
                    player: p,
                    teamId: team.id,
                    teamName: team.name,
                    slot,
                  });
                }}
                onSwapMember={(memberIndex) => {
                  const slot: 'p1' | 'p2' = memberIndex === 0 ? 'p1' : 'p2';
                  setSwappingSource({ team, slot });
                }}
              />
            ))}
          </View>
        </View>
      ) : (
        <>
          {/* ─── Balance Tolerance Summary Banner ──────────────────────── */}
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
              {` • Limit: ±${config.balanceTolerance.toFixed(2)} (Configured in Setup & Courts)`}
            </AppText>

            {onBalancePools ? (
              <View style={styles.rebalanceRow}>
                <TouchableOpacity
                  style={styles.rebalanceBtn}
                  onPress={onBalancePools}
                  activeOpacity={0.7}
                >
                  <AppText style={styles.rebalanceBtnText}>↻ Re-balance Pools via Snake Seeding</AppText>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          {/* ─── Pool Filter Chips ─────────────────────────────────────── */}
          <FilterChips<string>
            chips={[
              { key: 'all', label: `All Pools (${pools.length})` },
              ...pools.map((p) => ({ key: p.key, label: `Pool ${p.key} (${p.teamsCount})` })),
            ]}
            activeChip={selectedPoolKey}
            onChipPress={(k) => setSelectedPoolKey(k)}
          />

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
                  {isSingles
                    ? `${pool.teamsCount} Players`
                    : `${pool.teamsCount} Teams • ${pool.playerCount} Players`}
                </AppText>
              </View>

              {/* Teams List */}
              <View style={styles.teamCardsContainer}>
                {pool.teams.map((team, idx) => (
                  <TournamentTeamCard
                    key={team.id}
                    name={team.name}
                    seed={team.teamNum}
                    displayIndex={idx + 1}
                    avgRating={team.avgRating}
                    poolBadge={`Pool ${team.pool}`}
                    statusLabel="Confirmed"
                    statusBadgeVariant="success"
                    teamSize={isSingles ? 1 : 2}
                    members={
                      isSingles
                        ? [
                            {
                              id: team.p1.id,
                              display_name: team.p1.name,
                              skill_rating: team.p1.rating,
                            },
                          ]
                        : [
                            {
                              id: team.p1.id,
                              display_name: team.p1.name,
                              skill_rating: team.p1.rating,
                            },
                            {
                              id: team.p2.id,
                              display_name: team.p2.name,
                              skill_rating: team.p2.rating,
                            },
                          ]
                    }
                    canDelete={Boolean(onDeleteTeam)}
                    onDelete={() => handleDeletePrompt(team)}
                    onEditMemberRating={(memberIndex) => {
                      const slot: 'p1' | 'p2' = memberIndex === 0 ? 'p1' : 'p2';
                      const p = slot === 'p1' ? team.p1 : team.p2;
                      setEditingPlayer({
                        player: p,
                        teamId: team.id,
                        teamName: team.name,
                        slot,
                      });
                    }}
                    onSwapMember={(memberIndex) => {
                      const slot: 'p1' | 'p2' = memberIndex === 0 ? 'p1' : 'p2';
                      setSwappingSource({ team, slot });
                    }}
                  />
                ))}

                {pool.teams.length === 0 && (
                  <View style={styles.emptyPoolBox}>
                    <AppText style={styles.emptyPoolText}>No teams currently in Pool {pool.key}</AppText>
                  </View>
                )}
              </View>
            </View>
          ))}
        </>
      )}

      {/* ─── Modals ─────────────────────────────────────────────────── */}
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
  // Empty State
  emptyContainer: {
    paddingVertical: Spacing[4],
  },
  unassignedSection: {
    gap: Spacing[3],
  },
  unassignedNotice: {
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    borderRadius: Radius.md,
    padding: Spacing[3],
    gap: 4,
  },
  unassignedNoticeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F766E',
  },
  unassignedNoticeText: {
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 17,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.lg,
    padding: Spacing[6],
    alignItems: 'center',
    gap: Spacing[2],
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#DEF2E6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[1],
  },
  emptyHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 12.5,
    lineHeight: 18,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 320,
  },
  // Tolerance Banner
  toleranceBanner: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing[3],
    gap: 4,
  },
  bannerWithin: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  bannerExceeded: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  bannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bannerTextWithin: {
    color: '#15803D',
    fontSize: 12,
    fontWeight: '700',
  },
  bannerTextExceeded: {
    color: '#B45309',
    fontSize: 12,
    fontWeight: '700',
  },
  bannerDetail: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  rebalanceRow: {
    marginTop: 6,
    flexDirection: 'row',
  },
  rebalanceBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: Radius.sm,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  rebalanceBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0F766E',
  },
  // Pool Layout
  poolSection: {
    gap: Spacing[2],
    marginTop: Spacing[1],
  },
  poolHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing[1],
  },
  poolTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  poolTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  teamCardsContainer: {
    gap: Spacing[2],
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
