"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { rejections } from "@/db/schema";
import { authedAction } from "@/lib/authed-action";
import { type ActionResult, err, ok, trimToNull } from "@/lib/action-result";
import { today as todaySqlDate } from "@/lib/local-day";

/**
 * The write path for Rejections — every write to the `rejections` table lives
 * in this one module. A Rejection is a Household turn-down of an Option for
 * one calendar day; it is **not** a Log entry and carries no Score weight
 * (ADR-0003, ADR-0006). Suppression on Tonight is a presentation filter in
 * `app/page.tsx`, not a ranker concern — `lib/ranking.ts` is untouched.
 *
 * `authedAction` wrapping is not optional: a Server Action is reachable by
 * its dispatch id from any route, so the shared-password session check has
 * to run here even though middleware gates page renders.
 */

/**
 * A shape-loose view of a `postgres-js` error — just the fields we read for
 * the two recoverable codes this module surfaces inline. `pgErrorMessage`
 * translates the `dinner_log` constraints; rejection writes have their own
 * narrow translations (a malformed/stale Option id) so we read the code
 * locally rather than burden the shared helper with rejection-specific
 * meanings.
 */
type PgCode = { code?: string };

function pgCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const v = error as Record<string, unknown>;
  return typeof v.code === "string" ? v.code : undefined;
}

/**
 * Reject an Option for tonight. Inserts a `rejections` row dated `today()` in
 * `APP_TZ`; an empty or whitespace-only reason is stored as `null`. On
 * success the response is `{ ok: true }` and the revalidation removes the
 * row from the Tonight picker (the page filter keys on today's Rejections).
 *
 * A driver error from a malformed or stale Option id is mapped inline —
 * `22P02` (invalid uuid) or `23503` (FK violation on `option_id`) becomes
 * `"That option is no longer available"`. Anything else rethrows so Next's
 * error boundary handles it. The action is thin by design — no logic beyond
 * the dated write — following the existing `pickTonight` pattern.
 *
 * `/` is revalidated because the Tonight picker filters by today's
 * Rejections; `/log` and `/catalog/[id]` are revalidated for consistency
 * with later phases that surface Rejections on those routes (tickets 20+).
 */
export const rejectOption = authedAction(
  async (optionId: string, reason?: string): Promise<ActionResult> => {
    const trimmedReason = trimToNull(reason);
    try {
      await db.insert(rejections).values({
        optionId,
        rejectedOn: todaySqlDate(),
        reason: trimmedReason,
      });
    } catch (error) {
      const code = pgCode(error);
      if (code === "22P02" || code === "23503") {
        return err("That option is no longer available");
      }
      throw error;
    }
    revalidatePath("/");
    revalidatePath("/log");
    // `/catalog/[id]` is revalidated as a dynamic route segment so every
    // Option detail page invalidates at once; the route lands in a later
    // phase (ticket 22) and the call is a harmless no-op until then.
    revalidatePath("/catalog/[id]", "page");
    return ok();
  },
);
