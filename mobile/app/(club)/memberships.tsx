/**
 * Aught2 Pickleball — Club Membership Management Screen
 *
 * Exact visual match to the reference specification:
 * - Header: Hamburger menu on left, bold "Memberships" title, and subtitle
 *   "Plans, tiers, and subscriber management" in deep forest-green typography.
 * - Promotional Hero Banner: Wide rounded sports-themed banner with pickleball court,
 *   headline "Flexible Plans. Stronger Community.", supporting text "Give players more ways to play, belong and grow.",
 *   and dark green accent bar.
 * - "+ New Plan" prominent deep-green rounded pill button.
 * - Segmented Control: [ Plans ({plans.length}) ] | [ Subscribers ({subscriptions.length}) ]
 * - Subscriber Search: Search input with search icon across full width.
 * - Subscriber Cards:
 *   - Circular profile avatar (cover cropped, neutral initials fallback)
 *   - Bold subscriber name in dark forest green (#123D38)
 *   - Subscriber email
 *   - Upper-right subscription status badge (ACTIVE, CANCELLED, EXPIRED)
 *   - Membership plan badge (soft pale blue pill, e.g. "Basic Monthly")
 *   - Renewal date with calendar icon (e.g. "Renews 6 Oct 2026")
 *   - Thin horizontal divider
 *   - Bottom row: CreditCard icon + "Billing: Monthly · $999.00" on left, MoreVertical 3-dot menu on right.
 * - Plans Tab:
 *   - Plan cards with name, duration, price, description, benefits checklist, booking limits, advance days, Edit & Deactivate.
 * - Real API integrations, tenant isolation, and error handling preserved.
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  ImageBackground,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Calendar,
  Check,
  CreditCard,
  Menu,
  MoreVertical,
  Plus,
  Search,
  Target,
  X,
} from 'lucide-react-native';

import {
  AppText,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
} from '@/components';
import { useDrawerStore } from '@/navigation';
import {
  useActiveClub,
  useClubPlayerMembers,
  useClubSubscriptions,
  useCreateMembershipPlan,
  useMembershipPlans,
  usePermission,
} from '@/hooks';
import { formatCurrency, resolveMediaUrl } from '@/utils';
import type {
  CreateMembershipPlanPayload,
  MemberSubscription,
  MembershipPlan,
  PlanDurationUnit,
} from '@/types';

const DURATION_OPTIONS: { value: PlanDurationUnit; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

function formatRenewalDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return dateStr;
  }
}

// ─── Circular Subscriber Avatar ───────────────────────────────────────────────

interface SubscriberAvatarProps {
  imageUrl?: string | null;
  name: string;
  size?: number;
}

function SubscriberAvatar({ imageUrl, name, size = 64 }: SubscriberAvatarProps) {
  const [loadError, setLoadError] = useState(false);

  const resolvedUri = useMemo(() => {
    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) return null;
    return resolveMediaUrl(imageUrl);
  }, [imageUrl]);

  const initials = useMemo(() => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    if (parts.length === 1 && parts[0].length > 0) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return 'PB';
  }, [name]);

  if (resolvedUri && !loadError) {
    return (
      <View style={[styles.avatarWrapper, { width: size, height: size, borderRadius: size / 2 }]}>
        <Image
          source={{ uri: resolvedUri }}
          style={[styles.avatarImage, { width: size, height: size, borderRadius: size / 2 }]}
          resizeMode="cover"
          onError={() => setLoadError(true)}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.avatarWrapper,
        styles.avatarFallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <AppText
        style={[
          styles.avatarInitials,
          { fontSize: Math.round(size * 0.36) },
        ]}
      >
        {initials}
      </AppText>
    </View>
  );
}

// ─── Main Memberships Screen ──────────────────────────────────────────────────

export default function MembershipsScreen() {
  const insets = useSafeAreaInsets();
  const openDrawer = useDrawerStore((s) => s.openDrawer);
  const { clubId: activeClubId } = useActiveClub();
  const { canManageMemberships } = usePermission();
  const clubId = activeClubId ?? '';

  const [activeTab, setActiveTab] = useState<'plans' | 'subscribers'>('plans');
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MembershipPlan | null>(null);

  // Queries
  const plansQuery = useMembershipPlans(clubId);
  const subsQuery = useClubSubscriptions(clubId);
  const { playerMembers = [] } = useClubPlayerMembers(clubId);

  // Mutations
  const createPlanMutation = useCreateMembershipPlan(clubId);

  // Plan Form States
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
  const [savingPlan, setSavingPlan] = useState(false);

  // Search Filter
  const [subscriberSearch, setSubscriberSearch] = useState('');

  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data]);
  const subscriptions = useMemo(() => subsQuery.data ?? [], [subsQuery.data]);

  // Map player memberships for avatars and details fallback
  const playerMembersMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const pm of playerMembers) {
      if (pm.profile_image_url) {
        map.set(pm.id, pm.profile_image_url);
        map.set(pm.user_id, pm.profile_image_url);
      }
    }
    return map;
  }, [playerMembers]);

  // Filter subscribers based on search query
  const filteredSubscriptions = useMemo(() => {
    if (!subscriberSearch.trim()) return subscriptions;
    const q = subscriberSearch.toLowerCase().trim();
    return subscriptions.filter((s) => {
      const name = s.player?.user_full_name?.toLowerCase() || '';
      const email = s.player?.user_email?.toLowerCase() || '';
      const plan = s.plan_name?.toLowerCase() || '';
      const status = s.effective_status?.toLowerCase() || s.status?.toLowerCase() || '';
      return name.includes(q) || email.includes(q) || plan.includes(q) || status.includes(q);
    });
  }, [subscriptions, subscriberSearch]);

  // ─── Plan Handlers ─────────────────────────────────────────────────────────

  const handleOpenCreatePlan = () => {
    setEditingPlan(null);
    setPlanName('');
    setPlanDesc('Standard membership with court booking privileges.');
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
      currency: 'USD',
      benefits: planBenefits,
      booking_limit: planBookingLimit ? parseInt(planBookingLimit, 10) : null,
      advance_booking_days: planAdvanceDays ? parseInt(planAdvanceDays, 10) : null,
    };

    setSavingPlan(true);
    setFormError(null);
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
    } finally {
      setSavingPlan(false);
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
    Alert.alert(plan.name, `${plan.duration_label || plan.duration_unit} · ${plan.currency || 'USD'} ${plan.price}`, [
      { text: 'Edit Plan', onPress: () => handleOpenEditPlan(plan) },
      plan.status === 'active'
        ? { text: 'Deactivate', style: 'destructive', onPress: () => handleDeactivatePlan(plan) }
        : { text: 'Reactivate', onPress: () => handleReactivatePlan(plan) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ─── Subscription Handlers ─────────────────────────────────────────────────

  const handleCancelSub = (sub: MemberSubscription) => {
    const subscriberName = sub.player?.user_full_name ?? sub.player?.user_email ?? 'Subscriber';
    Alert.alert(
      'Cancel Subscription',
      `Are you sure you want to cancel the subscription for ${subscriberName}?`,
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

  const handleSubMenu = (sub: MemberSubscription) => {
    const name = sub.player?.user_full_name || sub.player?.user_email || 'Subscriber';
    const status = sub.effective_status || sub.status;
    const actions: any[] = [
      {
        text: 'View Details',
        onPress: () => {
          Alert.alert(
            `Subscriber: ${name}`,
            `Plan: ${sub.plan_name || 'Membership'}\nStatus: ${status.toUpperCase()}\nExpires: ${formatRenewalDate(sub.end_date)}\nAuto Renew: ${sub.auto_renew ? 'Yes' : 'No'}`
          );
        },
      },
    ];

    if (status === 'active') {
      actions.push({
        text: 'Cancel Subscription',
        style: 'destructive',
        onPress: () => handleCancelSub(sub),
      });
    }

    actions.push({ text: 'Close', style: 'cancel' });
    Alert.alert(name, `Plan: ${sub.plan_name || 'Membership'} (${status.toUpperCase()})`, actions);
  };



  if (!canManageMemberships) {
    return (
      <Screen style={styles.screenContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#F0F8F4" />
        <View style={styles.headerContainer}>
          <TouchableOpacity onPress={openDrawer} style={styles.hamburgerBtn} hitSlop={8}>
            <Menu size={26} color="#123D38" strokeWidth={2.2} />
          </TouchableOpacity>
          <View style={styles.headerTextCol}>
            <AppText style={styles.headerTitle}>Memberships</AppText>
            <AppText style={styles.headerSubtitle}>Plans, tiers, and subscriber management</AppText>
          </View>
        </View>
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

  // ─── Header Component (Hero, New Plan, Switcher, Search) ───────────────────

  const renderListHeader = () => (
    <View style={styles.headerSectionWrapper}>
      {/* 1. Header Bar: Hamburger Menu, Title & Subtitle */}
      <View style={styles.headerContainer}>
        <TouchableOpacity
          onPress={openDrawer}
          style={styles.hamburgerBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Open Navigation Drawer"
        >
          <Menu size={26} color="#123D38" strokeWidth={2.2} />
        </TouchableOpacity>
        <View style={styles.headerTextCol}>
          <AppText style={styles.headerTitle}>Memberships</AppText>
          <AppText style={styles.headerSubtitle}>Plans, tiers, and subscriber management</AppText>
        </View>
      </View>

      {/* 2. Promotional Hero Banner */}
      <View style={styles.heroBannerContainer}>
        <ImageBackground
          source={require('../../assets/memberships/hero_banner.jpg')}
          style={styles.heroBannerBackground}
          imageStyle={styles.heroBannerImage}
          resizeMode="cover"
        >
          {/* Subtle soft gradient wash on the left to guarantee optimal text contrast */}
          <View style={styles.heroWashOverlay} />

          <View style={styles.heroContentLeft}>
            <AppText style={styles.heroHeadline}>
              Flexible Plans.{'\n'}Stronger Community.
            </AppText>
            <AppText style={styles.heroSubtext}>
              Give players more ways to play,{'\n'}belong and grow.
            </AppText>
            <View style={styles.heroAccentBar} />
          </View>
        </ImageBackground>
      </View>

      {/* 2. Plans / Subscribers Switcher (Segmented Control) */}
      <View style={styles.segmentedContainer}>
        <TouchableOpacity
          style={[styles.segmentedTab, activeTab === 'plans' && styles.segmentedTabActive]}
          onPress={() => setActiveTab('plans')}
          activeOpacity={0.85}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'plans' }}
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
          activeOpacity={0.85}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'subscribers' }}
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

      {/* 3. Tab Context Actions:
             If Plans tab: "+ New Plan" action button.
             If Subscribers tab: Subscriber search row (full width). */}
      {activeTab === 'plans' ? (
        canManageMemberships && (
          <View style={styles.newPlanRow}>
            <TouchableOpacity
              style={styles.newPlanBtn}
              onPress={handleOpenCreatePlan}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Create New Plan"
            >
              <Plus size={15} color="#FFFFFF" strokeWidth={2.4} />
              <AppText style={styles.newPlanBtnText}>New Plan</AppText>
            </TouchableOpacity>
          </View>
        )
      ) : (
        <View style={styles.subscriberSearchRow}>
          <View style={styles.searchBox}>
            <Search size={18} color="#647570" strokeWidth={2} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search subscribers by name, email, plan..."
              placeholderTextColor="#8C9BA5"
              value={subscriberSearch}
              onChangeText={setSubscriberSearch}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            {subscriberSearch.length > 0 && (
              <TouchableOpacity
                onPress={() => setSubscriberSearch('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={16} color="#647570" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );

  // ─── Render Subscriber Card ────────────────────────────────────────────────

  const renderSubscriberCard = ({ item }: { item: MemberSubscription }) => {
    const playerName = item.player?.user_full_name || item.player?.user_email?.split('@')[0] || 'Subscriber';
    const playerEmail = item.player?.user_email || '—';
    const status = (item.effective_status || item.status || 'active').toLowerCase();

    // Map status colors
    const statusConfig = {
      cancelled: { bg: '#FDECEB', text: '#D32F2F', label: 'CANCELLED' },
      expired: { bg: '#FEF6E6', text: '#B7791F', label: 'EXPIRED' },
      active: { bg: '#E8F5E9', text: '#2E7D32', label: 'ACTIVE' },
      scheduled: { bg: '#E7F0FB', text: '#1E69D2', label: 'SCHEDULED' },
      pending: { bg: '#FFF8E1', text: '#E65100', label: 'PENDING' },
    }[status] || { bg: '#EAF0EC', text: '#5A6E67', label: status.toUpperCase() };

    const planName = item.plan_name || 'Basic Monthly';
    const renewalDate = formatRenewalDate(item.end_date);
    const rawDuration = item.plan_duration || 'monthly';
    const durationLabel = rawDuration.charAt(0).toUpperCase() + rawDuration.slice(1);
    const formattedPrice = formatCurrency(item.plan_price || '999.00', item.plan_currency || 'USD');

    // Retrieve avatar from subscriber response or player members mapping
    const avatarUrl =
      item.player?.profile_image_url ||
      (item.player_membership_id ? playerMembersMap.get(item.player_membership_id) : null) ||
      (item.player?.user_id ? playerMembersMap.get(item.player.user_id) : null);

    return (
      <View style={styles.subscriberCard}>
        {/* Top Information Area */}
        <View style={styles.subCardTopRow}>
          <SubscriberAvatar
            imageUrl={avatarUrl}
            name={playerName}
            size={64}
          />

          <View style={styles.subCardDetails}>
            {/* Row 1: Name and Status Badge */}
            <View style={styles.subNameAndBadgeRow}>
              <AppText style={styles.subPlayerName} numberOfLines={1}>
                {playerName}
              </AppText>
              <View style={[styles.subStatusBadge, { backgroundColor: statusConfig.bg }]}>
                <AppText style={[styles.subStatusBadgeText, { color: statusConfig.text }]}>
                  {statusConfig.label}
                </AppText>
              </View>
            </View>

            {/* Row 2: Email */}
            <AppText style={styles.subPlayerEmail} numberOfLines={1}>
              {playerEmail}
            </AppText>

            {/* Row 3: Plan Badge and Renewal Date */}
            <View style={styles.subPlanAndRenewalRow}>
              <View style={styles.subPlanBadge}>
                <AppText style={styles.subPlanBadgeText} numberOfLines={1}>
                  {planName}
                </AppText>
              </View>
              <View style={styles.subRenewalContainer}>
                <Calendar size={13} color="#647570" strokeWidth={1.8} />
                <AppText style={styles.subRenewalText}>
                  Renews {renewalDate}
                </AppText>
              </View>
            </View>
          </View>
        </View>

        {/* Thin Horizontal Divider */}
        <View style={styles.subCardDivider} />

        {/* Bottom Information Area */}
        <View style={styles.subCardBottomRow}>
          <View style={styles.subBillingContainer}>
            <CreditCard size={16} color="#647570" strokeWidth={1.8} />
            <AppText style={styles.subBillingText}>
              Billing: {durationLabel} · {formattedPrice}
            </AppText>
          </View>

          <TouchableOpacity
            onPress={() => handleSubMenu(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.threeDotBtn}
            accessibilityLabel="Subscription actions"
          >
            <MoreVertical size={18} color="#647570" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ─── Render Membership Plan Card ───────────────────────────────────────────

  const renderPlanCard = ({ item }: { item: MembershipPlan }) => {
    const isActive = item.status === 'active';
    const benefits = item.benefits && item.benefits.length > 0
      ? item.benefits
      : ['Court booking access', 'Member-only events'];

    const durationLabel = item.duration_label || (item.duration_unit === 'yearly' ? 'Yearly' : item.duration_unit === 'quarterly' ? 'Quarterly' : 'Monthly');
    const priceDisplay = formatCurrency(item.price, item.currency || 'USD');

    return (
      <View style={styles.planCard}>
        {/* Header Row: Title, Duration, Status Badge, Three dots */}
        <View style={styles.planHeaderRow}>
          <View style={styles.planTitleContainer}>
            <AppText style={styles.planName}>{item.name}</AppText>
            <AppText style={styles.planDurationSubtitle}>{durationLabel}</AppText>
          </View>

          <View style={styles.planStatusAndMenu}>
            <View style={[styles.planStatusBadge, isActive ? styles.planStatusActive : styles.planStatusInactive]}>
              <AppText style={[styles.planStatusBadgeText, isActive ? styles.planStatusActiveText : styles.planStatusInactiveText]}>
                {item.status.toUpperCase()}
              </AppText>
            </View>
            <TouchableOpacity
              onPress={() => handlePlanMenu(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.threeDotBtn}
              accessibilityLabel="Plan actions"
            >
              <MoreVertical size={18} color="#647570" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Price Row */}
        <View style={styles.planPriceContainer}>
          <AppText style={styles.planPriceText}>{priceDisplay}</AppText>
          <AppText style={styles.planPriceUnitText}> / {durationLabel.toLowerCase()}</AppText>
        </View>

        {/* Description */}
        {item.description ? (
          <AppText style={styles.planDescText}>{item.description}</AppText>
        ) : null}

        {/* Benefits Checklist */}
        <View style={styles.planBenefitsContainer}>
          {benefits.map((b, idx) => (
            <View key={idx} style={styles.planBenefitItem}>
              <View style={styles.checkIconWrapper}>
                <Check size={11} color="#176B57" strokeWidth={2.8} />
              </View>
              <AppText style={styles.planBenefitText}>{b}</AppText>
            </View>
          ))}
        </View>

        {/* Limits & Rules */}
        {(item.booking_limit != null || item.advance_booking_days != null) && (
          <View style={styles.planLimitsContainer}>
            {item.booking_limit != null && (
              <View style={styles.planLimitItem}>
                <Target size={13} color="#D97706" />
                <AppText style={styles.planLimitText}>{item.booking_limit} max active bookings</AppText>
              </View>
            )}
            {item.advance_booking_days != null && (
              <View style={styles.planLimitItem}>
                <Calendar size={13} color="#2563EB" />
                <AppText style={styles.planLimitText}>{item.advance_booking_days}-day advance window</AppText>
              </View>
            )}
          </View>
        )}

        {/* Actions Row */}
        <View style={styles.planCardActionsRow}>
          <TouchableOpacity
            style={styles.planEditBtn}
            onPress={() => handleOpenEditPlan(item)}
            activeOpacity={0.8}
          >
            <AppText style={styles.planEditBtnText}>Edit Plan</AppText>
          </TouchableOpacity>

          {isActive ? (
            <TouchableOpacity
              style={styles.planDeactivateBtn}
              onPress={() => handleDeactivatePlan(item)}
              activeOpacity={0.8}
            >
              <AppText style={styles.planDeactivateBtnText}>Deactivate</AppText>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.planReactivateBtn}
              onPress={() => handleReactivatePlan(item)}
              activeOpacity={0.8}
            >
              <AppText style={styles.planReactivateBtnText}>Reactivate</AppText>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <Screen style={styles.screenContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#F0F8F4" />

      {isLoading ? (
        <LoadingState message="Loading memberships..." />
      ) : activeTab === 'plans' ? (
        <FlatList
          data={plans}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderListHeader}
          contentContainerStyle={[
            styles.listContentContainer,
            { paddingBottom: insets.bottom + 115 },
          ]}
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
              tintColor="#176B57"
            />
          }
        />
      ) : (
        <FlatList
          data={filteredSubscriptions}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderListHeader}
          contentContainerStyle={[
            styles.listContentContainer,
            { paddingBottom: insets.bottom + 115 },
          ]}
          renderItem={renderSubscriberCard}
          ListEmptyComponent={
            <EmptyState
              title={subscriberSearch ? 'No Subscribers Found' : 'No Subscribers Yet'}
              description={
                subscriberSearch
                  ? `No subscriptions match "${subscriberSearch}". Try a different name, email, or plan.`
                  : 'No players currently hold subscriptions for this club. Subscribers appear here after players purchase a membership plan.'
              }
              actionLabel={subscriberSearch ? 'Clear Search' : undefined}
              onAction={subscriberSearch ? () => setSubscriberSearch('') : undefined}
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor="#176B57"
            />
          }
        />
      )}

      {/* ─── Create/Edit Plan Modal ─────────────────────────────────────────── */}
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
          <Pressable
            style={[styles.modalCard, { maxHeight: '90%' }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <AppText style={styles.modalTitle}>
                {editingPlan ? 'Edit Membership Plan' : 'Create Membership Plan'}
              </AppText>
              <TouchableOpacity
                onPress={() => setShowCreatePlan(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#123D38" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalBody}>
              {formError ? (
                <View style={styles.modalErrorBox}>
                  <AppText style={styles.modalErrorText}>{formError}</AppText>
                </View>
              ) : null}

              {/* Plan Name */}
              <AppText style={styles.inputLabel}>Plan Name *</AppText>
              <TextInput
                style={styles.inputField}
                placeholder="e.g. Basic Monthly, Annual Premium"
                placeholderTextColor="#8C9BA5"
                value={planName}
                onChangeText={setPlanName}
              />

              {/* Description */}
              <AppText style={styles.inputLabel}>Description</AppText>
              <TextInput
                style={[styles.inputField, { height: 70, textAlignVertical: 'top' }]}
                placeholder="Describe plan access, perks, and restrictions..."
                placeholderTextColor="#8C9BA5"
                value={planDesc}
                onChangeText={setPlanDesc}
                multiline
              />

              {/* Duration Unit */}
              <AppText style={styles.inputLabel}>Billing Cycle *</AppText>
              <View style={styles.durationRow}>
                {DURATION_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.durationBtn,
                      planDuration === opt.value && styles.durationBtnActive,
                    ]}
                    onPress={() => setPlanDuration(opt.value)}
                  >
                    <AppText
                      style={[
                        styles.durationBtnText,
                        planDuration === opt.value && styles.durationBtnTextActive,
                      ]}
                    >
                      {opt.label}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Price */}
              <AppText style={styles.inputLabel}>Price (USD) *</AppText>
              <TextInput
                style={styles.inputField}
                placeholder="999.00"
                placeholderTextColor="#8C9BA5"
                value={planPrice}
                onChangeText={setPlanPrice}
                keyboardType="decimal-pad"
              />

              {/* Limits */}
              <View style={styles.formRowTwoCol}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <AppText style={styles.inputLabel}>Max Active Bookings</AppText>
                  <TextInput
                    style={styles.inputField}
                    placeholder="e.g. 3"
                    placeholderTextColor="#8C9BA5"
                    value={planBookingLimit}
                    onChangeText={setPlanBookingLimit}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <AppText style={styles.inputLabel}>Advance Days</AppText>
                  <TextInput
                    style={styles.inputField}
                    placeholder="e.g. 14"
                    placeholderTextColor="#8C9BA5"
                    value={planAdvanceDays}
                    onChangeText={setPlanAdvanceDays}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              {/* Benefits Checklist */}
              <AppText style={styles.inputLabel}>Plan Benefits</AppText>
              {planBenefits.map((b, idx) => (
                <View key={idx} style={styles.benefitInputRow}>
                  <Check size={14} color="#176B57" style={{ marginRight: 8 }} />
                  <AppText style={styles.benefitInputText}>{b}</AppText>
                  <TouchableOpacity
                    onPress={() => handleRemoveBenefit(idx)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <X size={15} color="#D32F2F" />
                  </TouchableOpacity>
                </View>
              ))}

              <View style={styles.addBenefitRow}>
                <TextInput
                  style={[styles.inputField, { flex: 1, marginBottom: 0 }]}
                  placeholder="Add another benefit..."
                  placeholderTextColor="#8C9BA5"
                  value={newBenefitInput}
                  onChangeText={setNewBenefitInput}
                  onSubmitEditing={handleAddBenefit}
                />
                <TouchableOpacity
                  style={styles.addBenefitBtn}
                  onPress={handleAddBenefit}
                >
                  <AppText style={styles.addBenefitBtnText}>Add</AppText>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setShowCreatePlan(false)}
              >
                <AppText style={styles.cancelModalBtnText}>Cancel</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveModalBtn}
                onPress={handleSavePlan}
                disabled={savingPlan}
              >
                <AppText style={styles.saveModalBtnText}>
                  {savingPlan ? 'Saving...' : editingPlan ? 'Update Plan' : 'Save Plan'}
                </AppText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>


    </Screen>
  );
}

// ─── Stylesheet ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#F0F8F4',
  },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },

  // Header Bar
  headerSectionWrapper: {
    marginBottom: 0,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  hamburgerBtn: {
    padding: 6,
    marginRight: 12,
  },
  headerTextCol: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#123D38',
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#5A756C',
    marginTop: 2,
    fontWeight: '500',
  },

  // Hero Promotional Banner
  heroBannerContainer: {
    width: '100%',
    height: 170,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#DCE7E1',
    backgroundColor: '#D9ECE1',
    marginTop: 2,
    marginBottom: 12,
  },
  heroBannerBackground: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  heroBannerImage: {
    borderRadius: 16,
  },
  heroWashOverlay: {
    ...StyleSheet.absoluteFill,
    width: '70%',
    borderRadius: 16,
    backgroundColor: 'rgba(240, 248, 244, 0.70)',
    ...Platform.select({
      web: {
        backgroundImage: 'linear-gradient(90deg, rgba(240, 248, 244, 0.92) 0%, rgba(240, 248, 244, 0.75) 55%, rgba(240, 248, 244, 0) 100%)',
      } as any,
    }),
  },
  heroContentLeft: {
    maxWidth: '66%',
    justifyContent: 'center',
  },
  heroHeadline: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F2E28',
    lineHeight: 25,
    letterSpacing: -0.3,
  },
  heroSubtext: {
    fontSize: 12.5,
    color: '#1C493E',
    lineHeight: 17,
    marginTop: 8,
    fontWeight: '500',
  },
  heroAccentBar: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#176B57',
    marginTop: 12,
  },

  // New Plan Button
  newPlanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    marginBottom: 12,
  },
  newPlanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#176B57',
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    shadowColor: '#176B57',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  newPlanBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
    lineHeight: 18,
  },

  // Plans & Subscribers Switcher
  segmentedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E2ECE6',
    gap: 4,
    marginBottom: 12,
  },
  segmentedTab: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: 'transparent',
    paddingHorizontal: 8,
  },
  segmentedTabActive: {
    backgroundColor: '#176B57',
  },
  segmentedTabText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#123D38',
    textAlign: 'center',
    lineHeight: 18,
  },
  segmentedTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Subscriber Search & Enroll Row
  subscriberSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCE7E1',
    paddingHorizontal: 12,
    height: 46,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#123D38',
    height: '100%',
    paddingVertical: 0,
  },


  // Subscriber Cards
  subscriberCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E6ECE8',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  subCardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  subCardDetails: {
    flex: 1,
    marginLeft: 14,
  },
  subNameAndBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subPlayerName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#123D38',
    marginRight: 8,
  },
  subStatusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  subStatusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subPlayerEmail: {
    fontSize: 13.5,
    color: '#647570',
    marginTop: 2,
  },
  subPlanAndRenewalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    flexWrap: 'wrap',
    gap: 10,
  },
  subPlanBadge: {
    backgroundColor: '#E7F0FB',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  subPlanBadgeText: {
    color: '#1E69D2',
    fontSize: 12,
    fontWeight: '600',
  },
  subRenewalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subRenewalText: {
    fontSize: 12.5,
    color: '#647570',
    marginLeft: 4,
    fontWeight: '500',
  },
  subCardDivider: {
    height: 1,
    backgroundColor: '#F0F3F1',
    marginVertical: 12,
  },
  subCardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subBillingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subBillingText: {
    fontSize: 13.5,
    color: '#5A6E67',
    fontWeight: '500',
    marginLeft: 8,
  },
  threeDotBtn: {
    padding: 4,
  },

  // Avatar
  avatarWrapper: {
    overflow: 'hidden',
    backgroundColor: '#E8EFEA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    backgroundColor: '#E8EFEA',
  },
  avatarFallback: {
    backgroundColor: '#DEF2E6',
  },
  avatarInitials: {
    fontWeight: '700',
    color: '#176B57',
  },

  // Plans Tab Card
  planCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E6ECE8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  planHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  planTitleContainer: {
    flex: 1,
  },
  planName: {
    fontSize: 19,
    fontWeight: '700',
    color: '#123D38',
  },
  planDurationSubtitle: {
    fontSize: 13,
    color: '#647570',
    marginTop: 2,
  },
  planStatusAndMenu: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planStatusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 10,
  },
  planStatusActive: {
    backgroundColor: '#E8F5E9',
  },
  planStatusInactive: {
    backgroundColor: '#F3F4F6',
  },
  planStatusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  planStatusActiveText: {
    color: '#2E7D32',
  },
  planStatusInactiveText: {
    color: '#6B7280',
  },
  planPriceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 10,
    marginBottom: 6,
  },
  planPriceText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#123D38',
  },
  planPriceUnitText: {
    fontSize: 14,
    color: '#647570',
    fontWeight: '500',
  },
  planDescText: {
    fontSize: 13.5,
    color: '#5A6E67',
    lineHeight: 19,
    marginBottom: 12,
  },
  planBenefitsContainer: {
    marginTop: 4,
    marginBottom: 12,
  },
  planBenefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  checkIconWrapper: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#DEF2E6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  planBenefitText: {
    fontSize: 13.5,
    color: '#293D38',
  },
  planLimitsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F3F1',
    marginBottom: 14,
  },
  planLimitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  planLimitText: {
    fontSize: 12.5,
    color: '#647570',
    fontWeight: '500',
  },
  planCardActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  planEditBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#F0F4F2',
    alignItems: 'center',
  },
  planEditBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#123D38',
  },
  planDeactivateBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#FDECEB',
    alignItems: 'center',
  },
  planDeactivateBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#D32F2F',
  },
  planReactivateBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
  },
  planReactivateBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#2E7D32',
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F3F1',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#123D38',
  },
  modalBody: {
    marginBottom: 14,
  },
  modalErrorBox: {
    backgroundColor: '#FDECEB',
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  modalErrorText: {
    color: '#D32F2F',
    fontSize: 13,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 6,
  },
  inputField: {
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#DCE7E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#123D38',
    marginBottom: 14,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  durationBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#F0F4F2',
    borderWidth: 1,
    borderColor: '#DCE7E1',
  },
  durationBtnActive: {
    backgroundColor: '#176B57',
    borderColor: '#176B57',
  },
  durationBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#123D38',
  },
  durationBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  formRowTwoCol: {
    flexDirection: 'row',
  },
  benefitInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAF9',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E6ECE8',
  },
  benefitInputText: {
    flex: 1,
    fontSize: 13,
    color: '#293D38',
  },
  addBenefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 14,
    gap: 8,
  },
  addBenefitBtn: {
    backgroundColor: '#176B57',
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBenefitBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  pickerContainer: {
    backgroundColor: '#F8FAF9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCE7E1',
    maxHeight: 180,
    overflow: 'hidden',
  },
  pickerOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F0',
  },
  pickerOptionSelected: {
    backgroundColor: '#DEF2E6',
  },
  pickerOptionText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#123D38',
  },
  pickerOptionTextSelected: {
    fontWeight: '700',
    color: '#176B57',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 8,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#123D38',
  },
  switchSubtitle: {
    fontSize: 12,
    color: '#647570',
    marginTop: 2,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  cancelModalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#F0F4F2',
    alignItems: 'center',
  },
  cancelModalBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#647570',
  },
  saveModalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#176B57',
    alignItems: 'center',
  },
  saveModalBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
