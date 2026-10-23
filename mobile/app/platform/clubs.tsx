/**
 * Pickleball Multi-Club Platform — Platform Admin Clubs Directory
 *
 * Dedicated administrative overview for authorized platform owners:
 * - View all registered clubs on the platform
 * - Inspect club approval/active status, slug, city/state, contact info, and active member counts
 * - Search by club name, slug, city, or state
 * - Filter pills with live counts: All, Active, Inactive
 * - Focused Club Detail Modal displaying real profile and operating information
 * - Links to public club discovery view without duplicating club management controls
 * - Standardized PlatformShell with consistent navigation and light theme
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
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
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
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
import { Colors, Radius, Spacing } from '@/theme';

type StatusFilter = 'all' | 'active' | 'inactive';

export default function PlatformClubsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
      title="Registered Facilities Directory"
      subtitle="Directory of approved clubs, operating statuses, and active memberships"
      onRefresh={() => fetchClubs(true)}
      isRefreshing={isRefreshing}
    >
      {/* Platform Facilities Summary Bar */}
      <View style={styles.kpiContainer}>
        <View style={styles.kpiCard}>
          <AppText variant="caption" color="secondary">Total Facilities</AppText>
          <AppText variant="heading2" color="primary" style={styles.kpiValue}>
            {totalCount}
          </AppText>
        </View>

        <View style={styles.kpiCard}>
          <AppText variant="caption" color="secondary">Active Facilities</AppText>
          <AppText variant="heading2" color="brand" style={styles.kpiValue}>
            {activeCount}
          </AppText>
        </View>

        <View style={styles.kpiCard}>
          <AppText variant="caption" color="secondary">Inactive / Suspended</AppText>
          <AppText variant="heading2" color="secondary" style={styles.kpiValue}>
            {inactiveCount}
          </AppText>
        </View>

        <View style={styles.kpiCard}>
          <AppText variant="caption" color="secondary">Platform Members</AppText>
          <AppText variant="heading2" color="primary" style={styles.kpiValue}>
            {totalMembers}
          </AppText>
        </View>
      </View>

      {/* Filter Pills and Search */}
      <View style={styles.controlsCard}>
        {/* Status Filter Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContainer}
          style={styles.tabsScroll}
        >
          <TouchableOpacity
            style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
            onPress={() => setFilter('all')}
            activeOpacity={0.7}
          >
            <AppText style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
              All Facilities
            </AppText>
            <View style={[styles.countPill, filter === 'all' ? styles.countPillActive : styles.countPillInactive]}>
              <AppText style={[styles.countPillText, filter === 'all' ? styles.countPillTextActive : styles.countPillTextInactive]}>
                {totalCount}
              </AppText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filter === 'active' && styles.filterTabActive]}
            onPress={() => setFilter('active')}
            activeOpacity={0.7}
          >
            <AppText style={[styles.filterTabText, filter === 'active' && styles.filterTabTextActive]}>
              Active
            </AppText>
            <View style={[styles.countPill, filter === 'active' ? styles.countPillActive : styles.countPillInactive]}>
              <AppText style={[styles.countPillText, filter === 'active' ? styles.countPillTextActive : styles.countPillTextInactive]}>
                {activeCount}
              </AppText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterTab, filter === 'inactive' && styles.filterTabActive]}
            onPress={() => setFilter('inactive')}
            activeOpacity={0.7}
          >
            <AppText style={[styles.filterTabText, filter === 'inactive' && styles.filterTabTextActive]}>
              Inactive
            </AppText>
            <View style={[styles.countPill, filter === 'inactive' ? styles.countPillActive : styles.countPillInactive]}>
              <AppText style={[styles.countPillText, filter === 'inactive' ? styles.countPillTextActive : styles.countPillTextInactive]}>
                {inactiveCount}
              </AppText>
            </View>
          </TouchableOpacity>
        </ScrollView>

        {/* Search Input */}
        <View style={styles.searchWrapper}>
          <Search size={16} color="#667776" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by facility name, slug, city, or contact email"
            placeholderTextColor="#8FA39E"
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
      </View>

      {/* Main Clubs List */}
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
            <Card style={styles.clubCard}>
              <View style={styles.cardHeader}>
                <View style={styles.clubTitleGroup}>
                  <View style={styles.clubTitleRow}>
                    <Building2 size={18} color="#18794E" style={styles.clubIcon} />
                    <AppText variant="title" color="primary" numberOfLines={1} style={styles.clubName}>
                      {item.name}
                    </AppText>
                  </View>
                  <AppText variant="caption" color="secondary" style={styles.slugCode}>
                    slug: /{item.slug}
                  </AppText>
                </View>
                <Badge
                  label={item.is_active ? 'ACTIVE' : 'INACTIVE'}
                  variant={item.is_active ? 'success' : 'error'}
                  size="sm"
                />
              </View>

              {item.short_description && (
                <AppText variant="bodySmall" color="secondary" numberOfLines={2} style={styles.shortDescText}>
                  {item.short_description}
                </AppText>
              )}

              <View style={styles.detailsRow}>
                <View style={styles.infoCol}>
                  {item.city && (
                    <View style={styles.inlineItem}>
                      <MapPin size={13} color="#667776" />
                      <AppText variant="caption" color="secondary" numberOfLines={1}>
                        {item.city}, {item.state || item.country}
                      </AppText>
                    </View>
                  )}
                  {item.contact_email && (
                    <View style={styles.inlineItem}>
                      <Mail size={13} color="#667776" />
                      <AppText variant="caption" color="secondary" numberOfLines={1}>
                        {item.contact_email}
                      </AppText>
                    </View>
                  )}
                </View>

                <View style={styles.infoCol}>
                  <View style={styles.inlineItem}>
                    <Users size={13} color="#667776" />
                    <AppText variant="caption" color="secondary">
                      {item.active_members_count} active {item.active_members_count === 1 ? 'member' : 'members'}
                    </AppText>
                  </View>
                  {item.created_at && (
                    <View style={styles.inlineItem}>
                      <Calendar size={13} color="#667776" />
                      <AppText variant="caption" color="secondary">
                        Registered {new Date(item.created_at).toLocaleDateString()}
                      </AppText>
                    </View>
                  )}
                </View>
              </View>

              {/* Action Link to Inspect Facility */}
              <View style={styles.cardActionsRow}>
                <Button
                  label="Inspect Facility Profile"
                  variant="outline"
                  size="sm"
                  onPress={() => setSelectedClub(item)}
                  leftIcon={<Eye size={14} color="#18794E" />}
                  style={styles.inspectBtn}
                />
              </View>
            </Card>
          )}
        />
      )}

      {/* Club Details Modal */}
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
                  {/* Status Success Banner */}
                  {statusSuccessMessage && (
                    <View style={styles.successBanner}>
                      <CheckCircle2 size={16} color="#18794E" />
                      <AppText variant="caption" color="brand" style={styles.successBannerText}>
                        {statusSuccessMessage}
                      </AppText>
                      <TouchableOpacity
                        onPress={() => setStatusSuccessMessage(null)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <X size={14} color="#18794E" />
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Status Control Card */}
                  <View style={styles.statusActionCard}>
                    <View style={styles.statusInfoGroup}>
                      <View style={styles.statusBadgeRow}>
                        <AppText variant="label" color="secondary" style={styles.statusLabel}>
                          Facility Status:
                        </AppText>
                        <Badge
                          label={selectedClub.is_active ? 'ACTIVE' : 'SUSPENDED'}
                          variant={selectedClub.is_active ? 'success' : 'error'}
                          size="md"
                        />
                      </View>
                      <AppText variant="caption" color="secondary" style={styles.statusNoteText}>
                        {selectedClub.is_active
                          ? 'Publicly discoverable. Players can book courts, view schedules, and join memberships.'
                          : 'Suspended from discovery and bookings. Data and memberships remain securely preserved.'}
                      </AppText>
                    </View>
                    <Button
                      label={selectedClub.is_active ? 'Suspend Facility' : 'Reactivate Facility'}
                      variant={selectedClub.is_active ? 'danger' : 'primary'}
                      size="sm"
                      leftIcon={
                        selectedClub.is_active ? (
                          <AlertTriangle size={14} color="#DC2626" />
                        ) : (
                          <CheckCircle2 size={14} color="#FFFFFF" />
                        )
                      }
                      onPress={() => openStatusModal(selectedClub, !selectedClub.is_active)}
                    />
                  </View>

                  {/* Summary & Overview */}
                  {selectedClub.short_description && (
                    <View style={styles.modalSection}>
                      <AppText variant="label" color="brand" style={styles.sectionHeaderLabel}>
                        Summary
                      </AppText>
                      <AppText variant="body" color="primary">
                        {selectedClub.short_description}
                      </AppText>
                    </View>
                  )}

                  {selectedClub.description && (
                    <View style={styles.modalSection}>
                      <AppText variant="label" color="brand" style={styles.sectionHeaderLabel}>
                        Description
                      </AppText>
                      <AppText variant="body" color="secondary">
                        {selectedClub.description}
                      </AppText>
                    </View>
                  )}

                  {/* Location & Facility Information */}
                  <View style={styles.modalSection}>
                    <AppText variant="label" color="brand" style={styles.sectionHeaderLabel}>
                      Location & Public Contact
                    </AppText>
                    <View style={styles.detailGrid}>
                      {selectedClub.address_line1 && (
                        <View style={styles.gridRow}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Street Address:</AppText>
                          <AppText variant="body" color="primary" style={styles.gridVal}>
                            {selectedClub.address_line1}
                            {selectedClub.address_line2 ? `, ${selectedClub.address_line2}` : ''}
                          </AppText>
                        </View>
                      )}
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>City, State, Country:</AppText>
                        <AppText variant="body" color="primary" style={styles.gridVal}>
                          {[selectedClub.city, selectedClub.state, selectedClub.postal_code, selectedClub.country].filter(Boolean).join(', ')}
                        </AppText>
                      </View>
                      {selectedClub.contact_email && (
                        <View style={styles.gridRow}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Contact Email:</AppText>
                          <AppText variant="body" color="primary" style={styles.gridVal}>{selectedClub.contact_email}</AppText>
                        </View>
                      )}
                      {selectedClub.contact_phone && (
                        <View style={styles.gridRow}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Contact Phone:</AppText>
                          <AppText variant="body" color="primary" style={styles.gridVal}>{selectedClub.contact_phone}</AppText>
                        </View>
                      )}
                      {selectedClub.website && (
                        <View style={styles.gridRow}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Website:</AppText>
                          <AppText variant="body" color="primary" style={styles.gridVal}>{selectedClub.website}</AppText>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Operating Schedule & Telemetry */}
                  <View style={styles.modalSection}>
                    <AppText variant="label" color="brand" style={styles.sectionHeaderLabel}>
                      Operating Schedule & Members
                    </AppText>
                    <View style={styles.detailGrid}>
                      {selectedClub.operating_days && (
                        <View style={styles.gridRow}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Operating Days:</AppText>
                          <AppText variant="body" color="primary" style={styles.gridVal}>{selectedClub.operating_days}</AppText>
                        </View>
                      )}
                      {selectedClub.opening_time && selectedClub.closing_time && (
                        <View style={styles.gridRow}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Daily Hours:</AppText>
                          <AppText variant="body" color="primary" style={styles.gridVal}>
                            {selectedClub.opening_time} - {selectedClub.closing_time} ({selectedClub.timezone || 'UTC'})
                          </AppText>
                        </View>
                      )}
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>Active Club Memberships:</AppText>
                        <AppText variant="body" color="primary" style={styles.gridVal}>
                          {selectedClub.active_members_count} active
                        </AppText>
                      </View>
                      {selectedClub.created_at && (
                        <View style={styles.gridRow}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Registration Date:</AppText>
                          <AppText variant="body" color="primary" style={styles.gridVal}>
                            {new Date(selectedClub.created_at).toLocaleString()}
                          </AppText>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Platform Boundary Note */}
                  <View style={styles.boundaryCard}>
                    <ShieldAlert size={16} color="#18794E" />
                    <AppText variant="caption" color="secondary" style={styles.boundaryText}>
                      Club court schedules, pricing, staff, and tournaments are managed by the club&apos;s authorized owner in the Club Portal.
                    </AppText>
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalBottomActions}>
              <Button
                label="Close"
                variant="outline"
                onPress={() => setSelectedClub(null)}
                style={styles.modalCloseButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Status Change Confirmation Modal */}
      <Modal
        visible={!!statusTarget}
        animationType="fade"
        transparent
        onRequestClose={() => !isUpdatingStatus && setStatusTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.statusModalCard}>
            {/* Status Modal Header */}
            <View style={styles.statusModalHeader}>
              <View style={styles.statusModalTitleGroup}>
                <View style={styles.statusModalTitleRow}>
                  {statusTarget?.targetActive ? (
                    <CheckCircle2 size={20} color="#18794E" />
                  ) : (
                    <AlertTriangle size={20} color="#DC2626" />
                  )}
                  <AppText variant="heading3" color="primary">
                    {statusTarget?.targetActive ? 'Reactivate Facility' : 'Suspend Facility'}
                  </AppText>
                </View>
                <AppText variant="caption" color="secondary" style={styles.statusModalSubtitle}>
                  {statusTarget?.club.name} · slug: /{statusTarget?.club.slug}
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => !isUpdatingStatus && setStatusTarget(null)}
                disabled={isUpdatingStatus}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={18} color="#2A4540" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.statusModalScroll} showsVerticalScrollIndicator={false}>
              {/* Effect of Status Change */}
              {statusTarget?.targetActive ? (
                <View style={styles.reactivateNoticeCard}>
                  <View style={styles.noticeHeaderRow}>
                    <CheckCircle2 size={16} color="#18794E" />
                    <AppText variant="label" color="brand" style={styles.noticeHeading}>
                      Effect of Reactivation:
                    </AppText>
                  </View>
                  <AppText variant="caption" color="primary" style={styles.bulletItem}>
                    • Restores the facility to player mobile search and discovery immediately.
                  </AppText>
                  <AppText variant="caption" color="primary" style={styles.bulletItem}>
                    • Re-enables court reservations, clinic sign-ups, and member access.
                  </AppText>
                  <AppText variant="caption" color="primary" style={styles.bulletItem}>
                    • Club managers and staff retain full operational dashboard controls.
                  </AppText>
                </View>
              ) : (
                <View style={styles.suspendNoticeCard}>
                  <View style={styles.noticeHeaderRow}>
                    <ShieldAlert size={16} color="#B91C1C" />
                    <AppText variant="label" color="secondary" style={styles.suspendNoticeHeading}>
                      Platform Safety & Suspension Scope:
                    </AppText>
                  </View>
                  <AppText variant="caption" color="primary" style={styles.bulletItem}>
                    • Facility is immediately hidden from player discovery and mobile search.
                  </AppText>
                  <AppText variant="caption" color="primary" style={styles.bulletItem}>
                    • New court bookings and membership plan purchases are halted.
                  </AppText>
                  <AppText variant="caption" color="primary" style={styles.bulletItem}>
                    • Data Preservation: All courts, past bookings, members, and financial records remain 100% intact. No data is deleted.
                  </AppText>
                  <AppText variant="caption" color="primary" style={styles.bulletItem}>
                    • Account Safety: The club owner&apos;s global platform login remains active for other facilities they manage or belong to.
                  </AppText>
                </View>
              )}

              {/* Mandatory Reason Input */}
              <View style={styles.reasonSection}>
                <View style={styles.reasonLabelRow}>
                  <AppText variant="label" color="primary">
                    Administrative Reason <AppText style={styles.requiredAsterisk}>*</AppText>
                  </AppText>
                  <AppText
                    variant="caption"
                    color={statusReason.trim().length >= 5 ? 'brand' : 'secondary'}
                  >
                    {statusReason.trim().length} / 5 chars min
                  </AppText>
                </View>
                <TextInput
                  style={styles.reasonInput}
                  placeholder={
                    statusTarget?.targetActive
                      ? 'Specify the administrative reason for reactivating this facility...'
                      : 'Specify the reason for suspending this facility (e.g. Terms violation, maintenance, non-compliance)...'
                  }
                  placeholderTextColor="#8FA39E"
                  value={statusReason}
                  onChangeText={setStatusReason}
                  multiline
                  numberOfLines={3}
                  editable={!isUpdatingStatus}
                />
                {statusReason.trim().length > 0 && statusReason.trim().length < 5 && (
                  <AppText variant="caption" style={styles.validationErrorText}>
                    Administrative reason must be at least 5 characters.
                  </AppText>
                )}
              </View>

              {/* Error Banner */}
              {statusError && (
                <View style={styles.statusErrorCard}>
                  <AlertCircle size={16} color="#DC2626" />
                  <AppText variant="caption" style={styles.statusErrorText}>
                    {statusError}
                  </AppText>
                </View>
              )}
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.statusModalActions}>
              <Button
                label="Cancel"
                variant="outline"
                onPress={() => !isUpdatingStatus && setStatusTarget(null)}
                disabled={isUpdatingStatus}
                style={styles.actionBtnFlex}
              />
              <Button
                label={
                  isUpdatingStatus
                    ? 'Updating...'
                    : statusTarget?.targetActive
                    ? 'Confirm Reactivation'
                    : 'Confirm Suspension'
                }
                variant={statusTarget?.targetActive ? 'primary' : 'danger'}
                onPress={handleStatusSubmit}
                loading={isUpdatingStatus}
                disabled={isUpdatingStatus || statusReason.trim().length < 5}
                style={styles.actionBtnWide}
              />
            </View>
          </View>
        </View>
      </Modal>
    </PlatformShell>
  );
}

const styles = StyleSheet.create({
  kpiContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: Spacing.md,
    flexWrap: 'wrap',
  },
  kpiCard: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EBE6',
  },
  kpiValue: {
    marginTop: 4,
  },
  controlsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EBE6',
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    gap: 8,
  },
  tabsScroll: {
    flexGrow: 0,
    marginBottom: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    backgroundColor: '#F0F5F2',
  },
  filterTabActive: {
    backgroundColor: '#18794E',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B635D',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  countPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.full,
  },
  countPillInactive: {
    backgroundColor: '#E2EBE6',
  },
  countPillActive: {
    backgroundColor: '#14603E',
  },
  countPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  countPillTextInactive: {
    color: '#4B635D',
  },
  countPillTextActive: {
    color: '#FFFFFF',
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAF9',
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#D7E5DE',
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#122521',
  },
  listContent: {
    gap: 12,
    paddingBottom: 36,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EBE6',
    padding: Spacing.lg,
  },
  clubCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2EBE6',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  clubTitleGroup: {
    flex: 1,
    marginRight: 10,
  },
  clubTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  clubIcon: {
    marginRight: 2,
  },
  clubName: {
    fontSize: 16,
    fontWeight: '700',
  },
  slugCode: {
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#657B75',
    fontSize: 11,
  },
  shortDescText: {
    marginTop: 4,
    marginBottom: 8,
    lineHeight: 18,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: '#F0F5F2',
    gap: 12,
  },
  infoCol: {
    flex: 1,
    gap: 6,
  },
  inlineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardActionsRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: '#F0F5F2',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  inspectBtn: {
    borderColor: '#C3E5D4',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#E2EBE6',
    backgroundColor: '#FAFDFB',
  },
  modalHeaderTitleGroup: {
    flex: 1,
    marginRight: 12,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: Radius.full,
    backgroundColor: '#EEF3F0',
  },
  modalScroll: {
    padding: Spacing.lg,
  },
  modalBody: {
    gap: Spacing.md,
    paddingBottom: 20,
  },
  statusBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalSection: {
    gap: 6,
  },
  sectionHeaderLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#18794E',
    borderBottomWidth: 1,
    borderBottomColor: '#EAF6F0',
    paddingBottom: 4,
    marginBottom: 4,
  },
  detailGrid: {
    gap: 8,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  gridKey: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 140,
  },
  gridVal: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
  },
  boundaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0F7F3',
    borderWidth: 1,
    borderColor: '#D4E8DC',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginTop: 8,
  },
  boundaryText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  modalBottomActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#E2EBE6',
    backgroundColor: '#FAFDFB',
  },
  modalCloseButton: {
    minWidth: 100,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: Radius.md,
    padding: 10,
    marginBottom: 12,
  },
  successBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#065F46',
  },
  statusActionCard: {
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#E2EBE6',
    borderRadius: Radius.md,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  statusInfoGroup: {
    flex: 1,
    minWidth: 200,
    gap: 4,
  },
  statusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusNoteText: {
    fontSize: 12,
    lineHeight: 16,
    color: '#657B75',
  },
  statusModalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '88%',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  statusModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#E2EBE6',
    backgroundColor: '#FAFDFB',
  },
  statusModalTitleGroup: {
    flex: 1,
    marginRight: 12,
  },
  statusModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusModalSubtitle: {
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#657B75',
  },
  statusModalScroll: {
    padding: Spacing.lg,
  },
  reactivateNoticeCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: Radius.md,
    padding: 12,
    marginBottom: 14,
  },
  suspendNoticeCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: Radius.md,
    padding: 12,
    marginBottom: 14,
  },
  noticeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  noticeHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  suspendNoticeHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#991B1B',
  },
  bulletItem: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
    color: '#1F2937',
  },
  reasonSection: {
    gap: 6,
    marginTop: 4,
  },
  reasonLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  requiredAsterisk: {
    color: '#DC2626',
    fontWeight: '700',
  },
  reasonInput: {
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#D7E5DE',
    borderRadius: Radius.md,
    padding: 10,
    fontSize: 13,
    color: '#122521',
    minHeight: 76,
    textAlignVertical: 'top',
  },
  validationErrorText: {
    fontSize: 11,
    color: '#DC2626',
    marginTop: 2,
  },
  statusErrorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: Radius.md,
    padding: 10,
    marginTop: 12,
  },
  statusErrorText: {
    fontSize: 12,
    color: '#991B1B',
    flex: 1,
  },
  statusModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#E2EBE6',
    backgroundColor: '#FAFDFB',
  },
  actionBtnFlex: {
    flex: 1,
  },
  actionBtnWide: {
    flex: 1.5,
  },
});
