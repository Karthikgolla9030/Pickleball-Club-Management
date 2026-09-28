/**
 * Aught2 Pickleball — Club League Details Screen (Phase 9 & 10)
 *
 * Pixel-accurate implementation matching reference design:
 *   - Header: Back navigation circular button, League Title, Subtitle metadata line,
 *     Status pill (● IN PROGRESS), Overflow action menu (⋮)
 *   - Week Selector: Horizontal row of cards (Week 1, Week 2, Week 3, Week 4)
 *     Selected card in deep dark green (#064E3B, white text). NO DATES inside week cards.
 *   - Navigation Tabs: Strictly text-only (NO icons), exact order:
 *     [Teams, Schedule, Matches, Standings, Playoffs, Results]
 *     Active tab in deep dark green pill (#064E3B, white text).
 *   - Teams Tab: Matches reference design pixel-for-pixel:
 *     Numbered list (#), 2-letter uppercase initials pastel avatar, Team Name,
 *     Avg Skill Level pill, Chevron (>). NO win-loss, points, or standings stats.
 *   - Schedule Tab: Week start/end date manager + Match court & time assignment.
 *   - Matches Tab: Week fixture view + score entry (best of 3/single set, 11-win-by-2).
 *   - Standings Tab: Live cumulative regular season standings + playoff cutoff indicator.
 *   - Playoffs Tab: Single-elimination championship bracket + qualification seeds.
 *   - Results Tab: Crowned champion showcase + league completion workflow.
 */

import React, { useState } from 'react';
import {
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  MapPin,
  MoreVertical,
  Trophy,
  Users,
  X,
} from 'lucide-react-native';

import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  ModalSheet,
  Screen,
} from '@/components';
import {
  useActiveClub,
  useClubCourts,
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
  type LeagueTeam,
  type LeagueWeek,
} from '@/types';
import { formatDate, formatDateTime } from '@/utils/formatters';

type TabKey = 'teams' | 'schedule' | 'matches' | 'standings' | 'playoffs' | 'results';

// Pastel palette for team avatars matching reference design
const PASTEL_PALETTE = [
  { bg: '#FEE2E2', text: '#DC2626' }, // 1. Soft Red/Coral (DD)
  { bg: '#DCFCE7', text: '#15803D' }, // 2. Soft Green (NN)
  { bg: '#DBEAFE', text: '#1D4ED8' }, // 3. Soft Blue (KB)
  { bg: '#FEF3C7', text: '#D97706' }, // 4. Soft Amber (PP)
  { bg: '#F3E8FF', text: '#7E22CE' }, // 5. Soft Purple (BB)
  { bg: '#CCFBF1', text: '#0F766E' }, // 6. Soft Teal (VL)
  { bg: '#FFEDD5', text: '#C2410C' }, // 7. Soft Peach (TC)
  { bg: '#FCE7F3', text: '#BE185D' }, // 8. Soft Rose (CQ)
];

function getTeamInitials(teamName: string): string {
  const clean = teamName.trim();
  if (!clean) return 'TM';
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

function getAvatarColors(index: number) {
  return PASTEL_PALETTE[index % PASTEL_PALETTE.length];
}

export default function ClubLeagueDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const leagueId = id || null;
  const { clubId } = useActiveClub();
  const { canManageTournaments, canManageLeagues } = usePermission();
  const canManageLeague = canManageTournaments || canManageLeagues;

  // Active navigation tab (Exact 6 text tabs)
  const [activeTab, setActiveTab] = useState<TabKey>('teams');
  const [selectedWeekId, setSelectedWeekId] = useState<string | undefined>(undefined);

  // Overflow Actions Modal State
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);

  // Selected Team Details Modal State
  const [selectedTeam, setSelectedTeam] = useState<LeagueTeam | null>(null);

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

  // Week Dates Manager Modal State
  const [isWeekDatesModalOpen, setIsWeekDatesModalOpen] = useState(false);
  const [editingWeekStartDate, setEditingWeekStartDate] = useState('');
  const [editingWeekEndDate, setEditingWeekEndDate] = useState('');
  const [weekDatesError, setWeekDatesError] = useState<string | null>(null);

  // Match Scheduling Modal State
  const [schedulingMatch, setSchedulingMatch] = useState<LeagueMatch | null>(null);
  const [selectedCourtId, setSelectedCourtId] = useState<string>('');
  const [scheduleDate, setScheduleDate] = useState<string>('');
  const [scheduleTime, setScheduleTime] = useState<string>('18:00');
  const [scheduleDuration, setScheduleDuration] = useState<number>(60);
  const [schedulingError, setSchedulingError] = useState<string | null>(null);

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
    updateWeek,
    isUpdatingWeek,
  } = useLeagueWeeks(clubId, leagueId);

  const {
    data: matches,
    isLoading: isMatchesLoading,
    refetch: refetchMatches,
    recordScore,
    isRecordingScore,
    correctScore,
    isCorrectingScore,
    scheduleMatch,
    isSchedulingMatch,
    unscheduleMatch,
    isUnschedulingMatch,
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
  const { data: clubCourts } = useClubCourts(clubId);

  // Active week resolution
  const activeWeek: LeagueWeek | undefined =
    weeks?.find((w) => w.id === selectedWeekId) || weeks?.[0];

  const handleRefreshAll = () => {
    refetchLeague();
    refetchWeeks();
    refetchMatches();
    refetchStandings();
    refetchSnapshots();
    refetchPlayoffs();
    refetchTeams();
  };

  // ─── Lifecycle Actions ───────────────────────────────────────────────────────

  const handleStatusTransition = async (nextStatus: LeagueStatus) => {
    try {
      setIsOverflowOpen(false);
      await updateStatus(nextStatus);
      handleRefreshAll();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || err?.message || 'Failed to update status');
    }
  };

  const handleGenerateSchedule = async () => {
    try {
      setIsOverflowOpen(false);
      await generateSchedule();
      handleRefreshAll();
      Alert.alert('Schedule Generated', 'Regular season match fixtures have been generated successfully.');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || err?.message || 'Failed to generate schedule');
    }
  };

  const handleGeneratePlayoffs = async () => {
    try {
      setIsOverflowOpen(false);
      await generatePlayoffs();
      handleRefreshAll();
      Alert.alert('Playoffs Generated', 'Championship playoff bracket has been established.');
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
      setScoreError('Ties are not allowed in pickleball. One team must win.');
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
    const isDoubles = (league?.team_size ?? 2) === 2;

    if (isDoubles) {
      if (!selectedPlayerA || !selectedPlayerB) {
        setTeamError('Please select both players for the doubles team');
        return;
      }
      if (selectedPlayerA === selectedPlayerB) {
        setTeamError('Player 1 and Player 2 must be different members');
        return;
      }
    } else {
      if (!selectedPlayerA) {
        setTeamError('Please select a player for the singles entry');
        return;
      }
    }

    try {
      setTeamError(null);
      const payload: CreateLeagueTeamPayload = {
        name: teamName.trim(),
        player_membership_ids: isDoubles
          ? [selectedPlayerA, selectedPlayerB]
          : [selectedPlayerA],
      };
      await createTeam(payload);
      setIsAddTeamModalOpen(false);
      setTeamName('');
      setSelectedPlayerA('');
      setSelectedPlayerB('');
      refetchTeams();
      refetchLeague();
    } catch (err: any) {
      setTeamError(err?.response?.data?.detail || err?.message || 'Failed to add team');
    }
  };

  // ─── Week Dates Management Actions ──────────────────────────────────────────

  const openWeekDatesModal = (week: LeagueWeek) => {
    setEditingWeekStartDate(week.start_date || '');
    setEditingWeekEndDate(week.end_date || '');
    setWeekDatesError(null);
    setIsWeekDatesModalOpen(true);
  };

  const handleSaveWeekDates = async () => {
    if (!activeWeek) return;
    try {
      setWeekDatesError(null);
      await updateWeek({
        weekNumber: activeWeek.week_number,
        payload: {
          start_date: editingWeekStartDate.trim() || null,
          end_date: editingWeekEndDate.trim() || null,
        },
      });
      setIsWeekDatesModalOpen(false);
      refetchWeeks();
      Alert.alert('Success', `Dates updated for Week ${activeWeek.week_number}`);
    } catch (err: any) {
      setWeekDatesError(err?.response?.data?.detail || err?.message || 'Failed to update week dates');
    }
  };

  // ─── Match Scheduling Actions ───────────────────────────────────────────────

  const openScheduleModal = (match: LeagueMatch) => {
    setSchedulingMatch(match);
    setSelectedCourtId(match.court_id || clubCourts?.[0]?.id || '');
    const defaultDate = match.scheduled_start_at
      ? match.scheduled_start_at.slice(0, 10)
      : activeWeek?.start_date || new Date().toISOString().slice(0, 10);
    setScheduleDate(defaultDate);
    const defaultTime = match.scheduled_start_at
      ? match.scheduled_start_at.slice(11, 16)
      : '18:00';
    setScheduleTime(defaultTime);
    setScheduleDuration(match.duration_minutes || 60);
    setSchedulingError(null);
  };

  const handleSaveMatchSchedule = async () => {
    if (!schedulingMatch) return;
    if (!selectedCourtId) {
      setSchedulingError('Please select a court');
      return;
    }
    if (!scheduleDate || !scheduleTime) {
      setSchedulingError('Please provide both date and time');
      return;
    }

    try {
      setSchedulingError(null);
      const isoStart = `${scheduleDate.trim()}T${scheduleTime.trim()}:00Z`;
      await scheduleMatch({
        matchId: schedulingMatch.id,
        court_id: selectedCourtId,
        start_at: isoStart,
        duration_minutes: scheduleDuration,
      });
      setSchedulingMatch(null);
      refetchMatches();
      Alert.alert('Match Scheduled', 'Court and time successfully assigned.');
    } catch (err: any) {
      setSchedulingError(err?.response?.data?.detail || err?.message || 'Failed to schedule match');
    }
  };

  const handleUnscheduleMatch = async (matchId: string) => {
    try {
      await unscheduleMatch(matchId);
      setSchedulingMatch(null);
      refetchMatches();
      Alert.alert('Match Unscheduled', 'Court and time assignment removed.');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || err?.message || 'Failed to unschedule match');
    }
  };

  // ─── Render Loading / Error States ─────────────────────────────────────────

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

  const teamCount = teams?.length ?? league.teams_count ?? 0;
  const statusLabel =
    league.status === 'in_progress'
      ? 'IN PROGRESS'
      : (league.status_display || LEAGUE_STATUS_LABELS[league.status] || league.status).toUpperCase();

  return (
    <Screen style={styles.container}>
      {/* ─── EXACT SCREENSHOT HEADER ─── */}
      <View style={[styles.headerRow, { paddingTop: insets.top + 8 }]}>
        {/* Back navigation circular button */}
        <TouchableOpacity
          style={styles.backButtonCircle}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={20} color="#111827" strokeWidth={2.4} />
        </TouchableOpacity>

        {/* Title & Subtitle block */}
        <View style={styles.headerTitleBlock}>
          <AppText style={styles.headerTitle} numberOfLines={1}>
            {league.name}
          </AppText>
          <AppText style={styles.headerSubtitle} numberOfLines={1}>
            {`${league.number_of_weeks} Weeks • ${teamCount} Teams • Top ${league.playoff_team_count} to Playoffs`}
          </AppText>
        </View>

        {/* Status Pill & Overflow ⋮ Menu */}
        <View style={styles.headerRightActions}>
          <View
            style={[
              styles.statusPill,
              league.status === 'in_progress' && styles.statusPillGreen,
              league.status === 'playoffs' && styles.statusPillAmber,
              league.status === 'completed' && styles.statusPillBlue,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                league.status === 'in_progress' && styles.statusDotGreen,
                league.status === 'playoffs' && styles.statusDotAmber,
                league.status === 'completed' && styles.statusDotBlue,
              ]}
            />
            <AppText
              style={[
                styles.statusPillText,
                league.status === 'in_progress' && styles.statusPillTextGreen,
                league.status === 'playoffs' && styles.statusPillTextAmber,
                league.status === 'completed' && styles.statusPillTextBlue,
              ]}
            >
              {statusLabel}
            </AppText>
          </View>

          <TouchableOpacity
            style={styles.overflowButton}
            onPress={() => setIsOverflowOpen(true)}
            accessibilityLabel="League options"
          >
            <MoreVertical size={20} color="#1F2937" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── WEEK SELECTOR CARDS (NO DATES INSIDE CARDS) ─── */}
      <View style={styles.weekSelectorContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.weekSelectorScroll}
        >
          {weeks && weeks.length > 0
            ? weeks.map((w) => {
                const isSelected = (selectedWeekId || activeWeek?.id) === w.id;
                return (
                  <TouchableOpacity
                    key={w.id}
                    style={[
                      styles.weekCard,
                      isSelected ? styles.weekCardSelected : styles.weekCardUnselected,
                    ]}
                    onPress={() => setSelectedWeekId(w.id)}
                    activeOpacity={0.8}
                  >
                    <AppText
                      style={[
                        styles.weekCardText,
                        isSelected ? styles.weekCardTextSelected : styles.weekCardTextUnselected,
                      ]}
                    >
                      Week {w.week_number}
                    </AppText>
                  </TouchableOpacity>
                );
              })
            : Array.from({ length: league.number_of_weeks || 4 }).map((_, idx) => (
                <View
                  key={idx}
                  style={[styles.weekCard, idx === 0 ? styles.weekCardSelected : styles.weekCardUnselected]}
                >
                  <AppText
                    style={[
                      styles.weekCardText,
                      idx === 0 ? styles.weekCardTextSelected : styles.weekCardTextUnselected,
                    ]}
                  >
                    Week {idx + 1}
                  </AppText>
                </View>
              ))}
        </ScrollView>
      </View>

      {/* ─── EXACT 6 NAVIGATION TABS (STRICTLY TEXT-ONLY, NO ICONS) ─── */}
      <View style={styles.tabsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsScroll}
        >
          {(
            [
              { key: 'teams', label: 'Teams' },
              { key: 'schedule', label: 'Schedule' },
              { key: 'matches', label: 'Matches' },
              { key: 'standings', label: 'Standings' },
              { key: 'playoffs', label: 'Playoffs' },
              { key: 'results', label: 'Results' },
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.navTabPill, isActive && styles.navTabPillActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.7}
              >
                <AppText
                  style={[styles.navTabText, isActive && styles.navTabTextActive]}
                >
                  {tab.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ─── TAB CONTENT ─── */}
      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={{ paddingBottom: Spacing[16] }}
        refreshControl={
          <RefreshControl
            refreshing={isLeagueLoading || isMatchesLoading || isStandingsLoading || isTeamsLoading}
            onRefresh={handleRefreshAll}
            tintColor="#064E3B"
          />
        }
      >
        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 1: TEAMS (SCREENSHOT PIXEL MATCH)
            - Heading "Teams (N)"
            - Table header (#, Team Name, Avg Skill Level)
            - Numbered rows with pastel initials avatar, team name, Avg Skill Level pill, chevron (>)
            - NO win-loss, NO points, NO standings statistics, NO "View Standings" button
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'teams' && (
          <View style={styles.tabPane}>
            <View style={styles.teamsCard}>
              {/* Teams Header */}
              <View style={styles.teamsHeaderRow}>
                <AppText style={styles.teamsTitle}>
                  Teams ({teams?.length ?? 0})
                </AppText>
                {canManageLeague && (league.status === 'draft' || league.status === 'registration_open') ? (
                  <TouchableOpacity
                    style={styles.addTeamButton}
                    onPress={() => {
                      setTeamName('');
                      setSelectedPlayerA('');
                      setSelectedPlayerB('');
                      setTeamError(null);
                      setIsAddTeamModalOpen(true);
                    }}
                  >
                    <AppText style={styles.addTeamButtonText}>+ Add Team</AppText>
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Table Header Bar */}
              <View style={styles.teamsTableHeader}>
                <AppText style={styles.thNum}>#</AppText>
                <AppText style={styles.thTeamName}>Team Name</AppText>
                <AppText style={styles.thAvgSkill}>Avg Skill Level</AppText>
                <View style={styles.thChevronSpacer} />
              </View>

              {/* Team Rows */}
              {isTeamsLoading ? (
                <View style={{ padding: Spacing[6] }}>
                  <LoadingState message="Loading teams..." />
                </View>
              ) : !teams || teams.length === 0 ? (
                <View style={styles.emptyTeamsBox}>
                  <AppText style={styles.emptyTeamsTitle}>No Teams Registered Yet</AppText>
                  <AppText style={styles.emptyTeamsSubtitle}>
                    {league.status === 'draft' || league.status === 'registration_open'
                      ? 'Add teams or wait for players to register online.'
                      : 'No teams entered for this league.'}
                  </AppText>
                </View>
              ) : (
                teams.map((team, index) => {
                  const avatarColors = getAvatarColors(index);
                  const initials = getTeamInitials(team.name);
                  const rating = team.avg_skill_level ?? 3.5;
                  const isHighRating = rating >= 3.9;

                  return (
                    <TouchableOpacity
                      key={team.id}
                      style={[
                        styles.teamRow,
                        index === teams.length - 1 && styles.teamRowLast,
                      ]}
                      onPress={() => setSelectedTeam(team)}
                      activeOpacity={0.7}
                    >
                      {/* # Number Column */}
                      <AppText style={styles.tdNum}>{index + 1}</AppText>

                      {/* Pastel 2-letter Avatar */}
                      <View
                        style={[
                          styles.pastelAvatar,
                          { backgroundColor: avatarColors.bg },
                        ]}
                      >
                        <AppText
                          style={[
                            styles.pastelAvatarText,
                            { color: avatarColors.text },
                          ]}
                        >
                          {initials}
                        </AppText>
                      </View>

                      {/* Team Name */}
                      <AppText style={styles.tdTeamName} numberOfLines={1}>
                        {team.name}
                      </AppText>

                      {/* Avg Skill Level Badge Pill */}
                      <View
                        style={[
                          styles.skillPill,
                          isHighRating ? styles.skillPillGreen : styles.skillPillBlue,
                        ]}
                      >
                        <AppText
                          style={[
                            styles.skillPillText,
                            isHighRating ? styles.skillPillTextGreen : styles.skillPillTextBlue,
                          ]}
                        >
                          {rating.toFixed(1)}
                        </AppText>
                      </View>

                      {/* Chevron Right > */}
                      <ChevronRight size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 2: SCHEDULE
            - Week start/end date manager (manager controlled dates)
            - Match court & time assignment with conflict prevention
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'schedule' && (
          <View style={styles.tabPane}>
            {/* Week Manager Dates Card */}
            {activeWeek ? (
              <Card style={styles.weekManagerCard}>
                <View style={styles.weekManagerHeader}>
                  <View style={{ flex: 1 }}>
                    <AppText style={styles.weekManagerTitle}>
                      Week {activeWeek.week_number} Dates & Settings
                    </AppText>
                    <View style={styles.dateDisplayRow}>
                      <Calendar size={14} color="#6B7280" />
                      <AppText style={styles.dateDisplayText}>
                        {activeWeek.start_date || activeWeek.end_date
                          ? `${formatDate(activeWeek.start_date)} — ${formatDate(activeWeek.end_date)}`
                          : 'Dates not set for this week'}
                      </AppText>
                    </View>
                  </View>
                  {canManageLeague ? (
                    <TouchableOpacity
                      style={styles.editDatesButton}
                      onPress={() => openWeekDatesModal(activeWeek)}
                    >
                      <AppText style={styles.editDatesButtonText}>
                        {activeWeek.start_date ? 'Edit Dates' : 'Set Dates'}
                      </AppText>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </Card>
            ) : null}

            {/* Matches Court & Time Assignments */}
            <View style={styles.sectionHeaderRow}>
              <AppText style={styles.sectionHeading}>
                Week {activeWeek?.week_number || 1} Court & Time Schedule
              </AppText>
              {canManageLeague && activeWeek && (
                <Button
                  label="Snapshot Standings"
                  size="sm"
                  variant="secondary"
                  fullWidth={false}
                  onPress={async () => {
                    try {
                      await snapshotStandings(activeWeek.id);
                      Alert.alert('Success', `Standings snapshotted for Week ${activeWeek.week_number}`);
                      handleRefreshAll();
                    } catch (err: any) {
                      Alert.alert('Error', err?.response?.data?.detail || err?.message || 'Failed to snapshot');
                    }
                  }}
                  loading={isSnapshotting}
                />
              )}
            </View>

            {isMatchesLoading ? (
              <LoadingState message="Loading matches..." />
            ) : !matches || matches.length === 0 ? (
              <EmptyState
                title="No Matches Scheduled"
                description={
                  league.status === 'draft' || league.status === 'registration_open'
                    ? 'Fixtures will appear once registration is closed and the schedule is generated.'
                    : 'No matches found for this week.'
                }
              />
            ) : (
              <View style={{ gap: Spacing[3] }}>
                {matches.map((m) => {
                  const isScheduled = Boolean(m.court_id && m.scheduled_start_at);
                  const isBye = m.is_bye;
                  return (
                    <Card key={m.id} style={styles.scheduleMatchCard}>
                      <View style={styles.scheduleMatchHeader}>
                        <AppText style={styles.matchStageLabel}>
                          {m.stage === 'playoffs'
                            ? `Playoffs • Round ${m.round_number}`
                            : `Match ${m.match_number}`}
                        </AppText>
                        <Badge
                          label={isBye ? 'BYE' : m.status.toUpperCase()}
                          variant={
                            m.status === 'completed'
                              ? 'success'
                              : m.status === 'in_progress'
                              ? 'info'
                              : 'default'
                          }
                          size="sm"
                        />
                      </View>

                      {/* Opponents */}
                      <View style={styles.matchTeamsRow}>
                        <AppText style={styles.matchTeamTitle} numberOfLines={1}>
                          {m.team_a?.name || 'TBD'}
                        </AppText>
                        <AppText style={styles.vsBadge}>VS</AppText>
                        <AppText style={styles.matchTeamTitle} numberOfLines={1}>
                          {m.team_b?.name || (isBye ? 'BYE' : 'TBD')}
                        </AppText>
                      </View>

                      {/* Court & Time Assignment Badges */}
                      <View style={styles.scheduleMetaRow}>
                        <View style={styles.scheduleMetaItem}>
                          <MapPin size={14} color={m.court_name ? '#059669' : '#9CA3AF'} />
                          <AppText
                            style={[
                              styles.scheduleMetaText,
                              m.court_name ? styles.scheduleMetaGreen : styles.scheduleMetaMuted,
                            ]}
                          >
                            {m.court_name || 'Court Unassigned'}
                          </AppText>
                        </View>

                        <View style={styles.scheduleMetaItem}>
                          <Clock size={14} color={m.scheduled_start_at ? '#059669' : '#9CA3AF'} />
                          <AppText
                            style={[
                              styles.scheduleMetaText,
                              m.scheduled_start_at ? styles.scheduleMetaGreen : styles.scheduleMetaMuted,
                            ]}
                          >
                            {m.scheduled_start_at
                              ? formatDateTime(m.scheduled_start_at)
                              : 'Time Unscheduled'}
                          </AppText>
                        </View>
                      </View>

                      {/* Schedule/Reschedule Action */}
                      {canManageLeague && !isBye && (
                        <View style={styles.scheduleMatchFooter}>
                          <TouchableOpacity
                            style={styles.scheduleActionButton}
                            onPress={() => openScheduleModal(m)}
                          >
                            <AppText style={styles.scheduleActionText}>
                              {isScheduled ? 'Change Court & Time' : 'Assign Court & Time'}
                            </AppText>
                          </TouchableOpacity>
                        </View>
                      )}
                    </Card>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 3: MATCHES
            - Week fixture view
            - Match scores & pickleball score entry (Target 11, win by 2)
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'matches' && (
          <View style={styles.tabPane}>
            <View style={styles.sectionHeaderRow}>
              <AppText style={styles.sectionHeading}>
                Week {activeWeek?.week_number || 1} Matches
              </AppText>
            </View>

            {isMatchesLoading ? (
              <LoadingState message="Loading matches..." />
            ) : !matches || matches.length === 0 ? (
              <EmptyState
                title="No Matches"
                description="No matches found for this week. Generate schedule from the menu to populate fixtures."
              />
            ) : (
              <View style={{ gap: Spacing[3] }}>
                {matches.map((m) => {
                  const isCompleted = m.status === 'completed';
                  const isBye = m.is_bye;
                  const isTeamAWinner = isCompleted && m.winner_team_id === m.team_a_id;
                  const isTeamBWinner = isCompleted && m.winner_team_id === m.team_b_id;

                  return (
                    <Card key={m.id} style={styles.fixtureCard}>
                      <View style={styles.fixtureHeader}>
                        <AppText style={styles.fixtureStageText}>
                          {m.stage === 'playoffs'
                            ? `Playoffs • Round ${m.round_number}`
                            : `Match ${m.match_number}`}
                        </AppText>
                        <Badge
                          label={isBye ? 'BYE' : isCompleted ? 'Completed' : 'Scheduled'}
                          variant={isBye ? 'default' : isCompleted ? 'success' : 'info'}
                          size="sm"
                        />
                      </View>

                      {/* Scores & Teams Layout */}
                      <View style={styles.fixtureBody}>
                        {/* Team A Slot */}
                        <View style={styles.fixtureTeamSlot}>
                          <AppText
                            style={[
                              styles.fixtureTeamName,
                              isTeamAWinner && styles.fixtureWinnerName,
                            ]}
                            numberOfLines={1}
                          >
                            {m.team_a?.name || 'TBD'}
                          </AppText>
                          <AppText
                            style={[
                              styles.fixtureScoreText,
                              isTeamAWinner && styles.fixtureScoreWinner,
                            ]}
                          >
                            {m.score_a !== null ? m.score_a : '—'}
                          </AppText>
                        </View>

                        <View style={styles.fixtureDivider} />

                        {/* Team B Slot */}
                        <View style={styles.fixtureTeamSlot}>
                          <AppText
                            style={[
                              styles.fixtureTeamName,
                              isTeamBWinner && styles.fixtureWinnerName,
                            ]}
                            numberOfLines={1}
                          >
                            {m.team_b?.name || (isBye ? 'BYE' : 'TBD')}
                          </AppText>
                          <AppText
                            style={[
                              styles.fixtureScoreText,
                              isTeamBWinner && styles.fixtureScoreWinner,
                            ]}
                          >
                            {m.score_b !== null ? m.score_b : '—'}
                          </AppText>
                        </View>
                      </View>

                      {/* Court & Time meta if assigned */}
                      {m.court_name && m.scheduled_start_at ? (
                        <View style={styles.fixtureMetaRow}>
                          <AppText style={styles.fixtureMetaText}>
                            📍 {m.court_name} • {formatDateTime(m.scheduled_start_at)}
                          </AppText>
                        </View>
                      ) : null}

                      {/* Score Action Button */}
                      {canManageLeague && !isBye && m.team_a_id && m.team_b_id && (
                        <View style={styles.fixtureActionRow}>
                          <Button
                            label={isCompleted ? 'Correct Score' : 'Enter Score'}
                            size="sm"
                            variant={isCompleted ? 'secondary' : 'primary'}
                            fullWidth={false}
                            onPress={() => openScoreModal(m)}
                            disabled={league.status === 'playoffs' && m.stage === 'regular_season'}
                          />
                        </View>
                      )}
                    </Card>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 4: STANDINGS
            - Live cumulative regular season standings table
            - Wins, Differential, Points For, Points Against
            - Playoff cutoff indicator line
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'standings' && (
          <View style={styles.tabPane}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <AppText style={styles.sectionHeading}>Live Standings</AppText>
                <AppText style={styles.sectionSubheading}>
                  Ranked by Wins → Point Differential → Points Scored
                </AppText>
              </View>
            </View>

            {isStandingsLoading ? (
              <LoadingState message="Calculating standings..." />
            ) : !standingsData || standingsData.standings.length === 0 ? (
              <EmptyState
                title="No Standings Data"
                description="Standings will update automatically as weekly match scores are entered."
              />
            ) : (
              <Card style={styles.standingsCard}>
                <View style={styles.standingsTableHeader}>
                  <AppText style={[styles.sTh, styles.sThRank]}>#</AppText>
                  <AppText style={[styles.sTh, styles.sThTeam]}>Team</AppText>
                  <AppText style={[styles.sTh, styles.sThStat]}>MP</AppText>
                  <AppText style={[styles.sTh, styles.sThStat]}>W</AppText>
                  <AppText style={[styles.sTh, styles.sThStat]}>L</AppText>
                  <AppText style={[styles.sTh, styles.sThStat]}>+/-</AppText>
                </View>

                {standingsData.standings.map((row, idx) => {
                  const isQualified = row.rank <= league.playoff_team_count;
                  const isCutoffLine = row.rank === league.playoff_team_count;

                  return (
                    <React.Fragment key={row.team_id}>
                      <View
                        style={[
                          styles.standingsTableRow,
                          isQualified && styles.standingsQualifiedRow,
                        ]}
                      >
                        <AppText style={[styles.sTd, styles.sThRank, styles.sRankBold]}>
                          {row.rank}
                        </AppText>
                        <View style={[styles.sThTeam, { justifyContent: 'center' }]}>
                          <AppText style={styles.sTeamName} numberOfLines={1}>
                            {row.team_name}
                          </AppText>
                          {isQualified ? (
                            <AppText style={styles.sPlayoffTag}>● Playoff Seed #{row.rank}</AppText>
                          ) : null}
                        </View>
                        <AppText style={[styles.sTd, styles.sThStat]}>{row.matches_played}</AppText>
                        <AppText style={[styles.sTd, styles.sThStat, styles.sStatBold]}>
                          {row.wins}
                        </AppText>
                        <AppText style={[styles.sTd, styles.sThStat]}>{row.losses}</AppText>
                        <AppText
                          style={[
                            styles.sTd,
                            styles.sThStat,
                            row.points_differential > 0
                              ? styles.sDiffPositive
                              : row.points_differential < 0
                              ? styles.sDiffNegative
                              : styles.sDiffNeutral,
                          ]}
                        >
                          {row.points_differential > 0
                            ? `+${row.points_differential}`
                            : row.points_differential}
                        </AppText>
                      </View>

                      {/* Visual cutoff line after playoff seed count */}
                      {isCutoffLine && idx < standingsData.standings.length - 1 && (
                        <View style={styles.cutoffLineContainer}>
                          <View style={styles.cutoffLineBar} />
                          <AppText style={styles.cutoffLineText}>
                            Top {league.playoff_team_count} Advance to Playoffs
                          </AppText>
                          <View style={styles.cutoffLineBar} />
                        </View>
                      )}
                    </React.Fragment>
                  );
                })}
              </Card>
            )}

            {/* Historical Snapshots Section */}
            {snapshots && snapshots.length > 0 ? (
              <View style={styles.snapshotsCard}>
                <AppText style={styles.snapshotsTitle}>Preserved Weekly Snapshots</AppText>
                <AppText style={styles.snapshotsSubtitle}>
                  {snapshots.length} historical regular season weekly snapshots preserved
                </AppText>
              </View>
            ) : null}
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 5: PLAYOFFS
            - Playoff qualification seeding preview
            - Playoff bracket knockout match view
            - Generate Playoffs button
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'playoffs' && (
          <View style={styles.tabPane}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <AppText style={styles.sectionHeading}>Championship Playoffs</AppText>
                <AppText style={styles.sectionSubheading}>
                  Top {league.playoff_team_count} Teams • Single-Elimination Knockout
                </AppText>
              </View>
            </View>

            {isPlayoffsLoading ? (
              <LoadingState message="Loading playoff bracket..." />
            ) : !playoffs ? (
              <Card style={styles.emptyPlayoffsCard}>
                <Trophy size={40} color="#D97706" style={{ alignSelf: 'center', marginBottom: 12 }} />
                <AppText style={styles.emptyPlayoffsTitle}>Playoffs Not Established Yet</AppText>
                <AppText style={styles.emptyPlayoffsText}>
                  Playoffs begin in the final week once regular season round-robin matches are completed.
                  The top {league.playoff_team_count} seeded teams will qualify.
                </AppText>

                {/* Qualification Preview */}
                {standingsData && standingsData.standings.length >= league.playoff_team_count && (
                  <View style={styles.qualificationPreviewBox}>
                    <AppText style={styles.qualificationPreviewTitle}>
                      Current Projected Qualifiers:
                    </AppText>
                    {standingsData.standings.slice(0, league.playoff_team_count).map((s) => (
                      <AppText key={s.team_id} style={styles.qualificationPreviewItem}>
                        Seed #{s.rank}: {s.team_name} ({s.wins}W - {s.losses}L, {s.points_differential > 0 ? `+${s.points_differential}` : s.points_differential})
                      </AppText>
                    ))}
                  </View>
                )}

                {canManageLeague && (
                  <Button
                    label="Generate Playoff Bracket"
                    variant="primary"
                    onPress={handleGeneratePlayoffs}
                    loading={isGeneratingPlayoffs}
                    style={{ marginTop: Spacing[4] }}
                  />
                )}
              </Card>
            ) : (
              <View style={{ gap: Spacing[3] }}>
                {/* Playoff Active Status Card */}
                <Card style={styles.playoffStatusCard}>
                  <View style={styles.playoffStatusHeader}>
                    <Trophy size={20} color="#15803D" />
                    <AppText style={styles.playoffStatusTitle}>Playoffs Active</AppText>
                  </View>
                  <AppText style={styles.playoffStatusDetails}>
                    • {playoffs.playoff_teams_count} Qualified Teams{'\n'}
                    • {playoffs.rounds_count} Knockout Rounds{'\n'}
                    • {playoffs.matches_played ?? 0} Completed,{' '}
                    {playoffs.matches_remaining ?? 0} Remaining
                  </AppText>
                  {playoffs.champion_team_name && (
                    <View style={styles.playoffChampionBanner}>
                      <AppText style={styles.playoffChampionText}>
                        👑 Champion: {playoffs.champion_team_name}
                      </AppText>
                    </View>
                  )}
                </Card>

                {/* Switch to view playoff matches */}
                <Button
                  label="View Playoff Fixtures in Matches Tab"
                  variant="secondary"
                  onPress={() => {
                    const playoffWeek = weeks?.find((w) => w.week_type === 'playoffs');
                    if (playoffWeek) setSelectedWeekId(playoffWeek.id);
                    setActiveTab('matches');
                  }}
                />
              </View>
            )}
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 6: RESULTS
            - Crowned Champion celebration card
            - Final league recap and standings
            - League completion workflow
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'results' && (
          <View style={styles.tabPane}>
            {league.champion_team || playoffs?.champion_team_name ? (
              <Card style={styles.championCard}>
                <View style={styles.trophyCircle}>
                  <Trophy size={36} color="#D97706" />
                </View>
                <AppText style={styles.championTag}>LEAGUE CHAMPION</AppText>
                <AppText style={styles.championName}>
                  {league.champion_team?.name || playoffs?.champion_team_name}
                </AppText>
                <AppText style={styles.championSub}>
                  Winner of {league.name} Championship
                </AppText>

                {league.status !== 'completed' && canManageLeague && (
                  <Button
                    label="Finalize & Complete League"
                    variant="primary"
                    onPress={() => handleStatusTransition('completed')}
                    loading={isUpdatingStatus}
                    style={{ marginTop: Spacing[4] }}
                  />
                )}
              </Card>
            ) : (
              <Card style={styles.inProgressResultsCard}>
                <Trophy size={32} color="#9CA3AF" style={{ alignSelf: 'center', marginBottom: 8 }} />
                <AppText style={styles.inProgressTitle}>Season in Progress</AppText>
                <AppText style={styles.inProgressText}>
                  Results and champion crowning will be published here upon completion of the championship playoffs.
                </AppText>

                {/* Leader Preview */}
                {standingsData && standingsData.standings[0] && (
                  <View style={styles.leaderPreview}>
                    <AppText style={styles.leaderLabel}>Current Regular Season Leader:</AppText>
                    <AppText style={styles.leaderTeam}>
                      🥇 {standingsData.standings[0].team_name} ({standingsData.standings[0].wins} Wins)
                    </AppText>
                  </View>
                )}
              </Card>
            )}

            {/* Season Summary Statistics */}
            <Card style={styles.seasonSummaryCard}>
              <AppText style={styles.seasonSummaryTitle}>Season Summary</AppText>
              <View style={styles.summaryStatsRow}>
                <View style={styles.summaryStatItem}>
                  <AppText style={styles.summaryStatVal}>{league.number_of_weeks}</AppText>
                  <AppText style={styles.summaryStatLbl}>Total Weeks</AppText>
                </View>
                <View style={styles.summaryStatDivider} />
                <View style={styles.summaryStatItem}>
                  <AppText style={styles.summaryStatVal}>{teamCount}</AppText>
                  <AppText style={styles.summaryStatLbl}>Teams</AppText>
                </View>
                <View style={styles.summaryStatDivider} />
                <View style={styles.summaryStatItem}>
                  <AppText style={styles.summaryStatVal}>{league.playoff_team_count}</AppText>
                  <AppText style={styles.summaryStatLbl}>Playoff Spots</AppText>
                </View>
              </View>
            </Card>
          </View>
        )}
      </ScrollView>

      {/* ─── MODAL: LIFECYCLE OVERFLOW ACTIONS (⋮) ─── */}
      <ModalSheet
        visible={isOverflowOpen}
        onClose={() => setIsOverflowOpen(false)}
        title="League Actions"
        subtitle={`Current Status: ${statusLabel}`}
      >
        <View style={styles.overflowMenuContainer}>
          {league.status === 'draft' && (
            <TouchableOpacity
              style={styles.overflowMenuItem}
              onPress={() => handleStatusTransition('registration_open')}
            >
              <AppText style={styles.overflowMenuTextPrimary}>Open Registration</AppText>
            </TouchableOpacity>
          )}

          {league.status === 'registration_open' && (
            <TouchableOpacity
              style={styles.overflowMenuItem}
              onPress={() => handleStatusTransition('registration_closed')}
            >
              <AppText style={styles.overflowMenuText}>Close Registration</AppText>
            </TouchableOpacity>
          )}

          {league.status === 'registration_closed' && (
            <TouchableOpacity
              style={styles.overflowMenuItem}
              onPress={handleGenerateSchedule}
            >
              <AppText style={styles.overflowMenuTextPrimary}>
                Generate Schedule & Start League
              </AppText>
            </TouchableOpacity>
          )}

          {league.status === 'in_progress' && (
            <TouchableOpacity
              style={styles.overflowMenuItem}
              onPress={handleGeneratePlayoffs}
            >
              <AppText style={styles.overflowMenuTextPrimary}>Generate Playoffs Bracket</AppText>
            </TouchableOpacity>
          )}

          {league.status === 'playoffs' && (
            <TouchableOpacity
              style={styles.overflowMenuItem}
              onPress={() => handleStatusTransition('completed')}
            >
              <AppText style={styles.overflowMenuTextPrimary}>Complete League</AppText>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.overflowMenuItem}
            onPress={() => {
              setIsOverflowOpen(false);
              handleRefreshAll();
            }}
          >
            <AppText style={styles.overflowMenuText}>Refresh All Data</AppText>
          </TouchableOpacity>
        </View>
      </ModalSheet>

      {/* ─── MODAL: TEAM DETAILS ─── */}
      <ModalSheet
        visible={Boolean(selectedTeam)}
        onClose={() => setSelectedTeam(null)}
        title={selectedTeam?.name || 'Team Details'}
        subtitle={`Average Skill Level: ${(selectedTeam?.avg_skill_level ?? 3.5).toFixed(1)}`}
      >
        <View style={styles.teamDetailsContainer}>
          <AppText style={styles.rosterSectionTitle}>Roster Members</AppText>
          {selectedTeam?.members && selectedTeam.members.length > 0 ? (
            selectedTeam.members.map((member) => (
              <View key={member.id} style={styles.rosterMemberRow}>
                <View style={styles.memberAvatar}>
                  <Users size={16} color="#064E3B" />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText style={styles.memberName}>
                    {member.user?.full_name || member.user?.display_name || 'Player'}
                  </AppText>
                  <AppText style={styles.memberEmail}>
                    {member.user?.email || 'Club Member'}
                  </AppText>
                </View>
                <View style={styles.memberRatingBadge}>
                  <AppText style={styles.memberRatingText}>
                    Rating: {(member.skill_rating ?? selectedTeam.avg_skill_level ?? 3.5).toFixed(1)}
                  </AppText>
                </View>
              </View>
            ))
          ) : (
            <AppText style={styles.noMembersText}>No member profiles linked</AppText>
          )}
        </View>
      </ModalSheet>

      {/* ─── MODAL: WEEK DATES MANAGER ─── */}
      <ModalSheet
        visible={isWeekDatesModalOpen}
        onClose={() => setIsWeekDatesModalOpen(false)}
        title={`Edit Week ${activeWeek?.week_number} Dates`}
        subtitle="Set or adjust manager-controlled week schedule dates"
        actions={[
          {
            label: 'Cancel',
            variant: 'secondary',
            onPress: () => setIsWeekDatesModalOpen(false),
          },
          {
            label: 'Save Dates',
            variant: 'primary',
            onPress: handleSaveWeekDates,
            loading: isUpdatingWeek,
          },
        ]}
      >
        <View style={{ gap: Spacing[3], paddingBottom: Spacing[4] }}>
          {weekDatesError ? (
            <View style={styles.errorContainer}>
              <AppText style={styles.errorText}>{weekDatesError}</AppText>
            </View>
          ) : null}

          <Input
            label="Start Date (YYYY-MM-DD)"
            placeholder="e.g. 2026-10-05"
            value={editingWeekStartDate}
            onChangeText={setEditingWeekStartDate}
          />

          <Input
            label="End Date (YYYY-MM-DD)"
            placeholder="e.g. 2026-10-11"
            value={editingWeekEndDate}
            onChangeText={setEditingWeekEndDate}
          />
        </View>
      </ModalSheet>

      {/* ─── MODAL: MATCH COURT & TIME SCHEDULING ─── */}
      <ModalSheet
        visible={Boolean(schedulingMatch)}
        onClose={() => setSchedulingMatch(null)}
        title="Schedule Match"
        subtitle={`${schedulingMatch?.team_a?.name || 'Team A'} vs ${schedulingMatch?.team_b?.name || 'Team B'}`}
        actions={[
          {
            label: schedulingMatch?.court_id ? 'Unschedule' : 'Cancel',
            variant: 'secondary',
            onPress: () => {
              if (schedulingMatch?.court_id) {
                handleUnscheduleMatch(schedulingMatch.id);
              } else {
                setSchedulingMatch(null);
              }
            },
            loading: isUnschedulingMatch,
          },
          {
            label: 'Save Schedule',
            variant: 'primary',
            onPress: handleSaveMatchSchedule,
            loading: isSchedulingMatch,
          },
        ]}
      >
        <View style={{ gap: Spacing[3], paddingBottom: Spacing[4] }}>
          {schedulingError ? (
            <View style={styles.errorContainer}>
              <AppText style={styles.errorText}>{schedulingError}</AppText>
            </View>
          ) : null}

          {/* Court Selection */}
          <AppText style={styles.selectLabel}>Select Court *</AppText>
          <View style={styles.courtChipsRow}>
            {clubCourts && clubCourts.length > 0 ? (
              clubCourts.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.courtChip,
                    selectedCourtId === c.id && styles.courtChipSelected,
                  ]}
                  onPress={() => setSelectedCourtId(c.id)}
                >
                  <AppText
                    style={[
                      styles.courtChipText,
                      selectedCourtId === c.id && styles.courtChipTextSelected,
                    ]}
                  >
                    {c.name}
                  </AppText>
                </TouchableOpacity>
              ))
            ) : (
              <AppText style={styles.noCourtsText}>No club courts found</AppText>
            )}
          </View>

          {/* Date & Time Inputs */}
          <Input
            label="Date (YYYY-MM-DD) *"
            placeholder="2026-10-07"
            value={scheduleDate}
            onChangeText={setScheduleDate}
          />

          <Input
            label="Start Time (HH:MM in 24hr format) *"
            placeholder="18:00"
            value={scheduleTime}
            onChangeText={setScheduleTime}
          />
        </View>
      </ModalSheet>

      {/* ─── MODAL: SCORE RECORDING ─── */}
      <ModalSheet
        visible={Boolean(scoreModalMatch)}
        onClose={() => setScoreModalMatch(null)}
        title={
          scoreModalMatch?.status === 'completed'
            ? 'Correct Match Score'
            : 'Record Match Score'
        }
        subtitle="Pickleball standard: Target 11, must win by at least 2."
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

      {/* ─── MODAL: ADD TEAM ─── */}
      <ModalSheet
        visible={isAddTeamModalOpen}
        onClose={() => setIsAddTeamModalOpen(false)}
        title="Add Team to League"
        subtitle={
          (league.team_size ?? 2) === 2
            ? 'Doubles format: Select team name and 2 members.'
            : 'Singles format: Select entry name and 1 member.'
        }
        actions={[
          {
            label: 'Cancel',
            variant: 'secondary',
            onPress: () => setIsAddTeamModalOpen(false),
          },
          {
            label: 'Add Team',
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
            label="Team / Entry Name *"
            placeholder="e.g. Dink Dynasty"
            value={teamName}
            onChangeText={setTeamName}
          />

          <AppText style={styles.selectLabel}>Player 1 *</AppText>
          <ScrollView style={styles.playerSelectList} nestedScrollEnabled>
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
          </ScrollView>

          {(league.team_size ?? 2) === 2 && (
            <>
              <AppText style={[styles.selectLabel, { marginTop: Spacing[2] }]}>
                Player 2 *
              </AppText>
              <ScrollView style={styles.playerSelectList} nestedScrollEnabled>
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
              </ScrollView>
            </>
          )}
        </View>
      </ModalSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },

  // ─── Header Styles (Screenshot Exact Replica) ───
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[3],
    gap: Spacing[3],
    backgroundColor: '#F8F9FA',
  },
  backButtonCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  headerTitleBlock: {
    flex: 1,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7', // Pale mint
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 6,
  },
  statusPillGreen: {
    backgroundColor: '#DCFCE7',
  },
  statusPillAmber: {
    backgroundColor: '#FEF3C7',
  },
  statusPillBlue: {
    backgroundColor: '#DBEAFE',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#15803D',
  },
  statusDotGreen: {
    backgroundColor: '#15803D',
  },
  statusDotAmber: {
    backgroundColor: '#D97706',
  },
  statusDotBlue: {
    backgroundColor: '#2563EB',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
    letterSpacing: 0.3,
  },
  statusPillTextGreen: {
    color: '#15803D',
  },
  statusPillTextAmber: {
    color: '#B45309',
  },
  statusPillTextBlue: {
    color: '#1D4ED8',
  },
  overflowButton: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ─── Week Selector Row ───
  weekSelectorContainer: {
    paddingVertical: Spacing[2],
  },
  weekSelectorScroll: {
    paddingHorizontal: Spacing[4],
    gap: Spacing[3],
  },
  weekCard: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 90,
  },
  weekCardSelected: {
    backgroundColor: '#064E3B', // Deep forest green
  },
  weekCardUnselected: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  weekCardText: {
    fontSize: 15,
    fontWeight: '700',
  },
  weekCardTextSelected: {
    color: '#FFFFFF',
  },
  weekCardTextUnselected: {
    color: '#111827',
  },

  // ─── Exact 6 Navigation Tabs ───
  tabsContainer: {
    marginVertical: Spacing[2],
  },
  tabsScroll: {
    paddingHorizontal: Spacing[4],
    gap: Spacing[1],
  },
  navTabPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  navTabPillActive: {
    backgroundColor: '#064E3B', // Deep dark green pill
  },
  navTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  navTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // ─── Tab Content Container ───
  contentScroll: {
    flex: 1,
  },
  tabPane: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[2],
  },

  // ─── Teams Tab Card (Exact Reference Design) ───
  teamsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    overflow: 'hidden',
  },
  teamsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
  },
  teamsTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  addTeamButton: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  addTeamButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#064E3B',
  },
  teamsTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginHorizontal: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  thNum: {
    width: 28,
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  thTeamName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    paddingLeft: 46, // Aligns with Team Name after Avatar
  },
  thAvgSkill: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    paddingRight: 10,
  },
  thChevronSpacer: {
    width: 18,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  teamRowLast: {
    borderBottomWidth: 0,
  },
  tdNum: {
    width: 28,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  pastelAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  pastelAvatarText: {
    fontSize: 14,
    fontWeight: '800',
  },
  tdTeamName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  skillPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 10,
  },
  skillPillGreen: {
    backgroundColor: '#ECFDF5',
  },
  skillPillBlue: {
    backgroundColor: '#EFF6FF',
  },
  skillPillText: {
    fontSize: 14,
    fontWeight: '700',
  },
  skillPillTextGreen: {
    color: '#059669',
  },
  skillPillTextBlue: {
    color: '#2563EB',
  },
  emptyTeamsBox: {
    padding: Spacing[6],
    alignItems: 'center',
  },
  emptyTeamsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
  emptyTeamsSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },

  // ─── Schedule Tab Styles ───
  weekManagerCard: {
    padding: Spacing[4],
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: Spacing[4],
  },
  weekManagerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weekManagerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  dateDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  dateDisplayText: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '500',
  },
  editDatesButton: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  editDatesButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#064E3B',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[3],
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  sectionSubheading: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  scheduleMatchCard: {
    padding: Spacing[3],
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  scheduleMatchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing[2],
  },
  matchStageLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  matchTeamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  matchTeamTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  vsBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9CA3AF',
    paddingHorizontal: 8,
  },
  scheduleMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[3],
    marginTop: Spacing[2],
    paddingTop: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  scheduleMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scheduleMetaText: {
    fontSize: 12,
    fontWeight: '600',
  },
  scheduleMetaGreen: {
    color: '#059669',
  },
  scheduleMetaMuted: {
    color: '#9CA3AF',
  },
  scheduleMatchFooter: {
    marginTop: Spacing[2],
    alignItems: 'flex-end',
  },
  scheduleActionButton: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  scheduleActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#064E3B',
  },

  // ─── Matches Tab Styles ───
  fixtureCard: {
    padding: Spacing[3],
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  fixtureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing[2],
  },
  fixtureStageText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  fixtureBody: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: Spacing[2],
    marginVertical: 4,
  },
  fixtureTeamSlot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  fixtureTeamName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  fixtureWinnerName: {
    fontWeight: '800',
    color: '#064E3B',
  },
  fixtureScoreText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    width: 32,
    textAlign: 'right',
  },
  fixtureScoreWinner: {
    color: '#059669',
    fontWeight: '900',
  },
  fixtureDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 2,
  },
  fixtureMetaRow: {
    marginTop: 6,
  },
  fixtureMetaText: {
    fontSize: 11,
    color: '#6B7280',
  },
  fixtureActionRow: {
    marginTop: Spacing[2],
    alignItems: 'flex-end',
  },

  // ─── Standings Tab Styles ───
  standingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  standingsTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sTh: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  sTd: {
    fontSize: 13,
    color: '#111827',
  },
  sThRank: {
    width: 28,
    textAlign: 'center',
  },
  sRankBold: {
    fontWeight: '800',
  },
  sThTeam: {
    flex: 1,
    paddingLeft: 8,
  },
  sTeamName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  sPlayoffTag: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '700',
    marginTop: 2,
  },
  sThStat: {
    width: 36,
    textAlign: 'center',
  },
  sStatBold: {
    fontWeight: '800',
  },
  sDiffPositive: {
    color: '#059669',
    fontWeight: '700',
  },
  sDiffNegative: {
    color: '#DC2626',
    fontWeight: '700',
  },
  sDiffNeutral: {
    color: '#6B7280',
  },
  standingsTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  standingsQualifiedRow: {
    backgroundColor: '#F0FDF4',
  },
  cutoffLineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
  },
  cutoffLineBar: {
    flex: 1,
    height: 1,
    backgroundColor: '#D1D5DB',
  },
  cutoffLineText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
    marginHorizontal: 8,
    textTransform: 'uppercase',
  },
  snapshotsCard: {
    marginTop: Spacing[4],
    padding: Spacing[3],
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  snapshotsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  snapshotsSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },

  // ─── Playoffs Tab Styles ───
  emptyPlayoffsCard: {
    padding: Spacing[5],
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  emptyPlayoffsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  emptyPlayoffsText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  qualificationPreviewBox: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: Spacing[3],
    marginTop: Spacing[3],
  },
  qualificationPreviewTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 4,
  },
  qualificationPreviewItem: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
    marginVertical: 2,
  },
  playoffStatusCard: {
    padding: Spacing[4],
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  playoffStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  playoffStatusTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  playoffStatusDetails: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 20,
  },
  playoffChampionBanner: {
    backgroundColor: '#ECFDF5',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  playoffChampionText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#064E3B',
  },

  // ─── Results Tab Styles ───
  championCard: {
    padding: Spacing[5],
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#F59E0B',
    alignItems: 'center',
    marginBottom: Spacing[4],
  },
  trophyCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  championTag: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 1,
    marginBottom: 4,
  },
  championName: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
  },
  championSub: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  inProgressResultsCard: {
    padding: Spacing[5],
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    marginBottom: Spacing[4],
  },
  inProgressTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  inProgressText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
  },
  leaderPreview: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    width: '100%',
    alignItems: 'center',
  },
  leaderLabel: {
    fontSize: 11,
    color: '#6B7280',
  },
  leaderTeam: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginTop: 2,
  },
  seasonSummaryCard: {
    padding: Spacing[4],
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  seasonSummaryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: Spacing[3],
  },
  summaryStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  summaryStatItem: {
    alignItems: 'center',
  },
  summaryStatVal: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  summaryStatLbl: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  summaryStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E5E7EB',
  },

  // ─── Modal Sheet Shared Styles ───
  overflowMenuContainer: {
    paddingBottom: Spacing[4],
    gap: 4,
  },
  overflowMenuItem: {
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  overflowMenuText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  overflowMenuTextPrimary: {
    fontSize: 15,
    fontWeight: '700',
    color: '#064E3B',
  },
  teamDetailsContainer: {
    paddingBottom: Spacing[4],
  },
  rosterSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: Spacing[2],
  },
  rosterMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 12,
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  memberEmail: {
    fontSize: 12,
    color: '#6B7280',
  },
  memberRatingBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  memberRatingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  noMembersText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  errorContainer: {
    padding: Spacing[2],
    backgroundColor: '#FEE2E2',
    borderRadius: Radius.md,
  },
  errorText: {
    fontSize: Typography.size.xs,
    color: '#DC2626',
    fontWeight: '600',
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
    color: '#111827',
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
    color: '#9CA3AF',
    marginHorizontal: Spacing[2],
  },
  selectLabel: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: '#111827',
    marginBottom: 4,
  },
  playerSelectList: {
    maxHeight: 120,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  playerOption: {
    padding: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  playerOptionSelected: {
    backgroundColor: '#ECFDF5',
  },
  playerOptionText: {
    fontSize: Typography.size.xs,
    color: '#111827',
  },
  playerOptionTextSelected: {
    color: '#064E3B',
    fontWeight: Typography.weight.bold,
  },
  courtChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  courtChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  courtChipSelected: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  courtChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  courtChipTextSelected: {
    color: '#FFFFFF',
  },
  noCourtsText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
});
