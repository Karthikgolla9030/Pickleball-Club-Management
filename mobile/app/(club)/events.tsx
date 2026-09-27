/**
 * Aught2 Pickleball — Club Events Management Screen (Phase 14 Redesign)
 *
 * Light premium sports-club management design matching reference UI:
 *   - Status bar & mobile header with hamburger, title & '+ Create Event' button
 *   - Club Information Card (Aught2 Pickleball, 'Play. Connect. Build Community.', '♛ CLUB OWNER')
 *   - Hero Banner ('CLUB EVENTS', 'More Than a Game', 'Play Meet Belong')
 *   - 4 Statistics cards in 1 row (Total, Published, Draft, Completed)
 *   - Horizontally scrollable status filter chips + settings sliders button
 *   - Horizontal Event Cards:
 *       * Left image thumbnail with dark translucent green date badge overlay
 *       * Title, status badge, type & audience badges, description
 *       * 3-column metadata (schedule, location, registered / capacity)
 *       * Entry Fee tag & 'View Roster →' / 'Edit Event →' action button
 *       * Options menu (publish, complete, cancel, roster)
 *   - Bottom 'Host an Event' CTA card with '+ Create Event' button
 *   - Full Roster Management Modal (attendance, waitlist promotion, manual add)
 *   - Create Event Modal with validation & type/visibility configuration
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Calendar,
  CheckCircle2,
  FileText,
  MapPin,
  MoreVertical,
  SlidersHorizontal,
  Tag,
  Users,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  FilterChips,
  Input,
  LoadingState,
  MetricGrid,
  ModalSheet,
  Screen,
} from '@/components';
import {
  useActiveClub,
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
} from '@/hooks';
import { Colors, Radius, Spacing } from '@/theme';
import {
  EVENT_REGISTRATION_STATUS_LABELS,
  EVENT_STATUS_LABELS,
  EVENT_TYPE_LABELS,
  EVENT_VISIBILITY_LABELS,
  type ClubEvent,
  type CreateEventPayload,
  type EventRegistration,
  type EventRegistrationStatus,
  type EventStatus,
  type EventType,
  type EventVisibility,
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

function getEventCardImage(event: ClubEvent, index: number) {
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

function getRegStatusBadgeVariant(
  status: EventRegistrationStatus,
): 'success' | 'warning' | 'error' | 'info' | 'default' {
  switch (status) {
    case 'attended':
    case 'registered':
      return 'success';
    case 'waitlisted':
      return 'warning';
    case 'no_show':
    case 'cancelled':
    default:
      return 'error';
  }
}

// ─── Event Card Component ─────────────────────────────────────────────────────

function EventCard({
  event,
  index,
  onViewRoster,
  onPublish,
  onCancel,
  onComplete,
  isActing,
}: {
  event: ClubEvent;
  index: number;
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
  const cardImg = getEventCardImage(event, index);

  const feeDisplay =
    Number(event.registration_fee) > 0
      ? `₹${Number(event.registration_fee)}`
      : 'Free';

  const handleOptionsPress = () => {
    const options: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
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

  // Status badge styles
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

  // Audience badge style
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
            <AppText style={styles.cardTitle}>
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

          {/* Description */}
          <AppText style={styles.descriptionText}>
            {event.description ||
              'Free demo day for local residents to try pickleball and tour facilities.'}
          </AppText>

          {/* 3-Column Metadata Row */}
          <View style={styles.metaRow}>
            {/* Col 1: Schedule */}
            <View style={styles.metaCol}>
              <Calendar size={12} color="#657776" style={styles.metaIcon} />
              <View style={styles.metaTextCol}>
                <AppText style={styles.metaPrimaryText}>
                  {schedule.date}
                </AppText>
                <AppText style={styles.metaSecondaryText}>
                  {schedule.time}
                </AppText>
              </View>
            </View>

            {/* Col 2: Location */}
            <View style={styles.metaCol}>
              <MapPin size={12} color="#657776" style={styles.metaIcon} />
              <View style={styles.metaTextCol}>
                <AppText style={styles.metaPrimaryText}>
                  {loc.court}
                </AppText>
                <AppText style={styles.metaSecondaryText}>
                  {loc.city}
                </AppText>
              </View>
            </View>

            {/* Col 3: Capacity */}
            <View style={styles.metaCol}>
              <Users size={12} color="#657776" style={styles.metaIcon} />
              <View style={styles.metaTextCol}>
                <AppText style={styles.metaPrimaryText}>
                  {event.registered_count} / {event.capacity ?? 50}
                </AppText>
                <AppText style={styles.metaSecondaryText}>
                  registered
                </AppText>
              </View>
            </View>
          </View>

          {/* Bottom Action Row */}
          <View style={styles.cardFooterRow}>
            {/* Left: Entry Fee */}
            <View style={styles.feeGroup}>
              <Tag size={12} color="#657776" />
              <AppText style={styles.feeLabel}>Entry Fee</AppText>
              <AppText style={styles.feeValue}>{feeDisplay}</AppText>
            </View>

            {/* Right: Action Button */}
            <TouchableOpacity
              style={styles.cardActionBtn}
              onPress={() => (isDraft ? handleOptionsPress() : onViewRoster(event))}
              activeOpacity={0.75}
            >
              <AppText style={styles.cardActionBtnText}>
                {isDraft ? 'Edit Event →' : 'View Roster →'}
              </AppText>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Roster Modal ─────────────────────────────────────────────────────────────

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
  const [filterStatus, setFilterStatus] = useState<EventRegistrationStatus | 'all'>('all');
  const [manualUserId, setManualUserId] = useState('');
  const [showManualRegister, setShowManualRegister] = useState(false);

  const eventId = event?.id || '';

  const { data: registrations = [], isLoading, refetch } = useEventRegistrations(
    clubId,
    eventId,
    filterStatus === 'all' ? undefined : filterStatus,
  );

  const markAttendanceMutation = useStaffMarkAttendance(clubId, eventId);
  const cancelRegMutation = useStaffCancelRegistration(clubId, eventId);
  const promoteMutation = useStaffPromoteWaitlisted(clubId, eventId);
  const registerPlayerMutation = useStaffRegisterPlayer(clubId, eventId);

  const filteredRegistrations = useMemo(() => {
    if (filterStatus === 'all') return registrations;
    return registrations.filter((r) => r.status === filterStatus);
  }, [registrations, filterStatus]);

  const handleManualRegister = async () => {
    if (!manualUserId.trim()) {
      Alert.alert('Error', 'Please enter a valid User UUID');
      return;
    }
    try {
      await registerPlayerMutation.mutateAsync({
        user_id: manualUserId.trim(),
      });
      setManualUserId('');
      setShowManualRegister(false);
      refetch();
      Alert.alert('Success', 'Player registered successfully');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to register player';
      Alert.alert('Registration Failed', msg);
    }
  };

  const handleCancelRegistration = (reg: EventRegistration) => {
    Alert.alert(
      'Cancel Registration',
      `Cancel registration for ${reg.user_name || reg.user_email || 'this player'}? If registered, earliest waitlisted player will be auto-promoted.`,
      [
        { text: 'Back', style: 'cancel' },
        {
          text: 'Cancel Spot',
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
      ],
    );
  };

  if (!event) return null;

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={event.title}
      subtitle="Participant Roster"
      actions={[
        {
          label: 'Close',
          variant: 'secondary',
          onPress: onClose,
        },
      ]}
    >
      <View style={{ gap: Spacing[3], paddingBottom: Spacing[4] }}>
        {/* Stats Row */}
        <View style={styles.rosterStatsRow}>
          <View style={styles.rosterStat}>
            <AppText style={styles.rosterStatValue}>{event.registered_count}</AppText>
            <AppText style={styles.rosterStatLabel}>Registered</AppText>
          </View>
          <View style={styles.rosterStat}>
            <AppText style={styles.rosterStatValue}>{event.waitlisted_count}</AppText>
            <AppText style={styles.rosterStatLabel}>Waitlist</AppText>
          </View>
          <View style={styles.rosterStat}>
            <AppText style={styles.rosterStatValue}>{event.attended_count}</AppText>
            <AppText style={styles.rosterStatLabel}>Attended</AppText>
          </View>
          <View style={styles.rosterStat}>
            <AppText style={styles.rosterStatValue}>{event.no_show_count}</AppText>
            <AppText style={styles.rosterStatLabel}>No Show</AppText>
          </View>
        </View>

        {/* Filter Chips */}
        <FilterChips<EventRegistrationStatus | 'all'>
          chips={[
            { key: 'all', label: 'All' },
            { key: 'registered', label: 'Registered' },
            { key: 'waitlisted', label: 'Waitlisted' },
            { key: 'attended', label: 'Attended' },
            { key: 'no_show', label: 'No Show' },
            { key: 'cancelled', label: 'Cancelled' },
          ]}
          activeChip={filterStatus}
          onChipPress={setFilterStatus}
        />

        {/* Action Bar */}
        <View style={styles.rosterActionBar}>
          <Button
            label={showManualRegister ? 'Cancel Add' : '+ Add Player'}
            variant="secondary"
            size="sm"
            fullWidth={false}
            onPress={() => setShowManualRegister(!showManualRegister)}
          />
        </View>

        {showManualRegister && (
          <Card style={styles.manualRegisterCard}>
            <AppText style={styles.manualRegisterTitle}>Staff Manual Registration</AppText>
            <Input
              label="Player User UUID"
              placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
              value={manualUserId}
              onChangeText={setManualUserId}
              autoCapitalize="none"
            />
            <Button
              label="Register Player"
              variant="primary"
              size="sm"
              loading={registerPlayerMutation.isPending}
              onPress={handleManualRegister}
              style={{ marginTop: Spacing[2] }}
            />
          </Card>
        )}

        {/* Registrations List */}
        {isLoading ? (
          <LoadingState message="Loading participants..." />
        ) : filteredRegistrations.length === 0 ? (
          <EmptyState
            title="No Registrations"
            description="No players found for the selected filter."
          />
        ) : (
          filteredRegistrations.map((item) => (
            <Card key={item.id} style={styles.regCard}>
              <View style={styles.regCardHeader}>
                <View style={{ flex: 1 }}>
                  <AppText style={styles.regUserName}>
                    {item.user_name || item.user_email || 'Unknown User'}
                  </AppText>
                  {item.user_email && item.user_name ? (
                    <AppText style={styles.regUserEmail}>{item.user_email}</AppText>
                  ) : null}
                  <AppText style={styles.regTimestamp}>
                    Registered: {formatDate(item.registered_at)}
                  </AppText>
                </View>
                <Badge
                  label={EVENT_REGISTRATION_STATUS_LABELS[item.status] || item.status}
                  variant={getRegStatusBadgeVariant(item.status)}
                />
              </View>

              {/* Actions per registration status */}
              <View style={styles.regActions}>
                {item.status === 'registered' && (
                  <>
                    <Button
                      label="Attended"
                      variant="primary"
                      size="sm"
                      fullWidth={false}
                      onPress={() =>
                        markAttendanceMutation.mutate({
                          registrationId: item.id,
                          attended: true,
                        })
                      }
                    />
                    <Button
                      label="No Show"
                      variant="secondary"
                      size="sm"
                      fullWidth={false}
                      onPress={() =>
                        markAttendanceMutation.mutate({
                          registrationId: item.id,
                          attended: false,
                        })
                      }
                    />
                    <Button
                      label="Cancel"
                      variant="ghost"
                      size="sm"
                      fullWidth={false}
                      onPress={() => handleCancelRegistration(item)}
                    />
                  </>
                )}

                {item.status === 'waitlisted' && (
                  <>
                    <Button
                      label="Promote"
                      variant="primary"
                      size="sm"
                      fullWidth={false}
                      onPress={() => promoteMutation.mutate(item.id)}
                    />
                    <Button
                      label="Cancel"
                      variant="ghost"
                      size="sm"
                      fullWidth={false}
                      onPress={() => handleCancelRegistration(item)}
                    />
                  </>
                )}
              </View>
            </Card>
          ))
        )}
      </View>
    </ModalSheet>
  );
}

// ─── Create Event Modal ───────────────────────────────────────────────────────

function CreateEventModal({
  visible,
  clubId,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  clubId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventType, setEventType] = useState<EventType>('social');
  const [visibility, setVisibility] = useState<EventVisibility>('public');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState('');
  const [fee, setFee] = useState('');
  const [daysAhead, setDaysAhead] = useState('7');

  const createEventMutation = useCreateClubEvent(clubId);

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Validation Error', 'Event title is required.');
      return;
    }

    const days = parseInt(daysAhead, 10) || 7;
    const now = new Date();
    const startAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);

    const payload: CreateEventPayload = {
      title: title.trim(),
      description: description.trim() || null,
      event_type: eventType,
      visibility,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      location: location.trim() || null,
      capacity: capacity.trim() ? parseInt(capacity.trim(), 10) : null,
      registration_fee: fee.trim() ? parseFloat(fee.trim()) : 0,
      registration_required: true,
    };

    try {
      await createEventMutation.mutateAsync(payload);
      Alert.alert('Success', 'Event created in Draft status.');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Creation failed';
      Alert.alert('Creation Failed', msg);
    }
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Create New Event"
      subtitle="Set up a new social, clinic, or community event."
      actions={[
        {
          label: 'Cancel',
          variant: 'secondary',
          onPress: onClose,
        },
        {
          label: 'Create Draft Event',
          variant: 'primary',
          onPress: handleCreate,
          loading: createEventMutation.isPending,
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

        <Input
          label="Days From Now"
          placeholder="7"
          value={daysAhead}
          onChangeText={setDaysAhead}
          keyboardType="numeric"
        />

        <Input
          label="Max Capacity (Leave blank for unlimited)"
          placeholder="e.g. 50"
          value={capacity}
          onChangeText={setCapacity}
          keyboardType="numeric"
        />

        <Input
          label="Registration Fee (₹, 0 for free)"
          placeholder="0"
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

  const [statusFilter, setStatusFilter] = useState<EventStatus | 'all'>('all');
  const [selectedRosterEvent, setSelectedRosterEvent] = useState<ClubEvent | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

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
          source={require('../../assets/events/hero_decor.jpg')}
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

      {/* 3. 4-COLUMN STATISTICS ROW */}
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

      {/* 4. FILTER ROW */}
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
              'Select a status filter from the tabs above or sort by schedule.',
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
        onPress={() => setShowCreateModal(true)}
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
            onPress={() => setShowCreateModal(true)}
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

      {/* Modals */}
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
        onClose={() => setShowCreateModal(false)}
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
  },

  // Header Button
  headerCreateBtn: {
    backgroundColor: '#176B57',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCreateBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  // Club Card
  clubCardWrapper: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
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
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
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
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 16,
  },
  cardActionBtnText: {
    fontSize: 11,
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

  // Roster Modal Styles
  rosterStatsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    padding: 12,
    justifyContent: 'space-around',
  },
  rosterStat: {
    alignItems: 'center',
  },
  rosterStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#102B2A',
  },
  rosterStatLabel: {
    fontSize: 11,
    color: '#657776',
    marginTop: 2,
  },
  rosterActionBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  manualRegisterCard: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2EAE6',
  },
  manualRegisterTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#102B2A',
    marginBottom: 8,
  },
  regCard: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    marginBottom: 8,
  },
  regCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  regUserName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#102B2A',
  },
  regUserEmail: {
    fontSize: 12,
    color: '#657776',
    marginTop: 1,
  },
  regTimestamp: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
  },
  regActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    justifyContent: 'flex-end',
  },
});
