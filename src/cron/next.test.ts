import { describe, expect, test } from "bun:test";
import { nextRuns } from "./next";
import { parseCron } from "./parse";

function parsed(expression: string) {
  const result = parseCron(expression);
  if (!result.ok) throw new Error(result.error);
  return result.fields;
}

function expectFutureAscending(runs: Date[], start: Date) {
  let previous = start.getTime();
  for (const run of runs) {
    expect(Number.isFinite(run.getTime())).toBe(true);
    expect(run.getTime()).toBeGreaterThan(previous);
    expect(run.getSeconds()).toBe(0);
    expect(run.getMilliseconds()).toBe(0);
    previous = run.getTime();
  }
}

function localParts(date: Date) {
  return [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
  ];
}

describe("nextRuns", () => {
  test("returns exactly ten strictly future quarter-hour runs by default", () => {
    const start = new Date(2024, 0, 1, 0, 0);
    const runs = nextRuns(parsed("*/15 * * * *"), start);

    expect(runs).toHaveLength(10);
    expectFutureAscending(runs, start);
    expect(runs.map(localParts)).toEqual(
      Array.from({ length: 10 }, (_, index) => {
        const minutes = (index + 1) * 15;
        return [2024, 1, 1, Math.floor(minutes / 60), minutes % 60];
      }),
    );
  });

  test("does not include an exact start time or return a past minute", () => {
    const fields = parsed("*/15 * * * *");
    const start = new Date(2024, 0, 1, 0, 15, 30, 500);
    const runs = nextRuns(fields, start, 3);

    expect(runs.map(localParts)).toEqual([
      [2024, 1, 1, 0, 30],
      [2024, 1, 1, 0, 45],
      [2024, 1, 1, 1, 0],
    ]);
    expectFutureAscending(runs, start);
  });

  test("uses OR when both day-of-month and day-of-week are restricted", () => {
    const start = new Date(2024, 0, 1);
    const runs = nextRuns(parsed("0 12 13 * 5"), start);

    expect(runs.map(localParts)).toEqual([
      [2024, 1, 5, 12, 0],
      [2024, 1, 12, 12, 0],
      [2024, 1, 13, 12, 0],
      [2024, 1, 19, 12, 0],
      [2024, 1, 26, 12, 0],
      [2024, 2, 2, 12, 0],
      [2024, 2, 9, 12, 0],
      [2024, 2, 13, 12, 0],
      [2024, 2, 16, 12, 0],
      [2024, 2, 23, 12, 0],
    ]);
    expect(runs.some((run) => run.getDate() === 13 && run.getDay() !== 5)).toBe(true);
    expect(runs.some((run) => run.getDay() === 5 && run.getDate() !== 13)).toBe(true);
    expectFutureAscending(runs, start);
  });

  test("does not duplicate a Friday that is also the thirteenth", () => {
    const start = new Date(2024, 8, 12);
    const runs = nextRuns(parsed("0 12 13 * 5"), start, 3);

    expect(runs.map(localParts)).toEqual([
      [2024, 9, 13, 12, 0],
      [2024, 9, 20, 12, 0],
      [2024, 9, 27, 12, 0],
    ]);
    expectFutureAscending(runs, start);
  });

  test("honors a restricted day when the other day field is unrestricted", () => {
    const start = new Date(2024, 0, 1);
    expect(nextRuns(parsed("0 0 1 * *"), start, 3).map(localParts)).toEqual([
      [2024, 2, 1, 0, 0],
      [2024, 3, 1, 0, 0],
      [2024, 4, 1, 0, 0],
    ]);
    expect(nextRuns(parsed("0 12 * * 5"), start, 3).map(localParts)).toEqual([
      [2024, 1, 5, 12, 0],
      [2024, 1, 12, 12, 0],
      [2024, 1, 19, 12, 0],
    ]);
  });

  test("finds leap days and returns fewer than ten within the bounded search", () => {
    const start = new Date(2023, 0, 1);
    const runs = nextRuns(parsed("0 0 29 2 *"), start);

    expect(runs.map(localParts)).toEqual([
      [2024, 2, 29, 0, 0],
      [2028, 2, 29, 0, 0],
    ]);
    expectFutureAscending(runs, start);
  });

  test("terminates with no runs for February 31", () => {
    expect(nextRuns(parsed("0 0 31 2 *"), new Date(2023, 0, 1))).toEqual([]);
  }, 2_000);

  test("skips nonexistent 02:30 local times across a spring-forward gap", () => {
    // Discover a local gap without changing TZ or assuming a particular hemisphere.
    // Zones without a 02:30 gap still exercise the same schedule around March 10.
    let gapDay: Date | undefined;
    for (let day = 1; day <= 366; day++) {
      const calendar = new Date(2024, 0, day, 12);
      const candidate = new Date(2024, calendar.getMonth(), calendar.getDate(), 2, 30);
      if (
        candidate.getMonth() !== calendar.getMonth() ||
        candidate.getDate() !== calendar.getDate() ||
        candidate.getHours() !== 2 ||
        candidate.getMinutes() !== 30
      ) {
        gapDay = calendar;
        break;
      }
    }
    const anchor = gapDay ?? new Date(2024, 2, 10, 12);
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - 2, 0, 0);
    const runs = nextRuns(parsed("30 2 * * *"), start);

    expect(runs).toHaveLength(10);
    expectFutureAscending(runs, start);
    for (const run of runs) {
      expect(run.getHours()).toBe(2);
      expect(run.getMinutes()).toBe(30);
    }
    if (gapDay) {
      expect(
        runs.some(
          (run) =>
            run.getFullYear() === gapDay.getFullYear() &&
            run.getMonth() === gapDay.getMonth() &&
            run.getDate() === gapDay.getDate(),
        ),
      ).toBe(false);
    }
  }, 2_000);
});
