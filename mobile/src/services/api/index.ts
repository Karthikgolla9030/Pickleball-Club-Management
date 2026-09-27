/**
 * API services barrel export
 */

export { apiClient, ApiClientError, setTokenProvider, setTokenRefreshHandler } from './client';
export { authApi } from './auth';
export { clubsApi } from './clubs';
export { competitionApi } from './competition';
export { playerApi } from './player';
export { tournamentApi } from './tournaments';
export { leagueApi } from './leagues';
export { courtApi } from './courts';
export { bookingApi } from './bookings';
export { membershipApi } from './memberships';
export { paymentApi } from './payments';
export { eventApi } from './events';
export { lessonApi } from './lessons';
export { schedulingApi } from './scheduling';
export { notificationsApi, type NotificationItem, type NotificationListResponse } from './notifications';
