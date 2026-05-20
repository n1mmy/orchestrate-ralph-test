"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rejections } from "@/db/schema";
import { authedAction } from "@/lib/authed-action";
import { type ActionResult, err, ok, trimToNull } from "@/lib/action-result";
import { isValidSqlDate, today as todaySqlDate } from "@/lib/local-day";
import { rejectionWriteError } from "@/lib/pg-error";

/**
 * The single write path for Rejections — every write to the `rejections` table
 * lives in this one module so the `(option_id, rejected_on)` collision is
 * handled in exactly one place. A Rejection is the Household's turn-down of an
 * Option for one calendar day; it is **not** a Log entry and carries no Score
 * weight (ADR-0003, ADR-0006). Suppression on Tonight is a presentation
 * filter, not a ranker concern — `lib/ranking.ts` is untouched.
 *
 * Four `authedAction`-wrapped actions:
 *
 * - `createRejection(optionId, rejectedOn, reason)` — the Log screen's and
 *   Option detail page's manual Rejection-create form. Validates the date,
 *   then delegates to the shared `recordRejection` core.
 * - `updateRejection(id, { optionId, rejectedOn, reason })` — the inline edit
 *   on a Rejection row. Validates the date, then `db.update(rejections)` by id.
 * - `deleteRejection(id)` — removes the `rejections` row entirely so it stops
 *   feeding AI search (ADR-0006). This is also the action behind Tonight's
 *   "Bring back" — bringing back a today-dated Rejection is the same row
 *   delete, so there is one shared action, not a duplicate.
 * - `rejectOption(optionId, reason)` — "create a Rejection dated today";
 *   delegates to `recordRejection` after computing the Household's `today()`,
 *   inheriting the `23505` collision handling so a double-tap on the live
 *   Tonight reject control returns the inline collision error rather than a
 *   500.
 *
 * `authedAction` wrapping is not optional: a Server Action is reachable by its
 * dispatch id from any route, so the shared-password session check has to run
 * here even though middleware gates page renders.
 */

/**
 * Revalidate the three views a Rejection write affects:
 *
 * - `/` — Tonight's deterministic picker filters by today's Rejections, so a
 *   Rejection dated today changes the suppression set.
 * - `/log` — the Log screen renders every Rejection alongside its Dinners.
 * - `/catalog/[id]` — the Option detail page shows the Option's Rejection
 *   history; revalidated as a dynamic route segment so every Option detail
 *   page invalidates at once.
 *
 * Centralised so every create / update / delete path stays in lock-step.
 */
function revalidateRejectionViews(): void {
  revalidatePath("/");
  revalidatePath("/log");
  revalidatePath("/catalog/[id]", "page");
}

/**
 * The shared write core. Insert a `rejections` row for `(optionId,
 * rejectedOn)` with an optional `reason` (empty / whitespace stored as
 * `null`), revalidate the three Rejection views, and translate an expected
 * driver error into an inline message. The date is assumed already validated
 * by the caller — `createRejection` validates a typed date with
 * `isValidSqlDate`, and `rejectOption` derives the date from `today()`.
 *
 * Both `createRejection` and `rejectOption` delegate here so the `23505`
 * `(option_id, rejected_on)` collision handling is shared by every create
 * path.
 */
async function recordRejection(
  optionId: string,
  rejectedOn: string,
  reason: string | undefined,
): Promise<ActionResult> {
  try {
    await db.insert(rejections).values({
      optionId,
      rejectedOn,
      reason: trimToNull(reason),
    });
  } catch (error) {
    const message = rejectionWriteError(error);
    if (message !== null) return err(message);
    throw error;
  }
  revalidateRejectionViews();
  return ok();
}

/**
 * Create a Rejection for a deliberately chosen date. A past date backfills a
 * Rejection never recorded live; a future date is a Planned rejection that
 * suppresses its Option from Tonight when that date arrives (CONTEXT.md). A
 * blank or malformed date returns the inline "Pick a valid date" message
 * rather than reaching the DB.
 */
export const createRejection = authedAction(
  async (
    optionId: string,
    rejectedOn: string,
    reason?: string,
  ): Promise<ActionResult> => {
    if (!isValidSqlDate(rejectedOn)) return err("Pick a valid date");
    return recordRejection(optionId, rejectedOn, reason);
  },
);

/**
 * Edit an existing Rejection — change the Option, move the date (including
 * between past and future), or edit the reason. A collision on
 * `(option_id, rejected_on)` is reported inline via `rejectionWriteError` —
 * never silently merged; the row is left untouched on a failed update.
 */
export const updateRejection = authedAction(
  async (
    id: string,
    values: { optionId: string; rejectedOn: string; reason?: string },
  ): Promise<ActionResult> => {
    if (!isValidSqlDate(values.rejectedOn)) return err("Pick a valid date");
    try {
      await db
        .update(rejections)
        .set({
          optionId: values.optionId,
          rejectedOn: values.rejectedOn,
          reason: trimToNull(values.reason),
        })
        .where(eq(rejections.id, id));
    } catch (error) {
      const message = rejectionWriteError(error);
      if (message !== null) return err(message);
      throw error;
    }
    revalidateRejectionViews();
    return ok();
  },
);

/**
 * Delete a Rejection row by id. The single write path for "Bring back" on the
 * Rejected-tonight disclosure (ticket 20) and the explicit delete on the Log
 * / Option detail Rejection rows (tickets 32, 33). The row is removed
 * entirely rather than expired, so a mis-tapped Rejection never reaches AI
 * search and never teaches the model anything (ADR-0006).
 *
 * Bringing back is the same row delete regardless of how the Household
 * reached it, so there is one shared `authedAction`-wrapped action — no
 * separate `bringBackRejection`.
 *
 * A delete that matches no rows is a no-op rather than an error (a second tap
 * of "Bring back" after revalidation is harmless). A malformed uuid
 * (`22P02`) is mapped inline to the same "no longer available" copy the
 * create path uses; anything else rethrows.
 */
export const deleteRejection = authedAction(
  async (rejectionId: string): Promise<ActionResult> => {
    try {
      await db.delete(rejections).where(eq(rejections.id, rejectionId));
    } catch (error) {
      const message = rejectionWriteError(error);
      if (message !== null) return err(message);
      throw error;
    }
    revalidateRejectionViews();
    return ok();
  },
);

/**
 * Reject an Option for tonight — the live Tonight row's reject control. A
 * thin wrapper that dates the Rejection to the Household's `today()` and
 * delegates to `recordRejection`, inheriting the `23505` collision handling
 * so a double-tap (or rejecting an Option already rejected today by hand)
 * returns the inline collision error rather than a 500.
 */
export const rejectOption = authedAction(
  async (optionId: string, reason?: string): Promise<ActionResult> => {
    return recordRejection(optionId, todaySqlDate(), reason);
  },
);
