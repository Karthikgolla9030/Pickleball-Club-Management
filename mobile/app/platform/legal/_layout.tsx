import React from 'react';
import { Stack } from 'expo-router';

export default function PlatformLegalLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#F8FAF9' },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="help-faqs" />
      <Stack.Screen name="player-terms" />
      <Stack.Screen name="club-terms" />
      <Stack.Screen name="privacy-policy" />
      <Stack.Screen name="club-agreement" />
      <Stack.Screen name="[type]" />
    </Stack>
  );
}

