/**
 * Aught2 Pickleball — PlayerLeagueTeamsTab
 *
 * Compact, pixel-perfect Players / Teams table matching Club Owner League Management:
 * - Card with white surface, #E5ECE8 border, and rounded corners (12px)
 * - Heading: "Teams (N)" or "Players (N)"
 * - Table Header: # | Team/Player Name | Players | Avg Skill Level
 * - Rows: #, Team/Player Name + subtitle, Player count, Skill level blue pill, Chevron >
 * - Tap row to view roster member modal
 */

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { ChevronRight, Search, Users, X } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import type { LeagueStandingRow, LeagueSummary, LeagueTeam } from '@/types';

export interface LeagueParticipantMember {
  id: string;
  name: string;
  email?: string;
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
  const [selectedEntry, setSelectedEntry] = useState<LeagueParticipantEntry | null>(null);

  const isSingles =
    (league.team_size ?? 2) === 1 ||
    (league.category?.toLowerCase().includes('singles') ?? false);

  const entries = useMemo<LeagueParticipantEntry[]>(() => {
    if (teams && teams.length > 0) {
      return teams.map((team, index) => {
        let avgRating = '3.5';
        if (team.avg_skill_level != null) {
          avgRating = Number(team.avg_skill_level).toFixed(1);
        } else if (team.members && team.members.length > 0) {
          const sum = team.members.reduce((acc, m) => acc + (m.skill_rating ?? 3.5), 0);
          avgRating = (sum / team.members.length).toFixed(1);
        }

        const membersList: LeagueParticipantMember[] =
          team.members && team.members.length > 0
            ? team.members.map((m) => ({
                id: m.id,
                name: m.display_name || m.user?.full_name || 'Player',
                email: m.user?.email,
                rating: (m.skill_rating ?? 3.5).toFixed(1),
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
                rating: '3.5',
              }))
            : [
                {
                  id: row.team_id,
                  name: row.team_name,
                  rating: '3.5',
                },
              ];

        return {
          id: row.team_id,
          name: row.team_name,
          seed: row.rank ?? index + 1,
          avgRating: '3.5',
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

  return (
    <View style={styles.container}>
      {/* ─── Search input (if list is non-empty) ─── */}
      {entries.length > 5 && (
        <View style={styles.searchContainer}>
          <Search size={15} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder={`Search ${isSingles ? 'players' : 'teams'}...`}
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      )}

      {/* ─── Compact Teams/Players Table Card ─── */}
      <View style={styles.teamsCard}>
        {/* Card Header */}
        <View style={styles.teamsHeaderRow}>
          <AppText style={styles.teamsTitle}>
            {isSingles ? 'Players' : 'Teams'} ({totalCount})
          </AppText>
        </View>

        {/* Table Header Row */}
        <View style={styles.teamsTableHeader}>
          <AppText style={styles.thNum}>#</AppText>
          <AppText style={styles.thTeamName}>
            {isSingles ? 'Player Name' : 'Team Name'}
          </AppText>
          <AppText style={styles.thPlayers}>Players</AppText>
          <AppText style={styles.thAvgSkill}>Avg Skill Level</AppText>
          <View style={styles.thChevronSpacer} />
        </View>

        {/* Rows */}
        {isLoading && entries.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#176B57" />
            <AppText style={styles.loadingText}>
              Loading {isSingles ? 'players' : 'teams'}...
            </AppText>
          </View>
        ) : filteredEntries.length === 0 ? (
          <View style={styles.emptyTeamsBox}>
            <AppText style={styles.emptyTeamsTitle}>
              No {isSingles ? 'Players' : 'Teams'} Registered Yet
            </AppText>
            <AppText style={styles.emptyTeamsSubtitle}>
              {searchQuery
                ? 'Try matching a different name'
                : `Confirmed ${isSingles ? 'players' : 'teams'} will appear here once registered.`}
            </AppText>
          </View>
        ) : (
          filteredEntries.map((entry, index) => {
            const playerCount = entry.members.length || 1;
            const subtitle = isSingles
              ? '1 player'
              : playerCount === 1
              ? '1 player'
              : `${playerCount} players`;

            return (
              <TouchableOpacity
                key={entry.id}
                style={[
                  styles.teamRow,
                  index === filteredEntries.length - 1 && styles.teamRowLast,
                ]}
                onPress={() => setSelectedEntry(entry)}
                activeOpacity={0.7}
              >
                {/* # Number */}
                <AppText style={styles.tdNum}>{index + 1}</AppText>

                {/* Team/Player Name + Subtitle */}
                <View style={styles.tdTeamCol}>
                  <AppText style={styles.tdTeamName} numberOfLines={1}>
                    {entry.name}
                  </AppText>
                  <AppText style={styles.tdTeamSubtitle}>{subtitle}</AppText>
                </View>

                {/* Players Count */}
                <View style={styles.tdPlayersCol}>
                  <AppText style={styles.tdPlayersCount}>{playerCount}</AppText>
                </View>

                {/* Avg Skill Level Blue Pill */}
                <View style={styles.tdSkillCol}>
                  <View style={styles.skillPillBlue}>
                    <AppText style={styles.skillPillTextBlue}>
                      {Number(entry.avgRating).toFixed(1)}
                    </AppText>
                  </View>
                </View>

                {/* Chevron > */}
                <ChevronRight size={18} color="#9CA3AF" />
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* ─── Detail Modal on Row Tap ─── */}
      <Modal
        visible={Boolean(selectedEntry)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedEntry(null)}
      >
        <TouchableWithoutFeedback onPress={() => setSelectedEntry(null)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalContent}>
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <AppText style={styles.modalTitle} numberOfLines={1}>
                      {selectedEntry?.name}
                    </AppText>
                    <AppText style={styles.modalSubtitle}>
                      Average Skill Level: {Number(selectedEntry?.avgRating || 3.5).toFixed(1)}
                    </AppText>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSelectedEntry(null)}
                    style={styles.modalCloseBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <X size={20} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                {/* Members list */}
                <View style={styles.rosterContainer}>
                  <AppText style={styles.rosterSectionTitle}>
                    {isSingles ? 'Player Details' : 'Roster Members'}
                  </AppText>
                  <ScrollView style={{ maxHeight: 240 }}>
                    {selectedEntry?.members.map((member) => (
                      <View key={member.id} style={styles.rosterMemberRow}>
                        <View style={styles.memberAvatar}>
                          <Users size={16} color="#064E3B" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <AppText style={styles.memberName}>{member.name}</AppText>
                          {member.email ? (
                            <AppText style={styles.memberEmail}>{member.email}</AppText>
                          ) : null}
                        </View>
                        <View style={styles.memberRatingBadge}>
                          <AppText style={styles.memberRatingText}>
                            Rating: {Number(member.rating).toFixed(1)}
                          </AppText>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5ECE8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#111827',
    padding: 0,
  },
  teamsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5ECE8',
    overflow: 'hidden',
  },
  teamsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  teamsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  teamsTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5ECE8',
  },
  thNum: {
    width: 28,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#6B7280',
  },
  thTeamName: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#6B7280',
    paddingLeft: 4,
  },
  thPlayers: {
    width: 55,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
  },
  thAvgSkill: {
    width: 95,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
  },
  thChevronSpacer: {
    width: 18,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  teamRowLast: {
    borderBottomWidth: 0,
  },
  tdNum: {
    width: 28,
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  tdTeamCol: {
    flex: 1,
    paddingLeft: 4,
    paddingRight: 8,
  },
  tdTeamName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  tdTeamSubtitle: {
    fontSize: 12.5,
    color: '#6B7280',
    marginTop: 2,
  },
  tdPlayersCol: {
    width: 55,
    alignItems: 'center',
  },
  tdPlayersCount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  tdSkillCol: {
    width: 95,
    alignItems: 'center',
  },
  skillPillBlue: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  skillPillTextBlue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  loadingBox: {
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#6B7280',
  },
  emptyTeamsBox: {
    padding: 24,
    alignItems: 'center',
    gap: 4,
  },
  emptyTeamsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  emptyTeamsSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5ECE8',
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  modalSubtitle: {
    fontSize: 12.5,
    color: '#6B7280',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  rosterContainer: {
    marginTop: 12,
  },
  rosterSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  rosterMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
    gap: 10,
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  memberEmail: {
    fontSize: 11.5,
    color: '#6B7280',
  },
  memberRatingBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  memberRatingText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#374151',
  },
});
