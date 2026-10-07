/**
 * Aught2 Pickleball — Shared TypeScript Types
 * Single source of truth for all domain types on the mobile side.
 */

// ─── Club Role ───────────────────────────────────────────────────────────────

export type ClubRole = 'club_owner' | 'club_manager' | 'tournament_director';

export const CLUB_ROLE_LABELS: Record<ClubRole, string> = {
  club_owner: 'Club Owner',
  club_manager: 'Club Manager',
  tournament_director: 'Tournament Director',
} as const;

// ─── User ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Club ────────────────────────────────────────────────────────────────────

export interface Club {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Club Membership ─────────────────────────────────────────────────────────

export interface MembershipInfo {
  membership_id: string;
  club_id: string;
  club_name: string;
  club_slug: string;
  role: ClubRole;
  role_label: string;
  is_active: boolean;
}

export interface ClubMembershipDetail {
  id: string;
  user_id: string;
  club_id: string;
  role: ClubRole;
  role_label: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserClubItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  membership_id: string;
  role: ClubRole;
  role_label: string;
  membership_is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Member Management ───────────────────────────────────────────────────────

export interface ClubMember {
  id: string;
  user_id: string;
  club_id: string;
  role: ClubRole;
  role_label: string;
  is_active: boolean;
  user_email: string;
  user_full_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface AddMemberPayload {
  email: string;
  role: ClubRole;
  full_name?: string;
  temporary_password?: string;
}

export interface UpdateMemberPayload {
  role?: ClubRole;
  is_active?: boolean;
}

// ─── Phase 3: Player Profile & Club Player Memberships ───────────────────────

export type PlayerMembershipStatus = 'active' | 'inactive' | 'suspended' | 'expired';

export const PLAYER_MEMBERSHIP_STATUS_LABELS: Record<PlayerMembershipStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  suspended: 'Suspended',
  expired: 'Expired',
} as const;

export interface PlayerProfile {
  id: string;
  user_id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender?: string | null;
  profile_image_url: string | null;
  bio: string | null;
  skill_rating?: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePlayerProfilePayload {
  display_name: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  profile_image_url?: string | null;
  bio?: string | null;
}

export interface UpdatePlayerProfilePayload {
  display_name?: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  profile_image_url?: string | null;
  bio?: string | null;
}

export interface PlayerClub {
  club_id: string;
  club_name: string;
  club_slug: string;
  membership_id: string;
  membership_number: string | null;
  status: PlayerMembershipStatus;
  joined_at: string;
  expires_at: string | null;
}

export interface PlayerClubDetail {
  id: string;
  user_id: string;
  club_id: string;
  club_name: string;
  membership_number: string | null;
  status: PlayerMembershipStatus;
  joined_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlayerActivityItem {
  id: string;
  activity_type: string;
  title: string;
  description: string;
  timestamp: string;
  entity_type: string;
  entity_id: string;
}

export interface ClubPlayerMember {
  id: string;
  user_id: string;
  club_id: string;
  user_email: string;
  user_full_name: string | null;
  profile_image_url?: string | null;
  membership_number: string | null;
  status: PlayerMembershipStatus;
  status_label: string;
  joined_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AddClubPlayerMemberPayload {
  email: string;
  status?: PlayerMembershipStatus;
  membership_number?: string | null;
  joined_at?: string | null;
  expires_at?: string | null;
}

export interface UpdateClubPlayerMemberPayload {
  status?: PlayerMembershipStatus;
  membership_number?: string | null;
  expires_at?: string | null;
}

// ─── Permissions (Frontend UX Only) ──────────────────────────────────────────
// Backend authorization is always the authoritative source of truth.

export type ClubPermission =
  | 'manage_club'
  | 'manage_users'
  | 'manage_roles'
  | 'manage_settings'
  | 'manage_payments'
  | 'manage_events'
  | 'manage_lessons'
  | 'manage_members'
  | 'manage_memberships'
  | 'manage_bookings'
  | 'manage_courts'
  | 'manage_reports'
  | 'manage_tournaments'
  | 'manage_leagues'
  | 'manage_teams'
  | 'manage_matches'
  | 'manage_scores'
  | 'manage_standings'
  | 'manage_results'
  | 'manage_schedules';

export const ROLE_PERMISSIONS: Record<ClubRole, readonly ClubPermission[]> = {
  club_owner: [
    'manage_club',
    'manage_users',
    'manage_roles',
    'manage_settings',
    'manage_payments',
    'manage_events',
    'manage_lessons',
    'manage_members',
    'manage_memberships',
    'manage_bookings',
    'manage_courts',
    'manage_reports',
    'manage_tournaments',
    'manage_leagues',
    'manage_teams',
    'manage_matches',
    'manage_scores',
    'manage_standings',
    'manage_results',
    'manage_schedules',
  ],
  club_manager: [
    'manage_members',
    'manage_memberships',
    'manage_payments',
    'manage_events',
    'manage_lessons',
    'manage_bookings',
    'manage_courts',
    'manage_reports',
    'manage_tournaments',
    'manage_leagues',
    'manage_teams',
    'manage_matches',
    'manage_scores',
    'manage_standings',
    'manage_results',
    'manage_schedules',
  ],
  tournament_director: [
    'manage_tournaments',
    'manage_leagues',
    'manage_teams',
    'manage_matches',
    'manage_scores',
    'manage_standings',
    'manage_results',
  ],
} as const;

// ─── Authentication ──────────────────────────────────────────────────────────

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
  memberships: MembershipInfo[];
}

export interface TokenRefreshResponse {
  access_token: string;
  token_type: string;
}

// ─── Auth Session State ──────────────────────────────────────────────────────
// Stored in Zustand (non-sensitive metadata only).
// Tokens are stored in SecureStore, not here.

export interface AuthSession {
  user: User | null;
  memberships: MembershipInfo[];
  activeMembership: MembershipInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// ─── API Error ───────────────────────────────────────────────────────────────

export interface ApiError {
  detail: string | ApiValidationError[];
  status?: number;
}

export interface ApiValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
}

export type ApiErrorType =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

// ─── Tournament Foundation (Phase 4) ──────────────────────────────────────────

export type TournamentFormat = 'round_robin' | 'pool_play' | 'scramble' | 'bracket';

export const TOURNAMENT_FORMAT_LABELS: Record<TournamentFormat, string> = {
  round_robin: 'Round Robin',
  pool_play: 'Pool Play',
  scramble: 'Scramble',
  bracket: 'Bracket',
} as const;

export type TournamentStatus =
  | 'draft'
  | 'registration_open'
  | 'registration_closed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export const TOURNAMENT_STATUS_LABELS: Record<TournamentStatus, string> = {
  draft: 'Draft',
  registration_open: 'Registration Open',
  registration_closed: 'Registration Closed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
} as const;

export type TournamentVisibility = 'public' | 'private';

export const TOURNAMENT_VISIBILITY_LABELS: Record<TournamentVisibility, string> = {
  public: 'Public',
  private: 'Private (Members Only)',
} as const;

export type TournamentRegistrationStatus =
  | 'confirmed'
  | 'pending'
  | 'waitlisted'
  | 'withdrawn'
  | 'cancelled';

export const REGISTRATION_STATUS_LABELS: Record<TournamentRegistrationStatus, string> = {
  confirmed: 'Confirmed',
  pending: 'Pending',
  waitlisted: 'Waitlisted',
  withdrawn: 'Withdrawn',
  cancelled: 'Cancelled',
} as const;

export interface ScoringRules {
  game_format: string;
  target_score: number;
  win_by: number;
}

export interface Tournament {
  id: string;
  club_id: string;
  created_by_user_id: string | null;
  name: string;
  description: string | null;
  status: TournamentStatus;
  status_label: string;
  format: TournamentFormat;
  format_label: string;
  visibility: TournamentVisibility;
  visibility_label: string;
  start_date: string;
  end_date: string;
  registration_open_at: string;
  registration_close_at: string;
  location_name: string | null;
  min_participants: number | null;
  max_participants: number | null;
  scoring_rules: ScoringRules;
  competition_category?: string | null;
  format_configuration?: {
    qualifiers_per_pool?: number;
    points_to_win?: number;
    win_by?: number;
    [key: string]: unknown;
  } | null;
  tiebreaker_rules: string[];
  participant_count: number;
  created_at: string;
  updated_at: string;
}

export interface TournamentDiscoveryItem {
  id: string;
  club_id: string;
  club_name: string;
  club_slug: string;
  name: string;
  description: string | null;
  status: TournamentStatus;
  status_label: string;
  format: TournamentFormat;
  format_label: string;
  format_configuration?: {
    qualifiers_per_pool?: number;
    points_to_win?: number;
    win_by?: number;
    [key: string]: unknown;
  } | null;
  visibility: TournamentVisibility;
  visibility_label: string;
  start_date: string;
  end_date: string;
  registration_open_at: string;
  registration_close_at: string;
  location_name: string | null;
  min_participants: number | null;
  max_participants: number | null;
  participant_count: number;
  is_registration_open: boolean;
  is_registered?: boolean;
  my_registration_id?: string | null;
  my_registration_status?: string | null;
  scoring_rules?: ScoringRules;
}

export interface CreateTournamentPayload {
  name: string;
  description?: string | null;
  format: TournamentFormat;
  visibility?: TournamentVisibility;
  start_date: string;
  end_date: string;
  registration_open_at: string;
  registration_close_at: string;
  location_name?: string | null;
  min_participants?: number | null;
  max_participants?: number | null;
  format_configuration?: Record<string, unknown> | null;
  scoring_rules?: ScoringRules;
  tiebreaker_rules?: string[];
}

export interface UpdateTournamentPayload {
  name?: string;
  description?: string | null;
  format?: TournamentFormat;
  visibility?: TournamentVisibility;
  start_date?: string;
  end_date?: string;
  registration_open_at?: string;
  registration_close_at?: string;
  location_name?: string | null;
  min_participants?: number | null;
  max_participants?: number | null;
  format_configuration?: Record<string, unknown> | null;
  scoring_rules?: ScoringRules;
  tiebreaker_rules?: string[];
}

export interface TournamentRegistrationItem {
  id: string;
  tournament_id: string;
  player_membership_id: string;
  user_id: string;
  user_email: string;
  user_full_name: string | null;
  display_name: string | null;
  membership_number: string | null;
  status: TournamentRegistrationStatus;
  status_label: string;
  seed: number | null;
  skill_rating?: number | null;
  notes: string | null;
  registered_at: string;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export type TournamentRegistration = TournamentRegistrationItem;

export interface UpdateRegistrationPayload {
  status?: TournamentRegistrationStatus;
  seed?: number | null;
  notes?: string | null;
}

export interface PlayerRegistrationResponse {
  id: string;
  tournament_id: string;
  status: TournamentRegistrationStatus;
  status_label: string;
  registered_at: string;
  message: string;
  reference_number?: string | null;
  registration_type?: string | null;
  team_id?: string | null;
  team_name?: string | null;
  partner_membership_id?: string | null;
  partner_name?: string | null;
  partner_email?: string | null;
  fee_amount?: number | null;
  payment_status?: string | null;
  payment_method?: string | null;
  notes?: string | null;
  tournament_name?: string | null;
  tournament_format?: string | null;
  tournament_format_label?: string | null;
  division?: string | null;
  location_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  player_name?: string | null;
  player_email?: string | null;
  skill_level?: string | null;
  cancelled_at?: string | null;
}

export interface PlayerTournamentRegistrationStatus {
  is_registered: boolean;
  status?: TournamentRegistrationStatus | null;
  status_label?: string | null;
  registration?: PlayerRegistrationResponse | null;
}

export interface PlayerSelfRegistrationPayload {
  team_name?: string | null;
  partner_membership_id?: string | null;
  skill_level?: string | null;
  gender?: string | null;
  age?: number | null;
  payment_method?: string | null;
  notes?: string | null;
}

export interface EligiblePartnerItem {
  membership_id: string;
  user_id: string;
  full_name: string;
  email: string;
  membership_number?: string | null;
  gender?: string | null;
  profile_image_url?: string | null;
  skill_rating?: number | null;
}

// ─── Phase 5: Competition (Round Robin Engine) ──────────────────────────────

export interface TeamMember {
  id: string;
  team_id: string;
  player_membership_id: string;
  user_id: string | null;
  user_email: string | null;
  display_name: string | null;
  membership_number: string | null;
  skill_rating?: number | null;
  created_at: string;
}

export interface Team {
  id: string;
  tournament_id: string;
  name: string;
  seed: number | null;
  members: TeamMember[];
  created_at: string;
  updated_at: string;
}

export interface CreateTeamPayload {
  name: string;
  seed?: number | null;
  player_membership_ids: string[]; // 1 for Singles, 2 for Doubles
}

export interface UpdateTeamPayload {
  name?: string;
  seed?: number | null;
  player_membership_ids?: string[];
}

export type MatchStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'waiting';

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  pending: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  waiting: 'Waiting',
} as const;

export interface MatchTeamSummary {
  id: string;
  name: string;
  seed: number | null;
}

export interface Match {
  id: string;
  tournament_id: string;
  round_number: number | null;
  round?: number | null;
  match_number: number | null;
  team_a_id: string | null;
  team_b_id: string | null;
  team_a: MatchTeamSummary | null;
  team_b: MatchTeamSummary | null;
  side_a_participants?: MatchParticipant[];
  side_b_participants?: MatchParticipant[];
  sit_out_participant?: MatchParticipant | null;
  participants?: MatchParticipant[];
  status: MatchStatus;
  status_label: string;
  score_a: number | null;
  score_b: number | null;
  winner_team_id: string | null;
  winner_team: MatchTeamSummary | null;
  winner_side?: 'side_a' | 'side_b' | null;
  stage?: 'pool' | 'championship' | null;
  pool_id?: string | null;
  bracket_round?: number | null;
  bracket_position?: number | null;
  bracket_section?: 'winners' | 'losers' | 'consolation' | 'finals' | string | null;
  label?: string | null;
  next_match_id?: string | null;
  next_match_slot?: 'team_a' | 'team_b' | null;
  winner_next_match_number?: number | null;
  loser_next_match_id?: string | null;
  loser_next_match_slot?: 'team_a' | 'team_b' | null;
  loser_next_match_number?: number | null;
  feeder_a_label?: string | null;
  feeder_b_label?: string | null;
  is_conditional?: boolean | null;
  wb_champion_slot?: 'team_a' | 'team_b' | string | null;
  court_id?: string | null;
  court_name?: string | null;
  court_number?: number | string | null;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}


export interface MatchResultPayload {
  score_a: number;
  score_b: number;
}

export interface StandingRow {
  rank: number;
  team_id: string;
  team_name: string;
  team_seed: number | null;
  wins: number;
  losses: number;
  matches_played: number;
  points_scored: number;
  points_allowed: number;
  points_differential: number;
  status?: string;
}

export interface StandingsResponse {
  tournament_id: string;
  standings: StandingRow[];
}

export interface GenerationResponse {
  tournament_id: string;
  teams_count: number;
  matches_generated: number;
  rounds_count: number;
  message: string;
}

// ─── Phase 6: Pool Play & Championship Competition ──────────────────────────

export interface PoolTeam {
  id: string;
  pool_id: string;
  team_id: string;
  position: number;
  team: Team | null;
  created_at: string;
}

export interface Pool {
  id: string;
  tournament_id: string;
  name: string;
  order_index: number;
  created_at: string;
  updated_at: string;
  pool_teams: PoolTeam[];
}

export interface PoolStandingRow extends StandingRow {
  pool_id: string;
  pool_name: string;
  qualified: boolean;
}

export interface PoolStandingsResponse {
  pool_id: string;
  pool_name: string;
  standings: PoolStandingRow[];
}

export interface AllPoolsStandingsResponse {
  tournament_id: string;
  pools: PoolStandingsResponse[];
}

export interface PoolConfigureRequest {
  number_of_pools: number;
  qualifiers_per_pool: number;
  pool_names?: string[];
}

export interface PoolManualAssignRequest {
  assignments: { team_id: string; pool_id: string }[];
}

export interface PoolPlayGenerationResponse {
  tournament_id: string;
  pools_count: number;
  teams_count: number;
  matches_generated: number;
  message: string;
}

export interface ChampionshipGenerationResponse {
  tournament_id: string;
  qualifiers_count: number;
  rounds_count: number;
  matches_generated: number;
  message: string;
}

// ─── Phase 7: Scramble Competition ──────────────────────────────────────────

export interface MatchParticipant {
  id: string;
  player_membership_id: string;
  side: 'side_a' | 'side_b' | 'sit_out';
  partner_slot: number;
  user_id?: string | null;
  display_name?: string | null;
  membership_number?: string | null;
}

export interface ScrambleConfigureRequest {
  rounds?: number;
  matches_per_player?: number | null;
  partner_rotation?: string;
}

export interface ScrambleGenerationResponse {
  tournament_id: string;
  participants_count: number;
  rounds_count: number;
  matches_generated: number;
  message: string;
}

export interface ScrambleStandingRow {
  rank: number;
  player_membership_id: string;
  user_id: string;
  display_name: string;
  wins: number;
  losses: number;
  matches_played: number;
  points_scored: number;
  points_allowed: number;
  points_differential: number;
}

export interface ScrambleStandingsResponse {
  tournament_id: string;
  standings: ScrambleStandingRow[];
}


// ─── Phase 8: Standalone Bracket Competition ─────────────────────────────────

export interface BracketGenerationResponse {
  tournament_id: string;
  teams_count: number;
  bracket_size: number;
  rounds_count: number;
  matches_generated: number;
  byes_count: number;
  /** Number of matches that are currently completed (includes BYE-auto-resolved matches). */
  played_matches_count: number;
  message: string;
}

export interface BracketSummaryResponse {
  tournament_id: string;
  teams_count: number;
  bracket_size: number;
  total_rounds?: number;
  rounds_count?: number;
  byes_count?: number;
  matches_total?: number;
  matches_played: number;
  matches_remaining: number;
  current_round?: number | null;
  /** null until the final match is completed. */
  champion_team_id: string | null;
  champion_team_name: string | null;
}

// ─── Phase 9: League Competition Engine ───────────────────────────────────────

export type LeagueStatus =
  | 'draft'
  | 'registration_open'
  | 'registration_closed'
  | 'in_progress'
  | 'playoffs'
  | 'completed'
  | 'cancelled';

export const LEAGUE_STATUS_LABELS: Record<LeagueStatus, string> = {
  draft: 'Draft',
  registration_open: 'Registration Open',
  registration_closed: 'Registration Closed',
  in_progress: 'In Progress',
  playoffs: 'Playoffs',
  completed: 'Completed',
  cancelled: 'Cancelled',
} as const;

export type LeagueWeekType = 'regular_season' | 'playoffs';
export type LeagueWeekStatus = 'pending' | 'in_progress' | 'completed';

export interface ScoringRules {
  game_format: string;
  target_score: number;
  win_by: number;
}

export interface LeagueSummary {
  id: string;
  club_id: string;
  name: string;
  description: string | null;
  status: LeagueStatus;
  status_display: string;
  number_of_weeks: number;
  current_week: number;
  team_size: number;
  playoff_team_count: number;
  max_teams?: number | null;
  registration_fee?: number | null;
  registration_open_at?: string | null;
  registration_close_at?: string | null;
  scoring_rules: ScoringRules | null;
  start_date: string | null;
  end_date?: string | null;
  champion_team_id: string | null;
  champion_team?: { id: string; name: string } | null;
  category?: string | null;
  registration_status?: string | null;
  teams_count: number;
  current_teams_count?: number;
  weeks_count: number;
  total_weeks?: number;
  total_matches_count?: number;
  completed_matches_count?: number;
  is_registered?: boolean;
  my_team_id?: string | null;
  my_team_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeagueWeek {
  id: string;
  league_id: string;
  week_number: number;
  week_type: LeagueWeekType;
  week_type_display: string;
  status: LeagueWeekStatus;
  status_display: string;
  start_date?: string | null;
  end_date?: string | null;
  matches?: LeagueMatch[];
  created_at: string;
  updated_at: string;
}

export interface LeagueStandingRow {
  rank: number;
  team_id: string;
  team_name: string;
  members?: string[];
  matches_played: number;
  wins: number;
  losses: number;
  points_scored: number;
  points_allowed: number;
  points_differential: number;
}

export interface LeagueStandingsResponse {
  league_id: string;
  league_name: string;
  week_number: number | null;
  standings: LeagueStandingRow[];
}

export interface LeagueWeeklyStandingSnapshot {
  id: string;
  league_id: string;
  league_week_id: string;
  week_number: number;
  team_id: string;
  team_name: string;
  rank: number;
  matches_played: number;
  wins: number;
  losses: number;
  points_scored: number;
  points_allowed: number;
  points_differential: number;
}

export interface LeagueTeamMember {
  id: string;
  team_id?: string;
  player_membership_id?: string | null;
  display_name?: string | null;
  is_guest?: boolean;
  skill_rating?: number | null;
  user?: {
    full_name: string | null;
    display_name: string | null;
    email: string;
  } | null;
}

export interface LeagueEligiblePartner {
  membership_id: string;
  user_id: string;
  full_name: string;
  email: string;
  membership_number?: string | null;
  gender?: string | null;
  profile_image_url?: string | null;
  skill_rating?: number | null;
}

export interface PlayerLeagueRegisterPayload {
  teamName: string;
  partnerMembershipId?: string | null;
  partnerName?: string | null;
  skillRating?: number | null;
}

export interface LeagueTeam {
  id: string;
  league_id: string | null;
  name: string;
  seed: number | null;
  avg_skill_level?: number | null;
  members: LeagueTeamMember[];
  created_at?: string;
}

export interface LeagueMatch {
  id: string;
  tournament_id: string | null;
  league_id: string | null;
  league_week_id: string | null;
  week_number?: number | null;
  stage: string;
  round_number: number;
  match_number: number;
  bracket_round: number | null;
  bracket_position: number | null;
  status: 'pending' | 'in_progress' | 'completed' | 'bye';
  team_a_id: string | null;
  team_b_id: string | null;
  team_a_name?: string | null;
  team_b_name?: string | null;
  team_a_members?: string[];
  team_b_members?: string[];
  team_a?: { id: string; name: string; seed?: number | null } | null;
  team_b?: { id: string; name: string; seed?: number | null } | null;
  score_a: number | null;
  score_b: number | null;
  winner_team_id: string | null;
  winner_team_name?: string | null;
  winner_team?: { id: string; name: string } | null;
  next_match_id: string | null;
  next_match_slot: number | null;
  is_bye: boolean;
  court_id?: string | null;
  court_name?: string | null;
  court_number: number | null;
  duration_minutes?: number | null;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  completed_at: string | null;
}

export interface LeaguePlayoffsResponse {
  league_id: string;
  playoff_teams_count: number;
  rounds_count: number;
  champion_team_id: string | null;
  champion_team_name: string | null;
  matches_played: number;
  matches_remaining: number;
}

export interface CreateLeaguePayload {
  name: string;
  description?: string | null;
  number_of_weeks?: number;
  team_size?: number;
  playoff_team_count?: number;
  max_teams?: number | null;
  registration_fee?: number | null;
  registration_open_at?: string | null;
  registration_close_at?: string | null;
  scoring_rules?: ScoringRules | null;
  start_date?: string | null;
  end_date?: string | null;
}

export interface CreateLeagueTeamPayload {
  name: string;
  player_membership_ids: string[];
}

// ─── Phase 10: Courts & Court Management ─────────────────────────────────────

export type CourtEnvironment = 'indoor' | 'outdoor' | 'covered';
export type CourtStatus = 'active' | 'inactive';
export type CourtSurfaceType = string;

export interface Court {
  id: string;
  club_id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  court_number: number | null;
  surface_type: string | null;
  indoor_outdoor: CourtEnvironment;
  price_per_hour?: number | string | null;
  status: CourtStatus;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface PlayerCourt {
  id: string;
  club_id: string;
  name: string;
  display_name: string | null;
  court_number: number | null;
  surface_type: string | null;
  indoor_outdoor: CourtEnvironment;
  price_per_hour?: number | string | null;
  display_order: number;
  description: string | null;
}

export interface CourtCreateRequest {
  name: string;
  display_name?: string | null;
  description?: string | null;
  court_number?: number | null;
  surface_type?: string | null;
  indoor_outdoor?: CourtEnvironment;
  price_per_hour?: number | string | null;
  is_active?: boolean;
  display_order?: number | null;
}

export interface CourtUpdateRequest {
  name?: string;
  display_name?: string | null;
  description?: string | null;
  court_number?: number | null;
  surface_type?: string | null;
  indoor_outdoor?: CourtEnvironment;
  price_per_hour?: number | string | null;
  is_active?: boolean;
  display_order?: number | null;
}

export interface CourtReorderRequest {
  court_ids: string[];
}

// ─── Phase 11: Court Bookings & Reservations ──────────────────────────────────

export type BookingStatus = 'confirmed' | 'cancelled' | 'completed';
export type BookingType = 'player' | 'staff';

export interface BookingCourtInfo {
  id: string;
  name: string;
  display_name: string | null;
  surface_type: string | null;
  indoor_outdoor: CourtEnvironment;
  price_per_hour?: number | string | null;
}

export interface BookingPlayerInfo {
  id: string;
  user_id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
}

export interface Booking {
  id: string;
  club_id: string;
  court_id: string;
  player_id: string;
  created_by_user_id: string;
  booking_type: BookingType;
  status: BookingStatus;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  price_per_hour?: number | string | null;
  total_price?: number | string | null;
  currency?: string;
  notes: string | null;
  cancelled_at: string | null;
  cancelled_by_user_id: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  court?: BookingCourtInfo | null;
  player?: BookingPlayerInfo | null;
  club_name?: string | null;
}

export type SlotStatus = 'AVAILABLE' | 'BOOKED' | 'MAINTENANCE' | 'BLOCKED';

export interface TimeSlotAvailability {
  start_at: string;
  end_at: string;
  is_available: boolean;
  status: SlotStatus;
  booking_id: string | null;
}

export interface CourtAvailability {
  court_id: string;
  court_name: string;
  display_name: string | null;
  surface_type: string | null;
  indoor_outdoor: CourtEnvironment;
  price_per_hour?: number | string | null;
  slots: TimeSlotAvailability[];
}

export interface ClubAvailabilityResponse {
  club_id: string;
  date: string;
  opening_time: string;
  closing_time: string;
  timezone: string;
  courts: CourtAvailability[];
}

export interface BookingCreatePayload {
  court_id: string;
  start_at: string;
  end_at: string;
  notes?: string | null;
}

export interface StaffBookingCreatePayload {
  court_id: string;
  player_id?: string | null;
  guest_name?: string | null;
  start_at: string;
  end_at: string;
  notes?: string | null;
}

export interface BookingCancelPayload {
  cancellation_reason?: string | null;
}

// ─── Phase 12: Membership Plans & Subscriptions ───────────────────────────────

export type PlanStatus = 'active' | 'inactive';
export type PlanDurationUnit = 'monthly' | 'quarterly' | 'yearly';
export type SubscriptionStatus = 'scheduled' | 'active' | 'expired' | 'cancelled';

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
} as const;

export const PLAN_DURATION_LABELS: Record<PlanDurationUnit, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
} as const;

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  scheduled: 'Scheduled',
  active: 'Active',
  expired: 'Expired',
  cancelled: 'Cancelled',
} as const;

export interface MembershipPlan {
  id: string;
  club_id: string;
  name: string;
  description: string | null;
  status: PlanStatus;
  status_label: string;
  duration_unit: PlanDurationUnit;
  duration_label: string;
  price: string; // Decimal returned as string to preserve precision
  currency: string;
  benefits: string[];
  booking_limit: number | null;
  advance_booking_days: number | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipPlanDetail extends MembershipPlan {
  subscriber_count: number;
}

export interface CreateMembershipPlanPayload {
  name: string;
  description?: string | null;
  duration_unit: PlanDurationUnit;
  price: string;
  currency?: string;
  benefits?: string[];
  booking_limit?: number | null;
  advance_booking_days?: number | null;
}

export interface UpdateMembershipPlanPayload {
  name?: string;
  description?: string | null;
  duration_unit?: PlanDurationUnit;
  price?: string;
  currency?: string;
  benefits?: string[];
  booking_limit?: number | null;
  advance_booking_days?: number | null;
  status?: PlanStatus;
}

export interface SubscriptionPlayerInfo {
  player_membership_id: string;
  user_id: string;
  user_email: string;
  user_full_name: string | null;
}

export interface MemberSubscription {
  id: string;
  club_id: string;
  player_membership_id: string;
  membership_plan_id: string;
  status: SubscriptionStatus;
  status_label: string;
  effective_status: SubscriptionStatus;
  start_date: string;
  end_date: string;
  auto_renew: boolean;
  notes: string | null;
  cancelled_at: string | null;
  cancelled_by_user_id: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  // Embedded plan info
  plan_name: string | null;
  plan_duration: string | null;
  plan_price: string | null;
  plan_currency: string | null;
  plan_benefits: string[];
  plan_booking_limit: number | null;
  plan_advance_booking_days: number | null;
  // Embedded player info
  player: SubscriptionPlayerInfo | null;
}

export interface CreateSubscriptionPayload {
  player_membership_id: string;
  membership_plan_id: string;
  start_date: string; // YYYY-MM-DD
  auto_renew?: boolean;
  notes?: string | null;
}

export interface UpdateSubscriptionPayload {
  auto_renew?: boolean;
  notes?: string | null;
}

export interface CancelSubscriptionPayload {
  cancellation_reason?: string | null;
}

/** Player-facing read-only membership view */
export interface PlayerMembershipView {
  subscription_id: string;
  club_id: string;
  plan_name: string;
  plan_description: string | null;
  status: SubscriptionStatus;
  status_label: string;
  effective_status: SubscriptionStatus;
  start_date: string;
  end_date: string;
  auto_renew: boolean;
  benefits: string[];
  booking_limit: number | null;
  advance_booking_days: number | null;
  duration_label: string;
  price: string;
  currency: string;
}

// ─── Phase 13 Payments Types ──────────────────────────────────────────────────

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded';

export type PaymentPurpose = 'membership';

export type PaymentMethod = 'cash' | 'bank_transfer' | 'online' | 'other';

export interface PaymentPlayerInfo {
  id: string;
  email: string;
  full_name: string | null;
}

export interface PaymentSubscriptionInfo {
  id: string;
  plan_name: string | null;
}

export interface Payment {
  id: string;
  reference: string;
  club_id: string;
  player_id: string;
  subscription_id: string | null;
  amount: number | string;
  currency: string;
  status: PaymentStatus;
  status_label: string;
  purpose: PaymentPurpose;
  purpose_label: string;
  payment_method: PaymentMethod;
  payment_method_label: string;
  provider: string | null;
  provider_payment_id: string | null;
  provider_order_id: string | null;
  notes: string | null;
  failure_reason: string | null;
  created_by_user_id: string | null;
  status_changed_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  failed_at: string | null;
  cancelled_at: string | null;
  player?: PaymentPlayerInfo | null;
  subscription?: PaymentSubscriptionInfo | null;
}

export interface PlayerPayment {
  id: string;
  reference: string;
  club_id: string;
  club_name: string | null;
  amount: number | string;
  currency: string;
  status: PaymentStatus;
  status_label: string;
  purpose: PaymentPurpose;
  purpose_label: string;
  payment_method: PaymentMethod;
  payment_method_label: string;
  created_at: string;
  paid_at: string | null;
}

export interface PaymentSummary {
  total_count: number;
  succeeded_count: number;
  pending_count: number;
  failed_count: number;
  total_amount_collected: number | string;
  currency: string;
}

export interface CreatePaymentPayload {
  player_id: string;
  subscription_id: string;
  amount: number;
  currency?: string;
  payment_method: PaymentMethod;
  purpose?: PaymentPurpose;
  notes?: string | null;
}

export interface PaymentFilters {
  status?: PaymentStatus;
  purpose?: PaymentPurpose;
  player_id?: string;
  subscription_id?: string;
  payment_method?: PaymentMethod;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

// ─── Phase 14 Events Types ───────────────────────────────────────────────────

export type EventType = 'social' | 'clinic' | 'community' | 'special' | 'other';

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  social: 'Social Night',
  clinic: 'Clinic / Coaching',
  community: 'Community Event',
  special: 'Special Gathering',
  other: 'Other Event',
} as const;

export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed';

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  cancelled: 'Cancelled',
  completed: 'Completed',
} as const;

export type EventVisibility = 'public' | 'members_only' | 'private';

export const EVENT_VISIBILITY_LABELS: Record<EventVisibility, string> = {
  public: 'Public',
  members_only: 'Members Only',
  private: 'Private (Staff Invite)',
} as const;

export type EventRegistrationStatus =
  | 'registered'
  | 'waitlisted'
  | 'cancelled'
  | 'attended'
  | 'no_show';

export const EVENT_REGISTRATION_STATUS_LABELS: Record<EventRegistrationStatus, string> = {
  registered: 'Registered',
  waitlisted: 'Waitlisted',
  cancelled: 'Cancelled',
  attended: 'Attended',
  no_show: 'No Show',
} as const;

export interface ClubEvent {
  id: string;
  club_id: string;
  title: string;
  description: string | null;
  event_type: EventType;
  event_type_label: string;
  status: EventStatus;
  status_label: string;
  visibility: EventVisibility;
  visibility_label: string;
  start_at: string;
  end_at: string;
  location: string | null;
  capacity: number | null;
  registration_required: boolean;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  registration_fee: number | string;
  currency: string;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  registered_count: number;
  waitlisted_count: number;
  cancelled_count: number;
  attended_count: number;
  no_show_count: number;
  available_spots: number | null;
  is_registration_open: boolean;
}

export interface EventRegistration {
  id: string;
  event_id: string;
  user_id: string;
  status: EventRegistrationStatus;
  status_label: string;
  registered_at: string;
  cancelled_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  user_name: string | null;
  user_email: string | null;
  event_title: string | null;
  event_start_at: string | null;
}

export interface CreateEventPayload {
  title: string;
  description?: string | null;
  event_type?: EventType;
  visibility?: EventVisibility;
  start_at: string;
  end_at: string;
  location?: string | null;
  capacity?: number | null;
  registration_required?: boolean;
  registration_opens_at?: string | null;
  registration_closes_at?: string | null;
  registration_fee?: number;
  currency?: string;
}

export interface UpdateEventPayload {
  title?: string;
  description?: string | null;
  event_type?: EventType;
  visibility?: EventVisibility;
  start_at?: string;
  end_at?: string;
  location?: string | null;
  capacity?: number | null;
  registration_required?: boolean;
  registration_opens_at?: string | null;
  registration_closes_at?: string | null;
  registration_fee?: number;
  currency?: string;
}

export interface StaffRegisterPlayerPayload {
  user_id: string;
  notes?: string | null;
}

export interface PlayerRegisterPayload {
  notes?: string | null;
}

export interface PlayerEventDetail extends ClubEvent {
  my_registration: EventRegistration | null;
  is_eligible: boolean;
  eligibility_reason: string | null;
}

export interface EventFilters {
  status?: EventStatus;
  event_type?: EventType;
  visibility?: EventVisibility;
  date_from?: string;
  date_to?: string;
}

// ─── Phase 15: Lessons & Coaching Management ────────────────────────────────

export type LessonStatus = 'draft' | 'published' | 'cancelled' | 'completed';

export const LESSON_STATUS_LABELS: Record<LessonStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  cancelled: 'Cancelled',
  completed: 'Completed',
} as const;

export type LessonRegistrationStatus = 'registered' | 'cancelled' | 'attended' | 'no_show';

export const LESSON_REGISTRATION_STATUS_LABELS: Record<LessonRegistrationStatus, string> = {
  registered: 'Registered',
  cancelled: 'Cancelled',
  attended: 'Attended',
  no_show: 'No Show',
} as const;

export interface Coach {
  id: string;
  club_id: string;
  user_id: string | null;
  name: string;
  bio: string | null;
  specialization: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LessonType {
  id: string;
  club_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  default_capacity: number | null;
  default_price: number | string;
  currency: string;
  is_private: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClubLesson {
  id: string;
  club_id: string;
  lesson_type_id: string;
  coach_id: string;
  court_id: string | null;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  capacity: number | null;
  price: number | string;
  currency: string;
  status: LessonStatus;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  coach_name?: string | null;
  lesson_type_name?: string | null;
  court_name?: string | null;
  is_private?: boolean;
  duration_minutes?: number;
  registered_count?: number;
  available_spots?: number | null;
  is_registration_open?: boolean;
}

export interface ClubLessonDetail extends ClubLesson {
  coach: Coach | null;
  lesson_type: LessonType | null;
}

export interface LessonRegistration {
  id: string;
  lesson_id: string;
  user_id: string;
  status: LessonRegistrationStatus;
  registered_at: string;
  cancelled_at: string | null;
  attended_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  user_name: string | null;
  user_email: string | null;
  lesson_title: string | null;
  lesson_start_at: string | null;
}

export interface PlayerLessonDetail extends ClubLesson {
  my_registration: LessonRegistration | null;
  is_eligible: boolean;
  eligibility_reason: string | null;
}

export interface CreateCoachPayload {
  name: string;
  bio?: string | null;
  specialization?: string | null;
  phone?: string | null;
  email?: string | null;
  user_id?: string | null;
}

export interface UpdateCoachPayload {
  name?: string;
  bio?: string | null;
  specialization?: string | null;
  phone?: string | null;
  email?: string | null;
  user_id?: string | null;
}

export interface CreateLessonTypePayload {
  name: string;
  description?: string | null;
  duration_minutes?: number;
  default_capacity?: number | null;
  default_price?: number;
  currency?: string;
  is_private?: boolean;
}

export interface UpdateLessonTypePayload {
  name?: string;
  description?: string | null;
  duration_minutes?: number;
  default_capacity?: number | null;
  default_price?: number;
  currency?: string;
  is_private?: boolean;
}

export interface CreateLessonPayload {
  lesson_type_id: string;
  coach_id: string;
  court_id?: string | null;
  title: string;
  description?: string | null;
  start_at: string;
  end_at: string;
  capacity?: number | null;
  price?: number;
  currency?: string;
  registration_opens_at?: string | null;
  registration_closes_at?: string | null;
}

export interface UpdateLessonPayload {
  lesson_type_id?: string;
  coach_id?: string;
  court_id?: string | null;
  title?: string;
  description?: string | null;
  start_at?: string;
  end_at?: string;
  capacity?: number | null;
  price?: number;
  currency?: string;
  registration_opens_at?: string | null;
  registration_closes_at?: string | null;
}

export interface StaffRegisterLessonPlayerPayload {
  user_id: string;
  notes?: string | null;
}

export interface PlayerRegisterLessonPayload {
  notes?: string | null;
}

export interface LessonFilters {
  status?: LessonStatus;
  coach_id?: string;
  lesson_type_id?: string;
  court_id?: string;
  date_from?: string;
  date_to?: string;
}

// ─── Phase 17: Competition Scheduling & Court Assignment ──────────────────────

export interface ScheduledMatchParticipant {
  id: string;
  match_id: string;
  player_membership_id: string;
  side: string;
  partner_slot: number;
  user_id?: string | null;
  display_name?: string | null;
  membership_number?: string | null;
}

export interface ScheduledMatch {
  match_id: string;
  tournament_id?: string | null;
  league_id?: string | null;
  league_week_id?: string | null;
  court_id?: string | null;
  court_name?: string | null;
  court_number?: number | null;
  round_number?: number | null;
  match_number?: number | null;
  bracket_round?: number | null;
  bracket_position?: number | null;
  pool_id?: string | null;
  status: string;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  duration_minutes?: number | null;
  team_a_id?: string | null;
  team_a_name?: string | null;
  team_b_id?: string | null;
  team_b_name?: string | null;
  side_a_participants?: ScheduledMatchParticipant[];
  side_b_participants?: ScheduledMatchParticipant[];
  competition_name?: string | null;
  competition_type?: 'tournament' | 'league' | null;
}

export interface ScheduleMatchRequest {
  court_id: string;
  start_at: string;
  duration_minutes?: number;
}

export interface RescheduleMatchRequest {
  court_id?: string;
  start_at?: string;
  duration_minutes?: number;
}

export interface CourtSlotAvailability {
  start_at: string;
  end_at: string;
  is_available: boolean;
  conflict_reason?: string | null;
}

export interface CourtScheduleResponse {
  court_id: string;
  court_name: string;
  court_number: number;
  scheduled_matches: ScheduledMatch[];
}

export interface CourtAvailabilityResponse {
  court_id: string;
  court_name: string;
  court_number: number;
  slots: CourtSlotAvailability[];
}

export interface PlayerMatchScheduleResponse {
  match_id: string;
  competition_name: string;
  competition_type: 'tournament' | 'league';
  tournament_id?: string | null;
  league_id?: string | null;
  round_number?: number | null;
  match_number?: number | null;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  duration_minutes?: number | null;
  court_id?: string | null;
  court_name?: string | null;
  court_number?: number | null;
  status: string;
  my_team_name?: string | null;
  opponent_name?: string | null;
  partner_name?: string | null;
}

export * from './scramble';



