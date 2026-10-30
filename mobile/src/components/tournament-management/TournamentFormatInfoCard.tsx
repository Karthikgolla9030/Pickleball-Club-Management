/**
 * Aught2 Pickleball — TournamentFormatInfoCard
 *
 * Standardized informational callout card displayed on tournament management tabs:
 * - Informational card: Light blue with Users / UserPlus icon, format title, and description
 * - Locked roster banner: Soft amber with Lock icon, title and description
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Users, UserPlus, Lock, Info, type LucideIcon } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Radius, Spacing } from '@/theme';

export interface TournamentFormatInfoCardProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  variant?: 'info' | 'locked' | 'neutral';
}

export function TournamentFormatInfoCard({
  title,
  description,
  icon: CustomIcon,
  variant = 'info',
}: TournamentFormatInfoCardProps) {
  const isLocked = variant === 'locked';
  const isNeutral = variant === 'neutral';

  const IconComponent =
    CustomIcon || (isLocked ? Lock : isNeutral ? Info : UserPlus);
  const iconColor = isLocked ? '#D97706' : isNeutral ? '#475569' : '#0284C7';

  return (
    <View
      style={[
        styles.card,
        isLocked ? styles.cardLocked : isNeutral ? styles.cardNeutral : styles.cardInfo,
      ]}
    >
      <View style={styles.iconCol}>
        <IconComponent size={20} color={iconColor} />
      </View>
      <View style={styles.contentCol}>
        <AppText
          style={[
            styles.title,
            isLocked ? styles.titleLocked : isNeutral ? styles.titleNeutral : styles.titleInfo,
          ]}
        >
          {title}
        </AppText>
        <AppText
          style={[
            styles.description,
            isLocked ? styles.descriptionLocked : isNeutral ? styles.descriptionNeutral : styles.descriptionInfo,
          ]}
        >
          {description}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: Radius.lg,
    padding: Spacing[3.5],
    gap: Spacing[3],
    borderWidth: 1,
  },
  cardInfo: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  cardLocked: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  cardNeutral: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  iconCol: {
    marginTop: 2,
  },
  contentCol: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  titleInfo: {
    color: '#0369A1',
  },
  titleLocked: {
    color: '#B45309',
  },
  titleNeutral: {
    color: '#0F172A',
  },
  description: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  descriptionInfo: {
    color: '#0284C7',
  },
  descriptionLocked: {
    color: '#92400E',
  },
  descriptionNeutral: {
    color: '#64748B',
  },
});

