/**
 * DrawerOverlay — Dimmed backdrop behind the drawer.
 *
 * Animates opacity from 0 → 0.55 when drawer opens.
 * Tapping the overlay closes the drawer.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useDrawerStore } from '@/navigation';

export function DrawerOverlay() {
  const isOpen = useDrawerStore((s) => s.isOpen);
  const closeDrawer = useDrawerStore((s) => s.closeDrawer);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: isOpen ? 1 : 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [isOpen, opacity]);

  if (!isOpen) return null;

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.overlay,
        { opacity },
      ]}
      pointerEvents={isOpen ? 'auto' : 'none'}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={closeDrawer}
        accessibilityLabel="Close navigation menu"
        accessibilityRole="button"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    zIndex: 998,
  },
});
