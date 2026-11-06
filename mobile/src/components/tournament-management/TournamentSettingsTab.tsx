/**
 * Aught2 Pickleball — TournamentSettingsTab
 *
 * Standardized Settings view across all tournament formats:
 * - Tournament Hero Banner (Custom override & Inheritance management)
 * - Format & Structure
 * - Official Scoring Rules
 * - Standings & Tiebreaker Rules
 * - Participant Capacity & Eligibility
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
  Camera,
  Layers,
  RotateCcw,
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
  onRefresh?: () => void | Promise<unknown>;
  canManage?: boolean;
}

export function TournamentSettingsTab({
  tournament,
  clubBranding: passedClubBranding,
  onRefresh,
  canManage = true,
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

  // Tiebreaker rules based on format
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

          // Invalidate relevant queries so all views refresh immediately
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
      {/* ─── 0. Tournament Hero Banner ─────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Camera size={18} color="#0F766E" />
          <AppText style={styles.cardHeaderTitle}>Tournament Hero Banner</AppText>
          <View style={{ flex: 1 }} />
          <Badge label={bannerBadgeLabel} variant={bannerBadgeVariant} />
        </View>

        <AppText style={styles.bannerDesc}>
          {isCustom
            ? 'This custom banner is displayed specifically for this tournament. It does not overwrite any club or platform default banners.'
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
              <AppText style={styles.bannerEmptyText}>No banner configured (clean neutral state)</AppText>
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

      {/* ─── 1. Format & Structure ────────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Layers size={18} color="#0F766E" />
          <AppText style={styles.cardHeaderTitle}>Format & Structure</AppText>
        </View>

        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Tournament Format</AppText>
            <AppText style={styles.valCol}>{tournament?.format_label || getFormatDisplayLabel(tournament?.format)}</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Competition Category</AppText>
            <AppText style={styles.valCol}>{parsed.category}</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Participant Structure</AppText>
            <AppText style={styles.valCol}>
              {format === 'scramble'
                ? 'Individual players with rotating partners'
                : parsed.isSingles
                ? '1 player per entry (Singles)'
                : '2 players per team (Fixed Doubles)'}
            </AppText>
          </View>

          {format === 'bracket' && (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <AppText style={styles.labelCol}>Bracket Type</AppText>
                <AppText style={styles.valCol}>
                  {String(formatConfig.bracket_type || formatConfig.bracket_format || 'Single Elimination')}
                </AppText>
              </View>
            </>
          )}

          {format === 'scramble' && (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <AppText style={styles.labelCol}>Planned Rounds</AppText>
                <AppText style={styles.valCol}>
                  {String(formatConfig.planned_rounds || 5)} Rounds
                </AppText>
              </View>
            </>
          )}

          {format === 'pool_play' && (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <AppText style={styles.labelCol}>Number of Pools</AppText>
                <AppText style={styles.valCol}>
                  {String(formatConfig.pool_count || formatConfig.num_pools || 2)} Pools
                </AppText>
              </View>
            </>
          )}
        </View>
      </Card>

      {/* ─── 2. Scoring Rules ─────────────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Target size={18} color="#0F766E" />
          <AppText style={styles.cardHeaderTitle}>Official Scoring Rules</AppText>
        </View>

        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Game Format</AppText>
            <AppText style={styles.valCol}>{gameFormat}</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Points to Win</AppText>
            <AppText style={styles.valCol}>First to {targetScore} points</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Win Margin</AppText>
            <AppText style={styles.valCol}>Win by {winBy} or more</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Draws / Ties</AppText>
            <AppText style={styles.valCol}>Not allowed (continuous play until win margin)</AppText>
          </View>
        </View>
      </Card>

      {/* ─── 3. Eligibility & Registration Window ─────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Users size={18} color="#0F766E" />
          <AppText style={styles.cardHeaderTitle}>Capacity & Eligibility</AppText>
        </View>

        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Capacity Limit</AppText>
            <AppText style={styles.valCol}>
              {tournament?.max_participants ? `${tournament.max_participants} max` : 'Unlimited'}
              {tournament?.min_participants ? ` (${tournament.min_participants} min required)` : ''}
            </AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Skill Level</AppText>
            <AppText style={styles.valCol}>
              {String(formatConfig.skill_level || (tournament && 'skill_level' in tournament ? tournament.skill_level : null) || 'Open / All levels')}
            </AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Gender Eligibility</AppText>
            <AppText style={styles.valCol}>
              {String(formatConfig.gender_eligibility || 'Any')}
            </AppText>
          </View>

          {Boolean(formatConfig.entry_fee) && (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <AppText style={styles.labelCol}>Entry Fee</AppText>
                <AppText style={styles.valCol}>${Number(formatConfig.entry_fee).toFixed(2)}</AppText>
              </View>
            </>
          )}
        </View>
      </Card>

      {/* ─── 4. Standings Tiebreaker Order ─────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Award size={18} color="#0F766E" />
          <AppText style={styles.cardHeaderTitle}>Tiebreaker Criteria</AppText>
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
  infoList: {
    gap: Spacing[2],
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 5,
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
  tiebreakerList: {
    gap: Spacing[3],
  },
  tiebreakerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  tiebreakerNumBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  tiebreakerNumText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
  },
  tiebreakerTextGroup: {
    flex: 1,
    gap: 2,
  },
  tiebreakerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  tiebreakerDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
  },
});
