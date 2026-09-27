/**
 * Aught2 Pickleball — Club Tournaments Management Screen
 *
 * Exact visual recreation of the reference design:
 *   - Status bar & mobile header with hamburger, title & compact green '+ Create' button
 *   - Club Selector Card: 'Aught2 Pickleball ˅' with 'CLUB OWNER' badge
 *   - Status Filter Tabs: 'All', 'Upcoming' (clock), 'In Progress' (zap), 'Completed' (check) in 1 row
 *   - Search input ('Search tournaments...') + compact 'Filters' button
 *   - Two-part Tournament Cards:
 *       * Hero Banner: Status badge, vertical dots ⋮, tournament title, description, 'Manage →'
 *       * Clean White Info Area: 📅 Dates + Format badge, 👥 Capacity, 🎯 Scoring rules
 *   - Bottom Promotional Card: Trophy icon, 'Looking to run a new tournament?' + '+ Create Tournament'
 *   - Fully functional API, mutations, wizard, lifecycle actions, participant management & format routing
 */

import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StatusBar,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { router } from 'expo-router';
import {
  AlertTriangle,
  Check,
  Clock,
  Search,
  SlidersHorizontal,
  Trophy,
  Zap,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Badge,
  Button,
  Card,
  CompetitionFilterSheet,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  ModalSheet,
  Screen,
  TournamentCard,
  TournamentWizardModal,
  TournamentOptionsMenuModal,
  TournamentSettingsRosterModal,
} from '@/components';
import {
  useActiveClub,
  useClubTournaments,
  usePermission,
  useTournamentDetails,
  useTournamentRegistrations,
} from '@/hooks';
import { Colors, Radius, Spacing, Typography } from '@/theme';
import {
  TOURNAMENT_FORMAT_LABELS,
  type Tournament,
  type TournamentFormat,
  type TournamentRegistrationItem,
  type TournamentRegistrationStatus,
  type TournamentStatus,
} from '@/types';

type StatusTab = 'all' | 'upcoming' | 'in_progress' | 'completed';

const FORMAT_OPTIONS: { format: TournamentFormat; label: string }[] = [
  { format: 'round_robin', label: TOURNAMENT_FORMAT_LABELS.round_robin },
  { format: 'pool_play', label: TOURNAMENT_FORMAT_LABELS.pool_play },
  { format: 'scramble', label: TOURNAMENT_FORMAT_LABELS.scramble },
  { format: 'bracket', label: TOURNAMENT_FORMAT_LABELS.bracket },
];

const STATUS_FILTERS: { status: TournamentStatus | undefined; label: string }[] = [
  { status: undefined, label: 'All Statuses' },
  { status: 'draft', label: 'Draft' },
  { status: 'registration_open', label: 'Open' },
  { status: 'registration_closed', label: 'Closed' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'completed', label: 'Completed' },
  { status: 'cancelled', label: 'Cancelled' },
];

const STATUS_FILTER_OPTIONS = STATUS_FILTERS.map((s) => ({
  value: s.status,
  label: s.label,
}));

const FORMAT_FILTER_OPTIONS = [
  { value: undefined, label: 'All Formats' },
  ...FORMAT_OPTIONS.map((f) => ({
    value: f.format,
    label: f.label,
  })),
];

function getRegStatusBadgeVariant(
  status: TournamentRegistrationStatus
): 'success' | 'warning' | 'error' | 'info' | 'default' {
  switch (status) {
    case 'confirmed':
      return 'success';
    case 'waitlisted':
      return 'warning';
    case 'cancelled':
    case 'withdrawn':
      return 'error';
    default:
      return 'default';
  }
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function ClubTournamentsScreen() {
  const { clubId, clubName } = useActiveClub();
  const { canManageTournaments } = usePermission();

  // Local filter states
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TournamentStatus | undefined>(undefined);
  const [formatFilter, setFormatFilter] = useState<TournamentFormat | undefined>(undefined);
  const [showFilterModal, setShowFilterModal] = useState(false);

  const activeAdvancedFiltersCount = (statusFilter ? 1 : 0) + (formatFilter ? 1 : 0);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [optionsMenuTournament, setOptionsMenuTournament] = useState<Tournament | null>(null);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<TournamentRegistrationItem | null>(null);

  // Participant edit state
  const [editSeed, setEditSeed] = useState('');
  const [editStatus, setEditStatus] = useState<TournamentRegistrationStatus>('confirmed');
  const [editNotes, setEditNotes] = useState('');
  const [participantActionError, setParticipantActionError] = useState<string | null>(null);

  // Direct Cancellation from 3-dot menu state
  const [tournamentToCancel, setTournamentToCancel] = useState<Tournament | null>(null);
  const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false);
  const [isDirectCancelPending, setIsDirectCancelPending] = useState(false);

  // Data Hooks
  const {
    tournaments,
    isLoading,
    isRefetching,
    error,
    refetch,
    createTournament,
    isCreatingTournament,
    openRegistration: openClubTournamentRegistration,
    closeRegistration: closeClubTournamentRegistration,
    isCloseRegistrationPending: isClubClosePending,
    cancelTournament: cancelClubTournament,
    isCancelTournamentPending: isClubCancelPending,
  } = useClubTournaments(clubId, statusFilter);

  const {
    tournament: detailedTournament,
    openRegistration,
    isOpenRegistrationPending,
    closeRegistration,
    isCloseRegistrationPending,
    cancelTournament,
    isCancelTournamentPending,
  } = useTournamentDetails(clubId, selectedTournament?.id ?? null);

  const {
    registrations,
    isLoading: isRegsLoading,
    updateRegistration,
    isUpdatingRegistration,
  } = useTournamentRegistrations(clubId, selectedTournament?.id ?? null);

  // Filter pipeline
  const filteredTournaments = tournaments.filter((t) => {
    // 1. Format filter from sheet
    if (formatFilter && t.format !== formatFilter) return false;

    // 2. Status tab filter
    if (statusTab === 'upcoming') {
      if (!['draft', 'registration_open', 'registration_closed'].includes(t.status)) {
        return false;
      }
    } else if (statusTab === 'in_progress') {
      if (t.status !== 'in_progress') return false;
    } else if (statusTab === 'completed') {
      if (t.status !== 'completed') return false;
    }

    // 3. Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchName = t.name.toLowerCase().includes(q);
      const matchDesc = t.description?.toLowerCase().includes(q);
      const matchFormat = t.format_label.toLowerCase().includes(q);
      if (!matchName && !matchDesc && !matchFormat) return false;
    }

    return true;
  });

  const handleOpenCreateModal = () => {
    setShowCreateModal(true);
  };

  const handlePublishTournament = async (item: Tournament) => {
    try {
      await openClubTournamentRegistration(item.id);
      void refetch();
      Alert.alert(
        'Tournament Published!',
        `"${item.name}" is now published and open for registration! Players can now discover and register for it.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to publish tournament';
      Alert.alert('Error', msg);
    }
  };

  const handleConfirmCloseRegistration = (item: Tournament) => {
    Alert.alert(
      'Close Registration?',
      `Are you sure you want to close registration for "${item.name}"?\n\n• Players will no longer be able to register or withdraw.\n• Registered rosters will be finalized and locked.\n• You will be able to proceed with generating matchups and scheduling courts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close Registration',
          style: 'destructive',
          onPress: async () => {
            try {
              await closeClubTournamentRegistration(item.id);
              void refetch();
              Alert.alert(
                'Registration Closed',
                `Registration for "${item.name}" is now closed and roster is locked. You can now proceed to manage and generate matches.`
              );
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to close registration';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
  };

  const handleTournamentCreated = (created: Tournament) => {
    setShowCreateModal(false);
    void refetch();

    if (created.status === 'registration_open') {
      Alert.alert(
        'Tournament Published!',
        `"${created.name}" is now live and open for registration! Players can discover and register for it.`,
        [
          {
            text: 'Open Workspace',
            onPress: () => handleManage(created),
          },
          {
            text: 'View Tournaments',
            style: 'cancel',
          },
        ]
      );
      return;
    }

    Alert.alert(
      'Tournament Created (Draft)',
      `"${created.name}" was created in Draft status.\n\nWould you like to publish the tournament and open for registration now so players can discover and join?`,
      [
        {
          text: 'Keep in Draft & Manage',
          style: 'cancel',
          onPress: () => handleManage(created),
        },
        {
          text: 'Publish & Open Registration',
          style: 'default',
          onPress: async () => {
            try {
              const updated = await openClubTournamentRegistration(created.id);
              void refetch();
              Alert.alert(
                'Tournament Published!',
                'Registration is now open! Players can now discover and register for this tournament.',
                [
                  {
                    text: 'Open Workspace',
                    onPress: () => handleManage(updated ?? created),
                  },
                ]
              );
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to publish tournament';
              Alert.alert('Error', msg);
              handleManage(created);
            }
          },
        },
      ]
    );
  };

  const handleManage = (item: Tournament) => {
    if (item.format === 'scramble') {
      router.push({
        pathname: '/(club)/scramble' as never,
        params: { tournamentId: item.id },
      });
    } else if (item.format === 'bracket') {
      router.push({
        pathname: '/(club)/bracket' as never,
        params: { tournamentId: item.id },
      });
    } else if (item.format === 'pool_play') {
      router.push({
        pathname: '/(club)/pool-play' as never,
        params: { tournamentId: item.id },
      });
    } else if (item.format === 'round_robin') {
      router.push({
        pathname: '/(club)/round-robin' as never,
        params: { tournamentId: item.id },
      });
    } else {
      router.push({
        pathname: '/(club)/tournament-details' as never,
        params: { tournamentId: item.id },
      });
    }
  };

  const handleOpenOptionsMenu = (item: Tournament) => {
    setOptionsMenuTournament(item);
  };

  const handleOpenRegistration = async () => {
    if (!selectedTournament) return;
    try {
      const updated = await openRegistration();
      setSelectedTournament(updated);
      Alert.alert('Registration Opened', 'Registration is now open for players.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to open registration';
      Alert.alert('Error', msg);
    }
  };

  const handleCloseRegistration = async () => {
    if (!selectedTournament) return;
    try {
      const updated = await closeRegistration();
      setSelectedTournament(updated);
      Alert.alert('Registration Closed', 'Registration has been closed.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to close registration';
      Alert.alert('Error', msg);
    }
  };

  const handleCancelTournament = async () => {
    if (!selectedTournament) return;
    try {
      const updated = await cancelTournament();
      setSelectedTournament(updated);
      void refetch();
      Alert.alert('Tournament Cancelled', 'The tournament status has been set to cancelled.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel tournament';
      Alert.alert('Error', msg);
    }
  };

  const handleOpenCancelFromMenu = (item: Tournament) => {
    setTournamentToCancel(item);
    setShowCancelConfirmModal(true);
  };

  const handleExecuteCancelFromMenu = async () => {
    if (!tournamentToCancel) return;
    setIsDirectCancelPending(true);
    try {
      await cancelClubTournament(tournamentToCancel.id);
      void refetch();
      if (selectedTournament?.id === tournamentToCancel.id) {
        setSelectedTournament(null);
      }
      setShowCancelConfirmModal(false);
      const name = tournamentToCancel.name;
      setTournamentToCancel(null);
      Alert.alert('Tournament Cancelled', `"${name}" has been marked as cancelled.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel tournament';
      Alert.alert('Error', msg);
    } finally {
      setIsDirectCancelPending(false);
    }
  };

  const handleOpenParticipantModal = (participant: TournamentRegistrationItem) => {
    setSelectedParticipant(participant);
    setEditSeed(participant.seed ? String(participant.seed) : '');
    setEditStatus(participant.status);
    setEditNotes(participant.notes ?? '');
    setParticipantActionError(null);
  };

  const handleSaveParticipant = async () => {
    if (!selectedParticipant) return;
    const seedNum = editSeed.trim() ? parseInt(editSeed, 10) : null;
    if (seedNum !== null && (isNaN(seedNum) || seedNum < 1)) {
      setParticipantActionError('Seed must be a positive number (1, 2, ...).');
      return;
    }
    setParticipantActionError(null);
    try {
      await updateRegistration({
        registrationId: selectedParticipant.id,
        payload: {
          status: editStatus,
          seed: seedNum,
          notes: editNotes.trim() ? editNotes.trim() : null,
        },
      });
      setSelectedParticipant(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update participant';
      setParticipantActionError(msg);
    }
  };

  if (!canManageTournaments) {
    return (
      <Screen style={styles.container}>
        <AppHeader title="Tournaments" subtitle="Compete. Connect. Play More." borderless />
        <Card style={styles.permissionCard}>
          <AppText variant="heading2" style={styles.permissionTitle}>
            Tournament Management
          </AppText>
          <AppText variant="body" color="secondary" style={styles.permissionDesc}>
            Tournament management requires the Tournament Director, Club Manager, or Club Owner role
            in {clubName ?? 'this club'}.
          </AppText>
        </Card>
      </Screen>
    );
  }

  const currentT = detailedTournament ?? selectedTournament;

  // List Header with Club Switcher, Status Tabs, and Search + Filter Row
  const renderListHeader = () => (
    <>
      {/* 1. TOURNAMENT FILTER TABS */}
      <View style={styles.statusTabsRow}>
        <TouchableOpacity
          style={[styles.statusTab, statusTab === 'all' && styles.statusTabActive]}
          onPress={() => setStatusTab('all')}
          activeOpacity={0.75}
        >
          <AppText style={[styles.statusTabText, statusTab === 'all' && styles.statusTabTextActive]}>
            All
          </AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.statusTab, statusTab === 'upcoming' && styles.statusTabActive]}
          onPress={() => setStatusTab('upcoming')}
          activeOpacity={0.75}
        >
          <Clock size={14} color={statusTab === 'upcoming' ? '#FFFFFF' : '#3D544F'} />
          <AppText style={[styles.statusTabText, statusTab === 'upcoming' && styles.statusTabTextActive]}>
            Upcoming
          </AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.statusTab, statusTab === 'in_progress' && styles.statusTabActive]}
          onPress={() => setStatusTab('in_progress')}
          activeOpacity={0.75}
        >
          <Zap size={14} color={statusTab === 'in_progress' ? '#FFFFFF' : '#3D544F'} />
          <AppText style={[styles.statusTabText, statusTab === 'in_progress' && styles.statusTabTextActive]}>
            In Progress
          </AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.statusTab, statusTab === 'completed' && styles.statusTabActive]}
          onPress={() => setStatusTab('completed')}
          activeOpacity={0.75}
        >
          <Check size={14} color={statusTab === 'completed' ? '#FFFFFF' : '#3D544F'} />
          <AppText style={[styles.statusTabText, statusTab === 'completed' && styles.statusTabTextActive]}>
            Completed
          </AppText>
        </TouchableOpacity>
      </View>

      {/* 3. SEARCH + FILTER ROW */}
      <View style={styles.searchFilterRow}>
        <View style={styles.searchBox}>
          <Search size={15} color="#8C9BA5" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search tournaments..."
            placeholderTextColor="#8C9BA5"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <AppText style={styles.clearSearchText}>✕</AppText>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.filterBtn, activeAdvancedFiltersCount > 0 && styles.filterBtnActive]}
          onPress={() => setShowFilterModal(true)}
          activeOpacity={0.75}
        >
          <SlidersHorizontal
            size={15}
            color={activeAdvancedFiltersCount > 0 ? '#176B57' : '#102B2A'}
          />
          <AppText style={[styles.filterBtnText, activeAdvancedFiltersCount > 0 && styles.filterBtnTextActive]}>
            Filters
          </AppText>
          {activeAdvancedFiltersCount > 0 && (
            <View style={styles.filterBadge}>
              <AppText style={styles.filterBadgeText}>{activeAdvancedFiltersCount}</AppText>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Active Advanced Filters Clear Pill */}
      {activeAdvancedFiltersCount > 0 && (
        <View style={styles.activeFilterPillsRow}>
          <AppText variant="caption" color="secondary" numberOfLines={1} style={styles.activeFiltersLabel}>
            Filtered: {statusFilter ? `Status: ${STATUS_FILTERS.find((s) => s.status === statusFilter)?.label}` : ''}
            {statusFilter && formatFilter ? ' • ' : ''}
            {formatFilter ? `Format: ${FORMAT_OPTIONS.find((fo) => fo.format === formatFilter)?.label}` : ''}
          </AppText>
          <TouchableOpacity
            onPress={() => {
              setStatusFilter(undefined);
              setFormatFilter(undefined);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <AppText variant="caption" color="brand" bold>
              Clear
            </AppText>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  // Bottom Promotional CTA Card
  const renderListFooter = () => (
    <View style={styles.ctaCard}>
      <View style={styles.ctaIconContainer}>
        <Trophy size={20} color="#176B57" />
      </View>
      <View style={styles.ctaTextContainer}>
        <AppText style={styles.ctaTitle}>Looking to run a new tournament?</AppText>
        <AppText style={styles.ctaSubtitle}>
          Create and manage tournaments for your club.
        </AppText>
      </View>
      <TouchableOpacity
        style={styles.ctaButton}
        onPress={handleOpenCreateModal}
        activeOpacity={0.8}
      >
        <AppText style={styles.ctaButtonText}>+ Create Tournament</AppText>
      </TouchableOpacity>
    </View>
  );

  return (
    <Screen style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F8F5" />

      {/* Top Mobile Header */}
      <AppHeader
        title="Tournaments"
        subtitle="Compete. Connect. Play More."
        borderless
        rightElement={
          <TouchableOpacity
            style={styles.headerCreateBtn}
            onPress={handleOpenCreateModal}
            activeOpacity={0.8}
          >
            <AppText style={styles.headerCreateBtnText}>+ Create</AppText>
          </TouchableOpacity>
        }
      />

      {/* Main List */}
      {isLoading ? (
        <LoadingState message="Loading tournaments..." />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : (
        <FlatList
          data={filteredTournaments}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderListHeader}
          ListFooterComponent={renderListFooter}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
          ListEmptyComponent={
            <EmptyState
              title={
                searchQuery || statusTab !== 'all' || activeAdvancedFiltersCount > 0
                  ? 'No Tournaments Found'
                  : 'No tournaments created yet.'
              }
              description={
                searchQuery || statusTab !== 'all' || activeAdvancedFiltersCount > 0
                  ? 'No tournaments match your filter criteria.'
                  : 'Create your first tournament to get started.'
              }
              actionLabel="Create Tournament"
              onAction={handleOpenCreateModal}
            />
          }
          renderItem={({ item, index }) => (
            <TournamentCard
              tournament={item}
              index={index}
              actionLabel={item.status === 'completed' ? 'View Results' : 'Manage'}
              onPress={() => handleManage(item)}
              onOptionsPress={() => handleOpenOptionsMenu(item)}
              onPublishPress={item.status === 'draft' ? () => handlePublishTournament(item) : undefined}
              onCloseRegistrationPress={
                item.status === 'registration_open' ? () => handleConfirmCloseRegistration(item) : undefined
              }
            />
          )}
        />
      )}

      {/* ─── Standardized Competition Filter Bottom Sheet ───────────────── */}
      <CompetitionFilterSheet
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        title="Filter Tournaments"
        statusOptions={STATUS_FILTER_OPTIONS}
        selectedStatus={statusFilter}
        formatOptions={FORMAT_FILTER_OPTIONS}
        selectedFormat={formatFilter}
        onApply={(newStatus, newFormat) => {
          setStatusFilter(newStatus as TournamentStatus | undefined);
          setFormatFilter(newFormat as TournamentFormat | undefined);
        }}
        onReset={() => {
          setStatusFilter(undefined);
          setFormatFilter(undefined);
        }}
      />

      {/* ─── Create Tournament Wizard Modal ─────────────────────────────── */}
      <TournamentWizardModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        clubId={clubId}
        clubName={clubName ?? undefined}
        createTournament={createTournament}
        openTournamentRegistration={openClubTournamentRegistration}
        isCreating={isCreatingTournament}
        onSuccess={handleTournamentCreated}
      />

      {/* ─── Modern Tournament Three-Dot Options Action Sheet ───────── */}
      <TournamentOptionsMenuModal
        visible={Boolean(optionsMenuTournament)}
        onClose={() => setOptionsMenuTournament(null)}
        tournament={optionsMenuTournament}
        onPublishPress={handlePublishTournament}
        onCloseRegistrationPress={handleConfirmCloseRegistration}
        onViewResultsPress={handleManage}
        onSettingsPress={(t) => {
          setSelectedTournament(t);
        }}
        onCancelPress={(t) => {
          handleOpenCancelFromMenu(t);
        }}
      />

      {/* ─── Redesigned Tournament Settings & Roster Modal ─────────── */}
      <TournamentSettingsRosterModal
        visible={Boolean(selectedTournament)}
        onClose={() => setSelectedTournament(null)}
        tournament={currentT}
        onOpenRegistration={currentT?.status === 'draft' ? handleOpenRegistration : undefined}
        isOpenRegistrationPending={isOpenRegistrationPending}
        onCloseRegistration={currentT?.status === 'registration_open' ? handleCloseRegistration : undefined}
        isCloseRegistrationPending={isCloseRegistrationPending}
        onCancelTournament={
          currentT?.status !== 'cancelled' && currentT?.status !== 'completed'
            ? handleCancelTournament
            : undefined
        }
        isCancelTournamentPending={isCancelTournamentPending}
        registrations={registrations}
        isRegsLoading={isRegsLoading}
        onSelectParticipant={handleOpenParticipantModal}
      />

      {/* ─── Cancel Tournament Confirmation Modal (From Three-Dot Menu) ──── */}
      <Modal
        visible={showCancelConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isDirectCancelPending) {
            setShowCancelConfirmModal(false);
            setTournamentToCancel(null);
          }
        }}
      >
        <TouchableWithoutFeedback
          onPress={() => {
            if (!isDirectCancelPending) {
              setShowCancelConfirmModal(false);
              setTournamentToCancel(null);
            }
          }}
        >
          <View style={styles.confirmBackdrop}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.confirmCard}>
                <View style={styles.confirmIconContainer}>
                  <AlertTriangle size={28} color="#DC2626" />
                </View>

                <AppText style={styles.confirmTitle}>
                  Cancel Tournament?
                </AppText>

                <AppText style={styles.confirmMessage}>
                  Are you sure you want to cancel this tournament? Players will no longer be able to register, and the tournament will be marked as cancelled.
                </AppText>

                {tournamentToCancel?.status === 'in_progress' && (
                  <View style={styles.inProgressWarningBox}>
                    <AlertTriangle size={15} color="#B45309" style={{ marginTop: 1 }} />
                    <AppText style={styles.inProgressWarningText}>
                      Existing match results will be preserved and the competition will be marked cancelled.
                    </AppText>
                  </View>
                )}

                <View style={styles.confirmActionsRow}>
                  <TouchableOpacity
                    style={styles.confirmGoBackBtn}
                    onPress={() => {
                      setShowCancelConfirmModal(false);
                      setTournamentToCancel(null);
                    }}
                    disabled={isDirectCancelPending}
                    activeOpacity={0.8}
                  >
                    <AppText style={styles.confirmGoBackText}>Go Back</AppText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.confirmDestructiveBtn, isDirectCancelPending && styles.btnDisabled]}
                    onPress={handleExecuteCancelFromMenu}
                    disabled={isDirectCancelPending}
                    activeOpacity={0.8}
                  >
                    <AppText style={styles.confirmDestructiveText}>
                      {isDirectCancelPending ? 'Cancelling...' : 'Yes, Cancel Tournament'}
                    </AppText>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ─── Edit Participant Registration Modal ──────────────────────────── */}
      <ModalSheet
        visible={Boolean(selectedParticipant)}
        onClose={() => setSelectedParticipant(null)}
        title="Participant Settings"
        subtitle={(selectedParticipant?.display_name || selectedParticipant?.user_full_name) ?? undefined}
        actions={[
          {
            label: 'Cancel',
            variant: 'secondary',
            onPress: () => setSelectedParticipant(null),
          },
          {
            label: 'Save',
            variant: 'primary',
            onPress: handleSaveParticipant,
            loading: isUpdatingRegistration,
          },
        ]}
      >
        <View style={{ gap: Spacing[3], paddingBottom: Spacing[4] }}>
          {participantActionError && (
            <View style={styles.errorBanner}>
              <AppText variant="caption" style={styles.errorText}>
                {participantActionError}
              </AppText>
            </View>
          )}

          <Input
            label="Seed Number (Optional)"
            placeholder="e.g. 1, 2, 3..."
            value={editSeed}
            onChangeText={setEditSeed}
            keyboardType="number-pad"
          />

          <AppText variant="caption" color="secondary" style={styles.fieldLabel}>
            REGISTRATION STATUS
          </AppText>
          <View style={styles.optionsWrap}>
            {(['confirmed', 'waitlisted', 'cancelled'] as TournamentRegistrationStatus[]).map((st) => (
              <TouchableOpacity
                key={st}
                style={[
                  styles.optionChip,
                  editStatus === st && styles.optionChipActive,
                ]}
                onPress={() => setEditStatus(st)}
              >
                <AppText
                  variant="caption"
                  style={[
                    styles.optionChipText,
                    editStatus === st && styles.optionChipTextActive,
                  ]}
                >
                  {st.charAt(0).toUpperCase() + st.slice(1)}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>

          <Input
            label="Admin Notes"
            placeholder="e.g. verified rating, top seed"
            value={editNotes}
            onChangeText={setEditNotes}
          />
        </View>
      </ModalSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F8F5',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },

  // Top Mobile Header Button
  headerCreateBtn: {
    backgroundColor: '#176B57',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCreateBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  // Club Selector Card Wrapper
  clubCardWrapper: {
    paddingTop: 4,
    paddingBottom: 14,
  },

  // Status Filter Tabs
  statusTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  statusTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAE6',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  statusTabActive: {
    backgroundColor: '#176B57',
    borderColor: '#176B57',
  },
  statusTabText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3D544F',
  },
  statusTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // Search + Filter Row
  searchFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E8E4',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
  },
  searchIcon: {
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#102B2A',
    paddingVertical: 0,
  },
  clearSearchText: {
    fontSize: 12,
    color: '#8C9BA5',
    paddingHorizontal: 4,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E8E4',
    borderRadius: 12,
    height: 42,
    paddingHorizontal: 14,
  },
  filterBtnActive: {
    borderColor: '#176B57',
    backgroundColor: '#E7F5EC',
  },
  filterBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#102B2A',
  },
  filterBtnTextActive: {
    color: '#176B57',
  },
  filterBadge: {
    backgroundColor: '#176B57',
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 2,
  },
  filterBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },

  // Active Advanced Filter Pill Row
  activeFilterPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E7F5EC',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#1B6B45',
    marginBottom: 14,
  },
  activeFiltersLabel: {
    flex: 1,
    marginRight: 8,
    fontSize: 12,
  },

  // Bottom Promotional CTA Card
  ctaCard: {
    backgroundColor: '#EDF7F2',
    marginTop: 4,
    marginBottom: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D5EAE0',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ctaIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#D9EFE4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
  },
  ctaTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  ctaTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#102B2A',
    marginBottom: 2,
  },
  ctaSubtitle: {
    fontSize: 11,
    color: '#4A605A',
    lineHeight: 15,
  },
  ctaButton: {
    backgroundColor: '#176B57',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    flexShrink: 0,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },

  // Permission Card
  permissionCard: {
    margin: Spacing[4],
    padding: Spacing[6],
    alignItems: 'center',
  },
  permissionTitle: {
    color: Colors.text.primary,
    marginBottom: Spacing[2],
    textAlign: 'center',
  },
  permissionDesc: {
    textAlign: 'center',
    lineHeight: 20,
  },

  // Modals Styles
  scoringTitle: {
    fontWeight: Typography.weight.bold,
    marginBottom: Spacing[1],
  },
  lifecycleCard: {
    backgroundColor: Colors.surface.elevated,
    padding: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    marginBottom: Spacing[3],
    gap: Spacing[2],
  },
  actionBtn: {
    marginVertical: Spacing[0.5],
  },
  lockedNote: {
    backgroundColor: 'rgba(255, 179, 0, 0.08)',
    borderColor: Colors.status.warning,
    borderWidth: 1,
    borderRadius: Radius.sm,
    padding: Spacing[2],
    marginTop: Spacing[1],
  },
  metaBox: {
    backgroundColor: Colors.surface.default,
    padding: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    marginBottom: Spacing[3],
    gap: Spacing[1],
  },
  participantsSection: {
    marginTop: Spacing[2],
    gap: Spacing[2],
  },
  partHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[1],
  },
  participantItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface.elevated,
    padding: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    marginBottom: Spacing[1.5],
  },
  partName: {
    fontWeight: Typography.weight.medium,
    color: Colors.text.primary,
  },
  partRightCol: {
    flexDirection: 'row',
    gap: Spacing[1.5],
    alignItems: 'center',
  },
  flexOne: {
    flex: 1,
  },
  errorBanner: {
    backgroundColor: Colors.status.errorBg,
    borderColor: Colors.status.error,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing[2.5],
    marginBottom: Spacing[3],
  },
  errorText: {
    color: Colors.status.error,
  },
  fieldLabel: {
    marginTop: Spacing[2],
    marginBottom: Spacing[1],
    fontWeight: Typography.weight.semibold,
  },
  optionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
    marginBottom: Spacing[3],
  },
  optionChip: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  optionChipActive: {
    backgroundColor: '#E7F5EC',
    borderColor: Colors.brand.primary,
  },
  optionChipText: {
    color: Colors.text.secondary,
  },
  optionChipTextActive: {
    color: Colors.brand.primary,
    fontWeight: Typography.weight.semibold,
  },

  // Cancel Confirmation Modal
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[4],
  },
  confirmCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: Spacing[5],
    alignItems: 'center',
    gap: Spacing[3],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  confirmIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  confirmMessage: {
    fontSize: 13.5,
    lineHeight: 20,
    color: '#475569',
    textAlign: 'center',
  },
  inProgressWarningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: Radius.md,
    padding: Spacing[2.5],
    width: '100%',
  },
  inProgressWarningText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: '#B45309',
    fontWeight: '600',
  },
  confirmActionsRow: {
    flexDirection: 'row',
    gap: Spacing[2.5],
    width: '100%',
    marginTop: Spacing[2],
  },
  confirmGoBackBtn: {
    flex: 1,
    paddingVertical: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmGoBackText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#334155',
  },
  confirmDestructiveBtn: {
    flex: 1.2,
    paddingVertical: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDestructiveText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
