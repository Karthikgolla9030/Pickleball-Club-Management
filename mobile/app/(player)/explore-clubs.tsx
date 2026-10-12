/**
 * Aught2 Pickleball — Explore Clubs Screen (Public Club Discovery)
 *
 * Dedicated player discovery experience:
 * - Search by club name & keywords
 * - Filter by location (city / state)
 * - Club cards with public facility, location, and hours info
 * - Direct navigation to public club details
 * - Loading, empty, and error states with pull-to-refresh
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
  ChevronRight,
  Clock,
  Compass,
  MapPin,
  Search,
  Sparkles,
  X,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
} from '@/components';
import { API_ENDPOINTS } from '@/constants';
import { useClubDiscovery } from '@/hooks';
import { Colors, Radius, Spacing } from '@/theme';
import type { Club } from '@/types';

function getFullImageUrl(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null;
  const clean = url.trim();
  if (clean.startsWith('http') || clean.startsWith('data:')) return clean;
  const base = API_ENDPOINTS.BASE.replace(/\/$/, '');
  const path = clean.startsWith('/') ? clean : `/${clean}`;
  return `${base}${path}`;
}

export default function ExploreClubsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCity, setSelectedCity] = useState<string>('All');

  const {
    clubs,
    total,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useClubDiscovery({
    search: searchTerm.trim() || undefined,
    city: selectedCity !== 'All' ? selectedCity : undefined,
  });

  // Extract unique cities for filter chips
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
    const logoUri = getFullImageUrl(item.logo_url);
    const locationStr = [item.city, item.state].filter(Boolean).join(', ') || 'Location upon request';

    return (
      <Card style={styles.clubCard}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => handleOpenClub(item)}
          style={styles.cardTouchable}
          accessibilityRole="button"
          accessibilityLabel={`View details for ${item.name}`}
        >
          {/* Header Row: Logo + Titles */}
          <View style={styles.cardHeader}>
            <View style={styles.logoWrapper}>
              {logoUri ? (
                <Image
                  source={{ uri: logoUri }}
                  style={styles.clubLogo}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.placeholderLogo}>
                  <Building2 size={24} color="#18794E" />
                </View>
              )}
            </View>

            <View style={styles.cardTitleCol}>
              <View style={styles.nameRow}>
                <AppText variant="heading3" numberOfLines={1} style={styles.clubName}>
                  {item.name}
                </AppText>
                <Badge label="Active" variant="success" size="sm" />
              </View>

              <View style={styles.locationRow}>
                <MapPin size={13} color="#667776" />
                <AppText variant="caption" color="secondary" numberOfLines={1}>
                  {locationStr}
                </AppText>
              </View>
            </View>
          </View>

          {/* Description */}
          {item.short_description ? (
            <AppText
              variant="bodySmall"
              color="secondary"
              numberOfLines={2}
              style={styles.cardDesc}
            >
              {item.short_description}
            </AppText>
          ) : null}

          {/* Info Pills */}
          <View style={styles.pillRow}>
            {item.operating_days ? (
              <View style={styles.infoPill}>
                <Clock size={12} color="#18794E" />
                <AppText variant="caption" color="primary" numberOfLines={1} style={styles.pillText}>
                  {item.operating_days}
                </AppText>
              </View>
            ) : null}

            {item.facilities_summary ? (
              <View style={styles.infoPill}>
                <Sparkles size={12} color="#18794E" />
                <AppText variant="caption" color="primary" numberOfLines={1} style={styles.pillText}>
                  {item.facilities_summary}
                </AppText>
              </View>
            ) : null}
          </View>

          {/* Footer Action */}
          <View style={styles.cardFooter}>
            <AppText variant="label" color="primary" style={styles.viewDetailsText}>
              View Club Profile
            </AppText>
            <ChevronRight size={16} color="#18794E" />
          </View>
        </TouchableOpacity>
      </Card>
    );
  };

  return (
    <Screen style={styles.screen}>
      <AppHeader title="Explore Clubs" />

      {/* Search Header */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Search size={18} color="#667776" style={styles.searchIcon} />
          <TextInput
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder="Search clubs by name, city, state..."
            placeholderTextColor="#8A9B95"
            style={styles.searchInput}
            returnKeyType="search"
          />
          {searchTerm ? (
            <TouchableOpacity
              onPress={() => setSearchTerm('')}
              style={styles.clearBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={16} color="#667776" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* City Filter Pills */}
        {availableCities.length > 2 ? (
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
                    variant="caption"
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

      {/* Main List Area */}
      {isLoading && clubs.length === 0 ? (
        <LoadingState message="Discovering clubs..." />
      ) : error && clubs.length === 0 ? (
        <ErrorState
          title="Unable to Load Clubs"
          message={error.message || 'Network error occurred.'}
          onRetry={() => refetch()}
        />
      ) : clubs.length === 0 ? (
        <EmptyState
          title="No Clubs Found"
          description={
            searchTerm
              ? `No clubs found matching "${searchTerm}". Try a different keyword.`
              : 'No active clubs currently available for public discovery.'
          }
          actionLabel="Clear Search"
          onAction={() => {
            setSearchTerm('');
            setSelectedCity('All');
          }}
        />
      ) : (
        <FlatList
          data={clubs}
          keyExtractor={(item) => item.id}
          renderItem={renderClubCard}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 100 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#18794E"
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
    backgroundColor: '#F5F8F7',
  },
  searchContainer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2EAE6',
    gap: Spacing.xs,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF3F0',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    height: 42,
  },
  searchIcon: {
    marginRight: Spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 14,
    color: '#102B2A',
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 4,
  },
  cityFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingVertical: 4,
  },
  cityChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: '#EEF3F0',
    borderWidth: 1,
    borderColor: '#E2EAE6',
  },
  cityChipSelected: {
    backgroundColor: '#E4F4EC',
    borderColor: '#18794E',
  },
  cityChipText: {
    color: '#495D59',
  },
  cityChipTextSelected: {
    color: '#18794E',
    fontWeight: '600',
  },
  listContent: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  clubCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    overflow: 'hidden',
  },
  cardTouchable: {
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  logoWrapper: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#E4F4EC',
  },
  clubLogo: {
    width: '100%',
    height: '100%',
  },
  placeholderLogo: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleCol: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  clubName: {
    flex: 1,
    color: '#102B2A',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardDesc: {
    marginTop: 2,
    lineHeight: 18,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0F6F3',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    maxWidth: '100%',
  },
  pillText: {
    fontSize: 11,
    color: '#144638',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2',
  },
  viewDetailsText: {
    color: '#18794E',
    fontWeight: '600',
    fontSize: 13,
  },
});
