import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, TouchableOpacity, ScrollView, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Button } from './Button';
import { Card } from './Card';

import { Calendar } from 'lucide-react-native';
import { FilterChips } from './FilterChips';
import { DateCalendar } from './DateCalendar';
import { Input } from './Input';
import { useClubCourtAvailability, useClubPlayerMembers, useClubStaffBookings } from '@/hooks';
import { Colors, Radius, Spacing, Typography } from '@/theme';

export interface BookingFlowModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode: 'staff' | 'player';
  clubId: string;
  initialCourtId?: string;
  initialDate?: string;
  initialSlot?: string; // start_at ISO string
}

export function BookingFlowModal({
  visible,
  onClose,
  onSuccess,
  mode,
  clubId,
  initialCourtId,
  initialDate,
  initialSlot,
}: BookingFlowModalProps) {
  const [stage, setStage] = useState<1 | 2 | 3 | 4>(1);

  // Stage 1 Form State
  const [dateStr, setDateStr] = useState<string>(
    initialDate || new Date().toISOString().split('T')[0]
  );
  const [courtId, setCourtId] = useState<string>(initialCourtId || '');
  const [slotIso, setSlotIso] = useState<string>(initialSlot || '');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [customerText, setCustomerText] = useState<string>('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [playersCount, setPlayersCount] = useState<string>('4');
  const [notes, setNotes] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Queries
  const { availability, isLoading: isAvailLoading } = useClubCourtAvailability(clubId, dateStr, 60);
  const staffClubId = mode === 'staff' ? clubId : null;
  const { playerMembers, isLoading: isMembersLoading } = useClubPlayerMembers(staffClubId);
  
  // Mutations
  const { createStaffBooking, isCreating: isStaffCreating } = useClubStaffBookings(staffClubId);
  // We use useClubCourtAvailability's createBooking for player booking
  const { createBooking, isBooking: isPlayerBooking } = useClubCourtAvailability(clubId, dateStr, 60);

  const isSubmitting = isStaffCreating || isPlayerBooking;

  useEffect(() => {
    if (visible) {
      setStage(1);
      setFormError(null);
      setShowDatePicker(false);
      if (initialDate) setDateStr(initialDate);
      if (initialCourtId) setCourtId(initialCourtId);
      if (initialSlot) setSlotIso(initialSlot);
      if (mode === 'staff') {
        setPlayerId(null);
        setCustomerText('');
      } else {
        setPlayerId('self');
      }
    }
  }, [visible, initialDate, initialCourtId, initialSlot, playerMembers, mode]);

  const availableCourts = React.useMemo(() => {
    if (!availability?.courts) return [];
    return availability.courts.filter((c) => {
      if (!c.slots || c.slots.length === 0) return false;
      if (mode === 'player') {
        return c.slots.some((s) => s.status !== 'BLOCKED');
      }
      return true;
    });
  }, [availability?.courts, mode]);
  
  // Only show slots for selected court that are actually available
  const selectedCourtSlots = availableCourts.find(c => c.court_id === courtId)?.slots || [];

  const handleNextToSummary = () => {
    if (mode === 'staff' && !playerId && !customerText.trim()) {
      setFormError('Please select or enter a customer name.');
      return;
    }
    if (!courtId) {
      setFormError('Please select a court.');
      return;
    }
    if (!slotIso) {
      setFormError('Please select a time slot.');
      return;
    }
    setFormError(null);
    setStage(2);
  };

  const handleConfirmSummary = () => {
    setStage(3); // Go to Payment
  };

  const handleCompletePayment = async () => {
    setFormError(null);
    try {
      const slot = selectedCourtSlots.find(
        (s) => s.start_at === slotIso || new Date(s.start_at).getTime() === new Date(slotIso).getTime()
      );
      const startAt = slot?.start_at || slotIso;
      const endAt = slot?.end_at || new Date(new Date(slotIso).getTime() + 60 * 60 * 1000).toISOString();
      
      if (mode === 'staff') {
        await createStaffBooking({
          court_id: courtId,
          player_id: playerId || undefined,
          guest_name: !playerId ? customerText.trim() : undefined,
          start_at: startAt,
          end_at: endAt,
          notes: notes.trim() || null,
        });
      } else {
        await createBooking({
          court_id: courtId,
          start_at: startAt,
          end_at: endAt,
          notes: notes.trim() || null,
        });
      }
      setStage(4);
    } catch (err: any) {
      const isConflict =
        err?.response?.status === 409 ||
        err?.message?.toLowerCase().includes('conflict') ||
        err?.message?.toLowerCase().includes('already booked');
      const msg = isConflict
        ? 'This time slot is no longer available. Another player has just booked it. Please choose another slot.'
        : err?.response?.data?.detail || err?.message || 'Failed to create booking. The slot may no longer be available.';
      setFormError(msg);
      setStage(1); // Return to stage 1 so player can select another slot
    }
  };

  const handleClose = () => {
    if (stage === 4) {
      onSuccess();
    } else {
      onClose();
    }
  };

  const filteredMembers = playerMembers.filter(m => {
    const text = customerText.toLowerCase();
    const name = m.user_full_name?.toLowerCase() || '';
    const email = m.user_email.toLowerCase();
    return name.includes(text) || email.includes(text);
  });

  const renderStage1 = () => (
    <View style={styles.formContainer}>
      {mode === 'staff' && (
        <View style={[styles.fieldSection, { zIndex: 10 }]}>
          <AppText variant="caption" color="secondary" bold style={styles.fieldLabel}>Customer / Member</AppText>
          <Input 
            placeholder="Type name or email to search..."
            value={customerText}
            onChangeText={(txt) => {
              setCustomerText(txt);
              setShowSuggestions(true);
              setPlayerId(null);
            }}
            onFocus={() => setShowSuggestions(true)}
          />
          {showSuggestions && customerText.trim() !== '' && (
            <View style={styles.suggestionsDropdown}>
              {filteredMembers.length > 0 ? (
                filteredMembers.slice(0, 5).map(m => (
                  <TouchableOpacity 
                    key={m.user_id} 
                    style={styles.suggestionItem}
                    onPress={() => {
                      setPlayerId(m.user_id);
                      setCustomerText(m.user_full_name || m.user_email);
                      setShowSuggestions(false);
                    }}
                  >
                    <AppText variant="body" bold>{m.user_full_name || 'No Name'}</AppText>
                    <AppText variant="caption" color="secondary">{m.user_email}</AppText>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.suggestionItem}>
                  <AppText variant="body" color="secondary">"{customerText}" will be a Walk-in Guest</AppText>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      <View style={styles.fieldSection}>
        <View style={styles.dateHeaderRow}>
          <AppText variant="caption" color="secondary" bold style={styles.fieldLabel}>Date</AppText>
          <TouchableOpacity
            onPress={() => setShowDatePicker((prev) => !prev)}
            style={styles.datePickerToggle}
            accessibilityRole="button"
          >
            <Calendar size={14} color="#0F766E" />
            <AppText style={styles.datePickerToggleText}>
              {showDatePicker ? 'Hide Calendar' : 'Change Date'}
            </AppText>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => setShowDatePicker((prev) => !prev)}
          style={styles.selectedDateCard}
          activeOpacity={0.8}
        >
          <Calendar size={18} color="#0F766E" />
          <View style={styles.selectedDateInfo}>
            <AppText style={styles.selectedDateMainText}>
              {new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </AppText>
            <AppText style={styles.selectedDateSubText}>
              {dateStr === new Date().toISOString().split('T')[0] ? 'Today' : 'Selected Date'}
            </AppText>
          </View>
        </TouchableOpacity>

        {showDatePicker && (
          <View style={styles.calendarContainer}>
            <DateCalendar
              selectedDate={dateStr}
              minDate={new Date().toISOString().split('T')[0]}
              onSelectDate={(newDate) => {
                setDateStr(newDate);
                setSlotIso('');
                setShowDatePicker(false);
              }}
            />
          </View>
        )}
      </View>

      <View style={styles.fieldSection}>
        <AppText variant="caption" color="secondary" bold style={styles.fieldLabel}>Court</AppText>
        {isAvailLoading ? (
          <AppText variant="caption" color="tertiary">Checking availability...</AppText>
        ) : availableCourts.length === 0 ? (
          <AppText variant="caption" color="tertiary">No courts available on this date.</AppText>
        ) : (
          <View style={styles.timeGrid}>
            {availableCourts.map(c => {
              const priceTag = c.price_per_hour != null ? ` (₹${Number(c.price_per_hour)}/hr)` : '';
              return (
                <Button
                  key={c.court_id}
                  label={`${c.display_name || c.court_name}${priceTag}`}
                  variant={courtId === c.court_id ? 'primary' : 'secondary'}
                  size="sm"
                  fullWidth={false}
                  onPress={() => {
                    setCourtId(c.court_id);
                    setSlotIso('');
                  }}
                />
              );
            })}
          </View>
        )}
      </View>

      {courtId !== '' && (
        <View style={styles.fieldSection}>
          <AppText variant="caption" color="secondary" bold style={styles.fieldLabel}>Time (60 min)</AppText>
          <View style={styles.timeGrid}>
            {selectedCourtSlots.map(slot => {
              const d = new Date(slot.start_at);
              const label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
              const isPast = d.getTime() < Date.now();
              const available = slot.is_available && !isPast;
              const isActive = slotIso === slot.start_at;
              
              return (
                <Button
                  key={slot.start_at}
                  label={label}
                  variant={isActive ? 'primary' : 'secondary'}
                  size="sm"
                  onPress={() => setSlotIso(slot.start_at)}
                  disabled={!available}
                  fullWidth={false}
                  style={!available ? [styles.timeBtn, styles.timeBtnDisabled] : styles.timeBtn}
                />
              );
            })}
          </View>
        </View>
      )}

      <View style={styles.fieldSection}>
        <AppText variant="caption" color="secondary" bold style={styles.fieldLabel}>Number of Players</AppText>
        <View style={styles.timeGrid}>
          {['1','2','3','4','5+'].map(c => (
            <Button
              key={c}
              label={`${c} players`}
              variant={playersCount === c ? 'primary' : 'secondary'}
              size="sm"
              fullWidth={false}
              onPress={() => setPlayersCount(c)}
            />
          ))}
        </View>
      </View>

      <View style={styles.fieldSection}>
        <Input 
          label="Notes (Optional)"
          placeholder="e.g. Doubles practice"
          value={notes}
          onChangeText={setNotes}
        />
      </View>

      {formError && (
        <View style={styles.errorBox}>
          <AppText variant="caption" color="error">{formError}</AppText>
        </View>
      )}
    </View>
  );

  const renderStage2 = () => {
    const court = availableCourts.find(c => c.court_id === courtId);
    const slot = selectedCourtSlots.find(
      s => s.start_at === slotIso || new Date(s.start_at).getTime() === new Date(slotIso).getTime()
    );
    const pName = mode === 'staff' 
      ? (playerId ? playerMembers.find(m => m.user_id === playerId)?.user_full_name : customerText.trim())
      : 'You';

    const rateText = court?.price_per_hour != null ? `₹${Number(court.price_per_hour).toLocaleString('en-IN')}/hour` : 'Free / Included';
    const totalText = court?.price_per_hour != null ? `₹${Number(court.price_per_hour).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹0.00 (Included)';

    return (
      <View style={styles.formContainer}>
        <Card style={styles.summaryCard}>
          <SummaryRow label="Customer" value={pName || 'Member'} />
          <SummaryRow label="Court" value={court?.display_name || court?.court_name || 'Court'} />
          <SummaryRow 
            label="Date" 
            value={new Date(slot?.start_at || '').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} 
          />
          <SummaryRow 
            label="Time" 
            value={`${new Date(slot?.start_at || '').toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })} – ${new Date(slot?.end_at || '').toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`} 
          />
          <SummaryRow label="Duration" value="1 hour" />
          <SummaryRow label="Rate" value={rateText} />
          <SummaryRow label="Players" value={playersCount} />
          
          <View style={styles.divider} />
          <SummaryRow label="Total" value={totalText} isTotal />
        </Card>
        
        {formError && (
          <View style={styles.errorBox}>
            <AppText variant="caption" color="error">{formError}</AppText>
          </View>
        )}
      </View>
    );
  };

  const renderStage3 = () => {
    const court = availableCourts.find(c => c.court_id === courtId);
    const totalAmount = court?.price_per_hour != null 
      ? `₹${Number(court.price_per_hour).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` 
      : '₹0.00';

    return (
      <View style={styles.formContainer}>
        <AppText variant="heading3" style={{ marginBottom: Spacing[2] }}>Payment</AppText>
        <Card style={styles.summaryCard}>
          <AppText variant="body" color="secondary" style={{ marginBottom: Spacing[2] }}>
            Amount Due
          </AppText>
          <AppText variant="heading2" style={{ marginBottom: Spacing[4] }}>{totalAmount}</AppText>
          
          <AppText variant="caption" color="tertiary">
            {court?.price_per_hour != null 
              ? `Court rate is ₹${Number(court.price_per_hour)}/hour. Price is calculated and confirmed by the server.` 
              : 'This booking is fully covered by membership or internal staff credit. No external payment required at this time.'}
          </AppText>
        </Card>
        {formError && (
          <View style={styles.errorBox}>
            <AppText variant="caption" color="error">{formError}</AppText>
          </View>
        )}
      </View>
    );
  };

  const renderStage4 = () => {
    const court = availableCourts.find(c => c.court_id === courtId);
    const slot = selectedCourtSlots.find(
      s => s.start_at === slotIso || new Date(s.start_at).getTime() === new Date(slotIso).getTime()
    );
    const pName = mode === 'staff' 
      ? (playerId ? playerMembers.find(m => m.user_id === playerId)?.user_full_name : customerText.trim())
      : 'You';

    const priceText = court?.price_per_hour != null 
      ? `Total: ₹${Number(court.price_per_hour).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
      : 'Free Booking';

    return (
      <View style={styles.successContainer}>
        <View style={styles.successIcon}>
          <AppText variant="heading1" color="inverse">✓</AppText>
        </View>
        <AppText variant="heading2" style={{ marginBottom: Spacing[2] }}>Booking Confirmed!</AppText>
        <AppText variant="body" color="secondary" style={{ textAlign: 'center', marginBottom: Spacing[4] }}>
          {pName} has been booked for:
        </AppText>
        <Card style={styles.summaryCard}>
          <AppText variant="heading3">{court?.display_name || court?.court_name}</AppText>
          <AppText variant="body" color="secondary">
            {new Date(slot?.start_at || '').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </AppText>
          <AppText variant="body" color="secondary">
            {new Date(slot?.start_at || '').toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })} – {new Date(slot?.end_at || '').toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}
          </AppText>
          <AppText variant="body" color="primary" bold style={{ marginTop: Spacing[1] }}>
            {priceText}
          </AppText>
        </Card>
      </View>
    );
  };

  const getActions = () => {
    switch (stage) {
      case 1:
        return [
          { label: 'Cancel', variant: 'secondary' as const, onPress: handleClose },
          { label: 'Next \u2192 Summary', variant: 'primary' as const, onPress: handleNextToSummary }
        ];
      case 2:
        return [
          { label: 'Back', variant: 'secondary' as const, onPress: () => setStage(1) },
          { label: 'Continue to Payment', variant: 'primary' as const, onPress: handleConfirmSummary }
        ];
      case 3:
        return [
          { label: 'Back', variant: 'secondary' as const, onPress: () => setStage(2), disabled: isSubmitting },
          { label: isSubmitting ? 'Booking...' : 'Confirm & Book', variant: 'primary' as const, onPress: handleCompletePayment, loading: isSubmitting, disabled: isSubmitting }
        ];
      case 4:
        return [
          { label: 'Close', variant: 'primary' as const, onPress: handleClose }
        ];
    }
  };

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <View style={styles.headerTopRow}>
        <AppText variant="heading2" style={styles.headerTitle}>
          {stage === 4 ? 'Booking Confirmed' : 'New Booking'}
        </AppText>
        <TouchableOpacity
          onPress={handleClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.closeButton}
        >
          <AppText style={styles.closeIcon}>✕</AppText>
        </TouchableOpacity>
      </View>
      {stage !== 4 && (
        <View style={styles.stepTitleRow}>
          <AppText variant="heading3" style={styles.stepTitle}>
            {stage === 1 ? 'Step 1 — Details' : stage === 2 ? 'Step 2 — Summary' : 'Step 3 — Payment'}
          </AppText>
        </View>
      )}
    </View>
  );

  const renderFooter = () => {
    if (stage === 4) {
      return (
        <View style={styles.footerContainer}>
          <Button label="Close" variant="primary" onPress={handleClose} fullWidth />
        </View>
      );
    }
    const actions = getActions();
    return (
      <View style={styles.footerContainer}>
        {actions.map((act) => (
          <Button 
            key={act.label} 
            label={act.label} 
            variant={act.variant} 
            onPress={act.onPress} 
            loading={'loading' in act ? act.loading : undefined}
            disabled={'disabled' in act ? act.disabled : undefined}
            style={{ flex: 1 }}
          />
        ))}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          {renderHeader()}

          {stage !== 4 && (
            <View style={styles.progressRow}>
              {[1, 2, 3, 4].map(s => (
                <View key={s} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <View style={[styles.progressBubble, stage >= s && styles.progressBubbleActive]}>
                    <AppText variant="caption" color={stage >= s ? 'inverse' : 'secondary'} bold>{s}</AppText>
                  </View>
                  {s !== 4 && <View style={[styles.progressLine, stage > s && styles.progressLineActive]} />}
                </View>
              ))}
            </View>
          )}

          <ScrollView 
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {stage === 1 && renderStage1()}
            {stage === 2 && renderStage2()}
            {stage === 3 && renderStage3()}
            {stage === 4 && renderStage4()}
          </ScrollView>

          {renderFooter()}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function SummaryRow({ label, value, isTotal }: { label: string, value: string, isTotal?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <AppText variant={isTotal ? 'body' : 'caption'} color="secondary" bold={isTotal} style={styles.summaryLabel}>{label}</AppText>
      <AppText variant={isTotal ? 'heading3' : 'body'} bold>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background.primary },
  keyboardView: { flex: 1 },
  bodyScroll: { flex: 1 },
  bodyContent: { paddingBottom: Spacing[8] },
  
  headerContainer: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[3],
    paddingBottom: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
    backgroundColor: Colors.background.primary,
  },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing[1] },
  headerTitle: { color: Colors.text.primary, fontWeight: '700', fontSize: 20 },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surface.elevated, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { fontSize: 16, color: Colors.text.secondary, fontWeight: '600' },
  stepTitleRow: { marginTop: Spacing[1] },
  stepTitle: { color: Colors.text.primary, fontWeight: '600', fontSize: 16 },

  footerContainer: {
    flexDirection: 'row',
    padding: Spacing[4],
    gap: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: Colors.surface.border,
    backgroundColor: Colors.background.primary,
  },

  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing[4],
    marginTop: Spacing[4],
    paddingHorizontal: Spacing[4],
  },
  progressBubble: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.background.secondary,
    alignItems: 'center', justifyContent: 'center'
  },
  progressBubbleActive: {
    backgroundColor: Colors.brand.primary,
  },
  progressLine: {
    flex: 1, height: 2, backgroundColor: Colors.surface.border,
    marginHorizontal: 4,
  },
  progressLineActive: {
    backgroundColor: Colors.brand.primary,
  },
  formContainer: { gap: Spacing[4], paddingHorizontal: Spacing[4] },
  fieldSection: { marginBottom: Spacing[2], zIndex: 1 },
  fieldLabel: { marginBottom: Spacing[2] },
  dateHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[2],
  },
  datePickerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  datePickerToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F766E',
  },
  selectedDateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    padding: Spacing[3],
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  selectedDateInfo: {
    flex: 1,
  },
  selectedDateMainText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  selectedDateSubText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  calendarContainer: {
    marginTop: Spacing[2],
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: Spacing[2],
  },
  timeGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[3]
  },
  timeBtn: { minWidth: 100 },
  timeBtnDisabled: { opacity: 0.5 },
  errorBox: {
    backgroundColor: Colors.status.errorBg,
    padding: Spacing[4], borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.status.error,
    marginHorizontal: Spacing[4]
  },
  summaryCard: {
    marginHorizontal: Spacing[4],
    padding: Spacing[5],
    gap: Spacing[3],
    borderRadius: Radius.lg,
  },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
  },
  summaryLabel: { width: 120 },
  divider: { height: 1, backgroundColor: Colors.surface.border, marginVertical: Spacing[3] },
  successContainer: {
    alignItems: 'center', paddingVertical: Spacing[8]
  },
  successIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.brand.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing[4]
  },
  suggestionsDropdown: {
    position: 'absolute',
    top: 68,
    left: Spacing[4],
    right: Spacing[4],
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surface.borderLight,
    maxHeight: 200,
    zIndex: 100,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  suggestionItem: {
    padding: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.borderLight,
  }
});
