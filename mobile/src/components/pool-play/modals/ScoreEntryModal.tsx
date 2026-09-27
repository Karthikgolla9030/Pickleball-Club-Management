/**
 * Aught2 Pickleball — ScoreEntryModal
 *
 * Standardized score entry modal for Pool Play tournaments
 * (both intra-pool matchups and championship knockout matches).
 * Delegates to the unified StandardMatchScoreModal.
 */

import React from 'react';
import { StandardMatchScoreModal } from '@/components/competition/StandardMatchScoreModal';
import type { ChampionshipMatch, Match } from '@/types/poolPlay';

export interface ScoreEntryModalProps {
  visible: boolean;
  onClose: () => void;
  match: Match | ChampionshipMatch | null;
  onSave: (score1: number, score2: number) => Promise<void> | void;
}

export function ScoreEntryModal({
  visible,
  onClose,
  match,
  onSave,
}: ScoreEntryModalProps) {
  return (
    <StandardMatchScoreModal
      visible={visible}
      onClose={onClose}
      match={match}
      onSave={async (scoreA, scoreB) => {
        await onSave(scoreA, scoreB);
      }}
    />
  );
}
