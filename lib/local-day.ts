/**
 * Local-day module — pure conversions between a SQL `date` string and an
 * integer epoch-day in the app's local time zone (`APP_TZ`).
 *
 * Recency math wants whole-day integers (not millisecond deltas) so that a
 * subtraction is correct across DST boundaries — `(today - eatenOn)` is an
 * integer number of calendar days regardless of the clock change.
 *
 * `epochDayFromSqlDate("2026-05-20")` returns the integer number of days from
 * 1970-01-01, computed against UTC midnight of that date; that integer is
 * stable and never DST-shifted because a SQL `date` has no time-of-day.
 *
 * `todaySqlDate(now, timeZone)` formats `now` in the requested zone via
 * `Intl.DateTimeFormat("en-CA")`, whose `YYYY-MM-DD` output is identical to
 * the Postgres SQL `date` string we store.
 */
const MS_PER_DAY = 86_400_000;

/**
 * `value` is a valid `YYYY-MM-DD` string. Avoids the `new Date("…")` fallback
 * accepting "May 20 2026", "2026/05/20", or other forgiving parses; we only
 * want the exact SQL `date` shape.
 */
export function isValidSqlDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearStr, monthStr, dayStr] = value.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  // Round-trip through UTC to reject impossible dates like 2026-02-31.
  const utcMs = Date.UTC(year, month - 1, day);
  const checkDate = new Date(utcMs);
  return (
    checkDate.getUTCFullYear() === year &&
    checkDate.getUTCMonth() === month - 1 &&
    checkDate.getUTCDate() === day
  );
}

/**
 * Integer days since 1970-01-01, computed at UTC midnight of the given SQL
 * date. Stable across DST.
 */
export function epochDayFromSqlDate(sqlDate: string): number {
  if (!isValidSqlDate(sqlDate)) {
    throw new Error(`epochDayFromSqlDate: invalid sql date ${sqlDate}`);
  }
  const [year, month, day] = sqlDate.split("-").map(Number);
  const utcMs = Date.UTC(year, month - 1, day);
  return Math.round(utcMs / MS_PER_DAY);
}

/**
 * `now`'s calendar date in `timeZone`, formatted as `YYYY-MM-DD`. The
 * `en-CA` locale yields exactly that shape with no further massaging.
 */
export function todaySqlDate(now: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now);
}

/**
 * Integer epoch-day for `now` in `timeZone`.
 */
export function todayEpochDay(now: Date, timeZone: string): number {
  return epochDayFromSqlDate(todaySqlDate(now, timeZone));
}

/**
 * Convenience: today as a SQL `date` string in `APP_TZ` (falling back to
 * `UTC` when unset). The Tonight server component calls this once per
 * request and threads the result through the pure ranking engine.
 */
export function today(): string {
  return todaySqlDate(new Date(), process.env.APP_TZ ?? "UTC");
}
