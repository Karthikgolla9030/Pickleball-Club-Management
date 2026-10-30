/**
 * Aught2 Pickleball — PlayerTournamentOverviewTab
 *
 * Standardized Overview & Rules page across all 4 formats:
 * - Card 1: Tournament Summary (clean, single-line dynamic summary without brackets or duplication)
 * - Card 2: Competition Details (balanced 2-column grid layout across rows with format-specific details)
 * - Card 3: Schedule & Venue (standardized 2-column layout matching Competition Details)
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
  const fc = (tournament.format_configuration || {}) as any;

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

  // Elimination type for Bracket tournaments
  const eliminationType = useMemo(() => {
    const raw =
      fc?.bracket_type ||
      fc?.bracket_format ||
      (tournament as any)?.bracket_type ||
      (tournament as any)?.bracket_format;
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
    return 'Single Elimination';
  }, [fc, tournament]);

  // Clean structured summary string: Singles · Skill 3.5–4.5 · Any Gender · Age 20–30 · $65/player
  const summaryString = useMemo(() => {
    const parts: string[] = [];

    // Division / Category
    const category = parsedConfig.category || (isSingles ? 'Singles' : 'Doubles');
    if (category) parts.push(category);

    // Skill
    const skill = parsedConfig.skillLevelDisplay || parsedConfig.skillLevel;
    if (skill && skill !== 'All Levels' && skill !== 'Open') {
      const cleanSkill = skill.replace(/^skill:\s*/i, '');
      parts.push(`Skill ${cleanSkill}`);
    } else if (skill) {
      parts.push('All Skill Levels');
    }

    // Gender Eligibility
    const gender = parsedConfig.genderEligibility;
    if (gender) {
      if (gender.toLowerCase() === 'any') {
        parts.push('Any Gender');
      } else {
        parts.push(gender);
      }
    }

    // Age Limits
    const age = parsedConfig.ageRestrictionText;
    if (age && age !== 'All Ages') {
      const cleanAge = age.replace(/^age:\s*/i, '');
      parts.push(`Age ${cleanAge}`);
    }

    // Entry Fee
    if (parsedConfig.entryFee != null && parsedConfig.entryFee > 0) {
      parts.push(`$${parsedConfig.entryFee}/player`);
    } else if (parsedConfig.entryFeeDisplay && !parsedConfig.entryFeeDisplay.toLowerCase().includes('free')) {
      const cleanFee = parsedConfig.entryFeeDisplay.replace(/^fee:\s*/i, '');
      parts.push(cleanFee.includes('/player') ? cleanFee : `${cleanFee}/player`);
    }

    return parts.join(' · ');
  }, [parsedConfig, isSingles]);

  // Sanitize and extract real prose description if provided, avoiding duplicate metadata
  const cleanDescription = useMemo(() => {
    if (!tournament.description) return null;
    let desc = tournament.description.trim();

    // Strip bracketed metadata e.g. [Singles • Skill: 3.5–4.5 • Any • Age: 20–30 • Fee: $65/player]
    desc = desc.replace(/\[\s*(?:singles|doubles)?\s*[\s\S]*?fee:[^\]]*\]/gi, '').trim();
    // Strip any leading bracketed token [ ... ]
    desc = desc.replace(/^\[[^\]]+\]\s*/, '').trim();

    // If remaining text is merely metadata fields serialized into plain text
    const isMetadataOnly =
      /(?:singles|doubles)/i.test(desc) &&
      /skill/i.test(desc) &&
      /(?:fee|\$)/i.test(desc) &&
      desc.length < 130 &&
      !desc.includes('\n');
    if (isMetadataOnly) return null;

    // If identical to summaryString
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (summaryString && normalize(desc) === normalize(summaryString)) {
      return null;
    }

    return desc.length > 0 ? desc : null;
  }, [tournament.description, summaryString]);

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
    if (fc?.assigned_courts && Array.isArray(fc.assigned_courts) && fc.assigned_courts.length > 0) {
      return `${fc.assigned_courts.length} Courts Assigned`;
    }
    if (fc?.courts_count && Number(fc.courts_count) > 0) {
      return `${fc.courts_count} Courts Dedicated`;
    }
    return 'Dedicated Pickleball Courts';
  }, [fc]);

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

        <View style={styles.summaryBox}>
          <AppText variant="bodySmall" bold style={styles.summaryText}>
            {summaryString}
          </AppText>
        </View>

        {cleanDescription ? (
          <AppText variant="bodySmall" style={styles.descriptionText}>
            {cleanDescription}
          </AppText>
        ) : null}
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

        <View style={styles.gridContainer}>
          {/* Row 1: Format | Division */}
          <View style={styles.gridRow}>
            <View style={styles.gridColLeft}>
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
            </View>

            <View style={styles.gridColRight}>
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
            </View>
          </View>

          {/* Row 2: Registration Type | Skill Requirement */}
          <View style={styles.gridRow}>
            <View style={styles.gridColLeft}>
              <View style={styles.item}>
                <View style={styles.labelRow}>
                  <Users size={14} color="#065F46" style={styles.rowIcon} />
                  <AppText variant="caption" style={styles.label}>
                    Registration Type
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.value}>
                  {format === 'scramble'
                    ? 'Individual (Scramble)'
                    : isSingles
                    ? 'Individual (Singles)'
                    : 'Fixed Team (Doubles)'}
                </AppText>
              </View>
            </View>

            <View style={styles.gridColRight}>
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
            </View>
          </View>

          {/* Row 3: Gender Eligibility | Age Limits */}
          <View style={styles.gridRow}>
            <View style={styles.gridColLeft}>
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
            </View>

            <View style={styles.gridColRight}>
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
            </View>
          </View>

          {/* Row 4: Format-Specific Configurations */}
          {format === 'bracket' && (
            <View style={styles.gridRow}>
              <View style={styles.gridColLeft}>
                <View style={styles.item}>
                  <View style={styles.labelRow}>
                    <Trophy size={14} color="#065F46" style={styles.rowIcon} />
                    <AppText variant="caption" style={styles.label}>
                      Elimination Type
                    </AppText>
                  </View>
                  <AppText variant="bodySmall" bold style={styles.value}>
                    {eliminationType}
                  </AppText>
                </View>
              </View>

              <View style={styles.gridColRight}>
                <View style={styles.item}>
                  <View style={styles.labelRow}>
                    <Activity size={14} color="#065F46" style={styles.rowIcon} />
                    <AppText variant="caption" style={styles.label}>
                      Seeding Method
                    </AppText>
                  </View>
                  <AppText variant="bodySmall" bold style={styles.value}>
                    {fc?.seeding_method || 'Rating Seeding'}
                  </AppText>
                </View>
              </View>
            </View>
          )}

          {format === 'pool_play' && (
            <View style={styles.gridRow}>
              <View style={styles.gridColLeft}>
                <View style={styles.item}>
                  <View style={styles.labelRow}>
                    <LayoutGrid size={14} color="#065F46" style={styles.rowIcon} />
                    <AppText variant="caption" style={styles.label}>
                      Pools Config
                    </AppText>
                  </View>
                  <AppText variant="bodySmall" bold style={styles.value}>
                    {fc?.pool_count || 2} Pools ({fc?.teams_per_pool || 4} teams/pool)
                  </AppText>
                </View>
              </View>

              <View style={styles.gridColRight}>
                <View style={styles.item}>
                  <View style={styles.labelRow}>
                    <Trophy size={14} color="#065F46" style={styles.rowIcon} />
                    <AppText variant="caption" style={styles.label}>
                      Advancement
                    </AppText>
                  </View>
                  <AppText variant="bodySmall" bold style={styles.value}>
                    Top {fc?.qualifiers_per_pool || 2} Advance to Championship
                  </AppText>
                </View>
              </View>
            </View>
          )}

          {format === 'scramble' && (
            <View style={styles.gridRow}>
              <View style={styles.gridColLeft}>
                <View style={styles.item}>
                  <View style={styles.labelRow}>
                    <Users size={14} color="#065F46" style={styles.rowIcon} />
                    <AppText variant="caption" style={styles.label}>
                      Rotation Rule
                    </AppText>
                  </View>
                  <AppText variant="bodySmall" bold style={styles.value}>
                    {fc?.rotation_rule || 'Dynamic Partner Switch'}
                  </AppText>
                </View>
              </View>

              <View style={styles.gridColRight}>
                <View style={styles.item}>
                  <View style={styles.labelRow}>
                    <Activity size={14} color="#065F46" style={styles.rowIcon} />
                    <AppText variant="caption" style={styles.label}>
                      Leaderboard Metric
                    </AppText>
                  </View>
                  <AppText variant="bodySmall" bold style={styles.value}>
                    {fc?.leaderboard_metric || 'Win % • Point Differential'}
                  </AppText>
                </View>
              </View>
            </View>
          )}
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

        <View style={styles.gridContainer}>
          {/* Row 1: Event Dates | Registration Deadline */}
          <View style={styles.gridRow}>
            <View style={styles.gridColLeft}>
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
                  {tournament.registration_close_at
                    ? formatDate(tournament.registration_close_at)
                    : formatDate(tournament.start_date)}
                </AppText>
              </View>
            </View>
          </View>

          {/* Row 2: Location | Courts */}
          <View style={styles.gridRow}>
            <View style={styles.gridColLeft}>
              <View style={styles.item}>
                <View style={styles.labelRow}>
                  <MapPin size={14} color="#065F46" style={styles.rowIcon} />
                  <AppText variant="caption" style={styles.label}>
                    Location
                  </AppText>
                </View>
                <AppText variant="bodySmall" bold style={styles.value}>
                  {tournament.location_name || tournament.club_name || 'Main Courts'}
                </AppText>
              </View>
            </View>

            <View style={styles.gridColRight}>
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
    gap: 14,
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
  summaryBox: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  summaryText: {
    fontSize: 13,
    color: '#065F46',
    fontWeight: '700',
    lineHeight: 20,
  },
  descriptionText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
    marginTop: 2,
  },
  gridContainer: {
    gap: 16,
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
  },
  gridColLeft: {
    flex: 1,
    minWidth: 0,
  },
  gridColRight: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 8,
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
