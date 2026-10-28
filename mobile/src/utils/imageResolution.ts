/**
 * Aught2 Pickleball — Image Resolution & Fallback Engine
 *
 * Implements strict 3-tier image resolution across the entire application:
 * 1. Activity-specific custom image (if uploaded)
 * 2. Club-specific category/format default (if configured in Branding & Assets)
 * 3. Built-in platform fallback asset
 *
 * Separation of concerns:
 * - Club Logo: public identity, displayed in avatar/badge areas
 * - Player-Facing Club Cover: displayed on Player App club detail page
 * - Owner Home Banner: displayed on Owner Dashboard welcome section
 * - Activity Defaults: tournament format banners, league banner, event cover, lesson image
 */

import { ImageSourcePropType } from 'react-native';
import type { ClubBranding } from '@/types';
import { resolveMediaUrl } from './media';

export const BUILTIN_FALLBACKS = {
  ownerBanner: require('../../assets/events/pickleball_hero.jpg'),
  tournamentRoundRobin: require('../../assets/tournaments/card_round_robin.jpg'),
  tournamentScramble: require('../../assets/tournaments/banner2.jpg'),
  tournamentPoolPlay: require('../../assets/tournaments/card_pool_play.jpg'),
  tournamentBracket: require('../../assets/tournaments/card_bracket.jpg'),
  tournamentGeneric: require('../../assets/tournaments/hero_discover_banner.jpg'),
  league: require('../../assets/leagues/card1.jpg'),
  event: require('../../assets/events/pickleball_hero.jpg'),
  lesson: require('../../assets/lessons/card1.jpg'),
  clubCover: require('../../assets/events/pickleball_hero.jpg'),
};

/**
 * Resolves the tournament banner following:
 * 1. tournament.banner_image_url
 * 2. club format default (round_robin, scramble, pool_play, bracket)
 * 3. format built-in fallback
 */
export function resolveTournamentBanner(
  tournament?: {
    banner_image_url?: string | null;
    format?: string | null;
  } | null,
  clubBranding?: ClubBranding | null
): ImageSourcePropType {
  if (tournament?.banner_image_url) {
    return { uri: resolveMediaUrl(tournament.banner_image_url) };
  }

  const fmt = (tournament?.format || '').toLowerCase().trim();

  if (fmt === 'round_robin') {
    if (clubBranding?.default_tournament_round_robin_url) {
      return { uri: resolveMediaUrl(clubBranding.default_tournament_round_robin_url) };
    }
    return BUILTIN_FALLBACKS.tournamentRoundRobin;
  }

  if (fmt === 'scramble') {
    if (clubBranding?.default_tournament_scramble_url) {
      return { uri: resolveMediaUrl(clubBranding.default_tournament_scramble_url) };
    }
    return BUILTIN_FALLBACKS.tournamentScramble;
  }

  if (fmt === 'pool_play') {
    if (clubBranding?.default_tournament_pool_play_url) {
      return { uri: resolveMediaUrl(clubBranding.default_tournament_pool_play_url) };
    }
    return BUILTIN_FALLBACKS.tournamentPoolPlay;
  }

  if (fmt === 'bracket') {
    if (clubBranding?.default_tournament_bracket_url) {
      return { uri: resolveMediaUrl(clubBranding.default_tournament_bracket_url) };
    }
    return BUILTIN_FALLBACKS.tournamentBracket;
  }

  return BUILTIN_FALLBACKS.tournamentGeneric;
}

/**
 * Resolves a format-specific tournament default banner for a club.
 */
export function resolveTournamentFormatDefault(
  format: 'round_robin' | 'scramble' | 'pool_play' | 'bracket' | string,
  clubBranding?: ClubBranding | null
): ImageSourcePropType {
  const fmt = format.toLowerCase().trim();
  if (fmt === 'round_robin') {
    if (clubBranding?.default_tournament_round_robin_url) {
      return { uri: resolveMediaUrl(clubBranding.default_tournament_round_robin_url) };
    }
    return BUILTIN_FALLBACKS.tournamentRoundRobin;
  }
  if (fmt === 'scramble') {
    if (clubBranding?.default_tournament_scramble_url) {
      return { uri: resolveMediaUrl(clubBranding.default_tournament_scramble_url) };
    }
    return BUILTIN_FALLBACKS.tournamentScramble;
  }
  if (fmt === 'pool_play') {
    if (clubBranding?.default_tournament_pool_play_url) {
      return { uri: resolveMediaUrl(clubBranding.default_tournament_pool_play_url) };
    }
    return BUILTIN_FALLBACKS.tournamentPoolPlay;
  }
  if (fmt === 'bracket') {
    if (clubBranding?.default_tournament_bracket_url) {
      return { uri: resolveMediaUrl(clubBranding.default_tournament_bracket_url) };
    }
    return BUILTIN_FALLBACKS.tournamentBracket;
  }
  return BUILTIN_FALLBACKS.tournamentGeneric;
}

/**
 * Resolves a league picture following:
 * 1. league.banner_image_url (custom activity picture)
 * 2. club default_league_banner_url (club category default picture)
 * 3. built-in league fallback picture
 */
export function resolveLeaguePicture(
  league?: { banner_image_url?: string | null } | string | null,
  clubBranding?: ClubBranding | null
): ImageSourcePropType {
  const customUrl = typeof league === 'string' ? league : league?.banner_image_url;
  if (customUrl) {
    return { uri: resolveMediaUrl(customUrl) };
  }
  if (clubBranding?.default_league_banner_url) {
    return { uri: resolveMediaUrl(clubBranding.default_league_banner_url) };
  }
  return BUILTIN_FALLBACKS.league;
}

export const resolveLeagueBanner = resolveLeaguePicture;

/**
 * Resolves an event picture following:
 * 1. event.cover_image_url (custom activity picture)
 * 2. club default_event_banner_url (club category default picture)
 * 3. built-in event fallback picture
 */
export function resolveEventPicture(
  event?: { cover_image_url?: string | null } | string | null,
  clubBranding?: ClubBranding | null
): ImageSourcePropType {
  const customUrl = typeof event === 'string' ? event : event?.cover_image_url;
  if (customUrl) {
    return { uri: resolveMediaUrl(customUrl) };
  }
  if (clubBranding?.default_event_banner_url) {
    return { uri: resolveMediaUrl(clubBranding.default_event_banner_url) };
  }
  return BUILTIN_FALLBACKS.event;
}

export const resolveEventCover = resolveEventPicture;

/**
 * Resolves a lesson/coaching picture following:
 * 1. lesson.image_url (custom activity picture)
 * 2. lesson.lesson_type?.image_url (lesson template picture)
 * 3. club default_lesson_banner_url (club category default picture)
 * 4. built-in lesson fallback picture
 */
export function resolveLessonPicture(
  lesson?: {
    image_url?: string | null;
    lesson_type?: { image_url?: string | null } | null;
  } | string | null,
  clubBranding?: ClubBranding | null
): ImageSourcePropType {
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
  return BUILTIN_FALLBACKS.lesson;
}

export const resolveLessonImage = resolveLessonPicture;

export const resolveTournamentPicture = resolveTournamentBanner;

/**
 * Resolves the owner home dashboard welcome card banner:
 * 1. platformBanner.image_url (Global Platform Admin configured banner)
 * 2. built-in owner banner fallback
 */
export function resolveOwnerBanner(
  platformBannerOrBranding?: { image_url?: string | null; owner_banner_url?: string | null } | null
): ImageSourcePropType {
  if (platformBannerOrBranding?.image_url) {
    return { uri: resolveMediaUrl(platformBannerOrBranding.image_url) };
  }
  if (platformBannerOrBranding?.owner_banner_url) {
    return { uri: resolveMediaUrl(platformBannerOrBranding.owner_banner_url) };
  }
  return BUILTIN_FALLBACKS.ownerBanner;
}

/**
 * Resolves the public player-facing club cover banner:
 * 1. club.cover_image_url
 * 2. built-in club cover fallback
 */
export function resolveClubCover(
  clubOrBranding?: { cover_image_url?: string | null } | null
): ImageSourcePropType {
  if (clubOrBranding?.cover_image_url) {
    return { uri: resolveMediaUrl(clubOrBranding.cover_image_url) };
  }
  return BUILTIN_FALLBACKS.clubCover;
}
