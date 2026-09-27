/**
 * Aught2 Pickleball — Payment Hooks (Phase 13)
 *
 * TanStack Query hooks for:
 *   - Staff: payments list, detail, summary, creation, and status transitions
 *   - Player: payment history and detail view (read-only)
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import { paymentApi } from '@/services/api';
import type {
  CreatePaymentPayload,
  PaymentFilters,
  PaymentPurpose,
  PaymentStatus,
} from '@/types';

// ─── Staff Hooks ─────────────────────────────────────────────────────────────

/**
 * List payments for a club with optional filtering.
 */
export function useClubPayments(clubId: string, filters?: PaymentFilters) {
  const filterKey = filters ? JSON.stringify(filters) : 'all';
  return useQuery({
    queryKey: QUERY_KEYS.CLUB_PAYMENTS(clubId, filterKey),
    queryFn: () => paymentApi.listClubPayments(clubId, filters),
    enabled: !!clubId,
    staleTime: 60 * 1000, // 1 min
  });
}

/**
 * Get club payment summary metrics (totals, status counts, amount collected).
 */
export function usePaymentSummary(clubId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.CLUB_PAYMENT_SUMMARY(clubId),
    queryFn: () => paymentApi.getPaymentSummary(clubId),
    enabled: !!clubId,
    staleTime: 60 * 1000,
  });
}

/**
 * Get single payment detail for staff.
 */
export function useClubPayment(clubId: string, paymentId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.CLUB_PAYMENT_DETAIL(clubId, paymentId),
    queryFn: () => paymentApi.getClubPayment(clubId, paymentId),
    enabled: !!clubId && !!paymentId,
  });
}

/**
 * Create a new payment record in PENDING status.
 */
export function useCreatePayment(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePaymentPayload) =>
      paymentApi.createPayment(clubId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'payments'] });
    },
  });
}

/**
 * Transition payment to processing.
 */
export function useProcessPayment(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) =>
      paymentApi.processPayment(clubId, paymentId),
    onSuccess: (_, paymentId) => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'payments'] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_PAYMENT_DETAIL(clubId, paymentId),
      });
    },
  });
}

/**
 * Mark payment as succeeded (e.g. cash, bank transfer).
 */
export function useSucceedPayment(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) =>
      paymentApi.succeedPayment(clubId, paymentId),
    onSuccess: (_, paymentId) => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'payments'] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_PAYMENT_DETAIL(clubId, paymentId),
      });
    },
  });
}

/**
 * Mark payment as failed with reason.
 */
export function useFailPayment(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, failureReason }: { paymentId: string; failureReason: string }) =>
      paymentApi.failPayment(clubId, paymentId, failureReason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'payments'] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_PAYMENT_DETAIL(clubId, variables.paymentId),
      });
    },
  });
}

/**
 * Cancel payment.
 */
export function useCancelPayment(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      paymentId,
      cancellationReason,
    }: {
      paymentId: string;
      cancellationReason?: string | null;
    }) => paymentApi.cancelPayment(clubId, paymentId, cancellationReason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'payments'] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_PAYMENT_DETAIL(clubId, variables.paymentId),
      });
    },
  });
}

// ─── Player Hooks ─────────────────────────────────────────────────────────────

/**
 * List caller's own payment history across all clubs.
 */
export function usePlayerPayments(filters?: {
  status?: PaymentStatus;
  purpose?: PaymentPurpose;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}) {
  const filterKey = filters ? JSON.stringify(filters) : 'all';
  return useQuery({
    queryKey: QUERY_KEYS.PLAYER_PAYMENTS(filterKey),
    queryFn: () => paymentApi.listPlayerPayments(filters),
    staleTime: 60 * 1000,
  });
}

/**
 * Get single payment detail for caller.
 */
export function usePlayerPayment(paymentId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.PLAYER_PAYMENT_DETAIL(paymentId),
    queryFn: () => paymentApi.getPlayerPayment(paymentId),
    enabled: !!paymentId,
  });
}
