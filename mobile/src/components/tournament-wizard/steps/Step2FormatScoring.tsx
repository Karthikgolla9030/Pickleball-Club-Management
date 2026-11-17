/**
 * Aught2 Pickleball — Step 2: Format & Scoring
 *
 * Simplified competition engine configuration step:
 * - Exactly 4 formats with understandable descriptions:
 *     Round Robin: Everyone plays against the other participants. Final positions are based on results.
 *     Pool Play: Participants are divided into groups. The best performers move to the next stage.
 *     Bracket: Participants compete in knockout matches. Winners advance to the next round.
 *     Scramble: Players rotate partners across rounds and compete individually.
 * - Active Courts automatically retrieved from Club Courts Management (no manual input).
 * - Automatic application of club-level saved configurations.
 * - Only Bracket presents an additional choice (Bracket Type).
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AlertTriangle, CheckCircle2, MapPin } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Colors, Radius, Spacing } from '@/theme';
import { TOURNAMENT_FORMAT_LABELS, type Club, type Court, type TournamentFormat } from '@/types';
import { BracketConfig } from '../format-configs/BracketConfig';
import { PoolPlayConfig } from '../format-configs/PoolPlayConfig';
import { RoundRobinConfig } from '../format-configs/RoundRobinConfig';
import { ScrambleConfig } from '../format-configs/ScrambleConfig';
import { SCRAMBLE_DIVISION_OPTIONS, type TournamentWizardState } from '../types';

const FORMAT_LIST: TournamentFormat[] = [
  'round_robin',
  'pool_play',
  'bracket',
  'scramble',
];

const FORMAT_SUBTITLES: Record<TournamentFormat, string> = {
  round_robin: 'Everyone plays against the other participants. Final positions are based on results.',
  pool_play: 'Participants are divided into groups. The best performers move to the next stage.',
  bracket: 'Participants compete in knockout matches. Winners advance to the next round.',
  scramble: 'Players rotate partners across rounds and compete individually.',
};

interface Step2FormatScoringProps {
  state: TournamentWizardState;
  onChange: (patch: Partial<TournamentWizardState>) => void;
  club?: Club | null;
  activeCourts?: Court[];
  isLoadingCourts?: boolean;
  errors?: Record<string, string>;
}

export function Step2FormatScoring({
  state,
  onChange,
  club,
  activeCourts = [],
  isLoadingCourts = false,
  errors,
}: Step2FormatScoringProps) {
  const currentFormat = state.format;

  const handleFormatChange = (fmt: TournamentFormat) => {
    const patch: Partial<TournamentWizardState> = { format: fmt };

    // Migrate/validate participant counts safely when switching format
    if (fmt === 'scramble') {
      const minP = parseInt(state.minParticipants, 10);
      const maxP = parseInt(state.maxParticipants, 10);
      if (isNaN(minP) || minP < 4) {
        patch.minParticipants = '4';
      }
      if (isNaN(maxP) || maxP < 4) {
        patch.maxParticipants = '16';
      }
      if (!SCRAMBLE_DIVISION_OPTIONS.includes(state.category as any)) {
        patch.category = 'Open Scramble';
        patch.genderCategory = 'Any';
      }
    } else {
      const minP = parseInt(state.minParticipants, 10);
      if (isNaN(minP) || minP < 2) {
        patch.minParticipants = '2';
      }
      if (SCRAMBLE_DIVISION_OPTIONS.includes(state.category as any)) {
        patch.category = 'Singles';
        patch.genderCategory = 'Male';
      }
    }

    onChange(patch);
  };

  const hasCourts = activeCourts.length > 0;

  return (
    <View style={styles.container}>
      {/* ── Active Courts Banner (From Club Courts Management) ── */}
      {hasCourts ? (
        <Card style={styles.courtsCard}>
          <View style={styles.courtsHeader}>
            <View style={styles.courtsTitleRow}>
              <MapPin size={15} color={Colors.brand.primary} />
              <AppText variant="caption" color="secondary" style={styles.courtsHeaderLabel}>
                ACTIVE CLUB COURTS (COURTS MANAGEMENT)
              </AppText>
            </View>
            <Badge label={`${activeCourts.length} Courts Available`} variant="success" />
          </View>
          <AppText variant="bodySmall" bold style={styles.courtsNames}>
            {activeCourts.map((c) => c.name).join(' • ')}
          </AppText>
          <AppText variant="caption" color="tertiary" style={styles.courtsSubtext}>
            Courts are automatically allocated according to your club's court preferences.
          </AppText>
        </Card>
      ) : !isLoadingCourts ? (
        <View style={styles.noCourtsWarning}>
          <View style={styles.noCourtsHeader}>
            <AlertTriangle size={18} color="#DC2626" />
            <AppText variant="bodySmall" bold style={styles.noCourtsTitle}>
              No Active Courts Available
            </AppText>
          </View>
          <AppText variant="caption" style={styles.noCourtsDescription}>
            No active courts are available. Add or activate courts in Club Courts Management before creating this tournament.
          </AppText>
        </View>
      ) : null}

      {/* ── Format Selector ── */}
      <View style={styles.selectorSection}>
        <AppText variant="caption" color="secondary" style={styles.sectionLabel}>
          COMPETITION FORMAT *
        </AppText>
        <View style={styles.formatChips}>
          {FORMAT_LIST.map((fmt) => {
            const isSelected = currentFormat === fmt;
            const label = TOURNAMENT_FORMAT_LABELS[fmt];

            return (
              <TouchableOpacity
                key={fmt}
                onPress={() => handleFormatChange(fmt)}
                style={[
                  styles.formatChip,
                  isSelected && styles.formatChipActive,
                ]}
                activeOpacity={0.7}
              >
                <AppText
                  variant="bodySmall"
                  style={[
                    styles.formatChipText,
                    isSelected && styles.formatChipTextActive,
                  ]}
                >
                  {label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
        <AppText variant="caption" color="secondary" style={styles.formatSubtitle}>
          {FORMAT_SUBTITLES[currentFormat]}
        </AppText>
      </View>

      {/* ── Dynamic Format Specific Card ── */}
      {currentFormat === 'round_robin' && (
        <RoundRobinConfig state={state} onChange={onChange} club={club} errors={errors} />
      )}

      {currentFormat === 'pool_play' && (
        <PoolPlayConfig state={state} onChange={onChange} club={club} errors={errors} />
      )}

      {currentFormat === 'bracket' && (
        <BracketConfig state={state} onChange={onChange} club={club} errors={errors} />
      )}

      {currentFormat === 'scramble' && (
        <ScrambleConfig state={state} onChange={onChange} club={club} errors={errors} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[4],
  },
  courtsCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    padding: Spacing[3],
    gap: 4,
  },
  courtsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  courtsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  courtsHeaderLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  courtsNames: {
    color: '#065F46',
    fontSize: 13,
  },
  courtsSubtext: {
    fontSize: 11,
    lineHeight: 15,
  },
  noCourtsWarning: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
    borderRadius: Radius.md,
    padding: Spacing[3],
    gap: 4,
  },
  noCourtsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  noCourtsTitle: {
    color: '#991B1B',
  },
  noCourtsDescription: {
    color: '#B91C1C',
    fontSize: 12,
    lineHeight: 16,
  },
  selectorSection: {
    marginBottom: Spacing[1],
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: Spacing[2],
    fontWeight: '700',
  },
  formatChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
    marginBottom: Spacing[2],
  },
  formatChip: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2] + 2,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.default,
  },
  formatChipActive: {
    borderColor: Colors.brand.primary,
    backgroundColor: 'rgba(8, 120, 94, 0.08)',
  },
  formatChipText: {
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  formatChipTextActive: {
    color: Colors.brand.primary,
    fontWeight: '700',
  },
  formatSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
    color: Colors.text.secondary,
  },
});
