/**
 * Aught2 Pickleball — Step 3: Payment & Submit
 *
 * Exact recreation of Screen 3 from reference designs:
 * - Card 1: Registration summary (Division, Players, Entry fee, Service fee, Total due)
 * - Card 2: Payment method (Tabs for Card vs UPI)
 *     * Card: Cardholder name, Card number with card icon, Expiry date, CVV with (?)
 *     * UPI: UPI ID / VPA
 *     * Security callout: "Your payment information is secure and encrypted."
 *     * Checkbox: "I agree to the tournament rules and cancellation policy. *"
 * - Primary Action Button: "Pay $XX.00 & submit registration →"
 * - Subtext: "🔒 Registration is confirmed after successful payment."
 */

import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertCircle,
  Check,
  CreditCard,
  HelpCircle,
  Lock,
  ShieldCheck,
  Zap,
} from 'lucide-react-native';

import { AppText } from '../AppText';
import type { Tournament, TournamentDiscoveryItem, TournamentFormat } from '@/types';
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

  const feeLabel = isDoubles ? 'Entry fee (per team)' : 'Entry fee (per player)';

  // Players display string
  const playersDisplay = isDoubles
    ? `${formState.fullName || 'Player 1'} & ${formState.partnerFullName || formState.selectedPartner?.full_name || 'Partner 2'}`
    : formState.fullName || 'Player';

  return (
    <View style={styles.container}>
      {/* ─── Card 1: Registration Summary ─── */}
      <View style={styles.card}>
        <AppText style={styles.cardTitle}>Registration summary</AppText>

        <View style={styles.cardBody}>
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
            <AppText style={styles.summaryValue}>${feeAmount}.00</AppText>
          </View>

          <View style={styles.summaryRow}>
            <AppText style={styles.summaryLabel}>Service fee</AppText>
            <AppText style={styles.summaryValue}>$0.00</AppText>
          </View>

          <View style={styles.divider} />

          <View style={styles.totalRow}>
            <AppText style={styles.totalLabel}>Total due</AppText>
            <AppText style={styles.totalValue}>${feeAmount}.00</AppText>
          </View>
        </View>
      </View>

      {/* ─── Card 2: Payment Method ─── */}
      {!isFree && (
        <View style={styles.card}>
          <AppText style={styles.cardTitle}>Payment method</AppText>

          {/* Payment Tabs: Card vs UPI */}
          <View style={styles.tabsRow}>
            <TouchableOpacity
              style={[
                styles.methodTab,
                formState.paymentMethod === 'card' && styles.methodTabActive,
              ]}
              onPress={() => onChange({ paymentMethod: 'card' })}
              activeOpacity={0.8}
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
              >
                Card
              </AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.methodTab,
                formState.paymentMethod === 'upi' && styles.methodTabActive,
              ]}
              onPress={() => onChange({ paymentMethod: 'upi' })}
              activeOpacity={0.8}
            >
              <Zap
                size={16}
                color={formState.paymentMethod === 'upi' ? '#064E3B' : '#64748B'}
                strokeWidth={2.2}
              />
              <AppText
                style={[
                  styles.methodTabText,
                  formState.paymentMethod === 'upi' && styles.methodTabTextActive,
                ]}
              >
                UPI
              </AppText>
            </TouchableOpacity>
          </View>

          {/* Form Fields: Card */}
          {formState.paymentMethod === 'card' && (
            <View style={styles.fieldsContainer}>
              <View style={styles.fieldItem}>
                <AppText style={styles.fieldLabel}>Cardholder name</AppText>
                <TextInput
                  style={[styles.input, errors.cardholderName && styles.inputError]}
                  placeholder="Name on card"
                  placeholderTextColor="#94A3B8"
                  value={formState.cardholderName}
                  onChangeText={(text) => onChange({ cardholderName: text })}
                />
                {errors.cardholderName && (
                  <AppText style={styles.errorText}>{errors.cardholderName}</AppText>
                )}
              </View>

              <View style={styles.fieldItem}>
                <AppText style={styles.fieldLabel}>Card number</AppText>
                <View style={[styles.inputWithIcon, errors.cardNumber && styles.inputError]}>
                  <TextInput
                    style={styles.innerInput}
                    placeholder="1234 5678 9012 3456"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    maxLength={19}
                    value={formState.cardNumber}
                    onChangeText={(text) => {
                      // format with spaces
                      const cleaned = text.replace(/\D/g, '').slice(0, 16);
                      const formatted = cleaned.match(/.{1,4}/g)?.join(' ') || cleaned;
                      onChange({ cardNumber: formatted });
                    }}
                  />
                  <CreditCard size={18} color="#94A3B8" />
                </View>
                {errors.cardNumber && (
                  <AppText style={styles.errorText}>{errors.cardNumber}</AppText>
                )}
              </View>

              <View style={styles.rowFields}>
                <View style={styles.halfField}>
                  <AppText style={styles.fieldLabel}>Expiry date</AppText>
                  <TextInput
                    style={[styles.input, errors.cardExpiry && styles.inputError]}
                    placeholder="MM / YY"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    maxLength={7}
                    value={formState.cardExpiry}
                    onChangeText={(text) => {
                      const cleaned = text.replace(/\D/g, '').slice(0, 4);
                      const formatted = cleaned.length >= 2 ? `${cleaned.slice(0, 2)} / ${cleaned.slice(2)}` : cleaned;
                      onChange({ cardExpiry: formatted });
                    }}
                  />
                  {errors.cardExpiry && (
                    <AppText style={styles.errorText}>{errors.cardExpiry}</AppText>
                  )}
                </View>

                <View style={styles.halfField}>
                  <AppText style={styles.fieldLabel}>CVV</AppText>
                  <View style={[styles.inputWithIcon, errors.cardCvv && styles.inputError]}>
                    <TextInput
                      style={styles.innerInput}
                      placeholder="123"
                      placeholderTextColor="#94A3B8"
                      keyboardType="numeric"
                      secureTextEntry
                      maxLength={4}
                      value={formState.cardCvv}
                      onChangeText={(text) => onChange({ cardCvv: text.replace(/\D/g, '') })}
                    />
                    <HelpCircle size={16} color="#94A3B8" />
                  </View>
                  {errors.cardCvv && (
                    <AppText style={styles.errorText}>{errors.cardCvv}</AppText>
                  )}
                </View>
              </View>
            </View>
          )}

          {/* Form Fields: UPI */}
          {formState.paymentMethod === 'upi' && (
            <View style={styles.fieldsContainer}>
              <View style={styles.fieldItem}>
                <AppText style={styles.fieldLabel}>UPI ID / VPA</AppText>
                <TextInput
                  style={[styles.input, errors.upiId && styles.inputError]}
                  placeholder="e.g. mobile@upi or username@bank"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  value={formState.upiId}
                  onChangeText={(text) => onChange({ upiId: text })}
                />
                {errors.upiId && (
                  <AppText style={styles.errorText}>{errors.upiId}</AppText>
                )}
              </View>
            </View>
          )}

          {/* Security Banner */}
          <View style={styles.securityBox}>
            <ShieldCheck size={16} color="#15803D" style={{ marginTop: 1 }} />
            <AppText style={styles.securityText}>
              Your payment information is secure and encrypted.
            </AppText>
          </View>

          {/* Terms & Cancellation Checkbox */}
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => onChange({ agreeRulesAndCancellation: !formState.agreeRulesAndCancellation })}
            activeOpacity={0.8}
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
      )}

      {/* ─── Submit Error Display ─── */}
      {submitError && (
        <View style={styles.submitErrorCard}>
          <AlertCircle size={16} color="#DC2626" style={{ marginTop: 1 }} />
          <AppText style={styles.submitErrorText}>{submitError}</AppText>
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
          accessibilityLabel="Submit payment and registration"
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <AppText style={styles.submitBtnText}>
              {isFree
                ? 'Submit registration →'
                : `Pay $${feeAmount}.00 & submit registration →`}
            </AppText>
          )}
        </TouchableOpacity>

        {/* Lock Subtext */}
        <View style={styles.lockRow}>
          <Lock size={12} color="#64748B" />
          <AppText style={styles.lockText}>
            Registration is confirmed after successful payment.
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
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
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
  totalValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F2E28',
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
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
  fieldsContainer: {
    gap: 10,
    marginBottom: 12,
  },
  fieldItem: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13.5,
    color: '#0F2E28',
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  innerInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F2E28',
    padding: 0,
  },
  rowFields: {
    flexDirection: 'row',
    gap: 10,
  },
  halfField: {
    flex: 1,
    gap: 4,
  },
  inputError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  errorText: {
    fontSize: 11,
    color: '#DC2626',
    marginTop: 2,
  },
  securityBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  securityText: {
    flex: 1,
    fontSize: 11.5,
    color: '#15803D',
    fontWeight: '500',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 4,
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
  submitErrorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  submitErrorText: {
    flex: 1,
    fontSize: 12,
    color: '#DC2626',
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
    color: '#64748B',
  },
});
