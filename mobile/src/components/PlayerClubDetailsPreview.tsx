/**
 * Aught2 Pickleball — Player Club Details Live Preview Component
 *
 * Renders the exact canonical Player Side View Club component (`PlayerClubProfileView`)
 * in preview mode inside Club Details → Preview.
 *
 * Uses the club's real saved backend data, branding, courts, club-specific upcoming
 * activities, promotional ads, and published membership plans — never hardcoded mock
 * data or an independently styled phone mockup.
 */

import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { LoadingState } from './StateViews';
import { PlayerClubProfileView } from './PlayerClubProfileView';
import {
  useClubBranding,
  useClubCarouselSlides,
  usePlayerClubs,
  usePlayerMembership,
  useUpcomingActivities,
} from '@/hooks';
import { QUERY_KEYS } from '@/constants';
import { clubsApi, courtApi } from '@/services/api';
import type { Club, ClubBranding, MembershipPlan, PlayerCourt } from '@/types';

export interface PlayerClubDetailsPreviewProps {
  clubId?: string | null;
  club?: Club | null;
  branding?: ClubBranding | null;
  refreshSignal?: number;
}

export function PlayerClubDetailsPreview({
  clubId,
  club: propClub,
  branding: propBranding,
  refreshSignal = 0,
}: PlayerClubDetailsPreviewProps) {
  const effectiveClubId = clubId || propClub?.id || null;

  // 1. Canonical public club query (same queryKey + queryFn as app/player/club-details.tsx)
  const {
    data: publicClub,
    isLoading: isLoadingClub,
    refetch: refetchPublicClub,
  } = useQuery<Club, Error>({
    queryKey: ['public-club', effectiveClubId],
    queryFn: () => clubsApi.getPublicClub(effectiveClubId!),
    enabled: Boolean(effectiveClubId),
    refetchOnMount: 'always',
  });

  // 2. Saved branding (covers logo/banner updates saved on the Branding tab)
  const { branding: fetchedBranding, refetch: refetchBranding } = useClubBranding(effectiveClubId);
  const effectiveBranding = propBranding ?? fetchedBranding;

  // 3. Canonical active courts query
  const { data: activeCourts = [], refetch: refetchCourts } = useQuery<PlayerCourt[], Error>({
    queryKey: effectiveClubId
      ? QUERY_KEYS.PLAYER_COURTS(effectiveClubId)
      : ['clubs', 'none', 'player-courts'],
    queryFn: () => courtApi.getPlayerCourts(effectiveClubId!),
    enabled: Boolean(effectiveClubId),
    refetchOnMount: 'always',
  });

  // 4. Canonical public membership plans query
  const { data: plans = [], refetch: refetchPlans } = useQuery<MembershipPlan[], Error>({
    queryKey: ['public-membership-plans', effectiveClubId],
    queryFn: () => clubsApi.getPublicMembershipPlans(effectiveClubId!),
    enabled: Boolean(effectiveClubId),
    refetchOnMount: 'always',
  });

  // 5. Club-specific promotional ads
  const {
    slides: clubAds = [],
    isLoading: isLoadingAds,
    refetch: refetchAds,
  } = useClubCarouselSlides(effectiveClubId, true);

  // 6. Club-specific upcoming activities (same query as app/player/club-details.tsx)
  const {
    activities: upcomingActivities,
    isLoading: isLoadingActivities,
    refetch: refetchUpcomingActivities,
  } = useUpcomingActivities({
    club_id: effectiveClubId || undefined,
    limit: 50,
    enabled: Boolean(effectiveClubId),
  });

  // 7. Caller membership state if the owner also holds a membership in this club
  const { clubs: myClubs } = usePlayerClubs();
  const { data: playerMembership } = usePlayerMembership(effectiveClubId || '');

  const isCallerEnrolled = useMemo(
    () => myClubs.some((c) => c.club_id === effectiveClubId && c.status === 'active'),
    [myClubs, effectiveClubId],
  );
  const hasActivePaidSubscription = Boolean(
    isCallerEnrolled &&
      playerMembership &&
      (playerMembership.status === 'active' || playerMembership.effective_status === 'active'),
  );

  // Refresh saved data whenever the parent explicitly triggers a refresh or saved club updates
  useEffect(() => {
    if (!effectiveClubId || refreshSignal <= 0) return;
    refetchPublicClub();
    refetchBranding();
    refetchCourts();
    refetchPlans();
    refetchAds();
    refetchUpcomingActivities();
  }, [
    effectiveClubId,
    refreshSignal,
    refetchPublicClub,
    refetchBranding,
    refetchCourts,
    refetchPlans,
    refetchAds,
    refetchUpcomingActivities,
  ]);

  // Merge strictly SAVED club record with saved branding assets (never unsaved form edits)
  const savedClub = useMemo<Club | null>(() => {
    const baseClub = publicClub ?? propClub ?? null;
    if (!baseClub) return null;
    const savedLogo =
      effectiveBranding?.logo_url !== undefined ? effectiveBranding.logo_url : baseClub.logo_url;
    const savedCover =
      effectiveBranding?.cover_image_url !== undefined
        ? effectiveBranding.cover_image_url
        : baseClub.cover_image_url;
    return {
      ...baseClub,
      logo_url: savedLogo,
      cover_image_url: savedCover,
    };
  }, [publicClub, propClub, effectiveBranding?.logo_url, effectiveBranding?.cover_image_url]);

  if ((isLoadingClub && !savedClub) || !savedClub) {
    return (
      <View style={styles.loadingWrap}>
        <LoadingState message="Loading player view..." />
      </View>
    );
  }

  return (
    <View style={styles.previewCanvas}>
      <PlayerClubProfileView
        club={savedClub}
        activeCourts={activeCourts}
        plans={plans}
        clubAds={clubAds}
        isLoadingAds={isLoadingAds}
        upcomingActivities={upcomingActivities}
        isLoadingActivities={isLoadingActivities}
        isEnrolled
        hasActivePaidSubscription={hasActivePaidSubscription}
        playerPlanId={playerMembership?.plan_id}
        playerPlanName={playerMembership?.plan_name}
        isPreview
        refreshSignal={refreshSignal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  previewCanvas: {
    width: '100%',
  },
  loadingWrap: {
    minHeight: 240,
    justifyContent: 'center',
  },
});
