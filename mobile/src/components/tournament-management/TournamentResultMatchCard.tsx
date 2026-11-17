/**
 * Aught2 Pickleball — TournamentResultMatchCard
 *
 * Master standardized Match Result Card component across all tournament formats:
 * - Round Robin
 * - Bracket (Single / Double Elimination)
 * - Pool Play (Pool matches & Championship Bracket matches)
 * - Scramble
 *
 * Visual Reference: Round Robin master UI:
 * - White card with subtle border (#DDE8E2) and 14px radius
 * - Meta header with match number, court label, and green Completed badge
 * - Clean dual-row scoreboard container with winning side highlighted (#F0FDF4, #15803D)
 * - Footer with amber trophy icon and Winner label (#B45309)
 * - Optional "Edit Score" action button for staff
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Trophy } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Radius } from '@/theme';

export interface TournamentResultMatchCardProps {
  metaText: string;
  statusLabel?: string;
  statusVariant?: 'success' | 'warning' | 'info' | 'default' | 'error';
  sideAName: string;
  sideASubtitle?: string | null;
  scoreA: number | string | null;
  isWinnerA?: boolean;
  sideBName: string;
  sideBSubtitle?: string | null;
  scoreB: number | string | null;
  isWinnerB?: boolean;
  winnerName?: string | null;
  canEdit?: boolean;
  onEdit?: () => void;
  editLabel?: string;
}

export function TournamentResultMatchCard({
  metaText,
  statusLabel = 'Completed',
  statusVariant = 'success',
  sideAName,
  sideASubtitle,
  scoreA,
  isWinnerA = false,
  sideBName,
  sideBSubtitle,
  scoreB,
  isWinnerB = false,
  winnerName,
  canEdit = false,
  onEdit,
  editLabel = 'Edit Score',
}: TournamentResultMatchCardProps) {
  const resolvedWinner =
    winnerName || (isWinnerA ? sideAName : isWinnerB ? sideBName : null);

  return (
    <Card style={styles.resultCard}>
      {/* Top Meta Row */}
      <View style={styles.resultTopRow}>
        <AppText style={styles.matchMetaText} numberOfLines={1}>
          {metaText}
        </AppText>
        <Badge label={statusLabel} variant={statusVariant} />
      </View>

      {/* Scoreboard */}
      <View style={styles.scoreboard}>
        {/* Side A */}
        <View style={[styles.scoreRow, isWinnerA && styles.winningScoreRow]}>
          <View style={styles.sideInfoCol}>
            <AppText
              style={[styles.teamNameText, isWinnerA && styles.winningTeamName]}
              numberOfLines={1}
            >
              {sideAName}
            </AppText>
            {sideASubtitle ? (
              <AppText style={styles.teamMembersSub} numberOfLines={1}>
                {sideASubtitle}
              </AppText>
            ) : null}
          </View>
          <AppText
            style={[styles.scoreValue, isWinnerA && styles.winningScoreValue]}
          >
            {scoreA !== null && scoreA !== undefined ? scoreA : '—'}
          </AppText>
        </View>

        {/* Side B */}
        <View style={[styles.scoreRow, isWinnerB && styles.winningScoreRow]}>
          <View style={styles.sideInfoCol}>
            <AppText
              style={[styles.teamNameText, isWinnerB && styles.winningTeamName]}
              numberOfLines={1}
            >
              {sideBName}
            </AppText>
            {sideBSubtitle ? (
              <AppText style={styles.teamMembersSub} numberOfLines={1}>
                {sideBSubtitle}
              </AppText>
            ) : null}
          </View>
          <AppText
            style={[styles.scoreValue, isWinnerB && styles.winningScoreValue]}
          >
            {scoreB !== null && scoreB !== undefined ? scoreB : '—'}
          </AppText>
        </View>
      </View>

      {/* Footer: Winner & Optional Edit */}
      <View style={styles.resultFooter}>
        {resolvedWinner ? (
          <View style={styles.winnerTag}>
            <Trophy size={14} color="#D97706" />
            <AppText style={styles.winnerTagText} numberOfLines={1}>
              Winner: {resolvedWinner}
            </AppText>
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        {canEdit && onEdit && (
          <TouchableOpacity
            onPress={onEdit}
            style={styles.editBtn}
            activeOpacity={0.7}
          >
            <AppText style={styles.editBtnText}>{editLabel}</AppText>
          </TouchableOpacity>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  resultTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchMetaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#71817E',
    flex: 1,
    marginRight: 8,
  },
  scoreboard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  winningScoreRow: {
    backgroundColor: '#F0FDF4',
  },
  sideInfoCol: {
    flex: 1,
    gap: 1,
    marginRight: 12,
  },
  teamNameText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  teamMembersSub: {
    fontSize: 11,
    color: '#64748B',
  },
  winningTeamName: {
    fontWeight: '800',
    color: '#15803D',
  },
  scoreValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#64748B',
    minWidth: 24,
    textAlign: 'right',
  },
  winningScoreValue: {
    color: '#15803D',
    fontWeight: '800',
  },
  resultFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  winnerTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    marginRight: 8,
  },
  winnerTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  editBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#DDE8E2',
    backgroundColor: '#FFFFFF',
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#102F2B',
  },
});
