/**
 * Database-backed integration tests for the Rejection server actions and
 * the Log Rejections queries.
 *
 * Runs under the `*.db.test.ts` config (`vitest.config.db.ts`), which
 * provisions a per-worktree Postgres database. `next/cache` and
 * `lib/require-session` are stubbed out — the actions write to the real
 * database but the framework side effects do not run in this
 * environment. Each test seeds the rows it needs and the suite
 * truncates `rejections`/`options` between tests so a `23505` collision
 * test is not contaminated by an earlier row.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

vi.mock("@/lib/require-session", () => ({
  requireSession: async () => undefined,
}));

import {
  createRejection,
  deleteRejection,
  rejectOption,
  updateRejection,
} from "./rejection-actions";
import { db, queryClient } from "@/db";
import {
  getLogRejections,
  getOptionChoices,
  getOptionRejections,
  getTodayRejections,
} from "@/db/queries";
import { options, rejections } from "@/db/schema";
import { today } from "@/lib/local-day";

async function seedOption(
  kind: "home" | "restaurant" = "home",
  overrides: { name?: string; active?: boolean } = {},
) {
  const [row] = await db
    .insert(options)
    .values({
      name: overrides.name ?? `seed-${crypto.randomUUID()}`,
      kind,
      ...(overrides.active === false ? { active: false } : {}),
    })
    .returning();
  return row;
}

describe("rejection server actions", () => {
  beforeEach(async () => {
    // Truncate so a `(option_id, rejected_on)` collision test cannot
    // collide with a row a previous test left behind.
    await db.execute(
      sql`TRUNCATE TABLE ${rejections}, ${options} RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    await queryClient.end({ timeout: 5 });
  });

  describe("rejectOption", () => {
    it("inserts a rejections row dated today with the trimmed reason", async () => {
      const opt = await seedOption();
      const result = await rejectOption(opt.id, "  too heavy  ");
      expect(result).toEqual({ ok: true });

      const rows = await db.query.rejections.findMany({
        where: eq(rejections.optionId, opt.id),
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].rejectedOn).toBe(today());
      expect(rows[0].reason).toBe("too heavy");
    });

    it("stores a whitespace-only reason as null", async () => {
      const opt = await seedOption();
      await rejectOption(opt.id, "   ");
      const rows = await db.query.rejections.findMany({
        where: eq(rejections.optionId, opt.id),
      });
      expect(rows[0].reason).toBeNull();
    });

    it("returns inline 'Already rejected for that date' on a same-day double-tap (23505)", async () => {
      const opt = await seedOption();
      const first = await rejectOption(opt.id, null as unknown as string);
      const second = await rejectOption(opt.id, "again");
      expect(first).toEqual({ ok: true });
      expect(second).toEqual({
        ok: false,
        error: "Already rejected for that date",
      });

      const rows = await db.query.rejections.findMany({
        where: eq(rejections.optionId, opt.id),
      });
      expect(rows).toHaveLength(1);
    });

    it("returns inline 'That option is no longer available' for a non-UUID id", async () => {
      const result = await rejectOption("not-a-uuid", "x");
      expect(result).toEqual({
        ok: false,
        error: "That option is no longer available",
      });
    });

    it("returns inline 'That option is no longer available' for a missing FK", async () => {
      const result = await rejectOption(crypto.randomUUID(), null as unknown as string);
      expect(result).toEqual({
        ok: false,
        error: "That option is no longer available",
      });
    });
  });

  describe("createRejection", () => {
    it("inserts a dated row for a past date", async () => {
      const opt = await seedOption();
      const result = await createRejection(opt.id, "2024-03-15", "closed");
      expect(result).toEqual({ ok: true });

      const rows = await db.query.rejections.findMany({
        where: eq(rejections.optionId, opt.id),
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].rejectedOn).toBe("2024-03-15");
      expect(rows[0].reason).toBe("closed");
    });

    it("inserts a future-dated Planned rejection", async () => {
      const opt = await seedOption();
      const result = await createRejection(opt.id, "2099-12-31", null);
      expect(result).toEqual({ ok: true });
      const rows = await db.query.rejections.findMany({
        where: eq(rejections.optionId, opt.id),
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].rejectedOn).toBe("2099-12-31");
      expect(rows[0].reason).toBeNull();
    });

    it("rejects an invalid date inline with 'Pick a valid date'", async () => {
      const opt = await seedOption();
      const result = await createRejection(opt.id, "not-a-date", null);
      expect(result).toEqual({ ok: false, error: "Pick a valid date" });
      const rows = await db.query.rejections.findMany({
        where: eq(rejections.optionId, opt.id),
      });
      expect(rows).toHaveLength(0);
    });

    it("rejects a blank date inline", async () => {
      const opt = await seedOption();
      const result = await createRejection(opt.id, "", null);
      expect(result).toEqual({ ok: false, error: "Pick a valid date" });
    });

    it("stores empty/whitespace reason as null", async () => {
      const opt = await seedOption();
      await createRejection(opt.id, "2024-05-01", "   ");
      const rows = await db.query.rejections.findMany({
        where: eq(rejections.optionId, opt.id),
      });
      expect(rows[0].reason).toBeNull();
    });

    it("surfaces a same-(option, date) collision inline (23505)", async () => {
      const opt = await seedOption();
      const first = await createRejection(opt.id, "2024-04-01", null);
      expect(first).toEqual({ ok: true });
      const collision = await createRejection(opt.id, "2024-04-01", "again");
      expect(collision).toEqual({
        ok: false,
        error: "Already rejected for that date",
      });
    });
  });

  describe("updateRejection", () => {
    it("updates option, date, and reason", async () => {
      const opt = await seedOption();
      const other = await seedOption();
      const [entry] = await db
        .insert(rejections)
        .values({ optionId: opt.id, rejectedOn: "2024-05-01", reason: "x" })
        .returning();
      const result = await updateRejection(entry.id, {
        optionId: other.id,
        rejectedOn: "2024-05-02",
        reason: "y",
      });
      expect(result).toEqual({ ok: true });

      const updated = await db.query.rejections.findFirst({
        where: eq(rejections.id, entry.id),
      });
      expect(updated?.optionId).toBe(other.id);
      expect(updated?.rejectedOn).toBe("2024-05-02");
      expect(updated?.reason).toBe("y");
    });

    it("rejects an invalid date inline", async () => {
      const opt = await seedOption();
      const [entry] = await db
        .insert(rejections)
        .values({ optionId: opt.id, rejectedOn: "2024-05-01" })
        .returning();
      const result = await updateRejection(entry.id, {
        optionId: opt.id,
        rejectedOn: "garbage",
        reason: null,
      });
      expect(result).toEqual({ ok: false, error: "Pick a valid date" });
    });

    it("leaves the row untouched on a 23505 collision", async () => {
      const opt = await seedOption();
      // Two existing Rejections on different dates for the same Option.
      await db
        .insert(rejections)
        .values({ optionId: opt.id, rejectedOn: "2024-06-01" });
      const [moveMe] = await db
        .insert(rejections)
        .values({ optionId: opt.id, rejectedOn: "2024-06-02", reason: "draft" })
        .returning();
      // Try to move the second row onto the first's date → 23505.
      const result = await updateRejection(moveMe.id, {
        optionId: opt.id,
        rejectedOn: "2024-06-01",
        reason: "draft",
      });
      expect(result).toEqual({
        ok: false,
        error: "Already rejected for that date",
      });
      const stillThere = await db.query.rejections.findFirst({
        where: eq(rejections.id, moveMe.id),
      });
      expect(stillThere?.rejectedOn).toBe("2024-06-02");
    });

    it("stores whitespace reason as null on update", async () => {
      const opt = await seedOption();
      const [entry] = await db
        .insert(rejections)
        .values({ optionId: opt.id, rejectedOn: "2024-07-01", reason: "x" })
        .returning();
      const result = await updateRejection(entry.id, {
        optionId: opt.id,
        rejectedOn: "2024-07-01",
        reason: "   ",
      });
      expect(result).toEqual({ ok: true });
      const updated = await db.query.rejections.findFirst({
        where: eq(rejections.id, entry.id),
      });
      expect(updated?.reason).toBeNull();
    });
  });

  describe("deleteRejection", () => {
    it("removes the row and returns void", async () => {
      const opt = await seedOption();
      const [entry] = await db
        .insert(rejections)
        .values({ optionId: opt.id, rejectedOn: "2024-08-01" })
        .returning();
      const result = await deleteRejection(entry.id);
      expect(result).toBeUndefined();
      const remaining = await db.query.rejections.findFirst({
        where: eq(rejections.id, entry.id),
      });
      expect(remaining).toBeUndefined();
    });

    it("doubles as Bring back — removing today's Rejection lets the Option return", async () => {
      const opt = await seedOption();
      const rejected = await rejectOption(opt.id, "tonight no");
      expect(rejected).toEqual({ ok: true });

      const beforeBringBack = await getTodayRejections(today());
      expect(beforeBringBack.some((r) => r.optionId === opt.id)).toBe(true);

      const [row] = await db
        .select({ id: rejections.id })
        .from(rejections)
        .where(eq(rejections.optionId, opt.id));
      await deleteRejection(row.id);

      const afterBringBack = await getTodayRejections(today());
      expect(afterBringBack.some((r) => r.optionId === opt.id)).toBe(false);
    });
  });

  describe("getLogRejections", () => {
    it("returns every Rejection joined to its Option, desc(rejectedOn) then asc(name)", async () => {
      const alpha = await seedOption("home", { name: "alpha" });
      const beta = await seedOption("restaurant", { name: "beta" });
      await db.insert(rejections).values([
        { optionId: alpha.id, rejectedOn: "2024-10-02" },
        { optionId: beta.id, rejectedOn: "2024-10-02" },
        { optionId: alpha.id, rejectedOn: "2024-10-01" },
      ]);

      const rows = await getLogRejections();
      expect(rows.map((r) => [r.optionName, r.rejectedOn])).toEqual([
        ["alpha", "2024-10-02"],
        ["beta", "2024-10-02"],
        ["alpha", "2024-10-01"],
      ]);
      // Carries kind through.
      expect(rows[1].kind).toBe("restaurant");
    });

    it("includes Archived Options' Rejections", async () => {
      const archived = await seedOption("home", {
        name: "zeta",
        active: false,
      });
      await db
        .insert(rejections)
        .values({ optionId: archived.id, rejectedOn: "2024-09-01" });
      const rows = await getLogRejections();
      expect(rows.some((r) => r.optionId === archived.id)).toBe(true);
    });
  });

  describe("getOptionRejections", () => {
    it("scopes to one Option, ordered desc(rejectedOn) then desc(createdAt)", async () => {
      const opt = await seedOption();
      const other = await seedOption();
      await db.insert(rejections).values([
        { optionId: opt.id, rejectedOn: "2024-11-01", reason: "first" },
        { optionId: opt.id, rejectedOn: "2024-11-03", reason: "newest day" },
        { optionId: other.id, rejectedOn: "2024-11-02", reason: "other opt" },
      ]);

      const rows = await getOptionRejections(opt.id);
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.rejectedOn)).toEqual([
        "2024-11-03",
        "2024-11-01",
      ]);
      expect(rows.every((r) => r.optionId === opt.id)).toBe(true);
    });
  });

  describe("getOptionChoices", () => {
    it("returns every Option (Active + Archived), name-ordered", async () => {
      const a = await seedOption("home", { name: "apple" });
      const b = await seedOption("restaurant", {
        name: "banana",
        active: false,
      });
      const c = await seedOption("home", { name: "cherry" });

      const choices = await getOptionChoices();
      const ids = choices.map((c) => c.id);
      expect(ids).toEqual([a.id, b.id, c.id]);
      // Includes the Archived one.
      expect(choices.find((c) => c.id === b.id)?.kind).toBe("restaurant");
    });
  });
});
