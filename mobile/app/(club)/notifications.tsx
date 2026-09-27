/**
 * Aught2 Pickleball — Club-Side Notifications Page
 * Exact UI Reference Implementation
 *
 * Visual Features:
 *   - Pale mint-green page background (#F8FAF9)
 *   - Top header with Back arrow, bold "Notifications" title, and green-tinted "✓ Mark all read" button
 *   - Date Selector — Dropdown Only with calendar icon, selected date ("Thursday, 24 September 2026"), and chevron
 *   - Category filter chips with dynamic counts:
 *       All (count), Bookings (count), Tournaments (count), Events & Lessons (count), Memberships (count)
 *   - Notification Cards with:
 *       Pastel colored icon container on left
 *       Bold title, description, and category badge tag
 *       Relative timestamp on right ("2h ago", "5h ago")
 *       Small green dot for unread, gray dot for read
 *       Right-facing chevron
 *   - Clickable cards mark read & navigate to appropriate club management screen
 *   - Mutually exclusive cards and empty-state handling
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
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
  Calendar as CalendarIcon,
  CalendarDays,
  CalendarX,
  CalendarHeart,
  Check,
  ChevronDown,
  ChevronRight,
  Crown,
  Sparkles,
  Trophy,
  Users,
  X,
} from 'lucide-react-native';

import { AppText, DateCalendar } from '@/components';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '@/hooks';
import { useAuthStore } from '@/store';

type NotificationCategory = 'all' | 'bookings' | 'tournaments' | 'events' | 'memberships';

interface DisplayNotification {
  id: string;
  category: 'bookings' | 'tournaments' | 'events' | 'memberships' | 'general';
  title: string;
  message: string;
  timestamp: string;
  createdDateStr: string; // YYYY-MM-DD
  read: boolean;
  tagLabel: string;
  tagColor: string;
  tagBg: string;
  iconBg: string;
  isCancelled?: boolean;
  route: string;
}

function getTodayIsoDate(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DEFAULT_DATE = getTodayIsoDate();

function formatDisplayDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return `${weekdays[date.getDay()]}, ${day} ${months[date.getMonth()]} ${year}`;
  } catch {
    return dateStr;
  }
}

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
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}`;
  } catch {
    return 'Recently';
  }
}

export default function ClubNotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeMembership } = useAuthStore();
  const clubId = activeMembership?.club_id;

  // Selected date state (defaults to today or latest notification date)
  const [selectedDate, setSelectedDate] = useState<string>(DEFAULT_DATE);
  const [hasUserSelectedDate, setHasUserSelectedDate] = useState<boolean>(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState<boolean>(false);


  // Category filter state
  const [selectedCategory, setSelectedCategory] = useState<NotificationCategory>('all');
  const [localReadIds, setLocalReadIds] = useState<Set<string>>(new Set());

  // Backend real data hooks
  const {
    data: backendData,
    isLoading,
    refetch,
  } = useNotifications('all', false, undefined, clubId);

  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  // Normalize raw backend notifications into typed display notifications
  const allNotifications: DisplayNotification[] = useMemo(() => {
    if (!backendData?.items || backendData.items.length === 0) {
      return [];
    }

    return backendData.items.map((item) => {
      const rawCat = (item.category || 'general').toLowerCase();
      let cat: 'bookings' | 'tournaments' | 'events' | 'memberships' | 'general' = 'general';
      let tagLabel = 'General';
      let tagColor = '#0D5B46';
      let tagBg = '#E6F4F1';
      let iconBg = '#E6F4F1';
      let navRoute = '/(club)/';

      const isCancelled = item.title?.toLowerCase().includes('cancel') || item.message?.toLowerCase().includes('cancel');

      if (rawCat.includes('book')) {
        cat = 'bookings';
        tagLabel = 'Court Booking';
        navRoute = '/(club)/bookings';
        if (isCancelled) {
          tagColor = '#DC2626';
          tagBg = '#FEE2E2';
          iconBg = '#FEE2E2';
        } else {
          tagColor = '#0284C7';
          tagBg = '#E0F2FE';
          iconBg = '#E0F2FE';
        }
      } else if (rawCat.includes('tourn')) {
        cat = 'tournaments';
        tagLabel = 'Tournament';
        tagColor = '#D97706';
        tagBg = '#FEF3C7';
        iconBg = '#FEF3C7';
        navRoute = '/(club)/tournaments';
      } else if (rawCat.includes('event') || rawCat.includes('lesson')) {
        cat = 'events';
        tagLabel = 'Events & Lessons';
        tagColor = '#EA580C';
        tagBg = '#FFEDD5';
        iconBg = '#FFEDD5';
        navRoute = rawCat.includes('lesson') ? '/(club)/lessons' : '/(club)/events';
      } else if (rawCat.includes('member')) {
        cat = 'memberships';
        tagLabel = 'Membership';
        tagColor = '#16A34A';
        tagBg = '#E8F5E9';
        iconBg = '#E8F5E9';
        navRoute = '/(club)/memberships';
      }

      // Extract ISO date YYYY-MM-DD
      let createdDateStr = DEFAULT_DATE;
      if (item.created_at) {
        try {
          createdDateStr = item.created_at.split('T')[0];
        } catch {
          createdDateStr = DEFAULT_DATE;
        }
      }

      const isRead = item.is_read || localReadIds.has(item.id);

      return {
        id: item.id,
        category: cat,
        title: item.title,
        message: item.message,
        timestamp: item.created_at,
        createdDateStr,
        read: isRead,
        tagLabel,
        tagColor,
        tagBg,
        iconBg,
        isCancelled,
        route: navRoute,
      };
    });
  }, [backendData, localReadIds]);

  // Auto-focus latest notification date if today has no notifications and user hasn't manually selected
  useEffect(() => {
    if (!hasUserSelectedDate && allNotifications.length > 0) {
      const todayStr = getTodayIsoDate();
      const hasToday = allNotifications.some((n) => n.createdDateStr === todayStr);
      if (!hasToday && allNotifications[0]?.createdDateStr) {
        setSelectedDate(allNotifications[0].createdDateStr);
      }
    }
  }, [allNotifications, hasUserSelectedDate]);

  // Notifications belonging to the currently selected date
  const dateNotifications = useMemo(() => {
    return allNotifications.filter((n) => n.createdDateStr === selectedDate);
  }, [allNotifications, selectedDate]);

  // Dynamic counts for category chips for the selected date
  const categoryCounts = useMemo(() => {
    let allCount = dateNotifications.length;
    let bookingsCount = 0;
    let tournamentsCount = 0;
    let eventsLessonsCount = 0;
    let membershipsCount = 0;

    dateNotifications.forEach((n) => {
      if (n.category === 'bookings') bookingsCount++;
      else if (n.category === 'tournaments') tournamentsCount++;
      else if (n.category === 'events') eventsLessonsCount++;
      else if (n.category === 'memberships') membershipsCount++;
    });

    return {
      all: allCount,
      bookings: bookingsCount,
      tournaments: tournamentsCount,
      events: eventsLessonsCount,
      memberships: membershipsCount,
    };
  }, [dateNotifications]);

  // Notifications filtered by both Date and Category chip
  const displayedNotifications = useMemo(() => {
    if (selectedCategory === 'all') {
      return dateNotifications;
    }
    return dateNotifications.filter((n) => n.category === selectedCategory);
  }, [dateNotifications, selectedCategory]);

  // Actions
  const handleMarkAllRead = () => {
    markAllRead.mutate();
    const updatedIds = new Set(localReadIds);
    dateNotifications.forEach((n) => updatedIds.add(n.id));
    setLocalReadIds(updatedIds);
  };

  const handleCardPress = (item: DisplayNotification) => {
    if (!item.read) {
      markRead.mutate(item.id);
      setLocalReadIds((prev) => new Set([...prev, item.id]));
    }
    if (item.route) {
      router.push(item.route as any);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(club)/' as any);
    }
  };

  const renderCardIcon = (item: DisplayNotification) => {
    if (item.category === 'bookings') {
      if (item.isCancelled) {
        return <CalendarX size={20} color="#DC2626" strokeWidth={2} />;
      }
      return <CalendarDays size={20} color="#0284C7" strokeWidth={2} />;
    }
    if (item.category === 'memberships') {
      return <Crown size={20} color="#16A34A" strokeWidth={2} />;
    }
    if (item.category === 'events') {
      return <Users size={20} color="#EA580C" strokeWidth={2} />;
    }
    if (item.category === 'tournaments') {
      return <Trophy size={20} color="#D97706" strokeWidth={2} />;
    }
    return <Sparkles size={20} color="#0D5B46" strokeWidth={2} />;
  };

  return (
    <View style={styles.container}>
      {/* ─── 1. Header ──────────────────────────────────────────────────────── */}
      <View style={[styles.headerRow, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ArrowLeft size={22} color="#0F2922" strokeWidth={2.4} />
          </TouchableOpacity>
          <AppText style={styles.headerTitle}>Notifications</AppText>
        </View>

        <TouchableOpacity
          style={styles.markAllBtn}
          onPress={handleMarkAllRead}
          activeOpacity={0.75}
          accessibilityLabel="Mark all as read"
          accessibilityRole="button"
        >
          <Check size={16} color="#166534" strokeWidth={2.6} style={{ marginRight: 4 }} />
          <AppText style={styles.markAllText}>Mark all read</AppText>
        </TouchableOpacity>
      </View>

      {/* ─── 2. Date Selector — Dropdown Only ───────────────────────────────── */}
      <TouchableOpacity
        style={styles.dateDropdownBar}
        onPress={() => setIsDatePickerOpen(true)}
        activeOpacity={0.8}
        accessibilityLabel={`Selected date: ${formatDisplayDate(selectedDate)}. Tap to change date.`}
        accessibilityRole="button"
      >
        <CalendarIcon size={18} color="#0F2922" strokeWidth={2.2} style={{ marginRight: 10 }} />
        <AppText style={styles.dateDropdownText} numberOfLines={1}>
          {formatDisplayDate(selectedDate)}
        </AppText>
        <ChevronDown size={18} color="#0F2922" strokeWidth={2.2} />
      </TouchableOpacity>

      {/* ─── 3. Category Filter Chips ───────────────────────────────────────── */}
      <View style={styles.chipsContainer}>
        <View style={styles.chipsRow}>
          <Pressable
            style={[styles.chip, selectedCategory === 'all' && styles.chipActive]}
            onPress={() => setSelectedCategory('all')}
          >
            <AppText style={[styles.chipText, selectedCategory === 'all' && styles.chipTextActive]}>
              All ({categoryCounts.all})
            </AppText>
          </Pressable>

          <Pressable
            style={[styles.chip, selectedCategory === 'bookings' && styles.chipActive]}
            onPress={() => setSelectedCategory('bookings')}
          >
            <AppText style={[styles.chipText, selectedCategory === 'bookings' && styles.chipTextActive]}>
              Bookings ({categoryCounts.bookings})
            </AppText>
          </Pressable>

          <Pressable
            style={[styles.chip, selectedCategory === 'tournaments' && styles.chipActive]}
            onPress={() => setSelectedCategory('tournaments')}
          >
            <AppText style={[styles.chipText, selectedCategory === 'tournaments' && styles.chipTextActive]}>
              Tournaments ({categoryCounts.tournaments})
            </AppText>
          </Pressable>
        </View>

        <View style={[styles.chipsRow, { marginTop: 8 }]}>
          <Pressable
            style={[styles.chip, selectedCategory === 'events' && styles.chipActive]}
            onPress={() => setSelectedCategory('events')}
          >
            <AppText style={[styles.chipText, selectedCategory === 'events' && styles.chipTextActive]}>
              Events & Lessons ({categoryCounts.events})
            </AppText>
          </Pressable>

          <Pressable
            style={[styles.chip, selectedCategory === 'memberships' && styles.chipActive]}
            onPress={() => setSelectedCategory('memberships')}
          >
            <AppText style={[styles.chipText, selectedCategory === 'memberships' && styles.chipTextActive]}>
              Memberships ({categoryCounts.memberships})
            </AppText>
          </Pressable>
        </View>
      </View>

      {/* ─── 4. Notification Cards List (Mutually Exclusive With Empty State) ─ */}
      <FlatList
        data={displayedNotifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 95 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => refetch()}
            tintColor="#0D5B46"
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => handleCardPress(item)}
            activeOpacity={0.8}
            accessibilityLabel={`${item.title}, ${item.message}`}
            accessibilityRole="button"
          >
            {/* Left Pastel Icon Container */}
            <View style={[styles.cardIconBox, { backgroundColor: item.iconBg }]}>
              {renderCardIcon(item)}
            </View>

            {/* Middle Details */}
            <View style={styles.cardCenter}>
              <AppText style={styles.cardTitle} numberOfLines={1}>
                {item.title}
              </AppText>

              <AppText style={styles.cardDescription} numberOfLines={2}>
                {item.message}
              </AppText>

              {/* Bottom Tag Badge */}
              <View style={[styles.tagBadge, { backgroundColor: item.tagBg }]}>
                <AppText style={[styles.tagText, { color: item.tagColor }]}>
                  {item.tagLabel}
                </AppText>
              </View>
            </View>

            {/* Right Status Area */}
            <View style={styles.cardRight}>
              <AppText style={styles.cardTime}>
                {formatRelativeTime(item.timestamp)}
              </AppText>

              <View style={styles.cardRightBottom}>
                {/* Dot indicator: Dark green for unread, light gray for read */}
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: item.read ? '#CBD5E1' : '#0D5B46' },
                  ]}
                />
                <ChevronRight size={16} color="#94A3B8" strokeWidth={2} />
              </View>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          // Empty State only renders when there are 0 cards for the active filter/date
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Bell size={28} color="#647570" strokeWidth={1.8} />
            </View>
            <AppText style={styles.emptyTitle}>
              {dateNotifications.length === 0
                ? 'No notifications'
                : `No ${selectedCategory === 'events' ? 'events or lessons' : selectedCategory} notifications`}
            </AppText>
            <AppText style={styles.emptySubtitle}>
              {dateNotifications.length === 0
                ? 'There are no notifications recorded for this date. Check back later or choose another date.'
                : `You're all caught up on ${selectedCategory === 'events' ? 'events & lessons' : selectedCategory} for ${formatDisplayDate(selectedDate)}.`}
            </AppText>
          </View>
        }
      />

      {/* ─── 5. Date Picker Modal (Opened only via dropdown tap) ─────────────── */}
      <Modal
        visible={isDatePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsDatePickerOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setIsDatePickerOpen(false)}
        >
          <Pressable
            style={styles.modalContent}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <AppText style={styles.modalTitle}>Select Date</AppText>
              <TouchableOpacity
                onPress={() => setIsDatePickerOpen(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color="#4B5563" />
              </TouchableOpacity>
            </View>

            {/* Calendar Component */}
            <View style={styles.calendarWrapper}>
              <DateCalendar
                selectedDate={selectedDate}
                onSelectDate={(newDate) => {
                  setSelectedDate(newDate);
                  setHasUserSelectedDate(true);
                  setIsDatePickerOpen(false);
                }}
              />
            </View>

            {/* Quick Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.todayButton}
                onPress={() => {
                  setSelectedDate(getTodayIsoDate());
                  setHasUserSelectedDate(true);
                  setIsDatePickerOpen(false);
                }}
              >
                <AppText style={styles.todayButtonText}>Today</AppText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },

  /* Header */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#F8FAF9',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: 6,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F2922',
    letterSpacing: -0.3,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  markAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#166534',
  },

  /* Date Dropdown Bar */
  dateDropdownBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5ECE8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  dateDropdownText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#0F2922',
    letterSpacing: -0.2,
  },

  /* Category Filter Chips */
  chipsContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAE5',
  },
  chipActive: {
    backgroundColor: '#0D5B46',
    borderColor: '#0D5B46',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  /* Notification Cards */
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 2,
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8ECE9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  cardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCenter: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  cardDescription: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 8,
  },
  tagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 2,
    minHeight: 46,
  },
  cardTime: {
    fontSize: 11.5,
    color: '#94A3B8',
    fontWeight: '500',
    marginBottom: 10,
  },
  cardRightBottom: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },

  /* Empty State */
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
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13.5,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },

  /* Date Picker Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F2922',
  },
  calendarWrapper: {
    alignItems: 'center',
    marginVertical: 4,
  },
  modalActions: {
    marginTop: 10,
    alignItems: 'center',
  },
  todayButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#E6F4EA',
  },
  todayButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#166534',
  },
});
