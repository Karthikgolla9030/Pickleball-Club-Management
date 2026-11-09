/**
 * Aught2 Pickleball — Image Resolution Test Suite
 *
 * Verifies the strict 4-level priority hierarchy across all supported categories:
 * - Priority 1: Individual custom image
 * - Priority 2: Club-specific default
 * - Priority 3: Platform Admin default (Custom uploaded or Built-in default)
 * - Priority 4: Clean neutral no-image state (null)
 *
 * Covers:
 * - All Tournament Formats: Round Robin, Scramble, Pool Play, Bracket, General
 * - All Activities: Leagues, Events, Lessons & Coaching
 * - Special Rules: Courts, Club Logo, Club Cover (strictly no defaults, null when unconfigured)
 */

import {
  resolveTournamentBanner,
  resolveTournamentBannerDetails,
  resolveTournamentFormatDefault,
  resolveLeaguePicture,
  resolveEventPicture,
  resolveLessonPicture,
  resolveCourtPicture,
  resolveClubLogo,
  resolveClubCover,
  BUILTIN_FALLBACKS,
} from '../imageResolution';
import type { ClubBranding, PlatformBanner } from '@/types';

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    throw new Error(`Test failed: ${msg}`);
  }
}

export function runImageResolutionTests(): void {
  console.log('Running image resolution hierarchy tests...');

  const dummyClubBranding: ClubBranding = {
    club_id: 'club-123',
    name: 'Metro Pickleball Club',
    logo_url: 'https://cdn.example.com/club-logo.png',
    cover_image_url: 'https://cdn.example.com/club-cover.jpg',
    owner_banner_url: 'https://cdn.example.com/club-owner.jpg',
    default_tournament_banner_url: 'https://cdn.example.com/club-tour-general.jpg',
    default_tournament_round_robin_url: 'https://cdn.example.com/club-rr.jpg',
    default_tournament_scramble_url: 'https://cdn.example.com/club-scramble.jpg',
    default_tournament_pool_play_url: 'https://cdn.example.com/club-pool.jpg',
    default_tournament_bracket_url: 'https://cdn.example.com/club-bracket.jpg',
    default_league_banner_url: 'https://cdn.example.com/club-league.jpg',
    default_event_banner_url: 'https://cdn.example.com/club-event.jpg',
    default_lesson_banner_url: 'https://cdn.example.com/club-lesson.jpg',
    has_custom_logo: true,
    has_custom_cover: true,
    has_custom_owner_banner: true,
    has_custom_tournament_banner: true,
    has_custom_tournament_round_robin: true,
    has_custom_tournament_scramble: true,
    has_custom_tournament_pool_play: true,
    has_custom_tournament_bracket: true,
    has_custom_league_banner: true,
    has_custom_event_banner: true,
    has_custom_lesson_banner: true,
  };

  const emptyClubBranding: ClubBranding = {
    club_id: 'club-empty',
    name: 'Empty Club',
    logo_url: null,
    cover_image_url: null,
    owner_banner_url: null,
    default_tournament_banner_url: null,
    default_tournament_round_robin_url: null,
    default_tournament_scramble_url: null,
    default_tournament_pool_play_url: null,
    default_tournament_bracket_url: null,
    default_league_banner_url: null,
    default_event_banner_url: null,
    default_lesson_banner_url: null,
    has_custom_logo: false,
    has_custom_cover: false,
    has_custom_owner_banner: false,
    has_custom_tournament_banner: false,
    has_custom_tournament_round_robin: false,
    has_custom_tournament_scramble: false,
    has_custom_tournament_pool_play: false,
    has_custom_tournament_bracket: false,
    has_custom_league_banner: false,
    has_custom_event_banner: false,
    has_custom_lesson_banner: false,
  };

  const platformBannersWithCustom: Record<string, PlatformBanner> = {
    default_tournament_round_robin: {
      id: 'pb-1',
      banner_type: 'default_tournament_round_robin',
      image_url: 'https://platform.example.com/custom-rr.jpg',
      is_active: true,
      created_at: '',
      updated_at: '',
    },
    default_tournament_scramble: {
      id: 'pb-2',
      banner_type: 'default_tournament_scramble',
      image_url: 'https://platform.example.com/custom-scramble.jpg',
      is_active: true,
      created_at: '',
      updated_at: '',
    },
    default_league_banner: {
      id: 'pb-3',
      banner_type: 'default_league_banner',
      image_url: 'https://platform.example.com/custom-league.jpg',
      is_active: true,
      created_at: '',
      updated_at: '',
    },
    default_event_banner: {
      id: 'pb-4',
      banner_type: 'default_event_banner',
      image_url: 'https://platform.example.com/custom-event.jpg',
      is_active: true,
      created_at: '',
      updated_at: '',
    },
    default_lesson_banner: {
      id: 'pb-5',
      banner_type: 'default_lesson_banner',
      image_url: 'https://platform.example.com/custom-lesson.jpg',
      is_active: true,
      created_at: '',
      updated_at: '',
    },
  };

  const platformBannersBuiltinOnly: Record<string, PlatformBanner> = {
    default_tournament_round_robin: {
      id: 'pb-1',
      banner_type: 'default_tournament_round_robin',
      image_url: null, // Built-in default active
      is_active: true,
      created_at: '',
      updated_at: '',
    },
  };

  const platformBannersWithResolvedUrl: Record<string, PlatformBanner> = {
    default_tournament_round_robin: {
      id: 'pb-1',
      banner_type: 'default_tournament_round_robin',
      image_url: null,
      resolved_image_url: 'https://cdn.example.com/custom_platform/rr.png',
      default_image_url: 'https://cdn.example.com/custom_platform/rr.png',
      is_active: true,
      created_at: '',
      updated_at: '',
    },
    default_tournament_bracket: {
      id: 'pb-2',
      banner_type: 'default_tournament_bracket',
      image_url: null,
      resolved_image_url: 'https://cdn.example.com/custom_platform/bracket.png',
      default_image_url: 'https://cdn.example.com/custom_platform/bracket.png',
      is_active: true,
      created_at: '',
      updated_at: '',
    },
  };

  const platformBannersWithBuiltinBackendUrl: Record<string, PlatformBanner> = {
    default_tournament_round_robin: {
      id: 'pb-1',
      banner_type: 'default_tournament_round_robin',
      image_url: null,
      resolved_image_url: 'https://pickleball-club-management.onrender.com/uploads/defaults/tournaments/card_round_robin.jpg',
      default_image_url: '/uploads/defaults/tournaments/card_round_robin.jpg',
      is_active: true,
      created_at: '',
      updated_at: '',
    },
  };

  // ─── 1. TOURNAMENTS: ROUND ROBIN ──────────────────────────────────────────

  // Priority 1 - Individual Custom Image overrides all
  const res1 = resolveTournamentBanner(
    { banner_image_url: 'https://cdn.example.com/item-custom.jpg', format: 'round_robin' },
    dummyClubBranding,
    platformBannersWithCustom
  );
  assert((res1 as any)?.uri === 'https://cdn.example.com/item-custom.jpg', 'Round Robin Priority 1 custom failed');

  // Priority 2 - Club default overrides Platform Admin default when no custom image
  const res2 = resolveTournamentBanner(
    { banner_image_url: null, format: 'round_robin' },
    dummyClubBranding,
    platformBannersWithCustom
  );
  assert((res2 as any)?.uri === 'https://cdn.example.com/club-rr.jpg', 'Round Robin Priority 2 club default failed');

  // Priority 3A - Platform Admin custom image used when Club default not configured
  const res3A = resolveTournamentBanner(
    { banner_image_url: null, format: 'round_robin' },
    emptyClubBranding,
    platformBannersWithCustom
  );
  assert((res3A as any)?.uri === 'https://platform.example.com/custom-rr.jpg', 'Round Robin Priority 3A platform custom failed');

  // Priority 3B - Platform Admin built-in default used when Club default not configured
  const res3B = resolveTournamentBanner(
    { banner_image_url: null, format: 'round_robin' },
    emptyClubBranding,
    platformBannersBuiltinOnly
  );
  assert(res3B === BUILTIN_FALLBACKS.tournamentRoundRobin, 'Round Robin Priority 3B built-in fallback failed');

  // Priority 3C - Platform Admin resolved_image_url used when Club default not configured
  const res3C = resolveTournamentBanner(
    { banner_image_url: null, format: 'round_robin' },
    emptyClubBranding,
    platformBannersWithResolvedUrl
  );
  assert((res3C as any)?.uri === 'https://cdn.example.com/custom_platform/rr.png', 'Round Robin Priority 3C resolved_image_url failed');

  // Priority 3D - Bracket uses default_tournament_bracket, NOT general banner
  const res3BracketResolved = resolveTournamentBanner(
    { banner_image_url: null, format: 'bracket' },
    emptyClubBranding,
    platformBannersWithResolvedUrl
  );
  assert((res3BracketResolved as any)?.uri === 'https://cdn.example.com/custom_platform/bracket.png', 'Bracket Priority 3D resolved_image_url failed');

  // Priority 3E - Built-in default path in resolved_image_url maps to local bundled asset directly
  const res3EBuiltin = resolveTournamentBanner(
    { banner_image_url: null, format: 'round_robin' },
    emptyClubBranding,
    platformBannersWithBuiltinBackendUrl
  );
  assert(res3EBuiltin === BUILTIN_FALLBACKS.tournamentRoundRobin, 'Round Robin Priority 3E built-in path mapping failed');

  // Priority 3F - Resolves built-in default even when platformBanners is null/empty and club is empty
  const res3F = resolveTournamentBanner(
    { banner_image_url: null, format: 'round_robin' },
    emptyClubBranding,
    null
  );
  assert(res3F === BUILTIN_FALLBACKS.tournamentRoundRobin, 'Round Robin Priority 3F offline built-in fallback failed');

  // Format Aliases & Normalization
  const resAlias1 = resolveTournamentBanner({ format: 'Round Robin' }, emptyClubBranding, platformBannersWithResolvedUrl);
  assert((resAlias1 as any)?.uri === 'https://cdn.example.com/custom_platform/rr.png', 'Format alias "Round Robin" failed');

  const resAlias2 = resolveTournamentBanner({ format: 'round-robin' }, emptyClubBranding, platformBannersWithResolvedUrl);
  assert((resAlias2 as any)?.uri === 'https://cdn.example.com/custom_platform/rr.png', 'Format alias "round-robin" failed');

  const resAlias3 = resolveTournamentBanner({ format: 'Single Elimination Bracket' }, emptyClubBranding, platformBannersWithResolvedUrl);
  assert((resAlias3 as any)?.uri === 'https://cdn.example.com/custom_platform/bracket.png', 'Format alias "Single Elimination Bracket" failed');

  // Priority 4 - Neutral no-image state when allowBuiltinFallback is false
  const resNeutral = resolveTournamentBanner(
    { banner_image_url: null, format: 'unknown_format' },
    emptyClubBranding,
    {},
    { allowBuiltinFallback: false }
  );
  assert(resNeutral === null, 'Priority 4 neutral state must be null when allowBuiltinFallback is false');

  // ─── 2. TOURNAMENTS: ALL OTHER FORMATS ────────────────────────────────────

  // Scramble
  const resScrambleClub = resolveTournamentBanner({ format: 'scramble' }, dummyClubBranding, null);
  assert((resScrambleClub as any)?.uri === 'https://cdn.example.com/club-scramble.jpg', 'Scramble club default failed');

  const resScramblePlat = resolveTournamentBanner({ format: 'scramble' }, emptyClubBranding, platformBannersWithCustom);
  assert((resScramblePlat as any)?.uri === 'https://platform.example.com/custom-scramble.jpg', 'Scramble platform custom failed');

  const resScrambleBuiltin = resolveTournamentBanner({ format: 'scramble' }, emptyClubBranding, null);
  assert(resScrambleBuiltin === BUILTIN_FALLBACKS.tournamentScramble, 'Scramble built-in fallback failed');

  // Pool Play
  const resPoolClub = resolveTournamentBanner({ format: 'pool_play' }, dummyClubBranding, null);
  assert((resPoolClub as any)?.uri === 'https://cdn.example.com/club-pool.jpg', 'Pool play club default failed');

  const resPoolBuiltin = resolveTournamentBanner({ format: 'pool_play' }, emptyClubBranding, null);
  assert(resPoolBuiltin === BUILTIN_FALLBACKS.tournamentPoolPlay, 'Pool play built-in fallback failed');

  // Bracket
  const resBracketClub = resolveTournamentBanner({ format: 'bracket' }, dummyClubBranding, null);
  assert((resBracketClub as any)?.uri === 'https://cdn.example.com/club-bracket.jpg', 'Bracket club default failed');

  const resBracketBuiltin = resolveTournamentBanner({ format: 'bracket' }, emptyClubBranding, null);
  assert(resBracketBuiltin === BUILTIN_FALLBACKS.tournamentBracket, 'Bracket built-in fallback failed');

  // General Tournament
  const resGeneralClub = resolveTournamentBanner({ format: 'custom_format' }, dummyClubBranding, null);
  assert((resGeneralClub as any)?.uri === 'https://cdn.example.com/club-tour-general.jpg', 'General tournament club default failed');

  const resGeneralBuiltin = resolveTournamentBanner({ format: 'custom_format' }, emptyClubBranding, null);
  assert(resGeneralBuiltin === BUILTIN_FALLBACKS.tournamentGeneric, 'General tournament built-in fallback failed');

  // ─── 3. ACTIVITIES: LEAGUES ───────────────────────────────────────────────

  const resLeagueCustom = resolveLeaguePicture({ banner_image_url: 'https://cdn.example.com/custom-league.jpg' }, dummyClubBranding, platformBannersWithCustom);
  assert((resLeagueCustom as any)?.uri === 'https://cdn.example.com/custom-league.jpg', 'League custom failed');

  const resLeagueClub = resolveLeaguePicture({ banner_image_url: null }, dummyClubBranding, platformBannersWithCustom);
  assert((resLeagueClub as any)?.uri === 'https://cdn.example.com/club-league.jpg', 'League club default failed');

  const resLeaguePlat = resolveLeaguePicture({ banner_image_url: null }, emptyClubBranding, platformBannersWithCustom);
  assert((resLeaguePlat as any)?.uri === 'https://platform.example.com/custom-league.jpg', 'League platform custom failed');

  const resLeagueBuiltin = resolveLeaguePicture({ banner_image_url: null }, emptyClubBranding, null);
  assert(resLeagueBuiltin === BUILTIN_FALLBACKS.league, 'League built-in fallback failed');

  // ─── 4. ACTIVITIES: EVENTS ────────────────────────────────────────────────

  const resEventCustom = resolveEventPicture({ cover_image_url: 'https://cdn.example.com/custom-event.jpg' }, dummyClubBranding, platformBannersWithCustom);
  assert((resEventCustom as any)?.uri === 'https://cdn.example.com/custom-event.jpg', 'Event custom failed');

  const resEventClub = resolveEventPicture({ cover_image_url: null }, dummyClubBranding, platformBannersWithCustom);
  assert((resEventClub as any)?.uri === 'https://cdn.example.com/club-event.jpg', 'Event club default failed');

  const resEventPlat = resolveEventPicture({ cover_image_url: null }, emptyClubBranding, platformBannersWithCustom);
  assert((resEventPlat as any)?.uri === 'https://platform.example.com/custom-event.jpg', 'Event platform custom failed');

  const resEventBuiltin = resolveEventPicture({ cover_image_url: null }, emptyClubBranding, null);
  assert(resEventBuiltin === BUILTIN_FALLBACKS.event, 'Event built-in fallback failed');

  // ─── 5. ACTIVITIES: LESSONS & COACHING ────────────────────────────────────

  const resLessonCustom = resolveLessonPicture({ image_url: 'https://cdn.example.com/custom-lesson.jpg' }, dummyClubBranding, platformBannersWithCustom);
  assert((resLessonCustom as any)?.uri === 'https://cdn.example.com/custom-lesson.jpg', 'Lesson custom failed');

  const resLessonType = resolveLessonPicture({ image_url: null, lesson_type: { image_url: 'https://cdn.example.com/type-lesson.jpg' } }, dummyClubBranding, platformBannersWithCustom);
  assert((resLessonType as any)?.uri === 'https://cdn.example.com/type-lesson.jpg', 'Lesson template picture failed');

  const resLessonClub = resolveLessonPicture({ image_url: null }, dummyClubBranding, platformBannersWithCustom);
  assert((resLessonClub as any)?.uri === 'https://cdn.example.com/club-lesson.jpg', 'Lesson club default failed');

  const resLessonPlat = resolveLessonPicture({ image_url: null }, emptyClubBranding, platformBannersWithCustom);
  assert((resLessonPlat as any)?.uri === 'https://platform.example.com/custom-lesson.jpg', 'Lesson platform custom failed');

  const resLessonBuiltin = resolveLessonPicture({ image_url: null }, emptyClubBranding, null);
  assert(resLessonBuiltin === BUILTIN_FALLBACKS.lesson, 'Lesson built-in fallback failed');

  // ─── 6. SPECIAL RULES: COURTS & CLUB IDENTITY (STRICTLY NO FALLBACKS) ─────

  const resCourtCustom = resolveCourtPicture({ image_url: 'https://cdn.example.com/court1.jpg' });
  assert((resCourtCustom as any)?.uri === 'https://cdn.example.com/court1.jpg', 'Court custom failed');

  const resCourtEmpty = resolveCourtPicture({ image_url: null });
  assert(resCourtEmpty === null, 'Court empty must be null');

  const resCourtNull = resolveCourtPicture(null);
  assert(resCourtNull === null, 'Court null must be null');

  const resLogoCustom = resolveClubLogo(dummyClubBranding);
  assert((resLogoCustom as any)?.uri === 'https://cdn.example.com/club-logo.png', 'Club logo custom failed');

  const resLogoEmpty = resolveClubLogo(emptyClubBranding);
  assert(resLogoEmpty === null, 'Club logo empty must be null');

  const resCoverCustom = resolveClubCover(dummyClubBranding);
  assert((resCoverCustom as any)?.uri === 'https://cdn.example.com/club-cover.jpg', 'Club cover custom failed');

  const resCoverEmpty = resolveClubCover(emptyClubBranding);
  assert(resCoverEmpty === null, 'Club cover empty must be null');

  // ─── 7. METADATA DETAILS RESOLVER ─────────────────────────────────────────

  const dCustom = resolveTournamentBannerDetails({ banner_image_url: 'https://cdn.example.com/custom.jpg', format: 'round_robin' }, dummyClubBranding);
  assert(dCustom.level === 'custom' && dCustom.url === 'https://cdn.example.com/custom.jpg', 'Details custom failed');

  const dClub = resolveTournamentBannerDetails({ banner_image_url: null, format: 'round_robin' }, dummyClubBranding);
  assert(dClub.level === 'club_default' && dClub.url === 'https://cdn.example.com/club-rr.jpg', 'Details club default failed');

  const dPlat = resolveTournamentBannerDetails({ banner_image_url: null, format: 'round_robin' }, emptyClubBranding, platformBannersWithCustom);
  assert(dPlat.level === 'platform_default' && dPlat.url === 'https://platform.example.com/custom-rr.jpg', 'Details platform custom failed');

  const dBuiltin = resolveTournamentBannerDetails({ banner_image_url: null, format: 'round_robin' }, emptyClubBranding, null);
  assert(dBuiltin.level === 'platform_default' && dBuiltin.source === BUILTIN_FALLBACKS.tournamentRoundRobin, 'Details platform built-in failed');

  console.log('✅ ALL IMAGE RESOLUTION HIERARCHY TESTS PASSED SUCCESSFULLY!');
}

// Auto-run when executed directly or imported
runImageResolutionTests();

