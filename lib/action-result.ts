/**
 * The shared `ActionResult` shape every server action returns.
 *
 * The Catalog's create/update/archive/delete actions, and every server action
 * that follows, return this discriminated union so call-sites surface
 * `result.error` inline rather than throwing into an error page. The shape is
 * deliberately tiny — `ok: true` carries no payload by default; specific
 * actions extend it as needed.
 */
export type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; value: T })
  | { ok: false; error: string };

/** Sugar for `{ ok: true }` — keeps the call-site readable. */
export function ok(): { ok: true };
export function ok<T>(value: T): { ok: true; value: T };
export function ok<T>(value?: T): { ok: true } | { ok: true; value: T } {
  return value === undefined ? { ok: true } : { ok: true, value };
}

/** Sugar for `{ ok: false, error }`. */
export function err(error: string): { ok: false; error: string } {
  return { ok: false, error };
}
