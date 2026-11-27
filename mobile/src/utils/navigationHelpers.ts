import { Platform } from 'react-native';
import { isPlatformAdminEmail } from '@/constants';
import type { MembershipInfo } from '@/types';

export interface RoleContext {
  isAuthenticated: boolean;
  isPlatformAdmin: boolean;
  hasClubStaff: boolean;
  activeMembership?: MembershipInfo | null;
  memberships?: MembershipInfo[];
}

export function resolveRoleContext(params: {
  isAuthenticated: boolean;
  user?: { email?: string | null; is_platform_admin?: boolean } | null;
  memberships?: MembershipInfo[] | null;
  activeMembership?: MembershipInfo | null;
  activePortal?: string | null;
}): RoleContext {
  const memberships = params.memberships || [];
  const isPlatformAdmin = Boolean(
    params.user?.is_platform_admin ||
      isPlatformAdminEmail(params.user?.email) ||
      params.activePortal === 'platform'
  );
  const hasClubStaff = memberships.length > 0 && !isPlatformAdmin;
  const activeMembership = params.activeMembership || memberships[0] || null;
  return {
    isAuthenticated: params.isAuthenticated,
    isPlatformAdmin,
    hasClubStaff,
    activeMembership,
    memberships,
  };
}

export function getClubRedirectTarget(membership?: MembershipInfo | null): string {
  if (!membership) return '/club-portal';
  if (membership.role === 'tournament_director' && !membership.custom_role_id) {
    return '/club-portal/tournaments';
  }
  if (membership.custom_role_id && Array.isArray(membership.permissions)) {
    const perms = new Set(membership.permissions);
    const hasClubOps =
      perms.has('manage_club') ||
      perms.has('manage_bookings') ||
      perms.has('manage_members') ||
      perms.has('manage_courts');
    if (!hasClubOps && perms.has('manage_tournaments')) {
      return '/club-portal/tournaments';
    }
  }
  return '/club-portal';
}

export function getDefaultHomeForRole(role: Pick<RoleContext, 'isPlatformAdmin' | 'hasClubStaff' | 'activeMembership'>): string {
  if (role.isPlatformAdmin) return '/platform';
  if (role.hasClubStaff) return getClubRedirectTarget(role.activeMembership);
  return '/player';
}

/**
 * Translates legacy route group paths (`/(player)/...`, `/(club)/...`, `/(auth)/...`)
 * still returned by older backend records (notifications, banners, payment return URLs)
 * into their canonical URL routes (`/player/...`, `/club-portal/...`).
 */
export function normalizeAppRoute(rawRoute?: string | null): string | null {
  if (!rawRoute || typeof rawRoute !== 'string') return null;
  let route = rawRoute.trim();
  if (!route) return null;

  // Preserve query/hash cleanly
  route = route
    .replace(/\/\(player\)\//g, '/player/')
    .replace(/\/\(player\)(?=$|[?#])/g, '/player')
    .replace(/\/\(club\)\//g, '/club-portal/')
    .replace(/\/\(club\)(?=$|[?#])/g, '/club-portal')
    .replace(/\/\(auth\)\//g, '/')
    .replace(/\/\(auth\)(?=$|[?#])/g, '/');

  return route;
}

const AUTH_PREFIXES = ['/login', '/register', '/register-club', '/club-application-status', '/forgot-password', '/reset-password', '/platform/login'];

export function isAuthPath(path: string): boolean {
  const clean = path.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  return AUTH_PREFIXES.some((prefix) => clean === prefix || clean.startsWith(`${prefix}/`));
}

export function isSafeInternalRedirect(redirect?: string | null): redirect is string {
  if (!redirect || typeof redirect !== 'string') return false;
  const trimmed = redirect.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('://')) {
    return false;
  }
  if (isAuthPath(trimmed) || trimmed === '/') return false;
  return true;
}

export function isRedirectAllowedForRole(
  redirect: string,
  role: Pick<RoleContext, 'isPlatformAdmin' | 'hasClubStaff'>
): boolean {
  if (!isSafeInternalRedirect(redirect)) return false;
  const normalized = normalizeAppRoute(redirect) || redirect;
  const pathOnly = normalized.split('?')[0].split('#')[0];

  if (pathOnly.startsWith('/club/') || pathOnly === '/club' || pathOnly.startsWith('/legal/')) {
    return true;
  }
  if (role.isPlatformAdmin) {
    return pathOnly === '/platform' || pathOnly.startsWith('/platform/');
  }
  if (role.hasClubStaff) {
    return pathOnly === '/club-portal' || pathOnly.startsWith('/club-portal/');
  }
  return (
    pathOnly === '/player' ||
    pathOnly.startsWith('/player/') ||
    pathOnly === '/club-portal/register-club'
  );
}

/**
 * Returns the current relative path + search query without storing any tokens or sensitive fields.
 */
export function getCurrentRelativeUrl(fallbackPathname: string): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.pathname || fallbackPathname}${window.location.search || ''}`;
  }
  return fallbackPathname;
}

/**
 * Maps legacy unprefixed bookmark URLs (e.g. /bookings, /membership, /upcoming-activities)
 * to the canonical portal route while preserving query parameters.
 */
const LEGACY_PLAYER_ONLY_PATHS = new Set([
  '/membership',
  '/upcoming-activities',
  '/explore-clubs',
  '/clubs',
  '/book-court-club',
]);

const LEGACY_CLUB_ONLY_PATHS = new Set([
  '/members',
  '/membership-requests',
  '/memberships',
  '/analytics',
  '/event-details',
  '/lesson-details',
  '/pool-play',
  '/round-robin',
  '/bracket',
  '/scramble',
  '/competition-setup',
]);

const LEGACY_SHARED_PATHS = new Set([
  '/bookings',
  '/tournaments',
  '/tournament-details',
  '/leagues',
  '/league-details',
  '/events',
  '/lessons',
  '/courts',
  '/payments',
  '/club-details',
  '/competition-schedule',
  '/notifications',
  '/profile',
  '/settings',
  '/help-support',
]);

export function resolveLegacyPortalPath(
  rawPathname: string,
  rawSearch: string,
  role: Pick<RoleContext, 'isAuthenticated' | 'isPlatformAdmin' | 'hasClubStaff'>
): string | null {
  const normalized = normalizeAppRoute(rawPathname) || rawPathname;
  const clean = normalized.split('?')[0].replace(/\/+$/, '') || '/';
  const suffix = rawSearch && !rawSearch.startsWith('?') ? `?${rawSearch}` : rawSearch || '';

  if (normalized !== rawPathname) {
    return `${clean}${suffix}`;
  }

  if (!role.isAuthenticated) {
    return null;
  }

  if (LEGACY_PLAYER_ONLY_PATHS.has(clean)) {
    return role.hasClubStaff || role.isPlatformAdmin ? null : `/player${clean}${suffix}`;
  }

  if (LEGACY_CLUB_ONLY_PATHS.has(clean)) {
    return role.hasClubStaff && !role.isPlatformAdmin ? `/club-portal${clean}${suffix}` : null;
  }

  if (LEGACY_SHARED_PATHS.has(clean)) {
    if (role.isPlatformAdmin) return null;
    const prefix = role.hasClubStaff ? '/club-portal' : '/player';
    return `${prefix}${clean}${suffix}`;
  }

  return null;
}

/**
 * Safe in-app back navigation: pops stack history when available, otherwise navigates
 * to the caller's fallback parent route (crucial after page reloads or deep links).
 */
export function safeGoBack(
  router: { canGoBack: () => boolean; back: () => void; replace: (href: any) => void },
  fallbackRoute: string
) {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallbackRoute as any);
  }
}
