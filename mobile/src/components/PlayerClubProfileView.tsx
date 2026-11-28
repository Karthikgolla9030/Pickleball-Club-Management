/**
 * Aught2 Pickleball — Shared Player Club Profile View
 *
 * Canonical single source of truth for displaying a club's player-facing profile.
 * Used identically by:
 *   1. Player Side → View Club (`mobile/app/player/club-details.tsx`)
 *   2. Club Side → Club Details → Preview (`mobile/src/components/PlayerClubDetailsPreview.tsx`)
 *
 * Any updates here keep the real Player Side page and the Club Preview 100% synchronized.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Building2,
  Calendar,
  CalendarHeart,
  CheckCircle2,
  ChevronRight,
  Clock,
  Crown,
  ExternalLink,
  Globe,
  GraduationCap,
  Info,
  LayoutGrid,
  Mail,
  MapPin,
  Medal,
  Phone,
  Sparkles,
  Tag,
  Trophy,
  X,
} from 'lucide-react-native';

import { AppText } from './AppText';
import { Button } from './Button';
import { Card } from './Card';
import { PromotionalAdsCarousel } from './PromotionalAdsCarousel';
import { formatClubOperatingSchedule, formatCurrency, resolveMediaUrl } from '@/utils';
import type {
  Club,
  MembershipPlan,
  PlayerCourt,
  UpcomingActivityItem,
  UpcomingActivityType,
} from '@/types';

// ─── Activity Presentation Helpers ──────────────────────────────────────────

export function getClubActivityBadgeInfo(type: UpcomingActivityType) {
  switch (type) {
    case 'tournament':
      return {
        label: 'Tournament',
        icon: Trophy,
        bg: '#FEF3C7',
        color: '#B45309',
        border: '#FDE68A',
      };
    case 'league':
      return {
        label: 'League',
        icon: Medal,
        bg: '#E0E7FF',
        color: '#4338CA',
        border: '#C7D2FE',
      };
    case 'event':
      return {
        label: 'Event',
        icon: CalendarHeart,
        bg: '#DCFCE7',
        color: '#15803D',
        border: '#BBF7D0',
      };
    case 'lesson':
      return {
        label: 'Lesson',
        icon: GraduationCap,
        bg: '#F3E8FF',
        color: '#7E22CE',
        border: '#E9D5FF',
      };
    default:
      return {
        label: 'Activity',
        icon: Sparkles,
        bg: '#E2ECE6',
        color: '#176B57',
        border: '#CBD5E1',
      };
  }
}

export function formatClubActivityDateTime(startIso: string, endIso?: string | null): string {
  try {
    const s = new Date(startIso);
    if (isNaN(s.getTime())) return startIso;

    const dateStr = s.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const timeStr = s.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });

    if (endIso) {
      const e = new Date(endIso);
      if (!isNaN(e.getTime())) {
        const sameDay =
          s.getFullYear() === e.getFullYear() &&
          s.getMonth() === e.getMonth() &&
          s.getDate() === e.getDate();

        if (sameDay) {
          const endTimeStr = e.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          });
          return `${dateStr} • ${timeStr} – ${endTimeStr}`;
        }

        const endDateStr = e.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: s.getFullYear() === e.getFullYear() ? undefined : 'numeric',
        });
        return `${dateStr} – ${endDateStr}`;
      }
    }

    return `${dateStr} • ${timeStr}`;
  } catch {
    return startIso;
  }
}

export interface PlayerClubProfileViewProps {
  club: Club;
  activeCourts: PlayerCourt[];
  plans: MembershipPlan[];
  clubAds?: any[];
  isLoadingAds?: boolean;
  upcomingActivities: UpcomingActivityItem[];
  isLoadingActivities?: boolean;
  isEnrolled: boolean;
  hasActivePaidSubscription: boolean;
  playerPlanId?: string | null;
  playerPlanName?: string | null;
  isPending?: boolean;
  isWithdrawing?: boolean;
  isJoiningClub?: boolean;
  isPreview?: boolean;
  refreshSignal?: number;
  onBookCourt?: () => void;
  onGetMembership?: () => void;
  onWithdraw?: () => void;
  onJoinClub?: () => void;
  onBookSpecificCourt?: (court: PlayerCourt) => void;
  onPressActivity?: (activity: UpcomingActivityItem) => void;
  onSelectPlan?: (plan: MembershipPlan) => void;
}

export function PlayerClubProfileView({
  club,
  activeCourts,
  plans,
  clubAds = [],
  isLoadingAds = false,
  upcomingActivities,
  isLoadingActivities = false,
  isEnrolled,
  hasActivePaidSubscription,
  playerPlanId,
  playerPlanName,
  isPending = false,
  isWithdrawing = false,
  isJoiningClub = false,
  isPreview = false,
  refreshSignal = 0,
  onBookCourt,
  onGetMembership,
  onWithdraw,
  onJoinClub,
  onBookSpecificCourt,
  onPressActivity,
  onSelectPlan,
}: PlayerClubProfileViewProps) {
  const [logoError, setLogoError] = useState(false);
  const [bannerError, setBannerError] = useState(false);
  const [courtImageErrors, setCourtImageErrors] = useState<Record<string, boolean>>({});
  const [activityImageErrors, setActivityImageErrors] = useState<Record<string, boolean>>({});
  const [isAboutModalVisible, setIsAboutModalVisible] = useState(false);

  useEffect(() => {
    setLogoError(false);
  }, [club?.logo_url, refreshSignal]);

  useEffect(() => {
    setBannerError(false);
  }, [club?.cover_image_url, refreshSignal]);

  useEffect(() => {
    setCourtImageErrors({});
    setActivityImageErrors({});
  }, [club?.id, refreshSignal]);

  const clubUpcomingActivities = useMemo(() => {
    if (!club?.id) return [];
    return upcomingActivities.filter((item) => item.club_id === club.id);
  }, [upcomingActivities, club?.id]);

  const logoUri = club.logo_url ? resolveMediaUrl(club.logo_url) : null;
  const bannerUri = club.cover_image_url ? resolveMediaUrl(club.cover_image_url) : null;
  const bannerSource = bannerUri && !bannerError ? { uri: bannerUri } : null;

  const locationText = [club.city, club.state].filter(Boolean).join(', ') || 'Location not specified';
  const operatingScheduleLines = formatClubOperatingSchedule(club);

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

  const notifyPreviewAction = (description: string) => {
    Alert.alert('Preview Mode', description);
  };

  return (
    <>
      <View style={styles.contentContainer}>
        {/* ─── B. Club Hero Banner ───────────────────────────────────────── */}
        <View style={styles.heroBanner}>
          {bannerSource ? (
            <Image
              source={bannerSource}
              style={styles.heroBackgroundImage}
              resizeMode="cover"
              onError={() => setBannerError(true)}
            />
          ) : null}
          {/* Dark-Green Gradient Overlay */}
          <View style={styles.heroOverlay} />

          {/* Hero Information Row positioned at bottom */}
          <View style={styles.heroContentRow}>
            {/* Club Logo (transparent background preserving original proportions) */}
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
                  <Building2 size={32} color="#D1FAE5" strokeWidth={1.8} />
                </View>
              )}
            </View>

            {/* Title, Badge, Location, and Operating Schedule */}
            <View style={styles.heroDetailsCol}>
              <View style={styles.nameRow}>
                <AppText style={styles.clubNameText}>{club.name}</AppText>
                {club.is_active !== false && (
                  <View style={styles.activeBadge}>
                    <AppText style={styles.activeBadgeText}>ACTIVE</AppText>
                  </View>
                )}
              </View>

              <View style={styles.metaRow}>
                <MapPin size={13} color="#D1FAE5" style={styles.heroMetaIcon} />
                <AppText style={styles.metaText}>{locationText}</AppText>
              </View>

              <View style={styles.metaRow}>
                <Clock size={13} color="#D1FAE5" style={styles.heroMetaIcon} />
                <View style={styles.scheduleList}>
                  {operatingScheduleLines.map((line, idx) => (
                    <View key={`${line.daysLabel}-${idx}`} style={styles.scheduleItem}>
                      <AppText style={styles.scheduleDaysText}>{line.daysLabel}</AppText>
                      <AppText style={styles.scheduleHoursText}>{line.hoursLabel}</AppText>
                    </View>
                  ))}
                </View>
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
                        {hasActivePaidSubscription ? (playerPlanName || 'PAID') : 'FREE MEMBER'}
                      </AppText>
                    </View>
                  )}
                </View>
                <AppText style={styles.membershipSubtext}>
                  {isEnrolled
                    ? hasActivePaidSubscription
                      ? `Enrolled in ${playerPlanName}. Full membership privileges active.`
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
                  onPress={
                    onBookCourt ||
                    (isPreview
                      ? () => notifyPreviewAction('Players tap Book Court to reserve an available court at your club.')
                      : undefined)
                  }
                  activeOpacity={0.88}
                >
                  <AppText style={styles.bookCourtBtnText}>Book Court</AppText>
                </TouchableOpacity>
                {!hasActivePaidSubscription && (
                  <TouchableOpacity
                    style={styles.upgradePlanBtn}
                    onPress={
                      onGetMembership ||
                      (isPreview
                        ? () => notifyPreviewAction('Players tap Get Membership to explore and subscribe to your plans.')
                        : undefined)
                    }
                    activeOpacity={0.88}
                  >
                    <AppText style={styles.upgradePlanBtnText}>Get Membership</AppText>
                  </TouchableOpacity>
                )}
              </View>
            ) : isPending ? (
              <TouchableOpacity
                style={styles.withdrawBtn}
                onPress={onWithdraw}
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
                onPress={
                  onJoinClub ||
                  (isPreview
                    ? () => notifyPreviewAction('Players tap Join Club to become a member of your club.')
                    : undefined)
                }
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

        {/* ─── Club-Specific Promotional Ads Carousel ───────────────────── */}
        <PromotionalAdsCarousel
          ads={clubAds}
          title={`${club.name} Promotions`}
          subtitle="Special offers, clinics, and specials at this club"
          isLoading={isLoadingAds}
          hideIfEmpty
        />

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
                      {courtImageUri ? (
                        <Image
                          key={`${court.id}-${court.photo_url || 'custom'}`}
                          source={{ uri: courtImageUri }}
                          style={styles.courtThumbImage}
                          resizeMode="cover"
                          onError={() => {
                            if (court.id) {
                              setCourtImageErrors((prev) => ({ ...prev, [court.id]: true }));
                            }
                          }}
                        />
                      ) : (
                        <View style={styles.courtThumbFallback}>
                          <LayoutGrid size={22} color="#18794E" strokeWidth={1.8} />
                        </View>
                      )}
                    </View>

                    {/* Court Info */}
                    <View style={styles.courtInfoCol}>
                      <AppText style={styles.courtNameText}>
                        {court.display_name || court.name}
                      </AppText>
                      <AppText style={styles.courtSurfaceText}>
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
                        onPress={
                          onBookSpecificCourt
                            ? () => onBookSpecificCourt(court)
                            : isPreview
                              ? () => notifyPreviewAction(`Players tap Book to reserve ${court.display_name || court.name}.`)
                              : undefined
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

        {/* ─── E & F. Unified Club-Specific Upcoming Activities ───────────── */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderBetween}>
            <View style={styles.sectionHeaderLeft}>
              <Calendar size={19} color="#18794E" strokeWidth={2.2} />
              <AppText style={styles.sectionCardTitle}>Upcoming Activities</AppText>
            </View>
            <View style={styles.courtsCountBadge}>
              <AppText style={styles.courtsCountBadgeText}>
                {clubUpcomingActivities.length}{' '}
                {clubUpcomingActivities.length === 1 ? 'Activity' : 'Activities'}
              </AppText>
            </View>
          </View>

          {isLoadingActivities && clubUpcomingActivities.length === 0 ? (
            <View style={styles.upcomingLoadingBox}>
              <ActivityIndicator size="small" color="#18794E" />
              <AppText style={styles.upcomingLoadingText}>Loading activities...</AppText>
            </View>
          ) : clubUpcomingActivities.length === 0 ? (
            <View style={styles.upcomingEmptyBox}>
              <View style={styles.upcomingEmptyIconCircle}>
                <Calendar size={20} color="#18794E" strokeWidth={1.9} />
              </View>
              <AppText style={styles.upcomingEmptyTitle}>No upcoming activities</AppText>
              <AppText style={styles.upcomingEmptySubtext}>
                Check back soon for upcoming tournaments, leagues, events, or lessons at this club.
              </AppText>
            </View>
          ) : (
            <View style={styles.upcomingList}>
              {clubUpcomingActivities.map((item, index) => {
                const badgeInfo = getClubActivityBadgeInfo(item.activity_type);
                const BadgeIcon = badgeInfo.icon;
                const imgKey = `${item.activity_type}-${item.id}`;
                const thumbUri =
                  item.image_url && !activityImageErrors[imgKey]
                    ? resolveMediaUrl(item.image_url)
                    : null;
                const priceDisplay =
                  item.price != null
                    ? Number(item.price) === 0
                      ? 'Free'
                      : formatCurrency(item.price)
                    : null;
                const spotsText =
                  item.available_spots !== null && item.available_spots !== undefined
                    ? item.available_spots > 0
                      ? `${item.available_spots} spot${item.available_spots === 1 ? '' : 's'} left`
                      : 'Full / Waitlist'
                    : null;

                return (
                  <TouchableOpacity
                    key={imgKey}
                    style={[
                      styles.activityRow,
                      index === 0 && { borderTopWidth: 0, paddingTop: 6 },
                    ]}
                    onPress={
                      onPressActivity
                        ? () => onPressActivity(item)
                        : isPreview
                          ? () => notifyPreviewAction(`Players tap "${item.title}" to view details and register.`)
                          : undefined
                    }
                    activeOpacity={0.82}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.title}, ${badgeInfo.label}`}
                  >
                    {/* Thumbnail / Activity Icon */}
                    <View style={styles.activityThumbWrapper}>
                      {thumbUri ? (
                        <Image
                          source={{ uri: thumbUri }}
                          style={styles.activityThumbImage}
                          resizeMode="cover"
                          onError={() =>
                            setActivityImageErrors((prev) => ({ ...prev, [imgKey]: true }))
                          }
                        />
                      ) : (
                        <View
                          style={[
                            styles.activityThumbFallback,
                            { backgroundColor: badgeInfo.bg },
                          ]}
                        >
                          <BadgeIcon size={24} color={badgeInfo.color} strokeWidth={1.9} />
                        </View>
                      )}
                    </View>

                    {/* Activity Details */}
                    <View style={styles.activityContentCol}>
                      <View style={styles.activityBadgesRow}>
                        <View
                          style={[
                            styles.activityTypeBadge,
                            { backgroundColor: badgeInfo.bg, borderColor: badgeInfo.border },
                          ]}
                        >
                          <BadgeIcon
                            size={10.5}
                            color={badgeInfo.color}
                            strokeWidth={2.2}
                            style={{ marginRight: 3 }}
                          />
                          <AppText style={[styles.activityTypeBadgeText, { color: badgeInfo.color }]}>
                            {badgeInfo.label}
                          </AppText>
                        </View>

                        <View
                          style={[
                            styles.activityStatusBadge,
                            item.is_registered
                              ? styles.activityStatusRegistered
                              : styles.activityStatusOpen,
                          ]}
                        >
                          <AppText
                            style={[
                              styles.activityStatusBadgeText,
                              item.is_registered
                                ? styles.activityStatusTextRegistered
                                : styles.activityStatusTextOpen,
                            ]}
                          >
                            {item.is_registered ? 'Registered' : item.status_label}
                          </AppText>
                        </View>
                      </View>

                      <AppText style={styles.activityTitleText}>{item.title}</AppText>

                      <View style={styles.activityDateRow}>
                        <Calendar size={12.5} color="#527068" strokeWidth={2} />
                        <AppText style={styles.activityDateText}>
                          {formatClubActivityDateTime(item.start_date, item.end_date)}
                        </AppText>
                      </View>

                      {(priceDisplay || spotsText) && (
                        <View style={styles.activityMetaFooter}>
                          {priceDisplay ? (
                            <View style={styles.activityPricePill}>
                              <Tag size={10.5} color="#0E5E4C" strokeWidth={2.1} />
                              <AppText style={styles.activityPriceText}>{priceDisplay}</AppText>
                            </View>
                          ) : null}
                          {spotsText ? (
                            <AppText
                              style={[
                                styles.activitySpotsText,
                                item.available_spots === 0 && styles.activitySpotsFullText,
                              ]}
                            >
                              {spotsText}
                            </AppText>
                          ) : null}
                        </View>
                      )}
                    </View>

                    <ChevronRight size={17} color="#6B7E76" />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
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
                const isCurrentPlan = hasActivePaidSubscription && playerPlanId === plan.id;
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
                            <AppText style={styles.benefitItemText}>{b}</AppText>
                          </View>
                        ))}
                      </View>
                    )}

                    {!isCurrentPlan && (
                      <TouchableOpacity
                        style={styles.selectPlanButton}
                        onPress={
                          onSelectPlan
                            ? () => onSelectPlan(plan)
                            : isPreview
                              ? () => notifyPreviewAction(`Players tap here to subscribe to "${plan.name}".`)
                              : undefined
                        }
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
              <AppText style={styles.aboutDescription}>
                {club.description?.trim()
                  ? club.description.trim()
                  : 'View club address, operating hours, and contact information.'}
              </AppText>
            </View>
            <ChevronRight size={16} color="#6B7E76" style={styles.aboutChevron} />
          </View>
        </TouchableOpacity>
      </View>

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
              {club.description?.trim() ? (
                <AppText variant="bodySmall" color="primary" style={{ lineHeight: 22 }}>
                  {club.description.trim()}
                </AppText>
              ) : null}

              {fullAddress ? (
                <View style={{ marginTop: club.description?.trim() ? 14 : 0 }}>
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
                <AppText variant="label" color="primary" style={{ marginBottom: 6 }}>
                  Operating Hours
                </AppText>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                  <Clock size={14} color="#667776" style={{ marginTop: 2 }} />
                  <View style={{ flex: 1, gap: 4 }}>
                    {operatingScheduleLines.map((line, idx) => (
                      <View key={`modal-hours-${idx}`}>
                        <AppText variant="bodySmall" color="primary" style={{ fontWeight: '600' }}>
                          {line.daysLabel}
                        </AppText>
                        <AppText variant="bodySmall" color="secondary">
                          {line.hoursLabel}
                        </AppText>
                      </View>
                    ))}
                  </View>
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
                      onPress={() => {
                        const url = club.website!.startsWith('http')
                          ? club.website!
                          : `https://${club.website!}`;
                        Linking.openURL(url);
                      }}
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
    </>
  );
}

// ─── Canonical Stylesheet Matching Player View Club ───────────────────────────

const styles = StyleSheet.create({
  contentContainer: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    gap: 14,
  },

  // B. Hero Banner
  heroBanner: {
    width: '100%',
    minHeight: 196,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0E3628',
    justifyContent: 'flex-end',
    shadowColor: '#0A261D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  heroBackgroundImage: {
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
    ...(Platform.OS === 'web'
      ? ({
          backgroundImage:
            'linear-gradient(180deg, rgba(8, 28, 22, 0.14) 0%, rgba(8, 28, 22, 0.48) 42%, rgba(6, 22, 17, 0.94) 100%)',
        } as any)
      : {
          backgroundColor: 'rgba(7, 24, 18, 0.58)',
        }),
  },
  heroContentRow: {
    position: 'relative',
    zIndex: 1,
    paddingHorizontal: 14,
    paddingTop: 48,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  logoContainer: {
    width: 72,
    height: 72,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoFallbackWrapper: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDetailsCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 5,
  },
  nameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    alignItems: 'flex-start',
    gap: 6,
  },
  heroMetaIcon: {
    marginTop: 2.5,
    flexShrink: 0,
  },
  metaText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '500',
    color: '#E2E8F0',
    lineHeight: 17,
  },
  scheduleList: {
    flex: 1,
    gap: 4,
  },
  scheduleItem: {
    gap: 1,
  },
  scheduleDaysText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 17,
  },
  scheduleHoursText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#D1FAE5',
    lineHeight: 16.5,
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
  courtThumbFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E8F5EE',
    alignItems: 'center',
    justifyContent: 'center',
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

  // E & F. Unified Club-Specific Upcoming Activities
  upcomingLoadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  upcomingLoadingText: {
    fontSize: 13,
    color: '#667776',
    fontWeight: '500',
  },
  upcomingEmptyBox: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 10,
    gap: 6,
  },
  upcomingEmptyIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E4F4EC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  upcomingEmptyTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#102B2A',
  },
  upcomingEmptySubtext: {
    fontSize: 12.5,
    color: '#667776',
    textAlign: 'center',
    lineHeight: 18,
  },
  upcomingList: {
    gap: 0,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2',
    gap: 12,
  },
  activityThumbWrapper: {
    width: 58,
    height: 58,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E8EFEA',
    flexShrink: 0,
  },
  activityThumbImage: {
    width: '100%',
    height: '100%',
  },
  activityThumbFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityContentCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  activityBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  activityTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  activityTypeBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  activityStatusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  activityStatusOpen: {
    backgroundColor: '#E4F4EC',
  },
  activityStatusRegistered: {
    backgroundColor: '#DBEAFE',
  },
  activityStatusBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  activityStatusTextOpen: {
    color: '#18794E',
  },
  activityStatusTextRegistered: {
    color: '#1D4ED8',
  },
  activityTitleText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#102B2A',
    lineHeight: 19.5,
  },
  activityDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  activityDateText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#527068',
    lineHeight: 16.5,
  },
  activityMetaFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 1,
  },
  activityPricePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EBF5F0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activityPriceText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0E5E4C',
  },
  activitySpotsText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#527068',
  },
  activitySpotsFullText: {
    color: '#B45309',
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
});
