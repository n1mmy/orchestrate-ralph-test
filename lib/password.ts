/**
 * Constant-time password compare for the single shared-password access gate
 * (ADR-0002). The threat model is "trusted infrastructure, low-value target":
 * the password lives only as the `APP_PASSWORD` env var, so there is no
 * credential database to hash and no rate limit to enforce — the only thing
 * worth defending against is a timing oracle on the equality compare itself.
 *
 * Implementation notes:
 *
 * - `crypto.timingSafeEqual` *requires* equal-length buffers and throws
 *   otherwise; a length mismatch is therefore short-circuited to `false` here
 *   without ever reaching the native compare. The short-circuit is itself a
 *   timing side-channel (it leaks the password's length), but the password is
 *   shared across the whole household and not a per-user secret, so length
 *   leakage carries no useful signal.
 * - Both inputs are encoded as UTF-8 so a non-ASCII password compares by its
 *   byte sequence, not its code-point count.
 */

import { timingSafeEqual } from "node:crypto";

export function passwordMatches(submitted: string, expected: string): boolean {
  const a = Buffer.from(submitted, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
