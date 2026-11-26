/**
 * Aught2 Pickleball — Step 3: Payment & Submit
 *
 * Clean, payment-free tournament registration final step:
 * - Card 1: Registration summary (Division, Players, Fee, Preferred method)
 * - Card 2: Preferred payment method selection (UPI vs Card)
 *     * Concise notice: "Payment collection will be enabled soon. No payment is required right now."
 *     * Terms checkbox: "I agree to the tournament rules and cancellation policy. *"
 * - Primary Action Button: "Complete Registration"
 * - Subtext: "Instant registration confirmation upon submission."
 */

import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CreditCard,
  ShieldCheck,
  Zap,
} from 'lucide-react-native';

import { AppText } from '../AppText';
import type { Tournament, TournamentDiscoveryItem } from '@/types';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';
import type { RegistrationErrors, RegistrationFormState } from './types';

interface Step3Props {
  tournament: TournamentDiscoveryItem | Tournament;
  formState: RegistrationFormState;
  errors: RegistrationErrors;
  isSubmitting: boolean;
  submitError: string | null;
  onChange: (patch: Partial<RegistrationFormState>) => void;
  onBack: () => void;
  onSubmit: () => void;
}

export function Step3PaymentSubmit({
  tournament,
  formState,
  errors,
  isSubmitting,
  submitError,
  onChange,
  onBack,
  onSubmit,
}: Step3Props) {
  const router = useRouter();
  const parsed = parseTournamentConfig(tournament);
  const isDoubles = !parsed.isSingles;
  const isScramble = tournament.format === 'scramble';
  const category = parsed.category || (isScramble ? 'Open Scramble' : 'Singles');

  // Fee calculation (from Club configuration or format defaults)
  const rawFee = (tournament as any).registration_fee != null
    ? Number((tournament as any).registration_fee)
    : (tournament as any).format_configuration?.entry_fee != null
    ? Number((tournament as any).format_configuration.entry_fee)
    : (tournament as any).format_configuration?.registration_fee != null
    ? Number((tournament as any).format_configuration.registration_fee)
    : null;

  const defaultFee = isScramble
    ? 35
    : parsed.isSingles
    ? 30
    : tournament.format === 'bracket'
    ? 60
    : 50;

  const feeAmount: number = rawFee !== null && !isNaN(rawFee) ? rawFee : defaultFee;
  const isFree = feeAmount === 0;

  const feeLabel = isDoubles ? 'Registration fee (per team)' : 'Registration fee (per player)';

  // Default preferred payment method to 'upi' or 'card' (never 'mobile_number')
  useEffect(() => {
    if (formState.paymentMethod === 'mobile_number' || !formState.paymentMethod) {
      onChange({ paymentMethod: 'upi' });
    }
  }, []);

  // Players display string
  const playersDisplay = isDoubles
    ? `${formState.fullName || 'Player 1'} & ${formState.partnerFullName || formState.selectedPartner?.full_name || 'Partner 2'}`
    : formState.fullName || 'Player';

  const preferredMethodLabel = isFree
    ? 'Free Entry'
    : formState.paymentMethod === 'card'
    ? 'Card (Preferred)'
    : 'UPI (Preferred)';

  return (
    <View style={styles.container}>
      {/* ─── Card 1: Registration Summary ─── */}
      <View style={styles.card}>
        <AppText style={styles.cardTitle}>Registration summary</AppText>

        <View style={styles.cardBody}>
          <View style={styles.summaryRow}>
            <AppText style={styles.summaryLabel}>Tournament</AppText>
            <AppText style={styles.summaryValue} numberOfLines={1}>{tournament.name}</AppText>
          </View>

          <View style={styles.summaryRow}>
            <AppText style={styles.summaryLabel}>Division</AppText>
            <AppText style={styles.summaryValue}>{category}</AppText>
          </View>

          <View style={styles.summaryRow}>
            <AppText style={styles.summaryLabel}>Players</AppText>
            <AppText style={styles.summaryValue} numberOfLines={1}>{playersDisplay}</AppText>
          </View>

          <View style={styles.summaryRow}>
            <AppText style={styles.summaryLabel}>{feeLabel}</AppText>
            <AppText style={styles.summaryValue}>{isFree ? 'Free' : `$${feeAmount}.00`}</AppText>
          </View>

          {!isFree && (
            <View style={styles.summaryRow}>
              <AppText style={styles.summaryLabel}>Payment preference</AppText>
              <AppText style={[styles.summaryValue, { color: '#065F46' }]}>
                {preferredMethodLabel}
              </AppText>
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.totalRow}>
            <View>
              <AppText style={styles.totalLabel}>Due today</AppText>
              <AppText style={styles.dueSubtext}>
                {isFree ? 'Free tournament entry' : 'Payment collection enabled soon'}
              </AppText>
            </View>
            <AppText style={styles.totalValue}>$0.00</AppText>
          </View>
        </View>
      </View>

      {/* ─── Card 2: Preferred Payment Method / Terms ─── */}
      <View style={styles.card}>
        <AppText style={styles.cardTitle}>
          {isFree ? 'Rules & agreement' : 'Preferred payment method'}
        </AppText>

        {!isFree ? (
          <>
            <AppText style={styles.sectionSubtitle}>
              Select your preferred method for future payment collection.
            </AppText>

            {/* Payment Method Selection: UPI vs Card */}
            <View style={styles.tabsRow}>
              <TouchableOpacity
                style={[
                  styles.methodTab,
                  formState.paymentMethod === 'upi' && styles.methodTabActive,
                ]}
                onPress={() => onChange({ paymentMethod: 'upi' })}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Select UPI preferred payment method"
              >
                <Zap
                  size={16}
                  color={formState.paymentMethod === 'upi' ? '#064E3B' : '#64748B'}
                  strokeWidth={2.4}
                />
                <AppText
                  style={[
                    styles.methodTabText,
                    formState.paymentMethod === 'upi' && styles.methodTabTextActive,
                  ]}
                  numberOfLines={1}
                >
                  UPI
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.methodTab,
                  formState.paymentMethod === 'card' && styles.methodTabActive,
                ]}
                onPress={() => onChange({ paymentMethod: 'card' })}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Select Card preferred payment method"
              >
                <CreditCard
                  size={16}
                  color={formState.paymentMethod === 'card' ? '#064E3B' : '#64748B'}
                  strokeWidth={2.2}
                />
                <AppText
                  style={[
                    styles.methodTabText,
                    formState.paymentMethod === 'card' && styles.methodTabTextActive,
                  ]}
                  numberOfLines={1}
                >
                  Card
                </AppText>
              </TouchableOpacity>
            </View>

            {/* Concise Payment Notice */}
            <View style={styles.noticeBox}>
              <CheckCircle2 size={16} color="#065F46" style={{ marginTop: 2 }} />
              <View style={styles.noticeTextCol}>
                <AppText style={styles.noticeTitle}>
                  Payment collection will be enabled soon. No payment is required right now.
                </AppText>
                <AppText style={styles.noticeDesc}>
                  Your preference will be saved for upcoming payment support. No card details, UPI PIN, or banking credentials are required today.
                </AppText>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.freeNoticeBox}>
            <ShieldCheck size={16} color="#065F46" style={{ marginTop: 1 }} />
            <AppText style={styles.freeNoticeText}>
              This tournament offers free registration. No payment is required.
            </AppText>
          </View>
        )}

        {/* Terms & Cancellation Checkbox */}
        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => onChange({ agreeRulesAndCancellation: !formState.agreeRulesAndCancellation })}
          activeOpacity={0.8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: formState.agreeRulesAndCancellation }}
        >
          <View
            style={[
              styles.checkboxBox,
              formState.agreeRulesAndCancellation && styles.checkboxBoxActive,
            ]}
          >
            {formState.agreeRulesAndCancellation && (
              <Check size={12} color="#FFFFFF" strokeWidth={3} />
            )}
          </View>
          <AppText style={styles.checkboxLabel}>
            I agree to the <AppText style={styles.linkText}>tournament rules</AppText> and{' '}
            <AppText style={styles.linkText}>cancellation policy</AppText>. <AppText style={{ color: '#DC2626' }}>*</AppText>
          </AppText>
        </TouchableOpacity>
        {errors.agreeRulesAndCancellation && (
          <AppText style={styles.errorText}>{errors.agreeRulesAndCancellation}</AppText>
        )}
      </View>

      {/* ─── Submit Error Display ─── */}
      {submitError && (
        <View style={styles.submitErrorCard}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <AlertCircle size={16} color="#DC2626" style={{ marginTop: 1 }} />
            <AppText style={styles.submitErrorText}>{submitError}</AppText>
          </View>
          {submitError.toLowerCase().includes('partner') ? (
            <TouchableOpacity
              style={styles.errorClubActionBtn}
              onPress={onBack}
              activeOpacity={0.8}
            >
              <AppText style={styles.errorClubActionBtnText}>
                ← Go back to change partner
              </AppText>
            </TouchableOpacity>
          ) : null}
          {(submitError.toLowerCase().includes('member') || submitError.toLowerCase().includes('membership')) && (tournament as any).club_id ? (
            <TouchableOpacity
              style={styles.errorClubActionBtn}
              onPress={() => {
                router.push({
                  pathname: '/(player)/club-details' as any,
                  params: { id: (tournament as any).club_id },
                });
              }}
              activeOpacity={0.8}
            >
              <AppText style={styles.errorClubActionBtnText}>
                View {(tournament as any).club_name || 'Host Club'} & Request Membership →
              </AppText>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* ─── Submit Action Button ─── */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
          onPress={onSubmit}
          disabled={isSubmitting}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Complete Registration"
        >
          {isSubmitting ? (
            <View style={styles.submittingRow}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <AppText style={styles.submitBtnText}>Completing registration...</AppText>
            </View>
          ) : (
            <AppText style={styles.submitBtnText}>Complete Registration</AppText>
          )}
        </TouchableOpacity>

        {/* Reassurance Subtext */}
        <View style={styles.lockRow}>
          <CheckCircle2 size={13} color="#065F46" />
          <AppText style={styles.lockText}>
            Instant registration confirmation upon submission.
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F2E28',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 12,
  },
  cardBody: {
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontSize: 12.5,
    color: '#64748B',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F2E28',
    maxWidth: '65%',
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F2E28',
  },
  dueSubtext: {
    fontSize: 11,
    color: '#059669',
    marginTop: 1,
    fontWeight: '500',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F2E28',
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  methodTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  methodTabActive: {
    borderColor: '#064E3B',
    backgroundColor: '#F0FDF4',
  },
  methodTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  methodTabTextActive: {
    color: '#064E3B',
    fontWeight: '700',
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  noticeTextCol: {
    flex: 1,
    gap: 3,
  },
  noticeTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#065F46',
    lineHeight: 17,
  },
  noticeDesc: {
    fontSize: 11.5,
    color: '#047857',
    lineHeight: 16,
  },
  freeNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  freeNoticeText: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '600',
    flex: 1,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 2,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxBoxActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 16,
  },
  linkText: {
    color: '#064E3B',
    textDecorationLine: 'underline',
  },
  errorText: {
    fontSize: 11,
    color: '#DC2626',
    marginTop: 4,
  },
  submitErrorCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  submitErrorText: {
    flex: 1,
    fontSize: 12.5,
    color: '#DC2626',
    lineHeight: 18,
  },
  errorClubActionBtn: {
    marginTop: 4,
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  errorClubActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  actionsContainer: {
    gap: 8,
    marginTop: 4,
  },
  submitBtn: {
    backgroundColor: '#064E3B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submittingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  lockText: {
    fontSize: 11.5,
    color: '#065F46',
    fontWeight: '500',
  },
});
