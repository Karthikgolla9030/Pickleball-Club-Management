/**
 * Aught2 Pickleball — LeagueCard Component
 *
 * Exact visual match to Screen 1 of reference mockup:
 * - Rounded white card with subtle border & soft shadow
 * - Sports thumbnail on the left (104x104, rounded corners)
 * - Status pill with icon/dot on the right + chevron
 * - League title (bold text, natural wrap)
 * - Subtitle: {weeks} Weeks • {teams} Teams • {format}
 * - Contextual bottom row:
 *   - For Live: "Week X of Y", "N of Total matches", "%", teal progress bar
 *   - For Upcoming: "Starts Mon, 5 Oct 2026"
 *   - For Open Registration: "Registration closes 15 Sep 2026"
 *   - For Registration Closed: "Registration closed 1 Aug 2026"
 *   - For Completed: "Completed on {date}"
 * - Contextual primary action (Register / Show Details / View Live League / View Results)
 */

import React from 'react';
import {
  Image,
  ImageSourcePropType,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Lock,
  Trophy,
  Users,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Colors, Radius, Shadows, Spacing } from '@/theme';
import type { LeagueStatus, LeagueSummary } from '@/types';
import { formatDate } from '@/utils/formatters';

const LEAGUE_CARD_IMAGES: ImageSourcePropType[] = [
  require('../../../assets/leagues/card1.jpg'),
  require('../../../assets/leagues/card2.jpg'),
  require('../../../assets/leagues/card3.jpg'),
  require('../../../assets/leagues/card1_crop.jpg'),
];

export interface LeagueCardProps {
  league: LeagueSummary;
  onPress: () => void;
  onRegisterPress?: () => void;
  onViewRegistrationPress?: () => void;
  imageIndex?: number;
  onOptionsPress?: () => void;
  onManagePress?: () => void;
  actionLabel?: string;
}

interface StatusConfig {
  label: string;
  bg: string;
  text: string;
  dotColor?: string;
  icon?: 'dot' | 'clock' | 'users' | 'lock' | 'check';
}

export function getAuthoritativeStatusConfig(
  status: LeagueStatus | string,
  regStatus?: string | null
): StatusConfig {
  const norm = String(status || '').toLowerCase();
  const normReg = String(regStatus || '').toLowerCase();

  if (norm === 'in_progress' || norm === 'live') {
    return {
      label: 'LIVE / IN PROGRESS',
      bg: '#DCFCE7',
      text: '#15803D',
      dotColor: '#16A34A',
      icon: 'dot',
    };
  }

  if (norm === 'playoffs') {
    return {
      label: 'PLAYOFFS',
      bg: '#F3E8FF',
      text: '#7E22CE',
      dotColor: '#9333EA',
      icon: 'dot',
    };
  }

  if (norm === 'completed') {
    return {
      label: 'COMPLETED',
      bg: '#F1F5F9',
      text: '#475569',
      icon: 'check',
    };
  }

  if (norm === 'registration_open' || (norm === 'draft' && normReg === 'open') || normReg === 'open') {
    return {
      label: 'OPEN REGISTRATION',
      bg: '#FEF3C7',
      text: '#B45309',
      icon: 'users',
    };
  }

  if (norm === 'registration_closed' || normReg === 'closed') {
    return {
      label: 'REGISTRATION CLOSED',
      bg: '#F1F5F9',
      text: '#64748B',
      icon: 'lock',
    };
  }

  if (norm === 'upcoming' || norm === 'draft' || norm === 'scheduled') {
    return {
      label: 'UPCOMING',
      bg: '#E0F2FE',
      text: '#0284C7',
      icon: 'clock',
    };
  }

  return {
    label: norm.replace(/_/g, ' ').toUpperCase(),
    bg: '#F1F5F9',
    text: '#475569',
    icon: 'dot',
  };
}

export function LeagueCard({
  league,
  onPress,
  onRegisterPress,
  onViewRegistrationPress,
  imageIndex = 0,
}: LeagueCardProps) {
  const totalWeeks = league.total_weeks || league.number_of_weeks || 12;
  const currentWeek = league.current_week || 1;
  const teamCount = league.current_teams_count ?? league.teams_count ?? 0;
  const maxTeams = league.max_teams || 12;
  const formatLabel = (league.team_size ?? 2) === 1 ? 'Singles' : (league.category || 'Doubles');

  const statusConfig = getAuthoritativeStatusConfig(league.status, league.registration_status);
  const isLive = league.status === 'in_progress';
  const isCompleted = league.status === 'completed';
  const isOpenReg = league.status === 'registration_open' || league.registration_status === 'open';
  const isClosedReg = league.status === 'registration_closed' || league.registration_status === 'closed';
  const isUpcoming = league.status === 'draft' && !isOpenReg;
  const isRegistered = Boolean(league.is_registered);

  // Match counts for progress bar
  const totalMatches = league.total_matches_count || (maxTeams * (maxTeams - 1) / 2) || 66;
  const completedMatches = league.completed_matches_count || 0;
  const progressPct = totalMatches > 0 ? Math.min(100, Math.round((completedMatches / totalMatches) * 100)) : 0;

  const imgSource = LEAGUE_CARD_IMAGES[Math.abs(imageIndex) % LEAGUE_CARD_IMAGES.length];

  const formatCardDate = (dateStr?: string | null): string => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch {
      return dateStr;
    }
  };

  const formatShortDate = (dateStr?: string | null): string => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <TouchableOpacity
      style={styles.cardContainer}
      onPress={onPress}
      activeOpacity={0.92}
      accessibilityRole="button"
      accessibilityLabel={`League: ${league.name}`}
    >
      <View style={styles.contentRow}>
        {/* Left Column: Sports Thumbnail */}
        <View style={styles.imageWrapper}>
          <Image source={imgSource} style={styles.thumbnail} resizeMode="cover" />
        </View>

        {/* Right Column: Information & Actions */}
        <View style={styles.detailsColumn}>
          {/* Top Row: Status Badge & Chevron */}
          <View style={styles.topRow}>
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
              {statusConfig.icon === 'dot' && (
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: statusConfig.dotColor || statusConfig.text },
                  ]}
                />
              )}
              {statusConfig.icon === 'clock' && (
                <Clock size={11} color={statusConfig.text} style={styles.badgeIcon} />
              )}
              {statusConfig.icon === 'users' && (
                <Users size={11} color={statusConfig.text} style={styles.badgeIcon} />
              )}
              {statusConfig.icon === 'lock' && (
                <Lock size={11} color={statusConfig.text} style={styles.badgeIcon} />
              )}
              {statusConfig.icon === 'check' && (
                <CheckCircle2 size={11} color={statusConfig.text} style={styles.badgeIcon} />
              )}
              <AppText style={[styles.statusText, { color: statusConfig.text }]}>
                {statusConfig.label}
              </AppText>
            </View>

            <ChevronRight size={18} color="#94A3B8" />
          </View>

          {/* League Title */}
          <AppText style={styles.leagueName} numberOfLines={2}>
            {league.name}
          </AppText>

          {/* Subtitle: Weeks • Teams • Format */}
          <AppText style={styles.subtitleText} numberOfLines={1}>
            {`${totalWeeks} Weeks  •  ${maxTeams || teamCount} Teams  •  ${formatLabel}`}
          </AppText>

          {/* Progress / Contextual Dates */}
          {isLive ? (
            <View style={styles.liveProgressContainer}>
              <View style={styles.progressLabelRow}>
                <AppText style={styles.progressWeekText}>
                  Week {currentWeek} of {totalWeeks}
                </AppText>
                <AppText style={styles.progressMatchesText}>
                  {completedMatches} of {totalMatches} matches{'   '}
                  <AppText style={styles.progressPctText}>{progressPct}%</AppText>
                </AppText>
              </View>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${Math.max(4, progressPct)}%` }]} />
              </View>
            </View>
          ) : isUpcoming ? (
            <View style={styles.dateRow}>
              <AppText style={styles.dateText}>
                Starts {formatCardDate(league.start_date) || 'Coming Soon'}
              </AppText>
            </View>
          ) : isOpenReg ? (
            <View style={styles.dateRow}>
              <AppText style={styles.dateText}>
                {league.registration_close_at
                  ? `Registration closes ${formatShortDate(league.registration_close_at)}`
                  : 'Open for registration'}
              </AppText>
            </View>
          ) : isClosedReg ? (
            <View style={styles.dateRow}>
              <AppText style={styles.dateText}>
                {league.registration_close_at
                  ? `Registration closed ${formatShortDate(league.registration_close_at)}`
                  : 'Registration closed'}
              </AppText>
            </View>
          ) : isCompleted ? (
            <View style={styles.dateRow}>
              <AppText style={styles.dateText}>
                Completed {formatShortDate(league.end_date || league.updated_at)}
              </AppText>
            </View>
          ) : null}

          {/* Bottom Contextual Action */}
          <View style={styles.actionRow}>
            {isRegistered ? (
              <TouchableOpacity
                style={styles.registeredButton}
                onPress={onViewRegistrationPress || onPress}
                activeOpacity={0.8}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <CheckCircle2 size={13} color="#065F46" />
                <AppText style={styles.registeredButtonText}>
                  {isLive ? 'View Live League' : 'View Registration Details'}
                </AppText>
              </TouchableOpacity>
            ) : isOpenReg ? (
              <TouchableOpacity
                style={styles.registerButton}
                onPress={onRegisterPress || onPress}
                activeOpacity={0.8}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <AppText style={styles.registerButtonText}>Register</AppText>
              </TouchableOpacity>
            ) : isLive ? (
              <TouchableOpacity
                style={styles.liveButton}
                onPress={onPress}
                activeOpacity={0.8}
              >
                <AppText style={styles.liveButtonText}>View Live League</AppText>
              </TouchableOpacity>
            ) : isCompleted ? (
              <TouchableOpacity
                style={styles.resultsButton}
                onPress={onPress}
                activeOpacity={0.8}
              >
                <AppText style={styles.resultsButtonText}>View Results</AppText>
              </TouchableOpacity>
            ) : null}
          </View>
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
    borderColor: '#E8EFEA',
    padding: 13,
    marginBottom: 14,
    ...Shadows.sm,
  },
  contentRow: {
    flexDirection: 'row',
    gap: 13,
  },
  imageWrapper: {
    width: 104,
    height: 104,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  detailsColumn: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: Radius.full,
    gap: 4.5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeIcon: {
    marginRight: 1,
  },
  statusText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  leagueName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 21,
    marginBottom: 3,
    letterSpacing: -0.2,
  },
  subtitleText: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '500',
    marginBottom: 6,
  },
  liveProgressContainer: {
    marginTop: 2,
    marginBottom: 4,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  progressWeekText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  progressMatchesText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  progressPctText: {
    fontWeight: '800',
    color: '#0D9488',
  },
  progressBarTrack: {
    height: 5,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#0D9488',
    borderRadius: 3,
  },
  dateRow: {
    marginBottom: 4,
  },
  dateText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 4,
  },
  registerButton: {
    backgroundColor: '#065F46',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.md,
  },
  registerButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  registeredButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: Radius.full,
  },
  registeredButtonText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  liveButton: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.md,
  },
  liveButtonText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  resultsButton: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.md,
  },
  resultsButtonText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
});
