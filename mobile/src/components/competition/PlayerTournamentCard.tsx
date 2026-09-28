/**
 * Aught2 Pickleball — PlayerTournamentCard Component
 *
 * Clean, minimal & professional tournament card for player discovery.
 * Displays ONLY essential information:
 *   1. Full-width tournament banner image with status & format badges
 *   2. Tournament name (prominent, max 2 lines)
 *   3. Skill level (subtle pill, e.g. "3.5 Level")
 *   4. Calendar icon with tournament date or date range
 *   5. Contextual single action button matching lifecycle:
 *      - "Register Now →" (Registration open)
 *      - "Registered · Show Details" (Already registered player)
 *      - "View Tournament →" (Live · In Progress)
 *      - "View Results →" (Completed)
 *      - "Registration Opens Soon" (Upcoming)
 *
 * All detailed descriptions, rules, capacity counts, venue and scoring rules
 * are intentionally omitted here as they are fully available on the details page.
 */

import React, { useMemo } from 'react';
import {
  Image,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Heart,
  Lock,
  Radio,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Shadows } from '@/theme';
import type { TournamentDiscoveryItem, TournamentFormat } from '@/types';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';

export interface PlayerTournamentCardProps {
  tournament: TournamentDiscoveryItem;
  index?: number;
  isFavorite?: boolean;
  isRegistered?: boolean;
  registrationStatus?: string | null;
  onToggleFavorite?: () => void;
  onPress?: () => void;
  onActionPress?: () => void;
}

// Format-specific authentic court imagery
const COURT_IMAGES = {
  pool_play: require('../../../assets/tournaments/card_pool_play.jpg'),
  round_robin: require('../../../assets/tournaments/card_round_robin.jpg'),
  bracket: require('../../../assets/tournaments/card_bracket.jpg'),
  scramble: require('../../../assets/tournaments/banner2.jpg'),
};

function getCardImage(format: TournamentFormat, index: number) {
  if (format === 'pool_play') return COURT_IMAGES.pool_play;
  if (format === 'round_robin') return COURT_IMAGES.round_robin;
  if (format === 'bracket') return COURT_IMAGES.bracket;
  if (format === 'scramble') return COURT_IMAGES.scramble;
  const fallbacks = [COURT_IMAGES.pool_play, COURT_IMAGES.round_robin, COURT_IMAGES.bracket, COURT_IMAGES.scramble];
  return fallbacks[index % fallbacks.length];
}

function formatTournamentDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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

export function PlayerTournamentCard({
  tournament,
  index = 0,
  isFavorite = false,
  isRegistered: isRegisteredProp,
  registrationStatus: registrationStatusProp,
  onToggleFavorite,
  onPress,
  onActionPress,
}: PlayerTournamentCardProps) {
  const isRegistered = isRegisteredProp ?? Boolean(tournament.is_registered);
  const regStatus = registrationStatusProp ?? tournament.my_registration_status;
  const format = tournament.format;
  const status = tournament.status;

  // Format badge styling matching reference colors
  const getFormatBadge = (fmt: TournamentFormat) => {
    switch (fmt) {
      case 'pool_play':
        return { label: 'POOL PLAY', bg: '#EDE9FE', text: '#7C3AED' };
      case 'round_robin':
        return { label: 'ROUND ROBIN', bg: '#DBEAFE', text: '#1D4ED8' };
      case 'bracket':
        return { label: 'BRACKET', bg: '#FFEDD5', text: '#EA580C' };
      case 'scramble':
        return { label: 'SCRAMBLE', bg: '#DCFCE7', text: '#15803D' };
      default:
        return { label: String(fmt || 'TOURNAMENT').toUpperCase(), bg: '#EDE9FE', text: '#7C3AED' };
    }
  };

  const formatBadge = getFormatBadge(format);
  const parsed = useMemo(() => parseTournamentConfig(tournament), [tournament]);
  const entryLabel = parsed?.capacity?.entryLabel ? `${parsed.capacity.entryLabel.toLowerCase()} ` : '';

  // Primary Status Categories
  const isCancelled = status === 'cancelled';
  const isCompleted = status === 'completed';
  const isLive = status === 'in_progress';
  const isRegClosed = status === 'registration_closed';

  const now = new Date();
  const regOpenAt = tournament.registration_open_at ? new Date(tournament.registration_open_at) : null;
  const regCloseAt = tournament.registration_close_at ? new Date(tournament.registration_close_at) : null;

  // Upcoming: Published by club, but opening time is in the future
  const isUpcoming =
    !isCancelled &&
    !isCompleted &&
    !isLive &&
    !isRegClosed &&
    status !== 'draft' &&
    ((regOpenAt ? regOpenAt > now : false) ||
      (!tournament.is_registration_open && status !== 'registration_open'));

  // Registration open: Published, registration enabled, opening time reached, deadline not passed
  const isRegOpen =
    !isCancelled &&
    !isCompleted &&
    !isLive &&
    !isRegClosed &&
    !isUpcoming &&
    (status === 'registration_open' || tournament.is_registration_open) &&
    (regCloseAt ? regCloseAt >= now : true);

  const maxCap = tournament.max_participants || 16;
  const currentCount = tournament.participant_count || 0;
  const isFull = maxCap > 0 && currentCount >= maxCap;

  const imageSource = getCardImage(format, index);

  // Status Badge rendered on the top-left of the banner image
  const renderStatusBadge = () => {
    if (isRegOpen) {
      return (
        <View style={styles.statusBadgeRegOpen}>
          <UserPlus size={11} color="#FFFFFF" style={{ marginRight: 4 }} strokeWidth={2.4} />
          <AppText style={styles.statusBadgeTextWhite}>Registration Open</AppText>
        </View>
      );
    }
    if (isLive) {
      return (
        <View style={styles.statusBadgeLive}>
          <Radio size={11} color="#FFFFFF" style={{ marginRight: 4 }} strokeWidth={2.4} />
          <AppText style={styles.statusBadgeTextWhite}>Live · In Progress</AppText>
        </View>
      );
    }
    if (isCompleted) {
      return (
        <View style={styles.statusBadgeCompleted}>
          <Trophy size={11} color="#FFFFFF" style={{ marginRight: 4 }} strokeWidth={2.2} />
          <AppText style={styles.statusBadgeTextWhite}>Completed</AppText>
        </View>
      );
    }
    if (isUpcoming) {
      return (
        <View style={styles.statusBadgeUpcoming}>
          <Clock size={11} color="#92400E" style={{ marginRight: 4 }} strokeWidth={2.4} />
          <AppText style={styles.statusBadgeTextUpcoming}>Upcoming</AppText>
        </View>
      );
    }
    if (isCancelled) {
      return (
        <View style={styles.statusBadgeCancelled}>
          <AlertTriangle size={11} color="#FFFFFF" style={{ marginRight: 4 }} strokeWidth={2.4} />
          <AppText style={styles.statusBadgeTextWhite}>Cancelled</AppText>
        </View>
      );
    }
    if (isRegClosed) {
      return (
        <View style={styles.statusBadgeClosed}>
          <Lock size={11} color="#FFFFFF" style={{ marginRight: 4 }} strokeWidth={2.4} />
          <AppText style={styles.statusBadgeTextWhite}>Closed</AppText>
        </View>
      );
    }
    return null;
  };

  // Action button rendering matching tournament lifecycle
  const renderActionButton = () => {
    if (isCompleted) {
      return (
        <TouchableOpacity
          style={styles.btnCompleted}
          onPress={onActionPress || onPress}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel={`View results for ${tournament.name}`}
        >
          <Trophy size={14} color="#064E3B" strokeWidth={2.2} style={{ marginRight: 6 }} />
          <AppText style={styles.btnCompletedText}>View Results</AppText>
          <ArrowRight size={14} color="#064E3B" strokeWidth={2.4} style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      );
    }

    if (isLive) {
      return (
        <TouchableOpacity
          style={styles.btnLive}
          onPress={onActionPress || onPress}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel={`View live tournament for ${tournament.name}`}
        >
          <Radio size={14} color="#FFFFFF" strokeWidth={2.2} style={{ marginRight: 6 }} />
          <AppText style={styles.btnLiveText}>View Tournament</AppText>
          <ArrowRight size={14} color="#FFFFFF" strokeWidth={2.4} style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      );
    }

    // If player has already registered, always show "Registered · Show Details"
    if (isRegistered) {
      const isConfirmed = !regStatus || regStatus === 'confirmed';
      const isPending = regStatus === 'pending';
      const isWaitlisted = regStatus === 'waitlisted';

      return (
        <TouchableOpacity
          style={[
            styles.btnRegistered,
            isPending && styles.btnPending,
            isWaitlisted && styles.btnWaitlisted,
          ]}
          onPress={onActionPress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`View registration details for ${tournament.name}`}
        >
          {isConfirmed ? (
            <CheckCircle2 size={15} color="#064E3B" strokeWidth={2.2} style={{ marginRight: 6 }} />
          ) : (
            <Clock size={15} color={isPending ? '#92400E' : '#1E40AF'} strokeWidth={2.2} style={{ marginRight: 6 }} />
          )}
          <AppText
            style={[
              styles.btnRegisteredText,
              isPending && styles.btnPendingText,
              isWaitlisted && styles.btnWaitlistedText,
            ]}
          >
            {isConfirmed
              ? 'Registered · Show Details'
              : isPending
              ? 'Pending · Show Details'
              : 'Waitlisted · Show Details'}
          </AppText>
        </TouchableOpacity>
      );
    }

    if (isUpcoming) {
      return (
        <View style={styles.btnUpcoming}>
          <Clock size={14} color="#92400E" strokeWidth={2.2} style={{ marginRight: 6 }} />
          <AppText style={styles.btnUpcomingText}>Registration Opens Soon</AppText>
        </View>
      );
    }

    if (isCancelled) {
      return (
        <View style={styles.btnCancelled}>
          <AlertTriangle size={14} color="#DC2626" strokeWidth={2.2} style={{ marginRight: 6 }} />
          <AppText style={styles.btnCancelledText}>Tournament Cancelled</AppText>
        </View>
      );
    }

    if (isRegClosed) {
      return (
        <View style={styles.btnClosed}>
          <Lock size={14} color="#64748B" strokeWidth={2.2} style={{ marginRight: 6 }} />
          <AppText style={styles.btnClosedText}>Registration Closed</AppText>
        </View>
      );
    }

    if (isRegOpen) {
      if (isFull) {
        return (
          <View style={styles.btnClosed}>
            <AppText style={styles.btnClosedText}>Tournament Full</AppText>
          </View>
        );
      }

      return (
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={onActionPress || onPress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Register now for ${tournament.name}`}
        >
          <AppText style={styles.btnPrimaryText}>Register Now</AppText>
          <ArrowRight size={14} color="#FFFFFF" strokeWidth={2.4} style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      );
    }

    return null;
  };

  const handleCardPress = onActionPress || onPress;

  return (
    <TouchableOpacity
      style={styles.cardContainer}
      activeOpacity={handleCardPress ? 0.94 : 1}
      onPress={handleCardPress}
      disabled={!handleCardPress}
    >
      {/* ─── Top Banner Area (Image + Status Badge + Format Badge + Favorite) ─── */}
      <View style={styles.bannerContainer}>
        <Image
          source={imageSource}
          style={styles.bannerImage}
          resizeMode="cover"
        />

        {/* Subtle Dark Scrim Overlays for High Contrast Readability */}
        <View style={styles.bannerScrimTop} pointerEvents="none" />
        <View style={styles.bannerScrimBottom} pointerEvents="none" />

        {/* Top-Left: Lifecycle Status Badge */}
        <View style={styles.statusBadgeWrap}>
          {renderStatusBadge()}
        </View>

        {/* Top-Right: Translucent Favorite Heart Button */}
        {onToggleFavorite && (
          <TouchableOpacity
            style={styles.favoriteButton}
            onPress={onToggleFavorite}
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart
              size={15}
              color={isFavorite ? '#EF4444' : '#FFFFFF'}
              fill={isFavorite ? '#EF4444' : 'transparent'}
              strokeWidth={2.2}
            />
          </TouchableOpacity>
        )}

        {/* Bottom-Left: Tournament Format Badge */}
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

      {/* ─── Bottom Info Section: Clean, Minimal & Professional ─── */}
      <View style={styles.infoSection}>
        {/* Row 1: Tournament Name & Skill Level */}
        <View style={styles.titleRow}>
          <AppText variant="body" bold style={styles.titleText} numberOfLines={2}>
            {tournament.name}
          </AppText>
          {parsed.skillLevelDisplay ? (
            <View style={styles.skillPill}>
              <AppText style={styles.skillPillText}>
                Skill Level: {parsed.skillLevelDisplay}
              </AppText>
            </View>
          ) : null}
        </View>

        {/* Row 2: Calendar Icon & Date Range */}
        <View style={styles.dateRow}>
          <Calendar size={13} color="#64748B" strokeWidth={2} style={{ marginRight: 6 }} />
          <AppText style={styles.dateText} numberOfLines={1}>
            {formatTournamentDateRange(tournament.start_date, tournament.end_date)}
          </AppText>
        </View>

        {/* Row 2.5: Capacity & Registered Count */}
        <View style={[styles.dateRow, { marginTop: 4 }]}>
          <Users size={13} color="#64748B" strokeWidth={2} style={{ marginRight: 6 }} />
          <AppText style={styles.dateText}>
            {currentCount} / {maxCap} {entryLabel}registered
          </AppText>
        </View>

        {/* Row 3: Action Button */}
        <View style={styles.actionRow}>
          {renderActionButton()}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginHorizontal: 16,
    marginBottom: 16,
    overflow: 'hidden',
    ...Shadows.sm,
  },

  /* ─── Banner Section ─── */
  bannerContainer: {
    height: 142,
    width: '100%',
    position: 'relative',
    backgroundColor: '#0F172A',
    overflow: 'hidden',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerScrimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 48,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  bannerScrimBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 44,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
  },

  /* ─── Status Badges ─── */
  statusBadgeWrap: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 2,
  },
  statusBadgeRegOpen: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#064E3B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  statusBadgeLive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EA580C',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  statusBadgeCompleted: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  statusBadgeUpcoming: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statusBadgeCancelled: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeClosed: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#475569',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeTextWhite: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  statusBadgeTextUpcoming: {
    color: '#92400E',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  /* ─── Favorite Button ─── */
  favoriteButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },

  /* ─── Format Badge Over Banner ─── */
  formatBadge: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 2,
  },
  formatBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  /* ─── Info Section Below Banner ─── */
  infoSection: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: '#0F172A',
  },
  skillPill: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  skillPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 14,
  },
  dateText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
  },
  actionRow: {
    width: '100%',
  },

  /* ─── Action Buttons ─── */
  btnPrimary: {
    width: '100%',
    height: 42,
    backgroundColor: '#005A36',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#005A36',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  btnPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  btnRegistered: {
    width: '100%',
    height: 42,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnRegisteredText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#064E3B',
  },
  btnPending: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  btnPendingText: {
    color: '#92400E',
  },
  btnWaitlisted: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  btnWaitlistedText: {
    color: '#1E40AF',
  },

  btnLive: {
    width: '100%',
    height: 42,
    backgroundColor: '#EA580C',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#EA580C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  btnLiveText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  btnCompleted: {
    width: '100%',
    height: 42,
    backgroundColor: '#F8FAF9',
    borderWidth: 1.2,
    borderColor: '#064E3B',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnCompletedText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#064E3B',
  },

  btnUpcoming: {
    width: '100%',
    height: 42,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnUpcomingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
  },

  btnCancelled: {
    width: '100%',
    height: 42,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnCancelledText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DC2626',
  },

  btnClosed: {
    width: '100%',
    height: 42,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnClosedText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
});
