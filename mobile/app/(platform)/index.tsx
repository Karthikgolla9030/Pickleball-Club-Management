/**
 * Aught2 Pickleball — Platform Administration Root
 *
 * Redirects to the primary platform applications review screen.
 */

import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Screen, LoadingState } from '@/components';

export default function PlatformIndexScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/(platform)/applications' as any);
  }, [router]);

  return (
    <Screen>
      <LoadingState message="Loading Platform Administration..." />
    </Screen>
  );
}
