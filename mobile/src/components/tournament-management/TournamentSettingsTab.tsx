/**
 * Aught2 Pickleball — TournamentSettingsTab
 *
 * Dedicated, authoritative home for complete tournament configuration across ALL formats.
 * Redesigned to follow the exact same UI design system and information-display format as
 * Club Side → League Management → Overview & Rules tab (PlayerLeagueOverviewTab):
 * - Clean, premium, light background
 * - White information cards with subtle borders (#E2EAE5) and soft elevation
 * - Consistent card padding (16px) and corner radius (14px)
 * - Section header with 26x26 mint icon wrap (#DEF2E6) and 15px bold title (#102F2A)
 * - Single-column InfoRow on mobile (muted label on top, bold readable value below)
 * - Responsive row layout on tablet/desktop (>= 768px)
 * - Nested, clean tiebreaker hierarchy callout box
 * - Restrained green accents (#176B57)
 * - Complete preservation of banner upload/reset and management actions
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
  Calendar,
  Camera,
  CreditCard,
  FileText,
  Layers,
  RotateCcw,
  Scale,
  SlidersHorizontal,
  Tag,
  Trophy,
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
import type { ClubBranding, Tournament } from '@/types';
import { resolveTournamentBanner, resolveTournamentBannerDetails } from '@/utils/imageResolution';
import { getTournamentRegistrationMetrics, parseTournamentConfig } from '@/utils/tournamentCapacity';

export interface TournamentSettingsTabProps {
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

function InfoRow({
  label,
  value,
  isLast = false,
  isTablet = false,
}: {
  label: string;
  value: React.ReactNode;
  isLast?: boolean;
  isTablet?: boolean;
}) {
  return (
    <View style={[styles.infoRow, isTablet && styles.infoRowTablet, isLast && styles.infoRowLast]}>
      <AppText style={[styles.infoLabel, isTablet && styles.infoLabelTablet]}>{label}</AppText>
      {typeof value === 'string' || typeof value === 'number' ? (
        <AppText style={[styles.infoValue, isTablet && styles.infoValueTablet]}>{value}</AppText>
      ) : (
        <View style={isTablet && styles.infoValueTabletWrap}>{value}</View>
      )}
    </View>
  );
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
  const isTablet = width >= 768;

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

  const formatConfig = (tournament?.format_configuration as Record<string, any>) || {};

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
    return `${tournament?.format_label || getFormatDisplayLabel(tournament?.format) || 'Tournament'} • ${parsed.category || 'Open'}`;
  }, [format, formatConfig, parsed, tournament]);

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
  const regMetrics = getTournamentRegistrationMetrics(tournament);
  const registeredCount = regMetrics.registeredCount;
  const maxCount = tournament?.max_participants ?? 8;
  const minCount = tournament?.min_participants ?? 4;
  const entryUnit = regMetrics.registeredLabel;
  const isCapacityFull = registeredCount >= maxCount;
  const spotsAvailable = Math.max(0, maxCount - registeredCount);

  // ─── 8. Registration Status Badge ─────────────────────────────────────────
  const regStatus = tournament?.status?.toLowerCase();
  const workflowState = tournament?.workflow_state?.toLowerCase();
  const isStructureReady =
    workflowState === 'structure_generated' ||
    Boolean(tournament?.structure_generated) ||
    Boolean(formatConfig.is_format_configured);
  const isConfigSaved =
    !isStructureReady &&
    (workflowState === 'configuration_saved' ||
      Boolean(tournament?.configuration_saved) ||
      Boolean(formatConfig.configuration_saved));
  const isAwaitingFormatConfig =
    regStatus === 'registration_closed' && !isStructureReady && !isConfigSaved;

  const regStatusLabel =
    regStatus === 'registration_open' || regStatus === 'open'
      ? 'Registration Open'
      : isAwaitingFormatConfig
      ? 'Registration Closed – Awaiting Configuration'
      : isConfigSaved
      ? 'Configuration Saved'
      : isStructureReady
      ? 'Ready to Start'
      : regStatus === 'registration_closed'
      ? 'Registration Closed'
      : regStatus === 'in_progress'
      ? 'In Progress'
      : regStatus === 'completed'
      ? 'Completed'
      : regStatus === 'cancelled'
      ? 'Cancelled'
      : 'Draft';

  const regStatusVariant: 'registration_open' | 'in_progress' | 'completed' | 'cancelled' | 'draft' | 'default' =
    regStatus === 'registration_open' || regStatus === 'open'
      ? 'registration_open'
      : regStatus === 'in_progress'
      ? 'in_progress'
      : regStatus === 'completed'
      ? 'completed'
      : regStatus === 'cancelled'
      ? 'cancelled'
      : 'draft';

  // ─── 9. Tiebreaker Hierarchy List ─────────────────────────────────────────
  const tiebreakers = useMemo(() => {
    if (format === 'scramble') {
      return [
        { num: 1, title: 'Total Individual Points', desc: 'Cumulative score across all played rounds' },
        { num: 2, title: 'Total Games Played', desc: 'Rounds completed' },
        { num: 3, title: 'Point Differential', desc: 'Points scored minus opponent points allowed' },
        { num: 4, title: 'Player Name (A–Z)', desc: 'Alphabetical order' },
      ];
    }
    if (format === 'bracket') {
      return [
        { num: 1, title: 'Bracket Progression', desc: 'Furthest round reached in the championship tree' },
        { num: 2, title: 'Initial Tournament Seed', desc: 'Higher tournament seed takes precedence' },
        { num: 3, title: 'Point Differential', desc: 'Cumulative point differential across all matches' },
      ];
    }
    // Round Robin & Pool Play
    return [
      { num: 1, title: 'Match Wins', desc: 'Total match victories in the tournament' },
      { num: 2, title: 'Head-to-Head Record', desc: 'Direct match outcome between tied opponents' },
      { num: 3, title: 'Point Differential', desc: 'Points scored minus points conceded' },
      { num: 4, title: 'Total Points Scored', desc: 'Total offensive points scored in all matches' },
      { num: 5, title: 'Participant Name (A–Z)', desc: 'Alphabetical order by player or team name' },
    ];
  }, [format]);

  // Clean description without legacy bracket tags
  const cleanDescription = useMemo(() => {
    if (!tournament?.description) return null;
    const stripped = tournament.description.replace(/^\[.*?\]\s*/s, '').trim();
    if (stripped.startsWith('{') || stripped.startsWith('[')) return null;
    return stripped.length > 0 ? stripped : null;
  }, [tournament?.description]);

  // ─── 10. Hero Banner Details ──────────────────────────────────────────────
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

  // ─── 11. Banner Actions ───────────────────────────────────────────────────
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
      {/* ─── 1. Optional Custom Description ─── */}
      {cleanDescription ? (
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.iconWrap}>
              <FileText size={15} color="#176B57" />
            </View>
            <AppText variant="body" bold style={styles.cardTitle}>
              About the Tournament
            </AppText>
          </View>
          <AppText style={styles.descriptionText}>{cleanDescription}</AppText>
        </Card>
      ) : null}

      {/* ─── 2. Tournament Information Card ─── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconWrap}>
            <Tag size={15} color="#176B57" />
          </View>
          <AppText variant="body" bold style={styles.cardTitle}>
            Tournament Information
          </AppText>
        </View>

        <View style={styles.rowsList}>
          <InfoRow
            label="Tournament Name"
            value={tournament?.name || 'Tournament'}
            isTablet={isTablet}
          />
          <InfoRow
            label="Competition Format"
            value={formatDisplay}
            isTablet={isTablet}
          />
          <InfoRow
            label="Division"
            value={parsed.category || (parsed.isSingles ? 'Singles (Individual)' : 'Doubles (Fixed Partner)')}
            isTablet={isTablet}
          />
          <InfoRow
            label="Registration Type"
            value={parsed.isSingles ? 'Individual (Singles)' : 'Fixed Team (Doubles)'}
            isTablet={isTablet}
          />
          <InfoRow
            label="Skill Eligibility"
            value={parsed.skillLevelDisplay || 'Open / All Levels'}
            isTablet={isTablet}
          />
          <InfoRow
            label="Gender Eligibility"
            value={parsed.genderEligibility ? `${parsed.genderEligibility} Players` : 'Open / Any'}
            isTablet={isTablet}
          />
          <InfoRow
            label="Age Group"
            value={ageDisplay}
            isTablet={isTablet}
            isLast
          />
        </View>
      </Card>

      {/* ─── 3. Schedule & Venue Card ─── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconWrap}>
            <Calendar size={15} color="#176B57" />
          </View>
          <AppText variant="body" bold style={styles.cardTitle}>
            Schedule & Venue
          </AppText>
        </View>

        <View style={styles.rowsList}>
          <InfoRow
            label="Tournament Dates"
            value={datesDisplay}
            isTablet={isTablet}
          />
          <InfoRow
            label="Registration Deadline"
            value={deadlineDisplay}
            isTablet={isTablet}
          />
          <InfoRow
            label="Host Club"
            value={clubBranding?.name || tournament?.club_name || 'Pickleball Club'}
            isTablet={isTablet}
          />
          <InfoRow
            label="Assigned Courts"
            value={`${courtsAssigned} dedicated court${courtsAssigned === 1 ? '' : 's'}`}
            isTablet={isTablet}
          />
          <InfoRow
            label="Scheduling Engine"
            value={schedulingEngineInfo.title}
            isTablet={isTablet}
            isLast
          />
        </View>
      </Card>

      {/* ─── 4. Registration & Capacity Card ─── */}
      <Card style={styles.card}>
        <View style={styles.cardHeaderWithBadge}>
          <View style={styles.cardHeaderLeft}>
            <View style={styles.iconWrap}>
              <CreditCard size={15} color="#176B57" />
            </View>
            <AppText variant="body" bold style={styles.cardTitle}>
              Registration & Capacity
            </AppText>
          </View>
          <Badge label={regStatusLabel} variant={regStatusVariant} />
        </View>

        <View style={styles.rowsList}>
          <InfoRow
            label="Registration Status"
            value={regStatusLabel}
            isTablet={isTablet}
          />
          <InfoRow
            label="Entry Fee"
            value={parsed.entryFeeDisplay || 'Free ($0.00)'}
            isTablet={isTablet}
          />
          <InfoRow
            label="Maximum Capacity"
            value={`${maxCount} ${entryUnit}`}
            isTablet={isTablet}
          />
          <InfoRow
            label="Minimum Required"
            value={`${minCount} ${entryUnit}`}
            isTablet={isTablet}
          />
          <InfoRow
            label="Current Enrollment"
            value={`${registeredCount} / ${maxCount} ${entryUnit} (${isCapacityFull ? 'Full Capacity' : `${spotsAvailable} spots open`})`}
            isTablet={isTablet}
            isLast
          />
        </View>
      </Card>

      {/* ─── 5. Format-Specific Configuration Card ─── */}
      {format === 'pool_play' && (
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.iconWrap}>
              <Layers size={15} color="#176B57" />
            </View>
            <AppText variant="body" bold style={styles.cardTitle}>
              Pool & Bracket Configuration
            </AppText>
          </View>

          <View style={styles.rowsList}>
            <InfoRow
              label="Preliminary Pools"
              value={isStructureReady || isConfigSaved
                ? `${poolCount ?? formatConfig.pool_count ?? 2} Pools`
                : `Configured post-registration based on confirmed teams (Baseline: ${poolCount ?? formatConfig.pool_count ?? 2} Pools)`
              }
              isTablet={isTablet}
            />
            <InfoRow
              label="Advancement Rule"
              value={isStructureReady || isConfigSaved
                ? `Top ${formatConfig.advancement_count || formatConfig.qualifiers_per_pool || 2} per pool advance to Championship Bracket`
                : `Selected post-registration (Baseline: Top ${formatConfig.qualifiers_per_pool || 2} per pool)`
              }
              isTablet={isTablet}
            />
            <InfoRow
              label="Playoff Bracket Format"
              value={formatConfig.pool_bracket_type || 'Single Elimination Knockout'}
              isTablet={isTablet}
            />
            <InfoRow
              label="Stage Progression"
              value="Preliminary Round Robin Pools → Championship Knockout Bracket"
              isTablet={isTablet}
              isLast
            />
          </View>
        </Card>
      )}

      {format === 'bracket' && (
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.iconWrap}>
              <Trophy size={15} color="#176B57" />
            </View>
            <AppText variant="body" bold style={styles.cardTitle}>
              Bracket Configuration
            </AppText>
          </View>

          <View style={styles.rowsList}>
            <InfoRow
              label="Bracket Format"
              value={String(formatConfig.bracket_type || formatConfig.bracket_format || 'Single Elimination')}
              isTablet={isTablet}
            />
            <InfoRow
              label="Elimination Structure"
              value={roundStageConfig || 'Single Elimination Tree'}
              isTablet={isTablet}
            />
            <InfoRow
              label="Seeding Method"
              value={String(formatConfig.seeding_method || 'Random & Skill-Ranked Seeding')}
              isTablet={isTablet}
            />
            <InfoRow
              label="Consolation Match"
              value={formatConfig.has_third_place || formatConfig.third_place_match ? 'Bronze Medal (3rd Place) Match Enabled' : 'None (Single Elimination)'}
              isTablet={isTablet}
            />
            <InfoRow
              label="First-Round Byes"
              value="Automatic BYE propagation for top seeds"
              isTablet={isTablet}
              isLast
            />
          </View>
        </Card>
      )}

      {format === 'scramble' && (
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.iconWrap}>
              <SlidersHorizontal size={15} color="#176B57" />
            </View>
            <AppText variant="body" bold style={styles.cardTitle}>
              Scramble Configuration
            </AppText>
          </View>

          <View style={styles.rowsList}>
            <InfoRow
              label="Rotation Engine"
              value="Dynamic Partner Rotation Matrix"
              isTablet={isTablet}
            />
            <InfoRow
              label="Planned Rotation Rounds"
              value={isStructureReady || isConfigSaved
                ? `${plannedRounds ?? formatConfig.planned_rounds ?? 5} Rounds`
                : `Configured post-registration based on confirmed players (Baseline: ${plannedRounds ?? formatConfig.planned_rounds ?? 5} Rounds)`
              }
              isTablet={isTablet}
            />
            <InfoRow
              label="Pairing Rule"
              value={formatConfig.rotation_rule || "Fair round-by-round partner rotation with individual scoring"}
              isTablet={isTablet}
            />
            <InfoRow
              label="Leaderboard Metric"
              value="Individual cumulative points scored across all rounds"
              isTablet={isTablet}
              isLast
            />
          </View>
        </Card>
      )}

      {format === 'round_robin' && (
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.iconWrap}>
              <SlidersHorizontal size={15} color="#176B57" />
            </View>
            <AppText variant="body" bold style={styles.cardTitle}>
              Round Robin Configuration
            </AppText>
          </View>

          <View style={styles.rowsList}>
            <InfoRow
              label="Competition Structure"
              value="All-play-all intra-division schedule"
              isTablet={isTablet}
            />
            <InfoRow
              label="Scheduled Rounds"
              value={roundStageConfig || 'Balanced round-robin distribution'}
              isTablet={isTablet}
            />
            <InfoRow
              label="Scheduling Matrix"
              value="Berger Tables (balanced round distribution)"
              isTablet={isTablet}
            />
            <InfoRow
              label="Court Allocation"
              value="Dedicated court assignment per round with bye handling"
              isTablet={isTablet}
              isLast
            />
          </View>
        </Card>
      )}

      {/* ─── 6. Game Rules & Scoring Card ─── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconWrap}>
            <Scale size={15} color="#176B57" />
          </View>
          <AppText variant="body" bold style={styles.cardTitle}>
            Game Rules & Scoring
          </AppText>
        </View>

        <View style={styles.rowsList}>
          <InfoRow
            label="Match Format"
            value={humanizeGameFormat(gameFormat)}
            isTablet={isTablet}
          />
          <InfoRow
            label="Target Score"
            value={`${targetScore} Points (win by ${winBy})`}
            isTablet={isTablet}
          />
          <InfoRow
            label="Win-by Margin"
            value={`${winBy} Points`}
            isTablet={isTablet}
          />
          <InfoRow
            label="Scoring System"
            value={`Standard pickleball scoring to ${targetScore} points`}
            isTablet={isTablet}
            isLast
          />

          {/* Compact Tiebreaker Order Box (identical to League Overview & Rules) */}
          <View style={styles.tiebreakerBox}>
            <AppText style={styles.tiebreakerHeader}>Official Tiebreaker Hierarchy</AppText>
            <View style={styles.tiebreakerList}>
              {tiebreakers.map((t) => (
                <AppText key={t.num} style={styles.tiebreakerItem}>
                  {t.num}. {t.title}{t.desc ? ` – ${t.desc}` : ''}
                </AppText>
              ))}
            </View>
          </View>
        </View>
      </Card>

      {/* ─── 7. Tournament Hero Banner Card ─── */}
      <Card style={styles.card}>
        <View style={styles.cardHeaderWithBadge}>
          <View style={styles.cardHeaderLeft}>
            <View style={styles.iconWrap}>
              <Camera size={15} color="#176B57" />
            </View>
            <AppText variant="body" bold style={styles.cardTitle}>
              Tournament Hero Banner
            </AppText>
          </View>
          <Badge label={bannerBadgeLabel} variant={bannerBadgeVariant} />
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
                <RotateCcw size={14} color="#475569" />
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
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
    paddingBottom: 32,
    maxWidth: 860,
    alignSelf: 'center',
    width: '100%',
  },
  card: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAE5',
    gap: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 2,
  },
  cardHeaderWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingBottom: 2,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: '#DEF2E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102F2A',
  },
  descriptionText: {
    fontSize: 13.5,
    color: '#475569',
    lineHeight: 20,
  },
  rowsList: {
    gap: 0,
  },
  infoRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F2',
  },
  infoRowTablet: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 2,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 3,
  },
  infoLabelTablet: {
    marginBottom: 0,
    flex: 1,
  },
  infoValue: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 20,
  },
  infoValueTablet: {
    textAlign: 'right',
    flex: 1,
  },
  infoValueTabletWrap: {
    alignItems: 'flex-end',
    flex: 1,
  },
  tiebreakerBox: {
    backgroundColor: '#F8FAF9',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EBF1EE',
    marginTop: 10,
  },
  tiebreakerHeader: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#176B57',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  tiebreakerList: {
    gap: 4,
  },
  tiebreakerItem: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#334155',
    lineHeight: 18,
  },
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
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#E2EAE5',
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
    backgroundColor: 'rgba(16, 47, 42, 0.75)',
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
    marginTop: 4,
  },
  bannerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#176B57',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  bannerActionBtnText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  bannerResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  bannerResetBtnText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
});
