/**
 * Aught2 Pickleball — Event Hooks (Phase 14)
 *
 * TanStack Query hooks for:
 *   - Staff: event CRUD, lifecycle transitions (publish/cancel/complete), registration roster, attendance, manual promotion
 *   - Player: event discovery, registration, cancellation, my events
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import { eventApi } from '@/services/api';
import type {
  CreateEventPayload,
  EventFilters,
  EventRegistrationStatus,
  PlayerRegisterPayload,
  StaffRegisterPlayerPayload,
  UpdateEventPayload,
} from '@/types';

// ─── Staff Hooks ─────────────────────────────────────────────────────────────

/**
 * List events for a club with optional filtering.
 */
export function useClubEvents(clubId: string, filters?: EventFilters) {
  const filterKey = filters ? JSON.stringify(filters) : 'all';
  return useQuery({
    queryKey: QUERY_KEYS.CLUB_EVENTS(clubId, filterKey),
    queryFn: () => eventApi.listClubEvents(clubId, filters),
    enabled: !!clubId,
    staleTime: 60 * 1000,
  });
}

/**
 * Get single event detail for staff.
 */
export function useClubEvent(clubId: string, eventId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.CLUB_EVENT_DETAIL(clubId, eventId),
    queryFn: () => eventApi.getClubEvent(clubId, eventId),
    enabled: !!clubId && !!eventId,
  });
}

/**
 * Create a new event in draft status.
 */
export function useCreateClubEvent(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateEventPayload) =>
      eventApi.createClubEvent(clubId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'events'] });
    },
  });
}

/**
 * Update mutable fields of an event.
 */
export function useUpdateClubEvent(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, payload }: { eventId: string; payload: UpdateEventPayload }) =>
      eventApi.updateClubEvent(clubId, eventId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'events'] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_EVENT_DETAIL(clubId, variables.eventId),
      });
    },
  });
}

/**
 * Publish a draft event.
 */
export function usePublishClubEvent(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) =>
      eventApi.publishClubEvent(clubId, eventId),
    onSuccess: (_, eventId) => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'events'] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_EVENT_DETAIL(clubId, eventId),
      });
    },
  });
}

/**
 * Cancel an event.
 */
export function useCancelClubEvent(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) =>
      eventApi.cancelClubEvent(clubId, eventId),
    onSuccess: (_, eventId) => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'events'] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_EVENT_DETAIL(clubId, eventId),
      });
    },
  });
}

/**
 * Complete an event.
 */
export function useCompleteClubEvent(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) =>
      eventApi.completeClubEvent(clubId, eventId),
    onSuccess: (_, eventId) => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'events'] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_EVENT_DETAIL(clubId, eventId),
      });
    },
  });
}

/**
 * List registrations for an event.
 */
export function useEventRegistrations(
  clubId: string,
  eventId: string,
  status?: EventRegistrationStatus,
) {
  return useQuery({
    queryKey: QUERY_KEYS.CLUB_EVENT_REGISTRATIONS(clubId, eventId, status),
    queryFn: () => eventApi.listEventRegistrations(clubId, eventId, status),
    enabled: !!clubId && !!eventId,
  });
}

/**
 * Staff manually registers a player for an event.
 */
export function useStaffRegisterPlayer(clubId: string, eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: StaffRegisterPlayerPayload) =>
      eventApi.staffRegisterPlayer(clubId, eventId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['clubs', clubId, 'events', eventId, 'registrations'],
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_EVENT_DETAIL(clubId, eventId),
      });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'events'] });
    },
  });
}

/**
 * Staff cancels a player's registration.
 */
export function useStaffCancelRegistration(clubId: string, eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (registrationId: string) =>
      eventApi.staffCancelRegistration(clubId, eventId, registrationId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['clubs', clubId, 'events', eventId, 'registrations'],
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_EVENT_DETAIL(clubId, eventId),
      });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'events'] });
    },
  });
}

/**
 * Staff marks attendance (attended or no-show).
 */
export function useStaffMarkAttendance(clubId: string, eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      registrationId,
      attended,
    }: {
      registrationId: string;
      attended: boolean;
    }) => eventApi.staffMarkAttendance(clubId, eventId, registrationId, attended),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['clubs', clubId, 'events', eventId, 'registrations'],
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_EVENT_DETAIL(clubId, eventId),
      });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'events'] });
    },
  });
}

/**
 * Staff promotes a waitlisted player to registered.
 */
export function useStaffPromoteWaitlisted(clubId: string, eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (registrationId: string) =>
      eventApi.staffPromoteWaitlisted(clubId, eventId, registrationId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['clubs', clubId, 'events', eventId, 'registrations'],
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_EVENT_DETAIL(clubId, eventId),
      });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'events'] });
    },
  });
}

// ─── Player Hooks ────────────────────────────────────────────────────────────

/**
 * Discover published events eligible for current player in a club.
 */
export function useDiscoverClubEvents(clubId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.PLAYER_DISCOVER_EVENTS(clubId),
    queryFn: () => eventApi.discoverClubEvents(clubId),
    enabled: !!clubId,
    staleTime: 60 * 1000,
  });
}

/**
 * List all registrations for the current player.
 */
export function useMyEvents(status?: EventRegistrationStatus) {
  return useQuery({
    queryKey: QUERY_KEYS.PLAYER_MY_EVENTS(status),
    queryFn: () => eventApi.listMyEvents(status),
    staleTime: 60 * 1000,
  });
}

/**
 * Get detailed event information from player perspective.
 */
export function usePlayerEventDetail(eventId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.PLAYER_EVENT_DETAIL(eventId),
    queryFn: () => eventApi.getPlayerEventDetail(eventId),
    enabled: !!eventId,
  });
}

/**
 * Player registers for an event.
 */
export function useRegisterForEvent(eventId: string, clubId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload?: PlayerRegisterPayload) =>
      eventApi.registerForEvent(eventId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['player', 'events'] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.PLAYER_EVENT_DETAIL(eventId),
      });
      if (clubId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.PLAYER_DISCOVER_EVENTS(clubId),
        });
      }
    },
  });
}

/**
 * Player cancels their own registration.
 */
export function useCancelEventRegistration(eventId: string, clubId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => eventApi.cancelEventRegistration(eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['player', 'events'] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.PLAYER_EVENT_DETAIL(eventId),
      });
      if (clubId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.PLAYER_DISCOVER_EVENTS(clubId),
        });
      }
    },
  });
}
