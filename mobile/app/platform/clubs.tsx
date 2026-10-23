/**
 * Pickleball Multi-Club Platform — Platform Admin Clubs Directory
 *
 * Dedicated administrative overview for authorized platform owners:
 * - Visual match to mobile reference screenshot:
 *   - Top header with official Pickleball product logo (no menu button)
 *   - Title "Clubs" & subtitle "All registered facilities on the platform"
 *   - 2x2 summary metric cards with icon squircles (Total, Active, Inactive/Suspended, Platform Members)
 *   - Status filter pills with counts (All Facilities, Active, Inactive)
 *   - Search input with right-aligned filter button
 *   - Club cards featuring that specific club's own uploaded logo (from real media URL),
 *     or neutral placeholder if not uploaded / on load error
 *   - Metadata hierarchy: Name, Status badge, slug (/slug), active members, registration date, location
 *   - "Inspect Facility Profile" solid green button on the right, slightly lower
 * - Comprehensive Facility Inspection modal preserving real-time status management (Suspend / Reactivate)
 * - Links to public club discovery view without duplicating club management controls
 * - Standardized PlatformShell with consistent navigation, zero overlap under bottom navbar
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
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
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  Globe,
  Info,
  Link2,
  Mail,
  MapPin,
  PauseCircle,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  User,
  Users,
  X,
  XCircle,
} from 'lucide-react-native';

import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PlatformShell,
} from '@/components';
import {
  PlatformClubItem,
  platformApplicationsApi,
} from '@/services/api/clubApplications';
import { Radius, Spacing } from '@/theme';
import { resolveMediaUrl } from '@/utils';

type StatusFilter = 'all' | 'active' | 'inactive';

function formatRegistrationDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

export default function PlatformClubsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [clubs, setClubs] = useState<PlatformClubItem[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detail Modal
  const [selectedClub, setSelectedClub] = useState<PlatformClubItem | null>(null);

  // Status Change State (Suspend / Reactivate)
  const [statusTarget, setStatusTarget] = useState<{
    club: PlatformClubItem;
    targetActive: boolean;
  } | null>(null);
  const [statusReason, setStatusReason] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusSuccessMessage, setStatusSuccessMessage] = useState<string | null>(null);

  const isMobile = width < 768;

  const openStatusModal = (club: PlatformClubItem, targetActive: boolean) => {
    setStatusTarget({ club, targetActive });
    setStatusReason('');
    setStatusError(null);
  };

  const handleStatusSubmit = async () => {
    if (!statusTarget) return;
    const trimmed = statusReason.trim();
    if (trimmed.length < 5) {
      setStatusError('Please enter an administrative reason of at least 5 characters.');
      return;
    }

    setIsUpdatingStatus(true);
    setStatusError(null);

    try {
      const res = await platformApplicationsApi.updateClubStatus(
        statusTarget.club.id,
        statusTarget.targetActive,
        trimmed
      );

      // Update in clubs array
      setClubs((prev) =>
        prev.map((c) => (c.id === res.id ? { ...c, is_active: res.is_active } : c))
      );

      // Update currently selected club
      if (selectedClub && selectedClub.id === res.id) {
        setSelectedClub((prev) => (prev ? { ...prev, is_active: res.is_active } : null));
      }

      setStatusSuccessMessage(
        res.is_active
          ? `Facility "${res.name}" has been successfully reactivated.`
          : `Facility "${res.name}" has been suspended from the platform.`
      );
      setStatusTarget(null);
      setStatusReason('');
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        'Failed to update facility status. Please verify permissions and try again.';
      setStatusError(msg);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const fetchClubs = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const res = await platformApplicationsApi.listClubs();
      setClubs(res.items || []);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to fetch platform clubs';
      setError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchClubs();
  }, [fetchClubs]);

  const activeCount = clubs.filter((c) => c.is_active).length;
  const inactiveCount = clubs.filter((c) => !c.is_active).length;
  const totalCount = clubs.length;
  const totalMembers = clubs.reduce((sum, c) => sum + (c.active_members_count || 0), 0);

  const filteredClubs = clubs
    .filter((c) => {
      if (filter === 'active') return c.is_active;
      if (filter === 'inactive') return !c.is_active;
      return true;
    })
    .filter((c) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        c.name.toLowerCase().includes(query) ||
        c.slug.toLowerCase().includes(query) ||
        (c.city && c.city.toLowerCase().includes(query)) ||
        (c.state && c.state.toLowerCase().includes(query)) ||
        (c.contact_email && c.contact_email.toLowerCase().includes(query))
      );
    });

  return (
    <PlatformShell
      activeTab="clubs"
      onRefresh={() => fetchClubs(true)}
      isRefreshing={isRefreshing}
    >
      {isLoading ? (
        <LoadingState message="Loading platform facilities directory..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchClubs(true)} />
      ) : (
        <FlatList
          data={filteredClubs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchClubs(true)}
              tintColor="#18794E"
            />
          }
          ListHeaderComponent={
            <View style={styles.listHeaderWrapper}>
              {/* Screen Title & Subtitle */}
              <View style={styles.headerSection}>
                <AppText style={styles.screenTitle}>Clubs</AppText>
                <AppText style={styles.screenSubtitle}>
                  All registered facilities on the platform
                </AppText>
              </View>

              {/* 2x2 Summary Metrics Grid */}
              <View style={styles.kpiGrid}>
                {/* Total Facilities */}
                <View style={[styles.kpiCard, isMobile ? styles.kpiCardMobile : styles.kpiCardDesktop]}>
                  <View style={[styles.kpiIconBox, { backgroundColor: '#E6F4EA' }]}>
                    <Building2 size={20} color="#16A34A" />
                  </View>
                  <View style={styles.kpiTextBox}>
                    <AppText style={styles.kpiLabel}>Total Facilities</AppText>
                    <AppText style={styles.kpiValue}>{totalCount}</AppText>
                  </View>
                </View>

                {/* Active Facilities */}
                <View style={[styles.kpiCard, isMobile ? styles.kpiCardMobile : styles.kpiCardDesktop]}>
                  <View style={[styles.kpiIconBox, { backgroundColor: '#E0F2FE' }]}>
                    <Users size={20} color="#0284C7" />
                  </View>
                  <View style={styles.kpiTextBox}>
                    <AppText style={styles.kpiLabel}>Active Facilities</AppText>
                    <AppText style={styles.kpiValue}>{activeCount}</AppText>
                  </View>
                </View>

                {/* Inactive / Suspended */}
                <View style={[styles.kpiCard, isMobile ? styles.kpiCardMobile : styles.kpiCardDesktop]}>
                  <View style={[styles.kpiIconBox, { backgroundColor: '#FEF3C7' }]}>
                    <PauseCircle size={20} color="#D97706" />
                  </View>
                  <View style={styles.kpiTextBox}>
                    <AppText style={styles.kpiLabel}>Inactive / Suspended</AppText>
                    <AppText style={styles.kpiValue}>{inactiveCount}</AppText>
                  </View>
                </View>

                {/* Platform Members */}
                <View style={[styles.kpiCard, isMobile ? styles.kpiCardMobile : styles.kpiCardDesktop]}>
                  <View style={[styles.kpiIconBox, { backgroundColor: '#F3E8FF' }]}>
                    <User size={20} color="#9333EA" />
                  </View>
                  <View style={styles.kpiTextBox}>
                    <AppText style={styles.kpiLabel}>Platform Members</AppText>
                    <AppText style={styles.kpiValue}>{totalMembers}</AppText>
                  </View>
                </View>
              </View>

              {/* Status Filter Tabs */}
              <View style={styles.filterRow}>
                <TouchableOpacity
                  style={[styles.filterPill, filter === 'all' && styles.filterPillActive]}
                  onPress={() => setFilter('all')}
                  activeOpacity={0.7}
                >
                  <AppText style={[styles.filterPillText, filter === 'all' && styles.filterPillTextActive]}>
                    All Facilities
                  </AppText>
                  <View
                    style={[
                      styles.filterBadge,
                      filter === 'all' ? styles.filterBadgeActive : styles.filterBadgeInactive,
                    ]}
                  >
                    <AppText
                      style={[
                        styles.filterBadgeText,
                        filter === 'all' ? styles.filterBadgeTextActive : styles.filterBadgeTextInactive,
                      ]}
                    >
                      {totalCount}
                    </AppText>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterPill, filter === 'active' && styles.filterPillActive]}
                  onPress={() => setFilter('active')}
                  activeOpacity={0.7}
                >
                  <AppText style={[styles.filterPillText, filter === 'active' && styles.filterPillTextActive]}>
                    Active
                  </AppText>
                  <View
                    style={[
                      styles.filterBadge,
                      filter === 'active' ? styles.filterBadgeActive : styles.filterBadgeInactive,
                    ]}
                  >
                    <AppText
                      style={[
                        styles.filterBadgeText,
                        filter === 'active' ? styles.filterBadgeTextActive : styles.filterBadgeTextInactive,
                      ]}
                    >
                      {activeCount}
                    </AppText>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterPill, filter === 'inactive' && styles.filterPillActive]}
                  onPress={() => setFilter('inactive')}
                  activeOpacity={0.7}
                >
                  <AppText style={[styles.filterPillText, filter === 'inactive' && styles.filterPillTextActive]}>
                    Inactive
                  </AppText>
                  <View
                    style={[
                      styles.filterBadge,
                      filter === 'inactive' ? styles.filterBadgeActive : styles.filterBadgeInactive,
                    ]}
                  >
                    <AppText
                      style={[
                        styles.filterBadgeText,
                        filter === 'inactive' ? styles.filterBadgeTextActive : styles.filterBadgeTextInactive,
                      ]}
                    >
                      {inactiveCount}
                    </AppText>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Search Bar & Filter Button */}
              <View style={styles.searchRow}>
                <View style={styles.searchBox}>
                  <Search size={18} color="#9CA3AF" style={styles.searchIcon} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search by facility name, slug, city, or contact email"
                    placeholderTextColor="#9CA3AF"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setSearchQuery('')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <X size={16} color="#667776" />
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.filterBtn}
                  onPress={() => {
                    if (filter === 'all') setFilter('active');
                    else if (filter === 'active') setFilter('inactive');
                    else setFilter('all');
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel="Cycle facility status filter"
                  accessibilityRole="button"
                >
                  <SlidersHorizontal size={18} color="#4B5563" />
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={
            <Card style={styles.emptyCard}>
              <EmptyState
                icon="🏢"
                title="No Facilities Found"
                description={
                  searchQuery
                    ? `No registered clubs match the query "${searchQuery}".`
                    : filter !== 'all'
                    ? `No clubs found with status "${filter}".`
                    : 'There are currently no approved clubs on the platform.'
                }
              />
            </Card>
          }
          renderItem={({ item }) => (
            <ClubItemCard
              item={item}
              onInspect={(club) => setSelectedClub(club)}
            />
          )}
        />
      )}

      {/* ─── Club Details Inspection Modal ───────────────────────────────────── */}
      <Modal
        visible={!!selectedClub}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedClub(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleGroup}>
                <AppText variant="heading3" color="primary">
                  {selectedClub?.name}
                </AppText>
                <AppText variant="caption" color="secondary">
                  Slug: /{selectedClub?.slug} · Platform ID: {selectedClub?.id}
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedClub(null)}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#2A4540" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {selectedClub && (
                <View style={styles.modalBody}>
                  {statusSuccessMessage && (
                    <View style={styles.modalSuccessBanner}>
                      <CheckCircle2 size={16} color="#18794E" />
                      <AppText style={styles.modalSuccessText}>{statusSuccessMessage}</AppText>
                    </View>
                  )}

                  {/* Status Banner */}
                  <View
                    style={[
                      styles.modalStatusBanner,
                      selectedClub.is_active ? styles.statusBannerActive : styles.statusBannerInactive,
                    ]}
                  >
                    <View style={styles.statusBannerLeft}>
                      {selectedClub.is_active ? (
                        <CheckCircle2 size={18} color="#18794E" />
                      ) : (
                        <AlertTriangle size={18} color="#DC2626" />
                      )}
                      <View>
                        <AppText
                          style={[
                            styles.statusBannerTitle,
                            { color: selectedClub.is_active ? '#18794E' : '#DC2626' },
                          ]}
                        >
                          Facility is currently {selectedClub.is_active ? 'ACTIVE' : 'SUSPENDED'}
                        </AppText>
                        <AppText variant="caption" color="secondary">
                          {selectedClub.is_active
                            ? 'All court bookings, memberships, and club portals are operational.'
                            : 'This facility has been administratively suspended from platform operations.'}
                        </AppText>
                      </View>
                    </View>
                  </View>

                  {/* Quick Stat Tiles */}
                  <View style={styles.modalStatGrid}>
                    <View style={styles.modalStatTile}>
                      <Users size={16} color="#18794E" />
                      <AppText variant="heading3" color="primary">
                        {selectedClub.active_members_count}
                      </AppText>
                      <AppText variant="caption" color="secondary">Active Members</AppText>
                    </View>

                    <View style={styles.modalStatTile}>
                      <Globe size={16} color="#18794E" />
                      <AppText variant="heading3" color="primary" numberOfLines={1}>
                        /{selectedClub.slug}
                      </AppText>
                      <AppText variant="caption" color="secondary">Unique Slug</AppText>
                    </View>

                    <View style={styles.modalStatTile}>
                      <Clock size={16} color="#18794E" />
                      <AppText variant="heading3" color="primary" numberOfLines={1}>
                        {selectedClub.timezone || 'UTC'}
                      </AppText>
                      <AppText variant="caption" color="secondary">Timezone</AppText>
                    </View>
                  </View>

                  {/* Contact & Location Details */}
                  <View style={styles.modalSection}>
                    <AppText variant="heading3" color="primary" style={styles.modalSectionTitle}>
                      Contact & Location
                    </AppText>
                    <View style={styles.modalSectionCard}>
                      <View style={styles.infoRow}>
                        <MapPin size={15} color="#667776" style={styles.infoIcon} />
                        <View style={styles.infoTextCol}>
                          <AppText variant="caption" color="secondary">Physical Address</AppText>
                          <AppText variant="bodySmall" color="primary">
                            {[
                              selectedClub.address_line1,
                              selectedClub.address_line2,
                              selectedClub.city,
                              selectedClub.state,
                              selectedClub.postal_code,
                              selectedClub.country,
                            ]
                              .filter(Boolean)
                              .join(', ') || 'No physical address recorded'}
                          </AppText>
                        </View>
                      </View>

                      {selectedClub.contact_email && (
                        <View style={styles.infoRow}>
                          <Mail size={15} color="#667776" style={styles.infoIcon} />
                          <View style={styles.infoTextCol}>
                            <AppText variant="caption" color="secondary">Contact Email</AppText>
                            <AppText variant="bodySmall" color="primary">
                              {selectedClub.contact_email}
                            </AppText>
                          </View>
                        </View>
                      )}

                      {selectedClub.contact_phone && (
                        <View style={styles.infoRow}>
                          <Phone size={15} color="#667776" style={styles.infoIcon} />
                          <View style={styles.infoTextCol}>
                            <AppText variant="caption" color="secondary">Contact Phone</AppText>
                            <AppText variant="bodySmall" color="primary">
                              {selectedClub.contact_phone}
                            </AppText>
                          </View>
                        </View>
                      )}

                      {selectedClub.website && (
                        <View style={styles.infoRow}>
                          <Globe size={15} color="#667776" style={styles.infoIcon} />
                          <View style={styles.infoTextCol}>
                            <AppText variant="caption" color="secondary">Official Website</AppText>
                            <AppText variant="bodySmall" color="brand">
                              {selectedClub.website}
                            </AppText>
                          </View>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Operating Hours */}
                  <View style={styles.modalSection}>
                    <AppText variant="heading3" color="primary" style={styles.modalSectionTitle}>
                      Operating Schedule
                    </AppText>
                    <View style={styles.modalSectionCard}>
                      <View style={styles.infoRow}>
                        <Clock size={15} color="#667776" style={styles.infoIcon} />
                        <View style={styles.infoTextCol}>
                          <AppText variant="caption" color="secondary">Operating Schedule</AppText>
                          <AppText variant="bodySmall" color="primary">
                            {selectedClub.operating_days || 'Standard Weekly'} ·{' '}
                            {selectedClub.opening_time ? `${selectedClub.opening_time.slice(0, 5)} - ${selectedClub.closing_time?.slice(0, 5)}` : 'Standard Hours'}
                          </AppText>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* Action Row */}
                  <View style={styles.modalActionsSection}>
                    {selectedClub.is_active ? (
                      <TouchableOpacity
                        style={styles.suspendBtn}
                        onPress={() => openStatusModal(selectedClub, false)}
                        activeOpacity={0.8}
                      >
                        <ShieldAlert size={15} color="#DC2626" />
                        <AppText style={styles.suspendBtnText}>Suspend Facility</AppText>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.reactivateBtn}
                        onPress={() => openStatusModal(selectedClub, true)}
                        activeOpacity={0.8}
                      >
                        <CheckCircle2 size={15} color="#18794E" />
                        <AppText style={styles.reactivateBtnText}>Reactivate Facility</AppText>
                      </TouchableOpacity>
                    )}

                    <Button
                      label="View Public Club"
                      variant="outline"
                      size="sm"
                      onPress={() => router.push(`/club/${selectedClub.slug}` as any)}
                      leftIcon={<ExternalLink size={14} color="#18794E" />}
                    />
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── Administrative Status Change Confirmation Modal ─────────────────── */}
      <Modal
        visible={!!statusTarget}
        animationType="fade"
        transparent
        onRequestClose={() => setStatusTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalCard}>
            <View style={styles.confirmModalHeader}>
              <View
                style={[
                  styles.confirmModalIconWrap,
                  { backgroundColor: statusTarget?.targetActive ? '#EAF6F0' : '#FEE2E2' },
                ]}
              >
                {statusTarget?.targetActive ? (
                  <CheckCircle2 size={24} color="#18794E" />
                ) : (
                  <ShieldAlert size={24} color="#DC2626" />
                )}
              </View>
              <AppText variant="heading3" color="primary" style={styles.confirmModalTitle}>
                {statusTarget?.targetActive ? 'Reactivate Facility' : 'Suspend Facility'}
              </AppText>
              <AppText variant="bodySmall" color="secondary" style={styles.confirmModalSubtitle}>
                {statusTarget?.targetActive
                  ? `Reactivate "${statusTarget.club.name}". All member activities, courts, and portals will resume normal operation.`
                  : `Suspend "${statusTarget?.club.name}". Facility access will be paused immediately across the platform.`}
              </AppText>
            </View>

            <View style={styles.confirmReasonBox}>
              <AppText variant="caption" color="primary" style={styles.reasonLabel}>
                Administrative Audit Reason (Required)
              </AppText>
              <TextInput
                style={styles.reasonInput}
                placeholder={
                  statusTarget?.targetActive
                    ? 'State the reason for reactivation (e.g. Compliance verified, payment resolved)...'
                    : 'State the administrative reason for suspension (e.g. Terms violation, operator request)...'
                }
                placeholderTextColor="#8FA39E"
                multiline
                numberOfLines={3}
                value={statusReason}
                onChangeText={setStatusReason}
              />
              {statusError && (
                <View style={styles.reasonErrorRow}>
                  <AlertCircle size={14} color="#DC2626" />
                  <AppText style={styles.reasonErrorText}>{statusError}</AppText>
                </View>
              )}
            </View>

            <View style={styles.confirmModalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setStatusTarget(null)}
                disabled={isUpdatingStatus}
              >
                <AppText style={styles.cancelBtnText}>Cancel</AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  statusTarget?.targetActive ? styles.submitBtnReactivate : styles.submitBtnSuspend,
                ]}
                onPress={handleStatusSubmit}
                disabled={isUpdatingStatus}
              >
                <AppText style={styles.submitBtnText}>
                  {isUpdatingStatus
                    ? 'Updating...'
                    : statusTarget?.targetActive
                    ? 'Confirm Reactivation'
                    : 'Confirm Suspension'}
                </AppText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </PlatformShell>
  );
}

/**
 * Single Facility Card matching the visual reference:
 * - Left: Club's own uploaded logo, scoped to this facility, loaded from real media URL
 * - Fallback: Clean neutral placeholder if no logo or load error
 * - Right: Name, ACTIVE/INACTIVE pill, slug, active members count, registered date, location
 * - Bottom Right: "Inspect Facility Profile" solid green button
 */
function ClubItemCard({
  item,
  onInspect,
}: {
  item: PlatformClubItem;
  onInspect: (club: PlatformClubItem) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const logoUri = item.logo_url ? resolveMediaUrl(item.logo_url) : null;
  const hasValidLogo = !!logoUri && !imgError;

  return (
    <Card style={styles.clubCard}>
      <View style={styles.clubCardContent}>
        {/* Left: Club's Own Uploaded Logo / Neutral Placeholder */}
        <View style={styles.logoContainer}>
          {hasValidLogo ? (
            <Image
              source={{ uri: logoUri }}
              style={styles.clubLogoImage}
              resizeMode="contain"
              onError={() => setImgError(true)}
            />
          ) : (
            <View style={styles.logoPlaceholder}>
              <Building2 size={32} color="#9CA3AF" />
            </View>
          )}
        </View>

        {/* Right: Facility Details */}
        <View style={styles.clubDetailsCol}>
          {/* Name & Status */}
          <View style={styles.clubHeaderRow}>
            <AppText style={styles.clubNameText} numberOfLines={1}>
              {item.name}
            </AppText>
            <View
              style={[
                styles.statusPill,
                { backgroundColor: item.is_active ? '#E6F4EA' : '#F3F4F6' },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: item.is_active ? '#16A34A' : '#9CA3AF' },
                ]}
              />
              <AppText
                style={[
                  styles.statusLabel,
                  { color: item.is_active ? '#15803D' : '#6B7280' },
                ]}
              >
                {item.is_active ? 'ACTIVE' : 'INACTIVE'}
              </AppText>
            </View>
          </View>

          {/* Slug */}
          <View style={styles.clubMetaRow}>
            <Link2 size={13} color="#64748B" />
            <AppText style={styles.clubMetaText} numberOfLines={1}>
              /{item.slug}
            </AppText>
          </View>

          {/* Members */}
          <View style={styles.clubMetaRow}>
            <Users size={13} color="#64748B" />
            <AppText style={styles.clubMetaText}>
              {item.active_members_count} active {item.active_members_count === 1 ? 'member' : 'members'}
            </AppText>
          </View>

          {/* Registration Date */}
          {item.created_at && (
            <View style={styles.clubMetaRow}>
              <Calendar size={13} color="#64748B" />
              <AppText style={styles.clubMetaText}>
                Registered {formatRegistrationDate(item.created_at)}
              </AppText>
            </View>
          )}

          {/* Location */}
          <View style={styles.clubMetaRow}>
            <MapPin size={13} color="#64748B" />
            <AppText style={styles.clubMetaText} numberOfLines={1}>
              {item.city ? `${item.city}, ${item.state || item.country}` : item.country || 'Location unlisted'}
            </AppText>
          </View>
        </View>
      </View>

      {/* Bottom Action: Inspect Facility Profile Button (Solid Green, slightly lower, right aligned) */}
      <View style={styles.inspectBtnRow}>
        <TouchableOpacity
          style={styles.inspectFacilityBtn}
          onPress={() => onInspect(item)}
          activeOpacity={0.8}
          accessibilityLabel={`Inspect profile for ${item.name}`}
          accessibilityRole="button"
        >
          <Eye size={14} color="#FFFFFF" strokeWidth={2.2} />
          <AppText style={styles.inspectFacilityBtnText}>Inspect Facility Profile</AppText>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 36,
  },
  listHeaderWrapper: {
    paddingBottom: 4,
  },

  // ─── Header Section ────────────────────────────────────────────────────────
  headerSection: {
    paddingTop: 4,
    paddingBottom: 14,
    paddingHorizontal: 2,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  screenSubtitle: {
    fontSize: 13.5,
    color: '#64748B',
  },

  // ─── 2x2 KPI Grid ──────────────────────────────────────────────────────────
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    marginBottom: 16,
  },
  kpiCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 3,
        elevation: 1,
      },
    }),
  },
  kpiCardMobile: {
    width: '48.5%',
  },
  kpiCardDesktop: {
    width: '23.8%',
  },
  kpiIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiTextBox: {
    flex: 1,
  },
  kpiLabel: {
    fontSize: 11.5,
    color: '#64748B',
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },

  // ─── Filter Pills ──────────────────────────────────────────────────────────
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
  },
  filterPillActive: {
    backgroundColor: '#15803D',
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  filterBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeActive: {
    backgroundColor: '#166534',
  },
  filterBadgeInactive: {
    backgroundColor: '#E5E7EB',
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  filterBadgeTextActive: {
    color: '#FFFFFF',
  },
  filterBadgeTextInactive: {
    color: '#4B5563',
  },

  // ─── Search Bar Row ────────────────────────────────────────────────────────
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── Facility Card ─────────────────────────────────────────────────────────
  clubCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 3,
        elevation: 1,
      },
    }),
  },
  clubCardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  logoContainer: {
    width: 76,
    height: 76,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
    padding: 4,
  },
  clubLogoImage: {
    width: '100%',
    height: '100%',
  },
  logoPlaceholder: {
    width: 76,
    height: 76,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  clubDetailsCol: {
    flex: 1,
    marginLeft: 14,
  },
  clubHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  clubNameText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    marginRight: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  clubMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  clubMetaText: {
    fontSize: 12.5,
    color: '#64748B',
  },

  // ─── Inspect Facility Profile Action ───────────────────────────────────────
  inspectBtnRow: {
    alignItems: 'flex-end',
    marginTop: 10,
  },
  inspectFacilityBtn: {
    backgroundColor: '#15803D',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(21,128,61,0.2)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  inspectFacilityBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EBE6',
    padding: Spacing.lg,
  },

  // ─── Modal Styles ──────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '90%',
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#E2EBE6',
  },
  modalHeaderTitleGroup: {
    flex: 1,
    gap: 2,
    marginRight: 10,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF0EC',
  },
  modalScroll: {
    flexGrow: 1,
  },
  modalBody: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  modalSuccessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EAF6F0',
    borderWidth: 1,
    borderColor: '#A3D9C0',
    padding: 12,
    borderRadius: Radius.md,
  },
  modalSuccessText: {
    fontSize: 13,
    color: '#18794E',
    fontWeight: '600',
    flex: 1,
  },
  modalStatusBanner: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  statusBannerActive: {
    backgroundColor: '#EAF6F0',
    borderColor: '#A3D9C0',
  },
  statusBannerInactive: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  statusBannerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  statusBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  modalStatGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  modalStatTile: {
    flex: 1,
    backgroundColor: '#F8FAF9',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2EBE6',
    padding: Spacing.sm,
    alignItems: 'center',
    gap: 4,
  },
  modalSection: {
    gap: 6,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalSectionCard: {
    backgroundColor: '#F8FAF9',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2EBE6',
    padding: Spacing.md,
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoIcon: {
    marginTop: 2,
  },
  infoTextCol: {
    flex: 1,
    gap: 2,
  },
  modalActionsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#E2EBE6',
    gap: 10,
  },
  suspendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  suspendBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  reactivateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: '#EAF6F0',
    borderWidth: 1,
    borderColor: '#A3D9C0',
  },
  reactivateBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#18794E',
  },
  confirmModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    width: '90%',
    maxWidth: 480,
    alignSelf: 'center',
    marginVertical: 'auto',
    gap: Spacing.md,
  },
  confirmModalHeader: {
    alignItems: 'center',
    gap: 8,
    textAlign: 'center',
  },
  confirmModalIconWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmModalTitle: {
    textAlign: 'center',
  },
  confirmModalSubtitle: {
    textAlign: 'center',
    lineHeight: 18,
  },
  confirmReasonBox: {
    gap: 6,
  },
  reasonLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  reasonInput: {
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#D7E5DE',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    fontSize: 13,
    color: '#122521',
    minHeight: 70,
    textAlignVertical: 'top',
  },
  reasonErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  reasonErrorText: {
    fontSize: 11.5,
    color: '#DC2626',
  },
  confirmModalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.md,
    backgroundColor: '#F3F4F6',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  submitBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.md,
  },
  submitBtnSuspend: {
    backgroundColor: '#DC2626',
  },
  submitBtnReactivate: {
    backgroundColor: '#18794E',
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
