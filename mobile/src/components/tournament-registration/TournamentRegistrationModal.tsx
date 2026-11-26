/**
 * Aught2 Pickleball — Tournament Registration Modal
 *
 * Full-screen 3-step registration flow matching the reference designs:
 * Step 1: Player / Team Details (dynamic fields by format & category)
 * Step 2: Review Registration (5 structured sections)
 * Step 3: Payment & Confirm (payment method & submission)
 * Plus RegistrationSuccessView confirmation state.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, X } from 'lucide-react-native';

import { useQueryClient } from '@tanstack/react-query';

import { AppText } from '../AppText';
import { CheckoutModal, type CheckoutSummaryDetail } from '../checkout';
import { formatDate } from '@/utils';
import {
  useAuth,
  usePlayerMyRegistration,
  usePlayerProfile,
  usePlayerTournamentRegistration,
  useTournamentDetails,
} from '@/hooks';
import { QUERY_KEYS } from '@/constants';
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
  const { profile, updateProfile } = usePlayerProfile();

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

  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState<RegistrationStep>(1);
  const [successResult, setSuccessResult] = useState<PlayerRegistrationResponse | null>(null);
  const [confirmedRegResult, setConfirmedRegResult] = useState<PlayerRegistrationResponse | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [alreadyRegisteredOverride, setAlreadyRegisteredOverride] = useState(false);
  const [overrideRegistration, setOverrideRegistration] = useState<PlayerRegistrationResponse | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Check player's registration status from backend
  const {
    registration: existingRegistration,
    isRegistered,
    isLoading: isCheckingRegistration,
    refetch: refetchMyRegistration,
  } = usePlayerMyRegistration(visible && activeTournament?.id ? activeTournament.id : null);

  // Only treat as "already registered" when there is NO pending successResult.
  // If the user just completed registration (successResult is set), we must show
  // the RegistrationSuccessView — not short-circuit to RegistrationDetailsModal.
  // The refetchMyRegistration() that runs after success will update isRegistered
  // asynchronously, which must NOT preempt the success screen.
  const isAlreadyRegistered = currentStep !== 3 && !successResult && Boolean(
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
    paymentMethod: 'upi',
    paymentMobileNumber: '',
    cardholderName: '',
    cardNumber: '',
    cardExpiry: '',
    cardCvv: '',
    upiId: '',
    agreeRulesAndCancellation: false,
    notes: '',
  });

  // Track initialization to avoid resetting formState when profile/user queries update in background
  const initializedTournamentIdRef = useRef<string | null>(null);

  // Re-initialize only when modal opens or tournament changes
  useEffect(() => {
    if (visible && activeTournament?.id) {
      if (initializedTournamentIdRef.current !== activeTournament.id) {
        initializedTournamentIdRef.current = activeTournament.id;
        setCurrentStep(1);
        setSuccessResult(null);
        setConfirmedRegResult(null);
        setSubmitError(null);
        setErrors({});
        setAlreadyRegisteredOverride(false);
        setOverrideRegistration(null);

        const userFull = user?.full_name || profile?.display_name || 'Player';
        const userEmail = user?.email || (profile as any)?.email || '';
        const userPhone = profile?.phone || '';
        const categoryName = parsed?.category || '';
        let defaultGender: 'Male' | 'Female' | 'Other' = 'Male';
        if (profile?.gender) {
          const norm = normalizeGender(profile.gender);
          defaultGender = (norm === 'Female' ? 'Female' : norm === 'Other' ? 'Other' : 'Male');
        } else if (categoryName.includes("Women's")) {
          defaultGender = 'Female';
        } else {
          defaultGender = 'Male';
        }
        const userGender = defaultGender;
        const userSkill = parsed?.skillLevel || '3.5';

        let defaultTeam = '';

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
          paymentMethod: 'upi',
          paymentMobileNumber: userPhone,
          cardholderName: userFull,
          cardNumber: '',
          cardExpiry: '',
          cardCvv: '',
          upiId: '',
          agreeRulesAndCancellation: false,
          notes: '',
        });
      }
    } else if (!visible) {
      initializedTournamentIdRef.current = null;
    }
  }, [visible, activeTournament?.id]);

  if (!visible || !activeTournament) return null;

  // If player is already registered, do NOT show payment or registration wizard.
  // Directly render the saved registration details modal!
  if (isAlreadyRegistered) {
    return (
      <RegistrationDetailsModal
        visible={visible}
        tournamentId={activeTournament?.id}
        tournament={activeTournament}
        registration={overrideRegistration || existingRegistration}
        onClose={() => {
          setAlreadyRegisteredOverride(false);
          onClose();
        }}
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
      const currentEntryCount = activeTournament.teams_count ?? activeTournament.participant_count;
      if (
        activeTournament.max_participants != null &&
        currentEntryCount != null &&
        currentEntryCount >= activeTournament.max_participants
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
    const catName = parsed?.category || '';
    if (isScramble) {
      if (catName.includes("Men's") && formState.gender !== 'Male') {
        errs.gender = "Men's Scramble is restricted to male players.";
      } else if (catName.includes("Women's") && formState.gender !== 'Female') {
        errs.gender = "Women's Scramble is restricted to female players.";
      } else if (catName.includes("Mixed") && formState.gender !== 'Male' && formState.gender !== 'Female') {
        errs.gender = "Mixed Scramble requires gender to be set to Male or Female.";
      }
    } else if (parsed?.isSingles) {
      if (catName.includes("Men's") && formState.gender !== 'Male') {
        errs.gender = "Men's Singles is restricted to male players.";
      } else if (catName.includes("Women's") && formState.gender !== 'Female') {
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

    if (!isFree && !formState.agreeRulesAndCancellation) {
      errs.agreeRulesAndCancellation = 'You must agree to the tournament rules and cancellation policy.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNextFromStep1 = async () => {
    if (!validateStep1()) return;

    // Persist player gender and phone to backend profile if available
    if (formState.gender) {
      try {
        await updateProfile({
          gender: formState.gender,
          phone: formState.phone?.trim() || undefined,
        });
      } catch {
        // Silently tolerate if offline or server restarting; backend tournament self_register endpoint also persists profile gender and phone
      }
    }

    setCurrentStep(2);
  };

  const handleNextFromStep2 = () => {
    setSubmitError(null);
    setCurrentStep(3);
  };

  const handleBackToStep1 = () => {
    setCurrentStep(1);
  };

  const handleBackToStep2 = () => {
    setSubmitError(null);
    setCurrentStep(2);
  };

  // Final submission invoked via shared CheckoutModal
  const handleCheckoutConfirm = async ({
    isFree,
    gatewayReady,
  }: {
    isFree: boolean;
    gatewayReady: boolean;
  }) => {
    const partnerNotes = formState.selectedPartner
      ? `Partner: ${formState.selectedPartner.full_name} (${formState.selectedPartner.email})`
      : formState.partnerFullName
      ? `Partner: ${formState.partnerFullName} (${formState.partnerEmail}${formState.partnerPhone ? ', ' + formState.partnerPhone : ''})`
      : null;

    const teamName = isDoubles
      ? formState.teamName.trim() || `${formState.fullName} & ${formState.partnerFullName || formState.selectedPartner?.full_name || 'Partner'}`
      : null;

    const partnerEmail = isDoubles
      ? (formState.selectedPartner?.email || formState.partnerEmail.trim() || null)
      : null;
    const partnerName = isDoubles
      ? (formState.selectedPartner?.full_name || formState.partnerFullName.trim() || null)
      : null;

    if (formState.gender && (!profile?.gender || profile.gender !== formState.gender)) {
      try {
        await updateProfile({ gender: formState.gender });
      } catch {
        // Backend self_register endpoint will also persist profile gender
      }
    }

    setIsProcessingPayment(true);
    setSubmitError(null);
    try {
      const partnerGender = isDoubles
        ? (formState.selectedPartner?.gender || formState.partnerGender || null)
        : null;

      const payload: any = {
        team_name: teamName,
        partner_membership_id: isDoubles ? formState.selectedPartner?.membership_id : null,
        partner_email: partnerEmail,
        partner_name: partnerName,
        partner_gender: partnerGender,
        skill_level: formState.skillLevel,
        partner_skill_level: isDoubles ? formState.partnerSkillLevel : null,
        gender: formState.gender,
        age: formState.age ? parseInt(formState.age, 10) : null,
        payment_method: isFree ? 'free' : 'other',
        notes: [formState.notes.trim(), partnerNotes].filter(Boolean).join(' | ') || null,
      };

      const res = await register(payload);
      void refetchMyRegistration();
      if (activeTournament?.id) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.TOURNAMENT_DETAIL(activeTournament.id) });
        queryClient.invalidateQueries({ queryKey: ['tournaments', activeTournament.id] });
        queryClient.invalidateQueries({ queryKey: ['tournaments', activeTournament.id, 'teams'] });
        queryClient.invalidateQueries({ queryKey: ['tournaments', activeTournament.id, 'registrations'] });
        queryClient.invalidateQueries({ queryKey: ['tournaments', activeTournament.id, 'player-registrations'] });
        queryClient.invalidateQueries({ queryKey: ['tournament-registrations', activeTournament.id] });
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PLAYER_TOURNAMENTS });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['clubs'] });
      queryClient.invalidateQueries({ queryKey: ['player', 'my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['player', 'payments'] });
      setConfirmedRegResult(res);

      const isWaitlisted = String(res.status || '').toLowerCase() === 'waitlisted';
      return {
        reference: res.reference_number || `REG-${String(res.id || '').slice(0, 8).toUpperCase()}`,
        status: res.status || 'confirmed',
        paymentStatus: isFree
          ? ('free' as const)
          : gatewayReady
          ? ('succeeded' as const)
          : ('pending' as const),
        title: isWaitlisted ? 'Added to Waitlist' : 'Registration Confirmed',
        subtitle: res.message || `You are registered for ${activeTournament.name}.`,
        noticeText: isWaitlisted
          ? 'This tournament is currently full. You have been added to the waitlist.'
          : isFree
          ? 'Your complimentary tournament entry has been confirmed.'
          : !gatewayReady
          ? 'Your registration is saved. Online payment will be collected once payment gateway setup is complete or at the club.'
          : undefined,
        rawResult: res,
      };
    } catch (err: unknown) {
      const rawMsg =
        (err as any)?.detail ||
        (err as any)?.response?.data?.detail ||
        (err as any)?.message ||
        (err instanceof Error ? err.message : 'Registration failed. Please try again.');
      const msg = typeof rawMsg === 'string' ? rawMsg : JSON.stringify(rawMsg);
      const lowerMsg = msg.toLowerCase();
      const isPartnerAlreadyRegistered =
        lowerMsg.includes('partner') && lowerMsg.includes('already registered');
      const isPlayerAlreadyRegistered =
        !isPartnerAlreadyRegistered && lowerMsg.includes('already registered');

      if (isPartnerAlreadyRegistered) {
        setSubmitError(msg);
        setErrors((prev) => ({
          ...prev,
          partnerFullName: msg,
          partnerEmail: msg,
        }));
        setCurrentStep(1);
        throw new Error(msg);
      }

      if (isPlayerAlreadyRegistered) {
        try {
          const refetchRes = await refetchMyRegistration();
          if (refetchRes?.data?.registration) {
            setOverrideRegistration(refetchRes.data.registration);
            setAlreadyRegisteredOverride(true);
            setCurrentStep(1);
            return {
              reference: refetchRes.data.registration.reference_number || 'REGISTERED',
              status: refetchRes.data.registration.status || 'confirmed',
              paymentStatus: isFree ? ('free' as const) : ('pending' as const),
              title: 'Already Registered',
            };
          }
        } catch {
          // Tolerate refetch failures
        }
      }

      setSubmitError(msg);
      throw new Error(msg);
    } finally {
      setIsProcessingPayment(false);
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
          {/* ─── Minimal Sticky Top Bar with Back [←] and Close [✕] ─── */}
          {!successResult && (
            <View style={styles.topNavBar}>
              <TouchableOpacity
                onPress={() => {
                  if (currentStep === 1) onClose();
                  else if (currentStep === 2) setCurrentStep(1);
                  else if (currentStep === 3) setCurrentStep(2);
                }}
                style={styles.navBarBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="Back"
                accessibilityRole="button"
              >
                <ArrowLeft size={22} color="#0F2E28" strokeWidth={2.4} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onClose}
                style={styles.navBarBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="Close registration"
                accessibilityRole="button"
              >
                <X size={20} color="#64748B" strokeWidth={2} />
              </TouchableOpacity>
            </View>
          )}

          {/* ─── Single Page Continuous Scroll Container ─── */}
          <ScrollView
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}
          >
            {/* Header Content: Title, Badges, 3-Step Progress, Subheading, Summary Card */}
            {!successResult && (
              <RegistrationHeader
                tournament={activeTournament}
                currentStep={currentStep}
                hideNavBar={true}
              />
            )}

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
            ) : (
              <Step2ReviewRegistration
                tournament={activeTournament}
                formState={formState}
                onBack={handleBackToStep1}
                onNext={handleNextFromStep2}
              />
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {currentStep === 3 && (
          <CheckoutModal
            visible={currentStep === 3}
            onClose={() => {
              if (confirmedRegResult && onSuccess) {
                onSuccess(confirmedRegResult);
              }
              onClose();
            }}
            showBackButton
            onBack={handleBackToStep2}
            clubId={(activeTournament as any).club_id || ''}
            clubName={(activeTournament as any).club_name || undefined}
            purpose="tournament"
            activityId={activeTournament.id}
            activityTitle={activeTournament.name}
            activitySubtitle={`${activeTournament.format_label || String(activeTournament.format).replace('_', ' ').toUpperCase()} · ${parsed?.category || 'Open Division'}`}
            startAt={activeTournament.start_date}
            endAt={activeTournament.end_date}
            requiresAgreement
            agreementLabel="I agree to the tournament rules and cancellation policy."
            summaryDetails={[
              {
                key: 'format',
                label: 'Format',
                value: activeTournament.format_label || String(activeTournament.format).replace('_', ' ').toUpperCase(),
                icon: 'trophy',
              },
              {
                key: 'division',
                label: 'Division',
                value: parsed?.category || 'Open',
                icon: 'award',
              },
              ...(activeTournament.start_date
                ? [
                    {
                      key: 'dates',
                      label: 'Event Dates',
                      value:
                        activeTournament.end_date && activeTournament.end_date !== activeTournament.start_date
                          ? `${formatDate(activeTournament.start_date)} – ${formatDate(activeTournament.end_date)}`
                          : formatDate(activeTournament.start_date),
                      icon: 'calendar' as const,
                    },
                  ]
                : []),
              ...((activeTournament as any).location_name
                ? [
                    {
                      key: 'venue',
                      label: 'Venue',
                      value: String((activeTournament as any).location_name),
                      icon: 'map' as const,
                    },
                  ]
                : []),
              {
                key: 'entry',
                label: isDoubles ? 'Team' : 'Player',
                value: isDoubles
                  ? formState.teamName.trim() ||
                    `${formState.fullName} & ${formState.selectedPartner?.full_name || formState.partnerFullName || 'Partner'}`
                  : formState.fullName,
                icon: 'users',
              },
            ] as CheckoutSummaryDetail[]}
            onConfirmSubmit={handleCheckoutConfirm}
            onSuccess={() => {
              // CheckoutModal stays open to display the confirmed screen; user taps Done to close
            }}
          />
        )}
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
  topNavBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#F8FAF9',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    zIndex: 10,
  },
  navBarBtn: {
    padding: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 48,
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
