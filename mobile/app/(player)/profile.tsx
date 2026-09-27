/**
 * Aught2 Pickleball — Player Profile Screen
 *
 * Implements the exact Player Profile UI matching the reference design:
 *   - Pale mint background (#F8FAF9)
 *   - Clean top header: Hamburger menu icon + bold "Profile" title
 *   - Hero Banner: Large dark green card with pickleball court background image,
 *     large circular profile picture (with initials fallback), overlapping camera icon,
 *     player display name, registered email, "● Active" status badge, "Edit Profile" button,
 *     and player bio
 *   - Statistics Card: 4 evenly spaced columns (Player Level, Play Style, Location, Member Since)
 *     with pale green circular icons and vertical dividers
 *   - Settings List: 5 rounded white cards (Personal Information, Playing Details, Account Settings,
 *     Help & Support, and Sign Out)
 *   - Photo upload, preview, and removal with persistent backend storage
 *   - Immediate reflection in both Player Profile and Club-Side Members
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  Calendar,
  Camera,
  ChevronRight,
  LogOut,
  MapPin,
  Menu,
  ShieldCheck,
  SquarePen,
  Star,
  Trash2,
  TrendingUp,
  User,
  Users,
  X,
} from 'lucide-react-native';

import { AppText, ModalSheet } from '@/components';
import { API_ENDPOINTS } from '@/constants';
import { useAuth, usePlayerProfile } from '@/hooks';
import { useDrawerStore } from '@/navigation';

export default function PlayerProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const {
    profile,
    hasProfile,
    isLoading,
    refetch,
    updateProfile,
    isUpdatingProfile,
    uploadPhoto,
    isUploadingPhoto,
    deletePhoto,
    isDeletingPhoto,
  } = usePlayerProfile();

  // ─── Modal States ──────────────────────────────────────────────────────────
  const [personalInfoModalVisible, setPersonalInfoModalVisible] = useState(false);
  const [playingDetailsModalVisible, setPlayingDetailsModalVisible] = useState(false);
  const [accountSettingsModalVisible, setAccountSettingsModalVisible] = useState(false);
  const [helpSupportModalVisible, setHelpSupportModalVisible] = useState(false);
  const [photoOptionsModalVisible, setPhotoOptionsModalVisible] = useState(false);
  const [previewPhotoUri, setPreviewPhotoUri] = useState<string | null>(null);
  const [previewPhotoBase64, setPreviewPhotoBase64] = useState<string | null>(null);

  // ─── Form Edit States ──────────────────────────────────────────────────────
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editLocation, setEditLocation] = useState('Tirupati, AP');
  const [editSkillLevel, setEditSkillLevel] = useState('3.5');
  const [editPlayStyle, setEditPlayStyle] = useState('Recreational');
  const [editError, setEditError] = useState<string | null>(null);

  // ─── Derived Player Data ───────────────────────────────────────────────────
  const displayName = profile?.display_name || user?.full_name || 'Player';
  const email = user?.email || '';
  const bio = profile?.bio || '';

  // Player Initials for avatar fallback (e.g. "Player Pete" -> "PP")
  const initials = useMemo(() => {
    if (!displayName) return 'PP';
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return displayName.slice(0, 2).toUpperCase();
  }, [displayName]);

  // Resolve photo URL (relative backend /uploads/... or absolute URL)
  const resolvedPhotoUrl = useMemo(() => {
    if (!profile?.profile_image_url) return null;
    const url = profile.profile_image_url.trim();
    if (!url) return null;
    if (url.startsWith('http') || url.startsWith('data:')) {
      return url;
    }
    return `${API_ENDPOINTS.BASE}${url.startsWith('/') ? '' : '/'}${url}`;
  }, [profile?.profile_image_url]);

  // Parse or format dynamic stats
  const playerLevel = useMemo(() => {
    if (editSkillLevel) return editSkillLevel;
    const match = bio.match(/\b([1-5]\.[0-5])\b/);
    return match ? match[1] : '3.5';
  }, [bio, editSkillLevel]);

  const playStyle = useMemo(() => {
    if (editPlayStyle) return editPlayStyle;
    const match = bio.match(/(Recreational|Competitive|Advanced|Intermediate|Beginner)/i);
    return match ? match[1] : 'Recreational';
  }, [bio, editPlayStyle]);

  const memberSince = useMemo(() => {
    const rawDate = profile?.created_at || user?.created_at;
    if (!rawDate) return 'Sep 2026';
    try {
      const d = new Date(rawDate);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch {
      return 'Sep 2026';
    }
  }, [profile?.created_at, user?.created_at]);

  // ─── Image Picker Handling ─────────────────────────────────────────────────

  const handlePickFromLibrary = async () => {
    setPhotoOptionsModalVisible(false);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Needed',
          'Please grant media library access to upload a profile photo.'
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
        setPreviewPhotoUri(asset.uri);
        const mime = asset.mimeType || 'image/jpeg';
        const b64 = asset.base64 ? `data:${mime};base64,${asset.base64}` : asset.uri;
        setPreviewPhotoBase64(b64);
      }
    } catch (err) {
      Alert.alert('Error', 'Unable to pick image. Please try again.');
    }
  };

  const handleTakePhoto = async () => {
    setPhotoOptionsModalVisible(false);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Needed',
          'Please grant camera access to take a profile photo.'
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
        setPreviewPhotoUri(asset.uri);
        const mime = asset.mimeType || 'image/jpeg';
        const b64 = asset.base64 ? `data:${mime};base64,${asset.base64}` : asset.uri;
        setPreviewPhotoBase64(b64);
      }
    } catch (err) {
      Alert.alert('Error', 'Unable to open camera. Please try again.');
    }
  };

  const handleConfirmPhotoSave = async () => {
    if (!previewPhotoBase64) return;
    try {
      await uploadPhoto(previewPhotoBase64);
      setPreviewPhotoUri(null);
      setPreviewPhotoBase64(null);
      Alert.alert('Success', 'Profile photo updated successfully!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to upload photo';
      Alert.alert('Upload Failed', msg);
    }
  };

  const handleRemovePhoto = async () => {
    setPhotoOptionsModalVisible(false);
    Alert.alert(
      'Remove Photo',
      'Are you sure you want to remove your profile photo and revert to the default avatar?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePhoto();
              Alert.alert('Removed', 'Profile photo reverted to default avatar.');
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to remove photo';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
  };

  // ─── Personal Info Editing ─────────────────────────────────────────────────

  const openPersonalInfoModal = () => {
    setEditDisplayName(profile?.display_name || user?.full_name || '');
    setEditFirstName(profile?.first_name || '');
    setEditLastName(profile?.last_name || '');
    setEditPhone(profile?.phone || '');
    setEditBio(profile?.bio || '');
    setEditError(null);
    setPersonalInfoModalVisible(true);
  };

  const handleSavePersonalInfo = async () => {
    const trimmed = editDisplayName.trim();
    if (!trimmed) {
      setEditError('Display name is required.');
      return;
    }

    try {
      await updateProfile({
        display_name: trimmed,
        first_name: editFirstName.trim() || null,
        last_name: editLastName.trim() || null,
        phone: editPhone.trim() || null,
        bio: editBio.trim() || null,
      });
      setPersonalInfoModalVisible(false);
      Alert.alert('Success', 'Personal information updated successfully!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save changes';
      setEditError(msg);
    }
  };

  // ─── Playing Details Editing ───────────────────────────────────────────────

  const openPlayingDetailsModal = () => {
    setPlayingDetailsModalVisible(true);
  };

  const handleSavePlayingDetails = async () => {
    try {
      // Keep bio aligned with playing level and style if bio is standard
      let updatedBio = editBio || bio;
      if (updatedBio.includes('player')) {
        updatedBio = `${editPlayStyle} ${editSkillLevel} player looking for weekend tournaments.`;
      }
      await updateProfile({
        bio: updatedBio,
      });
      setPlayingDetailsModalVisible(false);
      Alert.alert('Success', 'Playing details updated successfully!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save details';
      Alert.alert('Error', msg);
    }
  };

  // ─── Sign Out ──────────────────────────────────────────────────────────────

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of Aught2 Pickleball?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* ─── Page Header ───────────────────────────────────────────────────── */}
      <View style={[styles.headerRow, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => useDrawerStore.getState().openDrawer()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Menu size={24} color="#0F2922" strokeWidth={2.4} />
        </TouchableOpacity>
        <AppText style={styles.headerTitle}>Profile</AppText>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => refetch()}
            tintColor="#114D3F"
          />
        }
      >
        {/* ─── Hero Banner Card ────────────────────────────────────────────── */}
        <View style={styles.heroCard}>
          {/* Pickleball Court Background Image */}
          <Image
            source={require('../../assets/profile_hero_bg.jpg')}
            style={styles.heroCourtBg}
            resizeMode="cover"
          />
          {/* Dark Green Gradient Tint Overlay */}
          <View style={styles.heroOverlay} />

          {/* Edit Profile Button at Top-Right */}
          <TouchableOpacity
            style={styles.editProfileBtn}
            onPress={openPersonalInfoModal}
            activeOpacity={0.85}
          >
            <SquarePen size={13} color="#0F2922" strokeWidth={2.2} style={{ marginRight: 5 }} />
            <AppText style={styles.editProfileBtnText}>Edit Profile</AppText>
          </TouchableOpacity>

          {/* Top Banner Row: Avatar + Name/Email/Status */}
          <View style={styles.heroTopRow}>
            {/* Avatar with Camera Icon */}
            <View style={styles.avatarWrapper}>
              {resolvedPhotoUrl ? (
                <Image
                  source={{ uri: resolvedPhotoUrl }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.initialsAvatar}>
                  <AppText style={styles.initialsText}>{initials}</AppText>
                </View>
              )}

              {/* Overlapping Camera Button */}
              <TouchableOpacity
                style={styles.cameraIconBtn}
                onPress={() => setPhotoOptionsModalVisible(true)}
                activeOpacity={0.85}
              >
                <Camera size={13} color="#FFFFFF" strokeWidth={2.2} />
              </TouchableOpacity>
            </View>

            {/* Player Details */}
            <View style={styles.heroInfoColumn}>
              <AppText style={styles.heroPlayerName} numberOfLines={1}>
                {displayName}
              </AppText>
              <AppText style={styles.heroPlayerEmail} numberOfLines={1}>
                {email}
              </AppText>

              {/* Active Status Badge */}
              <View style={styles.statusPill}>
                <View style={styles.statusDot} />
                <AppText style={styles.statusPillText}>Active</AppText>
              </View>
            </View>
          </View>

          {/* Player Bio */}
          <AppText style={styles.heroBioText}>
            {bio}
          </AppText>
        </View>

        {/* ─── Player Statistics Card ──────────────────────────────────────── */}
        <View style={styles.statsCard}>
          {/* Column 1: Player Level */}
          <View style={styles.statColumn}>
            <View style={styles.statIconCircle}>
              <Users size={17} color="#114D3F" strokeWidth={2} />
            </View>
            <AppText style={styles.statLabel}>Player Level</AppText>
            <AppText style={styles.statValue}>{playerLevel}</AppText>
          </View>

          <View style={styles.statDivider} />

          {/* Column 2: Play Style */}
          <View style={styles.statColumn}>
            <View style={styles.statIconCircle}>
              <TrendingUp size={17} color="#114D3F" strokeWidth={2.2} />
            </View>
            <AppText style={styles.statLabel}>Play Style</AppText>
            <AppText style={styles.statValue} numberOfLines={1}>
              {playStyle}
            </AppText>
          </View>

          <View style={styles.statDivider} />

          {/* Column 3: Location */}
          <View style={styles.statColumn}>
            <View style={styles.statIconCircle}>
              <MapPin size={17} color="#114D3F" strokeWidth={2} />
            </View>
            <AppText style={styles.statLabel}>Location</AppText>
            <AppText style={styles.statValue} numberOfLines={1}>
              {editLocation}
            </AppText>
          </View>

          <View style={styles.statDivider} />

          {/* Column 4: Member Since */}
          <View style={styles.statColumn}>
            <View style={styles.statIconCircle}>
              <Calendar size={17} color="#114D3F" strokeWidth={2} />
            </View>
            <AppText style={styles.statLabel}>Member Since</AppText>
            <AppText style={styles.statValue} numberOfLines={1}>
              {memberSince}
            </AppText>
          </View>
        </View>

        {/* ─── Profile Settings List ───────────────────────────────────────── */}
        <View style={styles.settingsList}>
          {/* 1. Personal Information */}
          <TouchableOpacity
            style={styles.settingCard}
            onPress={openPersonalInfoModal}
            activeOpacity={0.7}
          >
            <View style={styles.settingIconCircle}>
              <User size={20} color="#114D3F" strokeWidth={2} />
            </View>
            <View style={styles.settingTextColumn}>
              <AppText style={styles.settingTitle}>Personal Information</AppText>
              <AppText style={styles.settingDescription}>
                Name, email, bio, profile photo
              </AppText>
            </View>
            <ChevronRight size={18} color="#94A3B8" strokeWidth={2.2} />
          </TouchableOpacity>

          {/* 2. Playing Details */}
          <TouchableOpacity
            style={styles.settingCard}
            onPress={openPlayingDetailsModal}
            activeOpacity={0.7}
          >
            <View style={styles.settingIconCircle}>
              <Star size={20} color="#114D3F" strokeWidth={2} />
            </View>
            <View style={styles.settingTextColumn}>
              <AppText style={styles.settingTitle}>Playing Details</AppText>
              <AppText style={styles.settingDescription}>
                Skill level, play style, preferences
              </AppText>
            </View>
            <ChevronRight size={18} color="#94A3B8" strokeWidth={2.2} />
          </TouchableOpacity>

          {/* 3. Account Settings */}
          <TouchableOpacity
            style={styles.settingCard}
            onPress={() => setAccountSettingsModalVisible(true)}
            activeOpacity={0.7}
          >
            <View style={styles.settingIconCircle}>
              <Users size={20} color="#114D3F" strokeWidth={2} />
            </View>
            <View style={styles.settingTextColumn}>
              <AppText style={styles.settingTitle}>Account Settings</AppText>
              <AppText style={styles.settingDescription}>
                Password, notifications, privacy
              </AppText>
            </View>
            <ChevronRight size={18} color="#94A3B8" strokeWidth={2.2} />
          </TouchableOpacity>

          {/* 4. Help & Support */}
          <TouchableOpacity
            style={styles.settingCard}
            onPress={() => setHelpSupportModalVisible(true)}
            activeOpacity={0.7}
          >
            <View style={styles.settingIconCircle}>
              <ShieldCheck size={20} color="#114D3F" strokeWidth={2} />
            </View>
            <View style={styles.settingTextColumn}>
              <AppText style={styles.settingTitle}>Help & Support</AppText>
              <AppText style={styles.settingDescription}>
                Get help, FAQs, contact us
              </AppText>
            </View>
            <ChevronRight size={18} color="#94A3B8" strokeWidth={2.2} />
          </TouchableOpacity>

          {/* 5. Sign Out */}
          <TouchableOpacity
            style={[styles.settingCard, styles.signOutCard]}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <View style={[styles.settingIconCircle, styles.signOutIconCircle]}>
              <LogOut size={20} color="#DC2626" strokeWidth={2} />
            </View>
            <View style={styles.settingTextColumn}>
              <AppText style={styles.signOutTitle}>Sign Out</AppText>
            </View>
            <ChevronRight size={18} color="#DC2626" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ─── Photo Options Modal ────────────────────────────────────────────── */}
      <Modal
        visible={photoOptionsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoOptionsModalVisible(false)}
      >
        <Pressable
          style={styles.dialogOverlay}
          onPress={() => setPhotoOptionsModalVisible(false)}
        >
          <Pressable style={styles.dialogCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.dialogHeader}>
              <AppText style={styles.dialogTitle}>Profile Photo</AppText>
              <TouchableOpacity
                onPress={() => setPhotoOptionsModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#647570" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.dialogOptionRow}
              onPress={handlePickFromLibrary}
              activeOpacity={0.7}
            >
              <View style={styles.dialogOptionIcon}>
                <User size={18} color="#114D3F" />
              </View>
              <AppText style={styles.dialogOptionText}>Choose from Gallery</AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dialogOptionRow}
              onPress={handleTakePhoto}
              activeOpacity={0.7}
            >
              <View style={styles.dialogOptionIcon}>
                <Camera size={18} color="#114D3F" />
              </View>
              <AppText style={styles.dialogOptionText}>Take Photo</AppText>
            </TouchableOpacity>

            {Boolean(profile?.profile_image_url) && (
              <TouchableOpacity
                style={styles.dialogOptionRow}
                onPress={handleRemovePhoto}
                activeOpacity={0.7}
              >
                <View style={[styles.dialogOptionIcon, { backgroundColor: '#FEE2E2' }]}>
                  <Trash2 size={18} color="#DC2626" />
                </View>
                <AppText style={[styles.dialogOptionText, { color: '#DC2626' }]}>
                  Remove Photo
                </AppText>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.dialogCancelBtn}
              onPress={() => setPhotoOptionsModalVisible(false)}
              activeOpacity={0.7}
            >
              <AppText style={styles.dialogCancelBtnText}>Cancel</AppText>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Photo Preview & Confirmation Modal ─────────────────────────────── */}
      <Modal
        visible={Boolean(previewPhotoUri)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewPhotoUri(null)}
      >
        <View style={styles.dialogOverlay}>
          <View style={styles.previewCard}>
            <AppText style={styles.dialogTitle}>Confirm Profile Photo</AppText>
            <AppText style={styles.previewSubtitle}>
              This photo will be displayed on your player profile and club member lists.
            </AppText>

            {previewPhotoUri && (
              <View style={styles.previewImageWrapper}>
                <Image
                  source={{ uri: previewPhotoUri }}
                  style={styles.previewImage}
                  resizeMode="cover"
                />
              </View>
            )}

            <View style={styles.previewActionRow}>
              <TouchableOpacity
                style={styles.previewCancelBtn}
                onPress={() => {
                  setPreviewPhotoUri(null);
                  setPreviewPhotoBase64(null);
                }}
                disabled={isUploadingPhoto}
              >
                <AppText style={styles.previewCancelBtnText}>Cancel</AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.previewSaveBtn}
                onPress={handleConfirmPhotoSave}
                disabled={isUploadingPhoto}
              >
                {isUploadingPhoto ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <AppText style={styles.previewSaveBtnText}>Save Photo</AppText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Edit Personal Information Modal ────────────────────────────────── */}
      <ModalSheet
        visible={personalInfoModalVisible}
        onClose={() => setPersonalInfoModalVisible(false)}
        title="Personal Information"
      >
        <ScrollView
          style={styles.modalScroll}
          contentContainerStyle={styles.modalScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {editError && (
            <View style={styles.modalErrorBox}>
              <AppText style={styles.modalErrorText}>{editError}</AppText>
            </View>
          )}

          {/* Photo Section in Modal */}
          <View style={styles.modalPhotoRow}>
            <View style={styles.modalAvatarWrapper}>
              {resolvedPhotoUrl ? (
                <Image
                  source={{ uri: resolvedPhotoUrl }}
                  style={styles.modalAvatarImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.initialsAvatar, { width: 64, height: 64, borderRadius: 32 }]}>
                  <AppText style={[styles.initialsText, { fontSize: 22 }]}>{initials}</AppText>
                </View>
              )}
            </View>
            <View style={{ marginLeft: 14 }}>
              <AppText style={styles.modalPhotoLabel}>Profile Picture</AppText>
              <TouchableOpacity
                style={styles.changePhotoBtn}
                onPress={() => {
                  setPhotoOptionsModalVisible(true);
                }}
                activeOpacity={0.8}
              >
                <AppText style={styles.changePhotoBtnText}>Change Photo</AppText>
              </TouchableOpacity>
            </View>
          </View>

          {/* Form Fields */}
          <View style={styles.formGroup}>
            <AppText style={styles.formLabel}>Display Name *</AppText>
            <TextInput
              style={styles.formInput}
              value={editDisplayName}
              onChangeText={setEditDisplayName}
              placeholder="e.g. Player Pete"
              placeholderTextColor="#8C9BA5"
            />
          </View>

          <View style={styles.formRow}>
            <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
              <AppText style={styles.formLabel}>First Name</AppText>
              <TextInput
                style={styles.formInput}
                value={editFirstName}
                onChangeText={setEditFirstName}
                placeholder="First"
                placeholderTextColor="#8C9BA5"
              />
            </View>

            <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
              <AppText style={styles.formLabel}>Last Name</AppText>
              <TextInput
                style={styles.formInput}
                value={editLastName}
                onChangeText={setEditLastName}
                placeholder="Last"
                placeholderTextColor="#8C9BA5"
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <AppText style={styles.formLabel}>Email Address</AppText>
            <TextInput
              style={[styles.formInput, styles.formInputDisabled]}
              value={email}
              editable={false}
            />
            <AppText style={styles.formHint}>Email is linked to your registered login account.</AppText>
          </View>

          <View style={styles.formGroup}>
            <AppText style={styles.formLabel}>Phone Number</AppText>
            <TextInput
              style={styles.formInput}
              value={editPhone}
              onChangeText={setEditPhone}
              placeholder="+91 98765 43210"
              placeholderTextColor="#8C9BA5"
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.formGroup}>
            <AppText style={styles.formLabel}>Bio</AppText>
            <TextInput
              style={[styles.formInput, styles.bioInput]}
              value={editBio}
              onChangeText={setEditBio}
              placeholder="Tell other players about your pickleball skill and tournament goals..."
              placeholderTextColor="#8C9BA5"
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.modalActionRow}>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setPersonalInfoModalVisible(false)}
            >
              <AppText style={styles.modalCancelBtnText}>Cancel</AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalSaveBtn}
              onPress={handleSavePersonalInfo}
              disabled={isUpdatingProfile}
            >
              {isUpdatingProfile ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <AppText style={styles.modalSaveBtnText}>Save Changes</AppText>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </ModalSheet>

      {/* ─── Edit Playing Details Modal ─────────────────────────────────────── */}
      <ModalSheet
        visible={playingDetailsModalVisible}
        onClose={() => setPlayingDetailsModalVisible(false)}
        title="Playing Details"
      >
        <ScrollView
          style={styles.modalScroll}
          contentContainerStyle={styles.modalScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <AppText style={styles.modalSectionDesc}>
            Configure your skill level and play style to help match you with suitable partners and tournaments.
          </AppText>

          {/* Skill Level Selection */}
          <View style={styles.formGroup}>
            <AppText style={styles.formLabel}>Skill Level (DUPR / Rating)</AppText>
            <View style={styles.ratingGrid}>
              {['2.5', '3.0', '3.5', '4.0', '4.5', '5.0'].map((rating) => (
                <TouchableOpacity
                  key={rating}
                  style={[
                    styles.ratingPill,
                    editSkillLevel === rating && styles.ratingPillActive,
                  ]}
                  onPress={() => setEditSkillLevel(rating)}
                  activeOpacity={0.8}
                >
                  <AppText
                    style={[
                      styles.ratingPillText,
                      editSkillLevel === rating && styles.ratingPillTextActive,
                    ]}
                  >
                    {rating}
                  </AppText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Play Style Selection */}
          <View style={styles.formGroup}>
            <AppText style={styles.formLabel}>Play Style</AppText>
            <View style={styles.ratingGrid}>
              {['Recreational', 'Competitive', 'Tournament', 'Social'].map((style) => (
                <TouchableOpacity
                  key={style}
                  style={[
                    styles.ratingPill,
                    editPlayStyle === style && styles.ratingPillActive,
                  ]}
                  onPress={() => setEditPlayStyle(style)}
                  activeOpacity={0.8}
                >
                  <AppText
                    style={[
                      styles.ratingPillText,
                      editPlayStyle === style && styles.ratingPillTextActive,
                    ]}
                  >
                    {style}
                  </AppText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Saved Location */}
          <View style={styles.formGroup}>
            <AppText style={styles.formLabel}>Primary Location</AppText>
            <TextInput
              style={styles.formInput}
              value={editLocation}
              onChangeText={setEditLocation}
              placeholder="e.g. Tirupati, AP"
              placeholderTextColor="#8C9BA5"
            />
          </View>

          <View style={styles.modalActionRow}>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setPlayingDetailsModalVisible(false)}
            >
              <AppText style={styles.modalCancelBtnText}>Cancel</AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalSaveBtn}
              onPress={handleSavePlayingDetails}
              disabled={isUpdatingProfile}
            >
              {isUpdatingProfile ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <AppText style={styles.modalSaveBtnText}>Save Details</AppText>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </ModalSheet>

      {/* ─── Account Settings Modal ─────────────────────────────────────────── */}
      <ModalSheet
        visible={accountSettingsModalVisible}
        onClose={() => setAccountSettingsModalVisible(false)}
        title="Account Settings"
      >
        <View style={styles.infoModalContent}>
          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Account Email</AppText>
            <AppText style={styles.infoValue}>{email}</AppText>
          </View>

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Account Status</AppText>
            <View style={[styles.statusPill, { backgroundColor: '#E8F5E9' }]}>
              <View style={styles.statusDot} />
              <AppText style={[styles.statusPillText, { color: '#166534' }]}>Active Member</AppText>
            </View>
          </View>

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Member Since</AppText>
            <AppText style={styles.infoValue}>{memberSince}</AppText>
          </View>

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Notifications</AppText>
            <AppText style={styles.infoValue}>Booking & Match Alerts (Enabled)</AppText>
          </View>

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Privacy</AppText>
            <AppText style={styles.infoValue}>Visible to Club Members</AppText>
          </View>

          <TouchableOpacity
            style={[styles.modalSaveBtn, { marginTop: 24, width: '100%' }]}
            onPress={() => setAccountSettingsModalVisible(false)}
          >
            <AppText style={styles.modalSaveBtnText}>Close</AppText>
          </TouchableOpacity>
        </View>
      </ModalSheet>

      {/* ─── Help & Support Modal ───────────────────────────────────────────── */}
      <ModalSheet
        visible={helpSupportModalVisible}
        onClose={() => setHelpSupportModalVisible(false)}
        title="Help & Support"
      >
        <ScrollView style={styles.infoModalContent} showsVerticalScrollIndicator={false}>
          <AppText style={styles.helpHeader}>Aught2 Pickleball Support</AppText>
          <AppText style={styles.helpText}>
            Need assistance with court bookings, tournament registrations, or membership plans?
          </AppText>

          <View style={styles.faqCard}>
            <AppText style={styles.faqQuestion}>How do I book a court?</AppText>
            <AppText style={styles.faqAnswer}>
              Tap the center '+' button or visit Courts in the navigation bar to select a date, time slot, and court.
            </AppText>
          </View>

          <View style={styles.faqCard}>
            <AppText style={styles.faqQuestion}>How do I join tournaments and events?</AppText>
            <AppText style={styles.faqAnswer}>
              Go to the Events tab to discover upcoming club tournaments, clinics, and open play sessions.
            </AppText>
          </View>

          <View style={styles.faqCard}>
            <AppText style={styles.faqQuestion}>Contact Club Desk</AppText>
            <AppText style={styles.faqAnswer}>
              Email: support@aught2pickleball.com{'\n'}Phone: +91 98765 43210
            </AppText>
          </View>

          <TouchableOpacity
            style={[styles.modalSaveBtn, { marginTop: 20, marginBottom: 20, width: '100%' }]}
            onPress={() => setHelpSupportModalVisible(false)}
          >
            <AppText style={styles.modalSaveBtnText}>Close</AppText>
          </TouchableOpacity>
        </ScrollView>
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: '#F8FAF9',
  },
  menuButton: {
    padding: 4,
    marginRight: 14,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F2922',
    letterSpacing: -0.3,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },

  // ─── Hero Banner Card ──────────────────────────────────────────────────────
  heroCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 14,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#092B21',
    padding: 18,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  heroCourtBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(9, 43, 33, 0.82)',
  },
  editProfileBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  editProfileBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F2922',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  avatarWrapper: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: '#C6F6D5',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
  },
  initialsAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#14532D',
    letterSpacing: -0.5,
  },
  cameraIconBtn: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0F2922',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
  },
  heroInfoColumn: {
    flex: 1,
    marginLeft: 16,
    paddingRight: 60, // ensure room for Edit Profile button
  },
  heroPlayerName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  heroPlayerEmail: {
    fontSize: 13,
    color: '#A7F3D0',
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.22)',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 12,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
    marginRight: 6,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#A7F3D0',
  },
  heroBioText: {
    marginTop: 14,
    fontSize: 13.5,
    color: '#E2E8F0',
    lineHeight: 19,
    letterSpacing: -0.1,
  },

  // ─── Statistics Card ───────────────────────────────────────────────────────
  statsCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDEA',
    paddingVertical: 14,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  statColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  statIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 11,
    color: '#647570',
    textAlign: 'center',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F2922',
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#E8EDEA',
  },

  // ─── Profile Settings List ─────────────────────────────────────────────────
  settingsList: {
    paddingHorizontal: 16,
    gap: 10,
  },
  settingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8EDEA',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  settingIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  settingTextColumn: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F2922',
  },
  settingDescription: {
    fontSize: 12.5,
    color: '#647570',
    marginTop: 2,
  },
  signOutCard: {
    borderColor: '#FEE2E2',
    marginTop: 4,
  },
  signOutIconCircle: {
    backgroundColor: '#FEE2E2',
  },
  signOutTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#DC2626',
  },

  // ─── Dialogs & Modals ──────────────────────────────────────────────────────
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  dialogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F2922',
  },
  dialogOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F3F1',
  },
  dialogOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  dialogOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F2922',
  },
  dialogCancelBtn: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#F0F3F1',
    borderRadius: 12,
  },
  dialogCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#647570',
  },

  // Preview Modal
  previewCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
  },
  previewSubtitle: {
    fontSize: 13,
    color: '#647570',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  previewImageWrapper: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
    borderColor: '#114D3F',
    overflow: 'hidden',
    marginBottom: 20,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewActionRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  previewCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F0F3F1',
    alignItems: 'center',
  },
  previewCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#647570',
  },
  previewSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#114D3F',
    alignItems: 'center',
  },
  previewSaveBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Modal Sheet Form
  modalScroll: {
    maxHeight: 520,
  },
  modalScrollContent: {
    paddingBottom: 24,
  },
  modalErrorBox: {
    backgroundColor: '#FEE2E2',
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  modalErrorText: {
    fontSize: 13,
    color: '#DC2626',
  },
  modalPhotoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EDEA',
  },
  modalAvatarWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#C6F6D5',
    overflow: 'hidden',
    backgroundColor: '#D1FAE5',
  },
  modalAvatarImage: {
    width: '100%',
    height: '100%',
  },
  modalPhotoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F2922',
    marginBottom: 4,
  },
  changePhotoBtn: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  changePhotoBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#114D3F',
  },
  formGroup: {
    marginBottom: 14,
  },
  formRow: {
    flexDirection: 'row',
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F2922',
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDEA',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F2922',
  },
  formInputDisabled: {
    backgroundColor: '#F8FAF9',
    color: '#8C9BA5',
  },
  formHint: {
    fontSize: 11.5,
    color: '#8C9BA5',
    marginTop: 4,
  },
  bioInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F0F3F1',
    alignItems: 'center',
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#647570',
  },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#114D3F',
    alignItems: 'center',
  },
  modalSaveBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Playing Details Section
  modalSectionDesc: {
    fontSize: 13,
    color: '#647570',
    lineHeight: 18,
    marginBottom: 16,
  },
  ratingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ratingPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F3F1',
    borderWidth: 1,
    borderColor: '#E8EDEA',
  },
  ratingPillActive: {
    backgroundColor: '#114D3F',
    borderColor: '#114D3F',
  },
  ratingPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#647570',
  },
  ratingPillTextActive: {
    color: '#FFFFFF',
  },

  // Info Modal (Account Settings & Help)
  infoModalContent: {
    paddingBottom: 24,
  },
  infoRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F3F1',
  },
  infoLabel: {
    fontSize: 12,
    color: '#647570',
    marginBottom: 3,
  },
  infoValue: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#0F2922',
  },
  helpHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F2922',
    marginBottom: 4,
  },
  helpText: {
    fontSize: 13,
    color: '#647570',
    lineHeight: 18,
    marginBottom: 16,
  },
  faqCard: {
    backgroundColor: '#F8FAF9',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E8EDEA',
  },
  faqQuestion: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F2922',
    marginBottom: 4,
  },
  faqAnswer: {
    fontSize: 12.5,
    color: '#647570',
    lineHeight: 18,
  },
});
