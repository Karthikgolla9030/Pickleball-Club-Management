/**
 * Aught2 Pickleball — Platform Banners API Service
 *
 * Centralized service for Platform Administrators to manage global home page banners:
 * - Owner Home Page Banner: Main welcome card hero on Club Owner Dashboard
 * - Player Home Page Banner: Main global hero banner on Player App Home
 */

import { Platform } from 'react-native';
import { API_ENDPOINTS } from '@/constants';
import { prepareImageBlobForUpload } from '@/utils';
import { apiClient } from './client';
import type { PlatformBanner, UpdatePlatformBannerPayload } from '@/types';

export const platformBannersApi = {
  /**
   * Retrieve all platform banners (public read).
   */
  getBanners(): Promise<Record<string, PlatformBanner>> {
    return apiClient.get<Record<string, PlatformBanner>>(API_ENDPOINTS.PLATFORM_BANNERS, false);
  },

  /**
   * Retrieve a specific platform banner by type ('owner_home' | 'player_home').
   */
  getBanner(bannerType: 'owner_home' | 'player_home'): Promise<PlatformBanner> {
    return apiClient.get<PlatformBanner>(API_ENDPOINTS.PLATFORM_BANNER_DETAIL(bannerType), false);
  },

  /**
   * Update banner title, subtitle, CTA text, CTA destination, or is_active (Platform Owner only).
   */
  updateBanner(
    bannerType: 'owner_home' | 'player_home',
    payload: UpdatePlatformBannerPayload
  ): Promise<PlatformBanner> {
    return apiClient.put<PlatformBanner>(API_ENDPOINTS.PLATFORM_BANNER_DETAIL(bannerType), payload, true);
  },

  /**
   * Upload and set a new image for the specified platform banner (Platform Owner only).
   */
  async uploadBannerImage(
    bannerType: 'owner_home' | 'player_home',
    fileInput: { uri: string; name?: string; type?: string; blob?: Blob }
  ): Promise<PlatformBanner> {
    const formData = new FormData();
    const fileName = fileInput.name || `${bannerType}_banner.jpg`;
    const mimeType = fileInput.type || 'image/jpeg';

    if (fileInput.blob) {
      formData.append('file', fileInput.blob, fileName);
    } else if (
      Platform.OS === 'web' ||
      (typeof window !== 'undefined' &&
        (fileInput.uri.startsWith('blob:') ||
          fileInput.uri.startsWith('data:') ||
          fileInput.uri.startsWith('http://') ||
          fileInput.uri.startsWith('https://')))
    ) {
      // Browser/Web environment: compress image maintaining high visual quality
      const blob = await prepareImageBlobForUpload(fileInput.uri, mimeType, 1920, 0.88);
      formData.append('file', blob, fileName);
    } else {
      // React Native native mobile environment
      formData.append('file', {
        uri: fileInput.uri,
        name: fileName,
        type: mimeType,
      } as any);
    }

    return apiClient.upload<PlatformBanner>(
      API_ENDPOINTS.PLATFORM_BANNER_UPLOAD(bannerType),
      formData,
      true
    );
  },

  /**
   * Reset banner back to default built-in platform fallback (Platform Owner only).
   */
  resetBanner(bannerType: 'owner_home' | 'player_home'): Promise<PlatformBanner> {
    return apiClient.delete<PlatformBanner>(API_ENDPOINTS.PLATFORM_BANNER_DETAIL(bannerType), true);
  },
};
