/**
 * Aught2 Pickleball — Club Tournament Configuration Tab
 *
 * Location: Club Side → Club Details → Tournament Configuration
 * Allows club owners to manage default engine rules, scoring, and preferences
 * across all four tournament formats (Round Robin, Pool Play, Bracket, Scramble).
 *
 * These defaults are saved once at the club level and automatically applied
 * when creating a new tournament, eliminating repetitive technical configuration.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Award,
  CheckCircle2,
  Info,
  Layers,
  Save,
  ShieldAlert,
  Trophy,
  Users,
  Zap,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { clubsApi } from '@/services/api/clubs';
import { Colors, Radius, Spacing } from '@/theme';
import type { Club, TournamentFormat } from '@/types';
import {
  BRACKET_BYE_OPTIONS,
  BRACKET_SEEDING_OPTIONS,
  BRACKET_TYPE_OPTIONS,
  SCRAMBLE_LEADERBOARD_OPTIONS,
  SCRAMBLE_ROTATION_OPTIONS,
} from '@/components/tournament-wizard/types';

export const DEFAULT_CLUB_TOURNAMENT_CONFIG = {
  round_robin: {
    target_score: 11,
    win_by: 2,
    game_format: 'single_game',
    court_allocation_preference: 'all_available',
    tiebreaker_rules: [
      'wins',
      'points_differential',
      'total_points_scored',
      'team_name_deterministic',
    ],
  },
  pool_play: {
    pool_count: 2,
    teams_per_pool: 4,
    qualifiers_per_pool: 2,
    pool_bracket_type: 'Single Elimination',
    target_score: 11,
    win_by: 2,
    advancement_rule: 'top_per_pool',
    tiebreaker_rules: [
      'wins',
      'points_differential',
      'total_points_scored',
      'team_name_deterministic',
    ],
  },
  bracket: {
    bracket_type: 'Single Elimination',
    seeding_method: 'Team Average Rating (Highest = Seed #1)',
    bye_rule: 'Automatic BYEs awarded to top seeds',
    target_score: 11,
    win_by: 2,
    tiebreaker_rules: [
      'wins',
      'points_differential',
      'total_points_scored',
      'team_name_deterministic',
    ],
  },
  scramble: {
    planned_rounds: 5,
    rotation_rule: 'Full Rotation (no repeating partners)',
    leaderboard_metric: 'Win Percentage (Wins / Played) • Avg Point Diff',
    target_score: 11,
    win_by: 2,
  },
};

interface ClubTournamentConfigTabProps {
  club: Club;
  isOwner: boolean;
  onSaved?: () => Promise<void> | void;
}

export function ClubTournamentConfigTab({
  club,
  isOwner,
  onSaved,
}: ClubTournamentConfigTabProps) {
  const [activeFormat, setActiveFormat] = useState<TournamentFormat>('round_robin');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Form states per format
  // Round Robin
  const [rrTargetScore, setRrTargetScore] = useState('11');
  const [rrWinBy, setRrWinBy] = useState('2');
  const [rrCourtPref, setRrCourtPref] = useState('all_available');

  // Pool Play
  const [poolCount, setPoolCount] = useState('2');
  const [teamsPerPool, setTeamsPerPool] = useState('4');
  const [qualifiersPerPool, setQualifiersPerPool] = useState('2');
  const [poolBracketType, setPoolBracketType] = useState('Single Elimination');

  // Bracket
  const [bracketType, setBracketType] = useState<string>('Single Elimination');
  const [seedingMethod, setSeedingMethod] = useState<string>(BRACKET_SEEDING_OPTIONS[0]);
  const [byeRule, setByeRule] = useState<string>(BRACKET_BYE_OPTIONS[0]);

  // Scramble
  const [scrambleRounds, setScrambleRounds] = useState('5');
  const [scrambleRotationRule, setScrambleRotationRule] = useState<string>(SCRAMBLE_ROTATION_OPTIONS[0]);
  const [scrambleLeaderboardMetric, setScrambleLeaderboardMetric] = useState<string>(SCRAMBLE_LEADERBOARD_OPTIONS[0]);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize from club.tournament_configuration or defaults
  useEffect(() => {
    const rawConfig = club.tournament_configuration || {};
    const rr = rawConfig.round_robin || DEFAULT_CLUB_TOURNAMENT_CONFIG.round_robin;
    const pp = rawConfig.pool_play || DEFAULT_CLUB_TOURNAMENT_CONFIG.pool_play;
    const br = rawConfig.bracket || DEFAULT_CLUB_TOURNAMENT_CONFIG.bracket;
    const sc = rawConfig.scramble || DEFAULT_CLUB_TOURNAMENT_CONFIG.scramble;

    setRrTargetScore(String(rr.target_score ?? 11));
    setRrWinBy(String(rr.win_by ?? 2));
    setRrCourtPref(rr.court_allocation_preference || 'all_available');

    setPoolCount(String(pp.pool_count ?? 2));
    setTeamsPerPool(String(pp.teams_per_pool ?? 4));
    setQualifiersPerPool(String(pp.qualifiers_per_pool ?? 2));
    setPoolBracketType(pp.pool_bracket_type || 'Single Elimination');

    setBracketType(br.bracket_type || 'Single Elimination');
    setSeedingMethod(br.seeding_method || BRACKET_SEEDING_OPTIONS[0]);
    setByeRule(br.bye_rule || BRACKET_BYE_OPTIONS[0]);

    setScrambleRounds(String(sc.planned_rounds ?? 5));
    setScrambleRotationRule(sc.rotation_rule || SCRAMBLE_ROTATION_OPTIONS[0]);
    setScrambleLeaderboardMetric(sc.leaderboard_metric || SCRAMBLE_LEADERBOARD_OPTIONS[0]);
  }, [club]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    // Round Robin validation
    const rrScore = parseInt(rrTargetScore, 10);
    const rrW = parseInt(rrWinBy, 10);
    if (isNaN(rrScore) || rrScore < 1) errs.rrTargetScore = 'Target score must be at least 1.';
    if (isNaN(rrW) || rrW < 1) errs.rrWinBy = 'Win by points must be at least 1.';

    // Pool Play validation
    const pCount = parseInt(poolCount, 10);
    const tpp = parseInt(teamsPerPool, 10);
    const qpp = parseInt(qualifiersPerPool, 10);
    if (isNaN(pCount) || pCount < 2) errs.poolCount = 'Must have at least 2 pools.';
    if (isNaN(tpp) || tpp < 2) errs.teamsPerPool = 'Must have at least 2 teams per pool.';
    if (isNaN(qpp) || qpp < 1 || qpp > tpp) errs.qualifiersPerPool = 'Qualifiers must be between 1 and teams per pool.';

    // Scramble validation
    const sRounds = parseInt(scrambleRounds, 10);
    if (isNaN(sRounds) || sRounds < 1 || sRounds > 20) errs.scrambleRounds = 'Rounds must be between 1 and 20.';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!isOwner) {
      Alert.alert('Permission Denied', 'Only the Club Owner can update tournament configuration.');
      return;
    }

    if (!validate()) {
      Alert.alert('Validation Error', 'Please correct the highlighted fields before saving.');
      return;
    }

    setIsSaving(true);
    setSaveSuccessMsg(null);

    const payloadConfig = {
      round_robin: {
        target_score: parseInt(rrTargetScore, 10) || 11,
        win_by: parseInt(rrWinBy, 10) || 2,
        game_format: 'single_game',
        court_allocation_preference: rrCourtPref,
        tiebreaker_rules: DEFAULT_CLUB_TOURNAMENT_CONFIG.round_robin.tiebreaker_rules,
        match_scoring: {
          game_format: 'single_game',
          target_score: parseInt(rrTargetScore, 10) || 11,
          win_by: parseInt(rrWinBy, 10) || 2,
        },
      },
      pool_play: {
        pool_count: parseInt(poolCount, 10) || 2,
        teams_per_pool: parseInt(teamsPerPool, 10) || 4,
        qualifiers_per_pool: parseInt(qualifiersPerPool, 10) || 2,
        pool_bracket_type: poolBracketType,
        target_score: 11,
        win_by: 2,
        advancement_rule: 'top_per_pool',
        tiebreaker_rules: DEFAULT_CLUB_TOURNAMENT_CONFIG.pool_play.tiebreaker_rules,
        match_scoring: {
          game_format: 'single_game',
          target_score: 11,
          win_by: 2,
        },
      },
      bracket: {
        bracket_type: bracketType,
        seeding_method: seedingMethod,
        bye_rule: byeRule,
        target_score: 11,
        win_by: 2,
        tiebreaker_rules: DEFAULT_CLUB_TOURNAMENT_CONFIG.bracket.tiebreaker_rules,
        match_scoring: {
          game_format: 'single_game',
          target_score: 11,
          win_by: 2,
        },
      },
      scramble: {
        planned_rounds: parseInt(scrambleRounds, 10) || 5,
        rotation_rule: scrambleRotationRule,
        leaderboard_metric: scrambleLeaderboardMetric,
        target_score: 11,
        win_by: 2,
        match_scoring: {
          game_format: 'single_game',
          target_score: 11,
          win_by: 2,
        },
      },
    };

    try {
      await clubsApi.updateClub(club.id, {
        tournament_configuration: payloadConfig,
      });
      if (onSaved) await onSaved();
      setSaveSuccessMsg('Tournament format configurations saved successfully! New tournaments will inherit these rules.');
      setTimeout(() => setSaveSuccessMsg(null), 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save configuration.';
      Alert.alert('Save Failed', msg);
    } finally {
      setIsSaving(false);
    }
  };

  const FORMAT_TABS: Array<{ key: TournamentFormat; label: string; icon: any }> = [
    { key: 'round_robin', label: 'Round Robin', icon: Trophy },
    { key: 'pool_play', label: 'Pool Play', icon: Layers },
    { key: 'bracket', label: 'Bracket', icon: Zap },
    { key: 'scramble', label: 'Scramble', icon: Users },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Informational Header Card */}
      <Card style={styles.introCard}>
        <View style={styles.introHeader}>
          <Award size={20} color={Colors.brand.primary} />
          <AppText variant="heading3" bold style={styles.introTitle}>
            Club Tournament Configuration
          </AppText>
        </View>
        <AppText variant="caption" color="secondary" style={styles.introText}>
          Configure tournament format defaults once for your club. When creating a tournament, these
          settings are automatically applied so you do not need to configure them repeatedly.
        </AppText>
      </Card>

      {/* Save Success Banner */}
      {saveSuccessMsg && (
        <View style={styles.successBanner}>
          <CheckCircle2 size={18} color="#15803D" />
          <AppText style={styles.successText}>{saveSuccessMsg}</AppText>
        </View>
      )}

      {/* Format Selector Tabs */}
      <View style={styles.formatTabsTrack}>
        {FORMAT_TABS.map((tab) => {
          const isSelected = activeFormat === tab.key;
          const Icon = tab.icon;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.formatTabItem, isSelected && styles.formatTabItemSelected]}
              onPress={() => setActiveFormat(tab.key)}
              activeOpacity={0.8}
            >
              <Icon size={14} color={isSelected ? Colors.brand.primary : Colors.text.tertiary} />
              <AppText
                variant="caption"
                style={[styles.formatTabText, isSelected && styles.formatTabTextSelected]}
              >
                {tab.label}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ─── 1. Round Robin Configuration ────────────────────────────── */}
      {activeFormat === 'round_robin' && (
        <Card style={styles.formatCard}>
          <View style={styles.cardHeaderRow}>
            <Badge label="ROUND ROBIN ENGINE" variant="success" />
            <AppText variant="caption" color="tertiary">
              Full round-robin rotation
            </AppText>
          </View>
          <AppText variant="bodySmall" color="secondary" style={styles.sectionExplanation}>
            Every participant plays against all other entries once. Final positions are calculated
            deterministically from match results.
          </AppText>

          <View style={styles.fieldsGrid}>
            <View style={styles.row}>
              <View style={styles.col}>
                <Input
                  label="Target Score (Points) *"
                  value={rrTargetScore}
                  onChangeText={(v) => setRrTargetScore(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="11"
                  editable={isOwner}
                  error={errors.rrTargetScore}
                  hint="Points needed to win game"
                />
              </View>
              <View style={styles.col}>
                <Input
                  label="Win By Margin *"
                  value={rrWinBy}
                  onChangeText={(v) => setRrWinBy(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="2"
                  editable={isOwner}
                  error={errors.rrWinBy}
                  hint="Lead required to close match"
                />
              </View>
            </View>

            <View style={styles.fullCol}>
              <AppText variant="caption" color="secondary" style={styles.fieldLabel}>
                COURT ALLOCATION PREFERENCE
              </AppText>
              <View style={styles.chipsRow}>
                {[
                  { key: 'all_available', label: 'Use All Active Courts' },
                  { key: 'sequential', label: 'Sequential Allocation' },
                ].map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => isOwner && setRrCourtPref(opt.key)}
                    style={[
                      styles.choiceChip,
                      rrCourtPref === opt.key && styles.choiceChipActive,
                    ]}
                    activeOpacity={0.7}
                  >
                    <AppText
                      variant="caption"
                      style={[
                        styles.choiceChipText,
                        rrCourtPref === opt.key && styles.choiceChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Tiebreaker Rules (Enforced) */}
            <View style={styles.infoCardBox}>
              <AppText variant="caption" bold style={styles.infoBoxTitle}>
                Deterministic Tiebreaker Hierarchy
              </AppText>
              <AppText variant="caption" color="tertiary" style={styles.infoBoxText}>
                1. Total Wins → 2. Point Differential → 3. Total Points Scored → 4. Team Name
              </AppText>
            </View>
          </View>
        </Card>
      )}

      {/* ─── 2. Pool Play Configuration ────────────────────────────── */}
      {activeFormat === 'pool_play' && (
        <Card style={styles.formatCard}>
          <View style={styles.cardHeaderRow}>
            <Badge label="POOL PLAY ENGINE" variant="info" />
            <AppText variant="caption" color="tertiary">
              Groups + Championship Playoff
            </AppText>
          </View>
          <AppText variant="bodySmall" color="secondary" style={styles.sectionExplanation}>
            Participants are divided into groups (pools). Best performers advance into a championship bracket.
          </AppText>

          <View style={styles.fieldsGrid}>
            <View style={styles.row}>
              <View style={styles.col}>
                <Input
                  label="Default Number of Pools *"
                  value={poolCount}
                  onChangeText={(v) => setPoolCount(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="2"
                  editable={isOwner}
                  error={errors.poolCount}
                  hint="Minimum 2 pools"
                />
              </View>
              <View style={styles.col}>
                <Input
                  label="Teams Per Pool *"
                  value={teamsPerPool}
                  onChangeText={(v) => setTeamsPerPool(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="4"
                  editable={isOwner}
                  error={errors.teamsPerPool}
                  hint="Minimum 2 entries per pool"
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.col}>
                <Input
                  label="Qualifiers Per Pool *"
                  value={qualifiersPerPool}
                  onChangeText={(v) => setQualifiersPerPool(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="2"
                  editable={isOwner}
                  error={errors.qualifiersPerPool}
                  hint="Top entries advancing"
                />
              </View>
              <View style={styles.col}>
                <Input
                  label="Playoff Bracket Type"
                  value={poolBracketType}
                  editable={false}
                  hint="Championship stage"
                />
              </View>
            </View>

            <View style={styles.infoCardBox}>
              <AppText variant="caption" bold style={styles.infoBoxTitle}>
                Advancement Structure
              </AppText>
              <AppText variant="caption" color="tertiary" style={styles.infoBoxText}>
                Top {qualifiersPerPool || 2} entries from each pool automatically seed into a Single Elimination championship playoff bracket.
              </AppText>
            </View>
          </View>
        </Card>
      )}

      {/* ─── 3. Bracket Configuration ──────────────────────────────── */}
      {activeFormat === 'bracket' && (
        <Card style={styles.formatCard}>
          <View style={styles.cardHeaderRow}>
            <Badge label="BRACKET ENGINE" variant="default" />
            <AppText variant="caption" color="tertiary">
              Knockout Tournament
            </AppText>
          </View>
          <AppText variant="bodySmall" color="secondary" style={styles.sectionExplanation}>
            Participants compete in elimination matches. Match winners advance to the next round.
          </AppText>

          <View style={styles.fieldsGrid}>
            <View style={styles.fullCol}>
              <AppText variant="caption" color="secondary" style={styles.fieldLabel}>
                DEFAULT BRACKET TYPE
              </AppText>
              <View style={styles.chipsRow}>
                {BRACKET_TYPE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => isOwner && setBracketType(opt)}
                    style={[
                      styles.choiceChip,
                      bracketType === opt && styles.choiceChipActive,
                    ]}
                    activeOpacity={0.7}
                  >
                    <AppText
                      variant="caption"
                      style={[
                        styles.choiceChipText,
                        bracketType === opt && styles.choiceChipTextActive,
                      ]}
                    >
                      {opt}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.fullCol}>
              <AppText variant="caption" color="secondary" style={styles.fieldLabel}>
                SEEDING METHOD
              </AppText>
              <View style={styles.chipsRow}>
                {BRACKET_SEEDING_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => isOwner && setSeedingMethod(opt)}
                    style={[
                      styles.choiceChip,
                      seedingMethod === opt && styles.choiceChipActive,
                    ]}
                    activeOpacity={0.7}
                  >
                    <AppText
                      variant="caption"
                      style={[
                        styles.choiceChipText,
                        seedingMethod === opt && styles.choiceChipTextActive,
                      ]}
                    >
                      {opt}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.fullCol}>
              <AppText variant="caption" color="secondary" style={styles.fieldLabel}>
                NON-POWER-OF-TWO BYES
              </AppText>
              <View style={styles.chipsRow}>
                {BRACKET_BYE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => isOwner && setByeRule(opt)}
                    style={[
                      styles.choiceChip,
                      byeRule === opt && styles.choiceChipActive,
                    ]}
                    activeOpacity={0.7}
                  >
                    <AppText
                      variant="caption"
                      style={[
                        styles.choiceChipText,
                        byeRule === opt && styles.choiceChipTextActive,
                      ]}
                    >
                      {opt}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </Card>
      )}

      {/* ─── 4. Scramble Configuration ─────────────────────────────── */}
      {activeFormat === 'scramble' && (
        <Card style={styles.formatCard}>
          <View style={styles.cardHeaderRow}>
            <Badge label="SCRAMBLE ENGINE" variant="warning" />
            <AppText variant="caption" color="tertiary">
              Rotating Partners Play
            </AppText>
          </View>
          <AppText variant="bodySmall" color="secondary" style={styles.sectionExplanation}>
            Players register individually and rotate partners each round. Points accumulate individually on the standings leaderboard.
          </AppText>

          <View style={styles.fieldsGrid}>
            <View style={styles.col}>
              <Input
                label="Default Planned Rotation Rounds *"
                value={scrambleRounds}
                onChangeText={(v) => setScrambleRounds(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder="5"
                editable={isOwner}
                error={errors.scrambleRounds}
                hint="Recommended: 4 to 6 rounds"
              />
            </View>

            <View style={styles.fullCol}>
              <AppText variant="caption" color="secondary" style={styles.fieldLabel}>
                PARTNER ROTATION RULE
              </AppText>
              <View style={styles.chipsRow}>
                {SCRAMBLE_ROTATION_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => isOwner && setScrambleRotationRule(opt)}
                    style={[
                      styles.choiceChip,
                      scrambleRotationRule === opt && styles.choiceChipActive,
                    ]}
                    activeOpacity={0.7}
                  >
                    <AppText
                      variant="caption"
                      style={[
                        styles.choiceChipText,
                        scrambleRotationRule === opt && styles.choiceChipTextActive,
                      ]}
                    >
                      {opt}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.fullCol}>
              <AppText variant="caption" color="secondary" style={styles.fieldLabel}>
                LEADERBOARD METRIC
              </AppText>
              <View style={styles.chipsRow}>
                {SCRAMBLE_LEADERBOARD_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => isOwner && setScrambleLeaderboardMetric(opt)}
                    style={[
                      styles.choiceChip,
                      scrambleLeaderboardMetric === opt && styles.choiceChipActive,
                    ]}
                    activeOpacity={0.7}
                  >
                    <AppText
                      variant="caption"
                      style={[
                        styles.choiceChipText,
                        scrambleLeaderboardMetric === opt && styles.choiceChipTextActive,
                      ]}
                    >
                      {opt}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </Card>
      )}

      {/* Save Action Button */}
      {isOwner && (
        <View style={styles.actionsContainer}>
          <Button
            label={isSaving ? 'Saving Configurations...' : 'Save Tournament Configurations'}
            variant="primary"
            onPress={handleSave}
            disabled={isSaving}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing[4],
    gap: Spacing[4],
    paddingBottom: Spacing[10],
  },
  introCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    padding: Spacing[4],
    gap: Spacing[2],
  },
  introHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  introTitle: {
    fontSize: 16,
    color: '#065F46',
  },
  introText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#047857',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: Radius.md,
    padding: Spacing[3],
  },
  successText: {
    fontSize: 13,
    color: '#15803D',
    fontWeight: '600',
    flex: 1,
  },
  formatTabsTrack: {
    flexDirection: 'row',
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.lg,
    padding: 3,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  formatTabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing[2] + 2,
    borderRadius: Radius.md,
  },
  formatTabItemSelected: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  formatTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.tertiary,
  },
  formatTabTextSelected: {
    color: Colors.brand.primary,
    fontWeight: '700',
  },
  formatCard: {
    padding: Spacing[4],
    gap: Spacing[3],
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: Radius.lg,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionExplanation: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing[1],
  },
  fieldsGrid: {
    gap: Spacing[3],
  },
  row: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  col: {
    flex: 1,
  },
  fullCol: {
    width: '100%',
    gap: Spacing[1],
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  choiceChip: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.default,
  },
  choiceChipActive: {
    borderColor: Colors.brand.primary,
    backgroundColor: 'rgba(8, 120, 94, 0.08)',
  },
  choiceChipText: {
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  choiceChipTextActive: {
    color: Colors.brand.primary,
    fontWeight: '700',
  },
  infoCardBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.md,
    padding: Spacing[3],
    gap: 4,
    marginTop: Spacing[1],
  },
  infoBoxTitle: {
    fontSize: 12,
    color: Colors.text.primary,
  },
  infoBoxText: {
    fontSize: 11,
    lineHeight: 16,
  },
  actionsContainer: {
    marginTop: Spacing[2],
  },
});
