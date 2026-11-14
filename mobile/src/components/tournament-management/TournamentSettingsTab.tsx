/**
 * Aught2 Pickleball — TournamentSettingsTab
 *
 * Dedicated, authoritative home for complete tournament configuration across all formats:
 * 1. Tournament Details (Name, Description, Format, Category, Skill Level, Gender, Age Group)
 * 2. Registration & Pricing (Entry Fee, Registration Deadline, Capacity, Registration Status)
 * 3. Schedule & Courts (Tournament Dates, Scheduling Engine, Assigned Courts, Stage Configuration)
 * 4. Rules & Scoring (Scoring Format, Match Rules, Format Rules, Numbered Tiebreaker Hierarchy)
 * 5. Tournament Hero Banner (Image Preview, Source Inheritance Badge, Upload/Replace, Reset)
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  Award,
  Calendar,
  Camera,
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

export function TournamentSettingsTab({
  tournament,
  clubBranding: passedClubBranding,
  onRefresh,
  canManage = true,
  courtCount,
  plannedRounds,
  poolCount,
}: TournamentSettingsTabProps) {
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
  const gameFormat = typeof scoringRules.game_format === 'string' ? scoringRules.game_format : 'Single game';

  const formatConfig = (tournament?.format_configuration as Record<string, unknown>) || {};

  const isCustom = Boolean(tournament?.banner_image_url);
  const bannerSource = resolveTournamentBanner(tournament, clubBranding, platformBanners);
  const bannerDetails = resolveTournamentBannerDetails(tournament, clubBranding, platformBanners);

  // ─── 1. Determine Format Display ──────────────────────────────────────────
  let formatDisplay = '';
  if (format === 'scramble') {
    formatDisplay = `Rotating Scramble • ${parsed.category || 'Open'}`;
  } else if (format === 'bracket') {
    const bType = String(formatConfig.bracket_type || formatConfig.bracket_format || 'Single Elimination');
    const pStructure = parsed.isSingles ? 'Individual Singles' : 'Fixed Partner Doubles';
    formatDisplay = `${bType} • ${pStructure}`;
  } else if (format === 'pool_play') {
    const pStructure = parsed.isSingles ? 'Singles' : 'Doubles';
    formatDisplay = `Pool Play • ${pStructure}`;
  } else if (format === 'round_robin') {
    const pStructure = parsed.isSingles ? 'Individual Singles' : 'Fixed Partner Doubles';
    formatDisplay = `Round Robin • ${pStructure}`;
  } else {
    formatDisplay = `${tournament?.format_label || 'Tournament'} • ${parsed.category || 'Open'}`;
  }

  // ─── 2. Age Group ─────────────────────────────────────────────────────────
  let ageDisplay = '';
  if (parsed.minAge && parsed.maxAge) {
    ageDisplay = `${parsed.minAge}–${parsed.maxAge} years`;
  } else if (parsed.minAge && !parsed.maxAge) {
    ageDisplay = `${parsed.minAge}+ years`;
  } else if (!parsed.minAge && parsed.maxAge) {
    ageDisplay = `Under ${parsed.maxAge} years`;
  } else if (parsed.ageRestrictionText && parsed.ageRestrictionText !== 'None') {
    ageDisplay = parsed.ageRestrictionText.includes('year')
      ? parsed.ageRestrictionText
      : `${parsed.ageRestrictionText} years`;
  } else {
    ageDisplay = 'All ages';
  }

  // ─── 3. Dates & Deadline ──────────────────────────────────────────────────
  const datesDisplay = formatTournamentDateRange(tournament?.start_date, tournament?.end_date);
  const deadlineDisplay = formatTournamentDeadline(tournament?.registration_close_at);

  // ─── 4. Scheduling Engine ─────────────────────────────────────────────────
  let schedulingEngine = '';
  if (format === 'round_robin') {
    schedulingEngine = 'Round-Robin Berger Tables (All-play-all)';
  } else if (format === 'bracket') {
    const bType = String(formatConfig.bracket_type || formatConfig.bracket_format || 'Single Elimination');
    schedulingEngine = `${bType} (Deterministic seeding & BYE propagation)`;
  } else if (format === 'scramble') {
    schedulingEngine = 'Rotating Partner Matrix (Fair court allocation)';
  } else if (format === 'pool_play') {
    schedulingEngine = 'Serpentine Pool Draft & Intra-pool Round Robin';
  } else {
    schedulingEngine = 'Standard Tournament Engine';
  }

  // ─── 5. Courts Assigned ───────────────────────────────────────────────────
  const courtsAssigned = courtCount ?? (
    typeof formatConfig.courts_count === 'number'
      ? formatConfig.courts_count
      : typeof formatConfig.num_courts === 'number'
      ? formatConfig.num_courts
      : (Array.isArray(formatConfig.courts) && formatConfig.courts.length > 0 ? formatConfig.courts.length : 4)
  );

  // ─── 6. Round / Stage Config ──────────────────────────────────────────────
  let roundStageConfig = '';
  if (format === 'round_robin') {
    const totalRounds = plannedRounds ?? Math.max(1, (parsed.capacity.entryCount || tournament?.max_participants || tournament?.participant_count || 8) - 1);
    roundStageConfig = `${totalRounds} rounds`;
  } else if (format === 'bracket') {
    const bSize = Math.pow(2, Math.ceil(Math.log2(Math.max(2, parsed.capacity.entryCount || tournament?.max_participants || tournament?.participant_count || 8))));
    const rounds = Math.ceil(Math.log2(bSize));
    roundStageConfig = `${rounds} elimination rounds (${bSize}-team bracket)`;
  } else if (format === 'scramble') {
    const r = plannedRounds ?? Number(formatConfig.planned_rounds || 5);
    roundStageConfig = `${r} planned rotation rounds`;
  } else if (format === 'pool_play') {
    const pCount = poolCount ?? Number(formatConfig.pool_count || formatConfig.num_pools || 2);
    roundStageConfig = `${pCount} pools • Championship bracket`;
  }

  // ─── 7. Registration Status Badge ─────────────────────────────────────────
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

  // ─── 8. Tiebreaker rules based on format ──────────────────────────────────
  const tiebreakers = React.useMemo(() => {
    if (format === 'scramble') {
      return [
        { num: 1, title: 'Total Individual Points', desc: 'Cumulative score across all played rounds (Descending)' },
        { num: 2, title: 'Total Games Played', desc: 'Rounds completed (Descending)' },
        { num: 3, title: 'Point Differential', desc: 'Points scored minus opponent points (Descending)' },
        { num: 4, title: 'Player Name (A–Z)', desc: 'Alphabetical order (Ascending)' },
      ];
    }
    if (format === 'bracket') {
      return [
        { num: 1, title: 'Bracket Progression', desc: 'Round advanced in bracket (Finals > Semis > Quarters)' },
        { num: 2, title: 'Initial Seed', desc: 'Higher tournament seed takes precedence' },
        { num: 3, title: 'Point Differential', desc: 'Cumulative match point differential' },
      ];
    }
    // Round Robin & Pool Play
    return [
      { num: 1, title: 'Match Wins', desc: 'Total match victories (Descending)' },
      { num: 2, title: 'Head-to-Head', desc: 'Result between tied opponents (when applicable)' },
      { num: 3, title: 'Point Differential', desc: 'Points scored minus points allowed (Descending)' },
      { num: 4, title: 'Total Points Scored', desc: 'Total offensive points scored (Descending)' },
      { num: 5, title: 'Participant Name (A–Z)', desc: 'Alphabetical order (Ascending)' },
    ];
  }, [format]);

  // Format Specific Rule description
  const formatRuleText = React.useMemo(() => {
    switch (format) {
      case 'round_robin':
        return 'Every participant plays every other opponent once in an intra-division round robin. Standings determine final rankings.';
      case 'bracket':
        return 'Knockout single elimination. Winners advance each round until a champion is crowned.';
      case 'scramble':
        return 'Individual scoring with rotating partners each round. Cumulative points determine leaderboard placement.';
      case 'pool_play':
        return 'Intra-pool round-robin matches followed by a knockout championship bracket for top qualifiers.';
      default:
        return 'Standard tournament competition rules apply.';
    }
  }, [format]);

  // Clean description without legacy bracket tags
  const cleanDescription = React.useMemo(() => {
    if (!tournament?.description) return null;
    return tournament.description.replace(/^\[.*?\]\s*/s, '').trim();
  }, [tournament?.description]);

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

  const bannerBadgeLabel = isCustom
    ? 'Custom Banner'
    : bannerDetails.level === 'club_default'
      ? 'Inheriting Club Default'
      : bannerDetails.level === 'platform_default'
        ? 'Inheriting Platform Default'
        : 'No Banner Configured';

  const bannerBadgeVariant = isCustom
    ? 'success'
    : bannerDetails.level === 'club_default'
      ? 'info'
      : 'default';

  return (
    <View style={styles.container}>
      {/* ─── 1. Tournament Details ────────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Info size={18} color="#0F766E" />
          <AppText style={styles.cardHeaderTitle}>Tournament Details</AppText>
        </View>

        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Tournament Name</AppText>
            <AppText style={styles.valCol}>{tournament?.name || 'Tournament'}</AppText>
          </View>

          {cleanDescription ? (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <AppText style={styles.labelCol}>Description</AppText>
                <AppText style={styles.valCol}>{cleanDescription}</AppText>
              </View>
            </>
          ) : null}

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Tournament Format</AppText>
            <AppText style={styles.valCol}>{formatDisplay}</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Competition Category</AppText>
            <AppText style={styles.valCol}>
              {parsed.category || (parsed.isSingles ? 'Singles' : 'Doubles')}
            </AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Skill Level</AppText>
            <AppText style={styles.valCol}>
              {parsed.skillLevelDisplay || 'Open / All levels'}
            </AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Gender Eligibility</AppText>
            <AppText style={styles.valCol}>
              {parsed.genderEligibility || 'Any'}
            </AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Age Group</AppText>
            <AppText style={styles.valCol}>{ageDisplay}</AppText>
          </View>
        </View>
      </Card>

      {/* ─── 2. Registration & Pricing ────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <CreditCard size={18} color="#0F766E" />
          <AppText style={styles.cardHeaderTitle}>Registration & Pricing</AppText>
          <View style={{ flex: 1 }} />
          <Badge label={regStatusLabel} variant={regStatusVariant} />
        </View>

        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Entry Fee</AppText>
            <AppText style={styles.valCol}>{parsed.entryFeeDisplay || 'Free ($0.00)'}</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Registration Deadline</AppText>
            <AppText style={styles.valCol}>{deadlineDisplay}</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Capacity</AppText>
            <AppText style={styles.valCol}>
              {tournament?.teams_count ?? tournament?.participant_count ?? 0}
              {tournament?.max_participants ? ` / ${tournament.max_participants}` : ''}{' '}
              {parsed.isSingles ? 'players' : 'teams'} registered
              {tournament?.min_participants ? ` (Min: ${tournament.min_participants})` : ''}
            </AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Registration Status</AppText>
            <AppText style={styles.valCol}>{regStatusLabel}</AppText>
          </View>
        </View>
      </Card>

      {/* ─── 3. Schedule & Courts ─────────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Calendar size={18} color="#0F766E" />
          <AppText style={styles.cardHeaderTitle}>Schedule & Courts</AppText>
        </View>

        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Tournament Dates</AppText>
            <AppText style={styles.valCol}>{datesDisplay}</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Scheduling Engine</AppText>
            <AppText style={styles.valCol}>{schedulingEngine}</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Courts Assigned</AppText>
            <AppText style={styles.valCol}>{courtsAssigned} court{courtsAssigned === 1 ? '' : 's'}</AppText>
          </View>

          {roundStageConfig ? (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <AppText style={styles.labelCol}>Round Configuration</AppText>
                <AppText style={styles.valCol}>{roundStageConfig}</AppText>
              </View>
            </>
          ) : null}
        </View>
      </Card>

      {/* ─── 4. Rules & Scoring ───────────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Target size={18} color="#0F766E" />
          <AppText style={styles.cardHeaderTitle}>Rules & Scoring</AppText>
        </View>

        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Scoring Format</AppText>
            <AppText style={styles.valCol}>First to {targetScore} (win by {winBy})</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Match Rules</AppText>
            <AppText style={styles.valCol}>
              Standard pickleball scoring ({gameFormat}), continuous play until win margin
            </AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Format Rules</AppText>
            <AppText style={styles.valCol}>{formatRuleText}</AppText>
          </View>
        </View>

        {/* Tiebreaker Hierarchy Sub-Section */}
        <View style={styles.tiebreakerSection}>
          <View style={styles.tiebreakerHeader}>
            <Award size={15} color="#0F766E" />
            <AppText style={styles.tiebreakerSectionTitle}>Tiebreaker Hierarchy</AppText>
          </View>

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
        <View style={styles.cardHeader}>
          <Camera size={18} color="#0F766E" />
          <AppText style={styles.cardHeaderTitle}>Tournament Hero Banner</AppText>
          <View style={{ flex: 1 }} />
          <Badge label={bannerBadgeLabel} variant={bannerBadgeVariant} />
        </View>

        <AppText style={styles.bannerDesc}>
          {isCustom
            ? 'This custom banner is displayed specifically for this tournament. It does not overwrite club or platform defaults.'
            : bannerDetails.level === 'club_default'
              ? `No custom banner selected. This tournament is automatically using your club's default ${(format || 'tournament').replace('_', ' ')} banner.`
              : bannerDetails.level === 'platform_default'
                ? 'No custom banner or club default selected. This tournament is using the global platform default banner.'
                : 'No banner configured at any level. You can upload a custom banner specifically for this tournament.'}
        </AppText>

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
    gap: 8,
    paddingBottom: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  infoList: {
    gap: Spacing[2],
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 4,
    gap: 12,
  },
  labelCol: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
    flexShrink: 0,
    maxWidth: '48%',
  },
  valCol: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
    flexShrink: 1,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: '#F8FAFC',
  },
  tiebreakerSection: {
    marginTop: Spacing[2],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: Spacing[2],
  },
  tiebreakerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  tiebreakerSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F766E',
    letterSpacing: 0.2,
  },
  tiebreakerList: {
    gap: Spacing[2],
  },
  tiebreakerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  tiebreakerNumBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  tiebreakerNumText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
  },
  tiebreakerTextGroup: {
    flex: 1,
    gap: 1,
  },
  tiebreakerTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  tiebreakerDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  bannerDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  bannerPreviewContainer: {
    width: '100%',
    height: 160,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
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
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    padding: Spacing[4],
  },
  bannerEmptyText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },
  bannerUploadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  bannerUploadingText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  bannerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    flexWrap: 'wrap',
    marginTop: Spacing[1],
  },
  bannerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F766E',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
  },
  bannerActionBtnText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  bannerResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  bannerResetBtnText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
});
