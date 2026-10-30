/**
 * Aught2 Pickleball — PlayerTournamentTabs
 *
 * Horizontal scrolling pill navigation tabs:
 * - Active tab: Dark green pill with white bold text
 * - Inactive tabs: Light gray pill with subtle border
 * - Smooth horizontal scroll on smaller screens
 */

import React, { useEffect, useRef } from 'react';
import {
  ScrollView,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

import { AppText } from '@/components/AppText';

export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

export interface PlayerTournamentTabsProps {
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (key: string) => void;
  style?: StyleProp<ViewStyle>;
}

export function PlayerTournamentTabs({
  tabs,
  activeTab,
  onTabChange,
  style,
}: PlayerTournamentTabsProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const tabLayouts = useRef<{ [key: string]: { x: number; width: number } }>({});

  useEffect(() => {
    const layout = tabLayouts.current[activeTab];
    if (layout && scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        x: Math.max(0, layout.x - 32),
        animated: true,
      });
    }
  }, [activeTab]);

  return (
    <View style={[styles.container, style]}>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const displayLabel =
            typeof tab.count === 'number' && tab.count >= 0
              ? `${tab.label} (${tab.count})`
              : tab.label;

          return (
            <TouchableOpacity
              key={tab.key}
              onLayout={(e) => {
                tabLayouts.current[tab.key] = {
                  x: e.nativeEvent.layout.x,
                  width: e.nativeEvent.layout.width,
                };
              }}
              style={[styles.pill, isActive && styles.pillActive]}
              onPress={() => onTabChange(tab.key)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <AppText
                variant="caption"
                bold
                style={[styles.pillText, isActive && styles.pillTextActive]}
              >
                {displayLabel}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    zIndex: 10,
    elevation: 4,
  },
  scrollContent: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  pillText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

