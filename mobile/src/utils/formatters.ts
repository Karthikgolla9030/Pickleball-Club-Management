
/**
 * Aught2 Pickleball — Shared Formatters
 *
 * Centralized date/time/currency formatting utilities.
 * Use these everywhere instead of duplicating formatting logic per-screen.
 */

// ─── Date / Time Formatters ───────────────────────────────────────────────────

/**
 * Parses slot ISO string or time string into wall-clock hour, ampm, minutesFromMidnight, and canonical key.
 * Preserves the literal wall-clock time as stored/scheduled by court management.
 */
export function parseSlotTime(input: string | { start_time?: string; start_at?: string; label?: string }): {
  hour: string;
  ampm: string;
  minutesFromMidnight: number;
  canonicalKey: string;
} {
  let raw = '';
  if (typeof input === 'object' && input !== null) {
    if (input.start_time) {
      raw = input.start_time;
    } else if (input.start_at) {
      raw = input.start_at;
    }
  } else if (typeof input === 'string') {
    raw = input;
  }

  let h = 0;
  let m = 0;
  if (typeof raw === 'string' && raw.includes('T')) {
    const timePart = raw.split('T')[1];
    const match = timePart.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      h = parseInt(match[1], 10);
      m = parseInt(match[2], 10);
    } else {
      const d = new Date(raw);
      h = isNaN(d.getTime()) ? 0 : d.getUTCHours();
      m = isNaN(d.getTime()) ? 0 : d.getUTCMinutes();
    }
  } else if (typeof raw === 'string' && raw.includes(':')) {
    const match = raw.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      h = parseInt(match[1], 10);
      m = parseInt(match[2], 10);
    }
  } else {
    const d = new Date(raw);
    h = isNaN(d.getTime()) ? 0 : d.getUTCHours();
    m = isNaN(d.getTime()) ? 0 : d.getUTCMinutes();
  }

  const ampm = h >= 12 ? 'PM' : 'AM';
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  const mStr = String(m).padStart(2, '0');
  const h24Str = String(h).padStart(2, '0');
  return {
    hour: `${hour12}:${mStr}`,
    ampm,
    minutesFromMidnight: h * 60 + m,
    canonicalKey: `${h24Str}:${mStr}`,
  };
}

/**
 * Formats a slot timestamp to a clean user-facing time label (e.g. "06:00 AM" or "06:00 am")
 * exactly matching court management configuration.
 */
export function formatSlotLabel(
  input: string | { start_time?: string; start_at?: string; label?: string },
  options?: { uppercase?: boolean }
): string {
  if (typeof input === 'object' && input !== null && input.label) {
    return options?.uppercase ? input.label.toUpperCase() : input.label;
  }
  const { hour, ampm } = parseSlotTime(input);
  const parts = hour.split(':');
  const paddedHour = parts[0].padStart(2, '0');
  const min = parts[1] || '00';
  const ampmFormatted = options?.uppercase ? ampm.toUpperCase() : ampm.toLowerCase();
  return `${paddedHour}:${min} ${ampmFormatted}`;
}

/**
 * Short date: "Sep 22" or "Sep 22, 2025" (adds year if not current year)
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
    });
  } catch {
    return iso ?? '—';
  }
}

/**
 * Compact date with day: "Tue, Sep 22"
 */
export function formatDateWithDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso ?? '—';
  }
}

/**
 * Date + time: "Sep 22, 7:00 PM"
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const datePart = d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    const timePart = d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return `${datePart}, ${timePart}`;
  } catch {
    return iso ?? '—';
  }
}

/**
 * Time only: "7:00 PM"
 */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso ?? '—';
  }
}

/**
 * Time range: "7:00 PM – 8:00 PM"
 */
export function formatTimeRange(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): string {
  const start = formatTime(startIso);
  const end = formatTime(endIso);
  if (start === '—' && end === '—') return '—';
  if (end === '—') return start;
  return `${start} – ${end}`;
}

/**
 * Full date for display: "Tuesday, September 22, 2026"
 */
export function formatFullDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso ?? '—';
  }
}

/**
 * Relative label: "Today", "Tomorrow", or short date
 */
export function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const now = new Date();
    const todayStr = now.toDateString();
    const dStr = d.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);

    if (dStr === todayStr) return 'Today';
    if (dStr === tomorrow.toDateString()) return 'Tomorrow';
    return formatDate(iso);
  } catch {
    return iso ?? '—';
  }
}

// ─── Currency Formatter ───────────────────────────────────────────────────────

/**
 * Format currency amount with USD symbol prefix by default ($30.00, $1,250.00).
 * Uses en-US locale for consistent standard US Dollar presentation across the application.
 * formatCurrency(9999)        → '$9,999.00'
 * formatCurrency(30, 'USD')   → '$30.00'
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  currency: string = 'USD',
): string {
  if (amount === null || amount === undefined) return '—';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '—';

  const curr = (currency || 'USD').toUpperCase();
  const locale = curr === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: curr,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

// ─── Duration Formatter ───────────────────────────────────────────────────────

/**
 * Format duration in minutes: "1h 30m" or "45 min"
 */
export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ─── Text Truncation ─────────────────────────────────────────────────────────

/**
 * Truncate long text with ellipsis
 */
export function truncate(text: string | null | undefined, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 1) + '…';
}
