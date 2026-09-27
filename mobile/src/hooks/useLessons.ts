/**
 * Aught2 Pickleball — Lessons & Coaching Hooks (Phase 15)
 *
 * TanStack Query hooks for:
 *   - Staff: Coach CRUD, LessonType configuration, Lesson scheduling/lifecycle, Registration & Attendance tracking
 *   - Player: Lesson discovery, Registration, Cancellation, My lessons
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import { lessonApi } from '@/services/api';
import type {
  CreateCoachPayload,
  CreateLessonPayload,
  CreateLessonTypePayload,
  LessonFilters,
  LessonRegistrationStatus,
  PlayerRegisterLessonPayload,
  StaffRegisterLessonPlayerPayload,
  UpdateCoachPayload,
  UpdateLessonPayload,
  UpdateLessonTypePayload,
} from '@/types';

// ─── Staff Coach Hooks ───────────────────────────────────────────────────────

export function useClubCoaches(clubId: string, activeOnly?: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.CLUB_COACHES(clubId, activeOnly),
    queryFn: () => lessonApi.listCoaches(clubId, activeOnly),
    enabled: !!clubId,
    staleTime: 60 * 1000,
  });
}

export function useClubCoach(clubId: string, coachId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.CLUB_COACH_DETAIL(clubId, coachId),
    queryFn: () => lessonApi.getCoach(clubId, coachId),
    enabled: !!clubId && !!coachId,
  });
}

export function useCreateCoach(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCoachPayload) => lessonApi.createCoach(clubId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'coaches'] });
    },
  });
}

export function useUpdateCoach(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ coachId, payload }: { coachId: string; payload: UpdateCoachPayload }) =>
      lessonApi.updateCoach(clubId, coachId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'coaches'] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_COACH_DETAIL(clubId, variables.coachId),
      });
    },
  });
}

export function useDeactivateCoach(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (coachId: string) => lessonApi.deactivateCoach(clubId, coachId),
    onSuccess: (_, coachId) => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'coaches'] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_COACH_DETAIL(clubId, coachId),
      });
    },
  });
}

export function useReactivateCoach(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (coachId: string) => lessonApi.reactivateCoach(clubId, coachId),
    onSuccess: (_, coachId) => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'coaches'] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_COACH_DETAIL(clubId, coachId),
      });
    },
  });
}

// ─── Staff Lesson Type Hooks ─────────────────────────────────────────────────

export function useClubLessonTypes(clubId: string, activeOnly?: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.CLUB_LESSON_TYPES(clubId, activeOnly),
    queryFn: () => lessonApi.listLessonTypes(clubId, activeOnly),
    enabled: !!clubId,
    staleTime: 60 * 1000,
  });
}

export function useClubLessonType(clubId: string, lessonTypeId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.CLUB_LESSON_TYPE_DETAIL(clubId, lessonTypeId),
    queryFn: () => lessonApi.getLessonType(clubId, lessonTypeId),
    enabled: !!clubId && !!lessonTypeId,
  });
}

export function useCreateLessonType(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateLessonTypePayload) => lessonApi.createLessonType(clubId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'lesson-types'] });
    },
  });
}

export function useUpdateLessonType(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lessonTypeId, payload }: { lessonTypeId: string; payload: UpdateLessonTypePayload }) =>
      lessonApi.updateLessonType(clubId, lessonTypeId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'lesson-types'] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_LESSON_TYPE_DETAIL(clubId, variables.lessonTypeId),
      });
    },
  });
}

export function useDeactivateLessonType(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lessonTypeId: string) => lessonApi.deactivateLessonType(clubId, lessonTypeId),
    onSuccess: (_, lessonTypeId) => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'lesson-types'] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_LESSON_TYPE_DETAIL(clubId, lessonTypeId),
      });
    },
  });
}

export function useReactivateLessonType(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lessonTypeId: string) => lessonApi.reactivateLessonType(clubId, lessonTypeId),
    onSuccess: (_, lessonTypeId) => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'lesson-types'] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_LESSON_TYPE_DETAIL(clubId, lessonTypeId),
      });
    },
  });
}

// ─── Staff Lesson Hooks ──────────────────────────────────────────────────────

export function useClubLessons(clubId: string, filters?: LessonFilters) {
  const filterKey = filters ? JSON.stringify(filters) : 'all';
  return useQuery({
    queryKey: QUERY_KEYS.CLUB_LESSONS(clubId, filterKey),
    queryFn: () => lessonApi.listClubLessons(clubId, filters),
    enabled: !!clubId,
    staleTime: 60 * 1000,
  });
}

export function useClubLesson(clubId: string, lessonId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.CLUB_LESSON_DETAIL(clubId, lessonId),
    queryFn: () => lessonApi.getClubLesson(clubId, lessonId),
    enabled: !!clubId && !!lessonId,
  });
}

export function useCreateClubLesson(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateLessonPayload) => lessonApi.createClubLesson(clubId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'lessons'] });
    },
  });
}

export function useUpdateClubLesson(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lessonId, payload }: { lessonId: string; payload: UpdateLessonPayload }) =>
      lessonApi.updateClubLesson(clubId, lessonId, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'lessons'] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_LESSON_DETAIL(clubId, variables.lessonId),
      });
    },
  });
}

export function usePublishClubLesson(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lessonId: string) => lessonApi.publishClubLesson(clubId, lessonId),
    onSuccess: (_, lessonId) => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'lessons'] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_LESSON_DETAIL(clubId, lessonId),
      });
    },
  });
}

export function useCancelClubLesson(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lessonId: string) => lessonApi.cancelClubLesson(clubId, lessonId),
    onSuccess: (_, lessonId) => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'lessons'] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_LESSON_DETAIL(clubId, lessonId),
      });
    },
  });
}

export function useCompleteClubLesson(clubId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lessonId: string) => lessonApi.completeClubLesson(clubId, lessonId),
    onSuccess: (_, lessonId) => {
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'lessons'] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_LESSON_DETAIL(clubId, lessonId),
      });
    },
  });
}

// ─── Staff Registration & Attendance Hooks ───────────────────────────────────

export function useLessonRegistrations(
  clubId: string,
  lessonId: string,
  status?: LessonRegistrationStatus,
) {
  return useQuery({
    queryKey: QUERY_KEYS.CLUB_LESSON_REGISTRATIONS(clubId, lessonId, status),
    queryFn: () => lessonApi.listLessonRegistrations(clubId, lessonId, status),
    enabled: !!clubId && !!lessonId,
  });
}

export function useStaffRegisterLessonPlayer(clubId: string, lessonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: StaffRegisterLessonPlayerPayload) =>
      lessonApi.staffRegisterPlayer(clubId, lessonId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['clubs', clubId, 'lessons', lessonId, 'registrations'],
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_LESSON_DETAIL(clubId, lessonId),
      });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'lessons'] });
    },
  });
}

export function useStaffCancelLessonRegistration(clubId: string, lessonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (registrationId: string) =>
      lessonApi.staffCancelRegistration(clubId, lessonId, registrationId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['clubs', clubId, 'lessons', lessonId, 'registrations'],
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_LESSON_DETAIL(clubId, lessonId),
      });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'lessons'] });
    },
  });
}

export function useStaffMarkLessonAttendance(clubId: string, lessonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      registrationId,
      attended,
    }: {
      registrationId: string;
      attended: boolean;
    }) => lessonApi.staffMarkAttendance(clubId, lessonId, registrationId, attended),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['clubs', clubId, 'lessons', lessonId, 'registrations'],
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.CLUB_LESSON_DETAIL(clubId, lessonId),
      });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'lessons'] });
    },
  });
}

// ─── Player Hooks ────────────────────────────────────────────────────────────

export function useDiscoverLessons(clubId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.PLAYER_DISCOVER_LESSONS(clubId),
    queryFn: () => lessonApi.discoverLessons(clubId),
    enabled: !!clubId,
    staleTime: 60 * 1000,
  });
}

export function useMyLessons() {
  return useQuery({
    queryKey: QUERY_KEYS.PLAYER_MY_LESSONS(),
    queryFn: () => lessonApi.getMyLessons(),
    staleTime: 60 * 1000,
  });
}

export function usePlayerLessonDetail(lessonId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.PLAYER_LESSON_DETAIL(lessonId),
    queryFn: () => lessonApi.getPlayerLessonDetail(lessonId),
    enabled: !!lessonId,
  });
}

export function usePlayerRegisterLesson(lessonId: string, clubId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload?: PlayerRegisterLessonPayload) =>
      lessonApi.playerRegisterLesson(lessonId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['player', 'lessons'] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.PLAYER_LESSON_DETAIL(lessonId),
      });
      if (clubId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.PLAYER_DISCOVER_LESSONS(clubId),
        });
      }
    },
  });
}

export function usePlayerCancelLessonRegistration(lessonId: string, clubId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => lessonApi.playerCancelLessonRegistration(lessonId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['player', 'lessons'] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.PLAYER_LESSON_DETAIL(lessonId),
      });
      if (clubId) {
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.PLAYER_DISCOVER_LESSONS(clubId),
        });
      }
    },
  });
}
