/**
 * usePlayerProfile — TanStack Query hook for player profile management.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError, playerApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import type {
  CreatePlayerProfilePayload,
  PlayerProfile,
  UpdatePlayerProfilePayload,
} from '@/types';

export function usePlayerProfile() {
  const queryClient = useQueryClient();

  const profileQuery = useQuery<PlayerProfile | null, Error>({
    queryKey: QUERY_KEYS.PLAYER_PROFILE,
    queryFn: async () => {
      try {
        return await playerApi.getProfile();
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 404) {
          return null; // Profile not created yet
        }
        throw err;
      }
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const createProfileMutation = useMutation({
    mutationFn: (payload: CreatePlayerProfilePayload) => playerApi.createProfile(payload),
    onSuccess: (newProfile) => {
      queryClient.setQueryData(QUERY_KEYS.PLAYER_PROFILE, newProfile);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_PROFILE });
      queryClient.invalidateQueries({ queryKey: ['club-player-members'] });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (payload: UpdatePlayerProfilePayload) => {
      try {
        return await playerApi.updateProfile(payload);
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 404) {
          return await playerApi.createProfile({
            display_name: payload.display_name || 'Player',
            first_name: payload.first_name ?? undefined,
            last_name: payload.last_name ?? undefined,
            phone: payload.phone ?? undefined,
            date_of_birth: payload.date_of_birth ?? undefined,
            gender: payload.gender ?? undefined,
            profile_image_url: payload.profile_image_url ?? undefined,
            bio: payload.bio ?? undefined,
          });
        }
        throw err;
      }
    },
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(QUERY_KEYS.PLAYER_PROFILE, updatedProfile);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_PROFILE });
      queryClient.invalidateQueries({ queryKey: ['club-player-members'] });
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: (imageData: string) => playerApi.uploadPhoto(imageData),
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(QUERY_KEYS.PLAYER_PROFILE, updatedProfile);
      queryClient.invalidateQueries({ queryKey: ['club-player-members'] });
    },
  });

  const deletePhotoMutation = useMutation({
    mutationFn: () => playerApi.deletePhoto(),
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(QUERY_KEYS.PLAYER_PROFILE, updatedProfile);
      queryClient.invalidateQueries({ queryKey: ['club-player-members'] });
    },
  });

  return {
    ...profileQuery,
    profile: profileQuery.data ?? null,
    hasProfile: Boolean(profileQuery.data),
    createProfile: createProfileMutation.mutateAsync,
    isCreatingProfile: createProfileMutation.isPending,
    createProfileError: createProfileMutation.error,
    updateProfile: updateProfileMutation.mutateAsync,
    isUpdatingProfile: updateProfileMutation.isPending,
    updateProfileError: updateProfileMutation.error,
    uploadPhoto: uploadPhotoMutation.mutateAsync,
    isUploadingPhoto: uploadPhotoMutation.isPending,
    uploadPhotoError: uploadPhotoMutation.error,
    deletePhoto: deletePhotoMutation.mutateAsync,
    isDeletingPhoto: deletePhotoMutation.isPending,
    deletePhotoError: deletePhotoMutation.error,
  };
}
