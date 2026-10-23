/**
 * Pickleball Multi-Club Platform — Platform Admin Users Directory
 *
 * Pixel-accurate visual implementation matching mobile reference design:
 * - Top header with official Pickleball product logo, "Platform Admin" label, notification bell & avatar
 * - Page heading "Users" and subtitle "Manage all platform accounts and their access"
 * - 3 Summary KPI cards: Total Accounts (green), Active Accounts (blue), Club Staff Members (purple)
 * - Pill-style filters: All Accounts (with badge), Active (with badge), Inactive (with badge), All Roles, Club Staff, Players
 * - Search bar with right-aligned filter button
 * - User account cards with avatar initials, name, email, italic club memberships, status & verified badges,
 *   joined date, and solid green "Inspect Account" action button
 * - Comprehensive cross-club staff roles & player memberships inspection modal
 * - Zero content overlap behind fixed bottom navigation
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
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
  Building2,
  Calendar,
  CheckCircle2,
  Eye,
  Search,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  User,
  Users,
  X,
} from 'lucide-react-native';

import {
  AppText,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PlatformButton,
  PlatformShell,
} from '@/components';
import {
  PlatformUserItem,
  platformApplicationsApi,
} from '@/services/api/clubApplications';
import { Radius, Spacing } from '@/theme';

type StatusFilter = 'all' | 'active' | 'inactive';
type RoleFilter = 'all' | 'staff' | 'player';

function formatJoinedDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function getAvatarInitial(name?: string | null, email?: string): string {
  if (name && name.trim()) {
    return name.trim().charAt(0).toUpperCase();
  }
  if (email && email.trim()) {
    return email.trim().charAt(0).toUpperCase();
  }
  return 'U';
}

function getAvatarTheme(seed: string): { bg: string; text: string } {
  const themes = [
    { bg: '#E6F4EA', text: '#15803D' }, // Green
    { bg: '#E0F2FE', text: '#0284C7' }, // Blue
    { bg: '#F3E8FF', text: '#9333EA' }, // Purple
    { bg: '#FEF3C7', text: '#D97706' }, // Amber
    { bg: '#FEE2E2', text: '#DC2626' }, // Rose
    { bg: '#EDE9FE', text: '#7C3AED' }, // Violet
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % themes.length;
  return themes[index];
}

export default function PlatformUsersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [allUsers, setAllUsers] = useState<PlatformUserItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Overall platform counts for telemetry cards
  const [platformMetrics, setPlatformMetrics] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    staff: 0,
  });

  // User detail inspection modal
  const [selectedUser, setSelectedUser] = useState<PlatformUserItem | null>(null);

  const fetchUsers = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      // Fetch platform users
      const res = await platformApplicationsApi.listUsers({
        page: 1,
        pageSize: 100,
      });

      const items = res.items || [];
      setAllUsers(items);
      setTotalCount(res.total || items.length);

      const active = items.filter((u) => u.is_active).length;
      const inactive = items.filter((u) => !u.is_active).length;
      const staff = items.filter((u) => u.club_memberships && u.club_memberships.length > 0).length;

      setPlatformMetrics({
        total: res.total || items.length,
        active,
        inactive,
        staff,
      });
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to fetch platform users';
      setError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Client-side filtering for fast instant responsiveness matching pills and search
  const filteredUsers = useMemo(() => {
    let result = [...allUsers];

    // Status filter
    if (statusFilter === 'active') {
      result = result.filter((u) => u.is_active);
    } else if (statusFilter === 'inactive') {
      result = result.filter((u) => !u.is_active);
    }

    // Role filter
    if (roleFilter === 'staff') {
      result = result.filter((u) => u.club_memberships && u.club_memberships.length > 0);
    } else if (roleFilter === 'player') {
      result = result.filter(
        (u) =>
          u.club_player_memberships &&
          u.club_player_memberships.length > 0 &&
          (!u.club_memberships || u.club_memberships.length === 0)
      );
    }

    // Search query
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (u) =>
          (u.full_name && u.full_name.toLowerCase().includes(q)) ||
          (u.email && u.email.toLowerCase().includes(q)) ||
          (u.id && u.id.toLowerCase().includes(q))
      );
    }

    return result;
  }, [allUsers, statusFilter, roleFilter, searchQuery]);

  const isAllAccountsActive = statusFilter === 'all' && roleFilter === 'all';
  const isActiveFilterActive = statusFilter === 'active';
  const isInactiveFilterActive = statusFilter === 'inactive';

  return (
    <PlatformShell
      activeTab="users"
      onRefresh={() => fetchUsers(true)}
      isRefreshing={isRefreshing}
      scrollable={false}
    >
      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchUsers(true)}
            tintColor="#15803D"
          />
        }
        ListHeaderComponent={
          <View>
            {/* 1. Page Heading */}
            <View style={styles.headerSection}>
              <AppText style={styles.screenTitle}>Users</AppText>
              <AppText style={styles.screenSubtitle}>
                Manage all platform accounts and their access
              </AppText>
            </View>

            {/* 2. Account Summary Cards */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.summaryCardsRow}
            >
              {/* Total Accounts */}
              <View style={styles.summaryCard}>
                <View style={[styles.summaryIconBox, { backgroundColor: '#E6F4EA' }]}>
                  <Users size={20} color="#16A34A" />
                </View>
                <View style={styles.summaryTextBox}>
                  <AppText style={styles.summaryLabel}>Total Accounts</AppText>
                  <AppText style={styles.summaryValue}>{platformMetrics.total}</AppText>
                </View>
              </View>

              {/* Active Accounts */}
              <View style={styles.summaryCard}>
                <View style={[styles.summaryIconBox, { backgroundColor: '#E0F2FE' }]}>
                  <User size={20} color="#0284C7" />
                </View>
                <View style={styles.summaryTextBox}>
                  <AppText style={styles.summaryLabel}>Active Accounts</AppText>
                  <AppText style={styles.summaryValue}>{platformMetrics.active}</AppText>
                </View>
              </View>

              {/* Club Staff Members */}
              <View style={styles.summaryCard}>
                <View style={[styles.summaryIconBox, { backgroundColor: '#F3E8FF' }]}>
                  <Users size={20} color="#9333EA" />
                </View>
                <View style={styles.summaryTextBox}>
                  <AppText style={styles.summaryLabel}>Club Staff Members</AppText>
                  <AppText style={styles.summaryValue}>{platformMetrics.staff}</AppText>
                </View>
              </View>
            </ScrollView>

            {/* 3. Filter Pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterPillsRow}
            >
              {/* All Accounts */}
              <TouchableOpacity
                style={[styles.pill, isAllAccountsActive && styles.pillActive]}
                onPress={() => {
                  setStatusFilter('all');
                  setRoleFilter('all');
                }}
                activeOpacity={0.7}
              >
                <AppText style={[styles.pillText, isAllAccountsActive && styles.pillTextActive]}>
                  All Accounts
                </AppText>
                <View
                  style={[
                    styles.pillBadge,
                    isAllAccountsActive ? styles.pillBadgeActive : styles.pillBadgeInactive,
                  ]}
                >
                  <AppText
                    style={[
                      styles.pillBadgeText,
                      isAllAccountsActive ? styles.pillBadgeTextActive : styles.pillBadgeTextInactive,
                    ]}
                  >
                    {platformMetrics.total}
                  </AppText>
                </View>
              </TouchableOpacity>

              {/* Active */}
              <TouchableOpacity
                style={[styles.pill, isActiveFilterActive && styles.pillActive]}
                onPress={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')}
                activeOpacity={0.7}
              >
                <AppText style={[styles.pillText, isActiveFilterActive && styles.pillTextActive]}>
                  Active
                </AppText>
                <View
                  style={[
                    styles.pillBadge,
                    isActiveFilterActive ? styles.pillBadgeActive : styles.pillBadgeInactive,
                  ]}
                >
                  <AppText
                    style={[
                      styles.pillBadgeText,
                      isActiveFilterActive ? styles.pillBadgeTextActive : styles.pillBadgeTextInactive,
                    ]}
                  >
                    {platformMetrics.active}
                  </AppText>
                </View>
              </TouchableOpacity>

              {/* Inactive */}
              <TouchableOpacity
                style={[styles.pill, isInactiveFilterActive && styles.pillActive]}
                onPress={() => setStatusFilter(statusFilter === 'inactive' ? 'all' : 'inactive')}
                activeOpacity={0.7}
              >
                <AppText style={[styles.pillText, isInactiveFilterActive && styles.pillTextActive]}>
                  Inactive
                </AppText>
                <View
                  style={[
                    styles.pillBadge,
                    isInactiveFilterActive ? styles.pillBadgeActive : styles.pillBadgeInactive,
                  ]}
                >
                  <AppText
                    style={[
                      styles.pillBadgeText,
                      isInactiveFilterActive ? styles.pillBadgeTextActive : styles.pillBadgeTextInactive,
                    ]}
                  >
                    {platformMetrics.inactive}
                  </AppText>
                </View>
              </TouchableOpacity>

              {/* All Roles */}
              <TouchableOpacity
                style={[styles.pill, roleFilter === 'all' && statusFilter !== 'all' && styles.pillActive]}
                onPress={() => setRoleFilter('all')}
                activeOpacity={0.7}
              >
                <AppText
                  style={[
                    styles.pillText,
                    roleFilter === 'all' && statusFilter !== 'all' && styles.pillTextActive,
                  ]}
                >
                  All Roles
                </AppText>
              </TouchableOpacity>

              {/* Club Staff */}
              <TouchableOpacity
                style={[styles.pill, roleFilter === 'staff' && styles.pillActive]}
                onPress={() => setRoleFilter(roleFilter === 'staff' ? 'all' : 'staff')}
                activeOpacity={0.7}
              >
                <AppText style={[styles.pillText, roleFilter === 'staff' && styles.pillTextActive]}>
                  Club Staff
                </AppText>
              </TouchableOpacity>

              {/* Players */}
              <TouchableOpacity
                style={[styles.pill, roleFilter === 'player' && styles.pillActive]}
                onPress={() => setRoleFilter(roleFilter === 'player' ? 'all' : 'player')}
                activeOpacity={0.7}
              >
                <AppText style={[styles.pillText, roleFilter === 'player' && styles.pillTextActive]}>
                  Players
                </AppText>
              </TouchableOpacity>
            </ScrollView>

            {/* 4. Search Field & Filter Button */}
            <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                <Search size={16} color="#94A3B8" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by full name, email, or user UUID..."
                  placeholderTextColor="#94A3B8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearchQuery('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <X size={16} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={styles.filterIconButton}
                onPress={() => {
                  setStatusFilter('all');
                  setRoleFilter('all');
                  setSearchQuery('');
                }}
                activeOpacity={0.7}
                accessibilityLabel="Reset filters"
              >
                <SlidersHorizontal size={18} color="#475569" />
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <LoadingState message="Loading platform users directory..." />
          ) : error ? (
            <ErrorState message={error} onRetry={() => fetchUsers(true)} />
          ) : (
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
          )
        }
        renderItem={({ item }) => {
          const displayName = item.full_name || 'Unnamed User';
          const initial = getAvatarInitial(displayName, item.email);
          const avatarTheme = getAvatarTheme(displayName + item.email);

          const totalMemberships =
            item.total_memberships_count !== undefined
              ? item.total_memberships_count
              : (item.club_memberships?.length || 0) + (item.club_player_memberships?.length || 0);

          const membershipsSummary =
            totalMemberships === 0
              ? 'No active club memberships'
              : totalMemberships === 1
              ? '1 club membership'
              : `${totalMemberships} club memberships`;

          return (
            <Card style={styles.userCard}>
              {/* Top Section */}
              <View style={styles.cardTopRow}>
                {/* Left: Avatar Circle */}
                <View style={[styles.avatarCircle, { backgroundColor: avatarTheme.bg }]}>
                  <AppText style={[styles.avatarInitial, { color: avatarTheme.text }]}>
                    {initial}
                  </AppText>
                </View>

                {/* Middle: User Info */}
                <View style={styles.userInfoCol}>
                  <AppText style={styles.userName} numberOfLines={1}>
                    {displayName}
                  </AppText>
                  <AppText style={styles.userEmail} numberOfLines={1}>
                    {item.email}
                  </AppText>
                  <View style={styles.metaRow}>
                    <Users size={13} color="#64748B" />
                    <AppText style={styles.metaTextItalic} numberOfLines={1}>
                      {membershipsSummary}
                    </AppText>
                  </View>
                </View>

                {/* Right: Badges */}
                <View style={styles.badgesGroup}>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: item.is_active ? '#E6F4EA' : '#FEE2E2' },
                    ]}
                  >
                    <AppText
                      style={[
                        styles.statusBadgeText,
                        { color: item.is_active ? '#15803D' : '#DC2626' },
                      ]}
                    >
                      {item.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </AppText>
                  </View>

                  {item.is_verified && (
                    <View style={styles.verifiedBadge}>
                      <AppText style={styles.verifiedBadgeText}>VERIFIED</AppText>
                    </View>
                  )}
                </View>
              </View>

              {/* Subtle Horizontal Divider */}
              <View style={styles.cardDivider} />

              {/* Bottom Action Row */}
              <View style={styles.cardBottomRow}>
                <View style={styles.joinedDateRow}>
                  <Calendar size={13} color="#64748B" />
                  <AppText style={styles.joinedDateText}>
                    Joined {formatJoinedDate(item.created_at)}
                  </AppText>
                </View>

                <PlatformButton
                  size="sm"
                  label="Inspect Account"
                  leftIcon={<Eye size={14} color="#FFFFFF" strokeWidth={2.2} />}
                  onPress={() => setSelectedUser(item)}
                  accessibilityLabel={`Inspect account for ${displayName}`}
                />
              </View>
            </Card>
          );
        }}
      />

      {/* ─── User Detail Inspection Modal ────────────────────────────────────── */}
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
                accessibilityLabel="Close dialog"
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
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>
                          Email Address:
                        </AppText>
                        <AppText variant="body" color="primary" style={styles.gridVal}>
                          {selectedUser.email}
                        </AppText>
                      </View>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>
                          Full Name:
                        </AppText>
                        <AppText variant="body" color="primary" style={styles.gridVal}>
                          {selectedUser.full_name || 'Not provided'}
                        </AppText>
                      </View>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>
                          Account Status:
                        </AppText>
                        <Badge
                          label={selectedUser.is_active ? 'ACTIVE' : 'INACTIVE'}
                          variant={selectedUser.is_active ? 'success' : 'error'}
                          size="sm"
                        />
                      </View>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>
                          Email Verified:
                        </AppText>
                        <Badge
                          label={selectedUser.is_verified ? 'VERIFIED' : 'UNVERIFIED'}
                          variant={selectedUser.is_verified ? 'success' : 'default'}
                          size="sm"
                        />
                      </View>
                      <View style={styles.gridRow}>
                        <AppText variant="caption" color="secondary" style={styles.gridKey}>
                          Registration Date:
                        </AppText>
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
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>
                            Display Name:
                          </AppText>
                          <AppText variant="body" color="primary" style={styles.gridVal}>
                            {selectedUser.player_profile.display_name || 'None'}
                          </AppText>
                        </View>
                        <View style={styles.gridRow}>
                          <AppText variant="caption" color="secondary" style={styles.gridKey}>
                            Skill Rating:
                          </AppText>
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
                                <AppText variant="title" color="primary">
                                  {m.club_name}
                                </AppText>
                                <AppText variant="caption" color="secondary">
                                  slug: /{m.club_slug}
                                </AppText>
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
                                <AppText variant="title" color="primary">
                                  {pm.club_name}
                                </AppText>
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
                    <ShieldAlert size={16} color="#15803D" />
                    <AppText variant="caption" color="secondary" style={styles.boundaryText}>
                      Club staff roles and player membership statuses are managed within each respective Club Portal by the club owner.
                    </AppText>
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalBottomActions}>
              <PlatformButton
                size="md"
                variant="outline"
                label="Close"
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
  listContent: {
    paddingBottom: 36,
  },

  // ─── Header Section ────────────────────────────────────────────────────────
  headerSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  screenSubtitle: {
    fontSize: 13.5,
    color: '#64748B',
    marginTop: 4,
  },

  // ─── Account Summary Cards ─────────────────────────────────────────────────
  summaryCardsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
    paddingBottom: 16,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 144,
    gap: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  summaryIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTextBox: {
    justifyContent: 'center',
  },
  summaryLabel: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },

  // ─── Filter Pills ──────────────────────────────────────────────────────────
  filterPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 14,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
  },
  pillActive: {
    backgroundColor: '#15803D',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  pillBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBadgeActive: {
    backgroundColor: '#166534',
  },
  pillBadgeInactive: {
    backgroundColor: '#E2E8F0',
  },
  pillBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  pillBadgeTextActive: {
    color: '#FFFFFF',
  },
  pillBadgeTextInactive: {
    color: '#475569',
  },

  // ─── Search Field & Filter Button ──────────────────────────────────────────
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    height: 44,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    height: '100%',
  },
  filterIconButton: {
    width: 44,
    height: 44,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── User Account Cards ────────────────────────────────────────────────────
  userCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 16,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: '700',
  },
  userInfoCol: {
    flex: 1,
    gap: 3,
  },
  userName: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  userEmail: {
    fontSize: 13,
    color: '#64748B',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  metaTextItalic: {
    fontSize: 12.5,
    color: '#64748B',
    fontStyle: 'italic',
  },
  badgesGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  verifiedBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  verifiedBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.3,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  joinedDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  joinedDateText: {
    fontSize: 12.5,
    color: '#64748B',
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EBE6',
    padding: Spacing.lg,
    marginHorizontal: 16,
  },

  // ─── Modal Styles ──────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 600,
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#EAF6F0',
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
    paddingBottom: Spacing.xl,
  },
  modalSection: {
    gap: 8,
  },
  sectionHeaderLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  detailGrid: {
    gap: 8,
    backgroundColor: '#F8FAF9',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#EAF6F0',
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  gridKey: {
    fontSize: 12,
    fontWeight: '600',
  },
  gridVal: {
    fontSize: 13,
  },
  membershipsList: {
    gap: 8,
  },
  membershipDetailCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EBE6',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    gap: 6,
  },
  membershipCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  membershipCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F0F7F3',
    paddingTop: 4,
  },
  boundaryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FAFDFB',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#EAF6F0',
  },
  boundaryText: {
    flex: 1,
    lineHeight: 18,
  },
  modalBottomActions: {
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#E2EBE6',
    backgroundColor: '#FAFDFB',
    alignItems: 'flex-end',
  },
  modalCloseButton: {
    minWidth: 100,
  },
});
