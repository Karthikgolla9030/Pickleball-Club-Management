/**
 * Aught2 Pickleball — PlayerLeagueOverviewTab
 *
 * Standardized Overview & Rules tab for Player League Details:
 * - Card 1: League Summary (clean dynamic summary without brackets or duplication)
 * - Card 2: League Information (balanced 2-column grid layout across rows)
 * - Card 3: Schedule & Venue (standardized 2-column layout matching League Information)
 * - Card 4: Game Rules & Scoring (match format, target score, standings points, tiebreaker hierarchy)
 */

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Activity,
  Calendar,
  Clock,
  DollarSign,
  FileText,
  MapPin,
  Scale,
  ShieldCheck,
  Tag,
  Trophy,
  Users,
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
  const hasPlayoffs = playoffSpots > 0;

  // Clean structured summary string without brackets or duplication:
  // e.g. "Singles · Skill: All Levels · 6 Weeks · Top 4 to Playoffs · Pickleball Club · $100/entry"
  const summaryString = useMemo(() => {
    const parts: string[] = [];

    // Division / Category
    const category = league.category || (isSingles ? 'Singles' : 'Doubles');
    if (category) parts.push(category);

    // Skill level
    parts.push('All Skill Levels');

    // Gender eligibility if configured
    const gender = (league as any).gender_preference || (league as any).gender_eligibility || (league as any).gender;
    if (gender && gender.toLowerCase() !== 'any' && gender.toLowerCase() !== 'all') {
      parts.push(gender);
    }

    // Age limits if configured
    const minAge = (league as any).age_limit_min || (league as any).min_age;
    const maxAge = (league as any).age_limit_max || (league as any).max_age;
    if (minAge || maxAge) {
      parts.push(`Age: ${minAge || 18}–${maxAge || 99}`);
    }

    // Duration
    parts.push(`${totalWeeks} Weeks`);

    // Playoff spots
    if (hasPlayoffs) {
      parts.push(`Top ${playoffSpots} to Playoffs`);
    } else {
      parts.push('Regular Season Only');
    }

    // Host Club
    if (league.club_name) {
      parts.push(league.club_name);
    }

    // Fee
    if (league.registration_fee && league.registration_fee > 0) {
      parts.push(`$${league.registration_fee.toFixed(0)}/entry`);
    } else {
      parts.push('Free Entry');
    }

    return parts.join(' · ');
  }, [league, isSingles, totalWeeks, playoffSpots, hasPlayoffs]);

  // Clean description if provided
  const cleanDescription = useMemo(() => {
    if (!league.description) return null;
    let desc = league.description.trim();
    // Strip raw JSON / metadata artifacts if any
    if (desc.startsWith('{') || desc.startsWith('[')) return null;
    return desc;
  }, [league.description]);

  return (
    <View style={styles.container}>
      {/* ─── 1. League Summary Card ─── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconWrap}>
            <FileText size={16} color="#065F46" />
          </View>
          <AppText variant="body" bold style={styles.cardTitle}>
            League Summary
          </AppText>
        </View>

        <View style={styles.summaryPill}>
          <AppText style={styles.summaryText}>{summaryString}</AppText>
        </View>

        {cleanDescription ? (
          <AppText variant="bodySmall" style={styles.descriptionText}>
            {cleanDescription}
          </AppText>
        ) : null}
      </Card>

      {/* ─── 2. League Information Card ─── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconWrap}>
            <Tag size={16} color="#065F46" />
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
                <View style={styles.labelRow}>
                  <Trophy size={14} color="#065F46" style={styles.rowIcon} />
                  <AppText variant="caption" style={styles.label}>
                    Competition Format
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.value}>
                  {hasPlayoffs ? 'Regular Season + Playoffs' : 'Round Robin League'}
                </AppText>
              </View>
            </View>

            <View style={styles.gridColRight}>
              <View style={styles.item}>
                <View style={styles.labelRow}>
                  <Users size={14} color="#065F46" style={styles.rowIcon} />
                  <AppText variant="caption" style={styles.label}>
                    Division
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.value}>
                  {league.category || (isSingles ? 'Singles' : 'Doubles')}
                </AppText>
              </View>
            </View>
          </View>

          {/* Row 2: Registration Type | Regular Season */}
          <View style={styles.gridRow}>
            <View style={styles.gridColLeft}>
              <View style={styles.item}>
                <View style={styles.labelRow}>
                  <ShieldCheck size={14} color="#065F46" style={styles.rowIcon} />
                  <AppText variant="caption" style={styles.label}>
                    Registration Type
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.value}>
                  {isSingles ? 'Individual (Singles)' : 'Fixed Team (Doubles)'}
                </AppText>
              </View>
            </View>

            <View style={styles.gridColRight}>
              <View style={styles.item}>
                <View style={styles.labelRow}>
                  <Calendar size={14} color="#065F46" style={styles.rowIcon} />
                  <AppText variant="caption" style={styles.label}>
                    Regular Season
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.value}>
                  {totalWeeks} Weeks
                </AppText>
              </View>
            </View>
          </View>

          {/* Row 3: Playoff Qualification | Max Capacity */}
          <View style={styles.gridRow}>
            <View style={styles.gridColLeft}>
              <View style={styles.item}>
                <View style={styles.labelRow}>
                  <Trophy size={14} color="#065F46" style={styles.rowIcon} />
                  <AppText variant="caption" style={styles.label}>
                    Playoff Qualification
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.value}>
                  {hasPlayoffs ? `Top ${playoffSpots} Advance to Playoffs` : 'No Playoffs (Standings Only)'}
                </AppText>
              </View>
            </View>

            <View style={styles.gridColRight}>
              <View style={styles.item}>
                <View style={styles.labelRow}>
                  <Users size={14} color="#065F46" style={styles.rowIcon} />
                  <AppText variant="caption" style={styles.label}>
                    Max Capacity
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.value}>
                  {league.max_teams || 12} {isSingles ? 'Players' : 'Teams'}
                </AppText>
              </View>
            </View>
          </View>

          {/* Row 4: Skill Requirement | Registration Fee */}
          <View style={styles.gridRow}>
            <View style={styles.gridColLeft}>
              <View style={styles.item}>
                <View style={styles.labelRow}>
                  <Activity size={14} color="#065F46" style={styles.rowIcon} />
                  <AppText variant="caption" style={styles.label}>
                    Skill Requirement
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.value}>
                  Open / All Levels
                </AppText>
              </View>
            </View>

            <View style={styles.gridColRight}>
              <View style={styles.item}>
                <View style={styles.labelRow}>
                  <DollarSign size={14} color="#065F46" style={styles.rowIcon} />
                  <AppText variant="caption" style={styles.label}>
                    Registration Fee
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.value}>
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
            <Calendar size={16} color="#065F46" />
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
                <View style={styles.labelRow}>
                  <Calendar size={14} color="#065F46" style={styles.rowIcon} />
                  <AppText variant="caption" style={styles.label}>
                    Start Date
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.value}>
                  {league.start_date ? formatDate(league.start_date) : 'TBA'}
                </AppText>
              </View>
            </View>

            <View style={styles.gridColRight}>
              <View style={styles.item}>
                <View style={styles.labelRow}>
                  <Calendar size={14} color="#065F46" style={styles.rowIcon} />
                  <AppText variant="caption" style={styles.label}>
                    End Date
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.value}>
                  {league.end_date ? formatDate(league.end_date) : 'TBA'}
                </AppText>
              </View>
            </View>
          </View>

          {/* Row 2: Match Frequency | Registration Deadline */}
          <View style={styles.gridRow}>
            <View style={styles.gridColLeft}>
              <View style={styles.item}>
                <View style={styles.labelRow}>
                  <Clock size={14} color="#065F46" style={styles.rowIcon} />
                  <AppText variant="caption" style={styles.label}>
                    Match Frequency
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.value}>
                  Weekly Fixtures
                </AppText>
              </View>
            </View>

            <View style={styles.gridColRight}>
              <View style={styles.item}>
                <View style={styles.labelRow}>
                  <Clock size={14} color="#065F46" style={styles.rowIcon} />
                  <AppText variant="caption" style={styles.label}>
                    Registration Deadline
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.value}>
                  {league.registration_close_at
                    ? formatDate(league.registration_close_at)
                    : 'Closed / By Start Date'}
                </AppText>
              </View>
            </View>
          </View>

          {/* Row 3: Host Club | Venue / Courts */}
          <View style={styles.gridRow}>
            <View style={styles.gridColLeft}>
              <View style={styles.item}>
                <View style={styles.labelRow}>
                  <MapPin size={14} color="#065F46" style={styles.rowIcon} />
                  <AppText variant="caption" style={styles.label}>
                    Host Club
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.value}>
                  {league.club_name || 'Pickleball Club'}
                </AppText>
              </View>
            </View>

            <View style={styles.gridColRight}>
              <View style={styles.item}>
                <View style={styles.labelRow}>
                  <MapPin size={14} color="#065F46" style={styles.rowIcon} />
                  <AppText variant="caption" style={styles.label}>
                    Venue & Courts
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.value}>
                  Dedicated Pickleball Courts
                </AppText>
              </View>
            </View>
          </View>
        </View>
      </Card>

      {/* ─── 4. Rules & Scoring Card ─── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconWrap}>
            <Scale size={16} color="#065F46" />
          </View>
          <AppText variant="body" bold style={styles.cardTitle}>
            Game Rules & Scoring
          </AppText>
        </View>

        <View style={styles.gridContainer}>
          {/* Match Format & Target Score */}
          <View style={styles.gridRow}>
            <View style={styles.gridColLeft}>
              <View style={styles.item}>
                <AppText variant="caption" style={styles.label}>
                  Match Format
                </AppText>
                <AppText variant="bodySmall" bold style={styles.value}>
                  Best 2 of 3 Games
                </AppText>
              </View>
            </View>

            <View style={styles.gridColRight}>
              <View style={styles.item}>
                <AppText variant="caption" style={styles.label}>
                  Target Score
                </AppText>
                <AppText variant="bodySmall" bold style={styles.value}>
                  11 Points (win by 2)
                </AppText>
              </View>
            </View>
          </View>

          {/* Standings Points & Playoff Format */}
          <View style={styles.gridRow}>
            <View style={styles.gridColLeft}>
              <View style={styles.item}>
                <AppText variant="caption" style={styles.label}>
                  Standings Points
                </AppText>
                <AppText variant="bodySmall" bold style={styles.value}>
                  Win: 2 pts · Loss: 0 pts
                </AppText>
              </View>
            </View>

            <View style={styles.gridColRight}>
              <View style={styles.item}>
                <AppText variant="caption" style={styles.label}>
                  Playoff Format
                </AppText>
                <AppText variant="bodySmall" bold style={styles.value}>
                  {hasPlayoffs ? 'Single Elimination Bracket' : 'None (Regular Season Only)'}
                </AppText>
              </View>
            </View>
          </View>

          {/* Tiebreaker Hierarchy */}
          <View style={styles.ruleBlock}>
            <AppText style={styles.ruleTitle}>Tiebreaker Hierarchy</AppText>
            <AppText style={styles.ruleText}>
              1. Head-to-Head record{'\n'}
              2. Point differential (+/-){'\n'}
              3. Total points scored{'\n'}
              4. Total matches won
            </AppText>
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
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  summaryPill: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
    lineHeight: 19,
  },
  descriptionText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
    marginTop: -4,
  },
  gridContainer: {
    gap: 14,
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  gridColLeft: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  gridColRight: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 22,
  },
  item: {
    gap: 3,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rowIcon: {
    opacity: 0.85,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  value: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 18,
  },
  ruleBlock: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginTop: 4,
  },
  ruleTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  ruleText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#0F172A',
    lineHeight: 20,
  },
});

