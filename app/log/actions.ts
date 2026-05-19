"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { dinnerLog } from "@/db/schema";
import { authedAction } from "@/lib/authed-action";
import { type ActionResult, err, ok } from "@/lib/action-result";
import { isValidSqlDate, today as todaySqlDate } from "@/lib/local-day";
import { pgErrorMessage } from "@/lib/pg-error";

/**
 * The Log write path. Three actions plus a delete:
 *
 * - `pickTonight(optionId)` — the Tonight row's "Pick" button. Inserts a
 *   `dinner_log` row for `today()` and uses `.onConflictDoNothing()` on the
 *   `(option_id, eaten_on)` unique constraint, so a double-tap is a harmless
 *   no-op. Picking a second Option the same evening adds a second row — a
 *   multi-Option Dinner is two Log entries on one date.
 * - `logForDate(optionId, eatenOn, note?)` — the Log screen's "+ Add a
 *   dinner" form. Unlike `pickTonight`, a date the Option is already logged
 *   for is a real typed mistake here, so the `23505` collision is reported
 *   inline via `pgErrorMessage` as "Already logged for that date" rather than
 *   swallowed.
 * - `updateLogEntry(id, { optionId, eatenOn, note })` — the Log row's inline
 *   edit form. The same `23505` translation applies.
 * - `deleteLogEntry(id)` — the §17 inline-confirm "Delete" on a Log row.
 *
 * Every action revalidates both `/` (so the Tonight ranking re-sorts under
 * the row that just changed) and `/log` (so the Log screen re-renders).
 */

/**
 * Pick — the one-tap "this is tonight's dinner" write. Logs a `dinner_log`
 * row for `today()`; a double-tap is a no-op via `.onConflictDoNothing()`. On
 * success the response is `{ ok: true }` and the UI flips to "Logged ✓"
 * briefly while the revalidation re-sorts Tonight under it. A write failure
 * is `{ ok: false, error: "Couldn't log that — try again" }` — never a false
 * "Logged ✓".
 */
export const pickTonight = authedAction(
  async (optionId: string): Promise<ActionResult> => {
    try {
      await db
        .insert(dinnerLog)
        .values({ optionId, eatenOn: todaySqlDate() })
        .onConflictDoNothing({
          target: [dinnerLog.optionId, dinnerLog.eatenOn],
        });
    } catch {
      // Any unexpected failure — DB down, etc. — is reported inline rather
      // than thrown into the error boundary, because the Tonight row's UI
      // needs to keep the button alive (and avoid a false "Logged ✓").
      return err("Couldn't log that — try again");
    }
    revalidatePath("/");
    revalidatePath("/log");
    return ok();
  },
);

/**
 * Log a Dinner for a deliberately chosen date. A past date backfills a
 * forgotten Dinner; a future date is a Planned dinner (excluded from the
 * Tonight ranking until its date arrives). The date is validated with
 * `isValidSqlDate` before any DB write; a collision on
 * `(option_id, eaten_on)` returns the inline "Already logged for that date".
 */
export const logForDate = authedAction(
  async (
    optionId: string,
    eatenOn: string,
    note?: string,
  ): Promise<ActionResult> => {
    if (!isValidSqlDate(eatenOn)) return err("Pick a valid date");
    const trimmedNote =
      note === undefined || note.trim() === "" ? null : note.trim();
    try {
      await db.insert(dinnerLog).values({
        optionId,
        eatenOn,
        note: trimmedNote,
      });
    } catch (error) {
      const message = pgErrorMessage(error);
      if (message !== null) return err(message);
      throw error;
    }
    revalidatePath("/");
    revalidatePath("/log");
    return ok();
  },
);

/**
 * Edit an existing Log entry — change the Option, change the date (including
 * moving the entry between past history and Upcoming), or edit the note. A
 * collision on `(option_id, eaten_on)` is reported inline via the same
 * `pgErrorMessage` translation — never silently merged.
 */
export const updateLogEntry = authedAction(
  async (
    id: string,
    values: { optionId: string; eatenOn: string; note?: string },
  ): Promise<ActionResult> => {
    if (!isValidSqlDate(values.eatenOn)) return err("Pick a valid date");
    const trimmedNote =
      values.note === undefined || values.note.trim() === ""
        ? null
        : values.note.trim();
    try {
      await db
        .update(dinnerLog)
        .set({
          optionId: values.optionId,
          eatenOn: values.eatenOn,
          note: trimmedNote,
        })
        .where(eq(dinnerLog.id, id));
    } catch (error) {
      const message = pgErrorMessage(error);
      if (message !== null) return err(message);
      throw error;
    }
    revalidatePath("/");
    revalidatePath("/log");
    return ok();
  },
);

/**
 * Delete a Log entry. Surfaced through the §17 inline-confirm pattern
 * ("Delete · Cancel" in place) at the call site; the server action itself is
 * a plain delete by id.
 */
export const deleteLogEntry = authedAction(
  async (id: string): Promise<ActionResult> => {
    await db.delete(dinnerLog).where(eq(dinnerLog.id, id));
    revalidatePath("/");
    revalidatePath("/log");
    return ok();
  },
);
