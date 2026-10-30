/**
 * Aught2 Pickleball — TournamentSectionHeading
 *
 * Standardized section heading row for tournament management tabs:
 * - Left side: Title e.g. "Players (8)" or "Teams (4)", optional "· 8 Players" subtitle
 * - Center / Right: Category pill badge (e.g. [SINGLES], [DOUBLES], [SCRAMBLE], [POOLS])
 * - Right side: Optional action button e.g. "+ Add Player" / "+ Add Team"
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Plus } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Radius, Spacing } from '@/theme';

export interface TournamentSectionHeadingProps {
  title: string;
  subtitle?: string | null;
  badgeLabel?: string | null;
  badgeVariant?: 'blue' | 'green' | 'amber' | 'slate';
  actionLabel?: string;
  onActionPress?: () => void;
  actionDisabled?: boolean;
}

export function TournamentSectionHeading({
  title,
  subtitle,
  badgeLabel,
  badgeVariant = 'blue',
  actionLabel,
  onActionPress,
  actionDisabled = false,
}: TournamentSectionHeadingProps) {
  const badgeStyle =
    badgeVariant === 'green'
      ? styles.badgeGreen
      : badgeVariant === 'amber'
      ? styles.badgeAmber
      : badgeVariant === 'slate'
      ? styles.badgeSlate
      : styles.badgeBlue;

  const badgeTextStyle =
    badgeVariant === 'green'
      ? styles.badgeTextGreen
      : badgeVariant === 'amber'
      ? styles.badgeTextAmber
      : badgeVariant === 'slate'
      ? styles.badgeTextSlate
      : styles.badgeTextBlue;

  return (
    <View style={styles.container}>
      <View style={styles.leftCol}>
        <View style={styles.titleWrap}>
          <AppText style={styles.headingTitle}>{title}</AppText>
          {subtitle && <AppText style={styles.headingSubtitle}>{subtitle}</AppText>}
        </View>

        {badgeLabel && (
          <View style={[styles.badge, badgeStyle]}>
            <AppText style={badgeTextStyle}>{badgeLabel}</AppText>
          </View>
        )}
      </View>

      {actionLabel && onActionPress && (
        <TouchableOpacity
          style={[styles.actionBtn, actionDisabled && styles.actionBtnDisabled]}
          onPress={onActionPress}
          disabled={actionDisabled}
          activeOpacity={0.8}
        >
          <Plus size={14} color="#FFFFFF" strokeWidth={2.5} />
          <AppText style={styles.actionBtnText}>{actionLabel}</AppText>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    gap: 8,
  },
  leftCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  headingTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headingSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  badgeBlue: {
    backgroundColor: '#E0F2FE',
  },
  badgeTextBlue: {
    color: '#0284C7',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  badgeGreen: {
    backgroundColor: '#DCFCE7',
  },
  badgeTextGreen: {
    color: '#15803D',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  badgeAmber: {
    backgroundColor: '#FEF3C7',
  },
  badgeTextAmber: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  badgeSlate: {
    backgroundColor: '#F1F5F9',
  },
  badgeTextSlate: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#087A60',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    shadowColor: '#087A60',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});

