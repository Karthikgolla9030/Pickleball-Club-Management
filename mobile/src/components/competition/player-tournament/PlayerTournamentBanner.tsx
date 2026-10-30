/**
 * Aught2 Pickleball — PlayerTournamentBanner
 *
 * Standardized Hero Banner matching the reference design:
 * - Pickleball court photo background with dark translucent overlay
 * - Status badge on top-left (COMPLETED, IN PROGRESS, REGISTRATION OPEN, DRAFT)
 * - Format pill on top-right (ROUND ROBIN, BRACKET, POOL PLAY, SCRAMBLE)
 * - Large white tournament title
 * - "Hosted by <club>"
 * - Metadata row: Dates, Location, Category/Division, Capacity
 */

import React, { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Calendar, MapPin, Trophy, Users } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { formatDate } from '@/utils';
import { resolveTournamentBanner } from '@/utils/imageResolution';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';
import { useClubBranding } from '@/hooks';
import type { Tournament } from '@/types';

export interface PlayerTournamentBannerProps {
  tournament: Tournament;
  registeredCount?: number;
  totalCapacity?: number;
  categoryLabel?: string;
}

export function PlayerTournamentBanner({
  tournament,
  registeredCount,
  totalCapacity,
  categoryLabel,
}: PlayerTournamentBannerProps) {
  const { branding } = useClubBranding(tournament.club_id);
  const bannerSource = resolveTournamentBanner(
    { banner_image_url: tournament.banner_image_url, format: tournament.format },
    branding
  );

  const status = (tournament.status || 'draft') as string;
  const format = tournament.format || 'round_robin';
  const parsedConfig = useMemo(() => parseTournamentConfig(tournament), [tournament]);

  // Format label & style
  const getFormatBadge = () => {
    switch (format) {
      case 'bracket':
        return { label: 'BRACKET', bg: '#FED7AA', text: '#9A3412' };
      case 'pool_play':
        return { label: 'POOL PLAY', bg: '#CCFBF1', text: '#115E59' };
      case 'scramble':
        return { label: 'SCRAMBLE', bg: '#FEF08A', text: '#854D0E' };
      case 'round_robin':
      default:
        return { label: 'ROUND ROBIN', bg: '#EDE9FE', text: '#6D28D9' };
    }
  };

  // Status badge
  const getStatusBadge = () => {
    switch (status) {
      case 'completed':
        return { label: 'COMPLETED', bg: 'rgba(255, 255, 255, 0.2)', border: 'rgba(255, 255, 255, 0.4)', isTrophy: true };
      case 'in_progress':
        return { label: 'LIVE NOW', bg: 'rgba(239, 68, 68, 0.3)', border: '#EF4444', isTrophy: false };
      case 'registration_open':
        return { label: 'REGISTRATION OPEN', bg: 'rgba(34, 197, 94, 0.25)', border: '#22C55E', isTrophy: false };
      case 'upcoming':
        return { label: 'UPCOMING', bg: 'rgba(59, 130, 246, 0.25)', border: '#3B82F6', isTrophy: false };
      default:
        return { label: (tournament.status_label || status).toUpperCase(), bg: 'rgba(255, 255, 255, 0.2)', border: 'rgba(255, 255, 255, 0.3)', isTrophy: false };
    }
  };

  const formatBadge = getFormatBadge();
  const statusBadge = getStatusBadge();

  // Category fallback
  const displayCategory =
    categoryLabel ||
    parsedConfig.category ||
    (tournament.competition_category
      ? tournament.competition_category.replace(/_/g, ' ').toUpperCase()
      : 'Singles');

  return (
    <View style={styles.heroBanner}>
      <Image source={bannerSource} style={styles.heroImage} resizeMode="cover" />
      <View style={styles.heroOverlay} />

      <View style={styles.heroInner}>
        {/* Top Badges Row */}
        <View style={styles.heroBadgesRow}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusBadge.bg, borderColor: statusBadge.border },
            ]}
          >
            {statusBadge.isTrophy && (
              <Trophy size={12} color="#FFFFFF" style={{ marginRight: 5 }} />
            )}
            <AppText variant="caption" bold style={styles.statusBadgeText}>
              {statusBadge.label}
            </AppText>
          </View>

          <View style={[styles.formatBadge, { backgroundColor: formatBadge.bg }]}>
            <AppText
              variant="caption"
              bold
              style={[styles.formatBadgeText, { color: formatBadge.text }]}
            >
              {formatBadge.label}
            </AppText>
          </View>
        </View>

        {/* Tournament Info */}
        <View style={styles.heroInfoBlock}>
          <AppText variant="heading1" style={styles.heroTitle}>
            {tournament.name}
          </AppText>

          <AppText variant="bodySmall" style={styles.heroHost}>
            Hosted by {tournament.location_name || tournament.club_name || 'Club'}
          </AppText>

          {/* Metadata Row */}
          <View style={styles.heroMetaRow}>
            <View style={styles.heroMetaItem}>
              <Calendar size={13} color="#E2E8F0" style={{ marginRight: 4 }} />
              <AppText variant="caption" style={styles.heroMetaText}>
                {formatDate(tournament.start_date)} – {formatDate(tournament.end_date)}
              </AppText>
            </View>

            <View style={styles.heroMetaItem}>
              <MapPin size={13} color="#E2E8F0" style={{ marginRight: 4 }} />
              <AppText variant="caption" style={styles.heroMetaText} numberOfLines={1}>
                {tournament.location_name || 'Courts'}
              </AppText>
            </View>

            <View style={styles.heroMetaItem}>
              <Users size={13} color="#E2E8F0" style={{ marginRight: 4 }} />
              <AppText variant="caption" style={styles.heroMetaText}>
                {displayCategory}
              </AppText>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroBanner: {
    height: 210,
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#0F172A',
  },
  heroImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(9, 44, 39, 0.76)',
  },
  heroInner: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    justifyContent: 'space-between',
  },
  heroBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  formatBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  formatBadgeText: {
    fontSize: 11,
    letterSpacing: 0.5,
  },
  heroInfoBlock: {
    gap: 4,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
  },
  heroHost: {
    color: '#E2E8F0',
    fontSize: 13,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  heroMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroMetaText: {
    color: '#CBD5E1',
    fontSize: 12,
  },
});
