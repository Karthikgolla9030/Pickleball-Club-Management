/**
 * Pickleball Multi-Club Platform — Platform Admin Users Directory
 *
 * Dedicated administrative overview of registered platform users:
 * - Search by name, email, or user UUID
 * - Filter by account status (All, Active, Inactive) and role (All, Staff, Players)
 * - User detail inspection modal showing cross-club staff roles and player memberships
 * - Standardized PlatformShell with consistent navigation, light theme, and error/empty/loading states
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
  Award,
  Building2,
  Calendar,
  CheckCircle2,
  Eye,
  Mail,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User,
  UserCheck,
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
  PlatformUserItem,
  platformApplicationsApi,
} from '@/services/api/clubApplications';
import { Colors, Radius, Spacing } from '@/theme';

type StatusFilter = 'all' | 'active' | 'inactive';
type RoleFilter = 'all' | 'staff' | 'player';

export default function PlatformUsersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [users, setUsers] = useState<PlatformUserItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detail Modal
  const [selectedUser, setSelectedUser] = useState<PlatformUserItem | null>(null);

  const fetchUsers = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const isActiveParam =
        statusFilter === 'all' ? undefined : statusFilter === 'active';
      const roleParam =
        roleFilter === 'all'
          ? undefined
          : roleFilter === 'player'
          ? 'player'
          : undefined;

      const res = await platformApplicationsApi.listUsers({
        page: 1,
        pageSize: 100,
        search: searchQuery.trim() || undefined,
        isActive: isActiveParam,
        role: roleParam,
      });

      let items = res.items || [];

      // If filtering for staff (any non-player role), filter on client if not exact role
      if (roleFilter === 'staff') {
        items = items.filter((u) => u.club_memberships && u.club_memberships.length > 0);
      }

      setUsers(items);
      setTotalCount(res.total || items.length);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to fetch platform users';
      setError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [statusFilter, roleFilter, searchQuery]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const activeUsersCount = users.filter((u) => u.is_active).length;
  const staffUsersCount = users.filter((u) => u.club_memberships && u.club_memberships.length > 0).length;

  return (
    <PlatformShell
      activeTab="users"
      title="Platform Users Directory"
      subtitle="Platform-wide registered user directory, multi-club staff roles, and player memberships"
      onRefresh={() => fetchUsers(true)}
      isRefreshing={isRefreshing}
    >
      {/* Top Telemetry KPI Cards */}
      <View style={styles.kpiContainer}>
        <View style={styles.kpiCard}>
          <AppText variant="caption" color="secondary">Total Accounts</AppText>
          <AppText variant="heading2" color="primary" style={styles.kpiValue}>
            {totalCount}
          </AppText>
        </View>

        <View style={styles.kpiCard}>
          <AppText variant="caption" color="secondary">Active Accounts</AppText>
          <AppText variant="heading2" color="brand" style={styles.kpiValue}>
            {activeUsersCount}
          </AppText>
        </View>

        <View style={styles.kpiCard}>
          <AppText variant="caption" color="secondary">Club Staff Members</AppText>
          <AppText variant="heading2" color="primary" style={styles.kpiValue}>
            {staffUsersCount}
          </AppText>
        </View>
      </View>

      {/* Filter and Search Controls */}
      <View style={styles.controlsCard}>
        {/* Account Status and Role Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScroll}
        >
          <View style={styles.filterGroup}>
            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'all' && styles.filterPillActive]}
              onPress={() => setStatusFilter('all')}
              activeOpacity={0.7}
            >
              <AppText style={[styles.filterPillText, statusFilter === 'all' && styles.filterPillTextActive]}>
                All Accounts
              </AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'active' && styles.filterPillActive]}
              onPress={() => setStatusFilter('active')}
              activeOpacity={0.7}
            >
              <AppText style={[styles.filterPillText, statusFilter === 'active' && styles.filterPillTextActive]}>
                Active
              </AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'inactive' && styles.filterPillActive]}
              onPress={() => setStatusFilter('inactive')}
              activeOpacity={0.7}
            >
              <AppText style={[styles.filterPillText, statusFilter === 'inactive' && styles.filterPillTextActive]}>
                Inactive
              </AppText>
            </TouchableOpacity>
          </View>

          {/* Role Filter Pills */}
          <View style={styles.filterGroup}>
            <TouchableOpacity
              style={[styles.rolePill, roleFilter === 'all' && styles.rolePillActive]}
              onPress={() => setRoleFilter('all')}
              activeOpacity={0.7}
            >
              <AppText style={[styles.rolePillText, roleFilter === 'all' && styles.rolePillTextActive]}>
                All Roles
              </AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.rolePill, roleFilter === 'staff' && styles.rolePillActive]}
              onPress={() => setRoleFilter('staff')}
              activeOpacity={0.7}
            >
              <AppText style={[styles.rolePillText, roleFilter === 'staff' && styles.rolePillTextActive]}>
                Club Staff
              </AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.rolePill, roleFilter === 'player' && styles.rolePillActive]}
              onPress={() => setRoleFilter('player')}
              activeOpacity={0.7}
            >
              <AppText style={[styles.rolePillText, roleFilter === 'player' && styles.rolePillTextActive]}>
                Players
              </AppText>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Search Bar */}
        <View style={styles.searchWrapper}>
          <Search size={16} color="#667776" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by full name, email, or user UUID..."
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

      {/* Main Users List */}
      {isLoading ? (
        <LoadingState message="Loading platform users directory..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchUsers(true)} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchUsers(true)}
              tintColor="#18794E"
            />
          }
          ListEmptyComponent={
            <Card style={styles.emptyCard}>
              <EmptyState
                icon="👥"
                title="No Users Found"
                description={
                  searchQuery
                    ? `No users match the search "${searchQuery}".`
                    : 'There are currently no registered users matching the selected filters.'
                }
              />
            </Card>
          }
          renderItem={({ item }) => {
            const hasStaffRoles = item.club_memberships && item.club_memberships.length > 0;
            const hasPlayerMemberships = item.club_player_memberships && item.club_player_memberships.length > 0;

            return (
              <Card style={styles.userCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.userTitleGroup}>
                    <View style={styles.userTitleRow}>
                      <View style={styles.userAvatarWrap}>
                        <User size={16} color="#18794E" />
                      </View>
                      <View style={styles.nameAndEmail}>
                        <AppText variant="title" color="primary" numberOfLines={1} style={styles.userName}>
                          {item.full_name || 'Unnamed User'}
                        </AppText>
                        <AppText variant="caption" color="secondary" style={styles.userEmail}>
                          {item.email}
                        </AppText>
                      </View>
                    </View>
                  </View>

                  <View style={styles.badgesGroup}>
                    <Badge
                      label={item.is_active ? 'ACTIVE' : 'INACTIVE'}
                      variant={item.is_active ? 'success' : 'error'}
                      size="sm"
                    />
                    {item.is_verified && (
                      <Badge
                        label="VERIFIED"
                        variant="default"
                        size="sm"
                      />
                    )}
                  </View>
                </View>

                {/* Cross-Club Role Summary Tags */}
                <View style={styles.membershipsRow}>
                  {hasStaffRoles &&
                    item.club_memberships.map((m) => (
                      <View key={m.id} style={styles.staffRolePill}>
                        <Shield size={12} color="#18794E" />
                        <AppText style={styles.staffRolePillText}>
                          {m.club_name}: {m.role_label}
                        </AppText>
                      </View>
                    ))}

                  {hasPlayerMemberships &&
                    item.club_player_memberships.map((pm) => (
                      <View key={pm.id} style={styles.playerRolePill}>
                        <Users size={12} color="#2563EB" />
                        <AppText style={styles.playerRolePillText}>
                          {pm.club_name}: Player
                        </AppText>
                      </View>
                    ))}

                  {!hasStaffRoles && !hasPlayerMemberships && (
                    <AppText variant="caption" color="tertiary" style={styles.noMembershipsText}>
                      No active club memberships
                    </AppText>
                  )}
                </View>

                {/* Footer and Inspection Action */}
                <View style={styles.cardFooter}>
                  <View style={styles.footerItem}>
                    <Calendar size={13} color="#667776" />
                    <AppText variant="caption" color="secondary">
                      Joined {new Date(item.created_at).toLocaleDateString()}
                    </AppText>
                  </View>

                  <Button
                    label="Inspect Account"
                    variant="outline"
                    size="sm"
                    onPress={() => setSelectedUser(item)}
                    leftIcon={<Eye size={14} color="#18794E" />}
                    style={styles.inspectBtn}
                  />
                </View>
              </Card>
            );
          }}
        />
      )}

      {/* User Detail Inspection Modal */}
      <Modal
        visible={!!selectedUser}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedUser(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleGroup}>
                <AppText variant="heading3" color="primary">
                  {selectedUser?.full_name || selectedUser?.email}
                </AppText>
                <AppText variant="caption" color="secondary">
                  User ID: {selectedUser?.id}
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedUser(null)}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#2A4540" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {selectedUser && (
                <View style={styles.modalBody}>
                  {/* Account Information Section */}
                  <View style={styles.modalSection}>
                    <AppText variant="label" color="brand" style={styles.sectionHeaderLabel}>
                      Account Information
                    </AppText>
                    <View style={styles.detailGrid}>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>Email Address:</AppText>
                        <AppText variant="body" color="primary" style={styles.gridVal}>{selectedUser.email}</AppText>
                      </View>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>Full Name:</AppText>
                        <AppText variant="body" color="primary" style={styles.gridVal}>{selectedUser.full_name || 'Not provided'}</AppText>
                      </View>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>Account Status:</AppText>
                        <Badge
                          label={selectedUser.is_active ? 'ACTIVE' : 'INACTIVE'}
                          variant={selectedUser.is_active ? 'success' : 'error'}
                          size="sm"
                        />
                      </View>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>Email Verified:</AppText>
                        <Badge
                          label={selectedUser.is_verified ? 'VERIFIED' : 'UNVERIFIED'}
                          variant={selectedUser.is_verified ? 'success' : 'default'}
                          size="sm"
                        />
                      </View>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>Registration Date:</AppText>
                        <AppText variant="body" color="primary" style={styles.gridVal}>
                          {new Date(selectedUser.created_at).toLocaleString()}
                        </AppText>
                      </View>
                    </View>
                  </View>

                  {/* Player Profile Section */}
                  <View style={styles.modalSection}>
                    <AppText variant="label" color="brand" style={styles.sectionHeaderLabel}>
                      Player Profile
                    </AppText>
                    {selectedUser.player_profile ? (
                      <View style={styles.detailGrid}>
                        <View style={styles.gridRow}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Display Name:</AppText>
                          <AppText variant="body" color="primary" style={styles.gridVal}>
                            {selectedUser.player_profile.display_name || 'None'}
                          </AppText>
                        </View>
                        <View style={styles.gridRow}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>Skill Rating:</AppText>
                          <AppText variant="body" color="primary" style={styles.gridVal}>
                            {selectedUser.player_profile.skill_rating != null
                              ? selectedUser.player_profile.skill_rating.toFixed(2)
                              : 'Unrated'}
                          </AppText>
                        </View>
                      </View>
                    ) : (
                      <AppText variant="caption" color="tertiary">
                        No player rating or profile configured.
                      </AppText>
                    )}
                  </View>

                  {/* Club Staff Roles Section */}
                  <View style={styles.modalSection}>
                    <AppText variant="label" color="brand" style={styles.sectionHeaderLabel}>
                      Club Staff & Management Roles ({selectedUser.club_memberships.length})
                    </AppText>
                    {selectedUser.club_memberships.length === 0 ? (
                      <AppText variant="caption" color="tertiary">
                        This user holds no club staff or administrative roles.
                      </AppText>
                    ) : (
                      <View style={styles.membershipsList}>
                        {selectedUser.club_memberships.map((m) => (
                          <View key={m.id} style={styles.membershipDetailCard}>
                            <View style={styles.membershipCardHeader}>
                              <View>
                                <AppText variant="title" color="primary">{m.club_name}</AppText>
                                <AppText variant="caption" color="secondary">slug: /{m.club_slug}</AppText>
                              </View>
                              <Badge
                                label={m.role_label.toUpperCase()}
                                variant="success"
                                size="sm"
                              />
                            </View>
                            <View style={styles.membershipCardFooter}>
                              <AppText variant="caption" color="secondary">
                                Member Since: {new Date(m.created_at).toLocaleDateString()}
                              </AppText>
                              <Badge
                                label={m.is_active ? 'ACTIVE' : 'INACTIVE'}
                                variant={m.is_active ? 'success' : 'error'}
                                size="sm"
                              />
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Club Player Memberships Section */}
                  <View style={styles.modalSection}>
                    <AppText variant="label" color="brand" style={styles.sectionHeaderLabel}>
                      Club Player Memberships ({selectedUser.club_player_memberships.length})
                    </AppText>
                    {selectedUser.club_player_memberships.length === 0 ? (
                      <AppText variant="caption" color="tertiary">
                        This user holds no club player memberships.
                      </AppText>
                    ) : (
                      <View style={styles.membershipsList}>
                        {selectedUser.club_player_memberships.map((pm) => (
                          <View key={pm.id} style={styles.membershipDetailCard}>
                            <View style={styles.membershipCardHeader}>
                              <View>
                                <AppText variant="title" color="primary">{pm.club_name}</AppText>
                                <AppText variant="caption" color="secondary">
                                  {pm.membership_number ? `Number: ${pm.membership_number} · ` : ''}slug: /{pm.club_slug}
                                </AppText>
                              </View>
                              <Badge
                                label={pm.status_label.toUpperCase()}
                                variant={pm.status === 'active' ? 'success' : 'default'}
                                size="sm"
                              />
                            </View>
                            <View style={styles.membershipCardFooter}>
                              <AppText variant="caption" color="secondary">
                                Joined: {new Date(pm.joined_at).toLocaleDateString()}
                              </AppText>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Platform Boundary Notice */}
                  <View style={styles.boundaryCard}>
                    <ShieldAlert size={16} color="#18794E" />
                    <AppText variant="caption" color="secondary" style={styles.boundaryText}>
                      Club staff roles and player membership statuses are managed within each respective Club Portal by the club owner.
                    </AppText>
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalBottomActions}>
              <Button
                label="Close"
                variant="outline"
                onPress={() => setSelectedUser(null)}
                style={styles.modalCloseButton}
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
  filterScroll: {
    flexGrow: 0,
    marginBottom: 4,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  filterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: '#F0F5F2',
  },
  filterPillActive: {
    backgroundColor: '#18794E',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B635D',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  rolePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: '#EEF3F0',
    borderWidth: 1,
    borderColor: '#D7E5DE',
  },
  rolePillActive: {
    backgroundColor: '#18794E',
    borderColor: '#18794E',
  },
  rolePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B635D',
  },
  rolePillTextActive: {
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
  userCard: {
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
    marginBottom: 8,
  },
  userTitleGroup: {
    flex: 1,
    marginRight: 10,
  },
  userTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  userAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: '#EAF6F0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C3E5D4',
  },
  nameAndEmail: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
  },
  userEmail: {
    fontSize: 12,
    marginTop: 2,
  },
  badgesGroup: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  membershipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 8,
  },
  staffRolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.md,
    backgroundColor: '#EAF6F0',
    borderWidth: 1,
    borderColor: '#C3E5D4',
  },
  staffRolePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#18794E',
  },
  playerRolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.md,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  playerRolePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  noMembershipsText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: '#F0F5F2',
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    alignItems: 'center',
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
  membershipsList: {
    gap: 8,
  },
  membershipDetailCard: {
    backgroundColor: '#F8FAF9',
    borderRadius: Radius.md,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2EBE6',
    gap: 6,
  },
  membershipCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  membershipCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#EFF4F1',
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
});
