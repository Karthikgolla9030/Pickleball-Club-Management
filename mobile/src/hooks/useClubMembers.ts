/**
 * useClubMembers — TanStack Query hook for member management.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clubsApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import type {
  AddMemberPayload,
  ClubMember,
  CreateCustomRolePayload,
  CustomRole,
  UpdateCustomRolePayload,
  UpdateMemberPayload,
} from '@/types';

export function useClubCustomRoles(clubId: string | null) {
  const queryClient = useQueryClient();

  const customRolesQuery = useQuery<CustomRole[], Error>({
    queryKey: clubId ? QUERY_KEYS.CLUB_CUSTOM_ROLES(clubId) : ['clubs', 'none', 'custom-roles'],
    queryFn: () => {
      if (!clubId) throw new Error('Club ID required');
      return clubsApi.getClubCustomRoles(clubId);
    },
    enabled: Boolean(clubId),
    staleTime: 60 * 1000,
  });

  const createRoleMutation = useMutation({
    mutationFn: (payload: CreateCustomRolePayload) => {
      if (!clubId) throw new Error('Club ID required');
      return clubsApi.createClubCustomRole(clubId, payload);
    },
    onSuccess: () => {
      if (clubId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_CUSTOM_ROLES(clubId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_MEMBERS(clubId) });
      }
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({
      roleId,
      payload,
    }: {
      roleId: string;
      payload: UpdateCustomRolePayload;
    }) => {
      if (!clubId) throw new Error('Club ID required');
      return clubsApi.updateClubCustomRole(clubId, roleId, payload);
    },
    onSuccess: () => {
      if (clubId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_CUSTOM_ROLES(clubId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_MEMBERS(clubId) });
      }
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: ({
      roleId,
      reassignToRoleId,
    }: {
      roleId: string;
      reassignToRoleId?: string;
    }) => {
      if (!clubId) throw new Error('Club ID required');
      return clubsApi.deleteClubCustomRole(clubId, roleId, reassignToRoleId);
    },
    onSuccess: () => {
      if (clubId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_CUSTOM_ROLES(clubId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_MEMBERS(clubId) });
      }
    },
  });

  return {
    ...customRolesQuery,
    customRoles: customRolesQuery.data ?? [],
    createCustomRole: createRoleMutation.mutateAsync,
    isCreatingRole: createRoleMutation.isPending,
    createRoleError: createRoleMutation.error,
    updateCustomRole: updateRoleMutation.mutateAsync,
    isUpdatingRole: updateRoleMutation.isPending,
    updateRoleError: updateRoleMutation.error,
    deleteCustomRole: deleteRoleMutation.mutateAsync,
    isDeletingRole: deleteRoleMutation.isPending,
    deleteRoleError: deleteRoleMutation.error,
  };
}

export function useClubMembers(clubId: string | null) {
  const queryClient = useQueryClient();

  const membersQuery = useQuery<ClubMember[], Error>({
    queryKey: clubId ? QUERY_KEYS.CLUB_MEMBERS(clubId) : ['clubs', 'none', 'members'],
    queryFn: () => {
      if (!clubId) throw new Error('Club ID required');
      return clubsApi.getClubMembers(clubId);
    },
    enabled: Boolean(clubId),
    staleTime: 60 * 1000,
  });

  const customRolesHook = useClubCustomRoles(clubId);

  const addMemberMutation = useMutation({
    mutationFn: (payload: AddMemberPayload) => {
      if (!clubId) throw new Error('Club ID required');
      return clubsApi.addClubMember(clubId, payload);
    },
    onSuccess: () => {
      if (clubId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_MEMBERS(clubId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_CUSTOM_ROLES(clubId) });
      }
    },
  });

  const updateMemberMutation = useMutation({
    mutationFn: ({
      membershipId,
      payload,
    }: {
      membershipId: string;
      payload: UpdateMemberPayload;
    }) => {
      if (!clubId) throw new Error('Club ID required');
      return clubsApi.updateClubMember(clubId, membershipId, payload);
    },
    onSuccess: () => {
      if (clubId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_MEMBERS(clubId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_CUSTOM_ROLES(clubId) });
      }
    },
  });

  const deactivateMemberMutation = useMutation({
    mutationFn: (membershipId: string) => {
      if (!clubId) throw new Error('Club ID required');
      return clubsApi.deactivateClubMember(clubId, membershipId);
    },
    onSuccess: () => {
      if (clubId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_MEMBERS(clubId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_CUSTOM_ROLES(clubId) });
      }
    },
  });

  return {
    ...membersQuery,
    members: membersQuery.data ?? [],
    addMember: addMemberMutation.mutateAsync,
    isAddingMember: addMemberMutation.isPending,
    addMemberError: addMemberMutation.error,
    updateMember: updateMemberMutation.mutateAsync,
    isUpdatingMember: updateMemberMutation.isPending,
    updateMemberError: updateMemberMutation.error,
    deactivateMember: deactivateMemberMutation.mutateAsync,
    isDeactivatingMember: deactivateMemberMutation.isPending,
    deactivateMemberError: deactivateMemberMutation.error,
    // Custom roles proxy
    customRoles: customRolesHook.customRoles,
    isLoadingCustomRoles: customRolesHook.isLoading,
    createCustomRole: customRolesHook.createCustomRole,
    isCreatingRole: customRolesHook.isCreatingRole,
    updateCustomRole: customRolesHook.updateCustomRole,
    isUpdatingRole: customRolesHook.isUpdatingRole,
    deleteCustomRole: customRolesHook.deleteCustomRole,
    isDeletingRole: customRolesHook.isDeletingRole,
  };
}
