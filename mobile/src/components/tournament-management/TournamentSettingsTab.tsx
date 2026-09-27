/**
 * Aught2 Pickleball — TournamentSettingsTab
 *
 * Standardized Settings view across all tournament formats:
 * - Format & Structure
 * - Official Scoring Rules
 * - Standings & Tiebreaker Rules
 * - Participant Capacity & Eligibility
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Award,
  Layers,
  Target,
  Users,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { getFormatDisplayLabel, normalizeTournamentFormat } from '@/navigation';
import { Spacing } from '@/theme';
import type { Tournament } from '@/types';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';

interface TournamentSettingsTabProps {
  tournament: Tournament | null;
}

export function TournamentSettingsTab({ tournament }: TournamentSettingsTabProps) {
  const format = normalizeTournamentFormat(tournament?.format);
  const parsed = parseTournamentConfig(tournament);
  const scoringRules = (tournament?.scoring_rules as unknown as Record<string, unknown>) || {};
  const targetScore = typeof scoringRules.target_score === 'number' ? scoringRules.target_score : 11;
  const winBy = typeof scoringRules.win_by === 'number' ? scoringRules.win_by : 2;
  const gameFormat = typeof scoringRules.game_format === 'string' ? scoringRules.game_format : 'Single game';

  const formatConfig = (tournament?.format_configuration as Record<string, unknown>) || {};

  // Tiebreaker rules based on format
  const tiebreakers = React.useMemo(() => {
    if (format === 'scramble') {
      return [
        { num: 1, title: 'Total Individual Points', desc: 'Cumulative score across all played rounds (Descending)' },
        { num: 2, title: 'Total Games Played', desc: 'Rounds completed (Descending)' },
        { num: 3, title: 'Point Differential', desc: 'Points scored minus opponent points (Descending)' },
        { num: 4, title: 'Player Name (A–Z)', desc: 'Alphabetical order (Ascending)' },
      ];
    }
    if (format === 'bracket') {
      return [
        { num: 1, title: 'Bracket Progression', desc: 'Round advanced in bracket (Finals > Semis > Quarters)' },
        { num: 2, title: 'Initial Seed', desc: 'Higher tournament seed takes precedence' },
        { num: 3, title: 'Point Differential', desc: 'Cumulative match point differential' },
      ];
    }
    // Round Robin & Pool Play
    return [
      { num: 1, title: 'Match Wins', desc: 'Total match victories (Descending)' },
      { num: 2, title: 'Head-to-Head', desc: 'Result between tied opponents (when applicable)' },
      { num: 3, title: 'Point Differential', desc: 'Points scored minus points allowed (Descending)' },
      { num: 4, title: 'Total Points Scored', desc: 'Total offensive points scored (Descending)' },
      { num: 5, title: 'Participant Name (A–Z)', desc: 'Alphabetical order (Ascending)' },
    ];
  }, [format]);

  return (
    <View style={styles.container}>
      {/* ─── 1. Format & Structure ────────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Layers size={18} color="#0F766E" />
          <AppText style={styles.cardHeaderTitle}>Format & Structure</AppText>
        </View>

        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Tournament Format</AppText>
            <AppText style={styles.valCol}>{tournament?.format_label || getFormatDisplayLabel(tournament?.format)}</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Competition Category</AppText>
            <AppText style={styles.valCol}>{parsed.category}</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Participant Structure</AppText>
            <AppText style={styles.valCol}>
              {format === 'scramble'
                ? 'Individual players with rotating partners'
                : parsed.isSingles
                ? '1 player per entry (Singles)'
                : '2 players per team (Fixed Doubles)'}
            </AppText>
          </View>

          {format === 'bracket' && (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <AppText style={styles.labelCol}>Bracket Type</AppText>
                <AppText style={styles.valCol}>
                  {String(formatConfig.bracket_type || formatConfig.bracket_format || 'Single Elimination')}
                </AppText>
              </View>
            </>
          )}

          {format === 'scramble' && (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <AppText style={styles.labelCol}>Planned Rounds</AppText>
                <AppText style={styles.valCol}>
                  {String(formatConfig.planned_rounds || 5)} Rounds
                </AppText>
              </View>
            </>
          )}

          {format === 'pool_play' && (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <AppText style={styles.labelCol}>Number of Pools</AppText>
                <AppText style={styles.valCol}>
                  {String(formatConfig.pool_count || formatConfig.num_pools || 2)} Pools
                </AppText>
              </View>
            </>
          )}
        </View>
      </Card>

      {/* ─── 2. Scoring Rules ─────────────────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Target size={18} color="#0F766E" />
          <AppText style={styles.cardHeaderTitle}>Official Scoring Rules</AppText>
        </View>

        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Game Format</AppText>
            <AppText style={styles.valCol}>{gameFormat}</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Points to Win</AppText>
            <AppText style={styles.valCol}>First to {targetScore} points</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Win Margin</AppText>
            <AppText style={styles.valCol}>Win by {winBy} or more</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Draws / Ties</AppText>
            <AppText style={styles.valCol}>Not allowed (continuous play until win margin)</AppText>
          </View>
        </View>
      </Card>

      {/* ─── 3. Eligibility & Registration Window ─────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Users size={18} color="#0F766E" />
          <AppText style={styles.cardHeaderTitle}>Capacity & Eligibility</AppText>
        </View>

        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Capacity Limit</AppText>
            <AppText style={styles.valCol}>
              {tournament?.max_participants ? `${tournament.max_participants} max` : 'Unlimited'}
              {tournament?.min_participants ? ` (${tournament.min_participants} min required)` : ''}
            </AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Skill Level</AppText>
            <AppText style={styles.valCol}>
              {String(formatConfig.skill_level || (tournament && 'skill_level' in tournament ? tournament.skill_level : null) || 'Open / All levels')}
            </AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <AppText style={styles.labelCol}>Gender Eligibility</AppText>
            <AppText style={styles.valCol}>
              {String(formatConfig.gender_eligibility || 'Any')}
            </AppText>
          </View>

          {Boolean(formatConfig.entry_fee) && (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <AppText style={styles.labelCol}>Entry Fee</AppText>
                <AppText style={styles.valCol}>${Number(formatConfig.entry_fee).toFixed(2)}</AppText>
              </View>
            </>
          )}
        </View>
      </Card>

      {/* ─── 4. Standings Tiebreaker Order ─────────────────────────────────── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Award size={18} color="#0F766E" />
          <AppText style={styles.cardHeaderTitle}>Tiebreaker Criteria</AppText>
        </View>

        <View style={styles.tiebreakerList}>
          {tiebreakers.map((t) => (
            <View key={t.num} style={styles.tiebreakerRow}>
              <View style={styles.tiebreakerNumBadge}>
                <AppText style={styles.tiebreakerNumText}>{t.num}</AppText>
              </View>
              <View style={styles.tiebreakerTextGroup}>
                <AppText style={styles.tiebreakerTitle}>{t.title}</AppText>
                <AppText style={styles.tiebreakerDesc}>{t.desc}</AppText>
              </View>
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[4],
    paddingBottom: Spacing[8],
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    gap: Spacing[3],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  infoList: {
    gap: Spacing[2],
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 12,
  },
  labelCol: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  valCol: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#F8FAFC',
  },
  tiebreakerList: {
    gap: Spacing[3],
  },
  tiebreakerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  tiebreakerNumBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  tiebreakerNumText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
  },
  tiebreakerTextGroup: {
    flex: 1,
    gap: 2,
  },
  tiebreakerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  tiebreakerDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
});
