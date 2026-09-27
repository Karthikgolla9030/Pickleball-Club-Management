import React from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { Button } from './Button';
import { ModalSheet } from './ModalSheet';
import { useClubStaffBookings, usePlayerBookings } from '@/hooks';
import { Colors, Radius, Spacing } from '@/theme';
import type { Booking } from '@/types';

export interface BookingDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  booking: Booking | null;
  mode: 'staff' | 'player';
  clubId: string;
}

export function BookingDetailsModal({
  visible,
  onClose,
  booking,
  mode,
  clubId,
}: BookingDetailsModalProps) {
  const staffClubId = mode === 'staff' ? clubId : null;
  const { cancelStaffBooking, isCancelling: isStaffCancelling } = useClubStaffBookings(staffClubId);
  const { cancelBooking, isCancelling: isPlayerCancelling } = usePlayerBookings({ clubId });
  
  const isCancelling = isStaffCancelling || isPlayerCancelling;

  const handleCancel = () => {
    if (!booking) return;
    Alert.alert(
      'Cancel Booking',
      mode === 'staff' 
        ? 'Are you sure you want to cancel this booking? This action cannot be undone.'
        : 'Are you sure you want to cancel this booking? Cancellations are permitted at least 2 hours before start.',
      [
        { text: 'Keep Booking', style: 'cancel' },
        { 
          text: 'Cancel Reservation', 
          style: 'destructive',
          onPress: async () => {
            try {
              if (mode === 'staff') {
                await cancelStaffBooking({ bookingId: booking.id, payload: { cancellation_reason: 'Cancelled by staff' } });
              } else {
                await cancelBooking({ bookingId: booking.id });
              }
              Alert.alert('Cancelled', 'Booking has been cancelled.');
              onClose();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to cancel booking.');
            }
          }
        }
      ]
    );
  };

  if (!booking) return null;

  const d = new Date(booking.start_at);
  const dateStr = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const timeStr = `${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${new Date(booking.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Booking Details"
      subtitle={booking.id.split('-')[0].toUpperCase() + '-' + booking.id.slice(0, 4)} // Fake friendly ID
      actions={[
        { label: 'Close', variant: 'secondary', onPress: onClose }
      ]}
    >
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Badge label={booking.status.toUpperCase()} variant={booking.status === 'confirmed' ? 'success' : booking.status === 'cancelled' ? 'default' : 'warning'} />
          <Badge label={booking.booking_type === 'staff' ? 'STAFF' : 'PLAYER'} variant="default" />
        </View>

        <View style={styles.detailsBox}>
          <DetailRow label="Player" value={booking.player?.display_name || 'Member'} />
          <DetailRow label="Court" value={booking.court?.display_name || booking.court?.name || 'Court'} />
          <DetailRow label="Date" value={dateStr} />
          <DetailRow label="Time" value={timeStr} />
          <DetailRow label="Payment" value="Settled" />
        </View>

        {booking.notes && (
          <View style={styles.notesBox}>
            <AppText variant="caption" color="tertiary">Notes</AppText>
            <AppText variant="bodySmall" color="secondary">{booking.notes}</AppText>
          </View>
        )}

        {booking.cancellation_reason && (
          <View style={styles.cancelBox}>
            <AppText variant="caption" color="error">Cancellation Reason: {booking.cancellation_reason}</AppText>
          </View>
        )}

        {booking.status === 'confirmed' && (
          <View style={styles.actionRow}>
            <Button 
              label="Cancel Booking" 
              variant="danger" 
              onPress={handleCancel} 
              loading={isCancelling} 
              disabled={isCancelling}
            />
          </View>
        )}
      </View>
    </ModalSheet>
  );
}

function DetailRow({ label, value }: { label: string, value: string }) {
  return (
    <View style={styles.detailRow}>
      <AppText variant="caption" color="tertiary" style={styles.detailLabel}>{label}</AppText>
      <AppText variant="body" bold>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing[4],
    gap: Spacing[4],
  },
  headerRow: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  detailsBox: {
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.md,
    padding: Spacing[4],
    gap: Spacing[3],
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    width: 80,
  },
  notesBox: {
    backgroundColor: Colors.background.secondary,
    padding: Spacing[3],
    borderRadius: Radius.sm,
  },
  cancelBox: {
    backgroundColor: Colors.status.errorBg,
    padding: Spacing[3],
    borderRadius: Radius.sm,
  },
  actionRow: {
    marginTop: Spacing[2]
  }
});
