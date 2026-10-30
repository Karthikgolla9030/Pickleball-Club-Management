/**
 * Aught2 Pickleball — PlayerTournamentHeader
 *
 * Standardized fixed top navigation bar across all player tournament details:
 * - Back arrow with "Tournaments" title
 * - Share tournament action
 * - More options action
 */

import React from 'react';
import {
  Alert,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, MoreVertical, Share2 } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import type { Tournament } from '@/types';

export interface PlayerTournamentHeaderProps {
  tournament: Tournament;
  onBack: () => void;
  onShare?: () => void;
  onOptionsPress?: () => void;
}

export function PlayerTournamentHeader({
  tournament,
  onBack,
  onShare,
  onOptionsPress,
}: PlayerTournamentHeaderProps) {
  const insets = useSafeAreaInsets();

  const handleShare = async () => {
    if (onShare) {
      onShare();
      return;
    }
    try {
      await Share.share({
        message: `Check out ${tournament.name} on Aught2 Pickleball!`,
        title: tournament.name,
      });
    } catch {
      // Ignored
    }
  };

  const handleMore = () => {
    if (onOptionsPress) {
      onOptionsPress();
      return;
    }
    Alert.alert(
      tournament.name,
      `Status: ${tournament.status_label || tournament.status}\nFormat: ${tournament.format_label || tournament.format}`,
      [{ text: 'Close', style: 'cancel' }]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 10) }]}>
      <View style={styles.inner}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Back to tournaments"
          accessibilityRole="button"
        >
          <ArrowLeft size={22} color="#0F172A" />
          <AppText style={styles.title}>Tournaments</AppText>
        </TouchableOpacity>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            onPress={handleShare}
            style={styles.iconBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Share tournament"
            accessibilityRole="button"
          >
            <Share2 size={20} color="#0F172A" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleMore}
            style={styles.iconBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="More options"
            accessibilityRole="button"
          >
            <MoreVertical size={20} color="#0F172A" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  inner: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBtn: {
    padding: 6,
    borderRadius: 8,
  },
});

