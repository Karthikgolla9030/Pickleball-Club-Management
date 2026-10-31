/**
 * Aught2 Pickleball — Standardized Platform Admin Legal Document Editor
 *
 * Shared editor modal for Player Terms, Club Terms, Privacy Policy, and Club Agreement:
 * - Version identifier, title, effective date, and change summary
 * - Mandatory renewed user acceptance toggle with clear explanation
 * - Dual-tabbed markdown content authoring: "Write" and "Formatted Preview"
 * - Compact controls with validation and responsive formatting
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AlertCircle, Edit3, Eye, FileText, X } from 'lucide-react-native';

import { AppText } from '@/components/AppText';

export interface LegalEditorFormData {
  versionId?: string;
  version: string;
  title: string;
  content: string;
  change_summary?: string;
  requires_renewed_acceptance: boolean;
  effective_date?: string;
}

export interface LegalDocumentEditorModalProps {
  visible: boolean;
  documentTypeLabel: string;
  initialData: LegalEditorFormData;
  isSubmitting: boolean;
  onClose: () => void;
  onSaveDraft: (data: LegalEditorFormData) => void;
  onPublishNow?: (data: LegalEditorFormData) => void;
}

export function LegalDocumentEditorModal({
  visible,
  documentTypeLabel,
  initialData,
  isSubmitting,
  onClose,
  onSaveDraft,
  onPublishNow,
}: LegalDocumentEditorModalProps) {
  const [formData, setFormData] = useState<LegalEditorFormData>(initialData);
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync when visible changes
  React.useEffect(() => {
    if (visible) {
      setFormData(initialData);
      setActiveTab('write');
      setValidationError(null);
    }
  }, [visible, initialData]);

  const validate = (): boolean => {
    if (!formData.version.trim()) {
      setValidationError('Please enter a version identifier (e.g. 1.1).');
      return false;
    }
    if (!formData.title.trim()) {
      setValidationError('Please enter a document title.');
      return false;
    }
    if (!formData.content.trim()) {
      setValidationError('Document content cannot be empty.');
      return false;
    }
    setValidationError(null);
    return true;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSaveDraft(formData);
  };

  const handlePublish = () => {
    if (!validate()) return;
    if (onPublishNow) {
      onPublishNow(formData);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerTitleGroup}>
              <AppText style={styles.modalTitle}>
                {formData.versionId ? `Edit Draft (${formData.version})` : `New Version Draft`}
              </AppText>
              <AppText style={styles.modalSubtitle}>{documentTypeLabel}</AppText>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Validation Alert */}
          {validationError && (
            <View style={styles.errorBanner}>
              <AlertCircle size={15} color="#DC2626" />
              <AppText style={styles.errorBannerText}>{validationError}</AppText>
            </View>
          )}

          {/* Body */}
          <ScrollView style={styles.modalScrollBody} showsVerticalScrollIndicator={false}>
            {/* Version & Title row */}
            <View style={styles.twoColRow}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <AppText style={styles.fieldLabel}>Version *</AppText>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 1.1"
                  placeholderTextColor="#94A3B8"
                  value={formData.version}
                  onChangeText={(t) => setFormData((p) => ({ ...p, version: t }))}
                />
              </View>

              <View style={[styles.fieldGroup, { flex: 2 }]}>
                <AppText style={styles.fieldLabel}>Title *</AppText>
                <TextInput
                  style={styles.input}
                  placeholder="Document Title"
                  placeholderTextColor="#94A3B8"
                  value={formData.title}
                  onChangeText={(t) => setFormData((p) => ({ ...p, title: t }))}
                />
              </View>
            </View>

            {/* Change Summary */}
            <View style={styles.fieldGroup}>
              <AppText style={styles.fieldLabel}>Summary of Changes</AppText>
              <TextInput
                style={styles.input}
                placeholder="e.g. Clarified cancellation policies and dispute resolution terms"
                placeholderTextColor="#94A3B8"
                value={formData.change_summary ?? ''}
                onChangeText={(t) => setFormData((p) => ({ ...p, change_summary: t }))}
              />
            </View>

            {/* Renewed Acceptance Toggle */}
            <View style={styles.switchBox}>
              <View style={styles.switchTextCol}>
                <AppText style={styles.switchTitle}>Require Renewed User Acceptance</AppText>
                <AppText style={styles.switchDescription}>
                  When published, users will be required to review and accept this version before continuing.
                </AppText>
              </View>
              <Switch
                value={formData.requires_renewed_acceptance}
                onValueChange={(v) =>
                  setFormData((p) => ({ ...p, requires_renewed_acceptance: v }))
                }
                trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                thumbColor={formData.requires_renewed_acceptance ? '#15803D' : '#F1F5F9'}
              />
            </View>

            {/* Editor Tab Switcher */}
            <View style={styles.editorTabRow}>
              <View style={styles.tabPillGroup}>
                <TouchableOpacity
                  style={[styles.editorTabBtn, activeTab === 'write' && styles.editorTabBtnActive]}
                  onPress={() => setActiveTab('write')}
                  activeOpacity={0.8}
                >
                  <Edit3 size={13} color={activeTab === 'write' ? '#0F172A' : '#64748B'} />
                  <AppText
                    style={[
                      styles.editorTabBtnText,
                      activeTab === 'write' && styles.editorTabBtnTextActive,
                    ]}
                  >
                    Write Content
                  </AppText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.editorTabBtn, activeTab === 'preview' && styles.editorTabBtnActive]}
                  onPress={() => setActiveTab('preview')}
                  activeOpacity={0.8}
                >
                  <Eye size={13} color={activeTab === 'preview' ? '#0F172A' : '#64748B'} />
                  <AppText
                    style={[
                      styles.editorTabBtnText,
                      activeTab === 'preview' && styles.editorTabBtnTextActive,
                    ]}
                  >
                    Formatted Preview
                  </AppText>
                </TouchableOpacity>
              </View>
            </View>

            {/* Editor Area */}
            {activeTab === 'write' ? (
              <View style={styles.fieldGroup}>
                <TextInput
                  style={styles.textArea}
                  placeholder="Enter full legal document text using markdown..."
                  placeholderTextColor="#94A3B8"
                  value={formData.content}
                  onChangeText={(t) => setFormData((p) => ({ ...p, content: t }))}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            ) : (
              <View style={styles.previewBox}>
                <AppText style={styles.previewTitleText}>
                  {formData.title || documentTypeLabel} (v{formData.version || '1.0'})
                </AppText>
                <AppText style={styles.previewContentText}>
                  {formData.content || 'No content entered yet.'}
                </AppText>
              </View>
            )}
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.btnSecondary} onPress={onClose} disabled={isSubmitting}>
              <AppText style={styles.btnSecondaryText}>Cancel</AppText>
            </TouchableOpacity>

            <View style={styles.footerRightGroup}>
              <TouchableOpacity
                style={styles.btnSaveDraft}
                onPress={handleSave}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#0F172A" />
                ) : (
                  <AppText style={styles.btnSaveDraftText}>Save Draft</AppText>
                )}
              </TouchableOpacity>

              {onPublishNow && (
                <TouchableOpacity
                  style={styles.btnPublishPrimary}
                  onPress={handlePublish}
                  disabled={isSubmitting}
                >
                  <AppText style={styles.btnPublishPrimaryText}>Publish Live</AppText>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 760,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    ...Platform.select({
      web: { boxShadow: '0 10px 25px rgba(0,0,0,0.12)' },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitleGroup: {
    flex: 1,
    paddingRight: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderBottomWidth: 1,
    borderBottomColor: '#FECACA',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorBannerText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
    flex: 1,
  },
  modalScrollBody: {
    padding: 16,
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 12,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 5,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 38,
    fontSize: 13,
    color: '#0F172A',
  },
  textArea: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 12,
    minHeight: 220,
    fontSize: 12.5,
    color: '#0F172A',
    lineHeight: 18,
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
  },
  switchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  switchTextCol: {
    flex: 1,
    paddingRight: 10,
  },
  switchTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  switchDescription: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  editorTabRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tabPillGroup: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    padding: 2,
    borderRadius: 7,
    gap: 2,
  },
  editorTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  editorTabBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  editorTabBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  editorTabBtnTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  previewBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 14,
    minHeight: 220,
    marginBottom: 12,
  },
  previewTitleText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  previewContentText: {
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 19,
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  footerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnSecondary: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  btnSaveDraft: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSaveDraftText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  btnPublishPrimary: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#15803D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPublishPrimaryText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

