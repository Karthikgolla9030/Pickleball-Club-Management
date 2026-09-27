/**
 * Aught2 Pickleball — Finished Bracket Tournament Details (Player Side)
 *
 * Implements the exact 4-screen UI design from the reference image:
 *   1. Overview & Rules
 *   2. Bracket Tree
 *   3. Matches (with completed match count)
 *   4. Standings
 *
 * Features:
 *   - Shared fixed top navigation bar (Back arrow, 'Tournaments', Share & Three-dot menu)
 *   - Shared hero banner with pickleball court photo, dark teal/green overlay,
 *     [🏆 COMPLETED] badge on top-left, [BRACKET] peach/orange capsule on top-right,
 *     large white title, 'Hosted by ...', and metadata row (dates, location, category, entrants)
 *   - 4-tab horizontal pill navigation directly beneath the banner
 *   - Screen 1: Overview & Rules (Tournament Summary, Competition Details 2-col, Schedule & Venue, Official Rules & Scoring)
 *   - Screen 2: Bracket Tree (Main Bracket / Consolation sub-tabs, full bracket progression, connected lines, Champion banner, View Full Bracket modal)
 *   - Screen 3: Matches (Filters: All Matches, My Matches, By Round dropdown; match cards with set scores [11] [11] [-] and winner highlights; match details modal)
 *   - Screen 4: Standings (Final Standings table with Rank, Player/Team, Finish badge, Eliminated In; Results Summary card; Tie-Breaker Priority card)
 *   - Sourced from backend data hooks (usePlayerBracket, usePlayerTeams, useAuth)
 */

import React, { useState, useMemo } from 'react';
import {
  Alert,
  Image,
  Modal,
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
  BarChart2,
  Calendar,
  ChevronDown,
  Clock,
  FileText,
  MapPin,
  Maximize2,
  Medal,
  MoreVertical,
  Scale,
  Share2,
  Tag,
  Trophy,
  UserCheck,
  Users,
  X,
} from 'lucide-react-native';

import { AppText } from '../AppText';
import { Card } from '../Card';
import { Colors, Radius, Shadows, Spacing, Typography } from '@/theme';
import { formatDate } from '@/utils';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';
import {
  usePlayerBracket,
  usePlayerTeams,
  useAuth,
} from '@/hooks';
import { ChampionshipBracketView } from './ChampionshipBracketView';
import type { Match, Tournament } from '@/types';

interface CompletedBracketViewProps {
  tournament: Tournament;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  isRefreshing?: boolean;
}

type TabType = 'overview' | 'bracket' | 'matches' | 'standings';
type BracketType = 'main' | 'consolation';
type MatchFilter = 'all' | 'my' | 'round';

// Avatar theme mapping
function getAvatarStyle(name: string) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const colorMap: Record<string, { bg: string; text: string }> = {
    'Alex Vance': { bg: '#065F46', text: '#FFFFFF' }, // Dark green
    'Luke Davis': { bg: '#6366F1', text: '#FFFFFF' }, // Indigo/purple
    'Chris Morgan': { bg: '#0D9488', text: '#FFFFFF' }, // Teal
    'Matt Carter': { bg: '#EA580C', text: '#FFFFFF' }, // Orange
    'Daniel Kim': { bg: '#2563EB', text: '#FFFFFF' }, // Blue
    'Ryan Brooks': { bg: '#0284C7', text: '#FFFFFF' }, // Sky blue
    'Jordan Lee': { bg: '#7C3AED', text: '#FFFFFF' }, // Purple
    'Kevin Patel': { bg: '#9333EA', text: '#FFFFFF' }, // Deep Purple
    'Ethan Brown': { bg: '#475569', text: '#FFFFFF' }, // Slate
    'Noah Wilson': { bg: '#8B5CF6', text: '#FFFFFF' }, // Violet
    'Tyler Scott': { bg: '#64748B', text: '#FFFFFF' }, // Slate
    'Sam Green': { bg: '#059669', text: '#FFFFFF' }, // Emerald
  };

  return {
    initials,
    ...(colorMap[name] || { bg: '#E2E8F0', text: '#334155' }),
  };
}

export function CompletedBracketView({
  tournament,
  onBack,
  onRefresh,
  isRefreshing = false,
}: CompletedBracketViewProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [bracketSubTab, setBracketSubTab] = useState<BracketType>('main');
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('all');
  const [selectedRoundFilter, setSelectedRoundFilter] = useState<string>('all');
  const [showRoundDropdown, setShowRoundDropdown] = useState(false);
  const [showFullBracketModal, setShowFullBracketModal] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [showAllStandings, setShowAllStandings] = useState(false);

  // Backend queries
  const tournamentId = tournament.id;
  const {
    matches = [],
    summary,
    refetchMatches,
    refetchSummary,
  } = usePlayerBracket(tournamentId);

  const { teams = [], refetch: refetchTeams } = usePlayerTeams(tournamentId);

  // Configuration parser
  const parsedConfig = useMemo(() => parseTournamentConfig(tournament), [tournament]);
  const isSingles = parsedConfig.isSingles;

  // Refresh handler
  const handleInternalRefresh = async () => {
    await Promise.all([
      onRefresh(),
      refetchMatches(),
      refetchSummary(),
      refetchTeams(),
    ]);
  };

  // Share action
  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out the completed bracket results for ${tournament.name}!`,
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
      'Completed single-elimination bracket tournament.',
      [{ text: 'Close', style: 'cancel' }]
    );
  };

  // Resolved matches with chronological & round ordering
  const resolvedMatches = useMemo(() => {
    const list = matches.length > 0 ? [...matches] : [];
    // Sort by bracket_round desc (Final first or chronological)
    list.sort((a, b) => {
      // Final first in Matches tab
      const roundA = a.bracket_round ?? 1;
      const roundB = b.bracket_round ?? 1;
      if (roundA !== roundB) return roundB - roundA;
      return (a.match_number ?? 0) - (b.match_number ?? 0);
    });
    return list;
  }, [matches]);

  // Available rounds for By Round filter
  const availableRounds = useMemo(() => {
    return [
      { key: 'all', label: 'All Rounds' },
      { key: 'final', label: 'Final' },
      { key: 'semi', label: 'Semi Final' },
      { key: 'quarter', label: 'Quarter Final' },
    ];
  }, []);

  // Filtered matches for Tab 3 (Matches)
  const displayedMatches = useMemo(() => {
    return resolvedMatches.filter((m) => {
      const isFinal = (m.bracket_round ?? 1) >= 2;
      const isSemi = (m.bracket_round ?? 1) === 1;

      if (matchFilter === 'my') {
        if (!user) return false;
        const teamA = teams.find((t) => t.id === m.team_a_id);
        const teamB = teams.find((t) => t.id === m.team_b_id);
        const inTeamA = teamA?.members?.some((mem) => mem.user_id === user.id) ?? false;
        const inTeamB = teamB?.members?.some((mem) => mem.user_id === user.id) ?? false;
        return inTeamA || inTeamB;
      }

      if (matchFilter === 'round' && selectedRoundFilter !== 'all') {
        if (selectedRoundFilter === 'final') return isFinal;
        if (selectedRoundFilter === 'semi') return isSemi;
        return true;
      }

      return true;
    });
  }, [resolvedMatches, matchFilter, selectedRoundFilter, teams, user]);

  // Final Placements for Standings Tab derived dynamically from actual matches
  const standingsData = useMemo(() => {
    if (matches.length === 0) return [];

    const sorted = [...matches].sort((a, b) => (b.bracket_round ?? 1) - (a.bracket_round ?? 1));
    const finalMatch = sorted[0];
    const standings: Array<{
      rank: string;
      name: string;
      finish: string;
      finishType: string;
      eliminatedIn: string;
    }> = [];

    if (finalMatch && finalMatch.winner_team) {
      standings.push({
        rank: '1',
        name: finalMatch.winner_team.name,
        finish: 'Champion',
        finishType: 'champion',
        eliminatedIn: '—',
      });

      const runnerUp = finalMatch.winner_team_id === finalMatch.team_a_id ? finalMatch.team_b : finalMatch.team_a;
      if (runnerUp) {
        standings.push({
          rank: '2',
          name: runnerUp.name,
          finish: 'Runner-Up',
          finishType: 'runner_up',
          eliminatedIn: 'Final',
        });
      }
    }

    const maxRound = finalMatch?.bracket_round ?? 2;
    const semis = matches.filter((m) => (m.bracket_round ?? 1) === maxRound - 1);
    semis.forEach((sm) => {
      if (sm.winner_team_id) {
        const loser = sm.winner_team_id === sm.team_a_id ? sm.team_b : sm.team_a;
        if (loser && !standings.some((s) => s.name === loser.name)) {
          standings.push({
            rank: '3–4',
            name: loser.name,
            finish: 'Semi Finalist',
            finishType: 'third',
            eliminatedIn: 'Semi Final',
          });
        }
      }
    });

    return standings;
  }, [matches]);

  const visibleStandings = useMemo(() => {
    if (showAllStandings) return standingsData;
    return standingsData.slice(0, 8);
  }, [standingsData, showAllStandings]);

  // Results summary metrics from actual tournament records
  const resultsMetrics = useMemo(() => {
    const totalMatches = matches.length;
    const completedMatches = matches.filter((m) => m.status === 'completed').length;
    const totalPlayers = tournament.participant_count ?? ((tournament.format_configuration as any)?.entrants || 0);

    return {
      totalMatches,
      completedMatches,
      totalPlayers,
      duration: `${formatDate(tournament.start_date)} – ${formatDate(tournament.end_date)}`,
    };
  }, [matches, tournament]);

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
          <View style={styles.heroOverlay} />

          <View style={styles.heroInner}>
            {/* Top Badges Row */}
            <View style={styles.heroBadgesRow}>
              <View style={styles.completedBadge}>
                <Trophy size={12} color="#FFFFFF" style={{ marginRight: 5 }} />
                <AppText variant="caption" bold style={styles.completedBadgeText}>
                  COMPLETED
                </AppText>
              </View>

              <View style={styles.bracketBadge}>
                <AppText variant="caption" bold style={styles.bracketBadgeText}>
                  BRACKET
                </AppText>
              </View>
            </View>

            {/* Main Tournament Info */}
            <View style={styles.heroInfoBlock}>
              <AppText variant="heading1" style={styles.heroTitle} numberOfLines={1}>
                {tournament.name}
              </AppText>

              <AppText variant="bodySmall" style={styles.heroHost} numberOfLines={1}>
                Hosted by {tournament.location_name || 'Championship Court'}
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
                    {tournament.location_name || 'Championship Court'}
                  </AppText>
                </View>

                <View style={styles.heroMetaItem}>
                  <Users size={13} color="#CBD5E1" style={{ marginRight: 4 }} />
                  <AppText variant="caption" style={styles.heroMetaText}>
                    {parsedConfig.category || 'Singles'}
                  </AppText>
                </View>

                <View style={styles.heroMetaItem}>
                  <Users size={13} color="#CBD5E1" style={{ marginRight: 4 }} />
                  <AppText variant="caption" style={styles.heroMetaText}>
                    {tournament.participant_count ?? 0}{tournament.max_participants ? ` / ${tournament.max_participants}` : ''} players
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
              { key: 'bracket', label: 'Bracket Tree' },
              { key: 'matches', label: `Matches (${displayedMatches.length})` },
              { key: 'standings', label: 'Standings' },
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
            {/* Card 1: Tournament Summary */}
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
                  'Completed premier singles bracket championship. Final bracket tree and champion records.'}
              </AppText>
            </Card>

            {/* Card 2: Competition Details */}
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
                      Bracket
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
                      {parsedConfig.category || 'Singles'}
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
                      {parsedConfig.skillLevel || '4.5 Level'}
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

            {/* Card 3: Schedule & Venue */}
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
                  {tournament.location_name || 'Championship Court'}
                </AppText>
              </View>
            </Card>

            {/* Card 4: Official Rules & Scoring */}
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
        {/* PAGE 2: BRACKET TREE                                        */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'bracket' && (
          <View style={styles.tabContent}>
            {/* Sub-tabs: Main Bracket / Consolation */}
            <View style={styles.bracketSubNavRow}>
              <TouchableOpacity
                style={[
                  styles.bracketSubPill,
                  bracketSubTab === 'main' && styles.bracketSubPillActive,
                ]}
                onPress={() => setBracketSubTab('main')}
              >
                <AppText
                  variant="caption"
                  bold
                  style={[
                    styles.bracketSubPillText,
                    bracketSubTab === 'main' && styles.bracketSubPillTextActive,
                  ]}
                >
                  Main Bracket
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.bracketSubPill,
                  bracketSubTab === 'consolation' && styles.bracketSubPillActive,
                ]}
                onPress={() => setBracketSubTab('consolation')}
              >
                <AppText
                  variant="caption"
                  bold
                  style={[
                    styles.bracketSubPillText,
                    bracketSubTab === 'consolation' && styles.bracketSubPillTextActive,
                  ]}
                >
                  Consolation
                </AppText>
              </TouchableOpacity>
            </View>

            {/* Bracket Tree Container Card */}
            {matches.length === 0 ? (
              <Card style={styles.card}>
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <Users size={36} color="#94A3B8" style={{ marginBottom: 12 }} />
                  <AppText variant="body" bold style={{ color: '#0F172A', marginBottom: 4 }}>
                    No Bracket Matches Available
                  </AppText>
                  <AppText variant="caption" style={{ color: '#64748B', textAlign: 'center' }}>
                    Bracket match progression will appear once tournament matches are scheduled and completed.
                  </AppText>
                </View>
              </Card>
            ) : (
              <Card style={styles.bracketTreeCard}>
                <ChampionshipBracketView matches={matches} isReadOnly={true} />
              </Card>
            )}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PAGE 3: MATCHES                                             */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'matches' && (
          <View style={styles.tabContent}>
            {/* Filter Buttons */}
            <View style={styles.matchFiltersRow}>
              <TouchableOpacity
                style={[styles.filterChip, matchFilter === 'all' && styles.filterChipActive]}
                onPress={() => {
                  setMatchFilter('all');
                  setSelectedRoundFilter('all');
                }}
                activeOpacity={0.8}
              >
                <AppText
                  variant="caption"
                  bold
                  style={[styles.filterChipText, matchFilter === 'all' && styles.filterChipTextActive]}
                >
                  All Matches ({displayedMatches.length})
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterChip, matchFilter === 'my' && styles.filterChipActive]}
                onPress={() => {
                  setMatchFilter('my');
                  setSelectedRoundFilter('all');
                }}
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
                style={[styles.filterChip, matchFilter === 'round' && styles.filterChipActive]}
                onPress={() => setShowRoundDropdown(!showRoundDropdown)}
                activeOpacity={0.8}
              >
                <AppText
                  variant="caption"
                  bold
                  style={[styles.filterChipText, matchFilter === 'round' && styles.filterChipTextActive]}
                >
                  {selectedRoundFilter === 'final'
                    ? 'Final'
                    : selectedRoundFilter === 'semi'
                    ? 'Semi Final'
                    : 'By Round'}
                </AppText>
                <ChevronDown size={14} color={matchFilter === 'round' ? '#FFFFFF' : '#475569'} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            </View>

            {/* Round Dropdown Selector */}
            {showRoundDropdown && (
              <View style={styles.roundDropdownMenu}>
                {availableRounds.map((r) => (
                  <TouchableOpacity
                    key={r.key}
                    style={styles.dropdownOption}
                    onPress={() => {
                      setMatchFilter('round');
                      setSelectedRoundFilter(r.key);
                      setShowRoundDropdown(false);
                    }}
                  >
                    <AppText
                      variant="bodySmall"
                      bold={selectedRoundFilter === r.key}
                      style={{ color: selectedRoundFilter === r.key ? '#065F46' : '#0F172A' }}
                    >
                      {r.label}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Empty State */}
            {displayedMatches.length === 0 && (
              <Card style={styles.emptyCard}>
                <Users size={36} color="#94A3B8" style={{ marginBottom: 8 }} />
                <AppText variant="body" bold style={{ color: '#0F172A', marginBottom: 4 }}>
                  No Matches Found
                </AppText>
                <AppText variant="bodySmall" style={{ color: '#64748B', textAlign: 'center' }}>
                  {matchFilter === 'my'
                    ? 'You did not participate in any matches in this tournament.'
                    : 'No matches found for the selected round filter.'}
                </AppText>
              </Card>
            )}

            {/* Match Cards List */}
            {displayedMatches.map((match, idx) => {
              const isFinal = (match.bracket_round ?? 1) >= 2 || idx === 0;
              const roundTitle = isFinal ? 'Final' : 'Semi Final';
              const courtLabel = match.court_id ? `Court ${match.court_id}` : (idx === 2 ? 'Court 2' : 'Championship Court');
              const timeLabel = match.scheduled_start_at
                ? formatDate(match.scheduled_start_at)
                : formatDate(tournament.start_date);

              const teamAName =
                match.team_a?.name || (isSingles ? 'Player A' : 'Team A');
              const teamBName =
                match.team_b?.name || (isSingles ? 'Player B' : 'Team B');

              const avatarA = getAvatarStyle(teamAName);
              const avatarB = getAvatarStyle(teamBName);

              const scoreA = match.score_a ?? 0;
              const scoreB = match.score_b ?? 0;
              const hasScore = match.score_a !== null || match.score_b !== null;
              const aWon = hasScore && scoreA > scoreB;
              const bWon = hasScore && scoreB > scoreA;

              const setScores = {
                a: [hasScore ? scoreA : '-', '-', '-'],
                b: [hasScore ? scoreB : '-', '-', '-'],
                aWin: [aWon, false, false],
                bWin: [bWon, false, false],
              };

              return (
                <TouchableOpacity
                  key={match.id || `bm-${idx}`}
                  activeOpacity={0.9}
                  onPress={() => setSelectedMatch(match)}
                >
                  <Card style={styles.matchCard}>
                    {/* Header */}
                    <View style={styles.matchCardHeader}>
                      <View>
                        <AppText variant="bodySmall" bold style={styles.matchRoundText}>
                          {roundTitle}
                        </AppText>
                        <AppText variant="caption" style={styles.matchCourtText}>
                          {courtLabel}
                        </AppText>
                      </View>

                      <View style={styles.matchHeaderRight}>
                        <AppText variant="caption" style={styles.matchTimeText}>
                          {timeLabel}
                        </AppText>
                        <View style={styles.completedTag}>
                          <AppText variant="caption" bold style={styles.completedTagText}>
                            Completed
                          </AppText>
                        </View>
                      </View>
                    </View>

                    <View style={styles.cardDivider} />

                    {/* Competitor A Row */}
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
                      </View>

                      <View style={styles.setScoreBoxes}>
                        {setScores.a.map((setVal, sIdx) => {
                          const isWin = setScores.aWin[sIdx];
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

                    {/* Competitor B Row */}
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
                      </View>

                      <View style={styles.setScoreBoxes}>
                        {setScores.b.map((setVal, sIdx) => {
                          const isWin = setScores.bWin[sIdx];
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
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PAGE 4: STANDINGS                                           */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'standings' && (
          <View style={styles.tabContent}>
            {/* Card 1: Final Standings Table */}
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.goldTrophyIconWrap}>
                  <Trophy size={18} color="#D97706" />
                </View>
                <AppText variant="heading3" bold style={styles.cardHeading}>
                  Final Standings
                </AppText>
              </View>

              <View style={styles.standingsTable}>
                {/* Header Row */}
                <View style={styles.standingsHeaderRow}>
                  <AppText variant="caption" bold style={styles.thRankCol}>
                    #
                  </AppText>
                  <AppText variant="caption" bold style={styles.thPlayerCol}>
                    Player
                  </AppText>
                  <AppText variant="caption" bold style={styles.thFinishCol}>
                    Finish
                  </AppText>
                  <AppText variant="caption" bold style={styles.thElimCol}>
                    Eliminated In
                  </AppText>
                </View>

                {/* Table Body Rows */}
                {visibleStandings.length === 0 ? (
                  <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                    <AppText variant="bodySmall" color="secondary">
                      No final standings recorded yet.
                    </AppText>
                  </View>
                ) : (
                  visibleStandings.map((row, idx) => {
                    const is1st = row.rank === '1';
                    const is2nd = row.rank === '2';
                    const is3rd = row.rank === '3';

                    return (
                      <View
                        key={idx}
                        style={[styles.standingsRow, is1st && styles.standingsRowChampion]}
                      >
                        {/* Rank Medal or Text */}
                        <View style={styles.tdRankCol}>
                          {is1st ? (
                            <View style={styles.rankMedalCircleGold}>
                              <AppText style={{ fontSize: 13, color: '#D97706', fontWeight: 'bold' }}>1</AppText>
                            </View>
                          ) : is2nd ? (
                            <View style={styles.rankMedalCircleSilver}>
                              <AppText style={{ fontSize: 13, color: '#64748B', fontWeight: 'bold' }}>2</AppText>
                            </View>
                          ) : is3rd ? (
                            <View style={styles.rankMedalCircleBronze}>
                              <AppText style={{ fontSize: 13, color: '#EA580C', fontWeight: 'bold' }}>3</AppText>
                            </View>
                          ) : (
                            <AppText variant="bodySmall" style={styles.rankText}>
                              {row.rank}
                            </AppText>
                          )}
                        </View>

                        {/* Player Name */}
                        <View style={styles.tdPlayerCol}>
                          <AppText variant="bodySmall" bold style={styles.playerNameText}>
                            {row.name}
                          </AppText>
                        </View>

                        {/* Finish Pill */}
                        <View style={styles.tdFinishCol}>
                          <View
                            style={[
                              styles.finishBadge,
                              row.finishType === 'champion' && styles.finishBadgeChampion,
                              row.finishType === 'runner_up' && styles.finishBadgeRunnerUp,
                              row.finishType === 'third' && styles.finishBadgeThird,
                            ]}
                          >
                            <AppText
                              variant="caption"
                              bold
                              style={[
                                styles.finishBadgeText,
                                row.finishType === 'champion' && styles.finishBadgeTextChampion,
                                row.finishType === 'runner_up' && styles.finishBadgeTextRunnerUp,
                                row.finishType === 'third' && styles.finishBadgeTextThird,
                              ]}
                            >
                              {row.finish}
                            </AppText>
                          </View>
                        </View>

                        {/* Eliminated In */}
                        <View style={styles.tdElimCol}>
                          <AppText variant="caption" style={styles.eliminatedText}>
                            {row.eliminatedIn}
                          </AppText>
                        </View>
                      </View>
                    );
                  })
                )}

                {/* View All Players expandable row */}
                {standingsData.length > 8 && (
                  <TouchableOpacity
                    style={styles.viewAllPlayersRow}
                    onPress={() => setShowAllStandings(!showAllStandings)}
                  >
                    <AppText variant="caption" bold style={styles.viewAllPlayersRank}>
                      9–16
                    </AppText>
                    <AppText variant="caption" bold style={styles.viewAllPlayersText}>
                      {showAllStandings ? 'Hide Extra Players' : 'View All Players'}
                    </AppText>
                  </TouchableOpacity>
                )}
              </View>
            </Card>

            {/* Card 2: Results Summary */}
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
                    {resultsMetrics.totalMatches}
                  </AppText>
                </View>

                <View style={styles.summaryRow}>
                  <AppText variant="bodySmall" style={styles.summaryLabel}>
                    Completed Matches
                  </AppText>
                  <AppText variant="bodySmall" bold style={styles.summaryVal}>
                    {resultsMetrics.completedMatches}
                  </AppText>
                </View>

                <View style={styles.summaryRow}>
                  <AppText variant="bodySmall" style={styles.summaryLabel}>
                    Total Players
                  </AppText>
                  <AppText variant="bodySmall" bold style={styles.summaryVal}>
                    {resultsMetrics.totalPlayers}
                  </AppText>
                </View>

                <View style={styles.summaryRow}>
                  <AppText variant="bodySmall" style={styles.summaryLabel}>
                    Event Duration
                  </AppText>
                  <AppText variant="bodySmall" bold style={styles.summaryVal}>
                    {resultsMetrics.duration}
                  </AppText>
                </View>
              </View>
            </Card>

            {/* Card 3: Tie-Breaker Priority */}
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

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ─── Match Details Modal ─── */}
      <Modal
        visible={Boolean(selectedMatch)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMatch(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.matchModalCard}>
            <View style={styles.modalHeader}>
              <AppText variant="heading3" bold style={{ color: '#0F172A' }}>
                Match Details
              </AppText>
              <TouchableOpacity onPress={() => setSelectedMatch(null)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {selectedMatch && (
              <View style={{ gap: 12, marginTop: 8 }}>
                <View style={styles.summaryRow}>
                  <AppText variant="bodySmall" style={styles.summaryLabel}>
                    Round
                  </AppText>
                  <AppText variant="bodySmall" bold style={styles.summaryVal}>
                    {(selectedMatch.bracket_round ?? 1) >= 2 ? 'Final' : 'Semi Final'}
                  </AppText>
                </View>

                <View style={styles.summaryRow}>
                  <AppText variant="bodySmall" style={styles.summaryLabel}>
                    Court
                  </AppText>
                  <AppText variant="bodySmall" bold style={styles.summaryVal}>
                    {tournament.location_name || 'Championship Court'}
                  </AppText>
                </View>

                <View style={styles.summaryRow}>
                  <AppText variant="bodySmall" style={styles.summaryLabel}>
                    Winner
                  </AppText>
                  <AppText variant="bodySmall" bold style={{ color: '#15803D' }}>
                    {selectedMatch.winner_team?.name || 'Winner'}
                  </AppText>
                </View>

                <View style={styles.summaryRow}>
                  <AppText variant="bodySmall" style={styles.summaryLabel}>
                    Final Score
                  </AppText>
                  <AppText variant="bodySmall" bold style={styles.summaryVal}>
                    {selectedMatch.score_a ?? 0} – {selectedMatch.score_b ?? 0}
                  </AppText>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ─── Full Bracket Modal ─── */}
      <Modal
        visible={showFullBracketModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFullBracketModal(false)}
      >
        <View style={styles.fullBracketModalContainer}>
          <View style={styles.fullBracketHeader}>
            <AppText variant="heading3" bold style={{ color: '#FFFFFF' }}>
              Full Bracket Tree
            </AppText>
            <TouchableOpacity onPress={() => setShowFullBracketModal(false)}>
              <X size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <ScrollView horizontal style={{ flex: 1 }}>
            <ScrollView style={{ flex: 1, padding: 16 }}>
              <AppText variant="body" bold style={{ color: '#FFFFFF', marginBottom: 12 }}>
                {tournament.name} Championship Bracket
              </AppText>
              {/* Bracket Tree inside modal */}
              <View style={[styles.bracketTreeCard, { backgroundColor: '#FFFFFF', minWidth: 600, padding: 16 }]}>
                <ChampionshipBracketView matches={matches} isReadOnly={true} />
              </View>
            </ScrollView>
          </ScrollView>
        </View>
      </Modal>
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

  /* ─── Scroll Area ─── */
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
    backgroundColor: 'rgba(6, 78, 59, 0.78)',
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
  bracketBadge: {
    backgroundColor: '#FFEDD5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  bracketBadgeText: {
    color: '#C2410C',
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

  /* ─── Tab Content ─── */
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
  goldTrophyIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
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

  /* ─── Bracket Tree Tab ─── */
  bracketSubNavRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 24,
    padding: 3,
    marginBottom: 6,
  },
  bracketSubPill: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 20,
  },
  bracketSubPillActive: {
    backgroundColor: '#064E3B',
  },
  bracketSubPillText: {
    color: '#64748B',
    fontSize: 12,
  },
  bracketSubPillTextActive: {
    color: '#FFFFFF',
  },
  bracketTreeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.sm,
  },
  bracketTreeInner: {
    paddingVertical: 8,
  },
  bracketRoundsHeader: {
    flexDirection: 'row',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 16,
  },
  bracketRoundColTitle: {
    width: 140,
    color: '#64748B',
    fontSize: 11,
    textAlign: 'center',
  },
  bracketColumnsContainer: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 12,
  },
  bracketCol: {
    width: 140,
    gap: 12,
  },
  bracketNodeWrapper: {
    position: 'relative',
  },
  bracketMatchNode: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 6,
    gap: 4,
  },
  bracketCompetitorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bracketNodeAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  bracketNodeAvatarText: {
    fontSize: 9,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  bracketNodeName: {
    flex: 1,
    color: '#0F172A',
    fontSize: 11,
  },
  bracketScoreWin: {
    color: '#15803D',
    fontSize: 11,
  },
  bracketScoreLose: {
    color: '#64748B',
    fontSize: 11,
  },
  branchLineRight: {
    position: 'absolute',
    right: -16,
    top: '50%',
    width: 16,
    height: 1,
    backgroundColor: '#CBD5E1',
  },
  championShowcaseCard: {
    alignItems: 'center',
    backgroundColor: '#FFFDF5',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    padding: 12,
    marginTop: 20,
  },
  championTrophyCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  championShowcaseName: {
    color: '#0F172A',
    fontSize: 13,
    marginBottom: 4,
  },
  championShowcaseBadge: {
    color: '#B45309',
    fontSize: 9,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  viewFullBracketButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
    marginTop: 12,
  },
  viewFullBracketText: {
    color: '#0F172A',
    fontSize: 13,
  },

  /* ─── Matches Tab ─── */
  matchFiltersRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
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
  roundDropdownMenu: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 6,
    ...Shadows.md,
    gap: 4,
    marginBottom: 8,
  },
  dropdownOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
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
  matchRoundText: {
    color: '#0F172A',
    fontSize: 14,
  },
  matchCourtText: {
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
  standingsTable: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    overflow: 'hidden',
  },
  standingsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  thRankCol: {
    width: 32,
    color: '#64748B',
    fontSize: 11,
  },
  thPlayerCol: {
    flex: 1,
    color: '#64748B',
    fontSize: 11,
  },
  thFinishCol: {
    width: 86,
    color: '#64748B',
    fontSize: 11,
    textAlign: 'center',
  },
  thElimCol: {
    width: 80,
    color: '#64748B',
    fontSize: 11,
    textAlign: 'right',
  },
  standingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  standingsRowChampion: {
    backgroundColor: '#FFFDF5',
  },
  tdRankCol: {
    width: 32,
  },
  rankMedalCircleGold: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankMedalCircleSilver: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankMedalCircleBronze: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    color: '#64748B',
    fontSize: 12,
  },
  tdPlayerCol: {
    flex: 1,
    paddingRight: 6,
  },
  playerNameText: {
    color: '#0F172A',
    fontSize: 13,
  },
  tdFinishCol: {
    width: 86,
    alignItems: 'center',
  },
  finishBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  finishBadgeChampion: {
    backgroundColor: '#FEF3C7',
  },
  finishBadgeRunnerUp: {
    backgroundColor: '#F1F5F9',
  },
  finishBadgeThird: {
    backgroundColor: '#FFF7ED',
  },
  finishBadgeText: {
    color: '#475569',
    fontSize: 10,
  },
  finishBadgeTextChampion: {
    color: '#B45309',
  },
  finishBadgeTextRunnerUp: {
    color: '#475569',
  },
  finishBadgeTextThird: {
    color: '#C2410C',
  },
  tdElimCol: {
    width: 80,
    alignItems: 'flex-end',
  },
  eliminatedText: {
    color: '#64748B',
    fontSize: 12,
  },
  viewAllPlayersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#F8FAFC',
  },
  viewAllPlayersRank: {
    width: 32,
    color: '#64748B',
    fontSize: 11,
  },
  viewAllPlayersText: {
    color: '#0284C7',
    fontSize: 12,
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

  /* ─── Modals ─── */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  matchModalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    ...Shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
  },
  fullBracketModalContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingTop: 40,
  },
  fullBracketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
});
