/**
 * Aught2 Pickleball — BracketTeamsTab
 *
 * Standardized Tab 2 for Bracket Tournament Mode:
 * - Registration summary card (registered players, max players, category, registration type)
 * - Standardized section heading with category badge (SINGLES / DOUBLES) and Add action
 * - Informational format callout card & locked roster status banner once matches exist
 * - Standardized TournamentTeamCard with seed, avg rating, Confirmed status badge, and player roster
 */

import React, { useMemo } from 'react';
import {
  Alert,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Users, UserPlus } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import {
  TournamentFormatInfoCard,
  TournamentRegistrationSummaryCard,
  TournamentSectionHeading,
  TournamentTeamCard,
} from '@/components/tournament-management';
import { Spacing } from '@/theme';
import type { Team, TeamMember, Tournament } from '@/types';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';

export interface BracketTeamsTabProps {
  tournament?: Tournament | null;
  teams: Team[];
  canManage: boolean;
  canModifyTeams: boolean;
  onOpenAddTeam: () => void;
  onDeleteTeam: (teamId: string) => Promise<void>;
  isDeletingTeam?: boolean;
  teamSize?: number;
  matchesCount?: number;
  status?: string;
}

export function BracketTeamsTab({
  tournament,
  teams,
  canManage,
  canModifyTeams,
  onOpenAddTeam,
  onDeleteTeam,
  isDeletingTeam = false,
  teamSize = 2,
  matchesCount = 0,
  status = 'draft',
}: BracketTeamsTabProps) {
  const config = useMemo(() => parseTournamentConfig(tournament), [tournament]);
  const effectiveTeamSize = teamSize > 1 ? teamSize : (config.teamSize > 1 ? config.teamSize : 1);
  const isDoubles = effectiveTeamSize > 1;

  // Derive counts based on singles vs doubles category logic
  const rawMax = tournament?.max_participants ?? (isDoubles ? teams.length * effectiveTeamSize : teams.length);
  let maxTeamsCount: number;
  let maxPlayersCount: number;

  if (isDoubles) {
    if (rawMax > 0 && rawMax <= Math.max(teams.length, 12)) {
      maxTeamsCount = rawMax;
      maxPlayersCount = rawMax * effectiveTeamSize;
    } else if (rawMax > 12) {
      maxPlayersCount = rawMax;
      maxTeamsCount = Math.floor(rawMax / effectiveTeamSize);
    } else {
      maxTeamsCount = Math.max(teams.length, 4);
      maxPlayersCount = maxTeamsCount * effectiveTeamSize;
    }
  } else {
    maxTeamsCount = rawMax;
    maxPlayersCount = rawMax;
  }

  const registeredPlayersCount = isDoubles
    ? teams.reduce(
        (sum, t) => sum + (t.members && t.members.length > 0 ? t.members.length : effectiveTeamSize),
        0
      )
    : teams.length;
  const registeredTeamsCount = teams.length;

  const categoryLabel =
    config.category || (isDoubles ? "Men's Doubles" : 'Singles');
  const registrationTypeLabel = isDoubles ? 'Fixed teams' : 'Singles individual';

  const handleDeleteConfirm = (team: Team) => {
    Alert.alert(
      effectiveTeamSize === 1 ? 'Remove Player' : 'Remove Team',
      `Are you sure you want to remove "${team.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => void onDeleteTeam(team.id),
        },
      ]
    );
  };

  // Helper to compute team average skill rating
  const getTeamAvgRating = (team: Team): number => {
    const ratings = (team.members || [])
      .map((m) => (m.skill_rating !== null && m.skill_rating !== undefined ? Number(m.skill_rating) : null))
      .filter((r): r is number => r !== null);
    if (ratings.length === 0) return 3.5;
    return Number((ratings.reduce((sum, r) => sum + r, 0) / ratings.length).toFixed(2));
  };

  // Sort teams by seed ascending, then rating descending, then name
  const sortedTeams = useMemo(() => {
    return [...teams].sort((a, b) => {
      if (a.seed !== null && a.seed !== undefined && b.seed !== null && b.seed !== undefined) {
        if (a.seed !== b.seed) return a.seed - b.seed;
      }
      if (a.seed !== null && a.seed !== undefined) return -1;
      if (b.seed !== null && b.seed !== undefined) return 1;
      const rA = getTeamAvgRating(a);
      const rB = getTeamAvgRating(b);
      if (rA !== rB) return rB - rA;
      return a.name.localeCompare(b.name);
    });
  }, [teams]);

  return (
    <View style={styles.container}>
      {/* ─── 1. Registration & Category Overview Card ─────────────────────── */}
      <TournamentRegistrationSummaryCard
        registeredPlayersCount={registeredPlayersCount}
        maxPlayersCount={maxPlayersCount}
        isDoubles={isDoubles}
        registeredTeamsCount={registeredTeamsCount}
        maxTeamsCount={maxTeamsCount}
        categoryLabel={categoryLabel}
        registrationTypeLabel={registrationTypeLabel}
      />

      {/* ─── 2. Section Heading: Players (N) [SINGLES] or Teams (N) [DOUBLES] ─ */}
      <TournamentSectionHeading
        title={isDoubles ? `Teams (${registeredTeamsCount})` : `Players (${registeredTeamsCount})`}
        subtitle={isDoubles ? `· ${registeredPlayersCount} Players` : null}
        badgeLabel={isDoubles ? 'DOUBLES' : 'SINGLES'}
        badgeVariant="blue"
        actionLabel={canManage && canModifyTeams ? (isDoubles ? 'Add Team' : 'Add Player') : undefined}
        onActionPress={onOpenAddTeam}
      />

      {/* ─── 3. Format Callout Card & Locked Roster Banner ─────────────────── */}
      {matchesCount > 0 ? (
        <TournamentFormatInfoCard
          variant="locked"
          title="Bracket Generated — Rosters Locked"
          description={
            isDoubles
              ? 'Teams and partner assignments cannot be modified while the bracket is active.'
              : 'Players cannot be modified while the bracket is active.'
          }
        />
      ) : (
        <TournamentFormatInfoCard
          variant="info"
          title={isDoubles ? 'Single Elimination Fixed Doubles Format' : 'Single Elimination Singles Format'}
          description={
            isDoubles
              ? 'Each entry consists of 2 fixed partner players who compete in a knockout elimination bracket. Winners advance until the final.'
              : 'Each entry consists of 1 player who competes in a knockout elimination bracket. Winners advance each round until a champion is crowned.'
          }
        />
      )}

      {/* ─── 4. Empty State vs Standardized Teams/Players List ──────────────── */}
      {sortedTeams.length === 0 ? (
        <Card style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <Users size={32} color="#94A3B8" />
          </View>
          <AppText style={styles.emptyTitle}>
            {isDoubles ? 'No teams registered yet' : 'No players registered yet'}
          </AppText>
          <AppText style={styles.emptySubtitle}>
            {isDoubles
              ? 'Teams will appear here as players register and form pairs.'
              : 'Players will appear here as they register for this tournament.'}
          </AppText>

          {canManage && canModifyTeams && (
            <TouchableOpacity
              style={styles.addFirstBtn}
              onPress={onOpenAddTeam}
              activeOpacity={0.8}
            >
              <UserPlus size={16} color="#FFFFFF" />
              <AppText style={styles.addFirstBtnText}>
                {isDoubles ? 'Add team' : 'Add player'}
              </AppText>
            </TouchableOpacity>
          )}
        </Card>
      ) : (
        <View style={styles.listContent}>
          {sortedTeams.map((item, index) => (
            <TournamentTeamCard
              key={item.id}
              name={item.name}
              seed={item.seed}
              displayIndex={index + 1}
              avgRating={getTeamAvgRating(item)}
              members={item.members}
              teamSize={effectiveTeamSize}
              statusLabel="Confirmed"
              statusBadgeVariant="success"
              canDelete={canManage && canModifyTeams && matchesCount === 0}
              onDelete={() => handleDeleteConfirm(item)}
              isDeleting={isDeletingTeam}
            />
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
  listContent: {
    gap: Spacing[3],
    paddingBottom: Spacing[8],
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: Spacing[6],
    alignItems: 'center',
    gap: 12,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  addFirstBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#087A60',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 9999,
    marginTop: 4,
  },
  addFirstBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
