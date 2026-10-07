/**
 * Aught2 Pickleball — League Details Screen (Screen 2)
 *
 * Dedicated player-facing league details screen matching Screen 2 of reference mockup:
 *   - Clean top section: back button, centered title, overflow action, status badge, metadata subtitle
 *   - 3-column compact info row: Calendar / Dates, Venue / Courts, Trophy / Playoff spots
 *   - Player registration panel:
 *     - If registered: "You are registered" confirmation card + "View Team >" action opening saved details
 *     - If open & unregistered: "Register for this League" action opening registration wizard
 *     - If closed & unregistered: closed registration notice
 *   - 4 Segmented tabs: Standings, Schedule, Playoffs, Results
 *   - League Progress card with live match progress and teal progress bar
 *   - Standings table with rank circles (#1 Gold, #2 Slate, #3 Bronze), team and registered player names,
 *     MP, W, L, Diff, and Pts columns
 */

import React, { useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Award,
  BarChart2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Info,
  MapPin,
  MoreVertical,
  Trophy,
  Users,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import {
  LeagueRegistrationDetailsModal,
  LeagueRegistrationModal,
} from '@/components/league-registration';
import {
  useAuth,
  usePlayerLeagueDetails,
  usePlayerLeagueMatches,
  usePlayerLeaguePlayoffs,
  usePlayerLeagueRegistrationStatus,
  usePlayerLeagueStandings,
  usePlayerLeagueWeeks,
} from '@/hooks';
import { Colors, Radius, Shadows, Spacing } from '@/theme';
import type { LeagueMatch, LeagueSummary, LeagueWeek } from '@/types';
import { formatDate } from '@/utils/formatters';

type TabKey = 'standings' | 'schedule' | 'playoffs' | 'results';

const DETAIL_TABS: { key: TabKey; label: string }[] = [
  { key: 'standings', label: 'Standings' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'playoffs', label: 'Playoffs' },
  { key: 'results', label: 'Results' },
];

export default function PlayerLeagueDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const leagueId = id ?? null;

  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('standings');
  const [selectedWeekId, setSelectedWeekId] = useState<string | undefined>(undefined);

  // Modals state
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  // Authoritative queries
  const {
    data: league,
    isLoading: isLoadingLeague,
    error: leagueError,
    refetch: refetchLeague,
    isRefetching: isRefetchingLeague,
  } = usePlayerLeagueDetails(leagueId);

  const {
    data: standingsData,
    isLoading: isLoadingStandings,
    refetch: refetchStandings,
  } = usePlayerLeagueStandings(leagueId);

  const {
    data: weeks,
    refetch: refetchWeeks,
  } = usePlayerLeagueWeeks(leagueId);

  const {
    data: matches,
    isLoading: isLoadingMatches,
    refetch: refetchMatches,
  } = usePlayerLeagueMatches(leagueId, selectedWeekId);

  const {
    data: playoffs,
    refetch: refetchPlayoffs,
  } = usePlayerLeaguePlayoffs(leagueId);

  const {
    data: regStatus,
    refetch: refetchRegStatus,
  } = usePlayerLeagueRegistrationStatus(leagueId);

  const isRefreshing = isRefetchingLeague;

  const handleRefresh = async () => {
    await Promise.all([
      refetchLeague(),
      refetchStandings(),
      refetchWeeks(),
      refetchMatches(),
      refetchPlayoffs(),
      refetchRegStatus(),
    ]);
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(player)/leagues' as any);
    }
  };

  const handleOptionsPress = () => {
    Alert.alert(
      league?.name || 'League Options',
      'Select an action',
      [
        { text: 'Refresh League Data', onPress: () => void handleRefresh() },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  // Determine active week
  const activeWeekNumber = league?.current_week || 1;
  const totalWeeks = league?.total_weeks || league?.number_of_weeks || 12;
  const isSingles = (league?.team_size ?? 2) === 1;
  const formatLabel = isSingles ? 'Singles' : (league?.category || 'Doubles');

  const isLive = league?.status === 'in_progress';
  const isCompleted = league?.status === 'completed';
  const isOpenReg =
    league?.status === 'registration_open' ||
    league?.registration_status === 'open';
  const isClosedReg =
    league?.status === 'registration_closed' ||
    league?.registration_status === 'closed';

  // Registration state from backend
  const isRegistered = Boolean(league?.is_registered || regStatus?.is_registered);
  const myTeamName = league?.my_team_name || regStatus?.team?.name;

  // Match statistics for League Progress card
  const totalMatches =
    league?.total_matches_count ||
    (league?.max_teams ? (league.max_teams * (league.max_teams - 1)) / 2 : 66);
  const completedMatches = league?.completed_matches_count || 0;
  const progressPct =
    totalMatches > 0
      ? Math.min(100, Math.round((completedMatches / totalMatches) * 100))
      : 0;

  // Standings rows
  const standings = useMemo(() => {
    return standingsData?.standings || [];
  }, [standingsData]);

  // Formatted date helpers
  const formatRangeDates = (start?: string | null, end?: string | null): string => {
    if (!start) return 'Schedule TBA';
    try {
      const s = new Date(start);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const sStr = `${days[s.getDay()]}, ${s.getDate()} ${months[s.getMonth()]}`;
      if (!end) return sStr;
      const e = new Date(end);
      const eStr = `${days[e.getDay()]}, ${e.getDate()} ${months[e.getMonth()]} ${e.getFullYear()}`;
      return `${sStr} – ${eStr}`;
    } catch {
      return `${start} – ${end || ''}`;
    }
  };

  if (isLoadingLeague && !isRefreshing) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.brand.primary} />
        <AppText style={styles.loadingText}>Loading league details...</AppText>
      </SafeAreaView>
    );
  }

  if (leagueError || !league) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <AppText style={styles.errorTitle}>League Not Found</AppText>
        <AppText style={styles.errorMessage}>
          {leagueError?.message || 'Unable to retrieve details for this league.'}
        </AppText>
        <TouchableOpacity style={styles.backActionButton} onPress={handleBack}>
          <AppText style={styles.backActionText}>Return to Leagues</AppText>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* ─── Top Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.circleButton}
          onPress={handleBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Back to leagues list"
        >
          <ArrowLeft size={20} color={Colors.text.primary} />
        </TouchableOpacity>

        <AppText style={styles.headerTitle} numberOfLines={2}>
          {league.name}
        </AppText>

        <TouchableOpacity
          style={styles.circleButton}
          onPress={handleOptionsPress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="League options menu"
        >
          <MoreVertical size={20} color={Colors.text.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.brand.primary}
            colors={[Colors.brand.primary]}
          />
        }
      >
        {/* Status Badge & Subtitle Line */}
        <View style={styles.topStatusSection}>
          <View
            style={[
              styles.statusBadge,
              isLive
                ? styles.statusBadgeLive
                : isOpenReg
                ? styles.statusBadgeOpen
                : isClosedReg
                ? styles.statusBadgeClosed
                : isCompleted
                ? styles.statusBadgeCompleted
                : styles.statusBadgeUpcoming,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                isLive
                  ? { backgroundColor: '#16A34A' }
                  : isOpenReg
                  ? { backgroundColor: '#D97706' }
                  : isClosedReg
                  ? { backgroundColor: '#64748B' }
                  : isCompleted
                  ? { backgroundColor: '#475569' }
                  : { backgroundColor: '#0284C7' },
              ]}
            />
            <AppText
              style={[
                styles.statusBadgeText,
                isLive
                  ? { color: '#15803D' }
                  : isOpenReg
                  ? { color: '#B45309' }
                  : isClosedReg
                  ? { color: '#64748B' }
                  : isCompleted
                  ? { color: '#475569' }
                  : { color: '#0369A1' },
              ]}
            >
              {isLive
                ? 'LIVE / IN PROGRESS'
                : isOpenReg
                ? 'OPEN REGISTRATION'
                : isClosedReg
                ? 'REGISTRATION CLOSED'
                : isCompleted
                ? 'COMPLETED'
                : 'UPCOMING'}
            </AppText>
          </View>

          <AppText style={styles.metadataSubtitle}>
            {`${totalWeeks} Weeks  •  ${league.max_teams || 12} Teams  •  ${formatLabel}  •  Top ${league.playoff_team_count || 4} to Playoffs`}
          </AppText>
        </View>

        {/* ─── Compact Info Row (3 Cards) ───────────────────────────── */}
        <View style={styles.infoRow}>
          {/* Card 1: Schedule / Week */}
          <View style={styles.infoCard}>
            <View style={styles.infoCardHeader}>
              <Calendar size={15} color="#0D9488" />
              <AppText style={styles.infoCardTitle}>
                {isLive ? `Week ${activeWeekNumber} of ${totalWeeks}` : `${totalWeeks} Weeks`}
              </AppText>
            </View>
            <AppText style={styles.infoCardSub} numberOfLines={2}>
              {formatRangeDates(league.start_date, league.end_date)}
            </AppText>
          </View>

          {/* Card 2: Courts / Club */}
          <View style={styles.infoCard}>
            <View style={styles.infoCardHeader}>
              <MapPin size={15} color="#0D9488" />
              <AppText style={styles.infoCardTitle}>Courts 1-4</AppText>
            </View>
            <AppText style={styles.infoCardSub} numberOfLines={2}>
              Aught2 Pickleball Club
            </AppText>
          </View>

          {/* Card 3: Playoffs */}
          <View style={styles.infoCard}>
            <View style={styles.infoCardHeader}>
              <Trophy size={15} color="#0D9488" />
              <AppText style={styles.infoCardTitle}>
                Top {league.playoff_team_count || 4}
              </AppText>
            </View>
            <AppText style={styles.infoCardSub}>to Playoffs</AppText>
          </View>
        </View>

        {/* ─── Registration Confirmation / Action Panel ────────────── */}
        {isRegistered ? (
          <View style={styles.registeredCard}>
            <View style={styles.registeredLeft}>
              <View style={styles.checkCircleWrap}>
                <CheckCircle2 size={24} color="#059669" fill="#D1FAE5" />
              </View>
              <View style={styles.registeredTextCol}>
                <AppText style={styles.registeredTitle}>You are registered</AppText>
                <AppText style={styles.registeredTeam}>
                  {myTeamName ? `Team: ${myTeamName}` : `Player: ${user?.full_name || 'Enrolled'}`}
                </AppText>
              </View>
            </View>
            <TouchableOpacity
              style={styles.viewTeamButton}
              onPress={() => setIsDetailsModalOpen(true)}
              activeOpacity={0.8}
            >
              <AppText style={styles.viewTeamButtonText}>
                {isSingles ? 'View Entry' : 'View Team'}
              </AppText>
              <ChevronRight size={15} color="#065F46" />
            </TouchableOpacity>
          </View>
        ) : isOpenReg ? (
          <View style={styles.openRegCard}>
            <View style={styles.openRegInfo}>
              <AppText style={styles.openRegTitle}>Registration is Open</AppText>
              <AppText style={styles.openRegSub}>
                Fee: {league.registration_fee ? `$${league.registration_fee.toFixed(2)}` : 'Free ($0.00)'}
                {league.current_teams_count != null && league.max_teams
                  ? `  •  ${league.current_teams_count}/${league.max_teams} spots filled`
                  : ''}
              </AppText>
            </View>
            <TouchableOpacity
              style={styles.registerActionButton}
              onPress={() => setIsRegisterModalOpen(true)}
              activeOpacity={0.85}
            >
              <AppText style={styles.registerActionText}>Register for this League</AppText>
            </TouchableOpacity>
          </View>
        ) : isClosedReg ? (
          <View style={styles.closedRegCard}>
            <Clock size={16} color="#64748B" />
            <AppText style={styles.closedRegText}>
              Registration has closed for this league.
            </AppText>
          </View>
        ) : null}

        {/* ─── Segmented Tabs ───────────────────────────────────────── */}
        <View style={styles.tabBar}>
          {DETAIL_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabItem, isActive && styles.tabItemActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.85}
              >
                <AppText style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                  {tab.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ─── TAB 1: STANDINGS ─────────────────────────────────────── */}
        {activeTab === 'standings' && (
          <View style={styles.tabContent}>
            {/* League Progress Card (for live/in progress leagues) */}
            {isLive && (
              <View style={styles.progressCard}>
                <View style={styles.progressCardHeader}>
                  <View style={styles.progressTitleRow}>
                    <BarChart2 size={18} color="#065F46" />
                    <AppText style={styles.progressCardTitle}>League Progress</AppText>
                  </View>
                  <View style={styles.weekPill}>
                    <AppText style={styles.weekPillText}>
                      Week {activeWeekNumber} of {totalWeeks}
                    </AppText>
                  </View>
                </View>

                <View style={styles.progressDetailsRow}>
                  <AppText style={styles.progressMatchesCompleted}>
                    {completedMatches} of {totalMatches} matches completed
                  </AppText>
                  <AppText style={styles.progressPctValue}>{progressPct}%</AppText>
                </View>

                <View style={styles.largeProgressBarTrack}>
                  <View
                    style={[
                      styles.largeProgressBarFill,
                      { width: `${Math.max(4, progressPct)}%` },
                    ]}
                  />
                </View>
              </View>
            )}

            {/* Standings Table Card */}
            <View style={styles.standingsCard}>
              <View style={styles.standingsHeaderRow}>
                <Trophy size={18} color="#065F46" />
                <AppText style={styles.standingsCardTitle}>Standings</AppText>
              </View>

              {isLoadingStandings ? (
                <View style={styles.tabLoading}>
                  <ActivityIndicator size="small" color={Colors.brand.primary} />
                  <AppText style={styles.tabLoadingText}>Loading standings...</AppText>
                </View>
              ) : standings.length === 0 ? (
                <View style={styles.tabEmpty}>
                  <AppText style={styles.tabEmptyText}>
                    Standings will be computed once week matches begin.
                  </AppText>
                </View>
              ) : (
                <View style={styles.tableContainer}>
                  {/* Table Header */}
                  <View style={styles.tableHeaderRow}>
                    <AppText style={styles.colRankHeader}>#</AppText>
                    <AppText style={styles.colTeamHeader}>Team</AppText>
                    <AppText style={styles.colStatHeader}>MP</AppText>
                    <AppText style={styles.colStatHeader}>W</AppText>
                    <AppText style={styles.colStatHeader}>L</AppText>
                    <AppText style={styles.colDiffHeader}>Diff</AppText>
                    <AppText style={styles.colPtsHeader}>Pts</AppText>
                  </View>

                  {/* Table Rows */}
                  {standings.map((row) => {
                    const isRank1 = row.rank === 1;
                    const isRank2 = row.rank === 2;
                    const isRank3 = row.rank === 3;
                    const isPlayoffSpot = row.rank <= (league.playoff_team_count || 4);

                    const diffNum = row.points_differential ?? 0;
                    const diffStr = diffNum > 0 ? `+${diffNum}` : `${diffNum}`;
                    const diffColor =
                      diffNum > 0 ? '#16A34A' : diffNum < 0 ? '#DC2626' : '#64748B';

                    // Points: calculate 2 * wins or default
                    const pts = (row as any).points ?? (row.wins * 2);

                    const memberNames =
                      row.members && row.members.length > 0
                        ? row.members.join(' & ')
                        : null;

                    return (
                      <View
                        key={row.team_id}
                        style={[
                          styles.tableRow,
                          row.team_name === myTeamName && styles.myTeamTableRow,
                        ]}
                      >
                        {/* Rank Badge */}
                        <View style={styles.colRank}>
                          <View
                            style={[
                              styles.rankCircle,
                              isRank1 && styles.rankCircle1,
                              isRank2 && styles.rankCircle2,
                              isRank3 && styles.rankCircle3,
                            ]}
                          >
                            <AppText
                              style={[
                                styles.rankCircleText,
                                isRank1 && styles.rankCircleText1,
                                isRank2 && styles.rankCircleText2,
                                isRank3 && styles.rankCircleText3,
                              ]}
                            >
                              {row.rank}
                            </AppText>
                          </View>
                        </View>

                        {/* Team & Players */}
                        <View style={styles.colTeam}>
                          <AppText style={styles.teamNameText} numberOfLines={1}>
                            {row.team_name}
                            {row.team_name === myTeamName ? ' ★' : ''}
                          </AppText>
                          {memberNames && (
                            <AppText style={styles.teamMembersText} numberOfLines={1}>
                              {memberNames}
                            </AppText>
                          )}
                        </View>

                        {/* Stats */}
                        <AppText style={styles.colStat}>{row.matches_played ?? 0}</AppText>
                        <AppText style={styles.colStatBold}>{row.wins ?? 0}</AppText>
                        <AppText style={styles.colStat}>{row.losses ?? 0}</AppText>
                        <AppText style={[styles.colDiff, { color: diffColor }]}>
                          {diffStr}
                        </AppText>
                        <AppText style={styles.colPts}>{pts}</AppText>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        )}

        {/* ─── TAB 2: SCHEDULE ──────────────────────────────────────── */}
        {activeTab === 'schedule' && (
          <View style={styles.tabContent}>
            {/* Week Filter Chips */}
            {weeks && weeks.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.weeksScroll}
              >
                {weeks.map((w) => {
                  const isSelected =
                    (selectedWeekId === w.id) ||
                    (!selectedWeekId && w.week_number === activeWeekNumber);
                  return (
                    <TouchableOpacity
                      key={w.id}
                      style={[styles.weekFilterPill, isSelected && styles.weekFilterPillActive]}
                      onPress={() => setSelectedWeekId(w.id)}
                      activeOpacity={0.8}
                    >
                      <AppText
                        style={[
                          styles.weekFilterText,
                          isSelected && styles.weekFilterTextActive,
                        ]}
                      >
                        Week {w.week_number}
                        {w.week_type === 'playoffs' ? ' (Playoffs)' : ''}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Matches List */}
            {isLoadingMatches ? (
              <View style={styles.tabLoading}>
                <ActivityIndicator size="small" color={Colors.brand.primary} />
                <AppText style={styles.tabLoadingText}>Loading fixtures...</AppText>
              </View>
            ) : !matches || matches.length === 0 ? (
              <View style={styles.tabEmpty}>
                <Calendar size={32} color="#94A3B8" />
                <AppText style={styles.tabEmptyTitle}>No Fixtures Available</AppText>
                <AppText style={styles.tabEmptyText}>
                  Matches for this week will appear once the club publishes the schedule.
                </AppText>
              </View>
            ) : (
              <View style={styles.matchesList}>
                {matches.map((m: LeagueMatch) => {
                  const isMatchCompleted = m.status === 'completed';
                  const isBye = m.is_bye;
                  const teamAName = m.team_a?.name || m.team_a_name || 'TBD';
                  const teamBName = m.team_b?.name || m.team_b_name || 'TBD';

                  return (
                    <View key={m.id} style={styles.matchCard}>
                      <View style={styles.matchCardHeader}>
                        <AppText style={styles.matchCourtText}>
                          {m.court_name ? m.court_name : `Court ${m.court_number || 1}`}
                        </AppText>
                        <View
                          style={[
                            styles.matchStatusBadge,
                            isMatchCompleted
                              ? styles.matchStatusCompleted
                              : styles.matchStatusPending,
                          ]}
                        >
                          <AppText
                            style={[
                              styles.matchStatusText,
                              isMatchCompleted
                                ? styles.matchStatusTextCompleted
                                : styles.matchStatusTextPending,
                            ]}
                          >
                            {isBye
                              ? 'BYE'
                              : isMatchCompleted
                              ? 'COMPLETED'
                              : m.status.toUpperCase()}
                          </AppText>
                        </View>
                      </View>

                      {/* Teams & Scores */}
                      <View style={styles.matchBody}>
                        <View style={styles.teamScoreRow}>
                          <View style={styles.teamNameContainer}>
                            <AppText
                              style={[
                                styles.matchTeamName,
                                m.winner_team_id === m.team_a_id && styles.matchTeamWinner,
                              ]}
                              numberOfLines={1}
                            >
                              {teamAName}
                            </AppText>
                            {m.team_a_members && m.team_a_members.length > 0 && (
                              <AppText style={styles.matchTeamMembers} numberOfLines={1}>
                                {m.team_a_members.join(' & ')}
                              </AppText>
                            )}
                          </View>
                          {isMatchCompleted && (
                            <AppText
                              style={[
                                styles.matchScore,
                                m.winner_team_id === m.team_a_id && styles.matchScoreWinner,
                              ]}
                            >
                              {m.score_a ?? 0}
                            </AppText>
                          )}
                        </View>

                        <View style={styles.matchDivider} />

                        <View style={styles.teamScoreRow}>
                          <View style={styles.teamNameContainer}>
                            <AppText
                              style={[
                                styles.matchTeamName,
                                m.winner_team_id === m.team_b_id && styles.matchTeamWinner,
                              ]}
                              numberOfLines={1}
                            >
                              {teamBName}
                            </AppText>
                            {m.team_b_members && m.team_b_members.length > 0 && (
                              <AppText style={styles.matchTeamMembers} numberOfLines={1}>
                                {m.team_b_members.join(' & ')}
                              </AppText>
                            )}
                          </View>
                          {isMatchCompleted && (
                            <AppText
                              style={[
                                styles.matchScore,
                                m.winner_team_id === m.team_b_id && styles.matchScoreWinner,
                              ]}
                            >
                              {m.score_b ?? 0}
                            </AppText>
                          )}
                        </View>
                      </View>

                      {/* Scheduled Time */}
                      {m.scheduled_start_at && (
                        <View style={styles.matchFooter}>
                          <Clock size={12} color="#64748B" />
                          <AppText style={styles.matchFooterText}>
                            {formatDate(m.scheduled_start_at)}
                          </AppText>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ─── TAB 3: PLAYOFFS ──────────────────────────────────────── */}
        {activeTab === 'playoffs' && (
          <View style={styles.tabContent}>
            <View style={styles.playoffsCard}>
              <View style={styles.playoffsHeader}>
                <Trophy size={20} color="#D97706" />
                <View>
                  <AppText style={styles.playoffsTitle}>Championship Playoffs</AppText>
                  <AppText style={styles.playoffsSub}>
                    Top {league.playoff_team_count || 4} teams qualify for the championship bracket
                  </AppText>
                </View>
              </View>

              {playoffs?.champion_team_name ? (
                <View style={styles.championBox}>
                  <Award size={28} color="#D97706" />
                  <AppText style={styles.championLabel}>Crowned Champions</AppText>
                  <AppText style={styles.championName}>
                    {playoffs.champion_team_name}
                  </AppText>
                </View>
              ) : null}

              {/* Qualifiers based on current standings */}
              <View style={styles.qualifiersSection}>
                <AppText style={styles.qualifiersSectionTitle}>
                  Current Qualifying Seeds
                </AppText>
                {standings.slice(0, league.playoff_team_count || 4).map((row, idx) => (
                  <View key={row.team_id} style={styles.qualifierRow}>
                    <View style={styles.seedBadge}>
                      <AppText style={styles.seedBadgeText}>Seed #{idx + 1}</AppText>
                    </View>
                    <View style={styles.qualifierInfo}>
                      <AppText style={styles.qualifierTeamName}>{row.team_name}</AppText>
                      <AppText style={styles.qualifierRecord}>
                        {row.wins}W - {row.losses}L • {row.points_differential > 0 ? `+${row.points_differential}` : row.points_differential} diff
                      </AppText>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* ─── TAB 4: RESULTS ───────────────────────────────────────── */}
        {activeTab === 'results' && (
          <View style={styles.tabContent}>
            <View style={styles.resultsCard}>
              {isCompleted ? (
                <>
                  <View style={styles.completedHeader}>
                    <Trophy size={32} color="#D97706" />
                    <AppText style={styles.completedTitle}>Official Final Results</AppText>
                    <AppText style={styles.completedSubtitle}>
                      Season concluded on {formatDate(league.end_date || league.updated_at)}
                    </AppText>
                  </View>

                  {playoffs?.champion_team_name && (
                    <View style={styles.championBanner}>
                      <AppText style={styles.championBannerLabel}>CHAMPION</AppText>
                      <AppText style={styles.championBannerTeam}>
                        {playoffs.champion_team_name}
                      </AppText>
                    </View>
                  )}

                  <View style={styles.finalStandingsList}>
                    <AppText style={styles.finalStandingsTitle}>Final Rankings</AppText>
                    {standings.map((row) => (
                      <View key={row.team_id} style={styles.finalRow}>
                        <AppText style={styles.finalRank}>#{row.rank}</AppText>
                        <AppText style={styles.finalTeam}>{row.team_name}</AppText>
                        <AppText style={styles.finalRecord}>
                          {row.wins}W - {row.losses}L ({row.wins * 2} Pts)
                        </AppText>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <View style={styles.inProgressResults}>
                  <Clock size={32} color="#0D9488" />
                  <AppText style={styles.inProgressResultsTitle}>
                    League is In Progress
                  </AppText>
                  <AppText style={styles.inProgressResultsText}>
                    Final official results and championship placement will be recorded once regular season fixtures and championship playoffs are completed.
                  </AppText>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* ─── Modals ─────────────────────────────────────────────────── */}
      <LeagueRegistrationModal
        visible={isRegisterModalOpen}
        league={league}
        onClose={() => setIsRegisterModalOpen(false)}
        onSuccess={() => {
          setIsRegisterModalOpen(false);
          void handleRefresh();
        }}
      />

      <LeagueRegistrationDetailsModal
        visible={isDetailsModalOpen}
        league={league}
        onClose={() => setIsDetailsModalOpen(false)}
        onCancelled={() => {
          setIsDetailsModalOpen(false);
          void handleRefresh();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F3F8F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: '#F3F8F5',
  },
  circleButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    paddingHorizontal: Spacing.sm,
    letterSpacing: -0.2,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 110, // Prevent overlap with fixed player bottom nav
  },
  topStatusSection: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: Spacing.md,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    gap: 5,
    marginBottom: 6,
  },
  statusBadgeLive: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeOpen: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeClosed: {
    backgroundColor: '#F1F5F9',
  },
  statusBadgeCompleted: {
    backgroundColor: '#F1F5F9',
  },
  statusBadgeUpcoming: {
    backgroundColor: '#E0F2FE',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  metadataSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '500',
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.md,
  },
  infoCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E6ECE8',
    ...Shadows.sm,
  },
  infoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  infoCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  infoCardSub: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 14,
  },
  registeredCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  registeredLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  checkCircleWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  registeredTextCol: {
    flex: 1,
  },
  registeredTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#065F46',
  },
  registeredTeam: {
    fontSize: 12,
    color: '#047857',
    marginTop: 1,
  },
  viewTeamButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  viewTeamButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  openRegCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6ECE8',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  openRegInfo: {
    marginBottom: Spacing.sm,
  },
  openRegTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  openRegSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  registerActionButton: {
    backgroundColor: '#065F46',
    borderRadius: Radius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  registerActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closedRegCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  closedRegText: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '500',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#E6ECE8',
    borderRadius: Radius.lg,
    padding: 3,
    marginBottom: Spacing.md,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: Radius.md,
  },
  tabItemActive: {
    backgroundColor: '#065F46',
  },
  tabLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  tabLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  tabContent: {
    gap: Spacing.md,
  },
  progressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#E6ECE8',
    ...Shadows.sm,
  },
  progressCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  weekPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  weekPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  progressDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressMatchesCompleted: {
    fontSize: 12,
    color: '#64748B',
  },
  progressPctValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0D9488',
  },
  largeProgressBarTrack: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  largeProgressBarFill: {
    height: '100%',
    backgroundColor: '#0D9488',
    borderRadius: 3,
  },
  standingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#E6ECE8',
    ...Shadows.sm,
  },
  standingsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  standingsCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  tableContainer: {
    marginTop: 4,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 6,
    marginBottom: 4,
  },
  colRankHeader: {
    width: 26,
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  colTeamHeader: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    paddingLeft: 4,
  },
  colStatHeader: {
    width: 26,
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'right',
  },
  colDiffHeader: {
    width: 32,
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'right',
  },
  colPtsHeader: {
    width: 28,
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'right',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  myTeamTableRow: {
    backgroundColor: '#F0FDF4',
    borderRadius: Radius.md,
    paddingHorizontal: 2,
  },
  colRank: {
    width: 26,
    alignItems: 'center',
  },
  rankCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankCircle1: {
    backgroundColor: '#FEF08A',
  },
  rankCircle2: {
    backgroundColor: '#E2E8F0',
  },
  rankCircle3: {
    backgroundColor: '#FED7AA',
  },
  rankCircleText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#475569',
  },
  rankCircleText1: {
    color: '#713F12',
  },
  rankCircleText2: {
    color: '#334155',
  },
  rankCircleText3: {
    color: '#7C2D12',
  },
  colTeam: {
    flex: 1,
    paddingLeft: 6,
    paddingRight: 4,
  },
  teamNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  teamMembersText: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  colStat: {
    width: 26,
    fontSize: 12,
    color: '#475569',
    textAlign: 'right',
  },
  colStatBold: {
    width: 26,
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'right',
  },
  colDiff: {
    width: 32,
    fontSize: 11.5,
    fontWeight: '700',
    textAlign: 'right',
  },
  colPts: {
    width: 28,
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
  },
  weeksScroll: {
    gap: 8,
    paddingBottom: Spacing.xs,
  },
  weekFilterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  weekFilterPillActive: {
    backgroundColor: '#065F46',
    borderColor: '#065F46',
  },
  weekFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  weekFilterTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  matchesList: {
    gap: Spacing.sm,
  },
  matchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#E6ECE8',
    ...Shadows.sm,
  },
  matchCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  matchCourtText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  matchStatusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  matchStatusCompleted: {
    backgroundColor: '#DCFCE7',
  },
  matchStatusPending: {
    backgroundColor: '#F1F5F9',
  },
  matchStatusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  matchStatusTextCompleted: {
    color: '#15803D',
  },
  matchStatusTextPending: {
    color: '#64748B',
  },
  matchBody: {
    gap: 6,
  },
  teamScoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamNameContainer: {
    flex: 1,
  },
  matchTeamName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  matchTeamWinner: {
    color: '#065F46',
  },
  matchTeamMembers: {
    fontSize: 10.5,
    color: '#64748B',
  },
  matchScore: {
    fontSize: 15,
    fontWeight: '700',
    color: '#64748B',
    marginLeft: 8,
  },
  matchScoreWinner: {
    color: '#065F46',
    fontWeight: '800',
  },
  matchDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  matchFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  matchFooterText: {
    fontSize: 11,
    color: '#64748B',
  },
  playoffsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#E6ECE8',
    ...Shadows.sm,
  },
  playoffsHeader: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  playoffsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  playoffsSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  championBox: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  championLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  championName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#78350F',
    marginTop: 2,
  },
  qualifiersSection: {
    gap: Spacing.xs,
  },
  qualifiersSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  qualifierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  seedBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  seedBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  qualifierInfo: {
    flex: 1,
  },
  qualifierTeamName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  qualifierRecord: {
    fontSize: 11,
    color: '#64748B',
  },
  resultsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#E6ECE8',
    ...Shadows.sm,
  },
  completedHeader: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  completedTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 6,
  },
  completedSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  championBanner: {
    backgroundColor: '#065F46',
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  championBannerLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#A7F3D0',
    letterSpacing: 0.5,
  },
  championBannerTeam: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  finalStandingsList: {
    gap: 6,
  },
  finalStandingsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  finalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  finalRank: {
    width: 28,
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  finalTeam: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  finalRecord: {
    fontSize: 12,
    color: '#64748B',
  },
  inProgressResults: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    gap: 6,
  },
  inProgressResultsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 4,
  },
  inProgressResultsText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: Spacing.md,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F8F5',
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: 14,
    color: Colors.text.secondary,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    backgroundColor: '#F3F8F5',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#DC2626',
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  backActionButton: {
    backgroundColor: Colors.brand.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  backActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tabLoading: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    gap: 6,
  },
  tabLoadingText: {
    fontSize: 12,
    color: '#64748B',
  },
  tabEmpty: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    gap: 6,
  },
  tabEmptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  tabEmptyText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
});
