/**
 * Aught2 Pickleball — TournamentManagementHeader
 *
 * Standardized tournament header and dynamic format/category-aware navigation tab bar:
 * - Premium, clean light-theme design
 * - Modular architecture:
 *   1. TournamentManagementTopBar: Compact fixed top bar (Back button, Tournament Name, Overflow menu)
 *   2. TournamentManagementInfo: Natural-scrolling tournament info section (Badges, Date/Location/Teams, Compact Action)
 *   3. TournamentManagementTabs: Horizontal touch-friendly tab bar with Lucide icons and count badges
 *   4. TournamentManagementHeader: Composite component
 *
 * Rules:
 * - Large info section scrolls naturally with the page, preserving >85% of mobile viewport for tab content
 * - Compact primary CTA instead of oversized full-width button
 * - Smart action visibility: omits redundant actions (e.g. "View Results" when on Results tab)
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

export interface TournamentPrimaryAction {
  label: string;
  onPress: () => void;
  isLoading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

export interface TournamentManagementTopBarProps {
  tournament: Tournament | null;
  onBack: () => void;
  onOptionsPress: () => void;
}

export interface TournamentManagementInfoProps {
  tournament: Tournament | null;
  primaryAction?: TournamentPrimaryAction | null;
  activeTab?: TournamentTabKey;
}

export interface TournamentManagementTabsProps {
  tabs: TournamentNavTabItem[];
  activeTab: TournamentTabKey;
  onTabChange: (tab: TournamentTabKey) => void;
}

export interface TournamentManagementHeaderProps
  extends TournamentManagementTopBarProps,
    Omit<TournamentManagementInfoProps, 'activeTab'>,
    TournamentManagementTabsProps {
  activeTab: TournamentTabKey;
  hideTopBar?: boolean;
  hideInfoSection?: boolean;
}

function renderTabIcon(iconName: string, color: string, size = 16) {
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

/**
 * 1. Compact Top Bar: Stays fixed at the top of the screen (height ~50px).
 */
export function TournamentManagementTopBar({
  tournament,
  onBack,
  onOptionsPress,
}: TournamentManagementTopBarProps) {
  return (
    <View style={styles.topBar}>
      <TouchableOpacity
        onPress={onBack}
        style={styles.iconButton}
        hitSlop={8}
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <ArrowLeft size={20} color="#1E293B" strokeWidth={2.4} />
      </TouchableOpacity>

      <View style={styles.titleContainer}>
        <AppText style={styles.headerTitle} numberOfLines={1}>
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
  );
}

/**
 * 2. Natural-Scrolling Tournament Info Section: Badges, Meta details & Compact CTA.
 */
export function TournamentManagementInfo({
  tournament,
  primaryAction,
  activeTab,
}: TournamentManagementInfoProps) {
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

  // Redundant action filter: Do not show action if user is already on that tab
  const isRedundant = React.useMemo(() => {
    if (!primaryAction) return true;
    const label = primaryAction.label.toLowerCase();
    if (activeTab === 'results' && label.includes('result')) return true;
    if ((activeTab === 'matches' || activeTab === 'matchups' || activeTab === 'rounds') && (label.includes('score') || label.includes('match') || label.includes('round'))) return true;
    if (activeTab === 'bracket' && label.includes('bracket')) return true;
    if (activeTab === 'standings' && label.includes('standing')) return true;
    return false;
  }, [primaryAction, activeTab]);

  return (
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

      {/* Meta Details & Compact Action Row */}
      <View style={styles.metaAndActionRow}>
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

        {/* Compact, appropriately positioned action button */}
        {!isRedundant && primaryAction && (
          <TouchableOpacity
            style={[
              styles.compactBtn,
              primaryAction.variant === 'danger' && styles.compactBtnDanger,
              primaryAction.variant === 'secondary' && styles.compactBtnSecondary,
            ]}
            onPress={primaryAction.onPress}
            disabled={primaryAction.isLoading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={primaryAction.label}
          >
            <AppText
              style={[
                styles.compactBtnText,
                primaryAction.variant === 'secondary' && styles.compactBtnSecondaryText,
              ]}
            >
              {primaryAction.isLoading ? 'Processing...' : primaryAction.label}
            </AppText>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/**
 * 3. Standardized Horizontal Tab Bar.
 */
export function TournamentManagementTabs({
  tabs,
  activeTab,
  onTabChange,
}: TournamentManagementTabsProps) {
  return (
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
                  15
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
  );
}

/**
 * 4. Composite TournamentManagementHeader (Backwards compatible).
 */
export function TournamentManagementHeader({
  tournament,
  tabs,
  activeTab,
  onTabChange,
  onBack,
  onOptionsPress,
  primaryAction,
  hideTopBar = false,
  hideInfoSection = false,
}: TournamentManagementHeaderProps) {
  return (
    <View style={styles.headerWrapper}>
      {!hideTopBar && (
        <TournamentManagementTopBar
          tournament={tournament}
          onBack={onBack}
          onOptionsPress={onOptionsPress}
        />
      )}

      {!hideInfoSection && (
        <TournamentManagementInfo
          tournament={tournament}
          primaryAction={primaryAction}
          activeTab={activeTab}
        />
      )}

      <TournamentManagementTabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    zIndex: 20,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[2.5],
    paddingBottom: Spacing[2.5],
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
    gap: Spacing[2],
    zIndex: 30,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    paddingHorizontal: 6,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
    textAlign: 'center',
    lineHeight: 20,
  },
  infoSection: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[2.5],
    paddingBottom: Spacing[2.5],
    backgroundColor: '#FFFFFF',
    gap: Spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
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
    paddingVertical: 3,
    borderRadius: Radius.full,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  formatBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  formatBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#334155',
  },
  categoryBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  categoryBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#065F46',
  },
  metaAndActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 200,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
  },
  compactBtn: {
    backgroundColor: '#0F766E',
    borderRadius: Radius.full,
    paddingVertical: 6,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F766E',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
    alignSelf: 'flex-start',
  },
  compactBtnDanger: {
    backgroundColor: '#DC2626',
    shadowColor: '#DC2626',
  },
  compactBtnSecondary: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    shadowOpacity: 0,
    elevation: 0,
  },
  compactBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  compactBtnSecondaryText: {
    color: '#334155',
  },
  tabBarContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    zIndex: 10,
  },
  tabScrollContent: {
    paddingHorizontal: Spacing[3],
    paddingRight: Spacing[5],
    gap: 2,
  },
  tabItem: {
    paddingHorizontal: 11,
    paddingVertical: 9,
    minHeight: 38,
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
    gap: 5,
  },
  tabLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  tabLabelActive: {
    color: '#0F766E',
    fontWeight: '700',
  },
  badgePill: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
  },
  badgePillActive: {
    backgroundColor: '#CCFBF1',
  },
  badgePillText: {
    fontSize: 9.5,
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
