/**
 * Aught2 Pickleball — PlayerTournamentPlayersTab
 *
 * Standardized Players / Teams page for player-side tournament details:
 * - Summary Card (registered count vs capacity, category, registration type)
 * - Section heading with category badge (e.g. 'Players (8)' with 'SINGLES' badge)
 * - Format information banner
 * - Search bar
 * - Standardized player/team cards with seed badge, name, avg rating, status, and members list
 */

import React, { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Lock, Search, Star, UserCheck, Users } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';
import type { Team, Tournament, TournamentRegistrationItem } from '@/types';

export interface PlayerTournamentPlayersTabProps {
  tournament: Tournament;
  teams: Team[];
  registrations: TournamentRegistrationItem[];
  isBracketLocked?: boolean;
}

export function PlayerTournamentPlayersTab({
  tournament,
  teams,
  registrations,
  isBracketLocked = false,
}: PlayerTournamentPlayersTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const parsedConfig = useMemo(() => parseTournamentConfig(tournament), [tournament]);
  const format = tournament.format || 'round_robin';
  const isSingles = useMemo(() => {
    if (format === 'scramble') return true;
    if (parsedConfig.teamSize > 1) return false;
    if (parsedConfig.teamSize === 1) return true;
    return parsedConfig.isSingles;
  }, [format, parsedConfig]);

  // Registered entities:
  // If teams are present, use teams. Otherwise construct entries from registrations.
  const entries = useMemo(() => {
    if (teams && teams.length > 0) {
      return teams.map((team, index) => {
        const avgRating =
          team.members && team.members.length > 0
            ? (
                team.members.reduce((acc, m) => acc + (m.skill_rating || 4.0), 0) /
                team.members.length
              ).toFixed(2)
            : '4.00';

        return {
          id: team.id,
          name: team.name,
          seed: team.seed ?? index + 1,
          avgRating,
          status: 'Confirmed',
          members: (team.members || []).map((m) => ({
            id: m.id,
            name: m.display_name || 'Player',
            rating: m.skill_rating != null ? m.skill_rating.toFixed(1) : '4.0',
          })),
        };
      });
    }

    if (registrations && registrations.length > 0) {
      return registrations.map((reg, index) => {
        const rating = reg.skill_rating != null ? reg.skill_rating.toFixed(2) : '4.00';
        const name = reg.display_name || reg.user_full_name || reg.user_email || `Player ${index + 1}`;
        return {
          id: reg.id,
          name,
          seed: reg.seed ?? index + 1,
          avgRating: rating,
          status: reg.status_label || (reg.status === 'confirmed' ? 'Confirmed' : 'Registered'),
          members: [
            {
              id: reg.user_id,
              name,
              rating: reg.skill_rating != null ? reg.skill_rating.toFixed(1) : '4.0',
            },
          ],
        };
      });
    }

    return [];
  }, [teams, registrations]);

  // Filtered by search
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase().trim();
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.members.some((m) => m.name.toLowerCase().includes(q))
    );
  }, [entries, searchQuery]);

  const totalCount = entries.length;
  const capacity =
    tournament.max_participants ||
    parsedConfig.capacity?.entryCount ||
    totalCount ||
    8;

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
            {parsedConfig.category || (isSingles ? 'Singles' : 'Doubles')}
          </AppText>
        </View>

        <View style={styles.summaryRow}>
          <AppText variant="caption" style={styles.summaryLabel}>
            Registration type:
          </AppText>
          <AppText variant="bodySmall" bold style={styles.summaryValue}>
            {isSingles ? 'Singles individual' : 'Fixed partner team'}
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
              ? 'Each entry consists of 1 player who competes individually for all rounds. Every player will play according to the tournament schedule.'
              : 'Each entry consists of a fixed team of 2 players who compete together throughout all rounds of the tournament.'}
          </AppText>
        </View>
      </View>

      {/* ─── Bracket Lock Notice if active ─── */}
      {isBracketLocked && (
        <View style={styles.lockNoticeCard}>
          <Lock size={16} color="#D97706" style={{ marginTop: 2 }} />
          <View style={styles.formatInfoTextWrap}>
            <AppText variant="caption" bold style={styles.lockNoticeTitle}>
              Bracket Generated — Rosters Locked
            </AppText>
            <AppText variant="caption" style={styles.lockNoticeDesc}>
              {isSingles
                ? 'Players cannot be modified while the bracket is active.'
                : 'Teams and partner assignments cannot be modified while the bracket is active.'}
            </AppText>
          </View>
        </View>
      )}

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
      {filteredEntries.length === 0 ? (
        <Card style={styles.emptyCard}>
          <UserCheck size={28} color="#94A3B8" />
          <AppText variant="body" bold style={styles.emptyTitle}>
            No {isSingles ? 'players' : 'teams'} found
          </AppText>
          <AppText variant="caption" style={styles.emptySubtitle}>
            {searchQuery ? 'Try matching a different name' : `No confirmed ${isSingles ? 'players' : 'teams'} yet`}
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
                    {entry.avgRating} {isSingles ? 'rating' : 'avg'}
                  </AppText>
                </View>

                <View style={styles.statusBadge}>
                  <AppText variant="caption" bold style={styles.statusText}>
                    {entry.status}
                  </AppText>
                </View>
              </View>

              {/* Members Inner Sub-Card: Only shown for Doubles with both partners/players shown */}
              {!isSingles && entry.members && entry.members.length > 0 && (
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
              )}
            </Card>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  summaryValue: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '700',
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  headingTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#EFF6FF',
  },
  categoryBadgeText: {
    fontSize: 11,
    color: '#1D4ED8',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  formatInfoCard: {
    flexDirection: 'row',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  formatInfoTextWrap: {
    flex: 1,
    gap: 2,
  },
  formatInfoTitle: {
    fontSize: 13,
    color: '#0369A1',
    fontWeight: '700',
  },
  formatInfoDesc: {
    fontSize: 12,
    color: '#0284C7',
    lineHeight: 17,
  },
  lockNoticeCard: {
    flexDirection: 'row',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  lockNoticeTitle: {
    fontSize: 13,
    color: '#92400E',
    fontWeight: '700',
  },
  lockNoticeDesc: {
    fontSize: 12,
    color: '#B45309',
    lineHeight: 17,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    padding: 0,
  },
  entriesList: {
    gap: 12,
  },
  playerCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  seedBadge: {
    backgroundColor: '#0F766E',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  seedBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  playerName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF9C3',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  ratingText: {
    fontSize: 11,
    color: '#854D0E',
    fontWeight: '700',
  },
  statusBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 11,
    color: '#15803D',
    fontWeight: '600',
  },
  membersSubCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    gap: 8,
  },
  memberLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  memberDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 8,
  },
  memberName: {
    flex: 1,
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  memberRatingPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  memberRatingText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  emptyCard: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 15,
    color: '#475569',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
  },
});

