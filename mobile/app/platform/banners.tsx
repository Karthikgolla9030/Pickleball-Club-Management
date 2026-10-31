/**
 * Aught2 Pickleball — Platform Admin → Home Page Banners
 *
 * Dedicated Platform Admin interface for managing global home page banners:
 * 1. Owner Home Page Banner: Main hero banner displayed on the Club Owner Dashboard.
 * 2. Player Home Page Banner: Main global hero banner displayed on the Player App Home page.
 *
 * Exact visual match to the reference design:
 * - Back to Settings navigation link
 * - "Home Banners" page heading & subtitle
 * - Global Platform Home Banners information card with green left-accent
 * - Audience selector cards: "Owner Home Page" vs "Player Home Page"
 * - Live Preview Card with 16:9 aspect ratio, dark overlay, dynamic text,
 *   BUILT-IN FALLBACK / ACTIVE status badge, Current Banner Image row,
 *   "Upload Image" and "Restore Default" action buttons, and image guidelines strip.
 * - Collapsible "Banner Text & CTA Configuration" accordion preserving all backend fields.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
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
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  Image as ImageIcon,
  ImagePlus,
  Info,
  RotateCcw,
  Save,
  Sliders,
  Smartphone,
  Upload,
  Users,
} from 'lucide-react-native';

import { AppText, PlatformShell } from '@/components';
import { usePlatformBanners, usePlatformBannerMutations } from '@/hooks';
import { Radius, Shadows, Spacing } from '@/theme';
import type { PlatformBanner } from '@/types';
import { BUILTIN_FALLBACKS, resolveMediaUrl } from '@/utils';

type BannerKey = 'owner_home' | 'player_home';

export default function PlatformBannersScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();

  const { banners, isLoading, refetch } = usePlatformBanners();
  const { updateBanner, uploadBannerImage, resetBanner } = usePlatformBannerMutations();

  const [activeTab, setActiveTab] = useState<BannerKey>('owner_home');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showTextSettings, setShowTextSettings] = useState(false);

  // Form states per banner
  const [ownerTitle, setOwnerTitle] = useState('');
  const [ownerSubtitle, setOwnerSubtitle] = useState('');
  const [ownerCtaText, setOwnerCtaText] = useState('');
  const [ownerCtaDestination, setOwnerCtaDestination] = useState('');
  const [ownerIsActive, setOwnerIsActive] = useState(true);

  const [playerTitle, setPlayerTitle] = useState('');
  const [playerSubtitle, setPlayerSubtitle] = useState('');
  const [playerCtaText, setPlayerCtaText] = useState('');
  const [playerCtaDestination, setPlayerCtaDestination] = useState('');
  const [playerIsActive, setPlayerIsActive] = useState(true);

  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Synchronize form states when backend data arrives
  useEffect(() => {
    if (banners.owner_home) {
      setOwnerTitle(banners.owner_home.title || '');
      setOwnerSubtitle(banners.owner_home.subtitle || '');
      setOwnerCtaText(banners.owner_home.cta_text || '');
      setOwnerCtaDestination(banners.owner_home.cta_destination || '');
      setOwnerIsActive(banners.owner_home.is_active ?? true);
    }
    if (banners.player_home) {
      setPlayerTitle(banners.player_home.title || '');
      setPlayerSubtitle(banners.player_home.subtitle || '');
      setPlayerCtaText(banners.player_home.cta_text || '');
      setPlayerCtaDestination(banners.player_home.cta_destination || '');
      setPlayerIsActive(banners.player_home.is_active ?? true);
    }
  }, [banners]);

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 5000);
  };

  const currentBanner: PlatformBanner | undefined = banners[activeTab];
  const isOwnerTab = activeTab === 'owner_home';
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
        aspect: [16, 9],
        quality: 0.88,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const mime = asset.mimeType || (asset.uri?.endsWith('.png') ? 'image/png' : 'image/jpeg');
        const ext = mime.includes('png') ? 'png' : 'jpg';
        const fileName = `${activeTab}_banner_${Date.now()}.${ext}`;

        setIsUploading(true);
        try {
          await uploadBannerImage.mutateAsync({
            type: activeTab,
            fileInput: {
              uri: asset.uri,
              name: fileName,
              type: mime,
            },
          });
          await refetch();
          showStatus(
            'success',
            `${isOwnerTab ? 'Owner' : 'Player'} Home Page Banner image uploaded and updated successfully!`
          );
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
      const payload = isOwnerTab
        ? {
            title: ownerTitle.trim() || null,
            subtitle: ownerSubtitle.trim() || null,
            cta_text: ownerCtaText.trim() || null,
            cta_destination: ownerCtaDestination.trim() || null,
            is_active: ownerIsActive,
          }
        : {
            title: playerTitle.trim() || null,
            subtitle: playerSubtitle.trim() || null,
            cta_text: playerCtaText.trim() || null,
            cta_destination: playerCtaDestination.trim() || null,
            is_active: playerIsActive,
          };

      await updateBanner.mutateAsync({
        type: activeTab,
        payload,
      });
      await refetch();
      showStatus(
        'success',
        `${isOwnerTab ? 'Owner' : 'Player'} Home Page Banner configuration saved successfully!`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save banner settings.';
      showStatus('error', msg);
      Alert.alert('Save Error', msg);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Reset to Built-in Fallback ────────────────────────────────────────────
  const handleResetBanner = () => {
    Alert.alert(
      `Restore Default ${isOwnerTab ? 'Owner' : 'Player'} Banner`,
      `Are you sure you want to restore the platform's default built-in court hero for the ${
        isOwnerTab ? 'Club Owner Home Dashboard' : 'Player App Home page'
      }? Custom uploaded image will be cleared.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore Default',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetBanner.mutateAsync(activeTab);
              await refetch();
              showStatus(
                'success',
                `${isOwnerTab ? 'Owner' : 'Player'} Home Page Banner restored to platform default.`
              );
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Reset failed';
              showStatus('error', msg);
            }
          },
        },
      ]
    );
  };

  // ─── Live Preview Calculations ─────────────────────────────────────────────
  const previewImage = currentBanner?.image_url
    ? { uri: resolveMediaUrl(currentBanner.image_url) }
    : isOwnerTab
    ? BUILTIN_FALLBACKS.ownerBanner
    : BUILTIN_FALLBACKS.tournamentGeneric;

  const previewTitle = isOwnerTab
    ? ownerTitle || 'Aught2 Pickleball'
    : playerTitle || 'Aught2 Pickleball';

  const previewSubtitle = isOwnerTab
    ? ownerSubtitle || 'Great courts. Active members.\nA healthier, happier community.'
    : playerSubtitle || 'Find open courts, discover tournaments, and join leagues near you.';

  const previewCta = isOwnerTab
    ? ownerCtaText || 'Book a Court'
    : playerCtaText || 'Find Courts';

  return (
    <PlatformShell
      activeTab="settings"
      onRefresh={refetch}
      isRefreshing={isLoading}
      scrollable
    >
      <View style={styles.container}>
        {/* ── 1. Back to Settings Navigation ── */}
        <TouchableOpacity
          style={styles.backButtonRow}
          onPress={() => router.push('/platform/settings' as any)}
          activeOpacity={0.7}
          accessibilityLabel="Back to Settings"
        >
          <ArrowLeft size={16} color="#0F172A" strokeWidth={2.4} />
          <AppText style={styles.backButtonText}>Back to Settings</AppText>
        </TouchableOpacity>

        {/* ── 2. Page Header ── */}
        <View style={styles.headerSection}>
          <AppText style={styles.screenTitle}>Home Banners</AppText>
          <AppText style={styles.screenSubtitle}>
            Manage global home banners for club owners and players
          </AppText>
        </View>

        {/* ── 3. Status Alert (if active) ── */}
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
              <AlertCircle size={16} color="#B91C1C" />
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

        {/* ── 4. Global Platform Home Banners Information Card ── */}
        <View style={styles.infoCard}>
          <View style={styles.infoCardAccent} />
          <View style={styles.infoCardBody}>
            <View style={styles.infoIconWrap}>
              <ImageIcon size={22} color="#15803D" strokeWidth={2} />
            </View>
            <View style={styles.infoTextCol}>
              <AppText style={styles.infoTitle}>Global Platform Home Banners</AppText>
              <AppText style={styles.infoDesc}>
                Platform Admin is the single source of truth for home banners across all clubs. Changes
                made here immediately apply platform-wide to the Club Owner Dashboard and Player App Home
                page.
              </AppText>
            </View>
          </View>
        </View>

        {/* ── 5. Banner Audience Selector ── */}
        <View style={styles.audienceSelectorRow}>
          {/* Owner Home Page Tab */}
          <TouchableOpacity
            style={[
              styles.audienceCard,
              activeTab === 'owner_home' ? styles.audienceCardActive : styles.audienceCardInactive,
            ]}
            onPress={() => setActiveTab('owner_home')}
            activeOpacity={0.8}
            accessibilityLabel="Owner Home Page"
          >
            <Users
              size={20}
              color={activeTab === 'owner_home' ? '#FFFFFF' : '#64748B'}
              strokeWidth={2}
            />
            <View style={styles.audienceTextCol}>
              <AppText
                style={[
                  styles.audienceTitle,
                  activeTab === 'owner_home' ? styles.audienceTitleActive : styles.audienceTitleInactive,
                ]}
              >
                Owner Home Page
              </AppText>
              <AppText
                style={[
                  styles.audienceSubtitle,
                  activeTab === 'owner_home' ? styles.audienceSubtitleActive : styles.audienceSubtitleInactive,
                ]}
              >
                Club Owner Dashboard
              </AppText>
            </View>
          </TouchableOpacity>

          {/* Player Home Page Tab */}
          <TouchableOpacity
            style={[
              styles.audienceCard,
              activeTab === 'player_home' ? styles.audienceCardActive : styles.audienceCardInactive,
            ]}
            onPress={() => setActiveTab('player_home')}
            activeOpacity={0.8}
            accessibilityLabel="Player Home Page"
          >
            <Smartphone
              size={20}
              color={activeTab === 'player_home' ? '#FFFFFF' : '#64748B'}
              strokeWidth={2}
            />
            <View style={styles.audienceTextCol}>
              <AppText
                style={[
                  styles.audienceTitle,
                  activeTab === 'player_home' ? styles.audienceTitleActive : styles.audienceTitleInactive,
                ]}
              >
                Player Home Page
              </AppText>
              <AppText
                style={[
                  styles.audienceSubtitle,
                  activeTab === 'player_home' ? styles.audienceSubtitleActive : styles.audienceSubtitleInactive,
                ]}
              >
                Player App Home
              </AppText>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── 6. Live Preview Card ── */}
        <View style={styles.previewCard}>
          {/* Card Header Row */}
          <View style={styles.previewHeaderRow}>
            <View style={styles.previewTitleRow}>
              <Eye size={18} color="#15803D" strokeWidth={2.2} />
              <AppText style={styles.previewTitle}>Live Preview</AppText>
            </View>
            <View style={styles.previewBadgePill}>
              <View style={styles.previewBadgeDot} />
              <AppText style={styles.previewBadgeText}>
                {isCustomImage ? 'ACTIVE' : 'BUILT-IN FALLBACK'}
              </AppText>
            </View>
          </View>

          {/* Explanatory Subtitle */}
          <AppText style={styles.previewSubtitle}>
            {isOwnerTab
              ? 'This is how the banner will appear on the Club Owner Dashboard.'
              : 'This is how the banner will appear on the Player App Home page.'}
          </AppText>

          {/* 16:9 Image Preview Box */}
          <View style={styles.imagePreviewWrapper}>
            <ImageBackground
              source={previewImage}
              style={styles.heroImageBg}
              imageStyle={styles.heroImageBgInner}
              resizeMode="cover"
            >
              {/* Dark Translucent Overlay */}
              <View style={styles.heroOverlay} />

              {/* Overlaid Banner Content */}
              <View style={styles.heroContentInner}>
                <View style={styles.heroUpperBlock}>
                  <AppText style={styles.heroTag}>WELCOME TO</AppText>
                  <AppText style={styles.heroHeading} numberOfLines={2}>
                    {previewTitle}
                  </AppText>
                  <AppText style={styles.heroSupportingText} numberOfLines={3}>
                    {previewSubtitle}
                  </AppText>
                </View>

                <View style={styles.heroBottomRow}>
                  <View style={styles.heroCtaPill}>
                    <AppText style={styles.heroCtaText}>{previewCta}</AppText>
                    <ArrowRight size={13} color="#0F172A" strokeWidth={2.5} />
                  </View>

                  {isOwnerTab && (
                    <View style={styles.heroScriptMotto}>
                      <AppText style={styles.scriptLine}>Play</AppText>
                      <AppText style={styles.scriptLine}>Grow</AppText>
                      <AppText style={styles.scriptLine}>Together</AppText>
                    </View>
                  )}
                </View>
              </View>
            </ImageBackground>

            {/* Upload Spinner Overlay */}
            {isUploading && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <AppText style={styles.uploadingText}>Uploading banner image...</AppText>
              </View>
            )}
          </View>

          {/* Current Banner Information Row */}
          <View style={styles.currentBannerRow}>
            <View style={styles.currentBannerLeft}>
              <View style={styles.currentBannerIconWrap}>
                <ImagePlus size={18} color="#15803D" strokeWidth={2} />
              </View>
              <View style={styles.currentBannerTextCol}>
                <AppText style={styles.currentBannerTitle}>Current Banner Image</AppText>
                <AppText style={styles.currentBannerDesc}>
                  {isOwnerTab
                    ? 'This image is currently being used on all club owner home pages.'
                    : 'This image is currently being used on all player home pages.'}
                </AppText>
              </View>
            </View>
            <View style={styles.currentBannerStatusPill}>
              <View style={styles.currentBannerStatusDot} />
              <AppText style={styles.currentBannerStatusText}>
                {isCustomImage ? 'Active' : 'Active'}
              </AppText>
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
              <Upload size={16} color="#FFFFFF" strokeWidth={2.2} />
              <AppText style={styles.btnUploadText}>Upload Image</AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnRestore}
              onPress={handleResetBanner}
              disabled={isUploading}
              activeOpacity={0.8}
              accessibilityLabel="Restore Default"
            >
              <RotateCcw size={15} color="#0F172A" strokeWidth={2} />
              <AppText style={styles.btnRestoreText}>Restore Default</AppText>
            </TouchableOpacity>
          </View>

          {/* Image Guidelines Strip */}
          <View style={styles.guidelinesBox}>
            <Info size={16} color="#64748B" strokeWidth={2} style={styles.guidelinesIcon} />
            <View style={styles.guidelinesTextCol}>
              <AppText style={styles.guidelinesText}>
                Recommended size: 1600 × 900 (16:9). Supports JPG, PNG, WebP.
              </AppText>
              <AppText style={styles.guidelinesText}>
                {isOwnerTab
                  ? 'Changes will apply to all club owner dashboards immediately.'
                  : 'Changes will apply to all player app home pages immediately.'}
              </AppText>
            </View>
          </View>
        </View>

        {/* ── 7. Collapsible Banner Text & Link Settings ── */}
        <View style={styles.textSettingsContainer}>
          <TouchableOpacity
            style={styles.textSettingsHeader}
            onPress={() => setShowTextSettings((v) => !v)}
            activeOpacity={0.7}
            accessibilityLabel="Toggle Banner Text Settings"
          >
            <View style={styles.textSettingsHeaderLeft}>
              <Sliders size={16} color="#15803D" strokeWidth={2} />
              <AppText style={styles.textSettingsHeaderTitle}>
                Banner Text & Link Settings (Optional)
              </AppText>
            </View>
            {showTextSettings ? (
              <ChevronUp size={18} color="#64748B" strokeWidth={2} />
            ) : (
              <ChevronDown size={18} color="#64748B" strokeWidth={2} />
            )}
          </TouchableOpacity>

          {showTextSettings && (
            <View style={styles.textSettingsBody}>
              <AppText style={styles.textSettingsHint}>
                Optionally customize the overlaid title, promotional text, and CTA destination for{' '}
                {isOwnerTab ? 'club owners' : 'players'}.
              </AppText>

              {/* Title */}
              <AppText style={styles.inputLabel}>Headline Title</AppText>
              <TextInput
                style={styles.textInput}
                value={isOwnerTab ? ownerTitle : playerTitle}
                onChangeText={isOwnerTab ? setOwnerTitle : setPlayerTitle}
                placeholder={isOwnerTab ? 'Aught2 Pickleball' : 'Aught2 Pickleball'}
                placeholderTextColor="#94A3B8"
              />

              {/* Subtitle */}
              <AppText style={styles.inputLabel}>Subtitle / Supporting Text</AppText>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={isOwnerTab ? ownerSubtitle : playerSubtitle}
                onChangeText={isOwnerTab ? setOwnerSubtitle : setPlayerSubtitle}
                placeholder="Great courts. Active members. A healthier, happier community."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
              />

              {/* CTA Label */}
              <AppText style={styles.inputLabel}>CTA Button Label</AppText>
              <TextInput
                style={styles.textInput}
                value={isOwnerTab ? ownerCtaText : playerCtaText}
                onChangeText={isOwnerTab ? setOwnerCtaText : setPlayerCtaText}
                placeholder={isOwnerTab ? 'Book a Court' : 'Find Courts'}
                placeholderTextColor="#94A3B8"
              />

              {/* CTA Destination */}
              <AppText style={styles.inputLabel}>CTA Destination Route</AppText>
              <TextInput
                style={styles.textInput}
                value={isOwnerTab ? ownerCtaDestination : playerCtaDestination}
                onChangeText={isOwnerTab ? setOwnerCtaDestination : setPlayerCtaDestination}
                placeholder={isOwnerTab ? '/(club)/bookings' : '/(player)/tournaments'}
                placeholderTextColor="#94A3B8"
              />

              {/* Active Toggle */}
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <AppText style={styles.switchTitle}>Enable Banner</AppText>
                  <AppText style={styles.switchSubtitle}>
                    When enabled, this banner is displayed to {isOwnerTab ? 'club owners' : 'players'}.
                  </AppText>
                </View>
                <Switch
                  value={isOwnerTab ? ownerIsActive : playerIsActive}
                  onValueChange={isOwnerTab ? setOwnerIsActive : setPlayerIsActive}
                  trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                  thumbColor={(isOwnerTab ? ownerIsActive : playerIsActive) ? '#15803D' : '#FFFFFF'}
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
                    <Save size={16} color="#FFFFFF" strokeWidth={2.2} />
                    <AppText style={styles.btnSaveText}>Save Banner Configuration</AppText>
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 96,
    maxWidth: 820,
    width: '100%',
    alignSelf: 'center',
  },

  // 1. Back to Settings link
  backButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },

  // 2. Page Header
  headerSection: {
    marginBottom: 16,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  screenSubtitle: {
    fontSize: 13.5,
    color: '#64748B',
    lineHeight: 19,
  },

  // Status Alerts
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
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

  // 3. Global Platform Home Banners Info Card
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 14,
  },
  infoCardAccent: {
    width: 4,
    backgroundColor: '#15803D',
  },
  infoCardBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 12,
  },
  infoIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  infoTextCol: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 3,
  },
  infoDesc: {
    fontSize: 12.5,
    color: '#475569',
    lineHeight: 18,
  },

  // 4. Banner Audience Selector
  audienceSelectorRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  audienceCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 10,
  },
  audienceCardActive: {
    backgroundColor: '#1E6F43',
    borderWidth: 1,
    borderColor: '#1E6F43',
    ...Shadows.sm,
  },
  audienceCardInactive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  audienceTextCol: {
    flex: 1,
  },
  audienceTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  audienceTitleActive: {
    color: '#FFFFFF',
  },
  audienceTitleInactive: {
    color: '#0F172A',
  },
  audienceSubtitle: {
    fontSize: 11.5,
    marginTop: 1,
  },
  audienceSubtitleActive: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  audienceSubtitleInactive: {
    color: '#64748B',
  },

  // 5. Live Preview Card
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    ...Shadows.sm,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  previewTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  previewBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EAF8F0',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 12,
  },
  previewBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#15803D',
  },
  previewBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#15803D',
    letterSpacing: 0.6,
  },
  previewSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginBottom: 12,
  },

  // 16:9 Image Preview Box
  imagePreviewWrapper: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1E293B',
  },
  heroImageBg: {
    width: '100%',
    height: '100%',
  },
  heroImageBgInner: {
    borderRadius: 12,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  heroContentInner: {
    flex: 1,
    padding: 14,
    justifyContent: 'space-between',
  },
  heroUpperBlock: {
    gap: 3,
  },
  heroTag: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  heroHeading: {
    fontSize: 21,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 25,
    marginTop: 1,
  },
  heroSupportingText: {
    fontSize: 11.5,
    color: '#F1F5F9',
    lineHeight: 15,
    marginTop: 2,
    maxWidth: '85%',
  },
  heroBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  heroCtaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 5,
    ...Shadows.sm,
  },
  heroCtaText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  heroScriptMotto: {
    alignItems: 'flex-end',
  },
  scriptLine: {
    fontSize: 10,
    fontStyle: 'italic',
    color: '#FFFFFF',
    opacity: 0.9,
    lineHeight: 13,
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  uploadingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Current Banner Row
  currentBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  currentBannerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  currentBannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentBannerTextCol: {
    flex: 1,
  },
  currentBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  currentBannerDesc: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  currentBannerStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 12,
  },
  currentBannerStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#15803D',
  },
  currentBannerStatusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#15803D',
  },

  // Action Buttons
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  btnUpload: {
    flex: 1,
    height: 42,
    backgroundColor: '#1E6F43',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnUploadText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  btnRestore: {
    flex: 1,
    height: 42,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnRestoreText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
  },

  // Image Guidelines
  guidelinesBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 10,
    marginTop: 14,
  },
  guidelinesIcon: {
    marginTop: 1,
  },
  guidelinesTextCol: {
    flex: 1,
    gap: 2,
  },
  guidelinesText: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
  },

  // 6. Optional Collapsible Text Settings
  textSettingsContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 2,
  },
  textSettingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  textSettingsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textSettingsHeaderTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  textSettingsBody: {
    paddingHorizontal: 14,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  textSettingsHint: {
    fontSize: 12,
    color: '#64748B',
    marginVertical: 10,
    lineHeight: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
    marginTop: 10,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
  },
  textArea: {
    minHeight: 65,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  switchSubtitle: {
    fontSize: 11,
    color: '#64748B',
  },
  btnSave: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E6F43',
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 14,
    gap: 8,
  },
  btnSaveText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
