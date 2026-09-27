/**
 * Aught2 Pickleball — ScrambleStandingsTab
 *
 * Tab 4 for Scramble Tournament Workspace:
 * Screen 4 exact match:
 * - Heading: "Individual Standings" & subtitle "Rankings update automatically as match results are recorded."
 * - Table header: # | PLAYER | W-L | PD | PS/PA
 * - Empty state card: Trophy icon, "No match results recorded yet", description
 * - Bottom card: "Tiebreaker Order" with 5 numbered circles & descriptions
 * - Populated state: Ranked table rows + Champion showcase when completed
 */

import React from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Award, Medal, Trophy } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Radius, Spacing } from '@/theme';
import type { ScrambleStandingRow, ScrambleState } from '@/types/scramble';

interface ScrambleStandingsTabProps {
  state: ScrambleState | null;
  standings: ScrambleStandingRow[];
  isLoading?: boolean;
}

export function ScrambleStandingsTab({
  state,
  standings,
  isLoading = false,
}: ScrambleStandingsTabProps) {
  const isCompleted = state?.tournament_status === 'completed';
  const totalGames = state?.total_games ?? 0;
  const completedGames = state?.games_completed ?? 0;
  const champion =
    isCompleted &&
    totalGames > 0 &&
    completedGames === totalGames &&
    standings.length > 0
      ? standings[0]
      : null;

  // Have any games been recorded?
  const hasResults =
    standings.length > 0 &&
    standings.some((s) => s.matches_played > 0 || s.wins > 0 || s.losses > 0);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* ── 1. Heading & Description ── */}
      <View style={styles.headingSection}>
        <AppText style={styles.headingTitle}>
          {isCompleted ? 'Official Standings' : 'Live Standings (Provisional)'}
        </AppText>
        <AppText style={styles.headingSubtitle}>
          {isCompleted
            ? 'Final player rankings based on completed game results.'
            : 'Rankings update automatically in real-time as match results are recorded.'}
        </AppText>
      </View>

      {/* Champion Banner if Tournament is Completed */}
      {champion && (
        <View style={styles.championBanner}>
          <View style={styles.championHeader}>
            <View style={styles.trophyIconWrap}>
              <Trophy size={28} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={styles.championPreTitle}>TOURNAMENT CHAMPION</AppText>
              <AppText style={styles.championName}>{champion.display_name}</AppText>
            </View>
          </View>

          <View style={styles.championStatsRow}>
            <View style={styles.championStatItem}>
              <AppText style={styles.championStatLabel}>RECORD</AppText>
              <AppText style={styles.championStatValue}>
                {champion.wins}W - {champion.losses}L
              </AppText>
            </View>
            <View style={styles.championStatItem}>
              <AppText style={styles.championStatLabel}>POINT DIFF</AppText>
              <AppText style={[styles.championStatValue, { color: '#08785E' }]}>
                {champion.points_differential > 0
                  ? `+${champion.points_differential}`
                  : champion.points_differential}
              </AppText>
            </View>
            <View style={styles.championStatItem}>
              <AppText style={styles.championStatLabel}>PS / PA</AppText>
              <AppText style={styles.championStatValue}>
                {champion.points_scored} / {champion.points_allowed}
              </AppText>
            </View>
          </View>
        </View>
      )}

      {/* ── 2. Standings Table or Empty State ── */}
      {!hasResults ? (
        // Empty State matching Screen 4
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <Trophy size={32} color="#71817E" />
          </View>

          <AppText style={styles.emptyTitle}>No match results recorded yet</AppText>
          <AppText style={styles.emptyDescription}>
            Standings will appear here after matches are played and scores are entered.
          </AppText>
        </View>
      ) : (
        // Populated Table
        <View style={styles.tableCard}>
          {/* Table Header */}
          <View style={styles.tableHeaderRow}>
            <View style={styles.rankCol}>
              <AppText style={styles.tableHeaderText}>#</AppText>
            </View>
            <View style={styles.playerCol}>
              <AppText style={styles.tableHeaderText}>PLAYER</AppText>
            </View>
            <View style={styles.statCol}>
              <AppText style={styles.tableHeaderText}>W-L</AppText>
            </View>
            <View style={styles.statCol}>
              <AppText style={styles.tableHeaderText}>PD</AppText>
            </View>
            <View style={styles.statColLong}>
              <AppText style={styles.tableHeaderText}>PS/PA</AppText>
            </View>
          </View>

          {/* Table Rows */}
          {standings.map((item, idx) => {
            const isTop3 = item.rank <= 3;
            const diffPositive = item.points_differential > 0;
            const diffNegative = item.points_differential < 0;

            return (
              <View
                key={item.player_membership_id}
                style={[
                  styles.tableRow,
                  idx % 2 === 1 && styles.tableRowAlt,
                  idx === standings.length - 1 && styles.tableRowLast,
                ]}
              >
                {/* Rank */}
                <View style={styles.rankCol}>
                  {item.rank === 1 ? (
                    <View style={[styles.rankMedal, { backgroundColor: '#FEF3C7' }]}>
                      <Medal size={13} color="#D97706" />
                    </View>
                  ) : item.rank === 2 ? (
                    <View style={[styles.rankMedal, { backgroundColor: '#F1F5F9' }]}>
                      <Medal size={13} color="#64748B" />
                    </View>
                  ) : item.rank === 3 ? (
                    <View style={[styles.rankMedal, { backgroundColor: '#FFEDD5' }]}>
                      <Medal size={13} color="#C2410C" />
                    </View>
                  ) : (
                    <AppText style={styles.rankNumberText}>{item.rank}</AppText>
                  )}
                </View>

                {/* Player Name */}
                <View style={styles.playerCol}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <AppText numberOfLines={1} style={[styles.playerNameText, { flexShrink: 1 }]}>
                      {item.display_name}
                    </AppText>
                    {item.skill_rating != null && (
                      <View style={styles.ratingBadge}>
                        <AppText style={styles.ratingBadgeText}>
                          {Number(item.skill_rating).toFixed(1)}
                        </AppText>
                      </View>
                    )}
                  </View>
                </View>

                {/* W-L */}
                <View style={styles.statCol}>
                  <AppText style={styles.statTextBold}>
                    {item.wins}-{item.losses}
                  </AppText>
                </View>

                {/* PD */}
                <View style={styles.statCol}>
                  <AppText
                    style={[
                      styles.statTextBold,
                      diffPositive && { color: '#08785E' },
                      diffNegative && { color: '#DC2626' },
                    ]}
                  >
                    {diffPositive ? `+${item.points_differential}` : item.points_differential}
                  </AppText>
                </View>

                {/* PS/PA */}
                <View style={styles.statColLong}>
                  <AppText style={styles.statTextMuted}>
                    {item.points_scored}/{item.points_allowed}
                  </AppText>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── 3. Bottom Card: Tiebreaker Order ── */}
      <View style={styles.tiebreakCard}>
        <View style={styles.tiebreakHeader}>
          <Award size={20} color="#D97706" />
          <AppText style={styles.tiebreakTitle}>Tiebreaker Order</AppText>
        </View>

        <AppText style={styles.tiebreakSubtitle}>
          Rankings are calculated using the following priority order:
        </AppText>

        <View style={styles.tiebreakList}>
          {/* Priority 1 */}
          <View style={styles.tiebreakItem}>
            <View style={styles.numberCircle}>
              <AppText style={styles.numberCircleText}>1</AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={styles.tiebreakItemTitle}>Most Wins</AppText>
              <AppText style={styles.tiebreakItemDesc}>Total match victories (Descending)</AppText>
            </View>
          </View>

          {/* Priority 2 */}
          <View style={styles.tiebreakItem}>
            <View style={styles.numberCircle}>
              <AppText style={styles.numberCircleText}>2</AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={styles.tiebreakItemTitle}>Point Differential</AppText>
              <AppText style={styles.tiebreakItemDesc}>
                Points scored minus points allowed (Descending)
              </AppText>
            </View>
          </View>

          {/* Priority 3 */}
          <View style={styles.tiebreakItem}>
            <View style={styles.numberCircle}>
              <AppText style={styles.numberCircleText}>3</AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={styles.tiebreakItemTitle}>Total Points Scored</AppText>
              <AppText style={styles.tiebreakItemDesc}>Total points scored (Descending)</AppText>
            </View>
          </View>

          {/* Priority 4 */}
          <View style={styles.tiebreakItem}>
            <View style={styles.numberCircle}>
              <AppText style={styles.numberCircleText}>4</AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={styles.tiebreakItemTitle}>Player Name</AppText>
              <AppText style={styles.tiebreakItemDesc}>
                Alphabetical order (Ascending, case-insensitive)
              </AppText>
            </View>
          </View>

          {/* Priority 5 */}
          <View style={styles.tiebreakItem}>
            <View style={styles.numberCircle}>
              <AppText style={styles.numberCircleText}>5</AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={styles.tiebreakItemTitle}>Player ID</AppText>
              <AppText style={styles.tiebreakItemDesc}>UUID fallback (Ascending)</AppText>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[3],
    paddingBottom: Spacing[8],
    gap: Spacing[3],
  },
  headingSection: {
    marginBottom: Spacing[1],
  },
  headingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#102E2A',
  },
  headingSubtitle: {
    fontSize: 13,
    color: '#71817E',
    marginTop: 2,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg ?? 16,
    borderWidth: 1,
    borderColor: '#DCE8E3',
    paddingVertical: Spacing[8],
    paddingHorizontal: Spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F3FAF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[3],
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102E2A',
    textAlign: 'center',
    marginBottom: Spacing[2],
  },
  emptyDescription: {
    fontSize: 13,
    lineHeight: 19,
    color: '#71817E',
    textAlign: 'center',
    maxWidth: 280,
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg ?? 16,
    borderWidth: 1,
    borderColor: '#DCE8E3',
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAF9',
    paddingVertical: 10,
    paddingHorizontal: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: '#DCE8E3',
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#71817E',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableRowAlt: {
    backgroundColor: '#FAFCFB',
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  rankCol: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankMedal: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#71817E',
  },
  playerCol: {
    flex: 1,
    paddingHorizontal: 8,
  },
  playerNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102E2A',
  },
  ratingBadge: {
    backgroundColor: '#E0F2FE',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  ratingBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0369A1',
  },
  statCol: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statColLong: {
    width: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statTextBold: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102E2A',
  },
  statTextMuted: {
    fontSize: 12,
    color: '#71817E',
  },
  tiebreakCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg ?? 16,
    borderWidth: 1,
    borderColor: '#DCE8E3',
    padding: Spacing[4],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  tiebreakHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginBottom: 4,
  },
  tiebreakTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102E2A',
  },
  tiebreakSubtitle: {
    fontSize: 12,
    color: '#71817E',
    marginBottom: Spacing[3],
  },
  tiebreakList: {
    gap: Spacing[3],
  },
  tiebreakItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  numberCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F3FAF5',
    borderWidth: 1,
    borderColor: '#DCE8E3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberCircleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#102E2A',
  },
  tiebreakItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102E2A',
  },
  tiebreakItemDesc: {
    fontSize: 11,
    color: '#71817E',
  },
  championBanner: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
    borderWidth: 1.5,
    borderRadius: Radius.lg ?? 16,
    padding: Spacing[4],
    gap: Spacing[3],
  },
  championHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  trophyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  championPreTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.8,
  },
  championName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#102E2A',
  },
  championStatsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  championStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  championStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#71817E',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  championStatValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#102E2A',
  },
});
