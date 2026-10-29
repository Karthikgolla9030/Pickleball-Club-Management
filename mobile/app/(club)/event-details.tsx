/**
 * Aught2 Pickleball — Unified Club Event Details Screen
 *
 * Owner & Manager single-page event details with direct inline registration overview:
 *   - Direct URL and browser refresh support via event ID parameter
 *   - Seamless Back navigation preserving club context and list filter
 *   - Event Hero image with club branding fallback, date overlay & status badge
 *   - Event Overview with category, visibility, fee, and full description
 *   - Dedicated "Schedule & Venue" section
 *   - Integrated "Registration Overview" section:
 *       * Live status summary cards (Registered, Waitlisted, Attended, No Show, Cancelled)
 *       * Real-time capacity and remaining spaces
 *       * Interactive status filter chips
 *       * Direct inline participant list with real names, emails, dates, notes, and attendance
 *       * Empty state when no participants exist (strictly without Add Player / View Roster buttons)
 *   - Lifecycle management actions: Edit Details, Publish, Complete, Cancel
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
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit3,
  MapPin,
  MoreVertical,
  PlayCircle,
  Tag,
  UserCheck,
  Users,
  UserX,
  XCircle,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Badge,
  Button,
  CreateEventModal,
  EmptyState,
  ErrorState,
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
  useStaffCancelRegistration,
  useStaffMarkAttendance,
} from '@/hooks';
import { Colors, Radius, Spacing } from '@/theme';
import { formatCurrency } from '@/utils';
import { resolveEventCover } from '@/utils/imageResolution';
import {
  EVENT_REGISTRATION_STATUS_LABELS,
  EVENT_STATUS_LABELS,
  EVENT_TYPE_LABELS,
  EVENT_VISIBILITY_LABELS,
  type ClubEvent,
  type EventRegistration,
  type EventRegistrationStatus,
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

function formatRegistrationDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

function parseEventLocation(loc: string | null) {
  if (!loc) return { court: 'Main Courts', city: '' };
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

  const [showEditModal, setShowEditModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<EventRegistrationStatus | 'all'>('all');
  const [isExpanded, setIsExpanded] = useState(false);

  // Fetch event details
  const {
    data: event,
    isLoading,
    isError,
    error,
    refetch,
  } = useClubEvent(clubId, eventId);

  // Fetch registrations for live attendance, capacity and integrated participant list
  const {
    data: registrations = [],
    isLoading: isLoadingRegistrations,
    refetch: refetchRegistrations,
  } = useEventRegistrations(clubId, eventId);

  // Lifecycle mutations
  const publishMutation = usePublishClubEvent(clubId);
  const cancelMutation = useCancelClubEvent(clubId);
  const completeMutation = useCompleteClubEvent(clubId);

  // Attendance mutations
  const markAttendanceMutation = useStaffMarkAttendance(clubId, eventId);
  const cancelRegMutation = useStaffCancelRegistration(clubId, eventId);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(club)/events' as never);
    }
  };

  // Authoritative status counts
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
    const remainingSpaces =
      event?.capacity !== null && event?.capacity !== undefined
        ? Math.max(0, event.capacity - activeSpots)
        : null;

    return {
      reg,
      wait,
      att,
      noShow,
      canc,
      activeSpots,
      remainingSpaces,
      total: registrations.length,
    };
  }, [registrations, event?.capacity]);

  // Filtered participant list
  const filteredRegistrations = useMemo(() => {
    if (filterStatus === 'all') return registrations;
    return registrations.filter((r) => r.status === filterStatus);
  }, [registrations, filterStatus]);

  // Expandable subset
  const displayedRegistrations = useMemo(() => {
    if (isExpanded || filteredRegistrations.length <= 8) {
      return filteredRegistrations;
    }
    return filteredRegistrations.slice(0, 8);
  }, [filteredRegistrations, isExpanded]);

  const handlePublish = () => {
    if (!event) return;
    Alert.alert('Publish Event', `Publish "${event.title}"? It will become visible to club players.`, [
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
    Alert.alert('Cancel Event', `Are you sure you want to cancel "${event.title}"? Active registrations will be cancelled.`, [
      { text: 'Back', style: 'cancel' },
      {
        text: 'Confirm Cancel',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelMutation.mutateAsync(event.id);
            refetch();
            refetchRegistrations();
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
      { text: 'Edit Event Details', onPress: () => setShowEditModal(true) },
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

  const handleMarkAttendance = async (registrationId: string, attended: boolean) => {
    try {
      await markAttendanceMutation.mutateAsync({ registrationId, attended });
      refetchRegistrations();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update attendance';
      Alert.alert('Attendance Error', msg);
    }
  };

  const handleCancelRegistration = (reg: EventRegistration) => {
    const playerName = reg.user_full_name || reg.user_name || reg.user_email || 'this player';
    Alert.alert(
      'Cancel Registration',
      `Cancel event registration for ${playerName}?`,
      [
        { text: 'Keep Spot', style: 'cancel' },
        {
          text: 'Confirm Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelRegMutation.mutateAsync(reg.id);
              refetchRegistrations();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Cancellation failed';
              Alert.alert('Error', msg);
            }
          },
        },
      ],
    );
  };

  // Permission check
  if (!canManageEvents) {
    return (
      <Screen style={styles.container}>
        <AppHeader title="Event Details" showBack={true} />
        <EmptyState
          title="Access Restricted"
          description="Only club owners and managers have permission to view and manage club events."
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

  const capacitySummaryText =
    event.capacity !== null && event.capacity !== undefined
      ? `${counts.activeSpots} / ${event.capacity} spots filled • ${counts.remainingSpaces} spaces remaining`
      : `${counts.activeSpots} registered participants (unlimited capacity)`;

  return (
    <Screen style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F8F5" />

      {/* 1. COMPACT HEADER */}
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
            accessibilityLabel="Event management actions"
          >
            <MoreVertical size={20} color="#102B2A" />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading || isLoadingRegistrations}
            onRefresh={() => {
              refetch();
              refetchRegistrations();
            }}
            tintColor="#176B57"
          />
        }
      >
        {/* 2. EVENT HERO COVER IMAGE */}
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

        {/* 3. EVENT OVERVIEW CARD */}
        <View style={styles.sectionCard}>
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
            <View style={styles.feeBadge}>
              <AppText style={styles.feeBadgeText}>{feeDisplay}</AppText>
            </View>
          </View>

          {event.description ? (
            <AppText style={styles.descriptionText}>{event.description}</AppText>
          ) : (
            <AppText style={styles.noDescriptionText}>No detailed description provided for this event.</AppText>
          )}
        </View>

        {/* 4. SCHEDULE & VENUE SECTION */}
        <View style={styles.sectionCard}>
          <AppText style={styles.sectionHeading}>Schedule & Venue</AppText>

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

        {/* 5. INTEGRATED REGISTRATION OVERVIEW & PARTICIPANT LIST */}
        <View style={styles.sectionCard}>
          <View style={styles.rosterSectionHeader}>
            <View>
              <AppText style={styles.sectionHeading}>Registration Overview</AppText>
              <AppText style={styles.rosterCapacitySubtitle}>{capacitySummaryText}</AppText>
            </View>
          </View>

          {/* Status Metrics Bar */}
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
            <View style={styles.metricItem}>
              <AppText style={[styles.metricNumber, { color: '#64748B' }]}>
                {counts.canc}
              </AppText>
              <AppText style={styles.metricLabel}>Cancelled</AppText>
            </View>
          </View>

          {/* Status Filter Chips */}
          <View style={styles.rosterFilterContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rosterFilterScroll}
            >
              {(
                [
                  { key: 'all', label: `All (${counts.total})` },
                  { key: 'registered', label: `Registered (${counts.reg})` },
                  { key: 'waitlisted', label: `Waitlisted (${counts.wait})` },
                  { key: 'attended', label: `Attended (${counts.att})` },
                  { key: 'no_show', label: `No Show (${counts.noShow})` },
                  { key: 'cancelled', label: `Cancelled (${counts.canc})` },
                ] as const
              ).map((chip) => {
                const isSelected = filterStatus === chip.key;
                return (
                  <TouchableOpacity
                    key={chip.key}
                    style={[styles.rosterChip, isSelected && styles.rosterChipActive]}
                    onPress={() => setFilterStatus(chip.key)}
                    activeOpacity={0.8}
                  >
                    <AppText style={[styles.rosterChipText, isSelected && styles.rosterChipTextActive]}>
                      {chip.label}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Participant Rows List */}
          <View style={styles.participantListContainer}>
            {filteredRegistrations.length === 0 ? (
              <View style={styles.emptyParticipantState}>
                <Users size={28} color="#94A3B8" style={{ marginBottom: 6 }} />
                <AppText style={styles.emptyParticipantTitle}>
                  {filterStatus === 'all' ? 'No registrations yet' : 'No participants found'}
                </AppText>
                <AppText style={styles.emptyParticipantSubtitle}>
                  {filterStatus === 'all'
                    ? 'No players have registered for this event yet.'
                    : `No registrations found with status "${filterStatus}".`}
                </AppText>
              </View>
            ) : (
              <>
                {displayedRegistrations.map((reg) => {
                  const playerName =
                    reg.user_full_name || reg.user_name || (reg.user_email ? reg.user_email.split('@')[0] : 'Participant');
                  const initials = playerName
                    .split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);

                  const isAttended = reg.status === 'attended';
                  const isNoShow = reg.status === 'no_show';
                  const isCancelledReg = reg.status === 'cancelled';
                  const regDate = formatRegistrationDate(reg.registered_at);

                  const getBadgeVariant = (st: EventRegistrationStatus) => {
                    switch (st) {
                      case 'attended':
                        return 'success';
                      case 'registered':
                        return 'info';
                      case 'waitlisted':
                        return 'warning';
                      case 'no_show':
                        return 'error';
                      case 'cancelled':
                      default:
                        return 'default';
                    }
                  };

                  return (
                    <View key={reg.id} style={styles.participantRow}>
                      <View style={styles.participantLeftCol}>
                        <View style={[styles.participantAvatar, isAttended && { backgroundColor: '#18794E' }]}>
                          <AppText style={styles.avatarInitialsText}>{initials || 'P'}</AppText>
                        </View>
                        <View style={styles.participantTextCol}>
                          <View style={styles.participantNameLine}>
                            <AppText style={styles.participantName} numberOfLines={1}>
                              {playerName}
                            </AppText>
                            <Badge
                              label={EVENT_REGISTRATION_STATUS_LABELS[reg.status] || reg.status}
                              variant={getBadgeVariant(reg.status)}
                            />
                          </View>
                          {reg.user_email ? (
                            <AppText style={styles.participantEmail} numberOfLines={1}>
                              {reg.user_email}
                            </AppText>
                          ) : null}
                          <AppText style={styles.participantDateText}>
                            {regDate ? `Registered on ${regDate}` : 'Registered'}
                          </AppText>
                          {reg.notes ? (
                            <AppText style={styles.participantNotesText} numberOfLines={2}>
                              Note: {reg.notes}
                            </AppText>
                          ) : null}
                        </View>
                      </View>

                      {/* Staff Attendance Quick Actions */}
                      {!isCancelledReg && (
                        <View style={styles.participantActionsCol}>
                          {!isAttended && (
                            <TouchableOpacity
                              style={[styles.attActionBtn, styles.attActionAttended]}
                              onPress={() => handleMarkAttendance(reg.id, true)}
                              activeOpacity={0.8}
                              accessibilityLabel={`Mark ${playerName} attended`}
                            >
                              <UserCheck size={12} color="#18794E" />
                              <AppText style={[styles.attActionText, { color: '#18794E' }]}>
                                Attended
                              </AppText>
                            </TouchableOpacity>
                          )}

                          {!isNoShow && (
                            <TouchableOpacity
                              style={[styles.attActionBtn, styles.attActionNoShow]}
                              onPress={() => handleMarkAttendance(reg.id, false)}
                              activeOpacity={0.8}
                              accessibilityLabel={`Mark ${playerName} no-show`}
                            >
                              <UserX size={12} color="#9A6B00" />
                              <AppText style={[styles.attActionText, { color: '#9A6B00' }]}>
                                No Show
                              </AppText>
                            </TouchableOpacity>
                          )}

                          <TouchableOpacity
                            style={styles.cancelSpotBtn}
                            onPress={() => handleCancelRegistration(reg)}
                            activeOpacity={0.8}
                            accessibilityLabel={`Cancel registration for ${playerName}`}
                          >
                            <XCircle size={14} color="#B42318" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}

                {filteredRegistrations.length > 8 && (
                  <TouchableOpacity
                    style={styles.expandToggleBtn}
                    onPress={() => setIsExpanded(!isExpanded)}
                    activeOpacity={0.8}
                  >
                    <AppText style={styles.expandToggleText}>
                      {isExpanded
                        ? 'Show Fewer Participants'
                        : `Show All (${filteredRegistrations.length}) Participants`}
                    </AppText>
                    {isExpanded ? (
                      <ChevronUp size={16} color="#176B57" />
                    ) : (
                      <ChevronDown size={16} color="#176B57" />
                    )}
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>

        {/* 6. MANAGEMENT ACTIONS */}
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
    fontWeight: '800',
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
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  categoryBadge: {
    backgroundColor: '#EFF3F6',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  visibilityBadge: {
    backgroundColor: '#EAF2FB',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  visibilityBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#2563A8',
  },
  feeBadge: {
    backgroundColor: '#E5F5EC',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  feeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#18794E',
  },
  descriptionText: {
    fontSize: 13,
    color: '#4A5568',
    lineHeight: 18,
  },
  noDescriptionText: {
    fontSize: 12.5,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102B2A',
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
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
    fontWeight: '600',
    color: '#718096',
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#102B2A',
    marginTop: 1,
  },
  infoSubtext: {
    fontSize: 12,
    color: '#657776',
    marginTop: 2,
  },

  // Roster Integrated Section
  rosterSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  rosterCapacitySubtitle: {
    fontSize: 12,
    color: '#0F766E',
    fontWeight: '600',
    marginTop: 2,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: 10,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#E6ECE8',
  },
  metricNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: '#102B2A',
  },
  metricLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    marginTop: 2,
  },

  // Roster Filters
  rosterFilterContainer: {
    marginVertical: 8,
  },
  rosterFilterScroll: {
    gap: 6,
  },
  rosterChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAE6',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rosterChipActive: {
    backgroundColor: '#176B57',
    borderColor: '#176B57',
  },
  rosterChipText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#3D544F',
  },
  rosterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Participant List
  participantListContainer: {
    marginTop: 6,
  },
  emptyParticipantState: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  emptyParticipantTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102B2A',
  },
  emptyParticipantSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
    textAlign: 'center',
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  participantLeftCol: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  participantAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0F392D',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  avatarInitialsText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  participantTextCol: {
    flex: 1,
    minWidth: 0,
  },
  participantNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  participantName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#102B2A',
  },
  participantEmail: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  participantDateText: {
    fontSize: 10.5,
    color: '#94A3B8',
    marginTop: 2,
  },
  participantNotesText: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
    fontStyle: 'italic',
  },
  participantActionsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  attActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  attActionAttended: {
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
  },
  attActionNoShow: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FEF3C7',
  },
  attActionText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  cancelSpotBtn: {
    padding: 4,
  },
  expandToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2',
    marginTop: 4,
  },
  expandToggleText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#176B57',
  },

  // Management Section
  managementSection: {
    marginHorizontal: 16,
    marginTop: 14,
    gap: 10,
  },
  managementBtn: {
    width: '100%',
  },
});
