/**
 * Aught2 Pickleball — Application Constants
 */

import Constants from 'expo-constants';

declare const __DEV__: boolean;
declare const process: { env: { [key: string]: string | undefined } };

function resolveApiBase(): string {
  const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

  // 1. Explicit env var provided (production or development)
  if (envUrl) {
    const cleanUrl = envUrl.replace(/\/+$/, '');
    if (!isDev && (cleanUrl.startsWith('http://localhost') || cleanUrl.startsWith('http://127.0.0.1'))) {
      console.warn(
        `[Aught2 PWA Warning] Production build is using local URL (${cleanUrl}). ` +
        'Browsers will block HTTP requests on HTTPS PWA deployments. ' +
        'Ensure EXPO_PUBLIC_API_URL is set to your production HTTPS backend.'
      );
    }
    return cleanUrl;
  }

  // 2. Production build without EXPO_PUBLIC_API_URL
  if (!isDev) {
    const errorMsg =
      '[Aught2 PWA Configuration Error] EXPO_PUBLIC_API_URL is missing! ' +
      'Please set EXPO_PUBLIC_API_URL in your Vercel Project Environment Variables to your HTTPS FastAPI backend URL.';
    const g = typeof globalThis !== 'undefined' ? (globalThis as Record<string, unknown>) : {};
    const win = g.window as { location?: { origin?: string } } | undefined;
    if (win?.location?.origin && win.location.origin.startsWith('https://')) {
      return win.location.origin;
    }
    return '';
  }

  // 3. Local Development: Derive from Expo hostUri
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as Record<string, unknown>).manifest2
      ? ((Constants as Record<string, unknown>).manifest2 as { extra?: { expoGo?: { debuggerHost?: string } } })?.extra?.expoGo?.debuggerHost
      : undefined;

  if (hostUri && !String(hostUri).includes('.exp.direct') && !String(hostUri).includes('ngrok')) {
    const ip = String(hostUri).split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
      return `http://${ip}:8000`;
    }
  }

  // 4. Local Development Fallback
  return 'https://tender-corners-fail.loca.lt';
}

const API_BASE = resolveApiBase();

export const API_ENDPOINTS = {
  BASE: API_BASE,

  // Auth
  AUTH_LOGIN: `${API_BASE}/api/v1/auth/login`,
  AUTH_CLUB_LOGIN: `${API_BASE}/api/v1/auth/club/login`,
  AUTH_PLAYER_LOGIN: `${API_BASE}/api/v1/auth/player/login`,
  AUTH_PLAYER_REGISTER: `${API_BASE}/api/v1/auth/player/register`,
  AUTH_REFRESH: `${API_BASE}/api/v1/auth/refresh`,
  AUTH_ME: `${API_BASE}/api/v1/auth/me`,

  // Clubs (Phase 2+)
  CLUBS: `${API_BASE}/api/v1/clubs`,

  // Player (Phase 3+)
  PLAYER_PROFILE: `${API_BASE}/api/v1/player/profile`,
  PLAYER_CLUBS: `${API_BASE}/api/v1/player/clubs`,
  PLAYER_TOURNAMENTS: `${API_BASE}/api/v1/player/tournaments`,
  PLAYER_ACTIVITY: `${API_BASE}/api/v1/player/activity`,

  // Tournaments (Phase 4)
  TOURNAMENTS: `${API_BASE}/api/v1/tournaments`,
  CLUB_TOURNAMENTS: (clubId: string) => `${API_BASE}/api/v1/clubs/${clubId}/tournaments`,

  // Leagues (Phase 9)
  LEAGUES: `${API_BASE}/api/v1/leagues`,

  // Courts (Phase 10)
  CLUB_COURTS: (clubId: string) => `${API_BASE}/api/v1/clubs/${clubId}/courts`,
  PLAYER_COURTS: (clubId: string) => `${API_BASE}/api/v1/clubs/${clubId}/courts/active`,

  // Bookings (Phase 11)
  BOOKINGS: `${API_BASE}/api/v1/bookings`,
  BOOKING_DETAIL: (bookingId: string) => `${API_BASE}/api/v1/bookings/${bookingId}`,
  BOOKING_CANCEL: (bookingId: string) => `${API_BASE}/api/v1/bookings/${bookingId}/cancel`,
  CLUB_COURT_AVAILABILITY: (clubId: string) => `${API_BASE}/api/v1/clubs/${clubId}/courts/availability`,
  CLUB_BOOKINGS_CREATE: (clubId: string) => `${API_BASE}/api/v1/clubs/${clubId}/bookings`,
  CLUB_STAFF_BOOKINGS: (clubId: string) => `${API_BASE}/api/v1/clubs/${clubId}/bookings`,
  CLUB_STAFF_BOOKING_CREATE: (clubId: string) => `${API_BASE}/api/v1/clubs/${clubId}/bookings/staff`,
  CLUB_STAFF_BOOKING_CANCEL: (clubId: string, bookingId: string) => `${API_BASE}/api/v1/clubs/${clubId}/bookings/${bookingId}/cancel`,

  // Memberships (Phase 12)
  CLUB_MEMBERSHIP_PLANS: (clubId: string) => `${API_BASE}/api/v1/clubs/${clubId}/membership-plans`,
  CLUB_MEMBERSHIP_PLAN: (clubId: string, planId: string) => `${API_BASE}/api/v1/clubs/${clubId}/membership-plans/${planId}`,
  CLUB_PLAN_DEACTIVATE: (clubId: string, planId: string) => `${API_BASE}/api/v1/clubs/${clubId}/membership-plans/${planId}/deactivate`,
  CLUB_PLAN_REACTIVATE: (clubId: string, planId: string) => `${API_BASE}/api/v1/clubs/${clubId}/membership-plans/${planId}/reactivate`,
  CLUB_SUBSCRIPTIONS: (clubId: string) => `${API_BASE}/api/v1/clubs/${clubId}/subscriptions`,
  CLUB_SUBSCRIPTION: (clubId: string, subscriptionId: string) => `${API_BASE}/api/v1/clubs/${clubId}/subscriptions/${subscriptionId}`,
  CLUB_SUBSCRIPTION_CANCEL: (clubId: string, subscriptionId: string) => `${API_BASE}/api/v1/clubs/${clubId}/subscriptions/${subscriptionId}/cancel`,
  CLUB_SUBSCRIPTION_RENEW: (clubId: string, subscriptionId: string) => `${API_BASE}/api/v1/clubs/${clubId}/subscriptions/${subscriptionId}/renew`,
  PLAYER_MEMBERSHIP: (clubId: string) => `${API_BASE}/api/v1/player/membership?club_id=${clubId}`,

  // Payments (Phase 13)
  CLUB_PAYMENTS: (clubId: string) => `${API_BASE}/api/v1/clubs/${clubId}/payments`,
  CLUB_PAYMENT: (clubId: string, paymentId: string) => `${API_BASE}/api/v1/clubs/${clubId}/payments/${paymentId}`,
  CLUB_PAYMENT_SUMMARY: (clubId: string) => `${API_BASE}/api/v1/clubs/${clubId}/payments/summary`,
  CLUB_PAYMENT_PROCESS: (clubId: string, paymentId: string) => `${API_BASE}/api/v1/clubs/${clubId}/payments/${paymentId}/process`,
  CLUB_PAYMENT_SUCCEED: (clubId: string, paymentId: string) => `${API_BASE}/api/v1/clubs/${clubId}/payments/${paymentId}/succeed`,
  CLUB_PAYMENT_FAIL: (clubId: string, paymentId: string) => `${API_BASE}/api/v1/clubs/${clubId}/payments/${paymentId}/fail`,
  CLUB_PAYMENT_CANCEL: (clubId: string, paymentId: string) => `${API_BASE}/api/v1/clubs/${clubId}/payments/${paymentId}/cancel`,
  PLAYER_PAYMENTS: `${API_BASE}/api/v1/payments`,
  PLAYER_PAYMENT: (paymentId: string) => `${API_BASE}/api/v1/payments/${paymentId}`,

  // Events (Phase 14)
  CLUB_EVENTS: (clubId: string) => `${API_BASE}/api/v1/clubs/${clubId}/events`,
  CLUB_EVENT: (clubId: string, eventId: string) => `${API_BASE}/api/v1/clubs/${clubId}/events/${eventId}`,
  CLUB_EVENT_PUBLISH: (clubId: string, eventId: string) => `${API_BASE}/api/v1/clubs/${clubId}/events/${eventId}/publish`,
  CLUB_EVENT_CANCEL: (clubId: string, eventId: string) => `${API_BASE}/api/v1/clubs/${clubId}/events/${eventId}/cancel`,
  CLUB_EVENT_COMPLETE: (clubId: string, eventId: string) => `${API_BASE}/api/v1/clubs/${clubId}/events/${eventId}/complete`,
  CLUB_EVENT_REGISTRATIONS: (clubId: string, eventId: string) => `${API_BASE}/api/v1/clubs/${clubId}/events/${eventId}/registrations`,
  CLUB_EVENT_REGISTRATION_CANCEL: (clubId: string, eventId: string, registrationId: string) =>
    `${API_BASE}/api/v1/clubs/${clubId}/events/${eventId}/registrations/${registrationId}/cancel`,
  CLUB_EVENT_REGISTRATION_ATTEND: (clubId: string, eventId: string, registrationId: string) =>
    `${API_BASE}/api/v1/clubs/${clubId}/events/${eventId}/registrations/${registrationId}/attend`,
  CLUB_EVENT_REGISTRATION_NOSHOW: (clubId: string, eventId: string, registrationId: string) =>
    `${API_BASE}/api/v1/clubs/${clubId}/events/${eventId}/registrations/${registrationId}/no-show`,
  CLUB_EVENT_REGISTRATION_PROMOTE: (clubId: string, eventId: string, registrationId: string) =>
    `${API_BASE}/api/v1/clubs/${clubId}/events/${eventId}/registrations/${registrationId}/promote`,
  PLAYER_EVENTS_DISCOVER: (clubId: string) => `${API_BASE}/api/v1/clubs/${clubId}/events/discover`,
  PLAYER_MY_EVENTS: `${API_BASE}/api/v1/players/me/events`,
  PLAYER_EVENT_DETAIL: (eventId: string) => `${API_BASE}/api/v1/players/me/events/${eventId}`,
  PLAYER_EVENT_REGISTER: (eventId: string) => `${API_BASE}/api/v1/players/me/events/${eventId}/register`,
  PLAYER_EVENT_CANCEL: (eventId: string) => `${API_BASE}/api/v1/players/me/events/${eventId}/cancel`,

  // Lessons & Coaching (Phase 15)
  CLUB_COACHES: (clubId: string) => `${API_BASE}/api/v1/clubs/${clubId}/coaches`,
  CLUB_COACH: (clubId: string, coachId: string) => `${API_BASE}/api/v1/clubs/${clubId}/coaches/${coachId}`,
  CLUB_COACH_DEACTIVATE: (clubId: string, coachId: string) => `${API_BASE}/api/v1/clubs/${clubId}/coaches/${coachId}/deactivate`,
  CLUB_COACH_REACTIVATE: (clubId: string, coachId: string) => `${API_BASE}/api/v1/clubs/${clubId}/coaches/${coachId}/reactivate`,

  CLUB_LESSON_TYPES: (clubId: string) => `${API_BASE}/api/v1/clubs/${clubId}/lesson-types`,
  CLUB_LESSON_TYPE: (clubId: string, lessonTypeId: string) => `${API_BASE}/api/v1/clubs/${clubId}/lesson-types/${lessonTypeId}`,
  CLUB_LESSON_TYPE_DEACTIVATE: (clubId: string, lessonTypeId: string) => `${API_BASE}/api/v1/clubs/${clubId}/lesson-types/${lessonTypeId}/deactivate`,
  CLUB_LESSON_TYPE_REACTIVATE: (clubId: string, lessonTypeId: string) => `${API_BASE}/api/v1/clubs/${clubId}/lesson-types/${lessonTypeId}/reactivate`,

  CLUB_LESSONS: (clubId: string) => `${API_BASE}/api/v1/clubs/${clubId}/lessons`,
  CLUB_LESSON: (clubId: string, lessonId: string) => `${API_BASE}/api/v1/clubs/${clubId}/lessons/${lessonId}`,
  CLUB_LESSON_PUBLISH: (clubId: string, lessonId: string) => `${API_BASE}/api/v1/clubs/${clubId}/lessons/${lessonId}/publish`,
  CLUB_LESSON_CANCEL: (clubId: string, lessonId: string) => `${API_BASE}/api/v1/clubs/${clubId}/lessons/${lessonId}/cancel`,
  CLUB_LESSON_COMPLETE: (clubId: string, lessonId: string) => `${API_BASE}/api/v1/clubs/${clubId}/lessons/${lessonId}/complete`,

  CLUB_LESSON_REGISTRATIONS: (clubId: string, lessonId: string) => `${API_BASE}/api/v1/clubs/${clubId}/lessons/${lessonId}/registrations`,
  CLUB_LESSON_REGISTRATION_CANCEL: (clubId: string, lessonId: string, registrationId: string) =>
    `${API_BASE}/api/v1/clubs/${clubId}/lessons/${lessonId}/registrations/${registrationId}/cancel`,
  CLUB_LESSON_REGISTRATION_ATTEND: (clubId: string, lessonId: string, registrationId: string) =>
    `${API_BASE}/api/v1/clubs/${clubId}/lessons/${lessonId}/registrations/${registrationId}/attend`,
  CLUB_LESSON_REGISTRATION_NOSHOW: (clubId: string, lessonId: string, registrationId: string) =>
    `${API_BASE}/api/v1/clubs/${clubId}/lessons/${lessonId}/registrations/${registrationId}/no-show`,

  PLAYER_LESSONS_DISCOVER: (clubId: string) => `${API_BASE}/api/v1/clubs/${clubId}/lessons/discover`,
  PLAYER_MY_LESSONS: `${API_BASE}/api/v1/players/me/lessons`,
  PLAYER_LESSON_DETAIL: (lessonId: string) => `${API_BASE}/api/v1/players/me/lessons/${lessonId}`,
  PLAYER_LESSON_REGISTER: (lessonId: string) => `${API_BASE}/api/v1/players/me/lessons/${lessonId}/register`,
  PLAYER_LESSON_CANCEL: (lessonId: string) => `${API_BASE}/api/v1/players/me/lessons/${lessonId}/cancel`,

  // Competition Scheduling & Court Assignment (Phase 17)
  CLUB_COMPETITION_SCHEDULE: (clubId: string, date?: string) =>
    `${API_BASE}/api/v1/clubs/${clubId}/competition-schedule${date ? `?date=${date}` : ''}`,
  CLUB_COMPETITION_COURT_AVAILABILITY: (clubId: string, date?: string) =>
    `${API_BASE}/api/v1/clubs/${clubId}/competition-court-availability${date ? `?date=${date}` : ''}`,
  CLUB_TOURNAMENT_SCHEDULE: (clubId: string, tournamentId: string) =>
    `${API_BASE}/api/v1/clubs/${clubId}/tournaments/${tournamentId}/schedule`,
  CLUB_TOURNAMENT_UNSCHEDULED: (clubId: string, tournamentId: string) =>
    `${API_BASE}/api/v1/clubs/${clubId}/tournaments/${tournamentId}/matches/unscheduled`,
  CLUB_TOURNAMENT_MATCH_SCHEDULE: (clubId: string, tournamentId: string, matchId: string) =>
    `${API_BASE}/api/v1/clubs/${clubId}/tournaments/${tournamentId}/matches/${matchId}/schedule`,
  CLUB_LEAGUE_SCHEDULE: (clubId: string, leagueId: string) =>
    `${API_BASE}/api/v1/clubs/${clubId}/leagues/${leagueId}/schedule`,
  CLUB_LEAGUE_UNSCHEDULED: (clubId: string, leagueId: string) =>
    `${API_BASE}/api/v1/clubs/${clubId}/leagues/${leagueId}/matches/unscheduled`,
  CLUB_LEAGUE_MATCH_SCHEDULE: (clubId: string, leagueId: string, matchId: string) =>
    `${API_BASE}/api/v1/clubs/${clubId}/leagues/${leagueId}/matches/${matchId}/schedule`,
  PLAYER_COMPETITION_SCHEDULE: (clubId?: string, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (clubId) params.append('club_id', clubId);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    const qs = params.toString();
    return `${API_BASE}/api/v1/players/me/competition-schedule${qs ? `?${qs}` : ''}`;
  },

  // WebSockets & Notifications
  WS: `${API_BASE.replace(/^http/, 'ws')}/api/v1/ws`,
  NOTIFICATIONS: `${API_BASE}/api/v1/notifications`,
  NOTIFICATIONS_UNREAD_COUNT: `${API_BASE}/api/v1/notifications/unread-count`,
  NOTIFICATION_MARK_READ: (notificationId: string) => `${API_BASE}/api/v1/notifications/${notificationId}/read`,
  NOTIFICATIONS_MARK_ALL_READ: `${API_BASE}/api/v1/notifications/read-all`,
} as const;

export const SECURE_STORE_KEYS = {
  ACCESS_TOKEN: 'aught2_access_token',
  REFRESH_TOKEN: 'aught2_refresh_token',
} as const;

export const QUERY_KEYS = {
  ME: ['auth', 'me'] as const,
  CLUBS: ['clubs'] as const,
  CLUB_DETAIL: (clubId: string) => ['clubs', clubId] as const,
  CLUB_MEMBERS: (clubId: string) => ['clubs', clubId, 'members'] as const,
  CLUB_MEMBERSHIP: (clubId: string) => ['clubs', clubId, 'membership'] as const,
  CLUB_PLAYER_MEMBERS: (clubId: string) => ['clubs', clubId, 'player-memberships'] as const,
  PLAYER_PROFILE: ['player', 'profile'] as const,
  PLAYER_CLUBS: ['player', 'clubs'] as const,
  PLAYER_CLUB_DETAIL: (clubId: string) => ['player', 'clubs', clubId] as const,
  PLAYER_ACTIVITY: ['player', 'activity'] as const,
  CLUB_TOURNAMENTS: (clubId: string) => ['clubs', clubId, 'tournaments'] as const,
  TOURNAMENT_DETAIL: (tournamentId: string) => ['tournaments', tournamentId] as const,
  TOURNAMENT_REGISTRATIONS: (clubId: string, tournamentId: string) =>
    ['clubs', clubId, 'tournaments', tournamentId, 'registrations'] as const,
  PLAYER_TOURNAMENTS: ['player', 'tournaments'] as const,
  TOURNAMENTS: (clubId: string) => ['tournaments', clubId] as const,
  LEAGUES: (clubId: string) => ['leagues', clubId] as const,
  CLUB_TEAMS: (clubId: string, tournamentId: string) =>
    ['clubs', clubId, 'tournaments', tournamentId, 'teams'] as const,
  CLUB_MATCHES: (clubId: string, tournamentId: string) =>
    ['clubs', clubId, 'tournaments', tournamentId, 'matches'] as const,
  CLUB_STANDINGS: (clubId: string, tournamentId: string) =>
    ['clubs', clubId, 'tournaments', tournamentId, 'standings'] as const,
  CLUB_POOLS: (clubId: string, tournamentId: string) =>
    ['clubs', clubId, 'tournaments', tournamentId, 'pools'] as const,
  CLUB_POOL_MATCHES: (clubId: string, tournamentId: string, poolId?: string) =>
    ['clubs', clubId, 'tournaments', tournamentId, 'pools', 'matches', poolId ?? 'all'] as const,
  CLUB_POOL_STANDINGS: (clubId: string, tournamentId: string, poolId?: string) =>
    ['clubs', clubId, 'tournaments', tournamentId, 'pools', 'standings', poolId ?? 'all'] as const,
  CLUB_CHAMPIONSHIP_MATCHES: (clubId: string, tournamentId: string) =>
    ['clubs', clubId, 'tournaments', tournamentId, 'championship', 'matches'] as const,
  CLUB_SCRAMBLE_MATCHES: (clubId: string, tournamentId: string) =>
    ['clubs', clubId, 'tournaments', tournamentId, 'scramble', 'matches'] as const,
  CLUB_SCRAMBLE_STANDINGS: (clubId: string, tournamentId: string) =>
    ['clubs', clubId, 'tournaments', tournamentId, 'scramble', 'standings'] as const,
  CLUB_SCRAMBLE_STATE: (clubId: string, tournamentId: string) =>
    ['clubs', clubId, 'tournaments', tournamentId, 'scramble', 'state'] as const,
  PLAYER_TEAMS: (tournamentId: string) =>
    ['tournaments', tournamentId, 'teams'] as const,
  PLAYER_MATCHES: (tournamentId: string) =>
    ['tournaments', tournamentId, 'matches'] as const,
  PLAYER_STANDINGS: (tournamentId: string) =>
    ['tournaments', tournamentId, 'standings'] as const,
  PLAYER_POOLS: (tournamentId: string) =>
    ['tournaments', tournamentId, 'pools'] as const,
  PLAYER_POOL_MATCHES: (tournamentId: string, poolId?: string) =>
    ['tournaments', tournamentId, 'pools', 'matches', poolId ?? 'all'] as const,
  PLAYER_POOL_STANDINGS: (tournamentId: string, poolId?: string) =>
    ['tournaments', tournamentId, 'pools', 'standings', poolId ?? 'all'] as const,
  PLAYER_CHAMPIONSHIP_MATCHES: (tournamentId: string) =>
    ['tournaments', tournamentId, 'championship', 'matches'] as const,
  PLAYER_SCRAMBLE_MATCHES: (tournamentId: string) =>
    ['tournaments', tournamentId, 'scramble', 'matches'] as const,
  PLAYER_SCRAMBLE_STANDINGS: (tournamentId: string) =>
    ['tournaments', tournamentId, 'scramble', 'standings'] as const,
  PLAYER_SCRAMBLE_STATE: (tournamentId: string) =>
    ['tournaments', tournamentId, 'scramble', 'state'] as const,
  // Phase 8: Bracket
  CLUB_BRACKET_MATCHES: (clubId: string, tournamentId: string) =>
    ['clubs', clubId, 'tournaments', tournamentId, 'bracket', 'matches'] as const,
  CLUB_BRACKET_SUMMARY: (clubId: string, tournamentId: string) =>
    ['clubs', clubId, 'tournaments', tournamentId, 'bracket', 'summary'] as const,
  PLAYER_BRACKET_MATCHES: (tournamentId: string) =>
    ['tournaments', tournamentId, 'bracket', 'matches'] as const,
  PLAYER_BRACKET_SUMMARY: (tournamentId: string) =>
    ['tournaments', tournamentId, 'bracket', 'summary'] as const,

  // Phase 9: Leagues
  CLUB_LEAGUES: (clubId: string) => ['clubs', clubId, 'leagues'] as const,
  CLUB_LEAGUE_DETAIL: (clubId: string, leagueId: string) =>
    ['clubs', clubId, 'leagues', leagueId] as const,
  CLUB_LEAGUE_TEAMS: (clubId: string, leagueId: string) =>
    ['clubs', clubId, 'leagues', leagueId, 'teams'] as const,
  CLUB_LEAGUE_WEEKS: (clubId: string, leagueId: string) =>
    ['clubs', clubId, 'leagues', leagueId, 'weeks'] as const,
  CLUB_LEAGUE_MATCHES: (clubId: string, leagueId: string, weekId?: string) =>
    ['clubs', clubId, 'leagues', leagueId, 'matches', weekId ?? 'all'] as const,
  CLUB_LEAGUE_STANDINGS: (clubId: string, leagueId: string) =>
    ['clubs', clubId, 'leagues', leagueId, 'standings'] as const,
  CLUB_LEAGUE_SNAPSHOTS: (clubId: string, leagueId: string) =>
    ['clubs', clubId, 'leagues', leagueId, 'snapshots'] as const,
  CLUB_LEAGUE_PLAYOFFS: (clubId: string, leagueId: string) =>
    ['clubs', clubId, 'leagues', leagueId, 'playoffs'] as const,

  PLAYER_LEAGUES: ['leagues'] as const,
  PLAYER_LEAGUE_DETAIL: (leagueId: string) => ['leagues', leagueId] as const,
  PLAYER_LEAGUE_STANDINGS: (leagueId: string) => ['leagues', leagueId, 'standings'] as const,
  PLAYER_LEAGUE_SNAPSHOTS: (leagueId: string) => ['leagues', leagueId, 'snapshots'] as const,
  PLAYER_LEAGUE_WEEKS: (leagueId: string) => ['leagues', leagueId, 'weeks'] as const,
  PLAYER_LEAGUE_MATCHES: (leagueId: string, weekId?: string) =>
    ['leagues', leagueId, 'matches', weekId ?? 'all'] as const,
  PLAYER_LEAGUE_PLAYOFFS: (leagueId: string) => ['leagues', leagueId, 'playoffs'] as const,

  // Phase 10: Courts
  CLUB_COURTS: (clubId: string, status?: string) =>
    ['clubs', clubId, 'courts', status ?? 'all'] as const,
  CLUB_COURT_DETAILS: (clubId: string, courtId: string) =>
    ['clubs', clubId, 'courts', courtId] as const,
  PLAYER_COURTS: (clubId: string) => ['clubs', clubId, 'player-courts'] as const,

  // Phase 11: Bookings
  PLAYER_BOOKINGS: (clubId?: string, status?: string, upcomingOnly?: boolean) =>
    ['bookings', 'player', clubId ?? 'all', status ?? 'all', upcomingOnly ? 'upcoming' : 'all'] as const,
  BOOKING_DETAIL: (bookingId: string) => ['bookings', bookingId] as const,
  CLUB_COURT_AVAILABILITY: (clubId: string, date: string, duration?: number) =>
    ['clubs', clubId, 'availability', date, duration ?? 60] as const,
  CLUB_STAFF_BOOKINGS: (clubId: string, courtId?: string, status?: string) =>
    ['clubs', clubId, 'staff-bookings', courtId ?? 'all', status ?? 'all'] as const,

  // Phase 12: Memberships
  MEMBERSHIP_PLANS: (clubId: string, status?: string) =>
    ['clubs', clubId, 'membership-plans', status ?? 'all'] as const,
  MEMBERSHIP_PLAN_DETAIL: (clubId: string, planId: string) =>
    ['clubs', clubId, 'membership-plans', planId] as const,
  CLUB_SUBSCRIPTIONS: (clubId: string, filters?: string) =>
    ['clubs', clubId, 'subscriptions', filters ?? 'all'] as const,
  SUBSCRIPTION_DETAIL: (clubId: string, subscriptionId: string) =>
    ['clubs', clubId, 'subscriptions', subscriptionId] as const,
  PLAYER_MEMBERSHIP: (clubId: string) =>
    ['player', 'membership', clubId] as const,

  // Phase 13: Payments
  CLUB_PAYMENTS: (clubId: string, filters?: string) =>
    ['clubs', clubId, 'payments', filters ?? 'all'] as const,
  CLUB_PAYMENT_DETAIL: (clubId: string, paymentId: string) =>
    ['clubs', clubId, 'payments', paymentId] as const,
  CLUB_PAYMENT_SUMMARY: (clubId: string) =>
    ['clubs', clubId, 'payments', 'summary'] as const,
  PLAYER_PAYMENTS: (filters?: string) =>
    ['player', 'payments', filters ?? 'all'] as const,
  PLAYER_PAYMENT_DETAIL: (paymentId: string) =>
    ['player', 'payments', paymentId] as const,

  // Phase 14: Events
  CLUB_EVENTS: (clubId: string, filters?: string) =>
    ['clubs', clubId, 'events', filters ?? 'all'] as const,
  CLUB_EVENT_DETAIL: (clubId: string, eventId: string) =>
    ['clubs', clubId, 'events', eventId] as const,
  CLUB_EVENT_REGISTRATIONS: (clubId: string, eventId: string, status?: string) =>
    ['clubs', clubId, 'events', eventId, 'registrations', status ?? 'all'] as const,
  PLAYER_DISCOVER_EVENTS: (clubId: string) =>
    ['player', 'events', 'discover', clubId] as const,
  PLAYER_MY_EVENTS: (status?: string) =>
    ['player', 'events', 'my', status ?? 'all'] as const,
  PLAYER_EVENT_DETAIL: (eventId: string) =>
    ['player', 'events', eventId] as const,

  // Phase 15: Lessons & Coaching
  CLUB_COACHES: (clubId: string, activeOnly?: boolean) =>
    ['clubs', clubId, 'coaches', activeOnly ? 'active' : 'all'] as const,
  CLUB_COACH_DETAIL: (clubId: string, coachId: string) =>
    ['clubs', clubId, 'coaches', coachId] as const,
  CLUB_LESSON_TYPES: (clubId: string, activeOnly?: boolean) =>
    ['clubs', clubId, 'lesson-types', activeOnly ? 'active' : 'all'] as const,
  CLUB_LESSON_TYPE_DETAIL: (clubId: string, lessonTypeId: string) =>
    ['clubs', clubId, 'lesson-types', lessonTypeId] as const,
  CLUB_LESSONS: (clubId: string, filters?: string) =>
    ['clubs', clubId, 'lessons', filters ?? 'all'] as const,
  CLUB_LESSON_DETAIL: (clubId: string, lessonId: string) =>
    ['clubs', clubId, 'lessons', lessonId] as const,
  CLUB_LESSON_REGISTRATIONS: (clubId: string, lessonId: string, status?: string) =>
    ['clubs', clubId, 'lessons', lessonId, 'registrations', status ?? 'all'] as const,
  PLAYER_DISCOVER_LESSONS: (clubId: string) =>
    ['player', 'lessons', 'discover', clubId] as const,
  PLAYER_MY_LESSONS: (status?: string) =>
    ['player', 'lessons', 'my', status ?? 'all'] as const,
  PLAYER_LESSON_DETAIL: (lessonId: string) =>
    ['player', 'lessons', lessonId] as const,

  // Phase 17: Competition Scheduling & Court Assignment
  CLUB_COMPETITION_SCHEDULE: (clubId: string, date?: string) =>
    ['clubs', clubId, 'competition-schedule', date ?? 'all'] as const,
  CLUB_COMPETITION_COURT_AVAILABILITY: (clubId: string, date?: string) =>
    ['clubs', clubId, 'court-availability', date ?? 'all'] as const,
  CLUB_TOURNAMENT_SCHEDULE: (clubId: string, tournamentId: string) =>
    ['clubs', clubId, 'tournaments', tournamentId, 'schedule'] as const,
  CLUB_TOURNAMENT_UNSCHEDULED: (clubId: string, tournamentId: string) =>
    ['clubs', clubId, 'tournaments', tournamentId, 'unscheduled'] as const,
  CLUB_LEAGUE_SCHEDULE: (clubId: string, leagueId: string) =>
    ['clubs', clubId, 'leagues', leagueId, 'schedule'] as const,
  CLUB_LEAGUE_UNSCHEDULED: (clubId: string, leagueId: string) =>
    ['clubs', clubId, 'leagues', leagueId, 'unscheduled'] as const,
  PLAYER_COMPETITION_SCHEDULE: (clubId?: string, startDate?: string, endDate?: string) =>
    ['player', 'competition-schedule', clubId ?? 'all', startDate ?? 'all', endDate ?? 'all'] as const,

  // Real-Time Notifications
  NOTIFICATIONS: (category?: string) => ['notifications', category ?? 'all'] as const,
  NOTIFICATIONS_UNREAD_COUNT: ['notifications', 'unread-count'] as const,
} as const;





export const APP_CONFIG = {
  NAME: 'Aught2 Pickleball',
  VERSION: '1.0.0',
  /** Timeout for read (GET) requests */
  API_TIMEOUT_MS: 10000,
  /** Timeout for mutation requests (POST/PATCH/PUT/DELETE).
   *  Score saving triggers DB transactions + standings calculations, so needs more time. */
  API_MUTATION_TIMEOUT_MS: 30000,
  TOKEN_REFRESH_BUFFER_MS: 60 * 1000, // Refresh 60s before expiry
} as const;
