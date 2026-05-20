/**
 * Canonicalize a Tag name.
 *
 * Pure: `raw.trim().toLowerCase()`. Every Tag name in the system passes
 * through this on the way to a DB write — `TagInput` normalizes on the way in
 * so the tokens shown are already canonical, the Catalog server action
 * normalizes again before any insert, and the prior-data import script
 * normalizes too. The shared helper is the chosen module shape precisely
 * because two call sites must agree past the `tags.lower(name)` unique index;
 * they cannot drift.
 */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase();
}
