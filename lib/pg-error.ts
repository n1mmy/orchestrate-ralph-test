/**
 * Translate a Postgres error into a friendly inline message a server action
 * can return as `{ ok: false, error }`. Two translations live here today:
 *
 * - `23503` (foreign_key_violation) on `dinner_log.option_id` — the
 *   `ON DELETE RESTRICT` constraint that protects an Option with Log history
 *   from a hard-delete; surfaced as "In your log — archive instead".
 * - `23505` (unique_violation) on `dinner_log_option_eaten_on_unique` — the
 *   `(option_id, eaten_on)` uniqueness on the Log; surfaced as
 *   "Already logged for that date". `pickTonight` swallows the same collision
 *   silently via `.onConflictDoNothing()` (a double-tap on Tonight is a
 *   harmless no-op); this branch handles the deliberate `logForDate` /
 *   `updateLogEntry` case where the Household genuinely picked a date that
 *   already carries that Option, and the inline error preserves the form
 *   input.
 *
 * Everything else is rethrown: a 500 surfaced through Next's error boundary is
 * the right outcome for genuinely unexpected failure. Translation here is
 * narrow on purpose — only known, *recoverable* constraint violations become
 * inline messages.
 */

/** A shape-loose view of a `postgres-js` error — just the fields we read. */
type PgErrorLike = {
  code?: string;
  constraint_name?: string;
  constraint?: string;
};

function isPgErrorLike(value: unknown): value is PgErrorLike {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.code === "string" ||
    typeof v.constraint_name === "string" ||
    typeof v.constraint === "string"
  );
}

/** The `dinner_log` unique constraint name from `db/schema.ts`. */
const DINNER_LOG_UNIQUE = "dinner_log_option_eaten_on_unique";

/**
 * Return an inline error string for a known, recoverable Postgres failure, or
 * `null` if the error is not one of those — in which case the caller should
 * rethrow so Next's error boundary handles it.
 */
export function pgErrorMessage(error: unknown): string | null {
  if (!isPgErrorLike(error)) return null;
  if (error.code === "23503") {
    return "In your log — archive instead";
  }
  if (error.code === "23505") {
    const constraint = error.constraint_name ?? error.constraint;
    if (constraint === DINNER_LOG_UNIQUE) {
      return "Already logged for that date";
    }
  }
  return null;
}
