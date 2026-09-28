/**
 * Aught2 Pickleball — RoundRobinTeamsTab (Players & Teams Screen)
 *
 * Screen 1 for Round Robin Tournament Mode:
 * - Summary overview card: Registered players (8/8), Registered teams (4/4), Category, Registration type
 * - Section heading: Teams (4) · 8 Players [DOUBLES] or Players (count) [SINGLES]
 * - Format information card: Light blue with Users icon & format description
 * - Populated state: Ranked list of registered teams / players sorted by team average rating:
 *   #1 Team Alpha
 *      Player A — 4.5
 *      Player B — 4.0
 *      Team Average — 4.25
 *   With Confirmed status badge and delete control
 */

import React, { useMemo } from 'react';
import {
  Alert,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { UserPlus, Trash2, CheckCircle2, Shield } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Colors, Radius, Spacing } from '@/theme';
import type { Team, TeamMember, Tournament } from '@/types';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';

interface RoundRobinTeamsTabProps {
  tournament?: Tournament | null;
  teams: Team[];
  matchesExist: boolean;
  canModifyTeams: boolean;
  onAddTeamPress: () => void;
  onDeleteTeam: (teamId: string, teamName: string) => void;
  isDeletingTeam?: boolean;
  teamSize?: number;
}

export function RoundRobinTeamsTab({
  tournament,
  teams,
  matchesExist,
  canModifyTeams,
  onAddTeamPress,
  onDeleteTeam,
  teamSize = 1,
}: RoundRobinTeamsTabProps) {
  const config = useMemo(() => parseTournamentConfig(tournament), [tournament]);

  const effectiveTeamSize = teamSize > 1 ? teamSize : (config.teamSize > 1 ? config.teamSize : 1);
  const isDoubles = effectiveTeamSize > 1;

  // Derive counts based on singles vs doubles category logic:
  // For doubles, if max_participants is entered as team count (e.g. 8 for 8 doubles teams),
  // max teams is 8 and max players is 8 * 2 = 16.
  // If max_participants was entered as total players (e.g. 16), max teams is 16 / 2 = 8.
  const rawMax = tournament?.max_participants ?? (isDoubles ? teams.length : teams.length);
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

  // Count registered players across registered teams
  const registeredPlayersCount = isDoubles
    ? teams.reduce(
        (sum, t) => sum + (t.members && t.members.length > 0 ? t.members.length : effectiveTeamSize),
        0
      )
    : teams.length;
  const registeredTeamsCount = teams.length;

  const categoryLabel =
    config.category || (isDoubles ? "Men's Doubles" : 'Singles');

  const getPlayerRating = (member?: TeamMember | null): number => {
    if (member?.skill_rating !== undefined && member?.skill_rating !== null) {
      return member.skill_rating;
    }
    return 3.5;
  };

  const getTeamAverage = (team: Team): number => {
    if (teamSize === 1) {
      return getPlayerRating(team.members[0]);
    }
    const r1 = getPlayerRating(team.members[0]);
    const r2 = getPlayerRating(team.members[1]);
    return Number(((r1 + r2) / 2).toFixed(2));
  };

  // Sort teams: respect explicit seed first, then average skill rating descending
  const sortedTeams = useMemo(() => {
    return [...teams].sort((a, b) => {
      if (a.seed !== null && a.seed !== undefined && b.seed !== null && b.seed !== undefined) {
        if (a.seed !== b.seed) return a.seed - b.seed;
      }
      const avgA = getTeamAverage(a);
      const avgB = getTeamAverage(b);
      if (avgB !== avgA) return avgB - avgA;
      return a.name.localeCompare(b.name);
    });
  }, [teams, teamSize]);

  const handleDeleteConfirm = (teamId: string, teamName: string) => {
    Alert.alert(
      teamSize === 1 ? 'Remove Player Entry' : 'Remove Team',
      `Are you sure you want to remove "${teamName}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => onDeleteTeam(teamId, teamName),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Tournament Registration & Category Overview Card */}
      <Card style={styles.summaryOverviewCard}>
        <View style={styles.summaryOverviewRow}>
          <AppText style={styles.summaryOverviewLabel}>Registered players:</AppText>
          <AppText style={styles.summaryOverviewValue}>
            {registeredPlayersCount} / {maxPlayersCount}
          </AppText>
        </View>

        {isDoubles && (
          <View style={styles.summaryOverviewRow}>
            <AppText style={styles.summaryOverviewLabel}>Registered teams:</AppText>
            <AppText style={styles.summaryOverviewValue}>
              {registeredTeamsCount} / {maxTeamsCount}
            </AppText>
          </View>
        )}

        <View style={styles.summaryOverviewRow}>
          <AppText style={styles.summaryOverviewLabel}>Competition category:</AppText>
          <AppText style={styles.summaryOverviewValue}>{categoryLabel}</AppText>
        </View>

        <View style={styles.summaryOverviewRow}>
          <AppText style={styles.summaryOverviewLabel}>Registration type:</AppText>
          <AppText style={styles.summaryOverviewValue}>
            {isDoubles ? 'Fixed teams' : 'Singles individual'}
          </AppText>
        </View>
      </Card>

      {/* Section Heading: Teams (N) · X Players [DOUBLES] */}
      <View style={styles.headerRow}>
        <AppText style={styles.headingTitle}>
          {isDoubles
            ? `Teams (${registeredTeamsCount})`
            : `Players (${registeredTeamsCount})`}
        </AppText>
        {isDoubles && (
          <AppText style={styles.headingSub}>
            · {registeredPlayersCount} Players
          </AppText>
        )}
        <View style={styles.categoryBadge}>
          <AppText style={styles.categoryBadgeText}>
            {isDoubles ? 'DOUBLES' : 'SINGLES'}
          </AppText>
        </View>
      </View>

      {/* Format Information Card */}
      <View style={styles.infoCard}>
        <View style={styles.infoIconCol}>
          <UserPlus size={20} color="#0284C7" />
        </View>
        <View style={styles.infoContentCol}>
          <AppText style={styles.infoTitle}>
            {teamSize === 1 ? 'Singles Format' : 'Fixed Partner Doubles Format'}
          </AppText>
          <AppText style={styles.infoDesc}>
            {teamSize === 1
              ? 'Each entry consists of 1 player who competes individually for all rounds. Every player will play every other player once.'
              : 'Each entry consists of 2 fixed partner players who compete together for all rounds. Every team will play every other team once.'}
          </AppText>
        </View>
      </View>

      {/* Empty State vs Team / Player List */}
      {sortedTeams.length === 0 ? (
        <Card style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <UserPlus size={30} color="#94A3B8" />
          </View>
          <AppText style={styles.emptyHeading}>
            {teamSize === 1 ? 'No players registered yet' : 'No teams registered yet'}
          </AppText>
          <AppText style={styles.emptySubtitle}>
            {teamSize === 1
              ? 'Players will appear here as they register for this tournament.'
              : 'Teams will appear here as players register and form pairs.'}
          </AppText>

          {canModifyTeams && (
            <TouchableOpacity
              style={styles.addPlayerBtn}
              onPress={onAddTeamPress}
              activeOpacity={0.8}
            >
              <UserPlus size={16} color="#FFFFFF" />
              <AppText style={styles.addPlayerBtnText}>
                {teamSize === 1 ? 'Add player' : 'Add team'}
              </AppText>
            </TouchableOpacity>
          )}
        </Card>
      ) : (
        /* Populated Team / Player List Ranked by Average Skill Rating */
        <View style={styles.playersList}>
          {sortedTeams.map((team, idx) => {
            const member1 = team.members[0];
            const member2 = team.members[1];
            const m1Rating = getPlayerRating(member1);
            const m2Rating = getPlayerRating(member2);
            const avgRating = getTeamAverage(team);
            const displaySeed = team.seed ?? idx + 1;

            return (
              <Card key={team.id} style={styles.playerCard}>
                {/* Header: Seed #, Team Name, Registration Status */}
                <View style={styles.cardHeaderRow}>
                  <View style={styles.seedBadge}>
                    <AppText style={styles.seedBadgeText}>#{displaySeed}</AppText>
                  </View>

                  <View style={styles.teamTitleCol}>
                    <AppText style={styles.teamNameText} numberOfLines={1}>
                      {team.name}
                    </AppText>
                  </View>

                  <View style={styles.confirmedBadge}>
                    <CheckCircle2 size={12} color="#065F46" />
                    <AppText style={styles.confirmedBadgeText}>Confirmed</AppText>
                  </View>
                </View>

                {/* Body: Player Details & Ratings */}
                <View style={styles.membersContainer}>
                  {teamSize === 1 ? (
                    <View style={styles.memberLine}>
                      <AppText style={styles.memberName}>
                        {member1?.display_name || member1?.user_email || 'Player 1'}
                      </AppText>
                      <AppText style={styles.memberRating}>
                        — {m1Rating.toFixed(1)}
                      </AppText>
                    </View>
                  ) : (
                    <>
                      <View style={styles.memberLine}>
                        <AppText style={styles.memberName}>
                          {member1?.display_name || member1?.user_email || 'Player 1'}
                        </AppText>
                        <AppText style={styles.memberRating}>
                          — {m1Rating.toFixed(1)}
                        </AppText>
                      </View>
                      <View style={styles.memberLine}>
                        <AppText style={styles.memberName}>
                          {member2?.display_name || member2?.user_email || 'Player 2'}
                        </AppText>
                        <AppText style={styles.memberRating}>
                          — {m2Rating.toFixed(1)}
                        </AppText>
                      </View>
                    </>
                  )}
                </View>

                {/* Footer: Team Average & Actions */}
                <View style={styles.cardFooterRow}>
                  <View style={styles.avgBadge}>
                    <AppText style={styles.avgBadgeText}>
                      {teamSize === 1
                        ? `Skill Rating — ${avgRating.toFixed(1)}`
                        : `Team Average — ${avgRating.toFixed(2)}`}
                    </AppText>
                  </View>

                  {canModifyTeams && !matchesExist && (
                    <TouchableOpacity
                      onPress={() => handleDeleteConfirm(team.id, team.name)}
                      style={styles.deleteBtn}
                      hitSlop={8}
                    >
                      <Trash2 size={16} color={Colors.status.error} />
                    </TouchableOpacity>
                  )}
                </View>
              </Card>
            );
          })}
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
  summaryOverviewCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 6,
  },
  summaryOverviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryOverviewLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  summaryOverviewValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102F2B',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginTop: 2,
  },
  headingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#102F2B',
  },
  headingSub: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  categoryBadge: {
    backgroundColor: '#EAF2FC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    marginLeft: 'auto',
  },
  categoryBadgeText: {
    color: '#2563EB',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  infoCard: {
    backgroundColor: '#EAF2FC',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoIconCol: {
    paddingTop: 2,
  },
  infoContentCol: {
    flex: 1,
    gap: 2,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102F2B',
  },
  infoDesc: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    borderRadius: 16,
    paddingVertical: 36,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 4,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102F2B',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#71817E',
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 280,
    lineHeight: 18,
  },
  addPlayerBtn: {
    backgroundColor: '#087A60',
    borderRadius: Radius.full,
    paddingVertical: 12,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    width: '100%',
    maxWidth: 220,
  },
  addPlayerBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  playersList: {
    gap: Spacing[3],
  },
  playerCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  seedBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EAF6EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seedBadgeText: {
    color: '#087A60',
    fontSize: 13,
    fontWeight: '800',
  },
  teamTitleCol: {
    flex: 1,
  },
  teamNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102F2B',
  },
  confirmedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  confirmedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  membersContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 4,
  },
  memberLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  memberRating: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284C7',
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  avgBadge: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  avgBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  deleteBtn: {
    padding: 6,
  },
});
