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
  let base = API_ENDPOINTS.BASE?.replace(/\/+$/, '') || '';
  if (!base || base.includes('vercel.app')) {
    // Static backend uploads are hosted on the Render backend server, not Vercel
    base = 'https://pickleball-club-management.onrender.com';
  }
  if (trimmed.startsWith('/')) {
    return `${base}${trimmed}`;
  }
  return `${base}/${trimmed}`;
}

/**
 * Resizes and compresses image on client side (Web & Browser) before network transmission.
 * Reduces 5MB-10MB mobile uploads down to ~150KB-250KB, making uploads 10-20x faster.
 */
export async function prepareImageBlobForUpload(
  uri: string,
  mimeType: string = 'image/jpeg',
  maxDimension: number = 1600,
  quality: number = 0.85
): Promise<Blob> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    const res = await fetch(uri);
    return res.blob();
  }

  return new Promise((resolve, reject) => {
    const img = new (window as any).Image();
    // Only set crossOrigin on remote HTTP/HTTPS URLs. Setting crossOrigin on blob: or data: URLs
    // triggers browser CORS/taint errors in Chromium and WebKit.
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      // Scale down if larger than maxDimension
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        fetch(uri).then((r) => r.blob()).then(resolve).catch(reject);
        return;
      }

      const isPng = mimeType.toLowerCase().includes('png');
      const isWebp = mimeType.toLowerCase().includes('webp');
      let outputMime = 'image/jpeg';
      if (isPng) outputMime = 'image/png';
      else if (isWebp) outputMime = 'image/webp';

      if (!isPng && !isWebp) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            fetch(uri).then((r) => r.blob()).then(resolve).catch(reject);
          }
        },
        outputMime,
        isPng ? undefined : quality
      );
    };
    img.onerror = () => {
      fetch(uri).then((r) => r.blob()).then(resolve).catch(reject);
    };
    img.src = uri;
  });
}
