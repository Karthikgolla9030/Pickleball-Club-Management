/**
 * Aught2 Pickleball — Club Courts Management Screen
 * Exact Reference Implementation matching provided visual specification.
 *
 * Visual hierarchy:
 *   - Top unified header: [☰ Menu] Courts / Manage your club courts | [+ Add Court]
 *   - Segmented switcher: [Schedule | MANAGEMENT] (Schedule on Left, Management on Right, Management active)
 *   - Statistics row: [Total Courts] [Active] [Inactive] in one balanced horizontal row
 *   - Search + Filter row: Search field with icon + Filter button with sliders icon
 *   - Horizontal Court Cards:
 *       * Left: Court photo thumbnail with overlaid dark #1 court badge
 *       * Right: Court title, status pill (Active/Inactive), three-dot menu,
 *                metadata (Indoor/Outdoor, Surface type, Location),
 *                action buttons (Edit + Deactivate/Activate)
 *   - Modals: Add Court, Edit Court, Deactivation Confirmation, Court Action Sheet, Filters
 *   - Retains CourtSchedule component when Schedule tab is selected
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import {
  Calendar,
  Search,
  SlidersHorizontal,
  Plus,
  Pencil,
  Power,
  Play,
  MoreVertical,
  MapPin,
  Layers,
  Sun,
  Building2,
  ChevronUp,
  ChevronDown,
  X,
  Check,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  BookingDetailsModal,
  BookingFlowModal,
  Button,
  CourtSchedule,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  ModalSheet,
  Screen,
} from '@/components';
import { useActiveClub, useClubCourts, usePermission } from '@/hooks';
import { courtApi, bookingApi } from '@/services/api';
import { Colors, Radius, Shadows, Spacing } from '@/theme';
import type {
  Court,
  CourtCreateRequest,
  CourtEnvironment,
  CourtStatus,
  CourtUpdateRequest,
  Booking,
} from '@/types';

// ─── Image Assets ─────────────────────────────────────────────────────────────
const COURT_IMAGES = [
  require('../../assets/courts/court_1.jpg'),
  require('../../assets/courts/court_2.jpg'),
  require('../../assets/courts/court_3.jpg'),
  require('../../assets/courts/court_4.jpg'),
  require('../../assets/courts/court_5.jpg'),
];

function getCourtThumbnail(court: Court, index: number) {
  if (court.court_number && court.court_number >= 1 && court.court_number <= COURT_IMAGES.length) {
    return COURT_IMAGES[court.court_number - 1];
  }
  if (court.indoor_outdoor === 'outdoor') {
    return index % 2 === 0 ? COURT_IMAGES[1] : COURT_IMAGES[3];
  }
  return COURT_IMAGES[index % COURT_IMAGES.length];
}

function getCourtLocation(court: Court, index: number): string {
  if (court.display_name && court.display_name.trim()) {
    return court.display_name;
  }
  if (court.description && court.description.trim().length <= 25) {
    return court.description.trim();
  }
  if (court.indoor_outdoor === 'indoor') {
    return 'Main Building';
  }
  return index % 2 === 0 ? 'East Wing' : 'West Wing';
}

function getSurfaceLabel(surface: string | null): string {
  if (!surface) return 'Acrylic Surface';
  if (surface.toLowerCase().includes('surface')) return surface;
  return `${surface} Surface`;
}

// ─── Options ──────────────────────────────────────────────────────────────────
const ENVIRONMENT_OPTIONS: { value: CourtEnvironment; label: string }[] = [
  { value: 'indoor', label: 'Indoor' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'covered', label: 'Covered' },
];

const POPULAR_SURFACES = [
  'Acrylic',
  'Cushioned Acrylic',
  'Sport Court',
  'Concrete',
  'Asphalt',
];

// ─── Custom Court Glyph Icon ──────────────────────────────────────────────────
function CourtGlyph({
  size = 18,
  color = '#FFFFFF',
  strokeWidth = 1.6,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const width = size;
  const height = Math.round(size * 0.85);

  return (
    <View
      style={{
        width,
        height,
        borderWidth: strokeWidth,
        borderColor: color,
        borderRadius: 3,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      {/* Center Net Line */}
      <View
        style={{
          width: strokeWidth,
          height: '100%',
          backgroundColor: color,
        }}
      />
      {/* Left Non-Volley / Kitchen Line */}
      <View
        style={{
          position: 'absolute',
          left: '26%',
          width: strokeWidth,
          height: '62%',
          backgroundColor: color,
        }}
      />
      {/* Right Non-Volley / Kitchen Line */}
      <View
        style={{
          position: 'absolute',
          right: '26%',
          width: strokeWidth,
          height: '62%',
          backgroundColor: color,
        }}
      />
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ClubCourtsScreen() {
  const { clubId, clubName } = useActiveClub();
  const { canManageCourts } = usePermission();

  // Navigation switcher: Schedule on LEFT, Management on RIGHT (Schedule active by default)
  const [topTab, setTopTab] = useState<'schedule' | 'management'>('schedule');

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterEnv, setFilterEnv] = useState<'all' | 'indoor' | 'outdoor' | 'covered'>('all');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  // Card Action Sheet state (for 3 dots)
  const [selectedCourtForActions, setSelectedCourtForActions] = useState<Court | null>(null);

  // Create / Edit modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingCourt, setEditingCourt] = useState<Court | null>(null);
  const [deactivatingCourt, setDeactivatingCourt] = useState<Court | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formCourtNumber, setFormCourtNumber] = useState('');
  const [formEnvironment, setFormEnvironment] = useState<CourtEnvironment>('indoor');
  const [formSurface, setFormSurface] = useState('Acrylic');
  const [formDescription, setFormDescription] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Schedule modal state
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedCourtId, setSelectedCourtId] = useState<string>();
  const [selectedSlot, setSelectedSlot] = useState<string>();
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  // Data fetching
  const {
    courts: allCourts,
    isLoading,
    isError,
    error,
    refetch: refetchAll,
    isRefetching,
    createCourt,
    reorderCourts,
  } = useClubCourts(clubId);

  // Computed live statistics
  const totalCount = allCourts.length;
  const activeCount = useMemo(() => allCourts.filter((c) => c.is_active).length, [allCourts]);
  const inactiveCount = totalCount - activeCount;

  // Sorted list of courts
  const sortedAllCourts = useMemo(
    () => [...allCourts].sort((a, b) => a.display_order - b.display_order),
    [allCourts]
  );

  // Filtered list based on search and filters
  const displayedCourts = useMemo(() => {
    return sortedAllCourts.filter((court) => {
      if (filterStatus === 'active' && !court.is_active) return false;
      if (filterStatus === 'inactive' && court.is_active) return false;
      if (filterEnv !== 'all' && court.indoor_outdoor !== filterEnv) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = court.name.toLowerCase().includes(q);
        const matchDisplay = court.display_name?.toLowerCase().includes(q) || false;
        const matchDesc = court.description?.toLowerCase().includes(q) || false;
        const matchSurface = court.surface_type?.toLowerCase().includes(q) || false;
        const matchEnv = court.indoor_outdoor.toLowerCase().includes(q);
        const matchNumber = court.court_number !== null ? String(court.court_number).includes(q) : false;
        return matchName || matchDisplay || matchDesc || matchSurface || matchEnv || matchNumber;
      }
      return true;
    });
  }, [sortedAllCourts, filterStatus, filterEnv, searchQuery]);

  // Form Handlers
  const openCreateModal = () => {
    setFormName('');
    setFormDisplayName('');
    setFormCourtNumber(totalCount > 0 ? String(totalCount + 1) : '1');
    setFormEnvironment('indoor');
    setFormSurface('Acrylic');
    setFormDescription('');
    setFormPrice('');
    setFormError(null);
    setIsCreateModalOpen(true);
  };

  const openEditModal = (court: Court) => {
    setEditingCourt(court);
    setFormName(court.name);
    setFormDisplayName(court.display_name || '');
    setFormCourtNumber(court.court_number !== null ? String(court.court_number) : '');
    setFormEnvironment(court.indoor_outdoor);
    setFormSurface(court.surface_type || 'Acrylic');
    setFormDescription(court.description || '');
    setFormPrice(court.price_per_hour !== null && court.price_per_hour !== undefined ? String(court.price_per_hour) : '');
    setFormError(null);
  };

  const handleCreateSubmit = async () => {
    if (!formName.trim()) {
      setFormError('Court name is required');
      return;
    }
    let parsedPrice: number | null = null;
    if (formPrice.trim()) {
      const num = parseFloat(formPrice.trim());
      if (isNaN(num) || num < 0) {
        setFormError('Price must be a valid non-negative amount (₹)');
        return;
      }
      parsedPrice = Math.round(num * 100) / 100;
    }
    setFormError(null);
    setIsSubmitting(true);
    try {
      const payload: CourtCreateRequest = {
        name: formName.trim(),
        display_name: formDisplayName.trim() || null,
        court_number: formCourtNumber.trim() ? parseInt(formCourtNumber.trim(), 10) : null,
        indoor_outdoor: formEnvironment,
        surface_type: formSurface.trim() || null,
        description: formDescription.trim() || null,
        price_per_hour: parsedPrice,
      };
      await createCourt(payload);
      setIsCreateModalOpen(false);
      refetchAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create court';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!editingCourt || !clubId) return;
    if (!formName.trim()) {
      setFormError('Court name is required');
      return;
    }
    let parsedPrice: number | null = null;
    if (formPrice.trim()) {
      const num = parseFloat(formPrice.trim());
      if (isNaN(num) || num < 0) {
        setFormError('Price must be a valid non-negative amount (₹)');
        return;
      }
      parsedPrice = Math.round(num * 100) / 100;
    }
    setFormError(null);
    setIsSubmitting(true);
    try {
      const payload: CourtUpdateRequest = {
        name: formName.trim(),
        display_name: formDisplayName.trim() || null,
        court_number: formCourtNumber.trim() ? parseInt(formCourtNumber.trim(), 10) : null,
        indoor_outdoor: formEnvironment,
        surface_type: formSurface.trim() || null,
        description: formDescription.trim() || null,
        price_per_hour: parsedPrice,
      };
      await courtApi.updateCourt(clubId, editingCourt.id, payload);
      setEditingCourt(null);
      refetchAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update court';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (court: Court) => {
    if (!clubId) return;
    try {
      await courtApi.deactivateCourt(clubId, court.id);
      setDeactivatingCourt(null);
      refetchAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to deactivate court';
      Alert.alert('Error', msg);
    }
  };

  const handleReactivate = async (court: Court) => {
    if (!clubId) return;
    try {
      await courtApi.reactivateCourt(clubId, court.id);
      refetchAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reactivate court';
      Alert.alert('Error', msg);
    }
  };

  const handleMoveCourt = async (court: Court, direction: 'up' | 'down') => {
    if (!clubId || sortedAllCourts.length < 2) return;
    const currentIndex = sortedAllCourts.findIndex((c) => c.id === court.id);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sortedAllCourts.length) return;

    const newOrder = [...sortedAllCourts];
    const [moved] = newOrder.splice(currentIndex, 1);
    newOrder.splice(targetIndex, 0, moved);

    try {
      await reorderCourts({ court_ids: newOrder.map((c) => c.id) });
      refetchAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update court order';
      Alert.alert('Reorder Error', msg);
    }
  };

  // Schedule slot press handler
  const handleSlotPress = async (courtId: string, slotIso: string, status: string, bookingId?: string) => {
    const slotDate = new Date(slotIso);
    const now = new Date();
    const slotDay = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (slotDay < today) {
      Alert.alert('Past Date', 'You cannot book courts on finished days. Past days are only for viewing history.');
      return;
    }

    if (status === 'AVAILABLE') {
      setSelectedCourtId(courtId);
      setSelectedSlot(slotIso);
      setBookingModalVisible(true);
    } else if (status === 'BOOKED' && bookingId) {
      try {
        const booking = await bookingApi.getBooking(bookingId);
        setSelectedBooking(booking);
        setDetailsModalVisible(true);
      } catch {
        Alert.alert('Error', 'Could not load booking details.');
      }
    } else if (status === 'MAINTENANCE' || status === 'BLOCKED') {
      Alert.alert('Slot Unavailable', `This slot is currently ${status.toLowerCase()}.`);
    }
  };

  const handleBookNew = () => {
    setSelectedCourtId(undefined);
    setSelectedSlot(undefined);
    setBookingModalVisible(true);
  };

  const isFiltered = filterStatus !== 'all' || filterEnv !== 'all';

  return (
    <Screen safeArea={false} style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F8F6" />

      {/* ─── Top Unified Header ────────────────────────────────────────────── */}
      <AppHeader
        title="Courts"
        subtitle="Manage your club courts"
        borderless
        showMenu
        rightElement={
          canManageCourts ? (
            <TouchableOpacity
              style={styles.addCourtButton}
              onPress={topTab === 'management' ? openCreateModal : handleBookNew}
              activeOpacity={0.85}
              accessibilityLabel={topTab === 'management' ? 'Add Court' : 'Book Court'}
              accessibilityRole="button"
            >
              <Plus size={15} color="#FFFFFF" strokeWidth={2.5} />
              <AppText style={styles.addCourtButtonText}>
                {topTab === 'management' ? 'Add Court' : 'Book'}
              </AppText>
            </TouchableOpacity>
          ) : undefined
        }
      />

      <View style={styles.contentContainer}>
        {/* ─── Schedule / Management Switcher (Only visible to court managers) ─── */}
        {canManageCourts && (
          <View style={styles.switcherWrapper}>
            <View style={styles.switcher}>
              {/* LEFT: Schedule */}
              <TouchableOpacity
                style={[styles.switcherTab, topTab === 'schedule' && styles.switcherTabActive]}
                onPress={() => setTopTab('schedule')}
                activeOpacity={0.8}
                accessibilityRole="tab"
                accessibilityState={{ selected: topTab === 'schedule' }}
              >
                <Calendar
                  size={17}
                  color={topTab === 'schedule' ? '#FFFFFF' : '#102B2A'}
                  strokeWidth={2}
                />
                <AppText
                  style={[
                    styles.switcherTabText,
                    topTab === 'schedule' && styles.switcherTabTextActive,
                  ]}
                >
                  Schedule
                </AppText>
              </TouchableOpacity>

              {/* RIGHT: Management */}
              <TouchableOpacity
                style={[styles.switcherTab, topTab === 'management' && styles.switcherTabActive]}
                onPress={() => setTopTab('management')}
                activeOpacity={0.8}
                accessibilityRole="tab"
                accessibilityState={{ selected: topTab === 'management' }}
              >
                <CourtGlyph
                  size={17}
                  color={topTab === 'management' ? '#FFFFFF' : '#102B2A'}
                  strokeWidth={1.7}
                />
                <AppText
                  style={[
                    styles.switcherTabText,
                    topTab === 'management' && styles.switcherTabTextActive,
                  ]}
                >
                  Management
                </AppText>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ─── Schedule Tab View ───────────────────────────────────────────── */}
        {(!canManageCourts || topTab === 'schedule') ? (
          <View style={{ flex: 1 }}>
            <CourtSchedule clubId={clubId || undefined} onSlotPress={handleSlotPress} />
          </View>
        ) : (
          /* ─── Management Tab View ─────────────────────────────────────────── */
          <View style={{ flex: 1 }}>
            {isLoading && !isRefetching ? (
              <View style={styles.centerContainer}>
                <LoadingState message="Loading club courts..." />
              </View>
            ) : isError ? (
              <View style={styles.centerContainer}>
                <ErrorState
                  title="Could Not Load Courts"
                  message={error?.message || 'Failed to load courts.'}
                  onRetry={() => refetchAll()}
                />
              </View>
            ) : (
              <FlatList
                data={displayedCourts}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                refreshControl={
                  <RefreshControl
                    refreshing={isRefetching}
                    onRefresh={refetchAll}
                    tintColor={Colors.brand.primary}
                  />
                }
                ListHeaderComponent={
                  <View style={styles.managementHeader}>
                    {/* ─── Statistics Cards Row ──────────────────────────── */}
                    <View style={styles.statsRow}>
                      {/* Card 1: Total Courts */}
                      <View style={styles.statCard}>
                        <View style={styles.statIconContainerNeutral}>
                          <CourtGlyph size={18} color="#176B57" strokeWidth={1.8} />
                        </View>
                        <View style={styles.statTextCol}>
                          <AppText style={styles.statLabel} numberOfLines={1}>
                            Total Courts
                          </AppText>
                          <AppText style={styles.statValue}>{totalCount}</AppText>
                        </View>
                      </View>

                      {/* Card 2: Active */}
                      <View style={[styles.statCard, styles.statCardActiveBg]}>
                        <View style={styles.statIconContainerActive}>
                          <View style={styles.activeDot} />
                        </View>
                        <View style={styles.statTextCol}>
                          <AppText style={styles.statLabel} numberOfLines={1}>
                            Active
                          </AppText>
                          <AppText style={styles.statValue}>{activeCount}</AppText>
                        </View>
                      </View>

                      {/* Card 3: Inactive */}
                      <View style={[styles.statCard, styles.statCardInactiveBg]}>
                        <View style={styles.statIconContainerInactive}>
                          <View style={styles.inactiveRing} />
                        </View>
                        <View style={styles.statTextCol}>
                          <AppText style={styles.statLabel} numberOfLines={1}>
                            Inactive
                          </AppText>
                          <AppText style={styles.statValue}>{inactiveCount}</AppText>
                        </View>
                      </View>
                    </View>

                    {/* ─── Search + Filter Row ───────────────────────────── */}
                    <View style={styles.searchFilterRow}>
                      <View style={styles.searchContainer}>
                        <Search size={18} color="#8E9B9A" strokeWidth={2} />
                        <TextInput
                          style={styles.searchInput}
                          value={searchQuery}
                          onChangeText={setSearchQuery}
                          placeholder="Search courts..."
                          placeholderTextColor="#8E9B9A"
                          returnKeyType="search"
                          clearButtonMode="while-editing"
                          multiline={false}
                          numberOfLines={1}
                        />
                        {searchQuery.length > 0 && Platform.OS !== 'ios' && (
                          <TouchableOpacity
                            onPress={() => setSearchQuery('')}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <X size={16} color="#8E9B9A" />
                          </TouchableOpacity>
                        )}
                      </View>

                      <TouchableOpacity
                        style={[styles.filterButton, isFiltered && styles.filterButtonActive]}
                        onPress={() => setIsFilterModalOpen(true)}
                        activeOpacity={0.8}
                        accessibilityLabel="Filter courts"
                        accessibilityRole="button"
                      >
                        <SlidersHorizontal
                          size={16}
                          color={isFiltered ? '#FFFFFF' : '#176B57'}
                          strokeWidth={2}
                        />
                        <AppText
                          style={[
                            styles.filterButtonText,
                            isFiltered && styles.filterButtonTextActive,
                          ]}
                        >
                          Filter
                        </AppText>
                      </TouchableOpacity>
                    </View>
                  </View>
                }
                ListEmptyComponent={
                  <EmptyState
                    title="No Courts Found"
                    description={
                      searchQuery.trim() || isFiltered
                        ? 'No courts matched your search and filter criteria.'
                        : 'No courts have been added to this club yet.'
                    }
                  />
                }
                renderItem={({ item, index }) => {
                  const thumbnailSource = getCourtThumbnail(item, index);
                  const locationText = getCourtLocation(item, index);
                  const surfaceText = getSurfaceLabel(item.surface_type);
                  const courtNumberText =
                    item.court_number !== null ? `#${item.court_number}` : `#${index + 1}`;

                  return (
                    <View style={styles.courtCard}>
                      {/* Left: Thumbnail with overlaid badge */}
                      <View style={styles.thumbnailContainer}>
                        <Image source={thumbnailSource} style={styles.thumbnail} />
                        <View style={styles.courtBadgeOverlay}>
                          <AppText style={styles.courtBadgeText}>{courtNumberText}</AppText>
                        </View>
                      </View>

                      {/* Right: Card Details */}
                      <View style={styles.cardDetails}>
                        {/* Title Row: Court Name + Status Pill + Three Dots */}
                        <View style={styles.cardHeaderRow}>
                          <AppText style={styles.courtName} numberOfLines={1}>
                            {item.name}
                          </AppText>

                          <View style={styles.statusPillRow}>
                            {item.is_active ? (
                              <View style={styles.statusPillActive}>
                                <View style={styles.pillDotActive} />
                                <AppText style={styles.statusPillTextActive}>Active</AppText>
                              </View>
                            ) : (
                              <View style={styles.statusPillInactive}>
                                <View style={styles.pillDotInactive} />
                                <AppText style={styles.statusPillTextInactive}>Inactive</AppText>
                              </View>
                            )}

                            {canManageCourts && (
                              <TouchableOpacity
                                style={styles.threeDotButton}
                                onPress={() => setSelectedCourtForActions(item)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                accessibilityLabel={`Options for ${item.name}`}
                              >
                                <MoreVertical size={18} color="#8E9B9A" strokeWidth={2} />
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>

                        {/* Metadata Row 1: Indoor/Outdoor + Surface */}
                        <View style={styles.metadataRow1}>
                          <View style={styles.metaItem}>
                            {item.indoor_outdoor === 'indoor' ? (
                              <Building2 size={13} color="#667776" strokeWidth={2} />
                            ) : (
                              <Sun size={13} color="#667776" strokeWidth={2} />
                            )}
                            <AppText style={styles.metaText}>
                              {item.indoor_outdoor === 'indoor'
                                ? 'Indoor'
                                : item.indoor_outdoor === 'outdoor'
                                  ? 'Outdoor'
                                  : 'Covered'}
                            </AppText>
                          </View>

                          <View style={styles.metaItem}>
                            <Layers size={13} color="#667776" strokeWidth={2} />
                            <AppText style={styles.metaText} numberOfLines={1}>
                              {surfaceText}
                            </AppText>
                          </View>
                        </View>

                        {/* Metadata Row 2: Location */}
                        <View style={styles.metadataRow2}>
                          <MapPin size={13} color="#667776" strokeWidth={2} />
                          <AppText style={styles.metaText} numberOfLines={1}>
                            {locationText}
                          </AppText>
                        </View>

                        {/* Metadata Row 3: Price */}
                        <View style={styles.metadataRowPrice}>
                          <View
                            style={[
                              styles.priceBadge,
                              item.price_per_hour == null && styles.priceBadgeUnpriced,
                            ]}
                          >
                            <AppText
                              style={[
                                styles.priceBadgeText,
                                item.price_per_hour == null && styles.priceBadgeTextUnpriced,
                              ]}
                            >
                              {item.price_per_hour != null
                                ? `₹${Number(item.price_per_hour).toLocaleString('en-IN')}/hr`
                                : 'Unpriced'}
                            </AppText>
                          </View>
                        </View>

                        {/* Bottom Actions Row: Edit + Deactivate / Activate */}
                        {canManageCourts && (
                          <View style={styles.actionsRow}>
                            <TouchableOpacity
                              style={styles.editButton}
                              onPress={() => openEditModal(item)}
                              activeOpacity={0.8}
                              accessibilityLabel={`Edit ${item.name}`}
                              accessibilityRole="button"
                            >
                              <Pencil size={13} color="#176B57" strokeWidth={2} />
                              <AppText style={styles.editButtonText}>Edit</AppText>
                            </TouchableOpacity>

                            {item.is_active ? (
                              <TouchableOpacity
                                style={styles.deactivateButton}
                                onPress={() => setDeactivatingCourt(item)}
                                activeOpacity={0.8}
                                accessibilityLabel={`Deactivate ${item.name}`}
                                accessibilityRole="button"
                              >
                                <Power size={13} color="#DC2626" strokeWidth={2} />
                                <AppText style={styles.deactivateButtonText}>Deactivate</AppText>
                              </TouchableOpacity>
                            ) : (
                              <TouchableOpacity
                                style={styles.activateButton}
                                onPress={() => handleReactivate(item)}
                                activeOpacity={0.8}
                                accessibilityLabel={`Activate ${item.name}`}
                                accessibilityRole="button"
                              >
                                <Play size={13} color="#176B57" strokeWidth={2} />
                                <AppText style={styles.activateButtonText}>Activate</AppText>
                              </TouchableOpacity>
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  );
                }}
              />
            )}
          </View>
        )}
      </View>

      {/* ─── Add Court Modal ───────────────────────────────────────────────── */}
      <ModalSheet
        visible={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Add New Court"
        subtitle={`Set up a new playable court at ${clubName || 'this club'}.`}
        actions={[
          {
            label: 'Cancel',
            variant: 'secondary',
            onPress: () => setIsCreateModalOpen(false),
          },
          {
            label: 'Create Court',
            variant: 'primary',
            loading: isSubmitting,
            disabled: isSubmitting,
            onPress: handleCreateSubmit,
          },
        ]}
      >
        <View style={{ gap: Spacing[3] }}>
          {formError && (
            <View style={styles.errorBox}>
              <AppText variant="caption" style={styles.errorText}>
                {formError}
              </AppText>
            </View>
          )}

          <Input
            label="Court Name *"
            value={formName}
            onChangeText={setFormName}
            placeholder="e.g. Court 6, Stadium Court"
          />

          <Input
            label="Display Name (Optional)"
            value={formDisplayName}
            onChangeText={setFormDisplayName}
            placeholder="e.g. Center Court, North Court"
          />

          <Input
            label="Court Number (Optional)"
            value={formCourtNumber}
            onChangeText={setFormCourtNumber}
            keyboardType="numeric"
            placeholder="e.g. 6"
          />

          <Input
            label="Court Booking Price (₹ / hour)"
            value={formPrice}
            onChangeText={setFormPrice}
            keyboardType="numeric"
            placeholder="e.g. 400"
          />

          <AppText variant="caption" style={styles.fieldLabel}>
            Environment
          </AppText>
          <View style={styles.segmentRow}>
            {ENVIRONMENT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.segmentButton,
                  formEnvironment === opt.value && styles.segmentButtonActive,
                ]}
                onPress={() => setFormEnvironment(opt.value)}
              >
                <AppText
                  variant="caption"
                  style={[
                    styles.segmentButtonText,
                    formEnvironment === opt.value && styles.segmentButtonTextActive,
                  ]}
                >
                  {opt.label}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>

          <AppText variant="caption" style={styles.fieldLabel}>
            Surface Type
          </AppText>
          <View style={styles.chipsRow}>
            {POPULAR_SURFACES.map((surf) => (
              <TouchableOpacity
                key={surf}
                style={[styles.chipButton, formSurface === surf && styles.chipButtonActive]}
                onPress={() => setFormSurface(surf)}
              >
                <AppText
                  variant="caption"
                  style={[
                    styles.chipButtonText,
                    formSurface === surf && styles.chipButtonTextActive,
                  ]}
                >
                  {surf}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>

          <Input
            label="Description (Optional)"
            value={formDescription}
            onChangeText={setFormDescription}
            placeholder="e.g. Resurfaced June 2024, championship net"
            multiline
            numberOfLines={2}
          />
        </View>
      </ModalSheet>

      {/* ─── Edit Court Modal ──────────────────────────────────────────────── */}
      <ModalSheet
        visible={editingCourt !== null}
        onClose={() => setEditingCourt(null)}
        title="Edit Court"
        subtitle="Update court details and surface properties."
        actions={[
          {
            label: 'Cancel',
            variant: 'secondary',
            onPress: () => setEditingCourt(null),
          },
          {
            label: 'Save Changes',
            variant: 'primary',
            loading: isSubmitting,
            disabled: isSubmitting,
            onPress: handleEditSubmit,
          },
        ]}
      >
        <View style={{ gap: Spacing[3] }}>
          {formError && (
            <View style={styles.errorBox}>
              <AppText variant="caption" style={styles.errorText}>
                {formError}
              </AppText>
            </View>
          )}

          <Input
            label="Court Name *"
            value={formName}
            onChangeText={setFormName}
            placeholder="e.g. Court 1"
          />

          <Input
            label="Display Name (Optional)"
            value={formDisplayName}
            onChangeText={setFormDisplayName}
            placeholder="e.g. Stadium Court"
          />

          <Input
            label="Court Number (Optional)"
            value={formCourtNumber}
            onChangeText={setFormCourtNumber}
            keyboardType="numeric"
            placeholder="e.g. 1"
          />

          <Input
            label="Court Booking Price (₹ / hour)"
            value={formPrice}
            onChangeText={setFormPrice}
            keyboardType="numeric"
            placeholder="e.g. 400"
          />

          <AppText variant="caption" style={styles.fieldLabel}>
            Environment
          </AppText>
          <View style={styles.segmentRow}>
            {ENVIRONMENT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.segmentButton,
                  formEnvironment === opt.value && styles.segmentButtonActive,
                ]}
                onPress={() => setFormEnvironment(opt.value)}
              >
                <AppText
                  variant="caption"
                  style={[
                    styles.segmentButtonText,
                    formEnvironment === opt.value && styles.segmentButtonTextActive,
                  ]}
                >
                  {opt.label}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>

          <AppText variant="caption" style={styles.fieldLabel}>
            Surface Type
          </AppText>
          <View style={styles.chipsRow}>
            {POPULAR_SURFACES.map((surf) => (
              <TouchableOpacity
                key={surf}
                style={[styles.chipButton, formSurface === surf && styles.chipButtonActive]}
                onPress={() => setFormSurface(surf)}
              >
                <AppText
                  variant="caption"
                  style={[
                    styles.chipButtonText,
                    formSurface === surf && styles.chipButtonTextActive,
                  ]}
                >
                  {surf}
                </AppText>
              </TouchableOpacity>
            ))}
          </View>

          <Input
            label="Description (Optional)"
            value={formDescription}
            onChangeText={setFormDescription}
            placeholder="e.g. Lighted court with spectator seating"
            multiline
            numberOfLines={2}
          />
        </View>
      </ModalSheet>

      {/* ─── Deactivation Confirmation Dialog ──────────────────────────────── */}
      <Modal
        visible={deactivatingCourt !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setDeactivatingCourt(null)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmDialog}>
            <AppText variant="heading3" style={styles.confirmTitle}>
              Deactivate Court?
            </AppText>
            <AppText variant="body" style={styles.confirmMessage}>
              Deactivating{' '}
              <AppText variant="body" style={{ fontWeight: 'bold' }}>
                {deactivatingCourt?.name}
              </AppText>{' '}
              will hide it from players and exclude it from future bookings. You can reactivate it
              at any time.
            </AppText>

            <View style={styles.confirmButtonsRow}>
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => setDeactivatingCourt(null)}
                fullWidth={false}
                style={styles.confirmBtn}
              />
              <Button
                label="Deactivate"
                variant="danger"
                onPress={() => deactivatingCourt && handleDeactivate(deactivatingCourt)}
                fullWidth={false}
                style={styles.confirmBtn}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Three-Dot Actions Modal (Reordering & Options) ────────────────── */}
      <Modal
        visible={selectedCourtForActions !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedCourtForActions(null)}
      >
        <TouchableWithoutFeedback onPress={() => setSelectedCourtForActions(null)}>
          <View style={styles.actionSheetOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.actionSheetContainer}>
                <View style={styles.actionSheetHeader}>
                  <AppText style={styles.actionSheetTitle}>
                    {selectedCourtForActions?.name}
                  </AppText>
                  <TouchableOpacity
                    onPress={() => setSelectedCourtForActions(null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <X size={20} color="#667776" />
                  </TouchableOpacity>
                </View>

                {selectedCourtForActions && (
                  <View style={styles.actionSheetOptions}>
                    {/* Move Up */}
                    <TouchableOpacity
                      style={[
                        styles.actionSheetItem,
                        sortedAllCourts.findIndex((c) => c.id === selectedCourtForActions.id) ===
                          0 && styles.actionSheetItemDisabled,
                      ]}
                      disabled={
                        sortedAllCourts.findIndex((c) => c.id === selectedCourtForActions.id) === 0
                      }
                      onPress={() => {
                        handleMoveCourt(selectedCourtForActions, 'up');
                        setSelectedCourtForActions(null);
                      }}
                    >
                      <ChevronUp size={18} color="#176B57" />
                      <AppText style={styles.actionSheetItemText}>Move Court Up</AppText>
                    </TouchableOpacity>

                    {/* Move Down */}
                    <TouchableOpacity
                      style={[
                        styles.actionSheetItem,
                        sortedAllCourts.findIndex((c) => c.id === selectedCourtForActions.id) ===
                          sortedAllCourts.length - 1 && styles.actionSheetItemDisabled,
                      ]}
                      disabled={
                        sortedAllCourts.findIndex((c) => c.id === selectedCourtForActions.id) ===
                          sortedAllCourts.length - 1
                      }
                      onPress={() => {
                        handleMoveCourt(selectedCourtForActions, 'down');
                        setSelectedCourtForActions(null);
                      }}
                    >
                      <ChevronDown size={18} color="#176B57" />
                      <AppText style={styles.actionSheetItemText}>Move Court Down</AppText>
                    </TouchableOpacity>

                    {/* Edit */}
                    <TouchableOpacity
                      style={styles.actionSheetItem}
                      onPress={() => {
                        const target = selectedCourtForActions;
                        setSelectedCourtForActions(null);
                        openEditModal(target);
                      }}
                    >
                      <Pencil size={18} color="#176B57" />
                      <AppText style={styles.actionSheetItemText}>Edit Court Details</AppText>
                    </TouchableOpacity>

                    {/* Toggle Status */}
                    {selectedCourtForActions.is_active ? (
                      <TouchableOpacity
                        style={styles.actionSheetItem}
                        onPress={() => {
                          const target = selectedCourtForActions;
                          setSelectedCourtForActions(null);
                          setDeactivatingCourt(target);
                        }}
                      >
                        <Power size={18} color="#DC2626" />
                        <AppText style={[styles.actionSheetItemText, { color: '#DC2626' }]}>
                          Deactivate Court
                        </AppText>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.actionSheetItem}
                        onPress={() => {
                          const target = selectedCourtForActions;
                          setSelectedCourtForActions(null);
                          handleReactivate(target);
                        }}
                      >
                        <Play size={18} color="#176B57" />
                        <AppText style={styles.actionSheetItemText}>Activate Court</AppText>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ─── Filter Options Modal ──────────────────────────────────────────── */}
      <ModalSheet
        visible={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        title="Filter Courts"
        subtitle="Filter courts by active status or play environment."
        actions={[
          {
            label: 'Reset',
            variant: 'ghost',
            onPress: () => {
              setFilterStatus('all');
              setFilterEnv('all');
              setIsFilterModalOpen(false);
            },
          },
          {
            label: 'Apply Filters',
            variant: 'primary',
            onPress: () => setIsFilterModalOpen(false),
          },
        ]}
      >
        <View style={{ gap: Spacing[4] }}>
          {/* Status Filter */}
          <View>
            <AppText variant="caption" style={styles.fieldLabel}>
              Status
            </AppText>
            <View style={styles.segmentRow}>
              {(['all', 'active', 'inactive'] as const).map((st) => (
                <TouchableOpacity
                  key={st}
                  style={[styles.segmentButton, filterStatus === st && styles.segmentButtonActive]}
                  onPress={() => setFilterStatus(st)}
                >
                  <AppText
                    variant="caption"
                    style={[
                      styles.segmentButtonText,
                      filterStatus === st && styles.segmentButtonTextActive,
                    ]}
                  >
                    {st === 'all'
                      ? `All (${totalCount})`
                      : st === 'active'
                        ? `Active (${activeCount})`
                        : `Inactive (${inactiveCount})`}
                  </AppText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Environment Filter */}
          <View>
            <AppText variant="caption" style={styles.fieldLabel}>
              Environment
            </AppText>
            <View style={styles.chipsRow}>
              {(['all', 'indoor', 'outdoor', 'covered'] as const).map((env) => (
                <TouchableOpacity
                  key={env}
                  style={[styles.chipButton, filterEnv === env && styles.chipButtonActive]}
                  onPress={() => setFilterEnv(env)}
                >
                  <AppText
                    variant="caption"
                    style={[
                      styles.chipButtonText,
                      filterEnv === env && styles.chipButtonTextActive,
                    ]}
                  >
                    {env === 'all'
                      ? 'All'
                      : env === 'indoor'
                        ? 'Indoor'
                        : env === 'outdoor'
                          ? 'Outdoor'
                          : 'Covered'}
                  </AppText>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </ModalSheet>

      {/* ─── Schedule Booking Modals ───────────────────────────────────────── */}
      <BookingFlowModal
        visible={bookingModalVisible}
        onClose={() => setBookingModalVisible(false)}
        onSuccess={() => setBookingModalVisible(false)}
        mode="staff"
        clubId={clubId!}
        initialCourtId={selectedCourtId}
        initialSlot={selectedSlot}
      />

      <BookingDetailsModal
        visible={detailsModalVisible}
        onClose={() => setDetailsModalVisible(false)}
        booking={selectedBooking}
        mode="staff"
        clubId={clubId!}
      />
    </Screen>
  );
}

// ─── Stylesheet ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F4F8F6',
  },
  contentContainer: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[4],
  },

  // Top Header Add Court Button
  addCourtButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#176B57',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: Radius.full,
    shadowColor: '#176B57',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  addCourtButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  // Schedule / Management Switcher
  switcherWrapper: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 12,
  },
  switcher: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E2EAE6',
  },
  switcherTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 9,
    borderRadius: 21,
    backgroundColor: 'transparent',
  },
  switcherTabActive: {
    backgroundColor: '#176B57',
    shadowColor: '#176B57',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  switcherTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#102B2A',
  },
  switcherTabTextActive: {
    color: '#FFFFFF',
  },

  // FlatList content
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 110, // Generous padding to clear fixed AppBottomNav
    gap: 12,
  },
  managementHeader: {
    gap: 12,
    marginBottom: 4,
  },

  // Statistics row
  statsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    paddingVertical: 9,
    paddingHorizontal: 7,
    gap: 6,
    ...Shadows.sm,
  },
  statCardActiveBg: {
    backgroundColor: '#F5FCF7',
    borderColor: '#D4EBDC',
  },
  statCardInactiveBg: {
    backgroundColor: '#FFFDF7',
    borderColor: '#FDE68A',
  },
  statIconContainerNeutral: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EBF6F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statIconContainerActive: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#E5F6EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#18794E',
  },
  statIconContainerInactive: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFF3E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactiveRing: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2.5,
    borderColor: '#D97706',
    backgroundColor: 'transparent',
  },
  statTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: 10.5,
    color: '#667776',
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  statValue: {
    fontSize: 19,
    fontWeight: '700',
    color: '#102B2A',
    marginTop: 1,
  },

  // Search + Filter row
  searchFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#102B2A',
    paddingLeft: 8,
    paddingVertical: 0,
    height: '100%',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 13,
    backgroundColor: '#EBF6F1',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#D4EBDC',
  },
  filterButtonActive: {
    backgroundColor: '#176B57',
    borderColor: '#176B57',
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#176B57',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },

  // Court Card
  courtCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    padding: 10,
    flexDirection: 'row',
    gap: 10,
    ...Shadows.sm,
  },
  thumbnailContainer: {
    width: 110,
    height: 94,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#EDF2F7',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  courtBadgeOverlay: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    backgroundColor: 'rgba(16, 43, 42, 0.88)',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  courtBadgeText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  cardDetails: {
    flex: 1,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  courtName: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#102B2A',
    flex: 1,
    marginRight: 4,
  },
  statusPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  statusPillActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E5F6EC',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 12,
  },
  pillDotActive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#18794E',
  },
  statusPillTextActive: {
    fontSize: 11,
    fontWeight: '600',
    color: '#18794E',
  },
  statusPillInactive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 12,
  },
  pillDotInactive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D97706',
  },
  statusPillTextInactive: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D97706',
  },
  threeDotButton: {
    padding: 2,
  },

  // Metadata
  metadataRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
    flexWrap: 'nowrap',
  },
  metadataRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  metadataRowPrice: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  priceBadge: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  priceBadgeUnpriced: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  priceBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#15803D',
  },
  priceBadgeTextUnpriced: {
    color: '#6B7280',
    fontWeight: '500',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  metaText: {
    fontSize: 11.5,
    color: '#667776',
    fontWeight: '400',
    flexShrink: 1,
  },

  // Action Buttons Row
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 6,
  },
  editButton: {
    flex: 1,
    height: 31,
    borderRadius: 8,
    backgroundColor: '#EBF6F1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#176B57',
  },
  deactivateButton: {
    flex: 1.2,
    height: 31,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  deactivateButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  activateButton: {
    flex: 1.2,
    height: 31,
    borderRadius: 8,
    backgroundColor: '#EBF6F1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  activateButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#176B57',
  },

  // Action Sheet (for three dots)
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  actionSheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    gap: 12,
  },
  actionSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2EAE6',
  },
  actionSheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102B2A',
  },
  actionSheetOptions: {
    gap: 4,
  },
  actionSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  actionSheetItemDisabled: {
    opacity: 0.35,
  },
  actionSheetItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#102B2A',
  },

  // Modal Form Styles
  fieldLabel: {
    color: Colors.text.secondary,
    fontWeight: '600',
    marginTop: 4,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: Spacing[1],
    marginBottom: Spacing[1],
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  segmentButtonActive: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  segmentButtonText: {
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  segmentButtonTextActive: {
    color: Colors.text.inverse,
    fontWeight: '700',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[1],
    marginBottom: Spacing[1],
  },
  chipButton: {
    paddingVertical: 6,
    paddingHorizontal: Spacing[2],
    borderRadius: Radius.full,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  chipButtonActive: {
    backgroundColor: Colors.brand.primary + '25',
    borderColor: Colors.brand.primary,
  },
  chipButtonText: {
    color: Colors.text.secondary,
  },
  chipButtonTextActive: {
    color: Colors.brand.primary,
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: Colors.status.error + '20',
    padding: Spacing[2],
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.status.error,
  },
  errorText: {
    color: Colors.status.error,
  },

  // Confirm Dialog Styles
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[6],
  },
  confirmDialog: {
    backgroundColor: Colors.background.secondary,
    borderRadius: Radius.lg,
    padding: Spacing[6],
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.surface.border,
    gap: Spacing[4],
    ...Shadows.md,
  },
  confirmTitle: {
    color: Colors.text.primary,
  },
  confirmMessage: {
    color: Colors.text.secondary,
    lineHeight: 20,
  },
  confirmButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing[2],
  },
  confirmBtn: {
    minWidth: 100,
  },
});
