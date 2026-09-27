/**
 * Aught2 Pickleball — Player Live Tournament View
 *
 * Implements the 4-screen Live Tournament player experience matching the reference design:
 *   Tab 1: Overview & Rules
 *   Tab 2: Matches (Filters: All, Live, Upcoming, Completed)
 *   Tab 3: Players (Registered players with search, W-L record, points, and summary)
 *   Tab 4: Standings (Live standings table with W, L, PTS, PD + "How Standings Work" card)
 *
 * Supported formats:
 *   1. Round Robin
 *   2. Pool Play
 *   3. Scramble
 *   4. Single Elimination Bracket
 *
 * Live-to-Completed Transition:
 *   When the tournament is completed, automatically transitions to the existing
 *   Completed Tournament views without refreshing or duplicating records.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Activity,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Info,
  LayoutGrid,
  Lightbulb,
  MapPin,
  Radio,
  Search,
  Share2,
  Sliders,
  Trophy,
  Users,
} from 'lucide-react-native';

import { AppText } from '../AppText';
import { EmptyState } from '../StateViews';
import {
  usePlayerMatches,
  usePlayerPoolMatches,
  usePlayerPoolStandings,
  usePlayerPools,
  usePlayerChampionshipMatches,
  usePlayerScramble,
  usePlayerBracket,
  usePlayerStandings,
  usePlayerTeams,
  usePlayerTournamentRegistrations,
} from '@/hooks';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';
import type {
  Match,
  StandingRow,
  Tournament,
  TournamentFormat,
} from '@/types';

// Format banner images
const FORMAT_BANNERS: Record<TournamentFormat, any> = {
  round_robin: require('../../../assets/tournaments/banner2.jpg'),
  pool_play: require('../../../assets/tournaments/card_pool_play.jpg'),
  scramble: require('../../../assets/tournaments/banner3.jpg'),
  bracket: require('../../../assets/tournaments/card_bracket.jpg'),
};

interface LiveTournamentViewProps {
  tournament: Tournament;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  isRefreshing?: boolean;
}

// Format short date: "26 Sep 2026"
function formatDateShort(isoStr?: string | null): string {
  if (!isoStr) return '26 Sep 2026';
  try {
    const d = new Date(isoStr);
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return '26 Sep 2026';
  }
}

// Generate consistent avatar colors from string
function getAvatarBg(name: string): string {
  const colors = ['#DBEAFE', '#E0E7FF', '#FCE7F3', '#DCFCE7', '#FEF3C7', '#FFEDD5', '#F3E8FF'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

function getAvatarTextColor(name: string): string {
  const colors = ['#1E40AF', '#3730A3', '#9D174D', '#166534', '#92400E', '#9A3412', '#6B21A8'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

export function LiveTournamentView({
  tournament,
  onBack,
  onRefresh,
  isRefreshing = false,
}: LiveTournamentViewProps) {
  const insets = useSafeAreaInsets();
  const tournamentId = tournament.id;
  const format = tournament.format ?? 'round_robin';

  // Active Tab
  const [activeTab, setActiveTab] = useState<'overview' | 'matches' | 'players' | 'standings'>('overview');

  // Matches filter chip
  const [matchFilter, setMatchFilter] = useState<'all' | 'live' | 'upcoming' | 'completed'>('all');

  // Player search
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');

  // Pool filter
  const [selectedPoolId, setSelectedPoolId] = useState<string>('all');

  // Polling every 10s for real-time live score updates and status transition
  useEffect(() => {
    const interval = setInterval(() => {
      void onRefresh();
    }, 10000);
    return () => clearInterval(interval);
  }, [onRefresh]);

  // Format Config
  const parsedConfig = useMemo(() => parseTournamentConfig(tournament), [tournament]);
  const bannerImage = FORMAT_BANNERS[format] || FORMAT_BANNERS.round_robin;

  // Format badge pill
  const formatBadge = useMemo(() => {
    switch (format) {
      case 'round_robin':
        return { label: 'Round Robin', bg: '#EFF6FF', text: '#2563EB' };
      case 'scramble':
        return { label: 'Scramble', bg: '#DCFCE7', text: '#15803D' };
      case 'pool_play':
        return { label: 'Pool Play', bg: '#EDE9FE', text: '#7C3AED' };
      case 'bracket':
        return { label: 'Bracket', bg: '#FFEDD5', text: '#EA580C' };
      default:
        return { label: tournament.format_label || 'Round Robin', bg: '#EFF6FF', text: '#2563EB' };
    }
  }, [format, tournament.format_label]);

  // ─── Format Data Queries ───
  // Round Robin
  const { matches: rrMatches } = usePlayerMatches(format === 'round_robin' ? tournamentId : null);
  const { standings: rrStandings } = usePlayerStandings(format === 'round_robin' ? tournamentId : null);

  // Pool Play
  const { pools } = usePlayerPools(format === 'pool_play' ? tournamentId : null);
  const { matches: poolMatches } = usePlayerPoolMatches(
    format === 'pool_play' ? tournamentId : null,
    selectedPoolId === 'all' ? undefined : selectedPoolId
  );
  const { poolsStandings } = usePlayerPoolStandings(format === 'pool_play' ? tournamentId : null);
  const { matches: championshipMatches } = usePlayerChampionshipMatches(
    format === 'pool_play' ? tournamentId : null
  );

  // Scramble
  const {
    matches: scrambleMatches,
    standings: scrambleStandings,
    state: scrambleState,
  } = usePlayerScramble(format === 'scramble' ? tournamentId : null);

  // Bracket
  const { matches: bracketMatches, summary: bracketSummary } = usePlayerBracket(
    format === 'bracket' ? tournamentId : null
  );

  // Registered Teams / Participants
  const { teams } = usePlayerTeams(tournamentId);
  const { registrations } = usePlayerTournamentRegistrations(tournamentId);

  // Unified Match List
  const allMatches: Match[] = useMemo(() => {
    switch (format) {
      case 'pool_play':
        return [...poolMatches, ...championshipMatches];
      case 'scramble':
        return scrambleMatches;
      case 'bracket':
        return bracketMatches;
      case 'round_robin':
      default:
        return rrMatches;
    }
  }, [format, poolMatches, championshipMatches, scrambleMatches, bracketMatches, rrMatches]);

  // Segregate matches into Live, Upcoming, Completed
  const { liveMatches, upcomingMatches, completedMatches } = useMemo(() => {
    const live: Match[] = [];
    const upcoming: Match[] = [];
    const completed: Match[] = [];

    // Find current active round if available
    let currentRound = 1;
    if (scrambleState?.current_round) {
      currentRound = scrambleState.current_round;
    } else {
      const pendingRounds = allMatches
        .filter((m) => m.status === 'pending')
        .map((m) => m.round_number || m.round || 1);
      if (pendingRounds.length > 0) currentRound = Math.min(...pendingRounds);
    }

    allMatches.forEach((m) => {
      if (m.status === 'completed') {
        completed.push(m);
      } else if (
        (m.score_a !== null && m.score_a > 0) ||
        (m.score_b !== null && m.score_b > 0) ||
        (m.round_number || m.round || 1) === currentRound
      ) {
        live.push(m);
      } else {
        upcoming.push(m);
      }
    });

    return { liveMatches: live, upcomingMatches: upcoming, completedMatches: completed };
  }, [allMatches, scrambleState]);

  // Filtered matches based on chip selection
  const displayedMatches = useMemo(() => {
    switch (matchFilter) {
      case 'live':
        return { live: liveMatches, upcoming: [], completed: [] };
      case 'upcoming':
        return { live: [], upcoming: upcomingMatches, completed: [] };
      case 'completed':
        return { live: [], upcoming: [], completed: completedMatches };
      case 'all':
      default:
        return { live: liveMatches, upcoming: upcomingMatches, completed: completedMatches };
    }
  }, [matchFilter, liveMatches, upcomingMatches, completedMatches]);

  // Standings List
  const standingsRows: StandingRow[] = useMemo(() => {
    if (format === 'scramble') {
      return (scrambleStandings || []).map((s, idx) => ({
        rank: idx + 1,
        team_id: s.player_membership_id,
        team_name: s.display_name,
        team_seed: null,
        wins: s.wins || 0,
        losses: s.losses || 0,
        matches_played: s.matches_played || (s.wins || 0) + (s.losses || 0),
        points_scored: s.points_scored || 0,
        points_allowed: s.points_allowed || 0,
        points_differential: s.points_differential || 0,
      }));
    }

    if (format === 'pool_play') {
      if (selectedPoolId !== 'all') {
        const p = poolsStandings.find((ps) => ps.pool_id === selectedPoolId);
        return p?.standings || [];
      }
      // Combine all pools standings
      const combined: StandingRow[] = [];
      poolsStandings.forEach((ps) => {
        combined.push(...(ps.standings || []));
      });
      return combined.sort((a, b) => b.wins - a.wins || b.points_differential - a.points_differential);
    }

    if (format === 'bracket') {
      // Use bracket matches to order teams by furthest round reached
      return (rrStandings || []);
    }

    return rrStandings || [];
  }, [format, scrambleStandings, poolPlayStandingsCombined(poolsStandings, selectedPoolId), rrStandings]);

  function poolPlayStandingsCombined(pStandings: any[], poolId: string) {
    if (poolId !== 'all') {
      const found = pStandings.find((ps) => ps.pool_id === poolId);
      return found?.standings || [];
    }
    const combined: StandingRow[] = [];
    pStandings.forEach((ps) => combined.push(...(ps.standings || [])));
    return combined;
  }

  // Players List for Tab 3
  const playersList = useMemo(() => {
    // Build a map of stats from standingsRows
    const statsMap = new Map<string, { wins: number; losses: number; points: number }>();
    standingsRows.forEach((s) => {
      statsMap.set(s.team_id, {
        wins: s.wins,
        losses: s.losses,
        points: s.points_scored,
      });
      statsMap.set(s.team_name.toLowerCase(), {
        wins: s.wins,
        losses: s.losses,
        points: s.points_scored,
      });
    });

    let rawList: Array<{
      id: string;
      name: string;
      skill: string;
      seed?: number | null;
      wins: number;
      losses: number;
      points: number;
    }> = [];

    if (teams && teams.length > 0) {
      rawList = teams.map((t, idx) => {
        const stats = statsMap.get(t.id) || statsMap.get(t.name.toLowerCase()) || { wins: 0, losses: 0, points: 0 };
        return {
          id: t.id,
          name: t.name,
          skill: parsedConfig.skillLevel ? `Skill ${parsedConfig.skillLevel}` : 'Skill 3.5',
          seed: t.seed || idx + 1,
          wins: stats.wins,
          losses: stats.losses,
          points: stats.points,
        };
      });
    } else if (registrations && registrations.length > 0) {
      rawList = registrations.map((r, idx) => {
        const name = r.display_name || r.user_full_name || 'Participant';
        const stats = statsMap.get(r.id) || statsMap.get(name.toLowerCase()) || { wins: 0, losses: 0, points: 0 };
        return {
          id: r.id,
          name: name,
          skill: parsedConfig.skillLevel ? `Skill ${parsedConfig.skillLevel}` : 'Skill 3.5',
          seed: r.seed || idx + 1,
          wins: stats.wins,
          losses: stats.losses,
          points: stats.points,
        };
      });
    } else if (standingsRows.length > 0) {
      rawList = standingsRows.map((s) => ({
        id: s.team_id,
        name: s.team_name,
        skill: parsedConfig.skillLevel ? `Skill ${parsedConfig.skillLevel}` : 'Skill 3.5',
        seed: s.team_seed || s.rank,
        wins: s.wins,
        losses: s.losses,
        points: s.points_scored,
      }));
    }

    if (playerSearchQuery.trim()) {
      const q = playerSearchQuery.toLowerCase().trim();
      rawList = rawList.filter((p) => p.name.toLowerCase().includes(q));
    }

    return rawList;
  }, [teams, registrations, standingsRows, parsedConfig.skillLevel, playerSearchQuery]);

  // Share handler
  const handleShare = async () => {
    try {
      await Share.share({
        title: tournament.name,
        message: `Watch ${tournament.name} live on Aught2 Pickleball!`,
      });
    } catch {
      // Ignored
    }
  };

  // Dynamic day/round progress calculation
  const progressText = useMemo(() => {
    if (scrambleState?.current_round) {
      const totalRounds = scrambleState?.planned_rounds || (tournament.format_configuration as any)?.planned_rounds || (tournament.format_configuration as any)?.rounds || 5;
      return `Round ${scrambleState.current_round} of ${totalRounds}`;
    }
    const start = new Date(tournament.start_date).getTime();
    const end = new Date(tournament.end_date).getTime();
    const now = Date.now();
    const totalDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);
    const dayIndex = Math.min(totalDays, Math.max(1, Math.ceil((now - start) / (1000 * 60 * 60 * 24)) + 1));
    return `Day ${dayIndex} of ${totalDays}`;
  }, [tournament.start_date, tournament.end_date, scrambleState]);

  // Registered Count
  const registeredCount = tournament.participant_count ?? (teams.length > 0 ? teams.length : registrations.length);
  const maxCapacity = tournament.max_participants ?? 16;
  const targetScore = tournament.scoring_rules?.target_score ?? 11;
  const winBy = tournament.scoring_rules?.win_by ?? 2;
  const dateRangeStr = `${formatDateShort(tournament.start_date)} - ${formatDateShort(tournament.end_date)}`;
  const locationStr = tournament.location_name || 'Location TBD';

  return (
    <View style={styles.screen}>
      {/* ─── Shared Top Navigation Bar ─── */}
      <View style={[styles.topNavBar, { paddingTop: insets.top + 6 }]}>
        <View style={styles.navBarInner}>
          {/* Left: Back Arrow + Tournaments Heading */}
          <TouchableOpacity
            onPress={onBack}
            style={styles.backRow}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Back to Tournaments"
          >
            <ArrowLeft size={22} color="#0F172A" strokeWidth={2.4} />
            <AppText variant="title" bold style={styles.navTitle}>
              Tournaments
            </AppText>
          </TouchableOpacity>

          {/* Right: Share Button */}
          <TouchableOpacity
            onPress={handleShare}
            style={styles.navIconButton}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Share Tournament"
          >
            <Share2 size={20} color="#0F172A" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── Scrollable Content ─── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => void onRefresh()} />
        }
      >
        {/* ─── Shared Tournament Banner ─── */}
        <View style={styles.heroCard}>
          <Image source={bannerImage} style={styles.heroBannerImage} resizeMode="cover" />
          <View style={styles.heroOverlay} />

          <View style={styles.heroContent}>
            {/* Top row badges: LIVE on upper-left, Format on upper-right */}
            <View style={styles.heroTopRow}>
              {/* LIVE • IN PROGRESS Badge */}
              <View style={styles.liveBadge}>
                <View style={styles.livePulseDot} />
                <AppText variant="caption" bold style={styles.liveBadgeText}>
                  LIVE • IN PROGRESS
                </AppText>
              </View>

              {/* Format Badge */}
              <View style={[styles.formatBadge, { backgroundColor: formatBadge.bg }]}>
                <AppText variant="caption" bold style={[styles.formatBadgeText, { color: formatBadge.text }]}>
                  {formatBadge.label}
                </AppText>
              </View>
            </View>

            {/* Bottom info block */}
            <View style={styles.heroBottomBlock}>
              {/* Tournament Title */}
              <AppText variant="heading1" style={styles.heroTitle} numberOfLines={2}>
                {tournament.name}
              </AppText>

              {/* Sub-row 1: Category & Dates */}
              <View style={styles.heroMetaRow}>
                <View style={styles.metaItem}>
                  <Users size={14} color="#FFFFFF" strokeWidth={2} style={{ marginRight: 5 }} />
                  <AppText variant="caption" bold style={styles.metaText}>
                    {parsedConfig.category || 'Singles'}
                  </AppText>
                </View>

                <AppText variant="caption" style={styles.metaDot}>•</AppText>

                <View style={styles.metaItem}>
                  <Calendar size={14} color="#FFFFFF" strokeWidth={2} style={{ marginRight: 5 }} />
                  <AppText variant="caption" bold style={styles.metaText}>
                    {dateRangeStr}
                  </AppText>
                  <Info size={12} color="#FFFFFF" strokeWidth={2} style={{ marginLeft: 4 }} />
                </View>
              </View>

              {/* Sub-row 2: Venue / Location */}
              <View style={[styles.heroMetaRow, { marginTop: 4 }]}>
                <MapPin size={14} color="#FFFFFF" strokeWidth={2} style={{ marginRight: 5 }} />
                <AppText variant="caption" bold style={styles.metaText} numberOfLines={1}>
                  {locationStr}
                </AppText>
              </View>
            </View>
          </View>
        </View>

        {/* ─── Shared Tab Navigation Bar ─── */}
        <View style={styles.tabsRow}>
          {/* Tab 1: Overview & Rules */}
          <TouchableOpacity
            style={styles.tabBtn}
            onPress={() => setActiveTab('overview')}
            activeOpacity={0.7}
          >
            <AppText
              variant="bodySmall"
              bold
              style={[styles.tabText, activeTab === 'overview' && styles.tabTextActive]}
            >
              Overview & Rules
            </AppText>
            {activeTab === 'overview' && <View style={styles.activeIndicator} />}
          </TouchableOpacity>

          {/* Tab 2: Matches */}
          <TouchableOpacity
            style={styles.tabBtn}
            onPress={() => setActiveTab('matches')}
            activeOpacity={0.7}
          >
            <AppText
              variant="bodySmall"
              bold
              style={[styles.tabText, activeTab === 'matches' && styles.tabTextActive]}
            >
              Matches
            </AppText>
            {activeTab === 'matches' && <View style={styles.activeIndicator} />}
          </TouchableOpacity>

          {/* Tab 3: Players */}
          <TouchableOpacity
            style={styles.tabBtn}
            onPress={() => setActiveTab('players')}
            activeOpacity={0.7}
          >
            <AppText
              variant="bodySmall"
              bold
              style={[styles.tabText, activeTab === 'players' && styles.tabTextActive]}
            >
              Players
            </AppText>
            {activeTab === 'players' && <View style={styles.activeIndicator} />}
          </TouchableOpacity>

          {/* Tab 4: Standings */}
          <TouchableOpacity
            style={styles.tabBtn}
            onPress={() => setActiveTab('standings')}
            activeOpacity={0.7}
          >
            <AppText
              variant="bodySmall"
              bold
              style={[styles.tabText, activeTab === 'standings' && styles.tabTextActive]}
            >
              Standings
            </AppText>
            {activeTab === 'standings' && <View style={styles.activeIndicator} />}
          </TouchableOpacity>
        </View>

        {/* ─── TAB 1: OVERVIEW & RULES ─── */}
        {activeTab === 'overview' && (
          <View style={styles.tabContentArea}>
            {/* Card 1: Live Tournament Status */}
            <View style={styles.infoCard}>
              <View style={styles.liveStatusRow}>
                <View style={styles.broadcastIconCircle}>
                  <Radio size={20} color="#059669" strokeWidth={2.4} />
                </View>

                <View style={styles.liveStatusContent}>
                  <AppText variant="body" bold style={styles.cardTitle}>
                    Live Tournament
                  </AppText>
                  <AppText variant="caption" style={styles.aboutBodyText}>
                    Matches are currently in progress. Follow live scores, standings and updates.
                  </AppText>
                </View>

                {/* Day / Round Badge on Right */}
                <View style={styles.liveStatusBadgeBox}>
                  <AppText variant="caption" bold style={styles.dayProgressText}>
                    {progressText}
                  </AppText>
                  <AppText variant="caption" bold style={styles.inProgressGreenText}>
                    In Progress
                  </AppText>
                </View>
              </View>
            </View>

            {/* Card 2: Tournament Information */}
            <View style={styles.infoCard}>
              <AppText variant="body" bold style={[styles.cardTitle, { marginBottom: 14 }]}>
                Tournament Information
              </AppText>

              <View style={styles.specGrid}>
                {/* Row 1 */}
                <View style={styles.specRow}>
                  <View style={styles.specCol}>
                    <View style={styles.specIconLabelRow}>
                      <LayoutGrid size={15} color="#64748B" style={styles.specIcon} />
                      <AppText variant="caption" style={styles.gridLabel}>Format</AppText>
                    </View>
                    <AppText variant="bodySmall" bold style={styles.gridValue}>
                      {formatBadge.label}
                    </AppText>
                  </View>

                  <View style={styles.specCol}>
                    <View style={styles.specIconLabelRow}>
                      <Users size={15} color="#64748B" style={styles.specIcon} />
                      <AppText variant="caption" style={styles.gridLabel}>Division</AppText>
                    </View>
                    <AppText variant="bodySmall" bold style={styles.gridValue}>
                      {parsedConfig.category || 'Singles'}
                    </AppText>
                  </View>
                </View>

                <View style={styles.gridDivider} />

                {/* Row 2 */}
                <View style={styles.specRow}>
                  <View style={styles.specCol}>
                    <View style={styles.specIconLabelRow}>
                      <Calendar size={15} color="#64748B" style={styles.specIcon} />
                      <AppText variant="caption" style={styles.gridLabel}>Event Dates</AppText>
                    </View>
                    <AppText variant="bodySmall" bold style={styles.gridValue}>
                      {dateRangeStr}
                    </AppText>
                  </View>

                  <View style={styles.specCol}>
                    <View style={styles.specIconLabelRow}>
                      <MapPin size={15} color="#64748B" style={styles.specIcon} />
                      <AppText variant="caption" style={styles.gridLabel}>Location</AppText>
                    </View>
                    <AppText variant="bodySmall" bold style={styles.gridValue} numberOfLines={1}>
                      {locationStr}
                    </AppText>
                  </View>
                </View>

                <View style={styles.gridDivider} />

                {/* Row 3 */}
                <View style={styles.specRow}>
                  <View style={styles.specCol}>
                    <View style={styles.specIconLabelRow}>
                      <Sliders size={15} color="#64748B" style={styles.specIcon} />
                      <AppText variant="caption" style={styles.gridLabel}>Skill Level</AppText>
                    </View>
                    <AppText variant="bodySmall" bold style={styles.gridValue}>
                      {parsedConfig.skillLevel ? `${parsedConfig.skillLevel} Level` : '3.0 – 4.0'}
                    </AppText>
                  </View>

                  <View style={styles.specCol}>
                    <View style={styles.specIconLabelRow}>
                      <Users size={15} color="#64748B" style={styles.specIcon} />
                      <AppText variant="caption" style={styles.gridLabel}>Players</AppText>
                    </View>
                    <AppText variant="bodySmall" bold style={styles.gridValue}>
                      {registeredCount} / {maxCapacity} registered
                    </AppText>
                  </View>
                </View>
              </View>
            </View>

            {/* Card 3: About This Tournament */}
            <View style={styles.infoCard}>
              <AppText variant="body" bold style={[styles.cardTitle, { marginBottom: 6 }]}>
                About This Tournament
              </AppText>
              <AppText variant="caption" style={styles.aboutBodyText}>
                {tournament.description ||
                  'Annual spring round robin tournament. All players compete in a guaranteed number of matches with final standings determined by wins, points differential, and total points.'}
              </AppText>
            </View>

            {/* Card 4: Rules & Eligibility */}
            <View style={[styles.infoCard, { marginBottom: 32 }]}>
              <AppText variant="body" bold style={[styles.cardTitle, { marginBottom: 12 }]}>
                Rules & Eligibility
              </AppText>

              <View style={styles.rulesContainer}>
                <View style={styles.ruleCheckRow}>
                  <CheckCircle2 size={16} color="#059669" strokeWidth={2.4} style={styles.checkIcon} />
                  <AppText variant="caption" style={styles.ruleText}>
                    Single game to {targetScore}, win by {winBy}
                  </AppText>
                </View>

                <View style={styles.ruleCheckRow}>
                  <CheckCircle2 size={16} color="#059669" strokeWidth={2.4} style={styles.checkIcon} />
                  <AppText variant="caption" style={styles.ruleText}>
                    Tiebreakers: 1. Wins 2. Points Differential 3. Total Points
                  </AppText>
                </View>

                <View style={styles.ruleCheckRow}>
                  <CheckCircle2 size={16} color="#059669" strokeWidth={2.4} style={styles.checkIcon} />
                  <AppText variant="caption" style={styles.ruleText}>
                    Skill level range: {parsedConfig.skillLevel || '3.0 – 4.0'}
                  </AppText>
                </View>

                <View style={styles.ruleCheckRow}>
                  <CheckCircle2 size={16} color="#059669" strokeWidth={2.4} style={styles.checkIcon} />
                  <AppText variant="caption" style={styles.ruleText}>
                    Must be an active club member
                  </AppText>
                </View>

                <View style={styles.ruleCheckRow}>
                  <CheckCircle2 size={16} color="#059669" strokeWidth={2.4} style={styles.checkIcon} />
                  <AppText variant="caption" style={styles.ruleText}>
                    Open to all eligible players
                  </AppText>
                </View>
              </View>

              {/* View Full Tournament Rules Footer Link */}
              <TouchableOpacity
                style={styles.fullRulesLink}
                onPress={() => setActiveTab('standings')}
                activeOpacity={0.7}
              >
                <FileText size={16} color="#059669" strokeWidth={2.2} style={{ marginRight: 6 }} />
                <AppText variant="caption" bold style={styles.fullRulesText}>
                  View Full Tournament Rules →
                </AppText>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ─── TAB 2: MATCHES ─── */}
        {activeTab === 'matches' && (
          <View style={styles.tabContentArea}>
            {/* Horizontal Filter Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipScroll}>
              <TouchableOpacity
                style={[styles.filterChip, matchFilter === 'all' && styles.filterChipActive]}
                onPress={() => setMatchFilter('all')}
                activeOpacity={0.7}
              >
                <AppText
                  variant="caption"
                  bold
                  style={[styles.filterChipText, matchFilter === 'all' && styles.filterChipTextActive]}
                >
                  All Matches
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterChip, matchFilter === 'live' && styles.filterChipActive]}
                onPress={() => setMatchFilter('live')}
                activeOpacity={0.7}
              >
                <AppText
                  variant="caption"
                  bold
                  style={[styles.filterChipText, matchFilter === 'live' && styles.filterChipTextActive]}
                >
                  Live ({liveMatches.length})
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterChip, matchFilter === 'upcoming' && styles.filterChipActive]}
                onPress={() => setMatchFilter('upcoming')}
                activeOpacity={0.7}
              >
                <AppText
                  variant="caption"
                  bold
                  style={[styles.filterChipText, matchFilter === 'upcoming' && styles.filterChipTextActive]}
                >
                  Upcoming ({upcomingMatches.length})
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterChip, matchFilter === 'completed' && styles.filterChipActive]}
                onPress={() => setMatchFilter('completed')}
                activeOpacity={0.7}
              >
                <AppText
                  variant="caption"
                  bold
                  style={[styles.filterChipText, matchFilter === 'completed' && styles.filterChipTextActive]}
                >
                  Completed ({completedMatches.length})
                </AppText>
              </TouchableOpacity>
            </ScrollView>

            {/* 1. Live Matches Section */}
            {displayedMatches.live.length > 0 && (
              <View style={styles.matchesSection}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionTitleWithDot}>
                    <View style={styles.redLiveDot} />
                    <AppText variant="body" bold style={styles.sectionHeading}>
                      Live Matches
                    </AppText>
                  </View>
                  <AppText variant="caption" style={styles.matchCountMuted}>
                    {displayedMatches.live.length} matches
                  </AppText>
                </View>

                {displayedMatches.live.map((m, idx) => {
                  const teamAName = m.team_a?.name || m.side_a_participants?.map((p) => p.display_name).join(' & ') || 'Team A';
                  const teamBName = m.team_b?.name || m.side_b_participants?.map((p) => p.display_name).join(' & ') || 'Team B';
                  const roundNum = m.round_number || m.round || 1;
                  const matchNum = m.match_number || idx + 1;
                  const courtNum = m.court_id ? `Court ${String(m.court_id).slice(-1)}` : 'Court TBD';

                  return (
                    <View key={m.id || idx} style={styles.matchCard}>
                      {/* Top row */}
                      <View style={styles.matchCardTopRow}>
                        <AppText variant="caption" bold style={styles.matchRoundText}>
                          Round {roundNum} • Match #{matchNum}
                        </AppText>
                        <AppText variant="caption" bold style={styles.matchCourtText}>
                          {courtNum}
                        </AppText>
                        <View style={styles.liveRedPill}>
                          <AppText variant="caption" bold style={styles.liveRedPillText}>
                            • LIVE
                          </AppText>
                        </View>
                      </View>

                      {/* Side A */}
                      <View style={styles.matchParticipantRow}>
                        <View style={[styles.avatarCircleSmall, { backgroundColor: getAvatarBg(teamAName) }]}>
                          <AppText variant="caption" bold style={{ color: getAvatarTextColor(teamAName), fontSize: 11 }}>
                            {teamAName.charAt(0)}
                          </AppText>
                        </View>
                        <AppText variant="bodySmall" bold style={styles.matchParticipantName} numberOfLines={1}>
                          {teamAName}
                        </AppText>
                        <View style={styles.servingDotGreen} />

                        {/* Set Scores */}
                        <View style={styles.scoresRow}>
                          <AppText variant="bodySmall" bold style={styles.setScoreText}>
                            {m.score_a != null ? m.score_a : 0}
                          </AppText>
                          {m.score_b != null && (
                            <View style={[styles.gameWonBoxGreen, (m.score_a || 0) < (m.score_b || 0) && styles.gameWonBoxGray]}>
                              <AppText variant="caption" bold style={(m.score_a || 0) >= (m.score_b || 0) ? styles.gameWonTextGreen : styles.gameWonTextGray}>
                                {(m.score_a || 0) >= (m.score_b || 0) ? 1 : 0}
                              </AppText>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Side B */}
                      <View style={styles.matchParticipantRow}>
                        <View style={[styles.avatarCircleSmall, { backgroundColor: getAvatarBg(teamBName) }]}>
                          <AppText variant="caption" bold style={{ color: getAvatarTextColor(teamBName), fontSize: 11 }}>
                            {teamBName.charAt(0)}
                          </AppText>
                        </View>
                        <AppText variant="bodySmall" bold style={styles.matchParticipantName} numberOfLines={1}>
                          {teamBName}
                        </AppText>

                        {/* Set Scores */}
                        <View style={styles.scoresRow}>
                          <AppText variant="bodySmall" bold style={styles.setScoreText}>
                            {m.score_b != null ? m.score_b : 0}
                          </AppText>
                          {m.score_a != null && (
                            <View style={[styles.gameWonBoxGreen, (m.score_b || 0) < (m.score_a || 0) && styles.gameWonBoxGray]}>
                              <AppText variant="caption" bold style={(m.score_b || 0) >= (m.score_a || 0) ? styles.gameWonTextGreen : styles.gameWonTextGray}>
                                {(m.score_b || 0) >= (m.score_a || 0) ? 1 : 0}
                              </AppText>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Footer */}
                      <View style={styles.matchCardFooter}>
                        <AppText variant="caption" style={styles.gameOfInfo}>
                          {(m.status as string) === 'in_progress' ? 'In Progress' : 'Live Match'}
                        </AppText>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* 2. Upcoming Matches Section */}
            {displayedMatches.upcoming.length > 0 && (
              <View style={[styles.matchesSection, { marginTop: 12 }]}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionTitleWithDot}>
                    <Clock size={16} color="#0F172A" style={{ marginRight: 6 }} />
                    <AppText variant="body" bold style={styles.sectionHeading}>
                      Upcoming Matches
                    </AppText>
                  </View>
                  <AppText variant="caption" style={styles.matchCountMuted}>
                    {displayedMatches.upcoming.length} matches
                  </AppText>
                </View>

                {displayedMatches.upcoming.map((m, idx) => {
                  const teamAName = m.team_a?.name || m.side_a_participants?.map((p) => p.display_name).join(' & ') || 'Awaiting winner';
                  const teamBName = m.team_b?.name || m.side_b_participants?.map((p) => p.display_name).join(' & ') || 'Awaiting winner';
                  const roundNum = m.round_number || m.round || 1;
                  const matchNum = m.match_number || idx + 1;
                  const courtNum = m.court_id ? `Court ${String(m.court_id).slice(-1)}` : 'Court TBD';
                  const timeStr = m.scheduled_start_at
                    ? new Date(m.scheduled_start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : 'Scheduled';

                  return (
                    <View key={m.id || idx} style={styles.matchCard}>
                      <View style={styles.matchCardTopRow}>
                        <AppText variant="caption" bold style={styles.matchRoundText}>
                          Round {roundNum} • Match #{matchNum}
                        </AppText>
                        <AppText variant="caption" style={styles.matchCourtText}>
                          {courtNum}
                        </AppText>
                        <AppText variant="caption" style={styles.matchCourtText}>
                          {timeStr} ›
                        </AppText>
                      </View>

                      <View style={styles.upcomingTeamsRow}>
                        <View style={styles.upcomingTeamSide}>
                          <View style={[styles.avatarCircleSmall, { backgroundColor: getAvatarBg(teamAName) }]}>
                            <AppText variant="caption" bold style={{ color: getAvatarTextColor(teamAName), fontSize: 11 }}>
                              {teamAName.charAt(0)}
                            </AppText>
                          </View>
                          <AppText variant="bodySmall" bold style={styles.upcomingTeamText} numberOfLines={1}>
                            {teamAName}
                          </AppText>
                        </View>

                        <AppText variant="caption" bold style={styles.vsText}>
                          vs
                        </AppText>

                        <View style={styles.upcomingTeamSide}>
                          <View style={[styles.avatarCircleSmall, { backgroundColor: getAvatarBg(teamBName) }]}>
                            <AppText variant="caption" bold style={{ color: getAvatarTextColor(teamBName), fontSize: 11 }}>
                              {teamBName.charAt(0)}
                            </AppText>
                          </View>
                          <AppText variant="bodySmall" bold style={styles.upcomingTeamText} numberOfLines={1}>
                            {teamBName}
                          </AppText>
                        </View>

                        <ChevronRight size={16} color="#94A3B8" />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* 3. Completed Matches Section */}
            {displayedMatches.completed.length > 0 && (
              <View style={[styles.matchesSection, { marginTop: 12 }]}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionTitleWithDot}>
                    <CheckCircle2 size={16} color="#059669" style={{ marginRight: 6 }} />
                    <AppText variant="body" bold style={styles.sectionHeading}>
                      Completed Matches
                    </AppText>
                  </View>
                  <AppText variant="caption" style={styles.matchCountMuted}>
                    {displayedMatches.completed.length}
                  </AppText>
                </View>

                {displayedMatches.completed.map((m, idx) => {
                  const teamAName = m.team_a?.name || m.side_a_participants?.map((p) => p.display_name).join(' & ') || 'Team A';
                  const teamBName = m.team_b?.name || m.side_b_participants?.map((p) => p.display_name).join(' & ') || 'Team B';
                  const isAWinner = (m.score_a || 0) > (m.score_b || 0);

                  return (
                    <View key={m.id || idx} style={styles.matchCard}>
                      <View style={styles.matchCardTopRow}>
                        <AppText variant="caption" bold style={styles.matchRoundText}>
                          Round {m.round_number || 1} • Match #{m.match_number || idx + 1}
                        </AppText>
                        <AppText variant="caption" bold style={{ color: '#059669' }}>
                          FINAL
                        </AppText>
                      </View>

                      <View style={styles.completedScoreRow}>
                        <AppText variant="bodySmall" bold style={[styles.completedTeamName, isAWinner && styles.winnerText]}>
                          {teamAName} {isAWinner ? '✓' : ''}
                        </AppText>
                        <AppText variant="bodySmall" bold style={[styles.completedScoreNum, isAWinner && styles.winnerText]}>
                          {m.score_a ?? 0}
                        </AppText>
                      </View>

                      <View style={styles.completedScoreRow}>
                        <AppText variant="bodySmall" bold style={[styles.completedTeamName, !isAWinner && styles.winnerText]}>
                          {teamBName} {!isAWinner ? '✓' : ''}
                        </AppText>
                        <AppText variant="bodySmall" bold style={[styles.completedScoreNum, !isAWinner && styles.winnerText]}>
                          {m.score_b ?? 0}
                        </AppText>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {displayedMatches.live.length === 0 && displayedMatches.upcoming.length === 0 && displayedMatches.completed.length === 0 && (
              <View style={styles.emptyContainer}>
                <EmptyState
                  title={format === 'scramble' && allMatches.length === 0 ? "Matchups Not Yet Published" : "No Matches Available"}
                  description={
                    format === 'scramble' && allMatches.length === 0
                      ? "The club has not published this round's matchups yet. Partner and court assignments will appear here once ready."
                      : matchFilter !== 'all'
                      ? `No ${matchFilter} matches found for this tournament.`
                      : 'Match fixtures will be displayed as the competition progresses.'
                  }
                />
              </View>
            )}
          </View>
        )}

        {/* ─── TAB 3: PLAYERS ─── */}
        {activeTab === 'players' && (
          <View style={styles.tabContentArea}>
            {/* Header: Registered Players Count */}
            <View style={styles.playersHeaderRow}>
              <AppText variant="body" bold style={styles.cardTitle}>
                Registered Players ({playersList.length} / {maxCapacity})
              </AppText>
            </View>

            {/* Search Input */}
            <View style={styles.searchBarContainer}>
              <Search size={18} color="#94A3B8" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search players by name"
                placeholderTextColor="#94A3B8"
                value={playerSearchQuery}
                onChangeText={setPlayerSearchQuery}
                autoCorrect={false}
              />
            </View>

            {playersList.length === 0 ? (
              <View style={styles.emptyContainer}>
                <EmptyState
                  title="No Registered Players"
                  description={
                    playerSearchQuery.trim()
                      ? `No players matching "${playerSearchQuery}".`
                      : "Registered participants will appear here as they sign up."
                  }
                />
              </View>
            ) : (
              <>
                {/* Player Table Column Headers */}
                <View style={styles.playerColHeaderRow}>
                  <View style={{ flex: 1 }} />
                  <AppText variant="caption" bold style={styles.playerColHeader}>
                    W - L
                  </AppText>
                  <AppText variant="caption" bold style={[styles.playerColHeader, { width: 44, textAlign: 'right' }]}>
                    Points
                  </AppText>
                  <View style={{ width: 20 }} />
                </View>

                {/* Player Rows */}
                <View style={styles.playerListContainer}>
                  {playersList.map((p, idx) => {
                    const rankNum = idx + 1;
                    return (
                      <View key={p.id || idx} style={styles.playerRowItem}>
                        {/* Rank Badge */}
                        <View style={styles.rankCol}>
                          {rankNum === 1 ? (
                            <View style={styles.rankGoldCircle}>
                              <AppText variant="caption" bold style={styles.rankGoldText}>1</AppText>
                            </View>
                          ) : rankNum === 2 ? (
                            <View style={styles.rankSilverCircle}>
                              <AppText variant="caption" bold style={styles.rankSilverText}>2</AppText>
                            </View>
                          ) : rankNum === 3 ? (
                            <View style={styles.rankBronzeCircle}>
                              <AppText variant="caption" bold style={styles.rankBronzeText}>3</AppText>
                            </View>
                          ) : (
                            <AppText variant="caption" bold style={styles.rankDefaultText}>
                              {rankNum}
                            </AppText>
                          )}
                        </View>

                        {/* Avatar */}
                        <View style={[styles.playerAvatarCircle, { backgroundColor: getAvatarBg(p.name) }]}>
                          <AppText variant="caption" bold style={{ color: getAvatarTextColor(p.name) }}>
                            {p.name.charAt(0)}
                          </AppText>
                        </View>

                        {/* Name & Skill */}
                        <View style={styles.playerNameCol}>
                          <AppText variant="bodySmall" bold style={styles.playerNameText} numberOfLines={1}>
                            {p.name}
                          </AppText>
                          <AppText variant="caption" style={styles.playerSkillText}>
                            {p.skill}
                          </AppText>
                        </View>

                        {/* W - L */}
                        <AppText variant="bodySmall" bold style={styles.playerRecordText}>
                          {p.wins} - {p.losses}
                        </AppText>

                        {/* Points */}
                        <AppText variant="bodySmall" bold style={styles.playerPointsText}>
                          {p.points}
                        </AppText>

                        <ChevronRight size={16} color="#94A3B8" />
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {/* Bottom Summary Card */}
            <View style={styles.playerBottomCard}>
              <View style={styles.mintIconCircle}>
                <Users size={18} color="#059669" strokeWidth={2.4} />
              </View>
              <View style={styles.playerBottomContent}>
                <AppText variant="bodySmall" bold style={styles.playerBottomTitle}>
                  Total registered players
                </AppText>
                <AppText variant="caption" style={styles.playerBottomSub}>
                  {maxCapacity ? `${registeredCount} of ${maxCapacity} spots filled` : `${registeredCount} registered`}
                </AppText>
              </View>
            </View>
          </View>
        )}

        {/* ─── TAB 4: STANDINGS ─── */}
        {activeTab === 'standings' && (
          <View style={styles.tabContentArea}>
            {/* Header */}
            <View style={styles.standingsHeaderRow}>
              <AppText variant="body" bold style={styles.cardTitle}>
                Live Standings
              </AppText>
            </View>

            {/* Pool Filter Chips (If Pool Play) */}
            {format === 'pool_play' && pools.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.poolChipScroll}>
                <TouchableOpacity
                  style={[styles.filterChip, selectedPoolId === 'all' && styles.filterChipActive]}
                  onPress={() => setSelectedPoolId('all')}
                  activeOpacity={0.7}
                >
                  <AppText
                    variant="caption"
                    bold
                    style={[styles.filterChipText, selectedPoolId === 'all' && styles.filterChipTextActive]}
                  >
                    All Pools
                  </AppText>
                </TouchableOpacity>
                {pools.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.filterChip, selectedPoolId === p.id && styles.filterChipActive]}
                    onPress={() => setSelectedPoolId(p.id)}
                    activeOpacity={0.7}
                  >
                    <AppText
                      variant="caption"
                      bold
                      style={[styles.filterChipText, selectedPoolId === p.id && styles.filterChipTextActive]}
                    >
                      {p.name}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Standings Table Card */}
            {standingsRows.length === 0 ? (
              <View style={styles.emptyContainer}>
                <EmptyState
                  title="No Standings Available"
                  description="Standings will update automatically as match results are recorded."
                />
              </View>
            ) : (
              <View style={styles.standingsTableCard}>
                {/* Table Header */}
                <View style={styles.standingsTableHeader}>
                  <AppText variant="caption" bold style={[styles.standingsColHeader, { width: 28 }]}>
                    #
                  </AppText>
                  <AppText variant="caption" bold style={[styles.standingsColHeader, { flex: 1, textAlign: 'left', paddingLeft: 8 }]}>
                    Player
                  </AppText>
                  <AppText variant="caption" bold style={[styles.standingsColHeader, { width: 34 }]}>
                    W
                  </AppText>
                  <AppText variant="caption" bold style={[styles.standingsColHeader, { width: 34 }]}>
                    L
                  </AppText>
                  <AppText variant="caption" bold style={[styles.standingsColHeader, { width: 38 }]}>
                    PTS
                  </AppText>
                  <AppText variant="caption" bold style={[styles.standingsColHeader, { width: 42, textAlign: 'right' }]}>
                    PD
                  </AppText>
                </View>

                {/* Table Rows */}
                {standingsRows.map((s, idx) => {
                  const rankNum = s.rank || idx + 1;
                  const pdFormatted = s.points_differential > 0 ? `+${s.points_differential}` : `${s.points_differential || 0}`;

                  return (
                    <View key={s.team_id || idx} style={styles.standingsRow}>
                      {/* Rank Badge */}
                      <View style={styles.rankColSmall}>
                        {rankNum === 1 ? (
                          <View style={styles.rankGoldCircle}>
                            <AppText variant="caption" bold style={styles.rankGoldText}>1</AppText>
                          </View>
                        ) : rankNum === 2 ? (
                          <View style={styles.rankSilverCircle}>
                            <AppText variant="caption" bold style={styles.rankSilverText}>2</AppText>
                          </View>
                        ) : rankNum === 3 ? (
                          <View style={styles.rankBronzeCircle}>
                            <AppText variant="caption" bold style={styles.rankBronzeText}>3</AppText>
                          </View>
                        ) : (
                          <AppText variant="caption" bold style={styles.rankDefaultText}>
                            {rankNum}
                          </AppText>
                        )}
                      </View>

                      {/* Avatar */}
                      <View style={[styles.avatarCircleSmall, { backgroundColor: getAvatarBg(s.team_name), marginHorizontal: 8 }]}>
                        <AppText variant="caption" bold style={{ color: getAvatarTextColor(s.team_name), fontSize: 11 }}>
                          {s.team_name.charAt(0)}
                        </AppText>
                      </View>

                      {/* Name */}
                      <AppText variant="bodySmall" bold style={styles.standingsPlayerName} numberOfLines={1}>
                        {s.team_name}
                      </AppText>

                      {/* W */}
                      <AppText variant="bodySmall" bold style={styles.standingsNumCell}>
                        {s.wins}
                      </AppText>

                      {/* L */}
                      <AppText variant="bodySmall" bold style={styles.standingsNumCell}>
                        {s.losses}
                      </AppText>

                      {/* PTS */}
                      <AppText variant="bodySmall" bold style={styles.standingsNumCell}>
                        {s.points_scored}
                      </AppText>

                      {/* PD */}
                      <AppText
                        variant="bodySmall"
                        bold
                        style={[
                          styles.standingsNumCell,
                          {
                            width: 42,
                            textAlign: 'right',
                            color: s.points_differential > 0 ? '#059669' : s.points_differential < 0 ? '#DC2626' : '#64748B',
                          },
                        ]}
                      >
                        {pdFormatted}
                      </AppText>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Card: How Standings Work */}
            <View style={styles.howStandingsCard}>
              <View style={styles.howStandingsHeader}>
                <View style={styles.lightbulbCircle}>
                  <Lightbulb size={20} color="#D97706" strokeWidth={2.4} />
                </View>
                <AppText variant="body" bold style={styles.howStandingsTitle}>
                  How Standings Work
                </AppText>
              </View>

              <View style={styles.howStandingsBody}>
                <AppText variant="caption" style={styles.howStandingsRuleItem}>
                  1. Wins
                </AppText>
                <AppText variant="caption" style={styles.howStandingsRuleItem}>
                  2. Points Differential
                </AppText>
                <AppText variant="caption" style={styles.howStandingsRuleItem}>
                  3. Total Points
                </AppText>
                <AppText variant="caption" style={styles.howStandingsRuleItem}>
                  4. Deterministic (if still tied)
                </AppText>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topNavBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 10,
  },
  navBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  navIconButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 28,
  },

  /* ─── Hero Banner ─── */
  heroCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    overflow: 'hidden',
    height: 200,
    position: 'relative',
  },
  heroBannerImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  heroContent: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroBottomBlock: {
    marginTop: 'auto',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0C4A6E',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4.5,
  },
  livePulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#38BDF8',
    marginRight: 6,
  },
  liveBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  formatBadge: {
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 4.5,
  },
  formatBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 8,
    lineHeight: 28,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  metaDot: {
    color: 'rgba(255, 255, 255, 0.5)',
    marginHorizontal: 8,
    fontSize: 13,
  },

  /* ─── Tabs ─── */
  tabsRow: {
    marginHorizontal: 16,
    marginTop: 18,
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tabBtn: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginRight: 20,
    position: 'relative',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#064E3B',
    fontWeight: '700',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#064E3B',
    borderRadius: 2,
  },
  tabContentArea: {
    marginTop: 12,
  },

  /* ─── Cards ─── */
  infoCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  aboutBodyText: {
    fontSize: 13.5,
    color: '#475569',
    lineHeight: 20,
    marginTop: 2,
  },

  /* ─── Live Status Box ─── */
  liveStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  broadcastIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  liveStatusContent: {
    flex: 1,
    marginRight: 8,
  },
  liveStatusBadgeBox: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  dayProgressText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '600',
  },
  inProgressGreenText: {
    color: '#065F46',
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: 2,
  },

  /* ─── Spec Grid ─── */
  specGrid: {
    marginTop: 2,
  },
  specRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  specCol: {
    flex: 1,
  },
  specIconLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  specIcon: {
    marginRight: 6,
  },
  gridLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  gridValue: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '700',
    paddingLeft: 21,
  },
  gridDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },

  /* ─── Rules ─── */
  rulesContainer: {
    marginTop: 2,
  },
  ruleCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  checkIcon: {
    marginRight: 10,
  },
  ruleText: {
    fontSize: 13.5,
    color: '#334155',
    fontWeight: '500',
    flex: 1,
  },
  fullRulesLink: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 8,
    paddingTop: 12,
  },
  fullRulesText: {
    fontSize: 13.5,
    color: '#047857',
    fontWeight: '600',
  },

  /* ─── Match Filter Chips ─── */
  filterChipScroll: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 9999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  filterChipText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  matchesSection: {
    marginTop: 8,
  },
  sectionHeaderRow: {
    marginHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitleWithDot: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  redLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    marginRight: 8,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  matchCountMuted: {
    fontSize: 13,
    color: '#64748B',
  },

  /* ─── Match Card ─── */
  matchCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  matchCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  matchRoundText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  matchCourtText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '600',
  },
  liveRedPill: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  liveRedPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  matchParticipantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  avatarCircleSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  matchParticipantName: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '700',
    flex: 1,
  },
  servingDotGreen: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 10,
  },
  scoresRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  setScoreText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
    width: 18,
    textAlign: 'center',
  },
  gameWonBoxGreen: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  gameWonTextGreen: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '700',
  },
  gameWonBoxGray: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  gameWonTextGray: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  matchCardFooter: {
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
    marginTop: 8,
    paddingTop: 6,
  },
  gameOfInfo: {
    color: '#64748B',
    fontSize: 11.5,
  },
  upcomingTeamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  upcomingTeamSide: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  upcomingTeamText: {
    fontSize: 13.5,
    color: '#0F172A',
    fontWeight: '700',
    flex: 1,
  },
  vsText: {
    color: '#94A3B8',
    fontSize: 12,
    marginHorizontal: 8,
  },
  completedScoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  completedTeamName: {
    fontSize: 14,
    color: '#475569',
  },
  completedScoreNum: {
    fontSize: 14,
    color: '#475569',
  },
  winnerText: {
    color: '#059669',
    fontWeight: '700',
  },

  /* ─── Players Tab ─── */
  playersHeaderRow: {
    marginHorizontal: 16,
    marginBottom: 10,
  },
  searchBarContainer: {
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
    paddingVertical: 0,
  },
  playerColHeaderRow: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  playerColHeader: {
    color: '#64748B',
    fontSize: 11.5,
    width: 44,
    textAlign: 'center',
  },
  playerListContainer: {
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
  },
  playerRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  rankCol: {
    width: 28,
    alignItems: 'center',
  },
  rankGoldCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FEF08A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankGoldText: {
    color: '#854D0E',
    fontSize: 11,
    fontWeight: '700',
  },
  rankSilverCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankSilverText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '700',
  },
  rankBronzeCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFEDD5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankBronzeText: {
    color: '#9A3412',
    fontSize: 11,
    fontWeight: '700',
  },
  rankDefaultText: {
    color: '#64748B',
    fontSize: 13,
  },
  playerAvatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  playerNameCol: {
    flex: 1,
  },
  playerNameText: {
    fontSize: 14,
    color: '#0F172A',
  },
  playerSkillText: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  playerRecordText: {
    fontSize: 13,
    color: '#0F172A',
    width: 44,
    textAlign: 'center',
  },
  playerPointsText: {
    fontSize: 13,
    color: '#0F172A',
    width: 44,
    textAlign: 'right',
    marginRight: 6,
  },
  playerBottomCard: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 32,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  mintIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  playerBottomContent: {
    flex: 1,
  },
  playerBottomTitle: {
    fontSize: 14,
    color: '#0F172A',
  },
  playerBottomSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },

  /* ─── Standings Tab ─── */
  standingsHeaderRow: {
    marginHorizontal: 16,
    marginBottom: 10,
  },
  poolChipScroll: {
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  standingsTableCard: {
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  standingsTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  standingsColHeader: {
    color: '#64748B',
    fontSize: 11.5,
    textAlign: 'center',
  },
  standingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  rankColSmall: {
    width: 24,
    alignItems: 'center',
  },
  standingsPlayerName: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
  },
  standingsNumCell: {
    fontSize: 13,
    color: '#0F172A',
    width: 34,
    textAlign: 'center',
  },
  howStandingsCard: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 32,
    backgroundColor: '#FFFDF5',
    borderWidth: 1,
    borderColor: '#FEF08A',
    borderRadius: 16,
    padding: 16,
  },
  howStandingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  lightbulbCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  howStandingsTitle: {
    fontSize: 15,
    color: '#78350F',
  },
  howStandingsBody: {
    paddingLeft: 42,
  },
  howStandingsRuleItem: {
    fontSize: 13,
    color: '#78350F',
    marginBottom: 4,
    fontWeight: '500',
  },
  emptyContainer: {
    paddingVertical: 32,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
