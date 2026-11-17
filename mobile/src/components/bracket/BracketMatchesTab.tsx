/**
 * Aught2 Pickleball — BracketMatchesTab
 *
 * Tab 4 for Bracket Tournament Mode:
 * Master Reference: Follows Round Robin visual structure and components:
 * - Match statistics 3-column summary card (Total, Completed, Remaining)
 * - Segmented / filter chips: All, Ready, Waiting, Completed
 * - Standard TournamentEmptyCard when no matches are scheduled
 * - Standard TournamentMatchCard for every bracket match with court, score, status, and staff actions
 */

import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Calendar, Zap } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { FilterChips } from '@/components/FilterChips';
import {
  TournamentEmptyCard,
  TournamentMatchCard,
  TournamentMatchSummaryCard,
} from '@/components/tournament-management';
import { Spacing } from '@/theme';
import type { Court, Match } from '@/types';
import {
  getBracketRoundName,
  getFeederPlaceholder,
  getAdvancementRoute,
  getResetFinalStatus,
  isMatchBye,
  isMatchReady,
  isMatchWaiting,
} from '@/utils/bracketLogic';
import { getCourtDisplayLabel } from '@/utils';

interface BracketMatchesTabProps {
  matches: Match[];
  courts: Court[];
  canManage: boolean;
  onOpenScoreModal: (match: Match) => void;
  onStartMatch?: (matchId: string) => Promise<void>;
  isStartingMatch?: boolean;
  isTournamentCompleted?: boolean;
}

type MatchStatusFilter = 'all' | 'ready' | 'waiting' | 'completed';
type SectionFilter = 'all' | 'winners' | 'losers' | 'finals';

export function BracketMatchesTab({
  matches,
  courts,
  canManage,
  onOpenScoreModal,
  onStartMatch,
  isStartingMatch = false,
  isTournamentCompleted = false,
}: BracketMatchesTabProps) {
  const [statusFilter, setStatusFilter] = useState<MatchStatusFilter>('all');
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('all');

  const isDoubleElimination = useMemo(
    () =>
      matches.some(
        (m) =>
          m.bracket_section === 'losers' ||
          m.bracket_section === 'grand_final' ||
          m.bracket_section === 'reset_final'
      ),
    [matches]
  );

  const totalRounds = useMemo(() => {
    if (matches.length === 0) return 1;
    return Math.max(...matches.map((m) => m.bracket_round ?? m.round_number ?? 1), 1);
  }, [matches]);

  const completedMatches = useMemo(
    () => matches.filter((m) => m.status === 'completed' && !isMatchBye(m)),
    [matches]
  );

  const readyMatches = useMemo(
    () =>
      matches.filter(
        (m) =>
          isMatchReady(m) &&
          m.status !== 'completed' &&
          m.status !== 'cancelled' &&
          !isMatchBye(m)
      ),
    [matches]
  );

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      // Section filter
      if (isDoubleElimination && sectionFilter !== 'all') {
        const sec = (m.bracket_section || '').toLowerCase();
        if (sectionFilter === 'winners' && sec !== 'winners' && sec !== '') return false;
        if (sectionFilter === 'losers' && sec !== 'losers') return false;
        if (sectionFilter === 'finals' && sec !== 'grand_final' && sec !== 'reset_final') return false;
      }

      // Status filter
      if (statusFilter === 'all') return true;
      if (statusFilter === 'completed') return m.status === 'completed';
      if (statusFilter === 'ready') return isMatchReady(m);
      if (statusFilter === 'waiting') return isMatchWaiting(m);
      return true;
    });
  }, [matches, isDoubleElimination, sectionFilter, statusFilter]);

  const getCourtName = (match: Match) => {
    const label = getCourtDisplayLabel(match, { unassignedLabel: '', unresolvedLabel: '' });
    if (label) return label;
    if (match.court_id) {
      const found = courts.find((c) => c.id === match.court_id);
      if (found) {
        const foundLabel = getCourtDisplayLabel(found, { unassignedLabel: '', unresolvedLabel: '' });
        if (foundLabel) return foundLabel;
      }
    }
    return null;
  };

  const statusChips: { key: MatchStatusFilter; label: string }[] = [
    { key: 'all', label: `All (${matches.length})` },
    { key: 'ready', label: `Ready (${matches.filter(isMatchReady).length})` },
    { key: 'waiting', label: `Waiting (${matches.filter(isMatchWaiting).length})` },
    { key: 'completed', label: `Completed (${completedMatches.length})` },
  ];

  const sectionChips: { key: SectionFilter; label: string }[] = [
    { key: 'all', label: 'All Stages' },
    {
      key: 'winners',
      label: `Winners (${matches.filter((m) => !m.bracket_section || m.bracket_section === 'winners').length})`,
    },
    {
      key: 'losers',
      label: `Losers (${matches.filter((m) => m.bracket_section === 'losers').length})`,
    },
    {
      key: 'finals',
      label: `Finals (${matches.filter((m) => m.bracket_section === 'grand_final' || m.bracket_section === 'reset_final').length})`,
    },
  ];

  return (
    <View style={styles.container}>
      {/* ─── 1. Heading ────────────────────────────────────────────────────── */}
      <View style={styles.headingRow}>
        <AppText style={styles.headerTitle}>Matches</AppText>
      </View>

      {/* ─── 2. Standardized 3-Column Match Summary Card ───────────────────── */}
      {matches.length > 0 && (
        <TournamentMatchSummaryCard
          totalMatches={matches.length}
          completedMatches={completedMatches.length}
          remainingMatches={Math.max(0, matches.length - completedMatches.length)}
        />
      )}

      {matches.length === 0 ? (
        <TournamentEmptyCard
          icon={<Calendar size={32} color="#102F2B" />}
          title="No matches scheduled"
          description="The match schedule will appear here after the bracket is generated."
        />
      ) : (
        <>
          {/* Section Filter Chips for Double Elimination */}
          {isDoubleElimination && (
            <FilterChips<SectionFilter>
              chips={sectionChips}
              activeChip={sectionFilter}
              onChipPress={(key) => setSectionFilter(key)}
              style={styles.filterChipsRow}
              contentContainerStyle={styles.filterChipsContent}
            />
          )}

          {/* Status Filter Chips */}
          <FilterChips<MatchStatusFilter>
            chips={statusChips}
            activeChip={statusFilter}
            onChipPress={(key) => setStatusFilter(key)}
            style={styles.filterChipsRow}
            contentContainerStyle={styles.filterChipsContent}
          />

          {/* Ready to Play Now Queue (Fast Organizer Action) */}
          {(statusFilter === 'all' || statusFilter === 'ready') && readyMatches.length > 0 && (
            <Card style={styles.readyQueueCard}>
              <View style={styles.readyQueueHeader}>
                <View style={styles.readyQueueTitleRow}>
                  <Zap size={15} color="#D97706" fill="#D97706" />
                  <AppText style={styles.readyQueueTitle}>
                    Ready to Play Now ({readyMatches.length})
                  </AppText>
                </View>
                <AppText style={styles.readyQueueSubtitle}>
                  Both teams determined • Ready for court assignment & score entry
                </AppText>
              </View>

              <View style={styles.readyQueueList}>
                {readyMatches.map((rm) => (
                  <View key={`queue-item-${rm.id}`} style={styles.readyQueueItem}>
                    <View style={styles.readyQueueItemLeft}>
                      <Badge
                        label={`#${rm.match_number ?? rm.bracket_position}`}
                        variant="warning"
                      />
                      <View style={{ flex: 1 }}>
                        <AppText variant="bodySmall" numberOfLines={1} style={styles.readyQueueMatchup}>
                          {rm.team_a?.name ?? 'Team A'} vs {rm.team_b?.name ?? 'Team B'}
                        </AppText>
                        <AppText variant="caption" color="secondary">
                          {rm.label || (rm.bracket_section === 'losers' ? 'Losers Bracket' : 'Winners Bracket')}
                        </AppText>
                      </View>
                    </View>

                    <View style={styles.readyQueueActions}>
                      {canManage && rm.status === 'pending' && onStartMatch && (
                        <Button
                          label="Start"
                          variant="outline"
                          size="sm"
                          onPress={() => void onStartMatch(rm.id)}
                          disabled={isStartingMatch}
                        />
                      )}
                      {canManage && (
                        <Button
                          label="Score"
                          variant="primary"
                          size="sm"
                          onPress={() => onOpenScoreModal(rm)}
                        />
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          )}

          {/* Matches List */}
          <View style={styles.matchesList}>
            {filteredMatches.map((match) => {
              const isBye = isMatchBye(match);
              const isReady = isMatchReady(match);
              const isCompleted = match.status === 'completed';
              const isCancelled = match.status === 'cancelled';
              const isWaiting = isMatchWaiting(match);
              const resetInfo = getResetFinalStatus(match);
              const advancement = getAdvancementRoute(match);

              const roundNum = match.bracket_round ?? match.round_number ?? 1;
              const roundName =
                match.label ||
                (match.bracket_section === 'losers'
                  ? `Losers Round ${roundNum}`
                  : match.bracket_section === 'grand_final'
                  ? 'Grand Final'
                  : match.bracket_section === 'reset_final'
                  ? 'Reset Final'
                  : getBracketRoundName(roundNum, totalRounds));

              const placeholderA = getFeederPlaceholder(match, 'team_a', matches);
              const placeholderB = getFeederPlaceholder(match, 'team_b', matches);

              const teamAName = match.team_a?.name ?? (isCompleted ? 'Team A' : placeholderA);
              const teamBName = isBye
                ? 'BYE'
                : (match.team_b?.name ?? (isCompleted ? 'Team B' : placeholderB));

              const winnerIsA = isCompleted && match.winner_team_id === match.team_a_id;
              const winnerIsB = isCompleted && match.winner_team_id === match.team_b_id;

              const courtLabel = getCourtName(match);

              const canEnterScore =
                isReady &&
                !isCompleted &&
                !isBye &&
                !isCancelled &&
                Boolean(match.team_a_id && match.team_b_id) &&
                !isTournamentCompleted;

              const canEditScore =
                isCompleted && !isBye && !isCancelled && !isTournamentCompleted;

              const statusLabel = resetInfo.isResetFinal
                ? resetInfo.badgeLabel
                : isBye
                ? 'BYE'
                : isCancelled
                ? 'Not Required'
                : isCompleted
                ? 'Completed'
                : isReady
                ? 'Ready to Play'
                : 'Waiting';

              const statusVariant: 'success' | 'warning' | 'info' | 'default' | 'error' = resetInfo.isResetFinal
                ? resetInfo.badgeVariant
                : isBye
                ? 'default'
                : isCancelled
                ? 'default'
                : isCompleted
                ? 'success'
                : isReady
                ? 'warning'
                : 'default';

              const sideASub = match.team_a?.seed ? `#${match.team_a.seed} Seed` : isWaiting && !match.team_a_id ? placeholderA : undefined;
              const sideBSub = match.team_b?.seed ? `#${match.team_b.seed} Seed` : isWaiting && !match.team_b_id && !isBye ? placeholderB : undefined;

              return (
                <TournamentMatchCard
                  key={match.id}
                  metaText={`${roundName} · Match #${match.match_number ?? match.bracket_position ?? 1}${courtLabel ? ` · ${courtLabel}` : ''}`}
                  statusLabel={statusLabel}
                  statusVariant={statusVariant}
                  sideAName={teamAName}
                  sideASubtitle={sideASub}
                  scoreA={isCompleted ? match.score_a : isBye && winnerIsA ? '✓ Advances' : null}
                  isWinnerA={winnerIsA}
                  sideBName={teamBName}
                  sideBSubtitle={sideBSub}
                  scoreB={isCompleted ? match.score_b : isBye && winnerIsB ? '✓ Advances' : null}
                  isWinnerB={winnerIsB}
                  winnerName={isCompleted ? (winnerIsA ? teamAName : winnerIsB ? teamBName : undefined) : undefined}
                  isCompleted={isCompleted}
                  canManage={canManage}
                  onStartMatch={isReady && match.status === 'pending' && onStartMatch ? () => void onStartMatch(match.id) : undefined}
                  isStartingMatch={isStartingMatch}
                  onOpenScoreModal={canEnterScore ? () => onOpenScoreModal(match) : undefined}
                  onEditScore={canEditScore ? () => onOpenScoreModal(match) : undefined}
                  customActions={
                    advancement.winnerBadge || advancement.loserBadge ? (
                      <View style={styles.advancementRow}>
                        {advancement.winnerBadge && (
                          <View style={styles.advancementPill}>
                            <AppText variant="caption" style={styles.advancementWinner}>
                              {advancement.winnerBadge}
                            </AppText>
                          </View>
                        )}
                        {advancement.loserBadge && (
                          <View style={styles.advancementPill}>
                            <AppText variant="caption" style={styles.advancementLoser}>
                              {advancement.loserBadge}
                            </AppText>
                          </View>
                        )}
                      </View>
                    ) : undefined
                  }
                />
              );
            })}
          </View>
        </>
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
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#102F2B',
  },
  filterChipsRow: {
    marginHorizontal: -Spacing[4],
  },
  filterChipsContent: {
    paddingHorizontal: Spacing[4],
  },
  readyQueueCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  readyQueueHeader: {
    gap: 2,
  },
  readyQueueTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  readyQueueTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
  },
  readyQueueSubtitle: {
    fontSize: 11,
    color: '#B45309',
  },
  readyQueueList: {
    gap: 6,
    marginTop: 2,
  },
  readyQueueItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  readyQueueItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  readyQueueMatchup: {
    fontWeight: '700',
    color: '#1E293B',
  },
  readyQueueActions: {
    flexDirection: 'row',
    gap: 6,
  },
  matchesList: {
    gap: Spacing[2],
  },
  advancementRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  advancementPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  advancementWinner: {
    fontSize: 11,
    color: '#0F766E',
    fontWeight: '600',
  },
  advancementLoser: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
});
