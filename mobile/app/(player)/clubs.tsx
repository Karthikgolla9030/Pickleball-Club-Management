/**
 * Aught2 Pickleball — Player Enrolled Club Screen
 * Displays full club details, location, facilities, operating hours, and membership status for the active club.
 */

import React from 'react';
import {
  Image,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Building2,
  Calendar,
  Clock,
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Sparkles,
  UserCheck,
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
import { usePlayerClubs } from '@/hooks';
import { Colors, Radius, Shadows, Spacing } from '@/theme';
import type { PlayerClub, PlayerMembershipStatus } from '@/types';

function getStatusBadgeVariant(
  status: PlayerMembershipStatus,
): 'success' | 'warning' | 'error' | 'default' {
  switch (status) {
    case 'active':
      return 'success';
    case 'suspended':
      return 'warning';
    case 'expired':
      return 'error';
    case 'inactive':
    default:
      return 'default';
  }
}

function getFullImageUrl(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null;
  const clean = url.trim();
  if (clean.startsWith('http') || clean.startsWith('data:')) return clean;
  const base = API_ENDPOINTS.BASE.replace(/\/$/, '');
  const path = clean.startsWith('/') ? clean : `/${clean}`;
  return `${base}${path}`;
}

function formatDays(days: string[] | string | null | undefined): string {
  if (!days) return '7 Days a Week';
  if (Array.isArray(days)) {
    return days.length === 7 ? '7 Days a Week (Mon – Sun)' : days.join(', ');
  }
  const split = days.split(',').map((d) => d.trim()).filter(Boolean);
  return split.length === 7 ? '7 Days a Week (Mon – Sun)' : split.join(', ');
}

export default function PlayerClubsScreen() {
  const insets = useSafeAreaInsets();
  const { clubs, isLoading, isRefetching, error, refetch } = usePlayerClubs();

  if (isLoading && clubs.length === 0) {
    return (
      <Screen style={styles.screenContainer}>
        <AppHeader title="My Club" />
        <LoadingState message="Loading club details..." />
      </Screen>
    );
  }

  if (error && clubs.length === 0) {
    return (
      <Screen style={styles.screenContainer}>
        <AppHeader title="My Club" />
        <ErrorState
          title="Unable to Load Club"
          message={error.message || 'A network error occurred.'}
          onRetry={() => refetch()}
        />
      </Screen>
    );
  }

  const myClub =
    clubs.find((c) => c.club_name.toLowerCase().includes('pickleball')) ||
    clubs[0];

  const logoUri = getFullImageUrl(myClub?.logo_url);
  const joinedFormatted = myClub?.joined_at
    ? new Date(myClub.joined_at).toLocaleDateString()
    : 'N/A';
  const expiresFormatted = myClub?.expires_at
    ? new Date(myClub.expires_at).toLocaleDateString()
    : 'Ongoing / Lifetime';

  const fullAddress = [
    myClub?.address_line1,
    myClub?.address_line2,
    myClub?.city,
    myClub?.state,
    myClub?.postal_code,
  ]
    .filter(Boolean)
    .join(', ');

  const handleOpenDirections = () => {
    if (!fullAddress) return;
    const query = encodeURIComponent(
      `${myClub?.club_name || ''} ${fullAddress}`.trim()
    );
    const url = Platform.select({
      ios: `maps:0,0?q=${query}`,
      android: `geo:0,0?q=${query}`,
      default: `https://www.google.com/maps/search/?api=1&query=${query}`,
    });
    if (url) {
      Linking.openURL(url);
    }
  };

  return (
    <Screen style={styles.screenContainer}>
      <AppHeader
        title="My Club"
        subtitle="Facility overview and membership details"
        borderless
      />

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#176F5B"
          />
        }
      >
        {!myClub ? (
          <EmptyState
            title="No Club Found"
            description="You are not enrolled in the club yet. Ask your club administrator to enroll your email address."
          />
        ) : (
          <View style={styles.contentWrapper}>
            {/* 1. Hero Card: Branding, Name, Tagline */}
            <Card style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <View style={styles.logoBox}>
                  {logoUri ? (
                    <Image
                      source={{ uri: logoUri }}
                      style={styles.logoImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <Building2 size={36} color="#176F5B" />
                  )}
                </View>

                <View style={styles.heroTitleBlock}>
                  <AppText style={styles.clubName} numberOfLines={2}>
                    {myClub.club_name}
                  </AppText>
                  {myClub.city || myClub.state ? (
                    <View style={styles.locationPill}>
                      <MapPin size={13} color="#667776" />
                      <AppText style={styles.locationPillText}>
                        {[myClub.city, myClub.state].filter(Boolean).join(', ')}
                      </AppText>
                    </View>
                  ) : null}
                  {myClub.established_year ? (
                    <AppText style={styles.estYearText}>
                      Established {myClub.established_year}
                    </AppText>
                  ) : null}
                </View>
              </View>

              {myClub.short_description ? (
                <View style={styles.taglineBox}>
                  <AppText style={styles.taglineText}>
                    "{myClub.short_description}"
                  </AppText>
                </View>
              ) : null}
            </Card>

            {/* 2. Membership Status Card */}
            <Card style={styles.membershipCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionIconBadge}>
                  <UserCheck size={16} color="#176F5B" />
                </View>
                <View style={styles.sectionTitleBlock}>
                  <AppText style={styles.sectionTitle}>Your Membership</AppText>
                  {myClub.membership_number ? (
                    <AppText style={styles.sectionSubtitle}>
                      Member #{myClub.membership_number}
                    </AppText>
                  ) : null}
                </View>
                <Badge
                  label={myClub.status.toUpperCase()}
                  variant={getStatusBadgeVariant(myClub.status)}
                />
              </View>

              <View style={styles.membershipGrid}>
                <View style={styles.membershipCol}>
                  <AppText style={styles.metaLabel}>Joined</AppText>
                  <AppText style={styles.metaValue}>{joinedFormatted}</AppText>
                </View>
                <View style={styles.membershipCol}>
                  <AppText style={styles.metaLabel}>Valid Through</AppText>
                  <AppText style={styles.metaValue}>{expiresFormatted}</AppText>
                </View>
              </View>
            </Card>

            {/* 3. About the Club */}
            {myClub.description ? (
              <Card style={styles.detailCard}>
                <AppText style={styles.cardHeaderTitle}>About</AppText>
                <AppText style={styles.bodyDescription}>
                  {myClub.description}
                </AppText>
              </Card>
            ) : null}

            {/* 4. Operating Hours */}
            <Card style={styles.detailCard}>
              <View style={styles.cardHeaderWithIcon}>
                <Clock size={18} color="#176F5B" />
                <AppText style={styles.cardHeaderTitle}>Hours & Schedule</AppText>
              </View>

              <View style={styles.hoursRow}>
                <AppText style={styles.hoursLabel}>Operating Days:</AppText>
                <AppText style={styles.hoursVal}>
                  {formatDays(myClub.operating_days)}
                </AppText>
              </View>

              {myClub.opening_time && myClub.closing_time ? (
                <View style={styles.hoursRow}>
                  <AppText style={styles.hoursLabel}>Facility Hours:</AppText>
                  <AppText style={styles.hoursVal}>
                    {myClub.opening_time.slice(0, 5)} –{' '}
                    {myClub.closing_time.slice(0, 5)} (
                    {myClub.timezone
                      ? myClub.timezone.split('/')[1] || myClub.timezone
                      : 'ET'}
                    )
                  </AppText>
                </View>
              ) : null}
            </Card>

            {/* 5. Location & Directions */}
            {fullAddress ? (
              <Card style={styles.detailCard}>
                <View style={styles.cardHeaderWithIcon}>
                  <MapPin size={18} color="#176F5B" />
                  <AppText style={styles.cardHeaderTitle}>Location</AppText>
                </View>

                <View style={styles.addressBlock}>
                  {myClub.address_line1 ? (
                    <AppText style={styles.addressLine}>
                      {myClub.address_line1}
                    </AppText>
                  ) : null}
                  {myClub.address_line2 ? (
                    <AppText style={styles.addressLine}>
                      {myClub.address_line2}
                    </AppText>
                  ) : null}
                  <AppText style={styles.addressLine}>
                    {[myClub.city, myClub.state, myClub.postal_code]
                      .filter(Boolean)
                      .join(' ')}
                  </AppText>
                  {myClub.country ? (
                    <AppText style={styles.addressCountry}>
                      {myClub.country}
                    </AppText>
                  ) : null}
                </View>

                <TouchableOpacity
                  style={styles.directionsBtn}
                  onPress={handleOpenDirections}
                  activeOpacity={0.8}
                >
                  <Navigation size={15} color="#176F5B" />
                  <AppText style={styles.directionsBtnText}>
                    Get Directions
                  </AppText>
                </TouchableOpacity>
              </Card>
            ) : null}

            {/* 6. Facilities & Amenities */}
            {myClub.facilities_summary ? (
              <Card style={styles.detailCard}>
                <View style={styles.cardHeaderWithIcon}>
                  <Sparkles size={18} color="#176F5B" />
                  <AppText style={styles.cardHeaderTitle}>
                    Facilities & Amenities
                  </AppText>
                </View>
                <AppText style={styles.bodyDescription}>
                  {myClub.facilities_summary}
                </AppText>
              </Card>
            ) : null}

            {/* 7. Contact Information */}
            {(myClub.contact_email || myClub.contact_phone || myClub.website) ? (
              <Card style={styles.detailCard}>
                <View style={styles.cardHeaderWithIcon}>
                  <Phone size={18} color="#176F5B" />
                  <AppText style={styles.cardHeaderTitle}>Contact</AppText>
                </View>

                {myClub.contact_email ? (
                  <TouchableOpacity
                    style={styles.contactRow}
                    onPress={() =>
                      Linking.openURL(`mailto:${myClub.contact_email}`)
                    }
                  >
                    <Mail size={16} color="#176F5B" />
                    <AppText style={styles.contactLink}>
                      {myClub.contact_email}
                    </AppText>
                  </TouchableOpacity>
                ) : null}

                {myClub.contact_phone ? (
                  <TouchableOpacity
                    style={styles.contactRow}
                    onPress={() => Linking.openURL(`tel:${myClub.contact_phone}`)}
                  >
                    <Phone size={16} color="#176F5B" />
                    <AppText style={styles.contactLink}>
                      {myClub.contact_phone}
                    </AppText>
                  </TouchableOpacity>
                ) : null}

                {myClub.website ? (
                  <TouchableOpacity
                    style={styles.contactRow}
                    onPress={() => Linking.openURL(myClub.website!)}
                  >
                    <Globe size={16} color="#176F5B" />
                    <AppText style={styles.contactLink}>
                      {myClub.website}
                    </AppText>
                    <ExternalLink size={12} color="#176F5B" />
                  </TouchableOpacity>
                ) : null}
              </Card>
            ) : null}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#F4F8F5',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[2],
  },
  contentWrapper: {
    gap: Spacing[4],
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#E2EAE6',
    gap: Spacing[3],
    ...Shadows.sm,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
  },
  logoBox: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F0F5F2',
    borderWidth: 1.5,
    borderColor: '#D4E5DE',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  logoImg: {
    width: 68,
    height: 68,
  },
  heroTitleBlock: {
    flex: 1,
    gap: 3,
  },
  clubName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#102B2A',
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationPillText: {
    fontSize: 13,
    color: '#667776',
  },
  estYearText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8A9C96',
  },
  taglineBox: {
    backgroundColor: '#F8FAF9',
    padding: Spacing[3],
    borderRadius: Radius.md,
    borderLeftWidth: 3,
    borderLeftColor: '#176F5B',
  },
  taglineText: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#2A4540',
    lineHeight: 18,
  },
  membershipCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#E2EAE6',
    gap: Spacing[3],
    ...Shadows.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  sectionIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E5F6EC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitleBlock: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102B2A',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#667776',
  },
  membershipGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2',
    paddingTop: Spacing[2.5],
  },
  membershipCol: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 11,
    color: '#8A9C96',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#102B2A',
    marginTop: 2,
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: '#E2EAE6',
    gap: Spacing[2.5],
    ...Shadows.sm,
  },
  cardHeaderWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102B2A',
  },
  bodyDescription: {
    fontSize: 13,
    color: '#49635E',
    lineHeight: 20,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  hoursLabel: {
    fontSize: 13,
    color: '#667776',
  },
  hoursVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#102B2A',
  },
  addressBlock: {
    gap: 2,
  },
  addressLine: {
    fontSize: 14,
    color: '#2A4540',
  },
  addressCountry: {
    fontSize: 13,
    fontWeight: '600',
    color: '#667776',
    marginTop: 2,
  },
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    alignSelf: 'flex-start',
    backgroundColor: '#E5F6EC',
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    marginTop: Spacing[1],
  },
  directionsBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#176F5B',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingVertical: 3,
  },
  contactLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#176F5B',
    textDecorationLine: 'underline',
  },
});
