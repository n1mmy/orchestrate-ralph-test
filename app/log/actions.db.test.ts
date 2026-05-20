/**
 * Database-backed integration tests for the Log server actions.
 *
 * Runs under the `*.db.test.ts` config (`vitest.config.db.ts`). Each test
 * seeds the rows it needs and asserts only on those rows.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  deleteLogEntry,
  logForDate,
  pickTonight,
  updateLogEntry,
} from "./actions";
import { db, queryClient } from "@/db";
import { dinnerLog, options } from "@/db/schema";
import { today } from "@/lib/local-day";

async function seedOption(kind: "home" | "restaurant" = "home") {
  const [row] = await db
    .insert(options)
    .values({ name: `seed-${crypto.randomUUID()}`, kind })
    .returning();
  return row;
}

describe("log server actions", () => {
  afterAll(async () => {
    await queryClient.end({ timeout: 5 });
  });

  describe("pickTonight", () => {
    it("inserts a dinner_log row dated today", async () => {
      const opt = await seedOption();
      const result = await pickTonight(opt.id);
      expect(result).toEqual({ ok: true });

      const rows = await db.query.dinnerLog.findMany({
        where: eq(dinnerLog.optionId, opt.id),
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].eatenOn).toBe(today());
    });

    it("double-tap on the same Option in the same day is a no-op", async () => {
      const opt = await seedOption();
      const first = await pickTonight(opt.id);
      const second = await pickTonight(opt.id);
      expect(first).toEqual({ ok: true });
      expect(second).toEqual({ ok: true });

      const rows = await db.query.dinnerLog.findMany({
        where: eq(dinnerLog.optionId, opt.id),
      });
      expect(rows).toHaveLength(1);
    });
  });

  describe("logForDate", () => {
    it("inserts a backfilled past entry", async () => {
      const opt = await seedOption();
      const result = await logForDate(opt.id, "2024-03-15", "tasty");
      expect(result).toEqual({ ok: true });
      const rows = await db.query.dinnerLog.findMany({
        where: and(
          eq(dinnerLog.optionId, opt.id),
          eq(dinnerLog.eatenOn, "2024-03-15"),
        ),
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].note).toBe("tasty");
    });

    it("inserts a future-dated Planned dinner", async () => {
      const opt = await seedOption();
      const result = await logForDate(opt.id, "2099-12-31", null);
      expect(result).toEqual({ ok: true });
      const rows = await db.query.dinnerLog.findMany({
        where: eq(dinnerLog.eatenOn, "2099-12-31"),
      });
      // Filter to this seed Option's row only — other tests may share dates.
      const mine = rows.filter((r) => r.optionId === opt.id);
      expect(mine).toHaveLength(1);
    });

    it("rejects an invalid date string inline", async () => {
      const opt = await seedOption();
      const result = await logForDate(opt.id, "not-a-date", null);
      expect(result).toEqual({ ok: false, error: "Enter a valid date" });
    });

    it("surfaces the unique-conflict as 'Already logged for that date'", async () => {
      const opt = await seedOption();
      const first = await logForDate(opt.id, "2024-04-01", null);
      expect(first).toEqual({ ok: true });
      const collision = await logForDate(opt.id, "2024-04-01", "again");
      expect(collision).toEqual({
        ok: false,
        error: "Already logged for that date",
      });
    });
  });

  describe("updateLogEntry", () => {
    it("updates option, date, and note", async () => {
      const opt = await seedOption();
      const other = await seedOption();
      const [entry] = await db
        .insert(dinnerLog)
        .values({ optionId: opt.id, eatenOn: "2024-05-01", note: "x" })
        .returning();
      const result = await updateLogEntry(entry.id, {
        optionId: other.id,
        eatenOn: "2024-05-02",
        note: "y",
      });
      expect(result).toEqual({ ok: true });
      const updated = await db.query.dinnerLog.findFirst({
        where: eq(dinnerLog.id, entry.id),
      });
      expect(updated?.optionId).toBe(other.id);
      expect(updated?.eatenOn).toBe("2024-05-02");
      expect(updated?.note).toBe("y");
    });

    it("rejects the unique-conflict inline with input preserved", async () => {
      const opt = await seedOption();
      // Two existing entries on different days for the same Option.
      await db
        .insert(dinnerLog)
        .values({ optionId: opt.id, eatenOn: "2024-06-01" });
      const [moveMe] = await db
        .insert(dinnerLog)
        .values({ optionId: opt.id, eatenOn: "2024-06-02", note: "draft" })
        .returning();
      // Try to move the second entry onto the first's date → 23505.
      const result = await updateLogEntry(moveMe.id, {
        optionId: opt.id,
        eatenOn: "2024-06-01",
        note: "draft",
      });
      expect(result).toEqual({
        ok: false,
        error: "Already logged for that date",
      });
      const stillThere = await db.query.dinnerLog.findFirst({
        where: eq(dinnerLog.id, moveMe.id),
      });
      // Input preserved: the row that was already on 2024-06-02 stayed.
      expect(stillThere?.eatenOn).toBe("2024-06-02");
    });
  });

  describe("deleteLogEntry", () => {
    it("removes the row", async () => {
      const opt = await seedOption();
      const [entry] = await db
        .insert(dinnerLog)
        .values({ optionId: opt.id, eatenOn: "2024-07-01" })
        .returning();
      const result = await deleteLogEntry(entry.id);
      expect(result).toEqual({ ok: true });
      const remaining = await db.query.dinnerLog.findFirst({
        where: eq(dinnerLog.id, entry.id),
      });
      expect(remaining).toBeUndefined();
    });
  });
});
