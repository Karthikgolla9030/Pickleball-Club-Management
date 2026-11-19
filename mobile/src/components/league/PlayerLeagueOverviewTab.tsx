/**
 * Aught2 Pickleball — PlayerLeagueOverviewTab
 *
 * Clean, modern Overview & Rules tab for League Details:
 * - Card 1: About the League (optional, only rendered if a custom description exists)
 * - Card 2: League Information (compact 2-column layout, muted labels, no redundant icons)
 * - Card 3: Schedule & Venue (start/end dates, frequency, host club, venue/courts)
 * - Card 4: Game Rules & Scoring (match format, target score, standings points, playoff rules, tiebreaker list)
 */

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
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

export function PlayerLeagueOverviewTab({ league }: PlayerLeagueOverviewTabProps) {
  const isSingles =
    (league.team_size ?? 2) === 1 ||
    (league.category?.toLowerCase().includes('singles') ?? false);

  const totalWeeks = league.total_weeks || league.number_of_weeks || 12;
  const playoffSpots = league.playoff_team_count || 4;
  const hasPlayoffs = (league.playoff_team_count ?? 0) > 0;

  // Clean description if provided
  const cleanDescription = useMemo(() => {
    if (!league.description) return null;
    let desc = league.description.trim();
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

        <View style={styles.gridContainer}>
          {/* Row 1: Format | Division */}
          <View style={styles.gridRow}>
            <View style={styles.gridColLeft}>
              <View style={styles.item}>
                <AppText style={styles.label}>Competition Format</AppText>
                <AppText style={styles.value}>
                  {hasPlayoffs ? 'Regular Season + Playoffs' : 'Round Robin League'}
                </AppText>
              </View>
            </View>

            <View style={styles.gridColRight}>
              <View style={styles.item}>
                <AppText style={styles.label}>Division</AppText>
                <AppText style={styles.value}>
                  {league.category || (isSingles ? 'Singles' : 'Doubles')}
                </AppText>
              </View>
            </View>
          </View>

          {/* Row 2: Registration Type | Regular Season */}
          <View style={styles.gridRow}>
            <View style={styles.gridColLeft}>
              <View style={styles.item}>
                <AppText style={styles.label}>Registration Type</AppText>
                <AppText style={styles.value}>
                  {isSingles ? 'Individual (Singles)' : 'Fixed Team (Doubles)'}
                </AppText>
              </View>
            </View>

            <View style={styles.gridColRight}>
              <View style={styles.item}>
                <AppText style={styles.label}>Regular Season</AppText>
                <AppText style={styles.value}>
                  {totalWeeks} Weeks
                </AppText>
              </View>
            </View>
          </View>

          {/* Row 3: Playoff Qualification (if enabled) | Max Capacity */}
          <View style={styles.gridRow}>
            {hasPlayoffs ? (
              <View style={styles.gridColLeft}>
                <View style={styles.item}>
                  <AppText style={styles.label}>Playoff Qualification</AppText>
                  <AppText style={styles.value}>
                    Top {playoffSpots} Advance to Playoffs
                  </AppText>
                </View>
              </View>
            ) : null}

            <View style={hasPlayoffs ? styles.gridColRight : styles.gridColLeft}>
              <View style={styles.item}>
                <AppText style={styles.label}>Max Capacity</AppText>
                <AppText style={styles.value}>
                  {league.max_teams || 8} {isSingles ? 'Players' : 'Teams'}
                </AppText>
              </View>
            </View>
          </View>

          {/* Row 4: Skill Eligibility | Registration Fee */}
          <View style={styles.gridRow}>
            <View style={styles.gridColLeft}>
              <View style={styles.item}>
                <AppText style={styles.label}>Skill Eligibility</AppText>
                <AppText style={styles.value}>
                  {league.skill_level || 'Open / All Levels'}
                </AppText>
              </View>
            </View>

            <View style={styles.gridColRight}>
              <View style={styles.item}>
                <AppText style={styles.label}>Registration Fee</AppText>
                <AppText style={styles.value}>
                  {league.registration_fee && league.registration_fee > 0
                    ? `$${league.registration_fee.toFixed(2)}`
                    : 'Free ($0.00)'}
                </AppText>
              </View>
            </View>
          </View>
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

        <View style={styles.gridContainer}>
          {/* Row 1: Start Date | End Date */}
          <View style={styles.gridRow}>
            <View style={styles.gridColLeft}>
              <View style={styles.item}>
                <AppText style={styles.label}>Start Date</AppText>
                <AppText style={styles.value}>
                  {league.start_date ? formatDate(league.start_date) : 'TBA'}
                </AppText>
              </View>
            </View>

            <View style={styles.gridColRight}>
              <View style={styles.item}>
                <AppText style={styles.label}>End Date</AppText>
                <AppText style={styles.value}>
                  {league.end_date ? formatDate(league.end_date) : 'TBA'}
                </AppText>
              </View>
            </View>
          </View>

          {/* Row 2: Match Frequency | Host Club */}
          <View style={styles.gridRow}>
            <View style={styles.gridColLeft}>
              <View style={styles.item}>
                <AppText style={styles.label}>Match Frequency</AppText>
                <AppText style={styles.value}>
                  {league.match_frequency || 'Weekly Fixtures'}
                </AppText>
              </View>
            </View>

            <View style={styles.gridColRight}>
              <View style={styles.item}>
                <AppText style={styles.label}>Host Club</AppText>
                <AppText style={styles.value}>
                  {league.club_name || 'Pickleball Club'}
                </AppText>
              </View>
            </View>
          </View>

          {/* Row 3: Venue & Courts (Full Width) */}
          <View style={styles.gridRow}>
            <View style={[styles.gridColLeft, { flex: 2 }]}>
              <View style={styles.item}>
                <AppText style={styles.label}>Venue & Courts</AppText>
                <AppText style={styles.value}>
                  {league.venue_name || league.location || 'Dedicated Pickleball Courts'}
                </AppText>
              </View>
            </View>
          </View>
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

        <View style={styles.gridContainer}>
          {/* Row 1: Match Format | Target Score */}
          <View style={styles.gridRow}>
            <View style={styles.gridColLeft}>
              <View style={styles.item}>
                <AppText style={styles.label}>Match Format</AppText>
                <AppText style={styles.value}>
                  {league.match_format || 'Best 2 of 3 Games'}
                </AppText>
              </View>
            </View>

            <View style={styles.gridColRight}>
              <View style={styles.item}>
                <AppText style={styles.label}>Target Score</AppText>
                <AppText style={styles.value}>
                  {league.target_score || '11 Points (win by 2)'}
                </AppText>
              </View>
            </View>
          </View>

          {/* Row 2: Standings Points | Playoff Format (only if playoffs) */}
          <View style={styles.gridRow}>
            <View style={styles.gridColLeft}>
              <View style={styles.item}>
                <AppText style={styles.label}>Standings Points</AppText>
                <AppText style={styles.value}>
                  {league.standings_points || 'Win: 2 pts · Loss: 0 pts'}
                </AppText>
              </View>
            </View>

            {hasPlayoffs ? (
              <View style={styles.gridColRight}>
                <View style={styles.item}>
                  <AppText style={styles.label}>Playoff Format</AppText>
                  <AppText style={styles.value}>
                    {league.playoff_format || 'Single Elimination Bracket'}
                  </AppText>
                </View>
              </View>
            ) : null}
          </View>

          {/* Compact Tiebreaker Order Box */}
          <View style={styles.tiebreakerBox}>
            <AppText style={styles.tiebreakerHeader}>Tiebreaker Order</AppText>
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
    padding: 14,
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
    fontSize: 14.5,
    fontWeight: '700',
    color: '#102F2A',
  },
  descriptionText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  gridContainer: {
    gap: 12,
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  gridColLeft: {
    flex: 1,
    minWidth: 0,
  },
  gridColRight: {
    flex: 1,
    minWidth: 0,
  },
  item: {
    gap: 2,
  },
  label: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#64748B',
    lineHeight: 15,
  },
  value: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 18,
  },
  tiebreakerBox: {
    backgroundColor: '#F8FAF9',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#EBF1EE',
    marginTop: 2,
  },
  tiebreakerHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#176B57',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  tiebreakerList: {
    gap: 3,
  },
  tiebreakerItem: {
    fontSize: 12,
    fontWeight: '500',
    color: '#334155',
    lineHeight: 17,
  },
});
