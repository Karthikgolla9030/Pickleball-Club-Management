/**
 * Aught2 Pickleball — BracketScoreModal
 *
 * Standardized score entry modal for Bracket tournaments
 * (Single Elimination, Consolation, Double Elimination).
 * Delegates to the unified StandardMatchScoreModal.
 */

import React from 'react';
import { StandardMatchScoreModal } from '@/components/competition/StandardMatchScoreModal';
import type { Match } from '@/types';

export interface BracketScoreModalProps {
  visible: boolean;
  onClose: () => void;
  match: Match | null;
  onSave: (scoreA: number, scoreB: number) => Promise<void>;
  isSaving?: boolean;
}

export function BracketScoreModal({
  visible,
  onClose,
  match,
  onSave,
  isSaving = false,
}: BracketScoreModalProps) {
  return (
    <StandardMatchScoreModal
      visible={visible}
      onClose={onClose}
      match={match}
      onSave={onSave}
      isSaving={isSaving}
    />
  );
}
