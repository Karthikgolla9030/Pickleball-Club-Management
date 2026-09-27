/**
 * Aught2 Pickleball — WizardFooter
 *
 * Sticky bottom navigation bar for the tournament wizard:
 * - "Back" button (hidden or disabled on step 1)
 * - "Next: [Step]" or "Create Tournament" button with loading and duplicate-submission prevention
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Colors, Spacing } from '@/theme';
import type { WizardStep } from './types';

const NEXT_LABELS: Record<WizardStep, string> = {
  1: 'Next: Eligibility',
  2: 'Next: Format & Scoring',
  3: 'Next: Schedule & Reg',
  4: 'Next: Review',
  5: 'Create Tournament',
};

interface WizardFooterProps {
  currentStep: WizardStep;
  onBack: () => void;
  onNext: () => void;
  isSubmitting?: boolean;
  canGoBack?: boolean;
  nextLabel?: string;
}

export function WizardFooter({
  currentStep,
  onBack,
  onNext,
  isSubmitting = false,
  canGoBack = true,
  nextLabel,
}: WizardFooterProps) {
  const insets = useSafeAreaInsets();
  const label = nextLabel ?? NEXT_LABELS[currentStep];
  const showBack = currentStep > 1 && canGoBack;

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, Spacing[4]) }]}>
      <View style={styles.buttonRow}>
        {showBack && (
          <Button
            label="Back"
            variant="secondary"
            onPress={onBack}
            disabled={isSubmitting}
            fullWidth={false}
            style={styles.backButton}
          />
        )}

        <Button
          label={label}
          variant="primary"
          onPress={onNext}
          loading={isSubmitting}
          disabled={isSubmitting}
          fullWidth={false}
          style={showBack ? styles.nextButtonWithBack : styles.nextButtonSolo}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: Colors.surface.border,
    backgroundColor: Colors.surface.default, // white
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    width: '100%',
  },
  backButton: {
    flex: 1,
    maxWidth: 130,
  },
  nextButtonWithBack: {
    flex: 2,
  },
  nextButtonSolo: {
    flex: 1,
    width: '100%',
  },
});
