/**
 * Aught2 Pickleball — Platform Administration Layout
 *
 * Dedicated Stack layout for the Platform Administration portal.
 * Statically mounts the platform stack without conditional navigator branching
 * to prevent maximum update depth and blank screen errors.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';

export default function PlatformLayout() {
  return (
    <View style={styles.container}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#F8FAF9' },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="login" />
        <Stack.Screen name="index" />
        <Stack.Screen name="applications" />
        <Stack.Screen name="clubs" />
        <Stack.Screen name="users" />
        <Stack.Screen name="audit" />
        <Stack.Screen name="support" />
        <Stack.Screen name="banners" />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
});
