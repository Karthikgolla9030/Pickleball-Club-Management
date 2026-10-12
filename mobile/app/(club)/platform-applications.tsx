/**
 * Aught2 Pickleball — Redirect from deprecated club-scoped platform route to dedicated platform route
 */

import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Screen, LoadingState } from '@/components';

export default function DeprecatedClubPlatformApplicationsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/platform/applications' as any);
  }, [router]);

  return (
    <Screen>
      <LoadingState message="Redirecting to Platform Administration..." />
    </Screen>
  );
}
