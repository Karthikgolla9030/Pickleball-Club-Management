/**
 * Aught2 Pickleball — TournamentTeamCard
 *
 * Standardized, responsive team card component across all tournament formats:
 * - Single Elimination / Double Elimination (Bracket)
 * - Round Robin
 * - Pool Play
 * - Scramble
 *
 * Rules:
 * - Team names never truncate with ellipses; wraps naturally onto multiple lines
 * - Consistent seed badge, average rating pill, and player rows
 * - Proper spacing, border radius, and mobile viewport adaptability (320px - 430px)
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Colors, Radius, Spacing } from '@/theme';

export interface TournamentTeamMember {
  id?: string;
  display_name?: string | null;
  user_email?: string | null;
  skill_rating?: number | string | null;
  membership_number?: string | null;
}

export interface TournamentTeamCardProps {
  name: string;
  seed?: number | null;
  displayIndex?: number;
  avgRating?: number | string | null;
  members: TournamentTeamMember[];
  teamSize?: number;
  statusLabel?: string;
  canDelete?: boolean;
  onDelete?: () => void;
  isDeleting?: boolean;
}

export function TournamentTeamCard({
  name,
  seed,
  displayIndex,
  avgRating,
  members,
  teamSize = 2,
  statusLabel,
  canDelete = false,
  onDelete,
  isDeleting = false,
}: TournamentTeamCardProps) {
  const member1 = members[0];
  const member2 = members[1];

  const p1Name = member1?.display_name || member1?.user_email || (teamSize === 1 ? 'Player' : 'Partner 1');
  const p2Name = member2?.display_name || member2?.user_email || 'Partner 2';

  const formattedAvg =
    avgRating !== null && avgRating !== undefined
      ? typeof avgRating === 'number'
        ? avgRating.toFixed(2)
        : avgRating
      : null;

  return (
    <View style={styles.card}>
      {/* ─── Header: Seed, Name, Avg Rating, Delete Action ────────────────── */}
      <View style={styles.headerRow}>
        <View style={styles.titleArea}>
          {/* Seed / Position Badge */}
          {seed !== null && seed !== undefined ? (
            <View style={styles.seedBadge}>
              <AppText style={styles.seedBadgeText}>#{seed}</AppText>
            </View>
          ) : displayIndex !== undefined ? (
            <View style={[styles.seedBadge, styles.unseededBadge]}>
              <AppText style={styles.unseededBadgeText}>#{displayIndex}</AppText>
            </View>
          ) : null}

          {/* Team Name: Multi-line wrapping, standardized font */}
          <AppText style={styles.teamNameText}>
            {name}
          </AppText>
        </View>

        {/* Right side: Avg Rating pill & Optional Actions */}
        <View style={styles.headerRight}>
          {formattedAvg && (
            <View style={styles.ratingBadge}>
              <AppText style={styles.ratingText}>⭐ {formattedAvg} avg</AppText>
            </View>
          )}

          {statusLabel && (
            <View style={styles.statusBadge}>
              <AppText style={styles.statusBadgeText}>{statusLabel}</AppText>
            </View>
          )}

          {canDelete && onDelete && (
            <TouchableOpacity
              onPress={onDelete}
              disabled={isDeleting}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.trashBtn}
              accessibilityLabel={`Remove team ${name}`}
              accessibilityRole="button"
            >
              <Trash2 size={16} color={Colors.status.error} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ─── Members Box: Consistent styling across all formats ────────────── */}
      {members.length > 0 && (
        <View style={styles.partnersBox}>
          {/* Member 1 */}
          <View style={styles.partnerRow}>
            <View style={styles.partnerDot} />
            <AppText style={styles.partnerName}>
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
              <AppText style={styles.membershipTag}>
                #{member1.membership_number}
              </AppText>
            )}
          </View>

          {/* Member 2 (if doubles) */}
          {teamSize > 1 && (
            <View style={styles.partnerRow}>
              <View style={styles.partnerDot} />
              <AppText style={styles.partnerName}>
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
                <AppText style={styles.membershipTag}>
                  #{member2.membership_number}
                </AppText>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: Spacing[3.5],
    gap: Spacing[2.5],
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  titleArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    flexWrap: 'wrap',
  },
  seedBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 26,
  },
  unseededBadge: {
    backgroundColor: '#F1F5F9',
  },
  seedBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 11,
    lineHeight: 14,
  },
  unseededBadgeText: {
    color: '#64748B',
    fontWeight: '700',
    fontSize: 11,
    lineHeight: 14,
  },
  teamNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
    lineHeight: 20,
    flexShrink: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  ratingBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  statusBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#15803D',
  },
  trashBtn: {
    padding: 6,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  partnersBox: {
    backgroundColor: '#F8FAFC',
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
    borderRadius: 3,
    backgroundColor: '#0F766E',
  },
  partnerName: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '500',
    flex: 1,
  },
  playerRatingPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.sm,
  },
  playerRatingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
  },
  membershipTag: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
});
