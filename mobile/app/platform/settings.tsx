/**
 * Aught2 Pickleball — Platform Settings Screen
 *
 * Dedicated administrative configuration interface for authorized platform owners:
 * - Runtime-enforced operational controls:
 *   * Public Club Registration Gate (allow_new_club_registrations)
 *   * Player Self-Registration Gate (allow_user_registrations)
 *   * Maintenance Notice Mode (maintenance_mode)
 *   * Global Support Contact Email (platform_support_email)
 *   * Max Media Upload Limit (max_upload_size_mb)
 *   * Global Platform Branding Title (platform_name)
 * - Sanitized Read-Only System Infrastructure & Policy:
 *   * App Version, Environment, Log Level, Storage Backend, Token Lifecycles,
 *     Platform Owner Accounts, and Allowed CORS Origins (PROHIBITS ALL SECRETS).
 * - Consequential change confirmation dialog with administrative reason.
 * - Platform Audit Log tracking and instant runtime enforcement.
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
  ArrowRight,
  CheckCircle2,
  Clock,
  Database,
  Globe,
  HardDrive,
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
} from '@/components';
import {
  PlatformReadOnlyConfig,
  PlatformRuntimeSettings,
  PlatformSettingsResponse,
  PlatformSettingsUpdateRequest,
  platformApplicationsApi,
} from '@/services/api/clubApplications';
import { Colors, Radius, Spacing } from '@/theme';

export default function PlatformSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

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
      setError('Platform name must be at least 2 characters long.');
      return;
    }
    if (!supportEmail.trim().includes('@') || !supportEmail.trim().includes('.')) {
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
          {/* Page Heading & Subtitle */}
          <View style={styles.headerSection}>
            <AppText style={styles.screenTitle}>Settings</AppText>
            <AppText style={styles.screenSubtitle}>
              Operational parameters & global configuration
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
            <View style={styles.sectionTitleBlock}>
              <View style={styles.sectionIconPill}>
                <ShieldCheck size={16} color="#18794E" />
              </View>
              <View>
                <AppText variant="heading3" color="primary" style={styles.sectionTitle}>
                  Public Registration Gates
                </AppText>
                <AppText variant="caption" color="secondary">
                  Runtime controls to open or temporarily pause self-service onboarding
                </AppText>
              </View>
            </View>
          </View>

          <Card style={styles.cardGroup}>
            {/* Gate 1: Club Registrations */}
            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <View style={styles.settingLabelRow}>
                  <AppText style={styles.settingLabel}>Club Registration Applications</AppText>
                  <Badge
                    label={allowClubReg ? 'ACCEPTING' : 'PAUSED'}
                    variant={allowClubReg ? 'success' : 'warning'}
                    size="sm"
                  />
                </View>
                <AppText variant="caption" color="secondary" style={styles.settingDescription}>
                  When enabled, prospective facilities can submit onboarding requests via /club-applications. When paused, public submissions are rejected with a maintenance notice.
                </AppText>
              </View>
              <Switch
                value={allowClubReg}
                onValueChange={setAllowClubReg}
                trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                thumbColor={allowClubReg ? '#18794E' : '#F1F5F9'}
              />
            </View>

            <View style={styles.settingDivider} />

            {/* Gate 2: Player Registrations */}
            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <View style={styles.settingLabelRow}>
                  <AppText style={styles.settingLabel}>Player Account Registration</AppText>
                  <Badge
                    label={allowUserReg ? 'ACCEPTING' : 'PAUSED'}
                    variant={allowUserReg ? 'success' : 'warning'}
                    size="sm"
                  />
                </View>
                <AppText variant="caption" color="secondary" style={styles.settingDescription}>
                  Controls whether new players can self-register accounts on the mobile app. Existing player logins and club staff sessions remain unaffected.
                </AppText>
              </View>
              <Switch
                value={allowUserReg}
                onValueChange={setAllowUserReg}
                trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                thumbColor={allowUserReg ? '#18794E' : '#F1F5F9'}
              />
            </View>
          </Card>

          {/* SECTION 2: OPERATIONAL PARAMETERS */}
          <View style={[styles.sectionHeaderRow, { marginTop: Spacing.md }]}>
            <View style={styles.sectionTitleBlock}>
              <View style={[styles.sectionIconPill, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                <Sliders size={16} color="#2563EB" />
              </View>
              <View>
                <AppText variant="heading3" color="primary" style={styles.sectionTitle}>
                  Platform Operational Parameters
                </AppText>
                <AppText variant="caption" color="secondary">
                  Editable global parameters applied across mobile and server runtime
                </AppText>
              </View>
            </View>
          </View>

          <Card style={styles.cardGroup}>
            {/* Setting: Platform Name */}
            <View style={styles.inputGroup}>
              <View style={styles.inputLabelRow}>
                <AppText style={styles.settingLabel}>Platform Display Name</AppText>
                <AppText variant="caption" color="tertiary">Max 64 chars</AppText>
              </View>
              <View style={styles.inputWrapper}>
                <Tag size={16} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={platformName}
                  onChangeText={setPlatformName}
                  placeholder="e.g. Aught2 Pickleball"
                  placeholderTextColor="#94A3B8"
                  maxLength={64}
                />
              </View>
              <AppText variant="caption" color="secondary" style={styles.inputHelper}>
                Global title displayed in client navigation headers, emails, and platform notices.
              </AppText>
            </View>

            <View style={styles.settingDivider} />

            {/* Setting: Support Email */}
            <View style={styles.inputGroup}>
              <View style={styles.inputLabelRow}>
                <AppText style={styles.settingLabel}>Global Support Contact Email</AppText>
              </View>
              <View style={styles.inputWrapper}>
                <Mail size={16} color="#64748B" style={styles.inputIcon} />
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
              <AppText variant="caption" color="secondary" style={styles.inputHelper}>
                Official contact address routed to the platform support queue and email footers.
              </AppText>
            </View>

            <View style={styles.settingDivider} />

            {/* Setting: Max Upload Size */}
            <View style={styles.inputGroup}>
              <View style={styles.inputLabelRow}>
                <AppText style={styles.settingLabel}>Maximum Media Upload Limit</AppText>
                <Badge label={`${maxUploadMb} MB`} variant="default" size="sm" />
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
              <AppText variant="caption" color="secondary" style={styles.inputHelper}>
                Enforced server-side during club logo, banner, and court photo uploads.
              </AppText>
            </View>

            <View style={styles.settingDivider} />

            {/* Setting: Maintenance Notice Mode */}
            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <View style={styles.settingLabelRow}>
                  <AppText style={styles.settingLabel}>Platform Maintenance Notice</AppText>
                  <Badge
                    label={maintenanceMode ? 'ACTIVE' : 'OFF'}
                    variant={maintenanceMode ? 'warning' : 'default'}
                    size="sm"
                  />
                </View>
                <AppText variant="caption" color="secondary" style={styles.settingDescription}>
                  Broadcasts a top-level maintenance banner to all connected players and club operators informing them of scheduled infrastructure operations.
                </AppText>
              </View>
              <Switch
                value={maintenanceMode}
                onValueChange={setMaintenanceMode}
                trackColor={{ false: '#CBD5E1', true: '#FDE68A' }}
                thumbColor={maintenanceMode ? '#D97706' : '#F1F5F9'}
              />
            </View>
          </Card>

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
              leftIcon={<Save size={15} color="#FFFFFF" />}
              onPress={handlePreSave}
              disabled={!hasChanges || isSaving}
              loading={isSaving}
              style={styles.saveBtn}
            />
          </View>

          {/* SECTION 3: SYSTEM ENVIRONMENT & SECURITY CONFIGURATION (READ-ONLY) */}
          <View style={[styles.sectionHeaderRow, { marginTop: Spacing.lg }]}>
            <View style={styles.sectionTitleBlock}>
              <View style={[styles.sectionIconPill, { backgroundColor: '#F3E8FF', borderColor: '#E9D5FF' }]}>
                <Server size={16} color="#7E22CE" />
              </View>
              <View>
                <AppText variant="heading3" color="primary" style={styles.sectionTitle}>
                  System Infrastructure & Security (Read-Only)
                </AppText>
                <AppText variant="caption" color="secondary">
                  Active server environment parameters · Secrets are never exposed
                </AppText>
              </View>
            </View>
          </View>

          <Card style={styles.cardGroup}>
            {/* Security Guard Callout */}
            <View style={styles.securityCallout}>
              <Lock size={16} color="#18794E" />
              <AppText variant="caption" style={styles.securityCalloutText}>
                Database connection strings, JWT signing keys, and cloud storage credentials are securely managed via environment variables and deployment configurations. They are strictly prohibited from client exposure.
              </AppText>
            </View>

            {readOnlyConfig && (
              <View style={styles.readonlyGrid}>
                {/* Row 1 */}
                <View style={styles.readonlyItem}>
                  <AppText variant="caption" color="secondary">Application & Version</AppText>
                  <AppText style={styles.readonlyValue}>
                    {readOnlyConfig.app_name} (v{readOnlyConfig.app_version})
                  </AppText>
                </View>

                <View style={styles.readonlyItem}>
                  <AppText variant="caption" color="secondary">Environment Mode</AppText>
                  <View style={styles.envPillRow}>
                    <View style={[styles.envDot, { backgroundColor: readOnlyConfig.app_env === 'production' ? '#18794E' : '#D97706' }]} />
                    <AppText style={styles.readonlyValue}>{readOnlyConfig.app_env.toUpperCase()}</AppText>
                  </View>
                </View>

                {/* Row 2 */}
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

                {/* Platform Owner Accounts */}
                <View style={styles.readonlyFullItem}>
                  <AppText variant="caption" color="secondary" style={styles.subItemLabel}>
                    Configured Platform Owner Accounts ({readOnlyConfig.platform_owner_emails.length})
                  </AppText>
                  <View style={styles.pillsWrap}>
                    {readOnlyConfig.platform_owner_emails.map((email) => (
                      <View key={email} style={styles.emailChip}>
                        <UserCheck size={12} color="#18794E" />
                        <AppText style={styles.emailChipText}>{email}</AppText>
                      </View>
                    ))}
                  </View>
                </View>

                {/* CORS Allowed Origins */}
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
          </Card>

          {/* SECTION 4: AUDIT HISTORY SHORTCUT */}
          <TouchableOpacity
            style={styles.auditShortcutCard}
            onPress={() => router.push('/platform/audit?search=platform_settings' as any)}
            activeOpacity={0.8}
          >
            <View style={styles.auditShortcutLeft}>
              <View style={styles.auditShortcutIconWrap}>
                <History size={18} color="#18794E" />
              </View>
              <View style={styles.auditShortcutTextWrap}>
                <AppText style={styles.auditShortcutTitle}>Settings Audit Trail</AppText>
                <AppText variant="caption" color="secondary">
                  Inspect immutable historical timestamps, actors, and before/after values for all settings changes.
                </AppText>
              </View>
            </View>
            <ArrowRight size={16} color="#18794E" />
          </TouchableOpacity>
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
    gap: Spacing.md,
    paddingBottom: 40,
  },
  headerSection: {
    paddingTop: 2,
    paddingBottom: 4,
  },
  screenTitle: {
    fontSize: 27,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.5,
    lineHeight: 32,
    ...Platform.select({
      web: {
        fontSize: 'clamp(25px, 6vw, 29px)' as any,
      },
    }),
  },
  screenSubtitle: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: Spacing.md,
    borderRadius: Radius.lg,
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
    padding: Spacing.md,
    borderRadius: Radius.lg,
  },
  errorBannerText: {
    fontSize: 13,
    color: '#DC2626',
    fontWeight: '600',
    flex: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  sectionTitleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  sectionIconPill: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    backgroundColor: '#EAF6F0',
    borderWidth: 1,
    borderColor: '#C3E5D4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#122521',
  },
  cardGroup: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EBE6',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingTextCol: {
    flex: 1,
    gap: 4,
  },
  settingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  settingLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#122521',
  },
  settingDescription: {
    fontSize: 12,
    lineHeight: 16,
    color: '#64748B',
  },
  settingDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  inputGroup: {
    gap: 6,
  },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAF9',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    height: 42,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
  },
  inputHelper: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 15,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  uploadChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  uploadChipActive: {
    backgroundColor: '#18794E',
    borderColor: '#18794E',
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
    gap: 10,
    marginTop: 4,
  },
  discardBtn: {
    minWidth: 120,
  },
  saveBtn: {
    minWidth: 140,
  },
  securityCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0FDF4',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  securityCalloutText: {
    fontSize: 11.5,
    color: '#166534',
    lineHeight: 16,
    flex: 1,
  },
  readonlyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  readonlyItem: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: '#F8FAF9',
    padding: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 3,
  },
  readonlyFullItem: {
    width: '100%',
    backgroundColor: '#F8FAF9',
    padding: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  readonlyValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  envPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  envDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  subItemLabel: {
    fontWeight: '600',
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
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#C3E5D4',
  },
  emailChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#18794E',
  },
  originChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  originChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  auditShortcutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EBE6',
    gap: 12,
  },
  auditShortcutLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  auditShortcutIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: '#EAF6F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  auditShortcutTextWrap: {
    flex: 1,
    gap: 2,
  },
  auditShortcutTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#122521',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  confirmModalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  confirmModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  confirmWarningIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
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
  },
  reasonInput: {
    backgroundColor: '#F8FAF9',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    fontSize: 13,
    color: '#0F172A',
    minHeight: 70,
    textAlignVertical: 'top',
  },
  confirmModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  confirmCancelBtn: {
    minWidth: 100,
  },
  confirmApplyBtn: {
    minWidth: 140,
  },
});
