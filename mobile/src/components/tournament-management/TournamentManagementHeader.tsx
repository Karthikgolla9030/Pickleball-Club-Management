/**
 * Aught2 Pickleball — TournamentManagementHeader
 *
 * Standardized tournament header and dynamic format/category-aware navigation tab bar:
 * - Premium, clean light-theme design
 * - Displays Tournament Name, Format Badge, Category Badge, Status Badge
 * - Schedule, Location, and Participant progress
 * - Contextual lifecycle primary CTA and secondary actions menu button
 * - Horizontal, touch-friendly tab bar with Lucide icons and count badges
 */

import React from 'react';
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowLeft,
  Award,
  Calendar,
  CheckCircle2,
  GitFork,
  Layers,
  LayoutDashboard,
  MapPin,
  MoreVertical,
  Settings,
  SlidersHorizontal,
  Swords,
  Trophy,
  Users,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import {
  getFormatDisplayLabel,
  type TournamentNavTabItem,
  type TournamentTabKey,
} from '@/navigation';
import { Radius, Spacing } from '@/theme';
import type { Tournament } from '@/types';
import { parseTournamentConfig } from '@/utils/tournamentCapacity';

interface TournamentManagementHeaderProps {
  tournament: Tournament | null;
  tabs: TournamentNavTabItem[];
  activeTab: TournamentTabKey;
  onTabChange: (tab: TournamentTabKey) => void;
  onBack: () => void;
  onOptionsPress: () => void;
  canManage?: boolean;
  primaryAction?: {
    label: string;
    onPress: () => void;
    isLoading?: boolean;
    variant?: 'primary' | 'secondary' | 'danger';
  } | null;
}

function renderTabIcon(iconName: string, color: string, size = 18) {
  switch (iconName) {
    case 'LayoutDashboard':
      return <LayoutDashboard size={size} color={color} />;
    case 'Users':
      return <Users size={size} color={color} />;
    case 'GitFork':
      return <GitFork size={size} color={color} />;
    case 'Swords':
      return <Swords size={size} color={color} />;
    case 'Layers':
      return <Layers size={size} color={color} />;
    case 'Award':
      return <Award size={size} color={color} />;
    case 'Trophy':
      return <Trophy size={size} color={color} />;
    case 'SlidersHorizontal':
      return <SlidersHorizontal size={size} color={color} />;
    case 'CheckCircle2':
      return <CheckCircle2 size={size} color={color} />;
    case 'Settings':
      return <Settings size={size} color={color} />;
    default:
      return <LayoutDashboard size={size} color={color} />;
  }
}

function getStatusBadgeConfig(status?: string) {
  switch (status?.toLowerCase()) {
    case 'in_progress':
      return { bg: '#E0F2FE', text: '#0369A1', label: 'IN PROGRESS' };
    case 'cancelled':
      return { bg: '#FEE2E2', text: '#B91C1C', label: 'CANCELLED' };
    case 'completed':
      return { bg: '#E2E8F0', text: '#334155', label: 'COMPLETED' };
    case 'registration_open':
    case 'open':
      return { bg: '#DCFCE7', text: '#15803D', label: 'REGISTRATION OPEN' };
    case 'registration_closed':
      return { bg: '#F1F5F9', text: '#475569', label: 'REGISTRATION CLOSED' };
    case 'draft':
    default:
      return { bg: '#FEF3C7', text: '#B45309', label: 'DRAFT' };
  }
}

export function TournamentManagementHeader({
  tournament,
  tabs,
  activeTab,
  onTabChange,
  onBack,
  onOptionsPress,
  primaryAction,
}: TournamentManagementHeaderProps) {
  const parsedConfig = parseTournamentConfig(tournament);
  const statusConfig = getStatusBadgeConfig(tournament?.status);
  const formatLabel = tournament?.format_label || getFormatDisplayLabel(tournament?.format);
  const categoryLabel = parsedConfig.category || (parsedConfig.isSingles ? 'Singles' : 'Doubles');

  const formattedDate = React.useMemo(() => {
    if (!tournament?.start_date) return null;
    try {
      return new Date(tournament.start_date).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return tournament.start_date;
    }
  }, [tournament?.start_date]);

  return (
    <View style={styles.headerWrapper}>
      {/* ─── Top Bar: Back & Options ────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.iconButton}
          hitSlop={8}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={22} color="#1E293B" strokeWidth={2.4} />
        </TouchableOpacity>

        <View style={styles.titleContainer}>
          <AppText style={styles.headerTitle} numberOfLines={2}>
            {tournament?.name ?? 'Tournament Management'}
          </AppText>
        </View>

        <TouchableOpacity
          onPress={onOptionsPress}
          style={styles.iconButton}
          hitSlop={8}
          accessibilityLabel="More options"
          accessibilityRole="button"
        >
          <MoreVertical size={20} color="#1E293B" />
        </TouchableOpacity>
      </View>

      {/* ─── Information & Badges Section ──────────────────────────────────── */}
      <View style={styles.infoSection}>
        {/* Badges Row */}
        <View style={styles.badgeRow}>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: statusConfig.text }]} />
            <AppText style={[styles.statusBadgeText, { color: statusConfig.text }]}>
              {statusConfig.label}
            </AppText>
          </View>

          <View style={styles.formatBadge}>
            <AppText style={styles.formatBadgeText}>{formatLabel}</AppText>
          </View>

          <View style={styles.categoryBadge}>
            <AppText style={styles.categoryBadgeText}>{categoryLabel}</AppText>
          </View>
        </View>

        {/* Meta Details Row */}
        <View style={styles.metaRow}>
          {formattedDate && (
            <View style={styles.metaItem}>
              <Calendar size={13} color="#64748B" />
              <AppText style={styles.metaText}>{formattedDate}</AppText>
            </View>
          )}

          {tournament?.location_name && (
            <View style={styles.metaItem}>
              <MapPin size={13} color="#64748B" />
              <AppText style={styles.metaText} numberOfLines={1}>
                {tournament.location_name}
              </AppText>
            </View>
          )}

          <View style={styles.metaItem}>
            <Users size={13} color="#64748B" />
            <AppText style={styles.metaText}>
              {tournament?.participant_count ?? 0}
              {tournament?.max_participants ? ` / ${tournament.max_participants}` : ''}{' '}
              {parsedConfig.isSingles ? 'Players' : 'Teams'}
            </AppText>
          </View>
        </View>

        {/* Primary Action Button (if applicable) */}
        {primaryAction && (
          <View style={styles.primaryActionContainer}>
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                primaryAction.variant === 'danger' && styles.primaryBtnDanger,
                primaryAction.variant === 'secondary' && styles.primaryBtnSecondary,
              ]}
              onPress={primaryAction.onPress}
              disabled={primaryAction.isLoading}
              activeOpacity={0.85}
            >
              <AppText
                style={[
                  styles.primaryBtnText,
                  primaryAction.variant === 'secondary' && styles.primaryBtnSecondaryText,
                ]}
              >
                {primaryAction.isLoading ? 'Processing...' : primaryAction.label}
              </AppText>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ─── Standardized Dynamic Navigation Tabs ───────────────────────────── */}
      <View style={styles.tabBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScrollContent}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.tabItem,
                  isActive && styles.tabItemActive,
                  tab.isCompetitionTab && !isActive && styles.tabItemCompetition,
                ]}
                onPress={() => onTabChange(tab.id)}
                activeOpacity={0.75}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
              >
                <View style={styles.tabItemInner}>
                  {renderTabIcon(
                    tab.iconName,
                    isActive ? '#0F766E' : '#64748B',
                    16
                  )}
                  <AppText
                    style={[
                      styles.tabLabel,
                      isActive && styles.tabLabelActive,
                    ]}
                  >
                    {tab.label}
                  </AppText>
                  {tab.badge !== undefined && (
                    <View
                      style={[
                        styles.badgePill,
                        isActive && styles.badgePillActive,
                      ]}
                    >
                      <AppText
                        style={[
                          styles.badgePillText,
                          isActive && styles.badgePillTextActive,
                        ]}
                      >
                        {tab.badge}
                      </AppText>
                    </View>
                  )}
                </View>
                {isActive && <View style={styles.activeUnderline} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 3,
    zIndex: 20,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[3],
    paddingBottom: Spacing[2],
    gap: Spacing[3],
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
    textAlign: 'center',
    lineHeight: 21,
  },
  infoSection: {
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[3],
    gap: Spacing[2],
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: Radius.full,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  formatBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  formatBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  categoryBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#065F46',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  primaryActionContainer: {
    marginTop: Spacing[1],
  },
  primaryBtn: {
    backgroundColor: '#0F766E',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F766E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryBtnDanger: {
    backgroundColor: '#DC2626',
  },
  primaryBtnSecondary: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  primaryBtnSecondaryText: {
    color: '#334155',
  },
  tabBarContainer: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  tabScrollContent: {
    paddingHorizontal: Spacing[3],
    gap: 2,
  },
  tabItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 40,
    flexShrink: 0,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemActive: {
    backgroundColor: '#F0FDFA',
  },
  tabItemCompetition: {
    backgroundColor: '#FAFCFB',
  },
  tabItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabLabelActive: {
    color: '#0F766E',
    fontWeight: '700',
  },
  badgePill: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
  },
  badgePillActive: {
    backgroundColor: '#CCFBF1',
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  badgePillTextActive: {
    color: '#0F766E',
  },
  activeUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 8,
    right: 8,
    height: 2.5,
    backgroundColor: '#0F766E',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
});
