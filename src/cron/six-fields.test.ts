import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { analyze } from "../analyze";
import { parseCron } from "./parse";

const hint =
  "field count: got 6 fields, expected 5; a leading seconds field is not supported, so remove it (minute hour day-of-month month day-of-week)";
const fieldCountError =
  "field count: expected five fields (minute hour day-of-month month day-of-week) or one macro (@yearly, @annually, @monthly, @weekly, @daily, @midnight, @hourly); other @-macros such as @reboot are unsupported";

describe("six-field cron expressions", () => {
  test.each(["0 0 9 * * *", "* * * * * *", "  0 0\t9 * *\n* ", "a b c d e f", "99 99 99 99 99 99"])(
    "%s gets the leading-seconds hint",
    (expression) => {
      expect(parseCron(expression)).toEqual({
        ok: false,
        field: "field count",
        error: hint,
      });
    },
  );

  test.each(["", "* * * *", "* * * * * * *", "@daily * * * * *", "@reboot"])(
    "%s keeps the generic field-count error",
    (expression) => {
      expect(parseCron(expression)).toEqual({
        ok: false,
        field: "field count",
        error: fieldCountError,
      });
    },
  );

  test.each(["0 9 * * *", "@daily"])("%s remains valid", (expression) => {
    const result = parseCron(expression);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
  });

  test("passes the hint through analyze", () => {
    expect(analyze("0 0 9 * * *")).toEqual({
      ok: false,
      field: "field count",
      error: hint,
    });
  });

  test("README retains the unsupported-expression explanation", () => {
    const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
    expect(readme).toContain(
      "Six- and seven-field expressions, `@reboot` and other macros, and the special tokens `?`, `L`, `W` and `#` are not supported.",
    );
  });

  test("README documents the six-field hint", () => {
    const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
    expect(readme).toContain(
      "A six-field expression such as `0 0 9 * * *` is rejected with a hint instead of the generic message: `field count: got 6 fields, expected 5; a leading seconds field is not supported, so remove it (minute hour day-of-month month day-of-week)`.",
    );
  });
});
