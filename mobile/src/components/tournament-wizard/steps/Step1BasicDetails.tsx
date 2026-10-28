/**
 * Aught2 Pickleball — Step 1: Basic Details
 *
 * Collects:
 * - Tournament Name (required)
 * - Description (optional notes)
 * - Venue / Location (location_name)
 * - Club / Organizer Context (derived from active club, read-only)
 * - Optional Tournament Banner (with fallback preview to club format default)
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Image as ImageIcon, RotateCcw } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { clubAssetsApi } from '@/services/api/clubAssets';
import { Colors, Radius, Spacing } from '@/theme';
import type { ClubBranding } from '@/types';
import { resolveMediaUrl } from '@/utils';
import { resolveTournamentBanner } from '@/utils/imageResolution';
import type { TournamentWizardState } from '../types';

interface Step1BasicDetailsProps {
  state: TournamentWizardState;
  onChange: (patch: Partial<TournamentWizardState>) => void;
  clubName?: string;
  clubId?: string | null;
  clubBranding?: ClubBranding | null;
  errors?: Record<string, string>;
}

export function Step1BasicDetails({
  state,
  onChange,
  clubName,
  clubId,
  clubBranding,
  errors,
}: Step1BasicDetailsProps) {
  const [isUploading, setIsUploading] = useState(false);

  const isCustom = Boolean(state.bannerImageUrl);
  const resolvedBannerSource = isCustom
    ? { uri: resolveMediaUrl(state.bannerImageUrl!) }
    : resolveTournamentBanner({ format: state.format }, clubBranding);

  const handlePickBanner = async () => {
    if (!clubId) {
      Alert.alert('Notice', 'Club ID is not available to upload a banner.');
      return;
    }

    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Needed', 'Please allow photo gallery access to upload a tournament banner.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const mime = asset.mimeType || (asset.uri?.endsWith('.png') ? 'image/png' : 'image/jpeg');
        const ext = mime.includes('png') ? 'png' : 'jpg';
        const fileName = asset.fileName || `tournament_banner_${Date.now()}.${ext}`;

        setIsUploading(true);
        try {
          const uploadRes = await clubAssetsApi.uploadClubMedia(
            clubId,
            { uri: asset.uri, name: fileName, type: mime },
            'tournament_banner',
            'tournament'
          );
          onChange({ bannerImageUrl: uploadRes.public_url });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Banner upload failed.';
          Alert.alert('Upload Failed', msg);
        } finally {
          setIsUploading(false);
        }
      }
    } catch {
      Alert.alert('Error', 'Unable to open image picker.');
    }
  };

  const handleResetBanner = () => {
    onChange({ bannerImageUrl: null });
  };

  return (
    <View style={styles.container}>
      {/* Active Club / Organizer Context */}
      <Card style={styles.clubContextCard}>
        <AppText variant="caption" color="tertiary" style={styles.contextLabel}>
          ORGANIZER / HOST CLUB
        </AppText>
        <View style={styles.clubNameRow}>
          <AppText variant="heading3" style={styles.clubName}>
            {clubName || 'Pickleball Club'}
          </AppText>
          <Badge label="Active Club" variant="info" />
        </View>
        <AppText variant="caption" color="secondary" style={styles.contextHint}>
          Tournament will automatically be created under and scoped to this club.
        </AppText>
      </Card>

      {/* Tournament Name */}
      <Input
        label="Tournament Name *"
        placeholder="e.g. Austin Pickleball Open"
        value={state.name}
        onChangeText={(name) => onChange({ name })}
        error={errors?.name}
        hint="Give your event a clear, descriptive title"
      />

      {/* Tournament Banner (Optional with Default Inherited Preview) */}
      <Card style={styles.bannerCard}>
        <View style={styles.bannerHeader}>
          <View style={styles.bannerHeaderTitleRow}>
            <ImageIcon size={16} color={Colors.brand.primary} />
            <AppText variant="caption" color="secondary" style={styles.bannerHeaderLabel}>
              TOURNAMENT BANNER (OPTIONAL)
            </AppText>
          </View>
          <Badge
            label={isCustom ? 'Custom Banner' : 'Inheriting Club Default'}
            variant={isCustom ? 'success' : 'default'}
          />
        </View>

        <AppText variant="caption" color="tertiary" style={styles.bannerDescription}>
          {isCustom
            ? 'This custom banner will be displayed specifically for this tournament.'
            : `No custom banner selected. This tournament will automatically use your club's default ${(state.format || 'round robin').replace('_', ' ')} banner.`}
        </AppText>

        <View style={styles.bannerPreviewContainer}>
          <Image
            source={resolvedBannerSource}
            style={styles.bannerPreviewImage}
            resizeMode="cover"
          />
          {isUploading && (
            <View style={styles.bannerUploadingOverlay}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <AppText variant="caption" style={styles.bannerUploadingText}>
                Uploading banner...
              </AppText>
            </View>
          )}
        </View>

        <View style={styles.bannerActionsRow}>
          <TouchableOpacity
            style={styles.bannerActionBtn}
            onPress={handlePickBanner}
            disabled={isUploading}
            activeOpacity={0.8}
          >
            <Camera size={14} color={Colors.text.primary} />
            <AppText variant="bodySmall" style={styles.bannerActionBtnText}>
              {isCustom ? 'Replace Custom Banner' : 'Upload Custom Banner'}
            </AppText>
          </TouchableOpacity>

          {isCustom && (
            <TouchableOpacity
              style={styles.bannerResetBtn}
              onPress={handleResetBanner}
              disabled={isUploading}
              activeOpacity={0.8}
            >
              <RotateCcw size={14} color={Colors.text.secondary} />
              <AppText variant="bodySmall" style={styles.bannerResetBtnText}>
                Reset to Default
              </AppText>
            </TouchableOpacity>
          )}
        </View>
      </Card>

      {/* Venue / Location */}
      <Input
        label="Venue / Location"
        placeholder="e.g. Pickleball Central, Courts 1-6"
        value={state.locationName}
        onChangeText={(locationName) => onChange({ locationName })}
        error={errors?.locationName}
        hint="Where matches will be played"
      />

      {/* Description */}
      <Input
        label="Description / Event Notes"
        placeholder="Details, prize information, spectator policy, schedule breakdown..."
        value={state.description}
        onChangeText={(description) => onChange({ description })}
        multiline
        numberOfLines={4}
        error={errors?.description}
        hint="Optional details visible to participants"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[3],
  },
  clubContextCard: {
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: Radius.md,
    padding: Spacing[3],
    marginBottom: Spacing[1],
  },
  contextLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: Spacing[1],
  },
  clubNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
    flexWrap: 'wrap',
  },
  clubName: {
    color: Colors.text.primary,
    fontSize: 16,
  },
  contextHint: {
    marginTop: Spacing[1],
    fontSize: 12,
  },
  bannerCard: {
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: Radius.md,
    padding: Spacing[3],
    gap: Spacing[2],
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bannerHeaderLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  bannerDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  bannerPreviewContainer: {
    height: 120,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.surface.default,
    position: 'relative',
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  bannerPreviewImage: {
    width: '100%',
    height: '100%',
  },
  bannerUploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing[1],
  },
  bannerUploadingText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  bannerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginTop: Spacing[1],
  },
  bannerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingHorizontal: Spacing[3],
    paddingVertical: 7,
    borderRadius: Radius.sm,
  },
  bannerActionBtnText: {
    color: Colors.text.primary,
    fontWeight: '600',
  },
  bannerResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingHorizontal: Spacing[3],
    paddingVertical: 7,
    borderRadius: Radius.sm,
  },
  bannerResetBtnText: {
    color: Colors.text.secondary,
    fontWeight: '500',
  },
});
