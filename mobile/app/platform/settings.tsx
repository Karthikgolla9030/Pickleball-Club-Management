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
  Building2,
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
            <View style={styles.sectionIconTileGreen}>
              <ShieldCheck size={20} color="#15803D" strokeWidth={2} />
            </View>
            <View style={styles.sectionTitleBlock}>
              <AppText style={styles.sectionTitle}>
                Public Registration Gates
              </AppText>
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
              <AppText style={styles.sectionTitle}>
                Platform Operational Parameters
              </AppText>
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
              <AppText style={styles.sectionTitle}>
                System Infrastructure & Security (Read-Only)
              </AppText>
              <AppText style={styles.sectionSubtitle}>
                Active server environment parameters · Secrets are never exposed
              </AppText>
            </View>
          </View>

          <View style={styles.card}>
            {/* Security Guard Callout */}
            <View style={styles.securityCallout}>
              <Lock size={16} color="#15803D" />
              <AppText style={styles.securityCalloutText}>
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
                    <View style={[styles.envDot, { backgroundColor: readOnlyConfig.app_env === 'production' ? '#15803D' : '#D97706' }]} />
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
                        <UserCheck size={12} color="#15803D" />
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
    gap: 12,
    paddingBottom: 24,
  },
  headerSection: {
    paddingTop: 2,
    paddingBottom: 12,
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
    ...Platform.select({
      web: {
        overflowWrap: 'anywhere' as any,
        wordBreak: 'normal' as any,
      },
    }),
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 10,
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
    padding: 10,
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
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  sectionTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  sectionIconTileGreen: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EAF8F0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sectionIconTileBlue: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sectionIconTilePurple: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 22,
    ...Platform.select({
      web: {
        overflowWrap: 'anywhere' as any,
        wordBreak: 'normal' as any,
      },
    }),
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    ...Platform.select({
      web: {
        overflowWrap: 'anywhere' as any,
        wordBreak: 'normal' as any,
      },
    }),
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' as any,
      },
      default: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
        elevation: 1,
      },
    }),
  },
  settingRowWithTile: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
  },
  itemIconTileGreen: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EAF8F0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  itemIconTileAmber: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  settingContentCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  settingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    paddingRight: 2,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 21,
    minWidth: 0,
    ...Platform.select({
      web: {
        overflowWrap: 'anywhere' as any,
        wordBreak: 'normal' as any,
      },
    }),
  },
  statusPill: {
    paddingHorizontal: 7.5,
    paddingVertical: 2,
    borderRadius: 9999,
    alignSelf: 'center',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  statusPillAccepting: {
    backgroundColor: '#DCFCE7',
  },
  statusPillTextAccepting: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
    letterSpacing: 0.3,
  },
  statusPillPaused: {
    backgroundColor: '#FEF3C7',
  },
  statusPillTextPaused: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
    letterSpacing: 0.3,
  },
  statusPillAmber: {
    backgroundColor: '#FEF3C7',
  },
  statusPillTextAmber: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
    letterSpacing: 0.3,
  },
  statusPillNeutral: {
    backgroundColor: '#F1F5F9',
  },
  statusPillTextNeutral: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  settingDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
    marginTop: 2,
    minWidth: 0,
    ...Platform.select({
      web: {
        overflowWrap: 'anywhere' as any,
        wordBreak: 'normal' as any,
      },
    }),
  },
  switchControl: {
    marginTop: 2,
    flexShrink: 0,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  fieldHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  fieldHelperTop: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAF9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 44,
    marginTop: 8,
    marginBottom: 6,
  },
  inputIcon: {
    marginRight: 10,
    flexShrink: 0,
  },
  textInput: {
    flex: 1,
    fontSize: 14.5,
    color: '#0F172A',
    paddingVertical: 0,
    outlineStyle: 'none' as any,
  },
  fieldDescription: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    minWidth: 0,
    ...Platform.select({
      web: {
        overflowWrap: 'anywhere' as any,
        wordBreak: 'normal' as any,
      },
    }),
  },
  neutralBadgePill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  neutralBadgePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 10,
    marginBottom: 8,
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
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  uploadChipText: {
    fontSize: 12.5,
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
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    marginBottom: 14,
  },
  securityCalloutText: {
    fontSize: 12,
    color: '#166534',
    lineHeight: 17,
    flex: 1,
    ...Platform.select({
      web: {
        overflowWrap: 'anywhere' as any,
        wordBreak: 'normal' as any,
      },
    }),
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
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  readonlyFullItem: {
    width: '100%',
    backgroundColor: '#F8FAF9',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  readonlyValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    ...Platform.select({
      web: {
        overflowWrap: 'anywhere' as any,
        wordBreak: 'normal' as any,
      },
    }),
  },
  envPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  envDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  subItemLabel: {
    fontWeight: '600',
    fontSize: 12,
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
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' as any,
      },
      default: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
        elevation: 1,
      },
    }),
  },
  auditShortcutLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  auditShortcutIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EAF8F0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  auditShortcutTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  auditShortcutTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  auditShortcutSubtitle: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    ...Platform.select({
      web: {
        overflowWrap: 'anywhere' as any,
        wordBreak: 'normal' as any,
      },
    }),
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
