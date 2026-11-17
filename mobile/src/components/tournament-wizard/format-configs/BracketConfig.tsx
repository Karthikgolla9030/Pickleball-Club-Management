/**
 * Aught2 Pickleball — BracketConfig (Step 2)
 *
 * Master UI format card for Bracket:
 * - Purple border & badge
 * - Clear explanation: "Participants compete in knockout matches. Winners advance to the next round."
 * - ONLY ONE QUESTION: Bracket Type (Single Elimination, Single Elimination with Consolation, Double Elimination)
 * - Seeding and BYE rules retrieved automatically from Club Details
 * - No manual courts, no seeding inputs, no non-power-of-two bye chips
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Check, CheckCircle2 } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Colors, Radius, Spacing } from '@/theme';
import type { Club } from '@/types';
import { BRACKET_TYPE_OPTIONS, type TournamentWizardState } from '../types';

interface BracketConfigProps {
  state: TournamentWizardState;
  onChange: (patch: Partial<TournamentWizardState>) => void;
  club?: Club | null;
  errors?: Record<string, string>;
}

const BRACKET_TYPE_DESCRIPTIONS: Record<string, string> = {
  'Single Elimination': 'Lose once and you are out.',
  'Single Elimination with Consolation': 'Players eliminated from the main bracket can compete in a separate consolation bracket.',
  'Double Elimination': 'A participant is eliminated after two losses.',
};

export function BracketConfig({ state, onChange, club }: BracketConfigProps) {
  const clubConfig = club?.tournament_configuration?.bracket || {};
  const seedingMethod = clubConfig.seeding_method || state.bracketSeedingMethod || 'Team Average Rating (Highest = Seed #1)';
  const byeRule = clubConfig.bye_rule || state.bracketByeRule || 'Automatic BYEs awarded to top seeds';
  const targetScore = clubConfig.target_score || 11;
  const winBy = clubConfig.win_by || 2;

  return (
    <View style={styles.card}>
      {/* Badge Header */}
      <View style={styles.badgeRow}>
        <Badge label="BRACKET FORMAT" variant="default" />
        <AppText variant="caption" color="secondary" style={styles.badgeSubtitle} numberOfLines={1}>
          Knockout Tournament
        </AppText>
      </View>

      <AppText variant="bodySmall" color="secondary" style={styles.explanationText}>
        Participants compete in knockout matches. Winners advance to the next round.
      </AppText>

      {/* ONLY Question: Bracket Type */}
      <View style={styles.questionSection}>
        <AppText variant="caption" color="secondary" style={styles.sectionTitle}>
          BRACKET TYPE *
        </AppText>
        <View style={styles.optionsList}>
          {BRACKET_TYPE_OPTIONS.map((bType) => {
            const isSelected = state.bracketType === bType;
            return (
              <TouchableOpacity
                key={bType}
                onPress={() => onChange({ bracketType: bType })}
                style={[
                  styles.bracketTypeCard,
                  isSelected && styles.bracketTypeCardSelected,
                ]}
                activeOpacity={0.7}
              >
                <View style={styles.cardTopRow}>
                  <AppText
                    variant="bodySmall"
                    bold
                    style={[
                      styles.bracketTypeName,
                      isSelected && styles.bracketTypeNameSelected,
                    ]}
                  >
                    {bType}
                  </AppText>
                  {isSelected && <View style={styles.selectedIndicator} />}
                </View>
                <AppText
                  variant="caption"
                  style={[
                    styles.bracketTypeDesc,
                    isSelected && styles.bracketTypeDescSelected,
                  ]}
                >
                  {BRACKET_TYPE_DESCRIPTIONS[bType] || bType}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Applied Club Configuration Summary Box */}
      <View style={styles.appliedConfigBox}>
        <View style={styles.appliedHeaderRow}>
          <CheckCircle2 size={15} color="#7C3AED" />
          <AppText variant="caption" bold style={styles.appliedHeaderLabel}>
            APPLIED FROM CLUB CONFIGURATION
          </AppText>
        </View>

        <View style={styles.rulesList}>
          <View style={styles.ruleItemRow}>
            <Check size={13} color="#7C3AED" />
            <AppText variant="caption" style={styles.ruleItemText}>
              Seeding Method: {seedingMethod}
            </AppText>
          </View>
          <View style={styles.ruleItemRow}>
            <Check size={13} color="#7C3AED" />
            <AppText variant="caption" style={styles.ruleItemText}>
              BYE Allocation: {byeRule}
            </AppText>
          </View>
          <View style={styles.ruleItemRow}>
            <Check size={13} color="#7C3AED" />
            <AppText variant="caption" style={styles.ruleItemText}>
              Match Scoring: First to {targetScore} points, win by {winBy} (Single Game)
            </AppText>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(124, 58, 237, 0.04)',
    borderWidth: 1.5,
    borderColor: '#7C3AED',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[3],
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    flexWrap: 'wrap',
  },
  badgeSubtitle: {
    fontSize: 12,
  },
  explanationText: {
    fontSize: 13,
    lineHeight: 18,
  },
  questionSection: {
    gap: Spacing[2],
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  optionsList: {
    gap: Spacing[2],
  },
  bracketTypeCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: Colors.surface.border,
    borderRadius: Radius.md,
    padding: Spacing[3],
    gap: 4,
  },
  bracketTypeCardSelected: {
    borderColor: '#7C3AED',
    backgroundColor: 'rgba(124, 58, 237, 0.06)',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bracketTypeName: {
    color: Colors.text.primary,
    fontSize: 13,
  },
  bracketTypeNameSelected: {
    color: '#7C3AED',
    fontWeight: '700',
  },
  bracketTypeDesc: {
    color: Colors.text.secondary,
    fontSize: 12,
    lineHeight: 16,
  },
  bracketTypeDescSelected: {
    color: '#6D28D9',
  },
  selectedIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#7C3AED',
  },
  appliedConfigBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDE8E2',
    borderRadius: Radius.md,
    padding: Spacing[3],
    gap: Spacing[2],
  },
  appliedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  appliedHeaderLabel: {
    color: '#7C3AED',
    letterSpacing: 0.5,
  },
  rulesList: {
    gap: 6,
  },
  ruleItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ruleItemText: {
    color: Colors.text.secondary,
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
});
