/**
 * Pure date-grouping helpers for the **Log** screen and the **Option detail**
 * page's merged **History** section. The module has no React and no DB
 * dependency — it operates on plain JS arrays of date-bearing records and
 * returns plain JS arrays. Both consumers (`app/log/log-screen.tsx` and
 * `app/catalog/[id]/page.tsx`) feed it the SQL `eaten_on` / `rejected_on`
 * dates already on the rows and a `todaySql` string sourced from
 * `lib/local-day.ts`.
 *
 * A **Dinner** in CONTEXT.md is "one or more Log entries on a date"; a
 * **DayRecord** here is the analogous container for the History view —
 * one date with both that day's Log entries *and* that day's Rejections.
 * A date with only Rejections still forms a record so the Household can see
 * "we turned this down on Thursday" with nothing logged.
 */

import { epochDayFromSqlDate } from "@/lib/local-day";

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

/**
 * Friendly date label for a date-group header. Maps the entry's SQL date
 * against today's epoch-day:
 *
 * - `today` → "Today"
 * - `today + 1` → "Tomorrow"
 * - `today - 1` → "Yesterday"
 * - everything else → "Fri, May 16" (weekday + month + day)
 *
 * Pure, deterministic, table-testable; the caller passes `todaySql` so DST
 * and time-zone math live in `lib/local-day.ts`, not here.
 */
export function formatDinnerDate(sqlDate: string, todaySql: string): string {
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

/**
 * Group an input list into per-date buckets, preserving the input order of
 * both the dates and the items within each date. The caller decides the
 * order of input (history-descending or upcoming-ascending) and the
 * grouping respects it — same-date items collapse into one bucket without
 * resorting.
 */
export function groupByDate<T>(
  items: T[],
  getDate: (item: T) => string,
): { date: string; items: T[] }[] {
  const groups: { date: string; items: T[] }[] = [];
  let current: { date: string; items: T[] } | null = null;
  for (const item of items) {
    const date = getDate(item);
    if (!current || current.date !== date) {
      current = { date, items: [item] };
      groups.push(current);
    } else {
      current.items.push(item);
    }
  }
  return groups;
}

/**
 * Split a list of date-bearing items into Upcoming (after today) and
 * History (today and earlier). The split is by epoch-day, not lexicographic:
 * a record dated today is History; a record dated tomorrow is Upcoming.
 *
 * The function does **not** sort — it preserves the relative order of the
 * input within each output bucket. Callers that want ascending Upcoming and
 * descending History sort the inputs (or the buckets) themselves.
 */
export function splitDinners<T>(
  items: T[],
  getDate: (item: T) => string,
  todaySql: string,
): { upcoming: T[]; history: T[] } {
  const todayEpoch = epochDayFromSqlDate(todaySql);
  const upcoming: T[] = [];
  const history: T[] = [];
  for (const item of items) {
    const day = epochDayFromSqlDate(getDate(item));
    if (day > todayEpoch) upcoming.push(item);
    else history.push(item);
  }
  return { upcoming, history };
}

/**
 * One day's record in the merged History view — that date's Log entries
 * paired with that date's Rejections. A date with only Rejections still
 * forms a record (the Household turned the Option down without eating
 * anything tracked that day); a date with only Log entries is the ordinary
 * Dinner case.
 */
export type DayRecord<E, R> = {
  date: string;
  entries: E[];
  rejections: R[];
};

/**
 * Interleave a list of Log entries and a list of Rejections into per-date
 * `DayRecord`s, then split at the today boundary. The result is two arrays
 * of `DayRecord`s:
 *
 * - `upcoming` — future-dated records, soonest-first.
 * - `history` — today + past records, newest-first.
 *
 * Records preserve the input order of entries and Rejections within each
 * date — the function does not sort within a day. Callers that want
 * stable per-day ordering pass already-sorted input (the queries do).
 */
export function groupByDay<
  E extends { eatenOn: string },
  R extends { rejectedOn: string },
>(args: {
  entries: E[];
  rejections: R[];
  todaySql: string;
}): { upcoming: DayRecord<E, R>[]; history: DayRecord<E, R>[] } {
  const { entries, rejections, todaySql } = args;
  const todayEpoch = epochDayFromSqlDate(todaySql);

  // Accumulate per-date buckets, preserving the order each date first
  // appears across the two streams.
  const byDate = new Map<string, DayRecord<E, R>>();
  const order: string[] = [];
  function bucket(date: string): DayRecord<E, R> {
    let rec = byDate.get(date);
    if (!rec) {
      rec = { date, entries: [], rejections: [] };
      byDate.set(date, rec);
      order.push(date);
    }
    return rec;
  }
  for (const e of entries) bucket(e.eatenOn).entries.push(e);
  for (const r of rejections) bucket(r.rejectedOn).rejections.push(r);

  const upcoming: DayRecord<E, R>[] = [];
  const history: DayRecord<E, R>[] = [];
  for (const date of order) {
    const rec = byDate.get(date)!;
    const day = epochDayFromSqlDate(date);
    if (day > todayEpoch) upcoming.push(rec);
    else history.push(rec);
  }
  // Upcoming soonest-first (ascending date); History newest-first
  // (descending date). Sorts by SQL date string, which sorts
  // lexicographically the same as chronologically for `YYYY-MM-DD`.
  upcoming.sort((a, b) => a.date.localeCompare(b.date));
  history.sort((a, b) => b.date.localeCompare(a.date));
  return { upcoming, history };
}
