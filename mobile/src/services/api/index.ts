/**
 * API services barrel export
 */

export { apiClient, ApiClientError, getAccessToken, getValidAccessToken, setTokenProvider, setTokenRefreshHandler } from './client';
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
export { notificationsApi, type NotificationItem, type NotificationListResponse, type NotificationPreference } from './notifications';
export { analyticsApi } from './analytics';
export { clubAssetsApi } from './clubAssets';
export { platformBannersApi } from './platformBanners';
export { clubApplicationsApi, platformApplicationsApi, type SubmitClubApplicationPayload, type ClubApplicationResponse, type ClubApplicationStatusLookupResponse, type PlatformSupportTicketItem, type PlatformSupportTicketDetailResponse, type PlatformSupportTicketMessageItem, type PlatformSupportTicketsListResponse } from './clubApplications';
export { supportApi, type CreateSupportTicketPayload } from './support';
export {
  helpApi,
  legalApi,
  platformLegalApi,
  type HelpCategoryItem,
  type FAQItem,
  type FAQsListResponse,
  type HelpArticleItem,
  type HelpArticlesListResponse,
  type LegalDocumentItem,
  type LegalDocumentVersionItem,
  type LegalDocumentDetailResponse,
  type PendingAcceptanceItem,
  type PendingAcceptancesResponse,
  type LegalAcceptanceItem,
} from './legalAndHelp';
