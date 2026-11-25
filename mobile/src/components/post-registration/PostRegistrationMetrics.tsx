/**
 * Aught2 Pickleball — PostRegistrationMetrics
 *
 * Standardized responsive metrics display for post-registration configuration cards.
 * Prevents horizontal squeezing and text truncation on all viewports (320px - 430px).
 * No ellipsis clamping: labels wrap naturally in sentence case.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Radius, Spacing } from '@/theme';

export interface MetricItem {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  hint?: string;
}

export interface PostRegistrationMetricsProps {
  metrics: MetricItem[];
}

export function PostRegistrationMetrics({ metrics }: PostRegistrationMetricsProps) {
  return (
    <View style={styles.container}>
      {metrics.map((item, idx) => (
        <View key={idx} style={styles.tile}>
          <AppText style={styles.label}>
            {item.label}
          </AppText>
          <View style={styles.valueRow}>
            {item.icon ? <View style={styles.iconWrap}>{item.icon}</View> : null}
            <AppText style={styles.value}>
              {item.value}
            </AppText>
          </View>
          {item.hint ? (
            <AppText style={styles.hint}>
              {item.hint}
            </AppText>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  tile: {
    flex: 1,
    minWidth: 95,
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 15,
    marginBottom: Spacing[1],
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  iconWrap: {
    marginRight: 2,
  },
  value: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F766E',
    lineHeight: 22,
    textAlign: 'center',
  },
  hint: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
    textAlign: 'center',
  },
});
