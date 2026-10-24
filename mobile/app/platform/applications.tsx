/**
 * Pickleball Multi-Club Platform — Platform Admin Applications Review
 *
 * Dedicated administrative review interface for authorized platform owners:
 * - View list of submitted club registration applications (pending, approved, rejected, all)
 * - Dynamic status filter pills with real count badges
 * - Comprehensive application detail modal with all facility, applicant, and schedule information
 * - Atomically approve pending application (creates Club and initial club_owner membership)
 * - Atomically reject pending application (records reason)
 * - Standardized PlatformShell with consistent navigation, light theme, and error/empty/loading states
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
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
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  Globe,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  SlidersHorizontal,
  User,
  X,
  XCircle,
} from 'lucide-react-native';

import {
  AppText,
  Badge,
  Button,
  Card,
  ClubEmptyIllustration,
  EmptyState,
  ErrorState,
  LoadingState,
  PlatformButton,
  PlatformShell,
} from '@/components';
import {
  ClubApplicationResponse,
  platformApplicationsApi,
} from '@/services/api/clubApplications';
import { Colors, Radius, Spacing } from '@/theme';

type FilterTab = 'pending' | 'approved' | 'rejected' | 'all';

export default function PlatformApplicationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [filter, setFilter] = useState<FilterTab>('pending');
  const [allApplications, setAllApplications] = useState<ClubApplicationResponse[]>([]);
  const [statusCounts, setStatusCounts] = useState<{ pending: number; approved: number; rejected: number; all: number }>({
    pending: 0,
    approved: 0,
    rejected: 0,
    all: 0,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detail Modal
  const [selectedApp, setSelectedApp] = useState<ClubApplicationResponse | null>(null);

  // Rejection Dialog
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [appToReject, setAppToReject] = useState<ClubApplicationResponse | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Approval Loading
  const [isApproving, setIsApproving] = useState(false);

  const fetchApplications = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const res = await platformApplicationsApi.listApplications(undefined, 1, 100);
      const items = res.items || [];
      setAllApplications(items);
      if (res.counts) {
        setStatusCounts(res.counts);
      } else {
        setStatusCounts({
          pending: items.filter((a) => a.status === 'pending').length,
          approved: items.filter((a) => a.status === 'approved').length,
          rejected: items.filter((a) => a.status === 'rejected').length,
          all: res.total || items.length,
        });
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to fetch club applications';
      setError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const handleApprove = (app: ClubApplicationResponse) => {
    const confirmApprove = async () => {
      setIsApproving(true);
      try {
        const updated = await platformApplicationsApi.approveApplication(app.id);
        if (selectedApp?.id === app.id) {
          setSelectedApp(updated);
        }
        Alert.alert(
          'Application Approved',
          `Club "${updated.club_name}" is now active and ${updated.applicant_name} has been granted the Club Owner role.`
        );
        fetchApplications(true);
      } catch (err: any) {
        const msg = err?.response?.data?.detail || err?.message || 'Failed to approve application';
        Alert.alert('Approval Error', msg);
      } finally {
        setIsApproving(false);
      }
    };

    if (Platform.OS === 'web') {
      if (
        window.confirm(
          `Approve club application for "${app.club_name}" and activate initial Club Owner role for ${app.applicant_name}?`
        )
      ) {
        confirmApprove();
      }
    } else {
      Alert.alert(
        'Approve Club Application',
        `Approve "${app.club_name}" and assign initial Club Owner membership to ${app.applicant_name} (${app.applicant_email})?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Approve', style: 'default', onPress: confirmApprove },
        ]
      );
    }
  };

  const openRejectModal = (app: ClubApplicationResponse) => {
    setAppToReject(app);
    setRejectionReason('');
    setRejectModalVisible(true);
  };

  const handleConfirmReject = async () => {
    if (!appToReject) return;
    setIsRejecting(true);
    try {
      const updated = await platformApplicationsApi.rejectApplication(
        appToReject.id,
        rejectionReason.trim()
      );
      if (selectedApp?.id === appToReject.id) {
        setSelectedApp(updated);
      }
      setRejectModalVisible(false);
      setAppToReject(null);
      Alert.alert(
        'Application Rejected',
        `Application for "${updated.club_name}" has been marked as rejected.`
      );
      fetchApplications(true);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to reject application';
      Alert.alert('Rejection Error', msg);
    } finally {
      setIsRejecting(false);
    }
  };

  const tabCounts: Record<FilterTab, number> = {
    pending: statusCounts.pending,
    approved: statusCounts.approved,
    rejected: statusCounts.rejected,
    all: statusCounts.all,
  };

  const filteredApps = allApplications
    .filter((app) => (filter === 'all' ? true : app.status === filter))
    .filter((app) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        app.club_name.toLowerCase().includes(query) ||
        app.applicant_name.toLowerCase().includes(query) ||
        app.applicant_email.toLowerCase().includes(query) ||
        app.reference_number.toLowerCase().includes(query) ||
        (app.city && app.city.toLowerCase().includes(query)) ||
        (app.state && app.state.toLowerCase().includes(query))
      );
    });

  const getStatusVariant = (status: string): 'success' | 'warning' | 'error' | 'default' => {
    switch (status) {
      case 'approved':
        return 'success';
      case 'pending':
        return 'warning';
      case 'rejected':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <PlatformShell
      activeTab="applications"
      onRefresh={() => fetchApplications(true)}
      isRefreshing={isRefreshing}
      scrollable={false}
    >
      {/* Main List */}
      {isLoading ? (
        <LoadingState message="Loading club applications..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchApplications(true)} />
      ) : (
        <FlatList
          data={filteredApps}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchApplications(true)}
              tintColor="#15803D"
            />
          }
          ListHeaderComponent={
            <View style={styles.headerContainer}>
              {/* 1. Page Title & Subtitle */}
              <View style={styles.headerSection}>
                <AppText style={styles.screenTitle}>Club Applications</AppText>
                <AppText style={styles.screenSubtitle}>
                  Review and manage club registration applications
                </AppText>
              </View>

              {/* 2. Status Filter Chips (Horizontally Scrollable) */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tabsScroll}
                contentContainerStyle={styles.tabsContainer}
              >
                {(['pending', 'approved', 'rejected', 'all'] as FilterTab[]).map((tab) => {
                  const isActive = filter === tab;
                  const count = tabCounts[tab];
                  const label = tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1);
                  return (
                    <TouchableOpacity
                      key={tab}
                      style={[styles.filterTab, isActive && styles.filterTabActive]}
                      onPress={() => setFilter(tab)}
                      activeOpacity={0.7}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: isActive }}
                    >
                      <AppText
                        style={[styles.filterTabText, isActive && styles.filterTabTextActive]}
                      >
                        {label}
                      </AppText>
                      <View
                        style={[
                          styles.countPill,
                          isActive ? styles.countPillActive : styles.countPillInactive,
                        ]}
                      >
                        <AppText
                          style={[
                            styles.countPillText,
                            isActive ? styles.countPillTextActive : styles.countPillTextInactive,
                          ]}
                        >
                          {count}
                        </AppText>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* 3. Search and Filter Row */}
              <View style={styles.searchRow}>
                <View style={styles.searchBar}>
                  <Search size={18} color="#64748B" style={styles.searchIcon} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search by club name, applicant name, email, city..."
                    placeholderTextColor="#94A3B8"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setSearchQuery('')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <X size={16} color="#64748B" />
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.filterBtn}
                  onPress={() => {
                    if (filter === 'pending') setFilter('approved');
                    else if (filter === 'approved') setFilter('rejected');
                    else if (filter === 'rejected') setFilter('all');
                    else setFilter('pending');
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Filter applications"
                >
                  <SlidersHorizontal size={18} color="#475569" />
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={
            <Card style={styles.emptyCard}>
              <View style={styles.emptyContent}>
                <ClubEmptyIllustration width={160} height={110} />
                <AppText style={styles.emptyTitle}>No applications found</AppText>
                <AppText style={styles.emptyDescription}>
                  {searchQuery
                    ? `No applications match the search query "${searchQuery}".`
                    : filter === 'pending'
                    ? 'There are no pending club registration applications awaiting review.'
                    : filter === 'approved'
                    ? 'There are no approved club registration applications found.'
                    : filter === 'rejected'
                    ? 'There are no rejected club registration applications found.'
                    : 'There are currently no club registration applications in the system.'}
                </AppText>
              </View>
            </Card>
          }
          renderItem={({ item }) => (
            <Card style={styles.appCard}>
              <View style={styles.cardHeader}>
                <View style={styles.clubTitleGroup}>
                  <View style={styles.clubTitleRow}>
                    <Building2 size={18} color="#18794E" style={styles.cardClubIcon} />
                    <AppText variant="title" color="primary" numberOfLines={1} style={styles.clubNameText}>
                      {item.club_name}
                    </AppText>
                  </View>
                  <AppText variant="caption" color="secondary" style={styles.refCode}>
                    Ref: {item.reference_number} · slug: /{item.slug}
                  </AppText>
                </View>
                <Badge
                  label={item.status_label || item.status.toUpperCase()}
                  variant={getStatusVariant(item.status)}
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
                  <View style={styles.inlineItem}>
                    <User size={13} color="#667776" />
                    <AppText variant="caption" color="secondary" numberOfLines={1}>
                      {item.applicant_name}
                    </AppText>
                  </View>
                  <View style={styles.inlineItem}>
                    <Mail size={13} color="#667776" />
                    <AppText variant="caption" color="secondary" numberOfLines={1}>
                      {item.applicant_email}
                    </AppText>
                  </View>
                </View>

                <View style={styles.infoCol}>
                  {item.city && (
                    <View style={styles.inlineItem}>
                      <MapPin size={13} color="#667776" />
                      <AppText variant="caption" color="secondary" numberOfLines={1}>
                        {item.city}, {item.state || item.country}
                      </AppText>
                    </View>
                  )}
                  <View style={styles.inlineItem}>
                    <Calendar size={13} color="#667776" />
                    <AppText variant="caption" color="secondary">
                      Submitted {new Date(item.created_at).toLocaleDateString()}
                    </AppText>
                  </View>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionsRow}>
                <PlatformButton
                  label="Inspect Application"
                  variant="outline"
                  size="sm"
                  onPress={() => setSelectedApp(item)}
                  leftIcon={<Eye size={14} color="#15803D" />}
                />

                {item.status === 'pending' && (
                  <View style={styles.pendingActions}>
                    <PlatformButton
                      label="Reject"
                      variant="danger"
                      size="sm"
                      onPress={() => openRejectModal(item)}
                      disabled={isRejecting || isApproving}
                      leftIcon={<X size={14} color="#FFFFFF" />}
                      accessibilityLabel="Reject application"
                    />

                    <PlatformButton
                      size="sm"
                      label="Approve Club"
                      leftIcon={<CheckCircle2 size={14} color="#FFFFFF" />}
                      onPress={() => handleApprove(item)}
                      disabled={isRejecting || isApproving}
                      accessibilityLabel="Approve application"
                    />
                  </View>
                )}
              </View>
            </Card>
          )}
        />
      )}

      {/* Application Detail Modal */}
      <Modal
        visible={!!selectedApp}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedApp(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleGroup}>
                <AppText variant="heading3" color="primary">
                  {selectedApp?.club_name}
                </AppText>
                <AppText variant="caption" color="secondary">
                  Reference: {selectedApp?.reference_number} · Slug: /{selectedApp?.slug}
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedApp(null)}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#2A4540" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {selectedApp && (
                <View style={styles.modalBody}>
                  {/* Status Banner */}
                  <View style={styles.detailSection}>
                    <View style={styles.statusBannerRow}>
                      <AppText variant="label" color="secondary">
                        Application Status:
                      </AppText>
                      <Badge
                        label={selectedApp.status_label || selectedApp.status.toUpperCase()}
                        variant={getStatusVariant(selectedApp.status)}
                        size="md"
                      />
                    </View>
                    {selectedApp.rejection_reason && (
                      <View style={styles.rejectionNotice}>
                        <AppText variant="caption" style={styles.rejectionNoticeTitle}>
                          Rejection Reason:
                        </AppText>
                        <AppText variant="body" style={styles.rejectionNoticeText}>
                          {selectedApp.rejection_reason}
                        </AppText>
                      </View>
                    )}
                  </View>

                  {/* Applicant Details */}
                  <View style={styles.detailSection}>
                    <AppText variant="label" color="brand" style={styles.sectionHeaderLabel}>
                      Applicant & Owner Profile
                    </AppText>
                    <View style={styles.detailGrid}>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>Full Name:</AppText>
                        <AppText variant="body" color="primary" style={styles.gridVal}>{selectedApp.applicant_name}</AppText>
                      </View>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>Email Address:</AppText>
                        <AppText variant="body" color="primary" style={styles.gridVal}>{selectedApp.applicant_email}</AppText>
                      </View>
                      {selectedApp.applicant_phone && (
                        <View style={styles.gridRow}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Phone Number:</AppText>
                          <AppText variant="body" color="primary" style={styles.gridVal}>{selectedApp.applicant_phone}</AppText>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Club Facility Details */}
                  <View style={styles.detailSection}>
                    <AppText variant="label" color="brand" style={styles.sectionHeaderLabel}>
                      Club & Facility Details
                    </AppText>
                    <View style={styles.detailGrid}>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>Club Name:</AppText>
                        <AppText variant="body" color="primary" style={styles.gridVal}>{selectedApp.club_name}</AppText>
                      </View>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>URL Slug:</AppText>
                        <AppText variant="body" color="primary" style={styles.gridVal}>{selectedApp.slug}</AppText>
                      </View>
                      {selectedApp.short_description && (
                        <View style={styles.gridColumn}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Tagline / Short Summary:</AppText>
                          <AppText variant="body" color="primary">{selectedApp.short_description}</AppText>
                        </View>
                      )}
                      {selectedApp.description && (
                        <View style={styles.gridColumn}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Full Description:</AppText>
                          <AppText variant="body" color="primary">{selectedApp.description}</AppText>
                        </View>
                      )}
                      {selectedApp.address_line1 && (
                        <View style={styles.gridRow}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Address:</AppText>
                          <AppText variant="body" color="primary" style={styles.gridVal}>
                            {selectedApp.address_line1}
                            {selectedApp.address_line2 ? `, ${selectedApp.address_line2}` : ''}
                          </AppText>
                        </View>
                      )}
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>Location:</AppText>
                        <AppText variant="body" color="primary" style={styles.gridVal}>
                          {[selectedApp.city, selectedApp.state, selectedApp.postal_code, selectedApp.country].filter(Boolean).join(', ')}
                        </AppText>
                      </View>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>Operating Hours:</AppText>
                        <AppText variant="body" color="primary" style={styles.gridVal}>
                          {selectedApp.opening_time} - {selectedApp.closing_time} ({selectedApp.timezone})
                        </AppText>
                      </View>
                      {selectedApp.operating_days && (
                        <View style={styles.gridRow}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Operating Days:</AppText>
                          <AppText variant="body" color="primary" style={styles.gridVal}>{selectedApp.operating_days}</AppText>
                        </View>
                      )}
                      {selectedApp.contact_email && (
                        <View style={styles.gridRow}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Public Email:</AppText>
                          <AppText variant="body" color="primary" style={styles.gridVal}>{selectedApp.contact_email}</AppText>
                        </View>
                      )}
                      {selectedApp.contact_phone && (
                        <View style={styles.gridRow}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Public Phone:</AppText>
                          <AppText variant="body" color="primary" style={styles.gridVal}>{selectedApp.contact_phone}</AppText>
                        </View>
                      )}
                      {selectedApp.website && (
                        <View style={styles.gridRow}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Website:</AppText>
                          <AppText variant="body" color="primary" style={styles.gridVal}>{selectedApp.website}</AppText>
                        </View>
                      )}
                      {selectedApp.facilities_summary && (
                        <View style={styles.gridColumn}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Facilities Summary:</AppText>
                          <AppText variant="body" color="primary">{selectedApp.facilities_summary}</AppText>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Submission and Audit Timestamps */}
                  <View style={styles.detailSection}>
                    <AppText variant="label" color="brand" style={styles.sectionHeaderLabel}>
                      Review Record & Timestamps
                    </AppText>
                    <View style={styles.detailGrid}>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>Submitted At:</AppText>
                        <AppText variant="body" color="primary" style={styles.gridVal}>
                          {new Date(selectedApp.created_at).toLocaleString()}
                        </AppText>
                      </View>
                      {selectedApp.reviewed_at && (
                        <View style={styles.gridRow}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Reviewed At:</AppText>
                          <AppText variant="body" color="primary" style={styles.gridVal}>
                            {new Date(selectedApp.reviewed_at).toLocaleString()}
                          </AppText>
                        </View>
                      )}
                      {selectedApp.club_id && (
                        <View style={styles.gridRow}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Activated Club ID:</AppText>
                          <AppText variant="body" color="primary" style={styles.gridVal}>
                            {selectedApp.club_id}
                          </AppText>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Modal Bottom Actions */}
            {selectedApp?.status === 'pending' && (
              <View style={styles.modalActionButtons}>
                <Button
                  label="Reject Application"
                  variant="outline"
                  onPress={() => openRejectModal(selectedApp)}
                  disabled={isApproving || isRejecting}
                  style={styles.modalRejectBtn}
                />
                <PlatformButton
                  size="md"
                  label={isApproving ? 'Approving...' : 'Approve & Activate Club'}
                  leftIcon={<CheckCircle2 size={15} color="#FFFFFF" />}
                  onPress={() => handleApprove(selectedApp)}
                  loading={isApproving}
                  disabled={isApproving || isRejecting}
                  style={styles.modalApproveBtn}
                />
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Reject Reason Modal */}
      <Modal
        visible={rejectModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.rejectDialogCard}>
            <View style={styles.rejectDialogHeader}>
              <XCircle size={22} color="#DC2626" />
              <AppText variant="heading3" color="primary" style={styles.rejectDialogTitle}>
                Reject Club Application
              </AppText>
            </View>
            <AppText variant="body" color="secondary" style={styles.rejectDialogSubtitle}>
              Please provide an optional reason for rejecting the application for &ldquo;{appToReject?.club_name}&rdquo;. This reason will be recorded on the application record.
            </AppText>

            <TextInput
              style={styles.rejectInput}
              multiline
              numberOfLines={4}
              placeholder="e.g. Incomplete facility credentials, duplicate registration, or unsupported region."
              placeholderTextColor="#8FA39E"
              value={rejectionReason}
              onChangeText={setRejectionReason}
              textAlignVertical="top"
            />

            <View style={styles.rejectDialogActions}>
              <Button
                label="Cancel"
                variant="outline"
                onPress={() => setRejectModalVisible(false)}
                disabled={isRejecting}
                style={styles.rejectDialogCancelBtn}
              />
              <Button
                label={isRejecting ? 'Rejecting...' : 'Confirm Rejection'}
                variant="danger"
                onPress={handleConfirmReject}
                loading={isRejecting}
                style={styles.rejectDialogConfirmBtn}
              />
            </View>
          </View>
        </View>
      </Modal>
    </PlatformShell>
  );
}

const styles = StyleSheet.create({
  // ─── Header Section ────────────────────────────────────────────────────────
  headerContainer: {
    width: '100%',
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

  // ─── Filter Tabs (Scrollable row) ──────────────────────────────────────────
  tabsScroll: {
    marginBottom: 12,
    width: '100%',
  },
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
  },
  filterTabActive: {
    backgroundColor: '#15803D',
  },
  filterTabText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  countPill: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPillInactive: {
    backgroundColor: '#E2E8F0',
  },
  countPillActive: {
    backgroundColor: '#166534',
  },
  countPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  countPillTextActive: {
    color: '#FFFFFF',
  },
  countPillTextInactive: {
    color: '#475569',
  },
  listContent: {
    paddingBottom: 40,
    gap: 12,
  },

  // ─── Search and Filter Controls Row ────────────────────────────────────────
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    width: '100%',
  },
  searchBar: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
      },
    }),
  },
  searchIcon: {
    marginRight: 8,
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13.5,
    color: '#0F172A',
    paddingVertical: 0,
  },
  filterBtn: {
    width: 44,
    height: 44,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
      },
    }),
  },

  // ─── Empty State Card ──────────────────────────────────────────────────────
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  emptyContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 18,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  emptyDescription: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 320,
  },
  appCard: {
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
  cardClubIcon: {
    marginRight: 2,
  },
  clubNameText: {
    fontSize: 16,
    fontWeight: '700',
  },
  refCode: {
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
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: '#F0F5F2',
    gap: 8,
  },
  detailsBtn: {
    borderColor: '#C3E5D4',
  },
  pendingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rejectMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  rejectMiniText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  approveMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: '#18794E',
  },
  approveMiniText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
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
    maxWidth: 680,
    maxHeight: '90%',
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
    gap: Spacing.lg,
    paddingBottom: 20,
  },
  detailSection: {
    gap: 8,
  },
  statusBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rejectionNotice: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginTop: 6,
  },
  rejectionNoticeTitle: {
    fontWeight: '700',
    color: '#DC2626',
    marginBottom: 2,
  },
  rejectionNoticeText: {
    color: '#7F1D1D',
    fontSize: 13,
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
  gridColumn: {
    gap: 4,
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
  modalActionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#E2EBE6',
    backgroundColor: '#FAFDFB',
  },
  modalRejectBtn: {
    borderColor: '#DC2626',
  },
  modalApproveBtn: {
    minWidth: 180,
  },
  rejectDialogCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: 12,
  },
  rejectDialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rejectDialogTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  rejectDialogSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  rejectInput: {
    borderWidth: 1,
    borderColor: '#D7E5DE',
    borderRadius: Radius.md,
    padding: 10,
    fontSize: 13,
    color: '#122521',
    backgroundColor: '#F8FAF9',
    minHeight: 80,
  },
  rejectDialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  rejectDialogCancelBtn: {
    minWidth: 100,
  },
  rejectDialogConfirmBtn: {
    minWidth: 140,
  },
});
