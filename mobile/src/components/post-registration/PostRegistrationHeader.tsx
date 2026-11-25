/**
 * Aught2 Pickleball — PostRegistrationHeader
 *
 * Responsive, standardized header for post-registration format configuration cards.
 * Prevents horizontal overflow and text clipping on mobile viewports (320px - 430px+).
 * Allows natural wrapping without ellipses.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Radius, Spacing } from '@/theme';

export interface PostRegistrationHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badgeLabel: string;
  badgeVariant?: 'success' | 'warning' | 'info' | 'default';
}

export function PostRegistrationHeader({
  icon,
  title,
  subtitle,
  badgeLabel,
  badgeVariant = 'warning',
}: PostRegistrationHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.leftCol}>
          <View style={styles.iconCircle}>
            {icon}
          </View>
          <View style={styles.titleWrap}>
            <AppText style={styles.title}>
              {title}
            </AppText>
          </View>
        </View>

        <View style={styles.badgeWrap}>
          <Badge
            label={badgeLabel}
            variant={badgeVariant}
            size="sm"
          />
        </View>
      </View>

      {subtitle ? (
        <AppText style={styles.subtitle}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[1.5],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  leftCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2.5],
    minWidth: 0, // Critical for React Native text shrinking/wrapping
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#DEF2E6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 20,
  },
  badgeWrap: {
    flexShrink: 0,
    alignSelf: 'center',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginTop: 1,
  },
});
