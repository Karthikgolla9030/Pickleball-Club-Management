/**
 * Aught2 Pickleball — TournamentMatchCard
 *
 * Master standardized Matchup / Active Match Card component across all formats:
 * - Round Robin (Matchups tab)
 * - Bracket (Matches tab)
 * - Pool Play (Matchups tab)
 * - Scramble (Rounds tab)
 *
 * Visual Reference: Round Robin master UI:
 * - White card with subtle border (#DDE8E2) and 14px radius
 * - Meta header with match number, court label, and status badge (Scheduled / In Progress / Completed)
 * - Dual-row scoreboard with winning side highlight
 * - Bottom action row for staff lifecycle actions (Start Match, Enter Score, Edit Score)
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Trophy } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';

export interface TournamentMatchCardProps {
  metaText: string;
  statusLabel: string;
  statusVariant?: 'success' | 'warning' | 'info' | 'default' | 'error';
  sideAName: string;
  sideASubtitle?: string | null;
  scoreA?: number | string | null;
  isWinnerA?: boolean;
  sideBName: string;
  sideBSubtitle?: string | null;
  scoreB?: number | string | null;
  isWinnerB?: boolean;
  winnerName?: string | null;
  isCompleted?: boolean;
  canManage?: boolean;
  onStartMatch?: () => void;
  isStartingMatch?: boolean;
  onOpenScoreModal?: () => void;
  onEditScore?: () => void;
  customActions?: React.ReactNode;
}

export function TournamentMatchCard({
  metaText,
  statusLabel,
  statusVariant = 'default',
  sideAName,
  sideASubtitle,
  scoreA,
  isWinnerA = false,
  sideBName,
  sideBSubtitle,
  scoreB,
  isWinnerB = false,
  winnerName,
  isCompleted = false,
  canManage = false,
  onStartMatch,
  isStartingMatch = false,
  onOpenScoreModal,
  onEditScore,
  customActions,
}: TournamentMatchCardProps) {
  const resolvedWinner =
    winnerName || (isWinnerA ? sideAName : isWinnerB ? sideBName : null);

  return (
    <Card style={styles.matchCard}>
      {/* Top Meta Row */}
      <View style={styles.matchMetaRow}>
        <AppText style={styles.matchMetaText} numberOfLines={1}>
          {metaText}
        </AppText>
        <Badge label={statusLabel} variant={statusVariant} />
      </View>

      {/* Opponents & Score Container */}
      <View style={styles.matchScoresContainer}>
        {/* Side A */}
        <View style={[styles.sideRow, isWinnerA && styles.winningSide]}>
          <View style={styles.sideInfoCol}>
            <AppText
              style={[styles.teamNameText, isWinnerA && styles.winningTeamText]}
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
            style={[styles.scoreText, isWinnerA && styles.winningScoreText]}
          >
            {scoreA !== null && scoreA !== undefined ? scoreA : '—'}
          </AppText>
        </View>

        {/* Side B */}
        <View style={[styles.sideRow, isWinnerB && styles.winningSide]}>
          <View style={styles.sideInfoCol}>
            <AppText
              style={[styles.teamNameText, isWinnerB && styles.winningTeamText]}
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
            style={[styles.scoreText, isWinnerB && styles.winningScoreText]}
          >
            {scoreB !== null && scoreB !== undefined ? scoreB : '—'}
          </AppText>
        </View>
      </View>

      {/* Footer: Winner Display (if completed) & Actions */}
      {isCompleted && resolvedWinner && (
        <View style={styles.winnerFooterRow}>
          <View style={styles.winnerTag}>
            <Trophy size={14} color="#D97706" />
            <AppText style={styles.winnerTagText} numberOfLines={1}>
              Winner: {resolvedWinner}
            </AppText>
          </View>
        </View>
      )}

      {/* Lifecycle Actions */}
      {canManage && (
        <View style={styles.matchActionsRow}>
          {customActions ? (
            customActions
          ) : (
            <>
              {onStartMatch && (
                <Button
                  label={isStartingMatch ? 'Starting...' : 'Start Match'}
                  variant="outline"
                  size="sm"
                  onPress={onStartMatch}
                  disabled={isStartingMatch}
                  loading={isStartingMatch}
                  style={styles.actionBtn}
                />
              )}

              {onOpenScoreModal && !isCompleted && (
                <Button
                  label="Enter Score"
                  variant="primary"
                  size="sm"
                  onPress={onOpenScoreModal}
                  style={styles.actionBtn}
                />
              )}

              {onEditScore && isCompleted && (
                <Button
                  label="Edit Score"
                  variant="outline"
                  size="sm"
                  onPress={onEditScore}
                  style={styles.actionBtn}
                />
              )}
            </>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  matchCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  matchMetaRow: {
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
  matchScoresContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  sideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  winningSide: {
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
  winningTeamText: {
    fontWeight: '800',
    color: '#15803D',
  },
  teamMembersSub: {
    fontSize: 11,
    color: '#64748B',
  },
  scoreText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#64748B',
    minWidth: 24,
    textAlign: 'right',
  },
  winningScoreText: {
    color: '#15803D',
    fontWeight: '800',
  },
  winnerFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 2,
  },
  winnerTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  winnerTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  matchActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 2,
  },
  actionBtn: {
    flex: 1,
  },
});
