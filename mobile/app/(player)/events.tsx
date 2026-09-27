/**
 * Aught2 Pickleball — Player Events Screen
 *
 * Implements the exact Player Side "Events" UI matching the reference design:
 *   - Top header with hamburger menu button, "Events" title, and subtle horizontal divider
 *   - Hero Banner: Pale mint rounded container with "DISCOVER EVENTS", "Play Together, Get Better",
 *     supporting text, and pickleball paddle/ball court image
 *   - Segmented Control: "Discover Events" and "My Registrations"
 *   - Upcoming Events section with "View All >" header
 *   - Event Cards with left image, dynamic date badge overlay ("SEP / 27 / SAT"),
 *     title, calendar date, location pin, pastel category & access badges, registration status,
 *     entry fee / Free badge, and right chevron
 *   - Interactive ModalSheet for viewing full event details and registering / cancelling
 *   - "Host an Event?" card at the bottom
 *   - Preserves fixed bottom navigation bar and active Events tab
 *   - Real backend data integration with separate loading, error, and empty states
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import {
  Calendar,
  ChevronRight,
  Clock,
  MapPin,
  Menu,
  Users,
} from 'lucide-react-native';

import { AppText, ModalSheet } from '@/components';
import {
  useActiveClub,
  useCancelEventRegistration,
  useDiscoverClubEvents,
  useMyEvents,
  useRegisterForEvent,
} from '@/hooks';
import { useDrawerStore } from '@/navigation';
import { formatDateTime } from '@/utils';
import type { ClubEvent, EventRegistration } from '@/types';

type MainTab = 'discover' | 'my_registrations';

const COURT_IMAGES = [
  require('../../assets/courts/court_1.jpg'),
  require('../../assets/courts/court_3.jpg'),
  require('../../assets/courts/court_4.jpg'),
  require('../../assets/courts/court_2.jpg'),
  require('../../assets/courts/court_5.jpg'),
];

export default function PlayerEventsScreen() {
  const insets = useSafeAreaInsets();
  const openDrawer = useDrawerStore((s) => s.openDrawer);
  const { clubId } = useActiveClub();

  const [activeTab, setActiveTab] = useState<MainTab>('discover');
  const [selectedDetailEvent, setSelectedDetailEvent] = useState<ClubEvent | null>(null);

  // Discover Events query
  const {
    data: discoverEvents = [],
    isLoading: isDiscoverLoading,
    isRefetching: isDiscoverRefetching,
    isError: isDiscoverError,
    error: discoverError,
    refetch: refetchDiscover,
  } = useDiscoverClubEvents(clubId || '');

  // My Events query
  const {
    data: myRegistrations = [],
    isLoading: isMyEventsLoading,
    isRefetching: isMyEventsRefetching,
    isError: isMyEventsError,
    error: myEventsError,
    refetch: refetchMyEvents,
  } = useMyEvents();

  // Mutations
  const registerMutation = useRegisterForEvent(
    selectedDetailEvent?.id || '',
    clubId || undefined
  );
  const cancelMutation = useCancelEventRegistration(
    selectedDetailEvent?.id || '',
    clubId || undefined
  );

  // Auto-refresh when screen gains focus
  useFocusEffect(
    useCallback(() => {
      refetchDiscover();
      refetchMyEvents();
    }, [refetchDiscover, refetchMyEvents])
  );

  // Quick lookup to check if current player is registered for an event
  const getActiveRegistration = useCallback(
    (eventId: string): EventRegistration | undefined => {
      return myRegistrations.find(
        (r) => r.event_id === eventId && r.status !== 'cancelled'
      );
    },
    [myRegistrations]
  );

  // Sort upcoming events chronologically
  const sortedUpcomingEvents = useMemo(() => {
    return [...discoverEvents].sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );
  }, [discoverEvents]);

  // ─── Date Parsing Helpers ──────────────────────────────────────────────────
  const parseEventDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      const day = d.getDate().toString();
      const weekday = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
      const formattedDate = d.toLocaleDateString('en-US', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      return { month, day, weekday, formattedDate };
    } catch {
      return { month: 'SEP', day: '00', weekday: 'DAY', formattedDate: isoString };
    }
  };

  const getEventImage = (event: ClubEvent, index: number) => {
    const t = event.title?.toLowerCase() || '';
    if (t.includes('social')) return COURT_IMAGES[0];
    if (t.includes('clinic')) return COURT_IMAGES[1];
    if (t.includes('tournament')) return COURT_IMAGES[2];
    if (t.includes('open play')) return COURT_IMAGES[0];
    return COURT_IMAGES[index % COURT_IMAGES.length];
  };

  // ─── Registration Handlers ─────────────────────────────────────────────────
  const handleRegister = (event: ClubEvent) => {
    const isFull = event.capacity !== null && event.registered_count >= event.capacity;
    const actionLabel = isFull ? 'Join Waitlist' : 'Register';
    const message = isFull
      ? `This event is currently full (${event.registered_count}/${event.capacity}). You will be placed on the waitlist and automatically promoted if a spot opens up.`
      : `Confirm registration for "${event.title}"?`;

    Alert.alert(actionLabel, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: actionLabel,
        onPress: async () => {
          try {
            await registerMutation.mutateAsync({});
            refetchDiscover();
            refetchMyEvents();
            setSelectedDetailEvent(null);
            Alert.alert(
              'Success',
              isFull
                ? 'You are on the waitlist!'
                : 'You are registered for this event!'
            );
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Registration failed';
            Alert.alert('Error', msg);
          }
        },
      },
    ]);
  };

  const handleCancelRegistration = (eventId: string, title: string) => {
    Alert.alert(
      'Cancel Registration',
      `Are you sure you want to cancel your registration for "${title}"? If you cancel a confirmed spot, it will be offered to the waitlist.`,
      [
        { text: 'Keep Spot', style: 'cancel' },
        {
          text: 'Cancel Registration',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelMutation.mutateAsync();
              refetchDiscover();
              refetchMyEvents();
              setSelectedDetailEvent(null);
              Alert.alert('Registration Cancelled', 'Your registration has been cancelled.');
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Cancellation failed';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
  };

  // ─── Render Badges ─────────────────────────────────────────────────────────
  const renderBadges = (event: ClubEvent) => {
    const titleLower = event.title?.toLowerCase() || '';
    const typeLower = event.event_type?.toLowerCase() || '';

    // Category Badge
    let catBg = '#FEF3C7';
    let catText = '#92400E';
    let catLabel = 'Social';

    if (titleLower.includes('open play')) {
      catBg = '#DCFCE7';
      catText = '#15803D';
      catLabel = 'Open Play';
    } else if (typeLower === 'clinic' || titleLower.includes('clinic')) {
      catBg = '#E0F2FE';
      catText = '#0369A1';
      catLabel = 'Clinic / Coaching';
    } else if (typeLower === 'special' || typeLower === 'tournament' || titleLower.includes('tournament')) {
      catBg = '#F3E8FF';
      catText = '#7E22CE';
      catLabel = 'Tournament';
    } else if (typeLower === 'social' || titleLower.includes('social')) {
      catBg = '#FEF3C7';
      catText = '#92400E';
      catLabel = 'Social';
    }

    // Access Badge
    const isMembersOnly = event.visibility === 'members_only';
    const isPublic = event.visibility === 'public';
    const isTournament = catLabel === 'Tournament';

    // Pricing
    const feeNum = Number(event.registration_fee);
    const isFree = isNaN(feeNum) || feeNum <= 0;

    return (
      <View style={styles.badgesRow}>
        <View style={styles.badgeLeftGroup}>
          {/* Category */}
          <View style={[styles.pillBadge, { backgroundColor: catBg }]}>
            <AppText style={[styles.pillBadgeText, { color: catText }]}>{catLabel}</AppText>
          </View>

          {/* Access / All Levels */}
          {isTournament ? (
            <View style={[styles.pillBadge, { backgroundColor: '#F3E8FF' }]}>
              <AppText style={[styles.pillBadgeText, { color: '#7E22CE' }]}>All Levels</AppText>
            </View>
          ) : isMembersOnly ? (
            <View style={[styles.pillBadge, { backgroundColor: '#FEF3C7' }]}>
              <AppText style={[styles.pillBadgeText, { color: '#92400E' }]}>Members Only</AppText>
            </View>
          ) : isPublic ? (
            <View style={[styles.pillBadge, { backgroundColor: '#E0F2FE' }]}>
              <AppText style={[styles.pillBadgeText, { color: '#0369A1' }]}>Public</AppText>
            </View>
          ) : null}

          {/* Free Badge if applicable */}
          {isFree && (
            <View style={[styles.pillBadge, { backgroundColor: '#DCFCE7' }]}>
              <AppText style={[styles.pillBadgeText, { color: '#15803D' }]}>Free</AppText>
            </View>
          )}
        </View>

        {/* Paid Fee if applicable */}
        {!isFree && (
          <AppText style={styles.priceText}>
            {event.currency === 'USD' ? '$' : '₹'}
            {feeNum.toFixed(2)}
          </AppText>
        )}
      </View>
    );
  };

  // ─── Render Discover Event Card ────────────────────────────────────────────
  const renderDiscoverCard = (item: ClubEvent, index: number) => {
    const { month, day, weekday, formattedDate } = parseEventDate(item.start_at);
    const reg = getActiveRegistration(item.id);
    const imageSource = getEventImage(item, index);

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.eventCard}
        onPress={() => setSelectedDetailEvent(item)}
        activeOpacity={0.88}
      >
        {/* Left Image with Date Badge Overlay */}
        <View style={styles.cardImageWrapper}>
          <Image source={imageSource} style={styles.cardImage} resizeMode="cover" />
          <View style={styles.dateBadgeOverlay}>
            <AppText style={styles.dateBadgeMonth}>{month}</AppText>
            <AppText style={styles.dateBadgeDay}>{day}</AppText>
            <AppText style={styles.dateBadgeWeekday}>{weekday}</AppText>
          </View>
        </View>

        {/* Middle/Right Details */}
        <View style={styles.cardDetails}>
          <View style={styles.cardHeaderRow}>
            <AppText style={styles.cardTitle} numberOfLines={1}>
              {item.title}
            </AppText>
            {reg && (
              <View style={styles.registeredBadge}>
                <AppText style={styles.registeredBadgeText}>
                  {reg.status === 'waitlisted' ? 'Waitlisted' : 'Registered'}
                </AppText>
              </View>
            )}
          </View>

          {/* Date Row */}
          <View style={styles.cardMetaRow}>
            <Calendar size={13} color="#718279" strokeWidth={2} />
            <AppText style={styles.cardMetaText}>{formattedDate}</AppText>
          </View>

          {/* Location Row */}
          {item.location ? (
            <View style={styles.cardMetaRow}>
              <MapPin size={13} color="#718279" strokeWidth={2} />
              <AppText style={styles.cardMetaText} numberOfLines={1}>
                {item.location}
              </AppText>
            </View>
          ) : null}

          {/* Badges Row */}
          {renderBadges(item)}
        </View>

        {/* Right Chevron */}
        <View style={styles.chevronWrapper}>
          <ChevronRight size={18} color="#94A3B8" strokeWidth={2} />
        </View>
      </TouchableOpacity>
    );
  };

  // ─── Render My Registration Card ───────────────────────────────────────────
  const renderRegistrationCard = (reg: EventRegistration, index: number) => {
    const eventDateStr = reg.event_start_at || reg.registered_at;
    const { month, day, weekday, formattedDate } = parseEventDate(eventDateStr);
    const imageSource = COURT_IMAGES[index % COURT_IMAGES.length];
    const isCancelled = reg.status === 'cancelled';
    const isWaitlisted = reg.status === 'waitlisted';

    return (
      <TouchableOpacity
        key={reg.id}
        style={styles.eventCard}
        onPress={() => {
          // Find matching event from discover list if available
          const matchingEvent = discoverEvents.find((e) => e.id === reg.event_id);
          if (matchingEvent) {
            setSelectedDetailEvent(matchingEvent);
          } else {
            Alert.alert(
              reg.event_title || 'Club Event',
              `Registration Status: ${reg.status.toUpperCase()}\nRegistered on: ${formattedDate}`
            );
          }
        }}
        activeOpacity={0.88}
      >
        <View style={styles.cardImageWrapper}>
          <Image source={imageSource} style={styles.cardImage} resizeMode="cover" />
          <View style={styles.dateBadgeOverlay}>
            <AppText style={styles.dateBadgeMonth}>{month}</AppText>
            <AppText style={styles.dateBadgeDay}>{day}</AppText>
            <AppText style={styles.dateBadgeWeekday}>{weekday}</AppText>
          </View>
        </View>

        <View style={styles.cardDetails}>
          <View style={styles.cardHeaderRow}>
            <AppText style={styles.cardTitle} numberOfLines={1}>
              {reg.event_title || 'Club Event'}
            </AppText>
            <View
              style={[
                styles.registeredBadge,
                isCancelled && { backgroundColor: '#FEE2E2' },
                isWaitlisted && { backgroundColor: '#FEF3C7' },
              ]}
            >
              <AppText
                style={[
                  styles.registeredBadgeText,
                  isCancelled && { color: '#DC2626' },
                  isWaitlisted && { color: '#B45309' },
                ]}
              >
                {reg.status === 'waitlisted'
                  ? 'Waitlisted'
                  : reg.status === 'cancelled'
                  ? 'Cancelled'
                  : 'Registered'}
              </AppText>
            </View>
          </View>

          <View style={styles.cardMetaRow}>
            <Calendar size={13} color="#718279" strokeWidth={2} />
            <AppText style={styles.cardMetaText}>{formattedDate}</AppText>
          </View>

          <View style={styles.cardMetaRow}>
            <Clock size={13} color="#718279" strokeWidth={2} />
            <AppText style={styles.cardMetaText}>
              Registered on {new Date(reg.registered_at).toLocaleDateString()}
            </AppText>
          </View>
        </View>

        <View style={styles.chevronWrapper}>
          <ChevronRight size={18} color="#94A3B8" strokeWidth={2} />
        </View>
      </TouchableOpacity>
    );
  };

  const currentRegistration = selectedDetailEvent
    ? getActiveRegistration(selectedDetailEvent.id)
    : undefined;

  return (
    <View style={styles.container}>
      {/* ─── Top Header ─── */}
      <View
        style={[
          styles.headerRow,
          { paddingTop: Math.max(insets.top, 12) + 8 },
        ]}
      >
        <Pressable
          onPress={openDrawer}
          style={styles.menuButton}
          hitSlop={8}
          accessibilityLabel="Open menu"
          accessibilityRole="button"
        >
          <Menu size={24} color="#0F2922" strokeWidth={2.2} />
        </Pressable>
        <AppText style={styles.headerTitle}>Events</AppText>
      </View>
      <View style={styles.headerDivider} />

      {/* ─── Content ScrollView ─── */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isDiscoverRefetching || isMyEventsRefetching}
            onRefresh={() => {
              refetchDiscover();
              refetchMyEvents();
            }}
            colors={['#114D3F']}
            tintColor="#114D3F"
          />
        }
      >
        {/* ─── Hero Banner ─── */}
        <View style={styles.heroBannerContainer}>
          <Image
            source={require('../../assets/events/hero_events_banner.png')}
            style={styles.heroBannerImage}
            resizeMode="cover"
          />
        </View>

        {/* ─── Segmented Control (Tabs) ─── */}
        <View style={styles.segmentedContainer}>
          <TouchableOpacity
            style={[
              styles.segmentButton,
              activeTab === 'discover' && styles.segmentButtonActive,
            ]}
            onPress={() => setActiveTab('discover')}
            activeOpacity={0.85}
          >
            <AppText
              style={[
                styles.segmentText,
                activeTab === 'discover' && styles.segmentTextActive,
              ]}
            >
              Discover Events
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentButton,
              activeTab === 'my_registrations' && styles.segmentButtonActive,
            ]}
            onPress={() => setActiveTab('my_registrations')}
            activeOpacity={0.85}
          >
            <AppText
              style={[
                styles.segmentText,
                activeTab === 'my_registrations' && styles.segmentTextActive,
              ]}
            >
              My Registrations
            </AppText>
          </TouchableOpacity>
        </View>

        {/* ─── TAB 1: DISCOVER EVENTS ─── */}
        {activeTab === 'discover' && (
          <>
            {/* Section Header */}
            <View style={styles.sectionHeaderRow}>
              <AppText style={styles.sectionTitle}>Upcoming Events</AppText>
              <TouchableOpacity
                style={styles.viewAllRow}
                onPress={() => {
                  refetchDiscover();
                }}
                activeOpacity={0.7}
              >
                <AppText style={styles.viewAllText}>View All</AppText>
                <ChevronRight
                  size={15}
                  color="#135C48"
                  strokeWidth={2.4}
                  style={{ marginLeft: 2 }}
                />
              </TouchableOpacity>
            </View>

            {/* List Content */}
            {isDiscoverLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#114D3F" />
                <AppText style={styles.loadingText}>Discovering club events...</AppText>
              </View>
            ) : isDiscoverError ? (
              <View style={styles.errorContainer}>
                <AppText style={styles.errorText}>
                  {discoverError?.message || 'Unable to load events. Please try again.'}
                </AppText>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => refetchDiscover()}
                >
                  <AppText style={styles.retryButtonText}>Retry</AppText>
                </TouchableOpacity>
              </View>
            ) : sortedUpcomingEvents.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconContainer}>
                  <Calendar size={22} color="#176B57" strokeWidth={2.2} />
                </View>
                <View style={styles.emptyTextContainer}>
                  <AppText style={styles.emptyTitle}>No upcoming events</AppText>
                  <AppText style={styles.emptySubtitle}>
                    There are currently no upcoming events scheduled at your club.
                  </AppText>
                </View>
              </View>
            ) : (
              sortedUpcomingEvents.map((item, index) => renderDiscoverCard(item, index))
            )}
          </>
        )}

        {/* ─── TAB 2: MY REGISTRATIONS ─── */}
        {activeTab === 'my_registrations' && (
          <>
            {/* Section Header */}
            <View style={styles.sectionHeaderRow}>
              <AppText style={styles.sectionTitle}>My Registrations</AppText>
              {myRegistrations.length > 0 && (
                <AppText style={styles.sectionCount}>
                  {myRegistrations.length}{' '}
                  {myRegistrations.length === 1 ? 'Event' : 'Events'}
                </AppText>
              )}
            </View>

            {/* List Content */}
            {isMyEventsLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#114D3F" />
                <AppText style={styles.loadingText}>Loading your registrations...</AppText>
              </View>
            ) : isMyEventsError ? (
              <View style={styles.errorContainer}>
                <AppText style={styles.errorText}>
                  {myEventsError?.message ||
                    'Unable to load your registrations. Please try again.'}
                </AppText>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => refetchMyEvents()}
                >
                  <AppText style={styles.retryButtonText}>Retry</AppText>
                </TouchableOpacity>
              </View>
            ) : myRegistrations.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconContainer}>
                  <Calendar size={22} color="#176B57" strokeWidth={2.2} />
                </View>
                <View style={styles.emptyTextContainer}>
                  <AppText style={styles.emptyTitle}>
                    You haven't registered for any events yet
                  </AppText>
                  <AppText style={styles.emptySubtitle}>
                    Explore the Discover Events tab to join clinics, socials, and tournaments.
                  </AppText>
                </View>
              </View>
            ) : (
              myRegistrations.map((reg, index) => renderRegistrationCard(reg, index))
            )}
          </>
        )}

        {/* ─── Host an Event? Card ─── */}
        <TouchableOpacity
          style={styles.hostCard}
          onPress={() => {
            Alert.alert(
              'Host an Event',
              'Interested in organizing a tournament, clinic, or social gathering at Aught2 Pickleball? Reach out to club staff or management to propose your event!',
              [{ text: 'Got it', style: 'default' }]
            );
          }}
          activeOpacity={0.88}
        >
          <View style={styles.hostIconContainer}>
            <Calendar size={22} color="#176B57" strokeWidth={2.2} />
          </View>
          <View style={styles.hostTextContainer}>
            <AppText style={styles.hostTitle}>Host an Event?</AppText>
            <AppText style={styles.hostSubtitle}>
              Clinics, socials and tournaments bring our community together.
            </AppText>
          </View>
          <ChevronRight size={18} color="#94A3B8" strokeWidth={2} />
        </TouchableOpacity>
      </ScrollView>

      {/* ─── Event Details & Registration ModalSheet ─── */}
      <ModalSheet
        visible={!!selectedDetailEvent}
        onClose={() => setSelectedDetailEvent(null)}
        title={selectedDetailEvent?.title || 'Event Details'}
        subtitle={
          selectedDetailEvent?.location
            ? `${selectedDetailEvent.location} • Aught2 Pickleball`
            : 'Aught2 Pickleball Event'
        }
        actions={
          selectedDetailEvent
            ? [
                {
                  label: 'Close',
                  variant: 'secondary',
                  onPress: () => setSelectedDetailEvent(null),
                },
                currentRegistration
                  ? {
                      label: 'Cancel Registration',
                      variant: 'danger',
                      loading: cancelMutation.isPending,
                      onPress: () =>
                        handleCancelRegistration(
                          selectedDetailEvent.id,
                          selectedDetailEvent.title
                        ),
                    }
                  : {
                      label:
                        selectedDetailEvent.capacity !== null &&
                        selectedDetailEvent.registered_count >=
                          selectedDetailEvent.capacity
                          ? 'Join Waitlist'
                          : 'Register Now',
                      variant: 'primary',
                      loading: registerMutation.isPending,
                      onPress: () => handleRegister(selectedDetailEvent),
                    },
              ]
            : undefined
        }
      >
        {selectedDetailEvent && (
          <View style={styles.modalContent}>
            {/* Description */}
            {selectedDetailEvent.description ? (
              <AppText style={styles.modalDescription}>
                {selectedDetailEvent.description}
              </AppText>
            ) : null}

            {/* Event Info Table */}
            <View style={styles.modalInfoBox}>
              <View style={styles.modalInfoRow}>
                <AppText style={styles.modalLabel}>Date & Time:</AppText>
                <AppText style={styles.modalValue}>
                  {formatDateTime(selectedDetailEvent.start_at)}
                </AppText>
              </View>

              {selectedDetailEvent.location ? (
                <View style={styles.modalInfoRow}>
                  <AppText style={styles.modalLabel}>Location:</AppText>
                  <AppText style={styles.modalValue}>
                    {selectedDetailEvent.location}
                  </AppText>
                </View>
              ) : null}

              <View style={styles.modalInfoRow}>
                <AppText style={styles.modalLabel}>Capacity:</AppText>
                <AppText style={styles.modalValue}>
                  {selectedDetailEvent.capacity !== null
                    ? `${selectedDetailEvent.registered_count} / ${selectedDetailEvent.capacity} spots`
                    : 'Unlimited'}
                </AppText>
              </View>

              <View style={styles.modalInfoRow}>
                <AppText style={styles.modalLabel}>Entry Fee:</AppText>
                <AppText style={styles.modalFeeValue}>
                  {Number(selectedDetailEvent.registration_fee) > 0
                    ? `${selectedDetailEvent.currency === 'USD' ? '$' : '₹'}${Number(
                        selectedDetailEvent.registration_fee
                      ).toFixed(2)}`
                    : 'Free'}
                </AppText>
              </View>

              {currentRegistration && (
                <View style={styles.modalInfoRow}>
                  <AppText style={styles.modalLabel}>Your Status:</AppText>
                  <View style={styles.registeredBadge}>
                    <AppText style={styles.registeredBadgeText}>
                      {currentRegistration.status === 'waitlisted'
                        ? 'Waitlisted'
                        : 'Registered'}
                    </AppText>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: '#F8FAF9',
  },
  menuButton: {
    padding: 4,
    marginRight: 14,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F2922',
    letterSpacing: -0.3,
  },
  headerDivider: {
    height: 1,
    backgroundColor: '#E8EDEA',
    marginHorizontal: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  // ─── Hero Banner ───
  heroBannerContainer: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  heroBannerImage: {
    width: '100%',
    aspectRatio: 440 / 220,
  },
  // ─── Segmented Control ───
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E8EDEA',
    padding: 4,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentButton: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: '#114D3F',
    shadowColor: '#114D3F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: '#5E6E66',
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  // ─── Section Header ───
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F2922',
    letterSpacing: -0.2,
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#135C48',
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  viewAllText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#135C48',
  },
  // ─── Event Card ───
  eventCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EEF3F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardImageWrapper: {
    width: 92,
    height: 84,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#E2E8F0',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  dateBadgeOverlay: {
    position: 'absolute',
    top: 5,
    left: 5,
    backgroundColor: 'rgba(15, 41, 34, 0.78)',
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignItems: 'center',
    minWidth: 38,
  },
  dateBadgeMonth: {
    fontSize: 9,
    fontWeight: '700',
    color: '#E2E8F0',
    letterSpacing: 0.5,
  },
  dateBadgeDay: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 18,
  },
  dateBadgeWeekday: {
    fontSize: 8,
    fontWeight: '600',
    color: '#CBD5E1',
    letterSpacing: 0.5,
  },
  cardDetails: {
    flex: 1,
    paddingLeft: 12,
    justifyContent: 'center',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F2922',
    flex: 1,
    marginRight: 6,
  },
  registeredBadge: {
    backgroundColor: '#E5F5EC',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 12,
  },
  registeredBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#176B57',
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  cardMetaText: {
    fontSize: 12,
    color: '#5E6E66',
    marginLeft: 5,
    flexShrink: 1,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  badgeLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  pillBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  pillBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  priceText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#135C48',
  },
  chevronWrapper: {
    paddingLeft: 4,
  },
  // ─── Host an Event Card ───
  hostCard: {
    backgroundColor: '#EDF7F2',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E2ECE6',
  },
  hostIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#D7EFE3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostTextContainer: {
    flex: 1,
  },
  hostTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F2922',
  },
  hostSubtitle: {
    fontSize: 12,
    color: '#5E7A6E',
    marginTop: 2,
    lineHeight: 16,
  },
  // ─── Empty State ───
  emptyCard: {
    backgroundColor: '#EDF7F2',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 18,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 6,
    marginBottom: 16,
  },
  emptyIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#D7EFE3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTextContainer: {
    flex: 1,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F2922',
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: '#5E7A6E',
    marginTop: 2,
    lineHeight: 17,
  },
  // ─── Loading & Error ───
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13.5,
    color: '#5E6E66',
  },
  errorContainer: {
    paddingVertical: 36,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 13.5,
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 19,
  },
  retryButton: {
    backgroundColor: '#114D3F',
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13.5,
  },
  // ─── Modal Details ───
  modalContent: {
    gap: 14,
  },
  modalDescription: {
    fontSize: 13.5,
    color: '#4A5568',
    lineHeight: 20,
  },
  modalInfoBox: {
    backgroundColor: '#F8FAF9',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E8EDEA',
  },
  modalInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalLabel: {
    fontSize: 13,
    color: '#718096',
  },
  modalValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F2922',
  },
  modalFeeValue: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#135C48',
  },
});
