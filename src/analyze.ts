import { describeCron } from "./cron/describe";
import { nextRuns } from "./cron/next";
import { type CronField, parseCron } from "./cron/parse";

export type AnalysisResult =
  | { ok: true; description: string; runs: Date[] }
  | { ok: false; error: string; field: CronField | "field count" };

/** Each analysis is independent: invalid input cannot retain a previous result. */
export function analyze(expression: string, start: Date = new Date()): AnalysisResult {
  const parsed = parseCron(expression);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    description: describeCron(parsed.fields),
    runs: nextRuns(parsed.fields, start, 10),
  };
}
