/**
 * Aught2 Pickleball — Club Staff Profile Screen
 *
 * Personal identity and contact information for the authenticated user:
 *   - Deep forest green curved header with Settings gear shortcut.
 *   - Dynamic profile avatar with photo upload, camera capture, and remove options.
 *   - Real authenticated user details (no hardcoded data).
 *   - Personal Information card with in-place profile editing.
 *   - Quick navigation links to Settings, Security, Notifications, and Support.
 *   - Clean, focused layout with no duplicated club operational features.
 */

import React, { useEffect, useState } from 'react';
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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  Bell,
  Camera,
  CheckCircle2,
  ChevronRight,
  Crown,
  Edit3,
  HelpCircle,
  Lock,
  LogOut,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Trophy,
  User,
  UserCheck,
} from 'lucide-react-native';

import {
  AppText,
  Button,
  Card,
  Input,
  ModalSheet,
  Screen,
} from '@/components';
import { useActiveClub, useAuth, usePlayerProfile } from '@/hooks';
import { Colors, Radius, Shadows, Spacing, getBottomNavPadding } from '@/theme';

export default function ClubProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout, activeRole } = useAuth();
  const { role, activeMembership } = useActiveClub();

  // Real TanStack Query profile hook
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

  const [refreshing, setRefreshing] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isPhotoMenuVisible, setIsPhotoMenuVisible] = useState(false);

  // Edit form state
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editGender, setEditGender] = useState('');
  const [editBio, setEditBio] = useState('');

  // Sync edit form with profile data
  useEffect(() => {
    if (profile) {
      setEditDisplayName(profile.display_name || user?.full_name || '');
      setEditFirstName(profile.first_name || '');
      setEditLastName(profile.last_name || '');
      setEditPhone(profile.phone || '');
      setEditGender(profile.gender || '');
      setEditBio(profile.bio || '');
    } else if (user) {
      setEditDisplayName(user.full_name || '');
    }
  }, [profile, user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetchProfile();
    setRefreshing(false);
  };

  // Determine user display identity
  const displayName =
    profile?.display_name ||
    user?.full_name ||
    (user as any)?.display_name ||
    'Club Staff Member';
  const email = user?.email || '—';
  const profileImageUrl = profile?.profile_image_url || (user as any)?.avatar_url;

  // Determine user role badge
  let roleLabel = 'Staff Member';
  let RoleIcon = User;
  let roleBadgeBg = '#E5F6EC';
  let roleBadgeColor = '#18794E';

  if (activeMembership?.custom_role_name || (activeMembership as any)?.role_label) {
    roleLabel = activeMembership?.custom_role_name || (activeMembership as any)?.role_label;
    RoleIcon = UserCheck;
    roleBadgeBg = '#EDE9FE';
    roleBadgeColor = '#6D28D9';
  } else if (role === 'club_owner' || activeRole === 'club_owner') {
    roleLabel = 'Club Owner';
    RoleIcon = Crown;
    roleBadgeBg = '#FEF3C7';
    roleBadgeColor = '#B45309';
  } else if (role === 'club_manager' || activeRole === 'club_manager') {
    roleLabel = 'Club Manager';
    RoleIcon = ShieldCheck;
    roleBadgeBg = '#E0F2FE';
    roleBadgeColor = '#0E7490';
  } else if (role === 'tournament_director' || activeRole === 'tournament_director') {
    roleLabel = 'Tournament Director';
    RoleIcon = Trophy;
    roleBadgeBg = '#EDE9FE';
    roleBadgeColor = '#7C3AED';
  }

  // ─── Photo Handlers ─────────────────────────────────────────────────────────

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

  // ─── Profile Update Handler ─────────────────────────────────────────────────

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
        bio: editBio.trim() || undefined,
      });
      setIsEditModalVisible(false);
      Alert.alert('Success', 'Profile information updated successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not save profile changes.';
      Alert.alert('Update Failed', msg);
    }
  };

  // ─── Sign Out ───────────────────────────────────────────────────────────────

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out of your club account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
            router.replace('/(auth)/login?portal=club' as any);
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
              <AppText style={styles.headerSubtitle}>Personal identity & contact details</AppText>
            </View>

            <TouchableOpacity
              style={styles.settingsIconBtn}
              onPress={() => router.push('/(club)/settings' as any)}
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
              {profileImageUrl ? (
                <Image
                  source={{ uri: profileImageUrl }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <AppText style={styles.avatarInitials}>
                    {displayName.charAt(0).toUpperCase()}
                  </AppText>
                </View>
              )}
            </View>

            {/* Camera badge to change photo */}
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

          {/* User Name & Email */}
          <AppText style={styles.userName}>{displayName}</AppText>
          <AppText style={styles.userEmail}>{email}</AppText>

          {/* Dynamic Role Badge */}
          <View style={[styles.roleBadge, { backgroundColor: roleBadgeBg }]}>
            <RoleIcon size={12} color={roleBadgeColor} strokeWidth={2.2} />
            <AppText style={[styles.roleBadgeText, { color: roleBadgeColor }]}>
              {roleLabel}
            </AppText>
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

          {/* ─── 4. ACCOUNT & PREFERENCES QUICK LINKS ─── */}
          <AppText style={styles.sectionHeaderTitle}>Account & Settings</AppText>
          <View style={styles.groupCard}>
            {/* Settings & Preferences */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => router.push('/(club)/settings' as any)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Settings and Preferences"
            >
              <View style={styles.rowLeft}>
                <SlidersHorizontal size={18} color="#293D38" strokeWidth={1.8} />
                <AppText style={styles.rowLabel}>Settings & Preferences</AppText>
              </View>
              <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Account & Security */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => router.push('/(club)/settings?tab=security' as any)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Account and Security"
            >
              <View style={styles.rowLeft}>
                <Lock size={18} color="#293D38" strokeWidth={1.8} />
                <AppText style={styles.rowLabel}>Account & Security</AppText>
              </View>
              <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Notifications */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => router.push('/(club)/settings?tab=notifications' as any)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Notification Settings"
            >
              <View style={styles.rowLeft}>
                <Bell size={18} color="#293D38" strokeWidth={1.8} />
                <AppText style={styles.rowLabel}>Notification Settings</AppText>
              </View>
              <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Help & Support */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => router.push('/(club)/help-support' as any)}
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
          </View>

          {/* ─── 5. SIGN OUT BUTTON ─── */}
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={handleSignOut}
            activeOpacity={0.8}
            accessibilityLabel="Sign Out of Account"
            accessibilityRole="button"
          >
            <LogOut size={18} color="#DC2626" strokeWidth={2} />
            <AppText style={styles.signOutBtnText}>Sign Out</AppText>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ─── EDIT PROFILE MODAL ─── */}
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

          <Input
            label="Short Bio"
            value={editBio}
            onChangeText={setEditBio}
            placeholder="Tell club members about your coaching background or pickleball journey."
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

          {profileImageUrl ? (
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
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
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

  // 4. Quick Links Group Card
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

  // 5. Sign Out Button
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
    marginTop: 8,
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
    marginTop: Spacing.xs,
  },
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
