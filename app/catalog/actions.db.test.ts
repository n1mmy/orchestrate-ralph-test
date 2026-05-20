/**
 * Database-backed integration tests for the Catalog server actions.
 *
 * Runs under the `*.db.test.ts` config (`vitest.config.db.ts`), which
 * provisions a per-worktree Postgres database and applies the Drizzle
 * migrations before the suite starts. Each test seeds the rows it needs and
 * does not assume an empty database — they only assert on the rows they
 * inserted.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  archiveOption,
  createOption,
  deleteOption,
  updateOption,
} from "./actions";
import { db, queryClient } from "@/db";
import { dinnerLog, optionTags, options, tags } from "@/db/schema";

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
        tags: [],
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
        tags: [],
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

  describe("tag attach", () => {
    async function findTagId(name: string): Promise<string | undefined> {
      const [row] = await db
        .select({ id: tags.id })
        .from(tags)
        .where(sql`lower(${tags.name}) = ${name}`)
        .limit(1);
      return row?.id;
    }

    it("normalizes + dedupes the Tag set on createOption", async () => {
      const name = `pasta-${crypto.randomUUID()}`;
      const result = await createOption("home", {
        name,
        url: null,
        notes: null,
        address: null,
        phone: null,
        mapsUrl: null,
        lat: null,
        lng: null,
        googlePlaceId: null,
        tags: ["  Pasta  ", "pasta", "PASTA", "Fish"],
      });
      expect(result).toEqual({ ok: true });

      const opt = await db.query.options.findFirst({
        where: eq(options.name, name),
      });
      expect(opt).toBeDefined();

      const rows = await db
        .select({ name: tags.name })
        .from(optionTags)
        .innerJoin(tags, eq(optionTags.tagId, tags.id))
        .where(eq(optionTags.optionId, opt!.id));
      const attached = new Set(rows.map((r) => r.name));
      expect(attached.size).toBe(2);
      const lower = new Set([...attached].map((n) => n.toLowerCase()));
      expect(lower).toEqual(new Set(["pasta", "fish"]));
    });

    it("reuses an existing Tag for a case-insensitive match — no duplicate row", async () => {
      // Seed an existing "pasta" tag.
      const seedName = `pasta-${crypto.randomUUID()}`;
      await db.insert(tags).values({ name: seedName });
      const seededId = await findTagId(seedName);
      expect(seededId).toBeDefined();

      // Create an Option that adds the same tag in mixed case.
      const optName = `opt-${crypto.randomUUID()}`;
      const result = await createOption("home", {
        name: optName,
        url: null,
        notes: null,
        address: null,
        phone: null,
        mapsUrl: null,
        lat: null,
        lng: null,
        googlePlaceId: null,
        tags: [seedName.toUpperCase()],
      });
      expect(result).toEqual({ ok: true });

      const reusedId = await findTagId(seedName);
      expect(reusedId).toBe(seededId);

      // Only one tags row for this name (case-insensitive count).
      const count = await db
        .select({ id: tags.id })
        .from(tags)
        .where(sql`lower(${tags.name}) = ${seedName.toLowerCase()}`);
      expect(count).toHaveLength(1);
    });

    it("syncOptionTags replaces the Tag set on updateOption", async () => {
      const optName = `opt-${crypto.randomUUID()}`;
      await createOption("home", {
        name: optName,
        url: null,
        notes: null,
        address: null,
        phone: null,
        mapsUrl: null,
        lat: null,
        lng: null,
        googlePlaceId: null,
        tags: ["alpha", "beta"],
      });
      const opt = await db.query.options.findFirst({
        where: eq(options.name, optName),
      });
      expect(opt).toBeDefined();

      const updateResult = await updateOption(opt!.id, "home", {
        name: optName,
        url: null,
        notes: null,
        address: null,
        phone: null,
        mapsUrl: null,
        lat: null,
        lng: null,
        googlePlaceId: null,
        tags: ["beta", "gamma"],
      });
      expect(updateResult).toEqual({ ok: true });

      const rows = await db
        .select({ name: tags.name })
        .from(optionTags)
        .innerJoin(tags, eq(optionTags.tagId, tags.id))
        .where(eq(optionTags.optionId, opt!.id));
      const attached = new Set(rows.map((r) => r.name.toLowerCase()));
      expect(attached).toEqual(new Set(["beta", "gamma"]));
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
