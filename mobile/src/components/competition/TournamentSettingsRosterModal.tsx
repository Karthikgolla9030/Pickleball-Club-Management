/**
 * Aught2 Pickleball — TournamentSettingsRosterModal
 *
 * Professional tournament management and roster interface:
 * - Header: Tournament title, format badge, lifecycle status badge, accessible close (X) button.
 * - Lifecycle Status & Actions: Clear button hierarchy (Open Registration, Close Registration,
 *   Cancel Tournament with confirmation dialog, structural lock warning).
 * - Tournament Information: Clean grouped information grid (Dates, Reg Window, Capacity & progress,
 *   Category, Scoring rules).
 * - Participants / Roster: Participant count, real registration list, seed/status indicators,
 *   proper empty state when 0 registered.
 * - Responsive: Full-height sheet on mobile, centered modal with fixed header/footer on desktop.
 */

import React from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  Info,
  Layers,
  Lock,
  MapPin,
  Send,
  Target,
  Users,
  X,
} from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { LoadingState } from '@/components/StateViews';
import { Colors, Radius, Spacing } from '@/theme';
import type {
  Tournament,
  TournamentRegistrationItem,
  TournamentRegistrationStatus,
} from '@/types';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';

interface TournamentSettingsRosterModalProps {
  visible: boolean;
  onClose: () => void;
  tournament: Tournament | null;
  onOpenRegistration?: () => Promise<void>;
  isOpenRegistrationPending?: boolean;
  onCloseRegistration?: () => Promise<void>;
  isCloseRegistrationPending?: boolean;
  onCancelTournament?: () => Promise<void>;
  isCancelTournamentPending?: boolean;
  registrations: TournamentRegistrationItem[];
  isRegsLoading?: boolean;
  onSelectParticipant?: (participant: TournamentRegistrationItem) => void;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
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

function getRegStatusBadgeVariant(status: TournamentRegistrationStatus): 'success' | 'warning' | 'error' | 'default' {
  switch (status) {
    case 'confirmed':
      return 'success';
    case 'waitlisted':
      return 'warning';
    case 'cancelled':
      return 'error';
    default:
      return 'default';
  }
}

function getInitials(name?: string | null): string {
  if (!name) return 'PL';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function TournamentSettingsRosterModal({
  visible,
  onClose,
  tournament,
  onOpenRegistration,
  isOpenRegistrationPending = false,
  onCloseRegistration,
  isCloseRegistrationPending = false,
  onCancelTournament,
  isCancelTournamentPending = false,
  registrations = [],
  isRegsLoading = false,
  onSelectParticipant,
}: TournamentSettingsRosterModalProps) {
  const insets = useSafeAreaInsets();
  const [showCancelConfirmModal, setShowCancelConfirmModal] = React.useState(false);

  // Reset confirmation state when modal visibility closes
  React.useEffect(() => {
    if (!visible) {
      setShowCancelConfirmModal(false);
    }
  }, [visible]);

  if (!tournament) return null;

  const status = tournament.status?.toLowerCase();
  const statusDetails = getStatusBadgeDetails(tournament.status);
  const parsedConfig = parseTournamentConfig(tournament);

  const targetScore = tournament.scoring_rules?.target_score ?? 11;
  const winBy = tournament.scoring_rules?.win_by ?? 2;
  const participantCount = tournament.participant_count ?? registrations.length;
  const maxCapacity = tournament.max_participants ?? 16;
  const capacityPercent = Math.min(100, Math.round((participantCount / maxCapacity) * 100));

  const handleConfirmCancel = () => {
    setShowCancelConfirmModal(true);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetContainer}>
              {/* Top Drag Handle on Mobile */}
              <View style={styles.dragHandle} />

              {/* ─── Header ────────────────────────────────────────────── */}
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <AppText style={styles.title} numberOfLines={2}>
                    {tournament.name}
                  </AppText>
                  <View style={styles.badgeRow}>
                    <View style={styles.formatBadge}>
                      <AppText style={styles.formatBadgeText}>
                        {tournament.format_label}
                      </AppText>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusDetails.bg }]}>
                      <AppText style={[styles.statusBadgeText, { color: statusDetails.text }]}>
                        {statusDetails.label}
                      </AppText>
                    </View>
                    {tournament.location_name ? (
                      <View style={styles.locationPill}>
                        <MapPin size={11} color="#64748B" />
                        <AppText variant="caption" color="secondary" numberOfLines={1}>
                          {tournament.location_name}
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                </View>

                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Close settings modal"
                >
                  <X size={18} color="#475569" />
                </TouchableOpacity>
              </View>

              <View style={styles.headerDivider} />

              {/* ─── Scrollable Content ─────────────────────────────────── */}
              <ScrollView
                style={styles.scrollContent}
                contentContainerStyle={styles.scrollBody}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* 1. Lifecycle Status & Actions Card */}
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeaderRow}>
                    <Activity size={15} color="#087A60" />
                    <AppText style={styles.sectionHeaderTitle}>
                      LIFECYCLE STATUS & ACTIONS
                    </AppText>
                  </View>

                  <View style={styles.lifecycleButtonsWrap}>
                    {/* Draft -> Open Registration */}
                    {status === 'draft' && onOpenRegistration && (
                      <Button
                        label="Publish & Open Registration"
                        variant="primary"
                        loading={isOpenRegistrationPending}
                        onPress={onOpenRegistration}
                        leftIcon={<Send size={15} color="#FFFFFF" />}
                        style={styles.primaryActionBtn}
                      />
                    )}

                    {/* Registration Open -> Close Registration */}
                    {status === 'registration_open' && onCloseRegistration && (
                      <Button
                        label="Close Registration"
                        variant="secondary"
                        loading={isCloseRegistrationPending}
                        onPress={onCloseRegistration}
                        leftIcon={<Lock size={15} color="#334155" />}
                        style={styles.secondaryActionBtn}
                      />
                    )}

                    {/* Cancel Tournament (destructive action) */}
                    {status !== 'cancelled' && status !== 'completed' && onCancelTournament && (
                      <TouchableOpacity
                        style={[styles.cancelTournamentBtn, isCancelTournamentPending && styles.btnDisabled]}
                        onPress={handleConfirmCancel}
                        disabled={isCancelTournamentPending}
                        activeOpacity={0.75}
                        accessibilityLabel="Cancel tournament"
                      >
                        <AlertTriangle size={15} color="#DC2626" />
                        <AppText style={styles.cancelTournamentText}>
                          {isCancelTournamentPending ? 'Cancelling...' : 'Cancel Tournament'}
                        </AppText>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Structural Lock Notice */}
                  {(status === 'registration_open' || status === 'registration_closed') && (
                    <View style={styles.lockedNotice}>
                      <Lock size={14} color="#B45309" style={{ marginTop: 1 }} />
                      <AppText style={styles.lockedNoticeText}>
                        Structural configuration (format and player capacity) is locked while registration is open or closed.
                      </AppText>
                    </View>
                  )}

                  {/* Cancelled Status Notice */}
                  {status === 'cancelled' && (
                    <View style={styles.cancelledNotice}>
                      <AlertTriangle size={15} color="#DC2626" style={{ marginTop: 1 }} />
                      <AppText style={styles.cancelledNoticeText}>
                        This tournament has been cancelled. Registrations are disabled and competition will not take place.
                      </AppText>
                    </View>
                  )}

                  {/* Completed Status Notice */}
                  {status === 'completed' && (
                    <View style={styles.completedNotice}>
                      <CheckCircle size={15} color="#15803D" style={{ marginTop: 1 }} />
                      <AppText style={styles.completedNoticeText}>
                        This tournament is finalized and completed. Match results and champion standings are recorded.
                      </AppText>
                    </View>
                  )}
                </View>

                {/* 2. Tournament Information Card */}
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeaderRow}>
                    <Info size={15} color="#087A60" />
                    <AppText style={styles.sectionHeaderTitle}>
                      TOURNAMENT INFORMATION
                    </AppText>
                  </View>

                  <View style={styles.infoGrid}>
                    {/* Dates */}
                    <View style={styles.infoGridItem}>
                      <View style={styles.infoIconWrap}>
                        <Calendar size={13} color="#087A60" />
                      </View>
                      <View style={styles.infoTextWrap}>
                        <AppText style={styles.infoItemLabel}>Tournament Dates</AppText>
                        <AppText style={styles.infoItemValue}>
                          {formatDate(tournament.start_date)} – {formatDate(tournament.end_date)}
                        </AppText>
                      </View>
                    </View>

                    {/* Registration Window */}
                    <View style={styles.infoGridItem}>
                      <View style={styles.infoIconWrap}>
                        <Clock size={13} color="#087A60" />
                      </View>
                      <View style={styles.infoTextWrap}>
                        <AppText style={styles.infoItemLabel}>Registration Window</AppText>
                        <AppText style={styles.infoItemValue}>
                          {formatDate(tournament.registration_open_at)} – {formatDate(tournament.registration_close_at)}
                        </AppText>
                      </View>
                    </View>

                    {/* Capacity & Progress */}
                    <View style={styles.infoGridItemFull}>
                      <View style={styles.infoIconWrap}>
                        <Users size={13} color="#087A60" />
                      </View>
                      <View style={styles.infoTextWrap}>
                        <View style={styles.capacityHeaderRow}>
                          <AppText style={styles.infoItemLabel}>Player Capacity</AppText>
                          <AppText style={styles.capacityRatioText}>
                            {participantCount} / {tournament.max_participants ?? '∞'} registered (Min: {tournament.min_participants ?? '—'})
                          </AppText>
                        </View>
                        {tournament.max_participants ? (
                          <View style={styles.progressBarTrack}>
                            <View style={[styles.progressBarFill, { width: `${capacityPercent}%` }]} />
                          </View>
                        ) : null}
                      </View>
                    </View>

                    {/* Category & Format */}
                    <View style={styles.infoGridItem}>
                      <View style={styles.infoIconWrap}>
                        <Layers size={13} color="#087A60" />
                      </View>
                      <View style={styles.infoTextWrap}>
                        <AppText style={styles.infoItemLabel}>Format & Category</AppText>
                        <AppText style={styles.infoItemValue}>
                          {tournament.format_label} • {parsedConfig.category}
                        </AppText>
                      </View>
                    </View>

                    {/* Scoring Rules */}
                    <View style={styles.infoGridItem}>
                      <View style={styles.infoIconWrap}>
                        <Target size={13} color="#087A60" />
                      </View>
                      <View style={styles.infoTextWrap}>
                        <AppText style={styles.infoItemLabel}>Scoring Rules</AppText>
                        <AppText style={styles.infoItemValue}>
                          Single game to {targetScore} (win by {winBy})
                        </AppText>
                      </View>
                    </View>
                  </View>
                </View>

                {/* 3. Participants / Roster Section */}
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeaderRowBetween}>
                    <View style={styles.sectionHeaderRow}>
                      <Users size={15} color="#087A60" />
                      <AppText style={styles.sectionHeaderTitle}>
                        PARTICIPANTS ({registrations.length})
                      </AppText>
                    </View>
                    <AppText variant="caption" color="tertiary" style={styles.helperTipText}>
                      Tap player to edit seed or status
                    </AppText>
                  </View>

                  {isRegsLoading ? (
                    <LoadingState message="Loading participants..." />
                  ) : registrations.length === 0 ? (
                    <View style={styles.emptyRosterCard}>
                      <View style={styles.emptyRosterIconWrap}>
                        <Users size={28} color="#94A3B8" />
                      </View>
                      <AppText style={styles.emptyRosterTitle}>
                        No players have registered yet.
                      </AppText>
                      <AppText variant="caption" color="secondary" style={styles.emptyRosterSubtitle}>
                        When players or teams register for this tournament, they will appear here in the roster.
                      </AppText>
                    </View>
                  ) : (
                    <View style={styles.rosterList}>
                      {registrations.map((p, pIdx) => {
                        const displayName = p.display_name || p.user_full_name || p.user_email || `Player #${pIdx + 1}`;
                        const initials = getInitials(displayName);

                        return (
                          <TouchableOpacity
                            key={p.id}
                            style={styles.rosterItem}
                            onPress={() => onSelectParticipant?.(p)}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={`Edit registration for ${displayName}`}
                          >
                            <View style={styles.avatarCircle}>
                              <AppText style={styles.avatarText}>{initials}</AppText>
                            </View>

                            <View style={styles.rosterItemText}>
                              <AppText style={styles.rosterItemName} numberOfLines={1}>
                                {displayName}
                              </AppText>
                              <AppText variant="caption" color="secondary" numberOfLines={1}>
                                {p.membership_number ? `ID: ${p.membership_number} • ` : ''}
                                {p.user_email}
                              </AppText>
                              {p.notes ? (
                                <AppText variant="caption" color="tertiary" numberOfLines={1} style={styles.rosterNote}>
                                  Note: {p.notes}
                                </AppText>
                              ) : null}
                            </View>

                            <View style={styles.rosterRightCol}>
                              {p.seed ? (
                                <View style={styles.seedBadge}>
                                  <AppText style={styles.seedBadgeText}>#{p.seed}</AppText>
                                </View>
                              ) : null}
                              <Badge
                                label={p.status_label || p.status.toUpperCase()}
                                variant={getRegStatusBadgeVariant(p.status)}
                              />
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              </ScrollView>

              {/* ─── Fixed Footer ────────────────────────────────────────── */}
              <View
                style={[
                  styles.footer,
                  { paddingBottom: Math.max(insets.bottom, Spacing[3]) + Spacing[1] },
                ]}
              >
                <Button
                  label="Close"
                  variant="secondary"
                  onPress={onClose}
                  fullWidth
                />
              </View>
            </View>
          </TouchableWithoutFeedback>

          {/* ─── Cancel Tournament Confirmation Overlay (No nested Modal for Android compatibility) ─── */}
          {showCancelConfirmModal && (
            <View style={[StyleSheet.absoluteFill, styles.confirmOverlayContainer]}>
              <TouchableWithoutFeedback onPress={() => setShowCancelConfirmModal(false)}>
                <View style={styles.confirmBackdrop}>
                  <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                    <View style={styles.confirmCard}>
                      <View style={styles.confirmIconContainer}>
                        <AlertTriangle size={28} color="#DC2626" />
                      </View>

                      <AppText style={styles.confirmTitle}>
                        Cancel Tournament?
                      </AppText>

                      <AppText style={styles.confirmMessage}>
                        Are you sure you want to cancel this tournament? Players will no longer be able to register, and the tournament will be marked as cancelled.
                      </AppText>

                      {status === 'in_progress' && (
                        <View style={styles.inProgressWarningBox}>
                          <AlertTriangle size={15} color="#B45309" style={{ marginTop: 1 }} />
                          <AppText style={styles.inProgressWarningText}>
                            Existing match results will be preserved and the competition will be marked cancelled.
                          </AppText>
                        </View>
                      )}

                      <View style={styles.confirmActionsRow}>
                        <TouchableOpacity
                          style={styles.confirmGoBackBtn}
                          onPress={() => setShowCancelConfirmModal(false)}
                          activeOpacity={0.8}
                        >
                          <AppText style={styles.confirmGoBackText}>Go Back</AppText>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.confirmDestructiveBtn, isCancelTournamentPending && styles.btnDisabled]}
                          onPress={async () => {
                            setShowCancelConfirmModal(false);
                            if (onCancelTournament) {
                              await onCancelTournament();
                            }
                          }}
                          disabled={isCancelTournamentPending}
                          activeOpacity={0.8}
                        >
                          <AppText style={styles.confirmDestructiveText}>
                            {isCancelTournamentPending ? 'Cancelling...' : 'Yes, Cancel Tournament'}
                          </AppText>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </TouchableWithoutFeedback>
                </View>
              </TouchableWithoutFeedback>
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheetContainer: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 620 : undefined,
    maxHeight: '92%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 12,
    alignSelf: 'center',
    display: 'flex',
    flexDirection: 'column',
    ...(Platform.OS === 'web'
      ? {
          borderRadius: 24,
          maxHeight: '88%',
          marginVertical: 20,
        }
      : {}),
  },
  dragHandle: {
    width: 38,
    height: 4,
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: Spacing[2],
    marginBottom: Spacing[1],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[2],
    paddingBottom: Spacing[2.5],
    gap: Spacing[2],
  },
  headerLeft: {
    flex: 1,
    gap: 6,
  },
  title: {
    fontSize: 18.5,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 23,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  formatBadge: {
    backgroundColor: '#E2F1E8',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  formatBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#166534',
    letterSpacing: 0.4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  statusBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  scrollContent: {
    flex: 1,
  },
  scrollBody: {
    padding: Spacing[4],
    gap: Spacing[3.5],
  },

  // Section Cards
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.lg,
    padding: Spacing[3.5],
    gap: Spacing[3],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  sectionHeaderRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  sectionHeaderTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.7,
    color: '#087A60',
  },
  helperTipText: {
    fontSize: 11,
  },

  // Lifecycle
  lifecycleButtonsWrap: {
    gap: Spacing[2],
  },
  primaryActionBtn: {
    backgroundColor: '#087A60',
  },
  secondaryActionBtn: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
  },
  cancelTournamentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: Radius.md,
    paddingVertical: Spacing[2.5],
    paddingHorizontal: Spacing[3],
  },
  cancelTournamentText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 13,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  lockedNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: Radius.md,
    padding: Spacing[2.5],
  },
  lockedNoticeText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    color: '#92400E',
    fontWeight: '500',
  },

  // Info Grid
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2.5],
  },
  infoGridItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    width: '48%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#EDF2F7',
    borderRadius: Radius.md,
    padding: Spacing[2.5],
  },
  infoGridItemFull: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#EDF2F7',
    borderRadius: Radius.md,
    padding: Spacing[2.5],
  },
  infoIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E2F1E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  infoTextWrap: {
    flex: 1,
    gap: 2,
  },
  infoItemLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  infoItemValue: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  capacityHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  capacityRatioText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#087A60',
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    marginTop: 5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#087A60',
    borderRadius: 3,
  },

  // Roster
  emptyRosterCard: {
    paddingVertical: Spacing[6],
    paddingHorizontal: Spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    gap: Spacing[1.5],
  },
  emptyRosterIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[1],
  },
  emptyRosterTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  emptyRosterSubtitle: {
    fontSize: 11.5,
    textAlign: 'center',
    lineHeight: 16,
    maxWidth: 320,
  },
  rosterList: {
    gap: Spacing[2],
  },
  rosterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.md,
    paddingVertical: Spacing[2],
    paddingHorizontal: Spacing[3],
    gap: Spacing[2.5],
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#087A60',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 11.5,
  },
  rosterItemText: {
    flex: 1,
    gap: 1,
  },
  rosterItemName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  rosterNote: {
    fontSize: 10.5,
    fontStyle: 'italic',
  },
  rosterRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1.5],
  },
  seedBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  seedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },

  // Footer
  footer: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[2.5],
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },

  // Lifecycle Notices
  cancelledNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: Radius.md,
    padding: Spacing[2.5],
  },
  cancelledNoticeText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    color: '#991B1B',
    fontWeight: '600',
  },
  completedNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: Radius.md,
    padding: Spacing[2.5],
  },
  completedNoticeText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    color: '#166534',
    fontWeight: '600',
  },

  // Cancel Confirmation Overlay
  confirmOverlayContainer: {
    zIndex: 9999,
    elevation: 24,
  },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[4],
  },
  confirmCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: Spacing[5],
    alignItems: 'center',
    gap: Spacing[3],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  confirmIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  confirmMessage: {
    fontSize: 13.5,
    lineHeight: 20,
    color: '#475569',
    textAlign: 'center',
  },
  inProgressWarningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: Radius.md,
    padding: Spacing[2.5],
    width: '100%',
  },
  inProgressWarningText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: '#B45309',
    fontWeight: '600',
  },
  confirmActionsRow: {
    flexDirection: 'row',
    gap: Spacing[2.5],
    width: '100%',
    marginTop: Spacing[2],
  },
  confirmGoBackBtn: {
    flex: 1,
    paddingVertical: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmGoBackText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#334155',
  },
  confirmDestructiveBtn: {
    flex: 1.2,
    paddingVertical: Spacing[3],
    borderRadius: Radius.md,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDestructiveText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
