/**
 * Aught2 Pickleball — Club League Details Screen
 *
 * Pixel-accurate implementation matching reference design:
 * - Screen 2: Top Header (Title, Status Pill below title, Subtitle, 3-dot menu),
 *             Hero court image banner, 2-column registration stats card, Close Registration button,
 *             6 text-only navigation tabs, Teams list with monogram pastel avatars, skill ratings, chevron.
 * - Screen 3: Schedule tab (No Schedule Generated center card, calendar icon, checklist,
 *             prominent green Generate Matches button, preview confirmation alert, info notice).
 * - Screen 4: Schedule tab (Schedule Generated: Week 1 Schedule heading, Week Date card,
 *             match cards with Match #, time, court, team avatars, ratings, Edit Week Dates button).
 * - Screen 5: Matches tab (Week selector + All Courts dropdown, Week 1 Matches heading,
 *             match cards with Scheduled / In Progress / Not Started status pills, inline score entry + Save Score).
 * - Screen 6: Standings tab (Current Standings heading, Regular Season pill, table with #, Team, MP, W, L, +/-, Pts,
 *             info note, strictly NO premature playoff seed badges).
 * - Screen 7: Playoffs tab (Playoffs Not Available Yet, gold trophy icon, Regular Season Progress bar,
 *             disabled Generate Playoff Matches button, checklist; enabled when 100% complete).
 * - Screen 8: Results tab (Regular Season & Week dropdown filters, Regular Season Results heading, completed match cards).
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
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
  Info,
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
  CreateLeagueModal,
  EmptyState,
  ErrorState,
  Input,
  DatePickerInput,
  DateRangePickerInput,
  TimePickerInput,
  LeagueOptionsMenuModal,
  LoadingState,
  ModalSheet,
  Screen,
} from '@/components';
import { getLeagueStatusBadgeDetails } from '@/components/competition/LeagueOptionsMenuModal';
import {
  useActiveClub,
  useClubCourts,
  useClubLeagues,
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
  type CreateLeagueTeamPayload,
  type LeagueMatch,
  type LeagueStatus,
  type LeagueTeam,
  type LeagueWeek,
} from '@/types';
import { formatDate, formatDateTime } from '@/utils/formatters';
import { getCourtDisplayLabel } from '@/utils';
import { PlayerLeagueOverviewTab } from '@/components/league';

type TabKey = 'overview' | 'teams' | 'schedule' | 'matches' | 'standings' | 'playoffs' | 'results';

// Pastel palette for team avatars matching reference design
const PASTEL_PALETTE = [
  { bg: '#FEE2E2', text: '#DC2626' }, // 1. Soft Red/Coral (AA)
  { bg: '#DCFCE7', text: '#15803D' }, // 2. Soft Green (BB)
  { bg: '#DBEAFE', text: '#1D4ED8' }, // 3. Soft Blue (GG)
  { bg: '#FEF3C7', text: '#D97706' }, // 4. Soft Amber (DD)
  { bg: '#F3E8FF', text: '#7E22CE' }, // 5. Soft Purple (AP)
  { bg: '#CCFBF1', text: '#0F766E' }, // 6. Soft Teal (VV)
  { bg: '#FFEDD5', text: '#C2410C' }, // 7. Soft Peach
  { bg: '#FCE7F3', text: '#BE185D' }, // 8. Soft Rose
];

function getTeamInitials(teamName: string): string {
  const clean = (teamName || '').trim();
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
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const leagueId = id || null;
  const { clubId } = useActiveClub();
  const { canManageTournaments, canManageLeagues } = usePermission();
  const canManageLeague = canManageTournaments || canManageLeagues;

  // Active navigation tab (Exact required order: Overview & Rules, Players/Teams, Schedule, Standings, Playoffs, Results)
  const initialTab = useMemo<TabKey>(() => {
    if (tab === 'overview' || tab === 'teams' || tab === 'schedule' || tab === 'matches' || tab === 'standings' || tab === 'playoffs' || tab === 'results') {
      return tab as TabKey;
    }
    return 'overview';
  }, [tab]);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [scheduleSubView, setScheduleSubView] = useState<'fixtures' | 'scores'>(tab === 'matches' ? 'scores' : 'fixtures');
  const [selectedWeekId, setSelectedWeekId] = useState<string | undefined>(undefined);

  // Filters
  const [courtFilterId, setCourtFilterId] = useState<string | null>(null);
  const [resultStageFilter, setResultStageFilter] = useState<'regular_season' | 'playoffs'>('regular_season');
  const [resultWeekFilter, setResultWeekFilter] = useState<string>('all');

  // Inline Scores Map: matchId -> { scoreA: string, scoreB: string }
  const [inlineScores, setInlineScores] = useState<Record<string, { a: string; b: string }>>({});
  const [savingScoreMatchId, setSavingScoreMatchId] = useState<string | null>(null);

  // Overflow Actions Modal State
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);

  // Edit League Modal State
  const [isEditLeagueModalOpen, setIsEditLeagueModalOpen] = useState(false);
  const { updateLeague, isUpdating: isUpdatingLeague } = useClubLeagues(clubId);

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
    openRegistration,
    isOpeningRegistration,
    closeRegistration,
    isClosingRegistration,
    generateSchedule,
    isGeneratingSchedule,
    startLeague,
    isStartingLeague,
    generatePlayoffs,
    isGeneratingPlayoffs,
    completeLeague,
    isCompletingLeague,
    cancelLeague,
    isCancellingLeague,
  } = useLeagueDetails(clubId, leagueId);

  const isActionProcessing =
    Boolean(isUpdatingStatus) ||
    Boolean(isStartingLeague) ||
    Boolean(isGeneratingSchedule) ||
    Boolean(isGeneratingPlayoffs) ||
    Boolean(isOpeningRegistration) ||
    Boolean(isClosingRegistration) ||
    Boolean(isCompletingLeague) ||
    Boolean(isCancellingLeague);

  const {
    data: weeks,
    refetch: refetchWeeks,
    updateWeek,
    isUpdatingWeek,
  } = useLeagueWeeks(clubId, leagueId);

  // Regular-season weeks only (excludes playoff championship week)
  const regularWeeks: LeagueWeek[] = useMemo(() => {
    if (!weeks) return [];
    return weeks.filter((w: LeagueWeek) => w.week_type === 'regular_season');
  }, [weeks]);

  // Active week resolution
  const isAllWeeks = selectedWeekId === 'all';
  const activeWeek: LeagueWeek | undefined = isAllWeeks
    ? undefined
    : (regularWeeks?.find((w: LeagueWeek) => w.id === selectedWeekId) || regularWeeks?.[0]);
  const effectiveWeekId = isAllWeeks ? undefined : activeWeek?.id;

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
  } = useLeagueMatches(clubId, leagueId, effectiveWeekId, 'regular_season');

  const {
    data: allLeagueMatches,
    refetch: refetchAllMatches,
  } = useLeagueMatches(clubId, leagueId, undefined, undefined);

  const regularMatches = useMemo(() => {
    if (!allLeagueMatches) return [];
    return allLeagueMatches.filter((m) => m.stage === 'regular_season');
  }, [allLeagueMatches]);

  const hasSchedule = Boolean(regularMatches && regularMatches.length > 0);

  // Match completion progress
  const totalRegularMatchesCount = regularMatches.length;
  const completedRegularMatchesCount = regularMatches.filter((m) => m.status === 'completed').length;
  const regularProgressPercent =
    totalRegularMatchesCount > 0
      ? Math.round((completedRegularMatchesCount / totalRegularMatchesCount) * 100)
      : 0;
  const isRegularSeasonComplete =
    totalRegularMatchesCount > 0 &&
    completedRegularMatchesCount === totalRegularMatchesCount;

  const {
    data: standingsData,
    isLoading: isStandingsLoading,
    refetch: refetchStandings,
  } = useLeagueStandings(clubId, leagueId);

  const totalMatchesPlayed =
    standingsData?.standings?.reduce((acc, row) => acc + (row.matches_played || 0), 0) ?? 0;
  const isPreSeason = totalMatchesPlayed === 0;

  const {
    data: snapshots,
    refetch: refetchSnapshots,
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

  const handleRefreshAll = () => {
    refetchLeague();
    refetchWeeks();
    refetchMatches();
    refetchAllMatches();
    refetchStandings();
    refetchSnapshots();
    refetchPlayoffs();
    refetchTeams();
  };

  // ─── Lifecycle Actions ───────────────────────────────────────────────────────

  const handlePublishLeague = async () => {
    try {
      setIsOverflowOpen(false);
      await openRegistration();
      handleRefreshAll();
      Alert.alert(
        'Registration Opened!',
        `Registration is now open for "${league?.name}". Players can now discover and register.`
      );
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || err?.message || 'Failed to open registration');
    }
  };

  const handleConfirmCloseRegistration = () => {
    Alert.alert(
      'Close Registration',
      `Are you sure you want to close registration for "${league?.name}"?\n\nThis will finalize current entries and allow match schedule generation. Closing registration does not automatically generate matches.`,
      [
        { text: 'Keep Open', style: 'cancel' },
        {
          text: 'Close Registration',
          style: 'default',
          onPress: async () => {
            try {
              setIsOverflowOpen(false);
              await closeRegistration();
              handleRefreshAll();
              Alert.alert(
                'Registration Closed',
                `Registration has been closed for "${league?.name}". You may now generate regular-season matches in the Schedule tab.`
              );
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.detail || err?.message || 'Failed to close registration');
            }
          },
        },
      ]
    );
  };

  const handleConfirmStartLeague = () => {
    Alert.alert(
      'Start League Play',
      `Are you sure you want to start "${league?.name}"? This transitions the league to Live / In Progress.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start League',
          style: 'default',
          onPress: async () => {
            try {
              setIsOverflowOpen(false);
              await startLeague();
              handleRefreshAll();
              Alert.alert(
                'League Started!',
                `"${league?.name}" is now live! Week 1 matches can now be played and scored.`
              );
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.detail || err?.message || 'Failed to start league');
            }
          },
        },
      ]
    );
  };

  const handleGenerateSchedule = async (force: boolean = false) => {
    if (!force) {
      Alert.alert(
        'Generate Regular Season Matches',
        `This will create a round-robin schedule across all regular-season weeks for the ${teams?.length || 0} registered teams.\n\nPlayoff matches are separate and will NOT be generated now.\n\nDo you want to proceed?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Generate Matches',
            style: 'default',
            onPress: () => performGenerateSchedule(false),
          },
        ]
      );
      return;
    }
    performGenerateSchedule(true);
  };

  const performGenerateSchedule = async (force: boolean) => {
    try {
      setIsOverflowOpen(false);
      await generateSchedule(force);
      handleRefreshAll();
      Alert.alert(
        'Schedule Generated',
        'Regular season fixtures have been successfully generated across configured weeks. You can now assign dates and courts.'
      );
    } catch (err: any) {
      if (err?.response?.status === 409) {
        Alert.alert(
          'Regenerate Schedule?',
          'A schedule has already been generated. Regenerating will replace existing unplayed regular-season fixtures while preserving week dates.\n\nDo you want to proceed?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Regenerate',
              style: 'destructive',
              onPress: () => performGenerateSchedule(true),
            },
          ]
        );
      } else {
        Alert.alert('Error', err?.response?.data?.detail || err?.message || 'Failed to generate schedule');
      }
    }
  };

  const handleGeneratePlayoffs = async () => {
    Alert.alert(
      'Generate Playoff Matches',
      `All regular season matches are completed! This will generate single-elimination playoff brackets for the top ${league?.playoff_team_count || 4} qualifying teams based on finalized standings.\n\nProceed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate Playoffs',
          style: 'default',
          onPress: async () => {
            try {
              setIsOverflowOpen(false);
              await generatePlayoffs();
              handleRefreshAll();
              Alert.alert('Playoffs Generated', 'Championship playoff bracket has been established.');
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.detail || err?.message || 'Failed to generate playoffs');
            }
          },
        },
      ]
    );
  };

  const handleConfirmCompleteLeague = () => {
    Alert.alert(
      'Complete League',
      `Are you sure you want to mark "${league?.name}" as completed? This will finalize all standings, results, and crowned champions.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete League',
          style: 'default',
          onPress: async () => {
            try {
              setIsOverflowOpen(false);
              await completeLeague();
              handleRefreshAll();
              setActiveTab('results');
              Alert.alert(
                'League Completed!',
                `"${league?.name}" has been completed! Final standings and champion results are now locked.`
              );
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.detail || err?.message || 'Failed to complete league');
            }
          },
        },
      ]
    );
  };

  const handleConfirmCancelLeague = () => {
    Alert.alert(
      'Cancel League',
      `Are you sure you want to cancel "${league?.name}"? Existing records will be preserved for history.`,
      [
        { text: 'Keep League', style: 'cancel' },
        {
          text: 'Cancel League',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsOverflowOpen(false);
              await cancelLeague();
              handleRefreshAll();
              Alert.alert('League Cancelled', `"${league?.name}" has been marked as cancelled.`);
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.detail || err?.message || 'Failed to cancel league');
            }
          },
        },
      ]
    );
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

  const handleInlineSaveScore = async (match: LeagueMatch) => {
    const entered = inlineScores[match.id];
    const sA = entered ? parseInt(entered.a, 10) : match.score_a ?? NaN;
    const sB = entered ? parseInt(entered.b, 10) : match.score_b ?? NaN;

    if (isNaN(sA) || isNaN(sB) || sA < 0 || sB < 0) {
      Alert.alert('Invalid Score', 'Please enter valid non-negative numbers for both teams.');
      return;
    }
    if (sA === sB) {
      Alert.alert('Invalid Score', 'Ties are not allowed in pickleball. One team must win.');
      return;
    }
    const maxScore = Math.max(sA, sB);
    const minScore = Math.min(sA, sB);
    if (maxScore < 11 || maxScore - minScore < 2) {
      Alert.alert('Invalid Score', 'Winning score must be at least 11 and win by 2.');
      return;
    }

    try {
      setSavingScoreMatchId(match.id);
      if (match.status === 'completed') {
        await correctScore({ matchId: match.id, score_a: sA, score_b: sB });
      } else {
        await recordScore({ matchId: match.id, score_a: sA, score_b: sB });
      }
      handleRefreshAll();
      Alert.alert('Score Saved', `Score recorded: ${sA} - ${sB}`);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || err?.message || 'Failed to save score');
    } finally {
      setSavingScoreMatchId(null);
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
  const maxTeamsCount = league.max_teams || 8;
  const regPercent = maxTeamsCount > 0 ? Math.min(100, Math.round((teamCount / maxTeamsCount) * 100)) : 0;
  const statusBadge = getLeagueStatusBadgeDetails(league.status);

  const isSingles =
    (league.team_size ?? 2) === 1 ||
    (league.category?.toLowerCase().includes('singles') ?? false);
  const totalWeeks = league.total_weeks || league.number_of_weeks || 4;
  const hasPlayoffs = (league.playoff_team_count ?? 0) > 0;
  const playoffSpots = league.playoff_team_count || 4;

  // Subtitle string: "4 Wks | 8 Teams | Singles | Top 4 Playoffs"
  const subtitleText = `${totalWeeks} Wks | ${maxTeamsCount} ${isSingles ? 'Players' : 'Teams'} | ${isSingles ? 'Singles' : (league.category || 'Doubles')} | ${hasPlayoffs ? `Top ${playoffSpots} Playoffs` : 'Regular Season'}`;

  // Tab definitions (Exact required order: Overview & Rules, Players/Teams, Schedule, Standings, Playoffs, Results)
  const clubTabs = [
    { key: 'overview', label: 'Overview & Rules' },
    { key: 'teams', label: isSingles ? 'Players' : 'Teams' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'standings', label: 'Standings' },
    { key: 'playoffs', label: 'Playoffs' },
    { key: 'results', label: 'Results' },
  ] as const;

  // Registration closes calculation
  const regCloseDateStr = league.registration_close_at
    ? formatDate(league.registration_close_at)
    : 'May 15, 2026';
  let daysLeftText = '';
  if (league.registration_close_at) {
    const diffTime = new Date(league.registration_close_at).getTime() - Date.now();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > 0) {
      daysLeftText = `${diffDays} days left`;
    } else if (diffDays === 0) {
      daysLeftText = 'Closes today';
    } else {
      daysLeftText = 'Registration closed';
    }
  } else {
    daysLeftText = '3 days left';
  }

  // Filtered matches for Matches tab
  const filteredMatches = matches?.filter((m) => {
    if (!courtFilterId) return true;
    return m.court_id === courtFilterId;
  }) || [];

  // Results matches
  const resultsMatches = (allLeagueMatches || []).filter((m) => {
    if (resultStageFilter === 'playoffs') {
      return m.stage === 'playoffs';
    }
    if (resultWeekFilter !== 'all') {
      return m.stage === 'regular_season' && String(m.week_number) === resultWeekFilter;
    }
    return m.stage === 'regular_season';
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: '#FFFFFF' }]}>
      <ScrollView
        style={styles.mainScrollView}
        contentContainerStyle={styles.mainScrollContent}
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLeagueLoading || isMatchesLoading || isStandingsLoading || isTeamsLoading}
            onRefresh={handleRefreshAll}
            tintColor="#064E3B"
          />
        }
      >
        {/* ─── INDEX 0: NATURAL-SCROLLING HEADER & CARDS ─── */}
        <View style={styles.scrollHeaderWrapper}>
          <View style={styles.headerContainer}>
            <View style={styles.headerTopRow}>
              {/* Back button */}
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => router.back()}
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
                onPress={() => setIsOverflowOpen(true)}
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

          {/* ─── 2-COLUMN REGISTRATION SUMMARY CARD ─── */}
          <View style={styles.regStatsCard}>
            {/* Left Col: Teams/Players Registered */}
            <View style={styles.regStatCol}>
              <AppText style={styles.regStatLabel}>
                {isSingles ? 'Players Registered' : 'Teams Registered'}
              </AppText>
              <View style={styles.regStatValueRow}>
                <AppText style={styles.regStatValue}>
                  {teamCount} / {league.max_teams || 8}
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
                {league.status === 'registration_closed'
                  ? 'Registration Closed'
                  : 'Registration Closes'}
              </AppText>
              <AppText style={styles.regStatValueText}>{regCloseDateStr}</AppText>
              {daysLeftText ? (
                <AppText
                  style={[
                    styles.regStatDaysLeft,
                    league.status === 'registration_closed' && styles.regStatClosedText,
                  ]}
                >
                  {daysLeftText}
                </AppText>
              ) : null}
            </View>
          </View>

          {/* ─── COMPACT MANAGEMENT ACTIONS (TEAMS/PLAYERS TAB) ─── */}
          {activeTab === 'teams' && canManageLeague && (
            <View style={styles.managementActionsRow}>
              {league.status === 'registration_open' ? (
                <TouchableOpacity
                  style={styles.closeRegBtn}
                  onPress={handleConfirmCloseRegistration}
                  activeOpacity={0.8}
                  disabled={isActionProcessing}
                >
                  <AppText style={styles.closeRegBtnText}>Close Registration</AppText>
                </TouchableOpacity>
              ) : league.status === 'draft' ? (
                <TouchableOpacity
                  style={styles.closeRegBtn}
                  onPress={handlePublishLeague}
                  activeOpacity={0.8}
                  disabled={isActionProcessing}
                >
                  <AppText style={styles.closeRegBtnText}>Open Registration</AppText>
                </TouchableOpacity>
              ) : league.status === 'registration_closed' ? (
                <TouchableOpacity
                  style={styles.closeRegBtn}
                  onPress={handleConfirmStartLeague}
                  activeOpacity={0.8}
                  disabled={isActionProcessing}
                >
                  <AppText style={styles.closeRegBtnText}>Start League</AppText>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={styles.editLeagueBtn}
                onPress={() => setIsEditLeagueModalOpen(true)}
                activeOpacity={0.8}
              >
                <AppText style={styles.editLeagueBtnText}>Edit League</AppText>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ─── INDEX 1: STICKY NAVIGATION TABS WITH GREEN UNDERLINE ─── */}
        <View style={styles.stickyTabsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsStripScroll}
          >
            {clubTabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={styles.tabButton}
                  onPress={() => setActiveTab(tab.key)}
                  activeOpacity={0.7}
                >
                  <AppText style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>
                    {tab.label}
                  </AppText>
                  {isActive && <View style={styles.activeTabIndicator} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ─── INDEX 2: TAB BODY CONTENT ─── */}
        <View style={styles.tabBodyWrapper}>
          {/* ══════════════════════════════════════════════════════════════════════════
              TAB 1: OVERVIEW & RULES
             ══════════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'overview' && (
            <View style={styles.tabPane}>
              <PlayerLeagueOverviewTab league={league as any} />
            </View>
          )}

          {/* ══════════════════════════════════════════════════════════════════════════
              TAB 2: TEAMS / PLAYERS (SCREEN 2)
              - Heading: Teams/Players (N) + "Add Team/Player" action
              - Table Header: #, Team/Player Name, Players/Division, Avg Skill Level
              - Rows: #, Team/Player Name + subtitle, Players count, skill pill, chevron >
             ══════════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'teams' && (
            <View style={styles.tabPane}>
              <View style={styles.teamsCard}>
                {/* Teams Header */}
                <View style={styles.teamsHeaderRow}>
                  <AppText style={styles.teamsTitle}>
                    {isSingles ? 'Players' : 'Teams'} ({teams?.length ?? 0})
                  </AppText>
                  {canManageLeague &&
                  (league.status === 'draft' || league.status === 'registration_open') ? (
                    <TouchableOpacity
                      style={styles.addTeamButton}
                      onPress={() => {
                        setTeamName('');
                        setSelectedPlayerA('');
                        setSelectedPlayerB('');
                        setTeamError(null);
                        setIsAddTeamModalOpen(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <AppText style={styles.addTeamButtonText}>
                        {isSingles ? 'Add Player' : 'Add Team'}
                      </AppText>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Table Header */}
                <View style={styles.teamsTableHeader}>
                  <AppText style={styles.thNum}>#</AppText>
                  <AppText style={styles.thTeamName}>{isSingles ? 'Player Name' : 'Team Name'}</AppText>
                  <AppText style={styles.thPlayers}>{isSingles ? 'Division' : 'Players'}</AppText>
                  <AppText style={styles.thAvgSkill}>Avg Skill Level</AppText>
                  <View style={styles.thChevronSpacer} />
                </View>

              {/* Team Rows */}
              {isTeamsLoading ? (
                <View style={{ padding: Spacing[6] }}>
                  <LoadingState message={isSingles ? "Loading players..." : "Loading teams..."} />
                </View>
              ) : !teams || teams.length === 0 ? (
                <View style={styles.emptyTeamsBox}>
                  <AppText style={styles.emptyTeamsTitle}>
                    {isSingles ? 'No Players Registered Yet' : 'No Teams Registered Yet'}
                  </AppText>
                  <AppText style={styles.emptyTeamsSubtitle}>
                    {league.status === 'draft' || league.status === 'registration_open'
                      ? (isSingles ? 'Add players or wait for player registration.' : 'Add teams or wait for player registration.')
                      : (isSingles ? 'No players entered for this league.' : 'No teams entered for this league.')}
                  </AppText>
                </View>
              ) : (
                teams.map((team, index) => {
                  const rating = team.avg_skill_level ?? 3.5;
                  const playerCount = team.members?.length ?? 1;

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
                      {/* # Number */}
                      <AppText style={styles.tdNum}>{index + 1}</AppText>

                      {/* Team Name + Player subtitle */}
                      <View style={styles.tdTeamCol}>
                        <AppText style={styles.tdTeamName} numberOfLines={1}>
                          {team.name}
                        </AppText>
                        {!isSingles && (
                          <AppText style={styles.tdTeamSubtitle}>
                            {team.members && team.members.length > 0
                              ? team.members.map((m) => m.display_name || m.user?.full_name || m.user?.display_name || 'Player').join(' & ')
                              : (playerCount === 1 ? '1 player' : `${playerCount} players`)}
                          </AppText>
                        )}
                      </View>

                      {/* Players count or Division */}
                      <View style={styles.tdPlayersCol}>
                        <AppText style={styles.tdPlayersCount}>
                          {isSingles ? ((league as any).division || (league as any).skill_level || 'Singles') : playerCount}
                        </AppText>
                      </View>

                      {/* Avg Skill Level Blue Pill */}
                      <View style={styles.tdSkillCol}>
                        <View style={styles.skillPillBlue}>
                          <AppText style={styles.skillPillTextBlue}>
                            {rating.toFixed(1)}
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
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 2: SCHEDULE (SCREENS 3 & 4)
            - Screen 3 (No Schedule): Compact card, checklist, green Generate Matches button, info callout
            - Screen 4 (Schedule Exists): Week 1 Schedule header, Week Date card, match cards,
              Edit Week Dates outline button
           ══════════════════════════════════════════════════════════════════════════ */}
        {(activeTab === 'schedule' || activeTab === 'matches') && (
          <View style={styles.tabPane}>
            {/* Week Selector */}
            <View style={styles.weekSelectorContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.weekSelectorScroll}
              >
                {regularWeeks && regularWeeks.length > 0
                  ? regularWeeks.map((w: LeagueWeek) => {
                      const isSelected =
                        selectedWeekId !== 'all' &&
                        (selectedWeekId === w.id || (!selectedWeekId && activeWeek?.id === w.id));
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
                              isSelected ? styles.weekPillTextSelected : styles.weekPillTextUnselected,
                            ]}
                          >
                            Week {w.week_number}
                          </AppText>
                        </TouchableOpacity>
                      );
                    })
                  : Array.from({
                      length: Math.max(1, (league.number_of_weeks || 4) - (league.playoff_team_count > 0 ? 1 : 0)),
                    }).map((_, idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.weekPill,
                          idx === 0 ? styles.weekPillSelected : styles.weekPillUnselected,
                        ]}
                      >
                        <AppText
                          style={[
                            styles.weekPillText,
                            idx === 0 ? styles.weekPillTextSelected : styles.weekPillTextUnselected,
                          ]}
                        >
                          Week {idx + 1}
                        </AppText>
                      </View>
                    ))}

                {/* Dropdown filter on Match Scores: "All Courts ▾" */}
                {scheduleSubView === 'scores' && (
                  <TouchableOpacity
                    style={styles.courtFilterPill}
                    onPress={() => {
                      const courtIds = clubCourts?.map((c) => c.id) || [];
                      if (!courtFilterId) {
                        setCourtFilterId(courtIds[0] || null);
                      } else {
                        const currentIdx = courtIds.indexOf(courtFilterId);
                        if (currentIdx === courtIds.length - 1) {
                          setCourtFilterId(null);
                        } else {
                          setCourtFilterId(courtIds[currentIdx + 1]);
                        }
                      }
                    }}
                  >
                    <AppText style={styles.courtFilterPillText}>
                      {courtFilterId
                        ? clubCourts?.find((c) => c.id === courtFilterId)?.display_name || clubCourts?.find((c) => c.id === courtFilterId)?.name || 'Court'
                        : 'All Courts'}{' '}
                      ▾
                    </AppText>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>

            {!hasSchedule ? (
              /* SCREEN 3: NO SCHEDULE GENERATED CARD */
              <View style={styles.noScheduleCard}>
                <AppText style={styles.noScheduleTitle}>No Schedule Generated</AppText>
                <AppText style={styles.noScheduleSubtitle}>
                  Registration is closed. Generate matches to create the regular season schedule across all {league.number_of_weeks || 4} weeks.
                </AppText>

                <View style={styles.scheduleChecklist}>
                  <View style={styles.checkItemRow}>
                    <CheckCircle2 size={16} color="#15803D" strokeWidth={2.2} />
                    <AppText style={styles.checkItemText}>
                      {teamCount} {isSingles ? 'players' : 'teams'} registered
                    </AppText>
                  </View>
                  <View style={styles.checkItemRow}>
                    <CheckCircle2 size={16} color="#15803D" strokeWidth={2.2} />
                    <AppText style={styles.checkItemText}>
                      {league.number_of_weeks || 4} weeks configured ({regularWeeks.length || (league.number_of_weeks || 4) - 1} regular + {league.playoff_team_count > 0 ? '1 playoffs' : '0 playoffs'})
                    </AppText>
                  </View>
                  <View style={styles.checkItemRow}>
                    <CheckCircle2 size={16} color="#15803D" strokeWidth={2.2} />
                    <AppText style={styles.checkItemText}>
                      Round-robin matches will be generated
                    </AppText>
                  </View>
                </View>

                {canManageLeague && (
                  <TouchableOpacity
                    style={styles.generateMatchesButton}
                    onPress={() => handleGenerateSchedule(false)}
                    disabled={isGeneratingSchedule}
                    activeOpacity={0.8}
                  >
                    <AppText style={styles.generateMatchesButtonText}>
                      {isGeneratingSchedule ? 'Generating Matches...' : 'Generate Matches'}
                    </AppText>
                  </TouchableOpacity>
                )}

                <View style={styles.infoNoticeBox}>
                  <AppText style={styles.infoNoticeText}>
                    This will create all regular season matches across Week 1 to Week {regularWeeks.length || (league.number_of_weeks || 4) - 1} (Week {league.number_of_weeks || 4} is for playoffs). You can assign dates and courts after generation.
                  </AppText>
                </View>
              </View>
            ) : (
              <View>
                {/* Mode toggle: Fixtures & Times vs Match Scores */}
                <View style={styles.scheduleViewModeRow}>
                  <TouchableOpacity
                    style={[
                      styles.scheduleViewModeBtn,
                      scheduleSubView === 'fixtures' && styles.scheduleViewModeBtnActive,
                    ]}
                    onPress={() => setScheduleSubView('fixtures')}
                    activeOpacity={0.8}
                  >
                    <AppText
                      style={[
                        styles.scheduleViewModeText,
                        scheduleSubView === 'fixtures' && styles.scheduleViewModeTextActive,
                      ]}
                    >
                      Fixtures & Times
                    </AppText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.scheduleViewModeBtn,
                      scheduleSubView === 'scores' && styles.scheduleViewModeBtnActive,
                    ]}
                    onPress={() => setScheduleSubView('scores')}
                    activeOpacity={0.8}
                  >
                    <AppText
                      style={[
                        styles.scheduleViewModeText,
                        scheduleSubView === 'scores' && styles.scheduleViewModeTextActive,
                      ]}
                    >
                      Match Scores
                    </AppText>
                  </TouchableOpacity>
                </View>

                {scheduleSubView === 'fixtures' ? (
                  /* SCREEN 4: SCHEDULE GENERATED */
              <View style={styles.scheduleContent}>
                {/* Week Header Row */}
                <View style={styles.weekHeaderRow}>
                  <AppText style={styles.weekScheduleTitle}>
                    Week {activeWeek?.week_number || 1} Schedule
                  </AppText>
                  <AppText style={styles.weekMatchCountText}>
                    {matches?.length || 0} Matches
                  </AppText>
                </View>

                {/* Week Date (Optional) Card */}
                <View style={styles.weekDateCard}>
                  <View style={styles.weekDateLeft}>
                    <Calendar size={18} color="#6B7280" />
                    <View>
                      <AppText style={styles.weekDateLabel}>Week Date (Optional)</AppText>
                      <AppText style={styles.weekDateValue}>
                        {activeWeek?.start_date ? formatDate(activeWeek.start_date) : 'May 6, 2026'}
                      </AppText>
                    </View>
                  </View>
                  {canManageLeague && activeWeek && (
                    <TouchableOpacity
                      style={styles.weekDateEditBtn}
                      onPress={() => openWeekDatesModal(activeWeek)}
                    >
                      <AppText style={styles.weekDateEditBtnText}>Edit</AppText>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Match Cards List */}
                <View style={styles.matchesList}>
                  {matches?.map((m) => {
                    const initialsA = getTeamInitials(m.team_a_name || m.team_a?.name || 'A');
                    const initialsB = getTeamInitials(m.team_b_name || m.team_b?.name || 'B');
                    const teamAIndex = teams?.findIndex((t) => t.id === m.team_a_id) ?? 0;
                    const teamBIndex = teams?.findIndex((t) => t.id === m.team_b_id) ?? 1;
                    const avatarA = getAvatarColors(teamAIndex >= 0 ? teamAIndex : 0);
                    const avatarB = getAvatarColors(teamBIndex >= 0 ? teamBIndex : 1);
                    const ratingA = teams?.find((t) => t.id === m.team_a_id)?.avg_skill_level ?? 3.8;
                    const ratingB = teams?.find((t) => t.id === m.team_b_id)?.avg_skill_level ?? 3.5;

                    const timeStr = m.scheduled_start_at
                      ? new Date(m.scheduled_start_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                      : '6:00 PM';
                    const courtStr = getCourtDisplayLabel(
                      m.court_name || m.court_number ? m : clubCourts?.find((c) => c.id === m.court_id) || m,
                      { unassignedLabel: 'Court not assigned' }
                    );
                    const dateStr = m.scheduled_start_at
                      ? formatDateTime(m.scheduled_start_at)
                      : activeWeek?.start_date
                      ? `${formatDate(activeWeek.start_date)} • ${timeStr}`
                      : `May 6, 2026 • ${timeStr}`;

                    return (
                      <TouchableOpacity
                        key={m.id}
                        style={styles.screen4MatchCard}
                        onPress={() => canManageLeague && openScheduleModal(m)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.screen4MatchTopRow}>
                          {/* Left Col: Match X, Time, Court */}
                          <View style={styles.screen4MatchLeftCol}>
                            <AppText style={styles.screen4MatchNum}>Match {m.match_number}</AppText>
                            <AppText style={styles.screen4MatchTime}>{timeStr}</AppText>
                            <AppText style={styles.screen4MatchCourt}>{courtStr}</AppText>
                          </View>

                          {/* Right Col: Team A vs Team B with avatars and ratings */}
                          <View style={styles.screen4MatchupCol}>
                            <View style={styles.matchupTeamRow}>
                              <View style={[styles.miniAvatar, { backgroundColor: avatarA.bg }]}>
                                <AppText style={[styles.miniAvatarText, { color: avatarA.text }]}>{initialsA}</AppText>
                              </View>
                              <AppText style={styles.matchupTeamName} numberOfLines={1}>
                                {m.team_a_name || m.team_a?.name || 'Alpha Aces'}
                              </AppText>
                              <AppText style={styles.matchupRating}>{ratingA.toFixed(1)}</AppText>
                            </View>

                            <AppText style={styles.matchupVsText}>vs</AppText>

                            <View style={styles.matchupTeamRow}>
                              <View style={[styles.miniAvatar, { backgroundColor: avatarB.bg }]}>
                                <AppText style={[styles.miniAvatarText, { color: avatarB.text }]}>{initialsB}</AppText>
                              </View>
                              <AppText style={styles.matchupTeamName} numberOfLines={1}>
                                {m.team_b_name || m.team_b?.name || (m.is_bye ? 'BYE' : 'Beta Blasters')}
                              </AppText>
                              {!m.is_bye && <AppText style={styles.matchupRating}>{ratingB.toFixed(1)}</AppText>}
                            </View>
                          </View>

                          {/* Chevron Right */}
                          <ChevronRight size={18} color="#9CA3AF" />
                        </View>

                        {/* Bottom Date Row */}
                        <View style={styles.screen4MatchDateRow}>
                          <Calendar size={13} color="#6B7280" />
                          <AppText style={styles.screen4MatchDateText}>{dateStr}</AppText>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Edit Week Dates Button at bottom */}
                {canManageLeague && activeWeek && (
                  <TouchableOpacity
                    style={styles.editWeekDatesOutlineBtn}
                    onPress={() => openWeekDatesModal(activeWeek)}
                    activeOpacity={0.8}
                  >
                    <Calendar size={16} color="#111827" />
                    <AppText style={styles.editWeekDatesOutlineBtnText}>
                      Edit Week {activeWeek.week_number} Dates
                    </AppText>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              /* SCREEN 5: MATCH SCORES */
              <View style={styles.scheduleContent}>
                {/* Week Matches Header */}
                <View style={styles.weekHeaderRow}>
                  <AppText style={styles.weekScheduleTitle}>
                    Week {activeWeek?.week_number || 1} Matches
                  </AppText>
                  <AppText style={styles.weekMatchCountText}>
                    {filteredMatches.length} Matches
                  </AppText>
                </View>

                {/* Match Cards List */}
                <View style={styles.matchesList}>
                  {filteredMatches.map((m, idx) => {
                    const initialsA = getTeamInitials(m.team_a_name || m.team_a?.name || 'A');
                    const initialsB = getTeamInitials(m.team_b_name || m.team_b?.name || 'B');
                    const teamAIndex = teams?.findIndex((t) => t.id === m.team_a_id) ?? 0;
                    const teamBIndex = teams?.findIndex((t) => t.id === m.team_b_id) ?? 1;
                    const avatarA = getAvatarColors(teamAIndex >= 0 ? teamAIndex : 0);
                    const avatarB = getAvatarColors(teamBIndex >= 0 ? teamBIndex : 1);
                    const ratingA = teams?.find((t) => t.id === m.team_a_id)?.avg_skill_level ?? 3.8;
                    const ratingB = teams?.find((t) => t.id === m.team_b_id)?.avg_skill_level ?? 3.5;

                    const timeStr = m.scheduled_start_at
                      ? new Date(m.scheduled_start_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                      : idx === 0 ? '6:00 PM' : idx === 1 ? '7:00 PM' : '8:00 PM';
                    const courtStr = getCourtDisplayLabel(
                      m.court_name || m.court_number ? m : clubCourts?.find((c) => c.id === m.court_id) || m,
                      { unassignedLabel: 'Court not assigned' }
                    );
                    const dateStr = m.scheduled_start_at
                      ? formatDateTime(m.scheduled_start_at)
                      : `May 6, 2026 • ${timeStr}`;

                    // Status pill config
                    const isCompleted = m.status === 'completed';
                    const isInProgress = m.status === 'in_progress';
                    const isScheduled = Boolean(m.court_id && m.scheduled_start_at);

                    let statusLabel = 'Not Started';
                    let statusBg = '#F3F4F6';
                    let statusText = '#4B5563';

                    if (isCompleted) {
                      statusLabel = '✓ Completed';
                      statusBg = '#DCFCE7';
                      statusText = '#15803D';
                    } else if (isInProgress) {
                      statusLabel = '● In Progress';
                      statusBg = '#FEF3C7';
                      statusText = '#D97706';
                    } else if (isScheduled) {
                      statusLabel = '✓ Scheduled';
                      statusBg = '#E0F2FE';
                      statusText = '#0284C7';
                    }

                    // Score input values
                    const currentInline = inlineScores[m.id] || {
                      a: m.score_a !== null ? String(m.score_a) : '',
                      b: m.score_b !== null ? String(m.score_b) : '',
                    };

                    return (
                      <View key={m.id} style={styles.screen5MatchCard}>
                        {/* Top Row: Left match meta + Right status badge */}
                        <View style={styles.screen5TopRow}>
                          <View style={styles.screen4MatchLeftCol}>
                            <AppText style={styles.screen4MatchNum}>Match {m.match_number}</AppText>
                            <AppText style={styles.screen4MatchTime}>{timeStr}</AppText>
                            <AppText style={styles.screen4MatchCourt}>{courtStr}</AppText>
                          </View>

                          <View style={[styles.screen5StatusBadge, { backgroundColor: statusBg }]}>
                            <AppText style={[styles.screen5StatusText, { color: statusText }]}>
                              {statusLabel}
                            </AppText>
                          </View>
                        </View>

                        {/* Matchup row */}
                        <TouchableOpacity
                          style={styles.screen5MatchupRow}
                          onPress={() => canManageLeague && openScoreModal(m)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.screen4MatchupCol}>
                            <View style={styles.matchupTeamRow}>
                              <View style={[styles.miniAvatar, { backgroundColor: avatarA.bg }]}>
                                <AppText style={[styles.miniAvatarText, { color: avatarA.text }]}>{initialsA}</AppText>
                              </View>
                              <AppText style={styles.matchupTeamName} numberOfLines={1}>
                                {m.team_a_name || m.team_a?.name || 'Alpha Aces'}
                              </AppText>
                              <AppText style={styles.matchupRating}>{ratingA.toFixed(1)}</AppText>
                            </View>

                            <AppText style={styles.matchupVsText}>vs</AppText>

                            <View style={styles.matchupTeamRow}>
                              <View style={[styles.miniAvatar, { backgroundColor: avatarB.bg }]}>
                                <AppText style={[styles.miniAvatarText, { color: avatarB.text }]}>{initialsB}</AppText>
                              </View>
                              <AppText style={styles.matchupTeamName} numberOfLines={1}>
                                {m.team_b_name || m.team_b?.name || (m.is_bye ? 'BYE' : 'Beta Blasters')}
                              </AppText>
                              {!m.is_bye && <AppText style={styles.matchupRating}>{ratingB.toFixed(1)}</AppText>}
                            </View>
                          </View>

                          <ChevronRight size={18} color="#9CA3AF" />
                        </TouchableOpacity>

                        {/* Bottom Date Row (if not in progress score editing) */}
                        {!isInProgress && (
                          <View style={styles.screen4MatchDateRow}>
                            <Calendar size={13} color="#6B7280" />
                            <AppText style={styles.screen4MatchDateText}>{dateStr}</AppText>
                          </View>
                        )}

                        {/* Inline Score Entry Row (when in progress or completed) */}
                        {canManageLeague && (isInProgress || isCompleted) && (
                          <View style={styles.inlineScoreRow}>
                            <TextInput
                              style={styles.inlineScoreInput}
                              keyboardType="numeric"
                              value={currentInline.a}
                              placeholder="11"
                              placeholderTextColor="#9CA3AF"
                              onChangeText={(val) =>
                                setInlineScores((prev) => ({
                                  ...prev,
                                  [m.id]: { ...currentInline, a: val },
                                }))
                              }
                            />
                            <AppText style={styles.inlineScoreDash}>-</AppText>
                            <TextInput
                              style={styles.inlineScoreInput}
                              keyboardType="numeric"
                              value={currentInline.b}
                              placeholder="9"
                              placeholderTextColor="#9CA3AF"
                              onChangeText={(val) =>
                                setInlineScores((prev) => ({
                                  ...prev,
                                  [m.id]: { ...currentInline, b: val },
                                }))
                              }
                            />
                            <TouchableOpacity
                              style={styles.inlineSaveScoreBtn}
                              onPress={() => handleInlineSaveScore(m)}
                              disabled={savingScoreMatchId === m.id}
                            >
                              <AppText style={styles.inlineSaveScoreBtnText}>
                                {savingScoreMatchId === m.id ? 'Saving...' : 'Save Score'}
                              </AppText>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 4: STANDINGS (SCREEN 6)
            - Current Standings ⓘ header with Regular Season pill
            - Table: #, Team, MP, W, L, +/-, Pts
            - Bottom info note
            - Strictly NO premature "Playoff Seed #1" badges during regular season
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'standings' && (
          <View style={styles.tabPane}>
            {/* Header row */}
            <View style={styles.standingsHeaderRow}>
              <View style={styles.standingsHeaderLeft}>
                <AppText style={styles.standingsTitle}>Current Standings</AppText>
                <Info size={16} color="#6B7280" />
              </View>
              <View style={styles.regularSeasonPill}>
                <AppText style={styles.regularSeasonPillText}>✓ Regular Season</AppText>
              </View>
            </View>

            {/* Standings Table Card */}
            {isStandingsLoading ? (
              <LoadingState message="Calculating standings..." />
            ) : !standingsData || standingsData.standings.length === 0 ? (
              <EmptyState
                title="No Standings Data"
                description="Standings will update automatically as weekly match scores are entered."
              />
            ) : (
              <View style={styles.standingsCard}>
                {/* Table Header */}
                <View style={styles.standingsTableHeader}>
                  <AppText style={[styles.sTh, styles.sThRank]}>#</AppText>
                  <AppText style={[styles.sTh, styles.sThTeam]}>{isSingles ? 'Player' : 'Team'}</AppText>
                  <AppText style={[styles.sTh, styles.sThStat]}>MP</AppText>
                  <AppText style={[styles.sTh, styles.sThStat]}>W</AppText>
                  <AppText style={[styles.sTh, styles.sThStat]}>L</AppText>
                  <AppText style={[styles.sTh, styles.sThStat]}>+/-</AppText>
                  <AppText style={[styles.sTh, styles.sThStat, styles.sThPts]}>Pts</AppText>
                </View>

                {/* Table Rows */}
                {standingsData.standings.map((row, idx) => {
                  const avatarColors = getAvatarColors(idx);
                  const initials = getTeamInitials(row.team_name);
                  const pts = ((row as any).points ?? row.wins * 2);
                  const diffStr =
                    row.points_differential > 0
                      ? `+${row.points_differential}`
                      : `${row.points_differential}`;

                  return (
                    <View
                      key={row.team_id}
                      style={[
                        styles.standingsTableRow,
                        idx === standingsData.standings.length - 1 && styles.standingsTableRowLast,
                      ]}
                    >
                      {/* Rank # */}
                      <AppText style={[styles.sTd, styles.sThRank, styles.sRankBold]}>
                        {row.rank}
                      </AppText>

                      {/* Team Avatar + Name */}
                      <View style={[styles.sThTeam, styles.sTeamCol]}>
                        <View style={[styles.standingsAvatar, { backgroundColor: avatarColors.bg }]}>
                          <AppText style={[styles.standingsAvatarText, { color: avatarColors.text }]}>
                            {initials}
                          </AppText>
                        </View>
                        <AppText style={styles.sTeamName} numberOfLines={1}>
                          {row.team_name}
                        </AppText>
                      </View>

                      {/* MP */}
                      <AppText style={[styles.sTd, styles.sThStat]}>{row.matches_played}</AppText>
                      {/* W */}
                      <AppText style={[styles.sTd, styles.sThStat]}>{row.wins}</AppText>
                      {/* L */}
                      <AppText style={[styles.sTd, styles.sThStat]}>{row.losses}</AppText>
                      {/* +/- */}
                      <AppText style={[styles.sTd, styles.sThStat]}>{diffStr}</AppText>
                      {/* Pts */}
                      <AppText style={[styles.sTd, styles.sThStat, styles.sPtsBold]}>
                        {pts}
                      </AppText>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Bottom info note matching Screen 6 */}
            <View style={styles.standingsInfoNotice}>
              <Info size={16} color="#0284C7" style={{ marginTop: 2 }} />
              <AppText style={styles.standingsInfoNoticeText}>
                Top {league.playoff_team_count || 4} {isSingles ? 'players' : 'teams'} will advance to the playoffs after the regular season is completed. Playoff seeding will be determined based on final standings and tiebreaker rules.
              </AppText>
            </View>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 5: PLAYOFFS (SCREEN 7)
            - Gold trophy icon in circular box
            - Heading: Playoffs Not Available Yet
            - Subtitle: Playoffs will be generated after all regular season matches are completed
            - Regular Season Progress card with progress bar + 33%
            - Disabled button: Generate Playoff Matches (enabled when 100% complete)
            - Checklist with green checkmarks
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'playoffs' && (
          <View style={styles.tabPane}>
            {!playoffs ? (
              <View style={styles.playoffsNotAvailableContainer}>
                {/* Gold Trophy Circle */}
                <View style={styles.playoffTrophyCircle}>
                  <Trophy size={36} color="#D97706" />
                </View>

                <AppText style={styles.playoffsNotAvailableTitle}>
                  {isRegularSeasonComplete
                    ? 'Regular Season Complete!'
                    : 'Playoffs Not Available Yet'}
                </AppText>
                <AppText style={styles.playoffsNotAvailableSubtitle}>
                  {isRegularSeasonComplete
                    ? `All ${totalRegularMatchesCount} regular season matches are finished. Generate the playoff bracket to begin championship rounds.`
                    : 'Playoffs will be generated after all regular season matches are completed.'}
                </AppText>

                {/* Regular Season Progress Card */}
                <View style={styles.playoffProgressCard}>
                  <View style={styles.playoffProgressHeader}>
                    <AppText style={styles.playoffProgressTitle}>Regular Season Progress</AppText>
                    <AppText style={styles.playoffProgressPercent}>
                      {regularProgressPercent}%
                    </AppText>
                  </View>

                  <AppText style={styles.playoffProgressCount}>
                    {completedRegularMatchesCount} / {totalRegularMatchesCount || 18} matches completed
                  </AppText>

                  {/* Progress Bar */}
                  <View style={styles.playoffProgressBarTrack}>
                    <View
                      style={[
                        styles.playoffProgressBarFill,
                        {
                          width: `${regularProgressPercent}%`,
                          backgroundColor: isRegularSeasonComplete ? '#059669' : '#10B981',
                        },
                      ]}
                    />
                  </View>

                  {/* Action Button: Generate Playoff Matches */}
                  {canManageLeague && (
                    <TouchableOpacity
                      style={[
                        styles.generatePlayoffBtn,
                        isRegularSeasonComplete
                          ? styles.generatePlayoffBtnActive
                          : styles.generatePlayoffBtnDisabled,
                      ]}
                      onPress={handleGeneratePlayoffs}
                      disabled={!isRegularSeasonComplete || isGeneratingPlayoffs}
                      activeOpacity={0.8}
                    >
                      <AppText
                        style={[
                          styles.generatePlayoffBtnText,
                          isRegularSeasonComplete
                            ? styles.generatePlayoffBtnTextActive
                            : styles.generatePlayoffBtnTextDisabled,
                        ]}
                      >
                        {isGeneratingPlayoffs ? 'Generating...' : 'Generate Playoff Matches'}
                      </AppText>
                    </TouchableOpacity>
                  )}

                  {/* Checklist */}
                  <View style={styles.playoffChecklist}>
                    <View style={styles.checkItemRow}>
                      <CheckCircle2
                        size={16}
                        color={isRegularSeasonComplete ? '#059669' : '#9CA3AF'}
                      />
                      <AppText style={styles.checkItemText}>
                        Complete all regular season matches
                      </AppText>
                    </View>
                    <View style={styles.checkItemRow}>
                      <CheckCircle2
                        size={16}
                        color={isRegularSeasonComplete ? '#059669' : '#9CA3AF'}
                      />
                      <AppText style={styles.checkItemText}>
                        Final standings will determine top {league.playoff_team_count || 4} teams
                      </AppText>
                    </View>
                    <View style={styles.checkItemRow}>
                      <CheckCircle2
                        size={16}
                        color={isRegularSeasonComplete ? '#059669' : '#9CA3AF'}
                      />
                      <AppText style={styles.checkItemText}>
                        Then you can generate the playoff bracket
                      </AppText>
                    </View>
                  </View>
                </View>
              </View>
            ) : (
              /* Playoff Bracket View */
              <View style={styles.scheduleContent}>
                <Card style={styles.playoffActiveCard}>
                  <View style={styles.playoffActiveHeader}>
                    <Trophy size={22} color="#15803D" />
                    <AppText style={styles.playoffActiveTitle}>Championship Bracket Active</AppText>
                  </View>
                  <AppText style={styles.playoffActiveDetails}>
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

                {/* Button to view playoff matches */}
                <TouchableOpacity
                  style={styles.viewPlayoffMatchesBtn}
                  onPress={() => {
                    const playoffWeek = weeks?.find((w) => w.week_type === 'playoffs');
                    if (playoffWeek) setSelectedWeekId(playoffWeek.id);
                    setActiveTab('matches');
                  }}
                  activeOpacity={0.8}
                >
                  <AppText style={styles.viewPlayoffMatchesBtnText}>
                    View Playoff Matches in Matches Tab
                  </AppText>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 6: RESULTS (SCREEN 8)
            - Dropdowns: Regular Season ▾ & Week 1 ▾
            - Heading: Regular Season Results
            - Completed Match Cards with Match 1 • May 6, 2026 • 6:00 PM • Court 1 & ✓ Completed badge
            - Scores: AA Alpha Aces 11 - 9 BB Beta Blasters
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'results' && (
          <View style={styles.tabPane}>
            {/* Filter Dropdowns Row */}
            <View style={styles.resultsFiltersRow}>
              <TouchableOpacity
                style={styles.resultsFilterBtn}
                onPress={() =>
                  setResultStageFilter((prev) =>
                    prev === 'regular_season' ? 'playoffs' : 'regular_season'
                  )
                }
              >
                <AppText style={styles.resultsFilterBtnText}>
                  {resultStageFilter === 'regular_season' ? 'Regular Season' : 'Playoffs'} ▾
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.resultsFilterBtn}
                onPress={() => {
                  if (resultWeekFilter === 'all') {
                    setResultWeekFilter('1');
                  } else {
                    const nextWeek = parseInt(resultWeekFilter, 10) + 1;
                    if (nextWeek > (regularWeeks.length || 4)) {
                      setResultWeekFilter('all');
                    } else {
                      setResultWeekFilter(String(nextWeek));
                    }
                  }
                }}
              >
                <AppText style={styles.resultsFilterBtnText}>
                  {resultWeekFilter === 'all' ? 'All Weeks' : `Week ${resultWeekFilter}`} ▾
                </AppText>
              </TouchableOpacity>
            </View>

            {/* Results Heading */}
            <View style={styles.weekHeaderRow}>
              <AppText style={styles.weekScheduleTitle}>
                {resultStageFilter === 'playoffs' ? 'Playoff Results' : 'Regular Season Results'}
              </AppText>
            </View>

            {/* Completed Match Cards List */}
            {resultsMatches.length === 0 ? (
              <EmptyState
                title="No Completed Matches"
                description="Match results will appear here once games have been scored and completed."
              />
            ) : (
              <View style={styles.matchesList}>
                {resultsMatches.map((m, idx) => {
                  const initialsA = getTeamInitials(m.team_a_name || m.team_a?.name || 'A');
                  const initialsB = getTeamInitials(m.team_b_name || m.team_b?.name || 'B');
                  const teamAIndex = teams?.findIndex((t) => t.id === m.team_a_id) ?? 0;
                  const teamBIndex = teams?.findIndex((t) => t.id === m.team_b_id) ?? 1;
                  const avatarA = getAvatarColors(teamAIndex >= 0 ? teamAIndex : 0);
                  const avatarB = getAvatarColors(teamBIndex >= 0 ? teamBIndex : 1);

                  const isCompleted = m.status === 'completed';
                  const timeStr = m.scheduled_start_at
                    ? new Date(m.scheduled_start_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                    : idx === 0 ? '6:00 PM' : idx === 1 ? '7:00 PM' : '8:00 PM';
                  const courtStr = getCourtDisplayLabel(
                    m.court_name || m.court_number ? m : clubCourts?.find((c) => c.id === m.court_id) || m,
                    { unassignedLabel: 'Court not assigned' }
                  );
                  const dateLine = `Match ${m.match_number} • May 6, 2026 • ${timeStr} • ${courtStr}`;

                  return (
                    <View key={m.id} style={styles.screen8MatchCard}>
                      {/* Top Header Line */}
                      <View style={styles.screen8TopRow}>
                        <AppText style={styles.screen8DateText} numberOfLines={1}>
                          {dateLine}
                        </AppText>
                        <View
                          style={[
                            styles.screen8Badge,
                            isCompleted ? styles.screen8BadgeCompleted : styles.screen8BadgeScheduled,
                          ]}
                        >
                          <AppText
                            style={[
                              styles.screen8BadgeText,
                              isCompleted
                                ? styles.screen8BadgeTextCompleted
                                : styles.screen8BadgeTextScheduled,
                            ]}
                          >
                            {isCompleted ? '✓ Completed' : '✓ Scheduled'}
                          </AppText>
                        </View>
                      </View>

                      {/* Scores & Matchup Row */}
                      <View style={styles.screen8MatchupRow}>
                        {/* Team A */}
                        <View style={styles.screen8TeamBlock}>
                          <View style={[styles.miniAvatar, { backgroundColor: avatarA.bg }]}>
                            <AppText style={[styles.miniAvatarText, { color: avatarA.text }]}>{initialsA}</AppText>
                          </View>
                          <AppText style={styles.screen8TeamName} numberOfLines={1}>
                            {m.team_a_name || m.team_a?.name || 'Alpha Aces'}
                          </AppText>
                        </View>

                        {/* Scores */}
                        <View style={styles.screen8ScoresBlock}>
                          <AppText style={styles.screen8ScoreDigit}>
                            {m.score_a !== null ? m.score_a : '-'}
                          </AppText>
                          <AppText style={styles.screen8ScoreSeparator}>-</AppText>
                          <AppText style={styles.screen8ScoreDigit}>
                            {m.score_b !== null ? m.score_b : '-'}
                          </AppText>
                        </View>

                        {/* Team B */}
                        <View style={[styles.screen8TeamBlock, styles.screen8TeamBlockRight]}>
                          <AppText style={[styles.screen8TeamName, { textAlign: 'right' }]} numberOfLines={1}>
                            {m.team_b_name || m.team_b?.name || (m.is_bye ? 'BYE' : 'Beta Blasters')}
                          </AppText>
                          <View style={[styles.miniAvatar, { backgroundColor: avatarB.bg }]}>
                            <AppText style={[styles.miniAvatarText, { color: avatarB.text }]}>{initialsB}</AppText>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Champion Crowning or Finalize League Banner */}
            {canManageLeague && league.status !== 'completed' && isRegularSeasonComplete && (
              <View style={styles.finalizeLeagueBox}>
                <TouchableOpacity
                  style={styles.finalizeLeagueBtn}
                  onPress={handleConfirmCompleteLeague}
                  disabled={isCompletingLeague}
                >
                  <AppText style={styles.finalizeLeagueBtnText}>
                    {isCompletingLeague ? 'Finalizing...' : 'Finalize & Complete League'}
                  </AppText>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        </View>
      </ScrollView>

      {/* ─── MODAL: LIFECYCLE OVERFLOW ACTIONS (⋮) ─── */}
      <LeagueOptionsMenuModal
        visible={isOverflowOpen}
        onClose={() => setIsOverflowOpen(false)}
        league={league}
        canManage={canManageLeague}
        isProcessing={isActionProcessing}
        onPublishPress={handlePublishLeague}
        onCloseRegistrationPress={handleConfirmCloseRegistration}
        onStartLeaguePress={handleConfirmStartLeague}
        onGenerateSchedulePress={() => handleGenerateSchedule(false)}
        onGeneratePlayoffsPress={handleGeneratePlayoffs}
        onCompletePress={handleConfirmCompleteLeague}
        onViewResultsPress={() => {
          setIsOverflowOpen(false);
          setActiveTab('results');
        }}
        onManagePress={() => {
          setIsOverflowOpen(false);
          setActiveTab('teams');
        }}
        onEditLeaguePress={() => {
          setIsOverflowOpen(false);
          setIsEditLeagueModalOpen(true);
        }}
        onCancelPress={handleConfirmCancelLeague}
      />

      {/* ─── MODAL: EDIT LEAGUE ─── */}
      <CreateLeagueModal
        visible={isEditLeagueModalOpen}
        onClose={() => setIsEditLeagueModalOpen(false)}
        onSubmit={async () => {}}
        isCreating={false}
        clubId={clubId}
        leagueToEdit={league}
        onUpdate={async (lid, payload) => {
          try {
            await updateLeague({ leagueId: lid, payload });
            setIsEditLeagueModalOpen(false);
            refetchLeague();
            Alert.alert('League Updated', 'The league details have been successfully saved.');
          } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.detail || err?.message || 'Failed to update league');
          }
        }}
        isUpdating={isUpdatingLeague}
      />

      {/* ─── MODAL: TEAM DETAILS ─── */}
      <ModalSheet
        visible={Boolean(selectedTeam)}
        onClose={() => setSelectedTeam(null)}
        title={selectedTeam?.name || (isSingles ? 'Player Details' : 'Team Details')}
        subtitle={isSingles ? `Skill Level: ${(selectedTeam?.avg_skill_level ?? 3.5).toFixed(1)}` : `Average Skill Level: ${(selectedTeam?.avg_skill_level ?? 3.5).toFixed(1)}`}
      >
        <View style={styles.teamDetailsContainer}>
          <AppText style={styles.rosterSectionTitle}>{isSingles ? 'Player Profile' : 'Roster Members'}</AppText>
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

          <DateRangePickerInput
            label="Week Duration"
            startDate={editingWeekStartDate}
            endDate={editingWeekEndDate}
            onStartDateChange={setEditingWeekStartDate}
            onEndDateChange={setEditingWeekEndDate}
          />
        </View>
      </ModalSheet>

      {/* ─── MODAL: MATCH COURT & TIME SCHEDULING ─── */}
      <ModalSheet
        visible={Boolean(schedulingMatch)}
        onClose={() => setSchedulingMatch(null)}
        title="Schedule Match"
        subtitle={`${schedulingMatch?.team_a_name || schedulingMatch?.team_a?.name || 'Team A'} vs ${schedulingMatch?.team_b_name || schedulingMatch?.team_b?.name || 'Team B'}`}
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
          <DatePickerInput
            label="Date *"
            value={scheduleDate}
            onChange={setScheduleDate}
          />

          <TimePickerInput
            label="Start Time *"
            value={scheduleTime}
            onChange={setScheduleTime}
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
                {scoreModalMatch?.team_a_name || scoreModalMatch?.team_a?.name || 'Team A'}
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
                {scoreModalMatch?.team_b_name || scoreModalMatch?.team_b?.name || 'Team B'}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  mainScrollView: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  mainScrollContent: {
    flexGrow: 1,
  },
  scrollHeaderWrapper: {
    backgroundColor: '#FFFFFF',
  },
  stickyTabsContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5ECE8',
    zIndex: 10,
    elevation: 4,
  },
  tabBodyWrapper: {
    flex: 1,
    paddingTop: Spacing[2],
  },
  scheduleViewModeRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 3,
  },
  scheduleViewModeBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  scheduleViewModeBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  scheduleViewModeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  scheduleViewModeTextActive: {
    color: '#176B57',
    fontWeight: '700',
  },

  // ─── Compact Header Styles ───
  headerContainer: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
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

  // ─── 2-Column Registration Stats Card ───
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

  // ─── Compact Management Actions (Teams Tab) ───
  managementActionsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 10,
  },
  closeRegBtn: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#176B57',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  closeRegBtnText: {
    color: '#176B57',
    fontSize: 13.5,
    fontWeight: '600',
  },
  editLeagueBtn: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  editLeagueBtnText: {
    color: '#374151',
    fontSize: 13.5,
    fontWeight: '600',
  },

  // ─── Navigation Tabs Strip with Green Underline ───
  tabsStripContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5ECE8',
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
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

  // ─── Week Selector Strip ───
  weekSelectorContainer: {
    marginBottom: 12,
  },
  weekSelectorScroll: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  weekPill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekPillSelected: {
    backgroundColor: '#176B57',
    borderWidth: 1,
    borderColor: '#176B57',
  },
  weekPillUnselected: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5ECE8',
  },
  weekPillText: {
    fontSize: 13.5,
  },
  weekPillTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  weekPillTextUnselected: {
    color: '#374151',
    fontWeight: '500',
  },
  courtFilterPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5ECE8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  courtFilterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },

  // ─── Tab Content Layout ───
  contentScroll: {
    flex: 1,
  },
  tabPane: {
    paddingHorizontal: 16,
  },

  // ─── Teams Tab Styles (Screen 2) ───
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
  addTeamButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  addTeamButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#176B57',
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

  // ─── Schedule Tab Styles (Screens 3 & 4) ───
  noScheduleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5ECE8',
  },
  noScheduleTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 6,
  },
  noScheduleSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  scheduleChecklist: {
    backgroundColor: '#F8FAF9',
    borderRadius: 8,
    padding: 12,
    gap: 10,
    marginBottom: 16,
  },
  checkItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkItemText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  generateMatchesButton: {
    backgroundColor: '#176B57',
    borderRadius: 8,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  generateMatchesButtonText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
  },
  infoNoticeBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  infoNoticeText: {
    fontSize: 12.5,
    color: '#1E40AF',
    lineHeight: 18,
  },

  // ─── Schedule Screen 4 Styles ───
  scheduleContent: {
    gap: Spacing[3],
  },
  weekHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weekScheduleTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  weekMatchCountText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  weekDateCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  weekDateLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  weekDateLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  weekDateValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginTop: 1,
  },
  weekDateEditBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 8,
  },
  weekDateEditBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  matchesList: {
    gap: Spacing[3],
  },
  screen4MatchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  screen4MatchTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  screen4MatchLeftCol: {
    width: 80,
  },
  screen4MatchNum: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  screen4MatchTime: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
    marginTop: 2,
  },
  screen4MatchCourt: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
  },
  screen4MatchupCol: {
    flex: 1,
    paddingHorizontal: 8,
  },
  matchupTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniAvatarText: {
    fontSize: 10,
    fontWeight: '800',
  },
  matchupTeamName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  matchupRating: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
  },
  matchupVsText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9CA3AF',
    marginVertical: 2,
    paddingLeft: 30,
  },
  screen4MatchDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing[2],
    paddingTop: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  screen4MatchDateText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  editWeekDatesOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: Spacing[2],
  },
  editWeekDatesOutlineBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },

  // ─── Matches Tab Styles (Screen 5) ───
  screen5MatchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  screen5TopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  screen5StatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  screen5StatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  screen5MatchupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  inlineScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing[2],
    paddingTop: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  inlineScoreInput: {
    width: 48,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  inlineScoreDash: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  inlineSaveScoreBtn: {
    backgroundColor: '#064E3B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 6,
  },
  inlineSaveScoreBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // ─── Standings Tab Styles (Screen 6) ───
  standingsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[3],
  },
  standingsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  standingsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  regularSeasonPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  regularSeasonPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  standingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
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
    width: 24,
    textAlign: 'center',
  },
  sRankBold: {
    fontWeight: '800',
  },
  sThTeam: {
    flex: 1,
    paddingLeft: 6,
  },
  sTeamCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  standingsAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  standingsAvatarText: {
    fontSize: 10,
    fontWeight: '800',
  },
  sTeamName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  sThStat: {
    width: 32,
    textAlign: 'center',
  },
  sThPts: {
    width: 34,
  },
  sPtsBold: {
    fontWeight: '900',
    color: '#111827',
  },
  standingsTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  standingsTableRowLast: {
    borderBottomWidth: 0,
  },
  standingsInfoNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: Spacing[4],
    paddingHorizontal: 4,
  },
  standingsInfoNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 17,
  },

  // ─── Playoffs Tab Styles (Screen 7) ───
  playoffsNotAvailableContainer: {
    alignItems: 'center',
    paddingTop: Spacing[4],
  },
  playoffTrophyCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FEF3C7', // Soft light gold
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing[3],
  },
  playoffsNotAvailableTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  playoffsNotAvailableSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: Spacing[5],
    paddingHorizontal: Spacing[4],
  },
  playoffProgressCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  playoffProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  playoffProgressTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  playoffProgressPercent: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  playoffProgressCount: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  playoffProgressBarTrack: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing[4],
  },
  playoffProgressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  generatePlayoffBtn: {
    width: '100%',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[4],
  },
  generatePlayoffBtnActive: {
    backgroundColor: '#064E3B',
  },
  generatePlayoffBtnDisabled: {
    backgroundColor: '#E5E7EB',
  },
  generatePlayoffBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  generatePlayoffBtnTextActive: {
    color: '#FFFFFF',
  },
  generatePlayoffBtnTextDisabled: {
    color: '#9CA3AF',
  },
  playoffChecklist: {
    gap: 10,
    paddingTop: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  playoffActiveCard: {
    padding: Spacing[4],
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  playoffActiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  playoffActiveTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  playoffActiveDetails: {
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
  viewPlayoffMatchesBtn: {
    backgroundColor: '#064E3B',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: Spacing[2],
  },
  viewPlayoffMatchesBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // ─── Results Tab Styles (Screen 8) ───
  resultsFiltersRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing[3],
  },
  resultsFilterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  resultsFilterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  screen8MatchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  screen8TopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  screen8DateText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
    flex: 1,
    marginRight: 6,
  },
  screen8Badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  screen8BadgeCompleted: {
    backgroundColor: '#DCFCE7',
  },
  screen8BadgeScheduled: {
    backgroundColor: '#E0F2FE',
  },
  screen8BadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  screen8BadgeTextCompleted: {
    color: '#15803D',
  },
  screen8BadgeTextScheduled: {
    color: '#0284C7',
  },
  screen8MatchupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  screen8TeamBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  screen8TeamBlockRight: {
    justifyContent: 'flex-end',
  },
  screen8TeamName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  screen8ScoresBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  screen8ScoreDigit: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },
  screen8ScoreSeparator: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  finalizeLeagueBox: {
    marginTop: Spacing[4],
  },
  finalizeLeagueBtn: {
    backgroundColor: '#064E3B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finalizeLeagueBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  // ─── Modal Sheet Styles ───
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
