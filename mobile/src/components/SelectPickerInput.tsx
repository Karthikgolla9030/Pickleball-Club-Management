/**
 * Aught2 Pickleball — SelectPickerInput Component
 *
 * Standardized dropdown/select control matching the design system:
 * - 48px height, rounded corners, subtle border, white surface
 * - High-contrast readable typography
 * - Leading icon, placeholder, and chevron
 * - Integrated loading, error, and empty states
 * - Modal selection sheet that renders above all containers/modals without clipping
 * - Search filter for lists with multiple options
 */

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from 'react-native';
import {
  AlertCircle,
  Check,
  ChevronDown,
  RotateCw,
  Search,
  X,
} from 'lucide-react-native';

import { Colors, Dimensions, Radius, Spacing, Typography } from '@/theme';

export interface SelectPickerOption {
  value: string;
  label: string;
  subtitle?: string;
  badge?: string;
  disabled?: boolean;
}

export interface SelectPickerInputProps {
  label?: string;
  value?: string | null;
  options: SelectPickerOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  modalTitle?: string;
  leadingIcon?: React.ReactNode;
  isLoading?: boolean;
  loadingMessage?: string;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  testID?: string;
  containerStyle?: ViewStyle;
}

export function SelectPickerInput({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select an option',
  modalTitle,
  leadingIcon,
  isLoading = false,
  loadingMessage = 'Loading options...',
  error,
  onRetry,
  emptyTitle = 'No options available',
  emptyMessage = 'No options are currently configured.',
  emptyActionLabel,
  onEmptyAction,
  required = false,
  disabled = false,
  hint,
  testID,
  containerStyle,
}: SelectPickerInputProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Find currently selected option
  const selectedOption = useMemo(() => {
    if (!value) return null;
    return options.find((opt) => opt.value === value) || null;
  }, [value, options]);

  // Filter options by search query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const q = searchQuery.toLowerCase().trim();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.subtitle && opt.subtitle.toLowerCase().includes(q))
    );
  }, [options, searchQuery]);

  const displayLabel = label ? (required && !label.endsWith('*') ? `${label} *` : label) : undefined;
  const isControlDisabled = disabled || isLoading;

  const handleOpen = () => {
    if (isControlDisabled) return;
    setSearchQuery('');
    setModalVisible(true);
  };

  const handleSelect = (val: string) => {
    onChange(val);
    setModalVisible(false);
    setSearchQuery('');
  };

  return (
    <View style={[styles.container, containerStyle]} testID={testID ? `${testID}-container` : undefined}>
      {displayLabel && <Text style={styles.label}>{displayLabel}</Text>}

      {/* Main Trigger Button */}
      <TouchableOpacity
        testID={testID}
        style={[
          styles.inputRow,
          modalVisible && styles.inputFocused,
          !!error && styles.inputError,
          isControlDisabled && styles.inputDisabled,
        ]}
        onPress={handleOpen}
        activeOpacity={0.7}
        disabled={isControlDisabled}
        accessibilityRole="button"
        accessibilityLabel={label || placeholder}
      >
        {leadingIcon && (
          <View style={styles.leadingIconContainer}>
            {leadingIcon}
          </View>
        )}

        <View style={styles.textContainer}>
          {isLoading ? (
            <Text style={styles.placeholderText}>{loadingMessage}</Text>
          ) : selectedOption ? (
            <View style={styles.selectedValueCol}>
              <Text style={styles.valueText} numberOfLines={1} ellipsizeMode="tail">
                {selectedOption.label}
              </Text>
              {selectedOption.subtitle ? (
                <Text style={styles.valueSubtitle} numberOfLines={1} ellipsizeMode="tail">
                  {selectedOption.subtitle}
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.placeholderText} numberOfLines={1}>
              {placeholder}
            </Text>
          )}
        </View>

        {isLoading ? (
          <ActivityIndicator size="small" color={Colors.brand.primary} style={styles.trailingIcon} />
        ) : (
          <ChevronDown
            size={18}
            color={selectedOption ? Colors.brand.primary : Colors.text.tertiary}
            style={styles.trailingIcon}
          />
        )}
      </TouchableOpacity>

      {/* Error State */}
      {error && (
        <View style={styles.errorRow}>
          <AlertCircle size={14} color={Colors.status.error} />
          <Text style={styles.errorText}>{error}</Text>
          {onRetry && (
            <TouchableOpacity onPress={onRetry} style={styles.retryBtn} activeOpacity={0.7}>
              <RotateCw size={12} color={Colors.brand.primary} />
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Inline Empty State Banner when no options configured */}
      {!isLoading && !error && options.length === 0 && (
        <View style={styles.emptyInlineBanner}>
          <View style={styles.emptyInlineHeader}>
            <AlertCircle size={15} color="#B45309" />
            <Text style={styles.emptyInlineTitle}>{emptyTitle}</Text>
          </View>
          <Text style={styles.emptyInlineMessage}>{emptyMessage}</Text>
          {emptyActionLabel && onEmptyAction && (
            <TouchableOpacity
              style={styles.emptyInlineBtn}
              onPress={onEmptyAction}
              activeOpacity={0.8}
            >
              <Text style={styles.emptyInlineBtnText}>{emptyActionLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Hint if provided and no error */}
      {hint && !error && options.length > 0 && (
        <Text style={styles.hintText}>{hint}</Text>
      )}

      {/* Selection Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
        statusBarTranslucent
      >
        <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalContent}>
                {/* Header */}
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1, paddingRight: Spacing[2] }}>
                    <Text style={styles.modalTitle}>
                      {modalTitle || label?.replace(/\s*\*/, '') || 'Select Option'}
                    </Text>
                    <Text style={styles.modalSubtitle}>
                      {options.length} {options.length === 1 ? 'option' : 'options'} available
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.closeBtn}
                    onPress={() => setModalVisible(false)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <X size={18} color={Colors.text.secondary} />
                  </TouchableOpacity>
                </View>

                {/* Search Bar (shown when >= 4 options) */}
                {options.length >= 4 && (
                  <View style={styles.searchBar}>
                    <Search size={15} color={Colors.text.tertiary} style={styles.searchIcon} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search options..."
                      placeholderTextColor={Colors.text.tertiary}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {searchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <X size={14} color={Colors.text.tertiary} />
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Options List */}
                <ScrollView
                  style={styles.optionsList}
                  contentContainerStyle={styles.optionsListContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                >
                  {filteredOptions.length === 0 ? (
                    <View style={styles.emptyListContainer}>
                      <AlertCircle size={28} color="#B45309" />
                      <Text style={styles.emptyListTitle}>
                        {options.length === 0 ? emptyTitle : 'No matches found'}
                      </Text>
                      <Text style={styles.emptyListMessage}>
                        {options.length === 0
                          ? emptyMessage
                          : `No options match "${searchQuery}". Try a different search.`}
                      </Text>
                      {options.length === 0 && emptyActionLabel && onEmptyAction && (
                        <TouchableOpacity
                          style={styles.modalEmptyActionBtn}
                          onPress={() => {
                            setModalVisible(false);
                            onEmptyAction();
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.modalEmptyActionBtnText}>{emptyActionLabel}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    filteredOptions.map((opt) => {
                      const isSelected = value === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[
                            styles.optionCard,
                            isSelected && styles.optionCardSelected,
                            opt.disabled && styles.optionCardDisabled,
                          ]}
                          onPress={() => !opt.disabled && handleSelect(opt.value)}
                          activeOpacity={0.7}
                          disabled={opt.disabled}
                        >
                          <View style={styles.optionContentCol}>
                            <View style={styles.optionTitleRow}>
                              <Text
                                style={[
                                  styles.optionLabel,
                                  isSelected && styles.optionLabelSelected,
                                  opt.disabled && styles.optionLabelDisabled,
                                ]}
                                numberOfLines={1}
                              >
                                {opt.label}
                              </Text>
                              {opt.badge && (
                                <View style={[styles.badge, isSelected && styles.badgeSelected]}>
                                  <Text style={[styles.badgeText, isSelected && styles.badgeTextSelected]}>
                                    {opt.badge}
                                  </Text>
                                </View>
                              )}
                            </View>
                            {opt.subtitle ? (
                              <Text
                                style={[
                                  styles.optionSubtitle,
                                  isSelected && styles.optionSubtitleSelected,
                                ]}
                                numberOfLines={2}
                              >
                                {opt.subtitle}
                              </Text>
                            ) : null}
                          </View>

                          <View
                            style={[
                              styles.radioCircle,
                              isSelected && styles.radioCircleSelected,
                            ]}
                          >
                            {isSelected && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>

                {/* Footer */}
                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={styles.modalCloseBtn}
                    onPress={() => setModalVisible(false)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalCloseBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing[1.5],
  },
  label: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: Dimensions.inputHeight, // 48px
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingHorizontal: Spacing[3.5],
    paddingVertical: Spacing[2],
  },
  inputFocused: {
    borderColor: Colors.brand.primary,
    borderWidth: 1.5,
  },
  inputError: {
    borderColor: Colors.status.error,
    borderWidth: 1.5,
  },
  inputDisabled: {
    backgroundColor: Colors.surface.elevated,
    opacity: 0.6,
  },
  leadingIconContainer: {
    marginRight: Spacing[2.5],
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  selectedValueCol: {
    gap: 1,
  },
  valueText: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
  },
  valueSubtitle: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
  },
  placeholderText: {
    fontSize: Typography.size.base,
    color: Colors.text.tertiary,
  },
  trailingIcon: {
    marginLeft: Spacing[2],
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1.5],
    marginTop: 2,
  },
  errorText: {
    fontSize: Typography.size.xs,
    color: Colors.status.error,
    flex: 1,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.brand.primaryLight,
  },
  retryText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    color: Colors.brand.primary,
  },
  hintText: {
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
    marginTop: 2,
  },

  // Inline Empty State Banner
  emptyInlineBanner: {
    backgroundColor: '#FEFCE8',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: Radius.md,
    padding: Spacing[3],
    marginTop: 4,
    gap: Spacing[1.5],
  },
  emptyInlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  emptyInlineTitle: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: '#92400E',
  },
  emptyInlineMessage: {
    fontSize: Typography.size.xs,
    color: '#B45309',
    lineHeight: 18,
  },
  emptyInlineBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#176B57',
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1.5],
    borderRadius: Radius.md,
    marginTop: Spacing[1],
  },
  emptyInlineBtnText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
    color: '#FFFFFF',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[4],
  },
  modalContent: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.xl,
    padding: Spacing[4],
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: Spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.surface.border,
  },
  modalTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
  },
  modalSubtitle: {
    fontSize: Typography.size.xs,
    color: Colors.brand.primary,
    fontWeight: Typography.weight.medium,
    marginTop: 2,
  },
  closeBtn: {
    padding: Spacing[1],
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    backgroundColor: Colors.surface.elevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    paddingHorizontal: Spacing[3],
    marginTop: Spacing[3],
    marginBottom: Spacing[2],
  },
  searchIcon: {
    marginRight: Spacing[2],
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.size.sm,
    color: Colors.text.primary,
    paddingVertical: Platform.OS === 'web' ? 0 : Spacing[1],
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  optionsList: {
    maxHeight: 340,
    marginTop: Spacing[2],
  },
  optionsListContent: {
    gap: Spacing[2],
    paddingVertical: Spacing[1],
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[3.5],
    paddingVertical: Spacing[3],
    backgroundColor: '#F8FAF9',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  optionCardSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: Colors.brand.primary,
    borderWidth: 1.5,
  },
  optionCardDisabled: {
    opacity: 0.4,
  },
  optionContentCol: {
    flex: 1,
    paddingRight: Spacing[2.5],
    gap: 3,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  optionLabel: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.primary,
  },
  optionLabelSelected: {
    color: Colors.brand.primaryDark,
    fontWeight: Typography.weight.bold,
  },
  optionLabelDisabled: {
    color: Colors.text.tertiary,
  },
  badge: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 1,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface.border,
  },
  badgeSelected: {
    backgroundColor: Colors.brand.primaryLight,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: Typography.weight.bold,
    color: Colors.text.secondary,
  },
  badgeTextSelected: {
    color: Colors.brand.primary,
  },
  optionSubtitle: {
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
    lineHeight: 16,
  },
  optionSubtitleSelected: {
    color: Colors.brand.primary,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Colors.surface.border,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  emptyListContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing[6],
    paddingHorizontal: Spacing[4],
    gap: Spacing[2],
  },
  emptyListTitle: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.bold,
    color: Colors.text.primary,
    textAlign: 'center',
  },
  emptyListMessage: {
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalEmptyActionBtn: {
    backgroundColor: Colors.brand.primary,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2.5],
    borderRadius: Radius.md,
    marginTop: Spacing[2],
  },
  modalEmptyActionBtnText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: '#FFFFFF',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: Spacing[3],
    marginTop: Spacing[2],
    borderTopWidth: 1,
    borderTopColor: Colors.surface.border,
  },
  modalCloseBtn: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.elevated,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  modalCloseBtnText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: Colors.text.secondary,
  },
});

