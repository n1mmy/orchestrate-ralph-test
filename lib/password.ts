/**
 * Constant-time plaintext password compare for the single-shared-password
 * gate (ADR-0002). The threat model deliberately stores `APP_PASSWORD` in
 * plaintext (no hashing, no lockout, no rate limit) — the only protection on
 * compare is constant-time equality via `crypto.timingSafeEqual`.
 *
 * `timingSafeEqual` throws if the two buffers differ in length, so a length
 * mismatch short-circuits to `false` before the call. The two buffers are
 * built from `Buffer.byteLength`-sized allocations off the input strings —
 * the same encoding on both sides — so equal `byteLength` is the only
 * pre-check.
 */
import { timingSafeEqual } from "node:crypto";

export function passwordMatches(
  submitted: string,
  expected: string,
): boolean {
  const a = Buffer.from(submitted, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
