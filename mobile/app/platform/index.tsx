/**
 * Aught2 Pickleball — Platform Administration Root
 *
 * Declaratively redirects to the platform applications review screen.
 */

import React from 'react';
import { Redirect } from 'expo-router';

export default function PlatformIndexScreen() {
  return <Redirect href={'/platform/applications' as any} />;
}
