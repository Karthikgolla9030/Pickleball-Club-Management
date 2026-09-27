/**
 * Aught2 Pickleball — Player Live Competition Modal Component
 *
 * Allows registered and discovering players to view real-time:
 *   - Pool Play: Pool standings tables, pool matches, and single-elimination championship bracket
 *   - Round Robin: Standings table and round matches
 *
 * Read-only interface with auto-refresh capability and zero mutation controls.
 */

import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

import { AppText } from '../AppText';
import { Badge } from '../Badge';
import { Card } from '../Card';
import { EmptyState } from '../StateViews';
import { ChampionshipBracketView } from './ChampionshipBracketView';
import { PoolStandingsTable } from './PoolStandingsTable';
import { ScrambleStandingsTable } from './ScrambleStandingsTable';
import {
  usePlayerChampionshipMatches,
  usePlayerMatches,
  usePlayerPoolMatches,
  usePlayerPoolStandings,
  usePlayerPools,
  usePlayerScramble,
  usePlayerStandings,
  usePlayerBracket,
  useAuth,
} from '@/hooks';
import { Colors, Radius, Spacing, Typography } from '@/theme';
import type { StandingRow, TournamentDiscoveryItem } from '@/types';

interface PlayerCompetitionModalProps {
  visible: boolean;
  onClose: () => void;
  tournament: TournamentDiscoveryItem | null;
}

export function PlayerCompetitionModal({
  visible,
  onClose,
  tournament,
}: PlayerCompetitionModalProps) {
  const { user } = useAuth();
  const isPoolPlay = tournament?.format === 'pool_play';
  const isScramble = tournament?.format === 'scramble';
  const isBracket = tournament?.format === 'bracket';
  const tournamentId = tournament?.id ?? null;

  const [activeTab, setActiveTab] = useState<'pools' | 'championship' | 'matches' | 'standings'>(
    isPoolPlay ? 'pools' : isBracket ? 'championship' : 'standings'
  );
  const [selectedPoolId, setSelectedPoolId] = useState<string>('all');

  // Pool Play queries
  const {
    pools,
    isLoading: isLoadingPools,
    refetch: refetchPools,
  } = usePlayerPools(isPoolPlay ? tournamentId : null);

  const {
    matches: poolMatches,
    isLoading: isLoadingPoolMatches,
    refetch: refetchPoolMatches,
  } = usePlayerPoolMatches(
    isPoolPlay ? tournamentId : null,
    selectedPoolId === 'all' ? undefined : selectedPoolId
  );

  const {
    poolsStandings,
    isLoading: isLoadingPoolStandings,
    refetch: refetchPoolStandings,
  } = usePlayerPoolStandings(isPoolPlay ? tournamentId : null);

  const {
    matches: championshipMatches,
    isLoading: isLoadingChampionship,
    refetch: refetchChampionship,
  } = usePlayerChampionshipMatches(isPoolPlay ? tournamentId : null);

  // Scramble queries
  const {
    matches: scrambleMatches,
    isLoadingMatches: isLoadingScrambleMatches,
    refetchMatches: refetchScrambleMatches,
    standings: scrambleStandings,
    isLoadingStandings: isLoadingScrambleStandings,
    refetchStandings: refetchScrambleStandings,
  } = usePlayerScramble(isScramble ? tournamentId : null);

  // Standalone Bracket queries
  const {
    matches: bracketMatches,
    isLoadingMatches: isLoadingBracketMatches,
    refetchMatches: refetchBracketMatches,
  } = usePlayerBracket(isBracket ? tournamentId : null);

  // Round Robin queries
  const {
    matches: rrMatches,
    isLoading: isLoadingRRMatches,
    refetch: refetchRRMatches,
  } = usePlayerMatches(!isPoolPlay && !isScramble && !isBracket ? tournamentId : null);

  const {
    standings: rrStandings,
    isLoading: isLoadingRRStandings,
    refetch: refetchRRStandings,
  } = usePlayerStandings(!isPoolPlay && !isScramble && !isBracket ? tournamentId : null);

  const isLoading = isPoolPlay
    ? isLoadingPools || isLoadingPoolMatches || isLoadingPoolStandings || isLoadingChampionship
    : isScramble
    ? isLoadingScrambleMatches || isLoadingScrambleStandings
    : isBracket
    ? isLoadingBracketMatches
    : isLoadingRRMatches || isLoadingRRStandings;

  const handleRefresh = () => {
    if (isPoolPlay) {
      void refetchPools();
      void refetchPoolMatches();
      void refetchPoolStandings();
      void refetchChampionship();
    } else if (isScramble) {
      void refetchScrambleMatches();
      void refetchScrambleStandings();
    } else if (isBracket) {
      void refetchBracketMatches();
    } else {
      void refetchRRMatches();
      void refetchRRStandings();
    }
  };

  if (!visible || !tournament) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <AppText variant="heading2" numberOfLines={1}>
                {tournament.name}
              </AppText>
              <View style={styles.badgeRow}>
                <Badge label={isPoolPlay ? 'Pool Play' : isScramble ? 'Scramble' : isBracket ? 'Bracket' : 'Round Robin'} variant="info" size="sm" />
                <Badge label={tournament.status_label} variant="info" size="sm" />
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <AppText variant="heading3" color="secondary">✕</AppText>
            </TouchableOpacity>
          </View>

          {/* Tab Navigation */}
          <View style={styles.tabBar}>
            {isPoolPlay ? (
              <>
                <TouchableOpacity
                  style={[styles.tabItem, activeTab === 'pools' && styles.tabItemActive]}
                  onPress={() => setActiveTab('pools')}
                >
                  <AppText
                    variant="caption"
                    style={[styles.tabText, activeTab === 'pools' && styles.tabTextActive]}
                  >
                    Pools & Standings
                  </AppText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabItem, activeTab === 'championship' && styles.tabItemActive]}
                  onPress={() => setActiveTab('championship')}
                >
                  <AppText
                    variant="caption"
                    style={[styles.tabText, activeTab === 'championship' && styles.tabTextActive]}
                  >
                    Championship Bracket ({championshipMatches.length})
                  </AppText>
                </TouchableOpacity>
              </>
            ) : isScramble ? (
              <>
                <TouchableOpacity
                  style={[styles.tabItem, activeTab === 'standings' && styles.tabItemActive]}
                  onPress={() => setActiveTab('standings')}
                >
                  <AppText
                    variant="caption"
                    style={[styles.tabText, activeTab === 'standings' && styles.tabTextActive]}
                  >
                    Standings
                  </AppText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabItem, activeTab === 'matches' && styles.tabItemActive]}
                  onPress={() => setActiveTab('matches')}
                >
                  <AppText
                    variant="caption"
                    style={[styles.tabText, activeTab === 'matches' && styles.tabTextActive]}
                  >
                    Matches ({scrambleMatches.length})
                  </AppText>
                </TouchableOpacity>
              </>
            ) : isBracket ? (
              <>
                <TouchableOpacity
                  style={[styles.tabItem, activeTab === 'championship' && styles.tabItemActive]}
                  onPress={() => setActiveTab('championship')}
                >
                  <AppText
                    variant="caption"
                    style={[styles.tabText, activeTab === 'championship' && styles.tabTextActive]}
                  >
                    Bracket Tree
                  </AppText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabItem, activeTab === 'matches' && styles.tabItemActive]}
                  onPress={() => setActiveTab('matches')}
                >
                  <AppText
                    variant="caption"
                    style={[styles.tabText, activeTab === 'matches' && styles.tabTextActive]}
                  >
                    Matches ({bracketMatches.length})
                  </AppText>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.tabItem, activeTab === 'standings' && styles.tabItemActive]}
                  onPress={() => setActiveTab('standings')}
                >
                  <AppText
                    variant="caption"
                    style={[styles.tabText, activeTab === 'standings' && styles.tabTextActive]}
                  >
                    Standings
                  </AppText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabItem, activeTab === 'matches' && styles.tabItemActive]}
                  onPress={() => setActiveTab('matches')}
                >
                  <AppText
                    variant="caption"
                    style={[styles.tabText, activeTab === 'matches' && styles.tabTextActive]}
                  >
                    Matches ({rrMatches.length})
                  </AppText>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Content */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            refreshControl={
              <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} />
            }
          >
            {/* POOL PLAY: POOLS TAB */}
            {isPoolPlay && activeTab === 'pools' && (
              <View style={styles.tabContent}>
                {pools.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.chipScroll}
                  >
                    <TouchableOpacity
                      style={[
                        styles.chip,
                        selectedPoolId === 'all' && styles.chipActive,
                      ]}
                      onPress={() => setSelectedPoolId('all')}
                    >
                      <AppText
                        variant="caption"
                        style={[
                          styles.chipText,
                          selectedPoolId === 'all' && styles.chipTextActive,
                        ]}
                      >
                        All Pools ({pools.length})
                      </AppText>
                    </TouchableOpacity>
                    {pools.map((p) => (
                      <TouchableOpacity
                        key={p.id}
                        style={[
                          styles.chip,
                          selectedPoolId === p.id && styles.chipActive,
                        ]}
                        onPress={() => setSelectedPoolId(p.id)}
                      >
                        <AppText
                          variant="caption"
                          style={[
                            styles.chipText,
                            selectedPoolId === p.id && styles.chipTextActive,
                          ]}
                        >
                          {p.name}
                        </AppText>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                {/* Standings */}
                {poolsStandings.length > 0 ? (
                  poolsStandings
                    .filter((ps) => selectedPoolId === 'all' || ps.pool_id === selectedPoolId)
                    .map((ps) => (
                      <PoolStandingsTable
                        key={ps.pool_id}
                        poolName={ps.pool_name}
                        standings={ps.standings}
                      />
                    ))
                ) : (
                  <EmptyState
                    title="No Pool Standings Yet"
                    description="Standings will appear once matches begin and scores are recorded."
                  />
                )}

                {/* Matches Section */}
                <AppText variant="heading3" style={styles.sectionHeading}>
                  Pool Matches
                </AppText>

                {poolMatches.length === 0 ? (
                  <EmptyState
                    title="No Matches Scheduled"
                    description="Pool matches have not been generated yet."
                  />
                ) : (
                  poolMatches
                    .filter((m) => selectedPoolId === 'all' || m.pool_id === selectedPoolId)
                    .map((m) => {
                      const isCompleted = m.status === 'completed';
                      const teamAWon = isCompleted && m.winner_team_id === m.team_a_id;
                      const teamBWon = isCompleted && m.winner_team_id === m.team_b_id;
                      const poolObj = pools.find((p) => p.id === m.pool_id);

                      return (
                        <Card key={m.id} style={styles.matchCard}>
                          <View style={styles.matchMetaRow}>
                            <View style={styles.metaLeft}>
                              {poolObj && <Badge label={poolObj.name} variant="info" size="sm" />}
                              <AppText variant="caption" color="tertiary">
                                Round {m.round_number ?? '-'} • Match #{m.match_number ?? '-'}
                              </AppText>
                            </View>
                            <Badge
                              label={m.status_label}
                              variant={isCompleted ? 'success' : 'default'}
                            />
                          </View>

                          <View style={styles.matchTeamsContainer}>
                            <View style={[styles.matchTeamRow, teamAWon && styles.winnerHighlight]}>
                              <AppText
                                variant="body"
                                style={[styles.teamNameText, teamAWon && styles.winnerText]}
                              >
                                {m.team_a?.name ?? 'Team A'}
                              </AppText>
                              <AppText
                                variant="heading3"
                                style={[styles.scoreText, teamAWon && styles.winnerText]}
                              >
                                {m.score_a !== null ? m.score_a : '-'}
                              </AppText>
                            </View>

                            <View style={[styles.matchTeamRow, teamBWon && styles.winnerHighlight]}>
                              <AppText
                                variant="body"
                                style={[styles.teamNameText, teamBWon && styles.winnerText]}
                              >
                                {m.team_b?.name ?? 'Team B'}
                              </AppText>
                              <AppText
                                variant="heading3"
                                style={[styles.scoreText, teamBWon && styles.winnerText]}
                              >
                                {m.score_b !== null ? m.score_b : '-'}
                              </AppText>
                            </View>
                          </View>
                        </Card>
                      );
                    })
                )}
              </View>
            )}

            {/* POOL PLAY & BRACKET: CHAMPIONSHIP / BRACKET TAB */}
            {((isPoolPlay && activeTab === 'championship') || (isBracket && activeTab === 'championship')) && (
              <View style={styles.tabContent}>
                <ChampionshipBracketView
                  matches={isBracket ? bracketMatches : championshipMatches}
                  isReadOnly={true}
                />
              </View>
            )}

            {/* SCRAMBLE: STANDINGS TAB */}
            {isScramble && activeTab === 'standings' && (
              <View style={styles.tabContent}>
                <ScrambleStandingsTable standings={scrambleStandings} />
              </View>
            )}

            {/* SCRAMBLE: MATCHES TAB */}
            {isScramble && activeTab === 'matches' && (
              <View style={styles.tabContent}>
                {scrambleMatches.length === 0 ? (
                  <EmptyState
                    title="No Matches Generated"
                    description="Official Scramble round assignments have not been published by the club yet."
                  />
                ) : (
                  scrambleMatches.map((m) => {
                    const isCompleted = m.status === 'completed';
                    const sideAWon = isCompleted && m.winner_side === 'side_a';
                    const sideBWon = isCompleted && m.winner_side === 'side_b';
                    const sideAPlayers = m.side_a_participants || [];
                    const sideBPlayers = m.side_b_participants || [];
                    const sideANames =
                      sideAPlayers.length > 0
                        ? sideAPlayers.map((p) => p.display_name || 'Player').join(' & ')
                        : 'Side A';
                    const sideBNames =
                      sideBPlayers.length > 0
                        ? sideBPlayers.map((p) => p.display_name || 'Player').join(' & ')
                        : 'Side B';

                    const isMyMatchA = Boolean(user && sideAPlayers.some((p) => p.user_id === user.id));
                    const isMyMatchB = Boolean(user && sideBPlayers.some((p) => p.user_id === user.id));
                    const isMyMatch = isMyMatchA || isMyMatchB;
                    const myPartner = isMyMatchA
                      ? sideAPlayers.find((p) => p.user_id !== user?.id)
                      : isMyMatchB
                      ? sideBPlayers.find((p) => p.user_id !== user?.id)
                      : null;
                    const myOpponents = isMyMatchA ? sideBPlayers : isMyMatchB ? sideAPlayers : null;
                    const isMeSittingOut = Boolean(user && m.sit_out_participant?.user_id === user.id);
                    const courtLabel = m.court_name || (m.court_number ? `Court ${m.court_number}` : null);

                    return (
                      <Card key={m.id} style={styles.matchCard}>
                        <View style={styles.matchMetaRow}>
                          <View style={styles.metaLeft}>
                            <AppText variant="caption" color="tertiary">
                              Round {m.round_number ?? '-'} • Match #{m.match_number ?? '-'}
                              {courtLabel ? ` • ${courtLabel}` : ''}
                            </AppText>
                            {isMyMatch && <Badge label="Your Match" variant="info" size="sm" />}
                            {isMeSittingOut && <Badge label="Sitting Out" variant="warning" size="sm" />}
                          </View>
                          <Badge
                            label={m.status_label}
                            variant={isCompleted ? 'success' : 'default'}
                          />
                        </View>

                        {/* Assigned Partner & Opponents row for authenticated player */}
                        {isMyMatch && myPartner && (
                          <View style={styles.myAssignmentRow}>
                            <AppText style={styles.myAssignmentText}>
                              Assigned Partner: <AppText bold style={{ color: '#166534' }}>{myPartner.display_name}</AppText>
                              {myOpponents && myOpponents.length > 0 ? (
                                <AppText style={{ color: '#15803D' }}>
                                  {' • Opponents: '}
                                  <AppText bold style={{ color: '#166534' }}>
                                    {myOpponents.map((o) => o.display_name || 'Player').join(' & ')}
                                  </AppText>
                                </AppText>
                              ) : null}
                            </AppText>
                          </View>
                        )}

                        <View style={styles.matchTeamsContainer}>
                          <View style={[styles.matchTeamRow, sideAWon && styles.winnerHighlight]}>
                            <AppText
                              variant="body"
                              style={[
                                styles.teamNameText,
                                sideAWon && styles.winnerText,
                                isMyMatchA && styles.myTeamText,
                              ]}
                            >
                              {sideANames} {isMyMatchA ? '(You)' : ''}
                            </AppText>
                            <AppText
                              variant="heading3"
                              style={[styles.scoreText, sideAWon && styles.winnerText]}
                            >
                              {m.score_a !== null ? m.score_a : '-'}
                            </AppText>
                          </View>

                          <View style={[styles.matchTeamRow, sideBWon && styles.winnerHighlight]}>
                            <AppText
                              variant="body"
                              style={[
                                styles.teamNameText,
                                sideBWon && styles.winnerText,
                                isMyMatchB && styles.myTeamText,
                              ]}
                            >
                              {sideBNames} {isMyMatchB ? '(You)' : ''}
                            </AppText>
                            <AppText
                              variant="heading3"
                              style={[styles.scoreText, sideBWon && styles.winnerText]}
                            >
                              {m.score_b !== null ? m.score_b : '-'}
                            </AppText>
                          </View>
                        </View>

                        {/* Sit-out notification if court has a 5th player sitting out */}
                        {m.sit_out_participant && (
                          <View style={styles.sitOutBanner}>
                            <AppText style={styles.sitOutText}>
                              Sit-out player: {m.sit_out_participant.display_name}
                            </AppText>
                          </View>
                        )}
                      </Card>
                    );
                  })
                )}
              </View>
            )}

            {/* ROUND ROBIN: STANDINGS TAB */}
            {!isPoolPlay && !isScramble && !isBracket && activeTab === 'standings' && (
              <View style={styles.tabContent}>
                {rrStandings.length === 0 ? (
                  <EmptyState
                    title="No Standings Data"
                    description="Standings will update live as match results are reported."
                  />
                ) : (
                  <Card style={styles.standingsCard}>
                    <View style={styles.standingsHeader}>
                      <AppText variant="caption" color="tertiary" style={styles.colRank}>#</AppText>
                      <AppText variant="caption" color="tertiary" style={styles.colTeam}>Team</AppText>
                      <AppText variant="caption" color="tertiary" style={styles.colStat}>W</AppText>
                      <AppText variant="caption" color="tertiary" style={styles.colStat}>L</AppText>
                      <AppText variant="caption" color="tertiary" style={styles.colStat}>Diff</AppText>
                      <AppText variant="caption" color="tertiary" style={styles.colStat}>PF</AppText>
                    </View>

                    {rrStandings.map((row: StandingRow) => (
                      <View key={row.team_id} style={styles.standingsRow}>
                        <AppText variant="bodySmall" style={styles.colRank}>{row.rank}</AppText>
                        <View style={styles.colTeam}>
                          <AppText variant="bodySmall" numberOfLines={1}>{row.team_name}</AppText>
                        </View>
                        <AppText variant="bodySmall" style={styles.colStat}>{row.wins}</AppText>
                        <AppText variant="bodySmall" style={styles.colStat}>{row.losses}</AppText>
                        <AppText
                          variant="bodySmall"
                          style={[styles.colStat, row.points_differential > 0 && styles.positiveDiff]}
                        >
                          {row.points_differential > 0 ? `+${row.points_differential}` : row.points_differential}
                        </AppText>
                        <AppText variant="bodySmall" style={styles.colStat}>{row.points_scored}</AppText>
                      </View>
                    ))}
                  </Card>
                )}
              </View>
            )}

            {/* ROUND ROBIN & BRACKET: MATCHES TAB */}
            {((!isPoolPlay && !isScramble && !isBracket) || isBracket) && activeTab === 'matches' && (
              <View style={styles.tabContent}>
                {(isBracket ? bracketMatches : rrMatches).length === 0 ? (
                  <EmptyState
                    title="No Matches Generated"
                    description={isBracket ? "Bracket matches have not been generated yet." : "Round Robin matches have not been generated yet."}
                  />
                ) : (
                  (isBracket ? bracketMatches : rrMatches).map((m) => {
                    const isCompleted = m.status === 'completed';
                    const teamAWon = isCompleted && m.winner_team_id === m.team_a_id;
                    const teamBWon = isCompleted && m.winner_team_id === m.team_b_id;

                    return (
                      <Card key={m.id} style={styles.matchCard}>
                        <View style={styles.matchMetaRow}>
                          <AppText variant="caption" color="tertiary">
                            Round {m.round_number ?? '-'} • Match #{m.match_number ?? '-'}
                          </AppText>
                          <Badge
                            label={m.status_label}
                            variant={isCompleted ? 'success' : 'default'}
                          />
                        </View>

                        <View style={styles.matchTeamsContainer}>
                          <View style={[styles.matchTeamRow, teamAWon && styles.winnerHighlight]}>
                            <AppText
                              variant="body"
                              style={[styles.teamNameText, teamAWon && styles.winnerText]}
                            >
                              {m.team_a?.name ?? 'Team A'}
                            </AppText>
                            <AppText
                              variant="heading3"
                              style={[styles.scoreText, teamAWon && styles.winnerText]}
                            >
                              {m.score_a !== null ? m.score_a : '-'}
                            </AppText>
                          </View>

                          <View style={[styles.matchTeamRow, teamBWon && styles.winnerHighlight]}>
                            <AppText
                              variant="body"
                              style={[styles.teamNameText, teamBWon && styles.winnerText]}
                            >
                              {m.team_b?.name ?? 'Team B'}
                            </AppText>
                            <AppText
                              variant="heading3"
                              style={[styles.scoreText, teamBWon && styles.winnerText]}
                            >
                              {m.score_b !== null ? m.score_b : '-'}
                            </AppText>
                          </View>
                        </View>
                      </Card>
                    );
                  })
                )}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background.primary,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    maxHeight: '92%',
    height: '88%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
  },
  headerLeft: {
    flex: 1,
    gap: Spacing[1],
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
  },
  closeBtn: {
    padding: Spacing[2],
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.background.secondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
  },
  tabItem: {
    flex: 1,
    paddingVertical: Spacing[3],
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: Colors.brand.primary,
  },
  tabText: {
    color: Colors.text.tertiary,
    fontWeight: Typography.weight.medium,
  },
  tabTextActive: {
    color: Colors.brand.primary,
    fontWeight: Typography.weight.bold,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: Spacing[4],
    gap: Spacing[4],
  },
  tabContent: {
    gap: Spacing[4],
  },
  chipScroll: {
    marginBottom: Spacing[1],
  },
  chip: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[1.5],
    borderRadius: Radius.full,
    backgroundColor: Colors.background.secondary,
    marginRight: Spacing[2],
  },
  chipActive: {
    backgroundColor: Colors.brand.primary,
  },
  chipText: {
    color: Colors.text.secondary,
  },
  chipTextActive: {
    color: Colors.text.inverse,
    fontWeight: Typography.weight.bold,
  },
  sectionHeading: {
    marginTop: Spacing[2],
  },
  matchCard: {
    gap: Spacing[2],
  },
  matchMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  matchTeamsContainer: {
    gap: Spacing[1],
    backgroundColor: Colors.background.secondary,
    padding: Spacing[2],
    borderRadius: Radius.md,
  },
  matchTeamRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing[1],
  },
  winnerHighlight: {
    backgroundColor: Colors.surface.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing[1],
  },
  teamNameText: {
    flex: 1,
  },
  scoreText: {
    fontWeight: Typography.weight.bold,
  },
  winnerText: {
    color: Colors.brand.primary,
    fontWeight: Typography.weight.bold,
  },
  standingsCard: {
    padding: Spacing[2],
  },
  standingsHeader: {
    flexDirection: 'row',
    paddingVertical: Spacing[1],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
  },
  standingsRow: {
    flexDirection: 'row',
    paddingVertical: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
    alignItems: 'center',
  },
  colRank: {
    width: 28,
    textAlign: 'center',
  },
  colTeam: {
    flex: 1,
    paddingHorizontal: Spacing[1],
  },
  colStat: {
    width: 36,
    textAlign: 'center',
  },
  positiveDiff: {
    color: Colors.status.success,
    fontWeight: Typography.weight.bold,
  },
  myAssignmentRow: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing[2],
    paddingVertical: Spacing[1.5],
  },
  myAssignmentText: {
    fontSize: 12,
    color: '#166534',
  },
  myTeamText: {
    fontWeight: Typography.weight.bold,
    color: '#065F46',
  },
  sitOutBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing[2],
    paddingVertical: Spacing[1],
  },
  sitOutText: {
    fontSize: 11,
    color: '#92400E',
  },
});
