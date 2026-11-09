/**
 * Aught2 Pickleball — Platform Admin → Home Page Banners & Centralized Defaults
 *
 * Professional, unified management interface for:
 * 1. Home Page Banners (Club Side Home, Player Side Home)
 * 2. Tournament Default Banners (Round Robin, Pool Play, Scramble, Bracket)
 * 3. Activity Default Banners (Events, Lessons & Coaching, Leagues)
 *
 * Features:
 * - Segmented category selector (Home Banners, Tournaments, Activities)
 * - Sub-pill selector for each format/category item
 * - Responsive 16:9 Live Preview showing custom uploaded asset or deliberate built-in fallback
 * - Upload/replace image via MediaStorageService
 * - Reset to built-in fallback (removes custom image)
 * - Expandable Banner Text & Link Settings accordion
 * - Instant query invalidation synchronizing across all portals
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  ImageSourcePropType,
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
import { useRouter } from 'expo-router';
import {
  AlertCircle,
  ArrowRight,
  Award,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  GraduationCap,
  Image as ImageIcon,
  ImagePlus,
  Info,
  Layers,
  RotateCcw,
  Save,
  Sliders,
  Smartphone,
  Trash2,
  Trophy,
  Upload,
  Users,
} from 'lucide-react-native';

import { AppText, PlatformShell } from '@/components';
import {
  usePlatformBanners,
  usePlatformBannerMutations,
  type PlatformBannerType,
} from '@/hooks';
import type { PlatformBanner } from '@/types';
import { BUILTIN_FALLBACKS, resolveMediaUrl } from '@/utils';

export type PlatformBannerCategory = 'home' | 'tournament' | 'activity';

export interface BannerItemConfig {
  key: PlatformBannerType;
  title: string;
  category: PlatformBannerCategory;
  categoryLabel: string;
  badgeLabel: string;
  description: string;
  aspectRatio?: [number, number];
  recommendedSize: string;
  defaultTitle: string;
  defaultSubtitle: string;
  defaultCtaText: string;
  defaultCtaDestination: string;
  builtinFallback: ImageSourcePropType | null;
}

const BANNER_CONFIGS: BannerItemConfig[] = [
  // ─── 1. Home Page Banners ────────────────────────────────────────────────
  {
    key: 'owner_home',
    title: 'Club Side Home Banner',
    category: 'home',
    categoryLabel: 'Home Banners',
    badgeLabel: 'Club Dashboard',
    description: 'Main hero welcome banner displayed on the Club Owner Dashboard.',
    recommendedSize: '1600 × 900 (16:9)',
    defaultTitle: 'Welcome to Pickleball',
    defaultSubtitle: 'Great courts. Active members. A healthier, happier community.',
    defaultCtaText: 'Book a Court',
    defaultCtaDestination: '/(club)/bookings',
    builtinFallback: null,
  },
  {
    key: 'player_home',
    title: 'Player Side Home Banner',
    category: 'home',
    categoryLabel: 'Home Banners',
    badgeLabel: 'Player Home',
    description: 'Main hero welcome banner displayed on the Player App Home page.',
    recommendedSize: '1600 × 900 (16:9)',
    defaultTitle: 'Welcome to Pickleball',
    defaultSubtitle: 'Ready to play, compete and make the most of your game?',
    defaultCtaText: 'Find a Court',
    defaultCtaDestination: '/(player)/book-court-club',
    builtinFallback: null,
  },

  // ─── 2. Tournament Defaults ──────────────────────────────────────────────
  {
    key: 'default_tournament_banner',
    title: 'General Tournament Default Banner',
    category: 'tournament',
    categoryLabel: 'Tournaments',
    badgeLabel: 'General Tournament',
    description: 'Global fallback banner for tournaments when neither a custom banner nor a format-specific default is configured.',
    recommendedSize: '1200 × 675 (16:9)',
    defaultTitle: 'Tournament Competition',
    defaultSubtitle: 'Official Club Tournament',
    defaultCtaText: 'Explore Tournaments',
    defaultCtaDestination: '/(player)/tournaments',
    builtinFallback: BUILTIN_FALLBACKS.tournamentGeneric,
  },
  {
    key: 'default_tournament_round_robin',
    title: 'Round Robin Default Banner',
    category: 'tournament',
    categoryLabel: 'Tournaments',
    badgeLabel: 'Round Robin',
    description: 'Default banner for Round Robin tournaments when no custom banner is uploaded.',
    recommendedSize: '1200 × 675 (16:9)',
    defaultTitle: 'Round Robin Tournament',
    defaultSubtitle: 'Official Round Robin Competition',
    defaultCtaText: 'Explore Tournaments',
    defaultCtaDestination: '/(player)/tournaments',
    builtinFallback: BUILTIN_FALLBACKS.tournamentRoundRobin,
  },
  {
    key: 'default_tournament_pool_play',
    title: 'Pool Play Default Banner',
    category: 'tournament',
    categoryLabel: 'Tournaments',
    badgeLabel: 'Pool Play',
    description: 'Default banner for Pool Play tournaments when no custom banner is uploaded.',
    recommendedSize: '1200 × 675 (16:9)',
    defaultTitle: 'Pool Play Tournament',
    defaultSubtitle: 'Official Pool Play Competition',
    defaultCtaText: 'Explore Tournaments',
    defaultCtaDestination: '/(player)/tournaments',
    builtinFallback: BUILTIN_FALLBACKS.tournamentPoolPlay,
  },
  {
    key: 'default_tournament_scramble',
    title: 'Scramble Default Banner',
    category: 'tournament',
    categoryLabel: 'Tournaments',
    badgeLabel: 'Scramble',
    description: 'Default banner for Scramble tournaments when no custom banner is uploaded.',
    recommendedSize: '1200 × 675 (16:9)',
    defaultTitle: 'Scramble Tournament',
    defaultSubtitle: 'Official Scramble Competition',
    defaultCtaText: 'Explore Tournaments',
    defaultCtaDestination: '/(player)/tournaments',
    builtinFallback: BUILTIN_FALLBACKS.tournamentScramble,
  },
  {
    key: 'default_tournament_bracket',
    title: 'Bracket Play Default Banner',
    category: 'tournament',
    categoryLabel: 'Tournaments',
    badgeLabel: 'Bracket',
    description: 'Default banner for Bracket (Single & Double Elimination) tournaments without custom images.',
    recommendedSize: '1200 × 675 (16:9)',
    defaultTitle: 'Bracket Tournament',
    defaultSubtitle: 'Single and Double Elimination',
    defaultCtaText: 'Explore Tournaments',
    defaultCtaDestination: '/(player)/tournaments',
    builtinFallback: BUILTIN_FALLBACKS.tournamentBracket,
  },

  // ─── 3. Activity Defaults ────────────────────────────────────────────────
  {
    key: 'default_event_banner',
    title: 'Event Default Banner',
    category: 'activity',
    categoryLabel: 'Activities',
    badgeLabel: 'Events',
    description: 'Default cover image for club events (socials, clinics, community days).',
    recommendedSize: '1200 × 675 (16:9)',
    defaultTitle: 'Club Event',
    defaultSubtitle: 'Socials, clinics, and community events',
    defaultCtaText: 'View Events',
    defaultCtaDestination: '/(player)/events',
    builtinFallback: BUILTIN_FALLBACKS.event,
  },
  {
    key: 'default_lesson_banner',
    title: 'Lessons & Coaching Default Banner',
    category: 'activity',
    categoryLabel: 'Activities',
    badgeLabel: 'Lessons & Coaching',
    description: 'Default banner for coaching sessions and group clinics without custom session photos.',
    recommendedSize: '1200 × 675 (16:9)',
    defaultTitle: 'Lessons & Coaching',
    defaultSubtitle: 'Group clinics and private coaching sessions',
    defaultCtaText: 'Find Lessons',
    defaultCtaDestination: '/(player)/lessons',
    builtinFallback: BUILTIN_FALLBACKS.lesson,
  },
  {
    key: 'default_league_banner',
    title: 'League Default Banner',
    category: 'activity',
    categoryLabel: 'Activities',
    badgeLabel: 'Leagues',
    description: 'Default banner for competitive league seasons and ladders.',
    recommendedSize: '1200 × 675 (16:9)',
    defaultTitle: 'League Competition',
    defaultSubtitle: 'Competitive league seasons and ladders',
    defaultCtaText: 'Join League',
    defaultCtaDestination: '/(player)/leagues',
    builtinFallback: BUILTIN_FALLBACKS.league,
  },
];

export default function PlatformBannersScreen() {
  const router = useRouter();

  const { banners, isLoading, refetch } = usePlatformBanners();
  const { updateBanner, uploadBannerImage, resetBanner } = usePlatformBannerMutations();

  const { width: windowWidth } = useWindowDimensions();
  const isWideScreen = windowWidth >= 640;
  const isCompactScreen = windowWidth < 380;

  const categoryScrollRef = useRef<ScrollView>(null);
  const subPillScrollRef = useRef<ScrollView>(null);

  const [activeCategory, setActiveCategory] = useState<PlatformBannerCategory>('home');
  const [activeBannerKey, setActiveBannerKey] = useState<PlatformBannerType>('owner_home');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showTextSettings, setShowTextSettings] = useState(false);

  // Form states for currently selected banner
  const [formTitle, setFormTitle] = useState('');
  const [formSubtitle, setFormSubtitle] = useState('');
  const [formCtaText, setFormCtaText] = useState('');
  const [formCtaDestination, setFormCtaDestination] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Filter items belonging to current category
  const categoryItems = useMemo(
    () => BANNER_CONFIGS.filter((item) => item.category === activeCategory),
    [activeCategory]
  );

  const currentItemConfig = useMemo(
    () => BANNER_CONFIGS.find((item) => item.key === activeBannerKey) || BANNER_CONFIGS[0],
    [activeBannerKey]
  );

  // Ensure active banner belongs to selected category when category switches
  useEffect(() => {
    const valid = categoryItems.some((item) => item.key === activeBannerKey);
    if (!valid && categoryItems.length > 0) {
      setActiveBannerKey(categoryItems[0].key);
    }
  }, [activeCategory, categoryItems, activeBannerKey]);

  // Smooth scroll back to start when category changes
  useEffect(() => {
    subPillScrollRef.current?.scrollTo({ x: 0, animated: true });
  }, [activeCategory]);

  // Synchronize form states when selected banner data arrives or active item changes
  useEffect(() => {
    const banner = banners[activeBannerKey];
    if (banner) {
      setFormTitle(banner.title || currentItemConfig.defaultTitle);
      setFormSubtitle(banner.subtitle || currentItemConfig.defaultSubtitle);
      setFormCtaText(banner.cta_text || currentItemConfig.defaultCtaText);
      setFormCtaDestination(banner.cta_destination || currentItemConfig.defaultCtaDestination);
      setFormIsActive(banner.is_active ?? true);
    } else {
      setFormTitle(currentItemConfig.defaultTitle);
      setFormSubtitle(currentItemConfig.defaultSubtitle);
      setFormCtaText(currentItemConfig.defaultCtaText);
      setFormCtaDestination(currentItemConfig.defaultCtaDestination);
      setFormIsActive(true);
    }
  }, [banners, activeBannerKey, currentItemConfig]);

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4500);
  };

  const currentBanner: PlatformBanner | undefined = banners[activeBannerKey];
  const isCustomImage = Boolean(currentBanner?.image_url);

  // ─── Image Picker & Upload ──────────────────────────────────────────────────
  const handlePickAndUploadImage = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Needed', 'Please allow gallery access to upload banner photos.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: currentItemConfig.aspectRatio,
        quality: 0.88,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const mime = asset.mimeType || (asset.uri?.endsWith('.png') ? 'image/png' : 'image/jpeg');
        const ext = mime.includes('png') ? 'png' : 'jpg';
        const fileName = `${activeBannerKey}_${Date.now()}.${ext}`;

        setIsUploading(true);
        try {
          await uploadBannerImage.mutateAsync({
            type: activeBannerKey,
            fileInput: {
              uri: asset.uri,
              name: fileName,
              type: mime,
            },
          });
          await refetch();
          showStatus('success', `${currentItemConfig.title} updated successfully!`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Image upload failed.';
          showStatus('error', msg);
          Alert.alert('Upload Failed', msg);
        } finally {
          setIsUploading(false);
        }
      }
    } catch {
      Alert.alert('Error', 'Unable to open media picker.');
    }
  };

  // ─── Save Text & CTA Settings ──────────────────────────────────────────────
  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const payload = {
        title: formTitle.trim() || null,
        subtitle: formSubtitle.trim() || null,
        cta_text: formCtaText.trim() || null,
        cta_destination: formCtaDestination.trim() || null,
        is_active: formIsActive,
      };

      await updateBanner.mutateAsync({
        type: activeBannerKey,
        payload,
      });
      await refetch();
      showStatus('success', `${currentItemConfig.title} configuration saved successfully!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save banner settings.';
      showStatus('error', msg);
      Alert.alert('Save Error', msg);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Reset / Remove Banner Image ──────────────────────────────────────────
  const handleResetBanner = () => {
    Alert.alert(
      `Restore Default for ${currentItemConfig.title}`,
      `Are you sure you want to restore the built-in default for ${currentItemConfig.title}? The custom uploaded image will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore Default',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetBanner.mutateAsync(activeBannerKey);
              await refetch();
              showStatus('success', `${currentItemConfig.title} reset to built-in default.`);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Reset failed';
              showStatus('error', msg);
            }
          },
        },
      ]
    );
  };

  // ─── Preview Image Resolution ──────────────────────────────────────────────
  const previewImageSource: ImageSourcePropType | null = useMemo(() => {
    if (currentBanner?.image_url) {
      return { uri: resolveMediaUrl(currentBanner.image_url) };
    }
    return currentItemConfig.builtinFallback;
  }, [currentBanner?.image_url, currentItemConfig.builtinFallback]);

  return (
    <PlatformShell
      activeTab="settings"
      onRefresh={refetch}
      isRefreshing={isLoading}
      scrollable
    >
      <View style={styles.container}>
        {/* ── Page Heading ── */}
        <View style={styles.headerSection}>
          <AppText style={styles.screenTitle}>Banners & Image Defaults</AppText>
          <AppText style={styles.screenSubtitle}>
            Manage global home banners, tournament format defaults, and category banners
          </AppText>
        </View>

        {/* ── Status Message Alert ── */}
        {statusMessage && (
          <View
            style={[
              styles.statusBanner,
              statusMessage.type === 'success' ? styles.statusBannerSuccess : styles.statusBannerError,
            ]}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 size={15} color="#15803D" />
            ) : (
              <AlertCircle size={15} color="#B91C1C" />
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

        {/* ── Information Card ── */}
        <View style={styles.infoCard}>
          <View style={styles.infoIconWrap}>
            <ImageIcon size={18} color="#15803D" strokeWidth={2.2} />
          </View>
          <View style={styles.infoTextCol}>
            <AppText style={styles.infoTitle}>Centralized Defaults & Global Banners</AppText>
            <AppText style={styles.infoDesc}>
              Platform defaults provide the baseline fallback for tournaments, events, and activities across all
              clubs whenever a club or item has not uploaded a custom photo.
            </AppText>
          </View>
        </View>

        {/* ── 1. Top Category Selector ── */}
        <View style={styles.categoryTabsOuter}>
          <ScrollView
            ref={categoryScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[
              styles.categoryTabsTrack,
              isWideScreen && styles.categoryTabsTrackWide,
            ]}
            style={styles.categoryTabsScroll}
          >
            {[
              { key: 'home' as const, label: 'Home Banners', icon: Smartphone },
              { key: 'tournament' as const, label: 'Tournament Defaults', icon: Trophy },
              { key: 'activity' as const, label: 'Activity Defaults', icon: Calendar },
            ].map((cat) => {
              const isSelected = activeCategory === cat.key;
              const IconComp = cat.icon;
              return (
                <TouchableOpacity
                  key={cat.key}
                  style={[
                    styles.categoryTab,
                    isWideScreen && styles.categoryTabWide,
                    isSelected && styles.categoryTabActive,
                  ]}
                  onPress={() => setActiveCategory(cat.key)}
                  activeOpacity={0.8}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={cat.label}
                >
                  <IconComp
                    size={15}
                    color={isSelected ? '#15803D' : '#64748B'}
                    strokeWidth={2.2}
                    style={{ flexShrink: 0 }}
                  />
                  <AppText
                    style={[styles.categoryTabText, isSelected && styles.categoryTabTextActive]}
                  >
                    {cat.label}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── 2. Sub-Pill Selector for Selected Category ── */}
        <ScrollView
          ref={subPillScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subPillsScroll}
          style={styles.subPillsScrollWrapper}
        >
          {categoryItems.map((item) => {
            const isSelected = activeBannerKey === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.subPill, isSelected && styles.subPillActive]}
                onPress={() => setActiveBannerKey(item.key)}
                activeOpacity={0.8}
                accessibilityRole="tab"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={item.badgeLabel}
              >
                <AppText
                  style={[styles.subPillText, isSelected && styles.subPillTextActive]}
                >
                  {item.badgeLabel}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── 3. Live Preview Card ── */}
        <View style={styles.previewCard}>
          {/* Responsive Card Header (Heading + Status Badge) */}
          <View style={[styles.previewHeaderBlock, isWideScreen && styles.previewHeaderBlockWide]}>
            <View style={styles.previewTitleRow}>
              <Eye size={17} color="#15803D" strokeWidth={2.4} style={styles.previewTitleIcon} />
              <AppText style={styles.previewTitle}>{currentItemConfig.title}</AppText>
            </View>
            <View style={styles.previewBadgeRow}>
              <View
                style={[
                  styles.previewBadgePill,
                  !isCustomImage && styles.previewBadgePillFallback,
                ]}
              >
                <View
                  style={[
                    styles.previewBadgeDot,
                    !isCustomImage && styles.previewBadgeDotFallback,
                  ]}
                />
                <AppText
                  style={[
                    styles.previewBadgeText,
                    !isCustomImage && styles.previewBadgeTextFallback,
                  ]}
                >
                  {isCustomImage
                    ? 'CUSTOM PLATFORM DEFAULT'
                    : currentItemConfig.builtinFallback
                    ? 'BUILT-IN DEFAULT'
                    : 'OPTIONAL (NO DEFAULT)'}
                </AppText>
              </View>
            </View>
          </View>

          {/* Description */}
          <AppText style={styles.previewSubtitle}>{currentItemConfig.description}</AppText>

          {/* 16:9 Aspect Ratio Banner Container */}
          <View style={styles.imagePreviewWrapper}>
            {previewImageSource ? (
              <ImageBackground
                source={previewImageSource}
                style={styles.heroImageBg}
                imageStyle={styles.heroImageBgInner}
                resizeMode="cover"
              >
                {/* Subtle contrast overlay */}
                <View style={styles.heroOverlay} />

                {/* Overlaid Banner Content */}
                <View style={styles.heroContentInner}>
                  <View style={styles.heroUpperBlock}>
                    <AppText style={styles.heroTag}>{currentItemConfig.badgeLabel.toUpperCase()}</AppText>
                    <AppText style={styles.heroHeading} numberOfLines={2}>
                      {formTitle || currentItemConfig.defaultTitle}
                    </AppText>
                    <AppText style={styles.heroSupportingText} numberOfLines={2}>
                      {formSubtitle || currentItemConfig.defaultSubtitle}
                    </AppText>
                  </View>

                  <View style={styles.heroBottomRow}>
                    <View style={styles.heroCtaPill}>
                      <AppText style={styles.heroCtaText}>
                        {formCtaText || currentItemConfig.defaultCtaText}
                      </AppText>
                      <ArrowRight size={12} color="#0F172A" strokeWidth={2.5} />
                    </View>
                  </View>
                </View>
              </ImageBackground>
            ) : (
              <View style={[styles.heroImageBg, { backgroundColor: '#0B332B' }]}>
                <View style={styles.heroContentInner}>
                  <View style={styles.heroUpperBlock}>
                    <AppText style={styles.heroTag}>{currentItemConfig.badgeLabel.toUpperCase()}</AppText>
                    <AppText style={styles.heroHeading} numberOfLines={2}>
                      {formTitle || currentItemConfig.defaultTitle}
                    </AppText>
                    <AppText style={styles.heroSupportingText} numberOfLines={2}>
                      {formSubtitle || currentItemConfig.defaultSubtitle}
                    </AppText>
                  </View>

                  <View style={styles.heroBottomRow}>
                    <View style={styles.heroCtaPill}>
                      <AppText style={styles.heroCtaText}>
                        {formCtaText || currentItemConfig.defaultCtaText}
                      </AppText>
                      <ArrowRight size={12} color="#0F172A" strokeWidth={2.5} />
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Upload Spinner Overlay */}
            {isUploading && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <AppText style={styles.uploadingText}>Uploading banner image...</AppText>
              </View>
            )}
          </View>

          {/* Current Banner Status Info */}
          <View style={styles.currentBannerRow}>
            <View style={styles.currentBannerLeft}>
              <View style={styles.currentBannerIconWrap}>
                <ImagePlus size={15} color="#15803D" strokeWidth={2} />
              </View>
              <View style={styles.currentBannerTextCol}>
                <AppText style={styles.currentBannerTitle}>Current Image Status</AppText>
                <AppText style={styles.currentBannerDesc}>
                  {isCustomImage
                    ? 'Custom image uploaded. This image is active platform-wide.'
                    : currentItemConfig.builtinFallback
                    ? 'Using deliberate built-in platform default asset.'
                    : 'No custom image configured. Clean neutral UI fallback is active.'}
                </AppText>
              </View>
            </View>
          </View>

          {/* Action Buttons Row */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.btnUpload}
              onPress={handlePickAndUploadImage}
              disabled={isUploading}
              activeOpacity={0.85}
              accessibilityLabel="Upload Image"
            >
              <Upload size={14} color="#FFFFFF" strokeWidth={2.2} />
              <AppText style={styles.btnUploadText}>
                {isCustomImage ? 'Replace Image' : 'Upload Image'}
              </AppText>
            </TouchableOpacity>

            {isCustomImage ? (
              <TouchableOpacity
                style={styles.btnRestore}
                onPress={handleResetBanner}
                disabled={isUploading}
                activeOpacity={0.8}
                accessibilityLabel="Restore Built-in Default"
              >
                <Trash2 size={13.5} color="#DC2626" strokeWidth={2} />
                <AppText style={[styles.btnRestoreText, { color: '#DC2626' }]}>
                  Restore Default
                </AppText>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Image Guidelines Box */}
          <View style={styles.guidelinesBox}>
            <Info size={14} color="#64748B" strokeWidth={2} style={styles.guidelinesIcon} />
            <View style={styles.guidelinesTextCol}>
              <AppText style={styles.guidelinesText}>
                Recommended size: {currentItemConfig.recommendedSize}. Supports JPG, PNG, WebP.
              </AppText>
              <AppText style={styles.guidelinesText}>
                Saved changes automatically synchronize across Player Side, Club Side, and Platform Admin.
              </AppText>
            </View>
          </View>
        </View>

        {/* ── 4. Banner Text & Link Settings (Collapsible) ── */}
        <View style={styles.textSettingsContainer}>
          <TouchableOpacity
            style={styles.textSettingsHeader}
            onPress={() => setShowTextSettings((v) => !v)}
            activeOpacity={0.7}
            accessibilityLabel="Toggle Banner Text Settings"
          >
            <View style={styles.textSettingsHeaderLeft}>
              <Sliders size={14} color="#15803D" strokeWidth={2} />
              <AppText style={styles.textSettingsHeaderTitle}>
                Banner Text & Link Settings (Optional)
              </AppText>
            </View>
            {showTextSettings ? (
              <ChevronUp size={16} color="#64748B" strokeWidth={2} />
            ) : (
              <ChevronDown size={16} color="#64748B" strokeWidth={2} />
            )}
          </TouchableOpacity>

          {showTextSettings && (
            <View style={styles.textSettingsBody}>
              <AppText style={styles.textSettingsHint}>
                Optionally customize the headline title, supporting text, and button link for{' '}
                {currentItemConfig.title.toLowerCase()}.
              </AppText>

              {/* Title */}
              <AppText style={styles.inputLabel}>Headline Title</AppText>
              <TextInput
                style={styles.textInput}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder={currentItemConfig.defaultTitle}
                placeholderTextColor="#94A3B8"
              />

              {/* Subtitle */}
              <AppText style={styles.inputLabel}>Subtitle / Supporting Text</AppText>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={formSubtitle}
                onChangeText={setFormSubtitle}
                placeholder={currentItemConfig.defaultSubtitle}
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
              />

              {/* CTA Label */}
              <AppText style={styles.inputLabel}>CTA Button Label</AppText>
              <TextInput
                style={styles.textInput}
                value={formCtaText}
                onChangeText={setFormCtaText}
                placeholder={currentItemConfig.defaultCtaText}
                placeholderTextColor="#94A3B8"
              />

              {/* CTA Destination */}
              <AppText style={styles.inputLabel}>CTA Destination Route</AppText>
              <TextInput
                style={styles.textInput}
                value={formCtaDestination}
                onChangeText={setFormCtaDestination}
                placeholder={currentItemConfig.defaultCtaDestination}
                placeholderTextColor="#94A3B8"
              />

              {/* Active Toggle */}
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <AppText style={styles.switchTitle}>Enable Banner</AppText>
                  <AppText style={styles.switchSubtitle}>
                    When enabled, this banner configuration is active.
                  </AppText>
                </View>
                <Switch
                  value={formIsActive}
                  onValueChange={setFormIsActive}
                  trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                  thumbColor={formIsActive ? '#15803D' : '#FFFFFF'}
                />
              </View>

              {/* Save Settings Button */}
              <TouchableOpacity
                style={styles.btnSave}
                onPress={handleSaveSettings}
                disabled={isSaving}
                activeOpacity={0.88}
                accessibilityLabel="Save Banner Configuration"
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Save size={14} color="#FFFFFF" strokeWidth={2.2} />
                    <AppText style={styles.btnSaveText}>Save Configuration</AppText>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </PlatformShell>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 80,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },

  // Page Heading
  headerSection: {
    paddingTop: 4,
    marginBottom: 14,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  screenSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 17,
  },

  // Status Alerts
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
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
    fontSize: 12.5,
    fontWeight: '500',
    flex: 1,
  },
  statusTextSuccess: {
    color: '#15803D',
  },
  statusTextError: {
    color: '#B91C1C',
  },

  // Info Card
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderLeftWidth: 4,
    borderLeftColor: '#15803D',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    gap: 10,
  },
  infoIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 7,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  infoTextCol: {
    flex: 1,
    minWidth: 0,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  infoDesc: {
    fontSize: 11.5,
    color: '#334155',
    lineHeight: 16,
  },

  // Category Tabs (Outer card wrapper + scrollable inner track)
  categoryTabsOuter: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  categoryTabsScroll: {
    flexGrow: 0,
  },
  categoryTabsTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  categoryTabsTrackWide: {
    flex: 1,
    width: '100%',
    justifyContent: 'space-between',
  },
  categoryTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
    gap: 7,
    minHeight: 40,
    flexShrink: 0,
  },
  categoryTabWide: {
    flex: 1,
  },
  categoryTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  categoryTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  categoryTabTextActive: {
    color: '#15803D',
    fontWeight: '700',
  },

  // Sub-Pills Scroll
  subPillsScrollWrapper: {
    marginBottom: 14,
    flexGrow: 0,
  },
  subPillsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
    paddingHorizontal: 1,
  },
  subPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minHeight: 36,
    flexShrink: 0,
  },
  subPillActive: {
    backgroundColor: '#15803D',
    borderColor: '#15803D',
    shadowColor: '#15803D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  subPillText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
  subPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Preview Card
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  previewHeaderBlock: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
    width: '100%',
  },
  previewHeaderBlockWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  previewTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    flex: 1,
    minWidth: 0,
  },
  previewTitleIcon: {
    marginTop: 2,
    flexShrink: 0,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 22,
    flexShrink: 1,
  },
  previewBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  previewBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    maxWidth: '100%',
  },
  previewBadgePillFallback: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  previewBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#15803D',
    flexShrink: 0,
  },
  previewBadgeDotFallback: {
    backgroundColor: '#64748B',
  },
  previewBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#15803D',
    letterSpacing: 0.5,
  },
  previewBadgeTextFallback: {
    color: '#64748B',
  },
  previewSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 12,
    lineHeight: 17,
  },

  // 16:9 Aspect Ratio Container
  imagePreviewWrapper: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    position: 'relative',
    marginBottom: 12,
  },
  heroImageBg: {
    width: '100%',
    height: '100%',
  },
  heroImageBgInner: {
    borderRadius: 12,
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  heroContentInner: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  heroUpperBlock: {
    maxWidth: '92%',
  },
  heroTag: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#86EFAC',
    letterSpacing: 1,
    marginBottom: 2,
  },
  heroHeading: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 21,
    marginBottom: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heroSupportingText: {
    fontSize: 11,
    color: '#E2E8F0',
    lineHeight: 14,
    opacity: 0.95,
  },
  heroBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  heroCtaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 4,
    alignSelf: 'flex-start',
  },
  heroCtaText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },

  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadingText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // Current Banner Status Info
  currentBannerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 12,
    gap: 10,
  },
  currentBannerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  currentBannerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  currentBannerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  currentBannerTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  currentBannerDesc: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
  },

  // Action Buttons
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  btnUpload: {
    flex: 1,
    minWidth: 140,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#15803D',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    gap: 6,
  },
  btnUploadText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  btnRestore: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    gap: 6,
  },
  btnRestoreText: {
    fontSize: 12.5,
    fontWeight: '700',
  },

  // Guidelines Box
  guidelinesBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 10,
    gap: 8,
  },
  guidelinesIcon: {
    marginTop: 2,
    flexShrink: 0,
  },
  guidelinesTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  guidelinesText: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
  },

  // Collapsible Text Settings
  textSettingsContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
  },
  textSettingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#F8FAFC',
    gap: 8,
    minHeight: 44,
  },
  textSettingsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  textSettingsHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 1,
  },
  textSettingsBody: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  textSettingsHint: {
    fontSize: 11.5,
    color: '#64748B',
    marginBottom: 12,
    lineHeight: 16,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0F172A',
    marginBottom: 12,
    minHeight: 40,
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginBottom: 14,
    gap: 12,
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  switchSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 15,
  },
  btnSave: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#15803D',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
    minHeight: 44,
  },
  btnSaveText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
