/**
 * Aught2 Pickleball — BracketTeamsTab
 *
 * Tab 2 for Bracket Tournament Mode:
 * - Fixed-partner doubles teams roster
 * - Displays team seed, player 1, player 2, and combined ratings
 * - Roster lock status banner once matches exist
 * - Add/delete team management for authorized staff before tournament starts
 */

import React from 'react';
import {
  Alert,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Users, Lock, Trash2, Info, Plus } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Colors, Radius, Spacing } from '@/theme';
import type { Team } from '@/types';

interface BracketTeamsTabProps {
  teams: Team[];
  canManage: boolean;
  canModifyTeams: boolean;
  onOpenAddTeam: () => void;
  onDeleteTeam: (teamId: string) => Promise<void>;
  isDeletingTeam?: boolean;
  teamSize?: number;
  matchesCount?: number;
  status?: string;
}

export function BracketTeamsTab({
  teams,
  canManage,
  canModifyTeams,
  onOpenAddTeam,
  onDeleteTeam,
  isDeletingTeam = false,
  teamSize = 2,
  matchesCount = 0,
  status = 'draft',
}: BracketTeamsTabProps) {
  const handleDeleteConfirm = (team: Team) => {
    Alert.alert(
      teamSize === 1 ? 'Remove Player' : 'Remove Team',
      `Are you sure you want to remove "${team.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => void onDeleteTeam(team.id),
        },
      ]
    );
  };

  // Helper to compute team average skill rating
  const getTeamAvgRating = (team: Team): number => {
    const ratings = (team.members || [])
      .map((m) => (m.skill_rating !== null && m.skill_rating !== undefined ? Number(m.skill_rating) : null))
      .filter((r): r is number => r !== null);
    if (ratings.length === 0) return 3.5;
    return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
  };

  // Sort teams by seed ascending, then rating descending, then name
  const sortedTeams = [...teams].sort((a, b) => {
    if (a.seed !== null && b.seed !== null) return a.seed - b.seed;
    if (a.seed !== null) return -1;
    if (b.seed !== null) return 1;
    const rA = getTeamAvgRating(a);
    const rB = getTeamAvgRating(b);
    if (rA !== rB) return rB - rA;
    return a.name.localeCompare(b.name);
  });

  const entityName = teamSize === 1 ? 'player' : 'team';
  const entityNamePlural = teamSize === 1 ? 'players' : 'teams';

  return (
    <View style={styles.container}>
      {/* ─── Top Info & Action Bar ───────────────────────────────────────── */}
      <View style={styles.topRow}>
        <View style={styles.titleCol}>
          <AppText style={styles.headerTitle}>
            Registered {teamSize === 1 ? 'Players' : 'Teams'} ({teams.length})
          </AppText>
          <AppText style={styles.headerSubtitle}>
            {teams.length} {entityNamePlural} registered for this tournament
          </AppText>
        </View>

        {canManage && canModifyTeams && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={onOpenAddTeam}
            activeOpacity={0.8}
          >
            <Plus size={14} color="#FFFFFF" />
            <AppText style={styles.addBtnText}>
              {teamSize === 1 ? 'Add Player' : 'Add Team'}
            </AppText>
          </TouchableOpacity>
        )}
      </View>

      {/* ─── Locked Roster Banner (ONLY once bracket matches exist) ──────── */}
      {matchesCount > 0 && (
        <View style={styles.lockedBanner}>
          <Lock size={16} color="#D97706" />
          <View style={{ flex: 1 }}>
            <AppText style={styles.lockedTitle}>
              Bracket Generated — Rosters Locked
            </AppText>
            <AppText style={styles.lockedSub}>
              {teamSize === 1
                ? 'Players cannot be modified while the bracket is active.'
                : 'Teams and partner assignments cannot be modified while the bracket is active.'}
            </AppText>
          </View>
        </View>
      )}

      {/* ─── Registration Open Informational Banner ─────────────────────── */}
      {status === 'registration_open' && matchesCount === 0 && (
        <View style={styles.openRegBanner}>
          <Info size={16} color="#059669" />
          <View style={{ flex: 1 }}>
            <AppText style={styles.openRegTitle}>Registration Open</AppText>
            <AppText style={styles.openRegSub}>
              Players are currently registering. Seeding is automatically calculated by player skill ratings when registration closes.
            </AppText>
          </View>
        </View>
      )}

      {/* ─── Teams List / Empty State ────────────────────────────────────── */}
      {sortedTeams.length === 0 ? (
        <Card style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <Users size={32} color="#102F2B" />
          </View>
          <AppText style={styles.emptyTitle}>
            No players yet
          </AppText>
          <AppText style={styles.emptySubtitle}>
            Confirmed registrations will appear here. Add or confirm players before building the bracket.
          </AppText>

          {/* Pale Mint Info Box */}
          <View style={styles.infoStrip}>
            <Info size={16} color="#059669" />
            <AppText style={styles.infoStripText}>
              Players who register from the player app will appear here automatically.
            </AppText>
          </View>

          {canManage && canModifyTeams && (
            <TouchableOpacity
              style={styles.addFirstBtn}
              onPress={onOpenAddTeam}
              activeOpacity={0.8}
            >
              <AppText style={styles.addFirstBtnText}>
                {teamSize === 1 ? '+ Add Player' : '+ Add Team'}
              </AppText>
            </TouchableOpacity>
          )}
        </Card>
      ) : (
        <View style={styles.listContent}>
          {sortedTeams.map((item, index) => {
            const member1 = item.members[0];
            const member2 = item.members[1];
            const p1Name = member1?.display_name || member1?.user_email || (teamSize === 1 ? 'Player' : 'Partner 1');
            const p2Name = member2?.display_name || member2?.user_email || 'Partner 2';
            const avgRating = getTeamAvgRating(item).toFixed(2);

            return (
              <Card key={item.id} style={styles.teamCard}>
                {/* Header: Seed / Team #, Rating and Actions */}
                <View style={styles.teamHeaderRow}>
                  <View style={styles.teamTitleLeft}>
                    {item.seed !== null ? (
                      <View style={styles.seedBadge}>
                        <AppText variant="caption" style={styles.seedBadgeText}>
                          #{item.seed}
                        </AppText>
                      </View>
                    ) : (
                      <View style={[styles.seedBadge, styles.unseededBadge]}>
                        <AppText variant="caption" color="secondary">
                          #{index + 1}
                        </AppText>
                      </View>
                    )}
                    <AppText variant="heading3" numberOfLines={1} style={styles.teamNameText}>
                      {item.name}
                    </AppText>
                    <View style={styles.ratingBadge}>
                      <AppText style={styles.ratingText}>⭐ {avgRating} avg</AppText>
                    </View>
                  </View>

                  {canManage && canModifyTeams && (
                    <TouchableOpacity
                      onPress={() => handleDeleteConfirm(item)}
                      disabled={isDeletingTeam}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.trashBtn}
                    >
                      <Trash2 size={16} color={Colors.status.error} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Partners List */}
                <View style={styles.partnersBox}>
                  <View style={styles.partnerRow}>
                    <View style={styles.partnerDot} />
                    <AppText variant="bodySmall" style={styles.partnerName}>
                      {p1Name}
                    </AppText>
                    {member1?.skill_rating !== null && member1?.skill_rating !== undefined && (
                      <View style={styles.playerRatingPill}>
                        <AppText style={styles.playerRatingText}>
                          {Number(member1.skill_rating).toFixed(1)}
                        </AppText>
                      </View>
                    )}
                    {member1?.membership_number && (
                      <AppText variant="caption" color="tertiary">
                        #{member1.membership_number}
                      </AppText>
                    )}
                  </View>

                  {teamSize > 1 && (
                    <View style={styles.partnerRow}>
                      <View style={styles.partnerDot} />
                      <AppText variant="bodySmall" style={styles.partnerName}>
                        {p2Name}
                      </AppText>
                      {member2?.skill_rating !== null && member2?.skill_rating !== undefined && (
                        <View style={styles.playerRatingPill}>
                          <AppText style={styles.playerRatingText}>
                            {Number(member2.skill_rating).toFixed(1)}
                          </AppText>
                        </View>
                      )}
                      {member2?.membership_number && (
                        <AppText variant="caption" color="tertiary">
                          #{member2.membership_number}
                        </AppText>
                      )}
                    </View>
                  )}
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[4],
    gap: Spacing[3],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  titleCol: {
    gap: 3,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#102F2B',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#71817E',
  },
  addBtn: {
    backgroundColor: '#064E3B',
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    padding: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  lockedTitle: {
    color: '#D97706',
    fontWeight: '700',
    fontSize: 13,
  },
  lockedSub: {
    color: '#71817E',
    fontSize: 11,
  },
  openRegBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    padding: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  openRegTitle: {
    color: '#064E3B',
    fontWeight: '700',
    fontSize: 13,
  },
  openRegSub: {
    color: '#047857',
    fontSize: 11,
    lineHeight: 16,
  },
  ratingBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  ratingText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
  },
  playerRatingPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: Radius.sm,
  },
  playerRatingText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  listContent: {
    gap: Spacing[3],
  },
  teamCard: {
    padding: Spacing[3.5],
    backgroundColor: '#FFFFFF',
    borderColor: '#DDE8E2',
    borderWidth: 1,
    borderRadius: 16,
    gap: Spacing[2.5],
  },
  teamHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    flex: 1,
  },
  seedBadge: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: '#087A60',
    minWidth: 28,
    alignItems: 'center',
  },
  unseededBadge: {
    backgroundColor: '#F1F5F9',
  },
  seedBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 11,
  },
  teamNameText: {
    color: '#102F2B',
    fontWeight: '700',
    flex: 1,
  },
  trashBtn: {
    padding: 6,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  partnersBox: {
    backgroundColor: '#F8FAF9',
    borderRadius: Radius.md,
    padding: Spacing[2.5],
    gap: Spacing[1.5],
  },
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  partnerDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: '#087A60',
  },
  partnerName: {
    color: '#102F2B',
    fontWeight: '500',
    flex: 1,
  },
  emptyCard: {
    padding: Spacing[6],
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#DDE8E2',
    borderWidth: 1,
    borderRadius: 16,
    gap: 8,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EBF4F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#102F2B',
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    color: '#71817E',
    maxWidth: 280,
    marginBottom: 12,
  },
  infoStrip: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  infoStripText: {
    fontSize: 12,
    color: '#102F2B',
    fontWeight: '500',
    flex: 1,
    lineHeight: 16,
  },
  addFirstBtn: {
    backgroundColor: '#064E3B',
    borderRadius: Radius.full,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 12,
  },
  addFirstBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
