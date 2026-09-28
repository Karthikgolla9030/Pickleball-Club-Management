/**
 * Aught2 Pickleball — MatchupsTab (Tab 2)
 *
 * Intra-pool round robin match list with court allocation:
 * - Filter bar by Pool & Status — uses shared FilterChips styling via FilterChips component
 * - "Start Round" action using shared Button component
 * - "PLAYING NOW" pulsing active match section
 * - Match cards with standardized scoreboardBox layout (matches Bracket/RR)
 * - Score action via shared Button component (not bespoke pill)
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/StateViews';
import { FilterChips } from '@/components/FilterChips';
import { Colors, Radius, Spacing } from '@/theme';
import type { Match, PoolStat } from '@/types/poolPlay';
import { ScoreEntryModal } from './modals/ScoreEntryModal';

type PoolFilter = 'all' | string;
type StatusFilter = 'all' | 'playing' | 'upcoming' | 'completed';

interface MatchupsTabProps {
  matches: Match[];
  pools: PoolStat[];
  onStartRound: () => void;
  onRecordScore: (matchId: string, score1: number, score2: number) => void;
  onCreateMatchups: () => void;
  isTournamentCompleted?: boolean;
}

export function MatchupsTab({
  matches,
  pools,
  onStartRound,
  onRecordScore,
  onCreateMatchups,
  isTournamentCompleted = false,
}: MatchupsTabProps) {
  const [selectedPool, setSelectedPool] = useState<PoolFilter>('all');
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('all');
  const [activeMatchForScore, setActiveMatchForScore] = useState<Match | null>(null);

  if (matches.length === 0) {
    return (
      <EmptyState
        title="No Matchups Generated"
        description="Head over to Teams & Pools and tap 'Create Matchups' to generate the intra-pool Round Robin schedule."
        actionLabel="Create Matchups Now"
        onAction={onCreateMatchups}
      />
    );
  }

  // Filter matches
  const filteredMatches = matches.filter((m) => {
    if (selectedPool !== 'all' && m.pool !== selectedPool) return false;
    if (selectedStatus !== 'all' && m.status !== selectedStatus) return false;
    return true;
  });

  const liveMatches = matches.filter((m) => m.status === 'playing');
  const upcomingCount = matches.filter((m) => m.status === 'upcoming').length;
  const completedCount = matches.filter((m) => m.status === 'completed').length;

  // Build pool filter chips using shared FilterChips component
  const poolChips: { key: PoolFilter; label: string }[] = [
    { key: 'all', label: 'All Pools' },
    ...pools.map((p) => ({ key: p.key as PoolFilter, label: `Pool ${p.key}` })),
  ];

  // Build status filter chips — wording aligned with app-wide terminology
  const statusChips: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: `All (${matches.length})` },
    { key: 'playing', label: `In Progress (${liveMatches.length})` },
    { key: 'upcoming', label: `Scheduled (${upcomingCount})` },
    { key: 'completed', label: `Completed (${completedCount})` },
  ];

  return (
    <View style={styles.container}>
      {/* ─── Top Control & "Start Round" Action ─────────────────────── */}
      <View style={styles.topControlRow}>
        <AppText variant="caption" color="secondary">
          {matches.length} Total • {completedCount} Completed
        </AppText>
        {upcomingCount > 0 && (
          <Button
            label="Start Round"
            variant="primary"
            size="sm"
            onPress={onStartRound}
          />
        )}
      </View>

      {/* ─── Pool Filter — shared FilterChips ───────────────────────── */}
      {pools.length > 0 && (
        <FilterChips<PoolFilter>
          chips={poolChips}
          activeChip={selectedPool}
          onChipPress={setSelectedPool}
        />
      )}

      {/* ─── Status Filter — shared FilterChips ─────────────────────── */}
      <FilterChips<StatusFilter>
        chips={statusChips}
        activeChip={selectedStatus}
        onChipPress={setSelectedStatus}
      />



      {/* ─── PLAYING NOW SECTION ───────────────────────────────────── */}
      {liveMatches.length > 0 && selectedStatus !== 'completed' && (
        <View style={styles.playingNowSection}>
          <View style={styles.pulsingHeader}>
            <View style={styles.pulseDot} />
            <AppText variant="heading3" style={styles.liveHeading}>
              PLAYING NOW ON COURTS
            </AppText>
          </View>

          {liveMatches.map((match) => (
            <Card key={match.id} style={styles.liveCard}>
              <View style={styles.cardTopRow}>
                <Badge label={match.court ?? 'Live'} variant="info" />
                <Badge label={`Pool ${match.pool} • ${match.round}`} variant="default" />
              </View>

              <View style={styles.teamsVersusRow}>
                <View style={styles.teamCol}>
                  <AppText variant="body" bold style={styles.teamTitle}>
                    {match.t1.name}
                  </AppText>
                  <AppText variant="caption" color="secondary" numberOfLines={1}>
                    {match.t1.p1.name} & {match.t1.p2.name}
                  </AppText>
                </View>

                <View style={styles.versusPill}>
                  <AppText style={styles.versusText}>VS</AppText>
                </View>

                <View style={[styles.teamCol, styles.teamColRight]}>
                  <AppText variant="body" bold style={styles.teamTitle}>
                    {match.t2.name}
                  </AppText>
                  <AppText variant="caption" color="secondary" numberOfLines={1}>
                    {match.t2.p1.name} & {match.t2.p2.name}
                  </AppText>
                </View>
              </View>

              <Button
                label="Enter Score"
                variant="primary"
                size="sm"
                onPress={() => setActiveMatchForScore(match)}
              />
            </Card>
          ))}
        </View>
      )}

      {/* ─── ALL MATCHES LIST ───────────────────────────────────────── */}
      <View style={styles.matchesList}>
        <AppText variant="caption" color="secondary" style={styles.listSectionTitle}>
          {selectedStatus === 'all'
            ? 'ALL INTRA-POOL MATCHES'
            : `${selectedStatus.toUpperCase()} MATCHES`}
        </AppText>

        {filteredMatches.map((match) => {
          const isCompleted = match.status === 'completed';
          const isPlaying = match.status === 'playing';

          return (
            <Card key={match.id} style={styles.matchCard}>
              <View style={styles.cardTopRow}>
                <AppText variant="caption" bold color="tertiary">
                  Pool {match.pool} • {match.round}
                </AppText>
                <Badge
                  label={
                    isPlaying
                      ? 'In Progress'
                      : isCompleted
                      ? 'Completed'
                      : 'Scheduled'
                  }
                  variant={
                    isPlaying ? 'warning' : isCompleted ? 'success' : 'default'
                  }
                />
              </View>

              {/* Standardized scoreboard box — matches Bracket & Round Robin card layout */}
              <View style={styles.scoreboardBox}>
                {/* Team 1 row */}
                <View style={[styles.teamRow, (isCompleted && match.winner?.id === match.t1.id) && styles.teamRowWinner]}>
                  <View style={styles.teamInfoCol}>
                    <AppText
                      variant="bodySmall"
                      numberOfLines={1}
                      style={[
                        styles.teamName,
                        (isCompleted && match.winner?.id === match.t1.id) && styles.winnerTeamName,
                      ]}
                    >
                      {match.t1.name}
                    </AppText>
                    <AppText variant="caption" color="secondary" numberOfLines={1} style={styles.memberNames}>
                      {match.t1.p1.name} & {match.t1.p2.name}
                    </AppText>
                  </View>
                  {isCompleted && (
                    <AppText
                      variant="heading3"
                      style={[
                        styles.scoreNum,
                        (match.winner?.id === match.t1.id) && styles.winningScoreNum,
                      ]}
                    >
                      {match.score1 ?? '—'}
                    </AppText>
                  )}
                </View>

                <View style={styles.divider} />

                {/* Team 2 row */}
                <View style={[styles.teamRow, (isCompleted && match.winner?.id === match.t2.id) && styles.teamRowWinner]}>
                  <View style={styles.teamInfoCol}>
                    <AppText
                      variant="bodySmall"
                      numberOfLines={1}
                      style={[
                        styles.teamName,
                        (isCompleted && match.winner?.id === match.t2.id) && styles.winnerTeamName,
                      ]}
                    >
                      {match.t2.name}
                    </AppText>
                    <AppText variant="caption" color="secondary" numberOfLines={1} style={styles.memberNames}>
                      {match.t2.p1.name} & {match.t2.p2.name}
                    </AppText>
                  </View>
                  {isCompleted && (
                    <AppText
                      variant="heading3"
                      style={[
                        styles.scoreNum,
                        (match.winner?.id === match.t2.id) && styles.winningScoreNum,
                      ]}
                    >
                      {match.score2 ?? '—'}
                    </AppText>
                  )}
                </View>
              </View>

              {/* Card footer: court pill + action button */}
              <View style={styles.cardFooter}>
                {match.court ? (
                  <View style={styles.courtPill}>
                    <AppText variant="caption" style={styles.courtText}>
                      {match.court}
                    </AppText>
                  </View>
                ) : (
                  <View style={{ flex: 1 }} />
                )}
                {!isTournamentCompleted && (
                  <Button
                    label={isCompleted ? 'Edit Score' : 'Enter Score'}
                    variant={isCompleted ? 'outline' : 'primary'}
                    size="sm"
                    onPress={() => setActiveMatchForScore(match)}
                  />
                )}
              </View>
            </Card>
          );
        })}
      </View>

      {/* ─── Score Entry Modal ─────────────────────────────────────── */}
      <ScoreEntryModal
        visible={Boolean(activeMatchForScore)}
        onClose={() => setActiveMatchForScore(null)}
        match={activeMatchForScore}
        onSave={(s1, s2) => {
          if (activeMatchForScore) {
            onRecordScore(activeMatchForScore.id, s1, s2);
          }
        }}
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
  topControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playingNowSection: {
    gap: Spacing[2],
  },
  pulsingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.status.success,
  },
  liveHeading: {
    fontSize: 13,
    color: Colors.status.success,
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  liveCard: {
    backgroundColor: Colors.status.infoBg,
    borderWidth: 1.5,
    borderColor: Colors.status.info,
    borderRadius: Radius.lg,
    padding: Spacing[3],
    gap: Spacing[3],
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamsVersusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamCol: {
    flex: 1,
    gap: 2,
  },
  teamColRight: {
    alignItems: 'flex-end',
  },
  teamTitle: {
    color: Colors.text.primary,
  },
  versusPill: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface.elevated,
  },
  versusText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.text.tertiary,
  },
  matchesList: {
    gap: Spacing[2],
  },
  listSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: Spacing[1],
  },
  matchCard: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.lg,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.surface.border,
    gap: Spacing[2],
  },
  // Standardized scoreboard box — matches Bracket & Round Robin match card layout
  scoreboardBox: {
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.md,
    padding: Spacing[2],
    gap: 0,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing[1.5],
    paddingHorizontal: Spacing[1.5],
    borderRadius: Radius.sm,
  },
  teamRowWinner: {
    backgroundColor: Colors.status.successBg,
  },
  teamInfoCol: {
    flex: 1,
    gap: 1,
  },
  teamName: {
    color: Colors.text.secondary,
    fontSize: 14,
  },
  winnerTeamName: {
    color: Colors.text.primary,
    fontWeight: '700',
  },
  memberNames: {
    fontSize: 11,
  },
  scoreNum: {
    color: Colors.text.secondary,
    minWidth: 28,
    textAlign: 'right',
    fontSize: 18,
    fontWeight: '700',
  },
  winningScoreNum: {
    color: Colors.status.success,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surface.border,
    marginHorizontal: Spacing[1.5],
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
    marginTop: 2,
  },
  courtPill: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  courtText: {
    color: Colors.text.secondary,
    fontSize: 11,
    fontWeight: '600',
  },
});

