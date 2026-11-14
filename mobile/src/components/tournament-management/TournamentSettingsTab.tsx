/**
 * Aught2 Pickleball — TournamentSettingsTab
 *
 * Dedicated, authoritative home for complete tournament configuration across ALL formats:
 * 1. Tournament Details (Name, Description, Format, Category, Skill Level, Gender, Age Group)
 * 2. Registration & Pricing (Entry Fee, Registration Deadline, Capacity & Enrollment, Status)
 * 3. Schedule & Courts (Tournament Dates, Scheduling Engine, Assigned Courts, Stage Configuration)
 * 4. Rules & Scoring (Scoring Chips, Match Rules, Format Rules, Numbered Tiebreaker Hierarchy)
 * 5. Tournament Hero Banner (Responsive Preview, Non-truncated Status Badge, Upload, Reset)
 *
 * Responsive layout:
 * - Mobile (< 768px): Clean stacked field architecture (Label on top, Value below, full width, zero text collisions)
 * - Tablet & Desktop (>= 768px): Polished two-column layout with generous column widths
 */

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  Award,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Info,
  Layers,
  RotateCcw,
  SlidersHorizontal,
  Target,
  Trophy,
  Users,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { useClubBranding } from '@/hooks/useClubBranding';
import { usePlatformBanners } from '@/hooks/usePlatformBanners';
import { getFormatDisplayLabel, normalizeTournamentFormat } from '@/navigation';
import { clubAssetsApi } from '@/services/api/clubAssets';
import { queryClient } from '@/services/queryClient';
import { QUERY_KEYS } from '@/constants';
import { Colors, Radius, Spacing } from '@/theme';
import type { ClubBranding, Tournament } from '@/types';
import { resolveTournamentBanner, resolveTournamentBannerDetails } from '@/utils/imageResolution';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';

interface TournamentSettingsTabProps {
  tournament: Tournament | null;
  clubBranding?: ClubBranding | null;
  onRefresh?: () => void | Promise<void>;
  canManage?: boolean;
  courtCount?: number;
  plannedRounds?: number;
  poolCount?: number;
}

function formatTournamentDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

function formatTournamentDateRange(startStr?: string | null, endStr?: string | null): string {
  if (!startStr) return 'Not configured';
  const startFmt = formatTournamentDate(startStr);
  if (!endStr || startStr === endStr) return startFmt;
  const endFmt = formatTournamentDate(endStr);
  return `${startFmt} – ${endFmt}`;
}

function formatTournamentDeadline(dateStr?: string | null): string {
  if (!dateStr) return 'Not specified';
  try {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
    const dateFormatted = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    const minuteStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
    if (hours === 0 && minutes === 0) {
      return dateFormatted;
    }
    return `${dateFormatted}, ${hour12}:${minuteStr} ${ampm}`;
  } catch {
    return dateStr;
  }
}

function humanizeGameFormat(formatStr?: string | null): string {
  if (!formatStr) return 'Single Game';
  const lower = formatStr.toLowerCase();
  if (lower.includes('single') || lower === 'single_game') return 'Single Game';
  if (lower.includes('best_of_3') || lower.includes('best 2 of 3')) return 'Best 2 of 3 Games';
  if (lower.includes('best_of_5') || lower.includes('best 3 of 5')) return 'Best 3 of 5 Games';
  return formatStr.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function TournamentSettingsTab({
  tournament,
  clubBranding: passedClubBranding,
  onRefresh,
  canManage = true,
  courtCount,
  plannedRounds,
  poolCount,
}: TournamentSettingsTabProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const clubId = tournament?.club_id;
  const { branding: fetchedClubBranding } = useClubBranding(clubId);
  const { banners: platformBanners } = usePlatformBanners();
  const clubBranding = passedClubBranding ?? fetchedClubBranding;

  const [isUploading, setIsUploading] = useState(false);

  const format = normalizeTournamentFormat(tournament?.format);
  const parsed = parseTournamentConfig(tournament);
  const scoringRules = (tournament?.scoring_rules as unknown as Record<string, unknown>) || {};
  const targetScore = typeof scoringRules.target_score === 'number' ? scoringRules.target_score : 11;
  const winBy = typeof scoringRules.win_by === 'number' ? scoringRules.win_by : 2;
  const gameFormat = typeof scoringRules.game_format === 'string' ? scoringRules.game_format : 'single_game';

  const formatConfig = (tournament?.format_configuration as Record<string, unknown>) || {};

  const isCustom = Boolean(tournament?.banner_image_url);
  const bannerSource = resolveTournamentBanner(tournament, clubBranding, platformBanners);
  const bannerDetails = resolveTournamentBannerDetails(tournament, clubBranding, platformBanners);

  // ─── 1. Determine Format Display ──────────────────────────────────────────
  const formatDisplay = useMemo(() => {
    if (format === 'scramble') {
      return `Rotating Scramble • ${parsed.category || 'Open'}`;
    }
    if (format === 'bracket') {
      const bType = String(formatConfig.bracket_type || formatConfig.bracket_format || 'Single Elimination');
      const pStructure = parsed.isSingles ? 'Individual Singles' : 'Fixed Partner Doubles';
      return `${bType} • ${pStructure}`;
    }
    if (format === 'pool_play') {
      const pStructure = parsed.isSingles ? 'Singles' : 'Doubles';
      return `Pool Play • ${pStructure}`;
    }
    if (format === 'round_robin') {
      const pStructure = parsed.isSingles ? 'Individual Singles' : 'Fixed Partner Doubles';
      return `Round Robin • ${pStructure}`;
    }
    return `${tournament?.format_label || 'Tournament'} • ${parsed.category || 'Open'}`;
  }, [format, formatConfig, parsed]);

  // ─── 2. Age Group ─────────────────────────────────────────────────────────
  const ageDisplay = useMemo(() => {
    if (parsed.minAge && parsed.maxAge) {
      return `${parsed.minAge}–${parsed.maxAge} years`;
    }
    if (parsed.minAge && !parsed.maxAge) {
      return `${parsed.minAge}+ years`;
    }
    if (!parsed.minAge && parsed.maxAge) {
      return `Under ${parsed.maxAge} years`;
    }
    if (parsed.ageRestrictionText && parsed.ageRestrictionText !== 'None') {
      return parsed.ageRestrictionText.includes('year')
        ? parsed.ageRestrictionText
        : `${parsed.ageRestrictionText} years`;
    }
    return 'All ages welcome';
  }, [parsed]);

  // ─── 3. Dates & Deadline ──────────────────────────────────────────────────
  const datesDisplay = formatTournamentDateRange(tournament?.start_date, tournament?.end_date);
  const deadlineDisplay = formatTournamentDeadline(tournament?.registration_close_at);

  // ─── 4. Scheduling Engine ─────────────────────────────────────────────────
  const schedulingEngineInfo = useMemo(() => {
    if (format === 'round_robin') {
      return {
        title: 'Round-Robin Berger Tables',
        subtitle: 'All-play-all intra-division schedule generator with balanced round distribution',
      };
    }
    if (format === 'bracket') {
      const bType = String(formatConfig.bracket_type || formatConfig.bracket_format || 'Single Elimination');
      return {
        title: `${bType} Bracket Engine`,
        subtitle: 'Deterministic seed pairing with automatic first-round BYE propagation',
      };
    }
    if (format === 'scramble') {
      return {
        title: 'Dynamic Partner Rotation Matrix',
        subtitle: 'Fair round-by-round partner rotation with individual cumulative point scoring',
      };
    }
    if (format === 'pool_play') {
      return {
        title: 'Serpentine Pool Play & Knockout Bracket',
        subtitle: 'Balanced pool distribution followed by single-elimination championship bracket',
      };
    }
    return {
      title: 'Standard Tournament Scheduling Engine',
      subtitle: 'Configured automated tournament pairing and court allocation',
    };
  }, [format, formatConfig]);

  // ─── 5. Courts Assigned ───────────────────────────────────────────────────
  const courtsAssigned = courtCount ?? (
    typeof formatConfig.courts_count === 'number'
      ? formatConfig.courts_count
      : typeof formatConfig.num_courts === 'number'
      ? formatConfig.num_courts
      : (Array.isArray(formatConfig.courts) && formatConfig.courts.length > 0 ? formatConfig.courts.length : 4)
  );

  // ─── 6. Round / Stage Config ──────────────────────────────────────────────
  const roundStageConfig = useMemo(() => {
    if (format === 'round_robin') {
      const totalRounds = plannedRounds ?? Math.max(1, (parsed.capacity.entryCount || tournament?.max_participants || tournament?.participant_count || 8) - 1);
      return `${totalRounds} scheduled rounds`;
    }
    if (format === 'bracket') {
      const bSize = Math.pow(2, Math.ceil(Math.log2(Math.max(2, parsed.capacity.entryCount || tournament?.max_participants || tournament?.participant_count || 8))));
      const rounds = Math.ceil(Math.log2(bSize));
      return `${rounds} elimination rounds (${bSize}-entry bracket structure)`;
    }
    if (format === 'scramble') {
      const r = plannedRounds ?? Number(formatConfig.planned_rounds || 5);
      return `${r} planned rotation rounds`;
    }
    if (format === 'pool_play') {
      const pCount = poolCount ?? Number(formatConfig.pool_count || formatConfig.num_pools || 2);
      return `${pCount} preliminary pools • Championship knockout bracket`;
    }
    return '';
  }, [format, plannedRounds, parsed, tournament, formatConfig, poolCount]);

  // ─── 7. Capacity Numbers ──────────────────────────────────────────────────
  const registeredCount = tournament?.teams_count ?? tournament?.participant_count ?? 0;
  const maxCount = tournament?.max_participants ?? 8;
  const minCount = tournament?.min_participants ?? 4;
  const entryUnit = parsed.isSingles ? 'players' : 'teams';
  const isCapacityFull = registeredCount >= maxCount;
  const spotsAvailable = Math.max(0, maxCount - registeredCount);

  // ─── 8. Registration Status Badge ─────────────────────────────────────────
  const regStatus = tournament?.status?.toLowerCase();
  const regStatusLabel =
    regStatus === 'registration_open' || regStatus === 'open'
      ? 'Registration Open'
      : regStatus === 'registration_closed'
      ? 'Registration Closed'
      : regStatus === 'in_progress'
      ? 'In Progress'
      : regStatus === 'completed'
      ? 'Completed'
      : regStatus === 'cancelled'
      ? 'Cancelled'
      : 'Draft';

  const regStatusVariant: 'success' | 'warning' | 'info' | 'default' =
    regStatus === 'registration_open' || regStatus === 'open'
      ? 'success'
      : regStatus === 'in_progress'
      ? 'info'
      : regStatus === 'draft' || regStatus === 'cancelled'
      ? 'warning'
      : 'default';

  // ─── 9. Format-Specific Rules (Structured Bullet Points) ───────────────────
  const formatRulesList = useMemo(() => {
    switch (format) {
      case 'round_robin':
        return [
          {
            title: 'Round Robin Structure',
            text: 'Every player or team competes against every other opponent in their division exactly once.',
          },
          {
            title: 'Scoring & Play',
            text: 'Each matchup is contested under official tournament scoring rules until the required margin is reached.',
          },
          {
            title: 'Standings Progression',
            text: 'Match victories and point differential automatically update live standings in real time.',
          },
          {
            title: 'Final Rankings',
            text: 'Final tournament placement is determined strictly by the official tiebreaker hierarchy.',
          },
        ];
      case 'bracket':
        return [
          {
            title: 'Knockout System',
            text: 'Single-elimination championship tree. Match winners advance immediately to subsequent rounds.',
          },
          {
            title: 'Progression & Byes',
            text: 'Deterministic seeding positions entries. Top seeds receive automatic first-round byes when bracket size exceeds registered entries.',
          },
          {
            title: 'Championship Decider',
            text: 'The final matchup determines the tournament champion, with optional third-place consolation if configured.',
          },
        ];
      case 'pool_play':
        return [
          {
            title: 'Stage 1: Preliminary Pools',
            text: 'Entries are partitioned into balanced pools for an initial intra-pool round-robin phase.',
          },
          {
            title: 'Stage 2: Championship Bracket',
            text: 'Top qualifiers from each pool advance to the single-elimination knockout tournament bracket.',
          },
          {
            title: 'Advancement Ties',
            text: 'Ties in pool standings are resolved using the official tiebreaker hierarchy prior to bracket seeding.',
          },
        ];
      case 'scramble':
        return [
          {
            title: 'Dynamic Partner Rotation',
            text: 'Individual entries rotate partners dynamically each round, pairing with different peers for fair competition.',
          },
          {
            title: 'Individual Points Accumulation',
            text: 'Points won in every game accumulate directly onto each player’s personal tournament leaderboard.',
          },
          {
            title: 'Final Standings',
            text: 'Top individual cumulative point totals determine tournament champions and podium finishers.',
          },
        ];
      default:
        return [
          {
            title: 'Competition Rules',
            text: 'Standard tournament gameplay rules and division regulations apply.',
          },
        ];
    }
  }, [format]);

  // ─── 10. Tiebreaker Hierarchy List ────────────────────────────────────────
  const tiebreakers = useMemo(() => {
    if (format === 'scramble') {
      return [
        { num: 1, title: 'Total Individual Points', desc: 'Cumulative score across all played rounds (Descending)' },
        { num: 2, title: 'Total Games Played', desc: 'Rounds completed (Descending)' },
        { num: 3, title: 'Point Differential', desc: 'Points scored minus opponent points allowed (Descending)' },
        { num: 4, title: 'Player Name (A–Z)', desc: 'Alphabetical order (Ascending)' },
      ];
    }
    if (format === 'bracket') {
      return [
        { num: 1, title: 'Bracket Progression', desc: 'Furthest round reached in the bracket (Finals > Semis > Quarters)' },
        { num: 2, title: 'Initial Tournament Seed', desc: 'Higher tournament seed takes precedence' },
        { num: 3, title: 'Point Differential', desc: 'Cumulative point differential across all tournament matches' },
      ];
    }
    // Round Robin & Pool Play
    return [
      { num: 1, title: 'Match Wins', desc: 'Total match victories in the tournament (Descending)' },
      { num: 2, title: 'Head-to-Head', desc: 'Direct match outcome between tied opponents' },
      { num: 3, title: 'Point Differential', desc: 'Points scored minus points conceded across all rounds (Descending)' },
      { num: 4, title: 'Total Points Scored', desc: 'Total offensive points scored in all matches (Descending)' },
      { num: 5, title: 'Participant Name (A–Z)', desc: 'Alphabetical order by player or team name (Ascending)' },
    ];
  }, [format]);

  // Clean description without legacy bracket tags
  const cleanDescription = useMemo(() => {
    if (!tournament?.description) return null;
    return tournament.description.replace(/^\[.*?\]\s*/s, '').trim();
  }, [tournament?.description]);

  // ─── 11. Hero Banner Details & Concise Description ────────────────────────
  const bannerBadgeLabel = isCustom
    ? 'Custom Tournament Banner'
    : bannerDetails.level === 'club_default'
      ? 'Inheriting Club Default'
      : bannerDetails.level === 'platform_default'
        ? 'Inheriting Platform Default'
        : 'Built-in Fallback';

  const bannerBadgeVariant: 'success' | 'info' | 'default' = isCustom
    ? 'success'
    : bannerDetails.level === 'club_default'
      ? 'info'
      : 'default';

  const conciseBannerDescription = useMemo(() => {
    if (isCustom) {
      return 'Using a custom banner uploaded specifically for this tournament.';
    }
    if (bannerDetails.level === 'club_default') {
      return `Using your club default ${(format || 'tournament').replace('_', ' ')} banner because no custom banner is uploaded.`;
    }
    if (bannerDetails.level === 'platform_default') {
      return 'Using the Platform Admin default banner because no custom tournament or club default is configured.';
    }
    return 'Using the built-in system default banner.';
  }, [isCustom, bannerDetails.level, format]);

  // ─── 12. Banner Actions ───────────────────────────────────────────────────
  const handlePickBanner = async () => {
    if (!clubId || !tournament?.id) {
      Alert.alert('Notice', 'Tournament details are not loaded.');
      return;
    }

    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Needed', 'Please allow photo gallery access to upload a banner.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const mime = asset.mimeType || (asset.uri?.endsWith('.png') ? 'image/png' : 'image/jpeg');
        const ext = mime.includes('png') ? 'png' : 'jpg';
        const fileName = asset.fileName || `tournament_banner_${Date.now()}.${ext}`;

        setIsUploading(true);
        try {
          const uploadRes = await clubAssetsApi.uploadClubMedia(
            clubId,
            { uri: asset.uri, name: fileName, type: mime },
            'tournament_banner',
            'tournament'
          );

          await clubAssetsApi.updateTournamentImage(clubId, tournament.id, uploadRes.public_url);

          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournament.id) });
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_TOURNAMENTS(clubId) });
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_TOURNAMENTS });

          if (onRefresh) {
            await onRefresh();
          }

          Alert.alert('Success', 'Tournament banner updated successfully.');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Banner upload failed.';
          Alert.alert('Upload Failed', msg);
        } finally {
          setIsUploading(false);
        }
      }
    } catch {
      Alert.alert('Error', 'Unable to open image picker.');
    }
  };

  const handleResetBanner = () => {
    if (!clubId || !tournament?.id) return;

    Alert.alert(
      'Reset Tournament Banner',
      'Remove this custom banner? This tournament will automatically fall back to your club default or platform default banner.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset to Default',
          style: 'destructive',
          onPress: async () => {
            setIsUploading(true);
            try {
              await clubAssetsApi.updateTournamentImage(clubId, tournament.id, null);

              queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(tournament.id) });
              queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_TOURNAMENTS(clubId) });
              queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_TOURNAMENTS });

              if (onRefresh) {
                await onRefresh();
              }

              Alert.alert('Reset Complete', 'Tournament banner reset to default.');
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Reset failed.';
              Alert.alert('Reset Failed', msg);
            } finally {
              setIsUploading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* ─── 1. Tournament Details ────────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconWrap}>
            <Info size={17} color="#0F766E" strokeWidth={2.4} />
          </View>
          <AppText style={styles.cardHeaderTitle}>Tournament Details</AppText>
        </View>

        <View style={styles.fieldsContainer}>
          {/* Tournament Name */}
          <View style={isDesktop ? styles.desktopFieldRow : styles.fieldBlock}>
            <AppText style={styles.fieldLabel}>TOURNAMENT NAME</AppText>
            <AppText style={styles.fieldValueProminent}>{tournament?.name || 'Tournament'}</AppText>
          </View>

          {/* Description */}
          {cleanDescription ? (
            <>
              <View style={styles.divider} />
              <View style={isDesktop ? styles.desktopFieldRow : styles.fieldBlock}>
                <AppText style={styles.fieldLabel}>DESCRIPTION</AppText>
                <View style={styles.descriptionBox}>
                  <AppText style={styles.descriptionText}>{cleanDescription}</AppText>
                </View>
              </View>
            </>
          ) : null}

          <View style={styles.divider} />

          {/* Tournament Format */}
          <View style={isDesktop ? styles.desktopFieldRow : styles.fieldBlock}>
            <AppText style={styles.fieldLabel}>TOURNAMENT FORMAT</AppText>
            <View style={styles.valueWithBadgeRow}>
              <AppText style={styles.fieldValue}>{formatDisplay}</AppText>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Competition Category */}
          <View style={isDesktop ? styles.desktopFieldRow : styles.fieldBlock}>
            <AppText style={styles.fieldLabel}>COMPETITION CATEGORY</AppText>
            <AppText style={styles.fieldValue}>
              {parsed.category || (parsed.isSingles ? 'Singles (Individual)' : 'Doubles (Fixed Partner)')}
            </AppText>
          </View>

          <View style={styles.divider} />

          {/* Skill Level */}
          <View style={isDesktop ? styles.desktopFieldRow : styles.fieldBlock}>
            <AppText style={styles.fieldLabel}>SKILL LEVEL (DUPR / RATING)</AppText>
            <AppText style={styles.fieldValue}>
              {parsed.skillLevelDisplay || 'Open / All levels'}
            </AppText>
          </View>

          <View style={styles.divider} />

          {/* Gender Eligibility */}
          <View style={isDesktop ? styles.desktopFieldRow : styles.fieldBlock}>
            <AppText style={styles.fieldLabel}>GENDER ELIGIBILITY</AppText>
            <AppText style={styles.fieldValue}>
              {parsed.genderEligibility ? `${parsed.genderEligibility} Players` : 'Any (Open to All)'}
            </AppText>
          </View>

          <View style={styles.divider} />

          {/* Age Group */}
          <View style={isDesktop ? styles.desktopFieldRow : styles.fieldBlock}>
            <AppText style={styles.fieldLabel}>AGE GROUP</AppText>
            <AppText style={styles.fieldValue}>{ageDisplay}</AppText>
          </View>
        </View>
      </Card>

      {/* ─── 2. Registration & Pricing ────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeaderResponsive}>
          <View style={styles.cardHeaderLeft}>
            <View style={styles.cardIconWrap}>
              <CreditCard size={17} color="#0F766E" strokeWidth={2.4} />
            </View>
            <AppText style={styles.cardHeaderTitle}>Registration & Pricing</AppText>
          </View>
          <View style={styles.headerBadgeContainer}>
            <Badge label={regStatusLabel} variant={regStatusVariant} />
          </View>
        </View>

        <View style={styles.fieldsContainer}>
          {/* Entry Fee */}
          <View style={isDesktop ? styles.desktopFieldRow : styles.fieldBlock}>
            <AppText style={styles.fieldLabel}>ENTRY FEE</AppText>
            <View style={styles.feeHighlightRow}>
              <AppText style={styles.feeHighlightValue}>
                {parsed.entryFeeDisplay || 'Free ($0.00)'}
              </AppText>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Registration Deadline */}
          <View style={isDesktop ? styles.desktopFieldRow : styles.fieldBlock}>
            <AppText style={styles.fieldLabel}>REGISTRATION DEADLINE</AppText>
            <AppText style={styles.fieldValue}>{deadlineDisplay}</AppText>
          </View>

          <View style={styles.divider} />

          {/* Capacity */}
          <View style={isDesktop ? styles.desktopFieldRow : styles.fieldBlock}>
            <AppText style={styles.fieldLabel}>TOURNAMENT CAPACITY & ENROLLMENT</AppText>
            <View style={styles.capacityBlock}>
              <View style={styles.capacityStatusRow}>
                <AppText style={styles.fieldValueBold}>
                  {registeredCount} / {maxCount} {entryUnit} registered
                </AppText>
                {isCapacityFull ? (
                  <View style={styles.capacityBadgeFull}>
                    <AppText style={styles.capacityBadgeTextFull}>Full Capacity</AppText>
                  </View>
                ) : (
                  <View style={styles.capacityBadgeOpen}>
                    <AppText style={styles.capacityBadgeTextOpen}>{spotsAvailable} spots open</AppText>
                  </View>
                )}
              </View>
              <AppText style={styles.fieldSubtitle}>
                Minimum required to play: {minCount} {entryUnit} • Maximum cap: {maxCount} {entryUnit}
              </AppText>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Registration Status */}
          <View style={isDesktop ? styles.desktopFieldRow : styles.fieldBlock}>
            <AppText style={styles.fieldLabel}>REGISTRATION STATUS</AppText>
            <View style={styles.statusDisplayRow}>
              <View style={[styles.statusDot, { backgroundColor: regStatusVariant === 'success' ? '#16A34A' : '#0F766E' }]} />
              <AppText style={styles.fieldValue}>{regStatusLabel}</AppText>
            </View>
          </View>
        </View>
      </Card>

      {/* ─── 3. Schedule & Courts ─────────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconWrap}>
            <Calendar size={17} color="#0F766E" strokeWidth={2.4} />
          </View>
          <AppText style={styles.cardHeaderTitle}>Schedule & Courts</AppText>
        </View>

        <View style={styles.fieldsContainer}>
          {/* Tournament Dates */}
          <View style={isDesktop ? styles.desktopFieldRow : styles.fieldBlock}>
            <AppText style={styles.fieldLabel}>TOURNAMENT DATES</AppText>
            <AppText style={styles.fieldValue}>{datesDisplay}</AppText>
          </View>

          <View style={styles.divider} />

          {/* Scheduling Engine */}
          <View style={isDesktop ? styles.desktopFieldRow : styles.fieldBlock}>
            <AppText style={styles.fieldLabel}>SCHEDULING ENGINE</AppText>
            <View style={styles.engineBlock}>
              <AppText style={styles.fieldValueBold}>{schedulingEngineInfo.title}</AppText>
              <AppText style={styles.fieldSubtitle}>{schedulingEngineInfo.subtitle}</AppText>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Courts Assigned */}
          <View style={isDesktop ? styles.desktopFieldRow : styles.fieldBlock}>
            <AppText style={styles.fieldLabel}>COURTS ASSIGNED</AppText>
            <AppText style={styles.fieldValue}>
              {courtsAssigned} dedicated court{courtsAssigned === 1 ? '' : 's'} assigned
            </AppText>
          </View>

          {/* Round Configuration */}
          {roundStageConfig ? (
            <>
              <View style={styles.divider} />
              <View style={isDesktop ? styles.desktopFieldRow : styles.fieldBlock}>
                <AppText style={styles.fieldLabel}>ROUND CONFIGURATION</AppText>
                <AppText style={styles.fieldValue}>{roundStageConfig}</AppText>
              </View>
            </>
          ) : null}
        </View>
      </Card>

      {/* ─── 4. Rules & Scoring ───────────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconWrap}>
            <Target size={17} color="#0F766E" strokeWidth={2.4} />
          </View>
          <AppText style={styles.cardHeaderTitle}>Rules & Scoring</AppText>
        </View>

        <View style={styles.fieldsContainer}>
          {/* Scoring Format Chips */}
          <View style={styles.fieldBlock}>
            <AppText style={styles.fieldLabel}>OFFICIAL SCORING FORMAT</AppText>
            <View style={styles.scoringChipsContainer}>
              <View style={styles.scoringChip}>
                <AppText style={styles.scoringChipLabel}>TARGET SCORE</AppText>
                <AppText style={styles.scoringChipValue}>{targetScore} points</AppText>
              </View>
              <View style={styles.scoringChip}>
                <AppText style={styles.scoringChipLabel}>WIN MARGIN</AppText>
                <AppText style={styles.scoringChipValue}>Win by {winBy}</AppText>
              </View>
              <View style={styles.scoringChip}>
                <AppText style={styles.scoringChipLabel}>MATCH LENGTH</AppText>
                <AppText style={styles.scoringChipValue}>{humanizeGameFormat(gameFormat)}</AppText>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Match Rules as Structured Bullet Points */}
          <View style={styles.fieldBlock}>
            <AppText style={styles.fieldLabel}>MATCH RULES & GAMEPLAY</AppText>
            <View style={styles.bulletList}>
              <View style={styles.bulletItem}>
                <View style={styles.bulletDot} />
                <View style={styles.bulletTextCol}>
                  <AppText style={styles.bulletTitle}>Scoring System</AppText>
                  <AppText style={styles.bulletBody}>
                    Standard pickleball scoring ({humanizeGameFormat(gameFormat)} to {targetScore} points).
                  </AppText>
                </View>
              </View>

              <View style={styles.bulletItem}>
                <View style={styles.bulletDot} />
                <View style={styles.bulletTextCol}>
                  <AppText style={styles.bulletTitle}>Winning Condition</AppText>
                  <AppText style={styles.bulletBody}>
                    A side must win by a margin of at least {winBy} point{winBy === 1 ? '' : 's'}. Play continues until this condition is met.
                  </AppText>
                </View>
              </View>

              <View style={styles.bulletItem}>
                <View style={styles.bulletDot} />
                <View style={styles.bulletTextCol}>
                  <AppText style={styles.bulletTitle}>Match Flow</AppText>
                  <AppText style={styles.bulletBody}>
                    Continuous play with standard changeovers between matches and designated referee or court management.
                  </AppText>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Format-Specific Rules as Structured Information */}
          <View style={styles.fieldBlock}>
            <AppText style={styles.fieldLabel}>
              {(format || 'tournament').replace('_', ' ').toUpperCase()} COMPETITION RULES
            </AppText>
            <View style={styles.bulletList}>
              {formatRulesList.map((rule, idx) => (
                <View key={`rule-${idx}`} style={styles.bulletItem}>
                  <View style={styles.bulletDot} />
                  <View style={styles.bulletTextCol}>
                    <AppText style={styles.bulletTitle}>{rule.title}</AppText>
                    <AppText style={styles.bulletBody}>{rule.text}</AppText>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Tiebreaker Hierarchy Sub-Section */}
        <View style={styles.tiebreakerSection}>
          <View style={styles.tiebreakerHeader}>
            <Award size={16} color="#0F766E" strokeWidth={2.4} />
            <AppText style={styles.tiebreakerSectionTitle}>Official Tiebreaker Hierarchy</AppText>
          </View>
          <AppText style={styles.tiebreakerSubtext}>
            Applied sequentially to determine final division rankings and resolve ties:
          </AppText>

          <View style={styles.tiebreakerList}>
            {tiebreakers.map((t) => (
              <View key={t.num} style={styles.tiebreakerRow}>
                <View style={styles.tiebreakerNumBadge}>
                  <AppText style={styles.tiebreakerNumText}>{t.num}</AppText>
                </View>
                <View style={styles.tiebreakerTextGroup}>
                  <AppText style={styles.tiebreakerTitle}>{t.title}</AppText>
                  <AppText style={styles.tiebreakerDesc}>{t.desc}</AppText>
                </View>
              </View>
            ))}
          </View>
        </View>
      </Card>

      {/* ─── 5. Tournament Hero Banner ────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeaderResponsive}>
          <View style={styles.cardHeaderLeft}>
            <View style={styles.cardIconWrap}>
              <Camera size={17} color="#0F766E" strokeWidth={2.4} />
            </View>
            <AppText style={styles.cardHeaderTitle}>Tournament Hero Banner</AppText>
          </View>
          <View style={styles.headerBadgeContainer}>
            <Badge label={bannerBadgeLabel} variant={bannerBadgeVariant} />
          </View>
        </View>

        <AppText style={styles.bannerDesc}>{conciseBannerDescription}</AppText>

        <View style={styles.bannerPreviewContainer}>
          {bannerSource ? (
            <Image source={bannerSource} style={styles.bannerPreviewImage} resizeMode="cover" />
          ) : (
            <View style={styles.bannerEmptyPlaceholder}>
              <Trophy size={28} color="#94A3B8" />
              <AppText style={styles.bannerEmptyText}>No banner configured</AppText>
            </View>
          )}

          {isUploading && (
            <View style={styles.bannerUploadingOverlay}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <AppText style={styles.bannerUploadingText}>Updating banner...</AppText>
            </View>
          )}
        </View>

        {canManage && (
          <View style={styles.bannerActionsRow}>
            <TouchableOpacity
              style={styles.bannerActionBtn}
              onPress={handlePickBanner}
              disabled={isUploading}
              activeOpacity={0.8}
            >
              <Camera size={14} color="#FFFFFF" />
              <AppText style={styles.bannerActionBtnText}>
                {isCustom ? 'Replace Custom Banner' : 'Upload Custom Banner'}
              </AppText>
            </TouchableOpacity>

            {isCustom && (
              <TouchableOpacity
                style={styles.bannerResetBtn}
                onPress={handleResetBanner}
                disabled={isUploading}
                activeOpacity={0.8}
              >
                <RotateCcw size={14} color="#64748B" />
                <AppText style={styles.bannerResetBtnText}>Reset to Default</AppText>
              </TouchableOpacity>
            )}
          </View>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[4],
    gap: Spacing[4],
    paddingBottom: Spacing[8],
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    gap: Spacing[3],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cardHeaderResponsive: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingBottom: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerBadgeContainer: {
    alignSelf: 'flex-start',
  },
  cardIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: '#E6F4EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  fieldsContainer: {
    gap: Spacing[1],
  },
  // Mobile Stacked Field Block
  fieldBlock: {
    paddingVertical: 7,
    gap: 4,
  },
  // Desktop Two-Column Row
  desktopFieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 8,
    gap: 16,
  },
  fieldLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  fieldValue: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
    lineHeight: 20,
  },
  fieldValueProminent: {
    fontSize: 15.5,
    color: '#0F172A',
    fontWeight: '700',
    lineHeight: 22,
  },
  fieldValueBold: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '700',
    lineHeight: 20,
  },
  fieldSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 18,
    marginTop: 2,
  },
  valueWithBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  descriptionBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 2,
  },
  descriptionText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 19,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 2,
  },
  // Registration & Pricing Specifics
  feeHighlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  feeHighlightValue: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0F766E',
  },
  capacityBlock: {
    gap: 4,
  },
  capacityStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  capacityBadgeFull: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  capacityBadgeTextFull: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  capacityBadgeOpen: {
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  capacityBadgeTextOpen: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
  },
  statusDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  // Schedule Specifics
  engineBlock: {
    gap: 2,
  },
  // Scoring Chips
  scoringChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  scoringChip: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 100,
    gap: 2,
  },
  scoringChipLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  scoringChipValue: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F766E',
  },
  // Structured Bullet List
  bulletList: {
    gap: 8,
    marginTop: 4,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0F766E',
    marginTop: 7,
  },
  bulletTextCol: {
    flex: 1,
    gap: 1,
  },
  bulletTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  bulletBody: {
    fontSize: 12.5,
    color: '#475569',
    lineHeight: 18,
  },
  // Tiebreaker Section
  tiebreakerSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: Spacing[2],
    marginTop: Spacing[2],
  },
  tiebreakerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tiebreakerSectionTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  tiebreakerSubtext: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  tiebreakerList: {
    gap: 8,
    marginTop: 4,
  },
  tiebreakerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  tiebreakerNumBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E6F4EA',
    borderWidth: 1,
    borderColor: '#B8E2C8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  tiebreakerNumText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F766E',
  },
  tiebreakerTextGroup: {
    flex: 1,
    gap: 1,
  },
  tiebreakerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  tiebreakerDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  // Hero Banner Specifics
  bannerDesc: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 19,
  },
  bannerPreviewContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  bannerPreviewImage: {
    width: '100%',
    height: '100%',
  },
  bannerEmptyPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  bannerEmptyText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
  },
  bannerUploadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bannerUploadingText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  bannerActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  bannerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0F766E',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  bannerActionBtnText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  bannerResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bannerResetBtnText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
});
