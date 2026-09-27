/**
 * Aught2 Pickleball — ScrambleScoreModal
 *
 * Standardized score entry modal for Scramble tournaments.
 * Delegates to the unified StandardMatchScoreModal with dynamic
 * targetPoints and winBy scoring rules.
 */

import React from 'react';
import { StandardMatchScoreModal } from '@/components/competition/StandardMatchScoreModal';
import type { Match } from '@/types';

export interface ScrambleScoreModalProps {
  visible: boolean;
  onClose: () => void;
  match: Match | null;
  onSave?: (scoreA: number, scoreB: number) => Promise<void>;
  onSaveScore?: (matchId: string, scoreA: number, scoreB: number) => Promise<void>;
  isSaving?: boolean;
  targetPoints?: number;
  winBy?: number;
}

export function ScrambleScoreModal({
  visible,
  onClose,
  match,
  onSave,
  onSaveScore,
  isSaving = false,
  targetPoints = 11,
  winBy = 2,
}: ScrambleScoreModalProps) {
  const handleSave = async (scoreA: number, scoreB: number) => {
    if (onSave) {
      await onSave(scoreA, scoreB);
    } else if (onSaveScore && match?.id) {
      await onSaveScore(match.id, scoreA, scoreB);
    }
  };

  return (
    <StandardMatchScoreModal
      visible={visible}
      onClose={onClose}
      match={match}
      onSave={handleSave}
      isSaving={isSaving}
      scoringRules={{
        target_score: targetPoints,
        win_by: winBy,
      }}
    />
  );
}
