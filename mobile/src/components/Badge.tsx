/**
 * Badge — Role and status indicator.
 *
 * Light theme: tinted background + solid text color.
 * Never uses solid colored blocks — always a gentle tint with dark text.
 *
 * Tournament status variants:
 *   'in_progress', 'completed', 'cancelled', 'draft', 'registration_open'
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Colors, Radius, Typography } from '@/theme';
import { AppText } from './AppText';
import type { ClubRole } from '@/types';

type BadgeVariant =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'default'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'draft'
  | 'registration_open';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  role?: ClubRole;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  style?: any;
  textStyle?: any;
  numberOfLines?: number;
  noUppercase?: boolean;
}

const variantColors: Record<BadgeVariant, { bg: string; text: string }> = {
  // Generic states
  success:           { bg: Colors.status.successBg,          text: Colors.status.success },
  warning:           { bg: Colors.status.warningBg,          text: Colors.status.warning },
  error:             { bg: Colors.status.errorBg,            text: Colors.status.error },
  info:              { bg: Colors.status.infoBg,             text: Colors.status.info },
  default:           { bg: Colors.surface.elevated,          text: Colors.text.secondary },
  // Tournament-specific status
  in_progress:       { bg: Colors.status.inProgressBg,       text: Colors.status.inProgress },
  completed:         { bg: Colors.status.completedBg,        text: Colors.status.completed },
  cancelled:         { bg: Colors.status.cancelledBg,        text: Colors.status.cancelled },
  draft:             { bg: Colors.status.draftBg,            text: Colors.status.draft },
  registration_open: { bg: Colors.status.registrationOpenBg, text: Colors.status.registrationOpen },
};

const roleColors: Record<ClubRole, { bg: string; text: string }> = {
  club_owner:           { bg: '#FEF3C7', text: Colors.roles.clubOwner },
  club_manager:         { bg: '#DCEBFF', text: Colors.roles.clubManager },
  tournament_director:  { bg: '#EDE9FE', text: Colors.roles.tournamentDirector },
  staff_member:         { bg: '#F1F5F9', text: Colors.roles.staffMember },
};

export function Badge({
  label,
  variant = 'default',
  role,
  size = 'md',
  icon,
  style,
  textStyle,
  numberOfLines,
  noUppercase = false,
}: BadgeProps) {
  const colors = role ? roleColors[role] : variantColors[variant];

  return (
    <View
      style={[
        styles.badge,
        size === 'sm' && styles.badgeSm,
        { backgroundColor: colors.bg },
        style,
      ]}
    >
      <View style={styles.contentRow}>
        {icon && <View style={styles.iconContainer}>{icon}</View>}
        <AppText
          variant="caption"
          style={[
            styles.label,
            size === 'sm' && styles.labelSm,
            noUppercase && styles.labelNoUppercase,
            { color: colors.text },
            textStyle,
          ]}
          uppercase={!noUppercase}
          numberOfLines={numberOfLines}
        >
          {label}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.md, // 8px
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  badgeSm: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
  },
  label: {
    fontSize: 11,
    fontWeight: Typography.weight.bold,
    letterSpacing: 0.3,
    lineHeight: 15,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  labelSm: {
    fontSize: 10,
    lineHeight: 14,
  },
  labelNoUppercase: {
    textTransform: 'none',
    letterSpacing: 0,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
