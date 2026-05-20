/**
 * Snapshot-format helpers used to render Household-authored free text into
 * the AI-search snapshot. `delimit` wraps a value in
 * `<household-text>...</household-text>` so the model cannot read it as
 * instructions — a prompt-injection guard. `delimitNullable` is the same
 * helper under the name the snapshot builders use for clarity at the call
 * site (a `null` reason or note is carried through as `null` — never an
 * empty delimiter pair).
 *
 * `formatDateWithWeekday` renders a SQL `YYYY-MM-DD` date as
 * `{Weekday} {YYYY-MM-DD}` (the ADR-0005 dated-history format). The
 * snapshot's `eatenOn` / `rejectedOn` is the raw SQL date; the model
 * reads the weekday alongside it without us pre-computing recency.
 *
 * The opening and closing tokens are deliberately uncommon so an attacker
 * cannot smuggle through a closing token typed inside a Tag or note.
 */

const OPEN = "<household-text>";
const CLOSE = "</household-text>";

/**
 * Wrap a string in the household-text delimiter, returning `null` straight
 * through. A nested closing token in the input is escaped by doubling the
 * `<` so the wrap is always unambiguous.
 */
export function delimit(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  // Defense in depth — never let an authored string smuggle in a closing
  // delimiter that would tear the wrap apart.
  const safe = value.split(CLOSE).join("</household-text-escaped>");
  return `${OPEN}${safe}${CLOSE}`;
}

/**
 * Alias for `delimit` exposing the null-passing behavior in the name —
 * snapshot builders use this when a value is legitimately `null`
 * (a Rejection without a reason, a Log entry without a note).
 */
export const delimitNullable = delimit;

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Three-letter weekday for a SQL `YYYY-MM-DD` date string. Returns `""` if
 * the input doesn't parse — defensive against a malformed cell.
 */
export function weekdayOf(sqlDate: string): string {
  const [y, m, d] = sqlDate.split("-").map(Number);
  if (!y || !m || !d) return "";
  const date = new Date(Date.UTC(y, m - 1, d));
  return WEEKDAY[date.getUTCDay()] ?? "";
}

/**
 * Format a SQL date string as `{Weekday} {YYYY-MM-DD}` — the dated-history
 * shape the model reads in Log and Rejection rows. ADR-0005.
 */
export function formatDateWithWeekday(sqlDate: string): string {
  const wd = weekdayOf(sqlDate);
  return wd ? `${wd} ${sqlDate}` : sqlDate;
}
