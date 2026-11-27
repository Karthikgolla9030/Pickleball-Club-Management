/**
 * Aught2 Pickleball — PostRegistrationSaveActionBar
 *
 * Shared Stage 5 -> Stage 6 workflow controls across all four tournament formats:
 * - Backend-verified Save Configuration / Saved / Edit Configuration toggle
 * - Unsaved changes indicator when editing a saved configuration
 * - Gated Generate Structure action (enabled strictly after backend save & validation)
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Radius, Spacing } from '@/theme';

export interface PostRegistrationSaveActionBarProps {
  configurationSaved: boolean;
  savedAt?: string | null;
  isDirty: boolean;
  isEditing: boolean;
  isSaving: boolean;
  isGenerating: boolean;
  isGenerated: boolean;
  isValid: boolean;
  canManage: boolean;
  generateLabel: string;
  regenerateLabel?: string;
  validationError?: string | null;
  onSave: () => void | Promise<void>;
  onStartEditing: () => void;
  onGenerate: () => void | Promise<void>;
}

export function PostRegistrationSaveActionBar({
  configurationSaved,
  savedAt,
  isDirty,
  isEditing,
  isSaving,
  isGenerating,
  isGenerated,
  isValid,
  canManage,
  generateLabel,
  regenerateLabel,
  validationError,
  onSave,
  onStartEditing,
  onGenerate,
}: PostRegistrationSaveActionBarProps) {
  const showSavedState = configurationSaved && !isDirty && !isEditing;
  const canSaveNow = canManage && isValid && (!showSavedState || isDirty) && !isSaving;
  const canGenerateNow = canManage && configurationSaved && !isDirty && isValid && !isGenerating;

  const badgeLabel = showSavedState
    ? 'Saved'
    : isDirty && configurationSaved
    ? 'Unsaved changes'
    : 'Unsaved';

  const badgeVariant: 'success' | 'warning' | 'default' = showSavedState
    ? 'success'
    : isDirty
    ? 'warning'
    : 'default';

  const formattedSavedAt = React.useMemo(() => {
    if (!savedAt) return null;
    try {
      const d = new Date(savedAt);
      if (Number.isNaN(d.getTime())) return null;
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return null;
    }
  }, [savedAt]);

  return (
    <View style={styles.container}>
      <View style={styles.statusHeader}>
        <View style={styles.statusLeft}>
          {showSavedState ? (
            <CheckCircle2 size={15} color="#15803D" />
          ) : null}
          <AppText style={styles.statusTitle}>
            {showSavedState
              ? 'Configuration saved to server'
              : isDirty && configurationSaved
              ? 'Changes not saved yet'
              : 'Save configuration to unlock schedule generation'}
          </AppText>
        </View>
        <Badge label={badgeLabel} variant={badgeVariant} size="sm" />
      </View>

      {showSavedState && formattedSavedAt ? (
        <AppText style={styles.metaText}>Last saved at {formattedSavedAt}</AppText>
      ) : null}

      {validationError ? (
        <AppText style={styles.errorText}>{validationError}</AppText>
      ) : null}

      {canManage ? (
        <View style={styles.buttonsCol}>
          {showSavedState ? (
            <Button
              label="Edit Configuration"
              variant="outline"
              onPress={onStartEditing}
              disabled={isGenerating}
              fullWidth
            />
          ) : (
            <Button
              label={isSaving ? 'Saving Configuration...' : 'Save Configuration'}
              variant="outline"
              onPress={onSave}
              disabled={!canSaveNow}
              loading={isSaving}
              fullWidth
            />
          )}

          {!isGenerated ? (
            <Button
              label={isGenerating ? 'Generating Schedule...' : generateLabel}
              variant="primary"
              onPress={onGenerate}
              disabled={!canGenerateNow}
              loading={isGenerating}
              fullWidth
            />
          ) : regenerateLabel ? (
            <Button
              label={isGenerating ? 'Regenerating Schedule...' : regenerateLabel}
              variant="secondary"
              onPress={onGenerate}
              disabled={!canGenerateNow}
              loading={isGenerating}
              fullWidth
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: Spacing[3.5],
    gap: Spacing[2],
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  statusLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  statusTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    flexShrink: 1,
  },
  metaText: {
    fontSize: 11.5,
    color: '#64748B',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B91C1C',
    lineHeight: 17,
  },
  buttonsCol: {
    gap: Spacing[2],
    marginTop: Spacing[1],
  },
});
