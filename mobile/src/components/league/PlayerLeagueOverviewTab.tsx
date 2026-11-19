/**
 * Aught2 Pickleball — PlayerLeagueOverviewTab
 *
 * Clean, single-column premium Overview & Rules tab for League Details:
 * - Card 1: About the League (optional, only rendered if a custom description exists)
 * - Card 2: League Information (clean information rows, muted labels, readable values)
 * - Card 3: Schedule & Venue (start/end dates, frequency, deadline, host club, venue)
 * - Card 4: Game Rules & Scoring (match format, target score, win-by, points, tiebreaker list)
 */

import React, { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import {
  Calendar,
  FileText,
  Scale,
  Tag,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { formatDate } from '@/utils';
import type { LeagueSummary } from '@/types';

export interface PlayerLeagueOverviewTabProps {
  league: LeagueSummary | any;
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
      <AppText style={[styles.infoValue, isTablet && styles.infoValueTablet]}>{value}</AppText>
    </View>
  );
}

export function PlayerLeagueOverviewTab({ league }: PlayerLeagueOverviewTabProps) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const isSingles =
    (league.team_size ?? 2) === 1 ||
    (league.category?.toLowerCase().includes('singles') ?? false);

  const totalWeeks = league.total_weeks || league.number_of_weeks || 12;
  const playoffSpots = league.playoff_team_count || 4;
  const hasPlayoffs = (league.playoff_team_count ?? 0) > 0;

  // Clean description if provided
  const cleanDescription = useMemo(() => {
    if (!league.description) return null;
    const desc = league.description.trim();
    // Strip raw JSON / metadata artifacts if any
    if (desc.startsWith('{') || desc.startsWith('[')) return null;
    return desc.length > 0 ? desc : null;
  }, [league.description]);

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
              About the League
            </AppText>
          </View>
          <AppText style={styles.descriptionText}>{cleanDescription}</AppText>
        </Card>
      ) : null}

      {/* ─── 2. League Information Card ─── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconWrap}>
            <Tag size={15} color="#176B57" />
          </View>
          <AppText variant="body" bold style={styles.cardTitle}>
            League Information
          </AppText>
        </View>

        <View style={styles.rowsList}>
          <InfoRow
            label="Competition Format"
            value={hasPlayoffs ? 'Regular Season + Playoffs' : 'Round Robin League'}
            isTablet={isTablet}
          />
          <InfoRow
            label="Division"
            value={league.category || (isSingles ? 'Singles' : 'Doubles')}
            isTablet={isTablet}
          />
          <InfoRow
            label="Registration Type"
            value={isSingles ? 'Individual (Singles)' : 'Fixed Team (Doubles)'}
            isTablet={isTablet}
          />
          <InfoRow
            label="Season Length"
            value={`${totalWeeks} Weeks`}
            isTablet={isTablet}
          />
          {hasPlayoffs ? (
            <InfoRow
              label="Playoff Qualification"
              value={`Top ${playoffSpots} Advance to Playoffs`}
              isTablet={isTablet}
            />
          ) : null}
          <InfoRow
            label="Maximum Capacity"
            value={`${league.max_teams || 8} ${isSingles ? 'Players' : 'Teams'}`}
            isTablet={isTablet}
          />
          <InfoRow
            label="Skill Eligibility"
            value={league.skill_level || 'Open / All Levels'}
            isTablet={isTablet}
          />
          <InfoRow
            label="Registration Fee"
            value={
              league.registration_fee && league.registration_fee > 0
                ? `$${league.registration_fee.toFixed(2)}`
                : 'Free ($0.00)'
            }
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
            label="Start Date"
            value={league.start_date ? formatDate(league.start_date) : 'TBA'}
            isTablet={isTablet}
          />
          <InfoRow
            label="End Date"
            value={league.end_date ? formatDate(league.end_date) : 'TBA'}
            isTablet={isTablet}
          />
          <InfoRow
            label="Match Frequency"
            value={league.match_frequency || 'Weekly Fixtures'}
            isTablet={isTablet}
          />
          <InfoRow
            label="Registration Deadline"
            value={
              league.registration_close_at
                ? formatDate(league.registration_close_at)
                : league.start_date
                ? `By ${formatDate(league.start_date)}`
                : 'Before Season Start'
            }
            isTablet={isTablet}
          />
          <InfoRow
            label="Host Club"
            value={league.club_name || 'Pickleball Club'}
            isTablet={isTablet}
          />
          <InfoRow
            label="Venue & Courts"
            value={league.venue_name || league.location || 'Dedicated Pickleball Courts'}
            isTablet={isTablet}
            isLast
          />
        </View>
      </Card>

      {/* ─── 4. Game Rules & Scoring Card ─── */}
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
            value={league.match_format || 'Best 2 of 3 Games'}
            isTablet={isTablet}
          />
          <InfoRow
            label="Target Score"
            value={league.target_score || '11 Points'}
            isTablet={isTablet}
          />
          <InfoRow
            label="Win-by Margin"
            value={league.win_by ? `${league.win_by} Points` : 'Win by 2'}
            isTablet={isTablet}
          />
          <InfoRow
            label="Standings Points"
            value={league.standings_points || 'Win: 2 pts · Loss: 0 pts'}
            isTablet={isTablet}
          />
          {hasPlayoffs ? (
            <InfoRow
              label="Playoff Format"
              value={league.playoff_format || 'Single Elimination Bracket'}
              isTablet={isTablet}
            />
          ) : null}

          {/* Compact Tiebreaker Order Box */}
          <View style={styles.tiebreakerBox}>
            <AppText style={styles.tiebreakerHeader}>Tiebreaker Hierarchy</AppText>
            <View style={styles.tiebreakerList}>
              <AppText style={styles.tiebreakerItem}>1. Head-to-Head record</AppText>
              <AppText style={styles.tiebreakerItem}>2. Point differential (+/-)</AppText>
              <AppText style={styles.tiebreakerItem}>3. Total points scored</AppText>
              <AppText style={styles.tiebreakerItem}>4. Total matches won</AppText>
            </View>
          </View>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
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
});
