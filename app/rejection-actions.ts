"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
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

/**
 * Delete a Rejection row by id. The single write path for "Bring back" on the
 * Rejected-tonight disclosure (ticket 20): the row is removed entirely rather
 * than expired, so a mis-tapped Rejection never reaches AI search and never
 * teaches the model anything. Bringing back is the same row delete regardless
 * of how the Household reached it, so there is no separate
 * `bringBackRejection` — one shared `authedAction`-wrapped action covers both.
 *
 * Thin by design — no logic beyond the delete — following the existing
 * `pickTonight` / `rejectOption` pattern. A malformed uuid (`22P02`) is
 * mapped inline to the same "no longer available" copy the reject path uses;
 * a delete that matches no rows is treated as already-deleted and returns
 * `ok()` (a second tap of "Bring back" after revalidation is a no-op, not an
 * error). Anything else rethrows so Next's error boundary handles it.
 *
 * The same three views the reject path revalidates are revalidated here so
 * the Option returns to tonight's list immediately on the next render.
 */
export const deleteRejection = authedAction(
  async (rejectionId: string): Promise<ActionResult> => {
    try {
      await db.delete(rejections).where(eq(rejections.id, rejectionId));
    } catch (error) {
      const code = pgCode(error);
      if (code === "22P02") {
        return err("That option is no longer available");
      }
      throw error;
    }
    revalidatePath("/");
    revalidatePath("/log");
    revalidatePath("/catalog/[id]", "page");
    return ok();
  },
);
