/**
 * Aught2 Pickleball — Player Courts & Court Schedule Screen
 *
 * Implements the exact Club-Side Court Schedule and Court Booking system in the Player Side:
 *   - Reuses the exact CourtSchedule UI component (grid structure, court order, date picker,
 *     hourly timeline, status legend, and horizontal scrolling).
 *   - Prominent green primary "Book Court" button in the header that opens the booking flow.
 *   - Real-time availability reflecting actual bookings, maintenance, and blocked slots.
 *   - Interactive slot selection: tapping an AVAILABLE slot opens the pre-filled booking flow.
 *   - Reuses BookingFlowModal in mode="player" for self-booking with summary, validation, and confirmation.
 *   - Reuses BookingDetailsModal in mode="player" for viewing and cancelling own reservations.
 *   - Strict player-side separation: no admin controls, no Add/Edit/Deactivate court buttons,
 *     and other players' private details remain protected.
 */

import React, { useState } from 'react';
import {
  Alert,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Plus } from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  BookingDetailsModal,
  BookingFlowModal,
  CourtSchedule,
  EmptyState,
  LoadingState,
  Screen,
} from '@/components';
import { useActiveClub, useAuth } from '@/hooks';
import { bookingApi } from '@/services/api';
import { Colors, Radius, Spacing } from '@/theme';
import type { Booking } from '@/types';

export default function PlayerCourtsScreen() {
  const { user } = useAuth();
  const { clubId, clubName, hasClubContext } = useActiveClub();

  // Schedule & Booking Modal State
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedCourtId, setSelectedCourtId] = useState<string>();
  const [selectedSlot, setSelectedSlot] = useState<string>();
  const [selectedDate, setSelectedDate] = useState<string>();
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  // Slot press handler matching Club-Side behavior, adapted for players
  const handleSlotPress = async (
    courtId: string,
    slotIso: string,
    status: string,
    bookingId?: string
  ) => {
    const slotDate = new Date(slotIso);
    const now = new Date();
    const slotDay = new Date(slotDate.getFullYear(), slotDate.getMonth(), slotDate.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 1. Prevent booking past dates
    if (slotDay < today) {
      Alert.alert(
        'Past Date',
        'You cannot book courts on finished days. Past days are only for viewing history.'
      );
      return;
    }

    // Also check past time slot on today
    if (slotDate.getTime() < now.getTime()) {
      Alert.alert('Past Slot', 'This time slot has already passed and cannot be booked.');
      return;
    }

    // 2. Available Slot -> Open Booking Flow
    if (status === 'AVAILABLE') {
      setSelectedCourtId(courtId);
      setSelectedSlot(slotIso);
      setSelectedDate(slotIso.split('T')[0]);
      setBookingModalVisible(true);
    }
    // 3. Booked Slot -> View details if own booking, otherwise announce reserved
    else if (status === 'BOOKED' && bookingId) {
      try {
        const booking = await bookingApi.getBooking(bookingId);
        // Only show booking details if caller is the owner
        if (booking.player_id === user?.id || booking.created_by_user_id === user?.id) {
          setSelectedBooking(booking);
          setDetailsModalVisible(true);
        } else {
          Alert.alert(
            'Slot Reserved',
            'This court slot is already reserved by another player.'
          );
        }
      } catch {
        Alert.alert(
          'Slot Reserved',
          'This court slot is already booked.'
        );
      }
    }
    // 4. Maintenance or Blocked Slots
    else if (status === 'MAINTENANCE' || status === 'BLOCKED') {
      Alert.alert(
        'Slot Unavailable',
        `This court slot is currently ${status.toLowerCase()} and cannot be booked.`
      );
    }
  };

  // "Book Court" header action button handler
  const handleBookNew = () => {
    setSelectedCourtId(undefined);
    setSelectedSlot(undefined);
    setSelectedDate(undefined);
    setBookingModalVisible(true);
  };

  if (!hasClubContext && !clubId) {
    return (
      <Screen safeArea={false} style={styles.screen}>
        <AppHeader title="Courts" subtitle="Court schedule & reservations" showMenu borderless />
        <View style={styles.centerContainer}>
          <EmptyState
            title="No Club Selected"
            description="Please join or select an Aught2 club to view court schedules and make reservations."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen safeArea={false} style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F8F6" />

      {/* ─── Top Header with "Book Court" Primary Button ───────────────────── */}
      <AppHeader
        title="Courts"
        subtitle={clubName ? `Court schedule at ${clubName}` : 'Court schedule & reservations'}
        borderless
        showMenu
        rightElement={
          <TouchableOpacity
            style={styles.bookCourtButton}
            onPress={handleBookNew}
            activeOpacity={0.85}
            accessibilityLabel="Book Court"
            accessibilityRole="button"
          >
            <Plus size={15} color="#FFFFFF" strokeWidth={2.6} />
            <AppText style={styles.bookCourtButtonText}>Book Court</AppText>
          </TouchableOpacity>
        }
      />

      {/* ─── Exact Club-Side Court Schedule ─────────────────────────────────── */}
      <View style={styles.scheduleWrapper}>
        <CourtSchedule
          clubId={clubId || undefined}
          onSlotPress={handleSlotPress}
        />
      </View>

      {/* ─── Player Booking Flow Modal ──────────────────────────────────────── */}
      {clubId && (
        <BookingFlowModal
          visible={bookingModalVisible}
          onClose={() => setBookingModalVisible(false)}
          onSuccess={() => setBookingModalVisible(false)}
          mode="player"
          clubId={clubId}
          initialCourtId={selectedCourtId}
          initialSlot={selectedSlot}
          initialDate={selectedDate}
        />
      )}

      {/* ─── Player Booking Details Modal ───────────────────────────────────── */}
      {clubId && (
        <BookingDetailsModal
          visible={detailsModalVisible}
          onClose={() => setDetailsModalVisible(false)}
          booking={selectedBooking}
          mode="player"
          clubId={clubId}
        />
      )}
    </Screen>
  );
}

// ─── Stylesheet ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F4F8F6',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[4],
  },
  scheduleWrapper: {
    flex: 1,
  },

  // Primary "Book Court" Green Button in Header
  bookCourtButton: {
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
    shadowOpacity: 0.22,
    shadowRadius: 3,
    elevation: 3,
  },
  bookCourtButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
