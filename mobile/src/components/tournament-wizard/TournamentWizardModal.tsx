/**
 * Aught2 Pickleball — TournamentWizardModal
 *
 * Replaces single-modal tournament creation with a complete 5-step mobile wizard:
 *   Step 1: Basic Details
 *   Step 2: Category & Eligibility
 *   Step 3: Format & Scoring
 *   Step 4: Schedule & Registration
 *   Step 5: Review & Create
 *
 * Enforces strict validation per step before proceeding.
 * Submits only valid payloads directly mapped to backend TournamentCreate schema.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing } from '@/theme';
import type { CreateTournamentPayload, Tournament, TournamentFormat, TournamentVisibility } from '@/types';
import {
  formatAgeRestriction,
  getRegistrationType,
  getTeamSize,
} from '@/utils/tournamentCapacity';
import { WizardFooter } from './WizardFooter';
import { WizardHeader } from './WizardHeader';
import { WizardStepIndicator } from './WizardStepIndicator';
import { Step1BasicDetails } from './steps/Step1BasicDetails';
import { Step2FormatScoring } from './steps/Step2FormatScoring';
import { Step3CategoryEligibility } from './steps/Step3CategoryEligibility';
import { Step4ScheduleRegistration } from './steps/Step4ScheduleRegistration';
import { Step5ReviewCreate } from './steps/Step5ReviewCreate';
import {
  CATEGORY_OPTIONS,
  SCRAMBLE_DIVISION_OPTIONS,
  type TournamentWizardState,
  type WizardStep,
} from './types';

interface TournamentWizardModalProps {
  visible: boolean;
  onClose: () => void;
  clubId: string | null;
  clubName?: string;
  onSuccess: (created: Tournament) => void;
  createTournament: (payload: CreateTournamentPayload) => Promise<Tournament>;
  openTournamentRegistration?: (tournamentId: string) => Promise<Tournament>;
  isCreating?: boolean;
}

function formatDateToISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildInitialState(): TournamentWizardState {
  const today = new Date();
  const regClose = new Date(today.getTime() + 7 * 86400000);
  const start = new Date(today.getTime() + 10 * 86400000);
  const end = new Date(today.getTime() + 11 * 86400000);

  return {
    // Step 1
    name: '',
    description: '',
    locationName: 'Main Courts',

    // Step 2 / Step 3 (Category & Eligibility)
    category: 'Singles',
    skillLevelMode: 'single',
    skillLevel: '3.5',
    minSkillLevel: '3.5',
    maxSkillLevel: '4.5',
    minAge: '',
    maxAge: '',
    genderCategory: 'Any',
    minParticipants: '4',
    maxParticipants: '8',
    visibility: 'public' as TournamentVisibility,

    // Step 3
    format: 'round_robin' as TournamentFormat,
    rrTeams: '8',
    rrCourts: '3',
    poolCount: '2',
    teamsPerPool: '4',
    qualifiersPerPool: '2',
    poolCourts: '4',
    poolBracketType: 'Single Elimination',
    scramblePlayers: '16',
    scrambleCourts: '4',
    scrambleRounds: '5',
    scrambleRotationRule: 'Full Rotation (no repeating partners)',
    scrambleLeaderboardMetric: 'Win Percentage (Wins / Played) • Avg Point Diff',
    bracketType: 'Single Elimination',
    bracketTeams: '8',
    bracketCourts: '3',
    bracketSeedingMethod: 'Team Average Rating (Highest = Seed #1)',
    bracketByeRule: 'Automatic BYEs awarded to top seeds',

    // Step 4
    startDate: formatDateToISO(start),
    endDate: formatDateToISO(end),
    startTime: '08:00',
    endTime: '18:00',
    checkInTime: '07:30',
    entryFee: '65',
    regOpenDate: formatDateToISO(today),
    regCloseDate: formatDateToISO(regClose),
    regMethod: 'Both (Player App + Staff)',
    publishImmediately: true,
  };
}

export function TournamentWizardModal({
  visible,
  onClose,
  clubName,
  onSuccess,
  createTournament,
  openTournamentRegistration,
  isCreating = false,
}: TournamentWizardModalProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [formState, setFormState] = useState<TournamentWizardState>(buildInitialState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const scrollViewRef = useRef<ScrollView>(null);

  // Reset form whenever opening
  useEffect(() => {
    if (visible) {
      setCurrentStep(1);
      setFormState(buildInitialState());
      setErrors({});
      setSubmitError(null);
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [visible]);

  // Scroll form back to top intentionally on every step change
  useEffect(() => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, [currentStep]);

  const updateState = useCallback((patch: Partial<TournamentWizardState>) => {
    setFormState((prev) => ({ ...prev, ...patch }));
    // Clear errors for touched fields
    setErrors((prevErrors) => {
      const keys = Object.keys(patch);
      let hasErrorToClear = false;
      for (const k of keys) {
        if (prevErrors[k]) {
          hasErrorToClear = true;
          break;
        }
      }
      if (!hasErrorToClear) return prevErrors;

      const remaining = { ...prevErrors };
      for (const k of keys) {
        delete remaining[k];
      }
      return remaining;
    });
  }, []);

  // ─── Step Validation ──────────────────────────────────────────────

  const validateStep = (step: WizardStep): boolean => {
    const errs: Record<string, string> = {};

    if (step === 1) {
      if (!formState.name.trim()) {
        errs.name = 'Tournament name is required.';
      }
    } else if (step === 2) {
      // Step 2: Format & Scoring
      if (formState.format === 'round_robin') {
        if (formState.rrCourts) {
          const courts = parseInt(formState.rrCourts, 10);
          if (isNaN(courts) || courts < 1) {
            errs.rrCourts = 'Available courts must be at least 1.';
          }
        }
      } else if (formState.format === 'pool_play') {
        const pools = parseInt(formState.poolCount, 10);
        const tpp = parseInt(formState.teamsPerPool, 10);
        const qual = parseInt(formState.qualifiersPerPool, 10);
        if (isNaN(pools) || pools < 2) {
          errs.poolCount = 'Pool play requires at least 2 pools.';
        }
        if (isNaN(tpp) || tpp < 2) {
          errs.teamsPerPool = 'Each pool must have at least 2 teams.';
        }
        if (isNaN(qual) || qual < 1 || qual > tpp) {
          errs.qualifiersPerPool = 'Qualifiers per pool must be between 1 and teams per pool.';
        }
        if (formState.poolCourts) {
          const courts = parseInt(formState.poolCourts, 10);
          if (isNaN(courts) || courts < 1) {
            errs.poolCourts = 'Available courts must be at least 1.';
          }
        }
      } else if (formState.format === 'scramble') {
        if (formState.scrambleCourts) {
          const courts = parseInt(formState.scrambleCourts, 10);
          if (isNaN(courts) || courts < 1) {
            errs.scrambleCourts = 'Active courts must be at least 1.';
          }
        }
      } else if (formState.format === 'bracket') {
        if (formState.bracketCourts) {
          const courts = parseInt(formState.bracketCourts, 10);
          if (isNaN(courts) || courts < 1) {
            errs.bracketCourts = 'Available courts must be at least 1.';
          }
        }
      }
    } else if (step === 3) {
      // Step 3: Category & Eligibility (Format-Dependent Capacity)
      const minP = parseInt(formState.minParticipants, 10);
      const maxP = parseInt(formState.maxParticipants, 10);

      if (formState.format === 'scramble') {
        if (!SCRAMBLE_DIVISION_OPTIONS.includes(formState.category as any)) {
          errs.category = 'Please select a valid Scramble division.';
        }
        if (isNaN(minP) || minP < 4) {
          errs.minParticipants = 'Scramble requires at least 4 individual players.';
        }
        if (isNaN(maxP) || maxP < minP) {
          errs.maxParticipants = 'Maximum players must be greater than or equal to minimum players.';
        }
      } else {
        if (!CATEGORY_OPTIONS.includes(formState.category as any)) {
          errs.category = 'Please select a valid competition category.';
        }
        if (isNaN(minP) || minP < 2) {
          errs.minParticipants = 'Min participants must be at least 2.';
        }
        if (isNaN(maxP) || maxP < minP) {
          errs.maxParticipants = 'Max capacity must be greater than or equal to min capacity.';
        }
      }

      // Skill Level Eligibility validation
      if (formState.skillLevelMode === 'range') {
        const minLvl = formState.minSkillLevel;
        const maxLvl = formState.maxSkillLevel;
        if (!minLvl) {
          errs.minSkillLevel = 'Minimum skill level is required.';
        }
        if (!maxLvl) {
          errs.maxSkillLevel = 'Maximum skill level is required.';
        }
        if (minLvl && maxLvl && parseFloat(minLvl) > parseFloat(maxLvl)) {
          errs.maxSkillLevel = 'Maximum skill level must be greater than or equal to minimum.';
        }
      } else {
        if (!formState.skillLevel) {
          errs.skillLevel = 'Skill level is required.';
        }
      }

      // Age validation
      if (formState.minAge) {
        const minA = parseInt(formState.minAge, 10);
        if (isNaN(minA) || minA < 0) {
          errs.minAge = 'Minimum age cannot be negative.';
        }
      }
      if (formState.maxAge) {
        const maxA = parseInt(formState.maxAge, 10);
        if (isNaN(maxA) || maxA < 0) {
          errs.maxAge = 'Maximum age cannot be negative.';
        }
      }
      if (formState.minAge && formState.maxAge) {
        const minA = parseInt(formState.minAge, 10);
        const maxA = parseInt(formState.maxAge, 10);
        if (!isNaN(minA) && !isNaN(maxA) && maxA < minA) {
          errs.maxAge = 'Maximum age cannot be less than minimum age.';
        }
      }
    } else if (step === 4) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(formState.startDate.trim())) {
        errs.startDate = 'Valid start date required (YYYY-MM-DD).';
      }
      if (!dateRegex.test(formState.endDate.trim())) {
        errs.endDate = 'Valid end date required (YYYY-MM-DD).';
      }
      if (!dateRegex.test(formState.regOpenDate.trim())) {
        errs.regOpenDate = 'Valid registration open date required (YYYY-MM-DD).';
      }
      if (!dateRegex.test(formState.regCloseDate.trim())) {
        errs.regCloseDate = 'Valid registration close date required (YYYY-MM-DD).';
      }

      if (Object.keys(errs).length === 0) {
        const regOpen = new Date(`${formState.regOpenDate}T00:00:00Z`);
        const regClose = new Date(`${formState.regCloseDate}T23:59:59Z`);
        const start = new Date(`${formState.startDate}T${formState.startTime || '08:00'}:00Z`);
        const end = new Date(`${formState.endDate}T${formState.endTime || '18:00'}:00Z`);

        if (regOpen > regClose) {
          errs.regOpenDate = 'Registration open must be on or before registration deadline.';
        }
        if (regClose > start) {
          errs.regCloseDate = 'Registration must close on or before tournament start.';
        }
        if (start > end) {
          errs.startDate = 'Tournament start date must be on or before end date.';
        }
      }

      if (formState.entryFee && isNaN(parseFloat(formState.entryFee))) {
        errs.entryFee = 'Entry fee must be a valid number.';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ─── Navigation ───────────────────────────────────────────────────

  const handleNext = async () => {
    if (!validateStep(currentStep)) return;

    if (currentStep < 5) {
      setCurrentStep((prev) => (prev + 1) as WizardStep);
    } else {
      await handleFinalSubmit();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as WizardStep);
    }
  };

  const handleStepPress = (targetStep: WizardStep) => {
    if (targetStep < currentStep) {
      setCurrentStep(targetStep);
    }
  };

  // ─── Final Payload Creation & Submit ──────────────────────────────

  const handleFinalSubmit = async () => {
    setSubmitError(null);

    // Validate all prior steps
    for (let s = 1; s <= 4; s++) {
      if (!validateStep(s as WizardStep)) {
        setCurrentStep(s as WizardStep);
        return;
      }
    }

    try {
      const minP = parseInt(formState.minParticipants, 10) || 4;
      const maxP = parseInt(formState.maxParticipants, 10) || 16;

      const startTimeStr = formState.startTime.trim() || '08:00';
      const endTimeStr = formState.endTime.trim() || '18:00';

      const startIso = new Date(`${formState.startDate}T${startTimeStr}:00Z`).toISOString();
      const endIso = new Date(`${formState.endDate}T${endTimeStr}:00Z`).toISOString();
      const regOpenIso = new Date(`${formState.regOpenDate}T00:00:00Z`).toISOString();
      const regCloseIso = new Date(`${formState.regCloseDate}T23:59:59Z`).toISOString();

      const isRange = formState.skillLevelMode === 'range';
      const skillLevelMode = isRange ? 'range' : 'single';
      const minSkillLevel = isRange ? (formState.minSkillLevel || '3.5') : (formState.skillLevel || '3.5');
      const maxSkillLevel = isRange ? (formState.maxSkillLevel || '4.5') : (formState.skillLevel || '3.5');
      const skillLevelDisplay = isRange ? `${minSkillLevel}–${maxSkillLevel}` : (formState.skillLevel || '3.5');
      const skillLevelValue = isRange ? `${minSkillLevel}-${maxSkillLevel}` : (formState.skillLevel || '3.5');

      // Format clean metadata note for category, skill level, fee
      const metadataParts: string[] = [];
      if (formState.category) metadataParts.push(formState.category);
      metadataParts.push(isRange ? `Skill: ${skillLevelDisplay}` : `Level ${formState.skillLevel}`);
      if (formState.genderCategory) metadataParts.push(formState.genderCategory);
      const ageStr = formatAgeRestriction(formState.minAge, formState.maxAge);
      if (ageStr !== 'None') metadataParts.push(`Age: ${ageStr}`);
      if (formState.entryFee && parseFloat(formState.entryFee) > 0) {
        metadataParts.push(`Fee: $${formState.entryFee}/player`);
      }

      const metaPrefix = metadataParts.length > 0 ? `[${metadataParts.join(' • ')}]` : '';
      const finalDescription = formState.description.trim()
        ? metaPrefix ? `${metaPrefix}\n\n${formState.description.trim()}` : formState.description.trim()
        : metaPrefix || null;

      const regType = getRegistrationType(formState.format, formState.category);
      const teamSize = getTeamSize(formState.category, formState.format);
      const minAgeNum = formState.minAge ? parseInt(formState.minAge, 10) : null;
      const maxAgeNum = formState.maxAge ? parseInt(formState.maxAge, 10) : null;

      const formatConfig: Record<string, unknown> = {
        category: formState.category,
        skill_level_mode: skillLevelMode,
        min_skill_level: minSkillLevel,
        max_skill_level: maxSkillLevel,
        skill_level: skillLevelValue,
        gender_eligibility: formState.genderCategory,
        min_age: minAgeNum,
        max_age: maxAgeNum,
        team_size: teamSize,
        registration_type: regType,
      };

      if (formState.format === 'scramble') {
        const plannedRounds = parseInt(formState.scrambleRounds, 10) || 5;
        formatConfig.courts_count = parseInt(formState.scrambleCourts, 10) || 4;
        formatConfig.planned_rounds = plannedRounds;
        formatConfig.rounds = plannedRounds;
        formatConfig.rotation_rule = formState.scrambleRotationRule;
        formatConfig.leaderboard_metric = formState.scrambleLeaderboardMetric;
      } else if (formState.format === 'round_robin') {
        formatConfig.courts_count = parseInt(formState.rrCourts, 10) || 3;
      } else if (formState.format === 'pool_play') {
        formatConfig.pool_count = parseInt(formState.poolCount, 10) || 2;
        formatConfig.teams_per_pool = parseInt(formState.teamsPerPool, 10) || 4;
        formatConfig.qualifiers_per_pool = parseInt(formState.qualifiersPerPool, 10) || 2;
        formatConfig.courts_count = parseInt(formState.poolCourts, 10) || 4;
      } else if (formState.format === 'bracket') {
        formatConfig.bracket_type = formState.bracketType;
        formatConfig.courts_count = parseInt(formState.bracketCourts, 10) || 3;
        formatConfig.seeding_method = formState.bracketSeedingMethod;
        formatConfig.bye_rule = formState.bracketByeRule;
      }

      const payload: CreateTournamentPayload = {
        name: formState.name.trim(),
        description: finalDescription,
        format: formState.format,
        visibility: formState.visibility,
        start_date: startIso,
        end_date: endIso,
        registration_open_at: regOpenIso,
        registration_close_at: regCloseIso,
        location_name: formState.locationName.trim() || null,
        min_participants: minP,
        max_participants: maxP,
        format_configuration: formatConfig,
        scoring_rules: {
          game_format: 'single_game',
          target_score: 11,
          win_by: 2,
        },
        tiebreaker_rules: [
          'wins',
          'points_differential',
          'total_points_scored',
          'team_name_deterministic',
        ],
      };

      const created = await createTournament(payload);
      let finalTournament = created;
      if (formState.publishImmediately && openTournamentRegistration) {
        try {
          const published = await openTournamentRegistration(created.id);
          if (published) {
            finalTournament = published;
          }
        } catch (publishErr) {
          console.warn('Auto-publish failed:', publishErr);
        }
      }
      onSuccess(finalTournament);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create tournament. Please verify your inputs.';
      setSubmitError(msg);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          {/* Wizard Header */}
          <WizardHeader currentStep={currentStep} onClose={onClose} />

          {/* Step Progress Indicator */}
          <WizardStepIndicator
            currentStep={currentStep}
            totalSteps={5}
            onStepPress={handleStepPress}
          />

          {/* Scrollable Wizard Body with ref and independent scroll */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {currentStep === 1 && (
              <Step1BasicDetails
                state={formState}
                onChange={updateState}
                clubName={clubName}
                errors={errors}
              />
            )}

            {currentStep === 2 && (
              <Step2FormatScoring
                state={formState}
                onChange={updateState}
                errors={errors}
              />
            )}

            {currentStep === 3 && (
              <Step3CategoryEligibility
                state={formState}
                onChange={updateState}
                errors={errors}
              />
            )}

            {currentStep === 4 && (
              <Step4ScheduleRegistration
                state={formState}
                onChange={updateState}
                errors={errors}
              />
            )}

            {currentStep === 5 && (
              <Step5ReviewCreate
                state={formState}
                onChange={updateState}
                clubName={clubName}
                error={submitError}
              />
            )}
          </ScrollView>

          {/* Sticky Wizard Footer */}
          <WizardFooter
            currentStep={currentStep}
            onBack={handleBack}
            onNext={handleNext}
            isSubmitting={isCreating}
            canGoBack={currentStep > 1}
            nextLabel={
              currentStep === 5
                ? formState.publishImmediately
                  ? 'Publish & Open Registration'
                  : 'Save as Draft'
                : undefined
            }
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  keyboardView: {
    flex: 1,
  },
  bodyScroll: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[3],
    paddingBottom: Spacing[8],
  },
});
