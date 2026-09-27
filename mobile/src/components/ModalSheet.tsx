/**
 * ModalSheet — Standardized bottom-sheet / modal component.
 *
 * Provides a consistent structure across all modal forms:
 *   ┌─────────────────────────────────┐
 *   │ Title                        ✕  │
 *   ├─────────────────────────────────┤
 *   │                                 │
 *   │ Scrollable content (forms etc.) │
 *   │                                 │
 *   ├─────────────────────────────────┤
 *   │ [Cancel]          [Primary CTA] │
 *   └─────────────────────────────────┘
 *
 * Handles:
 * - KeyboardAvoidingView so inputs stay visible
 * - Safe area bottom inset
 * - Prevent backdrop content from being interactive
 * - Consistent padding, radius, shadow
 */

import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Colors, Radius, Shadows, Spacing, Typography } from '@/theme';

interface ModalFooterAction {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
}

interface ModalSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Footer action buttons. First is secondary (cancel), last is primary. */
  actions?: ModalFooterAction[];
  children: React.ReactNode;
  /** Max height fraction of screen (default 0.9) */
  maxHeightFraction?: number;
}

export function ModalSheet({
  visible,
  onClose,
  title,
  subtitle,
  actions,
  children,
  maxHeightFraction = 0.92,
}: ModalSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // Explicit pixel ceiling ensures children can calculate flex shrinkage and scroll properly on Web and mobile
  const maxSheetHeight = Math.min(
    Math.round(windowHeight * maxHeightFraction),
    windowHeight - insets.top - (Platform.OS === 'web' ? 24 : 12)
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
          pointerEvents="box-none"
        >
          <Pressable
            style={[
              styles.sheet,
              {
                maxHeight: maxSheetHeight,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Handle bar */}
            <View style={styles.handleBar} />

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerText}>
                <AppText variant="heading3" numberOfLines={2} style={styles.title}>
                  {title}
                </AppText>
                {subtitle ? (
                  <AppText variant="bodySmall" color="secondary" style={styles.subtitle}>
                    {subtitle}
                  </AppText>
                ) : null}
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <AppText style={styles.closeIcon}>✕</AppText>
              </TouchableOpacity>
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Scrollable Content */}
            <ScrollView
              style={styles.content}
              contentContainerStyle={styles.contentInner}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
              bounces={true}
              nestedScrollEnabled={true}
            >
              {children}
            </ScrollView>

            {/* Footer Actions */}
            {actions && actions.length > 0 && (
              <>
                <View style={styles.divider} />
                <View
                  style={[
                    styles.footer,
                    { paddingBottom: Math.max(insets.bottom, Spacing[4]) },
                  ]}
                >
                  {actions.map((action, index) => {
                    const isPrimary = index === actions.length - 1;
                    const bgColor =
                      action.variant === 'danger'
                        ? Colors.status.errorBg
                        : isPrimary
                        ? Colors.brand.primary
                        : Colors.surface.elevated;
                    const textColor =
                      action.variant === 'danger'
                        ? Colors.status.error
                        : isPrimary
                        ? Colors.white
                        : Colors.text.primary;
                    const borderColor =
                      action.variant === 'danger'
                        ? Colors.status.error
                        : !isPrimary
                        ? Colors.surface.border
                        : 'transparent';

                    return (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.footerButton,
                          { backgroundColor: bgColor, borderColor },
                          (action.disabled || action.loading) && styles.buttonDisabled,
                        ]}
                        onPress={action.onPress}
                        disabled={action.disabled || action.loading}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={action.label}
                        accessibilityState={{ disabled: action.disabled || action.loading }}
                      >
                        <AppText
                          numberOfLines={1}
                          style={[styles.footerButtonLabel, { color: textColor }]}
                        >
                          {action.loading ? 'Loading...' : action.label}
                        </AppText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.background.overlay,
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  keyboardView: {
    width: '100%',
    maxHeight: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: 540,
    backgroundColor: Colors.surface.default,
    borderTopLeftRadius: Radius['3xl'],
    borderTopRightRadius: Radius['3xl'],
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: Colors.surface.border,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    ...Shadows.lg,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface.border,
    alignSelf: 'center',
    marginTop: Spacing[2],
    marginBottom: Spacing[1],
    flexShrink: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[3],
    paddingBottom: Spacing[3],
    gap: Spacing[3],
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
    gap: Spacing[1],
  },
  title: {
    flexShrink: 1,
  },
  subtitle: {
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  closeIcon: {
    color: Colors.text.secondary,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surface.border,
    marginHorizontal: Spacing[5],
    flexShrink: 0,
  },
  content: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
  },
  contentInner: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    gap: Spacing[3],
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[3],
    gap: Spacing[3],
    flexShrink: 0,
    backgroundColor: Colors.surface.default,
  },
  footerButton: {
    flex: 1,
    height: 46,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    ...Shadows.sm,
  },
  footerButtonLabel: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
});
