/**
 * Pickleball Multi-Club Platform — Platform Admin Shell
 *
 * Unified administrative shell for authorized platform owners:
 * - Brand identity with live system status badge
 * - Desktop-efficient header and mobile-responsive tab bar
 * - Navigation between Overview, Applications, and Clubs
 * - Active session verification & unauthorized redirect
 * - Professional light/neutral theme (#F8FAF9) with pickleball-green accents
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Activity,
  Building2,
  CheckCircle2,
  FileText,
  History,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react-native';

import { AppText, Screen } from '@/components';
import {
  platformApplicationsApi,
  PlatformOwnerProfile,
} from '@/services/api/clubApplications';
import { Colors, Radius, Spacing } from '@/theme';
import { useAuthStore } from '@/store';

export type PlatformTabKey = 'overview' | 'applications' | 'clubs' | 'users' | 'audit' | 'support';

interface PlatformShellProps {
  activeTab: PlatformTabKey;
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  children: React.ReactNode;
  scrollable?: boolean;
}

export function PlatformShell({
  activeTab,
  title,
  subtitle,
  headerRight,
  onRefresh,
  isRefreshing = false,
  children,
  scrollable = false,
}: PlatformShellProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const logout = useAuthStore((s) => s.logout);

  const [adminUser, setAdminUser] = useState<PlatformOwnerProfile | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);

  const isDesktop = width >= 800;

  useEffect(() => {
    let isMounted = true;
    async function verifyAuth() {
      try {
        const profile = await platformApplicationsApi.getPlatformMe();
        if (isMounted) {
          setAdminUser(profile);
          setIsVerifying(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setIsVerifying(false);
          await logout();
          router.replace('/platform/login' as any);
        }
      }
    }
    verifyAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await logout();
    } finally {
      router.replace('/platform/login' as any);
    }
  };

  const navItems: { key: PlatformTabKey; label: string; route: string; icon: any }[] = [
    { key: 'overview', label: 'Overview', route: '/platform', icon: LayoutDashboard },
    { key: 'applications', label: 'Applications', route: '/platform/applications', icon: FileText },
    { key: 'clubs', label: 'Clubs', route: '/platform/clubs', icon: Building2 },
    { key: 'users', label: 'Users', route: '/platform/users', icon: Users },
    { key: 'audit', label: 'Audit Log', route: '/platform/audit', icon: History },
    { key: 'support', label: 'Support', route: '/platform/support', icon: LifeBuoy },
  ];

  if (isVerifying) {
    return (
      <Screen style={styles.screen}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#18794E" />
          <AppText variant="bodySmall" color="secondary" style={styles.loadingText}>
            Verifying platform administrative authorization...
          </AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      {/* Top Application Bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + (Platform.OS === 'web' ? 8 : 4) }]}>
        <View style={styles.topBarInner}>
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
          {isDesktop && (
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
          )}

          {/* Right Actions & Admin Profile */}
          <View style={styles.rightActionsRow}>
            {onRefresh && (
              <TouchableOpacity
                onPress={onRefresh}
                style={styles.actionIconButton}
                disabled={isRefreshing}
                accessibilityLabel="Refresh current view"
              >
                <RefreshCw size={16} color="#18794E" />
              </TouchableOpacity>
            )}

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
              onPress={handleSignOut}
              accessibilityLabel="Sign out of platform portal"
            >
              <LogOut size={15} color="#DC2626" />
              {isDesktop && <AppText style={styles.signOutText}>Sign Out</AppText>}
            </TouchableOpacity>
          </View>
        </View>

        {/* Mobile / Compact Secondary Navigation Bar */}
        {!isDesktop && (
          <View style={styles.mobileNavRow}>
            {navItems.map((item) => {
              const isActive = activeTab === item.key;
              const IconComponent = item.icon;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.mobileNavTab, isActive && styles.mobileNavTabActive]}
                  onPress={() => {
                    if (!isActive) router.push(item.route as any);
                  }}
                  activeOpacity={0.7}
                >
                  <IconComponent
                    size={14}
                    color={isActive ? '#18794E' : '#5C746E'}
                  />
                  <AppText
                    style={[styles.mobileNavText, isActive && styles.mobileNavTextActive]}
                  >
                    {item.label}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Page Header (Optional title/subtitle/actions) */}
      {(title || headerRight) && (
        <View style={styles.subHeader}>
          <View style={styles.subHeaderInner}>
            <View style={styles.subHeaderTitleBlock}>
              {title && (
                <AppText variant="heading2" color="primary" style={styles.pageTitle}>
                  {title}
                </AppText>
              )}
              {subtitle && (
                <AppText variant="bodySmall" color="secondary" style={styles.pageSubtitle}>
                  {subtitle}
                </AppText>
              )}
            </View>
            {headerRight && <View style={styles.subHeaderRight}>{headerRight}</View>}
          </View>
        </View>
      )}

      {/* Main Content Area */}
      {scrollable ? (
        <ScrollView
          style={styles.contentScrollView}
          contentContainerStyle={[
            styles.scrollContentContainer,
            { paddingBottom: Math.max(insets.bottom, 24) + 40 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.contentInnerMaxWidth}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[styles.staticContentContainer, { paddingBottom: Math.max(insets.bottom, 24) + 12 }]}>
          <View style={styles.contentInnerMaxWidthFlex}>{children}</View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
  },
  topBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2EBE6',
    zIndex: 10,
  },
  topBarInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
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
    gap: 6,
    backgroundColor: '#F3F7F5',
    padding: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#E2EBE6',
  },
  desktopNavLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
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
    fontSize: 13,
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
    maxWidth: 220,
  },
  adminUserEmail: {
    fontSize: 12,
    fontWeight: '500',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  mobileNavRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    gap: 6,
    backgroundColor: '#FAFDFB',
    borderTopWidth: 1,
    borderTopColor: '#EFF4F1',
  },
  mobileNavTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: '#EEF3F0',
  },
  mobileNavTabActive: {
    backgroundColor: '#EAF6F0',
    borderWidth: 1,
    borderColor: '#C3E5D4',
  },
  mobileNavText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5C746E',
  },
  mobileNavTextActive: {
    color: '#18794E',
    fontWeight: '700',
  },
  subHeader: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E6EFEA',
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
  },
  subHeaderInner: {
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subHeaderTitleBlock: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#122521',
  },
  pageSubtitle: {
    marginTop: 2,
    color: '#657B75',
  },
  subHeaderRight: {
    marginLeft: Spacing.md,
  },
  contentScrollView: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  staticContentContainer: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  contentInnerMaxWidth: {
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
  },
  contentInnerMaxWidthFlex: {
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
    flex: 1,
  },
});
