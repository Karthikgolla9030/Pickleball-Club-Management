/**
 * Aught2 Pickleball — Player Tournaments Discovery Screen
 *
 * Implements the exact Player-Side Tournament Discovery Page:
 *   - Fixed top header: Hamburger menu [☰], "Tournaments" title, Search [🔍], Bell [🔔] with unread dot
 *   - Premium Discover Hero Banner: Pickleball court imagery, DISCOVER badge, Tournaments heading,
 *     subtitle, integrated search bar with filter sliders button
 *   - 4 Tournament Status Tabs: All (${total}), Registration Open (${open}), Live Now (${live}), Completed (${completed})
 *     with active dark teal (#064E3B) state and dynamic counts
 *   - Side-by-side tournament cards with status badges, format pills, favorites toggle, metadata,
 *     and contextual action buttons ('Register →', 'Watch Live →', 'View Results →')
 *   - Filter modal supporting format, club, and status filters
 *   - Fully connected to backend APIs, real data, and favorites persistence
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  ImageBackground,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  Check,
  ChevronRight,
  Filter,
  LayoutGrid,
  Menu,
  Radio,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trophy,
  UserPlus,
  X,
} from 'lucide-react-native';

import {
  AppText,
  EmptyState,
  ErrorState,
  LoadingState,
  PlayerTournamentCard,
  Screen,
} from '@/components';
import {
  RegistrationDetailsModal,
  TournamentRegistrationModal,
} from '@/components/tournament-registration';
import { usePlayerTournaments, useTournamentFavorites } from '@/hooks';
import { useDrawerStore } from '@/navigation';
import { Colors, Radius, Shadows, Spacing } from '@/theme';
import type { TournamentDiscoveryItem, TournamentFormat } from '@/types';

type StatusTabKey = 'all' | 'registration_open' | 'live' | 'completed';

const FORMAT_OPTIONS: { key: string; label: string }[] = [
  { key: 'all', label: 'All Formats' },
  { key: 'pool_play', label: 'Pool Play' },
  { key: 'round_robin', label: 'Round Robin' },
  { key: 'bracket', label: 'Bracket' },
  { key: 'scramble', label: 'Scramble' },
];

export default function PlayerTournamentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const openDrawer = useDrawerStore((s) => s.openDrawer);
  const searchInputRef = useRef<TextInput>(null);

  // Filter States
  const [activeTab, setActiveTab] = useState<StatusTabKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [formatFilter, setFormatFilter] = useState<string>('all');
  const [clubFilter, setClubFilter] = useState<string>('all');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [registeringTournament, setRegisteringTournament] = useState<TournamentDiscoveryItem | null>(null);
  const [viewingRegistrationTournament, setViewingRegistrationTournament] = useState<TournamentDiscoveryItem | null>(null);

  // Queries & Favorites
  const {
    tournaments,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = usePlayerTournaments();

  // Automatically refresh tournaments when player visits or switches back to this screen
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch])
  );

  const { isFavorite, toggleFavorite } = useTournamentFavorites();

  // Dynamic counts for status tabs
  const tabCounts = useMemo(() => {
    let regOpen = 0;
    let live = 0;
    let completed = 0;
    let totalPublished = 0;

    tournaments.forEach((t) => {
      // Draft tournaments must NEVER be visible or counted on player side
      if (t.status === 'draft') return;
      totalPublished++;

      const now = new Date();
      const regOpenAt = t.registration_open_at ? new Date(t.registration_open_at) : null;
      const regCloseAt = t.registration_close_at ? new Date(t.registration_close_at) : null;

      const isCancelled = t.status === 'cancelled';
      const isLive = t.status === 'in_progress';
      const isCompleted = t.status === 'completed';
      const isRegClosed = t.status === 'registration_closed';

      const isUpcoming =
        !isCancelled &&
        !isCompleted &&
        !isLive &&
        !isRegClosed &&
        ((regOpenAt ? regOpenAt > now : false) ||
          (!t.is_registration_open && t.status !== 'registration_open'));

      const isRegOpen =
        !isCancelled &&
        !isCompleted &&
        !isLive &&
        !isRegClosed &&
        !isUpcoming &&
        (t.status === 'registration_open' || t.is_registration_open) &&
        (regCloseAt ? regCloseAt >= now : true);

      if (isCompleted && !isCancelled) {
        completed++;
      } else if (isLive && !isCancelled) {
        live++;
      } else if (isRegOpen && !isCancelled) {
        regOpen++;
      }
    });

    return {
      all: totalPublished,
      registration_open: regOpen,
      live: live,
      completed: completed,
    };
  }, [tournaments]);

  // Extract unique clubs for filter sheet
  const clubOptions = useMemo(() => {
    const clubsMap = new Map<string, string>();
    tournaments.forEach((t) => {
      if (t.status === 'draft') return;
      if (t.club_id && t.club_name) {
        clubsMap.set(t.club_id, t.club_name);
      }
    });
    return Array.from(clubsMap.entries()).map(([id, name]) => ({ id, name }));
  }, [tournaments]);

  // Filter tournaments list
  const filteredTournaments = useMemo(() => {
    const results = tournaments.filter((t) => {
      // Draft tournaments are strictly forbidden on player side
      if (t.status === 'draft') return false;

      const now = new Date();
      const regOpenAt = t.registration_open_at ? new Date(t.registration_open_at) : null;
      const regCloseAt = t.registration_close_at ? new Date(t.registration_close_at) : null;

      const isCancelled = t.status === 'cancelled';
      const isLive = t.status === 'in_progress';
      const isCompleted = t.status === 'completed';
      const isRegClosed = t.status === 'registration_closed';

      const isUpcoming =
        !isCancelled &&
        !isCompleted &&
        !isLive &&
        !isRegClosed &&
        ((regOpenAt ? regOpenAt > now : false) ||
          (!t.is_registration_open && t.status !== 'registration_open'));

      const isRegOpen =
        !isCancelled &&
        !isCompleted &&
        !isLive &&
        !isRegClosed &&
        !isUpcoming &&
        (t.status === 'registration_open' || t.is_registration_open) &&
        (regCloseAt ? regCloseAt >= now : true);

      // 1. Status Tab filter
      if (activeTab === 'registration_open') {
        if (!isRegOpen) return false;
      } else if (activeTab === 'live') {
        if (!isLive) return false;
      } else if (activeTab === 'completed') {
        if (!isCompleted || isCancelled) return false;
      }

      // 2. Format filter
      if (formatFilter !== 'all' && t.format !== formatFilter) {
        return false;
      }

      // 3. Club filter
      if (clubFilter !== 'all' && t.club_id !== clubFilter) {
        return false;
      }

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = t.name.toLowerCase().includes(q);
        const matchClub = t.club_name.toLowerCase().includes(q);
        const matchLoc = (t.location_name || '').toLowerCase().includes(q);
        const matchFmt = (t.format_label || t.format || '').toLowerCase().includes(q);
        const matchDesc = (t.description || '').toLowerCase().includes(q);
        if (!matchName && !matchClub && !matchLoc && !matchFmt && !matchDesc) {
          return false;
        }
      }

      return true;
    });

    // Stable sort by scheduled start date
    return results.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  }, [tournaments, activeTab, formatFilter, clubFilter, searchQuery]);

  // Clear all filters
  const handleClearFilters = () => {
    setActiveTab('all');
    setSearchQuery('');
    setFormatFilter('all');
    setClubFilter('all');
  };

  const hasExtraFilters = formatFilter !== 'all' || clubFilter !== 'all';

  return (
    <Screen safeArea={false} style={styles.screen}>
      {/* ─── PHASE 1: PAGE HEADER ─── */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + 6 }]}>
        <View style={styles.headerInner}>
          {/* Hamburger Menu (Opens Drawer) */}
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={openDrawer}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Open navigation menu"
            accessibilityRole="button"
          >
            <Menu size={24} color="#0F2E28" strokeWidth={2.2} />
          </TouchableOpacity>

          {/* Title */}
          <View style={styles.headerTitleContainer}>
            <AppText variant="title" bold style={styles.headerTitle}>
              Tournaments
            </AppText>
          </View>

          {/* Right Icons: Search & Notifications */}
          <View style={styles.headerRightGroup}>
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={() => searchInputRef.current?.focus()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Search tournaments"
              accessibilityRole="button"
            >
              <Search size={22} color="#0F2E28" strokeWidth={2.2} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={() => router.push('/(player)/notifications' as any)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="View notifications"
              accessibilityRole="button"
            >
              <Bell size={22} color="#0F2E28" strokeWidth={2.2} />
              {/* Unread indicator dot */}
              <View style={styles.notificationDot} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <FlatList
        data={filteredTournaments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            colors={['#064E3B']}
            tintColor="#064E3B"
          />
        }
        ListHeaderComponent={
          <>
            {/* ─── PHASE 1: DISCOVER HERO BANNER ─── */}
            <View style={styles.heroWrapper}>
              <ImageBackground
                source={require('../../assets/tournaments/hero_discover_banner.jpg')}
                style={styles.heroBackground}
                imageStyle={styles.heroImageStyle}
              >
                {/* Gradient tint overlay */}
                <View style={styles.heroOverlay} />

                {/* Banner Content */}
                <View style={styles.heroContent}>
                  <AppText variant="caption" bold style={styles.heroTag}>
                    DISCOVER
                  </AppText>

                  <AppText variant="title" bold style={styles.heroHeading}>
                    Tournaments
                  </AppText>

                  <AppText variant="caption" style={styles.heroSubtitle}>
                    Browse pickleball competitions across your clubs
                  </AppText>

                  {/* Search Bar Capsule with Filter Button */}
                  <View style={styles.searchCapsule}>
                    <Search size={16} color="rgba(255, 255, 255, 0.75)" style={styles.searchIcon} />

                    <TextInput
                      ref={searchInputRef}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      placeholder="Search tournaments, clubs or locations..."
                      placeholderTextColor="rgba(255, 255, 255, 0.6)"
                      style={styles.searchInput}
                      returnKeyType="search"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />

                    {searchQuery.length > 0 && (
                      <TouchableOpacity
                        onPress={() => setSearchQuery('')}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={styles.searchClearBtn}
                      >
                        <X size={15} color="rgba(255, 255, 255, 0.75)" />
                      </TouchableOpacity>
                    )}

                    {/* Filter Button */}
                    <TouchableOpacity
                      onPress={() => setShowFilterModal(true)}
                      style={[
                        styles.heroFilterButton,
                        hasExtraFilters && styles.heroFilterButtonActive,
                      ]}
                      activeOpacity={0.8}
                      accessibilityLabel="Open tournament filters"
                      accessibilityRole="button"
                    >
                      <SlidersHorizontal
                        size={16}
                        color={hasExtraFilters ? '#34D399' : '#FFFFFF'}
                        strokeWidth={2}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              </ImageBackground>
            </View>

            {/* ─── PHASE 1: STATUS TABS ─── */}
            <View style={styles.tabsWrapper}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tabsScrollContent}
              >
                {/* 1. All */}
                <TouchableOpacity
                  style={[
                    styles.statusTab,
                    activeTab === 'all' ? styles.statusTabActive : styles.statusTabInactive,
                  ]}
                  onPress={() => setActiveTab('all')}
                  activeOpacity={0.8}
                >
                  <LayoutGrid
                    size={15}
                    color={activeTab === 'all' ? '#FFFFFF' : '#334155'}
                    strokeWidth={2}
                  />
                  <AppText
                    variant="caption"
                    bold
                    style={[
                      styles.statusTabText,
                      activeTab === 'all' && styles.statusTabTextActive,
                    ]}
                  >
                    All
                  </AppText>
                  <View
                    style={[
                      styles.statusTabBadge,
                      activeTab === 'all' ? styles.statusTabBadgeActive : styles.statusTabBadgeInactive,
                    ]}
                  >
                    <AppText
                      variant="caption"
                      bold
                      style={[
                        styles.statusTabBadgeText,
                        activeTab === 'all' && styles.statusTabBadgeTextActive,
                      ]}
                    >
                      {tabCounts.all}
                    </AppText>
                  </View>
                </TouchableOpacity>

                {/* 2. Registration Open */}
                <TouchableOpacity
                  style={[
                    styles.statusTab,
                    activeTab === 'registration_open' ? styles.statusTabActive : styles.statusTabInactive,
                  ]}
                  onPress={() => setActiveTab('registration_open')}
                  activeOpacity={0.8}
                >
                  <UserPlus
                    size={15}
                    color={activeTab === 'registration_open' ? '#FFFFFF' : '#334155'}
                    strokeWidth={2}
                  />
                  <AppText
                    variant="caption"
                    bold
                    style={[
                      styles.statusTabText,
                      activeTab === 'registration_open' && styles.statusTabTextActive,
                    ]}
                  >
                    Registration Open
                  </AppText>
                  <View
                    style={[
                      styles.statusTabBadge,
                      activeTab === 'registration_open' ? styles.statusTabBadgeActive : styles.statusTabBadgeInactive,
                    ]}
                  >
                    <AppText
                      variant="caption"
                      bold
                      style={[
                        styles.statusTabBadgeText,
                        activeTab === 'registration_open' && styles.statusTabBadgeTextActive,
                      ]}
                    >
                      {tabCounts.registration_open}
                    </AppText>
                  </View>
                </TouchableOpacity>

                {/* 3. Live Now */}
                <TouchableOpacity
                  style={[
                    styles.statusTab,
                    activeTab === 'live' ? styles.statusTabActive : styles.statusTabInactive,
                  ]}
                  onPress={() => setActiveTab('live')}
                  activeOpacity={0.8}
                >
                  <Radio
                    size={15}
                    color={activeTab === 'live' ? '#FFFFFF' : '#334155'}
                    strokeWidth={2}
                  />
                  <AppText
                    variant="caption"
                    bold
                    style={[
                      styles.statusTabText,
                      activeTab === 'live' && styles.statusTabTextActive,
                    ]}
                  >
                    Live Now
                  </AppText>
                  <View
                    style={[
                      styles.statusTabBadge,
                      activeTab === 'live' ? styles.statusTabBadgeActive : styles.statusTabBadgeInactive,
                    ]}
                  >
                    <AppText
                      variant="caption"
                      bold
                      style={[
                        styles.statusTabBadgeText,
                        activeTab === 'live' && styles.statusTabBadgeTextActive,
                      ]}
                    >
                      {tabCounts.live}
                    </AppText>
                  </View>
                </TouchableOpacity>

                {/* 4. Completed */}
                <TouchableOpacity
                  style={[
                    styles.statusTab,
                    activeTab === 'completed' ? styles.statusTabActive : styles.statusTabInactive,
                  ]}
                  onPress={() => setActiveTab('completed')}
                  activeOpacity={0.8}
                >
                  <Trophy
                    size={15}
                    color={activeTab === 'completed' ? '#FFFFFF' : '#334155'}
                    strokeWidth={2}
                  />
                  <AppText
                    variant="caption"
                    bold
                    style={[
                      styles.statusTabText,
                      activeTab === 'completed' && styles.statusTabTextActive,
                    ]}
                  >
                    Completed
                  </AppText>
                  <View
                    style={[
                      styles.statusTabBadge,
                      activeTab === 'completed' ? styles.statusTabBadgeActive : styles.statusTabBadgeInactive,
                    ]}
                  >
                    <AppText
                      variant="caption"
                      bold
                      style={[
                        styles.statusTabBadgeText,
                        activeTab === 'completed' && styles.statusTabBadgeTextActive,
                      ]}
                    >
                      {tabCounts.completed}
                    </AppText>
                  </View>
                </TouchableOpacity>
              </ScrollView>
            </View>

            {/* Active Filters Pill Row */}
            {(hasExtraFilters || searchQuery.length > 0) && (
              <View style={styles.activeFiltersRow}>
                <AppText variant="caption" style={styles.activeFiltersText} numberOfLines={1}>
                  Showing results for:{' '}
                  {[
                    searchQuery ? `"${searchQuery}"` : null,
                    formatFilter !== 'all' ? `Format: ${formatFilter.replace('_', ' ').toUpperCase()}` : null,
                    clubFilter !== 'all' ? `Club filtered` : null,
                  ]
                    .filter(Boolean)
                    .join(' • ')}
                </AppText>
                <TouchableOpacity onPress={handleClearFilters} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <AppText variant="caption" bold style={styles.clearFiltersLink}>
                    Clear All
                  </AppText>
                </TouchableOpacity>
              </View>
            )}
          </>
        }
        renderItem={({ item, index }) => {
          const handleTournamentAction = () => {
            const isLive = item.status === 'in_progress';
            const isCompleted = item.status === 'completed';
            const isCancelled = item.status === 'cancelled';
            const isRegClosed = item.status === 'registration_closed';

            // 1. Live or completed tournaments always navigate to the tournament details screen
            if (isLive || isCompleted) {
              router.push({
                pathname: '/(player)/tournament-details' as any,
                params: { id: item.id },
              });
              return;
            }

            // 2. If tournament is cancelled, inform the player
            if (isCancelled) {
              Alert.alert(
                'Tournament Cancelled',
                `"${item.name}" was cancelled by the tournament organizers.`
              );
              return;
            }

            // 3. If already registered (and tournament is NOT live/completed),
            //    show the registration details / status modal.
            if (item.is_registered) {
              setViewingRegistrationTournament(item);
              return;
            }

            // 4. If registration is closed and player did not register
            if (isRegClosed) {
              Alert.alert(
                'Registration Closed',
                'Registration for this tournament has closed. Draw and match schedules are being prepared. Check back when the tournament goes live!'
              );
              return;
            }

            // 5. If registration is open, open the 3-step registration flow.
            if (item.status === 'registration_open' || item.is_registration_open) {
              setRegisteringTournament(item);
              return;
            }

            // 6. Upcoming tournament
            Alert.alert(
              'Registration Opens Soon',
              item.registration_open_at
                ? `Registration opens on ${new Date(item.registration_open_at).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}.`
                : 'Registration will open soon. Check back shortly!'
            );
          };

          return (
            <PlayerTournamentCard
              tournament={item}
              index={index}
              isFavorite={isFavorite(item.id)}
              isRegistered={item.is_registered}
              registrationStatus={item.my_registration_status}
              onToggleFavorite={() => toggleFavorite(item.id)}
              onPress={handleTournamentAction}
              onActionPress={handleTournamentAction}
            />
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <LoadingState message="Discovering tournaments..." />
          ) : error ? (
            <ErrorState message={error.message} onRetry={() => void refetch()} />
          ) : (
            <EmptyState
              title={
                searchQuery || hasExtraFilters
                  ? 'No Tournaments Found'
                  : 'No tournaments available right now.'
              }
              description={
                searchQuery || hasExtraFilters
                  ? "We couldn't find any tournaments matching your search or filters."
                  : 'Check back later for upcoming tournaments.'
              }
              actionLabel={searchQuery || hasExtraFilters ? 'Reset Filters' : 'Refresh'}
              onAction={searchQuery || hasExtraFilters ? handleClearFilters : () => void refetch()}
            />
          )
        }
      />

      {/* ─── PHASE 3: FILTER MODAL SHEET ─── */}
      <Modal
        visible={showFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalDismissArea} onPress={() => setShowFilterModal(false)} />
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            {/* Sheet Handle */}
            <View style={styles.modalHandle} />

            {/* Sheet Header */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <SlidersHorizontal size={20} color="#064E3B" strokeWidth={2.2} />
                <AppText variant="title" bold style={styles.modalTitle}>
                  Filter Tournaments
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => setShowFilterModal(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.modalCloseBtn}
              >
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Format Filter Section */}
              <AppText variant="caption" bold style={styles.filterSectionTitle}>
                TOURNAMENT FORMAT
              </AppText>
              <View style={styles.filterChipsWrap}>
                {FORMAT_OPTIONS.map((opt) => {
                  const isSelected = formatFilter === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.filterChip,
                        isSelected && styles.filterChipSelected,
                      ]}
                      onPress={() => setFormatFilter(opt.key)}
                      activeOpacity={0.8}
                    >
                      {isSelected && <Check size={14} color="#FFFFFF" style={{ marginRight: 5 }} />}
                      <AppText
                        variant="caption"
                        bold={isSelected}
                        style={[
                          styles.filterChipText,
                          isSelected && styles.filterChipTextSelected,
                        ]}
                      >
                        {opt.label}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Club Filter Section */}
              {clubOptions.length > 0 && (
                <>
                  <AppText variant="caption" bold style={[styles.filterSectionTitle, { marginTop: 18 }]}>
                    CLUB
                  </AppText>
                  <View style={styles.filterChipsWrap}>
                    <TouchableOpacity
                      style={[
                        styles.filterChip,
                        clubFilter === 'all' && styles.filterChipSelected,
                      ]}
                      onPress={() => setClubFilter('all')}
                      activeOpacity={0.8}
                    >
                      {clubFilter === 'all' && <Check size={14} color="#FFFFFF" style={{ marginRight: 5 }} />}
                      <AppText
                        variant="caption"
                        bold={clubFilter === 'all'}
                        style={[
                          styles.filterChipText,
                          clubFilter === 'all' && styles.filterChipTextSelected,
                        ]}
                      >
                        All Clubs
                      </AppText>
                    </TouchableOpacity>

                    {clubOptions.map((club) => {
                      const isSelected = clubFilter === club.id;
                      return (
                        <TouchableOpacity
                          key={club.id}
                          style={[
                            styles.filterChip,
                            isSelected && styles.filterChipSelected,
                          ]}
                          onPress={() => setClubFilter(club.id)}
                          activeOpacity={0.8}
                        >
                          {isSelected && <Check size={14} color="#FFFFFF" style={{ marginRight: 5 }} />}
                          <AppText
                            variant="caption"
                            bold={isSelected}
                            style={[
                              styles.filterChipText,
                              isSelected && styles.filterChipTextSelected,
                            ]}
                          >
                            {club.name}
                          </AppText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Status Section */}
              <AppText variant="caption" bold style={[styles.filterSectionTitle, { marginTop: 18 }]}>
                STATUS
              </AppText>
              <View style={styles.filterChipsWrap}>
                {(['all', 'registration_open', 'live', 'completed'] as StatusTabKey[]).map((tab) => {
                  const isSelected = activeTab === tab;
                  const labels: Record<StatusTabKey, string> = {
                    all: 'All Statuses',
                    registration_open: 'Registration Open',
                    live: 'Live Now',
                    completed: 'Completed',
                  };
                  return (
                    <TouchableOpacity
                      key={tab}
                      style={[
                        styles.filterChip,
                        isSelected && styles.filterChipSelected,
                      ]}
                      onPress={() => setActiveTab(tab)}
                      activeOpacity={0.8}
                    >
                      {isSelected && <Check size={14} color="#FFFFFF" style={{ marginRight: 5 }} />}
                      <AppText
                        variant="caption"
                        bold={isSelected}
                        style={[
                          styles.filterChipText,
                          isSelected && styles.filterChipTextSelected,
                        ]}
                      >
                        {labels[tab]}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalResetButton}
                onPress={() => {
                  setFormatFilter('all');
                  setClubFilter('all');
                  setActiveTab('all');
                }}
                activeOpacity={0.8}
              >
                <RotateCcw size={15} color="#475569" style={{ marginRight: 6 }} />
                <AppText variant="caption" bold style={styles.modalResetText}>
                  Reset
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalApplyButton}
                onPress={() => setShowFilterModal(false)}
                activeOpacity={0.85}
              >
                <AppText variant="caption" bold style={styles.modalApplyText}>
                  Apply Filters
                </AppText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── 3-STEP TOURNAMENT REGISTRATION MODAL ─── */}
      <TournamentRegistrationModal
        visible={!!registeringTournament}
        tournament={registeringTournament}
        onClose={() => setRegisteringTournament(null)}
        onSuccess={() => {
          setRegisteringTournament(null);
          void refetch();
        }}
      />

      {/* ─── REGISTRATION DETAILS MODAL ─── */}
      <RegistrationDetailsModal
        visible={!!viewingRegistrationTournament}
        tournament={viewingRegistrationTournament}
        onClose={() => setViewingRegistrationTournament(null)}
        onCancelled={() => {
          setViewingRegistrationTournament(null);
          void refetch();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F8FAFC',
    flex: 1,
  },

  /* ─── Header ─── */
  headerContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    zIndex: 10,
  },
  headerInner: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  headerIconButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F2E28',
    letterSpacing: -0.3,
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notificationDot: {
    position: 'absolute',
    top: 6,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },

  /* ─── Hero Banner ─── */
  heroWrapper: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#064E3B',
    ...Shadows.md,
  },
  heroBackground: {
    width: '100%',
    position: 'relative',
  },
  heroImageStyle: {
    borderRadius: 20,
    resizeMode: 'cover',
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(6, 78, 59, 0.72)',
  },
  heroContent: {
    padding: 18,
    zIndex: 2,
  },
  heroTag: {
    fontSize: 10.5,
    color: '#86EFAC',
    letterSpacing: 1.8,
    marginBottom: 4,
  },
  heroHeading: {
    fontSize: 27,
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 12.5,
    color: 'rgba(255, 255, 255, 0.82)',
    lineHeight: 17,
    marginBottom: 16,
  },
  searchCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: 14,
    height: 44,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12.5,
    paddingVertical: 0,
  },
  searchClearBtn: {
    padding: 4,
    marginRight: 6,
  },
  heroFilterButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  heroFilterButtonActive: {
    backgroundColor: 'rgba(52, 211, 153, 0.3)',
  },

  /* ─── Status Tabs ─── */
  tabsWrapper: {
    marginBottom: 12,
  },
  tabsScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  statusTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    gap: 6,
  },
  statusTabActive: {
    backgroundColor: '#064E3B',
  },
  statusTabInactive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusTabText: {
    fontSize: 12,
    color: '#334155',
  },
  statusTabTextActive: {
    color: '#FFFFFF',
  },
  statusTabBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 2,
  },
  statusTabBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  statusTabBadgeInactive: {
    backgroundColor: '#F1F5F9',
  },
  statusTabBadgeText: {
    fontSize: 11,
    color: '#475569',
  },
  statusTabBadgeTextActive: {
    color: '#FFFFFF',
  },

  /* ─── Active Filters Bar ─── */
  activeFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E6F4EA',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7D7B9',
  },
  activeFiltersText: {
    flex: 1,
    fontSize: 11,
    color: '#064E3B',
    marginRight: 8,
  },
  clearFiltersLink: {
    fontSize: 11,
    color: '#064E3B',
    textDecorationLine: 'underline',
  },

  /* ─── List ─── */
  listContent: {
    paddingBottom: 110,
  },

  /* ─── Modal Sheet ─── */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    maxHeight: '80%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 18,
    color: '#0F172A',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    marginVertical: 14,
  },
  filterSectionTitle: {
    fontSize: 11,
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  filterChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipSelected: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  filterChipText: {
    fontSize: 12,
    color: '#334155',
  },
  filterChipTextSelected: {
    color: '#FFFFFF',
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  modalResetButton: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  modalResetText: {
    color: '#475569',
    fontSize: 13,
  },
  modalApplyButton: {
    flex: 2,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#064E3B',
  },
  modalApplyText: {
    color: '#FFFFFF',
    fontSize: 13,
  },
});
