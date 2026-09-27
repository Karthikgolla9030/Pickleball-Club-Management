/**
 * Aught2 Pickleball — Step 5: Review & Create
 *
 * Final step before tournament creation:
 * - Structured review summary matching desktop reference screen
 * - Publication Mode Selector: "Publish & Open Registration" vs "Save as Draft"
 * - Submission error banner
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { CheckCircle2, Circle, Eye, EyeOff, Send, ShieldAlert } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Colors, Radius, Spacing } from '@/theme';
import { ReviewSummary } from './ReviewSummary';
import type { TournamentWizardState } from '../types';

interface Step5ReviewCreateProps {
  state: TournamentWizardState;
  onChange: (patch: Partial<TournamentWizardState>) => void;
  clubName?: string;
  error?: string | null;
}

export function Step5ReviewCreate({
  state,
  onChange,
  clubName,
  error,
}: Step5ReviewCreateProps) {
  const isPublish = state.publishImmediately;

  return (
    <View style={styles.container}>
      {/* Error banner if submission failed */}
      {error && (
        <View style={styles.errorBanner}>
          <AppText variant="caption" style={styles.errorText}>
            {error}
          </AppText>
        </View>
      )}

      {/* Review Summary Table */}
      <ReviewSummary state={state} clubName={clubName} />

      {/* Publication / Visibility Choice */}
      <View style={styles.publishCard}>
        <AppText variant="caption" color="secondary" style={styles.sectionHeader}>
          PUBLICATION & VISIBILITY
        </AppText>

        <TouchableOpacity
          style={[styles.choiceItem, isPublish && styles.choiceItemActive]}
          onPress={() => onChange({ publishImmediately: true })}
          activeOpacity={0.7}
        >
          <View style={[styles.radioIconWrap, isPublish && styles.radioIconWrapActive]}>
            {isPublish ? (
              <CheckCircle2 size={18} color="#087A60" />
            ) : (
              <Circle size={18} color={Colors.text.tertiary} />
            )}
          </View>
          <View style={styles.choiceTextWrap}>
            <View style={styles.choiceTitleRow}>
              <Send size={14} color={isPublish ? '#087A60' : Colors.text.secondary} />
              <AppText variant="bodySmall" bold style={isPublish ? styles.choiceTitleActive : styles.choiceTitle}>
                Publish & Open for Registration (Recommended)
              </AppText>
            </View>
            <AppText variant="caption" color="secondary" style={styles.choiceSubtitle}>
              Tournament becomes public. Players can discover and register immediately in the Player App.
            </AppText>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.choiceItem, !isPublish && styles.choiceItemDraftActive]}
          onPress={() => onChange({ publishImmediately: false })}
          activeOpacity={0.7}
        >
          <View style={[styles.radioIconWrap, !isPublish && styles.radioIconWrapDraftActive]}>
            {!isPublish ? (
              <CheckCircle2 size={18} color="#D97706" />
            ) : (
              <Circle size={18} color={Colors.text.tertiary} />
            )}
          </View>
          <View style={styles.choiceTextWrap}>
            <View style={styles.choiceTitleRow}>
              <EyeOff size={14} color={!isPublish ? '#D97706' : Colors.text.secondary} />
              <AppText variant="bodySmall" bold style={!isPublish ? styles.choiceTitleDraftActive : styles.choiceTitle}>
                Save as Draft (Private, Club Only)
              </AppText>
            </View>
            <AppText variant="caption" color="secondary" style={styles.choiceSubtitle}>
              Completely hidden from players. Allows configuring teams, pools, and bracket settings prior to publishing.
            </AppText>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[3],
  },
  errorBanner: {
    backgroundColor: Colors.status.errorBg,
    borderWidth: 1,
    borderColor: Colors.status.error,
    borderRadius: Radius.md,
    padding: Spacing[3],
  },
  errorText: {
    color: Colors.status.error,
    fontWeight: '600',
    fontSize: 13,
  },
  publishCard: {
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: Radius.lg,
    padding: Spacing[3],
    gap: Spacing[2.5],
  },
  sectionHeader: {
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.8,
  },
  choiceItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surface.default,
    borderWidth: 1.5,
    borderColor: Colors.surface.border,
    borderRadius: Radius.md,
    padding: Spacing[3],
    gap: Spacing[2.5],
  },
  choiceItemActive: {
    borderColor: '#087A60',
    backgroundColor: '#F0FDF4',
  },
  choiceItemDraftActive: {
    borderColor: '#D97706',
    backgroundColor: '#FFFBEB',
  },
  radioIconWrap: {
    marginTop: 2,
  },
  radioIconWrapActive: {},
  radioIconWrapDraftActive: {},
  choiceTextWrap: {
    flex: 1,
    gap: 3,
  },
  choiceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1.5],
  },
  choiceTitle: {
    color: Colors.text.primary,
  },
  choiceTitleActive: {
    color: '#065F46',
  },
  choiceTitleDraftActive: {
    color: '#92400E',
  },
  choiceSubtitle: {
    fontSize: 11,
    lineHeight: 15,
  },
});
