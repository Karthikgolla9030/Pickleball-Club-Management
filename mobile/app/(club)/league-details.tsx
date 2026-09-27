/**
 * Aught2 Pickleball — Club League Details Screen (Phase 9)
 *
 * Full staff management interface for a multi-week league:
 *   - Lifecycle status management (Draft -> Open -> Closed -> In Progress -> Playoffs -> Completed)
 *   - Schedule & Match management week by week (Circle method fixtures)
 *   - Live cumulative Standings with tiebreaker indicators & weekly snapshot history
 *   - Scoring modal with pickleball validation (target 11, win by 2; locked in playoffs)
 *   - Championship Playoff bracket view and advancement
 *   - Team registration and roster management
 */

import React, { useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FilterChips,
  Input,
  LoadingState,
  ModalSheet,
  Screen,
  ScreenHeader,
  SegmentedTabs,
  AppHeader,
} from '@/components';
import {
  useActiveClub,
  useClubPlayerMembers,
  useLeagueDetails,
  useLeagueMatches,
  useLeaguePlayoffs,
  useLeagueSnapshots,
  useLeagueStandings,
  useLeagueTeams,
  useLeagueWeeks,
  usePermission,
} from '@/hooks';
import { Colors, Radius, Spacing, Typography } from '@/theme';
import {
  LEAGUE_STATUS_LABELS,
  type CreateLeagueTeamPayload,
  type LeagueMatch,
  type LeagueStatus,
} from '@/types';

type TabKey = 'schedule' | 'standings' | 'playoffs' | 'teams';

export default function ClubLeagueDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const leagueId = id || null;
  const { clubId } = useActiveClub();
  const { canManageTournaments, canManageLeagues } = usePermission();
  const canManageScores = canManageTournaments || canManageLeagues;

  const [activeTab, setActiveTab] = useState<TabKey>('schedule');
  const [selectedWeekId, setSelectedWeekId] = useState<string | undefined>(undefined);

  // Score Recording Modal State
  const [scoreModalMatch, setScoreModalMatch] = useState<LeagueMatch | null>(null);
  const [scoreA, setScoreA] = useState('');
  const [scoreB, setScoreB] = useState('');
  const [scoreError, setScoreError] = useState<string | null>(null);

  // Add Team Modal State
  const [isAddTeamModalOpen, setIsAddTeamModalOpen] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [selectedPlayerA, setSelectedPlayerA] = useState<string>('');
  const [selectedPlayerB, setSelectedPlayerB] = useState<string>('');
  const [teamError, setTeamError] = useState<string | null>(null);

  // Queries
  const {
    data: league,
    isLoading: isLeagueLoading,
    isError: isLeagueError,
    error: leagueError,
    refetch: refetchLeague,
    updateStatus,
    isUpdatingStatus,
    generateSchedule,
    isGeneratingSchedule,
    generatePlayoffs,
    isGeneratingPlayoffs,
  } = useLeagueDetails(clubId, leagueId);

  const {
    data: weeks,
    refetch: refetchWeeks,
  } = useLeagueWeeks(clubId, leagueId);

  const {
    data: matches,
    isLoading: isMatchesLoading,
    refetch: refetchMatches,
    recordScore,
    isRecordingScore,
    correctScore,
    isCorrectingScore,
  } = useLeagueMatches(clubId, leagueId, selectedWeekId);

  const {
    data: standingsData,
    isLoading: isStandingsLoading,
    refetch: refetchStandings,
  } = useLeagueStandings(clubId, leagueId);

  const {
    data: snapshots,
    refetch: refetchSnapshots,
    snapshotStandings,
    isSnapshotting,
  } = useLeagueSnapshots(clubId, leagueId);

  const {
    data: playoffs,
    isLoading: isPlayoffsLoading,
    refetch: refetchPlayoffs,
  } = useLeaguePlayoffs(clubId, leagueId);

  const {
    data: teams,
    isLoading: isTeamsLoading,
    refetch: refetchTeams,
    createTeam,
    isCreatingTeam,
  } = useLeagueTeams(clubId, leagueId);

  const { data: clubPlayers } = useClubPlayerMembers(clubId);

  // Auto-select active week if not selected
  const activeWeek = weeks?.find((w) => w.id === selectedWeekId) || weeks?.[0];

  const handleRefreshAll = () => {
    refetchLeague();
    refetchWeeks();
    refetchMatches();
    refetchStandings();
    refetchSnapshots();
    refetchPlayoffs();
    refetchTeams();
  };

  // ─── Lifecycle Actions ──────────────────────────────────────────────────────

  const handleStatusTransition = async (nextStatus: LeagueStatus) => {
    try {
      await updateStatus(nextStatus);
      handleRefreshAll();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || err?.message || 'Failed to update status');
    }
  };

  const handleGenerateSchedule = async () => {
    try {
      await generateSchedule();
      handleRefreshAll();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || err?.message || 'Failed to generate schedule');
    }
  };

  const handleGeneratePlayoffs = async () => {
    try {
      await generatePlayoffs();
      handleRefreshAll();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || err?.message || 'Failed to generate playoffs');
    }
  };

  // ─── Scoring Actions ────────────────────────────────────────────────────────

  const openScoreModal = (match: LeagueMatch) => {
    if (league?.status === 'playoffs' && match.stage === 'regular_season') {
      Alert.alert('Locked', 'Regular season match scores are locked once playoffs begin.');
      return;
    }
    setScoreModalMatch(match);
    setScoreA(match.score_a !== null ? String(match.score_a) : '');
    setScoreB(match.score_b !== null ? String(match.score_b) : '');
    setScoreError(null);
  };

  const handleSaveScore = async () => {
    if (!scoreModalMatch) return;
    const sA = parseInt(scoreA, 10);
    const sB = parseInt(scoreB, 10);
    if (isNaN(sA) || isNaN(sB) || sA < 0 || sB < 0) {
      setScoreError('Scores must be non-negative integers');
      return;
    }
    if (sA === sB) {
      setScoreError('Ties are not allowed. One team must win.');
      return;
    }
    const maxScore = Math.max(sA, sB);
    const minScore = Math.min(sA, sB);
    if (maxScore < 11 || maxScore - minScore < 2) {
      setScoreError('Winning score must be at least 11 and win by 2');
      return;
    }

    try {
      setScoreError(null);
      if (scoreModalMatch.status === 'completed') {
        await correctScore({ matchId: scoreModalMatch.id, score_a: sA, score_b: sB });
      } else {
        await recordScore({ matchId: scoreModalMatch.id, score_a: sA, score_b: sB });
      }
      setScoreModalMatch(null);
      handleRefreshAll();
    } catch (err: any) {
      setScoreError(err?.response?.data?.detail || err?.message || 'Failed to save score');
    }
  };

  // ─── Team Registration Actions ──────────────────────────────────────────────

  const handleCreateTeam = async () => {
    if (!teamName.trim()) {
      setTeamError('Team name is required');
      return;
    }
    if (!selectedPlayerA || !selectedPlayerB) {
      setTeamError('Please select both players for the doubles team');
      return;
    }
    if (selectedPlayerA === selectedPlayerB) {
      setTeamError('Player 1 and Player 2 must be different members');
      return;
    }

    try {
      setTeamError(null);
      const payload: CreateLeagueTeamPayload = {
        name: teamName.trim(),
        player_membership_ids: [selectedPlayerA, selectedPlayerB],
      };
      await createTeam(payload);
      setIsAddTeamModalOpen(false);
      setTeamName('');
      setSelectedPlayerA('');
      setSelectedPlayerB('');
      refetchTeams();
    } catch (err: any) {
      setTeamError(err?.response?.data?.detail || err?.message || 'Failed to add team');
    }
  };

  // ─── Render Helpers ─────────────────────────────────────────────────────────

  if (isLeagueLoading) {
    return <LoadingState message="Loading league details..." />;
  }

  if (isLeagueError || !league) {
    return (
      <ErrorState
        message={leagueError?.message || 'Failed to load league'}
        onRetry={refetchLeague}
      />
    );
  }

  return (
    <Screen style={styles.container}>
      <AppHeader title={league.name} showBack />
      {/* Stats + Status badge — AppHeader already shows league name */}
      <ScreenHeader
        title=""
        subtitle={`${league.number_of_weeks} Weeks • ${league.teams_count} Teams • Top ${league.playoff_team_count} to Playoffs`}
        rightElement={
          <Badge
            label={league.status_display || LEAGUE_STATUS_LABELS[league.status]}
            variant={
              league.status === 'in_progress'
                ? 'info'
                : league.status === 'playoffs'
                ? 'warning'
                : league.status === 'completed'
                ? 'success'
                : 'default'
            }
          />
        }
      />

      {/* Quick Lifecycle Action Bar */}
      {canManageTournaments ? (
        <View style={styles.actionsBar}>
          {league.status === 'draft' && (
            <Button
              label="Open Registration"
              variant="primary"
              size="sm"
              fullWidth={false}
              onPress={() => handleStatusTransition('registration_open')}
              loading={isUpdatingStatus}
            />
          )}
          {league.status === 'registration_open' && (
            <Button
              label="Close Registration"
              variant="secondary"
              size="sm"
              fullWidth={false}
              onPress={() => handleStatusTransition('registration_closed')}
              loading={isUpdatingStatus}
            />
          )}
          {league.status === 'registration_closed' && (
            <Button
              label="Generate Schedule & Start League"
              variant="primary"
              size="sm"
              fullWidth={false}
              onPress={handleGenerateSchedule}
              loading={isGeneratingSchedule}
              disabled={league.teams_count < 2}
            />
          )}
          {league.status === 'in_progress' && (
            <Button
              label="Generate Playoffs"
              variant="primary"
              size="sm"
              fullWidth={false}
              onPress={handleGeneratePlayoffs}
              loading={isGeneratingPlayoffs}
            />
          )}
          {league.champion_team && (
            <View style={styles.championBox}>
              <AppText style={styles.championTitle}>
                🏆 Champion: {league.champion_team.name}
              </AppText>
            </View>
          )}
        </View>
      ) : null}

      {/* Tabs Header */}
      <View style={styles.tabsWrapper}>
        <SegmentedTabs
          tabs={[
            { key: 'schedule', label: 'Schedule' },
            { key: 'standings', label: 'Standings' },
            { key: 'playoffs', label: 'Playoffs' },
            { key: 'teams', label: 'Teams' },
          ]}
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab)}
        />
      </View>

      {/* Tab Content */}
      <ScrollView
        style={styles.tabContent}
        contentContainerStyle={{ paddingBottom: Spacing[8] }}
        refreshControl={
          <RefreshControl
            refreshing={isLeagueLoading || isMatchesLoading || isStandingsLoading}
            onRefresh={handleRefreshAll}
            tintColor={Colors.brand.primary}
          />
        }
      >
        {/* ─── TAB 1: SCHEDULE ─── */}
        {activeTab === 'schedule' && (
          <View style={styles.tabPane}>
            {/* Week selector */}
            {weeks && weeks.length > 0 ? (
              <FilterChips
                chips={weeks.map((w) => ({
                  key: w.id,
                  label: `Week ${w.week_number} (${w.week_type === 'playoffs' ? 'Playoffs' : 'Reg'})`,
                }))}
                activeChip={selectedWeekId || activeWeek?.id || weeks[0]?.id}
                onChipPress={(key) => setSelectedWeekId(key)}
              />
            ) : null}

            {/* Snapshot button for staff */}
            {canManageTournaments && activeWeek && activeWeek.week_type === 'regular_season' ? (
              <View style={styles.snapshotRow}>
                <AppText style={styles.weekStatusText}>
                  Week {activeWeek.week_number} Status: {activeWeek.status_display}
                </AppText>
                <Button
                  label="Snapshot Standings"
                  size="sm"
                  variant="secondary"
                  fullWidth={false}
                  onPress={async () => {
                    try {
                      await snapshotStandings(activeWeek.id);
                      Alert.alert('Success', `Standings snapshotted for Week ${activeWeek.week_number}`);
                    } catch (err: any) {
                      Alert.alert('Error', err?.message || 'Failed to snapshot standings');
                    }
                  }}
                  loading={isSnapshotting}
                />
              </View>
            ) : null}

            {/* Matches List */}
            {isMatchesLoading ? (
              <LoadingState message="Loading matches..." />
            ) : !matches || matches.length === 0 ? (
              <EmptyState
                title="No Matches"
                description={
                  league.status === 'draft' || league.status === 'registration_open'
                    ? 'Matches will be scheduled once registration closes and the schedule is generated.'
                    : 'No matches found for this week.'
                }
              />
            ) : (
              <View style={styles.matchesList}>
                {matches.map((m) => {
                  const isCompleted = m.status === 'completed';
                  const isBye = m.is_bye;
                  return (
                    <Card key={m.id} style={styles.matchCard}>
                      <View style={styles.matchHeader}>
                        <AppText style={styles.matchStageText}>
                          {m.stage === 'playoffs'
                            ? `Playoffs Round ${m.round_number}`
                            : `Regular Season Match ${m.match_number}`}
                        </AppText>
                        <Badge
                          label={isBye ? 'BYE' : isCompleted ? 'Completed' : 'Scheduled'}
                          variant={isBye ? 'default' : isCompleted ? 'success' : 'info'}
                        />
                      </View>

                      <View style={styles.teamsRow}>
                        <View style={styles.teamSlot}>
                          <AppText
                            style={[
                              styles.teamName,
                              m.winner_team_id === m.team_a_id && styles.winningTeam,
                            ]}
                          >
                            {m.team_a?.name || 'TBD'}
                          </AppText>
                          <AppText style={styles.scoreText}>
                            {m.score_a !== null ? m.score_a : '-'}
                          </AppText>
                        </View>

                        <AppText style={styles.vsText}>vs</AppText>

                        <View style={styles.teamSlot}>
                          <AppText
                            style={[
                              styles.teamName,
                              m.winner_team_id === m.team_b_id && styles.winningTeam,
                            ]}
                          >
                            {m.team_b?.name || (isBye ? 'BYE' : 'TBD')}
                          </AppText>
                          <AppText style={styles.scoreText}>
                            {m.score_b !== null ? m.score_b : '-'}
                          </AppText>
                        </View>
                      </View>

                      {/* Action to score match */}
                      {canManageScores && !isBye && m.team_a_id && m.team_b_id ? (
                        <View style={styles.matchFooter}>
                          <Button
                            label={isCompleted ? 'Correct Score' : 'Record Score'}
                            size="sm"
                            variant={isCompleted ? 'secondary' : 'primary'}
                            fullWidth={false}
                            onPress={() => openScoreModal(m)}
                            disabled={league.status === 'playoffs' && m.stage === 'regular_season'}
                          />
                        </View>
                      ) : null}
                    </Card>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ─── TAB 2: STANDINGS ─── */}
        {activeTab === 'standings' && (
          <View style={styles.tabPane}>
            <View style={styles.standingsHeaderRow}>
              <AppText style={styles.paneTitle}>Cumulative Standings</AppText>
              <AppText style={styles.paneSubtitle}>
                Wins → Differential → Points Scored → Team Name
              </AppText>
            </View>

            {isStandingsLoading ? (
              <LoadingState message="Calculating standings..." />
            ) : !standingsData || standingsData.standings.length === 0 ? (
              <EmptyState
                title="No Standings Data"
                description="Standings will populate as regular season matches are scored."
              />
            ) : (
              <Card style={styles.tableCard}>
                <View style={styles.tableHeader}>
                  <AppText style={[styles.th, styles.thRank]}>#</AppText>
                  <AppText style={[styles.th, styles.thTeam]}>Team</AppText>
                  <AppText style={[styles.th, styles.thStat]}>MP</AppText>
                  <AppText style={[styles.th, styles.thStat]}>W</AppText>
                  <AppText style={[styles.th, styles.thStat]}>L</AppText>
                  <AppText style={[styles.th, styles.thStat]}>+/-</AppText>
                </View>
                {standingsData.standings.map((row) => (
                  <View
                    key={row.team_id}
                    style={[
                      styles.tableRow,
                      row.rank <= league.playoff_team_count && styles.qualifyingRow,
                    ]}
                  >
                    <AppText style={[styles.td, styles.thRank, styles.rankNum]}>
                      {row.rank}
                    </AppText>
                    <View style={[styles.thTeam, { justifyContent: 'center' }]}>
                      <AppText style={styles.teamNameText} numberOfLines={1}>
                        {row.team_name}
                      </AppText>
                      {row.rank <= league.playoff_team_count ? (
                        <AppText style={styles.playoffIndicator}>Playoff Spot</AppText>
                      ) : null}
                    </View>
                    <AppText style={[styles.td, styles.thStat]}>{row.matches_played}</AppText>
                    <AppText style={[styles.td, styles.thStat, styles.boldStat]}>
                      {row.wins}
                    </AppText>
                    <AppText style={[styles.td, styles.thStat]}>{row.losses}</AppText>
                    <AppText
                      style={[
                        styles.td,
                        styles.thStat,
                        row.points_differential > 0 ? styles.positiveDiff : styles.negativeDiff,
                      ]}
                    >
                      {row.points_differential > 0 ? `+${row.points_differential}` : row.points_differential}
                    </AppText>
                  </View>
                ))}
              </Card>
            )}

            {/* Preserved Weekly Snapshots List */}
            {snapshots && snapshots.length > 0 ? (
              <View style={styles.snapshotsSection}>
                <AppText style={styles.sectionTitle}>Preserved Snapshots History</AppText>
                <AppText style={styles.sectionSubtitle}>
                  {snapshots.length} historical snapshot records saved across completed weeks
                </AppText>
              </View>
            ) : null}
          </View>
        )}

        {/* ─── TAB 3: PLAYOFFS ─── */}
        {activeTab === 'playoffs' && (
          <View style={styles.tabPane}>
            <View style={styles.standingsHeaderRow}>
              <AppText style={styles.paneTitle}>Championship Playoffs</AppText>
              <AppText style={styles.paneSubtitle}>
                Week {league.number_of_weeks} • Top {league.playoff_team_count} Teams • Single-Elimination
              </AppText>
            </View>

            {isPlayoffsLoading ? (
              <LoadingState message="Loading playoff bracket..." />
            ) : !playoffs ? (
              <EmptyState
                title="Playoffs Not Generated"
                description="Playoffs begin in the final week once regular season matches complete."
                actionLabel={canManageTournaments ? 'Generate Playoffs Now' : undefined}
                onAction={canManageTournaments ? handleGeneratePlayoffs : undefined}
              />
            ) : (
              <View>
                <Card style={styles.playoffSummaryCard}>
                  <AppText style={styles.bracketSummaryTitle}>Playoff Bracket Active</AppText>
                  <AppText style={styles.bracketSummaryText}>
                    • {playoffs.playoff_teams_count} Qualified Teams{'\n'}
                    • {playoffs.rounds_count} Playoff Rounds{'\n'}
                    • {playoffs.matches_played} Matches Completed, {playoffs.matches_remaining} Remaining
                  </AppText>
                  {playoffs.champion_team_name ? (
                    <View style={styles.championBox}>
                      <AppText style={styles.championTitle}>
                        👑 Champion: {playoffs.champion_team_name}
                      </AppText>
                    </View>
                  ) : null}
                </Card>

                {/* View playoff matches by switching week selector in schedule */}
                <Button
                  label="View Playoff Matches in Schedule Tab"
                  variant="secondary"
                  onPress={() => {
                    const playoffWeek = weeks?.find((w) => w.week_type === 'playoffs');
                    if (playoffWeek) setSelectedWeekId(playoffWeek.id);
                    setActiveTab('schedule');
                  }}
                  style={{ marginTop: Spacing[4] }}
                />
              </View>
            )}
          </View>
        )}

        {/* ─── TAB 4: TEAMS ─── */}
        {activeTab === 'teams' && (
          <View style={styles.tabPane}>
            <View style={styles.teamsHeaderRow}>
              <View>
                <AppText style={styles.paneTitle}>Registered Teams ({teams?.length || 0})</AppText>
                <AppText style={styles.paneSubtitle}>Fixed doubles rosters (2 players per team)</AppText>
              </View>
              {canManageTournaments && league.status === 'draft' ? (
                <Button
                  label="Add Team"
                  size="sm"
                  variant="primary"
                  fullWidth={false}
                  onPress={() => {
                    setTeamName('');
                    setSelectedPlayerA('');
                    setSelectedPlayerB('');
                    setTeamError(null);
                    setIsAddTeamModalOpen(true);
                  }}
                />
              ) : null}
            </View>

            {isTeamsLoading ? (
              <LoadingState message="Loading teams..." />
            ) : !teams || teams.length === 0 ? (
              <EmptyState
                title="No Teams Registered"
                description="Add teams before closing registration and generating regular season schedule."
              />
            ) : (
              <View style={styles.teamsList}>
                {teams.map((t) => (
                  <Card key={t.id} style={styles.teamCard}>
                    <View style={styles.teamCardHeader}>
                      <AppText style={styles.teamCardName}>{t.name}</AppText>
                      {t.seed ? <Badge label={`Seed ${t.seed}`} variant="default" /> : null}
                    </View>
                    <View style={styles.rosterRow}>
                      <AppText style={styles.rosterLabel}>Roster:</AppText>
                      <AppText style={styles.rosterNames}>
                        {t.members
                          ?.map((m) => m.user?.display_name || m.user?.full_name || 'Player')
                          .join(' & ') || 'No members'}
                      </AppText>
                    </View>
                  </Card>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ─── SCORE RECORDING MODAL ─── */}
      <ModalSheet
        visible={Boolean(scoreModalMatch)}
        onClose={() => setScoreModalMatch(null)}
        title={
          scoreModalMatch?.status === 'completed'
            ? 'Correct Match Score'
            : 'Record Match Score'
        }
        subtitle="Target 11, must win by 2 margin."
        actions={[
          {
            label: 'Cancel',
            variant: 'secondary',
            onPress: () => setScoreModalMatch(null),
          },
          {
            label: 'Save Score',
            variant: 'primary',
            onPress: handleSaveScore,
            loading: isRecordingScore || isCorrectingScore,
          },
        ]}
      >
        <View style={{ gap: Spacing[3], paddingBottom: Spacing[4] }}>
          {scoreError ? (
            <View style={styles.errorContainer}>
              <AppText style={styles.errorText}>{scoreError}</AppText>
            </View>
          ) : null}

          <View style={styles.scoreInputsRow}>
            <View style={styles.scoreInputCol}>
              <AppText style={styles.scoreTeamLabel} numberOfLines={1}>
                {scoreModalMatch?.team_a?.name || 'Team A'}
              </AppText>
              <Input
                placeholder="0"
                keyboardType="numeric"
                value={scoreA}
                onChangeText={setScoreA}
                style={styles.scoreInput}
              />
            </View>

            <AppText style={styles.scoreVs}>vs</AppText>

            <View style={styles.scoreInputCol}>
              <AppText style={styles.scoreTeamLabel} numberOfLines={1}>
                {scoreModalMatch?.team_b?.name || 'Team B'}
              </AppText>
              <Input
                placeholder="0"
                keyboardType="numeric"
                value={scoreB}
                onChangeText={setScoreB}
                style={styles.scoreInput}
              />
            </View>
          </View>
        </View>
      </ModalSheet>

      {/* ─── ADD TEAM MODAL ─── */}
      <ModalSheet
        visible={isAddTeamModalOpen}
        onClose={() => setIsAddTeamModalOpen(false)}
        title="Register League Team"
        subtitle="Doubles format: Select team name and 2 club players."
        actions={[
          {
            label: 'Cancel',
            variant: 'secondary',
            onPress: () => setIsAddTeamModalOpen(false),
          },
          {
            label: 'Register Team',
            variant: 'primary',
            onPress: handleCreateTeam,
            loading: isCreatingTeam,
          },
        ]}
      >
        <View style={{ gap: Spacing[3], paddingBottom: Spacing[4] }}>
          {teamError ? (
            <View style={styles.errorContainer}>
              <AppText style={styles.errorText}>{teamError}</AppText>
            </View>
          ) : null}

          <Input
            label="Team Name *"
            placeholder="e.g., The Dinkers"
            value={teamName}
            onChangeText={setTeamName}
          />

          {/* Player 1 Selection */}
          <AppText style={styles.selectLabel}>Player 1 *</AppText>
          <View style={styles.playerSelectList}>
            {clubPlayers?.map((pm) => (
              <TouchableOpacity
                key={pm.id}
                style={[
                  styles.playerOption,
                  selectedPlayerA === pm.id && styles.playerOptionSelected,
                ]}
                onPress={() => setSelectedPlayerA(pm.id)}
              >
                <AppText
                  style={[
                    styles.playerOptionText,
                    selectedPlayerA === pm.id && styles.playerOptionTextSelected,
                  ]}
                >
                  {pm.user_full_name || pm.user_email}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>

          {/* Player 2 Selection */}
          <AppText style={[styles.selectLabel, { marginTop: Spacing[2] }]}>Player 2 *</AppText>
          <View style={styles.playerSelectList}>
            {clubPlayers?.map((pm) => (
              <TouchableOpacity
                key={pm.id}
                style={[
                  styles.playerOption,
                  selectedPlayerB === pm.id && styles.playerOptionSelected,
                ]}
                onPress={() => setSelectedPlayerB(pm.id)}
              >
                <AppText
                  style={[
                    styles.playerOptionText,
                    selectedPlayerB === pm.id && styles.playerOptionTextSelected,
                  ]}
                >
                  {pm.user_full_name || pm.user_email}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ModalSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  actionsBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
    paddingHorizontal: Spacing[4],
    marginBottom: Spacing[2],
    alignItems: 'center',
  },
  tabsWrapper: {
    paddingHorizontal: Spacing[4],
    marginBottom: Spacing[2],
  },
  championBox: {
    backgroundColor: '#E7F5EC',
    paddingHorizontal: Spacing[2],
    paddingVertical: 4,
    borderRadius: Radius.md,
  },
  championTitle: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.brand.primary,
  },
  tabContent: {
    flex: 1,
  },
  tabPane: {
    padding: Spacing[4],
  },
  snapshotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[2],
    padding: Spacing[1],
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.md,
  },
  weekStatusText: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
  },
  matchesList: {
    gap: Spacing[2],
  },
  matchCard: {
    padding: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    marginBottom: Spacing[1],
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing[1],
  },
  matchStageText: {
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: Spacing[1],
  },
  teamSlot: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamName: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
    flex: 1,
  },
  winningTeam: {
    color: Colors.brand.primary,
    fontWeight: Typography.weight.bold,
  },
  scoreText: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
    paddingHorizontal: Spacing[1],
  },
  vsText: {
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
    marginHorizontal: Spacing[1],
  },
  matchFooter: {
    marginTop: Spacing[1],
    alignItems: 'flex-end',
  },
  standingsHeaderRow: {
    marginBottom: Spacing[2],
  },
  paneTitle: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  paneSubtitle: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
  },
  tableCard: {
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: Colors.surface.elevated,
    paddingVertical: Spacing[1],
    paddingHorizontal: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
    alignItems: 'center',
  },
  qualifyingRow: {
    backgroundColor: '#E7F5EC',
  },
  th: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.text.secondary,
  },
  td: {
    fontSize: Typography.size.xs,
    color: Colors.text.primary,
  },
  thRank: {
    width: 24,
    textAlign: 'center',
  },
  rankNum: {
    fontWeight: Typography.weight.bold,
  },
  thTeam: {
    flex: 1,
    paddingLeft: Spacing[1],
  },
  teamNameText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
  },
  playoffIndicator: {
    fontSize: 9,
    color: Colors.brand.primary,
    fontWeight: Typography.weight.bold,
  },
  thStat: {
    width: 32,
    textAlign: 'center',
  },
  boldStat: {
    fontWeight: Typography.weight.bold,
  },
  positiveDiff: {
    color: Colors.status.success,
    fontWeight: Typography.weight.semibold,
  },
  negativeDiff: {
    color: Colors.status.error,
  },
  snapshotsSection: {
    marginTop: Spacing[4],
  },
  sectionTitle: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  sectionSubtitle: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
  },
  playoffSummaryCard: {
    padding: Spacing[4],
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  bracketSummaryTitle: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
    marginBottom: Spacing[1],
  },
  bracketSummaryText: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
    lineHeight: 20,
  },
  teamsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[2],
  },
  teamsList: {
    gap: Spacing[1],
  },
  teamCard: {
    padding: Spacing[2],
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    marginBottom: Spacing[1],
  },
  teamCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamCardName: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  rosterRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  rosterLabel: {
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
    marginRight: 4,
  },
  rosterNames: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
  },
  errorContainer: {
    padding: Spacing[2],
    backgroundColor: Colors.status.errorBg,
    borderRadius: Radius.md,
    marginBottom: Spacing[3],
  },
  errorText: {
    fontSize: Typography.size.xs,
    color: Colors.status.error,
  },
  scoreInputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginVertical: Spacing[3],
  },
  scoreInputCol: {
    flex: 1,
    alignItems: 'center',
  },
  scoreTeamLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
    marginBottom: Spacing[1],
  },
  scoreInput: {
    textAlign: 'center',
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    width: 80,
  },
  scoreVs: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: Colors.text.tertiary,
    marginHorizontal: Spacing[2],
  },
  selectLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
    marginBottom: 4,
  },
  playerSelectList: {
    maxHeight: 120,
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  playerOption: {
    padding: Spacing[1],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
  },
  playerOptionSelected: {
    backgroundColor: '#E7F5EC',
  },
  playerOptionText: {
    fontSize: Typography.size.xs,
    color: Colors.text.primary,
  },
  playerOptionTextSelected: {
    color: Colors.brand.primary,
    fontWeight: Typography.weight.bold,
  },
});
