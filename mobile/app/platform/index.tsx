/**
 * Aught2 Pickleball — Platform Admin Overview (Mobile-First)
 *
 * Platform-wide summary dashboard powered exclusively by real backend data:
 * - Action-first layout: pending application alert banner prioritized right at the top
 * - Mobile-first quick shortcuts row for instant 1-tap navigation
 * - Responsive 2-column metric cards with full-card tap targets
 * - Streamlined infrastructure health rows (FastAPI, Neon DB, latency)
 * - Audited recent administrative decisions feed
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
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
  History,
  Layers,
  LifeBuoy,
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
  const { width } = useWindowDimensions();

  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [recentDecisions, setRecentDecisions] = useState<ClubApplicationResponse[]>([]);
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [healthLatencyMs, setHealthLatencyMs] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSmallPhone = width < 380;
  const isMobile = width < 768;

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

      // Authoritative database-wide counts from counts payload
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
      title="Platform Operations"
      subtitle="Executive telemetry & multi-club operations"
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
          {/* Action Callout Priority 1: Pending Applications */}
          {metrics.pendingApplications > 0 && (
            <TouchableOpacity
              style={styles.pendingAlertCard}
              onPress={() => router.push('/platform/applications' as any)}
              activeOpacity={0.85}
              accessibilityLabel={`Review ${metrics.pendingApplications} pending club applications`}
              accessibilityRole="button"
            >
              <View style={styles.alertTopRow}>
                <View style={styles.alertIconBadge}>
                  <Clock size={18} color="#D97706" />
                </View>
                <View style={styles.alertTextWrap}>
                  <View style={styles.alertTitleBadgeRow}>
                    <AppText style={styles.alertTitle}>
                      {metrics.pendingApplications} {metrics.pendingApplications === 1 ? 'Club Application' : 'Club Applications'} Pending
                    </AppText>
                    <View style={styles.actionRequiredPill}>
                      <AppText style={styles.actionRequiredText}>ACTION REQUIRED</AppText>
                    </View>
                  </View>
                  <AppText variant="caption" style={styles.alertDesc}>
                    Prospective facilities are awaiting review and onboarding approval.
                  </AppText>
                </View>
              </View>

              <View style={styles.alertBottomBar}>
                <AppText style={styles.alertActionText}>Review and Onboard Facilities</AppText>
                <ArrowRight size={14} color="#92400E" />
              </View>
            </TouchableOpacity>
          )}

          {/* Mobile Quick Action Shortcuts */}
          <View style={styles.quickShortcutsWrap}>
            <TouchableOpacity
              style={styles.shortcutChip}
              onPress={() => router.push('/platform/applications' as any)}
              activeOpacity={0.75}
            >
              <FileText size={14} color="#18794E" />
              <AppText style={styles.shortcutChipText}>Applications</AppText>
              {metrics.pendingApplications > 0 && (
                <View style={styles.shortcutBadge}>
                  <AppText style={styles.shortcutBadgeText}>{metrics.pendingApplications}</AppText>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shortcutChip}
              onPress={() => router.push('/platform/clubs' as any)}
              activeOpacity={0.75}
            >
              <Building2 size={14} color="#18794E" />
              <AppText style={styles.shortcutChipText}>Clubs ({metrics.totalClubs})</AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shortcutChip}
              onPress={() => router.push('/platform/users' as any)}
              activeOpacity={0.75}
            >
              <Users size={14} color="#18794E" />
              <AppText style={styles.shortcutChipText}>Users</AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shortcutChip}
              onPress={() => router.push('/platform/support' as any)}
              activeOpacity={0.75}
            >
              <LifeBuoy size={14} color="#18794E" />
              <AppText style={styles.shortcutChipText}>Support</AppText>
            </TouchableOpacity>
          </View>

          {/* Section: Platform Vital Metrics */}
          <View style={styles.sectionHeaderRow}>
            <AppText variant="heading3" color="primary" style={styles.sectionTitle}>
              Platform Vital Metrics
            </AppText>
            <AppText variant="caption" color="secondary">
              Authoritative live platform aggregations
            </AppText>
          </View>

          {/* Responsive 2-Column (Mobile) / 4-Column (Desktop) Grid */}
          <View style={styles.metricGrid}>
            {/* Metric 1: Pending Applications */}
            <TouchableOpacity
              style={[
                styles.metricCard,
                isMobile ? (isSmallPhone ? styles.metricCardFull : styles.metricCardHalf) : styles.metricCardQuarter,
                metrics.pendingApplications > 0 && styles.metricCardPendingHighlight,
              ]}
              onPress={() => router.push('/platform/applications' as any)}
              activeOpacity={0.8}
            >
              <View style={styles.metricCardHeader}>
                <View style={[styles.metricIconWrap, { backgroundColor: '#FEF3C7' }]}>
                  <FileText size={17} color="#B45309" />
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
              <AppText variant="caption" color="secondary" style={styles.metricLabel} numberOfLines={1}>
                Pending Applications
              </AppText>
              <View style={styles.cardFooterAction}>
                <AppText style={styles.footerLinkText}>Review Now</AppText>
                <ArrowRight size={12} color="#18794E" />
              </View>
            </TouchableOpacity>

            {/* Metric 2: Registered Facilities */}
            <TouchableOpacity
              style={[
                styles.metricCard,
                isMobile ? (isSmallPhone ? styles.metricCardFull : styles.metricCardHalf) : styles.metricCardQuarter,
              ]}
              onPress={() => router.push('/platform/clubs' as any)}
              activeOpacity={0.8}
            >
              <View style={styles.metricCardHeader}>
                <View style={[styles.metricIconWrap, { backgroundColor: '#EAF6F0' }]}>
                  <Building2 size={17} color="#18794E" />
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
              <AppText variant="caption" color="secondary" style={styles.metricLabel} numberOfLines={1}>
                Registered Clubs
              </AppText>
              <View style={styles.cardFooterAction}>
                <AppText style={styles.footerLinkText}>Directory</AppText>
                <ArrowRight size={12} color="#18794E" />
              </View>
            </TouchableOpacity>

            {/* Metric 3: Total Platform Members */}
            <View
              style={[
                styles.metricCard,
                isMobile ? (isSmallPhone ? styles.metricCardFull : styles.metricCardHalf) : styles.metricCardQuarter,
              ]}
            >
              <View style={styles.metricCardHeader}>
                <View style={[styles.metricIconWrap, { backgroundColor: '#EFF6FF' }]}>
                  <Users size={17} color="#2563EB" />
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
              <AppText variant="caption" color="secondary" style={styles.metricLabel} numberOfLines={1}>
                Active Memberships
              </AppText>
              <View style={styles.cardFooterStatic}>
                <AppText variant="caption" color="tertiary" numberOfLines={1}>
                  Sum of active club members
                </AppText>
              </View>
            </View>

            {/* Metric 4: Lifetime Applications */}
            <TouchableOpacity
              style={[
                styles.metricCard,
                isMobile ? (isSmallPhone ? styles.metricCardFull : styles.metricCardHalf) : styles.metricCardQuarter,
              ]}
              onPress={() => router.push('/platform/applications?tab=all' as any)}
              activeOpacity={0.8}
            >
              <View style={styles.metricCardHeader}>
                <View style={[styles.metricIconWrap, { backgroundColor: '#F3E8FF' }]}>
                  <TrendingUp size={17} color="#7E22CE" />
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
              <AppText variant="caption" color="secondary" style={styles.metricLabel} numberOfLines={1}>
                Lifetime Applications
              </AppText>
              <View style={styles.cardFooterStatic}>
                <AppText variant="caption" color="tertiary" numberOfLines={1}>
                  {metrics.approvedApplications} approved · {metrics.rejectedApplications} rejected
                </AppText>
              </View>
            </TouchableOpacity>
          </View>

          {/* Section: System Health & Infrastructure */}
          <View style={[styles.sectionHeaderRow, { marginTop: Spacing.md }]}>
            <AppText variant="heading3" color="primary" style={styles.sectionTitle}>
              Infrastructure & Health
            </AppText>
            <AppText variant="caption" color="secondary">
              Real-time service telemetry
            </AppText>
          </View>

          <Card style={styles.healthCard}>
            <View style={styles.healthList}>
              {/* API Service Status */}
              <View style={styles.healthRowItem}>
                <View style={styles.healthRowLeft}>
                  <View style={styles.healthItemIcon}>
                    <Server size={16} color="#18794E" />
                  </View>
                  <View style={styles.healthTextCol}>
                    <AppText style={styles.healthServiceName}>FastAPI Backend (Render)</AppText>
                    <AppText variant="caption" color="secondary">v{health?.version || '1.0'} · REST Engine</AppText>
                  </View>
                </View>
                <View style={styles.healthStatusPill}>
                  <View
                    style={[
                      styles.indicatorDot,
                      { backgroundColor: health?.status === 'ok' ? '#18794E' : '#DC2626' },
                    ]}
                  />
                  <AppText style={styles.healthStatusLabel}>
                    {health?.status === 'ok' ? 'Operational' : 'Degraded'}
                  </AppText>
                </View>
              </View>

              <View style={styles.healthDivider} />

              {/* PostgreSQL Neon DB */}
              <View style={styles.healthRowItem}>
                <View style={styles.healthRowLeft}>
                  <View style={styles.healthItemIcon}>
                    <Database size={16} color="#18794E" />
                  </View>
                  <View style={styles.healthTextCol}>
                    <AppText style={styles.healthServiceName}>PostgreSQL DB (Neon Serverless)</AppText>
                    <AppText variant="caption" color="secondary">Connection pool & pooling</AppText>
                  </View>
                </View>
                <View style={styles.healthStatusPill}>
                  <View
                    style={[
                      styles.indicatorDot,
                      { backgroundColor: health?.database === 'ok' ? '#18794E' : '#DC2626' },
                    ]}
                  />
                  <AppText style={styles.healthStatusLabel}>
                    {health?.database === 'ok' ? 'Connected' : 'Degraded'}
                  </AppText>
                </View>
              </View>

              <View style={styles.healthDivider} />

              {/* Latency */}
              <View style={styles.healthRowItem}>
                <View style={styles.healthRowLeft}>
                  <View style={styles.healthItemIcon}>
                    <Activity size={16} color="#18794E" />
                  </View>
                  <View style={styles.healthTextCol}>
                    <AppText style={styles.healthServiceName}>Round-Trip Response Latency</AppText>
                    <AppText variant="caption" color="secondary">Real-time ping duration</AppText>
                  </View>
                </View>
                <View style={styles.latencyPill}>
                  <AppText style={styles.latencyValue}>
                    {healthLatencyMs !== null ? `${healthLatencyMs} ms` : 'Measuring...'}
                  </AppText>
                </View>
              </View>
            </View>
          </Card>

          {/* Section: Recent Platform Decisions */}
          <View style={[styles.sectionHeaderRow, { marginTop: Spacing.md }]}>
            <View>
              <AppText variant="heading3" color="primary" style={styles.sectionTitle}>
                Recent Decisions
              </AppText>
              <AppText variant="caption" color="secondary">
                Audit trail from club applications
              </AppText>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/platform/applications' as any)}
              style={styles.headerSectionLink}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <AppText style={styles.headerSectionLinkText}>View All</AppText>
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
                  <TouchableOpacity
                    key={decision.id}
                    style={[
                      styles.decisionItemRow,
                      index < recentDecisions.length - 1 && styles.decisionItemBorder,
                    ]}
                    onPress={() => router.push('/platform/applications' as any)}
                    activeOpacity={0.7}
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
                        <AppText variant="title" color="primary" numberOfLines={1} style={styles.decisionClubName}>
                          {decision.club_name}
                        </AppText>
                        <Badge
                          label={isApproved ? 'APPROVED' : 'REJECTED'}
                          variant={isApproved ? 'success' : 'error'}
                          size="sm"
                        />
                      </View>

                      <AppText variant="caption" color="secondary" style={styles.decisionSub} numberOfLines={1}>
                        {decision.applicant_name} · {decision.city ? `${decision.city}, ${decision.state || decision.country}` : decision.applicant_email}
                      </AppText>

                      {decision.rejection_reason && (
                        <View style={styles.decisionReasonBox}>
                          <AppText variant="caption" color="secondary" numberOfLines={2}>
                            Reason: {decision.rejection_reason}
                          </AppText>
                        </View>
                      )}

                      <AppText variant="caption" color="tertiary" style={styles.decisionTimestamp}>
                        {decision.reviewed_at
                          ? new Date(decision.reviewed_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Recorded'}
                      </AppText>
                    </View>
                  </TouchableOpacity>
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
  // Pending Alert Card
  pendingAlertCard: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 12,
  },
  alertTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  alertIconBadge: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  alertTextWrap: {
    flex: 1,
    gap: 3,
  },
  alertTitleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  alertTitle: {
    fontSize: 14.5,
    color: '#92400E',
    fontWeight: '700',
  },
  actionRequiredPill: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  actionRequiredText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  alertDesc: {
    color: '#B45309',
    fontSize: 12,
    lineHeight: 16,
  },
  alertBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  alertActionText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#92400E',
  },

  // Quick Shortcuts Row
  quickShortcutsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  shortcutChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#E2EBE6',
  },
  shortcutChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2A4A41',
  },
  shortcutBadge: {
    backgroundColor: '#D97706',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Section Headers
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 15,
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

  // Metrics Grid
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    backgroundColor: '#FFFFFF',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EBE6',
    justifyContent: 'space-between',
  },
  metricCardFull: {
    width: '100%',
  },
  metricCardHalf: {
    width: '48.5%',
    flexGrow: 1,
  },
  metricCardQuarter: {
    flex: 1,
    minWidth: 200,
  },
  metricCardPendingHighlight: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFDF5',
  },
  metricCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  metricIconWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#122521',
    lineHeight: 32,
  },
  metricLabel: {
    fontSize: 12,
    color: '#5C746E',
    marginTop: 2,
  },
  cardFooterAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F5F2',
  },
  footerLinkText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#18794E',
  },
  cardFooterStatic: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F5F2',
  },

  // Health Card
  healthCard: {
    backgroundColor: '#FFFFFF',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EBE6',
  },
  healthList: {
    gap: 10,
  },
  healthRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  healthRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  healthItemIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    backgroundColor: '#EAF6F0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C3E5D4',
  },
  healthTextCol: {
    flex: 1,
    gap: 1,
  },
  healthServiceName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#122521',
  },
  healthStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  indicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  healthStatusLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#15803D',
  },
  latencyPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  latencyValue: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  healthDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },

  // Decisions Card
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
    gap: 3,
  },
  decisionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  decisionClubName: {
    fontSize: 13.5,
    fontWeight: '700',
    flex: 1,
  },
  decisionSub: {
    fontSize: 11.5,
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
    fontSize: 10.5,
    marginTop: 2,
  },
});
