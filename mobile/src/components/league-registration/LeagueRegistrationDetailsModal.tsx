/**
 * Aught2 Pickleball — League Registration Details Modal
 *
 * Displays saved registration details for the authenticated player:
 * - League name and current status badge
 * - Format (Singles / Doubles)
 * - Team name and registered roster / partner names
 * - Submitted skill rating
 * - Club-configured fee and payment status
 * - Registration date / timestamp
 * - Cancel registration action (only if backend rules allow, e.g. open registration)
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Shield,
  Star,
  Trophy,
  User,
  Users,
  X,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import {
  useAuth,
  usePlayerCancelLeagueRegistration,
  usePlayerLeagueRegistrationStatus,
} from '@/hooks';
import { Colors, Radius, Shadows, Spacing } from '@/theme';
import type { LeagueSummary } from '@/types';
import { formatDate, formatCurrency } from '@/utils/formatters';

export interface LeagueRegistrationDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  league: LeagueSummary | null;
  onCancelled?: () => void;
}

export function LeagueRegistrationDetailsModal({
  visible,
  onClose,
  league,
  onCancelled,
}: LeagueRegistrationDetailsModalProps) {
  const { user } = useAuth();
  const leagueId = league?.id ?? null;

  const {
    data: regStatus,
    isLoading: isLoadingStatus,
    refetch,
  } = usePlayerLeagueRegistrationStatus(leagueId);

  const cancelMutation = usePlayerCancelLeagueRegistration(leagueId);
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);

  const team = regStatus?.team;
  const isSingles = (league?.team_size ?? 2) === 1;
  const canCancel =
    league?.status === 'registration_open' ||
    league?.registration_status === 'open';

  const feeAmount = league?.registration_fee ?? 0;
  const isFree = feeAmount === 0;

  const handleCancelRegistration = () => {
    Alert.alert(
      'Cancel Registration',
      'Are you sure you want to withdraw from this league? Your spot will be released.',
      [
        { text: 'Keep Registration', style: 'cancel' },
        {
          text: 'Yes, Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelMutation.mutateAsync();
              Alert.alert('Registration Cancelled', 'You have been withdrawn from this league.');
              onCancelled?.();
              onClose();
            } catch (err: any) {
              const msg =
                err?.response?.data?.detail ||
                err?.message ||
                'Unable to cancel registration. Please contact club staff.';
              Alert.alert('Cancellation Error', msg);
            }
          },
        },
      ]
    );
  };

  if (!league) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Close registration details"
          >
            <X size={20} color={Colors.text.primary} />
          </TouchableOpacity>
          <AppText style={styles.headerTitle}>Registration Details</AppText>
          <View style={{ width: 36 }} />
        </View>

        {isLoadingStatus ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.brand.primary} />
            <AppText style={styles.loadingText}>Loading registration details...</AppText>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Status Hero Card */}
            <View style={styles.statusHero}>
              <View style={styles.statusIconWrap}>
                <CheckCircle2 size={32} color={Colors.white} />
              </View>
              <AppText style={styles.statusHeroTitle}>You are Registered</AppText>
              <AppText style={styles.statusHeroSubtitle}>
                {league.name}
              </AppText>
              <View style={styles.badgeRow}>
                <View style={styles.statusBadge}>
                  <View style={styles.statusDot} />
                  <AppText style={styles.statusBadgeText}>
                    {league.status.replace(/_/g, ' ').toUpperCase()}
                  </AppText>
                </View>
                <View style={styles.formatBadge}>
                  <AppText style={styles.formatBadgeText}>
                    {isSingles ? 'Singles' : 'Doubles'}
                  </AppText>
                </View>
              </View>
            </View>

            {/* Team / Player Section */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Users size={18} color={Colors.brand.primary} />
                <AppText style={styles.cardTitle}>
                  {isSingles ? 'Player Roster' : 'Team Roster'}
                </AppText>
              </View>

              {team?.name && (
                <View style={styles.detailRow}>
                  <AppText style={styles.detailLabel}>Team Name</AppText>
                  <AppText style={styles.detailValueBold}>{team.name}</AppText>
                </View>
              )}

              {team?.members && team.members.length > 0 ? (
                <View style={styles.membersList}>
                  {team.members.map((member, idx) => (
                    <View key={member.id ?? idx} style={styles.memberItem}>
                      <View style={styles.memberAvatar}>
                        <User size={16} color={Colors.brand.primary} />
                      </View>
                      <View style={styles.memberInfo}>
                        <AppText style={styles.memberName}>
                          {member.display_name || 'Member'}
                          {member.display_name === user?.full_name ? ' (You)' : ''}
                        </AppText>
                        <AppText style={styles.memberRole}>
                          {idx === 0 ? 'Primary Player' : 'Partner'} •{' '}
                          {member.is_guest ? 'Guest' : 'Club Member'}
                        </AppText>
                      </View>
                      {member.skill_rating != null && (
                        <View style={styles.ratingPill}>
                          <Star size={12} color="#D97706" fill="#D97706" />
                          <AppText style={styles.ratingPillText}>
                            {member.skill_rating.toFixed(1)}
                          </AppText>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.detailRow}>
                  <AppText style={styles.detailLabel}>Registered As</AppText>
                  <AppText style={styles.detailValue}>
                    {user?.full_name || 'Current Player'}
                  </AppText>
                </View>
              )}
            </View>

            {/* Skill Level & Seeding */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Star size={18} color="#D97706" />
                <AppText style={styles.cardTitle}>Skill & Seeding</AppText>
              </View>

              <View style={styles.detailRow}>
                <AppText style={styles.detailLabel}>Average Team Rating</AppText>
                <AppText style={styles.detailValueBold}>
                  {team?.avg_skill_level != null
                    ? team.avg_skill_level.toFixed(2)
                    : (user as any)?.rating != null
                    ? `${(user as any).rating.toFixed(2)} DUPR`
                    : 'Unrated'}
                </AppText>
              </View>

              {team?.seed != null && (
                <View style={styles.detailRow}>
                  <AppText style={styles.detailLabel}>Assigned Seed</AppText>
                  <AppText style={styles.detailValue}>Seed #{team.seed}</AppText>
                </View>
              )}

              <View style={styles.detailRow}>
                <AppText style={styles.detailLabel}>League Format</AppText>
                <AppText style={styles.detailValue}>
                  {league.team_size === 1 ? 'Singles (1v1)' : 'Doubles (2v2)'}
                </AppText>
              </View>
            </View>

            {/* Payment & Fee Summary */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <CreditCard size={18} color={Colors.brand.primary} />
                <AppText style={styles.cardTitle}>Payment & Fees</AppText>
              </View>

              <View style={styles.detailRow}>
                <AppText style={styles.detailLabel}>Registration Fee</AppText>
                <AppText style={styles.detailValueBold}>
                  {isFree ? 'Free ($0.00)' : formatCurrency(feeAmount)}
                </AppText>
              </View>

              <View style={styles.detailRow}>
                <AppText style={styles.detailLabel}>Payment Status</AppText>
                <View style={styles.paymentStatusBadge}>
                  <CheckCircle2 size={13} color="#059669" />
                  <AppText style={styles.paymentStatusText}>
                    {isFree ? 'No Fee Required' : 'Confirmed / On File'}
                  </AppText>
                </View>
              </View>

              {team?.created_at && (
                <View style={styles.detailRow}>
                  <AppText style={styles.detailLabel}>Registered On</AppText>
                  <AppText style={styles.detailValue}>
                    {formatDate(team.created_at)}
                  </AppText>
                </View>
              )}
            </View>

            {/* League Information */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Trophy size={18} color={Colors.brand.primary} />
                <AppText style={styles.cardTitle}>League Schedule</AppText>
              </View>

              <View style={styles.detailRow}>
                <AppText style={styles.detailLabel}>Duration</AppText>
                <AppText style={styles.detailValue}>
                  {league.total_weeks || league.number_of_weeks || 12} Weeks
                </AppText>
              </View>

              <View style={styles.detailRow}>
                <AppText style={styles.detailLabel}>Start Date</AppText>
                <AppText style={styles.detailValue}>
                  {formatDate(league.start_date)}
                </AppText>
              </View>

              {league.end_date && (
                <View style={styles.detailRow}>
                  <AppText style={styles.detailLabel}>End Date</AppText>
                  <AppText style={styles.detailValue}>
                    {formatDate(league.end_date)}
                  </AppText>
                </View>
              )}

              <View style={styles.detailRow}>
                <AppText style={styles.detailLabel}>Registered Teams</AppText>
                <AppText style={styles.detailValue}>
                  {league.current_teams_count ?? league.teams_count ?? 0}
                  {league.max_teams ? ` / ${league.max_teams}` : ''}
                </AppText>
              </View>
            </View>

            {/* Actions */}
            <View style={styles.actionContainer}>
              {canCancel ? (
                <TouchableOpacity
                  style={[styles.cancelButton, cancelMutation.isPending && styles.buttonDisabled]}
                  onPress={handleCancelRegistration}
                  disabled={cancelMutation.isPending}
                >
                  {cancelMutation.isPending ? (
                    <ActivityIndicator size="small" color="#DC2626" />
                  ) : (
                    <>
                      <AlertTriangle size={18} color="#DC2626" />
                      <AppText style={styles.cancelButtonText}>
                        Withdraw Registration
                      </AppText>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={styles.lockedNote}>
                  <Clock size={16} color={Colors.text.secondary} />
                  <AppText style={styles.lockedNoteText}>
                    Registration is locked because the league is underway or registration has closed.
                  </AppText>
                </View>
              )}

              <TouchableOpacity style={styles.doneButton} onPress={onClose}>
                <AppText style={styles.doneButtonText}>Close</AppText>
              </TouchableOpacity>
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
    backgroundColor: '#F3F8F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: 14,
    color: Colors.text.secondary,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  statusHero: {
    backgroundColor: '#064E3B',
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.lg,
    ...Shadows.md,
  },
  statusIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  statusHeroTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: -0.3,
  },
  statusHeroSubtitle: {
    fontSize: 14,
    color: '#D1FAE5',
    marginTop: 4,
    textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: Radius.full,
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#34D399',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.white,
    letterSpacing: 0.5,
  },
  formatBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  formatBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A7F3D0',
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.md + 2,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: '#E6ECE8',
    ...Shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingBottom: Spacing.sm,
    marginBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.text.primary,
  },
  detailValueBold: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  membersList: {
    marginTop: Spacing.xs,
    gap: Spacing.xs,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  memberRole: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 1,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  ratingPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  paymentStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  paymentStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  actionContainer: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: Radius.lg,
    paddingVertical: 14,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
  },
  lockedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  lockedNoteText: {
    fontSize: 12,
    color: Colors.text.secondary,
    flex: 1,
  },
  doneButton: {
    backgroundColor: Colors.brand.primary,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
