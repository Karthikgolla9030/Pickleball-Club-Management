/**
 * Aught2 Pickleball — Redesigned LeagueCard Component
 *
 * Exact visual match to reference design:
 * - Left column: Court thumbnail with overlaid status badge (DRAFT, PLAYOFFS, IN PROGRESS, COMPLETED)
 * - Right column: Title, three-dot menu, calendar duration, users team count, progress bar with percentage and stage
 * - Bottom action row: "View Details >" touchable link + outlined "Manage" button
 * - Zero text truncation / no ellipsis on titles or metadata
 */

import React from 'react';
import {
  Image,
  ImageSourcePropType,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar, ChevronRight, MoreVertical, Users } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import type { LeagueStatus, LeagueSummary } from '@/types';

const LEAGUE_CARD_IMAGES: ImageSourcePropType[] = [
  require('../../../assets/leagues/card1.jpg'),
  require('../../../assets/leagues/card2.jpg'),
  require('../../../assets/leagues/card3.jpg'),
];

export interface LeagueCardProps {
  league: LeagueSummary;
  onPress: () => void;
  actionLabel?: string;
  imageIndex?: number;
  onManagePress?: () => void;
  onOptionsPress?: () => void;
}

interface StatusBadgeConfig {
  label: string;
  bg: string;
  text: string;
}

function getStatusBadgeConfig(status: LeagueStatus, display?: string): StatusBadgeConfig {
  switch (status) {
    case 'draft':
      return {
        label: 'DRAFT',
        bg: '#FFF3D0',
        text: '#8C6500',
      };
    case 'playoffs':
      return {
        label: 'PLAYOFFS',
        bg: '#E8F1FB',
        text: '#1D4ED8',
      };
    case 'in_progress':
      return {
        label: 'IN PROGRESS',
        bg: '#E5F5EC',
        text: '#176B59',
      };
    case 'registration_open':
      return {
        label: 'OPEN',
        bg: '#E5F5EC',
        text: '#176B59',
      };
    case 'completed':
      return {
        label: 'COMPLETED',
        bg: '#E2EAE6',
        text: '#475569',
      };
    case 'cancelled':
      return {
        label: 'CANCELLED',
        bg: '#FEE2E2',
        text: '#B91C1C',
      };
    default:
      return {
        label: (display || status || 'LEAGUE').toUpperCase(),
        bg: '#E8F5E9',
        text: '#176B59',
      };
  }
}

export function LeagueCard({
  league,
  onPress,
  actionLabel = 'Manage',
  imageIndex = 0,
  onManagePress,
  onOptionsPress,
}: LeagueCardProps) {
  const regWeeks = Math.max(0, (league.number_of_weeks || 4) - 1);
  const totalWeeks = league.number_of_weeks || 4;
  const currentWeek = league.current_week || (league.status === 'draft' ? 1 : 1);

  // Compute progress percentage
  let progressPct = 0;
  if (league.status === 'completed' || league.status === 'playoffs') {
    progressPct = 100;
  } else if (totalWeeks > 0) {
    progressPct = Math.min(100, Math.max(0, Math.round((currentWeek / totalWeeks) * 100)));
  }

  // Compute stage label
  let stageLabel = `Week ${currentWeek} of ${totalWeeks}`;
  if (league.status === 'playoffs') {
    stageLabel = 'Playoffs';
  } else if (league.status === 'completed') {
    stageLabel = 'Completed';
  }

  // Image source cycle
  const imgSource = LEAGUE_CARD_IMAGES[Math.abs(imageIndex) % LEAGUE_CARD_IMAGES.length];
  const badgeConfig = getStatusBadgeConfig(league.status, league.status_display);

  return (
    <View style={styles.cardContainer}>
      {/* Top Section: Left Thumbnail + Right Metadata */}
      <View style={styles.topSection}>
        {/* Left Column: Image Thumbnail with Status Badge */}
        <View style={styles.imageWrapper}>
          <Image source={imgSource} style={styles.thumbnail} resizeMode="cover" />
          <View style={[styles.statusBadge, { backgroundColor: badgeConfig.bg }]}>
            <AppText style={[styles.statusBadgeText, { color: badgeConfig.text }]}>
              {badgeConfig.label}
            </AppText>
          </View>
        </View>

        {/* Right Column: Title, Metadata, Progress Bar */}
        <View style={styles.detailsColumn}>
          {/* Header Row: Title & Options Menu */}
          <View style={styles.titleRow}>
            <AppText style={styles.leagueName}>
              {league.name}
            </AppText>
            <TouchableOpacity
              onPress={onOptionsPress || onPress}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.optionsButton}
              accessibilityRole="button"
              accessibilityLabel="Options"
            >
              <MoreVertical size={16} color="#61736F" />
            </TouchableOpacity>
          </View>

          {/* Metadata Row 1: Duration */}
          <View style={styles.metaRow}>
            <Calendar size={13} color="#61736F" style={styles.metaIcon} />
            <AppText style={styles.metaText}>
              {regWeeks > 0
                ? `${totalWeeks} Weeks (${regWeeks} Reg + 1 Playoff)`
                : `${totalWeeks} Weeks`}
            </AppText>
          </View>

          {/* Metadata Row 2: Teams */}
          <View style={styles.metaRow}>
            <Users size={13} color="#61736F" style={styles.metaIcon} />
            <AppText style={styles.metaText}>
              {league.teams_count > 0
                ? `${league.teams_count} Teams (Top ${league.playoff_team_count || 4} Playoffs)`
                : `Teams (Top ${league.playoff_team_count || 4} Playoffs)`}
            </AppText>
          </View>

          {/* Progress Section */}
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <AppText style={styles.progressLabel}>Progress</AppText>
              <AppText style={styles.progressPctText}>{progressPct}%</AppText>
            </View>

            {/* Progress Bar Track */}
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
            </View>

            {/* Stage Indicator */}
            <AppText style={styles.stageText}>{stageLabel}</AppText>
          </View>
        </View>
      </View>

      {/* Champion Banner (Concluded League) */}
      {league.champion_team ? (
        <View style={styles.championBanner}>
          <AppText style={styles.championText}>
            🏆 Champion: {league.champion_team.name}
          </AppText>
        </View>
      ) : null}

      {/* Bottom Action Row: View Details Link & Manage Button */}
      <View style={styles.bottomActionRow}>
        <TouchableOpacity
          onPress={onPress}
          style={styles.viewDetailsTouchable}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="View League Details"
        >
          <AppText style={styles.viewDetailsText}>View Details</AppText>
          <ChevronRight size={14} color="#102F2A" style={styles.chevronIcon} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onManagePress || onPress}
          style={styles.manageButton}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Manage League"
        >
          <AppText style={styles.manageButtonText}>
            {actionLabel.replace(/[›>]/g, '').trim()}
          </AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E1E8E4',
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  topSection: {
    flexDirection: 'row',
    gap: 12,
  },
  imageWrapper: {
    width: 114,
    height: 106,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#EAF0EC',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  statusBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 5,
  },
  statusBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  detailsColumn: {
    flex: 1,
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 4,
  },
  leagueName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#102F2A',
    lineHeight: 20,
  },
  optionsButton: {
    padding: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  metaIcon: {
    flexShrink: 0,
  },
  metaText: {
    flex: 1,
    fontSize: 11.5,
    color: '#61736F',
    fontWeight: '400',
    lineHeight: 15,
  },
  progressSection: {
    marginTop: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 11,
    color: '#61736F',
    fontWeight: '500',
  },
  progressPctText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#102F2A',
  },
  progressTrack: {
    height: 5,
    backgroundColor: '#E5EAE7',
    borderRadius: 2.5,
    overflow: 'hidden',
    marginVertical: 3.5,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#176B59',
    borderRadius: 2.5,
  },
  stageText: {
    fontSize: 10.5,
    color: '#61736F',
    textAlign: 'right',
  },
  championBanner: {
    marginTop: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: '#E7F5EC',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBE5D7',
  },
  championText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#176B59',
  },
  bottomActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F2F6F4',
  },
  viewDetailsTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  viewDetailsText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#102F2A',
  },
  chevronIcon: {
    marginTop: 1,
  },
  manageButton: {
    backgroundColor: '#F3F9F6',
    borderWidth: 1,
    borderColor: '#C6DFD2',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 16,
  },
  manageButtonText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#176B59',
  },
});
