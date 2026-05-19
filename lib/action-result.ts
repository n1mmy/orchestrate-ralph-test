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

/**
 * Trim a form string and collapse blanks (empty or whitespace-only) to `null`.
 * Used by server actions that store an optional text field — the DB stores
 * `null` rather than `""` so "no value" is one canonical shape. Accepts
 * `undefined` for actions that may receive the field unset entirely.
 */
export function trimToNull(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
