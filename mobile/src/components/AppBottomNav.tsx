/**
 * Aught2 Pickleball — AppBottomNav & QuickCreateSheet
 *
 * Fixed bottom navigation bar for mobile experience:
 *   - 5 actions: Home | Calendar | + (FAB) | Events | Profile
 *   - Floating center circular '+' button that opens QuickCreateSheet
 *   - QuickCreateSheet offers permission-filtered creation:
 *       * Booking, Event, Lesson, Tournament, League
 *   - Automatic route matching and active indicator
 *   - Safe-area bottom inset aware
 *   - Fixed elevation and touch-responsive feedback
 */

import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Home,
  Calendar,
  Plus,
  CalendarHeart,
  User,
  X,
  Trophy,
  Medal,
  GraduationCap,
  CalendarDays,
  Sparkles,
} from 'lucide-react-native';

import { AppText } from './AppText';
import { usePermission, useAuth, useActiveClub } from '@/hooks';

interface AppBottomNavProps {
  mode?: 'club' | 'player';
}

export function AppBottomNav({ mode = 'club' }: AppBottomNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const permissions = usePermission();
  const { memberships } = useAuth();
  const { activeMembership, role } = useActiveClub();
  const [showQuickCreate, setShowQuickCreate] = useState(false);

  // Strict check: player if requested mode is player, or if account has no staff membership
  const isPlayer = mode === 'player' || memberships.length === 0 || !activeMembership;
  const isTournamentDirector = !isPlayer && role === 'tournament_director';

  // Normalize path for matching
  const normalizedPath = pathname.replace(/\/$/, '') || '/';

  const isDetailRoute = [
    'tournament-details',
    'league-details',
    'pool-play',
    'round-robin',
    'bracket',
    'scramble',
    'competition-schedule',
  ].some(r => pathname.includes(r));

  if (isDetailRoute) {
    return null;
  }

  // Active checks for Player
  const isPlayerHomeActive = normalizedPath === '/(player)' || normalizedPath === '/(player)/index';
  const isPlayerBookingsActive = normalizedPath === '/(player)/bookings';
  const isPlayerCourtsActive = normalizedPath === '/(player)/courts';
  const isPlayerEventsActive = normalizedPath === '/(player)/events';
  const isPlayerProfileActive = normalizedPath === '/(player)/profile';

  // Active checks for Club
  const isClubHomeActive = normalizedPath === '/(club)' || normalizedPath === '/(club)/index' || normalizedPath === '/' || normalizedPath === '';
  const isClubCalendarActive = normalizedPath === '/(club)/bookings';
  const isClubTournamentsActive = normalizedPath === '/(club)/tournaments';
  const isClubLeaguesActive = normalizedPath === '/(club)/leagues';
  const isClubEventsActive = normalizedPath === '/(club)/events';
  const isClubProfileActive = normalizedPath === '/(club)/settings' || normalizedPath === '/(club)/profile';

  const handleNavigate = (route: string) => {
    router.replace(route as any);
  };

  const handleQuickAction = (route: string) => {
    setShowQuickCreate(false);
    setTimeout(() => {
      router.push(route as any);
    }, 150);
  };

  // ─── 1. PLAYER BOTTOM NAVIGATION ──────────────────────────────────────────
  if (isPlayer) {
    return (
      <View
        style={[
          styles.container,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            height: 68 + Math.max(insets.bottom, 12),
          },
        ]}
      >
        <View style={styles.navRow}>
          {/* 1. Home */}
          <Pressable
            onPress={() => handleNavigate('/(player)/')}
            style={styles.navItem}
            hitSlop={8}
            accessibilityLabel="Home"
            accessibilityRole="tab"
          >
            <View style={styles.iconContainer}>
              <Home
                size={23}
                color={isPlayerHomeActive ? '#104E3E' : '#7A8C87'}
                strokeWidth={isPlayerHomeActive ? 2.4 : 1.9}
              />
            </View>
            <AppText
              style={[
                styles.navLabel,
                isPlayerHomeActive && styles.navLabelActive,
              ]}
            >
              Home
            </AppText>
            <View
              style={isPlayerHomeActive ? styles.activeIndicator : styles.activeIndicatorHidden}
            />
          </Pressable>

          {/* 2. My Bookings */}
          <Pressable
            onPress={() => handleNavigate('/(player)/bookings')}
            style={styles.navItem}
            hitSlop={8}
            accessibilityLabel="My Bookings"
            accessibilityRole="tab"
          >
            <View style={styles.iconContainer}>
              <Calendar
                size={22}
                color={isPlayerBookingsActive ? '#104E3E' : '#7A8C87'}
                strokeWidth={isPlayerBookingsActive ? 2.4 : 1.9}
              />
            </View>
            <AppText
              style={[
                styles.navLabel,
                isPlayerBookingsActive && styles.navLabelActive,
              ]}
            >
              Bookings
            </AppText>
            <View
              style={isPlayerBookingsActive ? styles.activeIndicator : styles.activeIndicatorHidden}
            />
          </Pressable>

          {/* 3. Center Floating Book Button (Direct Court Booking) */}
          <View style={styles.centerFabSlot}>
            <TouchableOpacity
              onPress={() => handleNavigate('/(player)/courts')}
              style={styles.centerFabButton}
              activeOpacity={0.88}
              accessibilityLabel="Book Court"
              accessibilityRole="button"
            >
              <Plus size={24} color="#FFFFFF" strokeWidth={2.6} />
            </TouchableOpacity>
            <AppText style={styles.centerFabLabel}>Book</AppText>
            <View style={styles.activeIndicatorHidden} />
          </View>

          {/* 4. Events */}
          <Pressable
            onPress={() => handleNavigate('/(player)/events')}
            style={styles.navItem}
            hitSlop={8}
            accessibilityLabel="Events"
            accessibilityRole="tab"
          >
            <View style={styles.iconContainer}>
              <Trophy
                size={22}
                color={isPlayerEventsActive ? '#104E3E' : '#7A8C87'}
                strokeWidth={isPlayerEventsActive ? 2.4 : 1.9}
              />
            </View>
            <AppText
              style={[
                styles.navLabel,
                isPlayerEventsActive && styles.navLabelActive,
              ]}
            >
              Events
            </AppText>
            <View
              style={isPlayerEventsActive ? styles.activeIndicator : styles.activeIndicatorHidden}
            />
          </Pressable>

          {/* 5. Profile */}
          <Pressable
            onPress={() => handleNavigate('/(player)/profile')}
            style={styles.navItem}
            hitSlop={8}
            accessibilityLabel="Profile"
            accessibilityRole="tab"
          >
            <View style={styles.iconContainer}>
              <User
                size={23}
                color={isPlayerProfileActive ? '#104E3E' : '#7A8C87'}
                strokeWidth={isPlayerProfileActive ? 2.4 : 1.9}
              />
            </View>
            <AppText
              style={[
                styles.navLabel,
                isPlayerProfileActive && styles.navLabelActive,
              ]}
            >
              Profile
            </AppText>
            <View
              style={isPlayerProfileActive ? styles.activeIndicator : styles.activeIndicatorHidden}
            />
          </Pressable>
        </View>
      </View>
    );
  }

  // ─── 2. CLUB BOTTOM NAVIGATION ───────────────────────────────────────────
  return (
    <>
      <View
        style={[
          styles.container,
          {
            paddingBottom: Math.max(insets.bottom, 10),
            height: 60 + Math.max(insets.bottom, 10),
          },
        ]}
      >
        <View style={styles.navRow}>
          {/* 1. Home */}
          <Pressable
            onPress={() => handleNavigate('/(club)/')}
            style={styles.navItem}
            hitSlop={8}
            accessibilityLabel="Home"
            accessibilityRole="tab"
          >
            <View style={[styles.iconContainer, isClubHomeActive && styles.iconContainerActive]}>
              <Home
                size={22}
                color={isClubHomeActive ? '#176F5B' : '#7A8C87'}
                strokeWidth={isClubHomeActive ? 2.3 : 1.8}
              />
            </View>
            <AppText
              style={[
                styles.navLabel,
                isClubHomeActive && styles.navLabelActive,
              ]}
            >
              Home
            </AppText>
          </Pressable>

          {/* 2. Tab 2: Tournaments (if Tournament Director) OR Bookings (if Owner/Manager) */}
          {isTournamentDirector ? (
            <Pressable
              onPress={() => handleNavigate('/(club)/tournaments')}
              style={styles.navItem}
              hitSlop={8}
              accessibilityLabel="Tournaments"
              accessibilityRole="tab"
            >
              <View style={[styles.iconContainer, isClubTournamentsActive && styles.iconContainerActive]}>
                <Trophy
                  size={21}
                  color={isClubTournamentsActive ? '#176F5B' : '#7A8C87'}
                  strokeWidth={isClubTournamentsActive ? 2.3 : 1.8}
                />
              </View>
              <AppText
                style={[
                  styles.navLabel,
                  isClubTournamentsActive && styles.navLabelActive,
                ]}
              >
                Tournaments
              </AppText>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => handleNavigate('/(club)/bookings')}
              style={styles.navItem}
              hitSlop={8}
              accessibilityLabel="Bookings"
              accessibilityRole="tab"
            >
              <View style={[styles.iconContainer, isClubCalendarActive && styles.iconContainerActive]}>
                <Calendar
                  size={21}
                  color={isClubCalendarActive ? '#176F5B' : '#7A8C87'}
                  strokeWidth={isClubCalendarActive ? 2.3 : 1.8}
                />
              </View>
              <AppText
                style={[
                  styles.navLabel,
                  isClubCalendarActive && styles.navLabelActive,
                ]}
              >
                Bookings
              </AppText>
            </Pressable>
          )}

          {/* 3. Center Floating Quick Create (+) Button */}
          <View style={styles.centerFabSlot}>
            <TouchableOpacity
              onPress={() => setShowQuickCreate(true)}
              style={styles.centerFabButton}
              activeOpacity={0.85}
              accessibilityLabel="Quick Create"
              accessibilityRole="button"
            >
              <Plus size={26} color="#FFFFFF" strokeWidth={2.4} />
            </TouchableOpacity>
            <AppText style={styles.centerFabLabel}>Create</AppText>
          </View>

          {/* 4. Tab 4: Leagues (if Tournament Director) OR Events (if Owner/Manager) */}
          {isTournamentDirector ? (
            <Pressable
              onPress={() => handleNavigate('/(club)/leagues')}
              style={styles.navItem}
              hitSlop={8}
              accessibilityLabel="Leagues"
              accessibilityRole="tab"
            >
              <View style={[styles.iconContainer, isClubLeaguesActive && styles.iconContainerActive]}>
                <Medal
                  size={22}
                  color={isClubLeaguesActive ? '#176F5B' : '#7A8C87'}
                  strokeWidth={isClubLeaguesActive ? 2.3 : 1.8}
                />
              </View>
              <AppText
                style={[
                  styles.navLabel,
                  isClubLeaguesActive && styles.navLabelActive,
                ]}
              >
                Leagues
              </AppText>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => handleNavigate('/(club)/events')}
              style={styles.navItem}
              hitSlop={8}
              accessibilityLabel="Events"
              accessibilityRole="tab"
            >
              <View style={[styles.iconContainer, isClubEventsActive && styles.iconContainerActive]}>
                <CalendarHeart
                  size={22}
                  color={isClubEventsActive ? '#176F5B' : '#7A8C87'}
                  strokeWidth={isClubEventsActive ? 2.3 : 1.8}
                />
              </View>
              <AppText
                style={[
                  styles.navLabel,
                  isClubEventsActive && styles.navLabelActive,
                ]}
              >
                Events
              </AppText>
            </Pressable>
          )}

          {/* 5. Profile */}
          <Pressable
            onPress={() => handleNavigate('/(club)/profile')}
            style={styles.navItem}
            hitSlop={8}
            accessibilityLabel="Profile"
            accessibilityRole="tab"
          >
            <View style={[styles.iconContainer, isClubProfileActive && styles.iconContainerActive]}>
              <User
                size={22}
                color={isClubProfileActive ? '#176F5B' : '#7A8C87'}
                strokeWidth={isClubProfileActive ? 2.3 : 1.8}
              />
            </View>
            <AppText
              style={[
                styles.navLabel,
                isClubProfileActive && styles.navLabelActive,
              ]}
            >
              Profile
            </AppText>
          </Pressable>
        </View>
      </View>

      {/* Quick Create Bottom Sheet Modal */}
      <Modal
        visible={showQuickCreate}
        transparent
        animationType="slide"
        onRequestClose={() => setShowQuickCreate(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowQuickCreate(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.sheetContainer,
                  { paddingBottom: Math.max(insets.bottom + 16, 24) },
                ]}
              >
                {/* Header */}
                <View style={styles.sheetHeader}>
                  <View style={styles.sheetTitleGroup}>
                    <View style={styles.sheetIconPill}>
                      <Sparkles size={16} color="#176F5B" />
                    </View>
                    <View>
                      <AppText style={styles.sheetTitle}>Quick Create</AppText>
                      <AppText style={styles.sheetSubtitle}>
                        What would you like to create today?
                      </AppText>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setShowQuickCreate(false)}
                    style={styles.closeBtn}
                    hitSlop={8}
                  >
                    <X size={20} color="#667773" />
                  </TouchableOpacity>
                </View>

                {/* Option List */}
                <View style={styles.optionsList}>
                  {/* + Booking */}
                  {permissions.canManageBookings && (
                    <TouchableOpacity
                      style={styles.optionRow}
                      onPress={() => handleQuickAction('/(club)/bookings?create=true')}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.optionIconContainer, { backgroundColor: '#EBF7EE' }]}>
                        <CalendarDays size={20} color="#1B7A43" />
                      </View>
                      <View style={styles.optionTextContainer}>
                        <AppText style={styles.optionTitle}>Book Court</AppText>
                        <AppText style={styles.optionDesc}>
                          Reserve a court time slot for players or clinic
                        </AppText>
                      </View>
                      <Plus size={18} color="#176F5B" />
                    </TouchableOpacity>
                  )}

                  {/* + Event */}
                  {permissions.canManageEvents && (
                    <TouchableOpacity
                      style={styles.optionRow}
                      onPress={() => handleQuickAction('/(club)/events?create=true')}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.optionIconContainer, { backgroundColor: '#FBEBEB' }]}>
                        <CalendarHeart size={20} color="#B93838" />
                      </View>
                      <View style={styles.optionTextContainer}>
                        <AppText style={styles.optionTitle}>Club Event</AppText>
                        <AppText style={styles.optionDesc}>
                          Social mixer, open house, clinic or community day
                        </AppText>
                      </View>
                      <Plus size={18} color="#176F5B" />
                    </TouchableOpacity>
                  )}

                  {/* + Lesson */}
                  {permissions.canManageLessons && (
                    <TouchableOpacity
                      style={styles.optionRow}
                      onPress={() => handleQuickAction('/(club)/lessons?create=true')}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.optionIconContainer, { backgroundColor: '#F0EBFB' }]}>
                        <GraduationCap size={20} color="#6B3FB5" />
                      </View>
                      <View style={styles.optionTextContainer}>
                        <AppText style={styles.optionTitle}>Lesson & Coaching</AppText>
                        <AppText style={styles.optionDesc}>
                          Schedule private session, group clinic, or drill
                        </AppText>
                      </View>
                      <Plus size={18} color="#176F5B" />
                    </TouchableOpacity>
                  )}

                  {/* + Tournament */}
                  {permissions.canManageTournaments && (
                    <TouchableOpacity
                      style={styles.optionRow}
                      onPress={() => handleQuickAction('/(club)/tournaments?create=true')}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.optionIconContainer, { backgroundColor: '#E6F4F1' }]}>
                        <Trophy size={20} color="#16735D" />
                      </View>
                      <View style={styles.optionTextContainer}>
                        <AppText style={styles.optionTitle}>Tournament</AppText>
                        <AppText style={styles.optionDesc}>
                          Bracket, pool-play, round-robin, or scramble
                        </AppText>
                      </View>
                      <Plus size={18} color="#176F5B" />
                    </TouchableOpacity>
                  )}

                  {/* + League */}
                  {permissions.canManageTournaments && (
                    <TouchableOpacity
                      style={styles.optionRow}
                      onPress={() => handleQuickAction('/(club)/leagues?create=true')}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.optionIconContainer, { backgroundColor: '#FFF5E5' }]}>
                        <Medal size={20} color="#B5690E" />
                      </View>
                      <View style={styles.optionTextContainer}>
                        <AppText style={styles.optionTitle}>League</AppText>
                        <AppText style={styles.optionDesc}>
                          Multi-week season, team division & playoffs
                        </AppText>
                      </View>
                      <Plus size={18} color="#176F5B" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E6EFEA',
    zIndex: 90,
    overflow: 'visible',
    shadowColor: '#102B2A',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 10,
  },
  navRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 2,
  },
  iconContainer: {
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerActive: {
    backgroundColor: '#E8F5EE',
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7A8C87',
    letterSpacing: 0.1,
    marginTop: 2,
  },
  navLabelActive: {
    color: '#104E3E',
    fontWeight: '700',
  },
  activeIndicator: {
    width: 24,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: '#104E3E',
    marginTop: 3,
  },
  activeIndicatorHidden: {
    width: 24,
    height: 2.5,
    marginTop: 3,
    backgroundColor: 'transparent',
  },
  centerFabSlot: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: -16,
  },
  centerFabButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#114D3F',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#114D3F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 7,
    elevation: 8,
    marginBottom: 3,
  },
  centerFabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7A8C87',
    letterSpacing: 0.1,
    marginTop: 2,
  },

  // Bottom Sheet Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(16, 47, 43, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF4F1',
  },
  sheetTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sheetIconPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F5EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#102F2B',
  },
  sheetSubtitle: {
    fontSize: 13,
    color: '#667773',
    marginTop: 1,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F3F6F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionsList: {
    paddingTop: 12,
    gap: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#F9FBF9',
    borderWidth: 1,
    borderColor: '#E8EFEA',
    gap: 14,
  },
  optionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  optionTextContainer: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102F2B',
  },
  optionDesc: {
    fontSize: 12,
    color: '#667773',
    lineHeight: 16,
  },
});
