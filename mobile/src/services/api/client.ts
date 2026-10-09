/* eslint-disable no-console */
/**
 * Aught2 Pickleball — Centralized API Client
 *
 * All API communication goes through this client.
 * Features:
 *   - Centralized base URL (from environment)
 *   - Authorization header injection
 *   - Typed error handling
 *   - Timeout handling
 *   - Token refresh support (via interceptor pattern)
 *   - Never exposes stack traces to users
 */

import { APP_CONFIG } from '@/constants';
import type { ApiError, ApiErrorType } from '@/types';

// ─── Typed API Error ──────────────────────────────────────────────────────────

export class ApiClientError extends Error {
  public readonly type: ApiErrorType;
  public readonly status: number | undefined;
  public readonly detail: string;
  public readonly isApiClientError = true;

  constructor(message: string, type: ApiErrorType, status?: number) {
    super(message);
    this.name = 'ApiClientError';
    this.type = type;
    this.status = status;
    this.detail = message;
    Object.setPrototypeOf(this, ApiClientError.prototype);
  }
}

function classifyError(status: number): ApiErrorType {
  switch (status) {
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 409: return 'CONFLICT';
    case 422: return 'VALIDATION_ERROR';
    case 429: return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'SERVER_ERROR' : 'UNKNOWN_ERROR';
  }
}

async function extractErrorDetail(response: Response): Promise<string> {
  try {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      return `Backend server returned an HTML page (HTTP ${response.status}) instead of API data. Please ensure the backend is running and tunnel is active.`;
    }
    const json = (await response.json()) as ApiError;
    if (typeof json.detail === 'string') return json.detail;
    if (Array.isArray(json.detail)) {
      return json.detail.map((e) => e.msg).join('; ');
    }
    return `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

function isJwtExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const binaryStr = typeof atob === 'function' ? atob(base64) : '';
    if (!binaryStr) return false;
    const jsonPayload = decodeURIComponent(
      binaryStr
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const parsed = JSON.parse(jsonPayload);
    if (!parsed.exp) return false;
    // 30s buffer before expiration
    return Date.now() >= (parsed.exp * 1000 - 30000);
  } catch {
    return false;
  }
}

// ─── Token Provider & Refresh Interceptor ─────────────────────────────────────
// Injected from the auth store — avoids circular imports.

let _getAccessToken: (() => Promise<string | null>) | null = null;
let _refreshTokenHandler: (() => Promise<string | null>) | null = null;
let _refreshPromise: Promise<string | null> | null = null;

export function setTokenProvider(provider: () => Promise<string | null>): void {
  _getAccessToken = provider;
}

export function setTokenRefreshHandler(handler: () => Promise<string | null>): void {
  _refreshTokenHandler = handler;
}

// ─── Core Request Function ────────────────────────────────────────────────────

async function request<T>(
  url: string,
  options: RequestInit = {},
  requireAuth = true,
  isRetry = false,
): Promise<T> {
  const controller = new AbortController();
  
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', () => controller.abort());
    }
  }

  // Mutations (write operations) get a longer timeout because score saving
  // triggers DB transactions, standings calculations, and tournament completion checks.
  const isMutation = options.method && options.method !== 'GET';
  const timeoutMs = isMutation ? APP_CONFIG.API_MUTATION_TIMEOUT_MS : APP_CONFIG.API_TIMEOUT_MS;

  const timeoutId = setTimeout(
    () => controller.abort(),
    timeoutMs,
  );

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Bypass-Tunnel-Reminder': 'true',
      ...(options.headers as Record<string, string>),
    };

    if (requireAuth) {
      let token = _getAccessToken ? await _getAccessToken() : null;

      // Proactive refresh: if token is missing or expired, attempt refresh before sending request
      if ((!token || isJwtExpired(token)) && _refreshTokenHandler && !isRetry) {
        try {
          if (!_refreshPromise) {
            _refreshPromise = _refreshTokenHandler().finally(() => {
              _refreshPromise = null;
            });
          }
          const refreshed = await _refreshPromise;
          if (refreshed) {
            token = refreshed;
          }
        } catch (e) {
          console.warn('[AUTH] Proactive token refresh failed:', e);
        }
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      } else if (!isRetry) {
        // If auth is strictly required and no token could be obtained, fail early with clear message
        throw new ApiClientError('Not authenticated. Please sign in to continue.', 'UNAUTHORIZED', 401);
      }
    }

    console.log(`[API REQUEST] ${options.method || 'GET'} ${url}`);
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    console.log(`[API RESPONSE] ${response.status} ${url}`);

    // If 401 Unauthorized and auth was required, attempt token refresh once
    if (response.status === 401 && requireAuth && !isRetry && _refreshTokenHandler) {
      console.log(`[AUTH] 401 received for ${url}. Attempting token refresh...`);
      try {
        if (!_refreshPromise) {
          _refreshPromise = _refreshTokenHandler().finally(() => {
            _refreshPromise = null;
          });
        }
        const newToken = await _refreshPromise;
        if (newToken) {
          console.log(`[AUTH] Token refreshed successfully. Retrying ${url}...`);
          const retryOptions: RequestInit = {
            ...options,
            headers: {
              ...(options.headers as Record<string, string>),
              Authorization: `Bearer ${newToken}`,
            },
          };
          return await request<T>(url, retryOptions, requireAuth, true);
        }
      } catch (refreshErr) {
        console.warn(`[AUTH] Token refresh failed for ${url}:`, refreshErr);
      }
    }

    if (!response.ok) {
      const detail = await extractErrorDetail(response);
      throw new ApiClientError(detail, classifyError(response.status), response.status);
    }

    // 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      throw new ApiClientError(
        'Server returned HTML instead of API data. Please verify the backend server and tunnel are running.',
        'SERVER_ERROR',
        502
      );
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (
      error instanceof ApiClientError ||
      (error as any)?.name === 'ApiClientError' ||
      (error as any)?.isApiClientError
    ) {
      const apiErr = error as ApiClientError;
      // 401 is expected when restoring session with an expired/invalid token or checking auth
      if (apiErr.status === 401 || apiErr.type === 'UNAUTHORIZED') {
        console.log(`[AUTH] Session unauthenticated (${url}): ${apiErr.message}`);
      } else {
        console.log(`[API ${apiErr.status || 'ERR'}] ${options.method || 'GET'} ${url}: ${apiErr.message}`);
      }
      throw error;
    }

    const isCancel = 
      (error as Error).name === 'AbortError' || 
      String(error).includes('canceled') || 
      String(error).includes('aborted');

    if (isCancel) {
      // Just log debug level for cancellations to avoid spamming the console
      console.log(`[API CANCELLED] ${options.method || 'GET'} ${url}`);
      throw new ApiClientError(
        "Couldn't confirm the request completed. Please check the result and try again if needed.",
        'NETWORK_ERROR'
      );
    }

    console.warn(`[API FAILED] ${options.method || 'GET'} ${url}:`, error);
    
    throw new ApiClientError(
      'A network error occurred. Please check your connection and try again.',
      'NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Public HTTP Methods ──────────────────────────────────────────────────────

export const apiClient = {
  get<T>(url: string, requireAuth = true): Promise<T> {
    return request<T>(url, { method: 'GET' }, requireAuth);
  },

  post<T>(url: string, body: unknown, requireAuth = true): Promise<T> {
    return request<T>(
      url,
      { method: 'POST', body: JSON.stringify(body) },
      requireAuth,
    );
  },

  put<T>(url: string, body: unknown, requireAuth = true): Promise<T> {
    return request<T>(
      url,
      { method: 'PUT', body: JSON.stringify(body) },
      requireAuth,
    );
  },

  patch<T>(url: string, body: unknown, requireAuth = true): Promise<T> {
    return request<T>(
      url,
      { method: 'PATCH', body: JSON.stringify(body) },
      requireAuth,
    );
  },

  delete<T>(url: string, requireAuth = true): Promise<T> {
    return request<T>(url, { method: 'DELETE' }, requireAuth);
  },
};
