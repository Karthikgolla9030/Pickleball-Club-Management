/**
 * Aught2 Pickleball — Public Club Profile (Player View)
 *
 * Exact Reference Implementation matching the approved Club Profile design:
 *   - Compact header with back arrow button and dynamic club name
 *   - Inset rounded photographic Hero Banner with dark-green gradient overlay,
 *     dynamic club cover photo, club logo container, dynamic club name,
 *     capsule "ACTIVE" badge, location with pin, and operating hours with clock
 *   - Membership Status card (green circular checkmark, dynamic membership state,
 *     clear subtext, and deep green "Book Court" action)
 *   - Courts & Facilities card with icon, dynamic courts count badge,
 *     one row per actual court with court-specific photograph thumbnail,
 *     court title, surface & environment subtext, access status, and "Book" button
 *   - Side-by-side shortcut cards: "Upcoming Events" and "Lessons & Coaching"
 *   - "About This Club" card with icon, dynamic description, and view full details dialog
 *   - Preserves player bottom navigation with generous safe area scroll padding
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
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
  ChevronRight,
  Clock,
  Crown,
  ExternalLink,
  Globe,
  Info,
  LayoutGrid,
  Mail,
  MapPin,
  Phone,
  UserCheck,
  X,
} from 'lucide-react-native';

import { AppText, Button, Card, ErrorState, LoadingState, Screen } from '@/components';
import {
  usePlayerClubMembershipRequest,
  usePlayerClubs,
  useJoinClub,
  usePlayerMembership,
  usePlayerMembershipRequests,
  usePlayerSubscribe,
} from '@/hooks';
import { clubsApi, courtApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import { Colors, Radius, Spacing } from '@/theme';
import { formatCurrency, resolveMediaUrl } from '@/utils';
import type { Club, MembershipPlan, PlayerCourt } from '@/types';

// ─── Default & Fallback Assets ───────────────────────────────────────────────

const DEFAULT_BANNER = require('../../assets/explore_banner.jpg');

const COURT_FALLBACKS = [
  require('../../assets/courts/court_1.jpg'),
  require('../../assets/courts/court_2.jpg'),
  require('../../assets/courts/court_3.jpg'),
  require('../../assets/courts/court_4.jpg'),
  require('../../assets/courts/court_5.jpg'),
];

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

export default function PublicClubDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  const clubId = Array.isArray(id) ? id[0] : id;
  const [logoError, setLogoError] = useState(false);
  const [bannerError, setBannerError] = useState(false);
  const [courtImageErrors, setCourtImageErrors] = useState<Record<string, boolean>>({});

  // 1. Fetch public club data
  const {
    data: club,
    isLoading: isLoadingClub,
    isRefetching: isRefetchingClub,
    error: clubError,
    refetch: refetchClub,
  } = useQuery<Club, Error>({
    queryKey: ['public-club', clubId],
    queryFn: () => clubsApi.getPublicClub(clubId!),
    enabled: Boolean(clubId),
  });

  useEffect(() => {
    setLogoError(false);
  }, [club?.logo_url]);

  useEffect(() => {
    setBannerError(false);
  }, [club?.cover_image_url]);

  // 2. Fetch active courts for this club (canonical PLAYER_COURTS query key)
  const {
    data: activeCourts = [],
    isLoading: isLoadingCourts,
    refetch: refetchCourts,
  } = useQuery<PlayerCourt[], Error>({
    queryKey: clubId ? QUERY_KEYS.PLAYER_COURTS(clubId) : ['clubs', 'none', 'player-courts'],
    queryFn: () => courtApi.getPlayerCourts(clubId!),
    enabled: Boolean(clubId),
    refetchOnMount: 'always',
  });

  // 3. Fetch public membership plans (for subscription capability)
  const {
    data: plans = [],
    refetch: refetchPlans,
  } = useQuery<MembershipPlan[], Error>({
    queryKey: ['public-membership-plans', clubId],
    queryFn: () => clubsApi.getPublicMembershipPlans(clubId!),
    enabled: Boolean(clubId),
  });

  // 4. Check caller's enrolled club memberships
  const { clubs: myClubs, refetch: refetchMyClubs } = usePlayerClubs();
  const isEnrolled = useMemo(() => {
    return myClubs.some((c) => c.club_id === clubId && c.status === 'active');
  }, [myClubs, clubId]);

  // Check if caller has an active paid membership subscription at this club
  const { data: playerMembership, refetch: refetchPlayerMembership } = usePlayerMembership(clubId || '');
  const hasActivePaidSubscription = Boolean(
    playerMembership && (playerMembership.status === 'active' || playerMembership.effective_status === 'active')
  );

  // 5. Check caller's membership request status for this club
  const {
    request: existingRequest,
    refetch: refetchRequest,
  } = usePlayerClubMembershipRequest(clubId);

  const {
    submitRequest,
    isSubmitting,
    withdrawRequest,
    isWithdrawing,
  } = usePlayerMembershipRequests();

  const { mutateAsync: joinClub, isPending: isJoiningClub } = useJoinClub();
  const { mutateAsync: subscribeToPlan, isPending: isSubscribing } = usePlayerSubscribe();

  // Modals state
  const [modalVisible, setModalVisible] = useState(false);
  const [joinChoiceModalVisible, setJoinChoiceModalVisible] = useState(false);
  const [applicationMessage, setApplicationMessage] = useState('');
  const [selectedPlanForSubscribe, setSelectedPlanForSubscribe] = useState<MembershipPlan | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'upi' | 'card' | 'bank_transfer' | 'cash'>('upi');
  const [isAboutModalVisible, setIsAboutModalVisible] = useState(false);

  const handleJoinClub = async () => {
    if (!clubId || isJoiningClub) return;
    try {
      await joinClub(clubId);
      await refetchMyClubs();
      await refetchClub();
      await refetchPlayerMembership();
      setJoinChoiceModalVisible(false);
      Alert.alert(
        'Welcome!',
        `You have successfully joined ${club?.name || 'the club'} as a Free Member! Your player membership is now active.`,
      );
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to join club';
      Alert.alert('Error', msg);
    }
  };

  const handleSubmitApplication = async () => {
    if (!clubId || isSubmitting) return;
    try {
      await submitRequest({
        clubId,
        payload: { message: applicationMessage.trim() || undefined },
      });
      setModalVisible(false);
      setApplicationMessage('');
      await refetchRequest();
      Alert.alert(
        'Application Submitted',
        'Your membership request has been sent to the club staff for review.',
      );
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to submit application';
      Alert.alert('Error', msg);
    }
  };

  const handleWithdraw = async () => {
    if (!existingRequest?.id || isWithdrawing) return;
    Alert.alert(
      'Withdraw Application',
      'Are you sure you want to withdraw your membership request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              await withdrawRequest(existingRequest.id);
              await refetchRequest();
            } catch (err: any) {
              const msg = err?.response?.data?.detail || err?.message || 'Failed to withdraw request';
              Alert.alert('Error', msg);
            }
          },
        },
      ],
    );
  };

  const handleConfirmSubscribe = async () => {
    if (!clubId || !selectedPlanForSubscribe || isSubscribing) return;
    try {
      await subscribeToPlan({
        clubId,
        planId: selectedPlanForSubscribe.id,
        payload: {
          payment_method: selectedPaymentMethod,
        },
      });
      const planName = selectedPlanForSubscribe.name;
      const isFree = Number(selectedPlanForSubscribe.price) === 0;
      setSelectedPlanForSubscribe(null);
      setJoinChoiceModalVisible(false);
      await refetchMyClubs();
      await refetchPlayerMembership();
      await refetchClub();
      Alert.alert(
        isFree ? 'Subscription Activated!' : 'Subscription Created',
        isFree
          ? `You have successfully enrolled in ${planName}. Your privileges are now active!`
          : `You have enrolled in ${planName}. A pending payment record has been generated. Once confirmed by the club, your privileges will be activated.`,
        [
          { text: 'OK' },
          {
            text: 'View Memberships',
            onPress: () => router.push('/(player)/membership' as any),
          },
        ]
      );
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to enroll in membership plan';
      Alert.alert('Subscription Error', msg);
    }
  };

  if (isLoadingClub && !club) {
    return (
      <Screen style={styles.screen}>
        <LoadingState message="Loading club details..." />
      </Screen>
    );
  }

  if (clubError || !club) {
    return (
      <Screen style={styles.screen}>
        <ErrorState
          title="Club Not Found"
          message={clubError?.message || 'Unable to retrieve club information.'}
          onRetry={() => refetchClub()}
        />
      </Screen>
    );
  }

  const isPending = existingRequest?.status === 'pending';
  const logoUri = club.logo_url ? resolveMediaUrl(club.logo_url) : null;
  const bannerUri = club.cover_image_url ? resolveMediaUrl(club.cover_image_url) : null;
  const bannerSource = bannerUri && !bannerError ? { uri: bannerUri } : DEFAULT_BANNER;

  const locationText = [club.city, club.state].filter(Boolean).join(', ') || 'Tirupati, AP';
  const hoursText = formatOperatingHours(club.opening_time, club.closing_time);

  const fullAddress = [
    club.address_line1,
    club.address_line2,
    club.city,
    club.state,
    club.postal_code,
  ]
    .filter(Boolean)
    .join(', ');

  const handleOpenDirections = () => {
    if (!fullAddress) return;
    const query = encodeURIComponent(`${club.name} ${fullAddress}`.trim());
    const url = Platform.select({
      ios: `maps:0,0?q=${query}`,
      android: `geo:0,0?q=${query}`,
      default: `https://www.google.com/maps/search/?api=1&query=${query}`,
    });
    if (url) Linking.openURL(url);
  };

  const isNarrowScreen = windowWidth < 380;

  return (
    <Screen style={styles.screen}>
      {/* ─── A. Compact Header ────────────────────────────────────────────── */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.8}
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={20} color="#102B2A" strokeWidth={2.4} />
        </TouchableOpacity>
        <AppText style={styles.headerTitle} numberOfLines={1}>
          {club.name}
        </AppText>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 110 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetchingClub}
            onRefresh={() => {
              setLogoError(false);
              setBannerError(false);
              setCourtImageErrors({});
              refetchClub();
              refetchCourts();
              refetchPlans();
              refetchRequest();
              refetchMyClubs();
            }}
            tintColor="#18794E"
          />
        }
      >
        <View style={styles.contentContainer}>
          {/* ─── B. Club Hero Banner ───────────────────────────────────────── */}
          <View style={styles.heroBanner}>
            <Image
              source={bannerSource}
              style={styles.heroBackgroundImage}
              resizeMode="cover"
              onError={() => setBannerError(true)}
            />
            {/* Dark-Green Gradient Overlay: photo clearly visible above, dark green below */}
            <View style={styles.heroOverlay} />

            {/* Hero Information Row positioned at bottom */}
            <View style={styles.heroContentRow}>
              {/* Club Logo */}
              <View style={styles.logoContainer}>
                {logoUri && !logoError ? (
                  <Image
                    source={{ uri: logoUri }}
                    style={styles.logoImage}
                    resizeMode="contain"
                    onError={() => setLogoError(true)}
                    accessibilityLabel={`${club.name} logo`}
                  />
                ) : (
                  <View style={styles.logoFallbackWrapper}>
                    <Building2 size={34} color="#FFFFFF" strokeWidth={1.8} />
                  </View>
                )}
              </View>

              {/* Title, Badge, Location, and Hours */}
              <View style={styles.heroDetailsCol}>
                <View style={styles.nameRow}>
                  <AppText style={styles.clubNameText} numberOfLines={1}>
                    {club.name}
                  </AppText>
                  {club.is_active !== false && (
                    <View style={styles.activeBadge}>
                      <AppText style={styles.activeBadgeText}>ACTIVE</AppText>
                    </View>
                  )}
                </View>

                <View style={styles.metaRow}>
                  <MapPin size={13} color="#D1FAE5" />
                  <AppText style={styles.metaText} numberOfLines={1}>
                    {locationText}
                  </AppText>
                </View>

                <View style={styles.metaRow}>
                  <Clock size={13} color="#D1FAE5" />
                  <AppText style={styles.metaText} numberOfLines={1}>
                    {club.operating_days || 'Mon - Sun'}  |  {hoursText}
                  </AppText>
                </View>
              </View>
            </View>
          </View>

          {/* ─── C. Membership Status Card ─────────────────────────────────── */}
          <View style={styles.card}>
            <View style={styles.membershipRow}>
              <View style={styles.membershipLeft}>
                <View style={isEnrolled ? styles.checkCircleGreen : styles.checkCircleNeutral}>
                  <CheckCircle2
                    size={24}
                    color={isEnrolled ? '#18794E' : '#71857E'}
                    strokeWidth={2.4}
                  />
                </View>
                <View style={styles.membershipTextCol}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <AppText style={styles.membershipHeading}>
                      {isEnrolled
                        ? hasActivePaidSubscription
                          ? 'Paid Club Member'
                          : 'Free Club Member'
                        : isPending
                        ? 'Application Pending'
                        : 'Club Membership'}
                    </AppText>
                    {isEnrolled && (
                      <View style={hasActivePaidSubscription ? styles.paidBadge : styles.freeBadge}>
                        <AppText style={hasActivePaidSubscription ? styles.paidBadgeText : styles.freeBadgeText}>
                          {hasActivePaidSubscription ? (playerMembership?.plan_name || 'PAID') : 'FREE MEMBER'}
                        </AppText>
                      </View>
                    )}
                  </View>
                  <AppText style={styles.membershipSubtext}>
                    {isEnrolled
                      ? hasActivePaidSubscription
                        ? `Enrolled in ${playerMembership?.plan_name}. Full membership privileges active.`
                        : 'Joined for free. Eligible for pay-as-you-go court reservations and open club events.'
                      : isPending
                      ? 'Your membership request is currently awaiting club review.'
                      : 'Join for free or choose a membership plan to reserve courts and access events.'}
                  </AppText>
                </View>
              </View>

              {isEnrolled ? (
                <View style={{ gap: 8, alignItems: 'flex-end' }}>
                  <TouchableOpacity
                    style={styles.bookCourtBtn}
                    onPress={() =>
                      router.push({
                        pathname: '/(player)/courts',
                        params: { clubId: club.id },
                      } as any)
                    }
                    activeOpacity={0.88}
                  >
                    <AppText style={styles.bookCourtBtnText}>Book Court</AppText>
                  </TouchableOpacity>
                  {!hasActivePaidSubscription && (
                    <TouchableOpacity
                      style={styles.upgradePlanBtn}
                      onPress={() => setJoinChoiceModalVisible(true)}
                      activeOpacity={0.88}
                    >
                      <AppText style={styles.upgradePlanBtnText}>Get Membership</AppText>
                    </TouchableOpacity>
                  )}
                </View>
              ) : isPending ? (
                <TouchableOpacity
                  style={styles.withdrawBtn}
                  onPress={handleWithdraw}
                  disabled={isWithdrawing}
                  activeOpacity={0.88}
                >
                  <AppText style={styles.withdrawBtnText}>
                    {isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
                  </AppText>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.bookCourtBtn}
                  onPress={() => setJoinChoiceModalVisible(true)}
                  disabled={isJoiningClub}
                  activeOpacity={0.88}
                >
                  <AppText style={styles.bookCourtBtnText}>
                    {isJoiningClub ? 'Joining...' : 'Join Club'}
                  </AppText>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ─── D. Courts & Facilities ────────────────────────────────────── */}
          <View style={styles.card}>
            <View style={styles.sectionHeaderBetween}>
              <View style={styles.sectionHeaderLeft}>
                <LayoutGrid size={19} color="#18794E" strokeWidth={2.2} />
                <AppText style={styles.sectionCardTitle}>Courts & Facilities</AppText>
              </View>
              <View style={styles.courtsCountBadge}>
                <AppText style={styles.courtsCountBadgeText}>
                  {activeCourts.length} {activeCourts.length === 1 ? 'Court' : 'Courts'}
                </AppText>
              </View>
            </View>

            {activeCourts.length === 0 ? (
              <View style={styles.emptyCourtsBox}>
                <AppText style={styles.emptyCourtsText}>
                  No active courts currently available at this club.
                </AppText>
              </View>
            ) : (
              <View style={styles.courtsList}>
                {activeCourts.map((court, index) => {
                  const envLabel = court.indoor_outdoor === 'indoor' ? 'Indoor' : 'Outdoor';
                  const surfaceLabel = court.surface_type || 'Sport Court';
                  const isIncluded =
                    court.price_per_hour == null || Number(court.price_per_hour) === 0;
                  const hasPhoto = Boolean(court.photo_url && !courtImageErrors[court.id]);
                  const courtImageUri = hasPhoto ? resolveMediaUrl(court.photo_url) : null;
                  const courtFallback = COURT_FALLBACKS[index % COURT_FALLBACKS.length];

                  return (
                    <View
                      key={court.id}
                      style={[
                        styles.courtRow,
                        index === 0 && { borderTopWidth: 0, paddingTop: 6 },
                      ]}
                    >
                      {/* Court Thumbnail */}
                      <View style={styles.courtThumbWrapper}>
                        <Image
                          key={`${court.id}-${court.photo_url || 'default'}-${hasPhoto ? 'ok' : 'fallback'}`}
                          source={courtImageUri ? { uri: courtImageUri } : courtFallback}
                          style={styles.courtThumbImage}
                          resizeMode="cover"
                          onError={() => {
                            if (court.id) {
                              setCourtImageErrors((prev) => ({ ...prev, [court.id]: true }));
                            }
                          }}
                        />
                      </View>

                      {/* Court Info */}
                      <View style={styles.courtInfoCol}>
                        <AppText style={styles.courtNameText} numberOfLines={1}>
                          {court.display_name || court.name}
                        </AppText>
                        <AppText style={styles.courtSurfaceText} numberOfLines={1}>
                          {envLabel} • {surfaceLabel}
                        </AppText>
                      </View>

                      {/* Right Access Tag & Book Button */}
                      <View style={styles.courtActionCol}>
                        <View style={styles.includedTag}>
                          <AppText style={styles.includedTagText}>
                            {isIncluded ? 'Included' : `${formatCurrency(court.price_per_hour)}/hr`}
                          </AppText>
                        </View>
                        <TouchableOpacity
                          style={styles.quickBookPill}
                          onPress={() =>
                            router.push({
                              pathname: '/(player)/courts',
                              params: { clubId: club.id, courtId: court.id },
                            } as any)
                          }
                          activeOpacity={0.85}
                        >
                          <AppText style={styles.quickBookPillText}>Book</AppText>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* ─── E & F. Shortcut Cards: Side by Side ───────────────────────── */}
          <View style={styles.shortcutsRow}>
            {/* Upcoming Events */}
            <TouchableOpacity
              style={styles.shortcutCard}
              onPress={() =>
                router.push({
                  pathname: '/(player)/events',
                  params: { clubId: club.id },
                } as any)
              }
              activeOpacity={0.85}
            >
              <View style={styles.shortcutIconCircle}>
                <Calendar size={18} color="#18794E" strokeWidth={2.2} />
              </View>
              <View style={styles.shortcutTextCol}>
                <AppText style={styles.shortcutHeading} numberOfLines={1}>
                  Upcoming Events
                </AppText>
                <AppText style={styles.shortcutSubtext} numberOfLines={1}>
                  View socials and tournaments
                </AppText>
              </View>
              <ChevronRight size={16} color="#6B7E76" />
            </TouchableOpacity>

            {/* Lessons & Coaching */}
            <TouchableOpacity
              style={styles.shortcutCard}
              onPress={() =>
                router.push({
                  pathname: '/(player)/lessons',
                  params: { clubId: club.id },
                } as any)
              }
              activeOpacity={0.85}
            >
              <View style={styles.shortcutIconCircle}>
                <UserCheck size={18} color="#18794E" strokeWidth={2.2} />
              </View>
              <View style={styles.shortcutTextCol}>
                <AppText style={styles.shortcutHeading} numberOfLines={1}>
                  Lessons & Coaching
                </AppText>
                <AppText style={styles.shortcutSubtext} numberOfLines={1}>
                  Book a session with our coaches
                </AppText>
              </View>
              <ChevronRight size={16} color="#6B7E76" />
            </TouchableOpacity>
          </View>

          {/* ─── Membership Plans Section ─────────────────────────────────── */}
          <View style={styles.card}>
            <View style={styles.sectionHeaderBetween}>
              <View style={styles.sectionHeaderLeft}>
                <Crown size={19} color="#18794E" strokeWidth={2.2} />
                <AppText style={styles.sectionCardTitle}>Membership Plans</AppText>
              </View>
              <View style={styles.courtsCountBadge}>
                <AppText style={styles.courtsCountBadgeText}>
                  {plans.length} {plans.length === 1 ? 'Plan' : 'Plans'}
                </AppText>
              </View>
            </View>

            {plans.length === 0 ? (
              <View style={styles.emptyCourtsBox}>
                <AppText style={styles.emptyCourtsText}>
                  No membership plans are currently published for this club.
                  {club.allows_free_join !== false && !isEnrolled
                    ? ' You can join this club for free!'
                    : ''}
                </AppText>
              </View>
            ) : (
              <View style={{ gap: 12, marginTop: 12 }}>
                {plans.map((plan) => {
                  const isCurrentPlan = hasActivePaidSubscription && playerMembership?.plan_id === plan.id;
                  return (
                    <View key={plan.id} style={styles.planCard}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1, marginRight: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <AppText style={styles.planTitleText}>{plan.name}</AppText>
                            {isCurrentPlan && (
                              <View style={styles.paidBadge}>
                                <AppText style={styles.paidBadgeText}>CURRENT</AppText>
                              </View>
                            )}
                          </View>
                          {plan.description && (
                            <AppText style={styles.planDescText}>{plan.description}</AppText>
                          )}
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <AppText style={styles.planPriceText}>
                            {formatCurrency(plan.price)}
                          </AppText>
                          <AppText style={styles.planDurationText}>
                            /{plan.duration_label || plan.duration_unit}
                          </AppText>
                        </View>
                      </View>

                      {plan.benefits && plan.benefits.length > 0 && (
                        <View style={styles.planBenefitsBox}>
                          {plan.benefits.slice(0, 3).map((b, idx) => (
                            <View key={idx} style={styles.benefitItemRow}>
                              <CheckCircle2 size={13} color="#18794E" />
                              <AppText style={styles.benefitItemText} numberOfLines={1}>
                                {b}
                              </AppText>
                            </View>
                          ))}
                        </View>
                      )}

                      {!isCurrentPlan && (
                        <TouchableOpacity
                          style={styles.selectPlanButton}
                          onPress={() => setSelectedPlanForSubscribe(plan)}
                          activeOpacity={0.88}
                        >
                          <AppText style={styles.selectPlanButtonText}>
                            {isEnrolled ? 'Upgrade to This Plan' : 'Select Plan'}
                          </AppText>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* ─── G. About This Club ────────────────────────────────────────── */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => setIsAboutModalVisible(true)}
            activeOpacity={0.88}
          >
            <View style={styles.aboutRow}>
              <View style={styles.aboutIconCircle}>
                <Info size={19} color="#18794E" strokeWidth={2.2} />
              </View>
              <View style={styles.aboutTextCol}>
                <AppText style={styles.aboutHeading}>About This Club</AppText>
                <AppText style={styles.aboutDescription} numberOfLines={3}>
                  {club.description ||
                    'A welcoming pickleball community for players of all levels. Join our socials, clinics and tournaments and be part of a growing community.'}
                </AppText>
              </View>
              <ChevronRight size={16} color="#6B7E76" style={styles.aboutChevron} />
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ─── Modal: About This Club Details ─────────────────────────────────── */}
      <Modal
        visible={isAboutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAboutModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={styles.modalDialog}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <AppText variant="heading3" color="primary">
                  {club.name}
                </AppText>
                <AppText variant="caption" color="secondary">
                  {locationText}
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => setIsAboutModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#667776" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 300 }}>
              <AppText variant="bodySmall" color="primary" style={{ lineHeight: 22 }}>
                {club.description ||
                  'A welcoming pickleball community for players of all levels. Join our socials, clinics and tournaments and be part of a growing community.'}
              </AppText>

              {fullAddress ? (
                <View style={{ marginTop: 14 }}>
                  <AppText variant="label" color="primary" style={{ marginBottom: 4 }}>
                    Address
                  </AppText>
                  <TouchableOpacity onPress={handleOpenDirections} style={styles.addressLink}>
                    <MapPin size={14} color="#18794E" />
                    <AppText variant="bodySmall" style={{ color: '#18794E', flex: 1 }}>
                      {fullAddress} (Get Directions)
                    </AppText>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Operating Hours Summary */}
              <View style={{ marginTop: 14 }}>
                <AppText variant="label" color="primary" style={{ marginBottom: 4 }}>
                  Operating Hours
                </AppText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Clock size={14} color="#667776" />
                  <AppText variant="bodySmall" color="secondary">
                    {club.operating_days || 'Mon - Sun'}: {hoursText}
                  </AppText>
                </View>
              </View>

              {/* Contact information */}
              {(club.contact_email || club.contact_phone || club.website) && (
                <View style={{ marginTop: 14, gap: 8 }}>
                  <AppText variant="label" color="primary">
                    Contact & Website
                  </AppText>
                  {club.contact_email && (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`mailto:${club.contact_email}`)}
                      style={styles.contactRow}
                    >
                      <Mail size={14} color="#18794E" />
                      <AppText variant="bodySmall" style={{ color: '#18794E' }}>
                        {club.contact_email}
                      </AppText>
                    </TouchableOpacity>
                  )}
                  {club.contact_phone && (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`tel:${club.contact_phone}`)}
                      style={styles.contactRow}
                    >
                      <Phone size={14} color="#18794E" />
                      <AppText variant="bodySmall" style={{ color: '#18794E' }}>
                        {club.contact_phone}
                      </AppText>
                    </TouchableOpacity>
                  )}
                  {club.website && (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(club.website!)}
                      style={styles.contactRow}
                    >
                      <Globe size={14} color="#18794E" />
                      <AppText variant="bodySmall" style={{ color: '#18794E' }}>
                        Visit Website
                      </AppText>
                      <ExternalLink size={12} color="#18794E" />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <Button
                label="Close"
                variant="outline"
                onPress={() => setIsAboutModalVisible(false)}
                style={{ width: '100%' }}
              />
            </View>
          </Card>
        </View>
      </Modal>

      {/* ─── Modal: Membership Application ──────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={styles.modalDialog}>
            <View style={styles.modalHeader}>
              <View>
                <AppText variant="heading3" color="primary">
                  Request Membership
                </AppText>
                <AppText variant="caption" color="secondary">
                  Apply to join {club.name}
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#667776" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <AppText variant="bodySmall" color="secondary">
                Add an optional note to the club staff with your experience level, interest, or introduction:
              </AppText>

              <TextInput
                value={applicationMessage}
                onChangeText={setApplicationMessage}
                placeholder="e.g. 3.5 player looking to participate in weekend leagues..."
                placeholderTextColor="#8A9B95"
                multiline
                numberOfLines={3}
                style={styles.messageInput}
              />
            </View>

            <View style={styles.modalFooter}>
              <Button
                label={isSubmitting ? 'Submitting...' : 'Submit Application'}
                onPress={handleSubmitApplication}
                disabled={isSubmitting}
                style={{ width: '100%' }}
              />
            </View>
          </Card>
        </View>
      </Modal>

      {/* ─── Modal: Membership Plan Subscription ────────────────────────────── */}
      <Modal
        visible={Boolean(selectedPlanForSubscribe)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPlanForSubscribe(null)}
      >
        <View style={styles.modalOverlay}>
          <Card style={styles.modalDialog}>
            <View style={styles.modalHeader}>
              <View>
                <AppText variant="heading3" color="primary">
                  Subscribe to Plan
                </AppText>
                <AppText variant="caption" color="secondary">
                  {club.name} • {selectedPlanForSubscribe?.name}
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedPlanForSubscribe(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#667776" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.subscribePriceBox}>
                <AppText variant="caption" color="secondary">
                  Plan Rate
                </AppText>
                <AppText variant="heading2" color="primary">
                  {formatCurrency(selectedPlanForSubscribe?.price)}
                  <AppText variant="bodySmall" color="secondary">
                    {' '}/ {selectedPlanForSubscribe?.duration_label || selectedPlanForSubscribe?.duration_unit}
                  </AppText>
                </AppText>
              </View>

              {Number(selectedPlanForSubscribe?.price || 0) === 0 ? (
                <View style={styles.noticeBoxGreen}>
                  <Info size={16} color="#18794E" />
                  <AppText variant="caption" style={{ color: '#18794E', flex: 1 }}>
                    This is a complimentary plan. Your subscription will activate immediately upon confirmation.
                  </AppText>
                </View>
              ) : (
                <View style={styles.paymentMethodSection}>
                  <AppText variant="label" color="primary">
                    Select Payment Method
                  </AppText>
                  <View style={styles.paymentMethodOptions}>
                    {(['upi', 'card', 'bank_transfer', 'cash'] as const).map((method) => {
                      const isSelected = selectedPaymentMethod === method;
                      const labels = {
                        upi: 'UPI',
                        card: 'Card',
                        bank_transfer: 'Bank Transfer',
                        cash: 'Cash / Front Desk',
                      };
                      return (
                        <TouchableOpacity
                          key={method}
                          style={[
                            styles.paymentMethodOption,
                            isSelected && styles.paymentMethodOptionActive,
                          ]}
                          onPress={() => setSelectedPaymentMethod(method)}
                        >
                          <AppText
                            variant="bodySmall"
                            style={isSelected ? styles.paymentMethodTextActive : styles.paymentMethodText}
                          >
                            {labels[method]}
                          </AppText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <AppText variant="caption" color="secondary">
                    A pending payment record will be created. Once confirmed by the club, your subscription will be marked active.
                  </AppText>
                </View>
              )}
            </View>

            <View style={styles.modalFooter}>
              <Button
                label={isSubscribing ? 'Enrolling...' : 'Confirm Subscription'}
                onPress={handleConfirmSubscribe}
                disabled={isSubscribing}
                style={{ width: '100%' }}
              />
            </View>
          </Card>
        </View>
      </Modal>

      {/* ─── Modal: Join Club Choice Modal ───────────────────────────────── */}
      <Modal
        visible={joinChoiceModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setJoinChoiceModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={[styles.modalDialog, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <AppText variant="heading3" color="primary">
                  {isEnrolled ? 'Membership Options' : `Join ${club.name}`}
                </AppText>
                <AppText variant="caption" color="secondary">
                  {isEnrolled
                    ? 'Upgrade your free membership to an official plan'
                    : 'Choose how you would like to join this club'}
                </AppText>
              </View>
              <TouchableOpacity
                onPress={() => setJoinChoiceModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#667776" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {/* Option A: Join for Free (Only shown if club allows free join and user not yet enrolled) */}
              {!isEnrolled && (
                club.allows_free_join !== false ? (
                  <View style={styles.choiceOptionBox}>
                    <View style={styles.choiceHeaderRow}>
                      <View style={styles.choiceBadgeFree}>
                        <AppText style={styles.choiceBadgeFreeText}>OPTION A • FREE</AppText>
                      </View>
                    </View>
                    <AppText style={styles.choiceTitle}>Join for Free</AppText>
                    <AppText style={styles.choiceSubtitle}>
                      Associate with {club.name} without paying membership fees. Pay per court booking and join open events.
                    </AppText>
                    <View style={styles.choiceCheckList}>
                      <View style={styles.choiceCheckRow}>
                        <Check size={14} color="#18794E" />
                        <AppText style={styles.choiceCheckText}>No membership fees or credit card required</AppText>
                      </View>
                      <View style={styles.choiceCheckRow}>
                        <Check size={14} color="#18794E" />
                        <AppText style={styles.choiceCheckText}>Instant association & access to player directory</AppText>
                      </View>
                      <View style={styles.choiceCheckRow}>
                        <Check size={14} color="#18794E" />
                        <AppText style={styles.choiceCheckText}>Upgrade to a paid membership at any later time</AppText>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.joinFreeBtn}
                      onPress={handleJoinClub}
                      disabled={isJoiningClub}
                      activeOpacity={0.88}
                    >
                      <AppText style={styles.joinFreeBtnText}>
                        {isJoiningClub ? 'Joining...' : 'Join Club for Free'}
                      </AppText>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.freeDisabledNotice}>
                    <Info size={16} color="#B45309" />
                    <AppText style={styles.freeDisabledText}>
                      Free joining is not available for this club. Please select an official membership plan below to associate.
                    </AppText>
                  </View>
                )
              )}

              {/* Option B: Choose a Membership */}
              <View style={[styles.choiceOptionBox, { marginTop: !isEnrolled && club.allows_free_join !== false ? 16 : 0 }]}>
                <View style={styles.choiceHeaderRow}>
                  <View style={styles.choiceBadgePaid}>
                    <Crown size={12} color="#FFFFFF" />
                    <AppText style={styles.choiceBadgePaidText}>
                      {isEnrolled ? 'EXPLORE PLANS' : 'OPTION B • MEMBERSHIP'}
                    </AppText>
                  </View>
                </View>
                <AppText style={styles.choiceTitle}>Choose a Membership Plan</AppText>
                <AppText style={styles.choiceSubtitle}>
                  Unlock complimentary court bookings, member discounts, and exclusive benefits.
                </AppText>

                {plans.length === 0 ? (
                  <View style={styles.noPlansNotice}>
                    <AppText style={styles.noPlansText}>
                      No membership plans are currently published by this club.
                      {club.allows_free_join !== false && !isEnrolled
                        ? ' You can join for free above!'
                        : ' Please check back later or contact the club.'}
                    </AppText>
                  </View>
                ) : (
                  <View style={{ gap: 10, marginTop: 10 }}>
                    {plans.map((plan) => (
                      <View key={plan.id} style={styles.planSelectionCard}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <AppText style={styles.planSelectionTitle}>{plan.name}</AppText>
                            <AppText style={styles.planSelectionDuration}>
                              {plan.duration_label || plan.duration_unit} duration
                            </AppText>
                          </View>
                          <AppText style={styles.planSelectionPrice}>
                            {formatCurrency(plan.price)}
                          </AppText>
                        </View>
                        {plan.benefits && plan.benefits.length > 0 && (
                          <View style={{ marginTop: 6, gap: 2 }}>
                            {plan.benefits.slice(0, 2).map((b, i) => (
                              <View key={i} style={styles.choiceCheckRow}>
                                <Check size={12} color="#18794E" />
                                <AppText style={styles.choiceCheckTextSmall} numberOfLines={1}>{b}</AppText>
                              </View>
                            ))}
                          </View>
                        )}
                        <TouchableOpacity
                          style={styles.selectPlanActionBtn}
                          onPress={() => {
                            setJoinChoiceModalVisible(false);
                            setSelectedPlanForSubscribe(plan);
                          }}
                          activeOpacity={0.88}
                        >
                          <AppText style={styles.selectPlanActionBtnText}>Select {plan.name}</AppText>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

// ─── Stylesheet ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F4F8F6',
  },

  // A. Header
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#F4F8F6',
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAE6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#102B2A',
    flex: 1,
    letterSpacing: -0.3,
  },

  // Scroll Container
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  contentContainer: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    gap: 14,
  },

  // B. Hero Banner
  heroBanner: {
    width: '100%',
    height: 205,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0E3628',
    shadowColor: '#0A261D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  heroBackgroundImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'linear-gradient(180deg, rgba(8, 28, 22, 0.08) 0%, rgba(8, 28, 22, 0.42) 42%, rgba(6, 22, 17, 0.94) 100%)',
        } as any)
      : {
          backgroundColor: 'rgba(7, 24, 18, 0.58)',
        }),
  },
  heroContentRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoContainer: {
    width: 74,
    height: 74,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
    padding: 4,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoFallbackWrapper: {
    width: '100%',
    height: '100%',
    backgroundColor: '#176B57',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDetailsCol: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clubNameText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  activeBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#E2E8F0',
  },

  // Generic Card Style
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5ECE8',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },

  // C. Membership Card
  membershipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  membershipLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkCircleGreen: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E4F4EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleNeutral: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EEF3F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  membershipTextCol: {
    flex: 1,
    gap: 2,
  },
  membershipHeading: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#102B2A',
    letterSpacing: -0.2,
  },
  membershipSubtext: {
    fontSize: 12,
    color: '#667776',
    lineHeight: 16,
  },
  bookCourtBtn: {
    backgroundColor: '#18563E',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookCourtBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  withdrawBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  withdrawBtnText: {
    color: '#DC2626',
    fontSize: 12.5,
    fontWeight: '700',
  },

  // D. Courts & Facilities
  sectionHeaderBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionCardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#102B2A',
    letterSpacing: -0.2,
  },
  courtsCountBadge: {
    backgroundColor: '#E4F4EC',
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 12,
  },
  courtsCountBadgeText: {
    color: '#18794E',
    fontWeight: '700',
    fontSize: 12,
  },
  emptyCourtsBox: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyCourtsText: {
    fontSize: 13,
    color: '#667776',
  },
  courtsList: {
    gap: 0,
  },
  courtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2',
    gap: 12,
  },
  courtThumbWrapper: {
    width: 82,
    height: 56,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#E8EFEA',
  },
  courtThumbImage: {
    width: '100%',
    height: '100%',
  },
  courtInfoCol: {
    flex: 1,
    gap: 3,
  },
  courtNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102B2A',
    letterSpacing: -0.2,
  },
  courtSurfaceText: {
    fontSize: 12,
    color: '#667776',
  },
  courtActionCol: {
    alignItems: 'flex-end',
    gap: 5,
  },
  includedTag: {
    backgroundColor: '#E8F5EE',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  includedTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#18794E',
  },
  quickBookPill: {
    backgroundColor: '#18563E',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickBookPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // E & F. Shortcuts
  shortcutsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',  // auto-stacks on narrow screens without needing device-width detection
    gap: 12,
  },
  shortcutCard: {
    flex: 1,
    minWidth: 140,  // cards stack when container is narrower than 2 * 140 + gap
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5ECE8',
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  shortcutIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E4F4EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutTextCol: {
    flex: 1,
    gap: 2,
  },
  shortcutHeading: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#102B2A',
    letterSpacing: -0.1,
  },
  shortcutSubtext: {
    fontSize: 11.5,
    color: '#667776',
  },

  // G. About This Club
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  aboutIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E4F4EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  aboutTextCol: {
    flex: 1,
    gap: 3,
  },
  aboutHeading: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#102B2A',
    letterSpacing: -0.2,
  },
  aboutDescription: {
    fontSize: 12.5,
    color: '#667776',
    lineHeight: 18,
  },
  aboutChevron: {
    marginTop: 10,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    justifyContent: 'center',
    padding: 16,
  },
  modalDialog: {
    padding: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    gap: 14,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalBody: {
    gap: 12,
  },
  modalFooter: {
    alignItems: 'center',
  },
  addressLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F7F4',
    padding: 10,
    borderRadius: 8,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  messageInput: {
    backgroundColor: '#F5F8F7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D4E2DC',
    padding: 10,
    color: '#102B2A',
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  subscribePriceBox: {
    backgroundColor: '#F5F8F7',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  noticeBoxGreen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E8F5E9',
    padding: 10,
    borderRadius: 8,
  },
  paymentMethodSection: {
    gap: 6,
  },
  paymentMethodOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paymentMethodOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D4E2DC',
    backgroundColor: '#F5F8F7',
  },
  paymentMethodOptionActive: {
    borderColor: '#18794E',
    backgroundColor: '#E8F5E9',
  },
  paymentMethodText: {
    color: '#667776',
  },
  paymentMethodTextActive: {
    color: '#18794E',
    fontWeight: '700',
  },

  // Badges & Actions for Membership
  paidBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  paidBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.4,
  },
  freeBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  freeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0369A1',
    letterSpacing: 0.4,
  },
  upgradePlanBtn: {
    backgroundColor: '#E4F4EC',
    borderWidth: 1,
    borderColor: '#A3D9C3',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradePlanBtnText: {
    color: '#18794E',
    fontSize: 11.5,
    fontWeight: '700',
  },

  // Plan Card Styles
  planCard: {
    backgroundColor: '#F8FAF9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2EBE6',
    padding: 14,
    gap: 8,
  },
  planTitleText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102B2A',
  },
  planDescText: {
    fontSize: 12,
    color: '#667776',
    marginTop: 2,
  },
  planPriceText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#18794E',
  },
  planDurationText: {
    fontSize: 11,
    color: '#8A9B95',
  },
  planBenefitsBox: {
    gap: 4,
    paddingTop: 4,
  },
  benefitItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  benefitItemText: {
    fontSize: 12,
    color: '#334155',
    flex: 1,
  },
  selectPlanButton: {
    backgroundColor: '#18794E',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  selectPlanButtonText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },

  // Choice Modal Styles
  choiceOptionBox: {
    backgroundColor: '#F8FAF9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2EBE6',
    padding: 14,
  },
  choiceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  choiceBadgeFree: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  choiceBadgeFreeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0369A1',
    letterSpacing: 0.5,
  },
  choiceBadgePaid: {
    backgroundColor: '#18794E',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  choiceBadgePaidText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  choiceTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#102B2A',
    marginBottom: 4,
  },
  choiceSubtitle: {
    fontSize: 12.5,
    color: '#667776',
    lineHeight: 18,
    marginBottom: 10,
  },
  choiceCheckList: {
    gap: 6,
    marginBottom: 12,
  },
  choiceCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  choiceCheckText: {
    fontSize: 12,
    color: '#334155',
    flex: 1,
  },
  choiceCheckTextSmall: {
    fontSize: 11,
    color: '#475569',
    flex: 1,
  },
  joinFreeBtn: {
    backgroundColor: '#18794E',
    borderRadius: 9,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinFreeBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  freeDisabledNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  freeDisabledText: {
    fontSize: 12,
    color: '#B45309',
    flex: 1,
    lineHeight: 16,
  },
  noPlansNotice: {
    backgroundColor: '#F1F5F9',
    padding: 12,
    borderRadius: 8,
    marginTop: 6,
  },
  noPlansText: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },
  planSelectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 12,
  },
  planSelectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  planSelectionDuration: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  planSelectionPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: '#18794E',
  },
  selectPlanActionBtn: {
    backgroundColor: '#E4F4EC',
    borderWidth: 1,
    borderColor: '#A3D9C3',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  selectPlanActionBtnText: {
    color: '#18794E',
    fontSize: 12,
    fontWeight: '700',
  },
});
