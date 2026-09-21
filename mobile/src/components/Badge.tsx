/**
 * Badge — Role and status indicator.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '@/theme';
import { AppText } from './AppText';
import type { ClubRole } from '@/types';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'default';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  role?: ClubRole;
}

const variantColors: Record<BadgeVariant, { bg: string; text: string; border: string }> = {
  success: { bg: Colors.status.successBg, text: Colors.status.success, border: Colors.status.success },
  warning: { bg: Colors.status.warningBg, text: Colors.status.warning, border: Colors.status.warning },
  error: { bg: Colors.status.errorBg, text: Colors.status.error, border: Colors.status.error },
  info: { bg: Colors.status.infoBg, text: Colors.status.info, border: Colors.status.info },
  default: { bg: Colors.surface.elevated, text: Colors.text.secondary, border: Colors.surface.border },
};

const roleColors: Record<ClubRole, { bg: string; text: string; border: string }> = {
  club_owner: { bg: 'rgba(245, 166, 35, 0.12)', text: Colors.roles.clubOwner, border: Colors.roles.clubOwner },
  club_manager: { bg: 'rgba(59, 130, 246, 0.12)', text: Colors.roles.clubManager, border: Colors.roles.clubManager },
  tournament_director: { bg: 'rgba(139, 92, 246, 0.12)', text: Colors.roles.tournamentDirector, border: Colors.roles.tournamentDirector },
};

export function Badge({ label, variant = 'default', role }: BadgeProps) {
  const colors = role ? roleColors[role] : variantColors[variant];

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <AppText
        variant="caption"
        style={[styles.label, { color: colors.text }]}
        uppercase
      >
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing[2],
    paddingVertical: Spacing[0.5],
    borderRadius: Radius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    letterSpacing: 0.5,
  },
});
