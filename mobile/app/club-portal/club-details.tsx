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
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  Globe,
  Link2,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Save,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  ClubBrandingSection,
  ClubInfoRow,
  ClubResponsiveContainer,
  ClubSectionCard,
  ClubTournamentConfigTab,
  ErrorState,
  FormField,
  FormRow,
  InternationalPhoneInput,
  LoadingState,
  PlayerClubDetailsPreview,
  Screen,
  TimePickerInput,
} from '@/components';
import { useActiveClub, useClubBranding, useClubDetails } from '@/hooks';
import { Radius, Shadows, Spacing } from '@/theme';
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
  const allDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  if (!rawDays || !rawDays.trim()) return allDays;

  const normalized = rawDays.trim().toLowerCase();
  if (
    normalized === 'monday - sunday' ||
    normalized === 'mon - sun' ||
    normalized === 'mon-sun' ||
    normalized === 'daily' ||
    normalized === 'every day' ||
    normalized === 'all week'
  ) {
    return allDays;
  }
  if (normalized === 'monday - friday' || normalized === 'mon - fri' || normalized === 'mon-fri' || normalized === 'weekdays') {
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  }
  if (normalized === 'saturday - sunday' || normalized === 'sat - sun' || normalized === 'weekends') {
    return ['Sat', 'Sun'];
  }

  const dayMap: Record<string, string> = {
    mon: 'Mon',
    monday: 'Mon',
    tue: 'Tue',
    tues: 'Tue',
    tuesday: 'Tue',
    wed: 'Wed',
    wednesday: 'Wed',
    thu: 'Thu',
    thur: 'Thu',
    thurs: 'Thu',
    thursday: 'Thu',
    fri: 'Fri',
    friday: 'Fri',
    sat: 'Sat',
    saturday: 'Sat',
    sun: 'Sun',
    sunday: 'Sun',
  };

  const parsed = rawDays
    .split(',')
    .map((d) => dayMap[d.trim().toLowerCase()] || '')
    .filter(Boolean);

  return parsed.length > 0 ? Array.from(new Set(parsed)) : allDays;
}

export default function ClubDetailsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tab: paramTab } = useLocalSearchParams<{ tab?: string }>();
  const { clubId } = useActiveClub();
  const {
    club,
    isLoading,
    isError,
    error,
    refetch,
    isOwner,
    updateClub,
    isUpdating,
  } = useClubDetails(clubId);
  const { branding } = useClubBranding(clubId);

  // Active view tab: 'edit', 'branding', 'tournament_config', or 'preview'
  const resolveClubTab = (v?: string): 'edit' | 'branding' | 'tournament_config' | 'preview' =>
    v === 'branding' || v === 'tournament_config' || v === 'preview' ? v : 'edit';
  const [activeTab, setActiveTab] = useState<'edit' | 'branding' | 'tournament_config' | 'preview'>(
    () => resolveClubTab(Array.isArray(paramTab) ? paramTab[0] : paramTab)
  );
  const handleTabChange = (nextTab: 'edit' | 'branding' | 'tournament_config' | 'preview') => {
    setActiveTab(nextTab);
    router.setParams({ tab: nextTab } as any);
  };
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

  const { width: windowWidth } = useWindowDimensions();
  const isWideTabs = windowWidth >= 580;
  const isCompactIdentity = windowWidth < 430;
  const [logoError, setLogoError] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

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

  const currentLogoUri = getFullImageUrl(club?.logo_url || branding?.logo_url);
  const currentCoverUri = getFullImageUrl(club?.cover_image_url || branding?.cover_image_url);

  const formattedAddress = useMemo(() => {
    const parts = [
      addressLine1,
      addressLine2,
      city,
      [state, postalCode].filter(Boolean).join(' '),
      country,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'No address specified';
  }, [addressLine1, addressLine2, city, state, postalCode, country]);

  const locationPillText = useMemo(() => {
    return [city, state].filter(Boolean).join(', ') || city || state || country || '';
  }, [city, state, country]);

  const timezoneLabel = useMemo(() => {
    if (timezone === 'UTC') return 'UTC';
    const found = TIMEZONE_OPTIONS.find((t) => t.value === timezone);
    return found ? found.label.split('(')[0].trim() : timezone || 'UTC';
  }, [timezone]);

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
        showBack={router.canGoBack()}
        borderless
      />

      {/* Unified Club Details Segmented Navigation */}
      <View style={styles.tabsOuter}>
        <ClubResponsiveContainer>
          <View style={[styles.tabsTrack, isWideTabs && styles.tabsTrackSingleRow]}>
            {[
              { key: 'edit', label: 'Profile' },
              { key: 'branding', label: 'Branding' },
              { key: 'tournament_config', label: 'Tournament Configuration' },
              { key: 'preview', label: 'Preview' },
            ].map((item) => {
              const isSelected = activeTab === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.tabBtn,
                    isWideTabs ? styles.tabBtnWide : styles.tabBtnCompact,
                    isSelected && styles.tabBtnSelected,
                  ]}
                  onPress={() => handleTabChange(item.key as any)}
                  activeOpacity={0.8}
                >
                  <AppText
                    style={[
                      styles.tabBtnText,
                      isSelected && styles.tabBtnTextSelected,
                    ]}
                  >
                    {item.label}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>
        </ClubResponsiveContainer>
      </View>

      {/* Non-owner notification banner */}
      {!isOwner && activeTab === 'edit' && (
        <ClubResponsiveContainer style={styles.noticeBannerWrap}>
          <View style={styles.roleNoticeBanner}>
            <Lock size={15} color="#B45309" />
            <AppText style={styles.roleNoticeText}>
              Read-only view. Only the Club Owner can edit club profile details.
            </AppText>
          </View>
        </ClubResponsiveContainer>
      )}

      {/* Save Success Toast */}
      {saveSuccessMsg && (
        <ClubResponsiveContainer style={styles.noticeBannerWrap}>
          <View style={styles.successBanner}>
            <CheckCircle2 size={16} color="#15803D" />
            <AppText style={styles.successBannerText}>{saveSuccessMsg}</AppText>
          </View>
        </ClubResponsiveContainer>
      )}

      {activeTab === 'branding' ? (
        <ClubBrandingSection clubId={clubId || ''} isOwner={isOwner} />
      ) : activeTab === 'tournament_config' ? (
        club ? (
          <ClubTournamentConfigTab club={club} isOwner={isOwner} onSaved={() => { refetch(); }} />
        ) : null
      ) : (
        <KeyboardAvoidingView
          style={styles.keyboardContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + 96 },
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
            <ClubResponsiveContainer>
              {activeTab === 'edit' ? (
                !isEditing ? (
                  /* ═══════════════════════════════════════════════════════════
                     PROFILE TAB (VIEW MODE)
                     ═══════════════════════════════════════════════════════════ */
                  <View style={styles.viewModeWrapper}>
                    {/* A. Compact Horizontal Club Identity Card */}
                    <ClubSectionCard style={styles.identityCard}>
                      <View style={styles.identityMainRow}>
                        {/* Left: Square Rounded Club Logo */}
                        <View style={styles.identityLogoBox}>
                          {currentLogoUri && !logoError ? (
                            <Image
                              source={{ uri: currentLogoUri }}
                              style={styles.identityLogoImg}
                              resizeMode="contain"
                              onError={() => setLogoError(true)}
                            />
                          ) : (
                            <Building2 size={26} color="#176B57" />
                          )}
                        </View>

                        {/* Right: Club Name, Short Description, Meta & Edit */}
                        <View style={styles.identityTextCol}>
                          <View style={styles.identityTitleRow}>
                            <AppText style={styles.identityName}>
                              {name || 'Club'}
                            </AppText>
                            {isOwner && !isCompactIdentity && (
                              <TouchableOpacity
                                style={styles.identityEditBtn}
                                onPress={() => setIsEditing(true)}
                                activeOpacity={0.75}
                              >
                                <Pencil size={12} color="#176B57" strokeWidth={2.2} />
                                <AppText style={styles.identityEditBtnText}>Edit Details</AppText>
                              </TouchableOpacity>
                            )}
                          </View>

                          {shortDescription ? (
                            <AppText style={styles.identityTagline}>
                              {shortDescription}
                            </AppText>
                          ) : null}

                          {(establishedYear || locationPillText) ? (
                            <View style={styles.identityMetaRow}>
                              {establishedYear ? (
                                <View style={styles.identityPill}>
                                  <Calendar size={12} color="#49635E" />
                                  <AppText style={styles.identityPillText}>
                                    Est. {establishedYear}
                                  </AppText>
                                </View>
                              ) : null}

                              {locationPillText ? (
                                <View style={styles.identityPill}>
                                  <MapPin size={12} color="#49635E" />
                                  <AppText style={styles.identityPillText}>
                                    {locationPillText}
                                  </AppText>
                                </View>
                              ) : null}
                            </View>
                          ) : null}

                          {isOwner && isCompactIdentity && (
                            <TouchableOpacity
                              style={[styles.identityEditBtn, styles.identityEditBtnCompact]}
                              onPress={() => setIsEditing(true)}
                              activeOpacity={0.75}
                            >
                              <Pencil size={12} color="#176B57" strokeWidth={2.2} />
                              <AppText style={styles.identityEditBtnText}>Edit Details</AppText>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    </ClubSectionCard>

                    {/* B. About the Club */}
                    <ClubSectionCard title="About the Club">
                      {description ? (
                        <View style={styles.aboutBlock}>
                          <AppText style={styles.viewBodyText}>
                            {description.length > 320 && !isDescriptionExpanded
                              ? description.slice(0, 320).trimEnd()
                              : description}
                          </AppText>
                          {description.length > 320 && (
                            <TouchableOpacity
                              onPress={() => setIsDescriptionExpanded((v) => !v)}
                              activeOpacity={0.7}
                              style={styles.readMoreBtn}
                            >
                              <AppText style={styles.readMoreText}>
                                {isDescriptionExpanded ? 'Show less' : 'Read full description'}
                              </AppText>
                            </TouchableOpacity>
                          )}
                        </View>
                      ) : (
                        <AppText style={styles.emptyBodyMuted}>
                          No club description added yet.
                        </AppText>
                      )}
                    </ClubSectionCard>

                    {/* C. Location & Address */}
                    <ClubSectionCard title="Location & Address">
                      <View style={styles.addressRow}>
                        <MapPin size={15} color="#49635E" style={styles.addressRowIcon} />
                        <AppText
                          style={
                            formattedAddress === 'No address specified'
                              ? styles.emptyBodyMuted
                              : styles.addressRowText
                          }
                        >
                          {formattedAddress}
                        </AppText>
                      </View>
                    </ClubSectionCard>

                    {/* D. Operating Information */}
                    <ClubSectionCard title="Operating Information">
                      <View>
                        <ClubInfoRow
                          icon={<Calendar size={15} color="#49635E" />}
                          label="Operating Days"
                          value={
                            selectedDays.length === 7
                              ? 'Every day (Mon – Sun)'
                              : selectedDays.length > 0
                                ? selectedDays.join(', ')
                                : club?.operating_days || 'Mon – Sun'
                          }
                        />
                        <ClubInfoRow
                          icon={<Clock size={15} color="#49635E" />}
                          label="Facility Hours"
                          value={openingTime && closingTime ? `${openingTime} – ${closingTime}` : '06:00 – 22:00'}
                        />
                        <ClubInfoRow
                          icon={<Globe size={15} color="#49635E" />}
                          label="Club Timezone"
                          value={timezoneLabel}
                          isLast={!facilitiesSummary && !holidayClosureNotes}
                        />
                        {facilitiesSummary ? (
                          <ClubInfoRow
                            icon={<Building2 size={15} color="#49635E" />}
                            label="Facilities"
                            value={facilitiesSummary}
                            isLast={!holidayClosureNotes}
                          />
                        ) : null}
                        {holidayClosureNotes ? (
                          <ClubInfoRow
                            icon={<Clock size={15} color="#49635E" />}
                            label="Closures"
                            value={holidayClosureNotes}
                            isLast
                          />
                        ) : null}
                      </View>
                    </ClubSectionCard>

                    {/* E. Contact Information */}
                    <ClubSectionCard title="Contact Information">
                      <View>
                        <ClubInfoRow
                          icon={<Mail size={15} color="#49635E" />}
                          label="Email"
                          value={contactEmail}
                          onPress={contactEmail ? () => Linking.openURL(`mailto:${contactEmail}`) : undefined}
                          trailingIcon={contactEmail ? <ExternalLink size={12} color="#176B57" /> : undefined}
                        />
                        <ClubInfoRow
                          icon={<Phone size={15} color="#49635E" />}
                          label="Phone"
                          value={contactPhone}
                          onPress={contactPhone ? () => Linking.openURL(`tel:${contactPhone}`) : undefined}
                        />
                        <ClubInfoRow
                          icon={<Link2 size={15} color="#49635E" />}
                          label="Website"
                          value={website}
                          isLast
                          onPress={
                            website
                              ? () => {
                                  const u = website.startsWith('http') ? website : `https://${website}`;
                                  Linking.openURL(u);
                                }
                              : undefined
                          }
                          trailingIcon={website ? <ExternalLink size={12} color="#176B57" /> : undefined}
                        />
                      </View>
                    </ClubSectionCard>
                  </View>
                ) : (
                  /* ═══════════════════════════════════════════════════════════
                     PROFILE TAB (EDIT MODE)
                     ═══════════════════════════════════════════════════════════ */
                  <View style={styles.formWrapper}>
                    <View style={styles.editingBanner}>
                      <View style={styles.editingBannerLeft}>
                        <Pencil size={14} color="#176B57" strokeWidth={2.2} />
                        <AppText style={styles.editingBannerTitle}>Editing Club Profile</AppText>
                      </View>
                      <View style={styles.editingBannerActions}>
                        <TouchableOpacity
                          style={styles.editingBannerCancelBtn}
                          onPress={handleCancelEdit}
                          disabled={isUpdating}
                          activeOpacity={0.7}
                        >
                          <AppText style={styles.editingBannerCancelText}>Cancel</AppText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.editingBannerSaveBtn, isUpdating && styles.saveBtnDisabled]}
                          onPress={handleSaveChanges}
                          disabled={isUpdating}
                          activeOpacity={0.8}
                        >
                          {isUpdating ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <AppText style={styles.editingBannerSaveText}>Save</AppText>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* 1. BASIC DETAILS CARD */}
                    <ClubSectionCard title="Basic Details">
                      <View style={styles.fieldWrapper}>
                        <FormField
                          label="Club Name"
                          required
                          value={name}
                          onChangeText={setName}
                          placeholder="e.g. Pickleball Club"
                          error={validationErrors.name}
                          editable={isOwner}
                        />
                      </View>

                      <View style={styles.fieldWrapper}>
                        <FormField
                          label="Short Tagline"
                          value={shortDescription}
                          onChangeText={setShortDescription}
                          placeholder="e.g. Premier indoor and outdoor pickleball"
                          editable={isOwner}
                        />
                      </View>

                      <View style={styles.fieldWrapper}>
                        <FormField
                          label="About the Club"
                          value={description}
                          onChangeText={setDescription}
                          placeholder="Tell players about your facility, programs, and community..."
                          multiline
                          numberOfLines={4}
                          textAlignVertical="top"
                          editable={isOwner}
                        />
                      </View>

                      <View style={styles.fieldWrapper}>
                        <FormField
                          label="Established Year"
                          value={establishedYear}
                          onChangeText={setEstablishedYear}
                          placeholder="e.g. 2026"
                          keyboardType="number-pad"
                          error={validationErrors.establishedYear}
                          editable={isOwner}
                        />
                      </View>
                    </ClubSectionCard>

                    {/* 2. CONTACT INFORMATION CARD */}
                    <ClubSectionCard title="Contact Information">
                      <View style={styles.fieldWrapper}>
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

                      <View style={styles.fieldWrapper}>
                        <InternationalPhoneInput
                          label="Contact Phone"
                          value={contactPhone}
                          onChangeText={setContactPhone}
                          disabled={!isOwner}
                        />
                      </View>

                      <View style={styles.fieldWrapper}>
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
                    </ClubSectionCard>

                    {/* 3. LOCATION & ADDRESS CARD */}
                    <ClubSectionCard title="Location & Address">
                      <View style={styles.fieldWrapper}>
                        <FormField
                          label="Address Line 1"
                          value={addressLine1}
                          onChangeText={setAddressLine1}
                          placeholder="e.g. 1000 Pickleball Way"
                          editable={isOwner}
                        />
                      </View>

                      <View style={styles.fieldWrapper}>
                        <FormField
                          label="Address Line 2 (Optional)"
                          value={addressLine2}
                          onChangeText={setAddressLine2}
                          placeholder="e.g. Suite 200"
                          editable={isOwner}
                        />
                      </View>

                      <FormRow breakpoint={600} gap={Spacing[3]}>
                        <View style={styles.fieldWrapper}>
                          <FormField
                            label="City"
                            value={city}
                            onChangeText={setCity}
                            placeholder="e.g. Charlotte"
                            editable={isOwner}
                          />
                        </View>
                        <View style={styles.fieldWrapper}>
                          <FormField
                            label="State / Province"
                            value={state}
                            onChangeText={setState}
                            placeholder="e.g. NC"
                            editable={isOwner}
                          />
                        </View>
                      </FormRow>

                      <FormRow breakpoint={600} gap={Spacing[3]}>
                        <View style={styles.fieldWrapper}>
                          <FormField
                            label="Postal / ZIP Code"
                            value={postalCode}
                            onChangeText={setPostalCode}
                            placeholder="e.g. 28202"
                            editable={isOwner}
                          />
                        </View>
                        <View style={styles.fieldWrapper}>
                          <FormField
                            label="Country"
                            value={country}
                            onChangeText={setCountry}
                            placeholder="e.g. United States"
                            editable={isOwner}
                          />
                        </View>
                      </FormRow>
                    </ClubSectionCard>

                    {/* 4. OPERATING INFORMATION CARD */}
                    <ClubSectionCard title="Operating Hours & Schedule">
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

                      <FormRow stackOnMobile={false}>
                        <TimePickerInput
                          label="Opening Time"
                          value={openingTime}
                          onChange={setOpeningTime}
                          error={validationErrors.openingTime}
                          disabled={!isOwner}
                          includeSeconds={false}
                        />
                        <TimePickerInput
                          label="Closing Time"
                          value={closingTime}
                          onChange={setClosingTime}
                          error={validationErrors.closingTime}
                          disabled={!isOwner}
                          includeSeconds={false}
                        />
                      </FormRow>

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

                      <View style={styles.fieldWrapper}>
                        <FormField
                          label="Facilities & Amenities"
                          value={facilitiesSummary}
                          onChangeText={setFacilitiesSummary}
                          placeholder="e.g. 8 dedicated courts, LED lighting, pro shop"
                          multiline
                          numberOfLines={3}
                          textAlignVertical="top"
                          editable={isOwner}
                        />
                      </View>

                      <View style={styles.fieldWrapper}>
                        <FormField
                          label="Holiday & Special Closures"
                          value={holidayClosureNotes}
                          onChangeText={setHolidayClosureNotes}
                          placeholder="e.g. Closed Thanksgiving Day and Christmas Day"
                          multiline
                          numberOfLines={2}
                          textAlignVertical="top"
                          editable={isOwner}
                        />
                      </View>
                    </ClubSectionCard>

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
                              <Save size={16} color="#FFFFFF" strokeWidth={2} />
                              <AppText style={styles.saveBtnText}>Save Changes</AppText>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )
              ) : (
                /* ═══════════════════════════════════════════════════════════
                   PREVIEW TAB
                   ═══════════════════════════════════════════════════════════ */
                <View style={styles.previewWrapper}>
                  <View style={styles.previewModeBanner}>
                    <Eye size={15} color="#176B57" />
                    <AppText style={styles.previewModeText}>
                      Live preview using saved club details and branding.
                    </AppText>
                  </View>

                  <PlayerClubDetailsPreview
                    clubId={clubId}
                    club={club}
                    name={name}
                    shortDescription={shortDescription}
                    description={description}
                    contactEmail={contactEmail}
                    contactPhone={contactPhone}
                    website={website}
                    establishedYear={establishedYear}
                    addressLine1={addressLine1}
                    addressLine2={addressLine2}
                    city={city}
                    state={state}
                    postalCode={postalCode}
                    country={country}
                    selectedDays={selectedDays}
                    openingTime={openingTime}
                    closingTime={closingTime}
                    timezone={timezone}
                    facilitiesSummary={facilitiesSummary}
                    logoUri={currentLogoUri}
                    coverUri={currentCoverUri}
                  />
                </View>
              )}
            </ClubResponsiveContainer>
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
  tabsOuter: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[1],
    paddingBottom: Spacing[3],
    backgroundColor: '#F4F8F5',
  },
  tabsTrack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#E5EFEA',
    borderRadius: 12,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: '#D6E4DD',
  },
  tabsTrackSingleRow: {
    flexWrap: 'nowrap',
  },
  tabBtn: {
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
    minHeight: 38,
  },
  tabBtnWide: {
    flex: 1,
  },
  tabBtnCompact: {
    width: '49%',
    flexGrow: 1,
  },
  tabBtnSelected: {
    backgroundColor: '#176B57',
    ...Shadows.sm,
  },
  tabBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#425C57',
    textAlign: 'center',
  },
  tabBtnTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  noticeBannerWrap: {
    paddingHorizontal: Spacing[4],
    marginBottom: Spacing[2.5],
  },
  roleNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: '#FEF3C7',
    paddingHorizontal: Spacing[3.5],
    paddingVertical: Spacing[2.5],
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
    paddingHorizontal: Spacing[3.5],
    paddingVertical: Spacing[2.5],
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
    paddingTop: Spacing[1],
  },
  formWrapper: {
    gap: Spacing[3],
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
  fieldWrapper: {
    width: '100%',
  },
  fieldLabel: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#2A4540',
    letterSpacing: 0.1,
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
    borderRadius: Radius.lg,
    minHeight: 46,
    paddingHorizontal: Spacing[3.5],
    paddingVertical: Spacing[2.5],
  },
  selectTriggerDisabled: {
    backgroundColor: '#F0F4F2',
    borderWidth: 1,
    borderColor: '#E2EAE6',
    borderRadius: Radius.lg,
    minHeight: 46,
    paddingHorizontal: Spacing[3.5],
    paddingVertical: Spacing[2.5],
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

  // ─── View Profile Mode Styles ───
  viewModeWrapper: {
    gap: Spacing[3],
  },
  identityCard: {
    paddingVertical: Spacing[3.5],
    paddingHorizontal: Spacing[4],
  },
  identityMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  identityLogoBox: {
    width: 68,
    height: 68,
    borderRadius: 14,
    backgroundColor: '#F0F5F2',
    borderWidth: 1,
    borderColor: '#DCE7E1',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  identityLogoImg: {
    width: 60,
    height: 60,
    borderRadius: 10,
  },
  identityTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  identityTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  identityName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#102B2A',
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  identityTagline: {
    fontSize: 13,
    color: '#5C726D',
    lineHeight: 18,
  },
  identityMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  identityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F2F6F4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  identityPillText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#49635E',
  },
  identityEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: '#176B57',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: '#FFFFFF',
    flexShrink: 0,
  },
  identityEditBtnCompact: {
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  identityEditBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#176B57',
  },
  aboutBlock: {
    gap: 6,
  },
  viewBodyText: {
    fontSize: 13.5,
    color: '#102B2A',
    lineHeight: 20,
  },
  readMoreBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  readMoreText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#176B57',
  },
  emptyBodyMuted: {
    fontSize: 13,
    color: '#8A9C96',
    fontStyle: 'italic',
    lineHeight: 19,
  },

  // Address
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  addressRowIcon: {
    marginTop: 3,
    flexShrink: 0,
  },
  addressRowText: {
    flex: 1,
    fontSize: 13.5,
    color: '#102B2A',
    lineHeight: 20,
  },

  // Table rows (Operating & Contact)
  tableRowBorder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  tableRowLast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingBottom: 2,
  },
  tableRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tableRowLabel: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#102B2A',
  },
  tableRowValue: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#102B2A',
  },
  tableRowMuted: {
    fontSize: 13.5,
    color: '#8A9C96',
    fontStyle: 'italic',
  },

  // Contact rows
  contactRowBorder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  contactRowLast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingBottom: 2,
  },
  contactRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: 86,
    flexShrink: 0,
  },
  contactLinkTouch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    minWidth: 0,
  },
  contactPhoneTouch: {
    flex: 1,
    alignItems: 'flex-end',
  },
  contactLinkText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#176B57',
    textDecorationLine: 'underline',
    flexShrink: 1,
    textAlign: 'right',
  },
  externalIcon: {
    flexShrink: 0,
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
  logoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginBottom: 2,
  },
  logoActionLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    marginTop: 4,
  },
  logoActionLinkSecondary: {
    paddingVertical: 2,
  },
  logoActionLinkTextDanger: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  viewCoverSection: {
    marginTop: Spacing[3.5],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: '#E2EAE6',
  },
  viewCoverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing[2],
    gap: Spacing[2],
  },
  viewCoverTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102B2A',
  },
  viewCoverSubtitle: {
    fontSize: 12,
    color: '#667776',
    marginTop: 2,
  },
  viewCoverPreviewWrapper: {
    width: '100%',
    height: 150,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#F0F5F2',
    borderWidth: 1,
    borderColor: '#D4E5DE',
    marginTop: Spacing[1],
  },
  viewCoverImg: {
    width: '100%',
    height: '100%',
  },
  coverUploadSection: {
    marginTop: Spacing[4],
    paddingTop: Spacing[4],
    borderTopWidth: 1,
    borderTopColor: '#E2EAE6',
  },
  coverUploadHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing[2],
    gap: Spacing[2],
  },
  coverUploadTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102B2A',
  },
  coverUploadHelpText: {
    fontSize: 12,
    color: '#667776',
    marginTop: 2,
    lineHeight: 16,
  },
  coverPreviewContainer: {
    position: 'relative',
    width: '100%',
    height: 160,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#F0F5F2',
    borderWidth: 1,
    borderColor: '#D4E5DE',
    marginTop: Spacing[2],
  },
  coverPreviewImg: {
    width: '100%',
    height: '100%',
  },
  coverUploadOverlay: {
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
  coverUploadOverlayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  coverActionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2.5],
    marginTop: Spacing[3],
    flexWrap: 'wrap',
  },
  coverUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#176B57',
    paddingHorizontal: Spacing[3.5],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    gap: Spacing[1.5],
  },
  coverUploadBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  coverRemoveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    gap: Spacing[1.5],
  },
  coverRemoveBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },

  // Edit Mode Specific Styles (Exact reference matching)
  editLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3.5],
    marginTop: Spacing[2],
  },
  editLogoContainer: {
    position: 'relative',
    width: 62,
    height: 62,
  },
  editLogoCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  editLogoImg: {
    width: '100%',
    height: '100%',
  },
  editCameraCircle: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#176B57',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 1.5,
    elevation: 2,
  },
  editLogoInfoCol: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  editBadgeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    flexWrap: 'wrap',
    marginBottom: 3,
  },
  editSubHeading: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#102B2A',
  },
  pillBadgeSuccess: {
    backgroundColor: '#E5F6EC',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  pillBadgeSuccessText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#176B57',
  },
  editHelpText: {
    fontSize: 12,
    color: '#667776',
    lineHeight: 16,
    marginBottom: 2,
  },
  editLinkActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginTop: 4,
  },
  editActionLinkPrimary: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#176B57',
  },
  editActionDivider: {
    fontSize: 12,
    color: '#A0B4AC',
    marginHorizontal: 1,
  },
  editActionLinkDanger: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#DC2626',
  },
  cardInnerDivider: {
    height: 1,
    backgroundColor: '#EEF3F0',
    marginVertical: Spacing[3.5],
  },
  editCoverBlock: {
    width: '100%',
  },
  editCoverPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    marginTop: Spacing[2.5],
  },
  editCoverPreviewBox: {
    flex: 1.25,
    height: 72,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#D4E5DE',
    position: 'relative',
  },
  editCoverImg: {
    width: '100%',
    height: '100%',
  },
  uploadCoverOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: Spacing[3.5],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#176B57',
    backgroundColor: '#FFFFFF',
    minHeight: 38,
  },
  uploadCoverOutlineBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#176B57',
  },
  pillBadgeDefault: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  pillBadgeDefaultText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  editCoverEmptyBox: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    borderRadius: Radius.md,
  },
  editCoverEmptyText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  coverActionButtonsCol: {
    flexDirection: 'column',
    gap: 6,
    justifyContent: 'center',
  },
  removeCoverOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: Spacing[2.5],
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  removeCoverOutlineBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#DC2626',
  },
});
