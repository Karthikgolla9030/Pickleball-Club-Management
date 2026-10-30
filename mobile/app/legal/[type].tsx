/**
 * Aught2 Pickleball — Centralized Legal Document Reader
 *
 * Accessible to players, club staff, platform admins, and unauthenticated public visitors:
 * - /legal/player_terms (Player Terms of Service)
 * - /legal/club_terms (Club & Facility Terms of Service)
 * - /legal/privacy_policy (Privacy Policy)
 * - /legal/club_agreement (Club/Facility Operating Agreement)
 * - /legal/terms (alias to Player Terms)
 * - /legal/privacy (alias to Privacy Policy)
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
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  Share2,
  ShieldCheck,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { legalApi, LegalDocumentVersionItem } from '@/services/api';
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

export default function LegalDocumentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ type?: string; version?: string }>();

  const documentType = (params.type || 'player_terms').toLowerCase();
  const versionParam = params.version;

  const [document, setDocument] = useState<LegalDocumentVersionItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);

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

    return () => {
      isMounted = false;
    };
  }, [documentType, versionParam]);

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

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 6 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleBack}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={22} color="#0F2922" strokeWidth={2.2} />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <AppText style={styles.headerTitle} numberOfLines={1}>
            {document?.title || 'Legal Document'}
          </AppText>
        </View>

        <TouchableOpacity
          style={styles.shareBtn}
          onPress={handleShare}
          activeOpacity={0.7}
          disabled={!document}
          accessibilityLabel="Share document"
        >
          <Share2 size={19} color="#293D38" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#18794E" />
          <AppText style={styles.loadingText}>Loading document...</AppText>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <ErrorState message={error} onRetry={() => router.replace(('/legal/' + documentType) as any)} />
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
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Document Metadata Card */}
          <View style={styles.metaCard}>
            <View style={styles.metaRow}>
              <View style={styles.docTypeBadge}>
                <ShieldCheck size={14} color="#18794E" strokeWidth={2.2} />
                <AppText style={styles.docTypeBadgeText}>Official Policy</AppText>
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
                  <AppText style={styles.dateLabel}>Last Updated:</AppText>
                </View>
                <AppText style={styles.dateValue}>{formatDate(document.updated_at)}</AppText>
              </View>
            </View>

            {document.change_summary ? (
              <View style={styles.summaryBox}>
                <AppText style={styles.summaryLabel}>Revision Summary:</AppText>
                <AppText style={styles.summaryText}>{document.change_summary}</AppText>
              </View>
            ) : null}
          </View>

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
              This document is binding upon registered members and facilities of the Aught2 Pickleball
              platform. For legal inquiries, please contact platform operations through Help & Support.
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
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
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
  shareBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
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
    paddingTop: 16,
  },
  metaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  docTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 5,
  },
  docTypeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#18794E',
  },
  versionBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  versionBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  docHeading: {
    fontSize: 19,
    fontWeight: '700',
    color: '#0F2922',
    marginBottom: 12,
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
  summaryBox: {
    marginTop: 12,
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
  contentBody: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
  },
  h1: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F2922',
    marginBottom: 12,
  },
  sectionHeaderWrap: {
    marginTop: 16,
    marginBottom: 8,
  },
  h3: {
    fontSize: 15,
    fontWeight: '700',
    color: '#18794E',
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 14,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 22,
    color: '#334155',
    marginBottom: 8,
  },
  footerNotice: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    alignItems: 'flex-start',
  },
  footerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
  },
});

