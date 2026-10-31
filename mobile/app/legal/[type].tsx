/**
 * Aught2 Pickleball — Centralized Legal Document Reader
 *
 * Dedicated document-viewer for Player & Club legal policies:
 * - /legal/player_terms (Player Terms of Service)
 * - /legal/privacy_policy (Privacy Policy)
 * - /legal/club_terms (Club & Facility Terms of Service)
 * - /legal/club_agreement (Club/Facility Operating Agreement)
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
  FileCheck,
  FileText,
  Info,
  Share2,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
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

// ─── Inline Markdown Formatter ───────────────────────────────────────────────
function renderInlineFormatting(text: string, keyPrefix: string = 'inline'): React.ReactNode {
  if (!text) return null;

  // Matches **bold** or *italic*
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let tokenIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      const boldContent = token.slice(2, -2);
      elements.push(
        <AppText key={`${keyPrefix}-b-${tokenIdx++}`} style={styles.boldText}>
          {boldContent}
        </AppText>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      const italicContent = token.slice(1, -1);
      elements.push(
        <AppText key={`${keyPrefix}-i-${tokenIdx++}`} style={styles.italicText}>
          {italicContent}
        </AppText>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return elements.length > 0 ? elements : text;
}

// ─── Block Markdown Parser ───────────────────────────────────────────────────
interface ParsedBlock {
  type: 'h1' | 'h2' | 'h3' | 'divider' | 'bullet_list' | 'submeta' | 'paragraph' | 'footnote';
  text?: string;
  items?: string[];
}

function parseMarkdownDocument(rawMarkdown: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const lines = rawMarkdown.replace(/\r\n/g, '\n').split('\n');

  let currentBullets: string[] = [];
  let currentParagraphLines: string[] = [];

  const flushBullets = () => {
    if (currentBullets.length > 0) {
      blocks.push({ type: 'bullet_list', items: [...currentBullets] });
      currentBullets = [];
    }
  };

  const flushParagraph = () => {
    if (currentParagraphLines.length > 0) {
      const fullText = currentParagraphLines.join(' ').trim();
      if (fullText) {
        if (fullText.startsWith('*') && fullText.endsWith('*') && !fullText.startsWith('**')) {
          blocks.push({ type: 'footnote', text: fullText.slice(1, -1) });
        } else {
          blocks.push({ type: 'paragraph', text: fullText });
        }
      }
      currentParagraphLines = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushBullets();
      flushParagraph();
      continue;
    }

    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      flushBullets();
      flushParagraph();
      blocks.push({ type: 'divider' });
      continue;
    }

    if (trimmed.startsWith('# ')) {
      flushBullets();
      flushParagraph();
      blocks.push({ type: 'h1', text: trimmed.slice(2).trim() });
      continue;
    }

    if (trimmed.startsWith('## ')) {
      flushBullets();
      flushParagraph();
      blocks.push({ type: 'h2', text: trimmed.slice(3).trim() });
      continue;
    }

    if (trimmed.startsWith('### ')) {
      flushBullets();
      flushParagraph();
      blocks.push({ type: 'h3', text: trimmed.slice(4).trim() });
      continue;
    }

    // Bullet items starting with - or *
    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      currentBullets.push(trimmed.replace(/^[-*]\s+/, '').trim());
      continue;
    }

    // If we were accumulating bullets and hit non-bullet text, flush bullets
    flushBullets();

    // Check for inline version / effective date subheader
    if (
      trimmed.startsWith('**Version') ||
      (trimmed.startsWith('**') && trimmed.includes('Effective Date'))
    ) {
      flushParagraph();
      blocks.push({ type: 'submeta', text: trimmed });
      continue;
    }

    currentParagraphLines.push(trimmed);
  }

  flushBullets();
  flushParagraph();

  return blocks;
}

// ─── Legal Document Screen Component ─────────────────────────────────────────
export default function LegalDocumentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ type?: string; version?: string }>();

  const documentType = (params.type || 'player_terms').toLowerCase();
  const versionParam = params.version;

  const user = useAuthStore((s) => s.user);
  const activeMembership = useAuthStore((s) => s.activeMembership);
  const activePortal = useAuthStore((s) => s.activePortal);
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

    // Check user's acceptance status if signed in
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
    } else if (activePortal === 'club' || activeMembership) {
      router.replace('/(club)/profile' as any);
    } else {
      router.replace('/(player)/profile' as any);
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
        source: activePortal === 'club' ? 'club_portal' : 'player_portal',
      });
      setAcceptance(res);
      Alert.alert(
        'Agreement Accepted',
        'The document has been officially accepted and recorded.'
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
  const parsedBlocks = document?.content ? parseMarkdownDocument(document.content) : [];

  return (
    <View style={styles.container}>
      {/* Consistent Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 4 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleBack}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Go back to Profile"
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
            { paddingBottom: Math.max(insets.bottom, 20) + 100 },
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

          {/* Standardized Document Information Card */}
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
                  <AppText style={styles.dateLabel}>Publication Status:</AppText>
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

          {/* Acceptance Status Banner (when applicable) */}
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

          {/* Document Content with Complete Markdown Formatting */}
          <View style={styles.contentBody}>
            {parsedBlocks.map((block, idx) => {
              switch (block.type) {
                case 'h1':
                  return (
                    <AppText key={idx} style={styles.h1}>
                      {block.text}
                    </AppText>
                  );

                case 'submeta':
                  return (
                    <View key={idx} style={styles.submetaRow}>
                      <AppText style={styles.submetaText}>
                        {renderInlineFormatting(block.text || '', `sm-${idx}`)}
                      </AppText>
                    </View>
                  );

                case 'h2':
                  return (
                    <View key={idx} style={styles.h2Wrap}>
                      <AppText style={styles.h2}>
                        {renderInlineFormatting(block.text || '', `h2-${idx}`)}
                      </AppText>
                    </View>
                  );

                case 'h3':
                  return (
                    <View key={idx} style={styles.h3Wrap}>
                      <AppText style={styles.h3}>
                        {renderInlineFormatting(block.text || '', `h3-${idx}`)}
                      </AppText>
                    </View>
                  );

                case 'divider':
                  return <View key={idx} style={styles.divider} />;

                case 'bullet_list':
                  return (
                    <View key={idx} style={styles.bulletList}>
                      {block.items?.map((item, itemIdx) => (
                        <View key={itemIdx} style={styles.bulletRow}>
                          <View style={styles.bulletDot} />
                          <AppText style={styles.bulletText}>
                            {renderInlineFormatting(item, `b-${idx}-${itemIdx}`)}
                          </AppText>
                        </View>
                      ))}
                    </View>
                  );

                case 'footnote':
                  return (
                    <View key={idx} style={styles.footnoteBox}>
                      <Info size={14} color="#64748B" style={styles.footnoteIcon} />
                      <AppText style={styles.footnoteText}>
                        {renderInlineFormatting(block.text || '', `fn-${idx}`)}
                      </AppText>
                    </View>
                  );

                case 'paragraph':
                default:
                  return (
                    <AppText key={idx} style={styles.paragraph}>
                      {renderInlineFormatting(block.text || '', `p-${idx}`)}
                    </AppText>
                  );
              }
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
    backgroundColor: '#F8FAF9',
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
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E8EDEA',
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
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8EDEA',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
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
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 5,
  },
  docTypeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#114D3F',
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
    backgroundColor: '#F8FAF9',
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#114D3F',
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
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
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
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
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
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E8EDEA',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  h1: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F2922',
    marginBottom: 6,
    lineHeight: 23,
  },
  submetaRow: {
    marginBottom: 10,
  },
  submetaText: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
  },
  h2Wrap: {
    marginTop: 16,
    marginBottom: 6,
  },
  h2: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F2922',
  },
  h3Wrap: {
    marginTop: 14,
    marginBottom: 6,
  },
  h3: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F2922',
  },
  divider: {
    height: 1,
    backgroundColor: '#E8EDEA',
    marginVertical: 12,
  },
  paragraph: {
    fontSize: 13,
    lineHeight: 22,
    color: '#334155',
    marginBottom: 10,
  },
  boldText: {
    fontWeight: '700',
    color: '#0F2922',
  },
  italicText: {
    fontStyle: 'italic',
    color: '#475569',
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
    lineHeight: 21,
    color: '#334155',
  },
  footnoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAF9',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E8EDEA',
  },
  footnoteIcon: {
    marginTop: 1,
  },
  footnoteText: {
    flex: 1,
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
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
