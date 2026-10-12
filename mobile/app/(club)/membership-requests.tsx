/**
 * Aught2 Pickleball — Club Membership Requests Management Screen (Staff)
 *
 * Allows Club Owner and Club Manager to:
 * - Review pending player membership requests
 * - Approve requests (atomically activates player membership)
 * - Reject requests (with optional reason)
 * - Inspect processed request history
 */

import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  Mail,
  MessageSquare,
  ShieldAlert,
  Star,
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
  SegmentedTabs,
} from '@/components';
import { useActiveClub, useMembershipRequests, usePermission } from '@/hooks';
import { Colors, Radius, Spacing } from '@/theme';
import type { MembershipRequest } from '@/types';

export default function ClubMembershipRequestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { clubId, clubName } = useActiveClub();
  const permissions = usePermission();

  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

  const {
    requests,
    isLoading,
    isRefetching,
    error,
    refetch,
    approveRequest,
    isApproving,
    rejectRequest,
    isRejecting,
  } = useMembershipRequests(clubId);

  // Reject Dialog Modal State
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<MembershipRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Strict check on staff permission
  const canManageMembers = permissions.canManageMembers;

  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const historyRequests = requests.filter((r) => r.status !== 'pending');

  const displayedRequests = activeTab === 'pending' ? pendingRequests : historyRequests;

  const handleApprove = (req: MembershipRequest) => {
    Alert.alert(
      'Approve Membership',
      `Are you sure you want to approve ${req.user_full_name || req.user_email} as an active player member?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          style: 'default',
          onPress: async () => {
            try {
              await approveRequest(req.id);
              Alert.alert('Approved', `${req.user_full_name || req.user_email} is now an active member.`);
            } catch (err: any) {
              const msg = err?.response?.data?.detail || err?.message || 'Failed to approve request';
              Alert.alert('Error', msg);
            }
          },
        },
      ],
    );
  };

  const handleOpenRejectModal = (req: MembershipRequest) => {
    setSelectedRequest(req);
    setRejectionReason('');
    setRejectModalVisible(true);
  };

  const handleConfirmReject = async () => {
    if (!selectedRequest || isRejecting) return;
    try {
      await rejectRequest({
        requestId: selectedRequest.id,
        reason: rejectionReason.trim() || undefined,
      });
      setRejectModalVisible(false);
      setSelectedRequest(null);
      setRejectionReason('');
      Alert.alert('Request Rejected', 'The membership application has been rejected.');
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to reject request';
      Alert.alert('Error', msg);
    }
  };

  if (!canManageMembers) {
    return (
      <Screen style={styles.screen}>
        <AppHeader title="Membership Requests" showBack />
        <Card style={styles.deniedCard}>
          <ShieldAlert size={36} color="#B45309" />
          <AppText variant="heading3" color="primary" style={styles.deniedTitle}>
            Access Restricted
          </AppText>
          <AppText variant="bodySmall" color="secondary" style={styles.deniedMsg}>
            Only Club Owners and Club Managers can review player membership applications.
            Tournament Directors and unauthorized accounts cannot view or modify member requests.
          </AppText>
          <Button
            label="Return to Dashboard"
            variant="outline"
            onPress={() => router.back()}
            style={styles.deniedBtn}
          />
        </Card>
      </Screen>
    );
  }

  const renderRequestCard = ({ item }: { item: MembershipRequest }) => {
    const isPending = item.status === 'pending';
    const isApproved = item.status === 'approved';
    const isRejected = item.status === 'rejected';

    let badgeVariant: 'warning' | 'success' | 'error' | 'default' = 'default';
    if (isPending) badgeVariant = 'warning';
    else if (isApproved) badgeVariant = 'success';
    else if (isRejected) badgeVariant = 'error';

    const displayName = item.player_display_name || item.user_full_name || 'Applicant';

    return (
      <Card style={styles.requestCard}>
        {/* Top Header */}
        <View style={styles.cardHeader}>
          <View style={styles.applicantAvatar}>
            <User size={20} color="#18794E" />
          </View>

          <View style={styles.applicantInfo}>
            <View style={styles.nameRow}>
              <AppText variant="heading3" color="primary" numberOfLines={1} style={styles.nameText}>
                {displayName}
              </AppText>
              <Badge label={item.status.toUpperCase()} variant={badgeVariant} size="sm" />
            </View>

            <View style={styles.emailRow}>
              <Mail size={12} color="#667776" />
              <AppText variant="caption" color="secondary">
                {item.user_email}
              </AppText>
            </View>

            {item.player_skill_rating ? (
              <View style={styles.ratingRow}>
                <Star size={12} color="#D97706" />
                <AppText variant="caption" style={styles.ratingText}>
                  Skill Rating: {item.player_skill_rating.toFixed(1)}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>

        {/* Applicant Message */}
        {item.message ? (
          <View style={styles.messageBox}>
            <MessageSquare size={13} color="#4A5D57" style={styles.msgIcon} />
            <AppText variant="bodySmall" color="secondary" style={styles.msgText}>
              "{item.message}"
            </AppText>
          </View>
        ) : null}

        {/* Rejection Reason (in history) */}
        {item.rejection_reason ? (
          <View style={styles.rejectionBox}>
            <AlertCircle size={13} color="#C53030" style={styles.msgIcon} />
            <AppText variant="caption" style={styles.rejectionText}>
              Reason: {item.rejection_reason}
            </AppText>
          </View>
        ) : null}

        {/* Timestamp & Meta */}
        <View style={styles.cardMeta}>
          <Clock size={12} color="#8A9B95" />
          <AppText variant="caption" color="secondary">
            {isPending
              ? `Requested on ${new Date(item.created_at).toLocaleDateString()}`
              : `Reviewed on ${item.reviewed_at ? new Date(item.reviewed_at).toLocaleDateString() : 'N/A'}`}
          </AppText>
        </View>

        {/* Actions for Pending Requests */}
        {isPending ? (
          <View style={styles.actionsRow}>
            <Button
              label="Reject"
              variant="outline"
              size="sm"
              onPress={() => handleOpenRejectModal(item)}
              disabled={isApproving || isRejecting}
              style={styles.actionBtn}
            />
            <Button
              label="Approve"
              size="sm"
              onPress={() => handleApprove(item)}
              disabled={isApproving || isRejecting}
              style={styles.actionBtn}
            />
          </View>
        ) : null}
      </Card>
    );
  };

  return (
    <Screen style={styles.screen}>
      {/* Automatic Activation Notice */}
      <View style={styles.autoActivationBanner}>
        <CheckCircle2 size={18} color="#18794E" />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="bodySmall" style={{ color: '#18794E', fontWeight: '600' }}>
            Automatic Activation Active
          </AppText>
          <AppText variant="caption" color="secondary">
            Ordinary player memberships activate automatically upon joining or plan purchase.
          </AppText>
        </View>
        <Button
          label="Members"
          size="sm"
          variant="outline"
          onPress={() => router.replace('/(club)/members' as any)}
        />
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <SegmentedTabs
          tabs={[
            { key: 'pending', label: `Pending (${pendingRequests.length})` },
            { key: 'history', label: `History (${historyRequests.length})` },
          ]}
          activeTab={activeTab}
          onTabChange={(k) => setActiveTab(k as 'pending' | 'history')}
        />
      </View>

      {/* List Area */}
      {isLoading && requests.length === 0 ? (
        <LoadingState message="Loading membership requests..." />
      ) : error && requests.length === 0 ? (
        <ErrorState
          title="Unable to Load Requests"
          message={error.message || 'Network error occurred.'}
          onRetry={() => refetch()}
        />
      ) : displayedRequests.length === 0 ? (
        <EmptyState
          title={activeTab === 'pending' ? 'No Pending Requests' : 'No Processed History'}
          description={
            activeTab === 'pending'
              ? 'All membership applications for this club have been processed.'
              : 'Processed requests and application history will appear here.'
          }
        />
      ) : (
        <FlatList
          data={displayedRequests}
          keyExtractor={(item) => item.id}
          renderItem={renderRequestCard}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 80 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#18794E"
            />
          }
        />
      )}

      {/* Rejection Modal */}
      <Modal
        visible={rejectModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={styles.modalDialog}>
            <View style={styles.modalHeader}>
              <View>
                <AppText variant="heading3" color="primary">
                  Reject Application
                </AppText>
                <AppText variant="caption" color="secondary">
                  {selectedRequest?.user_full_name || selectedRequest?.user_email}
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => setRejectModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#667776" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <AppText variant="bodySmall" color="secondary">
                Optional reason for the rejection (visible to applicant):
              </AppText>

              <TextInput
                value={rejectionReason}
                onChangeText={setRejectionReason}
                placeholder="e.g. Club is currently at full capacity for open play..."
                placeholderTextColor="#8A9B95"
                multiline
                numberOfLines={3}
                style={styles.reasonInput}
              />
            </View>

            <View style={styles.modalFooter}>
              <Button
                label={isRejecting ? 'Rejecting...' : 'Confirm Rejection'}
                variant="outline"
                onPress={handleConfirmReject}
                disabled={isRejecting}
                style={styles.confirmRejectBtn}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5F8F7',
  },
  autoActivationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#E4F4EC',
    borderColor: '#A8D5C2',
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  tabsContainer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2EAE6',
  },
  listContent: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  requestCard: {
    padding: Spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    gap: Spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  applicantAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E4F4EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applicantInfo: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nameText: {
    flex: 1,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  ratingText: {
    color: '#D97706',
    fontWeight: '600',
  },
  messageBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F9FBFB',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#EDF3F0',
    gap: 6,
  },
  msgIcon: {
    marginTop: 2,
  },
  msgText: {
    flex: 1,
    fontStyle: 'italic',
  },
  rejectionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    padding: Spacing.xs,
    borderRadius: Radius.sm,
    gap: 6,
  },
  rejectionText: {
    color: '#991B1B',
    flex: 1,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2',
  },
  actionBtn: {
    flex: 1,
  },
  deniedCard: {
    margin: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  deniedTitle: {
    marginTop: Spacing.xs,
  },
  deniedMsg: {
    textAlign: 'center',
    lineHeight: 20,
  },
  deniedBtn: {
    marginTop: Spacing.sm,
    width: '100%',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  modalDialog: {
    padding: Spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    gap: Spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalBody: {
    gap: Spacing.sm,
  },
  reasonInput: {
    backgroundColor: '#F5F8F7',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#D4E2DC',
    padding: Spacing.sm,
    color: '#102B2A',
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 14,
    fontFamily: 'Inter',
  },
  modalFooter: {
    alignItems: 'center',
  },
  confirmRejectBtn: {
    width: '100%',
    borderColor: '#DC2626',
  },
});
