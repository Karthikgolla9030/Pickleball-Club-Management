/**
 * Aught2 Pickleball — Shared Club Details UI Primitives
 *
 * Unified design system used consistently across all four Club Details tabs:
 * Profile, Branding, Tournament Configuration, and Preview.
 */

import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/AppText';
import { Shadows, Spacing } from '@/theme';

export const CLUB_DETAILS_MAX_WIDTH = 820;

interface ClubResponsiveContainerProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Centers tab content cleanly on tablet/desktop while keeping consistent 16px mobile margins. */
export function ClubResponsiveContainer({ children, style }: ClubResponsiveContainerProps) {
  return <View style={[styles.responsiveWrap, style]}>{children}</View>;
}

interface ClubSectionCardProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Standard white Club Details section card with consistent radius, border, and spacing. */
export function ClubSectionCard({
  title,
  subtitle,
  action,
  children,
  style,
}: ClubSectionCardProps) {
  return (
    <View style={[styles.sectionCard, style]}>
      {(title || action) && (
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderText}>
            {title ? <AppText style={styles.sectionTitle}>{title}</AppText> : null}
            {subtitle ? <AppText style={styles.sectionSubtitle}>{subtitle}</AppText> : null}
          </View>
          {action ? <View style={styles.sectionAction}>{action}</View> : null}
        </View>
      )}
      {children}
    </View>
  );
}

interface ClubInfoRowProps {
  icon?: React.ReactNode;
  label: string;
  value?: string | null;
  emptyText?: string;
  isLast?: boolean;
  onPress?: () => void;
  trailingIcon?: React.ReactNode;
}

/** Compact key-value row with left-aligned icon/label and natural-wrapping value. */
export function ClubInfoRow({
  icon,
  label,
  value,
  emptyText = 'Not provided',
  isLast = false,
  onPress,
  trailingIcon,
}: ClubInfoRowProps) {
  const cleanValue = value?.trim();

  const valueNode = cleanValue ? (
    onPress ? (
      <TouchableOpacity
        style={styles.infoLinkButton}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <AppText style={styles.infoLinkText}>{cleanValue}</AppText>
        {trailingIcon}
      </TouchableOpacity>
    ) : (
      <AppText style={styles.infoValue}>{cleanValue}</AppText>
    )
  ) : (
    <AppText style={styles.infoMuted}>{emptyText}</AppText>
  );

  return (
    <View style={[styles.infoRow, !isLast && styles.infoRowBorder]}>
      <View style={styles.infoLabelGroup}>
        {icon ? <View style={styles.infoIconWrap}>{icon}</View> : null}
        <AppText style={styles.infoLabel}>{label}</AppText>
      </View>
      <View style={styles.infoValueWrap}>{valueNode}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  responsiveWrap: {
    width: '100%',
    maxWidth: CLUB_DETAILS_MAX_WIDTH,
    alignSelf: 'center',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3.5],
    borderWidth: 1,
    borderColor: '#E2EAE6',
    gap: Spacing[2.5],
    ...Shadows.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
    paddingBottom: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  sectionHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102B2A',
    letterSpacing: -0.1,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#5C726D',
    lineHeight: 16,
  },
  sectionAction: {
    flexShrink: 0,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 9,
    gap: 12,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  infoLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 96,
    flexShrink: 0,
    paddingTop: 1,
  },
  infoIconWrap: {
    width: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#49635E',
  },
  infoValueWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
  },
  infoValue: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#102B2A',
    lineHeight: 19,
    textAlign: 'right',
  },
  infoMuted: {
    fontSize: 13,
    color: '#8A9C96',
    fontStyle: 'italic',
    lineHeight: 19,
    textAlign: 'right',
  },
  infoLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    maxWidth: '100%',
  },
  infoLinkText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#176B57',
    textDecorationLine: 'underline',
    lineHeight: 19,
    textAlign: 'right',
    flexShrink: 1,
  },
});
