/**
 * Translate a Postgres error into a friendly inline message a server action
 * can return as `{ ok: false, error }`. The only translation v1 needs is
 * `23503` (foreign_key_violation) on `dinner_log.option_id` — the
 * `ON DELETE RESTRICT` constraint that protects an Option with Log history
 * from a hard-delete.
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
  return null;
}
