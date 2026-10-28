/**
 * Aught2 Pickleball — Platform Content Management → Home Page Banners
 *
 * Dedicated Platform Admin interface for configuring the two global home page banners:
 * 1. Owner Home Page Banner: Main hero banner displayed on the Club Owner Home Dashboard.
 * 2. Player Home Page Banner: Main global hero banner displayed on the Player App Home page.
 *
 * Persists directly to the backend database and media uploads storage.
 * Changes immediately propagate to owner dashboards and player home screens upon refresh.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronRight,
  Eye,
  ImagePlus,
  Info,
  Layers,
  RotateCcw,
  Save,
  Shield,
  Smartphone,
  Sparkles,
  Users,
} from 'lucide-react-native';

import { AppText, Badge, Card, PlatformShell } from '@/components';
import { usePlatformBanners, usePlatformBannerMutations } from '@/hooks';
import { platformBannersApi } from '@/services/api';
import { Radius, Shadows, Spacing } from '@/theme';
import type { PlatformBanner } from '@/types';
import { BUILTIN_FALLBACKS, resolveMediaUrl } from '@/utils';

type BannerKey = 'owner_home' | 'player_home';

export default function PlatformBannersScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = windowWidth >= 800;

  const { banners, isLoading, refetch, isError, error } = usePlatformBanners();
  const { updateBanner, uploadBannerImage, resetBanner } = usePlatformBannerMutations();

  const [activeTab, setActiveTab] = useState<BannerKey>('owner_home');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
      `Reset ${isOwnerTab ? 'Owner' : 'Player'} Banner`,
      `Are you sure you want to restore the platform's default built-in court hero for the ${
        isOwnerTab ? 'Club Owner Home Dashboard' : 'Player App Home page'
      }? Custom uploaded image will be cleared.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset to Default',
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

  // Preview data calculation
  const previewImage = currentBanner?.image_url
    ? { uri: resolveMediaUrl(currentBanner.image_url) }
    : isOwnerTab
    ? BUILTIN_FALLBACKS.ownerBanner
    : BUILTIN_FALLBACKS.tournamentGeneric;

  const previewTitle = isOwnerTab
    ? ownerTitle || 'Play Together\nGrow Stronger'
    : playerTitle || 'Welcome to Aught2 Pickleball';

  const previewSubtitle = isOwnerTab
    ? ownerSubtitle || 'Great courts. Active members.\nA healthier, happier community.'
    : playerSubtitle || 'Find open courts, discover tournaments, and join leagues near you.';

  const previewCta = isOwnerTab
    ? ownerCtaText || 'Book a Court'
    : playerCtaText || 'Find Courts';

  const isCustomImage = Boolean(currentBanner?.image_url);

  return (
    <PlatformShell
      activeTab="banners"
      title="Home Page Banners"
      subtitle="Platform Content Management → Home Page Banners"
      onRefresh={refetch}
      isRefreshing={isLoading}
      scrollable
    >
      <View style={styles.container}>
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

        {/* ── Section Description Card ── */}
        <Card style={styles.introCard}>
          <View style={styles.introIconWrap}>
            <ImagePlus size={22} color="#166534" />
          </View>
          <View style={styles.introTextCol}>
            <AppText style={styles.introTitle}>Global Platform Home Banners</AppText>
            <AppText style={styles.introSubtitle}>
              Platform Admin is the single source of truth for home banners across all clubs. Changes made
              here immediately apply platform-wide to the Club Owner Dashboard and Player App Home page.
            </AppText>
          </View>
        </Card>

        {/* ── Segmented Tab Selector ── */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'owner_home' && styles.tabButtonActive]}
            onPress={() => setActiveTab('owner_home')}
            activeOpacity={0.8}
          >
            <Users size={16} color={activeTab === 'owner_home' ? '#176B57' : '#64748B'} />
            <AppText
              style={[styles.tabButtonText, activeTab === 'owner_home' && styles.tabButtonTextActive]}
            >
              Owner Home Page Banner
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'player_home' && styles.tabButtonActive]}
            onPress={() => setActiveTab('player_home')}
            activeOpacity={0.8}
          >
            <Smartphone size={16} color={activeTab === 'player_home' ? '#176B57' : '#64748B'} />
            <AppText
              style={[styles.tabButtonText, activeTab === 'player_home' && styles.tabButtonTextActive]}
            >
              Player Home Page Banner
            </AppText>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#176B57" />
            <AppText style={styles.loadingText}>Loading banner configuration...</AppText>
          </View>
        ) : (
          <View style={[styles.mainLayout, isDesktop && styles.mainLayoutDesktop]}>
            {/* ── LEFT / TOP COLUMN: LIVE PREVIEW CARD ── */}
            <View style={styles.previewCol}>
              <View style={styles.previewHeaderRow}>
                <View style={styles.previewTitleRow}>
                  <Eye size={16} color="#176B57" />
                  <AppText style={styles.sectionHeaderTitle}>Live Mobile Card Preview</AppText>
                </View>
                <Badge
                  label={isCustomImage ? 'Custom Platform Banner' : 'Built-in Fallback'}
                  variant={isCustomImage ? 'success' : 'default'}
                />
              </View>

              <View style={styles.previewWrapper}>
                <ImageBackground
                  source={previewImage}
                  style={styles.heroCardPreview}
                  imageStyle={styles.heroCardImage}
                  resizeMode="cover"
                >
                  <View style={styles.heroOverlay} />

                  <View style={styles.heroInner}>
                    <View style={styles.heroUpperBlock}>
                      <AppText style={styles.heroTagText}>
                        {isOwnerTab ? 'WELCOME TO' : 'DISCOVER PICKLEBALL'}
                      </AppText>
                      <AppText style={styles.heroHeading} numberOfLines={2}>
                        {previewTitle}
                      </AppText>
                      <AppText style={styles.heroSupportingText} numberOfLines={3}>
                        {previewSubtitle}
                      </AppText>
                    </View>

                    <View style={styles.heroSpacer} />

                    <View style={styles.heroBottomRow}>
                      <View style={styles.heroCtaButton}>
                        <AppText style={styles.heroCtaText} numberOfLines={1}>
                          {previewCta}
                        </AppText>
                        <ArrowRight size={13} color="#102F2B" strokeWidth={2.4} />
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

                {isUploading && (
                  <View style={styles.uploadOverlay}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <AppText style={styles.uploadOverlayText}>Uploading banner image...</AppText>
                  </View>
                )}
              </View>

              {/* Image Actions */}
              <View style={styles.imageActionsRow}>
                <TouchableOpacity
                  style={styles.btnUpload}
                  onPress={handlePickAndUploadImage}
                  disabled={isUploading}
                  activeOpacity={0.85}
                >
                  <Camera size={15} color="#FFFFFF" />
                  <AppText style={styles.btnUploadText}>
                    {isCustomImage ? 'Replace Banner Image' : 'Upload Custom Image'}
                  </AppText>
                </TouchableOpacity>

                {isCustomImage && (
                  <TouchableOpacity
                    style={styles.btnReset}
                    onPress={handleResetBanner}
                    disabled={isUploading}
                    activeOpacity={0.8}
                  >
                    <RotateCcw size={14} color="#DC2626" />
                    <AppText style={styles.btnResetText}>Reset to Default</AppText>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* ── RIGHT / BOTTOM COLUMN: EDIT FORM ── */}
            <View style={styles.formCol}>
              <Card style={styles.formCard}>
                <AppText style={styles.formCardTitle}>
                  {isOwnerTab ? 'Owner Dashboard Banner Content' : 'Player Home Banner Content'}
                </AppText>
                <AppText style={styles.formCardSubtitle}>
                  Configure the headline text, promotional description, and call-to-action button.
                </AppText>

                {/* Title */}
                <AppText style={styles.inputLabel}>Headline Title</AppText>
                <TextInput
                  style={styles.textInput}
                  value={isOwnerTab ? ownerTitle : playerTitle}
                  onChangeText={isOwnerTab ? setOwnerTitle : setPlayerTitle}
                  placeholder={
                    isOwnerTab
                      ? 'e.g. Welcome to Pickleball Club'
                      : 'e.g. Play Together, Grow Stronger'
                  }
                  placeholderTextColor="#94A3B8"
                />

                {/* Subtitle */}
                <AppText style={styles.inputLabel}>Subtitle / Supporting Text</AppText>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={isOwnerTab ? ownerSubtitle : playerSubtitle}
                  onChangeText={isOwnerTab ? setOwnerSubtitle : setPlayerSubtitle}
                  placeholder="e.g. Great courts. Active members. A healthier, happier community."
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
                  placeholder={isOwnerTab ? 'e.g. Book a Court' : 'e.g. Discover Tournaments'}
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

                {/* Active Switch */}
                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <AppText style={styles.switchTitle}>Enable Banner</AppText>
                    <AppText style={styles.switchSubtitle}>
                      When active, this banner is displayed to {isOwnerTab ? 'club owners' : 'players'}.
                    </AppText>
                  </View>
                  <Switch
                    value={isOwnerTab ? ownerIsActive : playerIsActive}
                    onValueChange={isOwnerTab ? setOwnerIsActive : setPlayerIsActive}
                    trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                    thumbColor={(isOwnerTab ? ownerIsActive : playerIsActive) ? '#166534' : '#FFFFFF'}
                  />
                </View>

                {/* Save Button */}
                <TouchableOpacity
                  style={styles.btnSave}
                  onPress={handleSaveSettings}
                  disabled={isSaving}
                  activeOpacity={0.88}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Save size={16} color="#FFFFFF" />
                      <AppText style={styles.btnSaveText}>Save Banner Configuration</AppText>
                    </>
                  )}
                </TouchableOpacity>
              </Card>
            </View>
          </View>
        )}
      </View>
    </PlatformShell>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing[4],
    paddingBottom: Spacing[12],
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
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
  introCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
    padding: Spacing[4],
    marginBottom: Spacing[4],
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 4,
    borderLeftColor: '#166534',
  },
  introIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: '#E5F6EC',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  introTextCol: {
    flex: 1,
  },
  introTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  introSubtitle: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: Radius.lg,
    padding: 4,
    marginBottom: Spacing[4],
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[2.5],
    borderRadius: Radius.md,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    ...Shadows.sm,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabButtonTextActive: {
    color: '#176B57',
  },
  loadingBox: {
    padding: Spacing[8],
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[3],
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
  },
  mainLayout: {
    flexDirection: 'column',
    gap: Spacing[4],
  },
  mainLayoutDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  previewCol: {
    flex: 1,
  },
  formCol: {
    flex: 1,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[2.5],
  },
  previewTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  sectionHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  previewWrapper: {
    position: 'relative',
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.md,
  },
  heroCardPreview: {
    width: '100%',
    minHeight: 220,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  heroCardImage: {
    borderRadius: Radius.xl,
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10, 40, 32, 0.58)',
  },
  heroInner: {
    flex: 1,
    padding: Spacing[4],
    justifyContent: 'space-between',
  },
  heroUpperBlock: {
    gap: Spacing[1],
  },
  heroTagText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  heroHeading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 26,
  },
  heroSupportingText: {
    fontSize: 12,
    color: '#E2E8F0',
    lineHeight: 16,
    marginTop: 2,
  },
  heroSpacer: {
    height: 16,
  },
  heroBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  heroCtaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    gap: 6,
    ...Shadows.sm,
  },
  heroCtaText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#102F2B',
  },
  heroScriptMotto: {
    alignItems: 'flex-end',
  },
  scriptLine: {
    fontSize: 10,
    fontStyle: 'italic',
    color: '#E2E8F0',
    lineHeight: 13,
  },
  uploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  uploadOverlayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  imageActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginTop: Spacing[3],
  },
  btnUpload: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#176B57',
    borderRadius: Radius.md,
    paddingVertical: Spacing[2.5],
    gap: Spacing[2],
  },
  btnUploadText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  btnReset: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2.5],
    gap: Spacing[1.5],
  },
  btnResetText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DC2626',
  },
  formCard: {
    padding: Spacing[4],
  },
  formCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  formCardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: Spacing[3.5],
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
    marginTop: Spacing[2.5],
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
  textArea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing[2],
    marginTop: Spacing[3],
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
    backgroundColor: '#176B57',
    borderRadius: Radius.md,
    paddingVertical: Spacing[3],
    marginTop: Spacing[4],
    gap: Spacing[2],
  },
  btnSaveText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
