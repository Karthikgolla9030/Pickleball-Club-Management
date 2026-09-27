/**
 * Aught2 Pickleball — Tournament Registration Types
 *
 * Full type definitions for the 3-step registration flow:
 * Step 1: Player / Team Details (dynamic fields by format & category)
 * Step 2: Review Registration
 * Step 3: Payment & Submit
 */

import type {
  EligiblePartnerItem,
  PlayerRegistrationResponse,
  Tournament,
  TournamentDiscoveryItem,
} from '@/types';

export type RegistrationStep = 1 | 2 | 3;

export interface RegistrationFormState {
  // Player 1 (You)
  fullName: string;
  email: string;
  phone: string;
  skillLevel: string;
  gender: 'Male' | 'Female' | 'Other';
  age: string;

  // Team (for doubles)
  teamName: string;

  // Player 2 (Partner - for doubles)
  partnerFullName: string;
  partnerEmail: string;
  partnerPhone: string;
  partnerSkillLevel: string;
  partnerGender: 'Male' | 'Female' | 'Other';
  partnerAge: string;
  selectedPartner: EligiblePartnerItem | null;
  partnerSearchQuery: string;

  // Step 1 Checkbox Declarations
  confirmEligibility: boolean;
  acknowledgeMembership: boolean;

  // Step 3 Payment Details
  paymentMethod: 'card' | 'upi' | 'club_account' | 'cash';
  cardholderName: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvv: string;
  upiId: string;
  agreeRulesAndCancellation: boolean;

  // Additional Notes
  notes: string;
}

export interface RegistrationErrors {
  fullName?: string;
  email?: string;
  phone?: string;
  skillLevel?: string;
  gender?: string;
  age?: string;

  teamName?: string;

  partnerFullName?: string;
  partnerEmail?: string;
  partnerPhone?: string;
  partnerSkillLevel?: string;
  partnerGender?: string;
  partnerAge?: string;
  partner?: string;

  confirmEligibility?: string;
  acknowledgeMembership?: string;

  payment?: string;
  cardholderName?: string;
  cardNumber?: string;
  cardExpiry?: string;
  cardCvv?: string;
  upiId?: string;
  agreeRulesAndCancellation?: string;

  general?: string;
}

export interface TournamentRegistrationModalProps {
  visible: boolean;
  onClose: () => void;
  tournament: TournamentDiscoveryItem | Tournament | null;
  onSuccess?: (res: PlayerRegistrationResponse) => void;
}
