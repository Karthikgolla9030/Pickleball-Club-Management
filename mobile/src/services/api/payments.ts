/**
 * Aught2 Pickleball — Payments API Service (Phase 13)
 *
 * Typed API client for staff and player payment operations.
 */

import { API_ENDPOINTS } from '@/constants';
import { apiClient } from './client';
import type {
  CreatePaymentPayload,
  Payment,
  PaymentFilters,
  PaymentPurpose,
  PaymentStatus,
  PaymentSummary,
  PlayerPayment,
} from '@/types';

export const paymentApi = {
  // ─── Staff Payment Endpoints ───────────────────────────────────────────────

  /**
   * List payments for a club with optional filtering.
   */
  listClubPayments(clubId: string, filters?: PaymentFilters): Promise<Payment[]> {
    const base = API_ENDPOINTS.CLUB_PAYMENTS(clubId);
    if (!filters) return apiClient.get<Payment[]>(base);

    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.purpose) params.append('purpose', filters.purpose);
    if (filters.player_id) params.append('player_id', filters.player_id);
    if (filters.subscription_id) params.append('subscription_id', filters.subscription_id);
    if (filters.payment_method) params.append('payment_method', filters.payment_method);
    if (filters.date_from) params.append('date_from', filters.date_from);
    if (filters.date_to) params.append('date_to', filters.date_to);
    if (filters.limit) params.append('limit', String(filters.limit));
    if (filters.offset) params.append('offset', String(filters.offset));

    const qs = params.toString();
    return apiClient.get<Payment[]>(qs ? `${base}?${qs}` : base);
  },

  /**
   * Get club payment summary metrics (total, succeeded, pending, failed, amount).
   */
  getPaymentSummary(clubId: string): Promise<PaymentSummary> {
    return apiClient.get<PaymentSummary>(API_ENDPOINTS.CLUB_PAYMENT_SUMMARY(clubId));
  },

  /**
   * Get single payment detail for staff.
   */
  getClubPayment(clubId: string, paymentId: string): Promise<Payment> {
    return apiClient.get<Payment>(API_ENDPOINTS.CLUB_PAYMENT(clubId, paymentId));
  },

  /**
   * Record a new membership payment in PENDING status.
   */
  createPayment(clubId: string, payload: CreatePaymentPayload): Promise<Payment> {
    return apiClient.post<Payment>(API_ENDPOINTS.CLUB_PAYMENTS(clubId), payload);
  },

  /**
   * Mark payment as processing.
   */
  processPayment(clubId: string, paymentId: string): Promise<Payment> {
    return apiClient.post<Payment>(API_ENDPOINTS.CLUB_PAYMENT_PROCESS(clubId, paymentId), {});
  },

  /**
   * Mark payment as succeeded (e.g. for cash or bank transfer).
   */
  succeedPayment(clubId: string, paymentId: string): Promise<Payment> {
    return apiClient.post<Payment>(API_ENDPOINTS.CLUB_PAYMENT_SUCCEED(clubId, paymentId), {});
  },

  /**
   * Mark payment as failed with failure reason.
   */
  failPayment(clubId: string, paymentId: string, failureReason: string): Promise<Payment> {
    return apiClient.post<Payment>(API_ENDPOINTS.CLUB_PAYMENT_FAIL(clubId, paymentId), {
      failure_reason: failureReason,
    });
  },

  /**
   * Cancel pending/processing payment with optional cancellation reason.
   */
  cancelPayment(clubId: string, paymentId: string, cancellationReason?: string | null): Promise<Payment> {
    return apiClient.post<Payment>(API_ENDPOINTS.CLUB_PAYMENT_CANCEL(clubId, paymentId), {
      cancellation_reason: cancellationReason ?? null,
    });
  },

  // ─── Player Payment Endpoints ──────────────────────────────────────────────

  /**
   * List caller's own payments across all clubs.
   */
  listPlayerPayments(filters?: {
    status?: PaymentStatus;
    purpose?: PaymentPurpose;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  }): Promise<PlayerPayment[]> {
    const base = API_ENDPOINTS.PLAYER_PAYMENTS;
    if (!filters) return apiClient.get<PlayerPayment[]>(base);

    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.purpose) params.append('purpose', filters.purpose);
    if (filters.date_from) params.append('date_from', filters.date_from);
    if (filters.date_to) params.append('date_to', filters.date_to);
    if (filters.limit) params.append('limit', String(filters.limit));
    if (filters.offset) params.append('offset', String(filters.offset));

    const qs = params.toString();
    return apiClient.get<PlayerPayment[]>(qs ? `${base}?${qs}` : base);
  },

  /**
   * Get caller's own payment detail.
   */
  getPlayerPayment(paymentId: string): Promise<PlayerPayment> {
    return apiClient.get<PlayerPayment>(API_ENDPOINTS.PLAYER_PAYMENT(paymentId));
  },
};
