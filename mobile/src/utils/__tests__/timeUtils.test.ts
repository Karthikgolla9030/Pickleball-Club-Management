import {
  parseTimeString,
  toCanonicalTime,
  toCanonicalTimeWithSec,
  formatTimeDisplay,
  compareTimes,
  validateOperatingTimeRange,
} from '../timeUtils';

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    throw new Error(`Test failed: ${msg}`);
  }
}

export function runTimeUtilsTests(): void {
  // Scenario 1: Default opening time "06:00"
  const defOpen = parseTimeString('06:00');
  assert(defOpen !== null, '06:00 should parse');
  assert(defOpen?.hour24 === 6, '06:00 hour24 is 6');
  assert(defOpen?.minute === 0, '06:00 minute is 0');
  assert(defOpen?.str24 === '06:00', '06:00 str24 is 06:00');
  assert(defOpen?.str12 === '06:00 AM', '06:00 str12 is 06:00 AM');
  assert(defOpen?.totalMinutes === 360, '06:00 totalMinutes is 360');

  // Scenario 2: Selecting opening time with AM (06:00 AM)
  const amOpen = parseTimeString('06:00 AM');
  assert(amOpen !== null, '06:00 AM should parse');
  assert(amOpen?.str24 === '06:00', '06:00 AM canonical is 06:00');
  assert(amOpen?.hour12 === 6 && amOpen?.period === 'AM', '06:00 AM 12h matches');

  // Scenario 3: Selecting closing time with PM (10:00 PM / 22:00)
  const pmClose = parseTimeString('10:00 PM');
  assert(pmClose !== null, '10:00 PM should parse');
  assert(pmClose?.hour24 === 22, '10:00 PM hour24 is 22');
  assert(pmClose?.str24 === '22:00', '10:00 PM canonical is 22:00');
  assert(pmClose?.str12 === '10:00 PM', '10:00 PM str12 is 10:00 PM');

  // Scenario 4: Half-hour times (08:30 AM to 05:30 PM)
  const halfAm = parseTimeString('08:30 AM');
  const halfPm = parseTimeString('05:30 PM');
  assert(halfAm?.str24 === '08:30', '08:30 AM canonical is 08:30');
  assert(halfPm?.str24 === '17:30', '05:30 PM canonical is 17:30');

  // Scenario 5: 15-minute times (07:15 AM to 09:45 PM)
  const qAm = parseTimeString('07:15 AM');
  const qPm = parseTimeString('09:45 PM');
  assert(qAm?.str24 === '07:15', '07:15 AM canonical is 07:15');
  assert(qPm?.str24 === '21:45', '09:45 PM canonical is 21:45');

  // Scenario 6: Noon boundary (12:00 PM)
  const noon = parseTimeString('12:00 PM');
  assert(noon !== null, '12:00 PM parses');
  assert(noon?.hour24 === 12, '12:00 PM hour24 is 12');
  assert(noon?.hour12 === 12, '12:00 PM hour12 is 12');
  assert(noon?.period === 'PM', '12:00 PM period is PM');
  assert(noon?.str24 === '12:00', '12:00 PM canonical is 12:00');
  assert(noon?.str12 === '12:00 PM', '12:00 PM str12 is 12:00 PM');

  // Scenario 7: Midnight boundary (12:00 AM / 00:00 / 00:00:00)
  const midnightAm = parseTimeString('12:00 AM');
  assert(midnightAm !== null, '12:00 AM parses');
  assert(midnightAm?.hour24 === 0, '12:00 AM hour24 is 0');
  assert(midnightAm?.hour12 === 12, '12:00 AM hour12 is 12');
  assert(midnightAm?.period === 'AM', '12:00 AM period is AM');
  assert(midnightAm?.str24 === '00:00', '12:00 AM canonical is 00:00');
  assert(midnightAm?.str12 === '12:00 AM', '12:00 AM str12 is 12:00 AM');

  const zeroZero = parseTimeString('00:00');
  assert(zeroZero?.hour24 === 0 && zeroZero?.str24 === '00:00', '00:00 parses to 00:00');

  const zeroSec = parseTimeString('00:00:00');
  assert(zeroSec?.hour24 === 0 && zeroSec?.str24 === '00:00', '00:00:00 parses to 00:00');

  // Scenario 8: Legacy 3-part strings with seconds (The exact root cause of the bug!)
  const withSecOpen = parseTimeString('06:00:00');
  assert(withSecOpen !== null, '06:00:00 must parse (root cause fix)');
  assert(withSecOpen?.str24 === '06:00', '06:00:00 canonical is 06:00');
  assert(withSecOpen?.str12 === '06:00 AM', '06:00:00 displays as 06:00 AM');

  const withSecClose = parseTimeString('22:00:00');
  assert(withSecClose !== null, '22:00:00 must parse (root cause fix)');
  assert(withSecClose?.str24 === '22:00', '22:00:00 canonical is 22:00');
  assert(withSecClose?.str12 === '10:00 PM', '22:00:00 displays as 10:00 PM');

  // Scenario 9: toCanonicalTime and toCanonicalTimeWithSec
  assert(toCanonicalTime('06:00:00') === '06:00', 'toCanonicalTime strips seconds');
  assert(toCanonicalTime('6:00 AM') === '06:00', 'toCanonicalTime normalizes 6:00 AM');
  assert(toCanonicalTime('10:00 PM') === '22:00', 'toCanonicalTime normalizes 10:00 PM');
  assert(toCanonicalTimeWithSec('06:00') === '06:00:00', 'toCanonicalTimeWithSec adds seconds');

  // Scenario 10: formatTimeDisplay
  assert(formatTimeDisplay('06:00') === '06:00 AM', 'format 06:00');
  assert(formatTimeDisplay('22:00:00') === '10:00 PM', 'format 22:00:00');
  assert(formatTimeDisplay(null, '—') === '—', 'format fallback');

  // Scenario 11: compareTimes
  assert(compareTimes('06:00 AM', '10:00 PM') === -1, '06:00 AM < 10:00 PM');
  assert(compareTimes('10:00 PM', '06:00 AM') === 1, '10:00 PM > 06:00 AM');
  assert(compareTimes('06:00', '06:00:00') === 0, '06:00 === 06:00:00');

  // Scenario 12: validateOperatingTimeRange - Valid standard hours
  const validRange = validateOperatingTimeRange('06:00', '22:00');
  assert(validRange.isValid === true, '06:00 to 22:00 is valid');
  assert(validRange.openCanonical === '06:00', 'open canonical 06:00');
  assert(validRange.closeCanonical === '22:00', 'close canonical 22:00');

  // Scenario 13: validateOperatingTimeRange - Valid with seconds input
  const validSecRange = validateOperatingTimeRange('06:00:00', '22:00:00');
  assert(validSecRange.isValid === true, '06:00:00 to 22:00:00 is valid');
  assert(validSecRange.openCanonical === '06:00', 'sec input canonical 06:00');
  assert(validSecRange.closeCanonical === '22:00', 'sec input canonical 22:00');

  // Scenario 14: validateOperatingTimeRange - Equal times (must fail)
  const equalRange = validateOperatingTimeRange('06:00 AM', '06:00 AM');
  assert(equalRange.isValid === false, 'equal times must fail');
  assert(
    equalRange.errorMsg === 'Closing time must be later than opening time.',
    'equal times error message'
  );

  // Scenario 15: validateOperatingTimeRange - Reversed times / overnight unsupported (must fail)
  const reversedRange = validateOperatingTimeRange('10:00 PM', '06:00 AM');
  assert(reversedRange.isValid === false, 'reversed times must fail');
  assert(
    reversedRange.errorMsg?.includes('strictly earlier than closing time') === true,
    'reversed times error message'
  );

  // Scenario 16: validateOperatingTimeRange - Empty required opening time (must fail)
  const emptyOpen = validateOperatingTimeRange('', '22:00');
  assert(emptyOpen.isValid === false, 'empty opening time fails');
  assert(emptyOpen.errorMsg === 'Opening time is required', 'empty opening error');

  // Scenario 17: validateOperatingTimeRange - Empty required closing time (must fail)
  const emptyClose = validateOperatingTimeRange('06:00', '');
  assert(emptyClose.isValid === false, 'empty closing time fails');
  assert(emptyClose.errorMsg === 'Closing time is required', 'empty closing error');

  // Scenario 18: validateOperatingTimeRange - Midnight closing is valid
  const midnightClose = validateOperatingTimeRange('06:00 AM', '12:00 AM');
  assert(midnightClose.isValid === true, '06:00 AM to midnight (12:00 AM) is valid');
  assert(midnightClose.closeCanonical === '00:00', 'midnight close canonical is 00:00');

  // Scenario 19: Invalid text input
  assert(parseTimeString('not a time') === null, 'garbage string returns null');
  assert(parseTimeString('25:00') === null, '25:00 returns null');
  assert(parseTimeString('13:00 PM') === null, '13:00 PM returns null');
}

