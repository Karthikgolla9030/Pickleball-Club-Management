/**
 * Aught2 Pickleball — Image Resolution & Synchronization Engine
 *
 * Implements strict hierarchical image resolution across all three portals:
 * 1. Club Side – Club Details, Branding, Preview, and activity management
 * 2. Player Side – Discovery, Club Details, and activity listings
 * 3. Platform Admin – Global banners (Owner Home, Player Home)
 *
 * Strict Rules:
 * - Images are 100% OPTIONAL: A picture appears ONLY when an actual image has been uploaded or configured.
 * - When no image is configured, resolve functions return `null`.
 * - NO fake photos, NO generic stock placeholders, NO hardcoded built-in fallback pictures.
 * - Source of Truth: Club Details (Profile & Branding) and Platform Admin Banners.
 * - Correct Priority:
 *     Club Item: (1) Item custom image -> (2) Club default in Branding -> (3) null
 *     Platform Banner: Platform Admin configured image -> null
 */

import { ImageSourcePropType } from 'react-native';
import type { ClubBranding } from '@/types';
import { resolveMediaUrl } from './media';

// Deprecated empty fallbacks object preserved for interface backward compatibility (always null)
export const BUILTIN_FALLBACKS: Record<string, null> = {
  ownerBanner: null,
  tournamentRoundRobin: null,
  tournamentScramble: null,
  tournamentPoolPlay: null,
  tournamentBracket: null,
  tournamentGeneric: null,
  league: null,
  event: null,
  lesson: null,
  clubCover: null,
};

/**
 * Checks if a resolved image source is configured and non-empty.
 */
export function hasConfiguredImage(source: ImageSourcePropType | null | undefined): boolean {
  if (!source) return false;
  if (typeof source === 'object' && 'uri' in (source as any)) {
    return Boolean((source as any).uri);
  }
  return true;
}

/**
 * Resolves the tournament banner following strict priority:
 * 1. tournament.banner_image_url (custom item image)
 * 2. club format default configured in Club Details -> Branding
 * 3. null (no fake or stock photo)
 */
export function resolveTournamentBanner(
  tournament?: {
    banner_image_url?: string | null;
    format?: string | null;
  } | null,
  clubBranding?: ClubBranding | null
): ImageSourcePropType | null {
  if (tournament?.banner_image_url) {
    return { uri: resolveMediaUrl(tournament.banner_image_url) };
  }

  const fmt = (tournament?.format || '').toLowerCase().trim();

  if (fmt === 'round_robin') {
    if (clubBranding?.default_tournament_round_robin_url) {
      return { uri: resolveMediaUrl(clubBranding.default_tournament_round_robin_url) };
    }
    return null;
  }

  if (fmt === 'scramble') {
    if (clubBranding?.default_tournament_scramble_url) {
      return { uri: resolveMediaUrl(clubBranding.default_tournament_scramble_url) };
    }
    return null;
  }

  if (fmt === 'pool_play') {
    if (clubBranding?.default_tournament_pool_play_url) {
      return { uri: resolveMediaUrl(clubBranding.default_tournament_pool_play_url) };
    }
    return null;
  }

  if (fmt === 'bracket') {
    if (clubBranding?.default_tournament_bracket_url) {
      return { uri: resolveMediaUrl(clubBranding.default_tournament_bracket_url) };
    }
    return null;
  }

  return null;
}

/**
 * Resolves a format-specific tournament default banner for a club.
 * Returns null if not configured in club branding.
 */
export function resolveTournamentFormatDefault(
  format: 'round_robin' | 'scramble' | 'pool_play' | 'bracket' | string,
  clubBranding?: ClubBranding | null
): ImageSourcePropType | null {
  const fmt = format.toLowerCase().trim();
  if (fmt === 'round_robin' && clubBranding?.default_tournament_round_robin_url) {
    return { uri: resolveMediaUrl(clubBranding.default_tournament_round_robin_url) };
  }
  if (fmt === 'scramble' && clubBranding?.default_tournament_scramble_url) {
    return { uri: resolveMediaUrl(clubBranding.default_tournament_scramble_url) };
  }
  if (fmt === 'pool_play' && clubBranding?.default_tournament_pool_play_url) {
    return { uri: resolveMediaUrl(clubBranding.default_tournament_pool_play_url) };
  }
  if (fmt === 'bracket' && clubBranding?.default_tournament_bracket_url) {
    return { uri: resolveMediaUrl(clubBranding.default_tournament_bracket_url) };
  }
  return null;
}

/**
 * Resolves a league picture following strict priority:
 * 1. league.banner_image_url (custom item image)
 * 2. club default_league_banner_url (configured in Club Details -> Branding)
 * 3. null (no stock picture)
 */
export function resolveLeaguePicture(
  league?: { banner_image_url?: string | null } | string | null,
  clubBranding?: ClubBranding | null
): ImageSourcePropType | null {
  const customUrl = typeof league === 'string' ? league : league?.banner_image_url;
  if (customUrl) {
    return { uri: resolveMediaUrl(customUrl) };
  }
  if (clubBranding?.default_league_banner_url) {
    return { uri: resolveMediaUrl(clubBranding.default_league_banner_url) };
  }
  return null;
}

export const resolveLeagueBanner = resolveLeaguePicture;

/**
 * Resolves an event picture following strict priority:
 * 1. event.cover_image_url (custom item image)
 * 2. club default_event_banner_url (configured in Club Details -> Branding)
 * 3. null (no stock picture)
 */
export function resolveEventPicture(
  event?: { cover_image_url?: string | null } | string | null,
  clubBranding?: ClubBranding | null
): ImageSourcePropType | null {
  const customUrl = typeof event === 'string' ? event : event?.cover_image_url;
  if (customUrl) {
    return { uri: resolveMediaUrl(customUrl) };
  }
  if (clubBranding?.default_event_banner_url) {
    return { uri: resolveMediaUrl(clubBranding.default_event_banner_url) };
  }
  return null;
}

export const resolveEventCover = resolveEventPicture;

/**
 * Resolves a lesson/coaching picture following strict priority:
 * 1. lesson.image_url (custom session image)
 * 2. lesson.lesson_type?.image_url (lesson template picture)
 * 3. club default_lesson_banner_url (configured in Club Details -> Branding)
 * 4. null (no stock picture)
 */
export function resolveLessonPicture(
  lesson?: {
    image_url?: string | null;
    lesson_type?: { image_url?: string | null } | null;
  } | string | null,
  clubBranding?: ClubBranding | null
): ImageSourcePropType | null {
  if (typeof lesson === 'string') {
    if (lesson) return { uri: resolveMediaUrl(lesson) };
  } else if (lesson?.image_url) {
    return { uri: resolveMediaUrl(lesson.image_url) };
  } else if (lesson?.lesson_type?.image_url) {
    return { uri: resolveMediaUrl(lesson.lesson_type.image_url) };
  }
  if (clubBranding?.default_lesson_banner_url) {
    return { uri: resolveMediaUrl(clubBranding.default_lesson_banner_url) };
  }
  return null;
}

export const resolveLessonImage = resolveLessonPicture;

export const resolveTournamentPicture = resolveTournamentBanner;

/**
 * Resolves the owner home dashboard welcome card banner:
 * 1. platformBanner.image_url (Platform Admin configured banner)
 * 2. null (no fake stock photo)
 */
export function resolveOwnerBanner(
  platformBannerOrBranding?: { image_url?: string | null; owner_banner_url?: string | null } | null
): ImageSourcePropType | null {
  if (platformBannerOrBranding?.image_url) {
    return { uri: resolveMediaUrl(platformBannerOrBranding.image_url) };
  }
  if (platformBannerOrBranding?.owner_banner_url) {
    return { uri: resolveMediaUrl(platformBannerOrBranding.owner_banner_url) };
  }
  return null;
}

/**
 * Resolves the player home page hero banner:
 * 1. platformBanner.image_url (Platform Admin configured banner)
 * 2. null (no fake stock photo)
 */
export function resolvePlayerBanner(
  platformBanner?: { image_url?: string | null } | null
): ImageSourcePropType | null {
  if (platformBanner?.image_url) {
    return { uri: resolveMediaUrl(platformBanner.image_url) };
  }
  return null;
}

/**
 * Resolves the public player-facing club cover banner:
 * 1. clubOrBranding.cover_image_url
 * 2. null (no fake stock photo)
 */
export function resolveClubCover(
  clubOrBranding?: { cover_image_url?: string | null } | null
): ImageSourcePropType | null {
  if (clubOrBranding?.cover_image_url) {
    return { uri: resolveMediaUrl(clubOrBranding.cover_image_url) };
  }
  return null;
}

/**
 * Resolves the official club logo:
 * 1. clubOrBranding.logo_url
 * 2. null (no fake stock photo)
 */
export function resolveClubLogo(
  clubOrBranding?: { logo_url?: string | null } | null
): ImageSourcePropType | null {
  if (clubOrBranding?.logo_url) {
    return { uri: resolveMediaUrl(clubOrBranding.logo_url) };
  }
  return null;
}
