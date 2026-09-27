/**
 * Aught2 Pickleball — Tournament Registration Modal
 *
 * Full-screen 3-step registration flow matching the reference designs:
 * Step 1: Player / Team Details (dynamic fields by format & category)
 * Step 2: Review Registration (5 structured sections)
 * Step 3: Payment & Confirm (payment method & submission)
 * Plus RegistrationSuccessView confirmation state.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../AppText';
import {
  useAuth,
  usePlayerMyRegistration,
  usePlayerProfile,
  usePlayerTournamentRegistration,
  useTournamentDetails,
} from '@/hooks';
import type { PlayerRegistrationResponse } from '@/types';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';
import { RegistrationDetailsModal } from './RegistrationDetailsModal';
import { RegistrationHeader } from './RegistrationHeader';
import { RegistrationSuccessView } from './RegistrationSuccessView';
import { Step1PlayerTeamDetails } from './Step1PlayerTeamDetails';
import { Step2ReviewRegistration } from './Step2ReviewRegistration';
import { Step3PaymentSubmit } from './Step3PaymentSubmit';
import type {
  RegistrationErrors,
  RegistrationFormState,
  RegistrationStep,
  TournamentRegistrationModalProps,
} from './types';

function normalizeGender(g?: string | null): string {
  if (!g) return '';
  const trimmed = g.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

export function TournamentRegistrationModal({
  visible,
  onClose,
  tournament,
  onSuccess,
}: TournamentRegistrationModalProps) {
  const { user } = useAuth();
  const { profile } = usePlayerProfile();

  // Load fresh full tournament configuration by tournament ID (single source of truth)
  const { tournament: detailedTournament } = useTournamentDetails(
    null,
    visible && tournament?.id ? tournament.id : null
  );

  // Active tournament merges detailed configuration over discovery item, preserving registration status
  const activeTournament = detailedTournament
    ? {
        ...detailedTournament,
        is_registered:
          (detailedTournament as any)?.is_registered ??
          (tournament as any)?.is_registered ??
          false,
        my_registration_id:
          (detailedTournament as any)?.my_registration_id ??
          (tournament as any)?.my_registration_id ??
          null,
        my_registration_status:
          (detailedTournament as any)?.my_registration_status ??
          (tournament as any)?.my_registration_status ??
          null,
      }
    : tournament;

  const [currentStep, setCurrentStep] = useState<RegistrationStep>(1);
  const [successResult, setSuccessResult] = useState<PlayerRegistrationResponse | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [alreadyRegisteredOverride, setAlreadyRegisteredOverride] = useState(false);

  // Check player's registration status from backend
  const {
    registration: existingRegistration,
    isRegistered,
    isLoading: isCheckingRegistration,
    refetch: refetchMyRegistration,
  } = usePlayerMyRegistration(visible && activeTournament?.id ? activeTournament.id : null);

  const isAlreadyRegistered = Boolean(
    alreadyRegisteredOverride ||
    isRegistered ||
    (activeTournament as any)?.is_registered ||
    (tournament as any)?.is_registered ||
    (existingRegistration && existingRegistration.status === 'confirmed')
  );

  const { register, isRegistering } = usePlayerTournamentRegistration(
    activeTournament?.id ?? null
  );

  const parsed = activeTournament ? parseTournamentConfig(activeTournament) : null;
  const isDoubles = parsed ? !parsed.isSingles : false;
  const isScramble = activeTournament?.format === 'scramble';

  // Initial Form State with smart prefilling from user profile
  const [formState, setFormState] = useState<RegistrationFormState>({
    fullName: '',
    email: '',
    phone: '',
    skillLevel: '3.5',
    gender: 'Male',
    age: '28',
    teamName: '',
    partnerFullName: '',
    partnerEmail: '',
    partnerPhone: '',
    partnerSkillLevel: '3.5',
    partnerGender: 'Male',
    partnerAge: '26',
    selectedPartner: null,
    partnerSearchQuery: '',
    confirmEligibility: true,
    acknowledgeMembership: true,
    paymentMethod: 'card',
    cardholderName: '',
    cardNumber: '',
    cardExpiry: '',
    cardCvv: '',
    upiId: '',
    agreeRulesAndCancellation: false,
    notes: '',
  });

  // Re-initialize when modal opens or tournament changes
  useEffect(() => {
    if (visible && activeTournament) {
      setCurrentStep(1);
      setSuccessResult(null);
      setSubmitError(null);
      setErrors({});
      setAlreadyRegisteredOverride(false);

      const userFull = user?.full_name || profile?.display_name || 'Karthik Golla';
      const userEmail = user?.email || (profile as any)?.email || 'karthik@example.com';
      const userPhone = (profile as any)?.phone || '+1 (555) 123-4567';
      const rawGender = profile?.gender ? normalizeGender(profile.gender) : 'Male';
      const userGender = (rawGender === 'Female' ? 'Female' : rawGender === 'Other' ? 'Other' : 'Male') as 'Male' | 'Female' | 'Other';
      const userSkill = parsed?.skillLevel || '3.5';

      let defaultTeam = '';
      if (activeTournament.format === 'pool_play') {
        defaultTeam = 'SVCE Picklers';
      } else if (activeTournament.format === 'bracket') {
        defaultTeam = 'The Smashers';
      }

      // Default partner gender based on category
      let defaultPartnerGender: 'Male' | 'Female' | 'Other' = 'Male';
      if (parsed?.category === "Women's Doubles") {
        defaultPartnerGender = 'Female';
      } else if (parsed?.category === 'Mixed Doubles') {
        defaultPartnerGender = userGender === 'Male' ? 'Female' : 'Male';
      }

      setFormState({
        fullName: userFull,
        email: userEmail,
        phone: userPhone,
        skillLevel: userSkill,
        gender: userGender,
        age: (profile as any)?.age ? String((profile as any).age) : '28',
        teamName: defaultTeam,
        partnerFullName: '',
        partnerEmail: '',
        partnerPhone: '',
        partnerSkillLevel: '3.5',
        partnerGender: defaultPartnerGender,
        partnerAge: '26',
        selectedPartner: null,
        partnerSearchQuery: '',
        confirmEligibility: true,
        acknowledgeMembership: true,
        paymentMethod: 'card',
        cardholderName: userFull,
        cardNumber: '',
        cardExpiry: '',
        cardCvv: '',
        upiId: '',
        agreeRulesAndCancellation: false,
        notes: '',
      });
    }
  }, [visible, activeTournament?.id, user, profile]);

  if (!visible || !activeTournament) return null;

  // If player is already registered, do NOT show payment or registration wizard.
  // Directly render the saved registration details modal!
  if (isAlreadyRegistered) {
    return (
      <RegistrationDetailsModal
        visible={visible}
        tournamentId={activeTournament?.id}
        tournament={activeTournament}
        registration={existingRegistration}
        onClose={onClose}
        onCancelled={() => {
          setAlreadyRegisteredOverride(false);
          void refetchMyRegistration();
          onClose();
        }}
      />
    );
  }

  // Display loading state while checking registration status to prevent flashing the form
  if (isCheckingRegistration) {
    return (
      <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
        <View style={styles.loadingModalOverlay}>
          <View style={styles.loadingModalCard}>
            <ActivityIndicator size="large" color="#005A36" />
            <AppText style={styles.loadingModalText}>Checking registration status...</AppText>
          </View>
        </View>
      </Modal>
    );
  }

  const handleFormChange = (patch: Partial<RegistrationFormState>) => {
    setFormState((prev) => ({ ...prev, ...patch }));
    // Clear field-specific errors when user modifies that field
    if (errors && Object.keys(errors).length > 0) {
      const newErrors = { ...errors };
      for (const k of Object.keys(patch) as (keyof RegistrationFormState)[]) {
        if (k in newErrors) {
          delete newErrors[k as keyof RegistrationErrors];
        }
      }
      setErrors(newErrors);
    }
  };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Validation before proceeding to Step 2
  const validateStep1 = (): boolean => {
    const errs: RegistrationErrors = {};

    // Check capacity and tournament status
    if (activeTournament) {
      if (
        activeTournament.max_participants != null &&
        activeTournament.participant_count != null &&
        activeTournament.participant_count >= activeTournament.max_participants
      ) {
        errs.fullName = 'Tournament is at full capacity. Registrations are closed.';
      }
      if (activeTournament.status !== 'registration_open' && !('is_registration_open' in activeTournament && (activeTournament as any).is_registration_open)) {
        errs.fullName = 'Tournament registration is currently closed.';
      }
    }

    // 1. Player 1 (You) Validation
    if (!formState.fullName.trim()) {
      errs.fullName = 'Full Name is required.';
    }
    if (!formState.email.trim()) {
      errs.email = 'Email address is required.';
    } else if (!emailRegex.test(formState.email.trim())) {
      errs.email = 'Please enter a valid email address.';
    }
    if (!formState.phone.trim()) {
      errs.phone = 'Phone number is required.';
    }
    if (!formState.skillLevel) {
      errs.skillLevel = 'Skill rating is required.';
    } else if (parsed && (parsed.isSingles || isScramble)) {
      const p1Rating = parseFloat(formState.skillLevel);
      const minRating = parseFloat(parsed.minSkillLevel || '3.5');
      const maxRating = parseFloat(parsed.maxSkillLevel || '4.5');
      const isSingleMode = parsed.skillLevelMode !== 'range';

      if (isSingleMode) {
        if (p1Rating !== minRating) {
          errs.skillLevel = `This tournament requires skill level ${parsed.skillLevelDisplay}. Your current rating (${p1Rating.toFixed(1)}) does not meet eligibility.`;
        }
      } else {
        if (p1Rating < minRating || p1Rating > maxRating) {
          errs.skillLevel = `This tournament requires skill level between ${parsed.minSkillLevel} and ${parsed.maxSkillLevel}. Your current rating (${p1Rating.toFixed(1)}) does not meet eligibility.`;
        }
      }
    }
    if (!formState.age.trim()) {
      errs.age = 'Age is required.';
    } else {
      const ageNum = parseInt(formState.age.trim(), 10);
      if (isNaN(ageNum) || ageNum <= 0 || ageNum > 120) {
        errs.age = 'Please enter a valid age.';
      } else if (parsed?.minAge && ageNum < parsed.minAge) {
        errs.age = `Minimum age for this tournament is ${parsed.minAge}.`;
      } else if (parsed?.maxAge && ageNum > parsed.maxAge) {
        errs.age = `Maximum age for this tournament is ${parsed.maxAge}.`;
      }
    }
    if (!formState.gender) {
      errs.gender = 'Gender is required.';
    }

    // Category / Format gender restrictions on Player 1
    if (isScramble && parsed) {
      if (parsed.category === "Men's Scramble" && formState.gender !== 'Male') {
        errs.gender = "Men's Scramble is restricted to male players.";
      } else if (parsed.category === "Women's Scramble" && formState.gender !== 'Female') {
        errs.gender = "Women's Scramble is restricted to female players.";
      }
    } else if (parsed?.isSingles) {
      if (parsed.category.includes("Men's") && formState.gender !== 'Male') {
        errs.gender = "Men's Singles is restricted to male players.";
      } else if (parsed.category.includes("Women's") && formState.gender !== 'Female') {
        errs.gender = "Women's Singles is restricted to female players.";
      }
    }

    // 2. Doubles specific validation (Player 2)
    if (isDoubles) {
      const partnerName = formState.selectedPartner
        ? formState.selectedPartner.full_name
        : formState.partnerFullName.trim();
      const partnerEmail = formState.selectedPartner
        ? formState.selectedPartner.email
        : formState.partnerEmail.trim();
      const partnerGender = formState.selectedPartner
        ? normalizeGender(formState.selectedPartner.gender)
        : formState.partnerGender;

      if (!partnerName) {
        errs.partnerFullName = 'Partner full name is required.';
      } else if (partnerName.toLowerCase() === formState.fullName.trim().toLowerCase()) {
        errs.partnerFullName = 'Partner cannot be the same person as the registering player.';
      }

      if (!partnerEmail) {
        errs.partnerEmail = 'Partner email is required.';
      } else if (!emailRegex.test(partnerEmail)) {
        errs.partnerEmail = 'Please enter a valid partner email address.';
      } else if (partnerEmail.toLowerCase() === formState.email.trim().toLowerCase()) {
        errs.partnerEmail = 'Partner cannot have the same email as the registering player.';
      }

      // Partner Age check
      if (formState.partnerAge.trim()) {
        const pAgeNum = parseInt(formState.partnerAge.trim(), 10);
        if (isNaN(pAgeNum) || pAgeNum <= 0 || pAgeNum > 120) {
          errs.partnerAge = 'Please enter a valid age.';
        } else if (parsed?.minAge && pAgeNum < parsed.minAge) {
          errs.partnerAge = `Minimum age for this tournament is ${parsed.minAge}.`;
        } else if (parsed?.maxAge && pAgeNum > parsed.maxAge) {
          errs.partnerAge = `Maximum age for this tournament is ${parsed.maxAge}.`;
        }
      }

      // Gender pairing rules
      if (parsed?.category === "Men's Doubles") {
        if (formState.gender !== 'Male') {
          errs.gender = "Men's Doubles requires both players to be male.";
        }
        if (partnerGender !== 'Male') {
          errs.partnerGender = "Partner must be male for Men's Doubles.";
        }
      } else if (parsed?.category === "Women's Doubles") {
        if (formState.gender !== 'Female') {
          errs.gender = "Women's Doubles requires both players to be female.";
        }
        if (partnerGender !== 'Female') {
          errs.partnerGender = "Partner must be female for Women's Doubles.";
        }
      } else if (parsed?.category === 'Mixed Doubles') {
        if (formState.gender === partnerGender) {
          errs.partnerGender = 'Mixed Doubles requires one male and one female player.';
        }
      }

      // Doubles Skill Eligibility Check
      if (parsed) {
        const p1Rating = parseFloat(formState.skillLevel) || 3.5;
        const partnerRating = formState.selectedPartner?.skill_rating != null
          ? Number(formState.selectedPartner.skill_rating)
          : parseFloat(formState.partnerSkillLevel) || 3.5;
        const teamRating = Math.round(((p1Rating + partnerRating) / 2) * 100) / 100;
        const minRating = parseFloat(parsed.minSkillLevel || '3.5');
        const maxRating = parseFloat(parsed.maxSkillLevel || '4.5');
        const isSingleMode = parsed.skillLevelMode !== 'range';

        if (isSingleMode) {
          if (p1Rating !== minRating) {
            errs.skillLevel = `This tournament requires skill level ${parsed.skillLevelDisplay}. Your rating (${p1Rating.toFixed(1)}) does not meet eligibility.`;
          }
          if (partnerRating !== minRating) {
            errs.partnerSkillLevel = `This tournament requires skill level ${parsed.skillLevelDisplay}. Partner's rating (${partnerRating.toFixed(1)}) does not meet eligibility.`;
          }
          if (teamRating !== minRating) {
            errs.partnerSkillLevel = `This tournament requires skill level ${parsed.skillLevelDisplay}. Your team's average rating (${teamRating.toFixed(2)}) does not meet eligibility.`;
          }
        } else {
          if (p1Rating < minRating || p1Rating > maxRating) {
            errs.skillLevel = `This tournament requires skill level between ${parsed.minSkillLevel} and ${parsed.maxSkillLevel}. Your rating (${p1Rating.toFixed(1)}) is outside this range.`;
          }
          if (partnerRating < minRating || partnerRating > maxRating) {
            errs.partnerSkillLevel = `This tournament requires skill level between ${parsed.minSkillLevel} and ${parsed.maxSkillLevel}. Partner's rating (${partnerRating.toFixed(1)}) is outside this range.`;
          }
          if (teamRating < minRating || teamRating > maxRating) {
            errs.partnerSkillLevel = `This tournament requires team rating between ${parsed.minSkillLevel} and ${parsed.maxSkillLevel}. Team average (${teamRating.toFixed(2)}) is outside this range.`;
          }
        }
      }
    }

    // 3. Mandatory Checkbox Confirmations
    if (!formState.confirmEligibility) {
      errs.confirmEligibility = 'Please confirm that players meet eligibility requirements.';
    }
    if (!formState.acknowledgeMembership) {
      errs.acknowledgeMembership = 'Please acknowledge that active club membership is required.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Step 3 Validation before Final Submission
  const validateStep3 = (): boolean => {
    const errs: RegistrationErrors = {};

    const rawFee = (activeTournament as any).registration_fee != null
      ? Number((activeTournament as any).registration_fee)
      : (activeTournament as any).format_configuration?.entry_fee != null
      ? Number((activeTournament as any).format_configuration.entry_fee)
      : (activeTournament as any).format_configuration?.registration_fee != null
      ? Number((activeTournament as any).format_configuration.registration_fee)
      : null;
    const defaultFee = isScramble ? 35 : parsed?.isSingles ? 30 : activeTournament.format === 'bracket' ? 60 : 50;
    const feeAmount = rawFee !== null && !isNaN(rawFee) ? rawFee : defaultFee;
    const isFree = feeAmount === 0;

    if (!formState.agreeRulesAndCancellation) {
      errs.agreeRulesAndCancellation = 'You must agree to the tournament rules and cancellation policy.';
    }

    if (!isFree) {
      if (formState.paymentMethod === 'card') {
        if (!formState.cardholderName.trim()) {
          errs.cardholderName = 'Cardholder name is required.';
        }
        const cleanedCard = formState.cardNumber.replace(/\s/g, '');
        if (!cleanedCard || cleanedCard.length < 15) {
          errs.cardNumber = 'Valid 16-digit card number is required.';
        }
        if (!formState.cardExpiry.trim() || !formState.cardExpiry.includes('/')) {
          errs.cardExpiry = 'Valid expiry date (MM/YY) is required.';
        }
        if (!formState.cardCvv.trim() || formState.cardCvv.length < 3) {
          errs.cardCvv = 'Valid CVV is required.';
        }
      } else if (formState.paymentMethod === 'upi') {
        if (!formState.upiId.trim() || !formState.upiId.includes('@')) {
          errs.upiId = 'Valid UPI ID is required (e.g. mobile@upi).';
        }
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNextFromStep1 = () => {
    if (validateStep1()) {
      setCurrentStep(2);
    }
  };

  const handleNextFromStep2 = () => {
    setCurrentStep(3);
  };

  const handleBackToStep1 = () => {
    setCurrentStep(1);
  };

  const handleBackToStep2 = () => {
    setCurrentStep(2);
  };

  // Final submission on Step 3
  const handleSubmit = async () => {
    if (!validateStep3()) return;
    setSubmitError(null);
    try {
      const partnerNotes = formState.selectedPartner
        ? `Partner: ${formState.selectedPartner.full_name} (${formState.selectedPartner.email})`
        : formState.partnerFullName
        ? `Partner: ${formState.partnerFullName} (${formState.partnerEmail}${formState.partnerPhone ? ', ' + formState.partnerPhone : ''})`
        : null;

      const teamName = isDoubles
        ? formState.teamName.trim() || `${formState.fullName} & ${formState.partnerFullName || formState.selectedPartner?.full_name || 'Partner'}`
        : null;

      const payload = {
        team_name: teamName,
        partner_membership_id: isDoubles ? formState.selectedPartner?.membership_id : null,
        skill_level: formState.skillLevel,
        partner_skill_level: isDoubles ? formState.partnerSkillLevel : null,
        gender: formState.gender,
        age: formState.age ? parseInt(formState.age, 10) : null,
        payment_method: formState.paymentMethod,
        notes: [formState.notes.trim(), partnerNotes].filter(Boolean).join(' | ') || null,
      };

      const res = await register(payload);
      setSuccessResult(res);
      void refetchMyRegistration();
      if (onSuccess) {
        onSuccess(res);
      }
    } catch (err: unknown) {
      const rawMsg =
        (err as any)?.detail ||
        (err as any)?.message ||
        (err instanceof Error ? err.message : 'Registration failed. Please try again.');
      const msg = typeof rawMsg === 'string' ? rawMsg : JSON.stringify(rawMsg);
      if (msg.toLowerCase().includes('already registered')) {
        void refetchMyRegistration();
        setAlreadyRegisteredOverride(true);
        return;
      }
      setSubmitError(msg);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.keyboardContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header with Top Nav, Metadata Card & 3-Step Progress */}
          {!successResult && (
            <RegistrationHeader
              tournament={activeTournament}
              currentStep={currentStep}
              onBack={() => {
                if (currentStep === 1) onClose();
                else if (currentStep === 2) setCurrentStep(1);
                else if (currentStep === 3) setCurrentStep(2);
              }}
              onClose={onClose}
            />
          )}

          {/* Scrollable Step Content */}
          <ScrollView
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {successResult ? (
              <RegistrationSuccessView
                tournament={activeTournament}
                formState={formState}
                result={successResult}
                onDone={onClose}
              />
            ) : currentStep === 1 ? (
              <Step1PlayerTeamDetails
                tournament={activeTournament}
                formState={formState}
                errors={errors}
                onChange={handleFormChange}
                onNext={handleNextFromStep1}
              />
            ) : currentStep === 2 ? (
              <Step2ReviewRegistration
                tournament={activeTournament}
                formState={formState}
                onBack={handleBackToStep1}
                onNext={handleNextFromStep2}
              />
            ) : (
              <Step3PaymentSubmit
                tournament={activeTournament}
                formState={formState}
                errors={errors}
                isSubmitting={isRegistering}
                submitError={submitError}
                onChange={handleFormChange}
                onBack={handleBackToStep2}
                onSubmit={handleSubmit}
              />
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  scrollContent: {
    flexGrow: 1,
  },
  loadingModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  loadingModalText: {
    marginTop: 12,
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
});
