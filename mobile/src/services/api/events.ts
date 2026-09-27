/**
 * Aught2 Pickleball — Events API Service (Phase 14)
 *
 * Typed API client for staff and player club event operations.
 */

import { API_ENDPOINTS } from '@/constants';
import { apiClient } from './client';
import type {
  ClubEvent,
  CreateEventPayload,
  EventFilters,
  EventRegistration,
  EventRegistrationStatus,
  PlayerEventDetail,
  PlayerRegisterPayload,
  StaffRegisterPlayerPayload,
  UpdateEventPayload,
} from '@/types';

export const eventApi = {
  // ─── Staff Event Endpoints ─────────────────────────────────────────────────

  /**
   * List all events for a club with optional filtering.
   */
  listClubEvents(clubId: string, filters?: EventFilters): Promise<ClubEvent[]> {
    const base = API_ENDPOINTS.CLUB_EVENTS(clubId);
    if (!filters) return apiClient.get<ClubEvent[]>(base);

    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.event_type) params.append('event_type', filters.event_type);
    if (filters.visibility) params.append('visibility', filters.visibility);
    if (filters.date_from) params.append('date_from', filters.date_from);
    if (filters.date_to) params.append('date_to', filters.date_to);

    const qs = params.toString();
    return apiClient.get<ClubEvent[]>(qs ? `${base}?${qs}` : base);
  },

  /**
   * Get single event detail for staff.
   */
  getClubEvent(clubId: string, eventId: string): Promise<ClubEvent> {
    return apiClient.get<ClubEvent>(API_ENDPOINTS.CLUB_EVENT(clubId, eventId));
  },

  /**
   * Create a new event in draft status.
   */
  createClubEvent(clubId: string, payload: CreateEventPayload): Promise<ClubEvent> {
    return apiClient.post<ClubEvent>(API_ENDPOINTS.CLUB_EVENTS(clubId), payload);
  },

  /**
   * Update mutable fields of an event.
   */
  updateClubEvent(clubId: string, eventId: string, payload: UpdateEventPayload): Promise<ClubEvent> {
    return apiClient.patch<ClubEvent>(API_ENDPOINTS.CLUB_EVENT(clubId, eventId), payload);
  },

  /**
   * Publish a draft event.
   */
  publishClubEvent(clubId: string, eventId: string): Promise<ClubEvent> {
    return apiClient.post<ClubEvent>(API_ENDPOINTS.CLUB_EVENT_PUBLISH(clubId, eventId), {});
  },

  /**
   * Cancel an event.
   */
  cancelClubEvent(clubId: string, eventId: string): Promise<ClubEvent> {
    return apiClient.post<ClubEvent>(API_ENDPOINTS.CLUB_EVENT_CANCEL(clubId, eventId), {});
  },

  /**
   * Mark an event as completed.
   */
  completeClubEvent(clubId: string, eventId: string): Promise<ClubEvent> {
    return apiClient.post<ClubEvent>(API_ENDPOINTS.CLUB_EVENT_COMPLETE(clubId, eventId), {});
  },

  /**
   * List registrations for an event, optionally filtered by status.
   */
  listEventRegistrations(
    clubId: string,
    eventId: string,
    status?: EventRegistrationStatus,
  ): Promise<EventRegistration[]> {
    const base = API_ENDPOINTS.CLUB_EVENT_REGISTRATIONS(clubId, eventId);
    if (!status) return apiClient.get<EventRegistration[]>(base);
    return apiClient.get<EventRegistration[]>(`${base}?status=${status}`);
  },

  /**
   * Staff manually registers a player.
   */
  staffRegisterPlayer(
    clubId: string,
    eventId: string,
    payload: StaffRegisterPlayerPayload,
  ): Promise<EventRegistration> {
    return apiClient.post<EventRegistration>(
      API_ENDPOINTS.CLUB_EVENT_REGISTRATIONS(clubId, eventId),
      payload,
    );
  },

  /**
   * Staff cancels a registration.
   */
  staffCancelRegistration(
    clubId: string,
    eventId: string,
    registrationId: string,
  ): Promise<EventRegistration> {
    return apiClient.post<EventRegistration>(
      API_ENDPOINTS.CLUB_EVENT_REGISTRATION_CANCEL(clubId, eventId, registrationId),
      {},
    );
  },

  /**
   * Staff marks attendance for a registered participant.
   */
  staffMarkAttendance(
    clubId: string,
    eventId: string,
    registrationId: string,
    attended: boolean,
  ): Promise<EventRegistration> {
    const endpoint = attended
      ? API_ENDPOINTS.CLUB_EVENT_REGISTRATION_ATTEND(clubId, eventId, registrationId)
      : API_ENDPOINTS.CLUB_EVENT_REGISTRATION_NOSHOW(clubId, eventId, registrationId);
    return apiClient.post<EventRegistration>(endpoint, {});
  },

  /**
   * Staff manually promotes a waitlisted player.
   */
  staffPromoteWaitlisted(
    clubId: string,
    eventId: string,
    registrationId: string,
  ): Promise<EventRegistration> {
    return apiClient.post<EventRegistration>(
      API_ENDPOINTS.CLUB_EVENT_REGISTRATION_PROMOTE(clubId, eventId, registrationId),
      {},
    );
  },

  // ─── Player Event Endpoints ────────────────────────────────────────────────

  /**
   * Discover published events for a club (public + members-only if club member).
   */
  discoverClubEvents(clubId: string): Promise<ClubEvent[]> {
    if (!clubId) return Promise.resolve([]);
    return apiClient.get<ClubEvent[]>(API_ENDPOINTS.PLAYER_EVENTS_DISCOVER(clubId));
  },

  /**
   * List all registrations for authenticated player.
   */
  listMyEvents(status?: EventRegistrationStatus): Promise<EventRegistration[]> {
    const base = API_ENDPOINTS.PLAYER_MY_EVENTS;
    if (!status) return apiClient.get<EventRegistration[]>(base);
    return apiClient.get<EventRegistration[]>(`${base}?status=${status}`);
  },

  /**
   * Get detailed event information from player perspective.
   */
  getPlayerEventDetail(eventId: string): Promise<PlayerEventDetail> {
    return apiClient.get<PlayerEventDetail>(API_ENDPOINTS.PLAYER_EVENT_DETAIL(eventId));
  },

  /**
   * Player registers for an event.
   */
  registerForEvent(eventId: string, payload?: PlayerRegisterPayload): Promise<EventRegistration> {
    return apiClient.post<EventRegistration>(
      API_ENDPOINTS.PLAYER_EVENT_REGISTER(eventId),
      payload ?? {},
    );
  },

  /**
   * Player cancels their own registration.
   */
  cancelEventRegistration(eventId: string): Promise<EventRegistration> {
    return apiClient.post<EventRegistration>(API_ENDPOINTS.PLAYER_EVENT_CANCEL(eventId), {});
  },
};
