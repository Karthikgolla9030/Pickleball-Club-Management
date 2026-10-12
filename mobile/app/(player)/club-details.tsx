/**
 * Aught2 Pickleball — Public Club Profile (Player View)
 *
 * Displays public facility details, active membership plans, courts,
 * and handles the player membership application lifecycle.
 */

import React, { useMemo, useState } from 'react';
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
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import {
  Award,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Globe,
  Grid,
  Info,
  LayoutGrid,
  Mail,
  MapPin,
  Medal,
  Phone,
  Send,
  Sparkles,
  Trophy,
  UserCheck,
  X,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
} from '@/components';
import { API_ENDPOINTS } from '@/constants';
import {
  usePlayerClubMembershipRequest,
  usePlayerClubs,
  useJoinClub,
  usePlayerMembershipRequests,
  usePlayerSubscribe,
} from '@/hooks';
import { clubsApi, courtApi, leagueApi, tournamentApi } from '@/services/api';
import { Colors, Radius, Spacing } from '@/theme';
import type { Club, LeagueSummary, MembershipPlan, PlayerCourt, TournamentDiscoveryItem } from '@/types';

function getFullImageUrl(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null;
  const clean = url.trim();
  if (clean.startsWith('http') || clean.startsWith('data:')) return clean;
  const base = API_ENDPOINTS.BASE.replace(/\/$/, '');
  const path = clean.startsWith('/') ? clean : `/${clean}`;
  return `${base}${path}`;
}

export default function PublicClubDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const clubId = Array.isArray(id) ? id[0] : id;

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

  // 2. Fetch public membership plans
  const {
    data: plans = [],
    isLoading: isLoadingPlans,
    refetch: refetchPlans,
  } = useQuery<MembershipPlan[], Error>({
    queryKey: ['public-membership-plans', clubId],
    queryFn: () => clubsApi.getPublicMembershipPlans(clubId!),
    enabled: Boolean(clubId),
  });

  // 3. Fetch active courts for this club
  const {
    data: activeCourts = [],
    isLoading: isLoadingCourts,
    refetch: refetchCourts,
  } = useQuery<PlayerCourt[], Error>({
    queryKey: ['club-active-courts', clubId],
    queryFn: () => courtApi.getPlayerCourts(clubId!),
    enabled: Boolean(clubId),
  });

  // 4. Fetch public tournaments for this club
  const {
    data: clubTournaments = [],
    isLoading: isLoadingTournaments,
    refetch: refetchTournaments,
  } = useQuery<TournamentDiscoveryItem[], Error>({
    queryKey: ['club-public-tournaments', clubId],
    queryFn: () => tournamentApi.discoverTournaments(clubId!),
    enabled: Boolean(clubId),
  });

  // 5. Fetch public leagues for this club
  const {
    data: clubLeagues = [],
    isLoading: isLoadingLeagues,
    refetch: refetchLeagues,
  } = useQuery<LeagueSummary[], Error>({
    queryKey: ['club-public-leagues', clubId],
    queryFn: () => leagueApi.listPlayerLeagues(undefined, clubId!),
    enabled: Boolean(clubId),
  });

  // 6. Check caller's enrolled club memberships
  const { clubs: myClubs, refetch: refetchMyClubs } = usePlayerClubs();
  const isEnrolled = useMemo(() => {
    return myClubs.some((c) => c.club_id === clubId && c.status === 'active');
  }, [myClubs, clubId]);

  // 4. Check caller's membership request status for this club
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
  const [selectedPlanForSubscribe, setSelectedPlanForSubscribe] = useState<MembershipPlan | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'upi' | 'card' | 'bank_transfer' | 'cash'>('upi');

  // Modal for application message
  const [modalVisible, setModalVisible] = useState(false);
  const [applicationMessage, setApplicationMessage] = useState('');

  const handleJoinClub = async () => {
    if (!clubId || isJoiningClub) return;
    try {
      await joinClub(clubId);
      await refetchMyClubs();
      Alert.alert(
        'Welcome!',
        `You have successfully joined ${club?.name || 'the club'}. Your player membership is now active!`,
      );
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to join club';
      Alert.alert('Error', msg);
    }
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
      await refetchMyClubs();
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

  const fullAddress = [
    club?.address_line1,
    club?.address_line2,
    club?.city,
    club?.state,
    club?.postal_code,
  ]
    .filter(Boolean)
    .join(', ');

  const handleOpenDirections = () => {
    if (!fullAddress) return;
    const query = encodeURIComponent(`${club?.name || ''} ${fullAddress}`.trim());
    const url = Platform.select({
      ios: `maps:0,0?q=${query}`,
      android: `geo:0,0?q=${query}`,
      default: `https://www.google.com/maps/search/?api=1&query=${query}`,
    });
    if (url) Linking.openURL(url);
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

  if (isLoadingClub && !club) {
    return (
      <Screen style={styles.screen}>
        <AppHeader title="Club Profile" showBack />
        <LoadingState message="Loading club details..." />
      </Screen>
    );
  }

  if (clubError || !club) {
    return (
      <Screen style={styles.screen}>
        <AppHeader title="Club Profile" showBack />
        <ErrorState
          title="Club Not Found"
          message={clubError?.message || 'Unable to retrieve club information.'}
          onRetry={() => refetchClub()}
        />
      </Screen>
    );
  }

  const logoUri = getFullImageUrl(club.logo_url);
  const isPending = existingRequest?.status === 'pending';

  return (
    <Screen style={styles.screen}>
      <AppHeader
        title={club.name}
        showBack
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 80 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetchingClub}
            onRefresh={() => {
              refetchClub();
              refetchPlans();
              refetchRequest();
              refetchCourts();
              refetchTournaments();
              refetchLeagues();
            }}
            tintColor="#18794E"
          />
        }
      >
        {/* 1. Hero Card */}
        <Card style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroLogoWrapper}>
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={styles.heroLogo} resizeMode="cover" />
              ) : (
                <View style={styles.heroPlaceholderLogo}>
                  <Building2 size={32} color="#18794E" />
                </View>
              )}
            </View>

            <View style={styles.heroTitles}>
              <AppText variant="heading3" color="primary">
                {club.name}
              </AppText>
              {fullAddress ? (
                <TouchableOpacity onPress={handleOpenDirections} style={styles.locationLink}>
                  <MapPin size={14} color="#18794E" />
                  <AppText variant="caption" color="primary" numberOfLines={2}>
                    {fullAddress}
                  </AppText>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {club.short_description ? (
            <AppText variant="body" color="secondary" style={styles.shortDesc}>
              {club.short_description}
            </AppText>
          ) : null}

          {/* Contact Pills */}
          <View style={styles.contactRow}>
            {club.contact_email ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(`mailto:${club.contact_email}`)}
                style={styles.contactPill}
              >
                <Mail size={13} color="#18794E" />
                <AppText variant="caption" color="primary">
                  {club.contact_email}
                </AppText>
              </TouchableOpacity>
            ) : null}

            {club.contact_phone ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(`tel:${club.contact_phone}`)}
                style={styles.contactPill}
              >
                <Phone size={13} color="#18794E" />
                <AppText variant="caption" color="primary">
                  {club.contact_phone}
                </AppText>
              </TouchableOpacity>
            ) : null}

            {club.website ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(club.website!)}
                style={styles.contactPill}
              >
                <Globe size={13} color="#18794E" />
                <AppText variant="caption" color="primary">
                  Website
                </AppText>
                <ExternalLink size={11} color="#18794E" />
              </TouchableOpacity>
            ) : null}
          </View>
        </Card>

        {/* 2. Membership Status & Booking Eligibility Card */}
        <Card style={styles.statusCard}>
          {isEnrolled ? (
            <View style={styles.statusContent}>
              <View style={styles.statusIconCircleGreen}>
                <CheckCircle2 size={24} color="#18794E" />
              </View>
              <View style={styles.statusTextCol}>
                <AppText variant="heading3" color="primary">
                  Active Player Member
                </AppText>
                <AppText variant="caption" color="secondary">
                  Eligible for court reservations and club events.
                </AppText>
              </View>
              <Button
                label="Book Court"
                size="sm"
                onPress={() => router.push(`/(player)/courts?clubId=${club.id}` as any)}
              />
            </View>
          ) : isPending ? (
            <View style={styles.statusContent}>
              <View style={styles.statusIconCircleAmber}>
                <Clock size={24} color="#B45309" />
              </View>
              <View style={styles.statusTextCol}>
                <AppText variant="heading3" style={{ color: '#92400E' }}>
                  Application Pending
                </AppText>
                <AppText variant="caption" color="secondary">
                  Your membership request is awaiting club review.
                </AppText>
              </View>
              <Button
                label={isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
                variant="outline"
                size="sm"
                onPress={handleWithdraw}
                disabled={isWithdrawing}
              />
            </View>
          ) : (
            <View style={styles.joinContent}>
              <View style={styles.joinTextCol}>
                <AppText variant="heading3" color="primary">
                  Join This Club
                </AppText>
                <AppText variant="caption" color="secondary">
                  Join immediately to become an active player member and unlock court booking.
                </AppText>
              </View>
              <Button
                label={isJoiningClub ? 'Joining...' : 'Join Club'}
                onPress={handleJoinClub}
                disabled={isJoiningClub}
              />
            </View>
          )}
        </Card>

        {/* 3. Active Courts & Facilities */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeaderBetween}>
            <View style={styles.sectionHeader}>
              <LayoutGrid size={18} color="#18794E" />
              <AppText variant="heading3" style={styles.sectionTitle}>
                Active Courts & Facilities
              </AppText>
            </View>
            <View style={styles.countBadge}>
              <AppText variant="caption" style={styles.countBadgeText}>
                {activeCourts.length} Courts
              </AppText>
            </View>
          </View>

          {activeCourts.length === 0 ? (
            <AppText variant="bodySmall" color="secondary">
              No active courts currently available at this facility.
            </AppText>
          ) : (
            <View style={styles.courtsList}>
              {activeCourts.map((court) => {
                const envLabel = court.indoor_outdoor === 'indoor' ? 'Indoor' : 'Outdoor';
                const priceLabel =
                  court.price_per_hour != null
                    ? `₹${Number(court.price_per_hour).toLocaleString('en-IN')}/hr`
                    : 'Included';
                return (
                  <View key={court.id} style={styles.courtItem}>
                    <View style={styles.courtItemInfo}>
                      <AppText variant="heading3" color="primary">
                        {court.display_name || court.name}
                      </AppText>
                      <AppText variant="caption" color="secondary">
                        {envLabel} • {court.surface_type || 'Standard surface'}
                      </AppText>
                    </View>
                    <View style={styles.courtItemRight}>
                      <AppText variant="heading3" color="primary">
                        {priceLabel}
                      </AppText>
                      {isEnrolled && (
                        <TouchableOpacity
                          style={styles.quickBookPill}
                          onPress={() => router.push(`/(player)/courts?clubId=${club.id}` as any)}
                        >
                          <AppText variant="caption" style={styles.quickBookText}>
                            Book
                          </AppText>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        {/* 4. Available Membership Plans */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeaderBetween}>
            <View style={styles.sectionHeader}>
              <Award size={18} color="#18794E" />
              <AppText variant="heading3" style={styles.sectionTitle}>
                Membership Plans
              </AppText>
            </View>
            <View style={styles.countBadge}>
              <AppText variant="caption" style={styles.countBadgeText}>
                {plans.length} Plans
              </AppText>
            </View>
          </View>

          {plans.length === 0 ? (
            <AppText variant="bodySmall" color="secondary">
              No public membership tiers currently configured for this club.
            </AppText>
          ) : (
            <View style={styles.plansList}>
              {plans.map((p) => (
                <View key={p.id} style={styles.planItem}>
                  <View style={styles.planTopRow}>
                    <AppText variant="heading3" color="primary">
                      {p.name}
                    </AppText>
                    <AppText variant="heading3" color="primary">
                      ₹{p.price}
                    </AppText>
                  </View>
                  <AppText variant="caption" color="secondary">
                    Billed {p.duration_label || p.duration_unit}
                  </AppText>
                  {p.description ? (
                    <AppText variant="bodySmall" color="secondary" style={styles.planDesc}>
                      {p.description}
                    </AppText>
                  ) : null}
                  <View style={styles.planPrivilegesRow}>
                    {p.advance_booking_days ? (
                      <AppText variant="caption" color="secondary">
                        • {p.advance_booking_days} days advance booking
                      </AppText>
                    ) : null}
                    {p.booking_limit ? (
                      <AppText variant="caption" color="secondary">
                        • Max {p.booking_limit} active bookings
                      </AppText>
                    ) : null}
                  </View>
                  <View style={styles.planActionRow}>
                    <Button
                      label={isEnrolled ? 'Subscribe' : 'Join Club to Subscribe'}
                      size="sm"
                      variant={isEnrolled ? 'primary' : 'outline'}
                      onPress={() => {
                        if (!isEnrolled) {
                          if (isPending) {
                            Alert.alert(
                              'Application Pending',
                              'Your membership request is currently awaiting club review. You can subscribe once approved.',
                            );
                          } else {
                            Alert.alert(
                              'Club Membership Required',
                              'You must be an approved club member to subscribe to a membership plan. Would you like to request club membership now?',
                              [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Request Membership', onPress: () => setModalVisible(true) },
                              ],
                            );
                          }
                        } else {
                          setSelectedPlanForSubscribe(p);
                        }
                      }}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* 5. Public Upcoming Tournaments */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeaderBetween}>
            <View style={styles.sectionHeader}>
              <Trophy size={18} color="#18794E" />
              <AppText variant="heading3" style={styles.sectionTitle}>
                Tournaments
              </AppText>
            </View>
            <TouchableOpacity
              onPress={() => router.push(`/(player)/tournaments?clubId=${club.id}` as any)}
              style={styles.seeAllRow}
            >
              <AppText variant="caption" style={styles.seeAllText}>
                Browse All
              </AppText>
              <ChevronRight size={14} color="#18794E" />
            </TouchableOpacity>
          </View>

          {clubTournaments.length === 0 ? (
            <AppText variant="bodySmall" color="secondary">
              No upcoming public tournaments currently scheduled at this club.
            </AppText>
          ) : (
            <View style={styles.competitionsList}>
              {clubTournaments.slice(0, 3).map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={styles.competitionItem}
                  onPress={() => router.push(`/(player)/tournaments?clubId=${club.id}` as any)}
                >
                  <View style={styles.competitionItemLeft}>
                    <AppText variant="heading3" color="primary" numberOfLines={1}>
                      {t.name}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                      {t.format_label || t.format} • {t.start_date ? new Date(t.start_date).toLocaleDateString() : 'Dates TBA'}
                    </AppText>
                  </View>
                  <View style={styles.competitionItemRight}>
                    <Badge
                      label={t.is_registered ? 'Registered' : t.is_registration_open ? 'Open' : t.status_label || t.status}
                      variant={t.is_registered ? 'success' : t.is_registration_open ? 'success' : 'default'}
                      size="sm"
                    />
                    <ChevronRight size={16} color="#94A3B8" />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Card>

        {/* 6. Public Upcoming Leagues */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeaderBetween}>
            <View style={styles.sectionHeader}>
              <Medal size={18} color="#18794E" />
              <AppText variant="heading3" style={styles.sectionTitle}>
                Leagues
              </AppText>
            </View>
            <TouchableOpacity
              onPress={() => router.push(`/(player)/leagues?clubId=${club.id}` as any)}
              style={styles.seeAllRow}
            >
              <AppText variant="caption" style={styles.seeAllText}>
                Browse All
              </AppText>
              <ChevronRight size={14} color="#18794E" />
            </TouchableOpacity>
          </View>

          {clubLeagues.length === 0 ? (
            <AppText variant="bodySmall" color="secondary">
              No upcoming public leagues currently scheduled at this club.
            </AppText>
          ) : (
            <View style={styles.competitionsList}>
              {clubLeagues.slice(0, 3).map((l) => (
                <TouchableOpacity
                  key={l.id}
                  style={styles.competitionItem}
                  onPress={() =>
                    router.push({
                      pathname: '/(player)/league-details',
                      params: { id: l.id },
                    } as any)
                  }
                >
                  <View style={styles.competitionItemLeft}>
                    <AppText variant="heading3" color="primary" numberOfLines={1}>
                      {l.name}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                      {l.number_of_weeks} Weeks • {l.status_display || l.status}
                    </AppText>
                  </View>
                  <View style={styles.competitionItemRight}>
                    <Badge
                      label={l.is_registered ? 'Registered' : l.status_display || l.status}
                      variant={l.is_registered ? 'success' : 'default'}
                      size="sm"
                    />
                    <ChevronRight size={16} color="#94A3B8" />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Card>

        {/* 7. Facilities & Operations */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Clock size={18} color="#18794E" />
            <AppText variant="heading3" style={styles.sectionTitle}>
              Operating Hours & Facilities
            </AppText>
          </View>

          <View style={styles.infoRow}>
            <AppText variant="caption" color="secondary" style={styles.infoLabel}>
              Days:
            </AppText>
            <AppText variant="bodySmall" color="primary">
              {club.operating_days || 'Monday - Sunday'}
            </AppText>
          </View>

          <View style={styles.infoRow}>
            <AppText variant="caption" color="secondary" style={styles.infoLabel}>
              Hours:
            </AppText>
            <AppText variant="bodySmall" color="primary">
              {String(club.opening_time).slice(0, 5)} - {String(club.closing_time).slice(0, 5)} ({club.timezone})
            </AppText>
          </View>

          {club.facilities_summary ? (
            <View style={styles.infoRow}>
              <AppText variant="caption" color="secondary" style={styles.infoLabel}>
                Amenities:
              </AppText>
              <AppText variant="bodySmall" color="primary" style={styles.infoValue}>
                {club.facilities_summary}
              </AppText>
            </View>
          ) : null}
        </Card>

        {/* 8. Quick Shortcuts Row */}
        <View style={styles.shortcutsRow}>
          <TouchableOpacity
            style={styles.shortcutBtn}
            onPress={() => router.push(`/(player)/tournaments?clubId=${club.id}` as any)}
            activeOpacity={0.8}
          >
            <Trophy size={18} color="#18794E" />
            <AppText variant="label" color="primary">
              Tournaments
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shortcutBtn}
            onPress={() => router.push(`/(player)/leagues?clubId=${club.id}` as any)}
            activeOpacity={0.8}
          >
            <Calendar size={18} color="#18794E" />
            <AppText variant="label" color="primary">
              Leagues
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shortcutBtn}
            onPress={() => router.push(`/(player)/courts?clubId=${club.id}` as any)}
            activeOpacity={0.8}
          >
            <LayoutGrid size={18} color="#18794E" />
            <AppText variant="label" color="primary">
              Courts
            </AppText>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Application Request Modal */}
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
                style={styles.submitModalBtn}
              />
            </View>
          </Card>
        </View>
      </Modal>

      {/* Plan Subscription Modal */}
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
                  ₹{selectedPlanForSubscribe?.price}
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
                style={styles.submitModalBtn}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5F8F7',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  heroCard: {
    padding: Spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    gap: Spacing.sm,
  },
  heroHeader: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  heroLogoWrapper: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#E4F4EC',
  },
  heroLogo: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholderLogo: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitles: {
    flex: 1,
    gap: 4,
  },
  locationLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  shortDesc: {
    lineHeight: 20,
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  contactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F0F6F3',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  statusCard: {
    padding: Spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EAE6',
  },
  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusIconCircleGreen: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E4F4EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconCircleAmber: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTextCol: {
    flex: 1,
  },
  joinContent: {
    gap: Spacing.sm,
  },
  joinTextCol: {
    gap: 2,
  },
  sectionCard: {
    padding: Spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    gap: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  sectionHeaderBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countBadge: {
    backgroundColor: '#E4F4EC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  countBadgeText: {
    color: '#18794E',
    fontWeight: '700',
  },
  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    color: '#18794E',
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#102B2A',
  },
  courtsList: {
    gap: Spacing.sm,
  },
  courtItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.sm,
    backgroundColor: '#F9FBFB',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E8EFEA',
  },
  courtItemInfo: {
    flex: 1,
    gap: 2,
  },
  courtItemRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  quickBookPill: {
    backgroundColor: '#18794E',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  quickBookText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 11,
  },
  competitionsList: {
    gap: Spacing.sm,
  },
  competitionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.sm,
    backgroundColor: '#F9FBFB',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E8EFEA',
  },
  competitionItemLeft: {
    flex: 1,
    gap: 2,
    marginRight: Spacing.sm,
  },
  competitionItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  plansList: {
    gap: Spacing.sm,
  },
  planItem: {
    padding: Spacing.sm,
    backgroundColor: '#F9FBFB',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E8EFEA',
  },
  planTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planDesc: {
    marginTop: 4,
  },
  infoRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  infoLabel: {
    width: 80,
  },
  infoValue: {
    flex: 1,
  },
  shortcutsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  shortcutBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2EAE6',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  modalDialog: {
    padding: Spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    gap: Spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalBody: {
    gap: Spacing.sm,
  },
  messageInput: {
    backgroundColor: '#F5F8F7',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#D4E2DC',
    padding: Spacing.sm,
    color: '#102B2A',
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 14,
    fontFamily: 'Inter',
  },
  modalFooter: {
    alignItems: 'center',
  },
  submitModalBtn: {
    width: '100%',
  },
  planPrivilegesRow: {
    marginTop: 4,
    gap: 2,
  },
  planActionRow: {
    marginTop: Spacing.xs,
    alignItems: 'flex-start',
  },
  subscribePriceBox: {
    backgroundColor: '#F5F8F7',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  noticeBoxGreen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: '#E8F5E9',
    padding: Spacing.sm,
    borderRadius: Radius.md,
  },
  paymentMethodSection: {
    gap: Spacing.xs,
  },
  paymentMethodOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  paymentMethodOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
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
});
