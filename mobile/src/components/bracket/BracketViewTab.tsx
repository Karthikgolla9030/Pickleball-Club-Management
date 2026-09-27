/**
 * Aught2 Pickleball — BracketViewTab
 *
 * Tab 3 for Bracket Tournament Mode:
 * - Horizontally scrollable single-elimination tournament tree
 * - Displays round columns (e.g. Round 1, Quarterfinals, Semifinals, Final)
 * - Bracket Match Cards with seeds, team names, scoreboards, court badges, and BYE indicators
 * - Interactive score entry and editing triggers for authorized staff
 */

import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Clock, Trophy, Play, Layers, GitCommit } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Colors, Radius, Spacing } from '@/theme';
import type { Court, Match, TournamentStatus } from '@/types';
import type { BracketRoundGroup } from '@/types/bracket';
import {
  groupBracketMatchesByRound,
  groupBracketMatchesBySection,
  getFeederPlaceholder,
  getAdvancementRoute,
  getResetFinalStatus,
  isMatchBye,
  isMatchReady,
  isMatchWaiting,
} from '@/utils/bracketLogic';

interface BracketViewTabProps {
  matches: Match[];
  courts: Court[];
  canManage: boolean;
  canGenerate: boolean;
  isGenerating?: boolean;
  status?: TournamentStatus;
  teamsCount?: number;
  onGenerateBracket: () => void;
  onCloseRegistration?: () => void;
  isCloseRegistrationPending?: boolean;
  onPublishTournament?: () => void;
  isPublishPending?: boolean;
  onOpenScoreModal: (match: Match) => void;
  onStartMatch?: (matchId: string) => Promise<void>;
  isStartingMatch?: boolean;
  isTournamentCompleted?: boolean;
}

/** Pixel-perfect custom bracket tree icon matching Screen 3 */
function BracketTreeIcon() {
  return (
    <View style={styles.bracketIconWrapper}>
      <View style={styles.bracketIconCanvas}>
        {/* Left branch line & node */}
        <View style={styles.bracketLeftLine} />
        {/* Vertical spine */}
        <View style={styles.bracketVerticalSpine} />
        {/* Top branch line */}
        <View style={styles.bracketTopLine} />
        {/* Top right node */}
        <View style={styles.bracketTopNode} />
        {/* Bottom branch line */}
        <View style={styles.bracketBottomLine} />
        {/* Bottom right node */}
        <View style={styles.bracketBottomNode} />
      </View>
    </View>
  );
}

export function BracketViewTab({
  matches,
  courts,
  canManage,
  canGenerate,
  isGenerating = false,
  status = 'draft',
  teamsCount = 0,
  onGenerateBracket,
  onCloseRegistration,
  isCloseRegistrationPending = false,
  onPublishTournament,
  isPublishPending = false,
  onOpenScoreModal,
  onStartMatch,
  isStartingMatch = false,
  isTournamentCompleted = false,
}: BracketViewTabProps) {
  // Detect if tournament has double elimination sections
  const isDoubleElimination = useMemo(
    () =>
      matches.some(
        (m) =>
          m.bracket_section === 'losers' ||
          m.bracket_section === 'grand_final' ||
          m.bracket_section === 'reset_final'
      ),
    [matches]
  );

  const [activeSection, setActiveSection] = useState<'winners' | 'losers' | 'finals' | 'all'>('winners');
  const [viewMode, setViewMode] = useState<'round' | 'tree'>('round');
  const [selectedRoundIndex, setSelectedRoundIndex] = useState<number>(0);

  const handleSectionChange = (sec: 'winners' | 'losers' | 'finals' | 'all') => {
    setActiveSection(sec);
    setSelectedRoundIndex(0);
  };

  const sectionGroups = useMemo(
    () => groupBracketMatchesBySection(matches),
    [matches]
  );

  const counts = useMemo(() => {
    return {
      winners: matches.filter((m) => !m.bracket_section || m.bracket_section === 'winners').length,
      losers: matches.filter((m) => m.bracket_section === 'losers').length,
      finals: matches.filter((m) => m.bracket_section === 'grand_final' || m.bracket_section === 'reset_final').length,
      all: matches.length,
    };
  }, [matches]);

  const displayedGroups = useMemo(() => {
    if (!isDoubleElimination) {
      return groupBracketMatchesByRound(matches);
    }
    if (activeSection === 'all') {
      const flattened: BracketRoundGroup[] = [];
      if (sectionGroups.winners.length > 0) flattened.push(...sectionGroups.winners);
      if (sectionGroups.losers.length > 0) flattened.push(...sectionGroups.losers);
      if (sectionGroups.finals.length > 0) flattened.push(...sectionGroups.finals);
      return flattened;
    }
    return sectionGroups[activeSection] || [];
  }, [isDoubleElimination, activeSection, sectionGroups, matches]);

  const safeRoundIndex = useMemo(() => {
    if (displayedGroups.length === 0) return 0;
    return Math.min(selectedRoundIndex, displayedGroups.length - 1);
  }, [displayedGroups.length, selectedRoundIndex]);

  const getCourtName = (courtId?: string | null) => {
    if (!courtId) return null;
    const found = courts.find((c) => c.id === courtId);
    return found ? found.display_name || found.name : 'Court';
  };

  // ─── Pre-Generation Empty State ───────────────────────────────────────────
  if (matches.length === 0) {
    const isButtonEnabled = canManage && canGenerate && !isGenerating;

    return (
      <View style={styles.emptyContainer}>
        <Card style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <BracketTreeIcon />
          </View>

          {status === 'draft' ? (
            <>
              <AppText style={styles.emptyTitle}>Tournament in Draft</AppText>
              <AppText style={styles.emptySubtitle}>
                Publish this tournament to open player registration. Once participants are registered, close registration to generate the bracket.
              </AppText>
              {canManage && onPublishTournament && (
                <TouchableOpacity
                  style={[styles.generatePillBtn, styles.generatePillBtnActive]}
                  onPress={onPublishTournament}
                  disabled={isPublishPending}
                  activeOpacity={0.8}
                >
                  <Play size={14} color="#FFFFFF" fill="#FFFFFF" />
                  <AppText style={[styles.generatePillBtnText, styles.generatePillBtnTextActive]}>
                    {isPublishPending ? 'Publishing...' : 'Publish & Open Registration'}
                  </AppText>
                </TouchableOpacity>
              )}
            </>
          ) : status === 'registration_open' ? (
            <>
              <AppText style={styles.emptyTitle}>Registration Open</AppText>
              <AppText style={styles.emptySubtitle}>
                {teamsCount > 0
                  ? `${teamsCount} participant${teamsCount === 1 ? '' : 's'} registered. Close registration to finalize rosters and seedings by skill rating, then generate the bracket.`
                  : 'Players can now register for this tournament. Once registration closes, you will be able to generate the bracket.'}
              </AppText>

              {canManage && onCloseRegistration && (
                <TouchableOpacity
                  style={[styles.generatePillBtn, styles.generatePillBtnActive]}
                  onPress={onCloseRegistration}
                  disabled={isCloseRegistrationPending}
                  activeOpacity={0.8}
                >
                  <Clock size={14} color="#FFFFFF" />
                  <AppText style={[styles.generatePillBtnText, styles.generatePillBtnTextActive]}>
                    {isCloseRegistrationPending ? 'Closing registration...' : 'Close Registration & Seed Bracket'}
                  </AppText>
                </TouchableOpacity>
              )}

              <AppText style={styles.emptyCaption}>
                Closing registration will automatically rank and seed teams by skill rating.
              </AppText>
            </>
          ) : (
            <>
              <AppText style={styles.emptyTitle}>Bracket Not Generated</AppText>
              <AppText style={styles.emptySubtitle}>
                Registration is closed. Teams are finalized and seeded by skill rating. Generate the bracket now.
              </AppText>

              {/* Pill Generate Button */}
              <TouchableOpacity
                style={[
                  styles.generatePillBtn,
                  isButtonEnabled ? styles.generatePillBtnActive : styles.generatePillBtnDisabled,
                ]}
                disabled={!isButtonEnabled}
                onPress={onGenerateBracket}
                activeOpacity={0.8}
              >
                <Play
                  size={14}
                  color={isButtonEnabled ? '#FFFFFF' : '#64748B'}
                  fill={isButtonEnabled ? '#FFFFFF' : 'none'}
                />
                <AppText
                  style={[
                    styles.generatePillBtnText,
                    isButtonEnabled ? styles.generatePillBtnTextActive : styles.generatePillBtnTextDisabled,
                  ]}
                >
                  {isGenerating ? 'Generating bracket...' : '▶ Generate Bracket'}
                </AppText>
              </TouchableOpacity>

              <AppText style={styles.emptyCaption}>
                {teamsCount < 2 ? 'At least 2 teams are required to generate bracket.' : 'Creates match slots and assigns courts.'}
              </AppText>
            </>
          )}
        </Card>
      </View>
    );
  }

  // ─── Match Card Renderer (Shared for Round View and Tree View) ───────────
  const renderMatchCard = (match: Match, fullWidth = false) => {
    const isBye = isMatchBye(match);
    const isReady = isMatchReady(match);
    const isCompleted = match.status === 'completed';
    const isCancelled = match.status === 'cancelled';
    const isWaiting = isMatchWaiting(match);

    const placeholderA = getFeederPlaceholder(match, 'team_a', matches);
    const placeholderB = getFeederPlaceholder(match, 'team_b', matches);

    const teamAName = match.team_a?.name ?? (isCompleted ? 'Team A' : placeholderA);
    const teamBName = isBye
      ? 'BYE'
      : (match.team_b?.name ?? (isCompleted ? 'Team B' : placeholderB));

    const winnerIsA = isCompleted && match.winner_team_id === match.team_a_id;
    const winnerIsB = isCompleted && match.winner_team_id === match.team_b_id;

    const courtLabel = getCourtName(match.court_id);
    const resetInfo = getResetFinalStatus(match);
    const isGrandFinal = match.bracket_section === 'grand_final';
    const advancement = getAdvancementRoute(match);

    const canEnterScore =
      canManage &&
      isReady &&
      !isCompleted &&
      !isBye &&
      !isCancelled &&
      Boolean(match.team_a_id && match.team_b_id) &&
      !isTournamentCompleted &&
      status !== 'completed';

    const canEditScore =
      canManage &&
      isCompleted &&
      !isBye &&
      !isCancelled &&
      !isTournamentCompleted &&
      status !== 'completed';

    return (
      <Card
        key={match.id}
        style={[
          styles.matchCard,
          fullWidth && styles.matchCardFullWidth,
          isCompleted && styles.matchCardCompleted,
          isReady && styles.matchCardReady,
          isCancelled && styles.matchCardCancelled,
        ]}
      >
        {/* Top Row: Match Number, Round Label, Court, Status */}
        <View style={styles.matchTopRow}>
          <View style={styles.matchMetaLeft}>
            <AppText variant="caption" color="secondary" style={styles.matchNumText}>
              MATCH #{match.match_number ?? match.bracket_position}
            </AppText>
            {fullWidth && match.label && (
              <Badge label={match.label} variant="default" />
            )}
            {courtLabel && (
              <View style={styles.courtPill}>
                <AppText variant="caption" style={styles.courtPillText}>
                  {courtLabel}
                </AppText>
              </View>
            )}
          </View>

          {/* Badges */}
          {resetInfo.isResetFinal ? (
            <Badge
              label={resetInfo.badgeLabel}
              variant={resetInfo.badgeVariant}
            />
          ) : isBye ? (
            <Badge label="BYE" variant="default" />
          ) : isCancelled ? (
            <Badge label="Not Required" variant="default" />
          ) : isCompleted ? (
            <Badge label="Completed" variant="success" />
          ) : isReady ? (
            <Badge label="Ready to Play" variant="warning" />
          ) : (
            <Badge label="Waiting" variant="default" />
          )}
        </View>

        {/* Conditional Reset Banner if Reset Final */}
        {resetInfo.isResetFinal && (
          <View
            style={[
              styles.resetBanner,
              resetInfo.status === 'not_required' && styles.resetBannerNotReq,
              resetInfo.status === 'ready' && styles.resetBannerReady,
            ]}
          >
            <AppText
              variant="caption"
              style={[
                styles.resetBannerText,
                resetInfo.status === 'ready' && styles.resetBannerTextReady,
              ]}
            >
              {resetInfo.description}
            </AppText>
          </View>
        )}

        {/* Grand Final Info Notice */}
        {isGrandFinal && (
          <View style={styles.grandFinalBanner}>
            <AppText variant="caption" style={styles.grandFinalBannerText}>
              🏆 Grand Championship Final (WB Undefeated vs LB Finalist)
            </AppText>
          </View>
        )}

        {/* Waiting Feeder Details Notice */}
        {isWaiting && !isCancelled && !isBye && (
          <View style={styles.waitingBanner}>
            <AppText variant="caption" style={styles.waitingBannerText}>
              {match.team_a_id && !match.team_b_id
                ? `⏳ Awaiting Opponent: ${placeholderB}`
                : !match.team_a_id && match.team_b_id
                ? `⏳ Awaiting Opponent: ${placeholderA}`
                : `⏳ Waiting: ${placeholderA} vs ${placeholderB}`}
            </AppText>
          </View>
        )}

        {/* Team Rows */}
        <View style={styles.teamsBox}>
          {/* Team A */}
          <View
            style={[
              styles.teamLine,
              winnerIsA && styles.teamLineWinner,
            ]}
          >
            <View style={styles.teamNameWithSeed}>
              {match.team_a?.seed !== null && match.team_a?.seed !== undefined ? (
                <View style={styles.smallSeedBadge}>
                  <AppText variant="caption" style={styles.seedNumText}>
                    #{match.team_a.seed}
                  </AppText>
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <AppText
                  variant="bodySmall"
                  numberOfLines={1}
                  style={[
                    styles.teamNameLabel,
                    winnerIsA && styles.winnerTeamName,
                    !match.team_a_id && styles.placeholderTeamName,
                  ]}
                >
                  {teamAName}
                </AppText>
                {isGrandFinal && match.wb_champion_slot === 'team_a' && (
                  <AppText variant="caption" style={styles.slotSubtitle}>
                    Undefeated WB Champion
                  </AppText>
                )}
                {isGrandFinal && match.wb_champion_slot === 'team_b' && (
                  <AppText variant="caption" style={styles.slotSubtitle}>
                    Losers Final Champion
                  </AppText>
                )}
              </View>
            </View>

            {isCompleted && !isBye && !isCancelled && (
              <AppText
                variant="body"
                style={[styles.scoreValue, winnerIsA && styles.winningScore]}
              >
                {match.score_a ?? '—'}
              </AppText>
            )}

            {isBye && winnerIsA && (
              <AppText variant="caption" style={styles.byeAdvText}>
                ✓ Advances
              </AppText>
            )}
          </View>

          <View style={styles.teamDivider} />

          {/* Team B */}
          <View
            style={[
              styles.teamLine,
              winnerIsB && styles.teamLineWinner,
            ]}
          >
            <View style={styles.teamNameWithSeed}>
              {match.team_b?.seed !== null && match.team_b?.seed !== undefined ? (
                <View style={styles.smallSeedBadge}>
                  <AppText variant="caption" style={styles.seedNumText}>
                    #{match.team_b.seed}
                  </AppText>
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <AppText
                  variant="bodySmall"
                  numberOfLines={1}
                  style={[
                    styles.teamNameLabel,
                    winnerIsB && styles.winnerTeamName,
                    (!match.team_b_id && !isBye) && styles.placeholderTeamName,
                    isBye && styles.byeLabel,
                  ]}
                >
                  {teamBName}
                </AppText>
                {isGrandFinal && match.wb_champion_slot === 'team_a' && (
                  <AppText variant="caption" style={styles.slotSubtitle}>
                    Losers Final Champion
                  </AppText>
                )}
                {isGrandFinal && match.wb_champion_slot === 'team_b' && (
                  <AppText variant="caption" style={styles.slotSubtitle}>
                    Undefeated WB Champion
                  </AppText>
                )}
              </View>
            </View>

            {isCompleted && !isBye && !isCancelled && (
              <AppText
                variant="body"
                style={[styles.scoreValue, winnerIsB && styles.winningScore]}
              >
                {match.score_b ?? '—'}
              </AppText>
            )}

            {isBye && winnerIsB && (
              <AppText variant="caption" style={styles.byeAdvText}>
                ✓ Advances
              </AppText>
            )}
          </View>
        </View>

        {/* Advancement Paths (Where winner & loser advance) */}
        {(advancement.winnerBadge || advancement.loserBadge) && (
          <View style={styles.advancementRow}>
            {advancement.winnerBadge && (
              <View style={styles.advancementPill}>
                <AppText variant="caption" style={styles.advancementWinner}>
                  {advancement.winnerBadge}
                </AppText>
              </View>
            )}
            {advancement.loserBadge && (
              <View style={styles.advancementPill}>
                <AppText variant="caption" style={styles.advancementLoser}>
                  {advancement.loserBadge}
                </AppText>
              </View>
            )}
          </View>
        )}

        {/* Action Bar for Staff */}
        {canManage && (
          <View style={styles.cardActionsRow}>
            {isReady && match.status === 'pending' && onStartMatch && (
              <Button
                label="Start Match"
                variant="outline"
                size="sm"
                onPress={() => void onStartMatch(match.id)}
                disabled={isStartingMatch}
                style={{ flex: 1, marginRight: canEnterScore ? 6 : 0 }}
              />
            )}

            {canEnterScore && (
              <Button
                label="Enter Score"
                variant="primary"
                size="sm"
                onPress={() => onOpenScoreModal(match)}
                style={{ flex: 1 }}
              />
            )}

            {canEditScore && (
              <Button
                label="Edit Score"
                variant="outline"
                size="sm"
                onPress={() => onOpenScoreModal(match)}
                style={{ flex: 1 }}
              />
            )}

            {isCancelled && (
              <AppText variant="caption" color="tertiary" style={styles.mutedActionNote}>
                Match not required (WB winner went undefeated)
              </AppText>
            )}

            {!canEnterScore && !canEditScore && !isCancelled && !isCompleted && !isBye && !onStartMatch && (
              <AppText variant="caption" color="tertiary" style={styles.mutedActionNote}>
                {resetInfo.isResetFinal && resetInfo.status === 'conditional'
                  ? 'Played only if LB champion wins Grand Final'
                  : 'Awaiting prior match results'}
              </AppText>
            )}
          </View>
        )}
      </Card>
    );
  };

  return (
    <View style={styles.tabRoot}>
      {/* Top Header Controls: View Mode Switcher + Section Tabs */}
      <View style={styles.topControlsContainer}>
        {/* View Mode Switcher (Round View for Mobile vs Full Tree Canvas) */}
        <View style={styles.viewModeToggleRow}>
          <TouchableOpacity
            style={[styles.viewModeBtn, viewMode === 'round' && styles.viewModeBtnActive]}
            onPress={() => setViewMode('round')}
            activeOpacity={0.7}
          >
            <Layers size={14} color={viewMode === 'round' ? '#FFFFFF' : '#475569'} />
            <AppText style={[styles.viewModeBtnText, viewMode === 'round' && styles.viewModeBtnTextActive]}>
              Round View (Mobile)
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.viewModeBtn, viewMode === 'tree' && styles.viewModeBtnActive]}
            onPress={() => setViewMode('tree')}
            activeOpacity={0.7}
          >
            <GitCommit size={14} color={viewMode === 'tree' ? '#FFFFFF' : '#475569'} />
            <AppText style={[styles.viewModeBtnText, viewMode === 'tree' && styles.viewModeBtnTextActive]}>
              Full Tree Canvas
            </AppText>
          </TouchableOpacity>
        </View>

        {/* Section Navigation Tabs for Double Elimination */}
        {isDoubleElimination && (
          <View style={styles.sectionNavWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sectionNavContent}
            >
              <TouchableOpacity
                style={[styles.sectionPill, activeSection === 'winners' && styles.sectionPillActive]}
                onPress={() => handleSectionChange('winners')}
                activeOpacity={0.7}
              >
                <AppText
                  style={[
                    styles.sectionPillText,
                    activeSection === 'winners' && styles.sectionPillTextActive,
                  ]}
                >
                  Winners Bracket ({counts.winners})
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sectionPill, activeSection === 'losers' && styles.sectionPillActive]}
                onPress={() => handleSectionChange('losers')}
                activeOpacity={0.7}
              >
                <AppText
                  style={[
                    styles.sectionPillText,
                    activeSection === 'losers' && styles.sectionPillTextActive,
                  ]}
                >
                  Losers Bracket ({counts.losers})
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sectionPill, activeSection === 'finals' && styles.sectionPillActive]}
                onPress={() => handleSectionChange('finals')}
                activeOpacity={0.7}
              >
                <AppText
                  style={[
                    styles.sectionPillText,
                    activeSection === 'finals' && styles.sectionPillTextActive,
                  ]}
                >
                  Finals ({counts.finals})
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sectionPill, activeSection === 'all' && styles.sectionPillActive]}
                onPress={() => handleSectionChange('all')}
                activeOpacity={0.7}
              >
                <AppText
                  style={[
                    styles.sectionPillText,
                    activeSection === 'all' && styles.sectionPillTextActive,
                  ]}
                >
                  All Rounds ({counts.all})
                </AppText>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* Round Stepper when in Round View */}
        {viewMode === 'round' && displayedGroups.length > 0 && (
          <View style={styles.roundStepperWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.roundStepperContent}
            >
              {displayedGroups.map((grp, idx) => {
                const isSelected = idx === safeRoundIndex;
                return (
                  <TouchableOpacity
                    key={`round-step-${grp.section ?? 'sec'}-${grp.roundNumber}`}
                    style={[styles.roundStepPill, isSelected && styles.roundStepPillActive]}
                    onPress={() => setSelectedRoundIndex(idx)}
                    activeOpacity={0.7}
                  >
                    <AppText
                      style={[
                        styles.roundStepPillText,
                        isSelected && styles.roundStepPillTextActive,
                      ]}
                    >
                      {grp.roundName} ({grp.matches.length})
                    </AppText>
                    {grp.isRoundComplete && (
                      <View style={styles.roundDoneDot} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>

      {/* ─── Mode 1: Round View (Vertical, Full-Width, Mobile-Friendly) ────── */}
      {viewMode === 'round' && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.roundMatchesContainer}
        >
          {displayedGroups[safeRoundIndex] ? (
            <>
              <View style={styles.roundHeaderRow}>
                <AppText variant="heading3" style={styles.roundHeaderTitle}>
                  {displayedGroups[safeRoundIndex].roundName.toUpperCase()}
                </AppText>
                <Badge
                  label={`${displayedGroups[safeRoundIndex].completedCount}/${displayedGroups[safeRoundIndex].totalCount} Done`}
                  variant={displayedGroups[safeRoundIndex].isRoundComplete ? 'success' : 'default'}
                />
              </View>

              {displayedGroups[safeRoundIndex].matches.map((m) => renderMatchCard(m, true))}
            </>
          ) : (
            <AppText color="tertiary" style={{ textAlign: 'center', marginTop: 20 }}>
              No matches in this round.
            </AppText>
          )}
        </ScrollView>
      )}

      {/* ─── Mode 2: Tree View (Horizontally Scrollable Columns) ─────────── */}
      {viewMode === 'tree' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          contentContainerStyle={styles.scrollContent}
        >
          {displayedGroups.map((group, groupIndex) => {
            const isLastRound = groupIndex === displayedGroups.length - 1;

            return (
              <View key={`bracket-col-${group.section ?? 'round'}-${group.roundNumber}`} style={styles.roundColumn}>
                {/* Column Header */}
                <View style={styles.columnHeader}>
                  <View style={styles.columnTitleRow}>
                    {isLastRound ? (
                      <Trophy size={16} color="#F59E0B" />
                    ) : (
                      <Clock size={16} color={Colors.brand.primary} />
                    )}
                    <AppText variant="heading3" style={styles.columnTitleText}>
                      {group.roundName.toUpperCase()}
                    </AppText>
                  </View>

                  <Badge
                    label={`${group.completedCount}/${group.totalCount} Done`}
                    variant={group.isRoundComplete ? 'success' : 'default'}
                  />
                </View>

                {/* Matches in Round Column */}
                <View style={styles.matchesColumn}>
                  {group.matches.map((match) => renderMatchCard(match, false))}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[4],
  },
  emptyCard: {
    padding: Spacing[6],
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#DDE8E2',
    borderWidth: 1,
    borderRadius: 16,
    gap: 8,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EBF4F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  bracketIconWrapper: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bracketIconCanvas: {
    width: 22,
    height: 26,
    position: 'relative',
  },
  bracketLeftLine: {
    position: 'absolute',
    left: 0,
    top: 12,
    width: 10,
    height: 2.5,
    backgroundColor: '#087A60',
  },
  bracketVerticalSpine: {
    position: 'absolute',
    left: 9,
    top: 3,
    width: 2.5,
    height: 20,
    backgroundColor: '#087A60',
  },
  bracketTopLine: {
    position: 'absolute',
    left: 9,
    top: 3,
    width: 8,
    height: 2.5,
    backgroundColor: '#087A60',
  },
  bracketTopNode: {
    position: 'absolute',
    left: 15,
    top: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#087A60',
    backgroundColor: '#FFFFFF',
  },
  bracketBottomLine: {
    position: 'absolute',
    left: 9,
    top: 20,
    width: 8,
    height: 2.5,
    backgroundColor: '#087A60',
  },
  bracketBottomNode: {
    position: 'absolute',
    left: 15,
    top: 17,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#087A60',
    backgroundColor: '#FFFFFF',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#102F2B',
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    color: '#71817E',
    maxWidth: 290,
    marginBottom: 12,
  },
  generatePillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: Radius.full,
    minWidth: 200,
  },
  generatePillBtnActive: {
    backgroundColor: '#064E3B',
  },
  generatePillBtnDisabled: {
    backgroundColor: '#E2E8F0',
  },
  generatePillBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  generatePillBtnTextActive: {
    color: '#FFFFFF',
  },
  generatePillBtnTextDisabled: {
    color: '#64748B',
  },
  emptyCaption: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
  },
  scrollContent: {
    padding: Spacing[4],
    gap: Spacing[4],
  },
  roundColumn: {
    width: 280,
    gap: Spacing[3],
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
  },
  columnTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1.5],
  },
  columnTitleText: {
    color: Colors.text.primary,
    fontWeight: '800',
  },
  matchesColumn: {
    gap: Spacing[3],
  },
  matchCard: {
    padding: Spacing[3],
    backgroundColor: Colors.background.secondary,
    borderColor: Colors.surface.border,
    gap: Spacing[2],
  },
  matchCardCompleted: {
    borderColor: Colors.surface.border,
  },
  matchCardReady: {
    borderColor: Colors.brand.primary,
  },
  matchTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchMetaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  matchNumText: {
    fontWeight: '700',
  },
  courtPill: {
    paddingHorizontal: Spacing[1.5],
    paddingVertical: 1,
    borderRadius: Radius.sm,
    backgroundColor: Colors.background.tertiary,
  },
  courtPillText: {
    color: Colors.text.secondary,
    fontSize: 10,
    fontWeight: '600',
  },
  teamsBox: {
    backgroundColor: Colors.background.tertiary,
    borderRadius: Radius.md,
    padding: Spacing[2],
    gap: Spacing[1.5],
  },
  teamLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: Radius.sm,
  },
  teamLineWinner: {
    backgroundColor: '#E7F5EC',
  },
  teamDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.surface.border,
    marginVertical: 2,
  },
  teamNameWithSeed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1.5],
    flex: 1,
  },
  smallSeedBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface.elevated,
    minWidth: 16,
    alignItems: 'center',
  },
  seedNumText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.brand.primary,
  },
  teamNameLabel: {
    color: Colors.text.secondary,
    flex: 1,
  },
  winnerTeamName: {
    color: Colors.text.primary,
    fontWeight: '700',
  },
  placeholderTeamName: {
    color: Colors.text.tertiary,
    fontStyle: 'italic',
  },
  byeLabel: {
    color: Colors.text.tertiary,
    fontWeight: '700',
  },
  scoreValue: {
    fontWeight: '700',
    color: Colors.text.secondary,
    minWidth: 24,
    textAlign: 'right',
  },
  winningScore: {
    color: Colors.status.success,
    fontWeight: '800',
  },
  byeAdvText: {
    color: Colors.brand.primary,
    fontWeight: '700',
    fontSize: 11,
  },
  cardActionsRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  tabRoot: {
    flex: 1,
  },
  topControlsContainer: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[3],
    gap: Spacing[2],
  },
  viewModeToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: Radius.full,
    padding: 3,
    gap: 4,
    alignSelf: 'flex-start',
  },
  viewModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
  },
  viewModeBtnActive: {
    backgroundColor: '#064E3B',
  },
  viewModeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  viewModeBtnTextActive: {
    color: '#FFFFFF',
  },
  roundStepperWrapper: {
    paddingTop: 2,
    paddingBottom: 4,
  },
  roundStepperContent: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  roundStepPill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: Radius.full,
    backgroundColor: Colors.background.secondary,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roundStepPillActive: {
    backgroundColor: '#0F766E',
    borderColor: '#0F766E',
  },
  roundStepPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  roundStepPillTextActive: {
    color: '#FFFFFF',
  },
  roundDoneDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  roundMatchesContainer: {
    padding: Spacing[4],
    gap: Spacing[3],
  },
  roundHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing[1],
  },
  roundHeaderTitle: {
    color: Colors.text.primary,
    fontWeight: '800',
  },
  matchCardFullWidth: {
    width: '100%',
  },
  waitingBanner: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
    marginTop: 2,
  },
  waitingBannerText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600',
  },
  advancementRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[1.5],
    paddingTop: 2,
  },
  advancementPill: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.background.tertiary,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  advancementWinner: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#047857',
  },
  advancementLoser: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#B45309',
  },
  sectionNavWrapper: {
    paddingTop: 2,
    paddingBottom: 2,
  },
  sectionNavContent: {
    flexDirection: 'row',
    gap: Spacing[2],
  },
  sectionPill: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: Radius.full,
    backgroundColor: Colors.background.secondary,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  sectionPillActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  sectionPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  sectionPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  resetBanner: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    marginTop: 2,
  },
  resetBannerNotReq: {
    backgroundColor: '#F1F5F9',
  },
  resetBannerReady: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  resetBannerText: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 14,
  },
  resetBannerTextReady: {
    color: '#92400E',
    fontWeight: '700',
  },
  grandFinalBanner: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    marginTop: 2,
  },
  grandFinalBannerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  slotSubtitle: {
    fontSize: 10,
    color: '#047857',
    fontWeight: '600',
    marginTop: 1,
  },
  matchCardCancelled: {
    opacity: 0.65,
    backgroundColor: '#F8FAFC',
  },
  mutedActionNote: {
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    flex: 1,
    paddingVertical: 4,
  },
});
