/**
 * Pure dinner-grouping module.
 *
 * Builds the merged, date-grouped activity list the Option detail page
 * renders — interleaving an Option's Log entries (its realised dinners) and
 * its Rejections under one header per date. The Log screen also consumes
 * this module so the two screens never disagree on grouping or date labels.
 *
 * No React, no DB. Inputs are slim row-shape types; outputs are plain data.
 *
 * The merged History block lives on the detail page (a single "History"
 * section, not the two separate sections older PRDs described). Each
 * `DayRecord` collects that date's Log entries *and* Rejections — a date
 * carrying only Rejections still forms a record, which the tests pin.
 *
 * Date strings everywhere are SQL `date` strings (`YYYY-MM-DD`), compared
 * with `localeCompare` — lexicographic order matches calendar order, with
 * no DST surprises (a SQL `date` has no time-of-day).
 */

/**
 * The slim Log-entry shape this module needs — `eatenOn` is a SQL `date`
 * string. The full `LogEntry` from `db/queries.ts` is assignable to this.
 */
export type LogEntryLike = {
  id: string;
  eatenOn: string;
};

/**
 * The slim Rejection shape this module needs — `rejectedOn` is a SQL
 * `date` string. The `Rejection` row from the (yet-to-land) rejections
 * table will be assignable to this.
 */
export type RejectionLike = {
  id: string;
  rejectedOn: string;
};

/**
 * One day's worth of activity for an Option: that date's Log entries plus
 * that date's Rejections. Either array may be empty, but at least one
 * carries items (otherwise the date wouldn't form a record at all).
 *
 * Items within an array preserve the caller's input order so a stable
 * upstream sort (e.g. `createdAt` for ties) flows through unchanged.
 */
export type DayRecord<E extends LogEntryLike = LogEntryLike, R extends RejectionLike = RejectionLike> = {
  date: string;
  entries: E[];
  rejections: R[];
};

export type GroupedActivity<E extends LogEntryLike = LogEntryLike, R extends RejectionLike = RejectionLike> = {
  /** Future-dated records, soonest-first. */
  upcoming: DayRecord<E, R>[];
  /** Today-or-earlier records, newest-first. A record dated today is History. */
  history: DayRecord<E, R>[];
};

/**
 * Group a flat list of items by the date string returned by `dateOf`.
 * Returns a `Map` keyed by the date string in insertion order — the caller
 * is expected to sort the keys when it needs a stable ordering.
 *
 * Input order is preserved within each bucket.
 */
export function groupByDate<T>(
  items: readonly T[],
  dateOf: (item: T) => string,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const date = dateOf(item);
    const list = map.get(date) ?? [];
    list.push(item);
    map.set(date, list);
  }
  return map;
}

/**
 * Split a list of `DayRecord`s at the today boundary. A record dated
 * `today` falls into History (the realised side); a record dated
 * `> today` is Upcoming.
 *
 * `upcoming` comes out soonest-first; `history` comes out newest-first.
 * The input order of `records` is not assumed.
 */
export function splitDinners<E extends LogEntryLike, R extends RejectionLike>(
  records: readonly DayRecord<E, R>[],
  today: string,
): GroupedActivity<E, R> {
  const upcoming: DayRecord<E, R>[] = [];
  const history: DayRecord<E, R>[] = [];
  for (const record of records) {
    if (record.date > today) {
      upcoming.push(record);
    } else {
      history.push(record);
    }
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date));
  history.sort((a, b) => b.date.localeCompare(a.date));
  return { upcoming, history };
}

/**
 * Friendly header for a SQL `date` relative to `today`:
 *
 *   - "Today" / "Tomorrow" / "Yesterday" for ±1-day cases
 *   - "Fri, May 16" for any other future date
 *   - "Fri, May 16 · N days ago" for any past date (N >= 2)
 *
 * The `N days ago` suffix is omitted for "Yesterday" (the label carries
 * the meaning) and for future dates.
 *
 * Computed against UTC midnight so the result is deterministic across DST
 * and time zones — the SQL `date` has no time-of-day, so this is correct.
 */
export function formatDinnerDate(date: string, today: string): string {
  if (date === today) return "Today";
  const [ty, tm, td] = today.split("-").map(Number);
  const [dy, dm, dd] = date.split("-").map(Number);
  const todayMs = Date.UTC(ty, tm - 1, td);
  const dateMs = Date.UTC(dy, dm - 1, dd);
  const diffDays = Math.round((dateMs - todayMs) / 86_400_000);
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";

  const utc = new Date(dateMs);
  const label = utc.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  if (diffDays < -1) {
    return `${label} · ${-diffDays} days ago`;
  }
  return label;
}

/**
 * The full pipeline: take an Option's Log entries and Rejections plus
 * today's SQL date, return `{ upcoming, history }`.
 *
 * Same-date Log entries and Rejections collapse into one `DayRecord`.
 * A date carrying only Rejections still forms a record. Within a record,
 * input order is preserved for both arrays.
 */
export function groupByDay<E extends LogEntryLike, R extends RejectionLike>(
  entries: readonly E[],
  rejections: readonly R[],
  today: string,
): GroupedActivity<E, R> {
  const entriesByDate = groupByDate(entries, (e) => e.eatenOn);
  const rejectionsByDate = groupByDate(rejections, (r) => r.rejectedOn);

  const dates = new Set<string>();
  for (const date of entriesByDate.keys()) dates.add(date);
  for (const date of rejectionsByDate.keys()) dates.add(date);

  const records: DayRecord<E, R>[] = [];
  for (const date of dates) {
    records.push({
      date,
      entries: entriesByDate.get(date) ?? [],
      rejections: rejectionsByDate.get(date) ?? [],
    });
  }

  return splitDinners(records, today);
}
