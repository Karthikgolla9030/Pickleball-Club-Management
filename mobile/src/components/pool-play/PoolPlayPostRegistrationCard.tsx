/**
 * Aught2 Pickleball — PoolPlayPostRegistrationCard
 *
 * Compact, read-only status card for Pool Play Tournaments in the Overview tab:
 * - Shows only high-level configuration status and clear next step.
 * - Standardized card width with identical 16px page margins as neighboring cards.
 * - NO repeated metrics, NO nested warning boxes, NO duplicate configuration controls.
 * - Provides ONE clear action to navigate to the Setup & Courts workspace.
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

interface PoolPlayPostRegistrationCardProps {
  clubId: string;
  tournamentId: string;
  tournament: Tournament;
  canManage: boolean;
  onNavigateToSetup?: () => void;
  onGenerated?: () => void | Promise<void>;
  onStartTournament?: () => void | Promise<void>;
  isStartingTournament?: boolean;
}

export function PoolPlayPostRegistrationCard({
  clubId,
  tournamentId,
  tournament,
  canManage,
  onNavigateToSetup,
  onStartTournament,
  isStartingTournament = false,
}: PoolPlayPostRegistrationCardProps) {
  const [loading, setLoading] = useState(true);
  const [setupData, setSetupData] = useState<any>(null);

  const fetchSetup = async () => {
    try {
      setLoading(true);
      const res = await competitionApi.getPoolPlayPostRegistrationSetup(clubId, tournamentId);
      setSetupData(res);
    } catch (err) {
      console.warn('Failed to fetch pool play post-registration setup:', err);
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
  const teamsCount = setupData?.confirmed_teams_count ?? 0;
  const stage = setupData?.configuration_stage ?? 'awaiting_format_configuration';
  const isReadyToStart = isGenerated && stage === 'ready_to_start';
  const hasMinTeams = teamsCount >= 4;

  const getBadgeInfo = (): { label: string; variant: 'success' | 'info' | 'warning' } => {
    if (isReadyToStart) return { label: 'Ready to Start', variant: 'success' };
    if (isGenerated) return { label: 'Configured', variant: 'info' };
    if (!hasMinTeams) return { label: 'Waiting for Teams', variant: 'warning' };
    return { label: 'Awaiting Configuration', variant: 'warning' };
  };

  const getStatusText = (): { title: string; desc: string } => {
    if (isReadyToStart) {
      return {
        title: 'Ready to start',
        desc: 'Pool matches and advancement structure verified.',
      };
    }
    if (isGenerated) {
      return {
        title: 'Schedule generated',
        desc: 'Pool matches and championship bracket are active.',
      };
    }
    if (!hasMinTeams) {
      return {
        title: 'Waiting for confirmed teams',
        desc: 'Pool configuration will be available when at least 4 teams are confirmed.',
      };
    }
    return {
      title: 'Configuration required',
      desc: 'Configure pool distribution and championship advancement in Setup & Courts.',
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
          <AppText style={styles.cardTitle}>Pool Play Setup</AppText>
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
        {isReadyToStart && onStartTournament ? (
          <Button
            label={isStartingTournament ? 'Starting Tournament...' : 'Start Tournament (Ready)'}
            onPress={onStartTournament}
            disabled={isStartingTournament || !canManage}
            loading={isStartingTournament}
            variant="primary"
            style={styles.actionBtn}
          />
        ) : onNavigateToSetup ? (
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={onNavigateToSetup}
            activeOpacity={0.8}
          >
            <View style={styles.ctaButtonLeft}>
              <SlidersHorizontal size={15} color="#0F766E" />
              <AppText style={styles.ctaButtonText}>
                {isGenerated ? 'View in Setup & Courts' : 'Configure in Setup & Courts'}
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
    marginHorizontal: Spacing[4],
    marginTop: Spacing[4],
    marginBottom: Spacing[1],
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DEF2E6',
    borderRadius: Radius.lg,
    padding: Spacing[3.5],
    gap: Spacing[2.5],
  },
  loadingBox: {
    padding: Spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
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
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    minWidth: 0,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#DEF2E6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  statusBox: {
    gap: 3,
  },
  statusTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 18,
  },
  statusDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },
  actionRow: {
    marginTop: 2,
  },
  actionBtn: {
    width: '100%',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    borderRadius: Radius.md,
    paddingVertical: Spacing[2.5],
    paddingHorizontal: Spacing[3],
  },
  ctaButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  ctaButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F766E',
  },
});
