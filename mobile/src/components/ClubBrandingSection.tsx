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
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import {
  ArrowDown,
  ArrowUp,
  Award,
  Building2,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronRight,
  Eye,
  GraduationCap,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  Layers,
  Plus,
  RotateCcw,
  Sliders,
  Trash2,
  Trophy,
  X,
} from 'lucide-react-native';

import { AppText } from './AppText';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';
import {
  useClubBranding,
  useClubCarouselSlides,
  useCarouselMutations,
  useUpdateClubBranding,
  usePlatformBanners,
} from '@/hooks';
import { clubAssetsApi } from '@/services/api';
import { Colors, Radius, Shadows, Spacing } from '@/theme';
import type { ClubCarouselSlide, UpdateClubBrandingPayload } from '@/types';
import { BUILTIN_FALLBACKS, resolveMediaUrl } from '@/utils';
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
  categoryTag: string;
  description: string;
  recommendedSize?: string;
  currentUrl?: string | null;
  fallbackImage?: ImageSourcePropType | null;
  uploading: boolean;
  isOwner: boolean;
  assetKind?: 'banner' | 'picture' | 'logo';
  onUpload: () => void;
  onReset: () => void;
}

function BrandingAssetCard({
  title,
  categoryTag,
  description,
  recommendedSize,
  currentUrl,
  fallbackImage,
  uploading,
  isOwner,
  assetKind = 'banner',
  onUpload,
  onReset,
}: BrandingAssetCardProps) {
  const isCustom = Boolean(currentUrl);
  const isLogo = assetKind === 'logo';
  const noun = isLogo ? 'Logo' : assetKind === 'picture' ? 'Picture' : 'Banner';
  const hasFallback = !isCustom && Boolean(fallbackImage);

  return (
    <Card style={styles.assetCard}>
      {/* Top Header Row */}
      <View style={styles.assetCardHeader}>
        <View style={styles.assetCardHeaderLeft}>
          <View style={styles.tagBadge}>
            <AppText style={styles.tagBadgeText}>{categoryTag}</AppText>
          </View>
          <AppText style={styles.assetCardTitle}>{title}</AppText>
        </View>
        <Badge
          label={
            isCustom
              ? 'Configured'
              : hasFallback
              ? 'Inheriting Default'
              : 'Not Configured (Optional)'
          }
          variant={isCustom ? 'success' : hasFallback ? 'info' : 'default'}
        />
      </View>

      <AppText style={styles.assetCardDesc}>{description}</AppText>

      {/* Recommended Size Note */}
      {recommendedSize ? (
        <View style={styles.recommendedSizeRow}>
          <ImageIcon size={12} color="#64748B" />
          <AppText style={styles.recommendedSizeText}>
            Recommended: {recommendedSize}
          </AppText>
        </View>
      ) : null}

      {/* Image Preview Box */}
      <View style={isLogo ? styles.assetLogoPreviewWrapper : styles.assetPreviewWrapper}>
        {currentUrl ? (
          <Image
            source={{ uri: resolveMediaUrl(currentUrl) }}
            style={isLogo ? styles.assetLogoPreviewImage : styles.assetPreviewImage}
            resizeMode={isLogo ? 'contain' : 'cover'}
          />
        ) : hasFallback ? (
          <>
            <Image
              source={fallbackImage!}
              style={styles.assetPreviewImage}
              resizeMode="cover"
            />
            <View style={styles.inheritingBadgeOverlay}>
              <Info size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
              <AppText style={styles.inheritingBadgeText}>Inheriting Platform Admin Default</AppText>
            </View>
          </>
        ) : isLogo ? (
          <View style={styles.assetLogoFallback}>
            <Building2 size={32} color="#94A3B8" />
            <AppText style={styles.assetEmptySubtext}>No logo configured</AppText>
          </View>
        ) : (
          <View style={styles.assetEmptyPlaceholder}>
            <ImageIcon size={26} color="#94A3B8" />
            <AppText style={styles.assetEmptyText}>No {noun.toLowerCase()} configured (optional)</AppText>
          </View>
        )}
        {uploading && (
          <View style={styles.assetUploadOverlay}>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <AppText style={styles.assetUploadOverlayText}>Saving image reference...</AppText>
          </View>
        )}
      </View>

      {/* Controls Row */}
      {isOwner && (
        <View style={styles.assetActionsRow}>
          <TouchableOpacity
            style={styles.assetBtnPrimary}
            onPress={onUpload}
            disabled={uploading}
            activeOpacity={0.8}
          >
            <Camera size={14} color="#FFFFFF" />
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
              <Trash2 size={14} color="#DC2626" />
              <AppText style={styles.assetBtnResetText}>Remove {noun}</AppText>
            </TouchableOpacity>
          )}
        </View>
      )}
    </Card>
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

export function ClubBrandingSection({ clubId, isOwner }: ClubBrandingSectionProps) {
  const router = useRouter();

  // Queries
  const {
    branding,
    isLoading: isLoadingBranding,
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
      setSlideFormCtaRoute('/(player)/tournaments');
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
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* ── Status Banner ── */}
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

      {/* ══════════════════════════════════════════════════════════════════════
          GROUP 1: CLUB IDENTITY & CORE BANNERS
          ══════════════════════════════════════════════════════════════════════ */}
      <View style={styles.groupHeader}>
        <View style={styles.groupIconWrapper}>
          <Building2 size={18} color="#176B57" />
        </View>
        <View style={styles.groupHeaderTextCol}>
          <AppText style={styles.groupTitle}>Group 1: Club Identity & Core Banners</AppText>
          <AppText style={styles.groupSubtitle}>
            Core club branding assets displayed across platform navigation and the player mobile app.
          </AppText>
        </View>
      </View>

      {/* Official Club Logo */}
      <BrandingAssetCard
        title="Official Club Logo"
        categoryTag="PRIMARY LOGO"
        assetKind="logo"
        recommendedSize="512 × 512 px (1:1) • PNG or JPG"
        description="Official club logo displayed on your profile card, headers, player search, and booking confirmations."
        currentUrl={branding?.logo_url}
        uploading={uploadingField === 'logo_url'}
        isOwner={isOwner}
        onUpload={() =>
          handleUploadAsset('logo_url', 'club_logo', 'Club Logo', [1, 1])
        }
        onReset={() => handleResetAsset('logo_url', 'Club Logo')}
      />

      {/* Player-Facing Club Cover Banner */}
      <BrandingAssetCard
        title="Player-Facing Cover Banner"
        categoryTag="PUBLIC COVER"
        assetKind="banner"
        recommendedSize="1920 × 1080 px (16:9) • JPG or PNG"
        description="Prominent hero banner displayed at the top of your club details in the Player App and discover directories."
        currentUrl={branding?.cover_image_url}
        uploading={uploadingField === 'cover_image_url'}
        isOwner={isOwner}
        onUpload={() =>
          handleUploadAsset('cover_image_url', 'club_cover', 'Player-Facing Cover Banner', [16, 9])
        }
        onReset={() => handleResetAsset('cover_image_url', 'Player-Facing Cover Banner')}
      />

      {/* ══════════════════════════════════════════════════════════════════════
          GROUP 2: TOURNAMENT DEFAULT BANNERS (FORMAT-SPECIFIC)
          ══════════════════════════════════════════════════════════════════════ */}
      <View style={[styles.groupHeader, { marginTop: 28 }]}>
        <View style={styles.groupIconWrapper}>
          <Trophy size={18} color="#176B57" />
        </View>
        <View style={styles.groupHeaderTextCol}>
          <AppText style={styles.groupTitle}>Group 2: Tournament Default Banners</AppText>
          <AppText style={styles.groupSubtitle}>
            Reusable default banners for each supported tournament format. Tournaments without a custom banner automatically inherit their format default or general tournament default.
          </AppText>
        </View>
      </View>

      {/* General Tournament Default */}
      <BrandingAssetCard
        title="General Tournament Default Banner"
        categoryTag="ALL TOURNAMENTS"
        recommendedSize="1200 × 675 px (16:9) • JPG or PNG"
        description="Used as the fallback hero graphic for tournaments in this club when neither a custom tournament banner nor a format-specific default is uploaded."
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

      {/* Round Robin Default */}
      <BrandingAssetCard
        title="Round Robin Default Banner"
        categoryTag="ROUND ROBIN"
        recommendedSize="1200 × 675 px (16:9) • JPG or PNG"
        description="Used as the default hero graphic for all Round Robin tournaments in this club unless a tournament-specific banner is uploaded."
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

      {/* Scramble Default */}
      <BrandingAssetCard
        title="Scramble Default Banner"
        categoryTag="SCRAMBLE"
        recommendedSize="1200 × 675 px (16:9) • JPG or PNG"
        description="Used as the default hero graphic for all Scramble tournaments in this club unless a tournament-specific banner is uploaded."
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

      {/* Pool Play Default */}
      <BrandingAssetCard
        title="Pool Play Default Banner"
        categoryTag="POOL PLAY"
        recommendedSize="1200 × 675 px (16:9) • JPG or PNG"
        description="Used as the default hero graphic for all Pool Play tournaments in this club unless a tournament-specific banner is uploaded."
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

      {/* Bracket Play Default */}
      <BrandingAssetCard
        title="Bracket Play / Championship Bracket Default"
        categoryTag="BRACKET PLAY"
        recommendedSize="1200 × 675 px (16:9) • JPG or PNG"
        description="Used as the default hero graphic for all single/double elimination bracket tournaments in this club."
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

      {/* ══════════════════════════════════════════════════════════════════════
          GROUP 3: LEAGUE DEFAULT PICTURES
          ══════════════════════════════════════════════════════════════════════ */}
      <View style={[styles.groupHeader, { marginTop: 28 }]}>
        <View style={styles.groupIconWrapper}>
          <Award size={18} color="#176B57" />
        </View>
        <View style={styles.groupHeaderTextCol}>
          <AppText style={styles.groupTitle}>Group 3: League Default Pictures</AppText>
          <AppText style={styles.groupSubtitle}>
            Default picture displayed on league cards and league details when no custom picture is provided.
          </AppText>
        </View>
      </View>

      <BrandingAssetCard
        title="League Default Picture"
        categoryTag="LEAGUES"
        assetKind="picture"
        recommendedSize="1200 × 675 px (16:9) • JPG or PNG"
        description="Default picture displayed on league cards and league details when no custom picture is provided."
        currentUrl={branding?.default_league_banner_url}
        fallbackImage={resolveLeaguePicture(null, null, platformBanners)}
        uploading={uploadingField === 'default_league_banner_url'}
        isOwner={isOwner}
        onUpload={() =>
          handleUploadAsset('default_league_banner_url', 'default_league_banner', 'League Default Picture')
        }
        onReset={() => handleResetAsset('default_league_banner_url', 'League Default Picture')}
      />

      {/* ══════════════════════════════════════════════════════════════════════
          GROUP 4: EVENT DEFAULT PICTURES
          ══════════════════════════════════════════════════════════════════════ */}
      <View style={[styles.groupHeader, { marginTop: 28 }]}>
        <View style={styles.groupIconWrapper}>
          <Calendar size={18} color="#176B57" />
        </View>
        <View style={styles.groupHeaderTextCol}>
          <AppText style={styles.groupTitle}>Group 4: Event Default Pictures</AppText>
          <AppText style={styles.groupSubtitle}>
            Default picture displayed on event cards and event details when no custom picture is provided.
          </AppText>
        </View>
      </View>

      <BrandingAssetCard
        title="Event Default Picture"
        categoryTag="EVENTS"
        assetKind="picture"
        recommendedSize="1200 × 675 px (16:9) • JPG or PNG"
        description="Default picture displayed on event cards and event details when no custom picture is provided."
        currentUrl={branding?.default_event_banner_url}
        fallbackImage={resolveEventPicture(null, null, platformBanners)}
        uploading={uploadingField === 'default_event_banner_url'}
        isOwner={isOwner}
        onUpload={() =>
          handleUploadAsset('default_event_banner_url', 'default_event_banner', 'Event Default Picture')
        }
        onReset={() => handleResetAsset('default_event_banner_url', 'Event Default Picture')}
      />

      {/* ══════════════════════════════════════════════════════════════════════
          GROUP 5: LESSON & COACHING DEFAULT PICTURES
          ══════════════════════════════════════════════════════════════════════ */}
      <View style={[styles.groupHeader, { marginTop: 28 }]}>
        <View style={styles.groupIconWrapper}>
          <GraduationCap size={18} color="#176B57" />
        </View>
        <View style={styles.groupHeaderTextCol}>
          <AppText style={styles.groupTitle}>Group 5: Lesson & Coaching Default Pictures</AppText>
          <AppText style={styles.groupSubtitle}>
            Default picture displayed on lesson, coaching, and related booking cards when no custom picture is provided.
          </AppText>
        </View>
      </View>

      <BrandingAssetCard
        title="Lesson & Coaching Default Picture"
        categoryTag="COACHING"
        assetKind="picture"
        recommendedSize="1200 × 675 px (16:9) • JPG or PNG"
        description="Default picture displayed on lesson, coaching, and related booking cards when no custom picture is provided."
        currentUrl={branding?.default_lesson_banner_url}
        fallbackImage={resolveLessonPicture(null, null, platformBanners)}
        uploading={uploadingField === 'default_lesson_banner_url'}
        isOwner={isOwner}
        onUpload={() =>
          handleUploadAsset('default_lesson_banner_url', 'default_lesson_banner', 'Lesson & Coaching Default Picture')
        }
        onReset={() => handleResetAsset('default_lesson_banner_url', 'Lesson & Coaching Default Picture')}
      />

      {/* ══════════════════════════════════════════════════════════════════════
          GROUP 6: CLUB PROMOTIONAL ADS
          ══════════════════════════════════════════════════════════════════════ */}
      <View style={[styles.groupHeader, { marginTop: 32 }]}>
        <View style={styles.groupIconWrapper}>
          <Layers size={18} color="#176B57" />
        </View>
        <View style={styles.groupHeaderTextCol}>
          <View style={styles.headerWithAction}>
            <View style={{ flex: 1 }}>
              <AppText style={styles.groupTitle}>Group 6: Club Promotional Ads</AppText>
              <AppText style={styles.groupSubtitle}>
                Manage promotional advertisements displayed for your club in the Player App. Eligible active ads are also featured on the universal Player Home carousel.
              </AppText>
            </View>
            {isOwner && (
              <TouchableOpacity
                style={styles.addSlideBtn}
                onPress={() => openSlideModal()}
                activeOpacity={0.85}
              >
                <Plus size={15} color="#FFFFFF" />
                <AppText style={styles.addSlideBtnText}>Create Ad</AppText>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <Card style={styles.carouselContainerCard}>
        {isLoadingSlides ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#176B57" />
            <AppText style={styles.loadingText}>Loading promotional ads...</AppText>
          </View>
        ) : slides.length === 0 ? (
          <View style={styles.emptySlidesBox}>
            <ImageIcon size={32} color="#94A3B8" />
            <AppText style={styles.emptySlidesTitle}>No Promotional Ads</AppText>
            <AppText style={styles.emptySlidesDesc}>
              Create promotional advertisements to showcase club tournaments, special clinic discounts, and membership offers to players.
            </AppText>
            {isOwner && (
              <TouchableOpacity
                style={[styles.assetBtnPrimary, { marginTop: 14, alignSelf: 'center' }]}
                onPress={() => openSlideModal()}
              >
                <Plus size={14} color="#FFFFFF" />
                <AppText style={styles.assetBtnPrimaryText}>Create Promotional Ad</AppText>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.slidesList}>
            {slides.map((slide: ClubCarouselSlide, index: number) => {
              const scheduleStatus = getAdScheduleStatus(slide.start_date, slide.end_date, slide.is_active);
              const dateRangeLabel = formatAdDateRange(slide.start_date, slide.end_date);

              return (
                <View key={slide.id} style={styles.slideItem}>
                  {/* Thumbnail */}
                  <Image
                    source={{ uri: resolveMediaUrl(slide.image_url) }}
                    style={styles.slideThumbnail}
                    resizeMode="cover"
                  />

                  {/* Content */}
                  <View style={styles.slideDetails}>
                    <View style={styles.slideTagRow}>
                      {slide.tag ? (
                        <View style={styles.slideTagBadge}>
                          <AppText style={styles.slideTagText}>{slide.tag.toUpperCase()}</AppText>
                        </View>
                      ) : null}
                      <View
                        style={[
                          styles.slideActiveBadge,
                          scheduleStatus.type === 'active' && styles.slideActiveBadgeOn,
                          scheduleStatus.type === 'disabled' && styles.slideActiveBadgeOff,
                          scheduleStatus.type === 'scheduled' && styles.badgeScheduled,
                          scheduleStatus.type === 'expired' && styles.badgeExpired,
                        ]}
                      >
                        <AppText
                          style={[
                            styles.slideActiveBadgeText,
                            scheduleStatus.type === 'active' && styles.slideActiveTextOn,
                            scheduleStatus.type === 'disabled' && styles.slideActiveTextOff,
                            scheduleStatus.type === 'scheduled' && styles.badgeTextScheduled,
                            scheduleStatus.type === 'expired' && styles.badgeTextExpired,
                          ]}
                        >
                          {scheduleStatus.label}
                        </AppText>
                      </View>
                    </View>

                    <AppText style={styles.slideTitle} numberOfLines={1}>
                      {slide.title || 'Untitled Promotional Ad'}
                    </AppText>
                    {slide.subtitle ? (
                      <AppText style={styles.slideSubtitle} numberOfLines={2}>
                        {slide.subtitle}
                      </AppText>
                    ) : null}

                    {dateRangeLabel ? (
                      <AppText style={styles.adDateRangeText}>🗓 {dateRangeLabel}</AppText>
                    ) : null}

                    {slide.cta_text ? (
                      <AppText style={styles.slideCtaInfo} numberOfLines={1}>
                        CTA: "{slide.cta_text}" → {slide.cta_route || 'Default'}
                      </AppText>
                    ) : null}
                  </View>

                  {/* Controls */}
                  {isOwner && (
                    <View style={styles.slideControls}>
                      {/* Reorder Up/Down */}
                      <View style={styles.reorderBtns}>
                        <TouchableOpacity
                          style={[styles.reorderBtn, index === 0 && styles.reorderBtnDisabled]}
                          disabled={index === 0}
                          onPress={() => handleMoveSlide(index, 'up')}
                        >
                          <ArrowUp size={13} color={index === 0 ? '#CBD5E1' : '#1E293B'} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.reorderBtn, index === slides.length - 1 && styles.reorderBtnDisabled]}
                          disabled={index === slides.length - 1}
                          onPress={() => handleMoveSlide(index, 'down')}
                        >
                          <ArrowDown size={13} color={index === slides.length - 1 ? '#CBD5E1' : '#1E293B'} />
                        </TouchableOpacity>
                      </View>

                      {/* Active toggle */}
                      <Switch
                        value={slide.is_active}
                        onValueChange={(val) => handleToggleSlideActive(slide, val)}
                        trackColor={{ false: '#E2E8F0', true: '#A7F3D0' }}
                        thumbColor={slide.is_active ? '#10B981' : '#94A3B8'}
                        style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                      />

                      {/* Edit & Delete */}
                      <View style={styles.slideActionBtns}>
                        <TouchableOpacity
                          style={styles.slideIconBtn}
                          onPress={() => openSlideModal(slide)}
                        >
                          <Sliders size={14} color="#475569" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.slideIconBtn}
                          onPress={() => handleDeleteSlide(slide)}
                        >
                          <Trash2 size={14} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </Card>

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
                    <AppText style={styles.playerPreviewTitle} numberOfLines={2}>
                      {slideFormTitle || 'Promotional Ad Headline'}
                    </AppText>
                    {slideFormSubtitle ? (
                      <AppText style={styles.playerPreviewSubtitle} numberOfLines={2}>
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
                placeholder="e.g. /(player)/tournaments or /(player)/bookings"
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
    backgroundColor: '#F8FAF9',
  },
  contentContainer: {
    padding: Spacing[4],
    paddingBottom: Spacing[12],
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing[3],
    borderRadius: Radius.md,
    marginBottom: Spacing[4],
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
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
    marginBottom: Spacing[3],
  },
  groupIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: '#E5F6EC',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  groupHeaderTextCol: {
    flex: 1,
  },
  groupTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102B2A',
    letterSpacing: -0.2,
  },
  groupSubtitle: {
    fontSize: 12,
    color: '#49635E',
    marginTop: 2,
    lineHeight: 17,
  },
  assetCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[3.5],
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.sm,
  },
  assetCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[1.5],
    gap: Spacing[2],
  },
  assetCardHeaderLeft: {
    flex: 1,
    flexDirection: 'column',
    gap: 3,
  },
  tagBadge: {
    backgroundColor: '#F0F5F2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#176B57',
    letterSpacing: 0.5,
  },
  assetCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102B2A',
  },
  assetCardDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: Spacing[2],
  },
  recommendedSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: Spacing[2.5],
  },
  recommendedSizeText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  assetLogoPreviewWrapper: {
    position: 'relative',
    width: 96,
    height: 96,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetLogoPreviewImage: {
    width: '100%',
    height: '100%',
  },
  assetLogoFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[2],
  },
  assetEmptyPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing[1.5],
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    borderRadius: Radius.md,
  },
  assetEmptyText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  assetEmptySubtext: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
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
    height: 160,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  assetPreviewImage: {
    width: '100%',
    height: '100%',
  },
  inheritingBadgeOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  inheritingBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: '#FFFFFF',
  },
  assetUploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing[2],
  },
  assetUploadOverlayText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  assetActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2.5],
    marginTop: Spacing[3],
    flexWrap: 'wrap',
  },
  assetBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#176B57',
    paddingHorizontal: Spacing[3.5],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    gap: Spacing[1.5],
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
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    gap: Spacing[1.5],
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
    alignItems: 'center',
    gap: Spacing[2],
  },
  addSlideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#176B57',
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1.5],
    borderRadius: Radius.md,
    gap: Spacing[1],
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
    gap: Spacing[3],
  },
  slideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing[2.5],
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: Spacing[3],
  },
  slideThumbnail: {
    width: 64,
    height: 48,
    borderRadius: Radius.sm,
    backgroundColor: '#E2E8F0',
  },
  slideDetails: {
    flex: 1,
  },
  slideTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1.5],
    marginBottom: 2,
  },
  slideTagBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  slideTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#475569',
  },
  slideActiveBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  slideActiveBadgeOn: {
    backgroundColor: '#DCFCE7',
  },
  slideActiveBadgeOff: {
    backgroundColor: '#F1F5F9',
  },
  slideActiveBadgeText: {
    fontSize: 9,
    fontWeight: '600',
  },
  slideActiveTextOn: {
    color: '#15803D',
  },
  slideActiveTextOff: {
    color: '#64748B',
  },
  slideTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  slideSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  slideCtaInfo: {
    fontSize: 10,
    color: '#176B57',
    marginTop: 2,
  },
  slideControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1.5],
  },
  reorderBtns: {
    flexDirection: 'column',
    gap: 2,
  },
  reorderBtn: {
    padding: 3,
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  reorderBtnDisabled: {
    opacity: 0.35,
  },
  slideActionBtns: {
    flexDirection: 'row',
    gap: 4,
  },
  slideIconBtn: {
    padding: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
