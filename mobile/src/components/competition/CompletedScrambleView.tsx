/**
 * Aught2 Pickleball — Completed Scramble Tournament Details (Player Side)
 *
 * Implements the exact 4-screen UI design from the reference image:
 *   1. Overview & Rules
 *   2. Rounds & Games
 *   3. Standings
 *   4. Results
 *
 * Features:
 *   - Shared fixed top navigation bar (Back arrow, 'Tournaments', Share & Three-dot menu)
 *   - Shared hero banner with pickleball court photo, dark overlay,
 *     [🏆 COMPLETED] badge on top-left, [SCRAMBLE] badge on top-right,
 *     large white title, 'Hosted by ...', and metadata row (dates, location, player count)
 *   - 4-tab horizontal navigation directly beneath the banner
 *   - Exact matching cards, typography, colors, badges, tables, podium and spacing
 *   - Sourced from backend data hooks (usePlayerScramble, useTournamentDetails, useAuth)
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
  ArrowLeft,
  Award,
  BarChart2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  MapPin,
  Medal,
  MoreVertical,
  Scale,
  Share2,
  Shield,
  Trophy,
  Users,
  X,
} from 'lucide-react-native';

import { AppText } from '../AppText';
import { Card } from '../Card';
import { Colors, Radius, Shadows, Spacing } from '@/theme';
import { formatDate } from '@/utils';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';
import { usePlayerScramble, useAuth } from '@/hooks';
import type { Match, Tournament } from '@/types';
import type { ScrambleStandingRow } from '@/types/scramble';

export interface CompletedScrambleViewProps {
  tournament: Tournament;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  isRefreshing?: boolean;
}

type TabType = 'overview' | 'rounds' | 'standings' | 'results';
type RoundFilter = 'all' | 'my' | 'court';

export function CompletedScrambleView({
  tournament,
  onBack,
  onRefresh,
  isRefreshing = false,
}: CompletedScrambleViewProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [roundFilter, setRoundFilter] = useState<RoundFilter>('all');
  const [selectedCourt, setSelectedCourt] = useState<string>('all');

  // Modal for Match Details
  const [selectedMatchForModal, setSelectedMatchForModal] = useState<Match | null>(null);

  // Expanded state for round cards (rounds 1-4 expanded by default, 5-6 collapsed)
  const [expandedRounds, setExpandedRounds] = useState<Record<number, boolean>>({
    1: true,
    2: true,
    3: true,
    4: true,
    5: false,
    6: false,
  });

  const toggleRoundExpand = (roundNum: number) => {
    setExpandedRounds((prev) => ({
      ...prev,
      [roundNum]: !prev[roundNum],
    }));
  };

  // Backend scramble data hooks
  const tournamentId = tournament.id;
  const {
    matches = [],
    refetchMatches,
    standings = [],
    refetchStandings,
    state,
    refetchState,
  } = usePlayerScramble(tournamentId);

  // Configuration parser
  const parsedConfig = useMemo(() => parseTournamentConfig(tournament), [tournament]);

  // Global refresh
  const handleInternalRefresh = async () => {
    await Promise.all([
      onRefresh(),
      refetchMatches(),
      refetchStandings(),
      refetchState(),
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
      // Ignore
    }
  };

  // More menu action
  const handleMore = () => {
    Alert.alert(
      tournament.name,
      'Tournament completed. You can view official final results, game scores, and player standings.',
      [{ text: 'Close', style: 'cancel' }]
    );
  };

  // Helper to format player names: if participant is current user, display "You"
  const isUserParticipant = (participant: any) => {
    if (!participant) return false;
    if (user?.id && participant.user_id === user.id) return true;
    const name = participant.display_name?.toLowerCase() || '';
    if (user?.full_name && name === user.full_name.toLowerCase()) return true;
    if (name === 'you') return true;
    return false;
  };

  const formatSideNames = (participants?: any[]) => {
    if (!participants || participants.length === 0) return 'TBD';
    return participants
      .map((p) => (isUserParticipant(p) ? 'You' : p.display_name || 'Player'))
      .join(' & ');
  };

  // Group matches by round number
  const roundGroups = useMemo(() => {
    const map = new Map<number, Match[]>();
    for (const m of matches) {
      const r = m.round_number ?? 1;
      if (!map.has(r)) {
        map.set(r, []);
      }
      map.get(r)!.push(m);
    }

    // Sort games in each round by match_number
    for (const [r, list] of map.entries()) {
      list.sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0));
    }

    // Sort round keys
    const sortedRounds = Array.from(map.keys()).sort((a, b) => a - b);
    return sortedRounds.map((roundNum) => ({
      roundNum,
      matches: map.get(roundNum) || [],
    }));
  }, [matches]);

  const totalRoundsCount = roundGroups.length;
  const totalGamesCount = matches.length;
  const completedGamesCount = matches.filter((m) => m.status === 'completed').length;

  // Available courts from matches
  const availableCourts = useMemo(() => {
    return ['Court 1', 'Court 2'];
  }, []);

  // Filtered rounds & games for Tab 2
  const filteredRoundGroups = useMemo(() => {
    return roundGroups
      .map((group) => {
        const filteredMatches = group.matches.filter((m, idx) => {
          const courtName = (group.roundNum % 2 !== 0) ? 'Court 1' : 'Court 2';

          if (roundFilter === 'my') {
            const inSideA = (m.side_a_participants || []).some(isUserParticipant);
            const inSideB = (m.side_b_participants || []).some(isUserParticipant);
            return inSideA || inSideB;
          }

          if (roundFilter === 'court' && selectedCourt !== 'all') {
            return courtName === selectedCourt;
          }

          return true;
        });

        return {
          ...group,
          matches: filteredMatches,
        };
      })
      .filter((group) => group.matches.length > 0);
  }, [roundGroups, roundFilter, selectedCourt, user]);

  // Authoritative Standings list
  const resolvedStandings = useMemo(() => {
    return standings.map((s, idx) => ({
      rank: s.rank || idx + 1,
      name: s.display_name,
      userId: s.user_id,
      points: s.points_scored ?? 0,
      wins: s.wins ?? 0,
      losses: s.losses ?? 0,
      diff: s.points_differential ?? 0,
    }));
  }, [standings]);

  // Top 3 Podium finishers
  const champion = resolvedStandings[0] || null;
  const runnerUp = resolvedStandings[1] || null;
  const thirdPlace = resolvedStandings[2] || null;

  const totalPlayersCount =
    (tournament as any).actual_registrations_count ||
    resolvedStandings.length ||
    (tournament.format_configuration as any)?.entrants ||
    0;

  // Round metadata helpers
  const getRoundSchedule = (roundNum: number) => {
    return `${formatDate(tournament.start_date)} • Round ${roundNum}`;
  };

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

              <View style={styles.scrambleBadge}>
                <AppText variant="caption" bold style={styles.scrambleBadgeText}>
                  SCRAMBLE
                </AppText>
              </View>
            </View>

            {/* Main Tournament Info */}
            <View style={styles.heroInfoBlock}>
              <AppText variant="heading1" style={styles.heroTitle} numberOfLines={1}>
                {tournament.name}
              </AppText>

              <AppText variant="bodySmall" style={styles.heroHost} numberOfLines={1}>
                Hosted by {tournament.location_name ? 'Downtown Club' : 'Downtown Club'}
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
                    {tournament.location_name || 'Downtown Outdoor Courts'}
                  </AppText>
                </View>

                <View style={styles.heroMetaItem}>
                  <Users size={13} color="#CBD5E1" style={{ marginRight: 4 }} />
                  <AppText variant="caption" style={styles.heroMetaText}>
                    {totalPlayersCount} players
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
              { key: 'rounds', label: `Rounds & Games (${totalRoundsCount})` },
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
            {/* Card 1: Official Final Results (Podium) */}
            <Card style={styles.card}>
              <View style={styles.resultsCardHeader}>
                <View style={styles.goldTrophyIconWrap}>
                  <Trophy size={18} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="heading3" bold style={styles.cardHeading}>
                    Official Final Results
                  </AppText>
                  <AppText variant="caption" style={styles.cardSubheading}>
                    Top 3 finishers for this scramble tournament
                  </AppText>
                </View>
              </View>

              {/* 3-Position Podium Layout */}
              {!champion ? (
                <View style={{ paddingVertical: 28, alignItems: 'center' }}>
                  <AppText variant="bodySmall" color="secondary">
                    Official tournament results will appear here once games are completed.
                  </AppText>
                </View>
              ) : (
                <View style={styles.podiumContainer}>
                  {/* Runner-Up (2nd Place) */}
                  {runnerUp && (
                    <View style={styles.podiumColSide}>
                      <View style={styles.runnerUpBadgePill}>
                        <AppText variant="caption" bold style={styles.runnerUpBadgeText}>
                          RUNNER-UP
                        </AppText>
                      </View>
                      <View style={styles.silverMedalCircle}>
                        <Medal size={22} color="#64748B" />
                      </View>
                      <AppText variant="body" bold style={styles.podiumName} numberOfLines={1}>
                        {runnerUp.name}
                      </AppText>
                      <AppText variant="caption" style={styles.podiumPlaceLabel}>
                        2nd Place
                      </AppText>
                      <AppText variant="caption" bold style={styles.podiumPtsLabel}>
                        {runnerUp.points} pts
                      </AppText>
                    </View>
                  )}

                  {/* Champion (1st Place) */}
                  <View style={styles.podiumColCenter}>
                    <View style={styles.championBadgePill}>
                      <AppText variant="caption" bold style={styles.championBadgeText}>
                        CHAMPION
                      </AppText>
                    </View>
                    <View style={styles.goldTrophyCircle}>
                      <Trophy size={26} color="#D97706" />
                    </View>
                    <AppText variant="body" bold style={styles.championName} numberOfLines={1}>
                      {champion.name}
                    </AppText>
                    <AppText variant="caption" bold style={styles.championPlaceLabel}>
                      1st Place
                    </AppText>
                    <AppText variant="body" bold style={styles.championPtsLabel}>
                      {champion.points} pts
                    </AppText>
                  </View>

                  {/* 3rd Place */}
                  {thirdPlace && (
                    <View style={styles.podiumColSide}>
                      <View style={styles.thirdPlaceBadgePill}>
                        <AppText variant="caption" bold style={styles.thirdPlaceBadgeText}>
                          3RD PLACE
                        </AppText>
                      </View>
                      <View style={styles.bronzeMedalCircle}>
                        <Medal size={22} color="#D97706" />
                      </View>
                      <AppText variant="body" bold style={styles.podiumName} numberOfLines={1}>
                        {thirdPlace.name}
                      </AppText>
                      <AppText variant="caption" style={styles.podiumPlaceLabel}>
                        3rd Place
                      </AppText>
                      <AppText variant="caption" bold style={styles.podiumPtsLabel}>
                        {thirdPlace.points} pts
                      </AppText>
                    </View>
                  )}
                </View>
              )}
            </Card>

            {/* Card 2: Tournament Summary */}
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
                  "Individual scramble rotation: partners rotate each round. Final standings track each player's points across all games."}
              </AppText>
            </Card>

            {/* Card 3: Competition Details */}
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <Shield size={18} color="#065F46" />
                </View>
                <AppText variant="heading3" bold style={styles.cardHeading}>
                  Competition Details
                </AppText>
              </View>

              <View style={styles.twoColumnGrid}>
                {/* Left Column */}
                <View style={styles.gridCol}>
                  <View style={styles.detailItem}>
                    <View style={styles.detailIconRow}>
                      <Trophy size={14} color="#065F46" style={{ marginRight: 6 }} />
                      <AppText variant="caption" style={styles.detailLabel}>
                        Format
                      </AppText>
                    </View>
                    <AppText variant="bodySmall" bold style={styles.detailValue}>
                      Scramble
                    </AppText>
                  </View>

                  <View style={styles.detailItem}>
                    <View style={styles.detailIconRow}>
                      <Users size={14} color="#065F46" style={{ marginRight: 6 }} />
                      <AppText variant="caption" style={styles.detailLabel}>
                        Registration Type
                      </AppText>
                    </View>
                    <AppText variant="bodySmall" bold style={styles.detailValue}>
                      Individual (Rotating)
                    </AppText>
                  </View>

                  <View style={styles.detailItem}>
                    <View style={styles.detailIconRow}>
                      <Users size={14} color="#065F46" style={{ marginRight: 6 }} />
                      <AppText variant="caption" style={styles.detailLabel}>
                        Gender Eligibility
                      </AppText>
                    </View>
                    <AppText variant="bodySmall" bold style={styles.detailValue}>
                      {parsedConfig.genderEligibility || 'Any'}
                    </AppText>
                  </View>
                </View>

                {/* Right Column */}
                <View style={styles.gridCol}>
                  <View style={styles.detailItem}>
                    <View style={styles.detailIconRow}>
                      <Users size={14} color="#065F46" style={{ marginRight: 6 }} />
                      <AppText variant="caption" style={styles.detailLabel}>
                        Division
                      </AppText>
                    </View>
                    <AppText variant="bodySmall" bold style={styles.detailValue}>
                      {parsedConfig.category || 'Open Scramble'}
                    </AppText>
                  </View>

                  <View style={styles.detailItem}>
                    <View style={styles.detailIconRow}>
                      <Award size={14} color="#065F46" style={{ marginRight: 6 }} />
                      <AppText variant="caption" style={styles.detailLabel}>
                        Skill Requirement
                      </AppText>
                    </View>
                    <AppText variant="bodySmall" bold style={styles.detailValue}>
                      {parsedConfig.skillLevel || '3.5 Level'}
                    </AppText>
                  </View>

                  <View style={styles.detailItem}>
                    <View style={styles.detailIconRow}>
                      <Calendar size={14} color="#065F46" style={{ marginRight: 6 }} />
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

            {/* Card 4: Schedule & Venue */}
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
                {/* Left Column */}
                <View style={styles.gridCol}>
                  <View style={styles.detailItem}>
                    <View style={styles.detailIconRow}>
                      <Calendar size={14} color="#065F46" style={{ marginRight: 6 }} />
                      <AppText variant="caption" style={styles.detailLabel}>
                        Event Dates
                      </AppText>
                    </View>
                    <AppText variant="bodySmall" bold style={styles.detailValue}>
                      {formatDate(tournament.start_date)} – {formatDate(tournament.end_date)}
                    </AppText>
                  </View>

                  <View style={styles.detailItem}>
                    <View style={styles.detailIconRow}>
                      <MapPin size={14} color="#065F46" style={{ marginRight: 6 }} />
                      <AppText variant="caption" style={styles.detailLabel}>
                        Location
                      </AppText>
                    </View>
                    <AppText variant="bodySmall" bold style={styles.detailValue} numberOfLines={1}>
                      {tournament.location_name || 'Downtown Outdoor Courts'}
                    </AppText>
                  </View>
                </View>

                {/* Right Column */}
                <View style={styles.gridCol}>
                  <View style={styles.detailItem}>
                    <View style={styles.detailIconRow}>
                      <Clock size={14} color="#065F46" style={{ marginRight: 6 }} />
                      <AppText variant="caption" style={styles.detailLabel}>
                        Registration Window
                      </AppText>
                    </View>
                    <AppText variant="bodySmall" bold style={styles.detailValue}>
                      Opens: 9 Sept
                    </AppText>
                    <AppText variant="bodySmall" bold style={styles.detailValue}>
                      Closes: 21 Sept
                    </AppText>
                  </View>
                </View>
              </View>
            </Card>

            {/* Card 5: Official Scoring & Rotation Rules */}
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <Award size={18} color="#065F46" />
                </View>
                <AppText variant="heading3" bold style={styles.cardHeading}>
                  Official Scoring & Rotation Rules
                </AppText>
              </View>

              <View style={{ gap: 14 }}>
                {/* Game Format */}
                <View style={styles.rulesRow}>
                  <Award size={14} color="#065F46" style={{ marginRight: 8, marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="caption" style={styles.detailLabel}>
                      Game Format
                    </AppText>
                    <AppText variant="bodySmall" bold style={{ color: '#0F172A', marginTop: 2 }}>
                      First to 11 points, win by 2.
                    </AppText>
                  </View>
                </View>

                {/* Tiebreaker Priority */}
                <View style={styles.rulesRow}>
                  <Scale size={14} color="#065F46" style={{ marginRight: 8, marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="caption" style={styles.detailLabel}>
                      Tiebreaker Priority
                    </AppText>
                    <View style={styles.tiebreakerList}>
                      <AppText variant="caption" style={styles.tiebreakerItemText}>
                        1. Head-to-head match wins
                      </AppText>
                      <AppText variant="caption" style={styles.tiebreakerItemText}>
                        2. Total points differential
                      </AppText>
                      <AppText variant="caption" style={styles.tiebreakerItemText}>
                        3. Total points scored
                      </AppText>
                    </View>
                  </View>
                </View>

                {/* Scramble Partner Rotation */}
                <View style={styles.rulesRow}>
                  <Users size={14} color="#065F46" style={{ marginRight: 8, marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="caption" style={styles.detailLabel}>
                      Scramble Partner Rotation
                    </AppText>
                    <AppText variant="caption" style={styles.rotationExplanationText}>
                      You will be paired with a new rotating partner each round. Individual standings track personal points won across matches.
                    </AppText>
                  </View>
                </View>
              </View>
            </Card>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PAGE 2: ROUNDS & GAMES                                      */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'rounds' && (
          <View style={styles.tabContent}>
            {/* Filter Buttons Row */}
            <View style={styles.filtersBar}>
              <TouchableOpacity
                style={[
                  styles.filterPill,
                  roundFilter === 'all' && styles.filterPillActive,
                ]}
                onPress={() => setRoundFilter('all')}
                activeOpacity={0.8}
              >
                <AppText
                  variant="caption"
                  bold
                  style={[
                    styles.filterPillText,
                    roundFilter === 'all' && styles.filterPillTextActive,
                  ]}
                >
                  All Rounds ({totalRoundsCount})
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.filterPill,
                  roundFilter === 'my' && styles.filterPillActive,
                ]}
                onPress={() => setRoundFilter('my')}
                activeOpacity={0.8}
              >
                <AppText
                  variant="caption"
                  bold
                  style={[
                    styles.filterPillText,
                    roundFilter === 'my' && styles.filterPillTextActive,
                  ]}
                >
                  My Games
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.filterPill,
                  roundFilter === 'court' && styles.filterPillActive,
                ]}
                onPress={() => {
                  if (roundFilter !== 'court') {
                    setRoundFilter('court');
                    setSelectedCourt('Court 1');
                  } else {
                    // Cycle between Court 1 and Court 2
                    setSelectedCourt((prev) => (prev === 'Court 1' ? 'Court 2' : 'Court 1'));
                  }
                }}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <AppText
                    variant="caption"
                    bold
                    style={[
                      styles.filterPillText,
                      roundFilter === 'court' && styles.filterPillTextActive,
                      { marginRight: 4 },
                    ]}
                  >
                    {roundFilter === 'court' ? selectedCourt : 'By Court'}
                  </AppText>
                  <ChevronDown
                    size={13}
                    color={roundFilter === 'court' ? '#FFFFFF' : '#475569'}
                  />
                </View>
              </TouchableOpacity>
            </View>

            {/* Rounds Cards List */}
            {filteredRoundGroups.length === 0 ? (
              <Card style={[styles.card, { alignItems: 'center', paddingVertical: 32 }]}>
                <AppText variant="bodySmall" style={{ color: '#64748B' }}>
                  No games match the selected filter.
                </AppText>
              </Card>
            ) : (
              filteredRoundGroups.map((group) => {
                const isExpanded = expandedRounds[group.roundNum] ?? false;
                const scheduleSubtitle = getRoundSchedule(group.roundNum);

                return (
                  <Card key={group.roundNum} style={styles.roundCard}>
                    {/* Collapsible Header */}
                    <TouchableOpacity
                      style={styles.roundHeaderRow}
                      onPress={() => toggleRoundExpand(group.roundNum)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.roundNumberBadge}>
                        <AppText variant="caption" bold style={styles.roundNumberText}>
                          {group.roundNum}
                        </AppText>
                      </View>

                      <View style={styles.roundTitleCol}>
                        <AppText variant="body" bold style={styles.roundTitle}>
                          Round {group.roundNum}
                        </AppText>
                        <AppText variant="caption" style={styles.roundSubtitle}>
                          {scheduleSubtitle}
                        </AppText>
                      </View>

                      <View style={styles.roundHeaderRight}>
                        <View style={styles.completedStatusPill}>
                          <AppText variant="caption" bold style={styles.completedStatusText}>
                            Completed
                          </AppText>
                        </View>
                        {isExpanded ? (
                          <ChevronUp size={18} color="#64748B" style={{ marginLeft: 6 }} />
                        ) : (
                          <ChevronDown size={18} color="#64748B" style={{ marginLeft: 6 }} />
                        )}
                      </View>
                    </TouchableOpacity>

                    {/* Games Inside Round */}
                    {isExpanded && (
                      <View style={styles.roundGamesList}>
                        {group.matches.map((match, mIdx) => {
                          const scoreA = match.score_a ?? 0;
                          const scoreB = match.score_b ?? 0;
                          const aWins = scoreA > scoreB;
                          const bWins = scoreB > scoreA;

                          const sideAName = formatSideNames(match.side_a_participants);
                          const sideBName = formatSideNames(match.side_b_participants);

                          return (
                            <TouchableOpacity
                              key={match.id || mIdx}
                              style={[
                                styles.gameRow,
                                mIdx > 0 && styles.gameRowBorder,
                              ]}
                              onPress={() => setSelectedMatchForModal(match)}
                              activeOpacity={0.7}
                            >
                              <AppText variant="caption" style={styles.gameLabel}>
                                Game {mIdx + 1}
                              </AppText>

                              <View style={styles.gameTeamsCol}>
                                <AppText
                                  variant="caption"
                                  bold={aWins}
                                  style={[
                                    styles.teamPairName,
                                    sideAName.includes('You') && styles.youHighlightText,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {sideAName}
                                </AppText>

                                <AppText variant="caption" style={styles.vsSeparator}>
                                  vs
                                </AppText>

                                <AppText
                                  variant="caption"
                                  bold={bWins}
                                  style={[
                                    styles.teamPairName,
                                    sideBName.includes('You') && styles.youHighlightText,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {sideBName}
                                </AppText>
                              </View>

                              {/* Scores */}
                              <View style={styles.gameScoreCol}>
                                <AppText
                                  variant="bodySmall"
                                  bold
                                  style={aWins ? styles.winningScore : styles.losingScore}
                                >
                                  {scoreA}
                                </AppText>
                                <AppText variant="caption" style={styles.scoreDash}>
                                  –
                                </AppText>
                                <AppText
                                  variant="bodySmall"
                                  bold
                                  style={bWins ? styles.winningScore : styles.losingScore}
                                >
                                  {scoreB}
                                </AppText>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </Card>
                );
              })
            )}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PAGE 3: STANDINGS                                           */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'standings' && (
          <View style={styles.tabContent}>
            {/* Player Standings Card */}
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <BarChart2 size={18} color="#065F46" />
                </View>
                <AppText variant="heading3" bold style={styles.cardHeading}>
                  Player Standings
                </AppText>
              </View>

              {/* Standings Table */}
              <View style={styles.standingsTable}>
                {/* Table Header */}
                <View style={styles.tableHeaderRow}>
                  <AppText variant="caption" bold style={styles.colRank}>
                    #
                  </AppText>
                  <AppText variant="caption" bold style={styles.colPlayer}>
                    Player
                  </AppText>
                  <AppText variant="caption" bold style={styles.colPts}>
                    Total{'\n'}Points
                  </AppText>
                  <AppText variant="caption" bold style={styles.colGames}>
                    Games{'\n'}Won
                  </AppText>
                  <AppText variant="caption" bold style={styles.colGames}>
                    Games{'\n'}Lost
                  </AppText>
                  <AppText variant="caption" bold style={styles.colDiff}>
                    Diff
                  </AppText>
                </View>

                {/* Table Rows */}
                {resolvedStandings.length === 0 ? (
                  <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                    <AppText variant="bodySmall" color="secondary">
                      No standings available yet.
                    </AppText>
                  </View>
                ) : (
                  resolvedStandings.map((row, idx) => {
                    const isTop1 = row.rank === 1;
                    const isTop2 = row.rank === 2;
                    const isTop3 = row.rank === 3;
                    const isCurrentUser =
                      user?.full_name && row.name.toLowerCase() === user.full_name.toLowerCase();

                    return (
                      <View
                        key={row.rank}
                        style={[
                          styles.tableRow,
                          idx % 2 === 1 && styles.tableRowEven,
                          isCurrentUser && styles.tableRowCurrentUser,
                        ]}
                      >
                        {/* Rank Column */}
                        <View style={styles.colRankContainer}>
                          {isTop1 ? (
                            <View style={styles.rankBadgeGold}>
                              <AppText variant="caption" bold style={styles.rankBadgeGoldText}>
                                1
                              </AppText>
                            </View>
                          ) : isTop2 ? (
                            <View style={styles.rankBadgeSilver}>
                              <AppText variant="caption" bold style={styles.rankBadgeSilverText}>
                                2
                              </AppText>
                            </View>
                          ) : isTop3 ? (
                            <View style={styles.rankBadgeBronze}>
                              <AppText variant="caption" bold style={styles.rankBadgeBronzeText}>
                                3
                              </AppText>
                            </View>
                          ) : (
                            <AppText variant="caption" style={styles.colRankText}>
                              {row.rank}
                            </AppText>
                          )}
                        </View>

                        {/* Player Name */}
                        <View style={styles.colPlayerContainer}>
                          <AppText
                            variant="caption"
                            bold={Boolean(isTop1 || isCurrentUser)}
                            style={[
                              styles.playerNameText,
                              isCurrentUser && styles.youHighlightText,
                            ]}
                            numberOfLines={1}
                          >
                            {row.name}
                          </AppText>
                        </View>

                        {/* Total Points */}
                        <AppText variant="caption" bold style={styles.colPtsText}>
                          {row.points}
                        </AppText>

                        {/* Games Won */}
                        <AppText variant="caption" style={styles.colGamesText}>
                          {row.wins}
                        </AppText>

                        {/* Games Lost */}
                        <AppText variant="caption" style={styles.colGamesText}>
                          {row.losses}
                        </AppText>

                        {/* Points Differential */}
                        <AppText
                          variant="caption"
                          bold
                          style={[
                            styles.colDiffText,
                            row.diff > 0 ? styles.diffPositive : styles.diffNegative,
                          ]}
                        >
                          {row.diff > 0 ? `+${row.diff}` : row.diff}
                        </AppText>
                      </View>
                    );
                  })
                )}
              </View>
            </Card>

            {/* Tie-Breaker Priority Card */}
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <Scale size={18} color="#065F46" />
                </View>
                <AppText variant="heading3" bold style={styles.cardHeading}>
                  Tie-Breaker Priority
                </AppText>
              </View>

              <View style={{ gap: 10 }}>
                {[
                  { num: 1, text: 'Head-to-head match wins' },
                  { num: 2, text: 'Total points differential' },
                  { num: 3, text: 'Total points scored' },
                ].map((item) => (
                  <View key={item.num} style={styles.tiebreakerRow}>
                    <View style={styles.tiebreakerNumBadge}>
                      <AppText variant="caption" bold style={styles.tiebreakerNumText}>
                        {item.num}
                      </AppText>
                    </View>
                    <AppText variant="bodySmall" style={styles.tiebreakerLabelText}>
                      {item.text}
                    </AppText>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PAGE 4: RESULTS                                             */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'results' && (
          <View style={styles.tabContent}>
            {/* Card 1: Official Final Results (Podium) */}
            <Card style={styles.card}>
              <View style={styles.resultsCardHeader}>
                <View style={styles.goldTrophyIconWrap}>
                  <Trophy size={18} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="heading3" bold style={styles.cardHeading}>
                    Official Final Results
                  </AppText>
                </View>
              </View>

              {/* 3-Position Podium Layout */}
              {!champion ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <AppText variant="bodySmall" color="secondary">
                    No final results recorded yet.
                  </AppText>
                </View>
              ) : (
                <View style={styles.podiumContainer}>
                  {/* Runner-Up (2nd Place) */}
                  {runnerUp && (
                    <View style={styles.podiumColSide}>
                      <View style={styles.runnerUpBadgePill}>
                        <AppText variant="caption" bold style={styles.runnerUpBadgeText}>
                          RUNNER-UP
                        </AppText>
                      </View>
                      <View style={styles.silverMedalCircle}>
                        <Medal size={22} color="#64748B" />
                      </View>
                      <AppText variant="body" bold style={styles.podiumName} numberOfLines={1}>
                        {runnerUp.name}
                      </AppText>
                      <AppText variant="caption" style={styles.podiumPlaceLabel}>
                        2nd Place
                      </AppText>
                      <AppText variant="caption" bold style={styles.podiumPtsLabel}>
                        {runnerUp.points} pts
                      </AppText>
                    </View>
                  )}

                  {/* Champion (1st Place) */}
                  <View style={styles.podiumColCenter}>
                    <View style={styles.championBadgePill}>
                      <AppText variant="caption" bold style={styles.championBadgeText}>
                        CHAMPION
                      </AppText>
                    </View>
                    <View style={styles.goldTrophyCircle}>
                      <Trophy size={26} color="#D97706" />
                    </View>
                    <AppText variant="body" bold style={styles.championName} numberOfLines={1}>
                      {champion.name}
                    </AppText>
                    <AppText variant="caption" bold style={styles.championPlaceLabel}>
                      1st Place
                    </AppText>
                    <AppText variant="body" bold style={styles.championPtsLabel}>
                      {champion.points} pts
                    </AppText>
                  </View>

                  {/* 3rd Place */}
                  {thirdPlace && (
                    <View style={styles.podiumColSide}>
                      <View style={styles.thirdPlaceBadgePill}>
                        <AppText variant="caption" bold style={styles.thirdPlaceBadgeText}>
                          3RD PLACE
                        </AppText>
                      </View>
                      <View style={styles.bronzeMedalCircle}>
                        <Medal size={22} color="#D97706" />
                      </View>
                      <AppText variant="body" bold style={styles.podiumName} numberOfLines={1}>
                        {thirdPlace.name}
                      </AppText>
                      <AppText variant="caption" style={styles.podiumPlaceLabel}>
                        3rd Place
                      </AppText>
                      <AppText variant="caption" bold style={styles.podiumPtsLabel}>
                        {thirdPlace.points} pts
                      </AppText>
                    </View>
                  )}
                </View>
              )}
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

              <View style={styles.metricsList}>
                <View style={styles.metricRow}>
                  <AppText variant="bodySmall" style={styles.metricLabel}>
                    Total Rounds
                  </AppText>
                  <AppText variant="bodySmall" bold style={styles.metricValue}>
                    {totalRoundsCount}
                  </AppText>
                </View>

                <View style={styles.metricRow}>
                  <AppText variant="bodySmall" style={styles.metricLabel}>
                    Total Games
                  </AppText>
                  <AppText variant="bodySmall" bold style={styles.metricValue}>
                    {totalGamesCount}
                  </AppText>
                </View>

                <View style={styles.metricRow}>
                  <AppText variant="bodySmall" style={styles.metricLabel}>
                    Completed Games
                  </AppText>
                  <AppText variant="bodySmall" bold style={styles.metricValue}>
                    {completedGamesCount}
                  </AppText>
                </View>

                <View style={styles.metricRow}>
                  <AppText variant="bodySmall" style={styles.metricLabel}>
                    Total Players
                  </AppText>
                  <AppText variant="bodySmall" bold style={styles.metricValue}>
                    {totalPlayersCount}
                  </AppText>
                </View>

                <View style={styles.metricRow}>
                  <AppText variant="bodySmall" style={styles.metricLabel}>
                    Event Duration
                  </AppText>
                  <AppText variant="bodySmall" bold style={styles.metricValue}>
                    {formatDate(tournament.start_date)} – {formatDate(tournament.end_date)}
                  </AppText>
                </View>
              </View>
            </Card>

            {/* Card 3: Awarded Positions */}
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <Medal size={18} color="#065F46" />
                </View>
                <AppText variant="heading3" bold style={styles.cardHeading}>
                  Awarded Positions
                </AppText>
              </View>

              <View style={{ gap: 12 }}>
                {!champion ? (
                  <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                    <AppText variant="bodySmall" color="secondary">
                      No awarded positions yet.
                    </AppText>
                  </View>
                ) : (
                  <>
                    {/* 1: Champion */}
                    <View style={styles.awardedRow}>
                      <View style={styles.awardedCircleGold}>
                        <AppText variant="caption" bold style={styles.awardedCircleText}>
                          1
                        </AppText>
                      </View>
                      <AppText variant="bodySmall" bold style={styles.awardedNameText}>
                        {champion.name}
                      </AppText>
                      <AppText variant="bodySmall" style={styles.awardedPtsText}>
                        {champion.points} pts
                      </AppText>
                    </View>

                    {/* 2: Runner-Up */}
                    {runnerUp && (
                      <View style={styles.awardedRow}>
                        <View style={styles.awardedCircleSilver}>
                          <AppText variant="caption" bold style={styles.awardedCircleText}>
                            2
                          </AppText>
                        </View>
                        <AppText variant="bodySmall" bold style={styles.awardedNameText}>
                          {runnerUp.name}
                        </AppText>
                        <AppText variant="bodySmall" style={styles.awardedPtsText}>
                          {runnerUp.points} pts
                        </AppText>
                      </View>
                    )}

                    {/* 3: Third Place */}
                    {thirdPlace && (
                      <View style={styles.awardedRow}>
                        <View style={styles.awardedCircleBronze}>
                          <AppText variant="caption" bold style={styles.awardedCircleText}>
                            3
                          </AppText>
                        </View>
                        <AppText variant="bodySmall" bold style={styles.awardedNameText}>
                          {thirdPlace.name}
                        </AppText>
                        <AppText variant="bodySmall" style={styles.awardedPtsText}>
                          {thirdPlace.points} pts
                        </AppText>
                      </View>
                    )}
                  </>
                )}
              </View>
            </Card>
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* ─── Match Details Modal ─── */}
      {selectedMatchForModal && (
        <Modal
          visible={Boolean(selectedMatchForModal)}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedMatchForModal(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View>
                  <AppText variant="heading3" bold>
                    Game Details
                  </AppText>
                  <AppText variant="caption" style={{ color: '#64748B' }}>
                    Round {selectedMatchForModal.round_number} • Game {selectedMatchForModal.match_number}
                  </AppText>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedMatchForModal(null)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <X size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <View style={styles.modalMatchBox}>
                  <View style={styles.modalTeamRow}>
                    <AppText variant="bodySmall" bold style={{ flex: 1, color: '#0F172A' }}>
                      {formatSideNames(selectedMatchForModal.side_a_participants)}
                    </AppText>
                    <AppText variant="heading2" bold style={{ color: (selectedMatchForModal.score_a ?? 0) > (selectedMatchForModal.score_b ?? 0) ? '#059669' : '#64748B' }}>
                      {selectedMatchForModal.score_a ?? 0}
                    </AppText>
                  </View>

                  <View style={styles.modalVsDivider}>
                    <AppText variant="caption" style={{ color: '#94A3B8' }}>
                      VS
                    </AppText>
                  </View>

                  <View style={styles.modalTeamRow}>
                    <AppText variant="bodySmall" bold style={{ flex: 1, color: '#0F172A' }}>
                      {formatSideNames(selectedMatchForModal.side_b_participants)}
                    </AppText>
                    <AppText variant="heading2" bold style={{ color: (selectedMatchForModal.score_b ?? 0) > (selectedMatchForModal.score_a ?? 0) ? '#059669' : '#64748B' }}>
                      {selectedMatchForModal.score_b ?? 0}
                    </AppText>
                  </View>
                </View>

                <View style={styles.modalStatusRow}>
                  <CheckCircle2 size={16} color="#059669" style={{ marginRight: 6 }} />
                  <AppText variant="caption" bold style={{ color: '#059669' }}>
                    Match Completed & Verified
                  </AppText>
                </View>

                <View style={styles.modalNoticeBox}>
                  <AppText variant="caption" style={{ color: '#64748B', textAlign: 'center' }}>
                    This is an official completed Scramble game score recorded by the tournament referee.
                  </AppText>
                </View>

                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setSelectedMatchForModal(null)}
                >
                  <AppText variant="bodySmall" bold style={{ color: '#FFFFFF' }}>
                    Close
                  </AppText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  /* ─── Top Navigation Bar ─── */
  topNavBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  navBarInner: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  navBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navTitle: {
    color: '#0F172A',
    fontSize: 17,
  },
  navActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  navIconButton: {
    padding: 4,
  },

  /* ─── Scrollable Body ─── */
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  /* ─── Shared Hero Banner (Standardized matching Round Robin reference) ─── */
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
    justifyContent: 'space-between',
    alignItems: 'center',
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
  scrambleBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  scrambleBadgeText: {
    color: '#15803D',
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

  /* ─── 4-Tab Navigation Bar ─── */
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
  cardSubheading: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 1,
  },
  summaryText: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
  },

  /* ─── Official Final Results (Podium) ─── */
  resultsCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  podiumContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingBottom: 8,
    gap: 8,
  },
  podiumColSide: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  podiumColCenter: {
    flex: 1.15,
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    ...Shadows.sm,
  },
  runnerUpBadgePill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 8,
  },
  runnerUpBadgeText: {
    color: '#475569',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  championBadgePill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  championBadgeText: {
    color: '#D97706',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  thirdPlaceBadgePill: {
    backgroundColor: '#FFEDD5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 8,
  },
  thirdPlaceBadgeText: {
    color: '#C2410C',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  silverMedalCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  goldTrophyCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  bronzeMedalCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#FDBA74',
  },
  podiumName: {
    color: '#0F172A',
    fontSize: 13,
    marginBottom: 2,
    textAlign: 'center',
  },
  championName: {
    color: '#0F172A',
    fontSize: 15,
    marginBottom: 2,
    textAlign: 'center',
  },
  podiumPlaceLabel: {
    color: '#64748B',
    fontSize: 11,
    marginBottom: 2,
  },
  championPlaceLabel: {
    color: '#B45309',
    fontSize: 12,
    marginBottom: 2,
  },
  podiumPtsLabel: {
    color: '#334155',
    fontSize: 12,
  },
  championPtsLabel: {
    color: '#92400E',
    fontSize: 14,
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
    marginLeft: 20,
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
  rotationExplanationText: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },

  /* ─── Tab 2: Rounds & Games ─── */
  filtersBar: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  filterPillText: {
    color: '#475569',
    fontSize: 12,
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  roundCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 0,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    ...Shadows.sm,
  },
  roundHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  roundNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  roundNumberText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  roundTitleCol: {
    flex: 1,
  },
  roundTitle: {
    color: '#0F172A',
    fontSize: 15,
  },
  roundSubtitle: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 1,
  },
  roundHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  completedStatusPill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  completedStatusText: {
    color: '#059669',
    fontSize: 11,
  },
  roundGamesList: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  gameRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  gameLabel: {
    width: 54,
    color: '#94A3B8',
    fontSize: 11,
  },
  gameTeamsCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 10,
  },
  teamPairName: {
    flex: 1,
    color: '#0F172A',
    fontSize: 12,
  },
  vsSeparator: {
    marginHorizontal: 6,
    color: '#94A3B8',
    fontSize: 11,
  },
  youHighlightText: {
    color: '#059669',
    fontWeight: 'bold',
  },
  gameScoreCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 46,
    justifyContent: 'flex-end',
  },
  winningScore: {
    color: '#059669',
    fontSize: 13,
  },
  losingScore: {
    color: '#64748B',
    fontSize: 13,
  },
  scoreDash: {
    color: '#94A3B8',
    fontSize: 12,
  },

  /* ─── Tab 3: Standings Table ─── */
  standingsTable: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  colRank: {
    width: 28,
    color: '#64748B',
    fontSize: 11,
    textAlign: 'center',
  },
  colPlayer: {
    flex: 1,
    color: '#64748B',
    fontSize: 11,
    paddingLeft: 6,
  },
  colPts: {
    width: 44,
    color: '#64748B',
    fontSize: 10,
    textAlign: 'center',
  },
  colGames: {
    width: 44,
    color: '#64748B',
    fontSize: 10,
    textAlign: 'center',
  },
  colDiff: {
    width: 40,
    color: '#64748B',
    fontSize: 11,
    textAlign: 'right',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  tableRowEven: {
    backgroundColor: '#FAFAFA',
  },
  tableRowCurrentUser: {
    backgroundColor: '#F0FDF4',
  },
  colRankContainer: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colRankText: {
    color: '#64748B',
    fontSize: 12,
  },
  rankBadgeGold: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeGoldText: {
    color: '#B45309',
    fontSize: 11,
  },
  rankBadgeSilver: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeSilverText: {
    color: '#475569',
    fontSize: 11,
  },
  rankBadgeBronze: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFEDD5',
    borderWidth: 1,
    borderColor: '#FDBA74',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeBronzeText: {
    color: '#C2410C',
    fontSize: 11,
  },
  colPlayerContainer: {
    flex: 1,
    paddingLeft: 6,
  },
  playerNameText: {
    color: '#0F172A',
    fontSize: 13,
  },
  colPtsText: {
    width: 44,
    color: '#0F172A',
    fontSize: 13,
    textAlign: 'center',
  },
  colGamesText: {
    width: 44,
    color: '#475569',
    fontSize: 12,
    textAlign: 'center',
  },
  colDiffText: {
    width: 40,
    fontSize: 12,
    textAlign: 'right',
  },
  diffPositive: {
    color: '#059669',
  },
  diffNegative: {
    color: '#DC2626',
  },
  tiebreakerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tiebreakerNumBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#064E3B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  tiebreakerNumText: {
    color: '#FFFFFF',
    fontSize: 11,
  },
  tiebreakerLabelText: {
    color: '#0F172A',
    fontSize: 13,
  },

  /* ─── Tab 4: Results Page ─── */
  metricsList: {
    gap: 12,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  metricLabel: {
    color: '#64748B',
    fontSize: 13,
  },
  metricValue: {
    color: '#0F172A',
    fontSize: 13,
  },
  awardedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  awardedCircleGold: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  awardedCircleSilver: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  awardedCircleBronze: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  awardedCircleText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  awardedNameText: {
    flex: 1,
    color: '#0F172A',
    fontSize: 14,
  },
  awardedPtsText: {
    color: '#64748B',
    fontSize: 13,
  },

  /* ─── Modal Styles ─── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    padding: 20,
    ...Shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalBody: {
    gap: 14,
  },
  modalMatchBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  modalTeamRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalVsDivider: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  modalStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    paddingVertical: 6,
    borderRadius: 8,
  },
  modalNoticeBox: {
    backgroundColor: '#F1F5F9',
    padding: 10,
    borderRadius: 8,
  },
  modalCloseButton: {
    backgroundColor: '#064E3B',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
});
