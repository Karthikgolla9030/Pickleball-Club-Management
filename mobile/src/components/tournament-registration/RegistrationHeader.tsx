/**
 * Aught2 Pickleball — Tournament Registration Header
 *
 * Implements the exact header layout from the reference UI:
 * - Top bar: Left back arrow [←], Right close button [✕] (clean, minimal header without brand logo)
 * - Tournament Title (e.g. "Metro Round Robin Championship")
 * - Badges row: Format pill (ROUND ROBIN) + Division pill (MEN'S DOUBLES)
 * - 3-Step Progress Indicator:
 *     (1) Player details ─── (2) Review ─── (3) Payment
 * - Step Title & Subtitle:
 *     Step 1: "Player details" / "Register your team for this tournament."
 *     Step 2: "Review registration" / "Check your details before payment."
 *     Step 3: "Payment" / "Complete your tournament registration."
 * - Compact Tournament Summary Card (2x2 grid):
 *     Row 1: 📅 Dates  |  💰 Fee
 *     Row 2: 📍 Courts |  👥 Spots left
 */

import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowLeft,
  Calendar,
  Check,
  CircleDollarSign,
  MapPin,
  Users,
  X,
} from 'lucide-react-native';

import { AppText } from '../AppText';
import { formatDate } from '@/utils';
import type { Tournament, TournamentDiscoveryItem, TournamentFormat } from '@/types';
import type { RegistrationStep } from './types';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';

interface RegistrationHeaderProps {
  tournament: TournamentDiscoveryItem | Tournament;
  currentStep: RegistrationStep;
  onBack: () => void;
  onClose?: () => void;
}

function formatShortDate(dateStr?: string | null): string {
  if (!dateStr) return 'TBD';
  try {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  } catch {
    return dateStr;
  }
}

function formatTournamentDates(startStr?: string | null, endStr?: string | null): string {
  if (!startStr) return '9 Oct';
  const startFmt = formatShortDate(startStr);
  if (!endStr || startStr === endStr) return startFmt;
  const endFmt = formatShortDate(endStr);
  return `${startFmt} – ${endFmt}`;
}

export function RegistrationHeader({
  tournament,
  currentStep,
  onBack,
  onClose,
}: RegistrationHeaderProps) {
  const parsed = parseTournamentConfig(tournament);
  const isDoubles = !parsed.isSingles;
  const format = tournament.format as TournamentFormat;

  // Format theme colors
  const formatTheme = getFormatTheme(format);

  // Fee calculation display (from Club configuration or format defaults)
  const rawFee = (tournament as any).registration_fee != null
    ? Number((tournament as any).registration_fee)
    : (tournament as any).format_configuration?.entry_fee != null
    ? Number((tournament as any).format_configuration.entry_fee)
    : (tournament as any).format_configuration?.registration_fee != null
    ? Number((tournament as any).format_configuration.registration_fee)
    : null;
  const defaultFee = tournament.format === 'scramble'
    ? 35
    : parsed.isSingles
    ? 30
    : tournament.format === 'bracket'
    ? 60
    : 50;
  const feeNumber = rawFee !== null && !isNaN(rawFee) ? rawFee : defaultFee;

  const feeText = feeNumber === 0
    ? 'Free entry'
    : isDoubles
    ? `$${feeNumber} per team`
    : `$${feeNumber} per player`;

  // Capacity calculation
  const registeredCount = tournament.participant_count ?? 0;
  const maxCap = tournament.max_participants ?? 16;
  const spotsLeft = Math.max(0, maxCap - registeredCount);

  // Dates display
  const dateDisplay = formatTournamentDates(tournament.start_date, tournament.end_date);

  // Venue display
  const locationDisplay = tournament.location_name || 'Center Courts 1–4';

  // Category/Division display
  const divisionDisplay = (parsed.category || "Men's Doubles").toUpperCase();

  // Subtitle text
  const getSubheading = () => {
    switch (currentStep) {
      case 1:
        return {
          title: 'Player details',
          subtitle: isDoubles
            ? 'Register your team for this tournament.'
            : 'Register your details for this tournament.',
        };
      case 2:
        return {
          title: 'Review registration',
          subtitle: 'Check your details before payment.',
        };
      case 3:
        return {
          title: 'Payment',
          subtitle: 'Complete your tournament registration.',
        };
      default:
        return { title: 'Player details', subtitle: 'Register for this tournament.' };
    }
  };

  const subheading = getSubheading();

  return (
    <View style={styles.headerRoot}>
      {/* ─── 1. Top Bar: Back [←] and Close [✕] ─── */}
      <View style={styles.navBar}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <ArrowLeft size={22} color="#0F2E28" strokeWidth={2.4} />
        </TouchableOpacity>

        {onClose ? (
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Close registration"
            accessibilityRole="button"
          >
            <X size={20} color="#64748B" strokeWidth={2} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backButtonPlaceholder} />
        )}
      </View>

      <View style={styles.mainContent}>
        {/* ─── 2. Tournament Title & Format Badges ─── */}
        <AppText style={styles.tournamentTitle} numberOfLines={2}>
          {tournament.name}
        </AppText>

        <View style={styles.badgesRow}>
          {/* Format Badge */}
          <View style={[styles.formatBadge, { backgroundColor: formatTheme.badgeBg }]}>
            <AppText style={[styles.formatBadgeText, { color: formatTheme.badgeText }]}>
              {tournament.format_label ? tournament.format_label.toUpperCase() : format.toUpperCase()}
            </AppText>
          </View>

          {/* Category / Division Badge */}
          <View style={styles.divisionBadge}>
            <AppText style={styles.divisionBadgeText}>{divisionDisplay}</AppText>
          </View>

          {/* Skill Level Badge */}
          <View style={styles.skillLevelBadge}>
            <AppText style={styles.skillLevelBadgeText}>
              {parsed.skillLevel ? `${parsed.skillLevel} LEVEL` : 'ALL LEVELS'}
            </AppText>
          </View>
        </View>

        {/* ─── 3. Three-Step Progress Indicator ─── */}
        <View style={styles.progressContainer}>
          {/* Step 1 Node */}
          <View style={styles.stepNode}>
            <View style={[styles.stepCircle, currentStep >= 1 ? styles.stepCircleActive : styles.stepCircleInactive]}>
              {currentStep > 1 ? (
                <Check size={13} color="#FFFFFF" strokeWidth={2.8} />
              ) : (
                <AppText style={styles.stepNumberActive}>1</AppText>
              )}
            </View>
            <AppText style={[styles.stepLabel, currentStep === 1 && styles.stepLabelActive]}>
              Player details
            </AppText>
          </View>

          {/* Line 1 -> 2 */}
          <View style={[styles.connectorLine, currentStep > 1 ? styles.connectorLineActive : styles.connectorLineInactive]} />

          {/* Step 2 Node */}
          <View style={styles.stepNode}>
            <View style={[styles.stepCircle, currentStep >= 2 ? styles.stepCircleActive : styles.stepCircleInactive]}>
              {currentStep > 2 ? (
                <Check size={13} color="#FFFFFF" strokeWidth={2.8} />
              ) : (
                <AppText style={currentStep >= 2 ? styles.stepNumberActive : styles.stepNumberInactive}>2</AppText>
              )}
            </View>
            <AppText style={[styles.stepLabel, currentStep === 2 && styles.stepLabelActive]}>
              Review
            </AppText>
          </View>

          {/* Line 2 -> 3 */}
          <View style={[styles.connectorLine, currentStep >= 3 ? styles.connectorLineActive : styles.connectorLineInactive]} />

          {/* Step 3 Node */}
          <View style={styles.stepNode}>
            <View style={[styles.stepCircle, currentStep === 3 ? styles.stepCircleActive : styles.stepCircleInactive]}>
              <AppText style={currentStep === 3 ? styles.stepNumberActive : styles.stepNumberInactive}>3</AppText>
            </View>
            <AppText style={[styles.stepLabel, currentStep === 3 && styles.stepLabelActive]}>
              Payment
            </AppText>
          </View>
        </View>

        {/* ─── 4. Subheading ─── */}
        <View style={styles.subheadingContainer}>
          <AppText style={styles.stepHeading}>{subheading.title}</AppText>
          <AppText style={styles.stepSubtitle}>{subheading.subtitle}</AppText>
        </View>

        {/* ─── 5. Compact Tournament Summary Card ─── */}
        <View style={styles.summaryCard}>
          {/* Row 1: Dates & Fee */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Calendar size={15} color="#064E3B" style={styles.summaryIcon} strokeWidth={2} />
              <AppText style={styles.summaryText}>{dateDisplay}</AppText>
            </View>
            <View style={styles.summaryItem}>
              <CircleDollarSign size={15} color="#064E3B" style={styles.summaryIcon} strokeWidth={2} />
              <AppText style={styles.summaryText}>{feeText}</AppText>
            </View>
          </View>

          {/* Row 2: Location & Spots */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <MapPin size={15} color="#064E3B" style={styles.summaryIcon} strokeWidth={2} />
              <AppText style={styles.summaryText} numberOfLines={1}>{locationDisplay}</AppText>
            </View>
            <View style={styles.summaryItem}>
              <Users size={15} color="#064E3B" style={styles.summaryIcon} strokeWidth={2} />
              <AppText style={styles.summaryText}>{spotsLeft} spots left</AppText>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

export function getFormatTheme(format?: TournamentFormat | string) {
  switch (format) {
    case 'round_robin':
      return {
        badgeBg: '#DDEBFF',
        badgeText: '#2563EB',
        cardBg: '#EFF6FF',
        cardBorder: '#BFDBFE',
        iconBg: '#DBEAFE',
        iconColor: '#2563EB',
        primaryAccent: '#2563EB',
      };
    case 'pool_play':
      return {
        badgeBg: '#EDE9FE',
        badgeText: '#7C3AED',
        cardBg: '#FAF5FF',
        cardBorder: '#E9D5FF',
        iconBg: '#EDE9FE',
        iconColor: '#7C3AED',
        primaryAccent: '#7C3AED',
      };
    case 'bracket':
      return {
        badgeBg: '#FFEDD5',
        badgeText: '#EA580C',
        cardBg: '#FFF7ED',
        cardBorder: '#FED7AA',
        iconBg: '#FFEDD5',
        iconColor: '#EA580C',
        primaryAccent: '#EA580C',
      };
    case 'scramble':
    default:
      return {
        badgeBg: '#DCFCE7',
        badgeText: '#15803D',
        cardBg: '#F0FDF4',
        cardBorder: '#BBF7D0',
        iconBg: '#DCFCE7',
        iconColor: '#064E3B',
        primaryAccent: '#064E3B',
      };
  }
}

const styles = StyleSheet.create({
  headerRoot: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonPlaceholder: {
    width: 36,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  tournamentTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F2E28',
    lineHeight: 25,
    marginTop: 4,
    marginBottom: 8,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  formatBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  formatBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  divisionBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  divisionBadgeText: {
    color: '#15803D',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  skillLevelBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  skillLevelBadgeText: {
    color: '#B45309',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  stepNode: {
    alignItems: 'center',
    width: 80,
  },
  stepCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stepCircleActive: {
    backgroundColor: '#064E3B',
  },
  stepCircleInactive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  stepNumberActive: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  stepNumberInactive: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  stepLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    textAlign: 'center',
  },
  stepLabelActive: {
    color: '#064E3B',
    fontWeight: '700',
  },
  connectorLine: {
    flex: 1,
    height: 2,
    marginTop: -16,
    marginHorizontal: -4,
  },
  connectorLineActive: {
    backgroundColor: '#064E3B',
  },
  connectorLineInactive: {
    backgroundColor: '#E2E8F0',
  },
  subheadingContainer: {
    marginBottom: 12,
  },
  stepHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F2E28',
    marginBottom: 2,
  },
  stepSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
  },
  summaryCard: {
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#E2EAE6',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  summaryIcon: {
    flexShrink: 0,
  },
  summaryText: {
    fontSize: 12.5,
    color: '#102B2A',
    fontWeight: '600',
    flexShrink: 1,
  },
});
