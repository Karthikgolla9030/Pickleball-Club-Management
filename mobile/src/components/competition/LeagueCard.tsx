/**
 * Aught2 Pickleball — LeagueCard Component
 *
 * Exact visual match to Screen 1 of reference mockup:
 * - Left column: Square court thumbnail image (rounded corners)
 * - Right column:
 *   - Top row: Status pill (● REGISTRATION OPEN / CLOSED / IN PROGRESS / COMPLETED) + 3-dot ⋮ menu
 *   - League title (bold navy text)
 *   - Subtitle: {weeks} Weeks • {teams} Teams • {Singles/Doubles}
 *   - Trophy line: Top {N} to Playoffs
 *   - Registration / Week Progress bar
 *   - Calendar date line (e.g. Closes May 15, 2026 / Registration closed / Active Week 1 of 4 / Completed)
 * - Entire card touchable with comfortable touch target and soft shadow
 */

import React from 'react';
import {
  Image,
  ImageSourcePropType,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar, MoreVertical, Trophy, Users } from 'lucide-react-native';

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

export function getStatusBadgeConfig(status: LeagueStatus | string, display?: string): StatusBadgeConfig {
  const norm = String(status || '').toLowerCase();
  switch (norm) {
    case 'in_progress':
      return {
        label: 'IN PROGRESS',
        bg: '#FEF3C7',
        text: '#D97706',
      };
    case 'playoffs':
      return {
        label: 'PLAYOFFS',
        bg: '#EAE4FC',
        text: '#7C3AED',
      };
    case 'registration_open':
    case 'open':
      return {
        label: 'REGISTRATION OPEN',
        bg: '#E3F3EA',
        text: '#18794E',
      };
    case 'registration_closed':
    case 'closed':
      return {
        label: 'REGISTRATION CLOSED',
        bg: '#DBEAFE',
        text: '#1D4ED8',
      };
    case 'draft':
      return {
        label: 'DRAFT',
        bg: '#FFF3D6',
        text: '#B45309',
      };
    case 'completed':
      return {
        label: 'COMPLETED',
        bg: '#F1F5F9',
        text: '#475569',
      };
    case 'cancelled':
      return {
        label: 'CANCELLED',
        bg: '#FFD8D8',
        text: '#DC2626',
      };
    default:
      return {
        label: (display || status || 'LEAGUE').toUpperCase(),
        bg: '#E2EAE6',
        text: '#475569',
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
  const totalWeeks = league.number_of_weeks || 4;
  const currentWeek = league.current_week || 1;
  const teamCount = league.teams_count ?? 0;
  const maxTeams = league.max_teams || 8;
  const formatLabel = (league.team_size ?? 2) === 1 ? 'Singles' : 'Doubles';

  // Compute progress percentage
  let progressPct = 0;
  if (league.status === 'completed' || league.status === 'playoffs') {
    progressPct = 100;
  } else if (league.status === 'registration_open') {
    progressPct = maxTeams > 0 ? Math.min(100, Math.round((teamCount / maxTeams) * 100)) : 50;
  } else if (league.status === 'registration_closed') {
    progressPct = 100;
  } else if (totalWeeks > 0) {
    progressPct = Math.min(100, Math.round((currentWeek / totalWeeks) * 100));
  }

  // Image source cycle
  const imgSource = LEAGUE_CARD_IMAGES[Math.abs(imageIndex) % LEAGUE_CARD_IMAGES.length];
  const badgeConfig = getStatusBadgeConfig(league.status, league.status_display);

  const formatCardDate = (dateStr?: string | null): string => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    } catch {
      return dateStr;
    }
  };

  const getDaysRemaining = (dateStr?: string | null): number | null => {
    if (!dateStr) return null;
    try {
      const diffMs = new Date(dateStr).getTime() - Date.now();
      return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    } catch {
      return null;
    }
  };

  const daysLeft = getDaysRemaining(league.registration_close_at);
  const closeDateFormatted = formatCardDate(league.registration_close_at);

  return (
    <TouchableOpacity
      style={styles.cardContainer}
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`League: ${league.name}`}
    >
      <View style={styles.topSection}>
        {/* Left Column: Image Thumbnail */}
        <View style={styles.imageWrapper}>
          <Image source={imgSource} style={styles.thumbnail} resizeMode="cover" />
        </View>

        {/* Right Column: Title, Status, Metadata, Progress Bar */}
        <View style={styles.detailsColumn}>
          {/* Status Pill & 3-Dot Options Trigger */}
          <View style={styles.headerRow}>
            <View style={[styles.statusPill, { backgroundColor: badgeConfig.bg }]}>
              <View style={[styles.statusDot, { backgroundColor: badgeConfig.text }]} />
              <AppText style={[styles.statusPillText, { color: badgeConfig.text }]}>
                {badgeConfig.label}
              </AppText>
            </View>

            {onOptionsPress && (
              <TouchableOpacity
                onPress={onOptionsPress}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.optionsButton}
                accessibilityRole="button"
                accessibilityLabel="League options menu"
              >
                <MoreVertical size={16} color="#6B7280" strokeWidth={2.2} />
              </TouchableOpacity>
            )}
          </View>

          {/* League Title */}
          <AppText style={styles.leagueName} numberOfLines={1}>
            {league.name}
          </AppText>

          {/* Subtitle: Weeks • Teams • Format */}
          <AppText style={styles.subtitleText} numberOfLines={1}>
            {`${totalWeeks} Weeks • ${maxTeams} Teams • ${formatLabel}`}
          </AppText>

          {/* Playoff Spots line */}
          <View style={styles.metaRow}>
            <Trophy size={11} color="#6B7280" style={styles.metaIcon} />
            <AppText style={styles.metaText}>
              Top {league.playoff_team_count || 4} to Playoffs
            </AppText>
          </View>

          {/* Registration / Active Progress Section */}
          {league.status === 'registration_open' ? (
            <View style={styles.progressBlock}>
              <View style={styles.metaRow}>
                <Users size={11} color="#6B7280" style={styles.metaIcon} />
                <AppText style={styles.metaText}>
                  {`${teamCount} / ${maxTeams} Teams Registered`}
                </AppText>
              </View>

              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
              </View>

              <View style={styles.metaRow}>
                <Calendar size={11} color={daysLeft && daysLeft <= 3 ? '#DC2626' : '#6B7280'} style={styles.metaIcon} />
                <AppText
                  style={[
                    styles.dateText,
                    Boolean(daysLeft !== null && daysLeft <= 3) && styles.urgentDateText,
                  ]}
                  numberOfLines={1}
                >
                  {closeDateFormatted
                    ? `Closes ${closeDateFormatted}${daysLeft !== null ? ` (${daysLeft} days left)` : ''}`
                    : 'Open for Registration'}
                </AppText>
              </View>
            </View>
          ) : league.status === 'registration_closed' ? (
            <View style={styles.progressBlock}>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: '100%' }]} />
              </View>
              <View style={styles.metaRow}>
                <Calendar size={11} color="#6B7280" style={styles.metaIcon} />
                <AppText style={styles.dateText}>
                  {closeDateFormatted ? `Registration closed ${closeDateFormatted}` : 'Registration closed'}
                </AppText>
              </View>
            </View>
          ) : league.status === 'in_progress' ? (
            <View style={styles.progressBlock}>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
              </View>
              <View style={styles.metaRow}>
                <Calendar size={11} color="#6B7280" style={styles.metaIcon} />
                <AppText style={styles.dateText}>
                  Active Week {currentWeek} of {totalWeeks}
                </AppText>
              </View>
            </View>
          ) : league.status === 'completed' ? (
            <View style={styles.progressBlock}>
              <View style={styles.metaRow}>
                <Calendar size={11} color="#6B7280" style={styles.metaIcon} />
                <AppText style={styles.dateText}>
                  {league.updated_at ? `Completed on ${formatCardDate(league.updated_at)}` : 'Completed'}
                </AppText>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  topSection: {
    flexDirection: 'row',
    gap: 12,
  },
  imageWrapper: {
    width: 90,
    height: 90,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  detailsColumn: {
    flex: 1,
    justifyContent: 'space-between',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    gap: 4.5,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusPillText: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  optionsButton: {
    padding: 2,
  },
  leagueName: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 20,
    marginBottom: 2,
  },
  subtitleText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '400',
    marginBottom: 3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  metaIcon: {
    flexShrink: 0,
  },
  metaText: {
    fontSize: 11.5,
    color: '#4B5563',
    fontWeight: '400',
  },
  progressBlock: {
    marginTop: 4,
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
    marginVertical: 4,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 2,
  },
  dateText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '400',
  },
  urgentDateText: {
    color: '#DC2626',
    fontWeight: '500',
  },
});
