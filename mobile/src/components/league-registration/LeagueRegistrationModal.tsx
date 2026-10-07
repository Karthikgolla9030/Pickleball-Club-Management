/**
 * Aught2 Pickleball — League Registration Modal
 *
 * Dedicated multi-step registration flow adhering to Section D:
 * Step 1: Format context, capacity, roster & team name (Singles vs Doubles dynamic fields)
 * Step 2: Skill level / rating confirmation (validated against 1.0 - 7.0)
 * Step 3: Fee display, transparent payment terms, review & submit
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  DollarSign,
  Info,
  Search,
  Shield,
  Star,
  Trophy,
  User,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import {
  useAuth,
  useLeagueEligiblePartners,
  usePlayerProfile,
  usePlayerRegisterLeague,
} from '@/hooks';
import { Colors, Radius, Shadows, Spacing } from '@/theme';
import type {
  LeagueEligiblePartner,
  LeagueSummary,
  LeagueTeam,
} from '@/types';
import { formatDate } from '@/utils/formatters';

export interface LeagueRegistrationModalProps {
  visible: boolean;
  onClose: () => void;
  league: LeagueSummary | null;
  onSuccess?: (team: LeagueTeam) => void;
}

const RATING_PRESETS = [2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

export function LeagueRegistrationModal({
  visible,
  onClose,
  league,
  onSuccess,
}: LeagueRegistrationModalProps) {
  const { user } = useAuth();
  const { profile } = usePlayerProfile();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [teamName, setTeamName] = useState('');
  const [partnerType, setPartnerType] = useState<'club_member' | 'guest'>('club_member');
  const [selectedPartner, setSelectedPartner] = useState<LeagueEligiblePartner | null>(null);
  const [manualPartnerName, setManualPartnerName] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [skillRating, setSkillRating] = useState<number>(3.5);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const leagueId = league?.id ?? null;
  const isSingles = (league?.team_size ?? 2) === 1;

  const { data: eligiblePartners, isLoading: isLoadingPartners } = useLeagueEligiblePartners(
    leagueId,
    debouncedSearch
  );
  const { mutateAsync: registerTeam, isPending: isSubmitting } = usePlayerRegisterLeague(leagueId);

  // Debounce member search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(memberSearch);
    }, 250);
    return () => clearTimeout(timer);
  }, [memberSearch]);

  // Initialize defaults when modal opens
  useEffect(() => {
    if (visible && league) {
      setStep(1);
      setFormError(null);
      setAgreedToTerms(false);
      const defaultRating = profile?.skill_rating ? Number(profile.skill_rating) : 3.5;
      setSkillRating(Number.isFinite(defaultRating) ? defaultRating : 3.5);

      if (isSingles) {
        setTeamName(user?.full_name ? `${user.full_name}` : 'Single Entry');
      } else {
        setTeamName('');
        setSelectedPartner(null);
        setManualPartnerName('');
        setPartnerType('club_member');
      }
    }
  }, [visible, league, profile, user, isSingles]);

  if (!league) return null;

  const feeAmount = league.registration_fee ?? 0;
  const isFree = feeAmount === 0;
  const feeDisplay = isFree ? 'Free' : `$${feeAmount.toFixed(2)}`;
  const maxTeams = league.max_teams ?? 12;
  const currentTeams = league.teams_count ?? 0;
  const isFull = currentTeams >= maxTeams;

  // Step 1 Validation
  const validateStep1 = () => {
    setFormError(null);
    if (!teamName.trim()) {
      setFormError(isSingles ? 'Please enter your entry name.' : 'Please enter a team name.');
      return false;
    }
    if (!isSingles) {
      if (partnerType === 'club_member') {
        if (!selectedPartner) {
          setFormError('Please select a doubles partner from active club members, or choose manual guest name.');
          return false;
        }
        if (selectedPartner.user_id === user?.id) {
          setFormError('You cannot select yourself as your doubles partner.');
          return false;
        }
      } else {
        if (!manualPartnerName.trim()) {
          setFormError('Please enter your doubles partner\'s full name.');
          return false;
        }
        const partnerLower = manualPartnerName.trim().toLowerCase();
        const myNameLower = (user?.full_name || '').toLowerCase().trim();
        if (partnerLower === myNameLower) {
          setFormError('You cannot enter yourself as your doubles partner.');
          return false;
        }
      }
    }
    return true;
  };

  // Step 2 Validation
  const validateStep2 = () => {
    setFormError(null);
    if (isNaN(skillRating) || skillRating < 1.0 || skillRating > 7.0) {
      setFormError('Skill rating must be between 1.0 and 7.0.');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1) {
      if (validateStep1()) setStep(2);
    } else if (step === 2) {
      if (validateStep2()) setStep(3);
    }
  };

  const handleBack = () => {
    setFormError(null);
    if (step === 2) setStep(1);
    if (step === 3) setStep(2);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (league.status !== 'registration_open') {
      setFormError('Registration has closed for this league.');
      return;
    }
    if (isFull) {
      setFormError('This league has reached maximum team capacity.');
      return;
    }
    if (!agreedToTerms) {
      setFormError('Please confirm the agreement to complete registration.');
      return;
    }

    try {
      const payload = {
        teamName: teamName.trim(),
        partnerMembershipId: isSingles ? null : (partnerType === 'club_member' ? selectedPartner?.membership_id : null),
        partnerName: isSingles ? null : (partnerType === 'guest' ? manualPartnerName.trim() : null),
        skillRating: skillRating,
      };

      const team = await registerTeam(payload);
      Alert.alert(
        'Registration Confirmed! 🎉',
        `You have successfully registered "${team.name}" for ${league.name}.`,
        [{ text: 'OK', onPress: () => {
          onSuccess?.(team);
          onClose();
        }}]
      );
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to complete registration.';
      setFormError(msg);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardContainer}
        >
          {/* Header */}
          <View style={styles.topHeader}>
            <View style={styles.headerInfo}>
              <AppText style={styles.headerTitle}>League Registration</AppText>
              <AppText style={styles.headerLeagueName} numberOfLines={1}>
                {league.name}
              </AppText>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close registration modal"
            >
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Stepper Progress Indicator */}
          <View style={styles.stepperContainer}>
            <View style={styles.stepItem}>
              <View style={[styles.stepCircle, step >= 1 && styles.stepCircleActive]}>
                <AppText style={[styles.stepNum, step >= 1 && styles.stepNumActive]}>1</AppText>
              </View>
              <AppText style={[styles.stepLabel, step >= 1 && styles.stepLabelActive]}>Roster</AppText>
            </View>
            <View style={[styles.stepLine, step >= 2 && styles.stepLineActive]} />
            <View style={styles.stepItem}>
              <View style={[styles.stepCircle, step >= 2 && styles.stepCircleActive]}>
                <AppText style={[styles.stepNum, step >= 2 && styles.stepNumActive]}>2</AppText>
              </View>
              <AppText style={[styles.stepLabel, step >= 2 && styles.stepLabelActive]}>Rating</AppText>
            </View>
            <View style={[styles.stepLine, step >= 3 && styles.stepLineActive]} />
            <View style={styles.stepItem}>
              <View style={[styles.stepCircle, step >= 3 && styles.stepCircleActive]}>
                <AppText style={[styles.stepNum, step >= 3 && styles.stepNumActive]}>3</AppText>
              </View>
              <AppText style={[styles.stepLabel, step >= 3 && styles.stepLabelActive]}>Review</AppText>
            </View>
          </View>

          {formError ? (
            <View style={styles.errorBanner}>
              <Info size={16} color="#DC2626" />
              <AppText style={styles.errorBannerText}>{formError}</AppText>
            </View>
          ) : null}

          {/* Body Content */}
          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* ─── STEP 1: Roster & Names ─── */}
            {step === 1 && (
              <View style={styles.stepSection}>
                {/* League Format & Fee Quick Card */}
                <View style={styles.formatSummaryCard}>
                  <View style={styles.summaryItem}>
                    <AppText style={styles.summaryLabel}>Format</AppText>
                    <AppText style={styles.summaryVal}>
                      {isSingles ? 'Singles (1 Player)' : 'Doubles (2 Players)'}
                    </AppText>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <AppText style={styles.summaryLabel}>Capacity</AppText>
                    <AppText style={styles.summaryVal}>
                      {currentTeams} / {maxTeams} Teams
                    </AppText>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <AppText style={styles.summaryLabel}>Entry Fee</AppText>
                    <AppText style={[styles.summaryVal, { color: isFree ? '#16A34A' : '#0F172A' }]}>
                      {feeDisplay}
                    </AppText>
                  </View>
                </View>

                {/* Team / Entry Name Input */}
                <View style={styles.fieldGroup}>
                  <AppText style={styles.fieldLabel}>
                    {isSingles ? 'Entry Display Name' : 'Team Name'} <AppText style={styles.reqAsterisk}>*</AppText>
                  </AppText>
                  <TextInput
                    style={styles.textInput}
                    value={teamName}
                    onChangeText={setTeamName}
                    placeholder={isSingles ? 'e.g. Solo Ace' : 'e.g. Echo Elites'}
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="words"
                    maxLength={60}
                  />
                  <AppText style={styles.fieldHint}>
                    This name will appear on official weekly match schedules and standings.
                  </AppText>
                </View>

                {/* Registering Player Card */}
                <View style={styles.playerCard}>
                  <View style={styles.avatarCircle}>
                    <AppText style={styles.avatarInitial}>
                      {(user?.full_name || 'U').charAt(0).toUpperCase()}
                    </AppText>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <AppText style={styles.playerName}>{user?.full_name || 'Player'}</AppText>
                      <View style={styles.roleTag}>
                        <AppText style={styles.roleTagText}>{isSingles ? 'Player' : 'Captain'}</AppText>
                      </View>
                    </View>
                    <AppText style={styles.playerSub}>{user?.email || ''}</AppText>
                  </View>
                  <UserCheck size={20} color="#16A34A" />
                </View>

                {/* Doubles Partner Section (Only if Doubles) */}
                {!isSingles && (
                  <View style={styles.partnerSection}>
                    <AppText style={styles.sectionHeader}>Doubles Partner</AppText>

                    {/* Mode Toggle */}
                    <View style={styles.modeToggleRow}>
                      <TouchableOpacity
                        style={[
                          styles.modeBtn,
                          partnerType === 'club_member' && styles.modeBtnActive,
                        ]}
                        onPress={() => {
                          setPartnerType('club_member');
                          setFormError(null);
                        }}
                      >
                        <Users size={14} color={partnerType === 'club_member' ? '#FFFFFF' : '#475569'} />
                        <AppText
                          style={[
                            styles.modeBtnText,
                            partnerType === 'club_member' && styles.modeBtnTextActive,
                          ]}
                        >
                          Club Member
                        </AppText>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.modeBtn,
                          partnerType === 'guest' && styles.modeBtnActive,
                        ]}
                        onPress={() => {
                          setPartnerType('guest');
                          setFormError(null);
                        }}
                      >
                        <UserPlus size={14} color={partnerType === 'guest' ? '#FFFFFF' : '#475569'} />
                        <AppText
                          style={[
                            styles.modeBtnText,
                            partnerType === 'guest' && styles.modeBtnTextActive,
                          ]}
                        >
                          Guest / Manual
                        </AppText>
                      </TouchableOpacity>
                    </View>

                    {partnerType === 'club_member' ? (
                      <View>
                        {/* Selected Partner Pill if chosen */}
                        {selectedPartner ? (
                          <View style={styles.selectedPartnerCard}>
                            <View style={styles.avatarCirclePartner}>
                              <AppText style={styles.avatarInitial}>
                                {selectedPartner.full_name.charAt(0).toUpperCase()}
                              </AppText>
                            </View>
                            <View style={{ flex: 1, marginLeft: 12 }}>
                              <AppText style={styles.playerName}>{selectedPartner.full_name}</AppText>
                              <AppText style={styles.playerSub}>
                                {selectedPartner.membership_number ? `#${selectedPartner.membership_number} • ` : ''}
                                Rating: {selectedPartner.skill_rating ?? '3.5'}
                              </AppText>
                            </View>
                            <TouchableOpacity
                              onPress={() => setSelectedPartner(null)}
                              style={styles.changePartnerBtn}
                            >
                              <AppText style={styles.changePartnerText}>Change</AppText>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View>
                            <View style={styles.searchRow}>
                              <Search size={16} color="#94A3B8" />
                              <TextInput
                                style={styles.searchInput}
                                value={memberSearch}
                                onChangeText={setMemberSearch}
                                placeholder="Search active members by name or #"
                                placeholderTextColor="#94A3B8"
                              />
                            </View>

                            {isLoadingPartners ? (
                              <View style={styles.loadingBox}>
                                <ActivityIndicator size="small" color="#0D9488" />
                                <AppText style={styles.loadingText}>Searching club members...</AppText>
                              </View>
                            ) : eligiblePartners && eligiblePartners.length > 0 ? (
                              <View style={styles.partnerList}>
                                {eligiblePartners.slice(0, 6).map((p) => (
                                  <TouchableOpacity
                                    key={p.membership_id}
                                    style={styles.partnerOptionItem}
                                    onPress={() => {
                                      setSelectedPartner(p);
                                      setFormError(null);
                                    }}
                                  >
                                    <View style={styles.optionAvatar}>
                                      <AppText style={styles.optionAvatarText}>
                                        {p.full_name.charAt(0).toUpperCase()}
                                      </AppText>
                                    </View>
                                    <View style={{ flex: 1, marginLeft: 10 }}>
                                      <AppText style={styles.optionName}>{p.full_name}</AppText>
                                      <AppText style={styles.optionSub}>
                                        {p.membership_number ? `#${p.membership_number} • ` : ''}
                                        Rating {p.skill_rating ?? 3.5}
                                      </AppText>
                                    </View>
                                    <View style={styles.selectBtnPill}>
                                      <AppText style={styles.selectBtnPillText}>Select</AppText>
                                    </View>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            ) : (
                              <View style={styles.emptyMembersBox}>
                                <AppText style={styles.emptyMembersText}>
                                  No other eligible members found. You can switch to Guest / Manual to enter your partner's name.
                                </AppText>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    ) : (
                      <View style={styles.fieldGroup}>
                        <AppText style={styles.fieldLabel}>
                          Partner Full Name <AppText style={styles.reqAsterisk}>*</AppText>
                        </AppText>
                        <TextInput
                          style={styles.textInput}
                          value={manualPartnerName}
                          onChangeText={setManualPartnerName}
                          placeholder="e.g. Dylan O'Brien"
                          placeholderTextColor="#94A3B8"
                          autoCapitalize="words"
                        />
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* ─── STEP 2: Skill Rating & Fee ─── */}
            {step === 2 && (
              <View style={styles.stepSection}>
                <View style={styles.infoBanner}>
                  <Star size={18} color="#0D9488" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <AppText style={styles.infoBannerTitle}>Competition Rating Scale</AppText>
                    <AppText style={styles.infoBannerSub}>
                      Ratings follow standard pickleball levels (2.0 to 5.5+). Enter your verified skill level to ensure balanced league scheduling.
                    </AppText>
                  </View>
                </View>

                {/* Rating Input and Chips */}
                <View style={styles.fieldGroup}>
                  <AppText style={styles.fieldLabel}>
                    Your Skill Rating <AppText style={styles.reqAsterisk}>*</AppText>
                  </AppText>

                  <View style={styles.ratingDisplayRow}>
                    <View style={styles.ratingDisplayBadge}>
                      <AppText style={styles.ratingDisplayNum}>{skillRating.toFixed(1)}</AppText>
                      <AppText style={styles.ratingDisplayUnit}>DUPR / Club Rating</AppText>
                    </View>
                  </View>

                  {/* Preset Pills */}
                  <View style={styles.presetsRow}>
                    {RATING_PRESETS.map((p) => (
                      <TouchableOpacity
                        key={p}
                        style={[
                          styles.presetChip,
                          skillRating === p && styles.presetChipActive,
                        ]}
                        onPress={() => setSkillRating(p)}
                      >
                        <AppText
                          style={[
                            styles.presetChipText,
                            skillRating === p && styles.presetChipTextActive,
                          ]}
                        >
                          {p.toFixed(1)}
                        </AppText>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <AppText style={styles.fieldHint}>
                    Pre-filled from your player profile. You can adjust if your rating has recently updated.
                  </AppText>
                </View>

                {/* Fee & Payment Breakdown */}
                <View style={styles.feeBreakdownCard}>
                  <View style={styles.feeHeaderRow}>
                    <CreditCard size={18} color="#0F172A" />
                    <AppText style={styles.feeCardTitle}>Registration Fee</AppText>
                  </View>

                  <View style={styles.feeRow}>
                    <AppText style={styles.feeItemLabel}>League Entry Fee</AppText>
                    <AppText style={styles.feeItemVal}>{feeDisplay}</AppText>
                  </View>

                  <View style={styles.feeRow}>
                    <AppText style={styles.feeItemLabel}>Facility & Referee Fees</AppText>
                    <AppText style={styles.feeItemVal}>Included</AppText>
                  </View>

                  <View style={styles.feeDivider} />

                  <View style={styles.feeTotalRow}>
                    <AppText style={styles.feeTotalLabel}>Total Due</AppText>
                    <AppText style={styles.feeTotalVal}>{feeDisplay}</AppText>
                  </View>

                  <View style={styles.paymentTermsBox}>
                    <Info size={14} color="#64748B" />
                    <AppText style={styles.paymentTermsText}>
                      {isFree
                        ? 'This league is free for club members.'
                        : 'Entry fees are payable at the club desk prior to Week 1 or billed to your active club account.'}
                    </AppText>
                  </View>
                </View>
              </View>
            )}

            {/* ─── STEP 3: Review & Submit ─── */}
            {step === 3 && (
              <View style={styles.stepSection}>
                <View style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <Trophy size={20} color="#0D9488" />
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <AppText style={styles.reviewLeagueTitle}>{league.name}</AppText>
                      <AppText style={styles.reviewLeagueSub}>
                        {league.number_of_weeks} Weeks • {isSingles ? 'Singles' : 'Doubles'} • Top {league.playoff_team_count} Playoffs
                      </AppText>
                    </View>
                  </View>

                  <View style={styles.reviewDivider} />

                  <View style={styles.reviewGrid}>
                    <View style={styles.reviewRow}>
                      <AppText style={styles.reviewRowLabel}>Team / Entry</AppText>
                      <AppText style={styles.reviewRowVal}>{teamName}</AppText>
                    </View>

                    <View style={styles.reviewRow}>
                      <AppText style={styles.reviewRowLabel}>Registered Player(s)</AppText>
                      <AppText style={styles.reviewRowVal}>
                        {isSingles
                          ? user?.full_name || 'Player'
                          : `${user?.full_name || 'Player'} & ${
                              partnerType === 'club_member'
                                ? selectedPartner?.full_name || 'Partner'
                                : manualPartnerName
                            }`}
                      </AppText>
                    </View>

                    <View style={styles.reviewRow}>
                      <AppText style={styles.reviewRowLabel}>Declared Rating</AppText>
                      <AppText style={styles.reviewRowVal}>{skillRating.toFixed(1)}</AppText>
                    </View>

                    <View style={styles.reviewRow}>
                      <AppText style={styles.reviewRowLabel}>Total Entry Fee</AppText>
                      <AppText style={[styles.reviewRowVal, { color: isFree ? '#16A34A' : '#0F172A', fontWeight: '700' }]}>
                        {feeDisplay}
                      </AppText>
                    </View>
                  </View>
                </View>

                {/* Agreement Checkbox */}
                <TouchableOpacity
                  style={styles.termsRow}
                  activeOpacity={0.8}
                  onPress={() => setAgreedToTerms(!agreedToTerms)}
                >
                  <View style={[styles.checkbox, agreedToTerms && styles.checkboxActive]}>
                    {agreedToTerms && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                  </View>
                  <AppText style={styles.termsText}>
                    I confirm that the roster and rating information submitted above is accurate, and I agree to participate in scheduled matches according to league rules.
                  </AppText>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {/* Bottom Actions Bar */}
          <View style={styles.bottomBar}>
            {step > 1 ? (
              <TouchableOpacity
                style={styles.backBtn}
                onPress={handleBack}
                disabled={isSubmitting}
              >
                <AppText style={styles.backBtnText}>Back</AppText>
              </TouchableOpacity>
            ) : null}

            {step < 3 ? (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleNext}
              >
                <AppText style={styles.primaryBtnText}>Continue</AppText>
                <ChevronRight size={18} color="#FFFFFF" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  (!agreedToTerms || isSubmitting) && styles.primaryBtnDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!agreedToTerms || isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <AppText style={styles.primaryBtnText}>Confirm Registration</AppText>
                    <CheckCircle2 size={18} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalSafe: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  keyboardContainer: {
    flex: 1,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerInfo: {
    flex: 1,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerLeagueName: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  stepItem: {
    alignItems: 'center',
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stepCircleActive: {
    backgroundColor: '#0D9488',
  },
  stepNum: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  stepNumActive: {
    color: '#FFFFFF',
  },
  stepLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  stepLabelActive: {
    color: '#0D9488',
    fontWeight: '700',
  },
  stepLine: {
    width: 48,
    height: 2,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 8,
    marginBottom: 16,
  },
  stepLineActive: {
    backgroundColor: '#0D9488',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorBannerText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    color: '#B91C1C',
    fontWeight: '500',
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  stepSection: {},
  formatSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.sm,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 4,
    fontWeight: '500',
  },
  summaryVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E2E8F0',
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  reqAsterisk: {
    color: '#DC2626',
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
  },
  fieldHint: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCirclePartner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 17,
  },
  playerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  playerSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  roleTag: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  roleTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  partnerSection: {
    marginTop: 8,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  modeToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  modeBtnActive: {
    backgroundColor: '#0D9488',
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginLeft: 6,
  },
  modeBtnTextActive: {
    color: '#FFFFFF',
  },
  selectedPartnerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  changePartnerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#DBEAFE',
  },
  changePartnerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontSize: 14,
    color: '#0F172A',
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 13,
    color: '#64748B',
  },
  partnerList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  partnerOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  optionAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0284C7',
  },
  optionName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  optionSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  selectBtnPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  selectBtnPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16A34A',
  },
  emptyMembersBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyMembersText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#F0FDFA',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#CCFBF1',
    marginBottom: 16,
  },
  infoBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F766E',
  },
  infoBannerSub: {
    fontSize: 12,
    color: '#115E59',
    marginTop: 4,
    lineHeight: 16,
  },
  ratingDisplayRow: {
    alignItems: 'center',
    marginVertical: 10,
  },
  ratingDisplayBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.sm,
  },
  ratingDisplayNum: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0D9488',
  },
  ratingDisplayUnit: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 2,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginVertical: 10,
  },
  presetChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  presetChipActive: {
    backgroundColor: '#0D9488',
    borderColor: '#0D9488',
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  presetChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  feeBreakdownCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 10,
    ...Shadows.sm,
  },
  feeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  feeCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginLeft: 8,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  feeItemLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  feeItemVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  feeDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 10,
  },
  feeTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  feeTotalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  feeTotalVal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0D9488',
  },
  paymentTermsBox: {
    flexDirection: 'row',
    backgroundColor: '#F8FAF9',
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
  },
  paymentTermsText: {
    flex: 1,
    marginLeft: 6,
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
  },
  reviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    ...Shadows.sm,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewLeagueTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  reviewLeagueSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  reviewDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 14,
  },
  reviewGrid: {},
  reviewRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAF9',
  },
  reviewRowLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    marginBottom: 2,
  },
  reviewRowVal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  checkboxActive: {
    backgroundColor: '#0D9488',
    borderColor: '#0D9488',
  },
  termsText: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 12,
  },
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#475569',
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D9488',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
  },
  primaryBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
