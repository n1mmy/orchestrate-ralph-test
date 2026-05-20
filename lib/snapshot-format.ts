/**
 * Snapshot-format helpers — the tiny utility module the AI-search snapshot
 * builder uses to render Household-authored free text safely. Exports:
 *
 *  - `delimit` — wrap one piece of Household-authored prose (an Option name, a
 *    Tag, a note, a Rejection reason, the search query itself) in
 *    `<household-text>` markers so the model cannot interpret catalog text as
 *    a fresh instruction. A non-string value passes through unchanged so the
 *    caller can render `{ note: null }` without an extra branch.
 *  - `delimitNullable` — the same wrap, but with the `string | null` shape
 *    spelled out explicitly: a string is wrapped, `null` is returned as
 *    `null`. The reason an unexplained Rejection (`reason: null`) carries
 *    through as `null` rather than an empty `<household-text></household-text>`
 *    pair is honest weak data — the model should see the absence, not a
 *    delimited empty string.
 *  - `formatDateWithWeekday` — the ADR-0005 date-with-weekday format the AI
 *    snapshot uses on every dated row. `2026-05-20` → `2026-05-20 (Wednesday)`.
 *    A single combined string keeps related-information together for the
 *    model rather than asking it to glue two adjacent fields itself.
 *
 * Kept as its own file (rather than buried inside `lib/ai-search.ts`) so the
 * delimiter is a single import every snapshot site shares — adding a new
 * Household-text field anywhere in the snapshot is one tagged call.
 */

/** The bracket pair every Household-authored string is wrapped in. */
const OPEN = "<household-text>";
const CLOSE = "</household-text>";

/**
 * Wrap a string in the `<household-text>` delimiters so the model reads it as
 * data, not as instructions. `null` and `undefined` (the optional fields like a
 * Log entry's `note` or a Rejection's `reason`) pass through unchanged so the
 * caller can render the surrounding shape (`{ note: null }`) without an extra
 * branch. The delimiters are appended literally — any pre-existing
 * `<household-text>` substring inside `value` is stripped first so the
 * delimiter pair the model is told to ignore cannot be smuggled into the
 * inside of a Household-authored string.
 */
export function delimit<T extends string | null | undefined>(value: T): T {
  if (typeof value !== "string") return value;
  return (OPEN + stripDelimiterSubstrings(value) + CLOSE) as T;
}

/**
 * The nullable counterpart of `delimit`. A string is wrapped in the
 * `<household-text>` delimiters; `null` is returned as `null`. Used for
 * optional Household-authored fields — a Rejection's `reason`, a Log entry's
 * `note` — where the absence is data the model should see directly, not a
 * delimited empty pair.
 */
export function delimitNullable(value: string | null): string | null {
  if (value === null) return null;
  return OPEN + stripDelimiterSubstrings(value) + CLOSE;
}

/**
 * Strip any literal `<household-text>` or `</household-text>` substrings from
 * a Household-authored string. Defeating the delimiter requires the same
 * literal tag the model is told to ignore, so we remove them on the way in;
 * the worst case is the model treats the inner text as data, which is the
 * intended reading anyway.
 */
function stripDelimiterSubstrings(value: string): string {
  return value.split(OPEN).join("").split(CLOSE).join("");
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const SQL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Render a SQL `date` literal (`YYYY-MM-DD`) as the ADR-0005 date-with-weekday
 * string the AI snapshot uses on every dated row — `2026-05-20 (Wednesday)`.
 * Anchored at UTC noon (the trick `lib/local-day.ts` uses) so DST never
 * perturbs the weekday. A malformed value is returned unchanged.
 */
export function formatDateWithWeekday(sqlDate: string): string {
  const m = SQL_DATE.exec(sqlDate);
  if (!m) return sqlDate;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const utcMs = Date.UTC(year, month - 1, day, 12, 0, 0, 0);
  const weekday = WEEKDAYS[new Date(utcMs).getUTCDay()] ?? "";
  return `${sqlDate} (${weekday})`;
}
