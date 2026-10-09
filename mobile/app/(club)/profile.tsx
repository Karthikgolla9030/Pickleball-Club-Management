/**
 * Aught2 Pickleball — Club Owner Profile Screen
 *
 * Pixel-accurate reference implementation (Screen 2 of reference):
 *   - Deep forest green curved header block with 'My Profile' & settings gear
 *   - Overlapping circular avatar with white border and camera badge icon
 *   - Authenticated user name, email, and dynamic role badge ('♛ Club Owner')
 *   - Group 1 (Account): Personal Information, Account & Security, Notifications, Preferences
 *   - Group 2 (Club Management): Club Details, Staff & Permissions, Subscription & Billing
 *   - Group 3 (Support): Help & Support, Privacy Policy, Terms of Service
 *   - Soft red 'Sign Out' button hooked to auth store logout
 *   - Bottom navigation integration with safe area insets
 */

import React, { useState } from 'react';
import {
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  Building2,
  Camera,
  ChevronRight,
  CreditCard,
  Crown,
  FileText,
  HelpCircle,
  Lock,
  LogOut,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  User,
  Users,
} from 'lucide-react-native';

import { AppText, ModalSheet } from '@/components';
import { useActiveClub, useAuth } from '@/hooks';

export default function ClubProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout, activeRole } = useAuth();
  const { clubName } = useActiveClub();

  const [refreshing, setRefreshing] = useState(false);
  const [activeModal, setActiveModal] = useState<string | null>(null);

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  const displayName = user?.full_name || (user as any)?.display_name || 'Alex Johnson';
  const email = user?.email || 'alex.johnson@example.com';
  const profileImageUrl = (user as any)?.profile_image_url || (user as any)?.avatar_url;

  const roleLabel = activeRole === 'club_owner' ? 'Club Owner' : activeRole === 'club_manager' ? 'Club Manager' : 'Club Staff';

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out of your account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
            router.replace('/(auth)/login?portal=club' as any);
          } catch {
            // Logout handled gracefully
          }
        },
      },
    ]);
  };

  const handleRowPress = (key: string, route?: string) => {
    if (route) {
      router.push(route as any);
    } else {
      setActiveModal(key);
    }
  };

  return (
    <View style={styles.screenWrapper}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: insets.bottom + 95 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#176F5B"
          />
        }
      >
        {/* 1. TOP GREEN CURVED HEADER */}
        <View style={[styles.headerContainer, { paddingTop: insets.top + 8 }]}>
          <View style={styles.headerTopRow}>
            <View style={styles.headerTitleBlock}>
              <AppText style={styles.headerTitle}>My Profile</AppText>
              <AppText style={styles.headerSubtitle}>
                Manage your account and preferences
              </AppText>
            </View>

            <TouchableOpacity
              style={styles.settingsIconBtn}
              onPress={() => setActiveModal('Preferences')}
              activeOpacity={0.75}
              accessibilityLabel="Settings"
            >
              <SettingsIcon size={20} color="#FFFFFF" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. OVERLAPPING AVATAR & IDENTITY SECTION */}
        <View style={styles.identitySection}>
          {/* Avatar Container */}
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

            {/* Camera Badge */}
            <TouchableOpacity
              style={styles.cameraBadge}
              onPress={() => Alert.alert('Update Photo', 'Choose a new photo for your club profile.')}
              activeOpacity={0.8}
              accessibilityLabel="Change profile photo"
            >
              <Camera size={13} color="#FFFFFF" strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          {/* User Name & Email */}
          <AppText style={styles.userName}>{displayName}</AppText>
          <AppText style={styles.userEmail}>{email}</AppText>

          {/* Role Badge */}
          <View style={styles.roleBadge}>
            <Crown size={13} color="#18794E" strokeWidth={2.2} />
            <AppText style={styles.roleBadgeText}>{roleLabel}</AppText>
          </View>
        </View>

        {/* 3. GROUP 1: ACCOUNT SETTINGS CARD */}
        <View style={styles.contentPadding}>
          <View style={styles.groupCard}>
            {/* Personal Information */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => handleRowPress('Personal Information')}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <User size={19} color="#293D38" strokeWidth={1.8} />
                <AppText style={styles.rowLabel}>Personal Information</AppText>
              </View>
              <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Account & Security */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => handleRowPress('Account & Security')}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <Lock size={19} color="#293D38" strokeWidth={1.8} />
                <AppText style={styles.rowLabel}>Account & Security</AppText>
              </View>
              <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Notifications */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => handleRowPress('Notifications', '/(club)/notifications')}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <Bell size={19} color="#293D38" strokeWidth={1.8} />
                <AppText style={styles.rowLabel}>Notifications</AppText>
              </View>
              <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Preferences */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => handleRowPress('Preferences')}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <SlidersHorizontal size={19} color="#293D38" strokeWidth={1.8} />
                <AppText style={styles.rowLabel}>Preferences</AppText>
              </View>
              <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* 4. GROUP 2: CLUB MANAGEMENT */}
          <AppText style={styles.sectionHeaderTitle}>Club Management</AppText>
          <View style={styles.groupCard}>
            {/* Club Details */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => handleRowPress('Club Details', '/(club)/club-details')}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <Building2 size={19} color="#293D38" strokeWidth={1.8} />
                <AppText style={styles.rowLabel}>Club Details</AppText>
              </View>
              <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Staff & Permissions */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => handleRowPress('Staff & Permissions', '/(club)/members')}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <Users size={19} color="#293D38" strokeWidth={1.8} />
                <AppText style={styles.rowLabel}>Staff & Permissions</AppText>
              </View>
              <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Subscription & Billing */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => handleRowPress('Subscription & Billing', '/(club)/payments')}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <CreditCard size={19} color="#293D38" strokeWidth={1.8} />
                <AppText style={styles.rowLabel}>Subscription & Billing</AppText>
              </View>
              <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* 5. GROUP 3: SUPPORT */}
          <AppText style={styles.sectionHeaderTitle}>Support</AppText>
          <View style={styles.groupCard}>
            {/* Help & Support */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => handleRowPress('Help & Support')}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <HelpCircle size={19} color="#293D38" strokeWidth={1.8} />
                <AppText style={styles.rowLabel}>Help & Support</AppText>
              </View>
              <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Privacy Policy */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => handleRowPress('Privacy Policy')}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <ShieldCheck size={19} color="#293D38" strokeWidth={1.8} />
                <AppText style={styles.rowLabel}>Privacy Policy</AppText>
              </View>
              <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
            </TouchableOpacity>

            <View style={styles.rowDivider} />

            {/* Terms of Service */}
            <TouchableOpacity
              style={styles.settingRow}
              onPress={() => handleRowPress('Terms of Service')}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <FileText size={19} color="#293D38" strokeWidth={1.8} />
                <AppText style={styles.rowLabel}>Terms of Service</AppText>
              </View>
              <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* 6. SIGN OUT BUTTON */}
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={handleSignOut}
            activeOpacity={0.8}
            accessibilityLabel="Sign Out"
          >
            <LogOut size={18} color="#DC2626" strokeWidth={2} />
            <AppText style={styles.signOutBtnText}>Sign Out</AppText>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Info / Sub-action ModalSheet */}
      <ModalSheet
        visible={Boolean(activeModal)}
        onClose={() => setActiveModal(null)}
        title={activeModal || ''}
      >
        <View style={styles.modalContent}>
          <AppText style={styles.modalDesc}>
            {activeModal === 'Personal Information' &&
              `Manage name, contact information, and avatar for ${displayName}.`}
            {activeModal === 'Account & Security' &&
              'Change your password, review session security, and manage authentication options.'}
            {activeModal === 'Notifications' &&
              'Configure email and push notification preferences for court reservations, matches, and tournaments.'}
            {activeModal === 'Preferences' &&
              `Default court preferences, metric displays, and local time settings for ${clubName || 'Aught2'}.`}
            {activeModal === 'Help & Support' &&
              'Reach out to Aught2 Pickleball operations support, read FAQ guides, or submit feedback.'}
            {activeModal === 'Privacy Policy' &&
              'Aught2 Pickleball maintains strict data privacy standards. Member data is protected with TLS encryption and access control.'}
            {activeModal === 'Terms of Service' &&
              'Terms of service and club facility management rules governed by Aught2 Pickleball operations.'}
          </AppText>
        </View>
      </ModalSheet>
    </View>
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
    backgroundColor: '#176F5B',
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
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
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
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#176F5B',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  userName: {
    fontSize: 19,
    fontWeight: '700',
    color: '#102F2B',
  },
  userEmail: {
    fontSize: 12.5,
    color: '#667773',
    fontWeight: '400',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E8F5EE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#18794E',
  },

  // 3. Settings Cards
  contentPadding: {
    paddingHorizontal: 16,
    gap: 12,
    marginTop: 8,
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102F2B',
    marginTop: 8,
    marginLeft: 4,
  },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5ECE8',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#102F2B',
  },
  rowDivider: {
    height: 1,
    backgroundColor: '#F0F4F2',
    marginLeft: 48,
  },

  // 6. Sign Out
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FDE8E8',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  signOutBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
  },

  // Modal Sheet
  modalContent: {
    padding: 16,
    gap: 12,
  },
  modalDesc: {
    fontSize: 14,
    color: '#4A605A',
    lineHeight: 20,
  },
});
