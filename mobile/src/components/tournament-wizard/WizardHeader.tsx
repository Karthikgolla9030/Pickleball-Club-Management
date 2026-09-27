/**
 * Aught2 Pickleball — WizardHeader
 *
 * Displays the modal header with tournament creation title,
 * current step heading (e.g. "Step 3 — Format & Scoring"), and dismiss button.
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Colors, Spacing } from '@/theme';
import type { WizardStep } from './types';

const STEP_TITLES: Record<WizardStep, string> = {
  1: 'Step 1 — Basic Details',
  2: 'Step 2 — Format & Scoring',
  3: 'Step 3 — Category & Eligibility',
  4: 'Step 4 — Schedule & Registration',
  5: 'Step 5 — Review & Create',
};

interface WizardHeaderProps {
  currentStep: WizardStep;
  onClose: () => void;
}

export function WizardHeader({ currentStep, onClose }: WizardHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <AppText variant="heading2" style={styles.mainTitle}>
          Create Tournament
        </AppText>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.closeButton}
          accessibilityLabel="Close tournament wizard"
          accessibilityRole="button"
        >
          <AppText style={styles.closeIcon}>✕</AppText>
        </TouchableOpacity>
      </View>

      <View style={styles.stepTitleRow}>
        <AppText variant="heading3" style={styles.stepTitle}>
          {STEP_TITLES[currentStep]}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[3],
    paddingBottom: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[1],
  },
  mainTitle: {
    color: Colors.text.primary,
    fontWeight: '700',
    fontSize: 20,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surface.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontSize: 16,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  stepTitleRow: {
    marginTop: Spacing[1],
  },
  stepTitle: {
    color: Colors.text.primary,
    fontWeight: '600',
    fontSize: 16,
  },
});
