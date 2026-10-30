/**
 * Aught2 Pickleball — PlayerTournamentOverviewTab
 *
 * Standardized Overview & Rules page across all 4 formats:
 * - Card 1: Tournament Summary (compact bracketed metadata + description)
 * - Card 2: Competition Details (standardized 2-column grid with format-specific details)
 * - Card 3: Schedule & Venue (dates, registration window, venue, courts)
 * - Card 4: Game Rules & Scoring (game format, target score, tiebreakers, competition notes)
 */

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Activity,
  Calendar,
  Clock,
  FileText,
  LayoutGrid,
  MapPin,
  Scale,
  ShieldAlert,
  Tag,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { formatDate } from '@/utils';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';
import type { Tournament } from '@/types';

export interface PlayerTournamentOverviewTabProps {
  tournament: Tournament;
}

export function PlayerTournamentOverviewTab({ tournament }: PlayerTournamentOverviewTabProps) {
  const parsedConfig = useMemo(() => parseTournamentConfig(tournament), [tournament]);
  const format = tournament.format || 'round_robin';
  const isSingles = parsedConfig.isSingles;

  // Format label
  const formatLabel = useMemo(() => {
    switch (format) {
      case 'bracket':
        return 'Bracket';
      case 'pool_play':
        return 'Pool Play';
      case 'scramble':
        return 'Scramble';
      case 'round_robin':
      default:
        return 'Round Robin';
    }
  }, [format]);

  // Summary bracketed string: e.g. [Singles • Skill: 3.5–4.5 • Any • Age: 20–30 • Fee: $55/player]
  const summaryMetaString = useMemo(() => {
    const parts: string[] = [];

    // Division / Category
    parts.push(parsedConfig.category || (isSingles ? 'Singles' : 'Doubles'));

    // Skill
    if (parsedConfig.skillLevelDisplay) {
      parts.push(`Skill: ${parsedConfig.skillLevelDisplay}`);
    } else if (parsedConfig.skillLevel) {
      parts.push(`Skill: ${parsedConfig.skillLevel}`);
    }

    // Gender
    if (parsedConfig.genderEligibility) {
      parts.push(parsedConfig.genderEligibility);
    }

    // Age
    if (parsedConfig.ageRestrictionText && parsedConfig.ageRestrictionText !== 'All Ages') {
      parts.push(`Age: ${parsedConfig.ageRestrictionText}`);
    }

    // Entry Fee
    if (parsedConfig.entryFeeDisplay) {
      parts.push(`Fee: ${parsedConfig.entryFeeDisplay}`);
    } else if (parsedConfig.entryFee != null && parsedConfig.entryFee > 0) {
      parts.push(`Fee: $${parsedConfig.entryFee}/player`);
    }

    return `[${parts.join(' • ')}]`;
  }, [parsedConfig, isSingles]);

  // Scoring rules
  const scoringFormat = useMemo(() => {
    const rules = tournament.scoring_rules;
    if (rules?.game_format) {
      return `${rules.game_format} to ${rules.target_score || 11} (win by ${rules.win_by || 2})`;
    }
    const pts = rules?.target_score || 11;
    const winBy = rules?.win_by || 2;
    return `First to ${pts} (win by ${winBy})`;
  }, [tournament.scoring_rules]);

  // Format-specific rules explanation
  const formatRulesNote = useMemo(() => {
    switch (format) {
      case 'bracket':
        return 'Knockout single-elimination tournament. Match winners advance to the next round while defeated players/teams are eliminated or move to consolation.';
      case 'pool_play':
        return 'Entrants are divided into pools for round-robin play. Top teams from each pool automatically advance into the championship single-elimination bracket.';
      case 'scramble':
        return 'Individual scramble format where players rotate partners across multiple rounds. Points scored accumulate individually on the standings board.';
      case 'round_robin':
      default:
        return 'Every player or team plays a round-robin matchup against every other entry in the division. Final rankings are based on wins, differential, and total points.';
    }
  }, [format]);

  // Assigned courts
  const courtsInfo = useMemo(() => {
    const fc = tournament.format_configuration as any;
    if (fc?.assigned_courts && Array.isArray(fc.assigned_courts) && fc.assigned_courts.length > 0) {
      return `${fc.assigned_courts.length} Courts Assigned`;
    }
    return 'Dedicated Pickleball Courts';
  }, [tournament.format_configuration]);

  return (
    <View style={styles.container}>
      {/* ─── 1. Tournament Summary ─── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconWrap}>
            <FileText size={18} color="#065F46" />
          </View>
          <AppText variant="heading3" bold style={styles.cardTitle}>
            Tournament Summary
          </AppText>
        </View>

        <AppText variant="bodySmall" bold style={styles.summaryMetaText}>
          {summaryMetaString}
        </AppText>

        {tournament.description ? (
          <AppText variant="bodySmall" style={styles.descriptionText}>
            {tournament.description}
          </AppText>
        ) : (
          <AppText variant="bodySmall" style={styles.descriptionText}>
            Welcome to {tournament.name}. Review all competition specifications, game rules, and schedules below.
          </AppText>
        )}
      </Card>

      {/* ─── 2. Competition Details ─── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconWrap}>
            <FileText size={18} color="#065F46" />
          </View>
          <AppText variant="heading3" bold style={styles.cardTitle}>
            Competition Details
          </AppText>
        </View>

        <View style={styles.twoColumnGrid}>
          {/* Column 1 */}
          <View style={styles.column}>
            <View style={styles.item}>
              <View style={styles.labelRow}>
                <Tag size={14} color="#065F46" style={styles.rowIcon} />
                <AppText variant="caption" style={styles.label}>
                  Format
                </AppText>
              </View>
              <AppText variant="bodySmall" bold style={styles.value}>
                {formatLabel}
              </AppText>
            </View>

            <View style={styles.item}>
              <View style={styles.labelRow}>
                <Users size={14} color="#065F46" style={styles.rowIcon} />
                <AppText variant="caption" style={styles.label}>
                  Registration Type
                </AppText>
              </View>
              <AppText variant="bodySmall" bold style={styles.value}>
                {isSingles ? 'Individual (Singles)' : 'Fixed Team (Doubles)'}
              </AppText>
            </View>

            <View style={styles.item}>
              <View style={styles.labelRow}>
                <UserCheck size={14} color="#065F46" style={styles.rowIcon} />
                <AppText variant="caption" style={styles.label}>
                  Gender Eligibility
                </AppText>
              </View>
              <AppText variant="bodySmall" bold style={styles.value}>
                {parsedConfig.genderEligibility || 'Any'}
              </AppText>
            </View>

            {format === 'pool_play' && (
              <View style={styles.item}>
                <View style={styles.labelRow}>
                  <LayoutGrid size={14} color="#065F46" style={styles.rowIcon} />
                  <AppText variant="caption" style={styles.label}>
                    Pools Config
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.value}>
                  2 Pools (Pool A & Pool B)
                </AppText>
              </View>
            )}

            {format === 'bracket' && (
              <View style={styles.item}>
                <View style={styles.labelRow}>
                  <Trophy size={14} color="#065F46" style={styles.rowIcon} />
                  <AppText variant="caption" style={styles.label}>
                    Elimination Type
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.value}>
                  Single Elimination
                </AppText>
              </View>
            )}
          </View>

          {/* Column 2 */}
          <View style={styles.column}>
            <View style={styles.item}>
              <View style={styles.labelRow}>
                <Trophy size={14} color="#065F46" style={styles.rowIcon} />
                <AppText variant="caption" style={styles.label}>
                  Division
                </AppText>
              </View>
              <AppText variant="bodySmall" bold style={styles.value}>
                {parsedConfig.category || (isSingles ? 'Singles' : 'Doubles')}
              </AppText>
            </View>

            <View style={styles.item}>
              <View style={styles.labelRow}>
                <Activity size={14} color="#065F46" style={styles.rowIcon} />
                <AppText variant="caption" style={styles.label}>
                  Skill Requirement
                </AppText>
              </View>
              <AppText variant="bodySmall" bold style={styles.value}>
                {parsedConfig.skillLevelDisplay || parsedConfig.skillLevel || 'Open / All Levels'}
              </AppText>
            </View>

            <View style={styles.item}>
              <View style={styles.labelRow}>
                <Calendar size={14} color="#065F46" style={styles.rowIcon} />
                <AppText variant="caption" style={styles.label}>
                  Age Limits
                </AppText>
              </View>
              <AppText variant="bodySmall" bold style={styles.value}>
                {parsedConfig.ageRestrictionText || 'All Ages'}
              </AppText>
            </View>

            {format === 'pool_play' && (
              <View style={styles.item}>
                <View style={styles.labelRow}>
                  <Trophy size={14} color="#065F46" style={styles.rowIcon} />
                  <AppText variant="caption" style={styles.label}>
                    Advancement
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.value}>
                  Top 2 Advance to Semis
                </AppText>
              </View>
            )}

            {format === 'scramble' && (
              <View style={styles.item}>
                <View style={styles.labelRow}>
                  <Users size={14} color="#065F46" style={styles.rowIcon} />
                  <AppText variant="caption" style={styles.label}>
                    Rotation
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.value}>
                  Dynamic Partner Switch
                </AppText>
              </View>
            )}
          </View>
        </View>
      </Card>

      {/* ─── 3. Schedule & Venue ─── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconWrap}>
            <Calendar size={18} color="#065F46" />
          </View>
          <AppText variant="heading3" bold style={styles.cardTitle}>
            Schedule & Venue
          </AppText>
        </View>

        <View style={styles.twoColumnGrid}>
          <View style={styles.column}>
            <View style={styles.item}>
              <View style={styles.labelRow}>
                <Calendar size={14} color="#065F46" style={styles.rowIcon} />
                <AppText variant="caption" style={styles.label}>
                  Event Dates
                </AppText>
              </View>
              <AppText variant="bodySmall" bold style={styles.value}>
                {formatDate(tournament.start_date)} – {formatDate(tournament.end_date)}
              </AppText>
            </View>

            <View style={styles.item}>
              <View style={styles.labelRow}>
                <MapPin size={14} color="#065F46" style={styles.rowIcon} />
                <AppText variant="caption" style={styles.label}>
                  Location
                </AppText>
              </View>
              <AppText variant="bodySmall" bold style={styles.value}>
                {tournament.location_name || tournament.club_name || 'Club Courts'}
              </AppText>
            </View>
          </View>

          <View style={styles.column}>
            <View style={styles.item}>
              <View style={styles.labelRow}>
                <Clock size={14} color="#065F46" style={styles.rowIcon} />
                <AppText variant="caption" style={styles.label}>
                  Registration Deadline
                </AppText>
              </View>
              <AppText variant="bodySmall" bold style={styles.value}>
                {tournament.registration_close_at
                  ? formatDate(tournament.registration_close_at)
                  : formatDate(tournament.start_date)}
              </AppText>
            </View>

            <View style={styles.item}>
              <View style={styles.labelRow}>
                <LayoutGrid size={14} color="#065F46" style={styles.rowIcon} />
                <AppText variant="caption" style={styles.label}>
                  Courts
                </AppText>
              </View>
              <AppText variant="bodySmall" bold style={styles.value}>
                {courtsInfo}
              </AppText>
            </View>
          </View>
        </View>
      </Card>

      {/* ─── 4. Game Rules & Scoring ─── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconWrap}>
            <Scale size={18} color="#065F46" />
          </View>
          <AppText variant="heading3" bold style={styles.cardTitle}>
            Game Rules & Scoring
          </AppText>
        </View>

        <View style={styles.rulesList}>
          <View style={styles.ruleRow}>
            <AppText variant="caption" bold style={styles.ruleLabel}>
              Game Format:
            </AppText>
            <AppText variant="bodySmall" style={styles.ruleValue}>
              {scoringFormat}
            </AppText>
          </View>

          <View style={styles.ruleRow}>
            <AppText variant="caption" bold style={styles.ruleLabel}>
              Target Score:
            </AppText>
            <AppText variant="bodySmall" style={styles.ruleValue}>
              {tournament.scoring_rules?.target_score || 11} points (must win by {tournament.scoring_rules?.win_by || 2})
            </AppText>
          </View>

          <View style={styles.ruleRow}>
            <AppText variant="caption" bold style={styles.ruleLabel}>
              Win Condition:
            </AppText>
            <AppText variant="bodySmall" style={styles.ruleValue}>
              Win by {tournament.scoring_rules?.win_by || 2} points
            </AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.tiebreakerBlock}>
            <AppText variant="caption" bold style={styles.tiebreakerTitle}>
              Official Tiebreaker Hierarchy:
            </AppText>
            <AppText variant="caption" style={styles.tiebreakerItem}>
              1. Head-to-Head match result
            </AppText>
            <AppText variant="caption" style={styles.tiebreakerItem}>
              2. Total Point Differential (+ / -)
            </AppText>
            <AppText variant="caption" style={styles.tiebreakerItem}>
              3. Total Points Scored
            </AppText>
            <AppText variant="caption" style={styles.tiebreakerItem}>
              4. Coin toss / Initial tournament seed
            </AppText>
          </View>

          <View style={styles.noteBox}>
            <ShieldAlert size={14} color="#047857" style={{ marginTop: 2, marginRight: 6 }} />
            <AppText variant="caption" style={styles.noteText}>
              {formatRulesNote}
            </AppText>
          </View>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
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
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  summaryMetaText: {
    fontSize: 13,
    color: '#065F46',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    lineHeight: 18,
  },
  descriptionText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
  },
  twoColumnGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  column: {
    flex: 1,
    gap: 12,
  },
  item: {
    gap: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowIcon: {
    marginRight: 5,
  },
  label: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  value: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '700',
    marginTop: 2,
  },
  rulesList: {
    gap: 8,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  ruleLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  ruleValue: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 4,
  },
  tiebreakerBlock: {
    gap: 4,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
  },
  tiebreakerTitle: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '700',
    marginBottom: 2,
  },
  tiebreakerItem: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
  },
  noteBox: {
    flexDirection: 'row',
    backgroundColor: '#ECFDF5',
    padding: 10,
    borderRadius: 8,
    alignItems: 'flex-start',
    marginTop: 4,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    color: '#065F46',
    lineHeight: 17,
  },
});
