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
