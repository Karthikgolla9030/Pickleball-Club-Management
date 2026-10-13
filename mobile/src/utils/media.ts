/**
 * Media and Image Resolution Utilities
 *
 * Ensures consistent multi-tenant image URL resolution and graceful fallback handling
 * across mobile (Expo Go/Native) and web deployments.
 */

import { API_ENDPOINTS } from '@/constants';

/**
 * Resolves an image URL or path to an absolute loadable URL.
 * Handles local backend uploads, CDN paths, base64 strings, and absolute HTTP URLs.
 */
export function resolveMediaUrl(url: string | null | undefined, fallback: string = ''): string {
  if (!url || typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  if (!trimmed) return fallback;

  // Already absolute or embedded base64/blob
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  // Relative upload path, e.g. "/uploads/logos/xyz.png"
  const base = API_ENDPOINTS.BASE?.replace(/\/+$/, '') || '';
  if (trimmed.startsWith('/')) {
    return `${base}${trimmed}`;
  }
  return `${base}/${trimmed}`;
}
