import { epochDayFromSqlDate } from "@/lib/local-day";

/**
 * Friendly date label for the Log screen's date header. Maps the entry's
 * `eaten_on` against today's epoch-day:
 *
 * - `today` → "Today"
 * - `today + 1` → "Tomorrow"
 * - `today - 1` → "Yesterday"
 * - everything else → "Fri, May 16" (weekday + month + day)
 *
 * Pure, deterministic, table-testable; the caller passes `today` so DST and
 * time-zone math live in `lib/local-day.ts`, not here.
 */
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function dateLabel(sqlDate: string, todaySql: string): string {
  const day = epochDayFromSqlDate(sqlDate);
  const today = epochDayFromSqlDate(todaySql);
  if (day === today) return "Today";
  if (day === today + 1) return "Tomorrow";
  if (day === today - 1) return "Yesterday";
  const [year, month, dayOfMonth] = sqlDate.split("-").map(Number);
  // UTC noon — matches `epochDayFromSqlDate` so the weekday is computed from
  // the same instant. (DST is harmless at noon.)
  const date = new Date(Date.UTC(year, month - 1, dayOfMonth, 12, 0, 0, 0));
  return `${WEEKDAY[date.getUTCDay()]}, ${MONTH[date.getUTCMonth()]} ${date.getUTCDate()}`;
}
