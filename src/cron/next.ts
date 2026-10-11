import type { ParsedCron } from "./parse";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const SEARCH_YEARS = 8;

function calendarDate(year: number, month: number, day: number): Date {
  // setUTCFullYear also handles years 0-99 without Date.UTC's 1900 adjustment.
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  return date;
}

function matchesDay(fields: ParsedCron, day: number, weekday: number): boolean {
  const matchesMonthDay = fields.daysOfMonth.includes(day);
  const matchesWeekday = fields.daysOfWeek.includes(weekday);
  return fields.dayOfMonthRestricted && fields.dayOfWeekRestricted
    ? matchesMonthDay || matchesWeekday
    : matchesMonthDay && matchesWeekday;
}

/** Nearby offsets let a repeated local time produce both real instants during DST fall-back. */
function nearbyOffsets(calendarTime: number): Set<number> {
  const offsets = new Set<number>();
  for (let delta = -DAY_MS; delta <= 2 * DAY_MS; delta += 6 * 60 * MINUTE_MS) {
    const offset = new Date(calendarTime + delta).getTimezoneOffset();
    if (Number.isFinite(offset)) offsets.add(offset);
  }
  return offsets;
}

/**
 * Return up to count runs strictly after start, in ascending order.
 * Calendar days are advanced in UTC only as date labels; candidates are evaluated
 * in the host's local zone. Nonexistent local times fail the round-trip check.
 * The search stops eight calendar years after start, even for impossible dates.
 */
export function nextRuns(fields: ParsedCron, start: Date, count = 10): Date[] {
  const startTime = start.getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(count) || count < 1) return [];
  const wanted = Math.floor(count);
  const cursor = calendarDate(start.getFullYear(), start.getMonth(), start.getDate());
  const end = calendarDate(
    start.getFullYear() + SEARCH_YEARS,
    start.getMonth(),
    start.getDate(),
  ).getTime();
  const runs: Date[] = [];

  while (cursor.getTime() <= end && runs.length < wanted) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const day = cursor.getUTCDate();
    if (fields.months.includes(month + 1) && matchesDay(fields, day, cursor.getUTCDay())) {
      const candidates = new Set<number>();
      const offsets = nearbyOffsets(cursor.getTime());
      for (const hour of fields.hours) {
        for (const minute of fields.minutes) {
          const wallTime = cursor.getTime() + (hour * 60 + minute) * MINUTE_MS;
          for (const offset of offsets) {
            const instant = wallTime + offset * MINUTE_MS;
            if (instant <= startTime) continue;
            const local = new Date(instant);
            if (
              local.getFullYear() === year &&
              local.getMonth() === month &&
              local.getDate() === day &&
              local.getHours() === hour &&
              local.getMinutes() === minute &&
              local.getSeconds() === 0 &&
              local.getMilliseconds() === 0
            ) {
              candidates.add(instant);
            }
          }
        }
      }
      for (const instant of [...candidates].sort((a, b) => a - b)) {
        if (runs.length === wanted) break;
        if (runs.length === 0 || instant > runs[runs.length - 1].getTime()) {
          runs.push(new Date(instant));
        }
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return runs;
}
