/**
 * Aught2 Pickleball — BracketResultsTab
 *
 * Standardized Results view for Bracket Tournament Mode (Single & Double Elimination)
 * Master Reference: Follows Round Robin visual structure and components:
 * - Heading: Results
 * - Standard TournamentChampionCard when tournament is completed (podium, runner-up, final scoreline)
 * - Standard TournamentEmptyCard when no completed matches exist
 * - Standard TournamentRoundHeading for each elimination stage (Finals, Semifinals, Quarterfinals...)
 * - Standard TournamentResultMatchCard for every completed match
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
import type { Court, Match, Team } from '@/types';
import type { BracketProgress } from '@/types/bracket';
import { getBracketRoundName, isMatchBye } from '@/utils/bracketLogic';
import { getCourtDisplayLabel } from '@/utils';

interface BracketResultsTabProps {
  matches: Match[];
  teams: Team[];
  courts: Court[];
  progress: BracketProgress;
  canManage: boolean;
  onEditScore: (match: Match) => void;
  isTournamentCompleted?: boolean;
}

interface MatchGroup {
  key: string;
  title: string;
  order: number;
  matches: Match[];
}

export function BracketResultsTab({
  matches,
  teams,
  courts,
  progress,
  canManage,
  onEditScore,
  isTournamentCompleted = false,
}: BracketResultsTabProps) {
  // Only completed, non-BYE matches
  const completedMatches = useMemo(
    () => matches.filter((m) => m.status === 'completed' && !isMatchBye(m)),
    [matches]
  );

  const totalRounds = useMemo(() => {
    if (matches.length === 0) return 1;
    return Math.max(...matches.map((m) => m.bracket_round ?? m.round_number ?? 1), 1);
  }, [matches]);

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

  // Find champion team details & decider match
  const finalMatch = useMemo(() => {
    if (isDoubleElimination) {
      const resetMatch = matches.find(
        (m) => m.bracket_section === 'reset_final' || m.label?.includes('Reset Match')
      );
      const grandMatch = matches.find(
        (m) => m.bracket_section === 'grand_final' || m.label === 'Grand Final'
      );
      if (resetMatch && resetMatch.status === 'completed' && resetMatch.winner_team_id) {
        return resetMatch;
      }
      if (
        grandMatch &&
        grandMatch.status === 'completed' &&
        grandMatch.winner_team_id &&
        (!resetMatch || resetMatch.status === 'cancelled')
      ) {
        return grandMatch;
      }
      if (resetMatch && resetMatch.status === 'pending') {
        return resetMatch;
      }
      return grandMatch || null;
    }
    return matches.find((m) => m.next_match_id === null && m.bracket_round !== null) || null;
  }, [matches, isDoubleElimination]);

  const resetMatch = useMemo(
    () => matches.find((m) => m.bracket_section === 'reset_final' || m.label?.includes('Reset Match')),
    [matches]
  );

  const championTeam = useMemo(() => {
    if (!finalMatch || finalMatch.status !== 'completed' || !finalMatch.winner_team_id) {
      return null;
    }
    return (
      teams.find((t) => t.id === finalMatch.winner_team_id) ??
      finalMatch.winner_team ??
      (finalMatch.winner_team_id === finalMatch.team_a_id ? finalMatch.team_a : finalMatch.team_b) ??
      null
    );
  }, [finalMatch, teams]);

  const championMembers = useMemo(() => {
    if (!championTeam) return [];
    if ('members' in championTeam && Array.isArray((championTeam as Team).members)) {
      return (championTeam as Team).members;
    }
    const foundTeam = teams.find((t) => t.id === championTeam.id);
    return foundTeam?.members || [];
  }, [championTeam, teams]);

  const runnerUpTeam = useMemo(() => {
    if (!finalMatch || finalMatch.status !== 'completed' || !finalMatch.winner_team_id) {
      return null;
    }
    const runnerUpId =
      finalMatch.winner_team_id === finalMatch.team_a_id ? finalMatch.team_b_id : finalMatch.team_a_id;
    if (!runnerUpId) return null;
    return (
      teams.find((t) => t.id === runnerUpId) ??
      (runnerUpId === finalMatch.team_a_id ? finalMatch.team_a : finalMatch.team_b) ??
      null
    );
  }, [finalMatch, teams]);

  const isFinished = progress.isFinished || (isTournamentCompleted && championTeam !== null);

  const getTeamMembersText = (teamId?: string | null) => {
    if (!teamId) return null;
    const found = teams.find((t) => t.id === teamId);
    if (!found || found.members.length === 0) return null;
    const m1 = found.members[0];
    const m2 = found.members[1];
    const n1 = m1?.display_name || m1?.user_email || 'Player 1';
    if (!m2) return n1;
    const n2 = m2.display_name || m2.user_email || 'Player 2';
    return `${n1} & ${n2}`;
  };

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
    return 'Court';
  };

  // Group completed matches by elimination stage
  const stageGroups = useMemo(() => {
    const map = new Map<string, MatchGroup>();

    completedMatches.forEach((m) => {
      const roundNum = m.bracket_round ?? m.round_number ?? 1;
      let stageTitle = '';
      let stageOrder = roundNum;

      if (m.bracket_section === 'grand_final') {
        stageTitle = 'GRAND FINAL';
        stageOrder = 1000;
      } else if (m.bracket_section === 'reset_final') {
        stageTitle = 'RESET FINAL';
        stageOrder = 1001;
      } else if (m.bracket_section === 'losers') {
        stageTitle = `LOSERS ROUND ${roundNum}`;
        stageOrder = 500 + roundNum;
      } else {
        const roundName = getBracketRoundName(roundNum, totalRounds);
        stageTitle = (m.label || roundName).toUpperCase();
        stageOrder = roundNum;
      }

      if (!map.has(stageTitle)) {
        map.set(stageTitle, {
          key: stageTitle,
          title: stageTitle,
          order: stageOrder,
          matches: [],
        });
      }
      map.get(stageTitle)!.matches.push(m);
    });

    // Sort stages: Chronological order (Round 1, Quarterfinals, Semifinals, Finals)
    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  }, [completedMatches, totalRounds]);

  const championSubtitle = useMemo(() => {
    if (championMembers.length === 0) return null;
    return championMembers.map((m) => m.display_name || m.user_email).filter(Boolean).join(' & ');
  }, [championMembers]);

  const championStatPills = useMemo(() => {
    const pills: { icon?: React.ReactNode; text: string }[] = [];

    if (runnerUpTeam) {
      pills.push({
        text: `Runner-Up: ${runnerUpTeam.name}`,
      });
    }

    if (finalMatch && finalMatch.score_a !== null && finalMatch.score_b !== null) {
      pills.push({
        icon: <Award size={13} color="#087A60" />,
        text: `Final: ${finalMatch.score_a} – ${finalMatch.score_b}`,
      });
    }

    if (isDoubleElimination) {
      pills.push({
        text: resetMatch?.status === 'completed'
          ? 'Reset Final Decided'
          : 'Grand Final Winner',
      });
    }

    return pills;
  }, [runnerUpTeam, finalMatch, isDoubleElimination, resetMatch]);

  return (
    <View style={styles.container}>
      {/* ─── 1. Heading ────────────────────────────────────────────────────── */}
      <AppText style={styles.headingTitle}>Results</AppText>

      {/* ─── 2. Champion Celebration Card (When Completed) ─────────────────── */}
      {isFinished && championTeam && (
        <TournamentChampionCard
          badgeLabel="TOURNAMENT CHAMPION"
          championName={championTeam.name}
          subtitle={championSubtitle}
          statPills={championStatPills}
        />
      )}

      {/* ─── 3. Empty State vs Standardized Stage Groups ───────────────────── */}
      {completedMatches.length === 0 ? (
        <TournamentEmptyCard
          icon={<FileText size={30} color="#94A3B8" />}
          title="No results recorded yet"
          description="Completed bracket matches and scores will appear here after results are entered in Matches."
        />
      ) : (
        <View style={styles.resultsContent}>
          {stageGroups.map((group) => (
            <View key={group.key} style={styles.stageSection}>
              {/* Standard Round / Stage Heading */}
              <TournamentRoundHeading
                title={group.title}
                badgeLabel={`${group.matches.length} Finished`}
              />

              {/* Standardized Match Result Cards */}
              <View style={styles.matchesList}>
                {group.matches.map((match) => {
                  const teamAName = match.team_a?.name ?? 'Team A';
                  const teamBName = match.team_b?.name ?? 'Team B';
                  const aWon = match.winner_team_id === match.team_a_id;
                  const bWon = match.winner_team_id === match.team_b_id;
                  const courtLabel = getCourtName(match);
                  const teamAMembers = getTeamMembersText(match.team_a_id);
                  const teamBMembers = getTeamMembersText(match.team_b_id);
                  const winnerName = aWon ? teamAName : bWon ? teamBName : undefined;

                  return (
                    <TournamentResultMatchCard
                      key={match.id}
                      metaText={`Match #${match.match_number ?? match.bracket_position ?? 1} · ${courtLabel}`}
                      statusLabel="Completed"
                      statusVariant="success"
                      sideAName={teamAName}
                      sideASubtitle={teamAMembers}
                      scoreA={match.score_a}
                      isWinnerA={aWon}
                      sideBName={teamBName}
                      sideBSubtitle={teamBMembers}
                      scoreB={match.score_b}
                      isWinnerB={bWon}
                      winnerName={winnerName}
                      canEdit={canManage && !isFinished}
                      onEdit={() => onEditScore(match)}
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
  stageSection: {
    gap: Spacing[2],
  },
  matchesList: {
    gap: Spacing[2],
  },
});
