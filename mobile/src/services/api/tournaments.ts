/**
 * Aught2 Pickleball — Tournament API Service
 */

import { API_ENDPOINTS } from '@/constants';
import { apiClient } from './client';
import type {
  CreateTournamentPayload,
  EligiblePartnerItem,
  PlayerRegistrationResponse,
  PlayerSelfRegistrationPayload,
  PlayerTournamentRegistrationStatus,
  Tournament,
  TournamentDiscoveryItem,
  TournamentRegistrationItem,
  TournamentStatus,
  UpdateRegistrationPayload,
  UpdateTournamentPayload,
} from '@/types';

export const tournamentApi = {
  // ─── Club Staff Tournament Management ─────────────────────────────────────

  /**
   * List tournaments belonging to a specific club.
   */
  listClubTournaments(
    clubId: string,
    status?: TournamentStatus
  ): Promise<Tournament[]> {
    const url = status
      ? `${API_ENDPOINTS.CLUB_TOURNAMENTS(clubId)}?status=${status}`
      : API_ENDPOINTS.CLUB_TOURNAMENTS(clubId);
    return apiClient.get<Tournament[]>(url);
  },

  /**
   * Retrieve single tournament details for club staff.
   */
  getClubTournament(clubId: string, tournamentId: string): Promise<Tournament> {
    return apiClient.get<Tournament>(
      `${API_ENDPOINTS.CLUB_TOURNAMENTS(clubId)}/${tournamentId}`
    );
  },

  /**
   * Create a new tournament in DRAFT status.
   */
  createTournament(
    clubId: string,
    payload: CreateTournamentPayload
  ): Promise<Tournament> {
    return apiClient.post<Tournament>(
      API_ENDPOINTS.CLUB_TOURNAMENTS(clubId),
      payload
    );
  },

  /**
   * Update tournament configuration.
   */
  updateTournament(
    clubId: string,
    tournamentId: string,
    payload: UpdateTournamentPayload
  ): Promise<Tournament> {
    return apiClient.patch<Tournament>(
      `${API_ENDPOINTS.CLUB_TOURNAMENTS(clubId)}/${tournamentId}`,
      payload
    );
  },

  /**
   * Transition tournament from DRAFT to REGISTRATION_OPEN.
   */
  openRegistration(clubId: string, tournamentId: string): Promise<Tournament> {
    return apiClient.post<Tournament>(
      `${API_ENDPOINTS.CLUB_TOURNAMENTS(clubId)}/${tournamentId}/open-registration`,
      {}
    );
  },

  /**
   * Transition tournament from REGISTRATION_OPEN to REGISTRATION_CLOSED.
   */
  closeRegistration(clubId: string, tournamentId: string): Promise<Tournament> {
    return apiClient.post<Tournament>(
      `${API_ENDPOINTS.CLUB_TOURNAMENTS(clubId)}/${tournamentId}/close-registration`,
      {}
    );
  },

  /**
   * Cancel tournament from DRAFT, REGISTRATION_OPEN, or REGISTRATION_CLOSED.
   */
  cancelTournament(clubId: string, tournamentId: string): Promise<Tournament> {
    return apiClient.post<Tournament>(
      `${API_ENDPOINTS.CLUB_TOURNAMENTS(clubId)}/${tournamentId}/cancel`,
      {}
    );
  },

  /**
   * List all registrations/participants for a tournament.
   */
  listRegistrations(
    clubId: string,
    tournamentId: string
  ): Promise<TournamentRegistrationItem[]> {
    return apiClient.get<TournamentRegistrationItem[]>(
      `${API_ENDPOINTS.CLUB_TOURNAMENTS(clubId)}/${tournamentId}/registrations`
    );
  },

  /**
   * Update participant registration status or assign seed.
   */
  updateRegistration(
    clubId: string,
    tournamentId: string,
    registrationId: string,
    payload: UpdateRegistrationPayload
  ): Promise<TournamentRegistrationItem> {
    return apiClient.patch<TournamentRegistrationItem>(
      `${API_ENDPOINTS.CLUB_TOURNAMENTS(clubId)}/${tournamentId}/registrations/${registrationId}`,
      payload
    );
  },

  // ─── Player Discovery & Self-Registration ─────────────────────────────────

  /**
   * Discover public tournaments across active clubs.
   */
  discoverTournaments(): Promise<TournamentDiscoveryItem[]> {
    return apiClient.get<TournamentDiscoveryItem[]>(
      API_ENDPOINTS.PLAYER_TOURNAMENTS
    );
  },

  /**
   * View tournament details by tournament ID.
   */
  getTournament(tournamentId: string): Promise<Tournament> {
    return apiClient.get<Tournament>(
      `${API_ENDPOINTS.TOURNAMENTS}/${tournamentId}`
    );
  },

  /**
   * List eligible partners for doubles tournament registration.
   */
  getEligiblePartners(
    tournamentId: string,
    query?: string
  ): Promise<EligiblePartnerItem[]> {
    const url = query
      ? `${API_ENDPOINTS.TOURNAMENTS}/${tournamentId}/eligible-partners?query=${encodeURIComponent(query)}`
      : `${API_ENDPOINTS.TOURNAMENTS}/${tournamentId}/eligible-partners`;
    return apiClient.get<EligiblePartnerItem[]>(url);
  },

  /**
   * List confirmed participant registrations for a public tournament.
   */
  getPlayerRegistrations(tournamentId: string): Promise<TournamentRegistrationItem[]> {
    return apiClient.get<TournamentRegistrationItem[]>(
      `${API_ENDPOINTS.TOURNAMENTS}/${tournamentId}/registrations`
    );
  },

  /**
   * Get caller's registration status and details for a tournament.
   */
  getMyRegistration(tournamentId: string): Promise<PlayerTournamentRegistrationStatus> {
    return apiClient.get<PlayerTournamentRegistrationStatus>(
      `${API_ENDPOINTS.TOURNAMENTS}/${tournamentId}/my-registration`
    );
  },

  /**
   * Self-register caller for a tournament.
   */
  registerPlayer(
    tournamentId: string,
    payload?: PlayerSelfRegistrationPayload
  ): Promise<PlayerRegistrationResponse> {
    return apiClient.post<PlayerRegistrationResponse>(
      `${API_ENDPOINTS.TOURNAMENTS}/${tournamentId}/register`,
      payload ?? {}
    );
  },

  /**
   * Cancel caller's self-registration for a tournament.
   */
  cancelRegistration(tournamentId: string): Promise<PlayerRegistrationResponse> {
    return apiClient.delete<PlayerRegistrationResponse>(
      `${API_ENDPOINTS.TOURNAMENTS}/${tournamentId}/register`
    );
  },

  /**
   * Get list of tournament IDs favorited by current player.
   */
  getFavorites(): Promise<string[]> {
    return apiClient.get<string[]>(
      `${API_ENDPOINTS.PLAYER_TOURNAMENTS}/favorites`
    );
  },

  /**
   * Add a tournament to player's favorites.
   */
  addFavorite(tournamentId: string): Promise<void> {
    return apiClient.post<void>(
      `${API_ENDPOINTS.PLAYER_TOURNAMENTS}/${tournamentId}/favorite`,
      {}
    );
  },

  /**
   * Remove a tournament from player's favorites.
   */
  removeFavorite(tournamentId: string): Promise<void> {
    return apiClient.delete<void>(
      `${API_ENDPOINTS.PLAYER_TOURNAMENTS}/${tournamentId}/favorite`
    );
  },
};

