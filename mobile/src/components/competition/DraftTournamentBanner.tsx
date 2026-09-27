/**
 * Aught2 Pickleball — DraftTournamentBanner
 *
 * Prominent banner displayed in club workspaces when a tournament is in Draft mode:
 * - Alerts club staff that the tournament is completely hidden from players
 * - Provides a one-click "Publish & Open Registration" action button
 * - Reactive loading state during publication
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
import { EyeOff, Send, ShieldAlert } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Colors, Radius, Spacing } from '@/theme';

interface DraftTournamentBannerProps {
  tournamentName?: string;
  onPublish: () => void | Promise<void>;
  isPublishing?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function DraftTournamentBanner({
  tournamentName,
  onPublish,
  isPublishing = false,
  style,
}: DraftTournamentBannerProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.contentRow}>
        <View style={styles.iconWrap}>
          <EyeOff size={18} color="#D97706" />
        </View>

        <View style={styles.textWrap}>
          <View style={styles.badgeRow}>
            <View style={styles.draftBadge}>
              <AppText variant="caption" style={styles.draftBadgeText}>
                DRAFT MODE
              </AppText>
            </View>
            <AppText variant="caption" color="secondary" style={styles.visibilityText}>
              Hidden from players
            </AppText>
          </View>
          <AppText variant="caption" color="secondary" style={styles.descText} numberOfLines={2}>
            Players cannot discover or register for this tournament until published.
          </AppText>
        </View>

        <TouchableOpacity
          style={[styles.publishButton, isPublishing && styles.publishButtonDisabled]}
          onPress={onPublish}
          disabled={isPublishing}
          activeOpacity={0.8}
          accessibilityLabel="Publish tournament and open for registration"
        >
          {isPublishing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Send size={14} color="#FFFFFF" style={styles.sendIcon} />
              <AppText variant="caption" bold style={styles.publishButtonText}>
                Publish & Open
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
    backgroundColor: '#FFFBEB', // Light amber background
    borderWidth: 1,
    borderColor: '#FDE68A', // Amber 200 border
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2.5],
    marginHorizontal: Spacing[4],
    marginTop: Spacing[2],
    marginBottom: Spacing[2],
    shadowColor: '#B45309',
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
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FEF3C7',
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
    gap: Spacing[1.5],
  },
  draftBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  draftBadgeText: {
    color: '#B45309',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.6,
  },
  visibilityText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#78350F',
  },
  descText: {
    fontSize: 11,
    lineHeight: 15,
    color: '#92400E',
  },
  publishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#087A60', // Emerald green brand color
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    gap: 5,
    shadowColor: '#087A60',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  publishButtonDisabled: {
    opacity: 0.6,
  },
  sendIcon: {
    marginRight: 2,
  },
  publishButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
