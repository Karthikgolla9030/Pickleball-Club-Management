/**
 * Aught2 Pickleball — Standalone Public Club Profile
 *
 * Dedicated public-facing club profile accessible to:
 * - Platform Administrators (previewing public facility presentation safely without session mutation)
 * - Club Staff (inspecting how their facility appears publicly)
 * - Players (direct deep-link browsing)
 * - Public/Unauthenticated visitors (guest discovery)
 *
 * Security & Session Boundaries:
 * - NEVER mounts player-side bottom navigation or player drawer
 * - NEVER treats Platform Administrators or Club Staff as "Players"
 * - NEVER modifies or overrides the active user session or credentials
 * - Authoritative read-only public endpoints only
 */

import React, { useMemo, useState } from 'react';
import {
  Image,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Crown,
  ExternalLink,
  Globe,
  Info,
  LayoutGrid,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
} from 'lucide-react-native';

import { AppText, Button, Card, ErrorState, LoadingState, Screen } from '@/components';
import { clubsApi, courtApi, membershipApi } from '@/services/api';
import { Colors, Radius, Spacing } from '@/theme';
import { formatCurrency, resolveMediaUrl } from '@/utils';
import { useAuthStore } from '@/store';
import { isPlatformAdminEmail } from '@/constants';
import type { Club, MembershipPlan, PlayerCourt } from '@/types';

const DEFAULT_BANNER = require('../../assets/explore_banner.jpg');
const DEFAULT_LOGO = require('../../assets/pickleball_logo_primary.png');

function formatOperatingHours(openingTime?: string | null, closingTime?: string | null): string {
  if (!openingTime || !closingTime) return '6:00 AM - 10:00 PM';
  const formatTime = (t: string) => {
    const parts = String(t).split(':');
    if (parts.length < 2) return String(t);
    let hour = parseInt(parts[0], 10);
    const minute = parts[1];
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    if (hour === 0) hour = 12;
    return `${hour}:${minute} ${ampm}`;
  };
  return `${formatTime(String(openingTime))} - ${formatTime(String(closingTime))}`;
}

export default function StandalonePublicClubScreen() {
  const params = useLocalSearchParams<{ id?: string; slug?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const memberships = useAuthStore((s) => s.memberships);
  const activePortal = useAuthStore((s) => s.activePortal);

  const identifier = params.id || params.slug || '';

  const [logoError, setLogoError] = useState(false);
  const [bannerError, setBannerError] = useState(false);

  // 1. Fetch public club data (safe public endpoint)
  const {
    data: club,
    isLoading: isLoadingClub,
    isRefetching: isRefetchingClub,
    error: clubError,
    refetch: refetchClub,
  } = useQuery<Club, Error>({
    queryKey: ['public-club', identifier],
    queryFn: () => clubsApi.getPublicClub(identifier),
    enabled: Boolean(identifier),
  });

  // 2. Fetch active courts for this club (informational)
  const effectiveClubId = club?.id;
  const {
    data: activeCourts = [],
    isLoading: isLoadingCourts,
    refetch: refetchCourts,
  } = useQuery<PlayerCourt[], Error>({
    queryKey: ['public-club-courts', effectiveClubId],
    queryFn: () => (effectiveClubId ? courtApi.getPlayerCourts(effectiveClubId) : Promise.resolve([])),
    enabled: Boolean(effectiveClubId),
  });

  // 3. Fetch public membership plans (informational)
  const {
    data: membershipPlans = [],
    isLoading: isLoadingPlans,
    refetch: refetchPlans,
  } = useQuery<MembershipPlan[], Error>({
    queryKey: ['public-club-plans', effectiveClubId],
    queryFn: () => (effectiveClubId ? membershipApi.listPlans(effectiveClubId, 'active') : Promise.resolve([])),
    enabled: Boolean(effectiveClubId),
  });

  const onRefresh = async () => {
    await Promise.all([refetchClub(), refetchCourts(), refetchPlans()]);
  };

  const handleReturn = () => {
    const isPlatformAdmin = Boolean(
      user?.is_platform_admin || isPlatformAdminEmail(user?.email) || activePortal === 'platform'
    );
    if (isPlatformAdmin) {
      router.replace('/platform/clubs' as any);
    } else if (memberships.length > 0 || activePortal === 'club') {
      router.replace('/(club)' as any);
    } else if (isAuthenticated) {
      router.replace('/(player)' as any);
    } else {
      router.replace('/(auth)/login' as any);
    }
  };

  if (isLoadingClub) {
    return (
      <Screen style={styles.screen}>
        <LoadingState message="Loading club details..." />
      </Screen>
    );
  }

  if (clubError || !club) {
    return (
      <Screen style={styles.screen}>
        <View style={styles.publicHeaderBar}>
          <TouchableOpacity onPress={handleReturn} style={styles.backBtn} activeOpacity={0.7}>
            <ArrowLeft size={20} color="#15362B" />
          </TouchableOpacity>
          <AppText variant="heading3" color="primary">Facility Profile</AppText>
        </View>
        <ErrorState
          message="Club facility not found or currently inactive."
          onRetry={refetchClub}
        />
      </Screen>
    );
  }

  const isPlatformAdmin = Boolean(
    user?.is_platform_admin || isPlatformAdminEmail(user?.email) || activePortal === 'platform'
  );
  const isClubStaff = memberships.length > 0 && !isPlatformAdmin;

  return (
    <Screen style={styles.screen}>
      {/* ─── Role Context Top Banner ────────────────────────────────────────── */}
      {isPlatformAdmin ? (
        <View style={styles.adminContextBanner}>
          <View style={styles.contextLeft}>
            <ShieldCheck size={16} color="#0E7490" />
            <AppText style={styles.adminBannerText}>
              Platform Admin View · Read-Only Public Facility Inspection
            </AppText>
          </View>
          <TouchableOpacity
            style={styles.returnButton}
            onPress={handleReturn}
            activeOpacity={0.8}
            accessibilityLabel="Return to Platform Admin"
          >
            <AppText style={styles.returnButtonText}>Back to Admin Portal</AppText>
          </TouchableOpacity>
        </View>
      ) : isClubStaff ? (
        <View style={styles.clubContextBanner}>
          <View style={styles.contextLeft}>
            <Building2 size={16} color="#15803D" />
            <AppText style={styles.clubBannerText}>
              Club Management Preview · How players see your club
            </AppText>
          </View>
          <TouchableOpacity style={styles.returnButton} onPress={handleReturn} activeOpacity={0.8}>
            <AppText style={styles.returnButtonText}>Back to Club Dashboard</AppText>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.publicHeaderBar}>
          <TouchableOpacity onPress={handleReturn} style={styles.backBtn} activeOpacity={0.7}>
            <ArrowLeft size={20} color="#15362B" />
          </TouchableOpacity>
          <AppText variant="heading3" color="primary" numberOfLines={1} style={{ flex: 1 }}>
            {club.name}
          </AppText>
          {!isAuthenticated && (
            <TouchableOpacity
              style={styles.signInPill}
              onPress={() => router.push('/(auth)/login' as any)}
              activeOpacity={0.8}
            >
              <AppText style={styles.signInPillText}>Sign In</AppText>
            </TouchableOpacity>
          )}
        </View>
      )}

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom + 32, 48) },
        ]}
        refreshControl={<RefreshControl refreshing={isRefetchingClub} onRefresh={onRefresh} colors={['#176F5B']} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Hero Banner Card ────────────────────────────────────────────── */}
        <View style={styles.heroCard}>
          <Image
            source={
              !bannerError && club.cover_image_url
                ? { uri: resolveMediaUrl(club.cover_image_url) }
                : DEFAULT_BANNER
            }
            style={styles.heroBannerImage}
            resizeMode="cover"
            onError={() => setBannerError(true)}
          />
          <View style={styles.heroOverlay} />

          <View style={styles.heroContent}>
            {/* Logo and Status Badge */}
            <View style={styles.heroTopRow}>
              <View style={styles.clubLogoWrap}>
                <Image
                  source={
                    !logoError && club.logo_url
                      ? { uri: resolveMediaUrl(club.logo_url) }
                      : DEFAULT_LOGO
                  }
                  style={styles.clubLogo}
                  resizeMode="contain"
                  onError={() => setLogoError(true)}
                />
              </View>

              <View
                style={[
                  styles.statusPill,
                  { backgroundColor: club.is_active ? 'rgba(234, 246, 240, 0.95)' : 'rgba(254, 226, 226, 0.95)' },
                ]}
              >
                <CheckCircle2
                  size={12}
                  color={club.is_active ? '#15803D' : '#DC2626'}
                  strokeWidth={2.4}
                />
                <AppText
                  style={[
                    styles.statusPillText,
                    { color: club.is_active ? '#15803D' : '#DC2626' },
                  ]}
                >
                  {club.is_active ? 'ACTIVE' : 'SUSPENDED'}
                </AppText>
              </View>
            </View>

            {/* Club Name & Location */}
            <AppText variant="heading2" style={styles.heroClubName}>
              {club.name}
            </AppText>

            {club.short_description ? (
              <AppText variant="bodySmall" style={styles.heroTagline}>
                {club.short_description}
              </AppText>
            ) : null}

            <View style={styles.heroMetaRow}>
              <View style={styles.metaItem}>
                <MapPin size={13} color="#C4DDD4" />
                <AppText style={styles.metaText} numberOfLines={1}>
                  {[club.city, club.state, club.country].filter(Boolean).join(', ') || 'Location details unavailable'}
                </AppText>
              </View>

              <View style={styles.metaItem}>
                <Clock size={13} color="#C4DDD4" />
                <AppText style={styles.metaText}>
                  {formatOperatingHours(club.opening_time, club.closing_time)}
                </AppText>
              </View>
            </View>
          </View>
        </View>

        {/* ─── Courts & Facilities Section ──────────────────────────────────── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <View style={styles.sectionIconSquircle}>
                <LayoutGrid size={16} color="#176F5B" />
              </View>
              <AppText variant="heading3" color="primary">
                Courts & Facilities
              </AppText>
            </View>
            <View style={styles.countBadge}>
              <AppText style={styles.countBadgeText}>
                {activeCourts.length} {activeCourts.length === 1 ? 'Court' : 'Courts'}
              </AppText>
            </View>
          </View>

          {activeCourts.length === 0 ? (
            <View style={styles.emptyCourtsBox}>
              <AppText variant="bodySmall" color="secondary" center>
                No courts are currently listed as active for this facility.
              </AppText>
            </View>
          ) : (
            <View style={styles.courtsList}>
              {activeCourts.map((court) => (
                <View key={court.id} style={styles.courtRow}>
                  <View style={styles.courtThumbPlaceholder}>
                    <LayoutGrid size={18} color="#176F5B" />
                  </View>
                  <View style={styles.courtDetails}>
                    <AppText style={styles.courtName}>{court.name}</AppText>
                    <AppText style={styles.courtMeta}>
                      {[
                        court.surface_type ? `${court.surface_type.replace('_', ' ')} Surface` : null,
                        court.indoor_outdoor === 'indoor' ? 'Indoor' : 'Outdoor',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </AppText>
                  </View>
                  <View style={styles.courtStatusPill}>
                    <AppText style={styles.courtStatusText}>Available</AppText>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ─── Membership Plans Section ─────────────────────────────────────── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <View style={styles.sectionIconSquircle}>
                <Crown size={16} color="#176F5B" />
              </View>
              <AppText variant="heading3" color="primary">
                Membership Plans
              </AppText>
            </View>
          </View>

          {membershipPlans.length === 0 ? (
            <View style={styles.emptyCourtsBox}>
              <AppText variant="bodySmall" color="secondary" center>
                No public membership tiers currently published for this facility.
              </AppText>
            </View>
          ) : (
            <View style={styles.plansList}>
              {membershipPlans.map((plan) => (
                <View key={plan.id} style={styles.planCard}>
                  <View style={styles.planTopRow}>
                    <AppText style={styles.planName}>{plan.name}</AppText>
                    <AppText style={styles.planPrice}>
                      {formatCurrency(Number(plan.price))}
                      <AppText style={styles.planInterval}> / {plan.duration_label || plan.duration_unit}</AppText>
                    </AppText>
                  </View>
                  {plan.description ? (
                    <AppText style={styles.planDesc}>{plan.description}</AppText>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ─── About This Facility Section ──────────────────────────────────── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <View style={styles.sectionIconSquircle}>
                <Info size={16} color="#176F5B" />
              </View>
              <AppText variant="heading3" color="primary">
                About This Club
              </AppText>
            </View>
          </View>

          <AppText style={styles.aboutText}>
            {club.description ||
              club.short_description ||
              `${club.name} is a premier pickleball facility offering dedicated courts, professional coaching, competitive leagues, and an active member community.`}
          </AppText>

          <View style={styles.contactDetailsBlock}>
            {club.contact_email ? (
              <View style={styles.contactRow}>
                <Mail size={15} color="#5A716A" />
                <AppText style={styles.contactValue}>{club.contact_email}</AppText>
              </View>
            ) : null}

            {club.contact_phone ? (
              <View style={styles.contactRow}>
                <Phone size={15} color="#5A716A" />
                <AppText style={styles.contactValue}>{club.contact_phone}</AppText>
              </View>
            ) : null}

            {club.website ? (
              <TouchableOpacity
                style={styles.contactRow}
                onPress={() => Linking.openURL(club.website!.startsWith('http') ? club.website! : `https://${club.website}`)}
                activeOpacity={0.7}
              >
                <Globe size={15} color="#176F5B" />
                <AppText style={[styles.contactValue, { color: '#176F5B', textDecorationLine: 'underline' }]}>
                  {club.website}
                </AppText>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  adminContextBanner: {
    backgroundColor: '#E0F2FE',
    borderBottomWidth: 1,
    borderColor: '#BAE6FD',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  clubContextBanner: {
    backgroundColor: '#EAF6F0',
    borderBottomWidth: 1,
    borderColor: '#C4DDD4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  contextLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  adminBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0E7490',
  },
  clubBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803D',
  },
  returnButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#94A3B8',
  },
  returnButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  publicHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E6ECE9',
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F5F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInPill: {
    backgroundColor: '#176F5B',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  signInPillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  heroCard: {
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0F2C24',
    minHeight: 240,
    elevation: 3,
  },
  heroBannerImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10, 35, 28, 0.72)',
  },
  heroContent: {
    padding: 18,
    gap: 10,
    justifyContent: 'flex-end',
    minHeight: 240,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  clubLogoWrap: {
    width: 58,
    height: 58,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  clubLogo: {
    width: '100%',
    height: '100%',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroClubName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  heroTagline: {
    color: '#E0EAE6',
    fontSize: 13,
  },
  heroMetaRow: {
    marginTop: 6,
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  metaText: {
    color: '#E0EAE6',
    fontSize: 12,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E6ECE9',
    gap: 14,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionIconSquircle: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#EAF6F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    backgroundColor: '#EAF6F0',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countBadgeText: {
    color: '#176F5B',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyCourtsBox: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  courtsList: {
    gap: 10,
  },
  courtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F8FAF9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EDF2F0',
    gap: 12,
  },
  courtThumbPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#EAF6F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  courtDetails: {
    flex: 1,
  },
  courtName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#15362B',
  },
  courtMeta: {
    fontSize: 12,
    color: '#657B75',
    marginTop: 2,
  },
  courtStatusPill: {
    backgroundColor: '#E4F4EC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  courtStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#176F5B',
  },
  plansList: {
    gap: 10,
  },
  planCard: {
    padding: 14,
    backgroundColor: '#F8FAF9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EDF2F0',
    gap: 6,
  },
  planTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#15362B',
  },
  planPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: '#176F5B',
  },
  planInterval: {
    fontSize: 12,
    fontWeight: '500',
    color: '#657B75',
  },
  planDesc: {
    fontSize: 12,
    color: '#657B75',
  },
  aboutText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#344A43',
  },
  contactDetailsBlock: {
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EDF2F0',
    gap: 8,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contactValue: {
    fontSize: 12,
    color: '#5A716A',
  },
});

