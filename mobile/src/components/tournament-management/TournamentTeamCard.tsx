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
 * - Supports selectable state for Scramble availability and pool badge for Pool Play
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Check, Trash2 } from 'lucide-react-native';

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
  statusBadgeVariant?: 'success' | 'warning' | 'info' | 'default';
  poolBadge?: string;
  selectable?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  canDelete?: boolean;
  onDelete?: () => void;
  isDeleting?: boolean;
  extraActions?: React.ReactNode;
  footer?: React.ReactNode;
  onEditMemberRating?: (memberIndex: number, member: TournamentTeamMember) => void;
  onSwapMember?: (memberIndex: number, member: TournamentTeamMember) => void;
}

export function TournamentTeamCard({
  name,
  seed,
  displayIndex,
  avgRating,
  members,
  teamSize = 2,
  statusLabel = 'Confirmed',
  statusBadgeVariant = 'success',
  poolBadge,
  selectable = false,
  isSelected = false,
  onToggleSelect,
  canDelete = false,
  onDelete,
  isDeleting = false,
  extraActions,
  footer,
  onEditMemberRating,
  onSwapMember,
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

  const statusBgStyle =
    statusBadgeVariant === 'warning'
      ? styles.statusBadgeWarning
      : statusBadgeVariant === 'info'
      ? styles.statusBadgeInfo
      : statusBadgeVariant === 'default'
      ? styles.statusBadgeDefault
      : styles.statusBadgeSuccess;

  const statusTextStyle =
    statusBadgeVariant === 'warning'
      ? styles.statusTextWarning
      : statusBadgeVariant === 'info'
      ? styles.statusTextInfo
      : statusBadgeVariant === 'default'
      ? styles.statusTextDefault
      : styles.statusTextSuccess;

  const CardWrapper = selectable && onToggleSelect ? TouchableOpacity : View;

  return (
    <CardWrapper
      style={[styles.card, selectable && isSelected && styles.cardSelected]}
      {...(selectable && onToggleSelect ? { onPress: onToggleSelect, activeOpacity: 0.8 } : {})}
    >
      {/* ─── Header: Checkbox (Scramble), Seed, Name, Avg Rating, Delete Action ─── */}
      <View style={styles.headerRow}>
        {selectable && (
          <TouchableOpacity
            style={[styles.checkbox, isSelected && styles.checkboxSelected]}
            onPress={onToggleSelect}
            activeOpacity={0.7}
          >
            {isSelected && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
          </TouchableOpacity>
        )}

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

          {/* Optional Pool Badge (Pool Play) */}
          {poolBadge && (
            <View style={styles.poolBadge}>
              <AppText style={styles.poolBadgeText}>{poolBadge}</AppText>
            </View>
          )}

          {/* Team / Player Name: Multi-line wrapping, standardized font */}
          <AppText style={styles.teamNameText}>{name}</AppText>
        </View>

        {/* Right side: Avg Rating pill & Optional Actions */}
        <View style={styles.headerRight}>
          {formattedAvg && (
            <View style={styles.ratingBadge}>
              <AppText style={styles.ratingText}>⭐ {formattedAvg} avg</AppText>
            </View>
          )}

          {statusLabel ? (
            <View style={[styles.statusBadge, statusBgStyle]}>
              <AppText style={[styles.statusBadgeText, statusTextStyle]}>{statusLabel}</AppText>
            </View>
          ) : null}

          {extraActions}

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
            <AppText style={styles.partnerName} numberOfLines={1}>
              {p1Name}
            </AppText>
            {member1?.skill_rating !== null && member1?.skill_rating !== undefined && (
              <TouchableOpacity
                disabled={!onEditMemberRating}
                onPress={() => onEditMemberRating && onEditMemberRating(0, member1)}
                style={[styles.playerRatingPill, onEditMemberRating && styles.clickableRatingPill]}
              >
                <AppText style={styles.playerRatingText}>
                  {Number(member1.skill_rating).toFixed(1)}
                  {onEditMemberRating ? ' ✎' : ''}
                </AppText>
              </TouchableOpacity>
            )}
            {member1?.membership_number && (
              <AppText style={styles.membershipTag}>#{member1.membership_number}</AppText>
            )}
            {onSwapMember && (
              <TouchableOpacity
                onPress={() => onSwapMember(0, member1)}
                style={styles.memberActionBtn}
              >
                <AppText style={styles.memberActionText}>Swap</AppText>
              </TouchableOpacity>
            )}
          </View>

          {/* Member 2 (if doubles) */}
          {teamSize > 1 && (
            <View style={styles.partnerRow}>
              <View style={styles.partnerDot} />
              <AppText style={styles.partnerName} numberOfLines={1}>
                {p2Name}
              </AppText>
              {member2?.skill_rating !== null && member2?.skill_rating !== undefined && (
                <TouchableOpacity
                  disabled={!onEditMemberRating}
                  onPress={() => onEditMemberRating && onEditMemberRating(1, member2)}
                  style={[styles.playerRatingPill, onEditMemberRating && styles.clickableRatingPill]}
                >
                  <AppText style={styles.playerRatingText}>
                    {Number(member2.skill_rating).toFixed(1)}
                    {onEditMemberRating ? ' ✎' : ''}
                  </AppText>
                </TouchableOpacity>
              )}
              {member2?.membership_number && (
                <AppText style={styles.membershipTag}>#{member2.membership_number}</AppText>
              )}
              {onSwapMember && member2 && (
                <TouchableOpacity
                  onPress={() => onSwapMember(1, member2)}
                  style={styles.memberActionBtn}
                >
                  <AppText style={styles.memberActionText}>Swap</AppText>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      {/* ─── Footer Action Slot (e.g. Move to Pool for Pool Play) ───────────── */}
      {footer}
    </CardWrapper>
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
  cardSelected: {
    borderColor: '#087A60',
    backgroundColor: '#F7FCF9',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginRight: 4,
  },
  checkboxSelected: {
    backgroundColor: '#087A60',
    borderColor: '#087A60',
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
  poolBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  poolBadgeText: {
    color: '#0284C7',
    fontWeight: '800',
    fontSize: 11,
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
    flexWrap: 'wrap',
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
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  statusBadgeSuccess: {
    backgroundColor: '#DCFCE7',
  },
  statusTextSuccess: {
    color: '#15803D',
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadgeWarning: {
    backgroundColor: '#FEF3C7',
  },
  statusTextWarning: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadgeInfo: {
    backgroundColor: '#E0F2FE',
  },
  statusTextInfo: {
    color: '#0284C7',
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadgeDefault: {
    backgroundColor: '#F1F5F9',
  },
  statusTextDefault: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  trashBtn: {
    padding: 4,
    borderRadius: Radius.sm,
  },
  partnersBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    gap: Spacing[2],
    borderWidth: 1,
    borderColor: '#F1F5F9',
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
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  playerRatingPill: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: Radius.sm,
  },
  clickableRatingPill: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  playerRatingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  membershipTag: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  memberActionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#F1F5F9',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  memberActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
});
