export interface Preset {
  label: string;
  expression: string;
}

/** Standard five-field expressions, shared by the UI and tests. */
export const presets: readonly Preset[] = [
  { label: "Every minute", expression: "* * * * *" },
  { label: "Every 15 minutes", expression: "*/15 * * * *" },
  { label: "Every hour", expression: "0 * * * *" },
  { label: "Weekdays at 09:00", expression: "0 9 * * 1-5" },
  { label: "Monthly on the 1st", expression: "0 0 1 * *" },
];
