/**
 * Translate a Postgres error into a friendly inline message for the UI.
 *
 * Returns `null` when the error is not one this layer wants to translate —
 * the caller should rethrow so the framework surfaces it.
 *
 * The first case we translate is `23503` (foreign-key violation) on a
 * hard-delete of an Option that has Log entries. The `dinner_log.option_id`
 * FK is `ON DELETE RESTRICT`, so Postgres raises `23503`; we tell the
 * Household to Archive instead.
 */
export type PgLikeError = {
  code?: string;
  constraint_name?: string;
  table_name?: string;
};

function isPgLikeError(value: unknown): value is PgLikeError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in (value as Record<string, unknown>)
  );
}

export function pgErrorMessage(error: unknown): string | null {
  if (!isPgLikeError(error)) return null;
  if (error.code === "23503") {
    // dinner_log.option_id ON DELETE RESTRICT — Option is in the Log.
    return "In your log — archive instead";
  }
  return null;
}
