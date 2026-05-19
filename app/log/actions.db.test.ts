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
import { eq } from "drizzle-orm";

// `next/cache.revalidatePath` only runs inside a Next request — mock it so
// the action body's `revalidatePath(...)` calls are no-ops in tests.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  deleteLogEntry,
  logForDate,
  pickTonight,
  updateLogEntry,
} from "./actions";
import { dinnerLog, options } from "@/db/schema";
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

describe("Log server actions", () => {
  it("pickTonight inserts a dinner_log row for today", async () => {
    const optionId = await makeOption("Pasta");

    const result = await pickTonight(optionId);
    expect(result.ok).toBe(true);

    const rows = await db
      .select()
      .from(dinnerLog)
      .where(eq(dinnerLog.optionId, optionId));
    expect(rows).toHaveLength(1);
    expect(rows[0].eatenOn).toBe(todaySqlDate());
  });

  it("a double-tap on pickTonight is a no-op (onConflictDoNothing on (option_id, eaten_on))", async () => {
    const optionId = await makeOption("Tacos");

    const first = await pickTonight(optionId);
    expect(first.ok).toBe(true);
    const second = await pickTonight(optionId);
    expect(second.ok).toBe(true);

    const rows = await db
      .select()
      .from(dinnerLog)
      .where(eq(dinnerLog.optionId, optionId));
    expect(rows).toHaveLength(1);
  });

  it("logForDate accepts a past date (backfill) and a future date (Planned dinner)", async () => {
    const optionId = await makeOption("Sushi");

    const past = await logForDate(optionId, "2026-01-15", "back from trip");
    expect(past.ok).toBe(true);
    const future = await logForDate(optionId, "2099-12-31");
    expect(future.ok).toBe(true);

    const rows = await db
      .select()
      .from(dinnerLog)
      .where(eq(dinnerLog.optionId, optionId));
    expect(rows.map((r) => r.eatenOn).sort()).toEqual([
      "2026-01-15",
      "2099-12-31",
    ]);
    const past_row = rows.find((r) => r.eatenOn === "2026-01-15");
    expect(past_row?.note).toBe("back from trip");
  });

  it("logForDate rejects a (option_id, eaten_on) collision with the inline 'Already logged for that date' error", async () => {
    const optionId = await makeOption("Curry");

    const first = await logForDate(optionId, "2026-05-19");
    expect(first.ok).toBe(true);

    const second = await logForDate(optionId, "2026-05-19");
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toBe("Already logged for that date");
  });

  it("logForDate rejects an invalid SQL date", async () => {
    const optionId = await makeOption("Salad");
    const result = await logForDate(optionId, "not-a-date");
    expect(result.ok).toBe(false);
  });

  it("updateLogEntry changes the Option, date, and note", async () => {
    const first = await makeOption("Pasta");
    const second = await makeOption("Pizza");

    const create = await logForDate(first, "2026-05-19", "original note");
    expect(create.ok).toBe(true);

    const [row] = await db
      .select()
      .from(dinnerLog)
      .where(eq(dinnerLog.optionId, first));

    const update = await updateLogEntry(row.id, {
      optionId: second,
      eatenOn: "2026-05-20",
      note: "edited",
    });
    expect(update.ok).toBe(true);

    const [updated] = await db
      .select()
      .from(dinnerLog)
      .where(eq(dinnerLog.id, row.id));
    expect(updated.optionId).toBe(second);
    expect(updated.eatenOn).toBe("2026-05-20");
    expect(updated.note).toBe("edited");
  });

  it("updateLogEntry rejects a (option_id, eaten_on) collision with the inline error", async () => {
    const optionId = await makeOption("Ramen");

    const a = await logForDate(optionId, "2026-05-19");
    expect(a.ok).toBe(true);
    const b = await logForDate(optionId, "2026-05-20");
    expect(b.ok).toBe(true);

    const rows = await db
      .select()
      .from(dinnerLog)
      .where(eq(dinnerLog.optionId, optionId));
    const target = rows.find((r) => r.eatenOn === "2026-05-20");
    expect(target).toBeDefined();
    if (!target) return;

    // Move 5/20 onto 5/19 — collision on the unique constraint.
    const update = await updateLogEntry(target.id, {
      optionId,
      eatenOn: "2026-05-19",
    });
    expect(update.ok).toBe(false);
    if (update.ok) return;
    expect(update.error).toBe("Already logged for that date");
  });

  it("deleteLogEntry removes the row", async () => {
    const optionId = await makeOption("Tacos");
    const create = await logForDate(optionId, "2026-05-19");
    expect(create.ok).toBe(true);

    const [row] = await db
      .select()
      .from(dinnerLog)
      .where(eq(dinnerLog.optionId, optionId));

    const result = await deleteLogEntry(row.id);
    expect(result.ok).toBe(true);

    const remaining = await db
      .select()
      .from(dinnerLog)
      .where(eq(dinnerLog.id, row.id));
    expect(remaining).toHaveLength(0);
  });
});
