/**
 * Aught2 Pickleball — Club Membership Management Screen
 *
 * Exact visual match to reference design:
 * - Clean mobile header: Hamburger icon, "Memberships" title, and subtitle
 * - Club Card with "Play. Connect. Build Community." and "♛ CLUB OWNER >"
 * - Photographic Hero Banner ("Flexible Plans Stronger Community", pickleball, paddle, script text)
 * - "+ New Plan" deep green button
 * - Segmented control: Plans ({count}) | Subscribers ({count})
 * - Membership Plan Cards: Prominent price, active status badge, description, vertically spaced benefits, limits, and Edit / Deactivate buttons
 * - Dedicated Subscribers management view
 * - Mobile-first Create/Edit plan and enrollment forms
 * - Full query, mutation, tenant isolation, and error handling preserved
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  ImageSourcePropType,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Calendar,
  Check,
  MoreVertical,
  Search,
  Target,
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
import {
  useActiveClub,
  useClubPlayerMembers,
  useClubSubscriptions,
  useCreateMembershipPlan,
  useCreateSubscription,
  useMembershipPlans,
  usePermission,
} from '@/hooks';
import type {
  CreateMembershipPlanPayload,
  MemberSubscription,
  MembershipPlan,
  PlanDurationUnit,
} from '@/types';

// Avatar cycles for subscribers matching design system
const SUBSCRIBER_AVATARS: ImageSourcePropType[] = [
  require('../../assets/members/avatar1.jpg'),
  require('../../assets/members/avatar2.jpg'),
  require('../../assets/members/avatar3.jpg'),
  require('../../assets/members/avatar4.jpg'),
];

const DURATION_OPTIONS: { value: PlanDurationUnit; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function MembershipsScreen() {
  const insets = useSafeAreaInsets();
  const { clubId: activeClubId } = useActiveClub();
  const { canManageMemberships } = usePermission();
  const clubId = activeClubId ?? '';

  const [activeTab, setActiveTab] = useState<'plans' | 'subscribers'>('plans');
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MembershipPlan | null>(null);
  const [showEnrollModal, setShowEnrollModal] = useState(false);

  // Queries
  const plansQuery = useMembershipPlans(clubId);
  const subsQuery = useClubSubscriptions(clubId);
  const { playerMembers = [] } = useClubPlayerMembers(clubId);

  // Mutations
  const createPlanMutation = useCreateMembershipPlan(clubId);
  const createSubMutation = useCreateSubscription(clubId);

  // Form states for Plan Create/Edit
  const [planName, setPlanName] = useState('');
  const [planDesc, setPlanDesc] = useState('');
  const [planDuration, setPlanDuration] = useState<PlanDurationUnit>('monthly');
  const [planPrice, setPlanPrice] = useState('');
  const [planBookingLimit, setPlanBookingLimit] = useState('');
  const [planAdvanceDays, setPlanAdvanceDays] = useState('');
  const [planBenefits, setPlanBenefits] = useState<string[]>([
    'Court booking access',
    'Member-only events',
    '3 upcoming bookings',
  ]);
  const [newBenefitInput, setNewBenefitInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Enroll modal states
  const [enrollPlayerId, setEnrollPlayerId] = useState('');
  const [enrollPlanId, setEnrollPlanId] = useState('');
  const [enrollStartDate, setEnrollStartDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [enrollAutoRenew, setEnrollAutoRenew] = useState(true);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  // Search in subscribers
  const [subscriberSearch, setSubscriberSearch] = useState('');

  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data]);
  const subscriptions = useMemo(() => subsQuery.data ?? [], [subsQuery.data]);

  const filteredSubscriptions = useMemo(() => {
    if (!subscriberSearch.trim()) return subscriptions;
    const q = subscriberSearch.toLowerCase().trim();
    return subscriptions.filter((s) => {
      const name = s.player?.user_full_name?.toLowerCase() || '';
      const email = s.player?.user_email?.toLowerCase() || '';
      const plan = s.plan_name?.toLowerCase() || '';
      return name.includes(q) || email.includes(q) || plan.includes(q);
    });
  }, [subscriptions, subscriberSearch]);

  // ─── Plan Handlers ─────────────────────────────────────────────────────────

  const handleOpenCreatePlan = () => {
    setEditingPlan(null);
    setPlanName('');
    setPlanDesc('Standard monthly membership with core court access and booking privileges.');
    setPlanDuration('monthly');
    setPlanPrice('999.00');
    setPlanBookingLimit('3');
    setPlanAdvanceDays('14');
    setPlanBenefits([
      'Court booking access',
      'Member-only events',
      '3 upcoming bookings',
    ]);
    setNewBenefitInput('');
    setFormError(null);
    setShowCreatePlan(true);
  };

  const handleOpenEditPlan = (plan: MembershipPlan) => {
    setEditingPlan(plan);
    setPlanName(plan.name);
    setPlanDesc(plan.description || '');
    setPlanDuration((plan.duration_unit as PlanDurationUnit) || 'monthly');
    setPlanPrice(parseFloat(plan.price).toFixed(2));
    setPlanBookingLimit(plan.booking_limit != null ? String(plan.booking_limit) : '');
    setPlanAdvanceDays(plan.advance_booking_days != null ? String(plan.advance_booking_days) : '');
    setPlanBenefits(plan.benefits && plan.benefits.length > 0 ? plan.benefits : ['Court booking access']);
    setNewBenefitInput('');
    setFormError(null);
    setShowCreatePlan(true);
  };

  const handleAddBenefit = () => {
    if (newBenefitInput.trim()) {
      setPlanBenefits([...planBenefits, newBenefitInput.trim()]);
      setNewBenefitInput('');
    }
  };

  const handleRemoveBenefit = (index: number) => {
    setPlanBenefits(planBenefits.filter((_, i) => i !== index));
  };

  const handleSavePlan = async () => {
    if (!planName.trim() || !planPrice.trim()) {
      setFormError('Plan name and price are required.');
      return;
    }
    const priceNum = parseFloat(planPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      setFormError('Please enter a valid price (≥ 0).');
      return;
    }

    const payload: CreateMembershipPlanPayload = {
      name: planName.trim(),
      description: planDesc.trim() || null,
      duration_unit: planDuration,
      price: priceNum.toFixed(2),
      currency: 'INR',
      benefits: planBenefits,
      booking_limit: planBookingLimit ? parseInt(planBookingLimit, 10) : null,
      advance_booking_days: planAdvanceDays ? parseInt(planAdvanceDays, 10) : null,
    };

    try {
      if (editingPlan) {
        const { membershipApi } = await import('@/services/api');
        await membershipApi.updatePlan(clubId, editingPlan.id, payload);
        Alert.alert('Plan Updated', `"${planName}" was updated successfully.`);
      } else {
        await createPlanMutation.mutateAsync(payload);
        Alert.alert('Plan Created', `"${planName}" was created successfully.`);
      }
      setShowCreatePlan(false);
      plansQuery.refetch();
    } catch (e: any) {
      setFormError(e?.message ?? 'Failed to save plan.');
    }
  };

  const handleDeactivatePlan = (plan: MembershipPlan) => {
    Alert.alert(
      'Deactivate Plan',
      `Deactivating "${plan.name}" will prevent new subscriptions. Active subscriptions will remain valid until expiry.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            try {
              const { membershipApi } = await import('@/services/api');
              await membershipApi.deactivatePlan(clubId, plan.id);
              plansQuery.refetch();
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Failed to deactivate plan.');
            }
          },
        },
      ]
    );
  };

  const handleReactivatePlan = async (plan: MembershipPlan) => {
    try {
      const { membershipApi } = await import('@/services/api');
      await membershipApi.reactivatePlan(clubId, plan.id);
      plansQuery.refetch();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to reactivate plan.');
    }
  };

  const handlePlanMenu = (plan: MembershipPlan) => {
    Alert.alert(plan.name, `${plan.duration_label} · ${plan.currency} ${plan.price}`, [
      { text: 'Edit Plan', onPress: () => handleOpenEditPlan(plan) },
      plan.status === 'active'
        ? { text: 'Deactivate', style: 'destructive', onPress: () => handleDeactivatePlan(plan) }
        : { text: 'Reactivate', onPress: () => handleReactivatePlan(plan) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ─── Subscription Handlers ─────────────────────────────────────────────────

  const handleCancelSub = (sub: MemberSubscription) => {
    Alert.alert(
      'Cancel Subscription',
      `Are you sure you want to cancel the subscription for ${sub.player?.user_full_name ?? sub.player?.user_email}?`,
      [
        { text: 'Back', style: 'cancel' },
        {
          text: 'Cancel Subscription',
          style: 'destructive',
          onPress: async () => {
            try {
              const { membershipApi } = await import('@/services/api');
              await membershipApi.cancelSubscription(clubId, sub.id, { cancellation_reason: 'Admin cancelled' });
              subsQuery.refetch();
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Failed to cancel subscription.');
            }
          },
        },
      ]
    );
  };

  const handleEnrollSubmit = async () => {
    if (!enrollPlayerId || !enrollPlanId) {
      setEnrollError('Please select both a player and a plan.');
      return;
    }
    try {
      await createSubMutation.mutateAsync({
        player_membership_id: enrollPlayerId,
        membership_plan_id: enrollPlanId,
        start_date: enrollStartDate,
        auto_renew: enrollAutoRenew,
      });
      setShowEnrollModal(false);
      subsQuery.refetch();
      Alert.alert('Success', 'Player enrolled in membership.');
    } catch (e: any) {
      setEnrollError(e?.message ?? 'Failed to enroll player.');
    }
  };

  if (!canManageMemberships) {
    return (
      <Screen style={styles.screenContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#F3F8F5" />
        <AppHeader
          title="Memberships"
          subtitle="Plans, tiers, and subscriber management"
          borderless
        />
        <ErrorState
          title="Access Restricted"
          message="Membership management requires Club Owner or Manager role."
        />
      </Screen>
    );
  }

  const isLoading = plansQuery.isLoading || subsQuery.isLoading;
  const isRefetching = plansQuery.isRefetching || subsQuery.isRefetching;
  const onRefresh = () => {
    plansQuery.refetch();
    subsQuery.refetch();
  };

  // ─── Header Component ───────────────────────────────────────────────────────

  const renderHeader = () => (
    <View style={styles.listHeaderWrapper}>
      {/* 1. Hero Promotional Banner */}
      <View style={styles.heroBannerWrapper}>
        <Image
          source={require('../../assets/memberships/hero_banner.jpg')}
          style={styles.heroBannerImage}
          resizeMode="cover"
        />
      </View>

      {/* 3. + New Plan Button */}
      <View style={styles.newPlanButtonRow}>
        <TouchableOpacity
          style={styles.newPlanButton}
          onPress={handleOpenCreatePlan}
          activeOpacity={0.8}
        >
          <AppText style={styles.newPlanButtonText}>+ New Plan</AppText>
        </TouchableOpacity>
      </View>

      {/* 4. Segmented Tabs: Plans ({count}) | Subscribers ({count}) */}
      <View style={styles.segmentedContainer}>
        <TouchableOpacity
          style={[styles.segmentedTab, activeTab === 'plans' && styles.segmentedTabActive]}
          onPress={() => setActiveTab('plans')}
          activeOpacity={0.8}
        >
          <AppText
            style={[
              styles.segmentedTabText,
              activeTab === 'plans' && styles.segmentedTabTextActive,
            ]}
          >
            Plans ({plans.length})
          </AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentedTab, activeTab === 'subscribers' && styles.segmentedTabActive]}
          onPress={() => setActiveTab('subscribers')}
          activeOpacity={0.8}
        >
          <AppText
            style={[
              styles.segmentedTabText,
              activeTab === 'subscribers' && styles.segmentedTabTextActive,
            ]}
          >
            Subscribers ({subscriptions.length})
          </AppText>
        </TouchableOpacity>
      </View>

      {/* Subscriber Search Bar (Only when in subscribers view) */}
      {activeTab === 'subscribers' && (
        <View style={styles.subSearchRow}>
          <View style={styles.searchContainer}>
            <Search size={16} color="#647570" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search subscribers by name, email, plan..."
              placeholderTextColor="#8C9BA5"
              value={subscriberSearch}
              onChangeText={setSubscriberSearch}
            />
            {subscriberSearch.length > 0 && (
              <TouchableOpacity
                onPress={() => setSubscriberSearch('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={15} color="#647570" />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={styles.enrollSubBtn}
            onPress={() => {
              setEnrollError(null);
              setShowEnrollModal(true);
            }}
            activeOpacity={0.8}
          >
            <AppText style={styles.enrollSubBtnText}>+ Enroll</AppText>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  // ─── Render Plan Card ──────────────────────────────────────────────────────

  const renderPlanCard = ({ item }: { item: MembershipPlan }) => {
    const isActive = item.status === 'active';
    const benefits = item.benefits && item.benefits.length > 0
      ? item.benefits
      : ['Court booking access', 'Member-only events'];

    return (
      <View style={styles.planCard}>
        {/* Header Row: Title, Status Badge, Three dots */}
        <View style={styles.planCardHeader}>
          <View style={styles.planTitleContainer}>
            <AppText style={styles.planName}>{item.name}</AppText>
            <AppText style={styles.planDuration}>{item.duration_label || 'Monthly'}</AppText>
          </View>

          <View style={styles.planStatusAndOptions}>
            <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusInactive]}>
              <AppText style={[styles.statusBadgeText, isActive ? styles.statusActiveText : styles.statusInactiveText]}>
                {item.status.toUpperCase()}
              </AppText>
            </View>

            <TouchableOpacity
              onPress={() => handlePlanMenu(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.threeDotBtn}
            >
              <MoreVertical size={16} color="#647570" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Price Row */}
        <View style={styles.planPriceRow}>
          <AppText style={styles.planPrice}>
            {item.currency} {parseFloat(item.price).toFixed(2)}
          </AppText>
        </View>

        {/* Description */}
        {item.description ? (
          <AppText style={styles.planDescription}>{item.description}</AppText>
        ) : null}

        {/* Benefits List */}
        <View style={styles.benefitsList}>
          {benefits.map((b, i) => (
            <View key={i} style={styles.benefitRow}>
              <Check size={14} color="#176B59" style={styles.checkmarkIcon} />
              <AppText style={styles.benefitText}>{b}</AppText>
            </View>
          ))}
        </View>

        {/* Limits Row */}
        <View style={styles.limitsRow}>
          {item.booking_limit != null && (
            <View style={styles.limitItem}>
              <Target size={14} color="#D97706" style={styles.limitIcon} />
              <AppText style={styles.limitText}>
                {item.booking_limit} bookings max
              </AppText>
            </View>
          )}

          {item.advance_booking_days != null && (
            <View style={styles.limitItem}>
              <Calendar size={14} color="#2563EB" style={styles.limitIcon} />
              <AppText style={styles.limitText}>
                {item.advance_booking_days}-day advance
              </AppText>
            </View>
          )}
        </View>

        {/* Actions Row: Edit & Deactivate / Reactivate */}
        <View style={styles.planActionsRow}>
          <TouchableOpacity
            style={styles.editPlanBtn}
            onPress={() => handleOpenEditPlan(item)}
            activeOpacity={0.8}
          >
            <AppText style={styles.editPlanBtnText}>Edit</AppText>
          </TouchableOpacity>

          {isActive ? (
            <TouchableOpacity
              style={styles.deactivatePlanBtn}
              onPress={() => handleDeactivatePlan(item)}
              activeOpacity={0.8}
            >
              <AppText style={styles.deactivatePlanBtnText}>Deactivate</AppText>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.reactivatePlanBtn}
              onPress={() => handleReactivatePlan(item)}
              activeOpacity={0.8}
            >
              <AppText style={styles.reactivatePlanBtnText}>Reactivate</AppText>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // ─── Render Subscriber Card ────────────────────────────────────────────────

  const renderSubscriberCard = ({ item, index }: { item: MemberSubscription; index: number }) => {
    const avatarSource = SUBSCRIBER_AVATARS[index % SUBSCRIBER_AVATARS.length];
    const playerName = item.player?.user_full_name || item.player?.user_email?.split('@')[0] || 'Subscriber';
    const isActive = item.effective_status === 'active';

    return (
      <View style={styles.subscriberCard}>
        <View style={styles.subTopRow}>
          {/* Avatar */}
          <View style={styles.subAvatarWrapper}>
            <Image source={avatarSource} style={styles.subAvatarImage} resizeMode="cover" />
          </View>

          {/* Details */}
          <View style={styles.subDetailsCol}>
            <View style={styles.subNameRow}>
              <AppText style={styles.subPlayerName}>{playerName}</AppText>
              <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusInactive]}>
                <AppText style={[styles.statusBadgeText, isActive ? styles.statusActiveText : styles.statusInactiveText]}>
                  {item.effective_status.toUpperCase()}
                </AppText>
              </View>
            </View>

            <AppText style={styles.subEmail}>{item.player?.user_email}</AppText>

            <View style={styles.subPlanBadgeRow}>
              <View style={styles.subPlanPill}>
                <AppText style={styles.subPlanPillText}>{item.plan_name || 'Membership'}</AppText>
              </View>
              <AppText style={styles.renewalText}>
                Renews {formatDate(item.end_date)}
              </AppText>
            </View>
          </View>
        </View>

        {/* Action Row */}
        <View style={styles.subActionRow}>
          <View style={styles.subBillingInfo}>
            <AppText style={styles.subBillingText}>
              Billing: {item.plan_duration || 'Monthly'} · {item.plan_currency || 'INR'} {item.plan_price || ''}
            </AppText>
          </View>

          {isActive && (
            <TouchableOpacity
              style={styles.cancelSubBtn}
              onPress={() => handleCancelSub(item)}
              activeOpacity={0.7}
            >
              <AppText style={styles.cancelSubBtnText}>Cancel</AppText>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <Screen style={styles.screenContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F8F5" />

      {/* Top Mobile Header */}
      <AppHeader
        title="Memberships"
        subtitle="Plans, tiers, and subscriber management"
        borderless
      />

      {/* Main List */}
      {isLoading ? (
        <LoadingState message="Loading memberships..." />
      ) : activeTab === 'plans' ? (
        <FlatList
          data={plans}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContentContainer}
          renderItem={renderPlanCard}
          ListEmptyComponent={
            <EmptyState
              title="No Membership Plans"
              description="Create flexible plans to provide players with structured court booking access."
              actionLabel="+ New Plan"
              onAction={handleOpenCreatePlan}
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor="#176B59"
            />
          }
        />
      ) : (
        <FlatList
          data={filteredSubscriptions}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContentContainer}
          renderItem={renderSubscriberCard}
          ListEmptyComponent={
            <EmptyState
              title="No Subscribers Found"
              description={
                subscriberSearch.trim()
                  ? 'No subscribers match your search query.'
                  : 'Enrolled players with active subscriptions will appear here.'
              }
              actionLabel="+ Enroll Player"
              onAction={() => setShowEnrollModal(true)}
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor="#176B59"
            />
          }
        />
      )}

      {/* ─── Create / Edit Plan Modal ────────────────────────────────────────── */}
      <Modal
        visible={showCreatePlan}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreatePlan(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowCreatePlan(false)}
        >
          <Pressable style={styles.modalSheetContent} onPress={(e) => e.stopPropagation()}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeaderRow}>
                <View>
                  <AppText style={styles.modalTitle}>
                    {editingPlan ? 'Edit Membership Plan' : 'Create Membership Plan'}
                  </AppText>
                  <AppText style={styles.modalSubtitle}>
                    Configure tiers, pricing, and booking privileges
                  </AppText>
                </View>
                <TouchableOpacity
                  onPress={() => setShowCreatePlan(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={20} color="#647570" />
                </TouchableOpacity>
              </View>

              {formError && (
                <View style={styles.modalErrorBox}>
                  <AppText style={styles.modalErrorText}>{formError}</AppText>
                </View>
              )}

              <View style={styles.formGroup}>
                <AppText style={styles.formLabel}>Plan Name *</AppText>
                <TextInput
                  style={styles.formInput}
                  placeholder="e.g. Basic Monthly"
                  placeholderTextColor="#8C9BA5"
                  value={planName}
                  onChangeText={setPlanName}
                />
              </View>

              <View style={styles.formGroup}>
                <AppText style={styles.formLabel}>Billing Cycle *</AppText>
                <View style={styles.durationOptionsRow}>
                  {DURATION_OPTIONS.map((d) => (
                    <TouchableOpacity
                      key={d.value}
                      style={[
                        styles.durationOption,
                        planDuration === d.value && styles.durationOptionActive,
                      ]}
                      onPress={() => setPlanDuration(d.value)}
                    >
                      <AppText
                        style={[
                          styles.durationOptionText,
                          planDuration === d.value && styles.durationOptionTextActive,
                        ]}
                      >
                        {d.label}
                      </AppText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <AppText style={styles.formLabel}>Price (INR) *</AppText>
                <TextInput
                  style={styles.formInput}
                  placeholder="999.00"
                  placeholderTextColor="#8C9BA5"
                  keyboardType="decimal-pad"
                  value={planPrice}
                  onChangeText={setPlanPrice}
                />
              </View>

              <View style={styles.formGroup}>
                <AppText style={styles.formLabel}>Description</AppText>
                <TextInput
                  style={[styles.formInput, styles.multilineInput]}
                  placeholder="Standard monthly membership with core court access and booking privileges."
                  placeholderTextColor="#8C9BA5"
                  multiline
                  numberOfLines={3}
                  value={planDesc}
                  onChangeText={setPlanDesc}
                />
              </View>

              <View style={styles.formGroup}>
                <AppText style={styles.formLabel}>Plan Benefits</AppText>
                {planBenefits.map((b, i) => (
                  <View key={i} style={styles.benefitEditItem}>
                    <Check size={14} color="#176B59" />
                    <AppText style={styles.benefitEditText}>{b}</AppText>
                    <TouchableOpacity
                      onPress={() => handleRemoveBenefit(i)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <X size={14} color="#647570" />
                    </TouchableOpacity>
                  </View>
                ))}

                <View style={styles.addBenefitRow}>
                  <TextInput
                    style={styles.addBenefitInput}
                    placeholder="Add a benefit (e.g. Priority booking)"
                    placeholderTextColor="#8C9BA5"
                    value={newBenefitInput}
                    onChangeText={setNewBenefitInput}
                  />
                  <TouchableOpacity
                    style={styles.addBenefitBtn}
                    onPress={handleAddBenefit}
                  >
                    <AppText style={styles.addBenefitBtnText}>+ Add</AppText>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formRowTwoCols}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <AppText style={styles.formLabel}>Booking Limit</AppText>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. 3"
                    placeholderTextColor="#8C9BA5"
                    keyboardType="number-pad"
                    value={planBookingLimit}
                    onChangeText={setPlanBookingLimit}
                  />
                </View>

                <View style={[styles.formGroup, { flex: 1 }]}>
                  <AppText style={styles.formLabel}>Advance Days</AppText>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. 14"
                    placeholderTextColor="#8C9BA5"
                    keyboardType="number-pad"
                    value={planAdvanceDays}
                    onChangeText={setPlanAdvanceDays}
                  />
                </View>
              </View>

              <View style={styles.modalActionButtons}>
                <TouchableOpacity
                  style={styles.cancelModalBtn}
                  onPress={() => setShowCreatePlan(false)}
                >
                  <AppText style={styles.cancelModalBtnText}>Cancel</AppText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.submitModalBtn}
                  onPress={handleSavePlan}
                  disabled={createPlanMutation.isPending}
                >
                  <AppText style={styles.submitModalBtnText}>
                    {createPlanMutation.isPending
                      ? 'Saving...'
                      : editingPlan
                      ? 'Save Changes'
                      : 'Create Plan'}
                  </AppText>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Enroll Player Modal ─────────────────────────────────────────────── */}
      <Modal
        visible={showEnrollModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEnrollModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowEnrollModal(false)}
        >
          <Pressable style={styles.modalSheetContent} onPress={(e) => e.stopPropagation()}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeaderRow}>
                <View>
                  <AppText style={styles.modalTitle}>Enroll Player</AppText>
                  <AppText style={styles.modalSubtitle}>Assign a membership subscription</AppText>
                </View>
                <TouchableOpacity
                  onPress={() => setShowEnrollModal(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={20} color="#647570" />
                </TouchableOpacity>
              </View>

              {enrollError && (
                <View style={styles.modalErrorBox}>
                  <AppText style={styles.modalErrorText}>{enrollError}</AppText>
                </View>
              )}

              <View style={styles.formGroup}>
                <AppText style={styles.formLabel}>Select Player *</AppText>
                <ScrollView style={styles.selectionScroll} nestedScrollEnabled>
                  {playerMembers.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.selectionItem,
                        enrollPlayerId === p.id && styles.selectionItemActive,
                      ]}
                      onPress={() => setEnrollPlayerId(p.id)}
                    >
                      <AppText
                        style={[
                          styles.selectionItemText,
                          enrollPlayerId === p.id && styles.selectionItemTextActive,
                        ]}
                      >
                        {p.user_full_name || p.user_email}
                      </AppText>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.formGroup}>
                <AppText style={styles.formLabel}>Select Plan *</AppText>
                <View style={styles.planSelectionCol}>
                  {plans.filter((p) => p.status === 'active').map((plan) => (
                    <TouchableOpacity
                      key={plan.id}
                      style={[
                        styles.selectionItem,
                        enrollPlanId === plan.id && styles.selectionItemActive,
                      ]}
                      onPress={() => setEnrollPlanId(plan.id)}
                    >
                      <AppText
                        style={[
                          styles.selectionItemText,
                          enrollPlanId === plan.id && styles.selectionItemTextActive,
                        ]}
                      >
                        {plan.name} · {plan.currency} {plan.price} / {plan.duration_label}
                      </AppText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <AppText style={styles.formLabel}>Start Date (YYYY-MM-DD)</AppText>
                <TextInput
                  style={styles.formInput}
                  value={enrollStartDate}
                  onChangeText={setEnrollStartDate}
                />
              </View>

              <TouchableOpacity
                style={styles.autoRenewRow}
                onPress={() => setEnrollAutoRenew(!enrollAutoRenew)}
                activeOpacity={0.8}
              >
                <View style={[styles.checkbox, enrollAutoRenew && styles.checkboxChecked]}>
                  {enrollAutoRenew && <Check size={12} color="#FFFFFF" />}
                </View>
                <AppText style={styles.autoRenewText}>Enable auto-renew</AppText>
              </TouchableOpacity>

              <View style={styles.modalActionButtons}>
                <TouchableOpacity
                  style={styles.cancelModalBtn}
                  onPress={() => setShowEnrollModal(false)}
                >
                  <AppText style={styles.cancelModalBtnText}>Cancel</AppText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.submitModalBtn}
                  onPress={handleEnrollSubmit}
                  disabled={createSubMutation.isPending}
                >
                  <AppText style={styles.submitModalBtnText}>
                    {createSubMutation.isPending ? 'Enrolling...' : 'Enroll Player'}
                  </AppText>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#F3F8F5',
  },
  topHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: '#F3F8F5',
    gap: 12,
  },
  menuButton: {
    padding: 4,
  },
  headerTitles: {
    flex: 1,
  },
  headerMainTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#102F2A',
    lineHeight: 28,
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: '#647570',
    marginTop: 1,
    lineHeight: 15,
  },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  listHeaderWrapper: {
    marginBottom: 8,
  },
  clubCardContainer: {
    marginTop: 4,
    marginBottom: 12,
  },
  heroBannerWrapper: {
    width: '100%',
    aspectRatio: 476 / 184,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E8E4',
    marginBottom: 14,
    backgroundColor: '#E7F0EB',
  },
  heroBannerImage: {
    width: '100%',
    height: '100%',
  },
  newPlanButtonRow: {
    marginBottom: 12,
  },
  newPlanButton: {
    backgroundColor: '#176B59',
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  newPlanButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E8E4',
    borderRadius: 22,
    padding: 3,
    marginBottom: 14,
  },
  segmentedTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
  },
  segmentedTabActive: {
    backgroundColor: '#176B59',
  },
  segmentedTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#102F2A',
  },
  segmentedTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  subSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E8E4',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#102F2A',
    paddingVertical: 0,
  },
  enrollSubBtn: {
    backgroundColor: '#176B59',
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enrollSubBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  planCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E8E4',
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  planCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  planTitleContainer: {
    flex: 1,
  },
  planName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#102F2A',
    lineHeight: 22,
  },
  planDuration: {
    fontSize: 12.5,
    color: '#647570',
    marginTop: 2,
  },
  planStatusAndOptions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  statusActive: {
    backgroundColor: '#E4F4EB',
  },
  statusActiveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#176B59',
    letterSpacing: 0.3,
  },
  statusInactive: {
    backgroundColor: '#EAF0EC',
  },
  statusInactiveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#647570',
  },
  threeDotBtn: {
    padding: 2,
  },
  planPriceRow: {
    marginVertical: 4,
  },
  planPrice: {
    fontSize: 26,
    fontWeight: '700',
    color: '#102F2A',
    lineHeight: 32,
  },
  planDescription: {
    fontSize: 13.5,
    color: '#647570',
    lineHeight: 18,
    marginBottom: 12,
  },
  benefitsList: {
    gap: 7,
    marginBottom: 14,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkmarkIcon: {
    flexShrink: 0,
  },
  benefitText: {
    fontSize: 13,
    color: '#102F2A',
    fontWeight: '500',
  },
  limitsRow: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F2F6F4',
    marginBottom: 14,
  },
  limitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  limitIcon: {
    flexShrink: 0,
  },
  limitText: {
    fontSize: 12,
    color: '#647570',
    fontWeight: '500',
  },
  planActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  editPlanBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E8E4',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editPlanBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#102F2A',
  },
  deactivatePlanBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#FBE5E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deactivatePlanBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#B91C1C',
  },
  reactivatePlanBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#E4F4EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactivatePlanBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#176B59',
  },
  subscriberCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E8E4',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  subTopRow: {
    flexDirection: 'row',
    gap: 12,
  },
  subAvatarWrapper: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: '#E4F4EB',
  },
  subAvatarImage: {
    width: '100%',
    height: '100%',
  },
  subDetailsCol: {
    flex: 1,
  },
  subNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  subPlayerName: {
    fontSize: 16.5,
    fontWeight: '700',
    color: '#102F2A',
  },
  subEmail: {
    fontSize: 13,
    color: '#647570',
    marginTop: 1,
    marginBottom: 6,
  },
  subPlanBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  subPlanPill: {
    backgroundColor: '#E7F0FB',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 10,
  },
  subPlanPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  renewalText: {
    fontSize: 11.5,
    color: '#647570',
  },
  subActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F2F6F4',
  },
  subBillingInfo: {
    flex: 1,
  },
  subBillingText: {
    fontSize: 12,
    color: '#647570',
  },
  cancelSubBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FBE5E5',
  },
  cancelSubBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B91C1C',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#102F2A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#647570',
    marginTop: 2,
  },
  modalErrorBox: {
    backgroundColor: '#FBE5E5',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  modalErrorText: {
    fontSize: 12,
    color: '#B91C1C',
  },
  formGroup: {
    marginBottom: 14,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#102F2A',
    marginBottom: 6,
  },
  formInput: {
    height: 44,
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#E0E8E4',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13.5,
    color: '#102F2A',
  },
  multilineInput: {
    height: 72,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  durationOptionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  durationOption: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E8E4',
    backgroundColor: '#F0F4F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationOptionActive: {
    backgroundColor: '#176B59',
    borderColor: '#176B59',
  },
  durationOptionText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#102F2A',
  },
  durationOptionTextActive: {
    color: '#FFFFFF',
  },
  benefitEditItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAF9',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E8E4',
    marginBottom: 6,
  },
  benefitEditText: {
    flex: 1,
    fontSize: 12.5,
    color: '#102F2A',
  },
  addBenefitRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  addBenefitInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#E0E8E4',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 12.5,
    color: '#102F2A',
  },
  addBenefitBtn: {
    height: 40,
    paddingHorizontal: 14,
    backgroundColor: '#176B59',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBenefitBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  formRowTwoCols: {
    flexDirection: 'row',
    gap: 10,
  },
  modalActionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    marginBottom: 14,
  },
  cancelModalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E8E4',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  cancelModalBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#647570',
  },
  submitModalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#176B59',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitModalBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  selectionScroll: {
    maxHeight: 140,
    backgroundColor: '#F8FAF9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E8E4',
  },
  planSelectionCol: {
    gap: 6,
  },
  selectionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F6F4',
  },
  selectionItemActive: {
    backgroundColor: '#E4F4EB',
  },
  selectionItemText: {
    fontSize: 13,
    color: '#102F2A',
  },
  selectionItemTextActive: {
    fontWeight: '700',
    color: '#176B59',
  },
  autoRenewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E0E8E4',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#176B59',
    borderColor: '#176B59',
  },
  autoRenewText: {
    fontSize: 13,
    color: '#102F2A',
  },
});
