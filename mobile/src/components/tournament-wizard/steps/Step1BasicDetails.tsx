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
  ImageSourcePropType,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { AlertTriangle, Camera, Image as ImageIcon, MapPin, RotateCcw, Trophy } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { clubAssetsApi } from '@/services/api/clubAssets';
import { Colors, Radius, Spacing } from '@/theme';
import type { Club, ClubBranding } from '@/types';
import { usePlatformBanners } from '@/hooks';
import { resolveMediaUrl } from '@/utils';
import { resolveTournamentBanner, resolveTournamentBannerDetails, getTournamentBuiltinFallback } from '@/utils/imageResolution';
import type { TournamentWizardState } from '../types';

interface Step1BasicDetailsProps {
  state: TournamentWizardState;
  onChange: (patch: Partial<TournamentWizardState>) => void;
  clubName?: string;
  clubId?: string | null;
  clubBranding?: ClubBranding | null;
  club?: Club | null;
  errors?: Record<string, string>;
}

export function Step1BasicDetails({
  state,
  onChange,
  clubName,
  clubId,
  clubBranding,
  club,
  errors,
}: Step1BasicDetailsProps) {
  const [isUploading, setIsUploading] = useState(false);
  const { banners: platformBanners } = usePlatformBanners();

  const clubLocation = [club?.address_line1, club?.city, club?.state].filter(Boolean).join(', ');
  const hostVenueName = clubName || club?.name || 'Club Facility';

  React.useEffect(() => {
    const loc = clubLocation ? `${hostVenueName} — ${clubLocation}` : hostVenueName;
    if (loc && (!state.locationName || state.locationName === 'Main Courts' || state.locationName !== loc)) {
      onChange({ locationName: loc });
    }
  }, [clubLocation, hostVenueName, state.locationName, onChange]);

  const isCustom = Boolean(state.bannerImageUrl);
  const builtinFallback = React.useMemo(() => getTournamentBuiltinFallback(state.format), [state.format]);
  const bannerDetails = React.useMemo(() => {
    return resolveTournamentBannerDetails(
      { format: state.format, banner_image_url: state.bannerImageUrl },
      clubBranding,
      platformBanners
    );
  }, [state.format, state.bannerImageUrl, clubBranding, platformBanners]);

  const activeBannerSource = isCustom
    ? { uri: resolveMediaUrl(state.bannerImageUrl!) }
    : (bannerDetails.source ?? builtinFallback);

  const bannerSourceLabel =
    isCustom || bannerDetails.level === 'custom'
      ? 'Custom tournament banner'
      : bannerDetails.level === 'club_default'
      ? 'Club default banner'
      : 'Platform default banner';

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
            {clubName || 'Club'}
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
            <AppText variant="bodySmall" bold color="primary" style={styles.bannerHeaderLabel}>
              Tournament Banner (Optional)
            </AppText>
          </View>
        </View>

        <AppText variant="caption" color="secondary" style={styles.bannerDescription}>
          Your tournament will use the club's default banner unless you upload a different one.
        </AppText>

        <View style={styles.bannerPreviewContainer}>
          {activeBannerSource ? (
            <Image
              source={activeBannerSource}
              style={styles.bannerPreviewImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.bannerEmptyPlaceholder}>
              <Trophy size={28} color="#94A3B8" />
              <AppText style={styles.bannerEmptyText}>No banner configured (optional)</AppText>
            </View>
          )}
          {isUploading && (
            <View style={styles.bannerUploadingOverlay}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <AppText variant="caption" style={styles.bannerUploadingText}>
                Uploading banner...
              </AppText>
            </View>
          )}
        </View>

        {/* Small source status below preview */}
        <View style={styles.bannerStatusRow}>
          <View style={[styles.statusDot, isCustom && styles.statusDotCustom]} />
          <AppText variant="caption" color="tertiary" style={styles.bannerStatusText}>
            {bannerSourceLabel}
          </AppText>
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

      {/* Host Venue / Location (Automatically inherited from Club Details) */}
      {clubLocation ? (
        <Card style={styles.venueCard}>
          <View style={styles.venueHeaderRow}>
            <View style={styles.venueTitleRow}>
              <MapPin size={15} color={Colors.brand.primary} />
              <AppText variant="caption" color="secondary" style={styles.venueHeaderLabel}>
                HOST VENUE / LOCATION
              </AppText>
            </View>
            <Badge label="Active Club Location" variant="info" />
          </View>
          <AppText variant="bodySmall" bold style={styles.venueName}>
            {hostVenueName}
          </AppText>
          <AppText variant="caption" color="secondary" style={styles.venueAddress}>
            {clubLocation}
          </AppText>
        </Card>
      ) : (
        <View style={styles.venueWarningCard}>
          <View style={styles.venueWarningHeader}>
            <AlertTriangle size={15} color="#EA580C" />
            <AppText variant="caption" bold style={styles.venueWarningTitle}>
              No Club Location Configured
            </AppText>
          </View>
          <AppText variant="caption" style={styles.venueWarningText}>
            No physical address configured in Club Details. You can configure your facility address in Club Details → Profile.
          </AppText>
        </View>
      )}

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
    width: '100%',
    height: 160,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  bannerEmptyPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    borderRadius: Radius.md,
  },
  bannerEmptyText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  bannerPreviewImage: {
    width: '100%',
    height: '100%',
  },
  bannerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    marginBottom: 2,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.brand.primary,
  },
  statusDotCustom: {
    backgroundColor: '#10B981',
  },
  bannerStatusText: {
    fontSize: 11,
    fontWeight: '500',
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
  venueCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: Spacing[3],
    gap: 4,
  },
  venueHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  venueTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  venueHeaderLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  venueName: {
    color: '#0F172A',
    fontSize: 14,
  },
  venueAddress: {
    fontSize: 12,
    color: '#64748B',
  },
  venueWarningCard: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: Radius.md,
    padding: Spacing[3],
    gap: 4,
  },
  venueWarningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  venueWarningTitle: {
    color: '#C2410C',
    fontSize: 12,
  },
  venueWarningText: {
    color: '#9A3412',
    fontSize: 11,
    lineHeight: 15,
  },
});
