/**
 * Aught2 Pickleball — RoundRobinScoreModal
 *
 * Standardized score entry modal for Round Robin tournaments.
 * Delegates to the unified StandardMatchScoreModal.
 */

import React from 'react';
import { StandardMatchScoreModal } from '@/components/competition/StandardMatchScoreModal';
import type { Match } from '@/types';

export interface RoundRobinScoreModalProps {
  visible: boolean;
  onClose: () => void;
  match: Match | null;
  onSave: (scoreA: number, scoreB: number) => Promise<void>;
  isSaving?: boolean;
}

export function RoundRobinScoreModal({
  visible,
  onClose,
  match,
  onSave,
  isSaving = false,
}: RoundRobinScoreModalProps) {
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
