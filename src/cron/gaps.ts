const MINUTE_MS = 60_000;
const HOUR_MINUTES = 60;
const DAY_MINUTES = 24 * HOUR_MINUTES;

/** Format elapsed milliseconds as rounded, nonzero day/hour/minute units. */
export function formatDuration(milliseconds: number): string {
  const roundedMinutes = Number.isFinite(milliseconds)
    ? Math.max(1, Math.round(milliseconds / MINUTE_MS))
    : 1;
  const days = Math.floor(roundedMinutes / DAY_MINUTES);
  const hours = Math.floor((roundedMinutes % DAY_MINUTES) / HOUR_MINUTES);
  const minutes = roundedMinutes % HOUR_MINUTES;
  const parts: string[] = [];

  if (days > 0) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);

  return parts.join(" ");
}

/** Describe the shortest and longest elapsed gaps between chronological runs. */
export function describeGaps(runs: readonly Date[]): string | null {
  if (runs.length < 2) return null;

  let shortest = runs[1].getTime() - runs[0].getTime();
  let longest = shortest;
  for (let index = 2; index < runs.length; index += 1) {
    const gap = runs[index].getTime() - runs[index - 1].getTime();
    shortest = Math.min(shortest, gap);
    longest = Math.max(longest, gap);
  }

  const shortestDuration = formatDuration(shortest);
  const longestDuration = formatDuration(longest);
  if (shortestDuration === longestDuration) {
    return `Runs are ${shortestDuration} apart.`;
  }
  return `Gaps between runs: shortest ${shortestDuration}, longest ${longestDuration}.`;
}
