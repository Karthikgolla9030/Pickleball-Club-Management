/**
 * Aught2 Pickleball — Club Events Management & Roster Redesign
 *
 * Implements a clean, mobile-first Events dashboard matching reference standards:
 *   - Status bar & mobile header with hamburger, title & '+ Create' button
 *   - Promotional Hero Banner ('More Than a Game', 'Social nights, clinics, and community events...')
 *   - 4 Dynamic Statistics cards (Total, Published, Draft, Completed)
 *   - Horizontally scrollable status filter chips + settings sliders button
 *   - Streamlined Event Cards with clear hierarchy, date badges, capacity indicators,
 *     explicit 'Free' or entry fees, 'View Roster →' primary CTA, and 3-dot overflow menu
 *   - Full-featured, responsive Roster Management Dialog (not a clipped sheet!):
 *       * Pinned header with title, subtitle & clear close control
 *       * Real-time participant summary metric pills (Registered, Waitlist, Attended, No Show, Cancelled)
 *       * Horizontally scrollable status filter tabs with counts
 *       * Clean participant cards with real full names, email, timestamp, status badge
 *       * Specific, unambiguous actions for each status:
 *           - Registered: Mark Attended, Mark No Show, Cancel Spot (with confirm)
 *           - Attended: Attended indicator, Reset Attendance, Mark No Show
 *           - No Show: No Show indicator, Reset Attendance, Mark Attended
 *           - Waitlisted: Promote to Registered (with capacity verification), Cancel Waitlist
 *           - Cancelled: Cancelled indicator, excluded from active capacity
 *       * Staff manual player registration
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  AlertCircle,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Image as ImageIcon,
  MapPin,
  MoreVertical,
  RotateCcw,
  SlidersHorizontal,
  Tag,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  UserX,
  X,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  DateTimePickerInput,
  LoadingState,
  MetricGrid,
  ModalSheet,
  Screen,
} from '@/components';
import {
  useActiveClub,
  useClubBranding,
  useCancelClubEvent,
  useClubEvents,
  useCompleteClubEvent,
  useCreateClubEvent,
  useEventRegistrations,
  usePermission,
  usePublishClubEvent,
  useStaffCancelRegistration,
  useStaffMarkAttendance,
  useStaffPromoteWaitlisted,
  useStaffRegisterPlayer,
  useStaffResetAttendance,
  useUpdateClubEvent,
} from '@/hooks';
import { clubAssetsApi } from '@/services/api/clubAssets';
import { Colors, Radius, Spacing } from '@/theme';
import { formatCurrency, resolveMediaUrl } from '@/utils';
import { resolveEventCover } from '@/utils/imageResolution';
import {
  EVENT_REGISTRATION_STATUS_LABELS,
  EVENT_STATUS_LABELS,
  EVENT_TYPE_LABELS,
  EVENT_VISIBILITY_LABELS,
  type ClubBranding,
  type ClubEvent,
  type CreateEventPayload,
  type EventRegistration,
  type EventRegistrationStatus,
  type EventStatus,
  type EventType,
  type EventVisibility,
  type UpdateEventPayload,
} from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getEventThumbnailDate(iso: string) {
  try {
    const d = new Date(iso);
    const month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const day = d.getDate();
    return { month, day: String(day) };
  } catch {
    return { month: 'SEP', day: '11' };
  }
}

function formatEventSchedule(startIso: string, endIso: string) {
  try {
    const dStart = new Date(startIso);
    const dEnd = new Date(endIso);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = dStart.getDate();
    const month = months[dStart.getMonth()];
    const year = dStart.getFullYear();
    const dateStr = `${day} ${month} ${year}`;
    const startTimeStr = dStart.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const endTimeStr = dEnd.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return {
      date: dateStr,
      time: `${startTimeStr} – ${endTimeStr}`,
    };
  } catch {
    return { date: '11 Sep 2026', time: '15:53 – 11:53' };
  }
}

function parseEventLocation(loc: string | null) {
  if (!loc) return { court: 'Courts 1–8', city: 'Tirupati, AP' };
  if (loc.includes(',')) {
    const parts = loc.split(',');
    return { court: parts[0].trim(), city: parts.slice(1).join(',').trim() };
  }
  return { court: loc, city: 'Tirupati, AP' };
}

function getEventCardImage(event: ClubEvent, index: number, clubCoverUrl?: string | null) {
  if (event.cover_image_url) {
    return { uri: resolveMediaUrl(event.cover_image_url) };
  }
  if (clubCoverUrl) {
    return { uri: resolveMediaUrl(clubCoverUrl) };
  }
  if (event.event_type === 'clinic') {
    return require('../../assets/events/card3_clean.jpg');
  }
  if (event.event_type === 'social') {
    return require('../../assets/events/card2_clean.jpg');
  }
  if (event.event_type === 'community') {
    return require('../../assets/events/card1_clean.jpg');
  }
  const images = [
    require('../../assets/events/card1_clean.jpg'),
    require('../../assets/events/card2_clean.jpg'),
    require('../../assets/events/card3_clean.jpg'),
  ];
  return images[index % images.length];
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function getPlayerInitials(name: string): string {
  if (!name) return 'P';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// ─── Event Card Component ─────────────────────────────────────────────────────

function EventCard({
  event,
  index,
  clubCoverUrl,
  clubBranding,
  onEditEvent,
  onViewRoster,
  onPublish,
  onCancel,
  onComplete,
  isActing,
}: {
  event: ClubEvent;
  index: number;
  clubCoverUrl?: string | null;
  clubBranding?: ClubBranding | null;
  onEditEvent: (event: ClubEvent) => void;
  onViewRoster: (event: ClubEvent) => void;
  onPublish: (event: ClubEvent) => void;
  onCancel: (event: ClubEvent) => void;
  onComplete: (event: ClubEvent) => void;
  isActing: boolean;
}) {
  const isDraft = event.status === 'draft';
  const isPublished = event.status === 'published';
  const isCompleted = event.status === 'completed';

  const thumbnailDate = getEventThumbnailDate(event.start_at);
  const schedule = formatEventSchedule(event.start_at, event.end_at);
  const loc = parseEventLocation(event.location);
  const cardImg = resolveEventCover(event, clubBranding);

  const feeDisplay =
    Number(event.registration_fee) > 0
      ? formatCurrency(Number(event.registration_fee))
      : 'Free';

  const handleOptionsPress = () => {
    const options: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: 'Edit Event & Picture', onPress: () => onEditEvent(event) },
      { text: 'View Roster', onPress: () => onViewRoster(event) },
    ];

    if (isDraft) {
      options.push({ text: 'Publish Event', onPress: () => onPublish(event) });
    }
    if (isPublished) {
      options.push({ text: 'Complete Event', onPress: () => onComplete(event) });
    }
    if (!isCompleted && event.status !== 'cancelled') {
      options.push({ text: 'Cancel Event', style: 'destructive', onPress: () => onCancel(event) });
    }
    options.push({ text: 'Close', style: 'cancel' });

    Alert.alert(event.title, 'Manage Event Actions', options);
  };

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

  const getAudienceBadgeStyle = () => {
    if (event.visibility === 'public') {
      return { bg: '#EAF2FB', text: '#2563A8' };
    }
    if (event.visibility === 'members_only') {
      return { bg: '#FFF5D9', text: '#9A6B00' };
    }
    return { bg: '#EFF3F6', text: '#475569' };
  };

  const statusStyle = getStatusBadgeStyle();
  const audienceStyle = getAudienceBadgeStyle();

  return (
    <View style={styles.eventCard}>
      <View style={styles.cardContent}>
        {/* Left Thumbnail with Date Badge */}
        <View style={styles.imageContainer}>
          <Image source={cardImg} style={styles.thumbnail} resizeMode="cover" />
          <View style={styles.dateBadge}>
            <AppText style={styles.dateMonth}>{thumbnailDate.month}</AppText>
            <AppText style={styles.dateDay}>{thumbnailDate.day}</AppText>
          </View>
        </View>

        {/* Right Info Section */}
        <View style={styles.infoContainer}>
          {/* Header Row: Title, Status Badge, More Menu */}
          <View style={styles.cardHeaderRow}>
            <AppText style={styles.cardTitle} numberOfLines={2}>
              {event.title}
            </AppText>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <AppText style={[styles.statusBadgeText, { color: statusStyle.text }]}>
                {EVENT_STATUS_LABELS[event.status]?.toUpperCase() || event.status.toUpperCase()}
              </AppText>
            </View>
            <TouchableOpacity
              onPress={handleOptionsPress}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.moreBtn}
            >
              <MoreVertical size={16} color="#4B5563" />
            </TouchableOpacity>
          </View>

          {/* Badges Row */}
          <View style={styles.badgesRow}>
            <View style={styles.typeBadge}>
              <AppText style={styles.typeBadgeText}>
                {EVENT_TYPE_LABELS[event.event_type]?.toUpperCase() || event.event_type.toUpperCase()}
              </AppText>
            </View>
            <View style={[styles.audienceBadge, { backgroundColor: audienceStyle.bg }]}>
              <AppText style={[styles.audienceBadgeText, { color: audienceStyle.text }]}>
                {EVENT_VISIBILITY_LABELS[event.visibility]?.toUpperCase() || event.visibility.toUpperCase()}
              </AppText>
            </View>
          </View>

          {/* Description (scannable, clean) */}
          <AppText style={styles.descriptionText} numberOfLines={2}>
            {event.description ||
              'Community pickleball event with match play, drills, and social networking.'}
          </AppText>

          {/* 3-Column Metadata Row */}
          <View style={styles.metaRow}>
            {/* Col 1: Schedule */}
            <View style={styles.metaCol}>
              <Calendar size={12} color="#657776" style={styles.metaIcon} />
              <View style={styles.metaTextCol}>
                <AppText style={styles.metaPrimaryText} numberOfLines={1}>
                  {schedule.date}
                </AppText>
                <AppText style={styles.metaSecondaryText} numberOfLines={1}>
                  {schedule.time}
                </AppText>
              </View>
            </View>

            {/* Col 2: Location */}
            <View style={styles.metaCol}>
              <MapPin size={12} color="#657776" style={styles.metaIcon} />
              <View style={styles.metaTextCol}>
                <AppText style={styles.metaPrimaryText} numberOfLines={1}>
                  {loc.court}
                </AppText>
                <AppText style={styles.metaSecondaryText} numberOfLines={1}>
                  {loc.city}
                </AppText>
              </View>
            </View>

            {/* Col 3: Capacity */}
            <View style={styles.metaCol}>
              <Users size={12} color="#657776" style={styles.metaIcon} />
              <View style={styles.metaTextCol}>
                <AppText style={styles.metaPrimaryText} numberOfLines={1}>
                  {event.registered_count} / {event.capacity ?? '∞'}
                </AppText>
                <AppText style={styles.metaSecondaryText} numberOfLines={1}>
                  registered
                </AppText>
              </View>
            </View>
          </View>

          {/* Bottom Action Row */}
          <View style={styles.cardFooterRow}>
            {/* Left: Entry Fee */}
            <View style={styles.feeGroup}>
              <Tag size={12} color="#18794E" />
              <AppText style={styles.feeLabel}>Entry:</AppText>
              <AppText style={styles.feeValue}>{feeDisplay}</AppText>
            </View>

            {/* Right: Action Button */}
            <TouchableOpacity
              style={styles.cardActionBtn}
              onPress={() => onViewRoster(event)}
              activeOpacity={0.75}
            >
              <AppText style={styles.cardActionBtnText}>
                View Roster →
              </AppText>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Modern Event Roster Modal ────────────────────────────────────────────────

function RosterModal({
  visible,
  event,
  clubId,
  onClose,
}: {
  visible: boolean;
  event: ClubEvent | null;
  clubId: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && windowWidth >= 768;

  const [filterStatus, setFilterStatus] = useState<EventRegistrationStatus | 'all'>('all');
  const [manualUserId, setManualUserId] = useState('');
  const [showManualRegister, setShowManualRegister] = useState(false);

  const eventId = event?.id || '';

  // Fetch full registrations list for this event
  const {
    data: registrations = [],
    isLoading,
    refetch,
  } = useEventRegistrations(clubId, eventId);

  const markAttendanceMutation = useStaffMarkAttendance(clubId, eventId);
  const resetAttendanceMutation = useStaffResetAttendance(clubId, eventId);
  const cancelRegMutation = useStaffCancelRegistration(clubId, eventId);
  const promoteMutation = useStaffPromoteWaitlisted(clubId, eventId);
  const registerPlayerMutation = useStaffRegisterPlayer(clubId, eventId);

  // Accurate real-time counts calculated directly from registration data
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

    // Active capacity spots used = registered + attended + no_show
    const activeSpots = reg + att + noShow;
    return { reg, wait, att, noShow, canc, activeSpots, total: registrations.length };
  }, [registrations]);

  // Filtered view
  const filteredRegistrations = useMemo(() => {
    if (filterStatus === 'all') return registrations;
    return registrations.filter((r) => r.status === filterStatus);
  }, [registrations, filterStatus]);

  // Attendance actions
  const handleMarkAttendance = async (registrationId: string, attended: boolean) => {
    try {
      await markAttendanceMutation.mutateAsync({ registrationId, attended });
      refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update attendance';
      Alert.alert('Attendance Error', msg);
    }
  };

  const handleResetAttendance = async (registrationId: string) => {
    try {
      await resetAttendanceMutation.mutateAsync(registrationId);
      refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset attendance';
      Alert.alert('Reset Error', msg);
    }
  };

  const handlePromote = async (reg: EventRegistration) => {
    // Check if capacity is reached
    if (event?.capacity !== null && event?.capacity !== undefined) {
      if (counts.activeSpots >= event.capacity) {
        Alert.alert(
          'Capacity Full',
          `This event is at maximum capacity (${counts.activeSpots}/${event.capacity} active spots). Cannot promote player until a spot opens up.`,
        );
        return;
      }
    }

    try {
      await promoteMutation.mutateAsync(reg.id);
      refetch();
      Alert.alert('Player Promoted', `${reg.user_full_name || reg.user_name || 'Player'} has been promoted to Registered.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Promotion failed';
      Alert.alert('Promotion Failed', msg);
    }
  };

  const handleCancelRegistration = (reg: EventRegistration) => {
    const isWaitlisted = reg.status === 'waitlisted';
    const title = isWaitlisted ? 'Cancel Waitlist' : 'Cancel Registration';
    const message = isWaitlisted
      ? `Remove ${reg.user_full_name || reg.user_name || reg.user_email || 'this player'} from the waitlist?`
      : `Cancel registration for ${reg.user_full_name || reg.user_name || reg.user_email || 'this player'}? If an eligible waitlisted player exists, they will be auto-promoted.`;

    Alert.alert(title, message, [
      { text: 'Keep Spot', style: 'cancel' },
      {
        text: 'Confirm Cancel',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelRegMutation.mutateAsync(reg.id);
            refetch();
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Cancellation failed';
            Alert.alert('Error', msg);
          }
        },
      },
    ]);
  };

  const handleManualRegister = async () => {
    if (!manualUserId.trim()) {
      Alert.alert('Validation Error', 'Please enter a valid Player User ID or UUID.');
      return;
    }
    try {
      await registerPlayerMutation.mutateAsync({
        user_id: manualUserId.trim(),
      });
      setManualUserId('');
      setShowManualRegister(false);
      refetch();
      Alert.alert('Success', 'Player registered successfully.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to register player';
      Alert.alert('Registration Failed', msg);
    }
  };

  if (!event || !visible) return null;

  const capacityInfo =
    event.capacity !== null && event.capacity !== undefined
      ? `${counts.activeSpots} / ${event.capacity} spots filled`
      : `${counts.activeSpots} participants (unlimited capacity)`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalBackdrop}>
        <View
          style={[
            styles.modalSheetContainer,
            isDesktop
              ? styles.modalDialogDesktop
              : [
                  styles.modalSheetMobile,
                  { maxHeight: windowHeight - insets.top - 20 },
                ],
          ]}
        >
          {/* Mobile Drag Indicator */}
          {!isDesktop && <View style={styles.sheetHandle} />}

          {/* 1. Pinned Header */}
          <View style={styles.rosterHeader}>
            <View style={styles.rosterHeaderText}>
              <AppText style={styles.rosterTitle} numberOfLines={2}>
                {event.title}
              </AppText>
              <AppText style={styles.rosterSubtitle}>
                Participant Roster • {capacityInfo}
              </AppText>
            </View>
            <TouchableOpacity
              style={styles.rosterCloseBtn}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={18} color="#102B2A" />
            </TouchableOpacity>
          </View>

          {/* 2. Pinned Metrics Bar */}
          <View style={styles.rosterMetricsContainer}>
            <View style={styles.rosterMetricCard}>
              <AppText style={styles.rosterMetricNumber}>{counts.activeSpots}</AppText>
              <AppText style={styles.rosterMetricLabel}>Active Spots</AppText>
            </View>
            <View style={styles.rosterMetricCard}>
              <AppText style={[styles.rosterMetricNumber, { color: '#9A6B00' }]}>
                {counts.wait}
              </AppText>
              <AppText style={styles.rosterMetricLabel}>Waitlist</AppText>
            </View>
            <View style={styles.rosterMetricCard}>
              <AppText style={[styles.rosterMetricNumber, { color: '#18794E' }]}>
                {counts.att}
              </AppText>
              <AppText style={styles.rosterMetricLabel}>Attended</AppText>
            </View>
            <View style={styles.rosterMetricCard}>
              <AppText style={[styles.rosterMetricNumber, { color: '#B42318' }]}>
                {counts.noShow}
              </AppText>
              <AppText style={styles.rosterMetricLabel}>No Show</AppText>
            </View>
            <View style={styles.rosterMetricCard}>
              <AppText style={[styles.rosterMetricNumber, { color: '#64748B' }]}>
                {counts.canc}
              </AppText>
              <AppText style={styles.rosterMetricLabel}>Cancelled</AppText>
            </View>
          </View>

          {/* 3. Pinned Status Filter Tabs */}
          <View style={styles.rosterTabsSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rosterTabsContent}
            >
              {[
                { key: 'all' as const, label: `All (${counts.total})` },
                { key: 'registered' as const, label: `Registered (${counts.reg})` },
                { key: 'waitlisted' as const, label: `Waitlisted (${counts.wait})` },
                { key: 'attended' as const, label: `Attended (${counts.att})` },
                { key: 'no_show' as const, label: `No Show (${counts.noShow})` },
                { key: 'cancelled' as const, label: `Cancelled (${counts.canc})` },
              ].map((tab) => {
                const isSelected = filterStatus === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    style={[
                      styles.rosterTabChip,
                      isSelected && styles.rosterTabChipSelected,
                    ]}
                    onPress={() => setFilterStatus(tab.key)}
                    activeOpacity={0.7}
                  >
                    <AppText
                      style={[
                        styles.rosterTabChipText,
                        isSelected && styles.rosterTabChipTextSelected,
                      ]}
                    >
                      {tab.label}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* 4. Staff Controls / Add Player */}
          <View style={styles.rosterControlRow}>
            <AppText style={styles.rosterCountText}>
              Showing {filteredRegistrations.length} of {counts.total} participant{counts.total === 1 ? '' : 's'}
            </AppText>
            <TouchableOpacity
              style={styles.addPlayerBtn}
              onPress={() => setShowManualRegister(!showManualRegister)}
              activeOpacity={0.75}
            >
              <UserPlus size={13} color="#176B57" style={{ marginRight: 4 }} />
              <AppText style={styles.addPlayerBtnText}>
                {showManualRegister ? 'Close Form' : '+ Add Player'}
              </AppText>
            </TouchableOpacity>
          </View>

          {showManualRegister && (
            <View style={styles.manualRegisterBox}>
              <AppText style={styles.manualRegisterTitle}>Staff Manual Player Registration</AppText>
              <Input
                label="Player User UUID"
                placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
                value={manualUserId}
                onChangeText={setManualUserId}
                autoCapitalize="none"
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <Button
                  label="Register Player"
                  variant="primary"
                  size="sm"
                  loading={registerPlayerMutation.isPending}
                  onPress={handleManualRegister}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Cancel"
                  variant="ghost"
                  size="sm"
                  onPress={() => setShowManualRegister(false)}
                />
              </View>
            </View>
          )}

          {/* 5. Scrollable Participant List */}
          <View style={styles.rosterListContainer}>
            {isLoading ? (
              <LoadingState message="Loading roster participants..." />
            ) : filteredRegistrations.length === 0 ? (
              <EmptyState
                title="No Participants"
                description={`No players found with status "${filterStatus}".`}
              />
            ) : (
              <FlatList
                data={filteredRegistrations}
                keyExtractor={(item) => item.id}
                contentContainerStyle={[
                  styles.rosterScrollContent,
                  { paddingBottom: insets.bottom + 40 },
                ]}
                renderItem={({ item }) => {
                  const displayName =
                    item.user_full_name || item.user_name || (item.user_email ? item.user_email.split('@')[0] : 'Participant');
                  const initials = getPlayerInitials(displayName);

                  return (
                    <View style={styles.participantCard}>
                      {/* Card Top: Avatar, Name, Email, Status Badge */}
                      <View style={styles.participantHeaderRow}>
                        <View style={styles.avatarCircle}>
                          <AppText style={styles.avatarInitials}>{initials}</AppText>
                        </View>
                        <View style={styles.participantInfoCol}>
                          <AppText style={styles.participantName} numberOfLines={1}>
                            {displayName}
                          </AppText>
                          {item.user_email ? (
                            <AppText style={styles.participantEmail} numberOfLines={1}>
                              {item.user_email}
                            </AppText>
                          ) : null}
                          <AppText style={styles.participantTimestamp}>
                            Registered {formatDate(item.registered_at)}
                          </AppText>
                        </View>
                        <View style={styles.participantBadgeCol}>
                          <Badge
                            label={EVENT_REGISTRATION_STATUS_LABELS[item.status] || item.status}
                            variant={
                              item.status === 'attended' || item.status === 'registered'
                                ? 'success'
                                : item.status === 'waitlisted'
                                ? 'warning'
                                : 'error'
                            }
                          />
                        </View>
                      </View>

                      {/* Optional Notes */}
                      {item.notes ? (
                        <View style={styles.participantNotesBox}>
                          <AppText style={styles.participantNotesText}>
                            Note: {item.notes}
                          </AppText>
                        </View>
                      ) : null}

                      {/* Status-Specific Actions */}
                      <View style={styles.participantActionsRow}>
                        {/* CASE A: REGISTERED */}
                        {item.status === 'registered' && (
                          <View style={styles.actionButtonGroup}>
                            <TouchableOpacity
                              style={styles.actionBtnAttended}
                              onPress={() => handleMarkAttendance(item.id, true)}
                              activeOpacity={0.8}
                            >
                              <Check size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                              <AppText style={styles.actionBtnAttendedText}>Mark Attended</AppText>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.actionBtnNoShow}
                              onPress={() => handleMarkAttendance(item.id, false)}
                              activeOpacity={0.8}
                            >
                              <UserX size={13} color="#B42318" style={{ marginRight: 4 }} />
                              <AppText style={styles.actionBtnNoShowText}>Mark No Show</AppText>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.actionBtnCancel}
                              onPress={() => handleCancelRegistration(item)}
                              activeOpacity={0.7}
                            >
                              <AppText style={styles.actionBtnCancelText}>Cancel Spot</AppText>
                            </TouchableOpacity>
                          </View>
                        )}

                        {/* CASE B: ATTENDED */}
                        {item.status === 'attended' && (
                          <View style={styles.statusStateRow}>
                            <View style={styles.statusStateTagSuccess}>
                              <UserCheck size={13} color="#18794E" style={{ marginRight: 4 }} />
                              <AppText style={styles.statusStateTagSuccessText}>
                                Attendance Confirmed
                              </AppText>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                              <TouchableOpacity
                                style={styles.actionBtnOutline}
                                onPress={() => handleResetAttendance(item.id)}
                                activeOpacity={0.8}
                              >
                                <RotateCcw size={12} color="#475569" style={{ marginRight: 3 }} />
                                <AppText style={styles.actionBtnOutlineText}>Reset</AppText>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.actionBtnNoShow}
                                onPress={() => handleMarkAttendance(item.id, false)}
                                activeOpacity={0.8}
                              >
                                <AppText style={styles.actionBtnNoShowText}>No Show</AppText>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}

                        {/* CASE C: NO SHOW */}
                        {item.status === 'no_show' && (
                          <View style={styles.statusStateRow}>
                            <View style={styles.statusStateTagError}>
                              <AlertCircle size={13} color="#B42318" style={{ marginRight: 4 }} />
                              <AppText style={styles.statusStateTagErrorText}>
                                Player Did Not Attend
                              </AppText>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 6 }}>
                              <TouchableOpacity
                                style={styles.actionBtnOutline}
                                onPress={() => handleResetAttendance(item.id)}
                                activeOpacity={0.8}
                              >
                                <RotateCcw size={12} color="#475569" style={{ marginRight: 3 }} />
                                <AppText style={styles.actionBtnOutlineText}>Reset</AppText>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.actionBtnAttended}
                                onPress={() => handleMarkAttendance(item.id, true)}
                                activeOpacity={0.8}
                              >
                                <AppText style={styles.actionBtnAttendedText}>Attended</AppText>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}

                        {/* CASE D: WAITLISTED */}
                        {item.status === 'waitlisted' && (
                          <View style={styles.actionButtonGroup}>
                            <TouchableOpacity
                              style={styles.actionBtnPromote}
                              onPress={() => handlePromote(item)}
                              activeOpacity={0.8}
                            >
                              <UserPlus size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                              <AppText style={styles.actionBtnPromoteText}>
                                Promote to Registered
                              </AppText>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.actionBtnCancel}
                              onPress={() => handleCancelRegistration(item)}
                              activeOpacity={0.7}
                            >
                              <AppText style={styles.actionBtnCancelText}>Cancel Waitlist</AppText>
                            </TouchableOpacity>
                          </View>
                        )}

                        {/* CASE E: CANCELLED */}
                        {item.status === 'cancelled' && (
                          <View style={styles.cancelledNoticeRow}>
                            <UserMinus size={13} color="#94A3B8" style={{ marginRight: 4 }} />
                            <AppText style={styles.cancelledNoticeText}>
                              Registration cancelled • Excluded from active event capacity
                            </AppText>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                }}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Create Event Modal ───────────────────────────────────────────────────────

function CreateEventModal({
  visible,
  clubId,
  clubBranding,
  eventToEdit,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  clubId: string;
  clubBranding?: ClubBranding | null;
  eventToEdit?: ClubEvent | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [eventType, setEventType] = useState<EventType>('social');
  const [visibility, setVisibility] = useState<EventVisibility>('public');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState('');
  const [fee, setFee] = useState('');
  const defaultStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  }, []);
  const defaultEnd = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(11, 0, 0, 0);
    return d.toISOString();
  }, []);

  const [startAt, setStartAt] = useState(defaultStart);
  const [endAt, setEndAt] = useState(defaultEnd);

  const createEventMutation = useCreateClubEvent(clubId);
  const updateEventMutation = useUpdateClubEvent(clubId);

  useEffect(() => {
    if (eventToEdit) {
      setTitle(eventToEdit.title || '');
      setDescription(eventToEdit.description || '');
      setCoverImageUrl(eventToEdit.cover_image_url || null);
      setEventType(eventToEdit.event_type || 'social');
      setVisibility(eventToEdit.visibility || 'public');
      setLocation(eventToEdit.location || '');
      setCapacity(eventToEdit.capacity ? String(eventToEdit.capacity) : '');
      setFee(eventToEdit.registration_fee ? String(eventToEdit.registration_fee) : '');
      setStartAt(eventToEdit.start_at || defaultStart);
      setEndAt(eventToEdit.end_at || defaultEnd);
    } else {
      setTitle('');
      setDescription('');
      setCoverImageUrl(null);
      setEventType('social');
      setVisibility('public');
      setLocation('');
      setCapacity('');
      setFee('');
      setStartAt(defaultStart);
      setEndAt(defaultEnd);
    }
  }, [eventToEdit, visible, defaultStart, defaultEnd]);

  const handlePickCover = async () => {
    if (!clubId) return;
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Needed', 'Please allow gallery access to upload an event picture.');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.85,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const mime = asset.mimeType || (asset.uri?.endsWith('.png') ? 'image/png' : 'image/jpeg');
        const ext = mime.includes('png') ? 'png' : 'jpg';
        const fileName = asset.fileName || `event_cover_${Date.now()}.${ext}`;

        setIsUploadingCover(true);
        try {
          const uploadRes = await clubAssetsApi.uploadClubMedia(
            clubId,
            { uri: asset.uri, name: fileName, type: mime },
            'event_cover',
            'event'
          );
          setCoverImageUrl(uploadRes.public_url);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Upload failed.';
          Alert.alert('Upload Failed', msg);
        } finally {
          setIsUploadingCover(false);
        }
      }
    } catch {
      Alert.alert('Error', 'Unable to pick image.');
    }
  };

  const handleResetCover = () => {
    setCoverImageUrl(null);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Validation Error', 'Event title is required.');
      return;
    }

    if (!startAt || !endAt) {
      Alert.alert('Validation Error', 'Event start and end dates are required.');
      return;
    }

    if (new Date(startAt) >= new Date(endAt)) {
      Alert.alert('Validation Error', 'Event end time must be after the start time.');
      return;
    }

    try {
      if (eventToEdit) {
        const payload: UpdateEventPayload = {
          title: title.trim(),
          description: description.trim() || null,
          cover_image_url: coverImageUrl || null,
          event_type: eventType,
          visibility,
          start_at: startAt,
          end_at: endAt,
          location: location.trim() || null,
          capacity: capacity.trim() ? parseInt(capacity.trim(), 10) : null,
          registration_fee: fee.trim() ? parseFloat(fee.trim()) : 0,
        };

        await updateEventMutation.mutateAsync({ eventId: eventToEdit.id, payload });
        Alert.alert('Success', 'Event updated successfully.');
      } else {
        const payload: CreateEventPayload = {
          title: title.trim(),
          description: description.trim() || null,
          cover_image_url: coverImageUrl || null,
          event_type: eventType,
          visibility,
          start_at: startAt,
          end_at: endAt,
          location: location.trim() || null,
          capacity: capacity.trim() ? parseInt(capacity.trim(), 10) : null,
          registration_fee: fee.trim() ? parseFloat(fee.trim()) : 0,
          registration_required: true,
        };

        await createEventMutation.mutateAsync(payload);
        Alert.alert('Success', 'Event created in Draft status.');
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Operation failed';
      Alert.alert('Error', msg);
    }
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={eventToEdit ? 'Edit Event' : 'Create New Event'}
      subtitle={
        eventToEdit
          ? 'Update event details, custom picture, and schedule.'
          : 'Set up a new social, clinic, or community event.'
      }
      actions={[
        {
          label: 'Cancel',
          variant: 'secondary',
          onPress: onClose,
        },
        {
          label: eventToEdit
            ? updateEventMutation.isPending
              ? 'Saving...'
              : 'Save Changes'
            : createEventMutation.isPending
            ? 'Creating...'
            : 'Create Draft Event',
          variant: 'primary',
          onPress: handleSave,
          loading: createEventMutation.isPending || updateEventMutation.isPending,
        },
      ]}
    >
      <View style={{ gap: Spacing[4], paddingBottom: Spacing[6], paddingTop: Spacing[2] }}>
        <Input
          label="Event Title *"
          placeholder="e.g. Summer Pickleball Social"
          value={title}
          onChangeText={setTitle}
        />

        <Input
          label="Description"
          placeholder="Event details, schedule, format..."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />

        {/* Optional Event Picture Card */}
        <Card style={styles.formAssetCard}>
          <View style={styles.formAssetHeader}>
            <View style={styles.formAssetHeaderTitleRow}>
              <ImageIcon size={16} color={Colors.brand.primary} />
              <AppText variant="caption" color="secondary" style={styles.formAssetHeaderLabel}>
                EVENT PICTURE (OPTIONAL)
              </AppText>
            </View>
            <Badge
              label={coverImageUrl ? 'Custom Picture' : 'Inheriting Club Default'}
              variant={coverImageUrl ? 'success' : 'default'}
            />
          </View>

          <AppText variant="caption" color="tertiary" style={styles.formAssetDescription}>
            {coverImageUrl
              ? 'This custom picture will be displayed on this event’s cards and details.'
              : "No custom picture selected. This event will automatically use your club's default event picture."}
          </AppText>

          <View style={styles.formAssetPreviewContainer}>
            <Image
              source={
                coverImageUrl
                  ? { uri: resolveMediaUrl(coverImageUrl) }
                  : resolveEventCover(null, clubBranding)
              }
              style={styles.formAssetPreviewImage}
              resizeMode="cover"
            />
            {isUploadingCover && (
              <View style={styles.formAssetUploadingOverlay}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <AppText variant="caption" style={styles.formAssetUploadingText}>
                  Uploading picture...
                </AppText>
              </View>
            )}
          </View>

          <View style={styles.formAssetActionsRow}>
            <TouchableOpacity
              style={styles.formAssetActionBtn}
              onPress={handlePickCover}
              disabled={isUploadingCover}
              activeOpacity={0.8}
            >
              <Camera size={14} color={Colors.text.primary} />
              <AppText variant="bodySmall" style={styles.formAssetActionBtnText}>
                {coverImageUrl ? 'Replace Custom Picture' : 'Upload Custom Picture'}
              </AppText>
            </TouchableOpacity>

            {coverImageUrl && (
              <TouchableOpacity
                style={styles.formAssetResetBtn}
                onPress={handleResetCover}
                disabled={isUploadingCover}
                activeOpacity={0.8}
              >
                <RotateCcw size={14} color={Colors.text.secondary} />
                <AppText variant="bodySmall" style={styles.formAssetResetBtnText}>
                  Reset to Club Default
                </AppText>
              </TouchableOpacity>
            )}
          </View>
        </Card>

        {/* Event Type Selector */}
        <AppText style={styles.pickerLabel}>Event Type</AppText>
        <View style={styles.chipRow}>
          {(['social', 'clinic', 'community', 'special', 'other'] as EventType[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.typeChip, eventType === t && styles.typeChipActive]}
              onPress={() => setEventType(t)}
            >
              <AppText style={[styles.typeChipText, eventType === t && styles.typeChipTextActive]}>
                {EVENT_TYPE_LABELS[t]}
              </AppText>
            </TouchableOpacity>
          ))}
        </View>

        {/* Visibility Selector */}
        <AppText style={styles.pickerLabel}>Visibility & Eligibility</AppText>
        <View style={styles.chipRow}>
          {(['public', 'members_only', 'private'] as EventVisibility[]).map((v) => (
            <TouchableOpacity
              key={v}
              style={[styles.typeChip, visibility === v && styles.typeChipActive]}
              onPress={() => setVisibility(v)}
            >
              <AppText style={[styles.typeChipText, visibility === v && styles.typeChipTextActive]}>
                {EVENT_VISIBILITY_LABELS[v]}
              </AppText>
            </TouchableOpacity>
          ))}
        </View>

        <Input
          label="Location"
          placeholder="e.g. Courts 1–4, Tirupati, AP"
          value={location}
          onChangeText={setLocation}
        />

        <DateTimePickerInput
          label="Event Start Date & Time *"
          value={startAt}
          onChange={setStartAt}
        />

        <DateTimePickerInput
          label="Event End Date & Time *"
          value={endAt}
          onChange={setEndAt}
        />

        <Input
          label="Max Capacity (Leave blank for unlimited)"
          placeholder="e.g. 50"
          value={capacity}
          onChangeText={setCapacity}
          keyboardType="numeric"
        />

        <Input
          label="Registration Fee ($ USD, 0 for free)"
          placeholder="0.00"
          value={fee}
          onChangeText={setFee}
          keyboardType="numeric"
        />
      </View>
    </ModalSheet>
  );
}

// ─── Main Staff Events Screen ─────────────────────────────────────────────────

export default function ClubEventsScreen() {
  const { clubId: rawClubId } = useActiveClub();
  const { canManageEvents } = usePermission();
  const clubId = rawClubId || '';
  const { data: clubBranding } = useClubBranding(clubId);

  const [statusFilter, setStatusFilter] = useState<EventStatus | 'all'>('all');
  const [selectedRosterEvent, setSelectedRosterEvent] = useState<ClubEvent | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ClubEvent | null>(null);

  const { data: events = [], isLoading, isRefetching, refetch } = useClubEvents(
    clubId,
    statusFilter === 'all' ? undefined : { status: statusFilter },
  );

  const publishMutation = usePublishClubEvent(clubId);
  const cancelMutation = useCancelClubEvent(clubId);
  const completeMutation = useCompleteClubEvent(clubId);

  // Metrics
  const metrics = useMemo(() => {
    const total = events.length;
    const published = events.filter((e) => e.status === 'published').length;
    const completed = events.filter((e) => e.status === 'completed').length;
    const draft = events.filter((e) => e.status === 'draft').length;
    return { total, published, completed, draft };
  }, [events]);

  if (!canManageEvents) {
    return (
      <Screen style={styles.container}>
        <EmptyState
          title="Access Restricted"
          description="Only club owners and managers have permission to manage club events."
        />
      </Screen>
    );
  }

  const handlePublish = (ev: ClubEvent) => {
    Alert.alert('Publish Event', `Publish "${ev.title}"? It will become visible to players.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Publish',
        onPress: async () => {
          try {
            await publishMutation.mutateAsync(ev.id);
            refetch();
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Publish failed';
            Alert.alert('Error', msg);
          }
        },
      },
    ]);
  };

  const handleCancelEvent = (ev: ClubEvent) => {
    Alert.alert('Cancel Event', `Are you sure you want to cancel "${ev.title}"?`, [
      { text: 'Back', style: 'cancel' },
      {
        text: 'Cancel Event',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelMutation.mutateAsync(ev.id);
            refetch();
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Cancellation failed';
            Alert.alert('Error', msg);
          }
        },
      },
    ]);
  };

  const handleCompleteEvent = (ev: ClubEvent) => {
    Alert.alert('Complete Event', `Mark "${ev.title}" as completed?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete',
        onPress: async () => {
          try {
            await completeMutation.mutateAsync(ev.id);
            refetch();
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Complete failed';
            Alert.alert('Error', msg);
          }
        },
      },
    ]);
  };

  // Header content rendered inside FlatList for smooth scrolling
  const renderListHeader = () => (
    <>
      {/* 1. HERO BANNER */}
      <View style={styles.heroContainer}>
        <Image
          source={
            clubBranding?.default_event_banner_url
              ? { uri: resolveMediaUrl(clubBranding.default_event_banner_url) }
              : require('../../assets/events/hero_decor.jpg')
          }
          style={styles.heroDecorImage}
          resizeMode="cover"
        />
        <View style={styles.heroTextContainer}>
          <AppText style={styles.heroTag}>CLUB EVENTS</AppText>
          <AppText style={styles.heroTitle}>More Than a Game</AppText>
          <AppText style={styles.heroSubtitle}>
            Social nights, clinics, and community{'\n'}events to bring players together.
          </AppText>
        </View>
        <View style={styles.heroScriptContainer}>
          <AppText style={styles.heroScriptText}>
            Play{'\n'}Meet{'\n'}Belong
          </AppText>
        </View>
      </View>

      {/* 2. 4-COLUMN STATISTICS ROW */}
      <MetricGrid
        columns={4}
        valueFirst={true}
        style={styles.metricsGrid}
        metrics={[
          {
            label: 'Total',
            value: metrics.total,
            icon: <Calendar size={14} color="#475569" />,
          },
          {
            label: 'Published',
            value: metrics.published,
            variant: 'success',
            icon: <CheckCircle2 size={14} color="#18794E" />,
          },
          {
            label: 'Draft',
            value: metrics.draft,
            variant: 'warning',
            icon: <FileText size={14} color="#9A6B00" />,
          },
          {
            label: 'Completed',
            value: metrics.completed,
            variant: 'info',
            icon: <CheckCircle2 size={14} color="#2563A8" />,
          },
        ]}
      />

      {/* 3. FILTER ROW */}
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'published', label: 'Published' },
              { key: 'draft', label: 'Draft' },
              { key: 'completed', label: 'Completed' },
              { key: 'cancelled', label: 'Cancelled' },
            ] as const
          ).map((chip) => {
            const isSelected = statusFilter === chip.key;
            return (
              <TouchableOpacity
                key={chip.key}
                style={[styles.filterChip, isSelected && styles.filterChipSelected]}
                onPress={() => setStatusFilter(chip.key)}
                activeOpacity={0.7}
              >
                <AppText
                  style={[styles.filterChipText, isSelected && styles.filterChipTextSelected]}
                >
                  {chip.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity
          style={styles.filterSettingsBtn}
          onPress={() => {
            Alert.alert(
              'Filter Options',
              'Select a status filter from the tabs above to manage specific event categories.',
            );
          }}
          activeOpacity={0.7}
        >
          <SlidersHorizontal size={15} color="#102B2A" />
        </TouchableOpacity>
      </View>
    </>
  );

  // Bottom CTA card rendered in FlatList footer
  const renderListFooter = () => (
    <View style={styles.ctaCard}>
      <View style={styles.ctaIconContainer}>
        <Users size={20} color="#176B57" />
      </View>
      <View style={styles.ctaTextContainer}>
        <AppText style={styles.ctaTitle}>Host an Event</AppText>
        <AppText style={styles.ctaSubtitle}>
          Create social nights, clinics, tournaments and more to keep your community active.
        </AppText>
      </View>
      <TouchableOpacity
        style={styles.ctaButton}
        onPress={() => {
          setEditingEvent(null);
          setShowCreateModal(true);
        }}
        activeOpacity={0.8}
      >
        <AppText style={styles.ctaButtonText}>+ Create Event</AppText>
      </TouchableOpacity>
    </View>
  );

  return (
    <Screen style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F8F5" />

      {/* Top Mobile Header */}
      <AppHeader
        title="Events"
        subtitle="Organize and manage club events"
        borderless
        rightElement={
          <TouchableOpacity
            style={styles.headerCreateBtn}
            onPress={() => {
              setEditingEvent(null);
              setShowCreateModal(true);
            }}
            activeOpacity={0.8}
          >
            <AppText style={styles.headerCreateBtnText}>+ Create</AppText>
          </TouchableOpacity>
        }
      />

      {/* Main Content Area */}
      {isLoading ? (
        <LoadingState message="Loading events..." />
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderListHeader}
          ListFooterComponent={renderListFooter}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={
            <EmptyState
              title="No Events Found"
              description="Create a new event or adjust your filter selection."
            />
          }
          renderItem={({ item, index }) => (
            <EventCard
              event={item}
              index={index}
              clubBranding={clubBranding}
              onEditEvent={(ev) => {
                setEditingEvent(ev);
                setShowCreateModal(true);
              }}
              onViewRoster={(ev) => setSelectedRosterEvent(ev)}
              onPublish={handlePublish}
              onCancel={handleCancelEvent}
              onComplete={handleCompleteEvent}
              isActing={
                publishMutation.isPending ||
                cancelMutation.isPending ||
                completeMutation.isPending
              }
            />
          )}
        />
      )}

      {/* Dedicated Full-Screen/Desktop Roster Dialog */}
      <RosterModal
        visible={!!selectedRosterEvent}
        event={selectedRosterEvent}
        clubId={clubId}
        onClose={() => {
          setSelectedRosterEvent(null);
          refetch();
        }}
      />

      <CreateEventModal
        visible={showCreateModal}
        clubId={clubId}
        clubBranding={clubBranding}
        eventToEdit={editingEvent}
        onClose={() => {
          setShowCreateModal(false);
          setEditingEvent(null);
        }}
        onSuccess={refetch}
      />
    </Screen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F8F5',
  },
  listContent: {
    paddingBottom: 110,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },

  // Header Button
  headerCreateBtn: {
    backgroundColor: '#176B57',
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCreateBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // Hero Banner
  heroContainer: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 16,
    overflow: 'hidden',
    height: 125,
    backgroundColor: '#0F392D',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#194A3C',
    justifyContent: 'center',
  },
  heroDecorImage: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '46%',
    height: '100%',
  },
  heroTextContainer: {
    paddingLeft: 18,
    paddingRight: 8,
    width: '66%',
    zIndex: 2,
  },
  heroTag: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#6EE7B7',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  heroTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 25,
    letterSpacing: -0.2,
  },
  heroSubtitle: {
    fontSize: 11,
    color: '#D1FAE5',
    lineHeight: 14.5,
    marginTop: 4,
  },
  heroScriptContainer: {
    position: 'absolute',
    right: 14,
    top: 14,
    zIndex: 3,
  },
  heroScriptText: {
    color: '#D1FAE5',
    fontSize: 13.5,
    lineHeight: 16,
    fontStyle: 'italic',
    textAlign: 'right',
    opacity: 0.9,
  },

  // Metrics
  metricsGrid: {
    paddingHorizontal: 16,
    marginBottom: 14,
  },

  // Filters
  filterSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 14,
    gap: 8,
  },
  filterScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAE6',
    borderRadius: 17,
    height: 34,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipSelected: {
    backgroundColor: '#176B57',
    borderColor: '#176B57',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3D544F',
  },
  filterChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  filterSettingsBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAE6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Event Card
  eventCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardContent: {
    flexDirection: 'row',
    gap: 12,
  },

  // Left Image with dynamic date overlay
  imageContainer: {
    width: 82,
    height: 114,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#E5F5EC',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  dateBadge: {
    position: 'absolute',
    top: 5,
    left: 5,
    backgroundColor: 'rgba(16, 43, 42, 0.82)',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 5,
    alignItems: 'center',
    minWidth: 30,
  },
  dateMonth: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    lineHeight: 11,
  },
  dateDay: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 17,
  },

  // Right Info Section
  infoContainer: {
    flex: 1,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#102B2A',
    lineHeight: 18,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  moreBtn: {
    padding: 2,
  },

  // Badges Row
  badgesRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 3,
    marginBottom: 4,
  },
  typeBadge: {
    backgroundColor: '#EFF3F6',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#475569',
    letterSpacing: 0.2,
  },
  audienceBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  audienceBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // Description
  descriptionText: {
    fontSize: 11,
    color: '#657776',
    lineHeight: 14.5,
    marginBottom: 5,
  },

  // 3-Column Metadata
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
    marginBottom: 6,
    paddingTop: 2,
  },
  metaCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    minWidth: 0,
  },
  metaIcon: {
    marginTop: 2,
    flexShrink: 0,
  },
  metaTextCol: {
    flex: 1,
    minWidth: 0,
  },
  metaPrimaryText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#102B2A',
    lineHeight: 13,
  },
  metaSecondaryText: {
    fontSize: 9,
    color: '#657776',
    lineHeight: 12,
  },

  // Card Footer Row
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2',
  },
  feeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  feeLabel: {
    fontSize: 10.5,
    color: '#657776',
  },
  feeValue: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#18794E',
  },
  cardActionBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAE6',
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActionBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#102B2A',
  },

  // Bottom CTA
  ctaCard: {
    backgroundColor: '#EDF7F2',
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D5EAE0',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ctaIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#D9EFE4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
  },
  ctaTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  ctaTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102B2A',
    marginBottom: 2,
  },
  ctaSubtitle: {
    fontSize: 11,
    color: '#4A605A',
    lineHeight: 15,
  },
  ctaButton: {
    backgroundColor: '#176B57',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    flexShrink: 0,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },

  // Create Modal Selectors
  pickerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#102B2A',
    marginBottom: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    backgroundColor: '#FFFFFF',
  },
  typeChipActive: {
    backgroundColor: '#176B57',
    borderColor: '#176B57',
  },
  typeChipText: {
    fontSize: 12,
    color: '#657776',
    fontWeight: '500',
  },
  typeChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // ─── Roster Modal Styles ───────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalSheetContainer: {
    backgroundColor: '#F8FAF9',
    width: '100%',
    overflow: 'hidden',
  },
  modalSheetMobile: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  modalDialogDesktop: {
    maxWidth: 680,
    width: '92%',
    maxHeight: '90%',
    borderRadius: 20,
    alignSelf: 'center',
    marginVertical: 'auto',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },

  // Pinned Roster Header
  rosterHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EAEFEA',
  },
  rosterHeaderText: {
    flex: 1,
    marginRight: 12,
  },
  rosterTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#102B2A',
    lineHeight: 22,
  },
  rosterSubtitle: {
    fontSize: 12,
    color: '#5A756C',
    marginTop: 2,
  },
  rosterCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EFF5F2',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Pinned Roster Metrics
  rosterMetricsContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EAEFEA',
    gap: 8,
  },
  rosterMetricCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#F3F8F5',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E4ECE7',
  },
  rosterMetricNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: '#102B2A',
  },
  rosterMetricLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#5A756C',
    marginTop: 1,
    textAlign: 'center',
  },

  // Pinned Status Tabs
  rosterTabsSection: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EAEFEA',
    paddingVertical: 8,
  },
  rosterTabsContent: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rosterTabChip: {
    backgroundColor: '#F4F7F5',
    borderWidth: 1,
    borderColor: '#DCE7E1',
    borderRadius: 17,
    height: 34,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rosterTabChipSelected: {
    backgroundColor: '#176B57',
    borderColor: '#176B57',
  },
  rosterTabChipText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#3D544F',
  },
  rosterTabChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Staff Control Bar
  rosterControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rosterCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5A756C',
  },
  addPlayerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F4EE',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CDE5D9',
  },
  addPlayerBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#176B57',
  },

  // Manual Register Box
  manualRegisterBox: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCE7E1',
    padding: 12,
  },
  manualRegisterTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102B2A',
    marginBottom: 6,
  },

  // Scrollable Roster Container
  rosterListContainer: {
    flex: 1,
    minHeight: 200,
  },
  rosterScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 2,
  },

  // Participant Card
  participantCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  participantHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E5F3EC',
    borderWidth: 1,
    borderColor: '#CDE5D9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarInitials: {
    fontSize: 13,
    fontWeight: '800',
    color: '#176B57',
  },
  participantInfoCol: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  participantName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102B2A',
    lineHeight: 18,
  },
  participantEmail: {
    fontSize: 11.5,
    color: '#5A756C',
    marginTop: 1,
  },
  participantTimestamp: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  participantBadgeCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  participantNotesBox: {
    marginTop: 8,
    backgroundColor: '#F8FAF9',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#EAEFEA',
  },
  participantNotesText: {
    fontSize: 11,
    color: '#475569',
    fontStyle: 'italic',
  },

  // Action Buttons inside participant card
  participantActionsRow: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2',
  },
  actionButtonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionBtnAttended: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#176B57',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  actionBtnAttendedText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  actionBtnNoShow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FECDCA',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  actionBtnNoShowText: {
    color: '#B42318',
    fontSize: 11.5,
    fontWeight: '600',
  },
  actionBtnCancel: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  actionBtnCancelText: {
    color: '#64748B',
    fontSize: 11.5,
    fontWeight: '600',
  },

  actionBtnPromote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#176B57',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  actionBtnPromoteText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },

  // State Confirmation Rows (for Attended / No Show)
  statusStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusStateTagSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusStateTagSuccessText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#18794E',
  },
  statusStateTagError: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusStateTagErrorText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#B42318',
  },
  actionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 12,
  },
  actionBtnOutlineText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
  },

  cancelledNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cancelledNoticeText: {
    fontSize: 11,
    color: '#64748B',
  },
  formAssetCard: {
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: Radius.md,
    padding: Spacing[3],
    gap: Spacing[2],
  },
  formAssetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  formAssetHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  formAssetHeaderLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  formAssetDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  formAssetPreviewContainer: {
    height: 120,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.surface.default,
    position: 'relative',
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  formAssetPreviewImage: {
    width: '100%',
    height: '100%',
  },
  formAssetUploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing[1],
  },
  formAssetUploadingText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  formAssetActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginTop: Spacing[1],
  },
  formAssetActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingHorizontal: Spacing[3],
    paddingVertical: 7,
    borderRadius: Radius.sm,
  },
  formAssetActionBtnText: {
    color: Colors.text.primary,
    fontWeight: '600',
  },
  formAssetResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingHorizontal: Spacing[3],
    paddingVertical: 7,
    borderRadius: Radius.sm,
  },
  formAssetResetBtnText: {
    color: Colors.text.secondary,
    fontWeight: '500',
  },
});
