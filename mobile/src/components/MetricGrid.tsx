/**
 * MetricGrid — Responsive 2-column stats/metric grid.
 *
 * Displays metric label/value pairs in a 2-column grid that works
 * reliably on all phone widths (320px–414px+).
 *
 * Instead of a cramped 3–4 column horizontal row that clips on small
 * phones, each metric cell gets enough room to breathe.
 *
 * Usage:
 *   <MetricGrid metrics={[
 *     { label: 'Total', value: '24' },
 *     { label: 'Published', value: '12', variant: 'success' },
 *     { label: 'Draft', value: '8', variant: 'warning' },
 *     { label: 'Completed', value: '4', variant: 'info' },
 *   ]} />
 */

import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { Colors, Radius, Spacing } from '@/theme';

type MetricVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'brand';

export interface MetricItem {
  label: string;
  value: string | number;
  variant?: MetricVariant;
  /** Optional sub-label below value */
  sublabel?: string;
  /** Optional icon node to render above the label */
  icon?: React.ReactNode;
}

interface MetricGridProps {
  metrics: MetricItem[];
  columns?: 2 | 3 | 4;
  horizontal?: boolean;
  valueFirst?: boolean;
  style?: ViewStyle;
}

const variantLabelColor: Record<MetricVariant, string> = {
  default: '#4B5563',
  success: '#166534',
  warning: '#92400E',
  error: '#B42318',
  info: '#1E40AF',
  brand: '#166534',
};

const variantValueColor: Record<MetricVariant, string> = {
  default: '#111827',
  success: '#14532D',
  warning: '#78350F',
  error: '#991B1B',
  info: '#1E3A8A',
  brand: '#14532D',
};

const variantBg: Record<MetricVariant, string> = {
  default: '#F0F4F8',
  success: '#E5F6EC',
  warning: '#FFF5D8',
  error: '#FDE8E8',
  info: '#E7F0FB',
  brand: '#E5F6EC',
};

import { ScrollView } from 'react-native';

export function MetricGrid({ metrics, columns = 2, horizontal = false, valueFirst = false, style }: MetricGridProps) {
  const content = metrics.map((metric, index) => {
    const variant = metric.variant ?? 'default';
    const valueColor = variantValueColor[variant];
    const bg = variantBg[variant];

    const getColumnStyle = () => {
      if (columns === 4) return styles.cellFour;
      if (columns === 3) return styles.cellThird;
      return styles.cellHalf;
    };

    return (
      <View
        key={index}
        style={[
          styles.cell,
          horizontal
            ? { width: 100, marginRight: index === metrics.length - 1 ? 0 : Spacing[2] }
            : getColumnStyle(),
          { backgroundColor: bg },
        ]}
      >
        {metric.icon ? (
          <View style={styles.iconWrapper}>{metric.icon}</View>
        ) : null}
        {valueFirst ? (
          <>
            <AppText
              variant="heading3"
              style={[styles.value, { color: valueColor }]}
              numberOfLines={1}
            >
              {String(metric.value)}
            </AppText>
            <AppText
              variant="caption"
              style={[styles.label, { color: variantLabelColor[variant] }]}
              numberOfLines={1}
            >
              {metric.label}
            </AppText>
          </>
        ) : (
          <>
            <AppText
              variant="caption"
              style={[styles.label, { color: variantLabelColor[variant] }]}
              numberOfLines={1}
            >
              {metric.label}
            </AppText>
            <AppText
              variant="heading3"
              style={[styles.value, { color: valueColor }]}
              numberOfLines={1}
            >
              {String(metric.value)}
            </AppText>
          </>
        )}
        {metric.sublabel ? (
          <AppText variant="caption" color="secondary" numberOfLines={1}>
            {metric.sublabel}
          </AppText>
        ) : null}
      </View>
    );
  });

  if (horizontal) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={style}
      >
        {content}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.grid, style]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cell: {
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    minWidth: 0,
  },
  cellFour: {
    flex: 1,
    minWidth: 0,
  },
  cellHalf: {
    flexBasis: '48%',
    flexGrow: 1,
  },
  cellThird: {
    flexBasis: '30%',
    flexGrow: 1,
  },
  iconWrapper: {
    marginBottom: 4,
  },
  label: {
    letterSpacing: 0.1,
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
  },
});
