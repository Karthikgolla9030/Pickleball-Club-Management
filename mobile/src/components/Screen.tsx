/**
 * Screen — Safe area aware screen container.
 */

import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing } from '@/theme';

interface ScreenProps extends ViewProps {
  padded?: boolean;
  safeArea?: boolean;
}

export function Screen({ padded = true, safeArea = true, children, style, ...props }: ScreenProps) {
  const Wrapper = safeArea ? SafeAreaView : View;
  return (
    <Wrapper style={styles.container}>
      <View
        style={[styles.inner, padded && styles.padded, style]}
        {...props}
      >
        {children}
      </View>
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
});
