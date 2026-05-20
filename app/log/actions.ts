"use server";

/**
 * Log server actions.
 *
 * `pickTonight(optionId)` — the Tonight "Pick" affordance. Inserts a
 *   `dinner_log` row for today's date. `.onConflictDoNothing()` on
 *   `(option_id, eaten_on)` so a double-tap is a harmless no-op rather
 *   than a "Already logged" error: the second tap is almost always a
 *   user not yet seeing the first tap's revalidation.
 *
 * `logForDate(optionId, eatenOn, note?)` — the Log screen's "+ Add a
 *   dinner" form. The date is a deliberate choice (past backfill or
 *   future Planned dinner), so a `(option, date)` collision IS a real
 *   typed mistake: `23505` is surfaced inline as
 *   "Already logged for that date" via `pgErrorMessage`.
 *
 * `updateLogEntry(id, …)` and `deleteLogEntry(id)` — inline edit and
 *   delete from the Log screen.
 *
 * Every write `revalidatePath`s both `/` (Tonight ranking depends on the
 * Log) and `/log` (the Log screen itself).
 */
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { dinnerLog } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { authedAction } from "@/lib/authed-action";
import { isValidSqlDate, today } from "@/lib/local-day";
import { pgErrorMessage } from "@/lib/pg-error";

function revalidateLogPaths(): void {
  revalidatePath("/");
  revalidatePath("/log");
}

function blankString(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

export const pickTonight = authedAction(
  async (optionId: string): Promise<ActionResult> => {
    if (typeof optionId !== "string" || optionId === "") {
      return { ok: false, error: "Couldn't log that — try again" };
    }
    try {
      await db
        .insert(dinnerLog)
        .values({ optionId, eatenOn: today() })
        // A double-tap (same Option, same date) is a no-op — the row
        // already exists, the second click is the user's "did it land?".
        .onConflictDoNothing({
          target: [dinnerLog.optionId, dinnerLog.eatenOn],
        });
    } catch {
      // Anything that *did* throw is a write failure: connection, FK, etc.
      // The Household sees a friendly inline message rather than a 500;
      // we deliberately never report `ok: true` on a failed write.
      return { ok: false, error: "Couldn't log that — try again" };
    }
    revalidateLogPaths();
    return { ok: true };
  },
);

export const logForDate = authedAction(
  async (
    optionId: string,
    eatenOn: string,
    note?: string | null,
  ): Promise<ActionResult> => {
    if (typeof optionId !== "string" || optionId === "") {
      return { ok: false, error: "Pick an Option" };
    }
    if (!isValidSqlDate(eatenOn)) {
      return { ok: false, error: "Enter a valid date" };
    }
    try {
      await db.insert(dinnerLog).values({
        optionId,
        eatenOn,
        note: blankString(note),
      });
    } catch (error) {
      const friendly = pgErrorMessage(error);
      if (friendly !== null) {
        return { ok: false, error: friendly };
      }
      throw error;
    }
    revalidateLogPaths();
    return { ok: true };
  },
);

export type LogEntryUpdate = {
  optionId: string;
  eatenOn: string;
  note?: string | null;
};

export const updateLogEntry = authedAction(
  async (id: string, values: LogEntryUpdate): Promise<ActionResult> => {
    if (typeof id !== "string" || id === "") {
      return { ok: false, error: "Couldn't save — try again" };
    }
    if (typeof values.optionId !== "string" || values.optionId === "") {
      return { ok: false, error: "Pick an Option" };
    }
    if (!isValidSqlDate(values.eatenOn)) {
      return { ok: false, error: "Enter a valid date" };
    }
    try {
      await db
        .update(dinnerLog)
        .set({
          optionId: values.optionId,
          eatenOn: values.eatenOn,
          note: blankString(values.note),
        })
        .where(eq(dinnerLog.id, id));
    } catch (error) {
      const friendly = pgErrorMessage(error);
      if (friendly !== null) {
        return { ok: false, error: friendly };
      }
      throw error;
    }
    revalidateLogPaths();
    return { ok: true };
  },
);

export const deleteLogEntry = authedAction(
  async (id: string): Promise<ActionResult> => {
    if (typeof id !== "string" || id === "") {
      return { ok: false, error: "Couldn't delete — try again" };
    }
    await db.delete(dinnerLog).where(eq(dinnerLog.id, id));
    revalidateLogPaths();
    return { ok: true };
  },
);
