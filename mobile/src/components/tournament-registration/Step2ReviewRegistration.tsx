/**
 * Aught2 Pickleball — Step 2: Review Registration
 *
 * Exact recreation of Screen 2 from reference designs:
 * - Card 1: Team information (Team name, Division, Format, Entry fee) with "Edit details"
 * - Card 2: Players (Player 1 + Player 2 cards with avatars, email, phone, skill, age) with "Edit details"
 * - Card 3: Important information with green checkmarks (Eligibility & Membership verified)
 * - Primary CTA: "Continue to payment →"
 * - Secondary action: "← Back to edit details"
 */

import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Edit2,
  Info,
  User,
  Users,
} from 'lucide-react-native';

import { AppText } from '../AppText';
import type { Tournament, TournamentDiscoveryItem, TournamentFormat } from '@/types';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';
import type { RegistrationFormState } from './types';

interface Step2Props {
  tournament: TournamentDiscoveryItem | Tournament;
  formState: RegistrationFormState;
  onBack: () => void;
  onNext: () => void;
}

export function Step2ReviewRegistration({
  tournament,
  formState,
  onBack,
  onNext,
}: Step2Props) {
  const parsed = parseTournamentConfig(tournament);
  const isScramble = tournament.format === 'scramble';
  const isDoubles = !parsed.isSingles && !isScramble;
  const category = parsed.category || (isScramble ? 'Open Scramble' : 'Singles');

  // Fee calculation (from Club configuration or format defaults)
  const rawFee = (tournament as any).registration_fee != null
    ? Number((tournament as any).registration_fee)
    : (tournament as any).format_configuration?.entry_fee != null
    ? Number((tournament as any).format_configuration.entry_fee)
    : (tournament as any).format_configuration?.registration_fee != null
    ? Number((tournament as any).format_configuration.registration_fee)
    : null;

  const defaultFee = isScramble
    ? 35
    : parsed.isSingles
    ? 30
    : tournament.format === 'bracket'
    ? 60
    : 50;

  const feeNumber: number = rawFee !== null && !isNaN(rawFee) ? rawFee : defaultFee;

  const feeDisplay = feeNumber === 0
    ? 'Free'
    : isDoubles
    ? `$${feeNumber}.00 (per team)`
    : `$${feeNumber}.00 (per player)`;

  const formatLabel = tournament.format_label || String(tournament.format).toUpperCase();

  return (
    <View style={styles.container}>
      {/* ─── Card 1: Team Information / Details ─── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <AppText style={styles.cardTitle}>
            {isDoubles ? 'Team information' : 'Tournament information'}
          </AppText>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={onBack}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Edit2 size={13} color="#064E3B" style={{ marginRight: 4 }} />
            <AppText style={styles.editBtnText}>Edit details</AppText>
          </TouchableOpacity>
        </View>

        <View style={styles.cardBody}>
          {isDoubles && (
            <View style={styles.infoRow}>
              <AppText style={styles.infoLabel}>Team name</AppText>
              <AppText style={styles.infoValue}>
                {formState.teamName.trim() ? formState.teamName : 'Not specified'}
              </AppText>
            </View>
          )}

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Division</AppText>
            <AppText style={styles.infoValue}>{category}</AppText>
          </View>

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Required Skill</AppText>
            <AppText style={[styles.infoValue, { color: '#064E3B', fontWeight: '700' }]}>
              {parsed.skillLevel} Level
            </AppText>
          </View>

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Format</AppText>
            <AppText style={styles.infoValue}>{formatLabel}</AppText>
          </View>

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Match Rules</AppText>
            <AppText style={styles.infoValue}>
              To {parsed.targetScore} (Win by {parsed.winBy})
            </AppText>
          </View>

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Eligibility</AppText>
            <AppText style={styles.infoValue}>
              {parsed.genderEligibility} • {parsed.ageRestrictionText}
            </AppText>
          </View>

          <View style={styles.infoRow}>
            <AppText style={styles.infoLabel}>Entry fee</AppText>
            <AppText style={styles.infoValue}>{feeDisplay}</AppText>
          </View>
        </View>
      </View>

      {/* ─── Card 2: Players ─── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <AppText style={styles.cardTitle}>
            {isDoubles ? 'Players' : 'Player'}
          </AppText>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={onBack}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Edit2 size={13} color="#064E3B" style={{ marginRight: 4 }} />
            <AppText style={styles.editBtnText}>Edit details</AppText>
          </TouchableOpacity>
        </View>

        <View style={styles.cardBody}>
          {/* Player 1 (You) */}
          <View style={styles.playerReviewItem}>
            <View style={styles.playerAvatarCircle}>
              <User size={18} color="#0284C7" />
            </View>

            <View style={styles.playerDetailsBlock}>
              <View style={styles.playerNameRow}>
                <AppText style={styles.playerNameText}>
                  {formState.fullName || 'Player 1'}
                </AppText>
                <AppText style={styles.youBadgeText}> (You)</AppText>
              </View>

              <View style={styles.playerMetaGrid}>
                <View style={styles.playerMetaRow}>
                  <AppText style={styles.playerMetaLabel}>Email</AppText>
                  <AppText style={styles.playerMetaValue}>{formState.email || 'karthik@example.com'}</AppText>
                </View>

                <View style={styles.playerMetaRow}>
                  <AppText style={styles.playerMetaLabel}>Phone</AppText>
                  <AppText style={styles.playerMetaValue}>{formState.phone || '+1 (555) 123-4567'}</AppText>
                </View>

                <View style={styles.playerMetaRow}>
                  <AppText style={styles.playerMetaLabel}>Skill rating</AppText>
                  <AppText style={styles.playerMetaValue}>{formState.skillLevel || '3.5'}</AppText>
                </View>

                <View style={styles.playerMetaRow}>
                  <AppText style={styles.playerMetaLabel}>Age</AppText>
                  <AppText style={styles.playerMetaValue}>{formState.age || '28'}</AppText>
                </View>
              </View>
            </View>
          </View>

          {/* Player 2 (Partner - Doubles only) */}
          {isDoubles && (
            <View style={[styles.playerReviewItem, styles.playerReviewDivider]}>
              <View style={styles.playerAvatarCircle}>
                <User size={18} color="#0284C7" />
              </View>

              <View style={styles.playerDetailsBlock}>
                <AppText style={styles.playerNameText}>
                  {formState.partnerFullName || formState.selectedPartner?.full_name || 'Player 2'}
                </AppText>

                <View style={styles.playerMetaGrid}>
                  <View style={styles.playerMetaRow}>
                    <AppText style={styles.playerMetaLabel}>Email</AppText>
                    <AppText style={styles.playerMetaValue}>
                      {formState.partnerEmail || formState.selectedPartner?.email || 'partner@example.com'}
                    </AppText>
                  </View>

                  <View style={styles.playerMetaRow}>
                    <AppText style={styles.playerMetaLabel}>Phone</AppText>
                    <AppText style={styles.playerMetaValue}>
                      {formState.partnerPhone || '+1 (555) 987-6543'}
                    </AppText>
                  </View>

                  <View style={styles.playerMetaRow}>
                    <AppText style={styles.playerMetaLabel}>Skill rating</AppText>
                    <AppText style={styles.playerMetaValue}>
                      {formState.partnerSkillLevel || '3.5'}
                    </AppText>
                  </View>

                  <View style={styles.playerMetaRow}>
                    <AppText style={styles.playerMetaLabel}>Age</AppText>
                    <AppText style={styles.playerMetaValue}>
                      {formState.partnerAge || '26'}
                    </AppText>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Scramble notice */}
          {isScramble && (
            <View style={styles.scrambleNoteBox}>
              <Info size={14} color="#064E3B" style={{ marginTop: 1 }} />
              <AppText style={styles.scrambleNoteText}>
                Individual Scramble registration. Partners will rotate automatically across all match rounds.
              </AppText>
            </View>
          )}
        </View>
      </View>

      {/* ─── Card 3: Important Information ─── */}
      <View style={styles.card}>
        <AppText style={styles.cardTitle}>Important information</AppText>

        <View style={[styles.cardBody, { paddingTop: 10, gap: 10 }]}>
          <View style={styles.verifiedRow}>
            <CheckCircle2 size={16} color="#16A34A" />
            <AppText style={styles.verifiedText}>
              {isDoubles
                ? `Both players meet the ${parsed.skillLevel} skill level division criteria.`
                : `Player meets the ${parsed.skillLevel} skill level division criteria.`}
            </AppText>
          </View>

          <View style={styles.verifiedRow}>
            <CheckCircle2 size={16} color="#16A34A" />
            <AppText style={styles.verifiedText}>
              {isDoubles
                ? 'Both players meet the tournament eligibility requirements.'
                : 'Player meets the tournament eligibility requirements.'}
            </AppText>
          </View>

          <View style={styles.verifiedRow}>
            <CheckCircle2 size={16} color="#16A34A" />
            <AppText style={styles.verifiedText}>
              Club membership requirement acknowledged.
            </AppText>
          </View>
        </View>
      </View>

      {/* ─── Navigation Buttons ─── */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={styles.continueBtn}
          onPress={onNext}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Continue to payment"
        >
          <AppText style={styles.continueBtnText}>Continue to payment →</AppText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back to edit details"
        >
          <AppText style={styles.backBtnText}>← Back to edit details</AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F2E28',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#064E3B',
  },
  cardBody: {
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoLabel: {
    fontSize: 12.5,
    color: '#64748B',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F2E28',
  },
  playerReviewItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  playerReviewDivider: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  playerAvatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  playerDetailsBlock: {
    flex: 1,
  },
  playerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  playerNameText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F2E28',
  },
  youBadgeText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  playerMetaGrid: {
    gap: 4,
  },
  playerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playerMetaLabel: {
    width: 85,
    fontSize: 12,
    color: '#64748B',
  },
  playerMetaValue: {
    flex: 1,
    fontSize: 12.5,
    color: '#1E293B',
    fontWeight: '500',
  },
  scrambleNoteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    padding: 10,
    gap: 8,
    marginTop: 6,
  },
  scrambleNoteText: {
    flex: 1,
    fontSize: 12,
    color: '#064E3B',
    lineHeight: 16,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  verifiedText: {
    flex: 1,
    fontSize: 12,
    color: '#334155',
    lineHeight: 16,
  },
  actionsContainer: {
    gap: 12,
    marginTop: 6,
  },
  continueBtn: {
    backgroundColor: '#064E3B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  continueBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  backBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#064E3B',
  },
});
