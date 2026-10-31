/**
 * Aught2 Pickleball — Standardized Platform Admin Legal Version History Card
 *
 * Reusable version history table/list for Player Terms, Club Terms, Privacy Policy, and Club Agreement.
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Edit2, Eye, History, Send } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { LegalDocumentVersionItem } from '@/services/api';
import { LegalStatusBadge } from './LegalSharedComponents';

export interface LegalVersionHistoryCardProps {
  versions: LegalDocumentVersionItem[];
  onPreviewVersion: (ver: LegalDocumentVersionItem) => void;
  onEditDraft?: (ver: LegalDocumentVersionItem) => void;
  onPublishDraft?: (ver: LegalDocumentVersionItem) => void;
}

export function LegalVersionHistoryCard({
  versions,
  onPreviewVersion,
  onEditDraft,
  onPublishDraft,
}: LegalVersionHistoryCardProps) {
  const { width } = useWindowDimensions();
  const isNarrow = width < 480;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <History size={16} color="#0F172A" strokeWidth={2.2} />
          <AppText style={styles.headerTitle}>Version History</AppText>
          <View style={styles.countBadge}>
            <AppText style={styles.countBadgeText}>{versions.length}</AppText>
          </View>
        </View>
      </View>

      {versions.length === 0 ? (
        <AppText style={styles.emptyNote}>No historical versions on record.</AppText>
      ) : (
        <View style={styles.list}>
          {versions.map((ver, idx) => {
            const isDraft = (ver.status || '').toLowerCase() === 'draft';
            return (
              <View
                key={ver.id}
                style={[styles.row, idx === versions.length - 1 && styles.rowLast]}
              >
                <View style={styles.rowLeft}>
                  <View style={styles.versionChip}>
                    <AppText style={styles.versionChipText}>v{ver.version}</AppText>
                  </View>

                  <LegalStatusBadge status={ver.status} size="sm" />

                  <View style={styles.metaCol}>
                    <AppText style={styles.versionTitle} numberOfLines={1}>
                      {ver.title}
                    </AppText>

                    <View style={styles.datesRow}>
                      <AppText style={styles.dateText}>
                        {ver.effective_date
                          ? `Effective: ${new Date(ver.effective_date).toLocaleDateString()}`
                          : `Created: ${new Date(ver.created_at).toLocaleDateString()}`}
                      </AppText>
                      {ver.requires_renewed_acceptance && (
                        <AppText style={styles.renewedTag}>• Re-acceptance</AppText>
                      )}
                    </View>

                    {ver.change_summary ? (
                      <AppText style={styles.summaryText} numberOfLines={2}>
                        {ver.change_summary}
                      </AppText>
                    ) : null}
                  </View>
                </View>

                {/* Actions */}
                <View style={[styles.rowActions, isNarrow && styles.rowActionsNarrow]}>
                  <TouchableOpacity
                    style={styles.actionIconBtn}
                    onPress={() => onPreviewVersion(ver)}
                    accessibilityLabel="Preview this version"
                  >
                    <Eye size={14} color="#0F172A" />
                  </TouchableOpacity>

                  {isDraft && onEditDraft && (
                    <TouchableOpacity
                      style={styles.actionIconBtn}
                      onPress={() => onEditDraft(ver)}
                      accessibilityLabel="Edit draft version"
                    >
                      <Edit2 size={14} color="#0F172A" />
                    </TouchableOpacity>
                  )}

                  {isDraft && onPublishDraft && (
                    <TouchableOpacity
                      style={styles.publishBtnSmall}
                      onPress={() => onPublishDraft(ver)}
                      accessibilityLabel="Publish version"
                    >
                      <Send size={11} color="#FFFFFF" />
                      <AppText style={styles.publishBtnSmallText}>Publish</AppText>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  countBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  emptyNote: {
    fontSize: 12,
    color: '#94A3B8',
    paddingVertical: 8,
  },
  list: {
    gap: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
    gap: 10,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  versionChip: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 5,
    flexShrink: 0,
  },
  versionChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  metaCol: {
    flex: 1,
    minWidth: 0,
  },
  versionTitle: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  datesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 1,
    flexWrap: 'wrap',
  },
  dateText: {
    fontSize: 11,
    color: '#64748B',
  },
  renewedTag: {
    fontSize: 11,
    color: '#D97706',
    fontWeight: '600',
  },
  summaryText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  rowActionsNarrow: {
    flexDirection: 'row',
    gap: 4,
  },
  actionIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#15803D',
  },
  publishBtnSmallText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

