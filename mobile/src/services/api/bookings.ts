/**
 * Aught2 Pickleball — Court Bookings & Reservation API Service (Phase 11)
 *
 * Typed API wrappers for player reservation flows, dynamic availability matrix,
 * booking cancellation, and staff club booking management.
 */

import { API_ENDPOINTS } from '@/constants';
import { apiClient } from './client';
import type {
  Booking,
  BookingCancelPayload,
  BookingCreatePayload,
  ClubAvailabilityResponse,
  StaffBookingCreatePayload,
} from '@/types';

export const bookingApi = {
  // ─── Player Endpoints ───────────────────────────────────────────────────────

  /**
   * Fetch court availability time slots for a club on a target calendar date (YYYY-MM-DD).
   */
  getClubCourtAvailability(
    clubId: string,
    dateStr: string,
    durationMinutes: number = 60
  ): Promise<ClubAvailabilityResponse> {
    const url = `${API_ENDPOINTS.CLUB_COURT_AVAILABILITY(clubId)}?date=${encodeURIComponent(dateStr)}&duration=${durationMinutes}`;
    return apiClient.get<ClubAvailabilityResponse>(url);
  },

  /**
   * Create a court reservation for the authenticated player.
   */
  createPlayerBooking(
    clubId: string,
    payload: BookingCreatePayload
  ): Promise<Booking> {
    return apiClient.post<Booking>(API_ENDPOINTS.CLUB_BOOKINGS_CREATE(clubId), payload);
  },

  /**
   * List reservations for the current authenticated player profile.
   */
  getPlayerBookings(params?: {
    club_id?: string;
    status?: string;
    upcoming_only?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<Booking[]> {
    const query = new URLSearchParams();
    if (params?.club_id) query.append('club_id', params.club_id);
    if (params?.status) query.append('status', params.status);
    if (params?.upcoming_only) query.append('upcoming_only', 'true');
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.offset) query.append('offset', String(params.offset));

    const qs = query.toString();
    const url = qs ? `${API_ENDPOINTS.BOOKINGS}?${qs}` : API_ENDPOINTS.BOOKINGS;
    return apiClient.get<Booking[]>(url);
  },

  /**
   * Get single booking details.
   */
  getBooking(bookingId: string): Promise<Booking> {
    return apiClient.get<Booking>(API_ENDPOINTS.BOOKING_DETAIL(bookingId));
  },

  /**
   * Cancel own player booking (cutoff is 2 hours before start).
   */
  cancelPlayerBooking(
    bookingId: string,
    payload: BookingCancelPayload = {}
  ): Promise<Booking> {
    return apiClient.post<Booking>(API_ENDPOINTS.BOOKING_CANCEL(bookingId), payload);
  },

  // ─── Club Staff Endpoints ───────────────────────────────────────────────────

  /**
   * List all bookings for a club with optional filtering. Requires MANAGE_BOOKINGS.
   */
  getClubBookings(
    clubId: string,
    params?: {
      court_id?: string;
      player_id?: string;
      status?: string;
      start_date?: string;
      end_date?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<Booking[]> {
    const query = new URLSearchParams();
    if (params?.court_id) query.append('court_id', params.court_id);
    if (params?.player_id) query.append('player_id', params.player_id);
    if (params?.status) query.append('status', params.status);
    if (params?.start_date) query.append('start_date', params.start_date);
    if (params?.end_date) query.append('end_date', params.end_date);
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.offset) query.append('offset', String(params.offset));

    const qs = query.toString();
    const url = qs
      ? `${API_ENDPOINTS.CLUB_STAFF_BOOKINGS(clubId)}?${qs}`
      : API_ENDPOINTS.CLUB_STAFF_BOOKINGS(clubId);
    return apiClient.get<Booking[]>(url);
  },

  /**
   * Staff creates a reservation on behalf of an active club player.
   */
  createStaffBooking(
    clubId: string,
    payload: StaffBookingCreatePayload
  ): Promise<Booking> {
    return apiClient.post<Booking>(
      API_ENDPOINTS.CLUB_STAFF_BOOKING_CREATE(clubId),
      payload
    );
  },

  /**
   * Staff cancels a booking within their club.
   */
  cancelStaffBooking(
    clubId: string,
    bookingId: string,
    payload: BookingCancelPayload = {}
  ): Promise<Booking> {
    return apiClient.post<Booking>(
      API_ENDPOINTS.CLUB_STAFF_BOOKING_CANCEL(clubId, bookingId),
      payload
    );
  },
};
