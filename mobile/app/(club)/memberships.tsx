/**
 * Aught2 Pickleball — Modern Memberships Dashboard (Club Owner Experience)
 *
 * Exact visual match to the Modern Memberships Dashboard reference specification:
 * - Header: Hamburger menu on left, bold "Memberships" title, and subtitle
 *   "Plans, tiers, and subscriber management" in deep forest-green typography.
 * - Sports-themed decorative background: Soft pale mint (#F0F8F2) page background,
 *   subtle curved abstract green concentric arcs in the upper-right corner, and
 *   an overlapping lime-green sports ball with tennis/pickleball seams.
 * - Main action row: 3 large horizontally aligned buttons:
 *   [ 👥 Players ] (deep teal filled when selected) | [ 👤 Staff ] | [ + Enroll ]
 * - Player filter controls:
 *   [ All Players ] (filled when selected) | [ Subscribers ] | [ Normal Users ] | [ 🎛️ ] Settings button
 * - Full-width white search bar: "Search players by name or email..."
 * - Member cards:
 *   - Circular real profile avatar (object-fit: cover) with clean initials fallback
 *   - Bold member name in dark forest-green typography
 *   - Muted email address
 *   - Compact pale-gray rounded badge near upper-right (#AUG-P-xxx)
 *   - Vertical three-dot overflow menu (MoreVertical)
 *   - Restrained status badge (● Active) with green indicator
 *   - Thin horizontal divider
 *   - Balanced bottom action row: [ 📝 Edit Status ] | [ ✉️ Message ]
 * - Dedicated Staff section with role badges (Owner, Manager, Tournament Director)
 *   and strict backend-enforced separation between players and staff.
 * - Complete enrollment, status editing, role assignment, messaging, and plan management.
 * - Responsive layout with generous bottom padding clearing the fixed AppBottomNav.
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import {
  Calendar,
  Check,
  Crown,
  Mail,
  Menu,
  MoreVertical,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  SquarePen,
  Trash2,
  Trophy,
  User,
  UserCheck,
  Users,
  UserX,
  X,
} from 'lucide-react-native';

import { API_ENDPOINTS } from '@/constants';
import {
  AppText,
  EmptyState,
  LoadingState,
  Screen,
} from '@/components';
import { useDrawerStore } from '@/navigation';
import {
  useActiveClub,
  useClubMembers,
  useClubPlayerMembers,
  useClubSubscriptions,
  useMembershipPlans,
  usePermission,
} from '@/hooks';
import { blurActiveElement, formatCurrency, resolveMediaUrl } from '@/utils';
import type {
  ClubMember,
  ClubPlayerMember,
  ClubRole,
  MembershipPlan,
  PlayerMembershipStatus,
} from '@/types';

// ─── Circular Member Avatar Component ─────────────────────────────────────────

interface MemberAvatarProps {
  imageUrl?: string | null;
  name: string;
  size?: number;
}

function MemberAvatar({ imageUrl, name, size = 64 }: MemberAvatarProps) {
  const [loadError, setLoadError] = useState(false);

  const resolvedUri = useMemo(() => {
    if (!imageUrl) return null;
    const cleanUrl = imageUrl.trim();
    if (!cleanUrl) return null;
    return resolveMediaUrl(cleanUrl);
  }, [imageUrl]);

  const initials = useMemo(() => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    if (parts.length === 1 && parts[0].length > 0) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return 'PB';
  }, [name]);

  if (resolvedUri && !loadError) {
    return (
      <View style={[styles.avatarContainer, { width: size, height: size, borderRadius: size / 2 }]}>
        <Image
          source={{ uri: resolvedUri }}
          style={[styles.avatarImg, { width: size, height: size, borderRadius: size / 2 }]}
          resizeMode="cover"
          onError={() => setLoadError(true)}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.avatarContainer,
        styles.avatarFallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <AppText
        style={[
          styles.avatarInitialsText,
          { fontSize: Math.round(size * 0.35) },
        ]}
      >
        {initials}
      </AppText>
    </View>
  );
}

// ─── Filter & Role Constants ──────────────────────────────────────────────────

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
    return member.user_full_name.trim();
  }
  const prefix = member.user_email ? member.user_email.split('@')[0] : 'Player';
  return prefix
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export default function MembershipsScreen() {
  const insets = useSafeAreaInsets();
  const openDrawer = useDrawerStore((s) => s.openDrawer);
  const { clubId } = useActiveClub();
  const { canManageMembers, canManageRoles } = usePermission();
  const params = useLocalSearchParams<{ tab?: string }>();

  const [activeTab, setActiveTab] = useState<'players' | 'staff'>(
    params?.tab === 'staff' ? 'staff' : 'players'
  );
  const [playerFilter, setPlayerFilter] = useState<PlayerFilterType>('all');
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [staffSearchQuery, setStaffSearchQuery] = useState('');

  // ─── Data Queries ────────────────────────────────────────────────────────────

  // 1. Staff members query (strictly staff with club roles)
  const {
    members: staffMembers = [],
    isLoading: isStaffLoading,
    isRefetching: isStaffRefetching,
    refetch: refetchStaff,
    addMember,
    isAddingMember,
    updateMember,
    isUpdatingMember,
    deactivateMember,
  } = useClubMembers(clubId);

  // 2. Player members query (strictly enrolled facility players)
  const {
    playerMembers = [],
    isLoading: isPlayersLoading,
    isRefetching: isPlayersRefetching,
    refetch: refetchPlayers,
    addPlayerMember,
    isAddingPlayerMember,
    updatePlayerMember,
    isUpdatingPlayerMember,
  } = useClubPlayerMembers(clubId);

  // 3. Subscriptions query (for subscriber identification)
  const { data: subscriptions = [], refetch: refetchSubs } = useClubSubscriptions(clubId || '');

  // 4. Membership plans query (for plan tiers management)
  const { data: membershipPlans = [] } = useMembershipPlans(clubId || '');

  const isLoading = isPlayersLoading || isStaffLoading;
  const isRefetching = isPlayersRefetching || isStaffRefetching;

  const onRefresh = () => {
    void refetchPlayers();
    void refetchStaff();
    void refetchSubs();
  };

  // Map of user IDs with active subscriptions
  const subscriberMap = useMemo(() => {
    const map = new Map<string, string>();
    subscriptions.forEach((s) => {
      if (s.effective_status === 'active' && s.player?.user_id) {
        map.set(s.player.user_id, s.plan_name || 'Active Subscriber');
      }
    });
    return map;
  }, [subscriptions]);

  // Set of staff user IDs and emails to strictly exclude from Players section
  const staffUserIds = useMemo(() => {
    const set = new Set<string>();
    staffMembers.forEach((s) => {
      if (s.user_id) set.add(s.user_id);
    });
    return set;
  }, [staffMembers]);

  const staffEmails = useMemo(() => {
    const set = new Set<string>();
    staffMembers.forEach((s) => {
      if (s.user_email) set.add(s.user_email.toLowerCase().trim());
    });
    return set;
  }, [staffMembers]);

  // ─── Filtered Players List (STRICT STAFF EXCLUSION) ──────────────────────────

  const filteredPlayers = useMemo(() => {
    // 1. Strictly exclude all staff accounts from player list
    let list = playerMembers.filter(
      (p) =>
        !staffUserIds.has(p.user_id) &&
        !staffEmails.has(p.user_email?.toLowerCase().trim())
    );

    // 2. Filter by tab pill
    if (playerFilter === 'subscribers') {
      list = list.filter((p) => subscriberMap.has(p.user_id));
    } else if (playerFilter === 'normal') {
      list = list.filter((p) => !subscriberMap.has(p.user_id));
    }

    // 3. Filter by search query
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
  }, [playerMembers, staffUserIds, staffEmails, playerFilter, playerSearchQuery, subscriberMap]);

  // ─── Filtered Staff List ─────────────────────────────────────────────────────

  const filteredStaff = useMemo(() => {
    let list = staffMembers;
    if (staffSearchQuery.trim()) {
      const q = staffSearchQuery.toLowerCase().trim();
      list = list.filter((s) => {
        const emailMatch = s.user_email?.toLowerCase().includes(q);
        const nameMatch = s.user_full_name?.toLowerCase().includes(q);
        const roleMatch = s.role?.toLowerCase().includes(q) || s.role_label?.toLowerCase().includes(q);
        return emailMatch || nameMatch || roleMatch;
      });
    }
    return list;
  }, [staffMembers, staffSearchQuery]);

  // ─── Modal States ────────────────────────────────────────────────────────────

  // Enroll Player Modal
  const [enrollModalVisible, setEnrollModalVisible] = useState(false);
  const [newPlayerEmail, setNewPlayerEmail] = useState('');
  const [newPlayerNumber, setNewPlayerNumber] = useState('');
  const [newPlayerStatus, setNewPlayerStatus] = useState<PlayerMembershipStatus>('active');
  const [enrollError, setEnrollError] = useState<string | null>(null);

  // Add Staff Modal
  const [addStaffModalVisible, setAddStaffModalVisible] = useState(false);
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<ClubRole>('club_manager');
  const [staffErrorState, setStaffErrorState] = useState<string | null>(null);

  // Edit Player Status Modal
  const [editPlayerModalVisible, setEditPlayerModalVisible] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<ClubPlayerMember | null>(null);
  const [selectedPlayerStatus, setSelectedPlayerStatus] = useState<PlayerMembershipStatus>('active');
  const [editPlayerError, setEditPlayerError] = useState<string | null>(null);

  // Edit Staff Role Modal
  const [editStaffModalVisible, setEditStaffModalVisible] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<ClubMember | null>(null);
  const [selectedStaffRole, setSelectedStaffRole] = useState<ClubRole>('club_manager');
  const [editStaffError, setEditStaffError] = useState<string | null>(null);

  // Filter / Plans Settings Modal
  const [filterInfoVisible, setFilterInfoVisible] = useState(false);

  // Action Sheet Overflow Modal
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [menuPlayer, setMenuPlayer] = useState<ClubPlayerMember | null>(null);

  // Message Modal
  const [messageModalVisible, setMessageModalVisible] = useState(false);
  const [messageTarget, setMessageTarget] = useState<{ name: string; email: string } | null>(null);
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');

  // ─── Mutation Handlers ───────────────────────────────────────────────────────

  const handleEnrollPlayerSubmit = async () => {
    if (!newPlayerEmail.trim()) {
      setEnrollError('Email address is required');
      return;
    }
    try {
      setEnrollError(null);
      await addPlayerMember({
        email: newPlayerEmail.trim().toLowerCase(),
        status: newPlayerStatus,
        membership_number: newPlayerNumber.trim() || undefined,
      });
      setEnrollModalVisible(false);
      setNewPlayerEmail('');
      setNewPlayerNumber('');
      setNewPlayerStatus('active');
      Alert.alert('Success', 'Player enrolled successfully in this club.');
    } catch (err: any) {
      setEnrollError(err?.message || 'Failed to enroll player. Please verify the email address.');
    }
  };

  const handleAddStaffSubmit = async () => {
    if (!newStaffEmail.trim()) {
      setStaffErrorState('Email address is required');
      return;
    }
    try {
      setStaffErrorState(null);
      await addMember({
        email: newStaffEmail.trim().toLowerCase(),
        role: newStaffRole,
      });
      setAddStaffModalVisible(false);
      setNewStaffEmail('');
      setNewStaffRole('club_manager');
      Alert.alert('Success', 'Staff member added successfully.');
    } catch (err: any) {
      setStaffErrorState(err?.message || 'Failed to add staff member. Verify the user account exists.');
    }
  };

  const handleUpdatePlayerStatusSubmit = async () => {
    if (!selectedPlayer) return;
    try {
      setEditPlayerError(null);
      await updatePlayerMember({
        membershipId: selectedPlayer.id,
        payload: { status: selectedPlayerStatus },
      });
      setEditPlayerModalVisible(false);
      setSelectedPlayer(null);
      Alert.alert('Updated', 'Player membership status updated.');
    } catch (err: any) {
      setEditPlayerError(err?.message || 'Failed to update player status.');
    }
  };

  const handleUpdateStaffRoleSubmit = async () => {
    if (!selectedStaff) return;
    try {
      setEditStaffError(null);
      await updateMember({
        membershipId: selectedStaff.id,
        payload: { role: selectedStaffRole },
      });
      setEditStaffModalVisible(false);
      setSelectedStaff(null);
      Alert.alert('Updated', 'Staff member role updated.');
    } catch (err: any) {
      setEditStaffError(err?.message || 'Failed to update staff role.');
    }
  };

  const handleOpenEditPlayer = (player: ClubPlayerMember) => {
    blurActiveElement();
    setSelectedPlayer(player);
    setSelectedPlayerStatus(player.status);
    setEditPlayerError(null);
    setEditPlayerModalVisible(true);
  };

  const handleOpenEditStaff = (staff: ClubMember) => {
    blurActiveElement();
    setSelectedStaff(staff);
    setSelectedStaffRole(staff.role);
    setEditStaffError(null);
    setEditStaffModalVisible(true);
  };

  const handleMessagePlayer = (player: ClubPlayerMember) => {
    blurActiveElement();
    const name = formatPlayerName(player);
    setMessageTarget({ name, email: player.user_email });
    setMessageSubject(`Update from ${clubId ? 'Club' : 'Pickleball Club'}`);
    setMessageBody(`Hi ${name},\n\n`);
    setMessageModalVisible(true);
  };

  const handleMessageStaff = (staff: ClubMember) => {
    blurActiveElement();
    const name = staff.user_full_name || staff.user_email;
    setMessageTarget({ name, email: staff.user_email });
    setMessageSubject(`Staff Notice`);
    setMessageBody(`Hi ${name},\n\n`);
    setMessageModalVisible(true);
  };

  const handleSendEmail = () => {
    if (!messageTarget?.email) return;
    const url = `mailto:${messageTarget.email}?subject=${encodeURIComponent(
      messageSubject
    )}&body=${encodeURIComponent(messageBody)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Email Client', `Could not open mail app. You can reach out directly to ${messageTarget.email}`);
    });
    setMessageModalVisible(false);
  };

  // ─── Header & Section Controls Component ─────────────────────────────────────

  const renderListHeader = () => (
    <View style={styles.headerBlock}>
      {/* ─── 1. Top Header with Hamburger and Decorative Background ─── */}
      <View style={[styles.customHeaderRow, { paddingTop: Math.max(insets.top, 16) + 4 }]}>
        <TouchableOpacity
          onPress={openDrawer}
          style={styles.hamburgerButton}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Open navigation drawer"
          accessibilityRole="button"
        >
          <Menu size={25} color="#123D38" strokeWidth={2.2} />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <AppText style={styles.pageTitle}>Memberships</AppText>
          <AppText style={styles.pageSubtitle}>Plans, tiers, and subscriber management</AppText>
        </View>

        {/* ─── Upper-Right Sports-Themed Decorative Background ─── */}
        <View style={styles.decorativeBgContainer} pointerEvents="none">
          {/* Outer mint circle arc */}
          <View style={styles.decorativeOuterCircle} />
          {/* Inner deep teal circle arc */}
          <View style={styles.decorativeInnerCircle} />
          {/* Overlapping lime-green sports ball */}
          <Image
            source={require('../../assets/memberships/sports_ball.png')}
            style={styles.decorativeBall}
            resizeMode="contain"
          />
        </View>
      </View>

      {/* ─── 2. Main 3-Button Action Row: [ Players ] [ Staff ] [ + Enroll ] ─── */}
      <View style={styles.mainActionRow}>
        {/* Players Button */}
        <TouchableOpacity
          style={[
            styles.mainActionBtn,
            activeTab === 'players' && styles.mainActionBtnActive,
          ]}
          onPress={() => setActiveTab('players')}
          activeOpacity={0.8}
          accessibilityLabel="Players view"
          accessibilityRole="tab"
        >
          <Users
            size={18}
            color={activeTab === 'players' ? '#FFFFFF' : '#123D38'}
            strokeWidth={activeTab === 'players' ? 2.4 : 2}
          />
          <AppText
            style={[
              styles.mainActionBtnText,
              activeTab === 'players' && styles.mainActionBtnTextActive,
            ]}
          >
            Players
          </AppText>
        </TouchableOpacity>

        {/* Staff Button */}
        <TouchableOpacity
          style={[
            styles.mainActionBtn,
            activeTab === 'staff' && styles.mainActionBtnActive,
          ]}
          onPress={() => setActiveTab('staff')}
          activeOpacity={0.8}
          accessibilityLabel="Staff view"
          accessibilityRole="tab"
        >
          <User
            size={18}
            color={activeTab === 'staff' ? '#FFFFFF' : '#123D38'}
            strokeWidth={activeTab === 'staff' ? 2.4 : 2}
          />
          <AppText
            style={[
              styles.mainActionBtnText,
              activeTab === 'staff' && styles.mainActionBtnTextActive,
            ]}
          >
            Staff
          </AppText>
        </TouchableOpacity>

        {/* + Enroll Button (White card style matching reference) */}
        <TouchableOpacity
          style={styles.mainActionBtnSecondary}
          onPress={() => {
            blurActiveElement();
            if (activeTab === 'staff') {
              setAddStaffModalVisible(true);
            } else {
              setEnrollModalVisible(true);
            }
          }}
          activeOpacity={0.8}
          accessibilityLabel="Enroll player or staff"
          accessibilityRole="button"
        >
          <Plus size={18} color="#123D38" strokeWidth={2.4} />
          <AppText style={styles.mainActionBtnSecondaryText}>Enroll</AppText>
        </TouchableOpacity>
      </View>

      {/* ─── 3. Section Controls (Players vs Staff) ─── */}
      {activeTab === 'players' ? (
        <>
          {/* Sub-Filters: All Players, Subscribers, Normal Users + Settings Button */}
          <View style={styles.filterPillsRow}>
            {/* All Players */}
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

            {/* Subscribers */}
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

            {/* Normal Users */}
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

            {/* Filter / Plans Settings Button */}
            <TouchableOpacity
              style={styles.filterIconButton}
              onPress={() => {
                blurActiveElement();
                setFilterInfoVisible(true);
              }}
              activeOpacity={0.7}
              accessibilityLabel="Filter and membership plans settings"
              accessibilityRole="button"
            >
              <SlidersHorizontal size={17} color="#123D38" strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* Full-width Search Bar */}
          <View style={styles.searchContainer}>
            <Search size={18} color="#71828A" strokeWidth={2} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search players by name or email..."
              placeholderTextColor="#8C9BA5"
              value={playerSearchQuery}
              onChangeText={setPlayerSearchQuery}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {playerSearchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setPlayerSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={16} color="#71828A" />
              </TouchableOpacity>
            )}
          </View>
        </>
      ) : (
        /* Staff Controls */
        <View style={styles.staffControlsContainer}>
          <View style={styles.staffSearchAndAddRow}>
            <View style={styles.staffSearchBox}>
              <Search size={18} color="#71828A" strokeWidth={2} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search staff by name, email or role..."
                placeholderTextColor="#8C9BA5"
                value={staffSearchQuery}
                onChangeText={setStaffSearchQuery}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {staffSearchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setStaffSearchQuery('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={16} color="#71828A" />
                </TouchableOpacity>
              )}
            </View>

            {canManageRoles && (
              <TouchableOpacity
                style={styles.addStaffBtn}
                onPress={() => {
                  blurActiveElement();
                  setAddStaffModalVisible(true);
                }}
                activeOpacity={0.8}
              >
                <Plus size={15} color="#FFFFFF" strokeWidth={2.4} />
                <AppText style={styles.addStaffBtnText}>Staff</AppText>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );

  // ─── Render Player Card ──────────────────────────────────────────────────────

  const renderPlayerItem = ({ item, index }: { item: ClubPlayerMember; index: number }) => {
    const playerName = formatPlayerName(item);
    const memberIdBadge = item.membership_number
      ? (item.membership_number.startsWith('#') ? item.membership_number : `#${item.membership_number}`)
      : `#AUG-P-${String((index + 1) * 7).padStart(3, '0')}`;

    return (
      <View style={styles.memberCard}>
        {/* Top Profile Row: Avatar + Details */}
        <View style={styles.cardTopRow}>
          {/* Circular Profile Avatar (Real Photo with Initials Fallback) */}
          <MemberAvatar
            imageUrl={item.profile_image_url}
            name={playerName}
            size={64}
          />

          {/* Details Column */}
          <View style={styles.cardDetailsColumn}>
            {/* Row 1: Name + Member ID badge + Three-dot Menu */}
            <View style={styles.nameAndIdRow}>
              <AppText style={styles.playerName} numberOfLines={1}>
                {playerName}
              </AppText>
              <View style={styles.idAndMenuRow}>
                <View style={styles.idBadge}>
                  <AppText style={styles.idBadgeText}>{memberIdBadge}</AppText>
                </View>
                <TouchableOpacity
                  style={styles.moreMenuButton}
                  onPress={() => {
                    blurActiveElement();
                    setMenuPlayer(item);
                    setActionMenuVisible(true);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Member actions menu"
                >
                  <MoreVertical size={19} color="#475569" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Row 2: Email */}
            <AppText style={styles.playerEmail} numberOfLines={1}>
              {item.user_email}
            </AppText>

            {/* Row 3: Status Badge */}
            <View style={styles.statusRow}>
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
                  {item.status === 'active' ? 'Active' : item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                </AppText>
              </View>
            </View>
          </View>
        </View>

        {/* Subtle Horizontal Divider */}
        <View style={styles.cardDivider} />

        {/* Bottom Actions Row: [Edit Status] | [Message] */}
        <View style={styles.cardActionRow}>
          <TouchableOpacity
            style={styles.cardActionItem}
            onPress={() => handleOpenEditPlayer(item)}
            activeOpacity={0.7}
          >
            <SquarePen size={15} color="#123D38" strokeWidth={2} />
            <AppText style={styles.cardActionText}>Edit Status</AppText>
          </TouchableOpacity>

          <View style={styles.actionVerticalDivider} />

          <TouchableOpacity
            style={styles.cardActionItem}
            onPress={() => handleMessagePlayer(item)}
            activeOpacity={0.7}
          >
            <Mail size={15} color="#123D38" strokeWidth={2} />
            <AppText style={styles.cardActionText}>Message</AppText>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ─── Render Staff Card ───────────────────────────────────────────────────────

  const renderStaffItem = ({ item }: { item: ClubMember }) => {
    const staffName =
      item.user_full_name && item.user_full_name.trim().length > 0
        ? item.user_full_name.trim()
        : item.user_email
        ? item.user_email.split('@')[0]
        : 'Staff Member';

    const roleConfig = {
      club_owner: { label: 'Club Owner', bg: '#DEF2E6', text: '#176B57' },
      club_manager: { label: 'Club Manager', bg: '#E7F0FB', text: '#1D4ED8' },
      tournament_director: { label: 'Tournament Director', bg: '#F1EDFD', text: '#6D28D9' },
    }[item.role] || { label: item.role_label || item.role, bg: '#EAF0EC', text: '#102F2A' };

    return (
      <View style={styles.memberCard}>
        <View style={styles.cardTopRow}>
          <MemberAvatar
            imageUrl={item.profile_image_url}
            name={staffName}
            size={64}
          />

          <View style={styles.cardDetailsColumn}>
            <View style={styles.nameAndIdRow}>
              <AppText style={styles.playerName} numberOfLines={1}>
                {staffName}
              </AppText>
              <View style={[styles.roleBadge, { backgroundColor: roleConfig.bg }]}>
                <AppText style={[styles.roleBadgeText, { color: roleConfig.text }]}>
                  {roleConfig.label}
                </AppText>
              </View>
            </View>

            <AppText style={styles.playerEmail} numberOfLines={1}>
              {item.user_email}
            </AppText>

            <View style={styles.statusRow}>
              <View style={[styles.statusBadge, styles.statusBadgeActive]}>
                <View style={[styles.statusDot, styles.statusDotActive]} />
                <AppText style={[styles.statusBadgeText, styles.statusBadgeTextActive]}>
                  Active
                </AppText>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.cardActionRow}>
          {canManageRoles ? (
            <TouchableOpacity
              style={styles.cardActionItem}
              onPress={() => handleOpenEditStaff(item)}
              activeOpacity={0.7}
            >
              <SquarePen size={15} color="#123D38" strokeWidth={2} />
              <AppText style={styles.cardActionText}>Edit Role</AppText>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.cardActionItem}
              onPress={() => handleMessageStaff(item)}
              activeOpacity={0.7}
            >
              <Mail size={15} color="#123D38" strokeWidth={2} />
              <AppText style={styles.cardActionText}>Message</AppText>
            </TouchableOpacity>
          )}

          <View style={styles.actionVerticalDivider} />

          <TouchableOpacity
            style={styles.cardActionItem}
            onPress={() => handleMessageStaff(item)}
            activeOpacity={0.7}
          >
            <Mail size={15} color="#123D38" strokeWidth={2} />
            <AppText style={styles.cardActionText}>Message</AppText>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Screen style={styles.screenContainer} safeArea={false}>
      <StatusBar barStyle="dark-content" backgroundColor="#F0F8F2" />

      {/* Main Responsive List Container */}
      <View style={styles.screenInner}>
        {isLoading ? (
          <LoadingState message="Loading memberships..." />
        ) : activeTab === 'players' ? (
          <FlatList
            data={filteredPlayers}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={renderListHeader}
            contentContainerStyle={[
              styles.listContentContainer,
              { paddingBottom: insets.bottom + 110 },
            ]}
            renderItem={renderPlayerItem}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <EmptyState
                title="No Players Found"
                description={
                  playerSearchQuery.trim()
                    ? 'No players matched your search.'
                    : playerFilter === 'subscribers'
                    ? 'No players currently have active subscriptions.'
                    : playerFilter === 'normal'
                    ? 'No normal users currently registered.'
                    : 'Enroll your first club player to begin managing participation.'
                }
                actionLabel="+ Enroll Player"
                onAction={() => {
                  blurActiveElement();
                  setEnrollModalVisible(true);
                }}
              />
            }
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={onRefresh}
                tintColor="#176B57"
              />
            }
          />
        ) : (
          <FlatList
            data={filteredStaff}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={renderListHeader}
            contentContainerStyle={[
              styles.listContentContainer,
              { paddingBottom: insets.bottom + 110 },
            ]}
            renderItem={renderStaffItem}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <EmptyState
                title="No Staff Found"
                description="No staff members currently match your search criteria."
                actionLabel={canManageRoles ? '+ Add Staff' : undefined}
                onAction={
                  canManageRoles
                    ? () => {
                        blurActiveElement();
                        setAddStaffModalVisible(true);
                      }
                    : undefined
                }
              />
            }
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={onRefresh}
                tintColor="#176B57"
              />
            }
          />
        )}
      </View>

      {/* ─── Enroll Player Modal ──────────────────────────────────────────────── */}
      <Modal
        visible={enrollModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          blurActiveElement();
          setEnrollModalVisible(false);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            blurActiveElement();
            setEnrollModalVisible(false);
          }}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeaderRow}>
              <AppText style={styles.modalTitle}>Enroll New Player</AppText>
              <TouchableOpacity
                onPress={() => {
                  blurActiveElement();
                  setEnrollModalVisible(false);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#667776" />
              </TouchableOpacity>
            </View>

            <AppText style={styles.modalSubtitle}>
              Add an existing user as an enrolled player in this club.
            </AppText>

            {enrollError && (
              <View style={styles.modalErrorBox}>
                <AppText style={styles.modalErrorText}>{enrollError}</AppText>
              </View>
            )}

            <View style={styles.inputGroup}>
              <AppText style={styles.inputLabel}>User Email *</AppText>
              <TextInput
                style={styles.textInput}
                placeholder="player@example.com"
                placeholderTextColor="#94A3B8"
                value={newPlayerEmail}
                onChangeText={setNewPlayerEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <AppText style={styles.inputLabel}>Membership ID (Optional)</AppText>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. AUG-P-105"
                placeholderTextColor="#94A3B8"
                value={newPlayerNumber}
                onChangeText={setNewPlayerNumber}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.inputGroup}>
              <AppText style={styles.inputLabel}>Initial Status</AppText>
              <View style={styles.statusSelectRow}>
                {VALID_STATUSES.map((st) => (
                  <TouchableOpacity
                    key={st.status}
                    style={[
                      styles.statusSelectOption,
                      newPlayerStatus === st.status && styles.statusSelectOptionActive,
                    ]}
                    onPress={() => setNewPlayerStatus(st.status)}
                  >
                    <AppText
                      style={[
                        styles.statusSelectOptionText,
                        newPlayerStatus === st.status && styles.statusSelectOptionTextActive,
                      ]}
                    >
                      {st.label}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.modalActionButtons}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => {
                  blurActiveElement();
                  setEnrollModalVisible(false);
                }}
              >
                <AppText style={styles.cancelModalBtnText}>Cancel</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitModalBtn}
                onPress={handleEnrollPlayerSubmit}
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

      {/* ─── Add Staff Modal ─────────────────────────────────────────────────── */}
      <Modal
        visible={addStaffModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          blurActiveElement();
          setAddStaffModalVisible(false);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            blurActiveElement();
            setAddStaffModalVisible(false);
          }}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeaderRow}>
              <AppText style={styles.modalTitle}>Add Staff Member</AppText>
              <TouchableOpacity
                onPress={() => {
                  blurActiveElement();
                  setAddStaffModalVisible(false);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#667776" />
              </TouchableOpacity>
            </View>

            <AppText style={styles.modalSubtitle}>
              Grant administrative or management permissions for this facility.
            </AppText>

            {staffErrorState && (
              <View style={styles.modalErrorBox}>
                <AppText style={styles.modalErrorText}>{staffErrorState}</AppText>
              </View>
            )}

            <View style={styles.inputGroup}>
              <AppText style={styles.inputLabel}>Staff User Email *</AppText>
              <TextInput
                style={styles.textInput}
                placeholder="staff@example.com"
                placeholderTextColor="#94A3B8"
                value={newStaffEmail}
                onChangeText={setNewStaffEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <AppText style={styles.inputLabel}>Assign Role</AppText>
              {VALID_ROLES.map((r) => (
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

            <View style={styles.modalActionButtons}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => {
                  blurActiveElement();
                  setAddStaffModalVisible(false);
                }}
              >
                <AppText style={styles.cancelModalBtnText}>Cancel</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitModalBtn}
                onPress={handleAddStaffSubmit}
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

      {/* ─── Edit Player Status Modal ────────────────────────────────────────── */}
      <Modal
        visible={editPlayerModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          blurActiveElement();
          setEditPlayerModalVisible(false);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            blurActiveElement();
            setEditPlayerModalVisible(false);
          }}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeaderRow}>
              <AppText style={styles.modalTitle}>Edit Player Status</AppText>
              <TouchableOpacity
                onPress={() => {
                  blurActiveElement();
                  setEditPlayerModalVisible(false);
                }}
              >
                <X size={20} color="#667776" />
              </TouchableOpacity>
            </View>

            {selectedPlayer && (
              <AppText style={styles.modalSubtitle}>
                Updating status for {formatPlayerName(selectedPlayer)} ({selectedPlayer.user_email})
              </AppText>
            )}

            {editPlayerError && (
              <View style={styles.modalErrorBox}>
                <AppText style={styles.modalErrorText}>{editPlayerError}</AppText>
              </View>
            )}

            <View style={styles.inputGroup}>
              {VALID_STATUSES.map((st) => (
                <TouchableOpacity
                  key={st.status}
                  style={[
                    styles.roleSelectOption,
                    selectedPlayerStatus === st.status && styles.roleSelectOptionActive,
                  ]}
                  onPress={() => setSelectedPlayerStatus(st.status)}
                >
                  <AppText
                    style={[
                      styles.roleSelectOptionText,
                      selectedPlayerStatus === st.status && styles.roleSelectOptionTextActive,
                    ]}
                  >
                    {st.label}
                  </AppText>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActionButtons}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => {
                  blurActiveElement();
                  setEditPlayerModalVisible(false);
                }}
              >
                <AppText style={styles.cancelModalBtnText}>Cancel</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitModalBtn}
                onPress={handleUpdatePlayerStatusSubmit}
                disabled={isUpdatingPlayerMember}
              >
                <AppText style={styles.submitModalBtnText}>
                  {isUpdatingPlayerMember ? 'Saving...' : 'Save Status'}
                </AppText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Edit Staff Role Modal ───────────────────────────────────────────── */}
      <Modal
        visible={editStaffModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          blurActiveElement();
          setEditStaffModalVisible(false);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            blurActiveElement();
            setEditStaffModalVisible(false);
          }}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeaderRow}>
              <AppText style={styles.modalTitle}>Edit Staff Role</AppText>
              <TouchableOpacity
                onPress={() => {
                  blurActiveElement();
                  setEditStaffModalVisible(false);
                }}
              >
                <X size={20} color="#667776" />
              </TouchableOpacity>
            </View>

            {selectedStaff && (
              <AppText style={styles.modalSubtitle}>
                Updating role for {selectedStaff.user_full_name || selectedStaff.user_email}
              </AppText>
            )}

            {editStaffError && (
              <View style={styles.modalErrorBox}>
                <AppText style={styles.modalErrorText}>{editStaffError}</AppText>
              </View>
            )}

            <View style={styles.inputGroup}>
              {VALID_ROLES.map((r) => (
                <TouchableOpacity
                  key={r.role}
                  style={[
                    styles.roleSelectOption,
                    selectedStaffRole === r.role && styles.roleSelectOptionActive,
                  ]}
                  onPress={() => setSelectedStaffRole(r.role)}
                >
                  <AppText
                    style={[
                      styles.roleSelectOptionText,
                      selectedStaffRole === r.role && styles.roleSelectOptionTextActive,
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
                onPress={() => {
                  blurActiveElement();
                  setEditStaffModalVisible(false);
                }}
              >
                <AppText style={styles.cancelModalBtnText}>Cancel</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitModalBtn}
                onPress={handleUpdateStaffRoleSubmit}
                disabled={isUpdatingMember}
              >
                <AppText style={styles.submitModalBtnText}>
                  {isUpdatingMember ? 'Saving...' : 'Save Role'}
                </AppText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Filter & Membership Plan Tiers Modal ────────────────────────────── */}
      <Modal
        visible={filterInfoVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          blurActiveElement();
          setFilterInfoVisible(false);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            blurActiveElement();
            setFilterInfoVisible(false);
          }}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeaderRow}>
              <AppText style={styles.modalTitle}>Membership Filters & Plans</AppText>
              <TouchableOpacity
                onPress={() => {
                  blurActiveElement();
                  setFilterInfoVisible(false);
                }}
              >
                <X size={20} color="#667776" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              <AppText style={styles.sectionHeadingModal}>Player Classifications</AppText>

              <View style={styles.filterExplainerItem}>
                <AppText style={styles.filterExplainerTitle}>• All Players ({filteredPlayers.length})</AppText>
                <AppText style={styles.filterExplainerBody}>
                  Displays all enrolled player accounts registered to play at this facility.
                </AppText>
              </View>

              <View style={styles.filterExplainerItem}>
                <AppText style={styles.filterExplainerTitle}>• Subscribers</AppText>
                <AppText style={styles.filterExplainerBody}>
                  Active paid membership subscribers enrolled in recurring club plans.
                </AppText>
              </View>

              <View style={styles.filterExplainerItem}>
                <AppText style={styles.filterExplainerTitle}>• Normal Users</AppText>
                <AppText style={styles.filterExplainerBody}>
                  Enrolled players participating on standard pay-per-booking rates.
                </AppText>
              </View>

              <View style={styles.dividerModal} />

              <AppText style={styles.sectionHeadingModal}>Active Membership Plans ({membershipPlans.length})</AppText>
              {membershipPlans.length === 0 ? (
                <AppText style={styles.filterExplainerBody}>No plans created yet.</AppText>
              ) : (
                membershipPlans.map((plan) => (
                  <View key={plan.id} style={styles.planOverviewRow}>
                    <View style={{ flex: 1 }}>
                      <AppText style={styles.planOverviewName}>{plan.name}</AppText>
                      <AppText style={styles.planOverviewMeta}>
                        {formatCurrency(plan.price, plan.currency || 'USD')} / {plan.duration_unit}
                      </AppText>
                    </View>
                    <View style={styles.statusBadgeActive}>
                      <AppText style={styles.statusBadgeTextActive}>Active Plan</AppText>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.submitModalBtn, { marginTop: 16 }]}
              onPress={() => {
                blurActiveElement();
                setFilterInfoVisible(false);
              }}
            >
              <AppText style={styles.submitModalBtnText}>Done</AppText>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Member Card Three-Dot Action Sheet ─────────────────────────────── */}
      <Modal
        visible={actionMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          blurActiveElement();
          setActionMenuVisible(false);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            blurActiveElement();
            setActionMenuVisible(false);
          }}
        >
          <Pressable style={styles.menuSheetContent} onPress={(e) => e.stopPropagation()}>
            {menuPlayer && (
              <>
                <View style={styles.menuSheetHeader}>
                  <AppText style={styles.menuSheetTitle}>{formatPlayerName(menuPlayer)}</AppText>
                  <AppText style={styles.menuSheetSubtitle}>{menuPlayer.user_email}</AppText>
                </View>

                <TouchableOpacity
                  style={styles.menuSheetOption}
                  onPress={() => {
                    setActionMenuVisible(false);
                    handleOpenEditPlayer(menuPlayer);
                  }}
                >
                  <SquarePen size={18} color="#123D38" />
                  <AppText style={styles.menuSheetOptionText}>Edit Membership Status</AppText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuSheetOption}
                  onPress={() => {
                    setActionMenuVisible(false);
                    handleMessagePlayer(menuPlayer);
                  }}
                >
                  <Mail size={18} color="#123D38" />
                  <AppText style={styles.menuSheetOptionText}>Send Message / Email</AppText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.menuSheetOption}
                  onPress={() => {
                    setActionMenuVisible(false);
                    Alert.alert(
                      'Member Details',
                      `Name: ${formatPlayerName(menuPlayer)}\nEmail: ${menuPlayer.user_email}\nStatus: ${menuPlayer.status}\nJoined: ${new Date(menuPlayer.joined_at).toLocaleDateString()}`
                    );
                  }}
                >
                  <UserCheck size={18} color="#123D38" />
                  <AppText style={styles.menuSheetOptionText}>View Profile Details</AppText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.menuSheetOption, { borderBottomWidth: 0 }]}
                  onPress={() => {
                    setActionMenuVisible(false);
                  }}
                >
                  <X size={18} color="#667776" />
                  <AppText style={[styles.menuSheetOptionText, { color: '#667776' }]}>Cancel</AppText>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Send Message / Notice Modal ────────────────────────────────────── */}
      <Modal
        visible={messageModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          blurActiveElement();
          setMessageModalVisible(false);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            blurActiveElement();
            setMessageModalVisible(false);
          }}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeaderRow}>
              <AppText style={styles.modalTitle}>Message Member</AppText>
              <TouchableOpacity
                onPress={() => {
                  blurActiveElement();
                  setMessageModalVisible(false);
                }}
              >
                <X size={20} color="#667776" />
              </TouchableOpacity>
            </View>

            {messageTarget && (
              <AppText style={styles.modalSubtitle}>
                To: {messageTarget.name} ({messageTarget.email})
              </AppText>
            )}

            <View style={styles.inputGroup}>
              <AppText style={styles.inputLabel}>Subject</AppText>
              <TextInput
                style={styles.textInput}
                value={messageSubject}
                onChangeText={setMessageSubject}
              />
            </View>

            <View style={styles.inputGroup}>
              <AppText style={styles.inputLabel}>Message</AppText>
              <TextInput
                style={[styles.textInput, { height: 100, textAlignVertical: 'top', paddingTop: 10 }]}
                value={messageBody}
                onChangeText={setMessageBody}
                multiline
              />
            </View>

            <View style={styles.modalActionButtons}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => {
                  blurActiveElement();
                  setMessageModalVisible(false);
                }}
              >
                <AppText style={styles.cancelModalBtnText}>Cancel</AppText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitModalBtn} onPress={handleSendEmail}>
                <AppText style={styles.submitModalBtnText}>Send via Email</AppText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

// ─── Stylesheet (Exact Match to Modern Memberships Dashboard Reference) ─────────

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#F0F8F2',
  },
  screenInner: {
    flex: 1,
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
  },
  listContentContainer: {
    paddingBottom: 110, // Generous padding to clear fixed AppBottomNav
  },

  // ─── Header & Decorative Sports Background ──────────────────────────────────
  headerBlock: {
    marginBottom: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  customHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 6,
    position: 'relative',
  },
  hamburgerButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  headerTitleContainer: {
    flex: 1,
    zIndex: 2,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#123D38',
    letterSpacing: -0.4,
    lineHeight: 32,
  },
  pageSubtitle: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#667776',
    marginTop: 3,
    lineHeight: 18,
  },

  // Top-Right Sports Graphic
  decorativeBgContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 140,
    height: 120,
    overflow: 'hidden',
    zIndex: 1,
  },
  decorativeOuterCircle: {
    position: 'absolute',
    top: -50,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(196, 234, 211, 0.45)',
  },
  decorativeInnerCircle: {
    position: 'absolute',
    top: -25,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(54, 158, 119, 0.35)',
  },
  decorativeBall: {
    position: 'absolute',
    top: 26,
    right: 14,
    width: 44,
    height: 44,
  },

  // ─── Main Action Row: [ Players ] [ Staff ] [ + Enroll ] ─────────────────────
  mainActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 16,
    marginTop: 18,
    marginBottom: 14,
  },
  mainActionBtn: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DFE7E3',
    borderRadius: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  mainActionBtnActive: {
    backgroundColor: '#0E5E54',
    borderColor: '#0E5E54',
  },
  mainActionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#123D38',
  },
  mainActionBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  mainActionBtnSecondary: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DFE7E3',
    borderRadius: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  mainActionBtnSecondaryText: {
    color: '#123D38',
    fontSize: 14,
    fontWeight: '600',
  },

  // ─── Filter Pills Row: [ All Players ] [ Subscribers ] [ Normal Users ] [ 🎛️ ] ──
  filterPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  filterPill: {
    paddingVertical: 7.5,
    paddingHorizontal: 15,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DFE7E3',
  },
  filterPillActive: {
    backgroundColor: '#0E5E54',
    borderColor: '#0E5E54',
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  filterIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DFE7E3',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },

  // ─── Search Container ────────────────────────────────────────────────────────
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2EAE5',
    marginHorizontal: 16,
    marginBottom: 14,
    paddingHorizontal: 14,
    height: 48,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  searchIcon: {
    marginRight: 9,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#123D38',
    height: '100%',
    paddingVertical: 0,
  },

  // ─── Staff Controls ──────────────────────────────────────────────────────────
  staffControlsContainer: {
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  staffSearchAndAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  staffSearchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2EAE5',
    paddingHorizontal: 12,
    height: 46,
  },
  addStaffBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0E5E54',
    paddingHorizontal: 15,
    height: 46,
    borderRadius: 14,
    justifyContent: 'center',
  },
  addStaffBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },

  // ─── Member Card ─────────────────────────────────────────────────────────────
  memberCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2EAE5',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },

  // Avatar
  avatarContainer: {
    overflow: 'hidden',
    backgroundColor: '#DEF2E6',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D4E8DD',
  },
  avatarInitialsText: {
    fontWeight: '700',
    color: '#0E5E54',
    letterSpacing: 0.5,
  },

  // Card Details Column
  cardDetailsColumn: {
    flex: 1,
  },
  nameAndIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  playerName: {
    fontSize: 17.5,
    fontWeight: '700',
    color: '#123D38',
    flex: 1,
    letterSpacing: -0.2,
  },
  idAndMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  idBadge: {
    backgroundColor: '#EDF2EF',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 12,
  },
  idBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#5A6B65',
    letterSpacing: 0.2,
  },
  moreMenuButton: {
    padding: 2,
    marginLeft: 2,
  },
  playerEmail: {
    fontSize: 13.5,
    color: '#71828A',
    marginTop: 2,
  },

  // Status Badge
  statusRow: {
    marginTop: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 12,
    backgroundColor: '#EDF2EF',
  },
  statusBadgeActive: {
    backgroundColor: '#DEF2E6',
  },
  statusBadgeWarning: {
    backgroundColor: '#FFF4E5',
  },
  statusBadgeDanger: {
    backgroundColor: '#FDE8E8',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#667776',
  },
  statusDotActive: {
    backgroundColor: '#107548',
  },
  statusDotWarning: {
    backgroundColor: '#D97706',
  },
  statusDotDanger: {
    backgroundColor: '#DC2626',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#667776',
  },
  statusBadgeTextActive: {
    color: '#107548',
  },
  statusBadgeTextWarning: {
    color: '#D97706',
  },
  statusBadgeTextDanger: {
    color: '#DC2626',
  },

  // Role Badge (Staff)
  roleBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 10,
  },
  roleBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
  },

  // Card Divider & Actions
  cardDivider: {
    height: 1,
    backgroundColor: '#F0F4F2',
    marginTop: 14,
    marginBottom: 6,
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardActionItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 6,
  },
  cardActionText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#123D38',
  },
  actionVerticalDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#E2EAE5',
  },

  // ─── Modal Styles ────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    maxHeight: '90%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#102F2A',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#667776',
    marginBottom: 16,
    lineHeight: 18,
  },
  modalErrorBox: {
    backgroundColor: '#FEE2E2',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  modalErrorText: {
    color: '#B91C1C',
    fontSize: 12.5,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#102F2A',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#D4E5DE',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: '#102F2A',
  },
  statusSelectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
    backgroundColor: '#0E5E54',
    borderColor: '#0E5E54',
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
    backgroundColor: '#DEF2E6',
    borderColor: '#0E5E54',
  },
  roleSelectOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#102F2A',
  },
  roleSelectOptionTextActive: {
    color: '#0E5E54',
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
    backgroundColor: '#0E5E54',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitModalBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Filter Explainer & Plan Overview in Modal
  sectionHeadingModal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102F2A',
    marginBottom: 8,
    marginTop: 4,
  },
  filterExplainerItem: {
    marginBottom: 10,
  },
  filterExplainerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102F2A',
    marginBottom: 2,
  },
  filterExplainerBody: {
    fontSize: 12.5,
    color: '#667776',
    lineHeight: 17,
  },
  dividerModal: {
    height: 1,
    backgroundColor: '#E2EAE5',
    marginVertical: 12,
  },
  planOverviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  planOverviewName: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#102F2A',
  },
  planOverviewMeta: {
    fontSize: 12,
    color: '#667776',
    marginTop: 1,
  },

  // Action Menu Sheet
  menuSheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  menuSheetHeader: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  menuSheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102F2A',
  },
  menuSheetSubtitle: {
    fontSize: 12.5,
    color: '#667776',
    marginTop: 2,
  },
  menuSheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  menuSheetOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#102F2A',
  },
});
