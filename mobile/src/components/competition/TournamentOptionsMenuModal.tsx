/**
 * Aught2 Pickleball — TournamentOptionsMenuModal
 *
 * Professional, modern action sheet for the three-dot menu on tournament cards:
 * - Clear header displaying tournament title, format, and current lifecycle status.
 * - Dedicated close button (X).
 * - Well-spaced, interactive action rows with icons, subtitles, and chevron indicators.
 * - "Manage Competition" is completely removed (since Manage is on the banner).
 * - Status-based actions:
 *     - Draft: "Publish & Open Registration" + "Tournament Settings & Roster"
 *     - Registration Open, Closed, In Progress, Completed: "Tournament Settings & Roster"
 * - Responsive: slides up as a bottom sheet on mobile; centered modal on desktop/tablet.
 */

import React from 'react';
import {
  Modal,
  Platform,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  ChevronRight,
  Lock,
  Send,
  SlidersHorizontal,
  Trophy,
  X,
} from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Colors, Radius, Spacing } from '@/theme';
import type { Tournament } from '@/types';

interface TournamentOptionsMenuModalProps {
  visible: boolean;
  onClose: () => void;
  tournament: Tournament | null;
  onPublishPress?: (tournament: Tournament) => void;
  onCloseRegistrationPress?: (tournament: Tournament) => void;
  onViewResultsPress?: (tournament: Tournament) => void;
  onSettingsPress: (tournament: Tournament) => void;
  onCancelPress?: (tournament: Tournament) => void;
}

function getStatusBadgeDetails(status?: string) {
  switch (status?.toLowerCase()) {
    case 'in_progress':
      return { bg: '#D4E5FC', text: '#1D4ED8', label: 'IN PROGRESS' };
    case 'cancelled':
      return { bg: '#FFD8D8', text: '#DC2626', label: 'CANCELLED' };
    case 'completed':
      return { bg: '#5A6F82', text: '#FFFFFF', label: 'COMPLETED' };
    case 'registration_open':
    case 'open':
      return { bg: '#E3F3EA', text: '#18794E', label: 'REGISTRATION OPEN' };
    case 'registration_closed':
      return { bg: '#F1F5F9', text: '#475569', label: 'REGISTRATION CLOSED' };
    case 'draft':
    default:
      return { bg: '#FFF3D6', text: '#B45309', label: 'DRAFT' };
  }
}

export function TournamentOptionsMenuModal({
  visible,
  onClose,
  tournament,
  onPublishPress,
  onCloseRegistrationPress,
  onViewResultsPress,
  onSettingsPress,
  onCancelPress,
}: TournamentOptionsMenuModalProps) {
  const insets = useSafeAreaInsets();
  if (!tournament) return null;

  const statusLower = String(tournament.status).toLowerCase();
  const isDraft = statusLower === 'draft';
  const isRegOpen = statusLower === 'registration_open' || statusLower === 'open';
  const isCompleted = statusLower === 'completed';
  const statusDetails = getStatusBadgeDetails(tournament.status);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View
              style={[
                styles.sheetContainer,
                { paddingBottom: Math.max(insets.bottom, Spacing[4]) + Spacing[2] },
              ]}
            >
              {/* Drag Handle Indicator on Mobile */}
              <View style={styles.dragHandle} />

              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerTextWrap}>
                  <AppText style={styles.title} numberOfLines={2}>
                    {tournament.name}
                  </AppText>
                  <View style={styles.statusRow}>
                    <View style={[styles.statusBadge, { backgroundColor: statusDetails.bg }]}>
                      <AppText style={[styles.statusBadgeText, { color: statusDetails.text }]}>
                        {statusDetails.label}
                      </AppText>
                    </View>
                    <AppText variant="caption" color="secondary">
                      {tournament.format_label}
                    </AppText>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Close menu"
                >
                  <X size={18} color="#475569" />
                </TouchableOpacity>
              </View>

              <View style={styles.divider} />

              {/* Actions List */}
              <View style={styles.actionsList}>
                {/* 1. Publish & Open Registration (Draft only) */}
                {isDraft && onPublishPress && (
                  <TouchableOpacity
                    style={[styles.actionRow, styles.actionRowPublish]}
                    onPress={() => {
                      onClose();
                      onPublishPress(tournament);
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Publish & Open Registration"
                  >
                    <View style={styles.actionIconWrapPublish}>
                      <Send size={18} color="#087A60" />
                    </View>
                    <View style={styles.actionTextWrap}>
                      <AppText style={styles.actionTitlePublish}>
                        Publish & Open Registration
                      </AppText>
                      <AppText variant="caption" color="secondary" style={styles.actionDesc}>
                        Make public and open registration for players in the Player App
                      </AppText>
                    </View>
                    <ChevronRight size={18} color="#087A60" />
                  </TouchableOpacity>
                )}

                {/* 2. Close Registration (Registration Open only) */}
                {isRegOpen && onCloseRegistrationPress && (
                  <TouchableOpacity
                    style={[styles.actionRow, styles.actionRowCloseReg]}
                    onPress={() => {
                      onClose();
                      onCloseRegistrationPress(tournament);
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Close Registration"
                  >
                    <View style={styles.actionIconWrapCloseReg}>
                      <Lock size={18} color="#D97706" />
                    </View>
                    <View style={styles.actionTextWrap}>
                      <AppText style={styles.actionTitleCloseReg}>
                        Close Registration
                      </AppText>
                      <AppText variant="caption" color="secondary" style={styles.actionDesc}>
                        Lock registrations, finalize rosters, and enable matchup generation
                      </AppText>
                    </View>
                    <ChevronRight size={18} color="#D97706" />
                  </TouchableOpacity>
                )}

                {/* 3. View Final Results (Completed only) */}
                {isCompleted && onViewResultsPress && (
                  <TouchableOpacity
                    style={[styles.actionRow, styles.actionRowResults]}
                    onPress={() => {
                      onClose();
                      onViewResultsPress(tournament);
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="View Final Results"
                  >
                    <View style={styles.actionIconWrapResults}>
                      <Trophy size={18} color="#087A60" />
                    </View>
                    <View style={styles.actionTextWrap}>
                      <AppText style={styles.actionTitleResults}>
                        View Final Results
                      </AppText>
                      <AppText variant="caption" color="secondary" style={styles.actionDesc}>
                        View completed podium, match scores, and final standings
                      </AppText>
                    </View>
                    <ChevronRight size={18} color="#087A60" />
                  </TouchableOpacity>
                )}

                {/* 2. Tournament Settings & Roster */}
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => {
                    onClose();
                    onSettingsPress(tournament);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Tournament Settings & Roster"
                >
                  <View style={styles.actionIconWrapSettings}>
                    <SlidersHorizontal size={18} color="#1E293B" />
                  </View>
                  <View style={styles.actionTextWrap}>
                    <AppText style={styles.actionTitle}>
                      Tournament Settings & Roster
                    </AppText>
                    <AppText variant="caption" color="secondary" style={styles.actionDesc}>
                      Manage lifecycle, capacity limits, and participant roster
                    </AppText>
                  </View>
                  <ChevronRight size={18} color="#94A3B8" />
                </TouchableOpacity>

                {/* 3. Cancel Tournament (Destructive) */}
                {tournament.status !== 'cancelled' && tournament.status !== 'completed' && onCancelPress && (
                  <TouchableOpacity
                    style={[styles.actionRow, styles.actionRowCancel]}
                    onPress={() => {
                      onClose();
                      onCancelPress(tournament);
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel Tournament"
                  >
                    <View style={styles.actionIconWrapCancel}>
                      <AlertTriangle size={18} color="#DC2626" />
                    </View>
                    <View style={styles.actionTextWrap}>
                      <AppText style={styles.actionTitleCancel}>
                        Cancel Tournament
                      </AppText>
                      <AppText variant="caption" color="secondary" style={styles.actionDesc}>
                        Stop tournament, lock registrations and mark as cancelled
                      </AppText>
                    </View>
                    <ChevronRight size={18} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Cancel Button */}
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onClose}
                activeOpacity={0.8}
                accessibilityLabel="Cancel"
              >
                <AppText style={styles.cancelBtnText}>Cancel</AppText>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheetContainer: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 440 : undefined,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: Spacing[2.5],
    paddingHorizontal: Spacing[4],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
    alignSelf: 'center',
    ...(Platform.OS === 'web'
      ? {
          borderRadius: 24,
          marginBottom: 30,
        }
      : {}),
  },
  dragHandle: {
    width: 38,
    height: 4,
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing[2],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: Spacing[1],
    gap: Spacing[2],
  },
  headerTextWrap: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 22,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  statusBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: Spacing[3],
  },
  actionsList: {
    gap: Spacing[2.5],
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[3.5],
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: Spacing[3],
  },
  actionRowPublish: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  actionRowCloseReg: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  actionRowResults: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  actionRowCancel: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  actionIconWrapPublish: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconWrapCloseReg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconWrapResults: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconWrapCancel: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconWrapSettings: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTextWrap: {
    flex: 1,
    gap: 2,
  },
  actionTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  actionTitlePublish: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#087A60',
  },
  actionTitleCloseReg: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#D97706',
  },
  actionTitleResults: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#087A60',
  },
  actionTitleCancel: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#DC2626',
  },
  actionDesc: {
    fontSize: 11.5,
    lineHeight: 15,
  },
  cancelBtn: {
    marginTop: Spacing[3.5],
    backgroundColor: '#F1F5F9',
    paddingVertical: Spacing[3],
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
  },
});
