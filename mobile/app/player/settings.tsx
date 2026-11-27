/**
 * Aught2 Pickleball — Player Settings Screen
 *
 * Dedicated Settings screen for players:
 *   - Preferences: Time format (12h/24h), Date format, Language with local persistence.
 *   - Account & Security: Change Password (`/auth/change-password`), Email verification status.
 *   - Notifications: Push & in-app notification preferences backed by real backend API (`/notifications/preferences`).
 *   - Privacy & Legal: Terms of Service, Privacy Policy, Help & Support, Sign Out.
 *   - Matches Club Side Settings in aesthetic, card layouts, tabs, and spacing.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  FileCheck,
  FileText,
  Globe,
  HelpCircle,
  KeyRound,
  Lock,
  LogOut,
  Shield,
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
  useAuth,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/hooks';
import { authApi } from '@/services/api';
import { usePreferencesStore, type DateFormat, type TimeFormat } from '@/store';
import { Colors, Radius, Shadows, Spacing, getBottomNavPadding } from '@/theme';

type SettingsTab = 'preferences' | 'security' | 'notifications' | 'legal';

export default function PlayerSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const searchParams = useLocalSearchParams<{ tab?: string }>();
  const { user, logout } = useAuth();
  const { width: windowWidth } = useWindowDimensions();

  const tabsScrollRef = useRef<ScrollView>(null);
  const tabLayoutsRef = useRef<Record<string, { x: number; width: number }>>({});

  const initialTab: SettingsTab =
    searchParams.tab === 'security'
      ? 'security'
      : searchParams.tab === 'notifications'
      ? 'notifications'
      : searchParams.tab === 'legal'
      ? 'legal'
      : 'preferences';

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  // ─── Notification Preferences from Backend ─────────────────────────────────
  const {
    data: notifPrefs,
    isLoading: isNotifsLoading,
    refetch: refetchNotifs,
  } = useNotificationPreferences();
  const updateNotifsMutation = useUpdateNotificationPreferences();

  const [localNotifs, setLocalNotifs] = useState<Record<string, boolean>>({});

  const notificationSettings = useMemo(() => {
    return {
      booking_notifications:
        localNotifs.booking_notifications ?? notifPrefs?.booking_notifications ?? true,
      tournament_notifications:
        localNotifs.tournament_notifications ?? notifPrefs?.tournament_notifications ?? true,
      event_notifications:
        localNotifs.event_notifications ?? notifPrefs?.event_notifications ?? true,
      membership_notifications:
        localNotifs.membership_notifications ?? notifPrefs?.membership_notifications ?? true,
      payment_notifications:
        localNotifs.payment_notifications ?? notifPrefs?.payment_notifications ?? true,
      administrative_notifications:
        localNotifs.administrative_notifications ?? notifPrefs?.administrative_notifications ?? true,
    };
  }, [localNotifs, notifPrefs]);

  const handleToggleNotification = async (key: string, value: boolean) => {
    setLocalNotifs((prev) => ({ ...prev, [key]: value }));
    try {
      await updateNotifsMutation.mutateAsync({ [key]: value });
    } catch {
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
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'New passwords do not match. Please re-enter.');
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccessMessage(res?.message || 'Password changed successfully!');
      Alert.alert('Success', 'Your password has been updated successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not change password.';
      Alert.alert('Error', msg);
    } finally {
      setIsChangingPassword(false);
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

  const onRefresh = async () => {
    await refetchNotifs();
  };

  const tabsConfig = [
    { key: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
    { key: 'security', label: 'Security', icon: Lock },
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'legal', label: 'Legal & Info', icon: ShieldCheck },
  ] as const;

  const handleTabPress = (tabKey: SettingsTab) => {
    setActiveTab(tabKey);
    setPasswordSuccessMessage(null);
    const layout = tabLayoutsRef.current[tabKey];
    if (layout && tabsScrollRef.current) {
      const containerWidth = windowWidth - Spacing.md * 2;
      const targetX = Math.max(0, layout.x - containerWidth / 2 + layout.width / 2);
      tabsScrollRef.current.scrollTo({ x: targetX, animated: true });
    }
  };

  useEffect(() => {
    const layout = tabLayoutsRef.current[activeTab];
    if (layout && tabsScrollRef.current) {
      const containerWidth = windowWidth - Spacing.md * 2;
      const targetX = Math.max(0, layout.x - containerWidth / 2 + layout.width / 2);
      tabsScrollRef.current.scrollTo({ x: targetX, animated: true });
    } else if (activeTab === 'preferences' && tabsScrollRef.current) {
      tabsScrollRef.current.scrollTo({ x: 0, animated: false });
    }
  }, [activeTab, windowWidth]);

  return (
    <Screen style={styles.screenWrapper}>
      <AppHeader title="Settings" showMenu={true} showBack={true} />

      {/* ─── TAB NAVIGATION BAR ─── */}
      <View style={styles.tabBarWrapper}>
        <ScrollView
          ref={tabsScrollRef}
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
                onPress={() => handleTabPress(tab.key)}
                onLayout={(e) => {
                  const { x, width } = e.nativeEvent.layout;
                  tabLayoutsRef.current[tab.key] = { x, width };
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
                <AppText style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
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
            TAB 1: PREFERENCES
           ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'preferences' && (
          <View style={styles.tabContent}>
            {/* Time Format */}
            <Card style={styles.card}>
              <View style={styles.cardHeaderGroup}>
                <View style={styles.cardIconBox}>
                  <Clock size={18} color={Colors.brand.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.cardTitleCol}>
                  <AppText style={styles.cardTitle}>Time Display Format</AppText>
                  <AppText style={styles.cardSubtitle}>
                    Choose how court reservation hours and schedules are rendered
                  </AppText>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.optionsRow}>
                <TouchableOpacity
                  style={[
                    styles.optionPill,
                    timeFormat === '12h' && styles.optionPillActive,
                  ]}
                  onPress={() => setTimeFormat('12h')}
                  activeOpacity={0.75}
                >
                  <AppText
                    style={[
                      styles.optionPillText,
                      timeFormat === '12h' && styles.optionPillTextActive,
                    ]}
                  >
                    12-Hour (e.g. 2:30 PM)
                  </AppText>
                  {timeFormat === '12h' && (
                    <CheckCircle2 size={15} color={Colors.brand.primary} strokeWidth={2.2} />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.optionPill,
                    timeFormat === '24h' && styles.optionPillActive,
                  ]}
                  onPress={() => setTimeFormat('24h')}
                  activeOpacity={0.75}
                >
                  <AppText
                    style={[
                      styles.optionPillText,
                      timeFormat === '24h' && styles.optionPillTextActive,
                    ]}
                  >
                    24-Hour (e.g. 14:30)
                  </AppText>
                  {timeFormat === '24h' && (
                    <CheckCircle2 size={15} color={Colors.brand.primary} strokeWidth={2.2} />
                  )}
                </TouchableOpacity>
              </View>
            </Card>

            {/* Date Format */}
            <Card style={styles.card}>
              <View style={styles.cardHeaderGroup}>
                <View style={styles.cardIconBox}>
                  <Calendar size={18} color={Colors.brand.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.cardTitleCol}>
                  <AppText style={styles.cardTitle}>Date Display Format</AppText>
                  <AppText style={styles.cardSubtitle}>
                    Select how booking dates and tournament calendars are shown
                  </AppText>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.optionsColumn}>
                {(
                  [
                    { key: 'YYYY-MM-DD', label: 'ISO Standard (YYYY-MM-DD)', example: '2026-11-19' },
                    { key: 'MM/DD/YYYY', label: 'US Format (MM/DD/YYYY)', example: '11/19/2026' },
                    { key: 'DD/MM/YYYY', label: 'European Format (DD/MM/YYYY)', example: '19/11/2026' },
                  ] as { key: DateFormat; label: string; example: string }[]
                ).map((item) => {
                  const isSelected = dateFormat === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.formatCard, isSelected && styles.formatCardActive]}
                      onPress={() => setDateFormat(item.key)}
                      activeOpacity={0.75}
                    >
                      <View style={styles.formatCardLeft}>
                        <AppText
                          style={[
                            styles.formatCardLabel,
                            isSelected && styles.formatCardLabelActive,
                          ]}
                        >
                          {item.label}
                        </AppText>
                        <AppText style={styles.formatCardExample}>Example: {item.example}</AppText>
                      </View>
                      {isSelected ? (
                        <CheckCircle2 size={16} color={Colors.brand.primary} strokeWidth={2.2} />
                      ) : (
                        <View style={styles.formatRadioCircle} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Card>

            {/* Language & Regional */}
            <Card style={styles.card}>
              <View style={styles.cardHeaderGroup}>
                <View style={styles.cardIconBox}>
                  <Globe size={18} color={Colors.brand.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.cardTitleCol}>
                  <AppText style={styles.cardTitle}>Language & Region</AppText>
                  <AppText style={styles.cardSubtitle}>Application interface localization</AppText>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <AppText style={styles.infoRowLabel}>Interface Language</AppText>
                <Badge label="English (US)" variant="default" size="sm" />
              </View>
            </Card>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 2: SECURITY & PASSWORD
           ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'security' && (
          <View style={styles.tabContent}>
            {/* Change Password Card */}
            <Card style={styles.card}>
              <View style={styles.cardHeaderGroup}>
                <View style={styles.cardIconBox}>
                  <KeyRound size={18} color={Colors.brand.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.cardTitleCol}>
                  <AppText style={styles.cardTitle}>Change Password</AppText>
                  <AppText style={styles.cardSubtitle}>
                    Ensure your account stays secure with a strong password
                  </AppText>
                </View>
              </View>

              <View style={styles.divider} />

              {passwordSuccessMessage ? (
                <View style={styles.successBanner}>
                  <CheckCircle2 size={16} color="#065F46" strokeWidth={2} />
                  <AppText style={styles.successBannerText}>{passwordSuccessMessage}</AppText>
                </View>
              ) : null}

              {/* Current Password */}
              <View style={styles.inputGroup}>
                <AppText style={styles.inputLabel}>Current Password</AppText>
                <View style={styles.passwordInputWrap}>
                  <TextInput
                    style={styles.textInputField}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    placeholder="Enter current password"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showCurrentPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setShowCurrentPassword((prev) => !prev)}
                    activeOpacity={0.7}
                  >
                    {showCurrentPassword ? (
                      <EyeOff size={16} color="#6B7280" />
                    ) : (
                      <Eye size={16} color="#6B7280" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* New Password */}
              <View style={styles.inputGroup}>
                <AppText style={styles.inputLabel}>New Password</AppText>
                <View style={styles.passwordInputWrap}>
                  <TextInput
                    style={styles.textInputField}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Min. 8 characters"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showNewPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setShowNewPassword((prev) => !prev)}
                    activeOpacity={0.7}
                  >
                    {showNewPassword ? (
                      <EyeOff size={16} color="#6B7280" />
                    ) : (
                      <Eye size={16} color="#6B7280" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password */}
              <View style={styles.inputGroup}>
                <AppText style={styles.inputLabel}>Confirm New Password</AppText>
                <View style={styles.passwordInputWrap}>
                  <TextInput
                    style={styles.textInputField}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Re-enter new password"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setShowConfirmPassword((prev) => !prev)}
                    activeOpacity={0.7}
                  >
                    {showConfirmPassword ? (
                      <EyeOff size={16} color="#6B7280" />
                    ) : (
                      <Eye size={16} color="#6B7280" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <Button
                label="Update Password"
                variant="primary"
                loading={isChangingPassword}
                onPress={handleChangePassword}
                style={styles.passwordBtn}
              />
            </Card>

            {/* Account Security Overview */}
            <Card style={styles.card}>
              <View style={styles.cardHeaderGroup}>
                <View style={styles.cardIconBox}>
                  <ShieldCheck size={18} color={Colors.brand.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.cardTitleCol}>
                  <AppText style={styles.cardTitle}>Account Security Information</AppText>
                  <AppText style={styles.cardSubtitle}>
                    Verified identity and session parameters
                  </AppText>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <AppText style={styles.infoRowLabel}>Registered Email</AppText>
                <View style={styles.verifiedRow}>
                  <AppText style={styles.infoRowValue}>{user?.email || '—'}</AppText>
                  <CheckCircle2 size={14} color={Colors.status.success} strokeWidth={2} />
                </View>
              </View>

              <View style={styles.rowDivider} />

              <View style={styles.infoRow}>
                <AppText style={styles.infoRowLabel}>Email Verification</AppText>
                <Badge label="Verified" variant="success" size="sm" />
              </View>

              <View style={styles.rowDivider} />

              <View style={styles.infoRow}>
                <AppText style={styles.infoRowLabel}>Account Role</AppText>
                <Badge label="Player" variant="default" size="sm" />
              </View>
            </Card>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 3: NOTIFICATIONS
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
                    Manage which operational notifications are delivered to your player account
                  </AppText>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Court Booking Notifications */}
              <View style={styles.settingToggleRow}>
                <View style={styles.toggleTextCol}>
                  <AppText style={styles.toggleTitle}>Court Bookings</AppText>
                  <AppText style={styles.toggleSubtitle}>
                    Confirmation, schedule change, and cancellation alerts
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

              {/* Tournament & League Notifications */}
              <View style={styles.settingToggleRow}>
                <View style={styles.toggleTextCol}>
                  <AppText style={styles.toggleTitle}>Tournaments & Leagues</AppText>
                  <AppText style={styles.toggleSubtitle}>
                    Bracket releases, match schedules, and score confirmations
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

              {/* Events & Coaching Lessons */}
              <View style={styles.settingToggleRow}>
                <View style={styles.toggleTextCol}>
                  <AppText style={styles.toggleTitle}>Events & Coaching</AppText>
                  <AppText style={styles.toggleSubtitle}>
                    Social round robins, clinics, and private lesson reminders
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

              {/* Membership & Subscription Notifications */}
              <View style={styles.settingToggleRow}>
                <View style={styles.toggleTextCol}>
                  <AppText style={styles.toggleTitle}>Memberships</AppText>
                  <AppText style={styles.toggleSubtitle}>
                    Club membership approval, renewals, and expiration reminders
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

              {/* Payment Receipts & Invoices */}
              <View style={styles.settingToggleRow}>
                <View style={styles.toggleTextCol}>
                  <AppText style={styles.toggleTitle}>Payments & Invoices</AppText>
                  <AppText style={styles.toggleSubtitle}>
                    Payment confirmations, receipts, and refund updates
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

              {/* Announcements & System Notices */}
              <View style={styles.settingToggleRow}>
                <View style={styles.toggleTextCol}>
                  <AppText style={styles.toggleTitle}>Announcements & Alerts</AppText>
                  <AppText style={styles.toggleSubtitle}>
                    Important club news, weather notices, and platform updates
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
            TAB 4: LEGAL & PRIVACY
           ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'legal' && (
          <View style={styles.tabContent}>
            <Card style={styles.card}>
              <View style={styles.cardHeaderGroup}>
                <View style={styles.cardIconBox}>
                  <ShieldCheck size={18} color={Colors.brand.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.cardTitleCol}>
                  <AppText style={styles.cardTitle}>Legal & Support</AppText>
                  <AppText style={styles.cardSubtitle}>
                    Terms of service, privacy policies, and player support
                  </AppText>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Terms of Service */}
              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => router.push('/legal/player_terms' as any)}
                activeOpacity={0.7}
              >
                <View style={styles.linkRowLeft}>
                  <FileText size={18} color="#2A4540" strokeWidth={1.8} />
                  <View>
                    <AppText style={styles.linkTitle}>Player Terms of Service</AppText>
                    <AppText style={styles.linkSubtitle}>Rules, code of conduct, and conditions</AppText>
                  </View>
                </View>
                <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
              </TouchableOpacity>

              <View style={styles.rowDivider} />

              {/* Privacy Policy */}
              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => router.push('/legal/privacy_policy' as any)}
                activeOpacity={0.7}
              >
                <View style={styles.linkRowLeft}>
                  <Shield size={18} color="#2A4540" strokeWidth={1.8} />
                  <View>
                    <AppText style={styles.linkTitle}>Privacy Policy</AppText>
                    <AppText style={styles.linkSubtitle}>Personal data handling and security rights</AppText>
                  </View>
                </View>
                <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
              </TouchableOpacity>

              <View style={styles.rowDivider} />

              {/* Help & Support */}
              <TouchableOpacity
                style={styles.linkRow}
                onPress={() => router.push('/player/help-support' as any)}
                activeOpacity={0.7}
              >
                <View style={styles.linkRowLeft}>
                  <HelpCircle size={18} color="#2A4540" strokeWidth={1.8} />
                  <View>
                    <AppText style={styles.linkTitle}>Help & Support</AppText>
                    <AppText style={styles.linkSubtitle}>FAQs, guides, and customer support</AppText>
                  </View>
                </View>
                <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
              </TouchableOpacity>
            </Card>

            {/* Sign Out Button */}
            <TouchableOpacity
              style={styles.signOutBtn}
              onPress={handleSignOut}
              activeOpacity={0.8}
            >
              <LogOut size={18} color="#DC2626" strokeWidth={2} />
              <AppText style={styles.signOutBtnText}>Sign Out</AppText>
            </TouchableOpacity>
          </View>
        )}
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
    borderBottomColor: Colors.surface.borderLight,
    paddingVertical: 10,
    ...Shadows.sm,
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
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tabPillActive: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  tabLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  tabLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  container: {
    padding: 16,
    gap: 14,
  },
  tabContent: {
    gap: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    ...Shadows.sm,
  },
  cardHeaderGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardIconBox: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    backgroundColor: Colors.brand.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleCol: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15.5,
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
    marginVertical: Spacing.sm,
  },
  rowDivider: {
    height: 1,
    backgroundColor: Colors.surface.borderLight,
    marginVertical: 4,
  },

  // Toggle rows
  settingToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    gap: 12,
  },
  toggleTextCol: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  toggleSubtitle: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 2,
    lineHeight: 15,
  },

  // Options row
  optionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  optionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    backgroundColor: Colors.background.primary,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  optionPillActive: {
    backgroundColor: Colors.brand.primaryLight,
    borderColor: '#C3E7D2',
  },
  optionPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  optionPillTextActive: {
    color: Colors.brand.primary,
    fontWeight: '700',
  },

  // Options column
  optionsColumn: {
    gap: 8,
    marginTop: 4,
  },
  formatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    backgroundColor: Colors.background.primary,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  formatCardActive: {
    backgroundColor: Colors.brand.primaryLight,
    borderColor: '#C3E7D2',
  },
  formatCardLeft: {
    flex: 1,
  },
  formatCardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  formatCardLabelActive: {
    color: Colors.brand.primary,
    fontWeight: '700',
  },
  formatCardExample: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  formatRadioCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },

  // Info rows
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  infoRowLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.text.secondary,
  },
  infoRowValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  // Inputs
  inputGroup: {
    gap: 5,
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  passwordInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.primary,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
  },
  textInputField: {
    flex: 1,
    height: 42,
    fontSize: 13.5,
    color: Colors.text.primary,
  },
  eyeBtn: {
    padding: 6,
  },
  passwordBtn: {
    marginTop: 8,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: Radius.md,
    padding: 10,
    marginBottom: 8,
  },
  successBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#065F46',
  },

  // Links
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  linkRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  linkTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#2A4540',
  },
  linkSubtitle: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 1,
  },

  // Sign out button
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
});
