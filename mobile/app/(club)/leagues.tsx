/**
 * Aught2 Pickleball — Club Leagues Management Screen
 *
 * Exact visual match to reference design:
 * - Top header with bold title, subtitle, hamburger menu, and compact + Create button
 * - Club Information Card with "Play. Learn. Get Better." slogan and "♛ CLUB OWNER >" badge
 * - Large promotional Hero Banner ("Play More Compete Together")
 * - Single-row horizontal Status Filter Bar with dynamic counts ("All Leagues [3]", "Active [0]", "Draft [2]", "Completed [1]") + Filter Options button
 * - Two-column League Cards with left thumbnail + status badge, metadata, progress bar, "View Details >", and "Manage" button
 * - Bottom CTA Card ("Start a New League" + "+ Create League")
 * - Real data, filtering, creation modal, and details navigation preserved
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SlidersHorizontal, Trophy } from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  CompetitionFilterSheet,
  CreateLeagueModal,
  EmptyState,
  ErrorState,
  LeagueCard,
  LoadingState,
  Screen,
} from '@/components';
import { useActiveClub, useClubLeagues, usePermission } from '@/hooks';
import type {
  CreateLeaguePayload,
  LeagueStatus,
  LeagueSummary,
} from '@/types';

type FilterTabKey = 'all' | 'active' | 'draft' | 'completed';

const STATUS_FILTERS: { status: LeagueStatus | undefined; label: string }[] = [
  { status: undefined, label: 'All Leagues' },
  { status: 'draft', label: 'Draft' },
  { status: 'registration_open', label: 'Open' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'playoffs', label: 'Playoffs' },
  { status: 'completed', label: 'Completed' },
  { status: 'cancelled', label: 'Cancelled' },
];

export default function ClubLeaguesScreen() {
  const { clubId } = useActiveClub();
  const { canManageTournaments } = usePermission();

  // Filter state
  const [activeTab, setActiveTab] = useState<FilterTabKey>('all');
  const [selectedStatus, setSelectedStatus] = useState<LeagueStatus | undefined>(undefined);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Fetch all leagues for active club
  const {
    data: leagues,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
    createLeague,
    isCreating,
  } = useClubLeagues(clubId);

  // Compute status counts dynamically
  const counts = useMemo(() => {
    const all = leagues?.length ?? 0;
    const active = leagues?.filter(
      (l) => l.status === 'in_progress' || l.status === 'registration_open' || l.status === 'playoffs'
    ).length ?? 0;
    const draft = leagues?.filter((l) => l.status === 'draft').length ?? 0;
    const completed = leagues?.filter((l) => l.status === 'completed').length ?? 0;

    return { all, active, draft, completed };
  }, [leagues]);

  // Compute filtered list based on active tab and optional sheet filter
  const filteredLeagues = useMemo(() => {
    if (!leagues) return [];

    let list = leagues;

    // Apply sheet filter if explicitly set
    if (selectedStatus) {
      return list.filter((l) => l.status === selectedStatus);
    }

    // Apply quick tab filter
    switch (activeTab) {
      case 'active':
        return list.filter(
          (l) => l.status === 'in_progress' || l.status === 'registration_open' || l.status === 'playoffs'
        );
      case 'draft':
        return list.filter((l) => l.status === 'draft');
      case 'completed':
        return list.filter((l) => l.status === 'completed');
      case 'all':
      default:
        return list;
    }
  }, [leagues, activeTab, selectedStatus]);

  const handleOpenCreateModal = () => {
    setIsCreateModalOpen(true);
  };

  const handleCreateLeague = async (payload: CreateLeaguePayload) => {
    await createLeague(payload);
    setIsCreateModalOpen(false);
  };

  const handleLeaguePress = (leagueId: string) => {
    router.push({
      pathname: '/(club)/league-details' as any,
      params: { id: leagueId },
    });
  };

  const handleLeagueOptions = (league: LeagueSummary) => {
    Alert.alert(
      league.name,
      `Status: ${league.status_display || league.status.toUpperCase()}\nWeeks: ${league.number_of_weeks}`,
      [
        {
          text: 'Manage League',
          onPress: () => handleLeaguePress(league.id),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const handleTabPress = (tab: FilterTabKey) => {
    setActiveTab(tab);
    setSelectedStatus(undefined);
  };

  // Header Component for FlatList
  const renderHeader = () => (
    <View style={styles.headerContentContainer}>
      {/* 1. Hero Promotional Banner */}
      <View style={styles.heroBannerWrapper}>
        <Image
          source={require('../../assets/leagues/hero_banner.jpg')}
          style={styles.heroBannerImage}
          resizeMode="cover"
        />
      </View>

      {/* 3. Horizontal Filter Bar */}
      <View style={styles.filterBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {/* Tab: All Leagues */}
          <TouchableOpacity
            style={[
              styles.filterTab,
              activeTab === 'all' && !selectedStatus && styles.filterTabActive,
            ]}
            onPress={() => handleTabPress('all')}
            activeOpacity={0.8}
          >
            <AppText
              style={[
                styles.filterTabText,
                activeTab === 'all' && !selectedStatus && styles.filterTabTextActive,
              ]}
            >
              All Leagues
            </AppText>
            <View
              style={[
                styles.countBadge,
                activeTab === 'all' && !selectedStatus && styles.countBadgeActive,
              ]}
            >
              <AppText
                style={[
                  styles.countBadgeText,
                  activeTab === 'all' && !selectedStatus && styles.countBadgeTextActive,
                ]}
              >
                {counts.all}
              </AppText>
            </View>
          </TouchableOpacity>

          {/* Tab: Active */}
          <TouchableOpacity
            style={[
              styles.filterTab,
              activeTab === 'active' && !selectedStatus && styles.filterTabActive,
            ]}
            onPress={() => handleTabPress('active')}
            activeOpacity={0.8}
          >
            <AppText
              style={[
                styles.filterTabText,
                activeTab === 'active' && !selectedStatus && styles.filterTabTextActive,
              ]}
            >
              Active
            </AppText>
            <View
              style={[
                styles.countBadge,
                activeTab === 'active' && !selectedStatus && styles.countBadgeActive,
              ]}
            >
              <AppText
                style={[
                  styles.countBadgeText,
                  activeTab === 'active' && !selectedStatus && styles.countBadgeTextActive,
                ]}
              >
                {counts.active}
              </AppText>
            </View>
          </TouchableOpacity>

          {/* Tab: Draft */}
          <TouchableOpacity
            style={[
              styles.filterTab,
              activeTab === 'draft' && !selectedStatus && styles.filterTabActive,
            ]}
            onPress={() => handleTabPress('draft')}
            activeOpacity={0.8}
          >
            <AppText
              style={[
                styles.filterTabText,
                activeTab === 'draft' && !selectedStatus && styles.filterTabTextActive,
              ]}
            >
              Draft
            </AppText>
            <View
              style={[
                styles.countBadge,
                activeTab === 'draft' && !selectedStatus && styles.countBadgeActive,
              ]}
            >
              <AppText
                style={[
                  styles.countBadgeText,
                  activeTab === 'draft' && !selectedStatus && styles.countBadgeTextActive,
                ]}
              >
                {counts.draft}
              </AppText>
            </View>
          </TouchableOpacity>

          {/* Tab: Completed */}
          <TouchableOpacity
            style={[
              styles.filterTab,
              activeTab === 'completed' && !selectedStatus && styles.filterTabActive,
            ]}
            onPress={() => handleTabPress('completed')}
            activeOpacity={0.8}
          >
            <AppText
              style={[
                styles.filterTabText,
                activeTab === 'completed' && !selectedStatus && styles.filterTabTextActive,
              ]}
            >
              Completed
            </AppText>
            <View
              style={[
                styles.countBadge,
                activeTab === 'completed' && !selectedStatus && styles.countBadgeActive,
              ]}
            >
              <AppText
                style={[
                  styles.countBadgeText,
                  activeTab === 'completed' && !selectedStatus && styles.countBadgeTextActive,
                ]}
              >
                {counts.completed}
              </AppText>
            </View>
          </TouchableOpacity>
        </ScrollView>

        {/* Filter Sheet Trigger Button */}
        <TouchableOpacity
          style={[
            styles.filterOptionsButton,
            selectedStatus && styles.filterOptionsButtonActive,
          ]}
          onPress={() => setIsFilterSheetOpen(true)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Open Filters"
        >
          <SlidersHorizontal
            size={15}
            color={selectedStatus ? '#FFFFFF' : '#102F2A'}
          />
        </TouchableOpacity>
      </View>

      {/* Optional Active Filter Tag Indicator */}
      {selectedStatus && (
        <View style={styles.activeFilterNotice}>
          <AppText style={styles.activeFilterNoticeText}>
            Filtered: {STATUS_FILTERS.find((f) => f.status === selectedStatus)?.label}
          </AppText>
          <TouchableOpacity onPress={() => setSelectedStatus(undefined)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <AppText style={styles.clearFilterText}>✕ Clear</AppText>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  // Footer Component with Bottom CTA Card
  const renderFooter = () => (
    <View style={styles.bottomCtaWrapper}>
      <View style={styles.ctaCard}>
        <View style={styles.ctaIconContainer}>
          <Trophy size={18} color="#176B59" />
        </View>

        <View style={styles.ctaTextContainer}>
          <AppText style={styles.ctaTitle}>Start a New League</AppText>
          <AppText style={styles.ctaSubtitle}>
            Create a league, set the format, invite teams and keep the competition going.
          </AppText>
        </View>

        {canManageTournaments && (
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={handleOpenCreateModal}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Create League"
          >
            <AppText style={styles.ctaButtonText}>+ Create League</AppText>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <Screen style={styles.screenContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F8F5" />

      {/* Top Mobile Header */}
      <AppHeader
        title="Leagues"
        subtitle="Multi-week regular seasons & championship playoffs"
        borderless
        rightElement={
          canManageTournaments ? (
            <TouchableOpacity
              style={styles.topCreateButton}
              onPress={handleOpenCreateModal}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Create League"
            >
              <AppText style={styles.topCreateButtonText}>+ Create</AppText>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* Main List Area */}
      {isLoading ? (
        <LoadingState message="Loading club leagues..." />
      ) : isError ? (
        <ErrorState
          message={error?.message || 'Failed to load leagues'}
          onRetry={refetch}
        />
      ) : (
        <FlatList
          data={filteredLeagues}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          ListFooterComponent={renderFooter}
          contentContainerStyle={styles.listContentContainer}
          renderItem={({ item, index }) => (
            <LeagueCard
              league={item}
              imageIndex={index}
              actionLabel="Manage"
              onPress={() => handleLeaguePress(item.id)}
              onManagePress={() => handleLeaguePress(item.id)}
              onOptionsPress={() => handleLeagueOptions(item)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title={
                selectedStatus || activeTab !== 'all'
                  ? 'No Leagues Found'
                  : 'No leagues created yet.'
              }
              description={
                selectedStatus || activeTab !== 'all'
                  ? 'No leagues match the selected status filter.'
                  : 'Create your first league to get started.'
              }
              actionLabel={canManageTournaments ? 'Create League' : undefined}
              onAction={canManageTournaments ? handleOpenCreateModal : undefined}
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#176B59"
            />
          }
        />
      )}

      {/* Create League Modal */}
      <CreateLeagueModal
        visible={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateLeague}
        isCreating={isCreating}
      />

      {/* League Filter Sheet */}
      <CompetitionFilterSheet
        visible={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        title="Filter Leagues"
        statusOptions={STATUS_FILTERS.map((f) => ({
          value: f.status,
          label: f.label,
        }))}
        selectedStatus={selectedStatus}
        onApply={(newStatus) => {
          setSelectedStatus(newStatus as LeagueStatus | undefined);
        }}
        onReset={() => {
          setSelectedStatus(undefined);
        }}
      />
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
    color: '#61736F',
    marginTop: 1,
    lineHeight: 15,
  },
  topCreateButton: {
    backgroundColor: '#176B59',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  topCreateButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 110,
  },
  headerContentContainer: {
    marginBottom: 10,
  },
  clubCardWrapper: {
    marginTop: 4,
    marginBottom: 10,
  },
  heroBannerWrapper: {
    width: '100%',
    aspectRatio: 422 / 116,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E1E8E4',
    marginBottom: 12,
    backgroundColor: '#E7F0EB',
  },
  heroBannerImage: {
    width: '100%',
    height: '100%',
  },
  filterBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  filterScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 4,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E8E4',
    borderRadius: 20,
    paddingVertical: 5,
    paddingLeft: 12,
    paddingRight: 6,
    marginRight: 8,
    gap: 6,
  },
  filterTabActive: {
    backgroundColor: '#176B59',
    borderColor: '#176B59',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#102F2A',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  countBadge: {
    backgroundColor: '#EAF0EC',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeActive: {
    backgroundColor: '#FFFFFF',
  },
  countBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#61736F',
  },
  countBadgeTextActive: {
    color: '#176B59',
  },
  filterOptionsButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E8E4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterOptionsButtonActive: {
    backgroundColor: '#176B59',
    borderColor: '#176B59',
  },
  activeFilterNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E8F5EE',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#CBE5D7',
  },
  activeFilterNoticeText: {
    fontSize: 11.5,
    color: '#176B59',
    fontWeight: '500',
  },
  clearFilterText: {
    fontSize: 11.5,
    color: '#176B59',
    fontWeight: '700',
  },
  bottomCtaWrapper: {
    marginTop: 6,
    marginBottom: 20,
  },
  ctaCard: {
    backgroundColor: '#EDF7F2',
    borderWidth: 1,
    borderColor: '#CBE5D7',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ctaIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#D7EDE0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTextContainer: {
    flex: 1,
  },
  ctaTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#102F2A',
  },
  ctaSubtitle: {
    fontSize: 10.5,
    color: '#516862',
    lineHeight: 14,
    marginTop: 2,
  },
  ctaButton: {
    backgroundColor: '#176B59',
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
  },
  ctaButtonText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
