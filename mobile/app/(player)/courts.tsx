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

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Building2, Plus, ShieldAlert } from 'lucide-react-native';

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
import { useActiveClub, useAuth, usePlayerClubs } from '@/hooks';
import { bookingApi, clubsApi } from '@/services/api';
import { Colors, Radius, Spacing } from '@/theme';
import type { Booking } from '@/types';

export default function PlayerCourtsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { clubId: activeClubId, clubName: activeClubName } = useActiveClub();
  const { clubId: paramClubId } = useLocalSearchParams<{ clubId?: string }>();
  const { clubs: myClubs } = usePlayerClubs();

  // If a club ID was passed via params, fetch its public details if not in enrolled clubs
  const { data: paramClub } = useQuery({
    queryKey: ['public-club', paramClubId],
    queryFn: () => clubsApi.getPublicClub(paramClubId!),
    enabled: Boolean(paramClubId),
  });

  // Track the currently selected club on this screen
  const [selectedClubId, setSelectedClubId] = useState<string | null>(
    paramClubId || activeClubId || null
  );

  useEffect(() => {
    if (paramClubId) {
      setSelectedClubId(paramClubId);
    } else if (!selectedClubId && (activeClubId || myClubs[0]?.club_id)) {
      setSelectedClubId(activeClubId || myClubs[0]?.club_id || null);
    }
  }, [paramClubId, activeClubId, myClubs, selectedClubId]);

  const effectiveClubId = selectedClubId || activeClubId || myClubs[0]?.club_id || null;

  // Determine membership eligibility for the effective club
  const isMemberOfSelectedClub = useMemo(() => {
    if (!effectiveClubId) return false;
    return myClubs.some((c) => c.club_id === effectiveClubId && c.status === 'active');
  }, [myClubs, effectiveClubId]);

  const effectiveClubName = useMemo(() => {
    if (paramClubId && paramClub?.name) return paramClub.name;
    const enrolledMatch = myClubs.find((c) => c.club_id === effectiveClubId);
    if (enrolledMatch) return enrolledMatch.club_name;
    if (effectiveClubId === activeClubId && activeClubName) return activeClubName;
    return paramClub?.name || 'Selected Club';
  }, [paramClubId, paramClub, myClubs, effectiveClubId, activeClubId, activeClubName]);

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

    // 2. Check active membership eligibility
    if (!isMemberOfSelectedClub) {
      Alert.alert(
        'Membership Required',
        `Active player membership at ${effectiveClubName} is required to reserve courts. Would you like to view this club's profile and request membership?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'View Club',
            onPress: () => router.push(`/(player)/club-details?id=${effectiveClubId}` as any),
          },
        ]
      );
      return;
    }

    // 3. Available Slot -> Open Booking Flow
    if (status === 'AVAILABLE') {
      setSelectedCourtId(courtId);
      setSelectedSlot(slotIso);
      setSelectedDate(slotIso.split('T')[0]);
      setBookingModalVisible(true);
    }
    // 4. Booked Slot -> View details if own booking, otherwise announce reserved
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
    // 5. Maintenance or Blocked Slots
    else if (status === 'MAINTENANCE' || status === 'BLOCKED') {
      Alert.alert(
        'Slot Unavailable',
        `This court slot is currently ${status.toLowerCase()} and cannot be booked.`
      );
    }
  };

  // "Book Court" header action button handler
  const handleBookNew = () => {
    if (!isMemberOfSelectedClub) {
      Alert.alert(
        'Membership Required',
        `Active player membership at ${effectiveClubName} is required to reserve courts. Would you like to view this club's profile and request membership?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'View Club',
            onPress: () => router.push(`/(player)/club-details?id=${effectiveClubId}` as any),
          },
        ]
      );
      return;
    }
    setSelectedCourtId(undefined);
    setSelectedSlot(undefined);
    setSelectedDate(undefined);
    setBookingModalVisible(true);
  };

  if (!effectiveClubId) {
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
        subtitle={effectiveClubName ? `Court schedule at ${effectiveClubName}` : 'Court schedule & reservations'}
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

      {/* ─── Enrolled Clubs Selector Bar (if player belongs to multiple clubs) ─ */}
      {myClubs.length > 1 && (
        <View style={styles.clubSelectorBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.clubPillsContainer}
          >
            {myClubs.map((c) => {
              const isSelected = c.club_id === effectiveClubId;
              return (
                <TouchableOpacity
                  key={c.club_id}
                  style={[styles.clubPill, isSelected && styles.clubPillActive]}
                  onPress={() => setSelectedClubId(c.club_id)}
                >
                  <Building2 size={13} color={isSelected ? '#FFFFFF' : '#18794E'} />
                  <AppText style={[styles.clubPillText, isSelected && styles.clubPillTextActive]}>
                    {c.club_name}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ─── Non-member Warning Banner ───────────────────────────────────────── */}
      {!isMemberOfSelectedClub && (
        <View style={styles.nonMemberBanner}>
          <ShieldAlert size={16} color="#B45309" />
          <View style={styles.bannerTextCol}>
            <AppText style={styles.bannerTitle}>
              Browsing schedule for {effectiveClubName}
            </AppText>
            <AppText style={styles.bannerDesc}>
              Active player membership is required to make court bookings at this club.
            </AppText>
          </View>
          <TouchableOpacity
            style={styles.bannerBtn}
            onPress={() => router.push(`/(player)/club-details?id=${effectiveClubId}` as any)}
          >
            <AppText style={styles.bannerBtnText}>View Club</AppText>
          </TouchableOpacity>
        </View>
      )}

      {/* ─── Exact Club-Side Court Schedule ─────────────────────────────────── */}
      <View style={styles.scheduleWrapper}>
        <CourtSchedule
          clubId={effectiveClubId}
          onSlotPress={handleSlotPress}
        />
      </View>

      {/* ─── Player Booking Flow Modal ──────────────────────────────────────── */}
      {effectiveClubId && (
        <BookingFlowModal
          visible={bookingModalVisible}
          onClose={() => setBookingModalVisible(false)}
          onSuccess={() => setBookingModalVisible(false)}
          mode="player"
          clubId={effectiveClubId}
          initialCourtId={selectedCourtId}
          initialSlot={selectedSlot}
          initialDate={selectedDate}
        />
      )}

      {/* ─── Player Booking Details Modal ───────────────────────────────────── */}
      {effectiveClubId && (
        <BookingDetailsModal
          visible={detailsModalVisible}
          onClose={() => setDetailsModalVisible(false)}
          booking={selectedBooking}
          mode="player"
          clubId={effectiveClubId}
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
  clubSelectorBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2EAE6',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  clubPillsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  clubPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: '#F0F6F3',
    borderWidth: 1,
    borderColor: '#D8E6DE',
  },
  clubPillActive: {
    backgroundColor: '#18794E',
    borderColor: '#18794E',
  },
  clubPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#18794E',
  },
  clubPillTextActive: {
    color: '#FFFFFF',
  },
  nonMemberBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF3C7',
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bannerTextCol: {
    flex: 1,
    gap: 2,
  },
  bannerTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#92400E',
  },
  bannerDesc: {
    fontSize: 11,
    color: '#B45309',
  },
  bannerBtn: {
    backgroundColor: '#B45309',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  bannerBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
