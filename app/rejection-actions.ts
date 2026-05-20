"use server";

/**
 * Rejection server actions — every write to the `rejections` table lives
 * in this one module so the `(option_id, rejected_on)` collision is
 * handled in one place.
 *
 * Surface:
 *
 *   - `rejectOption(optionId, reason)` — the Tonight row's "Reject"
 *     affordance. Dates to `today()` and delegates to `recordRejection`,
 *     so it inherits the same `23505` collision handling as
 *     `createRejection`.
 *
 *   - `createRejection(optionId, rejectedOn, reason)` — the dated
 *     manual entry from the Log screen or the Option detail page. The
 *     caller picks the date; a deliberate same-date repeat is the typed
 *     mistake the unique constraint reports inline.
 *
 *   - `updateRejection(id, …)` — inline edit of an existing dated
 *     Rejection. A failed update (e.g. moving it onto another
 *     Rejection's date) reports the collision inline and leaves the row
 *     untouched.
 *
 *   - `deleteRejection(id)` — removes a Rejection by id. Doubles as the
 *     "Bring back" action behind the Tonight "Rejected tonight"
 *     disclosure.
 *
 * Every successful write revalidates `/` (Tonight, where the picker
 * filter depends on today's Rejections), `/log` (the Log screen surfaces
 * dated Rejections), and `/catalog/[id]` (the Option detail page renders
 * Rejection history).
 */
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { rejections } from "@/db/schema";
import { type ActionResult, trimToNull } from "@/lib/action-result";
import { authedAction } from "@/lib/authed-action";
import { isValidSqlDate, today } from "@/lib/local-day";
import { rejectionWriteError } from "@/lib/pg-error";

const INVALID_DATE_MESSAGE = "Pick a valid date";
const STALE_OPTION_MESSAGE = "That option is no longer available";

/**
 * Shared revalidation set for every successful write to `rejections`.
 * `/catalog/[id]` is a wildcard ("page") so every Option's detail page
 * is marked stale without naming the id explicitly.
 */
function revalidateRejectionViews(): void {
  revalidatePath("/");
  revalidatePath("/log");
  revalidatePath("/catalog/[id]", "page");
}

/**
 * Private core for every "create a Rejection" path. The caller has
 * already validated the date (and the optionId shape, where relevant);
 * this function performs the insert, maps the driver error to an inline
 * message, and revalidates the affected views on success.
 *
 * `reason` is stored as `null` when blank/whitespace so the AI snapshot
 * sees "no reason" cleanly rather than `""` masquerading as one.
 */
async function recordRejection(
  optionId: string,
  rejectedOn: string,
  reason: string | null | undefined,
): Promise<ActionResult> {
  try {
    await db.insert(rejections).values({
      optionId,
      reason: trimToNull(reason ?? null),
      rejectedOn,
    });
  } catch (error) {
    const friendly = rejectionWriteError(error);
    if (friendly !== null) {
      return { ok: false, error: friendly };
    }
    throw error;
  }
  revalidateRejectionViews();
  return { ok: true };
}

export const rejectOption = authedAction(
  async (optionId: string, reason: string): Promise<ActionResult> => {
    if (typeof optionId !== "string" || optionId === "") {
      return { ok: false, error: STALE_OPTION_MESSAGE };
    }
    return recordRejection(optionId, today(), reason);
  },
);

export const createRejection = authedAction(
  async (
    optionId: string,
    rejectedOn: string,
    reason: string | null,
  ): Promise<ActionResult> => {
    if (typeof optionId !== "string" || optionId === "") {
      return { ok: false, error: STALE_OPTION_MESSAGE };
    }
    if (!isValidSqlDate(rejectedOn)) {
      return { ok: false, error: INVALID_DATE_MESSAGE };
    }
    return recordRejection(optionId, rejectedOn, reason);
  },
);

export type RejectionUpdate = {
  optionId: string;
  rejectedOn: string;
  reason: string | null;
};

export const updateRejection = authedAction(
  async (id: string, values: RejectionUpdate): Promise<ActionResult> => {
    if (typeof id !== "string" || id === "") {
      return { ok: false, error: "Couldn't save — try again" };
    }
    if (typeof values.optionId !== "string" || values.optionId === "") {
      return { ok: false, error: STALE_OPTION_MESSAGE };
    }
    if (!isValidSqlDate(values.rejectedOn)) {
      return { ok: false, error: INVALID_DATE_MESSAGE };
    }
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
      const friendly = rejectionWriteError(error);
      if (friendly !== null) {
        return { ok: false, error: friendly };
      }
      throw error;
    }
    revalidateRejectionViews();
    return { ok: true };
  },
);

export const deleteRejection = authedAction(async (id: string): Promise<void> => {
  if (typeof id !== "string" || id === "") {
    return;
  }
  await db.delete(rejections).where(eq(rejections.id, id));
  revalidateRejectionViews();
});
