/**
 * Aught2 Pickleball — Centralized Payment Display Formatter
 *
 * Provides typed, defensive parsing of payment records for presentation across the UI:
 *   - Parses legacy records containing '[META]{...}' in service_name or notes
 *   - Safely parses JSON metadata without exposing internal field names or technical IDs
 *   - Normalizes service category labels ('Court Booking', 'Membership', etc.)
 *   - Formats failure reasons into clear, user-friendly explanations
 *   - Enforces consistent standard US Dollar formatting
 */

import type { Payment, PaymentMethod } from '@/types';
import { formatCurrency } from './formatters';

export interface ParsedPaymentDetails {
  serviceType: string;
  activityTitle: string | null;
  activitySubtitle: string | null;
  cleanNote: string | null;
  failureReason: string | null;
  formattedAmount: string;
  methodLabel: string;
  formattedDate: string;
}

const PURPOSE_DISPLAY_NAMES: Record<string, string> = {
  court_booking: 'Court Booking',
  membership: 'Membership',
  tournament: 'Tournament Registration',
  league: 'League Registration',
  event: 'Event Registration',
  lesson: 'Lesson & Coaching',
};

/**
 * Extracts a JSON object from text whether prefixed with [META] or raw.
 */
function tryExtractMeta(raw: string | null | undefined): Record<string, any> | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();

  let jsonStr: string | null = null;
  if (trimmed.includes('[META]')) {
    jsonStr = trimmed.split('[META]')[1]?.trim() || null;
  } else if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    jsonStr = trimmed;
  }

  if (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Strips raw metadata, JSON, or internal implementation fields from user notes.
 */
function cleanUserNote(rawNotes: string | null | undefined, extractedMeta: Record<string, any> | null): string | null {
  if (!rawNotes || typeof rawNotes !== 'string') return null;
  const trimmed = rawNotes.trim();

  // If notes contains [META], take the pre-[META] text or the 'notes' field inside meta
  if (trimmed.includes('[META]')) {
    const preText = trimmed.split('[META]')[0]?.trim();
    if (preText && !preText.startsWith('{')) return preText;
    if (extractedMeta?.notes && typeof extractedMeta.notes === 'string') {
      const mn = extractedMeta.notes.trim();
      if (mn && !mn.startsWith('{') && mn.toLowerCase() !== 'null' && mn.toLowerCase() !== 'none') {
        return mn;
      }
    }
    return null;
  }

  // If raw JSON, check for a user note inside it
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    if (extractedMeta?.notes && typeof extractedMeta.notes === 'string') {
      const mn = extractedMeta.notes.trim();
      if (mn && !mn.startsWith('{') && mn.toLowerCase() !== 'null' && mn.toLowerCase() !== 'none') {
        return mn;
      }
    }
    return null;
  }

  // Clean raw string note
  if (trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'none') {
    return null;
  }

  return trimmed;
}

/**
 * Formats raw failure reasons into concise, friendly explanations without technical jargon.
 */
export function formatPaymentFailureReason(rawReason: string | null | undefined): string | null {
  if (!rawReason || typeof rawReason !== 'string') return null;
  const trimmed = rawReason.trim();
  const upper = trimmed.toUpperCase();

  if (upper.includes('USER_DROPPED') || upper.includes('DROPPED_WEBHOOK')) {
    return 'Payment was not completed by the user';
  }
  if (upper.includes('FAILED_WEBHOOK') || upper.includes('PAYMENT_FAILED') || upper.includes('PAYMENT_DECLINED')) {
    return 'Payment was declined by the bank or card issuer';
  }
  if (upper.includes('SIGNATURE') && upper.includes('VERIFICATION')) {
    return 'Payment verification could not be authenticated';
  }
  if (upper.includes('EXPIRED') || upper.includes('TIMED_OUT')) {
    return 'Payment session expired';
  }
  if (upper.includes('CANCELLED') || upper.includes('CANCELED')) {
    return 'Payment was cancelled';
  }
  if (upper.startsWith('PROVIDER WEBHOOK REPORTED')) {
    return 'Payment was not confirmed by the payment gateway';
  }
  if (trimmed.startsWith('{') || trimmed.includes('[META]')) {
    return 'Payment processing could not be completed';
  }

  // If it's a short readable string (not a stack trace or JSON), show it
  if (trimmed.length < 120 && !trimmed.includes('{') && !trimmed.includes('Traceback')) {
    return trimmed;
  }

  return 'Payment transaction failed';
}

/**
 * Formats payment method codes to uppercase readable labels.
 */
export function formatPaymentMethodLabel(method: PaymentMethod | string | null | undefined): string {
  if (!method) return 'ONLINE';
  const clean = String(method).toLowerCase().replace(/[_-]/g, ' ');
  return clean.toUpperCase();
}

/**
 * Formats transaction timestamp.
 */
export function formatTransactionDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
    const day = d.getDate();
    const month = months[d.getMonth()] || '';
    const year = d.getFullYear();

    let hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const mStr = minutes < 10 ? `0${minutes}` : `${minutes}`;

    return `${day} ${month} ${year}, ${hours}:${mStr} ${ampm}`;
  } catch {
    return dateStr;
  }
}

/**
 * Master parser: resolves clean service display name, secondary activity details,
 * user notes, failure reason, and dollar amount for any payment record.
 */
export function parsePaymentDetails(item: Payment): ParsedPaymentDetails {
  // 1. Try to extract metadata from all possible locations
  const metaFromNotes = tryExtractMeta(item.notes);
  const metaFromService = tryExtractMeta(item.service_name);
  const meta = metaFromService || metaFromNotes || null;

  // 2. Determine Service Type Label
  const purposeKey = (item.purpose || '').toLowerCase();
  let serviceType = PURPOSE_DISPLAY_NAMES[purposeKey] || (item as any).purpose_label || 'Payment';

  // 3. Determine Activity Title & Subtitle
  let activityTitle: string | null = item.activity_title || null;
  let activitySubtitle: string | null = item.activity_subtitle || null;

  // If activity title not already provided, look inside linked objects and meta
  if (!activityTitle) {
    if (item.subscription?.plan_name) {
      activityTitle = item.subscription.plan_name;
    } else if (meta?.activity_title) {
      activityTitle = String(meta.activity_title);
    } else if (meta?.activity_name) {
      activityTitle = String(meta.activity_name);
    } else if (meta?.plan_name) {
      activityTitle = String(meta.plan_name);
    } else if (meta?.court_name) {
      activityTitle = String(meta.court_name);
    }
  }

  // If service_name has non-meta text that isn't identical to serviceType, check if it has details
  if (
    !activityTitle &&
    item.service_name &&
    !item.service_name.includes('[META]') &&
    !item.service_name.trim().startsWith('{')
  ) {
    const raw = item.service_name.trim();
    // E.g. "Court: court 2" -> activityTitle = "court 2"
    for (const prefix of ['Court: ', 'Tournament: ', 'Event: ', 'Lesson: ', 'League: ']) {
      if (raw.startsWith(prefix)) {
        activityTitle = raw.slice(prefix.length).trim();
        break;
      }
    }
    if (!activityTitle && raw.toLowerCase() !== serviceType.toLowerCase()) {
      activityTitle = raw;
    }
  }

  // Resolve activity subtitle if not already present
  if (!activitySubtitle && meta) {
    const sub = meta.activity_subtitle;
    const dur = meta.duration_minutes;
    const parts: string[] = [];
    if (sub && String(sub).toLowerCase() !== 'null' && String(sub).toLowerCase() !== 'none') {
      parts.push(String(sub));
    }
    if (dur) {
      parts.push(`${dur} mins`);
    }
    if (parts.length > 0) {
      activitySubtitle = parts.join(' · ');
    }
  }

  // Clean activity title if it contains technical prefixes or braces
  if (activityTitle) {
    let t = activityTitle.trim();
    if (t.startsWith('{') || t.includes('[META]') || t.includes('club_id')) {
      activityTitle = null;
    } else {
      // Capitalize first letter of activity title for polish (e.g. "court 2" -> "Court 2")
      activityTitle = t.charAt(0).toUpperCase() + t.slice(1);
    }
  }

  if (activitySubtitle) {
    const s = activitySubtitle.trim();
    if (s.startsWith('{') || s.includes('[META]') || s.includes('club_id')) {
      activitySubtitle = null;
    } else {
      activitySubtitle = s;
    }
  }

  // 4. Clean user notes (guaranteed never to expose [META] or JSON)
  const cleanNote = cleanUserNote(item.notes, meta);

  // 5. Clean failure reason
  const failureReason = formatPaymentFailureReason(item.failure_reason);

  // 6. Formatted Amount: Standardize on US Dollars ($)
  // Ensure that whether stored as USD or historical INR, we present consistent USD formatting
  const formattedAmount = formatCurrency(item.amount, 'USD');

  // 7. Method label
  const methodLabel = formatPaymentMethodLabel(
    (meta?.selected_method as any) || item.payment_method
  );

  // 8. Formatted Date
  const formattedDate = formatTransactionDateTime(item.created_at);

  return {
    serviceType,
    activityTitle,
    activitySubtitle,
    cleanNote,
    failureReason,
    formattedAmount,
    methodLabel,
    formattedDate,
  };
}

