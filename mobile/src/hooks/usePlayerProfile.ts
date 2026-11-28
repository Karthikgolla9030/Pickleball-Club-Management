/**
 * usePlayerProfile — TanStack Query hook for player profile management.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClientError, playerApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import { useAuthStore } from '@/store';
import type {
  CreatePlayerProfilePayload,
  PlayerProfile,
  UpdatePlayerProfilePayload,
} from '@/types';

function syncAuthUserFromProfile(profile: PlayerProfile) {
  const state = useAuthStore.getState();
  if (!state.user) return;
  const fullName =
    [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() ||
    profile.display_name ||
    state.user.full_name;
  if (fullName !== state.user.full_name) {
    useAuthStore.setState({
      user: {
        ...state.user,
        full_name: fullName,
      },
    });
  }
}

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
      syncAuthUserFromProfile(newProfile);
      queryClient.setQueryData(QUERY_KEYS.PLAYER_PROFILE, newProfile);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_PROFILE });
      queryClient.invalidateQueries({ queryKey: ['club-player-members'] });
      queryClient.invalidateQueries({ queryKey: ['clubs'] });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (payload: UpdatePlayerProfilePayload) => {
      try {
        return await playerApi.updateProfile(payload);
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 404) {
          const authUser = useAuthStore.getState().user;
          return await playerApi.createProfile({
            display_name: payload.display_name || authUser?.full_name || 'Club Owner',
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
      syncAuthUserFromProfile(updatedProfile);
      queryClient.setQueryData(QUERY_KEYS.PLAYER_PROFILE, updatedProfile);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_PROFILE });
      queryClient.invalidateQueries({ queryKey: ['club-player-members'] });
      queryClient.invalidateQueries({ queryKey: ['clubs'] });
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: (imageData: string) => playerApi.uploadPhoto(imageData),
    onSuccess: (updatedProfile) => {
      syncAuthUserFromProfile(updatedProfile);
      queryClient.setQueryData(QUERY_KEYS.PLAYER_PROFILE, updatedProfile);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_PROFILE });
      queryClient.invalidateQueries({ queryKey: ['club-player-members'] });
      queryClient.invalidateQueries({ queryKey: ['clubs'] });
    },
  });

  const deletePhotoMutation = useMutation({
    mutationFn: () => playerApi.deletePhoto(),
    onSuccess: (updatedProfile) => {
      syncAuthUserFromProfile(updatedProfile);
      queryClient.setQueryData(QUERY_KEYS.PLAYER_PROFILE, updatedProfile);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_PROFILE });
      queryClient.invalidateQueries({ queryKey: ['club-player-members'] });
      queryClient.invalidateQueries({ queryKey: ['clubs'] });
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
