/**
 * Aught2 Pickleball — Centralized Legal Document Reader
 *
 * Dedicated document-viewer for Club & Player legal policies:
 * - /legal/club_terms (Club & Facility Terms of Service)
 * - /legal/privacy_policy (Privacy Policy)
 * - /legal/club_agreement (Club/Facility Operating Agreement)
 * - /legal/player_terms (Player Terms of Service)
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileCheck,
  FileText,
  Share2,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState, ErrorState } from '@/components/StateViews';
import {
  LegalAcceptanceItem,
  legalApi,
  LegalDocumentVersionItem,
} from '@/services/api';
import { useAuthStore } from '@/store';
import { Radius, Spacing } from '@/theme';

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return 'Current';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function LegalDocumentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ type?: string; version?: string }>();

  const documentType = (params.type || 'player_terms').toLowerCase();
  const versionParam = params.version;

  const user = useAuthStore((s) => s.user);
  const activeMembership = useAuthStore((s) => s.activeMembership);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [document, setDocument] = useState<LegalDocumentVersionItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Acceptance Tracking
  const [acceptance, setAcceptance] = useState<LegalAcceptanceItem | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

    // Fetch legal document version
    legalApi
      .getDocument(documentType, versionParam)
      .then((doc) => {
        if (isMounted) setDocument(doc);
      })
      .catch((err) => {
        if (isMounted) {
          const msg =
            err.response?.data?.detail ||
            err.message ||
            'Unable to load this legal document at this time.';
          setError(msg);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    // If authenticated, check acceptance status
    if (isAuthenticated) {
      legalApi
        .getMyAcceptances()
        .then((acceptances) => {
          if (isMounted && Array.isArray(acceptances)) {
            const matched = acceptances.find(
              (a) => a.document_type === documentType
            );
            if (matched) setAcceptance(matched);
          }
        })
        .catch(() => {});
    }

    return () => {
      isMounted = false;
    };
  }, [documentType, versionParam, isAuthenticated]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/' as any);
    }
  };

  const handleShare = async () => {
    if (!document) return;
    try {
      await Share.share({
        title: document.title,
        message: `${document.title} (v${document.version})\nEffective: ${formatDate(document.effective_date)}\n\n${document.content.substring(0, 500)}...`,
      });
    } catch {
      // Ignored
    }
  };

  const handleAcceptAgreement = async () => {
    if (!document || isAccepting) return;
    setIsAccepting(true);
    try {
      const res = await legalApi.acceptDocument({
        document_type: documentType,
        version_id: document.id,
        club_id: activeMembership?.club_id || null,
        source: 'club_portal',
      });
      setAcceptance(res);
      Alert.alert(
        'Agreement Accepted',
        'The Club/Facility Operating Agreement has been officially accepted and recorded.'
      );
    } catch (err: any) {
      const msg =
        err.response?.data?.detail ||
        err.message ||
        'Failed to record agreement acceptance.';
      Alert.alert('Acceptance Error', msg);
    } finally {
      setIsAccepting(false);
    }
  };

  const isFacilityAgreement = documentType === 'club_agreement';

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 4 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleBack}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color="#0F2922" strokeWidth={2.2} />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <AppText style={styles.headerTitle} numberOfLines={1}>
            {document?.title || 'Legal Document'}
          </AppText>
          {isFacilityAgreement && activeMembership?.club_name && (
            <AppText style={styles.headerSubtitle} numberOfLines={1}>
              {activeMembership.club_name}
            </AppText>
          )}
        </View>

        <TouchableOpacity
          style={styles.shareBtn}
          onPress={handleShare}
          activeOpacity={0.7}
          disabled={!document}
          accessibilityLabel="Share document"
        >
          <Share2 size={18} color="#293D38" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#114D3F" />
          <AppText style={styles.loadingText}>Loading document...</AppText>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <ErrorState
            message={error}
            onRetry={() => router.replace(('/legal/' + documentType) as any)}
          />
        </View>
      ) : !document ? (
        <View style={styles.centerContainer}>
          <EmptyState
            title="Document Unavailable"
            description="The requested legal policy could not be found."
            actionLabel="Return Home"
            onAction={handleBack}
          />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 20) + 95 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Facility Identification Header (for Club Agreement) */}
          {isFacilityAgreement && activeMembership?.club_name && (
            <View style={styles.facilityCard}>
              <View style={styles.facilityIconWrap}>
                <Building2 size={18} color="#114D3F" />
              </View>
              <View style={styles.facilityTextWrap}>
                <AppText style={styles.facilityLabel}>Associated Facility</AppText>
                <AppText style={styles.facilityName}>{activeMembership.club_name}</AppText>
              </View>
              {activeMembership.role && (
                <View style={styles.facilityRoleBadge}>
                  <AppText style={styles.facilityRoleText}>
                    {activeMembership.role.replace(/_/g, ' ').toUpperCase()}
                  </AppText>
                </View>
              )}
            </View>
          )}

          {/* Document Metadata Card */}
          <View style={styles.metaCard}>
            <View style={styles.metaRow}>
              <View style={styles.docTypeBadge}>
                <ShieldCheck size={14} color="#18794E" strokeWidth={2.2} />
                <AppText style={styles.docTypeBadgeText}>Official Platform Policy</AppText>
              </View>
              <View style={styles.versionBadge}>
                <AppText style={styles.versionBadgeText}>Version {document.version}</AppText>
              </View>
            </View>

            <AppText style={styles.docHeading}>{document.title}</AppText>

            <View style={styles.dateRow}>
              <View style={styles.dateCol}>
                <View style={styles.dateItem}>
                  <Calendar size={13} color="#64748B" />
                  <AppText style={styles.dateLabel}>Effective Date:</AppText>
                </View>
                <AppText style={styles.dateValue}>{formatDate(document.effective_date)}</AppText>
              </View>

              <View style={styles.dateCol}>
                <View style={styles.dateItem}>
                  <Clock size={13} color="#64748B" />
                  <AppText style={styles.dateLabel}>Published Status:</AppText>
                </View>
                <AppText style={styles.dateValueActive}>Active & In Effect</AppText>
              </View>
            </View>

            {document.change_summary ? (
              <View style={styles.summaryBox}>
                <AppText style={styles.summaryLabel}>Revision Summary:</AppText>
                <AppText style={styles.summaryText}>{document.change_summary}</AppText>
              </View>
            ) : null}
          </View>

          {/* Acceptance Status / Action Banner (for Club Agreement) */}
          {isFacilityAgreement && (
            acceptance ? (
              <View style={styles.acceptanceActiveCard}>
                <View style={styles.acceptanceActiveIconWrap}>
                  <CheckCircle2 size={20} color="#18794E" />
                </View>
                <View style={styles.acceptanceActiveTextWrap}>
                  <AppText style={styles.acceptanceActiveTitle}>
                    Agreement Accepted & Legally Active
                  </AppText>
                  <AppText style={styles.acceptanceActiveSubtitle}>
                    Accepted on {formatDateTime(acceptance.accepted_at)}
                    {user?.full_name ? ` by ${user.full_name}` : ''}
                    {activeMembership?.club_name ? ` for ${activeMembership.club_name}` : ''}
                  </AppText>
                </View>
              </View>
            ) : isAuthenticated ? (
              <View style={styles.acceptancePendingCard}>
                <View style={styles.acceptancePendingHeader}>
                  <ShieldAlert size={18} color="#B45309" />
                  <AppText style={styles.acceptancePendingTitle}>
                    Facility Acceptance Required
                  </AppText>
                </View>
                <AppText style={styles.acceptancePendingSubtitle}>
                  Please review the operational agreement terms below. As authorized representative of{' '}
                  {activeMembership?.club_name || 'your club facility'}, tap accept to confirm compliance.
                </AppText>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={handleAcceptAgreement}
                  disabled={isAccepting}
                  activeOpacity={0.8}
                >
                  {isAccepting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
                      <AppText style={styles.acceptButtonText}>Accept Operating Agreement</AppText>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : null
          )}

          {/* Formatted Content Body */}
          <View style={styles.contentBody}>
            {document.content.split('\n\n').map((paragraph, idx) => {
              const trimmed = paragraph.trim();
              if (!trimmed) return null;

              if (trimmed.startsWith('# ')) {
                return (
                  <AppText key={idx} style={styles.h1}>
                    {trimmed.replace('# ', '')}
                  </AppText>
                );
              }
              if (trimmed.startsWith('## ')) {
                return (
                  <View key={idx} style={styles.sectionHeaderWrap}>
                    <AppText style={styles.h2}>{trimmed.replace('## ', '')}</AppText>
                  </View>
                );
              }
              if (trimmed.startsWith('### ')) {
                return (
                  <View key={idx} style={styles.sectionHeaderWrap}>
                    <AppText style={styles.h3}>{trimmed.replace('### ', '')}</AppText>
                  </View>
                );
              }
              if (trimmed.startsWith('---')) {
                return <View key={idx} style={styles.divider} />;
              }

              // Check for bullet lists
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                const items = trimmed.split('\n');
                return (
                  <View key={idx} style={styles.bulletList}>
                    {items.map((it, itemIdx) => {
                      const cleanIt = it.replace(/^[-*]\s+/, '').trim();
                      if (!cleanIt) return null;
                      return (
                        <View key={itemIdx} style={styles.bulletRow}>
                          <View style={styles.bulletDot} />
                          <AppText style={styles.bulletText}>{cleanIt}</AppText>
                        </View>
                      );
                    })}
                  </View>
                );
              }

              return (
                <AppText key={idx} style={styles.paragraph}>
                  {trimmed}
                </AppText>
              );
            })}
          </View>

          {/* Bottom Legal Notice */}
          <View style={styles.footerNotice}>
            <FileText size={16} color="#64748B" />
            <AppText style={styles.footerText}>
              This document is binding upon registered members and club facilities of the Pickleball
              platform. For legal inquiries or operational questions, please contact platform operations
              through Help & Support.
            </AppText>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  headerTitleContainer: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F2922',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#114D3F',
    fontWeight: '500',
    marginTop: 1,
  },
  shareBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  facilityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    gap: 10,
  },
  facilityIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  facilityTextWrap: {
    flex: 1,
  },
  facilityLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  facilityName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F2922',
  },
  facilityRoleBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  facilityRoleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  metaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  docTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 5,
  },
  docTypeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#18794E',
  },
  versionBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  versionBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  docHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F2922',
    marginBottom: 10,
  },
  dateRow: {
    flexDirection: 'row',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
  },
  dateCol: {
    flex: 1,
  },
  dateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  dateLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  dateValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  dateValueActive: {
    fontSize: 12,
    fontWeight: '700',
    color: '#18794E',
  },
  summaryBox: {
    marginTop: 10,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#18794E',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 2,
  },
  summaryText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
  },
  acceptanceActiveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    gap: 10,
  },
  acceptanceActiveIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptanceActiveTextWrap: {
    flex: 1,
  },
  acceptanceActiveTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  acceptanceActiveSubtitle: {
    fontSize: 11,
    color: '#15803D',
    marginTop: 2,
    lineHeight: 16,
  },
  acceptancePendingCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    gap: 8,
  },
  acceptancePendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  acceptancePendingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  acceptancePendingSubtitle: {
    fontSize: 12,
    color: '#B45309',
    lineHeight: 17,
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#114D3F',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 4,
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  contentBody: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  h1: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F2922',
    marginBottom: 10,
  },
  h2: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F2922',
  },
  sectionHeaderWrap: {
    marginTop: 14,
    marginBottom: 6,
  },
  h3: {
    fontSize: 14,
    fontWeight: '700',
    color: '#114D3F',
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 12,
  },
  paragraph: {
    fontSize: 13,
    lineHeight: 21,
    color: '#334155',
    marginBottom: 10,
  },
  bulletList: {
    marginBottom: 10,
    gap: 6,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#114D3F',
    marginTop: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: '#334155',
  },
  footerNotice: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    alignItems: 'flex-start',
  },
  footerText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: '#64748B',
  },
});
