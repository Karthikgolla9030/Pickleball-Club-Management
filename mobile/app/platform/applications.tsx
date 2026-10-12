/**
 * Aught2 Pickleball — Platform Owner Applications Review Screen
 *
 * Dedicated administrative review interface for authorized platform owners:
 * - View list of submitted club registration applications (pending, approved, rejected, all)
 * - Inspect full applicant and facility details
 * - Atomically approve pending application (creates Club and initial club_owner membership)
 * - Atomically reject pending application (records optional rejection reason)
 * - Navigates cleanly between Applications and Registered Clubs
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
  Eye,
  LogOut,
  Mail,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  User,
  X,
  XCircle,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
} from '@/components';
import {
  platformApplicationsApi,
  ClubApplicationResponse,
} from '@/services/api/clubApplications';
import { Colors, Radius, Spacing } from '@/theme';
import { useAuthStore } from '@/store';

type FilterTab = 'pending' | 'approved' | 'rejected' | 'all';

export default function PlatformApplicationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const logout = useAuthStore((s) => s.logout);

  const [filter, setFilter] = useState<FilterTab>('pending');
  const [applications, setApplications] = useState<ClubApplicationResponse[]>([]);
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
      const statusParam = filter === 'all' ? undefined : filter;
      const res = await platformApplicationsApi.listApplications(statusParam, 1, 100);
      setApplications(res.items || []);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to fetch club applications';
      setError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filter]);

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
      if (window.confirm(`Approve club application for "${app.club_name}" and activate owner membership for ${app.applicant_name}?`)) {
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
      const updated = await platformApplicationsApi.rejectApplication(appToReject.id, rejectionReason.trim());
      if (selectedApp?.id === appToReject.id) {
        setSelectedApp(updated);
      }
      setRejectModalVisible(false);
      setAppToReject(null);
      Alert.alert('Application Rejected', `Application for "${updated.club_name}" has been marked as rejected.`);
      fetchApplications(true);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to reject application';
      Alert.alert('Rejection Error', msg);
    } finally {
      setIsRejecting(false);
    }
  };

  const filteredApps = applications.filter((app) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      app.club_name.toLowerCase().includes(query) ||
      app.applicant_name.toLowerCase().includes(query) ||
      app.applicant_email.toLowerCase().includes(query) ||
      app.reference_number.toLowerCase().includes(query)
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

  const handleSignOut = async () => {
    await logout();
    router.replace('/platform/login' as any);
  };

  return (
    <Screen style={styles.screen}>
      {/* Platform Navigation Header */}
      <View style={[styles.platformTopBar, { paddingTop: insets.top + 8 }]}>
        <View style={styles.brandRow}>
          <ShieldCheck size={20} color="#18794E" />
          <AppText variant="heading3" color="primary" style={styles.brandTitle}>
            Aught2 Platform
          </AppText>
        </View>

        <View style={styles.navLinksRow}>
          <TouchableOpacity
            style={[styles.platformNavLink, styles.platformNavLinkActive]}
            activeOpacity={0.8}
          >
            <AppText style={[styles.platformNavLinkText, styles.platformNavLinkTextActive]}>
              Applications
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.platformNavLink}
            onPress={() => router.push('/platform/clubs' as any)}
            activeOpacity={0.8}
          >
            <AppText style={styles.platformNavLinkText}>Clubs</AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={handleSignOut}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <LogOut size={16} color="#DC2626" />
          </TouchableOpacity>
        </View>
      </View>

      <AppHeader
        title="Club Applications"
        subtitle="Review and process registration requests"
        showMenu={false}
        rightElement={
          <TouchableOpacity
            onPress={() => fetchApplications(true)}
            style={styles.headerRefreshBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Refresh applications"
          >
            <RefreshCw size={18} color="#18794E" />
          </TouchableOpacity>
        }
      />

      {/* Filter Tabs */}
      <View style={styles.tabsContainer}>
        {(['pending', 'approved', 'rejected', 'all'] as FilterTab[]).map((tab) => {
          const isActive = filter === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.filterTab, isActive && styles.filterTabActive]}
              onPress={() => setFilter(tab)}
              activeOpacity={0.7}
            >
              <AppText
                variant="label"
                style={[styles.filterTabText, isActive && styles.filterTabTextActive]}
              >
                {tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Search Bar */}
      <View style={styles.searchWrapper}>
        <Search size={16} color="#667776" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by club name, applicant, or ref #"
          placeholderTextColor="#8FA39E"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={16} color="#667776" />
          </TouchableOpacity>
        )}
      </View>

      {/* Main List */}
      {isLoading ? (
        <LoadingState message="Loading club applications..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchApplications(true)} />
      ) : (
        <FlatList
          data={filteredApps}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 60 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchApplications(true)}
              tintColor="#18794E"
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="🏢"
              title="No Applications Found"
              description={
                filter === 'pending'
                  ? 'There are no pending club registration applications awaiting review.'
                  : `No applications match the "${filter}" filter.`
              }
            />
          }
          renderItem={({ item }) => (
            <Card style={styles.appCard}>
              <View style={styles.cardHeader}>
                <View style={styles.clubTitleGroup}>
                  <AppText variant="title" color="primary" numberOfLines={1}>
                    {item.club_name}
                  </AppText>
                  <AppText variant="caption" color="secondary" style={styles.refCode}>
                    Ref: {item.reference_number}
                  </AppText>
                </View>
                <Badge
                  label={item.status_label || item.status.toUpperCase()}
                  variant={getStatusVariant(item.status)}
                  size="sm"
                />
              </View>

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
                      {new Date(item.created_at).toLocaleDateString()}
                    </AppText>
                  </View>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionsRow}>
                <Button
                  label="View Details"
                  variant="outline"
                  size="sm"
                  onPress={() => setSelectedApp(item)}
                  leftIcon={<Eye size={14} color="#2A4540" />}
                  style={styles.detailsBtn}
                />

                {item.status === 'pending' && (
                  <View style={styles.pendingActions}>
                    <TouchableOpacity
                      style={styles.rejectMiniBtn}
                      onPress={() => openRejectModal(item)}
                      disabled={isRejecting || isApproving}
                      accessibilityLabel="Reject application"
                    >
                      <X size={15} color="#DC2626" />
                      <AppText style={styles.rejectMiniText}>Reject</AppText>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.approveMiniBtn}
                      onPress={() => handleApprove(item)}
                      disabled={isRejecting || isApproving}
                      accessibilityLabel="Approve application"
                    >
                      <CheckCircle2 size={15} color="#FFFFFF" />
                      <AppText style={styles.approveMiniText}>Approve</AppText>
                    </TouchableOpacity>
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
          <View style={[styles.modalCard, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleGroup}>
                <AppText variant="heading3" color="primary">
                  {selectedApp?.club_name}
                </AppText>
                <AppText variant="caption" color="secondary">
                  Ref: {selectedApp?.reference_number}
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
                <>
                  {/* Status Banner */}
                  <View style={styles.detailSection}>
                    <View style={styles.statusBannerRow}>
                      <AppText variant="label" color="secondary">
                        Current Status:
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
                      Applicant Information
                    </AppText>
                    <View style={styles.detailGrid}>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>Name:</AppText>
                        <AppText variant="body" color="primary" style={styles.gridVal}>{selectedApp.applicant_name}</AppText>
                      </View>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>Email:</AppText>
                        <AppText variant="body" color="primary" style={styles.gridVal}>{selectedApp.applicant_email}</AppText>
                      </View>
                      {selectedApp.applicant_phone && (
                        <View style={styles.gridRow}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Phone:</AppText>
                          <AppText variant="body" color="primary" style={styles.gridVal}>{selectedApp.applicant_phone}</AppText>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Club Facility Details */}
                  <View style={styles.detailSection}>
                    <AppText variant="label" color="brand" style={styles.sectionHeaderLabel}>
                      Facility & Club Info
                    </AppText>
                    <View style={styles.detailGrid}>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>URL Slug:</AppText>
                        <AppText variant="body" color="primary" style={styles.gridVal}>{selectedApp.slug}</AppText>
                      </View>
                      {selectedApp.address_line1 && (
                        <View style={styles.gridRow}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Address:</AppText>
                          <AppText variant="body" color="primary" style={styles.gridVal}>
                            {selectedApp.address_line1}{selectedApp.address_line2 ? `, ${selectedApp.address_line2}` : ''}
                          </AppText>
                        </View>
                      )}
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>City/State:</AppText>
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
                      {selectedApp.facilities_summary && (
                        <View style={styles.gridColumn}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Facilities:</AppText>
                          <AppText variant="body" color="primary">{selectedApp.facilities_summary}</AppText>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Submission Timestamps */}
                  <View style={styles.detailSection}>
                    <AppText variant="label" color="brand" style={styles.sectionHeaderLabel}>
                      Review Record
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
                    </View>
                  </View>
                </>
              )}
            </ScrollView>

            {/* Modal Bottom Actions */}
            {selectedApp?.status === 'pending' && (
              <View style={styles.modalActionButtons}>
                <Button
                  label="Reject Application"
                  variant="outline"
                  onPress={() => {
                    openRejectModal(selectedApp);
                  }}
                  disabled={isApproving || isRejecting}
                  style={styles.modalRejectBtn}
                />
                <Button
                  label={isApproving ? 'Approving...' : 'Approve & Activate Club'}
                  variant="primary"
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
                Reject Application
              </AppText>
            </View>
            <AppText variant="body" color="secondary" style={styles.rejectDialogSubtitle}>
              Please provide an optional reason for rejecting the application for &ldquo;{appToReject?.club_name}&rdquo;.
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F9F8',
  },
  platformTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E4ECE8',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A2E2B',
  },
  navLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  platformNavLink: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: '#F0F4F2',
  },
  platformNavLinkActive: {
    backgroundColor: '#18794E',
  },
  platformNavLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B635D',
  },
  platformNavLinkTextActive: {
    color: '#FFFFFF',
  },
  signOutBtn: {
    padding: 6,
    borderRadius: Radius.md,
    backgroundColor: '#FEE2E2',
    marginLeft: 4,
  },
  headerRefreshBtn: {
    padding: 8,
    borderRadius: Radius.md,
    backgroundColor: '#EAF6F0',
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E4ECE8',
    gap: 8,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: Radius.full,
    backgroundColor: '#F0F4F2',
  },
  filterTabActive: {
    backgroundColor: '#18794E',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B635D',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: Spacing.md,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#D3DFDB',
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1A2E2B',
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 24,
    gap: 12,
  },
  appCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E4ECE8',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  clubTitleGroup: {
    flex: 1,
    marginRight: 10,
  },
  refCode: {
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#667776',
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F0F4F2',
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
  },
  detailsBtn: {
    minHeight: 34,
    paddingHorizontal: 12,
  },
  pendingActions: {
    flexDirection: 'row',
    gap: 8,
  },
  rejectMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  rejectMiniText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  approveMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    backgroundColor: '#18794E',
  },
  approveMiniText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    width: '100%',
    maxWidth: 600,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E4ECE8',
  },
  modalHeaderTitleGroup: {
    flex: 1,
    marginRight: 12,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalScroll: {
    marginVertical: 14,
  },
  detailSection: {
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  sectionHeaderLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rejectionNotice: {
    marginTop: 10,
    padding: 10,
    borderRadius: Radius.md,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  rejectionNoticeTitle: {
    color: '#B91C1C',
    fontWeight: '700',
    marginBottom: 4,
  },
  rejectionNoticeText: {
    color: '#991B1B',
    fontSize: 13,
  },
  detailGrid: {
    gap: 8,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gridColumn: {
    marginTop: 4,
    gap: 4,
  },
  gridKey: {
    fontSize: 13,
    color: '#667776',
    fontWeight: '500',
  },
  gridVal: {
    fontSize: 13,
    color: '#1A2E2B',
    fontWeight: '600',
  },
  modalActionButtons: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E4ECE8',
  },
  modalRejectBtn: {
    flex: 1,
  },
  modalApproveBtn: {
    flex: 1,
  },
  rejectDialogCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: 20,
    width: '100%',
    maxWidth: 440,
  },
  rejectDialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  rejectDialogTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  rejectDialogSubtitle: {
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 18,
  },
  rejectInput: {
    borderWidth: 1,
    borderColor: '#D3DFDB',
    borderRadius: Radius.md,
    padding: 12,
    fontSize: 14,
    color: '#1A2E2B',
    minHeight: 90,
    marginBottom: 16,
  },
  rejectDialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  rejectDialogCancelBtn: {
    flex: 1,
  },
  rejectDialogConfirmBtn: {
    flex: 1,
  },
});
