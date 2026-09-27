/**
 * Aught2 Pickleball — Finished Round Robin Tournament Details (Player Side)
 *
 * Implements the exact 4-screen UI design from the reference image:
 *   1. Overview & Rules
 *   2. Matches
 *   3. Standings
 *   4. Results
 *
 * Features:
 *   - Shared fixed top navigation bar (Back arrow, 'Tournaments', Share & Three-dot menu)
 *   - Shared hero banner with pickleball court photo, dark green overlay,
 *     [🏆 COMPLETED] badge on top-left, [ROUND ROBIN] purple capsule on top-right,
 *     large white title, 'Hosted by ...', and metadata row (dates, location, division)
 *   - 4-tab horizontal pill navigation directly beneath the banner
 *   - Exact matching cards, typography, colors, badges, tables, podium and spacing
 *   - Sourced from backend data hooks (usePlayerMatches, usePlayerStandings, usePlayerTeams, useAuth)
 */

import React, { useState, useMemo } from 'react';
import {
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Activity,
  ArrowLeft,
  Award,
  BarChart2,
  Calendar,
  Clock,
  FileText,
  MapPin,
  Medal,
  MoreVertical,
  Scale,
  Share2,
  Tag,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react-native';

import { AppText } from '../AppText';
import { Card } from '../Card';
import { Colors, Radius, Shadows, Spacing, Typography } from '@/theme';
import { formatDate } from '@/utils';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';
import {
  usePlayerMatches,
  usePlayerStandings,
  usePlayerTeams,
  useAuth,
} from '@/hooks';
import type { Match, StandingRow, Tournament } from '@/types';

interface CompletedRoundRobinViewProps {
  tournament: Tournament;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  isRefreshing?: boolean;
}

type TabType = 'overview' | 'matches' | 'standings' | 'results';
type MatchFilter = 'all' | 'my' | 'court';

interface MatchSetScores {
  teamASets: (number | string)[];
  teamBSets: (number | string)[];
  teamAWinsSet: boolean[];
  teamBWinsSet: boolean[];
}

// Team avatar color styles
function getTeamAvatarStyle(name: string) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const colorMap: Record<string, { bg: string; text: string }> = {
    'Pickle Kings': { bg: '#FED7AA', text: '#C2410C' }, // Orange
    'Court Dynamos': { bg: '#FFEDD5', text: '#EA580C' }, // Deep Amber
    'Net Masters': { bg: '#DDD6FE', text: '#6D28D9' }, // Purple
  };

  return {
    initials,
    ...(colorMap[name] || { bg: '#E2E8F0', text: '#334155' }),
  };
}

export function CompletedRoundRobinView({
  tournament,
  onBack,
  onRefresh,
  isRefreshing = false,
}: CompletedRoundRobinViewProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('all');
  const [selectedCourt, setSelectedCourt] = useState<string>('all');

  // Backend data hooks
  const tournamentId = tournament.id;
  const { matches = [], refetch: refetchMatches } = usePlayerMatches(tournamentId);
  const { standings = [], refetch: refetchStandings } = usePlayerStandings(tournamentId);
  const { teams = [], refetch: refetchTeams } = usePlayerTeams(tournamentId);

  // Configuration parser
  const parsedConfig = useMemo(() => parseTournamentConfig(tournament), [tournament]);
  const isSingles = parsedConfig.isSingles;

  // Global refresh
  const handleInternalRefresh = async () => {
    await Promise.all([
      onRefresh(),
      refetchMatches(),
      refetchStandings(),
      refetchTeams(),
    ]);
  };

  // Share action
  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out the finished tournament results for ${tournament.name}!`,
        title: tournament.name,
      });
    } catch {
      // Ignore dismissed share
    }
  };

  // More menu action
  const handleMore = () => {
    Alert.alert(
      tournament.name,
      'Tournament completed. You can view all results, matches, and standings.',
      [{ text: 'Close', style: 'cancel' }]
    );
  };

  // Helper to resolve player names for a team
  const getTeamPlayerNames = (teamName: string, teamId?: string | null): string => {
    if (isSingles) return '';
    if (teamId) {
      const foundTeam = teams.find((t) => t.id === teamId);
      if (foundTeam && foundTeam.members && foundTeam.members.length > 0) {
        return foundTeam.members.map((m) => m.display_name || 'Player').join(' & ');
      }
    }
    return '';
  };

  // Resolved matches with chronological ordering and court/player metadata
  const resolvedMatches = useMemo(() => {
    const list = matches.length > 0 ? [...matches] : [];
    // Sort chronologically by scheduled_start_at or match_number
    list.sort((a, b) => {
      if (a.scheduled_start_at && b.scheduled_start_at) {
        return new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime();
      }
      return (a.match_number ?? 0) - (b.match_number ?? 0);
    });
    return list;
  }, [matches]);

  // Available courts from matches
  const availableCourts = useMemo(() => {
    const set = new Set<string>();
    resolvedMatches.forEach((m, idx) => {
      const courtLabel = (m as any).court?.name || (m.court_id ? `Court ${m.court_id}` : (idx % 2 === 0 ? 'Court 1' : 'Court 2'));
      set.add(courtLabel);
    });
    return Array.from(set);
  }, [resolvedMatches]);

  // Filtered matches for Tab 2
  const displayedMatches = useMemo(() => {
    return resolvedMatches.filter((m, idx) => {
      const courtLabel = (m as any).court?.name || (m.court_id ? `Court ${m.court_id}` : (idx % 2 === 0 ? 'Court 1' : 'Court 2'));

      if (matchFilter === 'my') {
        if (!user) return false;
        const teamA = teams.find((t) => t.id === m.team_a_id);
        const teamB = teams.find((t) => t.id === m.team_b_id);
        const inTeamA = teamA?.members?.some((mem) => mem.user_id === user.id) ?? false;
        const inTeamB = teamB?.members?.some((mem) => mem.user_id === user.id) ?? false;
        return inTeamA || inTeamB;
      }

      if (matchFilter === 'court' && selectedCourt !== 'all') {
        return courtLabel === selectedCourt;
      }

      return true;
    });
  }, [resolvedMatches, matchFilter, selectedCourt, teams, user]);

  // Resolved Standings from actual records
  const resolvedStandings = useMemo(() => {
    if (standings.length > 0) {
      return standings.map((s, idx) => {
        const ptsFor = s.points_scored ?? 0;
        const ptsAgainst = s.points_allowed ?? 0;
        const diff = ptsFor - ptsAgainst;

        return {
          ...s,
          rank: idx + 1,
          wins: s.wins ?? 0,
          losses: s.losses ?? 0,
          points_scored: ptsFor,
          points_allowed: ptsAgainst,
          points_differential: diff,
          players: getTeamPlayerNames(s.team_name, s.team_id),
        };
      });
    }

    return [];
  }, [standings, teams, isSingles]);

  // Results podium: Champion, Runner-Up, 3rd Place
  const resultsData = useMemo(() => {
    const champion = resolvedStandings.length > 0 ? resolvedStandings[0] : null;
    const runnerUp = resolvedStandings.length > 1 ? resolvedStandings[1] : null;
    const thirdPlace = resolvedStandings.length > 2 ? resolvedStandings[2] : null;

    return {
      champion,
      runnerUp,
      thirdPlace,
      totalMatches: matches.length,
      completedMatches: matches.filter((m) => m.status === 'completed').length,
      totalTeams: teams.length,
    };
  }, [resolvedStandings, matches, teams]);

  return (
    <View style={styles.root}>
      {/* ─── 1. Fixed Top Navigation Bar ─── */}
      <View style={[styles.topNavBar, { paddingTop: insets.top }]}>
        <View style={styles.navBarInner}>
          <TouchableOpacity
            onPress={onBack}
            style={styles.navBackButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="Back to tournaments"
          >
            <ArrowLeft size={22} color="#0F172A" />
            <AppText variant="body" bold style={styles.navTitle}>
              Tournaments
            </AppText>
          </TouchableOpacity>

          <View style={styles.navActionsRow}>
            <TouchableOpacity
              onPress={handleShare}
              style={styles.navIconButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Share tournament"
            >
              <Share2 size={20} color="#0F172A" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleMore}
              style={styles.navIconButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="More options"
            >
              <MoreVertical size={20} color="#0F172A" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ─── 2. Scrollable Body ─── */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(insets.top, 12) + 54 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => void handleInternalRefresh()} />
        }
      >
        {/* ─── Shared Hero Banner ─── */}
        <View style={styles.heroBanner}>
          <Image
            source={require('../../../assets/tournaments/banner2.jpg')}
            style={styles.heroImage}
            resizeMode="cover"
          />
          {/* Dark green translucent overlay for legibility */}
          <View style={styles.heroOverlay} />

          <View style={styles.heroInner}>
            {/* Top Row: Completed Badge & Round Robin Badge */}
            <View style={styles.heroBadgesRow}>
              <View style={styles.completedBadge}>
                <Trophy size={12} color="#FFFFFF" style={{ marginRight: 5 }} />
                <AppText variant="caption" bold style={styles.completedBadgeText}>
                  COMPLETED
                </AppText>
              </View>

              <View style={styles.roundRobinBadge}>
                <AppText variant="caption" bold style={styles.roundRobinBadgeText}>
                  ROUND ROBIN
                </AppText>
              </View>
            </View>

            {/* Tournament Details Info */}
            <View style={styles.heroInfoBlock}>
              <AppText variant="heading1" style={styles.heroTitle}>
                {tournament.name}
              </AppText>

              <AppText variant="bodySmall" style={styles.heroHost}>
                Hosted by {tournament.location_name || 'Indoor Courts'}
              </AppText>

              {/* Metadata Row */}
              <View style={styles.heroMetaRow}>
                <View style={styles.heroMetaItem}>
                  <Calendar size={13} color="#CBD5E1" style={{ marginRight: 4 }} />
                  <AppText variant="caption" style={styles.heroMetaText}>
                    {formatDate(tournament.start_date)} – {formatDate(tournament.end_date)}
                  </AppText>
                </View>

                <View style={styles.heroMetaItem}>
                  <MapPin size={13} color="#CBD5E1" style={{ marginRight: 4 }} />
                  <AppText variant="caption" style={styles.heroMetaText} numberOfLines={1}>
                    {tournament.location_name || 'Indoor Courts 1-4'}
                  </AppText>
                </View>

                <View style={styles.heroMetaItem}>
                  <Users size={13} color="#CBD5E1" style={{ marginRight: 4 }} />
                  <AppText variant="caption" style={styles.heroMetaText}>
                    {parsedConfig.category || "Men's Doubles"}
                  </AppText>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ─── 4-Tab Navigation Bar ─── */}
        <View style={styles.tabsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsScrollContent}
          >
            {[
              { key: 'overview', label: 'Overview & Rules' },
              { key: 'matches', label: `Matches (${displayedMatches.length})` },
              { key: 'standings', label: 'Standings' },
              { key: 'results', label: 'Results' },
            ].map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tabPill, isActive && styles.tabPillActive]}
                  onPress={() => setActiveTab(tab.key as TabType)}
                  activeOpacity={0.8}
                >
                  <AppText
                    variant="caption"
                    bold
                    style={[styles.tabPillText, isActive && styles.tabPillTextActive]}
                  >
                    {tab.label}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PAGE 1: OVERVIEW & RULES                                    */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <View style={styles.tabContent}>
            {/* Section A: Tournament Summary */}
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <FileText size={18} color="#065F46" />
                </View>
                <AppText variant="heading3" bold style={styles.cardHeading}>
                  Tournament Summary
                </AppText>
              </View>
              <AppText variant="bodySmall" style={styles.summaryText}>
                {tournament.description ||
                  'Completed round robin tournament. Final standings and recorded match results.'}
              </AppText>
            </Card>

            {/* Section B: Competition Details */}
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <FileText size={18} color="#065F46" />
                </View>
                <AppText variant="heading3" bold style={styles.cardHeading}>
                  Competition Details
                </AppText>
              </View>

              <View style={styles.twoColumnGrid}>
                {/* Column 1 */}
                <View style={styles.gridCol}>
                  <View style={styles.detailItem}>
                    <View style={styles.detailIconRow}>
                      <Tag size={15} color="#065F46" style={{ marginRight: 6 }} />
                      <AppText variant="caption" style={styles.detailLabel}>
                        Format
                      </AppText>
                    </View>
                    <AppText variant="bodySmall" bold style={styles.detailValue}>
                      Round Robin
                    </AppText>
                  </View>

                  <View style={styles.detailItem}>
                    <View style={styles.detailIconRow}>
                      <Users size={15} color="#065F46" style={{ marginRight: 6 }} />
                      <AppText variant="caption" style={styles.detailLabel}>
                        Registration Type
                      </AppText>
                    </View>
                    <AppText variant="bodySmall" bold style={styles.detailValue}>
                      {isSingles ? 'Individual (Singles)' : 'Fixed Team (Doubles)'}
                    </AppText>
                  </View>

                  <View style={styles.detailItem}>
                    <View style={styles.detailIconRow}>
                      <UserCheck size={15} color="#065F46" style={{ marginRight: 6 }} />
                      <AppText variant="caption" style={styles.detailLabel}>
                        Gender Eligibility
                      </AppText>
                    </View>
                    <AppText variant="bodySmall" bold style={styles.detailValue}>
                      {parsedConfig.genderEligibility || 'Any'}
                    </AppText>
                  </View>
                </View>

                {/* Column 2 */}
                <View style={styles.gridCol}>
                  <View style={styles.detailItem}>
                    <View style={styles.detailIconRow}>
                      <Trophy size={15} color="#065F46" style={{ marginRight: 6 }} />
                      <AppText variant="caption" style={styles.detailLabel}>
                        Division
                      </AppText>
                    </View>
                    <AppText variant="bodySmall" bold style={styles.detailValue}>
                      {parsedConfig.category || "Men's Doubles"}
                    </AppText>
                  </View>

                  <View style={styles.detailItem}>
                    <View style={styles.detailIconRow}>
                      <Activity size={15} color="#065F46" style={{ marginRight: 6 }} />
                      <AppText variant="caption" style={styles.detailLabel}>
                        Skill Requirement
                      </AppText>
                    </View>
                    <AppText variant="bodySmall" bold style={styles.detailValue}>
                      {parsedConfig.skillLevel || '4.0 Level'}
                    </AppText>
                  </View>

                  <View style={styles.detailItem}>
                    <View style={styles.detailIconRow}>
                      <Calendar size={15} color="#065F46" style={{ marginRight: 6 }} />
                      <AppText variant="caption" style={styles.detailLabel}>
                        Age Limits
                      </AppText>
                    </View>
                    <AppText variant="bodySmall" bold style={styles.detailValue}>
                      {parsedConfig.ageRestrictionText || 'All Ages'}
                    </AppText>
                  </View>
                </View>
              </View>
            </Card>

            {/* Section C: Schedule & Venue */}
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <Calendar size={18} color="#065F46" />
                </View>
                <AppText variant="heading3" bold style={styles.cardHeading}>
                  Schedule & Venue
                </AppText>
              </View>

              <View style={styles.twoColumnGrid}>
                {/* Event Dates */}
                <View style={styles.gridCol}>
                  <View style={styles.detailItem}>
                    <View style={styles.detailIconRow}>
                      <Calendar size={15} color="#065F46" style={{ marginRight: 6 }} />
                      <AppText variant="caption" style={styles.detailLabel}>
                        Event Dates
                      </AppText>
                    </View>
                    <AppText variant="bodySmall" bold style={styles.detailValue}>
                      {formatDate(tournament.start_date)} – {formatDate(tournament.end_date)}
                    </AppText>
                  </View>
                </View>

                {/* Registration Window */}
                <View style={styles.gridCol}>
                  <View style={styles.detailItem}>
                    <View style={styles.detailIconRow}>
                      <Clock size={15} color="#065F46" style={{ marginRight: 6 }} />
                      <AppText variant="caption" style={styles.detailLabel}>
                        Registration Window
                      </AppText>
                    </View>
                    <AppText variant="caption" bold style={styles.detailValue}>
                      Opens: {formatDate(tournament.registration_open_at || tournament.start_date)}
                    </AppText>
                    <AppText variant="caption" bold style={styles.detailValue}>
                      Closes: {formatDate(tournament.registration_close_at || tournament.end_date)}
                    </AppText>
                  </View>
                </View>
              </View>

              {/* Location */}
              <View style={[styles.detailItem, { marginTop: 12 }]}>
                <View style={styles.detailIconRow}>
                  <MapPin size={15} color="#065F46" style={{ marginRight: 6 }} />
                  <AppText variant="caption" style={styles.detailLabel}>
                    Location
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.detailValue}>
                  {tournament.location_name || 'Indoor Courts 1-4'}
                </AppText>
              </View>
            </Card>

            {/* Section D: Official Rules & Scoring */}
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <Scale size={18} color="#065F46" />
                </View>
                <AppText variant="heading3" bold style={styles.cardHeading}>
                  Official Rules & Scoring
                </AppText>
              </View>

              <View style={styles.rulesRow}>
                <Tag size={15} color="#065F46" style={{ marginRight: 8, marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <AppText variant="caption" style={styles.detailLabel}>
                    Game Format
                  </AppText>
                  <AppText variant="bodySmall" bold style={styles.detailValue}>
                    {(tournament.scoring_rules as any)?.description || 'First to 11 points, win by 2.'}
                  </AppText>
                </View>
              </View>

              <View style={[styles.rulesRow, { marginTop: 12 }]}>
                <Scale size={15} color="#065F46" style={{ marginRight: 8, marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <AppText variant="caption" style={styles.detailLabel}>
                    Tiebreaker Priority
                  </AppText>
                  <View style={styles.tiebreakerList}>
                    <AppText variant="bodySmall" style={styles.tiebreakerItemText}>
                      1. Head-to-head match wins
                    </AppText>
                    <AppText variant="bodySmall" style={styles.tiebreakerItemText}>
                      2. Total points differential
                    </AppText>
                    <AppText variant="bodySmall" style={styles.tiebreakerItemText}>
                      3. Total points scored
                    </AppText>
                  </View>
                </View>
              </View>
            </Card>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PAGE 2: MATCHES                                             */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'matches' && (
          <View style={styles.tabContent}>
            {/* Filter Buttons */}
            <View style={styles.matchFiltersRow}>
              <TouchableOpacity
                style={[styles.filterChip, matchFilter === 'all' && styles.filterChipActive]}
                onPress={() => setMatchFilter('all')}
                activeOpacity={0.8}
              >
                <AppText
                  variant="caption"
                  bold
                  style={[styles.filterChipText, matchFilter === 'all' && styles.filterChipTextActive]}
                >
                  All Matches ({resolvedMatches.length})
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterChip, matchFilter === 'my' && styles.filterChipActive]}
                onPress={() => setMatchFilter('my')}
                activeOpacity={0.8}
              >
                <AppText
                  variant="caption"
                  bold
                  style={[styles.filterChipText, matchFilter === 'my' && styles.filterChipTextActive]}
                >
                  My Matches
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterChip, matchFilter === 'court' && styles.filterChipActive]}
                onPress={() => setMatchFilter('court')}
                activeOpacity={0.8}
              >
                <AppText
                  variant="caption"
                  bold
                  style={[styles.filterChipText, matchFilter === 'court' && styles.filterChipTextActive]}
                >
                  By Court
                </AppText>
              </TouchableOpacity>
            </View>

            {/* Court Selection Sub-chips if 'By Court' is active */}
            {matchFilter === 'court' && (
              <View style={styles.courtSelectorRow}>
                <TouchableOpacity
                  style={[styles.courtChip, selectedCourt === 'all' && styles.courtChipActive]}
                  onPress={() => setSelectedCourt('all')}
                >
                  <AppText
                    variant="caption"
                    bold
                    style={[styles.courtChipText, selectedCourt === 'all' && styles.courtChipTextActive]}
                  >
                    All Courts
                  </AppText>
                </TouchableOpacity>

                {availableCourts.map((court) => (
                  <TouchableOpacity
                    key={court}
                    style={[styles.courtChip, selectedCourt === court && styles.courtChipActive]}
                    onPress={() => setSelectedCourt(court)}
                  >
                    <AppText
                      variant="caption"
                      bold
                      style={[styles.courtChipText, selectedCourt === court && styles.courtChipTextActive]}
                    >
                      {court}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Empty State for My Matches */}
            {displayedMatches.length === 0 && (
              <Card style={styles.emptyCard}>
                <Users size={36} color="#94A3B8" style={{ marginBottom: 8 }} />
                <AppText variant="body" bold style={{ color: '#0F172A', marginBottom: 4 }}>
                  No Matches Found
                </AppText>
                <AppText variant="bodySmall" style={{ color: '#64748B', textAlign: 'center' }}>
                  {matchFilter === 'my'
                    ? 'You did not participate in any matches in this tournament.'
                    : 'No matches found for the selected court filter.'}
                </AppText>
              </Card>
            )}

            {/* Match Cards List */}
            {displayedMatches.map((match, idx) => {
              const matchNum = match.match_number ?? idx + 1;
              const courtLabel = (match as any).court?.name || (match.court_id ? `Court ${match.court_id}` : (idx % 2 === 0 ? 'Court 1' : 'Court 2'));
              const teamAName = match.team_a?.name || 'Team A';
              const teamBName = match.team_b?.name || 'Team B';

              const teamAPlayers = getTeamPlayerNames(teamAName, match.team_a_id);
              const teamBPlayers = getTeamPlayerNames(teamBName, match.team_b_id);

              const avatarA = getTeamAvatarStyle(teamAName);
              const avatarB = getTeamAvatarStyle(teamBName);

              // Real match scores
              const sA = match.score_a ?? 0;
              const sB = match.score_b ?? 0;
              const scores = {
                teamASets: [sA, '-', '-'],
                teamBSets: [sB, '-', '-'],
                teamAWinsSet: [sA > sB, false, false],
                teamBWinsSet: [sB > sA, false, false],
              };

              // Formatted date and time from actual match record
              const dateStr = match.scheduled_start_at
                ? formatDate(match.scheduled_start_at)
                : formatDate(tournament.start_date);

              return (
                <Card key={match.id || `m-${matchNum}`} style={styles.matchCard}>
                  {/* Card Header */}
                  <View style={styles.matchCardHeader}>
                    <View>
                      <AppText variant="bodySmall" bold style={styles.matchNumText}>
                        Match {matchNum}
                      </AppText>
                      <AppText variant="caption" style={styles.courtText}>
                        {courtLabel}
                      </AppText>
                    </View>

                    <View style={styles.matchHeaderRight}>
                      <AppText variant="caption" style={styles.matchTimeText}>
                        {dateStr}
                      </AppText>
                      <View style={styles.completedTag}>
                        <AppText variant="caption" bold style={styles.completedTagText}>
                          Completed
                        </AppText>
                      </View>
                    </View>
                  </View>

                  <View style={styles.cardDivider} />

                  {/* Team A Row */}
                  <View style={styles.matchTeamRow}>
                    <View style={[styles.teamAvatar, { backgroundColor: avatarA.bg }]}>
                      <AppText variant="caption" bold style={[styles.teamAvatarText, { color: avatarA.text }]}>
                        {avatarA.initials}
                      </AppText>
                    </View>

                    <View style={styles.teamInfoBlock}>
                      <AppText variant="bodySmall" bold style={styles.teamTitle}>
                        {teamAName}
                      </AppText>
                      {!isSingles && (
                        <AppText variant="caption" style={styles.teamPlayers}>
                          {teamAPlayers}
                        </AppText>
                      )}
                    </View>

                    <View style={styles.setScoreBoxes}>
                      {scores.teamASets.map((setVal, sIdx) => {
                        const isWin = scores.teamAWinsSet[sIdx];
                        return (
                          <View
                            key={sIdx}
                            style={[
                              styles.scoreBox,
                              isWin && styles.scoreBoxWin,
                              setVal === '-' && styles.scoreBoxDash,
                            ]}
                          >
                            <AppText
                              variant="bodySmall"
                              bold
                              style={[
                                styles.scoreBoxText,
                                isWin && styles.scoreBoxTextWin,
                                setVal === '-' && styles.scoreBoxTextDash,
                              ]}
                            >
                              {setVal}
                            </AppText>
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  {/* Team B Row */}
                  <View style={styles.matchTeamRow}>
                    <View style={[styles.teamAvatar, { backgroundColor: avatarB.bg }]}>
                      <AppText variant="caption" bold style={[styles.teamAvatarText, { color: avatarB.text }]}>
                        {avatarB.initials}
                      </AppText>
                    </View>

                    <View style={styles.teamInfoBlock}>
                      <AppText variant="bodySmall" bold style={styles.teamTitle}>
                        {teamBName}
                      </AppText>
                      {!isSingles && (
                        <AppText variant="caption" style={styles.teamPlayers}>
                          {teamBPlayers}
                        </AppText>
                      )}
                    </View>

                    <View style={styles.setScoreBoxes}>
                      {scores.teamBSets.map((setVal, sIdx) => {
                        const isWin = scores.teamBWinsSet[sIdx];
                        return (
                          <View
                            key={sIdx}
                            style={[
                              styles.scoreBox,
                              isWin && styles.scoreBoxWin,
                              setVal === '-' && styles.scoreBoxDash,
                            ]}
                          >
                            <AppText
                              variant="bodySmall"
                              bold
                              style={[
                                styles.scoreBoxText,
                                isWin && styles.scoreBoxTextWin,
                                setVal === '-' && styles.scoreBoxTextDash,
                              ]}
                            >
                              {setVal}
                            </AppText>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PAGE 3: STANDINGS                                           */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'standings' && (
          <View style={styles.tabContent}>
            {/* Section A: Pool Standings */}
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <BarChart2 size={18} color="#065F46" />
                </View>
                <AppText variant="heading3" bold style={styles.cardHeading}>
                  Pool Standings
                </AppText>
              </View>

              {/* Standings Table */}
              {resolvedStandings.length === 0 ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <AppText variant="bodySmall" style={{ color: '#64748B' }}>
                    No standings available yet. Standings will appear as matches are scored.
                  </AppText>
                </View>
              ) : (
                <View style={styles.tableContainer}>
                  {/* Table Header */}
                  <View style={styles.tableHeaderRow}>
                    <AppText variant="caption" bold style={styles.thRank}>
                      #
                    </AppText>
                    <AppText variant="caption" bold style={styles.thTeam}>
                      Team
                    </AppText>
                    <AppText variant="caption" bold style={styles.thStat}>
                      W
                    </AppText>
                    <AppText variant="caption" bold style={styles.thStat}>
                      L
                    </AppText>
                    <AppText variant="caption" bold style={styles.thStatWide}>
                      Pts For
                    </AppText>
                    <AppText variant="caption" bold style={styles.thStatWide}>
                      Pts Against
                    </AppText>
                    <AppText variant="caption" bold style={styles.thDiff}>
                      Diff
                    </AppText>
                  </View>

                  {/* Table Rows */}
                  {resolvedStandings.map((row) => {
                    const isFirst = row.rank === 1;
                    const isDiffPositive = row.points_differential > 0;
                    const isDiffNegative = row.points_differential < 0;

                    return (
                      <View
                        key={row.team_id || `s-${row.rank}`}
                        style={[styles.tableRow, isFirst && styles.tableRowHighlighted]}
                      >
                        {/* Rank Medal / Badge */}
                        <View style={styles.rankCol}>
                          {row.rank === 1 ? (
                            <View style={styles.goldMedalBadge}>
                              <AppText style={styles.medalEmoji}>🥇</AppText>
                            </View>
                          ) : row.rank === 2 ? (
                            <View style={styles.silverMedalBadge}>
                              <AppText style={styles.medalEmoji}>🥈</AppText>
                            </View>
                          ) : row.rank === 3 ? (
                            <View style={styles.bronzeMedalBadge}>
                              <AppText style={styles.medalEmoji}>🥉</AppText>
                            </View>
                          ) : (
                            <AppText variant="bodySmall" bold style={styles.rankNum}>
                              {row.rank}
                            </AppText>
                          )}
                        </View>

                        {/* Team & Players */}
                        <View style={styles.teamCol}>
                          <AppText variant="bodySmall" bold style={styles.tableTeamName}>
                            {row.team_name}
                          </AppText>
                          {!isSingles && (
                            <AppText variant="caption" style={styles.tableTeamPlayers}>
                              {row.players}
                            </AppText>
                          )}
                        </View>

                        {/* W & L */}
                        <AppText variant="bodySmall" style={styles.tdStat}>
                          {row.wins}
                        </AppText>
                        <AppText variant="bodySmall" style={styles.tdStat}>
                          {row.losses}
                        </AppText>

                        {/* Pts For & Against */}
                        <AppText variant="bodySmall" style={styles.tdStatWide}>
                          {row.points_scored}
                        </AppText>
                        <AppText variant="bodySmall" style={styles.tdStatWide}>
                          {row.points_allowed}
                        </AppText>

                        {/* Diff */}
                        <AppText
                          variant="bodySmall"
                          bold
                          style={[
                            styles.tdDiff,
                            isDiffPositive && styles.diffPositive,
                            isDiffNegative && styles.diffNegative,
                          ]}
                        >
                          {isDiffPositive ? `+${row.points_differential}` : `${row.points_differential}`}
                        </AppText>
                      </View>
                    );
                  })}
                </View>
              )}
            </Card>

            {/* Section B: Tie-Breaker Priority */}
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <Scale size={18} color="#065F46" />
                </View>
                <AppText variant="heading3" bold style={styles.cardHeading}>
                  Tie-Breaker Priority
                </AppText>
              </View>

              <View style={styles.numberedRulesList}>
                <View style={styles.numberedRuleRow}>
                  <View style={styles.ruleNumberCircle}>
                    <AppText variant="caption" bold style={styles.ruleNumberText}>
                      1
                    </AppText>
                  </View>
                  <AppText variant="bodySmall" style={styles.ruleDescription}>
                    Head-to-head match wins
                  </AppText>
                </View>

                <View style={styles.numberedRuleRow}>
                  <View style={styles.ruleNumberCircle}>
                    <AppText variant="caption" bold style={styles.ruleNumberText}>
                      2
                    </AppText>
                  </View>
                  <AppText variant="bodySmall" style={styles.ruleDescription}>
                    Total points differential
                  </AppText>
                </View>

                <View style={styles.numberedRuleRow}>
                  <View style={styles.ruleNumberCircle}>
                    <AppText variant="caption" bold style={styles.ruleNumberText}>
                      3
                    </AppText>
                  </View>
                  <AppText variant="bodySmall" style={styles.ruleDescription}>
                    Total points scored
                  </AppText>
                </View>
              </View>
            </Card>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PAGE 4: RESULTS                                             */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'results' && (
          <View style={styles.tabContent}>
            {/* Section A: Official Final Results */}
            <Card style={[styles.card, styles.podiumCard]}>
              <View style={styles.cardHeader}>
                <View style={styles.goldTrophyIconWrap}>
                  <Trophy size={20} color="#D97706" />
                </View>
                <AppText variant="heading3" bold style={styles.goldResultsTitle}>
                  Official Final Results
                </AppText>
              </View>

              {!resultsData.champion ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <AppText variant="bodySmall" style={{ color: '#64748B' }}>
                    Final results and standings will be available once the tournament concludes.
                  </AppText>
                </View>
              ) : (
                /* 3-Column Podium */
                <View style={styles.podiumRow}>
                  {/* 2nd Place: Runner-Up (Left) */}
                  {resultsData.runnerUp ? (
                    <View style={styles.podiumCol}>
                      <View style={styles.silverMedalCircle}>
                        <Medal size={24} color="#64748B" />
                      </View>
                      <View style={styles.podiumBadgeSilver}>
                        <AppText variant="caption" bold style={styles.podiumBadgeSilverText}>
                          RUNNER-UP
                        </AppText>
                      </View>
                      <AppText variant="bodySmall" bold style={styles.podiumTeamName}>
                        {resultsData.runnerUp.team_name}
                      </AppText>
                      {!isSingles && (
                        <AppText variant="caption" style={styles.podiumPlayerNames}>
                          {resultsData.runnerUp.players}
                        </AppText>
                      )}
                    </View>
                  ) : (
                    <View style={styles.podiumCol} />
                  )}

                  {/* 1st Place: Champion (Center - Larger & Elevated) */}
                  <View style={[styles.podiumCol, styles.championPodiumCol]}>
                    <View style={styles.goldTrophyCircle}>
                      <Trophy size={30} color="#D97706" />
                    </View>
                    <View style={styles.podiumBadgeGold}>
                      <AppText variant="caption" bold style={styles.podiumBadgeGoldText}>
                        CHAMPION
                      </AppText>
                    </View>
                    <AppText variant="title" bold style={styles.championTeamName}>
                      {resultsData.champion.team_name}
                    </AppText>
                    {!isSingles && (
                      <AppText variant="caption" style={styles.championPlayerNames}>
                        {resultsData.champion.players}
                      </AppText>
                    )}
                  </View>

                  {/* 3rd Place: Third Place (Right) */}
                  {resultsData.thirdPlace ? (
                    <View style={styles.podiumCol}>
                      <View style={styles.bronzeMedalCircle}>
                        <Medal size={24} color="#EA580C" />
                      </View>
                      <View style={styles.podiumBadgeBronze}>
                        <AppText variant="caption" bold style={styles.podiumBadgeBronzeText}>
                          3RD PLACE
                        </AppText>
                      </View>
                      <AppText variant="bodySmall" bold style={styles.podiumTeamName}>
                        {resultsData.thirdPlace.team_name}
                      </AppText>
                      {!isSingles && (
                        <AppText variant="caption" style={styles.podiumPlayerNames}>
                          {resultsData.thirdPlace.players}
                        </AppText>
                      )}
                    </View>
                  ) : (
                    <View style={styles.podiumCol} />
                  )}
                </View>
              )}
            </Card>

            {/* Section B: Results Summary */}
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <BarChart2 size={18} color="#065F46" />
                </View>
                <AppText variant="heading3" bold style={styles.cardHeading}>
                  Results Summary
                </AppText>
              </View>

              <View style={styles.summaryList}>
                <View style={styles.summaryRow}>
                  <AppText variant="bodySmall" style={styles.summaryLabel}>
                    Total Matches
                  </AppText>
                  <AppText variant="bodySmall" bold style={styles.summaryVal}>
                    {resultsData.totalMatches}
                  </AppText>
                </View>

                <View style={styles.summaryRow}>
                  <AppText variant="bodySmall" style={styles.summaryLabel}>
                    Completed Matches
                  </AppText>
                  <AppText variant="bodySmall" bold style={styles.summaryVal}>
                    {resultsData.completedMatches}
                  </AppText>
                </View>

                <View style={styles.summaryRow}>
                  <AppText variant="bodySmall" style={styles.summaryLabel}>
                    Total Teams
                  </AppText>
                  <AppText variant="bodySmall" bold style={styles.summaryVal}>
                    {resultsData.totalTeams}
                  </AppText>
                </View>

                <View style={styles.summaryRow}>
                  <AppText variant="bodySmall" style={styles.summaryLabel}>
                    Event Duration
                  </AppText>
                  <AppText variant="bodySmall" bold style={styles.summaryVal}>
                    {formatDate(tournament.start_date)} – {formatDate(tournament.end_date)}
                  </AppText>
                </View>
              </View>
            </Card>

            {/* Section C: Awarded Positions */}
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <Award size={18} color="#065F46" />
                </View>
                <AppText variant="heading3" bold style={styles.cardHeading}>
                  Awarded Positions
                </AppText>
              </View>

              <View style={styles.awardedPositionsList}>
                {!resultsData.champion ? (
                  <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                    <AppText variant="bodySmall" color="secondary">
                      No awarded positions yet.
                    </AppText>
                  </View>
                ) : (
                  <>
                    {/* 1st Place */}
                    <View style={styles.awardedRow}>
                      <View style={styles.awardedIconWrap}>
                        <AppText style={styles.medalEmoji}>🥇</AppText>
                      </View>
                      <View style={styles.awardedInfo}>
                        <AppText variant="bodySmall" bold style={styles.awardedTeamName}>
                          {resultsData.champion.team_name}
                        </AppText>
                        {!isSingles && (
                          <AppText variant="caption" style={styles.awardedPlayers}>
                            {resultsData.champion.players}
                          </AppText>
                        )}
                      </View>
                    </View>

                    {/* 2nd Place */}
                    {resultsData.runnerUp && (
                      <View style={styles.awardedRow}>
                        <View style={styles.awardedIconWrap}>
                          <AppText style={styles.medalEmoji}>🥈</AppText>
                        </View>
                        <View style={styles.awardedInfo}>
                          <AppText variant="bodySmall" bold style={styles.awardedTeamName}>
                            {resultsData.runnerUp.team_name}
                          </AppText>
                          {!isSingles && (
                            <AppText variant="caption" style={styles.awardedPlayers}>
                              {resultsData.runnerUp.players}
                            </AppText>
                          )}
                        </View>
                      </View>
                    )}

                    {/* 3rd Place */}
                    {resultsData.thirdPlace && (
                      <View style={styles.awardedRow}>
                        <View style={styles.awardedIconWrap}>
                          <AppText style={styles.medalEmoji}>🥉</AppText>
                        </View>
                        <View style={styles.awardedInfo}>
                          <AppText variant="bodySmall" bold style={styles.awardedTeamName}>
                            {resultsData.thirdPlace.team_name}
                          </AppText>
                          {!isSingles && (
                            <AppText variant="caption" style={styles.awardedPlayers}>
                              {resultsData.thirdPlace.players}
                            </AppText>
                          )}
                        </View>
                      </View>
                    )}
                  </>
                )}
              </View>
            </Card>
          </View>
        )}

        {/* Bottom breathing space */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  /* ─── Fixed Top Nav Bar ─── */
  topNavBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  navBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 52,
  },
  navBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navTitle: {
    color: '#0F172A',
    fontSize: 18,
  },
  navActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  navIconButton: {
    padding: 4,
  },

  /* ─── Scrollable Container ─── */
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },

  /* ─── Hero Banner ─── */
  heroBanner: {
    height: 190,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'flex-start',
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(6, 78, 59, 0.78)', // dark translucent green
  },
  heroInner: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    justifyContent: 'space-between',
  },
  heroBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  completedBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  roundRobinBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roundRobinBadgeText: {
    color: '#7C3AED',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  heroInfoBlock: {
    marginTop: 'auto',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    marginBottom: 2,
  },
  heroHost: {
    color: '#E2E8F0',
    fontSize: 13,
    marginBottom: 8,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  heroMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroMetaText: {
    color: '#CBD5E1',
    fontSize: 11,
  },

  /* ─── 4-Tab Navigation ─── */
  tabsContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 10,
  },
  tabsScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tabPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabPillActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  tabPillText: {
    color: '#475569',
    fontSize: 13,
  },
  tabPillTextActive: {
    color: '#FFFFFF',
  },

  /* ─── Common Tab Content Block ─── */
  tabContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 14,
  },

  /* ─── Card Base ─── */
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  cardHeading: {
    color: '#0F172A',
    fontSize: 16,
  },
  summaryText: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
  },

  /* ─── Two Column Grid ─── */
  twoColumnGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  gridCol: {
    flex: 1,
    gap: 12,
  },
  detailItem: {},
  detailIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  detailLabel: {
    color: '#64748B',
    fontSize: 12,
  },
  detailValue: {
    color: '#0F172A',
    fontSize: 14,
    marginLeft: 21,
  },

  /* ─── Rules & Scoring ─── */
  rulesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tiebreakerList: {
    marginTop: 4,
    gap: 2,
  },
  tiebreakerItemText: {
    color: '#0F172A',
    fontSize: 13,
    lineHeight: 18,
  },

  /* ─── Matches Tab ─── */
  matchFiltersRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  filterChipText: {
    color: '#475569',
    fontSize: 13,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  courtSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  courtChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  courtChipActive: {
    backgroundColor: '#065F46',
    borderColor: '#065F46',
  },
  courtChipText: {
    color: '#475569',
    fontSize: 12,
  },
  courtChipTextActive: {
    color: '#FFFFFF',
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
  },

  /* ─── Match Card ─── */
  matchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.sm,
  },
  matchCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  matchNumText: {
    color: '#0F172A',
    fontSize: 14,
  },
  courtText: {
    color: '#64748B',
    fontSize: 12,
  },
  matchHeaderRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  matchTimeText: {
    color: '#64748B',
    fontSize: 12,
  },
  completedTag: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  completedTagText: {
    color: '#15803D',
    fontSize: 11,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },
  matchTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 5,
  },
  teamAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  teamAvatarText: {
    fontSize: 12,
  },
  teamInfoBlock: {
    flex: 1,
  },
  teamTitle: {
    color: '#0F172A',
    fontSize: 14,
  },
  teamPlayers: {
    color: '#64748B',
    fontSize: 11,
  },
  setScoreBoxes: {
    flexDirection: 'row',
    gap: 6,
  },
  scoreBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBoxWin: {
    backgroundColor: '#DCFCE7',
  },
  scoreBoxDash: {
    backgroundColor: '#F8FAFC',
  },
  scoreBoxText: {
    color: '#334155',
    fontSize: 12,
  },
  scoreBoxTextWin: {
    color: '#15803D',
  },
  scoreBoxTextDash: {
    color: '#94A3B8',
  },

  /* ─── Standings Tab ─── */
  tableContainer: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  thRank: {
    width: 28,
    color: '#64748B',
    fontSize: 11,
  },
  thTeam: {
    flex: 1,
    color: '#64748B',
    fontSize: 11,
  },
  thStat: {
    width: 24,
    textAlign: 'center',
    color: '#64748B',
    fontSize: 11,
  },
  thStatWide: {
    width: 44,
    textAlign: 'center',
    color: '#64748B',
    fontSize: 11,
  },
  thDiff: {
    width: 36,
    textAlign: 'right',
    color: '#64748B',
    fontSize: 11,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  tableRowHighlighted: {
    backgroundColor: '#F0FDF4', // subtle green highlight for 1st place
  },
  rankCol: {
    width: 28,
    alignItems: 'flex-start',
  },
  goldMedalBadge: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  silverMedalBadge: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bronzeMedalBadge: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalEmoji: {
    fontSize: 18,
  },
  rankNum: {
    color: '#64748B',
    fontSize: 13,
  },
  teamCol: {
    flex: 1,
    paddingRight: 6,
  },
  tableTeamName: {
    color: '#0F172A',
    fontSize: 13,
  },
  tableTeamPlayers: {
    color: '#64748B',
    fontSize: 11,
  },
  tdStat: {
    width: 24,
    textAlign: 'center',
    color: '#0F172A',
    fontSize: 13,
  },
  tdStatWide: {
    width: 44,
    textAlign: 'center',
    color: '#0F172A',
    fontSize: 13,
  },
  tdDiff: {
    width: 36,
    textAlign: 'right',
    fontSize: 13,
  },
  diffPositive: {
    color: '#15803D',
  },
  diffNegative: {
    color: '#DC2626',
  },

  /* ─── Tie-Breaker Priority ─── */
  numberedRulesList: {
    gap: 10,
  },
  numberedRuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ruleNumberCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#065F46',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  ruleNumberText: {
    color: '#FFFFFF',
    fontSize: 11,
  },
  ruleDescription: {
    color: '#0F172A',
    fontSize: 13,
  },

  /* ─── Results Tab (Podium) ─── */
  podiumCard: {
    borderColor: '#FDE68A',
    borderWidth: 1.5,
    backgroundColor: '#FFFDF5',
  },
  goldTrophyIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  goldResultsTitle: {
    color: '#B45309',
    fontSize: 16,
  },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#FEF3C7',
    marginBottom: 8,
  },
  podiumCol: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  championPodiumCol: {
    marginBottom: 10,
  },
  silverMedalCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  goldTrophyCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  bronzeMedalCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FDBA74',
  },
  podiumBadgeSilver: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: 6,
  },
  podiumBadgeSilverText: {
    color: '#64748B',
    fontSize: 9,
  },
  podiumBadgeGold: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 6,
  },
  podiumBadgeGoldText: {
    color: '#B45309',
    fontSize: 10,
  },
  podiumBadgeBronze: {
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: 6,
  },
  podiumBadgeBronzeText: {
    color: '#EA580C',
    fontSize: 9,
  },
  podiumTeamName: {
    color: '#0F172A',
    fontSize: 13,
    textAlign: 'center',
  },
  championTeamName: {
    color: '#0F172A',
    fontSize: 15,
    textAlign: 'center',
  },
  podiumPlayerNames: {
    color: '#64748B',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
  },
  championPlayerNames: {
    color: '#64748B',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
  },

  /* ─── Results Summary ─── */
  summaryList: {
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  summaryLabel: {
    color: '#64748B',
    fontSize: 13,
  },
  summaryVal: {
    color: '#0F172A',
    fontSize: 13,
  },

  /* ─── Awarded Positions ─── */
  awardedPositionsList: {
    gap: 12,
  },
  awardedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  awardedIconWrap: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  awardedInfo: {
    flex: 1,
  },
  awardedTeamName: {
    color: '#0F172A',
    fontSize: 14,
  },
  awardedPlayers: {
    color: '#64748B',
    fontSize: 11,
  },
});
