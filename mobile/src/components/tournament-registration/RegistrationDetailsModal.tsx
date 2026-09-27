/**
 * Aught2 Pickleball — Tournament Registration Details Modal
 *
 * Displays confirmed/saved registration information for the authenticated player.
 * Prevents already registered players from being redirected to the payment or registration wizard.
 */

import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Hash,
  MapPin,
  ShieldCheck,
  Tag,
  Trophy,
  User,
  Users,
  X,
  XCircle,
  Zap,
} from 'lucide-react-native';

import { AppText } from '../AppText';
import { Badge } from '../Badge';
import { useAuth, usePlayerMyRegistration, usePlayerTournamentRegistration } from '@/hooks';
import type { PlayerRegistrationResponse, Tournament, TournamentDiscoveryItem } from '@/types';
import { formatDate } from '@/utils';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';

export interface RegistrationDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  tournamentId?: string | null;
  tournament?: Tournament | TournamentDiscoveryItem | null;
  registration?: PlayerRegistrationResponse | null;
  onCancelled?: () => void;
}

export function RegistrationDetailsModal({
  visible,
  onClose,
  tournamentId,
  tournament,
  registration: directRegistration,
  onCancelled,
}: RegistrationDetailsModalProps) {
  const effectiveTournamentId = tournamentId || tournament?.id || directRegistration?.tournament_id || null;
  const { user } = useAuth();

  // Load registration record from backend if not provided directly
  const {
    registration: fetchedRegistration,
    isLoading,
    refetch,
  } = usePlayerMyRegistration(visible && !directRegistration ? effectiveTournamentId : null);

  const { cancelRegistration, isCancelling } = usePlayerTournamentRegistration(effectiveTournamentId);

  const reg = directRegistration || fetchedRegistration;

  // Format dates
  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const tournamentName =
    tournament?.name || reg?.tournament_name || 'Tournament Registration';
  const tournamentFormat =
    tournament?.format_label || reg?.tournament_format_label || 'Pickleball Tournament';
  const tournamentLocation =
    tournament?.location_name || reg?.location_name || 'Main Club Courts';

  const tournamentDates =
    tournament?.start_date && tournament?.end_date
      ? `${formatDate(tournament.start_date)} – ${formatDate(tournament.end_date)}`
      : reg?.start_date
      ? formatDate(reg.start_date)
      : 'Scheduled Tournament';

  const divisionText =
    reg?.division ||
    (tournament?.format_configuration as any)?.category ||
    'Open Division';

  const playerName = reg?.player_name || user?.full_name || 'Player';
  const playerEmail = reg?.player_email || user?.email || '—';
  const status = reg?.status || 'confirmed';

  const isConfirmed = status === 'confirmed';
  const isPending = status === 'pending';
  const isWaitlisted = status === 'waitlisted';
  const isCancelled = status === 'cancelled';

  const handleWithdraw = () => {
    Alert.alert(
      'Withdraw Registration',
      'Are you sure you want to withdraw from this tournament? Your reserved spot will be released.',
      [
        { text: 'Keep Registration', style: 'cancel' },
        {
          text: 'Yes, Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelRegistration();
              Alert.alert('Registration Cancelled', 'You have successfully withdrawn from this tournament.');
              if (onCancelled) onCancelled();
              onClose();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to withdraw from tournament.';
              Alert.alert('Withdrawal Failed', msg);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* ─── Header Navigation Bar ─── */}
        <View style={styles.topNavBar}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.navButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Close registration details"
          >
            <X size={20} color="#0F172A" />
          </TouchableOpacity>
          <AppText variant="bodySmall" bold style={styles.navTitle}>
            Registration Details
          </AppText>
          <View style={{ width: 36 }} />
        </View>

        {isLoading && !reg ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#064E3B" />
            <AppText variant="caption" color="secondary" style={{ marginTop: 12 }}>
              Loading registration details...
            </AppText>
          </View>
        ) : !reg ? (
          <View style={styles.emptyContainer}>
            <XCircle size={44} color="#94A3B8" />
            <AppText variant="heading3" style={{ marginTop: 12 }}>
              No Registration Found
            </AppText>
            <AppText variant="caption" color="secondary" style={styles.emptySubtitle}>
              We couldn't locate an active registration record for your account in this tournament.
            </AppText>
            <TouchableOpacity style={styles.primaryBtn} onPress={onClose}>
              <AppText variant="bodySmall" bold style={styles.primaryBtnText}>
                Back to Tournaments
              </AppText>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* ─── Hero Status Banner ─── */}
            <View
              style={[
                styles.statusBanner,
                isConfirmed && styles.statusBannerConfirmed,
                isPending && styles.statusBannerPending,
                isWaitlisted && styles.statusBannerWaitlisted,
                isCancelled && styles.statusBannerCancelled,
              ]}
            >
              <View style={styles.statusBannerHeader}>
                <View style={styles.statusIconWrap}>
                  {isConfirmed && <CheckCircle2 size={24} color="#15803D" />}
                  {isPending && <Clock size={24} color="#B45309" />}
                  {isWaitlisted && <Clock size={24} color="#1D4ED8" />}
                  {isCancelled && <XCircle size={24} color="#DC2626" />}
                </View>
                <View style={{ flex: 1 }}>
                  <AppText
                    variant="bodySmall"
                    bold
                    style={[
                      styles.statusTitle,
                      isConfirmed && styles.statusTitleConfirmed,
                      isPending && styles.statusTitlePending,
                      isWaitlisted && styles.statusTitleWaitlisted,
                      isCancelled && styles.statusTitleCancelled,
                    ]}
                  >
                    {isConfirmed
                      ? 'Registration Confirmed'
                      : isPending
                      ? 'Payment Pending'
                      : isWaitlisted
                      ? 'Waitlisted Registration'
                      : 'Registration Cancelled'}
                  </AppText>
                  <AppText variant="caption" style={styles.statusSubtitle}>
                    {isConfirmed
                      ? 'You are officially registered for this tournament.'
                      : isPending
                      ? 'Complete payment to guarantee your tournament spot.'
                      : isWaitlisted
                      ? 'You are on the waitlist. You will be notified if a spot opens.'
                      : 'This registration has been withdrawn.'}
                  </AppText>
                </View>
              </View>

              {reg.reference_number && (
                <View style={styles.refPill}>
                  <AppText variant="caption" style={styles.refLabel}>
                    Reference ID:
                  </AppText>
                  <AppText variant="caption" bold style={styles.refValue}>
                    {reg.reference_number}
                  </AppText>
                </View>
              )}
            </View>

            {/* ─── 1. Tournament Information Card ─── */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Trophy size={16} color="#064E3B" />
                <AppText variant="caption" bold style={styles.cardHeaderTitle}>
                  TOURNAMENT INFORMATION
                </AppText>
              </View>

              <View style={styles.cardBody}>
                <AppText variant="heading3" style={styles.tournamentName}>
                  {tournamentName}
                </AppText>

                <View style={styles.badgesRow}>
                  <View style={styles.formatBadge}>
                    <AppText variant="caption" bold style={styles.formatBadgeText}>
                      {tournamentFormat.toUpperCase()}
                    </AppText>
                  </View>
                  <View style={styles.divisionBadge}>
                    <AppText variant="caption" bold style={styles.divisionBadgeText}>
                      {divisionText}
                    </AppText>
                  </View>
                </View>

                <View style={styles.infoDivider} />

                <View style={styles.infoRow}>
                  <Calendar size={14} color="#64748B" style={styles.infoIcon} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="caption" color="secondary">
                      Tournament Dates
                    </AppText>
                    <AppText variant="bodySmall" bold style={styles.infoValueText}>
                      {tournamentDates}
                    </AppText>
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <MapPin size={14} color="#64748B" style={styles.infoIcon} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="caption" color="secondary">
                      Location / Venue
                    </AppText>
                    <AppText variant="bodySmall" bold style={styles.infoValueText}>
                      {tournamentLocation}
                    </AppText>
                  </View>
                </View>
              </View>
            </View>

            {/* ─── 2. Player & Team Details Card ─── */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <User size={16} color="#064E3B" />
                <AppText variant="caption" bold style={styles.cardHeaderTitle}>
                  PLAYER & REGISTRATION DETAILS
                </AppText>
              </View>

              <View style={styles.cardBody}>
                <View style={styles.detailGridRow}>
                  <View style={styles.gridCol}>
                    <AppText variant="caption" color="secondary">
                      Player Name
                    </AppText>
                    <AppText variant="bodySmall" bold style={styles.infoValueText}>
                      {playerName}
                    </AppText>
                  </View>
                  <View style={styles.gridCol}>
                    <AppText variant="caption" color="secondary">
                      Email
                    </AppText>
                    <AppText variant="bodySmall" style={styles.infoValueText} numberOfLines={1}>
                      {playerEmail}
                    </AppText>
                  </View>
                </View>

                {reg.team_name && (
                  <View style={styles.detailGridRow}>
                    <View style={styles.gridCol}>
                      <AppText variant="caption" color="secondary">
                        Team Name
                      </AppText>
                      <AppText variant="bodySmall" bold style={styles.infoValueText}>
                        {reg.team_name}
                      </AppText>
                    </View>
                    <View style={styles.gridCol}>
                      <AppText variant="caption" color="secondary">
                        Partner
                      </AppText>
                      <AppText variant="bodySmall" bold style={styles.infoValueText}>
                        {reg.partner_name || 'Team Partner'}
                      </AppText>
                    </View>
                  </View>
                )}

                <View style={styles.detailGridRow}>
                  <View style={styles.gridCol}>
                    <AppText variant="caption" color="secondary">
                      Registration Type
                    </AppText>
                    <AppText variant="bodySmall" bold style={styles.infoValueText}>
                      {reg.team_name || reg.partner_name ? 'Doubles (Team)' : 'Individual'}
                    </AppText>
                  </View>
                  <View style={styles.gridCol}>
                    <AppText variant="caption" color="secondary">
                      Registered At
                    </AppText>
                    <AppText variant="bodySmall" style={styles.infoValueText}>
                      {formatDateTime(reg.registered_at)}
                    </AppText>
                  </View>
                </View>

                {reg.notes ? (
                  <View style={styles.notesContainer}>
                    <AppText variant="caption" color="secondary">
                      Registration Notes
                    </AppText>
                    <AppText variant="caption" style={styles.notesText}>
                      {reg.notes}
                    </AppText>
                  </View>
                ) : null}
              </View>
            </View>

            {/* ─── 3. Payment Summary Card ─── */}
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <CreditCard size={16} color="#064E3B" />
                <AppText variant="caption" bold style={styles.cardHeaderTitle}>
                  PAYMENT INFORMATION
                </AppText>
              </View>

              <View style={styles.cardBody}>
                <View style={styles.detailGridRow}>
                  <View style={styles.gridCol}>
                    <AppText variant="caption" color="secondary">
                      Registration Fee
                    </AppText>
                    <AppText variant="heading2" style={styles.feeAmountText}>
                      ${Number(reg.fee_amount ?? 50).toFixed(2)}
                    </AppText>
                  </View>
                  <View style={styles.gridCol}>
                    <AppText variant="caption" color="secondary">
                      Payment Status
                    </AppText>
                    <View style={styles.paymentStatusBadge}>
                      <ShieldCheck size={13} color={isConfirmed ? '#15803D' : '#B45309'} />
                      <AppText
                        variant="caption"
                        bold
                        style={[
                          styles.paymentStatusText,
                          { color: isConfirmed ? '#15803D' : '#B45309' },
                        ]}
                      >
                        {isConfirmed ? 'Paid & Confirmed' : isPending ? 'Pending Payment' : 'Refunded'}
                      </AppText>
                    </View>
                  </View>
                </View>

                <View style={styles.infoDivider} />

                <View style={styles.detailGridRow}>
                  <View style={styles.gridCol}>
                    <AppText variant="caption" color="secondary">
                      Payment Method
                    </AppText>
                    <View style={styles.methodRow}>
                      {reg.payment_method?.toLowerCase() === 'upi' ? (
                        <Zap size={14} color="#064E3B" style={{ marginRight: 5 }} />
                      ) : (
                        <CreditCard size={14} color="#064E3B" style={{ marginRight: 5 }} />
                      )}
                      <AppText variant="bodySmall" bold style={styles.infoValueText}>
                        {reg.payment_method || 'Credit Card'}
                      </AppText>
                    </View>
                  </View>

                  <View style={styles.gridCol}>
                    <AppText variant="caption" color="secondary">
                      Transaction Date
                    </AppText>
                    <AppText variant="bodySmall" style={styles.infoValueText}>
                      {formatDateTime(reg.registered_at)}
                    </AppText>
                  </View>
                </View>
              </View>
            </View>

            {/* ─── Action Buttons ─── */}
            <View style={styles.actionButtonsContainer}>
              <TouchableOpacity
                style={styles.doneBtn}
                onPress={onClose}
                activeOpacity={0.85}
              >
                <AppText variant="bodySmall" bold style={styles.doneBtnText}>
                  Back to Tournaments
                </AppText>
              </TouchableOpacity>

              {isConfirmed && !isCancelled && (
                <TouchableOpacity
                  style={styles.withdrawBtn}
                  onPress={handleWithdraw}
                  disabled={isCancelling}
                  activeOpacity={0.8}
                >
                  <AppText variant="caption" bold style={styles.withdrawBtnText}>
                    {isCancelling ? 'Processing Withdrawal...' : 'Withdraw Registration'}
                  </AppText>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topNavBar: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  navButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
  },
  navTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptySubtitle: {
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
    maxWidth: 280,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 36,
  },

  /* ─── Hero Status Banner ─── */
  statusBanner: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  statusBannerConfirmed: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusBannerPending: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  statusBannerWaitlisted: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  statusBannerCancelled: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  statusBannerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  statusIconWrap: {
    marginTop: 2,
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  statusTitleConfirmed: {
    color: '#064E3B',
  },
  statusTitlePending: {
    color: '#92400E',
  },
  statusTitleWaitlisted: {
    color: '#1E40AF',
  },
  statusTitleCancelled: {
    color: '#64748B',
  },
  statusSubtitle: {
    color: '#475569',
    marginTop: 2,
    lineHeight: 16,
  },
  refPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
  },
  refLabel: {
    color: '#64748B',
    fontSize: 11,
  },
  refValue: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  /* ─── Standard Card ─── */
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cardHeaderTitle: {
    color: '#064E3B',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardBody: {
    padding: 16,
    gap: 12,
  },
  tournamentName: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  formatBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  formatBadgeText: {
    color: '#7C3AED',
    fontSize: 10,
    fontWeight: '800',
  },
  divisionBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  divisionBadgeText: {
    color: '#0369A1',
    fontSize: 10,
    fontWeight: '700',
  },
  infoDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoIcon: {
    marginTop: 2,
  },
  infoValueText: {
    color: '#0F172A',
    fontSize: 13,
    marginTop: 1,
  },
  detailGridRow: {
    flexDirection: 'row',
    gap: 16,
  },
  gridCol: {
    flex: 1,
  },
  notesContainer: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  notesText: {
    color: '#334155',
    marginTop: 2,
    lineHeight: 16,
  },
  feeAmountText: {
    color: '#064E3B',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  paymentStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  paymentStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },

  /* ─── Actions ─── */
  actionButtonsContainer: {
    gap: 12,
    marginTop: 8,
  },
  doneBtn: {
    backgroundColor: '#064E3B',
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  withdrawBtn: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF1F2',
  },
  withdrawBtnText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },
  primaryBtn: {
    backgroundColor: '#064E3B',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
  },
});
