/**
 * Aught2 Pickleball — Finished Pool Play Tournament Details (Player Side)
 *
 * Implements the exact UI design from the reference screenshots:
 *   - Continuous mobile scrollable page with fixed top navigation bar
 *   - Banner hero with [🏆 COMPLETED] & [POOL PLAY] badges
 *   - 5 Horizontal navigation tabs:
 *       1. Overview
 *       2. Pools & Standings
 *       3. Championship Bracket
 *       4. Matches
 *       5. Results
 *   - Overview View (Screenshot 1):
 *       1. 🏆 Tournament Completed / Official Final Results Card (Champion & Runner-Up)
 *       2. 📄 About This Tournament Card
 *       3. 📅 Tournament Details (Competition Specifications: Format, Division, Reg Type, Skill, Gender, Age)
 *       4. 📅 Schedule & Venue (Event Dates, Registration Window, Location with 'View on Map' button)
 *       5. ⚙️ Game Rules (Official Scoring & Tiebreakers)
 *   - Pools & Standings View (Screenshot 2):
 *       1. Pool A Table Card (#, Team, W, L, Pts, PD, [Pool Completed] badge, highlighted row 1)
 *       2. Pool B Table Card (#, Team, W, L, Pts, PD, [Pool Completed] badge, highlighted row 1)
 *       3. Championship Bracket Card (Semifinals & Final bracket tree with scores and 👑 crown)
 *       4. Match Results Section (filter chips: All Matches, Pool A, Pool B, Semifinals, Final)
 *       5. 🏆 View Full Results & Match History CTA button
 *   - Read-only: No registration or editing controls
 */

import React, { useState, useMemo } from 'react';
import {
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
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
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Crown,
  FileText,
  MapPin,
  Medal,
  MoreVertical,
  Settings,
  Share2,
  SlidersHorizontal,
  Tag,
  Trophy,
  Users,
  X,
} from 'lucide-react-native';

import { AppText } from '../AppText';
import { Badge } from '../Badge';
import { Card } from '../Card';
import { Colors, Radius, Shadows, Spacing, Typography } from '@/theme';
import { formatDate } from '@/utils';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';
import {
  usePlayerPools,
  usePlayerPoolMatches,
  usePlayerPoolStandings,
  usePlayerChampionshipMatches,
} from '@/hooks';
import type { Match, PoolStandingRow, Tournament } from '@/types';

interface CompletedPoolPlayViewProps {
  tournament: Tournament;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  isRefreshing?: boolean;
}

type TabType = 'overview' | 'pools' | 'bracket' | 'matches' | 'results';
type MatchFilterType = 'all' | 'pool_a' | 'pool_b' | 'semis' | 'final';

function getTeamStyle(name: string) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return {
    initials,
    bg: '#0F766E',
    color: '#FFFFFF',
    text: '#FFFFFF',
  };
}

export function CompletedPoolPlayView({
  tournament,
  onBack,
  onRefresh,
  isRefreshing = false,
}: CompletedPoolPlayViewProps) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [matchFilter, setMatchFilter] = useState<MatchFilterType>('all');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  // Queries for real backend data
  const tournamentId = tournament.id;
  const { pools = [] } = usePlayerPools(tournamentId);
  const { matches: poolMatches = [] } = usePlayerPoolMatches(tournamentId);
  const { poolsStandings = [] } = usePlayerPoolStandings(tournamentId);
  const { matches: championshipMatches = [] } = usePlayerChampionshipMatches(tournamentId);

  // Parsed configuration
  const parsedConfig = useMemo(() => parseTournamentConfig(tournament), [tournament]);

  // Derive Champion & Runner-Up from championship matches
  const finalResults = useMemo(() => {
    if (championshipMatches.length > 0) {
      const sorted = [...championshipMatches].sort((a, b) => (b.bracket_round ?? 1) - (a.bracket_round ?? 1));
      const finalMatch = sorted[0];
      if (finalMatch && finalMatch.winner_team) {
        const champTeam = finalMatch.winner_team?.name || '';
        const runnerUpTeam =
          finalMatch.winner_team_id === finalMatch.team_a_id
            ? finalMatch.team_b?.name || ''
            : finalMatch.team_a?.name || '';

        return {
          champion: {
            name: champTeam,
            players: (finalMatch.winner_team as any)?.player_names || '',
          },
          runnerUp: {
            name: runnerUpTeam,
            players: '',
          },
        };
      }
    }

    return {
      champion: null,
      runnerUp: null,
    };
  }, [championshipMatches]);

  // Pool Standings from actual backend data
  const poolAStandings: PoolStandingRow[] = useMemo(() => {
    const found = poolsStandings.find((p) => p.pool_name.toLowerCase().includes('a'));
    return found?.standings || [];
  }, [poolsStandings]);

  const poolBStandings: PoolStandingRow[] = useMemo(() => {
    const found = poolsStandings.find((p) => p.pool_name.toLowerCase().includes('b'));
    return found?.standings || [];
  }, [poolsStandings]);

  // Final placements breakdown derived from real results
  const finalPlacements = useMemo(() => {
    const placements: Array<{
      rank: number;
      badge: string;
      teamName: string;
      players: string;
      stage: string;
      record: string;
    }> = [];

    let rankCounter = 1;
    if (finalResults.champion) {
      placements.push({
        rank: rankCounter++,
        badge: '1st',
        teamName: finalResults.champion.name,
        players: finalResults.champion.players,
        stage: 'Champion',
        record: '',
      });
    }
    if (finalResults.runnerUp && finalResults.runnerUp.name) {
      placements.push({
        rank: rankCounter++,
        badge: '2nd',
        teamName: finalResults.runnerUp.name,
        players: finalResults.runnerUp.players,
        stage: 'Runner-Up',
        record: '',
      });
    }

    poolsStandings.forEach((p) => {
      (p.standings || []).forEach((s) => {
        if (!placements.some((item) => item.teamName === s.team_name)) {
          placements.push({
            rank: rankCounter,
            badge: `${rankCounter}th`,
            teamName: s.team_name,
            players: '',
            stage: p.pool_name,
            record: `${s.wins}-${s.losses}`,
          });
          rankCounter++;
        }
      });
    });

    return placements;
  }, [finalResults, poolsStandings]);

  // Combined Matches list for Match Results section from actual records
  const allMatchesList = useMemo(() => {
    const list: Array<{
      id: string;
      stageLabel: string;
      stageType: MatchFilterType;
      court: string;
      teamA: { name: string; score: string };
      teamB: { name: string; score: string };
      originalMatch?: Match;
    }> = [];

    championshipMatches.forEach((m) => {
      const isFinal = (m.bracket_round ?? 1) >= 2;
      list.push({
        id: m.id,
        stageLabel: isFinal ? 'Final' : 'Semi',
        stageType: isFinal ? 'final' : 'semis',
        court: (m as any).court?.name || (m.court_id ? `Court ${m.court_id}` : 'Court 1'),
        teamA: { name: m.team_a?.name || 'Team A', score: m.score_a != null ? String(m.score_a) : '-' },
        teamB: { name: m.team_b?.name || 'Team B', score: m.score_b != null ? String(m.score_b) : '-' },
        originalMatch: m,
      });
    });

    poolMatches.forEach((m) => {
      const poolName = (m as any).pool?.name || 'Pool';
      const stageType: MatchFilterType = poolName.toLowerCase().includes('b') ? 'pool_b' : 'pool_a';
      list.push({
        id: m.id,
        stageLabel: poolName,
        stageType,
        court: (m as any).court?.name || (m.court_id ? `Court ${m.court_id}` : 'Court 1'),
        teamA: { name: m.team_a?.name || 'Team A', score: m.score_a != null ? String(m.score_a) : '-' },
        teamB: { name: m.team_b?.name || 'Team B', score: m.score_b != null ? String(m.score_b) : '-' },
        originalMatch: m,
      });
    });

    return list;
  }, [championshipMatches, poolMatches]);

  const filteredMatches = useMemo(() => {
    if (matchFilter === 'all') return allMatchesList;
    return allMatchesList.filter((m) => m.stageType === matchFilter);
  }, [allMatchesList, matchFilter]);

  // Share handler
  const handleShare = async () => {
    try {
      await Share.share({
        title: tournament.name,
        message: `Check out the completed ${tournament.name} on Aught2 Pickleball! Champion: ${finalResults.champion?.name || 'TBD'}`,
      });
    } catch {
      // Ignore share dismissal
    }
  };

  // Open map handler
  const handleViewOnMap = () => {
    const loc = tournament.location_name || 'Club Center';
    const query = encodeURIComponent(loc);
    const url = Platform.select({
      ios: `maps:0,0?q=${query}`,
      android: `geo:0,0?q=${query}`,
      default: `https://www.google.com/maps/search/?api=1&query=${query}`,
    });

    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Alert.alert('Tournament Location', loc);
        }
      })
      .catch(() => {
        Alert.alert('Tournament Location', loc);
      });
  };

  return (
    <View style={styles.screenWrapper}>
      {/* ─── 1. Fixed Top Navigation Bar ─── */}
      <View style={[styles.fixedHeader, { paddingTop: Math.max(insets.top, 12) }]}>
        <View style={styles.fixedHeaderContent}>
          <TouchableOpacity
            onPress={onBack}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Back to tournaments"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ArrowLeft size={20} color="#1E293B" />
            <AppText variant="body" bold style={styles.backBtnText}>
              Tournaments
            </AppText>
          </TouchableOpacity>

          <View style={styles.headerRightActions}>
            <TouchableOpacity
              onPress={handleShare}
              style={styles.headerIconBtn}
              accessibilityRole="button"
              accessibilityLabel="Share tournament"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Share2 size={20} color="#1E293B" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  tournament.name,
                  'Pool Play Tournament • Completed\nAll final matches and standings verified.',
                  [
                    { text: 'Refresh Results', onPress: () => void onRefresh() },
                    { text: 'Done', style: 'cancel' },
                  ]
                );
              }}
              style={styles.headerIconBtn}
              accessibilityRole="button"
              accessibilityLabel="More options"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MoreVertical size={20} color="#1E293B" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ─── 2. Continuous Scrollable Content ─── */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(insets.top, 12) + 54 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => void onRefresh()} />
        }
      >
        {/* ─── Standardized Hero Banner matching Round Robin reference ─── */}
        <View style={styles.heroSection}>
          <Image
            source={require('../../../assets/tournaments/banner2.jpg')}
            style={styles.heroImage}
            resizeMode="cover"
          />
          {/* Standardized dark green overlay */}
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

              <View style={styles.formatPill}>
                <AppText variant="caption" bold style={styles.formatPillText}>
                  POOL PLAY
                </AppText>
              </View>
            </View>

            {/* Bottom Content: Title, Subtitle, Meta */}
            <View style={styles.heroInfoBlock}>
              {/* Tournament Title */}
              <AppText variant="heading1" style={styles.heroTitle} numberOfLines={1}>
                {tournament.name}
              </AppText>

              {/* Subtitle */}
              <AppText variant="bodySmall" style={styles.heroSubtitle} numberOfLines={1}>
                Hosted by {tournament.location_name || 'Club Center'}
              </AppText>

              {/* Meta Row: Date, Location, Participants */}
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
                    {tournament.location_name || 'Club Center'}
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

        {/* ─── 4. Competition Navigation Tabs ─── */}
        <View style={styles.tabsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsScrollContent}
          >
            {[
              { key: 'overview', label: 'Overview' },
              { key: 'pools', label: 'Pools & Standings' },
              { key: 'bracket', label: 'Championship Bracket' },
              { key: 'matches', label: 'Matches' },
              { key: 'results', label: 'Results' },
            ].map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tabPill, isActive && styles.tabPillActive]}
                  onPress={() => setActiveTab(tab.key as TabType)}
                  activeOpacity={0.7}
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
        {/* TAB 1: OVERVIEW (Overview Details Only)                     */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <View style={styles.tabContentBlock}>
            {/* Card 1: 🏆 Tournament Completed / Official Final Results */}
            <Card style={styles.tournamentCompletedCard}>
              <View style={styles.tcHeader}>
                <View style={styles.tcTrophyIconWrap}>
                  <Trophy size={20} color="#D97706" />
                </View>
                <AppText variant="heading2" style={styles.tcHeading}>
                  Tournament Completed
                </AppText>
                <AppText variant="caption" style={styles.tcSubtitle}>
                  Congratulations to all players for an incredible event!
                </AppText>
              </View>

              {!finalResults.champion ? (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <AppText variant="bodySmall" style={{ color: '#64748B' }}>
                    Championship results will be determined upon completion of bracket play.
                  </AppText>
                </View>
              ) : (
                <View style={styles.tcResultsRow}>
                  {/* Runner-Up (Left) */}
                  <View style={styles.tcPodiumCol}>
                    <AppText variant="caption" style={styles.tcLabelRunnerUp}>
                      Runner-Up
                    </AppText>
                    <View style={styles.silverMedalCircle}>
                      <Medal size={22} color="#64748B" />
                    </View>
                    <AppText variant="bodySmall" bold style={styles.tcTeamName}>
                      {finalResults.runnerUp?.name || 'TBD'}
                    </AppText>
                    {!!finalResults.runnerUp?.players && (
                      <AppText variant="caption" style={styles.tcPlayerNames}>
                        {finalResults.runnerUp.players}
                      </AppText>
                    )}
                  </View>

                  {/* Vertical Divider */}
                  <View style={styles.tcVerticalDivider} />

                  {/* Champion (Right) */}
                  <View style={styles.tcPodiumCol}>
                    <AppText variant="caption" bold style={styles.tcLabelChampion}>
                      Champion
                    </AppText>
                    <View style={styles.goldMedalCircle}>
                      <Trophy size={22} color="#D97706" />
                    </View>
                    <AppText variant="bodySmall" bold style={styles.tcTeamName}>
                      {finalResults.champion.name}
                    </AppText>
                    {!!finalResults.champion.players && (
                      <AppText variant="caption" style={styles.tcPlayerNames}>
                        {finalResults.champion.players}
                      </AppText>
                    )}
                  </View>
                </View>
              )}
            </Card>

            {/* Card 2: 📄 About This Tournament */}
            <Card style={styles.infoCard}>
              <View style={styles.cardHeaderRow}>
                <FileText size={17} color="#104E3E" style={{ marginRight: 8 }} />
                <AppText variant="heading3" style={styles.cardHeaderTitle}>
                  About This Tournament
                </AppText>
              </View>
              <AppText variant="bodySmall" style={styles.cardBodyText}>
                {tournament.description ||
                  'Completed championship pool play. Pool winners advanced to the final bracket. Great competition and sportsmanship from all teams!'}
              </AppText>
            </Card>

            {/* Card 3: 📅 Tournament Details (Competition Specifications) */}
            <Card style={styles.infoCard}>
              <View style={styles.cardHeaderRow}>
                <SlidersHorizontal size={17} color="#104E3E" style={{ marginRight: 8 }} />
                <AppText variant="heading3" style={styles.cardHeaderTitle}>
                  Tournament Details
                </AppText>
              </View>

              <View style={styles.specsGrid}>
                {/* Format */}
                <View style={styles.specBox}>
                  <View style={styles.specIconCircle}>
                    <Tag size={14} color="#104E3E" />
                  </View>
                  <View style={styles.specTextCol}>
                    <AppText variant="caption" color="tertiary" style={styles.specLabel}>
                      Format
                    </AppText>
                    <AppText variant="bodySmall" bold style={styles.specValue}>
                      Pool Play
                    </AppText>
                  </View>
                </View>

                {/* Division */}
                <View style={styles.specBox}>
                  <View style={styles.specIconCircle}>
                    <Trophy size={14} color="#104E3E" />
                  </View>
                  <View style={styles.specTextCol}>
                    <AppText variant="caption" color="tertiary" style={styles.specLabel}>
                      Division
                    </AppText>
                    <AppText variant="bodySmall" bold style={styles.specValue}>
                      {parsedConfig.category || 'Mixed Doubles'}
                    </AppText>
                  </View>
                </View>

                {/* Registration Type */}
                <View style={styles.specBox}>
                  <View style={styles.specIconCircle}>
                    <Users size={14} color="#104E3E" />
                  </View>
                  <View style={styles.specTextCol}>
                    <AppText variant="caption" color="tertiary" style={styles.specLabel}>
                      Registration Type
                    </AppText>
                    <AppText variant="bodySmall" bold style={styles.specValue}>
                      Fixed Team (Doubles)
                    </AppText>
                  </View>
                </View>

                {/* Skill Requirement */}
                <View style={styles.specBox}>
                  <View style={styles.specIconCircle}>
                    <SlidersHorizontal size={14} color="#104E3E" />
                  </View>
                  <View style={styles.specTextCol}>
                    <AppText variant="caption" color="tertiary" style={styles.specLabel}>
                      Skill Requirement
                    </AppText>
                    <AppText variant="bodySmall" bold style={styles.specValue}>
                      {parsedConfig.skillLevel || '3.5'} Level
                    </AppText>
                  </View>
                </View>

                {/* Gender Eligibility */}
                <View style={styles.specBox}>
                  <View style={styles.specIconCircle}>
                    <Users size={14} color="#104E3E" />
                  </View>
                  <View style={styles.specTextCol}>
                    <AppText variant="caption" color="tertiary" style={styles.specLabel}>
                      Gender Eligibility
                    </AppText>
                    <AppText variant="bodySmall" bold style={styles.specValue}>
                      {parsedConfig.genderEligibility || 'Any'}
                    </AppText>
                  </View>
                </View>

                {/* Age Limits */}
                <View style={styles.specBox}>
                  <View style={styles.specIconCircle}>
                    <Calendar size={14} color="#104E3E" />
                  </View>
                  <View style={styles.specTextCol}>
                    <AppText variant="caption" color="tertiary" style={styles.specLabel}>
                      Age Limits
                    </AppText>
                    <AppText variant="bodySmall" bold style={styles.specValue}>
                      All Ages
                    </AppText>
                  </View>
                </View>
              </View>
            </Card>

            {/* Card 4: 📅 Schedule & Venue */}
            <Card style={styles.infoCard}>
              <View style={styles.cardHeaderRow}>
                <Calendar size={17} color="#104E3E" style={{ marginRight: 8 }} />
                <AppText variant="heading3" style={styles.cardHeaderTitle}>
                  Schedule & Venue
                </AppText>
              </View>

              {/* Event Dates */}
              <View style={styles.scheduleItem}>
                <Calendar size={16} color="#104E3E" style={styles.scheduleItemIcon} />
                <View style={styles.scheduleTextWrap}>
                  <AppText variant="bodySmall" bold style={styles.scheduleLabel}>
                    Event Dates
                  </AppText>
                  <AppText variant="caption" style={styles.scheduleValue}>
                    {formatDate(tournament.start_date)} – {formatDate(tournament.end_date)}
                  </AppText>
                </View>
              </View>

              {/* Registration Window */}
              <View style={styles.scheduleItem}>
                <Clock size={16} color="#104E3E" style={styles.scheduleItemIcon} />
                <View style={styles.scheduleTextWrap}>
                  <AppText variant="bodySmall" bold style={styles.scheduleLabel}>
                    Registration Window
                  </AppText>
                  <AppText variant="caption" style={styles.scheduleValue}>
                    Opens: {formatDate(tournament.registration_open_at)}
                  </AppText>
                  <AppText variant="caption" style={styles.scheduleValue}>
                    Closes: {formatDate(tournament.registration_close_at)}
                  </AppText>
                </View>
              </View>

              {/* Location */}
              <View style={styles.scheduleLocationItem}>
                <MapPin size={16} color="#104E3E" style={styles.scheduleItemIcon} />
                <View style={styles.scheduleTextWrap}>
                  <AppText variant="bodySmall" bold style={styles.scheduleLabel}>
                    Location
                  </AppText>
                  <AppText variant="caption" style={styles.scheduleValue}>
                    {tournament.location_name || 'Club Center'}
                  </AppText>
                </View>

                <TouchableOpacity
                  style={styles.viewOnMapBtn}
                  onPress={handleViewOnMap}
                  activeOpacity={0.8}
                >
                  <MapPin size={12} color="#104E3E" style={{ marginRight: 4 }} />
                  <AppText variant="caption" bold style={styles.viewOnMapText}>
                    View on Map
                  </AppText>
                </TouchableOpacity>
              </View>
            </Card>

            {/* Card 5: ⚙️ Game Rules (Official Scoring & Tiebreakers) */}
            <Card style={styles.infoCard}>
              <View style={styles.cardHeaderRow}>
                <Settings size={17} color="#104E3E" style={{ marginRight: 8 }} />
                <AppText variant="heading3" style={styles.cardHeaderTitle}>
                  Game Rules
                </AppText>
              </View>

              <View style={styles.rulesList}>
                <View style={styles.ruleRow}>
                  <Tag size={15} color="#104E3E" style={styles.ruleIcon} />
                  <View style={styles.ruleTextCol}>
                    <AppText variant="caption" color="tertiary" style={styles.ruleLabel}>
                      Game Format
                    </AppText>
                    <AppText variant="bodySmall" style={styles.ruleValue}>
                      First to {tournament.scoring_rules?.target_score ?? 11} points, win by {tournament.scoring_rules?.win_by ?? 2}.
                    </AppText>
                  </View>
                </View>

                <View style={styles.ruleRow}>
                  <Tag size={15} color="#104E3E" style={styles.ruleIcon} />
                  <View style={styles.ruleTextCol}>
                    <AppText variant="caption" color="tertiary" style={styles.ruleLabel}>
                      Tiebreaker Priority
                    </AppText>
                    <AppText variant="bodySmall" style={styles.ruleValue}>
                      1. Head-to-head match wins{'\n'}
                      2. Total points differential{'\n'}
                      3. Total points scored
                    </AppText>
                  </View>
                </View>
              </View>
            </Card>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB 2: POOLS & STANDINGS (Pools & Standings Only)           */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'pools' && (
          <View style={styles.tabContentBlock}>
            {poolAStandings.length === 0 && poolBStandings.length === 0 ? (
              <Card style={styles.infoCard}>
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <AppText variant="bodySmall" style={{ color: '#64748B' }}>
                    No pool standings available. Standings will appear once pool matches are played.
                  </AppText>
                </View>
              </Card>
            ) : (
              <>
                {/* Pool A Card */}
                {poolAStandings.length > 0 && (
                  <Card style={styles.poolTableCard}>
                    <View style={styles.poolCardHeader}>
                      <AppText variant="heading3" style={styles.poolCardTitle}>
                        Pool A
                      </AppText>
                      <View style={styles.poolCompletedBadge}>
                        <AppText variant="caption" bold style={styles.poolCompletedText}>
                          Pool Completed
                        </AppText>
                      </View>
                    </View>

                    <View style={styles.tableHeaderRow}>
                      <AppText variant="caption" bold style={styles.thRank}>#</AppText>
                      <AppText variant="caption" bold style={styles.thTeam}>Team</AppText>
                      <AppText variant="caption" bold style={styles.thStat}>W</AppText>
                      <AppText variant="caption" bold style={styles.thStat}>L</AppText>
                      <AppText variant="caption" bold style={styles.thStat}>Pts</AppText>
                      <AppText variant="caption" bold style={styles.thPd}>PD</AppText>
                    </View>

                    {poolAStandings.map((row, idx) => {
                      const isQual = row.rank === 1;
                      return (
                        <View
                          key={`poolA-${row.team_name}-${idx}`}
                          style={[styles.tableDataRow, isQual && styles.tableDataRowQualified]}
                        >
                          <View style={styles.thRank}>
                            <View
                              style={[
                                styles.rankCircle,
                                row.rank === 1 && styles.rankCircleGold,
                                row.rank === 2 && styles.rankCircleSilver,
                              ]}
                            >
                              <AppText
                                variant="caption"
                                bold
                                style={[
                                  styles.rankCircleText,
                                  row.rank === 1 && styles.rankCircleTextGold,
                                  row.rank === 2 && styles.rankCircleTextSilver,
                                ]}
                              >
                                {row.rank}
                              </AppText>
                            </View>
                          </View>

                          <View style={styles.thTeam}>
                            <AppText
                              variant="bodySmall"
                              bold={isQual}
                              numberOfLines={1}
                              style={[styles.teamNameText, isQual && styles.teamNameTextQualified]}
                            >
                              {row.team_name}
                            </AppText>
                          </View>

                          <AppText variant="bodySmall" style={styles.thStat}>
                            {row.wins}
                          </AppText>
                          <AppText variant="bodySmall" style={styles.thStat}>
                            {row.losses}
                          </AppText>
                          <AppText variant="bodySmall" bold style={styles.thStat}>
                            {row.points_scored}
                          </AppText>
                          <AppText
                            variant="bodySmall"
                            bold={row.points_differential > 0}
                            style={[
                              styles.thPd,
                              row.points_differential > 0 && styles.pdPositive,
                            ]}
                          >
                            {row.points_differential > 0
                              ? `+${row.points_differential}`
                              : row.points_differential}
                          </AppText>
                        </View>
                      );
                    })}
                  </Card>
                )}

                {/* Pool B Card */}
                {poolBStandings.length > 0 && (
                  <Card style={styles.poolTableCard}>
                    <View style={styles.poolCardHeader}>
                      <AppText variant="heading3" style={styles.poolCardTitle}>
                        Pool B
                      </AppText>
                      <View style={styles.poolCompletedBadge}>
                        <AppText variant="caption" bold style={styles.poolCompletedText}>
                          Pool Completed
                        </AppText>
                      </View>
                    </View>

                    <View style={styles.tableHeaderRow}>
                      <AppText variant="caption" bold style={styles.thRank}>#</AppText>
                      <AppText variant="caption" bold style={styles.thTeam}>Team</AppText>
                      <AppText variant="caption" bold style={styles.thStat}>W</AppText>
                      <AppText variant="caption" bold style={styles.thStat}>L</AppText>
                      <AppText variant="caption" bold style={styles.thStat}>Pts</AppText>
                      <AppText variant="caption" bold style={styles.thPd}>PD</AppText>
                    </View>

                    {poolBStandings.map((row, idx) => {
                      const isQual = row.rank === 1;
                      return (
                        <View
                          key={`poolB-${row.team_name}-${idx}`}
                          style={[styles.tableDataRow, isQual && styles.tableDataRowQualified]}
                        >
                          <View style={styles.thRank}>
                            <View
                              style={[
                                styles.rankCircle,
                                row.rank === 1 && styles.rankCircleGold,
                                row.rank === 2 && styles.rankCircleSilver,
                              ]}
                            >
                              <AppText
                                variant="caption"
                                bold
                                style={[
                                  styles.rankCircleText,
                                  row.rank === 1 && styles.rankCircleTextGold,
                                  row.rank === 2 && styles.rankCircleTextSilver,
                                ]}
                              >
                                {row.rank}
                              </AppText>
                            </View>
                          </View>

                          <View style={styles.thTeam}>
                            <AppText
                              variant="bodySmall"
                              bold={isQual}
                              numberOfLines={1}
                              style={[styles.teamNameText, isQual && styles.teamNameTextQualified]}
                            >
                              {row.team_name}
                            </AppText>
                          </View>

                          <AppText variant="bodySmall" style={styles.thStat}>
                            {row.wins}
                          </AppText>
                          <AppText variant="bodySmall" style={styles.thStat}>
                            {row.losses}
                          </AppText>
                          <AppText variant="bodySmall" bold style={styles.thStat}>
                            {row.points_scored}
                          </AppText>
                          <AppText
                            variant="bodySmall"
                            bold={row.points_differential > 0}
                            style={[
                              styles.thPd,
                              row.points_differential > 0 && styles.pdPositive,
                            ]}
                          >
                            {row.points_differential > 0
                              ? `+${row.points_differential}`
                              : row.points_differential}
                          </AppText>
                        </View>
                      );
                    })}
                  </Card>
                )}
              </>
            )}

            {/* Advancement & Qualification Info Card */}
            <Card style={styles.infoCard}>
              <View style={styles.cardHeaderRow}>
                <Trophy size={17} color="#104E3E" style={{ marginRight: 8 }} />
                <AppText variant="heading3" style={styles.cardHeaderTitle}>
                  Advancement & Qualification
                </AppText>
              </View>
              <AppText variant="bodySmall" style={styles.cardBodyText}>
                Top qualifying teams from each pool advanced to the single elimination Championship Bracket.
              </AppText>
            </Card>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB 3: CHAMPIONSHIP BRACKET (Bracket Only)                  */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'bracket' && (
          <View style={styles.tabContentBlock}>
            <Card style={styles.bracketSectionCard}>
              <View style={styles.bracketCardHeader}>
                <AppText variant="heading3" style={styles.bracketCardTitle}>
                  Championship Bracket
                </AppText>
                <View style={styles.finalResultsBadge}>
                  <AppText variant="caption" bold style={styles.finalResultsText}>
                    Final Results
                  </AppText>
                </View>
              </View>

              {championshipMatches.length === 0 ? (
                <View style={{ paddingVertical: 28, alignItems: 'center' }}>
                  <AppText variant="bodySmall" style={{ color: '#64748B' }}>
                    Championship bracket matches will appear once qualified teams from pool play advance.
                  </AppText>
                </View>
              ) : (
                <View style={{ paddingVertical: 16 }}>
                  {championshipMatches.map((m, idx) => (
                    <View key={m.id || idx} style={[styles.bracketMatchBox, { marginBottom: 12 }]}>
                      <View style={styles.bracketTeamRow}>
                        <AppText variant="caption" bold style={styles.bracketTeamName}>
                          {m.team_a?.name || 'TBD'}
                        </AppText>
                        <AppText variant="caption" bold style={styles.bracketScoreBold}>
                          {m.score_a != null ? m.score_a : '-'}
                        </AppText>
                      </View>
                      <View style={styles.bracketMatchDivider} />
                      <View style={styles.bracketTeamRow}>
                        <AppText variant="caption" style={styles.bracketTeamName}>
                          {m.team_b?.name || 'TBD'}
                        </AppText>
                        <AppText variant="caption" style={styles.bracketScoreMuted}>
                          {m.score_b != null ? m.score_b : '-'}
                        </AppText>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </Card>

            {finalResults.champion ? (
              <Card style={styles.infoCard}>
                <View style={styles.cardHeaderRow}>
                  <Crown size={17} color="#D97706" style={{ marginRight: 8 }} />
                  <AppText variant="heading3" style={styles.cardHeaderTitle}>
                    Bracket Outcome
                  </AppText>
                </View>
                <AppText variant="bodySmall" style={styles.cardBodyText}>
                  {finalResults.champion.name} secured the tournament title!
                </AppText>
              </Card>
            ) : null}
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB 4: MATCHES (Matches Only)                               */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'matches' && (
          <View style={styles.tabContentBlock}>
            <View style={styles.matchResultsSection}>
              <AppText variant="heading3" style={styles.matchResultsTitle}>
                Match Results
              </AppText>

              {/* Filter Chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.matchFilterChipsRow}
              >
                {[
                  { key: 'all', label: 'All Matches' },
                  { key: 'pool_a', label: 'Pool A' },
                  { key: 'pool_b', label: 'Pool B' },
                  { key: 'semis', label: 'Semifinals' },
                  { key: 'final', label: 'Final' },
                ].map((chip) => {
                  const isSelected = matchFilter === chip.key;
                  return (
                    <TouchableOpacity
                      key={chip.key}
                      style={[styles.matchFilterChip, isSelected && styles.matchFilterChipActive]}
                      onPress={() => setMatchFilter(chip.key as MatchFilterType)}
                      activeOpacity={0.8}
                    >
                      <AppText
                        variant="caption"
                        bold={isSelected}
                        style={[
                          styles.matchFilterChipText,
                          isSelected && styles.matchFilterChipTextActive,
                        ]}
                      >
                        {chip.label}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Match Cards List */}
              {filteredMatches.length === 0 ? (
                <Card style={styles.infoCard}>
                  <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                    <AppText variant="bodySmall" style={{ color: '#64748B' }}>
                      No matches found for the selected filter.
                    </AppText>
                  </View>
                </Card>
              ) : (
                <View style={styles.matchesList}>
                  {filteredMatches.map((m) => {
                    const teamAStyle = getTeamStyle(m.teamA.name);
                    const teamBStyle = getTeamStyle(m.teamB.name);

                    return (
                      <Card key={m.id} style={styles.matchResultCard}>
                        {/* Stage and Court */}
                        <View style={styles.matchStageCol}>
                          <AppText variant="caption" bold style={styles.matchStageText}>
                            {m.stageLabel}
                          </AppText>
                          <AppText variant="caption" style={styles.matchCourtText}>
                            {m.court}
                          </AppText>
                        </View>

                        {/* Matchup Teams & Scores */}
                        <View style={styles.matchupCol}>
                          <View style={styles.matchRowTeam}>
                            <View style={[styles.avatarMicro, { backgroundColor: teamAStyle.bg }]}>
                              <AppText
                                variant="caption"
                                bold
                                style={{ color: teamAStyle.text, fontSize: 9 }}
                              >
                                {teamAStyle.initials}
                              </AppText>
                            </View>
                            <AppText
                              variant="caption"
                              bold
                              numberOfLines={1}
                              style={styles.matchRowTeamName}
                            >
                              {m.teamA.name}
                            </AppText>
                            <AppText variant="caption" bold style={styles.matchRowScore}>
                              {m.teamA.score}
                            </AppText>
                          </View>

                          <View style={[styles.matchRowTeam, { marginTop: 4 }]}>
                            <View style={[styles.avatarMicro, { backgroundColor: teamBStyle.bg }]}>
                              <AppText
                                variant="caption"
                                bold
                                style={{ color: teamBStyle.text, fontSize: 9 }}
                              >
                                {teamBStyle.initials}
                              </AppText>
                            </View>
                            <AppText
                              variant="caption"
                              numberOfLines={1}
                              style={styles.matchRowTeamName}
                            >
                              {m.teamB.name}
                            </AppText>
                            <AppText variant="caption" style={styles.matchRowScoreMuted}>
                              {m.teamB.score}
                            </AppText>
                          </View>
                        </View>

                        {/* View Button */}
                        <TouchableOpacity
                          style={styles.viewMatchBtn}
                          onPress={() => {
                            Alert.alert(
                              `${m.stageLabel} • ${m.court}`,
                              `${m.teamA.name} (${m.teamA.score})\nvs\n${m.teamB.name} (${m.teamB.score})\n\nStatus: Official Completed`
                            );
                          }}
                          activeOpacity={0.7}
                        >
                          <AppText variant="caption" bold style={styles.viewMatchBtnText}>
                            View
                          </AppText>
                        </TouchableOpacity>
                      </Card>
                    );
                  })}
                </View>
              )}

              {/* Bottom CTA Button */}
              <TouchableOpacity
                style={styles.viewFullResultsCta}
                onPress={() => setActiveTab('results')}
                activeOpacity={0.85}
              >
                <Trophy size={18} color="#104E3E" style={{ marginRight: 8 }} />
                <AppText variant="bodySmall" bold style={styles.viewFullResultsCtaText}>
                  View Full Results & Standings
                </AppText>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TAB 5: RESULTS (Results Only)                               */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {activeTab === 'results' && (
          <View style={styles.tabContentBlock}>
            {/* Card 1: 🏆 Tournament Completed / Official Final Results */}
            <Card style={styles.tournamentCompletedCard}>
              <View style={styles.tcHeader}>
                <View style={styles.tcTrophyIconWrap}>
                  <Trophy size={20} color="#D97706" />
                </View>
                <AppText variant="heading2" style={styles.tcHeading}>
                  Tournament Completed
                </AppText>
                <AppText variant="caption" style={styles.tcSubtitle}>
                  Congratulations to all players for an incredible event!
                </AppText>
              </View>

              {!finalResults.champion ? (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <AppText variant="bodySmall" style={{ color: '#64748B' }}>
                    Championship results will be determined upon completion of bracket play.
                  </AppText>
                </View>
              ) : (
                <View style={styles.tcResultsRow}>
                  {/* Runner-Up (Left) */}
                  <View style={styles.tcPodiumCol}>
                    <AppText variant="caption" style={styles.tcLabelRunnerUp}>
                      Runner-Up
                    </AppText>
                    <View style={styles.silverMedalCircle}>
                      <Medal size={22} color="#64748B" />
                    </View>
                    <AppText variant="bodySmall" bold style={styles.tcTeamName}>
                      {finalResults.runnerUp?.name || 'TBD'}
                    </AppText>
                    {!!finalResults.runnerUp?.players && (
                      <AppText variant="caption" style={styles.tcPlayerNames}>
                        {finalResults.runnerUp.players}
                      </AppText>
                    )}
                  </View>

                  {/* Vertical Divider */}
                  <View style={styles.tcVerticalDivider} />

                  {/* Champion (Right) */}
                  <View style={styles.tcPodiumCol}>
                    <AppText variant="caption" bold style={styles.tcLabelChampion}>
                      Champion
                    </AppText>
                    <View style={styles.goldMedalCircle}>
                      <Trophy size={22} color="#D97706" />
                    </View>
                    <AppText variant="bodySmall" bold style={styles.tcTeamName}>
                      {finalResults.champion.name}
                    </AppText>
                    {!!finalResults.champion.players && (
                      <AppText variant="caption" style={styles.tcPlayerNames}>
                        {finalResults.champion.players}
                      </AppText>
                    )}
                  </View>
                </View>
              )}
            </Card>

            {/* Card 2: 🏅 Official Final Placements */}
            <Card style={styles.infoCard}>
              <View style={styles.cardHeaderRow}>
                <Medal size={17} color="#104E3E" style={{ marginRight: 8 }} />
                <AppText variant="heading3" style={styles.cardHeaderTitle}>
                  Official Final Placements
                </AppText>
              </View>

              {finalPlacements.length === 0 ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <AppText variant="bodySmall" style={{ color: '#64748B' }}>
                    Final placements will be determined upon completion of matches.
                  </AppText>
                </View>
              ) : (
                <View style={styles.placementsList}>
                {finalPlacements.map((p, idx) => (
                  <View
                    key={`placement-${p.rank}-${idx}`}
                    style={[
                      styles.placementRow,
                      idx === 0 && styles.placementRowGold,
                      idx === 1 && styles.placementRowSilver,
                    ]}
                  >
                    <View style={styles.placementBadgeCol}>
                      <View
                        style={[
                          styles.placementBadge,
                          idx === 0 && styles.placementBadgeGold,
                          idx === 1 && styles.placementBadgeSilver,
                          idx >= 2 && idx <= 3 && styles.placementBadgeBronze,
                        ]}
                      >
                        <AppText
                          variant="caption"
                          bold
                          style={[
                            styles.placementBadgeText,
                            idx === 0 && styles.placementBadgeTextGold,
                            idx === 1 && styles.placementBadgeTextSilver,
                            idx >= 2 && idx <= 3 && styles.placementBadgeTextBronze,
                          ]}
                        >
                          {p.badge}
                        </AppText>
                      </View>
                    </View>

                    <View style={styles.placementInfoCol}>
                      <AppText variant="bodySmall" bold style={styles.placementTeamName}>
                        {p.teamName}
                      </AppText>
                      <AppText variant="caption" color="tertiary" style={styles.placementPlayerNames}>
                        {p.players}
                      </AppText>
                    </View>

                    <View style={styles.placementStageCol}>
                      <AppText variant="caption" bold style={styles.placementStageText}>
                        {p.stage}
                      </AppText>
                      <AppText variant="caption" color="tertiary" style={styles.placementRecordText}>
                        {p.record}
                      </AppText>
                    </View>
                  </View>
                ))}
                </View>
              )}
            </Card>

            {/* Card 3: 📊 Tournament Summary & Statistics */}
            <Card style={styles.infoCard}>
              <View style={styles.cardHeaderRow}>
                <SlidersHorizontal size={17} color="#104E3E" style={{ marginRight: 8 }} />
                <AppText variant="heading3" style={styles.cardHeaderTitle}>
                  Tournament Summary & Stats
                </AppText>
              </View>

              <View style={styles.statsSummaryGrid}>
                <View style={styles.statSummaryBox}>
                  <AppText variant="caption" color="tertiary">Total Matches</AppText>
                  <AppText variant="heading2" style={styles.statSummaryValue}>
                    {allMatchesList.length}
                  </AppText>
                  <AppText variant="caption" color="tertiary">
                    {poolMatches.length} Pool + {championshipMatches.length} Bracket
                  </AppText>
                </View>

                <View style={styles.statSummaryBox}>
                  <AppText variant="caption" color="tertiary">Total Entrants</AppText>
                  <AppText variant="heading2" style={styles.statSummaryValue}>
                    {(poolAStandings.length + poolBStandings.length) || 0}
                  </AppText>
                  <AppText variant="caption" color="tertiary">Teams Competing</AppText>
                </View>

                <View style={styles.statSummaryBox}>
                  <AppText variant="caption" color="tertiary">Pool A Winner</AppText>
                  <AppText variant="bodySmall" bold style={[styles.statSummaryValueText, { color: '#15803D' }]}>
                    {poolAStandings[0]?.team_name || 'TBD'}
                  </AppText>
                  <AppText variant="caption" color="tertiary">
                    {poolAStandings[0] ? `${poolAStandings[0].wins}-${poolAStandings[0].losses}` : '-'}
                  </AppText>
                </View>

                <View style={styles.statSummaryBox}>
                  <AppText variant="caption" color="tertiary">Pool B Winner</AppText>
                  <AppText variant="bodySmall" bold style={[styles.statSummaryValueText, { color: '#2563EB' }]}>
                    {poolBStandings[0]?.team_name || 'TBD'}
                  </AppText>
                  <AppText variant="caption" color="tertiary">
                    {poolBStandings[0] ? `${poolBStandings[0].wins}-${poolBStandings[0].losses}` : '-'}
                  </AppText>
                </View>
              </View>
            </Card>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  /* ─── 1. Fixed Top Header ─── */
  fixedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 10,
    ...Shadows.sm,
  },
  fixedHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 44,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtnText: {
    fontSize: 16,
    color: '#0F172A',
    marginLeft: 8,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerIconBtn: {
    padding: 4,
  },

  /* ─── 2. Scroll Area ─── */
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 60,
  },

  /* ─── Hero Section (Standardized matching Round Robin reference) ─── */
  heroSection: {
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
    backgroundColor: 'rgba(6, 78, 59, 0.78)', // dark translucent green matching reference
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
  formatPill: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  formatPillText: {
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
  heroSubtitle: {
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

  /* ─── 4. Tabs Container ─── */
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
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabPillActive: {
    backgroundColor: '#0D5C3A',
    borderColor: '#0D5C3A',
  },
  tabPillText: {
    fontSize: 12,
    color: '#475569',
  },
  tabPillTextActive: {
    color: '#FFFFFF',
  },

  /* ─── Common Tab Content Block ─── */
  tabContentBlock: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },

  /* ─── Card 1: Tournament Completed Card ─── */
  tournamentCompletedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    padding: 16,
    ...Shadows.sm,
  },
  tcHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  tcTrophyIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  tcHeading: {
    fontSize: 18,
    color: '#0F172A',
    textAlign: 'center',
  },
  tcSubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 2,
  },
  tcResultsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  tcPodiumCol: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  tcVerticalDivider: {
    width: 1,
    height: 70,
    backgroundColor: '#E2E8F0',
  },
  tcLabelRunnerUp: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 6,
  },
  tcLabelChampion: {
    fontSize: 12,
    color: '#D97706',
    marginBottom: 6,
  },
  silverMedalCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  goldMedalCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  tcTeamName: {
    fontSize: 14,
    color: '#0F172A',
    textAlign: 'center',
  },
  tcPlayerNames: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 2,
  },

  /* ─── Generic Info Cards ─── */
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    ...Shadows.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardHeaderTitle: {
    fontSize: 16,
    color: '#0F172A',
  },
  cardBodyText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#475569',
  },

  /* ─── Competition Specs Grid ─── */
  specsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 14,
  },
  specBox: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  specIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  specTextCol: {
    flex: 1,
  },
  specLabel: {
    fontSize: 11,
  },
  specValue: {
    fontSize: 13,
    color: '#0F172A',
    marginTop: 1,
  },

  /* ─── Schedule & Venue Items ─── */
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  scheduleItemIcon: {
    marginTop: 2,
    marginRight: 10,
  },
  scheduleTextWrap: {
    flex: 1,
  },
  scheduleLabel: {
    fontSize: 13,
    color: '#0F172A',
  },
  scheduleValue: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  scheduleLocationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  viewOnMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#104E3E',
  },
  viewOnMapText: {
    fontSize: 11,
    color: '#104E3E',
  },

  /* ─── Game Rules ─── */
  rulesList: {
    gap: 12,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  ruleIcon: {
    marginTop: 3,
    marginRight: 10,
  },
  ruleTextCol: {
    flex: 1,
  },
  ruleLabel: {
    fontSize: 11,
  },
  ruleValue: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 19,
    marginTop: 1,
  },

  /* ─── Pool Table Cards (Screenshot 2) ─── */
  poolTableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    ...Shadows.sm,
  },
  poolCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  poolCardTitle: {
    fontSize: 17,
    color: '#0F172A',
  },
  poolCompletedBadge: {
    backgroundColor: '#E0F2FE',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  poolCompletedText: {
    color: '#0284C7',
    fontSize: 11,
  },

  /* Table styling */
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  thRank: {
    width: 32,
    alignItems: 'center',
  },
  thTeam: {
    flex: 1,
    paddingLeft: 6,
  },
  thStat: {
    width: 34,
    textAlign: 'center',
    color: '#475569',
  },
  thPd: {
    width: 44,
    textAlign: 'right',
    paddingRight: 4,
    color: '#475569',
  },
  tableDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableDataRowQualified: {
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
  },
  rankCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankCircleGold: {
    backgroundColor: '#FEF3C7',
  },
  rankCircleSilver: {
    backgroundColor: '#F1F5F9',
  },
  rankCircleText: {
    fontSize: 11,
    color: '#64748B',
  },
  rankCircleTextGold: {
    color: '#D97706',
  },
  rankCircleTextSilver: {
    color: '#64748B',
  },
  teamNameText: {
    fontSize: 13,
    color: '#0F172A',
  },
  teamNameTextQualified: {
    color: '#0F172A',
  },
  pdPositive: {
    color: '#16A34A',
  },

  /* ─── Championship Bracket Card (Screenshot 2) ─── */
  bracketSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    ...Shadows.sm,
  },
  bracketCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  bracketCardTitle: {
    fontSize: 17,
    color: '#0F172A',
  },
  finalResultsBadge: {
    backgroundColor: '#E0F2FE',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  finalResultsText: {
    color: '#0284C7',
    fontSize: 11,
  },
  bracketTreeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bracketColSemis: {
    flex: 1.1,
  },
  bracketColHeader: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 8,
  },
  bracketMatchBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 8,
  },
  bracketTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  avatarMini: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  bracketTeamName: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
  },
  bracketScoreBold: {
    fontSize: 12,
    color: '#15803D',
  },
  bracketScoreMuted: {
    fontSize: 12,
    color: '#64748B',
  },
  bracketMatchDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 4,
  },

  /* Connector Tree lines */
  bracketConnectorWrap: {
    width: 24,
    height: 120,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bracketTreeForkTop: {
    position: 'absolute',
    top: 25,
    left: 0,
    width: 12,
    height: 35,
    borderTopWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: '#94A3B8',
  },
  bracketTreeForkStem: {
    position: 'absolute',
    left: 12,
    width: 12,
    height: 1.5,
    backgroundColor: '#94A3B8',
  },
  bracketTreeForkBottom: {
    position: 'absolute',
    bottom: 25,
    left: 0,
    width: 12,
    height: 35,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: '#94A3B8',
  },

  bracketColFinal: {
    flex: 1.1,
  },
  bracketFinalBox: {
    backgroundColor: '#FEFCE8',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    padding: 8,
    position: 'relative',
  },
  crownBadgeWrap: {
    position: 'absolute',
    top: -8,
    right: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: Radius.full,
    padding: 3,
  },

  /* ─── Match Results Section (Screenshot 2) ─── */
  matchResultsSection: {
    marginTop: 6,
    gap: 12,
  },
  matchResultsTitle: {
    fontSize: 18,
    color: '#0F172A',
  },
  matchFilterChipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
  },
  matchFilterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: '#F1F5F9',
  },
  matchFilterChipActive: {
    backgroundColor: '#0D5C3A',
  },
  matchFilterChipText: {
    fontSize: 12,
    color: '#475569',
  },
  matchFilterChipTextActive: {
    color: '#FFFFFF',
  },
  matchesList: {
    gap: 10,
  },
  matchResultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    ...Shadows.sm,
  },
  matchStageCol: {
    width: 58,
    borderRightWidth: 1,
    borderRightColor: '#F1F5F9',
    paddingRight: 8,
  },
  matchStageText: {
    fontSize: 12,
    color: '#0F172A',
  },
  matchCourtText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  matchupCol: {
    flex: 1,
    paddingHorizontal: 10,
  },
  matchRowTeam: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarMicro: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  matchRowTeamName: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
  },
  matchRowScore: {
    fontSize: 12,
    color: '#0F172A',
    marginLeft: 6,
  },
  matchRowScoreMuted: {
    fontSize: 12,
    color: '#64748B',
    marginLeft: 6,
  },
  viewMatchBtn: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  viewMatchBtnText: {
    color: '#15803D',
    fontSize: 11,
  },

  /* ─── Bottom CTA Button ─── */
  viewFullResultsCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#104E3E',
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 4,
  },
  viewFullResultsCtaText: {
    color: '#104E3E',
    fontSize: 14,
  },

  /* ─── Placements List ─── */
  placementsList: {
    gap: 8,
  },
  placementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  placementRowGold: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  placementRowSilver: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  placementBadgeCol: {
    marginRight: 10,
  },
  placementBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placementBadgeGold: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  placementBadgeSilver: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  placementBadgeBronze: {
    backgroundColor: '#FFEDD5',
    borderWidth: 1,
    borderColor: '#FDBA74',
  },
  placementBadgeText: {
    fontSize: 11,
    color: '#475569',
  },
  placementBadgeTextGold: {
    color: '#D97706',
  },
  placementBadgeTextSilver: {
    color: '#475569',
  },
  placementBadgeTextBronze: {
    color: '#C2410C',
  },
  placementInfoCol: {
    flex: 1,
  },
  placementTeamName: {
    fontSize: 13,
    color: '#0F172A',
  },
  placementPlayerNames: {
    fontSize: 11,
    marginTop: 1,
  },
  placementStageCol: {
    alignItems: 'flex-end',
    paddingLeft: 8,
  },
  placementStageText: {
    fontSize: 11,
    color: '#104E3E',
  },
  placementRecordText: {
    fontSize: 10,
    marginTop: 1,
  },

  /* ─── Stats Summary Grid ─── */
  statsSummaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statSummaryBox: {
    width: '48%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    alignItems: 'center',
  },
  statSummaryValue: {
    fontSize: 20,
    color: '#0F172A',
    marginVertical: 2,
  },
  statSummaryValueText: {
    fontSize: 14,
    marginVertical: 4,
  },
});
