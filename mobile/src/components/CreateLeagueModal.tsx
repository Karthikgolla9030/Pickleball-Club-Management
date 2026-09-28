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
  const [format, setFormat] = useState<'doubles' | 'singles'>('doubles');
  const [maxTeams, setMaxTeams] = useState('8');
  const [numberOfWeeks, setNumberOfWeeks] = useState('4');
  const [hasPlayoffs, setHasPlayoffs] = useState(true);
  const [playoffTeamCount, setPlayoffTeamCount] = useState('4');
  const [entryFee, setEntryFee] = useState('0');
  const [startDate, setStartDate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Dynamic suggested duration based on round-robin scheduling rules:
  // For N entries:
  // - If N even: N - 1 regular season rounds
  // - If N odd: N regular season rounds (with 1 BYE per round)
  // - Plus 1 playoff week if playoffs enabled
  const teamCountNum = Math.max(2, parseInt(maxTeams, 10) || 8);
  const fullRounds = teamCountNum % 2 === 0 ? teamCountNum - 1 : teamCountNum;
  const playoffWeeks = hasPlayoffs ? 1 : 0;
  const suggestedWeeks = fullRounds + playoffWeeks;

  useEffect(() => {
    if (visible) {
      setName('');
      setDescription('');
      setFormat('doubles');
      setMaxTeams('8');
      setNumberOfWeeks('4');
      setHasPlayoffs(true);
      setPlayoffTeamCount('4');
      setEntryFee('0');
      setStartDate('');
      setFormError(null);
    }
  }, [visible]);

  const handleApplySuggested = () => {
    setNumberOfWeeks(String(suggestedWeeks));
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setFormError('League name is required');
      return;
    }
    const weeks = parseInt(numberOfWeeks, 10);
    if (isNaN(weeks) || weeks < 2) {
      setFormError('Duration must be at least 2 weeks (minimum 1 regular season + 1 playoff)');
      return;
    }
    const teams = parseInt(maxTeams, 10);
    if (isNaN(teams) || teams < 2) {
      setFormError('Number of teams/entries must be at least 2');
      return;
    }
    const playoffTeams = hasPlayoffs ? parseInt(playoffTeamCount, 10) : 0;
    if (hasPlayoffs && (![2, 4, 8, 16].includes(playoffTeams) || playoffTeams > teams)) {
      setFormError(`Playoff qualifiers must be 2, 4, 8 or 16 and cannot exceed team count (${teams})`);
      return;
    }

    setFormError(null);
    const payload: CreateLeaguePayload = {
      name: name.trim(),
      description: description.trim() || null,
      number_of_weeks: weeks,
      team_size: format === 'doubles' ? 2 : 1,
      playoff_team_count: hasPlayoffs ? playoffTeams : 2, // minimum 2 in engine schema
      max_teams: teams,
      registration_fee: parseFloat(entryFee) || 0,
      start_date: startDate.trim() ? new Date(startDate.trim()).toISOString() : null,
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
                League & Season Setup
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

              {/* Format Selection: Doubles vs Singles */}
              <View>
                <AppText style={styles.fieldLabel}>Competition Format *</AppText>
                <View style={styles.formatToggleRow}>
                  <TouchableOpacity
                    style={[
                      styles.formatOption,
                      format === 'doubles' && styles.formatOptionSelected,
                    ]}
                    onPress={() => setFormat('doubles')}
                  >
                    <AppText
                      style={[
                        styles.formatOptionText,
                        format === 'doubles' && styles.formatOptionTextSelected,
                      ]}
                    >
                      👥 Doubles (2 / team)
                    </AppText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.formatOption,
                      format === 'singles' && styles.formatOptionSelected,
                    ]}
                    onPress={() => setFormat('singles')}
                  >
                    <AppText
                      style={[
                        styles.formatOptionText,
                        format === 'singles' && styles.formatOptionTextSelected,
                      ]}
                    >
                      👤 Singles (1 / entry)
                    </AppText>
                  </TouchableOpacity>
                </View>
              </View>

              <Input
                label="League Name *"
                placeholder="e.g., Aught2 Premier Doubles"
                value={name}
                onChangeText={setName}
                autoFocus
              />

              <Input
                label="Description"
                placeholder="Details, skill level requirements, venue notes..."
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={2}
              />

              {/* Number of Teams/Entries */}
              <Input
                label={format === 'doubles' ? 'Number of Teams (Capacity) *' : 'Number of Players (Capacity) *'}
                placeholder="8"
                keyboardType="numeric"
                value={maxTeams}
                onChangeText={setMaxTeams}
              />

              {/* Dynamic Suggested Duration Banner */}
              <View style={styles.suggestionBanner}>
                <View style={styles.suggestionHeader}>
                  <AppText style={styles.suggestionTitle}>
                    💡 Suggested Duration: {suggestedWeeks} Weeks
                  </AppText>
                </View>
                <AppText style={styles.suggestionDesc}>
                  Based on {teamCountNum} {format === 'doubles' ? 'teams' : 'players'}, a complete round-robin requires {fullRounds} weekly rounds {hasPlayoffs ? '+ 1 playoff championship week' : ''}. This is a recommendation, not a fixed value. You can manually customize the number of weeks below.
                </AppText>
                {numberOfWeeks !== String(suggestedWeeks) && (
                  <TouchableOpacity
                    style={styles.applySuggestedButton}
                    onPress={handleApplySuggested}
                  >
                    <AppText style={styles.applySuggestedText}>
                      Apply Suggested ({suggestedWeeks} Weeks)
                    </AppText>
                  </TouchableOpacity>
                )}
              </View>

              {/* Configured Weeks */}
              <View>
                <Input
                  label="Planned Number of Weeks *"
                  placeholder="4"
                  keyboardType="numeric"
                  value={numberOfWeeks}
                  onChangeText={setNumberOfWeeks}
                />
                <AppText style={styles.helperText}>
                  Configured: {Math.max(1, (parseInt(numberOfWeeks, 10) || 4) - 1)} regular season week{Math.max(1, (parseInt(numberOfWeeks, 10) || 4) - 1) > 1 ? 's' : ''} + 1 playoff week.
                </AppText>
              </View>

              {/* Playoffs Toggle & Qualifiers */}
              <View>
                <AppText style={styles.fieldLabel}>Playoff Tournament</AppText>
                <View style={styles.playoffsToggleRow}>
                  <TouchableOpacity
                    style={[styles.togglePill, hasPlayoffs && styles.togglePillActive]}
                    onPress={() => setHasPlayoffs(true)}
                  >
                    <AppText style={[styles.togglePillText, hasPlayoffs && styles.togglePillTextActive]}>
                      Enabled (Top Qualifiers Advance)
                    </AppText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.togglePill, !hasPlayoffs && styles.togglePillActive]}
                    onPress={() => setHasPlayoffs(false)}
                  >
                    <AppText style={[styles.togglePillText, !hasPlayoffs && styles.togglePillTextActive]}>
                      Disabled (Regular Season Only)
                    </AppText>
                  </TouchableOpacity>
                </View>
              </View>

              {hasPlayoffs && (
                <View>
                  <AppText style={styles.fieldLabel}>Playoff Qualifying Cutoff *</AppText>
                  <View style={styles.cutoffRow}>
                    {['2', '4', '8'].map((count) => {
                      const isSelected = playoffTeamCount === count;
                      return (
                        <TouchableOpacity
                          key={count}
                          style={[styles.cutoffButton, isSelected && styles.cutoffButtonSelected]}
                          onPress={() => setPlayoffTeamCount(count)}
                        >
                          <AppText style={[styles.cutoffText, isSelected && styles.cutoffTextSelected]}>
                            Top {count}
                          </AppText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Registration Fee */}
              <Input
                label="Registration Fee per Entry (₹)"
                placeholder="0"
                keyboardType="numeric"
                value={entryFee}
                onChangeText={setEntryFee}
              />

              {/* Invariants & Rules Info Box */}
              <View style={styles.infoBox}>
                <AppText style={styles.infoTitle}>League Competition Rules:</AppText>
                <AppText style={styles.infoText}>
                  • Format: {format === 'doubles' ? 'Doubles (2 players per registered team)' : 'Singles (Individual entry)'}{'\n'}
                  • Duration: Weeks 1 to {Math.max(1, (parseInt(numberOfWeeks, 10) || 4) - 1)} Regular Season{'\n'}
                  • Playoffs: {hasPlayoffs ? `Week ${parseInt(numberOfWeeks, 10) || 4} (Top ${playoffTeamCount} Single-Elimination)` : 'None'}{'\n'}
                  • Standings: Win-loss, points differential, total points scored{'\n'}
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
    backgroundColor: '#F8FAFC',
  },
  keyboardView: {
    flex: 1,
  },
  headerContainer: {
    paddingHorizontal: Layout.screenHorizontal,
    paddingTop: Spacing[4],
    paddingBottom: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[1],
  },
  mainTitle: {
    color: '#0F172A',
    fontWeight: '700',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontSize: 16,
    color: '#64748B',
    lineHeight: 20,
  },
  stepTitleRow: {
    marginTop: Spacing[1],
  },
  stepTitle: {
    color: '#64748B',
    fontSize: 14,
  },
  bodyScroll: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  bodyContent: {
    paddingHorizontal: Layout.screenHorizontal,
    paddingVertical: Spacing[4],
    paddingBottom: Spacing[8],
  },
  formContainer: {
    gap: Spacing[4],
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: Spacing[2],
  },
  formatToggleRow: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  formatOption: {
    flex: 1,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[2],
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formatOptionSelected: {
    borderColor: '#064E3B',
    backgroundColor: '#ECFDF5',
  },
  formatOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  formatOptionTextSelected: {
    color: '#064E3B',
  },
  suggestionBanner: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: Radius.lg,
    padding: Spacing[3],
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#166534',
  },
  suggestionDesc: {
    fontSize: 12,
    color: '#15803D',
    lineHeight: 18,
    marginBottom: Spacing[2],
  },
  applySuggestedButton: {
    backgroundColor: '#064E3B',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    alignSelf: 'flex-start',
  },
  applySuggestedText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  playoffsToggleRow: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  togglePill: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  togglePillActive: {
    borderColor: '#064E3B',
    backgroundColor: '#064E3B',
  },
  togglePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
  },
  togglePillTextActive: {
    color: '#FFFFFF',
  },
  cutoffRow: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  cutoffButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  cutoffButtonSelected: {
    borderColor: '#064E3B',
    backgroundColor: '#ECFDF5',
  },
  cutoffText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  cutoffTextSelected: {
    color: '#064E3B',
  },
  infoBox: {
    padding: Spacing[3],
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  infoText: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
  },
  helperText: {
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
    marginTop: -Spacing[2],
    marginBottom: Spacing[2],
    marginHorizontal: Spacing[1],
  },
  errorContainer: {
    padding: Spacing[2],
    backgroundColor: '#FEE2E2',
    borderRadius: Radius.md,
  },
  errorText: {
    fontSize: Typography.size.xs,
    color: '#DC2626',
  },
  footerContainer: {
    flexDirection: 'row',
    paddingHorizontal: Layout.screenHorizontal,
    paddingVertical: Spacing[3],
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    gap: Spacing[3],
  },
  footerButton: {
    flex: 1,
  },
});
