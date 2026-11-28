/**
 * Formats club weekly operating schedules into clean, human-readable lines
 * without comma-clutter or ellipsis truncation.
 */
import type { Club, WeeklyOperatingHoursMap } from '@/types';
import { parseTimeString } from './timeUtils';

export interface FormattedScheduleLine {
  daysLabel: string;
  hoursLabel: string;
}

const ORDERED_DAYS: ReadonlyArray<{
  key: keyof WeeklyOperatingHoursMap;
  short: string;
}> = [
  { key: 'monday', short: 'Mon' },
  { key: 'tuesday', short: 'Tue' },
  { key: 'wednesday', short: 'Wed' },
  { key: 'thursday', short: 'Thu' },
  { key: 'friday', short: 'Fri' },
  { key: 'saturday', short: 'Sat' },
  { key: 'sunday', short: 'Sun' },
];

const DAY_ALIASES: Record<string, number> = {
  mon: 0,
  monday: 0,
  tue: 1,
  tues: 1,
  tuesday: 1,
  wed: 2,
  wednesday: 2,
  thu: 3,
  thur: 3,
  thurs: 3,
  thursday: 3,
  fri: 4,
  friday: 4,
  sat: 5,
  saturday: 5,
  sun: 6,
  sunday: 6,
};

function formatCompact12h(raw: string): string {
  const parsed = parseTimeString(raw);
  if (!parsed) return raw.trim();
  const mins = String(parsed.minute).padStart(2, '0');
  return `${parsed.hour12}:${mins} ${parsed.period}`;
}

export function formatOperatingHoursRange(
  openingTime?: string | null,
  closingTime?: string | null,
): string | null {
  if (!openingTime || !closingTime) return null;
  const openFormatted = formatCompact12h(openingTime);
  const closeFormatted = formatCompact12h(closingTime);
  if (!openFormatted || !closeFormatted) return null;
  return `${openFormatted} – ${closeFormatted}`;
}

/**
 * Formats an array of weekday indices (0=Mon .. 6=Sun) into compact ranges:
 * - [0,1,2,3,4,5,6] -> "Every day"
 * - [0,1,2,3,4] -> "Mon – Fri"
 * - [0,1,2,4,5] -> "Mon – Wed, Fri – Sat"
 */
export function formatDayIndices(indices: number[]): string {
  const uniqueSorted = Array.from(new Set(indices))
    .filter((i) => i >= 0 && i <= 6)
    .sort((a, b) => a - b);

  if (uniqueSorted.length === 0) return '';
  if (uniqueSorted.length === 7) return 'Every day';

  const runs: string[] = [];
  let start = uniqueSorted[0];
  let prev = uniqueSorted[0];

  for (let i = 1; i <= uniqueSorted.length; i += 1) {
    const curr = uniqueSorted[i];
    if (curr === prev + 1) {
      prev = curr;
      continue;
    }
    const len = prev - start + 1;
    if (len >= 3) {
      runs.push(`${ORDERED_DAYS[start].short} – ${ORDERED_DAYS[prev].short}`);
    } else if (len === 2) {
      runs.push(`${ORDERED_DAYS[start].short} – ${ORDERED_DAYS[prev].short}`);
    } else {
      runs.push(ORDERED_DAYS[start].short);
    }
    start = curr;
    prev = curr;
  }

  return runs.join(', ');
}

function parseDayIndicesFromString(operatingDays?: string | null): number[] {
  if (!operatingDays || !operatingDays.trim()) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  const raw = operatingDays.trim();
  const normalizedLower = raw.toLowerCase();
  if (
    normalizedLower === 'every day' ||
    normalizedLower === 'everyday' ||
    normalizedLower === 'daily' ||
    normalizedLower === '7 days'
  ) {
    return [0, 1, 2, 3, 4, 5, 6];
  }

  const indices = new Set<number>();
  const tokens = raw.split(/[,&]+/).map((t) => t.trim()).filter(Boolean);

  for (const token of tokens) {
    // Support ranges like "Mon - Sun" or "Mon–Fri"
    const rangeParts = token.split(/\s*[-–—to]+\s*/i).map((p) => p.trim()).filter(Boolean);
    if (rangeParts.length === 2) {
      const a = DAY_ALIASES[rangeParts[0].toLowerCase()];
      const b = DAY_ALIASES[rangeParts[1].toLowerCase()];
      if (a !== undefined && b !== undefined) {
        if (a <= b) {
          for (let d = a; d <= b; d += 1) indices.add(d);
        } else {
          for (let d = a; d <= 6; d += 1) indices.add(d);
          for (let d = 0; d <= b; d += 1) indices.add(d);
        }
        continue;
      }
    }
    const single = DAY_ALIASES[token.toLowerCase()];
    if (single !== undefined) {
      indices.add(single);
    }
  }

  if (indices.size === 0) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  return Array.from(indices).sort((a, b) => a - b);
}

/**
 * Produces structured schedule lines from a Club's `operating_hours` map (if set)
 * or falls back cleanly to `operating_days` + `opening_time` / `closing_time`.
 * Groups identical hours across days and uses "Every day" when all 7 days match.
 */
export function formatClubOperatingSchedule(
  club: Pick<Club, 'operating_hours' | 'operating_days' | 'opening_time' | 'closing_time'>,
): FormattedScheduleLine[] {
  const fallbackHours = formatOperatingHoursRange(club.opening_time, club.closing_time);
  const weekly = club.operating_hours;

  if (weekly && typeof weekly === 'object') {
    const groups = new Map<string, { indices: number[]; hoursLabel: string }>();

    ORDERED_DAYS.forEach((dayMeta, idx) => {
      const cfg = weekly[dayMeta.key];
      if (!cfg) {
        if (fallbackHours) {
          const existing = groups.get(fallbackHours) ?? { indices: [], hoursLabel: fallbackHours };
          existing.indices.push(idx);
          groups.set(fallbackHours, existing);
        }
        return;
      }

      if (cfg.is_closed) {
        return;
      }

      const dayHours =
        formatOperatingHoursRange(cfg.open_time, cfg.close_time) ?? fallbackHours;
      if (!dayHours) return;

      const existing = groups.get(dayHours) ?? { indices: [], hoursLabel: dayHours };
      existing.indices.push(idx);
      groups.set(dayHours, existing);
    });

    if (groups.size > 0) {
      return Array.from(groups.values()).map((grp) => ({
        daysLabel: formatDayIndices(grp.indices),
        hoursLabel: grp.hoursLabel,
      }));
    }

    // All 7 days explicitly marked closed
    const anyConfigured = ORDERED_DAYS.some((d) => Boolean(weekly[d.key]));
    if (anyConfigured && ORDERED_DAYS.every((d) => weekly[d.key]?.is_closed)) {
      return [{ daysLabel: 'Closed', hoursLabel: 'See club details' }];
    }
  }

  const dayIndices = parseDayIndicesFromString(club.operating_days);
  const daysLabel = formatDayIndices(dayIndices) || 'Every day';
  const hoursLabel = fallbackHours || 'Hours not specified';
  return [{ daysLabel, hoursLabel }];
}
