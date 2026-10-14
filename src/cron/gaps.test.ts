import { describe, expect, test } from "bun:test";
import { describeGaps, formatDuration } from "./gaps";

const MAX_DURATION_MS = 1.728e16;
const DATE_LIMIT_MS = 8.64e15;
const MINUTE_MS = 60_000;

function makeSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function expectedDuration(milliseconds: number): string {
  const minutes = Math.max(1, Math.round(milliseconds / MINUTE_MS));
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const remainingMinutes = minutes % 60;
  const parts: string[] = [];

  if (days > 0) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (remainingMinutes > 0) {
    parts.push(`${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}`);
  }
  return parts.join(" ");
}

function expectedSummary(runs: readonly Date[]): string | null {
  if (runs.length < 2) return null;

  const gaps = runs.slice(1).map((run, index) => run.getTime() - runs[index].getTime());
  const shortest = expectedDuration(Math.min(...gaps));
  const longest = expectedDuration(Math.max(...gaps));

  return shortest === longest
    ? `Runs are ${shortest} apart.`
    : `Gaps between runs: shortest ${shortest}, longest ${longest}.`;
}

function randomRuns(random: () => number, iteration: number): Date[] {
  const count = 2 + Math.floor(random() * 99);
  if (iteration === 0) {
    return [new Date(-DATE_LIMIT_MS), new Date(DATE_LIMIT_MS)];
  }

  const maxGap = MAX_DURATION_MS / (count - 1);
  const runs = [new Date(-DATE_LIMIT_MS)];
  let elapsed = 0;
  for (let index = 1; index < count; index += 1) {
    elapsed += Math.floor(random() * maxGap);
    runs.push(new Date(-DATE_LIMIT_MS + elapsed));
  }
  return runs;
}

describe("formatDuration", () => {
  test("rounds to a whole minute with a one-minute minimum", () => {
    expect(formatDuration(0)).toBe("1 minute");
    expect(formatDuration(-0)).toBe("1 minute");
    expect(formatDuration(20_000)).toBe("1 minute");
    expect(formatDuration(29_999)).toBe("1 minute");
  });

  test("rounds a half minute upward", () => {
    expect(formatDuration(30_000)).toBe("1 minute");
    expect(formatDuration(90_000)).toBe("2 minutes");
  });

  test("formats individual units and their plural forms", () => {
    const examples: Array<[number, string]> = [
      [MINUTE_MS, "1 minute"],
      [15 * MINUTE_MS, "15 minutes"],
      [60 * MINUTE_MS, "1 hour"],
      [2 * 60 * MINUTE_MS, "2 hours"],
      [1_440 * MINUTE_MS, "1 day"],
      [3 * 1_440 * MINUTE_MS, "3 days"],
    ];

    for (const [milliseconds, expected] of examples) {
      expect(formatDuration(milliseconds)).toBe(expected);
    }
  });

  test("omits zero units and joins remaining units with single spaces", () => {
    expect(formatDuration(90 * MINUTE_MS)).toBe("1 hour 30 minutes");
    expect(formatDuration(1_500 * MINUTE_MS)).toBe("1 day 1 hour");
    expect(formatDuration((3 * 1_440 + 61) * MINUTE_MS)).toBe("3 days 1 hour 1 minute");
  });

  test("formats the largest supported duration", () => {
    expect(formatDuration(MAX_DURATION_MS)).toBe(expectedDuration(MAX_DURATION_MS));
  });

  test("matches the duration rules for seeded values across the supported range", () => {
    const random = makeSeededRandom(0x6a09e667);
    const boundaryValues = [
      0,
      -0,
      1,
      29_999,
      30_000,
      30_001,
      59_999,
      60_000,
      60_001,
      89_999,
      90_000,
      1_439 * MINUTE_MS,
      1_440 * MINUTE_MS,
      1_441 * MINUTE_MS,
      MAX_DURATION_MS - 1,
      MAX_DURATION_MS,
    ];
    const generatedValues = Array.from({ length: 256 }, () => random() * MAX_DURATION_MS);

    for (const milliseconds of [...boundaryValues, ...generatedValues]) {
      const expected = expectedDuration(milliseconds);
      const actual = formatDuration(milliseconds);
      if (actual !== expected) {
        throw new Error(
          `formatDuration property failed for milliseconds=${milliseconds}: expected ${expected}, received ${actual}`,
        );
      }
    }
  });
});

describe("describeGaps", () => {
  test("returns null for an empty run list", () => {
    expect(describeGaps([])).toBeNull();
  });

  test("returns null for a single run", () => {
    expect(describeGaps([new Date(0)])).toBeNull();
  });

  test("describes identical 15-minute gaps", () => {
    expect(describeGaps([new Date(0), new Date(15 * MINUTE_MS), new Date(30 * MINUTE_MS)])).toBe(
      "Runs are 15 minutes apart.",
    );
  });

  test("describes identical one-hour gaps", () => {
    expect(describeGaps([new Date(0), new Date(60 * MINUTE_MS), new Date(120 * MINUTE_MS)])).toBe(
      "Runs are 1 hour apart.",
    );
  });

  test("describes identical one-day gaps", () => {
    expect(
      describeGaps([new Date(0), new Date(1_440 * MINUTE_MS), new Date(2_880 * MINUTE_MS)]),
    ).toBe("Runs are 1 day apart.");
  });

  test("describes a single one-minute gap", () => {
    expect(describeGaps([new Date(0), new Date(MINUTE_MS)])).toBe("Runs are 1 minute apart.");
  });

  test("reports the shortest and longest gaps in the mixed schedule examples", () => {
    const cases: Array<[number[], string]> = [
      [[0, 1_440, 2_880, 7_200, 8_640], "Gaps between runs: shortest 1 day, longest 3 days."],
      [[0, 90, 95, 155], "Gaps between runs: shortest 5 minutes, longest 1 hour 30 minutes."],
      [[0, 1_440, 2_940], "Gaps between runs: shortest 1 day, longest 1 day 1 hour."],
    ];

    for (const [minuteOffsets, expected] of cases) {
      const runs = minuteOffsets.map((minutes) => new Date(minutes * MINUTE_MS));
      expect(describeGaps(runs)).toBe(expected);
    }
  });

  test("treats different elapsed gaps with the same rounded duration as equal", () => {
    expect(describeGaps([new Date(0), new Date(MINUTE_MS), new Date(2 * MINUTE_MS + 1)])).toBe(
      "Runs are 1 minute apart.",
    );
  });

  test("matches consecutive-gap min/max summaries for seeded run lists", () => {
    const random = makeSeededRandom(0xbb67ae85);

    for (let iteration = 0; iteration < 256; iteration += 1) {
      const runs = randomRuns(random, iteration);
      const expected = expectedSummary(runs);
      const actual = describeGaps(runs);
      if (actual !== expected) {
        throw new Error(
          `describeGaps property failed for runs=${JSON.stringify(runs.map((run) => run.getTime()))}: expected ${expected}, received ${actual}`,
        );
      }
    }
  });
});
