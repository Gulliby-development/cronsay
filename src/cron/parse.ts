/** Parsed values are sorted and unique; Sunday is always represented by 0. */
export interface ParsedCron {
  expression: string;
  macro?: string;
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
  dayOfMonthRestricted: boolean;
  dayOfWeekRestricted: boolean;
}

export type CronField = "minute" | "hour" | "day-of-month" | "month" | "day-of-week";
export type ParseResult =
  | { ok: true; fields: ParsedCron }
  | { ok: false; error: string; field: CronField | "field count" };

interface FieldSpec {
  name: CronField;
  min: number;
  max: number;
  names?: readonly string[];
}

const fieldSpecs: readonly FieldSpec[] = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day-of-month", min: 1, max: 31 },
  {
    name: "month",
    min: 1,
    max: 12,
    names: ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"],
  },
  {
    name: "day-of-week",
    min: 0,
    max: 7,
    names: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"],
  },
];

type FieldResult = { ok: true; values: number[] } | { ok: false; error: string };

function parseField(source: string, spec: FieldSpec): FieldResult {
  const values = new Set<number>();
  const fail = (problem: string): FieldResult => ({
    ok: false,
    error: `${spec.name}: ${problem}`,
  });
  const parseValue = (token: string): number | undefined => {
    if (/^\d+$/.test(token)) {
      const value = Number(token);
      return Number.isSafeInteger(value) && value >= spec.min && value <= spec.max
        ? value
        : undefined;
    }
    const index = spec.names?.indexOf(token.toUpperCase()) ?? -1;
    return index >= 0 ? index + spec.min : undefined;
  };

  for (const item of source.split(",")) {
    if (!item) return fail("empty list item");
    if (/[?#]/.test(item) || /^(L|W)$/i.test(item)) {
      return fail("unsupported token; use standard five-field cron syntax");
    }
    const parts = item.split("/");
    if (parts.length > 2) return fail("only one step separator is allowed per list item");
    const [base, stepToken] = parts;
    let step = 1;
    if (stepToken !== undefined) {
      if (!/^\d+$/.test(stepToken)) return fail("step must be a positive integer");
      step = Number(stepToken);
      if (!Number.isSafeInteger(step) || step < 1) {
        return fail("step must be a positive safe integer");
      }
    }

    let from: number;
    let to: number;
    if (base === "*") {
      from = spec.min;
      to = spec.max;
    } else {
      const bounds = base.split("-");
      if (bounds.length > 2 || bounds.some((bound) => !bound)) {
        return fail("invalid range");
      }
      const first = parseValue(bounds[0]);
      if (first === undefined) {
        return fail(
          `unknown or out-of-range value "${bounds[0]}" (expected ${spec.min}-${spec.max})`,
        );
      }
      from = first;
      if (bounds.length === 2) {
        const last = parseValue(bounds[1]);
        if (last === undefined) {
          return fail(
            `unknown or out-of-range value "${bounds[1]}" (expected ${spec.min}-${spec.max})`,
          );
        }
        to = last;
      } else {
        // A single value with a step means value-max/step, not just that value.
        to = stepToken === undefined ? first : spec.max;
      }
      if (from > to) return fail("range start must not exceed range end");
    }
    for (let value = from; value <= to; value += step) {
      values.add(spec.name === "day-of-week" && value === 7 ? 0 : value);
    }
  }
  return { ok: true, values: [...values].sort((a, b) => a - b) };
}

const macroExpansions: Readonly<Record<string, string>> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

const fieldCountError =
  "field count: expected five fields (minute hour day-of-month month day-of-week) or one macro (@yearly, @annually, @monthly, @weekly, @daily, @midnight, @hourly); other @-macros such as @reboot are unsupported";
const sixFieldError =
  "field count: got 6 fields, expected 5; a leading seconds field is not supported, so remove it (minute hour day-of-month month day-of-week)";

/** Parse standard five-field cron and supported macros. Invalid strings return an error, never throw. */
export function parseCron(expression: string): ParseResult {
  const trimmed = expression.trim();
  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 1 && tokens[0].startsWith("@")) {
    const macro = tokens[0].toLowerCase();
    const expansion = macroExpansions[macro];
    if (expansion === undefined) {
      return { ok: false, field: "field count", error: fieldCountError };
    }
    const parsed = parseCron(expansion);
    if (!parsed.ok) return parsed;
    return { ok: true, fields: { ...parsed.fields, macro } };
  }
  if (tokens.length === 6 && !tokens[0].startsWith("@")) {
    return { ok: false, field: "field count", error: sixFieldError };
  }
  if (tokens.length !== 5 || tokens[0].startsWith("@")) {
    return { ok: false, field: "field count", error: fieldCountError };
  }
  const fields: number[][] = [];
  for (let index = 0; index < fieldSpecs.length; index++) {
    const result = parseField(tokens[index], fieldSpecs[index]);
    if (!result.ok) return { ...result, field: fieldSpecs[index].name };
    fields.push(result.values);
  }
  return {
    ok: true,
    fields: {
      expression: tokens.join(" "),
      minutes: fields[0],
      hours: fields[1],
      daysOfMonth: fields[2],
      months: fields[3],
      daysOfWeek: fields[4],
      dayOfMonthRestricted: tokens[2] !== "*",
      dayOfWeekRestricted: tokens[4] !== "*",
    },
  };
}
