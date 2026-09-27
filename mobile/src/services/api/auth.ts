/**
 * Auth API service — wraps auth endpoints.
 * No role is ever sent to the backend from here.
 */

import { API_ENDPOINTS } from '@/constants';
import type { AuthResponse, TokenRefreshResponse } from '@/types';
import { apiClient } from './client';

export const authApi = {
  /**
   * Login with email and password (generic).
   */
  login(email: string, password: string): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>(
      API_ENDPOINTS.AUTH_LOGIN,
      { email, password },
      false, // No auth header for login
    );
  },

  /**
   * Club Staff Login: backend automatically determines role from ClubMembership.
   * Throws 403 if user has no club staff access or account is disabled.
   */
  loginClub(email: string, password: string): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>(
      API_ENDPOINTS.AUTH_CLUB_LOGIN,
      { email, password },
      false,
    );
  },

  /**
   * Player Login: enters Player portal only.
   */
  loginPlayer(email: string, password: string): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>(
      API_ENDPOINTS.AUTH_PLAYER_LOGIN,
      { email, password },
      false,
    );
  },

  /**
   * Player Self-Registration.
   */
  registerPlayer(email: string, password: string, fullName: string): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>(
      API_ENDPOINTS.AUTH_PLAYER_REGISTER,
      { email, password, full_name: fullName },
      false,
    );
  },

  /**
   * Exchange refresh token for new access token.
   */
  refreshToken(refreshToken: string): Promise<TokenRefreshResponse> {
    return apiClient.post<TokenRefreshResponse>(
      API_ENDPOINTS.AUTH_REFRESH,
      { refresh_token: refreshToken },
      false, // Uses refresh token, not access token
    );
  },

  /**
   * Get current user profile and memberships using access token.
   * Used to restore session on app launch.
   */
  getMe(): Promise<AuthResponse> {
    return apiClient.get<AuthResponse>(API_ENDPOINTS.AUTH_ME, true);
  },
};
