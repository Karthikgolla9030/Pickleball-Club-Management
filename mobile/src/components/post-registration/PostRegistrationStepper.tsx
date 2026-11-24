/**
 * Aught2 Pickleball — PostRegistrationStepper
 *
 * Polished, enclosed stepper control for numeric post-registration settings:
 * - Number of pools
 * - Qualifiers per pool
 * - Planned rotation rounds
 *
 * Keeps labels and controls well-aligned and responsive on all viewport widths.
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Radius, Spacing } from '@/theme';

export interface PostRegistrationStepperProps {
  label: string;
  helperText?: string;
  value: number;
  unit: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (nextValue: number) => void;
}

export function PostRegistrationStepper({
  label,
  helperText,
  value,
  unit,
  min = 1,
  max = 99,
  step = 1,
  disabled = false,
  onChange,
}: PostRegistrationStepperProps) {
  const canDecrease = !disabled && value > min;
  const canIncrease = !disabled && value < max;

  const handleDecrease = () => {
    if (canDecrease) {
      onChange(Math.max(min, value - step));
    }
  };

  const handleIncrease = () => {
    if (canIncrease) {
      onChange(Math.min(max, value + step));
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelCol}>
        <AppText style={styles.label}>{label}</AppText>
        {helperText ? <AppText style={styles.helperText}>{helperText}</AppText> : null}
      </View>

      <View style={styles.stepperWrap}>
        <TouchableOpacity
          style={[styles.stepperBtn, !canDecrease && styles.stepperBtnDisabled]}
          onPress={handleDecrease}
          disabled={!canDecrease}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Minus size={15} color={canDecrease ? '#0F766E' : '#94A3B8'} />
        </TouchableOpacity>

        <View style={styles.valueWrap}>
          <AppText style={styles.valueText}>{value}</AppText>
          <AppText style={styles.unitText}>{unit}</AppText>
        </View>

        <TouchableOpacity
          style={[styles.stepperBtn, !canIncrease && styles.stepperBtnDisabled]}
          onPress={handleIncrease}
          disabled={!canIncrease}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Plus size={15} color={canIncrease ? '#0F766E' : '#94A3B8'} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.md,
    paddingVertical: Spacing[2.5],
    paddingHorizontal: Spacing[3],
    gap: Spacing[2],
  },
  labelCol: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 18,
  },
  helperText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
    lineHeight: 15,
  },
  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: Radius.md,
    padding: 2,
    flexShrink: 0,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: {
    backgroundColor: '#F8FAFC',
    opacity: 0.4,
  },
  valueWrap: {
    minWidth: 52,
    paddingHorizontal: Spacing[1],
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F766E',
    lineHeight: 18,
  },
  unitText: {
    fontSize: 9.5,
    fontWeight: '500',
    color: '#64748B',
    textTransform: 'lowercase',
  },
});
