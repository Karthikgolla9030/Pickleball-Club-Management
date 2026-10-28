/**
 * Aught2 Pickleball — Unified Real-Time Checkout Modal
 *
 * Production-quality booking and checkout flow supporting:
 * - Court bookings
 * - Tournament registrations
 * - League registrations
 * - Event registrations
 * - Lesson & coaching bookings
 * - Membership subscriptions & renewals
 *
 * Implements real-time price calculation, server verification, provider order creation
 * (Razorpay UPI & Cards / Stripe), and atomic activity fulfillment.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertCircle,
  Building,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Lock,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react-native';

import { AppText } from '../AppText';
import { Button } from '../Button';
import { Card } from '../Card';
import { paymentApi } from '@/services/api';
import { Colors, Radius, Spacing } from '@/theme';
import type {
  CheckoutInitiateResponse,
  CheckoutPriceBreakdown,
  CheckoutVerifyResponse,
  PaymentMethod,
  PaymentPurpose,
} from '@/types';
import { formatCurrency } from '@/utils';

export interface CheckoutModalProps {
  visible: boolean;
  onClose: () => void;
  clubId: string;
  clubName?: string;
  purpose: PaymentPurpose;
  activityId?: string;
  activityTitle: string;
  activitySubtitle?: string;
  startAt?: string;
  endAt?: string;
  durationMinutes?: number;
  participantsInfo?: string;
  metadata?: Record<string, any>;
  onSuccess: (result: CheckoutVerifyResponse) => void;
  onCancel?: () => void;
}

type CheckoutStep = 'loading' | 'ready' | 'processing' | 'confirmed' | 'error';
type SelectedMethodType = 'upi' | 'card' | 'netbanking' | 'cash';

export function CheckoutModal({
  visible,
  onClose,
  clubId,
  clubName = 'Pickleball Club',
  purpose,
  activityId,
  activityTitle,
  activitySubtitle,
  startAt,
  endAt,
  durationMinutes,
  participantsInfo,
  metadata,
  onSuccess,
  onCancel,
}: CheckoutModalProps) {
  const [step, setStep] = useState<CheckoutStep>('loading');
  const [initData, setInitData] = useState<CheckoutInitiateResponse | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<SelectedMethodType>('upi');
  const [upiVpa, setUpiVpa] = useState<string>('player@upi');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<CheckoutVerifyResponse | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);

  // Helper to fetch session for a given method
  const fetchCheckoutSession = async (method: SelectedMethodType) => {
    const methodMap: Record<SelectedMethodType, PaymentMethod> = {
      upi: 'online',
      card: 'online',
      netbanking: 'bank_transfer',
      cash: 'cash',
    };

    return await paymentApi.initiateCheckout({
      club_id: clubId,
      purpose,
      activity_id: activityId || null,
      start_at: startAt || null,
      end_at: endAt || null,
      payment_method: methodMap[method],
      selected_method: method,
      currency: 'INR',
      metadata: {
        activity_title: activityTitle,
        activity_subtitle: activitySubtitle,
        duration_minutes: durationMinutes,
        participants_info: participantsInfo,
        selected_method: method,
        ...(metadata || {}),
      },
    });
  };

  // Switch payment method dynamically and re-fetch session configured for that method
  const handleSelectMethod = async (newMethod: SelectedMethodType) => {
    if (newMethod === selectedMethod && initData) return;
    setSelectedMethod(newMethod);
    setErrorMessage(null);
    try {
      const res = await fetchCheckoutSession(newMethod);
      setInitData(res);
    } catch (err: any) {
      console.warn('Failed to switch payment method session:', err);
    }
  };

  // Initialize checkout upon modal presentation
  useEffect(() => {
    if (!visible) {
      setStep('loading');
      setInitData(null);
      setErrorMessage(null);
      setVerifyResult(null);
      setCopiedRef(false);
      return;
    }

    let isMounted = true;
    async function initiate() {
      try {
        setStep('loading');
        setErrorMessage(null);

        const res = await fetchCheckoutSession(selectedMethod);

        if (!isMounted) return;
        setInitData(res);

        if (res.is_free) {
          // Free activity immediately verified
          setVerifyResult({
            success: true,
            payment: {
              id: res.payment_id,
              reference: res.reference,
              club_id: clubId,
              club_name: clubName,
              amount: 0,
              currency: res.breakdown?.currency || 'INR',
              status: 'succeeded',
              status_label: 'Succeeded',
              purpose,
              purpose_label: purpose,
              payment_method: 'other',
              payment_method_label: 'Free / Complimentary',
              created_at: new Date().toISOString(),
              paid_at: new Date().toISOString(),
            },
            message: 'Complimentary booking confirmed!',
            booking_or_registration: { reference: res.reference, status: 'confirmed' },
          });
          setStep('confirmed');
        } else {
          setStep('ready');
        }
      } catch (err: any) {
        if (!isMounted) return;
        const msg =
          err?.response?.data?.detail ||
          err?.detail ||
          err?.message ||
          'Failed to initialize checkout. Please check connection and try again.';
        setErrorMessage(msg);
        setStep('error');
      }
    }

    initiate();

    return () => {
      isMounted = false;
    };
  }, [visible, clubId, purpose, activityId, startAt, endAt]);

  // Execute payment commit & verification
  const handleCommitPayment = async () => {
    if (!initData) return;

    try {
      setStep('processing');
      setErrorMessage(null);

      // Ensure the active session matches selectedMethod
      let activeSession = initData;
      if (activeSession.selected_method !== selectedMethod) {
        activeSession = await fetchCheckoutSession(selectedMethod);
        setInitData(activeSession);
      }

      const provider = activeSession.provider || 'cashfree';
      const providerOrderId = activeSession.provider_order_id || `order_${Date.now()}`;

      // Open Cashfree hosted modal checkout if on web and session id is present
      if (activeSession.payment_session_id && typeof window !== 'undefined') {
        try {
          const { load: loadCashfree } = await import('@cashfreepayments/cashfree-js');
          const cashfree = await loadCashfree({ mode: 'sandbox' });
          if (cashfree) {
            const checkoutResult: any = await cashfree.checkout({
              paymentSessionId: activeSession.payment_session_id,
              redirectTarget: '_modal',
            });
            if (checkoutResult?.error) {
              setStep('ready');
              setErrorMessage(
                checkoutResult.error.message ||
                'Checkout window closed or payment was cancelled. You can retry safely or check status.'
              );
              return;
            }
          }
        } catch (sdkErr: any) {
          console.warn('Cashfree JS checkout notice:', sdkErr);
        }
      }

      // Always verify payment status directly with backend & Cashfree API
      const verifyRes = await paymentApi.verifyCheckout({
        payment_id: activeSession.payment_id,
        provider,
        provider_order_id: providerOrderId,
        provider_payment_id: activeSession.payment_session_id ? `cf_${activeSession.payment_session_id}` : undefined,
        provider_signature: undefined,
      });

      setVerifyResult(verifyRes);
      setStep('confirmed');
      onSuccess(verifyRes);
    } catch (err: any) {
      setStep('ready');
      const msg =
        err?.response?.data?.detail ||
        err?.detail ||
        err?.message ||
        'Payment could not be confirmed. If you just completed payment, click "Check Status" or retry.';
      setErrorMessage(msg);
    }
  };

  // Safe status check without duplicate charge or order creation
  const handleCheckStatus = async () => {
    if (!initData) return;

    try {
      setStep('processing');
      setErrorMessage(null);

      const verifyRes = await paymentApi.verifyCheckout({
        payment_id: initData.payment_id,
        provider: initData.provider || 'cashfree',
        provider_order_id: initData.provider_order_id || '',
        provider_payment_id: initData.payment_session_id ? `cf_${initData.payment_session_id}` : undefined,
        provider_signature: undefined,
      });

      setVerifyResult(verifyRes);
      setStep('confirmed');
      onSuccess(verifyRes);
    } catch (err: any) {
      setStep('ready');
      const msg =
        err?.response?.data?.detail ||
        err?.detail ||
        err?.message ||
        'Payment is still pending with Cashfree. Please retry checkout or wait a moment.';
      setErrorMessage(msg);
    }
  };

  const handleCopyReference = (ref: string) => {
    Clipboard.setString(ref);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2500);
  };

  const purposeLabels: Record<PaymentPurpose, string> = {
    court_booking: 'Court Booking',
    tournament: 'Tournament Entry',
    event: 'Event Registration',
    lesson: 'Lesson Booking',
    league: 'League Registration',
    membership: 'Club Membership',
  };

  const breakdown: CheckoutPriceBreakdown = initData?.breakdown || {
    base_amount: 0,
    discount_amount: 0,
    tax_amount: 0,
    service_fee: 0,
    final_amount: 0,
    currency: 'INR',
  };

  const finalFormatted = formatCurrency(Number(breakdown.final_amount), breakdown.currency || 'INR');

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTextCol}>
            <View style={styles.badgeRow}>
              <View style={styles.purposeBadge}>
                <AppText style={styles.purposeBadgeText}>{purposeLabels[purpose]}</AppText>
              </View>
              <View style={styles.verifiedBadge}>
                <ShieldCheck size={12} color="#18794E" />
                <AppText style={styles.verifiedBadgeText}>Protected</AppText>
              </View>
            </View>
            <AppText style={styles.headerTitle} numberOfLines={1}>
              {step === 'confirmed' ? 'Booking Receipt' : 'Checkout & Payment'}
            </AppText>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => {
              if (step === 'confirmed') {
                onClose();
              } else {
                if (onCancel) onCancel();
                onClose();
              }
            }}
          >
            <X size={20} color={Colors.text.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* STEP: LOADING */}
          {step === 'loading' && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.brand.primary} />
              <AppText style={styles.loadingText}>Verifying availability & pricing...</AppText>
              <AppText style={styles.loadingSub}>
                Rechecking court slots, membership privileges, and applicable taxes.
              </AppText>
            </View>
          )}

          {/* STEP: ERROR */}
          {step === 'error' && (
            <View style={styles.errorContainer}>
              <View style={styles.errorIconWrap}>
                <AlertCircle size={40} color="#B42318" />
              </View>
              <AppText style={styles.errorTitle}>Availability or Checkout Issue</AppText>
              <AppText style={styles.errorDesc}>{errorMessage}</AppText>
              <Button
                label="Retry Checkout"
                variant="primary"
                onPress={() => {
                  setStep('loading');
                  // Re-trigger by toggling step
                }}
                style={styles.retryBtn}
              />
              <Button label="Close" variant="outline" onPress={onClose} style={styles.secondaryBtn} />
            </View>
          )}

          {/* STEP: READY OR PROCESSING */}
          {(step === 'ready' || step === 'processing') && (
            <View style={styles.bodyContainer}>
              {/* Card 1: Booking Summary */}
              <Card style={styles.summaryCard}>
                <View style={styles.cardHeaderRow}>
                  <Building size={16} color={Colors.brand.primary} />
                  <AppText style={styles.clubNameText}>{clubName}</AppText>
                </View>

                <AppText style={styles.activityTitle}>{activityTitle}</AppText>
                {activitySubtitle ? (
                  <AppText style={styles.activitySubtitle}>{activitySubtitle}</AppText>
                ) : null}

                <View style={styles.infoDivider} />

                {startAt ? (
                  <View style={styles.infoRow}>
                    <Calendar size={14} color={Colors.text.secondary} />
                    <AppText style={styles.infoText}>
                      {new Date(startAt).toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </AppText>
                  </View>
                ) : null}

                {startAt && endAt ? (
                  <View style={styles.infoRow}>
                    <Clock size={14} color={Colors.text.secondary} />
                    <AppText style={styles.infoText}>
                      {new Date(startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                      {new Date(endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {durationMinutes ? ` (${durationMinutes} mins)` : ''}
                    </AppText>
                  </View>
                ) : null}

                {participantsInfo ? (
                  <View style={styles.infoRow}>
                    <Users size={14} color={Colors.text.secondary} />
                    <AppText style={styles.infoText}>{participantsInfo}</AppText>
                  </View>
                ) : null}
              </Card>

              {/* Card 2: Price Breakdown */}
              <Card style={styles.breakdownCard}>
                <AppText style={styles.sectionTitle}>Price Breakdown</AppText>

                <View style={styles.breakdownRow}>
                  <AppText style={styles.breakdownLabel}>Base booking fee</AppText>
                  <AppText style={styles.breakdownValue}>
                    {formatCurrency(Number(breakdown.base_amount), breakdown.currency || 'INR')}
                  </AppText>
                </View>

                {Number(breakdown.discount_amount) > 0 ? (
                  <View style={styles.breakdownRow}>
                    <View style={styles.discountBadgeRow}>
                      <Sparkles size={12} color="#18794E" />
                      <AppText style={styles.discountLabel}>Member privilege discount</AppText>
                    </View>
                    <AppText style={styles.discountValue}>
                      -{formatCurrency(Number(breakdown.discount_amount), breakdown.currency || 'INR')}
                    </AppText>
                  </View>
                ) : null}

                <View style={styles.breakdownRow}>
                  <AppText style={styles.breakdownLabel}>Estimated taxes (5% GST / Tax)</AppText>
                  <AppText style={styles.breakdownValue}>
                    {formatCurrency(Number(breakdown.tax_amount), breakdown.currency || 'INR')}
                  </AppText>
                </View>

                <View style={styles.breakdownRow}>
                  <AppText style={styles.breakdownLabel}>Service / Platform fee</AppText>
                  <AppText style={styles.breakdownFree}>
                    {formatCurrency(0, breakdown.currency || 'INR')} (Transparent)
                  </AppText>
                </View>

                <View style={styles.breakdownDivider} />

                <View style={styles.totalRow}>
                  <View>
                    <AppText style={styles.totalLabel}>Total Payable</AppText>
                    <AppText style={styles.currencyNote}>Including all taxes & privileges</AppText>
                  </View>
                  <AppText style={styles.totalAmountText}>{finalFormatted}</AppText>
                </View>
              </Card>

              {/* Card 3: Payment Method Selection */}
              <Card style={styles.methodsCard}>
                <AppText style={styles.sectionTitle}>Select Payment Method</AppText>
                <AppText style={styles.methodSubtitle}>
                  Encrypted & authenticated through Cashfree payment provider
                </AppText>

                {/* Method 1: UPI */}
                <TouchableOpacity
                  style={[styles.methodOption, selectedMethod === 'upi' && styles.methodOptionActive]}
                  onPress={() => handleSelectMethod('upi')}
                >
                  <View style={styles.methodRadioCol}>
                    <View style={[styles.radioOuter, selectedMethod === 'upi' && styles.radioOuterActive]}>
                      {selectedMethod === 'upi' && <View style={styles.radioInner} />}
                    </View>
                  </View>
                  <View style={styles.methodIconWrap}>
                    <Smartphone size={20} color={selectedMethod === 'upi' ? '#176B57' : '#667776'} />
                  </View>
                  <View style={styles.methodInfoCol}>
                    <View style={styles.methodTitleRow}>
                      <AppText style={styles.methodTitle}>UPI (Instant India & QR)</AppText>
                      <View style={styles.recommendedBadge}>
                        <AppText style={styles.recommendedText}>Popular</AppText>
                      </View>
                    </View>
                    <AppText style={styles.methodDesc}>
                      Google Pay, PhonePe, Paytm, BHIM & UPI Apps
                    </AppText>
                  </View>
                </TouchableOpacity>

                {selectedMethod === 'upi' && (
                  <View style={styles.upiDetailsBox}>
                    <View style={styles.upiDetailRow}>
                      <QrCode size={16} color={Colors.brand.primary} />
                      <AppText style={styles.upiDetailText}>
                        Dynamic Cashfree UPI QR Code & Instant UPI Apps will open directly.
                      </AppText>
                    </View>
                    <View style={[styles.upiDetailRow, { marginTop: 6 }]}>
                      <Smartphone size={16} color="#18794E" />
                      <AppText style={[styles.upiDetailText, { color: '#18794E', fontWeight: '500' }]}>
                        Sandbox Test VPA: testsuccess@gocash (or scan the QR code to simulate approval)
                      </AppText>
                    </View>
                  </View>
                )}

                {/* Method 2: Cards */}
                <TouchableOpacity
                  style={[styles.methodOption, selectedMethod === 'card' && styles.methodOptionActive]}
                  onPress={() => handleSelectMethod('card')}
                >
                  <View style={styles.methodRadioCol}>
                    <View style={[styles.radioOuter, selectedMethod === 'card' && styles.radioOuterActive]}>
                      {selectedMethod === 'card' && <View style={styles.radioInner} />}
                    </View>
                  </View>
                  <View style={styles.methodIconWrap}>
                    <CreditCard size={20} color={selectedMethod === 'card' ? '#176B57' : '#667776'} />
                  </View>
                  <View style={styles.methodInfoCol}>
                    <AppText style={styles.methodTitle}>Credit / Debit Card</AppText>
                    <AppText style={styles.methodDesc}>
                      Visa, Mastercard, RuPay, Amex • 3-D Secure OTP
                    </AppText>
                  </View>
                </TouchableOpacity>

                {selectedMethod === 'card' && (
                  <View style={styles.upiDetailsBox}>
                    <View style={styles.upiDetailRow}>
                      <CreditCard size={16} color={Colors.brand.primary} />
                      <AppText style={styles.upiDetailText}>
                        Cashfree 3-D Secure Card checkout will open with card number, expiry, and CVV fields.
                      </AppText>
                    </View>
                  </View>
                )}

                {/* Method 3: NetBanking */}
                <TouchableOpacity
                  style={[styles.methodOption, selectedMethod === 'netbanking' && styles.methodOptionActive]}
                  onPress={() => handleSelectMethod('netbanking')}
                >
                  <View style={styles.methodRadioCol}>
                    <View style={[styles.radioOuter, selectedMethod === 'netbanking' && styles.radioOuterActive]}>
                      {selectedMethod === 'netbanking' && <View style={styles.radioInner} />}
                    </View>
                  </View>
                  <View style={styles.methodIconWrap}>
                    <Wallet size={20} color={selectedMethod === 'netbanking' ? '#176B57' : '#667776'} />
                  </View>
                  <View style={styles.methodInfoCol}>
                    <AppText style={styles.methodTitle}>NetBanking / Direct Transfer</AppText>
                    <AppText style={styles.methodDesc}>
                      All major banks supported via Cashfree gateway
                    </AppText>
                  </View>
                </TouchableOpacity>

                {selectedMethod === 'netbanking' && (
                  <View style={styles.upiDetailsBox}>
                    <View style={styles.upiDetailRow}>
                      <Wallet size={16} color={Colors.brand.primary} />
                      <AppText style={styles.upiDetailText}>
                        Direct bank login through Cashfree NetBanking across all major retail banks.
                      </AppText>
                    </View>
                  </View>
                )}
              </Card>

              {/* Error banner if failed during commit */}
              {errorMessage && (
                <View style={styles.errorSection}>
                  <View style={styles.inlineErrorBox}>
                    <AlertCircle size={16} color="#B42318" />
                    <AppText style={styles.inlineErrorText}>{errorMessage}</AppText>
                  </View>
                  <TouchableOpacity
                    style={styles.checkStatusBtn}
                    onPress={handleCheckStatus}
                    disabled={step === 'processing'}
                  >
                    <Clock size={14} color="#176B57" />
                    <AppText style={styles.checkStatusText}>Check Payment Status with Cashfree</AppText>
                  </TouchableOpacity>
                </View>
              )}

              {/* Security badge */}
              <View style={styles.securityRow}>
                <Lock size={12} color={Colors.text.secondary} />
                <AppText style={styles.securityText}>
                  256-bit encrypted checkout. No card numbers or UPI PINs are ever stored.
                </AppText>
              </View>

              {/* Primary Action Button */}
              <View style={styles.footerAction}>
                <Button
                  label={
                    step === 'processing'
                      ? 'Processing & Verifying Payment...'
                      : errorMessage
                      ? `Retry Payment (${finalFormatted})`
                      : `Pay ${finalFormatted} & Confirm Booking`
                  }
                  variant="primary"
                  size="lg"
                  disabled={step === 'processing'}
                  onPress={handleCommitPayment}
                  style={styles.payBtn}
                />
              </View>
            </View>
          )}

          {/* STEP: CONFIRMED */}
          {step === 'confirmed' && verifyResult && (
            <View style={styles.confirmedContainer}>
              <View style={styles.successIconWrap}>
                <CheckCircle2 size={56} color="#18794E" />
              </View>

              <AppText style={styles.successTitle}>Booking & Payment Confirmed!</AppText>
              <AppText style={styles.successSubtitle}>
                Your reservation at {clubName} is secured and synchronized.
              </AppText>

              {/* Receipt Card */}
              <Card style={styles.receiptCard}>
                <View style={styles.receiptHeader}>
                  <AppText style={styles.receiptLabel}>Transaction Reference</AppText>
                  <TouchableOpacity
                    style={styles.copyBtn}
                    onPress={() => handleCopyReference(verifyResult.payment.reference)}
                  >
                    {copiedRef ? (
                      <Check size={14} color="#18794E" />
                    ) : (
                      <Copy size={14} color={Colors.brand.primary} />
                    )}
                    <AppText style={styles.copyBtnText}>
                      {copiedRef ? 'Copied' : verifyResult.payment.reference}
                    </AppText>
                  </TouchableOpacity>
                </View>

                <View style={styles.receiptDivider} />

                <View style={styles.receiptRow}>
                  <AppText style={styles.receiptRowLabel}>Activity</AppText>
                  <AppText style={styles.receiptRowValue}>{activityTitle}</AppText>
                </View>

                <View style={styles.receiptRow}>
                  <AppText style={styles.receiptRowLabel}>Facility</AppText>
                  <AppText style={styles.receiptRowValue}>{clubName}</AppText>
                </View>

                {startAt ? (
                  <View style={styles.receiptRow}>
                    <AppText style={styles.receiptRowLabel}>Schedule</AppText>
                    <AppText style={styles.receiptRowValue}>
                      {new Date(startAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                      {endAt
                        ? ` • ${new Date(startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : ''}
                    </AppText>
                  </View>
                ) : null}

                <View style={styles.receiptRow}>
                  <AppText style={styles.receiptRowLabel}>Amount Paid</AppText>
                  <AppText style={styles.receiptRowAmount}>
                    {formatCurrency(Number(verifyResult.payment.amount), verifyResult.payment.currency || 'INR')}
                  </AppText>
                </View>

                <View style={styles.receiptRow}>
                  <AppText style={styles.receiptRowLabel}>Status</AppText>
                  <View style={styles.statusConfirmedBadge}>
                    <AppText style={styles.statusConfirmedText}>SUCCEEDED</AppText>
                  </View>
                </View>
              </Card>

              <View style={styles.confirmedNoticeBox}>
                <AppText style={styles.confirmedNoticeText}>
                  ✓ Transaction has been posted to your Player App My Payments and Club Owner ledger.
                </AppText>
              </View>

              <Button
                label="Done"
                variant="primary"
                size="lg"
                onPress={onClose}
                style={styles.doneBtn}
              />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F8F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2EAE6',
  },
  headerTextCol: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  purposeBadge: {
    backgroundColor: '#E5F6EC',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  purposeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#176B57',
    textTransform: 'uppercase',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  verifiedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#18794E',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#102B2A',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F4F8F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: Spacing[4],
    paddingBottom: Spacing[8],
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102B2A',
    marginTop: 16,
  },
  loadingSub: {
    fontSize: 13,
    color: '#667776',
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 280,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 16,
  },
  errorIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FDE8E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#B42318',
    marginBottom: 8,
  },
  errorDesc: {
    fontSize: 14,
    color: '#667776',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  retryBtn: {
    width: '100%',
    marginBottom: 12,
  },
  secondaryBtn: {
    width: '100%',
  },
  bodyContainer: {
    gap: 16,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#E2EAE6',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  clubNameText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#176B57',
  },
  activityTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#102B2A',
    marginBottom: 4,
  },
  activitySubtitle: {
    fontSize: 13,
    color: '#667776',
    marginBottom: 8,
  },
  infoDivider: {
    height: 1,
    backgroundColor: '#EDF2F7',
    marginVertical: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  infoText: {
    fontSize: 13,
    color: '#102B2A',
    fontWeight: '500',
  },
  breakdownCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#E2EAE6',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102B2A',
    marginBottom: 12,
  },
  methodSubtitle: {
    fontSize: 12,
    color: '#667776',
    marginTop: -8,
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  breakdownLabel: {
    fontSize: 13,
    color: '#667776',
  },
  breakdownValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#102B2A',
  },
  breakdownFree: {
    fontSize: 13,
    fontWeight: '600',
    color: '#18794E',
  },
  discountBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  discountLabel: {
    fontSize: 13,
    color: '#18794E',
    fontWeight: '600',
  },
  discountValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#18794E',
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: '#E2EAE6',
    marginVertical: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102B2A',
  },
  currencyNote: {
    fontSize: 11,
    color: '#667776',
    marginTop: 2,
  },
  totalAmountText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#176B57',
  },
  methodsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#E2EAE6',
    gap: 10,
  },
  methodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: '#E2EAE6',
    backgroundColor: '#FFFFFF',
  },
  methodOptionActive: {
    borderColor: '#176B57',
    backgroundColor: '#F0F9F5',
  },
  methodRadioCol: {
    marginRight: 10,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: '#176B57',
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#176B57',
  },
  methodIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F4F8F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  methodInfoCol: {
    flex: 1,
  },
  methodTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  methodTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102B2A',
  },
  recommendedBadge: {
    backgroundColor: '#E5F6EC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recommendedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#18794E',
  },
  methodDesc: {
    fontSize: 12,
    color: '#667776',
    marginTop: 2,
  },
  upiDetailsBox: {
    backgroundColor: '#F4F8F5',
    padding: 10,
    borderRadius: 8,
    marginLeft: 30,
    marginTop: -4,
    borderLeftWidth: 3,
    borderLeftColor: '#176B57',
  },
  upiDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  upiDetailText: {
    fontSize: 12,
    color: '#102B2A',
    fontWeight: '500',
    flex: 1,
  },
  inlineErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FDE8E8',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  inlineErrorText: {
    fontSize: 13,
    color: '#B42318',
    fontWeight: '500',
    flex: 1,
  },
  errorSection: {
    gap: 8,
    width: '100%',
  },
  checkStatusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#E6F4EA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CEEAD6',
  },
  checkStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#137333',
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  securityText: {
    fontSize: 11,
    color: '#667776',
    textAlign: 'center',
  },
  footerAction: {
    marginTop: 8,
  },
  payBtn: {
    width: '100%',
  },
  confirmedContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  successIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E5F6EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#102B2A',
    textAlign: 'center',
    marginBottom: 6,
  },
  successSubtitle: {
    fontSize: 14,
    color: '#667776',
    textAlign: 'center',
    marginBottom: 20,
    maxWidth: 300,
  },
  receiptCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#E2EAE6',
    marginBottom: 16,
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#667776',
    textTransform: 'uppercase',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E5F6EC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  copyBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#176B57',
  },
  receiptDivider: {
    height: 1,
    backgroundColor: '#EDF2F7',
    marginVertical: 12,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  receiptRowLabel: {
    fontSize: 13,
    color: '#667776',
  },
  receiptRowValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#102B2A',
    maxWidth: '60%',
    textAlign: 'right',
  },
  receiptRowAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#176B57',
  },
  statusConfirmedBadge: {
    backgroundColor: '#E5F6EC',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusConfirmedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#18794E',
  },
  confirmedNoticeBox: {
    width: '100%',
    backgroundColor: '#F0F9F5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#D1E7DD',
  },
  confirmedNoticeText: {
    fontSize: 12,
    color: '#102B2A',
    lineHeight: 18,
    textAlign: 'center',
  },
  doneBtn: {
    width: '100%',
  },
});
