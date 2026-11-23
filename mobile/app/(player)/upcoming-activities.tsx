/**
 * Aught2 Pickleball — Dedicated Player Upcoming Activities Discovery Screen
 *
 * Aggregates upcoming activities across multiple clubs:
 *   - Tournaments
 *   - Leagues
 *   - Events
 *   - Lessons & Coaching
 *
 * Implements:
 *   - Clean single-row segmented filter bar (All, Tournaments, Leagues, Events, Lessons)
 *   - Activity cards with type badges, status pills, start dates, hosting club, price, and images
 *   - Loading, empty, and error states
 *   - Pull-to-refresh and incremental "Load More" pagination
 *   - Reliable, type-aware navigation directly to the corresponding detail screens
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Calendar,
  CalendarHeart,
  ChevronRight,
  Clock,
  Compass,
  GraduationCap,
  MapPin,
  Medal,
  RefreshCw,
  Sparkles,
  Tag,
  Trophy,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { useUpcomingActivities } from '@/hooks';
import { Colors } from '@/theme';
import { formatCurrency, resolveMediaUrl } from '@/utils';
import type { UpcomingActivityItem, UpcomingActivityType } from '@/types';

type FilterType = 'all' | 'tournament' | 'league' | 'event' | 'lesson';

interface FilterOption {
  key: FilterType;
  label: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  { key: 'all', label: 'All' },
  { key: 'tournament', label: 'Tournaments' },
  { key: 'league', label: 'Leagues' },
  { key: 'event', label: 'Events' },
  { key: 'lesson', label: 'Lessons' },
];

function getActivityBadgeInfo(type: UpcomingActivityType) {
  switch (type) {
    case 'tournament':
      return {
        label: 'Tournament',
        icon: Trophy,
        bg: '#FEF3C7',
        color: '#B45309',
        border: '#FDE68A',
      };
    case 'league':
      return {
        label: 'League',
        icon: Medal,
        bg: '#E0E7FF',
        color: '#4338CA',
        border: '#C7D2FE',
      };
    case 'event':
      return {
        label: 'Event',
        icon: CalendarHeart,
        bg: '#DCFCE7',
        color: '#15803D',
        border: '#BBF7D0',
      };
    case 'lesson':
      return {
        label: 'Lesson',
        icon: GraduationCap,
        bg: '#F3E8FF',
        color: '#7E22CE',
        border: '#E9D5FF',
      };
    default:
      return {
        label: 'Activity',
        icon: Sparkles,
        bg: '#E2ECE6',
        color: '#176B57',
        border: '#CBD5E1',
      };
  }
}

function formatActivitySchedule(startIso: string, endIso?: string | null): string {
  try {
    const s = new Date(startIso);
    if (isNaN(s.getTime())) return startIso;

    const weekday = s.toLocaleDateString('en-GB', { weekday: 'short' });
    const day = s.getDate();
    const month = s.toLocaleDateString('en-GB', { month: 'short' });
    const year = s.getFullYear();

    const formatTime = (d: Date) => {
      let hours = d.getHours();
      const minutes = d.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const minStr = minutes < 10 ? `0${minutes}` : String(minutes);
      return `${hours}:${minStr} ${ampm}`;
    };

    const startTime = formatTime(s);

    if (endIso) {
      const e = new Date(endIso);
      if (!isNaN(e.getTime())) {
        const isSameDay =
          s.getFullYear() === e.getFullYear() &&
          s.getMonth() === e.getMonth() &&
          s.getDate() === e.getDate();

        if (isSameDay) {
          return `${weekday}, ${day} ${month} ${year} · ${startTime} – ${formatTime(e)}`;
        } else {
          const endWeekday = e.toLocaleDateString('en-GB', { weekday: 'short' });
          const endDay = e.getDate();
          const endMonth = e.toLocaleDateString('en-GB', { month: 'short' });
          return `${day} ${month} – ${endDay} ${endMonth} ${year}`;
        }
      }
    }

    return `${weekday}, ${day} ${month} ${year} · ${startTime}`;
  } catch {
    return startIso;
  }
}

const PAGE_SIZE = 25;

export default function PlayerUpcomingActivitiesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [selectedFilter, setSelectedFilter] = useState<FilterType>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const filterParam = selectedFilter === 'all' ? undefined : selectedFilter;

  const {
    activities,
    total,
    hasMore,
    isLoading,
    isError,
    refetch,
    isRefetching,
    isFetching,
  } = useUpcomingActivities({
    activity_type: filterParam,
    limit,
    offset: 0,
  });

  const handleFilterChange = (filter: FilterType) => {
    setSelectedFilter(filter);
    setLimit(PAGE_SIZE);
  };

  const handleLoadMore = () => {
    if (hasMore && !isFetching) {
      setLimit((prev) => prev + PAGE_SIZE);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(player)/' as any);
    }
  };

  const handleActivityPress = useCallback(
    (activity: UpcomingActivityItem) => {
      if (!activity.id || !activity.activity_type) {
        return;
      }

      switch (activity.activity_type) {
        case 'tournament':
          router.push({
            pathname: '/(player)/tournament-details',
            params: { id: activity.id },
          } as any);
          break;
        case 'league':
          router.push({
            pathname: '/(player)/league-details',
            params: { id: activity.id },
          } as any);
          break;
        case 'event':
          router.push({
            pathname: '/(player)/events',
            params: { id: activity.id, clubId: activity.club_id },
          } as any);
          break;
        case 'lesson':
          router.push({
            pathname: '/(player)/lessons',
            params: { id: activity.id, clubId: activity.club_id },
          } as any);
          break;
        default:
          break;
      }
    },
    [router]
  );

  const renderActivityCard = useCallback(
    ({ item }: { item: UpcomingActivityItem }) => {
      const badgeInfo = getActivityBadgeInfo(item.activity_type);
      const BadgeIcon = badgeInfo.icon;
      const scheduleText = formatActivitySchedule(item.start_date, item.end_date);

      const priceDisplay =
        item.price != null
          ? Number(item.price) === 0
            ? 'Free'
            : formatCurrency(item.price)
          : null;

      return (
        <Pressable
          style={({ pressed }) => [
            styles.cardContainer,
            pressed && styles.cardPressed,
          ]}
          onPress={() => handleActivityPress(item)}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}, ${badgeInfo.label} hosted by ${item.club_name}`}
        >
          {/* Activity Thumbnail or Branded Fallback */}
          {item.image_url ? (
            <Image
              source={{ uri: resolveMediaUrl(item.image_url) }}
              style={styles.cardThumbnail}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.cardThumbnailFallback, { backgroundColor: badgeInfo.bg }]}>
              <BadgeIcon size={30} color={badgeInfo.color} strokeWidth={1.8} />
            </View>
          )}

          {/* Activity Content */}
          <View style={styles.cardContentCol}>
            {/* Badges Row */}
            <View style={styles.cardBadgesRow}>
              {/* Type Badge */}
              <View style={[styles.typeBadge, { backgroundColor: badgeInfo.bg, borderColor: badgeInfo.border }]}>
                <BadgeIcon size={11} color={badgeInfo.color} strokeWidth={2.2} style={{ marginRight: 3.5 }} />
                <AppText style={[styles.typeBadgeText, { color: badgeInfo.color }]}>
                  {badgeInfo.label}
                </AppText>
              </View>

              {/* Status Badge */}
              <View
                style={[
                  styles.statusBadge,
                  item.is_registered ? styles.statusBadgeRegistered : styles.statusBadgeOpen,
                ]}
              >
                <AppText
                  style={[
                    styles.statusBadgeText,
                    item.is_registered ? styles.statusTextRegistered : styles.statusTextOpen,
                  ]}
                >
                  {item.is_registered ? 'Registered' : item.status_label}
                </AppText>
              </View>

              {/* Format Badge (if present) */}
              {item.format_label && (
                <View style={styles.formatBadge}>
                  <AppText style={styles.formatBadgeText} numberOfLines={1}>
                    {item.format_label}
                  </AppText>
                </View>
              )}
            </View>

            {/* Title */}
            <AppText style={styles.cardTitle} numberOfLines={3}>
              {item.title}
            </AppText>

            {/* Date & Time */}
            <View style={styles.metaRow}>
              <Calendar size={13} color="#527068" strokeWidth={1.9} />
              <AppText style={styles.metaText} numberOfLines={1}>
                {scheduleText}
              </AppText>
            </View>

            {/* Hosting Club */}
            <View style={styles.metaRow}>
              <Building2 size={13} color="#527068" strokeWidth={1.9} />
              <AppText style={styles.metaText} numberOfLines={1}>
                {item.club_name}
              </AppText>
            </View>

            {/* Footer Row: Pricing & Available Spots */}
            <View style={styles.footerRow}>
              {priceDisplay ? (
                <View style={styles.pricePill}>
                  <Tag size={11} color="#0E5E4C" strokeWidth={2} style={{ marginRight: 3 }} />
                  <AppText style={styles.priceText}>{priceDisplay}</AppText>
                </View>
              ) : null}

              {item.available_spots != null ? (
                <AppText style={styles.spotsText}>
                  {item.available_spots > 0 ? `${item.available_spots} spots available` : 'Full / Waitlist'}
                </AppText>
              ) : null}
            </View>
          </View>

          {/* Right Chevron */}
          <View style={styles.chevronCol}>
            <ChevronRight size={20} color="#94A3B8" strokeWidth={2} />
          </View>
        </Pressable>
      );
    },
    [handleActivityPress]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ─── Top Header ────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable
          onPress={handleBack}
          hitSlop={12}
          style={styles.backButton}
          accessibilityLabel="Back to Home"
          accessibilityRole="button"
        >
          <ArrowLeft size={22} color="#102B2A" strokeWidth={2.2} />
        </Pressable>

        <View style={styles.headerTitleCol}>
          <AppText style={styles.headerTitle}>Upcoming Activities</AppText>
          <AppText style={styles.headerSubtitle}>
            Discover what's happening across your clubs.
          </AppText>
        </View>
      </View>

      {/* ─── Filter Bar ────────────────────────────────────────────── */}
      <View style={styles.filterBarContainer}>
        <View style={styles.filterBarRow}>
          {FILTER_OPTIONS.map((opt) => {
            const isSelected = selectedFilter === opt.key;
            return (
              <Pressable
                key={opt.key}
                style={[
                  styles.filterPill,
                  isSelected && styles.filterPillActive,
                ]}
                onPress={() => handleFilterChange(opt.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <AppText
                  style={[
                    styles.filterPillText,
                    isSelected && styles.filterPillTextActive,
                  ]}
                >
                  {opt.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ─── Content List ──────────────────────────────────────────── */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#176B57" />
          <AppText style={styles.loadingText}>Loading activities across clubs...</AppText>
        </View>
      ) : isError ? (
        <View style={styles.errorContainer}>
          <AlertCircle size={40} color="#DC2626" strokeWidth={1.8} />
          <AppText style={styles.errorTitle}>Unable to load activities</AppText>
          <AppText style={styles.errorSubtitle}>
            Please check your connection and try again.
          </AppText>
          <Pressable style={styles.retryButton} onPress={() => refetch()}>
            <RefreshCw size={15} color="#FFFFFF" strokeWidth={2} style={{ marginRight: 6 }} />
            <AppText style={styles.retryButtonText}>Try Again</AppText>
          </Pressable>
        </View>
      ) : activities.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconPill}>
            <Compass size={36} color="#176B57" strokeWidth={1.7} />
          </View>
          <AppText style={styles.emptyTitle}>No Upcoming Activities Found</AppText>
          <AppText style={styles.emptySubtitle}>
            {selectedFilter !== 'all'
              ? `There are currently no active upcoming ${selectedFilter}s scheduled.`
              : 'Clubs will publish upcoming tournaments, leagues, events, and lessons soon. Check back shortly!'}
          </AppText>
          {selectedFilter !== 'all' && (
            <Pressable
              style={styles.resetFilterButton}
              onPress={() => setSelectedFilter('all')}
            >
              <AppText style={styles.resetFilterText}>Show All Activities</AppText>
            </Pressable>
          )}
        </View>
      ) : (
        <FlatList
          data={activities}
          renderItem={renderActivityCard}
          keyExtractor={(item) => `${item.activity_type}-${item.id}`}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 28 },
          ]}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            hasMore ? (
              <Pressable
                style={styles.loadMoreButton}
                onPress={handleLoadMore}
                disabled={isFetching}
              >
                {isFetching ? (
                  <ActivityIndicator size="small" color="#176B57" />
                ) : (
                  <AppText style={styles.loadMoreText}>Load More Activities</AppText>
                )}
              </Pressable>
            ) : activities.length > 0 ? (
              <View style={styles.endOfListIndicator}>
                <AppText style={styles.endOfListText}>All upcoming activities loaded</AppText>
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#176B57"
              colors={['#176B57']}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8F0EC',
    gap: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F0F5F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleCol: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#102B2A',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 1,
  },

  // Filter Bar
  filterBarContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2EF',
  },
  filterBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F3',
  },
  filterPillActive: {
    backgroundColor: '#176B57',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#556A65',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // List
  listContent: {
    padding: 16,
    gap: 12,
  },

  // Activity Card
  cardContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2ECE6',
    shadowColor: '#102B2A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    gap: 12,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  cardThumbnail: {
    width: 96,
    height: 96,
    borderRadius: 12,
  },
  cardThumbnailFallback: {
    width: 96,
    height: 96,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContentCol: {
    flex: 1,
    gap: 3.5,
  },
  cardBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 1,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadgeOpen: {
    backgroundColor: '#E0F2FE',
  },
  statusTextOpen: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
  },
  statusBadgeRegistered: {
    backgroundColor: '#DCFCE7',
  },
  statusTextRegistered: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  formatBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  formatBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102B2A',
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 12,
    color: '#556A65',
    fontWeight: '500',
    flex: 1,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  pricePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5EE',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  priceText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0E5E4C',
  },
  spotsText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  chevronCol: {
    paddingLeft: 2,
  },

  // Loading, Error & Empty States
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#102B2A',
    marginTop: 6,
  },
  errorSubtitle: {
    fontSize: 13.5,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 280,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#176B57',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    marginTop: 12,
  },
  retryButtonText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 36,
    gap: 8,
  },
  emptyIconPill: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#E8F5EE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#102B2A',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 300,
  },
  resetFilterButton: {
    backgroundColor: '#E8F5EE',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9,
    marginTop: 10,
  },
  resetFilterText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#176B57',
  },
  loadMoreButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4E5DC',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  loadMoreText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#176B57',
  },
  endOfListIndicator: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endOfListText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
});
