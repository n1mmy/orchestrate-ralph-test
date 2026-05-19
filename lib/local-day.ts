/**
 * Local-day conversion — a pure module that maps SQL `date` values and a "now"
 * instant onto integer **epoch-days** in the Household's calendar (`APP_TZ`).
 *
 * Ranking subtracts dates: "days since this Option was eaten" is `today - eatenOn`.
 * Doing that subtraction on `Date` objects is wrong across a Daylight-Saving
 * boundary — a 23- or 25-hour day rounds differently depending on which side
 * of the boundary the math runs on. Reducing every `date` to an integer
 * epoch-day in `APP_TZ` makes that subtraction safe: each calendar day is
 * exactly one integer apart from the next, irrespective of DST.
 *
 * The module is pure (no I/O, no DB, no React) with one impure
 * convenience — `today()` — that reads `process.env.APP_TZ` and the current
 * wall clock. Every other function is deterministic and unit-testable.
 */

const SQL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Convert a SQL `date` literal (`"YYYY-MM-DD"`) into an integer count of days
 * since the Unix epoch (1970-01-01). The conversion ignores the time of day
 * by anchoring to UTC noon and dividing by 86 400 000 ms; using noon (rather
 * than midnight) keeps any rounding error well clear of a day boundary.
 *
 * The input must be a calendar-valid SQL date — `isValidSqlDate` is the gate;
 * this helper assumes it has already passed.
 */
export function epochDayFromSqlDate(sqlDate: string): number {
  const m = SQL_DATE.exec(sqlDate);
  if (!m) {
    throw new Error(`epochDayFromSqlDate: not a SQL date: ${sqlDate}`);
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  // UTC noon — clear of DST and clear of a midnight rounding edge.
  const utcMs = Date.UTC(year, month - 1, day, 12, 0, 0, 0);
  return Math.floor(utcMs / 86_400_000);
}

/**
 * Is `value` shaped *and* calendar-valid as a SQL `date`? Both shape (the
 * `YYYY-MM-DD` regex) and validity (the date round-trips through `Date.UTC`)
 * must hold — `"2026-02-30"` matches the regex but is rejected.
 */
export function isValidSqlDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = SQL_DATE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const utcMs = Date.UTC(year, month - 1, day, 12, 0, 0, 0);
  const d = new Date(utcMs);
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * The Household's calendar day for `now`, as a SQL `date` string. We ask the
 * `Intl` engine for the year/month/day in `timeZone` using the `en-CA` locale,
 * which formats as `YYYY-MM-DD` natively — no string surgery, no DST drift.
 */
export function todaySqlDate(now: Date, timeZone: string): string {
  // `en-CA` formats `YYYY-MM-DD` natively, regardless of the system locale.
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

/**
 * The Household's calendar day for `now` as an integer epoch-day in
 * `timeZone`. Composition of `todaySqlDate` and `epochDayFromSqlDate` — kept
 * as a single helper because the Tonight pipeline needs both forms.
 */
export function todayEpochDay(now: Date, timeZone: string): number {
  return epochDayFromSqlDate(todaySqlDate(now, timeZone));
}

/**
 * Today's SQL date in the Household's time zone, defaulting to UTC when
 * `APP_TZ` is unset (the development fallback). The one impure helper in this
 * module — every other export is deterministic.
 */
export function today(): string {
  return todaySqlDate(new Date(), process.env.APP_TZ ?? "UTC");
}
