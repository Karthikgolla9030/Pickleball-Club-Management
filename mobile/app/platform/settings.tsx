/**
 * Aught2 Pickleball — Platform Settings Screen
 *
 * Dedicated administrative configuration interface matching the visual reference design:
 * - Top header with official Pickleball Platform Admin branding, notification bell & avatar
 * - Page title "Settings" and subtitle "Operational parameters & global configuration"
 * - Grouped white section containers:
 *   1. Platform Configuration (Operational Controls, Applications & Features)
 *   2. Legal & Help Content (Help & FAQs, Player Terms of Service, Club Terms of Service, Privacy Policy)
 *   3. Users & Access (User Management)
 * - Deep navigation into each dedicated operational and legal management workflow
 * - Fixed thumb-reachable platform bottom navigation bar with "More" active
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Database,
  FileText,
  Globe,
  HardDrive,
  HelpCircle,
  History,
  Info,
  Lock,
  Mail,
  RefreshCw,
  Save,
  Server,
  Settings as SettingsIcon,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Tag,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react-native';

import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PlatformButton,
  PlatformShell,
  LegalAndHelpManager,
} from '@/components';
import {
  PlatformReadOnlyConfig,
  PlatformRuntimeSettings,
  PlatformSettingsResponse,
  PlatformSettingsUpdateRequest,
  platformApplicationsApi,
} from '@/services/api/clubApplications';
import { Colors, Radius, Spacing, Typography } from '@/theme';

type SettingsView =
  | 'menu'
  | 'operational'
  | 'help'
  | 'player_terms'
  | 'club_terms'
  | 'privacy_policy';

export default function PlatformSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [currentView, setCurrentView] = useState<SettingsView>('menu');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Settings from API
  const [runtimeSettings, setRuntimeSettings] = useState<PlatformRuntimeSettings | null>(null);
  const [readOnlyConfig, setReadOnlyConfig] = useState<PlatformReadOnlyConfig | null>(null);

  // Form Draft State
  const [platformName, setPlatformName] = useState('Aught2 Pickleball');
  const [supportEmail, setSupportEmail] = useState('support@pickleball.com');
  const [allowClubReg, setAllowClubReg] = useState(true);
  const [allowUserReg, setAllowUserReg] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maxUploadMb, setMaxUploadMb] = useState(5);

  // Confirmation Modal
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [confirmReason, setConfirmReason] = useState('');

  const isMobile = width < 768;

  const fetchSettings = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    setSuccessMsg(null);

    try {
      const data = await platformApplicationsApi.getSettings();
      setRuntimeSettings(data.runtime_settings);
      setReadOnlyConfig(data.read_only_config);

      // Populate draft form
      setPlatformName(data.runtime_settings.platform_name);
      setSupportEmail(data.runtime_settings.platform_support_email);
      setAllowClubReg(data.runtime_settings.allow_new_club_registrations);
      setAllowUserReg(data.runtime_settings.allow_user_registrations);
      setMaintenanceMode(data.runtime_settings.maintenance_mode);
      setMaxUploadMb(data.runtime_settings.max_upload_size_mb);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to load platform settings';
      setError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Compute dirty state
  const hasChanges = Boolean(
    runtimeSettings &&
      (platformName.trim() !== runtimeSettings.platform_name ||
        supportEmail.trim().toLowerCase() !== runtimeSettings.platform_support_email.toLowerCase() ||
        allowClubReg !== runtimeSettings.allow_new_club_registrations ||
        allowUserReg !== runtimeSettings.allow_user_registrations ||
        maintenanceMode !== runtimeSettings.maintenance_mode ||
        maxUploadMb !== runtimeSettings.max_upload_size_mb)
  );

  // Check if consequential changes are being made (e.g. pausing registrations or enabling maintenance)
  const isConsequential = Boolean(
    runtimeSettings &&
      ((runtimeSettings.allow_new_club_registrations && !allowClubReg) ||
        (runtimeSettings.allow_user_registrations && !allowUserReg) ||
        (!runtimeSettings.maintenance_mode && maintenanceMode))
  );

  const handleDiscard = () => {
    if (!runtimeSettings) return;
    setPlatformName(runtimeSettings.platform_name);
    setSupportEmail(runtimeSettings.platform_support_email);
    setAllowClubReg(runtimeSettings.allow_new_club_registrations);
    setAllowUserReg(runtimeSettings.allow_user_registrations);
    setMaintenanceMode(runtimeSettings.maintenance_mode);
    setMaxUploadMb(runtimeSettings.max_upload_size_mb);
    setError(null);
  };

  const handlePreSave = () => {
    setError(null);
    setSuccessMsg(null);

    // Client-side validations
    if (platformName.trim().length < 2) {
      setError('Platform name must be at least 2 characters.');
      return;
    }
    if (!supportEmail.trim().includes('@')) {
      setError('Please provide a valid support contact email address.');
      return;
    }

    if (isConsequential) {
      setConfirmReason('');
      setConfirmModalVisible(true);
    } else {
      executeSave();
    }
  };

  const executeSave = async (reason?: string) => {
    setIsSaving(true);
    setError(null);
    setConfirmModalVisible(false);

    try {
      const payload: PlatformSettingsUpdateRequest = {
        platform_name: platformName.trim(),
        platform_support_email: supportEmail.trim().toLowerCase(),
        allow_new_club_registrations: allowClubReg,
        allow_user_registrations: allowUserReg,
        maintenance_mode: maintenanceMode,
        max_upload_size_mb: maxUploadMb,
        reason: reason?.trim() || undefined,
      };

      const updated = await platformApplicationsApi.updateSettings(payload);
      setRuntimeSettings(updated.runtime_settings);
      setReadOnlyConfig(updated.read_only_config);
      setSuccessMsg('Platform settings updated successfully and logged in audit trail.');
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to update platform settings';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const uploadSizeOptions = [2, 5, 10, 15, 25];

  return (
    <PlatformShell
      activeTab="settings"
      onRefresh={() => fetchSettings(true)}
      isRefreshing={isRefreshing}
      scrollable
    >
      {isLoading ? (
        <LoadingState message="Loading platform configuration..." />
      ) : error && !runtimeSettings ? (
        <ErrorState message={error} onRetry={() => fetchSettings(true)} />
      ) : (
        <View style={styles.container}>
          {/* ─── 1. SETTINGS OVERVIEW MENU VIEW ───────────────────────────── */}
          {currentView === 'menu' && (
            <>
              {/* Page Heading & Subtitle */}
              <View style={styles.headerSection}>
                <AppText style={styles.screenTitle}>Settings</AppText>
                <AppText style={styles.screenSubtitle}>
                  Operational parameters & global configuration
                </AppText>
              </View>

              {/* ─── SECTION 1: PLATFORM CONFIGURATION ────────────────────────── */}
              <View style={styles.sectionContainer}>
                {/* Section Header */}
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionIconWrap}>
                    <SettingsIcon size={20} color="#15803D" strokeWidth={2} />
                  </View>
                  <View style={styles.sectionTitleBlock}>
                    <AppText style={styles.sectionTitle}>Platform Configuration</AppText>
                    <AppText style={styles.sectionSubtitle}>
                      Manage core platform settings and operational controls
                    </AppText>
                  </View>
                </View>

                {/* Row 1: Operational Controls */}
                <TouchableOpacity
                  style={styles.navRow}
                  onPress={() => setCurrentView('operational')}
                  activeOpacity={0.7}
                >
                  <View style={styles.navRowLeft}>
                    <View style={styles.rowIconWrap}>
                      <Sliders size={18} color="#15803D" strokeWidth={2} />
                    </View>
                    <View style={styles.rowTextCol}>
                      <AppText style={styles.rowTitle}>Operational Controls</AppText>
                      <AppText style={styles.rowDesc}>
                        Platform settings, defaults, limits and configurations
                      </AppText>
                    </View>
                  </View>
                  <ChevronRight size={18} color="#94A3B8" strokeWidth={2} style={styles.chevron} />
                </TouchableOpacity>

                {/* Row 2: Applications & Features */}
                <TouchableOpacity
                  style={[styles.navRow, styles.navRowLast]}
                  onPress={() => router.push('/platform/applications' as any)}
                  activeOpacity={0.7}
                >
                  <View style={styles.navRowLeft}>
                    <View style={styles.rowIconWrap}>
                      <Building2 size={18} color="#15803D" strokeWidth={2} />
                    </View>
                    <View style={styles.rowTextCol}>
                      <AppText style={styles.rowTitle}>Applications & Features</AppText>
                      <AppText style={styles.rowDesc}>
                        Manage features, access and platform modules
                      </AppText>
                    </View>
                  </View>
                  <ChevronRight size={18} color="#94A3B8" strokeWidth={2} style={styles.chevron} />
                </TouchableOpacity>
              </View>

              {/* ─── SECTION 2: LEGAL & HELP CONTENT ─────────────────────────── */}
              <View style={styles.sectionContainer}>
                {/* Section Header */}
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionIconWrap}>
                    <FileText size={20} color="#15803D" strokeWidth={2} />
                  </View>
                  <View style={styles.sectionTitleBlock}>
                    <AppText style={styles.sectionTitle}>Legal & Help Content</AppText>
                    <AppText style={styles.sectionSubtitle}>
                      Manage help content, legal documents and policies
                    </AppText>
                  </View>
                </View>

                {/* Row 1: Help & FAQs */}
                <TouchableOpacity
                  style={styles.navRow}
                  onPress={() => setCurrentView('help')}
                  activeOpacity={0.7}
                >
                  <View style={styles.navRowLeft}>
                    <View style={styles.rowIconWrap}>
                      <HelpCircle size={18} color="#15803D" strokeWidth={2} />
                    </View>
                    <View style={styles.rowTextCol}>
                      <AppText style={styles.rowTitle}>Help & FAQs</AppText>
                      <AppText style={styles.rowDesc}>
                        Create and manage help articles and FAQs
                      </AppText>
                    </View>
                  </View>
                  <ChevronRight size={18} color="#94A3B8" strokeWidth={2} style={styles.chevron} />
                </TouchableOpacity>

                {/* Row 2: Player Terms of Service */}
                <TouchableOpacity
                  style={styles.navRow}
                  onPress={() => setCurrentView('player_terms')}
                  activeOpacity={0.7}
                >
                  <View style={styles.navRowLeft}>
                    <View style={styles.rowIconWrap}>
                      <FileText size={18} color="#15803D" strokeWidth={2} />
                    </View>
                    <View style={styles.rowTextCol}>
                      <AppText style={styles.rowTitle}>Player Terms of Service</AppText>
                      <AppText style={styles.rowDesc}>
                        Manage player terms and version history
                      </AppText>
                    </View>
                  </View>
                  <ChevronRight size={18} color="#94A3B8" strokeWidth={2} style={styles.chevron} />
                </TouchableOpacity>

                {/* Row 3: Club Terms of Service */}
                <TouchableOpacity
                  style={styles.navRow}
                  onPress={() => setCurrentView('club_terms')}
                  activeOpacity={0.7}
                >
                  <View style={styles.navRowLeft}>
                    <View style={styles.rowIconWrap}>
                      <FileText size={18} color="#15803D" strokeWidth={2} />
                    </View>
                    <View style={styles.rowTextCol}>
                      <AppText style={styles.rowTitle}>Club Terms of Service</AppText>
                      <AppText style={styles.rowDesc}>
                        Manage club/facility terms and version history
                      </AppText>
                    </View>
                  </View>
                  <ChevronRight size={18} color="#94A3B8" strokeWidth={2} style={styles.chevron} />
                </TouchableOpacity>

                {/* Row 4: Privacy Policy */}
                <TouchableOpacity
                  style={[styles.navRow, styles.navRowLast]}
                  onPress={() => setCurrentView('privacy_policy')}
                  activeOpacity={0.7}
                >
                  <View style={styles.navRowLeft}>
                    <View style={styles.rowIconWrap}>
                      <Shield size={18} color="#15803D" strokeWidth={2} />
                    </View>
                    <View style={styles.rowTextCol}>
                      <AppText style={styles.rowTitle}>Privacy Policy</AppText>
                      <AppText style={styles.rowDesc}>
                        Manage privacy policy and version history
                      </AppText>
                    </View>
                  </View>
                  <ChevronRight size={18} color="#94A3B8" strokeWidth={2} style={styles.chevron} />
                </TouchableOpacity>
              </View>

              {/* ─── SECTION 3: USERS & ACCESS ────────────────────────────────── */}
              <View style={[styles.sectionContainer, styles.sectionContainerLast]}>
                {/* Section Header */}
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionIconWrap}>
                    <UserCheck size={20} color="#15803D" strokeWidth={2} />
                  </View>
                  <View style={styles.sectionTitleBlock}>
                    <AppText style={styles.sectionTitle}>Users & Access</AppText>
                    <AppText style={styles.sectionSubtitle}>
                      Manage platform users, roles and permissions
                    </AppText>
                  </View>
                </View>

                {/* Row 1: User Management */}
                <TouchableOpacity
                  style={[styles.navRow, styles.navRowLast]}
                  onPress={() => router.push('/platform/users' as any)}
                  activeOpacity={0.7}
                >
                  <View style={styles.navRowLeft}>
                    <View style={styles.rowIconWrap}>
                      <Users size={18} color="#15803D" strokeWidth={2} />
                    </View>
                    <View style={styles.rowTextCol}>
                      <AppText style={styles.rowTitle}>User Management</AppText>
                      <AppText style={styles.rowDesc}>
                        Manage admin users and access roles
                      </AppText>
                    </View>
                  </View>
                  <ChevronRight size={18} color="#94A3B8" strokeWidth={2} style={styles.chevron} />
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ─── 2. LEGAL & HELP SUB-VIEWS ─────────────────────────────────── */}
          {(currentView === 'help' ||
            currentView === 'player_terms' ||
            currentView === 'club_terms' ||
            currentView === 'privacy_policy') && (
            <LegalAndHelpManager
              initialSection={currentView}
              onBack={() => setCurrentView('menu')}
            />
          )}

          {/* ─── 3. OPERATIONAL CONTROLS SUB-VIEW ──────────────────────────── */}
          {currentView === 'operational' && (
            <>
              {/* Back to Settings Header */}
              <TouchableOpacity
                style={styles.backButtonRow}
                onPress={() => setCurrentView('menu')}
                activeOpacity={0.7}
              >
                <ArrowLeft size={18} color="#0F172A" strokeWidth={2.2} />
                <AppText style={styles.backButtonText}>Back to Settings</AppText>
              </TouchableOpacity>

              <View style={styles.headerSection}>
                <AppText style={styles.screenTitle}>Operational Controls</AppText>
                <AppText style={styles.screenSubtitle}>
                  Platform settings, defaults, limits and configurations
                </AppText>
              </View>

              {/* Success Banner */}
              {successMsg && (
                <View style={styles.successBanner}>
                  <CheckCircle2 size={18} color="#15803D" />
                  <AppText style={styles.successBannerText}>{successMsg}</AppText>
                </View>
              )}

              {/* Error Banner */}
              {error && (
                <View style={styles.errorBanner}>
                  <AlertCircle size={18} color="#DC2626" />
                  <AppText style={styles.errorBannerText}>{error}</AppText>
                </View>
              )}

              {/* SECTION 1: PUBLIC REGISTRATION GATES */}
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionIconTileGreen}>
                  <ShieldCheck size={20} color="#15803D" strokeWidth={2} />
                </View>
                <View style={styles.sectionTitleBlock}>
                  <AppText style={styles.opSectionTitle}>Public Registration Gates</AppText>
                  <AppText style={styles.sectionSubtitle}>
                    Runtime controls to open or temporarily pause self-service onboarding
                  </AppText>
                </View>
              </View>

              <View style={styles.card}>
                {/* Gate 1: Club Registrations */}
                <View style={styles.settingRowWithTile}>
                  <View style={styles.itemIconTileGreen}>
                    <Building2 size={20} color="#15803D" strokeWidth={1.8} />
                  </View>
                  <View style={styles.settingContentCol}>
                    <View style={styles.settingLabelRow}>
                      <AppText style={styles.settingLabel}>Club Registration Applications</AppText>
                      <View style={[styles.statusPill, allowClubReg ? styles.statusPillAccepting : styles.statusPillPaused]}>
                        <AppText style={[styles.statusPillText, allowClubReg ? styles.statusPillTextAccepting : styles.statusPillTextPaused]}>
                          {allowClubReg ? 'ACCEPTING' : 'PAUSED'}
                        </AppText>
                      </View>
                    </View>
                    <AppText style={styles.settingDescription}>
                      When enabled, prospective facilities can submit onboarding requests via /club-applications. When paused, public submissions are rejected with a maintenance notice.
                    </AppText>
                  </View>
                  <Switch
                    value={allowClubReg}
                    onValueChange={setAllowClubReg}
                    trackColor={{ false: '#CBD5E1', true: '#22C55E' }}
                    thumbColor="#FFFFFF"
                    style={styles.switchControl}
                  />
                </View>

                <View style={styles.divider} />

                {/* Gate 2: Player Registrations */}
                <View style={styles.settingRowWithTile}>
                  <View style={styles.itemIconTileGreen}>
                    <Users size={20} color="#15803D" strokeWidth={1.8} />
                  </View>
                  <View style={styles.settingContentCol}>
                    <View style={styles.settingLabelRow}>
                      <AppText style={styles.settingLabel}>Player Account Registration</AppText>
                      <View style={[styles.statusPill, allowUserReg ? styles.statusPillAccepting : styles.statusPillPaused]}>
                        <AppText style={[styles.statusPillText, allowUserReg ? styles.statusPillTextAccepting : styles.statusPillTextPaused]}>
                          {allowUserReg ? 'ACCEPTING' : 'PAUSED'}
                        </AppText>
                      </View>
                    </View>
                    <AppText style={styles.settingDescription}>
                      Controls whether new players can self-register accounts on the mobile app. Existing player logins and club staff sessions remain unaffected.
                    </AppText>
                  </View>
                  <Switch
                    value={allowUserReg}
                    onValueChange={setAllowUserReg}
                    trackColor={{ false: '#CBD5E1', true: '#22C55E' }}
                    thumbColor="#FFFFFF"
                    style={styles.switchControl}
                  />
                </View>
              </View>

              {/* SECTION 2: PLATFORM OPERATIONAL PARAMETERS */}
              <View style={[styles.sectionHeaderRow, { marginTop: 6 }]}>
                <View style={styles.sectionIconTileBlue}>
                  <Sliders size={20} color="#2563EB" strokeWidth={2} />
                </View>
                <View style={styles.sectionTitleBlock}>
                  <AppText style={styles.opSectionTitle}>Platform Operational Parameters</AppText>
                  <AppText style={styles.sectionSubtitle}>
                    Editable global parameters applied across mobile and server runtime
                  </AppText>
                </View>
              </View>

              {/* Card 1: Platform Display Name */}
              <View style={styles.card}>
                <View style={styles.fieldHeaderRow}>
                  <AppText style={styles.settingLabel}>Platform Display Name</AppText>
                  <AppText style={styles.fieldHelperTop}>Max 64 chars</AppText>
                </View>
                <View style={styles.inputWrapper}>
                  <Tag size={17} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    value={platformName}
                    onChangeText={setPlatformName}
                    placeholder="e.g. Pickleball"
                    placeholderTextColor="#94A3B8"
                    maxLength={64}
                  />
                </View>
                <AppText style={styles.fieldDescription}>
                  Global title displayed in client navigation headers, emails, and platform notices.
                </AppText>
              </View>

              {/* Card 2: Global Support Contact Email */}
              <View style={styles.card}>
                <View style={styles.fieldHeaderRow}>
                  <AppText style={styles.settingLabel}>Global Support Contact Email</AppText>
                </View>
                <View style={styles.inputWrapper}>
                  <Mail size={17} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    value={supportEmail}
                    onChangeText={setSupportEmail}
                    placeholder="support@pickleball.com"
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>
                <AppText style={styles.fieldDescription}>
                  Official contact address routed to the platform support queue and email footers.
                </AppText>
              </View>

              {/* Card 3: Maximum Media Upload Limit */}
              <View style={styles.card}>
                <View style={styles.fieldHeaderRow}>
                  <AppText style={styles.settingLabel}>Maximum Media Upload Limit</AppText>
                  <View style={styles.neutralBadgePill}>
                    <AppText style={styles.neutralBadgePillText}>{maxUploadMb} MB</AppText>
                  </View>
                </View>
                <View style={styles.chipsRow}>
                  {uploadSizeOptions.map((mb) => {
                    const isSelected = maxUploadMb === mb;
                    return (
                      <TouchableOpacity
                        key={mb}
                        style={[styles.uploadChip, isSelected && styles.uploadChipActive]}
                        onPress={() => setMaxUploadMb(mb)}
                        activeOpacity={0.7}
                      >
                        <AppText style={[styles.uploadChipText, isSelected && styles.uploadChipTextActive]}>
                          {mb} MB
                        </AppText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <AppText style={styles.fieldDescription}>
                  Enforced server-side during club logo, banner, and court photo uploads.
                </AppText>
              </View>

              {/* Card 4: Platform Maintenance Notice */}
              <View style={styles.card}>
                <View style={styles.settingRowWithTile}>
                  <View style={styles.itemIconTileAmber}>
                    <AlertTriangle size={20} color="#D97706" strokeWidth={1.8} />
                  </View>
                  <View style={styles.settingContentCol}>
                    <View style={styles.settingLabelRow}>
                      <AppText style={styles.settingLabel}>Platform Maintenance Notice</AppText>
                      <View style={[styles.statusPill, maintenanceMode ? styles.statusPillAmber : styles.statusPillNeutral]}>
                        <AppText style={[styles.statusPillText, maintenanceMode ? styles.statusPillTextAmber : styles.statusPillTextNeutral]}>
                          {maintenanceMode ? 'ACTIVE' : 'OFF'}
                        </AppText>
                      </View>
                    </View>
                    <AppText style={styles.settingDescription}>
                      Broadcasts a top-level maintenance banner to all connected players and club operators informing them of scheduled infrastructure operations.
                    </AppText>
                  </View>
                  <Switch
                    value={maintenanceMode}
                    onValueChange={setMaintenanceMode}
                    trackColor={{ false: '#CBD5E1', true: '#F59E0B' }}
                    thumbColor="#FFFFFF"
                    style={styles.switchControl}
                  />
                </View>
              </View>

              {/* Save / Discard Actions Bar */}
              <View style={styles.saveActionBar}>
                <Button
                  label="Discard Changes"
                  variant="outline"
                  size="md"
                  onPress={handleDiscard}
                  disabled={!hasChanges || isSaving}
                  style={styles.discardBtn}
                />
                <PlatformButton
                  size="md"
                  label={isSaving ? 'Saving...' : 'Save Settings'}
                  leftIcon={<Save size={16} color="#FFFFFF" />}
                  onPress={handlePreSave}
                  disabled={!hasChanges || isSaving}
                  loading={isSaving}
                  style={styles.saveBtn}
                />
              </View>

              {/* SECTION 3: SYSTEM ENVIRONMENT & SECURITY CONFIGURATION (READ-ONLY) */}
              <View style={[styles.sectionHeaderRow, { marginTop: 10 }]}>
                <View style={styles.sectionIconTilePurple}>
                  <Server size={20} color="#7E22CE" strokeWidth={2} />
                </View>
                <View style={styles.sectionTitleBlock}>
                  <AppText style={styles.opSectionTitle}>
                    System Infrastructure & Security (Read-Only)
                  </AppText>
                  <AppText style={styles.sectionSubtitle}>
                    Active server environment parameters · Secrets are never exposed
                  </AppText>
                </View>
              </View>

              <View style={styles.card}>
                <View style={styles.securityCallout}>
                  <Lock size={16} color="#15803D" />
                  <AppText style={styles.securityCalloutText}>
                    Database connection strings, JWT signing keys, and cloud storage credentials are securely managed via environment variables and deployment configurations. They are strictly prohibited from client exposure.
                  </AppText>
                </View>

                {readOnlyConfig && (
                  <View style={styles.readonlyGrid}>
                    <View style={styles.readonlyItem}>
                      <AppText variant="caption" color="secondary">Application & Version</AppText>
                      <AppText style={styles.readonlyValue}>
                        {readOnlyConfig.app_name} (v{readOnlyConfig.app_version})
                      </AppText>
                    </View>

                    <View style={styles.readonlyItem}>
                      <AppText variant="caption" color="secondary">Environment Mode</AppText>
                      <View style={styles.envPillRow}>
                        <View style={[styles.envDot, { backgroundColor: readOnlyConfig.app_env === 'production' ? '#15803D' : '#D97706' }]} />
                        <AppText style={styles.readonlyValue}>{readOnlyConfig.app_env.toUpperCase()}</AppText>
                      </View>
                    </View>

                    <View style={styles.readonlyItem}>
                      <AppText variant="caption" color="secondary">Storage Engine</AppText>
                      <AppText style={styles.readonlyValue}>
                        {readOnlyConfig.storage_backend.toUpperCase()} ({readOnlyConfig.upload_base_url})
                      </AppText>
                    </View>

                    <View style={styles.readonlyItem}>
                      <AppText variant="caption" color="secondary">JWT Algorithm & Lifetime</AppText>
                      <AppText style={styles.readonlyValue}>
                        {readOnlyConfig.jwt_algorithm} · {readOnlyConfig.access_token_expire_minutes}m access / {readOnlyConfig.refresh_token_expire_days}d refresh
                      </AppText>
                    </View>

                    <View style={styles.readonlyFullItem}>
                      <AppText variant="caption" color="secondary" style={styles.subItemLabel}>
                        Configured Platform Owner Accounts ({readOnlyConfig.platform_owner_emails.length})
                      </AppText>
                      <View style={styles.pillsWrap}>
                        {readOnlyConfig.platform_owner_emails.map((email) => (
                          <View key={email} style={styles.emailChip}>
                            <UserCheck size={12} color="#15803D" />
                            <AppText style={styles.emailChipText}>{email}</AppText>
                          </View>
                        ))}
                      </View>
                    </View>

                    <View style={styles.readonlyFullItem}>
                      <AppText variant="caption" color="secondary" style={styles.subItemLabel}>
                        Permitted Web CORS Origins ({readOnlyConfig.cors_origins.length})
                      </AppText>
                      <View style={styles.pillsWrap}>
                        {readOnlyConfig.cors_origins.map((origin) => (
                          <View key={origin} style={styles.originChip}>
                            <Globe size={12} color="#2563EB" />
                            <AppText style={styles.originChipText}>{origin}</AppText>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                )}
              </View>

              {/* SECTION 4: AUDIT HISTORY SHORTCUT */}
              <TouchableOpacity
                style={styles.auditShortcutCard}
                onPress={() => router.push('/platform/audit?search=platform_settings' as any)}
                activeOpacity={0.8}
              >
                <View style={styles.auditShortcutLeft}>
                  <View style={styles.auditShortcutIconWrap}>
                    <History size={18} color="#15803D" />
                  </View>
                  <View style={styles.auditShortcutTextWrap}>
                    <AppText style={styles.auditShortcutTitle}>Settings Audit Trail</AppText>
                    <AppText style={styles.auditShortcutSubtitle}>
                      Inspect immutable historical timestamps, actors, and before/after values for all settings changes.
                    </AppText>
                  </View>
                </View>
                <ArrowRight size={18} color="#15803D" />
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Consequential Changes Confirmation Modal */}
      <Modal
        visible={confirmModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalCard}>
            <View style={styles.confirmModalHeader}>
              <View style={styles.confirmWarningIcon}>
                <AlertTriangle size={20} color="#D97706" />
              </View>
              <View style={styles.confirmTitleGroup}>
                <AppText variant="heading3" color="primary">Confirm Consequential Change</AppText>
                <AppText variant="caption" color="secondary">
                  You are modifying platform registration gates or maintenance mode.
                </AppText>
              </View>
            </View>

            <View style={styles.confirmModalBody}>
              <AppText variant="bodySmall" color="secondary">
                Please provide an administrative reason for this configuration change to record in the Platform Audit Log:
              </AppText>
              <TextInput
                style={styles.reasonInput}
                placeholder="e.g. Pausing onboarding for scheduled database maintenance..."
                placeholderTextColor="#94A3B8"
                value={confirmReason}
                onChangeText={setConfirmReason}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.confirmModalActions}>
              <Button
                label="Cancel"
                variant="outline"
                size="md"
                onPress={() => setConfirmModalVisible(false)}
                style={styles.confirmCancelBtn}
              />
              <PlatformButton
                size="md"
                label="Confirm & Apply"
                onPress={() => executeSave(confirmReason)}
                loading={isSaving}
                style={styles.confirmApplyBtn}
              />
            </View>
          </View>
        </View>
      </Modal>
    </PlatformShell>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 80, // Clearance for fixed platform bottom navigation
  },
  headerSection: {
    paddingTop: 4,
    paddingBottom: 16,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
    lineHeight: 34,
    ...Platform.select({
      web: {
        fontSize: 'clamp(26px, 6vw, 30px)' as any,
      },
    }),
  },
  screenSubtitle: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    marginTop: 4,
  },
  backButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    marginBottom: 4,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },

  // ─── Reference Section Containers ───────────────────────────────────────────
  sectionContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 16,
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
  sectionContainerLast: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sectionTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 17,
  },
  opSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },

  // ─── Reference Navigation Rows ──────────────────────────────────────────────
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  navRowLast: {
    marginBottom: 0,
  },
  navRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 8,
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowTextCol: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  rowDesc: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  chevron: {
    flexShrink: 0,
  },

  // ─── Operational Controls Sub-view Styles ───────────────────────────────────
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 10,
    borderRadius: Radius.lg,
    marginBottom: 12,
  },
  successBannerText: {
    fontSize: 13,
    color: '#15803D',
    fontWeight: '600',
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 10,
    borderRadius: Radius.lg,
    marginBottom: 12,
  },
  errorBannerText: {
    fontSize: 13,
    color: '#DC2626',
    fontWeight: '600',
    flex: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
    marginBottom: 8,
  },
  sectionIconTileGreen: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EAF8F0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sectionIconTileBlue: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sectionIconTilePurple: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 14,
    marginBottom: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
      },
    }),
  },
  settingRowWithTile: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  itemIconTileGreen: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#EAF8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  itemIconTileAmber: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  settingContentCol: {
    flex: 1,
    minWidth: 0,
  },
  settingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  settingDescription: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
  },
  switchControl: {
    marginTop: 2,
    marginLeft: 6,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusPillAccepting: {
    backgroundColor: '#DCFCE7',
  },
  statusPillPaused: {
    backgroundColor: '#FEE2E2',
  },
  statusPillAmber: {
    backgroundColor: '#FEF3C7',
  },
  statusPillNeutral: {
    backgroundColor: '#F1F5F9',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusPillTextAccepting: {
    color: '#15803D',
  },
  statusPillTextPaused: {
    color: '#DC2626',
  },
  statusPillTextAmber: {
    color: '#D97706',
  },
  statusPillTextNeutral: {
    color: '#64748B',
  },
  fieldHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fieldHelperTop: {
    fontSize: 11,
    color: '#94A3B8',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 6,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    height: '100%',
  },
  fieldDescription: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
  },
  neutralBadgePill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  neutralBadgePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  uploadChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  uploadChipActive: {
    backgroundColor: '#15803D',
    borderColor: '#15803D',
  },
  uploadChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  uploadChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  saveActionBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    marginBottom: 14,
  },
  discardBtn: {
    minWidth: 120,
  },
  saveBtn: {
    minWidth: 140,
  },
  securityCallout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  securityCalloutText: {
    fontSize: 11.5,
    color: '#166534',
    lineHeight: 17,
    flex: 1,
  },
  readonlyGrid: {
    gap: 10,
  },
  readonlyItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
  },
  readonlyValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  envPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  envDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  readonlyFullItem: {
    marginTop: 2,
  },
  subItemLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
  },
  pillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  emailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  emailChipText: {
    fontSize: 11,
    color: '#065F46',
    fontWeight: '600',
  },
  originChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  originChipText: {
    fontSize: 11,
    color: '#1E40AF',
    fontWeight: '600',
  },
  auditShortcutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginTop: 4,
  },
  auditShortcutLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 8,
  },
  auditShortcutIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#EAF8F0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  auditShortcutTextWrap: {
    flex: 1,
  },
  auditShortcutTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  auditShortcutSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },

  // ─── Modal Styles ───────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  confirmModalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
  },
  confirmModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  confirmWarningIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  confirmTitleGroup: {
    flex: 1,
  },
  confirmModalBody: {
    gap: 8,
    marginBottom: 16,
  },
  reasonInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 70,
    textAlignVertical: 'top',
  },
  confirmModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  confirmCancelBtn: {
    minWidth: 90,
  },
  confirmApplyBtn: {
    minWidth: 130,
  },
});
