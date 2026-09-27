/**
 * Aught2 Pickleball — Court Booking & Reservation Hooks (Phase 11)
 *
 * TanStack Query hooks for player court booking, dynamic availability lookup,
 * cancellation, and club staff reservation management.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bookingApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import type {
  Booking,
  BookingCancelPayload,
  BookingCreatePayload,
  ClubAvailabilityResponse,
  StaffBookingCreatePayload,
} from '@/types';

// ─── Player Booking Hooks ────────────────────────────────────────────────────

export function usePlayerBookings(params?: {
  clubId?: string;
  status?: string;
  upcomingOnly?: boolean;
}) {
  const queryClient = useQueryClient();

  const bookingsQuery = useQuery<Booking[], Error>({
    queryKey: QUERY_KEYS.PLAYER_BOOKINGS(
      params?.clubId,
      params?.status,
      params?.upcomingOnly
    ),
    queryFn: () =>
      bookingApi.getPlayerBookings({
        club_id: params?.clubId,
        status: params?.status,
        upcoming_only: params?.upcomingOnly,
      }),
    staleTime: 15 * 1000,
  });

  const cancelBookingMutation = useMutation({
    mutationFn: ({
      bookingId,
      payload,
    }: {
      bookingId: string;
      payload?: BookingCancelPayload;
    }) => bookingApi.cancelPlayerBooking(bookingId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['clubs'] });
    },
  });

  return {
    ...bookingsQuery,
    bookings: bookingsQuery.data ?? [],
    cancelBooking: cancelBookingMutation.mutateAsync,
    isCancelling: cancelBookingMutation.isPending,
  };
}

// ─── Dynamic Court Availability Hook ─────────────────────────────────────────

export function useClubCourtAvailability(
  clubId: string | null,
  dateStr: string,
  durationMinutes: number = 60
) {
  const queryClient = useQueryClient();

  const availabilityQuery = useQuery<ClubAvailabilityResponse, Error>({
    queryKey: clubId
      ? QUERY_KEYS.CLUB_COURT_AVAILABILITY(clubId, dateStr, durationMinutes)
      : ['clubs', 'none', 'availability'],
    queryFn: () => {
      if (!clubId) throw new Error('Club ID required');
      return bookingApi.getClubCourtAvailability(clubId, dateStr, durationMinutes);
    },
    enabled: Boolean(clubId && dateStr),
    staleTime: 15 * 1000,
  });

  const createBookingMutation = useMutation({
    mutationFn: (payload: BookingCreatePayload) => {
      if (!clubId) throw new Error('Club ID required');
      return bookingApi.createPlayerBooking(clubId, payload);
    },
    onSuccess: () => {
      if (clubId) {
        queryClient.invalidateQueries({
          queryKey: ['clubs', clubId, 'availability'],
        });
        queryClient.invalidateQueries({
          queryKey: ['clubs', clubId, 'staff-bookings'],
        });
      }
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });

  return {
    ...availabilityQuery,
    availability: availabilityQuery.data ?? null,
    createBooking: createBookingMutation.mutateAsync,
    isBooking: createBookingMutation.isPending,
  };
}

// ─── Staff Booking Management Hook ───────────────────────────────────────────

export function useClubStaffBookings(
  clubId: string | null,
  courtId?: string,
  status?: string
) {
  const queryClient = useQueryClient();

  const staffBookingsQuery = useQuery<Booking[], Error>({
    queryKey: clubId
      ? QUERY_KEYS.CLUB_STAFF_BOOKINGS(clubId, courtId, status)
      : ['clubs', 'none', 'staff-bookings'],
    queryFn: () => {
      if (!clubId) throw new Error('Club ID required');
      return bookingApi.getClubBookings(clubId, {
        court_id: courtId,
        status,
      });
    },
    enabled: Boolean(clubId),
    staleTime: 15 * 1000,
  });

  const createStaffBookingMutation = useMutation({
    mutationFn: (payload: StaffBookingCreatePayload) => {
      if (!clubId) throw new Error('Club ID required');
      return bookingApi.createStaffBooking(clubId, payload);
    },
    onSuccess: () => {
      if (clubId) {
        queryClient.invalidateQueries({
          queryKey: ['clubs', clubId, 'staff-bookings'],
        });
        queryClient.invalidateQueries({
          queryKey: ['clubs', clubId, 'availability'],
        });
      }
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });

  const cancelStaffBookingMutation = useMutation({
    mutationFn: ({
      bookingId,
      payload,
    }: {
      bookingId: string;
      payload?: BookingCancelPayload;
    }) => {
      if (!clubId) throw new Error('Club ID required');
      return bookingApi.cancelStaffBooking(clubId, bookingId, payload);
    },
    onSuccess: () => {
      if (clubId) {
        queryClient.invalidateQueries({
          queryKey: ['clubs', clubId, 'staff-bookings'],
        });
        queryClient.invalidateQueries({
          queryKey: ['clubs', clubId, 'availability'],
        });
      }
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });

  return {
    ...staffBookingsQuery,
    bookings: staffBookingsQuery.data ?? [],
    createStaffBooking: createStaffBookingMutation.mutateAsync,
    isCreating: createStaffBookingMutation.isPending,
    cancelStaffBooking: cancelStaffBookingMutation.mutateAsync,
    isCancelling: cancelStaffBookingMutation.isPending,
  };
}
