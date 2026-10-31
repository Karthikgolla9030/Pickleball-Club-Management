/**
 * Aught2 Pickleball — Platform Admin → Home Page Banners
 *
 * Compact, unified, and professional management interface for global home page banners:
 * 1. Owner Home Page Banner: Main hero banner displayed on the Club Owner Dashboard.
 * 2. Player Home Page Banner: Main global hero banner displayed on the Player App Home page.
 *
 * Clean, compact design aligned with the Platform Admin portal:
 * - Proper page margins matching Platform Admin settings without double padding
 * - Compact segmented-control for "Owner Home Page" vs "Player Home Page" (subtitles removed)
 * - Compact Global Platform Home Banners information card
 * - Live Preview card with responsive 16:9 aspect ratio, status badges, and actual saved banner
 * - Compact Current Banner Image row with non-overlapping status badge
 * - Consistently sized, compact action buttons (Upload Image & Restore Default)
 * - Concise Image Guidelines box
 * - Preserved and compact expandable "Banner Text & Link Settings" accordion
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Platform,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
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
import { Radius, Shadows } from '@/theme';
import type { PlatformBanner } from '@/types';
import { BUILTIN_FALLBACKS, resolveMediaUrl } from '@/utils';

type BannerKey = 'owner_home' | 'player_home';

export default function PlatformBannersScreen() {
  const router = useRouter();

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
    setTimeout(() => setStatusMessage(null), 4500);
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
            `${isOwnerTab ? 'Owner' : 'Player'} Home Page Banner uploaded successfully!`
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
      `Are you sure you want to restore the platform default banner for the ${
        isOwnerTab ? 'Club Owner Dashboard' : 'Player App Home page'
      }? Custom uploaded image will be removed.`,
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

  // ─── Actual Saved Banner Preview Calculations ──────────────────────────────
  const previewImage = currentBanner?.image_url
    ? { uri: resolveMediaUrl(currentBanner.image_url) }
    : isOwnerTab
    ? BUILTIN_FALLBACKS.ownerBanner
    : BUILTIN_FALLBACKS.tournamentGeneric;

  const previewTitle = isOwnerTab
    ? ownerTitle || currentBanner?.title || 'Aught2 Pickleball'
    : playerTitle || currentBanner?.title || 'Aught2 Pickleball';

  const previewSubtitle = isOwnerTab
    ? ownerSubtitle ||
      currentBanner?.subtitle ||
      'Great courts. Active members.\nA healthier, happier community.'
    : playerSubtitle ||
      currentBanner?.subtitle ||
      'Find open courts, discover tournaments, and join leagues near you.';

  const previewCta = isOwnerTab
    ? ownerCtaText || currentBanner?.cta_text || 'Book a Court'
    : playerCtaText || currentBanner?.cta_text || 'Find Courts';

  return (
    <PlatformShell
      activeTab="settings"
      onRefresh={refetch}
      isRefreshing={isLoading}
      scrollable
    >
      <View style={styles.container}>
        {/* ── 1. Back to Settings Link ── */}
        <TouchableOpacity
          style={styles.backButtonRow}
          onPress={() => router.push('/platform/settings' as any)}
          activeOpacity={0.7}
          accessibilityLabel="Back to Settings"
        >
          <ArrowLeft size={14} color="#0F172A" strokeWidth={2.4} />
          <AppText style={styles.backButtonText}>Back to Settings</AppText>
        </TouchableOpacity>

        {/* ── 2. Compact Page Heading ── */}
        <View style={styles.headerSection}>
          <AppText style={styles.screenTitle}>Home Banners</AppText>
          <AppText style={styles.screenSubtitle}>
            Manage global home banners for club owners and players
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

        {/* ── 3. Compact Global Platform Home Banners Information Card ── */}
        <View style={styles.infoCard}>
          <View style={styles.infoIconWrap}>
            <ImageIcon size={18} color="#15803D" strokeWidth={2.2} />
          </View>
          <View style={styles.infoTextCol}>
            <AppText style={styles.infoTitle}>Global Platform Home Banners</AppText>
            <AppText style={styles.infoDesc}>
              Platform Admin is the single source of truth for home banners across all clubs. Changes made
              here immediately apply platform-wide to the Club Owner Dashboard and Player App Home page.
            </AppText>
          </View>
        </View>

        {/* ── 4. Compact Segmented Audience Selector (Single Label Each) ── */}
        <View style={styles.audienceSelectorContainer}>
          <TouchableOpacity
            style={[
              styles.audienceSegment,
              activeTab === 'owner_home'
                ? styles.audienceSegmentActive
                : styles.audienceSegmentInactive,
            ]}
            onPress={() => setActiveTab('owner_home')}
            activeOpacity={0.8}
            accessibilityLabel="Owner Home Page"
          >
            <Users
              size={15}
              color={activeTab === 'owner_home' ? '#FFFFFF' : '#475569'}
              strokeWidth={2}
            />
            <AppText
              style={[
                styles.audienceSegmentText,
                activeTab === 'owner_home' && styles.audienceSegmentTextActive,
              ]}
              numberOfLines={1}
            >
              Owner Home Page
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.audienceSegment,
              activeTab === 'player_home'
                ? styles.audienceSegmentActive
                : styles.audienceSegmentInactive,
            ]}
            onPress={() => setActiveTab('player_home')}
            activeOpacity={0.8}
            accessibilityLabel="Player Home Page"
          >
            <Smartphone
              size={15}
              color={activeTab === 'player_home' ? '#FFFFFF' : '#475569'}
              strokeWidth={2}
            />
            <AppText
              style={[
                styles.audienceSegmentText,
                activeTab === 'player_home' && styles.audienceSegmentTextActive,
              ]}
              numberOfLines={1}
            >
              Player Home Page
            </AppText>
          </TouchableOpacity>
        </View>

        {/* ── 5. Compact Live Preview Card ── */}
        <View style={styles.previewCard}>
          {/* Card Header Row */}
          <View style={styles.previewHeaderRow}>
            <View style={styles.previewTitleRow}>
              <Eye size={16} color="#15803D" strokeWidth={2.2} />
              <AppText style={styles.previewTitle}>Live Preview</AppText>
            </View>
            <View style={styles.previewBadgePill}>
              <View style={styles.previewBadgeDot} />
              <AppText style={styles.previewBadgeText}>
                {isCustomImage ? 'ACTIVE' : 'BUILT-IN FALLBACK'}
              </AppText>
            </View>
          </View>

          {/* Audience Subtitle */}
          <AppText style={styles.previewSubtitle}>
            {isOwnerTab
              ? 'This is how the banner will appear on the Club Owner Dashboard.'
              : 'This is how the banner will appear on the Player App Home page.'}
          </AppText>

          {/* 16:9 Aspect Ratio Banner Container */}
          <View style={styles.imagePreviewWrapper}>
            <ImageBackground
              source={previewImage}
              style={styles.heroImageBg}
              imageStyle={styles.heroImageBgInner}
              resizeMode="cover"
            >
              {/* Dark Overlay */}
              <View style={styles.heroOverlay} />

              {/* Overlaid Banner Content */}
              <View style={styles.heroContentInner}>
                <View style={styles.heroUpperBlock}>
                  <AppText style={styles.heroTag}>WELCOME TO</AppText>
                  <AppText style={styles.heroHeading} numberOfLines={2}>
                    {previewTitle}
                  </AppText>
                  <AppText style={styles.heroSupportingText} numberOfLines={2}>
                    {previewSubtitle}
                  </AppText>
                </View>

                <View style={styles.heroBottomRow}>
                  <View style={styles.heroCtaPill}>
                    <AppText style={styles.heroCtaText}>{previewCta}</AppText>
                    <ArrowRight size={12} color="#0F172A" strokeWidth={2.5} />
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
                <ImagePlus size={15} color="#15803D" strokeWidth={2} />
              </View>
              <View style={styles.currentBannerTextCol}>
                <AppText style={styles.currentBannerTitle}>Current Banner Image</AppText>
                <AppText style={styles.currentBannerDesc} numberOfLines={2}>
                  {isOwnerTab
                    ? 'This image is currently being used on all club owner home pages.'
                    : 'This image is currently being used on all player home pages.'}
                </AppText>
              </View>
            </View>
            <View
              style={[
                styles.currentBannerStatusPill,
                !isCustomImage && styles.currentBannerStatusPillFallback,
              ]}
            >
              <View
                style={[
                  styles.currentBannerStatusDot,
                  !isCustomImage && styles.currentBannerStatusDotFallback,
                ]}
              />
              <AppText
                style={[
                  styles.currentBannerStatusText,
                  !isCustomImage && styles.currentBannerStatusTextFallback,
                ]}
              >
                {isCustomImage ? 'Active' : 'Built-in Fallback'}
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
              <Upload size={14} color="#FFFFFF" strokeWidth={2.2} />
              <AppText style={styles.btnUploadText}>Upload Image</AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnRestore}
              onPress={handleResetBanner}
              disabled={isUploading}
              activeOpacity={0.8}
              accessibilityLabel="Restore Default"
            >
              <RotateCcw size={13.5} color="#0F172A" strokeWidth={2} />
              <AppText style={styles.btnRestoreText}>Restore Default</AppText>
            </TouchableOpacity>
          </View>

          {/* Image Guidelines Box */}
          <View style={styles.guidelinesBox}>
            <Info size={14} color="#64748B" strokeWidth={2} style={styles.guidelinesIcon} />
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

        {/* ── 6. Compact Banner Text & Link Settings (Collapsible) ── */}
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
                {isOwnerTab ? 'club owners' : 'players'}.
              </AppText>

              {/* Title */}
              <AppText style={styles.inputLabel}>Headline Title</AppText>
              <TextInput
                style={styles.textInput}
                value={isOwnerTab ? ownerTitle : playerTitle}
                onChangeText={isOwnerTab ? setOwnerTitle : setPlayerTitle}
                placeholder="Aught2 Pickleball"
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
                    <Save size={14} color="#FFFFFF" strokeWidth={2.2} />
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
    paddingBottom: 80, // Natural clearance for bottom navigation without extra blank space
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },

  // 1. Back to Settings Navigation
  backButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },

  // 2. Compact Page Heading
  headerSection: {
    marginBottom: 12,
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

  // 3. Compact Global Platform Home Banners Info Card
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
    marginBottom: 12,
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
    color: '#475569',
    lineHeight: 16,
  },

  // 4. Compact Segmented Audience Selector
  audienceSelectorContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 3,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  audienceSegment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 6,
  },
  audienceSegmentActive: {
    backgroundColor: '#1E6F43',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  audienceSegmentInactive: {
    backgroundColor: 'transparent',
  },
  audienceSegmentText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
  audienceSegmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // 5. Compact Live Preview Card
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
      },
      default: {
        elevation: 1,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 2,
      },
    }),
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  previewTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  previewBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EAF8F0',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 10,
  },
  previewBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#15803D',
  },
  previewBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
    letterSpacing: 0.4,
  },
  previewSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginBottom: 10,
    lineHeight: 15,
  },

  // 16:9 Image Preview Box
  imagePreviewWrapper: {
    width: '100%',
    aspectRatio: 16 / 9,
    maxHeight: 240,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0F172A',
  },
  heroImageBg: {
    width: '100%',
    height: '100%',
  },
  heroImageBgInner: {
    borderRadius: 8,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  heroContentInner: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  heroUpperBlock: {
    gap: 2,
  },
  heroTag: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  heroHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 22,
    marginTop: 1,
  },
  heroSupportingText: {
    fontSize: 10.5,
    color: '#F1F5F9',
    lineHeight: 14,
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 4,
    ...Shadows.sm,
  },
  heroCtaText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  heroScriptMotto: {
    alignItems: 'flex-end',
  },
  scriptLine: {
    fontSize: 9.5,
    fontStyle: 'italic',
    color: '#FFFFFF',
    opacity: 0.9,
    lineHeight: 12,
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  uploadingText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Current Banner Information Row
  currentBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 10,
    gap: 8,
  },
  currentBannerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  currentBannerIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  currentBannerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  currentBannerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  currentBannerDesc: {
    fontSize: 10.5,
    color: '#64748B',
    lineHeight: 14,
  },
  currentBannerStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 10,
    flexShrink: 0,
  },
  currentBannerStatusPillFallback: {
    backgroundColor: '#F1F5F9',
  },
  currentBannerStatusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#15803D',
  },
  currentBannerStatusDotFallback: {
    backgroundColor: '#64748B',
  },
  currentBannerStatusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#15803D',
  },
  currentBannerStatusTextFallback: {
    color: '#475569',
  },

  // Action Buttons
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  btnUpload: {
    flex: 1,
    height: 38,
    backgroundColor: '#1E6F43',
    borderRadius: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  btnUploadText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  btnRestore: {
    flex: 1,
    height: 38,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  btnRestoreText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F172A',
  },

  // Image Guidelines
  guidelinesBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 8,
    marginTop: 10,
  },
  guidelinesIcon: {
    marginTop: 1,
    flexShrink: 0,
  },
  guidelinesTextCol: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  guidelinesText: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 14.5,
  },

  // 6. Compact Collapsible Text Settings
  textSettingsContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 16,
  },
  textSettingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  textSettingsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  textSettingsHeaderTitle: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
  },
  textSettingsBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  textSettingsHint: {
    fontSize: 11.5,
    color: '#64748B',
    marginVertical: 8,
    lineHeight: 15,
  },
  inputLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 3,
    marginTop: 8,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12.5,
    color: '#0F172A',
  },
  textArea: {
    minHeight: 56,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  switchTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  switchSubtitle: {
    fontSize: 10.5,
    color: '#64748B',
  },
  btnSave: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E6F43',
    borderRadius: 6,
    paddingVertical: 8,
    marginTop: 10,
    gap: 6,
  },
  btnSaveText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
