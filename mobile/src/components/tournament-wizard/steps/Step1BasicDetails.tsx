/**
 * Aught2 Pickleball — Step 1: Basic Details
 *
 * Collects:
 * - Tournament Name (required)
 * - Description (optional notes)
 * - Venue / Location (location_name)
 * - Club / Organizer Context (derived from active club, read-only)
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { Input } from '@/components/Input';
import { Colors, Radius, Spacing } from '@/theme';
import type { TournamentWizardState } from '../types';

interface Step1BasicDetailsProps {
  state: TournamentWizardState;
  onChange: (patch: Partial<TournamentWizardState>) => void;
  clubName?: string;
  errors?: Record<string, string>;
}

export function Step1BasicDetails({
  state,
  onChange,
  clubName,
  errors,
}: Step1BasicDetailsProps) {
  return (
    <View style={styles.container}>
      {/* Active Club / Organizer Context */}
      <Card style={styles.clubContextCard}>
        <AppText variant="caption" color="tertiary" style={styles.contextLabel}>
          ORGANIZER / HOST CLUB
        </AppText>
        <View style={styles.clubNameRow}>
          <AppText variant="heading3" style={styles.clubName}>
            {clubName || 'Aught2 Pickleball Club'}
          </AppText>
          <Badge label="Active Club" variant="info" />
        </View>
        <AppText variant="caption" color="secondary" style={styles.contextHint}>
          Tournament will automatically be created under and scoped to this club.
        </AppText>
      </Card>

      {/* Tournament Name */}
      <Input
        label="Tournament Name *"
        placeholder="e.g. Austin Pickleball Open"
        value={state.name}
        onChangeText={(name) => onChange({ name })}
        error={errors?.name}
        hint="Give your event a clear, descriptive title"
      />

      {/* Venue / Location */}
      <Input
        label="Venue / Location"
        placeholder="e.g. Aught2 Pickleball Central, Courts 1-6"
        value={state.locationName}
        onChangeText={(locationName) => onChange({ locationName })}
        error={errors?.locationName}
        hint="Where matches will be played"
      />

      {/* Description */}
      <Input
        label="Description / Event Notes"
        placeholder="Details, prize information, spectator policy, schedule breakdown..."
        value={state.description}
        onChangeText={(description) => onChange({ description })}
        multiline
        numberOfLines={4}
        error={errors?.description}
        hint="Optional details visible to participants"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[3],
  },
  clubContextCard: {
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: Radius.md,
    padding: Spacing[3],
    marginBottom: Spacing[1],
  },
  contextLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: Spacing[1],
  },
  clubNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[2],
    flexWrap: 'wrap',
  },
  clubName: {
    color: Colors.text.primary,
    fontSize: 16,
  },
  contextHint: {
    marginTop: Spacing[1],
    fontSize: 12,
  },
});
