/**
 * Aught2 Pickleball — ScramblePostRegistrationCard
 *
 * Compact, read-only status card for Scramble Tournaments in the Overview tab:
 * - Shows only high-level configuration status and clear next step.
 * - Standardized card width with identical 16px page margins as neighboring cards.
 * - NO repeated metrics, NO nested warning boxes, NO duplicate configuration controls.
 * - Provides ONE clear action to navigate to the Setup & Rounds workspace.
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ChevronRight, Layers, SlidersHorizontal } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
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
  onStartTournament,
  isStartingTournament = false,
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
          <AppText style={styles.loadingText}>Loading configuration status...</AppText>
        </View>
      </Card>
    );
  }

  const isGenerated = setupData?.is_generated ?? false;
  const playerCount = setupData?.confirmed_player_count ?? tournament?.participant_count ?? 0;
  const stage = setupData?.configuration_stage ?? 'awaiting_format_configuration';
  const isReadyToStart = isGenerated && stage === 'ready_to_start';
  const hasMinPlayers = playerCount >= 4;

  const getBadgeInfo = (): { label: string; variant: 'success' | 'info' | 'warning' } => {
    if (isReadyToStart) return { label: 'Ready to Start', variant: 'success' };
    if (isGenerated) return { label: 'Configured', variant: 'info' };
    if (!hasMinPlayers) return { label: 'Waiting for Players', variant: 'warning' };
    return { label: 'Awaiting Configuration', variant: 'warning' };
  };

  const getStatusText = (): { title: string; desc: string } => {
    if (isReadyToStart) {
      return {
        title: 'Ready to start',
        desc: 'Scramble rotation matches and court assignments verified.',
      };
    }
    if (isGenerated) {
      return {
        title: 'Schedule generated',
        desc: `Rotation schedule active across ${setupData?.selected_rounds ?? 5} rounds.`,
      };
    }
    if (!hasMinPlayers) {
      return {
        title: 'Waiting for confirmed players',
        desc: 'Scramble rotation configuration will be available when at least 4 players are confirmed.',
      };
    }
    return {
      title: 'Configuration required',
      desc: 'Configure rotation rounds and partner rules in Setup & Rounds.',
    };
  };

  const badge = getBadgeInfo();
  const status = getStatusText();

  return (
    <Card style={styles.card}>
      {/* ─── Compact Header ─────────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeftCol}>
          <View style={styles.iconCircle}>
            <Layers size={16} color="#0F766E" />
          </View>
          <AppText style={styles.cardTitle}>Scramble Setup</AppText>
        </View>
        <Badge label={badge.label} variant={badge.variant} size="sm" />
      </View>

      {/* ─── Short Status Explanation ───────────────────────────────────── */}
      <View style={styles.statusBox}>
        <AppText style={styles.statusTitle}>{status.title}</AppText>
        <AppText style={styles.statusDesc}>{status.desc}</AppText>
      </View>

      {/* ─── Single Action Row ─────────────────────────────────────────── */}
      <View style={styles.actionRow}>
        {onNavigateToSetup ? (
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={onNavigateToSetup}
            activeOpacity={0.8}
          >
            <View style={styles.ctaButtonLeft}>
              <SlidersHorizontal size={15} color="#0F766E" />
              <AppText style={styles.ctaButtonText}>
                {isGenerated ? 'View in Setup & Rounds' : 'Configure in Setup & Rounds'}
              </AppText>
            </View>
            <ChevronRight size={16} color="#0F766E" />
          </TouchableOpacity>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#DCE8E3',
    gap: Spacing[3],
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[2],
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E6F4F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F2823',
    letterSpacing: 0.1,
  },
  statusBox: {
    gap: 3,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F2823',
  },
  statusDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  actionRow: {
    marginTop: 2,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF9',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing[3],
  },
  ctaButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ctaButtonText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F766E',
  },
});
