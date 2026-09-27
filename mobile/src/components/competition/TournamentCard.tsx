/**
 * Aught2 Pickleball — TournamentCard Component
 *
 * Light premium sports-club management design:
 *   - Top: Consistent, high-fidelity hero banner image with:
 *          - Full coverage & clipping at banner corners (no gaps, no distortion).
 *          - Status badge on top-left, 3-dots menu button on top-right.
 *          - Clear white tournament title & category/details with subtle darkening overlay.
 *          - Dedicated 'Manage →' pill button on banner bottom-right.
 *   - Bottom: Clean white information area with:
 *          Row 1: 📅 Date range + right-aligned format badge (BRACKET, ROUND ROBIN, POOL PLAY, SCRAMBLE)
 *          Row 2: 👥 Registered player/team count (e.g. 0 / 12 registered)
 *          Row 3: 🎯 Scoring info on left (e.g. First to 11 (win by 2)) AND,
 *                 when in DRAFT status, "Publish & Open" action button on the bottom-right.
 *   - Layout fits neatly across mobile, tablet, and desktop without horizontal overflow.
 */

import React from 'react';
import {
  Image,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Calendar,
  MoreVertical,
  Target,
  Users,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import type { TournamentStatus } from '@/types';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';

export interface TournamentCardData {
  id: string;
  name: string;
  description?: string | null;
  format?: string;
  format_label: string;
  status: TournamentStatus | string;
  status_label: string;
  visibility?: string;
  start_date: string;
  end_date: string;
  participant_count: number;
  max_participants?: number | null;
  scoring_rules?: {
    target_score?: number;
    win_by?: number;
  };
  club_name?: string;
  is_registration_open?: boolean;
  format_configuration?: Record<string, any> | null;
}

interface TournamentCardProps {
  tournament: TournamentCardData;
  index?: number;
  onPress: () => void;
  onOptionsPress?: () => void;
  onPublishPress?: () => void;
  onCloseRegistrationPress?: () => void;
  actionLabel?: string;
}

function formatTournamentDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

function formatTournamentDateRange(startStr: string, endStr: string): string {
  if (!startStr) return 'TBD';
  const startFmt = formatTournamentDate(startStr);
  if (!endStr || startStr === endStr) return startFmt;
  const endFmt = formatTournamentDate(endStr);
  return `${startFmt} – ${endFmt}`;
}

function getStatusBadgeStyle(status: string) {
  switch (status.toLowerCase()) {
    case 'in_progress':
      return { bg: '#D4E5FC', text: '#1D4ED8', label: 'IN PROGRESS' };
    case 'cancelled':
      return { bg: '#FFD8D8', text: '#DC2626', label: 'CANCELLED' };
    case 'completed':
      return { bg: '#5A6F82', text: '#FFFFFF', label: 'COMPLETED' };
    case 'registration_open':
    case 'open':
      return { bg: '#E3F3EA', text: '#18794E', label: 'REGISTRATION OPEN' };
    case 'draft':
      return { bg: '#FFF3D6', text: '#B45309', label: 'DRAFT' };
    default:
      return { bg: '#E2EAE6', text: '#475569', label: status.toUpperCase() };
  }
}

function getFormatBadgeStyle(format: string, label: string) {
  const norm = (format || label || '').toLowerCase();
  if (norm.includes('bracket')) {
    return { bg: '#DDEBFF', text: '#2563EB', label: 'BRACKET' };
  }
  if (norm.includes('round_robin') || norm.includes('round robin')) {
    return { bg: '#DDEBFF', text: '#2563EB', label: 'ROUND ROBIN' };
  }
  if (norm.includes('pool_play') || norm.includes('pool play')) {
    return { bg: '#EAE4FC', text: '#7C3AED', label: 'POOL PLAY' };
  }
  if (norm.includes('scramble')) {
    return { bg: '#E2F1E8', text: '#176B59', label: 'SCRAMBLE' };
  }
  return { bg: '#DDEBFF', text: '#2563EB', label: (label || format).toUpperCase() };
}

function getBannerImage(tournament: TournamentCardData, index = 0) {
  const normalizedName = (tournament.name || '').toLowerCase();
  const normalizedFormat = (tournament.format || '').toLowerCase();

  if (normalizedName.includes('summer slam') || normalizedFormat === 'bracket') {
    return require('../../../assets/tournaments/banner1.jpg');
  } else if (normalizedName.includes('pool play') || normalizedFormat === 'pool_play') {
    return require('../../../assets/tournaments/banner3.jpg');
  } else if (normalizedName.includes('round robin') || normalizedFormat === 'round_robin') {
    return require('../../../assets/tournaments/banner2.jpg');
  } else {
    const banners = [
      require('../../../assets/tournaments/banner1.jpg'),
      require('../../../assets/tournaments/banner2.jpg'),
      require('../../../assets/tournaments/banner3.jpg'),
    ];
    return banners[index % banners.length];
  }
}

export function TournamentCard({
  tournament,
  index = 0,
  onPress,
  onOptionsPress,
  onPublishPress,
  onCloseRegistrationPress,
  actionLabel,
}: TournamentCardProps) {
  const targetScore = tournament.scoring_rules?.target_score ?? 11;
  const winBy = tournament.scoring_rules?.win_by ?? 2;
  const dateRange = formatTournamentDateRange(tournament.start_date, tournament.end_date);

  const statusLower = String(tournament.status).toLowerCase();
  const isDraft = statusLower === 'draft';
  const isRegistrationOpen = statusLower === 'registration_open' || statusLower === 'open';
  const isCompleted = statusLower === 'completed';

  const defaultActionLabel = isCompleted ? 'View Results' : 'Manage';
  const resolvedActionLabel = actionLabel || defaultActionLabel;

  const statusBadge = getStatusBadgeStyle(tournament.status);
  const formatBadge = getFormatBadgeStyle(tournament.format || '', tournament.format_label);
  const banner = getBannerImage(tournament, index);
  const parsed = parseTournamentConfig(tournament as any);
  const entryLabel = parsed?.capacity?.entryLabel ? `${parsed.capacity.entryLabel.toLowerCase()} ` : '';

  return (
    <TouchableOpacity
      style={styles.cardContainer}
      activeOpacity={0.93}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${resolvedActionLabel} ${tournament.name}`}
    >
      {/* ─── Top: Hero Banner (Consistent 142px across all formats) ─────────── */}
      <View style={styles.heroBanner}>
        {/* Background Image: object-fit cover, zero gaps */}
        <Image source={banner} style={styles.bannerImage} resizeMode="cover" />

        {/* Subtle Darkening Overlay for text contrast across all court images */}
        <View style={styles.darkScrim} />

        {/* Top Badges & Actions Row */}
        <View style={styles.heroTopRow}>
          <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
            <AppText style={[styles.statusBadgeText, { color: statusBadge.text }]}>
              {statusBadge.label}
            </AppText>
          </View>

          {onOptionsPress && (
            <TouchableOpacity
              onPress={onOptionsPress}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.moreBtn}
              accessibilityLabel="Tournament options"
            >
              <MoreVertical size={16} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Content & Action Row */}
        <View style={styles.heroContentRow}>
          <View style={styles.heroTextContainer}>
            <AppText style={styles.tournamentTitle} numberOfLines={1}>
              {tournament.name}
            </AppText>

            {tournament.description ? (
              <AppText style={styles.tournamentDesc} numberOfLines={2}>
                {tournament.description}
              </AppText>
            ) : null}
          </View>

          {/* Manage Button on banner */}
          <TouchableOpacity
            style={styles.manageBtn}
            onPress={onPress}
            activeOpacity={0.8}
            accessibilityLabel={`${resolvedActionLabel} ${tournament.name}`}
          >
            <AppText style={styles.manageBtnText}>{resolvedActionLabel} →</AppText>
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── Bottom: Clean White Information Area ─────────────────────────── */}
      <View style={styles.infoArea}>
        {/* Row 1: Calendar & Format Badge */}
        <View style={styles.infoRowBetween}>
          <View style={styles.infoGroup}>
            <Calendar size={15} color="#657776" style={styles.infoIcon} />
            <AppText style={styles.infoText}>{dateRange}</AppText>
          </View>

          <View style={[styles.formatBadge, { backgroundColor: formatBadge.bg }]}>
            <AppText style={[styles.formatBadgeText, { color: formatBadge.text }]}>
              {formatBadge.label}
            </AppText>
          </View>
        </View>

        {/* Row 2: Participants */}
        <View style={styles.infoRow}>
          <Users size={15} color="#657776" style={styles.infoIcon} />
          <AppText style={styles.infoText}>
            {tournament.participant_count} / {tournament.max_participants ?? '∞'} {entryLabel}registered
          </AppText>
        </View>

        {/* Row 3: Scoring Rules on left & Actions on bottom-right */}
        <View style={styles.scoringRow}>
          <View style={styles.scoringGroup}>
            <Target size={15} color="#657776" style={styles.infoIcon} />
            <AppText style={styles.infoText}>
              First to {targetScore} (win by {winBy})
            </AppText>
          </View>

          {isDraft && onPublishPress && (
            <TouchableOpacity
              style={styles.bottomPublishBtn}
              onPress={onPublishPress}
              activeOpacity={0.8}
              accessibilityLabel={`Publish and open registration for ${tournament.name}`}
            >
              <AppText style={styles.bottomPublishBtnText}>Publish & Open</AppText>
            </TouchableOpacity>
          )}

          {isRegistrationOpen && onCloseRegistrationPress && (
            <TouchableOpacity
              style={styles.bottomCloseRegBtn}
              onPress={onCloseRegistrationPress}
              activeOpacity={0.8}
              accessibilityLabel={`Close registration for ${tournament.name}`}
            >
              <AppText style={styles.bottomCloseRegBtnText}>Close Reg</AppText>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E1E8E4',
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },

  // Hero Banner (Standardized 142px height for all formats)
  heroBanner: {
    position: 'relative',
    height: 142,
    minHeight: 142,
    maxHeight: 142,
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 12,
    justifyContent: 'space-between',
    backgroundColor: '#0F2C24',
    overflow: 'hidden',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  bannerImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: 142,
  },
  darkScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 26, 20, 0.44)',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  moreBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroContentRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
    zIndex: 2,
  },
  heroTextContainer: {
    flex: 1,
    paddingRight: 4,
  },
  tournamentTitle: {
    fontSize: 18.5,
    fontWeight: '700',
    lineHeight: 22.5,
    letterSpacing: -0.2,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  tournamentDesc: {
    fontSize: 11.5,
    lineHeight: 15,
    marginTop: 3,
    color: 'rgba(255, 255, 255, 0.92)',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // Manage Button on Banner
  manageBtn: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 5.5,
    paddingHorizontal: 13,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
    flexShrink: 0,
    alignSelf: 'flex-end',
  },
  manageBtnText: {
    color: '#087A60',
    fontSize: 12,
    fontWeight: '700',
  },

  // Bottom Information Area
  infoArea: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 8,
  },
  infoRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  infoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoIcon: {
    flexShrink: 0,
  },
  infoText: {
    fontSize: 13.5,
    color: '#2D3748',
    fontWeight: '500',
    flexShrink: 1,
  },
  formatBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 10,
    flexShrink: 0,
  },
  formatBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  // Row 3: Scoring Rules & Bottom-Right Publish Action
  scoringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  scoringGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    minWidth: 160,
  },
  bottomPublishBtn: {
    backgroundColor: '#087A60',
    paddingVertical: 6,
    paddingHorizontal: 13,
    borderRadius: 8,
    shadowColor: '#087A60',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
    marginLeft: 'auto',
  },
  bottomPublishBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  bottomCloseRegBtn: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 'auto',
  },
  bottomCloseRegBtnText: {
    color: '#E11D48',
    fontSize: 12,
    fontWeight: '700',
  },
});
