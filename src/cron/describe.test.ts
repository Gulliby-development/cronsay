import { describe, expect, test } from "bun:test";
import { describeCron } from "./describe";
import { parseCron } from "./parse";
import { presets } from "./presets";

function descriptionFor(expression: string): string {
  const result = parseCron(expression);
  if (!result.ok) throw new Error(result.error);
  return describeCron(result.fields);
}

describe("cron descriptions", () => {
  test("explains an every-15-minutes schedule", () => {
    expect(descriptionFor("*/15 * * * *")).toContain("every 15 minutes");
  });

  test("explains the time and weekdays of a weekday schedule", () => {
    const description = descriptionFor("0 9 * * 1-5");
    expect(description).toContain("09:00");
    expect(description).toContain("Monday through Friday");
  });
  test("describes every supported macro", () => {
    const expectedDescriptions = [
      ["@yearly", "Runs at 00:00, on day 1 of the month, in January, in local time."],
      ["@annually", "Runs at 00:00, on day 1 of the month, in January, in local time."],
      ["@monthly", "Runs at 00:00, on day 1 of the month, in local time."],
      ["@weekly", "Runs at 00:00, on Sunday, in local time."],
      ["@daily", "Runs at 00:00, in local time."],
      ["@midnight", "Runs at 00:00, in local time."],
      ["@hourly", "Runs at minute 0 of every hour, in local time."],
    ] as const;

    for (const [macro, expected] of expectedDescriptions) {
      expect(descriptionFor(macro)).toBe(expected);
    }
  });
});

describe("cron presets", () => {
  test("provides at least five examples", () => {
    expect(presets.length).toBeGreaterThanOrEqual(5);
  });

  for (const preset of presets) {
    test(`${preset.label} parses successfully (${preset.expression})`, () => {
      expect(parseCron(preset.expression).ok).toBe(true);
    });
  }
});
