/**
 * Aught2 Pickleball — Club Details Management Screen
 *
 * Dedicated screen for Club Owner to manage complete club profile:
 * - Club Information: Name, Logo upload, Tagline/Short Description, Full Description, Contact Email, Phone, Website, Established Year
 * - Location Information: Street Address 1 & 2, City, State, Postal Code, Country
 * - Operating Information: Operating Days, Opening & Closing Hours, Club Timezone, Facilities Summary, Holiday Closures
 * - Player Preview tab: Live view of how players see the club
 * - Strict Owner-only editing permission; read-only preview for managers
 * - Tenant isolated to current club
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  Globe,
  Info,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  RefreshCw,
  Save,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  Screen,
  SegmentedTabs,
  ClubBrandingSection,
} from '@/components';
import { API_ENDPOINTS } from '@/constants';
import { useActiveClub, useClubDetails } from '@/hooks';
import { clubAssetsApi } from '@/services/api';
import { Colors, Radius, Shadows, Spacing } from '@/theme';
import type { UpdateClubPayload } from '@/types';
import { resolveMediaUrl } from '@/utils';

// Common US timezones
const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time (ET - America/New_York)' },
  { value: 'America/Chicago', label: 'Central Time (CT - America/Chicago)' },
  { value: 'America/Denver', label: 'Mountain Time (MT - America/Denver)' },
  { value: 'America/Phoenix', label: 'Arizona (MST - America/Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT - America/Los_Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT - America/Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST - Pacific/Honolulu)' },
  { value: 'UTC', label: 'UTC' },
];

const DAYS_OF_WEEK = [
  { key: 'Mon', label: 'Mon' },
  { key: 'Tue', label: 'Tue' },
  { key: 'Wed', label: 'Wed' },
  { key: 'Thu', label: 'Thu' },
  { key: 'Fri', label: 'Fri' },
  { key: 'Sat', label: 'Sat' },
  { key: 'Sun', label: 'Sun' },
];

function getFullImageUrl(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null;
  return resolveMediaUrl(url);
}

function parseDaysList(rawDays: string | null | undefined): string[] {
  if (!rawDays) return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return rawDays
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
}

export default function ClubDetailsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { clubId, role } = useActiveClub();
  const {
    club,
    isLoading,
    isError,
    error,
    refetch,
    isOwner,
    updateClub,
    isUpdating,
    uploadLogo,
    isUploadingLogo,
  } = useClubDetails(clubId);

  // Active view tab: 'edit', 'branding', or 'preview'
  const [activeTab, setActiveTab] = useState<'edit' | 'branding' | 'preview'>('edit');
  const [isEditing, setIsEditing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [establishedYear, setEstablishedYear] = useState('');

  // Location State
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('United States');

  // Operating State
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [openingTime, setOpeningTime] = useState('06:00');
  const [closingTime, setClosingTime] = useState('22:00');
  const [timezone, setTimezone] = useState('America/New_York');
  const [facilitiesSummary, setFacilitiesSummary] = useState('');
  const [holidayClosureNotes, setHolidayClosureNotes] = useState('');

  // Logo state
  const [logoPreviewUri, setLogoPreviewUri] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);

  // UI status messages
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [showTzPicker, setShowTzPicker] = useState(false);

  // Initialize form when club data loads
  useEffect(() => {
    if (club) {
      setName(club.name || '');
      setShortDescription(club.short_description || '');
      setDescription(club.description || '');
      setContactEmail(club.contact_email || '');
      setContactPhone(club.contact_phone || '');
      setWebsite(club.website || '');
      setEstablishedYear(club.established_year ? String(club.established_year) : '');

      setAddressLine1(club.address_line1 || '');
      setAddressLine2(club.address_line2 || '');
      setCity(club.city || '');
      setState(club.state || '');
      setPostalCode(club.postal_code || '');
      setCountry(club.country || 'United States');

      setSelectedDays(parseDaysList(club.operating_days));
      setOpeningTime(club.opening_time ? club.opening_time.slice(0, 5) : '06:00');
      setClosingTime(club.closing_time ? club.closing_time.slice(0, 5) : '22:00');
      setTimezone(club.timezone || 'America/New_York');
      setFacilitiesSummary(club.facilities_summary || '');
      setHolidayClosureNotes(club.holiday_closure_notes || '');
      setLogoPreviewUri(club.logo_url || null);
      setLogoError(false);
    }
  }, [club]);

  // Pull-to-refresh
  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // Toggle Day Selection
  const toggleDay = (dayKey: string) => {
    if (!isOwner) return;
    setSelectedDays((prev) => {
      if (prev.includes(dayKey)) {
        if (prev.length === 1) {
          Alert.alert('Required', 'The club must operate on at least one day per week.');
          return prev;
        }
        return prev.filter((d) => d !== dayKey);
      } else {
        return [...prev, dayKey];
      }
    });
  };

  // Form validation
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = 'Club name is required.';
    }

    if (contactEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(contactEmail.trim())) {
        errors.contactEmail = 'Please enter a valid email address.';
      }
    }

    if (website.trim()) {
      const urlRegex = /^https?:\/\/.+/i;
      if (!urlRegex.test(website.trim())) {
        errors.website = 'Website must start with http:// or https://';
      }
    }

    if (establishedYear.trim()) {
      const yr = parseInt(establishedYear.trim(), 10);
      if (isNaN(yr) || yr < 1800 || yr > new Date().getFullYear()) {
        errors.establishedYear = `Year must be between 1800 and ${new Date().getFullYear()}.`;
      }
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (openingTime.trim() && !timeRegex.test(openingTime.trim())) {
      errors.openingTime = 'Format must be HH:MM (e.g. 06:00)';
    }

    if (closingTime.trim() && !timeRegex.test(closingTime.trim())) {
      errors.closingTime = 'Format must be HH:MM (e.g. 22:00)';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Logo upload handler
  const handlePickLogo = async () => {
    if (!isOwner) {
      Alert.alert('Permission Denied', 'Only the Club Owner can change the club logo.');
      return;
    }

    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Permission Needed',
            'Please grant photo library access to upload a club logo.'
          );
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const mime = asset.mimeType || (asset.uri?.endsWith('.png') ? 'image/png' : 'image/jpeg');
        const ext = mime.includes('png') ? 'png' : 'jpg';
        const fileName = asset.fileName || `club_logo_${Date.now()}.${ext}`;

        // Check file size (approximate for base64: length * 3/4)
        if (asset.base64 && (asset.base64.length * 0.75) > 5 * 1024 * 1024) {
          Alert.alert('File Too Large', 'Club logo image must be less than 5 MB.');
          return;
        }

        setLogoPreviewUri(asset.uri);
        setLogoError(false);

        // Upload to server immediately
        try {
          if (clubId) {
            const uploadRes = await clubAssetsApi.uploadClubMedia(
              clubId,
              { uri: asset.uri, name: fileName, type: mime },
              'logo'
            );
            const updated = await uploadLogo(uploadRes.public_url);
            setLogoPreviewUri(updated.logo_url || uploadRes.public_url);
          } else {
            const b64 = asset.base64
              ? `data:${mime};base64,${asset.base64}`
              : asset.uri;
            const updated = await uploadLogo(b64);
            setLogoPreviewUri(updated.logo_url || asset.uri);
          }
          setSaveSuccessMsg('Logo updated successfully!');
          setTimeout(() => setSaveSuccessMsg(null), 3000);
        } catch (uploadErr: any) {
          Alert.alert(
            'Logo Upload Failed',
            uploadErr?.message || 'Unable to upload logo to server. Please try again.'
          );
        }
      }
    } catch {
      Alert.alert('Error', 'Unable to open image picker.');
    }
  };

  // Cancel edit mode and reload saved backend data
  const handleCancelEdit = () => {
    if (club) {
      setName(club.name || '');
      setShortDescription(club.short_description || '');
      setDescription(club.description || '');
      setContactEmail(club.contact_email || '');
      setContactPhone(club.contact_phone || '');
      setWebsite(club.website || '');
      setEstablishedYear(club.established_year ? String(club.established_year) : '');
      setAddressLine1(club.address_line1 || '');
      setAddressLine2(club.address_line2 || '');
      setCity(club.city || '');
      setState(club.state || '');
      setPostalCode(club.postal_code || '');
      setCountry(club.country || 'United States');
      setSelectedDays(parseDaysList(club.operating_days));
      setOpeningTime(club.opening_time ? club.opening_time.slice(0, 5) : '06:00');
      setClosingTime(club.closing_time ? club.closing_time.slice(0, 5) : '22:00');
      setTimezone(club.timezone || 'America/New_York');
      setFacilitiesSummary(club.facilities_summary || '');
      setHolidayClosureNotes(club.holiday_closure_notes || '');
      setLogoPreviewUri(club.logo_url || null);
      setValidationErrors({});
    }
    setIsEditing(false);
  };

  // Save changes handler
  const handleSaveChanges = async () => {
    if (!isOwner) {
      Alert.alert('Permission Denied', 'Only the Club Owner can update club details.');
      return;
    }

    if (!validateForm()) {
      Alert.alert('Validation Error', 'Please correct the highlighted fields before saving.');
      return;
    }

    const payload: UpdateClubPayload = {
      name: name.trim(),
      short_description: shortDescription.trim() || null,
      description: description.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      website: website.trim() || null,
      established_year: establishedYear.trim() ? parseInt(establishedYear.trim(), 10) : null,
      address_line1: addressLine1.trim() || null,
      address_line2: addressLine2.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
      postal_code: postalCode.trim() || null,
      country: country.trim() || 'United States',
      operating_days: selectedDays.join(','),
      opening_time: openingTime.trim() ? `${openingTime.trim()}:00` : undefined,
      closing_time: closingTime.trim() ? `${closingTime.trim()}:00` : undefined,
      timezone: timezone,
      facilities_summary: facilitiesSummary.trim() || null,
      holiday_closure_notes: holidayClosureNotes.trim() || null,
    };

    try {
      await updateClub(payload);
      await refetch();
      setIsEditing(false);
      setSaveSuccessMsg('Club details saved successfully!');
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (saveErr: any) {
      Alert.alert(
        'Save Failed',
        saveErr?.message || 'Failed to save changes. Your entered information is preserved.'
      );
    }
  };

  const currentLogoUri = getFullImageUrl(logoPreviewUri || club?.logo_url);

  // Loading state
  if (isLoading && !club) {
    return (
      <Screen style={styles.screenContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#F4F8F5" />
        <AppHeader title="Club Details" showBack />
        <LoadingState message="Loading club details..." />
      </Screen>
    );
  }

  // Error state
  if (isError && !club) {
    return (
      <Screen style={styles.screenContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#F4F8F5" />
        <AppHeader title="Club Details" showBack />
        <ErrorState
          title="Unable to Load Club Details"
          message={error?.message || 'A network error occurred while loading club profile.'}
          onRetry={() => refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screenContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F8F5" />

      {/* Top Header */}
      <AppHeader
        title="Club Details"
        subtitle="Manage club profile, location, and operating hours"
        showBack={router.canGoBack()}
        borderless
      />

      {/* Tabs: Profile vs Branding vs Player Preview */}
      <View style={styles.tabsContainer}>
        <SegmentedTabs
          tabs={[
            { key: 'edit', label: isOwner ? (isEditing ? 'Editing Profile' : 'Profile') : 'Club Profile' },
            { key: 'branding', label: 'Branding & Assets' },
            { key: 'preview', label: 'Player Preview' },
          ]}
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab as any)}
        />
      </View>

      {/* Non-owner notification banner */}
      {!isOwner && activeTab === 'edit' && (
        <View style={styles.roleNoticeBanner}>
          <Lock size={16} color="#B45309" />
          <AppText style={styles.roleNoticeText}>
            Read-only mode: Only the Club Owner has permission to update club profile and location settings.
          </AppText>
        </View>
      )}

      {/* Save Success Toast */}
      {saveSuccessMsg && (
        <View style={styles.successBanner}>
          <CheckCircle2 size={18} color="#15803D" />
          <AppText style={styles.successBannerText}>{saveSuccessMsg}</AppText>
        </View>
      )}

      {activeTab === 'branding' ? (
        <ClubBrandingSection clubId={clubId || ''} isOwner={isOwner} />
      ) : (
        <KeyboardAvoidingView
          style={styles.keyboardContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 120 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#176B57"
            />
          }
        >
          {activeTab === 'edit' ? (
            !isEditing ? (
              /* ═════════════════════════════════════════════════════════════════════════
                 VIEW PROFILE MODE (Default)
                 ═════════════════════════════════════════════════════════════════════════ */
              <View style={styles.viewModeWrapper}>
                {/* Top Banner with Edit Button */}
                <View style={styles.viewModeBanner}>
                  <View style={styles.viewModeBannerLeft}>
                    <View style={styles.savedBadge}>
                      <CheckCircle2 size={14} color="#15803D" />
                      <AppText style={styles.savedBadgeText}>Saved Profile</AppText>
                    </View>
                    <AppText style={styles.viewModeBannerSubtitle}>
                      Current club settings visible to players
                    </AppText>
                  </View>
                  {isOwner && (
                    <TouchableOpacity
                      style={styles.editModeToggleBtn}
                      onPress={() => setIsEditing(true)}
                      activeOpacity={0.8}
                    >
                      <Pencil size={15} color="#FFFFFF" strokeWidth={2.5} />
                      <AppText style={styles.editModeToggleBtnText}>Edit Details</AppText>
                    </TouchableOpacity>
                  )}
                </View>

                {/* View Section 1: Club Information */}
                <Card style={styles.viewSectionCard}>
                  <View style={styles.sectionHeaderRow}>
                    <View style={styles.sectionIconBadge}>
                      <Building2 size={18} color="#176B57" />
                    </View>
                    <View style={styles.sectionTitleBlock}>
                      <AppText style={styles.sectionTitle}>Club Information</AppText>
                      <AppText style={styles.sectionSubtitle}>
                        Public identity and contact information
                      </AppText>
                    </View>
                  </View>

                  {/* Logo and Identity */}
                  <View style={styles.viewIdentityRow}>
                    <View style={styles.viewLogoBox}>
                      {currentLogoUri && !logoError ? (
                        <Image
                          source={{ uri: currentLogoUri }}
                          style={styles.viewLogoImg}
                          resizeMode="contain"
                          onError={() => setLogoError(true)}
                        />
                      ) : (
                        <View style={styles.viewLogoFallback}>
                          <Building2 size={32} color="#176B57" />
                        </View>
                      )}
                    </View>
                    <View style={styles.viewIdentityText}>
                      <AppText style={styles.viewClubName}>{name || 'Unnamed Club'}</AppText>
                      {shortDescription ? (
                        <AppText style={styles.viewTaglineText}>"{shortDescription}"</AppText>
                      ) : null}
                      {establishedYear ? (
                        <AppText style={styles.viewEstText}>Est. {establishedYear}</AppText>
                      ) : null}
                    </View>
                  </View>

                  {description ? (
                    <View style={styles.viewDescBox}>
                      <AppText style={styles.viewDescLabel}>About</AppText>
                      <AppText style={styles.viewDescText}>{description}</AppText>
                    </View>
                  ) : null}

                  {/* Contact grid */}
                  <View style={styles.viewContactGrid}>
                    {contactEmail ? (
                      <View style={styles.viewContactItem}>
                        <Mail size={15} color="#176B57" />
                        <AppText style={styles.viewContactLabel}>Email:</AppText>
                        <AppText style={styles.viewContactValue}>{contactEmail}</AppText>
                      </View>
                    ) : null}
                    {contactPhone ? (
                      <View style={styles.viewContactItem}>
                        <Phone size={15} color="#176B57" />
                        <AppText style={styles.viewContactLabel}>Phone:</AppText>
                        <AppText style={styles.viewContactValue}>{contactPhone}</AppText>
                      </View>
                    ) : null}
                    {website ? (
                      <View style={styles.viewContactItem}>
                        <Globe size={15} color="#176B57" />
                        <AppText style={styles.viewContactLabel}>Website:</AppText>
                        <TouchableOpacity onPress={() => Linking.openURL(website)}>
                          <AppText style={styles.viewContactLink}>{website}</AppText>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                </Card>

                {/* View Section 2: Location & Address */}
                <Card style={styles.viewSectionCard}>
                  <View style={styles.sectionHeaderRow}>
                    <View style={styles.sectionIconBadge}>
                      <MapPin size={18} color="#176B57" />
                    </View>
                    <View style={styles.sectionTitleBlock}>
                      <AppText style={styles.sectionTitle}>Location & Address</AppText>
                      <AppText style={styles.sectionSubtitle}>
                        Physical location shown for player navigation
                      </AppText>
                    </View>
                  </View>

                  <View style={styles.viewLocationBlock}>
                    {addressLine1 ? (
                      <AppText style={styles.viewAddressText}>{addressLine1}</AppText>
                    ) : null}
                    {addressLine2 ? (
                      <AppText style={styles.viewAddressSubText}>{addressLine2}</AppText>
                    ) : null}
                    <AppText style={styles.viewCityStateText}>
                      {[city, state, postalCode].filter(Boolean).join(', ') || 'No address specified'}
                    </AppText>
                    <AppText style={styles.viewCountryText}>{country || 'United States'}</AppText>
                  </View>
                </Card>

                {/* View Section 3: Operating Hours & Schedule */}
                <Card style={styles.viewSectionCard}>
                  <View style={styles.sectionHeaderRow}>
                    <View style={styles.sectionIconBadge}>
                      <Clock size={18} color="#176B57" />
                    </View>
                    <View style={styles.sectionTitleBlock}>
                      <AppText style={styles.sectionTitle}>Operating Hours & Schedule</AppText>
                      <AppText style={styles.sectionSubtitle}>
                        Weekly schedule, timezone, and facility summary
                      </AppText>
                    </View>
                  </View>

                  {/* Operating Days */}
                  <View style={styles.viewFieldGroup}>
                    <AppText style={styles.viewFieldLabel}>Operating Days</AppText>
                    <View style={styles.daysRow}>
                      {DAYS_OF_WEEK.map((day) => {
                        const isSelected = selectedDays.includes(day.key);
                        return (
                          <View
                            key={day.key}
                            style={[
                              styles.dayPillView,
                              isSelected && styles.dayPillSelectedView,
                            ]}
                          >
                            <AppText
                              style={[
                                styles.dayPillTextView,
                                isSelected && styles.dayPillTextSelectedView,
                              ]}
                            >
                              {day.label}
                            </AppText>
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  {/* Hours & Timezone */}
                  <View style={styles.viewHoursRow}>
                    <View style={styles.viewHoursCol}>
                      <AppText style={styles.viewHoursLabel}>Facility Hours</AppText>
                      <AppText style={styles.viewHoursValue}>
                        {openingTime} – {closingTime}
                      </AppText>
                    </View>
                    <View style={styles.viewHoursCol}>
                      <AppText style={styles.viewHoursLabel}>Club Timezone</AppText>
                      <AppText style={styles.viewHoursValue}>
                        {TIMEZONE_OPTIONS.find((t) => t.value === timezone)?.label.split('(')[0].trim() || timezone}
                      </AppText>
                    </View>
                  </View>

                  {facilitiesSummary ? (
                    <View style={styles.viewFieldGroup}>
                      <AppText style={styles.viewFieldLabel}>Facilities & Amenities</AppText>
                      <AppText style={styles.viewFacilitiesText}>{facilitiesSummary}</AppText>
                    </View>
                  ) : null}

                  {holidayClosureNotes ? (
                    <View style={styles.previewClosureNotice}>
                      <Info size={14} color="#9A6B00" />
                      <AppText style={styles.previewClosureText}>
                        {holidayClosureNotes}
                      </AppText>
                    </View>
                  ) : null}
                </Card>

                {/* Bottom Edit Action Button */}
                {isOwner && (
                  <TouchableOpacity
                    style={styles.bottomEditBtn}
                    onPress={() => setIsEditing(true)}
                    activeOpacity={0.85}
                  >
                    <Pencil size={18} color="#FFFFFF" strokeWidth={2.5} />
                    <AppText style={styles.bottomEditBtnText}>Edit Club Details</AppText>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              /* ═════════════════════════════════════════════════════════════════════════
                 EDIT PROFILE TAB (Active Edit Mode)
                 ═════════════════════════════════════════════════════════════════════════ */
              <View style={styles.formWrapper}>
                {/* Top Editing Status Banner */}
                <View style={styles.editingBanner}>
                  <View style={styles.editingBannerLeft}>
                    <Pencil size={16} color="#176B57" />
                    <AppText style={styles.editingBannerTitle}>Editing Club Profile</AppText>
                  </View>
                  <View style={styles.editingBannerActions}>
                    <TouchableOpacity
                      style={styles.editingBannerCancelBtn}
                      onPress={handleCancelEdit}
                      disabled={isUpdating}
                    >
                      <AppText style={styles.editingBannerCancelText}>Cancel</AppText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.editingBannerSaveBtn, isUpdating && styles.saveBtnDisabled]}
                      onPress={handleSaveChanges}
                      disabled={isUpdating}
                    >
                      {isUpdating ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <AppText style={styles.editingBannerSaveText}>Save Changes</AppText>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* SECTION A: CLUB INFORMATION */}
                <Card style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionIconBadge}>
                    <Building2 size={18} color="#176B57" />
                  </View>
                  <View style={styles.sectionTitleBlock}>
                    <AppText style={styles.sectionTitle}>Club Information</AppText>
                    <AppText style={styles.sectionSubtitle}>
                      Branding, public description, and contact info
                    </AppText>
                  </View>
                </View>

                {/* Logo Uploader */}
                <View style={styles.logoSection}>
                  <View style={styles.logoContainer}>
                    {currentLogoUri && !logoError ? (
                      <Image
                        source={{ uri: currentLogoUri }}
                        style={styles.logoImage}
                        resizeMode="contain"
                        onError={() => setLogoError(true)}
                      />
                    ) : (
                      <View style={styles.logoFallback}>
                        <Building2 size={36} color="#176B57" />
                      </View>
                    )}
                    {isOwner && (
                      <TouchableOpacity
                        style={styles.logoChangeButton}
                        onPress={handlePickLogo}
                        activeOpacity={0.8}
                        disabled={isUploadingLogo}
                        accessibilityLabel="Upload Club Logo"
                      >
                        {isUploadingLogo ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Camera size={14} color="#FFFFFF" />
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={styles.logoInfoTextWrapper}>
                    <AppText style={styles.logoTitle}>Club Logo</AppText>
                    <AppText style={styles.logoHelpText}>
                      PNG, JPG, or WEBP. Max 5MB. Displayed on public discovery and player dashboards.
                    </AppText>
                    {isOwner && (
                      <TouchableOpacity
                        onPress={handlePickLogo}
                        disabled={isUploadingLogo}
                        style={styles.logoActionLink}
                      >
                        <AppText style={styles.logoActionLinkText}>
                          {isUploadingLogo ? 'Uploading logo...' : 'Choose new image'}
                        </AppText>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Club Name */}
                <FormField
                  label="Club Name"
                  required
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Metro Pickleball Club"
                  error={validationErrors.name}
                  editable={isOwner}
                />

                {/* Tagline / Short Description */}
                <FormField
                  label="Short Tagline"
                  value={shortDescription}
                  onChangeText={setShortDescription}
                  placeholder="e.g. Premier indoor pickleball in Charlotte"
                  hint="A punchy one-liner shown on banners and search results."
                  editable={isOwner}
                />

                {/* Full Description */}
                <FormField
                  label="About the Club"
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Tell players about your facility, programs, tournaments, and community..."
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  editable={isOwner}
                />

                <View style={styles.rowTwoCols}>
                  <View style={styles.halfCol}>
                    <FormField
                      label="Contact Email"
                      value={contactEmail}
                      onChangeText={setContactEmail}
                      placeholder="info@club.com"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      error={validationErrors.contactEmail}
                      editable={isOwner}
                    />
                  </View>
                  <View style={styles.halfCol}>
                    <FormField
                      label="Contact Phone"
                      value={contactPhone}
                      onChangeText={setContactPhone}
                      placeholder="(555) 123-4567"
                      keyboardType="phone-pad"
                      editable={isOwner}
                    />
                  </View>
                </View>

                <View style={styles.rowTwoCols}>
                  <View style={styles.halfCol}>
                    <FormField
                      label="Public Website"
                      value={website}
                      onChangeText={setWebsite}
                      placeholder="https://example.com"
                      keyboardType="url"
                      autoCapitalize="none"
                      error={validationErrors.website}
                      editable={isOwner}
                    />
                  </View>
                  <View style={styles.halfCol}>
                    <FormField
                      label="Established Year"
                      value={establishedYear}
                      onChangeText={setEstablishedYear}
                      placeholder="e.g. 2023"
                      keyboardType="number-pad"
                      error={validationErrors.establishedYear}
                      editable={isOwner}
                    />
                  </View>
                </View>
              </Card>

              {/* SECTION B: LOCATION INFORMATION */}
              <Card style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionIconBadge}>
                    <MapPin size={18} color="#176B57" />
                  </View>
                  <View style={styles.sectionTitleBlock}>
                    <AppText style={styles.sectionTitle}>Location & Address</AppText>
                    <AppText style={styles.sectionSubtitle}>
                      Physical facility address for player GPS and navigation
                    </AppText>
                  </View>
                </View>

                <FormField
                  label="Address Line 1"
                  value={addressLine1}
                  onChangeText={setAddressLine1}
                  placeholder="e.g. 1000 Pickleball Way"
                  editable={isOwner}
                />

                <FormField
                  label="Address Line 2 (Optional)"
                  value={addressLine2}
                  onChangeText={setAddressLine2}
                  placeholder="e.g. Suite 200, Building B"
                  editable={isOwner}
                />

                <View style={styles.rowTwoCols}>
                  <View style={styles.halfCol}>
                    <FormField
                      label="City"
                      value={city}
                      onChangeText={setCity}
                      placeholder="e.g. Charlotte"
                      editable={isOwner}
                    />
                  </View>
                  <View style={styles.halfCol}>
                    <FormField
                      label="State / Province"
                      value={state}
                      onChangeText={setState}
                      placeholder="e.g. NC"
                      editable={isOwner}
                    />
                  </View>
                </View>

                <View style={styles.rowTwoCols}>
                  <View style={styles.halfCol}>
                    <FormField
                      label="Postal / ZIP Code"
                      value={postalCode}
                      onChangeText={setPostalCode}
                      placeholder="e.g. 28202"
                      editable={isOwner}
                    />
                  </View>
                  <View style={styles.halfCol}>
                    <FormField
                      label="Country"
                      value={country}
                      onChangeText={setCountry}
                      placeholder="e.g. United States"
                      editable={isOwner}
                    />
                  </View>
                </View>
              </Card>

              {/* SECTION C: OPERATING & FACILITIES */}
              <Card style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionIconBadge}>
                    <Clock size={18} color="#176B57" />
                  </View>
                  <View style={styles.sectionTitleBlock}>
                    <AppText style={styles.sectionTitle}>Operating Hours & Schedule</AppText>
                    <AppText style={styles.sectionSubtitle}>
                      Weekly schedule, club timezone, and facilities summary
                    </AppText>
                  </View>
                </View>

                {/* Operating Days Pills */}
                <View style={styles.fieldBlock}>
                  <AppText style={styles.fieldLabel}>Operating Days</AppText>
                  <View style={styles.daysRow}>
                    {DAYS_OF_WEEK.map((day) => {
                      const isSelected = selectedDays.includes(day.key);
                      return (
                        <TouchableOpacity
                          key={day.key}
                          style={[
                            styles.dayPill,
                            isSelected && styles.dayPillSelected,
                            !isOwner && styles.dayPillDisabled,
                          ]}
                          onPress={() => toggleDay(day.key)}
                          activeOpacity={0.7}
                        >
                          <AppText
                            style={[
                              styles.dayPillText,
                              isSelected && styles.dayPillTextSelected,
                            ]}
                          >
                            {day.label}
                          </AppText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.rowTwoCols}>
                  <View style={styles.halfCol}>
                    <FormField
                      label="Opening Time (HH:MM)"
                      value={openingTime}
                      onChangeText={setOpeningTime}
                      placeholder="06:00"
                      error={validationErrors.openingTime}
                      editable={isOwner}
                    />
                  </View>
                  <View style={styles.halfCol}>
                    <FormField
                      label="Closing Time (HH:MM)"
                      value={closingTime}
                      onChangeText={setClosingTime}
                      placeholder="22:00"
                      error={validationErrors.closingTime}
                      editable={isOwner}
                    />
                  </View>
                </View>

                {/* Timezone Selector */}
                <View style={styles.fieldBlock}>
                  <AppText style={styles.fieldLabel}>Club Timezone</AppText>
                  {isOwner ? (
                    <TouchableOpacity
                      style={styles.selectTrigger}
                      onPress={() => setShowTzPicker(!showTzPicker)}
                      activeOpacity={0.8}
                    >
                      <AppText style={styles.selectTriggerText}>
                        {TIMEZONE_OPTIONS.find((t) => t.value === timezone)?.label || timezone}
                      </AppText>
                      <Globe size={16} color="#667776" />
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.selectTriggerDisabled}>
                      <AppText style={styles.selectTriggerTextDisabled}>
                        {TIMEZONE_OPTIONS.find((t) => t.value === timezone)?.label || timezone}
                      </AppText>
                    </View>
                  )}

                  {showTzPicker && isOwner && (
                    <View style={styles.dropdownList}>
                      {TIMEZONE_OPTIONS.map((opt) => (
                        <TouchableOpacity
                          key={opt.value}
                          style={[
                            styles.dropdownItem,
                            opt.value === timezone && styles.dropdownItemSelected,
                          ]}
                          onPress={() => {
                            setTimezone(opt.value);
                            setShowTzPicker(false);
                          }}
                        >
                          <AppText
                            style={[
                              styles.dropdownItemText,
                              opt.value === timezone && styles.dropdownItemTextSelected,
                            ]}
                          >
                            {opt.label}
                          </AppText>
                          {opt.value === timezone && (
                            <Check size={16} color="#176B57" strokeWidth={2.5} />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {/* Facilities & Amenities Summary */}
                <FormField
                  label="Facilities & Amenities Summary"
                  value={facilitiesSummary}
                  onChangeText={setFacilitiesSummary}
                  placeholder="e.g. 8 dedicated championship courts, LED lighting, Pro Shop, locker rooms, ball machine"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  editable={isOwner}
                />

                {/* Holiday & Closure Information */}
                <FormField
                  label="Holiday & Special Closures"
                  value={holidayClosureNotes}
                  onChangeText={setHolidayClosureNotes}
                  placeholder="e.g. Closed Thanksgiving Day and Christmas Day. Reduced hours on New Year's Eve."
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                  editable={isOwner}
                />
              </Card>

              {/* ACTION BUTTONS (Owner only) */}
              {isOwner && (
                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={handleCancelEdit}
                    disabled={isUpdating}
                  >
                    <AppText style={styles.cancelBtnText}>Cancel</AppText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.saveBtn, isUpdating && styles.saveBtnDisabled]}
                    onPress={handleSaveChanges}
                    disabled={isUpdating}
                  >
                    {isUpdating ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Save size={18} color="#FFFFFF" strokeWidth={2} />
                        <AppText style={styles.saveBtnText}>Save Changes</AppText>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
            )
          ) : (
            /* ═════════════════════════════════════════════════════════════════════════
               PLAYER PREVIEW TAB
               ═════════════════════════════════════════════════════════════════════════ */
            <View style={styles.previewWrapper}>
              <View style={styles.previewModeBanner}>
                <Eye size={16} color="#176B57" />
                <AppText style={styles.previewModeText}>
                  Player Live Preview: This is exactly what enrolled and visiting players see.
                </AppText>
              </View>

              {/* Hero Banner Card */}
              <Card style={styles.previewHeroCard}>
                <View style={styles.previewHeroHeader}>
                  <View style={styles.previewLogoBox}>
                    {currentLogoUri ? (
                      <Image
                        source={{ uri: currentLogoUri }}
                        style={styles.previewLogoImg}
                        resizeMode="cover"
                      />
                    ) : (
                      <Building2 size={32} color="#176B57" />
                    )}
                  </View>
                  <View style={styles.previewTitleBlock}>
                    <AppText style={styles.previewClubName}>
                      {name || 'Pickleball Club'}
                    </AppText>
                    {city || state ? (
                      <View style={styles.previewCityRow}>
                        <MapPin size={13} color="#667776" />
                        <AppText style={styles.previewCityText}>
                          {[city, state].filter(Boolean).join(', ')}
                        </AppText>
                      </View>
                    ) : null}
                    {establishedYear ? (
                      <AppText style={styles.previewEstText}>
                        Est. {establishedYear}
                      </AppText>
                    ) : null}
                  </View>
                </View>

                {shortDescription ? (
                  <View style={styles.previewTaglineBox}>
                    <AppText style={styles.previewTaglineText}>
                      "{shortDescription}"
                    </AppText>
                  </View>
                ) : null}
              </Card>

              {/* About Card */}
              {description ? (
                <Card style={styles.previewSectionCard}>
                  <AppText style={styles.previewCardTitle}>About {name || 'the Club'}</AppText>
                  <AppText style={styles.previewBodyText}>{description}</AppText>
                </Card>
              ) : null}

              {/* Location Card */}
              {(addressLine1 || city || state || postalCode) ? (
                <Card style={styles.previewSectionCard}>
                  <View style={styles.previewHeaderRow}>
                    <MapPin size={18} color="#176B57" />
                    <AppText style={styles.previewCardTitle}>Location & Directions</AppText>
                  </View>
                  <View style={styles.previewAddressBlock}>
                    {addressLine1 ? (
                      <AppText style={styles.previewAddressLine}>{addressLine1}</AppText>
                    ) : null}
                    {addressLine2 ? (
                      <AppText style={styles.previewAddressLine}>{addressLine2}</AppText>
                    ) : null}
                    <AppText style={styles.previewAddressLine}>
                      {[city, state, postalCode].filter(Boolean).join(' ')}
                    </AppText>
                    {country ? (
                      <AppText style={styles.previewAddressCountry}>{country}</AppText>
                    ) : null}
                  </View>
                </Card>
              ) : null}

              {/* Operating Hours Card */}
              <Card style={styles.previewSectionCard}>
                <View style={styles.previewHeaderRow}>
                  <Clock size={18} color="#176B57" />
                  <AppText style={styles.previewCardTitle}>Operating Hours</AppText>
                </View>

                <View style={styles.previewHoursRow}>
                  <AppText style={styles.previewHoursLabel}>Days Open:</AppText>
                  <AppText style={styles.previewHoursValue}>
                    {selectedDays.length === 7
                      ? '7 Days a Week (Mon – Sun)'
                      : selectedDays.join(', ')}
                  </AppText>
                </View>

                <View style={styles.previewHoursRow}>
                  <AppText style={styles.previewHoursLabel}>Facility Hours:</AppText>
                  <AppText style={styles.previewHoursValue}>
                    {openingTime} – {closingTime} ({timezone.split('/')[1] || timezone})
                  </AppText>
                </View>

                {holidayClosureNotes ? (
                  <View style={styles.previewClosureNotice}>
                    <Info size={14} color="#9A6B00" />
                    <AppText style={styles.previewClosureText}>
                      {holidayClosureNotes}
                    </AppText>
                  </View>
                ) : null}
              </Card>

              {/* Facilities Card */}
              {facilitiesSummary ? (
                <Card style={styles.previewSectionCard}>
                  <View style={styles.previewHeaderRow}>
                    <Sparkles size={18} color="#176B57" />
                    <AppText style={styles.previewCardTitle}>Facilities & Amenities</AppText>
                  </View>
                  <AppText style={styles.previewBodyText}>{facilitiesSummary}</AppText>
                </Card>
              ) : null}

              {/* Contact Card */}
              {(contactEmail || contactPhone || website) ? (
                <Card style={styles.previewSectionCard}>
                  <View style={styles.previewHeaderRow}>
                    <Phone size={18} color="#176B57" />
                    <AppText style={styles.previewCardTitle}>Contact & Connect</AppText>
                  </View>

                  {contactEmail ? (
                    <TouchableOpacity
                      style={styles.previewContactItem}
                      onPress={() => Linking.openURL(`mailto:${contactEmail}`)}
                    >
                      <Mail size={16} color="#176B57" />
                      <AppText style={styles.previewContactLink}>{contactEmail}</AppText>
                    </TouchableOpacity>
                  ) : null}

                  {contactPhone ? (
                    <TouchableOpacity
                      style={styles.previewContactItem}
                      onPress={() => Linking.openURL(`tel:${contactPhone}`)}
                    >
                      <Phone size={16} color="#176B57" />
                      <AppText style={styles.previewContactLink}>{contactPhone}</AppText>
                    </TouchableOpacity>
                  ) : null}

                  {website ? (
                    <TouchableOpacity
                      style={styles.previewContactItem}
                      onPress={() => Linking.openURL(website)}
                    >
                      <Globe size={16} color="#176B57" />
                      <AppText style={styles.previewContactLink}>{website}</AppText>
                    </TouchableOpacity>
                  ) : null}
                </Card>
              ) : null}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#F4F8F5',
  },
  keyboardContainer: {
    flex: 1,
  },
  tabsContainer: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[2],
    paddingBottom: Spacing[3],
    backgroundColor: '#F4F8F5',
  },
  roleNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: '#FEF3C7',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2.5],
    marginHorizontal: Spacing[4],
    marginBottom: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  roleNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    lineHeight: 16,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: '#DCFCE7',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2.5],
    marginHorizontal: Spacing[4],
    marginBottom: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  successBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#15803D',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing[4],
    gap: Spacing[4],
  },
  formWrapper: {
    gap: Spacing[4],
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#E2EAE6',
    gap: Spacing[3],
    ...Shadows.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingBottom: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  sectionIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E5F6EC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitleBlock: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102B2A',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#667776',
    marginTop: 2,
  },
  logoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
    paddingVertical: Spacing[2],
  },
  logoContainer: {
    position: 'relative',
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#F0F5F2',
    borderWidth: 2,
    borderColor: '#D4E5DE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  logoFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E5F6EC',
  },
  logoChangeButton: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#176B57',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    ...Shadows.sm,
  },
  logoInfoTextWrapper: {
    flex: 1,
  },
  logoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#102B2A',
  },
  logoHelpText: {
    fontSize: 12,
    color: '#667776',
    lineHeight: 16,
    marginTop: 2,
  },
  logoActionLink: {
    marginTop: 4,
  },
  logoActionLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#176B57',
  },
  rowTwoCols: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  halfCol: {
    flex: 1,
  },
  fieldBlock: {
    gap: Spacing[1.5],
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2A4540',
  },
  daysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  dayPill: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
    backgroundColor: '#F0F5F2',
    borderWidth: 1,
    borderColor: '#D4E5DE',
  },
  dayPillSelected: {
    backgroundColor: '#176B57',
    borderColor: '#176B57',
  },
  dayPillDisabled: {
    opacity: 0.8,
  },
  dayPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#49635E',
  },
  dayPillTextSelected: {
    color: '#FFFFFF',
  },
  selectTrigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#D4E5DE',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3.5],
    paddingVertical: Spacing[3],
  },
  selectTriggerDisabled: {
    backgroundColor: '#F0F4F2',
    borderWidth: 1,
    borderColor: '#E2EAE6',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[3.5],
    paddingVertical: Spacing[3],
  },
  selectTriggerText: {
    fontSize: 14,
    color: '#102B2A',
  },
  selectTriggerTextDisabled: {
    fontSize: 14,
    color: '#667776',
  },
  dropdownList: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4E5DE',
    borderRadius: Radius.md,
    marginTop: Spacing[1],
    overflow: 'hidden',
    ...Shadows.md,
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing[3.5],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  dropdownItemSelected: {
    backgroundColor: '#E5F6EC',
  },
  dropdownItemText: {
    fontSize: 13,
    color: '#2A4540',
  },
  dropdownItemTextSelected: {
    fontWeight: '700',
    color: '#176B57',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    marginTop: Spacing[2],
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4E5DE',
    borderRadius: Radius.md,
    paddingVertical: Spacing[3.5],
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#667776',
  },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    backgroundColor: '#176B57',
    borderRadius: Radius.md,
    paddingVertical: Spacing[3.5],
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    ...Shadows.sm,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  /* PREVIEW STYLES */
  previewWrapper: {
    gap: Spacing[3],
  },
  previewModeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: '#E5F6EC',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2.5],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#C7EAD8',
  },
  previewModeText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#176B57',
  },
  previewHeroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing[5],
    borderWidth: 1,
    borderColor: '#E2EAE6',
    gap: Spacing[3],
    ...Shadows.sm,
  },
  previewHeroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
  },
  previewLogoBox: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F0F5F2',
    borderWidth: 1.5,
    borderColor: '#D4E5DE',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  previewLogoImg: {
    width: 68,
    height: 68,
  },
  previewTitleBlock: {
    flex: 1,
    gap: 2,
  },
  previewClubName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#102B2A',
  },
  previewCityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  previewCityText: {
    fontSize: 13,
    color: '#667776',
  },
  previewEstText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8A9C96',
    marginTop: 2,
  },
  previewTaglineBox: {
    backgroundColor: '#F8FAF9',
    padding: Spacing[3],
    borderRadius: Radius.md,
    borderLeftWidth: 3,
    borderLeftColor: '#176B57',
  },
  previewTaglineText: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#2A4540',
    lineHeight: 18,
  },
  previewSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#E2EAE6',
    gap: Spacing[2.5],
    ...Shadows.sm,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  previewCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102B2A',
  },
  previewBodyText: {
    fontSize: 13,
    color: '#49635E',
    lineHeight: 20,
  },
  previewAddressBlock: {
    gap: 2,
  },
  previewAddressLine: {
    fontSize: 14,
    color: '#2A4540',
  },
  previewAddressCountry: {
    fontSize: 13,
    fontWeight: '600',
    color: '#667776',
    marginTop: 2,
  },
  previewHoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  previewHoursLabel: {
    fontSize: 13,
    color: '#667776',
  },
  previewHoursValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#102B2A',
  },
  previewClosureNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: '#FFFBEB',
    padding: Spacing[2.5],
    borderRadius: Radius.sm,
    marginTop: 4,
  },
  previewClosureText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
  },
  previewContactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingVertical: 4,
  },
  previewContactLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#176B57',
    textDecorationLine: 'underline',
  },
  // View Mode & Edit Toggle Styles
  viewModeWrapper: {
    gap: Spacing[4],
  },
  viewModeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderWidth: 1,
    borderColor: '#E2EAE6',
    ...Shadows.sm,
  },
  viewModeBannerLeft: {
    gap: 3,
    flex: 1,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  savedBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  viewModeBannerSubtitle: {
    fontSize: 12,
    color: '#667776',
    marginTop: 2,
  },
  editModeToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#176B57',
    paddingHorizontal: Spacing[3.5],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    ...Shadows.sm,
  },
  editModeToggleBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  viewSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#E2EAE6',
    gap: Spacing[3.5],
    ...Shadows.sm,
  },
  viewIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3.5],
    paddingVertical: Spacing[1],
  },
  viewLogoBox: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F0F5F2',
    borderWidth: 2,
    borderColor: '#D4E5DE',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  viewLogoImg: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  viewLogoFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E5F6EC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewIdentityText: {
    flex: 1,
    gap: 2,
  },
  viewClubName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#102B2A',
  },
  viewTaglineText: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#2A4540',
  },
  viewEstText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A9C96',
  },
  viewDescBox: {
    backgroundColor: '#F8FAF9',
    padding: Spacing[3],
    borderRadius: Radius.md,
    gap: 4,
  },
  viewDescLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#176B57',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  viewDescText: {
    fontSize: 13,
    color: '#2A4540',
    lineHeight: 19,
  },
  viewContactGrid: {
    gap: Spacing[2],
    paddingTop: Spacing[1],
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2',
  },
  viewContactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  viewContactLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#667776',
    width: 65,
  },
  viewContactValue: {
    fontSize: 13,
    color: '#102B2A',
    flex: 1,
  },
  viewContactLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#176B57',
    textDecorationLine: 'underline',
  },
  viewLocationBlock: {
    gap: 3,
    paddingVertical: Spacing[1],
  },
  viewAddressText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#102B2A',
  },
  viewAddressSubText: {
    fontSize: 14,
    color: '#49635E',
  },
  viewCityStateText: {
    fontSize: 14,
    color: '#2A4540',
  },
  viewCountryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8A9C96',
    marginTop: 2,
  },
  viewFieldGroup: {
    gap: Spacing[2],
  },
  viewFieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#667776',
  },
  dayPillView: {
    paddingHorizontal: Spacing[2.5],
    paddingVertical: Spacing[1.5],
    borderRadius: Radius.full,
    backgroundColor: '#F0F4F2',
    borderWidth: 1,
    borderColor: '#E2EAE6',
  },
  dayPillSelectedView: {
    backgroundColor: '#E5F6EC',
    borderColor: '#176B57',
  },
  dayPillTextView: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8A9C96',
  },
  dayPillTextSelectedView: {
    fontWeight: '700',
    color: '#176B57',
  },
  viewHoursRow: {
    flexDirection: 'row',
    gap: Spacing[3],
    paddingVertical: Spacing[1],
  },
  viewHoursCol: {
    flex: 1,
    backgroundColor: '#F8FAF9',
    padding: Spacing[2.5],
    borderRadius: Radius.md,
    gap: 3,
  },
  viewHoursLabel: {
    fontSize: 12,
    color: '#667776',
  },
  viewHoursValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102B2A',
  },
  viewFacilitiesText: {
    fontSize: 13,
    color: '#2A4540',
    lineHeight: 19,
  },
  bottomEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    backgroundColor: '#176B57',
    paddingVertical: Spacing[3.5],
    borderRadius: Radius.lg,
    ...Shadows.md,
  },
  bottomEditBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  editingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EFF8F4',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#A8D5C2',
  },
  editingBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  editingBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#176B57',
  },
  editingBannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  editingBannerCancelBtn: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1.5],
    borderRadius: Radius.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4E5DE',
  },
  editingBannerCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#49635E',
  },
  editingBannerSaveBtn: {
    paddingHorizontal: Spacing[3.5],
    paddingVertical: Spacing[1.5],
    borderRadius: Radius.md,
    backgroundColor: '#176B57',
  },
  editingBannerSaveText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
