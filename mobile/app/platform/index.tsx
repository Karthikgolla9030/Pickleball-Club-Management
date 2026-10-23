/**
 * Pickleball Multi-Club Platform — Platform Admin Overview
 *
 * Platform-wide summary dashboard powered exclusively by real backend data:
 * - Applications breakdown: Pending review, Approved, Rejected
 * - Club facilities breakdown: Total registered, Active vs Inactive
 * - Platform member count: Real sum of active club memberships
 * - Real-time system health: API status, Neon DB connectivity, and latency
 * - Recent admin review decisions: Real audit history from processed applications
 * - Shortcuts to detail sections (no duplicate full tables)
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  Layers,
  Server,
  ShieldCheck,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react-native';

import {
  AppText,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PlatformShell,
} from '@/components';
import {
  ClubApplicationResponse,
  PlatformClubItem,
  SystemHealthResponse,
  platformApplicationsApi,
} from '@/services/api/clubApplications';
import { Colors, Radius, Spacing } from '@/theme';

interface OverviewMetrics {
  totalApplications: number;
  pendingApplications: number;
  approvedApplications: number;
  rejectedApplications: number;
  totalClubs: number;
  activeClubs: number;
  inactiveClubs: number;
  totalPlatformMembers: number;
}

export default function PlatformOverviewScreen() {
  const router = useRouter();

  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [recentDecisions, setRecentDecisions] = useState<ClubApplicationResponse[]>([]);
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [healthLatencyMs, setHealthLatencyMs] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOverviewData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const startTime = Date.now();
      const [appsRes, clubsRes, healthRes] = await Promise.all([
        platformApplicationsApi.listApplications(undefined, 1, 100),
        platformApplicationsApi.listClubs(),
        platformApplicationsApi.getSystemHealth().catch((e) => ({
          status: 'degraded' as const,
          version: 'unknown',
          database: `unreachable (${e?.message || 'offline'})`,
        })),
      ]);
      const latency = Date.now() - startTime;
      setHealthLatencyMs(latency);
      setHealth(healthRes);

      const apps = appsRes.items || [];
      const clubs = clubsRes.items || [];

      // Authoritative database-wide counts from counts payload (prevent single-page undercounting)
      const pendingCount = appsRes.counts?.pending ?? apps.filter((a) => a.status === 'pending').length;
      const approvedCount = appsRes.counts?.approved ?? apps.filter((a) => a.status === 'approved').length;
      const rejectedCount = appsRes.counts?.rejected ?? apps.filter((a) => a.status === 'rejected').length;
      const totalAppsCount = appsRes.counts?.all ?? appsRes.total ?? apps.length;

      const activeClubsCount = clubs.filter((c) => c.is_active).length;
      const inactiveClubsCount = clubs.filter((c) => !c.is_active).length;
      const membersCount = clubs.reduce((sum, c) => sum + (c.active_members_count || 0), 0);

      setMetrics({
        totalApplications: totalAppsCount,
        pendingApplications: pendingCount,
        approvedApplications: approvedCount,
        rejectedApplications: rejectedCount,
        totalClubs: clubsRes.total || clubs.length,
        activeClubs: activeClubsCount,
        inactiveClubs: inactiveClubsCount,
        totalPlatformMembers: membersCount,
      });

      // Filter recent admin decisions: apps that were either approved or rejected with reviewed_at
      const decisions = apps
        .filter((a) => a.status !== 'pending' && a.reviewed_at)
        .sort((a, b) => new Date(b.reviewed_at || b.updated_at).getTime() - new Date(a.reviewed_at || a.updated_at).getTime())
        .slice(0, 5);

      setRecentDecisions(decisions);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to load platform overview metrics';
      setError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOverviewData();
  }, [fetchOverviewData]);

  return (
    <PlatformShell
      activeTab="overview"
      title="Platform Operations Overview"
      subtitle="Executive telemetry and multi-club operational health"
      onRefresh={() => fetchOverviewData(true)}
      isRefreshing={isRefreshing}
      scrollable
    >
      {isLoading ? (
        <LoadingState message="Loading platform overview telemetry..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchOverviewData(true)} />
      ) : metrics ? (
        <View style={styles.container}>
          {/* Action Callout if Pending Applications Exist */}
          {metrics.pendingApplications > 0 && (
            <TouchableOpacity
              style={styles.pendingAlertCard}
              onPress={() => router.push('/platform/applications' as any)}
              activeOpacity={0.8}
            >
              <View style={styles.alertLeft}>
                <View style={styles.alertIconBadge}>
                  <Clock size={18} color="#D97706" />
                </View>
                <View style={styles.alertTextWrap}>
                  <AppText variant="title" style={styles.alertTitle}>
                    {metrics.pendingApplications} Club Registration {metrics.pendingApplications === 1 ? 'Application' : 'Applications'} Pending Review
                  </AppText>
                  <AppText variant="caption" color="secondary" style={styles.alertDesc}>
                    Prospective facilities are awaiting platform administrative approval and onboarding.
                  </AppText>
                </View>
              </View>
              <View style={styles.alertActionBtn}>
                <AppText style={styles.alertActionText}>Review Now</AppText>
                <ArrowRight size={14} color="#B45309" />
              </View>
            </TouchableOpacity>
          )}

          {/* Section: Platform Vital Metrics */}
          <View style={styles.sectionHeaderRow}>
            <View>
              <AppText variant="heading3" color="primary" style={styles.sectionTitle}>
                Platform Metrics
              </AppText>
              <AppText variant="caption" color="secondary">
                Live aggregations derived from registered facilities and active sessions
              </AppText>
            </View>
          </View>

          <View style={styles.metricGrid}>
            {/* Metric 1: Pending Applications */}
            <Card style={styles.metricCard}>
              <View style={styles.metricCardHeader}>
                <View style={[styles.metricIconWrap, { backgroundColor: '#FEF3C7' }]}>
                  <FileText size={18} color="#B45309" />
                </View>
                <Badge
                  label={metrics.pendingApplications > 0 ? 'NEEDS ACTION' : 'UP TO DATE'}
                  variant={metrics.pendingApplications > 0 ? 'warning' : 'success'}
                  size="sm"
                />
              </View>
              <AppText variant="heading1" style={styles.metricValue}>
                {metrics.pendingApplications}
              </AppText>
              <AppText variant="caption" color="secondary" style={styles.metricLabel}>
                Pending Applications
              </AppText>
              <TouchableOpacity
                style={styles.cardFooterLink}
                onPress={() => router.push('/platform/applications' as any)}
              >
                <AppText style={styles.footerLinkText}>View Applications</AppText>
                <ArrowRight size={12} color="#18794E" />
              </TouchableOpacity>
            </Card>

            {/* Metric 2: Registered Facilities */}
            <Card style={styles.metricCard}>
              <View style={styles.metricCardHeader}>
                <View style={[styles.metricIconWrap, { backgroundColor: '#EAF6F0' }]}>
                  <Building2 size={18} color="#18794E" />
                </View>
                <Badge
                  label={`${metrics.activeClubs} ACTIVE`}
                  variant="success"
                  size="sm"
                />
              </View>
              <AppText variant="heading1" style={styles.metricValue}>
                {metrics.totalClubs}
              </AppText>
              <AppText variant="caption" color="secondary" style={styles.metricLabel}>
                Registered Club Facilities
              </AppText>
              <TouchableOpacity
                style={styles.cardFooterLink}
                onPress={() => router.push('/platform/clubs' as any)}
              >
                <AppText style={styles.footerLinkText}>View Clubs Directory</AppText>
                <ArrowRight size={12} color="#18794E" />
              </TouchableOpacity>
            </Card>

            {/* Metric 3: Total Platform Members */}
            <Card style={styles.metricCard}>
              <View style={styles.metricCardHeader}>
                <View style={[styles.metricIconWrap, { backgroundColor: '#EFF6FF' }]}>
                  <Users size={18} color="#2563EB" />
                </View>
                <Badge
                  label="ACROSS CLUBS"
                  variant="default"
                  size="sm"
                />
              </View>
              <AppText variant="heading1" style={styles.metricValue}>
                {metrics.totalPlatformMembers}
              </AppText>
              <AppText variant="caption" color="secondary" style={styles.metricLabel}>
                Active Club Memberships
              </AppText>
              <View style={styles.cardFooterStatic}>
                <AppText variant="caption" color="tertiary">
                  Aggregated from {metrics.activeClubs} active clubs
                </AppText>
              </View>
            </Card>

            {/* Metric 4: Application Processing Ratio */}
            <Card style={styles.metricCard}>
              <View style={styles.metricCardHeader}>
                <View style={[styles.metricIconWrap, { backgroundColor: '#F3E8FF' }]}>
                  <TrendingUp size={18} color="#7E22CE" />
                </View>
                <Badge
                  label={`${metrics.approvedApplications} APPROVED`}
                  variant="success"
                  size="sm"
                />
              </View>
              <AppText variant="heading1" style={styles.metricValue}>
                {metrics.totalApplications}
              </AppText>
              <AppText variant="caption" color="secondary" style={styles.metricLabel}>
                Lifetime Registration Requests
              </AppText>
              <View style={styles.cardFooterStatic}>
                <AppText variant="caption" color="tertiary">
                  {metrics.approvedApplications} approved · {metrics.rejectedApplications} rejected
                </AppText>
              </View>
            </Card>
          </View>

          {/* Section: System Health & Infrastructure */}
          <View style={[styles.sectionHeaderRow, { marginTop: Spacing.lg }]}>
            <View>
              <AppText variant="heading3" color="primary" style={styles.sectionTitle}>
                Platform Infrastructure & Health
              </AppText>
              <AppText variant="caption" color="secondary">
                Live backend service availability, database connectivity, and API response speed
              </AppText>
            </View>
          </View>

          <Card style={styles.healthCard}>
            <View style={styles.healthRow}>
              {/* API Service Status */}
              <View style={styles.healthItem}>
                <View style={styles.healthItemIcon}>
                  <Server size={18} color="#18794E" />
                </View>
                <View>
                  <AppText variant="caption" color="secondary">
                    FastAPI Backend (Render)
                  </AppText>
                  <View style={styles.statusIndicatorRow}>
                    <View
                      style={[
                        styles.indicatorDot,
                        { backgroundColor: health?.status === 'ok' ? '#18794E' : '#DC2626' },
                      ]}
                    />
                    <AppText style={styles.statusValueText}>
                      {health?.status === 'ok' ? 'Operational' : 'Degraded'} (v{health?.version || '1.0'})
                    </AppText>
                  </View>
                </View>
              </View>

              {/* Neon Database Status */}
              <View style={styles.healthItem}>
                <View style={styles.healthItemIcon}>
                  <Database size={18} color="#18794E" />
                </View>
                <View>
                  <AppText variant="caption" color="secondary">
                    PostgreSQL Database (Neon)
                  </AppText>
                  <View style={styles.statusIndicatorRow}>
                    <View
                      style={[
                        styles.indicatorDot,
                        { backgroundColor: health?.database === 'ok' ? '#18794E' : '#DC2626' },
                      ]}
                    />
                    <AppText style={styles.statusValueText}>
                      {health?.database === 'ok' ? 'Connected & Healthy' : 'Degraded'}
                    </AppText>
                  </View>
                </View>
              </View>

              {/* Latency */}
              <View style={styles.healthItem}>
                <View style={styles.healthItemIcon}>
                  <Activity size={18} color="#18794E" />
                </View>
                <View>
                  <AppText variant="caption" color="secondary">
                    API Telemetry Latency
                  </AppText>
                  <View style={styles.statusIndicatorRow}>
                    <AppText style={styles.statusValueText}>
                      {healthLatencyMs !== null ? `${healthLatencyMs} ms` : 'Measuring...'}
                    </AppText>
                  </View>
                </View>
              </View>
            </View>
          </Card>

          {/* Section: Recent Platform Decisions */}
          <View style={[styles.sectionHeaderRow, { marginTop: Spacing.lg }]}>
            <View>
              <AppText variant="heading3" color="primary" style={styles.sectionTitle}>
                Recent Administrative Decisions
              </AppText>
              <AppText variant="caption" color="secondary">
                Audited review decisions logged on club registration applications
              </AppText>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/platform/applications' as any)}
              style={styles.headerSectionLink}
            >
              <AppText style={styles.headerSectionLinkText}>View All History</AppText>
              <ArrowRight size={13} color="#18794E" />
            </TouchableOpacity>
          </View>

          {recentDecisions.length === 0 ? (
            <Card style={styles.emptyDecisionsCard}>
              <EmptyState
                icon="📋"
                title="No Decisions Recorded Yet"
                description="When prospective clubs are approved or rejected, review records and timestamps will appear here."
              />
            </Card>
          ) : (
            <Card style={styles.decisionsListCard}>
              {recentDecisions.map((decision, index) => {
                const isApproved = decision.status === 'approved';
                return (
                  <View
                    key={decision.id}
                    style={[
                      styles.decisionItemRow,
                      index < recentDecisions.length - 1 && styles.decisionItemBorder,
                    ]}
                  >
                    <View style={styles.decisionIconCol}>
                      {isApproved ? (
                        <View style={[styles.decisionStatusBadge, { backgroundColor: '#EAF6F0' }]}>
                          <CheckCircle2 size={16} color="#18794E" />
                        </View>
                      ) : (
                        <View style={[styles.decisionStatusBadge, { backgroundColor: '#FEE2E2' }]}>
                          <XCircle size={16} color="#DC2626" />
                        </View>
                      )}
                    </View>

                    <View style={styles.decisionContentCol}>
                      <View style={styles.decisionTitleRow}>
                        <AppText variant="title" color="primary" numberOfLines={1}>
                          {decision.club_name}
                        </AppText>
                        <Badge
                          label={isApproved ? 'APPROVED' : 'REJECTED'}
                          variant={isApproved ? 'success' : 'error'}
                          size="sm"
                        />
                      </View>

                      <AppText variant="caption" color="secondary" style={styles.decisionSub}>
                        Applicant: {decision.applicant_name} ({decision.applicant_email})
                        {decision.city ? ` · ${decision.city}, ${decision.state || decision.country}` : ''}
                      </AppText>

                      {decision.rejection_reason && (
                        <View style={styles.decisionReasonBox}>
                          <AppText variant="caption" color="secondary">
                            Reason: {decision.rejection_reason}
                          </AppText>
                        </View>
                      )}

                      <AppText variant="caption" color="tertiary" style={styles.decisionTimestamp}>
                        Reviewed on{' '}
                        {decision.reviewed_at
                          ? new Date(decision.reviewed_at).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Recorded'}
                      </AppText>
                    </View>
                  </View>
                );
              })}
            </Card>
          )}
        </View>
      ) : null}
    </PlatformShell>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  pendingAlertCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  alertLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 260,
  },
  alertIconBadge: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTextWrap: {
    flex: 1,
  },
  alertTitle: {
    color: '#92400E',
    fontWeight: '700',
  },
  alertDesc: {
    color: '#B45309',
    marginTop: 2,
  },
  alertActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  alertActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#122521',
  },
  headerSectionLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  headerSectionLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#18794E',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  metricCard: {
    flex: 1,
    minWidth: 240,
    backgroundColor: '#FFFFFF',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EBE6',
  },
  metricCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  metricIconWrap: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#122521',
    lineHeight: 34,
  },
  metricLabel: {
    fontSize: 13,
    color: '#5C746E',
    marginTop: 2,
  },
  cardFooterLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F5F2',
  },
  footerLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#18794E',
  },
  cardFooterStatic: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F5F2',
  },
  healthCard: {
    backgroundColor: '#FFFFFF',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EBE6',
  },
  healthRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.lg,
  },
  healthItem: {
    flex: 1,
    minWidth: 200,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  healthItemIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: '#EAF6F0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C3E5D4',
  },
  statusIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  indicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusValueText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#122521',
  },
  emptyDecisionsCard: {
    backgroundColor: '#FFFFFF',
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EBE6',
  },
  decisionsListCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EBE6',
    padding: 0,
    overflow: 'hidden',
  },
  decisionItemRow: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  decisionItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F5F2',
  },
  decisionIconCol: {
    marginTop: 2,
  },
  decisionStatusBadge: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decisionContentCol: {
    flex: 1,
    gap: 4,
  },
  decisionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  decisionSub: {
    fontSize: 12,
  },
  decisionReasonBox: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginTop: 2,
  },
  decisionTimestamp: {
    fontSize: 11,
    marginTop: 2,
  },
});
