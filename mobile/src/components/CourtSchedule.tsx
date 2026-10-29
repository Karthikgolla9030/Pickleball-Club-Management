/**
 * Aught2 Pickleball — CourtSchedule Component
 * Exact Reference Implementation matching provided visual specification:
 *
 * Visual hierarchy:
 *   - Date Section:
 *       * Left: Small "Today" label + dynamic formatted date "Ddd, DD Mon YYYY"
 *       * Right: White rounded "Pick Date" button with Calendar icon
 *   - Date Picker:
 *       * ModalSheet with interactive DateCalendar
 *       * Updates selected date and court availability immediately upon selection
 *   - Status Legend:
 *       * Compact horizontal row with 4 semantic colored dots:
 *         ● Available (#18794E)  ● Booked (#DC2626)  ● Maint. (#D97706)  ● Blocked (#8E9B9A)
 *   - Schedule Grid:
 *       * Fixed/Sticky Left Column:
 *           Header: "Courts"
 *           Rows: Court name (e.g. "Court 1") + subtitle (e.g. "Indoor • Acrylic")
 *       * Horizontally Scrollable Timeline Area:
 *           Header: Hourly time labels (7:00 / AM, 8:00 / AM ... through evening)
 *           Cells: Rounded pastel pills for Avl, Booked, Maint., Blocked
 *       * Horizontal Scroll Progress Indicator:
 *           Subtle track with gliding green thumb matching scroll position
 *   - Tapping an Available slot opens the booking flow pre-filled with court, date, and slot
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Calendar } from 'lucide-react-native';

import { AppText } from './AppText';
import { DateCalendar } from './DateCalendar';
import { ModalSheet } from './ModalSheet';
import { ErrorState, LoadingState } from './StateViews';
import { useActiveClub, useClubCourtAvailability } from '@/hooks';
import { Colors, Radius, Shadows, Spacing } from '@/theme';
import { formatCurrency } from '@/utils';
import type { CourtEnvironment, SlotStatus } from '@/types';

export interface CourtScheduleProps {
  clubId?: string;
  onSlotPress?: (courtId: string, slotIso: string, status: string, bookingId?: string) => void;
}

// ─── Date Formatting Helpers ──────────────────────────────────────────────────
function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];

function formatHeaderDate(dateObj: Date): { dayLabel: string | null; formattedDate: string } {
  const today = new Date();
  const isToday =
    dateObj.getFullYear() === today.getFullYear() &&
    dateObj.getMonth() === today.getMonth() &&
    dateObj.getDate() === today.getDate();

  const weekday = WEEKDAYS[dateObj.getDay()];
  const dayNum = dateObj.getDate();
  const monthName = MONTHS[dateObj.getMonth()];
  const yearNum = dateObj.getFullYear();

  return {
    dayLabel: isToday ? 'Today' : null,
    formattedDate: `${weekday}, ${dayNum} ${monthName} ${yearNum}`,
  };
}

function formatEnv(env?: CourtEnvironment | string): string {
  if (!env) return 'Indoor';
  return env.charAt(0).toUpperCase() + env.slice(1).toLowerCase();
}

function formatSurface(surface?: string | null): string {
  if (!surface) return 'Acrylic';
  if (surface.toLowerCase().includes('cushion')) return 'Cushion';
  return surface.replace(/ surface$/i, '');
}

function parseSlotTime(isoString: string): {
  hour: string;
  ampm: string;
  minutesFromMidnight: number;
  canonicalKey: string;
} {
  let h = 0;
  let m = 0;
  if (typeof isoString === 'string' && isoString.includes('T')) {
    const timePart = isoString.split('T')[1];
    const match = timePart.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      h = parseInt(match[1], 10);
      m = parseInt(match[2], 10);
    } else {
      const d = new Date(isoString);
      h = isNaN(d.getTime()) ? 0 : d.getUTCHours();
      m = isNaN(d.getTime()) ? 0 : d.getUTCMinutes();
    }
  } else if (typeof isoString === 'string' && isoString.includes(':')) {
    const match = isoString.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      h = parseInt(match[1], 10);
      m = parseInt(match[2], 10);
    }
  } else {
    const d = new Date(isoString);
    h = isNaN(d.getTime()) ? 0 : d.getUTCHours();
    m = isNaN(d.getTime()) ? 0 : d.getUTCMinutes();
  }

  const ampm = h >= 12 ? 'PM' : 'AM';
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  const mStr = String(m).padStart(2, '0');
  const h24Str = String(h).padStart(2, '0');
  return {
    hour: `${hour12}:${mStr}`,
    ampm,
    minutesFromMidnight: h * 60 + m,
    canonicalKey: `${h24Str}:${mStr}`,
  };
}

// ─── Slot Status Presentation ─────────────────────────────────────────────────
function getSlotLabel(status: SlotStatus | string): string {
  switch (status) {
    case 'AVAILABLE':
    case 'PAST':
      return 'Avl';
    case 'BOOKED':
      return 'Booked';
    case 'MAINTENANCE':
      return 'Maint.';
    case 'BLOCKED':
      return 'Blocked';
    default:
      return 'Avl';
  }
}

// ─── Main CourtSchedule Component ─────────────────────────────────────────────
export function CourtSchedule({ clubId: propClubId, onSlotPress }: CourtScheduleProps) {
  const { clubId: activeClubId } = useActiveClub();
  const clubId = propClubId || activeClubId;

  // Selected date state
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [showCalendar, setShowCalendar] = useState(false);

  // Horizontal scroll indicator state (0 to 1)
  const [scrollProgress, setScrollProgress] = useState(0);

  const dateStr = useMemo(() => toDateString(currentDate), [currentDate]);
  const { dayLabel, formattedDate } = useMemo(
    () => formatHeaderDate(currentDate),
    [currentDate]
  );

  // Query availability for the selected date
  const {
    availability,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useClubCourtAvailability(clubId, dateStr, 60);

  const courts = useMemo(() => availability?.courts ?? [], [availability]);

  // Generate unified chronological, continuous timeline headers across all courts
  const timeHeaders = useMemo(() => {
    let minMinutes = Infinity;
    let maxMinutes = -Infinity;
    let stepMinutes = 60;

    for (const c of courts) {
      if (c.booking_interval_minutes && c.booking_interval_minutes >= 15 && c.booking_interval_minutes < stepMinutes) {
        stepMinutes = c.booking_interval_minutes;
      }
      if (c.slots && c.slots.length > 0) {
        for (const s of c.slots) {
          const parsed = parseSlotTime(s.start_time || s.start_at);
          if (parsed.minutesFromMidnight < minMinutes) {
            minMinutes = parsed.minutesFromMidnight;
          }
          if (parsed.minutesFromMidnight > maxMinutes) {
            maxMinutes = parsed.minutesFromMidnight;
          }
        }
      }
    }

    // Fallback if no courts have slots
    if (minMinutes === Infinity || maxMinutes === -Infinity) {
      minMinutes = 6 * 60;   // 06:00 AM default
      maxMinutes = 21 * 60;  // 09:00 PM default
    }

    // Ensure start begins cleanly at interval boundary
    const startM = Math.floor(minMinutes / stepMinutes) * stepMinutes;
    const endM = Math.ceil(maxMinutes / stepMinutes) * stepMinutes;

    const headers: {
      key: string;
      hour: string;
      ampm: string;
      minutesFromMidnight: number;
    }[] = [];

    for (let m = startM; m <= endM; m += stepMinutes) {
      const h24 = Math.floor(m / 60) % 24;
      const min = m % 60;
      const ampm = h24 >= 12 ? 'PM' : 'AM';
      let hour12 = h24 % 12;
      if (hour12 === 0) hour12 = 12;
      const mStr = String(min).padStart(2, '0');
      const h24Str = String(h24).padStart(2, '0');

      headers.push({
        key: `${h24Str}:${mStr}`,
        hour: `${hour12}:${mStr}`,
        ampm,
        minutesFromMidnight: m,
      });
    }

    return headers;
  }, [courts]);

  // Date picker handler
  const handleSelectDate = (newDateStr: string) => {
    const nextDate = parseDateString(newDateStr);
    setCurrentDate(nextDate);
    setShowCalendar(false);
  };

  // Scroll listener for the horizontal scroll indicator
  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const maxScroll = contentSize.width - layoutMeasurement.width;
    if (maxScroll > 0) {
      const progress = Math.min(Math.max(contentOffset.x / maxScroll, 0), 1);
      setScrollProgress(progress);
    }
  };

  const thumbWidthPercent = 28;
  const thumbLeftPercent = scrollProgress * (100 - thumbWidthPercent);

  if (isLoading && !isRefetching) {
    return (
      <View style={styles.centerContainer}>
        <LoadingState message="Loading court schedule..." />
      </View>
    );
  }

  if (isError || !availability) {
    return (
      <View style={styles.centerContainer}>
        <ErrorState
          title="Failed to Load Schedule"
          message={error?.message || 'Could not load court schedule for this date.'}
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContainer}
    >
      {/* ─── 1. Date Header Section ────────────────────────────────────────── */}
      <View style={styles.dateSectionRow}>
        <View style={styles.dateTextCol}>
          {dayLabel !== null && (
            <AppText style={styles.dateLabelText}>{dayLabel}</AppText>
          )}
          <AppText style={styles.mainDateText}>{formattedDate}</AppText>
        </View>

        <TouchableOpacity
          style={styles.pickDateButton}
          onPress={() => setShowCalendar(true)}
          activeOpacity={0.8}
          accessibilityLabel="Pick date"
          accessibilityRole="button"
        >
          <Calendar size={16} color="#102B2A" strokeWidth={2} />
          <AppText style={styles.pickDateButtonText}>Pick Date</AppText>
        </TouchableOpacity>
      </View>

      {/* ─── 2. Status Legend Row ──────────────────────────────────────────── */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#18794E' }]} />
          <AppText style={styles.legendText}>Available</AppText>
        </View>

        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#DC2626' }]} />
          <AppText style={styles.legendText}>Booked</AppText>
        </View>

        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#D97706' }]} />
          <AppText style={styles.legendText}>Maint.</AppText>
        </View>

        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#8E9B9A' }]} />
          <AppText style={styles.legendText}>Blocked</AppText>
        </View>
      </View>

      {/* ─── 3. Schedule Grid Card ─────────────────────────────────────────── */}
      <View style={styles.gridCard}>
        {courts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <AppText style={styles.emptyText}>No courts configured for this club.</AppText>
          </View>
        ) : (
          <View style={styles.gridRowLayout}>
            {/* FIXED/STICKY LEFT COLUMN (Courts) */}
            <View style={styles.stickyColumn}>
              {/* Header cell: "Courts" */}
              <View style={styles.stickyHeaderCell}>
                <AppText style={styles.stickyHeaderTitle}>Courts</AppText>
              </View>

              {/* Court rows */}
              {courts.map((court, idx) => {
                const isLast = idx === courts.length - 1;
                return (
                  <View
                    key={court.court_id}
                    style={[styles.stickyCourtCell, isLast && styles.lastCellBorder]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <AppText style={styles.courtTitle} numberOfLines={1}>
                        {court.court_name}
                      </AppText>
                      {court.is_closed && (
                        <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4 }}>
                          <AppText style={{ fontSize: 9.5, fontWeight: '700', color: '#DC2626' }}>CLOSED</AppText>
                        </View>
                      )}
                    </View>
                    <AppText style={styles.courtSubtitle} numberOfLines={1}>
                      {`${formatEnv(court.indoor_outdoor)} • ${formatSurface(court.surface_type)}${
                        court.price_per_hour != null ? ` • ${formatCurrency(court.price_per_hour)}/hr` : ''
                      } • ${court.booking_interval_minutes || 60}m`}
                    </AppText>
                  </View>
                );
              })}
            </View>

            {/* HORIZONTALLY SCROLLABLE TIMELINE */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              bounces={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              style={styles.timelineScrollView}
            >
              <View>
                {/* Timeline Header Row (7:00 AM, 8:00 AM ...) */}
                <View style={styles.timelineHeaderRow}>
                  {timeHeaders.map((t, idx) => (
                    <View key={idx} style={styles.timeHeaderCell}>
                      <AppText style={styles.timeHourText}>{t.hour}</AppText>
                      <AppText style={styles.timeAmPmText}>{t.ampm}</AppText>
                    </View>
                  ))}
                </View>

                {/* Court Slot Rows */}
                {courts.map((court, rowIdx) => {
                  const isLastRow = rowIdx === courts.length - 1;

                  if (court.is_closed) {
                    return (
                      <View
                        key={court.court_id}
                        style={[styles.timelineRow, isLastRow && styles.lastCellBorder]}
                      >
                        {timeHeaders.map((th) => (
                          <View key={th.key} style={styles.slotCellWrapper}>
                            <View
                              style={[
                                styles.slotPill,
                                { backgroundColor: '#F3F4F6', borderWidth: 0, opacity: 0.6 },
                              ]}
                            >
                              <AppText style={{ fontSize: 11, color: '#9CA3AF', fontWeight: '500' }}>
                                —
                              </AppText>
                            </View>
                          </View>
                        ))}
                      </View>
                    );
                  }

                  return (
                    <View
                      key={court.court_id}
                      style={[styles.timelineRow, isLastRow && styles.lastCellBorder]}
                    >
                      {timeHeaders.map((th) => {
                        const slot = court.slots
                          ? court.slots.find((s) => {
                              const parsed = parseSlotTime(s.start_time || s.start_at);
                              return (
                                s.start_time === th.key ||
                                parsed.canonicalKey === th.key ||
                                parsed.minutesFromMidnight === th.minutesFromMidnight
                              );
                            })
                          : undefined;

                        if (!slot) {
                          return (
                            <View key={th.key} style={styles.slotCellWrapper}>
                              <View
                                style={[
                                  styles.slotPill,
                                  { backgroundColor: '#F3F4F6', borderWidth: 0, opacity: 0.6 },
                                ]}
                              >
                                <AppText style={{ fontSize: 11, color: '#9CA3AF', fontWeight: '500' }}>
                                  —
                                </AppText>
                              </View>
                            </View>
                          );
                        }

                        const parsed = parseSlotTime(slot.start_time || slot.start_at);
                        const isToday = dayLabel === 'Today';
                        const now = new Date();
                        const currentMinutes = now.getHours() * 60 + now.getMinutes();
                        const isPast =
                          slot.is_past === true ||
                          slot.status === 'PAST' ||
                          (isToday && parsed.minutesFromMidnight <= currentMinutes);

                        const effectiveStatus: SlotStatus | string =
                          slot.status === 'PAST' ? 'AVAILABLE' : slot.status;
                        const isAvailable = effectiveStatus === 'AVAILABLE';
                        const isBooked = effectiveStatus === 'BOOKED';

                        return (
                          <View key={th.key} style={styles.slotCellWrapper}>
                            <TouchableOpacity
                              style={[
                                styles.slotPill,
                                getSlotPillStyle(effectiveStatus),
                                isPast && isAvailable && { opacity: 0.55 },
                              ]}
                              onPress={() => {
                                if (isPast && isAvailable) {
                                  Alert.alert(
                                    'Past Time Slot',
                                    'This time slot has already passed and cannot be booked.'
                                  );
                                  return;
                                }
                                if (onSlotPress && (isAvailable || isBooked)) {
                                  onSlotPress(
                                    court.court_id,
                                    slot.start_at,
                                    effectiveStatus,
                                    slot.booking_id || undefined
                                  );
                                }
                              }}
                              activeOpacity={isBooked || (isAvailable && !isPast) ? 0.75 : 0.9}
                              accessibilityLabel={`${court.court_name} ${slot.label || slot.start_time || slot.start_at} ${effectiveStatus}`}
                            >
                              <AppText
                                style={[styles.slotPillText, getSlotTextStyle(effectiveStatus)]}
                                numberOfLines={1}
                              >
                                {getSlotLabel(effectiveStatus)}
                              </AppText>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        )}
      </View>

      {/* ─── 4. Horizontal Scroll Indicator Track ──────────────────────────── */}
      {courts.length > 0 && timeHeaders.length > 3 && (
        <View style={styles.scrollTrackContainer}>
          <View style={styles.scrollTrack}>
            <View
              style={[
                styles.scrollThumb,
                {
                  width: `${thumbWidthPercent}%`,
                  left: `${thumbLeftPercent}%`,
                },
              ]}
            />
          </View>
        </View>
      )}

      {/* ─── 5. Date Calendar Modal Sheet ──────────────────────────────────── */}
      <ModalSheet
        visible={showCalendar}
        onClose={() => setShowCalendar(false)}
        title="Select Date"
      >
        <DateCalendar
          selectedDate={dateStr}
          onSelectDate={handleSelectDate}
        />
      </ModalSheet>
    </ScrollView>
  );
}

// ─── Status Pill Style Helpers ────────────────────────────────────────────────
function getSlotPillStyle(status: SlotStatus | string) {
  switch (status) {
    case 'AVAILABLE':
      return styles.slotPillAvailable;
    case 'BOOKED':
      return styles.slotPillBooked;
    case 'MAINTENANCE':
      return styles.slotPillMaintenance;
    case 'PAST':
      return styles.slotPillPast;
    case 'BLOCKED':
      return styles.slotPillBlocked;
    default:
      return styles.slotPillAvailable;
  }
}

function getSlotTextStyle(status: SlotStatus | string) {
  switch (status) {
    case 'AVAILABLE':
      return styles.slotTextAvailable;
    case 'BOOKED':
      return styles.slotTextBooked;
    case 'MAINTENANCE':
      return styles.slotTextMaintenance;
    case 'PAST':
      return styles.slotTextPast;
    case 'BLOCKED':
      return styles.slotTextBlocked;
    default:
      return styles.slotTextAvailable;
  }
}

// ─── Dimensions ───────────────────────────────────────────────────────────────
const STICKY_COL_WIDTH = 98;
const TIME_COL_WIDTH = 60;
const ROW_HEIGHT = 54;
const HEADER_HEIGHT = 48;

// ─── Stylesheet ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scrollContainer: {
    paddingBottom: 110, // Clears fixed bottom navigation
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[6],
    minHeight: 300,
  },

  // 1. Date Header Section
  dateSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 12,
  },
  dateTextCol: {
    gap: 1,
  },
  dateLabelText: {
    fontSize: 12,
    color: '#667776',
    fontWeight: '500',
  },
  mainDateText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#102B2A',
    letterSpacing: -0.3,
  },
  pickDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    paddingHorizontal: 13,
    paddingVertical: 8,
    ...Shadows.sm,
  },
  pickDateButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#102B2A',
  },

  // 2. Status Legend Row
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    marginBottom: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#102B2A',
  },

  // 3. Schedule Grid Card
  gridCard: {
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    overflow: 'hidden',
    ...Shadows.sm,
  },
  gridRowLayout: {
    flexDirection: 'row',
  },

  // Sticky Left Column
  stickyColumn: {
    width: STICKY_COL_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#EDF2F7',
    zIndex: 10,
  },
  stickyHeaderCell: {
    height: HEADER_HEIGHT,
    justifyContent: 'center',
    paddingLeft: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
  },
  stickyHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102B2A',
  },
  stickyCourtCell: {
    height: ROW_HEIGHT,
    justifyContent: 'center',
    paddingLeft: 12,
    paddingRight: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
    gap: 2,
  },
  courtTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#102B2A',
  },
  courtSubtitle: {
    fontSize: 10.5,
    color: '#667776',
    fontWeight: '400',
  },

  // Scrollable Timeline
  timelineScrollView: {
    flex: 1,
  },
  timelineHeaderRow: {
    flexDirection: 'row',
    height: HEADER_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
  },
  timeHeaderCell: {
    width: TIME_COL_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 1,
  },
  timeHourText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#667776',
  },
  timeAmPmText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#8E9B9A',
  },

  timelineRow: {
    flexDirection: 'row',
    height: ROW_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
  },
  slotCellWrapper: {
    width: TIME_COL_WIDTH,
    height: ROW_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  slotPill: {
    width: 52,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slotPillText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.2,
  },

  // Pill Status Variations (Soft pastel backgrounds matching reference image)
  slotPillAvailable: {
    backgroundColor: '#E8F8F0',
  },
  slotTextAvailable: {
    color: '#18794E',
  },
  slotPillBooked: {
    backgroundColor: '#FDE8E8',
  },
  slotTextBooked: {
    color: '#DC2626',
  },
  slotPillMaintenance: {
    backgroundColor: '#FEF3C7',
  },
  slotTextMaintenance: {
    color: '#D97706',
  },
  slotPillBlocked: {
    backgroundColor: '#EDEFF4',
  },
  slotTextBlocked: {
    color: '#4B5563',
  },
  slotPillPast: {
    backgroundColor: '#F3F4F6',
    borderWidth: 0,
    opacity: 0.55,
  },
  slotTextPast: {
    color: '#9CA3AF',
  },

  lastCellBorder: {
    borderBottomWidth: 0,
  },

  // 4. Horizontal Scroll Progress Indicator
  scrollTrackContainer: {
    marginTop: 14,
    marginBottom: 4,
    paddingHorizontal: 20,
  },
  scrollTrack: {
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: '#E2EAE6',
    position: 'relative',
    overflow: 'hidden',
  },
  scrollThumb: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 2.5,
    backgroundColor: '#176B57',
  },

  // Empty state
  emptyContainer: {
    padding: Spacing[6],
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: Colors.text.secondary,
    fontSize: 13,
  },
});
