/**
 * Aught2 Pickleball — Club Staff Settings Screen
 *
 * Independent Settings screen featuring:
 *   - Notification preferences backed by real backend API (`/notifications/preferences`).
 *   - Application preferences (Date format, Time format, Timezone display) with local persistence.
 *   - Account & Security section with genuine password change functionality (`/auth/change-password`).
 *   - Privacy, legal, and operational support links.
 *   - Role-aware display matching the authenticated club staff member.
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  FileCheck,
  FileText,
  Globe,
  HelpCircle,
  KeyRound,
  Lock,
  LogOut,
  ShieldCheck,
  SlidersHorizontal,
  User,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Badge,
  Button,
  Card,
  Screen,
} from '@/components';
import {
  useActiveClub,
  useAuth,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/hooks';
import { authApi } from '@/services/api';
import { usePreferencesStore, type DateFormat, type TimeFormat } from '@/store';
import { Colors, Radius, Shadows, getBottomNavPadding } from '@/theme';

type SettingsTab = 'notifications' | 'preferences' | 'security' | 'legal';

export default function ClubSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const searchParams = useLocalSearchParams<{ tab?: string }>();
  const { user, logout, activeRole } = useAuth();
  const { role, activeMembership, clubName } = useActiveClub();

  // Active Tab state (defaults to searchParam 'tab' if valid, or 'notifications')
  const initialTab: SettingsTab =
    searchParams.tab === 'security'
      ? 'security'
      : searchParams.tab === 'preferences'
      ? 'preferences'
      : searchParams.tab === 'legal'
      ? 'legal'
      : 'notifications';

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  // ─── Notification Preferences from backend ─────────────────────────────────
  const {
    data: notifPrefs,
    isLoading: isNotifsLoading,
    refetch: refetchNotifs,
  } = useNotificationPreferences();
  const updateNotifsMutation = useUpdateNotificationPreferences();

  // Local optimistic state for notification switches
  const [localNotifs, setLocalNotifs] = useState<Record<string, boolean>>({});

  const notificationSettings = useMemo(() => {
    return {
      booking_notifications:
        localNotifs.booking_notifications ?? notifPrefs?.booking_notifications ?? true,
      payment_notifications:
        localNotifs.payment_notifications ?? notifPrefs?.payment_notifications ?? true,
      membership_notifications:
        localNotifs.membership_notifications ?? notifPrefs?.membership_notifications ?? true,
      tournament_notifications:
        localNotifs.tournament_notifications ?? notifPrefs?.tournament_notifications ?? true,
      event_notifications:
        localNotifs.event_notifications ?? notifPrefs?.event_notifications ?? true,
      administrative_notifications:
        localNotifs.administrative_notifications ?? notifPrefs?.administrative_notifications ?? true,
    };
  }, [localNotifs, notifPrefs]);

  const handleToggleNotification = async (key: string, value: boolean) => {
    setLocalNotifs((prev) => ({ ...prev, [key]: value }));
    try {
      await updateNotifsMutation.mutateAsync({ [key]: value });
    } catch {
      // Revert optimistic state
      setLocalNotifs((prev) => ({ ...prev, [key]: !value }));
      Alert.alert('Error', 'Failed to update notification preference. Please try again.');
    }
  };

  // ─── App Preferences from Store ───────────────────────────────────────────
  const { dateFormat, timeFormat, setDateFormat, setTimeFormat } = usePreferencesStore();

  // ─── Change Password State ────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccessMessage, setPasswordSuccessMessage] = useState<string | null>(null);

  const handleChangePassword = async () => {
    setPasswordSuccessMessage(null);
    if (!currentPassword) {
      Alert.alert('Required', 'Please enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Password Policy', 'New password must be at least 8 characters long.');
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      Alert.alert('Password Policy', 'New password must contain at least one letter and one number.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Password Mismatch', 'New password and confirmation do not match.');
      return;
    }
    if (currentPassword === newPassword) {
      Alert.alert('Invalid Password', 'New password must be different from current password.');
      return;
    }

    try {
      setIsChangingPassword(true);
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccessMessage('Password changed successfully.');
      Alert.alert('Success', 'Your account password has been updated.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not change password. Please verify current password.';
      Alert.alert('Password Change Failed', msg);
    } finally {
      setIsChangingPassword(false);
    }
  };

  // ─── Sign Out ─────────────────────────────────────────────────────────────
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
            // Handled
          }
        },
      },
    ]);
  };

  const onRefresh = async () => {
    await refetchNotifs();
  };

  const roleLabel =
    activeMembership?.custom_role_name ||
    (activeMembership as any)?.role_label ||
    (role === 'club_owner' || activeRole === 'club_owner'
      ? 'Club Owner'
      : role === 'club_manager' || activeRole === 'club_manager'
      ? 'Club Manager'
      : role === 'tournament_director' || activeRole === 'tournament_director'
      ? 'Tournament Director'
      : 'Staff Member');

  const tabsConfig = [
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
    { key: 'security', label: 'Security', icon: Lock },
    { key: 'legal', label: 'Legal & Info', icon: ShieldCheck },
  ] as const;

  return (
    <Screen style={styles.screenWrapper}>
      <AppHeader title="Settings" showMenu={true} showBack={true} />

      {/* ─── TAB NAVIGATION BAR ─── */}
      <View style={styles.tabBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarScroll}
          bounces={false}
        >
          {tabsConfig.map((tab) => {
            const isActive = activeTab === tab.key;
            const Icon = tab.icon;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabPill, isActive && styles.tabPillActive]}
                onPress={() => {
                  setActiveTab(tab.key);
                  setPasswordSuccessMessage(null);
                }}
                activeOpacity={0.75}
                accessibilityRole="tab"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected: isActive }}
              >
                <Icon
                  size={14}
                  color={isActive ? Colors.white : Colors.text.secondary}
                  strokeWidth={isActive ? 2.2 : 1.8}
                />
                <AppText
                  style={[styles.tabLabel, isActive && styles.tabLabelActive]}
                  numberOfLines={1}
                >
                  {tab.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: getBottomNavPadding(insets.bottom) + 36 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isNotifsLoading}
            onRefresh={onRefresh}
            tintColor={Colors.brand.primary}
          />
        }
      >
        {/* ══════════════════════════════════════════════════════════════════════
            TAB A: NOTIFICATIONS
           ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'notifications' && (
          <View style={styles.tabContent}>
            <Card style={styles.card}>
              <View style={styles.cardHeaderGroup}>
                <View style={styles.cardIconBox}>
                  <Bell size={18} color={Colors.brand.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.cardTitleCol}>
                  <AppText style={styles.cardTitle}>Notification Preferences</AppText>
                  <AppText style={styles.cardSubtitle}>
                    Control which operational alerts are delivered to your account
                  </AppText>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Court Booking Notifications */}
              <View style={styles.settingToggleRow}>
                <View style={styles.toggleTextCol}>
                  <AppText style={styles.toggleTitle}>Court Bookings</AppText>
                  <AppText style={styles.toggleSubtitle}>
                    Alerts for new, modified, or cancelled court reservations
                  </AppText>
                </View>
                <Switch
                  value={notificationSettings.booking_notifications}
                  onValueChange={(v) => handleToggleNotification('booking_notifications', v)}
                  trackColor={{ false: '#E2EAE6', true: Colors.brand.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.rowDivider} />

              {/* Payment Notifications */}
              <View style={styles.settingToggleRow}>
                <View style={styles.toggleTextCol}>
                  <AppText style={styles.toggleTitle}>Payments & Financials</AppText>
                  <AppText style={styles.toggleSubtitle}>
                    Receipts, payment settlement notices, and refund updates
                  </AppText>
                </View>
                <Switch
                  value={notificationSettings.payment_notifications}
                  onValueChange={(v) => handleToggleNotification('payment_notifications', v)}
                  trackColor={{ false: '#E2EAE6', true: Colors.brand.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.rowDivider} />

              {/* Membership Notifications */}
              <View style={styles.settingToggleRow}>
                <View style={styles.toggleTextCol}>
                  <AppText style={styles.toggleTitle}>Memberships & Applications</AppText>
                  <AppText style={styles.toggleSubtitle}>
                    New player membership requests and subscription renewals
                  </AppText>
                </View>
                <Switch
                  value={notificationSettings.membership_notifications}
                  onValueChange={(v) => handleToggleNotification('membership_notifications', v)}
                  trackColor={{ false: '#E2EAE6', true: Colors.brand.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.rowDivider} />

              {/* Tournament Notifications */}
              <View style={styles.settingToggleRow}>
                <View style={styles.toggleTextCol}>
                  <AppText style={styles.toggleTitle}>Tournaments & Leagues</AppText>
                  <AppText style={styles.toggleSubtitle}>
                    Bracket releases, match schedule changes, and team registrations
                  </AppText>
                </View>
                <Switch
                  value={notificationSettings.tournament_notifications}
                  onValueChange={(v) => handleToggleNotification('tournament_notifications', v)}
                  trackColor={{ false: '#E2EAE6', true: Colors.brand.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.rowDivider} />

              {/* Community & Social Events */}
              <View style={styles.settingToggleRow}>
                <View style={styles.toggleTextCol}>
                  <AppText style={styles.toggleTitle}>Events & Coaching</AppText>
                  <AppText style={styles.toggleSubtitle}>
                    Social event registrations, clinics, and private coaching updates
                  </AppText>
                </View>
                <Switch
                  value={notificationSettings.event_notifications}
                  onValueChange={(v) => handleToggleNotification('event_notifications', v)}
                  trackColor={{ false: '#E2EAE6', true: Colors.brand.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.rowDivider} />

              {/* Administrative Notices */}
              <View style={styles.settingToggleRow}>
                <View style={styles.toggleTextCol}>
                  <AppText style={styles.toggleTitle}>Administrative Notices</AppText>
                  <AppText style={styles.toggleSubtitle}>
                    Staff permissions, facility policies, and critical system bulletins
                  </AppText>
                </View>
                <Switch
                  value={notificationSettings.administrative_notifications}
                  onValueChange={(v) => handleToggleNotification('administrative_notifications', v)}
                  trackColor={{ false: '#E2EAE6', true: Colors.brand.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </Card>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB B: PREFERENCES
           ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'preferences' && (
          <View style={styles.tabContent}>
            {/* Date & Time Formatting */}
            <Card style={styles.card}>
              <View style={styles.cardHeaderGroup}>
                <View style={styles.cardIconBox}>
                  <Calendar size={18} color={Colors.brand.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.cardTitleCol}>
                  <AppText style={styles.cardTitle}>Date & Time Display</AppText>
                  <AppText style={styles.cardSubtitle}>
                    Format options for schedules, bookings, and reporting tables
                  </AppText>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Date Format Selector */}
              <View style={styles.prefSectionBlock}>
                <AppText style={styles.prefLabel}>Date Format</AppText>
                <View style={styles.segmentedOptionRow}>
                  {(['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY'] as DateFormat[]).map((fmt) => {
                    const isSelected = dateFormat === fmt;
                    return (
                      <TouchableOpacity
                        key={fmt}
                        style={[styles.segBtn, isSelected && styles.segBtnActive]}
                        onPress={() => setDateFormat(fmt)}
                        activeOpacity={0.7}
                      >
                        <AppText style={[styles.segBtnText, isSelected && styles.segBtnTextActive]}>
                          {fmt}
                        </AppText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <AppText style={styles.prefHelpText}>
                  Preview: {dateFormat === 'YYYY-MM-DD' ? '2026-11-18' : dateFormat === 'MM/DD/YYYY' ? '11/18/2026' : '18/11/2026'}
                </AppText>
              </View>

              <View style={styles.rowDivider} />

              {/* Time Format Selector */}
              <View style={styles.prefSectionBlock}>
                <AppText style={styles.prefLabel}>Time Format</AppText>
                <View style={styles.segmentedOptionRow}>
                  {(['12h', '24h'] as TimeFormat[]).map((fmt) => {
                    const isSelected = timeFormat === fmt;
                    return (
                      <TouchableOpacity
                        key={fmt}
                        style={[styles.segBtn, isSelected && styles.segBtnActive]}
                        onPress={() => setTimeFormat(fmt)}
                        activeOpacity={0.7}
                      >
                        <AppText style={[styles.segBtnText, isSelected && styles.segBtnTextActive]}>
                          {fmt === '12h' ? '12-Hour (AM/PM)' : '24-Hour'}
                        </AppText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <AppText style={styles.prefHelpText}>
                  Preview: {timeFormat === '12h' ? '07:30 PM' : '19:30'}
                </AppText>
              </View>
            </Card>

            {/* Club Environment & Localization */}
            <Card style={styles.card}>
              <View style={styles.cardHeaderGroup}>
                <View style={styles.cardIconBox}>
                  <Globe size={18} color={Colors.brand.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.cardTitleCol}>
                  <AppText style={styles.cardTitle}>Club Operational Environment</AppText>
                  <AppText style={styles.cardSubtitle}>
                    Active club parameters and operating context
                  </AppText>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.infoStaticRow}>
                <View>
                  <AppText style={styles.staticRowTitle}>Active Club</AppText>
                  <AppText style={styles.staticRowSubtitle}>Current management context</AppText>
                </View>
                <Badge label={clubName || 'Active Club'} variant="default" size="sm" />
              </View>

              <View style={styles.rowDivider} />

              <View style={styles.infoStaticRow}>
                <View>
                  <AppText style={styles.staticRowTitle}>Operational Timezone</AppText>
                  <AppText style={styles.staticRowSubtitle}>
                    Court schedules and reports conform to this timezone
                  </AppText>
                </View>
                <Badge label="America/New_York (UTC-5)" variant="info" size="sm" />
              </View>

              <View style={styles.rowDivider} />

              <View style={styles.infoStaticRow}>
                <View>
                  <AppText style={styles.staticRowTitle}>System Language</AppText>
                  <AppText style={styles.staticRowSubtitle}>Primary application language</AppText>
                </View>
                <Badge label="English (US)" variant="default" size="sm" />
              </View>
            </Card>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB C: ACCOUNT & SECURITY
           ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'security' && (
          <View style={styles.tabContent}>
            {/* Account Credentials Card */}
            <Card style={styles.card}>
              <View style={styles.cardHeaderGroup}>
                <View style={styles.cardIconBox}>
                  <User size={18} color={Colors.brand.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.cardTitleCol}>
                  <AppText style={styles.cardTitle}>Account Credentials</AppText>
                  <AppText style={styles.cardSubtitle}>
                    Identity and authentication details for club staff
                  </AppText>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.infoStaticRow}>
                <View>
                  <AppText style={styles.staticRowTitle}>Account Email</AppText>
                  <AppText style={styles.staticRowSubtitle}>{user?.email}</AppText>
                </View>
                <Badge label="Verified" variant="success" size="sm" />
              </View>

              <View style={styles.rowDivider} />

              <View style={styles.infoStaticRow}>
                <View>
                  <AppText style={styles.staticRowTitle}>Assigned Role</AppText>
                  <AppText style={styles.staticRowSubtitle}>Access clearance level</AppText>
                </View>
                <Badge label={roleLabel} variant="info" size="sm" />
              </View>
            </Card>

            {/* Change Password Card */}
            <Card style={styles.card}>
              <View style={styles.cardHeaderGroup}>
                <View style={styles.cardIconBox}>
                  <KeyRound size={18} color={Colors.brand.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.cardTitleCol}>
                  <AppText style={styles.cardTitle}>Change Password</AppText>
                  <AppText style={styles.cardSubtitle}>
                    Ensure your account is using a strong, secure password
                  </AppText>
                </View>
              </View>

              <View style={styles.divider} />

              {passwordSuccessMessage && (
                <View style={styles.successBanner}>
                  <CheckCircle2 size={16} color={Colors.status.success} />
                  <AppText style={styles.successBannerText}>{passwordSuccessMessage}</AppText>
                </View>
              )}

              <View style={styles.passwordField}>
                <AppText style={styles.passwordInputLabel}>Current Password *</AppText>
                <View style={styles.passwordInputBox}>
                  <TextInput
                    style={styles.passwordTextInput}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    placeholder="Enter current password"
                    placeholderTextColor={Colors.text.tertiary}
                    secureTextEntry={!showCurrentPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setShowCurrentPassword((prev) => !prev)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {showCurrentPassword ? (
                      <EyeOff size={18} color={Colors.text.secondary} />
                    ) : (
                      <Eye size={18} color={Colors.text.secondary} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.passwordField}>
                <AppText style={styles.passwordInputLabel}>New Password *</AppText>
                <View style={styles.passwordInputBox}>
                  <TextInput
                    style={styles.passwordTextInput}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Minimum 8 chars (letters and numbers)"
                    placeholderTextColor={Colors.text.tertiary}
                    secureTextEntry={!showNewPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setShowNewPassword((prev) => !prev)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {showNewPassword ? (
                      <EyeOff size={18} color={Colors.text.secondary} />
                    ) : (
                      <Eye size={18} color={Colors.text.secondary} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.passwordField}>
                <AppText style={styles.passwordInputLabel}>Confirm New Password *</AppText>
                <View style={styles.passwordInputBox}>
                  <TextInput
                    style={styles.passwordTextInput}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Re-enter new password"
                    placeholderTextColor={Colors.text.tertiary}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setShowConfirmPassword((prev) => !prev)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {showConfirmPassword ? (
                      <EyeOff size={18} color={Colors.text.secondary} />
                    ) : (
                      <Eye size={18} color={Colors.text.secondary} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <Button
                label="Update Password"
                variant="primary"
                loading={isChangingPassword}
                onPress={handleChangePassword}
                style={styles.updatePasswordBtn}
              />
            </Card>

            {/* Session Security */}
            <Card style={styles.card}>
              <View style={styles.cardHeaderGroup}>
                <View style={styles.cardIconBox}>
                  <ShieldCheck size={18} color={Colors.brand.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.cardTitleCol}>
                  <AppText style={styles.cardTitle}>Active Session Protection</AppText>
                  <AppText style={styles.cardSubtitle}>
                    Session authentication and token management
                  </AppText>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.sessionRow}>
                <View style={styles.sessionDot} />
                <View style={styles.sessionTextCol}>
                  <AppText style={styles.sessionTitle}>Current Device Session</AppText>
                  <AppText style={styles.sessionSubtitle}>
                    {Platform.OS === 'web' ? 'Web Browser' : 'Mobile Application'} • Active Now
                  </AppText>
                </View>
                <Badge label="Active" variant="success" size="sm" />
              </View>
            </Card>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB D: LEGAL & INFO
           ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'legal' && (
          <View style={styles.tabContent}>
            <Card style={styles.card}>
              <View style={styles.cardHeaderGroup}>
                <View style={styles.cardIconBox}>
                  <FileText size={18} color={Colors.brand.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.cardTitleCol}>
                  <AppText style={styles.cardTitle}>Terms & Policies</AppText>
                  <AppText style={styles.cardSubtitle}>
                    Platform agreements, privacy terms, and operating standards
                  </AppText>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Terms of Service */}
              <TouchableOpacity
                style={styles.legalNavRow}
                onPress={() => router.push('/legal/club_terms' as any)}
                activeOpacity={0.7}
              >
                <View style={styles.legalLeft}>
                  <FileText size={18} color="#2A4540" strokeWidth={1.8} />
                  <AppText style={styles.legalLabel}>Terms of Service</AppText>
                </View>
                <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
              </TouchableOpacity>

              <View style={styles.rowDivider} />

              {/* Privacy Policy */}
              <TouchableOpacity
                style={styles.legalNavRow}
                onPress={() => router.push('/legal/privacy_policy' as any)}
                activeOpacity={0.7}
              >
                <View style={styles.legalLeft}>
                  <ShieldCheck size={18} color="#2A4540" strokeWidth={1.8} />
                  <AppText style={styles.legalLabel}>Privacy Policy</AppText>
                </View>
                <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
              </TouchableOpacity>

              <View style={styles.rowDivider} />

              {/* Club Facility Agreement */}
              <TouchableOpacity
                style={styles.legalNavRow}
                onPress={() => router.push('/legal/club_agreement' as any)}
                activeOpacity={0.7}
              >
                <View style={styles.legalLeft}>
                  <FileCheck size={18} color="#2A4540" strokeWidth={1.8} />
                  <AppText style={styles.legalLabel}>Club Facility Agreement</AppText>
                </View>
                <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
              </TouchableOpacity>

              <View style={styles.rowDivider} />

              {/* Help & Support */}
              <TouchableOpacity
                style={styles.legalNavRow}
                onPress={() => router.push('/(club)/help-support' as any)}
                activeOpacity={0.7}
              >
                <View style={styles.legalLeft}>
                  <HelpCircle size={18} color="#2A4540" strokeWidth={1.8} />
                  <AppText style={styles.legalLabel}>Help & Support Desk</AppText>
                </View>
                <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
              </TouchableOpacity>
            </Card>

            <View style={styles.platformVersionCard}>
              <AppText style={styles.platformVersionTitle}>Aught2 Pickleball Club Management</AppText>
              <AppText style={styles.platformVersionSub}>Version 1.0.0 • Production Release</AppText>
            </View>
          </View>
        )}

        {/* ─── GLOBAL SIGN OUT BUTTON ─── */}
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          activeOpacity={0.8}
          accessibilityLabel="Sign Out of Club Account"
          accessibilityRole="button"
        >
          <LogOut size={18} color="#DC2626" strokeWidth={2} />
          <AppText style={styles.signOutBtnText}>Sign Out</AppText>
        </TouchableOpacity>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: '#F3F8F5',
  },
  tabBarWrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
    paddingVertical: 8,
  },
  tabBarScroll: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  tabPillActive: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
    ...Shadows.sm,
  },
  tabLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  tabLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  container: {
    padding: 16,
    gap: 16,
  },
  tabContent: {
    gap: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    ...Shadows.sm,
  },
  cardHeaderGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardIconBox: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    backgroundColor: Colors.brand.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleCol: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  cardSubtitle: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surface.borderLight,
    marginVertical: 14,
  },
  rowDivider: {
    height: 1,
    backgroundColor: Colors.surface.borderLight,
    marginVertical: 10,
  },

  // Toggle rows
  settingToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 4,
  },
  toggleTextCol: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#102B2A',
  },
  toggleSubtitle: {
    fontSize: 11,
    color: '#667776',
    marginTop: 2,
    lineHeight: 15,
  },

  // Preference Blocks
  prefSectionBlock: {
    paddingVertical: 4,
    gap: 8,
  },
  prefLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  segmentedOptionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  segBtn: {
    flex: 1,
    minWidth: 90,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.background.primary,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segBtnActive: {
    backgroundColor: Colors.brand.primaryLight,
    borderColor: Colors.brand.primary,
  },
  segBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  segBtnTextActive: {
    color: Colors.brand.primary,
    fontWeight: '700',
  },
  prefHelpText: {
    fontSize: 11,
    color: Colors.text.tertiary,
    fontStyle: 'italic',
  },

  // Static Info Rows
  infoStaticRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  staticRowTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  staticRowSubtitle: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 2,
  },

  // Password fields
  passwordField: {
    marginBottom: 12,
  },
  passwordInputLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 6,
  },
  passwordInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    height: 46,
  },
  passwordTextInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.text.primary,
    paddingVertical: 0,
  },
  eyeBtn: {
    padding: 6,
    marginLeft: 6,
  },
  updatePasswordBtn: {
    marginTop: 6,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.status.successBg,
    padding: 10,
    borderRadius: Radius.md,
    marginBottom: 12,
  },
  successBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.status.success,
  },

  // Session
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  sessionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.status.success,
  },
  sessionTextCol: {
    flex: 1,
  },
  sessionTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  sessionSubtitle: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 1,
  },

  // Legal
  legalNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  legalLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  legalLabel: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#2A4540',
  },
  platformVersionCard: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 3,
  },
  platformVersionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  platformVersionSub: {
    fontSize: 10.5,
    color: Colors.text.tertiary,
  },

  // Sign out
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
});
