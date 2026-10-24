/**
 * Pickleball Multi-Club Platform — Platform Admin Users Directory
 *
 * Responsive, spacious mobile-first implementation matching visual reference and
 * standard Platform Admin layout conventions (Clubs, Support Tickets, Overview):
 * - Consistent content width: uses phone's full width with standard 16px gutters (no double margins)
 * - Page heading "Users" and subtitle "Manage all platform accounts and their access"
 * - 2 Summary KPI cards: Total Accounts (green), Active Accounts (blue) in responsive 2-col row
 * - Horizontally scrollable status filter tabs: All Accounts, Active, Inactive
 * - Search bar with placeholder "Search by full name, email, or user ID" + filter button
 * - User account cards:
 *   - Responsive layout: on narrow phones (< 380px), reflows into a vertical hierarchy
 *     so names and emails use full card width with zero truncation or ellipses; on wider
 *     screens (>= 380px), aligns badges and menu to the right
 *   - Avatar initials with soft pastel background
 *   - Complete email address with overflow-wrap: anywhere
 *   - Club association with Users icon
 *   - Status badge (ACTIVE/INACTIVE) and VERIFIED badge
 *   - 3-dots overflow action menu
 *   - Subtle divider line
 *   - Footer with "Joined DD/MM/YYYY" date and solid green "Inspect Account" action
 * - User detail inspection modal preserving all cross-club memberships and player profiles
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
  Check,
  CheckCircle2,
  Copy,
  Eye,
  MoreVertical,
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
type VerificationFilter = 'all' | 'verified' | 'unverified';

function formatJoinedDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
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
    { bg: '#EDE9FE', text: '#7C3AED' }, // Lavender / Violet
    { bg: '#FEF3C7', text: '#D97706' }, // Amber / Yellow
    { bg: '#E0F2FE', text: '#0284C7' }, // Soft Sky Blue
    { bg: '#FEE2E2', text: '#DC2626' }, // Rose / Pink
    { bg: '#E6F4EA', text: '#15803D' }, // Soft Green
    { bg: '#F3E8FF', text: '#9333EA' }, // Soft Purple
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % themes.length;
  return themes[index];
}

function getClubAssociationText(user: PlatformUserItem): string {
  if (user.club_memberships && user.club_memberships.length > 0) {
    const primary = user.club_memberships[0].club_name;
    const totalExtra =
      user.club_memberships.length + (user.club_player_memberships?.length || 0) - 1;
    return totalExtra > 0 ? `${primary} (+${totalExtra})` : primary;
  }
  if (user.club_player_memberships && user.club_player_memberships.length > 0) {
    const primary = user.club_player_memberships[0].club_name;
    const totalExtra = user.club_player_memberships.length - 1;
    return totalExtra > 0 ? `${primary} (+${totalExtra})` : primary;
  }
  return 'No active clubs';
}

export default function PlatformUsersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [allUsers, setAllUsers] = useState<PlatformUserItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>('all');
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

  // 3-dots action menu modal
  const [menuUser, setMenuUser] = useState<PlatformUserItem | null>(null);
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);

  // Advanced filter bottom modal
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  const fetchUsers = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const [res, resActive] = await Promise.all([
        platformApplicationsApi.listUsers({
          page: 1,
          pageSize: 100,
        }),
        platformApplicationsApi.listUsers({
          page: 1,
          pageSize: 1,
          isActive: true,
        }).catch(() => null),
      ]);

      const items = res.items || [];
      const total = res.total ?? items.length;
      const active = resActive?.total ?? items.filter((u) => u.is_active).length;
      const inactive = Math.max(0, total - active);
      const staff = items.filter((u) => u.club_memberships && u.club_memberships.length > 0).length;

      setAllUsers(items);
      setTotalCount(total);
      setPlatformMetrics({
        total,
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

  // Client-side filtering matching status tabs, search, and filter options
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

    // Verification filter
    if (verificationFilter === 'verified') {
      result = result.filter((u) => u.is_verified);
    } else if (verificationFilter === 'unverified') {
      result = result.filter((u) => !u.is_verified);
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
  }, [allUsers, statusFilter, roleFilter, verificationFilter, searchQuery]);

  const copyToClipboard = (text: string, label: string) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    setCopiedNotice(`Copied ${label}`);
    setTimeout(() => setCopiedNotice(null), 2500);
  };

  // Responsive breakpoints
  // Narrow phones (< 380px): reflow card elements vertically so name & email have full card width
  const isNarrowPhone = width < 380;
  const isSuperNarrow = width < 340;
  const hasActiveAdvancedFilters = roleFilter !== 'all' || verificationFilter !== 'all';

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
          <View style={styles.headerContainer}>
            {/* 1. Page Heading */}
            <View style={styles.headerSection}>
              <AppText style={styles.screenTitle}>Users</AppText>
              <AppText style={styles.screenSubtitle}>
                Manage all platform accounts and their access
              </AppText>
            </View>

            {/* 2. Account Summary Cards (2-column responsive row) */}
            <View style={styles.summaryCardsRow}>
              {/* Total Accounts */}
              <View style={styles.summaryCard}>
                <View style={[styles.summaryIconBox, { backgroundColor: '#E6F4EA' }]}>
                  <Users size={20} color="#16A34A" strokeWidth={2.2} />
                </View>
                <View style={styles.summaryTextBox}>
                  <AppText style={styles.summaryLabel} numberOfLines={1}>
                    Total Accounts
                  </AppText>
                  <AppText style={styles.summaryValue}>{platformMetrics.total}</AppText>
                </View>
              </View>

              {/* Active Accounts */}
              <View style={styles.summaryCard}>
                <View style={[styles.summaryIconBox, { backgroundColor: '#E0F2FE' }]}>
                  <User size={20} color="#0284C7" strokeWidth={2.2} />
                </View>
                <View style={styles.summaryTextBox}>
                  <AppText style={styles.summaryLabel} numberOfLines={1}>
                    Active Accounts
                  </AppText>
                  <AppText style={styles.summaryValue}>{platformMetrics.active}</AppText>
                </View>
              </View>
            </View>

            {/* 3. Filter Tabs (Horizontally scrollable if screen is narrow) */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabsScroll}
              contentContainerStyle={styles.filterTabsRow}
            >
              {/* All Accounts */}
              <TouchableOpacity
                style={[
                  styles.filterTab,
                  statusFilter === 'all' ? styles.filterTabActive : styles.filterTabInactive,
                ]}
                onPress={() => setStatusFilter('all')}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected: statusFilter === 'all' }}
              >
                <AppText
                  style={[
                    styles.filterTabText,
                    statusFilter === 'all'
                      ? styles.filterTabTextActive
                      : styles.filterTabTextInactive,
                  ]}
                >
                  All Accounts
                </AppText>
                <View
                  style={[
                    styles.filterTabBadge,
                    statusFilter === 'all'
                      ? styles.filterTabBadgeActive
                      : styles.filterTabBadgeInactive,
                  ]}
                >
                  <AppText
                    style={[
                      styles.filterTabBadgeText,
                      statusFilter === 'all'
                        ? styles.filterTabBadgeTextActive
                        : styles.filterTabBadgeTextInactive,
                    ]}
                  >
                    {platformMetrics.total}
                  </AppText>
                </View>
              </TouchableOpacity>

              {/* Active */}
              <TouchableOpacity
                style={[
                  styles.filterTab,
                  statusFilter === 'active' ? styles.filterTabActive : styles.filterTabInactive,
                ]}
                onPress={() => setStatusFilter('active')}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected: statusFilter === 'active' }}
              >
                <AppText
                  style={[
                    styles.filterTabText,
                    statusFilter === 'active'
                      ? styles.filterTabTextActive
                      : styles.filterTabTextInactive,
                  ]}
                >
                  Active
                </AppText>
                <View
                  style={[
                    styles.filterTabBadge,
                    statusFilter === 'active'
                      ? styles.filterTabBadgeActive
                      : styles.filterTabBadgeInactive,
                  ]}
                >
                  <AppText
                    style={[
                      styles.filterTabBadgeText,
                      statusFilter === 'active'
                        ? styles.filterTabBadgeTextActive
                        : styles.filterTabBadgeTextInactive,
                    ]}
                  >
                    {platformMetrics.active}
                  </AppText>
                </View>
              </TouchableOpacity>

              {/* Inactive */}
              <TouchableOpacity
                style={[
                  styles.filterTab,
                  statusFilter === 'inactive' ? styles.filterTabActive : styles.filterTabInactive,
                ]}
                onPress={() => setStatusFilter('inactive')}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected: statusFilter === 'inactive' }}
              >
                <AppText
                  style={[
                    styles.filterTabText,
                    statusFilter === 'inactive'
                      ? styles.filterTabTextActive
                      : styles.filterTabTextInactive,
                  ]}
                >
                  Inactive
                </AppText>
                <View
                  style={[
                    styles.filterTabBadge,
                    statusFilter === 'inactive'
                      ? styles.filterTabBadgeActive
                      : styles.filterTabBadgeInactive,
                  ]}
                >
                  <AppText
                    style={[
                      styles.filterTabBadgeText,
                      statusFilter === 'inactive'
                        ? styles.filterTabBadgeTextActive
                        : styles.filterTabBadgeTextInactive,
                    ]}
                  >
                    {platformMetrics.inactive}
                  </AppText>
                </View>
              </TouchableOpacity>
            </ScrollView>

            {/* 4. Search Field & Filter Button */}
            <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                <Search size={18} color="#94A3B8" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by full name, email, or user ID"
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
                    accessibilityLabel="Clear search input"
                  >
                    <X size={16} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[
                  styles.filterIconButton,
                  hasActiveAdvancedFilters && styles.filterIconButtonHighlighted,
                ]}
                onPress={() => setIsFilterModalOpen(true)}
                activeOpacity={0.7}
                accessibilityLabel="Filter accounts by role and verification status"
              >
                <SlidersHorizontal
                  size={18}
                  color={hasActiveAdvancedFilters ? '#15803D' : '#475569'}
                />
                {hasActiveAdvancedFilters && <View style={styles.filterActiveDot} />}
              </TouchableOpacity>
            </View>

            {/* Active filters notice */}
            {hasActiveAdvancedFilters && (
              <View style={styles.activeFilterNotice}>
                <AppText style={styles.activeFilterNoticeText}>
                  Filters active:{' '}
                  {roleFilter !== 'all' ? `Role: ${roleFilter}` : ''}
                  {roleFilter !== 'all' && verificationFilter !== 'all' ? ' · ' : ''}
                  {verificationFilter !== 'all' ? `Status: ${verificationFilter}` : ''}
                </AppText>
                <TouchableOpacity
                  onPress={() => {
                    setRoleFilter('all');
                    setVerificationFilter('all');
                  }}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <AppText style={styles.clearFilterText}>Reset</AppText>
                </TouchableOpacity>
              </View>
            )}
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
          const clubAssociation = getClubAssociationText(item);

          return (
            <Card style={styles.userCard}>
              {/* ─── CARD LAYOUT: NARROW PHONES (< 380px) ─────────────────── */}
              {isNarrowPhone ? (
                <View style={styles.narrowCardWrapper}>
                  {/* Top row: Avatar, Name, and 3-dots Menu */}
                  <View style={styles.narrowTopRow}>
                    <View style={[styles.avatarCircle, { backgroundColor: avatarTheme.bg }]}>
                      <AppText style={[styles.avatarInitial, { color: avatarTheme.text }]}>
                        {initial}
                      </AppText>
                    </View>

                    <View style={styles.narrowNameCol}>
                      <AppText style={styles.userName}>
                        {displayName}
                      </AppText>
                    </View>

                    <TouchableOpacity
                      style={styles.moreButton}
                      onPress={() => setMenuUser(item)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel={`Account options for ${displayName}`}
                    >
                      <MoreVertical size={18} color="#64748B" />
                    </TouchableOpacity>
                  </View>

                  {/* Full-width Email below Avatar/Name */}
                  <AppText style={styles.userEmailNarrow}>
                    {item.email}
                  </AppText>

                  {/* Club info */}
                  <View style={styles.metaRow}>
                    <Users size={14} color="#64748B" style={styles.metaIcon} />
                    <AppText style={styles.metaTextItalic}>
                      {clubAssociation}
                    </AppText>
                  </View>

                  {/* Badges on their own row */}
                  <View style={styles.narrowBadgesRow}>
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
              ) : (
                /* ─── CARD LAYOUT: WIDER PHONES & DESKTOP (>= 380px) ────────── */
                <View style={styles.cardTopRow}>
                  {/* Left: Avatar Circle */}
                  <View style={[styles.avatarCircle, { backgroundColor: avatarTheme.bg }]}>
                    <AppText style={[styles.avatarInitial, { color: avatarTheme.text }]}>
                      {initial}
                    </AppText>
                  </View>

                  {/* Middle: User Info (Zero truncation, natural wrapping) */}
                  <View style={styles.userInfoCol}>
                    <AppText style={styles.userName}>
                      {displayName}
                    </AppText>
                    <AppText style={styles.userEmail}>
                      {item.email}
                    </AppText>
                    <View style={styles.metaRow}>
                      <Users size={14} color="#64748B" style={styles.metaIcon} />
                      <AppText style={styles.metaTextItalic}>
                        {clubAssociation}
                      </AppText>
                    </View>
                  </View>

                  {/* Right: Badges & 3-Dots Menu */}
                  <View style={styles.rightActionGroup}>
                    <View style={styles.badgesStack}>
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

                    <TouchableOpacity
                      style={styles.moreButton}
                      onPress={() => setMenuUser(item)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel={`Account options for ${displayName}`}
                    >
                      <MoreVertical size={18} color="#64748B" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Subtle Horizontal Divider */}
              <View style={styles.cardDivider} />

              {/* Bottom Action Row */}
              <View
                style={[
                  styles.cardBottomRow,
                  isSuperNarrow && styles.cardBottomRowStacked,
                ]}
              >
                <View style={styles.joinedDateRow}>
                  <Calendar size={14} color="#64748B" />
                  <AppText style={styles.joinedDateText}>
                    Joined {formatJoinedDate(item.created_at)}
                  </AppText>
                </View>

                <TouchableOpacity
                  style={[
                    styles.inspectBtn,
                    isSuperNarrow && styles.inspectBtnFullWidth,
                  ]}
                  onPress={() => setSelectedUser(item)}
                  activeOpacity={0.8}
                  accessibilityLabel={`Inspect account for ${displayName}`}
                  accessibilityRole="button"
                >
                  <Eye size={15} color="#FFFFFF" strokeWidth={2.2} />
                  <AppText style={styles.inspectBtnText}>Inspect Account</AppText>
                </TouchableOpacity>
              </View>
            </Card>
          );
        }}
      />

      {/* ─── 3-Dots Quick Actions Bottom Sheet ──────────────────────────────── */}
      <Modal
        visible={!!menuUser}
        animationType="fade"
        transparent
        onRequestClose={() => setMenuUser(null)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setMenuUser(null)}
        >
          <View style={styles.sheetContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderTitleGroup}>
                <AppText style={styles.sheetTitle} numberOfLines={1}>
                  {menuUser?.full_name || 'Account Actions'}
                </AppText>
                <AppText style={styles.sheetSubtitle} numberOfLines={1}>
                  {menuUser?.email}
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => setMenuUser(null)}
                style={styles.sheetCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.sheetBody}>
              {/* Option 1: Inspect Details */}
              <TouchableOpacity
                style={styles.sheetActionItem}
                onPress={() => {
                  const target = menuUser;
                  setMenuUser(null);
                  if (target) setSelectedUser(target);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.sheetActionIcon, { backgroundColor: '#E6F4EA' }]}>
                  <Eye size={18} color="#15803D" />
                </View>
                <View style={styles.sheetActionTextCol}>
                  <AppText style={styles.sheetActionLabel}>Inspect Full Account</AppText>
                  <AppText style={styles.sheetActionDesc}>
                    View profile, club roles, ratings, and telemetry
                  </AppText>
                </View>
              </TouchableOpacity>

              {/* Option 2: Copy Email */}
              <TouchableOpacity
                style={styles.sheetActionItem}
                onPress={() => {
                  if (menuUser) {
                    copyToClipboard(menuUser.email, 'email address');
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.sheetActionIcon, { backgroundColor: '#E0F2FE' }]}>
                  <Copy size={18} color="#0284C7" />
                </View>
                <View style={styles.sheetActionTextCol}>
                  <AppText style={styles.sheetActionLabel}>Copy Email Address</AppText>
                  <AppText style={styles.sheetActionDesc}>{menuUser?.email}</AppText>
                </View>
              </TouchableOpacity>

              {/* Option 3: Copy User ID */}
              <TouchableOpacity
                style={styles.sheetActionItem}
                onPress={() => {
                  if (menuUser) {
                    copyToClipboard(menuUser.id, 'User UUID');
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.sheetActionIcon, { backgroundColor: '#F1F5F9' }]}>
                  <Shield size={18} color="#475569" />
                </View>
                <View style={styles.sheetActionTextCol}>
                  <AppText style={styles.sheetActionLabel}>Copy User UUID</AppText>
                  <AppText style={styles.sheetActionDesc}>{menuUser?.id}</AppText>
                </View>
              </TouchableOpacity>

              {copiedNotice && (
                <View style={styles.copiedToast}>
                  <Check size={14} color="#15803D" />
                  <AppText style={styles.copiedToastText}>{copiedNotice}</AppText>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.sheetCancelBtn}
              onPress={() => setMenuUser(null)}
              activeOpacity={0.8}
            >
              <AppText style={styles.sheetCancelText}>Cancel</AppText>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ─── Advanced Filter Modal ───────────────────────────────────────────── */}
      <Modal
        visible={isFilterModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsFilterModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setIsFilterModalOpen(false)}
        >
          <View style={styles.sheetContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderTitleGroup}>
                <AppText style={styles.sheetTitle}>Filter Accounts</AppText>
                <AppText style={styles.sheetSubtitle}>
                  Refine platform user list by role & verification
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => setIsFilterModalOpen(false)}
                style={styles.sheetCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalFilterBody}>
              {/* Role Filter */}
              <AppText style={styles.filterGroupTitle}>Account Role</AppText>
              <View style={styles.filterPillGroup}>
                <TouchableOpacity
                  style={[
                    styles.modalFilterPill,
                    roleFilter === 'all' && styles.modalFilterPillActive,
                  ]}
                  onPress={() => setRoleFilter('all')}
                >
                  <AppText
                    style={[
                      styles.modalFilterPillText,
                      roleFilter === 'all' && styles.modalFilterPillTextActive,
                    ]}
                  >
                    All Roles
                  </AppText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalFilterPill,
                    roleFilter === 'staff' && styles.modalFilterPillActive,
                  ]}
                  onPress={() => setRoleFilter('staff')}
                >
                  <AppText
                    style={[
                      styles.modalFilterPillText,
                      roleFilter === 'staff' && styles.modalFilterPillTextActive,
                    ]}
                  >
                    Club Staff ({platformMetrics.staff})
                  </AppText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalFilterPill,
                    roleFilter === 'player' && styles.modalFilterPillActive,
                  ]}
                  onPress={() => setRoleFilter('player')}
                >
                  <AppText
                    style={[
                      styles.modalFilterPillText,
                      roleFilter === 'player' && styles.modalFilterPillTextActive,
                    ]}
                  >
                    Players
                  </AppText>
                </TouchableOpacity>
              </View>

              {/* Verification Filter */}
              <AppText style={[styles.filterGroupTitle, { marginTop: 14 }]}>
                Email Verification
              </AppText>
              <View style={styles.filterPillGroup}>
                <TouchableOpacity
                  style={[
                    styles.modalFilterPill,
                    verificationFilter === 'all' && styles.modalFilterPillActive,
                  ]}
                  onPress={() => setVerificationFilter('all')}
                >
                  <AppText
                    style={[
                      styles.modalFilterPillText,
                      verificationFilter === 'all' && styles.modalFilterPillTextActive,
                    ]}
                  >
                    All Accounts
                  </AppText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalFilterPill,
                    verificationFilter === 'verified' && styles.modalFilterPillActive,
                  ]}
                  onPress={() => setVerificationFilter('verified')}
                >
                  <AppText
                    style={[
                      styles.modalFilterPillText,
                      verificationFilter === 'verified' && styles.modalFilterPillTextActive,
                    ]}
                  >
                    Verified Only
                  </AppText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalFilterPill,
                    verificationFilter === 'unverified' && styles.modalFilterPillActive,
                  ]}
                  onPress={() => setVerificationFilter('unverified')}
                >
                  <AppText
                    style={[
                      styles.modalFilterPillText,
                      verificationFilter === 'unverified' && styles.modalFilterPillTextActive,
                    ]}
                  >
                    Unverified Only
                  </AppText>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.filterActionButtons}>
              <TouchableOpacity
                style={styles.filterResetBtn}
                onPress={() => {
                  setRoleFilter('all');
                  setVerificationFilter('all');
                  setIsFilterModalOpen(false);
                }}
              >
                <AppText style={styles.filterResetText}>Reset All</AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.filterApplyBtn}
                onPress={() => setIsFilterModalOpen(false)}
              >
                <AppText style={styles.filterApplyText}>Apply Filters</AppText>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

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
    paddingBottom: 28,
  },

  // ─── Header & Top Elements (No double horizontal padding) ──────────────────
  headerContainer: {
    width: '100%',
  },
  headerSection: {
    paddingTop: 2,
    paddingBottom: 12,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  screenSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
  },

  // ─── Account Summary Cards (2-column responsive row) ───────────────────────
  summaryCardsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
    width: '100%',
  },
  summaryCard: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  summaryIconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  summaryTextBox: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 1,
  },

  // ─── Filter Tabs (Scrollable row) ──────────────────────────────────────────
  tabsScroll: {
    marginBottom: 14,
    width: '100%',
  },
  filterTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
  },
  filterTabActive: {
    backgroundColor: '#15803D',
  },
  filterTabInactive: {
    backgroundColor: '#F1F5F9',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  filterTabTextInactive: {
    color: '#334155',
  },
  filterTabBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTabBadgeActive: {
    backgroundColor: '#166534',
  },
  filterTabBadgeInactive: {
    backgroundColor: '#E2E8F0',
  },
  filterTabBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  filterTabBadgeTextActive: {
    color: '#FFFFFF',
  },
  filterTabBadgeTextInactive: {
    color: '#475569',
  },

  // ─── Search Field & Filter Button ──────────────────────────────────────────
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
    width: '100%',
  },
  searchBar: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    height: 46,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
    height: '100%',
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        outlineWidth: 0,
        boxShadow: 'none',
      } as any,
    }),
  },
  filterIconButton: {
    width: 46,
    height: 46,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    flexShrink: 0,
  },
  filterIconButtonHighlighted: {
    borderColor: '#15803D',
    backgroundColor: '#E6F4EA',
  },
  filterActiveDot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#15803D',
  },
  activeFilterNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    marginBottom: 12,
    width: '100%',
  },
  activeFilterNoticeText: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '600',
  },
  clearFilterText: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },

  // ─── User Account Cards (Full width with 16px outer shell gutter) ──────────
  userCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 12,
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

  // Layout for Wider Phones & Desktop (>= 380px)
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
    minWidth: 0,
    flexShrink: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    lineHeight: 22,
    letterSpacing: -0.2,
    flexWrap: 'wrap',
    ...Platform.select({
      web: {
        fontSize: 'clamp(15px, 4.2vw, 17px)' as any,
        lineHeight: '1.4' as any,
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
      },
    }),
  },
  userEmail: {
    fontSize: 14,
    fontWeight: '400',
    color: '#475569',
    lineHeight: 20,
    marginTop: 2,
    flexWrap: 'wrap',
    ...Platform.select({
      web: {
        fontSize: 'clamp(13px, 3.7vw, 15px)' as any,
        lineHeight: '1.45' as any,
        wordBreak: 'break-all',
        overflowWrap: 'anywhere',
      },
    }),
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  metaIcon: {
    flexShrink: 0,
  },
  metaTextItalic: {
    fontSize: 12.5,
    color: '#64748B',
    fontStyle: 'italic',
    flexShrink: 1,
    flexWrap: 'wrap',
    ...Platform.select({
      web: {
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
      },
    }),
  },
  rightActionGroup: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    flexShrink: 0,
  },
  badgesStack: {
    alignItems: 'flex-end',
    gap: 4,
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
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  verifiedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4338CA',
    letterSpacing: 0.3,
  },
  moreButton: {
    padding: 4,
    marginLeft: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Layout for Narrow Phones (< 380px): Natural vertical reflow
  narrowCardWrapper: {
    width: '100%',
  },
  narrowTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  narrowNameCol: {
    flex: 1,
    minWidth: 0,
  },
  userEmailNarrow: {
    fontSize: 14,
    fontWeight: '400',
    color: '#475569',
    lineHeight: 20,
    marginTop: 4,
    width: '100%',
    flexWrap: 'wrap',
    ...Platform.select({
      web: {
        fontSize: 'clamp(13px, 3.7vw, 15px)' as any,
        lineHeight: '1.45' as any,
        wordBreak: 'break-all',
        overflowWrap: 'anywhere',
      },
    }),
  },
  narrowBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },

  // Divider
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },

  // Bottom action row
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
  },
  cardBottomRowStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 10,
  },
  joinedDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  joinedDateText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  inspectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#15803D',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  inspectBtnFullWidth: {
    width: '100%',
    justifyContent: 'center',
  },
  inspectBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EBE6',
    padding: Spacing.lg,
    width: '100%',
  },

  // ─── 3-Dots Quick Actions Bottom Sheet ────────────────────────────────────
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
    ...Platform.select({
      web: {
        alignItems: 'center',
      },
    }),
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    width: '100%',
    maxWidth: 500,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sheetHeaderTitleGroup: {
    flex: 1,
    paddingRight: 12,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  sheetSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 2,
  },
  sheetCloseBtn: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },
  sheetBody: {
    paddingVertical: 12,
    gap: 4,
  },
  sheetActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  sheetActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetActionTextCol: {
    flex: 1,
  },
  sheetActionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  sheetActionDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  copiedToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'center',
    marginTop: 8,
  },
  copiedToastText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#15803D',
  },
  sheetCancelBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  sheetCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },

  // ─── Filter Modal ──────────────────────────────────────────────────────────
  modalFilterBody: {
    paddingVertical: 16,
  },
  filterGroupTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  filterPillGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalFilterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalFilterPillActive: {
    backgroundColor: '#15803D',
    borderColor: '#15803D',
  },
  modalFilterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  modalFilterPillTextActive: {
    color: '#FFFFFF',
  },
  filterActionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  filterResetBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  filterResetText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  filterApplyBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#15803D',
    alignItems: 'center',
  },
  filterApplyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ─── User Inspection Modal Styles ──────────────────────────────────────────
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
    flexWrap: 'wrap',
    gap: 4,
  },
  gridKey: {
    fontSize: 12,
    fontWeight: '600',
  },
  gridVal: {
    fontSize: 13,
    flexShrink: 1,
    textAlign: 'right',
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
