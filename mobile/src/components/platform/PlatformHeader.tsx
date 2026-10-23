/**
 * Aught2 Pickleball — PlatformHeader
 *
 * Mobile-first administrative header:
 * - On Mobile (< 800px):
 *   - Compact mobile header with hamburger menu button (triggers slide-out drawer)
 *   - Screen title and live operational status indicator
 *   - Compact right-side refresh action button
 * - On Desktop (>= 800px):
 *   - Professional desktop bar with brand badge, centered pill navigation,
 *     administrator identity chip, and sign-out action
 */

import React from 'react';
import {
  Platform,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Building2,
  FileText,
  History,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { useDrawerStore } from '@/navigation';
import { PlatformOwnerProfile } from '@/services/api/clubApplications';
import { Radius, Spacing } from '@/theme';

export type PlatformTabKey = 'overview' | 'applications' | 'clubs' | 'users' | 'audit' | 'support';

interface PlatformHeaderProps {
  activeTab: PlatformTabKey;
  title?: string;
  subtitle?: string;
  adminUser: PlatformOwnerProfile | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  rightElement?: React.ReactNode;
  onSignOut: () => void;
}

export function PlatformHeader({
  activeTab,
  title,
  subtitle,
  adminUser,
  onRefresh,
  isRefreshing = false,
  rightElement,
  onSignOut,
}: PlatformHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const openDrawer = useDrawerStore((s) => s.openDrawer);

  const isDesktop = width >= 800;

  const navItems: { key: PlatformTabKey; label: string; route: string; icon: any }[] = [
    { key: 'overview', label: 'Overview', route: '/platform', icon: LayoutDashboard },
    { key: 'applications', label: 'Applications', route: '/platform/applications', icon: FileText },
    { key: 'clubs', label: 'Clubs', route: '/platform/clubs', icon: Building2 },
    { key: 'users', label: 'Users', route: '/platform/users', icon: Users },
    { key: 'audit', label: 'Audit Log', route: '/platform/audit', icon: History },
    { key: 'support', label: 'Support', route: '/platform/support', icon: LifeBuoy },
  ];

  // ─── DESKTOP HEADER (>= 800px) ─────────────────────────────────────────────
  if (isDesktop) {
    return (
      <View style={[styles.desktopContainer, { paddingTop: insets.top + 8 }]}>
        <View style={styles.desktopInner}>
          {/* Brand & Badge */}
          <View style={styles.brandContainer}>
            <TouchableOpacity
              style={styles.brandRow}
              onPress={() => router.push('/platform' as any)}
              activeOpacity={0.8}
            >
              <View style={styles.shieldIconWrap}>
                <ShieldCheck size={20} color="#18794E" />
              </View>
              <View>
                <AppText variant="heading3" color="primary" style={styles.brandTitle}>
                  Platform Admin
                </AppText>
                <AppText variant="caption" color="secondary" style={styles.brandSub}>
                  Multi-Club Operations
                </AppText>
              </View>
            </TouchableOpacity>

            <View style={styles.statusLiveBadge}>
              <View style={styles.liveDot} />
              <AppText style={styles.statusLiveText}>PLATFORM</AppText>
            </View>
          </View>

          {/* Desktop Navigation Links */}
          <View style={styles.desktopNavGroup}>
            {navItems.map((item) => {
              const isActive = activeTab === item.key;
              const IconComponent = item.icon;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.desktopNavLink, isActive && styles.desktopNavLinkActive]}
                  onPress={() => {
                    if (!isActive) router.push(item.route as any);
                  }}
                  activeOpacity={0.7}
                >
                  <IconComponent
                    size={15}
                    color={isActive ? '#18794E' : '#4B635D'}
                    style={styles.navIcon}
                  />
                  <AppText
                    style={[styles.desktopNavText, isActive && styles.desktopNavTextActive]}
                  >
                    {item.label}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Right Actions & Admin Profile */}
          <View style={styles.rightActionsRow}>
            {onRefresh && (
              <TouchableOpacity
                onPress={onRefresh}
                style={styles.actionIconButton}
                disabled={isRefreshing}
                accessibilityLabel="Refresh current view"
              >
                <RefreshCw size={15} color="#18794E" />
              </TouchableOpacity>
            )}

            {rightElement}

            {adminUser && (
              <View style={styles.adminUserBadge}>
                <UserCheck size={14} color="#18794E" />
                <AppText variant="caption" color="primary" numberOfLines={1} style={styles.adminUserEmail}>
                  {adminUser.email}
                </AppText>
              </View>
            )}

            <TouchableOpacity
              style={styles.signOutBtn}
              onPress={onSignOut}
              accessibilityLabel="Sign out of platform portal"
            >
              <LogOut size={14} color="#DC2626" />
              <AppText style={styles.signOutText}>Sign Out</AppText>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ─── MOBILE HEADER (< 800px) ───────────────────────────────────────────────
  const pageTitle = title || (
    activeTab === 'overview'
      ? 'Overview'
      : activeTab === 'applications'
      ? 'Applications'
      : activeTab === 'clubs'
      ? 'Clubs'
      : activeTab === 'users'
      ? 'Users'
      : activeTab === 'audit'
      ? 'Audit Log'
      : 'Support'
  );

  return (
    <View style={[styles.mobileContainer, { paddingTop: insets.top + 6 }]}>
      <View style={styles.mobileInner}>
        {/* Left: Drawer Menu Button */}
        <TouchableOpacity
          onPress={openDrawer}
          style={styles.mobileMenuBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Open platform administration menu"
          accessibilityRole="button"
        >
          <Menu size={22} color="#102B2A" strokeWidth={2.2} />
        </TouchableOpacity>

        {/* Center: Title & Subtitle */}
        <View style={styles.mobileTitleBlock}>
          <View style={styles.mobileTitleRow}>
            <AppText variant="title" numberOfLines={1} style={styles.mobileTitleText}>
              {pageTitle}
            </AppText>
            <View style={styles.mobileLiveDotWrap}>
              <View style={styles.liveDot} />
            </View>
          </View>
          <AppText variant="caption" color="secondary" numberOfLines={1} style={styles.mobileSubtitleText}>
            {subtitle || 'Platform Administration'}
          </AppText>
        </View>

        {/* Right: Actions */}
        <View style={styles.mobileRightSlot}>
          {onRefresh && (
            <TouchableOpacity
              onPress={onRefresh}
              style={styles.mobileActionBtn}
              disabled={isRefreshing}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityLabel="Refresh current view"
              accessibilityRole="button"
            >
              <RefreshCw
                size={16}
                color="#18794E"
                style={isRefreshing ? { transform: [{ rotate: '45deg' }] } : undefined}
              />
            </TouchableOpacity>
          )}
          {rightElement}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Desktop
  desktopContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2EBE6',
    zIndex: 10,
  },
  desktopInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: 10,
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shieldIconWrap: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    backgroundColor: '#EAF6F0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C3E5D4',
  },
  brandTitle: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 18,
    color: '#122521',
  },
  brandSub: {
    fontSize: 11,
    color: '#657B75',
    lineHeight: 14,
  },
  statusLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: '#F0F7F3',
    borderWidth: 1,
    borderColor: '#D4E8DC',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#18794E',
  },
  statusLiveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#18794E',
    letterSpacing: 0.5,
  },
  desktopNavGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F7F5',
    padding: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#E2EBE6',
  },
  desktopNavLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  desktopNavLinkActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  navIcon: {
    marginRight: 2,
  },
  desktopNavText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#4B635D',
  },
  desktopNavTextActive: {
    color: '#18794E',
    fontWeight: '700',
  },
  rightActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIconButton: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    backgroundColor: '#F0F6F3',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D7E5DE',
  },
  adminUserBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: '#F5F9F7',
    borderWidth: 1,
    borderColor: '#E0ECE5',
    maxWidth: 200,
  },
  adminUserEmail: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  signOutText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },

  // Mobile
  mobileContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2EBE6',
    zIndex: 10,
  },
  mobileInner: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 12,
  },
  mobileMenuBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2ECE7',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  mobileTitleBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  mobileTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mobileTitleText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#102B2A',
    letterSpacing: -0.3,
  },
  mobileLiveDotWrap: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#E8F5EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileSubtitleText: {
    fontSize: 11,
    lineHeight: 14,
    color: '#657B75',
    marginTop: 1,
  },
  mobileRightSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  mobileActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F6F3',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D7E5DE',
  },
});
