/**
 * Aught2 Pickleball — WizardStepIndicator
 *
 * Compact, responsive step indicator for mobile:
 * - 5 steps (1 to 5) with connecting progress lines
 * - Active step highlighted in primary blue/brand color
 * - Completed steps marked with accent or checkmark
 * - Future steps displayed as muted circles
 * - Tapping prior steps allows quick navigation back
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Colors, Radius, Spacing } from '@/theme';
import type { WizardStep } from './types';

interface WizardStepIndicatorProps {
  currentStep: WizardStep;
  totalSteps?: number;
  onStepPress?: (step: WizardStep) => void;
}

export function WizardStepIndicator({
  currentStep,
  totalSteps = 5,
  onStepPress,
}: WizardStepIndicatorProps) {
  const steps = Array.from({ length: totalSteps }, (_, i) => (i + 1) as WizardStep);

  return (
    <View style={styles.container}>
      {steps.map((step, idx) => {
        const isActive = step === currentStep;
        const isCompleted = step < currentStep;
        const isFuture = step > currentStep;
        const canPress = isCompleted && onStepPress;

        return (
          <React.Fragment key={step}>
            {/* Step Circle */}
            <TouchableOpacity
              activeOpacity={canPress ? 0.7 : 1}
              disabled={!canPress}
              onPress={() => onStepPress?.(step)}
              style={[
                styles.circle,
                isActive && styles.circleActive,
                isCompleted && styles.circleCompleted,
                isFuture && styles.circleFuture,
              ]}
            >
              <AppText
                variant="caption"
                bold
                style={[
                  styles.circleText,
                  isActive && styles.circleTextActive,
                  isCompleted && styles.circleTextCompleted,
                  isFuture && styles.circleTextFuture,
                ]}
              >
                {step}
              </AppText>
            </TouchableOpacity>

            {/* Connecting Line between steps */}
            {idx < steps.length - 1 && (
              <View
                style={[
                  styles.connectingLine,
                  step < currentStep ? styles.connectingLineActive : styles.connectingLineInactive,
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[2],
    paddingVertical: Spacing[3],
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleActive: {
    backgroundColor: Colors.brand.primary,
    borderWidth: 2,
    borderColor: Colors.brand.primary,
    shadowColor: Colors.brand.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  circleCompleted: {
    backgroundColor: Colors.brand.primaryDark,
    borderWidth: 2,
    borderColor: Colors.brand.primaryDark,
  },
  circleFuture: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.surface.border,
  },
  circleText: {
    fontSize: 14,
    textAlign: 'center',
  },
  circleTextActive: {
    color: Colors.white,
  },
  circleTextCompleted: {
    color: Colors.white,
  },
  circleTextFuture: {
    color: Colors.text.tertiary,
  },
  connectingLine: {
    flex: 1,
    height: 2,
    marginHorizontal: Spacing[1],
  },
  connectingLineActive: {
    backgroundColor: Colors.brand.primary,
  },
  connectingLineInactive: {
    backgroundColor: Colors.surface.border,
  },
});
