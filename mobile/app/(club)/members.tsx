/**
 * Aught2 Pickleball — Club Members Management Screen
 *
 * Exact visual match to reference design:
 * - Pale mint/green page background with deep pine teal accents
 * - Header: Hamburger menu icon, "Members" title, and subtitle "Manage staff roles and enrolled players"
 * - 3-button Action Area: [ Players ] [ Staff ] [ + Enroll ]
 * - Filter Pills: All Players, Subscribers, Normal Users + Filter settings button
 * - Full-width search bar: "Search players by name or email..."
 * - Member cards: Circular avatar (real profile photo with initials fallback, no screenshot crops),
 *   bold name, muted email, #AUG-P-xxx ID badge, green dot ACTIVE pill, subtle divider,
 *   [Edit Status] | [Message] action buttons
 * - Staff view: Dedicated view with search, + Add Staff, role-badged cards (Owner, Manager, Tournament Director)
 * - Strict separation between Players and Staff (both backend & frontend enforced)
 * - Real API queries, mutations, permissions, tenant isolation, and error handling preserved
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Check,
  Edit3,
  Mail,
  Menu,
  MoreVertical,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  SquarePen,
  Trash2,
  User,
  UserCheck,
  Users,
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
import { useDrawerStore } from '@/navigation';
import {
  useActiveClub,
  useClubMembers,
  useClubPlayerMembers,
  useClubSubscriptions,
  usePermission,
} from '@/hooks';
import { blurActiveElement } from '@/utils';
import type {
  ClubMember,
  ClubPlayerMember,
  ClubRole,
  CustomRole,
  PlayerMembershipStatus,
} from '@/types';

// ─── Avatar Component with Real Photo & Initials Fallback ─────────────────────

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

    if (
      cleanUrl.startsWith('http://') ||
      cleanUrl.startsWith('https://') ||
      cleanUrl.startsWith('data:image/')
    ) {
      return cleanUrl;
    }
    const path = cleanUrl.startsWith('/') ? cleanUrl : `/${cleanUrl}`;
    return `${API_ENDPOINTS.BASE}${path}`;
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
          { fontSize: Math.round(size * 0.34) },
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
  { role: 'staff_member', label: 'Staff Member' },
  { role: 'club_manager', label: 'Club Manager' },
  { role: 'tournament_director', label: 'Tournament Director' },
];

const VALID_STATUSES: { status: PlayerMembershipStatus; label: string }[] = [
  { status: 'active', label: 'Active' },
  { status: 'inactive', label: 'Inactive' },
  { status: 'suspended', label: 'Suspended' },
  { status: 'expired', label: 'Expired' },
];

const PERMISSION_GROUPS = [
  {
    category: 'Club Operations',
    permissions: [
      { key: 'manage_members', label: 'Members & Staff', description: 'View and manage enrolled players & staff' },
      { key: 'manage_memberships', label: 'Membership Plans', description: 'Configure membership plans and subscriptions' },
      { key: 'manage_bookings', label: 'Court Bookings', description: 'Create, edit, and cancel court reservations' },
      { key: 'manage_courts', label: 'Courts & Facilities', description: 'Configure court settings, availability, and status' },
      { key: 'manage_reports', label: 'Reports & Analytics', description: 'Access club operational and financial reports' },
    ],
  },
  {
    category: 'Activities & Competitions',
    permissions: [
      { key: 'manage_tournaments', label: 'Tournaments', description: 'Create and organize tournament draws and brackets' },
      { key: 'manage_leagues', label: 'Leagues', description: 'Run league seasons, divisions, and rounds' },
      { key: 'manage_events', label: 'Events & Open Plays', description: 'Schedule and manage club social events' },
      { key: 'manage_lessons', label: 'Lessons & Clinics', description: 'Manage coaches, private lessons, and clinics' },
      { key: 'manage_schedules', label: 'Schedules', description: 'Configure schedules and timeslot rules' },
      { key: 'manage_scores', label: 'Scores & Results', description: 'Enter match scores and update standings' },
      { key: 'manage_teams', label: 'Teams & Rosters', description: 'Organize competition teams and player rosters' },
    ],
  },
  {
    category: 'Financial Operations',
    permissions: [
      { key: 'manage_payments', label: 'Payments & Billing', description: 'Process payments, view charges and receipts' },
    ],
  },
  {
    category: 'Club Configuration',
    permissions: [
      { key: 'manage_club', label: 'Club Profile & Hours', description: 'Update facility profile, contact, and hours' },
      { key: 'manage_settings', label: 'Club Settings', description: 'Configure general club preferences' },
    ],
  },
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

export default function ClubMembersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const insets = useSafeAreaInsets();
  const openDrawer = useDrawerStore((s) => s.openDrawer);
  const { clubId } = useActiveClub();
  const { canManageMembers, canManageRoles } = usePermission();

  const [activeTab, setActiveTab] = useState<'players' | 'staff'>(() => {
    return params.tab === 'staff' ? 'staff' : 'players';
  });

  // Synchronize activeTab with URL query param (handles deep linking, drawer navigation, refresh)
  useEffect(() => {
    if (params.tab === 'staff' && activeTab !== 'staff') {
      setActiveTab('staff');
    } else if (params.tab === 'players' && activeTab !== 'players') {
      setActiveTab('players');
    }
  }, [params.tab]);

  const handleTabChange = (newTab: 'players' | 'staff') => {
    setActiveTab(newTab);
    router.setParams({ tab: newTab });
  };
  const [playerFilter, setPlayerFilter] = useState<PlayerFilterType>('all');
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [staffSearchQuery, setStaffSearchQuery] = useState('');

  // ─── Data Queries ────────────────────────────────────────────────────────────

  // Staff members query (strictly staff with club roles)
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
    customRoles = [],
    createCustomRole,
    isCreatingRole,
    updateCustomRole,
    isUpdatingRole,
    deleteCustomRole,
    isDeletingRole,
  } = useClubMembers(clubId);

  // Player members query
  const {
    playerMembers = [],
    isLoading: isPlayersLoading,
    isRefetching: isPlayersRefetching,
    error: playersError,
    refetch: refetchPlayers,
    updatePlayerMember,
    isUpdatingPlayerMember,
  } = useClubPlayerMembers(clubId);

  // Subscriptions query (for subscriber identification)
  const { data: subscriptions = [] } = useClubSubscriptions(clubId || '');

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
  const [selectedRoleChoice, setSelectedRoleChoice] = useState<
    { type: 'builtin'; role: ClubRole } | { type: 'custom'; roleId: string }
  >({ type: 'builtin', role: 'staff_member' });
  const [staffActionError, setStaffActionError] = useState<string | null>(null);

  // Manage Roles Modal
  const [manageRolesModalVisible, setManageRolesModalVisible] = useState(false);

  // Create / Edit Custom Role Modal
  const [roleFormModalVisible, setRoleFormModalVisible] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [roleFormName, setRoleFormName] = useState('');
  const [roleFormDescription, setRoleFormDescription] = useState('');
  const [roleFormPermissions, setRoleFormPermissions] = useState<Set<string>>(new Set());
  const [roleFormError, setRoleFormError] = useState<string | null>(null);
  const [roleFormReturnToAddStaff, setRoleFormReturnToAddStaff] = useState(false);

  // Reassign & Delete Role Modal
  const [deleteRoleReassignModalVisible, setDeleteRoleReassignModalVisible] = useState(false);
  const [selectedRoleForDeletion, setSelectedRoleForDeletion] = useState<CustomRole | null>(null);
  const [reassignTargetRoleId, setReassignTargetRoleId] = useState<string | null>(null);

  // Role Edit Modal (Staff member role modification)
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [selectedStaffMember, setSelectedStaffMember] = useState<ClubMember | null>(null);
  const [staffEditRoleChoice, setStaffEditRoleChoice] = useState<
    { type: 'builtin'; role: ClubRole } | { type: 'custom'; roleId: string }
  >({ type: 'builtin', role: 'staff_member' });

  // Filter settings info modal
  const [filterInfoVisible, setFilterInfoVisible] = useState(false);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleOpenEditPlayer = (player: ClubPlayerMember) => {
    blurActiveElement();
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
      blurActiveElement();
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

  const handleMessageStaff = (staff: ClubMember) => {
    if (staff.user_email) {
      Linking.openURL(`mailto:${staff.user_email}`);
    } else {
      Alert.alert('Message Staff', 'No email address registered for this staff member.');
    }
  };

  const handlePlayerMenu = (player: ClubPlayerMember) => {
    blurActiveElement();
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

  const handleStaffMenu = (member: ClubMember) => {
    blurActiveElement();
    const formattedName = member.user_full_name || member.user_email.split('@')[0];
    const displayRole = member.custom_role_name || member.role_label || member.role;
    Alert.alert(
      formattedName,
      `Email: ${member.user_email}\nRole: ${displayRole}\nStatus: ${member.is_active ? 'ACTIVE' : 'DISABLED'}`,
      [
        { text: 'Edit Role', onPress: () => handleOpenEditRole(member) },
        { text: 'Send Message', onPress: () => handleMessageStaff(member) },
        {
          text: member.is_active ? 'Disable Access' : 'Enable Access',
          style: member.is_active ? 'destructive' : 'default',
          onPress: () => handleToggleStaffActive(member),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleOpenCreateRoleFromAddStaff = () => {
    blurActiveElement();
    setEditingRole(null);
    setRoleFormName('');
    setRoleFormDescription('');
    setRoleFormPermissions(new Set());
    setRoleFormError(null);
    setRoleFormReturnToAddStaff(true);
    setRoleFormModalVisible(true);
  };

  const handleOpenCreateRoleFromManager = () => {
    blurActiveElement();
    setEditingRole(null);
    setRoleFormName('');
    setRoleFormDescription('');
    setRoleFormPermissions(new Set());
    setRoleFormError(null);
    setRoleFormReturnToAddStaff(false);
    setRoleFormModalVisible(true);
  };

  const handleOpenEditCustomRole = (role: CustomRole) => {
    blurActiveElement();
    setEditingRole(role);
    setRoleFormName(role.name);
    setRoleFormDescription(role.description || '');
    setRoleFormPermissions(new Set(role.permissions || []));
    setRoleFormError(null);
    setRoleFormReturnToAddStaff(false);
    setRoleFormModalVisible(true);
  };

  const handleSaveRoleForm = async () => {
    setRoleFormError(null);
    const trimmed = roleFormName.trim();
    if (!trimmed) {
      setRoleFormError('Role name is required.');
      return;
    }
    try {
      if (editingRole) {
        await updateCustomRole({
          roleId: editingRole.id,
          payload: {
            name: trimmed,
            description: roleFormDescription.trim() || null,
            permissions: Array.from(roleFormPermissions),
          },
        });
        blurActiveElement();
        setRoleFormModalVisible(false);
        setEditingRole(null);
      } else {
        const created = await createCustomRole({
          name: trimmed,
          description: roleFormDescription.trim() || null,
          permissions: Array.from(roleFormPermissions),
        });
        blurActiveElement();
        setRoleFormModalVisible(false);
        if (roleFormReturnToAddStaff) {
          setSelectedRoleChoice({ type: 'custom', roleId: created.id });
          setRoleFormReturnToAddStaff(false);
        }
      }
    } catch (err: unknown) {
      setRoleFormError(err instanceof Error ? err.message : 'Failed to save role');
    }
  };

  const handleDeleteCustomRole = (role: CustomRole) => {
    blurActiveElement();
    if (role.staff_count > 0) {
      setSelectedRoleForDeletion(role);
      const otherRoles = customRoles.filter((r) => r.id !== role.id);
      setReassignTargetRoleId(otherRoles.length > 0 ? otherRoles[0].id : null);
      setDeleteRoleReassignModalVisible(true);
    } else {
      Alert.alert(
        'Delete Custom Role',
        `Are you sure you want to delete the role "${role.name}"? This action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteCustomRole({ roleId: role.id });
              } catch (err: unknown) {
                Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete role');
              }
            },
          },
        ]
      );
    }
  };

  const handleConfirmReassignAndDelete = async () => {
    if (!selectedRoleForDeletion) return;
    if (!reassignTargetRoleId) {
      Alert.alert('Reassignment Target Required', 'Please select a replacement custom role for assigned staff.');
      return;
    }
    try {
      await deleteCustomRole({
        roleId: selectedRoleForDeletion.id,
        reassignToRoleId: reassignTargetRoleId,
      });
      blurActiveElement();
      setDeleteRoleReassignModalVisible(false);
      setSelectedRoleForDeletion(null);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete role');
    }
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
      if (selectedRoleChoice.type === 'custom' && selectedRoleChoice.roleId) {
        await addMember({
          email: newStaffEmail.trim(),
          role: 'staff_member',
          custom_role_id: selectedRoleChoice.roleId,
          full_name: newStaffName.trim(),
          temporary_password: newStaffPassword.trim() || undefined,
        });
      } else {
        await addMember({
          email: newStaffEmail.trim(),
          role: selectedRoleChoice.type === 'builtin' ? selectedRoleChoice.role : 'staff_member',
          full_name: newStaffName.trim(),
          temporary_password: newStaffPassword.trim() || undefined,
        });
      }
      blurActiveElement();
      setAddStaffModalVisible(false);
      setNewStaffEmail('');
      setNewStaffName('');
      setNewStaffPassword('');
      setSelectedRoleChoice({ type: 'builtin', role: 'staff_member' });
    } catch (err: unknown) {
      setStaffActionError(err instanceof Error ? err.message : 'Failed to add staff member');
    }
  };

  const handleOpenEditRole = (member: ClubMember) => {
    blurActiveElement();
    setSelectedStaffMember(member);
    if (member.custom_role_id) {
      setStaffEditRoleChoice({ type: 'custom', roleId: member.custom_role_id });
    } else {
      setStaffEditRoleChoice({ type: 'builtin', role: member.role });
    }
    setRoleModalVisible(true);
  };

  const handleSaveRole = async () => {
    if (!selectedStaffMember) return;
    try {
      if (staffEditRoleChoice.type === 'custom') {
        await updateMember({
          membershipId: selectedStaffMember.id,
          payload: {
            role: 'staff_member',
            custom_role_id: staffEditRoleChoice.roleId,
          },
        });
      } else {
        await updateMember({
          membershipId: selectedStaffMember.id,
          payload: {
            role: staffEditRoleChoice.role,
            clear_custom_role: true,
          },
        });
      }
      blurActiveElement();
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
        <StatusBar barStyle="dark-content" backgroundColor="#F2F8F5" />
        <AppHeader title="Members" subtitle="Manage staff roles and club members" borderless />
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
        <StatusBar barStyle="dark-content" backgroundColor="#F2F8F5" />
        <AppHeader title="Members" subtitle="Manage staff roles and club members" borderless />
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
      {/* 1. Main Action Buttons: [ Players ] [ Staff ] */}
      <View style={styles.mainActionsRow}>
        <TouchableOpacity
          style={[styles.mainActionBtn, activeTab === 'players' && styles.mainActionBtnActive]}
          onPress={() => handleTabChange('players')}
          activeOpacity={0.8}
        >
          <Users
            size={15}
            color={activeTab === 'players' ? '#FFFFFF' : '#102F2A'}
            strokeWidth={2}
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

        <TouchableOpacity
          style={[styles.mainActionBtn, activeTab === 'staff' && styles.mainActionBtnActive]}
          onPress={() => handleTabChange('staff')}
          activeOpacity={0.8}
        >
          <User
            size={15}
            color={activeTab === 'staff' ? '#FFFFFF' : '#102F2A'}
            strokeWidth={2}
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
      </View>

      {/* 3. Section Controls (Players vs Staff) */}
      {activeTab === 'players' ? (
        <>
          {/* Sub-Filters: All Players, Subscribers, Normal Users + Settings Button */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterPillsScrollContent}
            style={styles.filterScrollView}
          >
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

            <TouchableOpacity
              style={styles.filterIconButton}
              onPress={() => {
                blurActiveElement();
                setFilterInfoVisible(true);
              }}
              activeOpacity={0.7}
              accessibilityLabel="Filter settings"
            >
              <SlidersHorizontal size={15} color="#102F2A" strokeWidth={2} />
            </TouchableOpacity>
          </ScrollView>

          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <Search size={18} color="#718096" strokeWidth={2} style={styles.searchIcon} />
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
                <X size={16} color="#718096" />
              </TouchableOpacity>
            )}
          </View>
        </>
      ) : (
        /* Staff Controls */
        <View style={styles.staffControlsContainer}>
          <View style={styles.staffSearchAndAddRow}>
            <View style={styles.staffSearchBox}>
              <Search size={18} color="#718096" strokeWidth={2} style={styles.searchIcon} />
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
                  <X size={16} color="#718096" />
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
                accessibilityLabel="Add Staff"
                accessibilityRole="button"
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

    const playerId = item.membership_number
      ? `#${item.membership_number.replace(/^#/, '')}`
      : '—';

    return (
      <View style={styles.memberCard}>
        {/* Top Profile Information Area */}
        <View style={styles.cardTopRow}>
          {/* Avatar on Left */}
          <MemberAvatar
            imageUrl={item.profile_image_url}
            name={playerName}
            size={64}
          />

          {/* Details Column on Right */}
          <View style={styles.cardDetailsColumn}>
            {/* Row 1: Name, ID Badge, Three-dot Menu */}
            <View style={styles.nameAndIdRow}>
              <AppText style={styles.playerName} numberOfLines={1}>
                {playerName}
              </AppText>
              <View style={styles.badgeAndMenuRow}>
                <View style={styles.idBadge}>
                  <AppText style={styles.idBadgeText}>{playerId}</AppText>
                </View>
                <TouchableOpacity
                  onPress={() => handlePlayerMenu(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.threeDotBtn}
                  accessibilityLabel="Player actions"
                >
                  <MoreVertical size={18} color="#647570" strokeWidth={2} />
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
                  {item.status.toUpperCase()}
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
            <SquarePen size={15} color="#102F2A" strokeWidth={1.9} />
            <AppText style={styles.cardActionText}>Edit Status</AppText>
          </TouchableOpacity>

          <View style={styles.actionVerticalDivider} />

          <TouchableOpacity
            style={styles.cardActionItem}
            onPress={() => handleMessagePlayer(item)}
            activeOpacity={0.7}
          >
            <Mail size={15} color="#102F2A" strokeWidth={1.9} />
            <AppText style={styles.cardActionText}>Message</AppText>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ─── Render Staff Card ───────────────────────────────────────────────────────

  const renderStaffItem = ({ item }: { item: ClubMember; index: number }) => {
    const staffName = item.user_full_name && item.user_full_name.trim().length > 0
      ? item.user_full_name.trim()
      : item.user_email
        ? item.user_email.split('@')[0].replace(/[._-]+/g, ' ').split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        : 'Staff Member';

    const isCustomRole = Boolean(item.custom_role_name);
    const roleConfig = isCustomRole
      ? { label: item.custom_role_name!, bg: '#E6F4EA', text: '#0D5F4D' }
      : {
          club_owner: { label: 'Club Owner', bg: '#DEF2E6', text: '#176B57' },
          staff_member: { label: 'Staff Member', bg: '#F1F5F9', text: '#475569' },
          club_manager: { label: 'Club Manager', bg: '#E7F0FB', text: '#1D4ED8' },
          tournament_director: { label: 'Tournament Director', bg: '#F1EDFD', text: '#6D28D9' },
        }[item.role] || { label: item.role_label || item.role, bg: '#EAF0EC', text: '#102F2A' };

    return (
      <View style={styles.memberCard}>
        {/* Top Information Area */}
        <View style={styles.cardTopRow}>
          <MemberAvatar
            imageUrl={item.profile_image_url}
            name={staffName}
            size={64}
          />

          <View style={styles.cardDetailsColumn}>
            {/* Row 1: Name, Role Badge, Three-dot Menu */}
            <View style={styles.nameAndIdRow}>
              <AppText style={styles.playerName} numberOfLines={1}>
                {staffName}
              </AppText>
              <View style={styles.badgeAndMenuRow}>
                <View style={[styles.roleBadge, { backgroundColor: roleConfig.bg }]}>
                  {isCustomRole && (
                    <Shield size={11} color="#0D5F4D" strokeWidth={2.2} style={{ marginRight: 3 }} />
                  )}
                  <AppText style={[styles.roleBadgeText, { color: roleConfig.text }]}>
                    {roleConfig.label}
                  </AppText>
                </View>
                <TouchableOpacity
                  onPress={() => handleStaffMenu(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.threeDotBtn}
                  accessibilityLabel="Staff actions"
                >
                  <MoreVertical size={18} color="#647570" strokeWidth={2} />
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

        {/* Subtle Horizontal Divider */}
        <View style={styles.cardDivider} />

        {/* Bottom Actions Row */}
        <View style={styles.cardActionRow}>
          {canManageRoles ? (
            <TouchableOpacity
              style={styles.cardActionItem}
              onPress={() => handleOpenEditRole(item)}
              activeOpacity={0.7}
            >
              <SquarePen size={15} color="#102F2A" strokeWidth={1.9} />
              <AppText style={styles.cardActionText}>Edit Role</AppText>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.cardActionItem}
              onPress={() => handleMessageStaff(item)}
              activeOpacity={0.7}
            >
              <Mail size={15} color="#102F2A" strokeWidth={1.9} />
              <AppText style={styles.cardActionText}>Message</AppText>
            </TouchableOpacity>
          )}

          <View style={styles.actionVerticalDivider} />

          {canManageRoles && item.role !== 'club_owner' ? (
            <TouchableOpacity
              style={styles.cardActionItem}
              onPress={() => handleToggleStaffActive(item)}
              activeOpacity={0.7}
            >
              {item.is_active ? (
                <>
                  <UserX size={15} color="#B91C1C" strokeWidth={1.9} />
                  <AppText style={[styles.cardActionText, { color: '#B91C1C' }]}>Disable</AppText>
                </>
              ) : (
                <>
                  <UserCheck size={15} color="#176B57" strokeWidth={1.9} />
                  <AppText style={[styles.cardActionText, { color: '#176B57' }]}>Enable</AppText>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.cardActionItem}
              onPress={() => handleMessageStaff(item)}
              activeOpacity={0.7}
            >
              <Mail size={15} color="#102F2A" strokeWidth={1.9} />
              <AppText style={styles.cardActionText}>Message</AppText>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <Screen style={styles.screenContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F8F5" />
      <AppHeader title="Members" subtitle="Manage staff roles and club members" borderless />

      {/* Main List */}
      <View style={styles.screenInner}>
        {isLoading ? (
          <LoadingState message="Loading club members..." />
        ) : activeTab === 'players' ? (
          <FlatList
            data={filteredPlayers}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={renderListHeader}
            contentContainerStyle={[
              styles.listContentContainer,
              { paddingBottom: insets.bottom + 100 },
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
                    : 'No players have joined this club yet. Players appear here when they join or subscribe.'
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
        ) : (
          <FlatList
            data={filteredStaff}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={renderListHeader}
            contentContainerStyle={[
              styles.listContentContainer,
              { paddingBottom: insets.bottom + 100 },
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

      {/* ─── Edit Player Status Modal ────────────────────────────────────────── */}
      <Modal
        visible={editPlayerModalVisible}
        transparent
        animationType="slide"
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
          <Pressable style={styles.modalSheetContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeaderRow}>
              <View>
                <AppText style={styles.modalTitle}>Edit Player</AppText>
                <AppText style={styles.modalSubtitle}>
                  {selectedPlayer ? formatPlayerName(selectedPlayer) : 'Update Status'}
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => {
                  blurActiveElement();
                  setEditPlayerModalVisible(false);
                }}
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
                placeholder="e.g. #001"
                placeholderTextColor="#8C9BA5"
                value={editPlayerNumber}
                onChangeText={setEditPlayerNumber}
              />
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
          <Pressable
            style={[styles.modalSheetContent, { maxHeight: '92%' }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeaderRow}>
              <View>
                <AppText style={styles.modalTitle}>Add Staff Member</AppText>
                <AppText style={styles.modalSubtitle}>Assign a management role in this club</AppText>
              </View>
              <TouchableOpacity
                onPress={() => {
                  blurActiveElement();
                  setAddStaffModalVisible(false);
                }}
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

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
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
                <View style={styles.roleHeaderRow}>
                  <AppText style={styles.formLabel}>Staff Role</AppText>
                  <TouchableOpacity
                    style={styles.inlineCreateRoleBtn}
                    onPress={handleOpenCreateRoleFromAddStaff}
                    activeOpacity={0.7}
                  >
                    <Plus size={13} color="#176B57" strokeWidth={2.4} />
                    <AppText style={styles.inlineCreateRoleText}>Create New Role</AppText>
                  </TouchableOpacity>
                </View>

                <AppText style={styles.roleSectionSubtitle}>System Built-in Roles</AppText>
                {VALID_ROLES.filter((r) => r.role !== 'club_owner').map((r) => {
                  const isSelected =
                    selectedRoleChoice.type === 'builtin' && selectedRoleChoice.role === r.role;
                  return (
                    <TouchableOpacity
                      key={r.role}
                      style={[
                        styles.roleSelectOption,
                        isSelected && styles.roleSelectOptionActive,
                      ]}
                      onPress={() => setSelectedRoleChoice({ type: 'builtin', role: r.role })}
                    >
                      <View style={styles.roleOptionRow}>
                        <AppText
                          style={[
                            styles.roleSelectOptionText,
                            isSelected && styles.roleSelectOptionTextActive,
                          ]}
                        >
                          {r.label}
                        </AppText>
                        {isSelected && <Check size={16} color="#176B57" strokeWidth={2.5} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}

                <View style={styles.customRolesHeaderRow}>
                  <AppText style={styles.roleSectionSubtitle}>
                    Custom Roles ({customRoles.length})
                  </AppText>
                </View>

                {customRoles.length === 0 ? (
                  <View style={styles.emptyCustomRolesBox}>
                    <AppText style={styles.emptyCustomRolesText}>
                      No custom roles created yet. Tap "+ Create New Role" above to configure a role with specific permissions.
                    </AppText>
                  </View>
                ) : (
                  customRoles.map((cr) => {
                    const isSelected =
                      selectedRoleChoice.type === 'custom' && selectedRoleChoice.roleId === cr.id;
                    const permCount = (cr.permissions || []).length;
                    return (
                      <TouchableOpacity
                        key={cr.id}
                        style={[
                          styles.roleSelectOption,
                          isSelected && styles.roleSelectOptionActive,
                        ]}
                        onPress={() => setSelectedRoleChoice({ type: 'custom', roleId: cr.id })}
                      >
                        <View style={styles.roleOptionRow}>
                          <View style={{ flex: 1, paddingRight: 8 }}>
                            <AppText
                              style={[
                                styles.roleSelectOptionText,
                                isSelected && styles.roleSelectOptionTextActive,
                              ]}
                            >
                              {cr.name}
                            </AppText>
                            <AppText style={styles.roleOptionMeta}>
                              {permCount} {permCount === 1 ? 'permission' : 'permissions'}
                              {cr.description ? ` • ${cr.description}` : ''}
                            </AppText>
                          </View>
                          {isSelected && <Check size={16} color="#176B57" strokeWidth={2.5} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
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
            </ScrollView>

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

      {/* ─── Role Edit Modal (Staff member role modification) ─────────────────── */}
      <Modal
        visible={roleModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          blurActiveElement();
          setRoleModalVisible(false);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            blurActiveElement();
            setRoleModalVisible(false);
          }}
        >
          <Pressable
            style={[styles.modalSheetContent, { maxHeight: '90%' }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeaderRow}>
              <View>
                <AppText style={styles.modalTitle}>Change Staff Role</AppText>
                <AppText style={styles.modalSubtitle}>
                  {selectedStaffMember?.user_email}
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => {
                  blurActiveElement();
                  setRoleModalVisible(false);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#647570" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              <View style={styles.formGroup}>
                <AppText style={styles.roleSectionSubtitle}>System Built-in Roles</AppText>
                {VALID_ROLES.map((r) => {
                  const isSelected =
                    staffEditRoleChoice.type === 'builtin' && staffEditRoleChoice.role === r.role;
                  return (
                    <TouchableOpacity
                      key={r.role}
                      style={[
                        styles.roleSelectOption,
                        isSelected && styles.roleSelectOptionActive,
                      ]}
                      onPress={() => setStaffEditRoleChoice({ type: 'builtin', role: r.role })}
                    >
                      <View style={styles.roleOptionRow}>
                        <AppText
                          style={[
                            styles.roleSelectOptionText,
                            isSelected && styles.roleSelectOptionTextActive,
                          ]}
                        >
                          {r.label}
                        </AppText>
                        {isSelected && <Check size={16} color="#176B57" strokeWidth={2.5} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {customRoles.length > 0 && (
                  <>
                    <AppText style={[styles.roleSectionSubtitle, { marginTop: 10 }]}>
                      Custom Roles
                    </AppText>
                    {customRoles.map((cr) => {
                      const isSelected =
                        staffEditRoleChoice.type === 'custom' && staffEditRoleChoice.roleId === cr.id;
                      return (
                        <TouchableOpacity
                          key={cr.id}
                          style={[
                            styles.roleSelectOption,
                            isSelected && styles.roleSelectOptionActive,
                          ]}
                          onPress={() => setStaffEditRoleChoice({ type: 'custom', roleId: cr.id })}
                        >
                          <View style={styles.roleOptionRow}>
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <AppText
                                style={[
                                  styles.roleSelectOptionText,
                                  isSelected && styles.roleSelectOptionTextActive,
                                ]}
                              >
                                {cr.name}
                              </AppText>
                              <AppText style={styles.roleOptionMeta}>
                                {(cr.permissions || []).length} permissions
                              </AppText>
                            </View>
                            {isSelected && <Check size={16} color="#176B57" strokeWidth={2.5} />}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalActionButtons}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => {
                  blurActiveElement();
                  setRoleModalVisible(false);
                }}
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

      {/* ─── Manage Roles Modal (Dedicated Role Management) ───────────────────── */}
      <Modal
        visible={manageRolesModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          blurActiveElement();
          setManageRolesModalVisible(false);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            blurActiveElement();
            setManageRolesModalVisible(false);
          }}
        >
          <Pressable
            style={[styles.modalSheetContent, { maxHeight: '90%' }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeaderRow}>
              <View>
                <AppText style={styles.modalTitle}>Custom Staff Roles</AppText>
                <AppText style={styles.modalSubtitle}>
                  Manage roles and permission profiles for this club
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => {
                  blurActiveElement();
                  setManageRolesModalVisible(false);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#647570" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.manageRolesCreateBtn}
              onPress={handleOpenCreateRoleFromManager}
              activeOpacity={0.8}
            >
              <Plus size={15} color="#FFFFFF" strokeWidth={2.4} />
              <AppText style={styles.manageRolesCreateBtnText}>Create New Role</AppText>
            </TouchableOpacity>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {customRoles.length === 0 ? (
                <View style={styles.emptyRolesSection}>
                  <Shield size={36} color="#A0AEC0" strokeWidth={1.5} />
                  <AppText style={styles.emptyRolesTitle}>No Custom Roles Yet</AppText>
                  <AppText style={styles.emptyRolesDesc}>
                    Create customized staff roles such as Receptionist, Coach, or Accountant with tailor-made permissions.
                  </AppText>
                </View>
              ) : (
                customRoles.map((role) => (
                  <View key={role.id} style={styles.customRoleCard}>
                    <View style={styles.customRoleCardHeader}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <AppText style={styles.customRoleCardTitle}>{role.name}</AppText>
                          <View style={styles.staffCountBadge}>
                            <AppText style={styles.staffCountBadgeText}>
                              {role.staff_count} {role.staff_count === 1 ? 'staff' : 'staff'}
                            </AppText>
                          </View>
                        </View>
                        {role.description ? (
                          <AppText style={styles.customRoleCardDesc}>{role.description}</AppText>
                        ) : null}
                      </View>
                      <View style={styles.customRoleActions}>
                        <TouchableOpacity
                          style={styles.roleActionIconBtn}
                          onPress={() => handleOpenEditCustomRole(role)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Edit3 size={16} color="#176B57" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.roleActionIconBtn}
                          onPress={() => handleDeleteCustomRole(role)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Trash2 size={16} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.permissionPillsRow}>
                      {(role.permissions || []).map((permKey) => (
                        <View key={permKey} style={styles.permissionPill}>
                          <AppText style={styles.permissionPillText}>
                            {permKey.replace(/^manage_/, '').replace(/_/g, ' ')}
                          </AppText>
                        </View>
                      ))}
                      {(role.permissions || []).length === 0 && (
                        <AppText style={styles.noPermsText}>No permissions granted</AppText>
                      )}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.cancelModalBtn, { marginTop: 14 }]}
              onPress={() => {
                blurActiveElement();
                setManageRolesModalVisible(false);
              }}
            >
              <AppText style={styles.cancelModalBtnText}>Close</AppText>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Create / Edit Role Modal ─────────────────────────────────────────── */}
      <Modal
        visible={roleFormModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          blurActiveElement();
          setRoleFormModalVisible(false);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            blurActiveElement();
            setRoleFormModalVisible(false);
          }}
        >
          <Pressable
            style={[styles.modalSheetContent, { maxHeight: '92%' }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeaderRow}>
              <View>
                <AppText style={styles.modalTitle}>
                  {editingRole ? 'Edit Custom Role' : 'Create New Role'}
                </AppText>
                <AppText style={styles.modalSubtitle}>
                  Configure custom role name and granular permissions
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => {
                  blurActiveElement();
                  setRoleFormModalVisible(false);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#647570" />
              </TouchableOpacity>
            </View>

            {roleFormError && (
              <View style={styles.modalErrorBox}>
                <AppText style={styles.modalErrorText}>{roleFormError}</AppText>
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
              <View style={styles.formGroup}>
                <AppText style={styles.formLabel}>Role Name *</AppText>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. Receptionist, Coach, Front Desk"
                  placeholderTextColor="#8C9BA5"
                  value={roleFormName}
                  onChangeText={setRoleFormName}
                />
              </View>

              <View style={styles.formGroup}>
                <AppText style={styles.formLabel}>Description (Optional)</AppText>
                <TextInput
                  style={styles.formInput}
                  placeholder="Briefly describe the responsibilities..."
                  placeholderTextColor="#8C9BA5"
                  value={roleFormDescription}
                  onChangeText={setRoleFormDescription}
                />
              </View>

              <View style={styles.formGroup}>
                <AppText style={[styles.formLabel, { marginBottom: 2 }]}>Permissions</AppText>
                <AppText style={styles.permissionSectionNote}>
                  Select specific operations this role is authorized to perform:
                </AppText>

                {PERMISSION_GROUPS.map((group) => (
                  <View key={group.category} style={styles.permissionCategoryBox}>
                    <AppText style={styles.permissionCategoryTitle}>{group.category}</AppText>
                    {group.permissions.map((perm) => {
                      const isChecked = roleFormPermissions.has(perm.key);
                      return (
                        <TouchableOpacity
                          key={perm.key}
                          style={styles.permissionRow}
                          onPress={() => {
                            setRoleFormPermissions((prev) => {
                              const next = new Set(prev);
                              if (next.has(perm.key)) {
                                next.delete(perm.key);
                              } else {
                                next.add(perm.key);
                              }
                              return next;
                            });
                          }}
                          activeOpacity={0.7}
                        >
                          <View
                            style={[
                              styles.checkboxBox,
                              isChecked && styles.checkboxBoxChecked,
                            ]}
                          >
                            {isChecked && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <AppText style={styles.permissionItemLabel}>{perm.label}</AppText>
                            <AppText style={styles.permissionItemDesc}>{perm.description}</AppText>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalActionButtons}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => {
                  blurActiveElement();
                  setRoleFormModalVisible(false);
                }}
              >
                <AppText style={styles.cancelModalBtnText}>Cancel</AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.submitModalBtn}
                onPress={handleSaveRoleForm}
                disabled={isCreatingRole || isUpdatingRole}
              >
                <AppText style={styles.submitModalBtnText}>
                  {isCreatingRole || isUpdatingRole
                    ? 'Saving...'
                    : editingRole
                    ? 'Save Changes'
                    : 'Create Role'}
                </AppText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Reassign & Delete Role Modal ─────────────────────────────────────── */}
      <Modal
        visible={deleteRoleReassignModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          blurActiveElement();
          setDeleteRoleReassignModalVisible(false);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            blurActiveElement();
            setDeleteRoleReassignModalVisible(false);
          }}
        >
          <Pressable style={styles.modalSheetContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeaderRow}>
              <View>
                <AppText style={styles.modalTitle}>Reassign Staff Before Deletion</AppText>
                <AppText style={styles.modalSubtitle}>
                  Safe role deletion requirement
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => {
                  blurActiveElement();
                  setDeleteRoleReassignModalVisible(false);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#647570" />
              </TouchableOpacity>
            </View>

            <View style={styles.warningBox}>
              <ShieldAlert size={20} color="#B45309" />
              <AppText style={styles.warningBoxText}>
                The role <AppText style={{ fontWeight: '700' }}>{selectedRoleForDeletion?.name}</AppText> is currently assigned to <AppText style={{ fontWeight: '700' }}>{selectedRoleForDeletion?.staff_count}</AppText> staff member(s).
              </AppText>
            </View>

            <AppText style={[styles.formLabel, { marginTop: 12, marginBottom: 6 }]}>
              Select replacement custom role:
            </AppText>

            {customRoles.filter((r) => r.id !== selectedRoleForDeletion?.id).length === 0 ? (
              <View style={styles.emptyCustomRolesBox}>
                <AppText style={styles.emptyCustomRolesText}>
                  No other custom roles exist. Please create another custom role first to reassign these staff members.
                </AppText>
              </View>
            ) : (
              customRoles
                .filter((r) => r.id !== selectedRoleForDeletion?.id)
                .map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={[
                      styles.roleSelectOption,
                      reassignTargetRoleId === r.id && styles.roleSelectOptionActive,
                    ]}
                    onPress={() => setReassignTargetRoleId(r.id)}
                  >
                    <View style={styles.roleOptionRow}>
                      <AppText
                        style={[
                          styles.roleSelectOptionText,
                          reassignTargetRoleId === r.id && styles.roleSelectOptionTextActive,
                        ]}
                      >
                        {r.name}
                      </AppText>
                      {reassignTargetRoleId === r.id && (
                        <Check size={16} color="#176B57" strokeWidth={2.5} />
                      )}
                    </View>
                  </TouchableOpacity>
                ))
            )}

            <View style={styles.modalActionButtons}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => {
                  blurActiveElement();
                  setDeleteRoleReassignModalVisible(false);
                }}
              >
                <AppText style={styles.cancelModalBtnText}>Cancel</AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.submitModalBtn,
                  { backgroundColor: '#DC2626' },
                ]}
                onPress={handleConfirmReassignAndDelete}
                disabled={isDeletingRole || !reassignTargetRoleId}
              >
                <AppText style={styles.submitModalBtnText}>
                  {isDeletingRole ? 'Reassigning...' : 'Reassign & Delete'}
                </AppText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Filter Info Modal ────────────────────────────────────────────────── */}
      <Modal
        visible={filterInfoVisible}
        transparent
        animationType="fade"
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
          <Pressable style={styles.filterModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeaderRow}>
              <AppText style={styles.modalTitle}>Player Filters</AppText>
              <TouchableOpacity
                onPress={() => {
                  blurActiveElement();
                  setFilterInfoVisible(false);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#647570" />
              </TouchableOpacity>
            </View>
            <AppText style={styles.filterExplanation}>
              • <AppText style={{ fontWeight: '700' }}>All Players</AppText>: Displays all joined facility players. Staff members are strictly excluded.
            </AppText>
            <AppText style={styles.filterExplanation}>
              • <AppText style={{ fontWeight: '700' }}>Subscribers</AppText>: Players who currently have an active membership subscription plan.
            </AppText>
            <AppText style={styles.filterExplanation}>
              • <AppText style={{ fontWeight: '700' }}>Normal Users</AppText>: Joined facility players without an active subscription plan.
            </AppText>
            <TouchableOpacity
              style={[styles.submitModalBtn, { marginTop: 16 }]}
              onPress={() => {
                blurActiveElement();
                setFilterInfoVisible(false);
              }}
            >
              <AppText style={styles.submitModalBtnText}>Got it</AppText>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#F2F8F5',
  },
  screenInner: {
    flex: 1,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },

  // ─── Header ──────────────────────────────────────────────────────────────────
  headerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  hamburgerBtn: {
    marginTop: 4,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitles: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 27,
    fontWeight: '800',
    color: '#102F2A',
    letterSpacing: -0.4,
    lineHeight: 32,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: '#5E716D',
    marginTop: 3,
    lineHeight: 18,
  },

  // ─── List Content ────────────────────────────────────────────────────────────
  listContentContainer: {
    paddingHorizontal: 16,
  },
  listHeaderWrapper: {
    marginBottom: 4,
  },

  // ─── Main Action 3-Button Row ────────────────────────────────────────────────
  mainActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  mainActionBtn: {
    flex: 1,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DFE7E3',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  mainActionBtnActive: {
    backgroundColor: '#176B57',
    borderColor: '#176B57',
  },
  mainActionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#102F2A',
  },
  mainActionBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // ─── Filter Pills ────────────────────────────────────────────────────────────
  filterScrollView: {
    marginBottom: 12,
  },
  filterPillsScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 16,
  },
  filterPill: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DFE7E3',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  filterPillActive: {
    backgroundColor: '#176B57',
    borderColor: '#176B57',
  },
  filterPillText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
    lineHeight: 16,
    textAlign: 'center',
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
    borderColor: '#DFE7E3',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // ─── Search Container ────────────────────────────────────────────────────────
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DFE7E3',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
    marginBottom: 14,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#102F2A',
    paddingVertical: 0,
  },

  // ─── Staff Controls ──────────────────────────────────────────────────────────
  staffControlsContainer: {
    marginBottom: 14,
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
    borderColor: '#DFE7E3',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  addStaffBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#176B57',
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    flexShrink: 0,
  },
  addStaffBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // ─── Member Card ─────────────────────────────────────────────────────────────
  memberCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2EAE5',
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1.5,
  },
  cardTopRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },

  // ─── Avatar ──────────────────────────────────────────────────────────────────
  avatarContainer: {
    overflow: 'hidden',
    backgroundColor: '#E8F3EE',
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
    color: '#176B57',
    letterSpacing: 0.5,
  },

  // ─── Card Details Column ─────────────────────────────────────────────────────
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
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#102F2A',
    lineHeight: 22,
  },
  badgeAndMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  idBadge: {
    backgroundColor: '#EEF2F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  idBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5E716D',
    letterSpacing: 0.3,
  },
  threeDotBtn: {
    padding: 2,
  },
  playerEmail: {
    fontSize: 13.5,
    color: '#647570',
    marginTop: 3,
    marginBottom: 8,
  },

  // ─── Status Badge ────────────────────────────────────────────────────────────
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 14,
    backgroundColor: '#EAF0EC',
    gap: 6,
  },
  statusBadgeActive: {
    backgroundColor: '#DEF2E6',
  },
  statusBadgeWarning: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeDanger: {
    backgroundColor: '#FEE2E2',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#647570',
  },
  statusDotActive: {
    backgroundColor: '#15803D',
  },
  statusDotWarning: {
    backgroundColor: '#D97706',
  },
  statusDotDanger: {
    backgroundColor: '#DC2626',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: '#647570',
  },
  statusBadgeTextActive: {
    color: '#15803D',
  },
  statusBadgeTextWarning: {
    color: '#B45309',
  },
  statusBadgeTextDanger: {
    color: '#DC2626',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ─── Divider & Actions ───────────────────────────────────────────────────────
  cardDivider: {
    height: 1,
    backgroundColor: '#F0F4F2',
    marginTop: 14,
    marginBottom: 2,
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
  },
  cardActionItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: '100%',
  },
  actionVerticalDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#E2EAE5',
  },
  cardActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#102F2A',
  },

  // ─── Modals ──────────────────────────────────────────────────────────────────
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
  filterModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 24,
    marginBottom: 'auto',
    marginTop: 'auto',
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
  filterExplanation: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 20,
    marginBottom: 8,
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
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: '#F0F4F2',
    borderWidth: 1,
    borderColor: '#E0E8E4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusSelectOptionActive: {
    backgroundColor: '#176B57',
    borderColor: '#176B57',
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
    borderColor: '#176B57',
  },
  roleSelectOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#102F2A',
  },
  roleSelectOptionTextActive: {
    color: '#176B57',
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
    backgroundColor: '#176B57',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitModalBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  staffHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  manageRolesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#176B57',
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    flexShrink: 0,
  },
  manageRolesBtnText: {
    color: '#176B57',
    fontSize: 13,
    fontWeight: '700',
  },
  roleHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inlineCreateRoleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#DEF2E6',
    borderRadius: 6,
  },
  inlineCreateRoleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#176B57',
  },
  roleSectionSubtitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#5E716D',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 6,
  },
  roleOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roleOptionMeta: {
    fontSize: 11.5,
    color: '#647570',
    marginTop: 2,
  },
  customRolesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  emptyCustomRolesBox: {
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#E2EAE5',
    borderRadius: 8,
    padding: 10,
    marginVertical: 4,
  },
  emptyCustomRolesText: {
    fontSize: 12,
    color: '#647570',
    lineHeight: 16,
  },
  permissionSectionNote: {
    fontSize: 12,
    color: '#647570',
    marginBottom: 8,
  },
  permissionCategoryBox: {
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#E2EAE5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  permissionCategoryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102F2A',
    marginBottom: 8,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 6,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#A0AEC0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxBoxChecked: {
    backgroundColor: '#176B57',
    borderColor: '#176B57',
  },
  permissionItemLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#102F2A',
  },
  permissionItemDesc: {
    fontSize: 11.5,
    color: '#647570',
    marginTop: 1,
  },
  manageRolesCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#176B57',
    height: 42,
    borderRadius: 10,
    marginBottom: 14,
  },
  manageRolesCreateBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyRolesSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  emptyRolesTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102F2A',
    marginTop: 10,
  },
  emptyRolesDesc: {
    fontSize: 12.5,
    color: '#647570',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  customRoleCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAE5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  customRoleCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  customRoleCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102F2A',
  },
  customRoleCardDesc: {
    fontSize: 12,
    color: '#647570',
    marginTop: 2,
  },
  staffCountBadge: {
    backgroundColor: '#EEF2F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  staffCountBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5E716D',
  },
  customRoleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roleActionIconBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#F0F4F2',
  },
  permissionPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 8,
  },
  permissionPill: {
    backgroundColor: '#E8F3EE',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 4,
  },
  permissionPillText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#176B57',
    textTransform: 'capitalize',
  },
  noPermsText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#8C9BA5',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  warningBoxText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    lineHeight: 17,
  },
});
