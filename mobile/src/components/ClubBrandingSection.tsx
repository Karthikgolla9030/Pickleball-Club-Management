/**
 * Aught2 Pickleball — Club Branding & Visual Assets Management Component
 *
 * Implements full tenant-isolated image and banner management for Club Owners/Managers:
 * 1. Club Identity Assets:
 *    - Logo upload / replace / remove (with 3-tier fallback to paddle icon)
 *    - Cover Banner upload / replace / remove (with 3-tier fallback to neutral asset)
 * 2. Club Hero Carousel Management:
 *    - List configured slides with active/inactive status
 *    - Add new custom slides with title, subtitle, CTA text & route, and custom photo
 *    - Edit existing slides
 *    - Reorder slides (Move Up / Down)
 *    - Toggle active/inactive per slide
 *    - Delete slide with confirmation
 * 3. Domain Entity Visual Hierarchy Guide:
 *    - Explains 3-tier fallback for Tournaments, Leagues, Events, Lessons, Courts
 *    - Links directly to respective management screens
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  GraduationCap,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  Layers,
  Plus,
  RefreshCw,
  Sliders,
  Trash2,
  Trophy,
  X,
} from 'lucide-react-native';

import { AppText } from './AppText';
import { Button } from './Button';
import { Card } from './Card';
import {
  useClubBranding,
  useClubCarouselSlides,
  useCarouselMutations,
  useUpdateClubBranding,
} from '@/hooks';
import { clubAssetsApi } from '@/services/api';
import { Colors, Radius, Shadows, Spacing } from '@/theme';
import type { ClubCarouselSlide } from '@/types';
import { resolveMediaUrl } from '@/utils';

interface ClubBrandingSectionProps {
  clubId: string;
  isOwner: boolean;
}

export function ClubBrandingSection({ clubId, isOwner }: ClubBrandingSectionProps) {
  const router = useRouter();

  // Queries
  const {
    branding,
    isLoading: isLoadingBranding,
    refetch: refetchBranding,
  } = useClubBranding(clubId);

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

  // Local state for uploads
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Slide modal state
  const [slideModalVisible, setSlideModalVisible] = useState(false);
  const [editingSlide, setEditingSlide] = useState<ClubCarouselSlide | null>(null);
  const [slideFormTitle, setSlideFormTitle] = useState('');
  const [slideFormSubtitle, setSlideFormSubtitle] = useState('');
  const [slideFormTag, setSlideFormTag] = useState('');
  const [slideFormCtaText, setSlideFormCtaText] = useState('');
  const [slideFormCtaRoute, setSlideFormCtaRoute] = useState('');
  const [slideFormImageUrl, setSlideFormImageUrl] = useState('');
  const [slideFormIsActive, setSlideFormIsActive] = useState(true);
  const [isUploadingSlideImage, setIsUploadingSlideImage] = useState(false);

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  // ─── Image Picker Helper ───────────────────────────────────────────────────

  const pickImage = async (aspect?: [number, number]): Promise<string | null> => {
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
        aspect: aspect || [16, 9],
        quality: 0.85,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.base64 && (asset.base64.length * 0.75) > 5 * 1024 * 1024) {
          Alert.alert('File Too Large', 'Please select an image smaller than 5 MB.');
          return null;
        }
        return asset.uri;
      }
      return null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error picking image';
      Alert.alert('Selection Error', msg);
      return null;
    }
  };

  // ─── Logo Management ───────────────────────────────────────────────────────

  const handleUploadLogo = async () => {
    if (!isOwner) {
      Alert.alert('Permission Denied', 'Only the Club Owner can manage club branding.');
      return;
    }
    const uri = await pickImage([1, 1]);
    if (!uri) return;

    setIsUploadingLogo(true);
    try {
      const uploadRes = await clubAssetsApi.uploadClubMedia(
        clubId,
        { uri, name: 'club_logo.jpg', type: 'image/jpeg' },
        'logo'
      );
      await updateBrandingMutation.mutateAsync({ logo_url: uploadRes.public_url });
      await refetchBranding();
      showStatus('success', 'Club logo updated successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Logo upload failed';
      showStatus('error', msg);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    if (!isOwner) return;
    Alert.alert(
      'Remove Custom Logo',
      'Are you sure you want to restore the platform default logo for this club?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateBrandingMutation.mutateAsync({ logo_url: null });
              await refetchBranding();
              showStatus('success', 'Custom logo removed. Default restored.');
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to remove logo';
              showStatus('error', msg);
            }
          },
        },
      ]
    );
  };

  // ─── Cover Banner Management ───────────────────────────────────────────────

  const handleUploadCover = async () => {
    if (!isOwner) {
      Alert.alert('Permission Denied', 'Only the Club Owner can manage club branding.');
      return;
    }
    const uri = await pickImage([16, 9]);
    if (!uri) return;

    setIsUploadingCover(true);
    try {
      const uploadRes = await clubAssetsApi.uploadClubMedia(
        clubId,
        { uri, name: 'club_cover.jpg', type: 'image/jpeg' },
        'cover'
      );
      await updateBrandingMutation.mutateAsync({ cover_image_url: uploadRes.public_url });
      await refetchBranding();
      showStatus('success', 'Club cover banner updated successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Cover upload failed';
      showStatus('error', msg);
    } finally {
      setIsUploadingCover(false);
    }
  };

  const handleRemoveCover = () => {
    if (!isOwner) return;
    Alert.alert(
      'Remove Custom Cover Banner',
      'Are you sure you want to restore the neutral fallback cover banner?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateBrandingMutation.mutateAsync({ cover_image_url: null });
              await refetchBranding();
              showStatus('success', 'Custom cover banner removed.');
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to remove cover';
              showStatus('error', msg);
            }
          },
        },
      ]
    );
  };

  // ─── Carousel Slides Management ───────────────────────────────────────────

  const openSlideModal = (slide?: ClubCarouselSlide) => {
    if (slide) {
      setEditingSlide(slide);
      setSlideFormTitle(slide.title || '');
      setSlideFormSubtitle(slide.subtitle || '');
      setSlideFormTag(slide.tag || '');
      setSlideFormCtaText(slide.cta_text || '');
      setSlideFormCtaRoute(slide.cta_route || '');
      setSlideFormImageUrl(slide.image_url || '');
      setSlideFormIsActive(slide.is_active);
    } else {
      setEditingSlide(null);
      setSlideFormTitle('');
      setSlideFormSubtitle('');
      setSlideFormTag('PROMOTION');
      setSlideFormCtaText('Learn More');
      setSlideFormCtaRoute('/(club)/bookings');
      setSlideFormImageUrl('');
      setSlideFormIsActive(true);
    }
    setSlideModalVisible(true);
  };

  const handlePickSlideImage = async () => {
    const uri = await pickImage([16, 9]);
    if (!uri) return;

    setIsUploadingSlideImage(true);
    try {
      const uploadRes = await clubAssetsApi.uploadClubMedia(
        clubId,
        { uri, name: 'slide_image.jpg', type: 'image/jpeg' },
        'carousel_slide'
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
      Alert.alert('Image Required', 'Please upload or select an image for this carousel slide.');
      return;
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
          },
        });
        showStatus('success', 'Carousel slide updated successfully.');
      } else {
        await createSlide.mutateAsync({
          title: slideFormTitle.trim() || null,
          subtitle: slideFormSubtitle.trim() || null,
          tag: slideFormTag.trim() || null,
          image_url: slideFormImageUrl.trim(),
          cta_text: slideFormCtaText.trim() || null,
          cta_route: slideFormCtaRoute.trim() || null,
          is_active: slideFormIsActive,
          display_order: slides.length + 1,
        });
        showStatus('success', 'New promotional slide added.');
      }
      setSlideModalVisible(false);
      await refetchSlides();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save slide';
      Alert.alert('Save Error', msg);
    }
  };

  const handleDeleteSlide = (slide: ClubCarouselSlide) => {
    Alert.alert(
      'Delete Carousel Slide',
      `Delete "${slide.title || 'Untitled Slide'}" from your club carousel?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSlide.mutateAsync(slide.id);
              await refetchSlides();
              showStatus('success', 'Slide deleted.');
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

      {/* ── Section 1: Core Club Identity ── */}
      <View style={styles.sectionHeader}>
        <AppText style={styles.sectionTitle}>Club Visual Identity</AppText>
        <AppText style={styles.sectionSubtitle}>
          Scoped exclusively to your club. Used across player home, cards, switchers, and email notifications.
        </AppText>
      </View>

      <Card style={styles.card}>
        {/* Logo Row */}
        <View style={styles.identityRow}>
          <View style={styles.logoPreviewWrapper}>
            {branding?.logo_url ? (
              <Image
                source={{ uri: resolveMediaUrl(branding.logo_url) }}
                style={styles.logoImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.logoPlaceholder}>
                <ImageIcon size={26} color="#94A3B8" />
              </View>
            )}
            {isUploadingLogo && (
              <View style={styles.uploadOverlay}>
                <ActivityIndicator size="small" color="#FFFFFF" />
              </View>
            )}
          </View>

          <View style={styles.identityTextCol}>
            <AppText style={styles.identityLabel}>Club Logo</AppText>
            <AppText style={styles.identityDesc}>
              Square aspect ratio (e.g. 512×512 PNG or JPG). Appears in navigation, header and club switchers.
            </AppText>

            {isOwner && (
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.actionBtnPrimary}
                  onPress={handleUploadLogo}
                  disabled={isUploadingLogo}
                  activeOpacity={0.8}
                >
                  <Camera size={14} color="#FFFFFF" />
                  <AppText style={styles.actionBtnPrimaryText}>
                    {branding?.logo_url ? 'Replace Logo' : 'Upload Logo'}
                  </AppText>
                </TouchableOpacity>

                {branding?.logo_url && (
                  <TouchableOpacity
                    style={styles.actionBtnDanger}
                    onPress={handleRemoveLogo}
                    activeOpacity={0.8}
                  >
                    <Trash2 size={14} color="#DC2626" />
                    <AppText style={styles.actionBtnDangerText}>Remove</AppText>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Cover Banner Row */}
        <View style={styles.coverSection}>
          <AppText style={styles.identityLabel}>Club Cover / Banner Image</AppText>
          <AppText style={styles.identityDesc}>
            High-resolution landscape photo (16:9). Used as fallback for tournaments, events, coaching, and player home hero.
          </AppText>

          <View style={styles.coverPreviewWrapper}>
            {branding?.cover_image_url ? (
              <Image
                source={{ uri: resolveMediaUrl(branding.cover_image_url) }}
                style={styles.coverImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.coverPlaceholder}>
                <ImageIcon size={32} color="#94A3B8" />
                <AppText style={styles.placeholderNotice}>
                  Using neutral system fallback. Upload a custom cover banner below.
                </AppText>
              </View>
            )}
            {isUploadingCover && (
              <View style={styles.uploadOverlay}>
                <ActivityIndicator size="small" color="#FFFFFF" />
              </View>
            )}
          </View>

          {isOwner && (
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.actionBtnPrimary}
                onPress={handleUploadCover}
                disabled={isUploadingCover}
                activeOpacity={0.8}
              >
                <Camera size={14} color="#FFFFFF" />
                <AppText style={styles.actionBtnPrimaryText}>
                  {branding?.cover_image_url ? 'Replace Cover Banner' : 'Upload Cover Banner'}
                </AppText>
              </TouchableOpacity>

              {branding?.cover_image_url && (
                <TouchableOpacity
                  style={styles.actionBtnDanger}
                  onPress={handleRemoveCover}
                  activeOpacity={0.8}
                >
                  <Trash2 size={14} color="#DC2626" />
                  <AppText style={styles.actionBtnDangerText}>Restore Fallback</AppText>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </Card>

      {/* ── Section 2: Club Home Hero Carousel (Phase 5) ── */}
      <View style={[styles.sectionHeader, { marginTop: 24 }]}>
        <View style={styles.headerWithAction}>
          <View style={{ flex: 1 }}>
            <AppText style={styles.sectionTitle}>Home Page Hero Carousel</AppText>
            <AppText style={styles.sectionSubtitle}>
              Customize promotional slides displayed on your club player home screen.
            </AppText>
          </View>
          {isOwner && (
            <TouchableOpacity
              style={styles.addSlideBtn}
              onPress={() => openSlideModal()}
              activeOpacity={0.85}
            >
              <Plus size={15} color="#FFFFFF" />
              <AppText style={styles.addSlideBtnText}>Add Slide</AppText>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Card style={styles.card}>
        {isLoadingSlides ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#176B57" />
            <AppText style={styles.loadingText}>Loading carousel slides...</AppText>
          </View>
        ) : slides.length === 0 ? (
          <View style={styles.emptySlidesBox}>
            <ImageIcon size={30} color="#94A3B8" />
            <AppText style={styles.emptySlidesTitle}>No Custom Slides Configured</AppText>
            <AppText style={styles.emptySlidesDesc}>
              When no custom slides are added, your club cover banner or neutral product fallbacks are displayed.
            </AppText>
            {isOwner && (
              <TouchableOpacity
                style={[styles.actionBtnPrimary, { marginTop: 12 }]}
                onPress={() => openSlideModal()}
              >
                <Plus size={14} color="#FFFFFF" />
                <AppText style={styles.actionBtnPrimaryText}>Create First Slide</AppText>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.slidesList}>
            {slides.map((slide: ClubCarouselSlide, index: number) => (
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
                        slide.is_active ? styles.slideActiveBadgeOn : styles.slideActiveBadgeOff,
                      ]}
                    >
                      <AppText
                        style={[
                          styles.slideActiveBadgeText,
                          slide.is_active ? styles.slideActiveTextOn : styles.slideActiveTextOff,
                        ]}
                      >
                        {slide.is_active ? 'Active' : 'Disabled'}
                      </AppText>
                    </View>
                  </View>

                  <AppText style={styles.slideTitle} numberOfLines={1}>
                    {slide.title || 'Untitled Slide'}
                  </AppText>
                  {slide.subtitle ? (
                    <AppText style={styles.slideSubtitle} numberOfLines={1}>
                      {slide.subtitle}
                    </AppText>
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
            ))}
          </View>
        )}
      </Card>

      {/* ── Section 3: Entity Fallback Hierarchy Guide ── */}
      <View style={[styles.sectionHeader, { marginTop: 24 }]}>
        <AppText style={styles.sectionTitle}>Entity Visual Hierarchy & Scopes</AppText>
        <AppText style={styles.sectionSubtitle}>
          How images resolve across individual competitions, programs, courts, and social events.
        </AppText>
      </View>

      <Card style={styles.card}>
        <View style={styles.hierarchyItem}>
          <Trophy size={18} color="#176B57" style={styles.hierarchyIcon} />
          <View style={styles.hierarchyTextCol}>
            <AppText style={styles.hierarchyTitle}>Tournaments & Competitions</AppText>
            <AppText style={styles.hierarchyDesc}>
              Custom banner set on each tournament → Falls back to your Club Cover → Falls back to neutral court photo.
            </AppText>
          </View>
          <TouchableOpacity
            style={styles.hierarchyLink}
            onPress={() => router.push('/(club)/tournaments' as any)}
          >
            <ChevronRight size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <View style={styles.hierarchyItem}>
          <Award size={18} color="#176B57" style={styles.hierarchyIcon} />
          <View style={styles.hierarchyTextCol}>
            <AppText style={styles.hierarchyTitle}>Leagues & Ladders</AppText>
            <AppText style={styles.hierarchyDesc}>
              Custom banner set on each league → Falls back to your Club Cover → Falls back to clean platform imagery.
            </AppText>
          </View>
          <TouchableOpacity
            style={styles.hierarchyLink}
            onPress={() => router.push('/(club)/leagues' as any)}
          >
            <ChevronRight size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <View style={styles.hierarchyItem}>
          <Calendar size={18} color="#176B57" style={styles.hierarchyIcon} />
          <View style={styles.hierarchyTextCol}>
            <AppText style={styles.hierarchyTitle}>Social Events & Open Play</AppText>
            <AppText style={styles.hierarchyDesc}>
              Custom event cover → Falls back to your Club Cover → Falls back to event category graphics.
            </AppText>
          </View>
          <TouchableOpacity
            style={styles.hierarchyLink}
            onPress={() => router.push('/(club)/events' as any)}
          >
            <ChevronRight size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <View style={styles.hierarchyItem}>
          <GraduationCap size={18} color="#176B57" style={styles.hierarchyIcon} />
          <View style={styles.hierarchyTextCol}>
            <AppText style={styles.hierarchyTitle}>Lessons & Coaching Programs</AppText>
            <AppText style={styles.hierarchyDesc}>
              Lesson program photo → Falls back to your Club Cover → Falls back to clinic card thumbnails.
            </AppText>
          </View>
          <TouchableOpacity
            style={styles.hierarchyLink}
            onPress={() => router.push('/(club)/lessons' as any)}
          >
            <ChevronRight size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <View style={styles.hierarchyItem}>
          <LayoutGrid size={18} color="#176B57" style={styles.hierarchyIcon} />
          <View style={styles.hierarchyTextCol}>
            <AppText style={styles.hierarchyTitle}>Courts & Facilities</AppText>
            <AppText style={styles.hierarchyDesc}>
              Individual court photo → Falls back to your Club Cover → Falls back to numbered court court art.
            </AppText>
          </View>
          <TouchableOpacity
            style={styles.hierarchyLink}
            onPress={() => router.push('/(club)/courts' as any)}
          >
            <ChevronRight size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>
      </Card>

      {/* ── Slide Create / Edit Modal ── */}
      <Modal
        visible={slideModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSlideModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <AppText style={styles.modalTitle}>
                {editingSlide ? 'Edit Carousel Slide' : 'Add Promotional Slide'}
              </AppText>
              <TouchableOpacity onPress={() => setSlideModalVisible(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalFormContent}>
              {/* Slide Image Preview & Upload */}
              <AppText style={styles.formLabel}>Slide Photo *</AppText>
              <View style={styles.modalImageWrapper}>
                {slideFormImageUrl ? (
                  <Image
                    source={{ uri: resolveMediaUrl(slideFormImageUrl) }}
                    style={styles.modalSlidePreview}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.modalSlidePlaceholder}>
                    <ImageIcon size={28} color="#94A3B8" />
                    <AppText style={styles.modalPlaceholderText}>No image selected</AppText>
                  </View>
                )}
                {isUploadingSlideImage && (
                  <View style={styles.uploadOverlay}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[styles.actionBtnPrimary, { marginBottom: 16 }]}
                onPress={handlePickSlideImage}
                disabled={isUploadingSlideImage}
              >
                <Camera size={14} color="#FFFFFF" />
                <AppText style={styles.actionBtnPrimaryText}>
                  {slideFormImageUrl ? 'Change Image' : 'Upload Slide Photo'}
                </AppText>
              </TouchableOpacity>

              {/* Title */}
              <AppText style={styles.formLabel}>Headline Title</AppText>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. Summer Smash Championship"
                value={slideFormTitle}
                onChangeText={setSlideFormTitle}
                placeholderTextColor="#94A3B8"
              />

              {/* Subtitle */}
              <AppText style={styles.formLabel}>Subtitle / Description</AppText>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. Register by Friday for early bird pricing"
                value={slideFormSubtitle}
                onChangeText={setSlideFormSubtitle}
                placeholderTextColor="#94A3B8"
              />

              {/* Tag */}
              <AppText style={styles.formLabel}>Badge Tag</AppText>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. TOURNAMENT, CLINIC, SPECIAL"
                value={slideFormTag}
                onChangeText={setSlideFormTag}
                placeholderTextColor="#94A3B8"
              />

              {/* CTA Label */}
              <AppText style={styles.formLabel}>Call To Action Label</AppText>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. Book a Court, Register Now"
                value={slideFormCtaText}
                onChangeText={setSlideFormCtaText}
                placeholderTextColor="#94A3B8"
              />

              {/* CTA Route */}
              <AppText style={styles.formLabel}>Destination Route</AppText>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. /(club)/tournaments, /(club)/bookings"
                value={slideFormCtaRoute}
                onChangeText={setSlideFormCtaRoute}
                placeholderTextColor="#94A3B8"
              />

              {/* Active Toggle */}
              <View style={styles.formSwitchRow}>
                <View>
                  <AppText style={styles.formLabelNoMargin}>Slide Active</AppText>
                  <AppText style={styles.formHelperText}>Show this slide to players on the home page</AppText>
                </View>
                <Switch
                  value={slideFormIsActive}
                  onValueChange={setSlideFormIsActive}
                  trackColor={{ false: '#E2E8F0', true: '#A7F3D0' }}
                  thumbColor={slideFormIsActive ? '#10B981' : '#94A3B8'}
                />
              </View>
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setSlideModalVisible(false)}
              >
                <AppText style={styles.modalCancelText}>Cancel</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveSlide}
                disabled={createSlide.isPending || updateSlide.isPending}
              >
                {(createSlide.isPending || updateSlide.isPending) ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <AppText style={styles.modalSaveText}>Save Slide</AppText>
                )}
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
    padding: 16,
    paddingBottom: 60,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    gap: 8,
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
  sectionHeader: {
    marginBottom: 10,
  },
  headerWithAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102B2A',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  identityRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  logoPreviewWrapper: {
    width: 80,
    height: 80,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F8FAFC',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityTextCol: {
    flex: 1,
  },
  identityLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  identityDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
    lineHeight: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#176B57',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  actionBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  actionBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },
  actionBtnDangerText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  coverSection: {
    marginTop: 4,
  },
  coverPreviewWrapper: {
    width: '100%',
    height: 140,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    marginTop: 10,
    backgroundColor: '#F8FAFC',
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  placeholderNotice: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
  },
  addSlideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#176B57',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 4,
  },
  addSlideBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 8,
  },
  emptySlidesBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySlidesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    marginTop: 8,
  },
  emptySlidesDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 280,
  },
  slidesList: {
    gap: 12,
  },
  slideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  slideThumbnail: {
    width: 68,
    height: 52,
    borderRadius: 6,
  },
  slideDetails: {
    flex: 1,
  },
  slideTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  slideTagBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  slideTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#334155',
  },
  slideActiveBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
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
    fontWeight: '700',
    color: '#0F172A',
  },
  slideSubtitle: {
    fontSize: 11,
    color: '#64748B',
  },
  slideCtaInfo: {
    fontSize: 10,
    color: '#176B57',
    fontWeight: '500',
    marginTop: 2,
  },
  slideControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reorderBtns: {
    flexDirection: 'column',
    gap: 2,
  },
  reorderBtn: {
    padding: 3,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  reorderBtnDisabled: {
    opacity: 0.4,
  },
  slideActionBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  slideIconBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  hierarchyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hierarchyIcon: {
    width: 24,
  },
  hierarchyTextCol: {
    flex: 1,
  },
  hierarchyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  hierarchyDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  hierarchyLink: {
    padding: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalFormContent: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
  },
  formLabelNoMargin: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  formHelperText: {
    fontSize: 11,
    color: '#64748B',
  },
  modalImageWrapper: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 10,
    position: 'relative',
  },
  modalSlidePreview: {
    width: '100%',
    height: '100%',
  },
  modalSlidePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPlaceholderText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  formInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
    marginBottom: 12,
  },
  formSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
    marginTop: 4,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
    paddingTop: 12,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  modalSaveBtn: {
    flex: 1,
    backgroundColor: '#176B57',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalSaveText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
