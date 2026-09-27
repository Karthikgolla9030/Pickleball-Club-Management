/**
 * Aught2 Pickleball — Player Leagues Screen (Phase 9)
 *
 * Provides authenticated players with read-only league viewing:
 *   - Browse active & completed leagues across clubs
 *   - View real-time cumulative standings and tiebreaker ranks
 *   - Inspect weekly match schedules and verified scores
 *   - Track championship playoff bracket progression and crowned champion
 */

import React, { useState } from 'react';
import {
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  AppText,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  FilterChips,
  LoadingState,
  Screen,
  ScreenHeader,
  SegmentedTabs,
  AppHeader,
  LeagueCard,
} from '@/components';
import {
  usePlayerLeagueMatches,
  usePlayerLeaguePlayoffs,
  usePlayerLeagues,
  usePlayerLeagueStandings,
  usePlayerLeagueWeeks,
} from '@/hooks';
import { Colors, Layout, Radius, Shadows, Spacing, Typography } from '@/theme';
import type {
  LeagueSummary,
} from '@/types';

const LEAGUE_DETAIL_TABS: { key: 'standings' | 'schedule' | 'playoffs'; label: string }[] = [
  { key: 'standings', label: 'Standings' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'playoffs', label: 'Playoffs' },
];

export default function PlayerLeaguesScreen() {
  const [selectedLeague, setSelectedLeague] = useState<LeagueSummary | null>(null);
  const [detailTab, setDetailTab] = useState<'standings' | 'schedule' | 'playoffs'>('standings');
  const [selectedWeekId, setSelectedWeekId] = useState<string | undefined>(undefined);

  const {
    data: leagues,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = usePlayerLeagues();

  const leagueId = selectedLeague?.id || null;

  const { data: standingsData, isLoading: isStandingsLoading } = usePlayerLeagueStandings(leagueId);
  const { data: weeks } = usePlayerLeagueWeeks(leagueId);
  const { data: matches, isLoading: isMatchesLoading } = usePlayerLeagueMatches(
    leagueId,
    selectedWeekId
  );
  const { data: playoffs, isLoading: isPlayoffsLoading } = usePlayerLeaguePlayoffs(leagueId);

  const renderLeagueCard = ({ item }: { item: LeagueSummary }) => {
    return (
      <LeagueCard
        league={item}
        actionLabel="Details ›"
        onPress={() => {
          setSelectedLeague(item);
          setDetailTab('standings');
          setSelectedWeekId(undefined);
        }}
      />
    );
  };

  return (
    <Screen style={styles.container}>
      <AppHeader title="Leagues" />
      <ScreenHeader
        title="Leagues & Ladders"
        subtitle="Track weekly standings, upcoming matches, and playoff brackets"
      />

      {isLoading ? (
        <LoadingState message="Loading leagues..." />
      ) : isError ? (
        <ErrorState
          message={error?.message || 'Failed to load leagues'}
          onRetry={refetch}
        />
      ) : !leagues || leagues.length === 0 ? (
        <EmptyState
          title="No leagues available right now."
          description="Check back later for upcoming leagues."
        />
      ) : (
        <FlatList
          data={leagues}
          keyExtractor={(item) => item.id}
          renderItem={renderLeagueCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.brand.primary}
            />
          }
        />
      )}

      {/* League Details Modal */}
      <Modal
        visible={Boolean(selectedLeague)}
        animationType="slide"
        onRequestClose={() => setSelectedLeague(null)}
      >
        <Screen style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setSelectedLeague(null)}
              style={styles.modalCloseBtn}
            >
              <AppText style={styles.closeBtnText}>✕ Close</AppText>
            </TouchableOpacity>

            <AppText style={styles.modalTitle}>{selectedLeague?.name}</AppText>
            <AppText style={styles.modalSubtitle}>
              {selectedLeague?.number_of_weeks} Weeks • {selectedLeague?.teams_count} Teams •{' '}
              {selectedLeague?.status_display}
            </AppText>
          </View>

          {/* Sub-tabs */}
          <View style={{ marginHorizontal: Spacing[4], marginBottom: Spacing[3] }}>
            <SegmentedTabs
              tabs={LEAGUE_DETAIL_TABS}
              activeTab={detailTab}
              onTabChange={setDetailTab}
            />
          </View>

          <ScrollView style={styles.modalBody}>
            {/* ─── STANDINGS ─── */}
            {detailTab === 'standings' && (
              <View style={styles.tabPane}>
                {isStandingsLoading ? (
                  <LoadingState message="Loading standings..." />
                ) : !standingsData || standingsData.standings.length === 0 ? (
                  <EmptyState
                    title="No Standings"
                    description="Standings will be updated once regular season matches are scored."
                  />
                ) : (
                  <Card style={styles.tableCard}>
                    <View style={styles.tableHeader}>
                      <AppText style={[styles.th, styles.thRank]}>#</AppText>
                      <AppText style={[styles.th, styles.thTeam]}>Team</AppText>
                      <AppText style={[styles.th, styles.thStat]}>MP</AppText>
                      <AppText style={[styles.th, styles.thStat]}>W</AppText>
                      <AppText style={[styles.th, styles.thStat]}>L</AppText>
                      <AppText style={[styles.th, styles.thStat]}>Diff</AppText>
                    </View>
                    {standingsData.standings.map((r) => (
                      <View
                        key={r.team_id}
                        style={[
                          styles.tableRow,
                          selectedLeague &&
                            r.rank <= selectedLeague.playoff_team_count &&
                            styles.qualifyingRow,
                        ]}
                      >
                        <AppText style={[styles.td, styles.thRank, styles.rankBold]}>
                          {r.rank}
                        </AppText>
                        <View style={styles.thTeam}>
                          <AppText style={styles.teamNameText} numberOfLines={1}>
                            {r.team_name}
                          </AppText>
                          {selectedLeague && r.rank <= selectedLeague.playoff_team_count ? (
                            <AppText style={styles.playoffTag}>Playoffs</AppText>
                          ) : null}
                        </View>
                        <AppText style={[styles.td, styles.thStat]}>{r.matches_played}</AppText>
                        <AppText style={[styles.td, styles.thStat, styles.bold]}>{r.wins}</AppText>
                        <AppText style={[styles.td, styles.thStat]}>{r.losses}</AppText>
                        <AppText
                          style={[
                            styles.td,
                            styles.thStat,
                            r.points_differential > 0 ? styles.posDiff : styles.negDiff,
                          ]}
                        >
                          {r.points_differential > 0 ? `+${r.points_differential}` : r.points_differential}
                        </AppText>
                      </View>
                    ))}
                  </Card>
                )}
              </View>
            )}

            {/* ─── SCHEDULE ─── */}
            {detailTab === 'schedule' && (
              <View style={styles.tabPane}>
                {weeks && weeks.length > 0 ? (
                  <View style={{ marginBottom: Spacing[3] }}>
                    <FilterChips
                      chips={weeks.map((w) => ({ key: w.id, label: `Week ${w.week_number}` }))}
                      activeChip={selectedWeekId || weeks[0]?.id || ''}
                      onChipPress={(id) => setSelectedWeekId(id)}
                    />
                  </View>
                ) : null}

                {isMatchesLoading ? (
                  <LoadingState message="Loading matches..." />
                ) : !matches || matches.length === 0 ? (
                  <EmptyState title="No Matches" description="No matches scheduled for this week." />
                ) : (
                  <View style={styles.matchesList}>
                    {matches.map((m) => (
                      <Card key={m.id} style={styles.matchCard}>
                        <View style={styles.matchHeader}>
                          <AppText style={styles.matchStage}>
                            {m.stage === 'playoffs'
                              ? `Playoff Round ${m.round_number}`
                              : `Match ${m.match_number}`}
                          </AppText>
                          <Badge
                            label={m.is_bye ? 'BYE' : m.status === 'completed' ? 'Final' : 'Scheduled'}
                            variant={m.is_bye ? 'default' : m.status === 'completed' ? 'success' : 'info'}
                          />
                        </View>
                        <View style={styles.matchRow}>
                          <View style={styles.matchTeamSide}>
                            <AppText
                              style={[
                                styles.matchTeamName,
                                m.winner_team_id === m.team_a_id && styles.winnerName,
                              ]}
                            >
                              {m.team_a?.name || 'TBD'}
                            </AppText>
                            <AppText style={styles.matchScore}>
                              {m.score_a !== null ? m.score_a : '-'}
                            </AppText>
                          </View>
                          <AppText style={styles.matchVs}>vs</AppText>
                          <View style={styles.matchTeamSide}>
                            <AppText
                              style={[
                                styles.matchTeamName,
                                m.winner_team_id === m.team_b_id && styles.winnerName,
                              ]}
                            >
                              {m.team_b?.name || (m.is_bye ? 'BYE' : 'TBD')}
                            </AppText>
                            <AppText style={styles.matchScore}>
                              {m.score_b !== null ? m.score_b : '-'}
                            </AppText>
                          </View>
                        </View>
                      </Card>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* ─── PLAYOFFS ─── */}
            {detailTab === 'playoffs' && (
              <View style={styles.tabPane}>
                {isPlayoffsLoading ? (
                  <LoadingState message="Loading playoffs..." />
                ) : !playoffs ? (
                  <EmptyState
                    title="Playoffs Not Started"
                    description="The single-elimination championship playoffs will commence once the regular season concludes."
                  />
                ) : (
                  <Card style={styles.playoffCard}>
                    <AppText style={styles.playoffTitle}>Championship Bracket</AppText>
                    <AppText style={styles.playoffMeta}>
                      {playoffs.playoff_teams_count} Teams • {playoffs.rounds_count} Rounds •{' '}
                      {playoffs.matches_played} Matches Completed
                    </AppText>
                    {playoffs.champion_team_name ? (
                      <View style={styles.championBox}>
                        <AppText style={styles.championBoxText}>
                          👑 League Champion: {playoffs.champion_team_name}
                        </AppText>
                      </View>
                    ) : null}
                  </Card>
                )}
              </View>
            )}
          </ScrollView>
        </Screen>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  header: {
    padding: Spacing[4],
    backgroundColor: Colors.background.secondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
  },
  title: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  subtitle: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: Layout.screenHorizontal,
    paddingBottom: Layout.bottomScrollPadding,
  },
  card: {
    padding: Spacing[4],
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    ...Shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitleContainer: {
    flex: 1,
    marginRight: Spacing[2],
  },
  leagueName: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  description: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing[3],
    paddingTop: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: Colors.surface.border,
  },
  metaCol: {
    alignItems: 'flex-start',
  },
  metaLabel: {
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
  },
  metaValue: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
    color: Colors.text.primary,
    marginTop: 2,
  },
  championBadge: {
    marginTop: Spacing[2],
    padding: Spacing[1],
    backgroundColor: '#E7F5EC',
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  championText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: Colors.brand.primary,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  modalHeader: {
    padding: Spacing[4],
    backgroundColor: Colors.background.secondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
  },
  modalCloseBtn: {
    marginBottom: Spacing[1],
  },
  closeBtnText: {
    fontSize: Typography.size.sm,
    color: Colors.brand.primary,
    fontWeight: Typography.weight.semibold,
  },
  modalTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  modalSubtitle: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  modalTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.surface.default,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
  },
  modalTab: {
    flex: 1,
    paddingVertical: Spacing[2],
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  modalTabActive: {
    borderBottomColor: Colors.brand.primary,
  },
  modalTabText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
    color: Colors.text.tertiary,
  },
  modalTabTextActive: {
    color: Colors.brand.primary,
    fontWeight: Typography.weight.bold,
  },
  modalBody: {
    flex: 1,
  },
  tabPane: {
    padding: Spacing[4],
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
  rankBold: {
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
  playoffTag: {
    fontSize: 9,
    color: Colors.brand.primary,
    fontWeight: Typography.weight.bold,
  },
  thStat: {
    width: 32,
    textAlign: 'center',
  },
  bold: {
    fontWeight: Typography.weight.bold,
  },
  posDiff: {
    color: Colors.status.success,
    fontWeight: Typography.weight.semibold,
  },
  negDiff: {
    color: Colors.status.error,
  },
  weeksBar: {
    gap: Spacing[1],
    marginBottom: Spacing[2],
  },
  weekPill: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1],
    borderRadius: Radius.full,
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    marginRight: Spacing[1],
  },
  weekPillActive: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  weekPillText: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
  },
  weekPillTextActive: {
    color: Colors.text.inverse,
    fontWeight: Typography.weight.bold,
  },
  matchesList: {
    gap: Spacing[1],
  },
  matchCard: {
    padding: Spacing[2],
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    marginBottom: Spacing[1],
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  matchStage: {
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchTeamSide: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  matchTeamName: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
    flex: 1,
  },
  winnerName: {
    color: Colors.brand.primary,
    fontWeight: Typography.weight.bold,
  },
  matchScore: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
    paddingHorizontal: Spacing[1],
  },
  matchVs: {
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
    marginHorizontal: Spacing[1],
  },
  playoffCard: {
    padding: Spacing[4],
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  playoffTitle: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  playoffMeta: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
    marginTop: 4,
    lineHeight: 18,
  },
  championBox: {
    marginTop: Spacing[4],
    padding: Spacing[2],
    backgroundColor: '#E7F5EC',
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  championBoxText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: Colors.brand.primary,
  },
});
