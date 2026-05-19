import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { dinnerLog, optionTags, options, tags } from "./schema";

/**
 * Database integration suite for the v1 schema. Runs against the per-worktree
 * test database that `db/test/global-setup.ts` creates and migrates, proving
 * the generated migration applies and the declared constraints hold.
 */
const sql = postgres(process.env.DATABASE_URL ?? "", { max: 1 });
const db = drizzle(sql);

afterAll(async () => {
  await sql.end();
});

describe("v1 schema", () => {
  it("inserts an Option and round-trips it", async () => {
    const [row] = await db
      .insert(options)
      .values({ name: "Pasta", kind: "home" })
      .returning();
    expect(row.kind).toBe("home");
    expect(row.active).toBe(true);
    await db.delete(options).where(eq(options.id, row.id));
  });

  it("enforces case-insensitive uniqueness on tag names", async () => {
    const [tag] = await db
      .insert(tags)
      .values({ name: "Fish" })
      .returning();
    await expect(
      db.insert(tags).values({ name: "fish" }),
    ).rejects.toThrow();
    await db.delete(tags).where(eq(tags.id, tag.id));
  });

  it("cascades option_tags rows when an Option is deleted", async () => {
    const [opt] = await db
      .insert(options)
      .values({ name: "Sushi", kind: "restaurant" })
      .returning();
    const [tag] = await db
      .insert(tags)
      .values({ name: "japanese" })
      .returning();
    await db
      .insert(optionTags)
      .values({ optionId: opt.id, tagId: tag.id });
    await db.delete(options).where(eq(options.id, opt.id));
    const remaining = await db
      .select()
      .from(optionTags)
      .where(eq(optionTags.tagId, tag.id));
    expect(remaining).toHaveLength(0);
    await db.delete(tags).where(eq(tags.id, tag.id));
  });

  it("restricts deletion of an Option with Log history", async () => {
    const [opt] = await db
      .insert(options)
      .values({ name: "Tacos", kind: "home" })
      .returning();
    const [log] = await db
      .insert(dinnerLog)
      .values({ optionId: opt.id, eatenOn: "2026-05-19" })
      .returning();
    await expect(
      db.delete(options).where(eq(options.id, opt.id)),
    ).rejects.toThrow();
    await db.delete(dinnerLog).where(eq(dinnerLog.id, log.id));
    await db.delete(options).where(eq(options.id, opt.id));
  });

  it("enforces unique (option_id, eaten_on) on the Log", async () => {
    const [opt] = await db
      .insert(options)
      .values({ name: "Ramen", kind: "restaurant" })
      .returning();
    await db
      .insert(dinnerLog)
      .values({ optionId: opt.id, eatenOn: "2026-05-19" });
    await expect(
      db
        .insert(dinnerLog)
        .values({ optionId: opt.id, eatenOn: "2026-05-19" }),
    ).rejects.toThrow();
    await db.delete(dinnerLog).where(eq(dinnerLog.optionId, opt.id));
    await db.delete(options).where(eq(options.id, opt.id));
  });
});
