/**
 * Aught2 Pickleball — TournamentRegistrationSummaryCard
 *
 * Standardized registration and category overview card displayed at the top
 * of the Players / Teams tab across all tournament formats:
 * - Round Robin
 * - Single / Double Elimination Bracket
 * - Rotating Partner Scramble
 * - Pool Play
 *
 * Shows:
 * - Registered players (X / Y)
 * - Registered teams (if doubles) (X / Y)
 * - Competition category (e.g. Singles, Men's Doubles)
 * - Registration type (e.g. Singles individual, Fixed teams, Individual scramble)
 * - Optional format-specific extra metric rows
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Radius, Spacing } from '@/theme';

export interface RegistrationSummaryExtraRow {
  label: string;
  value: string | number;
}

export interface TournamentRegistrationSummaryCardProps {
  registeredPlayersCount: number;
  maxPlayersCount: number;
  isDoubles?: boolean;
  registeredTeamsCount?: number;
  maxTeamsCount?: number;
  categoryLabel: string;
  registrationTypeLabel: string;
  extraRows?: RegistrationSummaryExtraRow[];
}

export function TournamentRegistrationSummaryCard({
  registeredPlayersCount,
  maxPlayersCount,
  isDoubles = false,
  registeredTeamsCount,
  maxTeamsCount,
  categoryLabel,
  registrationTypeLabel,
  extraRows = [],
}: TournamentRegistrationSummaryCardProps) {
  const displayMaxPlayers = maxPlayersCount > 0 ? maxPlayersCount : registeredPlayersCount;
  const displayMaxTeams =
    maxTeamsCount && maxTeamsCount > 0 ? maxTeamsCount : registeredTeamsCount ?? 0;

  return (
    <Card style={styles.card}>
      {/* Registered Players Row */}
      <View style={styles.row}>
        <AppText style={styles.label}>Registered players:</AppText>
        <AppText style={styles.value}>
          {registeredPlayersCount} / {displayMaxPlayers}
        </AppText>
      </View>

      {/* Registered Teams Row (for Doubles / Teams) */}
      {isDoubles && registeredTeamsCount !== undefined && (
        <View style={styles.row}>
          <AppText style={styles.label}>Registered teams:</AppText>
          <AppText style={styles.value}>
            {registeredTeamsCount} / {displayMaxTeams}
          </AppText>
        </View>
      )}

      {/* Competition Category Row */}
      <View style={styles.row}>
        <AppText style={styles.label}>Competition category:</AppText>
        <AppText style={styles.value}>{categoryLabel}</AppText>
      </View>

      {/* Registration Type Row */}
      <View style={styles.row}>
        <AppText style={styles.label}>Registration type:</AppText>
        <AppText style={styles.value}>{registrationTypeLabel}</AppText>
      </View>

      {/* Extra Format-Specific Rows (if any) */}
      {extraRows.map((row) => (
        <View key={row.label} style={styles.row}>
          <AppText style={styles.label}>{row.label}:</AppText>
          <AppText style={styles.value}>{row.value}</AppText>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: Spacing[4],
    gap: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 1,
  },
  label: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
});

