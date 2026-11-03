/**
 * Aught2 Pickleball — Canonical Time Utilities & Operating Hours Validator
 *
 * Defines the single, standard time representation across the application:
 * - Internal / API / Database: 24-hour "HH:mm" (e.g. "06:00", "22:00", "00:00")
 * - Display / UI: 12-hour "hh:mm A" (e.g. "06:00 AM", "10:00 PM", "12:00 PM")
 *
 * Supports robust parsing of:
 * - 24h time with or without seconds: "06:00", "06:00:00", "22:00", "22:00:00", "6:00"
 * - 12h time with AM/PM: "06:00 AM", "6:00 AM", "10:00 PM", "12:00 PM", "12:00 AM"
 * - Date objects & ISO strings
 */

export interface ParsedTime {
  /** 24-hour hour number (0..23) */
  hour24: number;
  /** Minute number (0..59) */
  minute: number;
  /** 12-hour hour number (1..12) */
  hour12: number;
  /** AM or PM period */
  period: 'AM' | 'PM';
  /** Canonical 24-hour representation: "HH:mm" (e.g. "06:00", "22:00") */
  str24: string;
  /** 24-hour with seconds: "HH:mm:ss" (e.g. "06:00:00", "22:00:00") */
  str24WithSec: string;
  /** Formatted 12-hour representation: "hh:mm A" (e.g. "06:00 AM", "10:00 PM") */
  str12: string;
  /** Total elapsed minutes from midnight (0..1439) */
  totalMinutes: number;
}

export interface TimeValidationResult {
  isValid: boolean;
  errorMsg?: string;
  field?: 'opening_time' | 'closing_time';
  openCanonical?: string;   // "06:00"
  closeCanonical?: string;  // "22:00"
  openDisplay?: string;     // "06:00 AM"
  closeDisplay?: string;    // "10:00 PM"
}

/**
 * Robustly parses any recognized time string, Date object, or timestamp.
 * Returns a complete ParsedTime descriptor or null if unparseable / out of range.
 */
export function parseTimeString(val: unknown): ParsedTime | null {
  if (val === null || val === undefined) return null;

  // Handle Date instances
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const h = val.getHours();
    const m = val.getMinutes();
    return buildParsedTime(h, m);
  }

  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed) return null;

  // If ISO string containing 'T', attempt date parsing
  if (trimmed.includes('T')) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return buildParsedTime(d.getHours(), d.getMinutes());
    }
  }

  // Regex matches:
  // - "HH:MM" (e.g. "06:00", "6:00")
  // - "HH:MM:SS" (e.g. "06:00:00", "22:00:00")
  // - "HH:MM AM/PM" or "HH:MM:SS AM/PM" (e.g. "06:00 AM", "6:00am", "10:00 PM")
  // - "HH AM/PM" (e.g. "6 AM", "10 PM")
  const match = trimmed.match(/^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?(?:\s*(AM|PM))?$/i);
  if (!match) return null;

  const rawH = parseInt(match[1], 10);
  const rawM = match[2] !== undefined ? parseInt(match[2], 10) : 0;
  const rawS = match[3] !== undefined ? parseInt(match[3], 10) : 0;
  const ampm = match[4]?.toUpperCase();

  // Validate minutes and seconds
  if (isNaN(rawH) || isNaN(rawM) || isNaN(rawS)) return null;
  if (rawM < 0 || rawM > 59 || rawS < 0 || rawS > 59) return null;

  let hour24: number;

  if (ampm === 'AM' || ampm === 'PM') {
    // 12-hour format: hour must be 1..12
    if (rawH < 1 || rawH > 12) return null;
    if (ampm === 'PM') {
      hour24 = rawH === 12 ? 12 : rawH + 12;
    } else {
      hour24 = rawH === 12 ? 0 : rawH;
    }
  } else {
    // 24-hour format: hour must be 0..23
    if (rawH < 0 || rawH > 23) return null;
    hour24 = rawH;
  }

  return buildParsedTime(hour24, rawM);
}

function buildParsedTime(hour24: number, minute: number): ParsedTime {
  const period: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM';
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;

  const h24Str = String(hour24).padStart(2, '0');
  const mStr = String(minute).padStart(2, '0');
  const h12Str = String(hour12).padStart(2, '0');

  const str24 = `${h24Str}:${mStr}`;
  const str24WithSec = `${str24}:00`;
  const str12 = `${h12Str}:${mStr} ${period}`;
  const totalMinutes = hour24 * 60 + minute;

  return {
    hour24,
    minute,
    hour12,
    period,
    str24,
    str24WithSec,
    str12,
    totalMinutes,
  };
}

/**
 * Converts any recognized time representation into canonical 24-hour "HH:mm".
 * Returns null if the input is empty or invalid.
 * Examples:
 *   toCanonicalTime("06:00:00") -> "06:00"
 *   toCanonicalTime("6:00 AM")   -> "06:00"
 *   toCanonicalTime("10:00 PM")  -> "22:00"
 *   toCanonicalTime("12:00 PM")  -> "12:00"
 *   toCanonicalTime("12:00 AM")  -> "00:00"
 */
export function toCanonicalTime(val: unknown): string | null {
  const parsed = parseTimeString(val);
  return parsed ? parsed.str24 : null;
}

/**
 * Converts any recognized time representation into 24-hour "HH:mm:ss".
 * Useful for backend endpoints that require a 3-part time string.
 */
export function toCanonicalTimeWithSec(val: unknown): string | null {
  const parsed = parseTimeString(val);
  return parsed ? parsed.str24WithSec : null;
}

/**
 * Formats any recognized time value for user-facing display: "hh:mm A".
 * Examples:
 *   formatTimeDisplay("06:00")     -> "06:00 AM"
 *   formatTimeDisplay("22:00:00")  -> "10:00 PM"
 *   formatTimeDisplay(null, "—")   -> "—"
 */
export function formatTimeDisplay(val: unknown, fallback: string = ''): string {
  const parsed = parseTimeString(val);
  if (!parsed) return fallback;
  return parsed.str12;
}

/**
 * Compares two time inputs.
 * Returns:
 *   -1 if timeA < timeB
 *    0 if timeA === timeB
 *    1 if timeA > timeB
 */
export function compareTimes(timeA: unknown, timeB: unknown): number {
  const pA = parseTimeString(timeA);
  const pB = parseTimeString(timeB);
  if (!pA && !pB) return 0;
  if (!pA) return -1;
  if (!pB) return 1;
  if (pA.totalMinutes < pB.totalMinutes) return -1;
  if (pA.totalMinutes > pB.totalMinutes) return 1;
  return 0;
}

/**
 * Validates court operating opening and closing times.
 *
 * Requirements:
 * - Opening time and closing time must be valid formats.
 * - If required is true, neither may be empty.
 * - Closing time must be later than opening time (overnight crossing midnight unsupported).
 * - Exception: closing time of "00:00" or "12:00 AM" is recognized as closing at midnight
 *   (i.e. 1440 minutes, end of day), valid if opening is > 00:00.
 */
export function validateOperatingTimeRange(
  openingTime: string | null | undefined,
  closingTime: string | null | undefined,
  options?: {
    required?: boolean;
    allowOvernight?: boolean;
  }
): TimeValidationResult {
  const required = options?.required ?? true;
  const allowOvernight = options?.allowOvernight ?? false;

  const openTrimmed = typeof openingTime === 'string' ? openingTime.trim() : '';
  const closeTrimmed = typeof closingTime === 'string' ? closingTime.trim() : '';

  if (required) {
    if (!openTrimmed) {
      return {
        isValid: false,
        field: 'opening_time',
        errorMsg: 'Opening time is required',
      };
    }
    if (!closeTrimmed) {
      return {
        isValid: false,
        field: 'closing_time',
        errorMsg: 'Closing time is required',
      };
    }
  } else {
    if (!openTrimmed && !closeTrimmed) {
      return { isValid: true };
    }
    if (!openTrimmed && closeTrimmed) {
      return {
        isValid: false,
        field: 'opening_time',
        errorMsg: 'Opening time is required when closing time is configured',
      };
    }
    if (openTrimmed && !closeTrimmed) {
      return {
        isValid: false,
        field: 'closing_time',
        errorMsg: 'Closing time is required when opening time is configured',
      };
    }
  }

  const parsedOpen = parseTimeString(openTrimmed);
  if (!parsedOpen) {
    return {
      isValid: false,
      field: 'opening_time',
      errorMsg: 'Please enter a valid opening time (e.g. 06:00 or 6:00 AM)',
    };
  }

  const parsedClose = parseTimeString(closeTrimmed);
  if (!parsedClose) {
    return {
      isValid: false,
      field: 'closing_time',
      errorMsg: 'Please enter a valid closing time (e.g. 22:00 or 10:00 PM)',
    };
  }

  // Handle midnight closing (00:00 = 1440 minutes)
  const effectiveCloseMinutes = parsedClose.totalMinutes === 0 ? 1440 : parsedClose.totalMinutes;
  const effectiveOpenMinutes = parsedOpen.totalMinutes;

  if (effectiveOpenMinutes === effectiveCloseMinutes) {
    return {
      isValid: false,
      field: 'closing_time',
      errorMsg: 'Closing time must be later than opening time.',
    };
  }

  if (!allowOvernight && effectiveOpenMinutes > effectiveCloseMinutes) {
    return {
      isValid: false,
      field: 'closing_time',
      errorMsg: `Opening time (${parsedOpen.str12}) must be strictly earlier than closing time (${parsedClose.str12}). Overnight hours are not supported.`,
    };
  }

  return {
    isValid: true,
    openCanonical: parsedOpen.str24,
    closeCanonical: parsedClose.str24,
    openDisplay: parsedOpen.str12,
    closeDisplay: parsedClose.str12,
  };
}

/**
 * Constructs an ISO 8601 UTC timestamp string from separate local date (YYYY-MM-DD)
 * and local time (HH:MM or HH:MM:SS) strings.
 * Preserves the literal wall-clock date and time in the user's local timezone.
 */
export function buildIsoFromLocalParts(dateStr: string, timeStr?: string | null): string {
  if (!dateStr || !dateStr.trim()) return '';
  const dateParts = dateStr.trim().split('-').map(Number);
  if (dateParts.length < 3 || dateParts.some(isNaN)) return '';
  const [y, m, d] = dateParts;

  const cleanTime = (timeStr || '09:00:00').trim();
  const timeParts = cleanTime.split(':').map(Number);
  const hour = !isNaN(timeParts[0]) ? timeParts[0] : 9;
  const min = timeParts[1] !== undefined && !isNaN(timeParts[1]) ? timeParts[1] : 0;
  const sec = timeParts[2] !== undefined && !isNaN(timeParts[2]) ? timeParts[2] : 0;

  const localDate = new Date(y, m - 1, d, hour, min, sec);
  if (isNaN(localDate.getTime())) return '';
  return localDate.toISOString();
}

/**
 * Parses an ISO 8601 timestamp string into its local wall-clock components:
 * - datePart: "YYYY-MM-DD"
 * - timePart: "HH:MM:SS" (24-hour)
 * - time12: "hh:mm A" (12-hour formatted, e.g. "09:00 AM")
 * - isSet: boolean (true if input was a valid non-empty ISO string)
 */
export function parseIsoToLocalParts(
  isoStr?: string | null,
  fallbackTime = '09:00:00'
): {
  datePart: string;
  timePart: string;
  time12: string;
  isSet: boolean;
} {
  const cleanFallback = fallbackTime.length === 5 ? `${fallbackTime}:00` : fallbackTime;

  if (!isoStr || !isoStr.trim()) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');

    const parts = cleanFallback.split(':').map(Number);
    let h12 = (parts[0] || 0) % 12;
    if (h12 === 0) h12 = 12;
    const ampm = (parts[0] || 0) >= 12 ? 'PM' : 'AM';
    const h12Str = String(h12).padStart(2, '0');
    const minStr = String(parts[1] || 0).padStart(2, '0');

    return {
      datePart: `${y}-${m}-${d}`,
      timePart: cleanFallback,
      time12: `${h12Str}:${minStr} ${ampm}`,
      isSet: false,
    };
  }

  try {
    const d = new Date(isoStr);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const h24 = d.getHours();
      const min = String(d.getMinutes()).padStart(2, '0');
      const sec = String(d.getSeconds()).padStart(2, '0');

      const ampm = h24 >= 12 ? 'PM' : 'AM';
      let h12 = h24 % 12;
      if (h12 === 0) h12 = 12;
      const h12Str = String(h12).padStart(2, '0');

      return {
        datePart: `${y}-${m}-${day}`,
        timePart: `${String(h24).padStart(2, '0')}:${min}:${sec}`,
        time12: `${h12Str}:${min} ${ampm}`,
        isSet: true,
      };
    }
  } catch {
    // fallback
  }

  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');

  return {
    datePart: `${y}-${m}-${d}`,
    timePart: cleanFallback,
    time12: '09:00 AM',
    isSet: false,
  };
}

/**
 * Formats an ISO timestamp for display in DateTimePicker inputs: "MMM D, YYYY • hh:mm A"
 */
export function formatDateTimeDisplay(isoStr?: string | null): string {
  if (!isoStr || !isoStr.trim()) return '';
  try {
    const d = new Date(isoStr);
    if (!isNaN(d.getTime())) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthStr = months[d.getMonth()];
      const day = d.getDate();
      const year = d.getFullYear();
      let hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      if (hours === 0) hours = 12;
      const hStr = String(hours).padStart(2, '0');
      return `${monthStr} ${day}, ${year} • ${hStr}:${minutes} ${ampm}`;
    }
  } catch {
    // fallback
  }
  return isoStr;
}


