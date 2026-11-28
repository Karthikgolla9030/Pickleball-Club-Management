/**
 * Aught2 Pickleball — Club Tournament Configuration Tab
 *
 * Location: Club Side → Club Details → Tournament Configuration
 * Allows club owners to configure default engine rules, scoring, and preferences
 * independently for all four tournament formats (Round Robin, Pool Play, Bracket, Scramble).
 *
 * Lifecycle per format (backed strictly by saved `club.tournament_configuration[format]`):
 *   1. Not saved → Editable fields + "Save Configuration"
 *   2. Saved     → Read-only fields + "Configuration Saved" status + "Edit Configuration"
 *   3. Editing   → Editable fields + "Save Changes" & "Cancel" (restores last saved config)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { CheckCircle2, Pencil } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { ClubResponsiveContainer, ClubSectionCard } from './ClubDetailsUI';
import { useClubDetails } from '@/hooks';
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

const COURT_ALLOCATION_OPTIONS = [
  { key: 'all_available', label: 'Use All Active Courts' },
  { key: 'sequential', label: 'Sequential Allocation' },
];

function getSavedFormatEntry(
  club: Club,
  fmt: TournamentFormat,
): Record<string, unknown> | null {
  const tc = club.tournament_configuration as Record<string, unknown> | null | undefined;
  const raw = tc?.[fmt];
  if (raw && typeof raw === 'object' && Object.keys(raw as Record<string, unknown>).length > 0) {
    return raw as Record<string, unknown>;
  }
  return null;
}

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
  const { updateClub } = useClubDetails(club.id);

  const [activeFormat, setActiveFormat] = useState<TournamentFormat>('round_robin');
  const [isSaving, setIsSaving] = useState(false);

  // Tracks which SAVED formats are currently in explicit Edit mode
  const [editingFormats, setEditingFormats] = useState<Record<TournamentFormat, boolean>>({
    round_robin: false,
    pool_play: false,
    bracket: false,
    scramble: false,
  });

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

  // Validation errors scoped by field name
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Hydrate one specific format's fields from saved backend config (or factory defaults if unsaved)
  const applyFormatFieldsFromClub = useCallback(
    (fmt: TournamentFormat, sourceClub: Club) => {
      const saved = getSavedFormatEntry(sourceClub, fmt);
      if (fmt === 'round_robin') {
        const rr = (saved || DEFAULT_CLUB_TOURNAMENT_CONFIG.round_robin) as Record<string, unknown>;
        setRrTargetScore(String(rr.target_score ?? 11));
        setRrWinBy(String(rr.win_by ?? 2));
        setRrCourtPref(String(rr.court_allocation_preference || 'all_available'));
      } else if (fmt === 'pool_play') {
        const pp = (saved || DEFAULT_CLUB_TOURNAMENT_CONFIG.pool_play) as Record<string, unknown>;
        setPoolCount(String(pp.pool_count ?? 2));
        setTeamsPerPool(String(pp.teams_per_pool ?? 4));
        setQualifiersPerPool(String(pp.qualifiers_per_pool ?? 2));
        setPoolBracketType(String(pp.pool_bracket_type || 'Single Elimination'));
        setPpCourtPref(String(pp.court_allocation_preference || 'all_available'));
        setPpTargetScore(String(pp.target_score ?? 11));
        setPpWinBy(String(pp.win_by ?? 2));
      } else if (fmt === 'bracket') {
        const br = (saved || DEFAULT_CLUB_TOURNAMENT_CONFIG.bracket) as Record<string, unknown>;
        setBracketType(String(br.bracket_type || 'Single Elimination'));
        setSeedingMethod(String(br.seeding_method || BRACKET_SEEDING_OPTIONS[0]));
        setByeRule(String(br.bye_rule || BRACKET_BYE_OPTIONS[0]));
        setBrCourtPref(String(br.court_allocation_preference || 'all_available'));
        setBrTargetScore(String(br.target_score ?? 11));
        setBrWinBy(String(br.win_by ?? 2));
      } else if (fmt === 'scramble') {
        const sc = (saved || DEFAULT_CLUB_TOURNAMENT_CONFIG.scramble) as Record<string, unknown>;
        setScrambleRounds(String(sc.planned_rounds ?? 5));
        setScrambleRotationRule(String(sc.rotation_rule || SCRAMBLE_ROTATION_OPTIONS[0]));
        setScrambleLeaderboardMetric(String(sc.leaderboard_metric || SCRAMBLE_LEADERBOARD_OPTIONS[0]));
        setScCourtPref(String(sc.court_allocation_preference || 'all_available'));
        setScTargetScore(String(sc.target_score ?? 11));
        setScWinBy(String(sc.win_by ?? 2));
      }
    },
    [],
  );

  const prevClubIdRef = useRef<string | null>(null);
  const prevSavedSnapshotRef = useRef<Partial<Record<TournamentFormat, string>>>({});

  // Sync only when switching clubs OR when a format's persisted backend config changes
  useEffect(() => {
    const formats: TournamentFormat[] = ['round_robin', 'pool_play', 'bracket', 'scramble'];
    if (prevClubIdRef.current !== club.id) {
      prevClubIdRef.current = club.id;
      setEditingFormats({
        round_robin: false,
        pool_play: false,
        bracket: false,
        scramble: false,
      });
      setErrors({});
      const nextSnap: Partial<Record<TournamentFormat, string>> = {};
      formats.forEach((fmt) => {
        const saved = getSavedFormatEntry(club, fmt);
        nextSnap[fmt] = saved ? JSON.stringify(saved) : '';
        applyFormatFieldsFromClub(fmt, club);
      });
      prevSavedSnapshotRef.current = nextSnap;
      return;
    }

    formats.forEach((fmt) => {
      const saved = getSavedFormatEntry(club, fmt);
      const serialized = saved ? JSON.stringify(saved) : '';
      if (prevSavedSnapshotRef.current[fmt] !== serialized) {
        prevSavedSnapshotRef.current[fmt] = serialized;
        if (!editingFormats[fmt]) {
          applyFormatFieldsFromClub(fmt, club);
        }
      }
    });
  }, [club, editingFormats, applyFormatFieldsFromClub]);

  const savedEntry = getSavedFormatEntry(club, activeFormat);
  const isFormatSaved = Boolean(savedEntry);
  const isEditingCurrentFormat = isFormatSaved && Boolean(editingFormats[activeFormat]);
  const isFieldsEditable = isOwner && (!isFormatSaved || isEditingCurrentFormat);

  const clearErrorsForFormat = (fmt: TournamentFormat) => {
    const prefixMap: Record<TournamentFormat, string> = {
      round_robin: 'rr',
      pool_play: 'pp',
      bracket: 'br',
      scramble: 'sc',
    };
    const prefix = prefixMap[fmt];
    setErrors((prev) => {
      const next: Record<string, string> = {};
      Object.entries(prev).forEach(([k, v]) => {
        if (!k.startsWith(prefix)) next[k] = v;
      });
      return next;
    });
  };

  const validateFormat = (fmt: TournamentFormat): boolean => {
    const errs: Record<string, string> = {};
    if (fmt === 'round_robin') {
      const score = parseInt(rrTargetScore, 10);
      const winBy = parseInt(rrWinBy, 10);
      if (isNaN(score) || score < 1) errs.rrTargetScore = 'Target score must be at least 1.';
      if (isNaN(winBy) || winBy < 1) errs.rrWinBy = 'Win by margin must be at least 1.';
    } else if (fmt === 'pool_play') {
      const score = parseInt(ppTargetScore, 10);
      const winBy = parseInt(ppWinBy, 10);
      if (isNaN(score) || score < 1) errs.ppTargetScore = 'Target score must be at least 1.';
      if (isNaN(winBy) || winBy < 1) errs.ppWinBy = 'Win by margin must be at least 1.';
    } else if (fmt === 'bracket') {
      const score = parseInt(brTargetScore, 10);
      const winBy = parseInt(brWinBy, 10);
      if (isNaN(score) || score < 1) errs.brTargetScore = 'Target score must be at least 1.';
      if (isNaN(winBy) || winBy < 1) errs.brWinBy = 'Win by margin must be at least 1.';
    } else if (fmt === 'scramble') {
      const score = parseInt(scTargetScore, 10);
      const winBy = parseInt(scWinBy, 10);
      if (isNaN(score) || score < 1) errs.scTargetScore = 'Target score must be at least 1.';
      if (isNaN(winBy) || winBy < 1) errs.scWinBy = 'Win by margin must be at least 1.';
    }

    setErrors((prev) => ({ ...prev, ...errs }));
    return Object.keys(errs).length === 0;
  };

  const buildFormatPayload = (fmt: TournamentFormat): Record<string, unknown> => {
    if (fmt === 'round_robin') {
      const targetScore = parseInt(rrTargetScore, 10) || 11;
      const winBy = parseInt(rrWinBy, 10) || 2;
      return {
        target_score: targetScore,
        win_by: winBy,
        game_format: 'single_game',
        court_allocation_preference: rrCourtPref,
        tiebreaker_rules: DEFAULT_CLUB_TOURNAMENT_CONFIG.round_robin.tiebreaker_rules,
        match_scoring: {
          game_format: 'single_game',
          target_score: targetScore,
          win_by: winBy,
        },
      };
    }

    if (fmt === 'pool_play') {
      const targetScore = parseInt(ppTargetScore, 10) || 11;
      const winBy = parseInt(ppWinBy, 10) || 2;
      return {
        pool_count: parseInt(poolCount, 10) || 2,
        teams_per_pool: parseInt(teamsPerPool, 10) || 4,
        qualifiers_per_pool: parseInt(qualifiersPerPool, 10) || 2,
        pool_bracket_type: poolBracketType,
        target_score: targetScore,
        win_by: winBy,
        court_allocation_preference: ppCourtPref,
        advancement_rule: 'top_per_pool',
        tiebreaker_rules: DEFAULT_CLUB_TOURNAMENT_CONFIG.pool_play.tiebreaker_rules,
        match_scoring: {
          game_format: 'single_game',
          target_score: targetScore,
          win_by: winBy,
        },
      };
    }

    if (fmt === 'bracket') {
      const targetScore = parseInt(brTargetScore, 10) || 11;
      const winBy = parseInt(brWinBy, 10) || 2;
      return {
        bracket_type: bracketType,
        seeding_method: seedingMethod,
        bye_rule: byeRule,
        target_score: targetScore,
        win_by: winBy,
        court_allocation_preference: brCourtPref,
        tiebreaker_rules: DEFAULT_CLUB_TOURNAMENT_CONFIG.bracket.tiebreaker_rules,
        match_scoring: {
          game_format: 'single_game',
          target_score: targetScore,
          win_by: winBy,
        },
      };
    }

    // scramble
    const targetScore = parseInt(scTargetScore, 10) || 11;
    const winBy = parseInt(scWinBy, 10) || 2;
    return {
      planned_rounds: parseInt(scrambleRounds, 10) || 5,
      rotation_rule: scrambleRotationRule,
      leaderboard_metric: scrambleLeaderboardMetric,
      target_score: targetScore,
      win_by: winBy,
      court_allocation_preference: scCourtPref,
      match_scoring: {
        game_format: 'single_game',
        target_score: targetScore,
        win_by: winBy,
      },
    };
  };

  const handlePersistActiveFormat = async () => {
    if (!isOwner) {
      Alert.alert('Permission Denied', 'Only the Club Owner can update tournament configuration.');
      return;
    }

    clearErrorsForFormat(activeFormat);
    if (!validateFormat(activeFormat)) {
      Alert.alert('Validation Error', 'Please correct the highlighted fields before saving.');
      return;
    }

    setIsSaving(true);
    try {
      const formatPayload = buildFormatPayload(activeFormat);
      const mergedConfig = {
        ...(club.tournament_configuration || {}),
        [activeFormat]: formatPayload,
      };
      await updateClub({ tournament_configuration: mergedConfig });
      if (onSaved) await onSaved();
      setEditingFormats((prev) => ({ ...prev, [activeFormat]: false }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save configuration.';
      Alert.alert('Save Failed', msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartEditing = () => {
    if (!isOwner) return;
    applyFormatFieldsFromClub(activeFormat, club);
    clearErrorsForFormat(activeFormat);
    setEditingFormats((prev) => ({ ...prev, [activeFormat]: true }));
  };

  const handleCancelEdit = () => {
    applyFormatFieldsFromClub(activeFormat, club);
    clearErrorsForFormat(activeFormat);
    setEditingFormats((prev) => ({ ...prev, [activeFormat]: false }));
  };

  const savedStatusBadge =
    isFormatSaved && !isEditingCurrentFormat ? (
      <View style={styles.savedStatusBadge} testID={`config-saved-badge-${activeFormat}`}>
        <CheckCircle2 size={13} color="#15803D" strokeWidth={2.4} />
        <AppText style={styles.savedStatusText}>Configuration Saved</AppText>
      </View>
    ) : undefined;

  const renderChip = (
    key: string,
    label: string,
    selected: boolean,
    onPress: () => void,
  ) => (
    <TouchableOpacity
      key={key}
      onPress={() => isFieldsEditable && onPress()}
      disabled={!isFieldsEditable}
      style={[
        styles.choiceChip,
        !isFieldsEditable && styles.choiceChipReadOnly,
        selected && (isFieldsEditable ? styles.choiceChipActive : styles.choiceChipReadOnlyActive),
      ]}
      activeOpacity={0.75}
    >
      <AppText
        style={[
          styles.choiceChipText,
          !isFieldsEditable && styles.choiceChipTextReadOnly,
          selected && styles.choiceChipTextActive,
        ]}
      >
        {label}
      </AppText>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <ClubResponsiveContainer style={styles.responsiveStack}>
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
            action={savedStatusBadge}
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
                    editable={isFieldsEditable}
                    style={!isFieldsEditable ? styles.readOnlyInput : undefined}
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
                    editable={isFieldsEditable}
                    style={!isFieldsEditable ? styles.readOnlyInput : undefined}
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
                {COURT_ALLOCATION_OPTIONS.map((opt) =>
                  renderChip(opt.key, opt.label, rrCourtPref === opt.key, () => setRrCourtPref(opt.key)),
                )}
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
            action={savedStatusBadge}
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
                    editable={isFieldsEditable}
                    style={!isFieldsEditable ? styles.readOnlyInput : undefined}
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
                    editable={isFieldsEditable}
                    style={!isFieldsEditable ? styles.readOnlyInput : undefined}
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
                {COURT_ALLOCATION_OPTIONS.map((opt) =>
                  renderChip(opt.key, opt.label, ppCourtPref === opt.key, () => setPpCourtPref(opt.key)),
                )}
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
            action={savedStatusBadge}
          >
            <View style={styles.sectionBlock}>
              <AppText style={styles.sectionTitle}>Bracket Type</AppText>
              <View style={styles.chipsRow}>
                {BRACKET_TYPE_OPTIONS.map((opt) =>
                  renderChip(opt, opt, bracketType === opt, () => setBracketType(opt)),
                )}
              </View>
            </View>

            <View style={styles.sectionDivider} />

            <View style={styles.sectionBlock}>
              <AppText style={styles.sectionTitle}>Seeding Method</AppText>
              <View style={styles.chipsRow}>
                {BRACKET_SEEDING_OPTIONS.map((opt) =>
                  renderChip(opt, opt, seedingMethod === opt, () => setSeedingMethod(opt)),
                )}
              </View>
            </View>

            <View style={styles.sectionDivider} />

            <View style={styles.sectionBlock}>
              <AppText style={styles.sectionTitle}>Byes & Advancement</AppText>
              <View style={styles.chipsRow}>
                {BRACKET_BYE_OPTIONS.map((opt) =>
                  renderChip(opt, opt, byeRule === opt, () => setByeRule(opt)),
                )}
              </View>
            </View>

            <View style={styles.sectionDivider} />

            <View style={styles.sectionBlock}>
              <AppText style={styles.sectionTitle}>Court Allocation</AppText>
              <View style={styles.chipsRow}>
                {COURT_ALLOCATION_OPTIONS.map((opt) =>
                  renderChip(opt.key, opt.label, brCourtPref === opt.key, () => setBrCourtPref(opt.key)),
                )}
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
                    editable={isFieldsEditable}
                    style={!isFieldsEditable ? styles.readOnlyInput : undefined}
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
                    editable={isFieldsEditable}
                    style={!isFieldsEditable ? styles.readOnlyInput : undefined}
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
            action={savedStatusBadge}
          >
            <View style={styles.sectionBlock}>
              <AppText style={styles.sectionTitle}>Rotation Rules</AppText>
              <View style={styles.chipsRow}>
                {SCRAMBLE_ROTATION_OPTIONS.map((opt) =>
                  renderChip(opt, opt, scrambleRotationRule === opt, () => setScrambleRotationRule(opt)),
                )}
              </View>
            </View>

            <View style={styles.sectionDivider} />

            <View style={styles.sectionBlock}>
              <AppText style={styles.sectionTitle}>Leaderboard & Scoring</AppText>
              <View style={styles.chipsRow}>
                {SCRAMBLE_LEADERBOARD_OPTIONS.map((opt) =>
                  renderChip(
                    opt,
                    opt,
                    scrambleLeaderboardMetric === opt,
                    () => setScrambleLeaderboardMetric(opt),
                  ),
                )}
              </View>
            </View>

            <View style={styles.sectionDivider} />

            <View style={styles.sectionBlock}>
              <AppText style={styles.sectionTitle}>Court Allocation</AppText>
              <View style={styles.chipsRow}>
                {COURT_ALLOCATION_OPTIONS.map((opt) =>
                  renderChip(opt.key, opt.label, scCourtPref === opt.key, () => setScCourtPref(opt.key)),
                )}
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
                    editable={isFieldsEditable}
                    style={!isFieldsEditable ? styles.readOnlyInput : undefined}
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
                    editable={isFieldsEditable}
                    style={!isFieldsEditable ? styles.readOnlyInput : undefined}
                    error={errors.scWinBy}
                    hint="Lead required"
                  />
                </View>
              </View>
            </View>
          </ClubSectionCard>
        )}

        {/* Format-Scoped Workflow Action Bar (Owner Only) */}
        {isOwner && (
          <View style={styles.actionsContainer}>
            {!isFormatSaved ? (
              <Button
                label={isSaving ? 'Saving Configuration...' : 'Save Configuration'}
                variant="primary"
                onPress={handlePersistActiveFormat}
                disabled={isSaving}
              />
            ) : !isEditingCurrentFormat ? (
              <TouchableOpacity
                style={styles.editConfigBtn}
                onPress={handleStartEditing}
                activeOpacity={0.8}
              >
                <Pencil size={15} color="#176B57" strokeWidth={2.2} />
                <AppText style={styles.editConfigBtnText}>Edit Configuration</AppText>
              </TouchableOpacity>
            ) : (
              <View style={styles.editActionsRow}>
                <View style={styles.editCancelCol}>
                  <Button
                    label="Cancel"
                    variant="outline"
                    onPress={handleCancelEdit}
                    disabled={isSaving}
                  />
                </View>
                <View style={styles.editSaveCol}>
                  <Button
                    label={isSaving ? 'Saving...' : 'Save Changes'}
                    variant="primary"
                    onPress={handlePersistActiveFormat}
                    disabled={isSaving}
                  />
                </View>
              </View>
            )}
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
  savedStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  savedStatusText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#15803D',
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
  readOnlyInput: {
    backgroundColor: '#F3F6F4',
    borderColor: '#E2EAE6',
    color: '#2B423D',
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
  choiceChipReadOnly: {
    backgroundColor: '#F4F7F5',
    borderColor: '#E2EAE6',
    opacity: 0.72,
  },
  choiceChipActive: {
    borderColor: '#176B57',
    backgroundColor: '#E7F5EE',
  },
  choiceChipReadOnlyActive: {
    borderColor: '#176B57',
    backgroundColor: '#E7F5EE',
    opacity: 1,
  },
  choiceChipText: {
    color: '#425C57',
    fontWeight: '600',
    fontSize: 12.5,
  },
  choiceChipTextReadOnly: {
    color: '#5C726D',
  },
  choiceChipTextActive: {
    color: '#102B2A',
    fontWeight: '700',
  },
  actionsContainer: {
    marginTop: Spacing[1],
  },
  editConfigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#176B57',
    borderRadius: Radius.lg,
    paddingVertical: 13,
    paddingHorizontal: Spacing[4],
    ...Shadows.sm,
  },
  editConfigBtnText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#176B57',
  },
  editActionsRow: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  editCancelCol: {
    flex: 1,
  },
  editSaveCol: {
    flex: 2,
  },
});
