"use server";

/**
 * Rejection server actions.
 *
 * `rejectOption(optionId, reason)` — the Tonight row's "Reject" affordance.
 *   Inserts a `rejections` row dated `today()` in `APP_TZ`. A blank or
 *   whitespace-only `reason` is stored as `null` so the AI snapshot sees
 *   "no reason" cleanly rather than `""` masquerading as one.
 *
 *   Stale or malformed Option ids (a row deleted between page render and
 *   the click, a corrupted client payload) collapse to one inline
 *   `ActionResult` error rather than a 500: Postgres `22P02`
 *   (invalid_text_representation, e.g. a non-UUID id) and `23503` (FK
 *   violation on the cascade) both map to the same user-facing message.
 *
 *   Every successful Rejection revalidates `/` (Tonight, where the row
 *   drops out of the picker), `/log` (the Log screen surfaces dated
 *   Rejections), and `/catalog/[id]` (the Option detail page renders
 *   Rejection history). The Option detail revalidation is a wildcard
 *   `revalidatePath("/catalog/[id]", "page")` so every Option's page is
 *   marked stale without naming the id explicitly.
 *
 * No `23505` (unique constraint) translation lives here — that branch is
 * ticket 12. A duplicate same-day Rejection cannot reach this action
 * today because the row drops out of the picker the moment it is
 * rejected; the constraint is defence-in-depth for the manual-entry
 * paths ticket 12 surfaces.
 */
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { rejections } from "@/db/schema";
import { type ActionResult, trimToNull } from "@/lib/action-result";
import { authedAction } from "@/lib/authed-action";
import { today } from "@/lib/local-day";
import { isPgError } from "@/lib/pg-error";

const STALE_OPTION_MESSAGE = "That option is no longer available";

export const rejectOption = authedAction(
  async (optionId: string, reason: string): Promise<ActionResult> => {
    if (typeof optionId !== "string" || optionId === "") {
      return { ok: false, error: STALE_OPTION_MESSAGE };
    }
    try {
      await db.insert(rejections).values({
        optionId,
        reason: trimToNull(reason),
        rejectedOn: today(),
      });
    } catch (error) {
      if (isPgError(error)) {
        if (error.code === "22P02" || error.code === "23503") {
          return { ok: false, error: STALE_OPTION_MESSAGE };
        }
      }
      throw error;
    }
    revalidatePath("/");
    revalidatePath("/log");
    revalidatePath("/catalog/[id]", "page");
    return { ok: true };
  },
);
