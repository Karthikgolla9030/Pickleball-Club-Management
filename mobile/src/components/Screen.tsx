/**
 * Screen — Safe area aware root screen container.
 *
 * Design System Principles:
 * 1. Root Screen does NOT double-pad: padded defaults to false so that
 *    full-width components (AppHeader, FilterChips, horizontal lists) span
 *    edge-to-edge naturally.
 * 2. SafeAreaView handles ['bottom', 'left', 'right'] by default so AppHeader
 *    can extend edge-to-edge behind the top status bar/notch without double-insets.
 * 3. Bottom scroll padding defaults to Spacing[8] (32px) for compact, reachable content.
 */

import React from 'react';
import {
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  View,
  ViewProps,
} from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { Colors, Spacing } from '@/theme';

interface ScreenProps extends ViewProps {
  /** Apply standard 16px horizontal padding to root content (default false) */
  padded?: boolean;
  /** Wrap in SafeAreaView (default true) */
  safeArea?: boolean;
  /** Which safe area edges to apply (default: ['bottom', 'left', 'right']) */
  edges?: Edge[];
  /** If true, wraps children in a ScrollView */
  scrollable?: boolean;
  /** Bottom padding when scrollable=true (default Spacing[8] = 32px) */
  scrollPaddingBottom?: number;
  scrollProps?: ScrollViewProps;
}

const DEFAULT_EDGES: Edge[] = ['bottom', 'left', 'right'];

export function Screen({
  padded = false,
  safeArea = true,
  edges = DEFAULT_EDGES,
  scrollable = false,
  scrollPaddingBottom = 85,
  scrollProps,
  children,
  style,
  ...props
}: ScreenProps) {
  const Wrapper = safeArea ? SafeAreaView : View;
  const wrapperProps = safeArea ? { edges } : {};

  const content = scrollable ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.scrollContent,
        padded && styles.paddedScroll,
        { paddingBottom: scrollPaddingBottom },
      ]}
      {...scrollProps}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.inner, padded && styles.padded, style]} {...props}>
      {children}
    </View>
  );

  return (
    <Wrapper style={styles.container} {...wrapperProps}>
      {content}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  inner: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: Spacing[4],
  },
  scrollContent: {
    flexGrow: 1,
  },
  paddedScroll: {
    paddingHorizontal: Spacing[4],
  },
});
