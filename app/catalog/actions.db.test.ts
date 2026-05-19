import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";

// `next/cache.revalidatePath` only runs inside a Next request — mock it so
// the action body's `revalidatePath("/catalog")` call is a no-op in tests.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// The actions file imports `@/db` — which builds a `postgres-js` client off
// `process.env.DATABASE_URL`. The DB suite's `global-setup` rewrites that
// env var to the per-worktree test database before the file imports run, so
// the action's client and this test's client target the same database.
import {
  archiveOption,
  createOption,
  deleteOption,
} from "./actions";
import { dinnerLog, options } from "@/db/schema";

const sql = postgres(process.env.DATABASE_URL ?? "", { max: 1 });
const db = drizzle(sql);

beforeAll(async () => {
  await db.delete(dinnerLog);
  await db.delete(options);
});

afterEach(async () => {
  await db.delete(dinnerLog);
  await db.delete(options);
});

afterAll(async () => {
  await sql.end();
});

describe("Catalog server actions", () => {
  it("archive sets active = false", async () => {
    const create = await createOption("home", { name: "Pasta" });
    expect(create.ok).toBe(true);
    if (!create.ok) return;

    const archive = await archiveOption(create.value.id);
    expect(archive.ok).toBe(true);

    const [row] = await db
      .select()
      .from(options)
      .where(eq(options.id, create.value.id));
    expect(row.active).toBe(false);
  });

  it("hard-deletes an Option with no Log entries", async () => {
    const create = await createOption("restaurant", { name: "Sushi" });
    expect(create.ok).toBe(true);
    if (!create.ok) return;

    const del = await deleteOption(create.value.id);
    expect(del.ok).toBe(true);

    const remaining = await db
      .select()
      .from(options)
      .where(eq(options.id, create.value.id));
    expect(remaining).toHaveLength(0);
  });

  it("blocks hard-delete of an Option with Log history and returns the friendly message", async () => {
    const create = await createOption("home", { name: "Tacos" });
    expect(create.ok).toBe(true);
    if (!create.ok) return;

    await db
      .insert(dinnerLog)
      .values({ optionId: create.value.id, eatenOn: "2026-05-19" });

    const del = await deleteOption(create.value.id);
    expect(del.ok).toBe(false);
    if (del.ok) return;
    expect(del.error).toBe("In your log — archive instead");

    // The Option must still exist — the constraint blocked the delete.
    const remaining = await db
      .select()
      .from(options)
      .where(eq(options.id, create.value.id));
    expect(remaining).toHaveLength(1);
  });

  it("rejects a blank name with 'Enter a name'", async () => {
    const result = await createOption("home", { name: "   " });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Enter a name");
  });
});
