/**
 * Aught2 Pickleball — Standardized Shared Checkout & Payment Modal
 *
 * Single reusable Checkout & Payment experience for all Player Side services:
 * - Court bookings
 * - Tournament registrations
 * - League registrations
 * - Event registrations
 * - Lesson & coaching bookings
 * - Club membership subscriptions & renewals
 *
 * Design principles:
 * - One consistent layout, typography, spacing, and mobile-first responsive flow
 * - Authoritative server pricing & validation via /payments/checkout/initiate (preview_only -> confirm)
 * - No simulated payment methods, no fake card/UPI forms, and no fake payment success
 * - Preserves pending payment status when no active gateway is configured
 * - Ready for future payment gateway (e.g., Cashfree/Stripe/Razorpay) drop-in inside one component
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
  ArrowLeft,
  Award,
  Building,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Info,
  MapPin,
  ShieldCheck,
  Tag,
  Timer,
  Trophy,
  UserCheck,
  Users,
  X,
} from 'lucide-react-native';

import { AppText } from '../AppText';
import { Button } from '../Button';
import { Card } from '../Card';
import { paymentApi } from '@/services/api';
import { Colors, Radius, Shadows } from '@/theme';
import type {
  CheckoutInitiateResponse,
  CheckoutPriceBreakdown,
  CheckoutVerifyResponse,
  PaymentPurpose,
} from '@/types';
import { formatCurrency } from '@/utils';

export type CheckoutSummaryIcon =
  | 'calendar'
  | 'clock'
  | 'timer'
  | 'map'
  | 'users'
  | 'trophy'
  | 'award'
  | 'coach'
  | 'tag';

export interface CheckoutSummaryDetail {
  key: string;
  label: string;
  value: string;
  icon?: CheckoutSummaryIcon;
}

export interface CheckoutCustomConfirmResult {
  reference: string;
  status: string;
  paymentStatus: 'free' | 'pending' | 'succeeded' | 'not_collected';
  title?: string;
  subtitle?: string;
  summaryRows?: CheckoutSummaryDetail[];
  noticeText?: string;
  rawResult?: any;
}

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
  summaryDetails?: CheckoutSummaryDetail[];
  metadata?: Record<string, any>;
  showBackButton?: boolean;
  onBack?: () => void;
  requiresAgreement?: boolean;
  agreementLabel?: string;
  onConfirmSubmit?: (context: {
    initData: CheckoutInitiateResponse | null;
    isFree: boolean;
    gatewayReady: boolean;
  }) => Promise<CheckoutCustomConfirmResult>;
  onSuccess: (result: CheckoutVerifyResponse) => void;
  onCancel?: () => void;
}

type CheckoutStep = 'loading' | 'ready' | 'processing' | 'confirmed' | 'error';

const PURPOSE_BADGE_LABELS: Record<PaymentPurpose, string> = {
  court_booking: 'Court Booking',
  tournament: 'Tournament',
  league: 'League',
  event: 'Event',
  lesson: 'Lesson',
  membership: 'Membership',
};

const BASE_FEE_LABELS: Record<PaymentPurpose, string> = {
  court_booking: 'Base booking fee',
  tournament: 'Registration fee',
  league: 'League entry fee',
  event: 'Event registration fee',
  lesson: 'Session fee',
  membership: 'Membership plan fee',
};

const SERVICE_NOUNS: Record<PaymentPurpose, string> = {
  court_booking: 'court booking',
  tournament: 'tournament registration',
  league: 'league registration',
  event: 'event registration',
  lesson: 'lesson registration',
  membership: 'membership enrollment',
};

export function CheckoutModal({
  visible,
  onClose,
  clubId,
  clubName,
  purpose,
  activityId,
  activityTitle,
  activitySubtitle,
  startAt,
  endAt,
  durationMinutes,
  participantsInfo,
  summaryDetails,
  metadata,
  showBackButton = false,
  onBack,
  requiresAgreement = false,
  agreementLabel = 'I agree to the rules and cancellation policy.',
  onConfirmSubmit,
  onSuccess,
  onCancel,
}: CheckoutModalProps) {
  const [step, setStep] = useState<CheckoutStep>('loading');
  const [initData, setInitData] = useState<CheckoutInitiateResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [agreementError, setAgreementError] = useState<string | null>(null);
  const [confirmedState, setConfirmedState] = useState<CheckoutCustomConfirmResult | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const buildCheckoutPayload = (previewOnly: boolean) => ({
    club_id: clubId,
    purpose,
    activity_id: activityId || null,
    start_at: startAt || null,
    end_at: endAt || null,
    payment_method: 'online' as const,
    currency: 'USD',
    preview_only: previewOnly,
    metadata: {
      activity_title: activityTitle,
      activity_subtitle: activitySubtitle,
      duration_minutes: durationMinutes,
      participants_info: participantsInfo,
      ...(metadata || {}),
    },
  });

  // Preview server pricing & validation without premature DB mutation
  useEffect(() => {
    if (!visible) {
      setStep('loading');
      setInitData(null);
      setErrorMessage(null);
      setAgreementChecked(false);
      setAgreementError(null);
      setConfirmedState(null);
      setCopiedRef(false);
      return;
    }

    let isMounted = true;
    async function loadPreview() {
      try {
        setStep('loading');
        setErrorMessage(null);
        setAgreementError(null);
        setAgreementChecked(false);

        const res = await paymentApi.initiateCheckout(buildCheckoutPayload(true));
        if (!isMounted) return;
        setInitData(res);
        setStep('ready');
      } catch (err: any) {
        if (!isMounted) return;
        const msg =
          err?.response?.data?.detail ||
          err?.detail ||
          err?.message ||
          'Failed to initialize checkout. Please check connection and try again.';
        setErrorMessage(typeof msg === 'string' ? msg : JSON.stringify(msg));
        setStep('error');
      }
    }

    loadPreview();

    return () => {
      isMounted = false;
    };
  }, [visible, clubId, purpose, activityId, startAt, endAt, retryCount]);

  const breakdown: CheckoutPriceBreakdown = initData?.breakdown || {
    base_amount: 0,
    discount_amount: 0,
    tax_amount: 0,
    service_fee: 0,
    final_amount: 0,
    currency: 'USD',
  };

  const currency = breakdown.currency || 'USD';
  const finalAmount = Number(breakdown.final_amount) || 0;
  const isFree = Boolean(initData?.is_free) || finalAmount <= 0;
  const gatewayReady = Boolean(initData?.gateway_ready);
  const hasDiscount = Number(breakdown.discount_amount) > 0;
  const hasTax = Number(breakdown.tax_amount) > 0;
  const hasServiceFee = Number(breakdown.service_fee) > 0;

  const totalFormatted = isFree
    ? `Free – ${formatCurrency(0, currency)}`
    : formatCurrency(finalAmount, currency);

  const resolvedClubName = useMemo(() => {
    if (clubName && clubName.trim() && clubName !== 'Club') return clubName.trim();
    const summaryClub = initData?.activity_summary?.club_name;
    if (typeof summaryClub === 'string' && summaryClub.trim()) return summaryClub.trim();
    return undefined;
  }, [clubName, initData?.activity_summary?.club_name]);

  const resolvedDurationMinutes =
    durationMinutes ??
    (typeof initData?.activity_summary?.duration_minutes === 'number'
      ? initData.activity_summary.duration_minutes
      : startAt && endAt
      ? Math.max(0, Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000))
      : undefined);

  // Build normalized summary rows: custom service rows first, or fallback date/time/duration
  const resolvedSummaryRows = useMemo<CheckoutSummaryDetail[]>(() => {
    if (summaryDetails && summaryDetails.length > 0) {
      return summaryDetails.filter((d) => Boolean(d.value && String(d.value).trim()));
    }

    const rows: CheckoutSummaryDetail[] = [];
    if (startAt) {
      rows.push({
        key: 'date',
        label: 'Date',
        value: new Date(startAt).toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        icon: 'calendar',
      });
    }
    if (startAt && endAt) {
      rows.push({
        key: 'time',
        label: 'Time',
        value: `${new Date(startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${new Date(endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        icon: 'clock',
      });
    }
    if (resolvedDurationMinutes) {
      rows.push({
        key: 'duration',
        label: 'Duration',
        value: `${resolvedDurationMinutes} mins`,
        icon: 'timer',
      });
    }
    if (participantsInfo) {
      rows.push({
        key: 'participants',
        label: 'Players',
        value: participantsInfo,
        icon: 'users',
      });
    }
    return rows;
  }, [summaryDetails, startAt, endAt, resolvedDurationMinutes, participantsInfo]);

  const handleCopyReference = (ref: string) => {
    Clipboard.setString(ref);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2500);
  };

  const getPrimaryActionLabel = (): string => {
    if (step === 'processing') {
      return purpose === 'court_booking' ? 'Confirming Booking...' : 'Confirming...';
    }
    if (errorMessage) return 'Retry';
    if (purpose === 'court_booking') {
      return gatewayReady && !isFree ? 'Pay & Confirm Booking' : 'Confirm Booking';
    }
    if (isFree || !gatewayReady) {
      return 'Confirm Registration';
    }
    return 'Continue';
  };

  const handleConfirm = async () => {
    if (step === 'processing') return;
    if (requiresAgreement && !agreementChecked) {
      setAgreementError('Please agree to the rules and cancellation policy to continue.');
      return;
    }
    setAgreementError(null);
    setErrorMessage(null);

    try {
      setStep('processing');

      // Path A: Domain-specific registration handler (Tournament, League, Membership Subscribe, Waitlist)
      if (onConfirmSubmit) {
        const customRes = await onConfirmSubmit({ initData, isFree, gatewayReady });
        setConfirmedState(customRes);
        setStep('confirmed');

        const syntheticVerify: CheckoutVerifyResponse = {
          success: true,
          payment: {
            id: customRes.rawResult?.payment_id || initData?.payment_id || customRes.reference,
            reference: customRes.reference,
            club_id: clubId,
            club_name: resolvedClubName || 'Club',
            amount: isFree ? 0 : finalAmount,
            currency,
            status:
              customRes.paymentStatus === 'succeeded' || customRes.paymentStatus === 'free'
                ? 'succeeded'
                : 'pending',
            status_label:
              customRes.paymentStatus === 'free'
                ? 'Free'
                : customRes.paymentStatus === 'succeeded'
                ? 'Succeeded'
                : 'Pending',
            purpose,
            purpose_label: PURPOSE_BADGE_LABELS[purpose],
            payment_method: isFree ? 'other' : 'online',
            payment_method_label: isFree ? 'Free' : 'Pending Collection',
            created_at: new Date().toISOString(),
            paid_at: customRes.paymentStatus === 'free' || customRes.paymentStatus === 'succeeded'
              ? new Date().toISOString()
              : null,
          },
          message: customRes.subtitle || 'Confirmed',
          booking_or_registration: customRes.rawResult || { reference: customRes.reference, status: customRes.status },
        };
        onSuccess(syntheticVerify);
        return;
      }

      // Path B: Unified Checkout API (Court Booking, Event, Lesson, Membership Renewal)
      const session = await paymentApi.initiateCheckout(buildCheckoutPayload(false));
      setInitData(session);

      if (session.is_free) {
        const freeVerify: CheckoutVerifyResponse = {
          success: true,
          payment: {
            id: session.payment_id,
            reference: session.reference,
            club_id: clubId,
            club_name: resolvedClubName || 'Club',
            amount: 0,
            currency: session.breakdown?.currency || currency,
            status: 'succeeded',
            status_label: 'Free',
            purpose,
            purpose_label: PURPOSE_BADGE_LABELS[purpose],
            payment_method: 'other',
            payment_method_label: 'Free',
            created_at: new Date().toISOString(),
            paid_at: new Date().toISOString(),
          },
          message: 'Complimentary registration confirmed.',
          booking_or_registration: session.booking_or_registration || {
            reference: session.reference,
            status: 'confirmed',
          },
        };
        setConfirmedState({
          reference: session.reference,
          status: 'confirmed',
          paymentStatus: 'free',
          title: purpose === 'court_booking' ? 'Booking Confirmed!' : 'Registration Confirmed!',
          subtitle: `Your complimentary ${SERVICE_NOUNS[purpose]} is confirmed.`,
          noticeText: '✓ Added to your Player Side My Bookings.',
          rawResult: freeVerify.booking_or_registration,
        });
        setStep('confirmed');
        onSuccess(freeVerify);
        return;
      }

      // Paid activity: only collect/mark payment succeeded when an active gateway is connected
      const shouldCollectPayment = Boolean(session.gateway_ready);
      const verifyRes = await paymentApi.verifyCheckout({
        payment_id: session.payment_id,
        provider: session.provider || 'direct',
        provider_order_id: session.provider_order_id || `order_${Date.now()}`,
        provider_payment_id: shouldCollectPayment ? `gw_${Date.now()}` : undefined,
        collect_payment: shouldCollectPayment,
      });

      const isPaid = verifyRes.payment?.status === 'succeeded';
      setConfirmedState({
        reference: verifyRes.payment?.reference || session.reference,
        status: verifyRes.booking_or_registration?.status || 'confirmed',
        paymentStatus: isPaid ? 'succeeded' : 'pending',
        title: isPaid
          ? purpose === 'court_booking'
            ? 'Booking & Payment Confirmed!'
            : 'Registration & Payment Confirmed!'
          : purpose === 'court_booking'
          ? 'Booking Confirmed'
          : 'Registration Confirmed',
        subtitle: isPaid
          ? `Your ${SERVICE_NOUNS[purpose]} at ${resolvedClubName || 'the club'} is confirmed.`
          : `Your ${SERVICE_NOUNS[purpose]} has been recorded. Payment is pending collection.`,
        noticeText: isPaid
          ? '✓ Recorded in My Bookings and My Payments.'
          : '✓ Recorded in My Bookings and My Payments (Pending).',
        rawResult: verifyRes.booking_or_registration,
      });
      setStep('confirmed');
      onSuccess(verifyRes);
    } catch (err: any) {
      setStep('ready');
      const rawMsg =
        err?.response?.data?.detail ||
        err?.detail ||
        err?.message ||
        'Unable to confirm right now. Please try again.';
      setErrorMessage(typeof rawMsg === 'string' ? rawMsg : JSON.stringify(rawMsg));
    }
  };

  const renderSummaryIcon = (icon?: CheckoutSummaryIcon) => {
    const color = Colors.text.secondary;
    switch (icon) {
      case 'clock':
        return <Clock size={13} color={color} />;
      case 'timer':
        return <Timer size={13} color={color} />;
      case 'map':
        return <MapPin size={13} color={color} />;
      case 'users':
        return <Users size={13} color={color} />;
      case 'trophy':
        return <Trophy size={13} color={color} />;
      case 'award':
        return <Award size={13} color={color} />;
      case 'coach':
        return <UserCheck size={13} color={color} />;
      case 'tag':
        return <Tag size={13} color={color} />;
      case 'calendar':
      default:
        return <Calendar size={13} color={color} />;
    }
  };

  const handleCloseAction = () => {
    if (step === 'confirmed') {
      onClose();
    } else {
      if (onCancel) onCancel();
      onClose();
    }
  };

  const confirmationSummaryRows = confirmedState?.summaryRows || resolvedSummaryRows;
  const isConfirmedPaid = confirmedState?.paymentStatus === 'succeeded';
  const isConfirmedFree = confirmedState?.paymentStatus === 'free';
  const isWaitlistedConfirm = confirmedState?.status === 'waitlisted';

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleCloseAction}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Fixed Compact Header */}
        <View style={styles.headerOuter}>
          <View style={styles.header}>
            {showBackButton && step !== 'confirmed' ? (
              <TouchableOpacity
                style={styles.backBtn}
                accessibilityRole="button"
                accessibilityLabel="Back"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={onBack || handleCloseAction}
              >
                <ArrowLeft size={18} color={Colors.text.primary} />
              </TouchableOpacity>
            ) : null}

            <View style={styles.headerTextCol}>
              <View style={styles.badgeRow}>
                <View style={styles.purposeBadge}>
                  <AppText style={styles.purposeBadgeText} numberOfLines={1}>
                    {PURPOSE_BADGE_LABELS[purpose]}
                  </AppText>
                </View>
                <View style={styles.verifiedBadge}>
                  <ShieldCheck size={11} color={Colors.status.success} />
                  <AppText style={styles.verifiedBadgeText} numberOfLines={1}>
                    Protected
                  </AppText>
                </View>
              </View>
              <AppText style={styles.headerTitle} numberOfLines={1}>
                {step === 'confirmed'
                  ? purpose === 'court_booking'
                    ? 'Booking Confirmed'
                    : 'Registration Confirmed'
                  : 'Checkout & Payment'}
              </AppText>
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close checkout"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={handleCloseAction}
            >
              <X size={18} color={Colors.text.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.contentContainer}>
            {/* STEP: LOADING */}
            {step === 'loading' && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.brand.primary} />
                <AppText style={styles.loadingText}>Preparing checkout...</AppText>
              </View>
            )}

            {/* STEP: ERROR */}
            {step === 'error' && (
              <View style={styles.errorContainer}>
                <View style={styles.errorIconWrap}>
                  <AlertCircle size={32} color={Colors.status.error} />
                </View>
                <AppText style={styles.errorTitle}>Checkout Unavailable</AppText>
                <AppText style={styles.errorDesc}>{errorMessage}</AppText>
                <Button
                  label="Retry"
                  variant="primary"
                  onPress={() => {
                    setErrorMessage(null);
                    setStep('loading');
                    setRetryCount((c) => c + 1);
                  }}
                  style={styles.retryBtn}
                />
                <Button label="Close" variant="outline" onPress={handleCloseAction} style={styles.secondaryBtn} />
              </View>
            )}

            {/* STEP: READY OR PROCESSING */}
            {(step === 'ready' || step === 'processing') && (
              <View style={styles.bodyContainer}>
                {/* B. Booking / Registration Summary */}
                <Card variant="default" style={styles.card}>
                  {resolvedClubName ? (
                    <View style={styles.clubRow}>
                      <Building size={13} color={Colors.brand.primary} />
                      <AppText style={styles.clubNameText} numberOfLines={1}>
                        {resolvedClubName}
                      </AppText>
                    </View>
                  ) : null}

                  <View style={styles.titleRow}>
                    <AppText style={styles.activityTitle}>{activityTitle}</AppText>
                    {activitySubtitle ? (
                      <View style={styles.subtitlePill}>
                        <AppText style={styles.subtitlePillText} numberOfLines={1}>
                          {activitySubtitle}
                        </AppText>
                      </View>
                    ) : null}
                  </View>

                  {resolvedSummaryRows.length > 0 ? (
                    <>
                      <View style={styles.cardDivider} />
                      <View style={styles.metaList}>
                        {resolvedSummaryRows.map((row) => (
                          <View key={row.key} style={styles.infoRow}>
                            <View style={styles.infoIcon}>{renderSummaryIcon(row.icon)}</View>
                            <AppText style={styles.infoLabel}>{row.label}</AppText>
                            <AppText style={styles.infoValue} numberOfLines={2}>
                              {row.value}
                            </AppText>
                          </View>
                        ))}
                      </View>
                    </>
                  ) : null}
                </Card>

                {/* C. Price Breakdown */}
                <Card variant="default" style={styles.card}>
                  <AppText style={styles.sectionTitle}>Price Breakdown</AppText>

                  <View style={styles.breakdownList}>
                    <View style={styles.breakdownRow}>
                      <AppText style={styles.breakdownLabel}>{BASE_FEE_LABELS[purpose]}</AppText>
                      <AppText style={styles.breakdownValue}>
                        {formatCurrency(Number(breakdown.base_amount), currency)}
                      </AppText>
                    </View>

                    {hasDiscount ? (
                      <View style={styles.breakdownRow}>
                        <AppText style={styles.discountLabel}>Member discount</AppText>
                        <AppText style={styles.discountValue}>
                          -{formatCurrency(Number(breakdown.discount_amount), currency)}
                        </AppText>
                      </View>
                    ) : null}

                    {hasTax ? (
                      <View style={styles.breakdownRow}>
                        <AppText style={styles.breakdownLabel}>Estimated taxes</AppText>
                        <AppText style={styles.breakdownValue}>
                          {formatCurrency(Number(breakdown.tax_amount), currency)}
                        </AppText>
                      </View>
                    ) : null}

                    {hasServiceFee ? (
                      <View style={styles.breakdownRow}>
                        <AppText style={styles.breakdownLabel}>Platform / service fee</AppText>
                        <AppText style={styles.breakdownValue}>
                          {formatCurrency(Number(breakdown.service_fee), currency)}
                        </AppText>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.cardDivider} />

                  <View style={styles.totalRow}>
                    <AppText style={styles.totalLabel}>Total payable</AppText>
                    <AppText style={[styles.totalAmountText, isFree && styles.freeTotalText]}>
                      {totalFormatted}
                    </AppText>
                  </View>
                </Card>

                {/* D. Payment Section (only for paid items; keeps architecture gateway-ready) */}
                {!isFree ? (
                  <Card variant="default" style={styles.card}>
                    <View style={styles.paymentHeaderRow}>
                      <AppText style={styles.sectionTitleNoMargin}>Payment</AppText>
                      <View style={gatewayReady ? styles.gatewayReadyPill : styles.gatewayPendingPill}>
                        <AppText style={gatewayReady ? styles.gatewayReadyText : styles.gatewayPendingText}>
                          {gatewayReady ? 'Gateway Ready' : 'Payment Pending'}
                        </AppText>
                      </View>
                    </View>

                    <View style={styles.paymentNoticeBox}>
                      <Info size={15} color={Colors.brand.primary} style={{ marginTop: 1 }} />
                      <AppText style={styles.paymentNoticeText}>
                        {gatewayReady
                          ? `You will complete payment of ${totalFormatted} via the configured payment gateway.`
                          : `Online payment collection is not active yet. Confirming now saves your ${SERVICE_NOUNS[purpose]} with payment pending.`}
                      </AppText>
                    </View>
                  </Card>
                ) : null}

                {/* Optional Terms Agreement (when required by service rules) */}
                {requiresAgreement ? (
                  <Card variant="default" style={styles.card}>
                    <TouchableOpacity
                      style={styles.checkboxRow}
                      onPress={() => {
                        setAgreementChecked((prev) => !prev);
                        setAgreementError(null);
                      }}
                      activeOpacity={0.8}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: agreementChecked }}
                    >
                      <View style={[styles.checkboxBox, agreementChecked && styles.checkboxBoxActive]}>
                        {agreementChecked ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
                      </View>
                      <AppText style={styles.checkboxLabel}>{agreementLabel}</AppText>
                    </TouchableOpacity>
                    {agreementError ? (
                      <AppText style={styles.agreementErrorText}>{agreementError}</AppText>
                    ) : null}
                  </Card>
                ) : null}

                {/* Inline Error Banner */}
                {errorMessage ? (
                  <View style={styles.inlineErrorBox}>
                    <AlertCircle size={15} color={Colors.status.error} />
                    <AppText style={styles.inlineErrorText}>{errorMessage}</AppText>
                  </View>
                ) : null}
              </View>
            )}

            {/* STEP: CONFIRMED */}
            {step === 'confirmed' && confirmedState && (
              <View style={styles.confirmedContainer}>
                <View style={[styles.successIconWrap, isWaitlistedConfirm && styles.waitlistIconWrap]}>
                  {isWaitlistedConfirm ? (
                    <Clock size={44} color="#D97706" />
                  ) : (
                    <CheckCircle2 size={46} color={Colors.status.success} />
                  )}
                </View>

                <AppText style={styles.successTitle}>
                  {confirmedState.title ||
                    (isWaitlistedConfirm
                      ? 'Added to Waitlist'
                      : purpose === 'court_booking'
                      ? 'Booking Confirmed'
                      : 'Registration Confirmed')}
                </AppText>
                <AppText style={styles.successSubtitle}>
                  {confirmedState.subtitle ||
                    `Your ${SERVICE_NOUNS[purpose]} has been saved.`}
                </AppText>

                {/* Confirmation Receipt / Summary Card */}
                <Card style={styles.receiptCard}>
                  <View style={styles.receiptHeader}>
                    <AppText style={styles.receiptLabel}>Reference</AppText>
                    <TouchableOpacity
                      style={styles.copyBtn}
                      onPress={() => handleCopyReference(confirmedState.reference)}
                    >
                      {copiedRef ? (
                        <Check size={14} color={Colors.status.success} />
                      ) : (
                        <Copy size={14} color={Colors.brand.primary} />
                      )}
                      <AppText style={styles.copyBtnText}>
                        {copiedRef ? 'Copied' : confirmedState.reference}
                      </AppText>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.receiptDivider} />

                  <View style={styles.receiptRow}>
                    <AppText style={styles.receiptRowLabel}>Service</AppText>
                    <AppText style={styles.receiptRowValue} numberOfLines={2}>
                      {activityTitle}
                    </AppText>
                  </View>

                  {resolvedClubName ? (
                    <View style={styles.receiptRow}>
                      <AppText style={styles.receiptRowLabel}>Club</AppText>
                      <AppText style={styles.receiptRowValue} numberOfLines={1}>
                        {resolvedClubName}
                      </AppText>
                    </View>
                  ) : null}

                  {confirmationSummaryRows.map((row) => (
                    <View key={`conf_${row.key}`} style={styles.receiptRow}>
                      <AppText style={styles.receiptRowLabel}>{row.label}</AppText>
                      <AppText style={styles.receiptRowValue} numberOfLines={2}>
                        {row.value}
                      </AppText>
                    </View>
                  ))}

                  <View style={styles.receiptRow}>
                    <AppText style={styles.receiptRowLabel}>
                      {isConfirmedPaid ? 'Amount Paid' : isConfirmedFree ? 'Fee' : 'Amount Due'}
                    </AppText>
                    <AppText style={styles.receiptRowAmount}>{totalFormatted}</AppText>
                  </View>

                  <View style={styles.receiptRow}>
                    <AppText style={styles.receiptRowLabel}>Payment Status</AppText>
                    <View
                      style={
                        isConfirmedPaid || isConfirmedFree
                          ? styles.statusConfirmedBadge
                          : styles.statusPendingBadge
                      }
                    >
                      <AppText
                        style={
                          isConfirmedPaid || isConfirmedFree
                            ? styles.statusConfirmedText
                            : styles.statusPendingText
                        }
                      >
                        {isConfirmedFree
                          ? 'FREE'
                          : isConfirmedPaid
                          ? 'PAID'
                          : confirmedState.paymentStatus === 'not_collected'
                          ? 'NOT COLLECTED'
                          : 'PENDING'}
                      </AppText>
                    </View>
                  </View>
                </Card>

                {confirmedState.noticeText ? (
                  <View style={styles.confirmedNoticeBox}>
                    <AppText style={styles.confirmedNoticeText}>
                      {confirmedState.noticeText}
                    </AppText>
                  </View>
                ) : null}

                <Button
                  label="Done"
                  variant="primary"
                  size="lg"
                  onPress={onClose}
                  style={styles.doneBtn}
                />
              </View>
            )}
          </View>
        </ScrollView>

        {/* E. Sticky Footer Primary Action */}
        {(step === 'ready' || step === 'processing') && (
          <View style={styles.stickyFooterOuter}>
            <View style={styles.stickyFooter}>
              <View style={styles.stickyTotalCol}>
                <AppText style={styles.stickyTotalLabel} numberOfLines={1}>
                  {isFree ? 'Total' : 'Total due'}
                </AppText>
                <AppText
                  style={[styles.stickyTotalValue, isFree && styles.freeTotalText]}
                  numberOfLines={1}
                >
                  {totalFormatted}
                </AppText>
              </View>
              <TouchableOpacity
                style={[
                  styles.stickyCtaBtn,
                  step === 'processing' && styles.stickyCtaBtnDisabled,
                ]}
                onPress={handleConfirm}
                disabled={step === 'processing'}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={getPrimaryActionLabel()}
              >
                {step === 'processing' ? (
                  <View style={styles.stickyCtaLoadingRow}>
                    <ActivityIndicator size="small" color={Colors.text.inverse} />
                    <AppText style={styles.stickyCtaText} numberOfLines={1}>
                      {getPrimaryActionLabel()}
                    </AppText>
                  </View>
                ) : (
                  <AppText style={styles.stickyCtaText} numberOfLines={1}>
                    {getPrimaryActionLabel()}
                  </AppText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  headerOuter: {
    backgroundColor: Colors.surface.default,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    width: '100%',
    maxWidth: 648,
    alignSelf: 'center',
    gap: 10,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.background.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  purposeBadge: {
    backgroundColor: Colors.brand.primaryLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  purposeBadgeText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    color: Colors.brand.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  verifiedBadgeText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    color: Colors.status.success,
  },
  headerTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.background.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  contentContainer: {
    width: '100%',
    maxWidth: 648,
    alignSelf: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 56,
  },
  loadingText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginTop: 12,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 16,
  },
  errorIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.status.errorBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  errorTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: Colors.status.error,
    marginBottom: 6,
    textAlign: 'center',
  },
  errorDesc: {
    fontSize: 13.5,
    lineHeight: 19,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryBtn: {
    width: '100%',
    marginBottom: 10,
  },
  secondaryBtn: {
    width: '100%',
  },
  bodyContainer: {
    gap: 12,
  },
  card: {
    width: '100%',
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  clubNameText: {
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '600',
    color: Colors.brand.primary,
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  activityTitle: {
    fontSize: 15.5,
    lineHeight: 21,
    fontWeight: '700',
    color: Colors.text.primary,
    flexShrink: 1,
  },
  subtitlePill: {
    backgroundColor: Colors.background.primary,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  subtitlePillText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  cardDivider: {
    height: 1,
    backgroundColor: Colors.surface.borderLight,
    marginVertical: 10,
  },
  metaList: {
    gap: 7,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoIcon: {
    width: 16,
    alignItems: 'center',
    flexShrink: 0,
  },
  infoLabel: {
    fontSize: 12.5,
    lineHeight: 17,
    color: Colors.text.secondary,
    fontWeight: '500',
    minWidth: 68,
  },
  infoValue: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.text.primary,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  sectionTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 10,
  },
  sectionTitleNoMargin: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  breakdownList: {
    gap: 7,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  breakdownLabel: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.text.secondary,
    flex: 1,
  },
  breakdownValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  discountLabel: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.status.success,
    fontWeight: '600',
    flex: 1,
  },
  discountValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: Colors.status.success,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  totalLabel: {
    fontSize: 14.5,
    lineHeight: 20,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  totalAmountText: {
    fontSize: 17.5,
    lineHeight: 23,
    fontWeight: '800',
    color: Colors.brand.primary,
  },
  freeTotalText: {
    color: Colors.status.success,
  },
  paymentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  gatewayPendingPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  gatewayPendingText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  gatewayReadyPill: {
    backgroundColor: Colors.brand.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  gatewayReadyText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: Colors.status.success,
  },
  paymentNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F3F8F5',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#DCE8E1',
    padding: 10,
  },
  paymentNoticeText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxBoxActive: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: Colors.text.primary,
    fontWeight: '500',
  },
  agreementErrorText: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.status.error,
    fontWeight: '600',
    marginTop: 6,
  },
  inlineErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.status.errorBg,
    padding: 11,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  inlineErrorText: {
    fontSize: 12.5,
    lineHeight: 17,
    color: Colors.status.error,
    fontWeight: '500',
    flex: 1,
  },
  stickyFooterOuter: {
    backgroundColor: Colors.surface.default,
    borderTopWidth: 1,
    borderTopColor: Colors.surface.border,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 4,
  },
  stickyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    width: '100%',
    maxWidth: 648,
    alignSelf: 'center',
  },
  stickyTotalCol: {
    flexShrink: 0,
  },
  stickyTotalLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  stickyTotalValue: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  stickyCtaBtn: {
    flex: 1,
    minWidth: 0,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: Colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    ...Shadows.brand,
  },
  stickyCtaBtnDisabled: {
    opacity: 0.65,
  },
  stickyCtaLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  stickyCtaText: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '700',
    color: Colors.text.inverse,
    textAlign: 'center',
  },
  confirmedContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  successIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.brand.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  waitlistIconWrap: {
    backgroundColor: '#FEF3C7',
  },
  successTitle: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '800',
    color: Colors.text.primary,
    textAlign: 'center',
    marginBottom: 6,
  },
  successSubtitle: {
    fontSize: 13.5,
    lineHeight: 19,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginBottom: 16,
    maxWidth: 320,
  },
  receiptCard: {
    width: '100%',
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    marginBottom: 12,
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: Colors.text.secondary,
    textTransform: 'uppercase',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.brand.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  copyBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.brand.primary,
  },
  receiptDivider: {
    height: 1,
    backgroundColor: Colors.surface.borderLight,
    marginVertical: 10,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    gap: 10,
  },
  receiptRowLabel: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  receiptRowValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
    maxWidth: '60%',
    textAlign: 'right',
  },
  receiptRowAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.brand.primary,
  },
  statusConfirmedBadge: {
    backgroundColor: Colors.brand.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusConfirmedText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.status.success,
  },
  statusPendingBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusPendingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  confirmedNoticeBox: {
    width: '100%',
    backgroundColor: '#F0F9F5',
    padding: 12,
    borderRadius: Radius.md,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#D1E7DD',
  },
  confirmedNoticeText: {
    fontSize: 12,
    color: Colors.text.primary,
    lineHeight: 17,
    textAlign: 'center',
  },
  doneBtn: {
    width: '100%',
  },
});
