/**
 * Aught2 Pickleball — Navigation Configuration
 *
 * Defines the drawer menu structure for every role.
 * Player drawer is static. Club drawer is permission-gated.
 *
 * IMPORTANT: These permission keys correspond to the boolean helpers
 * returned by usePermission(). Visibility is UX only — backend
 * always enforces server-side authorization.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NavItem {
  key: string;
  label: string;
  /** Lucide icon name — consumed by the drawer renderer */
  icon: string;
  /** Expo Router path to navigate to */
  route?: string;
  /** If set, this is a special action (e.g. 'logout') instead of a route */
  action?: 'logout';
  /** Permission key from usePermission() — only for club nav */
  permission?: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

// ─── Player Navigation ──────────────────────────────────────────────────────

export const PLAYER_NAV_SECTIONS: NavSection[] = [
  {
    label: 'GENERAL',
    items: [
      { key: 'home', label: 'Home', icon: 'Home', route: '/(player)/' },
      { key: 'explore_clubs', label: 'Explore Clubs', icon: 'Compass', route: '/(player)/explore-clubs' },
      { key: 'clubs', label: 'My Clubs', icon: 'Building2', route: '/(player)/clubs' },
      { key: 'profile', label: 'Profile', icon: 'User', route: '/(player)/profile' },
    ],
  },
  {
    label: 'PLAY',
    items: [
      { key: 'courts', label: 'Courts', icon: 'LayoutGrid', route: '/(player)/courts' },
      { key: 'bookings', label: 'My Bookings', icon: 'CalendarDays', route: '/(player)/bookings' },
      { key: 'membership', label: 'My Memberships', icon: 'BadgeCheck', route: '/(player)/membership' },
      { key: 'payments', label: 'My Payments', icon: 'CreditCard', route: '/(player)/payments' },
    ],
  },
  {
    label: 'COMPETE',
    items: [
      { key: 'tournaments', label: 'Tournaments', icon: 'Trophy', route: '/(player)/tournaments' },
      { key: 'leagues', label: 'Leagues', icon: 'Medal', route: '/(player)/leagues' },
      { key: 'schedule', label: 'Schedule', icon: 'CalendarClock', route: '/(player)/competition-schedule' },
    ],
  },
  {
    label: 'COMMUNITY',
    items: [
      { key: 'events', label: 'Events', icon: 'CalendarHeart', route: '/(player)/events' },
      { key: 'lessons', label: 'Lessons', icon: 'GraduationCap', route: '/(player)/lessons' },
    ],
  },
  {
    label: 'ACCOUNT',
    items: [
      { key: 'logout', label: 'Sign Out', icon: 'LogOut', action: 'logout' },
    ],
  },
];

// ─── Club Navigation ────────────────────────────────────────────────────────

export const CLUB_NAV_SECTIONS: NavSection[] = [
  {
    label: 'MAIN',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: 'Home', route: '/(club)/' },
      { key: 'notifications', label: 'Notifications', icon: 'Bell', route: '/(club)/notifications' },
    ],
  },
  {
    label: 'MANAGEMENT',
    items: [
      { key: 'members', label: 'Members', icon: 'Users', route: '/(club)/members', permission: 'canManageMembers' },
      { key: 'membership_requests', label: 'Membership Requests', icon: 'UserCheck', route: '/(club)/membership-requests', permission: 'canManageMembers' },
      { key: 'courts', label: 'Courts', icon: 'LayoutGrid', route: '/(club)/courts', permission: 'canManageCourts' },
      { key: 'bookings', label: 'Bookings', icon: 'CalendarDays', route: '/(club)/bookings', permission: 'canManageBookings' },
      { key: 'memberships', label: 'Memberships', icon: 'Crown', route: '/(club)/memberships', permission: 'canManageMemberships' },
      { key: 'payments', label: 'Payments', icon: 'CreditCard', route: '/(club)/payments', permission: 'canManagePayments' },
      { key: 'analytics', label: 'Analytics & Reports', icon: 'BarChart2', route: '/(club)/analytics', permission: 'canManageReports' },
    ],
  },
  {
    label: 'COMMUNITY',
    items: [
      { key: 'events', label: 'Events', icon: 'CalendarHeart', route: '/(club)/events', permission: 'canManageEvents' },
      { key: 'lessons', label: 'Lessons', icon: 'GraduationCap', route: '/(club)/lessons', permission: 'canManageLessons' },
    ],
  },
  {
    label: 'COMPETITIONS',
    items: [
      { key: 'tournaments', label: 'Tournaments', icon: 'Trophy', route: '/(club)/tournaments', permission: 'canManageTournaments' },
      { key: 'leagues', label: 'Leagues', icon: 'Medal', route: '/(club)/leagues', permission: 'canManageTournaments' },
    ],
  },
  {
    label: 'CLUB PROFILE',
    items: [
      { key: 'club_details', label: 'Club Details', icon: 'Building2', route: '/(club)/club-details', permission: 'canManageClub' },
      { key: 'register_club', label: 'Register New Club', icon: 'PlusCircle', route: '/(club)/register-club' },
    ],
  },
  {
    label: 'SUPPORT',
    items: [
      { key: 'help', label: 'Help & Support', icon: 'HelpCircle', route: '/(club)/settings' },
    ],
  },
];
