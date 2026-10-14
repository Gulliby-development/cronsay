import { describe, expect, test } from "bun:test";
import { type CronField, type ParsedCron, parseCron } from "./parse";

function parsed(expression: string): ParsedCron {
  const result = parseCron(expression);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.fields;
}

describe("parseCron valid expressions", () => {
  test.each([
    ["@yearly", "0 0 1 1 *"],
    ["@annually", "0 0 1 1 *"],
    ["@monthly", "0 0 1 * *"],
    ["@weekly", "0 0 * * 0"],
    ["@daily", "0 0 * * *"],
    ["@midnight", "0 0 * * *"],
    ["@hourly", "0 * * * *"],
  ])("expands %s like its five-field expression", (macro, expansion) => {
    const result = parseCron(macro);
    const expanded = parseCron(expansion);
    expect(result.ok).toBe(true);
    expect(expanded.ok).toBe(true);
    if (!result.ok || !expanded.ok) throw new Error("Expected valid cron expressions");
    expect(result.fields).toMatchObject({ ...expanded.fields, macro });
    expect(result.fields.expression).toBe(expansion);
  });

  test.each([
    ["@DAILY", "@daily", "0 0 * * *"],
    ["@Hourly", "@hourly", "0 * * * *"],
    [" \t@DaIlY\r\n", "@daily", "0 0 * * *"],
  ])("normalizes macro token %s", (expression, macro, expansion) => {
    const result = parseCron(expression);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.fields.macro).toBe(macro);
    expect(result.fields.expression).toBe(expansion);
  });

  test("does not add macro metadata to plain expressions", () => {
    const result = parseCron("0 0 * * *");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.fields).not.toHaveProperty("macro");
  });
  test("expands steps, ranges, lists, and case-insensitive names together", () => {
    const fields = parsed("*/15 0-6 1,15 JAN-MAR mon-fri");
    expect(fields.minutes).toEqual([0, 15, 30, 45]);
    expect(fields.hours).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(fields.daysOfMonth).toEqual([1, 15]);
    expect(fields.months).toEqual([1, 2, 3]);
    expect(fields.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(fields.dayOfMonthRestricted).toBe(true);
    expect(fields.dayOfWeekRestricted).toBe(true);
  });

  test("wildcards cover each field's full domain with normalized Sunday", () => {
    const fields = parsed("* * * * *");
    expect(fields.minutes).toEqual(Array.from({ length: 60 }, (_, index) => index));
    expect(fields.hours).toEqual(Array.from({ length: 24 }, (_, index) => index));
    expect(fields.daysOfMonth).toEqual(Array.from({ length: 31 }, (_, index) => index + 1));
    expect(fields.months).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
    expect(fields.daysOfWeek).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(fields.dayOfMonthRestricted).toBe(false);
    expect(fields.dayOfWeekRestricted).toBe(false);
  });

  test.each(["0", "7", "SUN", "sun"])("represents Sunday %s as 0", (sunday) => {
    expect(parsed(`0 0 * * ${sunday}`).daysOfWeek).toEqual([0]);
  });

  test("extends a stepped single value through the field maximum", () => {
    expect(parsed("5/10 * * * *").minutes).toEqual([5, 15, 25, 35, 45, 55]);
  });

  test("expands stepped ranges and combined list items, sorting and deduplicating", () => {
    expect(parsed("1-5,10,20-30/5,3,10 * * * *").minutes).toEqual([1, 2, 3, 4, 5, 10, 20, 25, 30]);
    expect(parsed("10-30/5 * * * *").minutes).toEqual([10, 15, 20, 25, 30]);
    expect(parsed("0 0 * * 5-7,0,SUN").daysOfWeek).toEqual([0, 5, 6]);
  });

  test("accepts inclusive lower and upper bounds", () => {
    const fields = parsed("0,59 0,23 1,31 1,12 0,6,7");
    expect(fields.minutes).toEqual([0, 59]);
    expect(fields.hours).toEqual([0, 23]);
    expect(fields.daysOfMonth).toEqual([1, 31]);
    expect(fields.months).toEqual([1, 12]);
    expect(fields.daysOfWeek).toEqual([0, 6]);
  });

  test("accepts every month and weekday name without treating letters as special tokens", () => {
    const fields = parsed(
      "0 0 * jan,FEB,mar,APR,may,JUN,jul,AUG,sep,OCT,nov,DEC sun,MON,tue,WED,thu,FRI,sat",
    );
    expect(fields.months).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
    expect(fields.daysOfWeek).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  test("allows steps on named ranges", () => {
    const fields = parsed("0 0 * JAN-MAY/2 MON-FRI/2");
    expect(fields.months).toEqual([1, 3, 5]);
    expect(fields.daysOfWeek).toEqual([1, 3, 5]);
  });

  test("ignores surrounding whitespace and accepts tabs and newlines between fields", () => {
    const fields = parsed("  \t0   9\t*\n*  MON-FRI \r\n");
    expect(fields.expression).toBe("0 9 * * MON-FRI");
    expect(fields.minutes).toEqual([0]);
    expect(fields.hours).toEqual([9]);
    expect(fields.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
  });

  test("tracks day-of-month and day-of-week restrictions independently", () => {
    const byDate = parsed("0 0 13 * *");
    expect(byDate.dayOfMonthRestricted).toBe(true);
    expect(byDate.dayOfWeekRestricted).toBe(false);
    const byWeekday = parsed("0 0 * * 5");
    expect(byWeekday.dayOfMonthRestricted).toBe(false);
    expect(byWeekday.dayOfWeekRestricted).toBe(true);
  });

  test("accepts a calendar-impossible date for the calculator to handle", () => {
    const fields = parsed("0 0 31 2 *");
    expect(fields.daysOfMonth).toEqual([31]);
    expect(fields.months).toEqual([2]);
  });
});

type InvalidCase = [expression: string, field: CronField | "field count"];

const invalidCases: InvalidCase[] = [
  ["", "field count"],
  ["   ", "field count"],
  ["* * * *", "field count"],
  ["* * * * * *", "field count"],
  ["* * * * * * *", "field count"],
  ["@reboot", "field count"],
  ["@daily * * * *", "field count"],
  ["60 * * * *", "minute"],
  ["-1 * * * *", "minute"],
  ["* 24 * * *", "hour"],
  ["* * 0 * *", "day-of-month"],
  ["* * 32 * *", "day-of-month"],
  ["* * * 0 *", "month"],
  ["* * * 13 *", "month"],
  ["* * * * 8", "day-of-week"],
  ["5-1 * * * *", "minute"],
  ["0 6-2 * * *", "hour"],
  ["0 0 * MAR-JAN *", "month"],
  ["0 0 * * FRI-MON", "day-of-week"],
  ["*/0 * * * *", "minute"],
  ["*/-1 * * * *", "minute"],
  ["*/abc * * * *", "minute"],
  ["*/1.5 * * * *", "minute"],
  ["*/ * * * *", "minute"],
  ["*/2/3 * * * *", "minute"],
  ["1,,2 * * * *", "minute"],
  [",1 * * * *", "minute"],
  ["1, * * * *", "minute"],
  ["1- * * * *", "minute"],
  ["1-2-3 * * * *", "minute"],
  ["1.5 * * * *", "minute"],
  ["1e1 * * * *", "minute"],
  ["9007199254740992 * * * *", "minute"],
  ["*/9007199254740992 * * * *", "minute"],
  ["* * * FOO *", "month"],
  ["* * * * FOO", "day-of-week"],
  ["JAN * * * *", "minute"],
  ["0 0 L * *", "day-of-month"],
  ["0 0 W * *", "day-of-month"],
  ["0 0 15W * *", "day-of-month"],
  ["0 0 ? * *", "day-of-month"],
  ["0 0 * * 5L", "day-of-week"],
  ["0 0 * * MON#2", "day-of-week"],
  ["H * * * *", "minute"],
];

const fieldCountError =
  "field count: expected five fields (minute hour day-of-month month day-of-week) or one macro (@yearly, @annually, @monthly, @weekly, @daily, @midnight, @hourly); other @-macros such as @reboot are unsupported";

describe("parseCron invalid expressions", () => {
  test.each([
    "",
    "   ",
    "* * * *",
    "* * * * * * * *",
    "* * * * * * *",
    "@reboot",
    "@foo",
    "@",
    "@daily * * * *",
  ])("%s returns the standard field-count message", (expression) => {
    const result = parseCron(expression);
    expect(result).toEqual({ ok: false, field: "field count", error: fieldCountError });
  });
  test.each(invalidCases)("%s reports %s without throwing", (expression, field) => {
    expect(() => parseCron(expression)).not.toThrow();
    const result = parseCron(expression);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error(`Unexpected valid expression: ${expression}`);
    expect(result.field).toBe(field);
    expect(result.error).toContain(field);
    expect(result.error.length).toBeGreaterThan(field.length);
  });

  test.each([
    ["60 * * * *", /out-of-range/i],
    ["5-1 * * * *", /range/i],
    ["*/0 * * * *", /step/i],
    ["*/abc * * * *", /step/i],
    ["1,,2 * * * *", /empty list item/i],
    ["* * * FOO *", /unknown/i],
    ["0 0 L * *", /unsupported/i],
    ["@reboot", /unsupported/i],
  ] as const)("%s explains the validation problem", (expression, problem) => {
    const result = parseCron(expression);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error(`Unexpected valid expression: ${expression}`);
    expect(result.error).toMatch(problem);
  });
});
