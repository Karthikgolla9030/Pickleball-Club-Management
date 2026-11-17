/**
 * Aught2 Pickleball — PoolPlayResultsTab
 *
 * Standardized Results view for Pool Play tournaments:
 * Master Reference: Follows Round Robin visual structure and components:
 * - Heading: Results
 * - Standard TournamentChampionCard when tournament / championship completes
 * - Standard TournamentEmptyCard when no completed matches exist
 * - Standard TournamentRoundHeading for Championship Bracket & Pool Stages
 * - Standard TournamentResultMatchCard for all completed matches
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
import type { Tournament } from '@/types';
import type { ChampionshipMatch, Match, PoolStandingRow, Team } from '@/types/poolPlay';

interface PoolPlayResultsTabProps {
  tournament?: Tournament | null;
  teams: Team[];
  matches: Match[];
  championshipMatches: ChampionshipMatch[];
  standingsByPool: Record<string, PoolStandingRow[]>;
  isSingles?: boolean;
}

export function PoolPlayResultsTab({
  tournament,
  teams: _teams,
  matches,
  championshipMatches,
  standingsByPool: _standingsByPool,
  isSingles = false,
}: PoolPlayResultsTabProps) {
  // Find final match in championship bracket (strictly excluding semifinals and 3rd place matches)
  const finalMatch = useMemo(() => {
    if (championshipMatches.length === 0) return null;
    const titleMatches = championshipMatches.filter(
      (m) => m.id !== 'CB-3RD' && m.roundName !== '3rd Place' && !m.roundName?.toLowerCase().includes('3rd')
    );
    if (titleMatches.length === 0) return null;
    const namedFinal = titleMatches.find((m) => m.roundName === 'Finals' || m.roundName === 'Final');
    if (namedFinal) return namedFinal;
    const maxRound = Math.max(...titleMatches.map((x) => x.roundIndex ?? 0));
    return titleMatches.find((m) => (m.roundIndex ?? 0) === maxRound) ?? null;
  }, [championshipMatches]);

  const championTeam = useMemo(() => {
    if (finalMatch && finalMatch.status === 'completed' && finalMatch.winner) {
      return finalMatch.winner;
    }
    return null;
  }, [finalMatch]);

  const runnerUpTeam = useMemo(() => {
    if (finalMatch && finalMatch.status === 'completed' && finalMatch.winner) {
      return finalMatch.winner.id === finalMatch.t1?.id ? finalMatch.t2 : finalMatch.t1;
    }
    return null;
  }, [finalMatch]);

  // Fallback to persisted metadata if available
  const persistedWinner = useMemo(() => {
    const fc = (tournament?.format_configuration as Record<string, any>) || {};
    return fc.winner || fc.final_results?.winner || fc.pool_play_state?.winner || null;
  }, [tournament?.format_configuration]);

  const persistedPodium = useMemo(() => {
    const fc = (tournament?.format_configuration as Record<string, any>) || {};
    return fc.podium || fc.final_results?.podium || [];
  }, [tournament?.format_configuration]);

  const championName = championTeam?.name || persistedWinner?.name || persistedWinner?.display_name || null;
  const championMembers = championTeam
    ? `${championTeam.p1.name} & ${championTeam.p2.name}`
    : (persistedWinner?.members && persistedWinner.members.length > 0
        ? persistedWinner.members.join(' & ')
        : (persistedWinner?.p1 && persistedWinner?.p2 ? `${persistedWinner.p1} & ${persistedWinner.p2}` : ''));

  const runnerUpName = runnerUpTeam?.name || (persistedPodium.length > 1 ? persistedPodium[1]?.team_name : null);

  const completedChampMatches = useMemo(() => {
    return championshipMatches.filter((m) => m.status === 'completed');
  }, [championshipMatches]);

  const completedPoolMatches = useMemo(() => {
    return matches.filter((m) => m.status === 'completed');
  }, [matches]);

  // Group completed pool matches by pool
  const poolGroups = useMemo(() => {
    const groups: Record<string, Match[]> = {};
    completedPoolMatches.forEach((m) => {
      const pKey = m.pool || 'A';
      if (!groups[pKey]) groups[pKey] = [];
      groups[pKey].push(m);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [completedPoolMatches]);

  const hasAnyResults = completedPoolMatches.length > 0 || completedChampMatches.length > 0 || Boolean(championName);

  const championStatPills = useMemo(() => {
    const pills: { icon?: React.ReactNode; text: string }[] = [
      {
        icon: <Award size={13} color="#087A60" />,
        text: 'Gold Medalist',
      },
    ];

    if (runnerUpName) {
      pills.push({
        text: `Runner-Up: ${runnerUpName}`,
      });
    }

    if (finalMatch && finalMatch.score1 !== null && finalMatch.score2 !== null) {
      pills.push({
        icon: <Award size={13} color="#087A60" />,
        text: `Final: ${finalMatch.score1} – ${finalMatch.score2}`,
      });
    }

    return pills;
  }, [runnerUpName, finalMatch]);

  return (
    <View style={styles.container}>
      {/* ─── 1. Heading ────────────────────────────────────────────────────── */}
      <AppText style={styles.headingTitle}>Results</AppText>

      {/* ─── 2. Champion Podium Card ───────────────────────────────────────── */}
      {championName ? (
        <TournamentChampionCard
          badgeLabel="TOURNAMENT CHAMPION"
          championName={championName}
          subtitle={!isSingles && championMembers ? championMembers : null}
          statPills={championStatPills}
        />
      ) : null}

      {/* ─── 3. Empty State vs Standardized Match Results ──────────────────── */}
      {!hasAnyResults ? (
        <TournamentEmptyCard
          icon={<FileText size={30} color="#94A3B8" />}
          title="No results recorded yet"
          description="Completed pool matches and championship playoff results will appear here after scores are recorded."
        />
      ) : (
        <View style={styles.resultsContent}>
          {/* A. Championship Bracket Results */}
          {completedChampMatches.length > 0 && (
            <View style={styles.sectionWrap}>
              <TournamentRoundHeading
                title="CHAMPIONSHIP BRACKET"
                badgeLabel={`${completedChampMatches.length} Finished`}
              />

              <View style={styles.matchesList}>
                {completedChampMatches.map((m) => {
                  const isT1Winner = m.winner?.id === m.t1?.id;
                  const isT2Winner = m.winner?.id === m.t2?.id;
                  const t1Members = m.t1 && !isSingles ? `${m.t1.p1.name} & ${m.t1.p2.name}` : undefined;
                  const t2Members = m.t2 && !isSingles ? `${m.t2.p1.name} & ${m.t2.p2.name}` : undefined;

                  return (
                    <TournamentResultMatchCard
                      key={m.id}
                      metaText={`${m.roundName} · ${m.court || 'Center Court'}`}
                      statusLabel="Completed"
                      statusVariant="success"
                      sideAName={m.t1?.name ?? 'TBD'}
                      sideASubtitle={t1Members}
                      scoreA={m.score1}
                      isWinnerA={isT1Winner}
                      sideBName={m.t2?.name ?? 'TBD'}
                      sideBSubtitle={t2Members}
                      scoreB={m.score2}
                      isWinnerB={isT2Winner}
                      winnerName={m.winner?.name}
                    />
                  );
                })}
              </View>
            </View>
          )}

          {/* B. Pool Play Match Results Grouped by Pool */}
          {poolGroups.map(([poolKey, poolMatches]) => (
            <View key={`pool-results-${poolKey}`} style={styles.sectionWrap}>
              <TournamentRoundHeading
                title={`POOL ${poolKey} MATCHES`}
                badgeLabel={`${poolMatches.length} Finished`}
              />

              <View style={styles.matchesList}>
                {poolMatches.map((match) => {
                  const isT1Winner = match.winner?.id === match.t1.id;
                  const isT2Winner = match.winner?.id === match.t2.id;
                  const t1Members = !isSingles ? `${match.t1.p1.name} & ${match.t1.p2.name}` : undefined;
                  const t2Members = !isSingles ? `${match.t2.p1.name} & ${match.t2.p2.name}` : undefined;

                  return (
                    <TournamentResultMatchCard
                      key={match.id}
                      metaText={`Pool ${poolKey} · ${match.court || 'Court'}`}
                      statusLabel="Completed"
                      statusVariant="success"
                      sideAName={match.t1.name}
                      sideASubtitle={t1Members}
                      scoreA={match.score1}
                      isWinnerA={isT1Winner}
                      sideBName={match.t2.name}
                      sideBSubtitle={t2Members}
                      scoreB={match.score2}
                      isWinnerB={isT2Winner}
                      winnerName={match.winner?.name}
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
  sectionWrap: {
    gap: Spacing[2],
  },
  matchesList: {
    gap: Spacing[2],
  },
});
