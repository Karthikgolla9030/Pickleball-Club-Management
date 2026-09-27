/**
 * Aught2 Pickleball — Player Notifications Screen
 *
 * Displays notifications for the authenticated player:
 *   - Court booking confirmations and reminders
 *   - Tournament registrations and schedule changes
 *   - Event announcements and clinic updates
 *   - Lesson registrations and coaching updates
 *   - Filter chips: All, Bookings, Events & Lessons, Tournaments
 *   - Mark all as read action
 *   - Interactive card navigation to corresponding feature screens
 *   - Safe area navigation back to previous screen
 */

import React, { useMemo, useState } from 'react';
import {
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
  GraduationCap,
  Sparkles,
  Trophy,
} from 'lucide-react-native';

import { AppText } from '@/components';
import {
  usePlayerBookings,
  usePlayerActivity,
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '@/hooks';
import type { Booking } from '@/types';

type NotificationCategory = 'all' | 'bookings' | 'events' | 'tournaments';

interface NotificationItem {
  id: string;
  category: 'bookings' | 'events' | 'tournaments' | 'general';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  route?: string;
}

export default function PlayerNotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedCategory, setSelectedCategory] = useState<NotificationCategory>('all');
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const { data: backendNotifs, isLoading: isNotifsLoading, refetch: refetchNotifs } = useNotifications(selectedCategory);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const { activities, isLoading: isActivityLoading, refetch: refetchActivity } = usePlayerActivity();
  const { bookings: bookingsData, isLoading: isBookingsLoading, refetch: refetchBookings } = usePlayerBookings();

  // Combine real backend notifications and activities into notification cards
  const notifications: NotificationItem[] = useMemo(() => {
    const list: NotificationItem[] = [];

    // 1. Convert real backend persistent notifications if available
    if (backendNotifs && backendNotifs.items && backendNotifs.items.length > 0) {
      backendNotifs.items.forEach((item) => {
        let cat: 'bookings' | 'events' | 'tournaments' | 'general' = 'general';
        let navRoute = '/(player)/';

        const c = item.category?.toLowerCase() || '';
        if (c.includes('booking')) {
          cat = 'bookings';
          navRoute = '/(player)/bookings';
        } else if (c.includes('tournament')) {
          cat = 'tournaments';
          navRoute = '/(player)/tournaments';
        } else if (c.includes('event')) {
          cat = 'events';
          navRoute = '/(player)/events';
        } else if (c.includes('lesson')) {
          cat = 'events';
          navRoute = '/(player)/lessons';
        } else if (c.includes('membership')) {
          cat = 'general';
          navRoute = '/(player)/membership';
        }

        list.push({
          id: item.id,
          category: cat,
          title: item.title,
          message: item.message,
          timestamp: item.created_at,
          read: item.is_read || readIds.has(item.id),
          route: navRoute,
        });
      });
      return list;
    }

    // 2. Convert recent backend activities
    activities.forEach((act) => {
      let cat: 'bookings' | 'events' | 'tournaments' | 'general' = 'general';
      let navRoute = '/(player)/';

      if (act.activity_type.includes('booking')) {
        cat = 'bookings';
        navRoute = '/(player)/bookings';
      } else if (act.activity_type.includes('tournament')) {
        cat = 'tournaments';
        navRoute = '/(player)/tournaments';
      } else if (act.activity_type.includes('event')) {
        cat = 'events';
        navRoute = '/(player)/events';
      } else if (act.activity_type.includes('lesson')) {
        cat = 'events';
        navRoute = '/(player)/lessons';
      }

      list.push({
        id: act.id,
        category: cat,
        title: act.title,
        message: act.description,
        timestamp: act.timestamp,
        read: readIds.has(act.id),
        route: navRoute,
      });
    });

    // 3. Upcoming booking alerts if player has active bookings
    if (bookingsData && bookingsData.length > 0) {
      bookingsData.slice(0, 3).forEach((b: Booking) => {
        const id = `booking-alert-${b.id}`;
        const courtName = b.court?.name || b.court?.display_name || 'Court';
        let dateDesc = '';
        try {
          const start = new Date(b.start_at);
          dateDesc = `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        } catch {
          dateDesc = b.start_at;
        }

        list.push({
          id,
          category: 'bookings',
          title: 'Court Booking Confirmed',
          message: `Your court reservation for ${courtName} on ${dateDesc} is confirmed.`,
          timestamp: b.created_at || new Date().toISOString(),
          read: readIds.has(id),
          route: '/(player)/bookings',
        });
      });
    }

    // Sort by timestamp descending
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [backendNotifs, activities, bookingsData, readIds]);

  // Filtered by selected chip
  const filteredNotifications = useMemo(() => {
    if (selectedCategory === 'all') return notifications;
    return notifications.filter((n) => n.category === selectedCategory);
  }, [notifications, selectedCategory]);

  const handleMarkAllRead = () => {
    markAllRead.mutate();
    const allIds = new Set(notifications.map((n) => n.id));
    setReadIds(allIds);
  };

  const handlePressItem = (item: NotificationItem) => {
    if (!item.read) {
      markRead.mutate(item.id);
    }
    setReadIds((prev) => new Set([...prev, item.id]));
    if (item.route) {
      router.push(item.route as any);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(player)/' as any);
    }
  };

  const formatRelativeTime = (timeStr: string) => {
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
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[d.getMonth()]} ${d.getDate()}`;
    } catch {
      return 'Recently';
    }
  };

  const renderIcon = (category: string) => {
    switch (category) {
      case 'bookings':
        return (
          <View style={[styles.iconWrapper, { backgroundColor: '#E0F2FE' }]}>
            <CalendarDays size={18} color="#0284C7" strokeWidth={2.2} />
          </View>
        );
      case 'tournaments':
        return (
          <View style={[styles.iconWrapper, { backgroundColor: '#FEF3C7' }]}>
            <Trophy size={18} color="#D97706" strokeWidth={2.2} />
          </View>
        );
      case 'events':
        return (
          <View style={[styles.iconWrapper, { backgroundColor: '#E8F5E9' }]}>
            <CalendarHeart size={18} color="#166534" strokeWidth={2.2} />
          </View>
        );
      default:
        return (
          <View style={[styles.iconWrapper, { backgroundColor: '#F3E8FF' }]}>
            <Sparkles size={18} color="#9333EA" strokeWidth={2.2} />
          </View>
        );
    }
  };

  return (
    <View style={styles.container}>
      {/* ─── Header ───────────────────────────────────────────────────────── */}
      <View style={[styles.headerRow, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft size={22} color="#0F2922" strokeWidth={2.3} />
          </TouchableOpacity>
          <AppText style={styles.headerTitle}>Notifications</AppText>
        </View>

        {notifications.length > 0 && (
          <TouchableOpacity
            style={styles.markAllBtn}
            onPress={handleMarkAllRead}
            activeOpacity={0.7}
          >
            <CheckCheck size={16} color="#176F5B" strokeWidth={2.2} style={{ marginRight: 4 }} />
            <AppText style={styles.markAllText}>Mark read</AppText>
          </TouchableOpacity>
        )}
      </View>

      {/* ─── Filter Chips ─────────────────────────────────────────────────── */}
      <View style={styles.filterRow}>
        <Pressable
          style={[styles.chip, selectedCategory === 'all' && styles.chipActive]}
          onPress={() => setSelectedCategory('all')}
        >
          <AppText style={[styles.chipText, selectedCategory === 'all' && styles.chipTextActive]}>
            All
          </AppText>
        </Pressable>

        <Pressable
          style={[styles.chip, selectedCategory === 'bookings' && styles.chipActive]}
          onPress={() => setSelectedCategory('bookings')}
        >
          <AppText style={[styles.chipText, selectedCategory === 'bookings' && styles.chipTextActive]}>
            Bookings
          </AppText>
        </Pressable>

        <Pressable
          style={[styles.chip, selectedCategory === 'events' && styles.chipActive]}
          onPress={() => setSelectedCategory('events')}
        >
          <AppText style={[styles.chipText, selectedCategory === 'events' && styles.chipTextActive]}>
            Events & Lessons
          </AppText>
        </Pressable>

        <Pressable
          style={[styles.chip, selectedCategory === 'tournaments' && styles.chipActive]}
          onPress={() => setSelectedCategory('tournaments')}
        >
          <AppText style={[styles.chipText, selectedCategory === 'tournaments' && styles.chipTextActive]}>
            Tournaments
          </AppText>
        </Pressable>
      </View>

      {/* ─── Notifications List ───────────────────────────────────────────── */}
      <FlatList
        data={filteredNotifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isNotifsLoading || isActivityLoading || isBookingsLoading}
            onRefresh={() => {
              refetchNotifs();
              refetchActivity();
              refetchBookings();
            }}
            tintColor="#114D3F"
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.notificationCard, !item.read && styles.notificationCardUnread]}
            onPress={() => handlePressItem(item)}
            activeOpacity={0.75}
          >
            {renderIcon(item.category)}

            <View style={styles.cardContent}>
              <View style={styles.cardTopLine}>
                <AppText style={[styles.cardTitle, !item.read && styles.cardTitleUnread]} numberOfLines={1}>
                  {item.title}
                </AppText>
                <AppText style={styles.cardTime}>
                  {formatRelativeTime(item.timestamp)}
                </AppText>
              </View>

              <AppText style={styles.cardMessage} numberOfLines={2}>
                {item.message}
              </AppText>
            </View>

            {!item.read && <View style={styles.unreadDot} />}
            <ChevronRight size={16} color="#A0AEC0" strokeWidth={2} style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Bell size={28} color="#647570" strokeWidth={1.8} />
            </View>
            <AppText style={styles.emptyTitle}>No Notifications</AppText>
            <AppText style={styles.emptySubtitle}>
              You're all caught up! Court bookings, tournament alerts, and club announcements will appear here.
            </AppText>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
    backgroundColor: '#F8FAF9',
    borderBottomWidth: 1,
    borderBottomColor: '#E8EDEA',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: 6,
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F2922',
    letterSpacing: -0.3,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  markAllText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#176F5B',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDEA',
  },
  chipActive: {
    backgroundColor: '#114D3F',
    borderColor: '#114D3F',
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#647570',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 10,
  },
  notificationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8EDEA',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  notificationCardUnread: {
    borderColor: '#C6F6D5',
    backgroundColor: '#FBFCFB',
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardContent: {
    flex: 1,
  },
  cardTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#0F2922',
    flex: 1,
    marginRight: 6,
  },
  cardTitleUnread: {
    fontWeight: '700',
  },
  cardTime: {
    fontSize: 11.5,
    color: '#8C9BA5',
  },
  cardMessage: {
    fontSize: 12.5,
    color: '#647570',
    lineHeight: 17,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16A34A',
    marginLeft: 6,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E8EDEA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F2922',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#647570',
    textAlign: 'center',
    lineHeight: 19,
  },
});
