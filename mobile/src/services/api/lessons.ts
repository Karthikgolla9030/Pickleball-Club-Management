/**
 * Aught2 Pickleball — Lessons & Coaching API Service (Phase 15)
 *
 * Typed API client for coaches, lesson types, lessons, and registrations.
 */

import { API_ENDPOINTS } from '@/constants';
import { apiClient } from './client';
import type {
  ClubLesson,
  ClubLessonDetail,
  Coach,
  CreateCoachPayload,
  CreateLessonPayload,
  CreateLessonTypePayload,
  LessonFilters,
  LessonRegistration,
  LessonRegistrationStatus,
  LessonType,
  PlayerLessonDetail,
  PlayerRegisterLessonPayload,
  StaffRegisterLessonPlayerPayload,
  UpdateCoachPayload,
  UpdateLessonPayload,
  UpdateLessonTypePayload,
} from '@/types';

export const lessonApi = {
  // ─── Coach Endpoints ───────────────────────────────────────────────────────

  /**
   * List coaches for a club.
   */
  listCoaches(clubId: string, activeOnly?: boolean): Promise<Coach[]> {
    const base = API_ENDPOINTS.CLUB_COACHES(clubId);
    return apiClient.get<Coach[]>(activeOnly ? `${base}?active_only=true` : base);
  },

  /**
   * Get coach details.
   */
  getCoach(clubId: string, coachId: string): Promise<Coach> {
    return apiClient.get<Coach>(API_ENDPOINTS.CLUB_COACH(clubId, coachId));
  },

  /**
   * Create coach.
   */
  createCoach(clubId: string, payload: CreateCoachPayload): Promise<Coach> {
    return apiClient.post<Coach>(API_ENDPOINTS.CLUB_COACHES(clubId), payload);
  },

  /**
   * Update coach profile.
   */
  updateCoach(clubId: string, coachId: string, payload: UpdateCoachPayload): Promise<Coach> {
    return apiClient.patch<Coach>(API_ENDPOINTS.CLUB_COACH(clubId, coachId), payload);
  },

  /**
   * Deactivate coach.
   */
  deactivateCoach(clubId: string, coachId: string): Promise<Coach> {
    return apiClient.post<Coach>(API_ENDPOINTS.CLUB_COACH_DEACTIVATE(clubId, coachId), {});
  },

  /**
   * Reactivate coach.
   */
  reactivateCoach(clubId: string, coachId: string): Promise<Coach> {
    return apiClient.post<Coach>(API_ENDPOINTS.CLUB_COACH_REACTIVATE(clubId, coachId), {});
  },

  // ─── Lesson Type Endpoints ─────────────────────────────────────────────────

  /**
   * List lesson types for a club.
   */
  listLessonTypes(clubId: string, activeOnly?: boolean): Promise<LessonType[]> {
    const base = API_ENDPOINTS.CLUB_LESSON_TYPES(clubId);
    return apiClient.get<LessonType[]>(activeOnly ? `${base}?active_only=true` : base);
  },

  /**
   * Get lesson type details.
   */
  getLessonType(clubId: string, lessonTypeId: string): Promise<LessonType> {
    return apiClient.get<LessonType>(API_ENDPOINTS.CLUB_LESSON_TYPE(clubId, lessonTypeId));
  },

  /**
   * Create lesson type.
   */
  createLessonType(clubId: string, payload: CreateLessonTypePayload): Promise<LessonType> {
    return apiClient.post<LessonType>(API_ENDPOINTS.CLUB_LESSON_TYPES(clubId), payload);
  },

  /**
   * Update lesson type.
   */
  updateLessonType(clubId: string, lessonTypeId: string, payload: UpdateLessonTypePayload): Promise<LessonType> {
    return apiClient.patch<LessonType>(API_ENDPOINTS.CLUB_LESSON_TYPE(clubId, lessonTypeId), payload);
  },

  /**
   * Deactivate lesson type.
   */
  deactivateLessonType(clubId: string, lessonTypeId: string): Promise<LessonType> {
    return apiClient.post<LessonType>(API_ENDPOINTS.CLUB_LESSON_TYPE_DEACTIVATE(clubId, lessonTypeId), {});
  },

  /**
   * Reactivate lesson type.
   */
  reactivateLessonType(clubId: string, lessonTypeId: string): Promise<LessonType> {
    return apiClient.post<LessonType>(API_ENDPOINTS.CLUB_LESSON_TYPE_REACTIVATE(clubId, lessonTypeId), {});
  },

  // ─── Staff Lesson Endpoints ────────────────────────────────────────────────

  /**
   * List all lessons for a club with optional filtering.
   */
  listClubLessons(clubId: string, filters?: LessonFilters): Promise<ClubLesson[]> {
    const base = API_ENDPOINTS.CLUB_LESSONS(clubId);
    if (!filters) return apiClient.get<ClubLesson[]>(base);

    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.coach_id) params.append('coach_id', filters.coach_id);
    if (filters.lesson_type_id) params.append('lesson_type_id', filters.lesson_type_id);
    if (filters.court_id) params.append('court_id', filters.court_id);
    if (filters.date_from) params.append('date_from', filters.date_from);
    if (filters.date_to) params.append('date_to', filters.date_to);

    const qs = params.toString();
    return apiClient.get<ClubLesson[]>(qs ? `${base}?${qs}` : base);
  },

  /**
   * Get single lesson detail for staff.
   */
  getClubLesson(clubId: string, lessonId: string): Promise<ClubLessonDetail> {
    return apiClient.get<ClubLessonDetail>(API_ENDPOINTS.CLUB_LESSON(clubId, lessonId));
  },

  /**
   * Create a new lesson in draft status.
   */
  createClubLesson(clubId: string, payload: CreateLessonPayload): Promise<ClubLesson> {
    return apiClient.post<ClubLesson>(API_ENDPOINTS.CLUB_LESSONS(clubId), payload);
  },

  /**
   * Update mutable fields of a draft lesson.
   */
  updateClubLesson(clubId: string, lessonId: string, payload: UpdateLessonPayload): Promise<ClubLesson> {
    return apiClient.patch<ClubLesson>(API_ENDPOINTS.CLUB_LESSON(clubId, lessonId), payload);
  },

  /**
   * Publish a draft lesson.
   */
  publishClubLesson(clubId: string, lessonId: string): Promise<ClubLesson> {
    return apiClient.post<ClubLesson>(API_ENDPOINTS.CLUB_LESSON_PUBLISH(clubId, lessonId), {});
  },

  /**
   * Cancel a lesson.
   */
  cancelClubLesson(clubId: string, lessonId: string): Promise<ClubLesson> {
    return apiClient.post<ClubLesson>(API_ENDPOINTS.CLUB_LESSON_CANCEL(clubId, lessonId), {});
  },

  /**
   * Mark a lesson as completed.
   */
  completeClubLesson(clubId: string, lessonId: string): Promise<ClubLesson> {
    return apiClient.post<ClubLesson>(API_ENDPOINTS.CLUB_LESSON_COMPLETE(clubId, lessonId), {});
  },

  /**
   * List registrations for a lesson.
   */
  listLessonRegistrations(
    clubId: string,
    lessonId: string,
    status?: LessonRegistrationStatus,
  ): Promise<LessonRegistration[]> {
    const base = API_ENDPOINTS.CLUB_LESSON_REGISTRATIONS(clubId, lessonId);
    if (!status) return apiClient.get<LessonRegistration[]>(base);
    return apiClient.get<LessonRegistration[]>(`${base}?status=${status}`);
  },

  /**
   * Staff manually registers a player for a lesson.
   */
  staffRegisterPlayer(
    clubId: string,
    lessonId: string,
    payload: StaffRegisterLessonPlayerPayload,
  ): Promise<LessonRegistration> {
    return apiClient.post<LessonRegistration>(
      API_ENDPOINTS.CLUB_LESSON_REGISTRATIONS(clubId, lessonId),
      payload,
    );
  },

  /**
   * Staff cancels a lesson registration.
   */
  staffCancelRegistration(
    clubId: string,
    lessonId: string,
    registrationId: string,
  ): Promise<LessonRegistration> {
    return apiClient.post<LessonRegistration>(
      API_ENDPOINTS.CLUB_LESSON_REGISTRATION_CANCEL(clubId, lessonId, registrationId),
      {},
    );
  },

  /**
   * Staff marks attendance for a registered participant.
   */
  staffMarkAttendance(
    clubId: string,
    lessonId: string,
    registrationId: string,
    attended: boolean,
  ): Promise<LessonRegistration> {
    const endpoint = attended
      ? API_ENDPOINTS.CLUB_LESSON_REGISTRATION_ATTEND(clubId, lessonId, registrationId)
      : API_ENDPOINTS.CLUB_LESSON_REGISTRATION_NOSHOW(clubId, lessonId, registrationId);
    return apiClient.post<LessonRegistration>(endpoint, {});
  },

  // ─── Player Endpoints ──────────────────────────────────────────────────────

  /**
   * Discover published lessons for a club.
   */
  discoverLessons(clubId: string): Promise<PlayerLessonDetail[]> {
    return apiClient.get<PlayerLessonDetail[]>(API_ENDPOINTS.PLAYER_LESSONS_DISCOVER(clubId));
  },

  /**
   * List current player's lesson registrations.
   */
  getMyLessons(): Promise<LessonRegistration[]> {
    return apiClient.get<LessonRegistration[]>(API_ENDPOINTS.PLAYER_MY_LESSONS);
  },

  /**
   * Get single lesson detail for player.
   */
  getPlayerLessonDetail(lessonId: string): Promise<PlayerLessonDetail> {
    return apiClient.get<PlayerLessonDetail>(API_ENDPOINTS.PLAYER_LESSON_DETAIL(lessonId));
  },

  /**
   * Player registers for a published lesson.
   */
  playerRegisterLesson(lessonId: string, payload?: PlayerRegisterLessonPayload): Promise<LessonRegistration> {
    return apiClient.post<LessonRegistration>(
      API_ENDPOINTS.PLAYER_LESSON_REGISTER(lessonId),
      payload ?? {},
    );
  },

  /**
   * Player cancels their own lesson registration.
   */
  playerCancelLessonRegistration(lessonId: string): Promise<LessonRegistration> {
    return apiClient.post<LessonRegistration>(API_ENDPOINTS.PLAYER_LESSON_CANCEL(lessonId), {});
  },
};
