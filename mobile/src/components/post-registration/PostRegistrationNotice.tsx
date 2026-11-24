/**
 * Aught2 Pickleball — PostRegistrationNotice
 *
 * Standardized status and constraint alert callout for post-registration configuration cards.
 * Provides comfortable line heights, unclipped text wrapping, and clear visual hierarchy.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react-native';
import { AppText } from '@/components/AppText';
import { Radius, Spacing } from '@/theme';

export type NoticeVariant = 'info' | 'warning' | 'success' | 'error';

export interface PostRegistrationNoticeProps {
  variant?: NoticeVariant;
  title?: string;
  message: string | React.ReactNode;
  icon?: React.ReactNode;
}

export function PostRegistrationNotice({
  variant = 'info',
  title,
  message,
  icon,
}: PostRegistrationNoticeProps) {
  const getDefaultIcon = () => {
    switch (variant) {
      case 'warning':
        return <AlertTriangle size={17} color="#D97706" />;
      case 'success':
        return <CheckCircle2 size={17} color="#0F766E" />;
      case 'error':
        return <AlertCircle size={17} color="#DC2626" />;
      case 'info':
      default:
        return <Info size={17} color="#0F766E" />;
    }
  };

  const getContainerStyle = () => {
    switch (variant) {
      case 'warning':
        return styles.warningBox;
      case 'success':
        return styles.successBox;
      case 'error':
        return styles.errorBox;
      case 'info':
      default:
        return styles.infoBox;
    }
  };

  const getTitleStyle = () => {
    switch (variant) {
      case 'warning':
        return styles.warningTitle;
      case 'success':
        return styles.successTitle;
      case 'error':
        return styles.errorTitle;
      case 'info':
      default:
        return styles.infoTitle;
    }
  };

  const getTextStyle = () => {
    switch (variant) {
      case 'warning':
        return styles.warningText;
      case 'success':
        return styles.successText;
      case 'error':
        return styles.errorText;
      case 'info':
      default:
        return styles.infoText;
    }
  };

  return (
    <View style={[styles.container, getContainerStyle()]}>
      <View style={styles.iconColumn}>{icon ?? getDefaultIcon()}</View>
      <View style={styles.contentColumn}>
        {title ? <AppText style={[styles.title, getTitleStyle()]}>{title}</AppText> : null}
        {typeof message === 'string' ? (
          <AppText style={[styles.text, getTextStyle()]}>{message}</AppText>
        ) : (
          message
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2.5],
    paddingVertical: Spacing[2.5],
    paddingHorizontal: Spacing[3],
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  iconColumn: {
    marginTop: 1,
    flexShrink: 0,
  },
  contentColumn: {
    flex: 1,
    minWidth: 0, // Crucial for text wrapping inside flex containers
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
    lineHeight: 16,
  },
  text: {
    fontSize: 12,
    lineHeight: 17,
  },
  // Variant: Info
  infoBox: {
    backgroundColor: '#F0FDFA',
    borderColor: '#CCFBF1',
  },
  infoTitle: {
    color: '#0F766E',
  },
  infoText: {
    color: '#134E4A',
  },
  // Variant: Warning
  warningBox: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  warningTitle: {
    color: '#92400E',
  },
  warningText: {
    color: '#78350F',
  },
  // Variant: Success
  successBox: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  successTitle: {
    color: '#166534',
  },
  successText: {
    color: '#14532D',
  },
  // Variant: Error
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  errorTitle: {
    color: '#991B1B',
  },
  errorText: {
    color: '#7F1D1D',
  },
});
