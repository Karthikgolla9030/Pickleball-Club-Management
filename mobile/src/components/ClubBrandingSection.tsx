/**
 * Aught2 Pickleball — Club Branding & Visual Assets Management Component
 *
 * Implements centralized default image management for Club Owners/Managers:
 * - Group 1: Official Club Logo & Player-Facing Cover Banner (preview, upload, replace, reset)
 * - Group 2: Tournament Default Banners for supported formats:
 *            - Round Robin
 *            - Scramble
 *            - Pool Play
 *            - Bracket Play
 * - Group 3: League Default Banner
 * - Group 4: Event Default Cover
 * - Group 5: Lesson & Coaching Default Image
 * - Promotional Hero Carousel Slides CRUD & Reordering
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageSourcePropType,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Calendar,
  Camera,
  CheckCircle2,
  Eye,
  Image as ImageIcon,
  Info,
  Plus,
  Sliders,
  Trash2,
  X,
} from 'lucide-react-native';

import { AppText } from './AppText';
import { Badge } from './Badge';
import { ClubResponsiveContainer, ClubSectionCard } from './club-details/ClubDetailsUI';
import {
  useClubBranding,
  useClubCarouselSlides,
  useCarouselMutations,
  useUpdateClubBranding,
  usePlatformBanners,
} from '@/hooks';
import { clubAssetsApi } from '@/services/api';
import { Radius, Shadows, Spacing } from '@/theme';
import type { ClubCarouselSlide, UpdateClubBrandingPayload } from '@/types';
import { resolveMediaUrl } from '@/utils';
import {
  resolveTournamentFormatDefault,
  resolveLeaguePicture,
  resolveEventPicture,
  resolveLessonPicture,
} from '@/utils/imageResolution';

interface ClubBrandingSectionProps {
  clubId: string;
  isOwner: boolean;
}

interface BrandingAssetCardProps {
  title: string;
  currentUrl?: string | null;
  fallbackImage?: ImageSourcePropType | null;
  uploading: boolean;
  isOwner: boolean;
  assetKind?: 'banner' | 'picture' | 'logo';
  compactWidth?: boolean;
  onUpload: () => void;
  onReset: () => void;
}

function BrandingAssetCard({
  title,
  currentUrl,
  fallbackImage,
  uploading,
  isOwner,
  assetKind = 'banner',
  compactWidth = false,
  onUpload,
  onReset,
}: BrandingAssetCardProps) {
  const isCustom = Boolean(currentUrl);
  const isLogo = assetKind === 'logo';
  const noun = isLogo ? 'Logo' : assetKind === 'picture' ? 'Image' : 'Banner';
  const hasFallback = !isCustom && Boolean(fallbackImage);

  if (isLogo) {
    return (
      <View style={styles.assetCard}>
        <View style={styles.logoCardRow}>
          <View style={styles.assetLogoPreviewWrapper}>
            {currentUrl ? (
              <Image
                source={{ uri: resolveMediaUrl(currentUrl) }}
                style={styles.assetLogoPreviewImage}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.assetLogoFallback}>
                <Building2 size={28} color="#94A3B8" />
              </View>
            )}
            {uploading && (
              <View style={styles.assetUploadOverlay}>
                <ActivityIndicator size="small" color="#FFFFFF" />
              </View>
            )}
          </View>

          <View style={styles.logoCardRight}>
            <View style={styles.assetCardHeader}>
              <AppText style={styles.assetCardTitle}>{title}</AppText>
              <Badge
                label={isCustom ? 'Custom' : 'Optional'}
                variant={isCustom ? 'success' : 'default'}
              />
            </View>
            <AppText style={styles.assetCardMeta}>1:1 square • PNG or JPG</AppText>
            {isOwner && (
              <View style={styles.assetActionsRow}>
                <TouchableOpacity
                  style={styles.assetBtnPrimary}
                  onPress={onUpload}
                  disabled={uploading}
                  activeOpacity={0.8}
                >
                  <Camera size={13} color="#FFFFFF" />
                  <AppText style={styles.assetBtnPrimaryText}>
                    {isCustom ? 'Replace' : 'Upload'}
                  </AppText>
                </TouchableOpacity>
                {isCustom && (
                  <TouchableOpacity
                    style={styles.assetBtnReset}
                    onPress={onReset}
                    disabled={uploading}
                    activeOpacity={0.8}
                  >
                    <Trash2 size={13} color="#DC2626" />
                    <AppText style={styles.assetBtnResetText}>Remove</AppText>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.assetCard, compactWidth && styles.assetCardHalf]}>
      <View style={styles.assetCardHeader}>
        <AppText style={styles.assetCardTitle}>{title}</AppText>
        <Badge
          label={isCustom ? 'Custom' : hasFallback ? 'Platform Default' : 'Optional'}
          variant={isCustom ? 'success' : hasFallback ? 'info' : 'default'}
        />
      </View>

      <View style={styles.assetPreviewWrapper}>
        {currentUrl ? (
          <Image
            source={{ uri: resolveMediaUrl(currentUrl) }}
            style={styles.assetPreviewImage}
            resizeMode="cover"
          />
        ) : hasFallback ? (
          <Image
            source={fallbackImage!}
            style={styles.assetPreviewImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.assetEmptyPlaceholder}>
            <ImageIcon size={22} color="#94A3B8" />
            <AppText style={styles.assetEmptyText}>No {noun.toLowerCase()} uploaded</AppText>
          </View>
        )}
        {uploading && (
          <View style={styles.assetUploadOverlay}>
            <ActivityIndicator size="small" color="#FFFFFF" />
          </View>
        )}
      </View>

      {isOwner && (
        <View style={styles.assetActionsRow}>
          <TouchableOpacity
            style={styles.assetBtnPrimary}
            onPress={onUpload}
            disabled={uploading}
            activeOpacity={0.8}
          >
            <Camera size={13} color="#FFFFFF" />
            <AppText style={styles.assetBtnPrimaryText}>
              {isCustom ? `Replace ${noun}` : `Upload ${noun}`}
            </AppText>
          </TouchableOpacity>

          {isCustom && (
            <TouchableOpacity
              style={styles.assetBtnReset}
              onPress={onReset}
              disabled={uploading}
              activeOpacity={0.8}
            >
              <Trash2 size={13} color="#DC2626" />
              <AppText style={styles.assetBtnResetText}>
                {hasFallback ? 'Reset' : 'Remove'}
              </AppText>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

function formatAdDateRange(startDate?: string | null, endDate?: string | null): string | null {
  if (!startDate && !endDate) return null;
  const startStr = startDate ? new Date(startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Anytime';
  const endStr = endDate ? new Date(endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Ongoing';
  return `${startStr} – ${endStr}`;
}

function getAdScheduleStatus(startDate?: string | null, endDate?: string | null, isActive?: boolean): { label: string; type: 'active' | 'scheduled' | 'expired' | 'disabled' } {
  if (isActive === false) return { label: 'Disabled', type: 'disabled' };
  const now = new Date();
  if (endDate && new Date(endDate) < now) return { label: 'Expired', type: 'expired' };
  if (startDate && new Date(startDate) > now) return { label: 'Scheduled', type: 'scheduled' };
  return { label: 'Active', type: 'active' };
}

function AdThumbnail({ imageUrl }: { imageUrl?: string | null }) {
  const [hasError, setHasError] = useState(false);
  const fallbackUri = resolveMediaUrl('/static/defaults/tournaments/card_round_robin.jpg');
  const imageUri = !hasError && imageUrl && imageUrl.trim() ? resolveMediaUrl(imageUrl.trim()) : fallbackUri;

  return (
    <Image
      source={{ uri: imageUri }}
      style={styles.slideThumbnail}
      resizeMode="cover"
      onError={() => setHasError(true)}
    />
  );
}

export function ClubBrandingSection({ clubId, isOwner }: ClubBrandingSectionProps) {
  const { width: windowWidth } = useWindowDimensions();
  const isTwoColGrid = windowWidth >= 600;

  // Queries
  const {
    branding,
    refetch: refetchBranding,
  } = useClubBranding(clubId);
  const { banners: platformBanners } = usePlatformBanners();

  const {
    slides = [],
    isLoading: isLoadingSlides,
    refetch: refetchSlides,
  } = useClubCarouselSlides(clubId, false);

  // Mutations
  const updateBrandingMutation = useUpdateClubBranding(clubId);
  const {
    createSlide,
    updateSlide,
    deleteSlide,
    reorderSlides,
  } = useCarouselMutations(clubId);

  // Active uploading states per asset key
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Ad modal state
  const [slideModalVisible, setSlideModalVisible] = useState(false);
  const [editingSlide, setEditingSlide] = useState<ClubCarouselSlide | null>(null);
  const [slideFormTitle, setSlideFormTitle] = useState('');
  const [slideFormSubtitle, setSlideFormSubtitle] = useState('');
  const [slideFormTag, setSlideFormTag] = useState('');
  const [slideFormCtaText, setSlideFormCtaText] = useState('');
  const [slideFormCtaRoute, setSlideFormCtaRoute] = useState('');
  const [slideFormImageUrl, setSlideFormImageUrl] = useState('');
  const [slideFormIsActive, setSlideFormIsActive] = useState(true);
  const [slideFormStartDate, setSlideFormStartDate] = useState('');
  const [slideFormEndDate, setSlideFormEndDate] = useState('');
  const [showPlayerPreview, setShowPlayerPreview] = useState(false);
  const [isUploadingSlideImage, setIsUploadingSlideImage] = useState(false);

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // ─── Image Picker Helper ───────────────────────────────────────────────────

  const pickImage = async (
    aspect: [number, number] = [16, 9]
  ): Promise<{ uri: string; name: string; type: string } | null> => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Needed', 'Please allow gallery access to upload branding photos.');
          return null;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect,
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const mime = asset.mimeType || (asset.uri?.endsWith('.png') ? 'image/png' : 'image/jpeg');
        const ext = mime.includes('png') ? 'png' : 'jpg';
        const fileName = asset.fileName || `branding_${Date.now()}.${ext}`;

        return {
          uri: asset.uri,
          name: fileName,
          type: mime,
        };
      }
      return null;
    } catch {
      Alert.alert('Error', 'Unable to open image picker.');
      return null;
    }
  };

  // ─── Generic Asset Handlers ────────────────────────────────────────────────

  const handleUploadAsset = async (
    fieldName: keyof UpdateClubBrandingPayload,
    assetType: string,
    successLabel: string,
    aspect: [number, number] = [16, 9]
  ) => {
    if (!isOwner) {
      Alert.alert('Permission Denied', 'Only the Club Owner has permission to update club defaults.');
      return;
    }

    const picked = await pickImage(aspect);
    if (!picked) return;

    setUploadingField(fieldName);
    try {
      const uploadRes = await clubAssetsApi.uploadClubMedia(
        clubId,
        { uri: picked.uri, name: picked.name, type: picked.type },
        assetType
      );

      await updateBrandingMutation.mutateAsync({
        [fieldName]: uploadRes.public_url,
      });

      await refetchBranding();
      showStatus('success', `${successLabel} updated and saved successfully!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      showStatus('error', msg);
      Alert.alert('Upload Failed', msg);
    } finally {
      setUploadingField(null);
    }
  };

  const handleResetAsset = (
    fieldName: keyof UpdateClubBrandingPayload,
    resetLabel: string
  ) => {
    if (!isOwner) return;

    const isLogoOrCover = fieldName === 'logo_url' || fieldName === 'cover_image_url';
    const msg = isLogoOrCover
      ? `Are you sure you want to remove the custom image for ${resetLabel}? The club will have no ${resetLabel.toLowerCase()} displayed.`
      : `Are you sure you want to remove the custom image for ${resetLabel}? Your club's items will automatically restore and inherit the Platform Admin default banner.`;

    Alert.alert(
      `Remove ${resetLabel}`,
      msg,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove Image',
          style: 'destructive',
          onPress: async () => {
            setUploadingField(fieldName);
            try {
              await updateBrandingMutation.mutateAsync({
                [fieldName]: null,
              });
              await refetchBranding();
              showStatus('success', `${resetLabel} image removed.`);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Remove failed';
              showStatus('error', msg);
              Alert.alert('Remove Failed', msg);
            } finally {
              setUploadingField(null);
            }
          },
        },
      ]
    );
  };

  // ─── Club Promotional Ads Handlers ─────────────────────────────────────────

  const openSlideModal = (slide?: ClubCarouselSlide) => {
    if (slide) {
      setEditingSlide(slide);
      setSlideFormTitle(slide.title || '');
      setSlideFormSubtitle(slide.subtitle || '');
      setSlideFormTag(slide.tag || '');
      setSlideFormCtaText(slide.cta_text || '');
      setSlideFormCtaRoute(slide.cta_route || '');
      setSlideFormImageUrl(slide.image_url || '');
      setSlideFormIsActive(slide.is_active ?? true);
      setSlideFormStartDate(slide.start_date ? slide.start_date.split('T')[0] : '');
      setSlideFormEndDate(slide.end_date ? slide.end_date.split('T')[0] : '');
    } else {
      setEditingSlide(null);
      setSlideFormTitle('');
      setSlideFormSubtitle('');
      setSlideFormTag('SPECIAL OFFER');
      setSlideFormCtaText('View Details');
      setSlideFormCtaRoute('/player/tournaments');
      setSlideFormImageUrl('');
      setSlideFormIsActive(true);
      setSlideFormStartDate('');
      setSlideFormEndDate('');
    }
    setShowPlayerPreview(false);
    setSlideModalVisible(true);
  };

  const handlePickSlideImage = async () => {
    const picked = await pickImage([16, 9]);
    if (!picked) return;

    setIsUploadingSlideImage(true);
    try {
      const uploadRes = await clubAssetsApi.uploadClubMedia(
        clubId,
        { uri: picked.uri, name: picked.name, type: picked.type },
        'promotional_ad'
      );
      setSlideFormImageUrl(uploadRes.public_url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      Alert.alert('Upload Error', msg);
    } finally {
      setIsUploadingSlideImage(false);
    }
  };

  const handleSaveSlide = async () => {
    if (!slideFormImageUrl.trim()) {
      Alert.alert('Image Required', 'Please upload or select an image for this promotional ad.');
      return;
    }

    let parsedStartDate: string | null = null;
    let parsedEndDate: string | null = null;

    if (slideFormStartDate.trim()) {
      const d = new Date(slideFormStartDate.trim());
      if (isNaN(d.getTime())) {
        Alert.alert('Invalid Date', 'Start Date must be a valid date format (e.g. YYYY-MM-DD).');
        return;
      }
      parsedStartDate = d.toISOString();
    }

    if (slideFormEndDate.trim()) {
      const d = new Date(slideFormEndDate.trim());
      if (isNaN(d.getTime())) {
        Alert.alert('Invalid Date', 'End Date must be a valid date format (e.g. YYYY-MM-DD).');
        return;
      }
      parsedEndDate = d.toISOString();
    }

    try {
      if (editingSlide) {
        await updateSlide.mutateAsync({
          slideId: editingSlide.id,
          payload: {
            title: slideFormTitle.trim() || null,
            subtitle: slideFormSubtitle.trim() || null,
            tag: slideFormTag.trim() || null,
            image_url: slideFormImageUrl.trim(),
            cta_text: slideFormCtaText.trim() || null,
            cta_route: slideFormCtaRoute.trim() || null,
            is_active: slideFormIsActive,
            start_date: parsedStartDate,
            end_date: parsedEndDate,
          },
        });
        showStatus('success', 'Promotional ad updated successfully.');
      } else {
        await createSlide.mutateAsync({
          title: slideFormTitle.trim() || null,
          subtitle: slideFormSubtitle.trim() || null,
          tag: slideFormTag.trim() || null,
          image_url: slideFormImageUrl.trim(),
          cta_text: slideFormCtaText.trim() || null,
          cta_route: slideFormCtaRoute.trim() || null,
          is_active: slideFormIsActive,
          start_date: parsedStartDate,
          end_date: parsedEndDate,
          display_order: slides.length + 1,
        });
        showStatus('success', 'New promotional ad created.');
      }
      setSlideModalVisible(false);
      await refetchSlides();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save promotional ad';
      Alert.alert('Save Error', msg);
    }
  };

  const handleDeleteSlide = (slide: ClubCarouselSlide) => {
    Alert.alert(
      'Delete Promotional Ad',
      `Delete "${slide.title || 'Untitled Ad'}"? This ad will be removed from your club page and the universal player carousel.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSlide.mutateAsync(slide.id);
              await refetchSlides();
              showStatus('success', 'Promotional ad deleted.');
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Delete failed';
              showStatus('error', msg);
            }
          },
        },
      ]
    );
  };

  const handleMoveSlide = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= slides.length) return;

    const reordered = [...slides];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    try {
      await reorderSlides.mutateAsync(reordered.map((s) => s.id));
      await refetchSlides();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reorder failed';
      showStatus('error', msg);
    }
  };

  const handleToggleSlideActive = async (slide: ClubCarouselSlide, value: boolean) => {
    try {
      await updateSlide.mutateAsync({
        slideId: slide.id,
        payload: { is_active: value },
      });
      await refetchSlides();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Toggle failed';
      showStatus('error', msg);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <ClubResponsiveContainer style={styles.responsiveStack}>
        {/* Status Banner */}
        {statusMessage && (
          <View
            style={[
              styles.statusBanner,
              statusMessage.type === 'success' ? styles.statusBannerSuccess : styles.statusBannerError,
            ]}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 size={16} color="#15803D" />
            ) : (
              <Info size={16} color="#B91C1C" />
            )}
            <AppText
              style={[
                styles.statusBannerText,
                statusMessage.type === 'success' ? styles.statusTextSuccess : styles.statusTextError,
              ]}
            >
              {statusMessage.text}
            </AppText>
          </View>
        )}

        {/* 1. CLUB IDENTITY ASSETS */}
        <ClubSectionCard title="Club Identity Assets">
          <View style={styles.sectionCardsStack}>
            <BrandingAssetCard
              title="Official Club Logo"
              assetKind="logo"
              currentUrl={branding?.logo_url}
              uploading={uploadingField === 'logo_url'}
              isOwner={isOwner}
              onUpload={() =>
                handleUploadAsset('logo_url', 'club_logo', 'Club Logo', [1, 1])
              }
              onReset={() => handleResetAsset('logo_url', 'Club Logo')}
            />

            <BrandingAssetCard
              title="Player-Facing Cover Banner"
              assetKind="banner"
              currentUrl={branding?.cover_image_url}
              uploading={uploadingField === 'cover_image_url'}
              isOwner={isOwner}
              onUpload={() =>
                handleUploadAsset('cover_image_url', 'club_cover', 'Player-Facing Cover Banner', [16, 9])
              }
              onReset={() => handleResetAsset('cover_image_url', 'Player-Facing Cover Banner')}
            />
          </View>
        </ClubSectionCard>

        {/* 2. TOURNAMENT DEFAULT BANNERS */}
        <ClubSectionCard
          title="Tournament Default Banners"
          subtitle="Fallback banners inherited by tournaments without a custom image."
        >
          <View style={[styles.assetsGrid, isTwoColGrid && styles.assetsGridTwoCol]}>
            <BrandingAssetCard
              title="General Tournament Default"
              compactWidth={isTwoColGrid}
              currentUrl={branding?.default_tournament_banner_url}
              fallbackImage={resolveTournamentFormatDefault('general', null, platformBanners)}
              uploading={uploadingField === 'default_tournament_banner_url'}
              isOwner={isOwner}
              onUpload={() =>
                handleUploadAsset(
                  'default_tournament_banner_url',
                  'default_tournament_banner',
                  'General Tournament Default Banner'
                )
              }
              onReset={() =>
                handleResetAsset('default_tournament_banner_url', 'General Tournament Default Banner')
              }
            />

            <BrandingAssetCard
              title="Round Robin"
              compactWidth={isTwoColGrid}
              currentUrl={branding?.default_tournament_round_robin_url}
              fallbackImage={resolveTournamentFormatDefault('round_robin', null, platformBanners)}
              uploading={uploadingField === 'default_tournament_round_robin_url'}
              isOwner={isOwner}
              onUpload={() =>
                handleUploadAsset(
                  'default_tournament_round_robin_url',
                  'default_tournament_round_robin',
                  'Round Robin Default Banner'
                )
              }
              onReset={() =>
                handleResetAsset('default_tournament_round_robin_url', 'Round Robin Default Banner')
              }
            />

            <BrandingAssetCard
              title="Bracket Play"
              compactWidth={isTwoColGrid}
              currentUrl={branding?.default_tournament_bracket_url}
              fallbackImage={resolveTournamentFormatDefault('bracket', null, platformBanners)}
              uploading={uploadingField === 'default_tournament_bracket_url'}
              isOwner={isOwner}
              onUpload={() =>
                handleUploadAsset(
                  'default_tournament_bracket_url',
                  'default_tournament_bracket',
                  'Bracket Play Default Banner'
                )
              }
              onReset={() =>
                handleResetAsset('default_tournament_bracket_url', 'Bracket Play Default Banner')
              }
            />

            <BrandingAssetCard
              title="Pool Play"
              compactWidth={isTwoColGrid}
              currentUrl={branding?.default_tournament_pool_play_url}
              fallbackImage={resolveTournamentFormatDefault('pool_play', null, platformBanners)}
              uploading={uploadingField === 'default_tournament_pool_play_url'}
              isOwner={isOwner}
              onUpload={() =>
                handleUploadAsset(
                  'default_tournament_pool_play_url',
                  'default_tournament_pool_play',
                  'Pool Play Default Banner'
                )
              }
              onReset={() =>
                handleResetAsset('default_tournament_pool_play_url', 'Pool Play Default Banner')
              }
            />

            <BrandingAssetCard
              title="Scramble"
              compactWidth={isTwoColGrid}
              currentUrl={branding?.default_tournament_scramble_url}
              fallbackImage={resolveTournamentFormatDefault('scramble', null, platformBanners)}
              uploading={uploadingField === 'default_tournament_scramble_url'}
              isOwner={isOwner}
              onUpload={() =>
                handleUploadAsset(
                  'default_tournament_scramble_url',
                  'default_tournament_scramble',
                  'Scramble Default Banner'
                )
              }
              onReset={() =>
                handleResetAsset('default_tournament_scramble_url', 'Scramble Default Banner')
              }
            />
          </View>
        </ClubSectionCard>

        {/* 3. OTHER ACTIVITY BRANDING ASSETS */}
        <ClubSectionCard
          title="Leagues, Events & Coaching Defaults"
          subtitle="Fallback images when an activity has no custom cover."
        >
          <View style={[styles.assetsGrid, isTwoColGrid && styles.assetsGridTwoCol]}>
            <BrandingAssetCard
              title="Leagues"
              assetKind="picture"
              compactWidth={isTwoColGrid}
              currentUrl={branding?.default_league_banner_url}
              fallbackImage={resolveLeaguePicture(null, null, platformBanners)}
              uploading={uploadingField === 'default_league_banner_url'}
              isOwner={isOwner}
              onUpload={() =>
                handleUploadAsset('default_league_banner_url', 'default_league_banner', 'League Default Picture')
              }
              onReset={() => handleResetAsset('default_league_banner_url', 'League Default Picture')}
            />

            <BrandingAssetCard
              title="Events"
              assetKind="picture"
              compactWidth={isTwoColGrid}
              currentUrl={branding?.default_event_banner_url}
              fallbackImage={resolveEventPicture(null, null, platformBanners)}
              uploading={uploadingField === 'default_event_banner_url'}
              isOwner={isOwner}
              onUpload={() =>
                handleUploadAsset('default_event_banner_url', 'default_event_banner', 'Event Default Picture')
              }
              onReset={() => handleResetAsset('default_event_banner_url', 'Event Default Picture')}
            />

            <BrandingAssetCard
              title="Lessons & Coaching"
              assetKind="picture"
              compactWidth={isTwoColGrid}
              currentUrl={branding?.default_lesson_banner_url}
              fallbackImage={resolveLessonPicture(null, null, platformBanners)}
              uploading={uploadingField === 'default_lesson_banner_url'}
              isOwner={isOwner}
              onUpload={() =>
                handleUploadAsset('default_lesson_banner_url', 'default_lesson_banner', 'Lesson & Coaching Default Picture')
              }
              onReset={() => handleResetAsset('default_lesson_banner_url', 'Lesson & Coaching Default Picture')}
            />
          </View>
        </ClubSectionCard>

        {/* 4. CLUB PROMOTIONAL ADS */}
        <ClubSectionCard
          title="Promotional Ads"
          action={
            isOwner ? (
              <TouchableOpacity
                style={styles.addSlideBtn}
                onPress={() => openSlideModal()}
                activeOpacity={0.85}
              >
                <Plus size={14} color="#FFFFFF" />
                <AppText style={styles.addSlideBtnText}>Create Ad</AppText>
              </TouchableOpacity>
            ) : undefined
          }
        >
          {isLoadingSlides ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="#176B57" />
              <AppText style={styles.loadingText}>Loading promotional ads...</AppText>
            </View>
          ) : slides.length === 0 ? (
            <View style={styles.emptySlidesBox}>
              <ImageIcon size={24} color="#94A3B8" />
              <AppText style={styles.emptySlidesTitle}>No promotional ads created</AppText>
            </View>
          ) : (
          <View style={styles.slidesList}>
            {slides.map((slide: ClubCarouselSlide, index: number) => {
              const scheduleStatus = getAdScheduleStatus(slide.start_date, slide.end_date, slide.is_active);
              const dateRangeLabel = formatAdDateRange(slide.start_date, slide.end_date);
              const isDistinctSubtitle =
                slide.subtitle &&
                slide.subtitle.trim().length > 0 &&
                slide.subtitle.trim().toLowerCase() !== (slide.title || '').trim().toLowerCase();

              return (
                <View key={slide.id} style={styles.slideCard}>
                  {/* Top Row: Category on Left, Status on Right */}
                  <View style={styles.slideCardHeader}>
                    <View style={styles.slideCategoryBadge}>
                      <AppText style={styles.slideCategoryText}>
                        {(slide.tag || 'PROMOTION').toUpperCase()}
                      </AppText>
                    </View>

                    <View
                      style={[
                        styles.slideStatusBadge,
                        scheduleStatus.type === 'active' && styles.slideStatusActive,
                        scheduleStatus.type === 'disabled' && styles.slideStatusDisabled,
                        scheduleStatus.type === 'scheduled' && styles.slideStatusScheduled,
                        scheduleStatus.type === 'expired' && styles.slideStatusExpired,
                      ]}
                    >
                      <View
                        style={[
                          styles.slideStatusDot,
                          scheduleStatus.type === 'active' && styles.slideStatusDotActive,
                          scheduleStatus.type === 'disabled' && styles.slideStatusDotDisabled,
                          scheduleStatus.type === 'scheduled' && styles.slideStatusDotScheduled,
                          scheduleStatus.type === 'expired' && styles.slideStatusDotExpired,
                        ]}
                      />
                      <AppText
                        style={[
                          styles.slideStatusBadgeText,
                          scheduleStatus.type === 'active' && styles.slideStatusTextActive,
                          scheduleStatus.type === 'disabled' && styles.slideStatusTextDisabled,
                          scheduleStatus.type === 'scheduled' && styles.slideStatusTextScheduled,
                          scheduleStatus.type === 'expired' && styles.slideStatusTextExpired,
                        ]}
                      >
                        {scheduleStatus.label}
                      </AppText>
                    </View>
                  </View>

                  {/* Middle Body: Thumbnail on Left, Title & Details on Right */}
                  <View style={styles.slideCardBody}>
                    <AdThumbnail imageUrl={slide.image_url} />

                    <View style={styles.slideInfoCol}>
                      <AppText style={styles.slideTitle}>
                        {slide.title || 'Untitled Promotional Ad'}
                      </AppText>

                      {isDistinctSubtitle ? (
                        <AppText style={styles.slideSubtitle}>
                          {slide.subtitle}
                        </AppText>
                      ) : null}

                      {dateRangeLabel ? (
                        <View style={styles.slideMetaRow}>
                          <Calendar size={13} color="#64748B" />
                          <AppText style={styles.slideDateText}>{dateRangeLabel}</AppText>
                        </View>
                      ) : null}

                      {slide.cta_text ? (
                        <View style={styles.slideMetaRow}>
                          <View style={styles.slideCtaPill}>
                            <AppText style={styles.slideCtaPillText}>
                              CTA: "{slide.cta_text}"
                            </AppText>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  {/* Bottom Action Area: Carousel Visibility Toggle on Left; Reorder, Edit & Delete on Right */}
                  {isOwner && (
                    <View style={styles.slideCardFooter}>
                      <View style={styles.slideToggleRow}>
                        <Switch
                          value={slide.is_active}
                          onValueChange={(val) => handleToggleSlideActive(slide, val)}
                          trackColor={{ false: '#E2E8F0', true: '#A7F3D0' }}
                          thumbColor={slide.is_active ? '#10B981' : '#94A3B8'}
                          style={{ transform: [{ scaleX: 0.82 }, { scaleY: 0.82 }] }}
                        />
                        <AppText style={styles.slideToggleLabel}>
                          {slide.is_active ? 'Active in Carousel' : 'Disabled'}
                        </AppText>
                      </View>

                      <View style={styles.slideActionsRow}>
                        {/* Reorder Buttons */}
                        <View style={styles.slideReorderGroup}>
                          <TouchableOpacity
                            style={[styles.slideReorderBtn, index === 0 && styles.slideReorderBtnDisabled]}
                            disabled={index === 0}
                            onPress={() => handleMoveSlide(index, 'up')}
                            hitSlop={6}
                            accessibilityLabel="Move advertisement up"
                          >
                            <ArrowUp size={13} color={index === 0 ? '#CBD5E1' : '#1E293B'} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.slideReorderBtn, index === slides.length - 1 && styles.slideReorderBtnDisabled]}
                            disabled={index === slides.length - 1}
                            onPress={() => handleMoveSlide(index, 'down')}
                            hitSlop={6}
                            accessibilityLabel="Move advertisement down"
                          >
                            <ArrowDown size={13} color={index === slides.length - 1 ? '#CBD5E1' : '#1E293B'} />
                          </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                          style={styles.slideActionBtn}
                          onPress={() => openSlideModal(slide)}
                          activeOpacity={0.7}
                        >
                          <Sliders size={13} color="#334155" />
                          <AppText style={styles.slideActionBtnText}>Edit</AppText>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.slideActionBtn, styles.slideDeleteBtn]}
                          onPress={() => handleDeleteSlide(slide)}
                          activeOpacity={0.7}
                        >
                          <Trash2 size={13} color="#DC2626" />
                          <AppText style={styles.slideDeleteBtnText}>Delete</AppText>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
        </ClubSectionCard>
      </ClubResponsiveContainer>

      {/* ── Add / Edit Promotional Ad Modal ── */}
      <Modal
        visible={slideModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSlideModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <AppText style={styles.modalTitle}>
                {editingSlide ? 'Edit Promotional Ad' : 'Create Club Promotional Ad'}
              </AppText>
              <TouchableOpacity onPress={() => setSlideModalVisible(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Player Preview Toggle */}
              <View style={styles.previewToggleRow}>
                <View style={styles.previewToggleLeft}>
                  <Eye size={16} color="#166534" />
                  <AppText style={styles.previewToggleText}>Preview Player App Layout</AppText>
                </View>
                <Switch
                  value={showPlayerPreview}
                  onValueChange={setShowPlayerPreview}
                  trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                  thumbColor={showPlayerPreview ? '#166534' : '#FFFFFF'}
                />
              </View>

              {showPlayerPreview && (
                <View style={styles.playerPreviewCard}>
                  {slideFormImageUrl ? (
                    <Image
                      source={{ uri: resolveMediaUrl(slideFormImageUrl) }}
                      style={styles.playerPreviewImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.playerPreviewEmpty}>
                      <ImageIcon size={24} color="#94A3B8" />
                      <AppText style={styles.playerPreviewEmptyText}>No image selected (optional)</AppText>
                    </View>
                  )}
                  <View style={styles.playerPreviewContent}>
                    {slideFormTag ? (
                      <View style={styles.playerPreviewBadge}>
                        <AppText style={styles.playerPreviewBadgeText}>{slideFormTag.toUpperCase()}</AppText>
                      </View>
                    ) : null}
                    <AppText style={styles.playerPreviewTitle}>
                      {slideFormTitle || 'Promotional Ad Headline'}
                    </AppText>
                    {slideFormSubtitle ? (
                      <AppText style={styles.playerPreviewSubtitle}>
                        {slideFormSubtitle}
                      </AppText>
                    ) : null}
                    {slideFormCtaText ? (
                      <View style={styles.playerPreviewCtaBtn}>
                        <AppText style={styles.playerPreviewCtaText}>{slideFormCtaText}</AppText>
                      </View>
                    ) : null}
                  </View>
                </View>
              )}

              {/* Image Picker */}
              <AppText style={styles.inputLabel}>Ad Image *</AppText>
              <View style={styles.slideImagePickerBox}>
                {slideFormImageUrl ? (
                  <Image
                    source={{ uri: resolveMediaUrl(slideFormImageUrl) }}
                    style={styles.slideImagePreview}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.slideImagePlaceholder}>
                    <ImageIcon size={28} color="#94A3B8" />
                    <AppText style={styles.slideImagePlaceholderText}>
                      No image selected. Recommended 16:9 ratio.
                    </AppText>
                  </View>
                )}
                {isUploadingSlideImage && (
                  <View style={styles.slideUploadOverlay}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={styles.pickImageBtn}
                onPress={handlePickSlideImage}
                disabled={isUploadingSlideImage}
              >
                <Camera size={14} color="#176B57" />
                <AppText style={styles.pickImageBtnText}>
                  {slideFormImageUrl ? 'Change Photo' : 'Upload Ad Photo'}
                </AppText>
              </TouchableOpacity>

              {/* Tag */}
              <AppText style={styles.inputLabel}>Category Tag</AppText>
              <TextInput
                style={styles.textInput}
                value={slideFormTag}
                onChangeText={setSlideFormTag}
                placeholder="e.g. SPECIAL OFFER, TOURNAMENT, CLINIC"
                placeholderTextColor="#94A3B8"
              />

              {/* Title */}
              <AppText style={styles.inputLabel}>Ad Headline / Title</AppText>
              <TextInput
                style={styles.textInput}
                value={slideFormTitle}
                onChangeText={setSlideFormTitle}
                placeholder="e.g. Spring Championship Open - Early Bird"
                placeholderTextColor="#94A3B8"
              />

              {/* Subtitle */}
              <AppText style={styles.inputLabel}>Promotional Description</AppText>
              <TextInput
                style={styles.textInput}
                value={slideFormSubtitle}
                onChangeText={setSlideFormSubtitle}
                placeholder="e.g. Save 20% on team registration before June 1st"
                placeholderTextColor="#94A3B8"
              />

              {/* CTA Text */}
              <AppText style={styles.inputLabel}>CTA Button Label</AppText>
              <TextInput
                style={styles.textInput}
                value={slideFormCtaText}
                onChangeText={setSlideFormCtaText}
                placeholder="e.g. Register Now, Book Court, View League"
                placeholderTextColor="#94A3B8"
              />

              {/* CTA Route */}
              <AppText style={styles.inputLabel}>Destination Route</AppText>
              <TextInput
                style={styles.textInput}
                value={slideFormCtaRoute}
                onChangeText={setSlideFormCtaRoute}
                placeholder="e.g. /player/tournaments or /player/bookings"
                placeholderTextColor="#94A3B8"
              />

              {/* Schedule Dates */}
              <AppText style={styles.inputLabel}>Scheduling (Optional)</AppText>
              <View style={styles.dateInputsRow}>
                <View style={styles.dateInputCol}>
                  <AppText style={styles.dateSubtext}>Start Date (YYYY-MM-DD)</AppText>
                  <TextInput
                    style={styles.textInput}
                    value={slideFormStartDate}
                    onChangeText={setSlideFormStartDate}
                    placeholder="2026-06-01"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
                <View style={styles.dateInputCol}>
                  <AppText style={styles.dateSubtext}>End Date (YYYY-MM-DD)</AppText>
                  <TextInput
                    style={styles.textInput}
                    value={slideFormEndDate}
                    onChangeText={setSlideFormEndDate}
                    placeholder="2026-06-30"
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              </View>

              {/* Active Toggle */}
              <View style={styles.switchRow}>
                <AppText style={styles.switchLabel}>Publish ad immediately</AppText>
                <Switch
                  value={slideFormIsActive}
                  onValueChange={setSlideFormIsActive}
                  trackColor={{ false: '#E2E8F0', true: '#A7F3D0' }}
                  thumbColor={slideFormIsActive ? '#10B981' : '#94A3B8'}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setSlideModalVisible(false)}
              >
                <AppText style={styles.modalCancelText}>Cancel</AppText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveSlide}>
                <AppText style={styles.modalSaveText}>Save Ad</AppText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F8F5',
  },
  contentContainer: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[1],
    paddingBottom: 96,
  },
  responsiveStack: {
    gap: Spacing[3],
  },
  sectionCardsStack: {
    gap: Spacing[3],
  },
  assetsGrid: {
    gap: Spacing[3],
  },
  assetsGridTwoCol: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing[3],
    borderRadius: Radius.md,
    gap: Spacing[2],
  },
  statusBannerSuccess: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  statusBannerError: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  statusBannerText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  statusTextSuccess: {
    color: '#15803D',
  },
  statusTextError: {
    color: '#B91C1C',
  },
  assetCard: {
    backgroundColor: '#F9FBFA',
    borderRadius: Radius.md,
    padding: Spacing[3],
    borderWidth: 1,
    borderColor: '#E2EAE6',
    gap: Spacing[2.5],
  },
  assetCardHalf: {
    width: '48.5%',
    flexGrow: 1,
  },
  logoCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  logoCardRight: {
    flex: 1,
    minWidth: 0,
    gap: Spacing[1.5],
  },
  assetCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing[2],
  },
  assetCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#102B2A',
    flex: 1,
  },
  assetCardMeta: {
    fontSize: 12,
    color: '#64748B',
  },
  assetLogoPreviewWrapper: {
    position: 'relative',
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE7E1',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  assetLogoPreviewImage: {
    width: '100%',
    height: '100%',
  },
  assetLogoFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F0F5F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  assetEmptyPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing[1],
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    borderRadius: Radius.sm,
  },
  assetEmptyText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  playerPreviewEmpty: {
    width: '100%',
    height: 120,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing[1.5],
  },
  playerPreviewEmptyText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  assetPreviewWrapper: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
    maxHeight: 160,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  assetPreviewImage: {
    width: '100%',
    height: '100%',
  },
  assetUploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  assetActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    flexWrap: 'wrap',
  },
  assetBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#176B57',
    paddingHorizontal: Spacing[3],
    paddingVertical: 7,
    borderRadius: Radius.sm,
    gap: 5,
  },
  assetBtnPrimaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  assetBtnReset: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: Spacing[2.5],
    paddingVertical: 7,
    borderRadius: Radius.sm,
    gap: 5,
  },
  assetBtnResetText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  carouselContainerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.sm,
  },
  headerWithAction: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: Spacing[3],
  },
  headerTextWrapper: {
    flex: 1,
    minWidth: 200,
  },
  addSlideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#176B57',
    paddingHorizontal: Spacing[3.5],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    gap: Spacing[1.5],
    alignSelf: 'flex-start',
  },
  addSlideBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  loadingBox: {
    padding: Spacing[6],
    alignItems: 'center',
    gap: Spacing[2],
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
  },
  emptySlidesBox: {
    padding: Spacing[6],
    alignItems: 'center',
    gap: Spacing[2],
  },
  emptySlidesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginTop: Spacing[1],
  },
  emptySlidesDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 18,
  },
  slidesList: {
    gap: Spacing[3.5],
  },
  slideCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  slideCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing[3.5],
    paddingTop: Spacing[3],
    paddingBottom: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  slideBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    flexWrap: 'wrap',
  },
  slideCategoryBadge: {
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#CEEAD6',
  },
  slideCategoryText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#137333',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  slideStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4.5,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 4,
    borderWidth: 1,
  },
  slideStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  slideStatusBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  slideStatusActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  slideStatusDotActive: {
    backgroundColor: '#16A34A',
  },
  slideStatusTextActive: {
    color: '#15803D',
    fontSize: 10.5,
    fontWeight: '700',
  },
  slideStatusDisabled: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  slideStatusDotDisabled: {
    backgroundColor: '#94A3B8',
  },
  slideStatusTextDisabled: {
    color: '#64748B',
    fontSize: 10.5,
    fontWeight: '600',
  },
  slideStatusScheduled: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  slideStatusDotScheduled: {
    backgroundColor: '#3B82F6',
  },
  slideStatusTextScheduled: {
    color: '#1D4ED8',
    fontSize: 10.5,
    fontWeight: '700',
  },
  slideStatusExpired: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  slideStatusDotExpired: {
    backgroundColor: '#EF4444',
  },
  slideStatusTextExpired: {
    color: '#B91C1C',
    fontSize: 10.5,
    fontWeight: '600',
  },
  slideReorderGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  slideReorderBtn: {
    padding: 5,
    backgroundColor: '#F8FAFC',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  slideReorderBtnDisabled: {
    opacity: 0.35,
    backgroundColor: '#F1F5F9',
  },
  slideCardBody: {
    flexDirection: 'row',
    padding: Spacing[3.5],
    gap: Spacing[3],
    alignItems: 'flex-start',
  },
  slideThumbnail: {
    width: 76,
    height: 76,
    borderRadius: Radius.md,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  slideInfoCol: {
    flex: 1,
    gap: 4,
  },
  slideTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 19,
  },
  slideSubtitle: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
  },
  slideMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  slideDateText: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '500',
  },
  slideCtaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexWrap: 'wrap',
  },
  slideCtaPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#176B57',
  },
  slideCtaRouteText: {
    fontSize: 11,
    color: '#64748B',
  },
  slideCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing[3.5],
    paddingVertical: Spacing[2.5],
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  slideToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  slideToggleLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#334155',
  },
  slideActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  slideActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing[2.5],
    paddingVertical: Spacing[1.5],
    borderRadius: Radius.sm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  slideActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  slideDeleteBtn: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  slideDeleteBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[4],
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    ...Shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalBody: {
    padding: Spacing[4],
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
    marginTop: Spacing[2.5],
  },
  slideImagePickerBox: {
    position: 'relative',
    width: '100%',
    height: 140,
    borderRadius: Radius.md,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  slideImagePreview: {
    width: '100%',
    height: '100%',
  },
  slideImagePlaceholder: {
    alignItems: 'center',
    gap: Spacing[1],
    paddingHorizontal: Spacing[4],
  },
  slideImagePlaceholderText: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
  },
  slideUploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5F6EC',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: Radius.md,
    paddingVertical: Spacing[2],
    marginTop: Spacing[2],
    gap: Spacing[1.5],
  },
  pickImageBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#176B57',
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    fontSize: 13,
    color: '#0F172A',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing[3.5],
    paddingVertical: Spacing[1],
  },
  switchLabel: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing[2],
    padding: Spacing[4],
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  modalCancelBtn: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  modalSaveBtn: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    backgroundColor: '#176B57',
  },
  modalSaveText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  dateInputsRow: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  dateInputCol: {
    flex: 1,
  },
  dateSubtext: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 4,
    fontWeight: '500',
  },
  previewToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: Spacing[2.5],
    borderRadius: Radius.md,
    marginBottom: Spacing[3],
  },
  previewToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  previewToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#166534',
  },
  playerPreviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: Spacing[4],
    ...Shadows.sm,
  },
  playerPreviewImage: {
    width: '100%',
    height: 140,
    backgroundColor: '#0F172A',
  },
  playerPreviewContent: {
    padding: Spacing[3],
  },
  playerPreviewBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  playerPreviewBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  playerPreviewTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  playerPreviewSubtitle: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 8,
  },
  playerPreviewCtaBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#176B57',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  playerPreviewCtaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  adDateRangeText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  badgeScheduled: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  badgeTextScheduled: {
    color: '#1D4ED8',
  },
  badgeExpired: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
  badgeTextExpired: {
    color: '#64748B',
  },
});
