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

  constructor(message: string, type: ApiErrorType, status?: number) {
    super(message);
    this.name = 'ApiClientError';
    this.type = type;
    this.status = status;
    this.detail = message;
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
    const json = await response.json() as ApiError;
    if (typeof json.detail === 'string') return json.detail;
    if (Array.isArray(json.detail)) {
      return json.detail.map((e) => e.msg).join('; ');
    }
    return `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
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

    if (requireAuth && _getAccessToken) {
      const token = await _getAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
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
          return await request<T>(url, options, requireAuth, true);
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

    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof ApiClientError) {
      // 401 is expected when restoring session with an expired/invalid token or checking auth
      if (error.status === 401 || error.type === 'UNAUTHORIZED') {
        console.log(`[AUTH] Session unauthenticated (${url}): ${error.message}`);
      } else {
        console.log(`[API ${error.status || 'ERR'}] ${options.method || 'GET'} ${url}: ${error.message}`);
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
