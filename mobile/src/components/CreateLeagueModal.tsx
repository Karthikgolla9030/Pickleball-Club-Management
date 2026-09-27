import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Input } from './Input';
import { Button } from './Button';
import { Colors, Layout, Radius, Spacing, Typography } from '@/theme';
import type { CreateLeaguePayload } from '@/types';

interface CreateLeagueModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateLeaguePayload) => Promise<void>;
  isCreating: boolean;
}

export function CreateLeagueModal({
  visible,
  onClose,
  onSubmit,
  isCreating,
}: CreateLeagueModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [numberOfWeeks, setNumberOfWeeks] = useState('4');
  const [playoffTeamCount, setPlayoffTeamCount] = useState('4');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName('');
      setDescription('');
      setNumberOfWeeks('4');
      setPlayoffTeamCount('4');
      setFormError(null);
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setFormError('League name is required');
      return;
    }
    const weeks = parseInt(numberOfWeeks, 10);
    if (isNaN(weeks) || weeks < 2) {
      setFormError('Number of weeks must be at least 2');
      return;
    }
    const playoffTeams = parseInt(playoffTeamCount, 10);
    if (![2, 4, 8, 16].includes(playoffTeams)) {
      setFormError('Playoff teams must be a power of 2 (2, 4, 8, 16)');
      return;
    }

    setFormError(null);
    const payload: CreateLeaguePayload = {
      name: name.trim(),
      description: description.trim() || null,
      number_of_weeks: weeks,
      team_size: 2,
      playoff_team_count: playoffTeams,
      scoring_rules: {
        game_format: 'single_game',
        target_score: 11,
        win_by: 2,
      },
    };
    
    try {
      await onSubmit(payload);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to create league';
      setFormError(msg);
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
          {/* Header */}
          <View style={styles.headerContainer}>
            <View style={styles.topRow}>
              <AppText variant="heading2" style={styles.mainTitle}>
                Create League
              </AppText>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.closeButton}
                accessibilityLabel="Close creation flow"
                accessibilityRole="button"
              >
                <AppText style={styles.closeIcon}>✕</AppText>
              </TouchableOpacity>
            </View>

            <View style={styles.stepTitleRow}>
              <AppText variant="heading3" style={styles.stepTitle}>
                Step 1 — League Details
              </AppText>
            </View>
          </View>

          {/* Scrollable Content */}
          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.formContainer}>
              {formError ? (
                <View style={styles.errorContainer}>
                  <AppText style={styles.errorText}>{formError}</AppText>
                </View>
              ) : null}

              <Input
                label="League Name *"
                placeholder="e.g., Aught2 Summer League"
                value={name}
                onChangeText={setName}
                autoFocus
              />

              <Input
                label="Description"
                placeholder="Details, skill level, night of play..."
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={2}
              />

              <Input
                label="Total Weeks (Regular Season + 1 Playoff Week) *"
                placeholder="4"
                keyboardType="numeric"
                value={numberOfWeeks}
                onChangeText={setNumberOfWeeks}
              />

              <Input
                label="Playoff Qualifying Teams Count (2, 4, 8) *"
                placeholder="4"
                keyboardType="numeric"
                value={playoffTeamCount}
                onChangeText={setPlayoffTeamCount}
              />

              <View style={styles.infoBox}>
                <AppText style={styles.infoTitle}>League Engine Invariants:</AppText>
                <AppText style={styles.infoText}>
                  • Fixed doubles teams (2 players per team){'\n'}
                  • Weeks 1 to {parseInt(numberOfWeeks, 10) > 1 ? parseInt(numberOfWeeks, 10) - 1 : 1}: Regular Season round-robin{'\n'}
                  • Week {numberOfWeeks || 'N'}: Championship Single-Elimination Playoffs{'\n'}
                  • Games played to 11 (win by 2)
                </AppText>
              </View>
            </View>
          </ScrollView>

          {/* Sticky Footer */}
          <View style={styles.footerContainer}>
            <Button
              label="Cancel"
              variant="secondary"
              onPress={onClose}
              style={styles.footerButton}
            />
            <Button
              label="Create League"
              variant="primary"
              onPress={handleSubmit}
              loading={isCreating}
              style={styles.footerButton}
            />
          </View>
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
  headerContainer: {
    paddingHorizontal: Layout.screenHorizontal,
    paddingTop: Spacing[4],
    paddingBottom: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
    backgroundColor: Colors.surface.default,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[2],
  },
  mainTitle: {
    color: Colors.text.primary,
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
    lineHeight: 20,
  },
  stepTitleRow: {
    marginTop: Spacing[1],
  },
  stepTitle: {
    color: Colors.text.primary,
  },
  bodyScroll: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  bodyContent: {
    paddingHorizontal: Layout.screenHorizontal,
    paddingVertical: Spacing[4],
    paddingBottom: Spacing[8],
  },
  formContainer: {
    gap: Spacing[4],
  },
  footerContainer: {
    flexDirection: 'row',
    paddingHorizontal: Layout.screenHorizontal,
    paddingVertical: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: Colors.surface.border,
    backgroundColor: Colors.surface.default,
    gap: Spacing[3],
  },
  footerButton: {
    flex: 1,
  },
  errorContainer: {
    padding: Spacing[2],
    backgroundColor: Colors.status.errorBg,
    borderRadius: Radius.md,
  },
  errorText: {
    fontSize: Typography.size.xs,
    color: Colors.status.error,
  },
  infoBox: {
    padding: Spacing[3],
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  infoTitle: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
    marginBottom: 4,
  },
  infoText: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
});
