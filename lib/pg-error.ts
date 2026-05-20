/**
 * Translate a Postgres error into a friendly inline message for the UI.
 *
 * Returns `null` when the error is not one this layer wants to translate —
 * the caller should rethrow so the framework surfaces it.
 *
 * Translated cases:
 *   - `23503` — FK violation on a hard-delete of an Option that has Log
 *     entries. `dinner_log.option_id` is `ON DELETE RESTRICT`, so this
 *     tells the Household to Archive instead.
 *   - `23505` on `dinner_log_option_eaten_on_unique` — a Log entry for
 *     that (Option, date) pair already exists. This is the deliberate
 *     `logForDate` / `updateLogEntry` collision; `pickTonight` swallows
 *     the same conflict with `.onConflictDoNothing()` because a double-tap
 *     is not a real typed mistake.
 */
export type PgLikeError = {
  code?: string;
  constraint_name?: string;
  constraint?: string;
  table_name?: string;
};

function isPgLikeError(value: unknown): value is PgLikeError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in (value as Record<string, unknown>)
  );
}

/**
 * Exported type-guard for callers that translate a SQLSTATE themselves
 * rather than going through `pgErrorMessage`. `rejectOption` collapses
 * `22P02` and `23503` to the same friendly message; it needs the same
 * "is this a Postgres-shaped error" check.
 */
export function isPgError(value: unknown): value is PgLikeError {
  return isPgLikeError(value);
}

function constraintOf(error: PgLikeError): string | undefined {
  return error.constraint_name ?? error.constraint;
}

export function pgErrorMessage(error: unknown): string | null {
  if (!isPgLikeError(error)) return null;
  if (error.code === "23503") {
    // dinner_log.option_id ON DELETE RESTRICT — Option is in the Log.
    return "In your log — archive instead";
  }
  if (error.code === "23505") {
    const constraint = constraintOf(error);
    if (
      constraint === undefined ||
      constraint === "dinner_log_option_eaten_on_unique"
    ) {
      return "Already logged for that date";
    }
  }
  return null;
}
