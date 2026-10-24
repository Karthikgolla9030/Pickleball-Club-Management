/**
 * Pickleball — PlatformHeader
 *
 * Visual Header matched directly to mobile platform reference:
 * - On Mobile (< 800px):
 *   - [ ☰ ] Rounded menu button triggering slide-out drawer
 *   - Pickleball logo icon + product name "Pickleball" + "Platform Admin"
 *   - Notification bell with unread dot + Avatar circle [ P ]
 * - On Desktop (>= 800px):
 *   - Professional desktop bar with brand logo, centered pill navigation,
 *     administrator identity chip, and sign-out action
 */

import React from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  Building2,
  FileText,
  History,
  Home,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  RefreshCw,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { useDrawerStore } from '@/navigation';
import { PlatformOwnerProfile } from '@/services/api/clubApplications';
import { Radius, Spacing } from '@/theme';

export type PlatformTabKey = 'overview' | 'applications' | 'clubs' | 'users' | 'audit' | 'support' | 'settings';

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
    { key: 'overview', label: 'Overview', route: '/platform', icon: Home },
    { key: 'applications', label: 'Applications', route: '/platform/applications', icon: FileText },
    { key: 'clubs', label: 'Clubs', route: '/platform/clubs', icon: Building2 },
    { key: 'users', label: 'Users', route: '/platform/users', icon: Users },
    { key: 'audit', label: 'Audit Log', route: '/platform/audit', icon: History },
    { key: 'support', label: 'Support', route: '/platform/support', icon: LifeBuoy },
    { key: 'settings', label: 'Settings', route: '/platform/settings', icon: Settings },
  ];

  // ─── DESKTOP HEADER (>= 800px) ─────────────────────────────────────────────
  if (isDesktop) {
    return (
      <View style={[styles.desktopContainer, { paddingTop: insets.top + 8 }]}>
        <View style={styles.desktopInner}>
          {/* Brand & Logo */}
          <TouchableOpacity
            style={styles.desktopBrandRow}
            onPress={() => router.push('/platform' as any)}
            activeOpacity={0.8}
            accessibilityLabel="Pickleball Platform Admin Home"
          >
            <Image
              source={require('@/../assets/pickleball_logo_primary.png')}
              style={styles.desktopLogoImage}
              resizeMode="contain"
            />
            <View style={styles.desktopBrandBadge}>
              <AppText style={styles.desktopBrandBadgeText}>Platform Admin</AppText>
            </View>
          </TouchableOpacity>

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
                    color={isActive ? '#16A34A' : '#4B5563'}
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
                <RefreshCw size={15} color="#16A34A" />
              </TouchableOpacity>
            )}

            {rightElement}

            {adminUser && (
              <View style={styles.adminUserBadge}>
                <UserCheck size={14} color="#16A34A" />
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
  const userInitial = adminUser?.full_name?.trim()
    ? adminUser.full_name.trim().charAt(0).toUpperCase()
    : 'A';

  return (
    <View style={[styles.mobileContainer, { paddingTop: insets.top + 6 }]}>
      <View style={styles.mobileInner}>
        {/* Brand & Actual Provided Logo (No menu button) */}
        <TouchableOpacity
          style={styles.mobileBrandBlock}
          onPress={() => router.push('/platform' as any)}
          activeOpacity={0.8}
          accessibilityLabel="Pickleball Platform Admin Home"
          accessibilityRole="button"
        >
          <Image
            source={require('@/../assets/pickleball_logo_primary.png')}
            style={styles.mobileLogoImage}
            resizeMode="contain"
          />
          <AppText style={styles.mobileBrandSubtitle}>Platform Admin</AppText>
        </TouchableOpacity>

        {/* Right: Notification Bell & User Avatar Circle */}
        <View style={styles.mobileRightSlot}>
          <TouchableOpacity
            style={styles.mobileBellBtn}
            onPress={onRefresh}
            accessibilityLabel="Notifications"
            accessibilityRole="button"
            activeOpacity={0.7}
          >
            <Bell size={20} color="#111827" strokeWidth={1.9} />
            <View style={styles.mobileBellDot} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.mobileAvatarCircle}
            onPress={openDrawer}
            accessibilityLabel="Platform admin profile and menu"
            accessibilityRole="button"
            activeOpacity={0.7}
          >
            <AppText style={styles.mobileAvatarText}>{userInitial}</AppText>
          </TouchableOpacity>
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
    borderBottomColor: '#E5E7EB',
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
  desktopBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  desktopLogoImage: {
    width: 96,
    height: 42,
  },
  desktopBrandBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  desktopBrandBadgeText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#4B5563',
  },
  desktopNavGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    padding: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#E5E7EB',
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
    color: '#4B5563',
  },
  desktopNavTextActive: {
    color: '#16A34A',
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
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  adminUserBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
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

  // Mobile (< 800px) Matching Reference
  mobileContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    zIndex: 10,
  },
  mobileInner: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    justifyContent: 'space-between',
  },
  mobileBrandBlock: {
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  mobileLogoImage: {
    width: 96,
    height: 35,
  },
  mobileBrandSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
    marginLeft: 32,
    letterSpacing: -0.2,
  },
  mobileRightSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mobileBellBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  mobileBellDot: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#EF4444',
  },
  mobileAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E6F4EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileAvatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#137333',
  },
});
