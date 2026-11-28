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
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { ClubResponsiveContainer, ClubSectionCard } from './ClubDetailsUI';
import { clubsApi } from '@/services/api/clubs';
import { Radius, Shadows, Spacing } from '@/theme';
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
    court_allocation_preference: 'all_available',
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
    court_allocation_preference: 'all_available',
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
    court_allocation_preference: 'all_available',
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
  const { width: windowWidth } = useWindowDimensions();
  const isWideFormatBar = windowWidth >= 560;
  const [activeFormat, setActiveFormat] = useState<TournamentFormat>('round_robin');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Form states per format
  // 1. Round Robin
  const [rrTargetScore, setRrTargetScore] = useState('11');
  const [rrWinBy, setRrWinBy] = useState('2');
  const [rrCourtPref, setRrCourtPref] = useState('all_available');

  // 2. Pool Play
  const [poolCount, setPoolCount] = useState('2');
  const [teamsPerPool, setTeamsPerPool] = useState('4');
  const [qualifiersPerPool, setQualifiersPerPool] = useState('2');
  const [poolBracketType, setPoolBracketType] = useState('Single Elimination');
  const [ppCourtPref, setPpCourtPref] = useState('all_available');
  const [ppTargetScore, setPpTargetScore] = useState('11');
  const [ppWinBy, setPpWinBy] = useState('2');

  // 3. Bracket
  const [bracketType, setBracketType] = useState<string>('Single Elimination');
  const [seedingMethod, setSeedingMethod] = useState<string>(BRACKET_SEEDING_OPTIONS[0]);
  const [byeRule, setByeRule] = useState<string>(BRACKET_BYE_OPTIONS[0]);
  const [brCourtPref, setBrCourtPref] = useState('all_available');
  const [brTargetScore, setBrTargetScore] = useState('11');
  const [brWinBy, setBrWinBy] = useState('2');

  // 4. Scramble
  const [scrambleRounds, setScrambleRounds] = useState('5');
  const [scrambleRotationRule, setScrambleRotationRule] = useState<string>(SCRAMBLE_ROTATION_OPTIONS[0]);
  const [scrambleLeaderboardMetric, setScrambleLeaderboardMetric] = useState<string>(SCRAMBLE_LEADERBOARD_OPTIONS[0]);
  const [scCourtPref, setScCourtPref] = useState('all_available');
  const [scTargetScore, setScTargetScore] = useState('11');
  const [scWinBy, setScWinBy] = useState('2');

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
    setPpCourtPref(pp.court_allocation_preference || 'all_available');
    setPpTargetScore(String(pp.target_score ?? 11));
    setPpWinBy(String(pp.win_by ?? 2));

    setBracketType(br.bracket_type || 'Single Elimination');
    setSeedingMethod(br.seeding_method || BRACKET_SEEDING_OPTIONS[0]);
    setByeRule(br.bye_rule || BRACKET_BYE_OPTIONS[0]);
    setBrCourtPref(br.court_allocation_preference || 'all_available');
    setBrTargetScore(String(br.target_score ?? 11));
    setBrWinBy(String(br.win_by ?? 2));

    setScrambleRounds(String(sc.planned_rounds ?? 5));
    setScrambleRotationRule(sc.rotation_rule || SCRAMBLE_ROTATION_OPTIONS[0]);
    setScrambleLeaderboardMetric(sc.leaderboard_metric || SCRAMBLE_LEADERBOARD_OPTIONS[0]);
    setScCourtPref(sc.court_allocation_preference || 'all_available');
    setScTargetScore(String(sc.target_score ?? 11));
    setScWinBy(String(sc.win_by ?? 2));
  }, [club]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    // Round Robin validation
    const rrScore = parseInt(rrTargetScore, 10);
    const rrW = parseInt(rrWinBy, 10);
    if (isNaN(rrScore) || rrScore < 1) errs.rrTargetScore = 'Target score must be at least 1.';
    if (isNaN(rrW) || rrW < 1) errs.rrWinBy = 'Win by points must be at least 1.';

    // Pool Play validation
    const ppScore = parseInt(ppTargetScore, 10);
    const ppW = parseInt(ppWinBy, 10);
    if (isNaN(ppScore) || ppScore < 1) errs.ppTargetScore = 'Target score must be at least 1.';
    if (isNaN(ppW) || ppW < 1) errs.ppWinBy = 'Win by points must be at least 1.';

    // Bracket validation
    const brScore = parseInt(brTargetScore, 10);
    const brW = parseInt(brWinBy, 10);
    if (isNaN(brScore) || brScore < 1) errs.brTargetScore = 'Target score must be at least 1.';
    if (isNaN(brW) || brW < 1) errs.brWinBy = 'Win by points must be at least 1.';

    // Scramble validation
    const scScore = parseInt(scTargetScore, 10);
    const scW = parseInt(scWinBy, 10);
    if (isNaN(scScore) || scScore < 1) errs.scTargetScore = 'Target score must be at least 1.';
    if (isNaN(scW) || scW < 1) errs.scWinBy = 'Win by points must be at least 1.';

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
        target_score: parseInt(ppTargetScore, 10) || 11,
        win_by: parseInt(ppWinBy, 10) || 2,
        court_allocation_preference: ppCourtPref,
        advancement_rule: 'top_per_pool',
        tiebreaker_rules: DEFAULT_CLUB_TOURNAMENT_CONFIG.pool_play.tiebreaker_rules,
        match_scoring: {
          game_format: 'single_game',
          target_score: parseInt(ppTargetScore, 10) || 11,
          win_by: parseInt(ppWinBy, 10) || 2,
        },
      },
      bracket: {
        bracket_type: bracketType,
        seeding_method: seedingMethod,
        bye_rule: byeRule,
        target_score: parseInt(brTargetScore, 10) || 11,
        win_by: parseInt(brWinBy, 10) || 2,
        court_allocation_preference: brCourtPref,
        tiebreaker_rules: DEFAULT_CLUB_TOURNAMENT_CONFIG.bracket.tiebreaker_rules,
        match_scoring: {
          game_format: 'single_game',
          target_score: parseInt(brTargetScore, 10) || 11,
          win_by: parseInt(brWinBy, 10) || 2,
        },
      },
      scramble: {
        planned_rounds: parseInt(scrambleRounds, 10) || 5,
        rotation_rule: scrambleRotationRule,
        leaderboard_metric: scrambleLeaderboardMetric,
        target_score: parseInt(scTargetScore, 10) || 11,
        win_by: parseInt(scWinBy, 10) || 2,
        court_allocation_preference: scCourtPref,
        match_scoring: {
          game_format: 'single_game',
          target_score: parseInt(scTargetScore, 10) || 11,
          win_by: parseInt(scWinBy, 10) || 2,
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

  const COURT_ALLOCATION_OPTIONS = [
    { key: 'all_available', label: 'Use All Active Courts' },
    { key: 'sequential', label: 'Sequential Allocation' },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <ClubResponsiveContainer style={styles.responsiveStack}>
        {/* Save Success Banner */}
        {saveSuccessMsg && (
          <View style={styles.successBanner}>
            <CheckCircle2 size={16} color="#15803D" />
            <AppText style={styles.successText}>{saveSuccessMsg}</AppText>
          </View>
        )}

        {/* Format Selector */}
        <View style={[styles.formatTrack, isWideFormatBar && styles.formatTrackSingleRow]}>
          {[
            { key: 'round_robin', label: 'Round Robin' },
            { key: 'pool_play', label: 'Pool Play' },
            { key: 'bracket', label: 'Bracket' },
            { key: 'scramble', label: 'Scramble' },
          ].map((fmt) => {
            const isSelected = activeFormat === fmt.key;
            return (
              <TouchableOpacity
                key={fmt.key}
                style={[
                  styles.formatBtn,
                  isWideFormatBar ? styles.formatBtnWide : styles.formatBtnCompact,
                  isSelected && styles.formatBtnSelected,
                ]}
                onPress={() => setActiveFormat(fmt.key as TournamentFormat)}
                activeOpacity={0.8}
              >
                <AppText
                  style={[
                    styles.formatBtnText,
                    isSelected && styles.formatBtnTextSelected,
                  ]}
                >
                  {fmt.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 1. Round Robin Configuration */}
        {activeFormat === 'round_robin' && (
          <ClubSectionCard
            title="Round Robin Defaults"
            subtitle="Every participant plays against all other entries once."
          >
            <View style={styles.sectionBlock}>
              <AppText style={styles.sectionTitle}>Match Scoring</AppText>
              <View style={styles.row}>
                <View style={styles.col}>
                  <Input
                    label="Target Score *"
                    value={rrTargetScore}
                    onChangeText={(v) => setRrTargetScore(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="11"
                    editable={isOwner}
                    error={errors.rrTargetScore}
                    hint="Points to win"
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
                    hint="Lead required"
                  />
                </View>
              </View>
            </View>

            <View style={styles.sectionDivider} />

            <View style={styles.sectionBlock}>
              <AppText style={styles.sectionTitle}>Court Allocation</AppText>
              <View style={styles.chipsRow}>
                {COURT_ALLOCATION_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => isOwner && setRrCourtPref(opt.key)}
                    style={[
                      styles.choiceChip,
                      rrCourtPref === opt.key && styles.choiceChipActive,
                    ]}
                    activeOpacity={0.75}
                  >
                    <AppText
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

            <View style={styles.sectionDivider} />

            <View style={styles.sectionBlock}>
              <AppText style={styles.sectionTitle}>Tiebreaker Order</AppText>
              <AppText style={styles.helperNote}>
                1. Total Wins  →  2. Point Diff  →  3. Points Scored  →  4. Team Name
              </AppText>
            </View>
          </ClubSectionCard>
        )}

        {/* 2. Pool Play Configuration */}
        {activeFormat === 'pool_play' && (
          <ClubSectionCard
            title="Pool Play Defaults"
            subtitle="Pool groups followed by a championship playoff bracket."
          >
            <View style={styles.sectionBlock}>
              <AppText style={styles.sectionTitle}>Match Scoring</AppText>
              <View style={styles.row}>
                <View style={styles.col}>
                  <Input
                    label="Target Score *"
                    value={ppTargetScore}
                    onChangeText={(v) => setPpTargetScore(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="11"
                    editable={isOwner}
                    error={errors.ppTargetScore}
                    hint="Points to win"
                  />
                </View>
                <View style={styles.col}>
                  <Input
                    label="Win By Margin *"
                    value={ppWinBy}
                    onChangeText={(v) => setPpWinBy(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="2"
                    editable={isOwner}
                    error={errors.ppWinBy}
                    hint="Lead required"
                  />
                </View>
              </View>
            </View>

            <View style={styles.sectionDivider} />

            <View style={styles.sectionBlock}>
              <AppText style={styles.sectionTitle}>Court Allocation</AppText>
              <View style={styles.chipsRow}>
                {COURT_ALLOCATION_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => isOwner && setPpCourtPref(opt.key)}
                    style={[
                      styles.choiceChip,
                      ppCourtPref === opt.key && styles.choiceChipActive,
                    ]}
                    activeOpacity={0.75}
                  >
                    <AppText
                      style={[
                        styles.choiceChipText,
                        ppCourtPref === opt.key && styles.choiceChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.sectionDivider} />

            <View style={styles.sectionBlock}>
              <AppText style={styles.sectionTitle}>Pools & Tiebreakers</AppText>
              <AppText style={styles.helperNote}>
                Pool sizes and qualifiers are configured per tournament in Setup & Courts. Pool ties resolve by Wins → Point Diff → Points Scored → Name.
              </AppText>
            </View>
          </ClubSectionCard>
        )}

        {/* 3. Bracket Configuration */}
        {activeFormat === 'bracket' && (
          <ClubSectionCard
            title="Bracket Defaults"
            subtitle="Single or double elimination playoff brackets."
          >
            <View style={styles.sectionBlock}>
              <AppText style={styles.sectionTitle}>Bracket Type</AppText>
              <View style={styles.chipsRow}>
                {BRACKET_TYPE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => isOwner && setBracketType(opt)}
                    style={[
                      styles.choiceChip,
                      bracketType === opt && styles.choiceChipActive,
                    ]}
                    activeOpacity={0.75}
                  >
                    <AppText
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

            <View style={styles.sectionDivider} />

            <View style={styles.sectionBlock}>
              <AppText style={styles.sectionTitle}>Seeding Method</AppText>
              <View style={styles.chipsRow}>
                {BRACKET_SEEDING_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => isOwner && setSeedingMethod(opt)}
                    style={[
                      styles.choiceChip,
                      seedingMethod === opt && styles.choiceChipActive,
                    ]}
                    activeOpacity={0.75}
                  >
                    <AppText
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

            <View style={styles.sectionDivider} />

            <View style={styles.sectionBlock}>
              <AppText style={styles.sectionTitle}>Byes & Advancement</AppText>
              <View style={styles.chipsRow}>
                {BRACKET_BYE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => isOwner && setByeRule(opt)}
                    style={[
                      styles.choiceChip,
                      byeRule === opt && styles.choiceChipActive,
                    ]}
                    activeOpacity={0.75}
                  >
                    <AppText
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

            <View style={styles.sectionDivider} />

            <View style={styles.sectionBlock}>
              <AppText style={styles.sectionTitle}>Court Allocation</AppText>
              <View style={styles.chipsRow}>
                {COURT_ALLOCATION_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => isOwner && setBrCourtPref(opt.key)}
                    style={[
                      styles.choiceChip,
                      brCourtPref === opt.key && styles.choiceChipActive,
                    ]}
                    activeOpacity={0.75}
                  >
                    <AppText
                      style={[
                        styles.choiceChipText,
                        brCourtPref === opt.key && styles.choiceChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.sectionDivider} />

            <View style={styles.sectionBlock}>
              <AppText style={styles.sectionTitle}>Match Scoring</AppText>
              <View style={styles.row}>
                <View style={styles.col}>
                  <Input
                    label="Target Score *"
                    value={brTargetScore}
                    onChangeText={(v) => setBrTargetScore(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="11"
                    editable={isOwner}
                    error={errors.brTargetScore}
                    hint="Points to win"
                  />
                </View>
                <View style={styles.col}>
                  <Input
                    label="Win By Margin *"
                    value={brWinBy}
                    onChangeText={(v) => setBrWinBy(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="2"
                    editable={isOwner}
                    error={errors.brWinBy}
                    hint="Lead required"
                  />
                </View>
              </View>
            </View>
          </ClubSectionCard>
        )}

        {/* 4. Scramble Configuration */}
        {activeFormat === 'scramble' && (
          <ClubSectionCard
            title="Scramble Defaults"
            subtitle="Individual registration with partner rotation per round."
          >
            <View style={styles.sectionBlock}>
              <AppText style={styles.sectionTitle}>Rotation Rules</AppText>
              <View style={styles.chipsRow}>
                {SCRAMBLE_ROTATION_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => isOwner && setScrambleRotationRule(opt)}
                    style={[
                      styles.choiceChip,
                      scrambleRotationRule === opt && styles.choiceChipActive,
                    ]}
                    activeOpacity={0.75}
                  >
                    <AppText
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

            <View style={styles.sectionDivider} />

            <View style={styles.sectionBlock}>
              <AppText style={styles.sectionTitle}>Leaderboard & Scoring</AppText>
              <View style={styles.chipsRow}>
                {SCRAMBLE_LEADERBOARD_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => isOwner && setScrambleLeaderboardMetric(opt)}
                    style={[
                      styles.choiceChip,
                      scrambleLeaderboardMetric === opt && styles.choiceChipActive,
                    ]}
                    activeOpacity={0.75}
                  >
                    <AppText
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

            <View style={styles.sectionDivider} />

            <View style={styles.sectionBlock}>
              <AppText style={styles.sectionTitle}>Court Allocation</AppText>
              <View style={styles.chipsRow}>
                {COURT_ALLOCATION_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => isOwner && setScCourtPref(opt.key)}
                    style={[
                      styles.choiceChip,
                      scCourtPref === opt.key && styles.choiceChipActive,
                    ]}
                    activeOpacity={0.75}
                  >
                    <AppText
                      style={[
                        styles.choiceChipText,
                        scCourtPref === opt.key && styles.choiceChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.sectionDivider} />

            <View style={styles.sectionBlock}>
              <AppText style={styles.sectionTitle}>Match Scoring</AppText>
              <View style={styles.row}>
                <View style={styles.col}>
                  <Input
                    label="Target Score *"
                    value={scTargetScore}
                    onChangeText={(v) => setScTargetScore(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="11"
                    editable={isOwner}
                    error={errors.scTargetScore}
                    hint="Points to win"
                  />
                </View>
                <View style={styles.col}>
                  <Input
                    label="Win By Margin *"
                    value={scWinBy}
                    onChangeText={(v) => setScWinBy(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="2"
                    editable={isOwner}
                    error={errors.scWinBy}
                    hint="Lead required"
                  />
                </View>
              </View>
            </View>
          </ClubSectionCard>
        )}

        {/* Save Action Button */}
        {isOwner && (
          <View style={styles.actionsContainer}>
            <Button
              label={isSaving ? 'Saving Configuration...' : 'Save Configuration'}
              variant="primary"
              onPress={handleSave}
              disabled={isSaving}
            />
          </View>
        )}
      </ClubResponsiveContainer>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F8F5',
  },
  contentContainer: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[1],
    paddingBottom: 96,
  },
  responsiveStack: {
    gap: Spacing[3],
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
  formatTrack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: '#E2EAE6',
    ...Shadows.sm,
  },
  formatTrackSingleRow: {
    flexWrap: 'nowrap',
  },
  formatBtn: {
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
    minHeight: 38,
  },
  formatBtnWide: {
    flex: 1,
  },
  formatBtnCompact: {
    width: '49%',
    flexGrow: 1,
  },
  formatBtnSelected: {
    backgroundColor: '#176B57',
  },
  formatBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#425C57',
    textAlign: 'center',
  },
  formatBtnTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#F0F4F2',
    marginVertical: Spacing[1],
  },
  sectionBlock: {
    gap: Spacing[2],
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#102B2A',
  },
  helperNote: {
    fontSize: 12.5,
    lineHeight: 18,
    color: '#5C726D',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  col: {
    flex: 1,
    minWidth: 0,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#D6E4DD',
    backgroundColor: '#F9FBFA',
  },
  choiceChipActive: {
    borderColor: '#176B57',
    backgroundColor: '#E7F5EE',
  },
  choiceChipText: {
    color: '#425C57',
    fontWeight: '600',
    fontSize: 12.5,
  },
  choiceChipTextActive: {
    color: '#102B2A',
    fontWeight: '700',
  },
  actionsContainer: {
    marginTop: Spacing[1],
  },
});
