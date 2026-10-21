/**
 * Aught2 Pickleball — Player Notifications Screen
 *
 * Uses the backend Notification table as the single authoritative source.
 * No synthetic cards from activities or bookings — those produced fabricated
 * IDs that caused silent 404s on every mark-read / dismiss call.
 *
 * Features:
 *   - Category filter chips: All · Bookings · Memberships · Events & Lessons · Tournaments
 *   - Per-chip unread counts derived from the same backend list
 *   - Category icon + tag badge on every card (consistent with club side)
 *   - Relative timestamp
 *   - Unread green dot / read grey dot
 *   - Optional club-name badge (multi-club players)
 *   - Tap to mark read + navigate to relevant screen
 *   - Dismiss button (useDeleteNotification)
 *   - "Mark all read" shown only when there is at least one unread notification
 *   - Pull-to-refresh
 *   - Loading · Error · Empty states
 */

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  CalendarHeart,
  CheckCheck,
  ChevronRight,
  Crown,
  RefreshCw,
  Sparkles,
  Trash2,
  Trophy,
} from 'lucide-react-native';

import { AppText } from '@/components';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDeleteNotification,
} from '@/hooks';

// --- Types ---

type NotificationCategory = 'all' | 'bookings' | 'memberships' | 'events' | 'tournaments';

// --- Helpers ---

function formatRelativeTime(timeStr: string): string {
  try {
    const d = new Date(timeStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}`;
  } catch {
    return 'Recently';
  }
}

function classifyCategory(raw: string): NotificationCategory {
  const c = (raw || '').toLowerCase();
  if (c.includes('booking')) return 'bookings';
  if (c.includes('tournament') || c.includes('league')) return 'tournaments';
  if (c.includes('event') || c.includes('lesson')) return 'events';
  if (c.includes('membership') || c.includes('member')) return 'memberships';
  return 'all';
}

interface CategoryMeta {
  label: string;
  tagLabel: string;
  tagColor: string;
  tagBg: string;
  iconBg: string;
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  bookings:    { label: 'Bookings',        tagLabel: 'Booking',        tagColor: '#0284C7', tagBg: '#E0F2FE', iconBg: '#E0F2FE' },
  memberships: { label: 'Memberships',     tagLabel: 'Membership',     tagColor: '#16A34A', tagBg: '#E8F5E9', iconBg: '#E8F5E9' },
  events:      { label: 'Events & Lessons',tagLabel: 'Events/Lessons', tagColor: '#EA580C', tagBg: '#FFEDD5', iconBg: '#FFEDD5' },
  tournaments: { label: 'Tournaments',     tagLabel: 'Tournament',     tagColor: '#D97706', tagBg: '#FEF3C7', iconBg: '#FEF3C7' },
  general:     { label: 'General',         tagLabel: 'General',        tagColor: '#9333EA', tagBg: '#F3E8FF', iconBg: '#F3E8FF' },
  all:         { label: 'All',             tagLabel: 'General',        tagColor: '#9333EA', tagBg: '#F3E8FF', iconBg: '#F3E8FF' },
};

function getCategoryMeta(cat: string): CategoryMeta {
  return CATEGORY_META[cat] ?? CATEGORY_META.general;
}

function renderCategoryIcon(cat: string) {
  switch (cat) {
    case 'bookings':    return <CalendarDays size={18} color="#0284C7" strokeWidth={2.2} />;
    case 'memberships': return <Crown size={18} color="#16A34A" strokeWidth={2.2} />;
    case 'events':      return <CalendarHeart size={18} color="#EA580C" strokeWidth={2.2} />;
    case 'tournaments': return <Trophy size={18} color="#D97706" strokeWidth={2.2} />;
    default:            return <Sparkles size={18} color="#9333EA" strokeWidth={2.2} />;
  }
}

function safeRoute(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return null;
  if (url.startsWith('/(player)/') || url.startsWith('/(club)/')) return url;
  return null;
}

// --- Screen ---

export default function PlayerNotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedCategory, setSelectedCategory] = useState<NotificationCategory>('all');
  const [localReadIds, setLocalReadIds] = useState<Set<string>>(new Set());
  const [localDeletedIds, setLocalDeletedIds] = useState<Set<string>>(new Set());

  const { data: backendData, isLoading, isError, refetch } = useNotifications('all');
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const deleteNotif = useDeleteNotification();

  const allNotifications = useMemo(() => {
    if (!backendData?.items) return [];
    return backendData.items
      .filter((item) => !localDeletedIds.has(item.id))
      .map((item) => {
        const cat = classifyCategory(item.category);
        const metaKey = cat === 'all' ? 'general' : cat;
        const meta = getCategoryMeta(metaKey);
        const isRead = item.is_read || localReadIds.has(item.id);
        const route = item.action_url
          ? safeRoute(item.action_url)
          : cat === 'bookings'    ? '/(player)/bookings'
          : cat === 'tournaments' ? '/(player)/tournaments'
          : cat === 'events'      ? '/(player)/events'
          : cat === 'memberships' ? '/(player)/clubs'
          : null;
        return { id: item.id, cat, meta, title: item.title, message: item.message,
                 timestamp: item.created_at, isRead, clubName: item.club_name ?? null, route };
      });
  }, [backendData, localReadIds, localDeletedIds]);

  const chipCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, bookings: 0, memberships: 0, events: 0, tournaments: 0 };
    allNotifications.forEach((n) => {
      if (!n.isRead) {
        counts.all++;
        if (n.cat !== 'all') counts[n.cat] = (counts[n.cat] || 0) + 1;
      }
    });
    return counts;
  }, [allNotifications]);

  const filteredNotifications = useMemo(() => {
    if (selectedCategory === 'all') return allNotifications;
    return allNotifications.filter((n) => n.cat === selectedCategory);
  }, [allNotifications, selectedCategory]);

  const hasUnread = chipCounts.all > 0;

  const handleMarkAllRead = () => {
    if (!hasUnread) return;
    markAllRead.mutate(undefined);
    const unreadIds = new Set(allNotifications.filter((n) => !n.isRead).map((n) => n.id));
    setLocalReadIds((prev) => new Set([...prev, ...unreadIds]));
  };

  const handlePressItem = (item: (typeof allNotifications)[0]) => {
    if (!item.isRead) {
      markRead.mutate(item.id);
      setLocalReadIds((prev) => new Set([...prev, item.id]));
    }
    if (item.route) {
      try { router.push(item.route as any); } catch { /* route invalid, stay */ }
    }
  };

  const handleDismiss = (id: string) => {
    setLocalDeletedIds((prev) => new Set([...prev, id]));
    deleteNotif.mutate(id);
  };

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(player)/' as any);
  };

  const CHIPS: { key: NotificationCategory; label: string }[] = [
    { key: 'all',         label: 'All' },
    { key: 'bookings',    label: 'Bookings' },
    { key: 'memberships', label: 'Memberships' },
    { key: 'events',      label: 'Events & Lessons' },
    { key: 'tournaments', label: 'Tournaments' },
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.headerRow, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Go back" accessibilityRole="button">
            <ArrowLeft size={22} color="#0F2922" strokeWidth={2.3} />
          </TouchableOpacity>
          <AppText style={styles.headerTitle}>Notifications</AppText>
        </View>
        {hasUnread && (
          <TouchableOpacity style={styles.markAllBtn} onPress={handleMarkAllRead} activeOpacity={0.7}
            accessibilityLabel="Mark all as read" accessibilityRole="button">
            <CheckCheck size={16} color="#176B57" strokeWidth={2.2} style={{ marginRight: 4 }} />
            <AppText style={styles.markAllText}>Mark all read</AppText>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.chipsContainer}>
        <View style={styles.chipsRow}>
          {CHIPS.map(({ key, label }) => {
            const isActive = selectedCategory === key;
            const count = chipCounts[key] ?? 0;
            return (
              <Pressable key={key} style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => setSelectedCategory(key)} accessibilityRole="button"
                accessibilityLabel={`${label}${count > 0 ? `, ${count} unread` : ''}`}>
                <AppText style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {label}{count > 0 ? ` (${count})` : ''}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {isLoading && (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#176B57" />
        </View>
      )}

      {isError && !isLoading && (
        <View style={styles.centerContainer}>
          <View style={styles.emptyIconCircle}>
            <RefreshCw size={26} color="#647570" strokeWidth={1.8} />
          </View>
          <AppText style={styles.emptyTitle}>Could not load notifications</AppText>
          <AppText style={styles.emptySubtitle}>Check your connection and try again.</AppText>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()} activeOpacity={0.8}>
            <AppText style={styles.retryBtnText}>Retry</AppText>
          </TouchableOpacity>
        </View>
      )}

      {!isLoading && !isError && (
        <FlatList
          data={filteredNotifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 90 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => refetch()} tintColor="#114D3F" />}
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.card, !item.isRead && styles.cardUnread]}
              onPress={() => handlePressItem(item)} activeOpacity={0.78}
              accessibilityLabel={`${item.title}: ${item.message}`} accessibilityRole="button">
              <View style={[styles.cardIconBox, { backgroundColor: item.meta.iconBg }]}>
                {renderCategoryIcon(item.cat === 'all' ? 'general' : item.cat)}
              </View>
              <View style={styles.cardCenter}>
                <AppText style={[styles.cardTitle, !item.isRead && styles.cardTitleUnread]} numberOfLines={1}>
                  {item.title}
                </AppText>
                <AppText style={styles.cardMessage} numberOfLines={3}>{item.message}</AppText>
                <View style={styles.cardBadgeRow}>
                  <View style={[styles.tagBadge, { backgroundColor: item.meta.tagBg }]}>
                    <AppText style={[styles.tagText, { color: item.meta.tagColor }]}>{item.meta.tagLabel}</AppText>
                  </View>
                  {item.clubName ? (
                    <View style={styles.clubBadge}>
                      <AppText style={styles.clubBadgeText} numberOfLines={1}>{item.clubName}</AppText>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={styles.cardRight}>
                <AppText style={styles.cardTime}>{formatRelativeTime(item.timestamp)}</AppText>
                <View style={styles.cardRightBottom}>
                  <View style={[styles.statusDot, { backgroundColor: item.isRead ? '#CBD5E1' : '#16A34A' }]} />
                  <ChevronRight size={16} color="#A0AEC0" strokeWidth={2} />
                </View>
              </View>
              <TouchableOpacity style={styles.dismissBtn} onPress={() => handleDismiss(item.id)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel="Dismiss notification" accessibilityRole="button">
                <Trash2 size={14} color="#CBD5E1" strokeWidth={2} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Bell size={28} color="#647570" strokeWidth={1.8} />
              </View>
              <AppText style={styles.emptyTitle}>
                {selectedCategory === 'all' ? 'No Notifications' : `No ${getCategoryMeta(selectedCategory).label} Notifications`}
              </AppText>
              <AppText style={styles.emptySubtitle}>
                {selectedCategory === 'all'
                  ? "You're all caught up! Court bookings, tournament alerts, and club announcements will appear here."
                  : `You're all caught up on ${getCategoryMeta(selectedCategory).label.toLowerCase()}.`}
              </AppText>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAF9' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingBottom: 12, backgroundColor: '#F8FAF9',
    borderBottomWidth: 1, borderBottomColor: '#E8EDEA' },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  backButton: { padding: 6, marginRight: 10 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#0F2922', letterSpacing: -0.3 },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  markAllText: { fontSize: 12.5, fontWeight: '600', color: '#176B57' },
  chipsContainer: { paddingHorizontal: 16, paddingVertical: 12 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8EDEA' },
  chipActive: { backgroundColor: '#114D3F', borderColor: '#114D3F' },
  chipText: { fontSize: 12.5, fontWeight: '600', color: '#647570' },
  chipTextActive: { color: '#FFFFFF' },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  retryBtn: { marginTop: 16, backgroundColor: '#114D3F', paddingHorizontal: 24,
    paddingVertical: 10, borderRadius: 20 },
  retryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  listContent: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E8EDEA',
    padding: 14, flexDirection: 'row', alignItems: 'flex-start',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  cardUnread: { borderColor: '#C6F6D5', backgroundColor: '#FAFCFB' },
  cardIconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center',
    justifyContent: 'center', marginRight: 12, flexShrink: 0 },
  cardCenter: { flex: 1, marginRight: 8 },
  cardTitle: { fontSize: 14.5, fontWeight: '600', color: '#0F2922', marginBottom: 3 },
  cardTitleUnread: { fontWeight: '700' },
  cardMessage: { fontSize: 12.5, color: '#647570', lineHeight: 17, marginBottom: 6 },
  cardBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  tagBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  tagText: { fontSize: 10.5, fontWeight: '600' },
  clubBadge: { backgroundColor: '#E8F5E9', paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 8, borderWidth: 1, borderColor: '#C6F6D5', maxWidth: 120 },
  clubBadgeText: { fontSize: 10.5, fontWeight: '600', color: '#166534' },
  cardRight: { alignItems: 'flex-end', justifyContent: 'space-between', minHeight: 46, flexShrink: 0 },
  cardTime: { fontSize: 11.5, color: '#8C9BA5', marginBottom: 10 },
  cardRightBottom: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  dismissBtn: { padding: 6, marginLeft: 4, flexShrink: 0, alignSelf: 'flex-start' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyIconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#E8EDEA',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#0F2922', marginBottom: 6, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, color: '#647570', textAlign: 'center', lineHeight: 19 },
});
