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
import { Lock, Users } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Radius, Spacing } from '@/theme';

interface RegistrationOpenBannerProps {
  tournamentName?: string;
  participantCount?: number;
  maxParticipants?: number | null;
  onCloseRegistration: () => void | Promise<void>;
  isClosing?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function RegistrationOpenBanner({
  tournamentName,
  participantCount = 0,
  maxParticipants,
  onCloseRegistration,
  isClosing = false,
  style,
}: RegistrationOpenBannerProps) {
  const countText = maxParticipants ? `${participantCount} / ${maxParticipants}` : `${participantCount}`;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.contentRow}>
        <View style={styles.iconWrap}>
          <Users size={18} color="#087A60" />
        </View>

        <View style={styles.textWrap}>
          <View style={styles.badgeRow}>
            <View style={styles.statusBadge}>
              <AppText variant="caption" style={styles.statusBadgeText}>
                REGISTRATION OPEN
              </AppText>
            </View>
            <AppText variant="caption" color="secondary" style={styles.countText}>
              {countText} registered
            </AppText>
          </View>
          <AppText variant="caption" color="secondary" style={styles.descText} numberOfLines={2}>
            Players can register in the Player App. Close registration to lock rosters & proceed.
          </AppText>
        </View>

        <TouchableOpacity
          style={[styles.closeButton, isClosing && styles.closeButtonDisabled]}
          onPress={onCloseRegistration}
          disabled={isClosing}
          activeOpacity={0.8}
          accessibilityLabel="Close registration and finalize rosters"
        >
          {isClosing ? (
            <ActivityIndicator size="small" color="#E11D48" />
          ) : (
            <>
              <Lock size={13} color="#E11D48" style={styles.lockIcon} />
              <AppText variant="caption" bold style={styles.closeButtonText}>
                Close Reg
              </AppText>
            </>
          )}
        </TouchableOpacity>
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
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2.5],
    marginHorizontal: Spacing[4],
    marginTop: Spacing[2],
    marginBottom: Spacing[2],
    shadowColor: '#087A60',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2.5],
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  statusBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: Spacing[2],
    paddingVertical: 1,
    borderRadius: Radius.sm,
  },
  statusBadgeText: {
    color: '#087A60',
    fontWeight: '800',
    fontSize: 9.5,
    letterSpacing: 0.5,
  },
  countText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#15803D',
  },
  descText: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 14,
  },
  closeButton: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  closeButtonDisabled: {
    opacity: 0.6,
  },
  lockIcon: {
    marginRight: 2,
  },
  closeButtonText: {
    color: '#E11D48',
    fontSize: 11.5,
    fontWeight: '700',
  },
});
