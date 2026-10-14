/**
 * Aught2 Pickleball — Explore Clubs Screen (Player Experience)
 *
 * Pixel-accurate implementation matching the reference design:
 * - Clean header with hamburger menu icon and "Explore Clubs" title
 * - Pill-shaped search bar with search and filter slider controls
 * - Hero banner with pickleball court image and "Play. Connect. Grow Together."
 * - Vertical list of white club cards with logo, location, operating hours, stats,
 *   ACTIVE badge, and full-width "View Club Profile" action
 * - Dynamic data driven by discover_public_clubs backend endpoint
 * - Live authoritative logo synchronization with owner-side updates
 */

import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Building2,
  Calendar,
  ChevronRight,
  LayoutGrid,
  MapPin,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
} from '@/components';
import { useClubDiscovery } from '@/hooks';
import { resolveMediaUrl } from '@/utils';
import type { Club } from '@/types';

function formatClubHours(
  days?: string | null,
  open?: string | null,
  close?: string | null,
): string | null {
  const formatTime12h = (t?: string | null): string | null => {
    if (!t) return null;
    const parts = t.split(':');
    if (parts.length < 2) return null;
    let h = parseInt(parts[0], 10);
    const m = parts[1];
    if (isNaN(h)) return null;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12;
    return `${h}:${m} ${ampm}`;
  };

  const openStr = formatTime12h(open);
  const closeStr = formatTime12h(close);
  const timeWindow = openStr && closeStr ? `${openStr} - ${closeStr}` : null;

  if (days && timeWindow) {
    return `${days}  |  ${timeWindow}`;
  }
  if (days) return days;
  if (timeWindow) return timeWindow;
  return null;
}

function ClubLogoView({ url, name, size = 64 }: { url?: string | null; name: string; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const fullUrl = resolveMediaUrl(url);

  if (!fullUrl || imgError) {
    return (
      <View style={[styles.placeholderLogo, { width: size, height: size }]}>
        <Building2 size={Math.round(size * 0.42)} color="#176B57" />
      </View>
    );
  }

  return (
    <View style={[styles.logoContainer, { width: size, height: size }]}>
      <Image
        source={{ uri: fullUrl }}
        style={styles.logoImage}
        resizeMode="cover"
        onError={() => setImgError(true)}
      />
    </View>
  );
}

export default function ExploreClubsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCity, setSelectedCity] = useState<string>('All');
  const [showFilterChips, setShowFilterChips] = useState(false);

  const {
    clubs,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useClubDiscovery({
    search: searchTerm.trim() || undefined,
    city: selectedCity !== 'All' ? selectedCity : undefined,
  });

  // Extract unique cities from club data for optional filter chips
  const availableCities = useMemo(() => {
    const set = new Set<string>();
    clubs.forEach((c) => {
      if (c.city && c.city.trim()) {
        set.add(c.city.trim());
      }
    });
    return ['All', ...Array.from(set)];
  }, [clubs]);

  const handleOpenClub = (club: Club) => {
    router.push({
      pathname: '/(player)/club-details' as any,
      params: { id: club.id },
    });
  };

  const renderClubCard = ({ item }: { item: Club }) => {
    const locationStr = [item.city, item.state].filter(Boolean).join(', ') || 'Facility Location';
    const hoursStr = formatClubHours(item.operating_days, item.opening_time, item.closing_time);

    const hasMembers = typeof item.member_count === 'number' && item.member_count > 0;
    const hasCourts = typeof item.court_count === 'number' && item.court_count > 0;

    return (
      <View style={styles.clubCard}>
        {/* Top Section: Logo + Club Info + ACTIVE Badge */}
        <View style={styles.cardTopRow}>
          <ClubLogoView url={item.logo_url} name={item.name} size={62} />

          <View style={styles.cardCenterCol}>
            {/* Club Name */}
            <AppText style={styles.clubName} numberOfLines={2}>
              {item.name}
            </AppText>

            {/* Location */}
            <View style={styles.metaRow}>
              <MapPin size={12.5} color="#667776" style={styles.metaIcon} />
              <AppText style={styles.metaText} numberOfLines={1}>
                {locationStr}
              </AppText>
            </View>

            {/* Operating Days & Hours */}
            {hoursStr ? (
              <View style={styles.metaRow}>
                <Calendar size={12.5} color="#667776" style={styles.metaIcon} />
                <AppText style={styles.metaText} numberOfLines={1}>
                  {hoursStr}
                </AppText>
              </View>
            ) : null}

            {/* Member & Court Stats */}
            {hasMembers || hasCourts ? (
              <View style={styles.statsRow}>
                {hasMembers ? (
                  <View style={styles.statItem}>
                    <Users size={13} color="#176B57" />
                    <AppText style={styles.statText}>
                      {item.member_count} Members
                    </AppText>
                  </View>
                ) : null}

                {hasCourts ? (
                  <View style={styles.statItem}>
                    <LayoutGrid size={13} color="#176B57" />
                    <AppText style={styles.statText}>
                      {item.court_count} Courts
                    </AppText>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* ACTIVE Badge */}
          <View style={styles.activeBadge}>
            <AppText style={styles.activeBadgeText}>ACTIVE</AppText>
          </View>
        </View>

        {/* Bottom Full-Width Action: View Club Profile */}
        <TouchableOpacity
          activeOpacity={0.82}
          onPress={() => handleOpenClub(item)}
          style={styles.cardActionBtn}
          accessibilityRole="button"
          accessibilityLabel={`View club profile for ${item.name}`}
        >
          <AppText style={styles.cardActionText}>View Club Profile</AppText>
          <ChevronRight size={15} color="#176B57" strokeWidth={2.2} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderHeader = () => (
    <View style={styles.listHeaderContainer}>
      {/* Search Input Bar */}
      <View style={styles.searchBarWrapper}>
        <View style={styles.searchBar}>
          <Search size={18} color="#667776" strokeWidth={2} style={styles.searchIcon} />
          <TextInput
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder="Search clubs by name, city, state..."
            placeholderTextColor="#8A9E98"
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchTerm ? (
            <TouchableOpacity
              onPress={() => setSearchTerm('')}
              style={styles.clearSearchBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={15} color="#667776" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => setShowFilterChips((prev) => !prev)}
            style={styles.filterIconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Filter by location"
          >
            <SlidersHorizontal
              size={18}
              color={selectedCity !== 'All' ? '#176B57' : '#102B2A'}
              strokeWidth={2}
            />
          </TouchableOpacity>
        </View>

        {/* Optional Location Filter Chips */}
        {showFilterChips && availableCities.length > 2 ? (
          <View style={styles.cityFilterRow}>
            {availableCities.map((city) => {
              const isSelected = selectedCity === city;
              return (
                <TouchableOpacity
                  key={city}
                  onPress={() => setSelectedCity(city)}
                  style={[styles.cityChip, isSelected && styles.cityChipSelected]}
                  activeOpacity={0.7}
                >
                  <AppText
                    style={[styles.cityChipText, isSelected && styles.cityChipTextSelected]}
                  >
                    {city}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </View>

      {/* Hero Banner */}
      <View style={styles.heroBannerCard}>
        <Image
          source={require('@/../assets/explore_banner.jpg')}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
        {/* Dark Teal Overlay for crisp typography */}
        <View style={styles.heroBannerOverlay} />

        <View style={styles.heroBannerContent}>
          {/* Badge */}
          <View style={styles.heroBannerTag}>
            <AppText style={styles.heroBannerTagText}>FIND YOUR CLUB</AppText>
          </View>

          {/* Headline */}
          <AppText style={styles.heroBannerHeadline}>
            Play. Connect.{'\n'}Grow Together.
          </AppText>

          {/* Subtitle */}
          <AppText style={styles.heroBannerSubtitle}>
            Discover amazing clubs near you{'\n'}and be part of a growing{'\n'}pickleball community.
          </AppText>
        </View>
      </View>
    </View>
  );

  return (
    <Screen style={styles.screen}>
      <AppHeader title="Explore Clubs" minimalIcon borderless />

      {isLoading && clubs.length === 0 ? (
        <LoadingState message="Discovering clubs..." />
      ) : error && clubs.length === 0 ? (
        <ErrorState
          title="Unable to Load Clubs"
          message={error.message || 'Network error occurred while fetching clubs.'}
          onRetry={() => refetch()}
        />
      ) : (
        <FlatList
          data={clubs}
          keyExtractor={(item) => item.id}
          renderItem={renderClubCard}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            <EmptyState
              title="No Clubs Found"
              description={
                searchTerm
                  ? `No clubs found matching "${searchTerm}". Try a different keyword.`
                  : 'No active clubs currently available for discovery.'
              }
              actionLabel="Clear Search"
              onAction={() => {
                setSearchTerm('');
                setSelectedCity('All');
              }}
            />
          }
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 90 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#176B57"
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F4F8F6',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  listHeaderContainer: {
    marginBottom: 6,
  },

  // ─── Search Bar ─────────────────────────────────────────────────────────────
  searchBarWrapper: {
    marginBottom: 14,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    paddingHorizontal: 16,
    height: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#102B2A',
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 4,
    marginRight: 6,
  },
  filterIconBtn: {
    padding: 4,
    marginLeft: 4,
  },
  cityFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  cityChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAE6',
  },
  cityChipSelected: {
    backgroundColor: '#176B57',
    borderColor: '#176B57',
  },
  cityChipText: {
    fontSize: 12,
    color: '#667776',
    fontWeight: '500',
  },
  cityChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // ─── Hero Banner ────────────────────────────────────────────────────────────
  heroBannerCard: {
    height: 172,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#0F3B30',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  heroBannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8, 38, 30, 0.74)',
  },
  heroBannerContent: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  heroBannerTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(19, 58, 48, 0.95)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(110, 231, 183, 0.35)',
  },
  heroBannerTagText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#6EE7B7',
    letterSpacing: 0.8,
  },
  heroBannerHeadline: {
    fontSize: 21,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 26,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  heroBannerSubtitle: {
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.92)',
    lineHeight: 16,
    maxWidth: '75%',
  },

  // ─── Club Card ──────────────────────────────────────────────────────────────
  clubCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  logoContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#E2EAE6',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  placeholderLogo: {
    borderRadius: 14,
    backgroundColor: '#EBF6F0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2EAE6',
  },
  cardCenterCol: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  clubName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102B2A',
    lineHeight: 21,
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  metaIcon: {
    flexShrink: 0,
  },
  metaText: {
    fontSize: 12.5,
    color: '#667776',
    fontWeight: '500',
    flexShrink: 1,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 14,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 11.5,
    color: '#334155',
    fontWeight: '600',
  },
  activeBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    alignSelf: 'flex-start',
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#166534',
    letterSpacing: 0.5,
  },
  cardActionBtn: {
    backgroundColor: '#F3F9F6',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#176B57',
  },
});
