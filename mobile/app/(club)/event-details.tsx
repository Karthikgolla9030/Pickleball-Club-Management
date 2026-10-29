/**
 * Aught2 Pickleball — Club Event Details Screen
 *
 * Dedicated owner/manager event details screen providing:
 *   - Direct URL and browser refresh support via event ID parameter
 *   - Seamless Back navigation preserving club context
 *   - Hero image with club branding fallback & date badge overlay
 *   - Comprehensive metadata: schedule, location, fee, capacity, status
 *   - Prominent "View Roster" button opening the full participant roster
 *   - Management lifecycle actions: Edit, Publish, Complete, Cancel
 *   - Proper Loading, 404 Not Found, and Error retry states
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  Calendar,
  Clock,
  Edit3,
  MapPin,
  MoreVertical,
  Tag,
  Users,
  CheckCircle2,
  XCircle,
  PlayCircle,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Badge,
  Button,
  Card,
  CreateEventModal,
  EmptyState,
  ErrorState,
  EventRosterModal,
  LoadingState,
  Screen,
} from '@/components';
import {
  useActiveClub,
  useCancelClubEvent,
  useClubBranding,
  useClubEvent,
  useCompleteClubEvent,
  useEventRegistrations,
  usePermission,
  usePublishClubEvent,
} from '@/hooks';
import { Colors, Spacing } from '@/theme';
import { formatCurrency } from '@/utils';
import { resolveEventCover } from '@/utils/imageResolution';
import {
  EVENT_STATUS_LABELS,
  EVENT_TYPE_LABELS,
  EVENT_VISIBILITY_LABELS,
  type ClubEvent,
} from '@/types';

function getEventThumbnailDate(iso: string) {
  try {
    const d = new Date(iso);
    const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const day = d.getDate();
    return { month, day: String(day) };
  } catch {
    return { month: 'NOV', day: '4' };
  }
}

function formatEventSchedule(startIso: string, endIso: string) {
  try {
    const dStart = new Date(startIso);
    const dEnd = new Date(endIso);
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const weekday = weekdays[dStart.getDay()];
    const day = dStart.getDate();
    const month = months[dStart.getMonth()];
    const year = dStart.getFullYear();
    const dateStr = `${weekday}, ${day} ${month} ${year}`;

    const formatTime12 = (d: Date) => {
      let hours = d.getHours();
      const minutes = d.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const hStr = hours < 10 ? `0${hours}` : `${hours}`;
      const mStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
      return `${hStr}:${mStr} ${ampm}`;
    };

    return {
      date: dateStr,
      time: `${formatTime12(dStart)} – ${formatTime12(dEnd)}`,
    };
  } catch {
    return { date: 'Tue, 4 Nov 2026', time: '09:00 AM – 11:00 AM' };
  }
}

function parseEventLocation(loc: string | null) {
  if (!loc) return { court: 'Main Courts', city: 'Clubhouse' };
  if (loc.includes(',')) {
    const parts = loc.split(',');
    return { court: parts[0].trim(), city: parts.slice(1).join(',').trim() };
  }
  return { court: loc, city: '' };
}

export default function EventDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; eventId?: string; clubId?: string }>();
  const eventId = params.id || params.eventId || '';

  const { clubId: activeClubId } = useActiveClub();
  const clubId = params.clubId || activeClubId || '';

  const { canManageEvents } = usePermission();
  const { data: clubBranding } = useClubBranding(clubId);

  const [showRosterModal, setShowRosterModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Fetch event details
  const {
    data: event,
    isLoading,
    isError,
    error,
    refetch,
  } = useClubEvent(clubId, eventId);

  // Fetch registrations to keep capacity stats live
  const { data: registrations = [], refetch: refetchRegistrations } = useEventRegistrations(
    clubId,
    eventId,
  );

  const publishMutation = usePublishClubEvent(clubId);
  const cancelMutation = useCancelClubEvent(clubId);
  const completeMutation = useCompleteClubEvent(clubId);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(club)/events' as never);
    }
  };

  const counts = useMemo(() => {
    let reg = 0;
    let wait = 0;
    let att = 0;
    let noShow = 0;
    let canc = 0;

    for (const r of registrations) {
      if (r.status === 'registered') reg++;
      else if (r.status === 'waitlisted') wait++;
      else if (r.status === 'attended') att++;
      else if (r.status === 'no_show') noShow++;
      else if (r.status === 'cancelled') canc++;
    }

    const activeSpots = reg + att + noShow;
    return { reg, wait, att, noShow, canc, activeSpots, total: registrations.length };
  }, [registrations]);

  const handlePublish = () => {
    if (!event) return;
    Alert.alert('Publish Event', `Publish "${event.title}"? It will become visible to players.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Publish',
        onPress: async () => {
          try {
            await publishMutation.mutateAsync(event.id);
            refetch();
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Publish failed';
            Alert.alert('Error', msg);
          }
        },
      },
    ]);
  };

  const handleCancelEvent = () => {
    if (!event) return;
    Alert.alert('Cancel Event', `Are you sure you want to cancel "${event.title}"?`, [
      { text: 'Back', style: 'cancel' },
      {
        text: 'Cancel Event',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelMutation.mutateAsync(event.id);
            refetch();
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Cancellation failed';
            Alert.alert('Error', msg);
          }
        },
      },
    ]);
  };

  const handleCompleteEvent = () => {
    if (!event) return;
    Alert.alert('Complete Event', `Mark "${event.title}" as completed?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete',
        onPress: async () => {
          try {
            await completeMutation.mutateAsync(event.id);
            refetch();
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Complete failed';
            Alert.alert('Error', msg);
          }
        },
      },
    ]);
  };

  const handleOpenActionMenu = () => {
    if (!event) return;
    const isDraft = event.status === 'draft';
    const isPublished = event.status === 'published';
    const isCompleted = event.status === 'completed';

    const options: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: 'View Roster', onPress: () => setShowRosterModal(true) },
      { text: 'Edit Event', onPress: () => setShowEditModal(true) },
    ];

    if (isDraft) {
      options.push({ text: 'Publish Event', onPress: handlePublish });
    }
    if (isPublished) {
      options.push({ text: 'Complete Event', onPress: handleCompleteEvent });
    }
    if (!isCompleted && event.status !== 'cancelled') {
      options.push({ text: 'Cancel Event', style: 'destructive', onPress: handleCancelEvent });
    }
    options.push({ text: 'Close', style: 'cancel' });

    Alert.alert(event.title, 'Event Management Actions', options);
  };

  // Permission check
  if (!canManageEvents) {
    return (
      <Screen style={styles.container}>
        <AppHeader title="Event Details" showBack={true} />
        <EmptyState
          title="Access Restricted"
          description="Only club owners and managers have permission to manage club events."
          actionLabel="Back to Events"
          onAction={handleBack}
        />
      </Screen>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <Screen style={styles.container}>
        <AppHeader title="Event Details" showBack={true} />
        <LoadingState message="Loading event details..." />
      </Screen>
    );
  }

  // Error / Not Found states
  if (isError || !event) {
    const isNotFound = !event || (error as any)?.status === 404;
    return (
      <Screen style={styles.container}>
        <AppHeader title="Event Details" showBack={true} />
        {isNotFound ? (
          <EmptyState
            title="Event Not Found"
            description="The requested event could not be found or has been removed."
            actionLabel="Back to Events"
            onAction={handleBack}
          />
        ) : (
          <ErrorState
            title="Unable to Load Event"
            message={error instanceof Error ? error.message : 'An error occurred while loading event details.'}
            onRetry={refetch}
          />
        )}
      </Screen>
    );
  }

  const thumbnailDate = getEventThumbnailDate(event.start_at);
  const schedule = formatEventSchedule(event.start_at, event.end_at);
  const loc = parseEventLocation(event.location);
  const cardImg = resolveEventCover(event, clubBranding);

  const feeDisplay =
    Number(event.registration_fee) > 0
      ? formatCurrency(Number(event.registration_fee))
      : 'Free';

  const isDraft = event.status === 'draft';
  const isPublished = event.status === 'published';
  const isCompleted = event.status === 'completed';
  const isCancelled = event.status === 'cancelled';

  const getStatusBadgeStyle = () => {
    switch (event.status) {
      case 'completed':
      case 'published':
        return { bg: '#E5F5EC', text: '#18794E' };
      case 'draft':
        return { bg: '#FFF5D9', text: '#9A6B00' };
      case 'cancelled':
      default:
        return { bg: '#FDECEC', text: '#B42318' };
    }
  };

  const statusStyle = getStatusBadgeStyle();

  const capacityText =
    event.capacity !== null && event.capacity !== undefined
      ? `${counts.activeSpots} / ${event.capacity} spots filled`
      : `${counts.activeSpots} participants (unlimited capacity)`;

  return (
    <Screen style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F8F5" />

      {/* Header with Back, Title, and Overflow Menu */}
      <AppHeader
        title={event.title}
        subtitle="Event Details & Management"
        showBack={true}
        borderless
        rightElement={
          <TouchableOpacity
            style={styles.headerMoreBtn}
            onPress={handleOpenActionMenu}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MoreVertical size={20} color="#102B2A" />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => {
              refetch();
              refetchRegistrations();
            }}
          />
        }
      >
        {/* Hero Cover Card */}
        <View style={styles.heroCard}>
          <Image source={cardImg} style={styles.heroImage} resizeMode="cover" />

          {/* Date Overlay Badge */}
          <View style={styles.dateOverlayBadge}>
            <AppText style={styles.dateOverlayMonth}>{thumbnailDate.month}</AppText>
            <AppText style={styles.dateOverlayDay}>{thumbnailDate.day}</AppText>
          </View>

          {/* Status Badge Overlay */}
          <View style={[styles.statusOverlayBadge, { backgroundColor: statusStyle.bg }]}>
            <AppText style={[styles.statusOverlayText, { color: statusStyle.text }]}>
              {EVENT_STATUS_LABELS[event.status]?.toUpperCase() || event.status.toUpperCase()}
            </AppText>
          </View>
        </View>

        {/* Title & Badges Section */}
        <View style={styles.sectionCard}>
          <AppText style={styles.eventTitle}>{event.title}</AppText>

          <View style={styles.badgeRow}>
            <View style={styles.categoryBadge}>
              <AppText style={styles.categoryBadgeText}>
                {EVENT_TYPE_LABELS[event.event_type]?.toUpperCase() || event.event_type.toUpperCase()}
              </AppText>
            </View>
            <View style={styles.visibilityBadge}>
              <AppText style={styles.visibilityBadgeText}>
                {EVENT_VISIBILITY_LABELS[event.visibility]?.toUpperCase() || event.visibility.toUpperCase()}
              </AppText>
            </View>
          </View>

          {/* Primary View Roster Action Banner */}
          <TouchableOpacity
            style={styles.rosterCtaBox}
            onPress={() => setShowRosterModal(true)}
            activeOpacity={0.8}
          >
            <View style={styles.rosterCtaIconCircle}>
              <Users size={18} color="#176B57" />
            </View>
            <View style={styles.rosterCtaTextCol}>
              <AppText style={styles.rosterCtaTitle}>Participant Roster</AppText>
              <AppText style={styles.rosterCtaSubtitle}>{capacityText}</AppText>
            </View>
            <View style={styles.rosterCtaBtn}>
              <AppText style={styles.rosterCtaBtnText}>View Roster →</AppText>
            </View>
          </TouchableOpacity>
        </View>

        {/* Schedule & Location Information */}
        <View style={styles.sectionCard}>
          <AppText style={styles.sectionHeading}>Event Schedule & Venue</AppText>

          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <Calendar size={18} color="#176B57" />
            </View>
            <View style={styles.infoContentCol}>
              <AppText style={styles.infoLabel}>Date</AppText>
              <AppText style={styles.infoValue}>{schedule.date}</AppText>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <Clock size={18} color="#176B57" />
            </View>
            <View style={styles.infoContentCol}>
              <AppText style={styles.infoLabel}>Time</AppText>
              <AppText style={styles.infoValue}>{schedule.time}</AppText>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <MapPin size={18} color="#176B57" />
            </View>
            <View style={styles.infoContentCol}>
              <AppText style={styles.infoLabel}>Location / Court</AppText>
              <AppText style={styles.infoValue}>
                {event.location ? event.location : 'Main Club Courts'}
              </AppText>
              {loc.city ? <AppText style={styles.infoSubtext}>{loc.city}</AppText> : null}
            </View>
          </View>

          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <View style={styles.infoIconBox}>
              <Tag size={18} color="#176B57" />
            </View>
            <View style={styles.infoContentCol}>
              <AppText style={styles.infoLabel}>Registration Fee</AppText>
              <AppText style={[styles.infoValue, { color: '#18794E', fontWeight: '700' }]}>
                {feeDisplay}
              </AppText>
            </View>
          </View>
        </View>

        {/* Description Section */}
        {event.description ? (
          <View style={styles.sectionCard}>
            <AppText style={styles.sectionHeading}>About This Event</AppText>
            <AppText style={styles.descriptionText}>{event.description}</AppText>
          </View>
        ) : null}

        {/* Capacity Breakdown Metrics */}
        <View style={styles.sectionCard}>
          <AppText style={styles.sectionHeading}>Registration Overview</AppText>
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <AppText style={styles.metricNumber}>{counts.activeSpots}</AppText>
              <AppText style={styles.metricLabel}>Registered</AppText>
            </View>
            <View style={styles.metricItem}>
              <AppText style={[styles.metricNumber, { color: '#9A6B00' }]}>
                {counts.wait}
              </AppText>
              <AppText style={styles.metricLabel}>Waitlist</AppText>
            </View>
            <View style={styles.metricItem}>
              <AppText style={[styles.metricNumber, { color: '#18794E' }]}>
                {counts.att}
              </AppText>
              <AppText style={styles.metricLabel}>Attended</AppText>
            </View>
            <View style={styles.metricItem}>
              <AppText style={[styles.metricNumber, { color: '#B42318' }]}>
                {counts.noShow}
              </AppText>
              <AppText style={styles.metricLabel}>No Show</AppText>
            </View>
          </View>
        </View>

        {/* Management Quick Actions */}
        <View style={styles.managementSection}>
          <Button
            label="Edit Event Details"
            variant="secondary"
            leftIcon={<Edit3 size={16} color={Colors.text.primary} />}
            onPress={() => setShowEditModal(true)}
            style={styles.managementBtn}
          />

          {isDraft && (
            <Button
              label="Publish Event"
              variant="primary"
              leftIcon={<PlayCircle size={16} color="#FFFFFF" />}
              onPress={handlePublish}
              loading={publishMutation.isPending}
              style={styles.managementBtn}
            />
          )}

          {isPublished && (
            <Button
              label="Mark Event as Completed"
              variant="primary"
              leftIcon={<CheckCircle2 size={16} color="#FFFFFF" />}
              onPress={handleCompleteEvent}
              loading={completeMutation.isPending}
              style={styles.managementBtn}
            />
          )}

          {!isCompleted && !isCancelled && (
            <Button
              label="Cancel Event"
              variant="ghost"
              leftIcon={<XCircle size={16} color="#B42318" />}
              onPress={handleCancelEvent}
              loading={cancelMutation.isPending}
              style={[styles.managementBtn, { borderColor: '#FDECEC' }]}
            />
          )}
        </View>
      </ScrollView>

      {/* Roster Management Modal — strictly without Add Player */}
      <EventRosterModal
        visible={showRosterModal}
        event={event}
        clubId={clubId}
        onClose={() => {
          setShowRosterModal(false);
          refetch();
          refetchRegistrations();
        }}
      />

      {/* Edit Event Modal */}
      <CreateEventModal
        visible={showEditModal}
        clubId={clubId}
        clubBranding={clubBranding}
        eventToEdit={event}
        onClose={() => setShowEditModal(false)}
        onSuccess={() => {
          refetch();
          refetchRegistrations();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F8F5',
  },
  scrollContent: {
    paddingBottom: 100,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  headerMoreBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAE6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
    height: 180,
    backgroundColor: '#E5F5EC',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E2EAE6',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  dateOverlayBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(16, 43, 42, 0.85)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignItems: 'center',
    minWidth: 40,
  },
  dateOverlayMonth: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dateOverlayDay: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  statusOverlayBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusOverlayText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    padding: 16,
  },
  eventTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#102B2A',
    lineHeight: 26,
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  categoryBadge: {
    backgroundColor: '#EFF3F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  categoryBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#475569',
  },
  visibilityBadge: {
    backgroundColor: '#EAF2FB',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  visibilityBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#2563A8',
  },
  rosterCtaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDF7F2',
    borderWidth: 1,
    borderColor: '#D5EAE0',
    borderRadius: 12,
    padding: 12,
  },
  rosterCtaIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#D9EFE4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rosterCtaTextCol: {
    flex: 1,
  },
  rosterCtaTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102B2A',
  },
  rosterCtaSubtitle: {
    fontSize: 11.5,
    color: '#4A605A',
    marginTop: 1,
  },
  rosterCtaBtn: {
    backgroundColor: '#176B57',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  rosterCtaBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '600',
  },
  sectionHeading: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#102B2A',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 12,
  },
  infoIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F0F7F4',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  infoContentCol: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: '#657776',
    marginBottom: 1,
  },
  infoValue: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#102B2A',
  },
  infoSubtext: {
    fontSize: 11.5,
    color: '#657776',
    marginTop: 1,
  },
  descriptionText: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 19,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metricItem: {
    flex: 1,
    backgroundColor: '#F8FAF9',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2EAE6',
  },
  metricNumber: {
    fontSize: 17,
    fontWeight: '700',
    color: '#102B2A',
  },
  metricLabel: {
    fontSize: 10,
    color: '#657776',
    fontWeight: '500',
    marginTop: 2,
  },
  managementSection: {
    marginHorizontal: 16,
    marginTop: 16,
    gap: 10,
  },
  managementBtn: {
    width: '100%',
  },
});
