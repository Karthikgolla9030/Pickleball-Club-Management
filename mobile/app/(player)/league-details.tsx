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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  PlayerLeagueOverviewTab,
  PlayerLeagueTeamsTab,
} from '@/components/league';
import { getLeagueStatusBadgeDetails } from '@/components/competition/LeagueOptionsMenuModal';
import {
  useAuth,
  usePlayerLeagueDetails,
  usePlayerLeagueMatches,
  usePlayerLeaguePlayoffs,
  usePlayerLeagueRegistrationStatus,
  usePlayerLeagueStandings,
  usePlayerLeagueTeams,
  usePlayerLeagueWeeks,
} from '@/hooks';
import { Colors, Radius, Shadows, Spacing } from '@/theme';
import type { LeagueMatch, LeagueSummary, LeagueWeek } from '@/types';
import { formatDate } from '@/utils/formatters';
import { getCourtDisplayLabel } from '@/utils';

type TabKey = 'overview' | 'players' | 'teams' | 'schedule' | 'standings' | 'playoffs' | 'results';

export default function PlayerLeagueDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const leagueId = id ?? null;

  const { user } = useAuth();
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
    data: teamsData,
    isLoading: isLoadingTeams,
    refetch: refetchTeams,
  } = usePlayerLeagueTeams(leagueId);

  const {
    data: standingsData,
    isLoading: isLoadingStandings,
    refetch: refetchStandings,
  } = usePlayerLeagueStandings(leagueId);

  const {
    data: weeks,
    refetch: refetchWeeks,
  } = usePlayerLeagueWeeks(leagueId);

  // All matches for Results tab (completed matches across the entire league)
  const {
    data: allMatches,
    isLoading: isLoadingAllMatches,
    refetch: refetchAllMatches,
  } = usePlayerLeagueMatches(leagueId);

  // Matches for Schedule tab (filtered by selected week)
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
      refetchTeams(),
      refetchStandings(),
      refetchWeeks(),
      refetchAllMatches(),
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
  const isSingles =
    (league?.team_size ?? 2) === 1 ||
    (league?.category?.toLowerCase().includes('singles') ?? false);
  const formatLabel = isSingles ? 'Singles' : (league?.category || 'Doubles');

  const hasPlayoffs = (league?.playoff_team_count ?? 0) > 0;
  const playersOrTeamsTabKey: TabKey = isSingles ? 'players' : 'teams';
  const playersOrTeamsTabLabel = isSingles ? 'Players' : 'Teams';

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

  // Completed matches across the league
  const completedMatchesList = useMemo(() => {
    return (allMatches || []).filter((m: LeagueMatch) => m.status === 'completed');
  }, [allMatches]);

  // Tab definitions in required order:
  // 1. Overview & Rules
  // 2. Players / Teams (dynamic)
  // 3. Schedule
  // 4. Standings
  // 5. Playoffs (only if playoffs configured)
  // 6. Results
  const detailTabs = useMemo(() => {
    const participantCount =
      teamsData && teamsData.length > 0
        ? teamsData.length
        : standings.length > 0
        ? standings.length
        : undefined;

    const list: { key: TabKey; label: string; count?: number }[] = [
      { key: 'overview', label: 'Overview & Rules' },
      {
        key: playersOrTeamsTabKey,
        label: playersOrTeamsTabLabel,
        count: participantCount,
      },
      { key: 'schedule', label: 'Schedule' },
      { key: 'standings', label: 'Standings' },
    ];

    if (hasPlayoffs) {
      list.push({ key: 'playoffs', label: 'Playoffs' });
    }

    list.push({ key: 'results', label: 'Results' });
    return list;
  }, [playersOrTeamsTabKey, playersOrTeamsTabLabel, teamsData, standings, hasPlayoffs]);

  const initialTabKey = useMemo<TabKey>(() => {
    if (tab) {
      if (tab === 'players' || tab === 'teams') return playersOrTeamsTabKey;
      if (
        tab === 'overview' ||
        tab === 'schedule' ||
        tab === 'standings' ||
        tab === 'results'
      ) {
        return tab as TabKey;
      }
      if (tab === 'playoffs' && hasPlayoffs) return 'playoffs';
    }
    return 'overview';
  }, [tab, playersOrTeamsTabKey, hasPlayoffs]);

  const [activeTab, setActiveTab] = useState<TabKey>(initialTabKey);

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

  // Participant counts & registration statistics (matches Club Owner layout)
  const participantCount =
    teamsData && teamsData.length > 0
      ? teamsData.length
      : standings.length > 0
      ? standings.length
      : league?.teams_count ?? (league?.current_teams_count ?? 0);
  const maxTeamsCount = league?.max_teams || 8;
  const regPercent =
    maxTeamsCount > 0
      ? Math.min(100, Math.round((participantCount / maxTeamsCount) * 100))
      : 0;

  const statusBadge = getLeagueStatusBadgeDetails(league?.status);
  const subtitleText = `${totalWeeks} Wks | ${league?.max_teams || 8} ${isSingles ? 'Players' : 'Teams'} | ${isSingles ? 'Singles' : (league?.category || 'Doubles')} | ${hasPlayoffs ? `Top ${league?.playoff_team_count || 4} Playoffs` : 'Regular Season'}`;

  const regCloseDateStr = league?.registration_close_at
    ? formatDate(league.registration_close_at)
    : (league?.start_date ? formatDate(league.start_date) : 'TBA');

  let daysLeftText = '';
  if (league?.status === 'registration_closed' || league?.registration_status === 'closed') {
    daysLeftText = 'Registration closed';
  } else if (league?.status === 'cancelled') {
    daysLeftText = 'Registration cancelled';
  } else if (league?.status === 'completed') {
    daysLeftText = 'League completed';
  } else if (league?.registration_close_at) {
    const diffTime = new Date(league.registration_close_at).getTime() - Date.now();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > 0) {
      daysLeftText = `${diffDays} days left`;
    } else if (diffDays === 0) {
      daysLeftText = 'Closes today';
    } else {
      daysLeftText = 'Registration closed';
    }
  } else if (isOpenReg) {
    daysLeftText = 'Registration open';
  }

  if (isLoadingLeague && !isRefreshing) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#176B57" />
        <AppText style={styles.loadingText}>Loading league details...</AppText>
      </View>
    );
  }

  if (leagueError || !league) {
    return (
      <View style={[styles.errorContainer, { paddingTop: insets.top }]}>
        <AppText style={styles.errorTitle}>League Not Found</AppText>
        <AppText style={styles.errorMessage}>
          {leagueError?.message || 'Unable to retrieve details for this league.'}
        </AppText>
        <TouchableOpacity style={styles.backActionButton} onPress={handleBack}>
          <AppText style={styles.backActionText}>Return to Leagues</AppText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.mainScrollView}
        contentContainerStyle={styles.mainScrollContent}
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#176B57"
            colors={['#176B57']}
          />
        }
      >
        {/* ─── INDEX 0: NATURAL-SCROLLING HEADER & CARDS ─── */}
        <View style={styles.scrollHeaderWrapper}>
          <View style={styles.headerTopSection}>
            <View style={styles.headerTopRow}>
              {/* Back button */}
              <TouchableOpacity
                style={styles.backButton}
                onPress={handleBack}
                accessibilityLabel="Go back"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <ArrowLeft size={22} color="#111827" strokeWidth={2.4} />
              </TouchableOpacity>

              {/* Centered League Title */}
              <View style={styles.headerTitleWrap}>
                <AppText style={styles.headerLeagueName} numberOfLines={1}>
                  {league.name}
                </AppText>
              </View>

              {/* 3-Dot Overflow Menu */}
              <TouchableOpacity
                style={styles.headerMenuButton}
                onPress={handleOptionsPress}
                accessibilityLabel="League options"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <MoreVertical size={22} color="#1F2937" strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {/* Status Pill below title */}
            <View style={styles.headerStatusWrap}>
              <View
                style={[
                  styles.statusPill,
                  { backgroundColor: statusBadge.bg },
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: statusBadge.text },
                  ]}
                />
                <AppText
                  style={[
                    styles.statusPillText,
                    { color: statusBadge.text },
                  ]}
                >
                  {statusBadge.label}
                </AppText>
              </View>
            </View>

            {/* Subtitle / Metadata row */}
            <AppText style={styles.headerSubtitleText} numberOfLines={1}>
              {subtitleText}
            </AppText>
          </View>

          {/* 2-COLUMN REGISTRATION SUMMARY CARD */}
          <View style={styles.headerCardsSection}>
            <View style={styles.regStatsCard}>
              {/* Left Col: Teams/Players Registered */}
              <View style={styles.regStatCol}>
                <AppText style={styles.regStatLabel}>
                  {isSingles ? 'Players Registered' : 'Teams Registered'}
                </AppText>
                <View style={styles.regStatValueRow}>
                  <AppText style={styles.regStatValue}>
                    {participantCount} / {league.max_teams || 8}
                  </AppText>
                  <AppText style={styles.regStatPercent}>{regPercent}%</AppText>
                </View>
                {/* Progress Bar */}
                <View style={styles.regProgressBarTrack}>
                  <View
                    style={[
                      styles.regProgressBarFill,
                      { width: `${regPercent}%` },
                    ]}
                  />
                </View>
              </View>

              {/* Vertical Divider */}
              <View style={styles.regStatDivider} />

              {/* Right Col: Registration Closes */}
              <View style={styles.regStatCol}>
                <AppText style={styles.regStatLabel}>
                  {league.status === 'registration_closed' || league.registration_status === 'closed'
                    ? 'Registration Closed'
                    : 'Registration Closes'}
                </AppText>
                <AppText style={styles.regStatValueText}>{regCloseDateStr}</AppText>
                {daysLeftText ? (
                  <AppText
                    style={[
                      styles.regStatDaysLeft,
                      (league.status === 'registration_closed' ||
                        league.registration_status === 'closed' ||
                        league.status === 'cancelled' ||
                        league.status === 'completed') &&
                        styles.regStatClosedText,
                    ]}
                  >
                    {daysLeftText}
                  </AppText>
                ) : null}
              </View>
            </View>

            {/* COMPACT PLAYER ACTION (Register / View Entry Details) */}
            {isRegistered ? (
              <View style={styles.actionSectionRow}>
                <TouchableOpacity
                  style={styles.actionBtnOutline}
                  onPress={() => setIsDetailsModalOpen(true)}
                  activeOpacity={0.8}
                >
                  <AppText style={styles.actionBtnOutlineText}>
                    {isSingles ? 'View Entry Details' : 'View Team Details'}
                  </AppText>
                </TouchableOpacity>
              </View>
            ) : isOpenReg ? (
              <View style={styles.actionSectionRow}>
                <TouchableOpacity
                  style={styles.actionBtnPrimary}
                  onPress={() => setIsRegisterModalOpen(true)}
                  activeOpacity={0.85}
                >
                  <AppText style={styles.actionBtnPrimaryText}>Register for this League</AppText>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>

        {/* ─── INDEX 1: STICKY NAVIGATION TABS STRIP ─── */}
        <View style={styles.stickyTabsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsStripScroll}
          >
            {detailTabs.map((t) => {
              const isActive =
                activeTab === t.key ||
                ((t.key === 'players' || t.key === 'teams') &&
                  (activeTab === 'players' || activeTab === 'teams'));
              const displayLabel =
                typeof t.count === 'number' && t.count >= 0
                  ? `${t.label} (${t.count})`
                  : t.label;

              return (
                <TouchableOpacity
                  key={t.key}
                  style={styles.tabButton}
                  onPress={() => setActiveTab(t.key)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <AppText
                    style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}
                  >
                    {displayLabel}
                  </AppText>
                  {isActive && <View style={styles.activeTabIndicator} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ─── INDEX 2: TAB BODY CONTENT ─── */}
        <View style={styles.tabBodyWrapper}>
        {/* ─── TAB 1: OVERVIEW & RULES ─── */}
        {activeTab === 'overview' && (
          <View style={styles.tabPane}>
            <PlayerLeagueOverviewTab league={league} />
          </View>
        )}

        {/* ─── TAB 2: PLAYERS / TEAMS ─── */}
        {(activeTab === 'players' || activeTab === 'teams') && (
          <View style={styles.tabPane}>
            <PlayerLeagueTeamsTab
              league={league}
              teams={teamsData}
              standings={standings}
              isLoading={isLoadingTeams}
            />
          </View>
        )}

        {/* ─── TAB 3: SCHEDULE ─── */}
        {activeTab === 'schedule' && (
          <View style={styles.tabPane}>
            {/* Week Filter Chips */}
            {weeks && weeks.length > 0 && (
              <View style={styles.weekSelectorContainer}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.weekSelectorScroll}
                >
                  {weeks.map((w) => {
                    const isSelected =
                      selectedWeekId === w.id ||
                      (!selectedWeekId && w.week_number === activeWeekNumber);
                    return (
                      <TouchableOpacity
                        key={w.id}
                        style={[
                          styles.weekPill,
                          isSelected ? styles.weekPillSelected : styles.weekPillUnselected,
                        ]}
                        onPress={() => setSelectedWeekId(w.id)}
                        activeOpacity={0.8}
                      >
                        <AppText
                          style={[
                            styles.weekPillText,
                            isSelected
                              ? styles.weekPillTextSelected
                              : styles.weekPillTextUnselected,
                          ]}
                        >
                          Week {w.week_number}
                          {w.week_type === 'playoffs' ? ' (Playoffs)' : ''}
                        </AppText>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Matches List */}
            {isLoadingMatches ? (
              <View style={styles.tabLoading}>
                <ActivityIndicator size="small" color="#176B57" />
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
                          {getCourtDisplayLabel(m, { unassignedLabel: 'Court TBD' })}
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
                            {!isSingles && m.team_a_members && m.team_a_members.length > 0 && (
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
                            {!isSingles && m.team_b_members && m.team_b_members.length > 0 && (
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

        {/* ─── TAB 4: STANDINGS ─── */}
        {activeTab === 'standings' && (
          <View style={styles.tabPane}>
            {/* League Progress Card (for live/in progress leagues) */}
            {isLive && (
              <View style={styles.progressCard}>
                <View style={styles.progressCardHeader}>
                  <View style={styles.progressTitleRow}>
                    <BarChart2 size={18} color="#176B57" />
                    <AppText style={styles.progressCardTitle}>League Progress</AppText>
                  </View>
                  <View style={styles.progressWeekPill}>
                    <AppText style={styles.progressWeekPillText}>
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
                <Trophy size={18} color="#176B57" />
                <AppText style={styles.standingsCardTitle}>Standings</AppText>
              </View>

              {isLoadingStandings ? (
                <View style={styles.tabLoading}>
                  <ActivityIndicator size="small" color="#176B57" />
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
                    <AppText style={styles.colTeamHeader}>
                      {isSingles ? 'Player' : 'Team'}
                    </AppText>
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

                    const diffNum = row.points_differential ?? 0;
                    const diffStr = diffNum > 0 ? `+${diffNum}` : `${diffNum}`;
                    const diffColor =
                      diffNum > 0 ? '#16A34A' : diffNum < 0 ? '#DC2626' : '#64748B';

                    const pts = (row as any).points ?? row.wins * 2;

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
                          {!isSingles && memberNames && memberNames !== row.team_name && (
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

        {/* ─── TAB 5: PLAYOFFS ─── */}
        {activeTab === 'playoffs' && hasPlayoffs && (
          <View style={styles.tabPane}>
            <View style={styles.playoffsCard}>
              <View style={styles.playoffsHeader}>
                <Trophy size={20} color="#D97706" />
                <View>
                  <AppText style={styles.playoffsTitle}>Championship Playoffs</AppText>
                  <AppText style={styles.playoffsSub}>
                    Top {league.playoff_team_count || 4} qualify for the championship bracket
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

        {/* ─── TAB 6: RESULTS ─── */}
        {activeTab === 'results' && (
          <View style={styles.tabPane}>
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
                  <Clock size={32} color="#176B57" />
                  <AppText style={styles.inProgressResultsTitle}>
                    League is In Progress
                  </AppText>
                  <AppText style={styles.inProgressResultsText}>
                    Final official results and championship placement will be recorded once regular season fixtures and championship playoffs are completed.
                  </AppText>
                </View>
              )}
            </View>

            {/* Completed Match Results List */}
            <View style={styles.resultsMatchesCard}>
              <View style={styles.standingsHeaderRow}>
                <Award size={18} color="#176B57" />
                <AppText style={styles.standingsCardTitle}>
                  Completed Matches ({completedMatchesList.length})
                </AppText>
              </View>

              {isLoadingAllMatches ? (
                <View style={styles.tabLoading}>
                  <ActivityIndicator size="small" color="#176B57" />
                  <AppText style={styles.tabLoadingText}>Loading completed fixtures...</AppText>
                </View>
              ) : completedMatchesList.length === 0 ? (
                <View style={styles.tabEmpty}>
                  <AppText style={styles.tabEmptyText}>
                    No completed matches yet. Results will appear here as scores are recorded.
                  </AppText>
                </View>
              ) : (
                <View style={styles.matchesList}>
                  {completedMatchesList.map((m: LeagueMatch) => {
                    const teamAName = m.team_a?.name || m.team_a_name || 'TBD';
                    const teamBName = m.team_b?.name || m.team_b_name || 'TBD';

                    return (
                      <View key={m.id} style={styles.matchCard}>
                        <View style={styles.matchCardHeader}>
                          <AppText style={styles.matchCourtText}>
                            {m.week_number ? `Week ${m.week_number} • ` : ''}
                            {getCourtDisplayLabel(m, { unassignedLabel: 'Court TBD' })}
                          </AppText>
                          <View style={[styles.matchStatusBadge, styles.matchStatusCompleted]}>
                            <AppText style={[styles.matchStatusText, styles.matchStatusTextCompleted]}>
                              COMPLETED
                            </AppText>
                          </View>
                        </View>

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
                              {!isSingles && m.team_a_members && m.team_a_members.length > 0 && (
                                <AppText style={styles.matchTeamMembers} numberOfLines={1}>
                                  {m.team_a_members.join(' & ')}
                                </AppText>
                              )}
                            </View>
                            <AppText
                              style={[
                                styles.matchScore,
                                m.winner_team_id === m.team_a_id && styles.matchScoreWinner,
                              ]}
                            >
                              {m.score_a ?? 0}
                            </AppText>
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
                              {!isSingles && m.team_b_members && m.team_b_members.length > 0 && (
                                <AppText style={styles.matchTeamMembers} numberOfLines={1}>
                                  {m.team_b_members.join(' & ')}
                                </AppText>
                              )}
                            </View>
                            <AppText
                              style={[
                                styles.matchScore,
                                m.winner_team_id === m.team_b_id && styles.matchScoreWinner,
                              ]}
                            >
                              {m.score_b ?? 0}
                            </AppText>
                          </View>
                        </View>

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
          </View>
        )}
        </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  mainScrollView: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  mainScrollContent: {
    flexGrow: 1,
  },
  scrollHeaderWrapper: {
    backgroundColor: '#F9FAFB',
  },
  headerTopSection: {
    backgroundColor: '#FFFFFF',
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerCardsSection: {
    backgroundColor: '#F9FAFB',
    paddingTop: 4,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 44,
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerLeagueName: {
    fontSize: 19,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  headerMenuButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  headerStatusWrap: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 6,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  headerSubtitleText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#4B5563',
    textAlign: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },

  // ─── 2-Column Registration Stats Card (Matching Owner Side) ───
  regStatsCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E5ECE8',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 10,
  },
  regStatCol: {
    flex: 1,
    justifyContent: 'center',
  },
  regStatLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 3,
  },
  regStatValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  regStatValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  regStatPercent: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },
  regProgressBarTrack: {
    height: 5,
    backgroundColor: '#E5ECE8',
    borderRadius: 2.5,
    overflow: 'hidden',
    marginTop: 6,
  },
  regProgressBarFill: {
    height: '100%',
    backgroundColor: '#176B57',
    borderRadius: 2.5,
  },
  regStatDivider: {
    width: 1,
    backgroundColor: '#E5ECE8',
    marginHorizontal: 12,
    alignSelf: 'stretch',
  },
  regStatValueText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  regStatDaysLeft: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#DC2626',
    marginTop: 2,
  },
  regStatClosedText: {
    color: '#6B7280',
  },

  // ─── Compact Player Actions ───
  actionSectionRow: {
    marginHorizontal: 16,
    marginBottom: 10,
  },
  actionBtnOutline: {
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  actionBtnOutlineText: {
    color: '#374151',
    fontSize: 13.5,
    fontWeight: '600',
  },
  actionBtnPrimary: {
    height: 38,
    borderRadius: 8,
    backgroundColor: '#176B57',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  actionBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },

  // ─── Sticky Navigation Tabs Strip with Green Underline ───
  stickyTabsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5ECE8',
    backgroundColor: '#FFFFFF',
    zIndex: 10,
    elevation: 4,
  },
  tabsStripScroll: {
    paddingHorizontal: 16,
    gap: 4,
  },
  tabButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4B5563',
  },
  tabButtonTextActive: {
    color: '#176B57',
    fontWeight: '700',
  },
  activeTabIndicator: {
    position: 'absolute',
    bottom: -1,
    left: 8,
    right: 8,
    height: 3,
    backgroundColor: '#176B57',
    borderRadius: 1.5,
  },

  // ─── Tab Body Wrapper ───
  tabBodyWrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 110,
  },
  tabPane: {
    gap: 12,
  },

  // ─── Week Selector Strip (Schedule) ───
  weekSelectorContainer: {
    marginBottom: 8,
  },
  weekSelectorScroll: {
    gap: 8,
    paddingBottom: 4,
  },
  weekPill: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  weekPillSelected: {
    backgroundColor: '#176B57',
    borderColor: '#176B57',
  },
  weekPillUnselected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5ECE8',
  },
  weekPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  weekPillTextSelected: {
    color: '#FFFFFF',
  },
  weekPillTextUnselected: {
    color: '#4B5563',
  },

  // ─── Standings Progress Card ───
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

  // ─── Standings Progress Week Pill ───
  progressWeekPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  progressWeekPillText: {
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
  resultsMatchesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#E6ECE8',
    ...Shadows.sm,
    gap: Spacing.sm,
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
  hostClubBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginBottom: Spacing.md,
  },
  hostClubLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  hostClubIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostClubTextCol: {
    flex: 1,
  },
  hostClubLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.5,
  },
  hostClubName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#064E3B',
  },
  hostClubActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: Spacing.sm,
  },
  hostClubActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
});
