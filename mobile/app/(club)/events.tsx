/**
 * Aught2 Pickleball — Club Events Management Page
 *
 * Implements the approved compact mobile UI reference:
 *   - Clean mobile header with hamburger, title & '+ Create' button
 *   - Promotional Hero Banner ('More Than a Game', 'CLUB EVENTS')
 *   - 4 Dynamic Statistics cards (Total, Published, Draft, Completed)
 *   - Compact status filter pills (All, Published, Draft, Completed) + settings button
 *   - Compact Event Cards matching reference design:
 *       * Left: Thumbnail with dynamic date badge overlay ('NOV 4')
 *       * Right: Title, Status badge, 3-dot overflow menu
 *       * Badges: Event category & visibility pills
 *       * Schedule: Date ('Tue, 4 Nov 2026') & Time ('09:00 AM – 11:00 AM')
 *       * Bottom-right: 'View Details →' pill CTA
 *   - Tap card or 'View Details →' to navigate to dedicated Event Details page
 *   - 3-dot menu provides Edit, View Roster, Publish, Complete, and Cancel actions
 *   - Reuses shared EventRosterModal (strictly without Add Player button) and CreateEventModal
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
import { useRouter } from 'expo-router';
import {
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  MoreVertical,
  SlidersHorizontal,
  Users,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  CreateEventModal,
  EmptyState,
  EventRosterModal,
  LoadingState,
  MetricGrid,
  Screen,
} from '@/components';
import {
  useActiveClub,
  useCancelClubEvent,
  useClubBranding,
  useClubEvents,
  useCompleteClubEvent,
  usePermission,
  usePublishClubEvent,
} from '@/hooks';
import { resolveEventCover } from '@/utils/imageResolution';
import {
  EVENT_STATUS_LABELS,
  EVENT_TYPE_LABELS,
  EVENT_VISIBILITY_LABELS,
  type ClubBranding,
  type ClubEvent,
  type EventStatus,
} from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Compact Event Card Component ─────────────────────────────────────────────

function CompactEventCard({
  event,
  clubBranding,
  onViewDetails,
  onEditEvent,
  onViewRoster,
  onPublish,
  onCancel,
  onComplete,
}: {
  event: ClubEvent;
  clubBranding?: ClubBranding | null;
  onViewDetails: (event: ClubEvent) => void;
  onEditEvent: (event: ClubEvent) => void;
  onViewRoster: (event: ClubEvent) => void;
  onPublish: (event: ClubEvent) => void;
  onCancel: (event: ClubEvent) => void;
  onComplete: (event: ClubEvent) => void;
}) {
  const isDraft = event.status === 'draft';
  const isPublished = event.status === 'published';
  const isCompleted = event.status === 'completed';

  const thumbnailDate = getEventThumbnailDate(event.start_at);
  const schedule = formatEventSchedule(event.start_at, event.end_at);
  const cardImg = resolveEventCover(event, clubBranding);

  const handleOptionsPress = () => {
    const options: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: 'View Details', onPress: () => onViewDetails(event) },
      { text: 'View Roster', onPress: () => onViewRoster(event) },
      { text: 'Edit Event', onPress: () => onEditEvent(event) },
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
    <TouchableOpacity
      style={styles.eventCard}
      onPress={() => onViewDetails(event)}
      activeOpacity={0.85}
    >
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
            <AppText style={styles.cardTitle} numberOfLines={1}>
              {event.title}
            </AppText>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <AppText style={[styles.statusBadgeText, { color: statusStyle.text }]}>
                {EVENT_STATUS_LABELS[event.status]?.toUpperCase() || event.status.toUpperCase()}
              </AppText>
            </View>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation?.();
                handleOptionsPress();
              }}
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

          {/* Date Row */}
          <View style={styles.scheduleRow}>
            <Calendar size={13} color="#102B2A" style={styles.scheduleIcon} />
            <AppText style={styles.scheduleText} numberOfLines={1}>
              {schedule.date}
            </AppText>
          </View>

          {/* Time Row */}
          <View style={styles.scheduleRow}>
            <Clock size={13} color="#102B2A" style={styles.scheduleIcon} />
            <AppText style={styles.scheduleText} numberOfLines={1}>
              {schedule.time}
            </AppText>
          </View>

          {/* Bottom Right CTA */}
          <View style={styles.cardFooterRow}>
            <View style={styles.viewDetailsBtn}>
              <AppText style={styles.viewDetailsBtnText}>View Details →</AppText>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Staff Events Screen ─────────────────────────────────────────────────

export default function ClubEventsScreen() {
  const router = useRouter();
  const { clubId: rawClubId } = useActiveClub();
  const { canManageEvents } = usePermission();
  const clubId = rawClubId || '';
  const { data: clubBranding } = useClubBranding(clubId);

  const [statusFilter, setStatusFilter] = useState<EventStatus | 'all'>('all');
  const [selectedRosterEvent, setSelectedRosterEvent] = useState<ClubEvent | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ClubEvent | null>(null);

  // Fetch all events for accurate persistent metric cards
  const { data: allEvents = [], isLoading, isRefetching, refetch } = useClubEvents(clubId);

  const publishMutation = usePublishClubEvent(clubId);
  const cancelMutation = useCancelClubEvent(clubId);
  const completeMutation = useCompleteClubEvent(clubId);

  // Compute 4-metric statistics from actual persisted events
  const metrics = useMemo(() => {
    let published = 0;
    let draft = 0;
    let completed = 0;
    let cancelled = 0;

    for (const ev of allEvents) {
      if (ev.status === 'published') published++;
      else if (ev.status === 'draft') draft++;
      else if (ev.status === 'completed') completed++;
      else if (ev.status === 'cancelled') cancelled++;
    }

    return {
      total: allEvents.length,
      published,
      draft,
      completed,
      cancelled,
    };
  }, [allEvents]);

  // Filter events according to active status chip
  const filteredEvents = useMemo(() => {
    if (statusFilter === 'all') return allEvents;
    return allEvents.filter((e) => e.status === statusFilter);
  }, [allEvents, statusFilter]);

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

  const handleViewDetails = (ev: ClubEvent) => {
    router.push({
      pathname: '/(club)/event-details' as any,
      params: { id: ev.id, eventId: ev.id, clubId },
    });
  };

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
              ? { uri: clubBranding.default_event_banner_url }
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
          <View style={styles.heroAccentBar} />
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
          data={filteredEvents}
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
          renderItem={({ item }) => (
            <CompactEventCard
              event={item}
              clubBranding={clubBranding}
              onViewDetails={handleViewDetails}
              onEditEvent={(ev) => {
                setEditingEvent(ev);
                setShowCreateModal(true);
              }}
              onViewRoster={(ev) => setSelectedRosterEvent(ev)}
              onPublish={handlePublish}
              onCancel={handleCancelEvent}
              onComplete={handleCompleteEvent}
            />
          )}
        />
      )}

      {/* Dedicated Roster Dialog (strictly without Add Player button) */}
      <EventRosterModal
        visible={!!selectedRosterEvent}
        event={selectedRosterEvent}
        clubId={clubId}
        onClose={() => {
          setSelectedRosterEvent(null);
          refetch();
        }}
      />

      {/* Create / Edit Event Modal */}
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
    backgroundColor: '#0F382E',
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
  heroAccentBar: {
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#10B981',
    marginTop: 6,
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
    opacity: 0.85,
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

  // Redesigned Compact Event Card
  eventCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
  },
  cardContent: {
    flexDirection: 'row',
    gap: 12,
  },

  // Left Image with dynamic date overlay
  imageContainer: {
    width: 94,
    height: 112,
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
    top: 6,
    left: 6,
    backgroundColor: 'rgba(16, 43, 42, 0.85)',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 6,
    alignItems: 'center',
    minWidth: 32,
  },
  dateMonth: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    lineHeight: 11,
  },
  dateDay: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
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
    fontSize: 15.5,
    fontWeight: '700',
    color: '#102B2A',
    lineHeight: 19,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 5,
  },
  statusBadgeText: {
    fontSize: 9.5,
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
    marginTop: 2,
    marginBottom: 4,
  },
  typeBadge: {
    backgroundColor: '#EFF3F6',
    paddingHorizontal: 6,
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
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  audienceBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // Schedule Rows
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 1,
  },
  scheduleIcon: {
    flexShrink: 0,
  },
  scheduleText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1F2937',
    lineHeight: 16,
    flex: 1,
  },

  // Card Footer Row
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  viewDetailsBtn: {
    backgroundColor: '#E5F5EC',
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewDetailsBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#176B57',
  },

  // Bottom CTA
  ctaCard: {
    backgroundColor: '#EDF7F2',
    marginHorizontal: 16,
    marginTop: 6,
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
});
