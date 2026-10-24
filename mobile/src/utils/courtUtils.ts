/**
 * Aught2 Pickleball — Court Resolution & Display Utilities
 *
 * Provides safe, player-friendly court label formatting across all tournament
 * formats (Round Robin, Pool Play, Bracket Play, Scramble, etc.) and application views.
 *
 * STRICT INVARIANT:
 * Internal database UUIDs and technical IDs must NEVER be rendered to players or staff.
 */

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export interface CourtResolvable {
  court_id?: string | null;
  court_name?: string | null;
  court_number?: number | string | null;
  court?: {
    id?: string | null;
    name?: string | null;
    display_name?: string | null;
    court_number?: number | string | null;
  } | null;
}

export interface CourtLabelOptions {
  /**
   * Label to display when no court is assigned to the match.
   * Default: 'Court not assigned'
   */
  unassignedLabel?: string;
  /**
   * Label to display when a match has a court ID, but the court record cannot be resolved.
   * Default: 'Court TBD'
   */
  unresolvedLabel?: string;
  /**
   * If true, returns an empty string or null instead of the unassigned label.
   */
  omitIfUnassigned?: boolean;
}

/**
 * Checks whether a string contains or is an internal UUID identifier.
 */
export function isUUIDOrTechnicalId(val: string | null | undefined): boolean {
  if (!val || typeof val !== 'string') return false;
  return UUID_REGEX.test(val.trim());
}

/**
 * Safely resolves a human-friendly court label from a match or court object.
 *
 * Examples of valid outputs:
 *  - "Court 1"
 *  - "Court 2"
 *  - "Stadium Court"
 *  - "Court A"
 *  - "Court not assigned"
 *
 * NEVER returns technical UUIDs such as "Court caa7ae17-e67f-4849-a67f-ddc3cebb410d".
 */
export function getCourtDisplayLabel(
  source: CourtResolvable | null | undefined,
  options: CourtLabelOptions = {}
): string {
  const {
    unassignedLabel = 'Court not assigned',
    unresolvedLabel = 'Court TBD',
    omitIfUnassigned = false,
  } = options;

  if (!source) {
    return omitIfUnassigned ? '' : unassignedLabel;
  }

  // 1. Check explicit court_name on the match (ensure it is not a raw UUID or "Court <uuid>")
  if (source.court_name && typeof source.court_name === 'string') {
    const trimmed = source.court_name.trim();
    if (trimmed && !isUUIDOrTechnicalId(trimmed)) {
      return trimmed;
    }
  }

  // 2. Check nested court object display_name or name
  if (source.court) {
    if (source.court.display_name && typeof source.court.display_name === 'string') {
      const trimmed = source.court.display_name.trim();
      if (trimmed && !isUUIDOrTechnicalId(trimmed)) {
        return trimmed;
      }
    }
    if (source.court.name && typeof source.court.name === 'string') {
      const trimmed = source.court.name.trim();
      if (trimmed && !isUUIDOrTechnicalId(trimmed)) {
        return trimmed;
      }
    }
    if (source.court.court_number !== undefined && source.court.court_number !== null) {
      const numStr = String(source.court.court_number).trim();
      if (numStr && !isNaN(Number(numStr))) {
        return `Court ${numStr}`;
      }
    }
  }

  // 3. Check explicit court_number on the match
  if (source.court_number !== undefined && source.court_number !== null) {
    const numStr = String(source.court_number).trim();
    if (numStr && !isNaN(Number(numStr))) {
      return `Court ${numStr}`;
    }
  }

  // 4. If court_id is missing or empty, the match is unassigned
  if (!source.court_id || !String(source.court_id).trim()) {
    return omitIfUnassigned ? '' : unassignedLabel;
  }

  // 5. A court_id exists, but the court entity could not be resolved
  // In development, log a diagnostic warning once for debugging missing foreign keys
  if (typeof __DEV__ !== 'undefined' && __DEV__ && isUUIDOrTechnicalId(source.court_id)) {
    console.debug(`[CourtResolver] Court record unresolved for court_id: ${source.court_id}`);
  }

  return unresolvedLabel;
}
