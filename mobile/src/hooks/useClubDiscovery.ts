/**
 * Aught2 Pickleball — useClubDiscovery Hook
 * Handles public club exploration with search, location filtering, and pagination.
 */

import { useQuery } from '@tanstack/react-query';
import { clubsApi } from '@/services/api';
import type { DiscoverClubsParams, PublicClubDiscoveryResponse } from '@/types';

export function useClubDiscovery(params?: DiscoverClubsParams) {
  const queryKey = [
    'public-clubs-discovery',
    params?.search ?? '',
    params?.city ?? '',
    params?.state ?? '',
    params?.page ?? 1,
    params?.page_size ?? 20,
  ];

  const {
    data,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useQuery<PublicClubDiscoveryResponse, Error>({
    queryKey,
    queryFn: () => clubsApi.discoverPublicClubs(params),
    staleTime: 60 * 1000, // 1 minute
  });

  return {
    clubs: data?.items ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? 1,
    pageSize: data?.page_size ?? 20,
    hasMore: data?.has_more ?? false,
    isLoading,
    isRefetching,
    error,
    refetch,
  };
}
