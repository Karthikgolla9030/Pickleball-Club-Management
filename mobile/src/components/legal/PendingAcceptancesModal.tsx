/**
 * Aught2 Pickleball — Pending Legal Acceptances Modal
 *
 * Automatically prompts authenticated users to review and accept
 * updated legal documents whenever a newly published version has
 * `requires_renewed_acceptance: true`.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ExternalLink,
  FileText,
  ShieldAlert,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import {
  PendingAcceptanceItem,
  legalApi,
} from '@/services/api';
import { useAuthStore } from '@/store';
import { Colors, Radius, Spacing, Typography } from '@/theme';

export function PendingAcceptancesModal() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const activeMembership = useAuthStore((s) => s.activeMembership);

  const [pendingDocs, setPendingDocs] = useState<PendingAcceptanceItem[]>([]);
  const [acceptedDocIds, setAcceptedDocIds] = useState<Record<string, boolean>>({});
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const checkPending = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await legalApi.getPendingAcceptances(activeMembership?.club_id || null);
      if (res?.has_pending && res.pending_documents?.length > 0) {
        setPendingDocs(res.pending_documents);
        setIsOpen(true);
      } else {
        setIsOpen(false);
        setPendingDocs([]);
      }
    } catch (err) {
      console.warn('Failed to verify pending legal acceptances:', err);
    }
  }, [isAuthenticated, activeMembership?.club_id]);

  useEffect(() => {
    checkPending();
  }, [checkPending]);

  const toggleCheck = (versionId: string) => {
    setAcceptedDocIds((prev) => ({
      ...prev,
      [versionId]: !prev[versionId],
    }));
  };

  const allChecked =
    pendingDocs.length > 0 &&
    pendingDocs.every((doc) => Boolean(acceptedDocIds[doc.version_id]));

  const handleAcceptAll = async () => {
    if (!allChecked || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      for (const doc of pendingDocs) {
        await legalApi.acceptDocument({
          document_type: doc.document_type,
          version_id: doc.version_id,
          club_id: activeMembership?.club_id || null,
          source: 'renewed_acceptance_modal',
        });
      }
      setIsOpen(false);
      setPendingDocs([]);
      setAcceptedDocIds({});
    } catch (err: any) {
      setSubmitError(
        err?.response?.data?.detail || err?.message || 'Failed to record acceptance. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || pendingDocs.length === 0) {
    return null;
  }

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={() => {
        // Prevent dismissal without acceptance
      }}
    >
      <View style={styles.overlay}>
        <Card style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <ShieldAlert size={24} color="#D97706" />
            </View>
            <View style={styles.headerText}>
              <AppText style={styles.title}>Policy & Agreement Updates</AppText>
              <AppText style={styles.subtitle}>
                We have updated our terms. Please review and accept the changes below to continue using the platform.
              </AppText>
            </View>
          </View>

          {submitError && (
            <View style={styles.errorBox}>
              <AlertCircle size={16} color="#DC2626" />
              <AppText style={styles.errorText}>{submitError}</AppText>
            </View>
          )}

          {/* Pending Documents List */}
          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {pendingDocs.map((doc) => {
              const isChecked = Boolean(acceptedDocIds[doc.version_id]);
              return (
                <View key={doc.version_id} style={styles.docItem}>
                  <View style={styles.docHeader}>
                    <View style={styles.docTitleRow}>
                      <FileText size={16} color={Colors.brand.primary} />
                      <AppText style={styles.docTitle}>{doc.document_title}</AppText>
                      <Badge variant="success" size="sm" label={doc.version} />
                    </View>

                    <TouchableOpacity
                      style={styles.reviewBtn}
                      onPress={() => router.push(`/legal/${doc.document_type}` as any)}
                      activeOpacity={0.7}
                    >
                      <AppText style={styles.reviewBtnText}>Read Full Document</AppText>
                      <ExternalLink size={12} color={Colors.brand.primary} />
                    </TouchableOpacity>
                  </View>

                  {doc.content_summary ? (
                    <AppText style={styles.docSummary}>{doc.content_summary}</AppText>
                  ) : null}

                  {doc.effective_date && (
                    <AppText style={styles.docDate}>
                      Effective Date: {new Date(doc.effective_date).toLocaleDateString()}
                    </AppText>
                  )}

                  {/* Accept Checkbox */}
                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => toggleCheck(doc.version_id)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.checkbox, isChecked && styles.checkboxActive]}>
                      {isChecked && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                    </View>
                    <AppText style={styles.checkboxLabel}>
                      I have read and agree to the updated {doc.document_title} ({doc.version})
                    </AppText>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.acceptBtn, (!allChecked || isSubmitting) && styles.acceptBtnDisabled]}
              onPress={handleAcceptAll}
              disabled={!allChecked || isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <CheckCircle2 size={18} color="#FFFFFF" />
                  <AppText style={styles.acceptBtnText}>Accept & Continue</AppText>
                </>
              )}
            </TouchableOpacity>
          </View>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[4],
  },
  modalCard: {
    width: '100%',
    maxWidth: 540,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: Spacing[5],
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    gap: Spacing[3],
    marginBottom: Spacing[4],
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: Typography.size.base,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: Typography.size.xs,
    color: '#64748B',
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing[2],
    marginBottom: Spacing[2],
  },
  errorText: {
    fontSize: Typography.size.xs,
    color: '#DC2626',
    flex: 1,
  },
  body: {
    maxHeight: 380,
  },
  docItem: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[2],
  },
  docHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 6,
  },
  docTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  docTitle: {
    fontSize: Typography.size.sm,
    fontWeight: '700',
    color: '#0F172A',
  },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reviewBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.brand.primary,
  },
  docSummary: {
    fontSize: Typography.size.xs,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 6,
  },
  docDate: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 8,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F6',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxActive: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  checkboxLabel: {
    fontSize: Typography.size.xs,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
  },
  footer: {
    marginTop: Spacing[4],
    paddingTop: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.brand.primary,
    borderRadius: Radius.md,
    height: 44,
  },
  acceptBtnDisabled: {
    opacity: 0.5,
  },
  acceptBtnText: {
    fontSize: Typography.size.sm,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
