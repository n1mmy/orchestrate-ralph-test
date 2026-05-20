/**
 * Shared `ActionResult` discriminated union returned by every server action.
 *
 * The `ok: false` branch's `error` is the inline user-facing message — it
 * goes straight into a `text-danger` line, no further translation. Server
 * actions never throw for an expected failure; they translate it into this
 * shape so the form can render the message in place.
 */
export type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; value: T })
  | { ok: false; error: string };

/**
 * Normalise a free-text field for the DB: trim it, and if what remains is
 * empty, store `null` rather than a zero-length string. Used by the
 * Rejection action (optional reason) and any other action that treats
 * "blank" the same as "absent".
 */
export function trimToNull(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}
