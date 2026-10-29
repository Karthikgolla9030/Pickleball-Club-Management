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
  ActivityIndicator,
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
  ShieldAlert,
  Camera,
  Trash2,
  UploadCloud,
  Clock,
  Timer,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

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
  TimePickerInput,
  LoadingState,
  ModalSheet,
  Screen,
} from '@/components';
import { useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/constants';
import { useActiveClub, useClubBranding, useClubCourts, usePermission } from '@/hooks';
import { courtApi, bookingApi, clubAssetsApi } from '@/services/api';
import { Colors, Radius, Shadows, Spacing } from '@/theme';
import {
  formatCurrency,
  resolveMediaUrl,
  parseTimeString,
  toCanonicalTime,
  formatTimeDisplay,
  validateOperatingTimeRange,
} from '@/utils';
import type {
  Court,
  CourtCreateRequest,
  CourtEnvironment,
  CourtStatus,
  CourtUpdateRequest,
  Booking,
  WeeklyOperatingHoursMap,
} from '@/types';

// ─── Image Assets ─────────────────────────────────────────────────────────────
const COURT_IMAGES = [
  require('../../assets/courts/court_1.jpg'),
  require('../../assets/courts/court_2.jpg'),
  require('../../assets/courts/court_3.jpg'),
  require('../../assets/courts/court_4.jpg'),
  require('../../assets/courts/court_5.jpg'),
];

function getCourtThumbnail(court: Court, index: number, hasError: boolean = false) {
  // 1. Entity-level custom image
  if (court.photo_url && !hasError) {
    return { uri: resolveMediaUrl(court.photo_url) };
  }
  // 2. Platform neutral court fallback (never club banner or logo)
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

const BOOKING_INTERVAL_OPTIONS = [
  { value: 30, label: '30 min' },
  { value: 60, label: '60 min' },
  { value: 90, label: '90 min' },
  { value: 120, label: '120 min' },
];

const WEEKDAY_KEYS = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' },
];

function parseTimeInput(input: string): { h: number; m: number; str24: string } | null {
  if (!input) return null;
  const parsed = parseTimeString(input);
  if (!parsed) return null;
  return { h: parsed.hour24, m: parsed.minute, str24: parsed.str24 };
}

function formatDisplayTime(timeStr?: string | null): string {
  if (!timeStr) return '';
  return formatTimeDisplay(timeStr, timeStr);
}

function getCourtHoursSummary(court: Court): string {
  if (court.operating_hours) {
    const hours = court.operating_hours;
    const mon = hours.monday;
    if (mon && !mon.is_closed && mon.open_time && mon.close_time) {
      return `${formatDisplayTime(mon.open_time)} – ${formatDisplayTime(mon.close_time)}`;
    }
    const allClosed = Object.values(hours).every((d) => d && d.is_closed);
    if (allClosed) return 'Closed';
    for (const d of Object.values(hours)) {
      if (d && !d.is_closed && d.open_time && d.close_time) {
        return `${formatDisplayTime(d.open_time)} – ${formatDisplayTime(d.close_time)}`;
      }
    }
  }
  return '6:00 AM – 10:00 PM';
}

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
  const queryClient = useQueryClient();
  const { clubId, clubName } = useActiveClub();
  const { canManageCourts } = usePermission();
  const { data: clubBranding } = useClubBranding(clubId || '');

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
  const [affectedBookingsCount, setAffectedBookingsCount] = useState<number | null>(null);
  const [isCheckingDisruptions, setIsCheckingDisruptions] = useState(false);

  React.useEffect(() => {
    if (deactivatingCourt && clubId) {
      setIsCheckingDisruptions(true);
      courtApi
        .getCourtAffectedBookings(clubId, deactivatingCourt.id)
        .then((res) => {
          setAffectedBookingsCount(res.upcoming_confirmed_bookings_count);
        })
        .catch(() => {
          setAffectedBookingsCount(null);
        })
        .finally(() => {
          setIsCheckingDisruptions(false);
        });
    } else {
      setAffectedBookingsCount(null);
    }
  }, [deactivatingCourt, clubId]);

  // Form State
  const [formName, setFormName] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formCourtNumber, setFormCourtNumber] = useState('');
  const [formEnvironment, setFormEnvironment] = useState<CourtEnvironment>('indoor');
  const [formSurface, setFormSurface] = useState('Acrylic');
  const [formDescription, setFormDescription] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formPhotoUrl, setFormPhotoUrl] = useState<string | null>(null);
  const [formOpeningTime, setFormOpeningTime] = useState('06:00');
  const [formClosingTime, setFormClosingTime] = useState('22:00');
  const [formInterval, setFormInterval] = useState<number>(60);
  const [formClosedDays, setFormClosedDays] = useState<Record<string, boolean>>({});
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [courtImageErrors, setCourtImageErrors] = useState<Record<string, boolean>>({});

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

  const handleRefresh = async () => {
    setCourtImageErrors({});
    await refetchAll();
  };

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

  // Photo Upload Handler
  const handlePickCourtPhoto = async () => {
    if (!clubId) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 10],
        quality: 0.85,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const pickedAsset = result.assets[0];

      // Validate allowed file size (max 5 MB)
      if (pickedAsset.fileSize && pickedAsset.fileSize > 5 * 1024 * 1024) {
        Alert.alert('File Too Large', 'Court image must be less than 5 MB.');
        return;
      }

      // Validate allowed image types
      const mime = pickedAsset.mimeType?.toLowerCase();
      if (mime && !['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(mime)) {
        Alert.alert('Unsupported Format', 'Please select a JPG, PNG, or WEBP image.');
        return;
      }

      setIsUploadingPhoto(true);
      try {
        const uploadRes = await clubAssetsApi.uploadClubMedia(
          clubId,
          {
            uri: pickedAsset.uri,
            name: pickedAsset.fileName || 'court_image.jpg',
            type: pickedAsset.mimeType || 'image/jpeg',
          },
          'court_photo',
          'court',
          editingCourt ? editingCourt.id : undefined
        );
        setFormPhotoUrl(uploadRes.public_url);
        if (editingCourt?.id) {
          setCourtImageErrors((prev) => {
            const next = { ...prev };
            delete next[editingCourt.id];
            return next;
          });
        }
      } catch (err: unknown) {
        // Keep previous image reference on failure
        const msg = err instanceof Error ? err.message : 'Photo upload failed';
        Alert.alert('Upload Error', msg);
      } finally {
        setIsUploadingPhoto(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error selecting photo';
      Alert.alert('Selection Error', msg);
    }
  };

  // Operating Hours Validation & Schedule Serializer
  const validateTimeSettings = (): {
    isValid: boolean;
    errorMsg?: string;
    operatingHours?: any;
    openingTime?: string;
    closingTime?: string;
  } => {
    const rangeRes = validateOperatingTimeRange(formOpeningTime, formClosingTime, {
      required: true,
      allowOvernight: false,
    });
    if (!rangeRes.isValid) {
      return {
        isValid: false,
        errorMsg: rangeRes.errorMsg,
      };
    }

    // Ensure at least one day is open
    const hasAtLeastOneOpenDay = WEEKDAY_KEYS.some(({ key }) => !formClosedDays[key]);
    if (!hasAtLeastOneOpenDay) {
      return {
        isValid: false,
        errorMsg: 'At least one operating day must be open for court bookings.',
      };
    }

    const weeklyHours: Record<string, any> = {};
    for (const { key } of WEEKDAY_KEYS) {
      const isClosed = Boolean(formClosedDays[key]);
      weeklyHours[key] = {
        is_closed: isClosed,
        open_time: isClosed ? null : rangeRes.openCanonical,
        close_time: isClosed ? null : rangeRes.closeCanonical,
      };
    }

    return {
      isValid: true,
      operatingHours: weeklyHours,
      openingTime: rangeRes.openCanonical,
      closingTime: rangeRes.closeCanonical,
    };
  };

  // Form Handlers
  const openCreateModal = () => {
    setFormName('');
    setFormDisplayName('');
    setFormCourtNumber(totalCount > 0 ? String(totalCount + 1) : '1');
    setFormEnvironment('indoor');
    setFormSurface('Acrylic');
    setFormDescription('');
    setFormPrice('');
    setFormPhotoUrl(null);
    setFormOpeningTime('06:00');
    setFormClosingTime('22:00');
    setFormInterval(60);
    setFormClosedDays({});
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
    setFormPhotoUrl(court.photo_url || null);
    setFormInterval(court.booking_interval_minutes || 60);

    let operatingHoursObj: any = court.operating_hours;
    if (typeof operatingHoursObj === 'string') {
      try {
        operatingHoursObj = JSON.parse(operatingHoursObj);
      } catch {
        operatingHoursObj = null;
      }
    }

    if (operatingHoursObj && typeof operatingHoursObj === 'object') {
      const closedMap: Record<string, boolean> = {};
      let foundOpen: string | null = null;
      let foundClose: string | null = null;
      for (const [day, dayCfg] of Object.entries(operatingHoursObj)) {
        if (dayCfg && typeof dayCfg === 'object') {
          const cfg = dayCfg as any;
          if (cfg.is_closed) {
            closedMap[day] = true;
          } else {
            if (cfg.open_time && !foundOpen) foundOpen = toCanonicalTime(cfg.open_time);
            if (cfg.close_time && !foundClose) foundClose = toCanonicalTime(cfg.close_time);
          }
        }
      }
      setFormClosedDays(closedMap);
      setFormOpeningTime(foundOpen || '06:00');
      setFormClosingTime(foundClose || '22:00');
    } else {
      setFormClosedDays({});
      setFormOpeningTime('06:00');
      setFormClosingTime('22:00');
      if (clubId) {
        courtApi.getCourtOperatingHours(clubId, court.id).then((res) => {
          let effHours: any = res.effective_operating_hours;
          if (typeof effHours === 'string') {
            try {
              effHours = JSON.parse(effHours);
            } catch {
              effHours = null;
            }
          }
          if (effHours && typeof effHours === 'object') {
            const closedMap: Record<string, boolean> = {};
            let fOpen: string | null = null;
            let fClose: string | null = null;
            for (const [day, dayCfg] of Object.entries(effHours)) {
              if (dayCfg && typeof dayCfg === 'object') {
                const cfg = dayCfg as any;
                if (cfg.is_closed) {
                  closedMap[day] = true;
                } else {
                  if (cfg.open_time && !fOpen) fOpen = toCanonicalTime(cfg.open_time);
                  if (cfg.close_time && !fClose) fClose = toCanonicalTime(cfg.close_time);
                }
              }
            }
            setFormClosedDays(closedMap);
            setFormOpeningTime(fOpen || '06:00');
            setFormClosingTime(fClose || '22:00');
          }
          if (res.booking_interval_minutes) {
            setFormInterval(res.booking_interval_minutes);
          }
        }).catch(() => {});
      }
    }

    setCourtImageErrors((prev) => {
      const next = { ...prev };
      delete next[court.id];
      return next;
    });
    setFormError(null);
  };

  const handleCreateSubmit = async () => {
    if (isSubmitting) return;
    if (!formName.trim()) {
      setFormError('Court name is required');
      return;
    }
    let parsedPrice: number | null = null;
    if (formPrice.trim()) {
      const num = parseFloat(formPrice.trim());
      if (isNaN(num) || num < 0) {
        setFormError('Price must be a valid non-negative amount ($)');
        return;
      }
      parsedPrice = Math.round(num * 100) / 100;
    }

    const timeVal = validateTimeSettings();
    if (!timeVal.isValid) {
      setFormError(timeVal.errorMsg || 'Invalid operating hours settings');
      return;
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
        photo_url: formPhotoUrl,
        booking_interval_minutes: formInterval,
        operating_hours: timeVal.operatingHours,
        opening_time: timeVal.openingTime,
        closing_time: timeVal.closingTime,
      };
      const created = await createCourt(payload);
      if (clubId && created) {
        try {
          queryClient.setQueriesData<Court[]>({ queryKey: ['clubs', clubId, 'courts'] }, (old) => {
            if (!old || !Array.isArray(old)) return [created];
            if (old.some((c) => c.id === created.id)) {
              return old.map((c) => (c.id === created.id ? created : c));
            }
            return [...old, created];
          });
          queryClient.setQueriesData<Court[]>({ queryKey: QUERY_KEYS.PLAYER_COURTS(clubId) }, (old) => {
            if (!old || !Array.isArray(old)) return [created];
            if (old.some((c) => c.id === created.id)) {
              return old.map((c) => (c.id === created.id ? created : c));
            }
            return [...old, created];
          });
        } catch (cacheErr) {
          console.warn('Cache sync notice:', cacheErr);
        }
        setCourtImageErrors((prev) => {
          const next = { ...prev };
          delete next[created.id];
          return next;
        });
        queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'courts'] });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_COURTS(clubId) });
        queryClient.invalidateQueries({ queryKey: ['club-active-courts', clubId] });
        queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'availability'] });
        queryClient.invalidateQueries({ queryKey: ['club-court-availability'] });
        queryClient.invalidateQueries({ queryKey: ['bookings'] });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_BOOKINGS(clubId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_STAFF_BOOKINGS(clubId) });
      }
      setIsCreateModalOpen(false);
      await refetchAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create court';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const performCourtUpdate = async (timeVal: any, parsedPrice: number | null) => {
    if (isSubmitting) return;
    if (!editingCourt || !clubId) return;
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
        photo_url: formPhotoUrl,
        booking_interval_minutes: formInterval,
        operating_hours: timeVal.operatingHours,
        opening_time: timeVal.openingTime,
        closing_time: timeVal.closingTime,
      };
      const updated = await courtApi.updateCourt(clubId, editingCourt.id, payload);
      try {
        queryClient.setQueriesData<Court[]>({ queryKey: ['clubs', clubId, 'courts'] }, (old) => {
          if (!old || !Array.isArray(old)) return old;
          return old.map((c) => (c.id === updated.id ? { ...c, ...updated } : c));
        });
        queryClient.setQueryData(QUERY_KEYS.CLUB_COURT_DETAILS(clubId, editingCourt.id), updated);
        queryClient.setQueriesData<Court[]>({ queryKey: QUERY_KEYS.PLAYER_COURTS(clubId) }, (old) => {
          if (!old || !Array.isArray(old)) return old;
          return old.map((c) => (c.id === updated.id ? { ...c, ...updated } : c));
        });
      } catch (cacheErr) {
        console.warn('Cache sync notice:', cacheErr);
      }
      setCourtImageErrors((prev) => {
        const next = { ...prev };
        delete next[editingCourt.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'courts'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_COURT_DETAILS(clubId, editingCourt.id) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_COURTS(clubId) });
      queryClient.invalidateQueries({ queryKey: ['club-active-courts', clubId] });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'availability'] });
      queryClient.invalidateQueries({ queryKey: ['club-court-availability'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_BOOKINGS(clubId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.CLUB_STAFF_BOOKINGS(clubId) });
      setEditingCourt(null);
      await refetchAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update court';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async () => {
    if (isSubmitting) return;
    if (!editingCourt || !clubId) return;
    if (!formName.trim()) {
      setFormError('Court name is required');
      return;
    }
    let parsedPrice: number | null = null;
    if (formPrice.trim()) {
      const num = parseFloat(formPrice.trim());
      if (isNaN(num) || num < 0) {
        setFormError('Price must be a valid non-negative amount ($)');
        return;
      }
      parsedPrice = Math.round(num * 100) / 100;
    }

    const timeVal = validateTimeSettings();
    if (!timeVal.isValid) {
      setFormError(timeVal.errorMsg || 'Invalid operating hours settings');
      return;
    }

    setFormError(null);

    // Schedule Disruption Safety Preview
    try {
      setIsSubmitting(true);
      const preview = await courtApi.previewCourtDisruptions(clubId, editingCourt.id, {
        operating_hours: timeVal.operatingHours,
        booking_interval_minutes: formInterval,
      });

      if (preview.affected_bookings_count > 0) {
        setIsSubmitting(false);
        Alert.alert(
          'Operating Hours Conflict',
          `${preview.message}\n\nExisting bookings, durations, and payment amounts will be preserved without modification. Do you want to apply these new hours for future bookings?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Save for Future Bookings',
              style: 'destructive',
              onPress: () => performCourtUpdate(timeVal, parsedPrice),
            },
          ]
        );
        return;
      }
    } catch {
      // If preview fails, proceed directly
    }

    await performCourtUpdate(timeVal, parsedPrice);
  };

  const handleDeactivate = async (court: Court) => {
    if (!clubId) return;
    try {
      await courtApi.deactivateCourt(clubId, court.id);
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'courts'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_COURTS(clubId) });
      queryClient.invalidateQueries({ queryKey: ['club-active-courts', clubId] });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'availability'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
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
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'courts'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_COURTS(clubId) });
      queryClient.invalidateQueries({ queryKey: ['club-active-courts', clubId] });
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'availability'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
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
                extraData={{ courts: allCourts, courtImageErrors }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                refreshControl={
                  <RefreshControl
                    refreshing={isRefetching}
                    onRefresh={handleRefresh}
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
                  const hasPhotoError = Boolean(courtImageErrors[item.id]);
                  const thumbnailSource = getCourtThumbnail(item, index, hasPhotoError);
                  const locationText = getCourtLocation(item, index);
                  const surfaceText = getSurfaceLabel(item.surface_type);
                  const courtNumberText =
                    item.court_number !== null ? `#${item.court_number}` : `#${index + 1}`;

                  return (
                    <View style={styles.courtCard}>
                      {/* Left: Thumbnail with overlaid badge */}
                      <View style={styles.thumbnailContainer}>
                        <Image
                          key={`${item.id}-${item.photo_url || 'none'}-${hasPhotoError ? 'err' : 'ok'}`}
                          source={thumbnailSource}
                          style={styles.thumbnail}
                          onError={() => {
                            if (item.id && !hasPhotoError) {
                              setCourtImageErrors((prev) => ({ ...prev, [item.id]: true }));
                            }
                          }}
                        />
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

                        {/* Metadata Row 3: Price + Operating Hours + Interval */}
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
                                ? `${formatCurrency(item.price_per_hour)}/hr`
                                : 'Unpriced'}
                            </AppText>
                          </View>

                          <View style={styles.hoursBadge}>
                            <Clock size={11} color="#176B57" strokeWidth={2} />
                            <AppText style={styles.hoursBadgeText} numberOfLines={1}>
                              {getCourtHoursSummary(item)}
                            </AppText>
                          </View>

                          <View style={styles.intervalBadge}>
                            <Timer size={11} color="#0F766E" strokeWidth={2} />
                            <AppText style={styles.intervalBadgeText}>
                              {`${item.booking_interval_minutes || 60}m slots`}
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
            disabled: isSubmitting || isUploadingPhoto,
            onPress: () => {
              if (!isUploadingPhoto) {
                setIsCreateModalOpen(false);
                setFormPhotoUrl(null);
              }
            },
          },
          {
            label: 'Create Court',
            variant: 'primary',
            loading: isSubmitting,
            disabled: isSubmitting || isUploadingPhoto,
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
            label="Court Booking Price ($ / hour)"
            value={formPrice}
            onChangeText={setFormPrice}
            keyboardType="numeric"
            placeholder="e.g. 25.00"
          />

          {/* Court Photo Upload */}
          <View style={styles.photoFieldContainer}>
            <AppText variant="caption" style={styles.fieldLabel}>
              Court Photo (Optional)
            </AppText>
            {formPhotoUrl ? (
              <View style={styles.photoPreviewWrapper}>
                <Image
                  source={{ uri: resolveMediaUrl(formPhotoUrl) }}
                  style={styles.photoPreviewImage}
                  resizeMode="cover"
                />
                <View style={styles.photoActionRow}>
                  <TouchableOpacity
                    style={styles.photoChangeButton}
                    onPress={handlePickCourtPhoto}
                    disabled={isUploadingPhoto}
                  >
                    <Camera size={13} color="#176B57" />
                    <AppText style={styles.photoChangeText}>
                      {isUploadingPhoto ? 'Uploading...' : 'Change Photo'}
                    </AppText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.photoRemoveButton}
                    onPress={() => setFormPhotoUrl(null)}
                    disabled={isUploadingPhoto}
                  >
                    <Trash2 size={13} color="#DC2626" />
                    <AppText style={styles.photoRemoveText}>Remove</AppText>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.photoUploadBox}
                onPress={handlePickCourtPhoto}
                disabled={isUploadingPhoto}
                activeOpacity={0.8}
              >
                {isUploadingPhoto ? (
                  <ActivityIndicator size="small" color="#176B57" style={{ marginBottom: 4 }} />
                ) : (
                  <UploadCloud size={24} color="#176B57" />
                )}
                <AppText style={styles.photoUploadTitle}>
                  {isUploadingPhoto ? 'Compressing & uploading photo...' : 'Upload Court Photograph'}
                </AppText>
                <AppText style={styles.photoUploadSubtitle}>
                  JPG or PNG, recommended 16:10 aspect ratio
                </AppText>
              </TouchableOpacity>
            )}
          </View>

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

          {/* Operating Hours Configuration */}
          <View style={styles.formSectionBox}>
            <View style={styles.sectionHeaderRow}>
              <Clock size={16} color="#176B57" strokeWidth={2} />
              <AppText style={styles.sectionTitle}>Operating Hours</AppText>
            </View>
            <AppText style={styles.sectionSubtitle}>
              Configure when this court begins accepting bookings and when it closes.
            </AppText>

            <View style={styles.timeInputsRow}>
              <View style={{ flex: 1 }}>
                <TimePickerInput
                  label="Opening Time *"
                  value={formOpeningTime}
                  onChange={setFormOpeningTime}
                  required
                  includeSeconds={false}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TimePickerInput
                  label="Closing Time *"
                  value={formClosingTime}
                  onChange={setFormClosingTime}
                  required
                  includeSeconds={false}
                />
              </View>
            </View>
            <AppText style={styles.timeHelpText}>
              Closing time must be later than opening time. Overnight hours are not supported.
            </AppText>

            <AppText variant="caption" style={[styles.fieldLabel, { marginTop: Spacing[2] }]}>
              Weekly Availability (Tap to toggle)
            </AppText>
            <View style={styles.dayPillsRow}>
              {WEEKDAY_KEYS.map(({ key, label }) => {
                const isClosed = Boolean(formClosedDays[key]);
                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.dayPillButton,
                      !isClosed ? styles.dayPillOpen : styles.dayPillClosed,
                    ]}
                    onPress={() => {
                      setFormClosedDays((prev) => ({
                        ...prev,
                        [key]: !prev[key],
                      }));
                    }}
                    activeOpacity={0.8}
                  >
                    <AppText
                      style={[
                        styles.dayPillText,
                        !isClosed ? styles.dayPillTextOpen : styles.dayPillTextClosed,
                      ]}
                    >
                      {label}
                    </AppText>
                    <AppText
                      style={[
                        styles.dayPillSubtext,
                        !isClosed ? styles.dayPillSubtextOpen : styles.dayPillSubtextClosed,
                      ]}
                    >
                      {!isClosed ? 'Open' : 'Closed'}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Booking Slot Interval Configuration */}
          <View style={styles.formSectionBox}>
            <View style={styles.sectionHeaderRow}>
              <Timer size={16} color="#176B57" strokeWidth={2} />
              <AppText style={styles.sectionTitle}>Booking Slot Interval</AppText>
            </View>
            <AppText style={styles.sectionSubtitle}>
              Controls available start time frequency (e.g. every 30 or 60 min).
            </AppText>

            <View style={styles.intervalGrid}>
              {BOOKING_INTERVAL_OPTIONS.map((opt) => {
                const isSelected = formInterval === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.intervalChip,
                      isSelected && styles.intervalChipSelected,
                    ]}
                    onPress={() => setFormInterval(opt.value)}
                    activeOpacity={0.8}
                  >
                    <AppText
                      style={[
                        styles.intervalChipText,
                        isSelected && styles.intervalChipTextSelected,
                      ]}
                    >
                      {opt.label}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
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
            disabled: isSubmitting || isUploadingPhoto,
            onPress: () => {
              if (!isUploadingPhoto) {
                setEditingCourt(null);
                setFormPhotoUrl(null);
              }
            },
          },
          {
            label: 'Save Changes',
            variant: 'primary',
            loading: isSubmitting,
            disabled: isSubmitting || isUploadingPhoto,
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
            label="Court Booking Price ($ / hour)"
            value={formPrice}
            onChangeText={setFormPrice}
            keyboardType="numeric"
            placeholder="e.g. 25.00"
          />

          {/* Court Photo Upload */}
          <View style={styles.photoFieldContainer}>
            <AppText variant="caption" style={styles.fieldLabel}>
              Court Photo (Optional)
            </AppText>
            {formPhotoUrl ? (
              <View style={styles.photoPreviewWrapper}>
                <Image
                  key={formPhotoUrl || 'preview'}
                  source={{ uri: resolveMediaUrl(formPhotoUrl) }}
                  style={styles.photoPreviewImage}
                  resizeMode="cover"
                />
                <View style={styles.photoActionRow}>
                  <TouchableOpacity
                    style={styles.photoChangeButton}
                    onPress={handlePickCourtPhoto}
                    disabled={isUploadingPhoto}
                  >
                    <Camera size={13} color="#176B57" />
                    <AppText style={styles.photoChangeText}>
                      {isUploadingPhoto ? 'Uploading...' : 'Change Photo'}
                    </AppText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.photoRemoveButton}
                    onPress={() => setFormPhotoUrl(null)}
                    disabled={isUploadingPhoto}
                  >
                    <Trash2 size={13} color="#DC2626" />
                    <AppText style={styles.photoRemoveText}>Remove</AppText>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.photoUploadBox}
                onPress={handlePickCourtPhoto}
                disabled={isUploadingPhoto}
                activeOpacity={0.8}
              >
                {isUploadingPhoto ? (
                  <ActivityIndicator size="small" color="#176B57" style={{ marginBottom: 4 }} />
                ) : (
                  <UploadCloud size={24} color="#176B57" />
                )}
                <AppText style={styles.photoUploadTitle}>
                  {isUploadingPhoto ? 'Compressing & uploading photo...' : 'Upload Court Photograph'}
                </AppText>
                <AppText style={styles.photoUploadSubtitle}>
                  JPG or PNG, recommended 16:10 aspect ratio
                </AppText>
              </TouchableOpacity>
            )}
          </View>

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

          {/* Operating Hours Configuration */}
          <View style={styles.formSectionBox}>
            <View style={styles.sectionHeaderRow}>
              <Clock size={16} color="#176B57" strokeWidth={2} />
              <AppText style={styles.sectionTitle}>Operating Hours</AppText>
            </View>
            <AppText style={styles.sectionSubtitle}>
              Configure when this court begins accepting bookings and when it closes.
            </AppText>

            <View style={styles.timeInputsRow}>
              <View style={{ flex: 1 }}>
                <TimePickerInput
                  label="Opening Time *"
                  value={formOpeningTime}
                  onChange={setFormOpeningTime}
                  required
                  includeSeconds={false}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TimePickerInput
                  label="Closing Time *"
                  value={formClosingTime}
                  onChange={setFormClosingTime}
                  required
                  includeSeconds={false}
                />
              </View>
            </View>
            <AppText style={styles.timeHelpText}>
              Closing time must be later than opening time. Overnight hours are not supported.
            </AppText>

            <AppText variant="caption" style={[styles.fieldLabel, { marginTop: Spacing[2] }]}>
              Weekly Availability (Tap to toggle)
            </AppText>
            <View style={styles.dayPillsRow}>
              {WEEKDAY_KEYS.map(({ key, label }) => {
                const isClosed = Boolean(formClosedDays[key]);
                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.dayPillButton,
                      !isClosed ? styles.dayPillOpen : styles.dayPillClosed,
                    ]}
                    onPress={() => {
                      setFormClosedDays((prev) => ({
                        ...prev,
                        [key]: !prev[key],
                      }));
                    }}
                    activeOpacity={0.8}
                  >
                    <AppText
                      style={[
                        styles.dayPillText,
                        !isClosed ? styles.dayPillTextOpen : styles.dayPillTextClosed,
                      ]}
                    >
                      {label}
                    </AppText>
                    <AppText
                      style={[
                        styles.dayPillSubtext,
                        !isClosed ? styles.dayPillSubtextOpen : styles.dayPillSubtextClosed,
                      ]}
                    >
                      {!isClosed ? 'Open' : 'Closed'}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Booking Slot Interval Configuration */}
          <View style={styles.formSectionBox}>
            <View style={styles.sectionHeaderRow}>
              <Timer size={16} color="#176B57" strokeWidth={2} />
              <AppText style={styles.sectionTitle}>Booking Slot Interval</AppText>
            </View>
            <AppText style={styles.sectionSubtitle}>
              Controls available start time frequency (e.g. every 30 or 60 min).
            </AppText>

            <View style={styles.intervalGrid}>
              {BOOKING_INTERVAL_OPTIONS.map((opt) => {
                const isSelected = formInterval === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.intervalChip,
                      isSelected && styles.intervalChipSelected,
                    ]}
                    onPress={() => setFormInterval(opt.value)}
                    activeOpacity={0.8}
                  >
                    <AppText
                      style={[
                        styles.intervalChipText,
                        isSelected && styles.intervalChipTextSelected,
                      ]}
                    >
                      {opt.label}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
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

            {affectedBookingsCount !== null && affectedBookingsCount > 0 && (
              <View style={styles.disruptionWarningBox}>
                <ShieldAlert size={18} color="#B45309" />
                <AppText variant="caption" style={styles.disruptionWarningText}>
                  Warning: This court has {affectedBookingsCount} upcoming confirmed booking(s). Existing bookings will NOT be cancelled or moved automatically. Players must be notified manually if needed.
                </AppText>
              </View>
            )}

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
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    shadowColor: '#176B57',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
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
    height: 38,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E2EAE6',
  },
  switcherTab: {
    flex: 1,
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 18,
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
    fontSize: 13.5,
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
    flexWrap: 'wrap',
    gap: 6,
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
  hoursBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EBF6F1',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D1EAE0',
    flexShrink: 1,
  },
  hoursBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#176B57',
  },
  intervalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  intervalBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0F766E',
  },
  formSectionBox: {
    backgroundColor: '#F9FAFA',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#102B2A',
  },
  sectionSubtitle: {
    fontSize: 11.5,
    color: '#667776',
    marginBottom: 4,
  },
  timeInputsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  timeHelpText: {
    fontSize: 11,
    color: '#8E9B9A',
    fontStyle: 'italic',
    marginTop: -2,
  },
  dayPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  dayPillButton: {
    flex: 1,
    minWidth: 40,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  dayPillOpen: {
    backgroundColor: '#EBF6F1',
    borderColor: '#176B57',
  },
  dayPillClosed: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
    opacity: 0.7,
  },
  dayPillText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  dayPillTextOpen: {
    color: '#176B57',
  },
  dayPillTextClosed: {
    color: '#9CA3AF',
  },
  dayPillSubtext: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 1,
  },
  dayPillSubtextOpen: {
    color: '#176B57',
  },
  dayPillSubtextClosed: {
    color: '#EF4444',
  },
  intervalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  intervalChip: {
    flex: 1,
    minWidth: 68,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  intervalChipSelected: {
    backgroundColor: '#176B57',
    borderColor: '#176B57',
  },
  intervalChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  intervalChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
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
    height: 32,
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
    height: 32,
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
    height: 32,
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
  disruptionWarningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: Radius.md,
    padding: Spacing[3],
  },
  disruptionWarningText: {
    flex: 1,
    color: '#92400E',
    lineHeight: 18,
    fontWeight: '500',
  },

  // Court Photo Styles
  photoFieldContainer: {
    gap: 6,
  },
  photoPreviewWrapper: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D4E2DC',
    backgroundColor: '#F5F8F7',
  },
  photoPreviewImage: {
    width: '100%',
    height: 140,
    backgroundColor: '#E8EFEA',
  },
  photoActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8EFEA',
  },
  photoChangeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#E8F5EE',
  },
  photoChangeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#176B57',
  },
  photoRemoveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  photoRemoveText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  photoUploadBox: {
    borderWidth: 1.5,
    borderColor: '#C5D6CF',
    borderStyle: 'dashed',
    borderRadius: Radius.md,
    padding: Spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7FAF9',
    gap: 4,
  },
  photoUploadTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#176B57',
    marginTop: 2,
  },
  photoUploadSubtitle: {
    fontSize: 11,
    color: '#667776',
  },
});

