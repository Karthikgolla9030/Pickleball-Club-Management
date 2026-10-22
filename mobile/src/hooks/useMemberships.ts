/**
 * Aught2 Pickleball — Membership Hooks (Phase 12)
 *
 * TanStack Query hooks for:
 *   - Staff: plan catalog (list, detail, create, update, activate/deactivate)
 *   - Staff: subscriptions (list, detail, create, update, cancel, renew)
 *   - Player: active membership view (read-only)
 *
 * Cache invalidation strategy:
 *   - Plan mutations invalidate the club's plan list and the plan detail
 *   - Subscription mutations invalidate the club's subscription list
 *   - Player membership uses a separate cache key per club
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import { membershipApi } from '@/services/api';
import type {
  CancelSubscriptionPayload,
  CreateMembershipPlanPayload,
  CreateSubscriptionPayload,
  PlayerSubscribePayload,
  UpdateMembershipPlanPayload,
  UpdateSubscriptionPayload,
} from '@/types';

// ─── Plan Hooks (Staff) ───────────────────────────────────────────────────────

/**
 * List all membership plans for a club.
 * Optionally filter by status to show only active or inactive plans.
 */
export function useMembershipPlans(clubId: string, status?: 'active' | 'inactive') {
  return useQuery({
    queryKey: QUERY_KEYS.MEMBERSHIP_PLANS(clubId, status),
    queryFn: () => membershipApi.listPlans(clubId, status),
    enabled: !!clubId,
    staleTime: 2 * 60 * 1000, // 2 min
  });
}

/**
 * Get detailed plan info including subscriber count.
 */
export function useMembershipPlan(clubId: string, planId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.MEMBERSHIP_PLAN_DETAIL(clubId, planId),
    queryFn: () => membershipApi.getPlan(clubId, planId),
    enabled: !!clubId && !!planId,
  });
}

/**
 * Create a new membership plan for a club.
 */
export function useCreateMembershipPlan(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMembershipPlanPayload) =>
      membershipApi.createPlan(clubId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MEMBERSHIP_PLANS(clubId) });
    },
  });
}

/**
 * Update plan details (name, price, duration, benefits, booking limits).
 */
export function useUpdateMembershipPlan(clubId: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateMembershipPlanPayload) =>
      membershipApi.updatePlan(clubId, planId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MEMBERSHIP_PLANS(clubId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MEMBERSHIP_PLAN_DETAIL(clubId, planId) });
    },
  });
}

/**
 * Deactivate a membership plan (blocks new subscriptions; existing remain valid).
 */
export function useDeactivatePlan(clubId: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => membershipApi.deactivatePlan(clubId, planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MEMBERSHIP_PLANS(clubId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MEMBERSHIP_PLAN_DETAIL(clubId, planId) });
    },
  });
}

/**
 * Reactivate an inactive membership plan.
 */
export function useReactivatePlan(clubId: string, planId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => membershipApi.reactivatePlan(clubId, planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MEMBERSHIP_PLANS(clubId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MEMBERSHIP_PLAN_DETAIL(clubId, planId) });
    },
  });
}

// ─── Subscription Hooks (Staff) ───────────────────────────────────────────────

/**
 * List subscriptions for a club with optional filters.
 */
export function useClubSubscriptions(
  clubId: string,
  filters?: {
    player_membership_id?: string;
    plan_id?: string;
    status?: string;
    start_date_from?: string;
    start_date_to?: string;
  }
) {
  const filterKey = filters ? JSON.stringify(filters) : 'all';
  return useQuery({
    queryKey: QUERY_KEYS.CLUB_SUBSCRIPTIONS(clubId, filterKey),
    queryFn: () => membershipApi.listSubscriptions(clubId, filters),
    enabled: !!clubId,
    staleTime: 60 * 1000, // 1 min
  });
}

/**
 * Get individual subscription detail with player and plan info.
 */
export function useSubscription(clubId: string, subscriptionId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.SUBSCRIPTION_DETAIL(clubId, subscriptionId),
    queryFn: () => membershipApi.getSubscription(clubId, subscriptionId),
    enabled: !!clubId && !!subscriptionId,
  });
}

/**
 * @deprecated Manual staff enrollment is disabled. Subscriptions are created by players directly.
 */
export function useCreateSubscription(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateSubscriptionPayload) =>
      membershipApi.createSubscription(clubId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_SUBSCRIPTIONS(clubId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MEMBERSHIP_PLANS(clubId) });
    },
  });
}

/**
 * Update subscription mutable fields (auto_renew, notes).
 */
export function useUpdateSubscription(clubId: string, subscriptionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateSubscriptionPayload) =>
      membershipApi.updateSubscription(clubId, subscriptionId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SUBSCRIPTION_DETAIL(clubId, subscriptionId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_SUBSCRIPTIONS(clubId) });
    },
  });
}

/**
 * Cancel a subscription (staff workflow, no refund processing).
 */
export function useCancelSubscription(clubId: string, subscriptionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CancelSubscriptionPayload) =>
      membershipApi.cancelSubscription(clubId, subscriptionId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SUBSCRIPTION_DETAIL(clubId, subscriptionId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_SUBSCRIPTIONS(clubId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MEMBERSHIP_PLANS(clubId) });
    },
  });
}

/**
 * Renew a subscription — creates a new record for audit history.
 */
export function useRenewSubscription(clubId: string, subscriptionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => membershipApi.renewSubscription(clubId, subscriptionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_SUBSCRIPTIONS(clubId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MEMBERSHIP_PLANS(clubId) });
    },
  });
}

// ─── Player Hooks ─────────────────────────────────────────────────────────────

/**
 * Player-facing: fetch active membership for a specific club.
 * Returns undefined if no active subscription exists.
 */
export function usePlayerMembership(clubId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.PLAYER_MEMBERSHIP(clubId),
    queryFn: () => membershipApi.getPlayerMembership(clubId),
    enabled: !!clubId,
    retry: (failureCount, error: any) => {
      // Don't retry on 404 — no active membership is an expected state
      if (error?.status === 404) return false;
      return failureCount < 3;
    },
    staleTime: 2 * 60 * 1000, // 2 min
  });
}

/**
 * Player-facing: fetch all subscriptions across clubs for authenticated player.
 */
export function usePlayerMemberships(status?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.PLAYER_MEMBERSHIPS(status),
    queryFn: () => membershipApi.listPlayerMemberships(status),
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Player-facing: subscribe to a club membership plan.
 */
export function usePlayerSubscribe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      clubId,
      planId,
      payload,
    }: {
      clubId: string;
      planId: string;
      payload?: PlayerSubscribePayload;
    }) => membershipApi.playerSubscribe(clubId, planId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_MEMBERSHIP(variables.clubId) });
      queryClient.invalidateQueries({ queryKey: ['player', 'memberships'] });
      queryClient.invalidateQueries({ queryKey: ['player', 'payments'] });
      queryClient.invalidateQueries({ queryKey: ['player', 'clubs'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_SUBSCRIPTIONS(variables.clubId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MEMBERSHIP_PLANS(variables.clubId) });
    },
  });
}

/**
 * Player-facing: renew an existing subscription.
 */
export function useRenewPlayerSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (subscriptionId: string) =>
      membershipApi.renewPlayerSubscription(subscriptionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['player', 'memberships'] });
      queryClient.invalidateQueries({ queryKey: ['player', 'payments'] });
    },
  });
}
