/**
 * Aught2 Pickleball — MatchupsTab (Tab 2 for Pool Play)
 *
 * Master Reference: Follows Round Robin visual structure and components:
 * - 3-column Match Statistics Summary Card (Total, Completed, Remaining)
 * - Filter bar by Pool & Status using shared FilterChips component
 * - Action to start next upcoming round
 * - "Playing Now on Courts" active match section
 * - Standardized TournamentMatchCard component for intra-pool round robin matches
 * - Standardized empty states
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Swords } from 'lucide-react-native';
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
      <View style={styles.container}>
        <TournamentEmptyCard
          icon={<Swords size={32} color={Colors.brand.primary} />}
          title="No Matchups Generated"
          description="Head over to Teams & Pools and tap 'Create Matchups' to generate the intra-pool Round Robin schedule."
          actionButton={
            <Button
              label="Create Matchups Now"
              variant="primary"
              size="sm"
              onPress={onCreateMatchups}
            />
          }
        />
      </View>
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

  const poolChips: { key: PoolFilter; label: string }[] = [
    { key: 'all', label: 'All Pools' },
    ...pools.map((p) => ({ key: p.key as PoolFilter, label: `Pool ${p.key}` })),
  ];

  const statusChips: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: `All (${matches.length})` },
    { key: 'playing', label: `In Progress (${liveMatches.length})` },
    { key: 'upcoming', label: `Scheduled (${upcomingCount})` },
    { key: 'completed', label: `Completed (${completedCount})` },
  ];

  return (
    <View style={styles.container}>
      {/* ─── 1. Heading Row with Start Round Action ────────────────────────── */}
      <View style={styles.topControlRow}>
        <AppText style={styles.headingTitle}>Matchups</AppText>
        {upcomingCount > 0 && (
          <Button
            label="Start Round"
            variant="primary"
            size="sm"
            onPress={onStartRound}
          />
        )}
      </View>

      {/* ─── 2. Standardized 3-Column Match Summary Card ───────────────────── */}
      <TournamentMatchSummaryCard
        totalMatches={matches.length}
        completedMatches={completedCount}
        remainingMatches={Math.max(0, matches.length - completedCount)}
      />

      {/* ─── 3. Pool Filter Chips ──────────────────────────────────────────── */}
      {pools.length > 0 && (
        <FilterChips<PoolFilter>
          chips={poolChips}
          activeChip={selectedPool}
          onChipPress={setSelectedPool}
        />
      )}

      {/* ─── 4. Status Filter Chips ────────────────────────────────────────── */}
      <FilterChips<StatusFilter>
        chips={statusChips}
        activeChip={selectedStatus}
        onChipPress={setSelectedStatus}
      />

      {/* ─── 5. Playing Now Section ────────────────────────────────────────── */}
      {liveMatches.length > 0 && selectedStatus !== 'completed' && (
        <View style={styles.playingNowSection}>
          <View style={styles.pulsingHeader}>
            <View style={styles.pulseDot} />
            <AppText style={styles.liveHeading}>
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
                  <AppText style={styles.teamTitle}>
                    {match.t1.name}
                  </AppText>
                  <AppText style={styles.teamSubtitle} numberOfLines={1}>
                    {match.t1.p1.name} & {match.t1.p2.name}
                  </AppText>
                </View>

                <View style={styles.versusPill}>
                  <AppText style={styles.versusText}>VS</AppText>
                </View>

                <View style={[styles.teamCol, styles.teamColRight]}>
                  <AppText style={styles.teamTitle}>
                    {match.t2.name}
                  </AppText>
                  <AppText style={styles.teamSubtitle} numberOfLines={1}>
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

      {/* ─── 6. All Matches List ───────────────────────────────────────────── */}
      <View style={styles.matchesList}>
        {filteredMatches.map((match) => {
          const isCompleted = match.status === 'completed';
          const isPlaying = match.status === 'playing';
          const aWon = isCompleted && match.winner?.id === match.t1.id;
          const bWon = isCompleted && match.winner?.id === match.t2.id;
          const statusLabel = isPlaying ? 'In Progress' : isCompleted ? 'Completed' : 'Scheduled';
          const statusVariant = isPlaying ? 'warning' : isCompleted ? 'success' : 'default';

          return (
            <TournamentMatchCard
              key={match.id}
              metaText={`Pool ${match.pool} · ${match.round} · ${match.court || 'Court'}`}
              statusLabel={statusLabel}
              statusVariant={statusVariant}
              sideAName={match.t1.name}
              sideASubtitle={`${match.t1.p1.name} & ${match.t1.p2.name}`}
              scoreA={isCompleted ? match.score1 : null}
              isWinnerA={aWon}
              sideBName={match.t2.name}
              sideBSubtitle={`${match.t2.p1.name} & ${match.t2.p2.name}`}
              scoreB={isCompleted ? match.score2 : null}
              isWinnerB={bWon}
              winnerName={isCompleted ? match.winner?.name : null}
              isCompleted={isCompleted}
              canManage={true}
              onOpenScoreModal={!isCompleted ? () => setActiveMatchForScore(match) : undefined}
              onEditScore={isCompleted && !isTournamentCompleted ? () => setActiveMatchForScore(match) : undefined}
            />
          );
        })}
      </View>

      {/* ─── Score Entry Modal ─────────────────────────────────────────────── */}
      {activeMatchForScore && (
        <ScoreEntryModal
          visible={Boolean(activeMatchForScore)}
          match={activeMatchForScore}
          onClose={() => setActiveMatchForScore(null)}
          onSave={(s1, s2) => {
            onRecordScore(activeMatchForScore.id, s1, s2);
            setActiveMatchForScore(null);
          }}
        />
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
  topControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#102F2B',
  },
  playingNowSection: {
    gap: Spacing[2],
  },
  pulsingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0F766E',
  },
  liveHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F766E',
    letterSpacing: 0.5,
  },
  liveCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#99F6E4',
    borderRadius: 14,
    padding: 14,
    gap: 12,
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
    fontSize: 14,
    fontWeight: '700',
    color: '#102F2B',
  },
  teamSubtitle: {
    fontSize: 11,
    color: '#64748B',
  },
  versusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    marginHorizontal: 8,
  },
  versusText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  matchesList: {
    gap: Spacing[2],
  },
});
