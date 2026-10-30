/**
 * Aught2 Pickleball — PlayerTournamentMatchesTab
 *
 * Standardized Matches page across all 4 formats:
 * - Filter chips: All Matches, My Matches, Round / Court filter
 * - Standardized Match Card:
 *     - Header: Match #, Round/Stage, Court, Status
 *     - Team A row: Initials badge, Name, Set scores, Winner tag
 *     - Team B row: Initials badge, Name, Set scores, Winner tag
 * - Match Details modal when tapping on any match card
 */

import React, { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Calendar,
  Check,
  Clock,
  MapPin,
  Trophy,
  X,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { formatDate, getCourtDisplayLabel } from '@/utils';
import { useAuth } from '@/hooks';
import type { Match, Team, Tournament } from '@/types';

export interface PlayerTournamentMatchesTabProps {
  tournament: Tournament;
  matches: Match[];
  teams?: Team[];
}

type FilterType = 'all' | 'my' | 'completed' | 'in_progress' | 'scheduled';

export function PlayerTournamentMatchesTab({
  tournament,
  matches,
  teams = [],
}: PlayerTournamentMatchesTabProps) {
  const { user } = useAuth();
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  // Chronologically sorted matches
  const sortedMatches = useMemo(() => {
    return [...matches].sort((a, b) => {
      if (a.scheduled_start_at && b.scheduled_start_at) {
        return (
          new Date(a.scheduled_start_at).getTime() -
          new Date(b.scheduled_start_at).getTime()
        );
      }
      return (a.match_number ?? 0) - (b.match_number ?? 0);
    });
  }, [matches]);

  // Filtered matches
  const filteredMatches = useMemo(() => {
    return sortedMatches.filter((m) => {
      if (filter === 'all') return true;
      if (filter === 'completed') return m.status === 'completed';
      if (filter === 'in_progress') return m.status === 'in_progress';
      if (filter === 'scheduled') return m.status === 'pending' || m.status === 'waiting';

      if (filter === 'my') {
        if (!user) return false;
        const teamA = teams.find((t) => t.id === m.team_a_id);
        const teamB = teams.find((t) => t.id === m.team_b_id);
        const inTeamA = teamA?.members?.some((mem) => mem.user_id === user.id) ?? false;
        const inTeamB = teamB?.members?.some((mem) => mem.user_id === user.id) ?? false;
        return inTeamA || inTeamB;
      }
      return true;
    });
  }, [sortedMatches, filter, user, teams]);

  // Parse set scores safely
  const parseScores = (match: Match) => {
    const teamAScore = match.score_a ?? (match as any).score_team_a ?? 0;
    const teamBScore = match.score_b ?? (match as any).score_team_b ?? 0;
    const isTeamAWinner =
      match.winner_team_id === match.team_a_id ||
      match.winner_side === 'side_a' ||
      (match as any).winner_id === match.team_a_id;
    const isTeamBWinner =
      match.winner_team_id === match.team_b_id ||
      match.winner_side === 'side_b' ||
      (match as any).winner_id === match.team_b_id;
    return {
      scoreA: teamAScore,
      scoreB: teamBScore,
      isTeamAWinner,
      isTeamBWinner,
    };
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return { label: 'Completed', bg: '#DCFCE7', text: '#15803D' };
      case 'in_progress':
        return { label: 'Live Now', bg: '#FEE2E2', text: '#DC2626' };
      case 'pending':
      case 'waiting':
      default:
        return { label: 'Scheduled', bg: '#F1F5F9', text: '#475569' };
    }
  };

  return (
    <View style={styles.container}>
      {/* ─── Filter Pills ─── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterBar}
      >
        {[
          { key: 'all', label: `All (${matches.length})` },
          { key: 'my', label: 'My Matches' },
          { key: 'completed', label: 'Completed' },
          { key: 'in_progress', label: 'In Progress' },
          { key: 'scheduled', label: 'Scheduled' },
        ].map((item) => {
          const isActive = filter === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setFilter(item.key as FilterType)}
              activeOpacity={0.7}
            >
              <AppText
                variant="caption"
                bold
                style={[styles.filterChipText, isActive && styles.filterChipTextActive]}
              >
                {item.label}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ─── Match Cards List ─── */}
      {filteredMatches.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Clock size={28} color="#94A3B8" />
          <AppText variant="body" bold style={styles.emptyTitle}>
            No matches found
          </AppText>
          <AppText variant="caption" style={styles.emptySubtitle}>
            {filter === 'my'
              ? 'You have no matches assigned yet'
              : 'Matches will appear once generated or scheduled'}
          </AppText>
        </Card>
      ) : (
        <View style={styles.matchesList}>
          {filteredMatches.map((match, idx) => {
            const { scoreA, scoreB, isTeamAWinner, isTeamBWinner } = parseScores(match);
            const statusBadge = getStatusBadge(match.status);
            const courtLabel = getCourtDisplayLabel(match);
            const roundLabel = match.round_number
              ? `Round ${match.round_number}`
              : `Match #${match.match_number ?? idx + 1}`;

            const teamAName = match.team_a?.name || (match as any).team_a_name || 'Team A';
            const teamBName = match.team_b?.name || (match as any).team_b_name || 'Team B';

            return (
              <TouchableOpacity
                key={match.id || `match-${idx}`}
                onPress={() => setSelectedMatch(match)}
                activeOpacity={0.85}
              >
                <Card style={styles.matchCard}>
                  {/* Card Header */}
                  <View style={styles.cardHeader}>
                    <View style={styles.headerLeft}>
                      <AppText variant="caption" bold style={styles.matchNumberText}>
                        {roundLabel}
                      </AppText>
                      {courtLabel && courtLabel !== 'Court not assigned' && (
                        <View style={styles.courtBadge}>
                          <MapPin size={10} color="#0F766E" style={{ marginRight: 3 }} />
                          <AppText variant="caption" style={styles.courtBadgeText}>
                            {courtLabel}
                          </AppText>
                        </View>
                      )}
                    </View>

                    <View style={[styles.statusPill, { backgroundColor: statusBadge.bg }]}>
                      <AppText
                        variant="caption"
                        bold
                        style={[styles.statusPillText, { color: statusBadge.text }]}
                      >
                        {statusBadge.label}
                      </AppText>
                    </View>
                  </View>

                  {/* Team A Row */}
                  <View
                    style={[
                      styles.teamRow,
                      isTeamAWinner && styles.winnerRowHighlight,
                    ]}
                  >
                    <View style={styles.teamAvatar}>
                      <AppText variant="caption" bold style={styles.avatarText}>
                        {teamAName.slice(0, 2).toUpperCase()}
                      </AppText>
                    </View>
                    <AppText
                      variant="bodySmall"
                      bold={isTeamAWinner}
                      style={[styles.teamName, isTeamAWinner && styles.winnerText]}
                      numberOfLines={1}
                    >
                      {teamAName}
                    </AppText>

                    {match.status === 'completed' && (
                      <View style={styles.scoreContainer}>
                        <View
                          style={[
                            styles.scoreBox,
                            isTeamAWinner && styles.winnerScoreBox,
                          ]}
                        >
                          <AppText
                            variant="bodySmall"
                            bold
                            style={[
                              styles.scoreText,
                              isTeamAWinner && styles.winnerScoreText,
                            ]}
                          >
                            {scoreA}
                          </AppText>
                        </View>
                        {isTeamAWinner && (
                          <View style={styles.winnerBadge}>
                            <Check size={11} color="#047857" />
                          </View>
                        )}
                      </View>
                    )}
                  </View>

                  <View style={styles.rowDivider} />

                  {/* Team B Row */}
                  <View
                    style={[
                      styles.teamRow,
                      isTeamBWinner && styles.winnerRowHighlight,
                    ]}
                  >
                    <View style={styles.teamAvatar}>
                      <AppText variant="caption" bold style={styles.avatarText}>
                        {teamBName.slice(0, 2).toUpperCase()}
                      </AppText>
                    </View>
                    <AppText
                      variant="bodySmall"
                      bold={isTeamBWinner}
                      style={[styles.teamName, isTeamBWinner && styles.winnerText]}
                      numberOfLines={1}
                    >
                      {teamBName}
                    </AppText>

                    {match.status === 'completed' && (
                      <View style={styles.scoreContainer}>
                        <View
                          style={[
                            styles.scoreBox,
                            isTeamBWinner && styles.winnerScoreBox,
                          ]}
                        >
                          <AppText
                            variant="bodySmall"
                            bold
                            style={[
                              styles.scoreText,
                              isTeamBWinner && styles.winnerScoreText,
                            ]}
                          >
                            {scoreB}
                          </AppText>
                        </View>
                        {isTeamBWinner && (
                          <View style={styles.winnerBadge}>
                            <Check size={11} color="#047857" />
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ─── Match Details Modal ─── */}
      {selectedMatch && (
        <Modal
          visible={Boolean(selectedMatch)}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedMatch(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <AppText variant="heading3" bold style={styles.modalTitle}>
                  Match Details
                </AppText>
                <TouchableOpacity
                  onPress={() => setSelectedMatch(null)}
                  style={styles.closeBtn}
                >
                  <X size={20} color="#475569" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <View style={styles.modalMetaRow}>
                  <Calendar size={15} color="#065F46" />
                  <AppText variant="caption" style={styles.modalMetaText}>
                    {selectedMatch.scheduled_start_at
                      ? formatDate(selectedMatch.scheduled_start_at)
                      : 'Scheduled during tournament'}
                  </AppText>
                </View>

                <View style={styles.modalMetaRow}>
                  <MapPin size={15} color="#065F46" />
                  <AppText variant="caption" style={styles.modalMetaText}>
                    {getCourtDisplayLabel(selectedMatch) || 'Court not assigned'}
                  </AppText>
                </View>

                {/* Score Summary Box */}
                <View style={styles.modalScoreCard}>
                  <View style={styles.modalScoreRow}>
                    <AppText variant="bodySmall" bold style={styles.modalTeamName}>
                      {selectedMatch.team_a?.name || (selectedMatch as any).team_a_name || 'Team A'}
                    </AppText>
                    <AppText variant="heading2" bold style={styles.modalTeamScore}>
                      {selectedMatch.score_a ?? (selectedMatch as any).score_team_a ?? 0}
                    </AppText>
                  </View>

                  <View style={styles.modalScoreDivider} />

                  <View style={styles.modalScoreRow}>
                    <AppText variant="bodySmall" bold style={styles.modalTeamName}>
                      {selectedMatch.team_b?.name || (selectedMatch as any).team_b_name || 'Team B'}
                    </AppText>
                    <AppText variant="heading2" bold style={styles.modalTeamScore}>
                      {selectedMatch.score_b ?? (selectedMatch as any).score_team_b ?? 0}
                    </AppText>
                  </View>
                </View>

                {Boolean(selectedMatch.winner_team_id || selectedMatch.winner_side) && (
                  <View style={styles.winnerNote}>
                    <Trophy size={16} color="#047857" style={{ marginRight: 6 }} />
                    <AppText variant="caption" bold style={styles.winnerNoteText}>
                      Winner:{' '}
                      {selectedMatch.winner_team?.name ||
                        (selectedMatch.winner_team_id === selectedMatch.team_a_id ||
                        selectedMatch.winner_side === 'side_a'
                          ? selectedMatch.team_a?.name || 'Team A'
                          : selectedMatch.team_b?.name || 'Team B')}
                    </AppText>
                  </View>
                )}
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
  },
  filterBar: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  filterChipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  matchesList: {
    gap: 12,
  },
  matchCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  matchNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  courtBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  courtBadgeText: {
    fontSize: 11,
    color: '#0F766E',
    fontWeight: '600',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 11,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 8,
    gap: 10,
  },
  winnerRowHighlight: {
    backgroundColor: '#F0FDF4',
  },
  teamAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  teamName: {
    flex: 1,
    fontSize: 14,
    color: '#334155',
  },
  winnerText: {
    color: '#064E3B',
    fontWeight: '800',
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scoreBox: {
    minWidth: 28,
    height: 28,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  winnerScoreBox: {
    backgroundColor: '#047857',
  },
  scoreText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
  },
  winnerScoreText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  winnerBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  closeBtn: {
    padding: 4,
  },
  modalBody: {
    gap: 12,
  },
  modalMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalMetaText: {
    fontSize: 13,
    color: '#475569',
  },
  modalScoreCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginTop: 6,
  },
  modalScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTeamName: {
    fontSize: 15,
    color: '#0F172A',
  },
  modalTeamScore: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalScoreDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  winnerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    padding: 12,
    borderRadius: 8,
  },
  winnerNoteText: {
    fontSize: 13,
    color: '#047857',
  },
});
