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
