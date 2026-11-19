/**
 * Aught2 Pickleball — Player Profile Screen
 *
 * Premium personal identity and player profile screen matching Club Side Profile design:
 *   - Forest green curved header with Settings gear shortcut (`/(player)/settings`).
 *   - Circular profile avatar overlapping the bottom edge of the header with camera badge.
 *   - Real authenticated user details and dynamic role badge.
 *   - Personal Information card with in-place profile editing and email verified badge.
 *   - Dedicated Playing Details card (Skill level, play style, preferred format, dominant hand).
 *   - Visually separated Support & Legal section (Help & Support, Terms of Service, Privacy Policy).
 *   - Destructive styled Sign Out button.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  Edit3,
  FileText,
  HelpCircle,
  LogOut,
  Settings as SettingsIcon,
  Shield,
  Trash2,
  Trophy,
  User,
} from 'lucide-react-native';

import {
  AppText,
  Badge,
  Button,
  Card,
  DatePickerInput,
  Input,
  ModalSheet,
  Screen,
} from '@/components';
import { API_ENDPOINTS } from '@/constants';
import { useAuth, usePlayerProfile } from '@/hooks';
import { Colors, Radius, Shadows, Spacing, getBottomNavPadding } from '@/theme';

export default function PlayerProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const {
    profile,
    isLoading: isProfileLoading,
    refetch: refetchProfile,
    updateProfile,
    isUpdatingProfile,
    uploadPhoto,
    isUploadingPhoto,
    deletePhoto,
    isDeletingPhoto,
  } = usePlayerProfile();

  useFocusEffect(
    useCallback(() => {
      refetchProfile();
    }, [refetchProfile])
  );

  const [refreshing, setRefreshing] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isPlayingModalVisible, setIsPlayingModalVisible] = useState(false);
  const [isPhotoMenuVisible, setIsPhotoMenuVisible] = useState(false);

  // ─── Edit Personal Info Form State ─────────────────────────────────────────
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editGender, setEditGender] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editBio, setEditBio] = useState('');

  // ─── Playing Details State ─────────────────────────────────────────────────
  const [editSkillLevel, setEditSkillLevel] = useState('3.5');
  const [editPlayStyle, setEditPlayStyle] = useState('Recreational');
  const [editPreferredFormat, setEditPreferredFormat] = useState('Doubles');
  const [editDominantHand, setEditDominantHand] = useState('Right-handed');

  // Parse structured playing details from bio or defaults
  const parsedPlayingDetails = useMemo(() => {
    const rawBio = profile?.bio || '';
    
    // Parse skill level (e.g. "3.5" or "Level: 3.5")
    const levelMatch = rawBio.match(/(?:Level|Rating):\s*([1-5]\.[0-5])/i) || rawBio.match(/\b([1-5]\.[0-5])\b/);
    const level = levelMatch ? levelMatch[1] : (profile?.skill_rating ? String(profile.skill_rating) : '3.5');

    // Parse play style
    const styleMatch = rawBio.match(/(?:Style):\s*([A-Za-z]+)/i) || rawBio.match(/(Recreational|Competitive|Intermediate|Advanced|Beginner)/i);
    const style = styleMatch ? styleMatch[1] : 'Recreational';

    // Parse preferred format
    const formatMatch = rawBio.match(/(?:Format):\s*([A-Za-z\s]+?)(?:\||\n|$)/i);
    const format = formatMatch ? formatMatch[1].trim() : 'Doubles';

    // Parse dominant hand
    const handMatch = rawBio.match(/(?:Hand):\s*([A-Za-z\-]+?)(?:\||\n|$)/i);
    const hand = handMatch ? handMatch[1].trim() : 'Right-handed';

    return { level, style, format, hand };
  }, [profile?.bio, profile?.skill_rating]);

  // Sync state with profile
  useEffect(() => {
    if (profile) {
      setEditDisplayName(profile.display_name || user?.full_name || '');
      setEditFirstName(profile.first_name || '');
      setEditLastName(profile.last_name || '');
      setEditPhone(profile.phone || '');
      setEditGender(profile.gender || '');
      setEditDob(profile.date_of_birth || '');
      setEditBio(profile.bio || '');
    } else if (user) {
      setEditDisplayName(user.full_name || '');
    }

    setEditSkillLevel(parsedPlayingDetails.level);
    setEditPlayStyle(parsedPlayingDetails.style);
    setEditPreferredFormat(parsedPlayingDetails.format);
    setEditDominantHand(parsedPlayingDetails.hand);
  }, [profile, user, parsedPlayingDetails]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetchProfile();
    setRefreshing(false);
  };

  const displayName = profile?.display_name || user?.full_name || 'Player';
  const email = user?.email || '—';

  // Resolved Photo URL
  const resolvedPhotoUrl = useMemo(() => {
    if (!profile?.profile_image_url) return null;
    const url = profile.profile_image_url.trim();
    if (!url) return null;
    if (url.startsWith('http') || url.startsWith('data:')) {
      return url;
    }
    return `${API_ENDPOINTS.BASE}${url.startsWith('/') ? '' : '/'}${url}`;
  }, [profile?.profile_image_url]);

  // Initials Fallback
  const initials = useMemo(() => {
    if (!displayName) return 'PL';
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return displayName.slice(0, 2).toUpperCase();
  }, [displayName]);

  // ─── Photo Actions ─────────────────────────────────────────────────────────
  const handlePickImage = async () => {
    setIsPhotoMenuVisible(false);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant access to your photo library to update your avatar.'
        );
        return;
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
        const mime = asset.mimeType || 'image/jpeg';
        const b64 = asset.base64 ? `data:${mime};base64,${asset.base64}` : asset.uri;
        await uploadPhoto(b64);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not upload photo.';
      Alert.alert('Upload Error', msg);
    }
  };

  const handleTakePhoto = async () => {
    setIsPhotoMenuVisible(false);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant camera access to capture a profile photo.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const mime = asset.mimeType || 'image/jpeg';
        const b64 = asset.base64 ? `data:${mime};base64,${asset.base64}` : asset.uri;
        await uploadPhoto(b64);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not take photo.';
      Alert.alert('Camera Error', msg);
    }
  };

  const handleDeletePhoto = async () => {
    setIsPhotoMenuVisible(false);
    try {
      await deletePhoto();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not remove photo.';
      Alert.alert('Error', msg);
    }
  };

  // ─── Save Personal Information ─────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!editDisplayName.trim()) {
      Alert.alert('Validation Error', 'Display name cannot be empty.');
      return;
    }

    try {
      await updateProfile({
        display_name: editDisplayName.trim(),
        first_name: editFirstName.trim() || undefined,
        last_name: editLastName.trim() || undefined,
        phone: editPhone.trim() || undefined,
        gender: editGender.trim() || undefined,
        date_of_birth: editDob || undefined,
        bio: editBio.trim() || undefined,
      });
      setIsEditModalVisible(false);
      await refetchProfile();
      Alert.alert('Success', 'Personal information updated successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not save profile changes.';
      Alert.alert('Update Failed', msg);
    }
  };

  // ─── Save Playing Details ──────────────────────────────────────────────────
  const handleSavePlayingDetails = async () => {
    try {
      // Build clean structured bio tags preserving any custom user bio lines
      const tagsString = `Level: ${editSkillLevel} | Style: ${editPlayStyle} | Format: ${editPreferredFormat} | Hand: ${editDominantHand}`;
      
      // If user had existing custom bio text, preserve it
      const currentBio = profile?.bio || '';
      const customLines = currentBio
        .split('\n')
        .filter((line) => !line.includes('Level:') && !line.includes('Style:') && !line.includes('Format:'))
        .join('\n')
        .trim();

      const finalBio = customLines ? `${tagsString}\n${customLines}` : tagsString;

      await updateProfile({
        bio: finalBio,
      });

      setIsPlayingModalVisible(false);
      await refetchProfile();
      Alert.alert('Success', 'Playing details updated successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not save playing details.';
      Alert.alert('Update Failed', msg);
    }
  };

  // ─── Sign Out ─────────────────────────────────────────────────────────────
  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out of your player account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
            router.replace('/(auth)/login' as any);
          } catch {
            // Handled gracefully
          }
        },
      },
    ]);
  };

  return (
    <Screen style={styles.screenWrapper}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: getBottomNavPadding(insets.bottom) + 36 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || isProfileLoading}
            onRefresh={onRefresh}
            tintColor={Colors.brand.primary}
          />
        }
      >
        {/* ─── 1. TOP GREEN CURVED HEADER ─── */}
        <View style={[styles.headerContainer, { paddingTop: insets.top + 8 }]}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerTitleBlock}>
              <AppText style={styles.headerTitle}>My Profile</AppText>
              <AppText style={styles.headerSubtitle}>Personal identity & player information</AppText>
            </View>

            <TouchableOpacity
              style={styles.settingsIconBtn}
              onPress={() => router.push('/(player)/settings' as any)}
              activeOpacity={0.75}
              accessibilityLabel="Open Settings"
              accessibilityRole="button"
            >
              <SettingsIcon size={20} color="#FFFFFF" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── 2. OVERLAPPING AVATAR & IDENTITY SECTION ─── */}
        <View style={styles.identitySection}>
          <View style={styles.avatarWrapper}>
            <View style={styles.avatarCircle}>
              {resolvedPhotoUrl ? (
                <Image
                  source={{ uri: resolvedPhotoUrl }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <AppText style={styles.avatarInitials}>{initials}</AppText>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.cameraBadge}
              onPress={() => setIsPhotoMenuVisible(true)}
              activeOpacity={0.8}
              accessibilityLabel="Change profile photo"
              accessibilityRole="button"
            >
              {isUploadingPhoto || isDeletingPhoto ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Camera size={13} color="#FFFFFF" strokeWidth={2.2} />
              )}
            </TouchableOpacity>
          </View>

          <AppText style={styles.userName}>{displayName}</AppText>
          <AppText style={styles.userEmail}>{email}</AppText>

          {/* Player Role Badge */}
          <View style={styles.roleBadge}>
            <User size={12} color="#18794E" strokeWidth={2.2} />
            <AppText style={styles.roleBadgeText}>Player</AppText>
          </View>
        </View>

        {/* ─── 3. PERSONAL INFORMATION CARD ─── */}
        <View style={styles.contentPadding}>
          <Card style={styles.infoCard}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderTitleGroup}>
                <User size={18} color={Colors.brand.primary} strokeWidth={2.2} />
                <AppText style={styles.cardHeading}>Personal Information</AppText>
              </View>
              <TouchableOpacity
                style={styles.editActionBtn}
                onPress={() => setIsEditModalVisible(true)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Edit personal information"
              >
                <Edit3 size={13} color={Colors.brand.primary} strokeWidth={2.2} />
                <AppText style={styles.editActionText}>Edit</AppText>
              </TouchableOpacity>
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoFieldRow}>
              <AppText style={styles.infoFieldLabel}>Full Name</AppText>
              <AppText style={styles.infoFieldValue}>
                {profile?.first_name || profile?.last_name
                  ? `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()
                  : displayName}
              </AppText>
            </View>

            <View style={styles.infoRowDivider} />

            <View style={styles.infoFieldRow}>
              <AppText style={styles.infoFieldLabel}>Email Address</AppText>
              <View style={styles.emailValueRow}>
                <AppText style={styles.infoFieldValue}>{email}</AppText>
                <CheckCircle2 size={14} color={Colors.status.success} strokeWidth={2} />
              </View>
            </View>

            <View style={styles.infoRowDivider} />

            <View style={styles.infoFieldRow}>
              <AppText style={styles.infoFieldLabel}>Phone Number</AppText>
              <AppText style={styles.infoFieldValue}>
                {profile?.phone || 'Not provided'}
              </AppText>
            </View>

            <View style={styles.infoRowDivider} />

            <View style={styles.infoFieldRow}>
              <AppText style={styles.infoFieldLabel}>Gender</AppText>
              <AppText style={styles.infoFieldValue}>
                {profile?.gender
                  ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1)
                  : 'Not specified'}
              </AppText>
            </View>

            {profile?.bio ? (
              <>
                <View style={styles.infoRowDivider} />
                <View style={styles.infoFieldCol}>
                  <AppText style={styles.infoFieldLabel}>Bio</AppText>
                  <AppText style={styles.bioText}>{profile.bio}</AppText>
                </View>
              </>
            ) : null}
          </Card>

          {/* ─── 4. PLAYING DETAILS CARD ─── */}
          <Card style={styles.infoCard}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderTitleGroup}>
                <Trophy size={18} color={Colors.brand.primary} strokeWidth={2.2} />
                <AppText style={styles.cardHeading}>Playing Details</AppText>
              </View>
              <TouchableOpacity
                style={styles.editActionBtn}
                onPress={() => setIsPlayingModalVisible(true)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Edit playing details"
              >
                <Edit3 size={13} color={Colors.brand.primary} strokeWidth={2.2} />
                <AppText style={styles.editActionText}>Edit</AppText>
              </TouchableOpacity>
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoFieldRow}>
              <AppText style={styles.infoFieldLabel}>Player Level / Skill Rating</AppText>
              <Badge label={`${parsedPlayingDetails.level} DUPR`} variant="success" size="sm" />
            </View>

            <View style={styles.infoRowDivider} />

            <View style={styles.infoFieldRow}>
              <AppText style={styles.infoFieldLabel}>Play Style</AppText>
              <AppText style={styles.infoFieldValue}>{parsedPlayingDetails.style}</AppText>
            </View>

            <View style={styles.infoRowDivider} />

            <View style={styles.infoFieldRow}>
              <AppText style={styles.infoFieldLabel}>Preferred Format</AppText>
              <AppText style={styles.infoFieldValue}>{parsedPlayingDetails.format}</AppText>
            </View>

            <View style={styles.infoRowDivider} />

            <View style={styles.infoFieldRow}>
              <AppText style={styles.infoFieldLabel}>Dominant Hand</AppText>
              <AppText style={styles.infoFieldValue}>{parsedPlayingDetails.hand}</AppText>
            </View>
          </Card>

          {/* ─── 5. SUPPORT & LEGAL QUICK LINKS ─── */}
          <AppText style={styles.sectionHeaderTitle}>Support & Legal</AppText>
          <View style={styles.groupCard}>
            {/* Help & Support */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => router.push('/(player)/help-support' as any)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Help and Support"
            >
              <View style={styles.rowLeft}>
                <HelpCircle size={18} color="#293D38" strokeWidth={1.8} />
                <AppText style={styles.rowLabel}>Help & Support</AppText>
              </View>
              <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Terms of Service */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => router.push('/legal/player_terms' as any)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Player Terms of Service"
            >
              <View style={styles.rowLeft}>
                <FileText size={18} color="#293D38" strokeWidth={1.8} />
                <AppText style={styles.rowLabel}>Terms of Service</AppText>
              </View>
              <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Privacy Policy */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => router.push('/legal/privacy_policy' as any)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Privacy Policy"
            >
              <View style={styles.rowLeft}>
                <Shield size={18} color="#293D38" strokeWidth={1.8} />
                <AppText style={styles.rowLabel}>Privacy Policy</AppText>
              </View>
              <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* ─── 6. SIGN OUT BUTTON ─── */}
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={handleSignOut}
            activeOpacity={0.8}
            accessibilityLabel="Sign Out of Player Account"
            accessibilityRole="button"
          >
            <LogOut size={18} color="#DC2626" strokeWidth={2} />
            <AppText style={styles.signOutBtnText}>Sign Out</AppText>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ─── EDIT PERSONAL INFORMATION MODAL ─── */}
      <ModalSheet
        visible={isEditModalVisible}
        onClose={() => setIsEditModalVisible(false)}
        title="Edit Personal Information"
      >
        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
          <Input
            label="Display Name *"
            value={editDisplayName}
            onChangeText={setEditDisplayName}
            placeholder="Alex Johnson"
          />

          <View style={styles.formRow}>
            <View style={styles.formCol}>
              <Input
                label="First Name"
                value={editFirstName}
                onChangeText={setEditFirstName}
                placeholder="Alex"
              />
            </View>
            <View style={styles.formCol}>
              <Input
                label="Last Name"
                value={editLastName}
                onChangeText={setEditLastName}
                placeholder="Johnson"
              />
            </View>
          </View>

          <Input
            label="Phone Number"
            value={editPhone}
            onChangeText={setEditPhone}
            placeholder="+1 (555) 000-0000"
            keyboardType="phone-pad"
          />

          <Input
            label="Gender"
            value={editGender}
            onChangeText={setEditGender}
            placeholder="e.g. Male, Female, Other"
          />

          <DatePickerInput
            label="Date of Birth"
            value={editDob}
            onChange={setEditDob}
            placeholder="YYYY-MM-DD"
          />

          <Input
            label="Short Bio"
            value={editBio}
            onChangeText={setEditBio}
            placeholder="Tell fellow players about your pickleball journey."
            multiline
            numberOfLines={3}
          />

          <Button
            label="Save Changes"
            variant="primary"
            loading={isUpdatingProfile}
            onPress={handleSaveProfile}
            style={styles.modalSaveBtn}
          />
        </ScrollView>
      </ModalSheet>

      {/* ─── EDIT PLAYING DETAILS MODAL ─── */}
      <ModalSheet
        visible={isPlayingModalVisible}
        onClose={() => setIsPlayingModalVisible(false)}
        title="Edit Playing Details"
      >
        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
          {/* Skill Level Selection */}
          <AppText style={styles.modalSectionLabel}>Skill Rating / Level (DUPR)</AppText>
          <View style={styles.pillSelectionGrid}>
            {['2.0', '2.5', '3.0', '3.5', '4.0', '4.5', '5.0+'].map((level) => {
              const isSelected = editSkillLevel === level;
              return (
                <TouchableOpacity
                  key={level}
                  style={[styles.selectionPill, isSelected && styles.selectionPillActive]}
                  onPress={() => setEditSkillLevel(level)}
                  activeOpacity={0.75}
                >
                  <AppText
                    style={[
                      styles.selectionPillText,
                      isSelected && styles.selectionPillTextActive,
                    ]}
                  >
                    {level}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Play Style Selection */}
          <AppText style={styles.modalSectionLabel}>Play Style</AppText>
          <View style={styles.pillSelectionGrid}>
            {['Recreational', 'Competitive', 'Intermediate', 'Advanced'].map((style) => {
              const isSelected = editPlayStyle === style;
              return (
                <TouchableOpacity
                  key={style}
                  style={[styles.selectionPill, isSelected && styles.selectionPillActive]}
                  onPress={() => setEditPlayStyle(style)}
                  activeOpacity={0.75}
                >
                  <AppText
                    style={[
                      styles.selectionPillText,
                      isSelected && styles.selectionPillTextActive,
                    ]}
                  >
                    {style}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Preferred Format */}
          <AppText style={styles.modalSectionLabel}>Preferred Format</AppText>
          <View style={styles.pillSelectionGrid}>
            {['Doubles', 'Singles', 'Mixed Doubles', 'All Formats'].map((format) => {
              const isSelected = editPreferredFormat === format;
              return (
                <TouchableOpacity
                  key={format}
                  style={[styles.selectionPill, isSelected && styles.selectionPillActive]}
                  onPress={() => setEditPreferredFormat(format)}
                  activeOpacity={0.75}
                >
                  <AppText
                    style={[
                      styles.selectionPillText,
                      isSelected && styles.selectionPillTextActive,
                    ]}
                  >
                    {format}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Dominant Hand */}
          <AppText style={styles.modalSectionLabel}>Dominant Hand</AppText>
          <View style={styles.pillSelectionGrid}>
            {['Right-handed', 'Left-handed', 'Ambidextrous'].map((hand) => {
              const isSelected = editDominantHand === hand;
              return (
                <TouchableOpacity
                  key={hand}
                  style={[styles.selectionPill, isSelected && styles.selectionPillActive]}
                  onPress={() => setEditDominantHand(hand)}
                  activeOpacity={0.75}
                >
                  <AppText
                    style={[
                      styles.selectionPillText,
                      isSelected && styles.selectionPillTextActive,
                    ]}
                  >
                    {hand}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>

          <Button
            label="Save Playing Details"
            variant="primary"
            loading={isUpdatingProfile}
            onPress={handleSavePlayingDetails}
            style={styles.modalSaveBtn}
          />
        </ScrollView>
      </ModalSheet>

      {/* ─── PHOTO OPTIONS MODAL ─── */}
      <ModalSheet
        visible={isPhotoMenuVisible}
        onClose={() => setIsPhotoMenuVisible(false)}
        title="Profile Photo"
      >
        <View style={styles.photoMenuContent}>
          <TouchableOpacity
            style={styles.photoMenuOption}
            onPress={handlePickImage}
            activeOpacity={0.7}
          >
            <Camera size={18} color={Colors.brand.primary} />
            <AppText style={styles.photoMenuOptionText}>Choose from Photo Library</AppText>
          </TouchableOpacity>

          {Platform.OS !== 'web' && (
            <TouchableOpacity
              style={styles.photoMenuOption}
              onPress={handleTakePhoto}
              activeOpacity={0.7}
            >
              <Camera size={18} color={Colors.brand.primary} />
              <AppText style={styles.photoMenuOptionText}>Take Photo</AppText>
            </TouchableOpacity>
          )}

          {resolvedPhotoUrl ? (
            <TouchableOpacity
              style={[styles.photoMenuOption, styles.photoMenuOptionDestructive]}
              onPress={handleDeletePhoto}
              activeOpacity={0.7}
            >
              <Trash2 size={18} color={Colors.status.error} />
              <AppText style={styles.photoMenuOptionDestructiveText}>Remove Photo</AppText>
            </TouchableOpacity>
          ) : null}
        </View>
      </ModalSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: '#F3F8F5',
  },
  container: {
    gap: 0,
  },

  // 1. Top Green Curved Header
  headerContainer: {
    backgroundColor: '#176B57',
    paddingHorizontal: 20,
    paddingBottom: 55,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
  },
  headerTitleBlock: {
    flex: 1,
    gap: 3,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 26,
  },
  headerSubtitle: {
    fontSize: 12.5,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '400',
  },
  settingsIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 2. Identity Section
  identitySection: {
    alignItems: 'center',
    marginTop: -46,
    paddingHorizontal: 16,
    gap: 4,
    marginBottom: 8,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 4,
  },
  avatarCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#D1FAE5',
    borderWidth: 3.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 34,
    fontWeight: '700',
    color: '#065F46',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#176B57',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#102B2A',
    textAlign: 'center',
  },
  userEmail: {
    fontSize: 12.5,
    color: '#667776',
    textAlign: 'center',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    marginTop: 4,
    backgroundColor: '#E5F6EC',
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: '#18794E',
  },

  // 3. Content Area
  contentPadding: {
    paddingHorizontal: 16,
    gap: 14,
    marginTop: 6,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    ...Shadows.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  cardHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  editActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.brand.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  editActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.brand.primary,
  },
  infoDivider: {
    height: 1,
    backgroundColor: Colors.surface.borderLight,
    marginVertical: Spacing.sm,
  },
  infoFieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  infoFieldCol: {
    paddingVertical: 6,
    gap: 4,
  },
  infoRowDivider: {
    height: 1,
    backgroundColor: Colors.surface.borderLight,
    marginVertical: 2,
  },
  infoFieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.text.secondary,
  },
  infoFieldValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  emailValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bioText: {
    fontSize: 12.5,
    color: Colors.text.primary,
    lineHeight: 18,
  },

  // Support & Legal Group Card
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#667776',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
    marginLeft: 4,
  },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    ...Shadows.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2A4540',
  },
  rowDivider: {
    height: 1,
    backgroundColor: Colors.surface.borderLight,
    marginHorizontal: 16,
  },

  // Sign Out Button
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: Radius.lg,
    paddingVertical: 13,
    marginTop: 4,
  },
  signOutBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
  },

  // Modal Styles
  modalScroll: {
    maxHeight: 480,
  },
  modalContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  formRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  formCol: {
    flex: 1,
  },
  modalSaveBtn: {
    marginTop: Spacing.sm,
  },
  modalSectionLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 6,
    marginBottom: 4,
  },
  pillSelectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  selectionPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.background.primary,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  selectionPillActive: {
    backgroundColor: Colors.brand.primaryLight,
    borderColor: '#C3E7D2',
  },
  selectionPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  selectionPillTextActive: {
    color: Colors.brand.primary,
    fontWeight: '700',
  },

  // Photo Menu
  photoMenuContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  photoMenuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.background.primary,
  },
  photoMenuOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  photoMenuOptionDestructive: {
    backgroundColor: '#FEF2F2',
  },
  photoMenuOptionDestructiveText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.status.error,
  },
});
