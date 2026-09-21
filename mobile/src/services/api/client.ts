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

import { APP_CONFIG, API_ENDPOINTS } from '@/constants';
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

// ─── Token Provider ───────────────────────────────────────────────────────────
// Injected from the auth store — avoids circular imports.

let _getAccessToken: (() => Promise<string | null>) | null = null;

export function setTokenProvider(provider: () => Promise<string | null>): void {
  _getAccessToken = provider;
}

// ─── Core Request Function ────────────────────────────────────────────────────

async function request<T>(
  url: string,
  options: RequestInit = {},
  requireAuth = true,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    APP_CONFIG.API_TIMEOUT_MS,
  );

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (requireAuth && _getAccessToken) {
      const token = await _getAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

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
    if (error instanceof ApiClientError) throw error;
    if ((error as Error).name === 'AbortError') {
      throw new ApiClientError('Request timed out', 'NETWORK_ERROR');
    }
    throw new ApiClientError(
      'Network error — check your connection',
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
