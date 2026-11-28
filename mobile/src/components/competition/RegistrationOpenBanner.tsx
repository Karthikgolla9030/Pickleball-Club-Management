/**
 * Aught2 Pickleball — RegistrationOpenBanner
 *
 * Prominent banner displayed in club tournament workspaces when registration is Open:
 * - Informs club staff that registration is active and players can join
 * - Shows current registration count
 * - Provides a direct, standardized "Close Registration" action button
 */

import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { AlertTriangle, Users } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Radius, Spacing } from '@/theme';
import type { ClosureEligibility } from '@/types';

interface RegistrationOpenBannerProps {
  tournamentName?: string;
  participantCount?: number;
  maxParticipants?: number | null;
  unitLabel?: string;
  confirmedPlayersCount?: number | null;
  closureEligibility?: ClosureEligibility | null;
  onCloseRegistration?: () => void | Promise<void>;
  isClosing?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function RegistrationOpenBanner({
  tournamentName,
  participantCount = 0,
  maxParticipants,
  unitLabel,
  confirmedPlayersCount,
  closureEligibility,
  style,
}: RegistrationOpenBannerProps) {
  const ratio = maxParticipants ? `${participantCount} / ${maxParticipants}` : `${participantCount}`;
  const labelSuffix = unitLabel ? ` ${unitLabel}` : ' registered';
  const countText =
    confirmedPlayersCount != null && unitLabel && unitLabel.toLowerCase().includes('team')
      ? `${ratio}${labelSuffix} (${confirmedPlayersCount} Players)`
      : `${ratio}${labelSuffix}`;
  const isClosureBlocked = Boolean(closureEligibility && !closureEligibility.can_close);

  return (
    <View style={[styles.container, isClosureBlocked && styles.containerBlocked, style]}>
      <View style={styles.contentRow}>
        <View style={[styles.iconWrap, isClosureBlocked && styles.iconWrapBlocked]}>
          {isClosureBlocked ? (
            <AlertTriangle size={18} color="#B45309" />
          ) : (
            <Users size={18} color="#087A60" />
          )}
        </View>

        <View style={styles.textWrap}>
          <View style={styles.badgeRow}>
            <View style={[styles.statusBadge, isClosureBlocked && styles.statusBadgeBlocked]}>
              <View style={[styles.liveDot, isClosureBlocked && styles.liveDotBlocked]} />
              <AppText variant="caption" style={[styles.statusBadgeText, isClosureBlocked && styles.statusBadgeTextBlocked]}>
                REGISTRATION OPEN
              </AppText>
            </View>
            <View style={styles.countPill}>
              <AppText variant="caption" style={styles.countText}>
                {countText}
              </AppText>
            </View>
          </View>
          <AppText variant="caption" style={styles.descText}>
            {isClosureBlocked && closureEligibility?.blocking_reason
              ? closureEligibility.blocking_reason
              : 'Players can register in the Player App. Registration can be closed once ready.'}
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F0FDF4', // Light green background
    borderWidth: 1,
    borderColor: '#BBF7D0', // Green 200 border
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    marginHorizontal: Spacing[4],
    marginTop: Spacing[2],
    marginBottom: Spacing[3],
    shadowColor: '#087A60',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  containerBlocked: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  iconWrapBlocked: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeBlocked: {
    backgroundColor: '#FEF3C7',
  },
  liveDotBlocked: {
    backgroundColor: '#D97706',
  },
  statusBadgeTextBlocked: {
    color: '#B45309',
  },
  textWrap: {
    flex: 1,
    gap: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: Spacing[2.5],
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  statusBadgeText: {
    color: '#087A60',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  countPill: {
    backgroundColor: '#E7F7ED',
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#C6F0D3',
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  descText: {
    fontSize: 11.5,
    color: '#334155',
    lineHeight: 16,
  },
});

