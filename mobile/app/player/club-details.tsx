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

import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
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
  ArrowLeft,
  Check,
  Crown,
  Info,
  X,
} from 'lucide-react-native';

import { AppText, Button, Card, CheckoutModal, ErrorState, LoadingState, PlayerClubProfileView, Screen } from '@/components';
import {
  useClubCarouselSlides,
  usePlayerClubMembershipRequest,
  usePlayerClubs,
  useJoinClub,
  usePlayerMembership,
  usePlayerMembershipRequests,
  usePlayerSubscribe,
  useUpcomingActivities,
} from '@/hooks';
import { clubsApi, courtApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import { formatCurrency, safeGoBack } from '@/utils';
import type { Club, MembershipPlan, PlayerCourt, UpcomingActivityItem } from '@/types';

export default function PublicClubDetailScreen() {
  const { id, clubId: paramClubId } = useLocalSearchParams<{ id?: string; clubId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const rawId = Array.isArray(id) ? id[0] : id;
  const rawClubId = Array.isArray(paramClubId) ? paramClubId[0] : paramClubId;
  const clubId = rawId || rawClubId;
  const [refreshSignal, setRefreshSignal] = useState(0);

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
    refetchOnMount: 'always',
  });

  // 2. Fetch active courts for this club (canonical PLAYER_COURTS query key)
  const {
    data: activeCourts = [],
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
    refetchOnMount: 'always',
  });

  // 4. Check caller's enrolled club memberships
  const { clubs: myClubs, refetch: refetchMyClubs } = usePlayerClubs();

  // 5. Fetch club-specific promotional ads (only ads belonging strictly to this club)
  const {
    slides: clubAds = [],
    isLoading: isLoadingAds,
    refetch: refetchAds,
  } = useClubCarouselSlides(clubId, true);
  // 6. Fetch club-specific upcoming activities (strictly scoped to this club_id)
  const {
    activities: upcomingActivities,
    isLoading: isLoadingActivities,
    refetch: refetchUpcomingActivities,
  } = useUpcomingActivities({
    club_id: clubId || undefined,
    limit: 50,
    enabled: Boolean(clubId),
  });

  const handleActivityPress = useCallback(
    (activity: UpcomingActivityItem) => {
      switch (activity.activity_type) {
        case 'tournament':
          router.push({
            pathname: '/player/tournament-details',
            params: { id: activity.id },
          } as any);
          break;
        case 'league':
          router.push({
            pathname: '/player/league-details',
            params: { id: activity.id },
          } as any);
          break;
        case 'event':
          router.push({
            pathname: '/player/events',
            params: { id: activity.id, clubId: activity.club_id },
          } as any);
          break;
        case 'lesson':
          router.push({
            pathname: '/player/lessons',
            params: { id: activity.id, clubId: activity.club_id },
          } as any);
          break;
        default:
          break;
      }
    },
    [router],
  );

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
  const { mutateAsync: subscribeToPlan } = usePlayerSubscribe();

  // Modals state
  const [modalVisible, setModalVisible] = useState(false);
  const [joinChoiceModalVisible, setJoinChoiceModalVisible] = useState(false);
  const [applicationMessage, setApplicationMessage] = useState('');
  const [selectedPlanForSubscribe, setSelectedPlanForSubscribe] = useState<MembershipPlan | null>(null);

  const handleJoinClub = async () => {
    if (!clubId || isJoiningClub) return;
    try {
      await joinClub(clubId);
      await Promise.all([
        refetchMyClubs(),
        refetchClub(),
        refetchPlayerMembership(),
        refetchUpcomingActivities(),
      ]);
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

  return (
    <Screen style={styles.screen}>
      {/* ─── A. Compact Header ────────────────────────────────────────────── */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => safeGoBack(router, '/player/explore-clubs')}
          activeOpacity={0.8}
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={20} color="#102B2A" strokeWidth={2.4} />
        </TouchableOpacity>
        <AppText style={styles.headerTitle} numberOfLines={2}>
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
              setRefreshSignal((s) => s + 1);
              refetchClub();
              refetchCourts();
              refetchPlans();
              refetchRequest();
              refetchMyClubs();
              refetchAds();
              refetchUpcomingActivities();
            }}
            tintColor="#18794E"
          />
        }
      >
        <PlayerClubProfileView
          club={club}
          activeCourts={activeCourts}
          plans={plans}
          clubAds={clubAds}
          isLoadingAds={isLoadingAds}
          upcomingActivities={upcomingActivities}
          isLoadingActivities={isLoadingActivities}
          isEnrolled={isEnrolled}
          hasActivePaidSubscription={hasActivePaidSubscription}
          playerPlanId={playerMembership?.plan_id}
          playerPlanName={playerMembership?.plan_name}
          isPending={isPending}
          isWithdrawing={isWithdrawing}
          isJoiningClub={isJoiningClub}
          refreshSignal={refreshSignal}
          onBookCourt={() =>
            router.push({
              pathname: '/player/courts',
              params: { clubId: club.id },
            } as any)
          }
          onGetMembership={() => setJoinChoiceModalVisible(true)}
          onWithdraw={handleWithdraw}
          onJoinClub={() => setJoinChoiceModalVisible(true)}
          onBookSpecificCourt={(court) =>
            router.push({
              pathname: '/player/courts',
              params: { clubId: club.id, courtId: court.id },
            } as any)
          }
          onPressActivity={handleActivityPress}
          onSelectPlan={(plan) => setSelectedPlanForSubscribe(plan)}
        />
      </ScrollView>

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

      {/* ─── Shared Checkout: Membership Plan Subscription ─────────────────── */}
      {selectedPlanForSubscribe && clubId && (
        <CheckoutModal
          visible={Boolean(selectedPlanForSubscribe)}
          onClose={() => {
            setSelectedPlanForSubscribe(null);
            setJoinChoiceModalVisible(false);
          }}
          showBackButton
          onBack={() => setSelectedPlanForSubscribe(null)}
          clubId={clubId}
          clubName={club.name}
          purpose="membership"
          activityId={selectedPlanForSubscribe.id}
          activityTitle={selectedPlanForSubscribe.name}
          activitySubtitle={`Membership Plan · ${selectedPlanForSubscribe.duration_label || selectedPlanForSubscribe.duration_unit || 'Standard'}`}
          summaryDetails={[
            {
              key: 'club',
              label: 'Club',
              value: club.name,
              icon: 'map',
            },
            {
              key: 'plan',
              label: 'Plan',
              value: selectedPlanForSubscribe.name,
              icon: 'award',
            },
            {
              key: 'cycle',
              label: 'Billing Cycle',
              value: String(selectedPlanForSubscribe.duration_label || selectedPlanForSubscribe.duration_unit || 'Standard'),
              icon: 'calendar',
            },
          ]}
          onConfirmSubmit={async ({ isFree, gatewayReady }) => {
            const sub = await subscribeToPlan({
              clubId,
              planId: selectedPlanForSubscribe.id,
              payload: {
                payment_method: isFree ? 'free' : 'other',
              },
            });
            await refetchMyClubs();
            await refetchPlayerMembership();
            await refetchClub();
            return {
              reference: `SUB-${String(sub?.id || selectedPlanForSubscribe.id).slice(0, 8).toUpperCase()}`,
              status: sub?.status || (isFree || gatewayReady ? 'active' : 'pending'),
              paymentStatus: isFree
                ? 'free'
                : gatewayReady
                  ? 'succeeded'
                  : 'pending',
              title: isFree ? 'Subscription Activated' : 'Subscription Recorded',
              subtitle: isFree
                ? `You are enrolled in ${selectedPlanForSubscribe.name}. Your privileges are now active.`
                : `Your subscription to ${selectedPlanForSubscribe.name} is saved with a pending payment record.`,
              noticeText: !isFree && !gatewayReady
                ? 'Once payment is collected by the club or online gateway, your membership privileges will be activated.'
                : undefined,
              rawResult: sub,
            };
          }}
          onSuccess={() => {
            // Shared CheckoutModal renders Confirmation until the user taps Done
          }}
        />
      )}

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
