/**
 * Aught2 Pickleball — Club Leagues Management Screen
 *
 * Exact visual match to Screen 1 of reference mockup:
 * - Top header with hamburger menu [☰], "Leagues" bold title, "Manage and run your club leagues" subtitle,
 *   and "+ Create League" green button on the right
 * - Horizontal Status Filter Pills matching reference:
 *     "All (N)", "Registration Open (N)", "Live (N)", "Completed (N)"
 * - Direct, clean list of League Cards with zero distracting banners
 * - Three-dot overflow menu on every card with valid lifecycle actions
 * - Real backend data and synchronization
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Menu } from 'lucide-react-native';

import {
  AppText,
  CreateLeagueModal,
  EmptyState,
  ErrorState,
  LeagueCard,
  LeagueOptionsMenuModal,
  LoadingState,
  Screen,
} from '@/components';
import { useActiveClub, useClubLeagues, usePermission } from '@/hooks';
import { useDrawerStore } from '@/navigation';
import type {
  CreateLeaguePayload,
  LeagueStatus,
  LeagueSummary,
} from '@/types';

type FilterTabKey = 'all' | 'registration_open' | 'live' | 'completed';

export default function ClubLeaguesScreen() {
  const insets = useSafeAreaInsets();
  const openDrawer = useDrawerStore((s) => s.openDrawer);
  const { clubId } = useActiveClub();
  const { canManageTournaments, canManageLeagues } = usePermission();
  const canManage = canManageTournaments || canManageLeagues;

  // Filter state
  const [activeTab, setActiveTab] = useState<FilterTabKey>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [optionsMenuLeague, setOptionsMenuLeague] = useState<LeagueSummary | null>(null);
  const [isActionProcessing, setIsActionProcessing] = useState(false);

  // Fetch all leagues for active club with lifecycle action mutations
  const {
    data: leagues,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
    createLeague,
    isCreating,
    openRegistration,
    closeRegistration,
    startLeague,
    completeLeague,
    cancelLeague,
    generateSchedule,
  } = useClubLeagues(clubId);

  // Compute status counts dynamically matching Screen 1 in mockup
  const counts = useMemo(() => {
    const all = leagues?.length ?? 0;
    const regOpen = leagues?.filter((l) => l.status === 'registration_open').length ?? 0;
    const live = leagues?.filter(
      (l) => l.status === 'in_progress' || l.status === 'playoffs'
    ).length ?? 0;
    const completed = leagues?.filter((l) => l.status === 'completed').length ?? 0;

    return { all, regOpen, live, completed };
  }, [leagues]);

  // Compute filtered list based on active tab
  const filteredLeagues = useMemo(() => {
    if (!leagues) return [];

    switch (activeTab) {
      case 'registration_open':
        return leagues.filter((l) => l.status === 'registration_open');
      case 'live':
        return leagues.filter(
          (l) => l.status === 'in_progress' || l.status === 'playoffs'
        );
      case 'completed':
        return leagues.filter((l) => l.status === 'completed');
      case 'all':
      default:
        return leagues;
    }
  }, [leagues, activeTab]);

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

  const handleOpenOptionsMenu = (league: LeagueSummary) => {
    setOptionsMenuLeague(league);
  };

  // ─── Lifecycle Actions ──────────────────────────────────────────────────────

  const handlePublishLeague = async (league: LeagueSummary) => {
    setIsActionProcessing(true);
    try {
      await openRegistration(league.id);
      void refetch();
      Alert.alert(
        'Registration Opened!',
        `Registration is now open for "${league.name}". Players can now discover and register their entries in the Player App.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to open registration';
      Alert.alert('Error', msg);
    } finally {
      setIsActionProcessing(false);
    }
  };

  const handleConfirmCloseRegistration = (league: LeagueSummary) => {
    Alert.alert(
      'Close Registration',
      `Are you sure you want to close registration for "${league.name}"? No new teams or players will be able to register. Current entries will be finalized.`,
      [
        { text: 'Keep Open', style: 'cancel' },
        {
          text: 'Close Registration',
          style: 'default',
          onPress: async () => {
            setIsActionProcessing(true);
            try {
              await closeRegistration(league.id);
              void refetch();
              Alert.alert(
                'Registration Closed',
                `Registration has been closed for "${league.name}". You may now review rosters and generate regular season fixtures.`
              );
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to close registration';
              Alert.alert('Error', msg);
            } finally {
              setIsActionProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleConfirmStartLeague = (league: LeagueSummary) => {
    Alert.alert(
      'Start League Play',
      `Are you sure you want to start "${league.name}"? This transitions the league to Live / In Progress and marks Week 1 as active.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start League',
          style: 'default',
          onPress: async () => {
            setIsActionProcessing(true);
            try {
              await startLeague(league.id);
              void refetch();
              Alert.alert(
                'League Started!',
                `"${league.name}" is now live! Week 1 matches can now be scored and tracked.`
              );
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to start league';
              Alert.alert('Error', msg);
            } finally {
              setIsActionProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleConfirmCompleteLeague = (league: LeagueSummary) => {
    Alert.alert(
      'Complete League Competition',
      `Are you sure you want to mark "${league.name}" as completed? This will lock final standings and record results permanently.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete League',
          style: 'default',
          onPress: async () => {
            setIsActionProcessing(true);
            try {
              await completeLeague(league.id);
              void refetch();
              Alert.alert(
                'League Completed!',
                `"${league.name}" has been marked as completed! Final standings and championship results are locked.`
              );
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to complete league';
              Alert.alert('Error', msg);
            } finally {
              setIsActionProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleConfirmCancelLeague = (league: LeagueSummary) => {
    Alert.alert(
      'Cancel League',
      `Are you sure you want to cancel "${league.name}"? This action halts all league play and marks it as cancelled. Existing records will be preserved for history.`,
      [
        { text: 'Keep League', style: 'cancel' },
        {
          text: 'Cancel League',
          style: 'destructive',
          onPress: async () => {
            setIsActionProcessing(true);
            try {
              await cancelLeague(league.id);
              void refetch();
              Alert.alert('League Cancelled', `"${league.name}" has been marked as cancelled.`);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to cancel league';
              Alert.alert('Error', msg);
            } finally {
              setIsActionProcessing(false);
            }
          },
        },
      ]
    );
  };

  // Header Component for FlatList matching Screen 1 of reference mockup
  const renderHeader = () => (
    <View style={styles.filterSectionContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
      >
        {/* Tab: All */}
        <TouchableOpacity
          style={[
            styles.filterPill,
            activeTab === 'all' && styles.filterPillActive,
          ]}
          onPress={() => setActiveTab('all')}
          activeOpacity={0.8}
        >
          <AppText
            style={[
              styles.filterPillText,
              activeTab === 'all' && styles.filterPillTextActive,
            ]}
          >
            All ({counts.all})
          </AppText>
        </TouchableOpacity>

        {/* Tab: Registration Open */}
        <TouchableOpacity
          style={[
            styles.filterPill,
            activeTab === 'registration_open' && styles.filterPillActive,
          ]}
          onPress={() => setActiveTab('registration_open')}
          activeOpacity={0.8}
        >
          <AppText
            style={[
              styles.filterPillText,
              activeTab === 'registration_open' && styles.filterPillTextActive,
            ]}
          >
            Registration Open ({counts.regOpen})
          </AppText>
        </TouchableOpacity>

        {/* Tab: Live */}
        <TouchableOpacity
          style={[
            styles.filterPill,
            activeTab === 'live' && styles.filterPillActive,
          ]}
          onPress={() => setActiveTab('live')}
          activeOpacity={0.8}
        >
          <AppText
            style={[
              styles.filterPillText,
              activeTab === 'live' && styles.filterPillTextActive,
            ]}
          >
            Live ({counts.live})
          </AppText>
        </TouchableOpacity>

        {/* Tab: Completed */}
        <TouchableOpacity
          style={[
            styles.filterPill,
            activeTab === 'completed' && styles.filterPillActive,
          ]}
          onPress={() => setActiveTab('completed')}
          activeOpacity={0.8}
        >
          <AppText
            style={[
              styles.filterPillText,
              activeTab === 'completed' && styles.filterPillTextActive,
            ]}
          >
            Completed ({counts.completed})
          </AppText>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  return (
    <Screen style={styles.screenContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top Header matching Screen 1: Hamburger Menu, Title, Subtitle, + Create League Button */}
      <View style={[styles.topHeader, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.drawerButton}
          onPress={openDrawer}
          accessibilityLabel="Open drawer menu"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Menu size={22} color="#111827" strokeWidth={2.4} />
        </TouchableOpacity>

        <View style={styles.titleContainer}>
          <AppText style={styles.screenTitle}>Leagues</AppText>
          <AppText style={styles.screenSubtitle}>Manage and run your club leagues</AppText>
        </View>

        {canManage && (
          <TouchableOpacity
            style={styles.createButton}
            onPress={handleOpenCreateModal}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Create League"
          >
            <AppText style={styles.createButtonText}>+ Create League</AppText>
          </TouchableOpacity>
        )}
      </View>

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
          contentContainerStyle={styles.listContentContainer}
          renderItem={({ item, index }) => (
            <LeagueCard
              league={item}
              imageIndex={index}
              onPress={() => handleLeaguePress(item.id)}
              onOptionsPress={() => handleOpenOptionsMenu(item)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title={
                activeTab === 'all'
                  ? 'No Leagues Created Yet'
                  : `No ${
                      activeTab === 'registration_open'
                        ? 'Open'
                        : activeTab === 'live'
                        ? 'Live'
                        : 'Completed'
                    } Leagues`
              }
              description={
                activeTab === 'all'
                  ? 'Create your first league to run multi-week regular season round-robins and championship playoffs.'
                  : 'Check back later or switch filter tabs to view other leagues.'
              }
              actionLabel={canManage && activeTab === 'all' ? '+ Create League' : undefined}
              onAction={canManage && activeTab === 'all' ? handleOpenCreateModal : undefined}
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#064E3B"
            />
          }
        />
      )}

      {/* Create League Modal Sheet */}
      <CreateLeagueModal
        visible={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateLeague}
        isCreating={isCreating}
      />

      {/* Standardized League Options Action Sheet (3-dot menu) */}
      <LeagueOptionsMenuModal
        visible={Boolean(optionsMenuLeague)}
        onClose={() => setOptionsMenuLeague(null)}
        league={optionsMenuLeague}
        canManage={canManage}
        isProcessing={isActionProcessing}
        onPublishPress={(l) => {
          setOptionsMenuLeague(null);
          void handlePublishLeague(l);
        }}
        onCloseRegistrationPress={(l) => {
          setOptionsMenuLeague(null);
          handleConfirmCloseRegistration(l);
        }}
        onStartLeaguePress={(l) => {
          setOptionsMenuLeague(null);
          handleConfirmStartLeague(l);
        }}
        onGenerateSchedulePress={(l) => {
          setOptionsMenuLeague(null);
          handleLeaguePress(l.id);
        }}
        onGeneratePlayoffsPress={(l) => {
          setOptionsMenuLeague(null);
          handleLeaguePress(l.id);
        }}
        onCompletePress={(l) => {
          setOptionsMenuLeague(null);
          handleConfirmCompleteLeague(l);
        }}
        onViewResultsPress={(l) => {
          setOptionsMenuLeague(null);
          handleLeaguePress(l.id);
        }}
        onManagePress={(l) => {
          setOptionsMenuLeague(null);
          handleLeaguePress(l.id);
        }}
        onCancelPress={(l) => {
          setOptionsMenuLeague(null);
          handleConfirmCancelLeague(l);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  drawerButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  titleContainer: {
    flex: 1,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 24,
  },
  screenSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  createButton: {
    backgroundColor: '#064E3B',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '600',
  },
  filterSectionContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 10,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  filterPillText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
});
