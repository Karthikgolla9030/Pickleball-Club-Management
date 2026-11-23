/**
 * Aught2 Pickleball — PlayerTournamentOverviewTab
 *
 * Dedicated, authoritative Overview & Rules tab for Player Side Tournament Details.
 * Redesigned to follow the exact same UI design system and information-display format as
 * Club Side → League Management → Overview & Rules tab (PlayerLeagueOverviewTab):
 * - Light page background (#F2F8F5) with consistent padding and spacing
 * - White information cards with subtle borders (#E2EAE5) and soft elevation
 * - Consistent card padding (16px) and corner radius (14px)
 * - Section header with 26x26 mint icon wrap (#DEF2E6) and 15px bold title (#102F2A)
 * - Single-column InfoRow on mobile (muted label on top, readable value below)
 * - Responsive row layout on tablet/desktop (>= 768px)
 * - Nested, clean tiebreaker hierarchy callout box
 * - Restrained green accents (#176B57)
 * - Dynamically supports all 4 tournament formats (Round Robin, Bracket, Pool Play, Scramble)
 * - Strictly avoids repeated summary banners or duplicated tournament titles
 */

import React, { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import {
  Calendar,
  FileText,
  Layers,
  Scale,
  Tag,
  Trophy,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { useClubDetails } from '@/hooks';
import { normalizeTournamentFormat } from '@/navigation';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';
import type { Tournament } from '@/types';

export interface PlayerTournamentOverviewTabProps {
  tournament: Tournament;
}

function formatTournamentDate(dateStr?: string | null, timezone?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    let tzOption: { timeZone?: string } = {};
    if (timezone) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
        tzOption = { timeZone: timezone };
      } catch {
        tzOption = {};
      }
    }
    const day = d.toLocaleDateString('en-GB', { day: 'numeric', ...tzOption });
    const month = d.toLocaleDateString('en-GB', { month: 'short', ...tzOption });
    const year = d.toLocaleDateString('en-GB', { year: 'numeric', ...tzOption });
    return `${day} ${month} ${year}`;
  } catch {
    return dateStr;
  }
}

function formatTournamentDateRange(
  startStr?: string | null,
  endStr?: string | null,
  timezone?: string | null
): string {
  if (!startStr) return 'Not configured';
  const startFmt = formatTournamentDate(startStr, timezone);
  if (!endStr) return startFmt;
  const endFmt = formatTournamentDate(endStr, timezone);
  return `${startFmt} – ${endFmt}`;
}

function formatTournamentTime(
  isoStr?: string | null,
  timezone?: string | null
): string {
  if (!isoStr) return 'Unavailable';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return 'Unavailable';

    let tzOption: { timeZone?: string } = {};
    if (timezone) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
        tzOption = { timeZone: timezone };
      } catch {
        tzOption = {};
      }
    }

    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      ...tzOption,
    });
  } catch {
    return 'Unavailable';
  }
}

function formatTournamentDeadline(dateStr?: string | null): string {
  if (!dateStr) return 'Not specified';
  try {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
    const dateFormatted = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    const minuteStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
    if (hours === 0 && minutes === 0) {
      return dateFormatted;
    }
    return `${dateFormatted}, ${hour12}:${minuteStr} ${ampm}`;
  } catch {
    return dateStr;
  }
}

function humanizeGameFormat(formatStr?: string | null): string {
  if (!formatStr) return 'Single Game';
  const lower = formatStr.toLowerCase();
  if (lower.includes('single') || lower === 'single_game') return 'Single Game';
  if (lower.includes('best_of_3') || lower.includes('best 2 of 3')) return 'Best 2 of 3 Games';
  if (lower.includes('best_of_5') || lower.includes('best 3 of 5')) return 'Best 3 of 5 Games';
  return formatStr.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function InfoRow({
  label,
  value,
  isLast = false,
  isTablet = false,
  testID,
  accessibilityLabel,
}: {
  label: string;
  value: React.ReactNode;
  isLast?: boolean;
  isTablet?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  return (
    <View
      style={[styles.infoRow, isTablet && styles.infoRowTablet, isLast && styles.infoRowLast]}
      accessibilityLabel={accessibilityLabel || `${label}: ${value}`}
      testID={testID}
    >
      <AppText style={[styles.infoLabel, isTablet && styles.infoLabelTablet]}>{label}</AppText>
      {typeof value === 'string' || typeof value === 'number' ? (
        <AppText style={[styles.infoValue, isTablet && styles.infoValueTablet]}>{value}</AppText>
      ) : (
        <View style={isTablet && styles.infoValueTabletWrap}>{value}</View>
      )}
    </View>
  );
}

export function PlayerTournamentOverviewTab({ tournament }: PlayerTournamentOverviewTabProps) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const format = normalizeTournamentFormat(tournament?.format);
  const parsed = useMemo(() => parseTournamentConfig(tournament), [tournament]);
  const formatConfig = (tournament?.format_configuration as Record<string, unknown>) || {};
  const scoringRules = (tournament?.scoring_rules as unknown as Record<string, unknown>) || {};

  const targetScore = typeof scoringRules.target_score === 'number' ? scoringRules.target_score : 11;
  const winBy = typeof scoringRules.win_by === 'number' ? scoringRules.win_by : 2;
  const gameFormat = typeof scoringRules.game_format === 'string' ? scoringRules.game_format : 'single_game';

  // ─── 1. Format Label & Display ──────────────────────────────────────────
  const formatLabel = useMemo(() => {
    switch (format) {
      case 'bracket':
        return 'Bracket Play';
      case 'pool_play':
        return 'Pool Play';
      case 'scramble':
        return 'Rotating Scramble';
      case 'round_robin':
      default:
        return 'Round Robin';
    }
  }, [format]);

  const competitionFormatDisplay = useMemo(() => {
    if (format === 'scramble') {
      return `Rotating Scramble • ${parsed.category || 'Open'}`;
    }
    if (format === 'bracket') {
      const bType = String(formatConfig.bracket_type || formatConfig.bracket_format || 'Single Elimination');
      const pStructure = parsed.isSingles ? 'Individual Singles' : 'Fixed Partner Doubles';
      return `${bType} • ${pStructure}`;
    }
    if (format === 'pool_play') {
      const pStructure = parsed.isSingles ? 'Singles' : 'Doubles';
      return `Pool Play • ${pStructure}`;
    }
    if (format === 'round_robin') {
      const pStructure = parsed.isSingles ? 'Individual Singles' : 'Fixed Partner Doubles';
      return `Round Robin • ${pStructure}`;
    }
    return `${tournament?.format_label || 'Tournament'} • ${parsed.category || 'Open'}`;
  }, [format, formatConfig, parsed, tournament]);

  // ─── 2. Division Display ───────────────────────────────────────────────
  const divisionDisplay = useMemo(() => {
    if (parsed.category) return parsed.category;
    if (format === 'scramble') return 'Individual Open';
    return parsed.isSingles ? 'Singles' : 'Doubles';
  }, [parsed, format]);

  // ─── 3. Registration Type ──────────────────────────────────────────────
  const registrationTypeDisplay = useMemo(() => {
    if (format === 'scramble') return 'Individual (Rotating Partners)';
    if (parsed.isSingles) return 'Individual (Singles)';
    return 'Fixed Partner (Doubles)';
  }, [format, parsed.isSingles]);

  // ─── 4. Age Group Display ──────────────────────────────────────────────
  const ageDisplay = useMemo(() => {
    if (parsed.minAge && parsed.maxAge) {
      return `${parsed.minAge}–${parsed.maxAge} years`;
    }
    if (parsed.minAge && !parsed.maxAge) {
      return `${parsed.minAge}+ years`;
    }
    if (!parsed.minAge && parsed.maxAge) {
      return `Under ${parsed.maxAge} years`;
    }
    if (parsed.ageRestrictionText && parsed.ageRestrictionText !== 'None') {
      return parsed.ageRestrictionText.includes('year')
        ? parsed.ageRestrictionText
        : `${parsed.ageRestrictionText} years`;
    }
    return 'All ages welcome';
  }, [parsed]);

  // ─── 5. Dates & Deadline ───────────────────────────────────────────────
  const { club } = useClubDetails(tournament?.club_id);
  const tournamentTimezone =
    (tournament as any)?.timezone ||
    (tournament as any)?.club_timezone ||
    club?.timezone ||
    (formatConfig as any)?.timezone ||
    null;

  const datesDisplay = useMemo(
    () => formatTournamentDateRange(tournament?.start_date, tournament?.end_date, tournamentTimezone),
    [tournament?.start_date, tournament?.end_date, tournamentTimezone]
  );
  const startTimeDisplay = useMemo(
    () => formatTournamentTime(tournament?.start_date, tournamentTimezone),
    [tournament?.start_date, tournamentTimezone]
  );
  const endTimeDisplay = useMemo(
    () => formatTournamentTime(tournament?.end_date, tournamentTimezone),
    [tournament?.end_date, tournamentTimezone]
  );
  const deadlineDisplay = formatTournamentDeadline(tournament?.registration_close_at);

  // ─── 6. Assigned Courts & Venue ────────────────────────────────────────
  const courtsAssigned = useMemo(() => {
    if (typeof formatConfig.courts_count === 'number') {
      return `${formatConfig.courts_count} dedicated courts`;
    }
    if (typeof formatConfig.num_courts === 'number') {
      return `${formatConfig.num_courts} dedicated courts`;
    }
    if (Array.isArray(formatConfig.assigned_courts) && formatConfig.assigned_courts.length > 0) {
      return `${formatConfig.assigned_courts.length} assigned courts`;
    }
    if (Array.isArray(formatConfig.courts) && formatConfig.courts.length > 0) {
      return `${formatConfig.courts.length} dedicated courts`;
    }
    return 'Dedicated Tournament Courts';
  }, [formatConfig]);

  // ─── 7. Scheduling Engine ──────────────────────────────────────────────
  const schedulingEngineInfo = useMemo(() => {
    if (format === 'round_robin') {
      return 'Round-Robin Berger Tables (All-play-all schedule)';
    }
    if (format === 'bracket') {
      const bType = String(formatConfig.bracket_type || formatConfig.bracket_format || 'Single Elimination');
      return `${bType} Bracket Engine (Deterministic seed pairings)`;
    }
    if (format === 'scramble') {
      return 'Dynamic Partner Rotation Matrix (Fair round pairings)';
    }
    if (format === 'pool_play') {
      return 'Serpentine Pool Play & Knockout Bracket Engine';
    }
    return 'Standard Tournament Scheduling Engine';
  }, [format, formatConfig]);

  // ─── 8. Capacity & Entry Fee ───────────────────────────────────────────
  const maxCount = tournament?.max_participants ?? 8;
  const entryUnit = parsed.isSingles ? 'Players' : 'Teams';
  const entryFeeDisplay = useMemo(() => {
    if (parsed.entryFee != null && parsed.entryFee > 0) {
      return `$${parsed.entryFee.toFixed(2)}${parsed.isSingles ? ' / player' : ' / team'}`;
    }
    if (parsed.entryFeeDisplay && !parsed.entryFeeDisplay.toLowerCase().includes('free')) {
      return parsed.entryFeeDisplay;
    }
    return 'Free ($0.00)';
  }, [parsed]);

  // ─── 9. Format-Specific Competition Structure ──────────────────────────
  const eliminationType = String(formatConfig.bracket_type || formatConfig.bracket_format || 'Single Elimination');
  const bracketSize = Math.pow(
    2,
    Math.ceil(Math.log2(Math.max(2, parsed.capacity.entryCount || tournament?.max_participants || 8)))
  );
  const bracketRounds = Math.ceil(Math.log2(bracketSize));
  const hasConsolation = Boolean(formatConfig.has_consolation_bracket || formatConfig.bronze_match);
  const poolCount = Number(formatConfig.pool_count || formatConfig.num_pools || 2);
  const qualifiersPerPool = Number(formatConfig.qualifiers_per_pool || 2);
  const teamsPerPool = Math.ceil(maxCount / poolCount);
  const plannedRounds = Number(formatConfig.planned_rounds || 5);
  const roundRobinRounds = Math.max(1, maxCount - 1);

  // ─── 10. Tiebreaker Hierarchy List ─────────────────────────────────────
  const tiebreakers = useMemo(() => {
    if (format === 'scramble') {
      return [
        { num: 1, title: 'Total Individual Points', desc: 'Cumulative score across all played rounds' },
        { num: 2, title: 'Total Games Played', desc: 'Rounds completed' },
        { num: 3, title: 'Point Differential', desc: 'Points scored minus opponent points allowed' },
        { num: 4, title: 'Player Name (A–Z)', desc: 'Alphabetical order' },
      ];
    }
    if (format === 'bracket') {
      return [
        { num: 1, title: 'Bracket Progression', desc: 'Furthest round reached in the championship tree' },
        { num: 2, title: 'Initial Tournament Seed', desc: 'Higher tournament seed takes precedence' },
        { num: 3, title: 'Point Differential', desc: 'Cumulative point differential across all matches' },
      ];
    }
    // Round Robin & Pool Play
    return [
      { num: 1, title: 'Match Wins', desc: 'Total match victories in the tournament' },
      { num: 2, title: 'Head-to-Head Record', desc: 'Direct match outcome between tied opponents' },
      { num: 3, title: 'Point Differential', desc: 'Points scored minus points conceded' },
      { num: 4, title: 'Total Points Scored', desc: 'Total offensive points scored in all matches' },
      { num: 5, title: 'Participant Name (A–Z)', desc: 'Alphabetical order by player or team name' },
    ];
  }, [format]);

  // Clean description without legacy bracket tags or serialized metadata
  const cleanDescription = useMemo(() => {
    if (!tournament?.description) return null;
    let desc = tournament.description.trim();

    // Strip bracketed metadata e.g. [Singles • Skill: 3.5–4.5 • Any • Age: 20–30 • Fee: $65/player]
    desc = desc.replace(/\[\s*(?:singles|doubles)?\s*[\s\S]*?fee:[^\]]*\]/gi, '').trim();
    // Strip leading bracket tokens [ ... ]
    desc = desc.replace(/^\[[^\]]+\]\s*/, '').trim();

    if (desc.startsWith('{') || desc.startsWith('[')) return null;

    const isMetadataOnly =
      /(?:singles|doubles)/i.test(desc) &&
      /skill/i.test(desc) &&
      /(?:fee|\$)/i.test(desc) &&
      desc.length < 130 &&
      !desc.includes('\n');
    if (isMetadataOnly) return null;

    return desc.length > 0 ? desc : null;
  }, [tournament?.description]);

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
              About the Tournament
            </AppText>
          </View>
          <AppText style={styles.descriptionText}>{cleanDescription}</AppText>
        </Card>
      ) : null}

      {/* ─── 2. Tournament Information Card ─── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconWrap}>
            <Tag size={15} color="#176B57" />
          </View>
          <AppText variant="body" bold style={styles.cardTitle}>
            Tournament Information
          </AppText>
        </View>

        <View style={styles.rowsList}>
          <InfoRow
            label="Competition Format"
            value={competitionFormatDisplay}
            isTablet={isTablet}
          />
          <InfoRow
            label="Division"
            value={divisionDisplay}
            isTablet={isTablet}
          />
          <InfoRow
            label="Registration Type"
            value={registrationTypeDisplay}
            isTablet={isTablet}
          />
          <InfoRow
            label="Skill Eligibility"
            value={parsed.skillLevelDisplay || parsed.skillLevel || 'Open / All Levels'}
            isTablet={isTablet}
          />
          <InfoRow
            label="Gender Eligibility"
            value={parsed.genderEligibility || 'Any / All Genders'}
            isTablet={isTablet}
          />
          <InfoRow
            label="Age Group"
            value={ageDisplay}
            isTablet={isTablet}
          />
          <InfoRow
            label="Registration Fee"
            value={entryFeeDisplay}
            isTablet={isTablet}
          />
          <InfoRow
            label="Maximum Capacity"
            value={`${maxCount} ${entryUnit}`}
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
            label="Tournament Dates"
            value={datesDisplay}
            isTablet={isTablet}
          />
          <InfoRow
            label="Start Time"
            value={startTimeDisplay}
            isTablet={isTablet}
            accessibilityLabel={`Tournament Start Time: ${startTimeDisplay}`}
            testID="tournament-start-time"
          />
          <InfoRow
            label="End Time"
            value={endTimeDisplay}
            isTablet={isTablet}
            accessibilityLabel={`Tournament End Time: ${endTimeDisplay}`}
            testID="tournament-end-time"
          />
          <InfoRow
            label="Registration Deadline"
            value={deadlineDisplay}
            isTablet={isTablet}
          />
          <InfoRow
            label="Host Club"
            value={tournament?.club_name || 'Pickleball Club'}
            isTablet={isTablet}
          />
          <InfoRow
            label="Venue Location"
            value={tournament?.location_name || tournament?.club_name || 'Dedicated Pickleball Facility'}
            isTablet={isTablet}
          />
          <InfoRow
            label="Assigned Courts"
            value={courtsAssigned}
            isTablet={isTablet}
          />
          <InfoRow
            label="Scheduling Engine"
            value={schedulingEngineInfo}
            isTablet={isTablet}
            isLast
          />
        </View>
      </Card>

      {/* ─── 4. Format-Specific Competition Structure Card ─── */}
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.iconWrap}>
            <Trophy size={15} color="#176B57" />
          </View>
          <AppText variant="body" bold style={styles.cardTitle}>
            {formatLabel} Structure
          </AppText>
        </View>

        <View style={styles.rowsList}>
          {format === 'round_robin' && (
            <>
              <InfoRow
                label="Format Type"
                value="All-Play-All Round Robin"
                isTablet={isTablet}
              />
              <InfoRow
                label="Scheduled Rounds"
                value={`${roundRobinRounds} scheduled rounds`}
                isTablet={isTablet}
              />
              <InfoRow
                label="Matchup Scheduling"
                value="Round-Robin Berger Tables (balanced court allocation)"
                isTablet={isTablet}
              />
              <InfoRow
                label="Standings Hierarchy"
                value="Ranked by Match Wins · Point Differential · Points Scored"
                isTablet={isTablet}
                isLast
              />
            </>
          )}

          {format === 'bracket' && (
            <>
              <InfoRow
                label="Elimination Type"
                value={`${eliminationType} Bracket`}
                isTablet={isTablet}
              />
              <InfoRow
                label="Bracket Structure"
                value={`${bracketSize}-Entry Bracket (${bracketRounds} elimination rounds)`}
                isTablet={isTablet}
              />
              <InfoRow
                label="Seeding Method"
                value={String(formatConfig.seeding_method || 'Rating Seeding')}
                isTablet={isTablet}
              />
              <InfoRow
                label="Consolation Play"
                value={hasConsolation ? '3rd Place Consolation Final Included' : 'Single Bracket Elimination'}
                isTablet={isTablet}
              />
              <InfoRow
                label="First-Round BYEs"
                value="Automatic BYE allocation for highest-seeded entries"
                isTablet={isTablet}
                isLast
              />
            </>
          )}

          {format === 'pool_play' && (
            <>
              <InfoRow
                label="Pools Configuration"
                value={`${poolCount} Preliminary Pools (~${teamsPerPool} entrants per pool)`}
                isTablet={isTablet}
              />
              <InfoRow
                label="Pool Play Schedule"
                value="Intra-pool round-robin fixtures"
                isTablet={isTablet}
              />
              <InfoRow
                label="Championship Advancement"
                value={`Top ${qualifiersPerPool} from each pool qualify for Championship`}
                isTablet={isTablet}
              />
              <InfoRow
                label="Championship Knockout"
                value="Single-elimination championship knockout bracket"
                isTablet={isTablet}
                isLast
              />
            </>
          )}

          {format === 'scramble' && (
            <>
              <InfoRow
                label="Competition Format"
                value="Individual Rotating Scramble"
                isTablet={isTablet}
              />
              <InfoRow
                label="Partner Rotation Rule"
                value="Dynamic round-by-round partner rotation matrix"
                isTablet={isTablet}
              />
              <InfoRow
                label="Planned Rounds"
                value={`${plannedRounds} rotation rounds`}
                isTablet={isTablet}
              />
              <InfoRow
                label="Leaderboard Metric"
                value="Individual cumulative point scoring across all rounds"
                isTablet={isTablet}
                isLast
              />
            </>
          )}
        </View>
      </Card>

      {/* ─── 5. Game Rules & Scoring Card ─── */}
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
            value={humanizeGameFormat(gameFormat)}
            isTablet={isTablet}
          />
          <InfoRow
            label="Target Score"
            value={`${targetScore} Points`}
            isTablet={isTablet}
          />
          <InfoRow
            label="Win-by Margin"
            value={`${winBy} Points (win by ${winBy})`}
            isTablet={isTablet}
          />
          <InfoRow
            label="Scoring System"
            value={
              format === 'scramble'
                ? 'Rally / Side-out point accumulation'
                : 'Traditional Side-out Scoring'
            }
            isTablet={isTablet}
          />

          {/* Compact Tiebreaker Order Box */}
          <View style={styles.tiebreakerBox}>
            <AppText style={styles.tiebreakerHeader}>Tiebreaker Hierarchy</AppText>
            <View style={styles.tiebreakerList}>
              {tiebreakers.map((t) => (
                <AppText key={t.num} style={styles.tiebreakerItem}>
                  {t.num}. {t.title}
                  <AppText style={styles.tiebreakerDesc}> — {t.desc}</AppText>
                </AppText>
              ))}
            </View>
          </View>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
    backgroundColor: '#F2F8F5',
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
  infoValueTabletWrap: {
    flex: 1,
    alignItems: 'flex-end',
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
    gap: 5,
  },
  tiebreakerItem: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 18,
  },
  tiebreakerDesc: {
    fontSize: 12,
    fontWeight: '400',
    color: '#64748B',
  },
});
