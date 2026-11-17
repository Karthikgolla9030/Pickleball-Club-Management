/**
 * Aught2 Pickleball — BracketConfig (Step 2)
 *
 * Clean, compact format view:
 * - Exactly ONE question: Bracket Type (Single Elimination, Consolation, Double Elimination)
 * - Bracket Settings summary box below with "Using club settings" badge
 * - No technical backend names, no duplicate format descriptions
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
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
  'Single Elimination with Consolation': 'Players eliminated early can compete in a consolation bracket.',
  'Double Elimination': 'A participant is eliminated after two losses.',
};

export function BracketConfig({ state, onChange, club, errors }: BracketConfigProps) {
  const clubConfig = club?.tournament_configuration?.bracket || {};
  const targetScore = clubConfig.target_score || 11;
  const winBy = clubConfig.win_by || 2;

  return (
    <View style={styles.container}>
      {/* Question: Bracket Type */}
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
        {errors?.bracketType && (
          <AppText variant="caption" style={styles.errorText}>
            {errors.bracketType}
          </AppText>
        )}
      </View>

      {/* Bracket Settings Box */}
      <View style={styles.settingsCard}>
        <View style={styles.headerRow}>
          <AppText variant="bodySmall" bold style={styles.cardTitle}>
            Bracket Settings
          </AppText>
          <Badge label="Using club settings" variant="success" />
        </View>

        <View style={styles.bulletsList}>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <AppText variant="caption" style={styles.bulletText}>
              Seeding: <AppText variant="caption" bold>Team average rating</AppText>
            </AppText>
          </View>

          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <AppText variant="caption" style={styles.bulletText}>
              Byes: <AppText variant="caption" bold>Automatic for top seeds</AppText>
            </AppText>
          </View>

          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <AppText variant="caption" style={styles.bulletText}>
              Match scoring: First to <AppText variant="caption" bold>{targetScore}</AppText> (win by <AppText variant="caption" bold>{winBy}</AppText>)
            </AppText>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[3],
  },
  questionSection: {
    gap: Spacing[2],
  },
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  optionsList: {
    gap: Spacing[2],
  },
  bracketTypeCard: {
    backgroundColor: Colors.surface.default,
    borderWidth: 1.5,
    borderColor: Colors.surface.border,
    borderRadius: Radius.md,
    padding: Spacing[3],
    gap: 4,
  },
  bracketTypeCardSelected: {
    borderColor: Colors.brand.primary,
    backgroundColor: '#F0FDF4',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bracketTypeName: {
    color: Colors.text.primary,
  },
  bracketTypeNameSelected: {
    color: '#065F46',
  },
  selectedIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.brand.primary,
  },
  bracketTypeDesc: {
    color: Colors.text.secondary,
    lineHeight: 16,
    fontSize: 12,
  },
  bracketTypeDescSelected: {
    color: '#065F46',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
  },
  settingsCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.md,
    padding: Spacing[3],
    gap: Spacing[2],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  cardTitle: {
    color: '#0F172A',
    fontSize: 13,
  },
  bulletsList: {
    gap: 6,
    paddingLeft: 2,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bulletDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.brand.primary,
  },
  bulletText: {
    color: Colors.text.secondary,
    fontSize: 12,
    lineHeight: 16,
  },
});
