/**
 * Database-backed integration tests for the Catalog server actions.
 *
 * Runs under the `*.db.test.ts` config (`vitest.config.db.ts`), which
 * provisions a per-worktree Postgres database and applies the Drizzle
 * migrations before the suite starts. Each test seeds the rows it needs and
 * does not assume an empty database — they only assert on the rows they
 * inserted.
 */
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  archiveOption,
  createOption,
  deleteOption,
} from "./actions";
import { db, queryClient } from "@/db";
import { dinnerLog, options } from "@/db/schema";

async function createSeedOption(kind: "home" | "restaurant" = "home") {
  const [row] = await db
    .insert(options)
    .values({ name: `seed-${crypto.randomUUID()}`, kind })
    .returning();
  return row;
}

describe("catalog server actions", () => {
  afterAll(async () => {
    // Close the lazy `postgres` socket so vitest exits cleanly.
    await queryClient.end({ timeout: 5 });
  });

  describe("createOption", () => {
    it("rejects a blank name with the inline error", async () => {
      const result = await createOption("home", {
        name: "   ",
        url: null,
        notes: null,
        address: null,
        phone: null,
        mapsUrl: null,
        lat: null,
        lng: null,
        googlePlaceId: null,
      });
      expect(result).toEqual({ ok: false, error: "Enter a name" });
    });

    it("inserts an active Option with the given name and kind", async () => {
      const name = `pasta-${crypto.randomUUID()}`;
      const result = await createOption("home", {
        name,
        url: null,
        notes: "with greens",
        address: null,
        phone: null,
        mapsUrl: null,
        lat: null,
        lng: null,
        googlePlaceId: null,
      });
      expect(result).toEqual({ ok: true });
      const row = await db.query.options.findFirst({
        where: eq(options.name, name),
      });
      expect(row?.kind).toBe("home");
      expect(row?.active).toBe(true);
      expect(row?.notes).toBe("with greens");
    });
  });

  describe("archiveOption", () => {
    it("sets active = false; Log history untouched", async () => {
      const opt = await createSeedOption();
      await db.insert(dinnerLog).values({
        optionId: opt.id,
        eatenOn: "2026-01-01",
      });

      const result = await archiveOption(opt.id);
      expect(result).toEqual({ ok: true });

      const updated = await db.query.options.findFirst({
        where: eq(options.id, opt.id),
      });
      expect(updated?.active).toBe(false);

      const logs = await db.query.dinnerLog.findMany({
        where: eq(dinnerLog.optionId, opt.id),
      });
      expect(logs).toHaveLength(1);
    });
  });

  describe("deleteOption", () => {
    it("hard-deletes an Option with zero Log entries", async () => {
      const opt = await createSeedOption();
      const result = await deleteOption(opt.id);
      expect(result).toEqual({ ok: true });
      const remaining = await db.query.options.findFirst({
        where: eq(options.id, opt.id),
      });
      expect(remaining).toBeUndefined();
    });

    it("blocks delete of a logged Option with the friendly inline message", async () => {
      const opt = await createSeedOption();
      await db.insert(dinnerLog).values({
        optionId: opt.id,
        eatenOn: "2026-02-02",
      });

      const result = await deleteOption(opt.id);
      expect(result).toEqual({
        ok: false,
        error: "In your log — archive instead",
      });

      const remaining = await db.query.options.findFirst({
        where: eq(options.id, opt.id),
      });
      expect(remaining?.id).toBe(opt.id);
    });
  });

});
