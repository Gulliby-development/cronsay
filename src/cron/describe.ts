import type { ParsedCron } from "./parse";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function join(values: string[]): string {
  if (values.length < 2) return values.join("");
  if (values.length === 2) return values.join(" and ");
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function rangeOrList(values: number[], label: (value: number) => string): string {
  if (
    values.length > 2 &&
    values.every((value, index) => index === 0 || value === values[index - 1] + 1)
  ) {
    return `${label(values[0])} through ${label(values[values.length - 1])}`;
  }
  return join(values.map(label));
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function minuteInterval(minutes: number[]): number | undefined {
  if (minutes.length < 2 || minutes[0] !== 0) return undefined;
  const step = minutes[1];
  return minutes.length === Math.floor(59 / step) + 1 &&
    minutes.every((minute, index) => minute === index * step)
    ? step
    : undefined;
}

function describeTime(fields: ParsedCron): string {
  const { minutes, hours } = fields;
  if (minutes.length === 1 && hours.length === 1) {
    return `at ${pad(hours[0])}:${pad(minutes[0])}`;
  }
  if (minutes.length === 1 && hours.length !== 24) {
    return `at ${join(hours.map((hour) => `${pad(hour)}:${pad(minutes[0])}`))}`;
  }
  const interval = minuteInterval(minutes);
  let text: string;
  if (interval !== undefined) {
    text = interval === 1 ? "every minute" : `every ${interval} minutes`;
  } else {
    text = `at ${minutes.length === 1 ? "minute" : "minutes"} ${rangeOrList(minutes, String)} of every hour`;
  }
  if (hours.length !== 24) {
    text += `, during ${hours.length === 1 ? "hour" : "hours"} ${rangeOrList(hours, pad)}`;
  }
  return text;
}

/** Describe the parsed schedule without changing its local-time or day-matching semantics. */
export function describeCron(fields: ParsedCron): string {
  const clauses = [describeTime(fields)];
  const monthDays = rangeOrList(fields.daysOfMonth, String);
  const weekDays = rangeOrList(fields.daysOfWeek, (day) => weekdays[day]);

  if (fields.dayOfMonthRestricted && fields.dayOfWeekRestricted) {
    clauses.push(
      `on dates whose day of the month is ${monthDays} or whose weekday is ${weekDays} (either condition may match)`,
    );
  } else if (fields.dayOfMonthRestricted) {
    clauses.push(
      `on ${fields.daysOfMonth.length === 1 ? "day" : "days"} ${monthDays} of the month`,
    );
  } else if (fields.dayOfWeekRestricted) {
    clauses.push(`on ${weekDays}`);
  }

  if (fields.months.length !== 12) {
    clauses.push(`in ${rangeOrList(fields.months, (month) => months[month - 1])}`);
  }
  return `Runs ${clauses.join(", ")}, in local time.`;
}
