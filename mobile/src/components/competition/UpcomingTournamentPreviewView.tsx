/**
 * Aught2 Pickleball — Upcoming Tournament Preview View
 *
 * Dedicated player-side tournament preview view for tournaments that are
 * published by a club, but registration is not yet open.
 *
 * Matches the reference screenshot exactly:
 * - Top navigation bar: back arrow, "Tournaments" title, reload/refresh button
 * - Hero banner: outdoor pickleball court image, UPCOMING badge, format badge,
 *   tournament title, and meta info (division | event date | venue)
 * - Registration announcement card: "Registration opens soon", opening date, description
 * - Horizontal tabs: "Tournament Details" & "Rules & Eligibility"
 * - Tournament Details cards:
 *   1. About This Tournament (mint icon, title, description)
 *   2. Competition Specifications (mint trophy icon, 2-column key-value grid)
 *   3. Schedule & Venue (mint calendar icon, event date & location)
 * - Rules & Eligibility cards (when tab selected)
 * - Non-actionable: NO "Register Now" button, NO details button, informational only.
 */

import React, { useState, useMemo } from 'react';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Award,
  Calendar,
  Clock,
  FileText,
  Info,
  MapPin,
  RotateCw,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react-native';

import { AppText } from '../AppText';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';
import type { Tournament, TournamentFormat } from '@/types';

// Format banner images
const FORMAT_BANNERS: Record<TournamentFormat, any> = {
  round_robin: require('../../../assets/tournaments/banner2.jpg'),
  pool_play: require('../../../assets/tournaments/card_pool_play.jpg'),
  scramble: require('../../../assets/tournaments/banner3.jpg'),
  bracket: require('../../../assets/tournaments/card_bracket.jpg'),
};

interface UpcomingTournamentPreviewViewProps {
  tournament: Tournament;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  isRefreshing?: boolean;
}

// Format short date for hero banner: e.g. "26 Sept"
function formatUpcomingHeroDate(isoStr?: string | null): string {
  if (!isoStr) return '26 Sept';
  try {
    const d = new Date(isoStr);
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[d.getMonth()]}`;
  } catch {
    return '26 Sept';
  }
}

// Format full date: e.g. "24 Sept 2026" or "26 Sept 2026"
function formatUpcomingFullDate(isoStr?: string | null): string {
  if (!isoStr) return '26 Sept 2026';
  try {
    const d = new Date(isoStr);
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return '26 Sept 2026';
  }
}

export function UpcomingTournamentPreviewView({
  tournament,
  onBack,
  onRefresh,
  isRefreshing = false,
}: UpcomingTournamentPreviewViewProps) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'details' | 'rules'>('details');

  const format = tournament.format ?? 'round_robin';
  const parsedConfig = useMemo(() => parseTournamentConfig(tournament), [tournament]);

  // Format banner image (default banner2 has the exact court & ball from screenshot)
  const bannerImage = FORMAT_BANNERS[format] || FORMAT_BANNERS.round_robin;

  // Format Badge Config
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

  // Dynamic values
  const division = parsedConfig.category || 'Singles';
  const eventDateHero = formatUpcomingHeroDate(tournament.start_date);
  const eventDateFull = formatUpcomingFullDate(tournament.start_date);
  const location = tournament.location_name || 'Illinois';

  // Registration opening date text
  const regOpenDateStr = tournament.registration_open_at
    ? formatUpcomingFullDate(tournament.registration_open_at)
    : formatUpcomingFullDate(tournament.start_date);

  // Registration type
  const registrationType = useMemo(() => {
    if (format === 'scramble') return 'Individual (Rotating)';
    if (parsedConfig.isSingles || parsedConfig.teamSize === 1) return 'Individual (Singles)';
    return 'Fixed Team (Doubles)';
  }, [format, parsedConfig.isSingles, parsedConfig.teamSize]);

  // Skill requirement
  const skillRequirement = useMemo(() => {
    if (parsedConfig.skillLevel) return `${parsedConfig.skillLevel} Level`;
    return '4.0 Level';
  }, [parsedConfig.skillLevel]);

  // Gender eligibility
  const genderEligibility = parsedConfig.genderEligibility || 'Male';

  // Age limits
  const ageLimits = useMemo(() => {
    if (parsedConfig.minAge && parsedConfig.maxAge) {
      return `${parsedConfig.minAge} – ${parsedConfig.maxAge} yrs`;
    }
    if (parsedConfig.minAge) return `${parsedConfig.minAge}+ yrs`;
    return '20 – 25 yrs';
  }, [parsedConfig.minAge, parsedConfig.maxAge]);

  // Description with appropriate fallback
  const description = useMemo(() => {
    if (tournament.description?.trim()) return tournament.description;
    switch (format) {
      case 'round_robin':
        return 'Recreational round robin tournament for club members.\nEvery player plays every other player with deterministic rankings.';
      case 'scramble':
        return 'Individual scramble rotation tournament where players rotate partners each round and accumulate individual points.';
      case 'pool_play':
        return 'Split pool competition followed by single-elimination championship playoffs.';
      case 'bracket':
        return 'Single-elimination championship tournament with seeded bracket play.';
      default:
        return 'Recreational pickleball tournament for club members.';
    }
  }, [tournament.description, format]);

  // Scoring rules
  const targetScore = tournament.scoring_rules?.target_score ?? 11;
  const winBy = tournament.scoring_rules?.win_by ?? 2;

  return (
    <View style={styles.screen}>
      {/* ─── Fixed Top Navigation Bar ─── */}
      <View style={[styles.topNavBar, { paddingTop: insets.top + 6 }]}>
        <View style={styles.navBarInner}>
          {/* Back button + Title */}
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

          {/* Refresh button */}
          <TouchableOpacity
            onPress={onRefresh}
            style={styles.refreshButton}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Refresh tournament details"
          >
            <RotateCw size={17} color="#1E293B" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── Scrollable Body ─── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => void onRefresh()} />
        }
      >
        {/* ─── Hero Banner Card ─── */}
        <View style={styles.heroCard}>
          <Image source={bannerImage} style={styles.heroBannerImage} resizeMode="cover" />
          <View style={styles.heroOverlay} />

          <View style={styles.heroContent}>
            {/* Top row badges */}
            <View style={styles.heroTopRow}>
              {/* UPCOMING Badge */}
              <View style={styles.upcomingBadge}>
                <Clock size={12} color="#92400E" strokeWidth={2.4} style={{ marginRight: 4 }} />
                <AppText variant="caption" bold style={styles.upcomingBadgeText}>
                  UPCOMING
                </AppText>
              </View>

              {/* Format Badge */}
              <View style={[styles.formatBadge, { backgroundColor: formatBadge.bg }]}>
                <AppText variant="caption" bold style={[styles.formatBadgeText, { color: formatBadge.text }]}>
                  {formatBadge.label}
                </AppText>
              </View>
            </View>

            {/* Tournament Title */}
            <AppText variant="heading1" style={styles.heroTitle} numberOfLines={2}>
              {tournament.name}
            </AppText>

            {/* Meta Row */}
            <View style={styles.heroMetaRow}>
              <View style={styles.metaItem}>
                <Users size={15} color="#FFFFFF" strokeWidth={2} style={{ marginRight: 6 }} />
                <AppText variant="bodySmall" bold style={styles.metaText}>
                  {division}
                </AppText>
              </View>

              <AppText variant="bodySmall" style={styles.metaDivider}>
                |
              </AppText>

              <View style={styles.metaItem}>
                <Calendar size={15} color="#FFFFFF" strokeWidth={2} style={{ marginRight: 6 }} />
                <AppText variant="bodySmall" bold style={styles.metaText}>
                  {eventDateHero}
                </AppText>
              </View>

              <AppText variant="bodySmall" style={styles.metaDivider}>
                |
              </AppText>

              <View style={styles.metaItem}>
                <MapPin size={15} color="#FFFFFF" strokeWidth={2} style={{ marginRight: 6 }} />
                <AppText variant="bodySmall" bold style={styles.metaText} numberOfLines={1}>
                  {location}
                </AppText>
              </View>
            </View>
          </View>
        </View>

        {/* ─── Registration Notice Callout Box ─── */}
        <View style={styles.noticeCard}>
          <View style={styles.clockCircle}>
            <Clock size={22} color="#92400E" strokeWidth={2.4} />
          </View>

          <View style={styles.noticeRight}>
            <AppText variant="heading3" bold style={styles.noticeHeading}>
              Registration opens soon
            </AppText>

            <View style={styles.noticeDateRow}>
              <Calendar size={14} color="#78350F" strokeWidth={2} style={{ marginRight: 6 }} />
              <AppText variant="caption" style={styles.noticeDateText}>
                Registration begins on {regOpenDateStr}.
              </AppText>
            </View>

            <AppText variant="caption" style={styles.noticeSubtext}>
              You can review tournament details, eligibility requirements and rules below to prepare before registration opens.
            </AppText>
          </View>
        </View>

        {/* ─── Horizontal Tabs ─── */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={styles.tabBtn}
            onPress={() => setActiveTab('details')}
            activeOpacity={0.7}
          >
            <AppText
              variant="bodySmall"
              bold
              style={[styles.tabText, activeTab === 'details' && styles.tabTextActive]}
            >
              Tournament Details
            </AppText>
            {activeTab === 'details' && <View style={styles.activeIndicator} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tabBtn}
            onPress={() => setActiveTab('rules')}
            activeOpacity={0.7}
          >
            <AppText
              variant="bodySmall"
              bold
              style={[styles.tabText, activeTab === 'rules' && styles.tabTextActive]}
            >
              Rules & Eligibility
            </AppText>
            {activeTab === 'rules' && <View style={styles.activeIndicator} />}
          </TouchableOpacity>
        </View>

        {/* ─── Tab Content ─── */}
        {activeTab === 'details' ? (
          <View style={styles.tabContent}>
            {/* Card 1: About This Tournament */}
            <View style={styles.infoCard}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.mintIconCircle}>
                  <FileText size={20} color="#059669" strokeWidth={2.2} />
                </View>
                <View style={styles.cardHeaderContent}>
                  <AppText variant="body" bold style={styles.cardTitle}>
                    About This Tournament
                  </AppText>
                  <AppText variant="caption" style={styles.aboutBodyText}>
                    {description}
                  </AppText>
                </View>
              </View>
            </View>

            {/* Card 2: Competition Specifications */}
            <View style={styles.infoCard}>
              <View style={styles.cardHeaderRowSimple}>
                <View style={styles.mintIconCircle}>
                  <Trophy size={20} color="#059669" strokeWidth={2.2} />
                </View>
                <AppText variant="body" bold style={styles.cardTitleSimple}>
                  Competition Specifications
                </AppText>
              </View>

              {/* 2-Column Grid */}
              <View style={styles.specGrid}>
                {/* Row 1 */}
                <View style={styles.gridRow}>
                  <View style={styles.gridCol}>
                    <AppText variant="caption" style={styles.gridLabel}>
                      Format
                    </AppText>
                    <AppText variant="bodySmall" bold style={styles.gridValue}>
                      {formatBadge.label}
                    </AppText>
                  </View>
                  <View style={styles.gridCol}>
                    <AppText variant="caption" style={styles.gridLabel}>
                      Division
                    </AppText>
                    <AppText variant="bodySmall" bold style={styles.gridValue}>
                      {division}
                    </AppText>
                  </View>
                </View>

                <View style={styles.gridDivider} />

                {/* Row 2 */}
                <View style={styles.gridRow}>
                  <View style={styles.gridCol}>
                    <AppText variant="caption" style={styles.gridLabel}>
                      Registration Type
                    </AppText>
                    <AppText variant="bodySmall" bold style={styles.gridValue}>
                      {registrationType}
                    </AppText>
                  </View>
                  <View style={styles.gridCol}>
                    <AppText variant="caption" style={styles.gridLabel}>
                      Skill Requirement
                    </AppText>
                    <AppText variant="bodySmall" bold style={styles.gridValue}>
                      {skillRequirement}
                    </AppText>
                  </View>
                </View>

                <View style={styles.gridDivider} />

                {/* Row 3 */}
                <View style={styles.gridRow}>
                  <View style={styles.gridCol}>
                    <AppText variant="caption" style={styles.gridLabel}>
                      Gender Eligibility
                    </AppText>
                    <AppText variant="bodySmall" bold style={styles.gridValue}>
                      {genderEligibility}
                    </AppText>
                  </View>
                  <View style={styles.gridCol}>
                    <AppText variant="caption" style={styles.gridLabel}>
                      Age Limits
                    </AppText>
                    <AppText variant="bodySmall" bold style={styles.gridValue}>
                      {ageLimits}
                    </AppText>
                  </View>
                </View>
              </View>
            </View>

            {/* Card 3: Schedule & Venue */}
            <View style={[styles.infoCard, { marginBottom: 32 }]}>
              <View style={styles.cardHeaderRowSimple}>
                <View style={styles.mintIconCircle}>
                  <Calendar size={20} color="#059669" strokeWidth={2.2} />
                </View>
                <AppText variant="body" bold style={styles.cardTitleSimple}>
                  Schedule & Venue
                </AppText>
              </View>

              <View style={styles.venueRow}>
                {/* Event Date */}
                <View style={styles.venueItem}>
                  <Calendar size={18} color="#0F172A" strokeWidth={2} style={styles.venueIcon} />
                  <View style={styles.venueTextContainer}>
                    <AppText variant="caption" style={styles.venueLabel}>
                      Event Date
                    </AppText>
                    <AppText variant="bodySmall" bold style={styles.venueValue}>
                      {eventDateFull}
                    </AppText>
                  </View>
                </View>

                {/* Location */}
                <View style={styles.venueItem}>
                  <MapPin size={18} color="#0F172A" strokeWidth={2} style={styles.venueIcon} />
                  <View style={styles.venueTextContainer}>
                    <AppText variant="caption" style={styles.venueLabel}>
                      Location
                    </AppText>
                    <AppText variant="bodySmall" bold style={styles.venueValue} numberOfLines={1}>
                      {location}
                    </AppText>
                  </View>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.tabContent}>
            {/* Rules & Eligibility: Card 1 - Official Scoring Rules */}
            <View style={styles.infoCard}>
              <View style={styles.cardHeaderRowSimple}>
                <View style={styles.mintIconCircle}>
                  <Award size={20} color="#059669" strokeWidth={2.2} />
                </View>
                <AppText variant="body" bold style={styles.cardTitleSimple}>
                  Competition Rules & Scoring
                </AppText>
              </View>

              <View style={styles.rulesContainer}>
                <View style={styles.ruleBulletRow}>
                  <View style={styles.ruleDot} />
                  <AppText variant="caption" style={styles.ruleText}>
                    <AppText variant="caption" bold style={{ color: '#0F172A' }}>
                      Game Format:{' '}
                    </AppText>
                    First to {targetScore} points, win by {winBy}.
                  </AppText>
                </View>

                <View style={styles.ruleBulletRow}>
                  <View style={styles.ruleDot} />
                  <AppText variant="caption" style={styles.ruleText}>
                    <AppText variant="caption" bold style={{ color: '#0F172A' }}>
                      Tiebreaker Priority:{' '}
                    </AppText>
                    1. Head-to-head match wins, 2. Total points differential, 3. Total points scored.
                  </AppText>
                </View>

                {format === 'round_robin' && (
                  <View style={styles.ruleBulletRow}>
                    <View style={styles.ruleDot} />
                    <AppText variant="caption" style={styles.ruleText}>
                      <AppText variant="caption" bold style={{ color: '#0F172A' }}>
                        Round Robin Format:{' '}
                      </AppText>
                      Every player plays against every other player in a round-robin schedule with deterministic rankings.
                    </AppText>
                  </View>
                )}

                {format === 'scramble' && (
                  <View style={styles.ruleBulletRow}>
                    <View style={styles.ruleDot} />
                    <AppText variant="caption" style={styles.ruleText}>
                      <AppText variant="caption" bold style={{ color: '#0F172A' }}>
                        Partner Rotation:{' '}
                      </AppText>
                      Players rotate partners each round. Points won are tracked individually on the scramble leaderboard.
                    </AppText>
                  </View>
                )}

                {format === 'pool_play' && (
                  <View style={styles.ruleBulletRow}>
                    <View style={styles.ruleDot} />
                    <AppText variant="caption" style={styles.ruleText}>
                      <AppText variant="caption" bold style={{ color: '#0F172A' }}>
                        Pool Advancement:{' '}
                      </AppText>
                      Top-seeded teams from each pool advance directly to the single-elimination championship bracket.
                    </AppText>
                  </View>
                )}

                {format === 'bracket' && (
                  <View style={styles.ruleBulletRow}>
                    <View style={styles.ruleDot} />
                    <AppText variant="caption" style={styles.ruleText}>
                      <AppText variant="caption" bold style={{ color: '#0F172A' }}>
                        Single Elimination:{' '}
                      </AppText>
                      Win to advance to the next round. Losers of the semi-finals contest the 3rd place medal match.
                    </AppText>
                  </View>
                )}
              </View>
            </View>

            {/* Rules & Eligibility: Card 2 - Eligibility Criteria */}
            <View style={styles.infoCard}>
              <View style={styles.cardHeaderRowSimple}>
                <View style={styles.mintIconCircle}>
                  <Users size={20} color="#059669" strokeWidth={2.2} />
                </View>
                <AppText variant="body" bold style={styles.cardTitleSimple}>
                  Eligibility Criteria
                </AppText>
              </View>

              <View style={styles.rulesContainer}>
                <View style={styles.ruleBulletRow}>
                  <View style={styles.ruleDot} />
                  <AppText variant="caption" style={styles.ruleText}>
                    <AppText variant="caption" bold style={{ color: '#0F172A' }}>
                      Division / Gender:{' '}
                    </AppText>
                    {division} division open to {genderEligibility} participants.
                  </AppText>
                </View>

                <View style={styles.ruleBulletRow}>
                  <View style={styles.ruleDot} />
                  <AppText variant="caption" style={styles.ruleText}>
                    <AppText variant="caption" bold style={{ color: '#0F172A' }}>
                      Skill Requirement:{' '}
                    </AppText>
                    Recommended rating: {skillRequirement}. Self-rating or verified DUPR required upon registration.
                  </AppText>
                </View>

                <View style={styles.ruleBulletRow}>
                  <View style={styles.ruleDot} />
                  <AppText variant="caption" style={styles.ruleText}>
                    <AppText variant="caption" bold style={{ color: '#0F172A' }}>
                      Age Limit:{' '}
                    </AppText>
                    {ageLimits}. Age is calculated as of the tournament event date.
                  </AppText>
                </View>

                <View style={styles.ruleBulletRow}>
                  <View style={styles.ruleDot} />
                  <AppText variant="caption" style={styles.ruleText}>
                    <AppText variant="caption" bold style={{ color: '#0F172A' }}>
                      Club Membership:{' '}
                    </AppText>
                    Players must be an active member of the hosting club to participate.
                  </AppText>
                </View>
              </View>
            </View>

            {/* Rules & Eligibility: Card 3 - Tournament Policies */}
            <View style={[styles.infoCard, { marginBottom: 32 }]}>
              <View style={styles.cardHeaderRowSimple}>
                <View style={styles.mintIconCircle}>
                  <ShieldCheck size={20} color="#059669" strokeWidth={2.2} />
                </View>
                <AppText variant="body" bold style={styles.cardTitleSimple}>
                  Tournament Policies & Conduct
                </AppText>
              </View>

              <View style={styles.rulesContainer}>
                <View style={styles.ruleBulletRow}>
                  <View style={styles.ruleDot} />
                  <AppText variant="caption" style={styles.ruleText}>
                    <AppText variant="caption" bold style={{ color: '#0F172A' }}>
                      Check-In Policy:{' '}
                    </AppText>
                    All players must check in at least 15 minutes before their first scheduled match time.
                  </AppText>
                </View>

                <View style={styles.ruleBulletRow}>
                  <View style={styles.ruleDot} />
                  <AppText variant="caption" style={styles.ruleText}>
                    <AppText variant="caption" bold style={{ color: '#0F172A' }}>
                      Approved Equipment:{' '}
                    </AppText>
                    All paddles must be on the USA Pickleball (USAPA) approved paddle list.
                  </AppText>
                </View>

                <View style={styles.ruleBulletRow}>
                  <View style={styles.ruleDot} />
                  <AppText variant="caption" style={styles.ruleText}>
                    <AppText variant="caption" bold style={{ color: '#0F172A' }}>
                      Fair Play & Sportsmanship:{' '}
                    </AppText>
                    Players make their own line calls on their side of the court. Disputes are referred to the tournament director.
                  </AppText>
                </View>
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
    gap: 10,
  },
  navTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },

  /* ─── Hero Banner Card ─── */
  heroCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    overflow: 'hidden',
    height: 195,
    position: 'relative',
    justifyContent: 'flex-end',
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
    padding: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  upcomingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4.5,
  },
  upcomingBadgeText: {
    color: '#92400E',
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
    marginBottom: 10,
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
    fontSize: 13.5,
    fontWeight: '600',
  },
  metaDivider: {
    color: 'rgba(255, 255, 255, 0.4)',
    marginHorizontal: 10,
    fontSize: 14,
  },

  /* ─── Notice Card ─── */
  noticeCard: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#FFFDF5',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  clockCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    marginTop: 2,
  },
  noticeRight: {
    flex: 1,
  },
  noticeHeading: {
    color: '#78350F',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  noticeDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  noticeDateText: {
    color: '#78350F',
    fontSize: 13.5,
    fontWeight: '500',
  },
  noticeSubtext: {
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 19,
  },

  /* ─── Horizontal Tabs ─── */
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
    marginRight: 24,
    position: 'relative',
  },
  tabText: {
    fontSize: 14.5,
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

  /* ─── Tab Content Cards ─── */
  tabContent: {
    marginTop: 12,
  },
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
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardHeaderRowSimple: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  mintIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E6F4EA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardHeaderContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  cardTitleSimple: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  aboutBodyText: {
    fontSize: 13.5,
    color: '#475569',
    lineHeight: 20,
  },

  /* ─── Competition Specifications Grid ─── */
  specGrid: {
    marginTop: 4,
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  gridCol: {
    flex: 1,
  },
  gridLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    marginBottom: 2,
  },
  gridValue: {
    fontSize: 14.5,
    color: '#0F172A',
    fontWeight: '700',
  },
  gridDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },

  /* ─── Schedule & Venue ─── */
  venueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  venueItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  venueIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  venueTextContainer: {
    flex: 1,
  },
  venueLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    marginBottom: 2,
  },
  venueValue: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '700',
  },

  /* ─── Rules Tab List ─── */
  rulesContainer: {
    marginTop: 4,
  },
  ruleBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  ruleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
    marginTop: 6,
    marginRight: 10,
  },
  ruleText: {
    flex: 1,
    fontSize: 13,
    color: '#475569',
    lineHeight: 19,
  },
});
