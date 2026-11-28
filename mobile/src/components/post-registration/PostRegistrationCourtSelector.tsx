/**
 * Aught2 Pickleball — PostRegistrationCourtSelector
 *
 * Interactive selector for active club courts and bounded concurrent court capacity
 * (`<= selectedCourtIds.length`). Shared across all four tournament formats.
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AlertCircle, CheckCircle2, LayoutGrid } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { PostRegistrationStepper } from './PostRegistrationStepper';
import { Radius, Spacing } from '@/theme';
import type { SetupCourtItem } from '@/types';

export interface PostRegistrationCourtSelectorProps {
  availableCourts: SetupCourtItem[];
  selectedCourtIds: string[];
  courtsCount: number;
  disabled?: boolean;
  onToggleCourt: (courtId: string) => void;
  onCourtsCountChange: (count: number) => void;
}

export function PostRegistrationCourtSelector({
  availableCourts,
  selectedCourtIds,
  courtsCount,
  disabled = false,
  onToggleCourt,
  onCourtsCountChange,
}: PostRegistrationCourtSelectorProps) {
  const activeCourts = availableCourts.filter((c) => c.is_active);
  const selectedSet = new Set(selectedCourtIds);
  const selectedActiveCount = activeCourts.filter((c) => selectedSet.has(c.id)).length;
  const maxCapacity = Math.max(1, selectedActiveCount);
  const clampedCount =
    selectedActiveCount > 0 ? Math.max(1, Math.min(courtsCount, selectedActiveCount)) : 0;

  return (
    <View style={styles.container}>
      {activeCourts.length === 0 ? (
        <View style={styles.emptyBox}>
          <AlertCircle size={15} color="#B45309" />
          <AppText style={styles.emptyText}>
            No active club courts available. Activate at least 1 court in Club Facilities before
            configuring or generating matches.
          </AppText>
        </View>
      ) : (
        <>
          <View style={styles.sectionLabelRow}>
            <LayoutGrid size={14} color="#0F766E" />
            <AppText style={styles.sectionLabel}>
              Selected courts ({selectedActiveCount} of {activeCourts.length} selected)
            </AppText>
          </View>

          <View style={styles.courtChipsGrid}>
            {activeCourts.map((court) => {
              const isSelected = selectedSet.has(court.id);
              const envText = court.surface_type
                ? court.surface_type
                : court.indoor_outdoor
                ? court.indoor_outdoor.charAt(0).toUpperCase() + court.indoor_outdoor.slice(1)
                : '';

              return (
                <TouchableOpacity
                  key={court.id}
                  style={[
                    styles.courtChip,
                    isSelected && styles.courtChipSelected,
                    disabled && styles.courtChipDisabled,
                  ]}
                  onPress={() => onToggleCourt(court.id)}
                  disabled={disabled}
                  activeOpacity={0.75}
                >
                  {isSelected ? (
                    <CheckCircle2 size={14} color="#0F766E" />
                  ) : (
                    <View style={styles.uncheckedCircle} />
                  )}
                  <View style={styles.courtTextWrap}>
                    <AppText
                      style={[styles.courtName, isSelected && styles.courtNameSelected]}
                      numberOfLines={1}
                    >
                      {court.name}
                    </AppText>
                    {envText ? (
                      <AppText style={styles.courtMeta} numberOfLines={1}>
                        {envText}
                      </AppText>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedActiveCount === 0 ? (
            <View style={styles.warningBox}>
              <AlertCircle size={14} color="#B45309" />
              <AppText style={styles.warningText}>
                Select at least 1 active court to allocate matches.
              </AppText>
            </View>
          ) : (
            <>
              <PostRegistrationStepper
                label="Concurrent court capacity"
                helperText={`Up to ${selectedActiveCount} simultaneous match${selectedActiveCount === 1 ? '' : 'es'} from selected courts`}
                value={clampedCount}
                unit={clampedCount === 1 ? 'court' : 'courts'}
                min={1}
                max={maxCapacity}
                disabled={disabled}
                onChange={onCourtsCountChange}
              />
              {selectedActiveCount > clampedCount && (
                <View style={styles.warningBox}>
                  <AlertCircle size={14} color="#B45309" />
                  <AppText style={styles.warningText}>
                    {selectedActiveCount - clampedCount} selected court
                    {selectedActiveCount - clampedCount === 1 ? ' will remain' : 's will remain'}{' '}
                    unused concurrently (capacity {clampedCount} of {selectedActiveCount}).
                  </AppText>
                </View>
              )}
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[2.5],
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
  },
  courtChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  courtChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing[2.5],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    minWidth: 130,
    maxWidth: '100%',
  },
  courtChipSelected: {
    backgroundColor: '#F0FDF9',
    borderColor: '#0F766E',
    borderWidth: 1.5,
  },
  courtChipDisabled: {
    opacity: 0.65,
  },
  uncheckedCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
  },
  courtTextWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  courtName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  courtNameSelected: {
    color: '#0F766E',
  },
  courtMeta: {
    fontSize: 11,
    color: '#64748B',
  },
  emptyBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: Radius.md,
    padding: Spacing[2.5],
  },
  emptyText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    lineHeight: 17,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: Radius.sm,
    padding: Spacing[2],
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
  },
});
