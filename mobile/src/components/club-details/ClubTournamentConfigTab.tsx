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
  Trophy,
  Users,
  Zap,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
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
    const sRounds = scrambleRounds.trim() ? parseInt(scrambleRounds, 10) : 5;
    const scScore = parseInt(scTargetScore, 10);
    const scW = parseInt(scWinBy, 10);
    if (!isNaN(sRounds) && (sRounds < 1 || sRounds > 20)) errs.scrambleRounds = 'Rounds must be between 1 and 20.';
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
      {/* 1. Simplified Introduction Card */}
      <Card style={styles.introCard}>
        <View style={styles.introHeader}>
          <Award size={18} color="#176B57" />
          <AppText style={styles.introTitle}>
            Club Tournament Configuration
          </AppText>
        </View>
        <AppText style={styles.introText}>
          Set your club's default tournament settings. These will be applied automatically when you create tournaments.
        </AppText>
      </Card>

      {/* Save Success Banner */}
      {saveSuccessMsg && (
        <View style={styles.successBanner}>
          <CheckCircle2 size={18} color="#15803D" />
          <AppText style={styles.successText}>{saveSuccessMsg}</AppText>
        </View>
      )}

      {/* 2. Tournament Format Selector: 2x2 Grid */}
      <View style={styles.formatSelectorContainer}>
        <View style={styles.formatSelectorRow}>
          <TouchableOpacity
            style={[
              styles.formatBtn,
              activeFormat === 'round_robin' && styles.formatBtnSelected,
            ]}
            onPress={() => setActiveFormat('round_robin')}
            activeOpacity={0.8}
          >
            <Trophy
              size={16}
              color={activeFormat === 'round_robin' ? '#FFFFFF' : '#176B57'}
              strokeWidth={activeFormat === 'round_robin' ? 2.2 : 1.8}
            />
            <AppText
              style={[
                styles.formatBtnText,
                activeFormat === 'round_robin' && styles.formatBtnTextSelected,
              ]}
            >
              Round Robin
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.formatBtn,
              activeFormat === 'pool_play' && styles.formatBtnSelected,
            ]}
            onPress={() => setActiveFormat('pool_play')}
            activeOpacity={0.8}
          >
            <Layers
              size={16}
              color={activeFormat === 'pool_play' ? '#FFFFFF' : '#176B57'}
              strokeWidth={activeFormat === 'pool_play' ? 2.2 : 1.8}
            />
            <AppText
              style={[
                styles.formatBtnText,
                activeFormat === 'pool_play' && styles.formatBtnTextSelected,
              ]}
            >
              Pool Play
            </AppText>
          </TouchableOpacity>
        </View>

        <View style={styles.formatSelectorRow}>
          <TouchableOpacity
            style={[
              styles.formatBtn,
              activeFormat === 'bracket' && styles.formatBtnSelected,
            ]}
            onPress={() => setActiveFormat('bracket')}
            activeOpacity={0.8}
          >
            <Zap
              size={16}
              color={activeFormat === 'bracket' ? '#FFFFFF' : '#176B57'}
              strokeWidth={activeFormat === 'bracket' ? 2.2 : 1.8}
            />
            <AppText
              style={[
                styles.formatBtnText,
                activeFormat === 'bracket' && styles.formatBtnTextSelected,
              ]}
            >
              Bracket
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.formatBtn,
              activeFormat === 'scramble' && styles.formatBtnSelected,
            ]}
            onPress={() => setActiveFormat('scramble')}
            activeOpacity={0.8}
          >
            <Users
              size={16}
              color={activeFormat === 'scramble' ? '#FFFFFF' : '#176B57'}
              strokeWidth={activeFormat === 'scramble' ? 2.2 : 1.8}
            />
            <AppText
              style={[
                styles.formatBtnText,
                activeFormat === 'scramble' && styles.formatBtnTextSelected,
              ]}
            >
              Scramble
            </AppText>
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── 1. Round Robin Configuration ────────────────────────────── */}
      {activeFormat === 'round_robin' && (
        <Card style={styles.formatCard}>
          {/* Format Summary Header */}
          <View style={styles.formatHeaderRow}>
            <View style={styles.formatIconCircle}>
              <Trophy size={18} color="#176B57" />
            </View>
            <View style={styles.formatHeaderTextCol}>
              <AppText style={styles.formatHeaderTitle}>Round Robin Setup</AppText>
              <AppText style={styles.formatHeaderDesc}>
                Every participant plays against all other entries once.
              </AppText>
            </View>
          </View>

          <View style={styles.sectionDivider} />

          {/* Section: Match Scoring */}
          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>Match Scoring</AppText>
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
          </View>

          <View style={styles.sectionDivider} />

          {/* Section: Court Allocation */}
          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>Court Allocation</AppText>
            <AppText style={styles.sectionSubtitle}>
              Determine how active club courts are assigned across tournament rounds.
            </AppText>
            <View style={styles.chipsRow}>
              {COURT_ALLOCATION_OPTIONS.map((opt) => (
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

          {/* Section: Tiebreaker Rules */}
          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>Deterministic Tiebreaker Hierarchy</AppText>
            <View style={styles.infoCardBox}>
              <AppText style={styles.infoBoxText}>
                Ties in standings are resolved strictly in this order: Total Wins → Point Differential → Total Points Scored → Team Name.
              </AppText>
            </View>
          </View>
        </Card>
      )}

      {/* ─── 2. Pool Play Configuration ────────────────────────────── */}
      {activeFormat === 'pool_play' && (
        <Card style={styles.formatCard}>
          {/* Format Summary Header */}
          <View style={styles.formatHeaderRow}>
            <View style={styles.formatIconCircle}>
              <Layers size={18} color="#176B57" />
            </View>
            <View style={styles.formatHeaderTextCol}>
              <AppText style={styles.formatHeaderTitle}>Pool Play Setup</AppText>
              <AppText style={styles.formatHeaderDesc}>
                Participants are divided into pools, followed by a championship bracket.
              </AppText>
            </View>
          </View>

          <View style={styles.sectionDivider} />

          {/* Section: Tournament Pool & Playoff Setup Notice */}
          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>Tournament Pool & Bracket Setup</AppText>
            <View style={styles.infoCardBox}>
              <AppText style={styles.infoBoxText}>
                Pool counts, teams per pool, playoff qualifiers, and championship bracket types are configured dynamically for each tournament in its Setup & Courts section after registration closes, based on actual confirmed participants.
              </AppText>
            </View>
          </View>

          <View style={styles.sectionDivider} />

          {/* Section: Court Allocation */}
          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>Court Allocation</AppText>
            <AppText style={styles.sectionSubtitle}>
              Determine how active club courts are assigned across tournament pools.
            </AppText>
            <View style={styles.chipsRow}>
              {COURT_ALLOCATION_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => isOwner && setPpCourtPref(opt.key)}
                  style={[
                    styles.choiceChip,
                    ppCourtPref === opt.key && styles.choiceChipActive,
                  ]}
                  activeOpacity={0.7}
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

          {/* Section: Match Scoring */}
          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>Match Scoring</AppText>
            <View style={styles.row}>
              <View style={styles.col}>
                <Input
                  label="Target Score (Points) *"
                  value={ppTargetScore}
                  onChangeText={(v) => setPpTargetScore(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="11"
                  editable={isOwner}
                  error={errors.ppTargetScore}
                  hint="Points needed to win game"
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
                  hint="Lead required to close match"
                />
              </View>
            </View>
          </View>

          <View style={styles.sectionDivider} />

          {/* Section: Tiebreaker Rules */}
          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>Advancement & Tiebreaker Rules</AppText>
            <View style={styles.infoCardBox}>
              <AppText style={styles.infoBoxText}>
                Top qualifying entries from each pool seed into the championship playoff bracket. Ties within a pool are resolved by Total Wins → Point Differential → Total Points Scored → Team Name.
              </AppText>
            </View>
          </View>
        </Card>
      )}

      {/* ─── 3. Bracket Configuration ──────────────────────────────── */}
      {activeFormat === 'bracket' && (
        <Card style={styles.formatCard}>
          {/* Format Summary Header */}
          <View style={styles.formatHeaderRow}>
            <View style={styles.formatIconCircle}>
              <Zap size={18} color="#176B57" />
            </View>
            <View style={styles.formatHeaderTextCol}>
              <AppText style={styles.formatHeaderTitle}>Bracket Setup</AppText>
              <AppText style={styles.formatHeaderDesc}>
                Participants compete in single or double elimination bracket rounds.
              </AppText>
            </View>
          </View>

          <View style={styles.sectionDivider} />

          {/* Section: Bracket Type */}
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
                  activeOpacity={0.7}
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

          {/* Section: Seeding Method */}
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
                  activeOpacity={0.7}
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

          {/* Section: Byes and Advancement */}
          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>Byes and Advancement</AppText>
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

          {/* Section: Court Allocation */}
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
                  activeOpacity={0.7}
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

          {/* Section: Match Scoring */}
          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>Match Scoring</AppText>
            <View style={styles.row}>
              <View style={styles.col}>
                <Input
                  label="Target Score (Points) *"
                  value={brTargetScore}
                  onChangeText={(v) => setBrTargetScore(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="11"
                  editable={isOwner}
                  error={errors.brTargetScore}
                  hint="Points needed to win game"
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
                  hint="Lead required to close match"
                />
              </View>
            </View>
          </View>
        </Card>
      )}

      {/* ─── 4. Scramble Configuration ─────────────────────────────── */}
      {activeFormat === 'scramble' && (
        <Card style={styles.formatCard}>
          {/* Format Summary Header */}
          <View style={styles.formatHeaderRow}>
            <View style={styles.formatIconCircle}>
              <Users size={18} color="#176B57" />
            </View>
            <View style={styles.formatHeaderTextCol}>
              <AppText style={styles.formatHeaderTitle}>Scramble Setup</AppText>
              <AppText style={styles.formatHeaderDesc}>
                Players register individually and rotate partners each round.
              </AppText>
            </View>
          </View>

          <View style={styles.sectionDivider} />

          {/* Section: Number of Rounds */}
          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>Number of Rounds</AppText>
            <View style={styles.infoCardBox}>
              <AppText style={styles.infoBoxText}>
                Post-Registration Workflow: Rotation rounds are calculated and recommended post-registration based on actual confirmed player count and courts. The value below acts as a baseline default.
              </AppText>
            </View>
            <Input
              label="Baseline Rotation Rounds"
              value={scrambleRounds}
              onChangeText={(v) => setScrambleRounds(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="5"
              editable={isOwner}
              error={errors.scrambleRounds}
              hint="Baseline default; finalized post-registration based on actual roster"
            />
          </View>

          <View style={styles.sectionDivider} />

          {/* Section: Rotation Rules */}
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
                  activeOpacity={0.7}
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

          {/* Section: Leaderboard and Scoring */}
          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>Leaderboard and Scoring</AppText>
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

          {/* Section: Court Allocation */}
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
                  activeOpacity={0.7}
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

          {/* Section: Match Scoring */}
          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>Match Scoring</AppText>
            <View style={styles.row}>
              <View style={styles.col}>
                <Input
                  label="Target Score (Points) *"
                  value={scTargetScore}
                  onChangeText={(v) => setScTargetScore(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="11"
                  editable={isOwner}
                  error={errors.scTargetScore}
                  hint="Points needed to win game"
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
                  hint="Lead required to close match"
                />
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
    gap: 12,
    paddingBottom: Spacing[10],
  },
  introCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  introHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  introTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#065F46',
  },
  introText: {
    fontSize: 12.5,
    lineHeight: 17,
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

  // Format Selector 2x2 Grid
  formatSelectorContainer: {
    gap: 8,
    width: '100%',
  },
  formatSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  formatBtn: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2EAE6',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  formatBtnSelected: {
    backgroundColor: '#0F392D',
    borderColor: '#0F392D',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  formatBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#102B2A',
    textAlign: 'center',
  },
  formatBtnTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Format Configuration Card
  formatCard: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAE6',
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  formatHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 2,
  },
  formatIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#E8F5EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formatHeaderTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  formatHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102B2A',
  },
  formatHeaderDesc: {
    fontSize: 12.5,
    color: '#64748B',
    lineHeight: 16,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },

  // Section Blocks
  sectionBlock: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102B2A',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
    marginTop: -2,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
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
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2EAE6',
    backgroundColor: '#FFFFFF',
  },
  choiceChipActive: {
    borderColor: '#176B57',
    backgroundColor: '#E8F5EE',
  },
  choiceChipText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 12.5,
  },
  choiceChipTextActive: {
    color: '#0F392D',
    fontWeight: '700',
  },
  infoCardBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    marginTop: 2,
  },
  infoBoxText: {
    fontSize: 12,
    lineHeight: 17,
    color: '#475569',
  },
  actionsContainer: {
    marginTop: Spacing[2],
  },
});
