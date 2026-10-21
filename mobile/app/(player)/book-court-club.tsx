/**
 * Aught2 Pickleball — Book a Court: Club Selection Screen
 *
 * This is the mandatory first step of the Player-side court booking flow.
 * Players must pick which club they want to book at before seeing any
 * court schedule. Only clubs where the player has an ACTIVE membership
 * are shown as bookable; clubs with other statuses are shown with a
 * clear status explanation and no book button.
 *
 * Entry points that navigate here:
 *   - Drawer "Book a Court"
 *   - Bottom-nav center "Book" FAB
 *   - Player Home "Find a Court →" hero button
 *
 * On club selection → navigates to /(player)/courts?clubId=<id>
 * The courts screen is always club-scoped via the explicit clubId param.
 */

import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Clock,
  Compass,
  MapPin,
  XCircle,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
} from '@/components';
import { usePlayerClubs } from '@/hooks';
import { resolveMediaUrl } from '@/utils';
import type { PlayerClub } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

type BookingEligibility = 'bookable' | 'pending' | 'expired' | 'inactive';

function getEligibility(status: string): BookingEligibility {
  switch (status) {
    case 'active':  return 'bookable';
    case 'pending': return 'pending';
    case 'expired': return 'expired';
    default:        return 'inactive';
  }
}

function buildLocation(club: PlayerClub): string {
  const parts: string[] = [];
  if (club.city)  parts.push(club.city);
  if (club.state) parts.push(club.state);
  return parts.join(', ');
}

// ─── Club Logo ───────────────────────────────────────────────────────────────

function ClubLogo({ url, name }: { url?: string | null; name: string }) {
  const [imgError, setImgError] = useState(false);
  const fullUrl = resolveMediaUrl(url);

  if (!fullUrl || imgError) {
    return (
      <View style={styles.logoPlaceholder}>
        <Building2 size={26} color="#176B57" />
      </View>
    );
  }

  return (
    <View style={styles.logoWrapper}>
      <Image
        source={{ uri: fullUrl }}
        style={styles.logoImage}
        resizeMode="cover"
        onError={() => setImgError(true)}
      />
    </View>
  );
}

// ─── Club Card ───────────────────────────────────────────────────────────────

interface ClubCardProps {
  club: PlayerClub;
  onBook: (clubId: string) => void;
  onViewProfile: (clubId: string) => void;
}

function ClubCard({ club, onBook, onViewProfile }: ClubCardProps) {
  const eligibility = getEligibility(club.status);
  const location    = buildLocation(club);
  const isBookable  = eligibility === 'bookable';

  const STATUS_CONFIG: Record<BookingEligibility, { label: string; color: string; bg: string; IconComp: React.ComponentType<any> }> = {
    bookable: { label: 'Active Member',       color: '#166534', bg: '#DCFCE7', IconComp: BadgeCheck },
    pending:  { label: 'Pending Approval',    color: '#92400E', bg: '#FEF3C7', IconComp: Clock      },
    expired:  { label: 'Membership Expired',  color: '#991B1B', bg: '#FEE2E2', IconComp: XCircle    },
    inactive: { label: 'Inactive',            color: '#374151', bg: '#F3F4F6', IconComp: XCircle    },
  };

  const { label, color, bg, IconComp } = STATUS_CONFIG[eligibility];

  return (
    <View style={[styles.card, !isBookable && styles.cardDimmed]}>
      {/* Header row: logo + name + location */}
      <View style={styles.cardHeader}>
        <ClubLogo url={club.logo_url} name={club.club_name} />
        <View style={styles.cardInfo}>
          <AppText style={styles.clubName} numberOfLines={2}>{club.club_name}</AppText>
          {location ? (
            <View style={styles.locationRow}>
              <MapPin size={12} color="#6B7280" />
              <AppText style={styles.locationText} numberOfLines={1}>{location}</AppText>
            </View>
          ) : null}
        </View>
      </View>

      {/* Membership status badge */}
      <View style={[styles.statusBadge, { backgroundColor: bg }]}>
        <IconComp size={13} color={color} />
        <AppText style={[styles.statusLabel, { color }]}>{label}</AppText>
      </View>

      {/* Short description */}
      {club.short_description ? (
        <AppText style={styles.description} numberOfLines={2}>{club.short_description}</AppText>
      ) : null}

      {/* CTA */}
      {isBookable ? (
        <TouchableOpacity
          style={styles.bookButton}
          onPress={() => onBook(club.club_id)}
          activeOpacity={0.82}
          accessibilityLabel={`View courts and book at ${club.club_name}`}
          accessibilityRole="button"
        >
          <AppText style={styles.bookButtonText}>View Courts & Book</AppText>
          <ArrowRight size={15} color="#FFFFFF" strokeWidth={2.4} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => onViewProfile(club.club_id)}
          activeOpacity={0.82}
          accessibilityLabel={`View ${club.club_name} profile`}
          accessibilityRole="button"
        >
          <AppText style={styles.profileButtonText}>View Club Profile</AppText>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function BookCourtClubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    clubs,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = usePlayerClubs();

  // Bookable clubs first, then pending, then others
  const sortedClubs = useMemo(() => {
    const order: Record<string, number> = { active: 0, pending: 1, expired: 2 };
    return [...clubs].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
  }, [clubs]);

  const bookableCount = sortedClubs.filter(c => c.status === 'active').length;

  const handleBook = (clubId: string) => {
    // Navigate to courts with explicit clubId — stale selections cannot carry over
    router.push(`/(player)/courts?clubId=${clubId}` as any);
  };

  const handleViewProfile = (clubId: string) => {
    router.push(`/(player)/club-details?id=${clubId}` as any);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Screen safeArea={false} style={styles.screen}>
      <AppHeader
        title="Book a Court"
        subtitle="Choose a club to see courts"
        showMenu
        borderless
      />

      {isLoading ? (
        <LoadingState message="Loading your clubs…" />
      ) : error ? (
        <ErrorState
          message="Could not load your clubs. Check your connection and try again."
          onRetry={refetch}
        />
      ) : sortedClubs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <EmptyState
            title="No Club Memberships"
            description="You haven't joined any clubs yet. Explore clubs, request membership, and come back to book courts."
          />
          <TouchableOpacity
            style={styles.exploreButton}
            onPress={() => router.push('/(player)/explore-clubs' as any)}
            activeOpacity={0.82}
            accessibilityRole="button"
          >
            <Compass size={16} color="#FFFFFF" />
            <AppText style={styles.exploreButtonText}>Explore Clubs</AppText>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sortedClubs}
          keyExtractor={item => item.club_id}
          renderItem={({ item }) => (
            <ClubCard
              club={item}
              onBook={handleBook}
              onViewProfile={handleViewProfile}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor="#176B57"
              colors={['#176B57']}
            />
          }
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 96 },
          ]}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <AppText style={styles.listHeaderCount}>
                {bookableCount > 0
                  ? `${bookableCount} club${bookableCount === 1 ? '' : 's'} ready to book`
                  : 'No bookable clubs yet'}
              </AppText>
              {bookableCount === 0 && (
                <TouchableOpacity
                  onPress={() => router.push('/(player)/explore-clubs' as any)}
                  hitSlop={8}
                  accessibilityRole="link"
                >
                  <AppText style={styles.listHeaderLink}>Explore Clubs →</AppText>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}
    </Screen>
  );
}

// ─── Stylesheet ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F4F8F6',
  },

  // Empty / no clubs
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 20,
  },
  exploreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#176B57',
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderRadius: 100,
    shadowColor: '#176B57',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  exploreButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  // List
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 2,
    marginBottom: 2,
  },
  listHeaderCount: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    flex: 1,
  },
  listHeaderLink: {
    fontSize: 13,
    color: '#176B57',
    fontWeight: '700',
  },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E8F0EC',
  },
  cardDimmed: {
    opacity: 0.82,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },

  // Logo
  logoWrapper: {
    width: 58,
    height: 58,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F0F7F4',
    flexShrink: 0,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoPlaceholder: {
    width: 58,
    height: 58,
    borderRadius: 12,
    backgroundColor: '#E8F4F0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Info
  cardInfo: {
    flex: 1,
    gap: 5,
    justifyContent: 'center',
  },
  clubName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F2823',
    lineHeight: 21,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 12.5,
    color: '#6B7280',
    flex: 1,
  },

  // Status badge
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Description
  description: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
  },

  // Book button
  bookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#176B57',
    paddingVertical: 13,
    borderRadius: 12,
    shadowColor: '#176B57',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  bookButtonText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: 0.1,
  },

  // View profile button
  profileButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
  },
  profileButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
});
