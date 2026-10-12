/**
 * Aught2 Pickleball — Player Leagues Screen
 *
 * Dedicated platform-wide player league discovery screen:
 *   - Top header with hamburger menu control and title "Leagues"
 *   - Introductory subtitle
 *   - Integrated search bar (search by league name or host club)
 *   - 4 Status tabs: All, Registration Open, Live / Playoffs, Completed with dynamic counts
 *   - Club filter banner when scoped to a specific club
 *   - Roomy cards with court thumbnails, authoritative lifecycle status badges,
 *     natural wrapping titles, host club link, and contextual actions
 *   - Full integration with dedicated registration modal and saved registration details modal
 */

import React, { useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Radio, Search, Trophy, UserPlus, X } from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  EmptyState,
  ErrorState,
  LeagueCard,
  LoadingState,
} from '@/components';
import {
  LeagueRegistrationDetailsModal,
  LeagueRegistrationModal,
} from '@/components/league-registration';
import { usePlayerLeagues } from '@/hooks';
import { Colors, Radius, Spacing } from '@/theme';
import type { LeagueSummary } from '@/types';

type StatusTabKey = 'all' | 'registration_open' | 'live' | 'completed';

export default function PlayerLeaguesScreen() {
  const router = useRouter();
  const { clubId: paramClubId } = useLocalSearchParams<{ clubId?: string }>();
  const [clubFilter, setClubFilter] = useState<string | null>(paramClubId || null);
  const [activeTab, setActiveTab] = useState<StatusTabKey>('all');
  const [searchQuery, setSearchQuery] = useState('');

  React.useEffect(() => {
    if (paramClubId) {
      setClubFilter(paramClubId);
    }
  }, [paramClubId]);

  // Selected league for modals
  const [registerLeague, setRegisterLeague] = useState<LeagueSummary | null>(null);
  const [detailsLeague, setDetailsLeague] = useState<LeagueSummary | null>(null);

  // Authoritative leagues query from backend
  const {
    data: leagues,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = usePlayerLeagues(undefined, clubFilter || undefined);

  const filteredClubName = useMemo(() => {
    if (!clubFilter) return null;
    const match = leagues?.find((l) => l.club_id === clubFilter);
    return match?.club_name || 'Selected Club';
  }, [clubFilter, leagues]);

  // Dynamic counts for status tabs
  const tabCounts = useMemo(() => {
    let regOpen = 0;
    let live = 0;
    let completed = 0;
    let total = 0;

    (leagues || []).forEach((l) => {
      if (l.status === 'draft') return;
      total++;
      if (l.status === 'registration_open' || l.registration_status === 'open') {
        regOpen++;
      } else if (l.status === 'in_progress' || l.status === 'playoffs') {
        live++;
      } else if (l.status === 'completed') {
        completed++;
      }
    });

    return { all: total, registration_open: regOpen, live, completed };
  }, [leagues]);

  // Filtered leagues according to search and active tab
  const filteredLeagues = useMemo(() => {
    if (!leagues) return [];

    return leagues.filter((l) => {
      if (l.status === 'draft') return false;

      // 1. Tab filter
      if (activeTab === 'registration_open') {
        if (l.status !== 'registration_open' && l.registration_status !== 'open') return false;
      } else if (activeTab === 'live') {
        if (l.status !== 'in_progress' && l.status !== 'playoffs') return false;
      } else if (activeTab === 'completed') {
        if (l.status !== 'completed') return false;
      }

      // 2. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = l.name.toLowerCase().includes(q);
        const matchClub = (l.club_name || '').toLowerCase().includes(q);
        const matchDesc = (l.description || '').toLowerCase().includes(q);
        if (!matchName && !matchClub && !matchDesc) return false;
      }

      return true;
    });
  }, [leagues, activeTab, searchQuery]);

  const handleOpenLeague = (league: LeagueSummary) => {
    router.push({
      pathname: '/(player)/league-details',
      params: { id: league.id },
    } as any);
  };

  const handleRegisterPress = (league: LeagueSummary) => {
    setRegisterLeague(league);
  };

  const handleViewRegistrationPress = (league: LeagueSummary) => {
    setDetailsLeague(league);
  };

  const handleClubPress = (clubId: string) => {
    router.push({
      pathname: '/(player)/club-details',
      params: { id: clubId },
    } as any);
  };

  const handleRegistrationSuccess = () => {
    setRegisterLeague(null);
    void refetch();
  };

  const handleRegistrationCancelled = () => {
    setDetailsLeague(null);
    void refetch();
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setActiveTab('all');
    setClubFilter(null);
  };

  return (
    <View style={styles.container}>
      {/* Top Header with Hamburger Menu */}
      <AppHeader
        title="Leagues"
        showMenu={true}
        borderless={true}
        style={styles.header}
      />

      {/* Subtitle / Intro Description directly below header */}
      <View style={styles.introContainer}>
        <AppText style={styles.introText}>
          Discover leagues across all clubs. Track weekly standings and playoff brackets.
        </AppText>
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchBarContainer}>
        <View style={styles.searchBarInner}>
          <Search size={17} color="#64748B" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search leagues or host club..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            accessibilityLabel="Search leagues"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Clear search text"
              accessibilityRole="button"
            >
              <X size={16} color="#64748B" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Status Filter Tabs Row */}
      <View style={styles.tabsContainer}>
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
            <AppText
              variant="caption"
              bold
              style={[
                styles.statusTabText,
                activeTab === 'all' && styles.statusTabTextActive,
              ]}
            >
              All Leagues
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
              size={14}
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

          {/* 3. Live / In Progress */}
          <TouchableOpacity
            style={[
              styles.statusTab,
              activeTab === 'live' ? styles.statusTabActive : styles.statusTabInactive,
            ]}
            onPress={() => setActiveTab('live')}
            activeOpacity={0.8}
          >
            <Radio
              size={14}
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
              Live / Playoffs
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
              size={14}
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

      {/* Club Filter Banner */}
      {clubFilter && (
        <View style={styles.filterBanner}>
          <View style={styles.filterPill}>
            <AppText style={styles.filterPillText} numberOfLines={1}>
              Club: {filteredClubName}
            </AppText>
            <TouchableOpacity
              onPress={() => setClubFilter(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.filterCloseBtn}
              accessibilityLabel="Clear club filter"
              accessibilityRole="button"
            >
              <X size={14} color="#064E3B" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Main Content */}
      {isLoading && !isRefetching ? (
        <LoadingState message="Loading available leagues..." />
      ) : isError ? (
        <ErrorState
          message={error?.message || 'Failed to load leagues. Please try again.'}
          onRetry={() => void refetch()}
        />
      ) : (
        <FlatList
          data={filteredLeagues}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
              tintColor={Colors.brand.primary}
              colors={[Colors.brand.primary]}
            />
          }
          renderItem={({ item, index }) => (
            <LeagueCard
              league={item}
              imageIndex={index}
              onPress={() => handleOpenLeague(item)}
              onRegisterPress={() => handleRegisterPress(item)}
              onViewRegistrationPress={() => handleViewRegistrationPress(item)}
              onClubPress={handleClubPress}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title={searchQuery || activeTab !== 'all' ? 'No Matching Leagues' : 'No Leagues Available'}
              description={
                searchQuery || activeTab !== 'all'
                  ? 'No leagues match your search or filter criteria. Try adjusting your search query or status tab.'
                  : 'There are currently no published leagues across active clubs. Check back soon for new seasons!'
              }
              actionLabel={searchQuery || activeTab !== 'all' || clubFilter ? 'Clear All Filters' : undefined}
              onAction={searchQuery || activeTab !== 'all' || clubFilter ? handleClearFilters : undefined}
            />
          }
        />
      )}

      {/* Dedicated Multi-Step Registration Modal */}
      <LeagueRegistrationModal
        visible={Boolean(registerLeague)}
        league={registerLeague}
        onClose={() => setRegisterLeague(null)}
        onSuccess={handleRegistrationSuccess}
      />

      {/* Saved Registration Details Modal */}
      <LeagueRegistrationDetailsModal
        visible={Boolean(detailsLeague)}
        league={detailsLeague}
        onClose={() => setDetailsLeague(null)}
        onCancelled={handleRegistrationCancelled}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F8F5',
  },
  header: {
    backgroundColor: '#F3F8F5',
    paddingBottom: 2,
  },
  introContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 2,
    paddingBottom: Spacing.xs,
    backgroundColor: '#F3F8F5',
  },
  introText: {
    fontSize: 13,
    color: '#4B6358',
    lineHeight: 18,
    fontWeight: '400',
  },
  searchBarContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
    backgroundColor: '#F3F8F5',
  },
  searchBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
    paddingVertical: 0,
  },
  tabsContainer: {
    backgroundColor: '#F3F8F5',
    paddingBottom: Spacing.xs,
  },
  tabsScrollContent: {
    paddingHorizontal: Spacing.lg,
    gap: 8,
    paddingVertical: 4,
  },
  statusTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
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
    fontWeight: '600',
    color: '#334155',
  },
  statusTabTextActive: {
    color: '#FFFFFF',
  },
  statusTabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.full,
  },
  statusTabBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  statusTabBadgeInactive: {
    backgroundColor: '#F1F5F9',
  },
  statusTabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  statusTabBadgeTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: 24,
  },
  filterBanner: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    backgroundColor: '#F3F8F5',
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#E6F4EA',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 6,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#064E3B',
    maxWidth: 240,
  },
  filterCloseBtn: {
    padding: 2,
  },
});
