/**
 * Aught2 Pickleball — Player Club Details Live Preview Component
 *
 * Faithfully reproduces the exact visual design, layout, section order, card dimensions,
 * typography, colors, badges, and responsive behavior of the actual Player Side Club Details page
 * (`mobile/app/(player)/club-details.tsx`):
 *   1. Compact Mock Player Header with circular back button and dynamic club name
 *   2. Inset photographic Hero Banner with dark-green gradient overlay, real club logo,
 *      club name, capsule "ACTIVE" badge, location with pin, and operating hours with clock
 *   3. Membership Status card (green circular checkmark, dynamic membership state,
 *      clear subtext, and deep green "Book Court" action)
 *   4. Club-Specific Promotional Ads Carousel (when configured)
 *   5. Courts & Facilities card with icon, dynamic courts count badge,
 *      one row per actual court with court photograph thumbnail, title, surface/environment,
 *      included/hourly rate tag, and "Book" button (or empty state)
 *   6. Side-by-side shortcut cards: "Upcoming Events" and "Lessons & Coaching"
 *   7. Membership Plans card with icon, plan count badge, cards for each published plan
 *      with rates, duration, benefits checklist, and "Select Plan" button (or empty state)
 *   8. "About This Club" card with icon, dynamic description, chevron, and an interactive
 *      full-details modal dialog (description, directions address, hours, email, phone, website)
 *
 * Contained in a realistic phone mockup frame with independent inner scrolling so the entire
 * Player Side Club Details page can be inspected at all viewport widths.
 */

import React, { useMemo, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Crown,
  Globe,
  Info,
  LayoutGrid,
  Mail,
  MapPin,
  Phone,
  UserCheck,
  X,
} from 'lucide-react-native';

import { AppText } from './AppText';
import { Card } from './Card';
import { PromotionalAdsCarousel } from './PromotionalAdsCarousel';
import { useClubCarouselSlides } from '@/hooks';
import { clubsApi, courtApi } from '@/services/api';
import { QUERY_KEYS } from '@/constants';
import { formatCurrency, resolveMediaUrl } from '@/utils';
import type { Club, MembershipPlan, PlayerCourt } from '@/types';

// ─── Operating Hours Helper ─────────────────────────────────────────────────

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

export interface PlayerClubDetailsPreviewProps {
  clubId?: string | null;
  club?: Club | null;
  name?: string;
  shortDescription?: string;
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  establishedYear?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  selectedDays?: string[];
  openingTime?: string;
  closingTime?: string;
  timezone?: string;
  facilitiesSummary?: string;
  logoUri?: string | null;
  coverUri?: string | null;
}

export function PlayerClubDetailsPreview({
  clubId,
  club,
  name,
  shortDescription,
  description,
  contactEmail,
  contactPhone,
  website,
  establishedYear,
  addressLine1,
  addressLine2,
  city,
  state,
  postalCode,
  selectedDays,
  openingTime,
  closingTime,
  facilitiesSummary,
  logoUri,
  coverUri,
}: PlayerClubDetailsPreviewProps) {
  const [logoError, setLogoError] = useState(false);
  const [bannerError, setBannerError] = useState(false);
  const [courtImageErrors, setCourtImageErrors] = useState<Record<string, boolean>>({});
  const [isAboutModalVisible, setIsAboutModalVisible] = useState(false);

  const effectiveClubId = clubId || club?.id;

  // 1. Fetch real active courts for this club (canonical PLAYER_COURTS query key)
  const { data: activeCourts = [] } = useQuery<PlayerCourt[], Error>({
    queryKey: effectiveClubId ? QUERY_KEYS.PLAYER_COURTS(effectiveClubId) : ['clubs', 'none', 'player-courts'],
    queryFn: () => courtApi.getPlayerCourts(effectiveClubId!),
    enabled: Boolean(effectiveClubId),
    staleTime: 60 * 1000,
  });

  // 2. Fetch real public membership plans for this club
  const { data: plans = [] } = useQuery<MembershipPlan[], Error>({
    queryKey: ['public-membership-plans', effectiveClubId],
    queryFn: () => clubsApi.getPublicMembershipPlans(effectiveClubId!),
    enabled: Boolean(effectiveClubId),
    staleTime: 60 * 1000,
  });

  // 3. Fetch club-specific promotional ads (only ads belonging strictly to this club)
  const { slides: promotionalSlides = [] } = useClubCarouselSlides(effectiveClubId, true);

  // Dynamic values with clean fallback priority
  const displayName = (name || club?.name || 'Pickleball Club').trim();
  const displayCity = city || club?.city || '';
  const displayState = state || club?.state || '';
  const locationText = [displayCity, displayState].filter(Boolean).join(', ') || 'Austin, TX';

  const effOpeningTime = openingTime || club?.opening_time || '06:00';
  const effClosingTime = closingTime || club?.closing_time || '22:00';
  const hoursText = formatOperatingHours(effOpeningTime, effClosingTime);

  const daysList = selectedDays && selectedDays.length > 0
    ? (selectedDays.length === 7 ? 'Mon - Sun' : selectedDays.join(', '))
    : (club?.operating_days || 'Mon - Sun');

  const effLogoUri = logoUri || club?.logo_url ? resolveMediaUrl(logoUri || club?.logo_url) : null;
  const effCoverUri = coverUri || club?.cover_image_url ? resolveMediaUrl(coverUri || club?.cover_image_url) : null;
  const bannerSource = effCoverUri && !bannerError ? { uri: effCoverUri } : null;

  const fullAddress = [
    addressLine1 || club?.address_line1,
    addressLine2 || club?.address_line2,
    displayCity,
    displayState,
    postalCode || club?.postal_code,
  ]
    .filter(Boolean)
    .join(', ');

  const effDescription = (description || club?.description || shortDescription || club?.short_description || '').trim();
  const effContactEmail = (contactEmail || club?.contact_email || '').trim();
  const effContactPhone = (contactPhone || club?.contact_phone || '').trim();
  const effWebsite = (website || club?.website || '').trim();

  const handleOpenDirections = () => {
    if (!fullAddress) return;
    const query = encodeURIComponent(`${displayName} ${fullAddress}`.trim());
    const url = Platform.select({
      ios: `maps:0,0?q=${query}`,
      android: `geo:0,0?q=${query}`,
      default: `https://www.google.com/maps/search/?api=1&query=${query}`,
    });
    if (url) Linking.openURL(url);
  };

  return (
    <View style={styles.phoneMockupFrame}>
      {/* Phone Notch / Speaker */}
      <View style={styles.phoneSpeaker} />

      {/* ─── A. Compact Header (Matches Player View Exactly) ───────────────── */}
      <View style={styles.headerContainer}>
        <View style={styles.backButton}>
          <ArrowLeft size={18} color="#102B2A" strokeWidth={2.4} />
        </View>
        <AppText style={styles.headerTitle} numberOfLines={1}>
          {displayName}
        </AppText>
      </View>

      {/* ─── Scrollable Player Content ────────────────────────────────────── */}
      <ScrollView
        style={styles.innerScroll}
        contentContainerStyle={styles.innerScrollContent}
        nestedScrollEnabled={true}
        showsVerticalScrollIndicator={true}
      >
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
              {/* Club Logo */}
              <View style={styles.logoContainer}>
                {effLogoUri && !logoError ? (
                  <Image
                    source={{ uri: effLogoUri }}
                    style={styles.logoImage}
                    resizeMode="contain"
                    onError={() => setLogoError(true)}
                    accessibilityLabel={`${displayName} logo`}
                  />
                ) : (
                  <View style={styles.logoFallbackWrapper}>
                    <Building2 size={32} color="#FFFFFF" strokeWidth={1.8} />
                  </View>
                )}
              </View>

              {/* Title, Badge, Location, and Hours */}
              <View style={styles.heroDetailsCol}>
                <View style={styles.nameRow}>
                  <AppText style={styles.clubNameText} numberOfLines={1}>
                    {displayName}
                  </AppText>
                  {club?.is_active !== false && (
                    <View style={styles.activeBadge}>
                      <AppText style={styles.activeBadgeText}>ACTIVE</AppText>
                    </View>
                  )}
                </View>

                <View style={styles.metaRow}>
                  <MapPin size={12} color="#D1FAE5" />
                  <AppText style={styles.metaText} numberOfLines={1}>
                    {locationText}
                  </AppText>
                </View>

                <View style={styles.metaRow}>
                  <Clock size={12} color="#D1FAE5" />
                  <AppText style={styles.metaText} numberOfLines={1}>
                    {daysList}  |  {hoursText}
                  </AppText>
                </View>
              </View>
            </View>
          </View>

          {/* ─── C. Membership Status Card ─────────────────────────────────── */}
          <View style={styles.card}>
            <View style={styles.membershipRow}>
              <View style={styles.membershipLeft}>
                <View style={styles.checkCircleGreen}>
                  <CheckCircle2 size={22} color="#18794E" strokeWidth={2.4} />
                </View>
                <View style={styles.membershipTextCol}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <AppText style={styles.membershipHeading}>
                      Club Membership
                    </AppText>
                    <View style={styles.freeBadge}>
                      <AppText style={styles.freeBadgeText}>FREE MEMBER</AppText>
                    </View>
                  </View>
                  <AppText style={styles.membershipSubtext}>
                    Joined for free. Eligible for pay-as-you-go court reservations and open club events.
                  </AppText>
                </View>
              </View>

              <View style={styles.bookCourtBtn}>
                <AppText style={styles.bookCourtBtnText}>Book Court</AppText>
              </View>
            </View>
          </View>

          {/* ─── Club-Specific Promotional Ads Carousel ───────────────────── */}
          {promotionalSlides.length > 0 && (
            <PromotionalAdsCarousel
              ads={promotionalSlides as any}
              title={`${displayName} Promotions`}
              subtitle="Special offers, clinics, and specials at this club"
              hideIfEmpty
            />
          )}

          {/* ─── D. Courts & Facilities ────────────────────────────────────── */}
          <View style={styles.card}>
            <View style={styles.sectionHeaderBetween}>
              <View style={styles.sectionHeaderLeft}>
                <LayoutGrid size={18} color="#18794E" strokeWidth={2.2} />
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
                        index === 0 && { borderTopWidth: 0, paddingTop: 4 },
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
                            <LayoutGrid size={18} color="#18794E" strokeWidth={1.8} />
                          </View>
                        )}
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
                        <View style={styles.quickBookPill}>
                          <AppText style={styles.quickBookPillText}>Book</AppText>
                        </View>
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
            <View style={styles.shortcutCard}>
              <View style={styles.shortcutIconCircle}>
                <Calendar size={16} color="#18794E" strokeWidth={2.2} />
              </View>
              <View style={styles.shortcutTextCol}>
                <AppText style={styles.shortcutHeading} numberOfLines={1}>
                  Upcoming Events
                </AppText>
                <AppText style={styles.shortcutSubtext} numberOfLines={1}>
                  View socials and tournaments
                </AppText>
              </View>
              <ChevronRight size={14} color="#6B7E76" />
            </View>

            {/* Lessons & Coaching */}
            <View style={styles.shortcutCard}>
              <View style={styles.shortcutIconCircle}>
                <UserCheck size={16} color="#18794E" strokeWidth={2.2} />
              </View>
              <View style={styles.shortcutTextCol}>
                <AppText style={styles.shortcutHeading} numberOfLines={1}>
                  Lessons & Coaching
                </AppText>
                <AppText style={styles.shortcutSubtext} numberOfLines={1}>
                  Book a session with our coaches
                </AppText>
              </View>
              <ChevronRight size={14} color="#6B7E76" />
            </View>
          </View>

          {/* ─── Membership Plans Section ─────────────────────────────────── */}
          <View style={styles.card}>
            <View style={styles.sectionHeaderBetween}>
              <View style={styles.sectionHeaderLeft}>
                <Crown size={18} color="#18794E" strokeWidth={2.2} />
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
                  No membership plans are currently published for this club. You can join this club for free!
                </AppText>
              </View>
            ) : (
              <View style={{ gap: 10, marginTop: 4 }}>
                {plans.map((plan) => (
                  <View key={plan.id} style={styles.planCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <AppText style={styles.planTitleText}>{plan.name}</AppText>
                        {plan.description ? (
                          <AppText style={styles.planDescText}>{plan.description}</AppText>
                        ) : null}
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
                            <CheckCircle2 size={11} color="#18794E" />
                            <AppText style={styles.benefitItemText} numberOfLines={1}>
                              {b}
                            </AppText>
                          </View>
                        ))}
                      </View>
                    )}

                    <View style={styles.selectPlanButton}>
                      <AppText style={styles.selectPlanButtonText}>Select Plan</AppText>
                    </View>
                  </View>
                ))}
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
                <Info size={17} color="#18794E" strokeWidth={2.2} />
              </View>
              <View style={styles.aboutTextCol}>
                <AppText style={styles.aboutHeading}>About This Club</AppText>
                <AppText style={styles.aboutDescription} numberOfLines={3}>
                  {effDescription ||
                    'A welcoming pickleball community for players of all levels. Join our socials, clinics and tournaments and be part of a growing community.'}
                </AppText>
              </View>
              <ChevronRight size={14} color="#6B7E76" style={styles.aboutChevron} />
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
                  {displayName}
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
                {effDescription ||
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
                    {daysList}: {hoursText}
                  </AppText>
                </View>
              </View>

              {facilitiesSummary ? (
                <View style={{ marginTop: 14 }}>
                  <AppText variant="label" color="primary" style={{ marginBottom: 4 }}>
                    Facilities & Amenities
                  </AppText>
                  <AppText variant="bodySmall" color="secondary">
                    {facilitiesSummary}
                  </AppText>
                </View>
              ) : null}

              {/* Contact information */}
              {(effContactEmail || effContactPhone || effWebsite) && (
                <View style={{ marginTop: 14, gap: 8 }}>
                  <AppText variant="label" color="primary">
                    Contact & Website
                  </AppText>
                  {effContactEmail ? (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`mailto:${effContactEmail}`)}
                      style={styles.contactRow}
                    >
                      <Mail size={14} color="#18794E" />
                      <AppText variant="bodySmall" style={{ color: '#18794E' }}>
                        {effContactEmail}
                      </AppText>
                    </TouchableOpacity>
                  ) : null}
                  {effContactPhone ? (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`tel:${effContactPhone}`)}
                      style={styles.contactRow}
                    >
                      <Phone size={14} color="#18794E" />
                      <AppText variant="bodySmall" style={{ color: '#18794E' }}>
                        {effContactPhone}
                      </AppText>
                    </TouchableOpacity>
                  ) : null}
                  {effWebsite ? (
                    <TouchableOpacity
                      onPress={() => {
                        const url = effWebsite.startsWith('http') ? effWebsite : `https://${effWebsite}`;
                        Linking.openURL(url);
                      }}
                      style={styles.contactRow}
                    >
                      <Globe size={14} color="#18794E" />
                      <AppText variant="bodySmall" style={{ color: '#18794E' }}>
                        {effWebsite}
                      </AppText>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}
            </ScrollView>
          </Card>
        </View>
      </Modal>

      {/* Phone Bottom Home Bar */}
      <View style={styles.phoneHomeBar} />
    </View>
  );
}

// ─── Styles matching (player)/club-details.tsx exactly ────────────────────────

const styles = StyleSheet.create({
  // Phone Bezel Frame
  phoneMockupFrame: {
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: '#F4F8F6',
    borderRadius: 28,
    borderWidth: 3,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
    height: 660,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  phoneSpeaker: {
    width: 60,
    height: 4,
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  phoneHomeBar: {
    width: 120,
    height: 4,
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 6,
    marginBottom: 8,
  },

  // A. Header
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 10,
    backgroundColor: '#F4F8F6',
    gap: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    fontSize: 18,
    fontWeight: '800',
    color: '#102B2A',
    flex: 1,
    letterSpacing: -0.3,
  },

  // Inner Scroll Container
  innerScroll: {
    flex: 1,
  },
  innerScrollContent: {
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 24,
  },
  contentContainer: {
    width: '100%',
    gap: 12,
  },

  // B. Hero Banner
  heroBanner: {
    width: '100%',
    height: 195,
    borderRadius: 18,
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
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoContainer: {
    width: 66,
    height: 66,
    borderRadius: 12,
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
    padding: 3,
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
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  clubNameText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    flexShrink: 1,
    letterSpacing: -0.2,
  },
  activeBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
  },
  activeBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#D1FAE5',
    flexShrink: 1,
  },

  // Shared Card Style
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: '#E8EFEA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },

  // C. Membership Status Card
  membershipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  membershipLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    flex: 1,
  },
  checkCircleGreen: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  membershipTextCol: {
    flex: 1,
    gap: 2,
  },
  membershipHeading: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#102B2A',
  },
  freeBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  freeBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#4B5563',
    letterSpacing: 0.4,
  },
  membershipSubtext: {
    fontSize: 11,
    color: '#667776',
    lineHeight: 15,
  },
  bookCourtBtn: {
    backgroundColor: '#18794E',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'center',
  },
  bookCourtBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Section Header Between
  sectionHeaderBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  sectionCardTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#102B2A',
    letterSpacing: -0.2,
  },
  courtsCountBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  courtsCountBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#18794E',
  },
  emptyCourtsBox: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyCourtsText: {
    fontSize: 11.5,
    color: '#71857E',
    textAlign: 'center',
    lineHeight: 16,
  },

  // D. Courts List
  courtsList: {
    width: '100%',
  },
  courtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2',
    gap: 9,
  },
  courtThumbWrapper: {
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#E0E7E4',
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
    gap: 1,
  },
  courtNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102B2A',
  },
  courtSurfaceText: {
    fontSize: 11,
    color: '#667776',
  },
  courtActionCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  includedTag: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  includedTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#166534',
  },
  quickBookPill: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  quickBookPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#18794E',
  },

  // E & F. Shortcut Cards Side by Side
  shortcutsRow: {
    flexDirection: 'row',
    gap: 9,
  },
  shortcutCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E8EFEA',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  shortcutIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutTextCol: {
    flex: 1,
    gap: 1,
  },
  shortcutHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: '#102B2A',
  },
  shortcutSubtext: {
    fontSize: 10,
    color: '#667776',
  },

  // Plans List
  planCard: {
    backgroundColor: '#F8FAF9',
    borderRadius: 11,
    padding: 11,
    borderWidth: 1,
    borderColor: '#E5EDE8',
    gap: 6,
  },
  planTitleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102B2A',
  },
  planDescText: {
    fontSize: 11,
    color: '#667776',
    marginTop: 1,
  },
  planPriceText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#102B2A',
  },
  planDurationText: {
    fontSize: 10,
    color: '#667776',
  },
  planBenefitsBox: {
    marginTop: 2,
    gap: 2,
  },
  benefitItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  benefitItemText: {
    fontSize: 10.5,
    color: '#4B5563',
    flex: 1,
  },
  selectPlanButton: {
    backgroundColor: '#18794E',
    borderRadius: 7,
    paddingVertical: 7,
    alignItems: 'center',
    marginTop: 2,
  },
  selectPlanButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // G. About This Club
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  aboutIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aboutTextCol: {
    flex: 1,
    gap: 2,
  },
  aboutHeading: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#102B2A',
  },
  aboutDescription: {
    fontSize: 11.5,
    color: '#667776',
    lineHeight: 16,
  },
  aboutChevron: {
    marginLeft: 4,
  },

  // Modal Dialog
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalDialog: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2EAE6',
    paddingBottom: 10,
  },
  addressLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});

