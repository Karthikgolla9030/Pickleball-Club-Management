/**
 * Aught2 Pickleball — PlayerLeagueTeamsTab
 *
 * Standardized Players / Teams tab for Player League Details:
 * - Dynamic tab behavior: Singles -> 'Players', Doubles -> 'Teams'
 * - Summary Card (registered count vs capacity, category, registration type)
 * - Section heading with category badge (e.g. 'Players (8)' with 'SINGLES' badge)
 * - Format information banner
 * - Search bar
 * - Standardized player/team cards with seed badge, name, avg rating, status, and members list
 */

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { Search, Star, UserCheck, Users } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import type { LeagueStandingRow, LeagueSummary, LeagueTeam } from '@/types';

export interface LeagueParticipantMember {
  id: string;
  name: string;
  rating: string;
}

export interface LeagueParticipantEntry {
  id: string;
  name: string;
  seed: number;
  avgRating: string;
  status: string;
  members: LeagueParticipantMember[];
}

export interface PlayerLeagueTeamsTabProps {
  league: LeagueSummary;
  teams?: LeagueTeam[];
  standings?: LeagueStandingRow[];
  isLoading?: boolean;
}

export function PlayerLeagueTeamsTab({
  league,
  teams,
  standings,
  isLoading = false,
}: PlayerLeagueTeamsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const isSingles =
    (league.team_size ?? 2) === 1 ||
    (league.category?.toLowerCase().includes('singles') ?? false);

  const entries = useMemo<LeagueParticipantEntry[]>(() => {
    if (teams && teams.length > 0) {
      return teams.map((team, index) => {
        let avgRating = '4.00';
        if (team.avg_skill_level != null) {
          avgRating = Number(team.avg_skill_level).toFixed(2);
        } else if (team.members && team.members.length > 0) {
          const sum = team.members.reduce((acc, m) => acc + (m.skill_rating ?? 4.0), 0);
          avgRating = (sum / team.members.length).toFixed(2);
        }

        const membersList: LeagueParticipantMember[] =
          team.members && team.members.length > 0
            ? team.members.map((m) => ({
                id: m.id,
                name: m.display_name || m.user?.full_name || 'Player',
                rating: (m.skill_rating ?? 4.0).toFixed(1),
              }))
            : [
                {
                  id: team.id,
                  name: team.name,
                  rating: Number(avgRating).toFixed(1),
                },
              ];

        return {
          id: team.id,
          name: team.name,
          seed: team.seed ?? index + 1,
          avgRating,
          status: 'Confirmed',
          members: membersList,
        };
      });
    }

    if (standings && standings.length > 0) {
      return standings.map((row, index) => {
        const membersList: LeagueParticipantMember[] =
          row.members && row.members.length > 0
            ? row.members.map((mName: string, i: number) => ({
                id: `${row.team_id}-${i}`,
                name: mName,
                rating: '4.0',
              }))
            : [
                {
                  id: row.team_id,
                  name: row.team_name,
                  rating: '4.0',
                },
              ];

        return {
          id: row.team_id,
          name: row.team_name,
          seed: row.rank ?? index + 1,
          avgRating: '4.00',
          status: 'Confirmed',
          members: membersList,
        };
      });
    }

    return [];
  }, [teams, standings]);

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase().trim();
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.members.some((m: LeagueParticipantMember) => m.name.toLowerCase().includes(q))
    );
  }, [entries, searchQuery]);

  const totalCount = entries.length;
  const capacity = league.max_teams || 12;
  const categoryLabel = isSingles ? 'SINGLES' : 'DOUBLES';

  return (
    <View style={styles.container}>
      {/* ─── 1. Registration Summary Card ─── */}
      <Card style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <AppText variant="caption" style={styles.summaryLabel}>
            Registered {isSingles ? 'players' : 'teams'}:
          </AppText>
          <AppText variant="bodySmall" bold style={styles.summaryValue}>
            {totalCount} / {capacity}
          </AppText>
        </View>

        <View style={styles.summaryRow}>
          <AppText variant="caption" style={styles.summaryLabel}>
            Competition category:
          </AppText>
          <AppText variant="bodySmall" bold style={styles.summaryValue}>
            {league.category || (isSingles ? 'Singles' : 'Doubles')}
          </AppText>
        </View>

        <View style={styles.summaryRow}>
          <AppText variant="caption" style={styles.summaryLabel}>
            Registration type:
          </AppText>
          <AppText variant="bodySmall" bold style={styles.summaryValue}>
            {isSingles ? 'Singles individual' : 'Fixed Team (Doubles)'}
          </AppText>
        </View>
      </Card>

      {/* ─── 2. Section Heading with Category Badge ─── */}
      <View style={styles.headingRow}>
        <AppText variant="heading2" bold style={styles.headingTitle}>
          {isSingles ? 'Players' : 'Teams'} ({totalCount})
        </AppText>

        <View style={styles.categoryBadge}>
          <AppText variant="caption" bold style={styles.categoryBadgeText}>
            {categoryLabel}
          </AppText>
        </View>
      </View>

      {/* ─── 3. Format Information Banner ─── */}
      <View style={styles.formatInfoCard}>
        <Users size={18} color="#0284C7" style={{ marginTop: 2 }} />
        <View style={styles.formatInfoTextWrap}>
          <AppText variant="bodySmall" bold style={styles.formatInfoTitle}>
            {isSingles ? 'Singles Format' : 'Doubles Team Format'}
          </AppText>
          <AppText variant="caption" style={styles.formatInfoDesc}>
            {isSingles
              ? 'Each entry consists of 1 player who competes individually for all rounds. Every player will play every other player across the regular season.'
              : 'Each entry consists of a team of 2 registered players who compete together for all scheduled weekly fixtures.'}
          </AppText>
        </View>
      </View>

      {/* ─── 4. Search Filter ─── */}
      <View style={styles.searchContainer}>
        <Search size={16} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          placeholder={`Search ${isSingles ? 'players' : 'teams'}...`}
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* ─── 5. Player / Team Cards List ─── */}
      {isLoading && entries.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#065F46" />
          <AppText style={styles.loadingText}>
            Loading {isSingles ? 'players' : 'teams'}...
          </AppText>
        </View>
      ) : filteredEntries.length === 0 ? (
        <Card style={styles.emptyCard}>
          <UserCheck size={28} color="#94A3B8" />
          <AppText variant="body" bold style={styles.emptyTitle}>
            No {isSingles ? 'players' : 'teams'} found
          </AppText>
          <AppText variant="caption" style={styles.emptySubtitle}>
            {searchQuery
              ? 'Try matching a different name'
              : `No confirmed ${isSingles ? 'players' : 'teams'} registered yet`}
          </AppText>
        </Card>
      ) : (
        <View style={styles.entriesList}>
          {filteredEntries.map((entry) => (
            <Card key={entry.id} style={styles.playerCard}>
              {/* Top Header of Card */}
              <View style={styles.cardTopRow}>
                <View style={styles.seedBadge}>
                  <AppText variant="caption" bold style={styles.seedBadgeText}>
                    #{entry.seed}
                  </AppText>
                </View>

                <AppText variant="body" bold style={styles.playerName} numberOfLines={1}>
                  {entry.name}
                </AppText>

                <View style={styles.ratingBadge}>
                  <Star size={12} color="#D97706" fill="#D97706" style={{ marginRight: 3 }} />
                  <AppText variant="caption" bold style={styles.ratingText}>
                    {entry.avgRating} avg
                  </AppText>
                </View>

                <View style={styles.statusBadge}>
                  <AppText variant="caption" bold style={styles.statusText}>
                    {entry.status}
                  </AppText>
                </View>
              </View>

              {/* Members Inner Sub-Card */}
              <View style={styles.membersSubCard}>
                {entry.members.map((member) => (
                  <View key={member.id} style={styles.memberLine}>
                    <View style={styles.memberDot} />
                    <AppText variant="bodySmall" style={styles.memberName} numberOfLines={1}>
                      {member.name}
                    </AppText>
                    <View style={styles.memberRatingPill}>
                      <AppText variant="caption" bold style={styles.memberRatingText}>
                        {member.rating}
                      </AppText>
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  summaryCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    color: '#64748B',
    fontSize: 12,
  },
  summaryValue: {
    color: '#0F172A',
    fontSize: 13,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  headingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1D4ED8',
    letterSpacing: 0.5,
  },
  formatInfoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 10,
    padding: 12,
  },
  formatInfoTextWrap: {
    flex: 1,
    gap: 2,
  },
  formatInfoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0369A1',
  },
  formatInfoDesc: {
    fontSize: 11.5,
    color: '#0284C7',
    lineHeight: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    padding: 0,
  },
  loadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  entriesList: {
    gap: 10,
  },
  playerCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  seedBadge: {
    backgroundColor: '#065F46',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  seedBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  playerName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  statusBadge: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  statusText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#15803D',
  },
  membersSubCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 8,
    padding: 8,
    gap: 6,
  },
  memberLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  memberDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0D9488',
    marginRight: 6,
  },
  memberName: {
    flex: 1,
    fontSize: 12.5,
    color: '#334155',
  },
  memberRatingPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  memberRatingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
});
