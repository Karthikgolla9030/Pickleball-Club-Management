/**
Aught2 Pickleball — Analytics & Reporting API Service (Phase 9)

Typed API client for club operational analytics, reports, and CSV exports.
*/

import { API_ENDPOINTS } from '@/constants';
import { apiClient } from './client';
import type {
  AnalyticsQueryFilters,
  BookingsReportResponse,
  ClubAnalyticsSummaryResponse,
  CompetitionsReportResponse,
  MembershipsReportResponse,
  PaymentsReportResponse,
} from '@/types';

function buildQueryString(filters?: AnalyticsQueryFilters): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.preset) params.append('preset', filters.preset);
  if (filters.start_date) params.append('start_date', filters.start_date);
  if (filters.end_date) params.append('end_date', filters.end_date);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const analyticsApi = {
  /**
   * Retrieve club operational analytics summary.
   */
  getSummary(
    clubId: string,
    filters?: AnalyticsQueryFilters
  ): Promise<ClubAnalyticsSummaryResponse> {
    const url = `${API_ENDPOINTS.CLUB_ANALYTICS_SUMMARY(clubId)}${buildQueryString(filters)}`;
    return apiClient.get<ClubAnalyticsSummaryResponse>(url);
  },

  /**
   * Retrieve detailed court bookings and utilization report.
   */
  getBookingsReport(
    clubId: string,
    filters?: AnalyticsQueryFilters
  ): Promise<BookingsReportResponse> {
    const url = `${API_ENDPOINTS.CLUB_ANALYTICS_BOOKINGS(clubId)}${buildQueryString(filters)}`;
    return apiClient.get<BookingsReportResponse>(url);
  },

  /**
   * Retrieve detailed membership and subscription report.
   */
  getMembershipsReport(
    clubId: string,
    filters?: AnalyticsQueryFilters
  ): Promise<MembershipsReportResponse> {
    const url = `${API_ENDPOINTS.CLUB_ANALYTICS_MEMBERSHIPS(clubId)}${buildQueryString(filters)}`;
    return apiClient.get<MembershipsReportResponse>(url);
  },

  /**
   * Retrieve competition and event activity report.
   */
  getCompetitionsReport(
    clubId: string,
    filters?: AnalyticsQueryFilters
  ): Promise<CompetitionsReportResponse> {
    const url = `${API_ENDPOINTS.CLUB_ANALYTICS_COMPETITIONS(clubId)}${buildQueryString(filters)}`;
    return apiClient.get<CompetitionsReportResponse>(url);
  },

  /**
   * Retrieve financial and payment report (requires MANAGE_PAYMENTS).
   */
  getPaymentsReport(
    clubId: string,
    filters?: AnalyticsQueryFilters
  ): Promise<PaymentsReportResponse> {
    const url = `${API_ENDPOINTS.CLUB_ANALYTICS_PAYMENTS(clubId)}${buildQueryString(filters)}`;
    return apiClient.get<PaymentsReportResponse>(url);
  },

  /**
   * Download sanitized CSV export content.
   */
  exportCsv(
    clubId: string,
    reportType: 'bookings' | 'memberships' | 'payments',
    filters?: AnalyticsQueryFilters
  ): Promise<string> {
    const params = new URLSearchParams();
    params.append('report_type', reportType);
    if (filters?.preset) params.append('preset', filters.preset);
    if (filters?.start_date) params.append('start_date', filters.start_date);
    if (filters?.end_date) params.append('end_date', filters.end_date);

    const url = `${API_ENDPOINTS.CLUB_ANALYTICS_EXPORT(clubId)}?${params.toString()}`;
    return apiClient.get<string>(url);
  },

  /**
   * Generate downloadable export URL.
   */
  getExportUrl(
    clubId: string,
    reportType: 'bookings' | 'memberships' | 'payments',
    filters?: AnalyticsQueryFilters
  ): string {
    const params = new URLSearchParams();
    params.append('report_type', reportType);
    if (filters?.preset) params.append('preset', filters.preset);
    if (filters?.start_date) params.append('start_date', filters.start_date);
    if (filters?.end_date) params.append('end_date', filters.end_date);
    return `${API_ENDPOINTS.CLUB_ANALYTICS_EXPORT(clubId)}?${params.toString()}`;
  },
};
