/**
 * Aught2 Pickleball — Image Resolution & Synchronization Engine
 *
 * Implements strict hierarchical image resolution across all three portals:
 * 1. Club Side – Club Details, Branding, Preview, and activity management
 * 2. Player Side – Discovery, Club Details, and activity listings
 * 3. Platform Admin – Global banners (Owner Home, Player Home, Defaults)
 *
 * Exact Priority Hierarchy:
 * Priority 1: Individual Custom Image
 *   - If an individual tournament, event, lesson, league, or other supported item has a custom image, display that exact image.
 *   - Do not use either default when a custom image exists.
 * Priority 2: Club Default Image
 *   - If the individual item has no custom image, check whether its club has configured a default image for that category.
 *   - If a club default exists, display the club's default.
 * Priority 3: Platform Admin Default Image
 *   - If the individual item has no custom image and the club has not configured a default for that category, display the corresponding Platform Admin default.
 * Fallback:
 *   - Clean neutral no-image state (`null`), unless `allowBuiltinFallback: true` is explicitly requested.
 *
 * Strict Isolation Rules:
 * - Uploading an individual custom image NEVER affects club or platform defaults.
 * - Changing platform defaults NEVER overwrites club defaults or individual custom images.
 * - Club defaults are strictly isolated by club ID (Club A never leaks into Club B).
 * - Club identity (official logo, player cover) and court photos are strictly independent and NEVER fall back to content defaults.
 */

import { ImageSourcePropType } from 'react-native';
import type { ClubBranding, PlatformBanner } from '@/types';
import { resolveMediaUrl } from './media';
import { queryClient } from '@/services/queryClient';
import { QUERY_KEYS } from '@/constants';

export type ImageResolutionLevel = 'custom' | 'club_default' | 'platform_default' | 'fallback' | 'none';

export interface ImageResolutionDetails {
  source: ImageSourcePropType | null;
  level: ImageResolutionLevel;
  url: string | null;
}

export interface ImageResolutionOptions {
  allowBuiltinFallback?: boolean;
}

// Deliberate built-in fallback assets for content categories where defaults are mandated.
// Club identity (logo, cover) and courts strictly have NO fallback (null).
export const BUILTIN_FALLBACKS: Record<string, ImageSourcePropType | null> = {
  ownerBanner: null,
  playerBanner: null,
  tournamentRoundRobin: require('../../assets/tournaments/card_round_robin.jpg'),
  tournamentScramble: require('../../assets/tournaments/banner2.jpg'),
  tournamentPoolPlay: require('../../assets/tournaments/card_pool_play.jpg'),
  tournamentBracket: require('../../assets/tournaments/card_bracket.jpg'),
  tournamentGeneric: require('../../assets/tournaments/hero_discover_banner.jpg'),
  league: require('../../assets/leagues/hero_banner.jpg'),
  event: require('../../assets/events/hero_events_photo.jpg'),
  lesson: require('../../assets/lessons/hero_lessons_photo.jpg'),
  clubCover: null,
  clubLogo: null,
  court: null,
};

/**
 * Retrieves cached platform banners from TanStack Query cache if available.
 */
export function getCachedPlatformBanners(): Record<string, PlatformBanner> | undefined {
  try {
    return queryClient.getQueryData<Record<string, PlatformBanner>>(QUERY_KEYS.PLATFORM_BANNERS);
  } catch {
    return undefined;
  }
}

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
 * 2. club format default or club general default in Club Details -> Branding
 * 3. platform admin format default or platform general default in Platform Banners
 * 4. backend pre-resolved URL (if provided)
 * 5. deliberate built-in format fallback (if options.allowBuiltinFallback)
 * 6. null (clean neutral no-image state)
 */
export function resolveTournamentBanner(
  tournament?: {
    banner_image_url?: string | null;
    resolved_banner_url?: string | null;
    format?: string | null;
  } | null,
  clubBranding?: ClubBranding | null,
  platformBanners?: Record<string, PlatformBanner> | null,
  options?: ImageResolutionOptions
): ImageSourcePropType | null {
  // 1. Individual Custom Image (Priority 1)
  if (tournament?.banner_image_url) {
    return { uri: resolveMediaUrl(tournament.banner_image_url) };
  }

  const fmt = (tournament?.format || '').toLowerCase().trim();

  // 2. Club Default Image (Priority 2)
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
  if (clubBranding?.default_tournament_banner_url) {
    return { uri: resolveMediaUrl(clubBranding.default_tournament_banner_url) };
  }

  // 3. Platform Admin Default Image (Priority 3)
  const activePlatformBanners = platformBanners ?? getCachedPlatformBanners();
  if (fmt === 'round_robin' && activePlatformBanners?.default_tournament_round_robin?.image_url) {
    return { uri: resolveMediaUrl(activePlatformBanners.default_tournament_round_robin.image_url) };
  }
  if (fmt === 'scramble' && activePlatformBanners?.default_tournament_scramble?.image_url) {
    return { uri: resolveMediaUrl(activePlatformBanners.default_tournament_scramble.image_url) };
  }
  if (fmt === 'pool_play' && activePlatformBanners?.default_tournament_pool_play?.image_url) {
    return { uri: resolveMediaUrl(activePlatformBanners.default_tournament_pool_play.image_url) };
  }
  if (fmt === 'bracket' && activePlatformBanners?.default_tournament_bracket?.image_url) {
    return { uri: resolveMediaUrl(activePlatformBanners.default_tournament_bracket.image_url) };
  }
  if (activePlatformBanners?.default_tournament_banner?.image_url) {
    return { uri: resolveMediaUrl(activePlatformBanners.default_tournament_banner.image_url) };
  }

  // 4. Backend pre-resolved fallback
  if (tournament?.resolved_banner_url) {
    return { uri: resolveMediaUrl(tournament.resolved_banner_url) };
  }

  // 5. Deliberate built-in fallback (Platform Admin Built-in Default)
  if (options?.allowBuiltinFallback !== false) {
    if (fmt === 'round_robin') return BUILTIN_FALLBACKS.tournamentRoundRobin;
    if (fmt === 'scramble') return BUILTIN_FALLBACKS.tournamentScramble;
    if (fmt === 'pool_play') return BUILTIN_FALLBACKS.tournamentPoolPlay;
    if (fmt === 'bracket') return BUILTIN_FALLBACKS.tournamentBracket;
    return BUILTIN_FALLBACKS.tournamentGeneric;
  }

  return null;
}

/**
 * Returns detailed resolution metadata for a tournament banner.
 */
export function resolveTournamentBannerDetails(
  tournament?: {
    banner_image_url?: string | null;
    resolved_banner_url?: string | null;
    format?: string | null;
  } | null,
  clubBranding?: ClubBranding | null,
  platformBanners?: Record<string, PlatformBanner> | null
): ImageResolutionDetails {
  if (tournament?.banner_image_url) {
    return {
      source: { uri: resolveMediaUrl(tournament.banner_image_url) },
      level: 'custom',
      url: tournament.banner_image_url,
    };
  }

  const fmt = (tournament?.format || '').toLowerCase().trim();

  // Club default
  let clubDefaultUrl: string | null = null;
  if (fmt === 'round_robin' && clubBranding?.default_tournament_round_robin_url) {
    clubDefaultUrl = clubBranding.default_tournament_round_robin_url;
  } else if (fmt === 'scramble' && clubBranding?.default_tournament_scramble_url) {
    clubDefaultUrl = clubBranding.default_tournament_scramble_url;
  } else if (fmt === 'pool_play' && clubBranding?.default_tournament_pool_play_url) {
    clubDefaultUrl = clubBranding.default_tournament_pool_play_url;
  } else if (fmt === 'bracket' && clubBranding?.default_tournament_bracket_url) {
    clubDefaultUrl = clubBranding.default_tournament_bracket_url;
  } else if (clubBranding?.default_tournament_banner_url) {
    clubDefaultUrl = clubBranding.default_tournament_banner_url;
  }

  if (clubDefaultUrl) {
    return {
      source: { uri: resolveMediaUrl(clubDefaultUrl) },
      level: 'club_default',
      url: clubDefaultUrl,
    };
  }

  // Platform default
  const activePlatformBanners = platformBanners ?? getCachedPlatformBanners();
  let platformDefaultUrl: string | null = null;
  if (fmt === 'round_robin' && activePlatformBanners?.default_tournament_round_robin?.image_url) {
    platformDefaultUrl = activePlatformBanners.default_tournament_round_robin.image_url;
  } else if (fmt === 'scramble' && activePlatformBanners?.default_tournament_scramble?.image_url) {
    platformDefaultUrl = activePlatformBanners.default_tournament_scramble.image_url;
  } else if (fmt === 'pool_play' && activePlatformBanners?.default_tournament_pool_play?.image_url) {
    platformDefaultUrl = activePlatformBanners.default_tournament_pool_play.image_url;
  } else if (fmt === 'bracket' && activePlatformBanners?.default_tournament_bracket?.image_url) {
    platformDefaultUrl = activePlatformBanners.default_tournament_bracket.image_url;
  } else if (activePlatformBanners?.default_tournament_banner?.image_url) {
    platformDefaultUrl = activePlatformBanners.default_tournament_banner.image_url;
  }

  if (platformDefaultUrl) {
    return {
      source: { uri: resolveMediaUrl(platformDefaultUrl) },
      level: 'platform_default',
      url: platformDefaultUrl,
    };
  }

  if (tournament?.resolved_banner_url) {
    return {
      source: { uri: resolveMediaUrl(tournament.resolved_banner_url) },
      level: 'platform_default',
      url: tournament.resolved_banner_url,
    };
  }

  const builtinSource =
    fmt === 'round_robin'
      ? BUILTIN_FALLBACKS.tournamentRoundRobin
      : fmt === 'scramble'
      ? BUILTIN_FALLBACKS.tournamentScramble
      : fmt === 'pool_play'
      ? BUILTIN_FALLBACKS.tournamentPoolPlay
      : fmt === 'bracket'
      ? BUILTIN_FALLBACKS.tournamentBracket
      : BUILTIN_FALLBACKS.tournamentGeneric;

  if (builtinSource) {
    return {
      source: builtinSource,
      level: 'platform_default',
      url: null,
    };
  }

  return {
    source: null,
    level: 'none',
    url: null,
  };
}

/**
 * Resolves a format-specific tournament default banner.
 */
export function resolveTournamentFormatDefault(
  format: 'round_robin' | 'scramble' | 'pool_play' | 'bracket' | 'general' | string,
  clubBranding?: ClubBranding | null,
  platformBanners?: Record<string, PlatformBanner> | null,
  options?: ImageResolutionOptions
): ImageSourcePropType | null {
  const fmt = format.toLowerCase().trim();
  const activePlatformBanners = platformBanners ?? getCachedPlatformBanners();

  if (fmt === 'round_robin') {
    if (clubBranding?.default_tournament_round_robin_url) {
      return { uri: resolveMediaUrl(clubBranding.default_tournament_round_robin_url) };
    }
    if (activePlatformBanners?.default_tournament_round_robin?.image_url) {
      return { uri: resolveMediaUrl(activePlatformBanners.default_tournament_round_robin.image_url) };
    }
    if (clubBranding?.default_tournament_banner_url) {
      return { uri: resolveMediaUrl(clubBranding.default_tournament_banner_url) };
    }
    if (activePlatformBanners?.default_tournament_banner?.image_url) {
      return { uri: resolveMediaUrl(activePlatformBanners.default_tournament_banner.image_url) };
    }
    return options?.allowBuiltinFallback !== false ? BUILTIN_FALLBACKS.tournamentRoundRobin : null;
  }
  if (fmt === 'scramble') {
    if (clubBranding?.default_tournament_scramble_url) {
      return { uri: resolveMediaUrl(clubBranding.default_tournament_scramble_url) };
    }
    if (activePlatformBanners?.default_tournament_scramble?.image_url) {
      return { uri: resolveMediaUrl(activePlatformBanners.default_tournament_scramble.image_url) };
    }
    if (clubBranding?.default_tournament_banner_url) {
      return { uri: resolveMediaUrl(clubBranding.default_tournament_banner_url) };
    }
    if (activePlatformBanners?.default_tournament_banner?.image_url) {
      return { uri: resolveMediaUrl(activePlatformBanners.default_tournament_banner.image_url) };
    }
    return options?.allowBuiltinFallback !== false ? BUILTIN_FALLBACKS.tournamentScramble : null;
  }
  if (fmt === 'pool_play') {
    if (clubBranding?.default_tournament_pool_play_url) {
      return { uri: resolveMediaUrl(clubBranding.default_tournament_pool_play_url) };
    }
    if (activePlatformBanners?.default_tournament_pool_play?.image_url) {
      return { uri: resolveMediaUrl(activePlatformBanners.default_tournament_pool_play.image_url) };
    }
    if (clubBranding?.default_tournament_banner_url) {
      return { uri: resolveMediaUrl(clubBranding.default_tournament_banner_url) };
    }
    if (activePlatformBanners?.default_tournament_banner?.image_url) {
      return { uri: resolveMediaUrl(activePlatformBanners.default_tournament_banner.image_url) };
    }
    return options?.allowBuiltinFallback !== false ? BUILTIN_FALLBACKS.tournamentPoolPlay : null;
  }
  if (fmt === 'bracket') {
    if (clubBranding?.default_tournament_bracket_url) {
      return { uri: resolveMediaUrl(clubBranding.default_tournament_bracket_url) };
    }
    if (activePlatformBanners?.default_tournament_bracket?.image_url) {
      return { uri: resolveMediaUrl(activePlatformBanners.default_tournament_bracket.image_url) };
    }
    if (clubBranding?.default_tournament_banner_url) {
      return { uri: resolveMediaUrl(clubBranding.default_tournament_banner_url) };
    }
    if (activePlatformBanners?.default_tournament_banner?.image_url) {
      return { uri: resolveMediaUrl(activePlatformBanners.default_tournament_bracket.image_url) };
    }
    return options?.allowBuiltinFallback !== false ? BUILTIN_FALLBACKS.tournamentBracket : null;
  }

  // General tournament default
  if (clubBranding?.default_tournament_banner_url) {
    return { uri: resolveMediaUrl(clubBranding.default_tournament_banner_url) };
  }
  if (activePlatformBanners?.default_tournament_banner?.image_url) {
    return { uri: resolveMediaUrl(activePlatformBanners.default_tournament_banner.image_url) };
  }
  return options?.allowBuiltinFallback !== false ? BUILTIN_FALLBACKS.tournamentGeneric : null;
}

/**
 * Resolves a league picture following strict priority:
 * 1. league.banner_image_url (custom item image)
 * 2. club default_league_banner_url (configured in Club Details -> Branding)
 * 3. platform default_league_banner (configured in Platform Admin Banners)
 * 4. backend pre-resolved fallback
 * 5. deliberate built-in fallback (if options.allowBuiltinFallback)
 * 6. null (clean neutral no-image state)
 */
export function resolveLeaguePicture(
  league?: { banner_image_url?: string | null; resolved_banner_url?: string | null } | string | null,
  clubBranding?: ClubBranding | null,
  platformBanners?: Record<string, PlatformBanner> | null,
  options?: ImageResolutionOptions
): ImageSourcePropType | null {
  const customUrl = typeof league === 'string' ? league : league?.banner_image_url;
  if (customUrl) {
    return { uri: resolveMediaUrl(customUrl) };
  }
  if (clubBranding?.default_league_banner_url) {
    return { uri: resolveMediaUrl(clubBranding.default_league_banner_url) };
  }
  const activePlatformBanners = platformBanners ?? getCachedPlatformBanners();
  if (activePlatformBanners?.default_league_banner?.image_url) {
    return { uri: resolveMediaUrl(activePlatformBanners.default_league_banner.image_url) };
  }
  if (typeof league === 'object' && league?.resolved_banner_url) {
    return { uri: resolveMediaUrl(league.resolved_banner_url) };
  }
  return options?.allowBuiltinFallback !== false ? BUILTIN_FALLBACKS.league : null;
}

export const resolveLeagueBanner = resolveLeaguePicture;

/**
 * Resolves an event picture following strict priority:
 * 1. event.cover_image_url (custom item image)
 * 2. club default_event_banner_url (configured in Club Details -> Branding)
 * 3. platform default_event_banner (configured in Platform Admin Banners)
 * 4. backend pre-resolved fallback
 * 5. deliberate built-in fallback (Platform Admin Built-in Default)
 * 6. null (clean neutral no-image state)
 */
export function resolveEventPicture(
  event?: { cover_image_url?: string | null; resolved_cover_image_url?: string | null } | string | null,
  clubBranding?: ClubBranding | null,
  platformBanners?: Record<string, PlatformBanner> | null,
  options?: ImageResolutionOptions
): ImageSourcePropType | null {
  const customUrl = typeof event === 'string' ? event : event?.cover_image_url;
  if (customUrl) {
    return { uri: resolveMediaUrl(customUrl) };
  }
  if (clubBranding?.default_event_banner_url) {
    return { uri: resolveMediaUrl(clubBranding.default_event_banner_url) };
  }
  const activePlatformBanners = platformBanners ?? getCachedPlatformBanners();
  if (activePlatformBanners?.default_event_banner?.image_url) {
    return { uri: resolveMediaUrl(activePlatformBanners.default_event_banner.image_url) };
  }
  if (typeof event === 'object' && event?.resolved_cover_image_url) {
    return { uri: resolveMediaUrl(event.resolved_cover_image_url) };
  }
  return options?.allowBuiltinFallback !== false ? BUILTIN_FALLBACKS.event : null;
}

export const resolveEventCover = resolveEventPicture;

/**
 * Resolves a lesson/coaching picture following strict priority:
 * 1. lesson.image_url (custom session image)
 * 2. lesson.lesson_type?.image_url (lesson template picture)
 * 3. club default_lesson_banner_url (configured in Club Details -> Branding)
 * 4. platform default_lesson_banner (configured in Platform Admin Banners)
 * 5. backend pre-resolved fallback
 * 6. deliberate built-in fallback (Platform Admin Built-in Default)
 * 7. null (clean neutral no-image state)
 */
export function resolveLessonPicture(
  lesson?: {
    image_url?: string | null;
    resolved_image_url?: string | null;
    lesson_type?: { image_url?: string | null } | null;
  } | string | null,
  clubBranding?: ClubBranding | null,
  platformBanners?: Record<string, PlatformBanner> | null,
  options?: ImageResolutionOptions
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
  const activePlatformBanners = platformBanners ?? getCachedPlatformBanners();
  if (activePlatformBanners?.default_lesson_banner?.image_url) {
    return { uri: resolveMediaUrl(activePlatformBanners.default_lesson_banner.image_url) };
  }
  if (typeof lesson === 'object' && lesson?.resolved_image_url) {
    return { uri: resolveMediaUrl(lesson.resolved_image_url) };
  }
  return options?.allowBuiltinFallback !== false ? BUILTIN_FALLBACKS.lesson : null;
}

export const resolveLessonImage = resolveLessonPicture;
export const resolveTournamentPicture = resolveTournamentBanner;

/**
 * Resolves the court picture:
 * Displays the uploaded court photo ONLY.
 * NEVER falls back to club defaults, platform defaults, or generic stock images.
 * Returns null if no court photo exists.
 */
export function resolveCourtPicture(
  court?: { image_url?: string | null } | string | null
): ImageSourcePropType | null {
  const customUrl = typeof court === 'string' ? court : court?.image_url;
  if (customUrl) {
    return { uri: resolveMediaUrl(customUrl) };
  }
  return null;
}

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
 * Strictly isolated: NEVER falls back to platform content defaults.
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
 * Strictly isolated: NEVER falls back to platform content defaults.
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
