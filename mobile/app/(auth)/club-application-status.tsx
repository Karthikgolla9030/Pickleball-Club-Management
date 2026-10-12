/**
 * Aught2 Pickleball — Club Application Status & Confirmation Screen
 *
 * Provides:
 * 1. Post-submission confirmation banner with application reference.
 * 2. Safe status verification requiring both reference number and email.
 * 3. Clear pending, approved, and rejected state presentations.
 * 4. Direct navigation back to Club Staff Sign In once approved.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CheckCircle2,
  Clock,
  FileSearch,
  HelpCircle,
  LogIn,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Badge,
  Button,
  Card,
  FormField,
  Screen,
} from '@/components';
import { clubApplicationsApi, type ClubApplicationStatusLookupResponse } from '@/services/api';
import { Colors, Radius, Spacing } from '@/theme';

export default function ClubApplicationStatusScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    reference_number?: string;
    email?: string;
    newly_submitted?: string;
  }>();

  const [refInput, setRefInput] = useState(params.reference_number || '');
  const [emailInput, setEmailInput] = useState(params.email || '');
  const [statusData, setStatusData] = useState<ClubApplicationStatusLookupResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  const fetchStatus = async (ref: string, em: string) => {
    if (!ref.trim() || !em.trim()) return;

    setIsLoading(true);
    setLookupError('');
    try {
      const data = await clubApplicationsApi.getStatus(ref.trim(), em.trim());
      setStatusData(data);
    } catch (err: any) {
      setStatusData(null);
      const msg = err?.response?.data?.detail || err?.message || 'Application not found with the provided details.';
      setLookupError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (params.reference_number && params.email) {
      fetchStatus(params.reference_number, params.email);
    }
  }, [params.reference_number, params.email]);

  const handleLookup = () => {
    if (!refInput.trim() || !emailInput.trim()) {
      setLookupError('Please enter both your Application Reference Number and Email Address.');
      return;
    }
    fetchStatus(refInput, emailInput);
  };

  const isNewlySubmitted = params.newly_submitted === '1';

  return (
    <Screen style={styles.screen}>
      <AppHeader
        title="Application Status"
        showBack
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 60 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Newly Submitted Success Banner */}
          {isNewlySubmitted && (
            <Card style={styles.successBanner}>
              <View style={styles.bannerIconRow}>
                <CheckCircle2 size={24} color="#15803D" />
                <AppText variant="heading3" style={styles.bannerTitle}>
                  Application Submitted!
                </AppText>
              </View>
              <AppText variant="bodySmall" style={styles.bannerText}>
                Your club registration request has been submitted successfully. Your application is awaiting review by the Aught2 Pickleball platform team.
              </AppText>
              <AppText variant="caption" style={styles.bannerSubtext}>
                Please save your Application Reference Number below to track your application review progress.
              </AppText>
            </Card>
          )}

          {/* Active Status Display Card */}
          {statusData && (
            <Card style={styles.resultCard}>
              <View style={styles.statusHeaderRow}>
                <View style={styles.refCol}>
                  <AppText variant="caption" color="secondary">
                    Application Reference
                  </AppText>
                  <AppText variant="heading3" style={styles.refNumber}>
                    {statusData.reference_number}
                  </AppText>
                </View>

                {statusData.status === 'pending' && (
                  <View style={[styles.statusBadge, styles.badgePending]}>
                    <Clock size={14} color="#B45309" />
                    <AppText variant="caption" style={styles.badgePendingText}>
                      Pending Review
                    </AppText>
                  </View>
                )}

                {statusData.status === 'approved' && (
                  <View style={[styles.statusBadge, styles.badgeApproved]}>
                    <CheckCircle2 size={14} color="#15803D" />
                    <AppText variant="caption" style={styles.badgeApprovedText}>
                      Approved
                    </AppText>
                  </View>
                )}

                {statusData.status === 'rejected' && (
                  <View style={[styles.statusBadge, styles.badgeRejected]}>
                    <XCircle size={14} color="#B91C1C" />
                    <AppText variant="caption" style={styles.badgeRejectedText}>
                      Rejected
                    </AppText>
                  </View>
                )}
              </View>

              <View style={styles.detailDivider} />

              <View style={styles.detailsGrid}>
                <View style={styles.detailItem}>
                  <AppText variant="caption" color="secondary">
                    Club Facility
                  </AppText>
                  <AppText variant="bodySmall" style={styles.detailValue}>
                    {statusData.club_name}
                  </AppText>
                </View>

                <View style={styles.detailItem}>
                  <AppText variant="caption" color="secondary">
                    Applicant
                  </AppText>
                  <AppText variant="bodySmall" style={styles.detailValue}>
                    {statusData.applicant_name}
                  </AppText>
                </View>

                <View style={styles.detailItem}>
                  <AppText variant="caption" color="secondary">
                    Submission Date
                  </AppText>
                  <AppText variant="bodySmall" style={styles.detailValue}>
                    {new Date(statusData.created_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </AppText>
                </View>
              </View>

              {/* Status Specific Message Card */}
              <View
                style={[
                  styles.messageBox,
                  statusData.status === 'pending' && styles.messageBoxPending,
                  statusData.status === 'approved' && styles.messageBoxApproved,
                  statusData.status === 'rejected' && styles.messageBoxRejected,
                ]}
              >
                <AppText
                  variant="bodySmall"
                  style={[
                    styles.messageText,
                    statusData.status === 'pending' && styles.messageTextPending,
                    statusData.status === 'approved' && styles.messageTextApproved,
                    statusData.status === 'rejected' && styles.messageTextRejected,
                  ]}
                >
                  {statusData.message}
                </AppText>
              </View>

              {/* Approved Next Action */}
              {statusData.status === 'approved' && (
                <View style={styles.approvedActionContainer}>
                  <Button
                    label="Sign In to Club Management"
                    onPress={() => router.replace('/(auth)/login?portal=club' as any)}
                  />
                </View>
              )}
            </Card>
          )}

          {/* Loading Indicator */}
          {isLoading && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="#18794E" />
              <AppText variant="caption" color="secondary">
                Checking application records...
              </AppText>
            </View>
          )}

          {/* Lookup Card */}
          <Card style={styles.lookupCard}>
            <View style={styles.lookupHeader}>
              <Search size={18} color="#18794E" />
              <AppText variant="heading3" style={styles.lookupTitle}>
                Look Up Another Application
              </AppText>
            </View>
            <AppText variant="caption" color="secondary" style={styles.lookupSub}>
              Enter your Application Reference Number and Email to check current review status.
            </AppText>

            <FormField
              label="Application Reference Number *"
              value={refInput}
              onChangeText={setRefInput}
              placeholder="e.g. APP-XXXXXXXX"
              autoCapitalize="characters"
            />

            <FormField
              label="Applicant Email *"
              value={emailInput}
              onChangeText={setEmailInput}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            {lookupError ? (
              <View style={styles.errorBox}>
                <ShieldAlert size={16} color="#DC2626" />
                <AppText variant="caption" style={styles.errorText}>
                  {lookupError}
                </AppText>
              </View>
            ) : null}

            <Button
              label={isLoading ? 'Looking Up...' : 'Check Status'}
              onPress={handleLookup}
              disabled={isLoading}
              variant="outline"
            />
          </Card>

          {/* Return to Sign In */}
          <View style={styles.footerActions}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.replace('/(auth)/login?portal=club' as any)}
              activeOpacity={0.7}
            >
              <LogIn size={16} color="#18794E" />
              <AppText variant="bodySmall" style={styles.backButtonText}>
                Return to Club Staff Sign In
              </AppText>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[3],
    gap: Spacing[4],
  },
  successBanner: {
    padding: Spacing[4],
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: Radius.lg,
    gap: Spacing[2],
  },
  bannerIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  bannerTitle: {
    color: '#15803D',
    fontSize: 17,
  },
  bannerText: {
    color: '#166534',
    lineHeight: 20,
  },
  bannerSubtext: {
    color: '#15803D',
    marginTop: 4,
  },
  resultCard: {
    padding: Spacing[4],
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.lg,
    gap: Spacing[3],
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  refCol: {
    gap: 2,
  },
  refNumber: {
    fontSize: 18,
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgePending: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  badgePendingText: {
    color: '#B45309',
    fontWeight: '600',
  },
  badgeApproved: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  badgeApprovedText: {
    color: '#15803D',
    fontWeight: '600',
  },
  badgeRejected: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  badgeRejectedText: {
    color: '#B91C1C',
    fontWeight: '600',
  },
  detailDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[3],
  },
  detailItem: {
    minWidth: 120,
    gap: 2,
  },
  detailValue: {
    color: '#0F172A',
    fontWeight: '500',
  },
  messageBox: {
    padding: Spacing[3],
    borderRadius: Radius.md,
    marginTop: Spacing[1],
  },
  messageBoxPending: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  messageBoxApproved: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  messageBoxRejected: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  messageText: {
    lineHeight: 19,
  },
  messageTextPending: {
    color: '#92400E',
  },
  messageTextApproved: {
    color: '#166534',
  },
  messageTextRejected: {
    color: '#991B1B',
  },
  approvedActionContainer: {
    marginTop: Spacing[2],
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[4],
  },
  lookupCard: {
    padding: Spacing[4],
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.lg,
    gap: Spacing[3],
  },
  lookupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  lookupTitle: {
    fontSize: 15,
    color: '#0F172A',
  },
  lookupSub: {
    color: '#64748B',
    marginTop: -4,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: Radius.md,
    padding: Spacing[2],
  },
  errorText: {
    color: '#B91C1C',
    flex: 1,
  },
  footerActions: {
    alignItems: 'center',
    marginTop: Spacing[2],
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
  },
  backButtonText: {
    color: '#18794E',
    fontWeight: '600',
  },
});
