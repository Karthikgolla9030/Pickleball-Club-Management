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

import { API_ENDPOINTS, APP_CONFIG } from '@/constants';
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
      if (response.status === 502 || response.status === 503 || response.status === 504) {
        return 'The backend service was waking up from idle sleep (HTTP 502 Bad Gateway). The server is active now — please try again.';
      }
      if (response.status === 429) {
        return 'The backend service is currently receiving too many requests (HTTP 429 Too Many Requests). Please wait a moment and try again.';
      }
      return `Backend server returned an HTML page (HTTP ${response.status}) instead of API data. Please ensure the backend is running.`;
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

export async function getAccessToken(): Promise<string | null> {
  return _getAccessToken ? await _getAccessToken() : null;
}

export async function getValidAccessToken(): Promise<string | null> {
  let token = _getAccessToken ? await _getAccessToken() : null;
  if ((!token || isJwtExpired(token)) && _refreshTokenHandler) {
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
  return token;
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

  let timedOut = false;
  const timeoutId = setTimeout(
    () => {
      timedOut = true;
      controller.abort();
    },
    timeoutMs,
  );

  try {
    const isFormData =
      (typeof FormData !== 'undefined' && options.body instanceof FormData) ||
      (options.body && typeof options.body === 'object' && typeof (options.body as any).append === 'function');

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Bypass-Tunnel-Reminder': 'true',
      'Cache-Control': 'no-cache, no-store',
      Pragma: 'no-cache',
      ...(options.headers as Record<string, string>),
    };

    if (!isFormData && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

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

    const fullUrl =
      url.startsWith('http://') || url.startsWith('https://')
        ? url
        : `${API_ENDPOINTS.BASE}${url.startsWith('/') ? '' : '/'}${url}`;

    console.log(`[API REQUEST] ${options.method || 'GET'} ${fullUrl}`);
    const response = await fetch(fullUrl, {
      ...options,
      cache: options.cache ?? 'no-store',
      headers,
      signal: controller.signal,
    });
    console.log(`[API RESPONSE] ${response.status} ${fullUrl}`);

    // If 401 Unauthorized and auth was required, attempt token refresh once
    if (response.status === 401 && requireAuth && !isRetry && _refreshTokenHandler) {
      console.log(`[AUTH] 401 received for ${fullUrl}. Attempting token refresh...`);
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

    // Cold-start retry for 502/503/504 Bad Gateway (Render container spinning up)
    if ((response.status === 502 || response.status === 503 || response.status === 504) && !isRetry) {
      console.log(`[API GATEWAY ${response.status}] Backend cold-start detected on ${url}. Retrying in 2.5s...`);
      await new Promise((resolve) => setTimeout(resolve, 2500));
      return await request<T>(url, options, requireAuth, true);
    }

    // Rate-limiting backoff retry for HTTP 429 Too Many Requests
    if (response.status === 429 && !isRetry) {
      const retryAfter = response.headers.get('retry-after');
      const waitSec = retryAfter ? parseFloat(retryAfter) : 2.5;
      const waitMs = Math.min(Math.max((isNaN(waitSec) ? 2.5 : waitSec) * 1000, 1500), 5000);
      console.log(`[API RATE LIMIT 429] Rate-limiting detected on ${url}. Retrying in ${waitMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return await request<T>(url, options, requireAuth, true);
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
      console.log(`[API CANCELLED] ${options.method || 'GET'} ${url}${timedOut ? ' (Timed Out)' : ''}`);
      if (timedOut) {
        throw new ApiClientError(
          'The server is taking longer than expected to respond (it may be waking up from cold start). Please try again in a moment.',
          'NETWORK_ERROR'
        );
      }
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

  upload<T>(url: string, formData: FormData, requireAuth = true): Promise<T> {
    return request<T>(
      url,
      {
        method: 'POST',
        body: formData,
      },
      requireAuth,
    );
  },

  delete<T>(url: string, requireAuth = true): Promise<T> {
    return request<T>(url, { method: 'DELETE' }, requireAuth);
  },

  getAccessToken(): Promise<string | null> {
    return _getAccessToken ? _getAccessToken() : Promise.resolve(null);
  },

  _getAccessToken(): Promise<string | null> {
    return _getAccessToken ? _getAccessToken() : Promise.resolve(null);
  },
};
