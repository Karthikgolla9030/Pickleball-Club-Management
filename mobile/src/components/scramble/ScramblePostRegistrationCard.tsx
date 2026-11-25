/**
 * Aught2 Pickleball — ScramblePostRegistrationCard
 *
 * Compact, lightweight status summary card for Scramble Tournaments in Overview tab.
 * - Same horizontal margins and visual weight as Tournament Progress card.
 * - Single row header with status badge.
 * - Single short status line.
 * - Single compact navigation link.
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ChevronRight, SlidersHorizontal } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { competitionApi } from '@/services/api/competition';
import { Radius, Spacing } from '@/theme';
import type { Tournament } from '@/types';

interface ScramblePostRegistrationCardProps {
  clubId: string;
  tournamentId: string;
  tournament: Tournament;
  canManage: boolean;
  onNavigateToSetup?: () => void;
  onGenerated?: () => void | Promise<void>;
  onStartTournament?: () => void | Promise<void>;
  isStartingTournament?: boolean;
}

export function ScramblePostRegistrationCard({
  clubId,
  tournamentId,
  tournament,
  canManage,
  onNavigateToSetup,
}: ScramblePostRegistrationCardProps) {
  const [loading, setLoading] = useState(true);
  const [setupData, setSetupData] = useState<any>(null);

  const fetchSetup = async () => {
    try {
      setLoading(true);
      const res = await competitionApi.getScramblePostRegistrationSetup(clubId, tournamentId);
      setSetupData(res);
    } catch (err) {
      console.warn('Failed to fetch scramble post-registration setup:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tournament?.status === 'registration_closed') {
      void fetchSetup();
    }
  }, [clubId, tournamentId, tournament?.status]);

  if (tournament?.status !== 'registration_closed') {
    return null;
  }

  if (loading && !setupData) {
    return (
      <Card style={styles.card}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#0F766E" />
          <AppText style={styles.loadingText}>Loading setup status...</AppText>
        </View>
      </Card>
    );
  }

  const isGenerated = setupData?.is_generated ?? false;
  const playerCount = setupData?.confirmed_player_count ?? tournament?.participant_count ?? 0;
  const hasMinPlayers = playerCount >= 4;

  const badgeLabel = !hasMinPlayers
    ? 'Waiting for players'
    : isGenerated
    ? 'Configured'
    : 'Ready to configure';

  const badgeVariant: 'warning' | 'info' | 'success' = !hasMinPlayers
    ? 'warning'
    : isGenerated
    ? 'success'
    : 'info';

  const statusMessage = !hasMinPlayers
    ? 'Waiting for 4 confirmed players.'
    : isGenerated
    ? 'Rotation schedule configured.'
    : 'Ready to configure rotation rounds and partner rules.';

  return (
    <Card style={styles.card}>
      {/* ─── Compact Header ─────────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeftCol}>
          <View style={styles.iconCircle}>
            <SlidersHorizontal size={14} color="#0F766E" />
          </View>
          <AppText style={styles.cardTitle}>Scramble Setup</AppText>
        </View>
        <Badge label={badgeLabel} variant={badgeVariant} size="sm" />
      </View>

      {/* ─── One Short Status Line ──────────────────────────────────────── */}
      <AppText style={styles.statusMessage}>{statusMessage}</AppText>

      {/* ─── Compact Navigation Link ───────────────────────────────────── */}
      {onNavigateToSetup ? (
        <TouchableOpacity
          style={styles.ctaLink}
          onPress={onNavigateToSetup}
          activeOpacity={0.7}
        >
          <AppText style={styles.ctaLinkText}>
            {isGenerated ? 'View in Setup & Rounds →' : 'Configure Setup & Rounds →'}
          </AppText>
        </TouchableOpacity>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DEF2E6',
    borderRadius: Radius.lg,
    padding: Spacing[3.5],
    gap: Spacing[2.5],
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[1],
  },
  loadingText: {
    fontSize: 12.5,
    color: '#64748B',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  headerLeftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  iconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#DEF2E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  statusMessage: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  ctaLink: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  ctaLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F766E',
  },
});
