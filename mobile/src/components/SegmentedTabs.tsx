/**
 * SegmentedTabs — Compact pill-style segmented tab control.
 *
 * Light theme: light gray track, active tab = forest green.
 * 36px height, never overflows viewport width.
 */

import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { Colors, Radius, Spacing } from '@/theme';

interface Tab<T extends string> {
  key: T;
  label: string;
}

interface SegmentedTabsProps<T extends string> {
  tabs: Tab<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  /**
   * When true, renders tabs inside a horizontal ScrollView.
   * Use for 5+ tabs to prevent viewport overflow.
   */
  scrollable?: boolean;
  /** Minimum width per tab in scrollable mode (default 88px) */
  minTabWidth?: number;
  /** Outer container style */
  style?: ViewStyle;
}

export function SegmentedTabs<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  scrollable = false,
  minTabWidth = 88,
  style,
}: SegmentedTabsProps<T>) {
  const renderTab = (tab: Tab<T>) => {
    const isActive = tab.key === activeTab;
    return (
      <TouchableOpacity
        key={tab.key}
        style={[
          styles.tab,
          scrollable ? { minWidth: minTabWidth } : styles.tabFlex,
          isActive && styles.tabActive,
        ]}
        onPress={() => onTabChange(tab.key)}
        activeOpacity={0.8}
        accessibilityRole="tab"
        accessibilityLabel={tab.label}
        accessibilityState={{ selected: isActive }}
      >
        <AppText
          variant="caption"
          bold={isActive}
          style={[
            styles.label,
            isActive ? styles.labelActive : styles.labelInactive,
          ]}
          numberOfLines={1}
        >
          {tab.label}
        </AppText>
      </TouchableOpacity>
    );
  };

  if (!scrollable) {
    return (
      <View style={[styles.container, style]}>
        {tabs.map((tab) => renderTab(tab))}
      </View>
    );
  }

  return (
    <View style={style}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        bounces={false}
      >
        <View style={styles.container}>
          {tabs.map((tab) => renderTab(tab))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    padding: 3,
  },
  scrollContent: {
    flexGrow: 1,
  },
  tab: {
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    paddingHorizontal: Spacing[3],
  },
  tabFlex: {
    flex: 1,
  },
  tabActive: {
    backgroundColor: '#176B57', // Dark forest green
  },
  label: {
    textAlign: 'center',
    fontSize: 13,
  },
  labelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  labelInactive: {
    color: '#102B2A',
    fontWeight: '500',
  },
});
