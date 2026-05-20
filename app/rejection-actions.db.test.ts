import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { asc, eq } from "drizzle-orm";

/**
 * Integration tests for the rejection-actions module. Modelled on
 * `app/log/actions.db.test.ts`: `next/cache.revalidatePath` is mocked so the
 * action body's revalidation is a no-op in tests, and `lib/require-session`
 * is mocked so the `authedAction` wrapper accepts an unauthenticated test
 * caller (the auth gate is unit-tested separately in
 * `app/rejection-actions.test.ts`).
 *
 * Each test truncates the `rejections` and `options` tables `afterEach` to
 * keep cases isolated against the per-worktree test database.
 */
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/require-session", () => ({
  requireSession: vi.fn(async () => {}),
}));

import {
  createRejection,
  deleteRejection,
  rejectOption,
  updateRejection,
} from "./rejection-actions";
import { getLogRejections, getOptionRejections } from "@/db/queries";
import { options, rejections } from "@/db/schema";
import { today as todaySqlDate } from "@/lib/local-day";

const sql = postgres(process.env.DATABASE_URL ?? "", { max: 1 });
const db = drizzle(sql);

async function makeOption(name: string): Promise<string> {
  const [row] = await db
    .insert(options)
    .values({ name, kind: "home" })
    .returning({ id: options.id });
  return row.id;
}

beforeAll(async () => {
  await db.delete(rejections);
  await db.delete(options);
});

afterEach(async () => {
  await db.delete(rejections);
  await db.delete(options);
});

afterAll(async () => {
  await sql.end();
});

describe("createRejection", () => {
  it("inserts a rejections row for the given Option and date", async () => {
    const optionId = await makeOption("Pasta");

    const result = await createRejection(optionId, "2026-05-19", "too heavy");
    expect(result.ok).toBe(true);

    const rows = await db
      .select()
      .from(rejections)
      .where(eq(rejections.optionId, optionId));
    expect(rows).toHaveLength(1);
    expect(rows[0].rejectedOn).toBe("2026-05-19");
    expect(rows[0].reason).toBe("too heavy");
  });

  it("stores a whitespace-only reason as null", async () => {
    const optionId = await makeOption("Tacos");

    const result = await createRejection(optionId, "2026-05-19", "   ");
    expect(result.ok).toBe(true);

    const [row] = await db
      .select()
      .from(rejections)
      .where(eq(rejections.optionId, optionId));
    expect(row.reason).toBeNull();
  });

  it("rejects a blank date with the inline 'Pick a valid date' error", async () => {
    const optionId = await makeOption("Sushi");

    const result = await createRejection(optionId, "", "");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Pick a valid date");
  });

  it("rejects a malformed date with the inline 'Pick a valid date' error", async () => {
    const optionId = await makeOption("Curry");

    const result = await createRejection(optionId, "not-a-date");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Pick a valid date");
  });

  it("reports a stale Option id with the inline 'no longer available' error", async () => {
    // A well-formed uuid that does not exist in `options` — `23503` FK miss.
    const staleId = "00000000-0000-4000-8000-000000000000";

    const result = await createRejection(staleId, "2026-05-19");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("That option is no longer available");
  });

  it("reports a malformed Option id with the inline 'no longer available' error", async () => {
    const result = await createRejection("not-a-uuid", "2026-05-19");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("That option is no longer available");
  });

  it("returns the inline collision error on a duplicate (option_id, rejected_on), not a throw", async () => {
    const optionId = await makeOption("Ramen");

    const first = await createRejection(optionId, "2026-05-19");
    expect(first.ok).toBe(true);

    const second = await createRejection(optionId, "2026-05-19");
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toBe("Already rejected for that date");

    // The first row is untouched — exactly one Rejection survives.
    const rows = await db
      .select()
      .from(rejections)
      .where(eq(rejections.optionId, optionId));
    expect(rows).toHaveLength(1);
  });
});

describe("updateRejection", () => {
  it("changes the Option, date, and reason", async () => {
    const first = await makeOption("Pasta");
    const second = await makeOption("Pizza");

    const create = await createRejection(first, "2026-05-19", "original");
    expect(create.ok).toBe(true);

    const [row] = await db
      .select()
      .from(rejections)
      .where(eq(rejections.optionId, first));

    const update = await updateRejection(row.id, {
      optionId: second,
      rejectedOn: "2026-05-20",
      reason: "edited",
    });
    expect(update.ok).toBe(true);

    const [updated] = await db
      .select()
      .from(rejections)
      .where(eq(rejections.id, row.id));
    expect(updated.optionId).toBe(second);
    expect(updated.rejectedOn).toBe("2026-05-20");
    expect(updated.reason).toBe("edited");
  });

  it("clears the reason to null when the new reason is whitespace", async () => {
    const optionId = await makeOption("Sushi");

    const create = await createRejection(optionId, "2026-05-19", "some text");
    expect(create.ok).toBe(true);

    const [row] = await db
      .select()
      .from(rejections)
      .where(eq(rejections.optionId, optionId));

    const update = await updateRejection(row.id, {
      optionId,
      rejectedOn: "2026-05-19",
      reason: "   ",
    });
    expect(update.ok).toBe(true);

    const [updated] = await db
      .select()
      .from(rejections)
      .where(eq(rejections.id, row.id));
    expect(updated.reason).toBeNull();
  });

  it("rejects a blank date with the inline 'Pick a valid date' error", async () => {
    const optionId = await makeOption("Tacos");
    const create = await createRejection(optionId, "2026-05-19");
    expect(create.ok).toBe(true);
    const [row] = await db
      .select()
      .from(rejections)
      .where(eq(rejections.optionId, optionId));

    const update = await updateRejection(row.id, {
      optionId,
      rejectedOn: "",
      reason: "",
    });
    expect(update.ok).toBe(false);
    if (update.ok) return;
    expect(update.error).toBe("Pick a valid date");
  });

  it("returns the inline collision error on a duplicate (option_id, rejected_on) and leaves the row untouched", async () => {
    const optionId = await makeOption("Ramen");

    const a = await createRejection(optionId, "2026-05-19", "a");
    expect(a.ok).toBe(true);
    const b = await createRejection(optionId, "2026-05-20", "b");
    expect(b.ok).toBe(true);

    const rows = await db
      .select()
      .from(rejections)
      .where(eq(rejections.optionId, optionId))
      .orderBy(asc(rejections.rejectedOn));
    expect(rows).toHaveLength(2);
    const target = rows.find((r) => r.rejectedOn === "2026-05-20");
    expect(target).toBeDefined();
    if (!target) return;
    const originalReason = target.reason;

    // Move 5/20 onto 5/19 — collision on the unique constraint.
    const update = await updateRejection(target.id, {
      optionId,
      rejectedOn: "2026-05-19",
      reason: "edited",
    });
    expect(update.ok).toBe(false);
    if (update.ok) return;
    expect(update.error).toBe("Already rejected for that date");

    // The target row is untouched — its date and reason are unchanged.
    const [reloaded] = await db
      .select()
      .from(rejections)
      .where(eq(rejections.id, target.id));
    expect(reloaded.rejectedOn).toBe("2026-05-20");
    expect(reloaded.reason).toBe(originalReason);
  });
});

describe("deleteRejection", () => {
  it("removes the rejections row entirely", async () => {
    const optionId = await makeOption("Pasta");

    const create = await createRejection(optionId, "2026-05-19");
    expect(create.ok).toBe(true);

    const [row] = await db
      .select()
      .from(rejections)
      .where(eq(rejections.optionId, optionId));

    const result = await deleteRejection(row.id);
    expect(result.ok).toBe(true);

    const remaining = await db
      .select()
      .from(rejections)
      .where(eq(rejections.id, row.id));
    expect(remaining).toHaveLength(0);
  });

  it("is a no-op when no row matches the id", async () => {
    // A well-formed uuid that matches no row.
    const result = await deleteRejection("00000000-0000-4000-8000-000000000000");
    expect(result.ok).toBe(true);
  });
});

describe("rejectOption", () => {
  it("dates the Rejection to the Household's today()", async () => {
    const optionId = await makeOption("Pasta");

    const result = await rejectOption(optionId, "not in the mood");
    expect(result.ok).toBe(true);

    const [row] = await db
      .select()
      .from(rejections)
      .where(eq(rejections.optionId, optionId));
    expect(row.rejectedOn).toBe(todaySqlDate());
    expect(row.reason).toBe("not in the mood");
  });

  it("returns the inline collision error on an already-rejected-today double-tap", async () => {
    const optionId = await makeOption("Tacos");

    const first = await rejectOption(optionId);
    expect(first.ok).toBe(true);

    const second = await rejectOption(optionId);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toBe("Already rejected for that date");

    // Exactly one row survives.
    const rows = await db
      .select()
      .from(rejections)
      .where(eq(rejections.optionId, optionId));
    expect(rows).toHaveLength(1);
  });
});

describe("getLogRejections", () => {
  it("returns every Rejection joined to its Option, newest date first, then alphabetical by Option name", async () => {
    const pasta = await makeOption("Pasta");
    const sushi = await makeOption("Sushi");
    const tacos = await makeOption("Tacos");

    // 5/18: Tacos. 5/19: Pasta, Sushi. 5/20: Pasta.
    await createRejection(tacos, "2026-05-18");
    await createRejection(sushi, "2026-05-19");
    await createRejection(pasta, "2026-05-19");
    await createRejection(pasta, "2026-05-20");

    const rows = await getLogRejections();
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => [r.rejectedOn, r.optionName])).toEqual([
      ["2026-05-20", "Pasta"],
      ["2026-05-19", "Pasta"],
      ["2026-05-19", "Sushi"],
      ["2026-05-18", "Tacos"],
    ]);
  });

  it("includes Rejections of Archived Options (not filtered to active)", async () => {
    const optionId = await makeOption("Pasta");
    await createRejection(optionId, "2026-05-19");
    await db
      .update(options)
      .set({ active: false })
      .where(eq(options.id, optionId));

    const rows = await getLogRejections();
    expect(rows).toHaveLength(1);
    expect(rows[0].optionName).toBe("Pasta");
  });
});

describe("getOptionRejections", () => {
  it("returns every Rejection for one Option, newest date first", async () => {
    const optionId = await makeOption("Pasta");
    const otherId = await makeOption("Tacos");

    await createRejection(optionId, "2026-05-18", "a");
    await createRejection(optionId, "2026-05-20", "c");
    await createRejection(optionId, "2026-05-19", "b");
    await createRejection(otherId, "2026-05-19", "other");

    const rows = await getOptionRejections(optionId);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.rejectedOn)).toEqual([
      "2026-05-20",
      "2026-05-19",
      "2026-05-18",
    ]);
    expect(rows.every((r) => r.optionId === optionId)).toBe(true);
  });

  it("returns an empty array for a malformed Option id", async () => {
    const rows = await getOptionRejections("not-a-uuid");
    expect(rows).toEqual([]);
  });
});
