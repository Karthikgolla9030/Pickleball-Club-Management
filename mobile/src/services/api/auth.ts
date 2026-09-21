/**
 * Auth API service — wraps auth endpoints.
 * No role is ever sent to the backend from here.
 */

import { API_ENDPOINTS } from '@/constants';
import type { AuthResponse, TokenRefreshResponse } from '@/types';
import { apiClient } from './client';

export const authApi = {
  /**
   * Login with email and password.
   * Backend returns role info via memberships — we NEVER send role.
   */
  login(email: string, password: string): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>(
      API_ENDPOINTS.AUTH_LOGIN,
      { email, password },
      false, // No auth header for login
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
