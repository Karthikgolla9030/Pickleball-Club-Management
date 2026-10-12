/**
 * Aught2 Pickleball — Platform Registered Clubs Directory
 *
 * Dedicated administrative overview for authorized platform owners:
 * - View all registered clubs on the platform
 * - Inspect club approval/active status, slug, city/state, contact info, and active member counts
 * - Search by club name, slug, or location
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Building2,
  Calendar,
  CheckCircle2,
  ExternalLink,
  LogOut,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
  XCircle,
} from 'lucide-react-native';

import {
  AppHeader,
  AppText,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
} from '@/components';
import {
  platformApplicationsApi,
  PlatformClubItem,
} from '@/services/api/clubApplications';
import { Colors, Radius, Spacing } from '@/theme';
import { useAuthStore } from '@/store';

export default function PlatformClubsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const logout = useAuthStore((s) => s.logout);

  const [clubs, setClubs] = useState<PlatformClubItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClubs = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const res = await platformApplicationsApi.listClubs();
      setClubs(res.items || []);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to fetch platform clubs';
      setError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchClubs();
  }, [fetchClubs]);

  const filteredClubs = clubs.filter((c) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(query) ||
      c.slug.toLowerCase().includes(query) ||
      (c.city && c.city.toLowerCase().includes(query)) ||
      (c.state && c.state.toLowerCase().includes(query))
    );
  });

  const activeCount = clubs.filter((c) => c.is_active).length;
  const inactiveCount = clubs.filter((c) => !c.is_active).length;

  const handleSignOut = async () => {
    await logout();
    router.replace('/platform/login' as any);
  };

  return (
    <Screen style={styles.screen}>
      {/* Platform Navigation Header */}
      <View style={[styles.platformTopBar, { paddingTop: insets.top + 8 }]}>
        <View style={styles.brandRow}>
          <ShieldCheck size={20} color="#18794E" />
          <AppText variant="heading3" color="primary" style={styles.brandTitle}>
            Pickleball Platform
          </AppText>
        </View>

        <View style={styles.navLinksRow}>
          <TouchableOpacity
            style={styles.platformNavLink}
            onPress={() => router.push('/platform/applications' as any)}
            activeOpacity={0.8}
          >
            <AppText style={styles.platformNavLinkText}>Applications</AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.platformNavLink, styles.platformNavLinkActive]}
            activeOpacity={0.8}
          >
            <AppText style={[styles.platformNavLinkText, styles.platformNavLinkTextActive]}>
              Clubs
            </AppText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={handleSignOut}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <LogOut size={16} color="#DC2626" />
          </TouchableOpacity>
        </View>
      </View>

      <AppHeader
        title="Registered Clubs"
        subtitle="Platform-wide facilities directory"
        showMenu={false}
        rightElement={
          <TouchableOpacity
            onPress={() => fetchClubs(true)}
            style={styles.headerRefreshBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Refresh clubs"
          >
            <RefreshCw size={18} color="#18794E" />
          </TouchableOpacity>
        }
      />

      {/* Summary KPI Cards */}
      <View style={styles.kpiContainer}>
        <View style={styles.kpiCard}>
          <AppText variant="caption" color="secondary">Total Clubs</AppText>
          <AppText variant="heading2" color="primary" style={styles.kpiValue}>
            {clubs.length}
          </AppText>
        </View>
        <View style={styles.kpiCard}>
          <AppText variant="caption" color="secondary">Active Facilities</AppText>
          <AppText variant="heading2" color="brand" style={styles.kpiValue}>
            {activeCount}
          </AppText>
        </View>
        <View style={styles.kpiCard}>
          <AppText variant="caption" color="secondary">Inactive / Pending</AppText>
          <AppText variant="heading2" color="secondary" style={styles.kpiValue}>
            {inactiveCount}
          </AppText>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchWrapper}>
        <Search size={16} color="#667776" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by club name, slug, or city"
          placeholderTextColor="#8FA39E"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={16} color="#667776" />
          </TouchableOpacity>
        )}
      </View>

      {/* Main Clubs List */}
      {isLoading ? (
        <LoadingState message="Loading platform clubs..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchClubs(true)} />
      ) : (
        <FlatList
          data={filteredClubs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 60 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchClubs(true)}
              tintColor="#18794E"
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="🏢"
              title="No Clubs Found"
              description={
                searchQuery
                  ? `No clubs match the search "${searchQuery}".`
                  : 'There are currently no registered clubs on the platform.'
              }
            />
          }
          renderItem={({ item }) => (
            <Card style={styles.clubCard}>
              <View style={styles.cardHeader}>
                <View style={styles.clubTitleGroup}>
                  <AppText variant="title" color="primary" numberOfLines={1}>
                    {item.name}
                  </AppText>
                  <AppText variant="caption" color="secondary" style={styles.slugCode}>
                    slug: /{item.slug}
                  </AppText>
                </View>
                <Badge
                  label={item.is_active ? 'ACTIVE' : 'INACTIVE'}
                  variant={item.is_active ? 'success' : 'error'}
                  size="sm"
                />
              </View>

              <View style={styles.detailsRow}>
                <View style={styles.infoCol}>
                  {item.city && (
                    <View style={styles.inlineItem}>
                      <MapPin size={13} color="#667776" />
                      <AppText variant="caption" color="secondary" numberOfLines={1}>
                        {item.city}, {item.state || item.country}
                      </AppText>
                    </View>
                  )}
                  {item.contact_email && (
                    <View style={styles.inlineItem}>
                      <Mail size={13} color="#667776" />
                      <AppText variant="caption" color="secondary" numberOfLines={1}>
                        {item.contact_email}
                      </AppText>
                    </View>
                  )}
                </View>

                <View style={styles.infoCol}>
                  <View style={styles.inlineItem}>
                    <Users size={13} color="#667776" />
                    <AppText variant="caption" color="secondary">
                      {item.active_members_count} active members
                    </AppText>
                  </View>
                  {item.created_at && (
                    <View style={styles.inlineItem}>
                      <Calendar size={13} color="#667776" />
                      <AppText variant="caption" color="secondary">
                        {new Date(item.created_at).toLocaleDateString()}
                      </AppText>
                    </View>
                  )}
                </View>
              </View>
            </Card>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F9F8',
  },
  platformTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E4ECE8',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A2E2B',
  },
  navLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  platformNavLink: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: '#F0F4F2',
  },
  platformNavLinkActive: {
    backgroundColor: '#18794E',
  },
  platformNavLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B635D',
  },
  platformNavLinkTextActive: {
    color: '#FFFFFF',
  },
  signOutBtn: {
    padding: 6,
    borderRadius: Radius.md,
    backgroundColor: '#FEE2E2',
    marginLeft: 4,
  },
  headerRefreshBtn: {
    padding: 8,
    borderRadius: Radius.md,
    backgroundColor: '#EAF6F0',
  },
  kpiContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#E4ECE8',
  },
  kpiValue: {
    marginTop: 4,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: Spacing.md,
    marginVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#D3DFDB',
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1A2E2B',
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 24,
    gap: 12,
  },
  clubCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E4ECE8',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  clubTitleGroup: {
    flex: 1,
    marginRight: 10,
  },
  slugCode: {
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#667776',
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: '#F0F4F2',
    gap: 12,
  },
  infoCol: {
    flex: 1,
    gap: 6,
  },
  inlineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
