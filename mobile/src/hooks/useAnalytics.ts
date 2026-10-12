/**
Aught2 Pickleball — Analytics & Reporting Hooks (Phase 9)

TanStack Query hooks for club operational reporting, court utilization,
memberships, competitions, payments, and data exports.
Automatically invalidates and refetches when the active club changes.
*/

import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import { analyticsApi } from '@/services/api';
import type { AnalyticsQueryFilters } from '@/types';

/**
 * Retrieve comprehensive club operational analytics overview.
 */
export function useClubAnalyticsSummary(
  clubId: string,
  filters?: AnalyticsQueryFilters,
  enabled: boolean = true
) {
  const filterKey = filters ? JSON.stringify(filters) : '30d';
  return useQuery({
    queryKey: QUERY_KEYS.CLUB_ANALYTICS_SUMMARY(clubId, filterKey),
    queryFn: () => analyticsApi.getSummary(clubId, filters),
    enabled: !!clubId && enabled,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Retrieve detailed court bookings and utilization report.
 */
export function useBookingsReport(
  clubId: string,
  filters?: AnalyticsQueryFilters,
  enabled: boolean = true
) {
  const filterKey = filters ? JSON.stringify(filters) : '30d';
  return useQuery({
    queryKey: QUERY_KEYS.CLUB_ANALYTICS_BOOKINGS(clubId, filterKey),
    queryFn: () => analyticsApi.getBookingsReport(clubId, filters),
    enabled: !!clubId && enabled,
    staleTime: 60 * 1000,
  });
}

/**
 * Retrieve detailed membership and subscription report.
 */
export function useMembershipsReport(
  clubId: string,
  filters?: AnalyticsQueryFilters,
  enabled: boolean = true
) {
  const filterKey = filters ? JSON.stringify(filters) : '30d';
  return useQuery({
    queryKey: QUERY_KEYS.CLUB_ANALYTICS_MEMBERSHIPS(clubId, filterKey),
    queryFn: () => analyticsApi.getMembershipsReport(clubId, filters),
    enabled: !!clubId && enabled,
    staleTime: 60 * 1000,
  });
}

/**
 * Retrieve competition and event activity report.
 */
export function useCompetitionsReport(
  clubId: string,
  filters?: AnalyticsQueryFilters,
  enabled: boolean = true
) {
  const filterKey = filters ? JSON.stringify(filters) : '30d';
  return useQuery({
    queryKey: QUERY_KEYS.CLUB_ANALYTICS_COMPETITIONS(clubId, filterKey),
    queryFn: () => analyticsApi.getCompetitionsReport(clubId, filters),
    enabled: !!clubId && enabled,
    staleTime: 60 * 1000,
  });
}

/**
 * Retrieve financial and payment report (requires MANAGE_PAYMENTS).
 */
export function usePaymentsReport(
  clubId: string,
  filters?: AnalyticsQueryFilters,
  enabled: boolean = true
) {
  const filterKey = filters ? JSON.stringify(filters) : '30d';
  return useQuery({
    queryKey: QUERY_KEYS.CLUB_ANALYTICS_PAYMENTS(clubId, filterKey),
    queryFn: () => analyticsApi.getPaymentsReport(clubId, filters),
    enabled: !!clubId && enabled,
    staleTime: 60 * 1000,
  });
}
