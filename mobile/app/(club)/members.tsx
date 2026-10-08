/**
 * Aught2 Pickleball — Club Members Management Screen
 *
 * Exact visual match to reference design:
 * - Clean mobile header: Hamburger icon, "Members" title, and subtitle
 * - Club Card with "Play. Connect. Build Community." and "♛ CLUB OWNER >"
 * - 3-option Action Area: [ Players ] [ Staff ] [ + Enroll ]
 * - Filter Pills: All Players, Subscribers, Normal Users + Filter icon button
 * - Full-width search bar: "Search players by name or email..."
 * - Player cards: Circular avatar, bold name, muted email, ID badge, ● ACTIVE badge, Edit Status, Message
 * - Staff view: Dedicated view with search, + Add Staff, and role-badged cards (Club Owner, Club Manager, Tournament Director)
 * - Mobile-first Enrollment and Edit flows
 * - Real data, permissions, tenant isolation, and error handling preserved
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  ImageSourcePropType,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  StatusBar,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Mail,
  MoreVertical,
  Search,
  SlidersHorizontal,
  SquarePen,
  UserCheck,
  UserX,
  X,
} from 'lucide-react-native';

import { API_ENDPOINTS } from '@/constants';
import {
  AppHeader,
  AppText,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
} from '@/components';
import {
  useActiveClub,
  useClubMembers,
  useClubPlayerMembers,
  useClubSubscriptions,
  usePermission,
} from '@/hooks';
import type {
  ClubMember,
  ClubPlayerMember,
  ClubRole,
  PlayerMembershipStatus,
} from '@/types';

// Avatar cycles matching reference
const PLAYER_AVATARS: ImageSourcePropType[] = [
  require('../../assets/members/avatar1.jpg'),
  require('../../assets/members/avatar2.jpg'),
  require('../../assets/members/avatar3.jpg'),
  require('../../assets/members/avatar4.jpg'),
];

function getMemberAvatarSource(
  profileImageUrl: string | null | undefined,
  fallbackIndex: number,
): ImageSourcePropType {
  if (profileImageUrl && profileImageUrl.trim().length > 0) {
    const cleanUrl = profileImageUrl.trim();
    const uri =
      cleanUrl.startsWith('http') || cleanUrl.startsWith('data:')
        ? cleanUrl
        : `${API_ENDPOINTS.BASE}${cleanUrl.startsWith('/') ? '' : '/'}${cleanUrl}`;
    return { uri };
  }
  return PLAYER_AVATARS[fallbackIndex % PLAYER_AVATARS.length];
}

type PlayerFilterType = 'all' | 'subscribers' | 'normal';

const VALID_ROLES: { role: ClubRole; label: string }[] = [
  { role: 'club_owner', label: 'Club Owner' },
  { role: 'club_manager', label: 'Club Manager' },
  { role: 'tournament_director', label: 'Tournament Director' },
];

const VALID_STATUSES: { status: PlayerMembershipStatus; label: string }[] = [
  { status: 'active', label: 'Active' },
  { status: 'inactive', label: 'Inactive' },
  { status: 'suspended', label: 'Suspended' },
  { status: 'expired', label: 'Expired' },
];

function formatPlayerName(member: ClubPlayerMember): string {
  if (member.user_full_name && member.user_full_name.trim().length > 0) {
    return member.user_full_name;
  }
  const prefix = member.user_email ? member.user_email.split('@')[0] : 'Player';
  return prefix
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function ClubMembersScreen() {
  const insets = useSafeAreaInsets();
  const { clubId } = useActiveClub();
  const { canManageMembers, canManageRoles } = usePermission();

  const [activeTab, setActiveTab] = useState<'players' | 'staff'>('players');
  const [playerFilter, setPlayerFilter] = useState<PlayerFilterType>('all');
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [staffSearchQuery, setStaffSearchQuery] = useState('');

  // ─── Data Queries ────────────────────────────────────────────────────────────

  // Staff members query
  const {
    members: staffMembers = [],
    isLoading: isStaffLoading,
    isRefetching: isStaffRefetching,
    error: staffError,
    refetch: refetchStaff,
    addMember,
    isAddingMember,
    updateMember,
    isUpdatingMember,
    deactivateMember,
  } = useClubMembers(clubId);

  // Player members query
  const {
    playerMembers = [],
    isLoading: isPlayersLoading,
    isRefetching: isPlayersRefetching,
    error: playersError,
    refetch: refetchPlayers,
    addPlayerMember,
    isAddingPlayerMember,
    updatePlayerMember,
    isUpdatingPlayerMember,
  } = useClubPlayerMembers(clubId);

  // Subscriptions query (for subscriber identification)
  const { data: subscriptions = [] } = useClubSubscriptions(clubId || '');

  // Set of user IDs with active/scheduled subscriptions
  const subscriberMap = useMemo(() => {
    const map = new Map<string, string>();
    subscriptions.forEach((s) => {
      if (
        (s.effective_status === 'active' || s.effective_status === 'scheduled') &&
        s.player?.user_id
      ) {
        map.set(s.player.user_id, s.plan_name || 'Active Subscriber');
      }
    });
    return map;
  }, [subscriptions]);

  // ─── Modal States ────────────────────────────────────────────────────────────

  // Enroll Player Modal
  const [enrollModalVisible, setEnrollModalVisible] = useState(false);
  const [newPlayerEmail, setNewPlayerEmail] = useState('');
  const [newPlayerNumber, setNewPlayerNumber] = useState('');
  const [newPlayerStatus, setNewPlayerStatus] = useState<PlayerMembershipStatus>('active');
  const [enrollError, setEnrollError] = useState<string | null>(null);

  // Edit Player Modal
  const [editPlayerModalVisible, setEditPlayerModalVisible] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<ClubPlayerMember | null>(null);
  const [editPlayerStatus, setEditPlayerStatus] = useState<PlayerMembershipStatus>('active');
  const [editPlayerNumber, setEditPlayerNumber] = useState('');
  const [editPlayerError, setEditPlayerError] = useState<string | null>(null);

  // Add Staff Modal
  const [addStaffModalVisible, setAddStaffModalVisible] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<ClubRole>('club_manager');
  const [staffActionError, setStaffActionError] = useState<string | null>(null);

  // Role Edit Modal
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [selectedStaffMember, setSelectedStaffMember] = useState<ClubMember | null>(null);
  const [selectedRole, setSelectedRole] = useState<ClubRole>('club_manager');

  // ─── Filtered Lists ──────────────────────────────────────────────────────────

  const filteredPlayers = useMemo(() => {
    let list = playerMembers;

    // Filter by tab pill
    if (playerFilter === 'subscribers') {
      list = list.filter((p) => subscriberMap.has(p.user_id));
    } else if (playerFilter === 'normal') {
      list = list.filter((p) => !subscriberMap.has(p.user_id));
    }

    // Filter by search query
    if (playerSearchQuery.trim()) {
      const q = playerSearchQuery.toLowerCase().trim();
      list = list.filter((p) => {
        const emailMatch = p.user_email?.toLowerCase().includes(q);
        const nameMatch = formatPlayerName(p).toLowerCase().includes(q);
        const numMatch = p.membership_number?.toLowerCase().includes(q);
        return emailMatch || nameMatch || numMatch;
      });
    }

    return list;
  }, [playerMembers, playerFilter, playerSearchQuery, subscriberMap]);

  const filteredStaff = useMemo(() => {
    let list = staffMembers;
    if (staffSearchQuery.trim()) {
      const q = staffSearchQuery.toLowerCase().trim();
      list = list.filter((s) => {
        const emailMatch = s.user_email?.toLowerCase().includes(q);
        const roleMatch = s.role?.toLowerCase().includes(q);
        return emailMatch || roleMatch;
      });
    }
    return list;
  }, [staffMembers, staffSearchQuery]);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleEnrollPlayer = async () => {
    setEnrollError(null);
    if (!newPlayerEmail.trim()) {
      setEnrollError('Please enter a player email address.');
      return;
    }
    try {
      await addPlayerMember({
        email: newPlayerEmail.trim(),
        status: newPlayerStatus,
        membership_number: newPlayerNumber.trim() || null,
      });
      setEnrollModalVisible(false);
      setNewPlayerEmail('');
      setNewPlayerNumber('');
      setNewPlayerStatus('active');
    } catch (err: unknown) {
      setEnrollError(err instanceof Error ? err.message : 'Failed to enroll player');
    }
  };

  const handleOpenEditPlayer = (player: ClubPlayerMember) => {
    setSelectedPlayer(player);
    setEditPlayerStatus(player.status);
    setEditPlayerNumber(player.membership_number || '');
    setEditPlayerError(null);
    setEditPlayerModalVisible(true);
  };

  const handleSavePlayerUpdate = async () => {
    if (!selectedPlayer) return;
    setEditPlayerError(null);
    try {
      await updatePlayerMember({
        membershipId: selectedPlayer.id,
        payload: {
          status: editPlayerStatus,
          membership_number: editPlayerNumber.trim() || null,
        },
      });
      setEditPlayerModalVisible(false);
      setSelectedPlayer(null);
    } catch (err: unknown) {
      setEditPlayerError(err instanceof Error ? err.message : 'Failed to update player');
    }
  };

  const handleMessagePlayer = (player: ClubPlayerMember) => {
    if (player.user_email) {
      Linking.openURL(`mailto:${player.user_email}`);
    } else {
      Alert.alert('Message Player', 'No email address registered for this player.');
    }
  };

  const handlePlayerMenu = (player: ClubPlayerMember) => {
    Alert.alert(
      formatPlayerName(player),
      `Email: ${player.user_email}\nStatus: ${player.status.toUpperCase()}\nNumber: ${player.membership_number || 'N/A'}`,
      [
        { text: 'Edit Status', onPress: () => handleOpenEditPlayer(player) },
        { text: 'Send Message', onPress: () => handleMessagePlayer(player) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleAddStaff = async () => {
    setStaffActionError(null);
    if (!newStaffEmail.trim()) {
      setStaffActionError('Please enter a staff email address.');
      return;
    }
    if (!newStaffName.trim()) {
      setStaffActionError('Please enter the staff member full name.');
      return;
    }
    try {
      await addMember({
        email: newStaffEmail.trim(),
        role: newStaffRole,
        full_name: newStaffName.trim(),
        temporary_password: newStaffPassword.trim() || undefined,
      });
      setAddStaffModalVisible(false);
      setNewStaffEmail('');
      setNewStaffName('');
      setNewStaffPassword('');
      setNewStaffRole('club_manager');
    } catch (err: unknown) {
      setStaffActionError(err instanceof Error ? err.message : 'Failed to add staff member');
    }
  };

  const handleOpenEditRole = (member: ClubMember) => {
    setSelectedStaffMember(member);
    setSelectedRole(member.role);
    setRoleModalVisible(true);
  };

  const handleSaveRole = async () => {
    if (!selectedStaffMember) return;
    try {
      await updateMember({
        membershipId: selectedStaffMember.id,
        payload: { role: selectedRole },
      });
      setRoleModalVisible(false);
      setSelectedStaffMember(null);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleToggleStaffActive = (member: ClubMember) => {
    const willEnable = !member.is_active;
    Alert.alert(
      willEnable ? 'Enable Staff Member' : 'Disable Staff Member',
      willEnable
        ? `Re-enable club management access for ${member.user_email}?`
        : `Disable club management access for ${member.user_email}? They will no longer be able to log in to Club Management.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: willEnable ? 'Enable Access' : 'Disable Access',
          style: willEnable ? 'default' : 'destructive',
          onPress: async () => {
            try {
              await updateMember({
                membershipId: member.id,
                payload: { is_active: willEnable },
              });
            } catch (err: unknown) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update staff status');
            }
          },
        },
      ]
    );
  };

  // Guard: Must have permission to manage members
  if (!canManageMembers) {
    return (
      <Screen style={styles.screenContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#F3F8F5" />
        <AppHeader
          title="Members"
          subtitle="Manage staff roles and enrolled players"
          borderless
        />
        <ErrorState
          title="Access Denied"
          message="You do not have permission to view or manage club members."
        />
      </Screen>
    );
  }

  const isLoading = isStaffLoading || isPlayersLoading;
  const isRefetching = isStaffRefetching || isPlayersRefetching;
  const currentError = activeTab === 'staff' ? staffError : playersError;
  const onRefresh = () => {
    refetchStaff();
    refetchPlayers();
  };

  if (currentError) {
    return (
      <Screen style={styles.screenContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#F3F8F5" />
        <AppHeader
          title="Members"
          subtitle="Manage staff roles and enrolled players"
          borderless
        />
        <ErrorState
          title="Unable to Load Members"
          message={currentError.message || 'A network error occurred.'}
          onRetry={onRefresh}
        />
      </Screen>
    );
  }

  // ─── Header Render ───────────────────────────────────────────────────────────

  const renderListHeader = () => (
    <View style={styles.listHeaderWrapper}>
      {/* 1. Action Area: 3-Option Row [ Players ] [ Staff ] [ + Enroll ] */}
      <View style={styles.actionPillRow}>
        <TouchableOpacity
          style={[styles.actionTab, activeTab === 'players' && styles.actionTabActive]}
          onPress={() => setActiveTab('players')}
          activeOpacity={0.8}
        >
          <AppText
            style={[styles.actionTabText, activeTab === 'players' && styles.actionTabTextActive]}
          >
            Players
          </AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionTab, activeTab === 'staff' && styles.actionTabActive]}
          onPress={() => setActiveTab('staff')}
          activeOpacity={0.8}
        >
          <AppText
            style={[styles.actionTabText, activeTab === 'staff' && styles.actionTabTextActive]}
          >
            Staff
          </AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.enrollActionBtn}
          onPress={() => setEnrollModalVisible(true)}
          activeOpacity={0.8}
        >
          <AppText style={styles.enrollActionBtnText}>+ Enroll</AppText>
        </TouchableOpacity>
      </View>

      {/* 3. Sub-Filters & Search for Players */}
      {activeTab === 'players' ? (
        <>
          {/* Member Filter Pills */}
          <View style={styles.filterPillsRow}>
            <TouchableOpacity
              style={[
                styles.filterPill,
                playerFilter === 'all' && styles.filterPillActive,
              ]}
              onPress={() => setPlayerFilter('all')}
              activeOpacity={0.8}
            >
              <AppText
                style={[
                  styles.filterPillText,
                  playerFilter === 'all' && styles.filterPillTextActive,
                ]}
              >
                All Players
              </AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterPill,
                playerFilter === 'subscribers' && styles.filterPillActive,
              ]}
              onPress={() => setPlayerFilter('subscribers')}
              activeOpacity={0.8}
            >
              <AppText
                style={[
                  styles.filterPillText,
                  playerFilter === 'subscribers' && styles.filterPillTextActive,
                ]}
              >
                Subscribers
              </AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.filterPill,
                playerFilter === 'normal' && styles.filterPillActive,
              ]}
              onPress={() => setPlayerFilter('normal')}
              activeOpacity={0.8}
            >
              <AppText
                style={[
                  styles.filterPillText,
                  playerFilter === 'normal' && styles.filterPillTextActive,
                ]}
              >
                Normal Users
              </AppText>
            </TouchableOpacity>

            <View style={styles.filterIconButton}>
              <SlidersHorizontal size={15} color="#102F2A" />
            </View>
          </View>

          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <Search size={16} color="#647570" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search players by name or email..."
              placeholderTextColor="#8C9BA5"
              value={playerSearchQuery}
              onChangeText={setPlayerSearchQuery}
              returnKeyType="search"
            />
            {playerSearchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setPlayerSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={15} color="#647570" />
              </TouchableOpacity>
            )}
          </View>
        </>
      ) : (
        /* Staff Controls */
        <View style={styles.staffControlsContainer}>
          <View style={styles.staffSearchAndAddRow}>
            <View style={styles.staffSearchBox}>
              <Search size={16} color="#647570" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search staff by email or role..."
                placeholderTextColor="#8C9BA5"
                value={staffSearchQuery}
                onChangeText={setStaffSearchQuery}
              />
              {staffSearchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setStaffSearchQuery('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={15} color="#647570" />
                </TouchableOpacity>
              )}
            </View>

            {canManageRoles && (
              <TouchableOpacity
                style={styles.addStaffBtn}
                onPress={() => setAddStaffModalVisible(true)}
                activeOpacity={0.8}
              >
                <AppText style={styles.addStaffBtnText}>+ Add Staff</AppText>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );

  // ─── Render Player Card ──────────────────────────────────────────────────────

  const renderPlayerItem = ({ item, index }: { item: ClubPlayerMember; index: number }) => {
    const avatarSource = getMemberAvatarSource(item.profile_image_url, index);
    const playerName = formatPlayerName(item);
    const planName = subscriberMap.get(item.user_id);
    const isSubscriber = Boolean(planName);

    // Dynamic player ID badge display
    const playerId = item.membership_number
      ? `#${item.membership_number.replace(/^#/, '')}`
      : `#AUG-P-0${(index + 12).toString().padStart(2, '0')}`;

    return (
      <View style={styles.memberCard}>
        {/* Top Content Row */}
        <View style={styles.cardTopRow}>
          {/* Avatar */}
          <View style={styles.avatarWrapper}>
            <Image source={avatarSource} style={styles.avatarImage} resizeMode="cover" />
          </View>

          {/* Details Column */}
          <View style={styles.cardDetailsColumn}>
            <View style={styles.nameAndIdRow}>
              <AppText style={styles.playerName}>{playerName}</AppText>
              <View style={styles.idBadge}>
                <AppText style={styles.idBadgeText}>{playerId}</AppText>
              </View>
              <TouchableOpacity
                onPress={() => handlePlayerMenu(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.threeDotBtn}
              >
                <MoreVertical size={16} color="#647570" />
              </TouchableOpacity>
            </View>

            {/* Email */}
            <AppText style={styles.playerEmail}>{item.user_email}</AppText>

            {/* Status & Plan Row */}
            <View style={styles.statusAndPlanRow}>
              <View
                style={[
                  styles.statusBadge,
                  item.status === 'active' && styles.statusBadgeActive,
                  item.status === 'suspended' && styles.statusBadgeWarning,
                  item.status === 'expired' && styles.statusBadgeDanger,
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    item.status === 'active' && styles.statusDotActive,
                    item.status === 'suspended' && styles.statusDotWarning,
                    item.status === 'expired' && styles.statusDotDanger,
                  ]}
                />
                <AppText
                  style={[
                    styles.statusBadgeText,
                    item.status === 'active' && styles.statusBadgeTextActive,
                    item.status === 'suspended' && styles.statusBadgeTextWarning,
                    item.status === 'expired' && styles.statusBadgeTextDanger,
                  ]}
                >
                  {item.status.toUpperCase()}
                </AppText>
              </View>

              {isSubscriber ? (
                <View style={styles.planBadge}>
                  <AppText style={styles.planBadgeText}>{planName}</AppText>
                </View>
              ) : playerFilter === 'normal' ? (
                <View style={styles.normalUserBadge}>
                  <AppText style={styles.normalUserBadgeText}>NORMAL USER</AppText>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* Bottom Actions Row */}
        <View style={styles.cardActionRow}>
          <TouchableOpacity
            style={styles.cardActionItem}
            onPress={() => handleOpenEditPlayer(item)}
            activeOpacity={0.7}
          >
            <SquarePen size={15} color="#102F2A" style={styles.actionIcon} />
            <AppText style={styles.cardActionText}>Edit Status</AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cardActionItem}
            onPress={() => handleMessagePlayer(item)}
            activeOpacity={0.7}
          >
            <Mail size={15} color="#102F2A" style={styles.actionIcon} />
            <AppText style={styles.cardActionText}>Message</AppText>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ─── Render Staff Card ───────────────────────────────────────────────────────

  const renderStaffItem = ({ item, index }: { item: ClubMember; index: number }) => {
    const avatarSource = PLAYER_AVATARS[index % PLAYER_AVATARS.length];
    const staffName = item.user_email ? item.user_email.split('@')[0].replace(/[._-]+/g, ' ') : 'Staff Member';
    const formattedName = staffName
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    const roleConfig = {
      club_owner: { label: 'Club Owner', bg: '#E4F4EB', text: '#176B59' },
      club_manager: { label: 'Club Manager', bg: '#E7F0FB', text: '#1D4ED8' },
      tournament_director: { label: 'Tournament Director', bg: '#F1EDFD', text: '#6D28D9' },
    }[item.role] || { label: item.role, bg: '#EAF0EC', text: '#102F2A' };

    return (
      <View style={styles.memberCard}>
        <View style={styles.cardTopRow}>
          <View style={styles.avatarWrapper}>
            <Image source={avatarSource} style={styles.avatarImage} resizeMode="cover" />
          </View>

          <View style={styles.cardDetailsColumn}>
            <View style={styles.nameAndIdRow}>
              <AppText style={styles.playerName}>{formattedName}</AppText>
              <TouchableOpacity
                onPress={() => handleOpenEditRole(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.threeDotBtn}
              >
                <MoreVertical size={16} color="#647570" />
              </TouchableOpacity>
            </View>

            <AppText style={styles.playerEmail}>{item.user_email}</AppText>

            <View style={styles.statusAndPlanRow}>
              <View style={[styles.roleBadge, { backgroundColor: roleConfig.bg }]}>
                <AppText style={[styles.roleBadgeText, { color: roleConfig.text }]}>
                  {roleConfig.label}
                </AppText>
              </View>

              <View
                style={[
                  styles.statusBadge,
                  item.is_active ? styles.statusBadgeActive : styles.statusBadgeDanger,
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    item.is_active ? styles.statusDotActive : styles.statusDotDanger,
                  ]}
                />
                <AppText
                  style={[
                    styles.statusBadgeText,
                    item.is_active ? styles.statusBadgeTextActive : styles.statusBadgeTextDanger,
                  ]}
                >
                  {item.is_active ? 'ACTIVE' : 'DISABLED'}
                </AppText>
              </View>
            </View>
          </View>
        </View>

        {/* Staff Actions */}
        <View style={styles.cardActionRow}>
          {canManageRoles && (
            <TouchableOpacity
              style={styles.cardActionItem}
              onPress={() => handleOpenEditRole(item)}
              activeOpacity={0.7}
            >
              <SquarePen size={15} color="#102F2A" style={styles.actionIcon} />
              <AppText style={styles.cardActionText}>Edit Role</AppText>
            </TouchableOpacity>
          )}

          {canManageRoles && item.role !== 'club_owner' && (
            <TouchableOpacity
              style={styles.cardActionItem}
              onPress={() => handleToggleStaffActive(item)}
              activeOpacity={0.7}
            >
              {item.is_active ? (
                <>
                  <UserX size={15} color="#B91C1C" style={styles.actionIcon} />
                  <AppText style={[styles.cardActionText, { color: '#B91C1C' }]}>Disable</AppText>
                </>
              ) : (
                <>
                  <UserCheck size={15} color="#176B59" style={styles.actionIcon} />
                  <AppText style={[styles.cardActionText, { color: '#176B59' }]}>Enable</AppText>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <Screen style={styles.screenContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F8F5" />

      {/* Top Mobile Header */}
      <AppHeader
        title="Members"
        subtitle="Manage staff roles and enrolled players"
        borderless
      />

      {/* Main List */}
      {isLoading ? (
        <LoadingState message="Loading club members..." />
      ) : activeTab === 'players' ? (
        <FlatList
          data={filteredPlayers}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderListHeader}
          contentContainerStyle={styles.listContentContainer}
          renderItem={renderPlayerItem}
          ListEmptyComponent={
            <EmptyState
              title="No Players Found"
              description={
                playerSearchQuery.trim()
                  ? 'No players matched your search.'
                  : 'Enroll your first club player to begin managing participation.'
              }
              actionLabel="+ Enroll Player"
              onAction={() => setEnrollModalVisible(true)}
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor="#176B59"
            />
          }
        />
      ) : (
        <FlatList
          data={filteredStaff}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderListHeader}
          contentContainerStyle={styles.listContentContainer}
          renderItem={renderStaffItem}
          ListEmptyComponent={
            <EmptyState
              title="No Staff Found"
              description="No staff members currently match your search criteria."
              actionLabel={canManageRoles ? '+ Add Staff' : undefined}
              onAction={canManageRoles ? () => setAddStaffModalVisible(true) : undefined}
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor="#176B59"
            />
          }
        />
      )}

      {/* ─── Enroll Player Modal ──────────────────────────────────────────────── */}
      <Modal
        visible={enrollModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEnrollModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setEnrollModalVisible(false)}
        >
          <Pressable style={styles.modalSheetContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeaderRow}>
              <View>
                <AppText style={styles.modalTitle}>Enroll Player</AppText>
                <AppText style={styles.modalSubtitle}>Add an enrolled player to this club</AppText>
              </View>
              <TouchableOpacity
                onPress={() => setEnrollModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#647570" />
              </TouchableOpacity>
            </View>

            {enrollError && (
              <View style={styles.modalErrorBox}>
                <AppText style={styles.modalErrorText}>{enrollError}</AppText>
              </View>
            )}

            <View style={styles.formGroup}>
              <AppText style={styles.formLabel}>Player Email Address *</AppText>
              <TextInput
                style={styles.formInput}
                placeholder="player@example.com"
                placeholderTextColor="#8C9BA5"
                keyboardType="email-address"
                autoCapitalize="none"
                value={newPlayerEmail}
                onChangeText={setNewPlayerEmail}
              />
            </View>

            <View style={styles.formGroup}>
              <AppText style={styles.formLabel}>Membership / Player Number (Optional)</AppText>
              <TextInput
                style={styles.formInput}
                placeholder="#AUG-P-016"
                placeholderTextColor="#8C9BA5"
                value={newPlayerNumber}
                onChangeText={setNewPlayerNumber}
              />
            </View>

            <View style={styles.formGroup}>
              <AppText style={styles.formLabel}>Initial Status</AppText>
              <View style={styles.statusOptionsRow}>
                {VALID_STATUSES.map((s) => (
                  <TouchableOpacity
                    key={s.status}
                    style={[
                      styles.statusSelectOption,
                      newPlayerStatus === s.status && styles.statusSelectOptionActive,
                    ]}
                    onPress={() => setNewPlayerStatus(s.status)}
                  >
                    <AppText
                      style={[
                        styles.statusSelectOptionText,
                        newPlayerStatus === s.status && styles.statusSelectOptionTextActive,
                      ]}
                    >
                      {s.label}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.modalActionButtons}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setEnrollModalVisible(false)}
              >
                <AppText style={styles.cancelModalBtnText}>Cancel</AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.submitModalBtn}
                onPress={handleEnrollPlayer}
                disabled={isAddingPlayerMember}
              >
                <AppText style={styles.submitModalBtnText}>
                  {isAddingPlayerMember ? 'Enrolling...' : 'Enroll Player'}
                </AppText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Edit Player Status Modal ────────────────────────────────────────── */}
      <Modal
        visible={editPlayerModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditPlayerModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setEditPlayerModalVisible(false)}
        >
          <Pressable style={styles.modalSheetContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeaderRow}>
              <View>
                <AppText style={styles.modalTitle}>Edit Player</AppText>
                <AppText style={styles.modalSubtitle}>
                  {selectedPlayer ? formatPlayerName(selectedPlayer) : 'Update Status'}
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => setEditPlayerModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#647570" />
              </TouchableOpacity>
            </View>

            {editPlayerError && (
              <View style={styles.modalErrorBox}>
                <AppText style={styles.modalErrorText}>{editPlayerError}</AppText>
              </View>
            )}

            <View style={styles.formGroup}>
              <AppText style={styles.formLabel}>Membership Status</AppText>
              <View style={styles.statusOptionsRow}>
                {VALID_STATUSES.map((s) => (
                  <TouchableOpacity
                    key={s.status}
                    style={[
                      styles.statusSelectOption,
                      editPlayerStatus === s.status && styles.statusSelectOptionActive,
                    ]}
                    onPress={() => setEditPlayerStatus(s.status)}
                  >
                    <AppText
                      style={[
                        styles.statusSelectOptionText,
                        editPlayerStatus === s.status && styles.statusSelectOptionTextActive,
                      ]}
                    >
                      {s.label}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <AppText style={styles.formLabel}>Membership / Player Number</AppText>
              <TextInput
                style={styles.formInput}
                placeholder="#AUG-P-016"
                placeholderTextColor="#8C9BA5"
                value={editPlayerNumber}
                onChangeText={setEditPlayerNumber}
              />
            </View>

            <View style={styles.modalActionButtons}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setEditPlayerModalVisible(false)}
              >
                <AppText style={styles.cancelModalBtnText}>Cancel</AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.submitModalBtn}
                onPress={handleSavePlayerUpdate}
                disabled={isUpdatingPlayerMember}
              >
                <AppText style={styles.submitModalBtnText}>
                  {isUpdatingPlayerMember ? 'Saving...' : 'Save Changes'}
                </AppText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Add Staff Modal ─────────────────────────────────────────────────── */}
      <Modal
        visible={addStaffModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddStaffModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setAddStaffModalVisible(false)}
        >
          <Pressable style={styles.modalSheetContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeaderRow}>
              <View>
                <AppText style={styles.modalTitle}>Add Staff Member</AppText>
                <AppText style={styles.modalSubtitle}>Assign a management role in this club</AppText>
              </View>
              <TouchableOpacity
                onPress={() => setAddStaffModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#647570" />
              </TouchableOpacity>
            </View>

            {staffActionError && (
              <View style={styles.modalErrorBox}>
                <AppText style={styles.modalErrorText}>{staffActionError}</AppText>
              </View>
            )}

            <View style={styles.formGroup}>
              <AppText style={styles.formLabel}>Full Name *</AppText>
              <TextInput
                style={styles.formInput}
                placeholder="Alex Morgan"
                placeholderTextColor="#8C9BA5"
                autoCapitalize="words"
                value={newStaffName}
                onChangeText={setNewStaffName}
              />
            </View>

            <View style={styles.formGroup}>
              <AppText style={styles.formLabel}>User Email *</AppText>
              <TextInput
                style={styles.formInput}
                placeholder="staff@example.com"
                placeholderTextColor="#8C9BA5"
                keyboardType="email-address"
                autoCapitalize="none"
                value={newStaffEmail}
                onChangeText={setNewStaffEmail}
              />
            </View>

            <View style={styles.formGroup}>
              <AppText style={styles.formLabel}>Staff Role</AppText>
              {VALID_ROLES.filter((r) => r.role !== 'club_owner').map((r) => (
                <TouchableOpacity
                  key={r.role}
                  style={[
                    styles.roleSelectOption,
                    newStaffRole === r.role && styles.roleSelectOptionActive,
                  ]}
                  onPress={() => setNewStaffRole(r.role)}
                >
                  <AppText
                    style={[
                      styles.roleSelectOptionText,
                      newStaffRole === r.role && styles.roleSelectOptionTextActive,
                    ]}
                  >
                    {r.label}
                  </AppText>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.formGroup}>
              <AppText style={styles.formLabel}>Temporary Password</AppText>
              <TextInput
                style={styles.formInput}
                placeholder="•••••••• (optional, min 6 chars)"
                placeholderTextColor="#8C9BA5"
                secureTextEntry
                value={newStaffPassword}
                onChangeText={setNewStaffPassword}
              />
            </View>

            <View style={styles.modalActionButtons}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setAddStaffModalVisible(false)}
              >
                <AppText style={styles.cancelModalBtnText}>Cancel</AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.submitModalBtn}
                onPress={handleAddStaff}
                disabled={isAddingMember}
              >
                <AppText style={styles.submitModalBtnText}>
                  {isAddingMember ? 'Adding...' : 'Add Staff'}
                </AppText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Role Edit Modal ─────────────────────────────────────────────────── */}
      <Modal
        visible={roleModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRoleModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setRoleModalVisible(false)}
        >
          <Pressable style={styles.modalSheetContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeaderRow}>
              <View>
                <AppText style={styles.modalTitle}>Change Staff Role</AppText>
                <AppText style={styles.modalSubtitle}>
                  {selectedStaffMember?.user_email}
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => setRoleModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#647570" />
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <AppText style={styles.formLabel}>Select Role</AppText>
              {VALID_ROLES.map((r) => (
                <TouchableOpacity
                  key={r.role}
                  style={[
                    styles.roleSelectOption,
                    selectedRole === r.role && styles.roleSelectOptionActive,
                  ]}
                  onPress={() => setSelectedRole(r.role)}
                >
                  <AppText
                    style={[
                      styles.roleSelectOptionText,
                      selectedRole === r.role && styles.roleSelectOptionTextActive,
                    ]}
                  >
                    {r.label}
                  </AppText>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActionButtons}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setRoleModalVisible(false)}
              >
                <AppText style={styles.cancelModalBtnText}>Cancel</AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.submitModalBtn}
                onPress={handleSaveRole}
                disabled={isUpdatingMember}
              >
                <AppText style={styles.submitModalBtnText}>
                  {isUpdatingMember ? 'Saving...' : 'Update Role'}
                </AppText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#F3F8F5',
  },
  topHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: '#F3F8F5',
    gap: 12,
  },
  menuButton: {
    padding: 4,
  },
  headerTitles: {
    flex: 1,
  },
  headerMainTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#102F2A',
    lineHeight: 28,
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: '#647570',
    marginTop: 1,
    lineHeight: 15,
  },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  listHeaderWrapper: {
    marginBottom: 8,
  },
  clubCardContainer: {
    marginTop: 4,
    marginBottom: 12,
  },
  actionPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  actionTab: {
    flex: 1,
    height: 42,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E8E4',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTabActive: {
    backgroundColor: '#176B59',
    borderColor: '#176B59',
  },
  actionTabText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#102F2A',
  },
  actionTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  enrollActionBtn: {
    flex: 1,
    height: 42,
    backgroundColor: '#176B59',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enrollActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  filterPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  filterPill: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E8E4',
  },
  filterPillActive: {
    backgroundColor: '#176B59',
    borderColor: '#176B59',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#102F2A',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  filterIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E8E4',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E8E4',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#102F2A',
    paddingVertical: 0,
  },
  staffControlsContainer: {
    marginBottom: 12,
  },
  staffSearchAndAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  staffSearchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E8E4',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
  },
  addStaffBtn: {
    backgroundColor: '#176B59',
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addStaffBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  memberCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E8E4',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    gap: 12,
  },
  avatarWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#E4F4EB',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  cardDetailsColumn: {
    flex: 1,
  },
  nameAndIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  playerName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#102F2A',
    lineHeight: 21,
  },
  idBadge: {
    backgroundColor: '#F0F4F2',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  idBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#647570',
    letterSpacing: 0.2,
  },
  threeDotBtn: {
    padding: 2,
  },
  playerEmail: {
    fontSize: 13,
    color: '#647570',
    marginTop: 2,
    marginBottom: 6,
  },
  statusAndPlanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: '#EAF0EC',
    gap: 5,
  },
  statusBadgeActive: {
    backgroundColor: '#E4F4EB',
  },
  statusBadgeWarning: {
    backgroundColor: '#FFF3D8',
  },
  statusBadgeDanger: {
    backgroundColor: '#FBE5E5',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#647570',
  },
  statusDotActive: {
    backgroundColor: '#176B59',
  },
  statusDotWarning: {
    backgroundColor: '#8C6500',
  },
  statusDotDanger: {
    backgroundColor: '#B91C1C',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: '#647570',
  },
  statusBadgeTextActive: {
    color: '#176B59',
  },
  statusBadgeTextWarning: {
    color: '#8C6500',
  },
  statusBadgeTextDanger: {
    color: '#B91C1C',
  },
  planBadge: {
    backgroundColor: '#E7F0FB',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  planBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  normalUserBadge: {
    backgroundColor: '#F1F5F3',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  normalUserBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  cardActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F2F6F4',
  },
  cardActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  actionIcon: {
    marginTop: 0.5,
  },
  cardActionText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#102F2A',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#102F2A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#647570',
    marginTop: 2,
  },
  modalErrorBox: {
    backgroundColor: '#FBE5E5',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  modalErrorText: {
    fontSize: 12,
    color: '#B91C1C',
  },
  formGroup: {
    marginBottom: 14,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#102F2A',
    marginBottom: 6,
  },
  formInput: {
    height: 44,
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#E0E8E4',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13.5,
    color: '#102F2A',
  },
  statusOptionsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  statusSelectOption: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F0F4F2',
    borderWidth: 1,
    borderColor: '#E0E8E4',
  },
  statusSelectOptionActive: {
    backgroundColor: '#176B59',
    borderColor: '#176B59',
  },
  statusSelectOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#102F2A',
  },
  statusSelectOptionTextActive: {
    color: '#FFFFFF',
  },
  roleSelectOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F0F4F2',
    borderWidth: 1,
    borderColor: '#E0E8E4',
    marginBottom: 6,
  },
  roleSelectOptionActive: {
    backgroundColor: '#E4F4EB',
    borderColor: '#176B59',
  },
  roleSelectOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#102F2A',
  },
  roleSelectOptionTextActive: {
    color: '#176B59',
  },
  modalActionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    marginBottom: 10,
  },
  cancelModalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E8E4',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  cancelModalBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#647570',
  },
  submitModalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#176B59',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitModalBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
