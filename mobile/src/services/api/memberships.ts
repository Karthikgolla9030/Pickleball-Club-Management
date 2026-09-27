/**
 * Aught2 Pickleball — Membership Plans & Subscriptions API Service (Phase 12)
 *
 * Typed API wrappers for:
 *   - Membership plan catalog management (club-scoped, staff only)
 *   - Member subscription enrollment lifecycle (club-scoped, staff only)
 *   - Player membership view (player-facing, read-only)
 */

import { API_ENDPOINTS } from '@/constants';
import { apiClient } from './client';
import type {
  CancelSubscriptionPayload,
  CreateMembershipPlanPayload,
  CreateSubscriptionPayload,
  MemberSubscription,
  MembershipPlan,
  MembershipPlanDetail,
  PlayerMembershipView,
  UpdateMembershipPlanPayload,
  UpdateSubscriptionPayload,
} from '@/types';

export const membershipApi = {
  // ─── Membership Plan Endpoints (Club-Scoped, Staff Only) ─────────────────────

  /**
   * List all membership plans for a club. Optionally filter by status.
   */
  listPlans(clubId: string, status?: 'active' | 'inactive'): Promise<MembershipPlan[]> {
    const base = API_ENDPOINTS.CLUB_MEMBERSHIP_PLANS(clubId);
    const url = status ? `${base}?status=${status}` : base;
    return apiClient.get<MembershipPlan[]>(url);
  },

  /**
   * Get detailed plan info including subscriber count.
   */
  getPlan(clubId: string, planId: string): Promise<MembershipPlanDetail> {
    return apiClient.get<MembershipPlanDetail>(
      API_ENDPOINTS.CLUB_MEMBERSHIP_PLAN(clubId, planId)
    );
  },

  /**
   * Create a new membership plan for the club.
   */
  createPlan(clubId: string, payload: CreateMembershipPlanPayload): Promise<MembershipPlan> {
    return apiClient.post<MembershipPlan>(
      API_ENDPOINTS.CLUB_MEMBERSHIP_PLANS(clubId),
      payload
    );
  },

  /**
   * Update plan fields (name, description, price, duration, benefits, booking limits).
   */
  updatePlan(
    clubId: string,
    planId: string,
    payload: UpdateMembershipPlanPayload
  ): Promise<MembershipPlan> {
    return apiClient.patch<MembershipPlan>(
      API_ENDPOINTS.CLUB_MEMBERSHIP_PLAN(clubId, planId),
      payload
    );
  },

  /**
   * Deactivate a plan — new subscriptions blocked, existing remain valid.
   */
  deactivatePlan(clubId: string, planId: string): Promise<MembershipPlan> {
    return apiClient.post<MembershipPlan>(
      API_ENDPOINTS.CLUB_PLAN_DEACTIVATE(clubId, planId),
      {}
    );
  },

  /**
   * Reactivate an inactive plan, allowing new subscriptions again.
   */
  reactivatePlan(clubId: string, planId: string): Promise<MembershipPlan> {
    return apiClient.post<MembershipPlan>(
      API_ENDPOINTS.CLUB_PLAN_REACTIVATE(clubId, planId),
      {}
    );
  },

  // ─── Subscription Endpoints (Club-Scoped, Staff Only) ────────────────────────

  /**
   * List subscriptions for a club. Supports filters via query params.
   */
  listSubscriptions(
    clubId: string,
    params?: {
      player_membership_id?: string;
      plan_id?: string;
      status?: string;
      start_date_from?: string;
      start_date_to?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<MemberSubscription[]> {
    const base = API_ENDPOINTS.CLUB_SUBSCRIPTIONS(clubId);
    if (params && Object.keys(params).length > 0) {
      const qs = new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => [k, String(v)])
      ).toString();
      return apiClient.get<MemberSubscription[]>(`${base}?${qs}`);
    }
    return apiClient.get<MemberSubscription[]>(base);
  },

  /**
   * Get individual subscription with player and plan details.
   */
  getSubscription(clubId: string, subscriptionId: string): Promise<MemberSubscription> {
    return apiClient.get<MemberSubscription>(
      API_ENDPOINTS.CLUB_SUBSCRIPTION(clubId, subscriptionId)
    );
  },

  /**
   * Enroll a player in a membership plan (staff workflow).
   */
  createSubscription(
    clubId: string,
    payload: CreateSubscriptionPayload
  ): Promise<MemberSubscription> {
    return apiClient.post<MemberSubscription>(
      API_ENDPOINTS.CLUB_SUBSCRIPTIONS(clubId),
      payload
    );
  },

  /**
   * Update mutable fields: auto_renew and notes.
   */
  updateSubscription(
    clubId: string,
    subscriptionId: string,
    payload: UpdateSubscriptionPayload
  ): Promise<MemberSubscription> {
    return apiClient.patch<MemberSubscription>(
      API_ENDPOINTS.CLUB_SUBSCRIPTION(clubId, subscriptionId),
      payload
    );
  },

  /**
   * Staff cancels an active or scheduled subscription (soft-delete, no refund).
   */
  cancelSubscription(
    clubId: string,
    subscriptionId: string,
    payload: CancelSubscriptionPayload
  ): Promise<MemberSubscription> {
    return apiClient.post<MemberSubscription>(
      API_ENDPOINTS.CLUB_SUBSCRIPTION_CANCEL(clubId, subscriptionId),
      payload
    );
  },

  /**
   * Administratively renew a subscription.
   * Creates a new subscription record (old one preserved for history).
   */
  renewSubscription(clubId: string, subscriptionId: string): Promise<MemberSubscription> {
    return apiClient.post<MemberSubscription>(
      API_ENDPOINTS.CLUB_SUBSCRIPTION_RENEW(clubId, subscriptionId),
      {}
    );
  },

  // ─── Player Endpoint (Read-Only) ──────────────────────────────────────────────

  /**
   * Player-facing: get active membership for a specific club.
   * Players can VIEW only — all mutations require staff permissions.
   */
  getPlayerMembership(clubId: string): Promise<PlayerMembershipView> {
    return apiClient.get<PlayerMembershipView>(API_ENDPOINTS.PLAYER_MEMBERSHIP(clubId));
  },
};
