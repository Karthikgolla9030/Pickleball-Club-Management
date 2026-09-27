/**
 * Aught2 Pickleball — Shared Formatters
 *
 * Centralized date/time/currency formatting utilities.
 * Use these everywhere instead of duplicating formatting logic per-screen.
 */

// ─── Date / Time Formatters ───────────────────────────────────────────────────

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
 * Format currency amount with symbol prefix.
 * formatCurrency(9999, 'INR') → '₹9,999.00'
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  currency: string = 'INR',
): string {
  if (amount === null || amount === undefined) return '—';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '—';

  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  const formatted = num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}`;
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
