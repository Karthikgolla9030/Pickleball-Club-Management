/**
 * Aught2 Pickleball — LeagueOptionsMenuModal Component
 *
 * Professional, modern action sheet for the three-dot menu on league cards and detail header:
 * - Matches TournamentOptionsMenuModal pixel-for-pixel in visual style, typography, and animation.
 * - Clear header displaying league title, format/weeks/teams summary, and lifecycle status badge.
 * - Dedicated close button (X) and drag handle.
 * - Well-spaced, interactive action rows with icons, subtitles, and chevron indicators.
 * - Strictly respects persisted backend lifecycle status and user permissions.
 * - Prevents duplicate submissions while an action is processing.
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
  Calendar,
  CheckCircle2,
  ChevronRight,
  Lock,
  Play,
  Send,
  SlidersHorizontal,
  Trophy,
  X,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Radius, Spacing } from '@/theme';
import type { LeagueSummary } from '@/types';

export interface LeagueOptionsMenuModalProps {
  visible: boolean;
  onClose: () => void;
  league: LeagueSummary | null;
  canManage?: boolean;
  isProcessing?: boolean;
  onPublishPress?: (league: LeagueSummary) => void;
  onCloseRegistrationPress?: (league: LeagueSummary) => void;
  onStartLeaguePress?: (league: LeagueSummary) => void;
  onGenerateSchedulePress?: (league: LeagueSummary) => void;
  onGeneratePlayoffsPress?: (league: LeagueSummary) => void;
  onCompletePress?: (league: LeagueSummary) => void;
  onViewResultsPress?: (league: LeagueSummary) => void;
  onManagePress?: (league: LeagueSummary) => void;
  onCancelPress?: (league: LeagueSummary) => void;
}

export function getLeagueStatusBadgeDetails(status?: string) {
  switch (status?.toLowerCase()) {
    case 'in_progress':
      return { bg: '#D4E5FC', text: '#1D4ED8', label: 'LIVE / IN PROGRESS' };
    case 'playoffs':
      return { bg: '#EAE4FC', text: '#7C3AED', label: 'PLAYOFFS' };
    case 'cancelled':
      return { bg: '#FFD8D8', text: '#DC2626', label: 'CANCELLED' };
    case 'completed':
      return { bg: '#5A6F82', text: '#FFFFFF', label: 'COMPLETED' };
    case 'registration_open':
    case 'open':
      return { bg: '#E3F3EA', text: '#18794E', label: 'REGISTRATION OPEN' };
    case 'registration_closed':
    case 'closed':
      return { bg: '#F1F5F9', text: '#475569', label: 'REGISTRATION CLOSED' };
    case 'draft':
    default:
      return { bg: '#FFF3D6', text: '#B45309', label: 'DRAFT' };
  }
}

export function LeagueOptionsMenuModal({
  visible,
  onClose,
  league,
  canManage = true,
  isProcessing = false,
  onPublishPress,
  onCloseRegistrationPress,
  onStartLeaguePress,
  onGenerateSchedulePress,
  onGeneratePlayoffsPress,
  onCompletePress,
  onViewResultsPress,
  onManagePress,
  onCancelPress,
}: LeagueOptionsMenuModalProps) {
  const insets = useSafeAreaInsets();
  if (!league) return null;

  const statusLower = String(league.status).toLowerCase();
  const isDraft = statusLower === 'draft';
  const isRegOpen = statusLower === 'registration_open' || statusLower === 'open';
  const isRegClosed = statusLower === 'registration_closed' || statusLower === 'closed';
  const isInProgress = statusLower === 'in_progress';
  const isPlayoffs = statusLower === 'playoffs';
  const isCompleted = statusLower === 'completed';
  const isCancelled = statusLower === 'cancelled';

  const statusDetails = getLeagueStatusBadgeDetails(league.status);
  const formatLabel = league.team_size === 1 ? 'Singles' : 'Doubles';
  const totalWeeks = league.number_of_weeks || 4;
  const teamCount = league.teams_count ?? 0;
  const maxTeams = league.max_teams || 12;

  const summarySubtitle = `${totalWeeks} Weeks • ${formatLabel} • ${teamCount}/${maxTeams} Teams`;

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
              {/* Drag Handle Indicator */}
              <View style={styles.dragHandle} />

              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerTextWrap}>
                  <AppText style={styles.title} numberOfLines={2}>
                    {league.name}
                  </AppText>
                  <View style={styles.statusRow}>
                    <View style={[styles.statusBadge, { backgroundColor: statusDetails.bg }]}>
                      <AppText style={[styles.statusBadgeText, { color: statusDetails.text }]}>
                        {statusDetails.label}
                      </AppText>
                    </View>
                    <AppText variant="caption" color="secondary" numberOfLines={1}>
                      {summarySubtitle}
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
                {isDraft && canManage && onPublishPress && (
                  <TouchableOpacity
                    style={[styles.actionRow, styles.actionRowPublish, isProcessing && styles.actionDisabled]}
                    onPress={() => {
                      if (isProcessing) return;
                      onClose();
                      onPublishPress(league);
                    }}
                    disabled={isProcessing}
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
                        Open public registration for players and teams
                      </AppText>
                    </View>
                    <ChevronRight size={18} color="#087A60" />
                  </TouchableOpacity>
                )}

                {/* 2. Close Registration (Registration Open only) */}
                {isRegOpen && canManage && onCloseRegistrationPress && (
                  <TouchableOpacity
                    style={[styles.actionRow, styles.actionRowCloseReg, isProcessing && styles.actionDisabled]}
                    onPress={() => {
                      if (isProcessing) return;
                      onClose();
                      onCloseRegistrationPress(league);
                    }}
                    disabled={isProcessing}
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
                        Lock registration roster and prepare regular season schedule
                      </AppText>
                    </View>
                    <ChevronRight size={18} color="#D97706" />
                  </TouchableOpacity>
                )}

                {/* 3. Start League Play / Go Live (Registration Closed only) */}
                {isRegClosed && canManage && onStartLeaguePress && (
                  <TouchableOpacity
                    style={[styles.actionRow, styles.actionRowPublish, isProcessing && styles.actionDisabled]}
                    onPress={() => {
                      if (isProcessing) return;
                      onClose();
                      onStartLeaguePress(league);
                    }}
                    disabled={isProcessing}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Start League Play"
                  >
                    <View style={styles.actionIconWrapPublish}>
                      <Play size={18} color="#087A60" />
                    </View>
                    <View style={styles.actionTextWrap}>
                      <AppText style={styles.actionTitlePublish}>
                        Start League Play (Go Live)
                      </AppText>
                      <AppText variant="caption" color="secondary" style={styles.actionDesc}>
                        Begin Week 1 play and transition league to Live / In Progress
                      </AppText>
                    </View>
                    <ChevronRight size={18} color="#087A60" />
                  </TouchableOpacity>
                )}

                {/* 4. Generate / Regenerate Schedule (Registration Closed or In Progress) */}
                {(isRegClosed || isInProgress) && canManage && onGenerateSchedulePress && (
                  <TouchableOpacity
                    style={[styles.actionRow, isProcessing && styles.actionDisabled]}
                    onPress={() => {
                      if (isProcessing) return;
                      onClose();
                      onGenerateSchedulePress(league);
                    }}
                    disabled={isProcessing}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Schedule Generation"
                  >
                    <View style={styles.actionIconWrapSchedule}>
                      <Calendar size={18} color="#1D4ED8" />
                    </View>
                    <View style={styles.actionTextWrap}>
                      <AppText style={styles.actionTitle}>
                        {isInProgress ? 'Regenerate Regular Season Schedule' : 'Generate Regular Season Schedule'}
                      </AppText>
                      <AppText variant="caption" color="secondary" style={styles.actionDesc}>
                        Create round-robin fixture pairings across regular season weeks
                      </AppText>
                    </View>
                    <ChevronRight size={18} color="#94A3B8" />
                  </TouchableOpacity>
                )}

                {/* 5. Generate Playoffs Bracket (In Progress or Playoffs) */}
                {(isInProgress || isPlayoffs) && canManage && onGeneratePlayoffsPress && (
                  <TouchableOpacity
                    style={[styles.actionRow, styles.actionRowPlayoffs, isProcessing && styles.actionDisabled]}
                    onPress={() => {
                      if (isProcessing) return;
                      onClose();
                      onGeneratePlayoffsPress(league);
                    }}
                    disabled={isProcessing}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Generate Playoffs Bracket"
                  >
                    <View style={styles.actionIconWrapPlayoffs}>
                      <Trophy size={18} color="#7C3AED" />
                    </View>
                    <View style={styles.actionTextWrap}>
                      <AppText style={styles.actionTitlePlayoffs}>
                        Generate Playoffs Bracket
                      </AppText>
                      <AppText variant="caption" color="secondary" style={styles.actionDesc}>
                        Seed top qualifying teams into championship elimination bracket
                      </AppText>
                    </View>
                    <ChevronRight size={18} color="#7C3AED" />
                  </TouchableOpacity>
                )}

                {/* 6. Complete League (In Progress or Playoffs) */}
                {(isInProgress || isPlayoffs) && canManage && onCompletePress && (
                  <TouchableOpacity
                    style={[styles.actionRow, styles.actionRowPublish, isProcessing && styles.actionDisabled]}
                    onPress={() => {
                      if (isProcessing) return;
                      onClose();
                      onCompletePress(league);
                    }}
                    disabled={isProcessing}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Complete League"
                  >
                    <View style={styles.actionIconWrapPublish}>
                      <CheckCircle2 size={18} color="#087A60" />
                    </View>
                    <View style={styles.actionTextWrap}>
                      <AppText style={styles.actionTitlePublish}>
                        Complete League
                      </AppText>
                      <AppText variant="caption" color="secondary" style={styles.actionDesc}>
                        Verify completed matches, crown champion, and conclude season
                      </AppText>
                    </View>
                    <ChevronRight size={18} color="#087A60" />
                  </TouchableOpacity>
                )}

                {/* 7. View Final Results (Completed only) */}
                {isCompleted && (onViewResultsPress || onManagePress) && (
                  <TouchableOpacity
                    style={[styles.actionRow, styles.actionRowResults, isProcessing && styles.actionDisabled]}
                    onPress={() => {
                      onClose();
                      (onViewResultsPress || onManagePress)?.(league);
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
                        View crowned champion, final standings, and completed match scores
                      </AppText>
                    </View>
                    <ChevronRight size={18} color="#087A60" />
                  </TouchableOpacity>
                )}

                {/* 8. Manage League / Details (All active states) */}
                {!isCompleted && onManagePress && (
                  <TouchableOpacity
                    style={[styles.actionRow, isProcessing && styles.actionDisabled]}
                    onPress={() => {
                      onClose();
                      onManagePress(league);
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Manage League"
                  >
                    <View style={styles.actionIconWrapSettings}>
                      <SlidersHorizontal size={18} color="#1E293B" />
                    </View>
                    <View style={styles.actionTextWrap}>
                      <AppText style={styles.actionTitle}>
                        Manage League Workspace
                      </AppText>
                      <AppText variant="caption" color="secondary" style={styles.actionDesc}>
                        Open teams, schedule, fixtures, standings, and scoring
                      </AppText>
                    </View>
                    <ChevronRight size={18} color="#94A3B8" />
                  </TouchableOpacity>
                )}

                {/* 9. Cancel League (Destructive, Draft / Reg Open / Reg Closed / In Progress / Playoffs) */}
                {!isCancelled && !isCompleted && canManage && onCancelPress && (
                  <TouchableOpacity
                    style={[styles.actionRow, styles.actionRowCancel, isProcessing && styles.actionDisabled]}
                    onPress={() => {
                      if (isProcessing) return;
                      onClose();
                      onCancelPress(league);
                    }}
                    disabled={isProcessing}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel League"
                  >
                    <View style={styles.actionIconWrapCancel}>
                      <AlertTriangle size={18} color="#DC2626" />
                    </View>
                    <View style={styles.actionTextWrap}>
                      <AppText style={styles.actionTitleCancel}>
                        Cancel League
                      </AppText>
                      <AppText variant="caption" color="secondary" style={styles.actionDesc}>
                        Mark league cancelled and halt all competition activity
                      </AppText>
                    </View>
                    <ChevronRight size={18} color="#DC2626" />
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
                <AppText style={styles.cancelBtnText}>Dismiss</AppText>
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
    flexWrap: 'wrap',
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
  actionDisabled: {
    opacity: 0.5,
  },
  actionRowPublish: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  actionRowCloseReg: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  actionRowPlayoffs: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
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
  actionIconWrapSchedule: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconWrapPlayoffs: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3E8FF',
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
  actionIconWrapSettings: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E2E8F0',
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
  actionTextWrap: {
    flex: 1,
    gap: 2,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  actionTitlePublish: {
    fontSize: 14,
    fontWeight: '700',
    color: '#087A60',
  },
  actionTitleCloseReg: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D97706',
  },
  actionTitlePlayoffs: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7C3AED',
  },
  actionTitleResults: {
    fontSize: 14,
    fontWeight: '700',
    color: '#087A60',
  },
  actionTitleCancel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
  },
  actionDesc: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 15,
  },
  cancelBtn: {
    marginTop: Spacing[3],
    paddingVertical: Spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: Radius.lg,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
});
