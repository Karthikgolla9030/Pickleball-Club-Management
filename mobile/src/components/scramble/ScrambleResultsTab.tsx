/**
 * Aught2 Pickleball — ScrambleResultsTab
 *
 * Standardized Results view for Scramble Tournament Mode:
 * Master Reference: Follows Round Robin visual structure and components:
 * - Heading: Results
 * - Standard TournamentChampionCard when tournament / all rounds complete
 * - Standard TournamentEmptyCard when no completed games exist
 * - Standard TournamentRoundHeading for each completed scramble round
 * - Standard TournamentResultMatchCard for each completed game with scores and winner highlight
 * - Edit score option for staff
 */

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Award, FileText } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import {
  TournamentChampionCard,
  TournamentEmptyCard,
  TournamentResultMatchCard,
  TournamentRoundHeading,
} from '@/components/tournament-management';
import { Spacing } from '@/theme';
import type { Match } from '@/types';
import type { ScrambleStandingRow, ScrambleState, ScrambleSubTab } from '@/types/scramble';
import { formatPartnerNames } from '@/utils/scrambleLogic';
import { getCourtDisplayLabel } from '@/utils';

interface ScrambleResultsTabProps {
  state: ScrambleState | null;
  matches: Match[];
  standings?: ScrambleStandingRow[];
  canManage: boolean;
  onOpenScoreModal?: (match: Match) => void;
  onNavigateTab?: (tab: ScrambleSubTab) => void;
  onEndTournament?: () => void;
  isEndingTournament?: boolean;
}

interface ScrambleRoundGroup {
  roundNumber: number;
  matches: Match[];
}

export function ScrambleResultsTab({
  state,
  matches,
  standings = [],
  canManage,
  onOpenScoreModal,
}: ScrambleResultsTabProps) {
  const isCompleted = state?.tournament_status === 'completed';

  // Completed matches only
  const completedMatches = useMemo(() => {
    return matches.filter((m) => m.status === 'completed');
  }, [matches]);

  // Group completed matches by round
  const completedRounds = useMemo(() => {
    const map = new Map<number, Match[]>();
    completedMatches.forEach((m) => {
      const r = m.round_number ?? m.round ?? 1;
      if (!map.has(r)) {
        map.set(r, []);
      }
      map.get(r)!.push(m);
    });

    const groups: ScrambleRoundGroup[] = [];
    map.forEach((roundMatches, roundNumber) => {
      groups.push({ roundNumber, matches: roundMatches });
    });
    return groups.sort((a, b) => a.roundNumber - b.roundNumber);
  }, [completedMatches]);

  const playedCount = state?.tournament_games_completed ?? (state?.games_completed ?? completedMatches.length);
  const totalCount = state?.expected_total_games ?? (state?.total_games ?? (playedCount + (state?.games_remaining ?? 0)));
  const remainingCount = Math.max(0, totalCount - playedCount);

  const isAllGamesCompleted =
    matches.length > 0 && completedMatches.length === matches.length && remainingCount === 0;
  const isTournamentCompleted = isCompleted || isAllGamesCompleted;

  // Champion resolution
  const championName =
    state?.champion_player_name ||
    (isTournamentCompleted && standings.length > 0 ? standings[0].display_name : null);
  const championStanding =
    isTournamentCompleted && standings.length > 0 ? standings[0] : null;
  const runnerUp =
    isTournamentCompleted && standings.length > 1 ? standings[1] : null;

  const championStatPills = useMemo(() => {
    if (!championStanding) return [];
    const pills: { icon?: React.ReactNode; text: string }[] = [
      {
        icon: <Award size={13} color="#087A60" />,
        text: `${championStanding.wins}W – ${championStanding.losses}L`,
      },
      {
        text: `Diff: ${championStanding.points_differential > 0 ? `+${championStanding.points_differential}` : championStanding.points_differential}`,
      },
      {
        text: `${championStanding.points_scored} Pts Scored`,
      },
    ];

    if (runnerUp) {
      pills.push({
        text: `Runner-Up: ${runnerUp.display_name}`,
      });
    }

    return pills;
  }, [championStanding, runnerUp]);

  return (
    <View style={styles.container}>
      {/* ─── 1. Heading ────────────────────────────────────────────────────── */}
      <AppText style={styles.headingTitle}>Results</AppText>

      {/* ─── 2. Champion Celebration Card ──────────────────────────────────── */}
      {isTournamentCompleted && championName && championStanding && (
        <TournamentChampionCard
          badgeLabel="TOURNAMENT CHAMPION"
          championName={championName}
          statPills={championStatPills}
        />
      )}

      {/* ─── 3. Empty State vs Standardized Round Groups ───────────────────── */}
      {completedMatches.length === 0 ? (
        <TournamentEmptyCard
          icon={<FileText size={30} color="#94A3B8" />}
          title="No results recorded yet"
          description="Completed scramble games and scores will appear here after results are entered in Rounds."
        />
      ) : (
        <View style={styles.resultsContent}>
          {completedRounds.map((group) => (
            <View key={`scramble-round-${group.roundNumber}`} style={styles.roundSection}>
              {/* Standard Round Header */}
              <TournamentRoundHeading
                title={`ROUND ${group.roundNumber}`}
                badgeLabel={`${group.matches.length} Finished`}
              />

              {/* Standardized Match Result Cards */}
              <View style={styles.matchesList}>
                {group.matches.map((match) => {
                  const scoreA = match.score_a ?? 0;
                  const scoreB = match.score_b ?? 0;
                  const courtLabel = getCourtDisplayLabel(match, { unassignedLabel: 'Court 1' });
                  const sideANames = formatPartnerNames(match.side_a_participants);
                  const sideBNames = formatPartnerNames(match.side_b_participants);
                  const teamAWon = scoreA > scoreB;
                  const teamBWon = scoreB > scoreA;
                  const winnerName = teamAWon ? sideANames : teamBWon ? sideBNames : undefined;

                  return (
                    <TournamentResultMatchCard
                      key={match.id}
                      metaText={`Round ${group.roundNumber} · ${courtLabel}`}
                      statusLabel="Completed"
                      statusVariant="success"
                      sideAName={sideANames}
                      scoreA={scoreA}
                      isWinnerA={teamAWon}
                      sideBName={sideBNames}
                      scoreB={scoreB}
                      isWinnerB={teamBWon}
                      winnerName={winnerName}
                      canEdit={canManage && !isTournamentCompleted && Boolean(onOpenScoreModal)}
                      onEdit={() => onOpenScoreModal?.(match)}
                    />
                  );
                })}
              </View>
            </View>
          ))}
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
  headingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#102F2B',
  },
  resultsContent: {
    gap: Spacing[3],
  },
  roundSection: {
    gap: Spacing[2],
  },
  matchesList: {
    gap: Spacing[2],
  },
});
