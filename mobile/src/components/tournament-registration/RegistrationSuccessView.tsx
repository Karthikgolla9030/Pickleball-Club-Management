/**
 * Aught2 Pickleball — Registration Success View
 *
 * Displays post-registration confirmation with reference ID,
 * participant details, payment summary, and format-specific next steps.
 */

import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  MapPin,
  Tag,
  Users,
} from 'lucide-react-native';

import { AppText } from '../AppText';
import { formatDate } from '@/utils';
import type { PlayerRegistrationResponse, Tournament, TournamentDiscoveryItem } from '@/types';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';
import type { RegistrationFormState } from './types';

interface SuccessViewProps {
  tournament: TournamentDiscoveryItem | Tournament;
  formState: RegistrationFormState;
  result: PlayerRegistrationResponse;
  onDone: () => void;
}

export function RegistrationSuccessView({
  tournament,
  formState,
  result,
  onDone,
}: SuccessViewProps) {
  const isWaitlist = result.status === 'waitlisted';
  const parsed = parseTournamentConfig(tournament);
  const isDoubles = !parsed.isSingles;
  const isScramble = tournament.format === 'scramble';

  const refNumber = result.reference_number || `REG-2026-${result.id.slice(0, 6).toUpperCase()}`;

  const displayName = isDoubles
    ? formState.teamName || `${formState.fullName} & Partner`
    : formState.fullName;

  const dateText = tournament.start_date
    ? formatDate(tournament.start_date)
    : '22 Sep 2026';

  return (
    <View style={styles.container}>
      {/* ─── Hero Icon & Status ─── */}
      <View style={styles.heroSection}>
        <View style={[styles.successCircle, isWaitlist && styles.waitlistCircle]}>
          {isWaitlist ? (
            <Clock size={36} color="#D97706" strokeWidth={2.4} />
          ) : (
            <Check size={38} color="#15803D" strokeWidth={2.6} />
          )}
        </View>

        <AppText variant="heading2" style={styles.heroTitle}>
          {isWaitlist ? 'Added to Tournament Waitlist' : 'Registration Confirmed!'}
        </AppText>

        <AppText variant="caption" style={styles.heroSubtitle}>
          {isWaitlist
            ? 'The tournament capacity is currently full. You will be notified automatically if a spot opens up.'
            : 'You are officially registered. We look forward to seeing you on the courts!'}
        </AppText>

        {/* Reference Number Pill */}
        <View style={styles.refPill}>
          <AppText variant="caption" style={styles.refPillLabel}>
            Ref:
          </AppText>
          <AppText variant="caption" bold style={styles.refPillValue}>
            {refNumber}
          </AppText>
        </View>
      </View>

      {/* ─── Confirmation Card ─── */}
      <View style={styles.detailsCard}>
        <View style={styles.cardHeader}>
          <AppText variant="bodySmall" bold style={styles.cardTitle}>
            REGISTRATION SUMMARY
          </AppText>
        </View>

        <View style={styles.detailRow}>
          <AppText variant="caption" style={styles.rowLabel}>
            Tournament
          </AppText>
          <AppText variant="caption" bold style={styles.rowValue}>
            {tournament.name}
          </AppText>
        </View>

        <View style={styles.detailRow}>
          <AppText variant="caption" style={styles.rowLabel}>
            Category / Division
          </AppText>
          <AppText variant="caption" style={styles.rowValue}>
            {parsed.category}
          </AppText>
        </View>

        <View style={styles.detailRow}>
          <AppText variant="caption" style={styles.rowLabel}>
            Participant
          </AppText>
          <AppText variant="caption" bold style={styles.rowValue}>
            {displayName}
          </AppText>
        </View>

        <View style={styles.detailRow}>
          <AppText variant="caption" style={styles.rowLabel}>
            Event Date
          </AppText>
          <AppText variant="caption" style={styles.rowValue}>
            {dateText}
          </AppText>
        </View>

        <View style={styles.detailRow}>
          <AppText variant="caption" style={styles.rowLabel}>
            Location
          </AppText>
          <AppText variant="caption" style={styles.rowValue}>
            {tournament.location_name || 'Main Courts'}
          </AppText>
        </View>

        <View style={styles.detailRow}>
          <AppText variant="caption" style={styles.rowLabel}>
            Payment Status
          </AppText>
          <View style={styles.statusBadge}>
            <CheckCircle2 size={12} color="#15803D" />
            <AppText variant="caption" bold style={styles.statusBadgeText}>
              {result.payment_status === 'completed' || !isWaitlist ? 'Paid & Confirmed' : 'Pending Spot'}
            </AppText>
          </View>
        </View>
      </View>

      {/* ─── Helpful Format Guidance Note ─── */}
      <View style={styles.guidanceBox}>
        <AppText variant="caption" style={styles.guidanceTitle}>
          What happens next?
        </AppText>
        <AppText variant="caption" style={styles.guidanceText}>
          {isScramble
            ? '• Automatic Rotation: Partners will be automatically assigned and rotated for each match round once play commences.'
            : isDoubles
            ? '• Fixed Team: You and your partner are registered together. You can review standings and match schedules in the app.'
            : '• Singles Draw: You will be placed in the singles schedule. Match timings will be published before the tournament.'}
        </AppText>
      </View>

      {/* ─── Primary Done Button ─── */}
      <TouchableOpacity style={styles.doneButton} onPress={onDone} activeOpacity={0.88}>
        <AppText variant="body" bold style={styles.doneButtonText}>
          Done / Return to Tournaments
        </AppText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
    alignItems: 'center',
    gap: 16,
  },
  heroSection: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  successCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#DCFCE7',
    borderWidth: 2,
    borderColor: '#86EFAC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  waitlistCircle: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  heroTitle: {
    fontSize: 20,
    color: '#0E2A22',
    textAlign: 'center',
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
  },
  refPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  refPillLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  refPillValue: {
    fontSize: 12.5,
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  detailsCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 10,
  },
  cardHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 6,
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: 11.5,
    color: '#64748B',
    letterSpacing: 0.5,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabel: {
    color: '#64748B',
    fontSize: 12.5,
  },
  rowValue: {
    color: '#0F172A',
    fontSize: 12.5,
    textAlign: 'right',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F7ED',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    color: '#15803D',
  },
  guidanceBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    gap: 4,
  },
  guidanceTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  guidanceText: {
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 16,
  },
  doneButton: {
    width: '100%',
    height: 52,
    backgroundColor: '#104E3E',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 15.5,
  },
});
