/**
 * Aught2 Pickleball — PoolPlayPostRegistrationCard
 *
 * Read-Only Overview Summary Card for Pool Play Tournaments:
 * - Rendered in Overview tab after registration closes and before tournament begins.
 * - Displays confirmed team count, current pool configuration status, and concise summary.
 * - Shows a simple, single empty/insufficient state when confirmed teams < 4.
 * - Provides ONE clear action to navigate to the Setup & Courts tab where editable configuration lives.
 * - Follows strict architectural separation: NO editable steppers or duplicate form controls in Overview.
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ChevronRight, Layers, SlidersHorizontal } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import {
  PostRegistrationHeader,
  PostRegistrationMetrics,
  PostRegistrationNotice,
} from '@/components/post-registration';
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
  onGenerated,
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
          <AppText style={styles.loadingText}>
            Calculating confirmed teams and current pool status...
          </AppText>
        </View>
      </Card>
    );
  }

  const isGenerated = setupData?.is_generated ?? false;
  const teamsCount = setupData?.confirmed_teams_count ?? 0;
  const stage = setupData?.configuration_stage ?? 'awaiting_format_configuration';
  const isReadyToStart = isGenerated && stage === 'ready_to_start';
  const numPools = setupData?.selected_pools ?? 2;
  const qualifiers = setupData?.selected_qualifiers_per_pool ?? 2;
  const bracketType = setupData?.selected_bracket_type ?? 'Single Elimination';
  const hasMinTeams = teamsCount >= 4;

  const getSubtitle = () => {
    if (isReadyToStart) {
      return 'Pools & matches generated • Verified and ready to start';
    }
    if (isGenerated) {
      return 'Schedule generated • Pool distribution active';
    }
    if (!hasMinTeams) {
      return 'Registration closed • Waiting for confirmed teams to configure pools';
    }
    return 'Registration closed • Configure pools and advancement in Setup & Courts';
  };

  const getBadgeLabel = () => {
    if (isReadyToStart) return 'Ready to Start';
    if (isGenerated) return 'Schedule Generated';
    if (!hasMinTeams) return 'Waiting for Teams';
    return 'Awaiting Configuration';
  };

  const getBadgeVariant = () => {
    if (isReadyToStart) return 'success';
    if (isGenerated) return 'info';
    return 'warning';
  };

  return (
    <Card style={styles.card}>
      {/* ─── 1. Read-Only Standardized Header ─────────────────────────────────── */}
      <PostRegistrationHeader
        icon={<Layers size={18} color="#0F766E" />}
        title="Pool Play Configuration"
        subtitle={getSubtitle()}
        badgeLabel={getBadgeLabel()}
        badgeVariant={getBadgeVariant()}
      />

      <View style={styles.divider} />

      {/* ─── 2. Confirmed Teams & Configuration Status Summary ────────────────── */}
      <PostRegistrationMetrics
        metrics={[
          {
            label: 'CONFIRMED TEAMS',
            value: teamsCount,
          },
          {
            label: 'CONFIGURED POOLS',
            value: hasMinTeams ? numPools : '—',
          },
          {
            label: 'PLAYOFF QUALIFIERS',
            value: hasMinTeams ? numPools * qualifiers : '—',
          },
        ]}
      />

      {/* ─── 3. Single Consolidated Notice ───────────────────────────────────── */}
      {!hasMinTeams ? (
        <PostRegistrationNotice
          variant="warning"
          title="Waiting for confirmed teams"
          message={`At least 4 confirmed teams are required to configure Pool Play (currently ${teamsCount} confirmed). When confirmed teams register, pool distribution and qualifiers can be configured in Setup & Courts.`}
        />
      ) : isGenerated ? (
        <PostRegistrationNotice
          variant="success"
          title="Pool Play Structure Active"
          message={`All ${teamsCount} confirmed teams assigned across ${numPools} pools with ${numPools * qualifiers} qualifiers advancing to the ${bracketType} bracket.`}
        />
      ) : (
        <PostRegistrationNotice
          variant="info"
          title="Configuration Required"
          message={`Tournament has ${teamsCount} confirmed teams. Configure pool distribution, balance tolerance, and championship qualification in Setup & Courts.`}
        />
      )}

      <View style={styles.divider} />

      {/* ─── 4. Clear Action to Setup & Courts Workspace ─────────────────────── */}
      <View style={styles.actionsRow}>
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
            style={styles.ctaSetupBtn}
            onPress={onNavigateToSetup}
            activeOpacity={0.8}
          >
            <View style={styles.ctaLeftCol}>
              <SlidersHorizontal size={16} color="#0F766E" />
              <AppText style={styles.ctaBtnText}>
                {isGenerated ? 'View Configuration in Setup & Courts' : 'Configure in Setup & Courts'}
              </AppText>
            </View>
            <ChevronRight size={17} color="#0F766E" />
          </TouchableOpacity>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DEF2E6',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[4],
  },
  loadingBox: {
    padding: Spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: Spacing[3],
  },
  actionsRow: {
    marginTop: Spacing[0.5],
  },
  actionBtn: {
    width: '100%',
  },
  ctaSetupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    borderRadius: Radius.md,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[3.5],
  },
  ctaLeftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  ctaBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F766E',
  },
});
