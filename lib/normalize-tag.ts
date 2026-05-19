/**
 * Canonicalise a raw Tag string. Every Tag the app stores or compares passes
 * through this helper so the `tags.lower(name)` unique index is never bypassed.
 *
 * Two call sites must agree: the Catalog tag-attach path (`TagInput` on the
 * way in, `syncOptionTags` again before the DB write) and the import script
 * (ticket 09). A shared, pure helper is the chosen module shape precisely
 * because those two paths cannot drift.
 *
 * Pure — no side effects, no I/O. Trim leading/trailing whitespace, then
 * lowercase. A blank input collapses to the empty string; callers filter that
 * out before persisting.
 */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase();
}
