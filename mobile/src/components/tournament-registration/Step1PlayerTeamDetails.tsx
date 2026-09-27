/**
 * Aught2 Pickleball — Step 1: Player / Team Details
 *
 * Exact recreation of Screen 1 from reference designs:
 * - Dynamic info callout explaining format & division rules
 * - Team name (optional) for doubles
 * - Player 1 (You) card with 2-column grid:
 *     Full name *, Email *, Phone number *, Skill rating *, Age *
 * - Player 2 (Partner) card for doubles:
 *     Full name *, Email *, Phone number *, Skill rating *, Age *
 *     With optional club member lookup & selection
 * - Eligibility confirmation checkboxes:
 *     1. Confirm eligibility requirements
 *     2. Acknowledge club membership requirement
 * - Primary CTA: "Continue to review →"
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertCircle,
  ArrowRight,
  Award,
  Check,
  ChevronDown,
  Info,
  Search,
  ShieldCheck,
  Trophy,
  User,
  Users,
  X,
} from 'lucide-react-native';

import { AppText } from '../AppText';
import { useEligiblePartners } from '@/hooks';
import type {
  EligiblePartnerItem,
  Tournament,
  TournamentDiscoveryItem,
  TournamentFormat,
} from '@/types';
import { parseTournamentConfig, SKILL_LEVEL_OPTIONS } from '@/utils/tournamentCapacity';
import type { RegistrationErrors, RegistrationFormState } from './types';

interface Step1Props {
  tournament: TournamentDiscoveryItem | Tournament;
  formState: RegistrationFormState;
  errors: RegistrationErrors;
  onChange: (patch: Partial<RegistrationFormState>) => void;
  onNext: () => void;
}

export function Step1PlayerTeamDetails({
  tournament,
  formState,
  errors,
  onChange,
  onNext,
}: Step1Props) {
  const parsed = parseTournamentConfig(tournament);
  const isScramble = tournament.format === 'scramble';
  const isDoubles = !parsed.isSingles && !isScramble;
  const category = parsed.category || (isScramble ? 'Open Scramble' : 'Singles');

  // Skill Rating Dropdown state (Player 1 & Player 2)
  const [activeSkillTarget, setActiveSkillTarget] = useState<'player1' | 'player2' | null>(null);

  // Partner member search modal state
  const [showPartnerSearchModal, setShowPartnerSearchModal] = useState(false);
  const [partnerQuery, setPartnerQuery] = useState('');

  const { partners = [], isLoading: isLoadingPartners } = useEligiblePartners(
    tournament.id,
    partnerQuery
  );

  // Filter partners
  const filteredPartners = partners.filter((p) => {
    if (!partnerQuery.trim()) return true;
    const q = partnerQuery.toLowerCase();
    return (
      p.full_name.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      (p.membership_number && p.membership_number.toLowerCase().includes(q))
    );
  });

  // Callout description
  const getCalloutText = () => {
    if (isScramble) {
      if (category === "Men's Scramble") {
        return "Men's Scramble: Individual registration for verified male players. Teammates rotate every match and the scheduler mixes players across courts while minimizing repeat partners and varying opponents.";
      }
      if (category === "Women's Scramble") {
        return "Women's Scramble: Individual registration for verified female players. Teammates rotate every match and the scheduler mixes players across courts while minimizing repeat partners and varying opponents.";
      }
      if (category === "Mixed Scramble") {
        return "Mixed Scramble: Individual registration for male and female players. The scheduler forms 100% mixed-gender teams (1 male, 1 female) on strictly 4-player balanced courts, rotating partners across games.";
      }
      return "Individual Scramble: players register individually and rotate partners across games. The scheduler mixes players across courts and aims to minimize repeat partners while varying opponents.";
    }
    if (category === "Men's Doubles") {
      return "This is a Men's Doubles tournament. You must register with a fixed partner. Fields adapt to the division and registration rules set by the club.";
    }
    if (category === "Women's Doubles") {
      return "This is a Women's Doubles tournament. You must register with an eligible female partner. Fields adapt to the division and registration rules set by the club.";
    }
    if (category === 'Mixed Doubles') {
      return 'This is a Mixed Doubles tournament. You must register with one male and one female player. Fields adapt to the division and registration rules set by the club.';
    }
    if (parsed.isSingles) {
      return 'This is a Singles tournament. You will compete individually in all tournament rounds. Fields adapt to the division and registration rules set by the club.';
    }
    return `This is a ${category} tournament. Fields adapt to the division and registration rules set by the club.`;
  };

  const handleSelectPartner = (p: EligiblePartnerItem) => {
    onChange({
      selectedPartner: p,
      partnerFullName: p.full_name,
      partnerEmail: p.email,
      partnerGender: (p.gender === 'Female' ? 'Female' : 'Male') as any,
      partnerSkillLevel: p.skill_rating != null ? String(p.skill_rating) : '3.5',
    });
    setShowPartnerSearchModal(false);
  };

  const handleClearPartner = () => {
    onChange({
      selectedPartner: null,
      partnerFullName: '',
      partnerEmail: '',
      partnerPhone: '',
    });
  };

  return (
    <View style={styles.container}>
      {/* ─── 1. Tournament Specifications & Rules Card ─── */}
      <View style={styles.rulesCard}>
        <View style={styles.rulesCardHeader}>
          <View style={styles.rulesHeaderLeft}>
            <View style={styles.rulesHeaderIcon}>
              <Trophy size={16} color="#064E3B" strokeWidth={2.4} />
            </View>
            <View>
              <AppText style={styles.rulesCardTitle}>Tournament Rules & Details</AppText>
              <AppText style={styles.rulesCardSubtitle}>
                {tournament.format_label || 'Tournament'} • {category}
              </AppText>
            </View>
          </View>
          <View style={styles.rulesBadge}>
            <AppText style={styles.rulesBadgeText}>RULES</AppText>
          </View>
        </View>

        {/* 4-Item Specification Grid */}
        <View style={styles.specGrid}>
          {/* Item 1: Skill Requirement */}
          <View style={styles.specBox}>
            <View style={styles.specBoxHeader}>
              <Award size={13} color="#064E3B" strokeWidth={2.2} />
              <AppText style={styles.specBoxLabel}>
                {parsed.skillLevelMode === 'range' ? 'Eligible Range' : 'Skill Rating'}
              </AppText>
            </View>
            <AppText style={styles.specBoxPrimary}>{parsed.skillLevelDisplay}</AppText>
            <AppText style={styles.specBoxSecondary}>
              {parsed.skillLevelMode === 'range' ? 'Inclusive range' : 'Division requirement'}
            </AppText>
          </View>

          {/* Item 2: Scoring Rules */}
          <View style={styles.specBox}>
            <View style={styles.specBoxHeader}>
              <ShieldCheck size={13} color="#064E3B" strokeWidth={2.2} />
              <AppText style={styles.specBoxLabel}>Match Rules</AppText>
            </View>
            <AppText style={styles.specBoxPrimary}>To {parsed.targetScore} Pts</AppText>
            <AppText style={styles.specBoxSecondary}>Win by {parsed.winBy}</AppText>
          </View>

          {/* Item 3: Eligibility */}
          <View style={styles.specBox}>
            <View style={styles.specBoxHeader}>
              <Users size={13} color="#064E3B" strokeWidth={2.2} />
              <AppText style={styles.specBoxLabel}>Eligibility</AppText>
            </View>
            <AppText style={styles.specBoxPrimary}>{parsed.genderEligibility}</AppText>
            <AppText style={styles.specBoxSecondary}>{parsed.ageRestrictionText}</AppText>
          </View>

          {/* Item 4: Entry Structure */}
          <View style={styles.specBox}>
            <View style={styles.specBoxHeader}>
              <Info size={13} color="#064E3B" strokeWidth={2.2} />
              <AppText style={styles.specBoxLabel}>Registration</AppText>
            </View>
            <AppText style={styles.specBoxPrimary}>
              {isScramble ? 'Individual' : parsed.isSingles ? 'Singles' : 'Team Doubles'}
            </AppText>
            <AppText style={styles.specBoxSecondary}>
              {isScramble ? 'Rotating partner' : parsed.isSingles ? 'Individual' : 'Fixed partner'}
            </AppText>
          </View>
        </View>

        {/* Dynamic rule callout */}
        <View style={styles.rulesCalloutRow}>
          <Info size={14} color="#B45309" strokeWidth={2.2} style={{ marginTop: 1 }} />
          <AppText style={styles.rulesCalloutText}>{getCalloutText()}</AppText>
        </View>

        {/* Description note if available */}
        {tournament.description ? (
          <View style={styles.aboutDescBox}>
            <AppText style={styles.aboutDescTitle}>Tournament Description</AppText>
            <AppText style={styles.aboutDescText}>{tournament.description}</AppText>
          </View>
        ) : null}
      </View>

      {/* ─── 2. Team Name (Optional, for Doubles) ─── */}
      {isDoubles && (
        <View style={styles.teamNameSection}>
          <AppText style={styles.inputLabel}>Team name (optional)</AppText>
          <TextInput
            style={[styles.textInput, errors.teamName && styles.inputError]}
            placeholder="Enter team name"
            placeholderTextColor="#94A3B8"
            value={formState.teamName}
            onChangeText={(text) => onChange({ teamName: text })}
          />
          {errors.teamName && <AppText style={styles.errorText}>{errors.teamName}</AppText>}
        </View>
      )}

      {/* ─── 3. Player 1 (You) Card ─── */}
      <View style={styles.playerCard}>
        <View style={styles.playerCardHeader}>
          <User size={16} color="#064E3B" strokeWidth={2.4} />
          <AppText style={styles.playerCardTitle}>
            {isDoubles ? 'Player 1 (You)' : 'Player (You)'}
          </AppText>
        </View>

        <View style={styles.playerCardBody}>
          {/* Row 1: Full name * & Email * */}
          <View style={styles.formRow}>
            <View style={styles.formCol}>
              <AppText style={styles.fieldLabel}>
                Full name <AppText style={styles.star}>*</AppText>
              </AppText>
              <TextInput
                style={[styles.textInput, errors.fullName && styles.inputError]}
                placeholder="Full name"
                placeholderTextColor="#94A3B8"
                value={formState.fullName}
                onChangeText={(text) => onChange({ fullName: text })}
              />
              {errors.fullName && <AppText style={styles.errorText}>{errors.fullName}</AppText>}
            </View>

            <View style={styles.formCol}>
              <AppText style={styles.fieldLabel}>
                Email <AppText style={styles.star}>*</AppText>
              </AppText>
              <TextInput
                style={[styles.textInput, errors.email && styles.inputError]}
                placeholder="email@example.com"
                placeholderTextColor="#94A3B8"
                keyboardType="email-address"
                autoCapitalize="none"
                value={formState.email}
                onChangeText={(text) => onChange({ email: text })}
              />
              {errors.email && <AppText style={styles.errorText}>{errors.email}</AppText>}
            </View>
          </View>

          {/* Row 2: Phone number *, Skill rating *, Age * */}
          <View style={styles.formRow}>
            <View style={[styles.formCol, { flex: 1.2 }]}>
              <AppText style={styles.fieldLabel}>
                Phone number <AppText style={styles.star}>*</AppText>
              </AppText>
              <TextInput
                style={[styles.textInput, errors.phone && styles.inputError]}
                placeholder="+1 (555) 123-4567"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                value={formState.phone}
                onChangeText={(text) => onChange({ phone: text })}
              />
              {errors.phone && <AppText style={styles.errorText}>{errors.phone}</AppText>}
            </View>

            <View style={[styles.formCol, { flex: 0.9 }]}>
              <AppText style={styles.fieldLabel}>
                Skill rating <AppText style={styles.star}>*</AppText>
              </AppText>
              <TouchableOpacity
                style={styles.dropdownBtn}
                onPress={() => setActiveSkillTarget('player1')}
                activeOpacity={0.8}
              >
                <AppText style={styles.dropdownBtnText}>{formState.skillLevel || parsed.skillLevel}</AppText>
                <ChevronDown size={14} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={[styles.formCol, { flex: 0.7 }]}>
              <AppText style={styles.fieldLabel}>
                Age <AppText style={styles.star}>*</AppText>
              </AppText>
              <TextInput
                style={[styles.textInput, errors.age && styles.inputError]}
                placeholder="Age"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                maxLength={3}
                value={formState.age}
                onChangeText={(text) => onChange({ age: text })}
              />
              {errors.age && <AppText style={styles.errorText}>{errors.age}</AppText>}
            </View>
          </View>

          {/* Gender Selector (if relevant or restricted) */}
          {(parsed.genderEligibility !== 'Any' || category.includes("Men's") || category.includes("Women's")) && (
            <View style={styles.genderRow}>
              <AppText style={styles.fieldLabel}>
                Gender <AppText style={styles.star}>*</AppText>
              </AppText>
              <View style={styles.genderPillsRow}>
                {(['Male', 'Female', 'Other'] as const).map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.genderPill, formState.gender === g && styles.genderPillActive]}
                    onPress={() => onChange({ gender: g })}
                  >
                    <AppText style={[styles.genderPillText, formState.gender === g && styles.genderPillTextActive]}>
                      {g}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
              {errors.gender && <AppText style={styles.errorText}>{errors.gender}</AppText>}
            </View>
          )}
        </View>
      </View>

      {/* ─── 4. Player 2 (Partner) Card (Doubles Only) ─── */}
      {isDoubles && (
        <View style={styles.playerCard}>
          <View style={[styles.playerCardHeader, styles.partnerHeaderRow]}>
            <View style={styles.partnerHeaderLeft}>
              <Users size={16} color="#064E3B" strokeWidth={2.4} />
              <AppText style={styles.playerCardTitle}>Player 2 (Partner)</AppText>
            </View>

            {/* Quick Find Club Member Action */}
            <TouchableOpacity
              style={styles.findMemberBtn}
              onPress={() => setShowPartnerSearchModal(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Search size={12} color="#064E3B" />
              <AppText style={styles.findMemberBtnText}>Find Club Member</AppText>
            </TouchableOpacity>
          </View>

          <View style={styles.playerCardBody}>
            {formState.selectedPartner ? (
              <View style={styles.selectedPartnerCard}>
                <View style={styles.selectedPartnerInfo}>
                  <AppText style={styles.selectedPartnerName}>
                    {formState.selectedPartner.full_name}
                  </AppText>
                  <AppText style={styles.selectedPartnerEmail}>
                    {formState.selectedPartner.email}
                  </AppText>
                </View>
                <TouchableOpacity onPress={handleClearPartner} style={styles.clearPartnerBtn}>
                  <X size={16} color="#64748B" />
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Row 1: Full name * & Email * */}
            <View style={styles.formRow}>
              <View style={styles.formCol}>
                <AppText style={styles.fieldLabel}>
                  Full name <AppText style={styles.star}>*</AppText>
                </AppText>
                <TextInput
                  style={[styles.textInput, errors.partnerFullName && styles.inputError]}
                  placeholder="Enter partner's full name"
                  placeholderTextColor="#94A3B8"
                  value={formState.partnerFullName}
                  onChangeText={(text) => onChange({ partnerFullName: text })}
                />
                {errors.partnerFullName && <AppText style={styles.errorText}>{errors.partnerFullName}</AppText>}
              </View>

              <View style={styles.formCol}>
                <AppText style={styles.fieldLabel}>
                  Email <AppText style={styles.star}>*</AppText>
                </AppText>
                <TextInput
                  style={[styles.textInput, errors.partnerEmail && styles.inputError]}
                  placeholder="Enter partner's email"
                  placeholderTextColor="#94A3B8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={formState.partnerEmail}
                  onChangeText={(text) => onChange({ partnerEmail: text })}
                />
                {errors.partnerEmail && <AppText style={styles.errorText}>{errors.partnerEmail}</AppText>}
              </View>
            </View>

            {/* Row 2: Phone number, Skill rating *, Age * */}
            <View style={styles.formRow}>
              <View style={[styles.formCol, { flex: 1.2 }]}>
                <AppText style={styles.fieldLabel}>Phone number</AppText>
                <TextInput
                  style={[styles.textInput, errors.partnerPhone && styles.inputError]}
                  placeholder="Enter phone number"
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                  value={formState.partnerPhone}
                  onChangeText={(text) => onChange({ partnerPhone: text })}
                />
                {errors.partnerPhone && <AppText style={styles.errorText}>{errors.partnerPhone}</AppText>}
              </View>

              <View style={[styles.formCol, { flex: 0.9 }]}>
                <AppText style={styles.fieldLabel}>
                  Skill rating <AppText style={styles.star}>*</AppText>
                </AppText>
                <TouchableOpacity
                  style={styles.dropdownBtn}
                  onPress={() => setActiveSkillTarget('player2')}
                  activeOpacity={0.8}
                >
                  <AppText style={styles.dropdownBtnText}>{formState.partnerSkillLevel || parsed.skillLevel}</AppText>
                  <ChevronDown size={14} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={[styles.formCol, { flex: 0.7 }]}>
                <AppText style={styles.fieldLabel}>Age</AppText>
                <TextInput
                  style={[styles.textInput, errors.partnerAge && styles.inputError]}
                  placeholder="Enter age"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  maxLength={3}
                  value={formState.partnerAge}
                  onChangeText={(text) => onChange({ partnerAge: text })}
                />
                {errors.partnerAge && <AppText style={styles.errorText}>{errors.partnerAge}</AppText>}
              </View>
            </View>

            {/* Partner Gender (if relevant for Mixed or Gender-specific doubles) */}
            {(category.includes('Doubles') || parsed.genderEligibility !== 'Any') && (
              <View style={styles.genderRow}>
                <AppText style={styles.fieldLabel}>
                  Partner Gender <AppText style={styles.star}>*</AppText>
                </AppText>
                <View style={styles.genderPillsRow}>
                  {(['Male', 'Female'] as const).map((g) => (
                    <TouchableOpacity
                      key={g}
                      style={[styles.genderPill, formState.partnerGender === g && styles.genderPillActive]}
                      onPress={() => onChange({ partnerGender: g })}
                    >
                      <AppText style={[styles.genderPillText, formState.partnerGender === g && styles.genderPillTextActive]}>
                        {g}
                      </AppText>
                    </TouchableOpacity>
                  ))}
                </View>
                {errors.partnerGender && <AppText style={styles.errorText}>{errors.partnerGender}</AppText>}
              </View>
            )}

            {errors.partner && <AppText style={styles.errorText}>{errors.partner}</AppText>}
          </View>
        </View>
      )}

      {/* ─── 5. Declarations & Consent Checkboxes ─── */}
      <View style={styles.checkboxSection}>
        {/* Checkbox 1: Eligibility confirmation */}
        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => onChange({ confirmEligibility: !formState.confirmEligibility })}
          activeOpacity={0.8}
        >
          <View style={[styles.checkboxBox, formState.confirmEligibility && styles.checkboxBoxActive]}>
            {formState.confirmEligibility && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
          </View>
          <AppText style={styles.checkboxLabel}>
            {isDoubles
              ? 'I confirm that both players meet the tournament eligibility requirements (e.g. skill level, age, and club membership).'
              : 'I confirm that I meet the tournament eligibility requirements (e.g. skill level, age, and club membership).'}
          </AppText>
        </TouchableOpacity>
        {errors.confirmEligibility && (
          <AppText style={[styles.errorText, { marginLeft: 28 }]}>{errors.confirmEligibility}</AppText>
        )}

        {/* Checkbox 2: Membership requirement */}
        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => onChange({ acknowledgeMembership: !formState.acknowledgeMembership })}
          activeOpacity={0.8}
        >
          <View style={[styles.checkboxBox, formState.acknowledgeMembership && styles.checkboxBoxActive]}>
            {formState.acknowledgeMembership && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
          </View>
          <AppText style={styles.checkboxLabel}>
            {isDoubles
              ? 'I acknowledge that an active club membership is required for both players.'
              : 'I acknowledge that an active club membership is required for this tournament.'}
          </AppText>
        </TouchableOpacity>
        {errors.acknowledgeMembership && (
          <AppText style={[styles.errorText, { marginLeft: 28 }]}>{errors.acknowledgeMembership}</AppText>
        )}
      </View>

      {/* ─── 6. Primary Action Button ─── */}
      <TouchableOpacity
        style={styles.continueBtn}
        onPress={onNext}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Continue to review"
      >
        <AppText style={styles.continueBtnText}>Continue to review →</AppText>
      </TouchableOpacity>

      {/* ─── Skill Rating Selection Modal ─── */}
      <Modal
        visible={activeSkillTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveSkillTarget(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setActiveSkillTarget(null)}
        >
          <View style={styles.dropdownModalSheet}>
            <View style={styles.dropdownModalHeader}>
              <AppText style={styles.dropdownModalTitle}>Select Skill Rating</AppText>
              <TouchableOpacity onPress={() => setActiveSkillTarget(null)}>
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {SKILL_LEVEL_OPTIONS.map((lvl) => {
              const currentVal =
                activeSkillTarget === 'player1'
                  ? formState.skillLevel
                  : formState.partnerSkillLevel;
              const isSelected = currentVal === lvl;
              const isTournamentLevel = parsed.skillLevel === lvl;
              return (
                <TouchableOpacity
                  key={lvl}
                  style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
                  onPress={() => {
                    if (activeSkillTarget === 'player1') {
                      onChange({ skillLevel: lvl });
                    } else {
                      onChange({ partnerSkillLevel: lvl });
                    }
                    setActiveSkillTarget(null);
                  }}
                >
                  <AppText style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextActive]}>
                    {lvl} Level
                  </AppText>
                  {isSelected && <Check size={16} color="#064E3B" strokeWidth={2.5} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ─── Find Partner Club Member Modal ─── */}
      <Modal
        visible={showPartnerSearchModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPartnerSearchModal(false)}
      >
        <View style={styles.partnerModalBackdrop}>
          <View style={styles.partnerModalSheet}>
            <View style={styles.partnerModalHeader}>
              <AppText style={styles.partnerModalTitle}>Find Club Member</AppText>
              <TouchableOpacity onPress={() => setShowPartnerSearchModal(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.partnerSearchBox}>
              <Search size={16} color="#94A3B8" />
              <TextInput
                style={styles.partnerSearchInput}
                placeholder="Search by name, email, or member #"
                placeholderTextColor="#94A3B8"
                value={partnerQuery}
                onChangeText={setPartnerQuery}
                autoFocus
              />
              {partnerQuery.length > 0 && (
                <TouchableOpacity onPress={() => setPartnerQuery('')}>
                  <X size={14} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {isLoadingPartners ? (
              <ActivityIndicator color="#064E3B" style={{ marginVertical: 24 }} />
            ) : filteredPartners.length === 0 ? (
              <View style={styles.emptyPartners}>
                <AppText style={styles.emptyPartnersText}>
                  {partnerQuery ? 'No club members matching your search' : 'No available club members found'}
                </AppText>
              </View>
            ) : (
              <ScrollView style={styles.partnersList}>
                {filteredPartners.map((item) => (
                  <TouchableOpacity
                    key={item.membership_id}
                    style={styles.partnerItem}
                    onPress={() => handleSelectPartner(item)}
                  >
                    <View style={styles.partnerAvatar}>
                      <AppText style={styles.partnerAvatarText}>
                        {(item.full_name || 'P').charAt(0).toUpperCase()}
                      </AppText>
                    </View>
                    <View style={styles.partnerInfo}>
                      <AppText style={styles.partnerName}>{item.full_name}</AppText>
                      <AppText style={styles.partnerMeta}>
                        {item.email} {item.gender ? `• ${item.gender}` : ''} {item.skill_rating != null ? `• Rating ${item.skill_rating}` : ''}
                      </AppText>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
  },
  rulesCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  rulesCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  rulesHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  rulesHeaderIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rulesCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F2E28',
  },
  rulesCardSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  rulesBadge: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
  },
  rulesBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#0284C7',
    letterSpacing: 0.5,
  },
  specGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  specBox: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
  },
  specBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  specBoxLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  specBoxPrimary: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F2E28',
  },
  specBoxSecondary: {
    fontSize: 10.5,
    color: '#94A3B8',
    marginTop: 1,
  },
  rulesCalloutRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF9C3',
    borderWidth: 1,
    borderColor: '#FDE047',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  rulesCalloutText: {
    flex: 1,
    fontSize: 11.5,
    color: '#854D0E',
    lineHeight: 16,
  },
  aboutDescBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  aboutDescTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 3,
  },
  aboutDescText: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
  },
  teamNameSection: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 5,
  },
  star: {
    color: '#DC2626',
    fontWeight: '700',
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
    color: '#0F2E28',
  },
  inputError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  errorText: {
    fontSize: 11,
    color: '#DC2626',
    marginTop: 4,
  },
  playerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 16,
  },
  playerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2EAE6',
  },
  partnerHeaderRow: {
    justifyContent: 'space-between',
  },
  partnerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  findMemberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E2F1E8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  findMemberBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#064E3B',
  },
  playerCardTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#064E3B',
  },
  playerCardBody: {
    padding: 14,
    gap: 12,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  formCol: {
    flex: 1,
  },
  dropdownBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownBtnText: {
    fontSize: 13.5,
    color: '#0F2E28',
    fontWeight: '600',
  },
  genderRow: {
    marginTop: 2,
  },
  genderPillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  genderPill: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  genderPillActive: {
    borderColor: '#064E3B',
    backgroundColor: '#064E3B',
  },
  genderPillText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  genderPillTextActive: {
    color: '#FFFFFF',
  },
  selectedPartnerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 10,
  },
  selectedPartnerInfo: {
    flex: 1,
  },
  selectedPartnerName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#064E3B',
  },
  selectedPartnerEmail: {
    fontSize: 11.5,
    color: '#15803D',
  },
  clearPartnerBtn: {
    padding: 4,
  },
  checkboxSection: {
    gap: 10,
    marginBottom: 20,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxBoxActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 16,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dropdownModalSheet: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
  },
  dropdownModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dropdownModalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F2E28',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dropdownItemActive: {
    backgroundColor: '#F0FDF4',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#334155',
  },
  dropdownItemTextActive: {
    color: '#064E3B',
    fontWeight: '700',
  },
  partnerModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  partnerModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    maxHeight: '75%',
  },
  partnerModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  partnerModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F2E28',
  },
  partnerSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 12,
  },
  partnerSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F2E28',
  },
  partnersList: {
    maxHeight: 300,
  },
  partnerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  partnerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#15803D',
  },
  partnerInfo: {
    flex: 1,
  },
  partnerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F2E28',
  },
  partnerMeta: {
    fontSize: 12,
    color: '#64748B',
  },
  emptyPartners: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyPartnersText: {
    fontSize: 13,
    color: '#64748B',
  },
});
