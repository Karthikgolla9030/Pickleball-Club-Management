/**
 * AppHeader — Top navigation bar for every screen.
 *
 * Renders:
 *   [☰ Menu] or [← Back]  |  Title + optional subtitle  |  [Optional Right Action]
 *
 * Integrates with the drawer store to toggle the slide-out menu.
 * When used with Stack navigation, the back button uses router.back().
 */

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Menu, ArrowLeft } from 'lucide-react-native';

import { AppText } from './AppText';
import { useDrawerStore } from '@/navigation';
import { Colors, Spacing } from '@/theme';

interface AppHeaderProps {
  title: string;
  /** Optional subtitle rendered below the title */
  subtitle?: string;
  /** Show hamburger menu button (default true) */
  showMenu?: boolean;
  /** Show back arrow instead of hamburger */
  showBack?: boolean;
  /** Optional element rendered on the right side */
  rightElement?: React.ReactNode;
  /** Remove bottom border for seamless background */
  borderless?: boolean;
  /** Custom container style */
  style?: any;
}

export function AppHeader({
  title,
  subtitle,
  showMenu = true,
  showBack = false,
  rightElement,
  borderless = false,
  style,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const openDrawer = useDrawerStore((s) => s.openDrawer);

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 6 },
        borderless && { borderBottomWidth: 0 },
        style,
      ]}
    >
      <View style={styles.inner}>
        {/* Left button */}
        {showBack ? (
          <Pressable
            onPress={() => router.back()}
            style={styles.iconButton}
            hitSlop={8}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ArrowLeft size={22} color={Colors.text.primary} strokeWidth={2} />
          </Pressable>
        ) : showMenu ? (
          <Pressable
            onPress={openDrawer}
            style={styles.iconButton}
            hitSlop={8}
            accessibilityLabel="Open navigation menu"
            accessibilityRole="button"
          >
            <Menu size={22} color={Colors.text.primary} strokeWidth={2} />
          </Pressable>
        ) : (
          <View style={styles.iconPlaceholder} />
        )}

        {/* Title + optional subtitle */}
        <View style={styles.titleBlock}>
          <AppText
            variant="title"
            numberOfLines={1}
            style={styles.title}
          >
            {title}
          </AppText>
          {subtitle ? (
            <AppText
              variant="caption"
              color="secondary"
              numberOfLines={1}
              style={styles.subtitle}
            >
              {subtitle}
            </AppText>
          ) : null}
        </View>

        {/* Right element */}
        {rightElement ? (
          <View style={styles.rightSlot}>{rightElement}</View>
        ) : (
          <View style={styles.iconPlaceholder} />
        )}
      </View>
    </View>
  );
}

const HEADER_HEIGHT = 52;

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background.primary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
  },
  inner: {
    minHeight: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconPlaceholder: {
    width: 36,
    height: 36,
    flexShrink: 0,
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    textAlign: 'left',
    fontSize: 22,
    fontWeight: '700',
    color: '#102B2A',
  },
  subtitle: {
    textAlign: 'left',
    fontSize: 13,
    color: '#667776',
  },
  rightSlot: {
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
