/**
 * Aught2 Pickleball — Player Competition Schedule Screen (Phase 17)
 *
 * Displays personal match schedules across tournaments and leagues for the authenticated player:
 *   - Tabs: "Upcoming", "Today", "Past"
 *   - Cards with court assignment, scheduled times, opponent, and partner details
 *   - Pull to refresh
 */

import React, { useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import {
  AppText,
  Badge,
  Card,
  EmptyState,
  LoadingState,
  Screen,
  ScreenHeader,
  SegmentedTabs,
  AppHeader,
} from '@/components';
import { usePlayerCompetitionSchedule } from '@/hooks';
import { Colors, Radius, Spacing } from '@/theme';
import type { PlayerMatchScheduleResponse } from '@/types';

type TabKey = 'upcoming' | 'today' | 'past';

function formatMatchDateTime(isoString?: string | null): string {
  if (!isoString) return 'Date TBD';
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatTimeOnly(isoString?: string | null): string {
  if (!isoString) return '--:--';
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function PlayerCompetitionScheduleScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>('upcoming');

  const {
    data: matches,
    isLoading,
    isRefetching,
    refetch,
  } = usePlayerCompetitionSchedule();

  // Categorize matches
  const { todayMatches, upcomingMatches, pastMatches } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayList: PlayerMatchScheduleResponse[] = [];
    const upcomingList: PlayerMatchScheduleResponse[] = [];
    const pastList: PlayerMatchScheduleResponse[] = [];

    (matches || []).forEach((m) => {
      if (!m.scheduled_start_at) {
        upcomingList.push(m);
        return;
      }
      const matchDate = new Date(m.scheduled_start_at);

      if (m.status === 'completed' || matchDate < today) {
        pastList.push(m);
      } else if (matchDate >= today && matchDate < tomorrow) {
        todayList.push(m);
      } else {
        upcomingList.push(m);
      }
    });

    return {
      todayMatches: todayList,
      upcomingMatches: upcomingList,
      pastMatches: pastList,
    };
  }, [matches]);

  const currentList =
    activeTab === 'today'
      ? todayMatches
      : activeTab === 'upcoming'
      ? upcomingMatches
      : pastMatches;

  const tabs = useMemo(
    () => [
      { key: 'today' as TabKey, label: `Today (${todayMatches.length})` },
      { key: 'upcoming' as TabKey, label: `Upcoming (${upcomingMatches.length})` },
      { key: 'past' as TabKey, label: `Past (${pastMatches.length})` },
    ],
    [todayMatches.length, upcomingMatches.length, pastMatches.length]
  );

  return (
    <Screen style={styles.container}>
      <AppHeader title="Competition Schedule" />
      <ScreenHeader
        title="My Matches"
        subtitle="Personal competition schedule & court assignments"
      />

      {/* Tabs */}
      <View style={styles.tabWrapper}>
        <SegmentedTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab)}
        />
      </View>

      {/* List */}
      {isLoading ? (
        <LoadingState message="Loading your matches..." />
      ) : currentList.length === 0 ? (
        <EmptyState
          title={
            activeTab === 'today'
              ? 'No Matches Today'
              : activeTab === 'upcoming'
              ? 'No Upcoming Matches'
              : 'No Past Matches'
          }
          description={
            activeTab === 'today'
              ? 'You have no tournament or league matches scheduled for today.'
              : activeTab === 'upcoming'
              ? 'Matches will appear here as soon as the club assigns courts and start times.'
              : 'Completed and past matches will be listed here.'
          }
        />
      ) : (
        <FlatList
          data={currentList}
          keyExtractor={(item) => item.match_id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.brand.primary}
            />
          }
          renderItem={({ item }) => {
            const compLabel = item.competition_type === 'tournament' ? 'Tournament' : 'League';
            const isCompleted = item.status === 'completed';

            return (
              <Card style={styles.matchCard}>
                <View style={styles.cardHeader}>
                  <Badge
                    label={compLabel}
                    variant={item.competition_type === 'tournament' ? 'default' : 'info'}
                  />
                  {item.court_name ? (
                    <Badge label={item.court_name} variant="info" />
                  ) : (
                    <Badge label="Court Unassigned" variant="warning" />
                  )}
                </View>

                {/* Competition Name */}
                <AppText variant="caption" style={styles.compName}>
                  {item.competition_name}
                </AppText>

                {/* Time */}
                <View style={styles.timeRow}>
                  <AppText variant="title" style={styles.timeText}>
                    {formatMatchDateTime(item.scheduled_start_at)}
                  </AppText>
                  {item.scheduled_end_at && (
                    <AppText variant="caption" style={styles.durationBadge}>
                      until {formatTimeOnly(item.scheduled_end_at)} ({item.duration_minutes ?? 60}m)
                    </AppText>
                  )}
                </View>

                {/* Matchup */}
                <View style={styles.matchupBox}>
                  {item.my_team_name && (
                    <AppText variant="body" style={styles.myTeam}>
                      My Team: {item.my_team_name}
                    </AppText>
                  )}
                  {item.partner_name && (
                    <AppText variant="caption" style={styles.partnerText}>
                      Partner: {item.partner_name}
                    </AppText>
                  )}
                  <AppText variant="title" style={styles.opponentText}>
                    vs {item.opponent_name || 'TBD'}
                  </AppText>
                </View>

                {/* Status Footer */}
                <View style={styles.cardFooter}>
                  <AppText variant="caption" style={styles.roundMeta}>
                    {item.round_number ? `Round ${item.round_number}` : ''}
                    {item.match_number ? ` • Match #${item.match_number}` : ''}
                  </AppText>
                  <Badge
                    label={isCompleted ? 'Completed' : item.status === 'in_progress' ? 'Live' : 'Scheduled'}
                    variant={isCompleted ? 'success' : item.status === 'in_progress' ? 'error' : 'default'}
                  />
                </View>
              </Card>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  tabWrapper: {
    paddingHorizontal: Spacing[4],
    marginBottom: Spacing[3],
  },
  listContent: {
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[8],
  },
  matchCard: {
    marginBottom: Spacing[3],
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.lg,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[1],
  },
  compName: {
    color: Colors.text.secondary,
    marginBottom: Spacing[1],
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing[2],
    marginBottom: Spacing[2],
  },
  timeText: {
    color: Colors.brand.primary,
    fontWeight: '700',
  },
  durationBadge: {
    color: Colors.text.tertiary,
  },
  matchupBox: {
    backgroundColor: Colors.surface.elevated,
    padding: Spacing[2],
    borderRadius: Radius.md,
    marginBottom: Spacing[2],
  },
  myTeam: {
    color: Colors.text.primary,
    fontWeight: '600',
  },
  partnerText: {
    color: Colors.text.secondary,
    marginTop: 2,
  },
  opponentText: {
    color: Colors.text.primary,
    fontWeight: '700',
    marginTop: Spacing[1],
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.surface.border,
    paddingTop: Spacing[1],
  },
  roundMeta: {
    color: Colors.text.tertiary,
  },
});
