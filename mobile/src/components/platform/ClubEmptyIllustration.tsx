import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Building2 } from 'lucide-react-native';

interface ClubEmptyIllustrationProps {
  width?: number;
  height?: number;
}

export function ClubEmptyIllustration({ width = 160, height = 120 }: ClubEmptyIllustrationProps) {
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { width, height }]}>
        {React.createElement(
          'svg',
          {
            viewBox: '0 0 200 150',
            width: '100%',
            height: '100%',
            fill: 'none',
            xmlns: 'http://www.w3.org/2000/svg',
            style: { overflow: 'visible', maxWidth: '100%', maxHeight: '100%' },
          },
          // Soft Mint Green Circle Backdrop
          React.createElement('circle', { cx: 100, cy: 80, r: 50, fill: '#E6F5EC' }),

          // Subtle Soft Clouds
          React.createElement('path', {
            d: 'M 45 74 C 41 74 38 77 38 80 C 38 83 41 85 45 85 L 65 85 C 69 85 72 83 72 80 C 72 77 69 74 65 74 Z',
            fill: '#F1F5F9',
            opacity: 0.85,
          }),
          React.createElement('path', {
            d: 'M 135 62 C 131 62 128 65 128 68 C 128 71 131 73 135 73 L 155 73 C 159 73 162 71 162 68 C 162 65 159 62 155 62 Z',
            fill: '#F1F5F9',
            opacity: 0.85,
          }),

          // Base Ground Line
          React.createElement('line', {
            x1: 40,
            y1: 120,
            x2: 160,
            y2: 120,
            stroke: '#334155',
            strokeWidth: 2.2,
            strokeLinecap: 'round',
          }),

          // Left Annex Wing
          React.createElement('rect', {
            x: 54,
            y: 88,
            width: 20,
            height: 32,
            fill: '#86EFAC',
            stroke: '#334155',
            strokeWidth: 2,
          }),
          React.createElement('rect', {
            x: 52,
            y: 85,
            width: 24,
            height: 4,
            rx: 1,
            fill: '#4ADE80',
            stroke: '#334155',
            strokeWidth: 1.5,
          }),
          React.createElement('path', {
            d: 'M 46 120 C 46 113 54 113 54 120 Z',
            fill: '#4ADE80',
            stroke: '#334155',
            strokeWidth: 1.5,
          }),

          // Right Annex Wing
          React.createElement('rect', {
            x: 126,
            y: 88,
            width: 20,
            height: 32,
            fill: '#86EFAC',
            stroke: '#334155',
            strokeWidth: 2,
          }),
          React.createElement('rect', {
            x: 124,
            y: 85,
            width: 24,
            height: 4,
            rx: 1,
            fill: '#4ADE80',
            stroke: '#334155',
            strokeWidth: 1.5,
          }),
          React.createElement('path', {
            d: 'M 146 120 C 146 113 154 113 154 120 Z',
            fill: '#4ADE80',
            stroke: '#334155',
            strokeWidth: 1.5,
          }),

          // Main Central 2-Story Building
          React.createElement('rect', {
            x: 74,
            y: 66,
            width: 52,
            height: 54,
            fill: '#FFFFFF',
            stroke: '#334155',
            strokeWidth: 2,
          }),
          React.createElement('rect', {
            x: 71,
            y: 62,
            width: 58,
            height: 5,
            rx: 1,
            fill: '#E2E8F0',
            stroke: '#334155',
            strokeWidth: 1.8,
          }),

          // Rooftop Flagpole & Pennant
          React.createElement('line', {
            x1: 100,
            y1: 50,
            x2: 100,
            y2: 62,
            stroke: '#334155',
            strokeWidth: 1.5,
          }),
          React.createElement('path', {
            d: 'M 100 50 L 110 54 L 100 58 Z',
            fill: '#22C55E',
            stroke: '#16A34A',
            strokeWidth: 0.8,
          }),

          // Top Floor Windows (3 cyan squares)
          React.createElement('rect', {
            x: 80,
            y: 72,
            width: 9,
            height: 9,
            rx: 1,
            fill: '#BAE6FD',
            stroke: '#334155',
            strokeWidth: 1.5,
          }),
          React.createElement('rect', {
            x: 95.5,
            y: 72,
            width: 9,
            height: 9,
            rx: 1,
            fill: '#BAE6FD',
            stroke: '#334155',
            strokeWidth: 1.5,
          }),
          React.createElement('rect', {
            x: 111,
            y: 72,
            width: 9,
            height: 9,
            rx: 1,
            fill: '#BAE6FD',
            stroke: '#334155',
            strokeWidth: 1.5,
          }),

          // Ground Floor Entrance Double Door
          React.createElement('rect', {
            x: 90,
            y: 94,
            width: 20,
            height: 26,
            fill: '#F8FAFC',
            stroke: '#334155',
            strokeWidth: 1.5,
          }),
          React.createElement('line', {
            x1: 100,
            y1: 94,
            x2: 100,
            y2: 120,
            stroke: '#334155',
            strokeWidth: 1.2,
          }),
          React.createElement('rect', {
            x: 92.5,
            y: 97,
            width: 5.5,
            height: 7,
            rx: 0.5,
            fill: '#BAE6FD',
            stroke: '#334155',
            strokeWidth: 1,
          }),
          React.createElement('rect', {
            x: 102,
            y: 97,
            width: 5.5,
            height: 7,
            rx: 0.5,
            fill: '#BAE6FD',
            stroke: '#334155',
            strokeWidth: 1,
          }),
          React.createElement('circle', { cx: 98, cy: 110, r: 0.8, fill: '#334155' }),
          React.createElement('circle', { cx: 102, cy: 110, r: 0.8, fill: '#334155' })
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, styles.nativeContainer, { width, height }]}>
      <Building2 size={height * 0.45} color="#15803D" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  nativeContainer: {
    backgroundColor: '#E6F5EC',
    borderRadius: 60,
  },
});
